from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List

from app.config.database import get_db
from app.dependencies.auth_dependencies import get_current_user_pharma_id
from app.service.patient_service import PatientService
from app.schemas.patient_schema import (
    PatientUpdate,
    PatientResponse,
    PatientCreateRequest,
    PatientCreateResponse,
    PharmaStatisticsResponse,
    PatientSummaryResponse,
    PatientDetailedResponse,
    PatientStageResponse
)

router = APIRouter(prefix="/patients", tags=["patients"])


@router.post("/", response_model=PatientCreateResponse, status_code=201)
def create_patients(
    request_data: PatientCreateRequest,
    pharma_id: int = Depends(get_current_user_pharma_id),
    db: Session = Depends(get_db)
):
    """Create single or multiple patients for authenticated user's pharma"""
    # Override pharma_id from token for security (prevent users from creating patients for other pharma)
    patients_data = request_data.root
    if isinstance(patients_data, list):
        for patient in patients_data:
            patient.pharma_id = pharma_id
    else:
        patients_data.pharma_id = pharma_id
    
    # Call service (all business logic there)
    patient_service = PatientService(db)
    return patient_service.create_patients(request_data)


@router.get("/", response_model=List[PatientResponse])
def get_all_patients(
    pharma_id: int = Depends(get_current_user_pharma_id),
    db: Session = Depends(get_db)
):
    """Get all patients for authenticated user's pharma"""
    # Call service (all business logic there)
    patient_service = PatientService(db)
    return patient_service.get_all_patients(pharma_id=pharma_id)


@router.get("/ongoing", response_model=List[PatientSummaryResponse])
def get_patients_summary(
    pharma_id: int = Depends(get_current_user_pharma_id),
    db: Session = Depends(get_db)
):
    """Get patient summary data with joined provider and pharma information - only patients with 'Scheduled' stage for authenticated user's pharma"""
    patient_service = PatientService(db)
    return patient_service.get_patients_summary(pharma_id=pharma_id)


@router.get("/detailed", response_model=List[PatientDetailedResponse])
def get_patients_detailed(
    pharma_id: int = Depends(get_current_user_pharma_id),
    db: Session = Depends(get_db)
):
    """Get detailed patient data with docs_report for authenticated user's pharma"""
    patient_service = PatientService(db)
    return patient_service.get_patients_detailed(pharma_id=pharma_id)


@router.get("/statistics", response_model=PharmaStatisticsResponse)
def get_user_pharma_statistics(
    pharma_id: int = Depends(get_current_user_pharma_id),
    db: Session = Depends(get_db)
):
    """Get comprehensive statistics for authenticated user's pharma"""
    patient_service = PatientService(db)
    return patient_service.get_pharma_statistics(pharma_id)


@router.get("/provider/{provider_id}", response_model=List[PatientResponse])
def get_patients_by_provider(
    provider_id: str,
    pharma_id: int = Depends(get_current_user_pharma_id),
    db: Session = Depends(get_db)
):
    """Get all patients for a specific provider within authenticated user's pharma"""
    # Call service (all business logic there)
    patient_service = PatientService(db)
    return patient_service.get_patients_by_provider(provider_id, pharma_id=pharma_id)


@router.get("/{patient_id}", response_model=PatientResponse)
def get_patient_by_id(
    patient_id: str,
    pharma_id: int = Depends(get_current_user_pharma_id),
    db: Session = Depends(get_db)
):
    """Get patient by ID for authenticated user's pharma"""
    # Call service (all business logic there)
    patient_service = PatientService(db)
    return patient_service.get_patient_by_id(patient_id, pharma_id=pharma_id)


@router.put("/{patient_id}", response_model=PatientResponse)
def update_patient(
    patient_id: str,
    patient_data: PatientUpdate,
    pharma_id: int = Depends(get_current_user_pharma_id),
    db: Session = Depends(get_db)
):
    """Update patient information for authenticated user's pharma"""
    # Call service (all business logic there)
    patient_service = PatientService(db)
    return patient_service.update_patient(patient_id, patient_data, pharma_id=pharma_id)


@router.delete("/{patient_id}", response_model=dict)
def delete_patient(
    patient_id: str,
    pharma_id: int = Depends(get_current_user_pharma_id),
    db: Session = Depends(get_db)
):
    """Delete patient for authenticated user's pharma"""
    # Call service (all business logic there)
    patient_service = PatientService(db)
    patient_service.delete_patient(patient_id, pharma_id=pharma_id)
    return {"message": "Patient deleted successfully"}


@router.get("/{patient_id}/stage", response_model=PatientStageResponse)
def get_patient_stage(
    patient_id: str,
    pharma_id: int = Depends(get_current_user_pharma_id),
    db: Session = Depends(get_db)
):
    """Get the current stage for a patient from process_phase table"""
    patient_service = PatientService(db)
    return patient_service.get_patient_current_stage(patient_id=patient_id, pharma_id=pharma_id)

