"""
Control Tower Service
Service for calculating real-time metrics for control tower dashboard.
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


class ControlTowerService:
    """Service for calculating real-time metrics: Active Routes, Avg Transit, Safe Routes, Delayed Routes, Risky Routes"""
    
    def __init__(self, db: Session):
        self.db = db
    
    def update_patient_stage_on_shipment_failure(self, shipment: Shipment) -> None:
        """
        Update PatientStage.is_success to False when shipment routes_status is FAILED.
        This should be called whenever a shipment's routes_status changes to FAILED.
        
        Args:
            shipment: The shipment object with routes_status = FAILED
        """
        try:
            if shipment.routes_status != RouteStatus.FAILED:
                return
            
            # Find the active TRANSPORTATION stage for this patient
            active_stage = self.db.query(PatientStageModel).filter(
                and_(
                    PatientStageModel.patient_id == shipment.patient_id,
                    PatientStageModel.stage == PatientStage.TRANSPORTATION,
                    PatientStageModel.is_active == True
                )
            ).first()
            
            if active_stage:
                # Mark the stage as failed (not successful)
                active_stage.is_success = False
                active_stage.is_active = False  # Mark as inactive
                active_stage.end_time = datetime.now(timezone.utc)
                active_stage.updated_at = datetime.now(timezone.utc)
                
                self.db.commit()
                logger.info(f"Updated PatientStage.is_success=False for patient {shipment.patient_id} due to shipment failure")
            else:
                logger.warning(f"No active TRANSPORTATION stage found for patient {shipment.patient_id} when shipment failed")
                
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error updating PatientStage on shipment failure: {str(e)}")
            raise
    
    def get_real_time_metrics(self, pharma_id: Optional[int] = None) -> Dict[str, Any]:
        """
        Get real-time metrics for control tower dashboard.
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
                # Check if patient is in TRANSPORTATION stage via joined PatientStage
                # We need to reload the relationship to check if stage exists
                active_stage = self.db.query(PatientStageModel).filter(
                    and_(
                        PatientStageModel.patient_id == shipment.patient_id,
                        PatientStageModel.stage == PatientStage.TRANSPORTATION,
                        PatientStageModel.is_active == True
                    )
                ).first()
                
                is_active = active_stage is not None
                
                if is_active:
                    active_routes_count += 1
                    
                    # Calculate transit time in days for active routes
                    if shipment.departure_time:
                        # Handle timezone-aware/naive datetime comparison
                        departure = shipment.departure_time
                        if departure.tzinfo is None:
                            # If naive, assume it's UTC
                            departure = departure.replace(tzinfo=timezone.utc)
                        elif departure.tzinfo != timezone.utc:
                            # If different timezone, convert to UTC
                            departure = departure.astimezone(timezone.utc)
                        
                        transit_duration = now - departure
                        transit_days = transit_duration.total_seconds() / (24 * 3600)
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
    
    def get_active_routes(self, pharma_id: Optional[int] = None) -> List[Dict[str, Any]]:
        """
        Get detailed list of active routes (shipments in TRANSPORTATION stage).
        
        Args:
            pharma_id: Optional pharma ID to filter routes
            
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
            
            # Filter only active routes (where PatientStage exists)
            query = query.filter(PatientStageModel.id.isnot(None))
            
            results = query.all()
            
            now = datetime.now(timezone.utc)
            active_routes = []
            
            for shipment, pharma_name, provider_name, carrier_name in results:
                # Calculate transit days
                transit_days = None
                if shipment.departure_time:
                    departure = shipment.departure_time
                    if departure.tzinfo is None:
                        departure = departure.replace(tzinfo=timezone.utc)
                    elif departure.tzinfo != timezone.utc:
                        departure = departure.astimezone(timezone.utc)
                    
                    transit_duration = now - departure
                    transit_days = int(transit_duration.total_seconds() / (24 * 3600))
                
                # Machine-friendly status should match DB enum values exactly
                route_status = shipment.routes_status.value if shipment.routes_status else "unknown"
                
                # Keep source and destination separately for clarity
                source_location = shipment.source_location
                destination_location = shipment.destination_location
                
                # Start date from departure_time (fallback to updated_at date when missing)
                start_date = None
                if shipment.departure_time:
                    start_date = shipment.departure_time.date().isoformat()
                elif shipment.updated_at:
                    if shipment.updated_at.tzinfo is None:
                        start_date = shipment.updated_at.date().isoformat()
                    else:
                        start_date = shipment.updated_at.date().isoformat()
                
                # Get carrier name (from Carrier table, or Provider name, or mode_of_transport as fallback)
                carrier = carrier_name if carrier_name else (provider_name if provider_name else shipment.mode_of_transport)
                
                # Collect unique carriers from shipment legs
                leg_carrier_rows = self.db.query(Carrier.name).join(
                    ShipmentLeg, ShipmentLeg.carrier_id == Carrier.id
                ).filter(
                    ShipmentLeg.shipment_id == shipment.id,
                    Carrier.name.isnot(None)
                ).distinct().all()
                carriers = [row[0] for row in leg_carrier_rows]
                # Fallback to shipment-level carrier if no leg carriers found
                if not carriers and carrier:
                    carriers = [carrier]
                
                route_data = {
                    "patient_id": shipment.patient_id,
                    "source": source_location,
                    "destination": destination_location,
                    "route_status": route_status,
                    "start_date": start_date,
                    "transit_days": transit_days,
                    "carriers": carriers,
                    "updated_at": shipment.updated_at.isoformat() if shipment.updated_at else None
                }
                
                active_routes.append(route_data)
            
            # Sort by updated_at descending (most recent first)
            active_routes.sort(key=lambda x: x['updated_at'] or '', reverse=True)
            
            return active_routes
            
        except Exception as e:
            logger.error(f"Error getting active routes: {str(e)}")
            raise

