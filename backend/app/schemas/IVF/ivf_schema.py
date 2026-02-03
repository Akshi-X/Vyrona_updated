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
    canister_status: CanisterStatus = Field(default=CanisterStatus.SAFE, description="Canister status (safe, risk, critical)")
    created_by: Optional[str] = Field(None, description="User who created the record")
    updated_by: Optional[str] = Field(None, description="User who last updated the record")


class CanisterCreate(CanisterBase):
    """Schema for creating a new canister"""
    pass


class CanisterUpdate(BaseModel):
    """Schema for updating canister information"""
    canister_number: Optional[int] = Field(None, description="Canister number")
    is_active: Optional[bool] = Field(None, description="Whether the canister is active")
    canister_status: Optional[CanisterStatus] = Field(None, description="Canister status (safe, risk, critical)")
    updated_by: Optional[str] = Field(None, description="User who last updated the record")


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
    """Base schema for canister LN2 log"""
    canister_id: Optional[int] = Field(None, description="Reference to canister (for IVF)")
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

class ActiveCanisterItem(BaseModel):
    """Schema for a single active canister in control tower"""
    canister_number: str = Field(..., description="Canister number/code (e.g., 'C1')")
    canister_status: CanisterStatus = Field(..., description="Canister status (safe, risk, critical)")
    updated_at: Optional[datetime] = Field(None, description="Last updated date and time from canister log refill_date+refill_time")
    
    class Config:
        from_attributes = True


class BranchCanisters(BaseModel):
    """Schema for canisters grouped by branch"""
    branch_id: int = Field(..., description="Branch ID")
    branch_name: str = Field(..., description="Branch name")
    canisters: List[ActiveCanisterItem] = Field(..., description="List of active canisters for this branch")
    
    class Config:
        from_attributes = True


class ActiveCanistersResponse(BaseModel):
    """Schema for active canisters control tower API response grouped by branch"""
    branches: List[BranchCanisters] = Field(..., description="List of branches with their active canisters")
    total: int = Field(..., description="Total number of active canisters across all branches")
    
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


class EmbryoTrackingResponse(BaseModel):
    """Schema for embryo tracking API response"""
    data: List[EmbryoTrackingItem] = Field(..., description="List of embryo tracking records")
    total: int = Field(..., description="Total number of records")
    
    class Config:
        from_attributes = True

