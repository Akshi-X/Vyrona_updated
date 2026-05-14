from enum import Enum
from .app_constants import (
    FEEDBACK_MAX_SUBJECT_LENGTH,
    FEEDBACK_MAX_DESCRIPTION_LENGTH,
    FEEDBACK_MAX_COMMENT_LENGTH,
    FEEDBACK_MAX_ATTACHMENT_SIZE_BYTES,
    FEEDBACK_ALLOWED_ATTACHMENT_EXTENSIONS,
    FEEDBACK_MAX_PAGE_SIZE
)


class FeedbackConstants:
    """Constants for feedback-related operations - references app_constants.py"""
    
    # Field validation limits (imported from app_constants.py)
    MAX_SUBJECT_LENGTH = FEEDBACK_MAX_SUBJECT_LENGTH
    MAX_DESCRIPTION_LENGTH = FEEDBACK_MAX_DESCRIPTION_LENGTH
    MAX_COMMENT_LENGTH = FEEDBACK_MAX_COMMENT_LENGTH
    MAX_SUBMITTED_BY_LENGTH = 255
    MAX_CREATED_BY_LENGTH = 255
    MAX_UPDATED_BY_LENGTH = 255
    
    # File upload limits (imported from app_constants.py)
    MAX_FILE_SIZE = FEEDBACK_MAX_ATTACHMENT_SIZE_BYTES
    ALLOWED_FILE_EXTENSIONS = set(FEEDBACK_ALLOWED_ATTACHMENT_EXTENSIONS)
    
    # Pagination defaults (imported from app_constants.py)
    MAX_PAGE_SIZE = FEEDBACK_MAX_PAGE_SIZE
    

class ErrorMessages:
    """Error messages for feedback operations"""
    
    # Validation errors
    SUBJECT_REQUIRED = "Subject is required"
    SUBJECT_TOO_LONG = f"Subject must be less than {FeedbackConstants.MAX_SUBJECT_LENGTH} characters"
    DESCRIPTION_REQUIRED = "Description is required"
    DESCRIPTION_TOO_LONG = f"Description must be less than {FeedbackConstants.MAX_DESCRIPTION_LENGTH} characters"
    COMMENT_REQUIRED = "Comment is required"
    COMMENT_TOO_LONG = f"Comment must be less than {FeedbackConstants.MAX_COMMENT_LENGTH} characters"
    INVALID_PAGE_SIZE = f"Page size must be between 1 and {FeedbackConstants.MAX_PAGE_SIZE}"
    INVALID_SORT_ORDER = "Sort order must be 'asc' or 'desc'"
    INVALID_FILE_SIZE = f"File size exceeds maximum allowed size of {FeedbackConstants.MAX_FILE_SIZE // (1024*1024)}MB"
    INVALID_FILE_TYPE = f"File type not allowed. Allowed types: {', '.join(sorted(FeedbackConstants.ALLOWED_FILE_EXTENSIONS))}"
    
    # Not found errors
    FEEDBACK_NOT_FOUND = "Feedback not found"
    COMMENT_NOT_FOUND = "Comment not found"
    ATTACHMENT_NOT_FOUND = "Attachment not found"
    
    # Service errors
    CREATE_FEEDBACK_FAILED = "Failed to create feedback"
    UPDATE_FEEDBACK_FAILED = "Failed to update feedback"
    DELETE_FEEDBACK_FAILED = "Failed to delete feedback"
    GET_FEEDBACK_FAILED = "Failed to retrieve feedback"
    ADD_COMMENT_FAILED = "Failed to add comment"
    FILE_UPLOAD_FAILED = "Failed to upload file"
    EMAIL_SEND_FAILED = "Failed to send email notification"
    
    # Repository errors
    DATABASE_CONNECTION_ERROR = "Database connection error"
    QUERY_EXECUTION_ERROR = "Query execution error"
    TRANSACTION_ERROR = "Transaction error"


