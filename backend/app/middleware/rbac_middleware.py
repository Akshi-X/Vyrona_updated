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
        method = request.method
        
        # Skip RBAC for OPTIONS requests (CORS preflight)
        if method == "OPTIONS":
            return await call_next(request)
        
        # Skip RBAC for public endpoints
        if self._is_public_endpoint(method, path) or path.startswith("/static"):
            return await call_next(request)
        
        # For protected endpoints, current_user should be set by TokenValidationMiddleware
        if not hasattr(request.state, "current_user"):
            # This shouldn't happen if TokenValidationMiddleware ran
            # But if it does, let it through (TokenValidationMiddleware will handle)
            return await call_next(request)
        
        current_user = request.state.current_user
        user_role = current_user.role.lower()
        
        # Check if endpoint requires specific role
        if self._requires_admin(method, path):
            if user_role != 'admin':
                raise AdminRoleRequiredException(user_role=user_role)
        
        elif self._requires_manager(method, path):
            if user_role not in ['admin', 'manager']:  # Admin can access manager endpoints
                raise ManagerRoleRequiredException(user_role=user_role)
        
        elif self._requires_user(method, path):
            if user_role != 'user':
                raise UserRoleRequiredException(user_role=user_role)
        
        # Authenticated endpoints - all roles can access (no extra check needed)
        # Controller continues execution
        return await call_next(request)
    
    def _is_public_endpoint(self, method: str, path: str) -> bool:
        """Check if endpoint is public (no authentication required)"""
        return self._matches_endpoint_set(method, path, PUBLIC_ENDPOINTS)
    
    def _requires_admin(self, method: str, path: str) -> bool:
        """Check if endpoint requires admin role"""
        return self._matches_endpoint_set(method, path, ADMIN_ONLY_ENDPOINTS)
    
    def _requires_manager(self, method: str, path: str) -> bool:
        """Check if endpoint requires manager role"""
        return self._matches_endpoint_set(method, path, MANAGER_ONLY_ENDPOINTS)
    
    def _requires_user(self, method: str, path: str) -> bool:
        """Check if endpoint requires user role"""
        return self._matches_endpoint_set(method, path, USER_ONLY_ENDPOINTS)
    
    def _matches_endpoint_set(self, method: str, path: str, endpoint_set) -> bool:
        """
        Check if method and path match any endpoint in the set.
        Supports:
        - Exact matches: ("GET", "/api/users")
        - Wildcard methods: ("*", "/api/login")
        - Path parameters: ("GET", "/api/user/{id}") matches "/api/user/123"
        """
        for endpoint_method, endpoint_path in endpoint_set:
            # Check if methods match (or wildcard)
            if endpoint_method != "*" and endpoint_method != method:
                continue
            
            # Check exact path match
            if endpoint_path == path:
                return True
            
            # Check pattern match (for paths with {parameters})
            if "{" in endpoint_path:
                # Convert path template to regex pattern
                # Replace {user_id}, {id}, {any_param} with regex
                pattern = re.escape(endpoint_path)
                pattern = re.sub(r'\\{[^}]+\\}', r'[^/]+', pattern)
                pattern = f"^{pattern}$"
                
                if re.match(pattern, path):
                    return True
        
        return False
