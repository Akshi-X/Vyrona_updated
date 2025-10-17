"""
Dashboard Schemas (DTOs)
Response models for dashboard metrics across Performance, Risk, Compliance, and Logistics categories
"""

from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


# ==========================================
# PERFORMANCE SCHEMAS
# ==========================================

class PerformanceMetrics(BaseModel):
    """Performance metrics response"""
    on_time_percentage: float
    avg_lead_time_days: int
    failure_cost_million: float
    total_shipments: int
    completed_shipments: int
    pending_shipments: int
    last_updated: datetime


# ==========================================
# RISK SCHEMAS
# ==========================================

class RiskDriver(BaseModel):
    """Risk driver information"""
    name: str
    percentage: float
    severity: str  # "High", "Medium", "Low"
    trend: str  # "Increasing", "Decreasing", "Stable"


class RiskMetrics(BaseModel):
    """Risk metrics response"""
    deviation_percentage: float
    top_risk_driver: RiskDriver
    total_risks: int
    high_risks: int
    medium_risks: int
    low_risks: int
    last_updated: datetime


# ==========================================
# COMPLIANCE SCHEMAS
# ==========================================

class ComplianceMetrics(BaseModel):
    """Compliance metrics response"""
    audit_coverage_percentage: float
    emissions_per_treatment_tco2e: float
    total_audits: int
    passed_audits: int
    failed_audits: int
    pending_audits: int
    last_updated: datetime


# ==========================================
# LOGISTICS SCHEMAS
# ==========================================

class LogisticsMetrics(BaseModel):
    """Logistics metrics response"""
    cold_chain_packaging_failure_percentage: float
    avg_quality_lost_per_patient_percentage: float
    total_shipments: int
    successful_deliveries: int
    failed_deliveries: int
    average_transit_time_hours: float
    last_updated: datetime


# ==========================================
# COMBINED DASHBOARD SCHEMAS
# ==========================================

class DashboardCategoryResponse(BaseModel):
    """Response for individual dashboard category"""
    category: str
    metrics: dict
    last_updated: datetime
    status: str  # "success", "warning", "error"


# ==========================================
# REQUEST SCHEMAS (for future filtering)
# ==========================================

class DashboardFilterRequest(BaseModel):
    """Request schema for filtering dashboard data"""
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None
    company_id: Optional[str] = None
    facility_id: Optional[str] = None
    product_type: Optional[str] = None


class DashboardRefreshRequest(BaseModel):
    """Request schema for refreshing dashboard data"""
    categories: Optional[List[str]] = None  # ["performance", "risk", "compliance", "logistics"]
    force_refresh: bool = False


# ==========================================
# CRITICAL ALERTS SCHEMAS
# ==========================================

class CriticalAlert(BaseModel):
    """Individual critical alert"""
    id: str
    type: str
    severity: str  # "High", "Medium", "Low"
    patient_id: str
    message: str
    timestamp: datetime
    status: str  # "Active", "Acknowledged", "Resolved"


class CriticalAlertsResponse(BaseModel):
    """Response for critical alerts"""
    total_alerts: int
    active_alerts: int
    acknowledged_alerts: int
    resolved_alerts: int
    alerts: List[CriticalAlert]
    last_updated: datetime
