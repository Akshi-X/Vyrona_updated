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


def handle_login(email: str, password: str, db: Session) -> dict:
    """
    Handle complete login flow
    
    Business Logic:
    - Validate credentials (user exists, not locked, password correct, etc.)
    - Send OTP to user
    - Return login result
    
    Args:
        email: User email
        password: User password
        db: Database session
        
    Returns:
        dict with user_id, email, otp_expiry
        
    Raises:
        Various exceptions if validation or OTP sending fails
    """
    # Validation (all security checks)
    user = validate_login_request(email, password, db)
    
    # Business Logic: Generate and send OTP
    try:
        otp = send_otp_to_user(db, str(user.user_id), user.email)
        
        return {
            "user_id": str(user.user_id),
            "email": user.email,
            "otp_expiry": otp.expires_at
        }
    except Exception as e:
        raise OTPSendFailedException(email=user.email, reason=str(e))

