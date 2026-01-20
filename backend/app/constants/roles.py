"""
Role Constants
Define all user roles in one place to avoid hardcoded strings.
"""

# Role definitions (title case - first letter capital)
ROLE_ADMIN = "Admin"
ROLE_PHARMA_ADMIN = "Pharma_admin"
ROLE_MYGRAPE_ADMIN = "Mygrape_admin"
ROLE_MANAGER = "Manager"
ROLE_USER = "User"

# Role lists for validation
ALL_ROLES = [ROLE_ADMIN, ROLE_PHARMA_ADMIN, ROLE_MYGRAPE_ADMIN, ROLE_MANAGER, ROLE_USER]
MANAGEMENT_ROLES = [ROLE_ADMIN, ROLE_PHARMA_ADMIN, ROLE_MYGRAPE_ADMIN, ROLE_MANAGER]  # Roles with management permissions
APPROVAL_ROLES = [ROLE_ADMIN, ROLE_PHARMA_ADMIN]  # Roles that can approve users (pharma admins only)
FEEDBACK_ROLES = [ROLE_MYGRAPE_ADMIN]  # Roles that can manage all feedback

