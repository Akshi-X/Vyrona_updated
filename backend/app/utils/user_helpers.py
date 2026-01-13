"""
Helper functions for user type detection and validation
"""
from typing import Optional


def is_hospital_email(email: str) -> bool:
    """
    Check if email belongs to hospital domain.
    
    Hospital domains: @zucisystems.com, @mygrape.org
    All other domains are considered pharma.
    
    Args:
        email: Email address to check
        
    Returns:
        True if hospital email, False if pharma email
    """
    email_lower = email.lower().strip()
    return "@zucisystems.com" in email_lower or "@mygrape.org" in email_lower


def get_hospital_name_from_email(email: str) -> Optional[str]:
    """
    Get hospital name from email domain.
    
    For @zucisystems.com or @mygrape.org emails, returns "ARC Fertility Hospitals"
    For other emails, returns None (pharma users).
    
    Args:
        email: Email address
        
    Returns:
        Hospital name if hospital email, None otherwise
    """
    if is_hospital_email(email):
        return "ARC Fertility Hospitals"
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
