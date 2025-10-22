import uuid
from datetime import datetime, timezone
from typing import Dict, Optional, Any
from passlib.context import CryptContext
from fastapi.responses import JSONResponse

from ..models.user_model import User
from ..constants.status_constants import STATUS_FAILED

# Password hashing context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ============================================
# COMMON RESPONSE HEADERS
# ============================================

COMMON_RESPONSE_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
}


# ============================================
# RESPONSE BUILDER UTILITIES
# ============================================

def create_error_response(
    status_code: int,
    error_code: str,
    message: str,
    details: Optional[Dict[str, Any]] = None,
    headers: Optional[Dict[str, str]] = None
) -> JSONResponse:
    """
    Create a standardized error response with common structure and headers.
    
    Args:
        status_code: HTTP status code
        error_code: Application error code
        message: Error message
        details: Optional additional details (e.g., remaining_attempts)
        headers: Optional additional headers (merged with common headers)
        
    Returns:
        JSONResponse with standardized error format
    """
    content = {
        "error_code": error_code,
        "message": message,
        "status": STATUS_FAILED,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    
    # Add optional details
    if details:
        content.update(details)
    
    # Merge headers
    response_headers = COMMON_RESPONSE_HEADERS.copy()
    if headers:
        response_headers.update(headers)
    
    return JSONResponse(
        status_code=status_code,
        content=content,
        headers=response_headers
    )

def generate_user_id():
    return f"USR-{uuid.uuid4().hex[:6].upper()}"



def generate_patient_id():
    """Generate unique patient ID"""
    return f"PAT-{uuid.uuid4().hex[:8].upper()}"

def generate_pharma_id(db) -> str:
    """
    Generate pharma ID in format PHARMA001, PHARMA002, etc.
    
    Args:
        db: Database session
        
    Returns:
        str: Generated pharma ID in format PHARMA001
    """
    # Import here to avoid circular imports
    from app.models.pharma_model import Pharma
    
    # Find the highest existing pharma ID
    existing_pharmas = db.query(Pharma).filter(
        Pharma.id.like("PHARMA%")
    ).all()
    
    # Extract sequence numbers and find the highest
    sequence_numbers = []
    for pharma in existing_pharmas:
        try:
            # Extract the sequence part (last 3 digits)
            sequence_part = pharma.id[6:]  # Remove "PHARMA" prefix
            sequence_numbers.append(int(sequence_part))
        except (ValueError, IndexError):
            # Skip invalid IDs
            continue
    
    # Get next sequence number
    if sequence_numbers:
        next_sequence = max(sequence_numbers) + 1
    else:
        next_sequence = 1
    
    # Format sequence number with leading zeros
    sequence_str = f"{next_sequence:03d}"
    
    # Generate final ID
    pharma_id = f"PHARMA{sequence_str}"
    
    return pharma_id

def hash_password(password: str) -> str:
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
