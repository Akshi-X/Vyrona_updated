"""
LN2 IoT Device CRUD Service
"""
import logging
from typing import List, Optional

from sqlalchemy.orm import Session

from ...models.IVF.ln2_iot_device_model import Ln2IotDevice
from ...schemas.IVF.ln2_iot_device_schema import (
    Ln2IotDeviceCreate,
    Ln2IotDeviceUpdate,
)

logger = logging.getLogger(__name__)


def create_ln2_iot_device(db: Session, data: Ln2IotDeviceCreate) -> Ln2IotDevice:
    """Create a new LN2 IoT device mapping."""
    device = Ln2IotDevice(
        tank_id=data.tank_id,
        device_id=data.device_id,
        tank_max_capacity_reading=data.tank_max_capacity_reading,
        tank_min_capacity_reading=data.tank_min_capacity_reading,
    )
    db.add(device)
    db.commit()
    db.refresh(device)
    return device


def get_ln2_iot_device_by_id(db: Session, record_id: int) -> Optional[Ln2IotDevice]:
    """Get an LN2 IoT device by record ID."""
    return db.query(Ln2IotDevice).filter(Ln2IotDevice.id == record_id).first()


def get_ln2_iot_devices(
    db: Session,
    tank_id: Optional[int] = None,
    device_id_filter: Optional[int] = None,
    skip: int = 0,
    limit: int = 100,
) -> tuple[List[Ln2IotDevice], int]:
    """
    List LN2 IoT devices with optional filters and pagination.
    Returns (devices, total_count).
    """
    query = db.query(Ln2IotDevice)
    if tank_id is not None:
        query = query.filter(Ln2IotDevice.tank_id == tank_id)
    if device_id_filter is not None:
        query = query.filter(Ln2IotDevice.device_id == device_id_filter)
    count = query.count()
    devices = query.order_by(Ln2IotDevice.id).offset(skip).limit(limit).all()
    return devices, count


def update_ln2_iot_device(
    db: Session,
    record_id: int,
    data: Ln2IotDeviceUpdate,
) -> Optional[Ln2IotDevice]:
    """Update an LN2 IoT device. Returns None if not found."""
    device = get_ln2_iot_device_by_id(db, record_id)
    if not device:
        return None
    update_dict = data.model_dump(exclude_unset=True)
    for k, v in update_dict.items():
        setattr(device, k, v)
    db.commit()
    db.refresh(device)
    return device


def delete_ln2_iot_device(db: Session, record_id: int) -> bool:
    """Delete an LN2 IoT device. Returns True if deleted, False if not found."""
    device = get_ln2_iot_device_by_id(db, record_id)
    if not device:
        return False
    db.delete(device)
    db.commit()
    return True
