"""
Lane Risk Assessment Schemas (DTOs)
Response models for lane risk assessment data
"""

from pydantic import BaseModel
from typing import List
from datetime import datetime


class LaneRiskAssessmentItem(BaseModel):
    """Individual lane risk assessment entry"""
    route: str  # Route identifier (e.g., "A", "B", "C")
    quality_deviations: str  # Quality deviations description
    returns_regulatory: str  # Returns & Regulatory information
    loss_physical_damage: str  # Loss/Physical Damage percentage/description
    three_pl_reliability: str  # 3PL Reliability information
    weather: str  # Weather-related risks
    lane_complexity: str  # Lane complexity (e.g., carrier handovers)
    geopolitical: str  # Geopolitical risk assessment
    digital_communication: str  # Digital & Communication metrics
    risk_level: str  # Risk Level (Low, Medium, High)


class LaneRiskAssessmentResponse(BaseModel):
    """Response for lane risk assessment"""
    total_lanes: int
    lanes: List[LaneRiskAssessmentItem]
    last_updated: datetime
    status: str  # "success", "warning", "error"

