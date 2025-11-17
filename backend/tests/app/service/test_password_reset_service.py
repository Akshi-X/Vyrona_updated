import pytest
from unittest.mock import MagicMock, Mock, patch
from datetime import datetime, timezone, timedelta
from jose import jwt, JWTError
from jose.exceptions import ExpiredSignatureError

from app.service import password_reset_service
from app.exceptions import (
    PasswordResetUserNotFoundException,
    InvalidResetTokenException,
    ResetTokenExpiredException,
    PasswordResetFailedException,
    ResetPasswordMismatchException,
    ResetWeakPasswordException,
    ResetUserNotApprovedException,
    ResetAccountLockedException
)
from app.models.user_model import User
from app.config.config import settings


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
    user.first_name = "John"
    user.approved_status = "approved"
    user.is_locked = False
    user.password_hash = "hashed_password"
    user.last_password_changed = None
    user.last_password_reset_request = None
    user.password_reset_count = 0
    return user


# ==========================================
# Tests for create_password_reset_token
# ==========================================

@patch('app.service.password_reset_service.settings')
def test_create_password_reset_token_success(mock_settings):
    """Test creating password reset token successfully"""
    mock_settings.SECRET_KEY = "test_secret_key"
    
    token = password_reset_service.create_password_reset_token(
        user_id="USER-123",
        email="user@example.com"
    )
    
    assert token is not None
    assert isinstance(token, str)
    
    # Decode and verify token
    payload = jwt.decode(token, "test_secret_key", algorithms=["HS256"])
    assert payload["sub"] == "USER-123"
    assert payload["email"] == "user@example.com"
    assert payload["type"] == "password_reset"
    assert "exp" in payload


# ==========================================
# Tests for decode_reset_token
# ==========================================

@patch('app.service.password_reset_service.settings')
def test_decode_reset_token_success(mock_settings):
    """Test decoding valid reset token"""
    mock_settings.SECRET_KEY = "test_secret_key"
    
    # Create a valid token
    token = password_reset_service.create_password_reset_token(
        user_id="USER-123",
        email="user@example.com"
    )
    
    result = password_reset_service.decode_reset_token(token)
    
    assert result["user_id"] == "USER-123"
    assert result["email"] == "user@example.com"


@patch('app.service.password_reset_service.settings')
@patch('app.service.password_reset_service.jwt.decode')
def test_decode_reset_token_expired(mock_jwt_decode, mock_settings):
    """Test decoding expired token"""
    mock_settings.SECRET_KEY = "test_secret_key"
    mock_jwt_decode.side_effect = ExpiredSignatureError("Token expired")
    
    with pytest.raises(ResetTokenExpiredException):
        password_reset_service.decode_reset_token("expired_token")


@patch('app.service.password_reset_service.settings')
@patch('app.service.password_reset_service.jwt.decode')
def test_decode_reset_token_invalid(mock_jwt_decode, mock_settings):
    """Test decoding invalid token"""
    mock_settings.SECRET_KEY = "test_secret_key"
    mock_jwt_decode.side_effect = JWTError("Invalid token")
    
    with pytest.raises(InvalidResetTokenException):
        password_reset_service.decode_reset_token("invalid_token")


@patch('app.service.password_reset_service.settings')
@patch('app.service.password_reset_service.jwt.decode')
def test_decode_reset_token_wrong_type(mock_jwt_decode, mock_settings):
    """Test decoding token with wrong type"""
    mock_settings.SECRET_KEY = "test_secret_key"
    mock_jwt_decode.return_value = {
        "sub": "USER-123",
        "email": "user@example.com",
        "type": "access_token"  # Wrong type
    }
    
    with pytest.raises(InvalidResetTokenException):
        password_reset_service.decode_reset_token("wrong_type_token")


@patch('app.service.password_reset_service.settings')
@patch('app.service.password_reset_service.jwt.decode')
def test_decode_reset_token_missing_fields(mock_jwt_decode, mock_settings):
    """Test decoding token with missing fields"""
    mock_settings.SECRET_KEY = "test_secret_key"
    mock_jwt_decode.return_value = {
        "type": "password_reset",
        "sub": "USER-123"
        # Missing email
    }
    
    with pytest.raises(InvalidResetTokenException):
        password_reset_service.decode_reset_token("missing_fields_token")


# ==========================================
# Tests for validate_password_strength
# ==========================================

@patch('app.service.password_reset_service.MIN_PASSWORD_LENGTH', 8)
@patch('app.service.password_reset_service.MAX_PASSWORD_LENGTH', 128)
@patch('app.service.password_reset_service.REQUIRE_UPPERCASE', True)
@patch('app.service.password_reset_service.REQUIRE_LOWERCASE', True)
@patch('app.service.password_reset_service.REQUIRE_DIGIT', True)
@patch('app.service.password_reset_service.REQUIRE_SPECIAL_CHAR', True)
def test_validate_password_strength_success():
    """Test validating strong password"""
    # Should not raise exception
    password_reset_service.validate_password_strength("StrongP@ss123")


@patch('app.service.password_reset_service.MIN_PASSWORD_LENGTH', 8)
def test_validate_password_strength_too_short():
    """Test validating password that is too short"""
    with pytest.raises(ResetWeakPasswordException) as exc_info:
        password_reset_service.validate_password_strength("Short1!")
    
    assert "at least" in str(exc_info.value).lower()


@patch('app.service.password_reset_service.MAX_PASSWORD_LENGTH', 10)
def test_validate_password_strength_too_long():
    """Test validating password that is too long"""
    with pytest.raises(ResetWeakPasswordException) as exc_info:
        password_reset_service.validate_password_strength("VeryLongPassword123!")
    
    assert "not exceed" in str(exc_info.value).lower()


@patch('app.service.password_reset_service.REQUIRE_UPPERCASE', True)
def test_validate_password_strength_no_uppercase():
    """Test validating password without uppercase"""
    with pytest.raises(ResetWeakPasswordException) as exc_info:
        password_reset_service.validate_password_strength("lowercase123!")
    
    assert "uppercase" in str(exc_info.value).lower()


@patch('app.service.password_reset_service.REQUIRE_LOWERCASE', True)
def test_validate_password_strength_no_lowercase():
    """Test validating password without lowercase"""
    with pytest.raises(ResetWeakPasswordException) as exc_info:
        password_reset_service.validate_password_strength("UPPERCASE123!")
    
    assert "lowercase" in str(exc_info.value).lower()


@patch('app.service.password_reset_service.REQUIRE_DIGIT', True)
def test_validate_password_strength_no_digit():
    """Test validating password without digit"""
    with pytest.raises(ResetWeakPasswordException) as exc_info:
        password_reset_service.validate_password_strength("NoDigitPass!")
    
    assert "digit" in str(exc_info.value).lower()


@patch('app.service.password_reset_service.REQUIRE_SPECIAL_CHAR', True)
def test_validate_password_strength_no_special_char():
    """Test validating password without special character"""
    with pytest.raises(ResetWeakPasswordException) as exc_info:
        password_reset_service.validate_password_strength("NoSpecial123")
    
    assert "special character" in str(exc_info.value).lower()


# ==========================================
# Tests for validate_passwords_match
# ==========================================

def test_validate_passwords_match_success():
    """Test validating matching passwords"""
    # Should not raise exception
    password_reset_service.validate_passwords_match("Password123!", "Password123!")


def test_validate_passwords_match_mismatch():
    """Test validating mismatched passwords"""
    with pytest.raises(ResetPasswordMismatchException):
        password_reset_service.validate_passwords_match("Password123!", "Different123!")


# ==========================================
# Tests for validate_user_can_reset_password
# ==========================================

def test_validate_user_can_reset_password_success(mock_user):
    """Test validating user eligible for password reset"""
    # Should not raise exception
    password_reset_service.validate_user_can_reset_password(mock_user)


def test_validate_user_can_reset_password_not_approved(mock_user):
    """Test validating user not approved"""
    mock_user.approved_status = "pending"
    
    with pytest.raises(ResetUserNotApprovedException) as exc_info:
        password_reset_service.validate_user_can_reset_password(mock_user)
    
    assert exc_info.value.details.get('email') == "user@example.com"


def test_validate_user_can_reset_password_locked(mock_user):
    """Test validating locked user"""
    mock_user.is_locked = True
    
    with pytest.raises(ResetAccountLockedException) as exc_info:
        password_reset_service.validate_user_can_reset_password(mock_user)
    
    assert exc_info.value.details.get('email') == "user@example.com"


# ==========================================
# Tests for get_validated_user_by_email
# ==========================================

@patch('app.service.password_reset_service.utils_get_user_by_email')
def test_get_validated_user_by_email_success(mock_get_user, db_session, mock_user):
    """Test getting user by email successfully"""
    mock_get_user.return_value = mock_user
    
    result = password_reset_service.get_validated_user_by_email("user@example.com", db_session)
    
    assert result == mock_user
    mock_get_user.assert_called_once_with("user@example.com", db_session)


@patch('app.service.password_reset_service.utils_get_user_by_email')
def test_get_validated_user_by_email_not_found(mock_get_user, db_session):
    """Test getting user by email when not found"""
    mock_get_user.return_value = None
    
    with pytest.raises(PasswordResetUserNotFoundException) as exc_info:
        password_reset_service.get_validated_user_by_email("nonexistent@example.com", db_session)
    
    assert exc_info.value.details.get('email') == "nonexistent@example.com"


# ==========================================
# Tests for get_validated_user_by_id
# ==========================================

@patch('app.service.password_reset_service.utils_get_user_by_id')
def test_get_validated_user_by_id_success(mock_get_user, db_session, mock_user):
    """Test getting user by ID successfully"""
    mock_get_user.return_value = mock_user
    
    result = password_reset_service.get_validated_user_by_id("USER-123", "user@example.com", db_session)
    
    assert result == mock_user
    mock_get_user.assert_called_once_with("USER-123", db_session)


@patch('app.service.password_reset_service.utils_get_user_by_id')
def test_get_validated_user_by_id_not_found(mock_get_user, db_session):
    """Test getting user by ID when not found"""
    mock_get_user.return_value = None
    
    with pytest.raises(PasswordResetUserNotFoundException) as exc_info:
        password_reset_service.get_validated_user_by_id("INVALID-USER", "user@example.com", db_session)
    
    assert exc_info.value.details.get('email') == "user@example.com"


# ==========================================
# Tests for update_user_password
# ==========================================

@patch('app.service.password_reset_service.get_password_hash')
def test_update_user_password_success(mock_hash, mock_user):
    """Test updating user password successfully"""
    mock_hash.return_value = "new_hashed_password"
    
    password_reset_service.update_user_password(mock_user, "NewPassword123!")
    
    assert mock_user.password_hash == "new_hashed_password"
    assert mock_user.last_password_changed is not None
    mock_hash.assert_called_once_with("NewPassword123!")


# ==========================================
# Tests for request_password_reset
# ==========================================

@patch('app.service.password_reset_service.send_password_reset_email')
@patch('app.service.password_reset_service.create_password_reset_token')
@patch('app.service.password_reset_service.validate_user_can_reset_password')
@patch('app.service.password_reset_service.get_validated_user_by_email')
@patch('app.service.password_reset_service.settings')
def test_request_password_reset_success(
    mock_settings, mock_get_user, mock_validate, mock_create_token, mock_send_email,
    db_session, mock_user
):
    """Test requesting password reset successfully"""
    mock_settings.FRONTEND_URL = "https://example.com"
    mock_get_user.return_value = mock_user
    mock_create_token.return_value = "reset_token_123"
    
    result = password_reset_service.request_password_reset("user@example.com", db_session)
    
    assert result["email"] == "user@example.com"
    assert "message" in result
    mock_get_user.assert_called_once()
    mock_validate.assert_called_once_with(mock_user)
    assert mock_user.last_password_reset_request is not None
    assert mock_user.password_reset_count == 1
    db_session.commit.assert_called()
    mock_create_token.assert_called_once_with("USER-123", "user@example.com")
    mock_send_email.assert_called_once()


@patch('app.service.password_reset_service.send_password_reset_email')
@patch('app.service.password_reset_service.create_password_reset_token')
@patch('app.service.password_reset_service.validate_user_can_reset_password')
@patch('app.service.password_reset_service.get_validated_user_by_email')
@patch('app.service.password_reset_service.settings')
def test_request_password_reset_email_failure(
    mock_settings, mock_get_user, mock_validate, mock_create_token, mock_send_email,
    db_session, mock_user
):
    """Test requesting password reset when email fails"""
    mock_settings.FRONTEND_URL = "https://example.com"
    mock_get_user.return_value = mock_user
    mock_create_token.return_value = "reset_token_123"
    mock_send_email.side_effect = Exception("Email service unavailable")
    
    with pytest.raises(PasswordResetFailedException) as exc_info:
        password_reset_service.request_password_reset("user@example.com", db_session)
    
    assert "email service unavailable" in exc_info.value.details.get('reason', '').lower()
    # Audit should still be saved
    assert mock_user.password_reset_count == 1
    db_session.commit.assert_called()


# ==========================================
# Tests for reset_password
# ==========================================

@patch('app.service.password_reset_service.update_user_password')
@patch('app.service.password_reset_service.get_validated_user_by_id')
@patch('app.service.password_reset_service.decode_reset_token')
@patch('app.service.password_reset_service.validate_password_strength')
@patch('app.service.password_reset_service.validate_passwords_match')
def test_reset_password_success(
    mock_validate_match, mock_validate_strength, mock_decode, mock_get_user, mock_update,
    db_session, mock_user
):
    """Test resetting password successfully"""
    mock_decode.return_value = {"user_id": "USER-123", "email": "user@example.com"}
    mock_get_user.return_value = mock_user
    
    result = password_reset_service.reset_password(
        token="reset_token_123",
        new_password="NewPassword123!",
        confirm_password="NewPassword123!",
        db=db_session
    )
    
    assert "message" in result
    assert "successful" in result["message"].lower()
    mock_validate_match.assert_called_once_with("NewPassword123!", "NewPassword123!")
    mock_validate_strength.assert_called_once_with("NewPassword123!")
    mock_decode.assert_called_once_with("reset_token_123")
    mock_get_user.assert_called_once_with("USER-123", "user@example.com", db_session)
    mock_update.assert_called_once_with(mock_user, "NewPassword123!")
    db_session.commit.assert_called_once()


@patch('app.service.password_reset_service.validate_passwords_match')
def test_reset_password_mismatch(mock_validate_match, db_session):
    """Test resetting password with mismatched passwords"""
    mock_validate_match.side_effect = ResetPasswordMismatchException()
    
    with pytest.raises(ResetPasswordMismatchException):
        password_reset_service.reset_password(
            token="reset_token_123",
            new_password="NewPassword123!",
            confirm_password="Different123!",
            db=db_session
        )


@patch('app.service.password_reset_service.validate_password_strength')
@patch('app.service.password_reset_service.validate_passwords_match')
def test_reset_password_weak_password(mock_validate_match, mock_validate_strength, db_session):
    """Test resetting password with weak password"""
    mock_validate_strength.side_effect = ResetWeakPasswordException("Password too weak")
    
    with pytest.raises(ResetWeakPasswordException):
        password_reset_service.reset_password(
            token="reset_token_123",
            new_password="weak",
            confirm_password="weak",
            db=db_session
        )


@patch('app.service.password_reset_service.update_user_password')
@patch('app.service.password_reset_service.get_validated_user_by_id')
@patch('app.service.password_reset_service.decode_reset_token')
@patch('app.service.password_reset_service.validate_password_strength')
@patch('app.service.password_reset_service.validate_passwords_match')
def test_reset_password_database_error(
    mock_validate_match, mock_validate_strength, mock_decode, mock_get_user, mock_update,
    db_session, mock_user
):
    """Test resetting password when database error occurs"""
    mock_decode.return_value = {"user_id": "USER-123", "email": "user@example.com"}
    mock_get_user.return_value = mock_user
    db_session.commit.side_effect = Exception("Database error")
    
    with pytest.raises(PasswordResetFailedException) as exc_info:
        password_reset_service.reset_password(
            token="reset_token_123",
            new_password="NewPassword123!",
            confirm_password="NewPassword123!",
            db=db_session
        )
    
    assert "database error" in exc_info.value.details.get('reason', '').lower()
    db_session.rollback.assert_called_once()


# ==========================================
# Tests for Utility Functions Coverage
# ==========================================

def test_get_user_by_email_success(db_session):
    """Test get_user_by_email utility function (line 138)"""
    from app.utils.utils import get_user_by_email
    
    mock_user = Mock(spec=User)
    mock_user.email = "user@example.com"
    
    db_session.query.return_value.filter.return_value.first.return_value = mock_user
    
    result = get_user_by_email("user@example.com", db_session)
    assert result == mock_user
    db_session.query.assert_called_once_with(User)
    db_session.query.return_value.filter.assert_called_once()


def test_get_user_by_id_success(db_session):
    """Test get_user_by_id utility function (line 152)"""
    from app.utils.utils import get_user_by_id
    
    mock_user = Mock(spec=User)
    mock_user.user_id = "USER-123"
    
    db_session.query.return_value.filter.return_value.first.return_value = mock_user
    
    result = get_user_by_id("USER-123", db_session)
    assert result == mock_user
    db_session.query.assert_called_once_with(User)
    db_session.query.return_value.filter.assert_called_once()
