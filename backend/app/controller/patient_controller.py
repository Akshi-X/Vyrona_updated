from fastapi import APIRouter, Depends, Query
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
    PatientDetailedResponse
)

router = APIRouter(prefix="/patients", tags=["patients"])


@router.post("/", response_model=PatientCreateResponse, status_code=201)
def create_patients(
    request_data: PatientCreateRequest,
    db: Session = Depends(get_db)
):
    """Create single or multiple patients"""
    # Call service (all business logic there)
    patient_service = PatientService(db)
    return patient_service.create_patients(request_data)


@router.get("/", response_model=List[PatientResponse])
def get_all_patients(db: Session = Depends(get_db)):
    """Get all patients"""
    # Call service (all business logic there)
    patient_service = PatientService(db)
    return patient_service.get_all_patients()


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
    db: Session = Depends(get_db)
):
    """Get all patients for a specific provider"""
    # Call service (all business logic there)
    patient_service = PatientService(db)
    return patient_service.get_patients_by_provider(provider_id)


@router.get("/{patient_id}", response_model=PatientResponse)
def get_patient_by_id(
    patient_id: str,
    db: Session = Depends(get_db)
):
    """Get patient by ID"""
    # Call service (all business logic there)
    patient_service = PatientService(db)
    return patient_service.get_patient_by_id(patient_id)


@router.put("/{patient_id}", response_model=PatientResponse)
def update_patient(
    patient_id: str,
    patient_data: PatientUpdate,
    db: Session = Depends(get_db)
):
    """Update patient information"""
    # Call service (all business logic there)
    patient_service = PatientService(db)
    return patient_service.update_patient(patient_id, patient_data)


@router.delete("/{patient_id}", response_model=dict)
def delete_patient(
    patient_id: str,
    db: Session = Depends(get_db)
):
    """Delete patient"""
    # Call service (all business logic there)
    patient_service = PatientService(db)
    patient_service.delete_patient(patient_id)
    return {"message": "Patient deleted successfully"}