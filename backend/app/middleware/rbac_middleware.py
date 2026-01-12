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
    PHARMA_ADMIN_ENDPOINTS,
    MYGRAPE_ADMIN_ENDPOINTS,
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
        
        # For protected endpoints, current_user or branch_login should be set by TokenValidationMiddleware
        if not hasattr(request.state, "current_user") and not hasattr(request.state, "branch_login"):
            # This shouldn't happen if TokenValidationMiddleware ran
            # But if it does, let it through (TokenValidationMiddleware will handle)
            return await call_next(request)
        
        # Handle branch login authentication (bypasses role checks, allowed for IVF endpoints)
        if hasattr(request.state, "branch_login") and request.state.branch_login is not None:
            # Branch logins can access IVF endpoints
            if path.startswith("/api/ivf"):
                return await call_next(request)
            # For non-IVF endpoints, branch logins are not allowed
            # This will be handled by the controller or we can raise an exception here
            # For now, allow it and let controllers handle authorization
            return await call_next(request)
        
        # Regular user authentication - check roles
        current_user = request.state.current_user
        if current_user is None:
            # No user and no branch login - should not happen, but let it through
            return await call_next(request)
        
        user_role = current_user.role.lower()
        
        # Check if endpoint requires specific role
        # Note: Check overlapping permissions first (endpoints in multiple sets)
        requires_manager = self._requires_manager(method, path)
        requires_pharma_admin = self._requires_pharma_admin(method, path)
        
        if self._requires_admin(method, path):
            if user_role != 'admin':
                raise AdminRoleRequiredException(user_role=user_role)
        
        elif requires_manager and requires_pharma_admin:
            # Endpoint is in both manager and pharma_admin sets (e.g., task creation)
            # Allow admin, manager, or pharma_admin
            if user_role not in ['admin', 'manager', 'pharma_admin']:
                raise ManagerRoleRequiredException(user_role=user_role)
        
        elif requires_manager:
            # Manager-only endpoint
            if user_role not in ['admin', 'manager']:
                raise ManagerRoleRequiredException(user_role=user_role)
        
        elif requires_pharma_admin:
            # Pharma admin-only endpoint
            if user_role not in ['admin', 'pharma_admin']:
                raise ManagerRoleRequiredException(user_role=user_role)
        
        elif self._requires_mygrape_admin(method, path):
            if user_role not in ['admin', 'mygrape_admin']:  # Admin can access MyGrape admin endpoints
                raise AdminRoleRequiredException(user_role=user_role)
        
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
    
    def _requires_pharma_admin(self, method: str, path: str) -> bool:
        """Check if endpoint requires pharma admin role"""
        return self._matches_endpoint_set(method, path, PHARMA_ADMIN_ENDPOINTS)
    
    def _requires_mygrape_admin(self, method: str, path: str) -> bool:
        """Check if endpoint requires MyGrape admin role"""
        return self._matches_endpoint_set(method, path, MYGRAPE_ADMIN_ENDPOINTS)
    
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
        # Normalize path (remove trailing slash for consistent matching)
        path = path.rstrip('/')
        
        for endpoint_method, endpoint_path in endpoint_set:
            # Normalize endpoint path too
            endpoint_path = endpoint_path.rstrip('/')
            
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
