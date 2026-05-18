"""
Internal Refill Detection Controller
Service-to-service endpoint called by telemetry-service when an LN2 refill
is automatically detected from IoT sensor data.

Authenticated via X-Internal-Api-Key header (shared secret), NOT JWT tokens.
Added to PUBLIC_ENDPOINTS to bypass TokenValidationMiddleware.
"""
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.config.config import settings
from app.service.IVF.refill_detection_service import RefillDetectionService

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/internal/refill-detections",
    tags=["Internal Refill Detections (Service-to-Service)"],
)


# ============================================
# API KEY VALIDATION
# ============================================

def validate_internal_api_key(
    x_internal_api_key: Optional[str] = Header(None, alias="X-Internal-Api-Key"),
):
    """Validate the shared internal API key for service-to-service calls."""
    expected_key = settings.INTERNAL_API_KEY
    if not expected_key:
        logger.error(
            "INTERNAL_API_KEY not configured on dashboard-service. "
            "Set INTERNAL_API_KEY in .env to enable telemetry-service integration."
        )
        raise HTTPException(
            status_code=503,
            detail="Internal API key not configured. Contact administrator.",
        )
    if not x_internal_api_key or x_internal_api_key != expected_key:
        logger.warning("Invalid or missing X-Internal-Api-Key on refill-detection endpoint")
        raise HTTPException(status_code=401, detail="Invalid internal API key")


# ============================================
# REQUEST / RESPONSE SCHEMAS
# ============================================

class RefillDetectionRequest(BaseModel):
    """Payload sent by telemetry-service when a refill event is detected."""
    tank_id: int = Field(..., description="Tank ID on which the refill was detected")
    refill_weight: Optional[float] = Field(
        None, description="Estimated LN2 added in kg (mass_after - mass_before)"
    )
    detected_at: str = Field(
        ..., description="ISO-format timestamp when the refill was detected"
    )


class RefillDetectionResponse(BaseModel):
    """Response returned after storing the detection record."""
    success: bool
    message: str
    detection_id: Optional[int] = None
    tank_id: Optional[int] = None
    branch_id: Optional[int] = None
    hospital_id: Optional[int] = None
    detected_at: Optional[str] = None


# ============================================
# ENDPOINT
# ============================================

@router.post("", response_model=RefillDetectionResponse)
def create_refill_detection(
    request_data: RefillDetectionRequest,
    _: None = Depends(validate_internal_api_key),
    db: Session = Depends(get_db),
):
    """
    Record an automatically detected LN2 refill event.

    Called by telemetry-service (fire-and-forget) when refill_detected=True
    is observed in a sensor reading. Looks up branch_id and hospital_id from
    the tanks table and persists a row in ln2_refill_detections.
    """
    try:
        try:
            detected_at = datetime.fromisoformat(request_data.detected_at)
        except (ValueError, TypeError):
            detected_at = datetime.utcnow()
            logger.warning(
                f"Could not parse detected_at='{request_data.detected_at}' "
                f"for tank {request_data.tank_id}; using utcnow."
            )

        service = RefillDetectionService(db)
        detection = service.create_detection(
            tank_id=request_data.tank_id,
            refill_weight=request_data.refill_weight,
            detected_at=detected_at,
        )

        return RefillDetectionResponse(
            success=True,
            message=f"Refill detection stored for tank {request_data.tank_id}",
            detection_id=detection.id,
            tank_id=detection.tank_id,
            branch_id=detection.branch_id,
            hospital_id=detection.hospital_id,
            detected_at=detection.detected_at.isoformat() if detection.detected_at else None,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            f"Error storing refill detection for tank {request_data.tank_id}: {e}",
            exc_info=True,
        )
        # Return 200 with success=False — telemetry-service should not retry on app errors
        return RefillDetectionResponse(
            success=False,
            message=f"Error storing refill detection: {str(e)}",
        )
