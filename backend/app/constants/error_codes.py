"""
Error Codes for Application Errors
Simple numeric format for consistent error handling.

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
    
    # Password Reset (1081-1100)
    "RESET_USER_NOT_FOUND": "ERR_1081",
    "RESET_TOKEN_INVALID": "ERR_1082",
    "RESET_TOKEN_EXPIRED": "ERR_1083",
    "PASSWORD_RESET_FAILED": "ERR_1084",
    "RESET_RATE_LIMIT": "ERR_1085",
    "RESET_PASSWORD_MISMATCH": "ERR_1086",
    "RESET_WEAK_PASSWORD": "ERR_1087",
    "RESET_USER_NOT_APPROVED": "ERR_1088",
    "RESET_ACCOUNT_LOCKED": "ERR_1089",
    
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
    
    # Patient Service (5007-5012)
    "PATIENT_SERVICE_ERROR": "ERR_5007",
    "PATIENT_CREATE_FAILED": "ERR_5008",
    "PATIENT_UPDATE_FAILED": "ERR_5009",
    "PATIENT_DELETE_FAILED": "ERR_5010",
    "PATIENT_SEARCH_FAILED": "ERR_5011",
    "PATIENT_STATISTICS_FAILED": "ERR_5012",
    
    # ============================================
    # VALIDATION (6xxx)
    # ============================================
    "VALIDATION_FIELD_REQUIRED": "ERR_6001",
    "VALIDATION_INVALID_FORMAT": "ERR_6002",
    "VALIDATION_TOO_LONG": "ERR_6003",
    "VALIDATION_TOO_SHORT": "ERR_6004",
    "VALIDATION_INVALID_CHARS": "ERR_6005",
    
    # Patient Validation (6006-6010)
    "PATIENT_VALIDATION_ERROR": "ERR_6006",
    "PATIENT_NAME_INVALID": "ERR_6007",
    "PATIENT_CONDITION_INVALID": "ERR_6008",
    "PATIENT_INSURANCE_INVALID": "ERR_6009",
    "PATIENT_DATA_INVALID": "ERR_6010",
    
    # ============================================
    # SECURITY (7xxx)
    # ============================================
    "SECURITY_MALICIOUS_CONTENT": "ERR_7001",
    "SECURITY_XSS_DETECTED": "ERR_7002",
    "SECURITY_SQL_INJECTION": "ERR_7003",
    "SECURITY_CMD_INJECTION": "ERR_7004",
    "SECURITY_NOSQL_INJECTION": "ERR_7005",
    "SECURITY_PATH_TRAVERSAL": "ERR_7006",
    
    # Patient Document (7007-7010)
    "PATIENT_DOCUMENT_ERROR": "ERR_7007",
    "PATIENT_DOCUMENT_UPLOAD_FAILED": "ERR_7008",
    "PATIENT_DOCUMENT_DOWNLOAD_FAILED": "ERR_7009",
    "PATIENT_DOCUMENT_DELETE_FAILED": "ERR_7010",
    
    # ============================================
    # FEEDBACK SYSTEM (8xxx)
    # ============================================
    
    # Feedback Creation (8001-8020)
    "FEEDBACK_CREATE_FAILED": "ERR_8001",
    "FEEDBACK_INVALID_DATA": "ERR_8002",
    "FEEDBACK_ATTACHMENT_TOO_LARGE": "ERR_8003",
    "FEEDBACK_ATTACHMENT_INVALID_TYPE": "ERR_8004",
    "FEEDBACK_ATTACHMENT_SAVE_FAILED": "ERR_8005",
    "FEEDBACK_TICKET_ID_GENERATION_FAILED": "ERR_8006",
    
    # Feedback Retrieval (8021-8040)
    "FEEDBACK_NOT_FOUND": "ERR_8021",
    "FEEDBACK_ACCESS_DENIED": "ERR_8022",
    "FEEDBACK_FILTER_INVALID": "ERR_8023",
    "FEEDBACK_USER_NOT_FOUND": "ERR_8024",
    
    # Feedback Comments (8041-8060)
    "FEEDBACK_COMMENT_CREATE_FAILED": "ERR_8041",
    "FEEDBACK_COMMENT_NOT_FOUND": "ERR_8042",
    "FEEDBACK_COMMENT_INVALID": "ERR_8043",
    "FEEDBACK_COMMENT_ACCESS_DENIED": "ERR_8044",
    
    # Feedback Status Updates (8061-8080)
    "FEEDBACK_STATUS_UPDATE_FAILED": "ERR_8061",
    "FEEDBACK_STATUS_INVALID": "ERR_8062",
    "FEEDBACK_STATUS_ACCESS_DENIED": "ERR_8063",
    "FEEDBACK_STATUS_ALREADY_SET": "ERR_8064",
    
    # Feedback Email Notifications (8081-8100)
    "FEEDBACK_EMAIL_SEND_FAILED": "ERR_8081",
    "FEEDBACK_EMAIL_TEMPLATE_ERROR": "ERR_8082",
    "FEEDBACK_EMAIL_RECIPIENT_INVALID": "ERR_8083",


    # ============================================
    # TASK MANAGEMENT (10xxx)
    # ============================================
    "TASK_CREATE_FAILED": "ERR_10001",
    "TASK_NOT_FOUND": "ERR_10002",
    "TASK_INVALID_ASSIGNEE": "ERR_10003",
    "TASK_INVALID_PATIENT": "ERR_10004",
    "TASK_UPDATE_FAILED": "ERR_10005",
    "TASK_DELETE_FAILED": "ERR_10006",
    "TASK_UNAUTHORIZED_EDIT": "ERR_10007",
    "TASK_UNAUTHORIZED_STATUS": "ERR_10008",
    "TASK_MANAGER_ONLY": "ERR_10009",

    # ============================================
    # GENERAL (9xxx)
    # ============================================
    "SERVER_ERROR": "ERR_9001",
    "SERVICE_UNAVAILABLE": "ERR_9002",
    "REQUEST_TIMEOUT": "ERR_9003",
    "RESOURCE_NOT_FOUND": "ERR_9004",
    "ACCESS_FORBIDDEN": "ERR_9005",
    "RATE_LIMIT_EXCEEDED": "ERR_9006",
    
    # Patient Not Found (9007-9010)
    "PATIENT_NOT_FOUND": "ERR_9007",
    "PROVIDER_NOT_FOUND": "ERR_9008",
    "PHARMA_NOT_FOUND": "ERR_9009",
    "PATIENT_DOCUMENT_NOT_FOUND": "ERR_9010",
}


# ============================================
# HELPER FUNCTION
# ============================================

def get_error_code(key: str) -> str:
    """
    Get error code by key name.
    
    Args:
        key: The error key (e.g., "INVALID_PASSWORD")
    
    Returns:
        Error code string (e.g., "ERR_1003")
        Returns "ERR_9001" (SERVER_ERROR) if key not found
    
    Usage:
        error_code = get_error_code("INVALID_PASSWORD")  # Returns "ERR_1003"
        error_code = get_error_code("USER_NOT_FOUND")    # Returns "ERR_1001"
    """
    return ERROR_CODES.get(key, "ERR_9001")
