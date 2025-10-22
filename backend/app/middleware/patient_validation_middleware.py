"""
Patient Request Validation Middleware

Validates patient-related requests before reaching controllers.
"""

import json
from typing import Callable
from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from datetime import datetime, timezone

from ..constants.status_constants import STATUS_FAILED
from ..constants.messages import ErrorMessages
from ..constants.error_codes import ERROR_CODES
from ..config.database import SessionLocal
from ..exceptions.patient_exceptions import (
    PatientValidationException,
    PatientNameValidationException,
    PatientConditionValidationException,
    PatientInsuranceValidationException
)


class PatientValidationMiddleware(BaseHTTPMiddleware):
    """Validates patient requests before they reach controllers."""
    
    async def dispatch(self, request: Request, call_next: Callable):
        # Get path and method
        path = request.url.path
        method = request.method
        
        # Only validate patient endpoints
        if "/api/patients" in path:
            # Validate based on endpoint and method
            if method == "POST" and path == "/api/patients/":
                response = await self._validate_patient_creation(request)
                if response:
                    return response  # Validation failed, return error
            
            elif method == "PUT" and "/api/patients/" in path:
                response = await self._validate_patient_update(request)
                if response:
                    return response  # Validation failed, return error
            
            elif method == "GET" and "/api/patients/search/advanced" in path:
                response = await self._validate_patient_search(request)
                if response:
                    return response  # Validation failed, return error
        
        # Continue to next middleware/controller
        return await call_next(request)
    
    async def _validate_patient_creation(self, request: Request):
        """Validate patient creation request."""
        try:
            body = await request.body()
            request._body = body
            data = json.loads(body)
            
            # Validate required fields
            if not data.get("patient_name"):
                raise PatientNameValidationException(
                    patient_name=data.get("patient_name", ""),
                    reason="Patient name is required"
                )
            
            if not data.get("condition"):
                raise PatientConditionValidationException(
                    condition=data.get("condition", ""),
                    reason="Patient condition is required"
                )
            
            # Validate field lengths
            patient_name = data.get("patient_name", "")
            if len(patient_name) > 255:
                raise PatientNameValidationException(
                    patient_name=patient_name,
                    reason="Patient name must be less than 255 characters"
                )
            
            condition = data.get("condition", "")
            if len(condition) > 500:
                raise PatientConditionValidationException(
                    condition=condition,
                    reason="Condition must be less than 500 characters"
                )
            
            # Validate insurance type if provided
            insurance_type = data.get("insurance_type")
            if insurance_type and insurance_type not in ["private", "public", "medicare", "medicaid", "self_pay"]:
                raise PatientInsuranceValidationException(
                    insurance_type=insurance_type,
                    reason="Invalid insurance type. Must be one of: private, public, medicare, medicaid, self_pay"
                )
            
            # Validate stage_id if provided
            stage_id = data.get("stage_id")
            if stage_id is not None and (not isinstance(stage_id, int) or stage_id < 1 or stage_id > 4):
                raise PatientValidationException(
                    field="stage_id",
                    reason="Stage ID must be an integer between 1 and 4"
                )
            
            # Validation passed, continue
            return None
            
        except PatientValidationException as e:
            return JSONResponse(
                status_code=e.status_code,
                content={
                    "status": STATUS_FAILED,
                    "error_code": e.error_code,
                    "message": e.message,
                    "details": e.details,
                    "timestamp": e.timestamp
                }
            )
        except json.JSONDecodeError:
            return JSONResponse(
                status_code=400,
                content={
                    "status": STATUS_FAILED,
                    "error_code": ERROR_CODES.get("VALIDATION_INVALID_FORMAT", "ERR_6002"),
                    "message": "Invalid JSON format",
                    "timestamp": datetime.now(timezone.utc).isoformat()
                }
            )
        except Exception as e:
            return JSONResponse(
                status_code=500,
                content={
                    "status": STATUS_FAILED,
                    "error_code": ERROR_CODES.get("SERVER_ERROR", "ERR_9001"),
                    "message": f"Validation error: {str(e)}",
                    "timestamp": datetime.now(timezone.utc).isoformat()
                }
            )
    
    async def _validate_patient_update(self, request: Request):
        """Validate patient update request."""
        try:
            body = await request.body()
            request._body = body
            data = json.loads(body)
            
            # Validate field lengths if provided
            patient_name = data.get("patient_name")
            if patient_name is not None:
                if not patient_name:
                    raise PatientNameValidationException(
                        patient_name=patient_name,
                        reason="Patient name cannot be empty"
                    )
                if len(patient_name) > 255:
                    raise PatientNameValidationException(
                        patient_name=patient_name,
                        reason="Patient name must be less than 255 characters"
                    )
            
            condition = data.get("condition")
            if condition is not None:
                if not condition:
                    raise PatientConditionValidationException(
                        condition=condition,
                        reason="Condition cannot be empty"
                    )
                if len(condition) > 500:
                    raise PatientConditionValidationException(
                        condition=condition,
                        reason="Condition must be less than 500 characters"
                    )
            
            # Validate insurance type if provided
            insurance_type = data.get("insurance_type")
            if insurance_type and insurance_type not in ["private", "public", "medicare", "medicaid", "self_pay"]:
                raise PatientInsuranceValidationException(
                    insurance_type=insurance_type,
                    reason="Invalid insurance type. Must be one of: private, public, medicare, medicaid, self_pay"
                )
            
            # Validate stage_id if provided
            stage_id = data.get("stage_id")
            if stage_id is not None and (not isinstance(stage_id, int) or stage_id < 1 or stage_id > 4):
                raise PatientValidationException(
                    field="stage_id",
                    reason="Stage ID must be an integer between 1 and 4"
                )
            
            # Validation passed, continue
            return None
            
        except PatientValidationException as e:
            return JSONResponse(
                status_code=e.status_code,
                content={
                    "status": STATUS_FAILED,
                    "error_code": e.error_code,
                    "message": e.message,
                    "details": e.details,
                    "timestamp": e.timestamp
                }
            )
        except json.JSONDecodeError:
            return JSONResponse(
                status_code=400,
                content={
                    "status": STATUS_FAILED,
                    "error_code": ERROR_CODES.get("VALIDATION_INVALID_FORMAT", "ERR_6002"),
                    "message": "Invalid JSON format",
                    "timestamp": datetime.now(timezone.utc).isoformat()
                }
            )
        except Exception as e:
            return JSONResponse(
                status_code=500,
                content={
                    "status": STATUS_FAILED,
                    "error_code": ERROR_CODES.get("SERVER_ERROR", "ERR_9001"),
                    "message": f"Validation error: {str(e)}",
                    "timestamp": datetime.now(timezone.utc).isoformat()
                }
            )
    
    async def _validate_patient_search(self, request: Request):
        """Validate patient search request."""
        try:
            # Get query parameters
            query_params = request.query_params
            
            # Validate stage_id if provided
            stage_id = query_params.get("stage_id")
            if stage_id:
                try:
                    stage_id_int = int(stage_id)
                    if stage_id_int < 1 or stage_id_int > 4:
                        raise PatientValidationException(
                            field="stage_id",
                            reason="Stage ID must be between 1 and 4"
                        )
                except ValueError:
                    raise PatientValidationException(
                        field="stage_id",
                        reason="Stage ID must be a valid integer"
                    )
            
            # Validation passed, continue
            return None
            
        except PatientValidationException as e:
            return JSONResponse(
                status_code=e.status_code,
                content={
                    "status": STATUS_FAILED,
                    "error_code": e.error_code,
                    "message": e.message,
                    "details": e.details,
                    "timestamp": e.timestamp
                }
            )
        except Exception as e:
            return JSONResponse(
                status_code=500,
                content={
                    "status": STATUS_FAILED,
                    "error_code": ERROR_CODES.get("SERVER_ERROR", "ERR_9001"),
                    "message": f"Validation error: {str(e)}",
                    "timestamp": datetime.now(timezone.utc).isoformat()
                }
            )
