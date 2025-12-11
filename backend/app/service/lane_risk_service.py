"""Lane Risk Assessment Service."""
import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.shipment_model import Shipment
from app.service.external_factors_calculator import ExternalFactorsCalculator
from app.service.lane_complexity_calculator import LaneComplexityCalculator
from app.service.quality_incidents_calculator import QualityIncidentsCalculator
from app.service.quality_service import QualityService
from app.service.shipment_service import ShipmentService


logger = logging.getLogger(__name__)


class RoadStoppageCalculator:
    """Calculates road parking stops risk and details."""

    def __init__(self, db: Session):
        self.db = db

    def calculate(self, shipments) -> Tuple[Optional[float], str]:
        if not shipments:
            return None, "No road legs"

        road_legs = []
        for shipment in shipments:
            for leg in shipment.shipment_legs:
                if (
                    leg.mode_of_transport
                    and leg.mode_of_transport.lower()
                    in ["road", "ground", "truck", "vehicle", "car", "van"]
                ):
                    road_legs.append(leg)

        if not road_legs:
            return None, "No road legs"

        total_parking_stops = 0
        total_wait_minutes = 0.0

        for leg in road_legs:
            calculated_stops = self._calculate_parking_stops_from_location_history(leg)
            if calculated_stops is not None:
                stops_detected, wait_minutes = calculated_stops
                total_parking_stops += stops_detected
                total_wait_minutes += wait_minutes
                logger.debug(
                    f"Leg {leg.id}: Parking stops={stops_detected}, waiting_minutes={wait_minutes:.1f}"
                )
            else:
                logger.debug(
                    f"Leg {leg.id}: No location history data available in Redis for parking stops calculation"
                )

        if total_parking_stops == 0:
            score = 4.5
            classification = "Excellent"
        elif total_parking_stops == 1:
            score = 3.5
            classification = "Very Good"
        elif total_parking_stops == 2:
            score = 2.5
            classification = "Good"
        elif total_parking_stops == 3:
            score = 1.5
            classification = "Moderate"
        else:
            score = 0.5
            classification = "Basic"

        if total_parking_stops > 0:
            info = f"Road Stoppage: {total_parking_stops} stop(s), waiting {total_wait_minutes:.1f} min"
        else:
            info = "Road Stoppage: No stops"

        logger.info(
            f"Parking Stops Calculation - Road legs: {len(road_legs)}, "
            f"Total stops: {total_parking_stops}, Score: {score} ({classification})"
        )

        return score, info

    def _calculate_parking_stops_from_location_history(self, leg) -> Optional[Tuple[int, float]]:
        if not leg:
            return None

        MIN_STOP_DURATION_MINUTES = 10
        COORDINATE_TOLERANCE = 0.0001

        try:
            params = {"shipment_id": leg.shipment_id}
            time_filter = ""
            if leg.departure_time and leg.arrival_time:
                time_filter = " AND reading_timestamp BETWEEN :start_ts AND :end_ts"
                params["start_ts"] = leg.departure_time
                params["end_ts"] = leg.arrival_time

            geo_query = text(
                f"""
                SELECT current_latitude, current_longitude, reading_timestamp
                FROM geolocation
                WHERE shipment_id = :shipment_id
                {time_filter}
                ORDER BY reading_timestamp ASC
                """
            )
            rows = self.db.execute(geo_query, params).fetchall()

            location_points = []
            for row in rows:
                lat = getattr(row, "current_latitude", None)
                lng = getattr(row, "current_longitude", None)
                ts = getattr(row, "reading_timestamp", None)

                if lat is None or lng is None or ts is None:
                    continue

                try:
                    timestamp = (
                        ts
                        if not isinstance(ts, str)
                        else datetime.fromisoformat(ts.replace("Z", "+00:00"))
                    )
                    if timestamp.tzinfo is None:
                        timestamp = timestamp.replace(tzinfo=timezone.utc)
                    else:
                        timestamp = timestamp.astimezone(timezone.utc)
                except Exception as parse_err:
                    logger.debug(
                        f"Leg {leg.id}: Error parsing geolocation timestamp {ts}: {parse_err}"
                    )
                    continue

                try:
                    location_points.append(
                        {"lat": float(lat), "lng": float(lng), "timestamp": timestamp}
                    )
                except (TypeError, ValueError):
                    continue

            if len(location_points) < 2:
                logger.debug(
                    f"Leg {leg.id}: Insufficient geolocation points ({len(location_points)})"
                )
                return None

            location_points.sort(key=lambda x: x["timestamp"])

            stops_detected = 0
            total_wait_minutes = 0.0

            last_point = location_points[0]
            current_stop_minutes = 0.0

            for idx in range(1, len(location_points)):
                point = location_points[idx]
                time_diff = (
                    point["timestamp"] - last_point["timestamp"]
                ).total_seconds() / 60.0
                if time_diff < 0:
                    last_point = point
                    continue

                lat_diff = abs(point["lat"] - last_point["lat"])
                lng_diff = abs(point["lng"] - last_point["lng"])
                is_still = (
                    lat_diff <= COORDINATE_TOLERANCE
                    and lng_diff <= COORDINATE_TOLERANCE
                )

                if is_still:
                    current_stop_minutes += time_diff
                else:
                    if current_stop_minutes >= MIN_STOP_DURATION_MINUTES:
                        stops_detected += 1
                        waiting_minutes = current_stop_minutes - MIN_STOP_DURATION_MINUTES
                        total_wait_minutes += waiting_minutes
                        logger.debug(
                            f"Leg {leg.id}: Detected parking stop #{stops_detected} - "
                            f"Duration: {current_stop_minutes:.1f} mins "
                            f"(waiting {waiting_minutes:.1f} mins), "
                            f"Location: ({last_point['lat']:.4f}, {last_point['lng']:.4f})"
                        )
                    current_stop_minutes = 0.0

                last_point = point

            if current_stop_minutes >= MIN_STOP_DURATION_MINUTES:
                stops_detected += 1
                waiting_minutes = current_stop_minutes - MIN_STOP_DURATION_MINUTES
                total_wait_minutes += waiting_minutes
                logger.debug(
                    f"Leg {leg.id}: Detected parking stop #{stops_detected} (end-of-data) - "
                    f"Duration: {current_stop_minutes:.1f} mins "
                    f"(waiting {waiting_minutes:.1f} mins), "
                    f"Location: ({last_point['lat']:.4f}, {last_point['lng']:.4f})"
                )

            logger.info(
                f"Leg {leg.id}: Detected {stops_detected} parking stops from geolocation history"
            )
            return stops_detected, total_wait_minutes

        except Exception as e:
            logger.warning(
                f"Error calculating parking stops from geolocation history for leg {leg.id}: {e}"
            )
            return None

class LaneRiskService:
    """Service for calculating lane risk assessments."""

    def __init__(self, db: Session):
        self.db = db
        self.quality_service = QualityService(db)
        self.road_stoppage_calculator = RoadStoppageCalculator(db)
        self.lane_complexity_calculator = LaneComplexityCalculator(
            db, self.road_stoppage_calculator
        )
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

