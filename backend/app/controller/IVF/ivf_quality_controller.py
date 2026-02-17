"""
IVF Quality Monitoring Controller
Handles WebSocket and REST endpoints for real-time IVF canister quality monitoring
Separate from CGT quality monitoring to maintain isolation
"""
import asyncio
import json
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, Depends
from typing import Optional
from sqlalchemy.orm import Session

from app.service.redis_service import get_redis
from app.service.quality_service import QualityService
from app.service.IVF.quality_tracking_service import QualityTrackingService
from app.auth.auth import verify_websocket_token
from app.utils.websocket_manager import ConnectionManager
from app.config.database import get_db, SessionLocal
from app.models.user_model import User
from app.models.IVF.tank_model import Tank
from app.models.IVF.patient_crylock_info_model import PatientCrylockInfo
from app.utils.user_helpers import is_specific_department
from app.exceptions import InvalidTokenException

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ivf/quality", tags=["IVF Quality Monitoring"])

# Import shared connection manager from CGT quality controller
from app.controller import quality_controller

# Use the same connection manager instance as CGT for shared Redis listener
manager = quality_controller.manager

@router.websocket("/ws")
async def ivf_websocket_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for real-time IVF canister quality monitoring
    
    Requires authentication token in query parameter: ?token=<jwt_token>
    Only accessible to users with IVF department
    """
    connection_id = None
    
    try:
        # Accept connection first
        await websocket.accept()
        logger.info(f"IVF WebSocket connection accepted from {websocket.client.host if websocket.client else 'unknown'}")
        
        # Authenticate user - Get token from query parameter
        query_params = dict(websocket.query_params)
        token = query_params.get("token")
        logger.info(f"Token from query params: {'present' if token else 'missing'}")
        
        # Get branch_id_override from query parameters (optional, only for Managers)
        branch_id_override = None
        branch_id_override_str = query_params.get("branch_id_override")
        if branch_id_override_str:
            try:
                branch_id_override = int(branch_id_override_str)
                logger.info(f"branch_id_override provided: {branch_id_override}")
            except (ValueError, TypeError):
                logger.warning(f"Invalid branch_id_override value: {branch_id_override_str}, ignoring")
        
        if not token:
            logger.warning("IVF WebSocket connection rejected: No token provided")
            await websocket.close(code=1008, reason="Authentication required: No token provided")
            return
        
        # Verify token using auth function
        try:
            auth_info = verify_websocket_token(token)
            user_id = auth_info["user_id"]
            pharma_id = auth_info.get("pharma_id")  # May be None for IVF users
            logger.debug(f"Token verified: user_id={user_id}, pharma_id={pharma_id}")
        except InvalidTokenException as e:
            logger.warning(f"IVF WebSocket connection rejected: Invalid token - {str(e)}")
            await websocket.close(code=1008, reason=f"Invalid token: {str(e)}")
            return
        except Exception as e:
            logger.error(f"IVF WebSocket token verification error: {type(e).__name__}: {str(e)}")
            await websocket.close(code=1008, reason=f"Token verification failed: {str(e)}")
            return
        
        # Get user from database to verify department and get branch_id/role
        db_temp = SessionLocal()
        try:
            user = db_temp.query(User).filter(User.user_id == user_id).first()
            if not user:
                logger.warning(f"User {user_id} not found in database")
                await websocket.close(code=1008, reason="User not found")
                return
            
            # Verify user is from IVF department
            if not is_specific_department(user.department, "IVF"):
                logger.warning(f"User {user_id} is not from IVF department (department: {user.department})")
                await websocket.close(code=1008, reason="Access denied: This endpoint is for IVF users only")
                return
            
            role = user.role.value if hasattr(user.role, 'value') else str(user.role)
            role_normalized = role  # Already in correct format from enum
            department = user.department
            
            # Determine branch_id based on role and override
            # Managers can override, Users cannot override (always use their branch)
            if role_normalized == "Manager":
                if branch_id_override is not None:
                    branch_id = branch_id_override
                    logger.info(f"Manager using branch_id_override: {branch_id}")
                else:
                    branch_id = user.branch_id  # Manager without override uses their own branch_id
                    logger.info(f"Manager using default branch_id: {branch_id}")
            elif role_normalized == "Admin":
                branch_id = None  # Admin sees all branches (ignore override)
            else:
                # User role: always use their branch (ignore override)
                branch_id = user.branch_id
                if branch_id_override is not None:
                    logger.warning(f"User role cannot override branch_id, ignoring override: {branch_id_override}")
            
            logger.info(f"IVF user authenticated: user={user_id}, department={department}, branch={branch_id}, role={role_normalized}, override={branch_id_override}")
        finally:
            db_temp.close()
        
        # Store connection info in connection manager for filtering
        connection_id = await manager.connect(websocket)
        manager.active_connections[connection_id]["pharma_id"] = pharma_id
        manager.active_connections[connection_id]["user_id"] = user_id
        manager.active_connections[connection_id]["branch_id"] = branch_id
        manager.active_connections[connection_id]["role"] = role_normalized
        manager.active_connections[connection_id]["department"] = department
        
        logger.info(f"IVF WebSocket authenticated: user={user_id}, branch={branch_id}, role={role_normalized}, connection={connection_id}")
        
    except Exception as e:
        logger.error(f"IVF WebSocket authentication error: {type(e).__name__}: {str(e)}", exc_info=True)
        try:
            if connection_id:
                manager.disconnect(connection_id)
            await websocket.close(code=1011, reason=f"Internal server error: {str(e)}")
        except:
            pass
        return
    
    try:
        # Create database session for validation
        db = SessionLocal()
        
        try:
            quality_service = QualityService(db)
            quality_tracking_service = QualityTrackingService(db)
            
            while True:
                try:
                    # Wait for messages with timeout to avoid blocking
                    data = await asyncio.wait_for(websocket.receive_text(), timeout=1.0)
                    try:
                        # Try to parse as JSON
                        message = json.loads(data)
                        
                        # Handle IVF tank subscription - accept tank_code (e.g., "T1", "T2")
                        # Optional branch_id in message is Manager-only for branch+tank disambiguation.
                        if "tank_code" not in message or not message["tank_code"]:
                            await websocket.send_json({
                                "type": "error",
                                "message": "Subscription message must contain 'tank_code'"
                            })
                            continue
                        
                        tank_code = message["tank_code"]
                        selected_branch_id = message.get("branch_id")
                        logger.info(f"Received tank_code: {tank_code}")
                        
                        # Parse optional branch selection from the message.
                        if selected_branch_id is not None:
                            try:
                                selected_branch_id = int(selected_branch_id)
                            except (TypeError, ValueError):
                                await websocket.send_json({
                                    "type": "error",
                                    "message": "Invalid 'branch_id' in subscription message"
                                })
                                continue
                        
                        # Resolve tank_code to tank_id
                        try:
                            # Convert tank_code to string
                            tank_code_str = str(tank_code).strip()
                            
                            # Determine effective branch for this subscription.
                            # - User: always constrained to their authorized branch.
                            # - Manager: can optionally scope by selected branch from message.
                            # - Admin: message branch selection is ignored.
                            effective_branch_id = branch_id
                            if role_normalized == "Manager" and selected_branch_id is not None:
                                effective_branch_id = selected_branch_id
                            
                            # Find tank by tank_code and effective branch when available.
                            if effective_branch_id is not None:
                                tank = db.query(Tank).filter(
                                    Tank.tank_code == tank_code_str,
                                    Tank.branch_id == effective_branch_id
                                ).first()
                            else:
                                # Admin without branch selection can access any tank.
                                # If the same tank_code exists in multiple branches, force explicit branch selection.
                                matching_tanks = db.query(Tank).filter(
                                    Tank.tank_code == tank_code_str
                                ).all()
                                if len(matching_tanks) > 1:
                                    raise Exception(
                                        f"Multiple branches have tank code '{tank_code}'. Please send 'branch_id' in subscription message."
                                    )
                                tank = matching_tanks[0] if matching_tanks else None
                            
                            if not tank:
                                branch_hint = effective_branch_id if effective_branch_id is not None else branch_id
                                raise Exception(f"Tank with code '{tank_code}' not found" + (f" in branch {branch_hint}" if branch_hint is not None else ""))
                            
                            tank_id = tank.tank_id
                            
                            logger.info(f"Resolved tank_code {tank_code} to tank_id {tank_id}")
                        except Exception as e:
                            await websocket.send_json({
                                "type": "error",
                                "message": f"Invalid tank code: {str(e)}"
                            })
                            continue
                        
                        # Validate tank belongs to user's branch (if user is not admin)
                        try:
                            # Admin users (branch_id is None) can access all tanks.
                            # User/Manager users must match the effective branch used for this subscription.
                            if role_normalized != "Admin" and effective_branch_id is not None:
                                quality_service.validate_tank_belongs_to_branch(tank_id, effective_branch_id)
                            
                            # Keep branch scoping aligned with the subscribed tank so websocket broadcast
                            # filtering sends data for the selected branch+tank combination.
                            manager.active_connections[connection_id]["branch_id"] = (
                                None if role_normalized == "Admin" else tank.branch_id
                            )
                            
                            # Client is subscribing to a tank (IVF) - track by tank_code
                            # Store tank_code as string
                            tank_code_for_sub = str(tank_code)
                            
                            # Store subscription using tank_code (primary identifier)
                            manager.set_tank_subscription(connection_id, tank_id, tank_code_for_sub)
                            
                            # Get last 12 IVF quality logs from Redis for this tank
                            ivf_history = quality_service.get_tank_redis_history(tank_id, limit=12)
                            
                            # Get IVF geolocation records from database (using tank_id)
                            ivf_geolocation_history = quality_service.get_tank_geolocation_history(tank_id, limit=100)
                            
                            # Send IVF geolocation history as a single array message
                            if ivf_geolocation_history:
                                await websocket.send_json({
                                    "type": "ivf_geolocation_history",
                                    "tank_id": tank_id,
                                    "tank_code": tank_code,  # Include tank_code in response
                                    "geolocations": ivf_geolocation_history,
                                    "count": len(ivf_geolocation_history)
                                })
                            
                            # Send IVF quality history messages (oldest first, ascending order)
                            for historical_data in ivf_history:
                                await websocket.send_json(historical_data)
                            
                            # Send confirmation after history
                            await websocket.send_json({
                                "type": "subscription_confirmed",
                                "tank_id": tank_id,
                                "tank_code": tank_code,  # Include tank_code in response
                                "branch_id": tank.branch_id,
                                "device_data": {
                                    "tive_device_id": tank.tive_device_id,
                                    "tank_id_arc": tank.tank_id_arc
                                },
                                "history_count": len(ivf_history),
                                "geolocation_count": len(ivf_geolocation_history)
                            })
                        except Exception as e:
                            await websocket.send_json({
                                "type": "error",
                                "message": f"Invalid tank: {str(e)}"
                            })
                    except json.JSONDecodeError:
                        # Not JSON, ignore
                        pass
                except asyncio.TimeoutError:
                    # No message received, continue to keep connection alive
                    continue
        finally:
            db.close()
    except WebSocketDisconnect:
        manager.disconnect_by_websocket(websocket)
        logger.info(f"IVF WebSocket disconnected: {connection_id}")
    except Exception as e:
        logger.error(f"IVF WebSocket error: {e}")
        manager.disconnect_by_websocket(websocket)
