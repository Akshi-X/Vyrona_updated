"""
Role-Based Access Control (RBAC) Dependencies

Optional per-endpoint role checks (alternative to middleware).
Your app uses RBAC Middleware by default, but these can be used 
for additional fine-grained control.

Admin: Full system access, manage all users and settings
Manager: Approve users, manage shipments, view analytics
User: View assigned tasks, update status, view sensor data
"""

from fastapi import Depends
from typing import List
from sqlalchemy.orm import Session
from ..models.user_model import User
from ..dependencies.auth_dependencies import get_current_user
from ..config.database import get_db
from ..config.permissions import get_role_permissions
from ..constants.roles import ROLE_ADMIN, ROLE_MANAGER, ROLE_USER, MANAGEMENT_ROLES
from ..exceptions import (
    AdminRoleRequiredException,
    ManagerRoleRequiredException,
    UserRoleRequiredException,
    InsufficientPermissionsException,
    CompanyAccessForbiddenException,
    ManagerApprovalOnlyException,
    ManagerShipmentManagementOnlyException
)


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """
    Require admin role.
    
    Returns:
        User object if role is admin
    
    Raises:
        AdminRoleRequiredException if not admin
    """
    if current_user.role.lower() != ROLE_ADMIN:
        raise AdminRoleRequiredException(user_role=current_user.role)
    return current_user


def require_manager(current_user: User = Depends(get_current_user)) -> User:
    """
    Require manager role.
    
    Returns:
        User object if role is manager
    
    Raises:
        ManagerRoleRequiredException if not manager
    """
    if current_user.role.lower() not in MANAGEMENT_ROLES:  # Admin can access manager functions
        raise ManagerRoleRequiredException(user_role=current_user.role)
    return current_user


def require_user(current_user: User = Depends(get_current_user)) -> User:
    """
    Require user role.
    
    Returns:
        User object if role is user
    
    Raises:
        UserRoleRequiredException if not user
    """
    if current_user.role.lower() != ROLE_USER:
        raise UserRoleRequiredException(user_role=current_user.role)
    return current_user


def require_roles(allowed_roles: List[str]):
    """
    Require any of the specified roles.
    
    Args:
        allowed_roles: List of allowed role names
    
    Returns:
        Dependency function that checks roles
    """
    def check_role(current_user: User = Depends(get_current_user)) -> User:
        user_role = current_user.role.lower()
        allowed_roles_lower = [role.lower() for role in allowed_roles]
        
        if user_role not in allowed_roles_lower:
            raise InsufficientPermissionsException(
                user_role=current_user.role,
                required_roles=allowed_roles
            )
        return current_user
    
    return check_role


def check_same_company(target_company: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> bool:
    """
    Check if user belongs to same company (multi-tenant isolation).
    
    Args:
        target_company: Company name to check
        current_user: Current authenticated user
        db: Database session
    
    Returns:
        True if same company
    
    Raises:
        CompanyAccessForbiddenException if different company
    """
    from ..models.pharma_model import Pharma
    
    # Get the pharma_id for the target company
    target_pharma = db.query(Pharma).filter(Pharma.pharma_name == target_company).first()
    if not target_pharma:
        raise CompanyAccessForbiddenException(
            user_company=f"pharma_id_{current_user.pharma_id}",
            target_company=target_company
        )
    
    if current_user.pharma_id != target_pharma.id:
        raise CompanyAccessForbiddenException(
            user_company=f"pharma_id_{current_user.pharma_id}",
            target_company=target_company
        )
    return True


def can_approve_users(current_user: User = Depends(get_current_user)) -> bool:
    """
    Check if user can approve/reject users.
    
    Returns:
        True if can approve
    
    Raises:
        ManagerApprovalOnlyException if cannot approve
    """
    if current_user.role.lower() not in MANAGEMENT_ROLES:
        raise ManagerApprovalOnlyException(user_role=current_user.role)
    return True


def can_manage_shipments(current_user: User = Depends(get_current_user)) -> bool:
    """
    Check if user can create/manage shipments.
    
    Returns:
        True if can manage
    
    Raises:
        ManagerShipmentManagementOnlyException if cannot manage
    """
    if current_user.role.lower() not in MANAGEMENT_ROLES:
        raise ManagerShipmentManagementOnlyException(user_role=current_user.role)
    return True


def is_admin(user: User) -> bool:
    """
    Check if user is admin.
    
    Args:
        user: User object
    
    Returns:
        True if admin
    """
    return user.role.lower() == ROLE_ADMIN


def is_manager(user: User) -> bool:
    """
    Check if user is manager.
    
    Args:
        user: User object
    
    Returns:
        True if manager
    """
    return user.role.lower() == ROLE_MANAGER


def is_user(user: User) -> bool:
    """
    Check if user is regular user.
    
    Args:
        user: User object
    
    Returns:
        True if user
    """
    return user.role.lower() == ROLE_USER


def get_user_permissions(user: User) -> dict:
    """
    Get all permissions for a user based on role.
    
    Args:
        user: User object
    
    Returns:
        Dict with permission flags
    """
    return get_role_permissions(user.role)

