"""
Helper functions for IVF control tower role-based access control and data access
"""
from typing import Tuple, Optional
from fastapi import Request
from sqlalchemy.orm import Session
from sqlalchemy import func

from ..models.user_model import User
from ..utils.user_helpers import is_hospital_department
from ..models.IVF.tank_model import Tank
from ..models.IVF.patient_crylock_info_model import PatientCrylockInfo
from ..models.IVF.hospital_branch_model import HospitalBranch


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


def find_tank_by_code(
    db: Session,
    tank_code: str,
    branch_id: Optional[int] = None
) -> Optional[Tank]:
    """
    Find tank by tank_code, optionally filtered by branch_id.
    Uses case-insensitive matching and fallback to cryolock_number pattern matching.
    
    Args:
        db: Database session
        tank_code: Tank code (e.g., "T1", "T10")
        branch_id: Optional branch filter
        
    Returns:
        Tank object or None if not found
    """
    # Try exact match first
    tank_query = db.query(Tank).filter(Tank.tank_code == tank_code)
    if branch_id is not None:
        tank_query = tank_query.filter(Tank.branch_id == branch_id)
    
    tank = tank_query.first()
    
    # If not found, try case-insensitive match
    if not tank:
        tank_query = db.query(Tank).filter(func.lower(Tank.tank_code) == func.lower(tank_code))
        if branch_id is not None:
            tank_query = tank_query.filter(Tank.branch_id == branch_id)
        tank = tank_query.first()
    
    return tank


def find_crylock_by_tank_code(
    db: Session,
    tank_code: str,
    crylock_number: str,
    branch_id: Optional[int] = None
) -> Optional[PatientCrylockInfo]:
    """
    Find patient crylock info by tank_code and crylock_number, using direct tank_id/branch_id references.
    
    This function optimizes queries by using the direct tank_id and branch_id fields
    in the PatientCrylockInfo model, avoiding expensive joins.
    
    Args:
        db: Database session
        tank_code: Tank code (e.g., "T1", "T10")
        crylock_number: Crylock number (e.g., "T10/C5/E1/3")
        branch_id: Optional branch filter
        
    Returns:
        PatientCrylockInfo object or None if not found
    """
    crylock_number_trimmed = crylock_number.strip() if crylock_number else None
    
    if not tank_code or not crylock_number_trimmed:
        return None
    
    # Step 1: Get tank_id from tank_code
    tank = find_tank_by_code(db, tank_code, branch_id)
    if not tank:
        return None
    
    # Step 2: Try direct query using patient_crylock_info.tank_id (optimized path)
    query = db.query(PatientCrylockInfo).filter(
        PatientCrylockInfo.tank_id == tank.tank_id,
        PatientCrylockInfo.crylock_number == crylock_number_trimmed
    )
    
    # Apply branch filter using direct branch_id reference
    if branch_id is not None:
        query = query.filter(PatientCrylockInfo.branch_id == branch_id)
    elif tank.branch_id:
        # Use tank's branch_id if no explicit branch_id provided
        query = query.filter(PatientCrylockInfo.branch_id == tank.branch_id)
    
    crylock = query.first()
    if crylock:
        return crylock
    
    # Step 3: Fallback to case-insensitive match with direct references
    query = db.query(PatientCrylockInfo).filter(
        PatientCrylockInfo.tank_id == tank.tank_id,
        func.lower(func.trim(PatientCrylockInfo.crylock_number)) == func.lower(crylock_number_trimmed)
    )
    
    if branch_id is not None:
        query = query.filter(PatientCrylockInfo.branch_id == branch_id)
    elif tank.branch_id:
        query = query.filter(PatientCrylockInfo.branch_id == tank.branch_id)
    
    return query.first()
