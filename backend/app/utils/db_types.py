"""
Database Type Decorators
Custom SQLAlchemy types for database columns.
"""

import sqlalchemy
from sqlalchemy import TypeDecorator


class RoleType(TypeDecorator):
    """
    SQLAlchemy type that normalizes role strings to title case before storing.
    Accepts any case input but always stores in title case format.
    
    Usage:
        role = sqlalchemy.Column(RoleType(), nullable=False)
    """
    impl = sqlalchemy.String(50)
    cache_ok = True
    
    def process_bind_param(self, value, dialect):
        """Normalize role to title case before storing in database"""
        if value is None:
            return value
        
        # Import here to avoid circular imports
        try:
            from ..utils.utils import normalize_role_to_title_case
            from ..constants.roles import ALL_ROLES
            
            normalized = normalize_role_to_title_case(value)
            # Validate it's a valid role using constants
            if normalized not in ALL_ROLES:
                raise ValueError(f"Invalid role: {value}. Must be one of: {', '.join(ALL_ROLES)}")
            return normalized
        except ImportError:
            # Fallback normalization if utils import fails
            role_lower = str(value).lower()
            role_mapping = {
                'admin': 'Admin',
                'pharma_admin': 'Pharma_admin',
                'mygrape_admin': 'Mygrape_admin',
                'manager': 'Manager',
                'user': 'User'
            }
            return role_mapping.get(role_lower, str(value).capitalize())
    
    def process_result_value(self, value, dialect):
        """Ensure role is in title case when reading from database"""
        if value is None:
            return value
        
        # Import here to avoid circular imports
        try:
            from ..utils.utils import normalize_role_to_title_case
            return normalize_role_to_title_case(value)
        except ImportError:
            # Fallback normalization if utils import fails
            role_lower = str(value).lower()
            role_mapping = {
                'admin': 'Admin',
                'pharma_admin': 'Pharma_admin',
                'mygrape_admin': 'Mygrape_admin',
                'manager': 'Manager',
                'user': 'User'
            }
            return role_mapping.get(role_lower, str(value).capitalize())

