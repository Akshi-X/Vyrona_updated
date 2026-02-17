"""
LN2 Readings CRUD Service
"""
import logging
from typing import List, Optional

from sqlalchemy.orm import Session
from sqlalchemy import desc

from ...models.IVF.ln2_readings_model import Ln2Reading
from ...schemas.IVF.ln2_readings_schema import (
    Ln2ReadingCreate,
    Ln2ReadingUpdate,
    Ln2ReadingResponse,
)

logger = logging.getLogger(__name__)


def create_ln2_reading(db: Session, data: Ln2ReadingCreate) -> Ln2Reading:
    """Create a new LN2 reading."""
    reading = Ln2Reading(
        device_id=data.device_id,
        tank_id=data.tank_id,
        reading_timestamp=data.reading_timestamp,
        raw_weight_kg=data.raw_weight_kg,
        ln2_mass_kg=data.ln2_mass_kg,
        ln2_level_pct=data.ln2_level_pct,
        ln2_volume_l=data.ln2_volume_l,
        sensor_status=data.sensor_status,
        evaporation_rate_kg_per_h=data.evaporation_rate_kg_per_h,
        lid_state=data.lid_state,
        refill_detected=data.refill_detected,
        quality_status=data.quality_status,
    )
    db.add(reading)
    db.commit()
    db.refresh(reading)
    return reading


def get_ln2_reading_by_id(db: Session, reading_id: int) -> Optional[Ln2Reading]:
    """Get an LN2 reading by ID."""
    return db.query(Ln2Reading).filter(Ln2Reading.id == reading_id).first()


def get_ln2_readings(
    db: Session,
    device_id: Optional[int] = None,
    skip: int = 0,
    limit: int = 100,
) -> tuple[List[Ln2Reading], int]:
    """
    List LN2 readings with optional device filter and pagination.
    Returns (readings, total_count).
    """
    query = db.query(Ln2Reading)
    if device_id is not None:
        query = query.filter(Ln2Reading.device_id == device_id)
    count = query.count()
    readings = query.order_by(desc(Ln2Reading.reading_timestamp)).offset(skip).limit(limit).all()
    return readings, count


def update_ln2_reading(
    db: Session,
    reading_id: int,
    data: Ln2ReadingUpdate,
) -> Optional[Ln2Reading]:
    """Update an LN2 reading. Returns None if not found."""
    reading = get_ln2_reading_by_id(db, reading_id)
    if not reading:
        return None
    update_dict = data.model_dump(exclude_unset=True)
    for k, v in update_dict.items():
        setattr(reading, k, v)
    db.commit()
    db.refresh(reading)
    return reading


def delete_ln2_reading(db: Session, reading_id: int) -> bool:
    """Delete an LN2 reading. Returns True if deleted, False if not found."""
    reading = get_ln2_reading_by_id(db, reading_id)
    if not reading:
        return False
    db.delete(reading)
    db.commit()
    return True
