"""
Critical Alert Controller
Handles API endpoints for critical alerts in IVF system
"""
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request, Query, Path
from sqlalchemy.orm import Session
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
from app.config.config import settings
from app.config.database import get_db
from app.models import Readings, KpiConfig
from app.models.IVF.tank_model import Tank
from app.models.IVF.critical_alert_model import CriticalAlert
from app.models.IVF.hospital_branch_model import HospitalBranch
from app.models.IVF.refrigerator_model import Refrigerator
from app.models.IVF.incubator_model import Incubator
from app.service.aws_sns_service import sns_service
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
from app.constants.enums import AlertStatus, AlertType, AlertSource, AlertSeverity, AlertTriggeredBy
from app.service.activity_log_service import ActivityLogService, build_actor_from_user, build_target
from app.constants.enums import ActivityOutcome

logger = logging.getLogger(__name__)

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


@router.get("/hospital/incubators", response_model=HospitalAlertsResponse)
def get_hospital_incubator_alerts(
    request: Request,
    status: Optional[AlertStatus] = Query(None, description="Filter by alert status (Active, Acknowledged)"),
    db: Session = Depends(get_db)
):
    """
    Get all incubator alerts for the hospital (incubator_id IS NOT NULL).
    Scoped to the user's branch (User) or hospital (Manager/Admin).
    """
    try:
        branch_id, role = get_branch_filter_info(request)
        hospital_id = getattr(getattr(request.state, "current_user", None), "hospital_id", None)
        service = CriticalAlertService(db)
        return service.get_hospital_incubator_alerts(
            branch_id=branch_id, hospital_id=hospital_id, role=role, status=status
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting hospital incubator alerts: {str(e)}")


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

        # Enforce IVF-department access (raises 403 for non-IVF tokens).
        get_branch_filter_info(request)

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
        msg = str(e)
        if "not found" in msg.lower():
            raise HTTPException(status_code=404, detail=msg)
        raise HTTPException(status_code=400, detail=msg)
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


class CheckIncubatorKpiRequest(BaseModel):
    incubator_id: int
    chamber_id: Optional[str] = None


@router.post("/check_kpi_incubator")
def check_and_create_incubator_kpi_deviation_alerts(
    payload: CheckIncubatorKpiRequest,
    db: Session = Depends(get_db),
):
    """
    Check unchecked KPI deviation readings for an incubator chamber and create alerts.

    Request Body:
    incubator_id: the incubator id to check.
    chamber_id: optional chamber to scope the check.

    Returns:
    A list of newly created alerts.
    """
    try:
        service = CriticalAlertService(db)
        alerts = service.check_and_create_alert_for_incubator_kpi_deviations(
            payload.incubator_id, payload.chamber_id
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
        raise HTTPException(status_code=500, detail=f"Error checking incubator alerts: {str(e)}")


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


class SimulateDeviationRequest(BaseModel):
    device_type: str = "tank"  # "tank" | "refrigerator" | "incubator"
    device_id: int = 4
    metric_name: str = "temp_internal"
    breach_value: float = -110.0
    phone_number: Optional[str] = None
    recipient_email: Optional[str] = "steezyadopted@gmail.com"


@router.post("/simulate_deviation")
def simulate_live_deviation(
    payload: SimulateDeviationRequest,
    db: Session = Depends(get_db),
):
    """
    Live Deviation Trigger Endpoint.
    Simulates a live sensor breach, ingests the reading, triggers deviation evaluation,
    creates a CriticalAlert in PostgreSQL, and dispatches multi-channel notifications (Email, Web Push, AWS SNS).
    """
    try:
        now_utc = datetime.now(timezone.utc)
        created_alerts = []
        device_label = f"{payload.device_type.capitalize()} #{payload.device_id}"
        service = CriticalAlertService(db)

        if payload.device_type.lower() == "tank":
            tank = db.query(Tank).filter(Tank.tank_id == payload.device_id).first()
            if not tank:
                raise HTTPException(status_code=404, detail=f"Tank with ID {payload.device_id} not found")
            device_label = tank.tank_code or f"Tank #{tank.tank_id}"

            # Look up branch and hospital
            branch = db.query(HospitalBranch).filter(HospitalBranch.branch_id == tank.branch_id).first()
            hospital_id = branch.hospital_id if branch else 1
            branch_id = tank.branch_id or (branch.branch_id if branch else 1)

            # Look up matching KPI config
            kpi = (
                db.query(KpiConfig)
                .filter(
                    KpiConfig.hospital_id == hospital_id,
                    KpiConfig.kpi_name == payload.metric_name,
                    KpiConfig.status == True,
                )
                .first()
            )
            if not kpi:
                kpi = (
                    db.query(KpiConfig)
                    .filter(
                        KpiConfig.kpi_name == payload.metric_name,
                        KpiConfig.status == True,
                    )
                    .first()
                )
            if not kpi:
                kpi = (
                    db.query(KpiConfig)
                    .filter(
                        KpiConfig.hospital_id == hospital_id,
                        KpiConfig.status == True,
                    )
                    .first()
                )
            kpi_id = kpi.id if kpi else 2

            # Insert reading with deviation = True, checked = False
            reading = Readings(
                hospital_id=hospital_id,
                branch_id=branch_id,
                tank_id=tank.tank_id,
                kpi_config_id=kpi_id,
                kpi_value=payload.breach_value,
                deviation=True,
                checked=False,
                timestamp=now_utc,
            )
            db.add(reading)
            db.commit()

            # Trigger real-time deviation check & alert creation pipeline
            created_alerts = service.check_and_create_alert_for_kpi_deviations(tank.tank_id)

            # If cooldown suppressed duplicate creation, fetch existing active alert or generate simulated alert
            if not created_alerts:
                existing_active = (
                    db.query(CriticalAlert)
                    .filter(
                        CriticalAlert.tank_id == tank.tank_id,
                        CriticalAlert.status == AlertStatus.ACTIVE.value,
                    )
                    .order_by(CriticalAlert.created_at.desc())
                    .first()
                )
                if existing_active:
                    created_alerts = [existing_active]
                else:
                    alert, _ = service._create_alert(
                        tank_id=tank.tank_id,
                        alert_type=AlertType.DEVIATION_ALERT,
                        source=AlertSource.KPI,
                        severity=AlertSeverity.HIGH,
                        message=service._frame_alert_message(
                            kpi,
                            payload.breach_value,
                            branch_name=branch.branch_name if branch else "Main Branch",
                            device_noun="Tank",
                            device_label=device_label,
                            tank_id=tank.tank_id,
                        ),
                        occurred_at=now_utc,
                        triggered_by=AlertTriggeredBy.SYSTEM,
                        extra_info=str(kpi_id),
                    )
                    if alert:
                        created_alerts = [alert]

        elif payload.device_type.lower() == "refrigerator":
            refrig = db.query(Refrigerator).filter(Refrigerator.refrigerator_id == payload.device_id).first()
            if not refrig:
                raise HTTPException(status_code=404, detail=f"Refrigerator with ID {payload.device_id} not found")
            device_label = refrig.refrigerator_code or f"Refrigerator #{refrig.refrigerator_id}"
            created_alerts = service.check_and_create_alert_for_refrigerator_kpi_deviations(refrig.refrigerator_id)
            if not created_alerts:
                existing_active = (
                    db.query(CriticalAlert)
                    .filter(
                        CriticalAlert.refrigerator_id == refrig.refrigerator_id,
                        CriticalAlert.status == AlertStatus.ACTIVE.value,
                    )
                    .order_by(CriticalAlert.created_at.desc())
                    .first()
                )
                if existing_active:
                    created_alerts = [existing_active]

        elif payload.device_type.lower() == "incubator":
            incub = db.query(Incubator).filter(Incubator.incubator_id == payload.device_id).first()
            if not incub:
                raise HTTPException(status_code=404, detail=f"Incubator with ID {payload.device_id} not found")
            device_label = incub.incubator_code or f"Incubator #{incub.incubator_id}"
            created_alerts = service.check_and_create_alert_for_incubator_kpi_deviations(incub.incubator_id)
            if not created_alerts:
                existing_active = (
                    db.query(CriticalAlert)
                    .filter(
                        CriticalAlert.incubator_id == incub.incubator_id,
                        CriticalAlert.status == AlertStatus.ACTIVE.value,
                    )
                    .order_by(CriticalAlert.created_at.desc())
                    .first()
                )
                if existing_active:
                    created_alerts = [existing_active]

        else:
            raise HTTPException(status_code=400, detail="Invalid device_type. Supported: tank, refrigerator, incubator")

        # Always trigger AWS SNS broadcast (Topic subscribers + direct SMS if phone provided)
        sns_dispatch_result = None
        if created_alerts:
            latest_alert = created_alerts[-1]
            sns_dispatch_result = sns_service.publish_critical_alert(
                latest_alert,
                device_label=device_label,
                target_phone=payload.phone_number,
            )

        # Dispatch rich HTML email template via configured SMTP
        email_dispatch_result = None
        target_email = payload.recipient_email or settings.SENDER_EMAIL or "steezyadopted@gmail.com"
        if created_alerts and target_email and settings.SMTP_SERVER:
            try:
                latest_alert = created_alerts[-1]
                from collections import namedtuple
                MockUser = namedtuple("MockUser", ["user_id", "email", "name"])
                mock_user = MockUser(user_id="SIM-USER-1", email=target_email, name="Steezy / Lab Director")
                branch, ctx = service._resolve_alert_email_context(latest_alert)
                if not branch:
                    branch = db.query(HospitalBranch).first()
                if not ctx:
                    ctx = {
                        "device_label": device_label,
                        "device_noun": "Tank",
                        "device_code": device_label,
                        "zone_name": "Storage Area",
                        "is_cryotank": True,
                    }
                service._dispatch_alert_emails(
                    latest_alert,
                    [mock_user],
                    branch,
                    ctx,
                    alert_name=payload.metric_name,
                    kpi_name=payload.metric_name,
                    first_alert_value=f"{payload.breach_value:.2f}°C",
                    current_value=f"{payload.breach_value:.2f}°C",
                )
                email_dispatch_result = {"status": "sent", "recipient": target_email, "template": "critical_alert_email.html"}
            except Exception as mail_exc:
                logger.error("Failed to send rich HTML alert email: %s", mail_exc)
                email_dispatch_result = {"status": "failed", "error": str(mail_exc)}

        logger.info(
            "\n"
            "======================================================================\n"
            "🚨 LIVE DEVIATION SIMULATED & TRIGGERED\n"
            "----------------------------------------------------------------------\n"
            "Device:       %s\n"
            "Metric:       %s (Breach Value: %s)\n"
            "Timestamp:    %s\n"
            "Alerts Raised: %s\n"
            "======================================================================",
            device_label,
            payload.metric_name,
            payload.breach_value,
            now_utc.isoformat(),
            len(created_alerts),
        )

        return {
            "status": "success",
            "message": f"Live deviation triggered for {device_label}",
            "device": device_label,
            "metric": payload.metric_name,
            "breach_value": payload.breach_value,
            "timestamp": now_utc.isoformat(),
            "alerts_created": len(created_alerts),
            "alerts": [
                {
                    "alert_id": getattr(a, "alert_id", str(a)),
                    "alert_type": getattr(a, "alert_type", "Deviation alert"),
                    "severity": getattr(a, "severity", "High"),
                    "message": getattr(a, "message", ""),
                    "status": getattr(a, "status", "Active"),
                }
                for a in created_alerts
            ],
            "sns_dispatch": sns_dispatch_result or {"topic_published": False, "mode": "simulated"},
            "email_dispatch": email_dispatch_result or {"status": "skipped", "reason": "No target email or smtp4dev active"},
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to simulate live deviation: %s", e)
        raise HTTPException(status_code=500, detail=f"Error simulating live deviation: {str(e)}")

