import pytest
from unittest.mock import MagicMock, Mock, patch
from datetime import datetime, timezone, timedelta

from app.service import otp_service
from app.exceptions import ResendOTPFailedException
from app.models.otp_model import OTP
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
    user.role = "manager"
    user.pharma_id = 42
    return user


@pytest.fixture
def mock_otp():
    """Create a mock OTP object"""
    otp = Mock(spec=OTP)
    otp.user_id = "USER-123"
    otp.email = "user@example.com"
    otp.otp_code = "123456"
    otp.expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)
    otp.is_used = False
    otp.attempts = 0
    otp.remember_me = False
    otp.created_at = datetime.now(timezone.utc)
    return otp


# ==========================================
# Tests for generate_otp_code
# ==========================================

def test_generate_otp_code_default_length():
    """Test generating OTP code with default length"""
    code = otp_service.generate_otp_code()
    
    assert len(code) == 6
    assert code.isdigit()


def test_generate_otp_code_custom_length():
    """Test generating OTP code with custom length"""
    code = otp_service.generate_otp_code(length=8)
    
    assert len(code) == 8
    assert code.isdigit()


def test_generate_otp_code_uniqueness():
    """Test that generated OTP codes are unique"""
    codes = [otp_service.generate_otp_code() for _ in range(10)]
    
    # Should have at least some unique codes (very unlikely all 10 are same)
    assert len(set(codes)) > 1


# ==========================================
# Tests for send_otp_to_user
# ==========================================

@patch('app.service.otp_service.send_otp_email')
@patch('app.service.otp_service.generate_otp_code')
def test_send_otp_to_user_success(mock_generate, mock_send_email, db_session, mock_otp):
    """Test successfully sending OTP to user"""
    # Setup mocks
    mock_generate.return_value = "123456"
    
    # Create a real OTP object to be added
    otp_instance = Mock(spec=OTP)
    otp_instance.expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)
    
    # Mock OTP class constructor
    with patch('app.service.otp_service.OTP') as mock_otp_class:
        mock_otp_class.return_value = otp_instance
        
        result = otp_service.send_otp_to_user(
            db=db_session,
            user_id="USER-123",
            email="user@example.com",
            remember_me=False
        )
        
        # Verify OTP was created and added
        mock_otp_class.assert_called_once()
        db_session.add.assert_called_once_with(otp_instance)
        db_session.flush.assert_called_once()
        mock_send_email.assert_called_once_with("user@example.com", "123456")
        db_session.commit.assert_called_once()
        db_session.refresh.assert_called_once_with(otp_instance)
        assert result == otp_instance


@patch('app.service.otp_service.send_otp_email')
@patch('app.service.otp_service.generate_otp_code')
def test_send_otp_to_user_with_remember_me(mock_generate, mock_send_email, db_session, mock_otp):
    """Test sending OTP with remember_me=True"""
    mock_generate.return_value = "123456"
    
    otp_instance = Mock(spec=OTP)
    otp_instance.expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)
    
    with patch('app.service.otp_service.OTP') as mock_otp_class:
        mock_otp_class.return_value = otp_instance
        
        result = otp_service.send_otp_to_user(
            db=db_session,
            user_id="USER-123",
            email="user@example.com",
            remember_me=True
        )
        
        # Verify remember_me was passed to OTP constructor
        call_kwargs = mock_otp_class.call_args[1]
        assert call_kwargs.get('remember_me') == True


@patch('app.service.otp_service.send_otp_email')
@patch('app.service.otp_service.generate_otp_code')
def test_send_otp_to_user_email_failure(mock_generate, mock_send_email, db_session):
    """Test sending OTP when email fails"""
    mock_generate.return_value = "123456"
    mock_send_email.side_effect = Exception("Email service unavailable")
    
    otp_instance = Mock(spec=OTP)
    
    with patch('app.service.otp_service.OTP') as mock_otp_class:
        mock_otp_class.return_value = otp_instance
        
        with pytest.raises(Exception) as exc_info:
            otp_service.send_otp_to_user(
                db=db_session,
                user_id="USER-123",
                email="user@example.com",
                remember_me=False
            )
        
        assert "failed to send otp" in str(exc_info.value).lower()
        db_session.rollback.assert_called_once()
        db_session.commit.assert_not_called()


@patch('app.service.otp_service.send_otp_email')
@patch('app.service.otp_service.generate_otp_code')
def test_send_otp_to_user_email_service_exception(mock_generate, mock_send_email, db_session):
    """Test sending OTP when EmailServiceException is raised"""
    from app.exceptions import EmailServiceException
    
    mock_generate.return_value = "123456"
    email_exception = EmailServiceException(recipient="user@example.com", reason="SendGrid error")
    email_exception.details = {'reason': 'SendGrid error'}
    mock_send_email.side_effect = email_exception
    
    otp_instance = Mock(spec=OTP)
    
    with patch('app.service.otp_service.OTP') as mock_otp_class:
        mock_otp_class.return_value = otp_instance
        
        with pytest.raises(Exception) as exc_info:
            otp_service.send_otp_to_user(
                db=db_session,
                user_id="USER-123",
                email="user@example.com",
                remember_me=False
            )
        
        assert "sendgrid error" in str(exc_info.value).lower()
        db_session.rollback.assert_called_once()


# ==========================================
# Tests for verify_otp
# ==========================================

def test_verify_otp_success(db_session, mock_otp):
    """Test successfully verifying OTP"""
    # Setup mock query
    mock_query = MagicMock()
    mock_filter = MagicMock()
    mock_order_by = MagicMock()
    mock_order_by.first.return_value = mock_otp
    mock_filter.order_by.return_value = mock_order_by
    mock_query.filter.return_value = mock_filter
    db_session.query.return_value = mock_query
    
    # Set OTP code to match
    mock_otp.otp_code = "123456"
    
    result = otp_service.verify_otp(
        db=db_session,
        user_id="USER-123",
        otp_code="123456"
    )
    
    assert result is True
    assert mock_otp.is_used is True
    db_session.commit.assert_called()


def test_verify_otp_wrong_code(db_session, mock_otp):
    """Test verifying OTP with wrong code"""
    # Setup mock query
    mock_query = MagicMock()
    mock_filter = MagicMock()
    mock_order_by = MagicMock()
    mock_order_by.first.return_value = mock_otp
    mock_filter.order_by.return_value = mock_order_by
    mock_query.filter.return_value = mock_filter
    db_session.query.return_value = mock_query
    
    # Set OTP code to not match
    mock_otp.otp_code = "123456"
    mock_otp.attempts = 0
    
    result = otp_service.verify_otp(
        db=db_session,
        user_id="USER-123",
        otp_code="000000"
    )
    
    assert result is False
    assert mock_otp.attempts == 1
    assert mock_otp.is_used is False
    db_session.commit.assert_called()


def test_verify_otp_not_found(db_session):
    """Test verifying OTP when no OTP found"""
    # Setup mock query to return None
    mock_query = MagicMock()
    mock_filter = MagicMock()
    mock_order_by = MagicMock()
    mock_order_by.first.return_value = None
    mock_filter.order_by.return_value = mock_order_by
    mock_query.filter.return_value = mock_filter
    db_session.query.return_value = mock_query
    
    result = otp_service.verify_otp(
        db=db_session,
        user_id="USER-123",
        otp_code="123456"
    )
    
    assert result is False


def test_verify_otp_exception(db_session):
    """Test verify_otp when exception occurs"""
    db_session.query.side_effect = Exception("Database error")
    
    with pytest.raises(Exception) as exc_info:
        otp_service.verify_otp(
            db=db_session,
            user_id="USER-123",
            otp_code="123456"
        )
    
    assert "failed to verify otp" in str(exc_info.value).lower()
    db_session.rollback.assert_called_once()


# ==========================================
# Tests for verify_otp_and_create_token
# ==========================================

@patch('app.service.otp_service.create_access_token')
@patch('app.dependencies.auth_dependencies.validate_otp_verification')
def test_verify_otp_and_create_token_success(mock_validate, mock_create_token, db_session, mock_user, mock_otp):
    """Test successfully verifying OTP and creating token"""
    # Setup mocks
    mock_validate.return_value = mock_user
    
    # Mock OTP query
    mock_query = MagicMock()
    mock_query.filter.return_value.order_by.return_value.first.return_value = mock_otp
    db_session.query.return_value = mock_query
    
    mock_create_token.return_value = "jwt_token_123"
    
    result = otp_service.verify_otp_and_create_token(
        user_id="USER-123",
        otp="123456",
        db=db_session
    )
    
    assert result["user_id"] == "USER-123"
    assert result["email"] == "user@example.com"
    assert result["auth_token"] == "jwt_token_123"
    assert result["pharma_id"] == 42
    assert result["role"] == "manager"
    assert "expires_at" in result
    mock_validate.assert_called_once_with("USER-123", "123456", db_session)
    mock_create_token.assert_called_once()


@patch('app.dependencies.auth_dependencies.validate_otp_verification')
def test_verify_otp_and_create_token_with_remember_me(mock_validate, db_session, mock_user, mock_otp):
    """Test verify_otp_and_create_token with remember_me=True"""
    mock_validate.return_value = mock_user
    mock_otp.remember_me = True
    
    # Mock OTP query
    mock_query = MagicMock()
    mock_query.filter.return_value.order_by.return_value.first.return_value = mock_otp
    db_session.query.return_value = mock_query
    
    with patch('app.service.otp_service.create_access_token') as mock_create_token:
        mock_create_token.return_value = "jwt_token_123"
        
        result = otp_service.verify_otp_and_create_token(
            user_id="USER-123",
            otp="123456",
            db=db_session
        )
        
        # Verify remember_me was passed to create_access_token
        # create_access_token is called with data={...} and expires_delta=...
        call_kwargs = mock_create_token.call_args[1]  # Get keyword arguments
        data = call_kwargs.get('data', {})
        assert data.get('remember_me') is True


@patch('app.dependencies.auth_dependencies.validate_otp_verification')
def test_verify_otp_and_create_token_no_otp_record(mock_validate, db_session, mock_user):
    """Test verify_otp_and_create_token when no OTP record found"""
    mock_validate.return_value = mock_user
    
    # Mock OTP query to return None
    mock_query = MagicMock()
    mock_query.filter.return_value.order_by.return_value.first.return_value = None
    db_session.query.return_value = mock_query
    
    with patch('app.service.otp_service.create_access_token') as mock_create_token:
        mock_create_token.return_value = "jwt_token_123"
        
        result = otp_service.verify_otp_and_create_token(
            user_id="USER-123",
            otp="123456",
            db=db_session
        )
        
        # Should use default session duration (no remember_me)
        # create_access_token is called with data={...} and expires_delta=...
        call_kwargs = mock_create_token.call_args[1]  # Get keyword arguments
        data = call_kwargs.get('data', {})
        assert data.get('remember_me') is False


@patch('app.dependencies.auth_dependencies.validate_otp_verification')
def test_verify_otp_and_create_token_exception(mock_validate, db_session):
    """Test verify_otp_and_create_token when exception occurs"""
    mock_validate.side_effect = Exception("Validation failed")
    
    with pytest.raises(Exception) as exc_info:
        otp_service.verify_otp_and_create_token(
            user_id="USER-123",
            otp="123456",
            db=db_session
        )
    
    assert "validation failed" in str(exc_info.value).lower()
    db_session.rollback.assert_called_once()


# ==========================================
# Tests for resend_otp_to_user
# ==========================================

@patch('app.service.otp_service.send_otp_to_user')
@patch('app.dependencies.auth_dependencies.get_validated_user')
def test_resend_otp_to_user_success(mock_get_user, mock_send_otp, db_session, mock_user, mock_otp):
    """Test successfully resending OTP"""
    mock_get_user.return_value = mock_user
    mock_send_otp.return_value = mock_otp
    
    result = otp_service.resend_otp_to_user(
        user_id="USER-123",
        email="user@example.com",
        db=db_session
    )
    
    assert result["user_id"] == "USER-123"
    assert result["email"] == "user@example.com"
    assert result["otp_expiry"] == mock_otp.expires_at
    mock_get_user.assert_called_once_with("user@example.com", "USER-123", db_session)
    mock_send_otp.assert_called_once_with(db_session, "USER-123", "user@example.com")


@patch('app.service.otp_service.send_otp_to_user')
@patch('app.dependencies.auth_dependencies.get_validated_user')
def test_resend_otp_to_user_failed(mock_get_user, mock_send_otp, db_session, mock_user):
    """Test resending OTP when it fails"""
    mock_get_user.return_value = mock_user
    mock_send_otp.side_effect = Exception("Email service unavailable")
    
    with pytest.raises(ResendOTPFailedException) as exc_info:
        otp_service.resend_otp_to_user(
            user_id="USER-123",
            email="user@example.com",
            db=db_session
        )
    
    assert exc_info.value.details.get('email') == "user@example.com"
    assert "email service unavailable" in exc_info.value.details.get('reason', '').lower()

