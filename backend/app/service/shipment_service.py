"""
Shipment Service
Service for calculating real-time metrics for shipment tracking and management.
"""

import logging
from datetime import datetime, timezone
from typing import List, Dict, Optional, Any
from sqlalchemy.orm import Session
from sqlalchemy import and_

from ..models.shipment_model import Shipment
from ..models.patient_stage_model import PatientStage as PatientStageModel
from ..models.patient_model import Patient
from ..models.pharma_model import Pharma
from ..models.provider_model import Provider
from ..models.carrier_model import Carrier
from ..models.shipment_leg_model import ShipmentLeg
from ..constants.enums import PatientStage, RouteStatus

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
    
    def _get_shipment_carriers(self, shipment_id: int, fallback_carrier: Optional[str] = None) -> List[str]:
        """Get list of carrier names for a shipment from its legs, with fallback."""
        leg_carrier_rows = self.db.query(Carrier.name).join(
            ShipmentLeg, ShipmentLeg.carrier_id == Carrier.id
        ).filter(
            ShipmentLeg.shipment_id == shipment_id,
            Carrier.name.isnot(None)
        ).distinct().all()
        
        carriers = [row[0] for row in leg_carrier_rows]
        if not carriers and fallback_carrier:
            carriers = [fallback_carrier]
        return carriers
    
    def _carriers_match_filter(self, route_carriers: List[str], filter_carriers: List[str]) -> bool:
        """Check if any route carriers match the filter carriers (partial match, case-insensitive)."""
        route_carriers_lower = [c.lower() if c else "" for c in route_carriers]
        filter_carriers_lower = [c.lower() for c in filter_carriers]
        
        for filter_carrier in filter_carriers_lower:
            for route_carrier in route_carriers_lower:
                if filter_carrier in route_carrier or route_carrier in filter_carrier:
                    return True
        return False
    
    def _format_duration(self, start_dt: Optional[datetime], end_dt: Optional[datetime]) -> Optional[str]:
        """Format duration between two datetimes as 'Xh Ym' string."""
        if not start_dt or not end_dt:
            return None
        
        start = self._normalize_datetime_to_utc(start_dt)
        end = self._normalize_datetime_to_utc(end_dt)
        
        duration = end - start
        total_seconds = int(duration.total_seconds())
        
        if total_seconds <= 0:
            return None
        
        hours = total_seconds // 3600
        minutes = (total_seconds % 3600) // 60
        
        if hours > 0 and minutes > 0:
            return f"{hours}h {minutes}m"
        elif hours > 0:
            return f"{hours}h"
        elif minutes > 0:
            return f"{minutes}m"
        else:
            return "0m"
    
    def _get_start_date_from_shipment(self, shipment: Shipment) -> Optional[str]:
        """Get start date from shipment (departure_time or updated_at as fallback)."""
        if shipment.departure_time:
            return shipment.departure_time.date().isoformat()
        elif shipment.updated_at:
            return shipment.updated_at.date().isoformat()
        return None
    
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
    
    def get_real_time_metrics(self, pharma_id: Optional[int] = None) -> Dict[str, Any]:
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
            logger.error(f"Error calculating real-time metrics: {str(e)}")
            raise
    
    def get_active_routes(
        self, 
        pharma_id: Optional[int] = None,
        route_status: Optional[str] = None,
        carriers: Optional[List[str]] = None
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
                
                # Collect unique carriers from shipment legs
                route_carriers = self._get_shipment_carriers(shipment.id, fallback_carrier)
                
                # Filter by carriers if provided
                if carriers and not self._carriers_match_filter(route_carriers, carriers):
                    continue
                
                route_data = {
                    "patient_id": shipment.patient_id,
                    "source": shipment.source_location,
                    "destination": shipment.destination_location,
                    "route_status": route_status,
                    "start_date": start_date,
                    "transit_days": transit_days,
                    "carriers": route_carriers,
                    "updated_at": shipment.updated_at.isoformat() if shipment.updated_at else None
                }
                
                active_routes.append(route_data)
            
            # Sort by updated_at descending (most recent first)
            active_routes.sort(key=lambda x: x['updated_at'] or '', reverse=True)
            
            return active_routes
            
        except Exception as e:
            logger.error(f"Error getting active routes: {str(e)}")
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
            logger.error(f"Error fetching 3PL player details: {str(e)}")
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
            - scheduled_time: Scheduled transport time as string in hours and minutes format (e.g., "1h 30m") calculated from departure_time to scheduled_time, or None
            - actual_time: Actual transport time as string in hours and minutes format (e.g., "1h 30m") calculated from departure_time to handover_time or arrival_time
        """
        try:
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
            logger.error(f"Error fetching transport time comparison: {str(e)}")
            raise


