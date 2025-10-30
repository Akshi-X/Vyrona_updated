"""
Account Locking Service
Handles brute force protection by locking accounts after failed login attempts
"""

from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session

from ..models.user_model import User
from ..constants.app_constants import MAX_LOGIN_ATTEMPTS, ACCOUNT_LOCK_DURATION_MINUTES
from ..exceptions import AccountLockedException


def check_account_lock_status(user: User, db: Session) -> None:
    """
    Check if account is locked and handle auto-unlock
    
    Args:
        user: User object
        db: Database session
        
    Raises:
        AccountLockedException: If account is currently locked
    """
    if not user.is_locked:
        return  # Account not locked, all good
    
    current_time = datetime.now(timezone.utc)
    
    # Normalize lock_expiry timezone
    lock_expiry = user.lock_expiry
    if lock_expiry and lock_expiry.tzinfo is None:
        # Interpret legacy naive timestamps as local time, then convert to UTC
        local_tz = datetime.now().astimezone().tzinfo
        lock_expiry = lock_expiry.replace(tzinfo=local_tz).astimezone(timezone.utc)
    
    # Check if lock has expired
    if lock_expiry and current_time >= lock_expiry:
        # Lock expired - auto unlock
        unlock_account(user, db)
        return
    
    # Still locked - calculate time remaining
    if lock_expiry:
        time_remaining = lock_expiry - current_time
        minutes_remaining = int(time_remaining.total_seconds() / 60) + 1
    else:
        minutes_remaining = ACCOUNT_LOCK_DURATION_MINUTES
    
    raise AccountLockedException(
        user_id=user.user_id,
        unlock_time=lock_expiry,
        minutes_remaining=minutes_remaining
    )


def increment_failed_login_attempt(user: User, db: Session) -> None:
    """
    Increment failed login attempts and lock account if threshold reached
    
    Args:
        user: User object
        db: Database session
    """
    user.login_attempts += 1
    
    # Check if should lock account
    if user.login_attempts >= MAX_LOGIN_ATTEMPTS:
        lock_account(user, db)
    else:
        db.commit()


def lock_account(user: User, db: Session, duration_minutes: int = ACCOUNT_LOCK_DURATION_MINUTES) -> None:
    """
    Lock user account for specified duration
    
    Args:
        user: User object
        db: Database session
        duration_minutes: Lock duration in minutes (default: 30)
    """
    user.is_locked = True
    user.lock_expiry = datetime.now(timezone.utc) + timedelta(minutes=duration_minutes)
    db.commit()


def unlock_account(user: User, db: Session) -> None:
    """
    Unlock user account and reset login attempts
    
    Args:
        user: User object
        db: Database session
    """
    user.is_locked = False
    user.lock_expiry = None
    user.login_attempts = 0
    db.commit()


def reset_login_attempts(user: User, db: Session) -> None:
    """
    Reset login attempts counter (called on successful login)
    
    Args:
        user: User object
        db: Database session
    """
    user.login_attempts = 0
    user.last_login = datetime.now(timezone.utc)
    db.commit()


def get_remaining_attempts(user: User) -> int:
    """
    Get remaining login attempts before account lock
    
    Args:
        user: User object
        
    Returns:
        Number of attempts remaining
    """
    return MAX_LOGIN_ATTEMPTS - user.login_attempts


def is_account_locked(user: User) -> bool:
    """
    Check if account is currently locked (considering expiry)
    
    Args:
        user: User object
        
    Returns:
        True if locked and lock hasn't expired, False otherwise
    """
    if not user.is_locked:
        return False
    
    if user.lock_expiry:
        current_time = datetime.now(timezone.utc)
        lock_expiry = user.lock_expiry
        # Normalize timezone if naive (assume local, convert to UTC)
        if lock_expiry.tzinfo is None:
            local_tz = datetime.now().astimezone().tzinfo
            lock_expiry = lock_expiry.replace(tzinfo=local_tz).astimezone(timezone.utc)
        return current_time < lock_expiry
    
    return True

