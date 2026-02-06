"""
Helper functions for IVF control tower role-based access control
"""
from typing import Tuple, Optional
from fastapi import Request

from ..models.user_model import User
from ..utils.user_helpers import is_hospital_department


# Roles that should be filtered by branch (only User)
ROLES_WITH_BRANCH_FILTER = ["User"]


def get_branch_filter_info(request: Request) -> Tuple[Optional[int], Optional[str]]:
    """
    Get branch filter information for IVF department users.
    
    This function extracts branch_id and role from the authenticated user
    to determine if data should be filtered by branch.
    
    Rules:
    - User: Filter by their branch_id (return branch_id)
    - Manager: No filtering (return None for branch_id) - can see all branches
    - Admin: No filtering (return None for branch_id) - can see all branches
    - Non-IVF users: No filtering (return None for branch_id)
    
    Args:
        request: FastAPI Request object with current_user in request.state
        
    Returns:
        Tuple of (branch_id, role):
        - branch_id: Branch ID to filter by, or None if no filtering
        - role: User's role, or None if not an IVF user
    """
    # Get current user from request state (injected by middleware)
    if not hasattr(request.state, "current_user"):
        return None, None
    
    user: User = request.state.current_user
    
    # Check if user is from IVF department
    if not is_hospital_department(user.department) if user.department else False:
        # Not an IVF user - no branch filtering
        return None, None
    
    # Get user's role (enum value is already in title case: "Admin", "Manager", "User")
    role = user.role.value if hasattr(user.role, 'value') else str(user.role)
    role_normalized = role  # Already in correct format from enum
    
    # Admin and Manager roles: no branch filtering (can see all branches)
    if role_normalized in ["Admin", "Manager"]:
        return None, role_normalized
    
    # User role: filter by their branch
    if role_normalized in ROLES_WITH_BRANCH_FILTER:
        branch_id = user.branch_id
        if branch_id is None:
            # User without branch_id - shouldn't happen, but handle gracefully
            return None, role_normalized
        return branch_id, role_normalized
    
    # Unknown role or no branch_id - no filtering
    return None, role_normalized
