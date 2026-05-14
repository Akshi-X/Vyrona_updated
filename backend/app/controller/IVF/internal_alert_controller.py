"""
Internal Alert Controller
Service-to-service endpoints called by telemetry-service.
Authenticated via X-Internal-Api-Key header (shared secret), NOT JWT tokens.

These endpoints are added to PUBLIC_ENDPOINTS to bypass TokenValidationMiddleware,
but they validate the internal API key themselves.
"""
import logging
from datetime import datetime
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.config.config import settings
from app.models.IVF.tank_model import Tank
from app.service.IVF.critical_alert_service import CriticalAlertService
from app.constants.enums import AlertStatus

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/internal/alerts", tags=["Internal Alerts (Service-to-Service)"])


# ============================================
# API KEY VALIDATION
# ============================================

def validate_internal_api_key(
    x_internal_api_key: Optional[str] = Header(None, alias="X-Internal-Api-Key")
):
    """
    Validate the internal API key for service-to-service calls.
    Raises 401 if the key is missing or invalid.
    """
    expected_key = settings.INTERNAL_API_KEY
    if not expected_key:
        logger.error("INTERNAL_API_KEY not configured on dashboard-service. "
                      "Set INTERNAL_API_KEY in .env to enable telemetry-service integration.")
        raise HTTPException(
            status_code=503,
            detail="Internal API key not configured. Contact administrator."
        )

    if not x_internal_api_key or x_internal_api_key != expected_key:
        logger.warning("Invalid or missing X-Internal-Api-Key header on internal alert endpoint")
        raise HTTPException(status_code=401, detail="Invalid internal API key")


# ============================================
# REQUEST / RESPONSE SCHEMAS
# ============================================

class SendImmediateAlertRequest(BaseModel):
    """Request body for /send-immediate (called by telemetry-service after inserting quality log)"""
    tank_id: int = Field(..., description="Tank ID with the violation")
    quality_log_data: Dict[str, Any] = Field(..., description="Quality log data with violation flags")
    occurred_at: str = Field(..., description="ISO-format timestamp when violation occurred")


class CheckAndCreateAlertsRequest(BaseModel):
    """Request body for /check-and-create (called by telemetry-service after telemetry commit)"""
    tank_id: int = Field(..., description="Tank ID to check for alerts")
    branch_id: Optional[int] = Field(None, description="Optional branch ID filter")
    send_notifications: bool = Field(False, description="Whether to send email notifications")


class InternalAlertResponse(BaseModel):
    """Common response for internal alert endpoints"""
    success: bool
    message: str
    alerts: List[Dict[str, Any]] = Field(default_factory=list)


# ============================================
# ENDPOINTS
# ============================================

@router.post("/send-immediate", response_model=InternalAlertResponse)
def send_immediate_alert(
    request_data: SendImmediateAlertRequest,
    _: None = Depends(validate_internal_api_key),
    db: Session = Depends(get_db)
):
    """
    Trigger immediate alert email for a quality log violation.
    
    Called by telemetry-service (fire-and-forget) after inserting ivf_quality_log
    with violations detected. Sends email to branch users (<3 occurrences)
    or managers+users (>=3 occurrences in 24h).
    """
    try:
        # Parse occurred_at
        try:
            occurred_at = datetime.fromisoformat(request_data.occurred_at)
        except (ValueError, TypeError):
            occurred_at = datetime.utcnow()

        service = CriticalAlertService(db)
        service.send_immediate_alert_email(
            tank_id=request_data.tank_id,
            quality_log_data=request_data.quality_log_data,
            occurred_at=occurred_at
        )

        return InternalAlertResponse(
            success=True,
            message=f"Immediate alert email processing initiated for tank {request_data.tank_id}"
        )
    except Exception as e:
        logger.error(f"Error in /send-immediate for tank {request_data.tank_id}: {e}", exc_info=True)
        # Return 200 with success=False — telemetry should not retry alerts
        return InternalAlertResponse(
            success=False,
            message=f"Error processing immediate alert: {str(e)}"
        )


@router.post("/check-and-create", response_model=InternalAlertResponse)
def check_and_create_alerts(
    request_data: CheckAndCreateAlertsRequest,
    _: None = Depends(validate_internal_api_key),
    db: Session = Depends(get_db)
):
    """
    Check for alerts and create/update alert records in the database.
    
    Called by telemetry-service after successfully committing ivf_telemetry_data
    when violations were detected. Scans quality logs (last 24h), creates
    deduplicated alert records, and optionally sends email notifications.
    """
    try:
        service = CriticalAlertService(db)

        alerts = service.check_and_create_alerts(
            tank_id=request_data.tank_id,
            branch_id=request_data.branch_id,
            send_notifications=request_data.send_notifications
        )

        # Build serializable alert dicts
        alert_dicts = []
        for alert in alerts:
            alert_dicts.append({
                "alert_id": alert.alert_id,
                "tank_id": alert.tank_id,
                "alert_type": alert.alert_type,
                "severity": alert.severity,
                "status": alert.status,
                "message": alert.message,
                "dedup_key": alert.dedup_key
            })

        return InternalAlertResponse(
            success=True,
            message=f"Checked and created/updated {len(alerts)} alert(s) for tank {request_data.tank_id}",
            alerts=alert_dicts
        )
    except Exception as e:
        logger.error(f"Error in /check-and-create for tank {request_data.tank_id}: {e}", exc_info=True)
        return InternalAlertResponse(
            success=False,
            message=f"Error checking/creating alerts: {str(e)}"
        )
