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
    OTP_VALIDATION_ERROR = "Invalid or expired OTP"
    
    # Password Reset
    RESET_USER_NOT_FOUND = "If your email is registered, a password reset link has been sent."
    RESET_TOKEN_INVALID = "Invalid or expired password reset link. Please request a new one"
    RESET_TOKEN_EXPIRED = "Password reset link has expired. Please request a new one"
    PASSWORD_RESET_FAILED = "Failed to reset password. Please try again"
    RESET_RATE_LIMIT = "Too many password reset requests. Please try again later"
    RESET_PASSWORD_MISMATCH = "Passwords do not match"
    RESET_WEAK_PASSWORD = "Password does not meet security requirements"
    RESET_USER_NOT_APPROVED = "Your account is not approved yet. Cannot reset password"
    RESET_ACCOUNT_LOCKED = "Your account is locked. Please contact support"
    
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
    INVALID_REQUEST_DATA = "Invalid request data"
    VALIDATION_INPUT_ERROR = "Input validation failed"
    INTERNAL_SERVER_ERROR = "Internal server error occurred"
    
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
    
    # Feedback System
    FEEDBACK_CREATE_FAILED = "Failed to create feedback ticket"
    FEEDBACK_INVALID_DATA = "Invalid feedback data provided"
    FEEDBACK_ATTACHMENT_TOO_LARGE = "File size exceeds maximum allowed size"
    FEEDBACK_ATTACHMENT_INVALID_TYPE = "File type not allowed"
    FEEDBACK_ATTACHMENT_SAVE_FAILED = "Failed to save attachment"
    FEEDBACK_TICKET_ID_GENERATION_FAILED = "Failed to generate ticket ID"
    FEEDBACK_NOT_FOUND = "Feedback ticket not found"
    FEEDBACK_ACCESS_DENIED = "Access denied to feedback ticket"
    FEEDBACK_FILTER_INVALID = "Invalid filter parameters"
    FEEDBACK_USER_NOT_FOUND = "User not found for feedback operation"
    FEEDBACK_COMMENT_CREATE_FAILED = "Failed to create comment"
    FEEDBACK_COMMENT_NOT_FOUND = "Comment not found"
    FEEDBACK_COMMENT_INVALID = "Invalid comment data"
    FEEDBACK_COMMENT_ACCESS_DENIED = "Access denied to comment"
    FEEDBACK_STATUS_UPDATE_FAILED = "Failed to update feedback status"
    FEEDBACK_STATUS_INVALID = "Invalid status value"
    FEEDBACK_STATUS_ACCESS_DENIED = "Access denied to update status"
    
    FEEDBACK_STATUS_ALREADY_SET = "Status is already set to this value"
    FEEDBACK_EMAIL_SEND_FAILED = "Failed to send feedback notification email"
    FEEDBACK_EMAIL_TEMPLATE_ERROR = "Email template error for feedback notification"
    FEEDBACK_EMAIL_RECIPIENT_INVALID = "Invalid email recipient for feedback notification"
    
    # Quality Monitoring
    REDIS_CONNECTION_ERROR = "Redis connection failed. Please check Redis server status"
    QUALITY_DATA_NOT_FOUND = "Quality data not found"
    QUALITY_SERVICE_ERROR = "Quality monitoring service error"
    
    # General
    INTERNAL_ERROR = "An internal server error occurred"
    NOT_FOUND = "Resource not found"
    BAD_REQUEST = "Bad request"
    TOO_MANY_REQUESTS = "Too many requests. Please try again later"
    AUTHENTICATION_VALIDATION_FAILED = "Authentication validation failed"
    AUTHENTICATION_ERROR = "Authentication error"

    # Patient Stage
    PATIENT_STAGE_NOT_FOUND = "No stage information found for this patient"
    PATIENT_STAGE_LOOKUP_FAILED = "Failed to retrieve patient stage"
    
    # Patient
    PATIENT_NOT_FOUND = "Patient not found"
    SHIPMENT_NOT_STARTED = "Patient is in transportation stage but shipment has not started"
    
    # Shipment
    SHIPMENT_3PL_PLAYER_DETAILS_ERROR = "Error getting 3PL player details"
    SHIPMENT_ACTIVE_ROUTES_ERROR = "Error getting active routes"
    SHIPMENT_TRANSPORT_TIME_COMPARISON_ERROR = "Error getting transport time comparison"
    SHIPMENT_PATIENT_JOURNEY_SUMMARY_ERROR = "Error getting patient journey summary"
    SHIPMENT_CARRIERS_ERROR = "Error getting carriers"
    SHIPMENT_REGIONS_ERROR = "Error getting available regions"
    SHIPMENT_CONTROL_TOWER_MAP_ERROR = "Error getting control tower map data"
    SHIPMENT_METRICS_ERROR = "Error calculating real-time metrics"
    SHIPMENT_SUMMARY_BUILD_ERROR = "Error building shipment summary"
    SHIPMENT_REENGINEERING_STAGE_ERROR = "Error getting reengineering stage"

    # Task Management
    TASK_CREATE_FAILED = "Failed to create task"
    TASK_NOT_FOUND = "Task not found"
    TASK_INVALID_ASSIGNEE = "Invalid assignee user"
    TASK_INVALID_PATIENT = "Invalid patient ID for task"
    TASK_UPDATE_FAILED = "Failed to update task"
    TASK_DELETE_FAILED = "Failed to delete task"
    TASK_UNAUTHORIZED_EDIT = "You are not authorized to edit this task"
    TASK_UNAUTHORIZED_STATUS = "You are not authorized to change this task's status"
    TASK_MANAGER_ONLY = "Only managers can create tasks"
    
    # Chat System
    CHAT_MESSAGE_CREATE_FAILED = "Failed to create chat message"
    CHAT_MESSAGE_NOT_FOUND = "Chat message not found"
    CHAT_USER_NOT_FOUND = "User not found"
    CHAT_PATIENT_NOT_FOUND = "Patient not found"
    CHAT_PHARMA_ACCESS_DENIED = "Access denied - users must be in same pharma"
    CHAT_INVALID_DATA = "Invalid chat data"
    CHAT_CANNOT_TAG_SELF = "You cannot tag yourself in a message"
    CHAT_WEBSOCKET_INVALID_MESSAGE = "Invalid WebSocket message format"
    CHAT_WEBSOCKET_INVALID_TYPE = "Invalid message type"
    CHAT_WEBSOCKET_AUTH_FAILED = "WebSocket authentication failed"
    CHAT_WEBSOCKET_CONNECTION_FAILED = "WebSocket connection failed"


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
    
    # Feedback System
    FEEDBACK_CREATED = "Feedback ticket created successfully"
    FEEDBACK_COMMENT_ADDED = "Comment added successfully"
    FEEDBACK_STATUS_UPDATED = "Feedback status updated successfully"
    FEEDBACK_RETRIEVED = "Feedback retrieved successfully"
    # Password Reset
    PASSWORD_RESET_EMAIL_SENT = "Password reset link has been sent to your email"
    PASSWORD_RESET_SUCCESS = "Password reset successful. Please login with your new password"
    
 # Task Management
    TASK_CREATED = "Task created successfully"
    TASK_UPDATED = "Task updated successfully"
    TASK_STATUS_UPDATED = "Task status updated successfully"
    TASK_DELETED = "Task deleted successfully"
    TASK_RETRIEVED = "Task retrieved successfully"
    TASKS_RETRIEVED = "Tasks retrieved successfully"


class InfoMessages:
    PENDING_APPROVAL = "Your registration is pending admin approval"
    CHECK_EMAIL = "Please check your email"
    
    # Shipment
    SHIPMENT_ACTIVE_ROUTES_NOT_AVAILABLE = "Active routes not available"

