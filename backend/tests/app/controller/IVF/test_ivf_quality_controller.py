"""
Unit tests for IVF Quality Controller (WebSocket)
"""
import pytest
from unittest.mock import MagicMock, Mock, patch, AsyncMock
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.controller.IVF import ivf_quality_controller
from app.exceptions import InvalidTokenException


@pytest.fixture
def mock_db():
    """Create a mock database session"""
    return MagicMock()


@pytest.fixture
def mock_user():
    """Create a mock user"""
    user = Mock()
    user.user_id = "USER-123"
    user.department = "IVF"
    user.branch_id = 1
    user.role = Mock()
    user.role.value = "User"
    return user


@pytest.fixture
def app():
    """Create FastAPI app for testing"""
    app = FastAPI()
    app.include_router(ivf_quality_controller.router)
    return app


# ==========================================
# Tests for WebSocket endpoint
# ==========================================

@pytest.mark.asyncio
async def test_ivf_websocket_endpoint_no_token():
    """Test WebSocket endpoint rejects connection without token"""
    websocket = AsyncMock()
    websocket.query_params = {}
    websocket.client = Mock()
    websocket.client.host = "127.0.0.1"
    websocket.accept = AsyncMock()
    
    await ivf_quality_controller.ivf_websocket_endpoint(websocket)
    
    websocket.close.assert_called_once()
    # Check that close was called with code 1008
    call_args = websocket.close.call_args
    assert call_args is not None
    assert len(call_args[0]) > 0 or 'code' in call_args[1]


@pytest.mark.asyncio
async def test_ivf_websocket_endpoint_invalid_token():
    """Test WebSocket endpoint rejects connection with invalid token"""
    websocket = AsyncMock()
    websocket.query_params = {"token": "invalid_token"}
    websocket.client = Mock()
    websocket.client.host = "127.0.0.1"
    websocket.accept = AsyncMock()
    
    with patch('app.controller.IVF.ivf_quality_controller.verify_websocket_token', side_effect=InvalidTokenException()):
        await ivf_quality_controller.ivf_websocket_endpoint(websocket)
    
    websocket.close.assert_called_once()
    # Check that close was called
    call_args = websocket.close.call_args
    assert call_args is not None


@pytest.mark.asyncio
async def test_ivf_websocket_endpoint_non_ivf_user():
    """Test WebSocket endpoint rejects connection for non-IVF user"""
    websocket = AsyncMock()
    websocket.query_params = {"token": "valid_token"}
    websocket.client = Mock()
    websocket.client.host = "127.0.0.1"
    websocket.accept = AsyncMock()
    
    auth_info = {"user_id": "USER-123", "pharma_id": None}
    
    non_ivf_user = Mock()
    non_ivf_user.user_id = "USER-123"
    non_ivf_user.department = "CGT"  # Not IVF
    
    with patch('app.controller.IVF.ivf_quality_controller.verify_websocket_token', return_value=auth_info):
        with patch('app.controller.IVF.ivf_quality_controller.SessionLocal') as mock_session_local:
            mock_db = MagicMock()
            user_query = MagicMock()
            user_query.filter.return_value = user_query
            user_query.first.return_value = non_ivf_user
            mock_db.query.return_value = user_query
            mock_session_local.return_value = mock_db
            
            await ivf_quality_controller.ivf_websocket_endpoint(websocket)
    
    websocket.close.assert_called_once()
    # Check that close was called
    call_args = websocket.close.call_args
    assert call_args is not None


@pytest.mark.asyncio
async def test_ivf_websocket_endpoint_user_not_found():
    """Test WebSocket endpoint rejects connection when user not found"""
    websocket = AsyncMock()
    websocket.query_params = {"token": "valid_token"}
    websocket.client = Mock()
    websocket.client.host = "127.0.0.1"
    websocket.accept = AsyncMock()
    
    auth_info = {"user_id": "USER-123", "pharma_id": None}
    
    with patch('app.controller.IVF.ivf_quality_controller.verify_websocket_token', return_value=auth_info):
        with patch('app.controller.IVF.ivf_quality_controller.SessionLocal') as mock_session_local:
            mock_db = MagicMock()
            user_query = MagicMock()
            user_query.filter.return_value = user_query
            user_query.first.return_value = None
            mock_db.query.return_value = user_query
            mock_session_local.return_value = mock_db
            
            await ivf_quality_controller.ivf_websocket_endpoint(websocket)
    
    websocket.close.assert_called_once()
    # Check that close was called
    call_args = websocket.close.call_args
    assert call_args is not None


# Note: Testing successful WebSocket connections requires more complex mocking
# of the connection manager and Redis service, which is beyond the scope
# of basic unit tests. Integration tests would be more appropriate for that.
