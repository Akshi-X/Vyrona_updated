"""
Quality Tracking Controller
Handles HTTP requests for quality tracking operations including LN2 refill logs
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, Query, Path, Request, Response
from sqlalchemy.orm import Session
from sqlalchemy import func, distinct
from typing import Optional, List

from pydantic import BaseModel as PydanticBaseModel

from app.config.database import get_db
from app.dependencies.auth_dependencies import get_current_user
from app.exceptions.custom_exceptions import AppException
from app.models.user_model import User
from app.models.IVF.canister_ln2_log_model import CanisterLn2Log
from app.models.IVF.ln2_readings_model import Ln2Reading
from app.models.IVF.ln2_iot_device_model import Ln2IotDevice
from app.models.kpi_config_model import KpiConfig
from app.service.IVF.quality_tracking_service import QualityTrackingService
from app.service.IVF.refill_detection_service import RefillDetectionService
from app.schemas.IVF.quality_tracking_schema import (
    RefillLogCreate,
    RefillLogStatusUpdate,
    RefillLogUpdate,
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


def _assert_tank_hospital(tank_id: int, current_user: User, db: Session) -> None:
    """Raise 403 if the tank does not belong to the current user's hospital."""
    if not current_user.hospital_id:
        return
    from sqlalchemy import text as _text
    from app.models.IVF.hospital_branch_model import HospitalBranch
    from app.models.IVF.tank_model import Tank
    tank = db.query(Tank).filter(Tank.tank_id == tank_id).first()
    if not tank:
        raise HTTPException(status_code=404, detail=f"Tank {tank_id} not found")
    branch = db.query(HospitalBranch).filter(HospitalBranch.branch_id == tank.branch_id).first()
    if not branch or branch.hospital_id != current_user.hospital_id:
        raise HTTPException(status_code=403, detail="Access denied: tank does not belong to your hospital")


@router.post("/tanks/{tank_id}/refill-logs", response_model=RefillLogResponse, status_code=201)
def create_refill_log(
    tank_id: int = Path(..., description="Tank ID from URL (e.g., 91)"),
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
        _assert_tank_hospital(tank_id, current_user, db)
        branch_id, _ = get_branch_filter_info(request, branch_id_override=branch_id_override, is_quality_tracking=True) if request else (None, None)
        quality_tracking_service = QualityTrackingService(db)
        return quality_tracking_service.create_refill_log_for_tank(
            tank_id=tank_id,
            canister_number=canister_number,
            refill_log_data=refill_log_data,
            created_by=current_user.email if current_user else None,
            branch_id=branch_id
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in create_refill_log endpoint: {str(e)}", exc_info=True)
        raise


@router.get("/tanks/{tank_id}/refill-logs", response_model=RefillLogListResponse)
def get_refill_logs_by_container(
    tank_id: int = Path(..., description="Tank ID from URL (e.g., 91)"),
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
        
        _assert_tank_hospital(tank_id, current_user, db)
        branch_id, _ = get_branch_filter_info(request, branch_id_override=branch_id_override, is_quality_tracking=True) if request else (None, None)
        quality_tracking_service = QualityTrackingService(db)
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


@router.patch("/tanks/{tank_id}/refill-logs/{log_id}", response_model=RefillLogResponse)
def update_refill_log(
    tank_id: int = Path(..., description="Tank ID from URL (e.g., 91)"),
    log_id: int = Path(..., description="Refill log ID"),
    branch_id_override: Optional[int] = Query(None, description="Optional branch ID override (Managers only)"),
    update_data: RefillLogUpdate = ...,
    request: Request = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Update editable fields of a refill log entry:
    status, reservoir, ln2_ordered_date, ln2_received_date.
    Only fields that are explicitly provided are updated.
    """
    try:
        branch_id, _ = get_branch_filter_info(request, branch_id_override=branch_id_override, is_quality_tracking=True) if request else (None, None)
        quality_tracking_service = QualityTrackingService(db)
        return quality_tracking_service.update_refill_log_for_tank(
            tank_id=tank_id,
            log_id=log_id,
            update_data=update_data,
            updated_by=current_user.email if current_user else None,
            branch_id=branch_id
        )
    except Exception as e:
        logger.error(f"Error in update_refill_log endpoint: {str(e)}", exc_info=True)
        raise


@router.patch("/tanks/{tank_id}/refill-logs/{log_id}/status", response_model=RefillLogResponse)
def update_refill_log_status(
    tank_id: int = Path(..., description="Tank ID from URL (e.g., 91)"),
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


@router.get("/tanks/{tank_id}/tracking-details", response_model=IVFCanisterTrackingResponse)
def get_canister_tracking_details(
    tank_id: int = Path(..., description="Tank ID from URL (e.g., 91)"),
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
            tank_id=tank_id,
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


@router.patch("/tanks/{tank_id}/goblet-color", response_model=ColorUpdateResponse)
def update_goblet_color(
    tank_id: int = Path(..., description="Tank ID from URL (e.g., 91)"),
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
        return quality_tracking_service.update_goblet_color_for_tank(
            tank_id=tank_id,
            color_update=color_update,
            updated_by=current_user.email if current_user else None,
            branch_id=branch_id,
            tank_code=None
        )
    except Exception as e:
        logger.error(f"Error in update_goblet_color endpoint: {str(e)}", exc_info=True)
        raise


@router.patch("/tanks/{tank_id}/cryolock-color", response_model=ColorUpdateResponse)
def update_cryolock_color(
    tank_id: int = Path(..., description="Tank ID from URL (e.g., 91)"),
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
        return quality_tracking_service.update_cryolock_color_for_tank(
            tank_id=tank_id,
            color_update=color_update,
            updated_by=current_user.email if current_user else None,
            branch_id=branch_id,
            tank_code=None
        )
    except Exception as e:
        logger.error(f"Error in update_cryolock_color endpoint: {str(e)}", exc_info=True)
        raise


@router.patch("/tanks/{tank_id}/embryo-transfer", response_model=CryolockFlagUpdateResponse)
def mark_embryo_transfer(
    tank_id: int = Path(..., description="Tank ID from URL (e.g., 91)"),
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
        return quality_tracking_service.mark_embryo_transfer_for_tank(
            tank_id=tank_id,
            flag_update=flag_update,
            updated_by=current_user.email if current_user else None,
            branch_id=branch_id,
            tank_code=None
        )
    except Exception as e:
        logger.error(f"Error in mark_embryo_transfer endpoint: {str(e)}", exc_info=True)
        raise


@router.patch("/tanks/{tank_id}/in-transit-with-shipment", response_model=InTransitWithShipmentResponse)
def mark_in_transit_with_shipment(
    tank_id: int = Path(..., description="Tank ID from URL (e.g., 91)"),
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
        return quality_tracking_service.mark_in_transit_with_shipment_for_tank(
            tank_id=tank_id,
            request=shipment_request,
            updated_by=current_user.email if current_user else None,
            branch_id=branch_id,
            tank_code=None
        )
    except Exception as e:
        logger.error(f"Error in mark_in_transit_with_shipment endpoint: {str(e)}", exc_info=True)
        raise


@router.get("/tanks/{tank_id}/combined-report/export-excel")
def export_combined_refill_logs_and_deviations_excel(
    tank_id: int = Path(..., description="Tank ID from URL (e.g., 91)"),
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


@router.get("/tanks/{tank_id}/readings-deviations/export-excel")
def export_readings_deviations_excel(
    tank_id: int = Path(..., description="Tank ID from URL (e.g., 91)"),
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
        return quality_tracking_service.export_readings_deviations_excel_for_tank(
            tank_id=tank_id,
            year=year,
            month=month,
            branch_id=branch_id
        )
    except Exception as e:
        logger.error(f"Error in export_readings_deviations_excel endpoint: {str(e)}", exc_info=True)
        raise


# ============================================================
# Bulk Tank Refill Summary (single CTE — replaces N×4 per-tank calls)
# ============================================================

@router.get("/tanks/refill-summary")
def get_tanks_refill_summary(
    tank_ids: str = Query(..., description="Comma-separated tank IDs, e.g. 1,2,3"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Return last refill log, latest LN2 reading, ln2_level KPI min,
    and tank capacity for all requested tanks — in a single CTE query.
    """
    try:
        id_list: List[int] = [int(x) for x in tank_ids.split(",") if x.strip().isdigit()]
    except Exception:
        raise HTTPException(status_code=422, detail="tank_ids must be comma-separated integers")

    if not id_list:
        return {"summary": {}}

    from sqlalchemy import text as sa_text

    # Restrict tank_ids to current user's hospital (and branch for regular users)
    if current_user.hospital_id:
        allowed = db.execute(
            sa_text("""
                SELECT t.tank_id FROM tanks t
                JOIN hospital_branches b ON b.branch_id = t.branch_id
                WHERE t.tank_id = ANY(:ids) AND b.hospital_id = :hid
            """),
            {"ids": id_list, "hid": current_user.hospital_id},
        ).fetchall()
        id_list = [r.tank_id for r in allowed]

    if current_user.branch_id and current_user.role not in ("Admin", "Manager", "Mygrape_admin"):
        id_list = [
            r.tank_id
            for r in db.execute(
                sa_text("SELECT tank_id FROM tanks WHERE tank_id = ANY(:ids) AND branch_id = :bid"),
                {"ids": id_list, "bid": current_user.branch_id},
            ).fetchall()
        ]

    if not id_list:
        return {"summary": {}}

    ids_str = ",".join(str(id_) for id_ in id_list)
    rows = db.execute(
        sa_text(f"""
            WITH tank_list AS (
                SELECT * FROM (VALUES {','.join(f"({id_})" for id_ in id_list)}) AS t(tank_id)
            ),
            latest_log AS (
                SELECT DISTINCT ON (tank_id)
                    tank_id,
                    refill_date,
                    refill_time,
                    refilled_by,
                    description
                FROM canister_ln2_logs
                WHERE tank_id = ANY(ARRAY[{ids_str}])
                ORDER BY tank_id, refill_date DESC NULLS LAST, refill_time DESC NULLS LAST
            ),
            latest_ln2 AS (
                SELECT DISTINCT ON (r.tank_id)
                    r.tank_id,
                    r.kpi_config_id,
                    r.kpi_value AS ln2_mass_kg,
                    k.status AS kpi_status
                FROM readings r
                JOIN kpi_config k ON k.id = r.kpi_config_id
                WHERE r.tank_id = ANY(ARRAY[{ids_str}])
                  AND k.kpi_name = 'ln2_level'
                ORDER BY r.tank_id, r.timestamp DESC
            ),
            kpi AS (
                SELECT DISTINCT ON (tank_id)
                    tank_id,
                    min AS ln2_config_min
                FROM kpi_config
                WHERE tank_id = ANY(ARRAY[{ids_str}])
                  AND kpi_name = 'ln2_level'
                  AND alert_name = 'LN2'
                  AND status = true
                ORDER BY tank_id, id DESC
            ),
            capacity AS (
                SELECT DISTINCT ON (tank_id)
                    tank_id,
                    tank_max_capacity_reading,
                    tank_min_capacity_reading
                FROM ln2_iot_devices
                WHERE tank_id = ANY(ARRAY[{ids_str}])
                ORDER BY tank_id, updated_at DESC
            )
            SELECT
                t.tank_id,
                ll.refill_date,
                ll.refill_time,
                ll.refilled_by,
                ll.description,
                ln.kpi_config_id,
                ln.kpi_status,
                ln.ln2_mass_kg,
                k.ln2_config_min,
                c.tank_max_capacity_reading,
                c.tank_min_capacity_reading
            FROM tank_list t
            LEFT JOIN latest_log ll ON ll.tank_id = t.tank_id
            LEFT JOIN latest_ln2 ln ON ln.tank_id = t.tank_id
            LEFT JOIN kpi k ON k.tank_id = t.tank_id
            LEFT JOIN capacity c ON c.tank_id = t.tank_id
        """)
    ).fetchall()

    summary: dict = {}
    for r in rows:
        summary[str(r.tank_id)] = {
            "last_refill_date": str(r.refill_date) if r.refill_date else None,
            "last_refill_time": str(r.refill_time) if r.refill_time else None,
            "last_refilled_by": r.refilled_by,
            "last_description": r.description,
            "kpi_config_id": r.kpi_config_id,
            "kpi_status": r.kpi_status,
            "ln2_mass_kg": float(r.ln2_mass_kg) if r.ln2_mass_kg is not None else None,
            "ln2_config_min": float(r.ln2_config_min) if r.ln2_config_min is not None else None,
            "tank_max_capacity": float(r.tank_max_capacity_reading) if r.tank_max_capacity_reading is not None else None,
            "tank_min_capacity": float(r.tank_min_capacity_reading) if r.tank_min_capacity_reading is not None else None,
        }

    return {"summary": summary}


@router.get("/tanks/all-refill-logs")
def get_all_tanks_refill_logs(
    tank_ids: str = Query(..., description="Comma-separated tank IDs"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Return all refill logs for the requested tanks in one query.
    Used by the Activity Log section to avoid N per-tank requests.
    """
    from sqlalchemy import text as sa_text

    try:
        id_list: List[int] = [int(x) for x in tank_ids.split(",") if x.strip().isdigit()]
    except Exception:
        raise HTTPException(status_code=422, detail="tank_ids must be comma-separated integers")

    if not id_list:
        return {"logs": []}

    params: dict = {"ids": id_list}
    hospital_clause = ""
    branch_clause = ""

    # Always restrict to the current user's hospital
    if current_user.hospital_id:
        hospital_clause = "AND b.hospital_id = :hospital_id"
        params["hospital_id"] = current_user.hospital_id

    # Users (non-admin, non-manager) only see their own branch
    if current_user.branch_id and current_user.role not in ("Admin", "Manager", "Mygrape_admin"):
        branch_clause = "AND t.branch_id = :branch_id"
        params["branch_id"] = current_user.branch_id

    rows = db.execute(
        sa_text(f"""
            SELECT
                l.tank_id,
                t.tank_code,
                b.branch_name,
                l.refill_date,
                l.refill_time,
                l.refilled_by,
                l.description,
                l.status
            FROM canister_ln2_logs l
            JOIN tanks t ON t.tank_id = l.tank_id
            JOIN hospital_branches b ON b.branch_id = t.branch_id
            WHERE l.tank_id = ANY(:ids)
            {hospital_clause}
            {branch_clause}
            ORDER BY l.refill_date DESC NULLS LAST, l.refill_time DESC NULLS LAST
        """),
        params,
    ).fetchall()

    logs = [
        {
            "tank_id": r.tank_id,
            "tank_code": r.tank_code,
            "branch_name": r.branch_name,
            "refill_date": str(r.refill_date) if r.refill_date else None,
            "refill_time": str(r.refill_time) if r.refill_time else None,
            "refilled_by": r.refilled_by,
            "description": r.description,
            "status": str(r.status) if r.status else None,
        }
        for r in rows
    ]

    return {"logs": logs}


# ============================================================
# Refill Detection Review Endpoints
# ============================================================

class ReviewDetectionRequest(PydanticBaseModel):
    is_confirmed: bool
    notes: Optional[str] = None


@router.get("/refill-detections/pending")
def get_pending_refill_detections(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Return all unconfirmed (pending) LN2 refill detections for the
    current user's hospital. Used by the frontend to show the stacked
    'Refill Detected' notification banner.
    """
    service = RefillDetectionService(db)
    branch_filter = current_user.branch_id if current_user.role not in ("Admin", "Manager", "Mygrape_admin") else None
    detections = service.get_pending_detections(current_user.hospital_id, branch_filter)

    items = []
    for d in detections:
        tank_code = (d.tank.tank_code if d.tank else None) or str(d.tank_id)
        branch_name = (
            d.tank.branch.branch_name
            if (d.tank and d.tank.branch)
            else None
        )
        items.append(
            {
                "id": d.id,
                "tank_id": d.tank_id,
                "tank_code": tank_code,
                "branch_name": branch_name,
                "detected_at": d.detected_at.isoformat() if d.detected_at else None,
                "refill_weight": (
                    float(d.refill_weight) if d.refill_weight is not None else None
                ),
            }
        )

    return {"detections": items}


@router.patch("/refill-detections/{detection_id}/review")
def review_refill_detection(
    detection_id: int,
    body: ReviewDetectionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Confirm or reject a pending LN2 refill detection.

    - is_confirmed=true  → staff confirmed the refill (usually after adding a log)
    - is_confirmed=false → staff dismissed / rejected the detection
    """
    confirmed_by = getattr(current_user, "email", None) or getattr(
        current_user, "first_name", "unknown"
    )
    service = RefillDetectionService(db)
    try:
        from app.models.IVF.ln2_refill_detection_model import Ln2RefillDetection
        detection_record = db.query(Ln2RefillDetection).filter(
            Ln2RefillDetection.id == detection_id
        ).first()
        if not detection_record:
            raise HTTPException(status_code=404, detail="Detection not found")
        if current_user.hospital_id and detection_record.hospital_id != current_user.hospital_id:
            raise HTTPException(status_code=403, detail="Access denied")

        detection = service.review_detection(
            detection_id=detection_id,
            is_confirmed=body.is_confirmed,
            confirmed_by=str(confirmed_by),
            notes=body.notes,
        )
        return {
            "success": True,
            "detection_id": detection.id,
            "is_confirmed": detection.is_confirmed,
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/refill-log/page-data")
def get_refill_log_page_data(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Fetch all data needed for the Refill Log page in one call.
    Returns tanks with refill summary and activity logs for the user's hospital.
    """
    try:
        from sqlalchemy import text as sa_text
        from app.models.IVF.hospital_branch_model import HospitalBranch
        from app.models.IVF.tank_model import Tank

        # Get all tanks for user's hospital (and branch if non-admin)
        query = db.query(Tank.tank_id).join(HospitalBranch)

        if current_user.hospital_id:
            query = query.filter(HospitalBranch.hospital_id == current_user.hospital_id)

        if current_user.branch_id and current_user.role not in ("Admin", "Manager", "Mygrape_admin"):
            query = query.filter(Tank.branch_id == current_user.branch_id)

        tank_ids = [r.tank_id for r in query.all()]

        if not tank_ids:
            return {"tanks": [], "logs": []}

        ids_str = ",".join(str(id_) for id_ in tank_ids)

        # --- OLD QUERY (pre LN2-column removal) — kept whole for reference/revert. ---
        # tanks_rows = db.execute(
        #     sa_text(f"""
        #         WITH tank_list AS (
        #             SELECT * FROM (VALUES {','.join(f"({id_})" for id_ in tank_ids)}) AS t(tank_id)
        #         ),
        #         latest_log AS (
        #             SELECT DISTINCT ON (tank_id)
        #                 tank_id,
        #                 refill_date,
        #                 refill_time,
        #                 refilled_by,
        #                 description
        #             FROM canister_ln2_logs
        #             WHERE tank_id = ANY(ARRAY[{ids_str}])
        #             ORDER BY tank_id, refill_date DESC NULLS LAST, refill_time DESC NULLS LAST
        #         ),
        #         ln2_kpi_ids AS (
        #             SELECT id AS kpi_config_id, tank_id
        #             FROM kpi_config
        #             WHERE tank_id = ANY(ARRAY[{ids_str}])
        #               AND kpi_name = 'ln2_level'
        #         ),
        #         ln2_readings AS (
        #             -- One backward index scan per kpi_config_id on
        #             -- idx_readings_kpi_config_timestamp, never a scan over the
        #             -- full readings table (unlike filtering by tank_id, which
        #             -- has no supporting index and forces a join-per-candidate-row
        #             -- against kpi_config to check kpi_name).
        #             SELECT DISTINCT ON (r.kpi_config_id)
        #                 r.kpi_config_id,
        #                 r.kpi_value AS ln2_mass_kg,
        #                 r.timestamp
        #             FROM readings r
        #             WHERE r.kpi_config_id IN (SELECT kpi_config_id FROM ln2_kpi_ids)
        #             ORDER BY r.kpi_config_id, r.timestamp DESC
        #         ),
        #         latest_ln2 AS (
        #             SELECT DISTINCT ON (lk.tank_id)
        #                 lk.tank_id,
        #                 lr.kpi_config_id,
        #                 lr.ln2_mass_kg,
        #                 k.status AS kpi_status
        #             FROM ln2_kpi_ids lk
        #             JOIN ln2_readings lr ON lr.kpi_config_id = lk.kpi_config_id
        #             JOIN kpi_config k ON k.id = lr.kpi_config_id
        #             ORDER BY lk.tank_id, lr.timestamp DESC
        #         ),
        #         kpi AS (
        #             SELECT DISTINCT ON (tank_id)
        #                 tank_id,
        #                 min AS ln2_config_min
        #             FROM kpi_config
        #             WHERE tank_id = ANY(ARRAY[{ids_str}])
        #               AND kpi_name = 'ln2_level'
        #               AND alert_name = 'LN2'
        #               AND status = true
        #             ORDER BY tank_id, id DESC
        #         ),
        #         capacity AS (
        #             SELECT DISTINCT ON (tank_id)
        #                 tank_id,
        #                 tank_max_capacity_reading,
        #                 tank_min_capacity_reading
        #             FROM ln2_iot_devices
        #             WHERE tank_id = ANY(ARRAY[{ids_str}])
        #             ORDER BY tank_id, updated_at DESC
        #         )
        #         SELECT
        #             t.tank_id,
        #             tbl.tank_code,
        #             hb.branch_name,
        #             hb.branch_id,
        #             ll.refill_date,
        #             ll.refill_time,
        #             ll.refilled_by,
        #             ll.description,
        #             ln.kpi_config_id,
        #             ln.kpi_status,
        #             ln.ln2_mass_kg,
        #             k.ln2_config_min,
        #             c.tank_max_capacity_reading,
        #             c.tank_min_capacity_reading
        #         FROM tank_list t
        #         JOIN tanks tbl ON tbl.tank_id = t.tank_id
        #         JOIN hospital_branches hb ON hb.branch_id = tbl.branch_id
        #         LEFT JOIN latest_log ll ON ll.tank_id = t.tank_id
        #         LEFT JOIN latest_ln2 ln ON ln.tank_id = t.tank_id
        #         LEFT JOIN kpi k ON k.tank_id = t.tank_id
        #         LEFT JOIN capacity c ON c.tank_id = t.tank_id
        #     """)
        # ).fetchall()

        # --- CURRENT QUERY — LN2 level progress bar removed from the Refill Log page,
        # so the ln2_kpi_ids/ln2_readings/latest_ln2/kpi/capacity CTEs and the columns
        # they fed (kpi_config_id/kpi_status/ln2_mass_kg/ln2_config_min/
        # tank_max_capacity/tank_min_capacity) are dropped here. Frontend not touched
        # by this change. See OLD QUERY above to restore. ---
        tanks_rows = db.execute(
            sa_text(f"""
                WITH tank_list AS (
                    SELECT * FROM (VALUES {','.join(f"({id_})" for id_ in tank_ids)}) AS t(tank_id)
                ),
                latest_log AS (
                    SELECT DISTINCT ON (tank_id)
                        tank_id,
                        refill_date,
                        refill_time,
                        refilled_by,
                        description
                    FROM canister_ln2_logs
                    WHERE tank_id = ANY(ARRAY[{ids_str}])
                    ORDER BY tank_id, refill_date DESC NULLS LAST, refill_time DESC NULLS LAST
                )
                SELECT
                    t.tank_id,
                    tbl.tank_code,
                    hb.branch_name,
                    hb.branch_id,
                    ll.refill_date,
                    ll.refill_time,
                    ll.refilled_by,
                    ll.description
                FROM tank_list t
                JOIN tanks tbl ON tbl.tank_id = t.tank_id
                JOIN hospital_branches hb ON hb.branch_id = tbl.branch_id
                LEFT JOIN latest_log ll ON ll.tank_id = t.tank_id
            """)
        ).fetchall()

        tanks = [
            {
                "tank_id": r.tank_id,
                "tank_code": r.tank_code,
                "branch_name": r.branch_name,
                "branch_id": r.branch_id,
                "last_refill_date": str(r.refill_date) if r.refill_date else None,
                "last_refill_time": str(r.refill_time) if r.refill_time else None,
                "last_refilled_by": r.refilled_by,
                "last_description": r.description,
                # LN2 level progress bar removed from the Refill Log page — see the
                # matching comment above the CTEs. Commented out, not deleted.
                # "kpi_config_id": r.kpi_config_id,
                # "kpi_status": r.kpi_status,
                # "ln2_mass_kg": float(r.ln2_mass_kg) if r.ln2_mass_kg is not None else None,
                # "ln2_config_min": float(r.ln2_config_min) if r.ln2_config_min is not None else None,
                # "tank_max_capacity": float(r.tank_max_capacity_reading) if r.tank_max_capacity_reading is not None else None,
                # "tank_min_capacity": float(r.tank_min_capacity_reading) if r.tank_min_capacity_reading is not None else None,
            }
            for r in tanks_rows
        ]

        # Fetch activity logs
        hospital_clause = ""
        branch_clause = ""
        params: dict = {"ids": tank_ids}

        if current_user.hospital_id:
            hospital_clause = "AND b.hospital_id = :hospital_id"
            params["hospital_id"] = current_user.hospital_id

        if current_user.branch_id and current_user.role not in ("Admin", "Manager", "Mygrape_admin"):
            branch_clause = "AND t.branch_id = :branch_id"
            params["branch_id"] = current_user.branch_id

        logs_rows = db.execute(
            sa_text(f"""
                SELECT
                    l.tank_id,
                    t.tank_code,
                    b.branch_name,
                    l.refill_date,
                    l.refill_time,
                    l.refilled_by,
                    l.description,
                    l.status,
                    l.refill_weight
                FROM canister_ln2_logs l
                JOIN tanks t ON t.tank_id = l.tank_id
                JOIN hospital_branches b ON b.branch_id = t.branch_id
                WHERE l.tank_id = ANY(:ids)
                {hospital_clause}
                {branch_clause}
                ORDER BY l.refill_date DESC NULLS LAST, l.refill_time DESC NULLS LAST
            """),
            params,
        ).fetchall()

        logs = [
            {
                "tank_id": r.tank_id,
                "tank_code": r.tank_code,
                "branch_name": r.branch_name,
                "refill_date": str(r.refill_date) if r.refill_date else None,
                "refill_time": str(r.refill_time) if r.refill_time else None,
                "refilled_by": r.refilled_by,
                "description": r.description,
                "status": str(r.status) if r.status else None,
                "refill_weight": float(r.refill_weight) if r.refill_weight is not None else None,
            }
            for r in logs_rows
        ]

        return {"tanks": tanks, "logs": logs}

    except Exception as e:
        logger.error(f"Error in get_refill_log_page_data: {str(e)}", exc_info=True)
        raise


@router.get("/tanks/select-options")
def get_tanks_for_select(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Lightweight tank list for dropdowns (e.g. the Add Refill Log tank picker) —
    every tank the current user has access to, with branch name, independent of
    whatever's currently loaded on the Refill Log page. Same hospital/branch
    scoping as get_refill_log_page_data.
    """
    try:
        from app.models.IVF.hospital_branch_model import HospitalBranch
        from app.models.IVF.tank_model import Tank

        query = (
            db.query(
                Tank.tank_id,
                Tank.tank_code,
                HospitalBranch.branch_id,
                HospitalBranch.branch_name,
            )
            .join(HospitalBranch, HospitalBranch.branch_id == Tank.branch_id)
        )

        if current_user.hospital_id:
            query = query.filter(HospitalBranch.hospital_id == current_user.hospital_id)

        if current_user.branch_id and current_user.role not in ("Admin", "Manager", "Mygrape_admin"):
            query = query.filter(Tank.branch_id == current_user.branch_id)

        rows = query.order_by(HospitalBranch.branch_name, Tank.tank_code).all()

        return {
            "tanks": [
                {
                    "tank_id": r.tank_id,
                    "tank_code": r.tank_code,
                    "branch_id": r.branch_id,
                    "branch_name": r.branch_name,
                }
                for r in rows
            ]
        }

    except Exception as e:
        logger.error(f"Error in get_tanks_for_select: {str(e)}", exc_info=True)
        raise
