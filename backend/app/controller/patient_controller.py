from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import List

from app.config.database import get_db
from app.service.patient_service import PatientService
from app.schemas.patient_schema import (
    PatientUpdate,
    PatientResponse,
    PatientCreateRequest,
    PatientCreateResponse,
    PharmaStatisticsResponse
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


@router.delete("/{patient_id}", status_code=204)
def delete_patient(
    patient_id: str,
    db: Session = Depends(get_db)
):
    """Delete patient"""
    # Call service (all business logic there)
    patient_service = PatientService(db)
    patient_service.delete_patient(patient_id)


@router.get("/provider/{provider_id}", response_model=List[PatientResponse])
def get_patients_by_provider(
    provider_id: str,
    db: Session = Depends(get_db)
):
    """Get all patients for a specific provider"""
    # Call service (all business logic there)
    patient_service = PatientService(db)
    return patient_service.get_patients_by_provider(provider_id)


@router.get("/pharma/{pharma_id}", response_model=List[PatientResponse])
def get_patients_by_pharma(
    pharma_id: str,
    db: Session = Depends(get_db)
):
    """Get all patients for a specific pharma"""
    # Call service (all business logic there)
    patient_service = PatientService(db)
    return patient_service.get_patients_by_pharma(pharma_id)


@router.get("/statistics/pharma/{pharma_id}", response_model=PharmaStatisticsResponse)
def get_pharma_statistics(
    pharma_id: str,
    db: Session = Depends(get_db)
):
    """Get comprehensive statistics for a specific pharma"""
    # Call service (all business logic there)
    patient_service = PatientService(db)
    return patient_service.get_pharma_statistics(pharma_id)


@router.get("/search/advanced", response_model=List[PatientResponse])
def search_patients_advanced(
    patient_name: str = Query(None, description="Filter by patient name"),
    condition: str = Query(None, description="Filter by condition"),
    hospital_name: str = Query(None, description="Filter by hospital name"),
    insurance_provider: str = Query(None, description="Filter by insurance provider"),
    therapy_id: str = Query(None, description="Filter by therapy ID"),
    provider_id: str = Query(None, description="Filter by provider ID"),
    pharma_id: str = Query(None, description="Filter by pharma ID"),
    stage_id: int = Query(None, description="Filter by stage ID"),
    db: Session = Depends(get_db)
):
    """Advanced search for patients with multiple filters"""
    # Call service (all business logic there)
    patient_service = PatientService(db)
    return patient_service.search_patients_advanced(
        patient_name=patient_name,
        condition=condition,
        hospital_name=hospital_name,
        insurance_provider=insurance_provider,
        therapy_id=therapy_id,
        provider_id=provider_id,
        pharma_id=pharma_id,
        stage_id=stage_id
    )