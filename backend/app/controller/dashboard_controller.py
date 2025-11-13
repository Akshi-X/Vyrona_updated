from fastapi import APIRouter, Depends
from datetime import datetime

from app.schemas.dashboard_schema import (
    DashboardCategoryResponse,
    CriticalAlert,
    CriticalAlertsResponse
)
from app.dependencies.auth_dependencies import get_pharma_id_from_request

router = APIRouter(tags=["Dashboard"])


# ---------------------------
# 1. Get Performance Metrics
# ---------------------------
@router.get("/performance", response_model=DashboardCategoryResponse)
def get_performance_metrics(pharma_id: int = Depends(get_pharma_id_from_request)):
    """
    Get performance metrics only.
    
    Protected endpoint. Auth token required; pharma_id taken from token.
    
    Args:
        pharma_id: Pharmaceutical company ID from token
    
    Returns:
    - On Time: 87%
    - Avg Lead Time: 23d
    """
    
    metrics = {
        "on_time_percentage": 87.0,
        "avg_lead_time_days": 8,
        "total_shipments": 30,
        "completed_shipments": 18,
        "pending_shipments": 12
    }
    
    return DashboardCategoryResponse(
        category="performance",
        metrics=metrics,
        last_updated=datetime.now(),
        status="success"
    )


# ---------------------------
# 2. Get Risk Metrics
# ---------------------------
@router.get("/risk", response_model=DashboardCategoryResponse)
def get_risk_metrics(pharma_id: int = Depends(get_pharma_id_from_request)):
    """
    Get risk metrics only.
    
    Protected endpoint. Auth token required; pharma_id taken from token.
    
    Args:
        pharma_id: Pharmaceutical company ID from token
    
    Returns:
    - Deviation: 12%
    - Top Risk Driver: Temperature
    """
    
    metrics = {
        "deviation_percentage": 12.0,
        "top_risk_driver": {
            "name": "Temperature",
            "percentage": 12.0,
            "severity": "Medium",
            "trend": "Stable"
        },
        "total_risks": 45,
        "high_risks": 8,
        "medium_risks": 22,
        "low_risks": 15
    }
    
    return DashboardCategoryResponse(
        category="risk",
        metrics=metrics,
        last_updated=datetime.now(),
        status="success"
    )


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
def get_logistics_metrics(pharma_id: int = Depends(get_pharma_id_from_request)):
    """
    Get logistics metrics only.
    
    Protected endpoint. Auth token required; pharma_id taken from token.
    
    Args:
        pharma_id: Pharmaceutical company ID from token
    
    Returns:
    - Cold Chain Packaging Failure: 4.2%
    - Avg Quality Lost/Patient: 23%
    """
    
    metrics = {
        "cold_chain_packaging_failure_percentage": 4.2,
        "avg_quality_lost_per_patient_percentage": 23.0,
        "total_shipments": 50,
        "successful_deliveries": 38,
        "failed_deliveries": 52,
        "average_transit_time_hours": 18.5
    }
    
    return DashboardCategoryResponse(
        category="logistics",
        metrics=metrics,
        last_updated=datetime.now(),
        status="success"
    )


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
