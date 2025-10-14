from sqlalchemy.orm import Session
from typing import List, Optional
from ..repository.patient_repository import PatientRepository
from ..schemas.patient_schema import (
    PatientCreate, 
    PatientUpdate, 
    PatientResponse, 
    PatientCreateRequest,
    PatientCreateResponse,
    PharmaStatisticsResponse
)
from ..models.patient_model import Patient
from ..exceptions.patient_exceptions import (
    PatientNotFoundError,
    PatientValidationError,
    PatientServiceError
)

class PatientService:
    def __init__(self, db: Session):
        self.repository = PatientRepository(db)

    def create_patient(self, patient_data: PatientCreate) -> PatientResponse:
        """Create a new patient with business logic validation"""
        try:
            # Business logic validations can be added here
            # For example: check if therapy_id exists, validate insurance, etc.
            
            db_patient = self.repository.create_patient(patient_data)
            return PatientResponse.model_validate(db_patient)
        except Exception as e:
            raise PatientServiceError("create_patient", f"Failed to create patient: {str(e)}")

    def get_patient_by_id(self, patient_id: str) -> PatientResponse:
        """Get patient by ID with business logic"""
        try:
            db_patient = self.repository.get_patient_by_id(patient_id)
            if not db_patient:
                raise PatientNotFoundError(patient_id)
            return PatientResponse.model_validate(db_patient)
        except PatientNotFoundError:
            raise
        except Exception as e:
            raise PatientServiceError("get_patient_by_id", f"Failed to get patient: {str(e)}")

    def get_all_patients(self) -> List[PatientResponse]:
        """Get all patients """
        try:
            patients = self.repository.get_all_patients()
            return [PatientResponse.model_validate(patient) for patient in patients]
        except Exception as e:
            raise PatientServiceError("get_all_patients", f"Failed to get patients: {str(e)}")

    def update_patient(self, patient_id: str, patient_data: PatientUpdate) -> PatientResponse:
        """Update patient with business logic validation"""
        try:
            # Check if patient exists
            if not self.repository.patient_exists(patient_id):
                raise PatientNotFoundError(patient_id)
            
            # Business logic validations can be added here
            # For example: check if therapy_id exists, validate insurance, etc.
            
            db_patient = self.repository.update_patient(patient_id, patient_data)
            if not db_patient:
                raise PatientNotFoundError(patient_id)
            
            return PatientResponse.model_validate(db_patient)
        except PatientNotFoundError:
            raise
        except Exception as e:
            raise PatientServiceError("update_patient", f"Failed to update patient: {str(e)}")

    def delete_patient(self, patient_id: str) -> bool:
        """Delete patient with business logic validation"""
        try:
            # Check if patient exists
            if not self.repository.patient_exists(patient_id):
                raise PatientNotFoundError(patient_id)
            
            # Additional business logic can be added here
            # For example: check if patient has active treatments, etc.
            
            return self.repository.delete_patient(patient_id)
        except PatientNotFoundError:
            raise
        except Exception as e:
            raise PatientServiceError("delete_patient", f"Failed to delete patient: {str(e)}")


    def get_patients_by_provider(self, provider_id: str) -> List[PatientResponse]:
        """Get all patients for a specific provider"""
        patients = self.repository.get_patients_by_provider(provider_id)
        return [PatientResponse.model_validate(patient) for patient in patients]

    def get_patients_by_pharma(self, pharma_id: str) -> List[PatientResponse]:
        """Get all patients for a specific pharma"""
        patients = self.repository.get_patients_by_pharma(pharma_id)
        return [PatientResponse.model_validate(patient) for patient in patients]


    def get_pharma_statistics(self, pharma_id: str) -> PharmaStatisticsResponse:
        """Get comprehensive statistics for a specific pharma"""
        try:
            statistics_data = self.repository.get_pharma_statistics(pharma_id)
            return PharmaStatisticsResponse(**statistics_data)
        except Exception as e:
            raise PatientServiceError("get_pharma_statistics", f"Failed to get pharma statistics: {str(e)}")

    def search_patients_advanced(
        self,
        patient_name: Optional[str] = None,
        condition: Optional[str] = None,
        hospital_name: Optional[str] = None,
        insurance_provider: Optional[str] = None,
        therapy_id: Optional[str] = None,
        provider_id: Optional[str] = None,
        pharma_id: Optional[str] = None,
        stage_id: Optional[int] = None
    ) -> List[PatientResponse]:
        """Advanced search for patients with multiple filters"""
        try:
            patients = self.repository.search_patients_advanced(
                patient_name=patient_name,
                condition=condition,
                hospital_name=hospital_name,
                insurance_provider=insurance_provider,
                therapy_id=therapy_id,
                provider_id=provider_id,
                pharma_id=pharma_id,
                stage_id=stage_id
            )
            
            return [PatientResponse.model_validate(patient) for patient in patients]
        except Exception as e:
            raise PatientServiceError("search_patients_advanced", f"Failed to perform advanced search: {str(e)}")

    def create_patients(self, request_data: PatientCreateRequest) -> PatientCreateResponse:
        """Create single or multiple patients with business logic validation"""
        try:
            patients_data = request_data.root
            
            # Convert single patient to list for uniform processing
            if isinstance(patients_data, PatientCreate):
                patients_data = [patients_data]
            
            # Validate that we have patients to create
            if not patients_data:
                raise PatientValidationError("patients", "At least one patient must be provided")
            
            # Limit the number of patients that can be created at once
            if len(patients_data) > 100:
                raise PatientValidationError("patients", "Cannot create more than 100 patients at once")
            
            # Business logic validations can be added here
            # For example: check for duplicate patient names, validate therapy_ids, etc.
            
            created_patients = []
            
            try:
                # Create all patients in a single transaction
                db_patients = self.repository.create_multiple_patients(patients_data)
                created_patients = [PatientResponse.model_validate(patient) for patient in db_patients]
                
                message = f"Successfully created {len(created_patients)} patient(s)"
                
            except Exception as e:
                # If bulk creation fails, try creating patients individually
                for i, patient_data in enumerate(patients_data):
                    try:
                        db_patient = self.repository.create_patient(patient_data)
                        created_patients.append(PatientResponse.model_validate(db_patient))
                    except Exception as individual_error:
                        # Log the error but continue with other patients
                        print(f"Failed to create patient {i}: {str(individual_error)}")
                        continue
                
                if not created_patients:
                    raise PatientServiceError("create_patients", f"Failed to create any patients: {str(e)}")
                
                message = f"Successfully created {len(created_patients)} out of {len(patients_data)} patient(s)"
            
            return PatientCreateResponse(
                patients=created_patients,
                total_created=len(created_patients),
                message=message
            )
            
        except PatientValidationError:
            raise
        except Exception as e:
            raise PatientServiceError("create_patients", f"Failed to create patients: {str(e)}")
