import json
import logging
import time
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any, Set
from sqlalchemy import and_, or_, desc, func, exists
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..config.database import SessionLocal

from ..models.chat_model import ChatMessage
from ..models.chat_read_status import ChatReadStatus
from ..models.chat_read_status_canister import ChatReadStatusCanister
from ..models.chat_message_tag import ChatMessageTag
from ..models.user_model import User
from ..models.patient_model import Patient
from ..models.pharma_model import Pharma
from ..models.IVF.tank_model import Tank
from ..schemas.chat_schema import (
    ChatMessageCreateRequest, ChatMessageCreateResponse, ChatMessageResponse,
    PatientMessagesResponse, UnreadMessageResponse, UnreadMessagesResponse
)
from ..exceptions.custom_exceptions import (
    ChatMessageCreateFailedException, ChatMessageNotFoundException,
    ChatUserNotFoundException, ChatPatientNotFoundException,
    ChatPharmaAccessDeniedException, ChatInvalidDataException,
    ChatException, ChatWebSocketInvalidTypeException,
    ChatWebSocketAuthFailedException
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


# ============================================
# HELPER FUNCTIONS
# ============================================

def get_or_create_read_status(user_id: str, patient_id: str, db: Session) -> ChatReadStatus:
    """
    Get or create read status entry for user-patient combination.
    Uses lazy creation - only creates entry when needed.
    Optimized: tries to get existing first, creates only if needed.
    
    Returns ChatReadStatus with last_read_message_id (NULL if never read)
    """
    # Try to get existing read status first (most common case)
    read_status = db.query(ChatReadStatus).filter(
        ChatReadStatus.user_id == user_id,
        ChatReadStatus.patient_id == patient_id
    ).first()
    
    if not read_status:
        # Create with last_read_message_id = NULL (never read)
        read_status = ChatReadStatus(
            user_id=user_id,
            patient_id=patient_id,
            last_read_message_id=None  # NULL = never read
        )
        db.add(read_status)
        db.flush()  # Get the object but don't commit yet
    
    return read_status


def get_patient_unread_count(user_id: str, patient_id: str, db: Session) -> int:
    """
    Get unread count for ALL messages in patient dashboard.
    Counts messages where id > last_read_message_id.
    """
    read_status = get_or_create_read_status(user_id, patient_id, db)
    last_read_id = read_status.last_read_message_id or 0
    
    # Count all messages after last_read
    unread_count = db.query(func.count(ChatMessage.id)).filter(
        ChatMessage.patient_id == patient_id,
        ChatMessage.id > last_read_id
    ).scalar() or 0
    
    return unread_count


def get_tagged_unread_count(user_id: str, patient_id: str, db: Session) -> int:
    """
    Get unread count for TAGGED messages only (for home screen notifications).
    Counts only messages where user was tagged AND id > last_read_message_id.
    """
    read_status = get_or_create_read_status(user_id, patient_id, db)
    last_read_id = read_status.last_read_message_id or 0
    
    # Priority 5: Use junction table for efficient query
    tagged_count = db.query(func.count(ChatMessageTag.message_id)).join(
        ChatMessage, ChatMessageTag.message_id == ChatMessage.id
    ).filter(
        ChatMessage.patient_id == patient_id,
        ChatMessageTag.user_id == user_id,
        ChatMessage.id > last_read_id
    ).scalar() or 0
    
    # Fallback: Also check JSON field for backward compatibility (during migration period)
    if tagged_count == 0:
        messages = db.query(ChatMessage).filter(
            ChatMessage.patient_id == patient_id,
            ChatMessage.tagged_user_ids.isnot(None),
            ChatMessage.id > last_read_id
        ).all()
        
        for msg in messages:
            if msg.tagged_user_ids:
                try:
                    tagged_ids = json.loads(msg.tagged_user_ids)
                    if isinstance(tagged_ids, list) and user_id in tagged_ids:
                        tagged_count += 1
                except (json.JSONDecodeError, TypeError):
                    continue
    
    return tagged_count


def mark_patient_as_read(user_id: str, patient_id: str, db: Session) -> int:
    """
    Mark all messages for a patient as read by updating last_read_message_id to latest.
    Returns the latest message ID that was set.
    """
    # Get latest message ID for patient
    latest_message = db.query(func.max(ChatMessage.id)).filter(
        ChatMessage.patient_id == patient_id
    ).scalar()
    
    if latest_message is None:
        # No messages for this patient
        latest_message = 0
    
    # Get or create read status
    read_status = get_or_create_read_status(user_id, patient_id, db)
    read_status.last_read_message_id = latest_message
    read_status.updated_at = datetime.now(timezone.utc)
    
    db.commit()
    
    return latest_message


# ============================================
# CANISTER-LEVEL HELPER FUNCTIONS (IVF FLOW)
# ============================================

def get_or_create_read_status_canister(user_id: str, tank_id: int, db: Session) -> ChatReadStatusCanister:
    """
    Get or create read status entry for user-tank combination (IVF flow).
    Uses lazy creation - only creates entry when needed.
    
    Returns ChatReadStatusCanister with last_read_message_id (NULL if never read)
    """
    # Try to get existing read status first (most common case)
    read_status = db.query(ChatReadStatusCanister).filter(
        ChatReadStatusCanister.user_id == user_id,
        ChatReadStatusCanister.tank_id == tank_id
    ).first()
    
    if not read_status:
        # Create with last_read_message_id = NULL (never read)
        read_status = ChatReadStatusCanister(
            user_id=user_id,
            tank_id=tank_id,
            last_read_message_id=None  # NULL = never read
        )
        db.add(read_status)
        db.flush()  # Get the object but don't commit yet
    
    return read_status


def get_canister_unread_count(user_id: str, tank_id: int, db: Session) -> int:
    """
    Get unread count for ALL messages in tank dashboard (IVF flow).
    Counts messages where id > last_read_message_id.
    """
    read_status = get_or_create_read_status_canister(user_id, tank_id, db)
    last_read_id = read_status.last_read_message_id or 0
    
    # Count all messages after last_read
    unread_count = db.query(func.count(ChatMessage.id)).filter(
        ChatMessage.tank_id == tank_id,
        ChatMessage.id > last_read_id
    ).scalar() or 0
    
    return unread_count


def mark_canister_as_read(user_id: str, tank_id: int, db: Session) -> int:
    """
    Mark all messages for a tank as read by updating last_read_message_id to latest (IVF flow).
    Returns the latest message ID that was set.
    """
    # Get latest message ID for tank (None when no messages exist)
    latest_message = db.query(func.max(ChatMessage.id)).filter(
        ChatMessage.tank_id == tank_id
    ).scalar()

    # Get or create read status
    read_status = get_or_create_read_status_canister(user_id, tank_id, db)
    # Assign directly; None when no messages exist, keeping FK constraint valid
    read_status.last_read_message_id = latest_message
    read_status.updated_at = datetime.now(timezone.utc)

    db.commit()

    # Return 0 in API when no messages exist
    return latest_message or 0


async def broadcast_unread_messages_update(
    user_id: str,
    pharma_id: Optional[int],
    connection_manager,
    db: Session
):
    """Broadcast updated unread messages to all connections for a specific user"""
    try:
        unread_result = get_unread_messages(user_id, pharma_id, db)
        unread_payload = {
            "type": WS_MSG_TYPE_UNREAD_MESSAGES,
            "success": True,
            "data": unread_result.model_dump(mode='json', exclude_none=False, exclude_unset=False)
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
    finally:
        # Close database session if it was created for this function
        if db:
            try:
                db.close()
            except Exception:
                pass


async def broadcast_new_message(
    result: ChatMessageCreateResponse,
    sender_pharma_id: Optional[int],
    connection_manager,
    db_session_factory=SessionLocal
):
    """Broadcast new message to WebSocket connections and update unread messages"""
    db = None
    try:
        db = db_session_factory()
        # Note: Read status entries are only created for tagged users in create_chat_message
        # Subscribed users who are not tagged do NOT get read status entries (no unread tracking)
        
        message_broadcast = ChatMessageResponse(
            id=result.message_id,
            message_content=result.message_content,
            patient_id=result.patient_id,
            tank_code=result.tank_code,
            sender_id=result.sender_id,
            sender_name=result.sender_name,
            sender_role=result.sender_role,
            tagged_user_ids=result.tagged_user_ids,
            tagged_user_names=result.tagged_user_names,
            created_at=result.created_at,
            is_read=False,
            read_at=None
        )
        
        broadcast_payload = {
            "type": WS_MSG_TYPE_NEW_MESSAGE,
            "data": message_broadcast.model_dump(mode='json', exclude_none=False, exclude_unset=False)
        }
        
        # Broadcast to all users subscribed to this patient (CGT) or canister (IVF)
        if result.patient_id:
            # CGT flow: broadcast to patient subscribers
            await connection_manager.broadcast_to_patient(
                result.patient_id,
                broadcast_payload,
                sender_pharma_id,
                db
            )
        elif result.tank_code:
            # IVF flow: broadcast to tank subscribers (handled via websocket manager)
            # The websocket manager already supports tank_code broadcasting
            pass  # Will be handled by existing tank subscription logic
        
        # Send to tagged users (even if not subscribed to patient)
        if result.tagged_user_ids:
            for user_id in result.tagged_user_ids:
                await connection_manager.send_to_user(user_id, broadcast_payload)
        
        # Update unread messages for tagged users (home screen notifications)
        try:
            if not result.tagged_user_ids:
                return  # No tagged users, no unread updates needed
            
            # For hospital users, sender_pharma_id is None - skip pharma-based connection filtering
            # Connection manager should handle hospital users separately if needed
            if sender_pharma_id is not None:
                pharma_connections = connection_manager.get_connections_by_pharma(sender_pharma_id)
                if not pharma_connections:
                    return
            else:
                # Hospital user - skip unread updates via pharma connections
                # TODO: Implement hospital-based connection filtering if needed
                return
            
            # Only update unread counts for tagged users
            tagged_user_ids_set = set(result.tagged_user_ids)
            unread_payload_cache: Dict[str, Dict[str, Any]] = {}
            
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
                    # Get unread messages (only includes tagged messages for home screen)
                    if user_id not in unread_payload_cache:
                        unread_result = get_unread_messages(user_id, sender_pharma_id, db)
                        unread_payload_cache[user_id] = unread_result.model_dump(mode='json', exclude_none=False, exclude_unset=False)
                    payload = unread_payload_cache[user_id]
                    await websocket.send_json({
                        "type": WS_MSG_TYPE_UNREAD_MESSAGES,
                        "success": True,
                        "data": payload
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
    finally:
        if db:
            db.close()


def create_chat_message(
    request: ChatMessageCreateRequest,
    sender_id: str,
    sender_pharma_id: Optional[int],
    sender_hospital_id: Optional[int],
    sender_name: str,
    sender_role: Optional[str],
    db: Session
) -> ChatMessageCreateResponse:
    """Create a new chat message"""
    func_start = time.time()
    try:
        # Skip patient validation - let foreign key constraint handle it for performance
        # The patient_id comes from frontend (user-selected) and FK will catch invalid IDs
        # This saves ~435ms per request
        patient_check_time = 0
        
        # Validate tagged users are in same pharma (CGT) or same hospital (IVF)
        tagged_user_names = []
        tagged_users_time = 0
        if request.tagged_user_ids is None:
            normalized_tagged_user_ids: List[str] | None = None
        else:
            # Remove duplicates but preserve the original order to avoid redundant DB work
            normalized_tagged_user_ids = list(dict.fromkeys(request.tagged_user_ids))

        if normalized_tagged_user_ids:
            # Check if sender is trying to tag themselves (fast check, no DB)
            if sender_id in normalized_tagged_user_ids:
                raise ChatInvalidDataException(
                    reason="User attempted to tag themselves",
                    custom_message=ErrorMessages.CHAT_CANNOT_TAG_SELF
                )
            
            # Fetch tagged users - optimized query based on count
            tagged_start = time.time()
            
            # For hospital users (IVF), validate by hospital_id
            # For pharma users (CGT), validate by pharma_id
            if sender_hospital_id is not None:
                # Hospital user (IVF) - validate tagged users are in same hospital
                if len(normalized_tagged_user_ids) == 1:
                    user_id = normalized_tagged_user_ids[0]
                    user_exists = db.query(
                        exists().where(
                            and_(
                                User.user_id == user_id,
                                User.hospital_id == sender_hospital_id
                            )
                        )
                    ).scalar()
                    
                    if not user_exists:
                        user_exists_anywhere = db.query(
                            exists().where(User.user_id == user_id)
                        ).scalar()
                        if not user_exists_anywhere:
                            raise ChatUserNotFoundException("One or more tagged users not found")
                        else:
                            raise ChatPharmaAccessDeniedException("One or more tagged users are not in the same hospital as sender")
                    
                    user_data = db.query(
                        User.user_id,
                        User.first_name,
                        User.last_name,
                        User.hospital_id
                    ).filter(
                        User.user_id == user_id,
                        User.hospital_id == sender_hospital_id
                    ).first()
                    tagged_users_data = [user_data] if user_data else []
                else:
                    tagged_users_data = db.query(
                        User.user_id,
                        User.first_name,
                        User.last_name,
                        User.hospital_id
                    ).filter(
                        User.user_id.in_(normalized_tagged_user_ids),
                        User.hospital_id == sender_hospital_id
                    ).all()
                    
                    if len(tagged_users_data) != len(normalized_tagged_user_ids):
                        found_user_ids = {u.user_id for u in tagged_users_data}
                        missing_user_ids = set(normalized_tagged_user_ids) - found_user_ids
                        if missing_user_ids:
                            raise ChatUserNotFoundException("One or more tagged users not found")
                        raise ChatPharmaAccessDeniedException("One or more tagged users are not in the same hospital as sender")
            elif sender_pharma_id is not None:
                # Pharma user (CGT) - validate tagged users are in same pharma
                # Priority 2 Optimization: Use EXISTS for single user (faster than IN)
                if len(normalized_tagged_user_ids) == 1:
                    # Single user - use EXISTS for faster execution
                    user_id = normalized_tagged_user_ids[0]
                    user_exists = db.query(
                        exists().where(
                            and_(
                                User.user_id == user_id,
                                User.pharma_id == sender_pharma_id
                            )
                        )
                    ).scalar()
                    
                    if not user_exists:
                        # Check if user exists at all or just wrong pharma
                        user_exists_anywhere = db.query(
                            exists().where(User.user_id == user_id)
                        ).scalar()
                        if not user_exists_anywhere:
                            raise ChatUserNotFoundException("One or more tagged users not found")
                        else:
                            raise ChatPharmaAccessDeniedException("One or more tagged users are not in the same pharma as sender")
                    
                    # Fetch user data for name
                    user_data = db.query(
                        User.user_id,
                        User.first_name,
                        User.last_name,
                        User.pharma_id
                    ).filter(
                        User.user_id == user_id,
                        User.pharma_id == sender_pharma_id
                    ).first()
                    
                    tagged_users_data = [user_data] if user_data else []
                else:
                    # Multiple users - use IN clause (now optimized with composite index)
                    tagged_users_data = db.query(
                        User.user_id,
                        User.first_name,
                        User.last_name,
                        User.pharma_id
                    ).filter(
                        User.user_id.in_(normalized_tagged_user_ids),
                        User.pharma_id == sender_pharma_id  # Filter by pharma_id in query (faster than Python loop)
                    ).all()
                    
                    if len(tagged_users_data) != len(normalized_tagged_user_ids):
                        found_user_ids = {u.user_id for u in tagged_users_data}
                        missing_user_ids = set(normalized_tagged_user_ids) - found_user_ids
                        if missing_user_ids:
                            raise ChatUserNotFoundException("One or more tagged users not found")
                        raise ChatPharmaAccessDeniedException("One or more tagged users are not in the same pharma as sender")
            else:
                # Neither pharma_id nor hospital_id - should not happen, but handle gracefully
                raise ChatInvalidDataException(
                    reason="User must belong to either a pharma or hospital",
                    custom_message="Invalid user configuration"
                )
            
            tagged_users_time = time.time() - tagged_start
            
            # Build user name map from fetched data (before commit)
            user_name_map = {user_data.user_id: f"{user_data.first_name} {user_data.last_name}" for user_data in tagged_users_data}
            tagged_user_names = [user_name_map.get(uid, "Unknown") for uid in normalized_tagged_user_ids]
        else:
            tagged_users_time = 0
        
        # Create chat message
        # Always save tagged_user_ids as JSON string (even if empty list)
        # Use explicit None check, not truthiness check (empty list [] is falsy but should be saved as "[]")
        if request.tagged_user_ids is not None:
            tagged_user_ids_json = json.dumps(normalized_tagged_user_ids or [])
        else:
            tagged_user_ids_json = None
        
        # Resolve tank_code to tank_id if provided (for IVF flow)
        tank_id = None
        if request.tank_code:
            tank = db.query(Tank).filter(Tank.tank_code == request.tank_code).first()
            if not tank:
                raise ChatPatientNotFoundException(f"Tank with code '{request.tank_code}' not found")
            tank_id = tank.tank_id
        
        insert_start = time.time()
        chat_message = ChatMessage(
            message_content=request.message_content,
            patient_id=request.patient_id,
            tank_id=tank_id,
            sender_id=sender_id,
            tagged_user_ids=tagged_user_ids_json,
            created_by=sender_id
        )
        
        db.add(chat_message)
        db.flush()  # Get the ID without committing
        insert_time = time.time() - insert_start
        
        # Priority 5: Insert tagged users into junction table (normalized structure)
        if normalized_tagged_user_ids:
            tags_start = time.time()
            tags = [
                ChatMessageTag(
                    message_id=chat_message.id,
                    user_id=user_id
                )
                for user_id in normalized_tagged_user_ids
            ]
            db.bulk_save_objects(tags)
            db.flush()  # Flush tags before commit
            tags_time = time.time() - tags_start
        else:
            tags_time = 0
        
        # Mark sender as read (auto-read for sender when they send a message)
        # This is the only auto-mark case - when user sends a message, they've seen it
        read_status_start = time.time()
        if request.patient_id:
            # CGT flow: use patient read status
            sender_read_status = get_or_create_read_status(sender_id, request.patient_id, db)
            sender_read_status.last_read_message_id = chat_message.id
            sender_read_status.updated_at = datetime.now(timezone.utc)
        elif tank_id:
            # IVF flow: use tank read status
            sender_read_status = get_or_create_read_status_canister(sender_id, tank_id, db)
            sender_read_status.last_read_message_id = chat_message.id
            sender_read_status.updated_at = datetime.now(timezone.utc)
        read_status_time = time.time() - read_status_start
        
        # Note: Tagged users don't get read status entries created here
        # They will be created lazily when they first view the patient or check unread messages
        # Unread count is calculated by comparing message.id > last_read_message_id
        # Other users must explicitly mark as read via frontend actions
        
        commit_start = time.time()
        db.commit()
        commit_time = time.time() - commit_start
        
        # Get tank_code for response if tank_id exists
        tank_code = None
        if tank_id:
            tank = db.query(Tank).filter(Tank.tank_id == tank_id).first()
            if tank:
                tank_code = tank.tank_code
        
        response_start = time.time()
        result = ChatMessageCreateResponse(
            message_id=chat_message.id,
            patient_id=chat_message.patient_id,
            tank_code=tank_code,
            message_content=chat_message.message_content,
            sender_id=chat_message.sender_id,
            sender_name=sender_name,
            sender_role=sender_role,
            tagged_user_ids=normalized_tagged_user_ids,
            tagged_user_names=tagged_user_names if tagged_user_names else None,
            created_at=chat_message.created_at
        )
        response_time = time.time() - response_start
        total_time = time.time() - func_start
        
        logger.info(f"[PERF] create_chat_message breakdown - Total: {total_time:.3f}s | Patient check: {patient_check_time:.3f}s | Tagged users: {tagged_users_time:.3f}s | Insert: {insert_time:.3f}s | Tags: {tags_time:.3f}s | Read status: {read_status_time:.3f}s | Commit: {commit_time:.3f}s | Response: {response_time:.3f}s")
        
        return result
        
    except IntegrityError as e:
        db.rollback()
        # Check if it's a foreign key constraint violation (patient doesn't exist)
        error_str = str(e).lower()
        if 'patient' in error_str or 'foreign key' in error_str:
            raise ChatPatientNotFoundException(f"Patient with ID {request.patient_id} not found")
        logger.error(f"Database integrity error creating chat message: {str(e)}")
        raise ChatMessageCreateFailedException(f"Failed to create chat message: {str(e)}")
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
    mark_as_read: bool = False
) -> PatientMessagesResponse:
    """
    Get all messages for a specific patient.
    Does NOT mark as read by default - frontend must explicitly call mark_as_read endpoint.
    """
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
        
        message_ids: List[int] = [message.id for message in messages]
        sender_ids: Set[str] = {message.sender_id for message in messages if message.sender_id}
        
        # Priority 5: Use junction table instead of parsing JSON
        # Get all tags for these messages from junction table
        tags = db.query(ChatMessageTag).filter(
            ChatMessageTag.message_id.in_(message_ids)
        ).all()
        
        # Build tagged user IDs map from junction table
        parsed_tagged_user_ids: Dict[int, List[str]] = {msg_id: [] for msg_id in message_ids}
        all_tagged_user_ids: Set[str] = set()
        
        for tag in tags:
            if tag.message_id not in parsed_tagged_user_ids:
                parsed_tagged_user_ids[tag.message_id] = []
            parsed_tagged_user_ids[tag.message_id].append(tag.user_id)
            all_tagged_user_ids.add(tag.user_id)
        
        # Fallback: Also check JSON field for backward compatibility (during migration period)
        for message in messages:
            if message.id not in parsed_tagged_user_ids:
                parsed_tagged_user_ids[message.id] = []
            if message.tagged_user_ids and len(parsed_tagged_user_ids[message.id]) == 0:
                try:
                    parsed_ids = json.loads(message.tagged_user_ids)
                    if isinstance(parsed_ids, list):
                        parsed_tagged_user_ids[message.id] = parsed_ids
                        all_tagged_user_ids.update(parsed_ids)
                except (json.JSONDecodeError, TypeError):
                    pass
        
        sender_map: Dict[str, Dict[str, Optional[str]]] = {}
        if sender_ids:
            senders = db.query(User).filter(User.user_id.in_(sender_ids)).all()
            sender_map = {
                user.user_id: {
                    "name": f"{user.first_name} {user.last_name}",
                    "role": user.role.value if user.role else None
                }
                for user in senders
            }
        
        tagged_user_map: Dict[str, str] = {}
        if all_tagged_user_ids:
            tagged_users = db.query(User).filter(User.user_id.in_(all_tagged_user_ids)).all()
            tagged_user_map = {
                user.user_id: f"{user.first_name} {user.last_name}"
                for user in tagged_users
            }
        
        # Get or create read status for this user-patient combination
        read_status = get_or_create_read_status(current_user_id, patient_id, db)
        last_read_id = read_status.last_read_message_id or 0
        
        # Track if messages were marked as read (to trigger broadcast)
        messages_marked_read = False
        
        if mark_as_read and messages:
            # Mark all messages as read by updating last_read_message_id to latest message
            latest_message_id = max([msg.id for msg in messages])
            
            # Only update if there are new messages to mark as read
            if latest_message_id > last_read_id:
                read_status.last_read_message_id = latest_message_id
                read_status.updated_at = datetime.now(timezone.utc)
                db.commit()
                messages_marked_read = True
                
                # Broadcast updated unread messages if connection_manager is available
                if connection_manager:
                    try:
                        await broadcast_unread_messages_update(
                            current_user_id,
                            current_user_pharma_id,
                            connection_manager,
                            db
                        )
                    except Exception as e:
                        logger.warning(f"Failed to broadcast unread update after marking messages as read: {e}")
        
        # Refresh read_status after potential update
        db.refresh(read_status)
        last_read_id = read_status.last_read_message_id or 0
        
        # Build response
        message_responses = []
        for message in messages:
            sender_info = sender_map.get(message.sender_id, {"name": "Unknown", "role": None})
            sender_name = sender_info["name"]
            sender_role = sender_info["role"]
            
            # Determine if message is read: message.id <= last_read_message_id
            # Read status is maintained in chat_read_status table (last_read_message_id)
            # Frontend can derive was_unread = !is_read for unread separator bar
            is_read = message.id <= last_read_id
            read_at = read_status.updated_at if is_read else None
            
            tagged_user_ids = parsed_tagged_user_ids.get(message.id, [])
            tagged_user_names = [
                tagged_user_map.get(uid, "Unknown")
                for uid in tagged_user_ids
            ] if tagged_user_ids else []
            
            # Get tank_code for message if tank_id exists (IVF flow)
            msg_tank_code = None
            if message.tank_id:
                msg_tank = db.query(Tank).filter(Tank.tank_id == message.tank_id).first()
                if msg_tank:
                    msg_tank_code = msg_tank.tank_code
            
            message_responses.append(ChatMessageResponse(
                id=message.id,
                message_content=message.message_content,
                patient_id=message.patient_id,
                tank_code=msg_tank_code,
                sender_id=message.sender_id,
                sender_name=sender_name,
                sender_role=sender_role,
                tagged_user_ids=tagged_user_ids,
                tagged_user_names=tagged_user_names if tagged_user_names else None,
                created_at=message.created_at,
                is_read=is_read,
                read_at=read_at
            ))
        
        # Get patient name for response
        patient_name = patient.patient_name if patient else None
        
        # Compute unread count for the current user and patient (ALL messages)
        unread_count = get_patient_unread_count(current_user_id, patient_id, db)
        
        return PatientMessagesResponse(
            patient_id=patient_id,
            canister_number=None,
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
    finally:
        # Explicit rollback ensures the transaction ends even after successful reads
        try:
            db.rollback()
        except Exception:
            pass


async def get_canister_messages(
    tank_id: int,
    current_user_id: str,
    current_user_pharma_id: Optional[int],
    current_user_hospital_id: Optional[int],
    db: Session,
    connection_manager=None,
    mark_as_read: bool = False
) -> PatientMessagesResponse:
    """
    Get all messages for a specific tank (IVF flow).
    Does NOT mark as read by default - frontend must explicitly call mark_as_read endpoint.
    
    For hospital users (IVF): filters by hospital_id
    For pharma users: filters by pharma_id (if provided)
    """
    try:
        tank = db.query(Tank).filter(Tank.tank_id == tank_id).first()
        if not tank:
            raise ChatPatientNotFoundException(f"Tank with id '{tank_id}' not found")
        
        # Get all messages for this tank
        # For hospital users (IVF), filter by hospital_id
        # For pharma users, filter by pharma_id
        if current_user_hospital_id is not None:
            # Hospital user (IVF) - filter by hospital_id
            messages = db.query(ChatMessage).join(User, ChatMessage.sender_id == User.user_id).filter(
                and_(
                    ChatMessage.tank_id == tank_id,
                    User.hospital_id == current_user_hospital_id
                )
            ).order_by(ChatMessage.created_at.asc()).all()
        elif current_user_pharma_id is not None:
            # Pharma user - filter by pharma_id
            messages = db.query(ChatMessage).join(User, ChatMessage.sender_id == User.user_id).filter(
                and_(
                    ChatMessage.tank_id == tank_id,
                    User.pharma_id == current_user_pharma_id
                )
            ).order_by(ChatMessage.created_at.asc()).all()
        else:
            # Fallback: no filtering (should not happen, but handle gracefully)
            messages = db.query(ChatMessage).filter(
                ChatMessage.tank_id == tank_id
            ).order_by(ChatMessage.created_at.asc()).all()
        
        message_ids: List[int] = [message.id for message in messages]
        sender_ids: Set[str] = {message.sender_id for message in messages if message.sender_id}
        
        # Priority 5: Use junction table instead of parsing JSON
        # Get all tags for these messages from junction table
        tags = db.query(ChatMessageTag).filter(
            ChatMessageTag.message_id.in_(message_ids)
        ).all()
        
        # Build tagged user IDs map from junction table
        parsed_tagged_user_ids: Dict[int, List[str]] = {msg_id: [] for msg_id in message_ids}
        all_tagged_user_ids: Set[str] = set()
        
        for tag in tags:
            if tag.message_id not in parsed_tagged_user_ids:
                parsed_tagged_user_ids[tag.message_id] = []
            parsed_tagged_user_ids[tag.message_id].append(tag.user_id)
            all_tagged_user_ids.add(tag.user_id)
        
        # Fallback: Also check JSON field for backward compatibility (during migration period)
        for message in messages:
            if message.id not in parsed_tagged_user_ids:
                parsed_tagged_user_ids[message.id] = []
            if message.tagged_user_ids and len(parsed_tagged_user_ids[message.id]) == 0:
                try:
                    parsed_ids = json.loads(message.tagged_user_ids)
                    if isinstance(parsed_ids, list):
                        parsed_tagged_user_ids[message.id] = parsed_ids
                        all_tagged_user_ids.update(parsed_ids)
                except (json.JSONDecodeError, TypeError):
                    pass
        
        sender_map: Dict[str, Dict[str, Optional[str]]] = {}
        if sender_ids:
            senders = db.query(User).filter(User.user_id.in_(sender_ids)).all()
            sender_map = {
                user.user_id: {
                    "name": f"{user.first_name} {user.last_name}",
                    "role": user.role.value if user.role else None
                }
                for user in senders
            }
        
        tagged_user_map: Dict[str, str] = {}
        if all_tagged_user_ids:
            tagged_users = db.query(User).filter(User.user_id.in_(all_tagged_user_ids)).all()
            tagged_user_map = {
                user.user_id: f"{user.first_name} {user.last_name}"
                for user in tagged_users
            }
        
        # Get or create read status for this user-tank combination
        read_status = get_or_create_read_status_canister(current_user_id, tank_id, db)
        last_read_id = read_status.last_read_message_id or 0
        
        # Track if messages were marked as read (to trigger broadcast)
        messages_marked_read = False
        
        if mark_as_read and messages:
            # Mark all messages as read by updating last_read_message_id to latest message
            latest_message_id = max([msg.id for msg in messages])
            
            # Only update if there are new messages to mark as read
            if latest_message_id > last_read_id:
                read_status.last_read_message_id = latest_message_id
                read_status.updated_at = datetime.now(timezone.utc)
                db.commit()
                messages_marked_read = True
                
                # Broadcast updated unread messages if connection_manager is available
                if connection_manager:
                    try:
                        await broadcast_unread_messages_update(
                            current_user_id,
                            current_user_pharma_id,
                            connection_manager,
                            db
                        )
                    except Exception as e:
                        logger.warning(f"Failed to broadcast unread update after marking messages as read: {e}")
        
        # Refresh read_status after potential update
        db.refresh(read_status)
        last_read_id = read_status.last_read_message_id or 0
        
        # Build response
        message_responses = []
        for message in messages:
            sender_info = sender_map.get(message.sender_id, {"name": "Unknown", "role": None})
            sender_name = sender_info["name"]
            sender_role = sender_info["role"]
            
            # Determine if message is read: message.id <= last_read_message_id
            is_read = message.id <= last_read_id
            read_at = read_status.updated_at if is_read else None
            
            tagged_user_ids = parsed_tagged_user_ids.get(message.id, [])
            tagged_user_names = [
                tagged_user_map.get(uid, "Unknown")
                for uid in tagged_user_ids
            ] if tagged_user_ids else []
            
            # Get tank_code for message if tank_id exists
            msg_tank_code = None
            if message.tank_id:
                msg_tank = db.query(Tank).filter(Tank.tank_id == message.tank_id).first()
                if msg_tank:
                    msg_tank_code = msg_tank.tank_code
            
            message_responses.append(ChatMessageResponse(
                id=message.id,
                message_content=message.message_content,
                patient_id=message.patient_id,
                tank_code=msg_tank_code,
                sender_id=message.sender_id,
                sender_name=sender_name,
                sender_role=sender_role,
                tagged_user_ids=tagged_user_ids,
                tagged_user_names=tagged_user_names if tagged_user_names else None,
                created_at=message.created_at,
                is_read=is_read,
                read_at=read_at
            ))
        
        # Get tank_code for response
        tank_code_response = tank.tank_code if tank else None
        
        # Compute unread count for the current user and tank (ALL messages)
        unread_count = get_canister_unread_count(current_user_id, tank_id, db)
        
        return PatientMessagesResponse(
            patient_id=None,
            tank_code=tank_code_response,
            patient_name=None,
            messages=message_responses,
            total_messages=len(message_responses),
            unread_count=unread_count
        )
        
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to get canister messages: {str(e)}", exc_info=True)
        # Re-raise known exceptions as-is
        if isinstance(e, (ChatPatientNotFoundException, ChatMessageNotFoundException, ChatMessageCreateFailedException)):
            raise
        # For unknown exceptions, raise ChatMessageCreateFailedException with proper context
        raise ChatMessageCreateFailedException(reason=f"Failed to get canister messages: {str(e)}")
    finally:
        # Explicit rollback ensures the transaction ends even after successful reads
        try:
            db.rollback()
        except Exception:
            pass


def get_unread_messages(
    current_user_id: str,
    current_user_pharma_id: Optional[int],
    db: Session
) -> UnreadMessagesResponse:
    """
    Get all unread TAGGED messages for the current user (for home screen notifications).
    Only returns messages where user was tagged AND id > last_read_message_id.
    Includes both patient (CGT) and canister (IVF) messages.
    """
    try:
        # Get unread messages for patients (CGT flow)
        # Only for pharma users (pharma_id is not None)
        unread_patient_messages = []
        if current_user_pharma_id is not None:
            unread_patient_messages = db.query(ChatMessage).join(
                ChatMessageTag, ChatMessageTag.message_id == ChatMessage.id
            ).join(
                Patient, Patient.id == ChatMessage.patient_id
            ).filter(
                Patient.pharma_id == current_user_pharma_id,
                ChatMessageTag.user_id == current_user_id,
                ChatMessage.patient_id.isnot(None)  # Only patient messages
            ).order_by(desc(ChatMessage.created_at)).all()
        
        # Get unread messages for tanks (IVF flow)
        unread_tank_messages = db.query(ChatMessage).join(
            ChatMessageTag, ChatMessageTag.message_id == ChatMessage.id
        ).join(
            Tank, Tank.tank_id == ChatMessage.tank_id
        ).filter(
            ChatMessageTag.user_id == current_user_id,
            ChatMessage.tank_id.isnot(None)  # Only tank messages
        ).order_by(desc(ChatMessage.created_at)).all()
        
        # Combine both lists
        unread_messages = list(unread_patient_messages) + list(unread_tank_messages)
        
        patient_ids = list({msg.patient_id for msg in unread_messages if msg.patient_id})
        tank_ids = list({msg.tank_id for msg in unread_messages if msg.tank_id})
        
        # Legacy fallback (during migration) when junction table has no entries yet
        # Only for pharma users (pharma_id is not None)
        if not unread_messages and current_user_pharma_id is not None:
            legacy_patients = db.query(Patient).filter(Patient.pharma_id == current_user_pharma_id).all()
            patient_ids = [p.id for p in legacy_patients]
            
            if not patient_ids and not tank_ids:
                return UnreadMessagesResponse(
                    unread_messages=[],
                    total_unread=0,
                    unread_by_patient={},
                    unread_by_tank={}
                )
        elif not unread_messages and current_user_pharma_id is None:
            # Hospital user with no unread messages
            return UnreadMessagesResponse(
                unread_messages=[],
                total_unread=0,
                unread_by_patient={},
                unread_by_tank={}
            )
        
        # OPTIMIZATION: Batch fetch all read statuses at once (fixes N+1 query problem)
        # Get unique patient IDs and tank IDs from messages
        unique_patient_ids = list(set([msg.patient_id for msg in unread_messages if msg.patient_id]))
        unique_tank_ids = list(set([msg.tank_id for msg in unread_messages if msg.tank_id]))
        
        # Batch fetch all patient read statuses in one query
        read_statuses = []
        if unique_patient_ids:
            read_statuses = db.query(ChatReadStatus).filter(
                ChatReadStatus.user_id == current_user_id,
                ChatReadStatus.patient_id.in_(unique_patient_ids)
            ).all()
        
        # Batch fetch all tank read statuses in one query
        read_statuses_canister = []
        if unique_tank_ids:
            read_statuses_canister = db.query(ChatReadStatusCanister).filter(
                ChatReadStatusCanister.user_id == current_user_id,
                ChatReadStatusCanister.tank_id.in_(unique_tank_ids)
            ).all()
        
        # Build read status maps
        read_status_map: Dict[str, int] = {}
        for rs in read_statuses:
            read_status_map[rs.patient_id] = rs.last_read_message_id or 0
        
        read_status_tank_map: Dict[int, int] = {}
        for rs in read_statuses_canister:
            read_status_tank_map[rs.tank_id] = rs.last_read_message_id or 0
        
        # Create missing read status entries (lazy creation)
        missing_patient_ids = set(unique_patient_ids) - set(read_status_map.keys())
        for patient_id in missing_patient_ids:
            read_status_map[patient_id] = 0  # Never read
        
        missing_tank_ids = set(unique_tank_ids) - set(read_status_tank_map.keys())
        for tank_id in missing_tank_ids:
            read_status_tank_map[tank_id] = 0  # Never read
        
        # Filter by read status and build unread_by_patient and unread_by_tank maps
        filtered_unread_messages = []
        unread_by_patient: Dict[str, int] = {}
        unread_by_tank: Dict[str, int] = {}
        
        for msg in unread_messages:
            if msg.patient_id:
                # CGT flow: check patient read status
                last_read_id = read_status_map.get(msg.patient_id, 0)
                if msg.id > last_read_id:
                    filtered_unread_messages.append(msg)
                    unread_by_patient[msg.patient_id] = unread_by_patient.get(msg.patient_id, 0) + 1
            elif msg.tank_id:
                # IVF flow: check tank read status
                last_read_id = read_status_tank_map.get(msg.tank_id, 0)
                if msg.id > last_read_id:
                    filtered_unread_messages.append(msg)
                    # Get tank_code for the map key
                    tank = db.query(Tank).filter(Tank.tank_id == msg.tank_id).first()
                    if tank and tank.tank_code:
                        unread_by_tank[tank.tank_code] = unread_by_tank.get(tank.tank_code, 0) + 1
        
        unread_messages = filtered_unread_messages
        
        # Fallback: Also check JSON field for backward compatibility (during migration period)
        if len(unread_messages) == 0:
            for patient_id in patient_ids:
                read_status = get_or_create_read_status(current_user_id, patient_id, db)
                last_read_id = read_status.last_read_message_id or 0
                
                messages = db.query(ChatMessage).filter(
                    ChatMessage.patient_id == patient_id,
                    ChatMessage.tagged_user_ids.isnot(None),
                    ChatMessage.id > last_read_id
                ).order_by(desc(ChatMessage.created_at)).all()
                
                for msg in messages:
                    if msg.tagged_user_ids:
                        try:
                            tagged_ids = json.loads(msg.tagged_user_ids)
                            if isinstance(tagged_ids, list) and current_user_id in tagged_ids:
                                unread_messages.append(msg)
                                unread_by_patient[patient_id] = unread_by_patient.get(patient_id, 0) + 1
                        except (json.JSONDecodeError, TypeError):
                            continue
            
            # Sort by created_at descending (newest first)
            unread_messages.sort(key=lambda m: m.created_at, reverse=True)
        
        # Build lookup maps
        sender_ids: Set[str] = {msg.sender_id for msg in unread_messages if msg.sender_id}
        patient_ids_set: Set[str] = {msg.patient_id for msg in unread_messages if msg.patient_id}
        tank_ids_set: Set[int] = {msg.tank_id for msg in unread_messages if msg.tank_id}
        
        sender_map: Dict[str, str] = {}
        if sender_ids:
            senders = db.query(User).filter(User.user_id.in_(sender_ids)).all()
            sender_map = {
                user.user_id: f"{user.first_name} {user.last_name}"
                for user in senders
            }
        
        patient_map: Dict[str, str] = {}
        if patient_ids_set:
            patients = db.query(Patient).filter(Patient.id.in_(patient_ids_set)).all()
            patient_map = {
                patient.id: patient.patient_name
                for patient in patients
            }
        
        tank_map: Dict[int, str] = {}
        if tank_ids_set:
            tanks = db.query(Tank).filter(Tank.tank_id.in_(tank_ids_set)).all()
            tank_map = {
                tank.tank_id: tank.tank_code or f"Tank {tank.tank_id}"
                for tank in tanks
            }
        
        # Build response
        unread_responses = []
        for message in unread_messages:
            sender_name = sender_map.get(message.sender_id, "Unknown")
            
            if message.patient_id:
                # CGT flow
                patient_name = patient_map.get(message.patient_id, "Unknown Patient")
                unread_responses.append(UnreadMessageResponse(
                    message_id=message.id,
                    message_content=message.message_content,
                    patient_id=message.patient_id,
                    canister_number=None,
                    patient_name=patient_name,
                    sender_id=message.sender_id,
                    sender_name=sender_name,
                    created_at=message.created_at
                ))
            elif message.tank_id:
                # IVF flow - get tank_code (backward compatibility: map to canister_number)
                tank_code = tank_map.get(message.tank_id, f"Tank {message.tank_id}")
                unread_responses.append(UnreadMessageResponse(
                    message_id=message.id,
                    message_content=message.message_content,
                    patient_id=None,
                    tank_code=tank_code,
                    patient_name=None,
                    sender_id=message.sender_id,
                    sender_name=sender_name,
                    created_at=message.created_at
                ))
        
        return UnreadMessagesResponse(
            unread_messages=unread_responses,
            total_unread=len(unread_responses),
            unread_by_patient=unread_by_patient,
            unread_by_tank=unread_by_tank
        )
        
    except Exception as e:
        logger.error(f"Failed to get unread messages: {str(e)}", exc_info=True)
        # Re-raise known exceptions as-is
        if isinstance(e, (ChatUserNotFoundException, ChatMessageNotFoundException, ChatMessageCreateFailedException)):
            raise
        # For unknown exceptions, raise ChatMessageCreateFailedException with proper context
        # This is a generic chat operation failure, not specifically about creating messages
        raise ChatMessageCreateFailedException(reason=f"Failed to get unread messages: {str(e)}")
    finally:
        # Make sure the session leaves the transaction cleanly after read-only flows
        try:
            db.rollback()
        except Exception:
            pass


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
        logger.debug(f"Handling WebSocket message: type={message_type}, connection_id={connection_id}")
        
        if message_type == WS_MSG_TYPE_SUBSCRIBE_PATIENT:
            response = await handle_subscribe_patient(
                message_data, connection_id, pharma_id, connection_manager
            )
        elif message_type == WS_MSG_TYPE_UNSUBSCRIBE_PATIENT:
            response = await handle_unsubscribe_patient(
                message_data, connection_id, connection_manager
            )
        elif message_type == WS_MSG_TYPE_GET_PATIENT_MESSAGES:
            response = await handle_get_patient_messages_ws(
                message_data, connection_id, current_user, pharma_id, connection_manager
            )
        elif message_type == WS_MSG_TYPE_GET_UNREAD_MESSAGES:
            response = await handle_get_unread_messages_ws(
                current_user, pharma_id
            )
        elif message_type == WS_MSG_TYPE_MARK_READ:
            response = await handle_mark_read_ws(
                message_data, current_user, pharma_id, connection_manager
            )
        else:
            raise ChatWebSocketInvalidTypeException(message_type=message_type)
        
        # Validate response is not empty
        if not response or not isinstance(response, dict):
            logger.error(f"Empty or invalid response from handler for type={message_type}")
            return create_websocket_error_response(
                ChatInvalidDataException(reason="Handler returned empty response")
            )
        
        logger.debug(f"WebSocket handler response: type={response.get('type')}, has_data={'data' in response}")
        return response
    
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
    
    # Get messages without marking as read (frontend controls when to mark as read)
    with SessionLocal() as db:
        result = await get_patient_messages(
            patient_id,
            current_user.user_id,
            pharma_id,
            db,
            connection_manager,
            mark_as_read=False  # Never auto-mark as read
        )
    
    return {
        "type": WS_MSG_TYPE_PATIENT_MESSAGES,
        "success": True,
        "data": result.model_dump(mode='json', exclude_none=False, exclude_unset=False)
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
        "data": result.model_dump(mode='json', exclude_none=False, exclude_unset=False)
    }


async def handle_mark_read_ws(
    message_data: Dict[str, Any],
    current_user: User,
    pharma_id: int,
    connection_manager: ChatConnectionManager
) -> Dict[str, Any]:
    """Handle mark messages as read via WebSocket - updates last_read_message_id to latest"""
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
    
    # Mark all messages as read by updating last_read_message_id
    with SessionLocal() as db:
        latest_message_id = mark_patient_as_read(current_user.user_id, patient_id, db)
        
        # Get updated unread count
        unread_count = get_patient_unread_count(current_user.user_id, patient_id, db)
        
        # Broadcast unread update
        if connection_manager:
            try:
                await broadcast_unread_messages_update(
                    current_user.user_id,
                    pharma_id,
                    connection_manager,
                    db
                )
            except Exception as e:
                logger.warning(f"Failed to broadcast unread update: {e}")
    
    return {
        "type": WS_MSG_TYPE_SUCCESS,
        "success": True,
        "message": f"Messages for patient {patient_id} marked as read",
        "data": {
            "patient_id": patient_id,
            "unread_count": unread_count,
            "last_read_message_id": latest_message_id
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
                        patient_payload = result.model_dump(mode='json', exclude_none=False, exclude_unset=False)
                        connection_response["patient_messages"] = patient_payload
                        connection_response["unread_count"] = patient_payload.get("unread_count", 0)
                    except Exception as e:
                        logger.warning(f"Failed to fetch patient messages: {e}")
        else:
            # Without patient_id: send only unread messages
            try:
                with SessionLocal() as db:
                    unread_result = get_unread_messages(current_user.user_id, pharma_id, db)
                    unread_payload = unread_result.model_dump(mode='json', exclude_none=False, exclude_unset=False)
                    connection_response["unread_messages"] = unread_payload
                    connection_response["unread_count"] = unread_payload.get("total_unread", 0)
            except Exception as e:
                logger.warning(f"Failed to fetch unread messages: {e}")
        
        await websocket.send_json(connection_response)
        
        return connection_id, current_user, pharma_id
        
    except ChatException as e:
        # Send error message to client before closing
        try:
            if websocket.client_state.name == "CONNECTED":
                error_response = {
                    "type": WS_MSG_TYPE_ERROR,
                    "success": False,
                    "error_code": e.error_code,
                    "message": e.message,
                    "details": e.details if hasattr(e, 'details') else {}
                }
                # Add specific reason if available (e.g., "Invalid or expired token")
                if hasattr(e, 'reason') and e.reason:
                    error_response["details"]["reason"] = e.reason
                await websocket.send_json(error_response)
                # Close with code 1008 (Policy Violation) for auth failures
                close_code = 1008 if isinstance(e, ChatWebSocketAuthFailedException) else 1000
                await websocket.close(code=close_code)
        except Exception as close_error:
            logger.warning(f"Error sending error message to client: {close_error}")
            try:
                await websocket.close(code=1008)
            except:
                pass
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
                logger.debug(f"Sending WebSocket response: type={response.get('type')}, keys={list(response.keys())}")
                await websocket.send_json(response)
            else:
                logger.warning(f"Empty response from handle_websocket_message for message_type={message_data.get('type')}")
        
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
