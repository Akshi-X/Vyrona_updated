from sqlalchemy.orm import Session
from sqlalchemy import and_, desc, func
from typing import List, Optional, Dict
from datetime import datetime, timedelta
import calendar

from app.schemas.patient_schema import (
    PatientCreate, 
    PatientUpdate, 
    PatientResponse, 
    PatientCreateRequest,
    PatientCreateResponse,
    PharmaStatisticsResponse,
    PatientSummaryResponse,
    PatientDetailedResponse
)
from app.models.patient_model import Patient
from app.utils.patient_utils import generate_patient_id
from app.exceptions.patient_exceptions import (
    PatientNotFoundError,
    PatientValidationError,
    PatientServiceError
)

class PatientService:
    def __init__(self, db: Session):
        self.db = db

    def create_patient(self, patient_data: PatientCreate) -> PatientResponse:
        """Create a new patient with business logic validation"""
        try:
            # Business logic validations can be added here
            # For example: check if therapy_id exists, validate insurance, etc.
            
            # Generate custom patient ID in format PTddmmyy-001
            patient_id = generate_patient_id(self.db)
            
            db_patient = Patient(
                id=patient_id,
                **patient_data.model_dump()
            )
            self.db.add(db_patient)
            self.db.commit()
            self.db.refresh(db_patient)
            
            return PatientResponse.model_validate(db_patient)
        except Exception as e:
            raise PatientServiceError("create_patient", f"Failed to create patient: {str(e)}")

    def get_patient_by_id(self, patient_id: str) -> PatientResponse:
        """Get patient by ID with business logic"""
        try:
            db_patient = self.db.query(Patient).filter(Patient.id == patient_id).first()
            if not db_patient:
                raise PatientNotFoundError(patient_id)
            return PatientResponse.model_validate(db_patient)
        except PatientNotFoundError:
            raise
        except Exception as e:
            raise PatientServiceError("get_patient_by_id", f"Failed to get patient: {str(e)}")

    def get_all_patients(self) -> List[PatientResponse]:
        """Get all patients without pagination or search"""
        try:
            patients = self.db.query(Patient).order_by(desc(Patient.created_at)).all()
            return [PatientResponse.model_validate(patient) for patient in patients]
        except Exception as e:
            raise PatientServiceError("get_all_patients", f"Failed to get patients: {str(e)}")

    def update_patient(self, patient_id: str, patient_data: PatientUpdate) -> PatientResponse:
        """Update patient with business logic validation"""
        try:
            # Check if patient exists
            db_patient = self.db.query(Patient).filter(Patient.id == patient_id).first()
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

    def get_patients_by_provider(self, provider_id: str) -> List[PatientResponse]:
        """Get all patients for a specific provider"""
        try:
            patients = self.db.query(Patient).filter(Patient.provider_id == provider_id).all()
            return [PatientResponse.model_validate(patient) for patient in patients]
        except Exception as e:
            raise PatientServiceError("get_patients_by_provider", f"Failed to get patients by provider: {str(e)}")

    def get_patients_by_pharma(self, pharma_id: str) -> List[PatientResponse]:
        """Get all patients for a specific pharma"""
        try:
            patients = self.db.query(Patient).filter(Patient.pharma_id == pharma_id).all()
            return [PatientResponse.model_validate(patient) for patient in patients]
        except Exception as e:
            raise PatientServiceError("get_patients_by_pharma", f"Failed to get patients by pharma: {str(e)}")

    def patient_exists(self, patient_id: str) -> bool:
        """Check if patient exists"""
        return self.db.query(Patient).filter(Patient.id == patient_id).first() is not None

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

    def get_pharma_statistics(self, pharma_id: str) -> PharmaStatisticsResponse:
        """Get comprehensive statistics for a specific pharma"""
        try:
            # Get total patient count for this pharma
            patient_count = self.db.query(Patient).filter(Patient.pharma_id == pharma_id).count()
            
            # Get treatment count (patients with therapy_id)
            treatment_count = self.db.query(Patient).filter(
                and_(Patient.pharma_id == pharma_id, Patient.therapy_id.isnot(None))
            ).count()
            
            # Get top therapy
            top_therapy_result = self.db.query(
                Patient.therapy_id,
                func.count(Patient.id).label('count')
            ).filter(
                and_(Patient.pharma_id == pharma_id, Patient.therapy_id.isnot(None))
            ).group_by(Patient.therapy_id).order_by(desc('count')).first()
            
            top_therapy = None
            if top_therapy_result:
                top_therapy = {
                    "therapy_id": top_therapy_result.therapy_id,
                    "count": top_therapy_result.count
                }
            
            # Get top conditions
            top_conditions_result = self.db.query(
                Patient.condition,
                func.count(Patient.id).label('count')
            ).filter(Patient.pharma_id == pharma_id).group_by(Patient.condition).order_by(desc('count')).limit(5).all()
            
            top_conditions = [
                {"condition": result.condition, "count": result.count}
                for result in top_conditions_result
            ]
            
            # Get recent patients (last 30 days)
            thirty_days_ago = datetime.now() - timedelta(days=30)
            recent_patients = self.db.query(Patient).filter(
                and_(
                    Patient.pharma_id == pharma_id,
                    Patient.created_at >= thirty_days_ago
                )
            ).count()
            
            # Get monthly statistics for the last 12 months
            monthly_stats = self._get_monthly_statistics(pharma_id)
            
            statistics_data = {
                "pharma_id": pharma_id,
                "patient_count": patient_count,
                "treatment_count": treatment_count,
                "top_therapy": top_therapy,
                "top_conditions": top_conditions,
                "recent_patients": recent_patients,
                "monthly_statistics": monthly_stats
            }
            
            return PharmaStatisticsResponse(**statistics_data)
        except Exception as e:
            raise PatientServiceError("get_pharma_statistics", f"Failed to get pharma statistics: {str(e)}")

    def _get_monthly_statistics(self, pharma_id: str) -> List[Dict]:
        """Get monthly statistics for the last 12 months"""
        monthly_stats = []
        current_date = datetime.now()
        
        for i in range(12):
            # Calculate the month (going back i months from current)
            target_year = current_date.year
            target_month = current_date.month - i
            
            # Handle year rollover
            while target_month <= 0:
                target_month += 12
                target_year -= 1
            
            # Calculate the start and end of the month
            month_start = datetime(target_year, target_month, 1, 0, 0, 0)
            
            # Get the last day of the month
            last_day = calendar.monthrange(target_year, target_month)[1]
            if i == 0:
                # For current month, use current date as end
                month_end = current_date
            else:
                month_end = datetime(target_year, target_month, last_day, 23, 59, 59)
            
            # Get patient count for this month
            patient_count = self.db.query(Patient).filter(
                and_(
                    Patient.pharma_id == pharma_id,
                    Patient.created_at >= month_start,
                    Patient.created_at <= month_end
                )
            ).count()
            
            # Get treatment count for this month (patients with therapy_id)
            treatment_count = self.db.query(Patient).filter(
                and_(
                    Patient.pharma_id == pharma_id,
                    Patient.therapy_id.isnot(None),
                    Patient.created_at >= month_start,
                    Patient.created_at <= month_end
                )
            ).count()
            
            monthly_stats.append({
                "month": month_start.strftime("%Y-%m"),
                "patient_count": patient_count,
                "treatment_count": treatment_count
            })
        
        # Reverse to get chronological order (oldest first)
        return list(reversed(monthly_stats))

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

    def get_patients_summary(self, pharma_id: str) -> List[PatientSummaryResponse]:
        """Get patient summary data with joined provider and pharma information - only patients with 'Scheduled' stage for specific pharma"""
        try:
            # Import here to avoid circular imports
            from app.models.pharma_model import Pharma
            from app.models.provider_model import Provider
            
            # Query with joins to get related data - filter for specific pharma and scheduled patients
            query = self.db.query(
                Patient.id.label('patient_id'),
                Patient.condition,
                Patient.hospital_name.label('hospital'),
                Patient.stage,
                Provider.name.label('provider_name'),
                Pharma.location.label('pharma_location')
            ).outerjoin(
                Provider, Patient.provider_id == Provider.id
            ).outerjoin(
                Pharma, Patient.pharma_id == Pharma.id
            ).filter(
                Patient.pharma_id == pharma_id,  # Filter by specific pharma
                Patient.stage == 'Scheduled'     # Only show scheduled patients
            ).order_by(desc(Patient.created_at))
            
            results = query.all()
            
            # Convert to PatientSummaryResponse objects
            summary_data = []
            for result in results:
                summary_data.append(PatientSummaryResponse(
                    patient_id=result.patient_id,
                    condition=result.condition,
                    hospital=result.hospital,
                    stage=result.stage,
                    provider_name=result.provider_name,
                    pharma_location=result.pharma_location
                ))
            
            return summary_data
            
        except Exception as e:
            raise PatientServiceError("get_patients_summary", f"Failed to get patients summary: {str(e)}")

    def get_patients_detailed(self, pharma_id: str) -> List[PatientDetailedResponse]:
        """Get detailed patient data with docs_report for specific pharma"""
        try:
            # Import here to avoid circular imports
            from app.models.pharma_model import Pharma
            from app.models.provider_model import Provider
            
            # Query with joins to get related data - filter for specific pharma
            query = self.db.query(
                Patient.id.label('patient_id'),
                Patient.condition,
                Patient.stage,
                Patient.docs_report,
                Provider.name.label('provider_name'),
                Pharma.location.label('pharma_location')
            ).outerjoin(
                Provider, Patient.provider_id == Provider.id
            ).outerjoin(
                Pharma, Patient.pharma_id == Pharma.id
            ).filter(
                Patient.pharma_id == pharma_id  # Filter by specific pharma
            ).order_by(desc(Patient.created_at))
            
            results = query.all()
            
            # Convert to PatientDetailedResponse objects
            detailed_data = []
            for result in results:
                detailed_data.append(PatientDetailedResponse(
                    patient_id=result.patient_id,
                    condition=result.condition,
                    pharma_location=result.pharma_location,
                    provider_name=result.provider_name,
                    stage=result.stage,
                    docs_report=result.docs_report
                ))
            
            return detailed_data
            
        except Exception as e:
            raise PatientServiceError("get_patients_detailed", f"Failed to get patients detailed: {str(e)}")