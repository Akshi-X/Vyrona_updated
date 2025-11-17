import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from unittest.mock import MagicMock, patch, AsyncMock
from datetime import datetime, timezone

from app.controller import chat_controller
from app.exceptions.custom_exceptions import (
    ChatMessageCreateFailedException, ChatMessageNotFoundException,
    ChatUserNotFoundException, ChatPatientNotFoundException,
    ChatPharmaAccessDeniedException, ChatInvalidDataException
)
from app.schemas.chat_schema import (
    ChatMessageCreateRequest, ChatMessageCreateResponse,
    PatientMessagesResponse, UnreadMessagesResponse
)
from app.models import user_model
from starlette.middleware.base import BaseHTTPMiddleware
from app.middleware.rbac_middleware import RBACMiddleware
from app.middleware.token_validation_middleware import TokenValidationMiddleware
from app.middleware.request_validation_middleware import RequestValidationMiddleware
from app.middleware.patient_validation_middleware import PatientValidationMiddleware
from app.middleware.sanitization_middleware import SanitizationMiddleware
from app.middleware.exception_handler import exception_handler_middleware


def _create_test_client(monkeypatch):
    app = FastAPI()
    app.include_router(chat_controller.router)

    # Add CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Create a mock user for middleware
    class MockUser:
        def __init__(self):
            self.id = 1
            self.user_id = "USER-123"
            self.pharma_id = 42
            self.role = "pharma_admin"
            self.email = "test@example.com"
            self.first_name = "John"
            self.last_name = "Doe"
            self.is_approved = True

    mock_user = MockUser()

    # Create a mock TokenValidationMiddleware
    class MockTokenValidationMiddleware(BaseHTTPMiddleware):
        async def dispatch(self, request: Request, call_next):
            request.state.current_user = mock_user
            request.state.pharma_id = mock_user.pharma_id
            return await call_next(request)

    # Add middleware
    app.add_middleware(RBACMiddleware)
    app.add_middleware(MockTokenValidationMiddleware)
    app.add_middleware(RequestValidationMiddleware)
    app.add_middleware(PatientValidationMiddleware)
    app.add_middleware(SanitizationMiddleware)
    app.add_middleware(BaseHTTPMiddleware, dispatch=exception_handler_middleware)

    db_mock = MagicMock(name="db_session")

    def override_get_db():
        yield db_mock

    from app.config import database
    from app.dependencies import auth_dependencies
    app.dependency_overrides[database.get_db] = override_get_db
    app.dependency_overrides[auth_dependencies.get_current_user] = lambda: mock_user
    app.dependency_overrides[auth_dependencies.get_pharma_id_from_request] = lambda: mock_user.pharma_id

    # Mock services
    service_mocks = {
        'create_chat_message': MagicMock(),
        'get_patient_messages': AsyncMock(),
        'get_unread_messages': MagicMock(),
        'broadcast_new_message': AsyncMock(),
    }

    monkeypatch.setattr(chat_controller, "create_chat_message", service_mocks['create_chat_message'])
    monkeypatch.setattr(chat_controller, "get_patient_messages", service_mocks['get_patient_messages'])
    monkeypatch.setattr(chat_controller, "get_unread_messages", service_mocks['get_unread_messages'])
    monkeypatch.setattr(chat_controller, "broadcast_new_message", service_mocks['broadcast_new_message'])

    client = TestClient(app)
    try:
        yield client, service_mocks, mock_user
    finally:
        client.close()


@pytest.fixture()
def client(monkeypatch):
    yield from _create_test_client(monkeypatch)


# ==========================================
# Tests for POST /chat/messages
# ==========================================

def test_send_chat_message_success(client):
    """Test sending a chat message successfully"""
    test_client, service_mocks, mock_user = client

    mock_response = ChatMessageCreateResponse(
        message_id=123,
        patient_id="PAT-123",
        message_content="Test message",
        sender_id=mock_user.user_id,
        sender_name="John Doe",
        tagged_user_ids=["USER-456"],
        tagged_user_names=["Jane Smith"],
        created_at=datetime.now(timezone.utc)
    )

    service_mocks['create_chat_message'].return_value = mock_response
    service_mocks['broadcast_new_message'].return_value = None

    response = test_client.post("/chat/messages", json={
        "patient_id": "PAT-123",
        "message_content": "Test message",
        "tagged_user_ids": ["USER-456"]
    })

    assert response.status_code == 200
    data = response.json()
    assert data["message_id"] == 123
    assert data["message_content"] == "Test message"
    service_mocks['create_chat_message'].assert_called_once()
    service_mocks['broadcast_new_message'].assert_called_once()


def test_send_chat_message_tag_self_error(client):
    """Test sending a chat message with user tagging themselves"""
    test_client, service_mocks, mock_user = client

    response = test_client.post("/chat/messages", json={
        "patient_id": "PAT-123",
        "message_content": "Test message",
        "tagged_user_ids": [mock_user.user_id]  # Tagging self
    })

    assert response.status_code == 400
    assert "error_code" in response.json()["detail"]


def test_send_chat_message_create_failed_exception(client):
    """Test sending a chat message when creation fails"""
    test_client, service_mocks, mock_user = client

    service_mocks['create_chat_message'].side_effect = ChatMessageCreateFailedException(
        reason="Database error"
    )

    response = test_client.post("/chat/messages", json={
        "patient_id": "PAT-123",
        "message_content": "Test message"
    })

    assert response.status_code == 500
    assert "error_code" in response.json()["detail"]


def test_send_chat_message_user_not_found_exception(client):
    """Test sending a chat message when tagged user not found"""
    test_client, service_mocks, mock_user = client

    service_mocks['create_chat_message'].side_effect = ChatUserNotFoundException(
        user_id="USER-999"
    )

    response = test_client.post("/chat/messages", json={
        "patient_id": "PAT-123",
        "message_content": "Test message",
        "tagged_user_ids": ["USER-999"]
    })

    assert response.status_code == 404
    assert "error_code" in response.json()["detail"]


def test_send_chat_message_patient_not_found_exception(client):
    """Test sending a chat message when patient not found"""
    test_client, service_mocks, mock_user = client

    service_mocks['create_chat_message'].side_effect = ChatPatientNotFoundException(
        patient_id="PAT-999"
    )

    response = test_client.post("/chat/messages", json={
        "patient_id": "PAT-999",
        "message_content": "Test message"
    })

    assert response.status_code == 404
    assert "error_code" in response.json()["detail"]


def test_send_chat_message_pharma_access_denied_exception(client):
    """Test sending a chat message when pharma access denied"""
    test_client, service_mocks, mock_user = client

    service_mocks['create_chat_message'].side_effect = ChatPharmaAccessDeniedException(
        reason="User not in same pharma"
    )

    response = test_client.post("/chat/messages", json={
        "patient_id": "PAT-123",
        "message_content": "Test message",
        "tagged_user_ids": ["USER-456"]
    })

    assert response.status_code == 403
    assert "error_code" in response.json()["detail"]


def test_send_chat_message_invalid_data_exception(client):
    """Test sending a chat message with invalid data"""
    test_client, service_mocks, mock_user = client

    service_mocks['create_chat_message'].side_effect = ChatInvalidDataException(
        reason="Invalid patient ID format"
    )

    response = test_client.post("/chat/messages", json={
        "patient_id": "INVALID",
        "message_content": "Test message"
    })

    assert response.status_code == 400
    assert "error_code" in response.json()["detail"]


def test_send_chat_message_general_exception(client):
    """Test sending a chat message with general exception"""
    test_client, service_mocks, mock_user = client

    service_mocks['create_chat_message'].side_effect = Exception("Unexpected error")

    response = test_client.post("/chat/messages", json={
        "patient_id": "PAT-123",
        "message_content": "Test message"
    })

    assert response.status_code == 500
    data = response.json()
    assert "detail" in data
    assert data["detail"]["error_code"] == "CHAT_INTERNAL_ERROR"


# ==========================================
# Tests for GET /chat/patients/{patient_id}/messages
# ==========================================

def test_get_patient_messages_success(client):
    """Test getting patient messages successfully"""
    test_client, service_mocks, mock_user = client

    mock_response = PatientMessagesResponse(
        patient_id="PAT-123",
        messages=[],
        total_messages=0
    )

    service_mocks['get_patient_messages'].return_value = mock_response

    response = test_client.get("/chat/patients/PAT-123/messages")

    assert response.status_code == 200
    data = response.json()
    assert data["patient_id"] == "PAT-123"
    service_mocks['get_patient_messages'].assert_called_once()


def test_get_patient_messages_patient_not_found_exception(client):
    """Test getting patient messages when patient not found"""
    test_client, service_mocks, mock_user = client

    service_mocks['get_patient_messages'].side_effect = ChatPatientNotFoundException(
        patient_id="PAT-999"
    )

    response = test_client.get("/chat/patients/PAT-999/messages")

    assert response.status_code == 404
    assert "error_code" in response.json()["detail"]


def test_get_patient_messages_user_not_found_exception(client):
    """Test getting patient messages when user not found"""
    test_client, service_mocks, mock_user = client

    service_mocks['get_patient_messages'].side_effect = ChatUserNotFoundException(
        user_id="USER-999"
    )

    response = test_client.get("/chat/patients/PAT-123/messages")

    assert response.status_code == 404
    assert "error_code" in response.json()["detail"]


def test_get_patient_messages_message_not_found_exception(client):
    """Test getting patient messages when messages not found"""
    test_client, service_mocks, mock_user = client

    service_mocks['get_patient_messages'].side_effect = ChatMessageNotFoundException(
        message_id="MSG-999"
    )

    response = test_client.get("/chat/patients/PAT-123/messages")

    assert response.status_code == 404
    assert "error_code" in response.json()["detail"]


def test_get_patient_messages_general_exception(client):
    """Test getting patient messages with general exception"""
    test_client, service_mocks, mock_user = client

    service_mocks['get_patient_messages'].side_effect = Exception("Unexpected error")

    response = test_client.get("/chat/patients/PAT-123/messages")

    assert response.status_code == 500
    data = response.json()
    assert "detail" in data
    assert data["detail"]["error_code"] == "CHAT_INTERNAL_ERROR"


# ==========================================
# Tests for GET /chat/unread
# ==========================================

def test_get_unread_messages_success(client):
    """Test getting unread messages successfully"""
    test_client, service_mocks, mock_user = client

    mock_response = UnreadMessagesResponse(
        unread_messages=[],
        total_unread=0,
        unread_by_patient={}
    )

    service_mocks['get_unread_messages'].return_value = mock_response

    response = test_client.get("/chat/unread")

    assert response.status_code == 200
    data = response.json()
    assert "unread_messages" in data
    assert "total_unread" in data
    assert "unread_by_patient" in data
    service_mocks['get_unread_messages'].assert_called_once()


def test_get_unread_messages_user_not_found_exception(client):
    """Test getting unread messages when user not found"""
    test_client, service_mocks, mock_user = client

    service_mocks['get_unread_messages'].side_effect = ChatUserNotFoundException(
        user_id="USER-999"
    )

    response = test_client.get("/chat/unread")

    assert response.status_code == 404
    assert "error_code" in response.json()["detail"]


def test_get_unread_messages_message_not_found_exception(client):
    """Test getting unread messages when messages not found"""
    test_client, service_mocks, mock_user = client

    service_mocks['get_unread_messages'].side_effect = ChatMessageNotFoundException(
        message_id="MSG-999"
    )

    response = test_client.get("/chat/unread")

    assert response.status_code == 404
    assert "error_code" in response.json()["detail"]


def test_get_unread_messages_general_exception(client):
    """Test getting unread messages with general exception"""
    test_client, service_mocks, mock_user = client

    service_mocks['get_unread_messages'].side_effect = Exception("Unexpected error")

    response = test_client.get("/chat/unread")

    assert response.status_code == 500
    data = response.json()
    assert "detail" in data
    assert data["detail"]["error_code"] == "CHAT_INTERNAL_ERROR"


# ==========================================
# Tests for GET /chat/health
# ==========================================

def test_chat_health_check_success(client):
    """Test chat health check endpoint"""
    test_client, service_mocks, mock_user = client

    response = test_client.get("/chat/health")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["service"] == "chat"
    assert "message" in data

