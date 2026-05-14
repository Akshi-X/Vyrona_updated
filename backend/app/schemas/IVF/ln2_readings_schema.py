"""
LN2 Readings Schemas
Request and response models for LN2 telemetry readings CRUD.
Schema: device_id, tank_id, timestamp, raw_weight_kg, ln2_mass_kg, ln2_level_pct,
ln2_volume_l, sensor_status, evaporation_rate_kg_per_h, lid_state, refill_detected, quality_status.
"""
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime


class Ln2ReadingCreate(BaseModel):
    """Schema for creating an LN2 reading"""
    device_id: int = Field(..., description="Device ID (devices.id FK)")
    tank_id: Optional[int] = Field(None, description="Tank ID (tanks.tank_id FK)")
    reading_timestamp: datetime = Field(..., description="When the sensor recorded this reading")
    raw_weight_kg: Optional[float] = None
    ln2_mass_kg: Optional[float] = None
    ln2_level_pct: Optional[float] = None
    ln2_volume_l: Optional[float] = None
    sensor_status: Optional[str] = None
    evaporation_rate_kg_per_h: Optional[float] = None
    lid_state: Optional[str] = None
    refill_detected: Optional[bool] = None
    quality_status: Optional[str] = None


class Ln2ReadingUpdate(BaseModel):
    """Schema for updating an LN2 reading (all fields optional)"""
    device_id: Optional[int] = None
    tank_id: Optional[int] = None
    reading_timestamp: Optional[datetime] = None
    raw_weight_kg: Optional[float] = None
    ln2_mass_kg: Optional[float] = None
    ln2_level_pct: Optional[float] = None
    ln2_volume_l: Optional[float] = None
    sensor_status: Optional[str] = None
    evaporation_rate_kg_per_h: Optional[float] = None
    lid_state: Optional[str] = None
    refill_detected: Optional[bool] = None
    quality_status: Optional[str] = None


class Ln2ReadingResponse(BaseModel):
    """Schema for LN2 reading response"""
    id: int = Field(..., description="Reading ID")
    device_id: int = Field(..., description="Device ID (devices.id)")
    tank_id: Optional[int] = None
    timestamp: datetime = Field(..., description="When the sensor recorded this reading (alias for reading_timestamp)")
    raw_weight_kg: Optional[float] = None
    ln2_mass_kg: Optional[float] = None
    ln2_level_pct: Optional[float] = None
    ln2_volume_l: Optional[float] = None
    sensor_status: Optional[str] = None
    evaporation_rate_kg_per_h: Optional[float] = None
    lid_state: Optional[str] = None
    refill_detected: Optional[bool] = None
    quality_status: Optional[str] = None
    created_at: datetime = Field(..., description="When the record was stored")
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class Ln2ReadingListResponse(BaseModel):
    """Schema for paginated list of LN2 readings"""
    readings: List[Ln2ReadingResponse] = Field(..., description="List of LN2 readings")
    count: int = Field(..., description="Total count")
    skip: int = Field(0, description="Records skipped (pagination)")
    limit: int = Field(100, description="Page size")
