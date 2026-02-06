from fastapi import APIRouter, Depends, HTTPException, Request, Path
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy.orm import Session
from typing import Optional
import logging

from app.config.database import get_db
from app.config.config import settings
from app.service.IVF.ivf_service import IVFService
from app.models.IVF.tank_model import Tank
from app.schemas.IVF.ivf_schema import IVFControlTowerResponse, ActiveCanistersResponse, EmbryoTrackingResponse, CanisterCheckResponse
from app.service.IVF.arc_ivf_service import ARCIVFService
from app.schemas.IVF.ivf_schema import IVFControlTowerResponse, ActiveCanistersResponse, EmbryoTrackingResponse
from app.schemas.IVF.arc_ivf_schema import ARCIVFStorageResponse
from app.utils.ivf_helpers import get_branch_filter_info

logger = logging.getLogger(__name__)

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
    Get active tanks grouped by branch for the current logged-in user's branch.
    
    Role-based access:
    - User (IVF): Only see tanks from their assigned branch
    - Manager (IVF): See tanks from all branches
    - Admin: See tanks from all branches
    
    This endpoint returns all active tanks (is_active = True) grouped by branch with:
    - branch_id: The ID of the branch
    - branch_name: The name of the branch
    - tanks: List of tanks for this branch with:
        - tank_code: The tank code (e.g., 'T1')
        - updated_at: Last updated date and time from tanks table updated_at
    
    Response format:
    {
        "branches": [
            {
                "branch_id": 1,
                "branch_name": "Egmore",
                "tanks": [
                    {
                        "tank_code": "T1",
                        "updated_at": "2024-01-15T10:30:00Z"
                    },
                    {
                        "tank_code": "T2",
                        "updated_at": "2024-01-15T09:15:00Z"
                    }
                ]
            }
        ],
        "total": 2
    }
    """
    try:
        # Get branch filter info for IVF department users
        branch_id, role = get_branch_filter_info(request)
        
        service = IVFService(db)
        tanks_data = service.get_active_tanks(branch_id=branch_id)
        return ActiveCanistersResponse(**tanks_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting active tanks: {str(e)}")


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
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error checking tank existence: {str(e)}")
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
        # Get branch filter info for IVF department users
        branch_id, role = get_branch_filter_info(request)
        
        # Get branch name if branch filtering is needed
        branch_name = None
        if branch_id is not None:
            from app.models.IVF.hospital_branch_model import HospitalBranch
            branch = db.query(HospitalBranch).filter(HospitalBranch.branch_id == branch_id).first()
            if branch:
                branch_name = branch.branch_name
        
        service = ARCIVFService()
        # Fetch data from ARC IVF API (TokenId is automatically read from .env)
        result = service.get_ivf_storage()
        
        # Save data to database if API call was successful
        if result.get("status") == "SUCCESS":
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
            BATCH_SIZE = 100  # Commit every 100 items for better performance
            
            # Save each storage item to database
            for idx, storage_item in enumerate(storage_list, 1):
                try:
                    # Save to database (created_by will be None for now, can be enhanced later with auth)
                    save_result = service.save_ivf_storage_to_db(
                        db=db,
                        api_data=storage_item,
                        created_by=None
                    )
                    
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
                
                # Batch commit every BATCH_SIZE items for better performance
                if idx % BATCH_SIZE == 0:
                    try:
                        db.commit()
                        logger.debug(f"Committed batch at item {idx}")
                    except Exception as commit_error:
                        db.rollback()
                        logger.error(f"Error committing batch at item {idx}: {str(commit_error)}")
            
            # Final commit for remaining items
            try:
                db.commit()
                logger.info(f"Final commit completed")
            except Exception as commit_error:
                db.rollback()
                logger.error(f"Error in final commit: {str(commit_error)}")
            
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
    except Exception as e:
        logger.error(f"Error in get_ivf_storage: {str(e)}", exc_info=True)
        # Return failure response format on exception
        return ARCIVFStorageResponse(
            storage_list=[],
            status="FAILURE",
            error_code=500,
            error_message=f"Internal server error: {str(e)}"
        )

