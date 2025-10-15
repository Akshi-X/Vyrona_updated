"""
Password Reset Service

Handles forgot password and password reset functionality with JWT tokens.
Implements rate limiting and security best practices.

Architecture:
- Business Logic Layer: Pure validation and token operations
- Orchestration Layer: Coordinates flow and database transactions
"""

from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
from jose import JWTError, jwt

from ..models.user_model import User
from ..models.password_reset_model import PasswordReset
from ..auth.auth import get_password_hash, pwd_context
from ..config.config import settings
from ..service.email_service import send_password_reset_email
from ..utils.utils import ensure_timezone_aware
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


def hash_reset_token(token: str) -> str:
    """Hash reset token for secure database storage"""
    return pwd_context.hash(token)


def verify_reset_token_hash(token: str, token_hash: str) -> bool:
    """Verify reset token against its hash"""
    return pwd_context.verify(token, token_hash)


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

def get_user_by_email(email: str, db: Session) -> User:
    """
    Get user by email
    
    Raises:
        PasswordResetUserNotFoundException: User not found
    """
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise PasswordResetUserNotFoundException(email=email)
    return user


def get_user_by_id(user_id: str, email: str, db: Session) -> User:
    """
    Get user by ID and validate email matches
    
    Raises:
        PasswordResetUserNotFoundException: User not found
    """
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise PasswordResetUserNotFoundException(email=email)
    return user


def get_valid_reset_record(user_id: str, email: str, db: Session) -> Optional[PasswordReset]:
    """Get valid (unused, non-expired) reset record"""
    return db.query(PasswordReset).filter(
        PasswordReset.user_id == user_id,
        PasswordReset.email == email,
        PasswordReset.is_used == False,
        PasswordReset.expires_at > datetime.now(timezone.utc)
    ).order_by(PasswordReset.created_at.desc()).first()


def create_reset_record(user: User, token_hash: str, db: Session) -> PasswordReset:
    """Create password reset database record"""
    reset_record = PasswordReset(
        user_id=user.user_id,
        email=user.email,
        token_hash=token_hash,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=PASSWORD_RESET_TOKEN_EXPIRY_MINUTES),
        is_used=False
    )
    db.add(reset_record)
    return reset_record


def update_user_password(user: User, new_password: str) -> None:
    """Update user's password and timestamp"""
    user.password_hash = get_password_hash(new_password)
    user.last_password_changed = datetime.now(timezone.utc)


def mark_token_as_used(reset_record: PasswordReset) -> None:
    """Mark reset token as used"""
    reset_record.is_used = True


# ============================================
# ORCHESTRATION LAYER - Public API
# ============================================

def request_password_reset(email: str, db: Session) -> Dict[str, str]:
    """
    Request password reset - sends reset link to user's email
    
    Orchestrates:
    1. User validation
    2. Token generation
    3. Email sending
    4. Database commit
    
    Args:
        email: User's email address
        db: Database session
        
    Returns:
        dict with email and message
        
    Raises:
        Various PasswordResetException subclasses
    """
    # Validate user
    user = get_user_by_email(email, db)
    validate_user_can_reset_password(user)
    
    # Generate token and hash
    reset_token = create_password_reset_token(user.user_id, user.email)
    token_hash = hash_reset_token(reset_token)
    
    # Create database record
    reset_record = create_reset_record(user, token_hash, db)
    
    try:
        # Flush to validate before sending email
        db.flush()
        
        # Generate reset link
        reset_link = f"{settings.FRONTEND_URL}/reset-password?token={reset_token}"
        
        # Send email (if fails, transaction will rollback)
        send_password_reset_email(user.email, reset_link, user.first_name)
        
        # Commit transaction
        db.commit()
        
        return {
            "email": user.email,
            "message": "Password reset link has been sent to your email"
        }
        
    except Exception as e:
        db.rollback()
        raise PasswordResetFailedException(reason=str(e))


def reset_password(token: str, new_password: str, confirm_password: str, db: Session) -> Dict[str, str]:
    """
    Reset user's password using reset token
    
    Orchestrates:
    1. Password validation
    2. Token verification
    3. Database record check
    4. Password update
    5. Token invalidation
    
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
    
    # Decode and validate token
    token_data = decode_reset_token(token)
    user_id = token_data["user_id"]
    email = token_data["email"]
    
    # Get and validate reset record
    reset_record = get_valid_reset_record(user_id, email, db)
    if not reset_record:
        raise InvalidResetTokenException()
    
    # Verify token hash
    if not verify_reset_token_hash(token, reset_record.token_hash):
        raise InvalidResetTokenException()
    
    # Get user
    user = get_user_by_id(user_id, email, db)
    
    try:
        # Update password and mark token as used
        update_user_password(user, new_password)
        mark_token_as_used(reset_record)
        
        # Commit changes
        db.commit()
        
        return {
            "message": "Password reset successful. Please login with your new password"
        }
        
    except Exception as e:
        db.rollback()
        raise PasswordResetFailedException(reason=str(e))
