"""
Critical Alert Controller
Handles API endpoints for critical alerts in IVF system
"""
from fastapi import APIRouter, Depends, HTTPException, Request, Query, Path
from sqlalchemy.orm import Session
from typing import Optional

from app.config.database import get_db
from app.service.IVF.critical_alert_service import CriticalAlertService
from app.schemas.IVF.critical_alert_schema import (
    CriticalAlertResponse,
    CriticalAlertListResponse,
    AcknowledgeAlertRequest,
    AcknowledgeAlertResponse,
    CanisterAlertsResponse,
    HospitalAlertsResponse
)
from app.utils.ivf_helpers import get_branch_filter_info
from app.constants.enums import AlertStatus

router = APIRouter(prefix="/ivf/alerts", tags=["IVF Critical Alerts"])


@router.get("/canister/{canister_number}", response_model=CanisterAlertsResponse)
def get_canister_alerts(
    canister_number: str = Path(..., description="Canister number/code (e.g., 'C1')"),
    request: Request = None,
    db: Session = Depends(get_db)
):
    """
    Get all alerts for a specific canister.
    
    Returns all alerts (active and acknowledged) for the specified canister.
    
    Path Parameters:
    - canister_number: Canister number/code (e.g., 'C1')
    """
    try:
        branch_id, _ = get_branch_filter_info(request) if request else (None, None)
        service = CriticalAlertService(db)
        result = service.get_canister_alerts_by_number(canister_number, branch_id=branch_id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting canister alerts: {str(e)}")


@router.get("/hospital", response_model=HospitalAlertsResponse)
def get_hospital_alerts(
    request: Request,
    status: Optional[AlertStatus] = Query(None, description="Filter by alert status (Active, Acknowledged)"),
    db: Session = Depends(get_db)
):
    """
    Get all alerts for the hospital.
    
    Role-based access:
    - Manager: See alerts from all branches within the hospital
    - User: See alerts only from their assigned branch
    - Admin: See alerts from all branches
    
    Query Parameters:
    - status: Optional filter by alert status (Active or Acknowledged)
    """
    try:
        branch_id, role = get_branch_filter_info(request)
        service = CriticalAlertService(db)
        result = service.get_hospital_alerts(branch_id=branch_id, role=role, status=status)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting hospital alerts: {str(e)}")


@router.post("/acknowledge", response_model=AcknowledgeAlertResponse)
def acknowledge_alert(
    request_data: AcknowledgeAlertRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Acknowledge an alert.
    
    When an alert is acknowledged:
    - Status changes from Active to Acknowledged
    - acknowledged_by is set to the current user
    - acknowledged_at is set to current timestamp
    
    Note: Once acknowledged, the alert is removed from active alerts list.
    """
    try:
        # Get current user
        if not hasattr(request.state, "current_user"):
            raise HTTPException(status_code=401, detail="User not authenticated")
        
        user = request.state.current_user
        user_id = user.user_id
        
        service = CriticalAlertService(db)
        result = service.acknowledge_alert(request_data.alert_id, user_id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error acknowledging alert: {str(e)}")


@router.post("/check", response_model=CriticalAlertListResponse)
def check_and_create_alerts(
    canister_number: Optional[str] = Query(None, description="Optional canister number to check (e.g., 'C1'). If not provided, checks all canisters."),
    request: Request = None,
    db: Session = Depends(get_db)
):
    """
    Check for alerts and create them if needed.
    
    This endpoint:
    1. Checks for KPI deviations (temperature, humidity, agitation, light)
    2. Checks for quality loss events
    3. Checks for missing refill logs (not created within 3 days)
    4. Creates alerts if conditions are met
    5. Sends email notifications to relevant users
    
    Query Parameters:
    - canister_number: Optional. If provided, only checks the specified canister. Otherwise checks all active canisters.
    
    Returns list of newly created alerts.
    """
    try:
        branch_id, _ = get_branch_filter_info(request) if request else (None, None)
        service = CriticalAlertService(db)
        alerts = service.check_and_create_alerts(canister_number=canister_number, branch_id=branch_id)
        
        # Get canister numbers for all alerts
        canister_ids = [alert.canister_id for alert in alerts]
        from app.models.IVF.canister_model import Canister
        canisters = db.query(Canister).filter(Canister.canister_id.in_(canister_ids)).all()
        canister_number_map = {c.canister_id: c.canister_number for c in canisters}
        
        # Build alert responses with canister_number
        alert_responses = []
        for alert in alerts:
            alert_dict = {
                **alert.__dict__,
                'canister_number': canister_number_map.get(alert.canister_id)
            }
            alert_responses.append(CriticalAlertResponse.model_validate(alert_dict))
        
        active_count = sum(1 for a in alerts if a.status == AlertStatus.ACTIVE.value)
        acknowledged_count = len(alerts) - active_count
        
        return CriticalAlertListResponse(
            alerts=alert_responses,
            total_count=len(alert_responses),
            active_count=active_count,
            acknowledged_count=acknowledged_count
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error checking and creating alerts: {str(e)}")
