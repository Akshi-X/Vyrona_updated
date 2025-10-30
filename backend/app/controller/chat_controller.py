from fastapi import APIRouter, Depends, HTTPException, Path
from sqlalchemy.orm import Session
from typing import List

from app.config import database
from app.schemas.chat_schema import (
    ChatMessageCreateRequest, ChatMessageCreateResponse, 
    PatientMessagesResponse, UnreadMessagesResponse,
    ChatErrorResponse
)
from app.service.chat_service import (
    create_chat_message, get_patient_messages, get_unread_messages
)
from app.dependencies.auth_dependencies import get_current_user, get_pharma_id_from_request
from app.models import user_model
from app.exceptions.custom_exceptions import (
    ChatMessageCreateFailedException, ChatMessageNotFoundException,
    ChatUserNotFoundException, ChatPatientNotFoundException,
    ChatPharmaAccessDeniedException, ChatInvalidDataException
)

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
    """)
def send_chat_message(
    request: ChatMessageCreateRequest,
    db: Session = Depends(database.get_db),
    current_user: user_model.User = Depends(get_current_user)
):
    """Send a chat message for a specific patient"""
    try:
        sender_name = f"{current_user.first_name} {current_user.last_name}"
        result = create_chat_message(
            request,
            current_user.user_id,
            current_user.pharma_id,
            sender_name,
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
def get_patient_chat_messages(
    patient_id: str = Path(..., description="Patient ID"),
    db: Session = Depends(database.get_db),
    current_user: user_model.User = Depends(get_current_user),
    pharma_id: int = Depends(get_pharma_id_from_request)
):
    """Get all messages for a specific patient and mark them as read"""
    try:
        result = get_patient_messages(patient_id, current_user.user_id, pharma_id, db)
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
