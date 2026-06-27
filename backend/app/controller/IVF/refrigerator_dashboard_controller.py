"""
Refrigerator Dashboard Controller
Endpoints for the hospital-8 refrigerator-only dashboard.
All data is scoped to refrigerator devices (refrigerator_id IS NOT NULL).
"""
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.controller.IVF.ivf_dashboard_controller import get_dashboard_branch_filter
from app.service.IVF.refrigerator_dashboard_service import RefrigeratorDashboardService

router = APIRouter(prefix="/ivf/refrigerator-dashboard", tags=["Refrigerator Dashboard"])


def _to_dt(ts: Optional[float]) -> Optional[datetime]:
    if ts is None:
        return None
    return datetime.fromtimestamp(ts / 1000, tz=timezone.utc)


def _effective_branch(
    query_branch_id: Optional[int],
    role_branch_id: Optional[int],
    role: Optional[str],
) -> Optional[int]:
    """
    Managers/Admins may drill into a clicked branch via query param.
    Users stay locked to their JWT-derived branch — a foreign branch_id is ignored.
    """
    role_normalized = role.title() if role else None
    if role_normalized in ("Manager", "Admin") and query_branch_id is not None:
        return query_branch_id
    return role_branch_id


@router.get("/deviation-trend")
def get_deviation_trend(
    request: Request,
    db: Session = Depends(get_db),
    from_ts: Optional[float] = Query(None),
    to_ts: Optional[float] = Query(None),
    branch_id: Optional[int] = Query(None),
):
    try:
        role_branch_id, role = get_dashboard_branch_filter(request)
        hospital_id = request.state.current_user.hospital_id
        eff_branch = _effective_branch(branch_id, role_branch_id, role)
        service = RefrigeratorDashboardService(db)
        return service.get_deviation_trend(
            hospital_id=hospital_id,
            branch_id=eff_branch,
            role=None,
            from_dt=_to_dt(from_ts),
            to_dt=_to_dt(to_ts),
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting deviation trend: {str(e)}")


@router.get("/deviations-by-category")
def get_deviations_by_category(
    request: Request,
    db: Session = Depends(get_db),
    from_ts: Optional[float] = Query(None),
    to_ts: Optional[float] = Query(None),
    branch_id: Optional[int] = Query(None),
):
    try:
        role_branch_id, role = get_dashboard_branch_filter(request)
        hospital_id = request.state.current_user.hospital_id
        eff_branch = _effective_branch(branch_id, role_branch_id, role)
        service = RefrigeratorDashboardService(db)
        return service.get_deviations_by_category(
            hospital_id=hospital_id,
            branch_id=eff_branch,
            role=None,
            from_dt=_to_dt(from_ts),
            to_dt=_to_dt(to_ts),
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting deviations by category: {str(e)}")


@router.get("/top-kpi")
def get_top_kpi(
    request: Request,
    db: Session = Depends(get_db),
    from_ts: Optional[float] = Query(None),
    to_ts: Optional[float] = Query(None),
    branch_id: Optional[int] = Query(None),
):
    try:
        role_branch_id, role = get_dashboard_branch_filter(request)
        hospital_id = request.state.current_user.hospital_id
        eff_branch = _effective_branch(branch_id, role_branch_id, role)
        service = RefrigeratorDashboardService(db)
        return service.get_top_kpi(
            hospital_id=hospital_id,
            branch_id=eff_branch,
            role=None,
            from_dt=_to_dt(from_ts),
            to_dt=_to_dt(to_ts),
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting top KPI: {str(e)}")


@router.get("/branch-critical-distribution")
def get_branch_critical_distribution(
    request: Request,
    db: Session = Depends(get_db),
    from_ts: Optional[float] = Query(None),
    to_ts: Optional[float] = Query(None),
):
    try:
        hospital_id = request.state.current_user.hospital_id
        service = RefrigeratorDashboardService(db)
        return service.get_branch_critical_distribution(
            hospital_id=hospital_id,
            from_dt=_to_dt(from_ts),
            to_dt=_to_dt(to_ts),
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting branch distribution: {str(e)}")


@router.get("/temperature-humidity-trend")
def get_temperature_humidity_trend(
    request: Request,
    db: Session = Depends(get_db),
    from_ts: Optional[float] = Query(None),
    to_ts: Optional[float] = Query(None),
    branch_id: Optional[int] = Query(None),
):
    try:
        role_branch_id, role = get_dashboard_branch_filter(request)
        hospital_id = request.state.current_user.hospital_id
        eff_branch = _effective_branch(branch_id, role_branch_id, role)
        service = RefrigeratorDashboardService(db)
        return service.get_temperature_humidity_trend(
            hospital_id=hospital_id,
            branch_id=eff_branch,
            role=None,
            from_dt=_to_dt(from_ts),
            to_dt=_to_dt(to_ts),
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting temperature/humidity trend: {str(e)}")


@router.get("/operations")
def get_operations_counts(
    request: Request,
    db: Session = Depends(get_db),
    branch_id: Optional[int] = Query(None),
):
    try:
        role_branch_id, role = get_dashboard_branch_filter(request)
        hospital_id = request.state.current_user.hospital_id
        user_id = request.state.current_user.user_id
        eff_branch = _effective_branch(branch_id, role_branch_id, role)
        service = RefrigeratorDashboardService(db)
        return service.get_operations_counts(
            hospital_id=hospital_id,
            branch_id=eff_branch,
            role=None,
            user_id=user_id,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting operations counts: {str(e)}")
