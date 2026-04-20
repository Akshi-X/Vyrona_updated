"""
Authentication Dependencies

FastAPI dependencies for validation and authentication.
These are used with Depends() in route handlers.
Supports both HTTP/REST and WebSocket authentication.
"""

from fastapi import Depends, Request, WebSocket, Query
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from typing import Tuple
import logging

from ..config.database import get_db, SessionLocal
from ..service.otp_service import (
    verify_otp as verify_otp_service,
    validate_otp_verification,
    get_validated_user
)
from ..utils.utils import get_user_by_email, get_user_by_id
from ..auth.auth import verify_password
from ..service.account_locking_service import (
    check_account_lock_status,
    increment_failed_login_attempt,
    reset_login_attempts,
    get_remaining_attempts
)
from ..exceptions import (
    UserNotFoundException,
    UserNotApprovedException,
    InvalidCredentialsException,
    AccountInactiveException,
    PasswordMismatchException,
    EmailAlreadyExistsException,
    InvalidOTPException,
    OTPUserNotFoundException,
    ResendOTPInvalidUserException,
    ResendOTPUserNotApprovedException,
    UserGetNotFoundException,
    UserApproveNotFoundException,
    UserRejectNotFoundException
)
from ..exceptions.custom_exceptions import (
    ChatWebSocketAuthFailedException
)
from ..exceptions import TokenExpiredException
from ..models.user_model import User
from ..schemas.user_schema import UserRegister
from ..auth.auth import verify_token
from ..utils.user_helpers import get_hospital_by_email_domain

logger = logging.getLogger(__name__)


# ============================================
# Get Current User from Request State
# ============================================
def get_current_user(request: Request) -> User:
    """
    Get current authenticated user from request state.
    
    This is set by TokenValidationMiddleware.
    Use this in protected endpoints.
    
    Usage:
        @router.get("/profile")
        def get_profile(current_user: User = Depends(get_current_user)):
            return {"name": current_user.name}
    """
    if not hasattr(request.state, "current_user"):
        raise InvalidCredentialsException(email="unknown")
    
    return request.state.current_user


def get_current_user_pharma_id(request: Request) -> int:
    """
    Get pharma_id for the current authenticated user from JWT token.
    
    This extracts pharma_id directly from the token payload, eliminating
    the need for a database query. This is safe because pharma_id is
    immutable for each user in our architecture.
    
    Usage:
        @router.get("/ongoing")
        def get_ongoing(pharma_id: int = Depends(get_current_user_pharma_id)):
            return get_patients_summary(pharma_id)
    """
    from ..auth.auth import verify_token
    from ..exceptions import InvalidTokenException, UserNotFoundException
    
    # First try to get from request state (set by middleware)
    if hasattr(request.state, "pharma_id") and request.state.pharma_id is not None:
        return request.state.pharma_id
    
    # Fallback: Extract token from Authorization header
    auth_header = request.headers.get("Authorization")
    if not auth_header:
        raise InvalidTokenException()
    
    # Parse Authorization header (format: "Bearer <token>")
    parts = auth_header.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise InvalidTokenException()
    
    token = parts[1]
    
    # Verify token and get payload
    payload = verify_token(token)
    
    # Extract pharma_id from token payload
    pharma_id = payload.get("pharma_id")
    
    if pharma_id is None:
        raise UserNotFoundException(
            user_id="unknown"
        )
    
    return pharma_id


def get_pharma_id_from_request(request: Request) -> int:
    """
    Get pharma_id from request state (set by middleware).
    
    This is a lightweight alternative to get_current_user_pharma_id
    when you know the middleware has already processed the token.
    
    Usage:
        @router.get("/patients")
        def get_patients(request: Request):
            pharma_id = get_pharma_id_from_request(request)
            return get_patients_by_pharma(pharma_id)
    """
    if not hasattr(request.state, "pharma_id") or request.state.pharma_id is None:
        raise UserNotFoundException(
            user_id="unknown"
        )
    
    return request.state.pharma_id


def get_hospital_id_from_request(request: Request) -> int:
    """
    Get hospital_id from request state (set by middleware for hospital users).
    
    This is for hospital users (IVF flow) to get their hospital_id.
    
    Usage:
        @router.get("/canisters")
        def get_canisters(request: Request):
            hospital_id = get_hospital_id_from_request(request)
            return get_canisters_by_hospital(hospital_id)
    """
    if not hasattr(request.state, "hospital_id") or request.state.hospital_id is None:
        raise UserNotFoundException(
            user_id="unknown"
        )
    
    return request.state.hospital_id


def validate_login_request(email: str, password: str, db: Session) -> User:
    """
    Validate login request.
    
    Args:
        email: User email
        password: User password
        db: Database session
        
    Returns:
        Validated User object
    """
    # Validation 1: User exists
    user = get_user_by_email(email, db)
    if not user:
        raise UserNotFoundException(email=email)
    
    # Validation 2: Check account lock (auto-unlocks if expired)
    check_account_lock_status(user, db)
    
    # Validation 3: Account is active
    if not user.status:
        raise AccountInactiveException(user_id=user.user_id)
    
    # Validation 4: User is approved
    if user.approved_status != 'approved':
        raise UserNotApprovedException(user_id=user.user_id)
    
    # Validation 5: Password is correct
    if not verify_password(password, user.password_hash):
        # Increment failed attempts and possibly lock
        increment_failed_login_attempt(user, db)
        attempts_remaining = get_remaining_attempts(user)
        
        raise InvalidCredentialsException(
            email=email,
            attempts_remaining=attempts_remaining if attempts_remaining > 0 else None
        )
    
    # All validations passed! Reset login attempts
    reset_login_attempts(user, db)
    
    return user


def validate_registration_request(request: UserRegister, db: Session) -> UserRegister:
    """
    Validate registration request.
    
    Checks passwords match and email doesn't exist.
    
    Returns:
        Validated request
    """
    # Validation 1: Passwords match
    if request.password != request.confirm_password:
        raise PasswordMismatchException()
    
    # Validation 2: Email doesn't already exist
    existing_user = get_user_by_email(request.email, db)
    if existing_user:
        raise EmailAlreadyExistsException(email=request.email)
    
    # Validation 3: Apply DB-driven domain classification defaults
    hospital = get_hospital_by_email_domain(request.email, db)

    if hospital:
        # Keep request aligned with domain-resolved hospital when not explicitly set.
        if not request.hospital_name:
            request.hospital_name = hospital.hospital_name
        # Manager does not require branch_name; normalize so downstream never expects it.
        role_val = (getattr(request, "role", None) or "").strip()
        if role_val and role_val.lower() == "manager":
            request.branch_name = None
    else:
        # Pharma default department.
        if not request.department:
            request.department = "CGT"

    return request


def validate_get_user_request(user_id: str, db: Session) -> User:
    """
    Validate get user request.
    
    Returns:
        Validated User object
    """
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise UserGetNotFoundException(registration_id=str(user_id))
    
    return user


def validate_approve_user_request(user_id: str, db: Session) -> User:
    """
    Validate approve user request.
    
    Returns:
        Validated User object
    """
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise UserApproveNotFoundException(registration_id=str(user_id))
    
    return user


def validate_reject_user_request(user_id: str, db: Session) -> User:
    """
    Validate reject user request.
    
    Returns:
        Validated User object
    """
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise UserRejectNotFoundException(registration_id=str(user_id))
    
    return user


# ============================================
# WebSocket Authentication
# ============================================

async def authenticate_websocket(
    websocket: WebSocket,
    token: str = Query(...)
) -> Tuple[User, int]:
    """
    Authenticate WebSocket connection using JWT token
    
    Returns:
        Tuple of (user, pharma_id, db_session)
    
    Raises:
        ChatWebSocketAuthFailedException if authentication fails
    """
    try:
        try:
            payload = verify_token(token)
        except TokenExpiredException:
            logger.warning("WebSocket connection attempt with expired token")
            raise ChatWebSocketAuthFailedException(reason="Token has expired. Please login again")
        except Exception as e:
            logger.error(f"Token verification failed: {e}")
            raise ChatWebSocketAuthFailedException(reason="Invalid token")

        user_id = payload.get("user_id") or payload.get("sub")
        if not user_id:
            raise ChatWebSocketAuthFailedException(reason="Token missing user_id or sub")

        with SessionLocal() as db:
            user = db.query(User).filter(User.user_id == user_id).first()

            if not user:
                raise ChatWebSocketAuthFailedException(reason=f"User {user_id} not found")

            if not user.status:
                raise ChatWebSocketAuthFailedException(reason="Account is inactive")

            if user.approved_status != 'approved':
                raise ChatWebSocketAuthFailedException(reason="Account is not approved")

            pharma_id = payload.get("pharma_id")
            if pharma_id is None:
                pharma_id = user.pharma_id

            # For hospital/IVF users, pharma_id can be None - this is allowed
            # Hospital users have branch_id but no pharma_id
            # Pharma users have pharma_id but may not have branch_id
            if pharma_id is None:
                # Check if user is a hospital user (has branch_id)
                if not user.branch_id and user.role == "User":
                    # Not a hospital user and no pharma_id - this is an error
                    raise ChatWebSocketAuthFailedException(reason="Branch ID not found")
                # Hospital user with branch_id but no pharma_id - this is OK
                logger.debug(f"Hospital user {user_id} connecting without pharma_id)")

            db.expunge(user)

        logger.info(f"WebSocket authenticated: user_id={user_id}, pharma_id={pharma_id}")
        return user, pharma_id

    except ChatWebSocketAuthFailedException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error during WebSocket authentication: {e}", exc_info=True)
        raise ChatWebSocketAuthFailedException(reason=str(e))

