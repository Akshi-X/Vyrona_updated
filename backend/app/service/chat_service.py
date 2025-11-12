import json
import logging
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from sqlalchemy import and_, or_, desc, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..config.database import SessionLocal

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
    ChatPharmaAccessDeniedException, ChatInvalidDataException,
    ChatException, ChatWebSocketInvalidTypeException
)
from ..constants.app_constants import (
    WS_MSG_TYPE_SUBSCRIBE_PATIENT, WS_MSG_TYPE_UNSUBSCRIBE_PATIENT,
    WS_MSG_TYPE_GET_PATIENT_MESSAGES, WS_MSG_TYPE_GET_UNREAD_MESSAGES,
    WS_MSG_TYPE_MARK_READ, WS_MSG_TYPE_PATIENT_MESSAGES,
    WS_MSG_TYPE_UNREAD_MESSAGES, WS_MSG_TYPE_SUCCESS, WS_MSG_TYPE_ERROR,
    WS_MSG_TYPE_NEW_MESSAGE
)
from ..constants.error_codes import ERROR_CODES
from ..constants.messages import ErrorMessages
from ..utils.chat_websocket_manager import ChatConnectionManager
from fastapi import WebSocketDisconnect
from ..dependencies.auth_dependencies import authenticate_websocket as default_auth

# Setup logger
logger = logging.getLogger(__name__)


async def broadcast_unread_messages_update(
    user_id: str,
    pharma_id: int,
    connection_manager,
    db: Session
):
    """Broadcast updated unread messages to all connections for a specific user"""
    try:
        unread_result = get_unread_messages(user_id, pharma_id, db)
        unread_payload = {
            "type": WS_MSG_TYPE_UNREAD_MESSAGES,
            "success": True,
            "data": unread_result.model_dump(mode='json')
        }
        
        # Send to all connections for this user
        disconnected = []
        for connection_id, conn_data in list(connection_manager.get_connections_by_pharma(pharma_id).items()):
            if conn_data.get("user_id") != user_id:
                continue
            
            websocket = conn_data.get("websocket")
            if not websocket or websocket.client_state.name != "CONNECTED":
                if not websocket:
                    disconnected.append(connection_id)
                continue
            
            try:
                await websocket.send_json(unread_payload)
            except Exception as e:
                logger.warning(f"Failed to send unread update to {connection_id}: {e}")
                disconnected.append(connection_id)
        
        for conn_id in disconnected:
            connection_manager.disconnect(conn_id)
    except Exception as e:
        logger.warning(f"Failed to broadcast unread messages update: {e}")


async def broadcast_new_message(
    result: ChatMessageCreateResponse,
    sender_pharma_id: int,
    connection_manager,
    db: Session
):
    """Broadcast new message to WebSocket connections and update unread messages"""
    try:
        # Note: Read status entries are only created for tagged users in create_chat_message
        # Subscribed users who are not tagged do NOT get read status entries (no unread tracking)
        
        message_broadcast = ChatMessageResponse(
            id=result.message_id,
            message_content=result.message_content,
            patient_id=result.patient_id,
            sender_id=result.sender_id,
            sender_name=result.sender_name,
            tagged_user_ids=result.tagged_user_ids,
            tagged_user_names=result.tagged_user_names,
            created_at=result.created_at,
            is_read=False,
            read_at=None
        )
        
        broadcast_payload = {
            "type": WS_MSG_TYPE_NEW_MESSAGE,
            "data": message_broadcast.model_dump(mode='json')
        }
        
        # Broadcast to all users subscribed to this patient (they can see the message)
        await connection_manager.broadcast_to_patient(
            result.patient_id,
            broadcast_payload,
            sender_pharma_id,
            db
        )
        
        # Send to tagged users (even if not subscribed to patient)
        if result.tagged_user_ids:
            for user_id in result.tagged_user_ids:
                await connection_manager.send_to_user(user_id, broadcast_payload)
        
        # Update unread messages ONLY for tagged users (they are the only ones with read status entries)
        try:
            if not result.tagged_user_ids:
                return  # No tagged users, no unread updates needed
            
            pharma_connections = connection_manager.get_connections_by_pharma(sender_pharma_id)
            if not pharma_connections:
                return
            
            # Only update unread counts for tagged users
            tagged_user_ids_set = set(result.tagged_user_ids)
            
            # Refresh the session to ensure we see the newly committed read status entries
            db.expire_all()
            
            disconnected = []
            for connection_id, conn_data in list(pharma_connections.items()):
                user_id = conn_data.get("user_id")
                # Only send unread update to tagged users
                if user_id not in tagged_user_ids_set:
                    continue
                
                websocket = conn_data.get("websocket")
                if not websocket or websocket.client_state.name != "CONNECTED":
                    if not websocket:
                        disconnected.append(connection_id)
                    continue
                
                try:
                    # Get unread messages (only includes messages where user was tagged)
                    unread_result = get_unread_messages(user_id, sender_pharma_id, db)
                    await websocket.send_json({
                        "type": WS_MSG_TYPE_UNREAD_MESSAGES,
                        "success": True,
                        "data": unread_result.model_dump(mode='json')
                    })
                except Exception as e:
                    logger.warning(f"Failed to send unread update to {connection_id}: {e}")
                    disconnected.append(connection_id)
            
            for conn_id in disconnected:
                connection_manager.disconnect(conn_id)
        except Exception as e:
            logger.warning(f"Failed to broadcast unread updates: {e}")
    except Exception as e:
        logger.error(f"Failed to broadcast message: {e}", exc_info=True)


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
            # Check if sender is trying to tag themselves
            if sender_id in request.tagged_user_ids:
                raise ChatInvalidDataException(
                    reason="User attempted to tag themselves",
                    custom_message=ErrorMessages.CHAT_CANNOT_TAG_SELF
                )
            
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
        # Always save tagged_user_ids as JSON string (even if empty list)
        # Use explicit None check, not truthiness check (empty list [] is falsy but should be saved as "[]")
        logger.info(f"create_chat_message - request.tagged_user_ids: {request.tagged_user_ids} (type: {type(request.tagged_user_ids)})")
        if request.tagged_user_ids is not None:
            tagged_user_ids_json = json.dumps(request.tagged_user_ids)
            logger.info(f"create_chat_message - Serialized tagged_user_ids: {tagged_user_ids_json}")
        else:
            tagged_user_ids_json = None
            logger.info(f"create_chat_message - tagged_user_ids is None, saving as None")
        
        chat_message = ChatMessage(
            message_content=request.message_content,
            patient_id=request.patient_id,
            sender_id=sender_id,
            tagged_user_ids=tagged_user_ids_json,
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
        
        # Get tagged user names
        tagged_user_names = []
        if request.tagged_user_ids:
            tagged_users = db.query(User).filter(User.user_id.in_(request.tagged_user_ids)).all()
            user_name_map = {user.user_id: f"{user.first_name} {user.last_name}" for user in tagged_users}
            tagged_user_names = [user_name_map.get(uid, "Unknown") for uid in request.tagged_user_ids]
        
        return ChatMessageCreateResponse(
            message_id=chat_message.id,
            patient_id=chat_message.patient_id,
            message_content=chat_message.message_content,
            sender_id=chat_message.sender_id,
            sender_name=sender_name,
            tagged_user_ids=request.tagged_user_ids,
            tagged_user_names=tagged_user_names if tagged_user_names else None,
            created_at=chat_message.created_at
        )
        
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to create chat message: {str(e)}")
        if isinstance(e, (ChatMessageCreateFailedException, ChatUserNotFoundException, 
                         ChatPatientNotFoundException, ChatPharmaAccessDeniedException)):
            raise
        raise ChatMessageCreateFailedException(f"Failed to create chat message: {str(e)}")


async def get_patient_messages(
    patient_id: str,
    current_user_id: str,
    current_user_pharma_id: int,
    db: Session,
    connection_manager=None,
    mark_as_read: bool = True
) -> PatientMessagesResponse:
    """Get all messages for a specific patient. Optionally mark them as read."""
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
        
        # Track if any messages were marked as read (to trigger broadcast)
        messages_marked_read = False
        
        if mark_as_read:
            # Mark all messages as read for current user
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
                    messages_marked_read = True
                elif not read_status:
                    # Create read status if it doesn't exist
                    new_read_status = ChatReadStatus(
                        message_id=message.id,
                        user_id=current_user_id,
                        is_read=True,
                        read_at=datetime.now(timezone.utc)
                    )
                    db.add(new_read_status)
                    messages_marked_read = True
            
            db.commit()
            
            # Broadcast updated unread messages if messages were marked as read and connection_manager is available
            if messages_marked_read and connection_manager:
                try:
                    await broadcast_unread_messages_update(
                        current_user_id,
                        current_user_pharma_id,
                        connection_manager,
                        db
                    )
                except Exception as e:
                    logger.warning(f"Failed to broadcast unread update after marking messages as read: {e}")
        
        # Build response
        message_responses = []
        for message in messages:
            # Get sender name
            sender = db.query(User).filter(User.user_id == message.sender_id).first()
            sender_name = f"{sender.first_name} {sender.last_name}" if sender else "Unknown"
            
            # Get read status for current user
            # Note: Read status only exists if user was tagged in this message
            # If no read status exists, user was not tagged, so message is not "unread" for them
            user_read_status = db.query(ChatReadStatus).filter(
                and_(
                    ChatReadStatus.message_id == message.id,
                    ChatReadStatus.user_id == current_user_id
                )
            ).first()
            
            # If no read status exists, user was not tagged - message is not tracked as unread
            # Set is_read based on whether read status exists
            if user_read_status:
                is_read = user_read_status.is_read
                read_at = user_read_status.read_at if user_read_status.is_read else None
            else:
                # User was not tagged - message is not in their unread tracking
                # For display purposes, we can consider it "read" (not unread)
                is_read = True
                read_at = None
            
            # Parse tagged_user_ids from JSON string
            tagged_user_ids = []
            tagged_user_names = []
            if message.tagged_user_ids:
                try:
                    tagged_user_ids = json.loads(message.tagged_user_ids)
                    # Get names for tagged users
                    if tagged_user_ids:
                        tagged_users = db.query(User).filter(User.user_id.in_(tagged_user_ids)).all()
                        user_name_map = {user.user_id: f"{user.first_name} {user.last_name}" for user in tagged_users}
                        tagged_user_names = [user_name_map.get(uid, "Unknown") for uid in tagged_user_ids]
                except (json.JSONDecodeError, TypeError):
                    tagged_user_ids = []
            
            message_responses.append(ChatMessageResponse(
                id=message.id,
                message_content=message.message_content,
                patient_id=message.patient_id,
                sender_id=message.sender_id,
                sender_name=sender_name,
                tagged_user_ids=tagged_user_ids,
                tagged_user_names=tagged_user_names if tagged_user_names else None,
                created_at=message.created_at,
                is_read=is_read,
                read_at=read_at
            ))
        
        # Get patient name for response
        patient_name = patient.patient_name if patient else None
        
        # Compute unread count for the current user and patient
        # Only counts messages where user was tagged (has read status entry)
        unread_count_query = db.query(func.count(ChatReadStatus.id)).join(
            ChatMessage, ChatReadStatus.message_id == ChatMessage.id
        ).filter(
            and_(
                ChatReadStatus.user_id == current_user_id,
                ChatReadStatus.is_read == False,
                ChatMessage.patient_id == patient_id
            )
        )
        unread_count = unread_count_query.scalar() or 0
        
        return PatientMessagesResponse(
            patient_id=patient_id,
            patient_name=patient_name,
            messages=message_responses,
            total_messages=len(message_responses),
            unread_count=unread_count
        )
        
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to get patient messages: {str(e)}", exc_info=True)
        # Re-raise known exceptions as-is
        if isinstance(e, (ChatPatientNotFoundException, ChatMessageNotFoundException, ChatMessageCreateFailedException)):
            raise
        # For unknown exceptions, raise ChatMessageCreateFailedException with proper context
        raise ChatMessageCreateFailedException(reason=f"Failed to get patient messages: {str(e)}")


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
        logger.error(f"Failed to get unread messages: {str(e)}", exc_info=True)
        # Re-raise known exceptions as-is
        if isinstance(e, (ChatUserNotFoundException, ChatMessageNotFoundException, ChatMessageCreateFailedException)):
            raise
        # For unknown exceptions, raise ChatMessageCreateFailedException with proper context
        # This is a generic chat operation failure, not specifically about creating messages
        raise ChatMessageCreateFailedException(reason=f"Failed to get unread messages: {str(e)}")


# ============================================
# WEBSOCKET MESSAGE HANDLERS
# ============================================

async def handle_websocket_message(
    message_data: Dict[str, Any],
    connection_id: str,
    current_user: User,
    pharma_id: int,
    connection_manager: ChatConnectionManager
) -> Dict[str, Any]:
    """
    Handle incoming WebSocket message and route to appropriate handler
    
    Returns response dict to send back to client
    """
    message_type = message_data.get("type")
    
    if not message_type:
        raise ChatWebSocketInvalidTypeException("Message type is required")
    
    try:
        if message_type == WS_MSG_TYPE_SUBSCRIBE_PATIENT:
            return await handle_subscribe_patient(
                message_data, connection_id, pharma_id, connection_manager
            )
        
        elif message_type == WS_MSG_TYPE_UNSUBSCRIBE_PATIENT:
            return await handle_unsubscribe_patient(
                message_data, connection_id, connection_manager
            )
        
        elif message_type == WS_MSG_TYPE_GET_PATIENT_MESSAGES:
            return await handle_get_patient_messages_ws(
                message_data, connection_id, current_user, pharma_id, connection_manager
            )
        
        elif message_type == WS_MSG_TYPE_GET_UNREAD_MESSAGES:
            return await handle_get_unread_messages_ws(
                current_user, pharma_id
            )
        
        elif message_type == WS_MSG_TYPE_MARK_READ:
            return await handle_mark_read_ws(
                message_data, current_user, pharma_id, connection_manager
            )
        
        else:
            raise ChatWebSocketInvalidTypeException(message_type=message_type)
    
    except ChatException as e:
        logger.error(f"Chat exception in WebSocket handler: {e}")
        return create_websocket_error_response(e)
    
    except Exception as e:
        logger.error(f"Unexpected error in WebSocket handler: {e}", exc_info=True)
        return create_websocket_error_response(
            ChatInvalidDataException(reason=str(e))
        )


async def handle_subscribe_patient(
    message_data: Dict[str, Any],
    connection_id: str,
    pharma_id: int,
    connection_manager: ChatConnectionManager
) -> Dict[str, Any]:
    """Handle subscribe to patient messages"""
    patient_id = message_data.get("patient_id")
    if not patient_id:
        raise ChatInvalidDataException("patient_id is required")
    
    with SessionLocal() as db:
        patient = db.query(Patient).filter(Patient.id == patient_id).first()
        if not patient:
            raise ChatInvalidDataException(f"Patient {patient_id} not found")
        patient_pharma_id = patient.pharma_id

    if patient_pharma_id != pharma_id:
        raise ChatInvalidDataException(f"Patient {patient_id} does not belong to your pharma")
    
    # Subscribe connection to patient
    connection_manager.subscribe_to_patient(connection_id, patient_id)
    
    return {
        "type": WS_MSG_TYPE_SUCCESS,
        "success": True,
        "message": f"Subscribed to patient {patient_id}",
        "data": {"patient_id": patient_id}
    }


async def handle_unsubscribe_patient(
    message_data: Dict[str, Any],
    connection_id: str,
    connection_manager: ChatConnectionManager
) -> Dict[str, Any]:
    """Handle unsubscribe from patient messages"""
    patient_id = message_data.get("patient_id")
    if not patient_id:
        raise ChatInvalidDataException("patient_id is required")
    
    connection_manager.unsubscribe_from_patient(connection_id, patient_id)
    
    return {
        "type": WS_MSG_TYPE_SUCCESS,
        "success": True,
        "message": f"Unsubscribed from patient {patient_id}",
        "data": {"patient_id": patient_id}
    }


async def handle_get_patient_messages_ws(
    message_data: Dict[str, Any],
    connection_id: str,
    current_user: User,
    pharma_id: int,
    connection_manager: ChatConnectionManager
) -> Dict[str, Any]:
    """Handle get patient messages request via WebSocket - does NOT mark as read"""
    patient_id = message_data.get("patient_id")
    if not patient_id:
        raise ChatInvalidDataException("patient_id is required")
    
    # Auto-subscribe to patient when fetching messages
    connection_manager.subscribe_to_patient(connection_id, patient_id)
    
    # Get messages without marking as read
    with SessionLocal() as db:
        result = await get_patient_messages(
            patient_id,
            current_user.user_id,
            pharma_id,
            db,
            connection_manager,
            mark_as_read=False
        )
    
    return {
        "type": WS_MSG_TYPE_PATIENT_MESSAGES,
        "success": True,
        "data": result.model_dump(mode='json')
    }


async def handle_get_unread_messages_ws(
    current_user: User,
    pharma_id: int
) -> Dict[str, Any]:
    """Handle get unread messages request via WebSocket"""
    with SessionLocal() as db:
        result = get_unread_messages(current_user.user_id, pharma_id, db)
    
    return {
        "type": WS_MSG_TYPE_UNREAD_MESSAGES,
        "success": True,
        "data": result.model_dump(mode='json')
    }


async def handle_mark_read_ws(
    message_data: Dict[str, Any],
    current_user: User,
    pharma_id: int,
    connection_manager: ChatConnectionManager
) -> Dict[str, Any]:
    """Handle mark messages as read via WebSocket - only marks as read if chat_read_status is true"""
    patient_id = message_data.get("patient_id")
    if not patient_id:
        raise ChatInvalidDataException("patient_id is required")
    
    # Check chat_read_status flag - only mark as read if explicitly true
    chat_read_status = message_data.get("chat_read_status")
    if isinstance(chat_read_status, str):
        mark_as_read = chat_read_status.lower() in ("true", "1", "yes", "y", "on")
    else:
        mark_as_read = bool(chat_read_status)
    
    if not mark_as_read:
        raise ChatInvalidDataException("chat_read_status must be true to mark messages as read")
    
    # Mark as read by fetching messages (service automatically marks as read and broadcasts unread update)
    with SessionLocal() as db:
        result = await get_patient_messages(
            patient_id,
            current_user.user_id,
            pharma_id,
            db,
            connection_manager,
            mark_as_read=True
        )
    
    return {
        "type": WS_MSG_TYPE_SUCCESS,
        "success": True,
        "message": f"Messages for patient {patient_id} marked as read",
        "data": {
            "patient_id": patient_id,
            "unread_count": result.unread_count
        }
    }


def create_websocket_error_response(exception: ChatException) -> Dict[str, Any]:
    """Create error response from exception for WebSocket"""
    return {
        "type": WS_MSG_TYPE_ERROR,
        "success": False,
        "error_code": exception.error_code,
        "message": exception.message,
        "details": exception.details if hasattr(exception, 'details') else {}
    }


async def handle_websocket_connection(
    websocket,
    token: str,
    patient_id: Optional[str],
    connection_manager: ChatConnectionManager,
    authenticate_websocket_func
):
    """Handle WebSocket connection lifecycle. Returns: (connection_id, current_user, pharma_id)"""
    connection_id = None
    current_user = None
    pharma_id = None
    
    try:
        # Accept WebSocket connection
        await websocket.accept()
        
        # Authenticate connection
        auth_func = authenticate_websocket_func or default_auth
        current_user, pharma_id = await auth_func(websocket, token)
        
        # Register connection
        connection_id = await connection_manager.connect(
            websocket, current_user.user_id, pharma_id
        )
        
        connection_response = {
            "type": "connection_confirmed",
            "success": True,
            "user_id": current_user.user_id,
            "pharma_id": pharma_id,
            "connection_id": connection_id,
            "patient_id": patient_id if patient_id else None
        }
        
        if patient_id:
            # With patient_id: send only patient messages
            with SessionLocal() as db:
                patient = db.query(Patient).filter(Patient.id == patient_id).first()
                if patient and patient.pharma_id == pharma_id:
                    connection_manager.subscribe_to_patient(connection_id, patient_id)
                    try:
                        result = await get_patient_messages(
                            patient_id,
                            current_user.user_id,
                            pharma_id,
                            db,
                            connection_manager,
                            mark_as_read=False
                        )
                        patient_payload = result.model_dump(mode='json')
                        connection_response["patient_messages"] = patient_payload
                        connection_response["unread_count"] = patient_payload.get("unread_count", 0)
                    except Exception as e:
                        logger.warning(f"Failed to fetch patient messages: {e}")
        else:
            # Without patient_id: send only unread messages
            try:
                with SessionLocal() as db:
                    unread_result = get_unread_messages(current_user.user_id, pharma_id, db)
                    unread_payload = unread_result.model_dump(mode='json')
                    connection_response["unread_messages"] = unread_payload
                    connection_response["unread_count"] = unread_payload.get("total_unread", 0)
            except Exception as e:
                logger.warning(f"Failed to fetch unread messages: {e}")
        
        await websocket.send_json(connection_response)
        
        return connection_id, current_user, pharma_id
        
    except ChatException as e:
        if websocket.client_state.name == "CONNECTED":
            await websocket.send_json({
                "type": WS_MSG_TYPE_ERROR,
                "success": False,
                "error_code": e.error_code,
                "message": e.message,
                "details": e.details if hasattr(e, 'details') else {}
            })
            await websocket.close()
        raise
    except Exception as e:
        logger.error(f"WebSocket connection error: {e}", exc_info=True)
        if websocket.client_state.name == "CONNECTED":
            try:
                await websocket.send_json({
                    "type": WS_MSG_TYPE_ERROR,
                    "success": False,
                    "error_code": ERROR_CODES.get("SERVER_ERROR", "ERR_00000"),
                    "message": ErrorMessages.INTERNAL_ERROR if hasattr(ErrorMessages, 'INTERNAL_ERROR') else "Internal server error",
                    "details": {"reason": str(e)}
                })
                await websocket.close()
            except:
                pass
            raise


async def handle_websocket_message_loop(
    websocket,
    connection_id: str,
    current_user: User,
    pharma_id: int,
    connection_manager: ChatConnectionManager
):
    """Handle WebSocket message loop"""
    while True:
        try:
            message_text = await websocket.receive_text()
            try:
                message_data = json.loads(message_text)
            except json.JSONDecodeError as e:
                await websocket.send_json({
                    "type": WS_MSG_TYPE_ERROR,
                    "success": False,
                    "error_code": ERROR_CODES["CHAT_WEBSOCKET_INVALID_MESSAGE"],
                    "message": ErrorMessages.CHAT_WEBSOCKET_INVALID_MESSAGE,
                    "details": {"reason": str(e)}
                })
                continue
            
            response = await handle_websocket_message(
                message_data,
                connection_id,
                current_user,
                pharma_id,
                connection_manager
            )
            
            if response:
                await websocket.send_json(response)
        
        except WebSocketDisconnect:
            break
        except Exception as e:
            logger.error(f"Error processing WebSocket message: {e}", exc_info=True)
            try:
                await websocket.send_json({
                    "type": WS_MSG_TYPE_ERROR,
                    "success": False,
                    "error_code": ERROR_CODES.get("SERVER_ERROR", "ERR_00000"),
                    "message": ErrorMessages.INTERNAL_ERROR if hasattr(ErrorMessages, 'INTERNAL_ERROR') else "Internal server error",
                    "details": {"reason": str(e)}
                })
            except:
                pass
