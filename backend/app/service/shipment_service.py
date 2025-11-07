"""
Shipment Service
Service for calculating real-time metrics for shipment tracking and management.
"""

import logging
from datetime import datetime, timezone
from typing import List, Dict, Optional, Any
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_

from ..models.shipment_model import Shipment
from ..models.patient_stage_model import PatientStage as PatientStageModel
from ..models.patient_model import Patient
from ..models.pharma_model import Pharma
from ..models.provider_model import Provider
from ..models.carrier_model import Carrier
from ..models.shipment_leg_model import ShipmentLeg
from ..models.shipment_leg_document_model import ShipmentLegDocument
from ..constants.enums import PatientStage, RouteStatus
from ..constants.messages import ErrorMessages
from ..exceptions.patient_exceptions import PatientNotFoundException, ShipmentNotStartedException
from ..utils.utils import get_countries_by_regions, country_to_region

logger = logging.getLogger(__name__)


class ShipmentService:
    """Service for calculating real-time metrics: Active Routes, Avg Transit, Safe Routes, Delayed Routes, Risky Routes"""
    
    def __init__(self, db: Session):
        self.db = db
    
    # ============================================
    # PRIVATE HELPER METHODS
    # ============================================
    
    def _normalize_datetime_to_utc(self, dt: datetime) -> datetime:
        """Normalize a datetime to UTC timezone."""
        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc)
        elif dt.tzinfo != timezone.utc:
            return dt.astimezone(timezone.utc)
        return dt
    
    def _get_active_transportation_stage(self, patient_id: str) -> Optional[PatientStageModel]:
        """Get the active TRANSPORTATION stage for a patient."""
        return self.db.query(PatientStageModel).filter(
            and_(
                PatientStageModel.patient_id == patient_id,
                PatientStageModel.stage == PatientStage.TRANSPORTATION,
                PatientStageModel.is_active == True
            )
        ).first()
    
    def _validate_patient_for_shipment_operations(
        self, 
        patient_id: str, 
        pharma_id: Optional[int] = None,
        require_shipment: bool = True
    ) -> Patient:
        """
        Validate patient for shipment-related operations.
        
        Args:
            patient_id: Patient ID to validate
            pharma_id: Optional pharma ID to validate patient belongs to
            require_shipment: If True, check that patient in TRANSPORTATION stage has shipments
            
        Returns:
            Patient object if validation passes
            
        Raises:
            PatientNotFoundException: If patient doesn't exist or doesn't belong to pharma
            ShipmentNotStartedException: If patient is in TRANSPORTATION stage but has no shipments
        """
        # Validate patient exists
        patient = self.db.query(Patient).filter(Patient.id == patient_id).first()
        if not patient:
            raise PatientNotFoundException(patient_id=patient_id)
        
        # Validate patient belongs to pharma if pharma_id is provided
        if pharma_id and patient.pharma_id != pharma_id:
            raise PatientNotFoundException(patient_id=patient_id)
        
        # Check if patient is in TRANSPORTATION stage but has no shipments
        if require_shipment:
            active_transportation_stage = self._get_active_transportation_stage(patient_id)
            if active_transportation_stage:
                shipment_count = self.db.query(Shipment).filter(
                    Shipment.patient_id == patient_id
                ).count()
                if shipment_count == 0:
                    raise ShipmentNotStartedException(patient_id=patient_id)
        
        return patient
    
    def _calculate_transit_days(self, departure_time: Optional[datetime]) -> Optional[float]:
        """Calculate transit days from departure time to now."""
        if not departure_time:
            return None
        departure = self._normalize_datetime_to_utc(departure_time)
        now = datetime.now(timezone.utc)
        transit_duration = now - departure
        return transit_duration.total_seconds() / (24 * 3600)
    
    def _parse_route_status_filter(self, route_status: str) -> Optional[RouteStatus]:
        """Parse route status filter string to RouteStatus enum."""
        route_status_lower = route_status.lower()
        if route_status_lower == "safe":
            return RouteStatus.SAFE
        elif route_status_lower == "delayed":
            return RouteStatus.DELAYED
        elif route_status_lower in ("high_risk", "risk_route"):
            return RouteStatus.HIGH_RISK
        return None
    
    def _get_shipment_carrier(self, shipment_id: int, fallback_carrier: Optional[str] = None) -> Optional[str]:
        """Get the primary carrier name from the first leg (leg_order = 1) of a shipment, with fallback."""
        # Get the carrier from the first leg (lowest leg_order)
        first_leg_carrier = self.db.query(Carrier.name).join(
            ShipmentLeg, ShipmentLeg.carrier_id == Carrier.id
        ).filter(
            ShipmentLeg.shipment_id == shipment_id,
            Carrier.name.isnot(None)
        ).order_by(ShipmentLeg.leg_order.asc()).first()
        
        if first_leg_carrier and first_leg_carrier[0]:
            return first_leg_carrier[0]
        
        # Fallback to provided carrier if no carrier found in legs
        return fallback_carrier
    
    def _carrier_matches_filter(self, route_carrier: Optional[str], filter_carriers: List[str]) -> bool:
        """Check if the route carrier matches any of the filter carriers (partial match, case-insensitive)."""
        if not route_carrier:
            return False
        
        route_carrier_lower = route_carrier.lower()
        filter_carriers_lower = [c.lower() for c in filter_carriers]
        
        for filter_carrier in filter_carriers_lower:
            if filter_carrier in route_carrier_lower or route_carrier_lower in filter_carrier:
                return True
        return False
    
    def _apply_region_filter(self, query, regions: Optional[List[str]] = None):
        """
        Apply region-based filtering to a shipment query.
        Matches if either source OR destination is in the specified regions.
        
        Args:
            query: SQLAlchemy query object
            regions: Filter by regions - matches if either source OR destination is in the specified regions
            
        Returns:
            Filtered query object
        """
        if not regions:
            return query
        
        # Get country codes for the specified regions
        region_countries = get_countries_by_regions(regions)
        
        # If regions were provided but no countries match (invalid region), return empty result
        if not region_countries:
            # Apply a filter that will never match (no results)
            query = query.filter(Shipment.id == -1)
            return query
        
        # Match if source OR destination is in the regions
        query = query.filter(
            or_(
                Shipment.source_country.in_(region_countries),
                Shipment.destination_country.in_(region_countries)
            )
        )
        
        return query
    
    def _format_duration(self, start_dt: Optional[datetime], end_dt: Optional[datetime]) -> Optional[str]:
        """Format duration between two datetimes as '<hours> h' with up to two decimal places."""
        if not start_dt or not end_dt:
            return None
        
        start = self._normalize_datetime_to_utc(start_dt)
        end = self._normalize_datetime_to_utc(end_dt)
        
        duration = end - start
        total_seconds = int(duration.total_seconds())
        
        if total_seconds <= 0:
            return None
        
        total_hours = total_seconds / 3600
        rounded_hours = round(total_hours, 2)
        formatted_hours = f"{rounded_hours:.2f}".rstrip('0').rstrip('.')

        if not formatted_hours:
            formatted_hours = "0"

        return f"{formatted_hours} h"
    
    def _get_start_date_from_shipment(self, shipment: Shipment) -> Optional[str]:
        """Get start date from shipment (departure_time or updated_at as fallback)."""
        if shipment.departure_time:
            return shipment.departure_time.date().isoformat()
        elif shipment.updated_at:
            return shipment.updated_at.date().isoformat()
        return None
    
    def _format_time_12hour(self, dt: Optional[datetime]) -> Optional[str]:
        """Format datetime to 24-hour time format like '16:25:17'."""
        if not dt:
            return None
        dt_normalized = self._normalize_datetime_to_utc(dt)
        # Format as 24-hour time (HH:MM:SS)
        return dt_normalized.strftime("%H:%M:%S")
    
    # ============================================
    # PUBLIC SERVICE METHODS
    # ============================================

    def update_patient_stage_on_shipment_leg_failure(self, shipment_leg_id: int) -> None:
        """
        When a shipment leg fails, mark the active TRANSPORTATION stage as unsuccessful for the patient.
        """
        try:
            leg = self.db.query(ShipmentLeg).filter(ShipmentLeg.id == shipment_leg_id).first()
            if not leg:
                return
            shipment = self.db.query(Shipment).filter(Shipment.id == leg.shipment_id).first()
            if not shipment:
                return

            if leg.leg_status != RouteStatus.FAILED:
                return

            active_stage = self._get_active_transportation_stage(shipment.patient_id)

            if active_stage:
                active_stage.is_success = False
                active_stage.is_active = False
                active_stage.end_time = datetime.now(timezone.utc)
                active_stage.updated_at = datetime.now(timezone.utc)
                self.db.commit()
                logger.info(f"Marked patient {shipment.patient_id} stage unsuccessful due to leg {shipment_leg_id} failure")
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error updating patient stage on leg failure: {str(e)}")
            raise
    
    def get_real_time_metrics(
        self, 
        pharma_id: Optional[int] = None,
        regions: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Get real-time metrics for shipment tracking dashboard.
        Calculates: Active Routes, Avg Transit, Safe Routes, Delayed Routes, Risky Routes
        
        Args:
            pharma_id: Optional pharma ID to filter routes
            
        Returns:
            Dict containing real-time metrics:
            - active_routes: Count of routes currently in transportation
            - avg_transit_days: Average transit time in days for active routes
            - safe_routes: Count of routes with SAFE status
            - delayed_routes: Count of routes with DELAYED status
            - risky_routes: Count of routes with HIGH_RISK status
            - last_updated: ISO timestamp of calculation
        """
        try:
            # Base query for shipments with join to PatientStage to check active TRANSPORTATION stage
            query = self.db.query(Shipment).outerjoin(
                PatientStageModel,
                and_(
                    PatientStageModel.patient_id == Shipment.patient_id,
                    PatientStageModel.stage == PatientStage.TRANSPORTATION,
                    PatientStageModel.is_active == True
                )
            )
            
            if pharma_id:
                query = query.filter(Shipment.pharma_id == pharma_id)
            
            # Apply region-based filtering
            query = self._apply_region_filter(query, regions=regions)
            
            results = query.all()
            
            # Initialize counters
            active_routes_count = 0
            safe_routes_count = 0
            delayed_routes_count = 0
            risky_routes_count = 0
            
            # Transit times for active routes
            transit_times = []
            now = datetime.now(timezone.utc)
            
            # Process each shipment
            for shipment in results:
                # Check if patient is in TRANSPORTATION stage
                active_stage = self._get_active_transportation_stage(shipment.patient_id)
                
                if active_stage:
                    active_routes_count += 1
                    
                    # Calculate transit time in days for active routes
                    transit_days = self._calculate_transit_days(shipment.departure_time)
                    if transit_days is not None:
                        transit_times.append(transit_days)
                
                # Count by route status (all shipments, not just active)
                if shipment.routes_status == RouteStatus.HIGH_RISK:
                    risky_routes_count += 1
                elif shipment.routes_status == RouteStatus.DELAYED:
                    delayed_routes_count += 1
                elif shipment.routes_status == RouteStatus.SAFE:
                    safe_routes_count += 1
            
            # Calculate average transit time
            avg_transit_days = 0.0
            if transit_times:
                avg_transit_days = sum(transit_times) / len(transit_times)
            
            return {
                'active_routes': active_routes_count,
                'avg_transit_days': round(avg_transit_days, 1),
                'safe_routes': safe_routes_count,
                'delayed_routes': delayed_routes_count,
                'risky_routes': risky_routes_count,
                'last_updated': datetime.now(timezone.utc).isoformat()
            }
            
        except Exception as e:
            logger.error(f"{ErrorMessages.SHIPMENT_METRICS_ERROR}: {str(e)}")
            raise
    
    def get_active_routes(
        self, 
        pharma_id: Optional[int] = None,
        route_status: Optional[str] = None,
        carriers: Optional[List[str]] = None,
        regions: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """
        Get detailed list of active routes (shipments in TRANSPORTATION stage).
        
        Args:
            pharma_id: Optional pharma ID to filter routes
            route_status: Optional route status filter (safe, delayed, high_risk). If None, returns all statuses.
            carriers: Optional list of carrier names to filter by. If None, returns all carriers.
            
        Returns:
            List of dictionaries containing route details:
            - route: Source → Destination
            - status: Route status (Safe, Delayed, Risk)
            - date: Departure date
            - company: Pharma company name
            - transit_days: Days in transit
            - carrier: Provider/Carrier name
            - updated_at: Last update timestamp
        """
        try:
            # Query shipments with joins to get pharma name, provider name, carrier name, and check active stage
            query = self.db.query(
                Shipment,
                Pharma.pharma_name,
                Provider.name.label('provider_name'),
                Carrier.name.label('carrier_name')
            ).join(
                Pharma, Shipment.pharma_id == Pharma.id
            ).outerjoin(
                Patient, Shipment.patient_id == Patient.id
            ).outerjoin(
                Provider, Shipment.provider_id == Provider.id  # Direct join from shipment
            ).outerjoin(
                Carrier, Shipment.carrier_id == Carrier.id  # Direct join from shipment
            ).outerjoin(
                PatientStageModel,
                and_(
                    PatientStageModel.patient_id == Shipment.patient_id,
                    PatientStageModel.stage == PatientStage.TRANSPORTATION,
                    PatientStageModel.is_active == True
                )
            )
            
            if pharma_id:
                query = query.filter(Shipment.pharma_id == pharma_id)
            
            # Filter by route status if provided
            if route_status:
                parsed_status = self._parse_route_status_filter(route_status)
                if parsed_status:
                    query = query.filter(Shipment.routes_status == parsed_status)
            
            # Apply region-based filtering
            query = self._apply_region_filter(query, regions=regions)
            
            # Filter only active routes (where PatientStage exists)
            query = query.filter(PatientStageModel.id.isnot(None))
            
            results = query.all()
            
            now = datetime.now(timezone.utc)
            active_routes = []
            
            for shipment, pharma_name, provider_name, carrier_name in results:
                # Calculate transit days
                transit_days_float = self._calculate_transit_days(shipment.departure_time)
                transit_days = int(transit_days_float) if transit_days_float is not None else None
                
                # Machine-friendly status should match DB enum values exactly
                route_status = shipment.routes_status.value if shipment.routes_status else "unknown"
                
                # Start date from departure_time (fallback to updated_at date when missing)
                start_date = self._get_start_date_from_shipment(shipment)
                
                # Get carrier name (from Carrier table, or Provider name)
                fallback_carrier = carrier_name if carrier_name else provider_name
                
                # Get primary carrier from first leg
                route_carrier = self._get_shipment_carrier(shipment.id, fallback_carrier)
                
                # Filter by carriers if provided
                if carriers and not self._carrier_matches_filter(route_carrier, carriers):
                    continue
                
                route_data = {
                    "patient_id": shipment.patient_id,
                    "source": shipment.source_location,
                    "destination": shipment.destination_location,
                    "route_status": route_status,
                    "start_date": start_date,
                    "transit_days": transit_days,
                    "carrier": route_carrier,
                    "updated_at": shipment.updated_at.isoformat() if shipment.updated_at else None
                }
                
                active_routes.append(route_data)
            
            # Sort by updated_at descending (most recent first)
            active_routes.sort(key=lambda x: x['updated_at'] or '', reverse=True)
            
            return active_routes
            
        except Exception as e:
            logger.error(f"{ErrorMessages.SHIPMENT_ACTIVE_ROUTES_ERROR}: {str(e)}")
            raise

    def get_3pl_player_details(self, pharma_id: Optional[int] = None, patient_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Fetch 3PL player operational details from shipment legs.

        Returns list of rows with:
        - player_name: Carrier.name if present else Provider.name
        - modes: ShipmentLeg.mode_of_transport as string (single mode per leg)
        - source: ShipmentLeg.from_location
        - destination: ShipmentLeg.to_location
        - departure_time: ShipmentLeg.departure_time ISO string
        - arrival_time: ShipmentLeg.arrival_time ISO string
        - handover_time: Shipment.handover_time ISO string (can be None)
        - ln2_refill: ShipmentLeg.ln2_refill
        - warehouse: ShipmentLeg.warehouse
        """
        try:
            # Validate patient if patient_id is provided
            if patient_id:
                self._validate_patient_for_shipment_operations(patient_id, pharma_id, require_shipment=True)
            
            query = self.db.query(
                ShipmentLeg,
                Shipment.handover_time,
                Carrier.name.label("carrier_name"),
                Provider.name.label("provider_name"),
                Shipment.pharma_id,
                Shipment.patient_id,
            ).join(
                Shipment, ShipmentLeg.shipment_id == Shipment.id
            ).outerjoin(
                Carrier, ShipmentLeg.carrier_id == Carrier.id
            ).outerjoin(
                Provider, ShipmentLeg.provider_id == Provider.id
            )

            if pharma_id:
                query = query.filter(Shipment.pharma_id == pharma_id)
            if patient_id:
                query = query.filter(Shipment.patient_id == patient_id)

            rows = query.order_by(ShipmentLeg.departure_time.asc().nulls_last()).all()

            results: List[Dict[str, Any]] = []
            for leg, handover_time, carrier_name, provider_name, _, leg_patient_id in rows:
                player_name = carrier_name or provider_name or "Unknown"
                # Get mode_of_transport from ShipmentLeg (each leg can have its own mode)
                modes = leg.mode_of_transport if leg.mode_of_transport else None

                results.append({
                    "player_name": player_name,
                    "modes": modes,
                    "source": leg.from_location,
                    "destination": leg.to_location,
                    "departure_time": leg.departure_time.isoformat() if leg.departure_time else None,
                    "arrival_time": leg.arrival_time.isoformat() if leg.arrival_time else None,
                    "handover_time": handover_time.isoformat() if handover_time else None,
                    "ln2_refill": leg.ln2_refill,
                    "warehouse": leg.warehouse,
                })

            return results
        except Exception as e:
            logger.error(f"{ErrorMessages.SHIPMENT_3PL_PLAYER_DETAILS_ERROR}: {str(e)}")
            raise

    def get_transport_time_comparison(self, patient_id: str, pharma_id: Optional[int] = None) -> List[Dict[str, Any]]:
        """
        Get transport time comparison data for a particular patient's shipment legs.
        
        Args:
            patient_id: Patient ID to filter shipment legs
            pharma_id: Optional pharma ID to filter routes
            
            Returns:
            List of dictionaries containing:
            - source_location: Source location of the leg
            - destination_location: Destination location of the leg
            - scheduled_time: Scheduled transport time as string in hours format with up to two decimals (e.g., "2.5 h") calculated from departure_time to scheduled_time, or None
            - actual_time: Actual transport time as string in hours format with up to two decimals (e.g., "1.75 h") calculated from departure_time to handover_time or arrival_time
        """
        try:
            # Validate patient and shipment status
            self._validate_patient_for_shipment_operations(patient_id, pharma_id, require_shipment=True)
            
            query = self.db.query(
                ShipmentLeg,
                Shipment.patient_id,
                Shipment.pharma_id
            ).join(
                Shipment, ShipmentLeg.shipment_id == Shipment.id
            ).filter(
                Shipment.patient_id == patient_id
            )
            
            if pharma_id:
                query = query.filter(Shipment.pharma_id == pharma_id)
            
            # Order by leg_order to maintain sequence
            rows = query.order_by(ShipmentLeg.leg_order.asc()).all()

            results: List[Dict[str, Any]] = []
            
            for leg, patient_id_val, _ in rows:
                # Calculate scheduled_time: scheduled_time - departure_time (scheduled duration)
                scheduled_time_str = None
                if leg.departure_time and leg.scheduled_time:
                    scheduled_time_str = self._format_duration(leg.departure_time, leg.scheduled_time)
                
                # Calculate actual_time: handover_time - departure_time, or arrival_time - departure_time if handover_time is not available
                actual_time_str = None
                if leg.departure_time:
                    end_time = leg.handover_time or leg.arrival_time
                    if end_time:
                        actual_time_str = self._format_duration(leg.departure_time, end_time)
                
                results.append({
                    "source_location": leg.from_location,
                    "destination_location": leg.to_location,
                    "scheduled_time": scheduled_time_str,  # in hours and minutes format
                    "actual_time": actual_time_str  # in hours and minutes format
                })
            
            return results
            
        except Exception as e:
            logger.error(f"{ErrorMessages.SHIPMENT_TRANSPORT_TIME_COMPARISON_ERROR}: {str(e)}")
            raise
    
    def get_patient_journey_summary(
        self, 
        patient_id: str, 
        pharma_id: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Get complete patient journey summary including:
        - Leg 1: Hospital to Pharma Manufacturing Site
        - Reengineering/Manufacturing phase
        - Leg 2: Pharma to Hospital
        - Current status
        
        Args:
            patient_id: Patient ID
            pharma_id: Optional pharma ID for filtering
            
        Returns:
            PatientJourneySummaryResponse with complete journey details
        """
        try:
            # Validate patient and shipment status
            patient = self._validate_patient_for_shipment_operations(patient_id, pharma_id, require_shipment=True)
            
            # Get all shipments for this patient
            # Order by: departure_time (ascending), then created_at (ascending) as fallback
            shipments_query = self.db.query(Shipment).filter(
                Shipment.patient_id == patient_id
            ).order_by(
                Shipment.departure_time.asc().nulls_last(),
                Shipment.created_at.asc()
            )
            
            shipments = shipments_query.all()
            
            # Identify Leg 1 and Leg 2 based on chronological order
            # Leg 1: First shipment (hospital to pharma) - typically earlier departure_time
            # Leg 2: Second shipment (pharma to hospital) - typically later departure_time
            leg1_shipment = None
            leg2_shipment = None
            
            # First shipment (chronologically) is Leg 1, second is Leg 2
            for shipment in shipments:
                if not leg1_shipment:
                    leg1_shipment = shipment
                elif not leg2_shipment:
                    leg2_shipment = shipment
                    break
            
            # Build Leg 1 summary
            leg1_summary = None
            if leg1_shipment:
                leg1_summary = self._build_shipment_summary(leg1_shipment)
            
            # Build Leg 2 summary
            leg2_summary = None
            if leg2_shipment:
                leg2_summary = self._build_shipment_summary(leg2_shipment)
            
            # Get Reengineering stage
            reengineering_stage = self._get_reengineering_stage(patient_id)
            
            # Get current active stage
            active_stage = self.db.query(PatientStageModel).filter(
                PatientStageModel.patient_id == patient_id,
                PatientStageModel.is_active == True
            ).first()
            
            # Build current status summary
            leg1_status = "not_started"
            if leg1_summary:
                leg1_status = leg1_summary["status"]
            
            reengineering_status = "not_started"
            if reengineering_stage:
                reengineering_status = reengineering_stage["status"]
            
            leg2_status = "not_started"
            if leg2_summary:
                leg2_status = leg2_summary["status"]
            
            current_status = {
                "leg1_status": leg1_status,
                "reengineering_status": reengineering_status,
                "leg2_status": leg2_status,
                "overall_stage": active_stage.stage if active_stage else None
            }
            
            return {
                "patient_id": patient.id,
                "condition": patient.condition or "",
                "hospital_name": patient.hospital_name,
                "leg1": leg1_summary,
                "reengineering": reengineering_stage,
                "leg2": leg2_summary,
                "current_status": current_status
            }
            
        except Exception as e:
            logger.error(f"{ErrorMessages.SHIPMENT_PATIENT_JOURNEY_SUMMARY_ERROR}: {str(e)}")
            raise
    
    def _build_shipment_summary(self, shipment: Shipment) -> Dict[str, Any]:
        """Build summary for a shipment with all its legs."""
        try:
            # Get all legs for this shipment, ordered by leg_order
            legs_query = self.db.query(
                ShipmentLeg,
                Carrier.name.label('carrier_name'),
                Provider.name.label('provider_name')
            ).outerjoin(
                Carrier, ShipmentLeg.carrier_id == Carrier.id
            ).outerjoin(
                Provider, ShipmentLeg.provider_id == Provider.id
            ).filter(
                ShipmentLeg.shipment_id == shipment.id
            ).order_by(ShipmentLeg.leg_order.asc())
            
            legs_data = legs_query.all()
            
            # Build leg details
            leg_details = []
            primary_provider = None
            
            for leg, carrier_name, provider_name in legs_data:
                if not primary_provider:
                    primary_provider = provider_name or carrier_name
                
                leg_details.append({
                    "leg_order": leg.leg_order,
                    "mode_of_transport": leg.mode_of_transport,
                    "from_location": leg.from_location,
                    "to_location": leg.to_location,
                    "carrier_name": carrier_name,
                    "provider_name": provider_name,
                    "departure_time": leg.departure_time.isoformat() if leg.departure_time else None,
                    "arrival_time": leg.arrival_time.isoformat() if leg.arrival_time else None,
                    "scheduled_time": leg.scheduled_time.isoformat() if leg.scheduled_time else None,
                    "handover_time": leg.handover_time.isoformat() if leg.handover_time else None,
                    "leg_status": leg.leg_status.value if leg.leg_status else "unknown",
                    "leg_quality_loss": leg.leg_quality_loss,
                    "ln2_refill": leg.ln2_refill,
                    "warehouse": leg.warehouse,
                    "doc_count_actual": leg.doc_count_actual,
                    "doc_count_needed": leg.doc_count_needed
                })
            
            # Determine shipment status
            if shipment.arrival_time:
                status = "completed"
            elif shipment.departure_time:
                # Check if any legs are still in progress
                in_progress = any(leg.arrival_time is None and leg.departure_time is not None 
                                for leg, _, _ in legs_data)
                status = "in_progress" if in_progress else "completed"
            else:
                status = "upcoming"
            
            # Get arrival date
            arrival_date = None
            if shipment.arrival_time:
                arrival_date = shipment.arrival_time.isoformat()
            elif shipment.handover_time:
                arrival_date = shipment.handover_time.isoformat()
            
            # Get planned date
            planned_date = None
            if shipment.scheduled_time:
                planned_date = shipment.scheduled_time.isoformat()
            elif shipment.departure_time and shipment.scheduled_time is None:
                # If no scheduled_time, use departure_time as planned
                planned_date = shipment.departure_time.isoformat()
            
            return {
                "status": status,
                "provider_name": primary_provider,
                "legs": leg_details,
                "arrival_date": arrival_date,
                "planned_date": planned_date
            }
            
        except Exception as e:
            logger.error(f"{ErrorMessages.SHIPMENT_SUMMARY_BUILD_ERROR}: {str(e)}")
            raise
    
    def _get_reengineering_stage(self, patient_id: str) -> Optional[Dict[str, Any]]:
        """Get reengineering stage information for a patient."""
        try:
            reengineering_stage = self.db.query(PatientStageModel).filter(
                PatientStageModel.patient_id == patient_id,
                PatientStageModel.stage == PatientStage.REENGINEERING
            ).order_by(PatientStageModel.start_time.desc()).first()
            
            if not reengineering_stage:
                return None
            
            # Determine status
            if reengineering_stage.end_time:
                status = "completed"
            elif reengineering_stage.is_active:
                status = "ongoing"
            else:
                status = "upcoming"
            
            return {
                "status": status,
                "start_date": reengineering_stage.start_time.isoformat() if reengineering_stage.start_time else None,
                "end_date": reengineering_stage.end_time.isoformat() if reengineering_stage.end_time else None,
                "scheduled_start": reengineering_stage.start_time.isoformat() if reengineering_stage.start_time else None,
                "scheduled_end": None,  # Can be enhanced if scheduled_end is stored separately
                "description": None  # Can be enhanced if description is stored
            }
            
        except Exception as e:
            logger.error(f"{ErrorMessages.SHIPMENT_REENGINEERING_STAGE_ERROR}: {str(e)}")
            return None
    
    def get_control_tower_map_data(
        self,
        pharma_id: Optional[int] = None,
        route_status: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Get control tower map data with source and destination locations including coordinates.
        Returns only shipment-level data (no leg details).
        
        Args:
            pharma_id: Optional pharma ID to filter routes
            route_status: Optional route status filter (safe, delayed, high_risk). If None, returns all statuses.
            
        Returns:
            Dictionary containing:
            - routes: List of route dictionaries with source/destination and coordinates
            - total_routes: Total count of routes
        """
        try:
            # Query shipments with joins to check active stage
            query = self.db.query(Shipment).outerjoin(
                PatientStageModel,
                and_(
                    PatientStageModel.patient_id == Shipment.patient_id,
                    PatientStageModel.stage == PatientStage.TRANSPORTATION,
                    PatientStageModel.is_active == True
                )
            )
            
            if pharma_id:
                query = query.filter(Shipment.pharma_id == pharma_id)
            
            # Filter by route status if provided
            if route_status:
                parsed_status = self._parse_route_status_filter(route_status)
                if parsed_status:
                    query = query.filter(Shipment.routes_status == parsed_status)
            
            # Filter only active routes (where PatientStage exists)
            query = query.filter(PatientStageModel.id.isnot(None))
            
            results = query.all()
            
            routes = []
            most_recent_updated_at = None
            
            for shipment in results:
                route_data = {
                    "shipment_id": shipment.id,
                    "patient_id": shipment.patient_id,
                    "source_location": shipment.source_location,
                    "destination_location": shipment.destination_location,
                    "source_country": shipment.source_country,
                    "destination_country": shipment.destination_country,
                    "source_latitude": shipment.source_latitude,
                    "source_longitude": shipment.source_longitude,
                    "destination_latitude": shipment.destination_latitude,
                    "destination_longitude": shipment.destination_longitude,
                    "route_status": shipment.routes_status.value if shipment.routes_status else "unknown",
                    "last_updated": self._format_time_12hour(shipment.updated_at)
                }
                
                routes.append(route_data)
                
                # Track the most recent updated_at time
                if shipment.updated_at:
                    if most_recent_updated_at is None or shipment.updated_at > most_recent_updated_at:
                        most_recent_updated_at = shipment.updated_at
            
            # Sort by shipment ID
            routes.sort(key=lambda x: x['shipment_id'], reverse=True)
            
            return {
                "routes": routes,
                "total_routes": len(routes),
                "last_updated": self._format_time_12hour(most_recent_updated_at)
            }
            
        except Exception as e:
            logger.error(f"{ErrorMessages.SHIPMENT_CONTROL_TOWER_MAP_ERROR}: {str(e)}")
            raise
    
    def get_all_carriers(self, pharma_id: Optional[int] = None, active_only: bool = True) -> List[str]:
        """
        Get carrier names used in shipments for the specified pharma.
        
        Args:
            pharma_id: Optional pharma ID to filter carriers by shipments. If None, returns all carriers.
            active_only: If True, return only active carriers. If False, return all carriers.
            
        Returns:
            List of carrier names (sorted alphabetically) that appear in shipments for the pharma
        """
        try:
            carrier_names = set()
            
            if pharma_id:
                # Get carriers from shipment level (Shipment.carrier_id)
                shipment_carriers = self.db.query(Carrier.name).join(
                    Shipment, Shipment.carrier_id == Carrier.id
                ).filter(
                    Shipment.pharma_id == pharma_id,
                    Carrier.name.isnot(None)
                )
                
                if active_only:
                    shipment_carriers = shipment_carriers.filter(Carrier.is_active == True)
                
                for carrier in shipment_carriers.all():
                    if carrier[0]:
                        carrier_names.add(carrier[0])
                
                # Get carriers from shipment leg level (ShipmentLeg.carrier_id)
                leg_carriers = self.db.query(Carrier.name).join(
                    ShipmentLeg, ShipmentLeg.carrier_id == Carrier.id
                ).join(
                    Shipment, ShipmentLeg.shipment_id == Shipment.id
                ).filter(
                    Shipment.pharma_id == pharma_id,
                    Carrier.name.isnot(None)
                )
                
                if active_only:
                    leg_carriers = leg_carriers.filter(Carrier.is_active == True)
                
                for carrier in leg_carriers.all():
                    if carrier[0]:
                        carrier_names.add(carrier[0])
            else:
                # If no pharma_id, return all carriers
                query = self.db.query(Carrier.name)
                
                if active_only:
                    query = query.filter(Carrier.is_active == True)
                
                carriers = query.all()
                carrier_names = {carrier[0] for carrier in carriers if carrier[0]}
            
            return sorted(list(carrier_names))
            
        except Exception as e:
            logger.error(f"{ErrorMessages.SHIPMENT_CARRIERS_ERROR}: {str(e)}")
            raise
    
    def get_available_regions(self, pharma_id: Optional[int] = None) -> List[str]:
        """
        Get all unique regions available for shipments based on source and destination countries.
        
        Args:
            pharma_id: Optional pharma ID to filter shipments. If None, returns regions for all shipments.
            
        Returns:
            List of unique region names (sorted alphabetically) that appear in shipments
        """
        try:
            # Query shipments to get unique source and destination countries
            query = self.db.query(
                Shipment.source_country,
                Shipment.destination_country
            ).filter(
                Shipment.source_country.isnot(None),
                Shipment.destination_country.isnot(None)
            )
            
            if pharma_id:
                query = query.filter(Shipment.pharma_id == pharma_id)
            
            results = query.distinct().all()
            
            # Collect all unique countries
            countries = set()
            for source_country, dest_country in results:
                if source_country:
                    countries.add(source_country)
                if dest_country:
                    countries.add(dest_country)
            
            # Convert countries to regions
            regions = set()
            for country_code in countries:
                region = country_to_region(country_code)
                if region:
                    regions.add(region)
            
            # Return sorted list of unique regions
            return sorted(list(regions))
            
        except Exception as e:
            logger.error(f"{ErrorMessages.SHIPMENT_REGIONS_ERROR}: {str(e)}")
            raise
    
    def get_document_checklist(self, patient_id: str, pharma_id: Optional[int] = None) -> Dict[str, Any]:
        """
        Get document checklist from shipment legs for a specific patient.
        
        Args:
            patient_id: Patient ID to get document checklist for
            pharma_id: Optional pharma ID to validate patient belongs to pharma (required for security)
            
        Returns:
            Dict containing:
            - items: List of document checklist items with stage, actual, needed
            - total_items: Total number of items
            
        Raises:
            PatientNotFoundException: If patient doesn't exist or doesn't belong to pharma
        """
        try:
            # Validate patient exists and belongs to pharma if pharma_id is provided
            if pharma_id:
                patient = self.db.query(Patient).filter(Patient.id == patient_id).first()
                if not patient:
                    raise PatientNotFoundException(patient_id=patient_id)
                if patient.pharma_id != pharma_id:
                    raise PatientNotFoundException(patient_id=patient_id)
            
            # Query shipment legs with join to shipment to filter by patient_id and pharma_id
            query = self.db.query(ShipmentLeg).join(
                Shipment,
                ShipmentLeg.shipment_id == Shipment.id
            ).filter(Shipment.patient_id == patient_id)
            
            # Additional filter by pharma_id if provided (double check for security)
            if pharma_id:
                query = query.filter(Shipment.pharma_id == pharma_id)
            
            # Get all matching shipment legs ordered by leg_order for logical sequence
            legs = query.order_by(ShipmentLeg.leg_order.asc(), ShipmentLeg.id.asc()).all()
            
            # Get all leg IDs for this patient's shipment legs
            leg_ids = [leg.id for leg in legs]
            
            # Get all missing documents across all legs for this patient
            all_missing_docs = []
            if leg_ids:
                all_missing_docs = self.db.query(ShipmentLegDocument).filter(
                    and_(
                        ShipmentLegDocument.shipment_leg_id.in_(leg_ids),
                        ShipmentLegDocument.is_missing == True
                    )
                ).all()
            
            # Extract unique document names (in case same document is missing in multiple legs)
            missing_document_names = list(set([doc.document_name for doc in all_missing_docs]))
            
            # Build checklist items and calculate totals
            checklist_items = []
            total_needed = 0
            total_actual = 0
            
            for leg in legs:
                # Format stage as "from_location - to_location"
                stage = f"{leg.from_location} - {leg.to_location}"
                
                # Sum up actual and needed counts (handle None values)
                leg_actual = leg.doc_count_actual or 0
                leg_needed = leg.doc_count_needed or 0
                
                # Calculate missed documents (needed - actual, minimum 0)
                leg_missed = max(0, leg_needed - leg_actual)
                
                total_actual += leg_actual
                total_needed += leg_needed
                
                checklist_items.append({
                    "stage": stage,
                    "actual": leg.doc_count_actual,
                    "needed": leg.doc_count_needed,
                    "missed": leg_missed
                })
            
            # Calculate non-compliance percentage
            # Formula: ((total_needed - total_actual) / total_needed) * 100
            # If total_needed is 0, non-compliance is 0%
            if total_needed > 0:
                non_compliance_percentage = ((total_needed - total_actual) / total_needed) * 100
            else:
                non_compliance_percentage = 0.0
            
            # Round to 2 decimal places
            non_compliance_percentage = round(non_compliance_percentage, 2)
            
            return {
                "items": checklist_items,
                "total_items": len(checklist_items),
                "missing_documents": missing_document_names,
                "non_compliance_percentage": non_compliance_percentage
            }
            
        except PatientNotFoundException:
            raise
        except Exception as e:
            logger.error(f"Error getting document checklist: {str(e)}")
            raise


