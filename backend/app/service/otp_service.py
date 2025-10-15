import random
import string
from datetime import datetime, timedelta, timezone
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import and_

from ..models.otp_model import OTP
from ..models.user_model import User
from ..auth.auth import create_access_token
from ..exceptions import ResendOTPFailedException
from .email_service import send_otp_email


def generate_otp_code(length: int = 6) -> str:
    """Generate a random OTP code"""
    return ''.join(random.choices(string.digits, k=length))


def send_otp_to_user(db: Session, user_id: str, email: str) -> OTP:
    """
    Generate and send OTP to user's email with proper transaction handling.
    
    If email sending fails, OTP record is rolled back to prevent orphaned OTP codes.
    
    Args:
        db: Database session
        user_id: User ID
        email: User's email address
        
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
        
        # Create OTP record
        otp = OTP(
            user_id=user_id,
            email=email,
            otp_code=otp_code,
            expires_at=expires_at,
            is_used=False,
            attempts=0
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
        raise Exception(f"Failed to send OTP: {str(e)}")


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


def get_user_by_email(db: Session, email: str) -> Optional[User]:
    """
    Get user by email address
    
    Args:
        db: Database session
        email: User's email address
        
    Returns:
        User object if found, None otherwise
    """
    try:
        return db.query(User).filter(User.email == email).first()
    except Exception as e:
        raise Exception(f"Failed to get user by email: {str(e)}")


def get_user_by_user_id(db: Session, user_id: str) -> Optional[User]:
    """
    Get user by user ID
    
    Args:
        db: Database session
        user_id: User's ID
        
    Returns:
        User object if found, None otherwise
    """
    try:
        return db.query(User).filter(User.user_id == user_id).first()
    except Exception as e:
        raise Exception(f"Failed to get user by user ID: {str(e)}")


def verify_otp_and_create_token(user_id: str, otp: str, db: Session) -> dict:
    """
    Verify OTP and create JWT token
    
    Business Logic:
    - Validate OTP
    - Get user
    - Create token with user's custom session timeout
    
    Args:
        user_id: User ID
        otp: OTP code
        db: Database session
        
    Returns:
        dict with user_id, email, auth_token, expires_at
    """
    # Import here to avoid circular dependency
    from ..dependencies.auth_dependencies import validate_otp_verification
    
    print(f"Verifying OTP for user_id: {user_id}")
    
    # Validation
    user = validate_otp_verification(user_id, otp, db)
    print(f"OTP validated for user: {user.email}")
    
    # Business Logic: Create JWT token with user's custom session timeout
    print(f"Creating JWT token with session timeout: {user.session_timeout} minutes")
    access_token_expires = timedelta(minutes=user.session_timeout)
    access_token = create_access_token(
        data={"sub": str(user.user_id)}, 
        expires_delta=access_token_expires
    )
    print(f"JWT token created successfully")
    
    expires_at = datetime.now(timezone.utc) + access_token_expires
    print(f"Token expires at: {expires_at}")
    
    return {
        "user_id": str(user.user_id),
        "email": user.email,
        "auth_token": access_token,
        "expires_at": expires_at
    }


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



