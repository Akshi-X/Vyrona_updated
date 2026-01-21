"""
Quality Tracking Controller
Handles HTTP requests for quality tracking operations including LN2 refill logs
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, Query, Path, Request
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
    IVFQualityKpiResponse,
    IVFCanisterTrackingResponse
)
from app.constants.enums import TaskStatus
from app.utils.ivf_helpers import get_branch_filter_info

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/quality-tracking",
    tags=["IVF Quality Tracking"]
)


@router.post("/canisters/{canister_id}/refill-logs", response_model=RefillLogResponse, status_code=201)
def create_refill_log(
    canister_id: int = Path(..., description="Canister ID from URL"),
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
    - Liquid Nitrogen Volume: Volume percentage (0-100)
    - Description: Optional description or notes
    - Status: Status of the refill log (default: Not started)
    """
    try:
        quality_tracking_service = QualityTrackingService(db)
        branch_id, _ = get_branch_filter_info(request) if request else (None, None)
        return quality_tracking_service.create_refill_log(
            canister_id=canister_id,
            refill_log_data=refill_log_data,
            created_by=current_user.email if current_user else None,
            branch_id=branch_id
        )
    except Exception as e:
        logger.error(f"Error in create_refill_log endpoint: {str(e)}", exc_info=True)
        raise


@router.get("/canisters/{canister_id}/refill-logs", response_model=RefillLogListResponse)
def get_refill_logs_by_container(
    canister_id: int = Path(..., description="Canister ID from URL"),
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


@router.patch("/canisters/{canister_id}/refill-logs/{log_id}/status", response_model=RefillLogResponse)
def update_refill_log_status(
    canister_id: int = Path(..., description="Canister ID from URL"),
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


@router.get("/canisters/{canister_id}/kpis", response_model=IVFQualityKpiResponse)
def get_ivf_quality_kpis(
    canister_id: int = Path(..., description="Canister ID from URL"),
    limit: int = Query(50, ge=1, le=500, description="Max number of readings to include"),
    request: Request = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Fetch IVF container quality KPIs and tracking data.
    """
    try:
        branch_id, _ = get_branch_filter_info(request) if request else (None, None)
        quality_tracking_service = QualityTrackingService(db)
        return quality_tracking_service.get_ivf_quality_kpis(
            canister_id=canister_id,
            limit=limit,
            branch_id=branch_id
        )
    except Exception as e:
        logger.error(f"Error in get_ivf_quality_kpis endpoint: {str(e)}", exc_info=True)
        raise


@router.get("/canisters/{canister_id}/tracking-details", response_model=IVFCanisterTrackingResponse)
def get_canister_tracking_details(
    canister_id: int = Path(..., description="Canister ID from URL"),
    request: Request = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Fetch tracking details for a specific canister.
    """
    try:
        branch_id, _ = get_branch_filter_info(request) if request else (None, None)
        quality_tracking_service = QualityTrackingService(db)
        return quality_tracking_service.get_canister_tracking_details(
            canister_id=canister_id,
            branch_id=branch_id
        )
    except Exception as e:
        logger.error(f"Error in get_canister_tracking_details endpoint: {str(e)}", exc_info=True)
        raise

