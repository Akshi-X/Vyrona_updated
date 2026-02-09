import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, ForeignKey, DateTime, Enum as SQLEnum, Text, Index
from sqlalchemy.orm import relationship
from enum import Enum

from ...config.database import Base


class AlertType(str, Enum):
    """Alert type enumeration"""
    DEVIATION_ALERT = "Deviation alert"
    QUALITY_ALERT = "Quality alert"
    REFILL_LOG_ALERT = "Refill log alert"
    
    @classmethod
    def list(cls):
        return [alert_type.value for alert_type in cls]


class AlertSource(str, Enum):
    """Alert source enumeration - where the alert originated from"""
    KPI = "KPI"
    QUALITY = "QUALITY"
    REFILL = "REFILL"
    
    @classmethod
    def list(cls):
        return [source.value for source in cls]


class AlertTriggeredBy(str, Enum):
    """Alert triggered by enumeration - who/what triggered the alert"""
    SYSTEM = "system"
    DEVICE = "device"
    MANUAL = "manual"
    
    @classmethod
    def list(cls):
        return [trigger.value for trigger in cls]


class AlertSeverity(str, Enum):
    """Alert severity enumeration"""
    HIGH = "High"
    MEDIUM = "Medium"
    LOW = "Low"
    
    @classmethod
    def list(cls):
        return [severity.value for severity in cls]


class AlertStatus(str, Enum):
    """Alert status enumeration"""
    ACTIVE = "Active"
    ACKNOWLEDGED = "Acknowledged"
    
    @classmethod
    def list(cls):
        return [status.value for status in cls]


class CriticalAlert(Base):
    """
    Model to store critical alerts for IVF tanks (tank-level monitoring).
    Alerts are triggered for:
    - KPI deviations (temperature, humidity, agitation, light)
    - Quality loss events
    - Missing refill logs (not filled within 3 days)
    
    Production requirements:
    - UUID for audit trail
    - Hospital/branch scoping for compliance
    - Source tracking (KPI/QUALITY/REFILL)
    - Triggered by tracking (system/device/manual)
    - Deduplication key to prevent alert spam
    """
    __tablename__ = "critical_alerts"

    # Primary Key - UUID for audit and compliance
    alert_id = Column(String(36), primary_key=True, index=True, default=lambda: str(uuid.uuid4()), comment="UUID for alert identification")
    
    # Foreign Keys - reference to tanks, hospitals, and branches (tank-level monitoring)
    tank_id = Column(Integer, ForeignKey("tanks.tank_id"), nullable=False, index=True, comment="Reference to tank (tank-level monitoring)")
    hospital_id = Column(Integer, ForeignKey("hospitals.hospital_id"), nullable=False, index=True, comment="Hospital ID for scoping and compliance")
    branch_id = Column(Integer, ForeignKey("hospital_branches.branch_id"), nullable=False, index=True, comment="Branch ID for scoping and compliance")
    
    # Alert Information
    alert_type = Column(String(50), nullable=False, index=True, comment="Type of alert: Deviation alert, Quality alert, Refill log alert")
    source = Column(String(20), nullable=False, index=True, comment="Source of alert: KPI, QUALITY, REFILL")
    severity = Column(String(20), nullable=False, index=True, comment="Severity: High, Medium, Low")
    message = Column(Text, nullable=False, comment="Alert message describing the issue")
    status = Column(String(20), nullable=False, default=AlertStatus.ACTIVE.value, index=True, comment="Status: Active, Acknowledged")
    
    # Trigger Information
    triggered_by = Column(String(20), nullable=False, default=AlertTriggeredBy.SYSTEM.value, index=True, comment="Who/what triggered: system, device, manual")
    
    # Timestamp when alert occurred
    occurred_at = Column(DateTime, nullable=False, index=True, comment="Timestamp when the alert was triggered")
    
    # Deduplication Key - prevents duplicate alerts
    dedup_key = Column(String(255), nullable=True, unique=True, index=True, comment="Deduplication key to prevent alert spam (e.g., tank_id:source:alert_type:date)")
    
    # Acknowledgment information
    acknowledged_by = Column(String, nullable=True, comment="User ID who acknowledged the alert")
    acknowledged_at = Column(DateTime, nullable=True, comment="Timestamp when alert was acknowledged")
    
    # Reminder tracking
    last_reminder_sent_at = Column(DateTime, nullable=True, index=True, comment="Timestamp when last reminder email was sent")
    
    # Relationships
    tank = relationship("Tank", backref="critical_alerts")
    hospital = relationship("Hospital", backref="critical_alerts")
    branch = relationship("HospitalBranch", backref="critical_alerts")
    
    # Audit Trail
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    created_by = Column(String, nullable=True)
    updated_by = Column(String, nullable=True)
    
    # Composite indexes for common query patterns
    __table_args__ = (
        Index('idx_alert_tank_status', 'tank_id', 'status'),
        Index('idx_alert_type_status', 'alert_type', 'status'),
        Index('idx_alert_occurred', 'occurred_at'),
        Index('idx_alert_severity_status', 'severity', 'status'),
        Index('idx_alert_hospital_branch', 'hospital_id', 'branch_id'),
        Index('idx_alert_source_status', 'source', 'status'),
        Index('idx_alert_dedup_key', 'dedup_key'),
    )
