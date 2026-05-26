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
from ..constants.app_constants import COMMON_API_HEADERS, INTEGRATION_TOKEN_PURPOSE
from ..utils.user_helpers import is_hospital_department
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
        internal_api_key = request.headers.get("X-Internal-Api-Key")
        method = request.method
        
        # Skip token validation for OPTIONS requests (CORS preflight)
        if method == "OPTIONS":
            return await call_next(request)
        
        # Skip token validation for WebSocket upgrade requests
        # WebSocket endpoints handle their own authentication after connection is accepted
        upgrade_header = request.headers.get("Upgrade", "").lower()
        connection_header = request.headers.get("Connection", "").lower()
        is_websocket_upgrade = upgrade_header == "websocket" and "upgrade" in connection_header
        is_ws_path = path.rstrip("/").endswith("/ws")
        if is_websocket_upgrade or is_ws_path:
            return await call_next(request)
        
        # Skip token validation for public endpoints
        if self._is_public_endpoint(method, path):
            return await call_next(request)
        
        # Skip token validation for static files
        if path.startswith("/static"):
            return await call_next(request)
        
        if internal_api_key:
            # Skip token validation for internal API endpoints (service-to-service calls)
            return await call_next(request)
        
        # Protected endpoint - VALIDATE TOKEN
        try:
            # Extract token from Authorization header or cookie fallback
            token: str | None = None
            auth_header = request.headers.get("Authorization")
            
            if auth_header:
                # Parse Authorization header (format: "Bearer <token>")
                parts = auth_header.split()
                if len(parts) == 2 and parts[0].lower() == "bearer":
                    token = parts[1]
                else:
                    raise InvalidTokenException()
            else:
                # Cookie fallback: support auth_token cookie
                cookie_token = request.cookies.get("auth_token")
                if cookie_token:
                    token = cookie_token
                else:
                    raise InvalidTokenException()
            
            # Validate token is present
            if not token:
                raise InvalidTokenException()
            
            # Verify token and get payload
            payload = verify_token(token)
            request.state.audit_log_disabled = bool(payload.get("audit_log_disabled"))

            # Integration tokens (e.g. HMS) carry purpose=hms_integration and a jti.
            # They must exist in integration_api_tokens, not be revoked, and not be expired.
            if payload.get("purpose") == INTEGRATION_TOKEN_PURPOSE:
                jti = payload.get("jti")
                if not jti:
                    raise InvalidTokenException("Integration token missing jti")
                from ..service.external.integration_auth_service import IntegrationAuthService
                check_db = SessionLocal()
                try:
                    if not IntegrationAuthService(check_db).is_token_active(jti):
                        raise InvalidTokenException("Integration token revoked or unknown")
                    IntegrationAuthService(check_db).touch_last_used(jti)
                finally:
                    check_db.close()
            
            # Get user from database
            user_id = payload.get("sub")
            if not user_id:
                raise InvalidTokenException()
            
            # Load user from database
            db = SessionLocal()
            try:
                # Get token type from payload
                token_type = payload.get("type")
                
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
                
                # Validate token type matches user's department
                is_hospital_user = is_hospital_department(user.department) if user.department else False
                
                # Token valid - inject authenticated user into request
                request.state.current_user = user
                request.state.db_session = db
                
                # Extract type-specific fields from token payload
                if token_type == "hospital_user":
                    # Hospital user token (department: IVF, Oncology, etc.)
                    if not is_hospital_user:
                        db.close()
                        raise InvalidTokenException("Token type mismatch: expected hospital user")
                    
                    # Hospital user tokens must carry both hospital_id and branch_id
                    if payload.get("hospital_id") is None or payload.get("branch_id") is None:
                        db.close()
                        raise InvalidTokenException("Token missing required hospital or branch claims")

                    # Inject hospital-specific fields
                    request.state.hospital_id = payload.get("hospital_id")
                    request.state.branch_id = payload.get("branch_id")
                    request.state.department = payload.get("department")
                    request.state.pharma_id = None
                    
                elif token_type == "pharma_user" or token_type is None:
                    # Pharma user token (department: CGT, etc.) or legacy token
                    if is_hospital_user:
                        db.close()
                        raise InvalidTokenException("Token type mismatch: expected pharma user")
                    
                    # Inject pharma-specific fields
                    pharma_id = payload.get("pharma_id")
                    if pharma_id is not None:
                        request.state.pharma_id = pharma_id
                    request.state.hospital_id = None
                    request.state.branch_id = None
                    # Include department from token for pharma users (CGT)
                    request.state.department = payload.get("department")
                else:
                    # Unknown token type
                    db.close()
                    raise InvalidTokenException(f"Unknown token type: {token_type}")
                
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
                content=e.to_dict(),
                headers=COMMON_API_HEADERS
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
                },
                headers=COMMON_API_HEADERS
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
