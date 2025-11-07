"""
Custom Exception Classes for the Application

These exceptions follow industry standards:
- Clear hierarchy
- Specific error codes
- Meaningful messages
- HTTP status codes
- Easy to catch and handle
"""

from typing import Optional, Dict, Any
from datetime import datetime

from ..constants.status_constants import STATUS_FAILED
from ..constants.error_codes import ERROR_CODES
from ..constants.messages import ErrorMessages


class AppException(Exception):
    """Base exception for all application errors"""
    
    def __init__(
        self,
        message: str,
        error_code: str,
        status_code: int = 500,
        details: Optional[Dict[str, Any]] = None
    ):
        self.message = message
        self.error_code = error_code
        self.status_code = status_code
        self.details = details or {}
        self.timestamp = datetime.utcnow()
        super().__init__(self.message)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert exception to dictionary for API response"""
        return {
            "error_code": self.error_code,
            "message": self.message,
            "status": STATUS_FAILED,
            "timestamp": self.timestamp.isoformat(),
            **self.details
        }


# ============================================
# AUTHENTICATION EXCEPTIONS
# ============================================

class AuthenticationException(AppException):
    """Base exception for authentication errors"""
    
    def __init__(self, message: str, error_code: str, status_code: int = 401, **kwargs):
        super().__init__(message, error_code, status_code, kwargs)


class UserNotFoundException(AuthenticationException):
    """User not found in the system"""
    
    def __init__(self, email: Optional[str] = None, user_id: Optional[str] = None):
        details = {}
            
        super().__init__(
            message=ErrorMessages.INVALID_USER_OR_EMAIL,
            error_code=ERROR_CODES["USER_NOT_FOUND"],
            status_code=400
        )


class UserNotApprovedException(AuthenticationException):
    """User account is not approved yet"""
    
    def __init__(self, user_id: str):
        super().__init__(
            message=ErrorMessages.USER_NOT_APPROVED,
            error_code=ERROR_CODES["USER_NOT_APPROVED"],
            status_code=403,
            user_id=user_id
        )


class InvalidCredentialsException(AuthenticationException):
    """Invalid login credentials"""
    
    def __init__(self, email: str, attempts_remaining: Optional[int] = None):
        message = ErrorMessages.INVALID_CREDENTIALS
        if attempts_remaining is not None:
            message = f"{message}. {attempts_remaining} attempts remaining before account lock."
        
        super().__init__(
            message=message,
            error_code=ERROR_CODES["INVALID_PASSWORD"],
            status_code=401,
            email=email,
            attempts_remaining=attempts_remaining
        )


class AccountLockedException(AuthenticationException):
    """Account is locked due to too many failed login attempts"""
    
    def __init__(self, user_id: str, unlock_time: Optional[datetime], minutes_remaining: int):
        unlock_time_str = unlock_time.isoformat() if unlock_time else None
        
        super().__init__(
            message=f"Account is locked due to multiple failed login attempts. Please try again after {minutes_remaining} minutes.",
            error_code=ERROR_CODES["ACCOUNT_LOCKED"],
            status_code=403,
            user_id=user_id,
            unlock_time=unlock_time_str,
            minutes_remaining=minutes_remaining
        )


class AccountInactiveException(AuthenticationException):
    """Account is inactive (status = False)"""
    
    def __init__(self, user_id: str):
        super().__init__(
            message="Your account has been deactivated. Please contact support.",
            error_code=ERROR_CODES["ACCOUNT_REJECTED"],
            status_code=403,
            user_id=user_id
        )


# ============================================
# OTP EXCEPTIONS
# ============================================

class OTPException(AppException):
    """Base exception for OTP-related errors"""
    
    def __init__(self, message: str, error_code: str, status_code: int = 400, **kwargs):
        super().__init__(message, error_code, status_code, kwargs)


class InvalidOTPException(OTPException):
    """Invalid or incorrect OTP code"""
    
    def __init__(self, user_id: str):
        super().__init__(
            message=ErrorMessages.OTP_EXPIRED,
            error_code=ERROR_CODES["INVALID_OTP"],
            status_code=400,
            user_id=user_id
        )


class OTPExpiredException(OTPException):
    """OTP has expired"""
    
    def __init__(self, user_id: str):
        super().__init__(
            message=ErrorMessages.OTP_EXPIRED,
            error_code=ERROR_CODES["OTP_EXPIRED"],
            status_code=400,
            user_id=user_id
        )


class OTPSendFailedException(OTPException):
    """Failed to send OTP to user"""
    
    def __init__(self, email: str, reason: Optional[str] = None):
        super().__init__(
            message=ErrorMessages.OTP_SEND_FAILED,
            error_code=ERROR_CODES["OTP_SEND_FAILED"],
            status_code=500,
            email=email,
            reason=reason
        )


class OTPUserNotFoundException(OTPException):
    """User not found during OTP verification"""
    
    def __init__(self, user_id: str):
        super().__init__(
            message=ErrorMessages.USER_NOT_FOUND,
            error_code=ERROR_CODES["OTP_USER_NOT_FOUND"],
            status_code=404,
            user_id=user_id
        )


# ============================================
# RESEND OTP EXCEPTIONS
# ============================================

class ResendOTPInvalidUserException(OTPException):
    """Invalid user ID or email for resend OTP"""
    
    def __init__(self, user_id: str, email: str):
        super().__init__(
            message=ErrorMessages.INVALID_USER_OR_EMAIL,
            error_code=ERROR_CODES["RESEND_INVALID_USER"],
            status_code=400,
            user_id=user_id,
            email=email
        )


class ResendOTPUserNotApprovedException(OTPException):
    """User not approved for resend OTP"""
    
    def __init__(self, user_id: str):
        super().__init__(
            message=ErrorMessages.USER_NOT_APPROVED,
            error_code=ERROR_CODES["RESEND_USER_NOT_APPROVED"],
            status_code=403,
            user_id=user_id
        )


class ResendOTPFailedException(OTPException):
    """Failed to resend OTP"""
    
    def __init__(self, email: str, reason: Optional[str] = None):
        super().__init__(
            message=ErrorMessages.OTP_SEND_FAILED,
            error_code=ERROR_CODES["RESEND_OTP_FAILED"],
            status_code=500,
            email=email,
            reason=reason
        )


# ============================================
# USER MANAGEMENT EXCEPTIONS
# ============================================

class UserManagementException(AppException):
    """Base exception for user management errors"""
    
    def __init__(self, message: str, error_code: str, status_code: int = 400, **kwargs):
        super().__init__(message, error_code, status_code, kwargs)


class UserGetNotFoundException(UserManagementException):
    """User not found in GET operation"""
    
    def __init__(self, registration_id: str):
        super().__init__(
            message="User not found",
            error_code=ERROR_CODES["USER_GET_NOT_FOUND"],
            status_code=404,
            registration_id=registration_id
        )


class UserApproveNotFoundException(UserManagementException):
    """User not found in APPROVE operation"""
    
    def __init__(self, registration_id: str):
        super().__init__(
            message="User not found",
            error_code=ERROR_CODES["APPROVE_USER_NOT_FOUND"],
            status_code=404,
            registration_id=registration_id
        )


class UserRejectNotFoundException(UserManagementException):
    """User not found in REJECT operation"""
    
    def __init__(self, registration_id: str):
        super().__init__(
            message=ErrorMessages.USER_NOT_FOUND,
            error_code=ERROR_CODES["REJECT_USER_NOT_FOUND"],
            status_code=404,
            registration_id=registration_id
        )


class UserUpdateNotFoundException(UserManagementException):
    """User not found in UPDATE operation"""
    
    def __init__(self, user_id: str):
        super().__init__(
            message=ErrorMessages.USER_NOT_FOUND,
            error_code=ERROR_CODES["UPDATE_USER_NOT_FOUND"],
            status_code=404,
            user_id=user_id
        )


class UserUpdateForbiddenException(UserManagementException):
    """User not allowed to update another user's profile"""
    
    def __init__(self, user_id: str):
        super().__init__(
            message="You can only update your own profile. Access denied to update another user's information.",
            error_code=ERROR_CODES["UPDATE_USER_FORBIDDEN"],
            status_code=403,
            user_id=user_id
        )


# ============================================
# REGISTRATION EXCEPTIONS
# ============================================

class RegistrationException(AppException):
    """Base exception for registration errors"""
    
    def __init__(self, message: str, error_code: str, status_code: int = 400, **kwargs):
        super().__init__(message, error_code, status_code, kwargs)


class EmailAlreadyExistsException(RegistrationException):
    """Email already registered"""
    
    def __init__(self, email: str):
        super().__init__(
            message=ErrorMessages.EMAIL_ALREADY_EXISTS,
            error_code=ERROR_CODES["EMAIL_ALREADY_EXISTS"],
            status_code=409,
            email=email
        )


class PasswordMismatchException(RegistrationException):
    """Passwords do not match"""
    
    def __init__(self):
        super().__init__(
            message=ErrorMessages.PASSWORD_MISMATCH,
            error_code=ERROR_CODES["PASSWORD_MISMATCH"],
            status_code=400
        )


class RegistrationEmailFailedException(RegistrationException):
    """Failed to send registration approval email"""
    
    def __init__(self, email: str, reason: str = "Email service unavailable"):
        super().__init__(
            message=f"{ErrorMessages.REGISTRATION_EMAIL_FAILED}. Please try again later.",
            error_code=ERROR_CODES["REGISTRATION_EMAIL_FAILED"],
            status_code=500,
            email=email,
            reason=reason
        )


# ============================================
# DATABASE EXCEPTIONS
# ============================================

class DatabaseException(AppException):
    """Database operation failed"""
    
    def __init__(self, message: str, error_code: str, status_code: int = 500, **kwargs):
        super().__init__(message, error_code, status_code, kwargs)


# ============================================
# EMAIL SERVICE EXCEPTIONS
# ============================================

class EmailServiceException(AppException):
    """Email service operation failed"""
    
    def __init__(self, recipient: str, reason: Optional[str] = None):
        super().__init__(
            message="Failed to send email",
            error_code=ERROR_CODES["EMAIL_SMTP_FAILED"],
            status_code=503,
            details={"recipient": recipient, "reason": reason}
        )


class TemplateNotFoundException(AppException):
    """Email template not found"""
    
    def __init__(self, template_name: str):
        super().__init__(
            message=f"Email template '{template_name}' not found",
            error_code=ERROR_CODES["EMAIL_TEMPLATE_NOT_FOUND"],
            status_code=500,
            details={"template_name": template_name}
        )


class TemplateRenderException(AppException):
    """Email template rendering failed"""
    
    def __init__(self, template_name: str, reason: Optional[str] = None):
        super().__init__(
            message=f"Failed to render email template '{template_name}'",
            error_code=ERROR_CODES["EMAIL_TEMPLATE_RENDER_FAILED"],
            status_code=500,
            details={"template_name": template_name, "reason": reason}
        )


# ============================================
# TOKEN EXCEPTIONS
# ============================================

class TokenException(AppException):
    """Base exception for token-related errors"""
    
    def __init__(self, message: str, error_code: str, status_code: int = 401, **kwargs):
        super().__init__(message, error_code, status_code, kwargs)


class InvalidTokenException(TokenException):
    """Invalid or malformed token"""
    
    def __init__(self):
        super().__init__(
            message=ErrorMessages.INVALID_TOKEN,
            error_code=ERROR_CODES["TOKEN_INVALID"],
            status_code=401
        )


class TokenExpiredException(TokenException):
    """Token has expired"""
    
    def __init__(self):
        super().__init__(
            message=ErrorMessages.TOKEN_EXPIRED,
            error_code=ERROR_CODES["TOKEN_EXPIRED"],
            status_code=401
        )


class UserFromTokenNotFoundException(TokenException):
    """User not found from token"""
    
    def __init__(self, user_id: str):
        super().__init__(
            message=ErrorMessages.USER_NOT_FOUND,
            error_code=ERROR_CODES["TOKEN_INVALID"],
            status_code=401,
            user_id=user_id
        )


# ============================================
# PASSWORD RESET EXCEPTIONS
# ============================================

class PasswordResetException(AppException):
    """Base exception for password reset errors"""
    
    def __init__(self, message: str, error_code: str, status_code: int = 400, **kwargs):
        super().__init__(message, error_code, status_code, kwargs)


class PasswordResetUserNotFoundException(PasswordResetException):
    """User not found during password reset"""
    
    def __init__(self, email: str):
        super().__init__(
            message=ErrorMessages.RESET_USER_NOT_FOUND,
            error_code=ERROR_CODES["RESET_USER_NOT_FOUND"],
            status_code=404,
            email=email
        )


class InvalidResetTokenException(PasswordResetException):
    """Invalid or expired password reset token"""
    
    def __init__(self):
        super().__init__(
            message=ErrorMessages.RESET_TOKEN_INVALID,
            error_code=ERROR_CODES["RESET_TOKEN_INVALID"],
            status_code=400
        )


class ResetTokenExpiredException(PasswordResetException):
    """Password reset token has expired"""
    
    def __init__(self):
        super().__init__(
            message=ErrorMessages.RESET_TOKEN_EXPIRED,
            error_code=ERROR_CODES["RESET_TOKEN_EXPIRED"],
            status_code=400
        )


class PasswordResetFailedException(PasswordResetException):
    """Failed to reset password"""
    
    def __init__(self, reason: Optional[str] = None):
        super().__init__(
            message=ErrorMessages.PASSWORD_RESET_FAILED,
            error_code=ERROR_CODES["PASSWORD_RESET_FAILED"],
            status_code=500,
            reason=reason
        )


class PasswordResetRateLimitException(PasswordResetException):
    """Too many password reset requests"""
    
    def __init__(self, email: str, retry_after_minutes: int):
        super().__init__(
            message=f"{ErrorMessages.RESET_RATE_LIMIT} (retry after {retry_after_minutes} minutes)",
            error_code=ERROR_CODES["RESET_RATE_LIMIT"],
            status_code=429,
            email=email,
            retry_after_minutes=retry_after_minutes
        )


class ResetPasswordMismatchException(PasswordResetException):
    """New password and confirm password don't match"""
    
    def __init__(self):
        super().__init__(
            message=ErrorMessages.RESET_PASSWORD_MISMATCH,
            error_code=ERROR_CODES["RESET_PASSWORD_MISMATCH"],
            status_code=400
        )


class ResetWeakPasswordException(PasswordResetException):
    """Password doesn't meet security requirements"""
    
    def __init__(self, reason: str):
        super().__init__(
            message=f"{ErrorMessages.RESET_WEAK_PASSWORD}: {reason}",
            error_code=ERROR_CODES["RESET_WEAK_PASSWORD"],
            status_code=400,
            reason=reason
        )


class ResetUserNotApprovedException(PasswordResetException):
    """User account not approved yet - cannot reset password"""
    
    def __init__(self, email: str):
        super().__init__(
            message=ErrorMessages.RESET_USER_NOT_APPROVED,
            error_code=ERROR_CODES["RESET_USER_NOT_APPROVED"],
            status_code=403,
            email=email
        )


class ResetAccountLockedException(PasswordResetException):
    """Account is locked - cannot reset password"""
    
    def __init__(self, email: str):
        super().__init__(
            message=ErrorMessages.RESET_ACCOUNT_LOCKED,
            error_code=ERROR_CODES["RESET_ACCOUNT_LOCKED"],
            status_code=403,
            email=email
        )


# ============================================
# DATABASE EXCEPTIONS (Extended)
# ============================================

class IntegrityConstraintException(AppException):
    """Database integrity constraint violation (e.g., duplicate email)"""
    
    def __init__(self, constraint: str, details: Optional[str] = None):
        super().__init__(
            message=f"Database constraint violation: {constraint}",
            error_code=ERROR_CODES["EMAIL_ALREADY_EXISTS"],
            status_code=409,
            details={"constraint": constraint, "details": details}
        )


class DatabaseQueryException(AppException):
    """Database query failed"""
    
    def __init__(self, operation: str, reason: Optional[str] = None, custom_message: Optional[str] = None, status_code: int = 500):
        message = custom_message if custom_message else f"Database query failed: {operation}"
        super().__init__(
            message=message,
            error_code=ERROR_CODES["DB_QUERY_FAILED"],
            status_code=status_code,
            details={"operation": operation, "reason": reason}
        )


# ============================================
# AUTHORIZATION EXCEPTIONS (403 Forbidden)
# ============================================

class AuthorizationException(AppException):
    """Base exception for authorization errors (403)"""
    
    def __init__(self, message: str, error_code: str, **kwargs):
        super().__init__(message, error_code, status_code=403, details=kwargs)


class AuthenticationRequiredException(AppException):
    """User authentication required (401)"""
    
    def __init__(self):
        super().__init__(
            message=ErrorMessages.AUTHENTICATION_REQUIRED,
            error_code=ERROR_CODES["TOKEN_REQUIRED"],
            status_code=401
        )


class AdminRoleRequiredException(AuthorizationException):
    """Admin role required for this operation"""
    
    def __init__(self, user_role: str):
        super().__init__(
            message=ErrorMessages.ADMIN_ROLE_REQUIRED,
            error_code=ERROR_CODES["ACCESS_FORBIDDEN"],
            user_role=user_role,
            required_role="admin"
        )


class ManagerRoleRequiredException(AuthorizationException):
    """Manager role required for this operation"""
    
    def __init__(self, user_role: str):
        super().__init__(
            message=ErrorMessages.MANAGER_ROLE_REQUIRED,
            error_code=ERROR_CODES["ACCESS_FORBIDDEN"],
            user_role=user_role,
            required_role="manager"
        )


class UserRoleRequiredException(AuthorizationException):
    """User role required for this operation"""
    
    def __init__(self, user_role: str):
        super().__init__(
            message=ErrorMessages.USER_ROLE_REQUIRED,
            error_code=ERROR_CODES["ACCESS_FORBIDDEN"],
            user_role=user_role,
            required_role="user"
        )


class InsufficientPermissionsException(AuthorizationException):
    """User doesn't have required permissions"""
    
    def __init__(self, user_role: str, required_roles: list):
        super().__init__(
            message=f"Access forbidden. Required roles: {', '.join(required_roles)}",
            error_code=ERROR_CODES["ACCESS_FORBIDDEN"],
            user_role=user_role,
            required_roles=required_roles
        )


class CompanyAccessForbiddenException(AuthorizationException):
    """User cannot access data from another company (multi-tenant)"""
    
    def __init__(self, user_company: str, target_company: str):
        super().__init__(
            message=ErrorMessages.COMPANY_DATA_ONLY,
            error_code=ERROR_CODES["ACCESS_FORBIDDEN"],
            user_company=user_company,
            target_company=target_company
        )


class ManagerApprovalOnlyException(AuthorizationException):
    """Only managers can approve users"""
    
    def __init__(self, user_role: str):
        super().__init__(
            message=ErrorMessages.MANAGER_APPROVE_ONLY,
            error_code=ERROR_CODES["ACCESS_FORBIDDEN"],
            user_role=user_role
        )


class ManagerShipmentManagementOnlyException(AuthorizationException):
    """Only managers can manage shipments"""
    
    def __init__(self, user_role: str):
        super().__init__(
            message=ErrorMessages.MANAGER_MANAGE_SHIPMENTS_ONLY,
            error_code=ERROR_CODES["ACCESS_FORBIDDEN"],
            user_role=user_role
        )


# ============================================
# FEEDBACK SYSTEM EXCEPTIONS
# ============================================

class FeedbackException(AppException):
    """Base exception for feedback system errors"""
    
    def __init__(self, message: str, error_code: str, status_code: int = 400, **kwargs):
        super().__init__(message, error_code, status_code, kwargs)


# ============================================
# FEEDBACK CREATION EXCEPTIONS
# ============================================

class FeedbackCreateFailedException(FeedbackException):
    """Failed to create feedback ticket"""
    
    def __init__(self, reason: Optional[str] = None):
        
        super().__init__(
            message=ErrorMessages.FEEDBACK_CREATE_FAILED,
            error_code=ERROR_CODES["FEEDBACK_CREATE_FAILED"],
            status_code=500,
            reason=reason
        )


class FeedbackInvalidDataException(FeedbackException):
    """Invalid feedback data provided"""
    
    def __init__(self, field: Optional[str] = None, reason: Optional[str] = None):
        
        message = ErrorMessages.FEEDBACK_INVALID_DATA
        if field:
            message = f"{message}. Invalid field: {field}"
        if reason:
            message = f"{message}. Reason: {reason}"
        
        super().__init__(
            message=message,
            error_code=ERROR_CODES["FEEDBACK_INVALID_DATA"],
            status_code=400,
            field=field,
            reason=reason
        )


class FeedbackAttachmentTooLargeException(FeedbackException):
    """File attachment exceeds maximum size limit"""
    
    def __init__(self, file_size_mb: float, max_size_mb: float):
        
        super().__init__(
            message=f"{ErrorMessages.FEEDBACK_ATTACHMENT_TOO_LARGE}. File size: {file_size_mb:.1f}MB, Maximum allowed: {max_size_mb}MB",
            error_code=ERROR_CODES["FEEDBACK_ATTACHMENT_TOO_LARGE"],
            status_code=413,
            file_size_mb=file_size_mb,
            max_size_mb=max_size_mb
        )


class FeedbackAttachmentInvalidTypeException(FeedbackException):
    """File attachment type not allowed"""
    
    def __init__(self, file_extension: str, allowed_extensions: list):
        
        super().__init__(
            message=f"{ErrorMessages.FEEDBACK_ATTACHMENT_INVALID_TYPE}. File type: {file_extension}, Allowed types: {', '.join(allowed_extensions)}",
            error_code=ERROR_CODES["FEEDBACK_ATTACHMENT_INVALID_TYPE"],
            status_code=400,
            file_extension=file_extension,
            allowed_extensions=allowed_extensions
        )


class FeedbackAttachmentSaveFailedException(FeedbackException):
    """Failed to save file attachment"""
    
    def __init__(self, filename: str, reason: Optional[str] = None):
        
        message = f"{ErrorMessages.FEEDBACK_ATTACHMENT_SAVE_FAILED}. File: {filename}"
        if reason:
            message = f"{message}. Reason: {reason}"
        
        super().__init__(
            message=message,
            error_code=ERROR_CODES["FEEDBACK_ATTACHMENT_SAVE_FAILED"],
            status_code=500,
            filename=filename,
            reason=reason
        )


class FeedbackTicketIdGenerationFailedException(FeedbackException):
    """Failed to generate unique ticket ID"""
    
    def __init__(self, reason: Optional[str] = None):
        
        super().__init__(
            message=ErrorMessages.FEEDBACK_TICKET_ID_GENERATION_FAILED,
            error_code=ERROR_CODES["FEEDBACK_TICKET_ID_GENERATION_FAILED"],
            status_code=500,
            reason=reason
        )


# ============================================
# FEEDBACK RETRIEVAL EXCEPTIONS
# ============================================

class FeedbackNotFoundException(FeedbackException):
    """Feedback ticket not found"""
    
    def __init__(self, feedback_id: Optional[int] = None, ticket_id: Optional[str] = None):
        
        details = {}
        if feedback_id:
            details["feedback_id"] = feedback_id
        if ticket_id:
            details["ticket_id"] = ticket_id
        
        super().__init__(
            message=ErrorMessages.FEEDBACK_NOT_FOUND,
            error_code=ERROR_CODES["FEEDBACK_NOT_FOUND"],
            status_code=404,
            **details
        )


class FeedbackAccessDeniedException(FeedbackException):
    """Access denied to feedback ticket"""
    
    def __init__(self, feedback_id: int, user_id: str, reason: Optional[str] = None):
        
        super().__init__(
            message=ErrorMessages.FEEDBACK_ACCESS_DENIED,
            error_code=ERROR_CODES["FEEDBACK_ACCESS_DENIED"],
            status_code=403,
            feedback_id=feedback_id,
            user_id=user_id,
            reason=reason
        )


class FeedbackFilterInvalidException(FeedbackException):
    """Invalid filter parameters for feedback query"""
    
    def __init__(self, invalid_filters: list, reason: Optional[str] = None):
        
        message = f"{ErrorMessages.FEEDBACK_FILTER_INVALID}. Invalid filters: {', '.join(invalid_filters)}"
        if reason:
            message = f"{message}. Reason: {reason}"
        
        super().__init__(
            message=message,
            error_code=ERROR_CODES["FEEDBACK_FILTER_INVALID"],
            status_code=400,
            invalid_filters=invalid_filters,
            reason=reason
        )


class FeedbackUserNotFoundException(FeedbackException):
    """User not found for feedback operation"""
    
    def __init__(self, user_id: str):
        
        super().__init__(
            message=ErrorMessages.FEEDBACK_USER_NOT_FOUND,
            error_code=ERROR_CODES["FEEDBACK_USER_NOT_FOUND"],
            status_code=404,
            user_id=user_id
        )


# ============================================
# FEEDBACK COMMENT EXCEPTIONS
# ============================================

class FeedbackCommentCreateFailedException(FeedbackException):
    """Failed to create comment on feedback ticket"""
    
    def __init__(self, feedback_id: int, reason: Optional[str] = None):
        
        super().__init__(
            message=ErrorMessages.FEEDBACK_COMMENT_CREATE_FAILED,
            error_code=ERROR_CODES["FEEDBACK_COMMENT_CREATE_FAILED"],
            status_code=500,
            feedback_id=feedback_id,
            reason=reason
        )


class FeedbackCommentNotFoundException(FeedbackException):
    """Comment not found"""
    
    def __init__(self, comment_id: int):
        
        super().__init__(
            message=ErrorMessages.FEEDBACK_COMMENT_NOT_FOUND,
            error_code=ERROR_CODES["FEEDBACK_COMMENT_NOT_FOUND"],
            status_code=404,
            comment_id=comment_id
        )


class FeedbackCommentInvalidException(FeedbackException):
    """Invalid comment data"""
    
    def __init__(self, field: Optional[str] = None, reason: Optional[str] = None):
        
        message = ErrorMessages.FEEDBACK_COMMENT_INVALID
        if field:
            message = f"{message}. Invalid field: {field}"
        if reason:
            message = f"{message}. Reason: {reason}"
        
        super().__init__(
            message=message,
            error_code=ERROR_CODES["FEEDBACK_COMMENT_INVALID"],
            status_code=400,
            field=field,
            reason=reason
        )


class FeedbackCommentAccessDeniedException(FeedbackException):
    """Access denied to comment"""
    
    def __init__(self, comment_id: int, user_id: str):
        
        super().__init__(
            message=ErrorMessages.FEEDBACK_COMMENT_ACCESS_DENIED,
            error_code=ERROR_CODES["FEEDBACK_COMMENT_ACCESS_DENIED"],
            status_code=403,
            comment_id=comment_id,
            user_id=user_id
        )


# ============================================
# FEEDBACK STATUS UPDATE EXCEPTIONS
# ============================================

class FeedbackStatusUpdateFailedException(FeedbackException):
    """Failed to update feedback status"""
    
    def __init__(self, feedback_id: int, reason: Optional[str] = None):
        
        super().__init__(
            message=ErrorMessages.FEEDBACK_STATUS_UPDATE_FAILED,
            error_code=ERROR_CODES["FEEDBACK_STATUS_UPDATE_FAILED"],
            status_code=500,
            feedback_id=feedback_id,
            reason=reason
        )


class FeedbackStatusInvalidException(FeedbackException):
    """Invalid status value for feedback"""
    
    def __init__(self, status: str, valid_statuses: list):
        
        super().__init__(
            message=f"{ErrorMessages.FEEDBACK_STATUS_INVALID}. Provided: {status}, Valid values: {', '.join(valid_statuses)}",
            error_code=ERROR_CODES["FEEDBACK_STATUS_INVALID"],
            status_code=400,
            status=status,
            valid_statuses=valid_statuses
        )


class FeedbackStatusAccessDeniedException(FeedbackException):
    """Access denied to update feedback status"""
    
    def __init__(self, feedback_id: int, user_id: str, current_status: str):
        
        super().__init__(
            message=ErrorMessages.FEEDBACK_STATUS_ACCESS_DENIED,
            error_code=ERROR_CODES["FEEDBACK_STATUS_ACCESS_DENIED"],
            status_code=403,
            feedback_id=feedback_id,
            user_id=user_id,
            current_status=current_status
        )


class FeedbackStatusAlreadySetException(FeedbackException):
    """Status is already set to the requested value"""
    
    def __init__(self, feedback_id: int, status: str):
        
        super().__init__(
            message=f"{ErrorMessages.FEEDBACK_STATUS_ALREADY_SET}. Status: {status}",
            error_code=ERROR_CODES["FEEDBACK_STATUS_ALREADY_SET"],
            status_code=400,
            feedback_id=feedback_id,
            status=status
        )


# ============================================
# FEEDBACK EMAIL NOTIFICATION EXCEPTIONS
# ============================================

class FeedbackEmailSendFailedException(FeedbackException):
    """Failed to send feedback notification email"""
    
    def __init__(self, email_type: str, recipient: str, reason: Optional[str] = None):
        
        super().__init__(
            message=f"{ErrorMessages.FEEDBACK_EMAIL_SEND_FAILED}. Type: {email_type}, Recipient: {recipient}",
            error_code=ERROR_CODES["FEEDBACK_EMAIL_SEND_FAILED"],
            status_code=500,
            email_type=email_type,
            recipient=recipient,
            reason=reason
        )


class FeedbackEmailTemplateErrorException(FeedbackException):
    """Email template error for feedback notification"""
    
    def __init__(self, template_name: str, reason: Optional[str] = None):
        
        super().__init__(
            message=f"{ErrorMessages.FEEDBACK_EMAIL_TEMPLATE_ERROR}. Template: {template_name}",
            error_code=ERROR_CODES["FEEDBACK_EMAIL_TEMPLATE_ERROR"],
            status_code=500,
            template_name=template_name,
            reason=reason
        )


class FeedbackEmailRecipientInvalidException(FeedbackException):
    """Invalid email recipient for feedback notification"""
    
    def __init__(self, recipient: str, reason: Optional[str] = None):
        
        super().__init__(
            message=f"{ErrorMessages.FEEDBACK_EMAIL_RECIPIENT_INVALID}. Recipient: {recipient}",
            error_code=ERROR_CODES["FEEDBACK_EMAIL_RECIPIENT_INVALID"],
            status_code=400,
            recipient=recipient,
            reason=reason
        )

# ============================================
# TASK EXCEPTIONS
# ============================================

class TaskException(AppException):
    """Base exception for task-related errors"""

    def __init__(self, message: str, error_code: str, status_code: int = 400, **kwargs):
        super().__init__(message, error_code, status_code, kwargs)


class TaskCreateFailedException(TaskException):
    """Failed to create task"""

    def __init__(self, reason: Optional[str] = None):
        super().__init__(
            message=ErrorMessages.TASK_CREATE_FAILED,
            error_code=ERROR_CODES["TASK_CREATE_FAILED"],
            status_code=500,
            reason=reason
        )


class TaskNotFoundException(TaskException):
    """Task not found"""

    def __init__(self, task_id: int):
        super().__init__(
            message=ErrorMessages.TASK_NOT_FOUND,
            error_code=ERROR_CODES["TASK_NOT_FOUND"],
            status_code=404,
            task_id=task_id
        )


class TaskInvalidAssigneeException(TaskException):
    """Invalid assignee user for task"""

    def __init__(self, user_id: str):
        super().__init__(
            message=ErrorMessages.TASK_INVALID_ASSIGNEE,
            error_code=ERROR_CODES["TASK_INVALID_ASSIGNEE"],
            status_code=400,
            user_id=user_id
        )


class TaskInvalidPatientException(TaskException):
    """Invalid patient ID for task"""

    def __init__(self, patient_id: str):
        super().__init__(
            message=ErrorMessages.TASK_INVALID_PATIENT,
            error_code=ERROR_CODES["TASK_INVALID_PATIENT"],
            status_code=400,
            patient_id=patient_id
        )


class TaskUpdateFailedException(TaskException):
    """Failed to update task"""

    def __init__(self, task_id: int, reason: Optional[str] = None):
        super().__init__(
            message=ErrorMessages.TASK_UPDATE_FAILED,
            error_code=ERROR_CODES["TASK_UPDATE_FAILED"],
            status_code=500,
            task_id=task_id,
            reason=reason
        )


class TaskDeleteFailedException(TaskException):
    """Failed to delete task"""

    def __init__(self, task_id: int, reason: Optional[str] = None):
        super().__init__(
            message=ErrorMessages.TASK_DELETE_FAILED,
            error_code=ERROR_CODES["TASK_DELETE_FAILED"],
            status_code=500,
            task_id=task_id,
            reason=reason
        )


class TaskUnauthorizedEditException(TaskException):
    """User not authorized to edit this task"""

    def __init__(self, task_id: int, user_id: str):
        super().__init__(
            message=ErrorMessages.TASK_UNAUTHORIZED_EDIT,
            error_code=ERROR_CODES["TASK_UNAUTHORIZED_EDIT"],
            status_code=403,
            task_id=task_id,
            user_id=user_id
        )


class TaskUnauthorizedStatusException(TaskException):
    """User not authorized to change task status"""

    def __init__(self, task_id: int, user_id: str):
        super().__init__(
            message=ErrorMessages.TASK_UNAUTHORIZED_STATUS,
            error_code=ERROR_CODES["TASK_UNAUTHORIZED_STATUS"],
            status_code=403,
            task_id=task_id,
            user_id=user_id
        )


class TaskManagerOnlyException(TaskException):
    """Only managers can create tasks"""

    def __init__(self, user_role: str):
        super().__init__(
            message=ErrorMessages.TASK_MANAGER_ONLY,
            error_code=ERROR_CODES["TASK_MANAGER_ONLY"],
            status_code=403,
            user_role=user_role
        )


# ============================================
# CHAT EXCEPTIONS
# ============================================

class ChatException(AppException):
    """Base exception for chat-related errors"""
    def __init__(self, message: str, error_code: str, status_code: int = 400, **kwargs):
        # Forward extra keyword args as structured details
        super().__init__(message, error_code, status_code, kwargs)


class ChatMessageCreateFailedException(ChatException):
    """Failed to create chat message"""

    def __init__(self, reason: Optional[str] = None):
        super().__init__(
            message=ErrorMessages.CHAT_MESSAGE_CREATE_FAILED,
            error_code=ERROR_CODES["CHAT_MESSAGE_CREATE_FAILED"],
            status_code=500,
            reason=reason
        )


class ChatMessageNotFoundException(ChatException):
    """Chat message not found"""

    def __init__(self, message_id: Optional[int] = None):
        super().__init__(
            message=ErrorMessages.CHAT_MESSAGE_NOT_FOUND,
            error_code=ERROR_CODES["CHAT_MESSAGE_NOT_FOUND"],
            status_code=404,
            message_id=message_id
        )


class ChatUserNotFoundException(ChatException):
    """Chat user not found"""

    def __init__(self, user_id: Optional[str] = None):
        super().__init__(
            message=ErrorMessages.CHAT_USER_NOT_FOUND,
            error_code=ERROR_CODES["CHAT_USER_NOT_FOUND"],
            status_code=404,
            user_id=user_id
        )


class ChatPatientNotFoundException(ChatException):
    """Patient not found"""

    def __init__(self, patient_id: Optional[str] = None):
        super().__init__(
            message=ErrorMessages.CHAT_PATIENT_NOT_FOUND,
            error_code=ERROR_CODES["CHAT_PATIENT_NOT_FOUND"],
            status_code=404,
            patient_id=patient_id
        )


class ChatPharmaAccessDeniedException(ChatException):
    """Access denied - users not in same pharma"""

    def __init__(self, reason: Optional[str] = None):
        super().__init__(
            message=ErrorMessages.CHAT_PHARMA_ACCESS_DENIED,
            error_code=ERROR_CODES["CHAT_PHARMA_ACCESS_DENIED"],
            status_code=403,
            reason=reason
        )


class ChatInvalidDataException(ChatException):
    """Invalid chat data"""

    def __init__(self, reason: Optional[str] = None, custom_message: Optional[str] = None):
        # Use custom message if provided, otherwise use default
        message = custom_message if custom_message else ErrorMessages.CHAT_INVALID_DATA
        super().__init__(
            message=message,
            error_code=ERROR_CODES["CHAT_INVALID_DATA"],
            status_code=400,
            reason=reason
        )


class ChatWebSocketInvalidMessageException(ChatException):
    """Invalid WebSocket message format"""

    def __init__(self, reason: Optional[str] = None):
        super().__init__(
            message=ErrorMessages.CHAT_WEBSOCKET_INVALID_MESSAGE,
            error_code=ERROR_CODES["CHAT_WEBSOCKET_INVALID_MESSAGE"],
            status_code=400,
            reason=reason
        )


class ChatWebSocketInvalidTypeException(ChatException):
    """Invalid WebSocket message type"""

    def __init__(self, message_type: Optional[str] = None):
        super().__init__(
            message=ErrorMessages.CHAT_WEBSOCKET_INVALID_TYPE,
            error_code=ERROR_CODES["CHAT_WEBSOCKET_INVALID_TYPE"],
            status_code=400,
            message_type=message_type
        )


class ChatWebSocketAuthFailedException(ChatException):
    """WebSocket authentication failed"""

    def __init__(self, reason: Optional[str] = None):
        super().__init__(
            message=ErrorMessages.CHAT_WEBSOCKET_AUTH_FAILED,
            error_code=ERROR_CODES["CHAT_WEBSOCKET_AUTH_FAILED"],
            status_code=401,
            reason=reason
        )