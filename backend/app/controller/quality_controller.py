"""
Quality Monitoring Controller
Handles WebSocket and REST endpoints for real-time quality monitoring
"""
import asyncio
import json
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException, Query, Request, Depends
from typing import Optional
from sqlalchemy.orm import Session

from app.service.redis_service import get_redis
from app.service.quality_service import QualityService
from app.auth.auth import verify_websocket_token
from app.utils.websocket_manager import ConnectionManager
from app.dependencies.auth_dependencies import get_current_user_pharma_id, get_current_user
from app.config.database import get_db, SessionLocal
from app.models.user_model import User
from app.schemas.quality_schema import (
    QualityHealthResponse,
    QualityPatientsResponse,
    QualityHistoryResponse,
    QualityConnectionsResponse
)
from app.exceptions.quality_exceptions import (
    QualityServiceException
)
from app.exceptions import InvalidTokenException

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/quality", tags=["Quality Monitoring"])

# Global connection manager instance
manager = ConnectionManager()

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for real-time quality monitoring
    
    Requires authentication token in query parameter: ?token=<jwt_token>
    """
    connection_id = None
    
    try:
        # Accept connection first
        await websocket.accept()
        logger.info(f"WebSocket connection accepted from {websocket.client.host if websocket.client else 'unknown'}")
        
        # Authenticate user - Get token from query parameter
        query_params = dict(websocket.query_params)
        token = query_params.get("token")
        logger.info(f"Token from query params: {'present' if token else 'missing'}")
        
        if not token:
            logger.warning("WebSocket connection rejected: No token provided")
            await websocket.close(code=1008, reason="Authentication required: No token provided")
            return
        
        # Verify token using auth function
        try:
            auth_info = verify_websocket_token(token)
            user_id = auth_info["user_id"]
            pharma_id = auth_info["pharma_id"]
            logger.debug(f"Token verified: user_id={user_id}, pharma_id={pharma_id}")
        except InvalidTokenException as e:
            logger.warning(f"WebSocket connection rejected: Invalid token - {str(e)}")
            await websocket.close(code=1008, reason=f"Invalid token: {str(e)}")
            return
        except Exception as e:
            logger.error(f"WebSocket token verification error: {type(e).__name__}: {str(e)}")
            await websocket.close(code=1008, reason=f"Token verification failed: {str(e)}")
            return
        
        # Store pharma_id in connection manager for filtering
        connection_id = await manager.connect(websocket)
        manager.active_connections[connection_id]["pharma_id"] = pharma_id
        manager.active_connections[connection_id]["user_id"] = user_id
        
        logger.info(f"WebSocket authenticated: user={user_id}, pharma={pharma_id}, connection={connection_id}")
        
    except Exception as e:
        logger.error(f"WebSocket authentication error: {type(e).__name__}: {str(e)}", exc_info=True)
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
            
            while True:
                try:
                    # Wait for messages with timeout to avoid blocking
                    data = await asyncio.wait_for(websocket.receive_text(), timeout=1.0)
                    try:
                        # Try to parse as JSON
                        message = json.loads(data)
                        if "patient_id" in message:
                            patient_id = message["patient_id"]
                            
                            # Validate patient belongs to user's pharma
                            try:
                                quality_service.validate_patient_belongs_to_pharma(patient_id, pharma_id)
                                # Client is subscribing to a patient
                                manager.set_patient_subscription(connection_id, patient_id)
                                # Send confirmation
                                await websocket.send_json({
                                    "type": "subscription_confirmed",
                                    "patient_id": patient_id
                                })
                            except Exception as e:
                                await websocket.send_json({
                                    "type": "error",
                                    "message": f"Invalid patient: {str(e)}"
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
        logger.info(f"WebSocket disconnected: {connection_id}")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect_by_websocket(websocket)


@router.get("/health", response_model=QualityHealthResponse)
async def health_check(db: Session = Depends(get_db)):
    """Health check endpoint for Redis connection"""
    quality_service = QualityService(db)
    health_status = quality_service.check_redis_health()
    return QualityHealthResponse(**health_status)


@router.get("/patients", response_model=QualityPatientsResponse)
async def get_patients(
    pharma_id: int = Depends(get_current_user_pharma_id),
    db: Session = Depends(get_db)
):
    """Get list of patients with quality data for authenticated user's pharma"""
    quality_service = QualityService(db)
    patient_ids = quality_service.get_patients_with_quality_data(pharma_id)
    return QualityPatientsResponse(
        patients=patient_ids,
        count=len(patient_ids)
    )


@router.get("/history", response_model=QualityHistoryResponse)
async def get_history(
    patient_id: Optional[str] = Query(None, description="Patient ID to get history for"),
    pharma_id: int = Depends(get_current_user_pharma_id),
    db: Session = Depends(get_db)
):
    """Get last 20 quality readings for patients in authenticated user's pharma"""
    quality_service = QualityService(db)
    history_data = quality_service.get_quality_history(pharma_id, patient_id, limit=20)
    
    return QualityHistoryResponse(
        patient_id=patient_id,
        history=history_data,
        count=len(history_data)
    )


@router.get("/patients/{patient_id}/export")
async def export_patient_quality_data(
    patient_id: str,
    pharma_id: int = Depends(get_current_user_pharma_id),
    db: Session = Depends(get_db)
):
    """Export a patient's quality data as a CSV for the default time window."""
    quality_service = QualityService(db)
    return quality_service.export_patient_quality_data_csv(
        patient_id=patient_id,
        pharma_id=pharma_id
    )


@router.get("/connections", response_model=QualityConnectionsResponse)
async def get_connections(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get WebSocket connections count and list for current user's pharma"""
    quality_service = QualityService(db)
    connections_info = manager.get_connections_info()
    filtered_info = quality_service.get_connections_for_pharma(current_user.pharma_id, connections_info, manager)
    return QualityConnectionsResponse(**filtered_info)

