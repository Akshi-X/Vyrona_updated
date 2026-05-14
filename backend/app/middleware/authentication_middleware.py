"""
Authentication and Validation Middleware

Handles authentication exceptions before reaching controllers.
Validates user, account status, locks, approvals, and passwords.
"""

from typing import Callable, Optional
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from datetime import datetime, timezone

from ..config.database import SessionLocal
from ..service.otp_service import get_user_by_email
from ..auth.auth import verify_password
from ..service.account_locking_service import (
    check_account_lock_status,
    increment_failed_login_attempt,
    get_remaining_attempts
)
from ..exceptions import (
    UserNotFoundException,
    UserNotApprovedException,
    InvalidCredentialsException,
    AccountInactiveException
)


class LoginValidationMiddleware(BaseHTTPMiddleware):
    """
    Middleware to validate login requests
    Handles all validation BEFORE controller
    """
    
    async def dispatch(self, request: Request, call_next: Callable):
        # Only apply to login endpoint
        if request.url.path == "/api/login" and request.method == "POST":
            try:
                # Get request body
                body = await request.json()
                email = body.get("email")
                password = body.get("password")
                
                # Get database session
                db = SessionLocal()
                
                try:
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
                        # Increment failed attempts
                        increment_failed_login_attempt(user, db)
                        attempts_remaining = get_remaining_attempts(user)
                        
                        raise InvalidCredentialsException(
                            email=email,
                            attempts_remaining=attempts_remaining if attempts_remaining > 0 else None
                        )
                    
                    # All validations passed! Attach validated user to request
                    request.state.validated_user = user
                    request.state.db_session = db
                    
                finally:
                    db.close()
                    
            except Exception:
                # Let the global exception handler deal with it
                raise
        
        # Continue to controller (or next middleware)
        response = await call_next(request)
        return response


def validate_user_for_login(email: str, password: str, db) -> dict:
    """
    Standalone validation function for login
    Can be used in middleware or as dependency
    
    Returns:
        dict with user and validation result
        
    Raises:
        Custom exceptions for various failure scenarios
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
        # Increment failed attempts
        increment_failed_login_attempt(user, db)
        attempts_remaining = get_remaining_attempts(user)
        
        raise InvalidCredentialsException(
            email=email,
            attempts_remaining=attempts_remaining if attempts_remaining > 0 else None
        )
    
    # All validations passed
    return {"user": user, "valid": True}

