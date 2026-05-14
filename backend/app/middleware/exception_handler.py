"""
Global Exception Handler Middleware

This middleware catches all exceptions and converts them to proper HTTP responses.
Industry-standard approach for clean error handling.
"""

import logging
import traceback
from fastapi import Request, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError, HTTPException
from pydantic import ValidationError
from datetime import datetime

from ..exceptions.custom_exceptions import AppException
from ..exceptions.patient_exceptions import PatientException
from ..constants.error_codes import ERROR_CODES
from ..constants.status_constants import STATUS_FAILED
from ..constants.messages import ErrorMessages
from ..constants.app_constants import COMMON_API_HEADERS
from ..service.health_service import get_health_response

# Paths excluded from validation error handling — request passes through to the route
EXCLUDED_VALIDATION_PATHS = ("/health",)

# Setup logger
logger = logging.getLogger(__name__)


def _is_excluded_path(path: str) -> bool:
    """Return True if path should skip validation error responses (e.g. return real health from service)."""
    return path in EXCLUDED_VALIDATION_PATHS


def _health_response():
    """Return 200 JSON with real health data from health_service (same as main.py route)."""
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content=get_health_response(),
        headers=COMMON_API_HEADERS
    )


async def exception_handler_middleware(request: Request, call_next):
    """
    Global exception handler middleware
    
    Catches all exceptions and converts them to proper JSON responses.
    /health is excluded: no try/except, request goes straight to the route.
    """
    # Exclude health — let the request hit the route and return real data from main.py
    if _is_excluded_path(request.url.path):
        return await call_next(request)

    try:
        response = await call_next(request)
        return response
        
    except AppException as exc:
        # Handle our custom exceptions
        logger.error(
            f"AppException: {exc.error_code} - {exc.message}",
            extra={
                "error_code": exc.error_code,
                "status_code": exc.status_code,
                "details": exc.details,
                "path": request.url.path,
                "method": request.method
            }
        )
        return JSONResponse(
            status_code=exc.status_code,
            content=exc.to_dict(),
            headers=COMMON_API_HEADERS
        )

    except PatientException as exc:
        # Handle patient-specific exceptions
        logger.error(
            f"PatientException: {exc.error_code} - {exc.message}",
            extra={
                "error_code": exc.error_code,
                "status_code": exc.status_code,
                "details": exc.details,
                "path": request.url.path,
                "method": request.method
            }
        )
        return JSONResponse(
            status_code=exc.status_code,
            content=exc.to_dict(),
            headers=COMMON_API_HEADERS
        )

    except ValidationError as exc:
        # Handle Pydantic validation errors
        logger.warning(
            f"Pydantic validation error on {request.url.path}: {str(exc)}",
            extra={"errors": exc.errors()}
        )
        
        # Check if it's an OTP-related error based on the path and error details
        error_message = str(exc).lower()
        is_otp_endpoint = "/verify-otp" in request.url.path
        
        logger.info(f"Error message: {error_message}")
        logger.info(f"Is OTP endpoint: {is_otp_endpoint}")
        
        if is_otp_endpoint and any(keyword in error_message for keyword in ['role', 'field required']):
            # This is likely an OTP verification failure
            logger.info("Returning OTP error response")
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content={
                    "error_code": ERROR_CODES["OTP_VALIDATION_ERROR"],
                    "message": ErrorMessages.OTP_VALIDATION_ERROR,
                    "status": STATUS_FAILED,
                    "timestamp": datetime.utcnow().isoformat()
                },
                headers=COMMON_API_HEADERS
            )
        else:
            # Exclude health: return same payload as main.py health route (from health_service)
            if _is_excluded_path(request.url.path):
                return _health_response()
            # Generic validation error
            logger.info("Returning generic validation error response")
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content={
                    "error_code": ERROR_CODES["INVALID_REQUEST_DATA"],
                    "message": ErrorMessages.INVALID_REQUEST_DATA,
                    "status": STATUS_FAILED,
                    "timestamp": datetime.utcnow().isoformat()
                },
                headers=COMMON_API_HEADERS
            )
        
    except Exception as exc:
        # Handle unexpected exceptions
        error_id = f"ERR-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
        
        logger.critical(
            f"Unhandled exception [{error_id}]: {str(exc)}",
            extra={
                "error_id": error_id,
                "path": request.url.path,
                "method": request.method,
                "exception_type": type(exc).__name__,
                "traceback": traceback.format_exc()
            }
        )
        
        # Check if it's a ValidationError that wasn't caught
        if isinstance(exc, ValidationError):
            logger.warning("ValidationError caught in general exception handler - this should not happen")
            if _is_excluded_path(request.url.path):
                return _health_response()
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content={
                    "error_code": ERROR_CODES["INVALID_REQUEST_DATA"],
                    "message": ErrorMessages.INVALID_REQUEST_DATA,
                    "status": STATUS_FAILED,
                    "timestamp": datetime.utcnow().isoformat()
                },
                headers=COMMON_API_HEADERS
            )
        
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "error_code": ERROR_CODES["SERVER_ERROR"],
                "message": ErrorMessages.INTERNAL_SERVER_ERROR,
                "status": STATUS_FAILED,
                "error_id": error_id,
                "timestamp": datetime.utcnow().isoformat()
            },
            headers=COMMON_API_HEADERS
        )


def setup_exception_handlers(app):
    """
    Setup exception handlers for specific FastAPI exceptions
    """
    
    @app.exception_handler(AppException)
    async def app_exception_handler(request: Request, exc: AppException):
        """Handle custom application exceptions"""
        logger.error(
            f"AppException: {exc.error_code} - {exc.message}",
            extra={
                "error_code": exc.error_code,
                "path": request.url.path,
                "method": request.method
            }
        )
        return JSONResponse(
            status_code=exc.status_code,
            content=exc.to_dict(),
            headers=COMMON_API_HEADERS
        )

    @app.exception_handler(PatientException)
    async def patient_exception_handler(request: Request, exc: PatientException):
        """Handle patient domain exceptions"""
        logger.error(
            f"PatientException: {exc.error_code} - {exc.message}",
            extra={
                "error_code": exc.error_code,
                "path": request.url.path,
                "method": request.method
            }
        )
        return JSONResponse(
            status_code=exc.status_code,
            content=exc.to_dict(),
            headers=COMMON_API_HEADERS
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        """Handle Pydantic validation errors"""
        logger.warning(
            f"Validation error on {request.url.path}",
            extra={"errors": exc.errors()}
        )
        
        # Extract user-friendly error message
        error_messages = []
        for error in exc.errors():
            field = ".".join(str(loc) for loc in error["loc"])
            error_msg = error.get("msg", "")
            
            # Check for model_validator errors (these have "__root__" or empty loc)
            if not field or field == "__root__" or "body" not in field:
                # This is likely a model_validator error - use the message directly
                if error_msg:
                    error_messages.append(error_msg)
                else:
                    error_messages.append(str(error))
            elif field == "body.email":
                error_messages.append("Please provide a valid email address")
            elif field == "body.password":
                error_messages.append("Password is required")
            elif field == "body.first_name":
                error_messages.append("First name is required")
            elif field == "body.last_name":
                error_messages.append("Last name is required")
            elif field == "body.role":
                error_messages.append("Please select a valid role")
            elif field == "body.company_name":
                error_messages.append("Company name is required")
            else:
                # Use the error message if available, otherwise generic
                if error_msg:
                    error_messages.append(error_msg)
                else:
                    error_messages.append(f"Invalid {field}")
        
        # Use the first error message or a generic one
        user_message = error_messages[0] if error_messages else "Please check your input and try again"
        
        # Exclude health: return same payload as main.py health route (from health_service)
        if _is_excluded_path(request.url.path):
            return _health_response()

        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "error_code": ERROR_CODES["VALIDATION_INPUT_ERROR"],
                "message": user_message,
                "status": STATUS_FAILED,
                "timestamp": datetime.utcnow().isoformat()
            },
            headers=COMMON_API_HEADERS
        )
    
    @app.exception_handler(ValidationError)
    async def pydantic_validation_handler(request: Request, exc: ValidationError):
        """Handle Pydantic validation errors (not FastAPI RequestValidationError)"""
        logger.warning(
            f"Pydantic validation error on {request.url.path}",
            extra={"errors": exc.errors()}
        )
        
        # Check if it's an OTP-related error based on the path and error details
        error_message = str(exc).lower()
        is_otp_endpoint = "/verify-otp" in request.url.path
        
        if is_otp_endpoint and any(keyword in error_message for keyword in ['role', 'field required']):
            # This is likely an OTP verification failure
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content={
                    "error_code": ERROR_CODES["OTP_VALIDATION_ERROR"],
                    "message": ErrorMessages.OTP_VALIDATION_ERROR,
                    "status": STATUS_FAILED,
                    "timestamp": datetime.utcnow().isoformat()
                },
                headers=COMMON_API_HEADERS
            )
        if _is_excluded_path(request.url.path):
            return _health_response()
        # Generic validation error
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={
                "error_code": ERROR_CODES["INVALID_REQUEST_DATA"],
                "message": ErrorMessages.INVALID_REQUEST_DATA,
                "status": STATUS_FAILED,
                "timestamp": datetime.utcnow().isoformat()
            },
            headers=COMMON_API_HEADERS
        )
    
    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException):
        """Handle FastAPI HTTP exceptions"""
        logger.warning(
            f"HTTP {exc.status_code} on {request.url.path}: {exc.detail}"
        )
        
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error_code": f"HTTP_{exc.status_code}",
                "message": exc.detail,
                "status": STATUS_FAILED,
                "timestamp": datetime.utcnow().isoformat()
            },
            headers=COMMON_API_HEADERS
        )
    
    @app.exception_handler(Exception)
    async def general_exception_handler(request: Request, exc: Exception):
        """Handle all other exceptions"""
        error_id = f"ERR-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
        
        logger.critical(
            f"Unhandled exception [{error_id}]: {str(exc)}",
            extra={
                "error_id": error_id,
                "path": request.url.path,
                "method": request.method,
                "traceback": traceback.format_exc()
            }
        )
        
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "error_code": ERROR_CODES["SERVER_ERROR"],
                "message": ErrorMessages.INTERNAL_SERVER_ERROR,
                "status": STATUS_FAILED,
                "error_id": error_id,
                "timestamp": datetime.utcnow().isoformat()
            },
            headers=COMMON_API_HEADERS
        )

