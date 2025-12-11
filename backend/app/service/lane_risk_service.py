"""Lane Risk Assessment Service."""
import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.models.shipment_model import Shipment
from app.service.external_factors_calculator import ExternalFactorsCalculator
from app.service.lane_complexity_calculator import LaneComplexityCalculator
from app.service.quality_incidents_calculator import QualityIncidentsCalculator
from app.service.quality_service import QualityService
from app.service.shipment_service import ShipmentService

logger = logging.getLogger(__name__)


class LaneRiskService:
    """Service for calculating lane risk assessments."""

    def __init__(self, db: Session):
        self.db = db
        self.quality_service = QualityService(db)
        self.lane_complexity_calculator = LaneComplexityCalculator(db)
        self.quality_calculator = QualityIncidentsCalculator()
        self.external_calculator = ExternalFactorsCalculator(db)

    def calculate_lane_risk_assessment(
        self, patient_id: str, pharma_id: Optional[int] = None
    ) -> Dict:
        """Calculate comprehensive lane risk assessment."""
        active_shipment_id = None

        try:
            if not patient_id:
                raise ValueError("patient_id is required for lane risk assessment")

            if pharma_id is not None:
                self.quality_service.validate_patient_belongs_to_pharma(
                    patient_id, pharma_id
                )

            shipments, active_shipment_id = self._get_shipments(patient_id, pharma_id)

            factors = [
                self.lane_complexity_calculator.calculate(shipments),
                self.quality_calculator.calculate(shipments),
                self.external_calculator.calculate(shipments),
            ]

            return {
                "shipment_id": active_shipment_id,
                "patient_id": patient_id,
                "total_risk_factors": len(factors),
                "factors": factors,
                "last_updated": datetime.now(timezone.utc),
                "status": "success",
            }

        except Exception as e:
            logger.error(f"Error calculating lane risk assessment: {e}", exc_info=True)
            return {
                "shipment_id": active_shipment_id,
                "patient_id": patient_id,
                "total_risk_factors": 0,
                "factors": [],
                "last_updated": datetime.now(timezone.utc),
                "status": "error",
            }

    def _get_shipments(
        self, patient_id: str, pharma_id: Optional[int] = None
    ) -> Tuple[List[Shipment], Optional[int]]:
        """Get shipments to analyze (restricted to current/ongoing shipment)."""
        if not patient_id:
            raise ValueError("patient_id is required to retrieve shipments")

        shipment_service = ShipmentService(self.db)
        shipment_service._validate_patient_for_shipment_operations(
            patient_id=patient_id, pharma_id=pharma_id, require_shipment=True
        )
        target_shipment_id = shipment_service._get_target_shipment_id(
            patient_id=patient_id, pharma_id=pharma_id
        )

        from sqlalchemy.orm import joinedload

        query = self.db.query(Shipment).filter(Shipment.patient_id == patient_id)

        if target_shipment_id:
            query = query.filter(Shipment.id == target_shipment_id)

        if pharma_id:
            query = query.filter(Shipment.pharma_id == pharma_id)

        shipments = query.options(joinedload(Shipment.shipment_legs)).all()
        active_shipment_id = shipments[0].id if shipments else target_shipment_id
        return shipments, active_shipment_id

