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
from ..constants.error_codes import ERROR_CODES
from ..constants.status_constants import STATUS_FAILED
from ..constants.messages import ErrorMessages

# Setup logger
logger = logging.getLogger(__name__)


async def exception_handler_middleware(request: Request, call_next):
    """
    Global exception handler middleware
    
    Catches all exceptions and converts them to proper JSON responses:
    - Custom exceptions (AppException) → Structured error response
    - Uncaught exceptions → Internal server error with logging
    """
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
            content=exc.to_dict()
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
                    "error_code": "OTP_4001",
                    "message": "Invalid or expired OTP",
                    "status": STATUS_FAILED,
                    "timestamp": datetime.utcnow().isoformat()
                }
            )
        else:
            # Generic validation error
            logger.info("Returning generic validation error response")
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content={
                    "error_code": "VAL_4001",
                    "message": "Invalid request data",
                    "status": STATUS_FAILED,
                    "timestamp": datetime.utcnow().isoformat()
                }
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
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content={
                    "error_code": "VAL_4001",
                    "message": "Invalid request data",
                    "status": STATUS_FAILED,
                    "timestamp": datetime.utcnow().isoformat()
                }
            )
        
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "error_code": ERROR_CODES["SERVER_ERROR"],
                "message": "Internal server error occurred",
                "status": STATUS_FAILED,
                "error_id": error_id,
                "timestamp": datetime.utcnow().isoformat()
            }
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
            headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Credentials": "true",
                "Access-Control-Allow-Methods": "*",
                "Access-Control-Allow-Headers": "*",
            }
        )
    
    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        """Handle Pydantic validation errors"""
        logger.warning(
            f"Validation error on {request.url.path}",
            extra={"errors": exc.errors()}
        )
        
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "error_code": "VAL_INPUT_001",
                "message": ErrorMessages.VALIDATION_ERROR,
                "status": STATUS_FAILED,
                "details": exc.errors(),
                "timestamp": datetime.utcnow().isoformat()
            },
            headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Credentials": "true",
                "Access-Control-Allow-Methods": "*",
                "Access-Control-Allow-Headers": "*",
            }
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
                    "error_code": "OTP_4001",
                    "message": "Invalid or expired OTP",
                    "status": STATUS_FAILED,
                    "timestamp": datetime.utcnow().isoformat()
                },
                headers={
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Credentials": "true",
                    "Access-Control-Allow-Methods": "*",
                    "Access-Control-Allow-Headers": "*",
                }
            )
        else:
            # Generic validation error
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content={
                    "error_code": "VAL_4001",
                    "message": "Invalid request data",
                    "status": STATUS_FAILED,
                    "timestamp": datetime.utcnow().isoformat()
                },
                headers={
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Credentials": "true",
                    "Access-Control-Allow-Methods": "*",
                    "Access-Control-Allow-Headers": "*",
                }
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
            headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Credentials": "true",
                "Access-Control-Allow-Methods": "*",
                "Access-Control-Allow-Headers": "*",
            }
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
                "message": "Internal server error occurred",
                "status": STATUS_FAILED,
                "error_id": error_id,
                "timestamp": datetime.utcnow().isoformat()
            },
            headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Credentials": "true",
                "Access-Control-Allow-Methods": "*",
                "Access-Control-Allow-Headers": "*",
            }
        )

