"""
Device Schemas
"""
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime


class DeviceCreate(BaseModel):
    """Schema for creating a device"""
    branch_id: int = Field(..., description="Branch ID this device belongs to")
    device_code: Optional[str] = Field(None, max_length=255, description="External device ID (e.g. Tive ID)")


class DeviceUpdate(BaseModel):
    """Schema for updating a device (all fields optional)"""
    branch_id: Optional[int] = None
    device_code: Optional[str] = Field(None, max_length=255)


class DeviceResponse(BaseModel):
    """Schema for device response"""
    id: int = Field(..., description="Device ID")
    branch_id: int = Field(..., description="Branch ID")
    device_code: Optional[str] = None
    created_at: datetime = Field(..., description="When created")
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class DeviceListResponse(BaseModel):
    """Schema for paginated list"""
    devices: List[DeviceResponse] = Field(..., description="List of devices")
    count: int = Field(..., description="Total count")
    skip: int = Field(0, description="Records skipped")
    limit: int = Field(100, description="Page size")
