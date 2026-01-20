"""
Patient Exception Classes

These exceptions follow the same pattern as the main custom_exceptions.py:
- Clear hierarchy
- Specific error codes
- Meaningful messages
- HTTP status codes
- Easy to catch and handle
"""

from typing import Optional, Dict, Any
from datetime import datetime

from ..constants.error_codes import ERROR_CODES
from ..constants.messages import ErrorMessages
from ..exceptions.custom_exceptions import AppException


class PatientException(AppException):
    """Base exception for all patient-related errors"""
    
    def __init__(
        self,
        message: str,
        error_code: str,
        status_code: int = 500,
        details: Optional[Dict[str, Any]] = None
    ):
        super().__init__(message, error_code, status_code, details)


# ============================================
# PATIENT NOT FOUND EXCEPTIONS
# ============================================

class PatientNotFoundException(PatientException):
    """Exception raised when a patient is not found"""
    
    def __init__(self, patient_id: Optional[str] = None, reason: Optional[str] = None):
        if patient_id:
            message = f"{ErrorMessages.PATIENT_NOT_FOUND} with ID '{patient_id}'"
            details = {"patient_id": patient_id}
        else:
            message = ErrorMessages.PATIENT_NOT_FOUND
            details = {}
        
        if reason:
            message += f": {reason}"
            details["reason"] = reason
        
        super().__init__(
            message=message,
            error_code=ERROR_CODES.get("PATIENT_NOT_FOUND", "ERR_9001"),
            status_code=404,
            details=details
        )


class PatientProviderNotFoundException(PatientException):
    """Exception raised when a patient's provider is not found"""
    
    def __init__(self, provider_id: str, reason: Optional[str] = None):
        message = f"Provider with ID '{provider_id}' not found"
        details = {"provider_id": provider_id}
        
        if reason:
            message += f": {reason}"
            details["reason"] = reason
        
        super().__init__(
            message=message,
            error_code=ERROR_CODES.get("PROVIDER_NOT_FOUND", "ERR_9001"),
            status_code=404,
            details=details
        )


class PatientPharmaNotFoundException(PatientException):
    """Exception raised when a patient's pharma is not found"""
    
    def __init__(self, pharma_id: str, reason: Optional[str] = None):
        message = f"Pharma with ID '{pharma_id}' not found"
        details = {"pharma_id": pharma_id}
        
        if reason:
            message += f": {reason}"
            details["reason"] = reason
        
        super().__init__(
            message=message,
            error_code=ERROR_CODES.get("PHARMA_NOT_FOUND", "ERR_9001"),
            status_code=404,
            details=details
        )


class ShipmentNotStartedException(PatientException):
    """Exception raised when patient is in transportation stage but shipment has not started"""
    
    def __init__(self, patient_id: str):
        message = f"{ErrorMessages.SHIPMENT_NOT_STARTED} for patient ID '{patient_id}'"
        details = {"patient_id": patient_id}
        
        super().__init__(
            message=message,
            error_code=ERROR_CODES.get("SHIPMENT_NOT_STARTED", "ERR_9001"),
            status_code=400,
            details=details
        )


# ============================================
# PATIENT VALIDATION EXCEPTIONS
# ============================================

class PatientValidationException(PatientException):
    """Exception raised when patient data validation fails"""
    
    def __init__(self, field: Optional[str] = None, reason: Optional[str] = None):
        if field and reason:
            message = f"Validation error for field '{field}': {reason}"
            details = {"field": field, "reason": reason}
        elif field:
            message = f"Validation error for field '{field}'"
            details = {"field": field}
        elif reason:
            message = f"Patient validation failed: {reason}"
            details = {"reason": reason}
        else:
            message = "Patient data validation failed"
            details = {}
        
        super().__init__(
            message=message,
            error_code=ERROR_CODES.get("PATIENT_VALIDATION_ERROR", "ERR_6001"),
            status_code=422,
            details=details
        )


class PatientNameValidationException(PatientValidationException):
    """Exception raised when patient name validation fails"""
    
    def __init__(self, patient_name: str, reason: Optional[str] = None):
        message = f"Invalid patient name '{patient_name}'"
        details = {"patient_name": patient_name}
        
        if reason:
            message += f": {reason}"
            details["reason"] = reason
        
        super().__init__(
            message=message,
            error_code=ERROR_CODES.get("PATIENT_NAME_INVALID", "ERR_6002"),
            status_code=422,
            details=details
        )


class PatientConditionValidationException(PatientValidationException):
    """Exception raised when patient condition validation fails"""
    
    def __init__(self, condition: str, reason: Optional[str] = None):
        message = f"Invalid condition '{condition}'"
        details = {"condition": condition}
        
        if reason:
            message += f": {reason}"
            details["reason"] = reason
        
        super().__init__(
            message=message,
            error_code=ERROR_CODES.get("PATIENT_CONDITION_INVALID", "ERR_6003"),
            status_code=422,
            details=details
        )


class PatientInsuranceValidationException(PatientValidationException):
    """Exception raised when patient insurance validation fails"""
    
    def __init__(self, insurance_type: str, reason: Optional[str] = None):
        message = f"Invalid insurance type '{insurance_type}'"
        details = {"insurance_type": insurance_type}
        
        if reason:
            message += f": {reason}"
            details["reason"] = reason
        
        super().__init__(
            message=message,
            error_code=ERROR_CODES.get("PATIENT_INSURANCE_INVALID", "ERR_6004"),
            status_code=422,
            details=details
        )


# ============================================
# PATIENT SERVICE EXCEPTIONS
# ============================================

class PatientServiceException(PatientException):
    """Exception raised when patient service operations fail"""
    
    def __init__(self, operation: Optional[str] = None, reason: Optional[str] = None):
        if operation and reason:
            message = f"Patient service operation '{operation}' failed: {reason}"
            details = {"operation": operation, "reason": reason}
        elif operation:
            message = f"Patient service operation '{operation}' failed"
            details = {"operation": operation}
        elif reason:
            message = f"Patient service error: {reason}"
            details = {"reason": reason}
        else:
            message = "Patient service operation failed"
            details = {}
        
        super().__init__(
            message=message,
            error_code=ERROR_CODES.get("PATIENT_SERVICE_ERROR", "ERR_5001"),
            status_code=500,
            details=details
        )


class PatientCreateException(PatientServiceException):
    """Exception raised when patient creation fails"""
    
    def __init__(self, patient_name: Optional[str] = None, reason: Optional[str] = None):
        if patient_name and reason:
            message = f"Failed to create patient '{patient_name}': {reason}"
            details = {"patient_name": patient_name, "reason": reason}
        elif patient_name:
            message = f"Failed to create patient '{patient_name}'"
            details = {"patient_name": patient_name}
        elif reason:
            message = f"Patient creation failed: {reason}"
            details = {"reason": reason}
        else:
            message = "Patient creation failed"
            details = {}
        
        super().__init__(
            message=message,
            error_code=ERROR_CODES.get("PATIENT_CREATE_FAILED", "ERR_5002"),
            status_code=500,
            details=details
        )


class PatientUpdateException(PatientServiceException):
    """Exception raised when patient update fails"""
    
    def __init__(self, patient_id: str, reason: Optional[str] = None):
        message = f"Failed to update patient '{patient_id}'"
        details = {"patient_id": patient_id}
        
        if reason:
            message += f": {reason}"
            details["reason"] = reason
        
        super().__init__(
            message=message,
            error_code=ERROR_CODES.get("PATIENT_UPDATE_FAILED", "ERR_5003"),
            status_code=500,
            details=details
        )


class PatientDeleteException(PatientServiceException):
    """Exception raised when patient deletion fails"""
    
    def __init__(self, patient_id: str, reason: Optional[str] = None):
        message = f"Failed to delete patient '{patient_id}'"
        details = {"patient_id": patient_id}
        
        if reason:
            message += f": {reason}"
            details["reason"] = reason
        
        super().__init__(
            message=message,
            error_code=ERROR_CODES.get("PATIENT_DELETE_FAILED", "ERR_5004"),
            status_code=500,
            details=details
        )


class PatientSearchException(PatientServiceException):
    """Exception raised when patient search fails"""
    
    def __init__(self, search_criteria: Optional[Dict[str, Any]] = None, reason: Optional[str] = None):
        message = "Patient search failed"
        details = {}
        
        if search_criteria:
            details["search_criteria"] = search_criteria
        
        if reason:
            message += f": {reason}"
            details["reason"] = reason
        
        super().__init__(
            message=message,
            error_code=ERROR_CODES.get("PATIENT_SEARCH_FAILED", "ERR_5005"),
            status_code=500,
            details=details
        )


class PatientStatisticsException(PatientServiceException):
    """Exception raised when patient statistics generation fails"""
    
    def __init__(self, pharma_id: Optional[str] = None, reason: Optional[str] = None):
        if pharma_id and reason:
            message = f"Failed to generate statistics for pharma '{pharma_id}': {reason}"
            details = {"pharma_id": pharma_id, "reason": reason}
        elif pharma_id:
            message = f"Failed to generate statistics for pharma '{pharma_id}'"
            details = {"pharma_id": pharma_id}
        elif reason:
            message = f"Patient statistics generation failed: {reason}"
            details = {"reason": reason}
        else:
            message = "Patient statistics generation failed"
            details = {}
        
        super().__init__(
            message=message,
            error_code=ERROR_CODES.get("PATIENT_STATISTICS_FAILED", "ERR_5006"),
            status_code=500,
            details=details
        )


# ============================================
# PATIENT DOCUMENT EXCEPTIONS
# ============================================

class PatientDocumentException(PatientException):
    """Exception raised when patient document operations fail"""
    
    def __init__(self, operation: Optional[str] = None, reason: Optional[str] = None):
        if operation and reason:
            message = f"Patient document {operation} failed: {reason}"
            details = {"operation": operation, "reason": reason}
        elif operation:
            message = f"Patient document {operation} failed"
            details = {"operation": operation}
        elif reason:
            message = f"Patient document operation failed: {reason}"
            details = {"reason": reason}
        else:
            message = "Patient document operation failed"
            details = {}
        
        super().__init__(
            message=message,
            error_code=ERROR_CODES.get("PATIENT_DOCUMENT_ERROR", "ERR_7001"),
            status_code=500,
            details=details
        )


class PatientDocumentUploadException(PatientDocumentException):
    """Exception raised when patient document upload fails"""
    
    def __init__(self, filename: Optional[str] = None, reason: Optional[str] = None):
        if filename and reason:
            message = f"Failed to upload document '{filename}': {reason}"
            details = {"filename": filename, "reason": reason}
        elif filename:
            message = f"Failed to upload document '{filename}'"
            details = {"filename": filename}
        elif reason:
            message = f"Document upload failed: {reason}"
            details = {"reason": reason}
        else:
            message = "Document upload failed"
            details = {}
        
        super().__init__(
            message=message,
            error_code=ERROR_CODES.get("PATIENT_DOCUMENT_UPLOAD_FAILED", "ERR_7002"),
            status_code=500,
            details=details
        )


class PatientDocumentDownloadException(PatientDocumentException):
    """Exception raised when patient document download fails"""
    
    def __init__(self, document_id: Optional[str] = None, reason: Optional[str] = None):
        if document_id and reason:
            message = f"Failed to download document '{document_id}': {reason}"
            details = {"document_id": document_id, "reason": reason}
        elif document_id:
            message = f"Failed to download document '{document_id}'"
            details = {"document_id": document_id}
        elif reason:
            message = f"Document download failed: {reason}"
            details = {"reason": reason}
        else:
            message = "Document download failed"
            details = {}
        
        super().__init__(
            message=message,
            error_code=ERROR_CODES.get("PATIENT_DOCUMENT_DOWNLOAD_FAILED", "ERR_7003"),
            status_code=500,
            details=details
        )


# ============================================
# PATIENT STAGE EXCEPTIONS
# ============================================

class PatientStageNotFoundException(PatientException):
    """Exception raised when a patient stage is not found"""
    
    def __init__(self, stage_id: Optional[int] = None, patient_id: Optional[str] = None, reason: Optional[str] = None):
        if stage_id:
            message = f"Patient stage with ID '{stage_id}' not found"
            details = {"stage_id": stage_id}
        elif patient_id:
            message = f"Active patient stage not found for patient ID '{patient_id}'"
            details = {"patient_id": patient_id}
        else:
            message = "Patient stage not found"
            details = {}
        
        if reason:
            message += f": {reason}"
            details["reason"] = reason
        
        super().__init__(
            message=message,
            error_code=ERROR_CODES.get("PATIENT_STAGE_NOT_FOUND", "ERR_9002"),
            status_code=404,
            details=details
        )


class PatientStageUpdateException(PatientServiceException):
    """Exception raised when patient stage update fails"""
    
    def __init__(self, stage_id: Optional[int] = None, reason: Optional[str] = None):
        if stage_id and reason:
            message = f"Failed to update patient stage '{stage_id}': {reason}"
            details = {"stage_id": stage_id, "reason": reason}
        elif stage_id:
            message = f"Failed to update patient stage '{stage_id}'"
            details = {"stage_id": stage_id}
        elif reason:
            message = f"Patient stage update failed: {reason}"
            details = {"reason": reason}
        else:
            message = "Patient stage update failed"
            details = {}
        
        super().__init__(
            message=message,
            error_code=ERROR_CODES.get("PATIENT_STAGE_UPDATE_FAILED", "ERR_5007"),
            status_code=500,
            details=details
        )


# ============================================
# LEGACY COMPATIBILITY (for existing code)
# ============================================

# Keep the old class names for backward compatibility
PatientNotFoundError = PatientNotFoundException
PatientValidationError = PatientValidationException
PatientServiceError = PatientServiceException
PatientDocumentError = PatientDocumentException
PatientRepositoryError = PatientServiceException  # Since we removed repository layer