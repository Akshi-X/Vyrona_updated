from fastapi import APIRouter, Depends, Query, HTTPException

from app.schemas.lane_risk_schema import LaneRiskAssessmentResponse
from app.dependencies.auth_dependencies import get_pharma_id_from_request
from app.config.database import SessionLocal
from app.service.lane_risk_service import LaneRiskService

router = APIRouter(tags=["Lane Risk Assessment"])


# ---------------------------
# Get Lane Risk Assessment
# ---------------------------
@router.get("/lane-risk-assessment", response_model=LaneRiskAssessmentResponse)
def get_lane_risk_assessment(
    patient_id: str = Query(..., description="Patient ID to aggregate shipments for (required)"),
    pharma_id: int = Depends(get_pharma_id_from_request)
):
    """
    Get lane risk assessment data.
    
    Protected endpoint. Auth token required; pharma_id taken from token.
    
    Calculates risk assessment based on:
    - Lane Complexity: Number of legs, road parking stops, on-time flight performance, World Bank Timeliness Index
    - Quality Incidents: High/low/hybrid excursions, missing logger, missing logger data, frequency of excursions
    - External Factors: Weather adversities, Logistics Performance Index (LPI)
    
    Args:
        patient_id: Patient ID. Aggregates shipments belonging to this patient (within the same pharma).
        pharma_id: Pharmaceutical company ID from token
    
    Returns:
        Lane risk assessment with three main factors and their contributors.
    """
    db = SessionLocal()
    try:
        lane_risk_service = LaneRiskService(db)
        assessment = lane_risk_service.calculate_lane_risk_assessment(
            patient_id=patient_id,
            pharma_id=pharma_id
        )
        
        return LaneRiskAssessmentResponse(**assessment)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error calculating lane risk assessment: {str(e)}")
    finally:
        db.close()

