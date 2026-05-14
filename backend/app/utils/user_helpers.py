"""
Helper functions for user type detection and validation
"""
from typing import Optional


def extract_email_domain(email: str) -> Optional[str]:
    """
    Extract normalized domain from an email address.

    Returns:
        Lowercase domain (e.g., "mygrape.org") or None if invalid.
    """
    if not email:
        return None

    email_lower = email.strip().lower()
    if "@" not in email_lower:
        return None

    _, domain = email_lower.rsplit("@", 1)
    domain = domain.strip()
    return domain or None


def normalize_domain_or_email(value: str) -> Optional[str]:
    """
    Normalize either a raw domain (mygrape.org) or an email (a@mygrape.org)
    into a lowercase domain for consistent matching.
    """
    if not value:
        return None

    candidate = value.strip().lower()
    if not candidate:
        return None

    if "@" in candidate:
        _, candidate = candidate.rsplit("@", 1)

    candidate = candidate.strip()
    return candidate or None


def get_hospital_by_email_domain(email: str, db) -> Optional["Hospital"]:
    """
    Resolve a hospital using the email domain against hospitals.hospital_head_email.

    The hospital_head_email column may contain either:
    - a domain (e.g. mygrape.org), or
    - an email address (e.g. head@mygrape.org).
    """
    # Local import avoids heavy model imports in code paths that only use pure helpers.
    from app.models.IVF.hospital_model import Hospital

    email_domain = extract_email_domain(email)
    if not email_domain:
        return None

    hospitals = db.query(Hospital).filter(Hospital.hospital_head_email.isnot(None)).all()
    for hospital in hospitals:
        stored_domain = normalize_domain_or_email(hospital.hospital_head_email)
        if stored_domain and stored_domain == email_domain:
            return hospital

    return None


def is_hospital_department(department: str) -> bool:
    """
    Check if department indicates hospital user.
    
    Hospital departments: IVF, Oncology, etc. (not CGT)
    Pharma departments: CGT, etc.
    
    Args:
        department: Department name
        
    Returns:
        True if hospital department, False if pharma department
    """
    if not department:
        return False
    
    department_upper = department.upper()
    
    # CGT is pharma
    if department_upper == "CGT":
        return False
    
    # Hospital departments
    hospital_departments = ["IVF", "ONCOLOGY"]
    
    # If it's in hospital departments list, it's hospital
    if department_upper in hospital_departments:
        return True
    
    # Default: if department exists and not CGT, assume hospital
    return True


def is_specific_department(department: str, expected_department: str) -> bool:
    """
    Check if user belongs to a specific department (case-insensitive exact match).
    """
    if not department or not expected_department:
        return False
    return department.strip().upper() == expected_department.strip().upper()