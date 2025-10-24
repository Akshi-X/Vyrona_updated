"""
Role Constants
Define all user roles in one place to avoid hardcoded strings.
"""

# Role definitions
ROLE_ADMIN = "admin"
ROLE_PHARMA_ADMIN = "pharma_admin"
ROLE_MYGRAPE_ADMIN = "mygrape_admin"
ROLE_MANAGER = "manager"
ROLE_USER = "user"

# Role lists for validation
ALL_ROLES = [ROLE_ADMIN, ROLE_PHARMA_ADMIN, ROLE_MYGRAPE_ADMIN, ROLE_MANAGER, ROLE_USER]
MANAGEMENT_ROLES = [ROLE_ADMIN, ROLE_PHARMA_ADMIN, ROLE_MYGRAPE_ADMIN, ROLE_MANAGER]  # Roles with management permissions
APPROVAL_ROLES = [ROLE_ADMIN, ROLE_PHARMA_ADMIN]  # Roles that can approve users (pharma admins only)
FEEDBACK_ROLES = [ROLE_MYGRAPE_ADMIN]  # Roles that can manage all feedback

