from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.service.IVF.ivf_service import IVFService
from app.schemas.IVF.ivf_schema import IVFControlTowerResponse, ActiveCanistersResponse, EmbryoTrackingResponse

router = APIRouter(prefix="/ivf", tags=["IVF"])


@router.get("/control_tower", response_model=IVFControlTowerResponse)
def get_ivf_control_tower_map(
    db: Session = Depends(get_db)
):
    """
    Get IVF control tower map locations with hospital and branch information.
    
    This endpoint returns hospital branch locations organized by states with their 
    geographic coordinates for display on the control tower map.
    
    Response format:
    {
        "hospitalName": "ARC Fertility Hospitals",
        "hospital_type": "IVF",
        "states": {
            "Tamil Nadu": [
                {
                    "branch_name": "Egmore",
                    "branch_status": "safe",
                    "address": {
                        "area": "19, CASA Major Rd...",
                        "district": "Chennai",
                        "pincode": "600008"
                    },
                    "geoLocation": {
                        "latitude": 13.069505,
                        "longitude": 80.255197
                    }
                },
                ...
            ],
            "Karnataka": [...],
            ...
        },
        "highest_branch_count_country": "India"
    }
    """
    try:
        service = IVFService(db)
        map_data = service.get_control_tower_map_locations()
        return IVFControlTowerResponse(**map_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting IVF control tower map data: {str(e)}")


@router.get("/control_tower/active_canisters", response_model=ActiveCanistersResponse)
def get_active_canisters(
    db: Session = Depends(get_db)
):
    """
    Get active canisters grouped by branch with their status and last updated time.
    
    This endpoint returns all active canisters (is_active = True) grouped by branch with:
    - branch_id: The ID of the branch
    - branch_name: The name of the branch
    - canisters: List of canisters for this branch with:
        - canister_id: The ID of the canister
        - canister_status: Status (safe, risk, or critical)
        - updated_at: Last updated date and time from the most recent canister log opened_at column (if available),
                      otherwise from canisters table created_at
    
    Response format:
    {
        "branches": [
            {
                "branch_id": 1,
                "branch_name": "Egmore",
                "canisters": [
                    {
                        "canister_id": 1,
                        "canister_status": "safe",
                        "updated_at": "2024-01-15T10:30:00Z"
                    },
                    {
                        "canister_id": 2,
                        "canister_status": "risk",
                        "updated_at": "2024-01-15T09:15:00Z"
                    }
                ]
            },
            {
                "branch_id": 2,
                "branch_name": "Anna Nagar",
                "canisters": [
                    {
                        "canister_id": 3,
                        "canister_status": "safe",
                        "updated_at": "2024-01-15T11:00:00Z"
                    }
                ]
            }
        ],
        "total": 3
    }
    """
    try:
        service = IVFService(db)
        canisters_data = service.get_active_canisters()
        return ActiveCanistersResponse(**canisters_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting active canisters: {str(e)}")


@router.get("/embryo_tracking", response_model=EmbryoTrackingResponse)
def get_embryo_tracking(
    db: Session = Depends(get_db)
):
    """
    Get embryo tracking data grouped by cryolock.
    
    This endpoint returns embryo tracking information in a table format showing:
    - HIS Number (Patient identifier)
    - Cryolock Number
    - Canister Number
    - Tank ID (formatted)
    - Cane ID (formatted)
    - Goblet Color
    - Cryolock Color
    - Date of Vitrification
    - Embryo Grading (comma-separated for multiple embryos in same cryolock)
    
    The data is grouped by cryolock, so multiple embryos in the same cryolock
    will have their gradings aggregated into a comma-separated list.
    
    Response format:
    {
        "data": [
            {
                "his_number": "HIS-10234",
                "cryolock_number": "CL-01",
                "canister_number": 6,
                "tank_id": "Tank 8",
                "cane_id": "Cane-A 12",
                "goblet_color": "Yellow",
                "cryolock_color": "Blue",
                "date_of_vitrification": "2024-08-12",
                "embryo_grading": "4AB, 4BB"
            },
            ...
        ],
        "total": 10
    }
    """
    try:
        service = IVFService(db)
        tracking_data = service.get_embryo_tracking()
        return EmbryoTrackingResponse(**tracking_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting embryo tracking data: {str(e)}")

