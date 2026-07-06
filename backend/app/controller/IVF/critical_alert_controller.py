"""
Critical Alert Controller
Handles API endpoints for critical alerts in IVF system
"""
from fastapi import APIRouter, Depends, HTTPException, Request, Query, Path
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel
from app.config.database import get_db
from app.models.IVF.tank_model import Tank
from app.models.IVF.critical_alert_model import CriticalAlert
from app.models.IVF.hospital_branch_model import HospitalBranch
from app.service.IVF.critical_alert_service import CriticalAlertService
from app.exceptions.custom_exceptions import AppException
from app.schemas.IVF.critical_alert_schema import (
    CriticalAlertResponse,
    CriticalAlertListResponse,
    AcknowledgeAlertRequest,
    AcknowledgeAlertResponse,
    AcknowledgeAlertsRequest,
    AcknowledgeAlertsResponse,
    IncubatorAlertsResponse,
    RefrigeratorAlertsResponse,
    TankAlertsResponse,
    HospitalAlertsResponse
)
from app.utils.ivf_helpers import get_branch_filter_info
from app.constants.enums import AlertStatus
from app.service.activity_log_service import ActivityLogService, build_actor_from_user, build_target
from app.constants.enums import ActivityOutcome

router = APIRouter(prefix="/ivf/alerts", tags=["IVF Critical Alerts"])


@router.get("/tank/{tank_id}", response_model=TankAlertsResponse)
def get_tank_alerts(
    tank_id: int = Path(..., description="Tank ID"),
    request: Request = None,
    db: Session = Depends(get_db)
):
    """
    Get all alerts for a specific tank (tank-level monitoring).
    
    Returns all alerts (active and acknowledged) for the specified tank.
    
    Path Parameters:
    - tank_id: Tank ID
    """
    try:
        branch_id, _ = get_branch_filter_info(request) if request else (None, None)
        service = CriticalAlertService(db)
        result = service.get_tank_alerts(tank_id, branch_id=branch_id)
        return result
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting tank alerts: {str(e)}")


@router.get("/incubator/{incubator_id}", response_model=IncubatorAlertsResponse)
def get_incubator_alerts(
    incubator_id: int = Path(..., description="Incubator ID"),
    chamber_id: Optional[str] = Query(None, description="Filter by chamber (None = all chambers)"),
    request: Request = None,
    db: Session = Depends(get_db)
):
    """Get all alerts for a specific incubator, optionally filtered by chamber."""
    try:
        branch_id, _ = get_branch_filter_info(request) if request else (None, None)
        hospital_id = getattr(getattr(request.state, "current_user", None), "hospital_id", None) if request else None
        service = CriticalAlertService(db)
        result = service.get_incubator_alerts(incubator_id, chamber_id=chamber_id, branch_id=branch_id, hospital_id=hospital_id)
        return result
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting incubator alerts: {str(e)}")


@router.get("/refrigerator/{refrigerator_id}", response_model=RefrigeratorAlertsResponse)
def get_refrigerator_alerts(
    refrigerator_id: int = Path(..., description="Refrigerator ID"),
    request: Request = None,
    db: Session = Depends(get_db)
):
    """Get all alerts for a specific refrigerator."""
    try:
        branch_id, _ = get_branch_filter_info(request) if request else (None, None)
        hospital_id = getattr(getattr(request.state, "current_user", None), "hospital_id", None) if request else None
        service = CriticalAlertService(db)
        result = service.get_refrigerator_alerts(refrigerator_id, branch_id=branch_id, hospital_id=hospital_id)
        return result
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting refrigerator alerts: {str(e)}")


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
        hospital_id = getattr(getattr(request.state, "current_user", None), "hospital_id", None)
        service = CriticalAlertService(db)
        result = service.get_hospital_alerts(branch_id=branch_id, hospital_id=hospital_id, role=role, status=status)
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting hospital alerts: {str(e)}")


@router.get("/hospital/refrigerators", response_model=HospitalAlertsResponse)
def get_hospital_refrigerator_alerts(
    request: Request,
    status: Optional[AlertStatus] = Query(None, description="Filter by alert status (Active, Acknowledged)"),
    db: Session = Depends(get_db)
):
    """
    Get all refrigerator alerts for the hospital (refrigerator_id IS NOT NULL).
    Scoped to the user's branch (User) or hospital (Manager/Admin).
    """
    try:
        branch_id, role = get_branch_filter_info(request)
        hospital_id = getattr(getattr(request.state, "current_user", None), "hospital_id", None)
        service = CriticalAlertService(db)
        return service.get_hospital_refrigerator_alerts(
            branch_id=branch_id, hospital_id=hospital_id, role=role, status=status
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting hospital refrigerator alerts: {str(e)}")


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
        result = service.acknowledge_alert(request_data.alert_id, user_id, request_data.acknowledgment_reason)
        alert = (
            db.query(CriticalAlert)
            .filter(CriticalAlert.alert_id == request_data.alert_id)
            .first()
        )
        tank = None
        branch = None
        if alert and alert.tank_id:
            tank = (
                db.query(Tank)
                .filter(Tank.tank_id == alert.tank_id)
                .first()
            )
            if tank and tank.branch_id is not None:
                branch = (
                    db.query(HospitalBranch)
                    .filter(HospitalBranch.branch_id == tank.branch_id)
                    .first()
                )
        ActivityLogService(db).log_activity(
            action="alert.acknowledged",
            outcome=ActivityOutcome.SUCCESS.value,
            actor=build_actor_from_user(user),
            target=build_target("alert", request_data.alert_id),
            metadata={
                "status": AlertStatus.ACKNOWLEDGED.value,
                "tank_id": alert.tank_id if alert else None,
                "tank_code": tank.tank_code if tank else None,
                "branch_id": tank.branch_id if tank else None,
                "branch_name": branch.branch_name if branch else None,
                "acknowledgment_reason": request_data.acknowledgment_reason,
            },
            audit_log_disabled=getattr(request.state, "audit_log_disabled", False),
        )
        return result
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        # Check if it's an AppException
        if isinstance(e, AppException):
            raise HTTPException(status_code=e.status_code, detail=e.message)
        raise HTTPException(status_code=500, detail=f"Error acknowledging alert: {str(e)}")


@router.post("/acknowledge-all", response_model=AcknowledgeAlertsResponse)
def acknowledge_alerts(
    request_data: AcknowledgeAlertsRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Acknowledge multiple alerts in one request.

    Request body:
    - alert_id: Array of alert UUIDs to acknowledge
    """
    try:
        if not hasattr(request.state, "current_user"):
            raise HTTPException(status_code=401, detail="User not authenticated")

        user = request.state.current_user
        user_id = user.user_id

        service = CriticalAlertService(db)
        result = service.acknowledge_alerts(request_data.alert_id, user_id, request_data.acknowledgment_reason)

        ActivityLogService(db).log_activity(
            action="alert.acknowledged_all",
            outcome=ActivityOutcome.SUCCESS.value,
            actor=build_actor_from_user(user),
            target=build_target("alert", "bulk"),
            metadata={
                "status": AlertStatus.ACKNOWLEDGED.value,
                "alert_id": request_data.alert_id,
                "acknowledged_count": result.acknowledged_count,
                "acknowledgment_reason": request_data.acknowledgment_reason,
            },
            audit_log_disabled=getattr(request.state, "audit_log_disabled", False),
        )
        return result
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        if isinstance(e, AppException):
            raise HTTPException(status_code=e.status_code, detail=e.message)
        raise HTTPException(status_code=500, detail=f"Error acknowledging alerts: {str(e)}")

class CheckKpiRequest(BaseModel):
    tank_id: int | None = None

@router.post("/check_kpi")
def check_and_create_kpi_deviation_alerts(
    payload: CheckKpiRequest,
    request: Request = None,
    db: Session = Depends(get_db),
):
    """
    Check any deviations in the kpi readings and create alert for the same

    Request Body:
    tank_id: the tank id for which the deviations to be checked.

    Returns:
    A list of newly created alerts.
    """  

    try:
        service = CriticalAlertService(db)
        tank_id = payload.tank_id
        if tank_id:
            alerts = service.check_and_create_alert_for_kpi_deviations(tank_id)

            return CriticalAlertListResponse(
                acknowledged_count=0,
                active_count=len(alerts),
                alerts=alerts,
                total_count=len(alerts),
            )
        else:
            raise HTTPException(status_code=401, detail=str("Send the tank_id in body"))
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error checking and creating alerts: {str(e)}")


class CheckRefrigeratorKpiRequest(BaseModel):
    refrigerator_id: int
    zone_id: Optional[str] = None


@router.post("/check_kpi_refrigerator")
def check_and_create_refrigerator_kpi_deviation_alerts(
    payload: CheckRefrigeratorKpiRequest,
    db: Session = Depends(get_db),
):
    """
    Check unchecked KPI deviation readings for a refrigerator zone and create alerts.

    Request Body:
    refrigerator_id: the refrigerator id to check.
    zone_id: optional zone to scope the check.

    Returns:
    A list of newly created alerts.
    """
    try:
        service = CriticalAlertService(db)
        alerts = service.check_and_create_alert_for_refrigerator_kpi_deviations(
            payload.refrigerator_id, payload.zone_id
        )
        return CriticalAlertListResponse(
            acknowledged_count=0,
            active_count=len(alerts),
            alerts=alerts,
            total_count=len(alerts),
        )
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error checking refrigerator alerts: {str(e)}")


@router.post("/check", response_model=CriticalAlertListResponse)
def check_and_create_alerts(
    tank_code: Optional[str] = Query(None, description="Optional tank code to check (e.g., 'T1'). If not provided, checks all active tanks."),
    request: Request = None,
    db: Session = Depends(get_db)
):
    """
    Check for alerts and create them if needed (tank-level monitoring).
    
    This endpoint:
    1. Checks for KPI deviations (internal/external temperature and shock)
    2. Checks for quality loss events
    3. Checks for missing refill logs (not created within 3 days)
    4. Creates alerts if conditions are met
    5. Sends email notifications to relevant users
    
    Query Parameters:
    - tank_code: Optional. If provided, only checks the specified tank. Otherwise checks all active tanks.
    
    Returns list of newly created alerts.
    """
    try:
        branch_id, _ = get_branch_filter_info(request) if request else (None, None)
        service = CriticalAlertService(db)
        
        # Resolve tank_code to tank_id if provided
        tank_id = None
        if tank_code:
            tank = db.query(Tank).filter(Tank.tank_code == tank_code).first()
            if tank:
                tank_id = tank.tank_id
            else:
                raise HTTPException(status_code=404, detail=f"Tank '{tank_code}' not found")
        
        alerts = service.check_and_create_alerts(tank_id=tank_id, branch_id=branch_id)
        
        # Get tank codes for all alerts
        tank_ids = [alert.tank_id for alert in alerts]
        tanks = db.query(Tank).filter(Tank.tank_id.in_(tank_ids)).all()
        tank_code_map = {t.tank_id: t.tank_code for t in tanks}
        
        # Build alert responses with tank_code
        alert_responses = []
        for alert in alerts:
            tank_code = tank_code_map.get(alert.tank_id) or f"Tank-{alert.tank_id}"
            alert_dict = {
                **alert.__dict__,
                'tank_code': tank_code
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
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error checking and creating alerts: {str(e)}")
