"""
LN2 IoT Raw Data CRUD Service
"""
import logging
from typing import List, Optional

from sqlalchemy.orm import Session
from sqlalchemy import desc

from ...models.IVF.ln2_iot_raw_data_model import Ln2IotRawData
from ...models.IVF.tank_model import Tank
from ...schemas.IVF.ln2_iot_raw_data_schema import (
    Ln2IotRawDataCreate,
    Ln2IotRawDataUpdate,
)
from ...service.quality_service import push_ivf_quality_to_redis

logger = logging.getLogger(__name__)


def create_ln2_iot_raw_data(db: Session, data: Ln2IotRawDataCreate) -> Ln2IotRawData:
    """Create a new LN2 IoT raw data record. Pushes to Redis for live Quality chart if payload has temp fields."""
    record = Ln2IotRawData(
        tank_id=data.tank_id,
        device_id=data.device_id,
        raw_data=data.raw_data,
        payload=data.payload,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    # Publish to Redis/WebSocket when payload has quality chart fields
    p = data.payload or {}
    if p.get("temp_internal") is not None and p.get("shock") is not None:
        tank = db.query(Tank).filter(Tank.tank_id == data.tank_id).first()
        tank_code = tank.tank_code if tank and tank.tank_code else str(data.tank_id)
        ts = record.created_at.isoformat() if record.created_at else p.get("timestamp", "")
        push_data = {
            "timestamp": ts,
            "temp_internal": float(p.get("temp_internal")),
            "temp_external": float(p["temp_external"]) if p.get("temp_external") is not None else None,
            "shock": float(p.get("shock")),
        }
        if p.get("battery_percentage") is not None:
            push_data["battery_percentage"] = float(p["battery_percentage"])
        push_ivf_quality_to_redis(data.tank_id, tank_code, push_data, publish=True)

    return record


def get_ln2_iot_raw_data_by_id(db: Session, record_id: int) -> Optional[Ln2IotRawData]:
    """Get LN2 IoT raw data by ID."""
    return db.query(Ln2IotRawData).filter(Ln2IotRawData.id == record_id).first()


def get_ln2_iot_raw_data_list(
    db: Session,
    tank_id: Optional[int] = None,
    device_id: Optional[int] = None,
    skip: int = 0,
    limit: int = 100,
) -> tuple[List[Ln2IotRawData], int]:
    """List LN2 IoT raw data with optional filters. Returns (records, total_count)."""
    query = db.query(Ln2IotRawData)
    if tank_id is not None:
        query = query.filter(Ln2IotRawData.tank_id == tank_id)
    if device_id is not None:
        query = query.filter(Ln2IotRawData.device_id == device_id)
    count = query.count()
    records = query.order_by(desc(Ln2IotRawData.created_at)).offset(skip).limit(limit).all()
    return records, count


def update_ln2_iot_raw_data(
    db: Session,
    record_id: int,
    data: Ln2IotRawDataUpdate,
) -> Optional[Ln2IotRawData]:
    """Update LN2 IoT raw data. Returns None if not found."""
    record = get_ln2_iot_raw_data_by_id(db, record_id)
    if not record:
        return None
    update_dict = data.model_dump(exclude_unset=True)
    for k, v in update_dict.items():
        setattr(record, k, v)
    db.commit()
    db.refresh(record)
    return record


def delete_ln2_iot_raw_data(db: Session, record_id: int) -> bool:
    """Delete LN2 IoT raw data. Returns True if deleted."""
    record = get_ln2_iot_raw_data_by_id(db, record_id)
    if not record:
        return False
    db.delete(record)
    db.commit()
    return True
