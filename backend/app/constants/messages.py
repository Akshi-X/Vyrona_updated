"""
User-facing messages and error messages.
These should be version controlled.
"""


class ErrorMessages:
    # Authentication
    INVALID_CREDENTIALS = "Invalid email or password"
    UNAUTHORIZED = "You are not authorized to access this resource"
    USER_NOT_FOUND = "User not found"
    USER_NOT_APPROVED = "User account is not approved yet"
    USER_REJECTED = "Your registration has been rejected"
    USER_SUSPENDED = "Your account has been suspended"
    TOKEN_EXPIRED = "Your session has expired. Please login again"
    INVALID_TOKEN = "Invalid authentication token"
    TOKEN_MISSING = "Authorization token is missing"
    TOKEN_VALIDATION_FAILED = "Token validation failed"
    TOKEN_PAYLOAD_INVALID = "Token payload missing user_id"
    INVALID_AUTH_HEADER = "Invalid authorization header format. Expected: Bearer <token>"
    USER_FROM_TOKEN_NOT_FOUND = "User not found from token"
    ACCOUNT_DEACTIVATED = "Your account has been deactivated"
    ACCOUNT_APPROVAL_REVOKED = "Your account approval has been revoked"
    AUTHENTICATION_REQUIRED = "Authentication required"
    
    # OTP
    OTP_EXPIRED = "The OTP entered is incorrect or has expired"
    OTP_INVALID = "Invalid OTP. Please try again"
    OTP_SEND_FAILED = "Failed to send OTP. Please try again"
    OTP_MAX_ATTEMPTS = "Maximum OTP attempts exceeded. Please request a new OTP"
    
    # Registration
    EMAIL_ALREADY_EXISTS = "This email is already registered"
    PASSWORD_MISMATCH = "Passwords do not match"
    WEAK_PASSWORD = "Password does not meet security requirements"
    INVALID_EMAIL = "Please provide a valid email address"
    INVALID_ROLE = "Invalid role selected"
    INVALID_USER_OR_EMAIL = "Invalid user ID or email. OTP could not be sent"
    REGISTRATION_EMAIL_FAILED = "Registration failed: Unable to send approval email"
    
    # Validation
    REQUIRED_FIELD = "This field is required"
    INVALID_INPUT = "Invalid input provided"
    VALIDATION_ERROR = "Validation error"
    EMAIL_AND_PASSWORD_REQUIRED = "Email and password are required"
    USER_ID_AND_OTP_REQUIRED = "User ID and OTP are required"
    USER_ID_AND_EMAIL_REQUIRED = "User ID and email are required"
    
    # RBAC / Permissions
    ACCESS_FORBIDDEN = "Access forbidden"
    ADMIN_ROLE_REQUIRED = "Admin role required"
    MANAGER_ROLE_REQUIRED = "Manager role required"
    USER_ROLE_REQUIRED = "User role required"
    COMPANY_ACCESS_ONLY = "You can only view users from your company"
    COMPANY_DATA_ONLY = "Access forbidden. You can only access data from your company"
    MANAGER_APPROVE_ONLY = "Only managers can approve or reject users"
    MANAGER_MANAGE_SHIPMENTS_ONLY = "Only managers can create and manage shipments"
    
    # Email Service
    EMAIL_SEND_FAILED = "Failed to send email"
    EMAIL_TEMPLATE_NOT_FOUND = "Email template not found"
    EMAIL_TEMPLATE_RENDER_FAILED = "Failed to render email template"
    
    # Database
    DB_QUERY_FAILED = "Database query failed"
    DB_CONNECTION_FAILED = "Database connection failed"
    
    # General
    INTERNAL_ERROR = "An internal server error occurred"
    NOT_FOUND = "Resource not found"
    BAD_REQUEST = "Bad request"
    TOO_MANY_REQUESTS = "Too many requests. Please try again later"
    AUTHENTICATION_VALIDATION_FAILED = "Authentication validation failed"
    AUTHENTICATION_ERROR = "Authentication error"


class SuccessMessages:
    # Authentication
    LOGIN_SUCCESS = "Login successful"
    LOGOUT_SUCCESS = "Logged out successfully"
    
    # OTP
    OTP_SENT = "A one-time password (OTP) has been sent to your registered email"
    OTP_RESENT = "A new one-time password (OTP) has been sent to your registered email"
    OTP_VERIFIED = "OTP verified successfully. User is now logged in"
    
    # Registration
    REGISTRATION_SUCCESS = "Registration successful! Please wait for admin approval"
    REGISTRATION_SENT_TO_ADMIN = "Registration successful! Your request has been sent to MyGrape Admin for approval."
    REGISTRATION_SENT_TO_MANAGER = "Registration successful! Your request has been sent to your company manager for approval"
    REGISTRATION_SENT_TO_ADMIN_NO_MANAGER = "Registration successful! Your request has been sent to MyGrape Admin for approval (no company manager found yet)"
    REGISTRATION_EMAIL_FAILED = "Registration successful! However, approval email could not be sent. Please contact support"
    USER_APPROVED = "User approved successfully"
    USER_REJECTED = "User rejected successfully"
    
    # Profile
    PROFILE_UPDATED = "Profile updated successfully"
    PASSWORD_CHANGED = "Password changed successfully"


class InfoMessages:
    PENDING_APPROVAL = "Your registration is pending admin approval"
    CHECK_EMAIL = "Please check your email"

