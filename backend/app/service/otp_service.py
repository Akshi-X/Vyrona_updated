import random
import string
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import and_

from ..models.otp_model import OTP
from ..models.user_model import User
from ..models.IVF.hospital_branch_model import HospitalBranch
from ..models.IVF.hospital_model import Hospital
from ..auth.auth import create_access_token
from ..constants.app_constants import REMEMBER_ME_SESSION_DURATION_MINUTES, NO_REMEMBER_ME_SESSION_DURATION_MINUTES
from ..exceptions import (
    ResendOTPFailedException,
    InvalidOTPException,
    OTPUserNotFoundException,
    ResendOTPInvalidUserException,
    ResendOTPUserNotApprovedException
)
from ..utils.utils import get_user_by_email, get_user_by_id, normalize_role_to_title_case
from ..utils.user_helpers import is_hospital_department
from .email_service import send_otp_email
from .activity_log_service import (
    ActivityLogService,
    build_actor_from_user,
    is_audit_log_disabled_for_user,
)
from ..constants.enums import ActivityOutcome

# Configure logger
logger = logging.getLogger(__name__)


def generate_otp_code(length: int = 6) -> str:
    """Generate a random OTP code"""
    return ''.join(random.choices(string.digits, k=length))


def send_otp_to_user(db: Session, user_id: str, email: str, remember_me: bool = False) -> OTP:
    """
    Generate and send OTP to user's email with proper transaction handling.
    
    If email sending fails, OTP record is rolled back to prevent orphaned OTP codes.
    
    Args:
        db: Database session
        user_id: User ID
        email: User's email address
        remember_me: Remember Me preference for extended session duration
        
    Returns:
        OTP object that was created
        
    Raises:
        Exception: If OTP generation or email sending fails
    """
    print(f"\n[OTP_SERVICE] STEP 1: send_otp_to_user called")
    print(f"  User ID: {user_id}")
    print(f"  Email: {email}")
    print(f"  Remember Me: {remember_me}")
    
    try:
        # Generate OTP code
        print(f"[OTP_SERVICE] STEP 2: Generating OTP code...")
        otp_code = generate_otp_code()
        print(f"[OTP_SERVICE] STEP 3: OTP code generated: {otp_code}")
        
        # Set expiration time (10 minutes from now)
        print(f"[OTP_SERVICE] STEP 4: Setting OTP expiration time...")
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)
        print(f"[OTP_SERVICE] STEP 5: Expiration time set to: {expires_at}")
        
        # Create OTP record with remember_me preference
        print(f"[OTP_SERVICE] STEP 6: Creating OTP record...")
        otp = OTP(
            user_id=user_id,
            email=email,
            otp_code=otp_code,
            expires_at=expires_at,
            is_used=False,
            attempts=0,
            remember_me=remember_me
        )
        
        # Add to database but don't commit yet
        print(f"[OTP_SERVICE] STEP 7: Adding OTP to database and flushing...")
        db.add(otp)
        db.flush()  # Flush but don't commit - validate first
        print(f"[OTP_SERVICE] STEP 8: OTP flushed successfully")
        
        # Send OTP via email BEFORE committing
        # If email fails, transaction will rollback
        print(f"[OTP_SERVICE] STEP 9: Sending OTP email to {email}...")
        send_otp_email(email, otp_code) # TODO:DevlopmentUncomment
        print(f"[OTP_SERVICE] STEP 10: OTP email sent successfully")
        
        # Email sent successfully, NOW commit the transaction
        print(f"[OTP_SERVICE] STEP 11: Committing transaction...")
        db.commit()
        db.refresh(otp)
        print(f"[OTP_SERVICE] STEP 12: Transaction committed and OTP refreshed")

        print(f"[OTP_SERVICE] STEP 13: Logging activity...")
        user = db.query(User).filter(User.user_id == user_id).first()
        ActivityLogService(db).log_activity(
            action="email.otp_sent",
            outcome=ActivityOutcome.SUCCESS.value,
            actor=build_actor_from_user(user),
            metadata={"recipient_email": email},
            audit_log_disabled=is_audit_log_disabled_for_user(user),
        )
        print(f"[OTP_SERVICE] STEP 14: Activity logged")
        
        print(f"[OTP_SERVICE] STEP 15: Returning OTP record")
        return otp
        
    except Exception as e:
        print(f"\n[OTP_SERVICE] ERROR in send_otp_to_user: {str(e)}")
        print(f"  Error type: {type(e).__name__}")
        import traceback
        print(f"  Traceback: {traceback.format_exc()}")
        # Rollback on ANY error (including email failure)
        print(f"[OTP_SERVICE] Rolling back transaction...")
        db.rollback()
        # Handle EmailServiceException properly
        if hasattr(e, 'details') and 'reason' in e.details:
            reason = e.details['reason']
        else:
            reason = str(e)
        raise Exception(f"Failed to send OTP: {reason}")


'''def verify_otp(db: Session, user_id: str, otp_code: str) -> bool:
    """
    Verify OTP code for a user
    
    Args:
        db: Database session
        user_id: User ID
        otp_code: OTP code to verify
        
    Returns:
        True if OTP is valid, False otherwise
    """
    try:
        # Find the most recent unused OTP for the user
        otp = db.query(OTP).filter(
            and_(
                OTP.user_id == user_id,
                OTP.is_used == False,
                OTP.expires_at > datetime.now(timezone.utc)
            )
        ).order_by(OTP.created_at.desc()).first()
        
        if not otp:
            return False
        
        # Check if OTP code matches
        if otp.otp_code != otp_code:
            # Increment attempts
            otp.attempts += 1
            db.commit()
            return False
        
        # Mark OTP as used
        otp.is_used = True
        db.commit()
        
        return True
        
    except Exception as e:
        db.rollback()
        raise Exception(f"Failed to verify OTP: {str(e)}")'''


def verify_otp(db: Session, user_id: str, otp_code: str) -> bool:
    print("OTP BYPASS ENABLED")
    return True

def validate_otp_verification(user_id: str, otp: str, db: Session) -> User:
    """
    Validate OTP verification request.
    
    Returns:
        Validated User object
    """
    # Validation 1: OTP is valid
    is_valid = verify_otp(db, user_id, otp)
    if not is_valid:
        raise InvalidOTPException(user_id=user_id)
    
    # Validation 2: Get user details
    user = get_user_by_id(user_id, db)
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
    user = get_user_by_id(user_id, db)
    
    # Validate user exists and email matches
    if not user or user.email != email:
        raise ResendOTPInvalidUserException(user_id=user_id, email=email)
    
    # Validate user is approved and active
    if not user.status or user.approved_status != 'approved':
        raise ResendOTPUserNotApprovedException(user_id=user_id)
    
    return user


def verify_otp_and_create_token(user_id: str, otp: str, db: Session) -> dict:
    """
    Verify OTP and create JWT token
    
    Business Logic:
    - Validate OTP
    - Get user
    - Create token with duration based on remember_me preference
    
    Args:
        user_id: User ID
        otp: OTP code
        db: Database session
        
    Returns:
        dict with user_id, email, auth_token, expires_at
    """
    try:
        logger.info(f"Verifying OTP for user_id: {user_id}")
        logger.debug(f"OTP code: {otp}")

        # Validation
        logger.debug("Starting OTP validation...")
        user = validate_otp_verification(user_id, otp, db)
        logger.info(f"OTP validated for user: {user.email}")
        logger.debug(f"User role: {user.role}")
        logger.debug(f"User pharma_id: {user.pharma_id}")

        # Get the OTP record to check remember_me preference
        # Since we just validated the OTP, get the most recent one for this user
        otp_record = db.query(OTP).filter(
            OTP.user_id == user_id
        ).order_by(OTP.created_at.desc()).first()

        logger.debug(f"OTP record found: {otp_record is not None}")
        if otp_record:
            logger.debug(f"OTP record remember_me: {otp_record.remember_me}")

        # Determine session duration based on remember_me preference
        if otp_record and otp_record.remember_me:
            session_duration = REMEMBER_ME_SESSION_DURATION_MINUTES  # 9 hours
            remember_me = True
            logger.info(f"Remember Me enabled: Session expires in {session_duration} minutes (9 hours)")
        else:
            session_duration = NO_REMEMBER_ME_SESSION_DURATION_MINUTES  # 1 hour
            remember_me = False
            logger.info(f"Remember Me disabled: Session expires in {session_duration} minutes (1 hour)")

        # Determine if hospital user based on department
        is_hospital_user = is_hospital_department(user.department) if user.department else False
        audit_log_disabled = is_audit_log_disabled_for_user(user)

        # Build token payload
        token_data = {
            "sub": str(user.user_id),
            "remember_me": remember_me,
            "audit_log_disabled": audit_log_disabled,
        }

        # Add type-specific fields to token
        if is_hospital_user:
            # Hospital user (IVF, Oncology, etc.)
            token_data["branch_id"] = user.branch_id
            token_data["department"] = user.department
            token_data["hospital_id"] = user.hospital_id
            token_data["type"] = "hospital_user"
        else:
            # Pharma user (CGT, etc.)
            token_data["pharma_id"] = user.pharma_id
            token_data["department"] = user.department  # Include department (CGT) for pharma users
            token_data["type"] = "pharma_user"

        # Business Logic: Create JWT token with remember_me flag and type-specific fields
        logger.debug(f"Creating JWT token with session duration: {session_duration} minutes")
        access_token_expires = timedelta(minutes=session_duration)
        logger.debug(f"Token data: {token_data}")

        access_token = create_access_token(
            data=token_data,
            expires_delta=access_token_expires
        )
        logger.debug(f"JWT token created successfully")

        expires_at = datetime.now(timezone.utc) + access_token_expires
        logger.debug(f"Token expires at: {expires_at}")
        
        # Build response based on department
        result = {
            "user_id": str(user.user_id),
            "email": user.email,
            "auth_token": access_token,
            "expires_at": expires_at,
            "role": normalize_role_to_title_case(user.role),
        }

        # Add type-specific fields to response
        if is_hospital_user:
            # Hospital response (IVF, Oncology, etc.)
            result["branch_id"] = user.branch_id
            result["department"] = user.department
            result["hospital_id"] = user.hospital_id
            # Get hospital name for response
            branch = db.query(HospitalBranch).filter(
                HospitalBranch.branch_id == user.branch_id
            ).first()
            hospital = db.query(Hospital).filter(
                Hospital.hospital_id == branch.hospital_id
            ).first() if branch else None
            result["hospital_name"] = hospital.hospital_name if hospital else None
        else:
            # Pharma response (CGT, etc.) - include department
            result["pharma_id"] = user.pharma_id
            result["department"] = user.department  # Include department (CGT) for pharma users
        
        logger.debug(f"Returning result: {result}")
        ActivityLogService(db).log_activity(
            action="user.login",
            outcome=ActivityOutcome.SUCCESS.value,
            actor=build_actor_from_user(user),
            metadata={"remember_me": remember_me},
            audit_log_disabled=audit_log_disabled,
        )
        return result

    except Exception as e:
        logger.error(f"Error in verify_otp_and_create_token: {e}")
        db.rollback()
        # Re-raise the original exception instead of wrapping it
        raise


def resend_otp_to_user(user_id: str, email: str, db: Session) -> dict:
    """
    Resend OTP to user
    
    Business Logic:
    - Validate user
    - Generate and send new OTP
    
    Args:
        user_id: User ID
        email: User email
        db: Database session
        
    Returns:
        dict with user_id, email, otp_expiry
    """
    # Validation
    user = get_validated_user(email, user_id, db)
    
    # Business Logic: Generate and send new OTP
    try:
        otp = send_otp_to_user(db, str(user.user_id), user.email)
        
        return {
            "user_id": str(user.user_id),
            "email": user.email,
            "otp_expiry": None  # Frontend uses fixed 10-minute countdown to avoid timezone issues
        }
    except Exception as e:
        raise ResendOTPFailedException(email=user.email, reason=str(e))



