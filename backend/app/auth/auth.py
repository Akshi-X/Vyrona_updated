from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, Request, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from ..config.database import get_db
from ..config.config import settings
from ..models.user_model import User
from ..constants.app_constants import ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES
from ..constants.status_constants import STATUS_FAILED
from ..constants.messages import ErrorMessages
from ..exceptions import InvalidTokenException, TokenExpiredException, UserFromTokenNotFoundException, AuthenticationRequiredException

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT Bearer token
security = HTTPBearer()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash"""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Hash a password"""
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """Create a JWT access token"""
    # Validate data parameter
    if not isinstance(data, dict):
        raise ValueError("data must be a dict")
    
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def verify_token(token: str) -> dict:
    """Verify and decode JWT token."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise TokenExpiredException()
    except JWTError:
        raise InvalidTokenException()


def verify_websocket_token(token: str) -> dict:
    """
    Verify JWT token for WebSocket connection and extract user info.
    
    This is a convenience function for WebSocket authentication that:
    - Verifies the token
    - Extracts user_id (sub) and pharma_id from payload
    - Validates required fields are present
    
    Args:
        token: JWT token string
        
    Returns:
        Dictionary with 'user_id' and 'pharma_id'
        
    Raises:
        InvalidTokenException: If token is invalid or missing required fields
    """
    if not token:
        raise InvalidTokenException()
    
    payload = verify_token(token)
    user_id = payload.get("sub")
    pharma_id = payload.get("pharma_id")
    
    # For IVF/hospital users, pharma_id can be None, so only check user_id
    if not user_id:
        raise InvalidTokenException()
    
    return {
        "user_id": user_id,
        "pharma_id": pharma_id,  # Can be None for hospital users
        "payload": payload
    }


def get_current_user_from_request(request: Request) -> User:
    """
    Get authenticated user from request state.
    
    Middleware validates token and injects user before this is called.
    
    Returns:
        User object from request.state.current_user
    """
    # Validate current_user exists (defensive programming)
    if not hasattr(request.state, "current_user"):
        raise AuthenticationRequiredException()
    return request.state.current_user


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> User:
    """Get current authenticated user from JWT token."""
    token = credentials.credentials
    payload = verify_token(token)
    
    user_id: str = payload.get("sub")
    if user_id is None:
        raise InvalidTokenException()
    
    user = db.query(User).filter(User.user_id == user_id).first()
    if user is None:
        raise UserFromTokenNotFoundException(user_id=user_id)
    
    return user




print(get_password_hash("easyPeasy1!"))