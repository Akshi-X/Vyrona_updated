from enum import Enum


class PatientConstants:
    """Constants for patient-related operations"""
    
    # Patient ID format
    PATIENT_ID_PREFIX = "PT"
    PATIENT_ID_SEQUENCE_LENGTH = 3
    
    # Field validation limits
    MAX_PATIENT_NAME_LENGTH = 255
    MAX_CONDITION_LENGTH = 500
    MAX_INSURANCE_PROVIDER_LENGTH = 255
    MAX_INSURANCE_TYPE_LENGTH = 100
    MAX_HOSPITAL_NAME_LENGTH = 255
    MAX_LOCATION_LENGTH = 255
    MAX_CREATED_BY_LENGTH = 255
    MAX_UPDATED_BY_LENGTH = 255
    
    # Pagination defaults
    DEFAULT_PAGE_SIZE = 10
    MAX_PAGE_SIZE = 100
    
    # Search and sorting
    DEFAULT_SORT_FIELD = "created_at"
    DEFAULT_SORT_ORDER = "desc"
    
    # Statistics
    MONTHLY_STATS_MONTHS = 12
    RECENT_PATIENTS_DAYS = 30
    TOP_CONDITIONS_LIMIT = 5


class SortOrder(Enum):
    """Enum for sort order"""
    ASC = "asc"
    DESC = "desc"


class PatientStage(Enum):
    """Enum for patient stages"""
    STAGE_1 = 1
    STAGE_2 = 2
    STAGE_3 = 3
    STAGE_4 = 4


class InsuranceType(Enum):
    """Enum for insurance types"""
    PRIVATE = "private"
    PUBLIC = "public"
    MEDICARE = "medicare"
    MEDICAID = "medicaid"
    SELF_PAY = "self_pay"


class ErrorMessages:
    """Error messages for patient operations"""
    
    # Validation errors
    PATIENT_NAME_REQUIRED = "Patient name is required"
    PATIENT_NAME_TOO_LONG = f"Patient name must be less than {PatientConstants.MAX_PATIENT_NAME_LENGTH} characters"
    CONDITION_REQUIRED = "Condition is required"
    CONDITION_TOO_LONG = f"Condition must be less than {PatientConstants.MAX_CONDITION_LENGTH} characters"
    INVALID_PAGE_SIZE = f"Page size must be between 1 and {PatientConstants.MAX_PAGE_SIZE}"
    INVALID_SORT_ORDER = "Sort order must be 'asc' or 'desc'"
    
    # Not found errors
    PATIENT_NOT_FOUND = "Patient not found"
    PROVIDER_NOT_FOUND = "Provider not found"
    PHARMA_NOT_FOUND = "Pharma not found"
    
    # Service errors
    CREATE_PATIENT_FAILED = "Failed to create patient"
    UPDATE_PATIENT_FAILED = "Failed to update patient"
    DELETE_PATIENT_FAILED = "Failed to delete patient"
    GET_PATIENTS_FAILED = "Failed to retrieve patients"
    
    # Repository errors
    DATABASE_CONNECTION_ERROR = "Database connection error"
    QUERY_EXECUTION_ERROR = "Query execution error"
    TRANSACTION_ERROR = "Transaction error"
