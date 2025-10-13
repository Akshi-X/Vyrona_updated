"""
Error Codes for Internationalization (i18n)
Simple numeric format for easy translation mapping.

Frontend can map error codes to translations:
- en.json: { "ERR_1001": "User not found" }
- es.json: { "ERR_1001": "Usuario no encontrado" }
- fr.json: { "ERR_1001": "Utilisateur introuvable" }

Format: ERR_XXXX (4 digits)
Categories:
- 1xxx: Authentication & Login
- 2xxx: Registration
- 3xxx: User Management
- 4xxx: Database
- 5xxx: Email Service
- 6xxx: Validation
- 7xxx: Security
- 9xxx: General
"""

# ============================================
# ERROR CODES DICTIONARY
# Key-value pairs for easy access
# ============================================

ERROR_CODES = {
    # ============================================
    # AUTHENTICATION & LOGIN (1xxx)
    # ============================================
    
    # Login (1001-1020)
    "USER_NOT_FOUND": "ERR_1001",
    "USER_NOT_APPROVED": "ERR_1002",
    "INVALID_PASSWORD": "ERR_1003",
    "OTP_SEND_FAILED": "ERR_1004",
    "ACCOUNT_LOCKED": "ERR_1005",
    "ACCOUNT_REJECTED": "ERR_1006",
    
    # OTP Verification (1021-1040)
    "INVALID_OTP": "ERR_1021",
    "OTP_EXPIRED": "ERR_1022",
    "OTP_USER_NOT_FOUND": "ERR_1023",
    "OTP_MAX_ATTEMPTS": "ERR_1024",
    "OTP_ALREADY_USED": "ERR_1025",
    
    # Resend OTP (1041-1060)
    "RESEND_INVALID_USER": "ERR_1041",
    "RESEND_USER_NOT_APPROVED": "ERR_1042",
    "RESEND_OTP_FAILED": "ERR_1043",
    "RESEND_TOO_MANY_REQUESTS": "ERR_1044",
    
    # Token (1061-1080)
    "TOKEN_INVALID": "ERR_1061",
    "TOKEN_EXPIRED": "ERR_1062",
    "TOKEN_MISSING": "ERR_1063",
    "TOKEN_VALIDATION_FAILED": "ERR_1064",
    
    # ============================================
    # REGISTRATION (2xxx)
    # ============================================
    "EMAIL_ALREADY_EXISTS": "ERR_2001",
    "PASSWORD_MISMATCH": "ERR_2002",
    "WEAK_PASSWORD": "ERR_2003",
    "INVALID_EMAIL_FORMAT": "ERR_2004",
    "INVALID_ROLE": "ERR_2005",
    "REGISTRATION_DB_ERROR": "ERR_2006",
    "REGISTRATION_EMAIL_FAILED": "ERR_2007",
    
    # ============================================
    # USER MANAGEMENT (3xxx)
    # ============================================
    
    # Get User (3001-3020)
    "USER_GET_NOT_FOUND": "ERR_3001",
    "USER_GET_INVALID_ID": "ERR_3002",
    "USER_GET_UNAUTHORIZED": "ERR_3003",
    
    # Approve User (3021-3040)
    "APPROVE_USER_NOT_FOUND": "ERR_3021",
    "APPROVE_ALREADY_APPROVED": "ERR_3022",
    "APPROVE_DB_ERROR": "ERR_3023",
    "APPROVE_UNAUTHORIZED": "ERR_3024",
    
    # Reject User (3041-3060)
    "REJECT_USER_NOT_FOUND": "ERR_3041",
    "REJECT_ALREADY_REJECTED": "ERR_3042",
    "REJECT_DB_ERROR": "ERR_3043",
    "REJECT_UNAUTHORIZED": "ERR_3044",
    
    # ============================================
    # DATABASE (4xxx)
    # ============================================
    "DB_CONNECTION_FAILED": "ERR_4001",
    "DB_CONNECTION_TIMEOUT": "ERR_4002",
    "DB_QUERY_FAILED": "ERR_4003",
    "DB_QUERY_TIMEOUT": "ERR_4004",
    "DB_COMMIT_FAILED": "ERR_4005",
    "DB_ROLLBACK_FAILED": "ERR_4006",
    
    # ============================================
    # EMAIL SERVICE (5xxx)
    # ============================================
    "EMAIL_SMTP_FAILED": "ERR_5001",
    "EMAIL_AUTH_FAILED": "ERR_5002",
    "EMAIL_INVALID_RECIPIENT": "ERR_5003",
    "EMAIL_TEMPLATE_NOT_FOUND": "ERR_5004",
    "EMAIL_TEMPLATE_RENDER_FAILED": "ERR_5005",
    "EMAIL_SEND_TIMEOUT": "ERR_5006",
    
    # ============================================
    # VALIDATION (6xxx)
    # ============================================
    "VALIDATION_FIELD_REQUIRED": "ERR_6001",
    "VALIDATION_INVALID_FORMAT": "ERR_6002",
    "VALIDATION_TOO_LONG": "ERR_6003",
    "VALIDATION_TOO_SHORT": "ERR_6004",
    "VALIDATION_INVALID_CHARS": "ERR_6005",
    
    # ============================================
    # SECURITY (7xxx)
    # ============================================
    "SECURITY_MALICIOUS_CONTENT": "ERR_7001",
    "SECURITY_XSS_DETECTED": "ERR_7002",
    "SECURITY_SQL_INJECTION": "ERR_7003",
    "SECURITY_CMD_INJECTION": "ERR_7004",
    "SECURITY_NOSQL_INJECTION": "ERR_7005",
    "SECURITY_PATH_TRAVERSAL": "ERR_7006",
    
    # ============================================
    # GENERAL (9xxx)
    # ============================================
    "SERVER_ERROR": "ERR_9001",
    "SERVICE_UNAVAILABLE": "ERR_9002",
    "REQUEST_TIMEOUT": "ERR_9003",
    "RESOURCE_NOT_FOUND": "ERR_9004",
    "ACCESS_FORBIDDEN": "ERR_9005",
    "RATE_LIMIT_EXCEEDED": "ERR_9006",
}


# ============================================
# ERROR METADATA
# Backend uses this for HTTP status, severity, etc.
# ============================================

ERROR_METADATA = {
    # Authentication & Login
    "ERR_1001": {"http_status": 400, "category": "Authentication", "severity": "LOW"},
    "ERR_1002": {"http_status": 403, "category": "Authentication", "severity": "LOW"},
    "ERR_1003": {"http_status": 401, "category": "Authentication", "severity": "MEDIUM"},
    "ERR_1004": {"http_status": 500, "category": "Authentication", "severity": "HIGH"},
    "ERR_1005": {"http_status": 403, "category": "Authentication", "severity": "MEDIUM"},
    "ERR_1006": {"http_status": 403, "category": "Authentication", "severity": "LOW"},
    
    # OTP
    "ERR_1021": {"http_status": 400, "category": "Authentication", "severity": "LOW"},
    "ERR_1022": {"http_status": 400, "category": "Authentication", "severity": "LOW"},
    "ERR_1023": {"http_status": 404, "category": "Authentication", "severity": "MEDIUM"},
    "ERR_1024": {"http_status": 429, "category": "Authentication", "severity": "MEDIUM"},
    "ERR_1025": {"http_status": 400, "category": "Authentication", "severity": "LOW"},
    
    # Resend OTP
    "ERR_1041": {"http_status": 400, "category": "Authentication", "severity": "LOW"},
    "ERR_1042": {"http_status": 403, "category": "Authentication", "severity": "LOW"},
    "ERR_1043": {"http_status": 500, "category": "Authentication", "severity": "HIGH"},
    "ERR_1044": {"http_status": 429, "category": "Authentication", "severity": "MEDIUM"},
    
    # Token
    "ERR_1061": {"http_status": 401, "category": "Authentication", "severity": "MEDIUM"},
    "ERR_1062": {"http_status": 401, "category": "Authentication", "severity": "LOW"},
    "ERR_1063": {"http_status": 401, "category": "Authentication", "severity": "LOW"},
    "ERR_1064": {"http_status": 401, "category": "Authentication", "severity": "MEDIUM"},
    
    # Registration
    "ERR_2001": {"http_status": 409, "category": "Registration", "severity": "LOW"},
    "ERR_2002": {"http_status": 400, "category": "Registration", "severity": "LOW"},
    "ERR_2003": {"http_status": 400, "category": "Registration", "severity": "LOW"},
    "ERR_2004": {"http_status": 400, "category": "Registration", "severity": "LOW"},
    "ERR_2005": {"http_status": 400, "category": "Registration", "severity": "LOW"},
    "ERR_2006": {"http_status": 500, "category": "Registration", "severity": "HIGH"},
    "ERR_2007": {"http_status": 500, "category": "Registration", "severity": "MEDIUM"},
    
    # User Management
    "ERR_3001": {"http_status": 404, "category": "User Management", "severity": "LOW"},
    "ERR_3002": {"http_status": 400, "category": "User Management", "severity": "LOW"},
    "ERR_3003": {"http_status": 403, "category": "User Management", "severity": "MEDIUM"},
    "ERR_3021": {"http_status": 404, "category": "User Management", "severity": "MEDIUM"},
    "ERR_3022": {"http_status": 409, "category": "User Management", "severity": "LOW"},
    "ERR_3023": {"http_status": 500, "category": "User Management", "severity": "HIGH"},
    "ERR_3024": {"http_status": 403, "category": "User Management", "severity": "MEDIUM"},
    "ERR_3041": {"http_status": 404, "category": "User Management", "severity": "MEDIUM"},
    "ERR_3042": {"http_status": 409, "category": "User Management", "severity": "LOW"},
    "ERR_3043": {"http_status": 500, "category": "User Management", "severity": "HIGH"},
    "ERR_3044": {"http_status": 403, "category": "User Management", "severity": "MEDIUM"},
    
    # Database
    "ERR_4001": {"http_status": 503, "category": "Database", "severity": "CRITICAL"},
    "ERR_4002": {"http_status": 503, "category": "Database", "severity": "CRITICAL"},
    "ERR_4003": {"http_status": 500, "category": "Database", "severity": "HIGH"},
    "ERR_4004": {"http_status": 504, "category": "Database", "severity": "HIGH"},
    "ERR_4005": {"http_status": 500, "category": "Database", "severity": "HIGH"},
    "ERR_4006": {"http_status": 500, "category": "Database", "severity": "HIGH"},
    
    # Email
    "ERR_5001": {"http_status": 503, "category": "Email", "severity": "HIGH"},
    "ERR_5002": {"http_status": 500, "category": "Email", "severity": "HIGH"},
    "ERR_5003": {"http_status": 400, "category": "Email", "severity": "LOW"},
    "ERR_5004": {"http_status": 500, "category": "Email", "severity": "MEDIUM"},
    "ERR_5005": {"http_status": 500, "category": "Email", "severity": "MEDIUM"},
    "ERR_5006": {"http_status": 504, "category": "Email", "severity": "HIGH"},
    
    # Validation
    "ERR_6001": {"http_status": 400, "category": "Validation", "severity": "LOW"},
    "ERR_6002": {"http_status": 400, "category": "Validation", "severity": "LOW"},
    "ERR_6003": {"http_status": 400, "category": "Validation", "severity": "LOW"},
    "ERR_6004": {"http_status": 400, "category": "Validation", "severity": "LOW"},
    "ERR_6005": {"http_status": 400, "category": "Validation", "severity": "LOW"},
    
    # Security
    "ERR_7001": {"http_status": 400, "category": "Security", "severity": "CRITICAL"},
    "ERR_7002": {"http_status": 400, "category": "Security", "severity": "CRITICAL"},
    "ERR_7003": {"http_status": 400, "category": "Security", "severity": "CRITICAL"},
    "ERR_7004": {"http_status": 400, "category": "Security", "severity": "CRITICAL"},
    "ERR_7005": {"http_status": 400, "category": "Security", "severity": "CRITICAL"},
    "ERR_7006": {"http_status": 400, "category": "Security", "severity": "CRITICAL"},
    
    # General
    "ERR_9001": {"http_status": 500, "category": "General", "severity": "CRITICAL"},
    "ERR_9002": {"http_status": 503, "category": "General", "severity": "HIGH"},
    "ERR_9003": {"http_status": 504, "category": "General", "severity": "MEDIUM"},
    "ERR_9004": {"http_status": 404, "category": "General", "severity": "LOW"},
    "ERR_9005": {"http_status": 403, "category": "General", "severity": "MEDIUM"},
    "ERR_9006": {"http_status": 429, "category": "General", "severity": "MEDIUM"},
}


# ============================================
# HELPER FUNCTIONS
# ============================================

def get_error_code(key: str) -> str:
    """
    Get error code by key name
    
    Usage:
        error_code = get_error_code("INVALID_PASSWORD")  # Returns "ERR_1003"
    """
    return ERROR_CODES.get(key, "ERR_9001")


def get_error_metadata(error_code: str) -> dict:
    """
    Get metadata for error code
    
    Usage:
        metadata = get_error_metadata("ERR_1003")
        # Returns: {"http_status": 401, "category": "Authentication", "severity": "MEDIUM"}
    """
    return ERROR_METADATA.get(error_code, {
        "http_status": 500,
        "category": "Unknown",
        "severity": "UNKNOWN"
    })

