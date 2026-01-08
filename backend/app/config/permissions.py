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
import re


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
    ("*", "/api/forgot-password"),
    ("*", "/api/reset-password"),
    ("*", "/api/approval-screen"),
    ("*", "/api/dashboard/performance"),
    ("*", "/api/dashboard/risk"),
    ("*", "/api/dashboard/compliance"),
    ("*", "/api/dashboard/volume"),
    ("*", "/api/dashboard/logistics"),
    ("*", "/api/dashboard/alerts"),
    ("*", "/health"),
    ("*", "/docs"),
    ("*", "/openapi.json"),
    ("*", "/redoc"),
    # Quality monitoring health check - public
    ("GET", "/api/quality/health"),
    ("GET", "/api/quality/test"),  # Test endpoint for debugging
    # Quality loss email decision endpoint (email buttons)
    ("PUT", "/api/quality/loss/decision"),
    # Branch authentication endpoints - public
    ("POST", "/api/ivf/branch/signup"),
    ("POST", "/api/ivf/branch/login"),
    ("GET", "/api/ivf/branch/verify-email"),  # Email verification link (GET only)
    # Hospital search and branches endpoints - public (used during signup)
    ("GET", "/api/ivf/branch/hospitals/search"),
    ("GET", "/api/ivf/branch/hospitals/{hospital_id}/branches"),
    ("GET", "/api/ivf/branch/hospitals/by-name/{hospital_name}/branches"),  # Get branches by hospital name
    ("GET", "/api/ivf/branch/check-domain"),  # Check email domain for domain-based login
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
# PHARMA ADMIN ENDPOINTS
# ============================================
PHARMA_ADMIN_ENDPOINTS: Set[EndpointPermission] = {
    ("GET", "/api/user/{user_id}"),     # View user details
    ("POST", "/api/user/approve"),      # Approve user
    ("POST", "/api/user/reject"),       # Reject user
    # Allow pharma admins to fully manage tasks
    ("POST", "/api/tasks"),                    # Create task
    ("PUT", "/api/tasks/{task_id}"),           # Update task (full update)
    ("DELETE", "/api/tasks/{task_id}"),        # Delete task
}

# ============================================
# MYGRAPE ADMIN ENDPOINTS
# ============================================
MYGRAPE_ADMIN_ENDPOINTS: Set[EndpointPermission] = {
    # User management
    ("GET", "/api/user/{user_id}"),     # View user details
    # Feedback admin endpoints (only for MyGrape admin)
    ("GET", "/api/feedback/admin"),     # View all feedback for admin
    # ("PATCH", "/api/feedback/{feedback_id}/status"),   # Update status
}

# ============================================
# MANAGER-ONLY ENDPOINTS
# ============================================
MANAGER_ONLY_ENDPOINTS: Set[EndpointPermission] = {
    ("POST", "/api/tasks"),                    # Create task
    ("PUT", "/api/tasks/{task_id}"),           # Update task (full update)
    ("DELETE", "/api/tasks/{task_id}")
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
    # Feedback endpoints - all authenticated users can access
    ("POST", "/api/feedback"),                    # Create feedback
    ("GET", "/api/feedback"),                     # Get all feedback
    ("GET", "/api/feedback/user/{user_id}"),      # Get user feedback
    ("GET", "/api/feedback/{feedback_id}"),       # Get feedback by ID
    ("POST", "/api/feedback/{feedback_id}/comments"),  # Add comment
    ("GET", "/api/feedback/{feedback_id}/comments"),   # Get comments
    ("PATCH", "/api/feedback/{feedback_id}/status"),   # Update status
    ("GET", "/api/profile"),  # View own profile
    # Task endpoints - all authenticated users can view and update status
    ("GET", "/api/tasks"),                        # Get all tasks (filtered by ownership)
    ("GET", "/api/tasks/{task_id}"),              # Get task by ID (if creator or assignee)
    ("PATCH", "/api/tasks/{task_id}/status"),     # Update task status (if assignee)
    # Quality monitoring endpoints - authenticated users can access
    ("GET", "/api/quality/patients"),
    ("GET", "/api/quality/history"),
    ("GET", "/api/quality/connections"),
    # WebSocket endpoint: /api/quality/ws - authentication handled in endpoint
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
            "role": "Admin"
        }
    elif role_lower == "pharma_admin":
        return {
            "can_approve_users": True,
            "can_reject_users": True,
            "can_view_all_users": True,
            "can_manage_system": False,
            "role": "Pharma_admin"
        }
    elif role_lower == "mygrape_admin":
        return {
            "can_approve_users": False,
            "can_reject_users": False,
            "can_view_all_users": True,
            "can_manage_feedback": True,
            "can_view_all_feedback": True,
            "can_manage_system": False,
            "role": "Mygrape_admin"
        }
    elif role_lower == "manager":
        return {
            "can_approve_users": False,  # Managers can no longer approve users
            "can_reject_users": False,
            "can_view_all_users": False,
            "can_manage_system": False,
            "role": "Manager"
        }
    elif role_lower == "user":
        return {
            "can_approve_users": False,
            "can_reject_users": False,
            "can_view_all_users": False,
            "can_manage_system": False,
            "role": "User"
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
        
        Supports:
        - Exact matches: ("GET", "/api/users")
        - Wildcard methods: ("*", "/api/login")
        - Path parameters: ("GET", "/api/user/{id}") matches "/api/user/123"
        
        Args:
            method: HTTP method (GET, POST, etc.)
            path: Request path
            
        Returns:
            True if endpoint is public, False otherwise
        """
        # Normalize path (remove trailing slash for consistent matching)
        path = path.rstrip('/')
        
        for endpoint_method, endpoint_path in PUBLIC_ENDPOINTS:
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
