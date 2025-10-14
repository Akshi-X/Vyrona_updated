"""
Constants and enums for Patient operations
"""
from enum import Enum


class PatientSortFields(str, Enum):
    """Available fields for sorting patients"""
    CREATED_AT = "created_at"
    UPDATED_AT = "updated_at"
    PATIENT_NAME = "patient_name"
    CONDITION = "condition"
    HOSPITAL_NAME = "hospital_name"
    LOCATION = "location"
    INSURANCE_PROVIDER = "insurance_provider"


class PatientSortOrder(str, Enum):
    """Available sort orders"""
    ASC = "asc"
    DESC = "desc"


class PatientStatus(str, Enum):
    """Patient status options"""
    ACTIVE = "active"
    INACTIVE = "inactive"
    DISCHARGED = "discharged"
    PENDING = "pending"


class InsuranceType(str, Enum):
    """Insurance type options"""
    PRIVATE = "private"
    PUBLIC = "public"
    MEDICARE = "medicare"
    MEDICAID = "medicaid"
    SELF_PAY = "self_pay"
    OTHER = "other"


class DocumentType(str, Enum):
    """Document type options"""
    MEDICAL_REPORT = "medical_report"
    INSURANCE_CARD = "insurance_card"
    ID_DOCUMENT = "id_document"
    PRESCRIPTION = "prescription"
    LAB_RESULTS = "lab_results"
    IMAGING = "imaging"
    OTHER = "other"


# Constants
class PatientConstants:
    """Patient-related constants"""
    
    # Pagination
    DEFAULT_PAGE_SIZE = 10
    MAX_PAGE_SIZE = 100
    MIN_PAGE_SIZE = 1
    
    # Search
    MIN_SEARCH_LENGTH = 2
    MAX_SEARCH_LENGTH = 100
    
    # Field lengths
    MAX_PATIENT_NAME_LENGTH = 255
    MAX_CONDITION_LENGTH = 500
    MAX_HOSPITAL_NAME_LENGTH = 255
    MAX_LOCATION_LENGTH = 255
    MAX_INSURANCE_PROVIDER_LENGTH = 255
    MAX_INSURANCE_TYPE_LENGTH = 100
    MAX_CREATED_BY_LENGTH = 255
    MAX_UPDATED_BY_LENGTH = 255
    
    # Document
    MAX_DOCUMENT_SIZE = 10 * 1024 * 1024  # 10MB
    ALLOWED_DOCUMENT_TYPES = [
        "application/pdf",
        "image/jpeg",
        "image/png",
        "image/gif",
        "text/plain"
    ]
    
    # Default values
    DEFAULT_SORT_FIELD = PatientSortFields.CREATED_AT
    DEFAULT_SORT_ORDER = PatientSortOrder.DESC


# Error messages
class PatientErrorMessages:
    """Standardized error messages"""
    
    PATIENT_NOT_FOUND = "Patient not found"
    PATIENT_ALREADY_EXISTS = "Patient already exists"
    INVALID_PATIENT_ID = "Invalid patient ID format"
    INVALID_PAGE_NUMBER = "Page number must be greater than 0"
    INVALID_PAGE_SIZE = "Page size must be between 1 and 100"
    INVALID_SORT_FIELD = "Invalid sort field"
    INVALID_SORT_ORDER = "Sort order must be 'asc' or 'desc'"
    DOCUMENT_TOO_LARGE = "Document size exceeds maximum allowed size"
    INVALID_DOCUMENT_TYPE = "Invalid document type"
    DOCUMENT_UPLOAD_FAILED = "Document upload failed"
    DOCUMENT_NOT_FOUND = "Document not found"
    VALIDATION_ERROR = "Validation error"
    SERVICE_ERROR = "Service operation failed"
    REPOSITORY_ERROR = "Database operation failed"
