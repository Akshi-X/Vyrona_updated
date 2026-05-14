"""
Shipment Service
Service for calculating real-time metrics for shipment tracking and management.
"""

import logging
from collections import defaultdict
from datetime import datetime, timezone
from typing import List, Dict, Optional, Any
from sqlalchemy.orm import Session, Query
from sqlalchemy import and_, or_, func

from ..models.shipment_model import Shipment
from ..models.patient_stage_model import PatientStage as PatientStageModel
from ..models.patient_model import Patient
from ..models.pharma_model import Pharma
from ..models.provider_model import Provider
from ..models.carrier_model import Carrier
from ..models.shipment_leg_model import ShipmentLeg
from ..models.shipment_leg_document_model import ShipmentLegDocument
from ..constants.enums import PatientStage, RouteStatus
from ..constants.messages import ErrorMessages, InfoMessages
from ..exceptions.patient_exceptions import PatientNotFoundException, ShipmentNotStartedException
from ..utils.utils import get_countries_by_regions, country_to_region
from ..utils.shipment_utils import (
    has_filters_applied,
    add_no_routes_message,
    normalize_datetime_to_utc,
    calculate_transit_days,
    parse_route_status_filter,
    carrier_matches_filter,
    apply_region_filter,
    format_duration,
    get_start_date_from_shipment,
    format_time_12hour,
    resolve_route_regions
)

logger = logging.getLogger(__name__)


class ShipmentService:
    """Service for calculating real-time metrics: Active Routes, Avg Transit, Safe Routes, Delayed Routes, Risky Routes"""
    
    def __init__(self, db: Session):
        self.db = db
    
    # ============================================
    # PRIVATE HELPER METHODS
    # ============================================
    
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
    
    def _get_target_shipment_id(
        self, 
        patient_id: str, 
        pharma_id: Optional[int] = None
    ) -> Optional[int]:
        """
        Determine which shipment ID to show based on business rules.
        
        Business Logic:
        - Every patient has 2 shipments: Shipment 1 (Hospital to Pharma) and Shipment 2 (Pharma to Hospital)
        - Workflow order: Shipment 1 → Reengineering → Shipment 2 → Reinfusion
        - Rules:
          1. If shipment 2 doesn't exist → return shipment 1 ID
          2. If shipment 2 has started AND shipment 1 is completed → return shipment 2 ID
          3. If both shipments are completed → return shipment 2 ID
        
        Args:
            patient_id: Patient ID
            pharma_id: Optional pharma ID to filter shipments
            
        Returns:
            Target shipment ID to show, or None if no shipment should be filtered
        """
        # Get all shipments for this patient, ordered chronologically
        shipment_query = self.db.query(Shipment)
        if pharma_id:
            shipment_query = shipment_query.filter(Shipment.pharma_id == pharma_id)
        shipment_query = shipment_query.filter(Shipment.patient_id == patient_id).order_by(
            Shipment.departure_time.asc().nulls_last(),
            Shipment.created_at.asc()
        )
        
        all_shipments = shipment_query.all()
        
        # Identify shipment 1 (first) and shipment 2 (second) based on chronological order
        shipment1 = all_shipments[0] if len(all_shipments) > 0 else None
        shipment2 = all_shipments[1] if len(all_shipments) > 1 else None
        
        # Check shipment statuses
        shipment1_completed = shipment1 and shipment1.transportation_success is True
        shipment2_exists = shipment2 is not None
        # Shipment 2 is "started" if it exists and transportation_success is not True (None or False)
        shipment2_started = shipment2_exists and shipment2.transportation_success is not True
        shipment2_completed = shipment2 and shipment2.transportation_success is True
        
        # Apply business rules to determine which shipment to show
        if not shipment2_exists:
            # Rule 1: Shipment 2 doesn't exist → show shipment 1
            if shipment1:
                return shipment1.id
        elif shipment2_started and shipment1_completed:
            # Rule 2: Shipment 2 has started AND shipment 1 is completed → show shipment 2
            return shipment2.id
        elif shipment1_completed and shipment2_completed:
            # Rule 3: Both shipments completed → show shipment 2
            return shipment2.id
        else:
            # Default: show shipment 1 if it exists
            if shipment1:
                return shipment1.id
        
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
    
    def _batch_get_shipment_carriers(self, shipment_ids: List[int]) -> Dict[int, Optional[str]]:
        """
        Batch fetch primary carrier names from first leg for multiple shipments.
        Returns a dictionary mapping shipment_id -> carrier_name.
        
        Args:
            shipment_ids: List of shipment IDs to fetch carriers for
            
        Returns:
            Dictionary mapping shipment_id to carrier_name (or None if not found)
        """
        if not shipment_ids:
            return {}
        
        # Use subquery to get minimum leg_order per shipment, then join to get carrier
        subquery = self.db.query(
            ShipmentLeg.shipment_id,
            func.min(ShipmentLeg.leg_order).label('min_leg_order')
        ).filter(
            ShipmentLeg.shipment_id.in_(shipment_ids)
        ).group_by(ShipmentLeg.shipment_id).subquery()
        
        first_leg_carriers = self.db.query(
            ShipmentLeg.shipment_id,
            Carrier.name
        ).join(
            subquery,
            and_(
                ShipmentLeg.shipment_id == subquery.c.shipment_id,
                ShipmentLeg.leg_order == subquery.c.min_leg_order
            )
        ).join(
            Carrier, ShipmentLeg.carrier_id == Carrier.id
        ).filter(
            Carrier.name.isnot(None)
        ).all()
        
        # Build map of shipment_id -> carrier_name
        carriers_map = {}
        for shipment_id, carrier_name in first_leg_carriers:
            carriers_map[shipment_id] = carrier_name
        
        return carriers_map
    
    def _build_filtered_active_routes_query(
        self,
        pharma_id: Optional[int] = None,
        route_status: Optional[str] = None,
        regions: Optional[List[str]] = None
    ) -> Query:
        """
        Build a query for active routes (shipments in TRANSPORTATION stage) with filters applied.
        
        Args:
            pharma_id: Optional pharma ID to filter routes
            route_status: Optional route status filter (safe, delayed, high_risk)
            regions: Optional list of regions to filter by
            
        Returns:
            SQLAlchemy query object with all filters applied
        """
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
            parsed_status = parse_route_status_filter(route_status)
            if parsed_status:
                query = query.filter(Shipment.routes_status == parsed_status)
        
        # Apply region-based filtering
        query = apply_region_filter(query, regions=regions)
        
        # Filter only active routes where patient is actively in TRANSPORTATION stage.
        # Requires an active PatientStage record and ensures shipment has not arrived yet.
        query = query.filter(
            and_(
                PatientStageModel.id.isnot(None),
                Shipment.handover_time.is_(None)
            )
        )
        
        return query
    
    
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
        regions: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Get real-time metrics for shipment tracking dashboard.
        Calculates: Active Routes, Avg Transit, Safe Routes, Delayed Routes, Risky Routes
        
        Args:
            pharma_id: Optional pharma ID to filter routes
            regions: Optional region name to filter by. If None, includes all regions.
            
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
            regions_list = [regions] if regions else None

            # Base query for shipments with join to PatientStage to check active TRANSPORTATION stage
            # Use join to get active stage info in single query (optimize N+1)
            query = self.db.query(
                Shipment,
                PatientStageModel.id.label('active_stage_id')
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
            
            # Apply region-based filtering
            query = apply_region_filter(query, regions=regions_list)
            
            results = query.all()
            
            # Initialize counters
            active_routes_count = 0
            safe_routes_count = 0
            delayed_routes_count = 0
            risky_routes_count = 0
            
            # Transit times for active routes
            transit_times = []
            
            # Process each shipment
            for shipment, active_stage_id in results:
                # Check if patient is in TRANSPORTATION stage (using joined data)
                if active_stage_id:
                    active_routes_count += 1
                    
                    # Calculate transit time in days for active routes
                    transit_days = calculate_transit_days(shipment.departure_time)
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
        carriers: Optional[str] = None,
        regions: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Get detailed list of active routes (shipments in TRANSPORTATION stage).
        
        Args:
            pharma_id: Optional pharma ID to filter routes
            route_status: Optional route status filter (safe, delayed, high_risk). If None, returns all statuses.
            carriers: Optional carrier name to filter by. If None, returns all carriers.
            regions: Optional region name to filter by. If None, returns all regions.
            
        Returns:
            List of dictionaries containing route details:
            - patient_id: Patient ID
            - source: Source location
            - destination: Destination location
            - route_status: Route status (safe, delayed, high_risk)
            - start_date: Departure date
            - transit_days: Days in transit
            - carrier: Provider/Carrier name
            - updated_at: Last update timestamp
            - region: Combined region (e.g., "Europe" or "Europe → Asia" if different)
            - source_region: Region of source location
            - destination_region: Region of destination location
        """
        try:
            carriers_list = [carriers] if carriers else None
            regions_list = [regions] if regions else None

            # Build filtered query using shared method
            query = self._build_filtered_active_routes_query(
                pharma_id=pharma_id,
                route_status=route_status,
                regions=regions_list
            )
            
            results = query.all()
            
            # Batch fetch carriers for all shipments to avoid N+1 queries
            shipment_ids = [row[0].id for row in results]
            carriers_map = self._batch_get_shipment_carriers(shipment_ids)
            
            active_routes = []
            
            for shipment, pharma_name, provider_name, carrier_name in results:
                # Calculate transit days
                transit_days_float = calculate_transit_days(shipment.departure_time)
                transit_days = int(transit_days_float) if transit_days_float is not None else None
                
                # Machine-friendly status should match DB enum values exactly
                route_status = shipment.routes_status.value if shipment.routes_status else "unknown"
                
                # Start date from departure_time (fallback to updated_at date when missing)
                start_date = get_start_date_from_shipment(shipment)
                
                # Get carrier name (from Carrier table, or Provider name, or from legs map)
                fallback_carrier = carrier_name if carrier_name else provider_name
                route_carrier = carriers_map.get(shipment.id, fallback_carrier)
                
                # Filter by carriers if provided
                if carriers_list and not carrier_matches_filter(route_carrier, carriers_list):
                    continue
                
                # Resolve route regions
                route_region, source_region, destination_region = resolve_route_regions(
                    shipment.source_country,
                    shipment.destination_country
                )
                
                route_data = {
                    "id": shipment.id,
                    "patient_id": shipment.patient_id,
                    "source": shipment.source_location,
                    "destination": shipment.destination_location,
                    "route_status": route_status,
                    "start_date": start_date,
                    "transit_days": transit_days,
                    "carrier": route_carrier,
                    "updated_at": shipment.updated_at.isoformat() if shipment.updated_at else None,
                    "created_at": shipment.created_at.isoformat() if shipment.created_at else None,
                    "region": route_region,
                    "source_region": source_region,
                    "destination_region": destination_region
                }
                
                active_routes.append(route_data)
            
            # Sort by created_at descending (most recently created first)
            active_routes.sort(key=lambda x: x['created_at'] or '', reverse=True)
            
            return active_routes
            
        except Exception as e:
            logger.error(f"{ErrorMessages.SHIPMENT_ACTIVE_ROUTES_ERROR}: {str(e)}")
            raise

    def get_3pl_player_details(self, pharma_id: Optional[int] = None, patient_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Fetch 3PL player operational details from shipment legs.

        Business Logic:
        - Every patient has 2 shipments: Shipment 1 (Hospital to Pharma) and Shipment 2 (Pharma to Hospital)
        - Workflow order: Shipment 1 → Reengineering → Shipment 2 → Reinfusion
        - Rules for which shipment to show:
          1. If shipment 2 doesn't exist → show shipment 1 details
          2. If shipment 2 has started AND shipment 1 is completed → show shipment 2 details
          3. If both shipments are completed → show shipment 2 details

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
            
            # Determine which shipment to show based on business rules
            target_shipment_id = None
            if patient_id:
                target_shipment_id = self._get_target_shipment_id(patient_id, pharma_id)
            
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
            
            # Filter to target shipment if determined
            if target_shipment_id:
                query = query.filter(Shipment.id == target_shipment_id)

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
        
        Business Logic:
        - Every patient has 2 shipments: Shipment 1 (Hospital to Pharma) and Shipment 2 (Pharma to Hospital)
        - Workflow order: Shipment 1 → Reengineering → Shipment 2 → Reinfusion
        - Rules for which shipment to show:
          1. If shipment 2 doesn't exist → show shipment 1 details
          2. If shipment 2 has started AND shipment 1 is completed → show shipment 2 details
          3. If both shipments are completed → show shipment 2 details
        
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
            
            # Determine which shipment to show based on business rules
            target_shipment_id = self._get_target_shipment_id(patient_id, pharma_id)
            
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
            
            # Filter to target shipment if determined
            if target_shipment_id:
                query = query.filter(Shipment.id == target_shipment_id)
            
            # Order by leg_order to maintain sequence
            rows = query.order_by(ShipmentLeg.leg_order.asc()).all()

            results: List[Dict[str, Any]] = []
            
            for leg, patient_id_val, _ in rows:
                # Calculate scheduled_time: scheduled_time - departure_time (scheduled duration)
                scheduled_time_str = None
                if leg.departure_time and leg.scheduled_time:
                    scheduled_time_str = format_duration(leg.departure_time, leg.scheduled_time)
                
                # Calculate actual_time: handover_time - departure_time, or arrival_time - departure_time if handover_time is not available
                actual_time_str = None
                if leg.departure_time:
                    end_time = leg.handover_time or leg.arrival_time
                    if end_time:
                        actual_time_str = format_duration(leg.departure_time, end_time)
                
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
        route_status: Optional[str] = None,
        carriers: Optional[str] = None,
        regions: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Get control tower map data with source and destination locations including coordinates.
        Returns only shipment-level data (no leg details).
        
        Args:
            pharma_id: Optional pharma ID to filter routes
            route_status: Optional route status filter (safe, delayed, high_risk). If None, returns all statuses.
            carriers: Optional carrier name to filter by. If None, returns all carriers.
            regions: Optional region name to filter by. Matches if either source or destination is in the specified region.
            
        Returns:
            Dictionary containing:
            - routes: List of route dictionaries with source/destination, coordinates, carrier, route_status, and region
            - total_routes: Total count of routes
            Each route includes:
            - shipment_id, patient_id
            - source_location, destination_location
            - source_latitude, source_longitude, destination_latitude, destination_longitude
            - route_status: Route status (safe, delayed, high_risk)
            - carrier: Carrier name
            - region: Combined region (e.g., "Europe" or "Europe → Asia" if different)
            - source_region: Region of source location
            - destination_region: Region of destination location
            - last_updated: Last update time
        """
        try:
            carriers_list = [carriers] if carriers else None
            regions_list = [regions] if regions else None

            # Build filtered query using shared method
            query = self._build_filtered_active_routes_query(
                pharma_id=pharma_id,
                route_status=route_status,
                regions=regions_list
            )
            
            results = query.all()
            
            # Batch fetch carriers for all shipments to avoid N+1 queries
            shipment_ids = [row[0].id for row in results]
            carriers_map = self._batch_get_shipment_carriers(shipment_ids)
            
            routes = []
            most_recent_updated_at = None
            
            for shipment, pharma_name, provider_name, carrier_name in results:
                # Get carrier name (from Carrier table, or Provider name, or from legs map)
                fallback_carrier = carrier_name if carrier_name else provider_name
                route_carrier = carriers_map.get(shipment.id, fallback_carrier)
                
                # Filter by carriers if provided
                if carriers_list and not carrier_matches_filter(route_carrier, carriers_list):
                    continue
                
                # Resolve route regions
                route_region, source_region, destination_region = resolve_route_regions(
                    shipment.source_country,
                    shipment.destination_country
                )
                
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
                    "carrier": route_carrier,
                    "region": route_region,
                    "source_region": source_region,
                    "destination_region": destination_region,
                    "last_updated": format_time_12hour(shipment.updated_at)
                }
                
                routes.append(route_data)
                
                # Track the most recent updated_at time
                if shipment.updated_at:
                    if most_recent_updated_at is None or shipment.updated_at > most_recent_updated_at:
                        most_recent_updated_at = shipment.updated_at
            
            # Sort by shipment ID
            routes.sort(key=lambda x: x['shipment_id'], reverse=True)
            
            # Check if filters are applied and no routes found
            message = None
            if has_filters_applied(route_status, carriers_list, regions_list) and len(routes) == 0:
                message = InfoMessages.SHIPMENT_ACTIVE_ROUTES_NOT_AVAILABLE
            
            return {
                "routes": routes,
                "total_routes": len(routes),
                "last_updated": format_time_12hour(most_recent_updated_at),
                "message": message
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
        
        Business Logic:
        - Every patient has 2 shipments: Shipment 1 (Hospital to Pharma) and Shipment 2 (Pharma to Hospital)
        - Workflow order: Shipment 1 → Reengineering → Shipment 2 → Reinfusion
        - Rules for which shipment to show:
          1. If shipment 2 doesn't exist → show shipment 1 details
          2. If shipment 2 has started AND shipment 1 is completed → show shipment 2 details
          3. If both shipments are completed → show shipment 2 details
        
        Args:
            patient_id: Patient ID to get document checklist for
            pharma_id: Optional pharma ID to validate patient belongs to pharma (required for security)
            
        Returns:
            Dict containing:
            - items: List of document checklist items with stage, actual, needed
            - total_items: Total number of items
            - missing_documents: List of missing document names
            - non_compliance_percentage: Percentage of non-compliance
            
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
            
            # Determine which shipment to show based on business rules
            target_shipment_id = self._get_target_shipment_id(patient_id, pharma_id)
            
            # Query shipment legs with join to shipment to filter by patient_id and pharma_id
            query = self.db.query(ShipmentLeg).join(
                Shipment,
                ShipmentLeg.shipment_id == Shipment.id
            ).filter(Shipment.patient_id == patient_id)
            
            # Additional filter by pharma_id if provided (double check for security)
            if pharma_id:
                query = query.filter(Shipment.pharma_id == pharma_id)
            
            # Filter to target shipment if determined
            if target_shipment_id:
                query = query.filter(Shipment.id == target_shipment_id)
            
            # Get all matching shipment legs ordered by leg_order for logical sequence
            legs = query.order_by(ShipmentLeg.leg_order.asc(), ShipmentLeg.id.asc()).all()
            
            # Get all leg IDs for this patient's shipment legs
            leg_ids = [leg.id for leg in legs]
            
            # Get all missing documents across all legs for this patient and group by leg_id
            docs_by_leg = defaultdict(list)
            if leg_ids:
                missing_docs = self.db.query(ShipmentLegDocument).filter(
                    and_(
                        ShipmentLegDocument.shipment_leg_id.in_(leg_ids),
                        ShipmentLegDocument.is_missing == True
                    )
                ).all()
                for doc in missing_docs:
                    docs_by_leg[doc.shipment_leg_id].append(doc.document_name)
            
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
                
                # Get missing documents for this leg (as array, not comma-separated)
                leg_missing_docs = docs_by_leg.get(leg.id, [])
                
                checklist_items.append({
                    "stage": stage,
                    "actual": leg.doc_count_actual,
                    "needed": leg.doc_count_needed,
                    "missed": leg_missed,
                    "missing_documents": leg_missing_docs
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
                "non_compliance_percentage": non_compliance_percentage
            }
            
        except PatientNotFoundException:
            raise
        except Exception as e:
            logger.error(f"Error getting document checklist: {str(e)}")
            raise


