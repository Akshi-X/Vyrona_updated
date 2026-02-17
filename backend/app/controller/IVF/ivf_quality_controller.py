"""
IVF Quality Monitoring Controller
Handles WebSocket and REST endpoints for real-time IVF canister quality monitoring
Separate from CGT quality monitoring to maintain isolation
"""
import asyncio
import json
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, Depends, HTTPException, Request, Path
from typing import Optional, List
from sqlalchemy.orm import Session

from app.service.redis_service import get_redis, get_ln2_pubsub
from app.service.quality_service import QualityService
from app.service.IVF.quality_tracking_service import QualityTrackingService
from app.auth.auth import verify_websocket_token
from app.utils.websocket_manager import ConnectionManager
from app.config.database import get_db, SessionLocal
from app.service.quality_service import push_ivf_quality_to_redis
from app.models.user_model import User
from app.models.IVF.tank_model import Tank
from app.models.IVF.ln2_iot_raw_data_model import Ln2IotRawData
from app.models.IVF.ln2_readings_model import Ln2Reading
from app.models.IVF.ln2_iot_device_model import Ln2IotDevice
from app.models.IVF.device_model import Device
from app.utils.user_helpers import is_hospital_department
from app.utils.ivf_helpers import get_branch_filter_info
from app.dependencies.auth_dependencies import get_current_user
from app.exceptions import InvalidTokenException

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ivf/quality", tags=["IVF Quality Monitoring"])

# Import shared connection manager from CGT quality controller
from app.controller import quality_controller

# Use the same connection manager instance as CGT for shared Redis listener
manager = quality_controller.manager

# Separate connection manager for LN2 readings WebSocket (do not disturb legacy quality/ws)
ln2_manager = ConnectionManager()


@router.get("/tanks/{tank_code}/history")
def get_quality_history(
    tank_code: str = Path(..., description="Tank code (e.g., T30)"),
    limit: int = Query(30, ge=1, le=100),
    request: Request = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get quality tracking history for a tank. Used for initial UI load before WebSocket connects.
    Returns data from Redis or ln2_iot_raw_data fallback.
    """
    branch_id, role = get_branch_filter_info(request) if request else (None, None)

    tank_code_str = str(tank_code).strip()
    query = db.query(Tank).filter(Tank.tank_code == tank_code_str)
    if role != "Admin" and branch_id is not None:
        query = query.filter(Tank.branch_id == branch_id)
    tank = query.first()

    if not tank:
        raise HTTPException(status_code=404, detail=f"Tank '{tank_code}' not found")

    tank_id = tank.tank_id
    quality_service = QualityService(db)
    try:
        quality_service.validate_tank_belongs_to_branch(tank_id, branch_id)
    except Exception as e:
        raise HTTPException(status_code=403, detail=str(e))

    history = quality_service.get_tank_redis_history(tank_id, limit=limit)

    if not history:
        raw_records = (
            db.query(Ln2IotRawData)
            .filter(Ln2IotRawData.tank_id == tank_id)
            .order_by(Ln2IotRawData.created_at.desc())
            .limit(limit)
            .all()
        )
        for rec in reversed(raw_records):
            p = rec.payload or {}
            if p.get("temp_internal") is not None and p.get("shock") is not None:
                ts = rec.created_at.isoformat() if rec.created_at else (p.get("timestamp") or "")
                hist_item = {
                    "tank_code": tank_code_str,
                    "tank_id": tank_id,
                    "timestamp": ts,
                    "temp_internal": float(p.get("temp_internal")),
                    "temp_external": float(p["temp_external"]) if p.get("temp_external") is not None else None,
                    "shock": float(p.get("shock")),
                }
                if p.get("battery_percentage") is not None:
                    hist_item["battery_percentage"] = float(p["battery_percentage"])
                push_ivf_quality_to_redis(tank_id, tank_code_str, hist_item, publish=False)
                history.append(hist_item)

    return {"tank_code": tank_code_str, "tank_id": tank_id, "history": history}


@router.get("/tanks/{tank_code}/ln2-history")
def get_ln2_history(
    tank_code: str = Path(..., description="Tank code (e.g., T30)"),
    limit: int = Query(30, ge=1, le=100),
    request: Request = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get LN2 readings history for a tank. Used for initial UI load before ln2-ws connects.
    Returns evaporation_rate_kg_per_h, ln2_mass_kg (Redis first, then DB fallback).
    """
    branch_id, role = get_branch_filter_info(request) if request else (None, None)

    tank_code_str = str(tank_code).strip()
    query = db.query(Tank).filter(Tank.tank_code == tank_code_str)
    if role != "Admin" and branch_id is not None:
        query = query.filter(Tank.branch_id == branch_id)
    tank = query.first()
    if not tank:
        raise HTTPException(status_code=404, detail=f"Tank '{tank_code}' not found")

    tank_id = tank.tank_id
    quality_service = QualityService(db)
    try:
        quality_service.validate_tank_belongs_to_branch(tank_id, branch_id)
    except Exception as e:
        raise HTTPException(status_code=403, detail=str(e))

    # Redis first, then DB fallback
    history = _get_ln2_history_for_tank(db, tank_id, tank_code_str, limit=limit)
    return {"tank_code": tank_code_str, "tank_id": tank_id, "history": history}


def push_ln2_reading_to_redis(tank_id: int, tank_code: str, data: dict, publish: bool = True) -> None:
    """Push LN2 reading to Redis and optionally publish to ln2_readings_channel for live WebSocket."""
    try:
        r = get_redis()
        payload = dict(data)
        payload["tank_id"] = tank_id
        payload["tank_code"] = tank_code
        msg = json.dumps(payload)
        history_key = f"ln2_quality_history:{tank_id}"
        r.lpush(history_key, msg)
        r.ltrim(history_key, 0, 29)
        if publish:
            r.publish("ln2_readings_channel", msg)
        logger.debug(f"Pushed LN2 reading to Redis for tank {tank_code} (id={tank_id})")
    except Exception as e:
        logger.warning(f"Failed to push LN2 reading to Redis: {e}")


async def ln2_redis_listener():
    """Listen for LN2 readings from Redis and broadcast to ln2-ws clients."""
    loop = asyncio.get_event_loop()
    pubsub = None
    while True:
        try:
            if pubsub is None:
                try:
                    pubsub = get_ln2_pubsub()
                    logger.info("LN2 Redis listener started")
                except Exception as e:
                    logger.error(f"Error connecting to LN2 Redis: {e}. Retrying in 5 seconds...")
                    await asyncio.sleep(5)
                    continue

            message = await loop.run_in_executor(
                None,
                lambda: pubsub.get_message(timeout=1.0, ignore_subscribe_messages=True),
            )
            if message and message.get("type") == "message":
                try:
                    data = json.loads(message["data"])
                    db = SessionLocal()
                    try:
                        await ln2_manager.broadcast(data, db)
                    finally:
                        db.close()
                except json.JSONDecodeError as e:
                    logger.error(f"Failed to parse LN2 message: {e}")
                except Exception as e:
                    logger.error(f"Error broadcasting LN2 message: {e}")
        except Exception as e:
            logger.error(f"Error in ln2_redis_listener: {e}")
            pubsub = None
            await asyncio.sleep(5)


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
            if not user.department or not is_hospital_department(user.department):
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
                        if "tank_code" not in message or not message["tank_code"]:
                            await websocket.send_json({
                                "type": "error",
                                "message": "Subscription message must contain 'tank_code'"
                            })
                            continue
                        
                        tank_code = message["tank_code"]
                        logger.info(f"Received tank_code: {tank_code}")
                        
                        # Resolve tank_code to tank_id
                        try:
                            # Convert tank_code to string
                            tank_code_str = str(tank_code).strip()
                            
                            # Find tank by tank_code and branch_id (for non-admin users)
                            if role_normalized != "Admin" and branch_id is not None:
                                tank = db.query(Tank).filter(
                                    Tank.tank_code == tank_code_str,
                                    Tank.branch_id == branch_id
                                ).first()
                            else:
                                # Admin users can access any tank
                                tank = db.query(Tank).filter(
                                    Tank.tank_code == tank_code_str
                                ).first()
                            
                            if not tank:
                                raise Exception(f"Tank with code '{tank_code}' not found" + (f" in branch {branch_id}" if branch_id else ""))
                            
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
                            # Admin users (branch_id is None) can access all tanks
                            # User/Manager users must match branch
                            if role_normalized != "Admin" and branch_id is not None:
                                quality_service.validate_tank_belongs_to_branch(tank_id, branch_id)
                            
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


def _get_ln2_history_for_tank(db: Session, tank_id: int, tank_code_str: str, limit: int = 12) -> list:
    """Get LN2 readings history for a tank (Redis first via get_ln2_redis_history, then DB fallback)."""
    quality_service = QualityService(db)
    history = quality_service.get_ln2_redis_history(tank_id, limit=limit)
    if history:
        return history
    # Fallback: ln2_readings by device_id (devices.id)
    tank = db.query(Tank).filter(Tank.tank_id == tank_id).first()
    if not tank:
        return []
    device_ids = [row[0] for row in db.query(Ln2IotDevice.device_id).filter(Ln2IotDevice.tank_id == tank_id).distinct().all()]
    if tank.tive_device_id:
        dev = db.query(Device).filter(Device.device_code == tank.tive_device_id).first()
        if dev and dev.id not in device_ids:
            device_ids.append(dev.id)
    if not device_ids:
        return []
    from sqlalchemy import or_, desc
    readings = (
        db.query(Ln2Reading)
        .filter(or_(*[Ln2Reading.device_id == d for d in device_ids]))
        .order_by(desc(Ln2Reading.reading_timestamp))
        .limit(limit)
        .all()
    )
    history = []
    for r in reversed(readings):
        ts = r.reading_timestamp.isoformat() if r.reading_timestamp else ""
        dev = db.query(Device).filter(Device.id == r.device_id).first()
        dev_code = dev.device_code if dev and dev.device_code else str(r.device_id)
        item = {
            "tank_code": tank_code_str,
            "tank_id": tank_id,
            "device_id": dev_code,
            "timestamp": ts,
            "evaporation_rate_kg_per_h": float(r.evaporation_rate_kg_per_h) if r.evaporation_rate_kg_per_h is not None else None,
            "ln2_mass_kg": float(r.ln2_mass_kg) if r.ln2_mass_kg is not None else None,
            "raw_weight_kg": float(r.raw_weight_kg) if r.raw_weight_kg is not None else None,
            "ln2_level_pct": float(r.ln2_level_pct) if r.ln2_level_pct is not None else None,
            "ln2_volume_l": float(r.ln2_volume_l) if r.ln2_volume_l is not None else None,
            "sensor_status": r.sensor_status,
            "lid_state": r.lid_state,
            "refill_detected": r.refill_detected,
            "quality_status": r.quality_status,
        }
        push_ln2_reading_to_redis(tank_id, tank_code_str, item, publish=False)
        history.append(item)
    return history


@router.websocket("/ln2-ws")
async def ivf_ln2_websocket_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for real-time LN2 readings monitoring.
    Separate from quality /ws to avoid disturbing legacy code.
    Requires: ?token=<jwt_token>. Subscribe with: {"tank_code": "T30"}.
    """
    connection_id = None
    try:
        await websocket.accept()
        logger.info(f"IVF LN2 WebSocket connection accepted from {websocket.client.host if websocket.client else 'unknown'}")

        query_params = dict(websocket.query_params)
        token = query_params.get("token")
        if not token:
            await websocket.close(code=1008, reason="Authentication required: No token provided")
            return

        try:
            auth_info = verify_websocket_token(token)
            user_id = auth_info["user_id"]
        except InvalidTokenException as e:
            await websocket.close(code=1008, reason=f"Invalid token: {str(e)}")
            return
        except Exception as e:
            await websocket.close(code=1008, reason=f"Token verification failed: {str(e)}")
            return

        db_temp = SessionLocal()
        try:
            user = db_temp.query(User).filter(User.user_id == user_id).first()
            if not user:
                await websocket.close(code=1008, reason="User not found")
                return
            if not user.department or not is_hospital_department(user.department):
                await websocket.close(code=1008, reason="Access denied: IVF users only")
                return
            role = user.role.value if hasattr(user.role, "value") else str(user.role)
            branch_id = user.branch_id if role != "Admin" else None
        finally:
            db_temp.close()

        connection_id = await ln2_manager.connect(websocket)
        ln2_manager.active_connections[connection_id]["branch_id"] = branch_id
        ln2_manager.active_connections[connection_id]["role"] = role

        db = SessionLocal()
        try:
            quality_service = QualityService(db)
            while True:
                try:
                    data = await asyncio.wait_for(websocket.receive_text(), timeout=1.0)
                    try:
                        message = json.loads(data)
                        if "tank_code" not in message or not message["tank_code"]:
                            await websocket.send_json({"type": "error", "message": "Subscription must contain 'tank_code'"})
                            continue
                        tank_code = message["tank_code"]
                        tank_code_str = str(tank_code).strip()

                        if role != "Admin" and branch_id is not None:
                            tank = db.query(Tank).filter(Tank.tank_code == tank_code_str, Tank.branch_id == branch_id).first()
                        else:
                            tank = db.query(Tank).filter(Tank.tank_code == tank_code_str).first()
                        if not tank:
                            await websocket.send_json({"type": "error", "message": f"Tank '{tank_code}' not found"})
                            continue
                        tank_id = tank.tank_id
                        quality_service.validate_tank_belongs_to_branch(tank_id, branch_id)

                        ln2_manager.set_tank_subscription(connection_id, tank_id, tank_code_str)
                        ln2_history = _get_ln2_history_for_tank(db, tank_id, tank_code_str, limit=12)

                        for h in ln2_history:
                            await websocket.send_json(h)
                        await websocket.send_json({
                            "type": "subscription_confirmed",
                            "tank_id": tank_id,
                            "tank_code": tank_code,
                            "history_count": len(ln2_history),
                        })
                    except json.JSONDecodeError:
                        pass
                except asyncio.TimeoutError:
                    continue
        finally:
            db.close()
    except WebSocketDisconnect:
        ln2_manager.disconnect_by_websocket(websocket)
        logger.info(f"IVF LN2 WebSocket disconnected: {connection_id}")
    except Exception as e:
        logger.error(f"IVF LN2 WebSocket error: {e}")
        ln2_manager.disconnect_by_websocket(websocket)
