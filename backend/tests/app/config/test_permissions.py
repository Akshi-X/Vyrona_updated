import pytest
from app.config.permissions import (
    get_role_permissions,
    EndpointPermissions,
    PUBLIC_ENDPOINTS,
    ADMIN_ONLY_ENDPOINTS,
    PHARMA_ADMIN_ENDPOINTS,
    MYGRAPE_ADMIN_ENDPOINTS,
    MANAGER_ONLY_ENDPOINTS,
    USER_ONLY_ENDPOINTS,
    AUTHENTICATED_ENDPOINTS
)


# ============================================
# Tests for get_role_permissions
# ============================================

def test_get_role_permissions_admin():
    """Test get_role_permissions for admin role"""
    result = get_role_permissions("admin")
    
    assert result["can_approve_users"] is True
    assert result["can_reject_users"] is True
    assert result["can_view_all_users"] is True
    assert result["can_manage_system"] is True
    assert result["role"] == "admin"


def test_get_role_permissions_admin_case_insensitive():
    """Test get_role_permissions for admin role (case insensitive)"""
    result = get_role_permissions("ADMIN")
    
    assert result["can_approve_users"] is True
    assert result["can_reject_users"] is True
    assert result["can_view_all_users"] is True
    assert result["can_manage_system"] is True
    assert result["role"] == "admin"


def test_get_role_permissions_pharma_admin():
    """Test get_role_permissions for pharma_admin role"""
    result = get_role_permissions("pharma_admin")
    
    assert result["can_approve_users"] is True
    assert result["can_reject_users"] is True
    assert result["can_view_all_users"] is True
    assert result["can_manage_system"] is False
    assert result["role"] == "pharma_admin"


def test_get_role_permissions_mygrape_admin():
    """Test get_role_permissions for mygrape_admin role"""
    result = get_role_permissions("mygrape_admin")
    
    assert result["can_approve_users"] is False
    assert result["can_reject_users"] is False
    assert result["can_view_all_users"] is True
    assert result["can_manage_feedback"] is True
    assert result["can_view_all_feedback"] is True
    assert result["can_manage_system"] is False
    assert result["role"] == "mygrape_admin"


def test_get_role_permissions_manager():
    """Test get_role_permissions for manager role"""
    result = get_role_permissions("manager")
    
    assert result["can_approve_users"] is False
    assert result["can_reject_users"] is False
    assert result["can_view_all_users"] is False
    assert result["can_manage_system"] is False
    assert result["role"] == "manager"


def test_get_role_permissions_user():
    """Test get_role_permissions for user role"""
    result = get_role_permissions("user")
    
    assert result["can_approve_users"] is False
    assert result["can_reject_users"] is False
    assert result["can_view_all_users"] is False
    assert result["can_manage_system"] is False
    assert result["role"] == "user"


def test_get_role_permissions_unknown_role():
    """Test get_role_permissions for unknown role"""
    result = get_role_permissions("unknown_role")
    
    assert result["role"] == "unknown"
    assert len(result) == 1  # Only role field


def test_get_role_permissions_empty_string():
    """Test get_role_permissions for empty string"""
    result = get_role_permissions("")
    
    assert result["role"] == "unknown"


def test_get_role_permissions_mixed_case():
    """Test get_role_permissions handles mixed case"""
    result1 = get_role_permissions("Pharma_Admin")
    result2 = get_role_permissions("MANAGER")
    result3 = get_role_permissions("User")
    
    assert result1["role"] == "pharma_admin"
    assert result2["role"] == "manager"
    assert result3["role"] == "user"


# ============================================
# Tests for EndpointPermissions.is_public_endpoint
# ============================================

def test_is_public_endpoint_exact_match():
    """Test is_public_endpoint with exact method and path match"""
    # Test with GET method for a public endpoint
    assert EndpointPermissions.is_public_endpoint("GET", "/api/quality/health") is True
    
    # Test with POST method for a public endpoint
    assert EndpointPermissions.is_public_endpoint("POST", "/api/register") is True


def test_is_public_endpoint_wildcard_method():
    """Test is_public_endpoint with wildcard method (*)"""
    # Test endpoints that have wildcard method
    assert EndpointPermissions.is_public_endpoint("GET", "/api/login") is True
    assert EndpointPermissions.is_public_endpoint("POST", "/api/login") is True
    assert EndpointPermissions.is_public_endpoint("PUT", "/api/login") is True
    assert EndpointPermissions.is_public_endpoint("DELETE", "/api/login") is True


def test_is_public_endpoint_not_public():
    """Test is_public_endpoint returns False for non-public endpoints"""
    assert EndpointPermissions.is_public_endpoint("GET", "/api/user/123") is False
    assert EndpointPermissions.is_public_endpoint("POST", "/api/feedback") is False
    assert EndpointPermissions.is_public_endpoint("GET", "/api/tasks") is False


def test_is_public_endpoint_docs_endpoints():
    """Test is_public_endpoint for documentation endpoints"""
    assert EndpointPermissions.is_public_endpoint("GET", "/docs") is True
    assert EndpointPermissions.is_public_endpoint("GET", "/openapi.json") is True
    assert EndpointPermissions.is_public_endpoint("GET", "/redoc") is True


def test_is_public_endpoint_health_check():
    """Test is_public_endpoint for health check endpoint"""
    assert EndpointPermissions.is_public_endpoint("GET", "/health") is True


def test_is_public_endpoint_dashboard_endpoints():
    """Test is_public_endpoint for dashboard endpoints"""
    assert EndpointPermissions.is_public_endpoint("GET", "/api/dashboard/performance") is True
    assert EndpointPermissions.is_public_endpoint("GET", "/api/dashboard/risk") is True
    assert EndpointPermissions.is_public_endpoint("GET", "/api/dashboard/compliance") is True


def test_is_public_endpoint_otp_endpoints():
    """Test is_public_endpoint for OTP endpoints"""
    assert EndpointPermissions.is_public_endpoint("POST", "/api/verify-otp") is True
    assert EndpointPermissions.is_public_endpoint("POST", "/api/resend-otp") is True


def test_is_public_endpoint_password_endpoints():
    """Test is_public_endpoint for password reset endpoints"""
    assert EndpointPermissions.is_public_endpoint("POST", "/api/forgot-password") is True
    assert EndpointPermissions.is_public_endpoint("POST", "/api/reset-password") is True


def test_is_public_endpoint_case_sensitive_path():
    """Test is_public_endpoint is case sensitive for paths"""
    # Paths should match exactly
    assert EndpointPermissions.is_public_endpoint("GET", "/api/LOGIN") is False
    assert EndpointPermissions.is_public_endpoint("GET", "/API/login") is False


def test_is_public_endpoint_method_case_sensitive():
    """Test is_public_endpoint handles method case"""
    # "/api/login" has wildcard "*" so it matches any method case
    # Use an endpoint with specific method to test case sensitivity
    assert EndpointPermissions.is_public_endpoint("get", "/api/quality/health") is False  # Lowercase method
    assert EndpointPermissions.is_public_endpoint("GET", "/api/quality/health") is True  # Uppercase method
    # "/api/login" matches any method due to wildcard
    assert EndpointPermissions.is_public_endpoint("get", "/api/login") is True  # Lowercase matches wildcard
    assert EndpointPermissions.is_public_endpoint("GET", "/api/login") is True  # Uppercase matches wildcard


# ============================================
# Tests for permission sets
# ============================================

def test_public_endpoints_contains_expected():
    """Test PUBLIC_ENDPOINTS contains expected endpoints"""
    assert ("*", "/api/login") in PUBLIC_ENDPOINTS
    assert ("*", "/api/register") in PUBLIC_ENDPOINTS
    assert ("GET", "/api/quality/health") in PUBLIC_ENDPOINTS


def test_admin_only_endpoints_structure():
    """Test ADMIN_ONLY_ENDPOINTS structure"""
    # Note: Empty {} creates a dict in Python, not a set
    # The type annotation says Set, but runtime type is dict for empty {}
    # Verify it's empty (as per current implementation)
    assert len(ADMIN_ONLY_ENDPOINTS) == 0
    # Verify it can be used as a container (dict or set)
    assert hasattr(ADMIN_ONLY_ENDPOINTS, '__contains__')


def test_pharma_admin_endpoints_contains_expected():
    """Test PHARMA_ADMIN_ENDPOINTS contains expected endpoints"""
    assert ("GET", "/api/user/{user_id}") in PHARMA_ADMIN_ENDPOINTS
    assert ("POST", "/api/user/approve") in PHARMA_ADMIN_ENDPOINTS
    assert ("POST", "/api/tasks") in PHARMA_ADMIN_ENDPOINTS


def test_mygrape_admin_endpoints_contains_expected():
    """Test MYGRAPE_ADMIN_ENDPOINTS contains expected endpoints"""
    assert ("GET", "/api/user/{user_id}") in MYGRAPE_ADMIN_ENDPOINTS
    assert ("GET", "/api/feedback/admin") in MYGRAPE_ADMIN_ENDPOINTS


def test_authenticated_endpoints_contains_expected():
    """Test AUTHENTICATED_ENDPOINTS contains expected endpoints"""
    assert ("POST", "/api/feedback") in AUTHENTICATED_ENDPOINTS
    assert ("GET", "/api/tasks") in AUTHENTICATED_ENDPOINTS
    assert ("GET", "/api/profile") in AUTHENTICATED_ENDPOINTS

