from fastapi import APIRouter, Depends, HTTPException, Request, Path, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from sqlalchemy.exc import OperationalError
from typing import Optional
import logging
import time

from app.config.database import get_db
from app.config.config import settings
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
from app.service.IVF.arc_ivf_service import ARCIVFService
from app.schemas.IVF.arc_ivf_schema import ARCIVFStorageResponse
from app.utils.ivf_helpers import get_branch_filter_info
from app.utils.user_helpers import is_specific_department

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ivf", tags=["IVF"])
ARC_IVF_STORAGE_SYNC_LOCK_KEY = 78430219


def _is_deadlock_error(exc: Exception) -> bool:
    """Detect PostgreSQL deadlock errors even when wrapped."""
    current = exc
    visited = 0
    while current is not None and visited < 5:
        if isinstance(current, OperationalError):
            original = getattr(current, "orig", None)
            pgcode = getattr(original, "pgcode", None)
            if pgcode == "40P01":
                return True
        if "deadlock detected" in str(current).lower():
            return True
        current = getattr(current, "__cause__", None) or getattr(current, "__context__", None)
        visited += 1
    return False


def _try_acquire_arc_sync_lock(db: Session):
    """
    Acquire a PostgreSQL advisory lock on a dedicated connection.
    Returns the lock connection when acquired, otherwise None.
    """
    lock_conn = db.get_bind().connect()
    lock_acquired = lock_conn.execute(
        text("SELECT pg_try_advisory_lock(:lock_key)"),
        {"lock_key": ARC_IVF_STORAGE_SYNC_LOCK_KEY}
    ).scalar()
    if lock_acquired:
        return lock_conn
    lock_conn.close()
    return None


def _release_arc_sync_lock(lock_conn) -> None:
    """Release the advisory lock and close the dedicated connection."""
    if not lock_conn:
        return
    try:
        lock_conn.execute(
            text("SELECT pg_advisory_unlock(:lock_key)"),
            {"lock_key": ARC_IVF_STORAGE_SYNC_LOCK_KEY}
        )
    except Exception as unlock_err:
        logger.warning(f"Failed to release ARC sync advisory lock cleanly: {unlock_err}")
    finally:
        lock_conn.close()


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


@router.get("/embryo_tracking", response_model=EmbryoTrackingResponse)
def get_embryo_tracking(
    request: Request,
    branch_name: Optional[str] = Query(None, description="Optional branch/site name filter"),
    status: Optional[str] = Query(None, description="Optional shipment status filter"),
    cryolock_color: Optional[str] = Query(None, description="Optional cryolock color filter"),
    goblet_color: Optional[str] = Query(None, description="Optional goblet color filter"),
    offset: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(100, ge=1, le=200, description="Number of records to fetch"),
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
    - status: Filter by shipment status
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
        
        service = IVFService(db)
        tracking_data = service.get_embryo_tracking(
            branch_id=branch_id,
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
    request: Request = None,
    db: Session = Depends(get_db)
):
    """
    Check if a tank exists in the system by tank code for the current logged-in user's branch.
    
    This endpoint allows users to verify if a tank code exists before performing operations.
    Role-based access:
    - User (IVF): Only see tanks from their assigned branch
    - Manager (IVF): See tanks from all branches
    - Admin: See tanks from all branches
    
    Path Parameters:
    - tank_code: Tank code to check (e.g., 'T1')
    
    Response:
    - exists: Boolean indicating if the tank exists
    - canister_number: The tank code that was checked (kept as canister_number for backward compatibility)
    - canister_id: Tank ID if exists (null if not found) - kept as canister_id for backward compatibility
    - is_active: Whether the tank is active (null if not found)
    - canister_status: Always null for tanks (kept for backward compatibility)
    - message: Descriptive message about the result
    
    Example Response (exists):
    {
        "exists": true,
        "canister_number": "T1",
        "canister_id": 1,
        "is_active": true,
        "canister_status": null,
        "message": "Tank T1 exists and is active"
    }
    
    Example Response (not exists):
    {
        "exists": false,
        "canister_number": "T999",
        "canister_id": null,
        "is_active": null,
        "canister_status": null,
        "message": "Tank T999 does not exist"
    }
    """
    try:
        # Get branch filter info for IVF department users
        branch_id, role = get_branch_filter_info(request) if request else (None, None)
        
        # Query tank by tank_code
        query = db.query(Tank).filter(Tank.tank_code == tank_code)
        
        # Apply branch filter if provided (User role only)
        if branch_id is not None:
            query = query.filter(Tank.branch_id == branch_id)
        
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
                message=f"Tank {tank_code} does not exist" + (f" in your branch" if branch_id is not None else "")
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error checking tank existence: {str(e)}")


@router.get("/canisters/{tank_code}/in-transit-check", response_model=TankInTransitCheckResponse)
def check_tank_in_transit_status(
    tank_code: str = Path(..., description="Tank code to check (e.g., 'T15')"),
    branch_id: Optional[int] = Query(
        None,
        description="Optional branch ID override (Manager/Admin). User role always uses their own branch."
    ),
    request: Request = None,
    db: Session = Depends(get_db)
):
    """
    Check whether a tank has any in-transit shipment records.

    Role-based access:
    - User (IVF): Can check only their own branch tanks (branch_id override ignored).
    - Manager (IVF): Can select a branch via branch_id (or defaults to their own branch).
    - Admin: Can check tanks across branches; provide branch_id when same tank code exists in multiple branches.
    """
    try:
        user = _ensure_ivf_user(request)
        hospital_id = _resolve_hospital_id(request, db, user)

        role = user.role.value if hasattr(user.role, "value") else str(user.role)
        service = IVFService(db)
        result = service.check_tank_in_transit_status(
            tank_code=tank_code,
            user_role=role,
            user_branch_id=user.branch_id,
            hospital_id=hospital_id,
            selected_branch_id=branch_id
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
        
        service = ARCIVFService()
        # Fetch data from ARC IVF API (TokenId is automatically read from .env)
        result = service.get_ivf_storage()
        
        # Save data to database if API call was successful
        lock_conn = None
        if result.get("status") == "SUCCESS":
            # Prevent concurrent ARC storage sync runs that can deadlock on tanks updates.
            lock_conn = _try_acquire_arc_sync_lock(db)
            if not lock_conn:
                logger.warning("Skipping ARC IVF sync because another sync is already running")
                return ARCIVFStorageResponse(
                    storage_list=[],
                    status="FAILURE",
                    error_code=409,
                    error_message="ARC IVF sync already in progress. Please retry shortly."
                )

            storage_list = result.get("storageList", [])
            
            # IMPORTANT: Save ALL data from ARC API to database (for all branches)
            # Don't filter before saving - we want to persist all branch data
            logger.info(f"Fetched {len(storage_list)} items from ARC API - saving ALL to database for all branches")
            
            # Count unique patients, tanks, canisters, canes, and cryolocks
            unique_patients = set()
            unique_tanks = set()
            unique_canisters = set()
            unique_canes = set()
            unique_cryolocks = set()
            
            # Save ALL items to database (for all branches)
            for storage_item in storage_list:
                if storage_item.get("hisNumber"):
                    unique_patients.add(storage_item.get("hisNumber"))
                if storage_item.get("tankID"):
                    unique_tanks.add(storage_item.get("tankID"))
                if storage_item.get("canisterNumber"):
                    unique_canisters.add(storage_item.get("canisterNumber"))
                if storage_item.get("caneID"):
                    unique_canes.add(storage_item.get("caneID"))
                if storage_item.get("cryolockNumber"):
                    unique_cryolocks.add(storage_item.get("cryolockNumber"))
            
            logger.info(
                f"Storage data statistics: "
                f"Total items: {len(storage_list)}, "
                f"Unique patients: {len(unique_patients)}, "
                f"Unique tanks: {len(unique_tanks)}, "
                f"Unique canisters: {len(unique_canisters)}, "
                f"Unique canes: {len(unique_canes)}, "
                f"Unique cryolocks: {len(unique_cryolocks)}"
            )
            
            saved_count = 0
            failed_count = 0
            skipped_count = 0
            failed_items = []  # Track failed items with details
            max_deadlock_retries = 3
            initial_retry_delay = 0.1
            max_retry_delay = 1.0
            
            # Save each storage item to database
            for idx, storage_item in enumerate(storage_list, 1):
                item_retries = 0
                retry_delay = initial_retry_delay
                item_saved = False
                while item_retries <= max_deadlock_retries and not item_saved:
                    try:
                        # Save to database (created_by will be None for now, can be enhanced later with auth)
                        save_result = service.save_ivf_storage_to_db(
                            db=db,
                            api_data=storage_item,
                            created_by=None,
                            rollback_on_error=False
                        )
                        db.commit()
                        item_saved = True

                        # Check if record was skipped (e.g., invalid cryolock position)
                        if save_result.get("status") == "SKIPPED":
                            skipped_count += 1
                            # Log skipped records at debug level (not error)
                            logger.debug(
                                f"Skipped ARC IVF data item {idx}/{len(storage_list)} "
                                f"(HIS={storage_item.get('hisNumber')}, Site={storage_item.get('siteName')}, "
                                f"Cryolock={storage_item.get('cryolockNumber')}): {save_result.get('message')}"
                            )
                        else:
                            saved_count += 1

                        # Log progress every 100 items or at milestones
                        if idx % 100 == 0 or idx == len(storage_list):
                            logger.info(f"Progress: {idx}/{len(storage_list)} items processed ({saved_count} saved, {skipped_count} skipped, {failed_count} failed)")
                        elif idx % 10 == 0:
                            # Less verbose logging every 10 items
                            logger.debug(f"Processing item {idx}/{len(storage_list)}")
                    except Exception as save_error:
                        db.rollback()
                        if _is_deadlock_error(save_error) and item_retries < max_deadlock_retries:
                            item_retries += 1
                            logger.warning(
                                f"Deadlock while saving ARC IVF item {idx}/{len(storage_list)} "
                                f"(HIS={storage_item.get('hisNumber')}, Site={storage_item.get('siteName')}, "
                                f"Cryolock={storage_item.get('cryolockNumber')}). "
                                f"Retrying {item_retries}/{max_deadlock_retries} after {retry_delay:.2f}s"
                            )
                            time.sleep(retry_delay)
                            retry_delay = min(retry_delay * 2, max_retry_delay)
                            continue

                        failed_count += 1
                        error_type = type(save_error).__name__
                        error_message = str(save_error)

                        # Track failed item details
                        failed_item = {
                            "index": idx,
                            "hisNumber": storage_item.get('hisNumber'),
                            "siteName": storage_item.get('siteName'),
                            "cryolockNumber": storage_item.get('cryolockNumber'),
                            "canisterNumber": storage_item.get('canisterNumber'),
                            "tankID": storage_item.get('tankID'),
                            "caneID": storage_item.get('caneID'),
                            "error_type": error_type,
                            "error_message": error_message
                        }
                        failed_items.append(failed_item)

                        # Log the error but don't fail the API response
                        logger.error(
                            f"Failed to save ARC IVF data item {idx}/{len(storage_list)} "
                            f"(HIS={storage_item.get('hisNumber')}, Site={storage_item.get('siteName')}, "
                            f"Cryolock={storage_item.get('cryolockNumber')}): "
                            f"[{error_type}] {error_message}",
                            exc_info=True
                        )
                        break
            
            logger.info(f"Database save summary: {saved_count} saved, {skipped_count} skipped, {failed_count} failed out of {len(storage_list)} total items")
            
            # Log failure analysis if there are failures
            if failed_count > 0:
                # Group failures by error type
                error_types = {}
                for item in failed_items:
                    error_type = item['error_type']
                    if error_type not in error_types:
                        error_types[error_type] = []
                    error_types[error_type].append(item)
                
                logger.warning(f"Failure Analysis:")
                logger.warning(f"  Total failures: {failed_count}")
                for error_type, items in error_types.items():
                    logger.warning(f"  {error_type}: {len(items)} failures")
                    # Log first 5 examples of each error type
                    for item in items[:5]:
                        logger.warning(
                            f"    - Item {item['index']}: HIS={item['hisNumber']}, "
                            f"Site={item['siteName']}, Cryolock={item['cryolockNumber']}, "
                            f"Error: {item['error_message'][:100]}"
                        )
                    if len(items) > 5:
                        logger.warning(f"    ... and {len(items) - 5} more {error_type} errors")
                
                # Check for common failure patterns
                missing_position = [item for item in failed_items if 'position' in item['error_message'].lower() or 'extract' in item['error_message'].lower()]
                missing_fields = [item for item in failed_items if 'missing' in item['error_message'].lower() or 'required' in item['error_message'].lower()]
                constraint_violations = [item for item in failed_items if 'unique' in item['error_message'].lower() or 'constraint' in item['error_message'].lower()]
                
                if missing_position:
                    logger.warning(f"  Pattern: {len(missing_position)} failures due to position extraction issues")
                if missing_fields:
                    logger.warning(f"  Pattern: {len(missing_fields)} failures due to missing required fields")
                if constraint_violations:
                    logger.warning(f"  Pattern: {len(constraint_violations)} failures due to database constraint violations")
            
            # Calculate statistics about saved data
            branches_from_arc = set()
            for item in result.get("storageList", []):
                site_name = item.get("siteName")
                if site_name:
                    branches_from_arc.add(site_name.strip())
            
            logger.info(
                f"ARC Data Summary: "
                f"Total records from ARC: {len(result.get('storageList', []))}, "
                f"Total branches from ARC: {len(branches_from_arc)}, "
                f"Branches: {', '.join(sorted(branches_from_arc))}, "
                f"Saved to DB: {saved_count}, "
                f"Skipped: {skipped_count}, "
                f"Failed: {failed_count}"
            )
        
        # Return all ARC data in response (no filtering)
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
    finally:
        _release_arc_sync_lock(locals().get("lock_conn"))


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

