import json
import logging
from datetime import datetime, timezone
from typing import Optional, List, Dict
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, desc
from sqlalchemy.exc import IntegrityError

from ..models.chat_model import ChatMessage
from ..models.chat_read_status import ChatReadStatus
from ..models.user_model import User
from ..models.patient_model import Patient
from ..models.pharma_model import Pharma
from ..schemas.chat_schema import (
    ChatMessageCreateRequest, ChatMessageCreateResponse, ChatMessageResponse,
    PatientMessagesResponse, UnreadMessageResponse, UnreadMessagesResponse
)
from ..exceptions.custom_exceptions import (
    ChatMessageCreateFailedException, ChatMessageNotFoundException,
    ChatUserNotFoundException, ChatPatientNotFoundException,
    ChatPharmaAccessDeniedException, ChatInvalidDataException
)

# Setup logger
logger = logging.getLogger(__name__)


def create_chat_message(
    request: ChatMessageCreateRequest,
    sender_id: str,
    sender_pharma_id: int,
    sender_name: str,
    db: Session
) -> ChatMessageCreateResponse:
    """Create a new chat message"""
    try:
        # Validate patient exists and belongs to sender's pharma
        patient = db.query(Patient).filter(Patient.id == request.patient_id).first()
        if not patient:
            raise ChatPatientNotFoundException(f"Patient with ID {request.patient_id} not found")
        
        # Validate tagged users are in same pharma
        if request.tagged_user_ids:
            tagged_users = db.query(User).filter(
                User.user_id.in_(request.tagged_user_ids)
            ).all()
            
            if len(tagged_users) != len(request.tagged_user_ids):
                raise ChatUserNotFoundException("One or more tagged users not found")
            
            # Check if all tagged users are in same pharma as sender
            for user in tagged_users:
                if user.pharma_id != sender_pharma_id:
                    raise ChatPharmaAccessDeniedException(
                        f"User {user.user_id} is not in the same pharma as sender"
                    )
        
        # Create chat message
        chat_message = ChatMessage(
            message_content=request.message_content,
            patient_id=request.patient_id,
            sender_id=sender_id,
            tagged_user_ids=json.dumps(request.tagged_user_ids) if request.tagged_user_ids else None,
            created_by=sender_id
        )
        
        db.add(chat_message)
        db.flush()  # Get the ID without committing
        
        # Create read status entries for tagged users
        if request.tagged_user_ids:
            for user_id in request.tagged_user_ids:
                read_status = ChatReadStatus(
                    message_id=chat_message.id,
                    user_id=user_id,
                    is_read=False
                )
                db.add(read_status)
        
        # Also create read status for sender (auto-read)
        sender_read_status = ChatReadStatus(
            message_id=chat_message.id,
            user_id=sender_id,
            is_read=True,
            read_at=datetime.now(timezone.utc)
        )
        db.add(sender_read_status)
        
        db.commit()
        
        # sender_name passed in
        
        return ChatMessageCreateResponse(
            message_id=chat_message.id,
            patient_id=chat_message.patient_id,
            message_content=chat_message.message_content,
            sender_id=chat_message.sender_id,
            sender_name=sender_name,
            tagged_user_ids=request.tagged_user_ids,
            created_at=chat_message.created_at
        )
        
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to create chat message: {str(e)}")
        if isinstance(e, (ChatMessageCreateFailedException, ChatUserNotFoundException, 
                         ChatPatientNotFoundException, ChatPharmaAccessDeniedException)):
            raise
        raise ChatMessageCreateFailedException(f"Failed to create chat message: {str(e)}")


def get_patient_messages(
    patient_id: str,
    current_user_id: str,
    current_user_pharma_id: int,
    db: Session
) -> PatientMessagesResponse:
    """Get all messages for a specific patient and mark them as read"""
    try:
        # Validate patient exists
        patient = db.query(Patient).filter(Patient.id == patient_id).first()
        if not patient:
            raise ChatPatientNotFoundException(f"Patient with ID {patient_id} not found")
        
        # Get all messages for this patient from same pharma
        messages = db.query(ChatMessage).join(User, ChatMessage.sender_id == User.user_id).filter(
            and_(
                ChatMessage.patient_id == patient_id,
                User.pharma_id == current_user_pharma_id
            )
        ).order_by(ChatMessage.created_at.asc()).all()
        
        # Mark messages as read for current user
        for message in messages:
            read_status = db.query(ChatReadStatus).filter(
                and_(
                    ChatReadStatus.message_id == message.id,
                    ChatReadStatus.user_id == current_user_id
                )
            ).first()
            
            if read_status and not read_status.is_read:
                read_status.is_read = True
                read_status.read_at = datetime.now(timezone.utc)
            elif not read_status:
                # Create read status if it doesn't exist
                new_read_status = ChatReadStatus(
                    message_id=message.id,
                    user_id=current_user_id,
                    is_read=True,
                    read_at=datetime.now(timezone.utc)
                )
                db.add(new_read_status)
        
        db.commit()
        
        # Build response
        message_responses = []
        for message in messages:
            # Get sender name
            sender = db.query(User).filter(User.user_id == message.sender_id).first()
            sender_name = f"{sender.first_name} {sender.last_name}" if sender else "Unknown"
            
            # Parse tagged user IDs
            tagged_user_ids = []
            if message.tagged_user_ids:
                try:
                    tagged_user_ids = json.loads(message.tagged_user_ids)
                except json.JSONDecodeError:
                    tagged_user_ids = []
            
            # Check if current user has read this message
            user_read_status = db.query(ChatReadStatus).filter(
                and_(
                    ChatReadStatus.message_id == message.id,
                    ChatReadStatus.user_id == current_user_id
                )
            ).first()
            
            is_read = user_read_status.is_read if user_read_status else False
            read_at = user_read_status.read_at if user_read_status and user_read_status.is_read else None
            
            message_responses.append(ChatMessageResponse(
                id=message.id,
                message_content=message.message_content,
                patient_id=message.patient_id,
                sender_id=message.sender_id,
                sender_name=sender_name,
                tagged_user_ids=tagged_user_ids,
                created_at=message.created_at,
                is_read=is_read,
                read_at=read_at
            ))
        
        return PatientMessagesResponse(
            patient_id=patient_id,
            patient_name=patient.patient_name,
            messages=message_responses,
            total_messages=len(message_responses),
            unread_count=0  # All messages are now read
        )
        
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to get patient messages: {str(e)}")
        if isinstance(e, (ChatPatientNotFoundException, ChatUserNotFoundException)):
            raise
        raise ChatMessageNotFoundException(f"Failed to get patient messages: {str(e)}")


def get_unread_messages(
    current_user_id: str,
    current_user_pharma_id: int,
    db: Session
) -> UnreadMessagesResponse:
    """Get all unread messages for the current user"""
    try:
        # Get all unread messages where user was tagged
        # Filter by patient's pharma_id, not sender's pharma_id
        # Users should see messages for patients in their pharma
        unread_messages = db.query(ChatMessage).join(
            ChatReadStatus, ChatMessage.id == ChatReadStatus.message_id
        ).join(
            Patient, ChatMessage.patient_id == Patient.id
        ).filter(
            and_(
                ChatReadStatus.user_id == current_user_id,
                ChatReadStatus.is_read == False,
                Patient.pharma_id == current_user_pharma_id
            )
        ).order_by(desc(ChatMessage.created_at)).all()
        
        # Build response
        unread_responses = []
        unread_by_patient = {}
        
        for message in unread_messages:
            # Get sender name
            sender = db.query(User).filter(User.user_id == message.sender_id).first()
            sender_name = f"{sender.first_name} {sender.last_name}" if sender else "Unknown"
            
            # Get patient name
            patient = db.query(Patient).filter(Patient.id == message.patient_id).first()
            patient_name = patient.patient_name if patient else "Unknown Patient"
            
            unread_responses.append(UnreadMessageResponse(
                message_id=message.id,
                message_content=message.message_content,
                patient_id=message.patient_id,
                patient_name=patient_name,
                sender_id=message.sender_id,
                sender_name=sender_name,
                created_at=message.created_at
            ))
            
            # Count by patient
            if message.patient_id in unread_by_patient:
                unread_by_patient[message.patient_id] += 1
            else:
                unread_by_patient[message.patient_id] = 1
        
        return UnreadMessagesResponse(
            unread_messages=unread_responses,
            total_unread=len(unread_responses),
            unread_by_patient=unread_by_patient
        )
        
    except Exception as e:
        logger.error(f"Failed to get unread messages: {str(e)}")
        if isinstance(e, ChatUserNotFoundException):
            raise
        raise ChatMessageNotFoundException(f"Failed to get unread messages: {str(e)}")
