"""
Password Reset Service

Handles forgot password and password reset functionality with JWT tokens.
Stateless approach - no separate database table needed.

Architecture:
- Stateless JWT tokens (like login sessions)
- Audit tracking in User table
- Business Logic Layer: Pure validation and token operations
- Orchestration Layer: Coordinates flow and database transactions
"""

from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
from jose import JWTError, jwt

from ..models.user_model import User
from ..auth.auth import get_password_hash
from ..config.config import settings
from ..service.email_service import send_password_reset_email
from ..service.activity_log_service import (
    ActivityLogService,
    build_actor_from_user,
    is_audit_log_disabled_for_user,
)
from ..constants.enums import ActivityOutcome
from ..utils.utils import get_user_by_email as utils_get_user_by_email
from ..utils.utils import get_user_by_id as utils_get_user_by_id
from ..constants.app_constants import (
    ALGORITHM,
    PASSWORD_RESET_TOKEN_EXPIRY_MINUTES,
    MIN_PASSWORD_LENGTH,
    MAX_PASSWORD_LENGTH,
    REQUIRE_UPPERCASE,
    REQUIRE_LOWERCASE,
    REQUIRE_DIGIT,
    REQUIRE_SPECIAL_CHAR,
    PASSWORD_SPECIAL_CHARS
)
from ..exceptions import (
    PasswordResetUserNotFoundException,
    InvalidResetTokenException,
    ResetTokenExpiredException,
    PasswordResetFailedException,
    ResetPasswordMismatchException,
    ResetWeakPasswordException,
    ResetUserNotApprovedException,
    ResetAccountLockedException
)


# ============================================
# BUSINESS LOGIC - Token Operations
# ============================================

def create_password_reset_token(user_id: str, email: str) -> str:
    """Create JWT token for password reset"""
    payload = {
        "sub": user_id,
        "email": email,
        "type": "password_reset",
        "exp": datetime.now(timezone.utc) + timedelta(minutes=PASSWORD_RESET_TOKEN_EXPIRY_MINUTES)
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)




def decode_reset_token(token: str) -> Dict[str, Any]:
    """
    Decode and validate JWT reset token
    
    Raises:
        ResetTokenExpiredException: Token expired
        InvalidResetTokenException: Token invalid or wrong type
    """
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise ResetTokenExpiredException()
    except JWTError:
        raise InvalidResetTokenException()
    
    # Validate token type
    if payload.get("type") != "password_reset":
        raise InvalidResetTokenException()
    
    # Validate required fields
    user_id = payload.get("sub")
    email = payload.get("email")
    if not user_id or not email:
        raise InvalidResetTokenException()
    
    return {"user_id": user_id, "email": email}


# ============================================
# BUSINESS LOGIC - Validation
# ============================================

def validate_password_strength(password: str) -> None:
    """
    Validate password meets security requirements
    
    Raises:
        ResetWeakPasswordException: Password doesn't meet requirements
    """
    if len(password) < MIN_PASSWORD_LENGTH:
        raise ResetWeakPasswordException(
            f"Password must be at least {MIN_PASSWORD_LENGTH} characters long"
        )
    
    if len(password) > MAX_PASSWORD_LENGTH:
        raise ResetWeakPasswordException(
            f"Password must not exceed {MAX_PASSWORD_LENGTH} characters"
        )
    
    if REQUIRE_UPPERCASE and not any(c.isupper() for c in password):
        raise ResetWeakPasswordException("Password must contain at least one uppercase letter")
    
    if REQUIRE_LOWERCASE and not any(c.islower() for c in password):
        raise ResetWeakPasswordException("Password must contain at least one lowercase letter")
    
    if REQUIRE_DIGIT and not any(c.isdigit() for c in password):
        raise ResetWeakPasswordException("Password must contain at least one digit")
    
    if REQUIRE_SPECIAL_CHAR and not any(c in PASSWORD_SPECIAL_CHARS for c in password):
        raise ResetWeakPasswordException(
            f"Password must contain at least one special character: {PASSWORD_SPECIAL_CHARS}"
        )


def validate_passwords_match(new_password: str, confirm_password: str) -> None:
    """
    Validate passwords match
    
    Raises:
        ResetPasswordMismatchException: Passwords don't match
    """
    if new_password != confirm_password:
        raise ResetPasswordMismatchException()


def validate_user_can_reset_password(user: User) -> None:
    """
    Validate user is eligible for password reset
    
    Raises:
        ResetUserNotApprovedException: Account not approved
        ResetAccountLockedException: Account is locked
    """
    if user.approved_status != 'approved':
        raise ResetUserNotApprovedException(email=user.email)
    
    if user.is_locked:
        raise ResetAccountLockedException(email=user.email)


# ============================================
# BUSINESS LOGIC - Database Operations
# ============================================

def get_validated_user_by_email(email: str, db: Session) -> User:
    """
    Get user by email with validation for password reset
    
    Raises:
        PasswordResetUserNotFoundException: User not found
    """
    user = utils_get_user_by_email(email, db)
    if not user:
        raise PasswordResetUserNotFoundException(email=email)
    return user


def get_validated_user_by_id(user_id: str, email: str, db: Session) -> User:
    """
    Get user by ID and validate email matches for password reset
    
    Raises:
        PasswordResetUserNotFoundException: User not found
    """
    user = utils_get_user_by_id(user_id, db)
    if not user:
        raise PasswordResetUserNotFoundException(email=email)
    return user




def update_user_password(user: User, new_password: str) -> None:
    """Update user's password and timestamp"""
    user.password_hash = get_password_hash(new_password)
    user.last_password_changed = datetime.now(timezone.utc)




# ============================================
# ORCHESTRATION LAYER - Public API
# ============================================

def request_password_reset(email: str, db: Session) -> Dict[str, str]:
    """
    Request password reset - sends reset link to user's email
    
    Stateless approach - no database table for tokens.
    Only tracks reset attempts in User table for audit.
    
    Orchestrates:
    1. User validation
    2. Token generation (JWT)
    3. Email sending
    4. Audit tracking
    
    Args:
        email: User's email address
        db: Database session
        
    Returns:
        dict with email and message
        
    Raises:
        Various PasswordResetException subclasses
    """
    # Validate user
    user = get_validated_user_by_email(email, db)
    validate_user_can_reset_password(user)
    
    # Track reset request FIRST (audit trail - track even if email fails)
    user.last_password_reset_request = datetime.now(timezone.utc)
    user.password_reset_count = (user.password_reset_count or 0) + 1
    db.commit()  # Commit audit immediately
    
    # Generate JWT token (stateless)
    reset_token = create_password_reset_token(user.user_id, user.email)
    
    # Generate reset link
    reset_link = f"{settings.FRONTEND_URL}/reset-password?token={reset_token}"
    
    # Send email (if this fails, audit is already saved)
    try:
        send_password_reset_email(user.email, reset_link, user.first_name)
    except Exception as e:
        # Email failed, but audit already saved
        raise PasswordResetFailedException(reason=str(e))


    ActivityLogService(db).log_activity(
        action="email.password_reset_sent",
        outcome=ActivityOutcome.SUCCESS.value,
        actor=build_actor_from_user(user),
        metadata={"recipient_email": user.email},
        audit_log_disabled=is_audit_log_disabled_for_user(user),
    )
    
    return {
        "email": user.email,
        "message": "Password reset link has been sent to your email"
    }


def reset_password(token: str, new_password: str, confirm_password: str, db: Session) -> Dict[str, str]:
    """
    Reset user's password using reset token
    
    Stateless approach - JWT token validated directly, no database lookup needed.
    Token expiry and signature validation handled by JWT library.
    
    Orchestrates:
    1. Password validation
    2. Token verification (JWT)
    3. Password update
    
    Args:
        token: Password reset JWT token
        new_password: New password
        confirm_password: Password confirmation
        db: Database session
        
    Returns:
        dict with success message
        
    Raises:
        Various PasswordResetException subclasses
    """
    # Validate passwords
    validate_passwords_match(new_password, confirm_password)
    validate_password_strength(new_password)
    
    # Decode and validate JWT token (stateless - no DB check needed)
    token_data = decode_reset_token(token)
    user_id = token_data["user_id"]
    email = token_data["email"]
    
    # Get user
    user = get_validated_user_by_id(user_id, email, db)
    
    try:
        # Update password
        update_user_password(user, new_password)
        
        # Commit changes
        db.commit()

        ActivityLogService(db).log_activity(
            action="user.password_reset_completed",
            outcome=ActivityOutcome.SUCCESS.value,
            actor=build_actor_from_user(user),
            audit_log_disabled=is_audit_log_disabled_for_user(user),
        )
        
        return {
            "message": "Password reset successful. Please login with your new password"
        }
        
    except Exception as e:
        db.rollback()
        raise PasswordResetFailedException(reason=str(e))
