"""
Login Service
All login-related business logic

Controllers just call these service methods.
"""

from sqlalchemy.orm import Session
from datetime import datetime, timezone

from ..dependencies.auth_dependencies import validate_login_request
from ..service.activity_log_service import (
    ActivityLogService,
    build_actor_from_user,
    is_audit_log_disabled_for_user,
)
from ..constants.enums import ActivityOutcome
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
    print("\n[LOGIN_SERVICE] STEP 1: handle_login called")
    print(f"  Email: {email}")
    print(f"  Remember Me: {remember_me}")
    
    try:
        # Validation (all security checks)
        print("\n[LOGIN_SERVICE] STEP 2: Calling validate_login_request...")
        user = validate_login_request(email, password, db)
        print(f"[LOGIN_SERVICE] STEP 3: User validation passed")
        print(f"  User ID: {user.user_id}")
        print(f"  User Email: {user.email}")
        
        # Business Logic: Generate and send OTP with remember_me preference
        try:
            print("\n[LOGIN_SERVICE] STEP 4: Calling send_otp_to_user...")
            otp = send_otp_to_user(db, str(user.user_id), user.email, remember_me)
            print(f"[LOGIN_SERVICE] STEP 5: OTP sent successfully")
            
            print("\n[LOGIN_SERVICE] STEP 6: Logging activity...")
            audit_log_disabled = is_audit_log_disabled_for_user(user)
            ActivityLogService(db).log_activity(
                action="user.login_requested",
                outcome=ActivityOutcome.SUCCESS.value,
                actor=build_actor_from_user(user),
                metadata={"remember_me": remember_me},
                audit_log_disabled=audit_log_disabled,
            )
            print("[LOGIN_SERVICE] STEP 7: Activity logged")
            
            result = {
                "user_id": str(user.user_id),
                "email": user.email,
                "otp_expiry": None  # Frontend uses fixed 10-minute countdown to avoid timezone issues
            }
            
            print("\n[LOGIN_SERVICE] STEP 8: Returning login result")
            print(f"  Result: {result}")
            return result
            
        except Exception as e:
            print(f"\n[LOGIN_SERVICE] ERROR in OTP sending: {str(e)}")
            print(f"  Error type: {type(e).__name__}")
            import traceback
            print(f"  Traceback: {traceback.format_exc()}")
            raise OTPSendFailedException(email=user.email, reason=str(e))
            
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"OTP send failed: {e}", exc_info=True)
        raise OTPSendFailedException(email=user.email, reason=str(e))

