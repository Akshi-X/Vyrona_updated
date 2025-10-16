class PatientException(Exception):
    """Base exception for patient-related errors"""
    def __init__(self, message: str, error_code: str = None):
        self.message = message
        self.error_code = error_code
        super().__init__(self.message)


class PatientNotFoundError(PatientException):
    """Exception raised when a patient is not found"""
    def __init__(self, patient_id: str):
        message = f"Patient with ID '{patient_id}' not found"
        super().__init__(message, "PATIENT_NOT_FOUND")


class PatientValidationError(PatientException):
    """Exception raised when patient data validation fails"""
    def __init__(self, field: str = None, message: str = None):
        if message:
            error_message = message
        elif field:
            error_message = f"Validation error for field '{field}'"
        else:
            error_message = "Patient data validation failed"
        super().__init__(error_message, "PATIENT_VALIDATION_ERROR")


class PatientDocumentError(PatientException):
    """Exception raised when document operations fail"""
    def __init__(self, operation: str = None, message: str = None):
        if message:
            error_message = message
        elif operation:
            error_message = f"Document {operation} failed"
        else:
            error_message = "Document operation failed"
        super().__init__(error_message, "PATIENT_DOCUMENT_ERROR")


class PatientServiceError(PatientException):
    """Exception raised when service operations fail"""
    def __init__(self, operation: str = None, message: str = None):
        if message:
            error_message = message
        elif operation:
            error_message = f"Service operation '{operation}' failed"
        else:
            error_message = "Service operation failed"
        super().__init__(error_message, "PATIENT_SERVICE_ERROR")


class PatientRepositoryError(PatientException):
    """Exception raised when repository operations fail"""
    def __init__(self, operation: str = None, message: str = None):
        if message:
            error_message = message
        elif operation:
            error_message = f"Repository operation '{operation}' failed"
        else:
            error_message = "Repository operation failed"
        super().__init__(error_message, "PATIENT_REPOSITORY_ERROR")
