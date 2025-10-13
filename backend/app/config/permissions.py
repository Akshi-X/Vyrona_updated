"""
API Permissions Configuration
Simple role-based access control (RBAC) definitions

Add new API endpoints here as you create them.
"""

from typing import Set


# ============================================
# PUBLIC ENDPOINTS (No Authentication Required)
# ============================================
PUBLIC_ENDPOINTS: Set[str] = {
    "/api/register",
    "/api/login",
    "/api/verify-otp",
    "/api/resend-otp",
    "/api/approval-screen",
    "/health",
    "/docs",
    "/openapi.json",
    "/redoc",
}


# ============================================
# ADMIN-ONLY ENDPOINTS
# ============================================
ADMIN_ONLY_ENDPOINTS: Set[str] = {
    # Add admin-only endpoints here when needed
}


# ============================================
# MANAGER-ONLY ENDPOINTS
# ============================================
MANAGER_ONLY_ENDPOINTS: Set[str] = {
    "/api/user/{user_id}",     # GET - View user details
    "/api/user/approve",       # POST - Approve user
    "/api/user/reject",        # POST - Reject user
}


# ============================================
# USER-ONLY ENDPOINTS
# ============================================
USER_ONLY_ENDPOINTS: Set[str] = {
    # Add user-only endpoints here when needed
}


# ============================================
# ALL AUTHENTICATED USERS CAN ACCESS
# ============================================
AUTHENTICATED_ENDPOINTS: Set[str] = {
    "/api/profile",  # GET - View own profile
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
    def is_public_endpoint(path: str) -> bool:
        """Check if endpoint is public"""
        return path in PUBLIC_ENDPOINTS
