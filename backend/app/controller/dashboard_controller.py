from fastapi import APIRouter, Depends
from datetime import datetime
from sqlalchemy.orm import Session

from app.schemas.dashboard_schema import (
    DashboardCategoryResponse,
    CriticalAlert,
    CriticalAlertsResponse,
    AvgLeadTimeResponse,
    OnTimePercentageResponse,
    SuccessRateResponse,
    AvgQualityDeviationsResponse
)
from app.dependencies.auth_dependencies import get_pharma_id_from_request
from app.config.database import get_db
from app.service.dashboard_service import DashboardService

router = APIRouter(tags=["Dashboard"])


# ---------------------------
# 1. Get Performance Metrics
# ---------------------------
@router.get("/performance", response_model=DashboardCategoryResponse)
def get_performance_metrics(
    pharma_id: int = Depends(get_pharma_id_from_request),
    db: Session = Depends(get_db)
):
    """
    Get performance metrics only.
    
    Protected endpoint. Auth token required; pharma_id taken from token.
    
    Args:
        pharma_id: Pharmaceutical company ID from token
    
    Returns:
    - On Time: 87%
    - Avg Lead Time: 23d
    """
    
    dashboard_service = DashboardService(db)
    return dashboard_service.get_performance_metrics(pharma_id)


@router.get("/performance/avg-lead-time", response_model=AvgLeadTimeResponse)
def get_average_lead_time(
    pharma_id: int = Depends(get_pharma_id_from_request),
    db: Session = Depends(get_db)
):
    """Return only the average lead time metrics for the authenticated pharma."""
    dashboard_service = DashboardService(db)
    return dashboard_service.get_average_lead_time(pharma_id)


@router.get("/performance/on-time-percentage", response_model=OnTimePercentageResponse)
def get_on_time_percentage(
    pharma_id: int = Depends(get_pharma_id_from_request),
    db: Session = Depends(get_db)
):
    """
    Return only the on-time percentage metrics for the authenticated pharma.
    
    Calculates On-Time Percentage for current month:
    - On-Time % = (On-Time Deliveries ÷ Total Deliveries) × 100
    - On-Time Deliveries = Sum(Is Actual Handover Time ≤ Estimated Handover Time ? YES → On-Time)
    
    Protected endpoint. Auth token required; pharma_id taken from token.
    
    Returns:
        - on_time_percentage: Percentage of on-time deliveries
        - on_time_deliveries: Count of on-time deliveries
        - total_deliveries: Total deliveries with both handover_time and scheduled_time
    """
    dashboard_service = DashboardService(db)
    result = dashboard_service.get_on_time_percentage(pharma_id)
    return OnTimePercentageResponse(**result)


@router.get("/performance/success-rate", response_model=SuccessRateResponse)
def get_success_rate(
    pharma_id: int = Depends(get_pharma_id_from_request),
    db: Session = Depends(get_db)
):
    """
    Return treatment success rate:
    Success Rate = (Successful Outcomes ÷ Total Outcomes) × 100
    Counts completed patient stages (non-active) scoped to the authenticated pharma.
    """
    dashboard_service = DashboardService(db)
    return dashboard_service.get_success_rate(pharma_id)


@router.get("/performance/avg-quality-deviations", response_model=AvgQualityDeviationsResponse)
def get_avg_quality_deviations(
    pharma_id: int = Depends(get_pharma_id_from_request),
    db: Session = Depends(get_db)
):
    """
    Return average quality deviations flagged per shipment for current month.
    
    This metric replaces the Treatments count widget.
    Represents the average number of quality issues detected per shipment or treatment process,
    such as temperature excursions, humidity spikes, shock events, seal breaks, or location-based deviations.
    These are captured directly from IoT sensors or stakeholder inputs.
    
    Formula: Quality Deviations Flagged = monthly total (total deviation per shipment) / monthly total treatment
    
    Protected endpoint. Auth token required; pharma_id taken from token.
    
    Returns:
        - avg_quality_deviations: Average count of all deviations recorded per treatment per month
        - total_deviations: Total number of quality deviations in the current month
        - total_treatments: Total number of treatments (patients with shipments) in the current month
    """
    dashboard_service = DashboardService(db)
    return dashboard_service.get_avg_quality_deviations(pharma_id)


# ---------------------------
# 2. Get Risk Metrics
# ---------------------------
@router.get("/risk", response_model=DashboardCategoryResponse)
def get_risk_metrics(
    pharma_id: int = Depends(get_pharma_id_from_request),
    db: Session = Depends(get_db)
):
    """
    Get risk metrics only.
    
    Protected endpoint. Auth token required; pharma_id taken from token.
    
    Args:
        pharma_id: Pharmaceutical company ID from token
    
    Returns:
    - Risk Deviation: difference between observed risk score and baseline threshold
    - Top Risk Driver: risk factor with highest combined impact (frequency × severity)
    """
    
    dashboard_service = DashboardService(db)
    return dashboard_service.get_risk_metrics(pharma_id)


# ---------------------------
# 3. Get Compliance Metrics
# ---------------------------
@router.get("/compliance", response_model=DashboardCategoryResponse)
def get_compliance_metrics(pharma_id: int = Depends(get_pharma_id_from_request)):
    """
    Get compliance metrics only.
    
    Protected endpoint. Auth token required; pharma_id taken from token.
    
    Args:
        pharma_id: Pharmaceutical company ID from token
    
    Returns:
    - Audit Coverage: 76%
    - Emissions per Treatment: 424 tCO2e
    """
    
    metrics = {
        "audit_coverage_percentage": 76.0,
        "emissions_per_treatment_tco2e": 424.0,
        "total_audits": 48,
        "passed_audits": 36,
        "failed_audits": 4,
        "pending_audits": 8
    }
    
    return DashboardCategoryResponse(
        category="compliance",
        metrics=metrics,
        last_updated=datetime.now(),
        status="success"
    )


# ---------------------------
# 5. Get Logistics Metrics
# ---------------------------
@router.get("/logistics", response_model=DashboardCategoryResponse)
def get_logistics_metrics(
    pharma_id: int = Depends(get_pharma_id_from_request),
    db: Session = Depends(get_db)
):
    """
    Get logistics metrics only.
    
    Protected endpoint. Auth token required; pharma_id taken from token.
    
    Args:
        pharma_id: Pharmaceutical company ID from token
    
    Returns:
    - Cold Chain Packaging Failure: percentage of shipments with IoT metric violations
    - Avg Quality Lost/Patient: average quality loss percentage across all patients
    """
    
    dashboard_service = DashboardService(db)
    return dashboard_service.get_logistics_metrics(pharma_id)


# ---------------------------
# 6. Get Critical Alerts
# ---------------------------
@router.get("/alerts", response_model=CriticalAlertsResponse)
def get_critical_alerts(pharma_id: int = Depends(get_pharma_id_from_request)):
    """
    Get critical alerts that require immediate attention.
    
    Protected endpoint. Auth token required; pharma_id taken from token.
    
    Args:
        pharma_id: Pharmaceutical company ID from token
    
    Returns alerts from the Critical Alerts modal:
    - Temperature Excursion (High severity, Active)
    - Delay Alert (Medium severity, Acknowledged) 
    - Quality Issue (High severity, Active)
    """
    
    # Mock alerts data from the modal image
    alerts = [
        CriticalAlert(
            id="alert_001",
            type="Temperature Excursion",
            severity="High",
            patient_id="20812457",
            message="Temperature exceeded 8°C for 15 minutes during transport",
            timestamp=datetime(2024, 5, 28, 14, 30),
            status="Active"
        ),
        CriticalAlert(
            id="alert_002",
            type="Delay Alert",
            severity="Medium",
            patient_id="AB123456",
            message="Manufacturing delay of 2 hours detected",
            timestamp=datetime(2024, 5, 28, 12, 15),
            status="Acknowledged"
        ),
        CriticalAlert(
            id="alert_003",
            type="Quality Issue",
            severity="High",
            patient_id="CD789012",
            message="Cell viability below threshold at 85%",
            timestamp=datetime(2024, 5, 28, 9, 45),
            status="Active"
        )
    ]
    
    # Calculate summary statistics
    total_alerts = len(alerts)
    active_alerts = len([alert for alert in alerts if alert.status == "Active"])
    acknowledged_alerts = len([alert for alert in alerts if alert.status == "Acknowledged"])
    resolved_alerts = len([alert for alert in alerts if alert.status == "Resolved"])
    
    return CriticalAlertsResponse(
        total_alerts=total_alerts,
        active_alerts=active_alerts,
        acknowledged_alerts=acknowledged_alerts,
        resolved_alerts=resolved_alerts,
        alerts=alerts,
        last_updated=datetime.now()
    )
