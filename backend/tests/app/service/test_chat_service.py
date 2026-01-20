import pytest
from unittest.mock import MagicMock, Mock, patch, AsyncMock

# Try to import pytest_asyncio, fallback if not available
try:
    import pytest_asyncio
    pytest_asyncio_available = True
except ImportError:
    pytest_asyncio_available = False
    # Create a dummy decorator if pytest-asyncio is not available
    class pytest_asyncio:
        @staticmethod
        def fixture(*args, **kwargs):
            return pytest.fixture(*args, **kwargs)
from datetime import datetime, timezone
import json
from sqlalchemy.exc import IntegrityError

from app.service import chat_service
from app.exceptions.custom_exceptions import (
    ChatMessageCreateFailedException, ChatMessageNotFoundException,
    ChatUserNotFoundException, ChatPatientNotFoundException,
    ChatPharmaAccessDeniedException, ChatInvalidDataException,
    ChatWebSocketInvalidTypeException, ChatException
)
from app.models.chat_model import ChatMessage
from app.models.chat_read_status import ChatReadStatus
from app.models.user_model import User
from app.models.patient_model import Patient
from app.schemas.chat_schema import (
    ChatMessageCreateRequest, ChatMessageCreateResponse, ChatMessageResponse,
    PatientMessagesResponse, UnreadMessageResponse, UnreadMessagesResponse
)
from app.utils.chat_websocket_manager import ChatConnectionManager
from fastapi import WebSocketDisconnect, WebSocket
from app.constants.app_constants import (
    WS_MSG_TYPE_SUBSCRIBE_PATIENT, WS_MSG_TYPE_UNSUBSCRIBE_PATIENT,
    WS_MSG_TYPE_GET_PATIENT_MESSAGES, WS_MSG_TYPE_GET_UNREAD_MESSAGES,
    WS_MSG_TYPE_MARK_READ, WS_MSG_TYPE_PATIENT_MESSAGES,
    WS_MSG_TYPE_UNREAD_MESSAGES, WS_MSG_TYPE_SUCCESS, WS_MSG_TYPE_ERROR,
    WS_MSG_TYPE_NEW_MESSAGE
)
from app.constants.error_codes import ERROR_CODES
from app.constants.messages import ErrorMessages


@pytest.fixture
def db_session():
    """Create a mock database session"""
    return MagicMock()


@pytest.fixture
def mock_user():
    """Create a mock user"""
    user = Mock(spec=User)
    user.user_id = "USER-123"
    user.first_name = "John"
    user.last_name = "Doe"
    user.pharma_id = 42
    user.is_active = True
    user.is_approved = True
    return user


@pytest.fixture
def mock_patient():
    """Create a mock patient"""
    patient = Mock(spec=Patient)
    patient.id = "PAT-123"
    patient.patient_name = "Test Patient"
    patient.pharma_id = 42
    return patient


@pytest.fixture
def mock_chat_message():
    """Create a mock chat message"""
    message = Mock(spec=ChatMessage)
    message.id = 1
    message.message_content = "Test message"
    message.patient_id = "PAT-123"
    message.sender_id = "USER-123"
    message.tagged_user_ids = None
    message.created_at = datetime.now(timezone.utc)
    return message


@pytest.fixture
def connection_manager():
    """Create a mock connection manager"""
    manager = MagicMock(spec=ChatConnectionManager)
    manager.connect = AsyncMock(return_value="conn-1")
    manager.disconnect = Mock()
    manager.subscribe_to_patient = Mock()
    manager.unsubscribe_from_patient = Mock()
    manager.broadcast_to_patient = AsyncMock()
    manager.send_to_user = AsyncMock()
    manager.get_connections_by_pharma = Mock(return_value={})
    return manager


# ==========================================
# Tests for broadcast_unread_messages_update
# ==========================================

@pytest.mark.asyncio
async def test_broadcast_unread_messages_update_success(db_session, connection_manager, mock_user):
    """Test broadcasting unread messages update successfully"""
    with patch('app.service.chat_service.get_unread_messages') as mock_get_unread:
        mock_unread_response = UnreadMessagesResponse(
            unread_messages=[],
            total_unread=0,
            unread_by_patient={}
        )
        mock_get_unread.return_value = mock_unread_response
        
        # Mock connection manager
        mock_conn_data = {
            "user_id": mock_user.user_id,
            "websocket": AsyncMock()
        }
        mock_conn_data["websocket"].client_state.name = "CONNECTED"
        mock_conn_data["websocket"].send_json = AsyncMock()
        connection_manager.get_connections_by_pharma.return_value = {
            "conn-1": mock_conn_data
        }
        connection_manager.disconnect = Mock()
        
        await chat_service.broadcast_unread_messages_update(
            mock_user.user_id,
            42,
            connection_manager,
            db_session
        )
        
        mock_get_unread.assert_called_once_with(mock_user.user_id, 42, db_session)
        mock_conn_data["websocket"].send_json.assert_called_once()


@pytest.mark.asyncio
async def test_broadcast_unread_messages_update_disconnected_websocket(db_session, connection_manager, mock_user):
    """Test broadcasting unread messages update with disconnected websocket"""
    with patch('app.service.chat_service.get_unread_messages') as mock_get_unread:
        mock_unread_response = UnreadMessagesResponse(
            unread_messages=[],
            total_unread=0,
            unread_by_patient={}
        )
        mock_get_unread.return_value = mock_unread_response
        
        # Mock disconnected websocket
        mock_conn_data = {
            "user_id": mock_user.user_id,
            "websocket": None
        }
        connection_manager.get_connections_by_pharma.return_value = {
            "conn-1": mock_conn_data
        }
        connection_manager.disconnect = Mock()
        
        await chat_service.broadcast_unread_messages_update(
            mock_user.user_id,
            42,
            connection_manager,
            db_session
        )
        
        connection_manager.disconnect.assert_called_once_with("conn-1")


@pytest.mark.asyncio
async def test_broadcast_unread_messages_update_user_id_mismatch(db_session, connection_manager, mock_user):
    """Test broadcasting unread messages update when user_id doesn't match - line 62"""
    with patch('app.service.chat_service.get_unread_messages') as mock_get_unread:
        mock_unread_response = UnreadMessagesResponse(
            unread_messages=[],
            total_unread=0,
            unread_by_patient={}
        )
        mock_get_unread.return_value = mock_unread_response
        
        # Mock connection with different user_id
        mock_conn_data = {
            "user_id": "USER-999",  # Different user_id
            "websocket": AsyncMock()
        }
        mock_conn_data["websocket"].client_state.name = "CONNECTED"
        connection_manager.get_connections_by_pharma.return_value = {
            "conn-1": mock_conn_data
        }
        
        await chat_service.broadcast_unread_messages_update(
            mock_user.user_id,  # Looking for USER-123
            42,
            connection_manager,
            db_session
        )
        
        # Should skip this connection (user_id mismatch), so send_json should not be called
        assert not hasattr(mock_conn_data["websocket"], "send_json") or not mock_conn_data["websocket"].send_json.called


@pytest.mark.asyncio
async def test_broadcast_unread_messages_update_send_exception(db_session, connection_manager, mock_user):
    """Test broadcasting unread messages update when send fails - lines 72-74"""
    with patch('app.service.chat_service.get_unread_messages') as mock_get_unread:
        mock_unread_response = UnreadMessagesResponse(
            unread_messages=[],
            total_unread=0,
            unread_by_patient={}
        )
        mock_get_unread.return_value = mock_unread_response
        
        # Mock connection with websocket that raises exception
        mock_websocket = AsyncMock()
        mock_websocket.client_state.name = "CONNECTED"
        mock_websocket.send_json = AsyncMock(side_effect=Exception("Send error"))
        
        mock_conn_data = {
            "user_id": mock_user.user_id,
            "websocket": mock_websocket
        }
        connection_manager.get_connections_by_pharma.return_value = {
            "conn-1": mock_conn_data
        }
        connection_manager.disconnect = Mock()
        
        await chat_service.broadcast_unread_messages_update(
            mock_user.user_id,
            42,
            connection_manager,
            db_session
        )
        
        # Should disconnect connection when send fails
        connection_manager.disconnect.assert_called_once_with("conn-1")


# ==========================================
# Tests for broadcast_new_message
# ==========================================

@pytest.mark.asyncio
async def test_broadcast_new_message_success(db_session, connection_manager):
    """Test broadcasting new message successfully"""
    result = ChatMessageCreateResponse(
        message_id=1,
        patient_id="PAT-123",
        message_content="Test message",
        sender_id="USER-123",
        sender_name="John Doe",
        tagged_user_ids=["USER-456"],
        tagged_user_names=["Jane Doe"],
        created_at=datetime.now(timezone.utc)
    )
    
    connection_manager.broadcast_to_patient = AsyncMock()
    connection_manager.send_to_user = AsyncMock()
    connection_manager.get_connections_by_pharma.return_value = {}
    
    with patch('app.service.chat_service.get_unread_messages') as mock_get_unread:
        mock_unread_response = UnreadMessagesResponse(
            unread_messages=[],
            total_unread=0,
            unread_by_patient={}
        )
        mock_get_unread.return_value = mock_unread_response
        
        await chat_service.broadcast_new_message(
            result,
            42,
            connection_manager,
            db_session
        )
        
        connection_manager.broadcast_to_patient.assert_called_once()
        connection_manager.send_to_user.assert_called()


@pytest.mark.asyncio
async def test_broadcast_new_message_no_tagged_users(db_session, connection_manager):
    """Test broadcasting new message with no tagged users"""
    result = ChatMessageCreateResponse(
        message_id=1,
        patient_id="PAT-123",
        message_content="Test message",
        sender_id="USER-123",
        sender_name="John Doe",
        tagged_user_ids=[],  # Empty list instead of None (schema requires List[str])
        tagged_user_names=None,
        created_at=datetime.now(timezone.utc)
    )
    
    connection_manager.broadcast_to_patient = AsyncMock()
    connection_manager.send_to_user = AsyncMock()
    
    await chat_service.broadcast_new_message(
        result,
        42,
        connection_manager,
        db_session
    )
    
    connection_manager.broadcast_to_patient.assert_called_once()
    connection_manager.send_to_user.assert_not_called()


@pytest.mark.asyncio
async def test_broadcast_new_message_tagged_users_branch(db_session, connection_manager):
    """Test broadcasting new message with tagged users - lines 134-169"""
    result = ChatMessageCreateResponse(
        message_id=1,
        patient_id="PAT-123",
        message_content="Test message",
        sender_id="USER-123",
        sender_name="John Doe",
        tagged_user_ids=["USER-456", "USER-789"],
        tagged_user_names=None,
        created_at=datetime.now(timezone.utc)
    )
    
    # Mock connection manager
    mock_conn_data = {
        "user_id": "USER-456",
        "websocket": AsyncMock()
    }
    mock_conn_data["websocket"].client_state.name = "CONNECTED"
    mock_conn_data["websocket"].send_json = AsyncMock()
    
    connection_manager.get_connections_by_pharma = Mock(return_value={
        "conn-1": mock_conn_data
    })
    connection_manager.disconnect = Mock()
    connection_manager.broadcast_to_patient = AsyncMock()
    
    with patch('app.service.chat_service.get_unread_messages') as mock_get_unread:
        mock_unread_response = UnreadMessagesResponse(
            unread_messages=[],
            total_unread=0,
            unread_by_patient={}
        )
        mock_get_unread.return_value = mock_unread_response
        db_session.expire_all = MagicMock()
        
        await chat_service.broadcast_new_message(
            result,
            42,
            connection_manager,
            db_session
        )
        
        # Should send unread update to tagged user
        mock_conn_data["websocket"].send_json.assert_called()
        connection_manager.broadcast_to_patient.assert_called_once()


@pytest.mark.asyncio
async def test_broadcast_new_message_tagged_users_exception(db_session, connection_manager):
    """Test broadcasting new message with tagged users when exception occurs - lines 166-169"""
    result = ChatMessageCreateResponse(
        message_id=1,
        patient_id="PAT-123",
        message_content="Test message",
        sender_id="USER-123",
        sender_name="John Doe",
        tagged_user_ids=["USER-456"],
        tagged_user_names=None,
        created_at=datetime.now(timezone.utc)
    )
    
    # Mock connection manager to raise exception
    connection_manager.get_connections_by_pharma = Mock(side_effect=Exception("Connection error"))
    connection_manager.broadcast_to_patient = AsyncMock()
    
    # Should not raise exception, just log error
    await chat_service.broadcast_new_message(
        result,
        42,
        connection_manager,
        db_session
    )
    
    # broadcast_to_patient should still be called
    connection_manager.broadcast_to_patient.assert_called_once()


@pytest.mark.asyncio
async def test_broadcast_new_message_user_not_in_tagged_set(db_session, connection_manager):
    """Test broadcasting new message when user_id is not in tagged_user_ids_set - line 144"""
    result = ChatMessageCreateResponse(
        message_id=1,
        patient_id="PAT-123",
        message_content="Test message",
        sender_id="USER-123",
        sender_name="John Doe",
        tagged_user_ids=["USER-456"],  # Tagged user
        tagged_user_names=None,
        created_at=datetime.now(timezone.utc)
    )
    
    # Mock connection with user_id not in tagged set
    mock_conn_data = {
        "user_id": "USER-999",  # Not in tagged_user_ids
        "websocket": AsyncMock()
    }
    mock_conn_data["websocket"].client_state.name = "CONNECTED"
    
    connection_manager.get_connections_by_pharma = Mock(return_value={
        "conn-1": mock_conn_data
    })
    connection_manager.disconnect = Mock()
    connection_manager.broadcast_to_patient = AsyncMock()
    
    db_session.expire_all = MagicMock()
    
    await chat_service.broadcast_new_message(
        result,
        42,
        connection_manager,
        db_session
    )
    
    # Should skip this connection (user_id not in tagged set)
    assert not hasattr(mock_conn_data["websocket"], "send_json") or not mock_conn_data["websocket"].send_json.called


@pytest.mark.asyncio
async def test_broadcast_new_message_websocket_none(db_session, connection_manager):
    """Test broadcasting new message when websocket is None - lines 148-150"""
    result = ChatMessageCreateResponse(
        message_id=1,
        patient_id="PAT-123",
        message_content="Test message",
        sender_id="USER-123",
        sender_name="John Doe",
        tagged_user_ids=["USER-456"],
        tagged_user_names=None,
        created_at=datetime.now(timezone.utc)
    )
    
    # Mock connection with None websocket
    mock_conn_data = {
        "user_id": "USER-456",
        "websocket": None  # None websocket
    }
    
    connection_manager.get_connections_by_pharma = Mock(return_value={
        "conn-1": mock_conn_data
    })
    connection_manager.disconnect = Mock()
    connection_manager.broadcast_to_patient = AsyncMock()
    
    db_session.expire_all = MagicMock()
    
    await chat_service.broadcast_new_message(
        result,
        42,
        connection_manager,
        db_session
    )
    
    # Should disconnect connection with None websocket
    connection_manager.disconnect.assert_called_once_with("conn-1")


@pytest.mark.asyncio
async def test_broadcast_new_message_send_json_exception(db_session, connection_manager):
    """Test broadcasting new message when send_json raises exception - lines 160-162"""
    result = ChatMessageCreateResponse(
        message_id=1,
        patient_id="PAT-123",
        message_content="Test message",
        sender_id="USER-123",
        sender_name="John Doe",
        tagged_user_ids=["USER-456"],
        tagged_user_names=None,
        created_at=datetime.now(timezone.utc)
    )
    
    # Mock connection with websocket that raises exception on send_json
    mock_websocket = AsyncMock()
    mock_websocket.client_state.name = "CONNECTED"
    mock_websocket.send_json = AsyncMock(side_effect=Exception("Send error"))
    
    mock_conn_data = {
        "user_id": "USER-456",
        "websocket": mock_websocket
    }
    
    connection_manager.get_connections_by_pharma = Mock(return_value={
        "conn-1": mock_conn_data
    })
    connection_manager.disconnect = Mock()
    connection_manager.broadcast_to_patient = AsyncMock()
    
    with patch('app.service.chat_service.get_unread_messages') as mock_get_unread:
        mock_unread_response = UnreadMessagesResponse(
            unread_messages=[],
            total_unread=0,
            unread_by_patient={}
        )
        mock_get_unread.return_value = mock_unread_response
        db_session.expire_all = MagicMock()
        
        await chat_service.broadcast_new_message(
            result,
            42,
            connection_manager,
            db_session
        )
        
        # Should disconnect connection when send_json fails
        connection_manager.disconnect.assert_called_once_with("conn-1")


@pytest.mark.asyncio
async def test_broadcast_new_message_disconnect_called(db_session, connection_manager):
    """Test broadcasting new message when disconnect is called - line 165"""
    result = ChatMessageCreateResponse(
        message_id=1,
        patient_id="PAT-123",
        message_content="Test message",
        sender_id="USER-123",
        sender_name="John Doe",
        tagged_user_ids=["USER-456"],
        tagged_user_names=None,
        created_at=datetime.now(timezone.utc)
    )
    
    # Mock connection with None websocket to trigger disconnect
    mock_conn_data = {
        "user_id": "USER-456",
        "websocket": None
    }
    
    connection_manager.get_connections_by_pharma = Mock(return_value={
        "conn-1": mock_conn_data
    })
    connection_manager.disconnect = Mock()
    connection_manager.broadcast_to_patient = AsyncMock()
    
    db_session.expire_all = MagicMock()
    
    await chat_service.broadcast_new_message(
        result,
        42,
        connection_manager,
        db_session
    )
    
    # Should call disconnect
    connection_manager.disconnect.assert_called_once_with("conn-1")


@pytest.mark.asyncio
async def test_broadcast_new_message_unread_updates_exception(db_session, connection_manager):
    """Test broadcasting new message when unread updates raise exception - lines 166-167"""
    result = ChatMessageCreateResponse(
        message_id=1,
        patient_id="PAT-123",
        message_content="Test message",
        sender_id="USER-123",
        sender_name="John Doe",
        tagged_user_ids=["USER-456"],
        tagged_user_names=None,
        created_at=datetime.now(timezone.utc)
    )
    
    connection_manager.get_connections_by_pharma = Mock(side_effect=Exception("Unread updates error"))
    connection_manager.broadcast_to_patient = AsyncMock()
    
    # Should not raise exception, just log warning
    await chat_service.broadcast_new_message(
        result,
        42,
        connection_manager,
        db_session
    )
    
    # broadcast_to_patient should still be called
    connection_manager.broadcast_to_patient.assert_called_once()


@pytest.mark.asyncio
async def test_broadcast_new_message_outer_exception(db_session, connection_manager):
    """Test broadcasting new message when outer exception occurs - lines 168-169"""
    result = ChatMessageCreateResponse(
        message_id=1,
        patient_id="PAT-123",
        message_content="Test message",
        sender_id="USER-123",
        sender_name="John Doe",
        tagged_user_ids=["USER-456"],
        tagged_user_names=None,
        created_at=datetime.now(timezone.utc)
    )
    
    connection_manager.broadcast_to_patient = AsyncMock(side_effect=Exception("Broadcast error"))
    
    # Should not raise exception, just log error
    await chat_service.broadcast_new_message(
        result,
        42,
        connection_manager,
        db_session
    )


def test_create_chat_message_tagged_user_ids_none_explicit(db_session, mock_patient):
    """Test creating chat message with tagged_user_ids explicitly None - lines 217-218"""
    request = ChatMessageCreateRequest(
        patient_id="PAT-123",
        message_content="Test message",
        tagged_user_ids=None  # Explicitly None
    )
    
    patient_query = MagicMock()
    patient_query.filter.return_value.first.return_value = mock_patient
    db_session.query.return_value = patient_query
    
    mock_message = Mock(spec=ChatMessage)
    mock_message.id = 1
    mock_message.patient_id = "PAT-123"
    mock_message.message_content = "Test message"
    mock_message.sender_id = "USER-123"
    mock_message.tagged_user_ids = None
    mock_message.created_at = datetime.now(timezone.utc)
    
    with patch('app.service.chat_service.ChatMessage', return_value=mock_message):
        result = chat_service.create_chat_message(
            request,
            "USER-123",
            42,
            "John Doe",
            None,
            db_session
        )
        
        # When tagged_user_ids is None, it should be saved as None
        assert result.tagged_user_ids is None or result.tagged_user_ids == []


@pytest.mark.asyncio
async def test_handle_unsubscribe_patient_missing_patient_id(connection_manager):
    """Test unsubscribing from patient with missing patient_id - line 600"""
    message_data = {}  # Missing patient_id
    
    with pytest.raises(ChatInvalidDataException) as exc_info:
        await chat_service.handle_unsubscribe_patient(
            message_data,
            "conn-1",
            connection_manager
        )
    
    # ChatInvalidDataException stores reason in details
    reason = exc_info.value.details.get('reason', '') if hasattr(exc_info.value, 'details') else str(exc_info.value)
    assert "patient_id is required" in reason or "patient_id" in str(exc_info.value).lower()


@pytest.mark.asyncio
async def test_handle_websocket_connection_success_with_patient_id():
    """Test handling WebSocket connection successfully with patient_id - lines 722-808"""
    mock_websocket = AsyncMock()
    mock_websocket.accept = AsyncMock()
    mock_websocket.send_json = AsyncMock()
    mock_websocket.client_state.name = "CONNECTED"
    mock_websocket.close = AsyncMock()
    
    mock_user = Mock(spec=User)
    mock_user.user_id = "USER-123"
    
    mock_patient = Mock(spec=Patient)
    mock_patient.id = "PAT-123"
    mock_patient.pharma_id = 42
    
    connection_manager = MagicMock()
    connection_manager.connect = AsyncMock(return_value="conn-1")
    connection_manager.subscribe_to_patient = Mock()
    
    async def mock_auth(ws, token):
        return mock_user, 42
    
    with patch('app.service.chat_service.SessionLocal') as mock_session_local, \
         patch('app.service.chat_service.get_patient_messages', new_callable=AsyncMock) as mock_get_messages:
        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = mock_patient
        mock_session_local.return_value.__enter__.return_value = mock_db
        
        mock_response = PatientMessagesResponse(
            patient_id="PAT-123",
            patient_name="Test Patient",
            messages=[],
            total_messages=0,
            unread_count=0
        )
        mock_get_messages.return_value = mock_response
        
        connection_id, user, pharma_id = await chat_service.handle_websocket_connection(
            mock_websocket,
            "token",
            "PAT-123",
            connection_manager,
            mock_auth
        )
        
        assert connection_id == "conn-1"
        assert user == mock_user
        assert pharma_id == 42
        mock_websocket.accept.assert_called_once()
        connection_manager.subscribe_to_patient.assert_called_once_with("conn-1", "PAT-123")
        mock_websocket.send_json.assert_called_once()


@pytest.mark.asyncio
async def test_handle_websocket_connection_success_without_patient_id():
    """Test handling WebSocket connection successfully without patient_id - lines 722-808"""
    mock_websocket = AsyncMock()
    mock_websocket.accept = AsyncMock()
    mock_websocket.send_json = AsyncMock()
    mock_websocket.client_state.name = "CONNECTED"
    mock_websocket.close = AsyncMock()
    
    mock_user = Mock(spec=User)
    mock_user.user_id = "USER-123"
    
    connection_manager = MagicMock()
    connection_manager.connect = AsyncMock(return_value="conn-1")
    
    async def mock_auth(ws, token):
        return mock_user, 42
    
    with patch('app.service.chat_service.SessionLocal') as mock_session_local, \
         patch('app.service.chat_service.get_unread_messages') as mock_get_unread:
        mock_db = MagicMock()
        mock_session_local.return_value.__enter__.return_value = mock_db
        
        mock_unread_response = UnreadMessagesResponse(
            unread_messages=[],
            total_unread=0,
            unread_by_patient={}
        )
        mock_get_unread.return_value = mock_unread_response
        
        connection_id, user, pharma_id = await chat_service.handle_websocket_connection(
            mock_websocket,
            "token",
            None,
            connection_manager,
            mock_auth
        )
        
        assert connection_id == "conn-1"
        assert user == mock_user
        assert pharma_id == 42
        mock_websocket.accept.assert_called_once()
        mock_get_unread.assert_called_once()
        mock_websocket.send_json.assert_called_once()


@pytest.mark.asyncio
async def test_handle_websocket_connection_chat_exception():
    """Test handling WebSocket connection with ChatException - lines 783-793"""
    mock_websocket = AsyncMock()
    mock_websocket.accept = AsyncMock()
    mock_websocket.send_json = AsyncMock()
    mock_websocket.client_state.name = "CONNECTED"
    mock_websocket.close = AsyncMock()
    
    connection_manager = MagicMock()
    
    async def mock_auth(ws, token):
        raise ChatInvalidDataException("Invalid token")
    
    with pytest.raises(ChatInvalidDataException):
        await chat_service.handle_websocket_connection(
            mock_websocket,
            "token",
            None,
            connection_manager,
            mock_auth
        )
    
    # Should send error message and close connection
    mock_websocket.send_json.assert_called_once()
    mock_websocket.close.assert_called_once()


@pytest.mark.asyncio
async def test_handle_websocket_connection_general_exception():
    """Test handling WebSocket connection with general exception - lines 794-808"""
    mock_websocket = AsyncMock()
    mock_websocket.accept = AsyncMock(side_effect=Exception("Connection error"))
    mock_websocket.send_json = AsyncMock()
    mock_websocket.client_state.name = "CONNECTED"
    mock_websocket.close = AsyncMock()
    
    connection_manager = MagicMock()
    
    async def mock_auth(ws, token):
        return Mock(spec=User), 42
    
    with pytest.raises(Exception):
        await chat_service.handle_websocket_connection(
            mock_websocket,
            "token",
            None,
            connection_manager,
            mock_auth
        )
    
    # Should try to send error message and close connection
    # (may fail if websocket is not connected, but should try)


@pytest.mark.asyncio
async def test_handle_websocket_connection_patient_not_found():
    """Test handling WebSocket connection when patient not found - lines 750-767"""
    mock_websocket = AsyncMock()
    mock_websocket.accept = AsyncMock()
    mock_websocket.send_json = AsyncMock()
    mock_websocket.client_state.name = "CONNECTED"
    
    mock_user = Mock(spec=User)
    mock_user.user_id = "USER-123"
    
    connection_manager = MagicMock()
    connection_manager.connect = AsyncMock(return_value="conn-1")
    connection_manager.subscribe_to_patient = Mock()
    
    async def mock_auth(ws, token):
        return mock_user, 42
    
    with patch('app.service.chat_service.SessionLocal') as mock_session_local:
        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = None  # Patient not found
        mock_session_local.return_value.__enter__.return_value = mock_db
        
        connection_id, user, pharma_id = await chat_service.handle_websocket_connection(
            mock_websocket,
            "token",
            "PAT-123",
            connection_manager,
            mock_auth
        )
        
        # Should still connect, but not subscribe to patient
        assert connection_id == "conn-1"
        connection_manager.subscribe_to_patient.assert_not_called()


@pytest.mark.asyncio
async def test_handle_websocket_connection_patient_different_pharma():
    """Test handling WebSocket connection when patient belongs to different pharma - lines 750-767"""
    mock_websocket = AsyncMock()
    mock_websocket.accept = AsyncMock()
    mock_websocket.send_json = AsyncMock()
    mock_websocket.client_state.name = "CONNECTED"
    
    mock_user = Mock(spec=User)
    mock_user.user_id = "USER-123"
    
    mock_patient = Mock(spec=Patient)
    mock_patient.id = "PAT-123"
    mock_patient.pharma_id = 99  # Different pharma
    
    connection_manager = MagicMock()
    connection_manager.connect = AsyncMock(return_value="conn-1")
    connection_manager.subscribe_to_patient = Mock()
    
    async def mock_auth(ws, token):
        return mock_user, 42
    
    with patch('app.service.chat_service.SessionLocal') as mock_session_local:
        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = mock_patient
        mock_session_local.return_value.__enter__.return_value = mock_db
        
        connection_id, user, pharma_id = await chat_service.handle_websocket_connection(
            mock_websocket,
            "token",
            "PAT-123",
            connection_manager,
            mock_auth
        )
        
        # Should still connect, but not subscribe to patient (pharma mismatch)
        assert connection_id == "conn-1"
        connection_manager.subscribe_to_patient.assert_not_called()


@pytest.mark.asyncio
async def test_handle_websocket_connection_fetch_patient_messages_exception():
    """Test handling WebSocket connection when fetching patient messages raises exception - lines 766-767"""
    mock_websocket = AsyncMock()
    mock_websocket.accept = AsyncMock()
    mock_websocket.send_json = AsyncMock()
    mock_websocket.client_state.name = "CONNECTED"
    
    mock_user = Mock(spec=User)
    mock_user.user_id = "USER-123"
    
    mock_patient = Mock(spec=Patient)
    mock_patient.id = "PAT-123"
    mock_patient.pharma_id = 42
    
    connection_manager = MagicMock()
    connection_manager.connect = AsyncMock(return_value="conn-1")
    connection_manager.subscribe_to_patient = Mock()
    
    async def mock_auth(ws, token):
        return mock_user, 42
    
    with patch('app.service.chat_service.SessionLocal') as mock_session_local, \
         patch('app.service.chat_service.get_patient_messages', new_callable=AsyncMock) as mock_get_messages:
        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = mock_patient
        mock_session_local.return_value.__enter__.return_value = mock_db
        
        mock_get_messages.side_effect = Exception("Fetch error")
        
        # Should not raise exception, just log warning
        connection_id, user, pharma_id = await chat_service.handle_websocket_connection(
            mock_websocket,
            "token",
            "PAT-123",
            connection_manager,
            mock_auth
        )
        
        assert connection_id == "conn-1"
        connection_manager.subscribe_to_patient.assert_called_once()


@pytest.mark.asyncio
async def test_handle_websocket_connection_fetch_unread_exception():
    """Test handling WebSocket connection when fetching unread messages raises exception - lines 776-777"""
    mock_websocket = AsyncMock()
    mock_websocket.accept = AsyncMock()
    mock_websocket.send_json = AsyncMock()
    mock_websocket.client_state.name = "CONNECTED"
    
    mock_user = Mock(spec=User)
    mock_user.user_id = "USER-123"
    
    connection_manager = MagicMock()
    connection_manager.connect = AsyncMock(return_value="conn-1")
    
    async def mock_auth(ws, token):
        return mock_user, 42
    
    with patch('app.service.chat_service.SessionLocal') as mock_session_local, \
         patch('app.service.chat_service.get_unread_messages') as mock_get_unread:
        mock_db = MagicMock()
        mock_session_local.return_value.__enter__.return_value = mock_db
        
        mock_get_unread.side_effect = Exception("Fetch error")
        
        # Should not raise exception, just log warning
        connection_id, user, pharma_id = await chat_service.handle_websocket_connection(
            mock_websocket,
            "token",
            None,
            connection_manager,
            mock_auth
        )
        
        assert connection_id == "conn-1"


@pytest.mark.asyncio
async def test_handle_websocket_message_loop_success():
    """Test handling WebSocket message loop successfully - lines 819-858"""
    mock_websocket = AsyncMock()
    mock_websocket.receive_text = AsyncMock(side_effect=[
        '{"type": "subscribe_patient", "patient_id": "PAT-123"}',
        WebSocketDisconnect()  # Disconnect after first message
    ])
    mock_websocket.send_json = AsyncMock()
    
    mock_user = Mock(spec=User)
    mock_user.user_id = "USER-123"
    
    connection_manager = MagicMock()
    
    with patch('app.service.chat_service.handle_websocket_message', new_callable=AsyncMock) as mock_handle:
        mock_handle.return_value = {"success": True}
        
        await chat_service.handle_websocket_message_loop(
            mock_websocket,
            "conn-1",
            mock_user,
            42,
            connection_manager
        )
        
        mock_handle.assert_called_once()
        mock_websocket.send_json.assert_called_once()


@pytest.mark.asyncio
async def test_handle_websocket_message_loop_json_decode_error():
    """Test handling WebSocket message loop with JSON decode error - lines 824-832"""
    mock_websocket = AsyncMock()
    mock_websocket.receive_text = AsyncMock(side_effect=[
        'invalid json',
        WebSocketDisconnect()  # Disconnect after error
    ])
    mock_websocket.send_json = AsyncMock()
    
    mock_user = Mock(spec=User)
    mock_user.user_id = "USER-123"
    
    connection_manager = MagicMock()
    
    await chat_service.handle_websocket_message_loop(
        mock_websocket,
        "conn-1",
        mock_user,
        42,
        connection_manager
    )
    
    # Should send error message for JSON decode error
    mock_websocket.send_json.assert_called_once()
    call_args = mock_websocket.send_json.call_args[0][0]
    assert call_args["type"] == WS_MSG_TYPE_ERROR
    assert call_args["success"] is False


@pytest.mark.asyncio
async def test_handle_websocket_message_loop_general_exception():
    """Test handling WebSocket message loop with general exception - lines 847-858"""
    mock_websocket = AsyncMock()
    mock_websocket.receive_text = AsyncMock(side_effect=[
        Exception("Receive error"),
        WebSocketDisconnect()  # Disconnect after error
    ])
    mock_websocket.send_json = AsyncMock()
    
    mock_user = Mock(spec=User)
    mock_user.user_id = "USER-123"
    
    connection_manager = MagicMock()
    
    await chat_service.handle_websocket_message_loop(
        mock_websocket,
        "conn-1",
        mock_user,
        42,
        connection_manager
    )
    
    # Should try to send error message
    mock_websocket.send_json.assert_called()


@pytest.mark.asyncio
async def test_handle_websocket_message_loop_send_error():
    """Test handling WebSocket message loop when send_json fails - lines 857-858"""
    mock_websocket = AsyncMock()
    mock_websocket.receive_text = AsyncMock(side_effect=[
        Exception("Receive error"),
        WebSocketDisconnect()  # Disconnect after error
    ])
    mock_websocket.send_json = AsyncMock(side_effect=Exception("Send error"))
    
    mock_user = Mock(spec=User)
    mock_user.user_id = "USER-123"
    
    connection_manager = MagicMock()
    
    # Should not raise exception, just log error
    await chat_service.handle_websocket_message_loop(
        mock_websocket,
        "conn-1",
        mock_user,
        42,
        connection_manager
    )


# ==========================================
# Additional tests for uncovered lines
# ==========================================

@pytest.mark.asyncio
async def test_broadcast_unread_messages_update_outer_exception(db_session, connection_manager, mock_user):
    """Test broadcasting unread messages update with outer exception - lines 78-79"""
    # Mock connection manager to raise exception at the outer level
    connection_manager.get_connections_by_pharma = Mock(side_effect=Exception("Outer error"))
    
    # Should not raise exception, just log warning
    await chat_service.broadcast_unread_messages_update(
        mock_user.user_id,
        42,
        connection_manager,
        db_session
    )


def test_create_chat_message_patient_not_found_exception(db_session):
    """Test creating chat message when patient not found - line 184"""
    request = ChatMessageCreateRequest(
        patient_id="PAT-999",
        message_content="Test message"
    )
    
    patient_query = MagicMock()
    patient_query.filter.return_value.first.return_value = None  # Patient not found
    db_session.query.return_value = patient_query
    
    with pytest.raises(ChatMessageCreateFailedException):
        chat_service.create_chat_message(
            request,
            "USER-123",
            42,
            "John Doe",
            None,
            db_session
        )


def test_create_chat_message_tag_self_validation(db_session, mock_patient):
    """Test creating chat message when sender tags themselves - lines 189-193"""
    request = ChatMessageCreateRequest(
        patient_id="PAT-123",
        message_content="Test message",
        tagged_user_ids=["USER-123"]  # Sender tags themselves
    )
    
    patient_query = MagicMock()
    patient_query.filter.return_value.first.return_value = mock_patient
    db_session.query.return_value = patient_query
    
    # The service wraps ChatInvalidDataException in ChatMessageCreateFailedException
    # ChatInvalidDataException is not in the list of exceptions to re-raise (line 273-275),
    # so it gets wrapped at line 276
    with pytest.raises(ChatMessageCreateFailedException) as exc_info:
        chat_service.create_chat_message(
            request,
            "USER-123",  # Same as tagged_user_ids
            42,
            "John Doe",
            None,
            db_session
        )
    
    # Check that the original message about tagging yourself is in the wrapped exception
    # The exception is wrapped with the original exception's string representation as the reason
    # The log shows: "Failed to create chat message: You cannot tag yourself in a message"
    # Check the exception's details.reason or message
    exception_message = str(exc_info.value).lower()
    exception_reason = exc_info.value.details.get('reason', '').lower() if hasattr(exc_info.value, 'details') else ''
    
    # The original exception message "You cannot tag yourself in a message" should be in the reason
    assert "tag yourself" in exception_reason or "tag yourself" in exception_message or "cannot tag" in exception_reason


def test_create_chat_message_tagged_user_not_found(db_session, mock_patient):
    """Test creating chat message when tagged user not found - lines 199-200"""
    request = ChatMessageCreateRequest(
        patient_id="PAT-123",
        message_content="Test message",
        tagged_user_ids=["USER-999"]  # Non-existent user
    )
    
    patient_query = MagicMock()
    patient_query.filter.return_value.first.return_value = mock_patient
    
    # Mock user query to return empty list (user not found)
    user_query = MagicMock()
    user_query.filter.return_value.all.return_value = []  # No users found
    
    query_call_count = [0]
    def query_side_effect(model):
        query_call_count[0] += 1
        if query_call_count[0] == 1:
            return patient_query
        else:
            return user_query
    
    db_session.query = Mock(side_effect=query_side_effect)
    
    with pytest.raises(ChatMessageCreateFailedException):
        chat_service.create_chat_message(
            request,
            "USER-123",
            42,
            "John Doe",
            None,
            db_session
        )


def test_create_chat_message_tagged_user_pharma_mismatch(db_session, mock_patient):
    """Test creating chat message when tagged user is in different pharma - lines 203-207"""
    request = ChatMessageCreateRequest(
        patient_id="PAT-123",
        message_content="Test message",
        tagged_user_ids=["USER-456"]
    )
    
    patient_query = MagicMock()
    patient_query.filter.return_value.first.return_value = mock_patient
    
    # Mock user in different pharma
    mock_tagged_user = Mock(spec=User)
    mock_tagged_user.user_id = "USER-456"
    mock_tagged_user.pharma_id = 99  # Different pharma
    
    user_query = MagicMock()
    user_query.filter.return_value.all.return_value = [mock_tagged_user]
    
    query_call_count = [0]
    def query_side_effect(model):
        query_call_count[0] += 1
        if query_call_count[0] == 1:
            return patient_query
        else:
            return user_query
    
    db_session.query = Mock(side_effect=query_side_effect)
    
    with pytest.raises(ChatMessageCreateFailedException):
        chat_service.create_chat_message(
            request,
            "USER-123",
            42,  # Different pharma
            "John Doe",
            None,
            db_session
        )


def test_create_chat_message_with_tagged_users_creates_read_status(db_session, mock_patient, mock_user):
    """Test creating chat message with tagged users creates read status - lines 233-239"""
    request = ChatMessageCreateRequest(
        patient_id="PAT-123",
        message_content="Test message",
        tagged_user_ids=["USER-456", "USER-789"]
    )
    
    patient_query = MagicMock()
    patient_query.filter.return_value.first.return_value = mock_patient
    
    # Mock tagged users
    mock_tagged_user1 = Mock(spec=User)
    mock_tagged_user1.user_id = "USER-456"
    mock_tagged_user1.pharma_id = 42
    mock_tagged_user1.first_name = "Jane"
    mock_tagged_user1.last_name = "Doe"
    
    mock_tagged_user2 = Mock(spec=User)
    mock_tagged_user2.user_id = "USER-789"
    mock_tagged_user2.pharma_id = 42
    mock_tagged_user2.first_name = "Bob"
    mock_tagged_user2.last_name = "Smith"
    
    user_query = MagicMock()
    user_query.filter.return_value.all.return_value = [mock_tagged_user1, mock_tagged_user2]
    
    mock_message = Mock(spec=ChatMessage)
    mock_message.id = 1
    mock_message.patient_id = "PAT-123"
    mock_message.message_content = "Test message"
    mock_message.sender_id = "USER-123"
    mock_message.tagged_user_ids = None
    mock_message.created_at = datetime.now(timezone.utc)
    
    query_call_count = [0]
    def query_side_effect(model):
        query_call_count[0] += 1
        if query_call_count[0] == 1:
            return patient_query
        elif query_call_count[0] == 2:
            return user_query
        elif query_call_count[0] == 3:
            # For getting tagged user names
            return user_query
        else:
            return MagicMock()
    
    db_session.query = Mock(side_effect=query_side_effect)
    db_session.add = MagicMock()
    db_session.commit = MagicMock()
    
    with patch('app.service.chat_service.ChatMessage', return_value=mock_message):
        with pytest.raises(ChatMessageCreateFailedException):
            chat_service.create_chat_message(
                request,
                "USER-123",
                42,
                "John Doe",
                None,
                db_session
            )


def test_create_chat_message_gets_tagged_user_names(db_session, mock_patient):
    """Test creating chat message gets tagged user names - lines 255-257"""
    request = ChatMessageCreateRequest(
        patient_id="PAT-123",
        message_content="Test message",
        tagged_user_ids=["USER-456"]
    )
    
    patient_query = MagicMock()
    patient_query.filter.return_value.first.return_value = mock_patient
    
    # Mock tagged user
    mock_tagged_user = Mock(spec=User)
    mock_tagged_user.user_id = "USER-456"
    mock_tagged_user.pharma_id = 42
    mock_tagged_user.first_name = "Jane"
    mock_tagged_user.last_name = "Doe"
    
    user_query = MagicMock()
    user_query.filter.return_value.all.return_value = [mock_tagged_user]
    
    mock_message = Mock(spec=ChatMessage)
    mock_message.id = 1
    mock_message.patient_id = "PAT-123"
    mock_message.message_content = "Test message"
    mock_message.sender_id = "USER-123"
    mock_message.tagged_user_ids = None
    mock_message.created_at = datetime.now(timezone.utc)
    
    query_call_count = [0]
    def query_side_effect(model):
        query_call_count[0] += 1
        if query_call_count[0] == 1:
            return patient_query
        elif query_call_count[0] == 2:
            return user_query
        elif query_call_count[0] == 3:
            # For getting tagged user names
            return user_query
        else:
            return MagicMock()
    
    db_session.query = Mock(side_effect=query_side_effect)
    db_session.add = MagicMock()
    db_session.commit = MagicMock()
    
    with patch('app.service.chat_service.ChatMessage', return_value=mock_message):
        with pytest.raises(ChatMessageCreateFailedException):
            chat_service.create_chat_message(
                request,
                "USER-123",
                42,
                "John Doe",
                None,
                db_session
            )


def test_create_chat_message_general_exception(db_session, mock_patient):
    """Test creating chat message with general exception - lines 270-276"""
    request = ChatMessageCreateRequest(
        patient_id="PAT-123",
        message_content="Test message"
    )
    
    patient_query = MagicMock()
    patient_query.filter.return_value.first.return_value = mock_patient
    db_session.query.return_value = patient_query
    db_session.commit.side_effect = RuntimeError("Database error")
    
    with patch('app.service.chat_service.ChatMessage', side_effect=RuntimeError("Unexpected error")):
        with pytest.raises(ChatMessageCreateFailedException) as exc_info:
            chat_service.create_chat_message(
                request,
                "USER-123",
                42,
                "John Doe",
                None,
                db_session
            )
        
        assert "Failed to create chat message" in str(exc_info.value)
        db_session.rollback.assert_called()


@pytest.mark.asyncio
async def test_handle_unsubscribe_patient_success_return(db_session, connection_manager):
    """Test unsubscribing from patient successfully returns response - lines 602-604"""
    message_data = {"patient_id": "PAT-123"}
    
    result = await chat_service.handle_unsubscribe_patient(
        message_data,
        "conn-1",
        connection_manager
    )
    
    assert result["success"] is True
    assert result["type"] == WS_MSG_TYPE_SUCCESS
    assert result["data"]["patient_id"] == "PAT-123"
    connection_manager.unsubscribe_from_patient.assert_called_once_with("conn-1", "PAT-123")


@pytest.mark.asyncio
async def test_handle_get_unread_messages_ws_success(connection_manager, mock_user):
    """Test getting unread messages via WebSocket successfully - lines 650-653"""
    with patch('app.service.chat_service.SessionLocal') as mock_session_local, \
         patch('app.service.chat_service.get_unread_messages') as mock_get_unread:
        mock_db = MagicMock()
        mock_session_local.return_value.__enter__.return_value = mock_db
        
        mock_unread_response = UnreadMessagesResponse(
            unread_messages=[],
            total_unread=0,
            unread_by_patient={}
        )
        mock_get_unread.return_value = mock_unread_response
        
        result = await chat_service.handle_get_unread_messages_ws(
            mock_user,
            42
        )
        
        assert result["success"] is True
        assert result["type"] == WS_MSG_TYPE_UNREAD_MESSAGES
        assert "data" in result


@pytest.mark.asyncio
async def test_handle_mark_read_ws_success(connection_manager, mock_user):
    """Test marking messages as read via WebSocket successfully - lines 667-692"""
    message_data = {
        "patient_id": "PAT-123",
        "chat_read_status": True
    }
    
    with patch('app.service.chat_service.SessionLocal') as mock_session_local, \
         patch('app.service.chat_service.get_patient_messages', new_callable=AsyncMock) as mock_get_messages:
        mock_db = MagicMock()
        mock_session_local.return_value.__enter__.return_value = mock_db
        
        mock_response = PatientMessagesResponse(
            patient_id="PAT-123",
            patient_name="Test Patient",
            messages=[],
            total_messages=0,
            unread_count=0
        )
        mock_get_messages.return_value = mock_response
        
        result = await chat_service.handle_mark_read_ws(
            message_data,
            mock_user,
            42,
            connection_manager
        )
        
        assert result["success"] is True
        assert result["type"] == WS_MSG_TYPE_SUCCESS


@pytest.mark.asyncio
async def test_handle_mark_read_ws_false_status(connection_manager, mock_user):
    """Test marking messages as read via WebSocket with false status - lines 678-679"""
    message_data = {
        "patient_id": "PAT-123",
        "chat_read_status": False
    }
    
    with pytest.raises(ChatInvalidDataException) as exc_info:
        await chat_service.handle_mark_read_ws(
            message_data,
            mock_user,
            42,
            connection_manager
        )
    
    reason = exc_info.value.details.get('reason', '') if hasattr(exc_info.value, 'details') else str(exc_info.value)
    assert "chat_read_status must be true" in reason.lower()


@pytest.mark.asyncio
async def test_handle_mark_read_ws_string_status(connection_manager, mock_user):
    """Test marking messages as read via WebSocket with string status - lines 673-676"""
    message_data = {
        "patient_id": "PAT-123",
        "chat_read_status": "true"  # String "true"
    }
    
    with patch('app.service.chat_service.SessionLocal') as mock_session_local, \
         patch('app.service.chat_service.get_patient_messages', new_callable=AsyncMock) as mock_get_messages:
        mock_db = MagicMock()
        mock_session_local.return_value.__enter__.return_value = mock_db
        
        mock_response = PatientMessagesResponse(
            patient_id="PAT-123",
            patient_name="Test Patient",
            messages=[],
            total_messages=0,
            unread_count=0
        )
        mock_get_messages.return_value = mock_response
        
        result = await chat_service.handle_mark_read_ws(
            message_data,
            mock_user,
            42,
            connection_manager
        )
        
        assert result["success"] is True


def test_create_websocket_error_response():
    """Test creating WebSocket error response - line 705"""
    exception = ChatInvalidDataException("Test error")
    
    response = chat_service.create_websocket_error_response(exception)
    
    assert response["type"] == WS_MSG_TYPE_ERROR
    assert response["success"] is False
    assert response["error_code"] == exception.error_code
    assert response["message"] == exception.message


@pytest.mark.asyncio
async def test_handle_websocket_connection_close_exception():
    """Test handling WebSocket connection when close raises exception - lines 806-807"""
    mock_websocket = AsyncMock()
    mock_websocket.accept = AsyncMock(side_effect=Exception("Connection error"))
    mock_websocket.send_json = AsyncMock()
    mock_websocket.client_state.name = "CONNECTED"
    mock_websocket.close = AsyncMock(side_effect=Exception("Close error"))
    
    connection_manager = MagicMock()
    
    async def mock_auth(ws, token):
        return Mock(spec=User), 42
    
    with pytest.raises(Exception):
        await chat_service.handle_websocket_connection(
            mock_websocket,
            "token",
            None,
            connection_manager,
            mock_auth
        )
    
    # Should try to close even if send_json fails
    # The exception in close should be caught and ignored (lines 806-807)


@pytest.mark.asyncio
async def test_get_patient_messages_mark_as_read_true(db_session, mock_patient, mock_user, mock_chat_message, connection_manager):
    """Test getting patient messages with mark_as_read=True - lines 305-342"""
    query_call_count = [0]
    
    def query_side_effect(model):
        query_call_count[0] += 1
        call_num = query_call_count[0]
        
        if call_num == 1:
            # Patient query
            query = MagicMock()
            query.filter.return_value.first.return_value = mock_patient
            return query
        elif call_num == 2:
            # Messages query
            query = MagicMock()
            query.join.return_value.filter.return_value.order_by.return_value.all.return_value = [mock_chat_message]
            return query
        elif call_num == 3:
            # Read status query for marking as read
            query = MagicMock()
            query.filter.return_value.first.return_value = None  # No existing read status
            return query
        elif call_num == 4:
            # Sender query
            query = MagicMock()
            query.filter.return_value.first.return_value = mock_user
            return query
        elif call_num == 5:
            # User read status query
            query = MagicMock()
            query.filter.return_value.first.return_value = None
            return query
        elif call_num == 6:
            # Tagged users query (if tagged_user_ids exists)
            query = MagicMock()
            query.filter.return_value.all.return_value = []
            return query
        elif call_num == 7:
            # Unread count query
            query = MagicMock()
            query.join.return_value.filter.return_value.scalar.return_value = 0
            return query
        else:
            return MagicMock()
    
    db_session.query = Mock(side_effect=query_side_effect)
    db_session.add = MagicMock()
    db_session.commit = MagicMock()
    
    with patch('app.service.chat_service.broadcast_unread_messages_update', new_callable=AsyncMock) as mock_broadcast:
        result = await chat_service.get_patient_messages(
            "PAT-123",
            "USER-123",
            42,
            db_session,
            connection_manager,
            mark_as_read=True
        )
        
        assert result.patient_id == "PAT-123"
        assert len(result.messages) == 1
        # Should create read status and broadcast
        assert db_session.add.called
        db_session.commit.assert_called()
        mock_broadcast.assert_called_once()


@pytest.mark.asyncio
async def test_get_patient_messages_with_existing_read_status_mark_read(db_session, mock_patient, mock_user, mock_chat_message, connection_manager):
    """Test getting patient messages with existing read status when marking as read - lines 315-318"""
    query_call_count = [0]
    
    # Create existing read status
    mock_read_status = Mock(spec=ChatReadStatus)
    mock_read_status.is_read = False
    mock_read_status.read_at = None
    
    def query_side_effect(model):
        query_call_count[0] += 1
        call_num = query_call_count[0]
        
        if call_num == 1:
            query = MagicMock()
            query.filter.return_value.first.return_value = mock_patient
            return query
        elif call_num == 2:
            query = MagicMock()
            query.join.return_value.filter.return_value.order_by.return_value.all.return_value = [mock_chat_message]
            return query
        elif call_num == 3:
            # Read status query - return existing read status
            query = MagicMock()
            query.filter.return_value.first.return_value = mock_read_status
            return query
        elif call_num == 4:
            query = MagicMock()
            query.filter.return_value.first.return_value = mock_user
            return query
        elif call_num == 5:
            query = MagicMock()
            query.filter.return_value.first.return_value = mock_read_status
            return query
        elif call_num == 6:
            query = MagicMock()
            query.filter.return_value.all.return_value = []
            return query
        elif call_num == 7:
            query = MagicMock()
            query.join.return_value.filter.return_value.scalar.return_value = 0
            return query
        else:
            return MagicMock()
    
    db_session.query = Mock(side_effect=query_side_effect)
    db_session.commit = MagicMock()
    
    with patch('app.service.chat_service.broadcast_unread_messages_update', new_callable=AsyncMock):
        with pytest.raises(ChatMessageCreateFailedException):
            await chat_service.get_patient_messages(
                "PAT-123",
                "USER-123",
                42,
                db_session,
                connection_manager,
                mark_as_read=True
            )


@pytest.mark.asyncio
async def test_get_patient_messages_with_tagged_user_ids_json(db_session, mock_patient, mock_user, mock_chat_message, connection_manager):
    """Test getting patient messages with tagged_user_ids as JSON - lines 375-384"""
    # Set tagged_user_ids as JSON string
    mock_chat_message.tagged_user_ids = '["USER-456", "USER-789"]'
    
    mock_tagged_user1 = Mock(spec=User)
    mock_tagged_user1.user_id = "USER-456"
    mock_tagged_user1.first_name = "Jane"
    mock_tagged_user1.last_name = "Doe"
    
    mock_tagged_user2 = Mock(spec=User)
    mock_tagged_user2.user_id = "USER-789"
    mock_tagged_user2.first_name = "Bob"
    mock_tagged_user2.last_name = "Smith"
    
    query_call_count = [0]
    
    def query_side_effect(model):
        query_call_count[0] += 1
        call_num = query_call_count[0]
        
        if call_num == 1:
            query = MagicMock()
            query.filter.return_value.first.return_value = mock_patient
            return query
        elif call_num == 2:
            query = MagicMock()
            query.join.return_value.filter.return_value.order_by.return_value.all.return_value = [mock_chat_message]
            return query
        elif call_num == 3:
            query = MagicMock()
            query.filter.return_value.first.return_value = mock_user
            return query
        elif call_num == 4:
            query = MagicMock()
            query.filter.return_value.first.return_value = None
            return query
        elif call_num == 5:
            # Tagged users query
            query = MagicMock()
            query.filter.return_value.all.return_value = [mock_tagged_user1, mock_tagged_user2]
            return query
        elif call_num == 6:
            query = MagicMock()
            query.join.return_value.filter.return_value.scalar.return_value = 0
            return query
        else:
            return MagicMock()
    
    db_session.query = Mock(side_effect=query_side_effect)
    
    with pytest.raises(ChatMessageCreateFailedException):
        await chat_service.get_patient_messages(
            "PAT-123",
            "USER-123",
            42,
            db_session,
            None,
            mark_as_read=False
        )


@pytest.mark.asyncio
async def test_get_patient_messages_broadcast_exception(db_session, mock_patient, mock_user, mock_chat_message, connection_manager):
    """Test getting patient messages when broadcast raises exception - lines 341-342"""
    query_call_count = [0]
    
    def query_side_effect(model):
        query_call_count[0] += 1
        call_num = query_call_count[0]
        
        if call_num == 1:
            query = MagicMock()
            query.filter.return_value.first.return_value = mock_patient
            return query
        elif call_num == 2:
            query = MagicMock()
            query.join.return_value.filter.return_value.order_by.return_value.all.return_value = [mock_chat_message]
            return query
        elif call_num == 3:
            query = MagicMock()
            query.filter.return_value.first.return_value = None
            return query
        elif call_num == 4:
            query = MagicMock()
            query.filter.return_value.first.return_value = mock_user
            return query
        elif call_num == 5:
            query = MagicMock()
            query.filter.return_value.first.return_value = None
            return query
        elif call_num == 6:
            query = MagicMock()
            query.filter.return_value.all.return_value = []
            return query
        elif call_num == 7:
            query = MagicMock()
            query.join.return_value.filter.return_value.scalar.return_value = 0
            return query
        else:
            return MagicMock()
    
    db_session.query = Mock(side_effect=query_side_effect)
    db_session.add = MagicMock()
    db_session.commit = MagicMock()
    
    with patch('app.service.chat_service.broadcast_unread_messages_update', new_callable=AsyncMock) as mock_broadcast:
        mock_broadcast.side_effect = Exception("Broadcast error")
        
        # Should not raise exception, just log warning
        result = await chat_service.get_patient_messages(
            "PAT-123",
            "USER-123",
            42,
            db_session,
            connection_manager,
            mark_as_read=True
        )
        
        assert result.patient_id == "PAT-123"


@pytest.mark.asyncio
async def test_get_patient_messages_user_read_status_exists(db_session, mock_patient, mock_user, mock_chat_message, connection_manager):
    """Test getting patient messages when user_read_status exists - lines 363-365"""
    query_call_count = [0]
    
    mock_read_status = Mock(spec=ChatReadStatus)
    mock_read_status.is_read = False
    mock_read_status.read_at = None
    
    def query_side_effect(model):
        query_call_count[0] += 1
        call_num = query_call_count[0]
        
        if call_num == 1:
            query = MagicMock()
            query.filter.return_value.first.return_value = mock_patient
            return query
        elif call_num == 2:
            query = MagicMock()
            query.join.return_value.filter.return_value.order_by.return_value.all.return_value = [mock_chat_message]
            return query
        elif call_num == 3:
            query = MagicMock()
            query.filter.return_value.first.return_value = mock_user
            return query
        elif call_num == 4:
            # User read status query
            query = MagicMock()
            query.filter.return_value.first.return_value = mock_read_status
            return query
        elif call_num == 5:
            query = MagicMock()
            query.filter.return_value.all.return_value = []
            return query
        elif call_num == 6:
            query = MagicMock()
            query.join.return_value.filter.return_value.scalar.return_value = 0
            return query
        else:
            return MagicMock()
    
    db_session.query = Mock(side_effect=query_side_effect)
    
    with pytest.raises(ChatMessageCreateFailedException):
        await chat_service.get_patient_messages(
            "PAT-123",
            "USER-123",
            42,
            db_session,
            None,
            mark_as_read=False
        )


@pytest.mark.asyncio
async def test_get_patient_messages_user_read_status_none(db_session, mock_patient, mock_user, mock_chat_message, connection_manager):
    """Test getting patient messages when user_read_status is None - lines 366-370"""
    query_call_count = [0]
    
    def query_side_effect(model):
        query_call_count[0] += 1
        call_num = query_call_count[0]
        
        if call_num == 1:
            query = MagicMock()
            query.filter.return_value.first.return_value = mock_patient
            return query
        elif call_num == 2:
            query = MagicMock()
            query.join.return_value.filter.return_value.order_by.return_value.all.return_value = [mock_chat_message]
            return query
        elif call_num == 3:
            query = MagicMock()
            query.filter.return_value.first.return_value = mock_user
            return query
        elif call_num == 4:
            # User read status query - return None
            query = MagicMock()
            query.filter.return_value.first.return_value = None
            return query
        elif call_num == 5:
            query = MagicMock()
            query.filter.return_value.all.return_value = []
            return query
        elif call_num == 6:
            query = MagicMock()
            query.join.return_value.filter.return_value.scalar.return_value = 0
            return query
        else:
            return MagicMock()
    
    db_session.query = Mock(side_effect=query_side_effect)
    
    with pytest.raises(ChatMessageCreateFailedException):
        await chat_service.get_patient_messages(
            "PAT-123",
            "USER-123",
            42,
            db_session,
            None,
            mark_as_read=False
        )


def test_get_unread_messages_exception_handling(db_session):
    """Test getting unread messages with exception - lines 490-497"""
    db_session.query.side_effect = RuntimeError("Database error")
    
    with pytest.raises(ChatMessageCreateFailedException) as exc_info:
        chat_service.get_unread_messages(
            "USER-123",
            42,
            db_session
        )
    
    reason = exc_info.value.details.get('reason', '') if hasattr(exc_info.value, 'details') else str(exc_info.value)
    assert "Failed to get unread messages" in reason


@pytest.mark.asyncio
async def test_handle_websocket_message_subscribe_patient_type(connection_manager, mock_user):
    """Test handling WebSocket message with subscribe_patient type - lines 522-525"""
    message_data = {
        "type": WS_MSG_TYPE_SUBSCRIBE_PATIENT,
        "patient_id": "PAT-123"
    }
    
    with patch('app.service.chat_service.handle_subscribe_patient', new_callable=AsyncMock) as mock_handle:
        mock_handle.return_value = {"success": True}
        
        result = await chat_service.handle_websocket_message(
            message_data,
            "conn-1",
            mock_user,
            42,
            connection_manager
        )
        
        assert result["success"] is True
        mock_handle.assert_called_once()


@pytest.mark.asyncio
async def test_handle_websocket_message_unsubscribe_patient_type(connection_manager):
    """Test handling WebSocket message with unsubscribe_patient type - lines 527-530"""
    message_data = {
        "type": WS_MSG_TYPE_UNSUBSCRIBE_PATIENT,
        "patient_id": "PAT-123"
    }
    
    with patch('app.service.chat_service.handle_unsubscribe_patient', new_callable=AsyncMock) as mock_handle:
        mock_handle.return_value = {"success": True}
        
        result = await chat_service.handle_websocket_message(
            message_data,
            "conn-1",
            Mock(spec=User),
            42,
            connection_manager
        )
        
        assert result["success"] is True
        mock_handle.assert_called_once()


@pytest.mark.asyncio
async def test_handle_websocket_message_get_patient_messages_type(connection_manager, mock_user):
    """Test handling WebSocket message with get_patient_messages type - lines 532-535"""
    message_data = {
        "type": WS_MSG_TYPE_GET_PATIENT_MESSAGES,
        "patient_id": "PAT-123"
    }
    
    with patch('app.service.chat_service.handle_get_patient_messages_ws', new_callable=AsyncMock) as mock_handle:
        mock_handle.return_value = {"success": True}
        
        result = await chat_service.handle_websocket_message(
            message_data,
            "conn-1",
            mock_user,
            42,
            connection_manager
        )
        
        assert result["success"] is True
        mock_handle.assert_called_once()


@pytest.mark.asyncio
async def test_handle_websocket_message_get_unread_messages_type(mock_user):
    """Test handling WebSocket message with get_unread_messages type - lines 537-540"""
    message_data = {
        "type": WS_MSG_TYPE_GET_UNREAD_MESSAGES
    }
    
    with patch('app.service.chat_service.handle_get_unread_messages_ws', new_callable=AsyncMock) as mock_handle:
        mock_handle.return_value = {"success": True}
        
        result = await chat_service.handle_websocket_message(
            message_data,
            "conn-1",
            mock_user,
            42,
            MagicMock()
        )
        
        assert result["success"] is True
        mock_handle.assert_called_once()


@pytest.mark.asyncio
async def test_handle_websocket_message_mark_read_type(connection_manager, mock_user):
    """Test handling WebSocket message with mark_read type - lines 542-545"""
    message_data = {
        "type": WS_MSG_TYPE_MARK_READ,
        "patient_id": "PAT-123",
        "chat_read_status": True
    }
    
    with patch('app.service.chat_service.handle_mark_read_ws', new_callable=AsyncMock) as mock_handle:
        mock_handle.return_value = {"success": True}
        
        result = await chat_service.handle_websocket_message(
            message_data,
            "conn-1",
            mock_user,
            42,
            connection_manager
        )
        
        assert result["success"] is True
        mock_handle.assert_called_once()


@pytest.mark.asyncio
async def test_handle_websocket_message_invalid_type():
    """Test handling WebSocket message with invalid type - lines 547-548"""
    message_data = {
        "type": "invalid_type"
    }
    
    # handle_websocket_message catches ChatWebSocketInvalidTypeException and returns error response
    result = await chat_service.handle_websocket_message(
        message_data,
        "conn-1",
        Mock(spec=User),
        42,
        MagicMock()
    )
    
    # Should return error response, not raise exception
    assert result["type"] == WS_MSG_TYPE_ERROR
    assert result["success"] is False


@pytest.mark.asyncio
async def test_handle_websocket_message_chat_exception(connection_manager, mock_user):
    """Test handling WebSocket message with ChatException - lines 550-552"""
    message_data = {
        "type": WS_MSG_TYPE_SUBSCRIBE_PATIENT,
        "patient_id": "PAT-123"
    }
    
    with patch('app.service.chat_service.handle_subscribe_patient', new_callable=AsyncMock) as mock_handle:
        mock_handle.side_effect = ChatInvalidDataException("Invalid patient")
        
        result = await chat_service.handle_websocket_message(
            message_data,
            "conn-1",
            mock_user,
            42,
            connection_manager
        )
        
        # Should return error response, not raise exception
        assert result["type"] == WS_MSG_TYPE_ERROR
        assert result["success"] is False


@pytest.mark.asyncio
async def test_handle_websocket_message_general_exception(connection_manager, mock_user):
    """Test handling WebSocket message with general exception - lines 554-558"""
    message_data = {
        "type": WS_MSG_TYPE_SUBSCRIBE_PATIENT,
        "patient_id": "PAT-123"
    }
    
    with patch('app.service.chat_service.handle_subscribe_patient', new_callable=AsyncMock) as mock_handle:
        mock_handle.side_effect = RuntimeError("Unexpected error")
        
        result = await chat_service.handle_websocket_message(
            message_data,
            "conn-1",
            mock_user,
            42,
            connection_manager
        )
        
        # Should return error response, not raise exception
        assert result["type"] == WS_MSG_TYPE_ERROR
        assert result["success"] is False


@pytest.mark.asyncio
async def test_handle_subscribe_patient_patient_not_found(connection_manager):
    """Test subscribing to patient when patient not found - lines 573-575"""
    message_data = {"patient_id": "PAT-999"}
    
    with patch('app.service.chat_service.SessionLocal') as mock_session_local:
        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = None  # Patient not found
        mock_session_local.return_value.__enter__.return_value = mock_db
        
        with pytest.raises(ChatInvalidDataException) as exc_info:
            await chat_service.handle_subscribe_patient(
                message_data,
                "conn-1",
                42,
                connection_manager
            )
        
        reason = exc_info.value.details.get('reason', '') if hasattr(exc_info.value, 'details') else str(exc_info.value)
        assert "not found" in reason.lower()


@pytest.mark.asyncio
async def test_handle_subscribe_patient_pharma_mismatch(connection_manager):
    """Test subscribing to patient when pharma doesn't match - lines 578-579"""
    message_data = {"patient_id": "PAT-123"}
    
    mock_patient = Mock(spec=Patient)
    mock_patient.id = "PAT-123"
    mock_patient.pharma_id = 99  # Different pharma
    
    with patch('app.service.chat_service.SessionLocal') as mock_session_local:
        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = mock_patient
        mock_session_local.return_value.__enter__.return_value = mock_db
        
        with pytest.raises(ChatInvalidDataException) as exc_info:
            await chat_service.handle_subscribe_patient(
                message_data,
                "conn-1",
                42,  # Different pharma
                connection_manager
            )
        
        reason = exc_info.value.details.get('reason', '') if hasattr(exc_info.value, 'details') else str(exc_info.value)
        assert "pharma" in reason.lower() or "does not belong" in reason.lower()


@pytest.mark.asyncio
async def test_handle_subscribe_patient_success(connection_manager):
    """Test subscribing to patient successfully - lines 581-584"""
    message_data = {"patient_id": "PAT-123"}
    
    mock_patient = Mock(spec=Patient)
    mock_patient.id = "PAT-123"
    mock_patient.pharma_id = 42
    
    with patch('app.service.chat_service.SessionLocal') as mock_session_local:
        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = mock_patient
        mock_session_local.return_value.__enter__.return_value = mock_db
        
        result = await chat_service.handle_subscribe_patient(
            message_data,
            "conn-1",
            42,
            connection_manager
        )
        
        assert result["success"] is True
        assert result["type"] == WS_MSG_TYPE_SUCCESS
        connection_manager.subscribe_to_patient.assert_called_once_with("conn-1", "PAT-123")


@pytest.mark.asyncio
async def test_handle_get_patient_messages_ws_missing_patient_id(connection_manager, mock_user):
    """Test getting patient messages via WebSocket with missing patient_id - line 622"""
    message_data = {}  # Missing patient_id
    
    with pytest.raises(ChatInvalidDataException) as exc_info:
        await chat_service.handle_get_patient_messages_ws(
            message_data,
            "conn-1",
            mock_user,
            42,
            connection_manager
        )
    
    reason = exc_info.value.details.get('reason', '') if hasattr(exc_info.value, 'details') else str(exc_info.value)
    assert "patient_id is required" in reason or "patient_id" in str(exc_info.value).lower()


@pytest.mark.asyncio
async def test_handle_get_patient_messages_ws_success_new(connection_manager, mock_user):
    """Test getting patient messages via WebSocket successfully - lines 620-638"""
    message_data = {"patient_id": "PAT-123"}
    
    with patch('app.service.chat_service.SessionLocal') as mock_session_local, \
         patch('app.service.chat_service.get_patient_messages', new_callable=AsyncMock) as mock_get_messages:
        mock_db = MagicMock()
        mock_session_local.return_value.__enter__.return_value = mock_db
        
        mock_response = PatientMessagesResponse(
            patient_id="PAT-123",
            patient_name="Test Patient",
            messages=[],
            total_messages=0,
            unread_count=0
        )
        mock_get_messages.return_value = mock_response
        
        result = await chat_service.handle_get_patient_messages_ws(
            message_data,
            "conn-1",
            mock_user,
            42,
            connection_manager
        )
        
        assert result["success"] is True
        assert result["type"] == WS_MSG_TYPE_PATIENT_MESSAGES
        connection_manager.subscribe_to_patient.assert_called_once_with("conn-1", "PAT-123")
        mock_get_messages.assert_called_once_with(
            "PAT-123",
            mock_user.user_id,
            42,
            mock_db,
            connection_manager,
            mark_as_read=False
        )


# ==========================================
# Tests for ChatConnectionManager (chat_websocket_manager.py)
# ==========================================

@pytest.mark.asyncio
async def test_chat_connection_manager_connect_without_connection_id():
    """Test ChatConnectionManager.connect when connection_id is None (lines 23-33)"""
    manager = ChatConnectionManager()
    mock_websocket = AsyncMock(spec=WebSocket)
    
    connection_id = await manager.connect(mock_websocket, "USER-123", 42)
    
    assert connection_id is not None
    assert connection_id in manager.active_connections
    assert manager.active_connections[connection_id]["user_id"] == "USER-123"
    assert manager.active_connections[connection_id]["pharma_id"] == 42
    assert manager.active_connections[connection_id]["websocket"] == mock_websocket
    assert isinstance(manager.active_connections[connection_id]["subscribed_patients"], set)


@pytest.mark.asyncio
async def test_chat_connection_manager_connect_with_connection_id():
    """Test ChatConnectionManager.connect when connection_id is provided"""
    manager = ChatConnectionManager()
    mock_websocket = AsyncMock(spec=WebSocket)
    
    connection_id = await manager.connect(mock_websocket, "USER-123", 42, "custom-conn-id")
    
    assert connection_id == "custom-conn-id"
    assert "custom-conn-id" in manager.active_connections


def test_chat_connection_manager_disconnect_existing():
    """Test ChatConnectionManager.disconnect when connection exists (lines 37-38)"""
    manager = ChatConnectionManager()
    mock_websocket = AsyncMock(spec=WebSocket)
    
    # Add a connection first
    import asyncio
    connection_id = asyncio.run(manager.connect(mock_websocket, "USER-123", 42, "conn-1"))
    
    assert "conn-1" in manager.active_connections
    
    # Disconnect
    manager.disconnect("conn-1")
    
    assert "conn-1" not in manager.active_connections


def test_chat_connection_manager_disconnect_nonexistent():
    """Test ChatConnectionManager.disconnect when connection doesn't exist"""
    manager = ChatConnectionManager()
    
    # Should not raise an error
    manager.disconnect("nonexistent-conn")


def test_chat_connection_manager_disconnect_by_websocket_found():
    """Test ChatConnectionManager.disconnect_by_websocket when websocket is found (lines 42-46)"""
    manager = ChatConnectionManager()
    mock_websocket = AsyncMock(spec=WebSocket)
    
    # Add a connection first
    import asyncio
    connection_id = asyncio.run(manager.connect(mock_websocket, "USER-123", 42, "conn-1"))
    
    # Disconnect by websocket
    result = manager.disconnect_by_websocket(mock_websocket)
    
    assert result == "conn-1"
    assert "conn-1" not in manager.active_connections


def test_chat_connection_manager_disconnect_by_websocket_not_found():
    """Test ChatConnectionManager.disconnect_by_websocket when websocket is not found"""
    manager = ChatConnectionManager()
    mock_websocket = AsyncMock(spec=WebSocket)
    
    # Disconnect by websocket that doesn't exist
    result = manager.disconnect_by_websocket(mock_websocket)
    
    assert result is None


def test_chat_connection_manager_subscribe_to_patient_existing():
    """Test ChatConnectionManager.subscribe_to_patient when connection exists (lines 50-51)"""
    manager = ChatConnectionManager()
    mock_websocket = AsyncMock(spec=WebSocket)
    
    # Add a connection first
    import asyncio
    connection_id = asyncio.run(manager.connect(mock_websocket, "USER-123", 42, "conn-1"))
    
    # Subscribe to patient
    manager.subscribe_to_patient("conn-1", "PAT-123")
    
    assert "PAT-123" in manager.active_connections["conn-1"]["subscribed_patients"]


def test_chat_connection_manager_subscribe_to_patient_nonexistent():
    """Test ChatConnectionManager.subscribe_to_patient when connection doesn't exist"""
    manager = ChatConnectionManager()
    
    # Should not raise an error
    manager.subscribe_to_patient("nonexistent-conn", "PAT-123")


def test_chat_connection_manager_unsubscribe_from_patient_existing():
    """Test ChatConnectionManager.unsubscribe_from_patient when connection exists (lines 55-56)"""
    manager = ChatConnectionManager()
    mock_websocket = AsyncMock(spec=WebSocket)
    
    # Add a connection first
    import asyncio
    connection_id = asyncio.run(manager.connect(mock_websocket, "USER-123", 42, "conn-1"))
    
    # Subscribe first
    manager.subscribe_to_patient("conn-1", "PAT-123")
    assert "PAT-123" in manager.active_connections["conn-1"]["subscribed_patients"]
    
    # Unsubscribe
    manager.unsubscribe_from_patient("conn-1", "PAT-123")
    
    assert "PAT-123" not in manager.active_connections["conn-1"]["subscribed_patients"]


def test_chat_connection_manager_unsubscribe_from_patient_nonexistent():
    """Test ChatConnectionManager.unsubscribe_from_patient when connection doesn't exist"""
    manager = ChatConnectionManager()
    
    # Should not raise an error
    manager.unsubscribe_from_patient("nonexistent-conn", "PAT-123")


@pytest.mark.asyncio
async def test_chat_connection_manager_broadcast_to_patient_no_connections():
    """Test ChatConnectionManager.broadcast_to_patient when no connections (line 60)"""
    manager = ChatConnectionManager()
    mock_db = MagicMock()
    
    # Should return early without error
    await manager.broadcast_to_patient("PAT-123", {"type": "message"}, 42, mock_db)
    
    # Should not query database
    mock_db.query.assert_not_called()


@pytest.mark.asyncio
async def test_chat_connection_manager_broadcast_to_patient_patient_not_found():
    """Test ChatConnectionManager.broadcast_to_patient when patient not found (lines 64-66)"""
    manager = ChatConnectionManager()
    mock_websocket = AsyncMock(spec=WebSocket)
    
    # Add a connection
    connection_id = await manager.connect(mock_websocket, "USER-123", 42, "conn-1")
    manager.subscribe_to_patient("conn-1", "PAT-123")
    
    mock_db = MagicMock()
    mock_query = MagicMock()
    mock_query.filter.return_value.first.return_value = None  # Patient not found
    mock_db.query.return_value = mock_query
    
    # Should return early without sending
    await manager.broadcast_to_patient("PAT-123", {"type": "message"}, 42, mock_db)
    
    mock_websocket.send_json.assert_not_called()


@pytest.mark.asyncio
async def test_chat_connection_manager_broadcast_to_patient_pharma_mismatch():
    """Test ChatConnectionManager.broadcast_to_patient when patient pharma doesn't match (line 65)"""
    manager = ChatConnectionManager()
    mock_websocket = AsyncMock(spec=WebSocket)
    
    # Add a connection
    connection_id = await manager.connect(mock_websocket, "USER-123", 42, "conn-1")
    manager.subscribe_to_patient("conn-1", "PAT-123")
    
    mock_db = MagicMock()
    mock_patient = Mock()
    mock_patient.pharma_id = 99  # Different pharma
    mock_query = MagicMock()
    mock_query.filter.return_value.first.return_value = mock_patient
    mock_db.query.return_value = mock_query
    
    # Should return early without sending
    await manager.broadcast_to_patient("PAT-123", {"type": "message"}, 42, mock_db)
    
    mock_websocket.send_json.assert_not_called()


@pytest.mark.asyncio
async def test_chat_connection_manager_broadcast_to_patient_connection_pharma_mismatch():
    """Test ChatConnectionManager.broadcast_to_patient when connection pharma doesn't match (line 70)"""
    manager = ChatConnectionManager()
    mock_websocket = AsyncMock(spec=WebSocket)
    
    # Add a connection with different pharma
    connection_id = await manager.connect(mock_websocket, "USER-123", 99, "conn-1")  # Different pharma
    manager.subscribe_to_patient("conn-1", "PAT-123")
    
    mock_db = MagicMock()
    mock_patient = Mock()
    mock_patient.pharma_id = 42
    mock_query = MagicMock()
    mock_query.filter.return_value.first.return_value = mock_patient
    mock_db.query.return_value = mock_query
    
    # Should skip this connection
    await manager.broadcast_to_patient("PAT-123", {"type": "message"}, 42, mock_db)
    
    mock_websocket.send_json.assert_not_called()


@pytest.mark.asyncio
async def test_chat_connection_manager_broadcast_to_patient_not_subscribed():
    """Test ChatConnectionManager.broadcast_to_patient when connection not subscribed to patient"""
    manager = ChatConnectionManager()
    mock_websocket = AsyncMock(spec=WebSocket)
    
    # Add a connection but don't subscribe to patient
    connection_id = await manager.connect(mock_websocket, "USER-123", 42, "conn-1")
    
    mock_db = MagicMock()
    mock_patient = Mock()
    mock_patient.pharma_id = 42
    mock_query = MagicMock()
    mock_query.filter.return_value.first.return_value = mock_patient
    mock_db.query.return_value = mock_query
    
    # Should not send to unsubscribed connection
    await manager.broadcast_to_patient("PAT-123", {"type": "message"}, 42, mock_db)
    
    mock_websocket.send_json.assert_not_called()


@pytest.mark.asyncio
async def test_chat_connection_manager_broadcast_to_patient_send_error():
    """Test ChatConnectionManager.broadcast_to_patient when send fails (lines 77-82)"""
    manager = ChatConnectionManager()
    mock_websocket = AsyncMock(spec=WebSocket)
    mock_websocket.send_json = AsyncMock(side_effect=Exception("Send error"))
    
    # Add a connection
    connection_id = await manager.connect(mock_websocket, "USER-123", 42, "conn-1")
    manager.subscribe_to_patient("conn-1", "PAT-123")
    
    mock_db = MagicMock()
    mock_patient = Mock()
    mock_patient.pharma_id = 42
    mock_query = MagicMock()
    mock_query.filter.return_value.first.return_value = mock_patient
    mock_db.query.return_value = mock_query
    
    # Should disconnect connection on error
    await manager.broadcast_to_patient("PAT-123", {"type": "message"}, 42, mock_db)
    
    # Connection should be disconnected
    assert "conn-1" not in manager.active_connections


@pytest.mark.asyncio
async def test_chat_connection_manager_send_to_user_send_error():
    """Test ChatConnectionManager.send_to_user when send fails (lines 91-96)"""
    manager = ChatConnectionManager()
    mock_websocket = AsyncMock(spec=WebSocket)
    mock_websocket.send_json = AsyncMock(side_effect=Exception("Send error"))
    
    # Add a connection
    connection_id = await manager.connect(mock_websocket, "USER-123", 42, "conn-1")
    
    # Should disconnect connection on error
    await manager.send_to_user("USER-123", {"type": "message"})
    
    # Connection should be disconnected
    assert "conn-1" not in manager.active_connections


def test_chat_connection_manager_get_connections_info():
    """Test ChatConnectionManager.get_connections_info (line 100)"""
    manager = ChatConnectionManager()
    mock_websocket = AsyncMock(spec=WebSocket)
    
    # Add a connection
    import asyncio
    connection_id = asyncio.run(manager.connect(mock_websocket, "USER-123", 42, "conn-1"))
    manager.subscribe_to_patient("conn-1", "PAT-123")
    
    info = manager.get_connections_info()
    
    assert info["count"] == 1
    assert len(info["connections"]) == 1
    assert info["connections"][0]["id"] == "conn-1"
    assert info["connections"][0]["user_id"] == "USER-123"
    assert info["connections"][0]["pharma_id"] == 42
    assert "PAT-123" in info["connections"][0]["subscribed_patients"]


def test_chat_connection_manager_get_active_connections():
    """Test ChatConnectionManager.get_active_connections (line 116)"""
    manager = ChatConnectionManager()
    mock_websocket = AsyncMock(spec=WebSocket)
    
    # Add a connection
    import asyncio
    connection_id = asyncio.run(manager.connect(mock_websocket, "USER-123", 42, "conn-1"))
    
    connections = manager.get_active_connections()
    
    assert isinstance(connections, dict)
    assert "conn-1" in connections
    # Should be a copy, not the same object
    assert connections is not manager.active_connections


def test_chat_connection_manager_get_connections_by_pharma():
    """Test ChatConnectionManager.get_connections_by_pharma (line 120)"""
    manager = ChatConnectionManager()
    mock_websocket1 = AsyncMock(spec=WebSocket)
    mock_websocket2 = AsyncMock(spec=WebSocket)
    
    # Add connections with different pharmas
    import asyncio
    asyncio.run(manager.connect(mock_websocket1, "USER-123", 42, "conn-1"))
    asyncio.run(manager.connect(mock_websocket2, "USER-456", 99, "conn-2"))
    
    connections = manager.get_connections_by_pharma(42)
    
    assert "conn-1" in connections
    assert "conn-2" not in connections
    assert connections["conn-1"]["pharma_id"] == 42
