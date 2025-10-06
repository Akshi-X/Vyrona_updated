import random
import string
from datetime import datetime, timedelta, timezone
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import and_

from ..models.otp_model import OTP
from ..models.user_model import User
from .email_service import send_otp_email


def generate_otp_code(length: int = 6) -> str:
    """Generate a random OTP code"""
    return ''.join(random.choices(string.digits, k=length))


def send_otp_to_user(db: Session, user_id: str, email: str) -> OTP:
    """
    Generate and send OTP to user's email
    
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
        
        # Save to database
        db.add(otp)
        db.commit()
        db.refresh(otp)
        
        # Send OTP via email
        send_otp_email(email, otp_code)
        
        return otp
        
    except Exception as e:
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



