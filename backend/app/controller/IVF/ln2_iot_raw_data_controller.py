"""
LN2 IoT Raw Data Controller
CRUD endpoints for LN2 IoT raw telemetry data.
"""
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Path

from sqlalchemy.orm import Session

from app.config.database import get_db
from app.dependencies.auth_dependencies import get_current_user
from app.models.user_model import User
from app.service.IVF.ln2_iot_raw_data_service import (
    create_ln2_iot_raw_data,
    get_ln2_iot_raw_data_by_id,
    get_ln2_iot_raw_data_list,
    update_ln2_iot_raw_data,
    delete_ln2_iot_raw_data,
)
from app.schemas.IVF.ln2_iot_raw_data_schema import (
    Ln2IotRawDataCreate,
    Ln2IotRawDataUpdate,
    Ln2IotRawDataResponse,
    Ln2IotRawDataListResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/ln2-iot-raw-data",
    tags=["LN2 IoT Raw Data"],
)


@router.post("/", response_model=Ln2IotRawDataResponse, status_code=201)
def create_raw_data(
    data: Ln2IotRawDataCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new LN2 IoT raw data record."""
    record = create_ln2_iot_raw_data(db, data)
    return record


@router.get("/{record_id}", response_model=Ln2IotRawDataResponse)
def get_raw_data(
    record_id: int = Path(..., description="Record ID"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get a single LN2 IoT raw data record by ID."""
    record = get_ln2_iot_raw_data_by_id(db, record_id)
    if not record:
        raise HTTPException(status_code=404, detail="LN2 IoT raw data not found")
    return record


@router.get("/", response_model=Ln2IotRawDataListResponse)
def list_raw_data(
    tank_id: Optional[int] = Query(None, description="Filter by tank ID"),
    device_id: Optional[int] = Query(None, description="Filter by device ID (devices.id)"),
    skip: int = Query(0, ge=0, description="Pagination offset"),
    limit: int = Query(100, ge=1, le=500, description="Page size"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List LN2 IoT raw data with optional filters. Ordered by created_at desc."""
    records, count = get_ln2_iot_raw_data_list(
        db, tank_id=tank_id, device_id=device_id, skip=skip, limit=limit
    )
    return Ln2IotRawDataListResponse(data=records, count=count, skip=skip, limit=limit)


@router.patch("/{record_id}", response_model=Ln2IotRawDataResponse)
def update_raw_data(
    record_id: int = Path(..., description="Record ID"),
    data: Ln2IotRawDataUpdate = ...,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update an LN2 IoT raw data record (partial update)."""
    record = update_ln2_iot_raw_data(db, record_id, data)
    if not record:
        raise HTTPException(status_code=404, detail="LN2 IoT raw data not found")
    return record


@router.delete("/{record_id}", status_code=204)
def delete_raw_data(
    record_id: int = Path(..., description="Record ID"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete an LN2 IoT raw data record."""
    if not delete_ln2_iot_raw_data(db, record_id):
        raise HTTPException(status_code=404, detail="LN2 IoT raw data not found")
    return None
