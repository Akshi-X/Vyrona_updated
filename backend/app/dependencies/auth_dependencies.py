"""
Authentication Dependencies

Validation functions used by middleware.
"""

from fastapi import Depends
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from ..config.database import get_db
from ..service.otp_service import get_user_by_email, get_user_by_user_id, verify_otp as verify_otp_service
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
from ..models.user_model import User
from ..schemas.user_schema import UserRegister


class ValidatedLoginUser:
    """Login validation dependency."""
    
    def __init__(self, email: str, password: str):
        self.email = email
        self.password = password
    
    async def __call__(self, db: Session = Depends(get_db)) -> User:
        """Validate user login credentials."""
        # Validation 1: User exists
        user = get_user_by_email(db, self.email)
        if not user:
            raise UserNotFoundException(email=self.email)
        
        # Validation 2: Check account lock (auto-unlocks if expired)
        check_account_lock_status(user, db)
        
        # Validation 3: Account is active
        if not user.status:
            raise AccountInactiveException(user_id=user.user_id)
        
        # Validation 4: User is approved
        if user.approved_status != 'approved':
            raise UserNotApprovedException(user_id=user.user_id)
        
        # Validation 5: Password is correct
        if not verify_password(self.password, user.password_hash):
            # Increment failed attempts and possibly lock
            increment_failed_login_attempt(user, db)
            attempts_remaining = get_remaining_attempts(user)
            
            raise InvalidCredentialsException(
                email=self.email,
                attempts_remaining=attempts_remaining if attempts_remaining > 0 else None
            )
        
        # All validations passed! Reset login attempts
        reset_login_attempts(user, db)
        
        return user


def validate_login_request(email: str, password: str, db: Session = Depends(get_db)) -> User:
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
    user = get_user_by_email(db, email)
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
    existing_user = get_user_by_email(db, request.email)
    if existing_user:
        raise EmailAlreadyExistsException(email=request.email)
    
    return request


def validate_otp_verification(user_id: str, otp: str, db: Session) -> User:
    """
    Validate OTP verification request.
    
    Returns:
        Validated User object
    """
    # Validation 1: OTP is valid
    is_valid = verify_otp_service(db, user_id, otp)
    if not is_valid:
        raise InvalidOTPException(user_id=user_id)
    
    # Validation 2: Get user details
    user = get_user_by_user_id(db, user_id)
    if not user:
        raise OTPUserNotFoundException(user_id=user_id)
    
    return user


def get_validated_user(email: str, user_id: str, db: Session) -> User:
    """
    Validate user for resend OTP.
    
    Returns:
        Validated User object
    """
    # Get user
    user = get_user_by_user_id(db, user_id)
    
    # Validate user exists and email matches
    if not user or user.email != email:
        raise ResendOTPInvalidUserException(user_id=user_id, email=email)
    
    # Validate user is approved and active
    if not user.status or user.approved_status != 'approved':
        raise ResendOTPUserNotApprovedException(user_id=user_id)
    
    return user


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

