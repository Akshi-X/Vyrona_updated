import json
import logging
import uuid
from fastapi import APIRouter, Depends, HTTPException, Path, WebSocket, WebSocketDisconnect, Query
from sqlalchemy.orm import Session
from typing import List

from app.config import database
from app.schemas.chat_schema import (
    ChatMessageCreateRequest, ChatMessageCreateResponse, 
    PatientMessagesResponse, UnreadMessagesResponse,
    ChatErrorResponse
)
from app.service.chat_service import (
    create_chat_message, get_patient_messages, get_unread_messages,
    broadcast_new_message, handle_websocket_connection, handle_websocket_message_loop
)
from app.dependencies.auth_dependencies import (
    get_current_user, get_pharma_id_from_request, authenticate_websocket
)
from app.models import user_model
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
    summary="Send chat message",
    description="""
    Send a chat message for a specific patient.
    Tag other users within the same pharma to notify them.
    Messages are broadcast to WebSocket connections in real-time.
    """)
async def send_chat_message(
    request: ChatMessageCreateRequest,
    db: Session = Depends(database.get_db),
    current_user: user_model.User = Depends(get_current_user)
):
    """Send a chat message for a specific patient"""
    try:
        if request.tagged_user_ids and current_user.user_id in request.tagged_user_ids:
            raise ChatInvalidDataException(
                reason="User attempted to tag themselves",
                custom_message=ErrorMessages.CHAT_CANNOT_TAG_SELF
            )
        
        sender_name = f"{current_user.first_name} {current_user.last_name}"
        result = create_chat_message(
            request,
            current_user.user_id,
            current_user.pharma_id,
            sender_name,
            db
        )
        
        await broadcast_new_message(
            result,
            current_user.pharma_id,
            chat_connection_manager,
            db
        )
        
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
    Messages are automatically marked as read when this endpoint is called.
    """)
async def get_patient_chat_messages(
    patient_id: str = Path(..., description="Patient ID"),
    db: Session = Depends(database.get_db),
    current_user: user_model.User = Depends(get_current_user),
    pharma_id: int = Depends(get_pharma_id_from_request)
):
    """Get all messages for a specific patient and mark them as read"""
    try:
        result = await get_patient_messages(patient_id, current_user.user_id, pharma_id, db)
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
    pharma_id: int = Depends(get_pharma_id_from_request)
):
    """Get all unread messages for the current user"""
    try:
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
    db = None
    
    try:
        # Handle connection setup via service
        connection_id, current_user, pharma_id, db = await handle_websocket_connection(
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
            chat_connection_manager,
            db
        )
    
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected: connection_id={connection_id}")
    
    except Exception as e:
        logger.error(f"WebSocket error: {e}", exc_info=True)
    
    finally:
        # Cleanup
        if connection_id:
            chat_connection_manager.disconnect(connection_id)
        if db:
            db.close()
        logger.info(f"WebSocket connection closed: connection_id={connection_id}")
