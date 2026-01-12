import random
import string
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import and_

from ..models.otp_model import OTP
from ..models.user_model import User
from ..auth.auth import create_access_token
from ..exceptions import ResendOTPFailedException
from ..utils.utils import get_user_by_email, get_user_by_id
from .email_service import send_otp_email

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
    try:
        # Generate OTP code
        otp_code = generate_otp_code()
        
        # Set expiration time (10 minutes from now)
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)
        
        # Create OTP record with remember_me preference
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
        db.add(otp)
        db.flush()  # Flush but don't commit - validate first
        
        # Send OTP via email BEFORE committing
        # If email fails, transaction will rollback
        send_otp_email(email, otp_code)
        
        # Email sent successfully, NOW commit the transaction
        db.commit()
        db.refresh(otp)
        
        return otp
        
    except Exception as e:
        # Rollback on ANY error (including email failure)
        db.rollback()
        # Handle EmailServiceException properly
        if hasattr(e, 'details') and 'reason' in e.details:
            reason = e.details['reason']
        else:
            reason = str(e)
        raise Exception(f"Failed to send OTP: {reason}")


def verify_otp(db: Session, user_id: str, otp_code: str) -> bool:
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
        raise Exception(f"Failed to verify OTP: {str(e)}")




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
        # Import here to avoid circular dependency
        from ..dependencies.auth_dependencies import validate_otp_verification
        from ..constants.app_constants import REMEMBER_ME_SESSION_DURATION_MINUTES, NO_REMEMBER_ME_SESSION_DURATION_MINUTES

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
        from ..utils.user_helpers import is_hospital_department
        is_hospital_user = is_hospital_department(user.department) if user.department else False

        # Build token payload
        token_data = {
            "sub": str(user.user_id),
            "remember_me": remember_me,
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

        from ..utils.utils import normalize_role_to_title_case
        
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
            from ..models.IVF.hospital_branch_model import HospitalBranch
            from ..models.IVF.hospital_model import Hospital
            branch = db.query(HospitalBranch).filter(
                HospitalBranch.branch_id == user.branch_id
            ).first()
            hospital = db.query(Hospital).filter(
                Hospital.hospital_id == branch.hospital_id
            ).first() if branch else None
            result["hospital_name"] = hospital.hospital_name if hospital else None
        else:
            # Pharma response (CGT, etc.) - existing response format
            result["pharma_id"] = user.pharma_id
        
        logger.debug(f"Returning result: {result}")
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
    # Import here to avoid circular dependency
    from ..dependencies.auth_dependencies import get_validated_user
    
    # Validation
    user = get_validated_user(email, user_id, db)
    
    # Business Logic: Generate and send new OTP
    try:
        otp = send_otp_to_user(db, str(user.user_id), user.email)
        
        return {
            "user_id": str(user.user_id),
            "email": user.email,
            "otp_expiry": otp.expires_at
        }
    except Exception as e:
        raise ResendOTPFailedException(email=user.email, reason=str(e))



