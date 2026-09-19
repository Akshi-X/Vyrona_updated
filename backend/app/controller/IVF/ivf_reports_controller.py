"""
IVF Reports Controller
Endpoints for IVF reports with role-based access control.
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.schemas.IVF.report_schema import (
    CriticalAlertReportResponse,
    MonthlySummaryReportResponse,
    RefillLogReportResponse,
)
from app.service.IVF.ivf_reports_service import IVFReportsService
from app.utils.ivf_helpers import get_branch_filter_info

router = APIRouter(prefix="/ivf/reports", tags=["IVF Reports"])


@router.get("/monthly-summary", response_model=MonthlySummaryReportResponse)
def get_monthly_summary_report(
    request: Request,
    month: Optional[str] = Query(None, description="Month in YYYY-MM format"),
    page: int = Query(1, ge=1, le=10000, description="Page number"),
    page_size: int = Query(20, ge=1, le=200, description="Page size"),
    db: Session = Depends(get_db),
):
    """
    Monthly summary report with KPI alert counts and deviations.

    Role-based access:
    - User: Limited to their branch
    - Manager/Admin: All branches within the hospital
    """
    try:
        branch_id, role = get_branch_filter_info(request, is_quality_tracking=False)
        if role == "User" and branch_id is None:
            raise HTTPException(status_code=403, detail="User does not have an assigned branch")
        hospital_id = getattr(request.state.current_user, "hospital_id", None)
        if hospital_id is None:
            raise HTTPException(status_code=400, detail="Hospital ID not found")

        service = IVFReportsService(db)
        result = service.get_monthly_summary(
            hospital_id=hospital_id,
            branch_id=branch_id,
            role=role,
            month=month,
            page=page,
            page_size=page_size,
        )
        return MonthlySummaryReportResponse(**result)
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error getting monthly summary: {str(exc)}")


@router.get("/critical-alerts", response_model=CriticalAlertReportResponse)
def get_critical_alert_report(
    request: Request,
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    status: Optional[str] = Query(None, description="Alert status (Active/Acknowledged)"),
    severity: Optional[str] = Query(None, description="Alert severity (High/Medium/Low)"),
    tank_codes: Optional[List[str]] = Query(None, description="Filter by tank codes"),
    incubator_codes: Optional[List[str]] = Query(None, description="Filter by incubator codes"),
    refrigerator_codes: Optional[List[str]] = Query(None, description="Filter by refrigerator codes"),
    page: int = Query(1, ge=1, le=10000, description="Page number"),
    page_size: int = Query(20, ge=1, le=200, description="Page size"),
    db: Session = Depends(get_db),
):
    """
    Critical alert report for IVF alerts within a date range.

    Role-based access:
    - User: Limited to their branch
    - Manager/Admin: All branches within the hospital
    """
    try:
        branch_id, role = get_branch_filter_info(request, is_quality_tracking=False)
        if role == "User" and branch_id is None:
            raise HTTPException(status_code=403, detail="User does not have an assigned branch")
        hospital_id = getattr(request.state.current_user, "hospital_id", None)
        if hospital_id is None:
            raise HTTPException(status_code=400, detail="Hospital ID not found")

        service = IVFReportsService(db)
        result = service.get_critical_alerts_report(
            hospital_id=hospital_id,
            branch_id=branch_id,
            role=role,
            start_date=start_date,
            end_date=end_date,
            status=status,
            severity=severity,
            tank_codes=tank_codes,
            incubator_codes=incubator_codes,
            refrigerator_codes=refrigerator_codes,
            page=page,
            page_size=page_size,
        )
        return CriticalAlertReportResponse(**result)
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error getting critical alerts report: {str(exc)}")


@router.get("/refill-logs", response_model=RefillLogReportResponse)
def get_refill_logs_report(
    request: Request,
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    status: Optional[str] = Query(None, description="Refill status"),
    tank_codes: Optional[List[str]] = Query(None, description="Filter by tank codes"),
    page: int = Query(1, ge=1, le=10000, description="Page number"),
    page_size: int = Query(20, ge=1, le=200, description="Page size"),
    db: Session = Depends(get_db),
):
    """
    Refill logs report for IVF.

    Role-based access:
    - User: Limited to their branch
    - Manager/Admin: All branches within the hospital
    """
    try:
        branch_id, role = get_branch_filter_info(request, is_quality_tracking=False)
        if role == "User" and branch_id is None:
            raise HTTPException(status_code=403, detail="User does not have an assigned branch")
        hospital_id = getattr(request.state.current_user, "hospital_id", None)
        if hospital_id is None:
            raise HTTPException(status_code=400, detail="Hospital ID not found")

        service = IVFReportsService(db)
        result = service.get_refill_logs_report(
            hospital_id=hospital_id,
            branch_id=branch_id,
            role=role,
            start_date=start_date,
            end_date=end_date,
            status=status,
            tank_codes=tank_codes,
            page=page,
            page_size=page_size,
        )
        return RefillLogReportResponse(**result)
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error getting refill logs report: {str(exc)}")
