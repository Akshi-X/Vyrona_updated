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
        List of lane risk assessment entries with:
        - Route
        - Quality Deviations
        - Returns & Regulatory
        - Loss/Physical Damage
        - 3PL Reliability
        - Weather
        - Lane Complexity
        - Geopolitical
        - Digital & Communication
        - Risk Level
    """
    
    # Mock lane risk assessment data
    lanes = [
        LaneRiskAssessmentItem(
            route="A",
            quality_deviations="Temperature deviations (2.1% frequency)",
            returns_regulatory="EU clearance: 12-16 hrs avg",
            loss_physical_damage="0.3% lost shipments",
            three_pl_reliability="DHL: 2.1% SLA breach",
            weather="Storm delays: 4 events/year",
            lane_complexity="3 carrier handovers",
            geopolitical="Low risk: Stable regions",
            digital_communication="98.5% tracking coverage",
            risk_level="Medium"
        ),
        LaneRiskAssessmentItem(
            route="B",
            quality_deviations="Cold chain breaks (1.8% of duration)",
            returns_regulatory="US FDA: 8-24 hrs processing",
            loss_physical_damage="0.5% damaged packages",
            three_pl_reliability="FedEx: 1.7% SLA breach",
            weather="Hurricane seasons: 6 events",
            lane_complexity="5 carrier handovers",
            geopolitical="Medium: Trade tensions",
            digital_communication="Real-time gaps: 4.2%",
            risk_level="High"
        ),
        LaneRiskAssessmentItem(
            route="C",
            quality_deviations="Humidity excursions (3.2% severity)",
            returns_regulatory="APAC clearance: 6-18 hrs",
            loss_physical_damage="0.2% theft incidents",
            three_pl_reliability="UPS: 1.8% SLA breach",
            weather="Monsoon delays: 8 events",
            lane_complexity="2 carrier handovers",
            geopolitical="High: Border restrictions",
            digital_communication="Connectivity issues: 7.3%",
            risk_level="Low"
        )
    ]
    
    return LaneRiskAssessmentResponse(
        total_lanes=len(lanes),
        lanes=lanes,
        last_updated=datetime.now(),
        status="success"
    )

