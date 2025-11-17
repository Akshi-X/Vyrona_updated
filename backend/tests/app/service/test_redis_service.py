import pytest
from unittest.mock import MagicMock, Mock, patch
import redis
from redis.exceptions import ConnectionError as RedisConnectionError

from app.service import redis_service


@pytest.fixture(autouse=True)
def reset_redis_globals():
    """Reset Redis global variables before each test"""
    redis_service._redis_client = None
    redis_service._pubsub = None
    yield
    # Cleanup after test
    redis_service._redis_client = None
    redis_service._pubsub = None


# ==========================================
# Tests for get_redis()
# ==========================================

@patch('app.service.redis_service.settings')
@patch('app.service.redis_service.redis.Redis')
def test_get_redis_success(mock_redis_class, mock_settings, reset_redis_globals):
    """Test get_redis successfully creates and returns Redis client"""
    # Setup mocks
    mock_settings.REDIS_HOST = "localhost"
    mock_settings.REDIS_PORT = 6379
    mock_settings.REDIS_DB = 0
    mock_settings.REDIS_SOCKET_CONNECT_TIMEOUT = 5
    mock_settings.REDIS_SOCKET_TIMEOUT = 5
    
    mock_client = MagicMock()
    mock_client.ping.return_value = True
    mock_redis_class.return_value = mock_client
    
    # Call function
    result = redis_service.get_redis()
    
    # Verify
    assert result == mock_client
    mock_redis_class.assert_called_once_with(
        host="localhost",
        port=6379,
        db=0,
        decode_responses=True,
        socket_connect_timeout=5,
        socket_timeout=5
    )
    mock_client.ping.assert_called_once()


@patch('app.service.redis_service.settings')
@patch('app.service.redis_service.redis.Redis')
def test_get_redis_connection_error(mock_redis_class, mock_settings, reset_redis_globals):
    """Test get_redis raises ConnectionError when Redis connection fails"""
    # Setup mocks
    mock_settings.REDIS_HOST = "localhost"
    mock_settings.REDIS_PORT = 6379
    mock_settings.REDIS_DB = 0
    mock_settings.REDIS_SOCKET_CONNECT_TIMEOUT = 5
    mock_settings.REDIS_SOCKET_TIMEOUT = 5
    
    mock_client = MagicMock()
    mock_client.ping.side_effect = RedisConnectionError("Connection refused")
    mock_redis_class.return_value = mock_client
    
    # Call function and verify exception
    with pytest.raises(RedisConnectionError):
        redis_service.get_redis()


@patch('app.service.redis_service.settings')
@patch('app.service.redis_service.redis.Redis')
def test_get_redis_unexpected_error(mock_redis_class, mock_settings, reset_redis_globals):
    """Test get_redis raises exception on unexpected error"""
    # Setup mocks
    mock_settings.REDIS_HOST = "localhost"
    mock_settings.REDIS_PORT = 6379
    mock_settings.REDIS_DB = 0
    mock_settings.REDIS_SOCKET_CONNECT_TIMEOUT = 5
    mock_settings.REDIS_SOCKET_TIMEOUT = 5
    
    mock_redis_class.side_effect = Exception("Unexpected error")
    
    # Call function and verify exception
    with pytest.raises(Exception) as exc_info:
        redis_service.get_redis()
    
    assert "Unexpected error" in str(exc_info.value)


def test_get_redis_returns_existing_client(reset_redis_globals):
    """Test get_redis returns existing client if already created"""
    # Set up existing client
    mock_existing_client = MagicMock()
    redis_service._redis_client = mock_existing_client
    
    # Call function
    result = redis_service.get_redis()
    
    # Verify it returns the existing client
    assert result == mock_existing_client


# ==========================================
# Tests for get_pubsub()
# ==========================================

@patch('app.service.redis_service.get_redis')
def test_get_pubsub_success(mock_get_redis, reset_redis_globals):
    """Test get_pubsub successfully creates and returns pubsub"""
    # Setup mocks
    mock_redis = MagicMock()
    mock_pubsub = MagicMock()
    mock_redis.pubsub.return_value = mock_pubsub
    mock_get_redis.return_value = mock_redis
    
    # Call function
    result = redis_service.get_pubsub()
    
    # Verify
    assert result == mock_pubsub
    mock_redis.pubsub.assert_called_once()
    mock_pubsub.subscribe.assert_called_once_with('quality_channel')


@patch('app.service.redis_service.get_redis')
def test_get_pubsub_redis_connection_error(mock_get_redis, reset_redis_globals):
    """Test get_pubsub raises exception when get_redis fails"""
    # Setup mocks
    mock_get_redis.side_effect = RedisConnectionError("Connection refused")
    
    # Call function and verify exception
    with pytest.raises(RedisConnectionError):
        redis_service.get_pubsub()


@patch('app.service.redis_service.get_redis')
def test_get_pubsub_subscribe_error(mock_get_redis, reset_redis_globals):
    """Test get_pubsub raises exception when subscribe fails"""
    # Setup mocks
    mock_redis = MagicMock()
    mock_pubsub = MagicMock()
    mock_pubsub.subscribe.side_effect = Exception("Subscribe failed")
    mock_redis.pubsub.return_value = mock_pubsub
    mock_get_redis.return_value = mock_redis
    
    # Call function and verify exception
    with pytest.raises(Exception) as exc_info:
        redis_service.get_pubsub()
    
    assert "Subscribe failed" in str(exc_info.value)


def test_get_pubsub_returns_existing_pubsub(reset_redis_globals):
    """Test get_pubsub returns existing pubsub if already created"""
    # Set up existing pubsub
    mock_existing_pubsub = MagicMock()
    redis_service._pubsub = mock_existing_pubsub
    
    # Call function
    result = redis_service.get_pubsub()
    
    # Verify it returns the existing pubsub
    assert result == mock_existing_pubsub


# ==========================================
# Tests for reset_redis_connection()
# ==========================================

def test_reset_redis_connection_no_connections(reset_redis_globals):
    """Test reset_redis_connection when no connections exist"""
    # Set both to None
    redis_service._pubsub = None
    redis_service._redis_client = None
    
    # Call function
    redis_service.reset_redis_connection()
    
    # Verify both are None
    assert redis_service._pubsub is None
    assert redis_service._redis_client is None


def test_reset_redis_connection_with_pubsub(reset_redis_globals):
    """Test reset_redis_connection closes pubsub and resets both"""
    # Setup mocks
    mock_pubsub_instance = MagicMock()
    mock_redis_client_instance = MagicMock()
    redis_service._pubsub = mock_pubsub_instance
    redis_service._redis_client = mock_redis_client_instance
    
    # Call function
    redis_service.reset_redis_connection()
    
    # Verify
    mock_pubsub_instance.close.assert_called_once()
    assert redis_service._pubsub is None
    assert redis_service._redis_client is None


def test_reset_redis_connection_pubsub_close_error(reset_redis_globals):
    """Test reset_redis_connection handles pubsub close error gracefully"""
    # Setup mocks
    mock_pubsub_instance = MagicMock()
    mock_pubsub_instance.close.side_effect = Exception("Close error")
    mock_redis_client_instance = MagicMock()
    redis_service._pubsub = mock_pubsub_instance
    redis_service._redis_client = mock_redis_client_instance
    
    # Call function - should not raise exception
    redis_service.reset_redis_connection()
    
    # Verify it still resets both
    assert redis_service._pubsub is None
    assert redis_service._redis_client is None


def test_reset_redis_connection_only_redis_client(reset_redis_globals):
    """Test reset_redis_connection when only redis_client exists"""
    # Setup mocks
    mock_redis_client_instance = MagicMock()
    redis_service._pubsub = None
    redis_service._redis_client = mock_redis_client_instance
    
    # Call function
    redis_service.reset_redis_connection()
    
    # Verify
    assert redis_service._pubsub is None
    assert redis_service._redis_client is None


# ==========================================
# Integration-style tests
# ==========================================

@patch('app.service.redis_service.settings')
@patch('app.service.redis_service.redis.Redis')
def test_get_pubsub_calls_get_redis(mock_redis_class, mock_settings, reset_redis_globals):
    """Test get_pubsub calls get_redis to get Redis client"""
    # Setup mocks
    mock_settings.REDIS_HOST = "localhost"
    mock_settings.REDIS_PORT = 6379
    mock_settings.REDIS_DB = 0
    mock_settings.REDIS_SOCKET_CONNECT_TIMEOUT = 5
    mock_settings.REDIS_SOCKET_TIMEOUT = 5
    
    mock_client = MagicMock()
    mock_client.ping.return_value = True
    mock_pubsub = MagicMock()
    mock_client.pubsub.return_value = mock_pubsub
    mock_redis_class.return_value = mock_client
    
    # Call function
    result = redis_service.get_pubsub()
    
    # Verify get_redis was called (through redis.Redis creation)
    mock_redis_class.assert_called_once()
    mock_client.pubsub.assert_called_once()
    mock_pubsub.subscribe.assert_called_once_with('quality_channel')
    assert result == mock_pubsub

