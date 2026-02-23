"""
KPI WebSocket controller for Quality Tracking live graph.
Exposes /api/kpi/ws for tank KPI subscriptions; Redis tank_kpi_readings_channel is broadcast to these connections.
"""
import asyncio
import json
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from app.auth.auth import verify_websocket_token
from app.exceptions import InvalidTokenException
from app.config.database import SessionLocal
from app.models.user_model import User
from app.models.IVF.tank_model import Tank
from app.service.quality_service import QualityService
from app.utils.websocket_manager import ConnectionManager
from app.utils.user_helpers import is_specific_department

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/kpi", tags=["KPI WebSocket"])
kpi_manager = ConnectionManager()


@router.websocket("/ws")
async def kpi_websocket_endpoint(websocket: WebSocket):
    """
    WebSocket for Quality Tracking KPI live updates.
    Query: ?token=<jwt>&branch_id_override=<id> (optional).
    Send JSON: { "tank_code": "T30" } to subscribe. Receives type "tank_kpi" messages for that tank.
    """
    connection_id = None
    try:
        await websocket.accept()
        logger.info(f"KPI WebSocket connection accepted from {websocket.client.host if websocket.client else 'unknown'}")

        query_params = dict(websocket.query_params)
        token = query_params.get("token")
        if not token:
            await websocket.close(code=1008, reason="Authentication required: No token provided")
            return

        branch_id_override = None
        if query_params.get("branch_id_override"):
            try:
                branch_id_override = int(query_params["branch_id_override"])
            except (ValueError, TypeError):
                pass

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
            if not is_specific_department(user.department, "IVF"):
                await websocket.close(code=1008, reason="Access denied: This endpoint is for IVF users only")
                return

            role = user.role.value if hasattr(user.role, "value") else str(user.role)
            branch_id = user.branch_id
            if role == "Manager" and branch_id_override is not None:
                branch_id = branch_id_override
        finally:
            db_temp.close()

        connection_id = await kpi_manager.connect(websocket)
        kpi_manager.active_connections[connection_id]["user_id"] = user_id
        kpi_manager.active_connections[connection_id]["branch_id"] = branch_id
        kpi_manager.active_connections[connection_id]["role"] = role
        logger.info(f"KPI WebSocket authenticated: user={user_id}, branch_id={branch_id}, connection={connection_id}")

    except Exception as e:
        logger.error(f"KPI WebSocket auth error: {e}", exc_info=True)
        try:
            if connection_id:
                kpi_manager.disconnect(connection_id)
            await websocket.close(code=1011, reason=str(e))
        except Exception:
            pass
        return

    try:
        db = SessionLocal()
        try:
            quality_service = QualityService(db)
            while True:
                try:
                    data = await asyncio.wait_for(websocket.receive_text(), timeout=1.0)
                    try:
                        message = json.loads(data)
                        tank_code = message.get("tank_code") if isinstance(message, dict) else None
                        if not tank_code:
                            await websocket.send_json({"type": "error", "message": "Subscription message must contain 'tank_code'"})
                            continue
                        tank_code_str = str(tank_code).strip()
                        effective_branch_id = branch_id
                        selected_branch_id = message.get("branch_id")
                        if role == "Manager" and selected_branch_id is not None:
                            try:
                                effective_branch_id = int(selected_branch_id)
                            except (TypeError, ValueError):
                                await websocket.send_json({"type": "error", "message": "Invalid 'branch_id'"})
                                continue

                        if effective_branch_id is not None:
                            tank = db.query(Tank).filter(Tank.tank_code == tank_code_str, Tank.branch_id == effective_branch_id).first()
                        else:
                            tanks = db.query(Tank).filter(Tank.tank_code == tank_code_str).all()
                            tank = tanks[0] if len(tanks) == 1 else None
                            if len(tanks) > 1:
                                await websocket.send_json({"type": "error", "message": "Multiple branches have this tank code. Send 'branch_id' in subscription."})
                                continue
                        if not tank:
                            await websocket.send_json({"type": "error", "message": f"Tank '{tank_code_str}' not found"})
                            continue
                        try:
                            if role != "Admin" and effective_branch_id is not None:
                                quality_service.validate_tank_belongs_to_branch(tank.tank_id, effective_branch_id)
                        except Exception as e:
                            await websocket.send_json({"type": "error", "message": str(e)})
                            continue

                        kpi_manager.active_connections[connection_id]["branch_id"] = None if role == "Admin" else tank.branch_id
                        kpi_manager.set_tank_subscription(connection_id, tank.tank_id, tank_code_str)
                        await websocket.send_json({
                            "type": "subscription_confirmed",
                            "tank_id": tank.tank_id,
                            "tank_code": tank_code_str,
                            "branch_id": tank.branch_id,
                        })
                        # Send last 5 KPI readings from database (readings table); Redis is for live updates only
                        history = quality_service.get_tank_kpi_history(tank.tank_id, limit=5)
                        if not history:
                            history = quality_service.get_tank_kpi_redis_history(tank.tank_id, limit=5)
                        for item in history:
                            payload = {
                                "type": "tank_kpi",
                                "tank_id": item.get("tank_id", tank.tank_id),
                                "tank_code": item.get("tank_code", tank_code_str),
                                "timestamp": item.get("timestamp"),
                                "kpis": item.get("kpis", []),
                            }
                            if payload.get("timestamp") and payload.get("kpis") is not None:
                                await websocket.send_json(payload)
                    except json.JSONDecodeError:
                        pass
                except asyncio.TimeoutError:
                    continue
        finally:
            db.close()
    except WebSocketDisconnect:
        kpi_manager.disconnect_by_websocket(websocket)
        logger.info(f"KPI WebSocket disconnected: {connection_id}")
    except Exception as e:
        logger.error(f"KPI WebSocket error: {e}")
        kpi_manager.disconnect_by_websocket(websocket)
