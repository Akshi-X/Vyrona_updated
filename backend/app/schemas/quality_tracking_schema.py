"""
Quality Tracking Schemas
Request and response models for quality tracking endpoints
"""
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import date, time, datetime
from app.constants.enums import TaskStatus


class RefillLogBase(BaseModel):
    """Base schema for refill log"""
    canister_id: int = Field(..., description="Canister ID identifier")
    refill_date: date = Field(..., description="Date when refill was performed")
    refill_time: time = Field(..., description="Time when refill was performed")
    refilled_by: str = Field(..., description="Name of person who performed the refill")
    liquid_nitrogen_volume: float = Field(..., ge=0, le=100, description="Liquid Nitrogen volume percentage (0-100)")
    description: Optional[str] = Field(None, description="Description or notes about the refill")
    status: TaskStatus = Field(default=TaskStatus.NOT_STARTED, description="Status of the refill log")


class RefillLogCreate(BaseModel):
    """Schema for creating a new refill log - canister_id comes from URL path"""
    refill_date: date = Field(..., description="Date when refill was performed")
    refill_time: time = Field(..., description="Time when refill was performed")
    refilled_by: str = Field(..., description="Name of person who performed the refill")
    liquid_nitrogen_volume: float = Field(..., ge=0, le=100, description="Liquid Nitrogen volume percentage (0-100)")
    description: Optional[str] = Field(None, description="Description or notes about the refill")
    status: TaskStatus = Field(default=TaskStatus.NOT_STARTED, description="Status of the refill log")


class RefillLogStatusUpdate(BaseModel):
    """Schema for updating only the status of a refill log"""
    status: TaskStatus = Field(..., description="Updated status of the refill log")


class RefillLogResponse(RefillLogBase):
    """Schema for refill log response"""
    log_id: int = Field(..., description="Refill log ID")
    created_at: datetime = Field(..., description="Timestamp when the record was created")
    updated_at: Optional[datetime] = Field(None, description="Timestamp when the record was last updated")
    created_by: Optional[str] = Field(None, description="User who created the record")
    updated_by: Optional[str] = Field(None, description="User who last updated the record")
    
    class Config:
        from_attributes = True


class RefillLogListResponse(BaseModel):
    """Schema for list of refill logs response"""
    refill_logs: List[RefillLogResponse] = Field(..., description="List of refill logs")
    count: int = Field(..., description="Total number of refill logs")
