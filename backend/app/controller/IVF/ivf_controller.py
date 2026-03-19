from fastapi import APIRouter, Depends, HTTPException, Request, Path, Query
from sqlalchemy.orm import Session
from typing import Optional
import logging

from app.config.database import get_db
from app.service.IVF.ivf_service import IVFService
from app.models.IVF.tank_model import Tank
from app.models.IVF.hospital_branch_model import HospitalBranch
from app.models.IVF.hospital_model import Hospital
from app.schemas.IVF.ivf_schema import (
    ActiveCanistersResponse,
    BranchListResponse,
    CanisterCheckResponse,
    EmbryoTransferResponse,
    EmbryoTrackingResponse,
    InTransitResponse,
    TankInTransitCheckResponse,
    IVFControlTowerResponse,
)
from app.constants.enums import CanisterStatus
from app.service.IVF.arc_ivf_service import sync_arc_ivf_storage
from app.schemas.IVF.arc_ivf_schema import ARCIVFStorageResponse
from app.utils.ivf_helpers import get_branch_filter_info
from app.utils.user_helpers import is_specific_department

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ivf", tags=["IVF"])


def _get_authenticated_user(request: Request):
    """Return authenticated user from request state or raise 401."""
    if not hasattr(request.state, "current_user"):
        raise HTTPException(status_code=401, detail="User not authenticated")
    return request.state.current_user


def _ensure_ivf_user(request: Request, *, arc_only: bool = False):
    """Validate IVF user access and return authenticated user."""
    user = _get_authenticated_user(request)
    if not is_specific_department(user.department, "IVF"):
        detail = (
            "Access denied: This endpoint is for ARC IVF users only"
            if arc_only
            else "Access denied: This endpoint is for IVF users only"
        )
        raise HTTPException(status_code=403, detail=detail)
    return user


def _resolve_hospital_id(request: Request, db: Session, user) -> int:
    """Resolve hospital_id from request state, user profile, or user's branch."""
    if hasattr(request.state, "hospital_id") and request.state.hospital_id:
        return request.state.hospital_id
    if user.hospital_id:
        return user.hospital_id
    if user.branch_id:
        branch = db.query(HospitalBranch).filter(
            HospitalBranch.branch_id == user.branch_id
        ).first()
        if branch:
            return branch.hospital_id

    raise HTTPException(
        status_code=400,
        detail="Unable to determine hospital. User must be associated with a hospital."
    )


def _ensure_arc_hospital(db: Session, hospital_id: int) -> None:
    """Ensure hospital belongs to ARC group for ARC-specific endpoints."""
    hospital = db.query(Hospital).filter(Hospital.hospital_id == hospital_id).first()
    hospital_name = (hospital.hospital_name or "").strip() if hospital else ""
    if not hospital_name or "arc" not in hospital_name.lower():
        raise HTTPException(
            status_code=403,
            detail="Access denied: This endpoint is only accessible by ARC users"
        )


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
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting IVF control tower map data: {str(e)}")


@router.get("/control_tower/active_canisters", response_model=ActiveCanistersResponse)
def get_active_canisters(
    request: Request,
    db: Session = Depends(get_db),
    branch_name: Optional[str] = Query(None, description="Optional branch name filter"),
    status: Optional[CanisterStatus] = Query(None, description="Optional tank status filter (safe, risk, critical)")
):
    """
    Get active tanks grouped by branch for the current logged-in user's branch.
    
    Role-based access:
    - User (IVF): Only see tanks from their assigned branch
    - Manager (IVF): See tanks from all branches
    - Admin: See tanks from all branches
    
    Optional filters:
    - branch_name: Filter by specific branch name
    - status: Filter by tank status (safe, risk, critical)
    
    This endpoint returns all active tanks (is_active = True) grouped by branch with:
    - branch_id: The ID of the branch
    - branch_name: The name of the branch
    - tanks: List of tanks for this branch with:
        - tank_code: The tank code (e.g., 'T1')
        - updated_at: Last updated date and time from tanks table updated_at
        - status: Tank status (safe, risk, critical)
    
    Response format:
    {
        "branches": [
            {
                "branch_id": 1,
                "branch_name": "Egmore",
                "tanks": [
                    {
                        "tank_code": "T1",
                        "updated_at": "2024-01-15T10:30:00Z",
                        "status": "safe"
                    },
                    {
                        "tank_code": "T2",
                        "updated_at": "2024-01-15T09:15:00Z",
                        "status": "risk"
                    }
                ]
            }
        ],
        "total": 2
    }
    """
    try:
        user = _ensure_ivf_user(request)

        # Normalize optional branch filter once
        normalized_branch_name = branch_name.strip() if branch_name else None

        # Resolve hospital scope (always required to prevent cross-hospital data access)
        hospital_id = _resolve_hospital_id(request, db, user)
        resolved_user_branch = None
        if user.branch_id:
            resolved_user_branch = db.query(HospitalBranch).filter(
                HospitalBranch.branch_id == user.branch_id
            ).first()

        # Get branch filter info for IVF department users
        user_branch_id, role = get_branch_filter_info(request)

        if role is None:
            raise HTTPException(
                status_code=403,
                detail="Access denied: This endpoint is for IVF users only"
            )

        filter_branch_id = None

        if role == "User":
            # User role must always be restricted to own branch
            if user_branch_id is None:
                raise HTTPException(
                    status_code=403,
                    detail="Access denied: User account is not associated with any branch"
                )
            filter_branch_id = user_branch_id

            # If branch_name is explicitly provided by user role, verify it matches their own branch
            if normalized_branch_name is not None:
                # Reuse previously fetched branch when possible to avoid an extra query.
                if (
                    resolved_user_branch is None
                    or resolved_user_branch.branch_id != user_branch_id
                    or resolved_user_branch.hospital_id != hospital_id
                ):
                    resolved_user_branch = db.query(HospitalBranch).filter(
                        HospitalBranch.branch_id == user_branch_id,
                        HospitalBranch.hospital_id == hospital_id
                    ).first()
                if not resolved_user_branch:
                    raise HTTPException(
                        status_code=403,
                        detail="Access denied: Assigned branch not found in your hospital"
                    )
                if normalized_branch_name.lower() != (resolved_user_branch.branch_name or "").strip().lower():
                    raise HTTPException(
                        status_code=403,
                        detail=f"Access denied: You can only view tanks from your assigned branch ({resolved_user_branch.branch_name})"
                    )
        elif normalized_branch_name is not None:
            # Manager/Admin can filter by branch, but only within their hospital
            selected_branch = db.query(HospitalBranch).filter(
                HospitalBranch.branch_name == normalized_branch_name,
                HospitalBranch.hospital_id == hospital_id
            ).first()
            if not selected_branch:
                raise HTTPException(
                    status_code=404,
                    detail=f"Branch '{normalized_branch_name}' not found in your hospital"
                )
            filter_branch_id = selected_branch.branch_id

        service = IVFService(db)
        tanks_data = service.get_active_tanks(
            hospital_id=hospital_id,
            branch_id=filter_branch_id,
            status=status
        )
        return ActiveCanistersResponse(**tanks_data)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting active tanks: {str(e)}")


@router.get("/embryo_tracking/filters")
def get_embryo_tracking_filters(
    request: Request,
    branch_name: Optional[str] = Query(None, description="Current branch/site filter (counts conditioned on this)"),
    status: Optional[str] = Query(None, description="Current status filter (counts conditioned on this)"),
    crylock_color: Optional[str] = Query(None, description="Current cryolock color filter"),
    goblet_color: Optional[str] = Query(None, description="Current goblet color filter"),
    db: Session = Depends(get_db),
):
    """
    Get distinct filter values and counts. Pass current filter values to get counts conditioned on them
    (e.g. when Site Name is selected, other dropdowns show counts within that site).
    """
    try:
        branch_id, _ = get_branch_filter_info(request)
        hospital_id = getattr(request.state.current_user, "hospital_id", None)
        service = IVFService(db)
        return service.get_embryo_tracking_filters(
            branch_id=branch_id,
            hospital_id=hospital_id,
            branch_name=branch_name,
            status=status,
            crylock_color=crylock_color,
            goblet_color=goblet_color,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get(
    "/embryo_tracking",
    response_model=EmbryoTrackingResponse,
    response_model_exclude_none=True
)
def get_embryo_tracking(
    request: Request,
    branch_name: Optional[str] = Query(None, description="Optional branch/site name filter"),
    status: Optional[str] = Query(None, description="Optional tracking status filter (e.g., internal, in transit)"),
    cryolock_color: Optional[str] = Query(None, description="Optional cryolock color filter"),
    goblet_color: Optional[str] = Query(None, description="Optional goblet color filter"),
    offset: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(50, ge=1, le=200, description="Number of records to fetch"),
    db: Session = Depends(get_db)
):
    """
    Get embryo tracking data grouped by cryolock.
    
    Role-based access and field visibility:
    - User: Only see data from their assigned branch. Includes embryo_grading, excludes site_name and status.
    - Manager: See data from all branches. Includes site_name and status, excludes embryo_grading.
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
    
    Optional filters:
    - branch_name: Filter records by branch/site name
    - status: Filter by tracking status
    - cryolock_color: Filter by cryolock color
    - goblet_color: Filter by goblet color
    
    Lazy loading:
    - Use offset/limit for infinite scrolling
    - Response returns has_more and next_offset
    
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

        # User role must always be scoped to an assigned branch.
        if role == "User" and branch_id is None:
            raise HTTPException(
                status_code=403,
                detail="Access denied: User account is not associated with any branch"
            )
        
        hospital_id = getattr(request.state.current_user, "hospital_id", None)
        service = IVFService(db)
        tracking_data = service.get_embryo_tracking(
            branch_id=branch_id,
            hospital_id=hospital_id,
            user_role=role,
            branch_name=branch_name,
            status=status,
            cryolock_color=cryolock_color,
            goblet_color=goblet_color,
            offset=offset,
            limit=limit
        )
        return EmbryoTrackingResponse(**tracking_data)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting embryo tracking data: {str(e)}")


@router.get("/canisters/{tank_code}/check", response_model=CanisterCheckResponse)
def check_tank_exists(
    tank_code: str = Path(..., description="Tank code to check (e.g., 'T1')"),
    branch_id: Optional[int] = Query(None, description="Optional branch ID to filter tanks by branch"),
    request: Request = None,
    db: Session = Depends(get_db)
):
    """
    Check if a tank exists in the system by tank code.
    
    When branch_id query param is provided, the query filters by that branch directly
    (ignoring role-based branch resolution). Otherwise falls back to JWT-derived branch
    for regular users.
    """
    try:
        current_role = None
        if request is not None:
            _, current_role = get_branch_filter_info(request) if request else (None, None)

        # Admin/Manager: not restricted to JWT branch, but honor explicit branch_id filter if provided.
        # User: keep branch scoping, preferring explicit branch_id when provided.
        if current_role in ("Admin", "Manager"):
            effective_branch_id = branch_id
        else:
            effective_branch_id = branch_id
            if effective_branch_id is None:
                jwt_branch_id, _ = get_branch_filter_info(request) if request else (None, None)
                effective_branch_id = jwt_branch_id
        
        query = db.query(Tank).filter(Tank.tank_code == tank_code)
        
        if effective_branch_id is not None:
            query = query.filter(Tank.branch_id == effective_branch_id)
        
        tank = query.first()
        
        if tank:
            return CanisterCheckResponse(
                exists=True,
                canister_number=tank_code,  # Tank code stored in canister_number field for backward compatibility
                canister_id=tank.tank_id,  # Tank ID stored in canister_id field for backward compatibility
                is_active=tank.is_active,
                canister_status=tank.status.value if tank.status else None,  # Tank status
                message=f"Tank {tank_code} exists and is {'active' if tank.is_active else 'inactive'}"
            )
        else:
            return CanisterCheckResponse(
                exists=False,
                canister_number=tank_code,
                canister_id=None,
                is_active=None,
                canister_status=None,
                message=f"Tank {tank_code} does not exist" + (
                    f" in your branch" if effective_branch_id is not None and current_role not in ("Admin", "Manager") else ""
                )
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error checking tank existence: {str(e)}")


@router.get("/canisters/in-transit-check", response_model=TankInTransitCheckResponse)
def check_tank_in_transit_status(
    his_number: Optional[str] = Query(
        None,
        description="Optional HIS number to check shipment availability."
    ),
    cryolock_number: Optional[str] = Query(
        None,
        description="Optional Cryolock number to check shipment availability."
    ),
    request: Request = None,
    db: Session = Depends(get_db)
):
    """
    Check whether a HIS/Cryolock identifier has shipment records.

    Role-based access:
    - User (IVF): Can check only their own branch/location records.
    - Manager (IVF): Can view records across branches in their hospital.
    - Admin: Can check records across branches.
    """
    try:
        user = _ensure_ivf_user(request)
        hospital_id = _resolve_hospital_id(request, db, user)

        role = user.role.value if hasattr(user.role, "value") else str(user.role)
        service = IVFService(db)
        result = service.check_tank_in_transit_status(
            user_role=role,
            user_branch_id=user.branch_id,
            hospital_id=hospital_id,
            his_number=his_number,
            cryolock_number=cryolock_number
        )
        return TankInTransitCheckResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error checking tank in-transit status: {str(e)}")


@router.get("/storage", response_model=ARCIVFStorageResponse)
def get_ivf_storage(
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Fetch IVF storage information from ARC IVF external API.
    
    This endpoint calls the ARC IVF Storage API to retrieve all storage information
    using a TokenId for authentication. The TokenId is automatically read from the 
    ARC_API_TOKEN (or ARC_IVF_TOKEN_ID) environment variable in your .env file.
    
    **No Input Parameters Required:**
    The TokenId is automatically retrieved from the ARC_API_TOKEN environment variable.
    
    **Response Fields:**
    - storageList: List of storage items, each containing:
        - hisNumber: Patient Hospital ID
        - cryolockNumber: Format T10/C2/B14/1 (Tank/Canister/Location/Cryolock Serial)
        - canisterNumber: Canister Number
        - tankID: Tank Unique ID
        - caneID: Cane Unique ID
        - dateofVitrification: Date of OCR
        - siteName: Branch Name
        - totalNumberofEmbryos: Total Embryos for the branch
        - totalNumberofContainers: Total Cryolocks for the branch
    - status: API call status (SUCCESS/FAILURE)
    - errorCode: API call status code
    
    **Example Request:**
    ```
    GET /api/ivf/storage
    ```
    
    **Note:** Make sure ARC_API_TOKEN (or ARC_IVF_TOKEN_ID) is set in your .env file.
    
    **Example Success Response:**
    ```json
    {
        "storageList": [
            {
                "hisNumber": "3222044212F",
                "cryolockNumber": "T1/C1/A11/2",
                "canisterNumber": "C1",
                "tankID": "6216",
                "caneID": "6216",
                "dateofVitrification": "2023-03-11",
                "siteName": "Tambaram",
                "totalNumberofEmbryos": "640",
                "totalNumberofContainers": "384"
            }
        ],
        "status": "SUCCESS",
        "errorCode": 200
    }
    ```
    
    **Example Failure Response:**
    ```json
    {
        "storageList": [],
        "status": "FAILURE",
        "errorCode": 412
    }
    ```
    """
    try:
        user = _ensure_ivf_user(request, arc_only=True)
        hospital_id = _resolve_hospital_id(request, db, user)
        _ensure_arc_hospital(db, hospital_id)
        result = sync_arc_ivf_storage(db=db, created_by=None)
        return ARCIVFStorageResponse(**result)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in get_ivf_storage: {str(e)}", exc_info=True)
        # Return failure response format on exception
        return ARCIVFStorageResponse(
            storage_list=[],
            status="FAILURE",
            error_code=500,
            error_message=f"Internal server error: {str(e)}"
        )


@router.get("/branches", response_model=BranchListResponse)
def get_branches(
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Get list of branches for the logged-in IVF user's hospital.
    
    Returns branch_id and branch_name for all branches belonging to the user's hospital.
    This endpoint is useful for dropdowns/selectors in the frontend.
    
    Role-based access:
    - All IVF users (User, Manager, Admin): Can see all branches in their hospital
    - Non-IVF users: Cannot access this endpoint
    
    Response format:
    {
        "branches": [
            {
                "branch_id": 1,
                "branch_name": "Egmore"
            },
            {
                "branch_id": 2,
                "branch_name": "Tambaram"
            }
        ],
        "total": 2
    }
    """
    try:
        user = _ensure_ivf_user(request)
        hospital_id = _resolve_hospital_id(request, db, user)
        
        # Use service to get branches
        service = IVFService(db)
        branches_data = service.get_branches_by_hospital(hospital_id)
        
        return BranchListResponse(**branches_data)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting branches: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error getting branches: {str(e)}")


@router.get("/embryo-transfer", response_model=EmbryoTransferResponse)
def get_embryo_transfer_crylocks(
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Get all crylocks where embryo_transfer is True.
    
    Returns detailed information about all crylocks that have been moved to embryo transfer.
    This endpoint is useful for tracking and reporting on embryo transfers.
    
    Role-based access:
    - User (IVF): Only see crylocks from their assigned branch
    - Manager (IVF): See crylocks from all branches in their hospital
    - Admin: See crylocks from all branches
    
    Response format:
    {
        "data": [
            {
                "his_number": "HIS-10234",
                "cryolock_number": "T1/C1/A11/2",
                "canister_number": "C1",
                "tank_code": "T1",
                "cane_code": "A11",
                "goblet_color": "Yellow",
                "cryolock_color": "Blue",
                "date_of_vitrification": "2024-08-12",
                "branch_name": "Egmore",
                "tank_id": 1
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
        crylocks_data = service.get_embryo_transfer_crylocks(branch_id=branch_id)
        
        return EmbryoTransferResponse(**crylocks_data)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting embryo transfer crylocks: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error getting embryo transfer crylocks: {str(e)}")


@router.get("/in-transit", response_model=InTransitResponse)
def get_in_transit_crylocks(
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Get all crylocks where in_transit is True.
    
    Returns detailed information about all crylocks that are currently in transit.
    This endpoint is useful for tracking and reporting on shipments.
    
    Role-based access:
    - User (IVF): Only see crylocks from their assigned branch
    - Manager (IVF): See crylocks from all branches in their hospital
    - Admin: See crylocks from all branches
    
    Response format:
    {
        "data": [
            {
                "his_number": "HIS-10234",
                "cryolock_number": "T1/C1/A11/2",
                "canister_number": "C1",
                "tank_code": "T1",
                "cane_code": "A11",
                "goblet_color": "Yellow",
                "cryolock_color": "Blue",
                "date_of_vitrification": "2024-08-12",
                "branch_name": "Egmore",
                "tank_id": 1,
                "shipment_details": {
                    "shipment_id": "SHIP-20240812-123",
                    "iot_shipment_id": "tive-12345",
                    "source_branch_id": 1,
                    "destination_branch_id": 2,
                    "source_location": "Egmore",
                    "destination_location": "Tambaram",
                    "description": "crylock is move from egmore to thambaram-deviceid -xxxxx",
                    "device_id": "DEVICE-123",
                    "shipment_status": "in_transit",
                    "departure_time": "2024-08-12T10:00:00Z",
                    "arrival_time": null,
                    "scheduled_departure_time": "2024-08-12T09:00:00Z"
                }
            },
            ...
        ],
        "total": 10
    }
    """
    try:
        # Validate authenticated IVF user and derive hospital scope where needed
        user = _ensure_ivf_user(request)
        hospital_id = _resolve_hospital_id(request, db, user)

        # Get branch filter info for IVF department users
        branch_id, role = get_branch_filter_info(request)
        
        service = IVFService(db)
        crylocks_data = service.get_in_transit_crylocks(
            branch_id=branch_id,
            role=role,
            hospital_id=hospital_id
        )
        
        return InTransitResponse(**crylocks_data)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting in-transit crylocks: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error getting in-transit crylocks: {str(e)}")
