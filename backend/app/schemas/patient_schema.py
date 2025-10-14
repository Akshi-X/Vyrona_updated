from pydantic import BaseModel, Field, RootModel
from typing import Optional, List, Union
from datetime import datetime


class PatientBase(BaseModel):
    patient_name: str = Field(..., min_length=1, max_length=255, description="Patient's full name")
    condition: str = Field(..., min_length=1, max_length=500, description="Patient's medical condition")
    therapy_id: Optional[str] = Field(None, description="Reference to therapy")
    insurance_provider: Optional[str] = Field(None, max_length=255, description="Insurance provider name")
    insurance_type: Optional[str] = Field(None, max_length=100, description="Type of insurance")
    hospital_name: Optional[str] = Field(None, max_length=255, description="Hospital name")
    location: Optional[str] = Field(None, max_length=255, description="Patient location")
    provider_id: Optional[str] = Field(None, description="Reference to provider")
    pharma_id: Optional[str] = Field(None, description="Reference to pharma")
    stage_id: Optional[int] = Field(None, description="Reference to stage")
    created_by: Optional[str] = Field(None, max_length=255, description="User who created the record")
    updated_by: Optional[str] = Field(None, max_length=255, description="User who last updated the record")


class PatientCreate(PatientBase):
    """Schema for creating a new patient"""
    pass


class PatientCreateRequest(RootModel):
    """Schema that accepts either single patient or list of patients"""
    root: Union[PatientCreate, List[PatientCreate]] = Field(..., description="Single patient or list of patients to create")


class PatientUpdate(BaseModel):
    """Schema for updating patient information"""
    patient_name: Optional[str] = Field(None, min_length=1, max_length=255)
    condition: Optional[str] = Field(None, min_length=1, max_length=500)
    therapy_id: Optional[str] = None
    insurance_provider: Optional[str] = Field(None, max_length=255)
    insurance_type: Optional[str] = Field(None, max_length=100)
    hospital_name: Optional[str] = Field(None, max_length=255)
    location: Optional[str] = Field(None, max_length=255)
    provider_id: Optional[str] = None
    pharma_id: Optional[str] = None
    stage_id: Optional[int] = None
    updated_by: Optional[str] = Field(None, max_length=255)


class PatientResponse(PatientBase):
    """Schema for patient response"""
    id: str
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class PatientListResponse(BaseModel):
    """Schema for paginated patient list response"""
    patients: list[PatientResponse]
    total: int
    page: int
    size: int
    total_pages: int


class PatientCreateResponse(BaseModel):
    """Schema for patient creation response (single or multiple)"""
    patients: List[PatientResponse]
    total_created: int
    message: str


class MonthlyStats(BaseModel):
    """Schema for monthly statistics"""
    month: str = Field(..., description="Month in YYYY-MM format")
    patient_count: int = Field(0, description="Number of patients added in this month")
    treatment_count: int = Field(0, description="Number of treatments started in this month")


class PharmaStatisticsResponse(BaseModel):
    """Schema for pharma statistics response"""
    pharma_id: str
    patient_count: int
    treatment_count: int
    top_therapy: Optional[dict] = Field(None, description="Top therapy with count")
    top_conditions: List[dict] = Field(default_factory=list, description="Top conditions with counts")
    recent_patients: int = Field(0, description="Patients added in last 30 days")
    monthly_statistics: List[MonthlyStats] = Field(default_factory=list, description="Monthly statistics for the last 12 months")
