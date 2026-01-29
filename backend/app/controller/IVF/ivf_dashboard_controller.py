"""
IVF Dashboard Controller
Controller for IVF dashboard metrics endpoints with role-based access control.
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from starlette.requests import Request
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.service.IVF.ivf_dashboard_service import IVFDashboardService
from app.schemas.IVF.ivf_dashboard_schema import (
    TotalEmbryosCryolocksResponse,
    TotalContainersResponse,
    QualityDeviationsFlaggedResponse,
    TopDeviationDriverResponse,
    OutboundShipmentsResponse,
    DeviationsGraphResponse
)

router = APIRouter(prefix="/ivf/dashboard", tags=["IVF Dashboard"])


def get_dashboard_branch_filter(request: Request) -> tuple:
    """
    Get branch filter information for IVF dashboard.
    
    Dashboard-specific rules:
    - Manager role with IVF department: Show all sites (no branch filter)
    - User role with IVF department: Show only their branch
    - Admin role: Show all sites (no branch filter)
    - Non-IVF users: No filtering (should not access IVF dashboard)
    
    Args:
        request: FastAPI Request object with current_user in request.state
        
    Returns:
        Tuple of (branch_id, role):
        - branch_id: Branch ID to filter by, or None if no filtering
        - role: User's role, or None if not an IVF user
    """
    # Get current user from request state (injected by middleware)
    if not hasattr(request.state, "current_user"):
        return None, None
    
    user = request.state.current_user
    
    # Check if user is from IVF department (IVF dashboard is only for IVF users)
    if not user.department or user.department.upper() != "IVF":
        # Not an IVF user - no access to IVF dashboard
        return None, None
    
    # Get user's role
    role = user.role.value if hasattr(user.role, 'value') else str(user.role)
    role_normalized = role.title() if role else None
    
    # Admin role: no branch filtering (can see all branches)
    if role_normalized == "Admin":
        return None, role_normalized
    
    # Manager role: no branch filtering for dashboard (can see all sites)
    if role_normalized == "Manager":
        return None, role_normalized
    
    # User role: filter by their branch
    if role_normalized == "User":
        branch_id = user.branch_id
        if branch_id is None:
            # User without branch_id - shouldn't happen, but handle gracefully
            return None, role_normalized
        return branch_id, role_normalized
    
    # Unknown role - no filtering
    return None, role_normalized


@router.get("/metrics/total-embryos-cryolocks", response_model=TotalEmbryosCryolocksResponse)
def get_total_embryos_cryolocks(
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Get total count of embryos and cryolocks.
    
    Metric 1: Total Embryos/Cryolocks (for all the sites)
    
    Role-based access:
    - Manager (IVF): See metrics across all sites
    - User (IVF): See metrics only for their assigned branch
    - Admin: See metrics across all sites
    """
    try:
        branch_id, role = get_dashboard_branch_filter(request)
        
        service = IVFDashboardService(db)
        result = service.get_total_embryos_cryolocks(branch_id=branch_id, role=role)
        
        return TotalEmbryosCryolocksResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting total embryos/cryolocks: {str(e)}")


@router.get("/metrics/total-containers", response_model=TotalContainersResponse)
def get_total_containers(
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Get total number of containers (canisters).
    
    Metric 2: Total number of Containers (For all Sites)
    
    Role-based access:
    - Manager (IVF): See metrics across all sites
    - User (IVF): See metrics only for their assigned branch
    - Admin: See metrics across all sites
    """
    try:
        branch_id, role = get_dashboard_branch_filter(request)
        
        service = IVFDashboardService(db)
        result = service.get_total_containers(branch_id=branch_id, role=role)
        
        return TotalContainersResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting total containers: {str(e)}")


@router.get("/metrics/quality-deviations-flagged", response_model=QualityDeviationsFlaggedResponse)
def get_quality_deviations_flagged(
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Get count of quality deviations flagged.
    
    Metric 3: # Quality Deviations Flagged (For all Sites)
    
    Quality deviations are based on:
    - Canisters with status "risk" or "critical"
    - Canister LN2 logs with low LN2 levels
    
    Role-based access:
    - Manager (IVF): See metrics across all sites
    - User (IVF): See metrics only for their assigned branch
    - Admin: See metrics across all sites
    """
    try:
        branch_id, role = get_dashboard_branch_filter(request)
        
        service = IVFDashboardService(db)
        result = service.get_quality_deviations_flagged(branch_id=branch_id, role=role)
        
        return QualityDeviationsFlaggedResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting quality deviations: {str(e)}")


@router.get("/metrics/top-deviation-driver", response_model=TopDeviationDriverResponse)
def get_top_deviation_driver(
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Get top deviation driver.
    
    Metric 4: Top Deviation Driver
    
    Returns the KPI (Key Performance Indicator) with the highest deviation count.
    KPIs tracked:
    - Temperature deviations
    - Humidity deviations
    - Agitation deviations
    
    Role-based access:
    - Manager (IVF): See metrics across all sites
    - User (IVF): See metrics only for their assigned branch
    - Admin: See metrics across all sites
    """
    try:
        branch_id, role = get_dashboard_branch_filter(request)
        
        service = IVFDashboardService(db)
        result = service.get_top_deviation_driver(branch_id=branch_id, role=role)
        
        return TopDeviationDriverResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting top deviation driver: {str(e)}")


@router.get("/metrics/outbound-shipments", response_model=OutboundShipmentsResponse)
def get_outbound_shipments(
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Get count of outbound shipments.
    
    Metric 5: # Outbound Shipments (For all Sites)
    
    For IVF context, "outbound shipments" refers to patient shipments
    between sites (source_location -> destination_location).
    
    If there are no shipment details, returns 0.
    
    Role-based access:
    - Manager (IVF): See metrics across all sites
    - User (IVF): See metrics only for their assigned branch
    - Admin: See metrics across all sites
    """
    try:
        branch_id, role = get_dashboard_branch_filter(request)
        
        service = IVFDashboardService(db)
        result = service.get_outbound_shipments(branch_id=branch_id, role=role)
        
        return OutboundShipmentsResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting outbound shipments: {str(e)}")


@router.get("/metrics/deviations-graph", response_model=DeviationsGraphResponse)
def get_deviations_graph(
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Get deviations graph data for Quality deviation chart.
    
    Chart structure (Horizontal bar chart):
    - Y-axis: Containers (User view) or Sites (Manager/Admin view)
    - X-axis: Deviation values (0-100)
    - For each container/site: Two horizontal bars
      1. Stacked bar: Temperature (purple), Humidity (grey), Agitation/Vibration (pink)
      2. Solid bar: Top risk driver (blue) - maximum deviation value
    
    Role-based access:
    - User (IVF): Container-wise deviations within the site
    - Manager/Admin (IVF): Cumulative deviations per site with top deviation type
    """
    try:
        branch_id, role = get_dashboard_branch_filter(request)
        
        service = IVFDashboardService(db)
        result = service.get_deviations_graph(branch_id=branch_id, role=role)
        
        return DeviationsGraphResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting deviations graph: {str(e)}")
