"""
IVF Quality Tracking Schemas
Request and response models for IVF quality tracking endpoints
"""
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
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


class IVFQualityThreshold(BaseModel):
    """Threshold configuration for IVF quality parameters"""
    min: Optional[float] = Field(None, description="Minimum acceptable value")
    max: Optional[float] = Field(None, description="Maximum acceptable value")
    unit: str = Field(..., description="Unit of measurement")


class IVFQualityDataPoint(BaseModel):
    """Single IVF quality data point for tracking chart"""
    timestamp: datetime = Field(..., description="Timestamp of the reading")
    temperature: Optional[float] = Field(None, description="Temperature in C")
    humidity: Optional[float] = Field(None, description="Humidity in %")
    agitation: Optional[float] = Field(None, description="Agitation/Vibration in %")


class IVFQualityTrackingSeries(BaseModel):
    """Series of IVF quality data points"""
    data_points: List[IVFQualityDataPoint] = Field(default_factory=list, description="Ordered data points")
    count: int = Field(..., description="Number of data points returned")


class IVFQualityParameterStatus(BaseModel):
    """Current quality parameter status and threshold evaluation"""
    parameter: str = Field(..., description="Parameter name")
    current_value: Optional[float] = Field(None, description="Latest value for the parameter")
    unit: str = Field(..., description="Unit of the parameter")
    status: str = Field(..., description="Status based on thresholds (Normal, Anomaly, No Data)")
    acceptable_range: IVFQualityThreshold = Field(..., description="Threshold range used for evaluation")
    is_anomaly: bool = Field(..., description="True if value violates threshold")


class IVFQualityKpiSummary(BaseModel):
    """KPI summary for IVF container quality"""
    avg_temperature: Optional[float] = Field(None, description="Average temperature over the window")
    avg_humidity: Optional[float] = Field(None, description="Average humidity over the window")
    avg_agitation: Optional[float] = Field(None, description="Average agitation over the window")
    anomaly_counts: Dict[str, int] = Field(default_factory=dict, description="Count of anomalies per parameter")
    total_readings: int = Field(..., description="Total readings used for KPIs")
    quality_loss: float = Field(..., description="Latest quality loss percentage")


class IVFQualityKpiResponse(BaseModel):
    """Response for IVF container quality KPIs and tracking"""
    container_id: int = Field(..., description="Container (canister) ID")
    last_reading_timestamp: Optional[datetime] = Field(None, description="Timestamp of the latest reading")
    thresholds: Dict[str, IVFQualityThreshold] = Field(default_factory=dict, description="Thresholds used")
    tracking: IVFQualityTrackingSeries = Field(..., description="Tracking data for charting")
    parameters: List[IVFQualityParameterStatus] = Field(default_factory=list, description="Latest parameter statuses")
    kpi_summary: IVFQualityKpiSummary = Field(..., description="KPI summary for the container")


class IVFCanisterTrackingItem(BaseModel):
    """Tracking details for a specific canister - matches table structure"""
    his_number: str = Field(..., description="Patient HIS Number (PK)")
    cryolock_number: str = Field(..., description="Cryolock number")
    canister_number: Optional[int] = Field(None, description="Canister number")
    cane_id: str = Field(..., description="Cane ID (formatted)")
    goblet_color: str = Field(..., description="Goblet color")
    cryolock_color: str = Field(..., description="Cryolock color")
    date_of_vitrification: Optional[date] = Field(None, description="Date of vitrification")
    move_to: bool = Field(default=True, description="Indicates if item can be moved (UI action)")


class IVFCanisterTrackingResponse(BaseModel):
    """Response for canister tracking details"""
    data: List[IVFCanisterTrackingItem] = Field(default_factory=list, description="Tracking rows")
    total: int = Field(..., description="Total number of rows")


class GobletColorUpdate(BaseModel):
    """Schema for updating goblet color"""
    cane_identifier: str = Field(
        ..., 
        description="Cane identifier from the tracking details response. "
        "This is the 'cane_id' field value from GET /canisters/{canister_id}/tracking-details. "
        "It can be either: (1) the cane_code if available (e.g., 'Cane-A 12'), "
        "or (2) the formatted cane_id (e.g., 'Cane-5'). "
        "You can also use just the numeric part (e.g., '5' for 'Cane-5')."
    )
    goblet_color: str = Field(..., description="Goblet color to set (stored in the 'canes' table)")


class CryolockColorUpdate(BaseModel):
    """Schema for updating cryolock color"""
    cryolock_number: str = Field(
        ..., 
        description="Cryolock number from the tracking details response. "
        "This is the 'cryolock_number' field value from GET /canisters/{canister_id}/tracking-details."
    )
    cryolock_color: str = Field(..., description="Cryolock color to set (stored in the 'cryolocks' table)")


class ColorUpdateResponse(BaseModel):
    """Response for color update operations"""
    success: bool = Field(..., description="Whether the update was successful")
    message: str = Field(..., description="Success message")
    cane_id: Optional[int] = Field(None, description="Cane ID that was updated (for goblet color)")
    cryolock_id: Optional[int] = Field(None, description="Cryolock ID that was updated (for cryolock color)")
    updated_color: str = Field(..., description="The color value that was set")