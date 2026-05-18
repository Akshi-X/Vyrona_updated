"""
LN2 IoT Device Schemas
Request and response models for ln2_iot_devices CRUD.
"""
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime


class Ln2IotDeviceCreate(BaseModel):
    """Schema for creating an LN2 IoT device mapping"""
    tank_id: int = Field(..., description="Tank ID this device monitors")
    device_id: int = Field(..., description="Device ID from devices table")
    tank_max_capacity_reading: Optional[float] = Field(None, description="Max capacity threshold")
    tank_min_capacity_reading: Optional[float] = Field(None, description="Min capacity threshold")


class Ln2IotDeviceUpdate(BaseModel):
    """Schema for updating an LN2 IoT device (all fields optional)"""
    tank_id: Optional[int] = None
    device_id: Optional[int] = None
    tank_max_capacity_reading: Optional[float] = None
    tank_min_capacity_reading: Optional[float] = None


class Ln2IotDeviceResponse(BaseModel):
    """Schema for LN2 IoT device response"""
    id: int = Field(..., description="Record ID")
    tank_id: int = Field(..., description="Tank ID")
    device_id: int = Field(..., description="Device ID (FK to devices)")
    tank_max_capacity_reading: Optional[float] = None
    tank_min_capacity_reading: Optional[float] = None
    created_at: datetime = Field(..., description="When created")
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class Ln2IotDeviceListResponse(BaseModel):
    """Schema for paginated list of LN2 IoT devices"""
    devices: List[Ln2IotDeviceResponse] = Field(..., description="List of LN2 IoT devices")
    count: int = Field(..., description="Total count")
    skip: int = Field(0, description="Records skipped (pagination)")
    limit: int = Field(100, description="Page size")
