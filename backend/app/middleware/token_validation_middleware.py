"""
Token Validation Middleware

Validates JWT tokens for protected endpoints.
Public endpoints defined in config.permissions module.
"""

from typing import Callable
from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from datetime import datetime, timezone

from ..auth.auth import verify_token
from ..config.database import SessionLocal
from ..config.permissions import EndpointPermissions
from ..models.user_model import User
from ..constants.error_codes import ERROR_CODES
from ..exceptions import (
    InvalidTokenException,
    TokenExpiredException,
    UserFromTokenNotFoundException,
    AccountInactiveException,
    UserNotApprovedException,
    AppException
)


class TokenValidationMiddleware(BaseHTTPMiddleware):
    """Validates JWT tokens and injects authenticated user into request.state."""
    
    def __init__(self, app):
        super().__init__(app)
    
    async def dispatch(self, request: Request, call_next: Callable):
        """Intercept requests and validate tokens for protected endpoints."""
        path = request.url.path
        method = request.method
        
        # Skip token validation for OPTIONS requests (CORS preflight)
        if method == "OPTIONS":
            return await call_next(request)
        
        # Skip token validation for public endpoints
        if self._is_public_endpoint(method, path):
            return await call_next(request)
        
        # Skip token validation for static files
        if path.startswith("/static"):
            return await call_next(request)
        
        # Protected endpoint - VALIDATE TOKEN
        try:
            # Extract token from Authorization header
            auth_header = request.headers.get("Authorization")
            
            if not auth_header:
                raise InvalidTokenException()
            
            # Extract token (format: "Bearer <token>")
            parts = auth_header.split()
            if len(parts) != 2 or parts[0].lower() != "bearer":
                raise InvalidTokenException()
            
            token = parts[1]
            
            # Verify token and get payload
            payload = verify_token(token)
            
            # Get user from database
            user_id = payload.get("sub")
            if not user_id:
                raise InvalidTokenException()
            
            # Load user from database
            db = SessionLocal()
            try:
                user = db.query(User).filter(User.user_id == user_id).first()
                
                if not user:
                    db.close()
                    raise UserFromTokenNotFoundException(user_id=user_id)
                
                # Check if user is still active and approved
                if not user.status:
                    db.close()
                    raise AccountInactiveException(user_id=user.user_id)
                
                if user.approved_status != 'approved':
                    db.close()
                    raise UserNotApprovedException(user_id=user.user_id)
                
                # Token valid - inject authenticated user into request
                request.state.current_user = user
                request.state.db_session = db
                
            except AppException:
                db.close()
                raise
            except Exception:
                db.close()
                raise
            
            # Continue to controller with authenticated user
            response = await call_next(request)
            
            # Close database session after request
            if hasattr(request.state, "db_session"):
                request.state.db_session.close()
            
            return response
            
        except AppException as e:
            # Catch custom exceptions and return JSON response
            return JSONResponse(
                status_code=e.status_code,
                content=e.to_dict()
            )
        except Exception as e:
            # Unexpected error
            return JSONResponse(
                status_code=500,
                content={
                    "error_code": "SERVER_ERROR",
                    "message": str(e),
                    "status": "failed",
                    "timestamp": datetime.now(timezone.utc).isoformat()
                }
            )
    
    def _is_public_endpoint(self, method: str, path: str) -> bool:
        """
        Check if endpoint is public.
        
        Args:
            method: HTTP method (GET, POST, etc.)
            path: Request path
        
        Returns:
            True if public
        """
        return EndpointPermissions.is_public_endpoint(method, path)
