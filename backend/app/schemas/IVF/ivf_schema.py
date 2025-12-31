from pydantic import BaseModel, Field
from typing import List, Optional, Dict


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
    address: AddressSchema = Field(..., description="Branch address details")
    geoLocation: GeoLocationSchema = Field(..., description="Geographic coordinates")
    
    class Config:
        from_attributes = True


class IVFControlTowerResponse(BaseModel):
    """Schema for IVF control tower API response organized by states"""
    hospitalName: str = Field(..., description="Hospital name")
    hospital_type: Optional[str] = Field(None, description="Hospital type")
    states: Dict[str, List[BranchSchema]] = Field(..., description="Branches organized by state name")
    
    class Config:
        from_attributes = True

