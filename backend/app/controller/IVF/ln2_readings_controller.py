"""
LN2 Readings Controller
CRUD endpoints for LN2 telemetry readings (evaporation_rate_kg_per_h, ln2_mass_kg, etc.).
"""
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Path

from sqlalchemy.orm import Session

from app.config.database import get_db
from app.dependencies.auth_dependencies import get_current_user
from app.models.user_model import User
from app.models.IVF.tank_model import Tank
from app.models.IVF.ln2_iot_device_model import Ln2IotDevice
from app.models.IVF.device_model import Device
from app.service.IVF.ln2_readings_service import (
    create_ln2_reading,
    get_ln2_reading_by_id,
    get_ln2_readings,
    update_ln2_reading,
    delete_ln2_reading,
)
from app.schemas.IVF.ln2_readings_schema import (
    Ln2ReadingCreate,
    Ln2ReadingUpdate,
    Ln2ReadingResponse,
    Ln2ReadingListResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/ln2-readings",
    tags=["LN2 Readings"],
)


def _resolve_device_to_tank(db: Session, device_id: int) -> Optional[tuple]:
    """Resolve device_id (devices.id) to (tank_id, tank_code). Returns None if not found."""
    # Ln2IotDevice links device_id -> tank_id
    ln2_dev = db.query(Ln2IotDevice).filter(Ln2IotDevice.device_id == device_id).first()
    if ln2_dev:
        tank = db.query(Tank).filter(Tank.tank_id == ln2_dev.tank_id).first()
        if tank:
            return (tank.tank_id, tank.tank_code or f"T{tank.tank_id}")
    # Fallback: Device.device_code matches Tank.tive_device_id
    dev = db.query(Device).filter(Device.id == device_id).first()
    if dev and dev.device_code:
        tank = db.query(Tank).filter(Tank.tive_device_id == dev.device_code).first()
        if tank:
            return (tank.tank_id, tank.tank_code or f"T{tank.tank_id}")
    return None


@router.post("/", response_model=Ln2ReadingResponse, status_code=201)
def create_reading(
    data: Ln2ReadingCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new LN2 telemetry reading."""
    reading = create_ln2_reading(db, data)
    try:
        resolved = _resolve_device_to_tank(db, reading.device_id)
        if resolved:
            tank_id, tank_code = resolved
            from app.controller.IVF.ivf_quality_controller import push_ln2_reading_to_redis
            dev = db.query(Device).filter(Device.id == reading.device_id).first()
            dev_code = dev.device_code if dev and dev.device_code else str(reading.device_id)
            push_data = {
                "device_id": dev_code,
                "timestamp": reading.reading_timestamp.isoformat() if reading.reading_timestamp else "",
                "evaporation_rate_kg_per_h": float(reading.evaporation_rate_kg_per_h) if reading.evaporation_rate_kg_per_h is not None else None,
                "ln2_mass_kg": float(reading.ln2_mass_kg) if reading.ln2_mass_kg is not None else None,
                "raw_weight_kg": float(reading.raw_weight_kg) if reading.raw_weight_kg is not None else None,
                "ln2_level_pct": float(reading.ln2_level_pct) if reading.ln2_level_pct is not None else None,
                "ln2_volume_l": float(reading.ln2_volume_l) if reading.ln2_volume_l is not None else None,
                "sensor_status": reading.sensor_status,
                "lid_state": reading.lid_state,
                "refill_detected": reading.refill_detected,
                "quality_status": reading.quality_status,
            }
            push_ln2_reading_to_redis(tank_id, str(tank_code), push_data, publish=True)
    except Exception as e:
        logger.warning(f"Failed to push LN2 reading to Redis: {e}")
    return reading


@router.get("/{reading_id}", response_model=Ln2ReadingResponse)
def get_reading(
    reading_id: int = Path(..., description="Reading ID"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get a single LN2 reading by ID."""
    reading = get_ln2_reading_by_id(db, reading_id)
    if not reading:
        raise HTTPException(status_code=404, detail="LN2 reading not found")
    return reading


@router.get("/", response_model=Ln2ReadingListResponse)
def list_readings(
    device_id: Optional[int] = Query(None, description="Filter by device ID (devices.id)"),
    skip: int = Query(0, ge=0, description="Pagination offset"),
    limit: int = Query(100, ge=1, le=500, description="Page size"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List LN2 readings with optional device filter. Ordered by reading_timestamp descending."""
    readings, count = get_ln2_readings(db, device_id=device_id, skip=skip, limit=limit)
    return Ln2ReadingListResponse(readings=readings, count=count, skip=skip, limit=limit)


@router.patch("/{reading_id}", response_model=Ln2ReadingResponse)
def update_reading(
    reading_id: int = Path(..., description="Reading ID"),
    data: Ln2ReadingUpdate = ...,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update an LN2 reading (partial update)."""
    reading = update_ln2_reading(db, reading_id, data)
    if not reading:
        raise HTTPException(status_code=404, detail="LN2 reading not found")
    return reading


@router.delete("/{reading_id}", status_code=204)
def delete_reading(
    reading_id: int = Path(..., description="Reading ID"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete an LN2 reading."""
    if not delete_ln2_reading(db, reading_id):
        raise HTTPException(status_code=404, detail="LN2 reading not found")
    return None
