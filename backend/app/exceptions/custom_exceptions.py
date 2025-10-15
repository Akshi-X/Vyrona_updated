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
    
    def __init__(self, operation: str, reason: Optional[str] = None):
        super().__init__(
            message=f"Database query failed: {operation}",
            error_code=ERROR_CODES["DB_QUERY_FAILED"],
            status_code=500,
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

