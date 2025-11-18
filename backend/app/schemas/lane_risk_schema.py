"""
Lane Risk Assessment Schemas (DTOs)
Response models for lane risk assessment data
"""

from pydantic import BaseModel
from typing import List
from datetime import datetime


class LaneRiskAssessmentItem(BaseModel):
    """Individual lane risk assessment entry (table row)"""
    risk_factor: str  # e.g., "Quality Deviations"
    risk_contributors: List[str]  # ordered list of contributors for display
    risk_scale: str  # textual score such as "0", "--", etc.


class LaneRiskAssessmentResponse(BaseModel):
    """Response for lane risk assessment"""
    total_risk_factors: int
    factors: List[LaneRiskAssessmentItem]
    last_updated: datetime
    status: str  # "success", "warning", "error"

