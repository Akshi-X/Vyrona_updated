"""
IVF Reports Schemas
Response models for IVF reports endpoints
"""
from datetime import datetime, date, time
from typing import List, Optional

from pydantic import BaseModel, Field


class MonthlySummaryReportRow(BaseModel):
    """Row for monthly summary report."""

    kpi_name: str = Field(..., description="KPI configuration label")
    alerts_sent: int = Field(..., description="Total KPI alerts sent in the month")
    deviations_found: int = Field(..., description="Active KPI deviations in the month")


class MonthlySummaryReportResponse(BaseModel):
    """Response for monthly summary report."""

    month: str = Field(..., description="Month in YYYY-MM format")
    rows: List[MonthlySummaryReportRow] = Field(..., description="Monthly summary rows")
    total_kpis: int = Field(..., description="Total KPI configurations included")
    total_count: int = Field(..., description="Total KPI configurations for pagination")
    page: int = Field(..., description="Current page")
    page_size: int = Field(..., description="Page size")
    last_updated: datetime = Field(default_factory=datetime.now, description="Last update timestamp")
    status: str = Field(default="success", description="Response status")


class CriticalAlertReportRow(BaseModel):
    """Row for critical alert report."""

    alert_id: str = Field(..., description="Alert UUID")
    tank_id: int = Field(..., description="Tank ID")
    tank_code: Optional[str] = Field(None, description="Tank code")
    branch_id: int = Field(..., description="Branch ID")
    branch_name: Optional[str] = Field(None, description="Branch name")
    alert_type: str = Field(..., description="Alert type")
    source: str = Field(..., description="Alert source")
    severity: str = Field(..., description="Alert severity")
    status: str = Field(..., description="Alert status")
    message: str = Field(..., description="Alert message")
    triggered_by: str = Field(..., description="Triggered by")
    occurred_at: datetime = Field(..., description="Alert occurrence timestamp")
    acknowledged_by: Optional[str] = Field(None, description="User who acknowledged the alert")
    acknowledged_at: Optional[datetime] = Field(None, description="Acknowledged timestamp")
    created_at: datetime = Field(..., description="Created timestamp")


class CriticalAlertReportResponse(BaseModel):
    """Response for critical alert report."""

    alerts: List[CriticalAlertReportRow] = Field(..., description="Critical alert rows")
    total_count: int = Field(..., description="Total number of alerts")
    page: int = Field(..., description="Current page")
    page_size: int = Field(..., description="Page size")
    last_updated: datetime = Field(default_factory=datetime.now, description="Last update timestamp")
    status: str = Field(default="success", description="Response status")


class RefillLogReportRow(BaseModel):
    """Row for refill logs report."""

    log_id: int = Field(..., description="Refill log ID")
    tank_id: int = Field(..., description="Tank ID")
    tank_code: Optional[str] = Field(None, description="Tank code")
    branch_id: Optional[int] = Field(None, description="Branch ID")
    branch_name: Optional[str] = Field(None, description="Branch name")
    refill_date: Optional[date] = Field(None, description="Refill date")
    refill_time: Optional[time] = Field(None, description="Refill time")
    refilled_by: Optional[str] = Field(None, description="Refilled by")
    description: Optional[str] = Field(None, description="Description")
    status: Optional[str] = Field(None, description="Refill status")
    reservoir: Optional[str] = Field(None, description="Reservoir")
    ln2_ordered_date: Optional[date] = Field(None, description="LN2 ordered date")
    ln2_received_date: Optional[date] = Field(None, description="LN2 received date")
    created_at: datetime = Field(..., description="Created timestamp")


class RefillLogReportResponse(BaseModel):
    """Response for refill logs report."""

    logs: List[RefillLogReportRow] = Field(..., description="Refill log rows")
    total_count: int = Field(..., description="Total number of refill logs")
    page: int = Field(..., description="Current page")
    page_size: int = Field(..., description="Page size")
    last_updated: datetime = Field(default_factory=datetime.now, description="Last update timestamp")
    status: str = Field(default="success", description="Response status")
