from pydantic import BaseModel, Field, RootModel
from typing import Optional, List, Union
from datetime import datetime
from app.constants.enums import PatientStage, TreatmentStatus


class PatientBase(BaseModel):
    patient_name: str = Field(..., min_length=1, max_length=255, description="Patient's full name")
    condition: str = Field(..., min_length=1, max_length=500, description="Patient's medical condition")
    therapy_id: Optional[str] = Field(None, description="Reference to therapy")
    insurance_provider: Optional[str] = Field(None, max_length=255, description="Insurance provider name")
    insurance_type: Optional[str] = Field(None, max_length=100, description="Type of insurance")
    hospital_name: Optional[str] = Field(None, max_length=255, description="Hospital name")
    location: Optional[str] = Field(None, max_length=255, description="Patient location")
    provider_id: Optional[str] = Field(None, description="Reference to provider")
    pharma_id: Optional[int] = Field(None, description="Reference to pharma")
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
    pharma_id: Optional[int] = None
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
    """Schema for pharma statistics response - current month only"""
    pharma_id: int
    current_month_patient_count: int = Field(0, description="Number of patients added in current month")
    current_month_treatment_count: int = Field(0, description="Number of treatments started in current month")


class PatientSummaryResponse(BaseModel):
    """Schema for patient summary with joined data"""
    patient_id: str = Field(..., description="Patient ID")
    condition: str = Field(..., description="Patient condition")
    hospital: Optional[str] = Field(None, description="Hospital name")
    stage: Optional[PatientStage] = Field(None, description="Patient treatment stage")
    treatment_status: Optional[str] = Field(None, description="Patient treatment status (failure/after_care/ongoing)")
    provider_name: Optional[str] = Field(None, description="Provider name")
    location: Optional[str] = Field(None, description="Pharma location")
    
    class Config:
        from_attributes = True


class PatientDetailedResponse(BaseModel):
    """Schema for detailed patient data with docs_report"""
    patient_id: str = Field(..., description="Patient ID")
    condition: str = Field(..., description="Patient condition")
    hospital: Optional[str] = Field(None, description="Hospital name")
    stage: Optional[PatientStage] = Field(None, description="Patient treatment stage")
    treatment_status: Optional[str] = Field(None, description="Patient treatment status (failure/after_care/ongoing)")
    provider_name: Optional[str] = Field(None, description="Provider name")
    location: Optional[str] = Field(None, description="Pharma location")
    docs_report: Optional[bytes] = Field(None, description="Patient documents report")
    
    class Config:
        from_attributes = True
