"""
Quality Monitoring Exception Classes

These exceptions follow the same pattern as other exception modules:
- Clear hierarchy
- Specific error codes
- Meaningful messages from ErrorMessages
- HTTP status codes
- Easy to catch and handle
"""
from typing import Optional, Dict, Any

from ..constants.error_codes import ERROR_CODES
from ..constants.messages import ErrorMessages
from ..exceptions.custom_exceptions import AppException


class QualityException(AppException):
    """Base exception for all quality monitoring errors"""
    
    def __init__(
        self,
        message: str,
        error_code: str,
        status_code: int = 500,
        details: Optional[Dict[str, Any]] = None
    ):
        super().__init__(message, error_code, status_code, details)


class RedisConnectionException(QualityException):
    """Exception raised when Redis connection fails"""
    
    def __init__(self, detail: Optional[str] = None):
        message = ErrorMessages.REDIS_CONNECTION_ERROR
        details = {}
        
        if detail:
            message = f"{message}: {detail}"
            details["detail"] = detail
        
        super().__init__(
            message=message,
            error_code=ERROR_CODES.get("REDIS_CONNECTION_ERROR", "ERR_11001"),
            status_code=503,
            details=details
        )


class QualityDataNotFoundException(QualityException):
    """Exception raised when quality data is not found"""
    
    def __init__(self, patient_id: Optional[str] = None, detail: Optional[str] = None):
        message = ErrorMessages.QUALITY_DATA_NOT_FOUND
        details = {}
        
        if patient_id:
            message = f"{message} for patient ID '{patient_id}'"
            details["patient_id"] = patient_id
        
        if detail:
            message = f"{message}: {detail}"
            details["detail"] = detail
        
        super().__init__(
            message=message,
            error_code=ERROR_CODES.get("QUALITY_DATA_NOT_FOUND", "ERR_11002"),
            status_code=404,
            details=details
        )


class QualityServiceException(QualityException):
    """Exception raised when quality service operations fail"""
    
    def __init__(self, operation: Optional[str] = None, detail: Optional[str] = None):
        message = ErrorMessages.QUALITY_SERVICE_ERROR
        details = {}
        
        if operation:
            message = f"Quality service operation '{operation}' failed"
            details["operation"] = operation
        
        if detail:
            message = f"{message}: {detail}"
            details["detail"] = detail
        
        super().__init__(
            message=message,
            error_code=ERROR_CODES.get("QUALITY_SERVICE_ERROR", "ERR_11003"),
            status_code=500,
            details=details
        )


class QualityCsvExportException(QualityException):
    """Exception raised when CSV export generation fails"""

    def __init__(self, detail: Optional[str] = None):
        message = ErrorMessages.QUALITY_CSV_EXPORT_FAILED
        details = {}

        if detail:
            message = f"{message}: {detail}"
            details["detail"] = detail

        super().__init__(
            message=message,
            error_code=ERROR_CODES.get("QUALITY_CSV_EXPORT_FAILED", "ERR_11004"),
            status_code=500,
            details=details
        )
