from fastapi import APIRouter, Depends, HTTPException, Request, Path
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.service.IVF.ivf_service import IVFService
from app.models.IVF.canister_model import Canister
from app.schemas.IVF.ivf_schema import IVFControlTowerResponse, ActiveCanistersResponse, EmbryoTrackingResponse, CanisterCheckResponse
from app.utils.ivf_helpers import get_branch_filter_info

router = APIRouter(prefix="/ivf", tags=["IVF"])


@router.get("/control_tower", response_model=IVFControlTowerResponse)
def get_ivf_control_tower_map(
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Get IVF control tower map locations with hospital and branch information.
    
    Role-based access:
    - User/Manager: Only see data from their assigned branch
    - Admin: See data from all branches
    
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
        # Get branch filter info for IVF department users
        branch_id, role = get_branch_filter_info(request)
        
        service = IVFService(db)
        map_data = service.get_control_tower_map_locations(branch_id=branch_id)
        return IVFControlTowerResponse(**map_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting IVF control tower map data: {str(e)}")


@router.get("/control_tower/active_canisters", response_model=ActiveCanistersResponse)
def get_active_canisters(
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Get active canisters grouped by branch with their status and last updated time.
    
    Role-based access:
    - User/Manager: Only see canisters from their assigned branch
    - Admin: See canisters from all branches
    
    This endpoint returns all active canisters (is_active = True) grouped by branch with:
    - branch_id: The ID of the branch
    - branch_name: The name of the branch
    - canisters: List of canisters for this branch with:
        - canister_number: The canister number/code (e.g., 'C1')
        - canister_status: Status (safe, risk, or critical)
        - updated_at: Last updated date and time from the most recent canister log refill_date+refill_time (if available),
                      otherwise from canisters table created_at
    
    Response format:
    {
        "branches": [
            {
                "branch_id": 1,
                "branch_name": "Egmore",
                "canisters": [
                    {
                        "canister_number": "C1",
                        "canister_status": "safe",
                        "updated_at": "2024-01-15T10:30:00Z"
                    },
                    {
                        "canister_number": "C2",
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
                        "canister_number": "C1",
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
        # Get branch filter info for IVF department users
        branch_id, role = get_branch_filter_info(request)
        
        service = IVFService(db)
        canisters_data = service.get_active_canisters(branch_id=branch_id)
        return ActiveCanistersResponse(**canisters_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting active canisters: {str(e)}")


@router.get("/embryo_tracking", response_model=EmbryoTrackingResponse)
def get_embryo_tracking(
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Get embryo tracking data grouped by cryolock.
    
    Role-based access and field visibility:
    - User: Only see data from their assigned branch. Includes embryo_grading, excludes site_name and status.
    - Manager: Only see data from their assigned branch. Includes site_name and status, excludes embryo_grading.
    - Admin: See data from all branches. Includes site_name and status, excludes embryo_grading.
    
    This endpoint returns embryo tracking information in a table format showing:
    - HIS Number (Patient identifier)
    - Cryolock Number
    - Canister Number/Code
    - Tank Code
    - Cane Code
    - Goblet Color
    - Cryolock Color
    - Date of Vitrification
    - Embryo Grading (User role only - comma-separated for multiple embryos in same cryolock)
    - Site Name (Manager/Admin roles only - branch name)
    - Status (Manager/Admin roles only - embryo status)
    
    Response format (User role):
    {
        "data": [
            {
                "his_number": "HIS-10234",
                "cryolock_number": "CL-01",
                "canister_number": "C1",
                "tank_code": "T1",
                "cane_code": "A12",
                "goblet_color": "Yellow",
                "cryolock_color": "Blue",
                "date_of_vitrification": "2024-08-12",
                "embryo_grading": "4AB, 4BB"
            },
            ...
        ],
        "total": 10
    }
    
    Response format (Manager/Admin roles):
    {
        "data": [
            {
                "his_number": "HIS-10234",
                "cryolock_number": "CL-01",
                "canister_number": "C1",
                "tank_code": "T1",
                "cane_code": "A12",
                "goblet_color": "Yellow",
                "cryolock_color": "Blue",
                "date_of_vitrification": "2024-08-12",
                "site_name": "Egmore",
                "status": "Active"
            },
            ...
        ],
        "total": 10
    }
    """
    try:
        # Get branch filter info for IVF department users
        branch_id, role = get_branch_filter_info(request)
        
        service = IVFService(db)
        tracking_data = service.get_embryo_tracking(branch_id=branch_id, user_role=role)
        return EmbryoTrackingResponse(**tracking_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting embryo tracking data: {str(e)}")


@router.get("/canisters/{canister_number}/check", response_model=CanisterCheckResponse)
def check_canister_exists(
    canister_number: str = Path(..., description="Canister number/code to check (e.g., 'C1')"),
    request: Request = None,
    db: Session = Depends(get_db)
):
    """
    Check if a canister exists in the system by canister number.
    
    This endpoint allows users to verify if a canister number exists before performing operations.
    
    Path Parameters:
    - canister_number: Canister number/code to check (e.g., 'C1')
    
    Response:
    - exists: Boolean indicating if the canister exists
    - canister_number: The canister number that was checked
    - canister_id: Canister ID if exists (null if not found)
    - is_active: Whether the canister is active (null if not found)
    - canister_status: Canister status (null if not found)
    - message: Descriptive message about the result
    
    Example Response (exists):
    {
        "exists": true,
        "canister_number": "C1",
        "canister_id": 1,
        "is_active": true,
        "canister_status": "safe",
        "message": "Canister C1 exists and is active"
    }
    
    Example Response (not exists):
    {
        "exists": false,
        "canister_number": "C999",
        "canister_id": null,
        "is_active": null,
        "canister_status": null,
        "message": "Canister C999 does not exist"
    }
    """
    try:
        # Query canister by canister_number
        canister = db.query(Canister).filter(Canister.canister_number == canister_number).first()
        
        if canister:
            return CanisterCheckResponse(
                exists=True,
                canister_number=canister_number,
                canister_id=canister.canister_id,
                is_active=canister.is_active,
                canister_status=canister.canister_status.value if canister.canister_status else None,
                message=f"Canister {canister_number} exists and is {'active' if canister.is_active else 'inactive'}"
            )
        else:
            return CanisterCheckResponse(
                exists=False,
                canister_number=canister_number,
                canister_id=None,
                is_active=None,
                canister_status=None,
                message=f"Canister {canister_number} does not exist"
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error checking canister existence: {str(e)}")

