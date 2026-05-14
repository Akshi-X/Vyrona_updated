"""
Report Actions Controller
Logs report download actions for audit trails.
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.schemas.activity_log_schema import ActivityLogDownloadRequest, ActivityLogDownloadResponse
from app.service.activity_log_service import (
    ActivityLogService,
    build_actor_from_user,
    build_target,
    is_audit_log_disabled_for_user,
)
from app.constants.enums import ActivityOutcome

router = APIRouter(prefix="/reports", tags=["Reports"])


@router.post("/download", response_model=ActivityLogDownloadResponse)
def log_report_download(
    request: Request,
    payload: ActivityLogDownloadRequest,
    db: Session = Depends(get_db),
):
    current_user = getattr(request.state, "current_user", None)
    if not current_user:
        raise HTTPException(status_code=401, detail="User not authenticated")

    report_type = (payload.report_type or "").strip()
    if not report_type:
        raise HTTPException(status_code=400, detail="report_type is required")

    ActivityLogService(db).log_activity(
        action=f"report.{report_type}.downloaded",
        outcome=ActivityOutcome.SUCCESS.value,
        actor=build_actor_from_user(current_user),
        target=build_target("report", report_type),
        metadata=payload.filters or {},
        audit_log_disabled=is_audit_log_disabled_for_user(current_user),
    )

    return ActivityLogDownloadResponse(status="success")
