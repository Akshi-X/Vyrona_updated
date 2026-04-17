"""
Activity Log Controller
Endpoints for querying activity logs with role-based access.
"""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.schemas.activity_log_schema import ActivityLogQueryResponse
from app.service.activity_log_service import ActivityLogService

router = APIRouter(prefix="/activity-logs", tags=["Activity Logs"])


@router.get("", response_model=ActivityLogQueryResponse)
def get_activity_logs(
    request: Request,
    action_prefix: Optional[str] = Query(None, description="Filter by action prefix (e.g., config.)"),
    action: Optional[str] = Query(None, description="Exact action match"),
    actor_type: Optional[str] = Query(None, description="Actor type"),
    actor_id: Optional[str] = Query(None, description="Actor ID"),
    target_type: Optional[str] = Query(None, description="Target type"),
    target_id: Optional[str] = Query(None, description="Target ID"),
    outcome: Optional[str] = Query(None, description="Outcome: success/failure/partial"),
    metadata_key: Optional[str] = Query(None, description="Metadata key to filter"),
    metadata_value: Optional[str] = Query(None, description="Metadata value to filter"),
    date_from: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    date_to: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    page: int = Query(1, ge=1, le=10000),
    page_size: int = Query(20, ge=1, le=200),
    db: Session = Depends(get_db),
):
    current_user = getattr(request.state, "current_user", None)
    role_value = getattr(current_user, "role", None)
    role_name = role_value.value if hasattr(role_value, "value") else str(role_value or "")
    if role_name.lower() not in {"admin", "manager"}:
        raise HTTPException(status_code=403, detail="Access denied")

    try:
        start_dt = datetime.strptime(date_from, "%Y-%m-%d") if date_from else None
        end_dt = datetime.strptime(date_to, "%Y-%m-%d") if date_to else None
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD.") from exc

    service = ActivityLogService(db)
    rows, total_count = service.query_logs(
        action_prefix=action_prefix,
        action=action,
        actor_type=actor_type,
        actor_id=actor_id,
        target_type=target_type,
        target_id=target_id,
        outcome=outcome,
        metadata_key=metadata_key,
        metadata_value=metadata_value,
        date_from=start_dt,
        date_to=end_dt,
        page=page,
        page_size=page_size,
    )
    logs = service.enrich_logs(rows)

    return ActivityLogQueryResponse(
        logs=logs,
        total_count=total_count,
        page=page,
        page_size=page_size,
        status="success",
    )
