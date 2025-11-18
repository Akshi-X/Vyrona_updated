from fastapi import APIRouter, Depends
from datetime import datetime

from app.schemas.lane_risk_schema import (
    LaneRiskAssessmentResponse,
    LaneRiskAssessmentItem
)
from app.dependencies.auth_dependencies import get_pharma_id_from_request

router = APIRouter(tags=["Lane Risk Assessment"])


# ---------------------------
# Get Lane Risk Assessment
# ---------------------------
@router.get("/lane-risk-assessment", response_model=LaneRiskAssessmentResponse)
def get_lane_risk_assessment(pharma_id: int = Depends(get_pharma_id_from_request)):
    """
    Get lane risk assessment data.
    
    Protected endpoint. Auth token required; pharma_id taken from token.
    
    Args:
        pharma_id: Pharmaceutical company ID from token
    
    Returns:
        Table of risk factors with their corresponding contributors and risk scale.
    """
    
    # Mock lane risk assessment data aligned with new UI table
    factors = [
        LaneRiskAssessmentItem(
            risk_factor="Quality Deviations",
            risk_contributors=[
                "Temperature Deviation - 5",
                "Humidity Deviation - 0",
                "-",
                "-"
            ],
            risk_scale="0"
        ),
        LaneRiskAssessmentItem(
            risk_factor="Returns & Regulatory",
            risk_contributors=[
                "Temperature Deviation - 5",
                "Humidity Deviation - 0",
                "-",
                "-"
            ],
            risk_scale="--"
        ),
        LaneRiskAssessmentItem(
            risk_factor="Loss/Physical Damage",
            risk_contributors=[
                "Temperature Deviation - 5",
                "Humidity Deviation - 0",
                "-",
                "-"
            ],
            risk_scale="--"
        ),
        LaneRiskAssessmentItem(
            risk_factor="3PL Reliability",
            risk_contributors=[
                "Temperature Deviation - 5",
                "Humidity Deviation - 0",
                "-",
                "-"
            ],
            risk_scale="--"
        ),
        LaneRiskAssessmentItem(
            risk_factor="Weather",
            risk_contributors=[
                "Temperature Deviation - 5",
                "Humidity Deviation - 0",
                "-",
                "-"
            ],
            risk_scale="--"
        )
    ]
    
    return LaneRiskAssessmentResponse(
        total_risk_factors=len(factors),
        factors=factors,
        last_updated=datetime.now(),
        status="success"
    )

