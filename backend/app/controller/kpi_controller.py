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
    Send JSON: { "tank_id": 87 } to subscribe.
    Receives type "tank_kpi" messages for that tank.
    Auth is validated before accept() so rejections return HTTP 403 instead of upgrading then closing.
    """
    connection_id = None
    user_id = None
    branch_id = None
    role = None

    # Validate auth before accept() so rejection returns HTTP 403 (not upgrade-then-close)
    try:
        query_params = dict(websocket.query_params)
        token = query_params.get("token")
        if not token:
            await websocket.close(code=4401)
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
            logger.warning(f"KPI WebSocket rejected: invalid token - {e}")
            await websocket.close(code=4401)
            return
        except Exception as e:
            logger.warning(f"KPI WebSocket rejected: token verification failed - {e}")
            await websocket.close(code=4401)
            return

        db_temp = SessionLocal()
        try:
            user = db_temp.query(User).filter(User.user_id == user_id).first()
            if not user:
                logger.warning(f"KPI WebSocket rejected: user not found - {user_id}")
                await websocket.close(code=4403)
                return
            if not user.status:
                logger.warning(f"KPI WebSocket rejected: user inactive - {user_id}")
                await websocket.close(code=4403)
                return
            if getattr(user, "approved_status", None) != "approved":
                logger.warning(f"KPI WebSocket rejected: user not approved - {user_id}")
                await websocket.close(code=4403)
                return
            if not is_specific_department(user.department, "IVF"):
                logger.warning(f"KPI WebSocket rejected: not IVF department - {user_id}")
                await websocket.close(code=4403)
                return

            role = user.role.value if hasattr(user.role, "value") else str(user.role)
            branch_id = user.branch_id
            if role == "Manager" and branch_id_override is not None:
                branch_id = branch_id_override
        finally:
            db_temp.close()

        await websocket.accept()
        logger.info(f"KPI WebSocket connection accepted from {websocket.client.host if websocket.client else 'unknown'}")

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
                        tank_id = message.get("tank_id") if isinstance(message, dict) else None
                        if tank_id is None:
                            await websocket.send_json({
                                "type": "error",
                                "message": "Subscription message must contain 'tank_id'",
                            })
                            continue
                        effective_branch_id = branch_id
                        selected_branch_id = message.get("branch_id")
                        if role == "Manager" and selected_branch_id is not None:
                            try:
                                effective_branch_id = int(selected_branch_id)
                            except (TypeError, ValueError):
                                await websocket.send_json({"type": "error", "message": "Invalid 'branch_id'"})
                                continue

                        try:
                            tank_id_int = int(tank_id)
                        except (TypeError, ValueError):
                            await websocket.send_json({"type": "error", "message": "Invalid 'tank_id'"})
                            continue

                        tank = db.query(Tank).filter(Tank.tank_id == tank_id_int).first()
                        if not tank:
                            await websocket.send_json({"type": "error", "message": "Invalid 'tank_id'"})
                            continue

                        tank_code_str = str(tank.tank_code).strip()
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
