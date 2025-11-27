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
    quality_deviation_flagged: int = Field(0, description="Number of quality deviation alerts flagged in current month")


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


# ============================================
# PATIENT JOURNEY SUMMARY SCHEMAS
# ============================================

class ShipmentLegDetail(BaseModel):
    """Schema for individual shipment leg details"""
    leg_order: int = Field(..., description="Order of the leg in the shipment")
    mode_of_transport: str = Field(..., description="Mode of transport (Road, Air, etc.)")
    from_location: str = Field(..., description="Source location")
    to_location: str = Field(..., description="Destination location")
    carrier_name: Optional[str] = Field(None, description="Carrier name")
    provider_name: Optional[str] = Field(None, description="Provider name")
    departure_time: Optional[datetime] = Field(None, description="Departure time")
    arrival_time: Optional[datetime] = Field(None, description="Arrival time")
    scheduled_time: Optional[datetime] = Field(None, description="Scheduled completion time")
    handover_time: Optional[datetime] = Field(None, description="Handover time")
    leg_status: str = Field(..., description="Leg status (safe, delayed, high_risk, failed)")
    leg_quality_loss: Optional[float] = Field(None, description="Quality loss for this leg")
    ln2_refill: Optional[str] = Field(None, description="LN2 refill status")
    warehouse: Optional[str] = Field(None, description="Warehouse information")
    doc_count_actual: Optional[int] = Field(None, description="Actual document count")
    doc_count_needed: Optional[int] = Field(None, description="Required document count")
    
    class Config:
        from_attributes = True


class ShipmentLegSummary(BaseModel):
    """Schema for shipment leg summary with status"""
    status: str = Field(..., description="Overall status: completed, in_progress, upcoming")
    provider_name: Optional[str] = Field(None, description="Primary provider name for this shipment")
    legs: List[ShipmentLegDetail] = Field(default_factory=list, description="List of shipment legs")
    arrival_date: Optional[str] = Field(None, description="Arrival date at destination (ISO format)")
    planned_date: Optional[str] = Field(None, description="Planned/scheduled date (ISO format)")
    
    class Config:
        from_attributes = True


class ReengineeringStage(BaseModel):
    """Schema for reengineering/manufacturing phase"""
    status: str = Field(..., description="Status: completed, ongoing, upcoming")
    start_date: Optional[str] = Field(None, description="Start date (ISO format)")
    end_date: Optional[str] = Field(None, description="End date (ISO format)")
    scheduled_start: Optional[str] = Field(None, description="Scheduled start date (ISO format)")
    scheduled_end: Optional[str] = Field(None, description="Scheduled end date (ISO format)")
    description: Optional[str] = Field(None, description="Description or notes")
    
    class Config:
        from_attributes = True


class CurrentStatusSummary(BaseModel):
    """Schema for current overall status"""
    leg1_status: str = Field(..., description="Leg 1 status")
    reengineering_status: str = Field(..., description="Reengineering status")
    leg2_status: str = Field(..., description="Leg 2 status")
    overall_stage: Optional[PatientStage] = Field(None, description="Current patient stage")
    
    class Config:
        from_attributes = True


class PatientJourneySummaryResponse(BaseModel):
    """Schema for complete patient journey summary"""
    patient_id: str = Field(..., description="Patient ID")
    condition: str = Field(..., description="Patient condition")
    hospital_name: Optional[str] = Field(None, description="Hospital name")
    
    leg1: Optional[ShipmentLegSummary] = Field(None, description="Leg 1: Hospital to Pharma")
    reengineering: Optional[ReengineeringStage] = Field(None, description="Reengineering/Manufacturing phase")
    leg2: Optional[ShipmentLegSummary] = Field(None, description="Leg 2: Pharma to Hospital")
    
    current_status: CurrentStatusSummary = Field(..., description="Current overall status summary")
    
    class Config:
        from_attributes = True


# ============================================
# CONTROL TOWER MAP SCHEMAS
# ============================================

class ControlTowerMapRoute(BaseModel):
    """Schema for a shipment route on the control tower map"""
    shipment_id: int = Field(..., description="Shipment ID")
    patient_id: str = Field(..., description="Patient ID")
    source_location: str = Field(..., description="Source location name")
    destination_location: str = Field(..., description="Destination location name")
    source_latitude: Optional[float] = Field(None, description="Latitude of source location")
    source_longitude: Optional[float] = Field(None, description="Longitude of source location")
    destination_latitude: Optional[float] = Field(None, description="Latitude of destination location")
    destination_longitude: Optional[float] = Field(None, description="Longitude of destination location")
    route_status: str = Field(..., description="Route status: safe, delayed, high_risk, or failed")
    carrier: Optional[str] = Field(None, description="Carrier name")
    region: Optional[str] = Field(None, description="Combined region (e.g., 'Europe' or 'Europe → Asia' if different)")
    source_region: Optional[str] = Field(None, description="Region of source location")
    destination_region: Optional[str] = Field(None, description="Region of destination location")
    last_updated: Optional[str] = Field(None, description="Last updated time in 24-hour format (e.g., '16:25:17')")
    
    class Config:
        from_attributes = True


class ControlTowerMapResponse(BaseModel):
    """Schema for control tower map API response"""
    routes: List[ControlTowerMapRoute] = Field(..., description="List of routes for map display")
    total_routes: int = Field(..., description="Total number of routes")
    last_updated: Optional[str] = Field(None, description="Most recent updated time across all shipments in 24-hour format (e.g., '16:25:17')")
    message: Optional[str] = Field(None, description="Message when no routes are found after applying filters")

    class Config:
        from_attributes = True

# --------------------------------------------
# Single-patient stage lookup response
# --------------------------------------------
class PatientStageResponse(BaseModel):
    """Schema for current stage of a patient"""
    patient_id: str
    stage: Optional[PatientStage] = None
    reengineering_status: Optional[bool] = Field(False, description="True if reengineering completed and 2nd shipment started, else False")


# ============================================
# DOCUMENT CHECKLIST SCHEMAS
# ============================================

class DocumentChecklistItem(BaseModel):
    """Schema for document checklist item from shipment leg"""
    stage: str = Field(..., description="Stage in format 'from_location - to_location'")
    actual: Optional[int] = Field(None, description="Actual document count (doc_count_actual)")
    needed: Optional[int] = Field(None, description="Required document count (doc_count_needed)")
    missed: Optional[int] = Field(None, description="Missed document count (needed - actual, minimum 0)")

    class Config:
        from_attributes = True


class DocumentChecklistResponse(BaseModel):
    """Schema for document checklist API response"""
    items: List[DocumentChecklistItem] = Field(..., description="List of document checklist items")
    total_items: int = Field(..., description="Total number of items")
    missing_documents: List[str] = Field(default_factory=list, description="Overall list of missing document names across all shipment legs")
    non_compliance_percentage: float = Field(..., description="Non-compliance percentage calculated as ((total_needed - total_actual) / total_needed) * 100")

    class Config:
        from_attributes = True