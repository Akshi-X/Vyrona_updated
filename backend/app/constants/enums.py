"""
Enumerations for various status types.
These are business logic constants.
"""

from enum import Enum


class UserRole(str, Enum):
    ADMIN = "admin"
    PHARMA_ADMIN = "pharma_admin"
    MANAGER = "manager"
    USER = "user"
    
    @classmethod
    def list(cls):
        return [role.value for role in cls]


class ApprovalStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    
    @classmethod
    def list(cls):
        return [status.value for status in cls]


class UserStatus(str, Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    SUSPENDED = "suspended"
    DELETED = "deleted"


class EmailType(str, Enum):
    REGISTRATION = "registration"
    OTP = "otp"
    APPROVAL = "approval"
    REJECTION = "rejection"
    WELCOME = "welcome"


class PatientStage(str, Enum):
    """Enum for patient treatment stages"""
    SCHEDULED = "Scheduled"
    APHERESIS = "Apheresis"
    CRYOPRESERVATION = "Cryopreservation"
    TRANSPORTATION = "Transportation"
    REENGINEERING = "Reengineering"
    REINFUSION = "Reinfusion"
    
    @classmethod
    def list(cls):
        return [stage.value for stage in cls]


class LogLevel(str, Enum):
    DEBUG = "DEBUG"
    INFO = "INFO"
    WARNING = "WARNING"
    ERROR = "ERROR"
    CRITICAL = "CRITICAL"


# ============================================
# FEEDBACK SYSTEM ENUMS
# ============================================

class FeedbackDepartment(str, Enum):
    LOGISTICS = "logistics"
    QUALITY_ASSURANCE = "quality_assurance"
    SUPPLY_CHAIN_OPS = "supply_chain_ops"
    COMPLIANCE = "compliance"
    OTHER = "other"
    
    @classmethod
    def list(cls):
        return [dept.value for dept in cls]


class FeedbackType(str, Enum):
    BUG = "bug"
    DATA_QUALITY_ISSUE = "data_quality_issue"
    FEATURE_REQUEST = "feature_request"
    UX_WORKFLOW_IMPROVEMENT = "ux_workflow_improvement"
    API_INTEGRATION = "api_integration"
    COMPLIANCE_CONCERN = "compliance_concern"
    OTHER = "other"
    
    @classmethod
    def list(cls):
        return [ftype.value for ftype in cls]


class FeedbackPriority(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"
    
    @classmethod
    def list(cls):
        return [priority.value for priority in cls]


class AffectedModule(str, Enum):
    TRACK_TRACE = "track_trace"
    QUALITY_MONITORING = "quality_monitoring"
    COMPLIANCE_AUTOMATION = "compliance_automation"
    RISK_MODULE = "risk_module"
    OTHER = "other"
    
    @classmethod
    def list(cls):
        return [module.value for module in cls]


class FeedbackStatus(str, Enum):
    OPEN = "Open"
    IN_PROGRESS = "In Progress"
    COMPLETED = "Completed"
    REOPEN = "Reopen"
    
    @classmethod
    def list(cls):
        return [status.value for status in cls]

class TaskPriority(str, Enum):
    HIGH = "High"
    MEDIUM = "Medium"
    LOW = "Low"

    @classmethod
    def list(cls):
        return [priority.value for priority in cls]


class TaskStatus(str, Enum):
    DONE = "Done"
    IN_PROGRESS = "In progress"
    NOT_STARTED = "Not started"

    @classmethod
    def list(cls):
        return [status.value for status in cls]

