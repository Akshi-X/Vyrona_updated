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


@router.post("/canisters/{canister_number}/refill-logs", response_model=RefillLogResponse, status_code=201)
def create_refill_log(
    canister_number: str = Path(..., description="Canister number/code from URL (e.g., 'C1')"),
    refill_log_data: RefillLogCreate = ...,
    request: Request = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Create a new Liquid Nitrogen (LN2) refill log entry for a specific canister
    
    Canister ID is automatically obtained from the URL path.
    
    Request Body Fields:
    - Refill Date: Date when refill was performed
    - Refill Time: Time when refill was performed
    - Refilled By: Name of person who performed the refill
    - Description: Optional description or notes
    - Status: Status of the refill log (default: Not started)
    """
    try:
        quality_tracking_service = QualityTrackingService(db)
        branch_id, _ = get_branch_filter_info(request) if request else (None, None)
        canister_id = quality_tracking_service.resolve_canister_id(
            canister_number=canister_number,
            branch_id=branch_id
        )
        return quality_tracking_service.create_refill_log(
            canister_id=canister_id,
            refill_log_data=refill_log_data,
            created_by=current_user.email if current_user else None,
            branch_id=branch_id
        )
    except Exception as e:
        logger.error(f"Error in create_refill_log endpoint: {str(e)}", exc_info=True)
        raise


@router.get("/canisters/{canister_number}/refill-logs", response_model=RefillLogListResponse)
def get_refill_logs_by_container(
    canister_number: str = Path(..., description="Canister number/code from URL (e.g., 'C1')"),
    status: Optional[str] = Query(None, description="Filter by status (Done, In progress, Not started)"),
    limit: Optional[int] = Query(None, ge=1, le=1000, description="Limit number of results"),
    request: Request = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Fetch Liquid Nitrogen (LN2) refill logs for a specific canister
    
    Canister ID is automatically obtained from the URL path.
    
    Supports filtering by:
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
        
        branch_id, _ = get_branch_filter_info(request) if request else (None, None)
        quality_tracking_service = QualityTrackingService(db)
        canister_id = quality_tracking_service.resolve_canister_id(
            canister_number=canister_number,
            branch_id=branch_id
        )
        return quality_tracking_service.get_refill_logs(
            canister_id=canister_id,
            status=status,
            limit=limit,
            branch_id=branch_id
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in get_refill_logs_by_container endpoint: {str(e)}", exc_info=True)
        raise


@router.patch("/canisters/{canister_number}/refill-logs/{log_id}/status", response_model=RefillLogResponse)
def update_refill_log_status(
    canister_number: str = Path(..., description="Canister number/code from URL (e.g., 'C1')"),
    log_id: int = Path(..., description="Refill log ID"),
    status_update: RefillLogStatusUpdate = ...,
    request: Request = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Update only the status of a refill log for a specific canister.
    """
    try:
        branch_id, _ = get_branch_filter_info(request) if request else (None, None)
        quality_tracking_service = QualityTrackingService(db)
        canister_id = quality_tracking_service.resolve_canister_id(
            canister_number=canister_number,
            branch_id=branch_id
        )
        return quality_tracking_service.update_refill_log_status(
            canister_id=canister_id,
            log_id=log_id,
            status_update=status_update,
            updated_by=current_user.email if current_user else None,
            branch_id=branch_id
        )
    except Exception as e:
        logger.error(f"Error in update_refill_log_status endpoint: {str(e)}", exc_info=True)
        raise


@router.get("/canisters/{canister_number}/tracking-details", response_model=IVFCanisterTrackingResponse)
def get_canister_tracking_details(
    canister_number: str = Path(..., description="Canister number/code from URL (e.g., 'C1')"),
    request: Request = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Fetch tracking details for a specific canister.
    
    Returns a table with the following columns:
    - HIS # (PK): Patient HIS Number
    - Cryolock #: Cryolock number
    - Canister #: Canister number
    - Cane ID: Cane identifier (formatted)
    - Goblet Color: Goblet color
    - Cryolock Color: Cryolock color
    - Date of Vitrification: Date when vitrification was performed
    - Move to: Indicates if item can be moved (UI action button)
    """
    try:
        branch_id, _ = get_branch_filter_info(request) if request else (None, None)
        quality_tracking_service = QualityTrackingService(db)
        canister_id = quality_tracking_service.resolve_canister_id(
            canister_number=canister_number,
            branch_id=branch_id
        )
        return quality_tracking_service.get_canister_tracking_details(
            canister_id=canister_id,
            branch_id=branch_id
        )
    except Exception as e:
        logger.error(f"Error in get_canister_tracking_details endpoint: {str(e)}", exc_info=True)
        raise


@router.patch("/canisters/{canister_number}/goblet-color", response_model=ColorUpdateResponse)
def update_goblet_color(
    canister_number: str = Path(..., description="Canister number/code from URL (e.g., 'C1')"),
    color_update: GobletColorUpdate = ...,
    request: Request = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Update goblet color for a specific cryolock within a canister.
    
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
        branch_id, _ = get_branch_filter_info(request) if request else (None, None)
        quality_tracking_service = QualityTrackingService(db)
        canister_id = quality_tracking_service.resolve_canister_id(
            canister_number=canister_number,
            branch_id=branch_id
        )
        return quality_tracking_service.update_goblet_color(
            canister_id=canister_id,
            color_update=color_update,
            updated_by=current_user.email if current_user else None,
            branch_id=branch_id
        )
    except Exception as e:
        logger.error(f"Error in update_goblet_color endpoint: {str(e)}", exc_info=True)
        raise


@router.patch("/canisters/{canister_number}/cryolock-color", response_model=ColorUpdateResponse)
def update_cryolock_color(
    canister_number: str = Path(..., description="Canister number/code from URL (e.g., 'C1')"),
    color_update: CryolockColorUpdate = ...,
    request: Request = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Update cryolock color for a specific cryolock within a canister.
    
    Use this endpoint to update the cryolock color from the tracking table.
    The cryolock color is stored in the 'cryolocks' table.
    
    WHERE TO GET cryolock_number:
    - Use the "Cryolock Num" column value directly from the table row
    - Example: "CL-01"
    
    Request Body:
    - cryolock_number: Cryolock number from the "Cryolock Num" column in the table (e.g., "CL-01")
    - cryolock_color: The cryolock color value to set (e.g., "Blue", "Green", "Red")
    
    Example Request:
    {
        "cryolock_number": "CL-01",
        "cryolock_color": "Blue"
    }
    """
    try:
        branch_id, _ = get_branch_filter_info(request) if request else (None, None)
        quality_tracking_service = QualityTrackingService(db)
        canister_id = quality_tracking_service.resolve_canister_id(
            canister_number=canister_number,
            branch_id=branch_id
        )
        return quality_tracking_service.update_cryolock_color(
            canister_id=canister_id,
            color_update=color_update,
            updated_by=current_user.email if current_user else None,
            branch_id=branch_id
        )
    except Exception as e:
        logger.error(f"Error in update_cryolock_color endpoint: {str(e)}", exc_info=True)
        raise


@router.patch("/canisters/{canister_number}/embryo-transfer", response_model=CryolockFlagUpdateResponse)
def mark_embryo_transfer(
    canister_number: str = Path(..., description="Canister number/code from URL (e.g., 'C1')"),
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
        branch_id, _ = get_branch_filter_info(request) if request else (None, None)
        quality_tracking_service = QualityTrackingService(db)
        canister_id = quality_tracking_service.resolve_canister_id(
            canister_number=canister_number,
            branch_id=branch_id
        )
        return quality_tracking_service.mark_embryo_transfer(
            canister_id=canister_id,
            flag_update=flag_update,
            updated_by=current_user.email if current_user else None,
            branch_id=branch_id
        )
    except Exception as e:
        logger.error(f"Error in mark_embryo_transfer endpoint: {str(e)}", exc_info=True)
        raise


@router.patch("/canisters/{canister_number}/in-transit-with-shipment", response_model=InTransitWithShipmentResponse)
def mark_in_transit_with_shipment(
    canister_number: str = Path(..., description="Canister number/code from URL (e.g., 'C1')"),
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
    - Source location is auto-detected from canister's current branch
    - Destination location is extracted from description and matched to branch name
    - Device ID is extracted from description (optional)
    
    Returns shipment details including:
    - shipment_id (auto-generated: SHIP-YYYYMMDD-CANISTER_ID-CRYOLOCK_ID)
    - iot_shipment_id (from IoT API)
    - source and destination branch details
    - device_id (if extracted from description)
    """
    try:
        branch_id, _ = get_branch_filter_info(request) if request else (None, None)
        quality_tracking_service = QualityTrackingService(db)
        canister_id = quality_tracking_service.resolve_canister_id(
            canister_number=canister_number,
            branch_id=branch_id
        )
        return quality_tracking_service.mark_in_transit_with_shipment(
            canister_id=canister_id,
            request=shipment_request,
            updated_by=current_user.email if current_user else None,
            branch_id=branch_id
        )
    except Exception as e:
        logger.error(f"Error in mark_in_transit_with_shipment endpoint: {str(e)}", exc_info=True)
        raise


@router.get("/canisters/{canister_number}/refill-logs/export-excel")
def export_monthly_refill_logs_excel(
    canister_number: str = Path(..., description="Canister number/code from URL (e.g., 'C1')"),
    year: Optional[int] = Query(None, ge=2000, le=2100, description="Year for the report (e.g., 2024). If not provided, uses current year."),
    month: Optional[int] = Query(None, ge=1, le=12, description="Month for the report (1-12). If not provided, exports entire year."),
    request: Request = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Export refill logs to Excel format.
    
    Returns an Excel file with:
    - Metadata at the top: Container ID, Year/Month-Year, and Current Year Total
    - Refill log data with all columns
    
    Query Parameters:
    - year: Year for the report (e.g., 2024). Optional - defaults to current year.
    - month: Month for the report (1-12). Optional - if not provided, exports entire year.
    
    Example:
    GET /api/quality-tracking/canisters/C1/refill-logs/export-excel (exports current year)
    GET /api/quality-tracking/canisters/C1/refill-logs/export-excel?year=2024 (exports year 2024)
    GET /api/quality-tracking/canisters/C1/refill-logs/export-excel?year=2024&month=3 (exports March 2024)
    """
    try:
        branch_id, _ = get_branch_filter_info(request) if request else (None, None)
        quality_tracking_service = QualityTrackingService(db)
        canister_id = quality_tracking_service.resolve_canister_id(
            canister_number=canister_number,
            branch_id=branch_id
        )
        return quality_tracking_service.export_monthly_refill_logs_excel(
            canister_id=canister_id,
            year=year,
            month=month,
            branch_id=branch_id
        )
    except Exception as e:
        logger.error(f"Error in export_monthly_refill_logs_excel endpoint: {str(e)}", exc_info=True)
        raise


@router.get("/kpi-thresholds/export-excel")
def export_kpi_threshold_monthly_excel(
    canister_number: str = Query(..., description="Canister number to filter by (e.g., 'C1') - required"),
    year: Optional[int] = Query(None, ge=2000, le=2100, description="Year for the report (e.g., 2024). If not provided, uses current year."),
    month: Optional[int] = Query(None, ge=1, le=12, description="Month for the report (1-12). If not provided, uses current month."),
    request: Request = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Export KPI threshold deviation data as Excel format for a specific canister.
    
    Returns an Excel file with:
    - Metadata at the top: Container ID, Year/Month-Year, and Total Deviations
    - Date and Time of readings
    - Canister information
    - KPI values (Temperature, Humidity, Agitation, Light)
    - Threshold targets and ranges
    - Threshold violation status
    - Quality loss percentage
    
    Query Parameters:
    - canister_number: Canister number to filter by (e.g., 'C1') - required
    - year: Year for the report (e.g., 2024). Optional - defaults to current year.
    - month: Month for the report (1-12). Optional - if not provided, exports entire year.
    
    Example:
    GET /api/quality-tracking/kpi-thresholds/export-excel?canister_number=C1 (exports current year)
    GET /api/quality-tracking/kpi-thresholds/export-excel?canister_number=C1&year=2024 (exports year 2024)
    GET /api/quality-tracking/kpi-thresholds/export-excel?canister_number=C1&year=2024&month=3 (exports March 2024)
    """
    try:
        branch_id, _ = get_branch_filter_info(request) if request else (None, None)
        quality_tracking_service = QualityTrackingService(db)
        return quality_tracking_service.export_kpi_threshold_monthly_excel(
            canister_number=canister_number,
            year=year,
            month=month,
            branch_id=branch_id
        )
    except Exception as e:
        logger.error(f"Error in export_kpi_threshold_monthly_excel endpoint: {str(e)}", exc_info=True)
        raise


@router.get("/canisters/{canister_number}/combined-report/export-excel")
def export_combined_refill_logs_and_deviations_excel(
    canister_number: str = Path(..., description="Canister number/code from URL (e.g., 'C1')"),
    year: Optional[int] = Query(None, ge=2000, le=2100, description="Year for the report (e.g., 2024). If not provided, uses current year."),
    month: Optional[int] = Query(None, ge=1, le=12, description="Month for the report (1-12). If not provided, exports entire year."),
    request: Request = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Export combined refill logs and KPI threshold deviations to Excel format with two sheets.
    
    Returns an Excel file with two sheets:
    - Sheet 1: Refill Logs - Contains refill log data with metadata
    - Sheet 2: KPI Threshold Deviations - Contains deviation data with metadata
    
    Query Parameters:
    - year: Year for the report (e.g., 2024). Optional - defaults to current year.
    - month: Month for the report (1-12). Optional - if not provided, exports entire year.
    
    Example:
    GET /api/quality-tracking/canisters/C1/combined-report/export-excel (exports current year)
    GET /api/quality-tracking/canisters/C1/combined-report/export-excel?year=2024 (exports year 2024)
    GET /api/quality-tracking/canisters/C1/combined-report/export-excel?year=2024&month=3 (exports March 2024)
    """
    try:
        branch_id, _ = get_branch_filter_info(request) if request else (None, None)
        quality_tracking_service = QualityTrackingService(db)
        canister_id = quality_tracking_service.resolve_canister_id(
            canister_number=canister_number,
            branch_id=branch_id
        )
        return quality_tracking_service.export_combined_refill_logs_and_deviations_excel(
            canister_id=canister_id,
            year=year,
            month=month,
            branch_id=branch_id
        )
    except Exception as e:
        logger.error(f"Error in export_combined_refill_logs_and_deviations_excel endpoint: {str(e)}", exc_info=True)
        raise