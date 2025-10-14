"""
Role Constants
Define all user roles in one place to avoid hardcoded strings.
"""

# Role definitions
ROLE_ADMIN = "admin"
ROLE_MANAGER = "manager"
ROLE_USER = "user"

# Role lists for validation
ALL_ROLES = [ROLE_ADMIN, ROLE_MANAGER, ROLE_USER]
MANAGEMENT_ROLES = [ROLE_ADMIN, ROLE_MANAGER]  # Roles with management permissions

