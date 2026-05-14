"""
LN2 IoT Raw Data Schemas
"""
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime


class Ln2IotRawDataCreate(BaseModel):
    """Schema for creating LN2 IoT raw data"""
    tank_id: int = Field(..., description="Tank ID")
    device_id: int = Field(..., description="Device ID (devices.id FK)")
    raw_data: Optional[float] = Field(None, description="Raw numeric value from sensor")
    payload: Optional[Dict[str, Any]] = Field(None, description="Full JSON payload")


class Ln2IotRawDataUpdate(BaseModel):
    """Schema for updating LN2 IoT raw data (all fields optional)"""
    tank_id: Optional[int] = None
    device_id: Optional[int] = None
    raw_data: Optional[float] = None
    payload: Optional[Dict[str, Any]] = None


class Ln2IotRawDataResponse(BaseModel):
    """Schema for LN2 IoT raw data response"""
    id: int = Field(..., description="Record ID")
    tank_id: int = Field(..., description="Tank ID")
    device_id: int = Field(..., description="Device ID (devices.id)")
    raw_data: Optional[float] = None
    payload: Optional[Dict[str, Any]] = None
    created_at: datetime = Field(..., description="When created")
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class Ln2IotRawDataListResponse(BaseModel):
    """Schema for paginated list"""
    data: List[Ln2IotRawDataResponse] = Field(..., description="List of raw data records")
    count: int = Field(..., description="Total count")
    skip: int = Field(0, description="Records skipped")
    limit: int = Field(100, description="Page size")
