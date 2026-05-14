"""
Device CRUD Service
"""
import logging
from typing import List, Optional

from sqlalchemy.orm import Session

from ...models.IVF.device_model import Device
from ...schemas.IVF.device_schema import DeviceCreate, DeviceUpdate

logger = logging.getLogger(__name__)


def create_device(db: Session, data: DeviceCreate) -> Device:
    """Create a new device."""
    device = Device(
        branch_id=data.branch_id,
        device_code=data.device_code,
    )
    db.add(device)
    db.commit()
    db.refresh(device)
    return device


def get_device_by_id(db: Session, device_id: int) -> Optional[Device]:
    """Get device by ID."""
    return db.query(Device).filter(Device.id == device_id).first()


def get_devices(
    db: Session,
    branch_id: Optional[int] = None,
    skip: int = 0,
    limit: int = 100,
) -> tuple[List[Device], int]:
    """List devices with optional branch filter. Returns (devices, total_count)."""
    query = db.query(Device)
    if branch_id is not None:
        query = query.filter(Device.branch_id == branch_id)
    count = query.count()
    devices = query.order_by(Device.id).offset(skip).limit(limit).all()
    return devices, count


def update_device(db: Session, device_id: int, data: DeviceUpdate) -> Optional[Device]:
    """Update a device. Returns None if not found."""
    device = get_device_by_id(db, device_id)
    if not device:
        return None
    update_dict = data.model_dump(exclude_unset=True)
    for k, v in update_dict.items():
        setattr(device, k, v)
    db.commit()
    db.refresh(device)
    return device


def delete_device(db: Session, device_id: int) -> bool:
    """Delete a device. Returns True if deleted."""
    device = get_device_by_id(db, device_id)
    if not device:
        return False
    db.delete(device)
    db.commit()
    return True
