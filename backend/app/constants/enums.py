"""
Enumerations for various status types.
These are business logic constants.
"""

from enum import Enum


class UserRole(str, Enum):
    ADMIN = "admin"
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

