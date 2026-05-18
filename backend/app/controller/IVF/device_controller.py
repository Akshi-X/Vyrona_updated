"""
Device Controller
CRUD endpoints for IoT devices.
"""
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Path

from sqlalchemy.orm import Session

from app.config.database import get_db
from app.dependencies.auth_dependencies import get_current_user
from app.models.user_model import User
from app.service.IVF.device_service import (
    create_device,
    get_device_by_id,
    get_devices,
    update_device,
    delete_device,
)
from app.schemas.IVF.device_schema import (
    DeviceCreate,
    DeviceUpdate,
    DeviceResponse,
    DeviceListResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/devices",
    tags=["Devices"],
)


@router.post("/", response_model=DeviceResponse, status_code=201)
def create_device_endpoint(
    data: DeviceCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new device (associated with a branch)."""
    device = create_device(db, data)
    return device


@router.get("/{device_id}", response_model=DeviceResponse)
def get_device_endpoint(
    device_id: int = Path(..., description="Device ID"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get a device by ID."""
    device = get_device_by_id(db, device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return device


@router.get("/", response_model=DeviceListResponse)
def list_devices_endpoint(
    branch_id: Optional[int] = Query(None, description="Filter by branch ID"),
    skip: int = Query(0, ge=0, description="Pagination offset"),
    limit: int = Query(100, ge=1, le=500, description="Page size"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List devices with optional branch filter."""
    devices, count = get_devices(db, branch_id=branch_id, skip=skip, limit=limit)
    return DeviceListResponse(devices=devices, count=count, skip=skip, limit=limit)


@router.patch("/{device_id}", response_model=DeviceResponse)
def update_device_endpoint(
    device_id: int = Path(..., description="Device ID"),
    data: DeviceUpdate = ...,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update a device (partial update)."""
    device = update_device(db, device_id, data)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return device


@router.delete("/{device_id}", status_code=204)
def delete_device_endpoint(
    device_id: int = Path(..., description="Device ID"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a device."""
    if not delete_device(db, device_id):
        raise HTTPException(status_code=404, detail="Device not found")
    return None
