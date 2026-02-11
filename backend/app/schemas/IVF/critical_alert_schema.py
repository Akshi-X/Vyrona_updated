from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
import uuid

from app.constants.enums import AlertType, AlertSource, AlertTriggeredBy, AlertSeverity, AlertStatus


# ============================================
# CRITICAL ALERT SCHEMAS
# ============================================

class CriticalAlertBase(BaseModel):
    """Base schema for critical alert (tank-level monitoring)"""
    tank_id: int = Field(..., description="Reference to tank (tank-level monitoring)")
    hospital_id: int = Field(..., description="Hospital ID for scoping and compliance")
    branch_id: int = Field(..., description="Branch ID for scoping and compliance")
    alert_type: AlertType = Field(..., description="Type of alert: Deviation alert, Quality alert, Refill log alert")
    source: AlertSource = Field(..., description="Source of alert: KPI, QUALITY, REFILL")
    severity: AlertSeverity = Field(..., description="Severity: High, Medium, Low")
    message: str = Field(..., description="Alert message describing the issue")
    triggered_by: AlertTriggeredBy = Field(default=AlertTriggeredBy.SYSTEM, description="Who/what triggered: system, device, manual")
    occurred_at: datetime = Field(..., description="Timestamp when the alert was triggered")
    dedup_key: Optional[str] = Field(None, description="Deduplication key to prevent alert spam")


class CriticalAlertResponse(CriticalAlertBase):
    """Schema for critical alert response (tank-level monitoring)"""
    alert_id: str = Field(..., description="UUID for alert identification")
    tank_code: Optional[str] = Field(None, description="Tank code (e.g., 'T1')")
    status: AlertStatus = Field(default=AlertStatus.ACTIVE, description="Status: Active, Acknowledged")
    acknowledged_by: Optional[str] = Field(None, description="User ID who acknowledged the alert")
    acknowledged_at: Optional[datetime] = Field(None, description="Timestamp when alert was acknowledged")
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class CriticalAlertListResponse(BaseModel):
    """Schema for list of critical alerts"""
    alerts: List[CriticalAlertResponse] = Field(..., description="List of critical alerts")
    total_count: int = Field(..., description="Total number of alerts")
    active_count: int = Field(..., description="Number of active alerts")
    acknowledged_count: int = Field(..., description="Number of acknowledged alerts")


class AcknowledgeAlertRequest(BaseModel):
    """Schema for acknowledging an alert"""
    alert_id: str = Field(..., description="UUID of the alert to acknowledge")


class AcknowledgeAlertResponse(BaseModel):
    """Schema for acknowledge alert response"""
    alert_id: str = Field(..., description="UUID of the alert")
    status: AlertStatus
    message: str = Field(..., description="Success message")
    acknowledged_at: datetime


class TankAlertsResponse(BaseModel):
    """Schema for tank-specific alerts (tank-level monitoring)"""
    tank_id: int = Field(..., description="Tank ID")
    tank_code: Optional[str] = Field(None, description="Tank code (e.g., 'T1')")
    alerts: List[CriticalAlertResponse] = Field(..., description="List of alerts for this tank")
    total_count: int = Field(..., description="Total number of alerts for this tank")


class HospitalAlertsResponse(BaseModel):
    """Schema for hospital-wide alerts (all branches for Manager, user branch for User)"""
    alerts: List[CriticalAlertResponse] = Field(..., description="List of alerts")
    total_count: int = Field(..., description="Total number of alerts")
    active_count: int = Field(..., description="Number of active alerts")
    acknowledged_count: int = Field(..., description="Number of acknowledged alerts")
