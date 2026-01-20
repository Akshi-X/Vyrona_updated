"""
Enumerations for various status types.
These are business logic constants.
"""

from enum import Enum


class UserRole(str, Enum):
    ADMIN = "Admin"
    PHARMA_ADMIN = "Pharma_admin"
    MYGRAPE_ADMIN = "Mygrape_admin"
    MANAGER = "Manager"
    USER = "User"
    
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


class TreatmentStatus(str, Enum):
    """Enum for patient treatment status"""
    AFTER_CARE = "after_care"
    FAILURE = "failure"
    ONGOING = "ongoing"
    
    @classmethod
    def list(cls):
        return [status.value for status in cls]


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
    DASHBOARD = "dashboard"
    DATABASE = "database"
    TRACK_SHIPMENT = "track_shipment"
    CONTROL_TOWER = "control_tower"
    AFTER_CARE = "after_care"
    FAILURE = "failure"
    STAKEHOLDER_CHAT = "stakeholder_chat"
    CRITICAL_ALERT = "critical_alert"
    MY_TASK = "my_task"
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


class RouteStatus(str, Enum):
    """Enum for route status in control tower"""
    SAFE = "safe"           # Good quality (0-5% loss)
    DELAYED = "delayed"     # Moderate quality (5-15% loss)
    HIGH_RISK = "high_risk" # High risk (15%+ loss)
    FAILED = "failed"       # Failed shipment
    
    @classmethod
    def list(cls):
        return [status.value for status in cls]


class CanisterStatus(str, Enum):
    """Enum for canister status"""
    SAFE = "safe"
    RISK = "risk"
    CRITICAL = "critical"
    
    @classmethod
    def list(cls):
        return [status.value for status in cls]