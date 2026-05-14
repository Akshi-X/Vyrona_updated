"""
Role-based abilities using PyCASL (code-based, no DB permission tables).
Maps user role + department + branch_id to what they can access (Dashboard, Control Tower, etc.).
"""
from typing import Any, Optional

from casl import AbilityBuilder

from ..models.user_model import User
from ..constants.enums import UserRole
from ..utils.user_helpers import is_specific_department

# Subject names for ability checks
SUBJECT_DASHBOARD = "Dashboard"
SUBJECT_CONTROL_TOWER = "ControlTower"


def define_ability_for(user: User) -> Any:
    """
    Build a PyCASL Ability for the given user.
    Rules (IVF): Admin/Manager can access Dashboard + Control Tower; User can access Dashboard (branch-scoped only), cannot access Control Tower.
    """
    builder = AbilityBuilder()
    role_val = user.role.value if hasattr(user.role, "value") else str(user.role)
    dept = (user.department or "").strip().upper()
    is_ivf = is_specific_department(user.department or "", "IVF")

    # Mygrape_admin: onboarding only; no Dashboard/Control Tower by default
    if role_val == UserRole.MYGRAPE_ADMIN.value:
        # Can onboard H.Admin; no access to Control Tower or Dashboard unless product says so
        builder.cannot("access", SUBJECT_CONTROL_TOWER)
        builder.cannot("access", SUBJECT_DASHBOARD)
        return builder.build()

    # IVF department
    if is_ivf:
        if role_val == UserRole.ADMIN.value:
            builder.can("access", SUBJECT_DASHBOARD)
            builder.can("access", SUBJECT_CONTROL_TOWER)
        elif role_val == UserRole.MANAGER.value:
            builder.can("access", SUBJECT_DASHBOARD)
            builder.can("access", SUBJECT_CONTROL_TOWER)
        elif role_val == UserRole.USER.value:
            builder.can("access", SUBJECT_DASHBOARD)
            builder.cannot("access", SUBJECT_CONTROL_TOWER)
        else:
            builder.cannot("access", SUBJECT_CONTROL_TOWER)
            builder.cannot("access", SUBJECT_DASHBOARD)
        return builder.build()

    # CGT / Pharma: keep existing behavior – allow dashboard; control tower not used for CGT
    if role_val in (UserRole.PHARMA_ADMIN.value, UserRole.MANAGER.value, UserRole.USER.value):
        builder.can("access", SUBJECT_DASHBOARD)
    else:
        builder.cannot("access", SUBJECT_DASHBOARD)
    builder.cannot("access", SUBJECT_CONTROL_TOWER)
    return builder.build()


def get_permissions_for_user(user: User) -> dict[str, Any]:
    """
    Return a dict suitable for the permissions API: canAccessDashboard, canAccessControlTower, dashboardScope, branchId.
    Used so the frontend can protect routes and sidebar without duplicating role logic.
    """
    ability = define_ability_for(user)
    role_val = user.role.value if hasattr(user.role, "value") else str(user.role)
    is_ivf = is_specific_department(user.department or "", "IVF")

    can_access_dashboard = ability.can("access", SUBJECT_DASHBOARD)
    can_access_control_tower = ability.can("access", SUBJECT_CONTROL_TOWER)

    # Dashboard scope: "all" for Admin/Manager (no branch filter), "branch" for User (branch-scoped)
    if is_ivf and role_val == UserRole.USER.value and user.branch_id is not None:
        dashboard_scope = "branch"
        branch_id: Optional[int] = user.branch_id
    else:
        dashboard_scope = "all"
        branch_id = None

    return {
        "canAccessDashboard": can_access_dashboard,
        "canAccessControlTower": can_access_control_tower,
        "dashboardScope": dashboard_scope,
        "branchId": branch_id,
    }
