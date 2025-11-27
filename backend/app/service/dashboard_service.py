from datetime import datetime, timezone
from typing import Tuple, Dict, Optional
import json
import logging

from sqlalchemy import func, case
from sqlalchemy.orm import Session

from app.models.shipment_model import Shipment
from app.models.patient_model import Patient
from app.models.patient_stage_model import PatientStage
from app.schemas.dashboard_schema import (
    DashboardCategoryResponse,
    AvgLeadTimeResponse,
    SuccessRateResponse,
    AvgQualityDeviationsResponse
)
from app.service.redis_service import get_redis

logger = logging.getLogger(__name__)


class DashboardService:
    """Service layer for dashboard metrics."""

    def __init__(self, db: Session):
        self.db = db

    def _get_current_month_bounds(self) -> Tuple[datetime, datetime]:
        """Return start of current month and start of next month."""
        current_date = datetime.now()
        current_month_start = current_date.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        if current_date.month == 12:
            next_month_start = current_date.replace(
                year=current_date.year + 1,
                month=1,
                day=1,
                hour=0,
                minute=0,
                second=0,
                microsecond=0
            )
        else:
            next_month_start = current_date.replace(
                month=current_date.month + 1,
                day=1,
                hour=0,
                minute=0,
                second=0,
                microsecond=0
            )

        return current_month_start, next_month_start

    def _calculate_average_lead_time(self, shipments) -> Tuple[float, int, int]:
        """Return avg lead time (days), completed count, pending count."""
        total_shipments = len(shipments)
        completed_shipments = 0
        lead_time_shipments = 0
        total_lead_time_days = 0.0

        for departure_time, arrival_time in shipments:
            if arrival_time is not None:
                completed_shipments += 1
                if arrival_time >= departure_time:
                    lead_time_shipments += 1
                    duration_seconds = (arrival_time - departure_time).total_seconds()
                    total_lead_time_days += duration_seconds / (24 * 3600)

        avg_lead_time_days = round(total_lead_time_days / lead_time_shipments, 2) if lead_time_shipments else 0.0
        pending_shipments = max(total_shipments - completed_shipments, 0)
        return avg_lead_time_days, completed_shipments, pending_shipments

    def _calculate_on_time_percentage(self, pharma_id: int) -> Tuple[float, int, int]:
        """
        Calculate on-time percentage for current month.
        
        On-Time % = (On-Time Deliveries ÷ Total Deliveries) × 100
        On-Time Deliveries = Sum(Is Actual Handover Time ≤ Estimated Handover Time ? YES → On-Time)
        
        Returns:
            Tuple of (on_time_percentage, on_time_deliveries, total_deliveries)
        """
        current_month_start, next_month_start = self._get_current_month_bounds()

        # Query shipments with both handover_time and scheduled_time for current month
        shipments = (
            self.db.query(Shipment.handover_time, Shipment.scheduled_time)
            .filter(
                Shipment.pharma_id == pharma_id,
                Shipment.handover_time.isnot(None),
                Shipment.scheduled_time.isnot(None),
                Shipment.departure_time.isnot(None),
                Shipment.departure_time >= current_month_start,
                Shipment.departure_time < next_month_start
            )
            .all()
        )

        total_deliveries = len(shipments)
        on_time_deliveries = 0

        for handover_time, scheduled_time in shipments:
            # On-time if actual handover time <= estimated handover time
            if handover_time <= scheduled_time:
                on_time_deliveries += 1

        # Calculate percentage: (On-Time Deliveries ÷ Total Deliveries) × 100
        on_time_percentage = round((on_time_deliveries / total_deliveries * 100), 2) if total_deliveries > 0 else 0.0

        return on_time_percentage, on_time_deliveries, total_deliveries

    def _build_performance_metrics(self, pharma_id: int) -> Dict:
        """Assemble metrics for the performance dashboard category."""
        current_month_start, next_month_start = self._get_current_month_bounds()

        monthly_shipments = (
            self.db.query(Shipment.departure_time, Shipment.arrival_time)
            .filter(
                Shipment.pharma_id == pharma_id,
                Shipment.departure_time.isnot(None),
                Shipment.departure_time >= current_month_start,
                Shipment.departure_time < next_month_start
            )
            .all()
        )

        avg_lead_time_days, completed_shipments, pending_shipments = self._calculate_average_lead_time(monthly_shipments)
        on_time_percentage, on_time_deliveries, total_deliveries = self._calculate_on_time_percentage(pharma_id)

        metrics = {
            "on_time_percentage": on_time_percentage,
            "avg_lead_time_days": avg_lead_time_days,
            "total_shipments": len(monthly_shipments),
            "completed_shipments": completed_shipments,
            "pending_shipments": pending_shipments,
            "on_time_deliveries": on_time_deliveries,
            "total_deliveries": total_deliveries
        }
        return metrics

    def get_performance_metrics(self, pharma_id: int) -> DashboardCategoryResponse:
        """Return current month performance metrics for the provided pharma."""
        metrics = self._build_performance_metrics(pharma_id)
        return DashboardCategoryResponse(
            category="performance",
            metrics=metrics,
            last_updated=datetime.now(),
            status="success"
        )

    def get_average_lead_time(self, pharma_id: int) -> AvgLeadTimeResponse:
        """Return only average lead time stats for the provided pharma."""
        metrics = self._build_performance_metrics(pharma_id)
        return AvgLeadTimeResponse(
            avg_lead_time_days=metrics["avg_lead_time_days"],
            total_shipments=metrics["total_shipments"],
            completed_shipments=metrics["completed_shipments"],
            pending_shipments=metrics["pending_shipments"],
            status="success",
            last_updated=datetime.now()
        )

    def get_on_time_percentage(self, pharma_id: int) -> Dict:
        """Return only on-time percentage stats for the provided pharma for current month."""
        on_time_percentage, on_time_deliveries, total_deliveries = self._calculate_on_time_percentage(pharma_id)
        return {
            "on_time_percentage": on_time_percentage,
            "on_time_deliveries": on_time_deliveries,
            "total_deliveries": total_deliveries,
            "status": "success",
            "last_updated": datetime.now()
        }

    def get_success_rate(self, pharma_id: int) -> SuccessRateResponse:
        """Calculate treatment success rate for completed stages belonging to a pharma."""

        successful_outcomes_expr = func.coalesce(
            func.sum(
                case((PatientStage.is_success.is_(True), 1), else_=0)
            ),
            0
        ).label("successful_outcomes")

        total_outcomes_expr = func.coalesce(
            func.sum(
                case((PatientStage.is_success.isnot(None), 1), else_=0)
            ),
            0
        ).label("total_outcomes")

        result = (
            self.db.query(successful_outcomes_expr, total_outcomes_expr)
            .join(Patient, PatientStage.patient_id == Patient.id)
            .filter(
                Patient.pharma_id == pharma_id,
                PatientStage.is_active == False
            )
            .one_or_none()
        )

        successful_outcomes = (result.successful_outcomes if result else 0) or 0
        total_outcomes = (result.total_outcomes if result else 0) or 0

        success_rate = round((successful_outcomes / total_outcomes) * 100, 2) if total_outcomes else 0.0

        return SuccessRateResponse(
            pharma_id=pharma_id,
            success_rate=success_rate,
            successful_outcomes=successful_outcomes,
            total_outcomes=total_outcomes,
            status="success",
            last_updated=datetime.now()
        )

    def get_avg_quality_deviations(self, pharma_id: int) -> AvgQualityDeviationsResponse:
        """
        Calculate average quality deviations flagged per shipment for current month.
        
        Formula: Quality Deviations Flagged = monthly total (total deviation per shipment) / monthly total treatment
        Represents the average number of quality issues detected per shipment or treatment process.
        
        Args:
            pharma_id: Pharmaceutical company ID
            
        Returns:
            AvgQualityDeviationsResponse with average deviations, total deviations, and total treatments
        """
        current_month_start, next_month_start = self._get_current_month_bounds()
        
        # Get all unique patients (treatments) that have shipments in the current month for this pharma
        monthly_patients = (
            self.db.query(Shipment.patient_id)
            .filter(
                Shipment.pharma_id == pharma_id,
                Shipment.departure_time.isnot(None),
                Shipment.departure_time >= current_month_start,
                Shipment.departure_time < next_month_start
            )
            .distinct()
            .all()
        )
        
        patient_ids = [patient_id[0] for patient_id in monthly_patients]
        total_treatments = len(patient_ids)
        
        if total_treatments == 0:
            return AvgQualityDeviationsResponse(
                pharma_id=pharma_id,
                avg_quality_deviations=0.0,
                total_deviations=0,
                total_treatments=0,
                status="success",
                last_updated=datetime.now()
            )
        
        # Get quality deviations from Redis for these patients
        total_deviations = 0
        patients_with_data = 0
        patients_without_data = 0
        records_processed = 0
        records_in_month = 0
        records_out_of_month = 0
        
        try:
            redis_client = get_redis()
            logger.info(f"Calculating quality deviations for pharma_id={pharma_id}, total_treatments={total_treatments}, month={current_month_start.strftime('%Y-%m')}")
            
            for patient_id in patient_ids:
                history_key = f'quality_history:{patient_id}'
                try:
                    # Get all quality history records for this patient
                    history = redis_client.lrange(history_key, 0, -1)
                    
                    if not history:
                        patients_without_data += 1
                        logger.debug(f"No quality data found in Redis for patient {patient_id}")
                        continue
                    
                    patients_with_data += 1
                    patient_deviations = 0
                    
                    for item in history:
                        try:
                            quality_data = json.loads(item)
                            records_processed += 1
                            timestamp_str = quality_data.get('timestamp')
                            
                            # Parse timestamp and filter for current month
                            if timestamp_str:
                                # Try to parse timestamp
                                parsed_timestamp = self._parse_quality_timestamp(timestamp_str)
                                
                                if parsed_timestamp:
                                    if current_month_start <= parsed_timestamp < next_month_start:
                                        records_in_month += 1
                                        # Count violations/deviations
                                        # Prefer violated_parameters list if available, otherwise use threshold_violations dict
                                        violated_parameters = quality_data.get('violated_parameters', [])
                                        threshold_violations = quality_data.get('threshold_violations', {})
                                        
                                        record_deviations = 0
                                        if isinstance(violated_parameters, list) and len(violated_parameters) > 0:
                                            # Use violated_parameters list (count of parameters that violated thresholds)
                                            record_deviations = len(violated_parameters)
                                        elif isinstance(threshold_violations, dict):
                                            # Fallback to threshold_violations dict (count True values)
                                            record_deviations = sum(1 for v in threshold_violations.values() if v)
                                        elif isinstance(violated_parameters, dict):
                                            # If violated_parameters is a dict, count True values
                                            record_deviations = sum(1 for v in violated_parameters.values() if v)
                                        
                                        if record_deviations > 0:
                                            total_deviations += record_deviations
                                            patient_deviations += record_deviations
                                            logger.debug(f"Patient {patient_id}: Found {record_deviations} deviations at {timestamp_str}")
                                    else:
                                        records_out_of_month += 1
                                        logger.debug(f"Patient {patient_id}: Record timestamp {timestamp_str} is outside current month")
                                else:
                                    logger.warning(f"Patient {patient_id}: Could not parse timestamp: {timestamp_str}")
                            else:
                                logger.warning(f"Patient {patient_id}: Quality data missing timestamp field")
                                            
                        except (json.JSONDecodeError, KeyError, ValueError) as e:
                            logger.warning(f"Error parsing quality data for patient {patient_id}: {e}")
                            continue
                    
                    if patient_deviations == 0:
                        logger.debug(f"Patient {patient_id}: Has {len(history)} quality records but no deviations found")
                            
                except Exception as e:
                    logger.warning(f"Error reading Redis history for patient {patient_id}: {e}")
                    patients_without_data += 1
                    continue
            
            logger.info(f"Quality deviations calculation complete: total_deviations={total_deviations}, "
                       f"patients_with_data={patients_with_data}, patients_without_data={patients_without_data}, "
                       f"records_processed={records_processed}, records_in_month={records_in_month}, "
                       f"records_out_of_month={records_out_of_month}")
                    
        except Exception as e:
            logger.error(f"Error connecting to Redis for quality deviations: {e}", exc_info=True)
            # Return zero if Redis is unavailable
            return AvgQualityDeviationsResponse(
                pharma_id=pharma_id,
                avg_quality_deviations=0.0,
                total_deviations=0,
                total_treatments=total_treatments,
                status="success",
                last_updated=datetime.now()
            )
        
        # Calculate average: total deviations / total treatments
        avg_deviations = round(total_deviations / total_treatments, 2) if total_treatments > 0 else 0.0
        
        return AvgQualityDeviationsResponse(
            pharma_id=pharma_id,
            avg_quality_deviations=avg_deviations,
            total_deviations=total_deviations,
            total_treatments=total_treatments,
            status="success",
            last_updated=datetime.now()
        )
    
    @staticmethod
    def _parse_quality_timestamp(value: Optional[str]) -> Optional[datetime]:
        """
        Parse timestamp strings from quality data into naive UTC datetime objects.
        Matches the parsing logic used in QualityService.
        
        Args:
            value: Timestamp string from quality data
            
        Returns:
            Parsed datetime object or None if parsing fails
        """
        if not value:
            return None

        parse_attempts = [
            datetime.fromisoformat,
        ]

        formats = [
            "%Y-%m-%d %H:%M:%S",
            "%Y-%m-%dT%H:%M:%S",
            "%Y-%m-%dT%H:%M:%SZ",
            "%Y-%m-%dT%H:%M:%S.%f",
            "%Y-%m-%dT%H:%M:%S.%fZ",
        ]

        for parser in parse_attempts:
            try:
                parsed = parser(value)
                if parsed.tzinfo:
                    parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
                return parsed
            except ValueError:
                continue

        for fmt in formats:
            try:
                parsed = datetime.strptime(value, fmt)
                return parsed
            except ValueError:
                continue

        return None

