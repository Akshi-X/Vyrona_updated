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
    tank_id: int = Field(..., description="Tank ID identifier")
    refill_date: date = Field(..., description="Date when refill was performed")
    refill_time: time = Field(..., description="Time when refill was performed")
    refilled_by: str = Field(..., description="Name of person who performed the refill")
    description: Optional[str] = Field(None, description="Description or notes about the refill")
    status: TaskStatus = Field(default=TaskStatus.NOT_STARTED, description="Status of the refill log")
    cryoshipper: Optional[str] = Field(None, description="Cryoshipper information")
    disinfected_shipper_infected_tank_description: Optional[str] = Field(None, description="Description of disinfected shipper/infected tank")
    reservoir: Optional[str] = Field(None, description="Reservoir name")
    ln2_ordered_date: Optional[date] = Field(None, description="Date when LN2 was ordered")
    ln2_received_date: Optional[date] = Field(None, description="Date when LN2 was received")


class RefillLogCreate(BaseModel):
    """Schema for creating a new refill log - canister_number comes from URL path"""
    refill_date: date = Field(..., description="Date when refill was performed")
    refill_time: time = Field(..., description="Time when refill was performed")
    refilled_by: str = Field(..., description="Name of person who performed the refill")
    description: Optional[str] = Field(None, description="Description or notes about the refill")
    status: TaskStatus = Field(default=TaskStatus.NOT_STARTED, description="Status of the refill log")
    cryoshipper: Optional[str] = Field(None, description="Cryoshipper information")
    disinfected_shipper_infected_tank_description: Optional[str] = Field(None, description="Description of disinfected shipper/infected tank")
    reservoir: Optional[str] = Field(None, description="Reservoir name")
    reservoir_id: Optional[int] = Field(None, description="Reservoir ID foreign key")
    refill_weight: Optional[float] = Field(None, description="Weight of LN2 added in kg (deducted from branch reservoir)")
    ln2_ordered_date: Optional[date] = Field(None, description="Date when LN2 was ordered")
    ln2_received_date: Optional[date] = Field(None, description="Date when LN2 was received")


class RefillLogStatusUpdate(BaseModel):
    """Schema for updating only the status of a refill log"""
    status: TaskStatus = Field(..., description="Updated status of the refill log")


class RefillLogUpdate(BaseModel):
    """Schema for updating editable fields of a refill log"""
    status: Optional[TaskStatus] = Field(None, description="Updated status of the refill log")
    reservoir: Optional[str] = Field(None, description="Reservoir name")
    ln2_ordered_date: Optional[date] = Field(None, description="Date when LN2 was ordered")
    ln2_received_date: Optional[date] = Field(None, description="Date when LN2 was received")


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


class IVFCanisterTrackingItem(BaseModel):
    """Tracking details for a specific canister - matches table structure"""
    his_number: str = Field(..., description="Patient HIS Number (PK)")
    cryolock_number: str = Field(..., description="Cryolock number")
    canister_number: Optional[str] = Field(None, description="Canister number/code")
    tank_code: str = Field(..., description="Tank code (e.g., T1, T2) - from ARC API format: Tank Number / Canister Number / Location / Cryolock Serial Number")
    cane_code: str = Field(..., description="Cane code")
    goblet_color: str = Field(..., description="Goblet color")
    cryolock_color: str = Field(..., description="Cryolock color")
    date_of_vitrification: Optional[date] = Field(None, description="Date of vitrification")
    embryo_transfer: bool = Field(default=False, description="Whether the cryolock has been moved to embryo transfer")
    in_transit: bool = Field(default=False, description="Whether the cryolock has been moved to transit")
    description: Optional[str] = Field(None, description="Shipment description if cryolock is in transit (from ivf_shipment table)")


class IVFCanisterTrackingResponse(BaseModel):
    """Response for canister tracking details"""
    data: List[IVFCanisterTrackingItem] = Field(default_factory=list, description="Tracking rows")
    total: int = Field(..., description="Total number of cryolocks (total slots)")
    available_slots: int = Field(..., description="Count of records where embryo_transfer or in_transit is true")


class CryolockFlagUpdate(BaseModel):
    """Schema for updating cryolock flags (embryo_transfer / in_transit)"""
    cryolock_number: str = Field(
        ...,
        description="Cryolock number from tracking details response"
    )


class CryolockFlagUpdateResponse(BaseModel):
    """Response for cryolock flag update operations"""
    success: bool = Field(..., description="Whether the update was successful")
    message: str = Field(..., description="Success message")
    cryolock_number: str = Field(..., description="Cryolock number that was updated")
    embryo_transfer: bool = Field(..., description="Updated embryo_transfer flag value")
    in_transit: bool = Field(..., description="Updated in_transit flag value")


class GobletColorUpdate(BaseModel):
    """Schema for updating goblet color"""
    cryolock_number: str = Field(
        ..., 
        description="Cryolock number from the tracking details response. "
        "This is the 'cryolock_number' field value from GET /canisters/{canister_number}/tracking-details."
    )
    goblet_color: str = Field(..., description="Goblet color to set (stored in the 'cryolocks' table)")


class CryolockColorUpdate(BaseModel):
    """Schema for updating cryolock color"""
    cryolock_number: str = Field(
        ..., 
        description="Cryolock number from the tracking details response. "
        "This is the 'cryolock_number' field value from GET /canisters/{canister_number}/tracking-details."
    )
    cryolock_color: str = Field(..., description="Cryolock color to set (stored in the 'cryolocks' table)")


class ColorUpdateResponse(BaseModel):
    """Response for color update operations"""
    success: bool = Field(..., description="Whether the update was successful")
    message: str = Field(..., description="Success message")
    cryolock_number: Optional[str] = Field(None, description="Cryolock number that was updated (for goblet or cryolock color)")
    updated_color: str = Field(..., description="The color value that was set")


class InTransitWithShipmentRequest(BaseModel):
    """Schema for marking cryolock as in transit and creating IoT shipment
    
    Description format: "crylock is move from <source> to <destination>-deviceid -<device_id>"
    Example: "crylock is move from egmore to thambaram-deviceid -xxxxx"
    
    The description will be parsed to extract:
    - Source location (matched to branch name)
    - Destination location (matched to branch name)
    - Device ID (extracted from description)
    """
    cryolock_number: str = Field(..., description="Cryolock number to mark as in transit")
    description: str = Field(..., description="Description containing source, destination, and device ID. Format: 'crylock is move from <source> to <destination>-deviceid -<device_id>'")


class BranchInfo(BaseModel):
    """Branch information for shipment response"""
    branch_id: int = Field(..., description="Branch ID")
    branch_name: Optional[str] = Field(None, description="Branch name")
    address: Optional[str] = Field(None, description="Full address string")
    latitude: Optional[float] = Field(None, description="Latitude coordinate")
    longitude: Optional[float] = Field(None, description="Longitude coordinate")


class InTransitWithShipmentResponse(BaseModel):
    """Response for in-transit with shipment creation"""
    success: bool = Field(..., description="Whether the operation was successful")
    message: str = Field(..., description="Success message")
    cryolock_number: str = Field(..., description="Cryolock number that was updated")
    in_transit: bool = Field(..., description="Updated in_transit flag value")
    shipment: Dict = Field(..., description="Shipment details including shipment_id, iot_shipment_id, source/destination branches, etc.")
    
    class Config:
        from_attributes = True