import json
import logging
import uuid
import asyncio
from fastapi import APIRouter, Depends, HTTPException, Path, WebSocket, WebSocketDisconnect, Query, Response, Request
from sqlalchemy.orm import Session
from typing import List
import time
from app.config import database
from app.config.database import SessionLocal
from app.schemas.chat_schema import (
    ChatMessageCreateRequest, ChatMessageCreateResponse, 
    PatientMessagesResponse, UnreadMessagesResponse,
    ChatErrorResponse
)
from app.service.chat_service import (
    create_chat_message, get_patient_messages, get_canister_messages, get_unread_messages,
    broadcast_new_message, broadcast_unread_messages_update, handle_websocket_connection, handle_websocket_message_loop,
    mark_canister_as_read, get_canister_unread_count, mark_patient_as_read, get_patient_unread_count
)
from app.dependencies.auth_dependencies import (
    get_current_user, get_pharma_id_from_request, get_current_user_pharma_id, 
    get_hospital_id_from_request, authenticate_websocket
)
from app.models import user_model
from app.models.IVF.tank_model import Tank
from app.utils.chat_websocket_manager import ChatConnectionManager
from app.exceptions.custom_exceptions import (
    ChatMessageCreateFailedException, ChatMessageNotFoundException,
    ChatUserNotFoundException, ChatPatientNotFoundException,
    ChatPharmaAccessDeniedException, ChatInvalidDataException,
    ChatWebSocketInvalidMessageException, ChatException
)
from app.constants.messages import ErrorMessages

logger = logging.getLogger(__name__)

# Create singleton connection manager
chat_connection_manager = ChatConnectionManager()

router = APIRouter(
    tags=["Chat"],
    prefix="/chat",
    responses={404: {"description": "Not found"}}
)


# ============================================
# CHAT ENDPOINTS
# ============================================

@router.post("/messages", 
    response_model=ChatMessageCreateResponse,
    response_model_exclude_unset=True,  # Skip unset fields for faster serialization
    response_model_exclude_none=False,  # Keep None fields (frontend may need them)
    summary="Send chat message",
    description="""
    Send a chat message for a specific patient.
    Tag other users within the same pharma to notify them.
    Messages are broadcast to WebSocket connections in real-time.
    """)
async def send_chat_message(
    request: ChatMessageCreateRequest,
    response: Response,
    http_request: Request,
    db: Session = Depends(database.get_db),
    current_user: user_model.User = Depends(get_current_user)
):
    """Send a chat message for a specific patient"""

    start_time = time.time()
    try:
        if request.tagged_user_ids and current_user.user_id in request.tagged_user_ids:
            raise ChatInvalidDataException(
                reason="User attempted to tag themselves",
                custom_message=ErrorMessages.CHAT_CANNOT_TAG_SELF
            )
        
        sender_name = f"{current_user.first_name} {current_user.last_name}"
        sender_role = current_user.role.value if current_user.role else None
        
        # Get pharma_id or hospital_id based on user type
        sender_pharma_id = None
        sender_hospital_id = None
        if hasattr(http_request.state, "pharma_id") and http_request.state.pharma_id is not None:
            sender_pharma_id = http_request.state.pharma_id
        if hasattr(http_request.state, "hospital_id") and http_request.state.hospital_id is not None:
            sender_hospital_id = http_request.state.hospital_id
        
        db_start = time.time()
        result = create_chat_message(
            request,
            current_user.user_id,
            sender_pharma_id,
            sender_hospital_id,
            sender_name,
            sender_role,
            db
        )
        db_time = time.time() - db_start
        
        # Start WebSocket broadcast in background (non-blocking)
        broadcast_start = time.time()
        asyncio.create_task(
            broadcast_new_message(
                result,
                sender_pharma_id,  # Can be None for hospital users
                chat_connection_manager
            )
        )
        broadcast_setup_time = time.time() - broadcast_start
        
        elapsed_time = time.time() - start_time
        
        # Add performance headers
        response.headers["X-Response-Time-Ms"] = f"{elapsed_time * 1000:.0f}"
        response.headers["X-DB-Time-Ms"] = f"{db_time * 1000:.0f}"
        
        logger.info(f"[PERF] POST /api/chat/messages - Total: {elapsed_time:.3f}s | DB: {db_time:.3f}s | Broadcast setup: {broadcast_setup_time:.3f}s (patient_id={request.patient_id}, message_id={result.message_id})")
        
        return result
    except ChatMessageCreateFailedException as e:
        raise HTTPException(status_code=e.status_code, detail=e.to_dict())
    except ChatUserNotFoundException as e:
        raise HTTPException(status_code=e.status_code, detail=e.to_dict())
    except ChatPatientNotFoundException as e:
        raise HTTPException(status_code=e.status_code, detail=e.to_dict())
    except ChatPharmaAccessDeniedException as e:
        raise HTTPException(status_code=e.status_code, detail=e.to_dict())
    except ChatInvalidDataException as e:
        raise HTTPException(status_code=e.status_code, detail=e.to_dict())
    except Exception as e:
        raise HTTPException(status_code=500, detail={
            "error_code": "CHAT_INTERNAL_ERROR",
            "message": "Internal server error",
            "details": str(e)
        })


@router.get("/patients/{patient_id}/messages",
    response_model=PatientMessagesResponse,
    summary="Get patient messages",
    description="""
    Get all messages for a specific patient.
    Messages are NOT automatically marked as read.
    Frontend must explicitly call the mark_as_read endpoint when user:
    - Sends a message
    - Closes chat window
    - Keeps chat window open while receiving new messages
    """)
async def get_patient_chat_messages(
    patient_id: str = Path(..., description="Patient ID"),
    db: Session = Depends(database.get_db),
    current_user: user_model.User = Depends(get_current_user),
    pharma_id: int = Depends(get_pharma_id_from_request)
):
    """Get all messages for a specific patient (does NOT mark as read)"""
    try:
        result = await get_patient_messages(patient_id, current_user.user_id, pharma_id, db, mark_as_read=False)
        return result
    except ChatPatientNotFoundException as e:
        raise HTTPException(status_code=e.status_code, detail=e.to_dict())
    except ChatUserNotFoundException as e:
        raise HTTPException(status_code=e.status_code, detail=e.to_dict())
    except ChatMessageNotFoundException as e:
        raise HTTPException(status_code=e.status_code, detail=e.to_dict())
    except Exception as e:
        raise HTTPException(status_code=500, detail={
            "error_code": "CHAT_INTERNAL_ERROR",
            "message": "Internal server error",
            "details": str(e)
        })


@router.get("/unread",
    response_model=UnreadMessagesResponse,
    summary="Get unread messages",
    description="""
    Get all unread messages where the current user was tagged.
    Messages are grouped by patient ID.
    """)
def get_user_unread_messages(
    db: Session = Depends(database.get_db),
    current_user: user_model.User = Depends(get_current_user),
    http_request: Request = None
):
    """Get all unread messages for the current user"""
    try:
        # Get pharma_id or hospital_id based on user type
        pharma_id = None
        if hasattr(http_request.state, "pharma_id") and http_request.state.pharma_id is not None:
            pharma_id = http_request.state.pharma_id
        elif hasattr(http_request.state, "hospital_id") and http_request.state.hospital_id is not None:
            # For hospital users, pharma_id is None - get_unread_messages will handle it
            pharma_id = None
        else:
            # Try to get from current_user object as fallback
            pharma_id = current_user.pharma_id
        
        result = get_unread_messages(current_user.user_id, pharma_id, db)
        return result
    except ChatUserNotFoundException as e:
        raise HTTPException(status_code=e.status_code, detail=e.to_dict())
    except ChatMessageNotFoundException as e:
        raise HTTPException(status_code=e.status_code, detail=e.to_dict())
    except Exception as e:
        raise HTTPException(status_code=500, detail={
            "error_code": "CHAT_INTERNAL_ERROR",
            "message": "Internal server error",
            "details": str(e)
        })


@router.get("/canisters/{tank_id}/messages",
    response_model=PatientMessagesResponse,
    summary="Get tank messages",
    description="""
    Get all messages for a specific tank (IVF flow).
    Messages are NOT automatically marked as read.
    Frontend must explicitly call the mark_as_read endpoint when user:
    - Sends a message
    - Closes chat window
    - Keeps chat window open while receiving new messages
    """)
async def get_canister_chat_messages(
    tank_id: int = Path(..., description="Tank ID"),
    db: Session = Depends(database.get_db),
    current_user: user_model.User = Depends(get_current_user),
    http_request: Request = None
):
    """Get all messages for a specific tank (does NOT mark as read)"""
    try:
        # Get pharma_id or hospital_id based on user type
        pharma_id = None
        hospital_id = None
        if hasattr(http_request.state, "pharma_id") and http_request.state.pharma_id is not None:
            pharma_id = http_request.state.pharma_id
        if hasattr(http_request.state, "hospital_id") and http_request.state.hospital_id is not None:
            hospital_id = http_request.state.hospital_id
        
        result = await get_canister_messages(
            tank_id,
            current_user.user_id, 
            pharma_id, 
            hospital_id,
            db, 
            mark_as_read=False
        )
        return result
    except ChatPatientNotFoundException as e:
        raise HTTPException(status_code=e.status_code, detail=e.to_dict())
    except ChatUserNotFoundException as e:
        raise HTTPException(status_code=e.status_code, detail=e.to_dict())
    except ChatMessageNotFoundException as e:
        raise HTTPException(status_code=e.status_code, detail=e.to_dict())
    except Exception as e:
        raise HTTPException(status_code=500, detail={
            "error_code": "CHAT_INTERNAL_ERROR",
            "message": "Internal server error",
            "details": str(e)
        })


@router.post("/patients/{patient_id}/mark-read",
    summary="Mark patient messages as read",
    description="""
    Mark all messages for a patient as read.
    Frontend should call this when:
    - User sends a message
    - User closes chat window
    - User keeps chat window open while receiving new messages
    """)
async def mark_patient_messages_as_read(
    patient_id: str = Path(..., description="Patient ID"),
    db: Session = Depends(database.get_db),
    current_user: user_model.User = Depends(get_current_user),
    pharma_id: int = Depends(get_pharma_id_from_request)
):
    """Mark all messages for a patient as read"""
    try:
        # Mark all messages as read
        latest_message_id = mark_patient_as_read(current_user.user_id, patient_id, db)
        
        # Get updated unread count
        unread_count = get_patient_unread_count(current_user.user_id, patient_id, db)
        
        # Broadcast unread update via WebSocket (non-blocking)
        # Create a new DB session for the broadcast task since the current session will be closed
        try:
            asyncio.create_task(
                broadcast_unread_messages_update(
                    current_user.user_id,
                    pharma_id,
                    chat_connection_manager,
                    SessionLocal()  # Create new session for background task
                )
            )
        except Exception as e:
            logger.warning(f"Failed to broadcast unread update after marking messages as read: {e}")
        
        return {
            "success": True,
            "message": f"Messages for patient {patient_id} marked as read",
            "patient_id": patient_id,
            "last_read_message_id": latest_message_id,
            "unread_count": unread_count
        }
    except ChatPatientNotFoundException as e:
        raise HTTPException(status_code=e.status_code, detail=e.to_dict())
    except Exception as e:
        raise HTTPException(status_code=500, detail={
            "error_code": "CHAT_INTERNAL_ERROR",
            "message": "Internal server error",
            "details": str(e)
        })


@router.post("/canisters/{tank_id}/mark-read",
    summary="Mark tank messages as read",
    description="""
    Mark all messages for a tank as read (IVF flow).
    Frontend should call this when:
    - User sends a message
    - User closes chat window
    - User keeps chat window open while receiving new messages
    """)
async def mark_canister_messages_as_read(
    tank_id: int = Path(..., description="Tank ID"),
    db: Session = Depends(database.get_db),
    current_user: user_model.User = Depends(get_current_user),
    http_request: Request = None
):
    """Mark all messages for a tank as read"""
    try:
        tank = db.query(Tank).filter(Tank.tank_id == tank_id).first()
        if not tank:
            raise HTTPException(status_code=404, detail={
                "error_code": "CHAT_TANK_NOT_FOUND",
                "message": f"Tank with id '{tank_id}' not found"
            })

        # Mark all messages as read
        latest_message_id = mark_canister_as_read(current_user.user_id, tank_id, db)
        
        # Get updated unread count
        unread_count = get_canister_unread_count(current_user.user_id, tank_id, db)
        
        # Broadcast unread update via WebSocket (non-blocking)
        # Get pharma_id for broadcast (can be None for hospital users)
        pharma_id = None
        if hasattr(http_request.state, "pharma_id") and http_request.state.pharma_id is not None:
            pharma_id = http_request.state.pharma_id
        elif hasattr(current_user, "pharma_id") and current_user.pharma_id is not None:
            pharma_id = current_user.pharma_id
        
        try:
            asyncio.create_task(
                broadcast_unread_messages_update(
                    current_user.user_id,
                    pharma_id,
                    chat_connection_manager,
                    SessionLocal()  # Create new session for background task
                )
            )
        except Exception as e:
            logger.warning(f"Failed to broadcast unread update after marking messages as read: {e}")
        
        return {
            "success": True,
            "message": f"Messages for tank {tank_id} marked as read",
            "tank_id": tank_id,
            "tank_code": tank.tank_code,
            "last_read_message_id": latest_message_id,
            "unread_count": unread_count
        }
    except ChatPatientNotFoundException as e:
        raise HTTPException(status_code=e.status_code, detail=e.to_dict())
    except Exception as e:
        raise HTTPException(status_code=500, detail={
            "error_code": "CHAT_INTERNAL_ERROR",
            "message": "Internal server error",
            "details": str(e)
        })


# ============================================
# HEALTH CHECK ENDPOINT
# ============================================

@router.get("/health",
    summary="Chat service health check",
    description="Check if the chat service is running")
def chat_health_check():
    """Health check for chat service"""
    return {
        "status": "healthy",
        "service": "chat",
        "message": "Chat service is running"
    }


# ============================================
# WEBSOCKET ENDPOINT
# ============================================

@router.websocket("/ws")
async def websocket_chat_endpoint(
    websocket: WebSocket,
    token: str = Query(...),
    patient_id: str = Query(None)
):
    """
    WebSocket endpoint for real-time chat messaging
    
    Connection: ws://host/api/chat/ws?token=<jwt_token>&patient_id=<patient_id>
    
    Query Parameters:
    - token: JWT authentication token (required)
    - patient_id: Optional patient ID to auto-subscribe on connection
    
    Message Types (Client -> Server):
        - subscribe_patient: Subscribe to patient messages
        - unsubscribe_patient: Unsubscribe from patient messages
        - get_patient_messages: Get all messages for a patient
    - get_unread_messages: Get unread messages
    - mark_read: Mark messages as read
    
    Response Types (Server -> Client):
    - patient_messages: Patient messages response
    - unread_messages: Unread messages response
    - new_message: Real-time new message broadcast
    - error: Error response
    - success: Success response
    """
    connection_id = None
    
    try:
        # Handle connection setup via service
        connection_id, current_user, pharma_id = await handle_websocket_connection(
            websocket,
            token,
            patient_id,
            chat_connection_manager,
            authenticate_websocket
        )
        
        # Handle message loop via service
        await handle_websocket_message_loop(
            websocket,
            connection_id,
            current_user,
            pharma_id,
            chat_connection_manager
        )
    
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected: connection_id={connection_id}")
    
    except Exception as e:
        logger.error(f"WebSocket error: {e}", exc_info=True)
    
    finally:
        # Cleanup
        if connection_id:
            chat_connection_manager.disconnect(connection_id)
        logger.info(f"WebSocket connection closed: connection_id={connection_id}")
