from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List
from functools import wraps
from app.config.database import get_db
from app.service.patient_service import PatientService
from app.schemas.patient_schema import (
    PatientCreate,
    PatientUpdate,
    PatientResponse,
    PatientCreateRequest,
    PatientCreateResponse,
    PharmaStatisticsResponse
)
from app.exceptions.patient_exceptions import (
    PatientNotFoundError,
    PatientValidationError,
    PatientServiceError
)
# from app.enums.patient_constants import PatientConstants

router = APIRouter(prefix="/patients", tags=["patients"])


def handle_patient_exceptions(func):
    """Decorator to handle patient-specific exceptions"""
    @wraps(func)
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except PatientNotFoundError as e:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=e.message
            )
        except PatientValidationError as e:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=e.message
            )
        except PatientServiceError as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=e.message
            )
    return wrapper


@router.post("/", response_model=PatientCreateResponse, status_code=status.HTTP_201_CREATED)
@handle_patient_exceptions
def create_patients(
    request_data: PatientCreateRequest,
    db: Session = Depends(get_db)
):
    """Create single or multiple patients"""
    patient_service = PatientService(db)
    return patient_service.create_patients(request_data)


@router.get("/", response_model=List[PatientResponse])
@handle_patient_exceptions
def get_all_patients(db: Session = Depends(get_db)):
    """Get all patients"""
    patient_service = PatientService(db)
    return patient_service.get_all_patients()
    

@router.get("/{patient_id}", response_model=PatientResponse)
@handle_patient_exceptions
def get_patient_by_id(
    patient_id: str,
    db: Session = Depends(get_db)
):
    """Get patient by ID"""
    patient_service = PatientService(db)
    return patient_service.get_patient_by_id(patient_id)


@router.put("/{patient_id}", response_model=PatientResponse)
@handle_patient_exceptions
def update_patient(
    patient_id: str,
    patient_data: PatientUpdate,
    db: Session = Depends(get_db)
):
    """Update patient information"""
    patient_service = PatientService(db)
    return patient_service.update_patient(patient_id, patient_data)


@router.delete("/{patient_id}", status_code=status.HTTP_204_NO_CONTENT)
@handle_patient_exceptions
def delete_patient(
    patient_id: str,
    db: Session = Depends(get_db)
):
    """Delete patient"""
    patient_service = PatientService(db)
    patient_service.delete_patient(patient_id)


@router.get("/provider/{provider_id}", response_model=List[PatientResponse])
@handle_patient_exceptions
def get_patients_by_provider(
    provider_id: str,
    db: Session = Depends(get_db)
):
    """Get all patients for a specific provider"""
    patient_service = PatientService(db)
    return patient_service.get_patients_by_provider(provider_id)


@router.get("/pharma/{pharma_id}", response_model=List[PatientResponse])
@handle_patient_exceptions
def get_patients_by_pharma(
    pharma_id: str,
    db: Session = Depends(get_db)
):
    """Get all patients for a specific pharma"""
    patient_service = PatientService(db)
    return patient_service.get_patients_by_pharma(pharma_id)




@router.get("/statistics/pharma/{pharma_id}", response_model=PharmaStatisticsResponse)
@handle_patient_exceptions
def get_pharma_statistics(
    pharma_id: str,
    db: Session = Depends(get_db)
):
    """Get comprehensive statistics for a specific pharma"""
    patient_service = PatientService(db)
    return patient_service.get_pharma_statistics(pharma_id)


@router.get("/search/advanced", response_model=List[PatientResponse])
@handle_patient_exceptions
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
