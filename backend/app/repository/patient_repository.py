from sqlalchemy.orm import Session
from sqlalchemy import and_, desc, func
from typing import List, Optional, Dict
from app.models.patient_model import Patient
from app.schemas.patient_schema import PatientCreate, PatientUpdate
from app.utils.patient_utils import generate_patient_id
from datetime import datetime, timedelta
import calendar


class PatientRepository:
    def __init__(self, db: Session):
        self.db = db

    def create_patient(self, patient_data: PatientCreate) -> Patient:
        """Create a new patient record with custom ID format PTddmmyy-001"""
        # Generate custom patient ID in format PTddmmyy-001
        patient_id = generate_patient_id(self.db)
        
        db_patient = Patient(
            id=patient_id,
            **patient_data.model_dump()
        )
        self.db.add(db_patient)
        self.db.commit()
        self.db.refresh(db_patient)
        return db_patient
    

    def get_patient_by_id(self, patient_id: str) -> Optional[Patient]:
        """Get patient by ID"""
        return self.db.query(Patient).filter(Patient.id == patient_id).first()

    def get_all_patients(self) -> List[Patient]:
        """Get all patients without pagination or search"""
        return self.db.query(Patient).order_by(desc(Patient.created_at)).all()

    def update_patient(self, patient_id: str, patient_data: PatientUpdate) -> Optional[Patient]:
        """Update patient information"""
        db_patient = self.get_patient_by_id(patient_id)
        if not db_patient:
            return None
        
        update_data = patient_data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_patient, field, value)
        
        self.db.commit()
        self.db.refresh(db_patient)
        return db_patient

    def delete_patient(self, patient_id: str) -> bool:
        """Delete patient record"""
        db_patient = self.get_patient_by_id(patient_id)
        if not db_patient:
            return False
        
        self.db.delete(db_patient)
        self.db.commit()
        return True

    def get_patients_by_provider(self, provider_id: str) -> List[Patient]:
        """Get all patients for a specific provider"""
        return self.db.query(Patient).filter(Patient.provider_id == provider_id).all()

    def get_patients_by_pharma(self, pharma_id: str) -> List[Patient]:
        """Get all patients for a specific pharma"""
        return self.db.query(Patient).filter(Patient.pharma_id == pharma_id).all()

    def patient_exists(self, patient_id: str) -> bool:
        """Check if patient exists"""
        return self.db.query(Patient).filter(Patient.id == patient_id).first() is not None

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
    ) -> List[Patient]:
        """Advanced search for patients with multiple filters"""
        query = self.db.query(Patient)
        
        # Apply filters if provided
        if patient_name:
            query = query.filter(Patient.patient_name.ilike(f"%{patient_name}%"))
        if condition:
            query = query.filter(Patient.condition.ilike(f"%{condition}%"))
        if hospital_name:
            query = query.filter(Patient.hospital_name.ilike(f"%{hospital_name}%"))
        if insurance_provider:
            query = query.filter(Patient.insurance_provider.ilike(f"%{insurance_provider}%"))
        if therapy_id:
            query = query.filter(Patient.therapy_id == therapy_id)
        if provider_id:
            query = query.filter(Patient.provider_id == provider_id)
        if pharma_id:
            query = query.filter(Patient.pharma_id == pharma_id)
        if stage_id:
            query = query.filter(Patient.stage_id == stage_id)
        
        return query.order_by(desc(Patient.created_at)).all()

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

    def get_pharma_statistics(self, pharma_id: str) -> Dict:
        """Get comprehensive statistics for a specific pharma"""
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
        
        return {
            "pharma_id": pharma_id,
            "patient_count": patient_count,
            "treatment_count": treatment_count,
            "top_therapy": top_therapy,
            "top_conditions": top_conditions,
            "recent_patients": recent_patients,
            "monthly_statistics": monthly_stats
        }

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
