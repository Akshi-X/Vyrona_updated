from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, desc, func
from typing import List, Optional, Dict
from datetime import datetime

from app.schemas.patient_schema import (
    PatientCreate, 
    PatientUpdate, 
    PatientResponse, 
    PatientCreateRequest,
    PatientCreateResponse,
    PharmaStatisticsResponse,
    PatientSummaryResponse,
    PatientDetailedResponse,
    PatientStageResponse
)
from app.models.patient_model import Patient
from app.models.patient_stage_model import PatientStage
from app.utils.patient_utils import generate_patient_id
from app.exceptions.patient_exceptions import (
    PatientNotFoundError,
    PatientValidationError,
    PatientServiceError
)

class PatientService:
    def __init__(self, db: Session):
        self.db = db


    def get_patient_by_id(self, patient_id: str, pharma_id: int) -> PatientResponse:
        """Get patient by ID with business logic and pharma filtering"""
        try:
            db_patient = self.db.query(Patient).filter(
                and_(Patient.id == patient_id, Patient.pharma_id == pharma_id)
            ).first()
            if not db_patient:
                raise PatientNotFoundError(patient_id)
            return PatientResponse.model_validate(db_patient)
        except PatientNotFoundError:
            raise
        except Exception as e:
            raise PatientServiceError("get_patient_by_id", f"Failed to get patient: {str(e)}")

    def get_all_patients(self, pharma_id: int) -> List[PatientResponse]:
        """Get all patients for specific pharma without pagination or search"""
        try:
            patients = self.db.query(Patient).filter(
                Patient.pharma_id == pharma_id
            ).order_by(desc(Patient.created_at)).all()
            return [PatientResponse.model_validate(patient) for patient in patients]
        except Exception as e:
            raise PatientServiceError("get_all_patients", f"Failed to get patients: {str(e)}")

    def update_patient(self, patient_id: str, patient_data: PatientUpdate, pharma_id: int) -> PatientResponse:
        """Update patient with business logic validation and pharma filtering"""
        try:
            # Check if patient exists and belongs to the pharma
            db_patient = self.db.query(Patient).filter(
                and_(Patient.id == patient_id, Patient.pharma_id == pharma_id)
            ).first()
            if not db_patient:
                raise PatientNotFoundError(patient_id)
            
            # Business logic validations can be added here
            # For example: check if therapy_id exists, validate insurance, etc.
            
            update_data = patient_data.model_dump(exclude_unset=True)
            for field, value in update_data.items():
                setattr(db_patient, field, value)
            
            self.db.commit()
            self.db.refresh(db_patient)
            
            return PatientResponse.model_validate(db_patient)
        except PatientNotFoundError:
            raise
        except Exception as e:
            raise PatientServiceError("update_patient", f"Failed to update patient: {str(e)}")

    def get_patients_by_provider(self, provider_id: str, pharma_id: int) -> List[PatientResponse]:
        """Get all patients for a specific provider within pharma"""
        try:
            patients = self.db.query(Patient).filter(
                and_(Patient.provider_id == provider_id, Patient.pharma_id == pharma_id)
            ).all()
            return [PatientResponse.model_validate(patient) for patient in patients]
        except Exception as e:
            raise PatientServiceError("get_patients_by_provider", f"Failed to get patients by provider: {str(e)}")

    def delete_patient(self, patient_id: str, pharma_id: int) -> None:
        """Delete patient with pharma filtering"""
        try:
            # Check if patient exists and belongs to the pharma
            db_patient = self.db.query(Patient).filter(
                and_(Patient.id == patient_id, Patient.pharma_id == pharma_id)
            ).first()
            if not db_patient:
                raise PatientNotFoundError(patient_id)

            self.db.delete(db_patient)
            self.db.commit()
        except PatientNotFoundError:
            raise
        except Exception as e:
            raise PatientServiceError("delete_patient", f"Failed to delete patient: {str(e)}")

    def create_multiple_patients(self, patients_data: List[PatientCreate]) -> List[Patient]:
        """Create multiple patients in a single transaction"""
        created_patients = []
        
        try:
            for patient_data in patients_data:
                # Generate custom patient ID for each patient
                patient_id = generate_patient_id(self.db)
                
                db_patient = Patient(
                    id=patient_id,
                    **patient_data.model_dump()
                )
                self.db.add(db_patient)
                created_patients.append(db_patient)
            
            # Commit all patients at once
            self.db.commit()
            
            # Refresh all patients to get the generated IDs and timestamps
            for patient in created_patients:
                self.db.refresh(patient)
            
            return created_patients
            
        except Exception as e:
            # Rollback the transaction if any patient creation fails
            self.db.rollback()
            raise e

    def get_pharma_statistics(self, pharma_id: int) -> PharmaStatisticsResponse:
        """Get current month statistics for a specific pharma"""
        try:
            # Get current month start and end dates
            current_date = datetime.now()
            current_month_start = current_date.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            
            # Calculate next month start for end date
            if current_date.month == 12:
                next_month_start = current_date.replace(year=current_date.year + 1, month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
            else:
                next_month_start = current_date.replace(month=current_date.month + 1, day=1, hour=0, minute=0, second=0, microsecond=0)
            
            # Get current month patient count for this pharma
            current_month_patient_count = self.db.query(Patient).filter(
                and_(
                    Patient.pharma_id == pharma_id,
                    Patient.created_at >= current_month_start,
                    Patient.created_at < next_month_start
                )
            ).count()
            
            # Get current month treatment count (patients with therapy_id)
            current_month_treatment_count = self.db.query(Patient).filter(
                and_(
                    Patient.pharma_id == pharma_id,
                    Patient.therapy_id.isnot(None),
                    Patient.created_at >= current_month_start,
                    Patient.created_at < next_month_start
                )
            ).count()
            
            statistics_data = {
                "pharma_id": pharma_id,
                "current_month_patient_count": current_month_patient_count,
                "current_month_treatment_count": current_month_treatment_count
            }
            
            return PharmaStatisticsResponse(**statistics_data)
        except Exception as e:
            raise PatientServiceError("get_pharma_statistics", f"Failed to get pharma statistics: {str(e)}")


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
                db_patients = self.create_multiple_patients(patients_data)
                created_patients = [PatientResponse.model_validate(patient) for patient in db_patients]
                
                message = f"Successfully created {len(created_patients)} patient(s)"
                
            except Exception as e:
                # If bulk creation fails, try creating patients individually
                for i, patient_data in enumerate(patients_data):
                    try:
                        db_patient = self.create_patient(patient_data)
                        created_patients.append(db_patient)
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

    def get_patients_summary(self, pharma_id: int) -> List[PatientSummaryResponse]:
        """Get patient summary data with joined provider and pharma information - includes all patients plus failure and aftercare data from last 2 weeks"""
        try:
            # Import here to avoid circular imports
            from app.models.pharma_model import Pharma
            from app.models.provider_model import Provider
            from datetime import datetime, timedelta, timezone
            from app.constants.enums import PatientStage as PatientStageEnum
            
            # Calculate date 2 weeks ago from today
            two_weeks_ago = datetime.now(timezone.utc) - timedelta(weeks=2)
            
            # Query with joins to get related data - filter for specific pharma
            # Include all patients OR failure/aftercare patients from last 2 weeks
            query = self.db.query(
                Patient.id.label('patient_id'),
                Patient.condition,
                Patient.hospital_name.label('hospital'),
                PatientStage.stage,
                PatientStage.is_success.label('treatment_status'),  # Map is_success to treatment_status for compatibility
                Provider.name.label('provider_name'),
                Pharma.location.label('pharma_location')
            ).outerjoin(
                Provider, Patient.provider_id == Provider.id
            ).outerjoin(
                Pharma, Patient.pharma_id == Pharma.id
            ).outerjoin(
                PatientStage, and_(
                    Patient.id == PatientStage.patient_id,
                    PatientStage.is_active == True
                )
            ).filter(
                Patient.pharma_id == pharma_id,  # Filter by specific pharma
                # Include all patients OR failure/aftercare patients updated in last 2 weeks
                or_(
                    # All patients (no stage filter)
                    PatientStage.stage.is_(None),
                    PatientStage.stage == PatientStageEnum.SCHEDULED,
                    PatientStage.stage == PatientStageEnum.APHERESIS,
                    PatientStage.stage == PatientStageEnum.CRYOPRESERVATION,
                    PatientStage.stage == PatientStageEnum.TRANSPORTATION,
                    PatientStage.stage == PatientStageEnum.REENGINEERING,
                    PatientStage.stage == PatientStageEnum.REINFUSION,
                    # OR failure/aftercare patients updated in last 2 weeks
                    and_(
                        PatientStage.is_success.in_([False, True]),
                        PatientStage.updated_at >= two_weeks_ago
                    )
                )
            ).order_by(desc(Patient.created_at))
            
            results = query.all()
            
            # Convert to PatientSummaryResponse objects
            summary_data = []
            for result in results:
                # Map is_success to treatment_status for backward compatibility
                treatment_status = "ongoing"  # Default to ongoing for active stages
                if result.treatment_status is not None:
                    if result.treatment_status == False:
                        treatment_status = "failure"
                    elif result.treatment_status == True:
                        treatment_status = "after_care"
                
                summary_data.append(PatientSummaryResponse(
                    patient_id=result.patient_id,
                    condition=result.condition,
                    hospital=result.hospital,
                    stage=result.stage,
                    treatment_status=treatment_status,
                    provider_name=result.provider_name,
                    location=result.pharma_location
                ))
            
            return summary_data
            
        except Exception as e:
            raise PatientServiceError("get_patients_summary", f"Failed to get patients summary: {str(e)}")

    def get_patients_detailed(self, pharma_id: int) -> List[PatientDetailedResponse]:
        """Get detailed patient data with docs_report for specific pharma"""
        try:
            # Import here to avoid circular imports
            from app.models.pharma_model import Pharma
            from app.models.provider_model import Provider
            
            # Query with joins to get related data - filter for specific pharma
            query = self.db.query(
                Patient.id.label('patient_id'),
                Patient.condition,
                Patient.hospital_name.label('hospital'),
                PatientStage.stage,
                PatientStage.is_success.label('treatment_status'),  # Map is_success to treatment_status for compatibility
                Patient.docs_report,
                Provider.name.label('provider_name'),
                Pharma.location.label('pharma_location')
            ).outerjoin(
                Provider, Patient.provider_id == Provider.id
            ).outerjoin(
                Pharma, Patient.pharma_id == Pharma.id
            ).outerjoin(
                PatientStage, and_(
                    Patient.id == PatientStage.patient_id,
                    PatientStage.is_active == True
                )
            ).filter(
                Patient.pharma_id == pharma_id  # Filter by specific pharma
            ).order_by(desc(Patient.created_at))
            
            results = query.all()
            
            # Convert to PatientDetailedResponse objects
            detailed_data = []
            for result in results:
                # Map is_success to treatment_status for backward compatibility
                treatment_status = "ongoing"  # Default to ongoing for active stages
                if result.treatment_status is not None:
                    if result.treatment_status == False:
                        treatment_status = "failure"
                    elif result.treatment_status == True:
                        treatment_status = "after_care"
                
                detailed_data.append(PatientDetailedResponse(
                    patient_id=result.patient_id,
                    condition=result.condition,
                    hospital=result.hospital,
                    stage=result.stage,
                    treatment_status=treatment_status,
                    provider_name=result.provider_name,
                    location=result.pharma_location,
                    docs_report=result.docs_report
                ))
            
            return detailed_data
            
        except Exception as e:
            raise PatientServiceError("get_patients_detailed", f"Failed to get patients detailed: {str(e)}")

    def get_patient_current_stage(self, patient_id: str, pharma_id: int) -> PatientStageResponse:
        """Return the current stage for a patient from process_phase table.

        Verifies the patient belongs to the provided pharma_id, then fetches
        the active stage. If no active stage exists, returns the latest stage
        by start_time. If no stages exist, stage is None.
        """
        try:
            # Ensure patient exists and belongs to pharma
            patient = self.db.query(Patient).filter(
                and_(Patient.id == patient_id, Patient.pharma_id == pharma_id)
            ).first()
            if not patient:
                raise PatientNotFoundError(patient_id)

            # Prefer active stage; otherwise latest stage by start_time
            active_stage = self.db.query(PatientStage).filter(
                and_(
                    PatientStage.patient_id == patient_id,
                    PatientStage.is_active == True
                )
            ).order_by(desc(PatientStage.start_time)).first()

            stage_row = active_stage
            if not stage_row:
                stage_row = self.db.query(PatientStage).filter(
                    PatientStage.patient_id == patient_id
                ).order_by(desc(PatientStage.start_time)).first()

            return PatientStageResponse(
                patient_id=patient_id,
                stage=stage_row.stage if stage_row else None
            )
        except PatientNotFoundError:
            raise
        except Exception as e:
            raise PatientServiceError("get_patient_current_stage", f"Failed to get patient stage: {str(e)}")