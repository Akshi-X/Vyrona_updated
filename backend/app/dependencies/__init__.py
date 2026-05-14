"""Dependencies package for FastAPI dependency injection"""
from .auth_dependencies import (
    validate_login_request,
    validate_registration_request,
    validate_otp_verification,
    get_validated_user,
    validate_get_user_request,
    validate_approve_user_request,
    validate_reject_user_request
)

__all__ = [
    'validate_login_request',
    'validate_registration_request',
    'validate_otp_verification',
    'get_validated_user',
    'validate_get_user_request',
    'validate_approve_user_request',
    'validate_reject_user_request'
]

