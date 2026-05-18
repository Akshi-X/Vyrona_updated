import pytest
from unittest.mock import MagicMock, Mock, patch
from datetime import datetime, timezone

from app.service import login_service
from app.exceptions import (
    UserNotFoundException,
    AccountInactiveException,
    UserNotApprovedException,
    InvalidCredentialsException,
    AccountLockedException,
    OTPSendFailedException
)
from app.models.user_model import User


@pytest.fixture
def db_session():
    """Create a mock database session"""
    return MagicMock()


@pytest.fixture
def mock_user():
    """Create a mock user"""
    user = Mock(spec=User)
    user.user_id = "USER-123"
    user.email = "user@example.com"
    user.status = True
    user.approved_status = "approved"
    user.is_locked = False
    return user


@pytest.fixture
def mock_otp():
    """Create a mock OTP object"""
    otp = MagicMock()
    otp.expires_at = datetime.now(timezone.utc)
    return otp


# ==========================================
# Tests for handle_login
# ==========================================

@patch('app.service.login_service.send_otp_to_user')
@patch('app.service.login_service.validate_login_request')
def test_handle_login_success(mock_validate, mock_send_otp, db_session, mock_user, mock_otp):
    """Test successful login flow"""
    # Setup mocks
    mock_validate.return_value = mock_user
    mock_send_otp.return_value = mock_otp
    
    # Call function
    result = login_service.handle_login(
        email="user@example.com",
        password="password123",
        remember_me=False,
        db=db_session
    )
    
    # Verify results
    assert result["user_id"] == "USER-123"
    assert result["email"] == "user@example.com"
    assert result["otp_expiry"] is None  # Frontend uses fixed 10-minute countdown
    
    # Verify function calls
    mock_validate.assert_called_once_with("user@example.com", "password123", db_session)
    mock_send_otp.assert_called_once_with(db_session, "USER-123", "user@example.com", False)


@patch('app.service.login_service.send_otp_to_user')
@patch('app.service.login_service.validate_login_request')
def test_handle_login_success_with_remember_me(mock_validate, mock_send_otp, db_session, mock_user, mock_otp):
    """Test successful login flow with remember_me=True"""
    # Setup mocks
    mock_validate.return_value = mock_user
    mock_send_otp.return_value = mock_otp
    
    # Call function
    result = login_service.handle_login(
        email="user@example.com",
        password="password123",
        remember_me=True,
        db=db_session
    )
    
    # Verify results
    assert result["user_id"] == "USER-123"
    assert result["email"] == "user@example.com"
    assert result["otp_expiry"] is None  # Frontend uses fixed 10-minute countdown
    
    # Verify remember_me was passed correctly
    mock_send_otp.assert_called_once_with(db_session, "USER-123", "user@example.com", True)


@patch('app.service.login_service.validate_login_request')
def test_handle_login_user_not_found(mock_validate, db_session):
    """Test login when user not found"""
    # Setup mock to raise exception
    mock_validate.side_effect = UserNotFoundException(email="nonexistent@example.com")
    
    # Call function and expect exception
    with pytest.raises(UserNotFoundException):
        login_service.handle_login(
            email="nonexistent@example.com",
            password="password123",
            remember_me=False,
            db=db_session
        )
    
    mock_validate.assert_called_once_with("nonexistent@example.com", "password123", db_session)


@patch('app.service.login_service.validate_login_request')
def test_handle_login_account_inactive(mock_validate, db_session):
    """Test login when account is inactive"""
    # Setup mock to raise exception
    mock_validate.side_effect = AccountInactiveException(user_id="USER-123")
    
    # Call function and expect exception
    with pytest.raises(AccountInactiveException) as exc_info:
        login_service.handle_login(
            email="user@example.com",
            password="password123",
            remember_me=False,
            db=db_session
        )
    
    assert exc_info.value.details.get('user_id') == "USER-123"
    mock_validate.assert_called_once_with("user@example.com", "password123", db_session)


@patch('app.service.login_service.validate_login_request')
def test_handle_login_user_not_approved(mock_validate, db_session):
    """Test login when user is not approved"""
    # Setup mock to raise exception
    mock_validate.side_effect = UserNotApprovedException(user_id="USER-123")
    
    # Call function and expect exception
    with pytest.raises(UserNotApprovedException) as exc_info:
        login_service.handle_login(
            email="user@example.com",
            password="password123",
            remember_me=False,
            db=db_session
        )
    
    assert exc_info.value.details.get('user_id') == "USER-123"
    mock_validate.assert_called_once_with("user@example.com", "password123", db_session)


@patch('app.service.login_service.validate_login_request')
def test_handle_login_invalid_credentials(mock_validate, db_session):
    """Test login with invalid credentials"""
    # Setup mock to raise exception
    mock_validate.side_effect = InvalidCredentialsException(
        email="user@example.com",
        attempts_remaining=2
    )
    
    # Call function and expect exception
    with pytest.raises(InvalidCredentialsException) as exc_info:
        login_service.handle_login(
            email="user@example.com",
            password="wrongpassword",
            remember_me=False,
            db=db_session
        )
    
    assert exc_info.value.details.get('email') == "user@example.com"
    assert exc_info.value.details.get('attempts_remaining') == 2
    mock_validate.assert_called_once_with("user@example.com", "wrongpassword", db_session)


@patch('app.service.login_service.validate_login_request')
def test_handle_login_account_locked(mock_validate, db_session):
    """Test login when account is locked"""
    # Setup mock to raise exception
    # AccountLockedException requires unlock_time and minutes_remaining
    unlock_time = datetime.now(timezone.utc)
    mock_validate.side_effect = AccountLockedException(
        user_id="USER-123",
        unlock_time=unlock_time,
        minutes_remaining=30
    )
    
    # Call function and expect exception
    with pytest.raises(AccountLockedException):
        login_service.handle_login(
            email="user@example.com",
            password="password123",
            remember_me=False,
            db=db_session
        )
    
    mock_validate.assert_called_once_with("user@example.com", "password123", db_session)


@patch('app.service.login_service.send_otp_to_user')
@patch('app.service.login_service.validate_login_request')
def test_handle_login_otp_send_failed(mock_validate, mock_send_otp, db_session, mock_user):
    """Test login when OTP sending fails"""
    # Setup mocks
    mock_validate.return_value = mock_user
    mock_send_otp.side_effect = Exception("Email service unavailable")
    
    # Call function and expect OTPSendFailedException
    with pytest.raises(OTPSendFailedException) as exc_info:
        login_service.handle_login(
            email="user@example.com",
            password="password123",
            remember_me=False,
            db=db_session
        )
    
    assert exc_info.value.details.get('email') == "user@example.com"
    assert "email service unavailable" in exc_info.value.details.get('reason', '').lower()
    mock_validate.assert_called_once()
    mock_send_otp.assert_called_once()


@patch('app.service.login_service.send_otp_to_user')
@patch('app.service.login_service.validate_login_request')
def test_handle_login_otp_send_failed_with_database_error(mock_validate, mock_send_otp, db_session, mock_user):
    """Test login when OTP sending fails with database error"""
    # Setup mocks
    mock_validate.return_value = mock_user
    mock_send_otp.side_effect = Exception("Database connection error")
    
    # Call function and expect OTPSendFailedException
    with pytest.raises(OTPSendFailedException) as exc_info:
        login_service.handle_login(
            email="user@example.com",
            password="password123",
            remember_me=False,
            db=db_session
        )
    
    assert exc_info.value.details.get('email') == "user@example.com"
    assert "database connection error" in exc_info.value.details.get('reason', '').lower()


@patch('app.service.login_service.send_otp_to_user')
@patch('app.service.login_service.validate_login_request')
def test_handle_login_otp_send_failed_with_network_error(mock_validate, mock_send_otp, db_session, mock_user):
    """Test login when OTP sending fails with network error"""
    # Setup mocks
    mock_validate.return_value = mock_user
    mock_send_otp.side_effect = Exception("Network timeout")
    
    # Call function and expect OTPSendFailedException
    with pytest.raises(OTPSendFailedException) as exc_info:
        login_service.handle_login(
            email="user@example.com",
            password="password123",
            remember_me=False,
            db=db_session
        )
    
    assert exc_info.value.details.get('email') == "user@example.com"
    assert "network timeout" in exc_info.value.details.get('reason', '').lower()

