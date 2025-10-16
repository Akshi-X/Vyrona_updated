import uuid
from datetime import datetime, timezone
from passlib.context import CryptContext

from ..models.user_model import User

# Password hashing context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def generate_user_id():
    return f"USR-{uuid.uuid4().hex[:6].upper()}"

def hash_password(password: str) -> str:
    """Hash a password with bcrypt length handling"""
    # Ensure password is a string and truncate if too long for bcrypt
    if isinstance(password, bytes):
        password = password.decode('utf-8')
    
    # Bcrypt has a 72-byte limit, so truncate if necessary
    if len(password.encode('utf-8')) > 72:
        password = password[:72]
    
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def ensure_timezone_aware(dt: datetime) -> datetime:
    """
    Ensure datetime is timezone-aware (UTC if naive)
    
    Args:
        dt: Datetime object (naive or aware)
        
    Returns:
        Timezone-aware datetime (UTC)
    """
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


# ============================================
# DATABASE QUERY UTILITIES
# ============================================

def get_user_by_email(email: str, db) -> User:
    """
    Get user by email address (common utility)
    
    Args:
        email: User's email address
        db: Database session (SQLAlchemy Session)
        
    Returns:
        User object if found, None otherwise
    """
    return db.query(User).filter(User.email == email).first()


def get_user_by_id(user_id: str, db) -> User:
    """
    Get user by user ID (common utility)
    
    Args:
        user_id: User's ID
        db: Database session (SQLAlchemy Session)
        
    Returns:
        User object if found, None otherwise
    """
    return db.query(User).filter(User.user_id == user_id).first()
