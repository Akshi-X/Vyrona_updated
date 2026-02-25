"""
Quality Tracking Controller
Handles HTTP requests for quality tracking operations including LN2 refill logs
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, Query, Path, Request, Response
from sqlalchemy.orm import Session
from typing import Optional

from app.config.database import get_db
from app.dependencies.auth_dependencies import get_current_user
from app.exceptions.custom_exceptions import AppException
from app.models.user_model import User
from app.service.IVF.quality_tracking_service import QualityTrackingService
from app.schemas.IVF.quality_tracking_schema import (
    RefillLogCreate,
    RefillLogStatusUpdate,
    RefillLogResponse,
    RefillLogListResponse,
    IVFCanisterTrackingResponse,
    GobletColorUpdate,
    CryolockColorUpdate,
    ColorUpdateResponse,
    CryolockFlagUpdate,
    CryolockFlagUpdateResponse,
    InTransitWithShipmentRequest,
    InTransitWithShipmentResponse
)
from app.constants.enums import TaskStatus
from app.utils.ivf_helpers import get_branch_filter_info

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/quality-tracking",
    tags=["IVF Quality Tracking"]
)


@router.post("/tanks/{tank_code}/refill-logs", response_model=RefillLogResponse, status_code=201)
def create_refill_log(
    tank_code: str = Path(..., description="Tank code from URL (e.g., 'T1', 'T10')"),
    canister_number: Optional[str] = Query(None, description="Optional canister number (e.g., 'C1'). If not provided, uses first canister in tank."),
    branch_id_override: Optional[int] = Query(None, description="Optional branch ID override (Managers only)"),
    refill_log_data: RefillLogCreate = ...,
    request: Request = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Create a new Liquid Nitrogen (LN2) refill log entry for a canister in a specific tank.
    
    Tank ID is automatically obtained from the URL path.
    If canister_number is not provided, uses the first canister in the tank.
    
    Request Body Fields:
    - Refill Date: Date when refill was performed
    - Refill Time: Time when refill was performed
    - Refilled By: Name of person who performed the refill
    - Description: Optional description or notes
    - Status: Status of the refill log (default: Not started)
    """
    try:
        quality_tracking_service = QualityTrackingService(db)
        branch_id, _ = get_branch_filter_info(request, branch_id_override=branch_id_override, is_quality_tracking=True) if request else (None, None)
        tank_id = quality_tracking_service.resolve_tank_id(
            tank_code=tank_code,
            branch_id=branch_id
        )
        return quality_tracking_service.create_refill_log_for_tank(
            tank_id=tank_id,
            canister_number=canister_number,
            refill_log_data=refill_log_data,
            created_by=current_user.email if current_user else None,
            branch_id=branch_id
        )
    except Exception as e:
        logger.error(f"Error in create_refill_log endpoint: {str(e)}", exc_info=True)
        raise


@router.get("/tanks/{tank_code}/refill-logs", response_model=RefillLogListResponse)
def get_refill_logs_by_container(
    tank_code: str = Path(..., description="Tank code from URL (e.g., 'T1', 'T10')"),
    canister_number: Optional[str] = Query(None, description="Optional canister number (e.g., 'C1'). If not provided, returns logs for all canisters in tank."),
    status: Optional[str] = Query(None, description="Filter by status (Done, In progress, Not started)"),
    limit: Optional[int] = Query(None, ge=1, le=1000, description="Limit number of results"),
    branch_id_override: Optional[int] = Query(None, description="Optional branch ID override (Managers only)"),
    request: Request = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Fetch Liquid Nitrogen (LN2) refill logs for canisters in a specific tank.
    
    Tank ID is automatically obtained from the URL path.
    If canister_number is not provided, returns logs for all canisters in the tank.
    
    Supports filtering by:
    - Canister Number: Filter by specific canister (optional)
    - Status: Filter by status (Done, In progress, Not started)
    - Limit: Limit the number of results returned
    
    Returns list of refill logs ordered by most recent first.
    """
    try:
        # Validate status if provided
        if status:
            try:
                TaskStatus(status)  # Validate enum value
            except ValueError:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid status value. Must be one of: {', '.join([s.value for s in TaskStatus])}"
                )
        
        branch_id, _ = get_branch_filter_info(request, branch_id_override=branch_id_override, is_quality_tracking=True) if request else (None, None)
        quality_tracking_service = QualityTrackingService(db)
        tank_id = quality_tracking_service.resolve_tank_id(
            tank_code=tank_code,
            branch_id=branch_id
        )
        return quality_tracking_service.get_refill_logs_for_tank(
            tank_id=tank_id,
            canister_number=canister_number,
            status=status,
            limit=limit,
            branch_id=branch_id
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in get_refill_logs_by_container endpoint: {str(e)}", exc_info=True)
        raise


@router.patch("/tanks/{tank_code}/refill-logs/{log_id}/status", response_model=RefillLogResponse)
def update_refill_log_status(
    tank_code: str = Path(..., description="Tank code from URL (e.g., 'T1', 'T10')"),
    log_id: int = Path(..., description="Refill log ID"),
    branch_id_override: Optional[int] = Query(None, description="Optional branch ID override (Managers only)"),
    status_update: RefillLogStatusUpdate = ...,
    request: Request = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Update only the status of a refill log. The log_id uniquely identifies the log.
    """
    try:
        branch_id, _ = get_branch_filter_info(request, branch_id_override=branch_id_override, is_quality_tracking=True) if request else (None, None)
        quality_tracking_service = QualityTrackingService(db)
        tank_id = quality_tracking_service.resolve_tank_id(
            tank_code=tank_code,
            branch_id=branch_id
        )
        return quality_tracking_service.update_refill_log_status_for_tank(
            tank_id=tank_id,
            log_id=log_id,
            status_update=status_update,
            updated_by=current_user.email if current_user else None,
            branch_id=branch_id
        )
    except Exception as e:
        logger.error(f"Error in update_refill_log_status endpoint: {str(e)}", exc_info=True)
        raise


@router.get("/tanks/{tank_code}/tracking-details", response_model=IVFCanisterTrackingResponse)
def get_canister_tracking_details(
    tank_code: str = Path(..., description="Tank code from URL (e.g., 'T1', 'T2') - represents Tank Number from ARC API format"),
    branch_id_override: Optional[int] = Query(None, description="Optional branch ID override (Managers only)"),
    request: Request = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Fetch tracking details for all canisters in a specific tank.
    
    Returns a table with the following columns:
    - HIS # (PK): Patient HIS Number
    - Cryolock #: Cryolock number
    - Canister #: Canister number
    - Tank Code: Tank code (e.g., T1, T2) - represents Tank Number from ARC API format: Tank Number / Canister Number / Location / Cryolock Serial Number
    - Cane ID: Cane identifier (formatted)
    - Goblet Color: Goblet color
    - Cryolock Color: Cryolock color
    - Date of Vitrification: Date when vitrification was performed
    - Move to: Indicates if item can be moved (UI action button)
    
    Filters by the logged-in user's branch (e.g., Tambaram) for role-based access control.
    Returns tracking details for all canisters within the specified tank.
    """
    try:
        branch_id, role = get_branch_filter_info(request, branch_id_override=branch_id_override, is_quality_tracking=True) if request else (None, None)
        user_role = current_user.role.value if current_user.role else None
        # Manager/Admin: no branch restriction — pass branch_id=None so they can view any tank
        effective_branch_id = None if (role in ("Manager", "Admin")) else branch_id
        quality_tracking_service = QualityTrackingService(db)
        return quality_tracking_service.get_tank_tracking_details(
            tank_code=tank_code,
            branch_id=effective_branch_id,
            user_role=user_role
        )
    except HTTPException:
        raise
    except Exception as e:
        if isinstance(e, AppException):
            raise HTTPException(status_code=e.status_code, detail=e.message)
        logger.error(f"Error in get_canister_tracking_details endpoint: {str(e)}", exc_info=True)
        raise


@router.patch("/tanks/{tank_code}/goblet-color", response_model=ColorUpdateResponse)
def update_goblet_color(
    tank_code: str = Path(..., description="Tank code from URL (e.g., 'T1', 'T10')"),
    branch_id_override: Optional[int] = Query(None, description="Optional branch ID override (Managers only)"),
    color_update: GobletColorUpdate = ...,
    request: Request = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Update goblet color for a specific cryolock within a tank.
    
    Use this endpoint to update the goblet color from the tracking table.
    The goblet color is stored in the 'cryolocks' table.
    
    WHERE TO GET cryolock_number:
    - Use the "cryolock_number" field value directly from the tracking details response
    - Example: "T1/C1/A11/2", "CL-01", etc.
    
    Request Body:
    - cryolock_number: Cryolock number from the tracking details response (e.g., "T1/C1/A11/2")
    - goblet_color: The goblet color value to set (e.g., "Yellow", "Red", "Blue")
    
    Example Request:
    {
        "cryolock_number": "T1/C1/A11/2",
        "goblet_color": "Yellow"
    }
    """
    try:
        branch_id, _ = get_branch_filter_info(request, branch_id_override=branch_id_override, is_quality_tracking=True) if request else (None, None)
        quality_tracking_service = QualityTrackingService(db)
        tank_id = quality_tracking_service.resolve_tank_id(
            tank_code=tank_code,
            branch_id=branch_id
        )
        return quality_tracking_service.update_goblet_color_for_tank(
            tank_id=tank_id,
            color_update=color_update,
            updated_by=current_user.email if current_user else None,
            branch_id=branch_id,
            tank_code=tank_code
        )
    except Exception as e:
        logger.error(f"Error in update_goblet_color endpoint: {str(e)}", exc_info=True)
        raise


@router.patch("/tanks/{tank_code}/cryolock-color", response_model=ColorUpdateResponse)
def update_cryolock_color(
    tank_code: str = Path(..., description="Tank code from URL (e.g., 'T1', 'T10')"),
    branch_id_override: Optional[int] = Query(None, description="Optional branch ID override (Managers only)"),
    color_update: CryolockColorUpdate = ...,
    request: Request = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Update cryolock color for a specific cryolock within a tank.
    
    Use this endpoint to update the cryolock color from the tracking table.
    The cryolock color is stored in the 'cryolocks' table.
    
    WHERE TO GET cryolock_number:
    - Use the "Cryolock Num" column value directly from the table row
    - Example: "CL-01", "T1/C1/A11/2"
    
    Request Body:
    - cryolock_number: Cryolock number from the tracking details (e.g., "CL-01", "T1/C1/A11/2")
    - cryolock_color: The cryolock color value to set (e.g., "Blue", "Green", "Red")
    
    Example Request:
    {
        "cryolock_number": "CL-01",
        "cryolock_color": "Blue"
    }
    """
    try:
        branch_id, _ = get_branch_filter_info(request, branch_id_override=branch_id_override, is_quality_tracking=True) if request else (None, None)
        quality_tracking_service = QualityTrackingService(db)
        tank_id = quality_tracking_service.resolve_tank_id(
            tank_code=tank_code,
            branch_id=branch_id
        )
        return quality_tracking_service.update_cryolock_color_for_tank(
            tank_id=tank_id,
            color_update=color_update,
            updated_by=current_user.email if current_user else None,
            branch_id=branch_id,
            tank_code=tank_code
        )
    except Exception as e:
        logger.error(f"Error in update_cryolock_color endpoint: {str(e)}", exc_info=True)
        raise


@router.patch("/tanks/{tank_code}/embryo-transfer", response_model=CryolockFlagUpdateResponse)
def mark_embryo_transfer(
    tank_code: str = Path(..., description="Tank code from URL (e.g., 'T1', 'T10')"),
    branch_id_override: Optional[int] = Query(None, description="Optional branch ID override (Managers only)"),
    flag_update: CryolockFlagUpdate = ...,
    request: Request = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Mark a cryolock as moved to embryo transfer (embryo_transfer=true).

    Request Body:
    {
        \"cryolock_number\": \"T1/C1/A11/2\"
    }
    """
    try:
        branch_id, _ = get_branch_filter_info(request, branch_id_override=branch_id_override, is_quality_tracking=True) if request else (None, None)
        quality_tracking_service = QualityTrackingService(db)
        tank_id = quality_tracking_service.resolve_tank_id(
            tank_code=tank_code,
            branch_id=branch_id
        )
        return quality_tracking_service.mark_embryo_transfer_for_tank(
            tank_id=tank_id,
            flag_update=flag_update,
            updated_by=current_user.email if current_user else None,
            branch_id=branch_id,
            tank_code=tank_code
        )
    except Exception as e:
        logger.error(f"Error in mark_embryo_transfer endpoint: {str(e)}", exc_info=True)
        raise


@router.patch("/tanks/{tank_code}/in-transit-with-shipment", response_model=InTransitWithShipmentResponse)
def mark_in_transit_with_shipment(
    tank_code: str = Path(..., description="Tank code from URL (e.g., 'T1', 'T10')"),
    branch_id_override: Optional[int] = Query(None, description="Optional branch ID override (Managers only)"),
    shipment_request: InTransitWithShipmentRequest = ...,
    request: Request = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Mark a cryolock as moved to transit AND create IoT shipment.
    
    This endpoint:
    1. Parses description to extract source, destination, and device ID
    2. Marks the cryolock as in_transit = True
    3. Creates an IoT shipment via Tive API
    4. Stores shipment record in database
    
    Request Body:
    {
        \"cryolock_number\": \"T1/C1/A11/2\",
        \"description\": \"crylock is move from egmore to thambaram-deviceid -xxxxx\"
    }
    
    Description Format:
    - "crylock is move from <source> to <destination>-deviceid -<device_id>"
    - Example: "crylock is move from egmore to thambaram-deviceid -xxxxx"
    - Source location is auto-detected from tank's current branch
    - Destination location is extracted from description and matched to branch name
    - Device ID is extracted from description (optional)
    
    Returns shipment details including:
    - shipment_id (auto-generated: SHIP-YYYYMMDD-CANISTER_ID-CRYOLOCK_ID)
    - iot_shipment_id (from IoT API)
    - source and destination branch details
    - device_id (if extracted from description)
    """
    try:
        branch_id, _ = get_branch_filter_info(request, branch_id_override=branch_id_override, is_quality_tracking=True) if request else (None, None)
        quality_tracking_service = QualityTrackingService(db)
        tank_id = quality_tracking_service.resolve_tank_id(
            tank_code=tank_code,
            branch_id=branch_id
        )
        return quality_tracking_service.mark_in_transit_with_shipment_for_tank(
            tank_id=tank_id,
            request=shipment_request,
            updated_by=current_user.email if current_user else None,
            branch_id=branch_id,
            tank_code=tank_code
        )
    except Exception as e:
        logger.error(f"Error in mark_in_transit_with_shipment endpoint: {str(e)}", exc_info=True)
        raise


@router.get("/tanks/{tank_code}/combined-report/export-excel")
def export_combined_refill_logs_and_deviations_excel(
    tank_code: str = Path(..., description="Tank code from URL (e.g., 'T1', 'T10')"),
    canister_number: Optional[str] = Query(None, description="Optional canister number (e.g., 'C1'). If not provided, exports data for all canisters in tank."),
    year: Optional[int] = Query(None, ge=2000, le=2100, description="Year for the report (e.g., 2024). If not provided, uses current year."),
    month: Optional[int] = Query(None, ge=1, le=12, description="Month for the report (1-12). If not provided, exports entire year."),
    branch_id_override: Optional[int] = Query(None, description="Optional branch ID override (Managers only)"),
    request: Request = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Export combined refill logs and KPI threshold deviations to Excel format with two sheets.
    
    Returns an Excel file with two sheets:
    - Sheet 1: Refill Logs - Contains refill log data with metadata for all canisters in tank (or specific canister if provided)
    - Sheet 2: KPI Threshold Deviations - Contains deviation data with metadata for all canisters in tank (or specific canister if provided)
    
    Query Parameters:
    - canister_number: Optional canister number to filter by (e.g., 'C1')
    - year: Year for the report (e.g., 2024). Optional - defaults to current year.
    - month: Month for the report (1-12). Optional - if not provided, exports entire year.
    
    Example:
    GET /api/quality-tracking/tanks/T1/combined-report/export-excel (exports current year for all canisters)
    GET /api/quality-tracking/tanks/T1/combined-report/export-excel?canister_number=C1&year=2024 (exports year 2024 for C1)
    GET /api/quality-tracking/tanks/T1/combined-report/export-excel?year=2024&month=3 (exports March 2024 for all canisters)
    """
    try:
        branch_id, _ = get_branch_filter_info(request, branch_id_override=branch_id_override, is_quality_tracking=True) if request else (None, None)
        quality_tracking_service = QualityTrackingService(db)
        tank_id = quality_tracking_service.resolve_tank_id(
            tank_code=tank_code,
            branch_id=branch_id
        )
        return quality_tracking_service.export_combined_refill_logs_and_deviations_excel_for_tank(
            tank_id=tank_id,
            canister_number=canister_number,
            year=year,
            month=month,
            branch_id=branch_id
        )
    except Exception as e:
        logger.error(f"Error in export_combined_refill_logs_and_deviations_excel endpoint: {str(e)}", exc_info=True)
        raise


@router.get("/tanks/{tank_code}/readings-deviations/export-excel")
def export_readings_deviations_excel(
    tank_code: str = Path(..., description="Tank code from URL (e.g., 'T1', 'T10')"),
    year: Optional[int] = Query(None, ge=2000, le=2100, description="Year for the report (e.g., 2024). If not provided, uses current year."),
    month: Optional[int] = Query(None, ge=1, le=12, description="Month for the report (1-12). If not provided, exports entire year."),
    branch_id_override: Optional[int] = Query(None, description="Optional branch ID override (Managers only)"),
    request: Request = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Export deviations from the readings table combined with KPI config to Excel format.
    
    Returns an Excel file with a single sheet containing readings deviations data with:
    - Date and Time of the reading
    - Tank Code and Branch Name
    - Device ID
    - KPI Name and Alert Name from KPI config
    - KPI Value recorded
    - Unit from KPI config
    - Min and Max thresholds from KPI config
    - Violation Type (Below Min, Above Max, Threshold Breach)
    - Alert Type from KPI config
    - Alert Sent status
    
    Query Parameters:
    - year: Year for the report (e.g., 2024). Optional - defaults to current year.
    - month: Month for the report (1-12). Optional - if not provided, exports entire year.
    
    Example:
    GET /api/quality-tracking/tanks/T1/readings-deviations/export-excel (exports current year)
    GET /api/quality-tracking/tanks/T1/readings-deviations/export-excel?year=2024 (exports year 2024)
    GET /api/quality-tracking/tanks/T1/readings-deviations/export-excel?year=2024&month=3 (exports March 2024)
    """
    try:
        branch_id, _ = get_branch_filter_info(request, branch_id_override=branch_id_override, is_quality_tracking=True) if request else (None, None)
        quality_tracking_service = QualityTrackingService(db)
        tank_id = quality_tracking_service.resolve_tank_id(
            tank_code=tank_code,
            branch_id=branch_id
        )
        return quality_tracking_service.export_readings_deviations_excel_for_tank(
            tank_id=tank_id,
            year=year,
            month=month,
            branch_id=branch_id
        )
    except Exception as e:
        logger.error(f"Error in export_readings_deviations_excel endpoint: {str(e)}", exc_info=True)
        raise