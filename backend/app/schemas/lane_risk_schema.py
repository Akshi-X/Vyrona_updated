"""
Lane Risk Assessment Schemas (DTOs)
Response models for lane risk assessment data
"""

from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime


class LaneRiskAssessmentItem(BaseModel):
    """Individual lane risk assessment entry (table row)"""
    risk_factor: str = Field(..., description="Risk factor name (e.g., 'Lane Complexity', 'Quality Incidents', 'External')")
    risk_contributors: List[str] = Field(..., description="Ordered list of up to 4 contributors for display")
    risk_scale: str = Field(..., description="Risk score on scale 0-5 or classification (Basic, Moderate, Good, Very Good, Excellent)")


class LaneRiskAssessmentResponse(BaseModel):
    """Response for lane risk assessment"""
    shipment_id: Optional[int] = Field(None, description="Shipment ID if assessment is for a specific shipment")
    patient_id: str = Field(..., description="Patient ID the assessment belongs to")
    total_risk_factors: int = Field(..., description="Total number of risk factors")
    factors: List[LaneRiskAssessmentItem] = Field(..., description="List of risk factors with their contributors and scores")
    last_updated: datetime = Field(..., description="Timestamp of last assessment update")
    status: str = Field(..., description="Status: 'success', 'warning', 'error'")
    
    class Config:
        from_attributes = True
