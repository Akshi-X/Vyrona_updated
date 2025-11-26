"""
Application constants that are the SAME across all environments.
These are business logic constants, not configuration.
"""

# ============================================
# APPLICATION INFO
# ============================================
APP_NAME = "User Registration Approval System"
APP_VERSION = "1.0.0"
API_PREFIX = "/api"
API_V1_PREFIX = "/api/v1"

# ============================================
# AUTHENTICATION & SECURITY
# ============================================
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
REFRESH_TOKEN_EXPIRE_DAYS = 7

# Session Timeouts (Role-Based)
ADMIN_SESSION_TIMEOUT_MINUTES = 120  # Admins get 120 minutes
MANAGER_SESSION_TIMEOUT_MINUTES = 60  # Managers get 60 minutes
USER_SESSION_TIMEOUT_MINUTES = 30   # Users get 30 minutes
DEFAULT_SESSION_TIMEOUT_MINUTES = 30  # Fallback

# Remember Me Feature - Session Durations
# With Remember Me (remember_me=True):
#   - Token expires after 9 hours from login
REMEMBER_ME_SESSION_DURATION_MINUTES = 540  # 9 hours

# Without Remember Me (remember_me=False):
#   - Token expires after 1 hour from login
#   - Frontend (React) handles idle timeout detection
NO_REMEMBER_ME_SESSION_DURATION_MINUTES = 60  # 1 hour

# Account Locking (Brute Force Protection)
MAX_LOGIN_ATTEMPTS = 5  # Lock account after 5 failed attempts
ACCOUNT_LOCK_DURATION_MINUTES = 30  # Lock for 30 minutes
LOGIN_ATTEMPT_RESET_ON_SUCCESS = True  # Reset counter on successful login

# Password Policy
MIN_PASSWORD_LENGTH = 8
MAX_PASSWORD_LENGTH = 128
REQUIRE_UPPERCASE = True
REQUIRE_LOWERCASE = True
REQUIRE_DIGIT = True
REQUIRE_SPECIAL_CHAR = True
PASSWORD_SPECIAL_CHARS = "!@#$%^&*()_+-=[]{}|;:,.<>?"

# ============================================
# OTP CONFIGURATION
# ============================================
OTP_LENGTH = 6
OTP_EXPIRY_MINUTES = 10
OTP_MAX_ATTEMPTS = 3
OTP_CHARACTERS = "0123456789"  # Only digits

# ============================================
# PASSWORD RESET
# ============================================
PASSWORD_RESET_TOKEN_EXPIRY_MINUTES = 30
PASSWORD_RESET_RATE_LIMIT_MINUTES = 15  # Allow 1 request per 15 minutes

# ============================================
# USER & REGISTRATION
# ============================================
USER_ID_PREFIX = "USR"
REGISTRATION_ID_PREFIX = "REG"
ID_LENGTH = 6

# User Roles
ROLE_ADMIN = "Admin"
ROLE_MANAGER = "Manager"
ROLE_USER = "User"

# ============================================
# FILE UPLOAD
# ============================================
MAX_FILE_SIZE_MB = 5
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024
ALLOWED_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif"]
ALLOWED_DOCUMENT_EXTENSIONS = [".pdf", ".doc", ".docx"]
UPLOAD_DIR = "uploads"
STATIC_DIR = "static"

# ============================================
# RATE LIMITING
# ============================================
RATE_LIMIT_LOGIN_PER_MINUTE = 5
RATE_LIMIT_REGISTER_PER_HOUR = 3
RATE_LIMIT_OTP_PER_MINUTE = 3
RATE_LIMIT_API_PER_MINUTE = 100

# ============================================
# PAGINATION
# ============================================
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100

# ============================================
# DATABASE
# ============================================
DB_POOL_SIZE = 15
DB_MAX_OVERFLOW = 10
DB_POOL_TIMEOUT = 30
DB_POOL_RECYCLE = 3600
DB_ECHO = True  # SQL logging

# ============================================
# LOGGING
# ============================================
LOG_LEVEL = "INFO"
LOG_FILE = "logs/app.log"
LOG_MAX_BYTES = 10 * 1024 * 1024  # 10MB
LOG_BACKUP_COUNT = 5
LOG_FORMAT = "%(asctime)s - %(name)s - %(levelname)s - %(funcName)s:%(lineno)d - %(message)s"

# ============================================
# EMAIL TEMPLATES
# ============================================
EMAIL_APPROVAL_SUBJECT = "New User Registration Pending Approval"
EMAIL_OTP_SUBJECT = "Your Login OTP - myGrape"
EMAIL_WELCOME_SUBJECT = "Welcome to myGrape"
EMAIL_REJECTION_SUBJECT = "Registration Status Update"
EMAIL_PASSWORD_RESET_SUBJECT = "Reset Your Password - myGrape"
EMAIL_USER_APPROVED_SUBJECT = "Registration Approved - Welcome to myGrape!"

# Feedback Email Subjects
EMAIL_FEEDBACK_NEW_TICKET_SUBJECT = "New Support Ticket Created - myGrape"
EMAIL_FEEDBACK_STATUS_UPDATE_SUBJECT = "Ticket Status Update - myGrape"
EMAIL_FEEDBACK_NEW_COMMENT_SUBJECT = "New Comment Added to Ticket - myGrape"

# ============================================
# TIME ZONES
# ============================================
DEFAULT_TIMEZONE = "UTC"

# ============================================
# FEEDBACK SYSTEM
# ============================================
FEEDBACK_TICKET_PREFIX = "TK"
FEEDBACK_ID_LENGTH = 3  # For TK-YYYY-MM-001 format
FEEDBACK_MAX_ATTACHMENT_SIZE_MB = 10
FEEDBACK_MAX_ATTACHMENT_SIZE_BYTES = FEEDBACK_MAX_ATTACHMENT_SIZE_MB * 1024 * 1024
FEEDBACK_ALLOWED_ATTACHMENT_EXTENSIONS = [".pdf", ".doc", ".docx", ".txt", ".jpg", ".jpeg", ".png", ".xlsx", ".xls", ".csv", ".zip", ".rar"]
FEEDBACK_UPLOAD_DIR = "uploads/feedback"

# Feedback field validation limits
FEEDBACK_MAX_SUBJECT_LENGTH = 255
FEEDBACK_MAX_DESCRIPTION_LENGTH = 5000
FEEDBACK_MAX_COMMENT_LENGTH = 2000
FEEDBACK_MAX_SUBMITTED_BY_LENGTH = 255
FEEDBACK_MAX_CREATED_BY_LENGTH = 255
FEEDBACK_MAX_UPDATED_BY_LENGTH = 255

# Feedback pagination defaults
FEEDBACK_DEFAULT_PAGE_SIZE = 10
FEEDBACK_MAX_PAGE_SIZE = 100

# Feedback search and sorting
FEEDBACK_DEFAULT_SORT_FIELD = "submitted_on"
FEEDBACK_DEFAULT_SORT_ORDER = "desc"

# ============================================
# CHAT WEBSOCKET MESSAGE TYPES
# ============================================
# Client -> Server message types
WS_MSG_TYPE_SUBSCRIBE_PATIENT = "subscribe_patient"
WS_MSG_TYPE_UNSUBSCRIBE_PATIENT = "unsubscribe_patient"
WS_MSG_TYPE_SEND_MESSAGE = "send_message"
WS_MSG_TYPE_GET_PATIENT_MESSAGES = "get_patient_messages"
WS_MSG_TYPE_GET_UNREAD_MESSAGES = "get_unread_messages"
WS_MSG_TYPE_MARK_READ = "mark_read"

# Server -> Client message types
WS_MSG_TYPE_MESSAGE_SENT = "message_sent"
WS_MSG_TYPE_PATIENT_MESSAGES = "patient_messages"
WS_MSG_TYPE_UNREAD_MESSAGES = "unread_messages"
WS_MSG_TYPE_NEW_MESSAGE = "new_message"
WS_MSG_TYPE_ERROR = "error"
WS_MSG_TYPE_SUCCESS = "success"

# ============================================
# REGEX PATTERNS
# ============================================
EMAIL_REGEX = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
PHONE_REGEX = r'^\+?1?\d{9,15}$'

# ============================================
# QUALITY MONITORING
# ============================================
QUALITY_EXPORT_DEFAULT_MINUTES = 10

# ============================================
# COMMON API RESPONSE HEADERS
# ============================================
# Common headers used across all API responses for CORS and security
COMMON_API_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "*",
    "Access-Control-Allow-Headers": "*",
}

