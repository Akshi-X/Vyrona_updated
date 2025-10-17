"""
Login Service
All login-related business logic

Controllers just call these service methods.
"""

from sqlalchemy.orm import Session
from datetime import datetime, timezone

from ..dependencies.auth_dependencies import validate_login_request
from .otp_service import send_otp_to_user
from ..exceptions import OTPSendFailedException


def handle_login(email: str, password: str, remember_me: bool, db: Session) -> dict:
    """
    Handle complete login flow
    
    Business Logic:
    - Validate credentials (user exists, not locked, password correct, etc.)
    - Send OTP to user
    - Store remember_me preference for session duration
    - Return login result
    
    Args:
        email: User email
        password: User password
        remember_me: Remember Me preference for extended session
        db: Database session
        
    Returns:
        dict with user_id, email, otp_expiry
        
    Raises:
        Various exceptions if validation or OTP sending fails
    """
    # Validation (all security checks)
    user = validate_login_request(email, password, db)
    
    # Business Logic: Generate and send OTP with remember_me preference
    try:
        otp = send_otp_to_user(db, str(user.user_id), user.email, remember_me)
        
        return {
            "user_id": str(user.user_id),
            "email": user.email,
            "otp_expiry": otp.expires_at
        }
    except Exception as e:
        raise OTPSendFailedException(email=user.email, reason=str(e))

