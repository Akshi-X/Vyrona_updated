"""
IVF OTP Service
Handles OTP generation, sending, verification, and resending for IVF users
Similar to pharma OTP service but uses IVFOTP model
"""
import random
import string
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import and_

from ..models.ivf_otp_model import IVFOTP
from ..models.IVF.branch_login_model import BranchLogin
from ..auth.auth import create_access_token
from ..exceptions import ResendOTPFailedException
from .email_service import send_otp_email

# Configure logger
logger = logging.getLogger(__name__)


def generate_ivf_otp_code(length: int = 6) -> str:
    """Generate a random OTP code"""
    return ''.join(random.choices(string.digits, k=length))


def send_ivf_otp_to_user(db: Session, login_id: int, email: str, remember_me: bool = False) -> IVFOTP:
    """
    Generate and send OTP to IVF user's email with proper transaction handling.
    
    If email sending fails, OTP record is rolled back to prevent orphaned OTP codes.
    
    Args:
        db: Database session
        login_id: Branch login ID
        email: User's email address
        remember_me: Remember Me preference for extended session duration
        
    Returns:
        IVFOTP object that was created
        
    Raises:
        Exception: If OTP generation or email sending fails
    """
    try:
        # Generate OTP code
        otp_code = generate_ivf_otp_code()
        
        # Set expiration time (10 minutes from now)
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)
        
        # Create OTP record with remember_me preference
        otp = IVFOTP(
            login_id=login_id,
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


def verify_ivf_otp(db: Session, login_id: int, otp_code: str) -> bool:
    """
    Verify OTP code for an IVF user
    
    Args:
        db: Database session
        login_id: Branch login ID
        otp_code: OTP code to verify
        
    Returns:
        True if OTP is valid, False otherwise
    """
    try:
        # Find the most recent unused OTP for the login
        otp = db.query(IVFOTP).filter(
            and_(
                IVFOTP.login_id == login_id,
                IVFOTP.is_used == False,
                IVFOTP.expires_at > datetime.now(timezone.utc)
            )
        ).order_by(IVFOTP.created_at.desc()).first()
        
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


def verify_ivf_otp_and_create_token(login_id: int, otp: str, db: Session) -> dict:
    """
    Verify IVF OTP and create JWT token
    
    Business Logic:
    - Validate OTP
    - Get branch login
    - Create token with duration based on remember_me preference
    - Include role, branch_id, department in response
    
    Args:
        login_id: Branch login ID
        otp: OTP code
        db: Database session
        
    Returns:
        dict with login_id, email, auth_token, expires_at, role, branch_id, department
    """
    try:
        # Import here to avoid circular dependency
        from ..constants.app_constants import REMEMBER_ME_SESSION_DURATION_MINUTES, NO_REMEMBER_ME_SESSION_DURATION_MINUTES

        logger.info(f"Verifying IVF OTP for login_id: {login_id}")
        logger.debug(f"OTP code: {otp}")

        # Validation: Verify OTP
        logger.debug("Starting OTP validation...")
        is_valid = verify_ivf_otp(db, login_id, otp)
        if not is_valid:
            from ..exceptions.custom_exceptions import InvalidOTPException
            raise InvalidOTPException(user_id=str(login_id))
        
        # Get branch login
        branch_login = db.query(BranchLogin).filter(BranchLogin.login_id == login_id).first()
        if not branch_login:
            from ..exceptions.custom_exceptions import OTPUserNotFoundException
            raise OTPUserNotFoundException(user_id=str(login_id))
        
        logger.info(f"OTP validated for branch login: {branch_login.email}")
        logger.debug(f"Branch login role: {branch_login.role}")
        logger.debug(f"Branch login branch_id: {branch_login.branch_id}")
        logger.debug(f"Branch login department: {branch_login.department}")

        # Get the OTP record to check remember_me preference
        otp_record = db.query(IVFOTP).filter(
            IVFOTP.login_id == login_id
        ).order_by(IVFOTP.created_at.desc()).first()

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

        # Get hospital and branch for response
        from ..models.IVF.hospital_branch_model import HospitalBranch
        from ..models.IVF.hospital_model import Hospital
        branch = db.query(HospitalBranch).filter(HospitalBranch.branch_id == branch_login.branch_id).first()
        hospital = db.query(Hospital).filter(Hospital.hospital_id == branch.hospital_id).first() if branch else None

        # Business Logic: Create JWT token with remember_me flag, branch_id, and department in payload
        logger.debug(f"Creating JWT token with session duration: {session_duration} minutes")
        access_token_expires = timedelta(minutes=session_duration)
        logger.debug(f"Token data: sub={branch_login.login_id}, remember_me={remember_me}, branch_id={branch_login.branch_id}, department={branch_login.department}")

        access_token = create_access_token(
            data={
                "sub": str(branch_login.login_id),
                "remember_me": remember_me,
                "branch_id": branch_login.branch_id,
                "department": branch_login.department,
                "type": "ivf_branch_login"
            },
            expires_delta=access_token_expires
        )
        logger.debug(f"JWT token created successfully")

        expires_at = datetime.now(timezone.utc) + access_token_expires
        logger.debug(f"Token expires at: {expires_at}")

        from ..utils.utils import normalize_role_to_title_case
        
        result = {
            "login_id": branch_login.login_id,
            "email": branch_login.email,
            "auth_token": access_token,
            "expires_at": expires_at,
            "role": normalize_role_to_title_case(branch_login.role),
            "branch_id": branch_login.branch_id,
            "department": branch_login.department,
            "hospital_id": hospital.hospital_id if hospital else None,
            "hospital_name": hospital.hospital_name if hospital else None
        }
        logger.debug(f"Returning result: {result}")
        return result

    except Exception as e:
        logger.error(f"Error in verify_ivf_otp_and_create_token: {e}")
        db.rollback()
        # Re-raise the original exception instead of wrapping it
        raise


def resend_ivf_otp_to_user(login_id: int, email: str, db: Session) -> dict:
    """
    Resend OTP to IVF user
    
    Business Logic:
    - Validate branch login
    - Generate and send new OTP
    
    Args:
        login_id: Branch login ID
        email: User email
        db: Database session
        
    Returns:
        dict with login_id, email, otp_expiry
    """
    # Validation: Get branch login
    branch_login = db.query(BranchLogin).filter(
        BranchLogin.login_id == login_id,
        BranchLogin.email == email
    ).first()
    
    if not branch_login:
        from ..exceptions.custom_exceptions import DatabaseQueryException
        raise DatabaseQueryException(
            operation="resend OTP",
            reason="Branch login not found",
            custom_message="Invalid login credentials",
            status_code=404
        )
    
    # Business Logic: Generate and send new OTP
    try:
        otp = send_ivf_otp_to_user(db, branch_login.login_id, branch_login.email)
        
        return {
            "login_id": branch_login.login_id,
            "email": branch_login.email,
            "otp_expiry": otp.expires_at
        }
    except Exception as e:
        raise ResendOTPFailedException(email=branch_login.email, reason=str(e))
