"""
LN2 IoT Device Controller
CRUD endpoints for tank-device mapping with capacity thresholds.
"""
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Path

from sqlalchemy.orm import Session

from app.config.database import get_db
from app.dependencies.auth_dependencies import get_current_user
from app.models.user_model import User
from app.service.IVF.ln2_iot_device_service import (
    create_ln2_iot_device,
    get_ln2_iot_device_by_id,
    get_ln2_iot_devices,
    update_ln2_iot_device,
    delete_ln2_iot_device,
)
from app.schemas.IVF.ln2_iot_device_schema import (
    Ln2IotDeviceCreate,
    Ln2IotDeviceUpdate,
    Ln2IotDeviceResponse,
    Ln2IotDeviceListResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/ln2-iot-devices",
    tags=["LN2 IoT Devices"],
)


@router.post("/", response_model=Ln2IotDeviceResponse, status_code=201)
def create_device(
    data: Ln2IotDeviceCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new LN2 IoT device mapping (tank + device + capacity thresholds)."""
    device = create_ln2_iot_device(db, data)
    return device


@router.get("/{record_id}", response_model=Ln2IotDeviceResponse)
def get_device(
    record_id: int = Path(..., description="Record ID"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get a single LN2 IoT device mapping by ID."""
    device = get_ln2_iot_device_by_id(db, record_id)
    if not device:
        raise HTTPException(status_code=404, detail="LN2 IoT device not found")
    return device


@router.get("/", response_model=Ln2IotDeviceListResponse)
def list_devices(
    tank_id: Optional[int] = Query(None, description="Filter by tank ID"),
    device_id: Optional[int] = Query(None, description="Filter by device ID"),
    skip: int = Query(0, ge=0, description="Pagination offset"),
    limit: int = Query(100, ge=1, le=500, description="Page size"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List LN2 IoT device mappings with optional tank/device filters."""
    devices, count = get_ln2_iot_devices(
        db,
        tank_id=tank_id,
        device_id_filter=device_id,
        skip=skip,
        limit=limit,
    )
    return Ln2IotDeviceListResponse(devices=devices, count=count, skip=skip, limit=limit)


@router.patch("/{record_id}", response_model=Ln2IotDeviceResponse)
def update_device(
    record_id: int = Path(..., description="Record ID"),
    data: Ln2IotDeviceUpdate = ...,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update an LN2 IoT device mapping (partial update)."""
    device = update_ln2_iot_device(db, record_id, data)
    if not device:
        raise HTTPException(status_code=404, detail="LN2 IoT device not found")
    return device


@router.delete("/{record_id}", status_code=204)
def delete_device(
    record_id: int = Path(..., description="Record ID"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete an LN2 IoT device mapping."""
    if not delete_ln2_iot_device(db, record_id):
        raise HTTPException(status_code=404, detail="LN2 IoT device not found")
    return None
