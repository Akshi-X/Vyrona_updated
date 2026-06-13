from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
import uuid

from app.constants.enums import AlertType, AlertSource, AlertTriggeredBy, AlertSeverity, AlertStatus


# ============================================
# CRITICAL ALERT SCHEMAS
# ============================================

class CriticalAlertBase(BaseModel):
    """Base schema for critical alert"""
    tank_id: Optional[int] = Field(None, description="Reference to tank (tank-level monitoring)")
    incubator_id: Optional[int] = Field(None, description="Reference to incubator (incubator tracking)")
    chamber_id: Optional[str] = Field(None, description="Chamber within the incubator (optional)")
    refrigerator_id: Optional[int] = Field(None, description="Reference to refrigerator (refrigerator tracking)")
    zone_id: Optional[str] = Field(None, description="Zone within the refrigerator: 'freezer' or 'fridge'")
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
    """Schema for critical alert response"""
    alert_id: str = Field(..., description="UUID for alert identification")
    tank_code: Optional[str] = Field(None, description="Tank code (e.g., 'T1')")
    incubator_code: Optional[str] = Field(None, description="Incubator code")
    refrigerator_code: Optional[str] = Field(None, description="Refrigerator code")
    branch_name: Optional[str] = Field(None, description="Branch name")
    status: AlertStatus = Field(default=AlertStatus.ACTIVE, description="Status: Active, Acknowledged")
    acknowledged_by: Optional[str] = Field(None, description="User ID who acknowledged the alert")
    acknowledged_at: Optional[datetime] = Field(None, description="Timestamp when alert was acknowledged")
    acknowledgment_reason: Optional[str] = Field(None, description="Reason provided when acknowledging the alert")
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
    acknowledgment_reason: Optional[str] = Field(None, description="Reason for acknowledging (required for lid state alerts)")


class AcknowledgeAlertsRequest(BaseModel):
    """Schema for acknowledging multiple alerts"""
    alert_id: List[str] = Field(..., description="UUIDs of alerts to acknowledge")
    acknowledgment_reason: Optional[str] = Field(None, description="Reason for acknowledging (required for lid state alerts)")


class AcknowledgeAlertResponse(BaseModel):
    """Schema for acknowledge alert response"""
    alert_id: str = Field(..., description="UUID of the alert")
    status: AlertStatus
    message: str = Field(..., description="Success message")
    acknowledged_at: datetime
    acknowledgment_reason: Optional[str] = None


class AcknowledgeAlertsResponse(BaseModel):
    """Schema for acknowledge-all response"""
    alert_id: List[str] = Field(..., description="UUIDs of acknowledged alerts")
    status: AlertStatus
    message: str = Field(..., description="Success message")
    acknowledged_count: int
    acknowledged_at: datetime
    acknowledgment_reason: Optional[str] = None


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


class IncubatorAlertsResponse(BaseModel):
    """Schema for incubator-specific alerts"""
    incubator_id: int = Field(..., description="Incubator ID")
    incubator_code: Optional[str] = Field(None, description="Incubator code")
    chamber_id: Optional[str] = Field(None, description="Chamber filter applied (None = all chambers)")
    alerts: List[CriticalAlertResponse] = Field(..., description="List of alerts for this incubator")
    total_count: int = Field(..., description="Total number of alerts")


class RefrigeratorAlertsResponse(BaseModel):
    """Schema for refrigerator-specific alerts"""
    refrigerator_id: int = Field(..., description="Refrigerator ID")
    refrigerator_code: Optional[str] = Field(None, description="Refrigerator code")
    alerts: List[CriticalAlertResponse] = Field(..., description="List of alerts for this refrigerator")
    total_count: int = Field(..., description="Total number of alerts")
