from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional, Dict, Any, List

from app.config.database import get_db
from app.dependencies.auth_dependencies import get_current_user_pharma_id
from app.service.shipment_service import ShipmentService
from app.schemas.patient_schema import PatientJourneySummaryResponse, ControlTowerMapResponse
from app.exceptions.patient_exceptions import PatientNotFoundException, ShipmentNotStartedException 

router = APIRouter(prefix="/shipment", tags=["shipment"])


@router.get("/3pl-players/{patient_id}")
def get_three_pl_players(
    patient_id: str,
    pharma_id: Optional[int] = Depends(get_current_user_pharma_id),
    db: Session = Depends(get_db)
):
    try:
      
        service = ShipmentService(db)
        return service.get_3pl_player_details(pharma_id=pharma_id, patient_id=patient_id)
    except (PatientNotFoundException, ShipmentNotStartedException):
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting 3PL player details: {str(e)}")


@router.get("/active-routes", response_model=Dict[str, Any])
def get_active_routes(
    pharma_id: Optional[int] = Depends(get_current_user_pharma_id),
    route_status: Optional[str] = Query(None, description="Filter by route status: safe, delayed, high_risk"),
    carriers: Optional[List[str]] = Query(None, description="Filter by carrier names (can specify multiple)"),
    regions: Optional[List[str]] = Query(None, description="Filter by regions - matches if either source or destination is in the specified regions. Examples: 'Europe', 'North America', 'Asia'"),
    db: Session = Depends(get_db)
):
    """
    Get detailed list of active routes (shipments currently in TRANSPORTATION stage) and include real-time metrics.
    
    Optional filters:
    - route_status: Filter by route status (safe, delayed, high_risk). If not provided, returns all statuses.
    - carriers: Filter by carrier names (can specify multiple). If not provided, returns all carriers.
    - regions: Filter by regions - matches if either source OR destination is in the specified regions. Examples: 'Europe', 'North America', 'Asia'
    
    Response (when data is available):
        {
          "routes": [
             { "route": "A → B", "status": "Safe", "date": "YYYY-MM-DD", "company": "...", "transit_days": 3, "carrier": "...", "updated_at": "..." },
             ...
          ],
          "metrics": {
             "active_routes": 10,
             "avg_transit_days": 2.5,
             "safe_routes": 7,
             "delayed_routes": 2,
             "risky_routes": 1,
             "last_updated": "..."
          }
        }
    
    Response (when filters are applied but no data matches):
        {
          "routes": [],
          "metrics": {},
          "message": "Active routes not available"
        }
    """
    try:
        service = ShipmentService(db)
        
        # Check if any filters are applied
        has_filters = any([route_status, carriers, regions])
        
        routes = service.get_active_routes(
            pharma_id, 
            route_status=route_status, 
            carriers=carriers,
            regions=regions
        )
        
        # If filters are applied and no routes found, return message
        if has_filters and not routes:
            return {
                "routes": [],
                "metrics": {},
                "message": "Active routes not available"
            }
        
        metrics = service.get_real_time_metrics(
            pharma_id,
            regions=regions
        )
        return {"routes": routes, "metrics": metrics}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting active routes: {str(e)}")


@router.get("/transport-time-comparison/{patient_id}", response_model=List[Dict[str, Any]])
def get_transport_time_comparison(
    patient_id: str,
    pharma_id: Optional[int] = Depends(get_current_user_pharma_id),
    db: Session = Depends(get_db)
):
    """
    Get transport time comparison data for a particular patient's shipment legs.
    
    Response:
        [
            {
                "source_location": "Location A",
                "destination_location": "Location B",
                "scheduled_time": "2h 30m",  # Scheduled transport time in hours and minutes format (e.g., "2h 15m", "45m", "3h") or null
                "actual_time": "1h 30m"  # Actual transport time in hours and minutes format (e.g., "2h 15m", "45m", "3h")
            },
            ...
        ]
    """
    try:   
        service = ShipmentService(db)
        return service.get_transport_time_comparison(patient_id=patient_id, pharma_id=pharma_id)
    except (PatientNotFoundException, ShipmentNotStartedException):
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting transport time comparison: {str(e)}")


@router.get("/patient/{patient_id}/summary", response_model=PatientJourneySummaryResponse)
def get_patient_journey_summary(
    patient_id: str,
    pharma_id: Optional[int] = Depends(get_current_user_pharma_id),
    db: Session = Depends(get_db)
):
    """
    Get complete patient journey summary including:
    - Patient information (ID, condition, hospital)
    - Leg 1: Hospital to Pharma Manufacturing Site (with all shipment legs)
    - Reengineering/Manufacturing phase
    - Leg 2: Pharma to Hospital (with all shipment legs)
    - Current overall status
    
    This endpoint provides a comprehensive view of the patient's treatment journey
    from hospital collection through reengineering to final delivery back to hospital.
    
    Response includes:
    - Patient basic info
    - Leg 1 details (all legs with carrier, provider, timings, status)
    - Reengineering stage (start/end dates, status)
    - Leg 2 details (all legs with carrier, provider, timings, status)
    - Current status summary for all phases
    """
    try:   
        service = ShipmentService(db)
        summary = service.get_patient_journey_summary(patient_id=patient_id, pharma_id=pharma_id)
        return PatientJourneySummaryResponse(**summary)
    except (PatientNotFoundException, ShipmentNotStartedException):
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting patient journey summary: {str(e)}")


@router.get("/carriers", response_model=List[str])
def get_all_carriers(
    pharma_id: Optional[int] = Depends(get_current_user_pharma_id),
    active_only: bool = Query(True, description="Return only active carriers. Set to false to get all carriers."),
    db: Session = Depends(get_db)
):
    """
    Get carrier names used in shipments for the current user's pharma_id.
    
    Only returns carriers that are actually used in shipments (either at shipment level or leg level)
    for the specified pharma.
    
    Returns:
        List of carrier names (sorted alphabetically):
        [
            "DHL Express Healthcare",
            "FedEx Medical Express",
            "UPS Healthcare Logistics",
            ...
        ]
    """
    try:
        service = ShipmentService(db)
        return service.get_all_carriers(pharma_id=pharma_id, active_only=active_only)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting carriers: {str(e)}")


@router.get("/regions", response_model=List[str])
def get_available_regions(
    pharma_id: Optional[int] = Depends(get_current_user_pharma_id),
    db: Session = Depends(get_db)
):
    """
    Get all unique regions available for shipments based on the current user's pharma_id.
    
    Regions are derived from source and destination countries in shipments using country_converter.
    Only returns regions that appear in actual shipments for the specified pharma.
    
    Returns:
        List of unique region names (sorted alphabetically):
        [
            "Asia",
            "Europe",
            "North America",
            ...
        ]
    """
    try:
        service = ShipmentService(db)
        return service.get_available_regions(pharma_id=pharma_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting available regions: {str(e)}")


@router.get("/control-tower-map", response_model=ControlTowerMapResponse)
def get_control_tower_map(
    pharma_id: Optional[int] = Depends(get_current_user_pharma_id),
    route_status: Optional[str] = Query(None, description="Filter by route status: safe, delayed, high_risk"),
    db: Session = Depends(get_db)
):
    """
    Get control tower map data with source and destination locations including latitude and longitude coordinates.
    
    This endpoint returns only shipment-level data (source and destination with coordinates).
    It does not include individual leg details.
    
    Optional filters:
    - route_status: Filter by route status (safe, delayed, high_risk). If not provided, returns all statuses.
    
    Response:
        {
            "routes": [
                {
                    "shipment_id": 1,
                    "patient_id": "PT...",
                    "source_location": "Location A",
                    "destination_location": "Location B",
                    "source_latitude": 40.7128,
                    "source_longitude": -74.0060,
                    "destination_latitude": 34.0522,
                    "destination_longitude": -118.2437
                },
                ...
            ],
            "total_routes": 10
        }
    """
    try:
        service = ShipmentService(db)
        map_data = service.get_control_tower_map_data(
            pharma_id=pharma_id,
            route_status=route_status
        )
        return ControlTowerMapResponse(**map_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting control tower map data: {str(e)}")

