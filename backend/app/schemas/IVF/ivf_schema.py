from pydantic import BaseModel, Field
from typing import List, Optional, Dict
from datetime import datetime, date, time

from app.constants.enums import CanisterStatus


# ============================================
# HOSPITAL SCHEMAS
# ============================================

class HospitalBase(BaseModel):
    """Base schema for hospital"""
    hospital_name: str = Field(..., description="Hospital name")
    hospital_type: Optional[str] = Field(None, description="Hospital type")
    hospital_head_email: Optional[str] = Field(None, description="Hospital head email")
    created_by: Optional[str] = Field(None, description="User who created the record")
    updated_by: Optional[str] = Field(None, description="User who last updated the record")


class HospitalCreate(HospitalBase):
    """Schema for creating a new hospital"""
    pass


class HospitalUpdate(BaseModel):
    """Schema for updating hospital information"""
    hospital_name: Optional[str] = Field(None, description="Hospital name")
    hospital_type: Optional[str] = Field(None, description="Hospital type")
    hospital_head_email: Optional[str] = Field(None, description="Hospital head email")
    updated_by: Optional[str] = Field(None, description="User who last updated the record")


class HospitalResponse(HospitalBase):
    """Schema for hospital response"""
    hospital_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


# ============================================
# HOSPITAL BRANCH SCHEMAS
# ============================================

class HospitalBranchBase(BaseModel):
    """Base schema for hospital branch"""
    hospital_id: int = Field(..., description="Reference to hospital")
    branch_name: Optional[str] = Field(None, description="Branch name")
    area: Optional[str] = Field(None, description="Area/Street address")
    district_name: Optional[str] = Field(None, description="District name")
    state_name: Optional[str] = Field(None, description="State name")
    country_name: Optional[str] = Field(None, description="Country name")
    pincode: Optional[str] = Field(None, description="Pincode")
    latitude: Optional[float] = Field(None, description="Latitude coordinate")
    longitude: Optional[float] = Field(None, description="Longitude coordinate")
    created_by: Optional[str] = Field(None, description="User who created the record")
    updated_by: Optional[str] = Field(None, description="User who last updated the record")


class HospitalBranchCreate(HospitalBranchBase):
    """Schema for creating a new hospital branch"""
    pass


class HospitalBranchUpdate(BaseModel):
    """Schema for updating hospital branch information"""
    branch_name: Optional[str] = Field(None, description="Branch name")
    area: Optional[str] = Field(None, description="Area/Street address")
    district_name: Optional[str] = Field(None, description="District name")
    state_name: Optional[str] = Field(None, description="State name")
    country_name: Optional[str] = Field(None, description="Country name")
    pincode: Optional[str] = Field(None, description="Pincode")
    latitude: Optional[float] = Field(None, description="Latitude coordinate")
    longitude: Optional[float] = Field(None, description="Longitude coordinate")
    updated_by: Optional[str] = Field(None, description="User who last updated the record")


class HospitalBranchResponse(HospitalBranchBase):
    """Schema for hospital branch response"""
    branch_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


# ============================================
# TANK SCHEMAS
# ============================================

class TankBase(BaseModel):
    """Base schema for tank"""
    branch_id: int = Field(..., description="Reference to hospital branch")
    tank_code: Optional[str] = Field(None, description="Tank code")
    capacity_liters: Optional[float] = Field(None, description="Tank capacity in liters")
    is_active: bool = Field(default=True, description="Whether the tank is active")
    status: CanisterStatus = Field(default=CanisterStatus.SAFE, description="Tank status (safe, risk, critical)")
    created_by: Optional[str] = Field(None, description="User who created the record")
    updated_by: Optional[str] = Field(None, description="User who last updated the record")


class TankCreate(TankBase):
    """Schema for creating a new tank"""
    pass


class TankUpdate(BaseModel):
    """Schema for updating tank information"""
    tank_code: Optional[str] = Field(None, description="Tank code")
    capacity_liters: Optional[float] = Field(None, description="Tank capacity in liters")
    is_active: Optional[bool] = Field(None, description="Whether the tank is active")
    status: Optional[CanisterStatus] = Field(None, description="Tank status (safe, risk, critical)")
    updated_by: Optional[str] = Field(None, description="User who last updated the record")


class TankResponse(TankBase):
    """Schema for tank response"""
    tank_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


# ============================================
# CANISTER SCHEMAS
# ============================================

class CanisterBase(BaseModel):
    """Base schema for canister"""
    tank_id: int = Field(..., description="Reference to tank")
    canister_number: Optional[int] = Field(None, description="Canister number")
    is_active: bool = Field(default=True, description="Whether the canister is active")
    created_by: Optional[str] = Field(None, description="User who created the record")
    updated_by: Optional[str] = Field(None, description="User who last updated the record")


class CanisterCreate(CanisterBase):
    """Schema for creating a new canister"""
    pass


class CanisterUpdate(BaseModel):
    """Schema for updating canister information"""
    canister_number: Optional[int] = Field(None, description="Canister number")


class CanisterCheckResponse(BaseModel):
    """Schema for tank existence check response (kept name for backward compatibility)"""
    exists: bool = Field(..., description="Whether the tank exists")
    canister_number: str = Field(..., description="The tank code that was checked (kept as canister_number for backward compatibility)")
    canister_id: Optional[int] = Field(None, description="Tank ID if exists (kept as canister_id for backward compatibility)")
    is_active: Optional[bool] = Field(None, description="Whether the tank is active (if exists)")
    canister_status: Optional[str] = Field(None, description="Tank status if exists (kept as canister_status for backward compatibility)")
    message: str = Field(..., description="Response message")
    
    class Config:
        from_attributes = True


class TankInTransitCheckResponse(BaseModel):
    """Schema for tank in-transit shipment check response."""
    exists: bool = Field(..., description="Whether matching cryolock records exist")
    tank_code: Optional[str] = Field(None, description="Tank code mapped from matched cryolock record(s)")
    his_number: Optional[str] = Field(None, description="Matched HIS number (or input HIS number)")
    cryolock_number: Optional[str] = Field(None, description="Matched Cryolock number (or input Cryolock number)")
    has_in_transit_shipments: bool = Field(..., description="Whether this identifier has any in-transit shipments")
    in_transit_count: int = Field(..., description="Number of in-transit crylocks for the identifier")
    message: str = Field(..., description="Response message")

    class Config:
        from_attributes = True


class CanisterResponse(CanisterBase):
    """Schema for canister response"""
    canister_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


# ============================================
# CANISTER LN2 LOG SCHEMAS
# ============================================

class CanisterLn2LogBase(BaseModel):
    """Base schema for tank LN2 log"""
    tank_id: Optional[int] = Field(None, description="Reference to tank (for IVF)")
    container_id: Optional[str] = Field(None, description="Container ID (for quality tracking)")
    refill_date: Optional[date] = Field(None, description="Date when refill/opening was performed")
    refill_time: Optional[time] = Field(None, description="Time when refill/opening was performed")
    refilled_by: Optional[str] = Field(None, description="Name of person who performed the refill/opening")
    ln2_level_before: Optional[float] = Field(None, description="LN2 level before opening")
    ln2_level_after: Optional[float] = Field(None, description="LN2 level after opening")
    remarks: Optional[str] = Field(None, description="Remarks or notes")
    refilled_count: int = Field(default=0, description="Number of times refilled")
    opened_count: int = Field(default=0, description="Number of times opened")
    created_by: Optional[str] = Field(None, description="User who created the record")


class CanisterLn2LogCreate(CanisterLn2LogBase):
    """Schema for creating a new canister LN2 log"""
    pass


class CanisterLn2LogUpdate(BaseModel):
    """Schema for updating canister LN2 log information"""
    refill_date: Optional[date] = Field(None, description="Date when refill/opening was performed")
    refill_time: Optional[time] = Field(None, description="Time when refill/opening was performed")
    refilled_by: Optional[str] = Field(None, description="Name of person who performed the refill/opening")
    ln2_level_before: Optional[float] = Field(None, description="LN2 level before opening")
    ln2_level_after: Optional[float] = Field(None, description="LN2 level after opening")
    remarks: Optional[str] = Field(None, description="Remarks or notes")
    refilled_count: Optional[int] = Field(None, description="Number of times refilled")
    opened_count: Optional[int] = Field(None, description="Number of times opened")


class CanisterLn2LogResponse(CanisterLn2LogBase):
    """Schema for canister LN2 log response"""
    log_id: int
    created_at: datetime
    
    class Config:
        from_attributes = True


# ============================================
# CANE SCHEMAS
# ============================================

class CaneBase(BaseModel):
    """Base schema for cane"""
    canister_id: int = Field(..., description="Reference to canister")
    cane_code: Optional[str] = Field(None, description="Cane code")
    goblet_color: Optional[str] = Field(None, description="Goblet color")
    is_active: bool = Field(default=True, description="Whether the cane is active")
    created_by: Optional[str] = Field(None, description="User who created the record")
    updated_by: Optional[str] = Field(None, description="User who last updated the record")


class CaneCreate(CaneBase):
    """Schema for creating a new cane"""
    pass


class CaneUpdate(BaseModel):
    """Schema for updating cane information"""
    cane_code: Optional[str] = Field(None, description="Cane code")
    goblet_color: Optional[str] = Field(None, description="Goblet color")
    is_active: Optional[bool] = Field(None, description="Whether the cane is active")
    updated_by: Optional[str] = Field(None, description="User who last updated the record")


class CaneResponse(CaneBase):
    """Schema for cane response"""
    cane_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


# ============================================
# CRYOLOCK SCHEMAS
# ============================================

class CryolockBase(BaseModel):
    """Base schema for cryolock"""
    cane_id: int = Field(..., description="Reference to cane")
    cryolock_number: Optional[str] = Field(None, description="Cryolock number")
    cryolock_color: Optional[str] = Field(None, description="Cryolock color")
    created_by: Optional[str] = Field(None, description="User who created the record")
    updated_by: Optional[str] = Field(None, description="User who last updated the record")


class CryolockCreate(CryolockBase):
    """Schema for creating a new cryolock"""
    pass


class CryolockUpdate(BaseModel):
    """Schema for updating cryolock information"""
    cryolock_number: Optional[str] = Field(None, description="Cryolock number")
    cryolock_color: Optional[str] = Field(None, description="Cryolock color")
    updated_by: Optional[str] = Field(None, description="User who last updated the record")


class CryolockResponse(CryolockBase):
    """Schema for cryolock response"""
    cryolock_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


# ============================================
# PATIENT SCHEMAS (IVF)
# ============================================

class PatientBase(BaseModel):
    """Base schema for IVF patient"""
    his_number: Optional[str] = Field(None, description="Hospital Information System number")
    created_by: Optional[str] = Field(None, description="User who created the record")
    updated_by: Optional[str] = Field(None, description="User who last updated the record")


class PatientCreate(PatientBase):
    """Schema for creating a new IVF patient"""
    pass


class PatientUpdate(BaseModel):
    """Schema for updating IVF patient information"""
    his_number: Optional[str] = Field(None, description="Hospital Information System number")
    updated_by: Optional[str] = Field(None, description="User who last updated the record")


class PatientResponse(PatientBase):
    """Schema for IVF patient response"""
    patient_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


# ============================================
# EMBRYO SCHEMAS
# ============================================

class EmbryoBase(BaseModel):
    """Base schema for embryo"""
    patient_id: int = Field(..., description="Reference to patient")
    cryolock_id: int = Field(..., description="Reference to cryolock")
    date_of_vitrification: Optional[date] = Field(None, description="Date of vitrification")
    embryo_grading: Optional[str] = Field(None, description="Embryo grading")
    status: Optional[str] = Field(None, description="Embryo status")
    is_active: bool = Field(default=True, description="Whether the embryo is active")
    created_by: Optional[str] = Field(None, description="User who created the record")
    updated_by: Optional[str] = Field(None, description="User who last updated the record")


class EmbryoCreate(EmbryoBase):
    """Schema for creating a new embryo"""
    pass


class EmbryoUpdate(BaseModel):
    """Schema for updating embryo information"""
    date_of_vitrification: Optional[date] = Field(None, description="Date of vitrification")
    embryo_grading: Optional[str] = Field(None, description="Embryo grading")
    status: Optional[str] = Field(None, description="Embryo status")
    is_active: Optional[bool] = Field(None, description="Whether the embryo is active")
    updated_by: Optional[str] = Field(None, description="User who last updated the record")


class EmbryoResponse(EmbryoBase):
    """Schema for embryo response"""
    embryo_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


# ============================================
# EXISTING SCHEMAS (for backward compatibility)
# ============================================

class AddressSchema(BaseModel):
    """Schema for hospital branch address"""
    area: Optional[str] = Field(None, description="Area/Street address")
    district: Optional[str] = Field(None, description="District name")
    pincode: Optional[str] = Field(None, description="Pincode")
    
    class Config:
        from_attributes = True


class GeoLocationSchema(BaseModel):
    """Schema for geographic location coordinates"""
    latitude: Optional[float] = Field(None, description="Latitude coordinate")
    longitude: Optional[float] = Field(None, description="Longitude coordinate")
    
    class Config:
        from_attributes = True


class BranchSchema(BaseModel):
    """Schema for a single branch within a state"""
    branch_name: Optional[str] = Field(None, description="Branch name")
    branch_status: str = Field(default="safe", description="Branch status")
    country_name: Optional[str] = Field(None, description="Country name where the branch is located")
    address: AddressSchema = Field(..., description="Branch address details")
    geoLocation: GeoLocationSchema = Field(..., description="Geographic coordinates")
    
    class Config:
        from_attributes = True


class IVFControlTowerResponse(BaseModel):
    """Schema for IVF control tower API response organized by states"""
    hospitalName: str = Field(..., description="Hospital name")
    hospital_type: Optional[str] = Field(None, description="Hospital type")
    states: Dict[str, List[BranchSchema]] = Field(..., description="Branches organized by state name")
    highest_branch_count_country: Optional[str] = Field(None, description="Country with the highest number of branches")
    
    class Config:
        from_attributes = True


# ============================================
# ACTIVE CANISTERS CONTROL TOWER SCHEMA
# ============================================

class ActiveTankItem(BaseModel):
    """Schema for a single active tank in control tower"""
    tank_id: int = Field(..., description="Tank ID (primary key)")
    tank_code: str = Field(..., description="Tank code (e.g., 'T1')")
    updated_at: Optional[datetime] = Field(None, description="Last updated date and time from tanks table")
    status: CanisterStatus = Field(..., description="Tank status (safe, risk, critical)")
    deviations: int = Field(..., description="Number of readings deviations")
    class Config:
        from_attributes = True


class BranchTanks(BaseModel):
    """Schema for tanks grouped by branch"""
    branch_id: int = Field(..., description="Branch ID")
    branch_name: str = Field(..., description="Branch name")
    tanks: List[ActiveTankItem] = Field(..., description="List of active tanks for this branch")
    
    class Config:
        from_attributes = True


class ActiveCanistersResponse(BaseModel):
    """Schema for active tanks control tower API response grouped by branch (kept name for backward compatibility)"""
    branches: List[BranchTanks] = Field(..., description="List of branches with their active tanks")
    total: int = Field(..., description="Total number of active tanks across all branches")
    
    class Config:
        from_attributes = True


# ============================================
# ACTIVE INCUBATORS CONTROL TOWER SCHEMA
# ============================================

class ActiveIncubatorItem(BaseModel):
    incubator_id: int
    incubator_code: Optional[str] = None
    external_id: Optional[str] = None
    type: Optional[str] = None
    chamber_r: Optional[int] = None
    chamber_c: Optional[int] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class BranchIncubators(BaseModel):
    branch_id: int
    branch_name: str
    incubators: List[ActiveIncubatorItem]

    class Config:
        from_attributes = True


class ActiveIncubatorsResponse(BaseModel):
    branches: List[BranchIncubators]
    total: int

    class Config:
        from_attributes = True


# ============================================
# EMBRYO TRACKING SCHEMA
# ============================================

class EmbryoTrackingItem(BaseModel):
    """Schema for embryo tracking table row"""
    his_number: str = Field(..., description="Patient HIS Number")
    cryolock_number: Optional[str] = Field(None, description="Cryolock Number")
    canister_number: Optional[str] = Field(None, description="Canister Number/Code")
    tank_code: Optional[str] = Field(None, description="Tank Code")
    cane_code: Optional[str] = Field(None, description="Cane Code")
    goblet_color: Optional[str] = Field(None, description="Goblet Color")
    cryolock_color: Optional[str] = Field(None, description="Cryolock Color")
    date_of_vitrification: Optional[date] = Field(None, description="Date of Vitrification")
    embryo_grading: Optional[str] = Field(None, description="Comma-separated embryo gradings (User role only)")
    site_name: Optional[str] = Field(None, description="Branch name (Manager/Admin roles only)")
    status: Optional[str] = Field(None, description="Embryo status (Manager/Admin roles only)")
    description: Optional[str] = Field(None, description="Shipment description if cryolock is in transit (from ivf_shipment table)")
    
    class Config:
        from_attributes = True


class BranchListItem(BaseModel):
    """Schema for branch list item (simplified for dropdowns)"""
    branch_id: int = Field(..., description="Branch ID")
    branch_name: str = Field(..., description="Branch name")
    
    class Config:
        from_attributes = True


class BranchListResponse(BaseModel):
    """Response schema for branch list endpoint"""
    branches: List[BranchListItem] = Field(..., description="List of branches")
    total: int = Field(..., description="Total number of branches")
    
    class Config:
        from_attributes = True


class EmbryoTransferCrylockItem(BaseModel):
    """Schema for embryo transfer crylock item"""
    his_number: str = Field(..., description="Patient HIS Number")
    cryolock_number: str = Field(..., description="Cryolock number")
    canister_number: str = Field(..., description="Canister number")
    tank_code: str = Field(..., description="Tank code")
    cane_code: str = Field(..., description="Cane code")
    goblet_color: str = Field(..., description="Goblet color")
    cryolock_color: str = Field(..., description="Cryolock color")
    date_of_vitrification: Optional[date] = Field(None, description="Date of vitrification")
    branch_name: str = Field(..., description="Branch name")
    tank_id: int = Field(..., description="Tank ID")


class EmbryoTransferResponse(BaseModel):
    """Response schema for embryo transfer crylocks"""
    data: List[EmbryoTransferCrylockItem] = Field(..., description="List of embryo transfer crylocks")
    total: int = Field(..., description="Total number of embryo transfer crylocks")
    message: str = Field(..., description="Response message")
    
    class Config:
        from_attributes = True


class ShipmentDetails(BaseModel):
    """Schema for shipment details"""
    shipment_id: Optional[str] = Field(None, description="Shipment ID")
    iot_shipment_id: Optional[str] = Field(None, description="IoT shipment ID from Tive")
    source_branch_id: Optional[int] = Field(None, description="Source branch ID")
    destination_branch_id: Optional[int] = Field(None, description="Destination branch ID")
    source_location: Optional[str] = Field(None, description="Source location name")
    destination_location: Optional[str] = Field(None, description="Destination location name")
    source_latitude: Optional[float] = Field(None, description="Source latitude")
    source_longitude: Optional[float] = Field(None, description="Source longitude")
    destination_latitude: Optional[float] = Field(None, description="Destination latitude")
    destination_longitude: Optional[float] = Field(None, description="Destination longitude")
    description: Optional[str] = Field(None, description="Shipment description")
    device_id: Optional[str] = Field(None, description="IoT tracker device ID")
    shipment_status: Optional[str] = Field(None, description="Shipment status (created, in_transit, delivered, cancelled, failed)")
    departure_time: Optional[datetime] = Field(None, description="Actual departure time")
    arrival_time: Optional[datetime] = Field(None, description="Actual arrival time")
    scheduled_departure_time: Optional[datetime] = Field(None, description="Scheduled departure time")
    
    class Config:
        from_attributes = True


class InTransitCrylockItem(BaseModel):
    """Schema for in-transit crylock item"""
    his_number: str = Field(..., description="Patient HIS Number")
    cryolock_number: str = Field(..., description="Cryolock number")
    canister_number: str = Field(..., description="Canister number")
    tank_code: str = Field(..., description="Tank code")
    cane_code: str = Field(..., description="Cane code")
    goblet_color: str = Field(..., description="Goblet color")
    cryolock_color: str = Field(..., description="Cryolock color")
    date_of_vitrification: Optional[date] = Field(None, description="Date of vitrification")
    branch_name: str = Field(..., description="Branch name")
    tank_id: int = Field(..., description="Tank ID")
    shipment_details: Optional[ShipmentDetails] = Field(None, description="Shipment details if available")


class InTransitResponse(BaseModel):
    """Response schema for in-transit crylocks"""
    data: List[InTransitCrylockItem] = Field(..., description="List of in-transit crylocks")
    total: int = Field(..., description="Total number of in-transit crylocks")
    message: str = Field(..., description="Response message")
    
    class Config:
        from_attributes = True


class EmbryoTrackingResponse(BaseModel):
    """Schema for embryo tracking API response"""
    data: List[EmbryoTrackingItem] = Field(..., description="List of embryo tracking records")
    total: int = Field(..., description="Total number of records")
    offset: int = Field(default=0, description="Number of records skipped")
    limit: int = Field(default=50, description="Number of records fetched")
    has_more: bool = Field(default=False, description="Whether more records are available")
    next_offset: Optional[int] = Field(None, description="Offset to request next chunk, or null when no more records")
    message: str = Field(default="Embryo tracking data fetched successfully", description="Response message")
    
    class Config:
        from_attributes = True

