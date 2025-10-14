"""
API Permissions Configuration
Method-aware role-based access control (RBAC) definitions

Add new API endpoints here as you create them.

Format: Tuple of (HTTP_METHOD, PATH)
- HTTP_METHOD: GET, POST, PUT, PATCH, DELETE, or "*" for all methods
- PATH: The endpoint path (can include {param} placeholders)

Examples:
    ("GET", "/api/users")        - Only GET requests to /api/users
    ("POST", "/api/users")       - Only POST requests to /api/users
    ("*", "/api/login")          - All methods to /api/login
    ("DELETE", "/api/user/{id}") - DELETE with path parameter
"""

from typing import Set, Tuple


# Type alias for clarity
EndpointPermission = Tuple[str, str]  # (method, path)


# ============================================
# PUBLIC ENDPOINTS (No Authentication Required)
# ============================================
PUBLIC_ENDPOINTS: Set[EndpointPermission] = {
    ("*", "/api/register"),
    ("*", "/api/login"),
    ("*", "/api/verify-otp"),
    ("*", "/api/resend-otp"),
    ("*", "/api/approval-screen"),
    ("*", "/health"),
    ("*", "/docs"),
    ("*", "/openapi.json"),
    ("*", "/redoc"),
}


# ============================================
# ADMIN-ONLY ENDPOINTS
# ============================================
ADMIN_ONLY_ENDPOINTS: Set[EndpointPermission] = {
    # Add admin-only endpoints here when needed
    # Example: ("POST", "/api/users"),  # Create user
    # Example: ("DELETE", "/api/users/{id}"),  # Delete user
}


# ============================================
# MANAGER-ONLY ENDPOINTS
# ============================================
MANAGER_ONLY_ENDPOINTS: Set[EndpointPermission] = {
    ("GET", "/api/user/{user_id}"),     # View user details
    ("POST", "/api/user/approve"),      # Approve user
    ("POST", "/api/user/reject"),       # Reject user
}


# ============================================
# USER-ONLY ENDPOINTS
# ============================================
USER_ONLY_ENDPOINTS: Set[EndpointPermission] = {
    # Add user-only endpoints here when needed
    # Example: ("GET", "/api/my-data"),
}


# ============================================
# ALL AUTHENTICATED USERS CAN ACCESS
# ============================================
AUTHENTICATED_ENDPOINTS: Set[EndpointPermission] = {
    ("GET", "/api/profile"),  # View own profile
}


# ============================================
# ROLE PERMISSIONS
# ============================================
def get_role_permissions(role: str) -> dict:
    """Get permissions for a role"""
    role_lower = role.lower()
    
    if role_lower == "admin":
        return {
            "can_approve_users": True,
            "can_reject_users": True,
            "can_view_all_users": True,
            "can_manage_system": True,
            "role": "admin"
        }
    elif role_lower == "manager":
        return {
            "can_approve_users": True,
            "can_reject_users": True,
            "can_view_all_users": True,
            "can_manage_system": False,
            "role": "manager"
        }
    elif role_lower == "user":
        return {
            "can_approve_users": False,
            "can_reject_users": False,
            "can_view_all_users": False,
            "can_manage_system": False,
            "role": "user"
        }
    else:
        return {"role": "unknown"}


# ============================================
# HELPER FUNCTIONS
# ============================================
class EndpointPermissions:
    """Helper class for checking endpoint permissions"""
    
    @staticmethod
    def is_public_endpoint(method: str, path: str) -> bool:
        """
        Check if endpoint is public
        
        Args:
            method: HTTP method (GET, POST, etc.)
            path: Request path
            
        Returns:
            True if endpoint is public, False otherwise
        """
        # Check for exact match with specific method
        if (method, path) in PUBLIC_ENDPOINTS:
            return True
        
        # Check for wildcard method match
        if ("*", path) in PUBLIC_ENDPOINTS:
            return True
        
        return False
