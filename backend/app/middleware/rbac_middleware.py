"""
RBAC (Role-Based Access Control) Middleware

Validates user role permissions before controller executes.
TokenValidationMiddleware runs first and sets request.state.current_user.
"""

from typing import Callable
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
import re

from ..config.permissions import (
    PUBLIC_ENDPOINTS,
    ADMIN_ONLY_ENDPOINTS,
    MANAGER_ONLY_ENDPOINTS,
    USER_ONLY_ENDPOINTS,
    AUTHENTICATED_ENDPOINTS
)
from ..exceptions import AdminRoleRequiredException, ManagerRoleRequiredException, UserRoleRequiredException


class RBACMiddleware(BaseHTTPMiddleware):
    """Checks if authenticated user has permission to access endpoint."""
    
    def __init__(self, app):
        super().__init__(app)
    
    async def dispatch(self, request: Request, call_next: Callable):
        """Check user role permissions before allowing access."""
        path = request.url.path
        
        # Skip RBAC for OPTIONS requests (CORS preflight)
        if request.method == "OPTIONS":
            return await call_next(request)
        
        # Skip RBAC for public endpoints
        if path in PUBLIC_ENDPOINTS or path.startswith("/static"):
            return await call_next(request)
        
        # For protected endpoints, current_user should be set by TokenValidationMiddleware
        if not hasattr(request.state, "current_user"):
            # This shouldn't happen if TokenValidationMiddleware ran
            # But if it does, let it through (TokenValidationMiddleware will handle)
            return await call_next(request)
        
        current_user = request.state.current_user
        user_role = current_user.role.lower()
        
        # Check if endpoint requires specific role
        if self._requires_admin(path):
            if user_role != 'admin':
                raise AdminRoleRequiredException(user_role=user_role)
        
        elif self._requires_manager(path):
            if user_role not in ['admin', 'manager']:  # Admin can access manager endpoints
                raise ManagerRoleRequiredException(user_role=user_role)
        
        elif self._requires_user(path):
            if user_role != 'user':
                raise UserRoleRequiredException(user_role=user_role)
        
        # Authenticated endpoints - all roles can access (no extra check needed)
        # Controller continues execution
        return await call_next(request)
    
    def _requires_admin(self, path: str) -> bool:
        """Check if endpoint requires admin role"""
        # Check exact match
        if path in ADMIN_ONLY_ENDPOINTS:
            return True
        
        # Check pattern match
        for endpoint in ADMIN_ONLY_ENDPOINTS:
            if "{" in endpoint:
                pattern = endpoint.replace("{user_id}", r"[^/]+").replace("{id}", r"[^/]+")
                pattern = f"^{pattern}$"
                if re.match(pattern, path):
                    return True
        
        return False
    
    def _requires_manager(self, path: str) -> bool:
        """Check if endpoint requires manager role"""
        # Check exact match
        if path in MANAGER_ONLY_ENDPOINTS:
            return True
        
        # Check pattern match (e.g., /api/user/{user_id} matches /api/user/123)
        for endpoint in MANAGER_ONLY_ENDPOINTS:
            if "{" in endpoint:
                # Convert {user_id} or {id} to regex pattern
                pattern = endpoint.replace("{user_id}", r"[^/]+").replace("{id}", r"[^/]+")
                pattern = f"^{pattern}$"
                if re.match(pattern, path):
                    return True
        
        return False
    
    def _requires_user(self, path: str) -> bool:
        """Check if endpoint requires user role"""
        # Check exact match
        if path in USER_ONLY_ENDPOINTS:
            return True
        
        # Check pattern match
        for endpoint in USER_ONLY_ENDPOINTS:
            if "{" in endpoint:
                pattern = endpoint.replace("{id}", r"[^/]+")
                pattern = f"^{pattern}$"
                if re.match(pattern, path):
                    return True
        
        return False
