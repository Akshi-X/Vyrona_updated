
"""
Request Validation Middleware

Validates requests before reaching controllers.
"""

import json
import logging
from typing import Callable
from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from datetime import datetime, timezone
from ..constants.status_constants import STATUS_FAILED
from ..constants.messages import ErrorMessages
from ..constants.error_codes import ERROR_CODES
from ..config.database import SessionLocal
from ..exceptions import AppException, PasswordMismatchException
from ..dependencies.auth_dependencies import (
    validate_login_request,
    validate_get_user_request,
    validate_approve_user_request,
    validate_reject_user_request
)
from ..utils.utils import create_error_response
from ..exceptions.custom_exceptions import AppException
from ..constants.enums import FeedbackDepartment, FeedbackType, FeedbackPriority, AffectedModule

# Setup logger
logger = logging.getLogger(__name__)


class RequestValidationMiddleware(BaseHTTPMiddleware):
    """Validates requests before they reach controllers."""
    
    async def dispatch(self, request: Request, call_next: Callable):
        # Get path and method
        path = request.url.path
        method = request.method
        
        # Only validate specific endpoints
        if method == "POST":
            # Validate based on endpoint
            if path == "/api/login":
                response = await self._validate_login(request)
                if response:
                    return response  # Validation failed, return error
            
            # Registration validation handled by Pydantic schema + dependency
            
            elif path == "/api/verify-otp":
                response = await self._validate_otp(request)
                if response:
                    return response  # Validation failed, return error
            
            elif path == "/api/resend-otp":
                response = await self._validate_resend_otp(request)
                if response:
                    return response  # Validation failed, return error
            
            elif path == "/api/user/approve":
                response = await self._validate_approve_user(request)
                if response:
                    return response  # Validation failed, return error
            
            elif path == "/api/user/reject":
                response = await self._validate_reject_user(request)
                if response:
                    return response  # Validation failed, return error
            
            # fastapi handle directly
        
        elif method == "GET":
            # Validate GET endpoints
            if path.startswith("/api/user/") and path != "/api/user/approve" and path != "/api/user/reject":
                # Extract user_id from path /api/user/{user_id}
                parts = path.split("/")
                if len(parts) == 4:  # /api/user/{user_id}
                    user_id = parts[3]
                    response = await self._validate_get_user(request, user_id)
                    if response:
                        return response  # Validation failed, return error
        
        # Validation passed (or endpoint doesn't need validation)
        # Continue to controller
        response = await call_next(request)
        return response
    
    async def _validate_login(self, request: Request):
        """Validate login request."""
        try:
            body = await request.body()
            request._body = body  # Store for controller to use
            data = json.loads(body)
            
            email = data.get("email")
            password = data.get("password")
            
            if not email or not password:
                return create_error_response(
                    status_code=400,
                    error_code="VAL_INPUT_001",
                    message=ErrorMessages.EMAIL_AND_PASSWORD_REQUIRED
                )
            
            # Validate using dependency function
            db = SessionLocal()
            try:
                user = validate_login_request(email, password, db)
                # Attach validated user to request state
                request.state.validated_user = user
                request.state.db = db
                return None  # Validation passed
            except AppException as e:
                # Catch custom exceptions and return proper JSON
                db.close()
                return create_error_response(
                    status_code=e.status_code,
                    error_code=e.error_code,
                    message=e.message,
                    details=e.details  # Add any extra details (like remaining_attempts)
                )
            except Exception as e:
                db.close()
                return create_error_response(
                    status_code=500,
                    error_code="GEN_SERVER_001",
                    message=ErrorMessages.INTERNAL_ERROR
                )
                
        except Exception as e:
            return create_error_response(
                status_code=500,
                error_code="GEN_SERVER_001",
                message=ErrorMessages.INTERNAL_ERROR
            )
    
    async def _validate_registration(self, request: Request):
        """Validate registration request."""
        try:
            print("Validating registration request in middleware...")
            body = await request.body()
            request._body = body
            data = json.loads(body)
            
            print(f"Registration data: email={data.get('email')}, role={data.get('role')}")
            
            if data.get("password") != data.get("confirm_password"):
                print("Password mismatch detected")
                raise PasswordMismatchException()
            
            print("Middleware validation passed, continuing to controller...")
            # Additional validation done in dependency
            return None  # Let controller handle rest
            
        except AppException as e:
            # Catch custom exceptions and return proper JSON
            print(f"AppException in middleware: {e.error_code} - {e.message}")
            return create_error_response(
                status_code=e.status_code,
                error_code=e.error_code,
                message=e.message,
                details=e.details
            )
        except Exception as e:
            print(f"Unexpected exception in registration middleware: {type(e).__name__}: {str(e)}")
            import traceback
            traceback.print_exc()
            return create_error_response(
                status_code=500,
                error_code="GEN_SERVER_001",
                message=ErrorMessages.INTERNAL_ERROR
            )
    
    async def _validate_otp(self, request: Request):
        """Validate OTP verification BEFORE controller - catches ALL exceptions"""
        try:
            body = await request.body()
            request._body = body
            data = json.loads(body)
            
            user_id = data.get("user_id")
            otp = data.get("otp")
            
            if not user_id or not otp:
                return create_error_response(
                    status_code=400,
                    error_code="VAL_INPUT_001",
                    message=ErrorMessages.USER_ID_AND_OTP_REQUIRED
                )
            
            return None  # Validation passed, continue to controller
            
        except AppException as e:
            return create_error_response(
                status_code=e.status_code,
                error_code=e.error_code,
                message=e.message,
                details=e.details
            )
        except Exception as e:
            return create_error_response(
                status_code=500,
                error_code="GEN_SERVER_001",
                message=ErrorMessages.INTERNAL_ERROR
            )
    
    async def _validate_resend_otp(self, request: Request):
        """Validate resend OTP request."""
        try:
            body = await request.body()
            request._body = body
            data = json.loads(body)
            
            user_id = data.get("user_id")
            email = data.get("email")
            
            if not user_id or not email:
                return create_error_response(
                    status_code=400,
                    error_code="VAL_INPUT_001",
                    message=ErrorMessages.USER_ID_AND_EMAIL_REQUIRED
                )
            
            return None  # Validation passed, continue to controller
            
        except AppException as e:
            return create_error_response(
                status_code=e.status_code,
                error_code=e.error_code,
                message=e.message,
                details=e.details
            )
        except Exception as e:
            return create_error_response(
                status_code=500,
                error_code="GEN_SERVER_001",
                message=ErrorMessages.INTERNAL_ERROR
            )
    
    async def _validate_get_user(self, request: Request, user_id: str):
        """Validate get user request."""
        db = SessionLocal()
        try:
            target_user = validate_get_user_request(user_id, db)
            request.state.validated_target_user = target_user
            request.state.validation_db = db
            return None
        except AppException as e:
            db.close()
            return JSONResponse(
                status_code=e.status_code,
                content=e.to_dict(),
                headers={
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Credentials": "true",
                    "Access-Control-Allow-Methods": "*",
                    "Access-Control-Allow-Headers": "*",
                }
            )
        except Exception as e:
            db.close()
            return JSONResponse(
                status_code=500,
                content={
                    "error_code": "SERVER_ERROR",
                    "message": f"Validation error: {str(e)}",
                    "status": STATUS_FAILED,
                    "timestamp": datetime.now(timezone.utc).isoformat()
                },
                headers={
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Credentials": "true",
                    "Access-Control-Allow-Methods": "*",
                    "Access-Control-Allow-Headers": "*",
                }
            )
    
    async def _validate_approve_user(self, request: Request):
        """Validate approve user request."""
        try:
            body = await request.body()
            request._body = body
            data = json.loads(body)
            
            registration_id = data.get("registration_id")
            if not registration_id:
                return JSONResponse(
                    status_code=400,
                    content={
                        "error_code": "VAL_INPUT_001",
                        "message": "registration_id is required",
                        "status": STATUS_FAILED,
                        "timestamp": datetime.now(timezone.utc).isoformat()
                    },
                    headers={
                        "Access-Control-Allow-Origin": "*",
                        "Access-Control-Allow-Credentials": "true",
                        "Access-Control-Allow-Methods": "*",
                        "Access-Control-Allow-Headers": "*",
                    }
                )
            
            db = SessionLocal()
            try:
                target_user = validate_approve_user_request(registration_id, db)
                request.state.validated_target_user = target_user
                request.state.validation_db = db
                return None
            except AppException as e:
                db.close()
                return JSONResponse(
                    status_code=e.status_code,
                    content=e.to_dict(),
                    headers={
                        "Access-Control-Allow-Origin": "*",
                        "Access-Control-Allow-Credentials": "true",
                        "Access-Control-Allow-Methods": "*",
                        "Access-Control-Allow-Headers": "*",
                    }
                )
        except Exception as e:
            return JSONResponse(
                status_code=500,
                content={
                    "error_code": "SERVER_ERROR",
                    "message": f"Validation error: {str(e)}",
                    "status": STATUS_FAILED,
                    "timestamp": datetime.now(timezone.utc).isoformat()
                },
                headers={
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Credentials": "true",
                    "Access-Control-Allow-Methods": "*",
                    "Access-Control-Allow-Headers": "*",
                }
            )
    
    async def _validate_reject_user(self, request: Request):
        """Validate reject user request."""
        try:
            body = await request.body()
            request._body = body
            data = json.loads(body)
            
            registration_id = data.get("registration_id")
            if not registration_id:
                return JSONResponse(
                    status_code=400,
                    content={
                        "error_code": "VAL_INPUT_001",
                        "message": "registration_id is required",
                        "status": STATUS_FAILED,
                        "timestamp": datetime.now(timezone.utc).isoformat()
                    },
                    headers={
                        "Access-Control-Allow-Origin": "*",
                        "Access-Control-Allow-Credentials": "true",
                        "Access-Control-Allow-Methods": "*",
                        "Access-Control-Allow-Headers": "*",
                    }
                )
            
            db = SessionLocal()
            try:
                target_user = validate_reject_user_request(registration_id, db)
                request.state.validated_target_user = target_user
                request.state.validation_db = db
                return None
            except AppException as e:
                db.close()
                return JSONResponse(
                    status_code=e.status_code,
                    content=e.to_dict(),
                    headers={
                        "Access-Control-Allow-Origin": "*",
                        "Access-Control-Allow-Credentials": "true",
                        "Access-Control-Allow-Methods": "*",
                        "Access-Control-Allow-Headers": "*",
                    }
                )
        except Exception as e:
            return JSONResponse(
                status_code=500,
                content={
                    "error_code": "SERVER_ERROR",
                    "message": f"Validation error: {str(e)}",
                    "status": STATUS_FAILED,
                    "timestamp": datetime.now(timezone.utc).isoformat()
                },
                headers={
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Credentials": "true",
                    "Access-Control-Allow-Methods": "*",
                    "Access-Control-Allow-Headers": "*",
                }
            )
    
    async def _validate_feedback_creation(self, request: Request):
        """Validate feedback creation request."""
        
        try:
            # Handle multipart form data from frontend
            form_data = await request.form()
            
            # Extract data from direct form fields (frontend format)
            data = {}
            required_fields = ["department", "feedback_type", "subject", "description", "priority", "affected_modules"]
            
            # Get data from individual form fields
            for field in required_fields:
                if field in form_data:
                    data[field] = form_data[field]
            
            if not data:
                return JSONResponse(
                    status_code=400,
                    content={
                        "error_code": "VAL_INPUT_001",
                        "message": "Request data is required",
                        "status": STATUS_FAILED,
                        "timestamp": datetime.now(timezone.utc).isoformat()
                    }
                )
            
            # Validate required fields
            missing_fields = [field for field in required_fields if not data.get(field)]
            
            if missing_fields:
                return JSONResponse(
                    status_code=400,
                    content={
                        "error_code": "VAL_INPUT_001",
                        "message": f"Missing required fields: {', '.join(missing_fields)}",
                        "status": STATUS_FAILED,
                        "timestamp": datetime.now(timezone.utc).isoformat()
                    }
                )
            
            # Validate enum values
            try:
                department = FeedbackDepartment(data["department"])
                feedback_type = FeedbackType(data["feedback_type"])
                priority = FeedbackPriority(data["priority"])
                affected_modules = AffectedModule(data["affected_modules"])
            except ValueError as e:
                # Provide detailed error message with valid values
                return JSONResponse(
                    status_code=400,
                    content={
                        "error_code": "VAL_INPUT_001",
                        "message": f"Invalid enum value: {str(e)}",
                        "details": {
                            "valid_departments": FeedbackDepartment.list(),
                            "valid_types": FeedbackType.list(),
                            "valid_priorities": FeedbackPriority.list(),
                            "valid_modules": AffectedModule.list(),
                            "received_values": {
                                "department": data.get("department"),
                                "feedback_type": data.get("feedback_type"),
                                "priority": data.get("priority"),
                                "affected_modules": data.get("affected_modules")
                            }
                        },
                        "status": STATUS_FAILED,
                        "timestamp": datetime.now(timezone.utc).isoformat()
                    }
                )
            
            # Validate string lengths
            if len(data["subject"]) < 3:
                return JSONResponse(
                    status_code=400,
                    content={
                        "error_code": "VAL_INPUT_001",
                        "message": "Subject must be at least 3 characters long",
                        "status": STATUS_FAILED,
                        "timestamp": datetime.now(timezone.utc).isoformat()
                    }
                )
            
            if len(data["description"]) < 10:
                return JSONResponse(
                    status_code=400,
                    content={
                        "error_code": "VAL_INPUT_001",
                        "message": "Description must be at least 10 characters long",
                        "status": STATUS_FAILED,
                        "timestamp": datetime.now(timezone.utc).isoformat()
                    }
                )
            
            if len(data["subject"]) > 200:
                return JSONResponse(
                    status_code=400,
                    content={
                        "error_code": "VAL_INPUT_001",
                        "message": "Subject must be less than 200 characters",
                        "status": STATUS_FAILED,
                        "timestamp": datetime.now(timezone.utc).isoformat()
                    }
                )
            
            if len(data["description"]) > 2000:
                return JSONResponse(
                    status_code=400,
                    content={
                        "error_code": "VAL_INPUT_001",
                        "message": "Description must be less than 2000 characters",
                        "status": STATUS_FAILED,
                        "timestamp": datetime.now(timezone.utc).isoformat()
                    }
                )
            
            # Store validated data in request state for controller to use
            request.state.validated_feedback_data = {
                "department": department,
                "feedback_type": feedback_type,
                "subject": data["subject"].strip(),
                "description": data["description"].strip(),
                "priority": priority,
                "affected_modules": affected_modules
            }
            
            return None  # Validation passed
            
        except Exception as e:
            logger.error(f"Validation error in feedback creation: {str(e)}", exc_info=True)
            return JSONResponse(
                status_code=500,
                content={
                    "error_code": "GEN_SERVER_001",
                    "message": f"Validation error: {str(e)}",
                    "status": STATUS_FAILED,
                    "timestamp": datetime.now(timezone.utc).isoformat()
                }
            )
