"""
Helper functions for IVF control tower role-based access control and data access
"""
from functools import lru_cache
from typing import List, Optional, Tuple
import base64
import hashlib
import hmac
import logging

from fastapi import HTTPException, Request
from cryptography.hazmat.primitives import padding  # pyright: ignore[reportMissingImports]
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes  # pyright: ignore[reportMissingImports]
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..config.config import settings
from ..models.IVF.patient_crylock_info_model import PatientCrylockInfo
from ..models.IVF.tank_model import Tank
from ..models.user_model import User
from ..utils.user_helpers import is_specific_department


# Roles that should be filtered by branch (only User)
ROLES_WITH_BRANCH_FILTER = ["User"]
ENCRYPTED_VALUE_PREFIX = "encv1:"
logger = logging.getLogger(__name__)


def _get_ivf_encryption_key() -> bytes:
    """
    Derive a stable 32-byte encryption key from SECRET_KEY.
    """
    return hashlib.sha256(settings.SECRET_KEY.encode("utf-8")).digest()


def encrypt_sensitive_ivf_value(value: Optional[str]) -> Optional[str]:
    """
    Deterministically encrypt IVF-sensitive values for DB storage.
    Returns plaintext unchanged only when value is empty/None.
    """
    if value is None:
        return None
    value_str = str(value)
    if not value_str:
        return value_str
    if value_str.startswith(ENCRYPTED_VALUE_PREFIX):
        return value_str

    key = _get_ivf_encryption_key()
    value_bytes = value_str.encode("utf-8")

    # Deterministic IV keeps equality queries working on encrypted columns.
    iv = hmac.new(key, value_bytes, hashlib.sha256).digest()[:16]

    padder = padding.PKCS7(128).padder()
    padded = padder.update(value_bytes) + padder.finalize()

    cipher = Cipher(algorithms.AES(key), modes.CBC(iv))
    encryptor = cipher.encryptor()
    ciphertext = encryptor.update(padded) + encryptor.finalize()

    encoded = base64.urlsafe_b64encode(iv + ciphertext).decode("utf-8")
    return f"{ENCRYPTED_VALUE_PREFIX}{encoded}"


def decrypt_sensitive_ivf_value(value: Optional[str]) -> Optional[str]:
    """
    Decrypt IVF-sensitive values when reading from DB.
    Plaintext values (legacy rows) are returned as-is.
    """
    if value is None:
        return None
    value_str = str(value)
    if not value_str:
        return value_str

    # Current deterministic encryption format.
    if value_str.startswith(ENCRYPTED_VALUE_PREFIX):
        try:
            token = value_str[len(ENCRYPTED_VALUE_PREFIX):]
            encrypted_bytes = base64.urlsafe_b64decode(token.encode("utf-8"))
            iv = encrypted_bytes[:16]
            ciphertext = encrypted_bytes[16:]

            key = _get_ivf_encryption_key()
            cipher = Cipher(algorithms.AES(key), modes.CBC(iv))
            decryptor = cipher.decryptor()
            padded_plaintext = decryptor.update(ciphertext) + decryptor.finalize()

            unpadder = padding.PKCS7(128).unpadder()
            plaintext = unpadder.update(padded_plaintext) + unpadder.finalize()
            return plaintext.decode("utf-8")
        except Exception:
            logger.warning("Failed to decrypt encv1 IVF value; returning original value.")
            return value_str

    # Legacy plaintext rows remain readable.
    return value_str


def get_branch_filter_info(request: Request, branch_id_override: Optional[int] = None, is_quality_tracking: bool = False) -> Tuple[Optional[int], Optional[str]]:
    """
    Get branch filter information for IVF department users.
    
    This function extracts branch_id and role from the authenticated user
    to determine if data should be filtered by branch.
    
    Rules:
    - User: Always filter by their branch_id (branch_id_override is ignored)
    - Manager: 
        * If is_quality_tracking=True and branch_id_override is provided: filter by that branch
        * If is_quality_tracking=True and branch_id_override is NOT provided: filter by their own branch_id
        * If is_quality_tracking=False (control tower, dashboard, etc.): no filtering - can see all branches
    - Admin: No filtering (return None for branch_id) - can see all branches (branch_id_override is ignored)
    - Non-IVF users: Access denied (HTTP 403)
    
    Args:
        request: FastAPI Request object with current_user in request.state
        branch_id_override: Optional branch ID override (only applies to Manager role on quality tracking page)
        is_quality_tracking: True if called from quality tracking endpoints, False for control tower/dashboard
        
    Returns:
        Tuple of (branch_id, role):
        - branch_id: Branch ID to filter by, or None if no filtering
        - role: User's role for IVF users
    """
    # Get current user from request state (injected by middleware)
    if not hasattr(request.state, "current_user"):
        raise HTTPException(status_code=401, detail="User not authenticated")
    
    user: User = request.state.current_user
    
    # Strict department isolation: only IVF users can access IVF endpoints.
    if not is_specific_department(user.department, "IVF"):
        raise HTTPException(
            status_code=403,
            detail="Access denied: This endpoint is for IVF users only"
        )
    
    # Get user's role (enum value is already in title case: "Admin", "Manager", "User")
    role = user.role.value if hasattr(user.role, 'value') else str(user.role)
    role_normalized = role  # Already in correct format from enum
    
    # Admin role: no branch filtering (can see all branches, ignore override)
    if role_normalized == "Admin":
        return None, role_normalized
    
    # Manager role: behavior depends on whether this is quality tracking page
    if role_normalized == "Manager":
        if is_quality_tracking:
            # Quality tracking page: use override if provided, otherwise use Manager's own branch_id
            if branch_id_override is not None:
                return branch_id_override, role_normalized
            # Manager without override - filter by their own branch_id
            branch_id = user.branch_id
            return (branch_id, role_normalized) if branch_id else (None, role_normalized)
        # Control tower, dashboard, etc.: Managers see all branches
        return None, role_normalized
    
    # User role: always filter by their branch (ignore override)
    if role_normalized in ROLES_WITH_BRANCH_FILTER:
        branch_id = user.branch_id
        return (branch_id, role_normalized) if branch_id else (None, role_normalized)
    
    # Unknown role - no filtering
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
    encrypted_crylock_number = encrypt_sensitive_ivf_value(crylock_number_trimmed)
    
    if not tank_code or not crylock_number_trimmed:
        return None
    
    # Step 1: Get tank_id from tank_code
    tank = find_tank_by_code(db, tank_code, branch_id)
    if not tank:
        return None
    
    # Step 2: Try direct query using patient_crylock_info.tank_id (optimized path)
    query = db.query(PatientCrylockInfo).filter(
        PatientCrylockInfo.tank_id == tank.tank_id,
        PatientCrylockInfo.crylock_number.in_([
            encrypted_crylock_number,
            crylock_number_trimmed
        ])
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
    
    # Step 3: Fallback to case-insensitive match for legacy plaintext rows
    query = db.query(PatientCrylockInfo).filter(
        PatientCrylockInfo.tank_id == tank.tank_id,
        func.lower(func.trim(PatientCrylockInfo.crylock_number)) == func.lower(crylock_number_trimmed)
    )
    
    if branch_id is not None:
        query = query.filter(PatientCrylockInfo.branch_id == branch_id)
    elif tank.branch_id:
        query = query.filter(PatientCrylockInfo.branch_id == tank.branch_id)
    
    return query.first()
