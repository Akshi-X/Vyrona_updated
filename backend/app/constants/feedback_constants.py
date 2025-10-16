from enum import Enum


class FeedbackConstants:
    """Constants for feedback-related operations"""
    
    # Feedback ID format
    FEEDBACK_ID_PREFIX = "TK"
    FEEDBACK_ID_SEQUENCE_LENGTH = 3
    
    # Field validation limits
    MAX_SUBJECT_LENGTH = 255
    MAX_DESCRIPTION_LENGTH = 5000
    MAX_COMMENT_LENGTH = 2000
    MAX_SUBMITTED_BY_LENGTH = 255
    MAX_CREATED_BY_LENGTH = 255
    MAX_UPDATED_BY_LENGTH = 255
    
    # File upload limits
    MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
    ALLOWED_FILE_EXTENSIONS = {
        '.pdf', '.doc', '.docx', '.txt', '.jpg', '.jpeg', '.png', '.gif',
        '.xlsx', '.xls', '.csv', '.zip', '.rar', '.7z'
    }
    
    # Pagination defaults
    DEFAULT_PAGE_SIZE = 10
    MAX_PAGE_SIZE = 100
    
    # Search and sorting
    DEFAULT_SORT_FIELD = "submitted_on"
    DEFAULT_SORT_ORDER = "desc"
    
    # Email configuration
    ADMIN_EMAIL = "admin@mygrape.com"
    SUPPORT_EMAIL = "support@mygrape.com"


class DepartmentEnum(str, Enum):
    """Enum for departments"""
    LOGISTICS = "logistics"
    QUALITY_ASSURANCE = "quality_assurance"
    SUPPLY_CHAIN_OPS = "supply_chain_ops"
    COMPLIANCE = "compliance"
    OTHER = "other"


class FeedbackTypeEnum(str, Enum):
    """Enum for feedback types"""
    BUG = "bug"
    DATA_QUALITY_ISSUE = "data_quality_issue"
    FEATURE_REQUEST = "feature_request"
    UX_WORKFLOW_IMPROVEMENT = "ux_workflow_improvement"
    API_INTEGRATION = "api_integration"
    COMPLIANCE_CONCERN = "compliance_concern"
    OTHER = "other"


class PriorityEnum(str, Enum):
    """Enum for priority levels"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class AffectedModulesEnum(str, Enum):
    """Enum for affected modules"""
    TRACK_TRACE = "track_trace"
    QUALITY_MONITORING = "quality_monitoring"
    COMPLIANCE_AUTOMATION = "compliance_automation"
    RISK_MODULE = "risk_module"
    OTHER = "other"


class StatusEnum(str, Enum):
    """Enum for feedback status"""
    OPEN = "Open"
    IN_PROGRESS = "In Progress"
    COMPLETED = "Completed"
    REOPEN = "Reopen"


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
    INVALID_FILE_TYPE = f"File type not allowed. Allowed types: {', '.join(FeedbackConstants.ALLOWED_FILE_EXTENSIONS)}"
    
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


