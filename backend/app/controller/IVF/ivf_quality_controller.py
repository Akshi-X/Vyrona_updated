"""
IVF Quality Monitoring Controller
Handles WebSocket and REST endpoints for real-time IVF canister quality monitoring
Separate from CGT quality monitoring to maintain isolation
"""

import asyncio
import json
import logging
import math
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import (
    APIRouter,
    Body,
    Depends,
    HTTPException,
    Path,
    Query,
    Request,
    WebSocket,
    WebSocketDisconnect,
)
from sqlalchemy.orm import Session

from app.auth.auth import verify_websocket_token
from app.config.database import SessionLocal, get_db
from app.constants.kpi_constants import (
    AGG_BUCKET_MINUTES_1H,
    AGG_BUCKET_MINUTES_7D,
    AGG_BUCKET_MINUTES_24H,
)
from app.constants.enums import ActivityOutcome
from app.dependencies.auth_dependencies import get_current_user
from app.exceptions import InvalidTokenException
from app.models.IVF.device_model import Device
from app.models.IVF.hospital_model import Hospital
from app.models.IVF.hospital_branch_model import HospitalBranch
from app.models.IVF.ln2_iot_device_model import Ln2IotDevice
from app.models.IVF.ln2_iot_raw_data_model import Ln2IotRawData
from app.models.IVF.ln2_readings_model import Ln2Reading
from app.models.IVF.patient_crylock_info_model import PatientCrylockInfo
from app.models.IVF.tank_model import Tank
from app.models.IVF.incubator_model import Incubator
from app.models.IVF.refrigerator_model import Refrigerator
from app.models.kpi_config_model import KpiConfig
from app.models.readings_model import Readings
from app.models.user_model import User
from app.service.activity_log_service import (
    ActivityLogService,
    build_actor_from_user,
    build_target,
    is_audit_log_disabled_for_user,
)
from app.service.IVF.quality_tracking_service import QualityTrackingService
from app.service.quality_service import (
    QualityService,
    append_incubator_kpi_snapshot_to_db,
    append_tank_kpi_snapshot_to_db,
    push_incubator_kpi_to_redis,
    push_ivf_quality_to_redis,
    push_refrigerator_kpi_to_redis,
    push_tank_kpi_to_redis,
)
from app.service.redis_service import get_incubator_kpi_pubsub, get_ln2_pubsub, get_redis, get_refrigerator_kpi_pubsub, get_tank_kpi_pubsub
from app.utils.ivf_helpers import get_branch_filter_info
from app.utils.user_helpers import is_hospital_department, is_specific_department
from app.utils.websocket_manager import ConnectionManager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ivf/quality", tags=["IVF Quality Monitoring"])

# Import shared connection manager from CGT quality controller
from app.controller import quality_controller

# Use the same connection manager instance as CGT for shared Redis listener
manager = quality_controller.manager

# Separate connection manager for LN2 readings WebSocket (do not disturb legacy quality/ws)
ln2_manager = ConnectionManager()


@router.get("/tanks/{tank_code}/history")
def get_quality_history(
    tank_code: str = Path(..., description="Tank code (e.g., T30)"),
    limit: int = Query(30, ge=1, le=100),
    request: Request = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get quality tracking history for a tank. Used for initial UI load before WebSocket connects.
    Returns data from Redis or ln2_iot_raw_data fallback.
    """
    branch_id, role = get_branch_filter_info(request) if request else (None, None)

    tank_code_str = str(tank_code).strip()
    query = db.query(Tank).filter(Tank.tank_code == tank_code_str)
    if role != "Admin" and branch_id is not None:
        query = query.filter(Tank.branch_id == branch_id)
    tank = query.first()

    if not tank:
        raise HTTPException(status_code=404, detail=f"Tank '{tank_code}' not found")

    tank_id = tank.tank_id
    quality_service = QualityService(db)
    try:
        quality_service.validate_tank_belongs_to_branch(tank_id, branch_id, current_user.hospital_id)
    except Exception as e:
        raise HTTPException(status_code=403, detail=str(e))

    history = quality_service.get_tank_redis_history(tank_id, limit=limit)

    if not history:
        raw_records = (
            db.query(Ln2IotRawData)
            .filter(Ln2IotRawData.tank_id == tank_id)
            .order_by(Ln2IotRawData.created_at.desc())
            .limit(limit)
            .all()
        )
        for rec in reversed(raw_records):
            p = rec.payload or {}
            if p.get("temp_internal") is not None and p.get("shock") is not None:
                ts = (
                    rec.created_at.isoformat()
                    if rec.created_at
                    else (p.get("timestamp") or "")
                )
                hist_item = {
                    "tank_code": tank_code_str,
                    "tank_id": tank_id,
                    "timestamp": ts,
                    "temp_internal": float(p.get("temp_internal")),
                    "temp_external": float(p["temp_external"])
                    if p.get("temp_external") is not None
                    else None,
                    "shock": float(p.get("shock")),
                }
                if p.get("battery_percentage") is not None:
                    hist_item["battery_percentage"] = float(p["battery_percentage"])
                push_ivf_quality_to_redis(
                    tank_id, tank_code_str, hist_item, publish=False
                )
                history.append(hist_item)

    return {"tank_code": tank_code_str, "tank_id": tank_id, "history": history}


@router.get("/tanks/{tank_code}/ln2-history")
def get_ln2_history(
    tank_code: str = Path(..., description="Tank code (e.g., T30)"),
    limit: int = Query(30, ge=1, le=100),
    request: Request = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get LN2 readings history for a tank. Used for initial UI load before ln2-ws connects.
    Returns evaporation_rate_kg_per_h, ln2_mass_kg (Redis first, then DB fallback).
    """
    branch_id, role = get_branch_filter_info(request) if request else (None, None)

    tank_code_str = str(tank_code).strip()
    query = db.query(Tank).filter(Tank.tank_code == tank_code_str)
    if role != "Admin" and branch_id is not None:
        query = query.filter(Tank.branch_id == branch_id)
    tank = query.first()
    if not tank:
        raise HTTPException(status_code=404, detail=f"Tank '{tank_code}' not found")

    tank_id = tank.tank_id
    quality_service = QualityService(db)
    try:
        quality_service.validate_tank_belongs_to_branch(tank_id, branch_id, current_user.hospital_id)
    except Exception as e:
        raise HTTPException(status_code=403, detail=str(e))

    # Redis first, then DB fallback
    history = _get_ln2_history_for_tank(db, tank_id, tank_code_str, limit=limit)
    return {"tank_code": tank_code_str, "tank_id": tank_id, "history": history}


@router.get("/tanks/by-id/{tank_id}/ln2-history")
def get_ln2_history_by_id(
    tank_id: int = Path(..., description="Tank ID (integer)"),
    limit: int = Query(30, ge=1, le=100),
    request: Request = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get LN2 readings history for a tank by tank_id (integer)."""
    branch_id, role = get_branch_filter_info(request) if request else (None, None)

    query = db.query(Tank).filter(Tank.tank_id == tank_id)
    if role != "Admin" and branch_id is not None:
        query = query.filter(Tank.branch_id == branch_id)
    tank = query.first()
    if not tank:
        raise HTTPException(status_code=404, detail=f"Tank with id '{tank_id}' not found")

    try:
        QualityService(db).validate_tank_belongs_to_branch(tank_id, branch_id, current_user.hospital_id)
    except Exception as e:
        raise HTTPException(status_code=403, detail=str(e))

    history = _get_ln2_history_for_tank(db, tank_id, tank.tank_code, limit=limit)
    return {"tank_code": tank.tank_code, "tank_id": tank_id, "history": history}


@router.get("/tanks/{tank_id}/kpi-config")
def get_tank_kpi_config(
    tank_id: int = Path(..., description="Tank ID"),
    request: Request = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get KPI limits config for the tank (nested kpi_limits for frontend visualization)."""
    branch_id, role = get_branch_filter_info(request) if request else (None, None)
    query = db.query(Tank).filter(Tank.tank_id == tank_id)
    if role != "Admin" and branch_id is not None:
        query = query.filter(Tank.branch_id == branch_id)
    tank = query.first()
    if not tank:
        raise HTTPException(status_code=404, detail=f"Tank id '{tank_id}' not found")
    quality_service = QualityService(db)
    try:
        quality_service.validate_tank_belongs_to_branch(tank_id, branch_id, current_user.hospital_id)
    except Exception as e:
        raise HTTPException(status_code=403, detail=str(e))
    return quality_service.get_tank_kpi_config(tank_id, tank.tank_code or f"T{tank_id}")


# Duration minutes for static aggregated ranges (1H, 24H, 7D). LIVE = no duration, raw (default cap applied in code).
DURATION_1H = 60
DURATION_24H = 1440
DURATION_7D = 10080
# Default max readings for LIVE (raw) when no duration_minutes; no limit param in API.
DEFAULT_LIVE_READINGS_CAP = 50
# Total points budget across all KPI series for LIVE mode after backend refinement.
LIVE_SERIES_TOTAL_POINTS_BUDGET = 300


def _parse_kpi_from_dedup(dedup_key: str) -> str:
    """Extract kpi_name from dedup_key: tank_id:source:alert_type:YYYY-MM-DD_HH:MM:SS:extra_info.
    The timestamp contains 2 colons, so extra_info is after the 6th colon (index 6 in a 7-part split)."""
    if not dedup_key:
        return ''
    parts = dedup_key.split(':', 6)
    return parts[6].strip() if len(parts) > 6 else ''


def _floor_to_bucket_iso(ts, bucket_minutes: int) -> str:
    """Floor a timestamp (string or datetime) to the nearest bucket boundary. Returns ISO string."""
    try:
        if isinstance(ts, datetime):
            dt = ts if ts.tzinfo else ts.replace(tzinfo=timezone.utc)
        else:
            s = str(ts).strip().replace(' ', 'T')
            if not s.endswith('Z') and '+' not in s[-6:] and '-' not in s[-6:]:
                s += '+00:00'
            dt = datetime.fromisoformat(s)
        dt_utc = dt.astimezone(timezone.utc)
        epoch = int(dt_utc.timestamp())
        bucket_secs = bucket_minutes * 60
        floored = (epoch // bucket_secs) * bucket_secs
        return datetime.fromtimestamp(floored, tz=timezone.utc).strftime('%Y-%m-%dT%H:%M:%S')
    except Exception:
        return ''


_LID_KPI_NAME = "ln2_lid_state"


def _attach_lid_open_events(quality_service, tank_id: int, kpi_series: dict,
                            since_utc: datetime, until_utc: datetime) -> None:
    """Replace the bucketed lid_state series with exact continuous open periods
    ("lid_open_periods"), each carrying the count of lid alerts that occurred within it."""
    if kpi_series.pop(_LID_KPI_NAME, None) is None:
        return

    periods = quality_service.get_lid_open_periods_with_exact_times(
        tank_id, since_utc, until=until_utc, lid_kpi_name=_LID_KPI_NAME
    )

    def _parse_ts(value) -> Optional[datetime]:
        try:
            parsed = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
        except (TypeError, ValueError):
            return None

    # Exact lid alert timestamps in range, resolved via dedup_key → kpi_config → kpi_name
    from app.models.IVF.critical_alert_model import CriticalAlert
    from app.models.kpi_config_model import KpiConfig
    lid_alert_times: list = []
    try:
        alerts = quality_service.db.query(CriticalAlert).filter(
            CriticalAlert.tank_id == tank_id,
            CriticalAlert.occurred_at >= since_utc,
            CriticalAlert.occurred_at <= until_utc,
        ).all()
        config_ids = {
            int(raw_id) for alert in alerts
            if (raw_id := _parse_kpi_from_dedup(alert.dedup_key or '')) and raw_id.isdigit()
        }
        id_to_name = dict(
            quality_service.db.query(KpiConfig.id, KpiConfig.kpi_name)
            .filter(KpiConfig.id.in_(config_ids)).all()
        ) if config_ids else {}
        for alert in alerts:
            raw_id = _parse_kpi_from_dedup(alert.dedup_key or '')
            name = id_to_name.get(int(raw_id)) if raw_id and raw_id.isdigit() else raw_id
            if name == _LID_KPI_NAME and alert.occurred_at is not None:
                occurred = alert.occurred_at if alert.occurred_at.tzinfo else alert.occurred_at.replace(tzinfo=timezone.utc)
                lid_alert_times.append(occurred)
    except Exception:
        pass

    for period in periods:
        start = _parse_ts(period['start'])
        stop = _parse_ts(period['stop'])
        period['alert_count'] = sum(
            1 for occurred in lid_alert_times
            if start is not None and stop is not None and start <= occurred <= stop
        )

    kpi_series["lid_open_periods"] = periods


def _attach_alert_counts(db: Session, tank_id: int, kpi_series: dict,
                          since_utc: datetime, until_utc: datetime, bucket_minutes: int) -> None:
    """Query critical_alerts for the time range, resolve kpi_config_id (extra_info) → kpi_name,
    and attach alert_count to each matching kpi_series data point."""
    from collections import defaultdict
    from app.models.IVF.critical_alert_model import CriticalAlert
    from app.models.kpi_config_model import KpiConfig
    try:
        alerts = db.query(CriticalAlert).filter(
            CriticalAlert.tank_id == tank_id,
            CriticalAlert.occurred_at >= since_utc,
            CriticalAlert.occurred_at <= until_utc,
        ).all()
    except Exception:
        return

    # Collect all unique kpi_config IDs from extra_info
    kpi_config_ids: set = set()
    for alert in alerts:
        raw_id = _parse_kpi_from_dedup(alert.dedup_key or '')
        if raw_id and raw_id.isdigit():
            kpi_config_ids.add(int(raw_id))

    # Resolve kpi_config_id → kpi_name
    id_to_kpi_name: dict = {}
    if kpi_config_ids:
        try:
            configs = db.query(KpiConfig.id, KpiConfig.kpi_name).filter(
                KpiConfig.id.in_(kpi_config_ids)
            ).all()
            id_to_kpi_name = {row.id: row.kpi_name for row in configs}
        except Exception:
            pass

    # Build alert_counts[kpi_name][bucket_iso] = count
    alert_counts: dict = defaultdict(lambda: defaultdict(int))
    for alert in alerts:
        raw_id = _parse_kpi_from_dedup(alert.dedup_key or '')
        if not raw_id:
            continue
        kpi_name = id_to_kpi_name.get(int(raw_id)) if raw_id.isdigit() else raw_id
        if not kpi_name:
            continue
        bucket_iso = _floor_to_bucket_iso(alert.occurred_at, bucket_minutes)
        if bucket_iso:
            alert_counts[kpi_name][bucket_iso] += 1

    # Attach to each data point in kpi_series
    for kpi_name, points in kpi_series.items():
        kpi_alert_map = alert_counts.get(kpi_name, {})
        for point in points:
            bucket_iso = _floor_to_bucket_iso(point.get('timestamp'), bucket_minutes)
            point['alert_count'] = kpi_alert_map.get(bucket_iso, 0)


def _to_float_or_none(value) -> Optional[float]:
    try:
        if value is None:
            return None
        out = float(value)
        if math.isfinite(out):
            return out
    except (TypeError, ValueError):
        return None
    return None


def _aggregate_live_points_avg(points: List[dict], max_points: int) -> List[dict]:
    """Reduce dense LIVE raw points using average aggregation per chunk.

    Returns timestamp-ordered points where each output point is the chunk average,
    using the last timestamp in each chunk so latest edge remains visible.
    """
    if max_points <= 0 or len(points) <= max_points:
        return points

    chunk_size = max(1, math.ceil(len(points) / max_points))
    aggregated: List[dict] = []

    for start in range(0, len(points), chunk_size):
        end = min(start + chunk_size, len(points))
        if start >= end:
            continue
        chunk = points[start:end]
        values: List[float] = []
        for idx in range(start, end):
            val = _to_float_or_none(points[idx].get("value"))
            if val is not None:
                values.append(val)

        if not values:
            continue

        avg_val = sum(values) / len(values)
        base = dict(chunk[-1])
        base["value"] = avg_val
        base["avg"] = avg_val
        base["min"] = None
        base["max"] = None
        base["count"] = len(values)
        aggregated.append(base)

    if len(aggregated) > max_points:
        aggregated = aggregated[-max_points:]
    return aggregated


@router.get("/tanks/{tank_id}/kpi-history")
def get_tank_kpi_history(
    tank_id: int = Path(..., description="Tank ID"),
    duration_minutes: Optional[int] = Query(
        None,
        description="LIVE=omit. Static: 60=1H (1min buckets), 1440=24H (30min buckets), 10080=7D (6h buckets). 10=10M raw.",
    ),
    request: Request = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get KPI history. LIVE (no duration)=raw last N (capped in code). Static 1H/24H/7D=aggregated in DB. 10M=raw by timestamp. No limit query param."""
    branch_id, role = get_branch_filter_info(request) if request else (None, None)
    query = db.query(Tank).filter(Tank.tank_id == tank_id)
    if role != "Admin" and branch_id is not None:
        query = query.filter(Tank.branch_id == branch_id)
    tank = query.first()
    if not tank:
        raise HTTPException(status_code=404, detail=f"Tank id '{tank_id}' not found")
    quality_service = QualityService(db)
    try:
        quality_service.validate_tank_belongs_to_branch(tank_id, branch_id, current_user.hospital_id)
    except Exception as e:
        raise HTTPException(status_code=403, detail=str(e))

    since = (
        datetime.now(timezone.utc) - timedelta(minutes=duration_minutes)
        if duration_minutes
        else None
    )
    latest_timestamp = None
    if duration_minutes in {DURATION_1H, DURATION_24H, DURATION_7D}:
        latest_timestamp = quality_service.get_latest_tank_kpi_timestamp(tank_id)
        if latest_timestamp is not None:
            since = latest_timestamp - timedelta(minutes=duration_minutes)

    # Static aggregated ranges: efficient MIN/MAX/AVG in DB, no limit
    if duration_minutes == DURATION_1H:
        per_kpi = (
            quality_service.get_tank_kpi_history_aggregated(
                tank_id, since, AGG_BUCKET_MINUTES_1H, until=latest_timestamp
            )
            or {}
        )
        latest_readings_raw = per_kpi
        aggregated_order_asc = True
    elif duration_minutes == DURATION_24H:
        per_kpi = (
            quality_service.get_tank_kpi_history_aggregated(
                tank_id, since, AGG_BUCKET_MINUTES_24H, until=latest_timestamp
            )
            or {}
        )
        latest_readings_raw = per_kpi
        aggregated_order_asc = True
    elif duration_minutes == DURATION_7D:
        per_kpi = (
            quality_service.get_tank_kpi_history_aggregated(
                tank_id, since, AGG_BUCKET_MINUTES_7D, until=latest_timestamp
            )
            or {}
        )
        latest_readings_raw = per_kpi
        aggregated_order_asc = True
    # 10M or other short duration: raw by timestamp
    elif duration_minutes is not None and duration_minutes > 0:
        per_kpi = quality_service.get_readings_per_kpi_since(tank_id, since) or {}
        latest_readings_raw = per_kpi
        aggregated_order_asc = False
    # LIVE: raw last N (cap applied in code; no limit in API)
    else:
        per_kpi = (
            quality_service.get_last_n_readings_per_kpi(
                tank_id, DEFAULT_LIVE_READINGS_CAP
            )
            or {}
        )
        latest_readings_raw = None
        aggregated_order_asc = False

    # KPI-wise grouped series for easier per-KPI graph rendering
    # Built from DB helper that returns last N readings per KPI config.
    kpi_series = {}
    for item in per_kpi.get("kpis") or []:
        name = (item.get("name") or "").strip()
        if not name:
            continue
        if name not in kpi_series:
            kpi_series[name] = []
        kpi_series[name].append(
            {
                "timestamp": item.get("timestamp"),
                "value": item.get("value"),
                "avg": item.get("avg"),
                "min": item.get("min"),
                "max": item.get("max"),
                "count": item.get("count"),
                "unit": item.get("unit") or "",
            }
        )

    # Raw per-KPI returns latest-first; reverse to oldest->latest. Aggregated is already oldest-first.
    if not aggregated_order_asc:
        for name in list(kpi_series.keys()):
            kpi_series[name].reverse()

    # Attach alert counts for 1H/24H/7D (not LIVE)
    if duration_minutes in {DURATION_1H, DURATION_24H, DURATION_7D} and since is not None:
        bucket_map = {
            DURATION_1H: AGG_BUCKET_MINUTES_1H,
            DURATION_24H: AGG_BUCKET_MINUTES_24H,
            DURATION_7D: AGG_BUCKET_MINUTES_7D,
        }
        bucket_min = bucket_map.get(duration_minutes, AGG_BUCKET_MINUTES_24H)
        until_ts = latest_timestamp or datetime.now(timezone.utc)
        _attach_alert_counts(db, tank_id, kpi_series, since, until_ts, bucket_min)
        _attach_lid_open_events(quality_service, tank_id, kpi_series, since, until_ts)

    return {
        "tank_code": tank.tank_code or f"T{tank_id}",
        "tank_id": tank_id,
        "kpi_series": kpi_series,
    }


@router.get("/tanks/{tank_id}/kpi-history-date")
def get_tank_kpi_history_by_date(
    tank_id: int = Path(..., description="Tank ID"),
    date: str = Query(..., description="Date in YYYY-MM-DD format (IST). Converted to UTC midnight IST for DB query."),
    request: Request = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get KPI history from IST start-of-day for the given date to now. DB stores UTC; IST midnight = UTC - 5h30m."""
    branch_id, role = get_branch_filter_info(request) if request else (None, None)
    query = db.query(Tank).filter(Tank.tank_id == tank_id)
    if role != "Admin" and branch_id is not None:
        query = query.filter(Tank.branch_id == branch_id)
    tank = query.first()
    if not tank:
        raise HTTPException(status_code=404, detail=f"Tank id '{tank_id}' not found")
    quality_service = QualityService(db)
    try:
        quality_service.validate_tank_belongs_to_branch(tank_id, branch_id, current_user.hospital_id)
    except Exception as e:
        raise HTTPException(status_code=403, detail=str(e))

    try:
        selected = datetime.strptime(date.strip(), "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid date format. Expected YYYY-MM-DD.")

    # IST is UTC+5:30 — subtract offset to get the UTC equivalent of IST midnight
    IST_OFFSET = timedelta(hours=5, minutes=30)
    since_utc = datetime(selected.year, selected.month, selected.day, tzinfo=timezone.utc) - IST_OFFSET
    # End of the selected day in IST = start of next IST day
    end_of_day_utc = since_utc + timedelta(days=1)
    now_utc = datetime.now(timezone.utc)
    # Never query beyond now; also never bleed into another day's data
    until_utc = min(end_of_day_utc, now_utc)

    # If the selected date is entirely in the future, return empty
    if since_utc >= now_utc:
        return {"tank_code": tank.tank_code or f"T{tank_id}", "tank_id": tank_id, "kpi_series": {}}

    # Use same bucket size as 24H for a single custom day
    bucket_minutes = AGG_BUCKET_MINUTES_24H

    per_kpi = (
        quality_service.get_tank_kpi_history_aggregated(
            tank_id, since_utc, bucket_minutes, until=until_utc
        )
        or {}
    )

    kpi_series: dict = {}
    for item in per_kpi.get("kpis") or []:
        name = (item.get("name") or "").strip()
        if not name:
            continue
        kpi_series.setdefault(name, []).append(
            {
                "timestamp": item.get("timestamp"),
                "value": item.get("value"),
                "avg": item.get("avg"),
                "min": item.get("min"),
                "max": item.get("max"),
                "count": item.get("count"),
                "unit": item.get("unit") or "",
            }
        )

    # aggregated returns oldest-first already; attach alert counts for custom date
    _attach_alert_counts(db, tank_id, kpi_series, since_utc, until_utc, bucket_minutes)
    _attach_lid_open_events(quality_service, tank_id, kpi_series, since_utc, until_utc)

    return {
        "tank_code": tank.tank_code or f"T{tank_id}",
        "tank_id": tank_id,
        "kpi_series": kpi_series,
    }


@router.post("/tanks/{tank_code}/kpi-readings")
def append_tank_kpi_reading(
    tank_code: str = Path(..., description="Tank code (e.g., T15)"),
    request: Request = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    body: dict = Body(...),
):
    """Append a KPI snapshot (store in DB and push to Redis for live graph). Body: { tank_id?, tank_code?, timestamp, kpis: [{ name, value, unit }] }."""
    from datetime import datetime, timezone

    branch_id, role = get_branch_filter_info(request) if request else (None, None)
    tank_code_str = str(tank_code).strip()
    query = db.query(Tank).filter(Tank.tank_code == tank_code_str)
    if role != "Admin" and branch_id is not None:
        query = query.filter(Tank.branch_id == branch_id)
    tank = query.first()
    if not tank:
        raise HTTPException(status_code=404, detail=f"Tank '{tank_code}' not found")
    tank_id = tank.tank_id
    quality_service = QualityService(db)
    try:
        quality_service.validate_tank_belongs_to_branch(tank_id, branch_id, current_user.hospital_id)
    except Exception as e:
        raise HTTPException(status_code=403, detail=str(e))
    if not body or "kpis" not in body:
        raise HTTPException(status_code=400, detail="Body must include 'kpis' array")
    ts = body.get("timestamp")
    if not ts:
        raise HTTPException(status_code=400, detail="Body must include 'timestamp'")
    if isinstance(ts, str):
        ts = ts.replace("Z", "+00:00")
        try:
            ts = datetime.fromisoformat(ts)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid timestamp format")
    kpis = list(body["kpis"]) if isinstance(body["kpis"], list) else []
    append_tank_kpi_snapshot_to_db(db, tank_id, tank_code_str, ts, kpis)
    db.commit()
    payload = {
        "timestamp": ts.isoformat() if hasattr(ts, "isoformat") else str(ts),
        "kpis": kpis,
    }
    return {
        "tank_id": tank_id,
        "tank_code": tank_code_str,
        "timestamp": payload["timestamp"],
    }


def _require_alert_setting_role(current_user: User) -> None:
    """Raise 403 if user is not IVF Admin, Manager, or User (for Alert Setting CRUD)."""
    if not is_specific_department(
        getattr(current_user, "department", None) or "", "IVF"
    ):
        raise HTTPException(
            status_code=403, detail="Access denied: Alert Setting is for IVF users only"
        )
    role = (getattr(current_user, "role", None) or "").strip()
    if hasattr(role, "value"):
        role = role.value
    role = (role or "").lower()
    if role not in ("manager", "admin", "user"):
        raise HTTPException(
            status_code=403,
            detail="Access denied: Alert Setting requires Admin, Manager, or User role",
        )


def _resolve_current_hospital_id(request: Request, db: Session) -> int:
    """Resolve hospital_id from authenticated request context for IVF users."""
    hospital_id = getattr(getattr(request, "state", None), "hospital_id", None)
    if hospital_id is not None:
        return int(hospital_id)

    branch_id, _ = get_branch_filter_info(request) if request else (None, None)
    if branch_id is not None:
        branch = (
            db.query(HospitalBranch)
            .filter(HospitalBranch.branch_id == int(branch_id))
            .first()
        )
        if branch and branch.hospital_id is not None:
            return int(branch.hospital_id)

    raise HTTPException(
        status_code=400,
        detail="Unable to resolve hospital for current user",
    )


def _kpi_config_metadata(row: KpiConfig) -> dict:
    return {
        "id": row.id,
        "config_id": row.id,
        "hospital_id": row.hospital_id,
        "branch_id": row.branch_id,
        "tank_id": row.tank_id,
        "incubator_id": row.incubator_id,
        "chamber_id": row.chamber_id,
        "refrigerator_id": row.refrigerator_id,
        "zone_id": row.zone_id,
        "zone_name": row.zone_name,
        "kpi_name": row.kpi_name,
        "alert_name": row.alert_name,
        "min": float(row.min) if row.min is not None else None,
        "max": float(row.max) if row.max is not None else None,
        "unit": row.unit,
        "alert_type": row.alert_type,
        "cooldown_minutes": int(row.cooldown_minutes)
        if row.cooldown_minutes is not None
        else None,
        "status": bool(row.status),
    }


@router.get("/hospital-notification-settings")
def get_hospital_notification_settings(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get hospital-level notification channel settings for Alert Configuration."""
    _require_alert_setting_role(current_user)
    hospital_id = _resolve_current_hospital_id(request, db)
    hospital = db.query(Hospital).filter(Hospital.hospital_id == hospital_id).first()
    if not hospital:
        raise HTTPException(status_code=404, detail="Hospital not found")

    return {
        "hospital_id": hospital.hospital_id,
        "is_email_notifify": bool(hospital.is_email_notifify),
        "is_whatsapp_notify": bool(hospital.is_whatsapp_notify),
        "is_push_notify": bool(hospital.is_push_notify),
    }


@router.put("/hospital-notification-settings")
def update_hospital_notification_settings(
    request: Request,
    body: dict = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update hospital-level notification channel settings for Alert Configuration."""
    _require_alert_setting_role(current_user)

    if "is_email_notifify" not in body or "is_whatsapp_notify" not in body:
        raise HTTPException(
            status_code=400,
            detail="is_email_notifify and is_whatsapp_notify are required",
        )

    email_enabled = bool(body.get("is_email_notifify"))
    whatsapp_enabled = bool(body.get("is_whatsapp_notify"))
    push_enabled = bool(body.get("is_push_notify"))

    if not email_enabled and not whatsapp_enabled and not push_enabled:
        raise HTTPException(
            status_code=400,
            detail="At least one notification channel must be enabled",
        )

    hospital_id = _resolve_current_hospital_id(request, db)
    hospital = db.query(Hospital).filter(Hospital.hospital_id == hospital_id).first()
    if not hospital:
        raise HTTPException(status_code=404, detail="Hospital not found")

    before_state = {
        "is_email_notifify": bool(hospital.is_email_notifify),
        "is_whatsapp_notify": bool(hospital.is_whatsapp_notify),
        "is_push_notify": bool(hospital.is_push_notify),
    }

    hospital.is_email_notifify = email_enabled
    hospital.is_whatsapp_notify = whatsapp_enabled
    hospital.is_push_notify = push_enabled
    db.commit()

    ActivityLogService(db).log_activity(
        action="alert_configuration.notification_settings_updated",
        outcome=ActivityOutcome.SUCCESS.value,
        actor=build_actor_from_user(current_user),
        target=build_target("hospital", str(hospital.hospital_id), hospital.hospital_name),
        metadata={
            "hospital_id": hospital.hospital_id,
            "before": before_state,
            "after": {
                "is_email_notifify": bool(hospital.is_email_notifify),
                "is_whatsapp_notify": bool(hospital.is_whatsapp_notify),
                "is_push_notify": bool(hospital.is_push_notify),
            },
        },
        audit_log_disabled=is_audit_log_disabled_for_user(current_user),
    )

    return {
        "hospital_id": hospital.hospital_id,
        "is_email_notifify": bool(hospital.is_email_notifify),
        "is_whatsapp_notify": bool(hospital.is_whatsapp_notify),
        "is_push_notify": bool(hospital.is_push_notify),
    }


@router.get("/kpi-config/list")
def list_kpi_config(
    tank_id: Optional[int] = Query(None, description="Tank ID"),
    incubator_id: Optional[int] = Query(None, description="Incubator ID"),
    chamber_id: Optional[str] = Query(None, description="Chamber ID filter (incubator only)"),
    refrigerator_id: Optional[int] = Query(None, description="Refrigerator ID"),
    zone_id: Optional[str] = Query(None, description="Zone ID filter (refrigerator only). Send 'null' to filter zone_id IS NULL."),
    request: Request = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all KPI config rows for a tank, incubator, or refrigerator (Alert Setting)."""
    _require_alert_setting_role(current_user)
    quality_service = QualityService(db)

    if refrigerator_id is not None:
        refrigerator = db.query(Refrigerator).filter(
            Refrigerator.refrigerator_id == refrigerator_id,
            Refrigerator.hospital_id == current_user.hospital_id,
        ).first()
        if not refrigerator:
            raise HTTPException(status_code=404, detail=f"Refrigerator '{refrigerator_id}' not found")
        q = db.query(KpiConfig).filter(KpiConfig.refrigerator_id == refrigerator_id)
        if zone_id == "null":
            q = q.filter(KpiConfig.zone_id.is_(None))
        elif zone_id:
            q = q.filter(KpiConfig.zone_id == zone_id)
        rows = q.order_by(KpiConfig.zone_id, KpiConfig.kpi_name, KpiConfig.alert_name).all()
        return {
            "refrigerator_id": refrigerator_id,
            "refrigerator_code": refrigerator.refrigerator_code or "",
            "branch_id": refrigerator.branch_id,
            "hospital_id": refrigerator.hospital_id,
            "config": [_kpi_config_metadata(r) for r in rows],
        }

    if incubator_id is not None:
        incubator = db.query(Incubator).filter(
            Incubator.incubator_id == incubator_id,
            Incubator.hospital_id == current_user.hospital_id,
        ).first()
        if not incubator:
            raise HTTPException(status_code=404, detail=f"Incubator '{incubator_id}' not found")
        q = db.query(KpiConfig).filter(KpiConfig.incubator_id == incubator_id)
        if chamber_id == "null":
            q = q.filter(KpiConfig.chamber_id.is_(None))
        elif chamber_id:
            q = q.filter(KpiConfig.chamber_id == chamber_id)
        rows = q.order_by(KpiConfig.kpi_name, KpiConfig.alert_name).all()
        return {
            "incubator_id": incubator_id,
            "incubator_code": incubator.incubator_code or "",
            "branch_id": incubator.branch_id,
            "hospital_id": incubator.hospital_id,
            "config": [_kpi_config_metadata(r) for r in rows],
        }

    if tank_id is None:
        raise HTTPException(status_code=400, detail="Provide tank_id, incubator_id, or refrigerator_id")

    branch_id, _ = get_branch_filter_info(request) if request else (None, None)
    tank = db.query(Tank).filter(Tank.tank_id == tank_id).first()
    if not tank:
        raise HTTPException(status_code=404, detail=f"Tank id '{tank_id}' not found")
    try:
        quality_service.validate_tank_belongs_to_branch(tank_id, branch_id, current_user.hospital_id)
    except Exception as e:
        raise HTTPException(status_code=403, detail=str(e))
    rows = quality_service.list_kpi_config_by_tank(tank_id)
    branch = db.query(HospitalBranch).filter(HospitalBranch.branch_id == tank.branch_id).first()
    return {
        "tank_id": tank_id,
        "tank_code": tank.tank_code or "",
        "branch_id": tank.branch_id,
        "hospital_id": branch.hospital_id if branch else None,
        "config": rows,
    }


@router.post("/kpi-config")
def create_kpi_config(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    body: dict = Body(...),
):
    """Create a KPI config row. Body: hospital_id, branch_id, kpi_name, and either tank_id, incubator_id, or refrigerator_id."""
    _require_alert_setting_role(current_user)
    branch_id, _ = get_branch_filter_info(request) if request else (None, None)
    for k in ("hospital_id", "branch_id", "kpi_name"):
        if k not in body:
            raise HTTPException(status_code=400, detail=f"Missing required field: {k}")
    if (
        body.get("tank_id") is None
        and body.get("incubator_id") is None
        and body.get("refrigerator_id") is None
    ):
        raise HTTPException(status_code=400, detail="Provide tank_id, incubator_id, or refrigerator_id")
    try:
        hospital_id = int(body["hospital_id"])
        branch_id_val = int(body["branch_id"])
        tank_id = int(body["tank_id"]) if body.get("tank_id") is not None else None
        incubator_id_val = int(body["incubator_id"]) if body.get("incubator_id") is not None else None
        refrigerator_id_val = int(body["refrigerator_id"]) if body.get("refrigerator_id") is not None else None
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="hospital_id, branch_id, tank_id/incubator_id/refrigerator_id must be integers")
    if branch_id is not None and branch_id_val != branch_id:
        raise HTTPException(status_code=403, detail="Cannot create config for another branch")

    quality_service = QualityService(db)
    row = quality_service.create_kpi_config(
        hospital_id=hospital_id,
        branch_id=branch_id_val,
        tank_id=tank_id,
        incubator_id=incubator_id_val,
        chamber_id=body.get("chamber_id"),
        refrigerator_id=refrigerator_id_val,
        zone_id=None if refrigerator_id_val else body.get("zone_id"),
        kpi_name=str(body["kpi_name"]),
        alert_name=body.get("alert_name"),
        min_val=body.get("min") if body.get("min") is not None else None,
        max_val=body.get("max") if body.get("max") is not None else None,
        unit=body.get("unit"),
        alert_type=body.get("alert_type"),
        cooldown_minutes=int(body["cooldown_minutes"]) if body.get("cooldown_minutes") is not None else None,
        unack_escalation_threshold=int(body["unack_escalation_threshold"]) if body.get("unack_escalation_threshold") is not None else None,
        status=body.get("status", True),
    )
    db.commit()

    target_label = f"incubator:{incubator_id_val}" if incubator_id_val else str(row.tank_id)
    ActivityLogService(db).log_activity(
        action="alert_configuration.kpi_config_created",
        outcome=ActivityOutcome.SUCCESS.value,
        actor=build_actor_from_user(current_user),
        target=build_target("tank", target_label),
        metadata={
            **_kpi_config_metadata(row),
            "kpi_names": [row.kpi_name] if row.kpi_name else [],
        },
        audit_log_disabled=is_audit_log_disabled_for_user(current_user),
    )
    return {
        "id": row.id,
        "hospital_id": row.hospital_id,
        "branch_id": row.branch_id,
        "tank_id": row.tank_id,
        "kpi_name": row.kpi_name,
        "alert_name": row.alert_name,
        "min": float(row.min) if row.min is not None else None,
        "max": float(row.max) if row.max is not None else None,
        "unit": row.unit,
        "alert_type": row.alert_type,
        "cooldown_minutes": int(row.cooldown_minutes)
        if row.cooldown_minutes is not None
        else 60,
        "unack_escalation_threshold": row.unack_escalation_threshold,
        "status": bool(row.status),
    }


@router.post("/kpi-config/bulk")
def bulk_upsert_kpi_config(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    body: dict = Body(...),
):
    """
    Bulk upsert KPI config to multiple tanks (Alert Setting).
    Body: tank_ids (list of int), configs (list of { kpi_name, alert_name?, min?, max?, unit?, alert_type?, status? }).
    For each tank and each config: if row exists for (tank_id, kpi_name, alert_name) update it; else create.
    IVF Admin, Manager, and User only.
    """
    _require_alert_setting_role(current_user)
    branch_id, _ = get_branch_filter_info(request) if request else (None, None)
    tank_ids = body.get("tank_ids")
    configs = body.get("configs")
    if not isinstance(tank_ids, list) or not tank_ids:
        raise HTTPException(status_code=400, detail="tank_ids must be a non-empty list")
    if not isinstance(configs, list):
        raise HTTPException(status_code=400, detail="configs must be a list")
    try:
        tank_ids = [int(t) for t in tank_ids]
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="tank_ids must be integers")
    quality_service = QualityService(db)
    result = quality_service.bulk_upsert_kpi_config(
        tank_ids=tank_ids, configs=configs, branch_id=branch_id
    )
    db.commit()

    unique_kpis = sorted(
        {str(cfg.get("kpi_name")).strip() for cfg in configs if cfg.get("kpi_name")}
    )
    ActivityLogService(db).log_activity(
        action="alert_configuration.kpi_config_bulk_upserted",
        outcome=ActivityOutcome.SUCCESS.value,
        actor=build_actor_from_user(current_user),
        target=build_target("branch", str(branch_id)) if branch_id is not None else None,
        metadata={
            "tank_ids": tank_ids,
            "updated": result.get("updated"),
            "created": result.get("created"),
            "config_count": len(configs),
            "kpi_names": unique_kpis,
        },
        audit_log_disabled=is_audit_log_disabled_for_user(current_user),
    )
    return result


@router.post("/kpi-config/bulk-incubator")
def bulk_upsert_kpi_config_for_incubator(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    body: dict = Body(...),
):
    """
    Bulk upsert KPI config for a single incubator + optional chamber.
    Body: incubator_id (int), chamber_id (str | null), configs (list).
    """
    _require_alert_setting_role(current_user)
    incubator_id = body.get("incubator_id")
    chamber_id = body.get("chamber_id")
    configs = body.get("configs")
    if not incubator_id:
        raise HTTPException(status_code=400, detail="incubator_id is required")
    if not isinstance(configs, list):
        raise HTTPException(status_code=400, detail="configs must be a list")
    try:
        incubator_id = int(incubator_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="incubator_id must be an integer")

    incubator = db.query(Incubator).filter(
        Incubator.incubator_id == incubator_id,
        Incubator.hospital_id == current_user.hospital_id,
    ).first()
    if not incubator:
        raise HTTPException(status_code=404, detail=f"Incubator '{incubator_id}' not found")

    quality_service = QualityService(db)
    result = quality_service.bulk_upsert_kpi_config_for_incubator(
        incubator_id=incubator_id,
        chamber_id=chamber_id,
        configs=configs,
        hospital_id=incubator.hospital_id,
        branch_id=incubator.branch_id,
    )
    db.commit()

    ActivityLogService(db).log_activity(
        action="alert_configuration.kpi_config_bulk_upserted",
        outcome=ActivityOutcome.SUCCESS.value,
        actor=build_actor_from_user(current_user),
        target=build_target("incubator", str(incubator_id)),
        metadata={
            "incubator_id": incubator_id,
            "chamber_id": chamber_id,
            "updated": result.get("updated"),
            "created": result.get("created"),
        },
        audit_log_disabled=is_audit_log_disabled_for_user(current_user),
    )
    return result


@router.post("/kpi-config/bulk-refrigerator")
def bulk_upsert_kpi_config_for_refrigerator(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    body: dict = Body(...),
):
    """
    Bulk upsert KPI config for a single refrigerator zone.
    Body: refrigerator_id (int), zone_id (str | null), zone_name (str | null), configs (list).
    zone_id=null targets the zone-less legacy config.
    """
    _require_alert_setting_role(current_user)
    refrigerator_id = body.get("refrigerator_id")
    zone_id = body.get("zone_id")
    zone_name = body.get("zone_name")
    configs = body.get("configs")
    if not refrigerator_id:
        raise HTTPException(status_code=400, detail="refrigerator_id is required")
    if not isinstance(configs, list):
        raise HTTPException(status_code=400, detail="configs must be a list")
    try:
        refrigerator_id = int(refrigerator_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="refrigerator_id must be an integer")
    if zone_id is not None and not isinstance(zone_id, str):
        raise HTTPException(status_code=400, detail="zone_id must be a string or null")

    refrigerator = db.query(Refrigerator).filter(
        Refrigerator.refrigerator_id == refrigerator_id,
        Refrigerator.hospital_id == current_user.hospital_id,
    ).first()
    if not refrigerator:
        raise HTTPException(status_code=404, detail=f"Refrigerator '{refrigerator_id}' not found")

    quality_service = QualityService(db)
    result = quality_service.bulk_upsert_kpi_config_for_refrigerator(
        refrigerator_id=refrigerator_id,
        configs=configs,
        hospital_id=refrigerator.hospital_id,
        branch_id=refrigerator.branch_id,
        zone_id=zone_id,
        zone_name=zone_name,
    )
    db.commit()

    ActivityLogService(db).log_activity(
        action="alert_configuration.kpi_config_bulk_upserted",
        outcome=ActivityOutcome.SUCCESS.value,
        actor=build_actor_from_user(current_user),
        target=build_target("refrigerator", str(refrigerator_id)),
        metadata={
            "refrigerator_id": refrigerator_id,
            "zone_id": zone_id,
            "zone_name": zone_name,
            "updated": result.get("updated"),
            "created": result.get("created"),
        },
        audit_log_disabled=is_audit_log_disabled_for_user(current_user),
    )
    return result


@router.put("/kpi-config/{config_id}")
def update_kpi_config(
    config_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    body: dict = Body(...),
):
    """Update a KPI config row (Alert Setting). IVF Admin, Manager, and User only."""
    _require_alert_setting_role(current_user)
    branch_id, _ = get_branch_filter_info(request) if request else (None, None)
    quality_service = QualityService(db)
    existing = db.query(KpiConfig).filter(KpiConfig.id == config_id).first()
    if not existing:
        raise HTTPException(status_code=404, detail="KPI config not found")
    before_state = _kpi_config_metadata(existing)
    row = quality_service.update_kpi_config(
        config_id=config_id,
        branch_id=branch_id,
        kpi_name=body.get("kpi_name"),
        alert_name=body.get("alert_name"),
        min_val=body.get("min") if body.get("min") is not None else None,
        max_val=body.get("max") if body.get("max") is not None else None,
        unit=body.get("unit"),
        alert_type=body.get("alert_type"),
        cooldown_minutes=int(body["cooldown_minutes"])
        if body.get("cooldown_minutes") is not None
        else None,
        unack_escalation_threshold=int(body["unack_escalation_threshold"])
        if body.get("unack_escalation_threshold") is not None
        else None,
        status=body.get("status"),
    )
    if not row:
        raise HTTPException(status_code=404, detail="KPI config not found")
    db.commit()

    ActivityLogService(db).log_activity(
        action="alert_configuration.kpi_config_updated",
        outcome=ActivityOutcome.SUCCESS.value,
        actor=build_actor_from_user(current_user),
        target=build_target("tank", str(row.tank_id)),
        metadata={
            "before": before_state,
            "after": _kpi_config_metadata(row),
            "kpi_names": sorted(
                {
                    value
                    for value in [before_state.get("kpi_name"), row.kpi_name]
                    if value
                }
            ),
        },
        audit_log_disabled=is_audit_log_disabled_for_user(current_user),
    )
    return {
        "id": row.id,
        "hospital_id": row.hospital_id,
        "branch_id": row.branch_id,
        "tank_id": row.tank_id,
        "kpi_name": row.kpi_name,
        "alert_name": row.alert_name,
        "min": float(row.min) if row.min is not None else None,
        "max": float(row.max) if row.max is not None else None,
        "unit": row.unit,
        "alert_type": row.alert_type,
        "cooldown_minutes": int(row.cooldown_minutes)
        if row.cooldown_minutes is not None
        else 60,
        "unack_escalation_threshold": row.unack_escalation_threshold,
        "status": bool(row.status),
    }


@router.delete("/kpi-config/{config_id}")
def delete_kpi_config(
    config_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a KPI config row (Alert Setting). IVF Admin, Manager, and User only."""
    _require_alert_setting_role(current_user)
    branch_id, _ = get_branch_filter_info(request) if request else (None, None)
    quality_service = QualityService(db)
    existing = db.query(KpiConfig).filter(KpiConfig.id == config_id).first()
    if not existing:
        raise HTTPException(status_code=404, detail="KPI config not found")
    before_state = _kpi_config_metadata(existing)
    ok = quality_service.delete_kpi_config(config_id, branch_id=branch_id)
    if not ok:
        raise HTTPException(status_code=404, detail="KPI config not found")
    db.commit()

    ActivityLogService(db).log_activity(
        action="alert_configuration.kpi_config_deleted",
        outcome=ActivityOutcome.SUCCESS.value,
        actor=build_actor_from_user(current_user),
        target=build_target("tank", str(before_state.get("tank_id")) if before_state.get("tank_id") else None),
        metadata={
            **before_state,
            "kpi_names": [before_state.get("kpi_name")] if before_state.get("kpi_name") else [],
        },
        audit_log_disabled=is_audit_log_disabled_for_user(current_user),
    )
    return {"deleted": True, "id": config_id}


def push_ln2_reading_to_redis(
    tank_id: int, tank_code: str, data: dict, publish: bool = True
) -> None:
    """Push LN2 reading to Redis and optionally publish to ln2_readings_channel for live WebSocket.
    data may include: device_code (e.g. 'LN2-1'), device_id (alias, same value), timestamp,
    evaporation_rate_kg_per_h, ln2_mass_kg, etc. device_id/device_code = Device.device_code (string).
    """
    try:
        r = get_redis()
        payload = dict(data)
        payload["tank_id"] = tank_id
        payload["tank_code"] = tank_code
        msg = json.dumps(payload)
        history_key = f"ln2_quality_history:{tank_id}"
        r.lpush(history_key, msg)
        r.ltrim(history_key, 0, 29)
        if publish:
            r.publish("ln2_readings_channel", msg)
        logger.debug(f"Pushed LN2 reading to Redis for tank {tank_code} (id={tank_id})")
    except Exception as e:
        logger.warning(f"Failed to push LN2 reading to Redis: {e}")


async def ln2_redis_listener():
    """Listen for LN2 readings from Redis and broadcast to ln2-ws clients."""
    loop = asyncio.get_event_loop()
    pubsub = None
    while True:
        try:
            if pubsub is None:
                try:
                    pubsub = get_ln2_pubsub()
                    logger.info("LN2 Redis listener started")
                except Exception as e:
                    logger.error(
                        f"Error connecting to LN2 Redis: {e}. Retrying in 5 seconds..."
                    )
                    await asyncio.sleep(5)
                    continue

            message = await loop.run_in_executor(
                None,
                lambda: pubsub.get_message(timeout=1.0, ignore_subscribe_messages=True),
            )
            if message and message.get("type") == "message":
                try:
                    data = json.loads(message["data"])
                    db = SessionLocal()
                    try:
                        await ln2_manager.broadcast(data, db)
                    finally:
                        db.close()
                except json.JSONDecodeError as e:
                    logger.error(f"Failed to parse LN2 message: {e}")
                except Exception as e:
                    logger.error(f"Error broadcasting LN2 message: {e}")
        except Exception as e:
            logger.error(f"Error in ln2_redis_listener: {e}")
            pubsub = None
            await asyncio.sleep(5)


async def tank_kpi_redis_listener():
    """Listen for tank KPI readings from Redis and broadcast to IVF quality WS clients (Quality Tracking live graph)."""
    from app.service.redis_service import get_tank_kpi_pubsub

    loop = asyncio.get_event_loop()
    pubsub = None
    while True:
        try:
            if pubsub is None:
                try:
                    pubsub = get_tank_kpi_pubsub()
                    logger.info("Tank KPI Redis listener started")
                except Exception as e:
                    logger.error(
                        f"Error connecting to tank KPI Redis: {e}. Retrying in 5 seconds..."
                    )
                    await asyncio.sleep(5)
                    continue
            message = await loop.run_in_executor(
                None,
                lambda: pubsub.get_message(timeout=1.0, ignore_subscribe_messages=True),
            )
            if message and message.get("type") == "message":
                try:
                    raw = message.get("data")
                    if isinstance(raw, bytes):
                        raw = raw.decode("utf-8")

                    # Redis pubsub messages from some publishers are wrapped as:
                    # {"type": "message", "data": { ...actual payload... }}
                    # Unwrap this so ConnectionManager.broadcast sees tank_code/tank_id at top level.
                    parsed = json.loads(raw)
                    if (
                        isinstance(parsed, dict)
                        and "data" in parsed
                        and isinstance(parsed.get("data"), dict)
                    ):
                        payload = parsed["data"]
                    else:
                        payload = parsed

                    logger.info(
                        "Tank KPI Redis message received: tank_code=%s, tank_id=%s",
                        payload.get("tank_code"),
                        payload.get("tank_id"),
                    )
                    db = SessionLocal()
                    try:
                        await manager.broadcast(payload, db)
                        # Also broadcast to /api/kpi/ws clients (Quality Tracking chart)
                        from app.controller.kpi_controller import kpi_manager

                        n = len(kpi_manager.active_connections)
                        await kpi_manager.broadcast(payload, db)
                        logger.info(
                            f"Tank KPI broadcast to kpi/ws (active_connections={n})"
                        )
                    except Exception as e:
                        logger.error(
                            f"Error broadcasting tank KPI message: {e}", exc_info=True
                        )
                    finally:
                        db.close()
                except json.JSONDecodeError as e:
                    logger.error(f"Failed to parse tank KPI message: {e}")
                except Exception as e:
                    logger.error(
                        f"Error broadcasting tank KPI message: {e}", exc_info=True
                    )
        except Exception as e:
            logger.error(f"Error in tank_kpi_redis_listener: {e}")
            pubsub = None
            await asyncio.sleep(5)


@router.websocket("/ws")
async def ivf_websocket_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for real-time IVF canister quality monitoring

    Requires authentication token in query parameter: ?token=<jwt_token>
    Only accessible to users with IVF department
    """
    connection_id = None

    try:
        # Accept connection first
        await websocket.accept()
        logger.info(
            f"IVF WebSocket connection accepted from {websocket.client.host if websocket.client else 'unknown'}"
        )

        # Authenticate user - Get token from query parameter
        query_params = dict(websocket.query_params)
        token = query_params.get("token")
        logger.info(f"Token from query params: {'present' if token else 'missing'}")

        # Get branch_id_override from query parameters (optional, only for Managers)
        branch_id_override = None
        branch_id_override_str = query_params.get("branch_id_override")
        if branch_id_override_str:
            try:
                branch_id_override = int(branch_id_override_str)
                logger.info(f"branch_id_override provided: {branch_id_override}")
            except (ValueError, TypeError):
                logger.warning(
                    f"Invalid branch_id_override value: {branch_id_override_str}, ignoring"
                )

        if not token:
            logger.warning("IVF WebSocket connection rejected: No token provided")
            await websocket.close(
                code=1008, reason="Authentication required: No token provided"
            )
            return

        # Verify token using auth function
        try:
            auth_info = verify_websocket_token(token)
            user_id = auth_info["user_id"]
            pharma_id = auth_info.get("pharma_id")  # May be None for IVF users
            logger.debug(f"Token verified: user_id={user_id}, pharma_id={pharma_id}")
        except InvalidTokenException as e:
            logger.warning(
                f"IVF WebSocket connection rejected: Invalid token - {str(e)}"
            )
            await websocket.close(code=1008, reason=f"Invalid token: {str(e)}")
            return
        except Exception as e:
            logger.error(
                f"IVF WebSocket token verification error: {type(e).__name__}: {str(e)}"
            )
            await websocket.close(
                code=1008, reason=f"Token verification failed: {str(e)}"
            )
            return

        # Get user from database to verify department and get branch_id/role
        db_temp = SessionLocal()
        try:
            user = db_temp.query(User).filter(User.user_id == user_id).first()
            if not user:
                logger.warning(f"User {user_id} not found in database")
                await websocket.close(code=1008, reason="User not found")
                return

            # Verify user is from IVF department
            if not is_specific_department(user.department, "IVF"):
                logger.warning(
                    f"User {user_id} is not from IVF department (department: {user.department})"
                )
                await websocket.close(
                    code=1008,
                    reason="Access denied: This endpoint is for IVF users only",
                )
                return

            role = user.role.value if hasattr(user.role, "value") else str(user.role)
            role_normalized = role  # Already in correct format from enum
            department = user.department

            # Determine branch_id based on role and override
            # Managers can override, Users cannot override (always use their branch)
            if role_normalized == "Manager":
                if branch_id_override is not None:
                    branch_id = branch_id_override
                    logger.info(f"Manager using branch_id_override: {branch_id}")
                else:
                    branch_id = (
                        user.branch_id
                    )  # Manager without override uses their own branch_id
                    logger.info(f"Manager using default branch_id: {branch_id}")
            elif role_normalized == "Admin":
                branch_id = None  # Admin sees all branches (ignore override)
            else:
                # User role: always use their branch (ignore override)
                branch_id = user.branch_id
                if branch_id_override is not None:
                    logger.warning(
                        f"User role cannot override branch_id, ignoring override: {branch_id_override}"
                    )

            logger.info(
                f"IVF user authenticated: user={user_id}, department={department}, branch={branch_id}, role={role_normalized}, override={branch_id_override}"
            )
        finally:
            db_temp.close()

        # Store connection info in connection manager for filtering
        connection_id = await manager.connect(websocket)
        manager.active_connections[connection_id]["pharma_id"] = pharma_id
        manager.active_connections[connection_id]["user_id"] = user_id
        manager.active_connections[connection_id]["branch_id"] = branch_id
        manager.active_connections[connection_id]["role"] = role_normalized
        manager.active_connections[connection_id]["department"] = department

        logger.info(
            f"IVF WebSocket authenticated: user={user_id}, branch={branch_id}, role={role_normalized}, connection={connection_id}"
        )

    except Exception as e:
        logger.error(
            f"IVF WebSocket authentication error: {type(e).__name__}: {str(e)}",
            exc_info=True,
        )
        try:
            if connection_id:
                manager.disconnect(connection_id)
            await websocket.close(code=1011, reason=f"Internal server error: {str(e)}")
        except:
            pass
        return

    try:
        # Create database session for validation
        db = SessionLocal()

        try:
            quality_service = QualityService(db)
            quality_tracking_service = QualityTrackingService(db)

            while True:
                try:
                    # Wait for messages with timeout to avoid blocking
                    data = await asyncio.wait_for(websocket.receive_text(), timeout=1.0)
                    try:
                        # Try to parse as JSON
                        message = json.loads(data)

                        # Handle IVF tank subscription - accept tank_code (e.g., "T1", "T2")
                        # Optional branch_id in message is Manager-only for branch+tank disambiguation.
                        if "tank_code" not in message or not message["tank_code"]:
                            await websocket.send_json(
                                {
                                    "type": "error",
                                    "message": "Subscription message must contain 'tank_code'",
                                }
                            )
                            continue

                        tank_code = message["tank_code"]
                        selected_branch_id = message.get("branch_id")
                        logger.info(f"Received tank_code: {tank_code}")

                        # Parse optional branch selection from the message.
                        if selected_branch_id is not None:
                            try:
                                selected_branch_id = int(selected_branch_id)
                            except (TypeError, ValueError):
                                await websocket.send_json(
                                    {
                                        "type": "error",
                                        "message": "Invalid 'branch_id' in subscription message",
                                    }
                                )
                                continue

                        # Resolve tank_code to tank_id
                        try:
                            # Convert tank_code to string
                            tank_code_str = str(tank_code).strip()

                            # Determine effective branch for this subscription.
                            # - User: always constrained to their authorized branch.
                            # - Manager: can optionally scope by selected branch from message.
                            # - Admin: message branch selection is ignored.
                            effective_branch_id = branch_id
                            if (
                                role_normalized == "Manager"
                                and selected_branch_id is not None
                            ):
                                effective_branch_id = selected_branch_id

                            # Find tank by tank_code and effective branch when available.
                            if effective_branch_id is not None:
                                tank = (
                                    db.query(Tank)
                                    .filter(
                                        Tank.tank_code == tank_code_str,
                                        Tank.branch_id == effective_branch_id,
                                    )
                                    .first()
                                )
                            else:
                                # Admin without branch selection can access any tank.
                                # If the same tank_code exists in multiple branches, force explicit branch selection.
                                matching_tanks = (
                                    db.query(Tank)
                                    .filter(Tank.tank_code == tank_code_str)
                                    .all()
                                )
                                if len(matching_tanks) > 1:
                                    raise Exception(
                                        f"Multiple branches have tank code '{tank_code}'. Please send 'branch_id' in subscription message."
                                    )
                                tank = matching_tanks[0] if matching_tanks else None

                            if not tank:
                                branch_hint = (
                                    effective_branch_id
                                    if effective_branch_id is not None
                                    else branch_id
                                )
                                raise Exception(
                                    f"Tank with code '{tank_code}' not found"
                                    + (
                                        f" in branch {branch_hint}"
                                        if branch_hint is not None
                                        else ""
                                    )
                                )

                            tank_id = tank.tank_id

                            logger.info(
                                f"Resolved tank_code {tank_code} to tank_id {tank_id}"
                            )
                        except Exception as e:
                            await websocket.send_json(
                                {
                                    "type": "error",
                                    "message": f"Invalid tank code: {str(e)}",
                                }
                            )
                            continue

                        # Validate tank belongs to user's branch (if user is not admin)
                        try:
                            # Admin users (branch_id is None) can access all tanks.
                            # User/Manager users must match the effective branch used for this subscription.
                            if (
                                role_normalized != "Admin"
                                and effective_branch_id is not None
                            ):
                                quality_service.validate_tank_belongs_to_branch(
                                    tank_id, effective_branch_id
                                )

                            # Keep branch scoping aligned with the subscribed tank so websocket broadcast
                            # filtering sends data for the selected branch+tank combination.
                            manager.active_connections[connection_id]["branch_id"] = (
                                None if role_normalized == "Admin" else tank.branch_id
                            )

                            # Client is subscribing to a tank (IVF) - track by tank_code
                            # Store tank_code as string
                            tank_code_for_sub = str(tank_code)

                            # Store subscription using tank_code (primary identifier)
                            manager.set_tank_subscription(
                                connection_id, tank_id, tank_code_for_sub
                            )

                            # Get last 12 IVF telemetry records from DB for this tank+branch scope
                            ivf_history = quality_service.get_tank_telemetry_history(
                                tank_id=tank_id, branch_id=tank.branch_id, limit=12
                            )

                            # Get IVF geolocation records from database (using tank_id)
                            ivf_geolocation_history = (
                                quality_service.get_tank_geolocation_history(
                                    tank_id, limit=100
                                )
                            )

                            # Send IVF geolocation history as a single array message
                            if ivf_geolocation_history:
                                await websocket.send_json(
                                    {
                                        "type": "ivf_geolocation_history",
                                        "tank_id": tank_id,
                                        "tank_code": tank_code,  # Include tank_code in response
                                        "geolocations": ivf_geolocation_history,
                                        "count": len(ivf_geolocation_history),
                                    }
                                )

                            # Send IVF quality history messages (oldest first, ascending order)
                            for historical_data in ivf_history:
                                await websocket.send_json(historical_data)

                            # Send confirmation after history
                            await websocket.send_json(
                                {
                                    "type": "subscription_confirmed",
                                    "tank_id": tank_id,
                                    "tank_code": tank_code,  # Include tank_code in response
                                    "branch_id": tank.branch_id,
                                    "device_data": {
                                        "tive_device_id": tank.tive_device_id,
                                        "tank_id_arc": tank.tank_id_arc,
                                    },
                                    "history_count": len(ivf_history),
                                    "geolocation_count": len(ivf_geolocation_history),
                                }
                            )
                        except Exception as e:
                            await websocket.send_json(
                                {"type": "error", "message": f"Invalid tank: {str(e)}"}
                            )
                    except json.JSONDecodeError:
                        # Not JSON, ignore
                        pass
                except asyncio.TimeoutError:
                    # No message received, continue to keep connection alive
                    continue
        finally:
            db.close()
    except WebSocketDisconnect:
        manager.disconnect_by_websocket(websocket)
        logger.info(f"IVF WebSocket disconnected: {connection_id}")
    except Exception as e:
        logger.error(f"IVF WebSocket error: {e}")
        manager.disconnect_by_websocket(websocket)


def _get_ln2_history_for_tank(
    db: Session, tank_id: int, tank_code_str: str, limit: int = 12
) -> list:
    """Get LN2 readings history for a tank.

    Strategy: fetch from both Redis and DB, merge, deduplicate by timestamp,
    and return the most recent *limit* entries so that cached Redis entries
    don't shadow richer DB rows (or vice-versa).
    """
    quality_service = QualityService(db)
    redis_history = quality_service.get_ln2_redis_history(tank_id, limit=limit)

    # Always query DB as well so we never lose data when Redis has a stale subset
    db_history = []
    tank = db.query(Tank).filter(Tank.tank_id == tank_id).first()
    if tank:
        device_ids = [
            row[0]
            for row in db.query(Ln2IotDevice.device_id)
            .filter(Ln2IotDevice.tank_id == tank_id)
            .distinct()
            .all()
        ]
        if tank.tive_device_id:
            dev = (
                db.query(Device)
                .filter(Device.device_code == tank.tive_device_id)
                .first()
            )
            if dev and dev.id not in device_ids:
                device_ids.append(dev.id)
        if device_ids:
            from sqlalchemy import desc, or_

            readings = (
                db.query(Ln2Reading)
                .filter(or_(*[Ln2Reading.device_id == d for d in device_ids]))
                .order_by(desc(Ln2Reading.reading_timestamp))
                .limit(limit)
                .all()
            )
            for r in reversed(readings):
                ts = r.reading_timestamp.isoformat() if r.reading_timestamp else ""
                dev = db.query(Device).filter(Device.id == r.device_id).first()
                dev_code = (
                    dev.device_code if dev and dev.device_code else str(r.device_id)
                )
                item = {
                    "tank_code": tank_code_str,
                    "tank_id": tank_id,
                    "device_code": dev_code,
                    "device_id": dev_code,
                    "timestamp": ts,
                    "evaporation_rate_kg_per_h": float(r.evaporation_rate_kg_per_h)
                    if r.evaporation_rate_kg_per_h is not None
                    else None,
                    "ln2_mass_kg": float(r.ln2_mass_kg)
                    if r.ln2_mass_kg is not None
                    else None,
                    "raw_weight_kg": float(r.raw_weight_kg)
                    if r.raw_weight_kg is not None
                    else None,
                    "ln2_level_pct": float(r.ln2_level_pct)
                    if r.ln2_level_pct is not None
                    else None,
                    "ln2_volume_l": float(r.ln2_volume_l)
                    if r.ln2_volume_l is not None
                    else None,
                    "sensor_status": r.sensor_status,
                    "lid_state": r.lid_state,
                    "refill_detected": r.refill_detected,
                    "quality_status": r.quality_status,
                }
                db_history.append(item)

    # Merge: DB rows preferred (richer columns) then Redis-only entries
    seen_ts = set()
    merged: list = []
    for item in db_history:
        ts = item.get("timestamp", "")
        if ts not in seen_ts:
            seen_ts.add(ts)
            merged.append(item)
    for item in redis_history:
        ts = item.get("timestamp", "")
        if ts not in seen_ts:
            seen_ts.add(ts)
            merged.append(item)

    # Sort ascending by timestamp and take last *limit*
    merged.sort(key=lambda x: x.get("timestamp", ""))
    merged = merged[-limit:]

    # Backfill Redis cache so next call is fast
    if merged and not redis_history:
        for item in merged:
            push_ln2_reading_to_redis(tank_id, tank_code_str, item, publish=False)

    return merged


@router.websocket("/ln2-ws")
async def ivf_ln2_websocket_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for real-time LN2 readings monitoring.
    Separate from quality /ws to avoid disturbing legacy code.
    Requires: ?token=<jwt_token>. Subscribe with: {"tank_code": "T30"}.
    """
    connection_id = None
    try:
        await websocket.accept()
        logger.info(
            f"IVF LN2 WebSocket connection accepted from {websocket.client.host if websocket.client else 'unknown'}"
        )

        query_params = dict(websocket.query_params)
        token = query_params.get("token")
        if not token:
            await websocket.close(
                code=1008, reason="Authentication required: No token provided"
            )
            return

        try:
            auth_info = verify_websocket_token(token)
            user_id = auth_info["user_id"]
        except InvalidTokenException as e:
            await websocket.close(code=1008, reason=f"Invalid token: {str(e)}")
            return
        except Exception as e:
            await websocket.close(
                code=1008, reason=f"Token verification failed: {str(e)}"
            )
            return

        db_temp = SessionLocal()
        try:
            user = db_temp.query(User).filter(User.user_id == user_id).first()
            if not user:
                await websocket.close(code=1008, reason="User not found")
                return
            if not user.department or not is_hospital_department(user.department):
                await websocket.close(code=1008, reason="Access denied: IVF users only")
                return
            role = user.role.value if hasattr(user.role, "value") else str(user.role)
            branch_id = user.branch_id if role != "Admin" else None
        finally:
            db_temp.close()

        connection_id = await ln2_manager.connect(websocket)
        ln2_manager.active_connections[connection_id]["branch_id"] = branch_id
        ln2_manager.active_connections[connection_id]["role"] = role

        db = SessionLocal()
        try:
            quality_service = QualityService(db)
            while True:
                try:
                    data = await asyncio.wait_for(websocket.receive_text(), timeout=1.0)
                    try:
                        message = json.loads(data)
                        if "tank_code" not in message or not message["tank_code"]:
                            await websocket.send_json(
                                {
                                    "type": "error",
                                    "message": "Subscription must contain 'tank_code'",
                                }
                            )
                            continue
                        tank_code = message["tank_code"]
                        tank_code_str = str(tank_code).strip()

                        if role != "Admin" and branch_id is not None:
                            tank = (
                                db.query(Tank)
                                .filter(
                                    Tank.tank_code == tank_code_str,
                                    Tank.branch_id == branch_id,
                                )
                                .first()
                            )
                        else:
                            tank = (
                                db.query(Tank)
                                .filter(Tank.tank_code == tank_code_str)
                                .first()
                            )
                        if not tank:
                            await websocket.send_json(
                                {
                                    "type": "error",
                                    "message": f"Tank '{tank_code}' not found",
                                }
                            )
                            continue
                        tank_id = tank.tank_id
                        quality_service.validate_tank_belongs_to_branch(
                            tank_id, branch_id
                        )

                        ln2_manager.set_tank_subscription(
                            connection_id, tank_id, tank_code_str
                        )
                        ln2_history = _get_ln2_history_for_tank(
                            db, tank_id, tank_code_str, limit=12
                        )

                        for h in ln2_history:
                            await websocket.send_json(h)
                        await websocket.send_json(
                            {
                                "type": "subscription_confirmed",
                                "tank_id": tank_id,
                                "tank_code": tank_code,
                                "history_count": len(ln2_history),
                            }
                        )
                    except json.JSONDecodeError:
                        pass
                except asyncio.TimeoutError:
                    continue
        finally:
            db.close()
    except WebSocketDisconnect:
        ln2_manager.disconnect_by_websocket(websocket)
        logger.info(f"IVF LN2 WebSocket disconnected: {connection_id}")
    except Exception as e:
        logger.error(f"IVF LN2 WebSocket error: {e}")
        ln2_manager.disconnect_by_websocket(websocket)


# ===========================================================================
# Incubator KPI REST Endpoints + WebSocket
# ===========================================================================

incubator_kpi_manager = ConnectionManager()


@router.get("/incubators/{incubator_id}/kpi-config")
def get_incubator_kpi_config(
    incubator_id: int = Path(..., description="Incubator ID"),
    chamber_id: Optional[str] = Query(None, description="Chamber ID (e.g. A1)"),
    request: Request = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get KPI limits config for an incubator (optionally scoped to a chamber)."""
    incubator = db.query(Incubator).filter(
        Incubator.incubator_id == incubator_id,
        Incubator.hospital_id == current_user.hospital_id,
    ).first()
    if not incubator:
        raise HTTPException(status_code=404, detail=f"Incubator '{incubator_id}' not found")
    quality_service = QualityService(db)
    return quality_service.get_incubator_kpi_config(
        incubator_id, incubator.incubator_code or f"I{incubator_id}", chamber_id
    )


@router.get("/incubators/{incubator_id}/kpi-history")
def get_incubator_kpi_history(
    incubator_id: int = Path(..., description="Incubator ID"),
    chamber_id: Optional[str] = Query(None, description="Chamber ID (e.g. A1)"),
    duration_minutes: Optional[int] = Query(
        None,
        description="LIVE=omit. Static: 60=1H (1min buckets), 1440=24H (30min buckets), 10080=7D (6h buckets).",
    ),
    request: Request = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get KPI history for an incubator chamber. Same time-range semantics as tank endpoint."""
    incubator = db.query(Incubator).filter(
        Incubator.incubator_id == incubator_id,
        Incubator.hospital_id == current_user.hospital_id,
    ).first()
    if not incubator:
        raise HTTPException(status_code=404, detail=f"Incubator '{incubator_id}' not found")

    incubator_code = incubator.incubator_code or f"I{incubator_id}"
    effective_chamber_id = chamber_id or ""

    quality_service = QualityService(db)

    since = (
        datetime.now(timezone.utc) - timedelta(minutes=duration_minutes)
        if duration_minutes
        else None
    )
    latest_timestamp = None
    if duration_minutes in {DURATION_1H, DURATION_24H, DURATION_7D}:
        latest_timestamp = quality_service.get_latest_incubator_kpi_timestamp(
            incubator_id, effective_chamber_id
        )
        if latest_timestamp is not None:
            since = latest_timestamp - timedelta(minutes=duration_minutes)

    aggregated_order_asc = False
    if duration_minutes == DURATION_1H:
        per_kpi = quality_service.get_incubator_kpi_history_aggregated(
            incubator_id, effective_chamber_id, since, AGG_BUCKET_MINUTES_1H, until=latest_timestamp
        ) or {}
        aggregated_order_asc = True
    elif duration_minutes == DURATION_24H:
        per_kpi = quality_service.get_incubator_kpi_history_aggregated(
            incubator_id, effective_chamber_id, since, AGG_BUCKET_MINUTES_24H, until=latest_timestamp
        ) or {}
        aggregated_order_asc = True
    elif duration_minutes == DURATION_7D:
        per_kpi = quality_service.get_incubator_kpi_history_aggregated(
            incubator_id, effective_chamber_id, since, AGG_BUCKET_MINUTES_7D, until=latest_timestamp
        ) or {}
        aggregated_order_asc = True
    elif duration_minutes is not None and duration_minutes > 0:
        per_kpi = quality_service.get_readings_per_kpi_since_incubator(
            incubator_id, effective_chamber_id, since
        ) or {}
    else:
        per_kpi = quality_service.get_last_n_readings_per_kpi_incubator(
            incubator_id, effective_chamber_id, DEFAULT_LIVE_READINGS_CAP
        ) or {}

    kpi_series: dict = {}
    for item in per_kpi.get("kpis") or []:
        name = (item.get("name") or "").strip()
        if not name:
            continue
        kpi_series.setdefault(name, []).append(
            {
                "timestamp": item.get("timestamp"),
                "value": item.get("value"),
                "avg": item.get("avg"),
                "min": item.get("min"),
                "max": item.get("max"),
                "count": item.get("count"),
                "unit": item.get("unit") or "",
            }
        )

    if not aggregated_order_asc:
        for name in list(kpi_series.keys()):
            kpi_series[name].reverse()

    return {
        "incubator_id": incubator_id,
        "incubator_code": incubator_code,
        "chamber_id": effective_chamber_id,
        "kpi_series": kpi_series,
    }


@router.get("/incubators/{incubator_id}/kpi-history-date")
def get_incubator_kpi_history_by_date(
    incubator_id: int = Path(..., description="Incubator ID"),
    chamber_id: Optional[str] = Query(None, description="Chamber ID (e.g. A1)"),
    date: str = Query(..., description="Date in YYYY-MM-DD format (IST)."),
    request: Request = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get KPI history from IST start-of-day for the given date. Same IST→UTC logic as tank endpoint."""
    incubator = db.query(Incubator).filter(
        Incubator.incubator_id == incubator_id,
        Incubator.hospital_id == current_user.hospital_id,
    ).first()
    if not incubator:
        raise HTTPException(status_code=404, detail=f"Incubator '{incubator_id}' not found")

    incubator_code = incubator.incubator_code or f"I{incubator_id}"
    effective_chamber_id = chamber_id or ""

    try:
        selected = datetime.strptime(date.strip(), "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid date format. Expected YYYY-MM-DD.")

    IST_OFFSET = timedelta(hours=5, minutes=30)
    since_utc = datetime(selected.year, selected.month, selected.day, tzinfo=timezone.utc) - IST_OFFSET
    end_of_day_utc = since_utc + timedelta(days=1)
    now_utc = datetime.now(timezone.utc)
    until_utc = min(end_of_day_utc, now_utc)

    if since_utc >= now_utc:
        return {
            "incubator_id": incubator_id,
            "incubator_code": incubator_code,
            "chamber_id": effective_chamber_id,
            "kpi_series": {},
        }

    quality_service = QualityService(db)
    per_kpi = quality_service.get_incubator_kpi_history_aggregated(
        incubator_id, effective_chamber_id, since_utc, AGG_BUCKET_MINUTES_24H, until=until_utc
    ) or {}

    kpi_series: dict = {}
    for item in per_kpi.get("kpis") or []:
        name = (item.get("name") or "").strip()
        if not name:
            continue
        kpi_series.setdefault(name, []).append(
            {
                "timestamp": item.get("timestamp"),
                "value": item.get("value"),
                "avg": item.get("avg"),
                "min": item.get("min"),
                "max": item.get("max"),
                "count": item.get("count"),
                "unit": item.get("unit") or "",
            }
        )

    return {
        "incubator_id": incubator_id,
        "incubator_code": incubator_code,
        "chamber_id": effective_chamber_id,
        "kpi_series": kpi_series,
    }


_CHAMBER_HEALTH_KPIS = {
    "incubator_temp": ("Temperature", "°C"),
    "incubator_o2": ("O₂ Level", "%"),
    "incubator_co2": ("CO₂ Level", "%"),
}

_REFRIGERATOR_HEALTH_KPIS = {
    "refrigerator_humidity": ("Humidity", "%"),
    "refrigerator_temp": ("Temperature", "°C"),
}


@router.get("/incubators/{incubator_id}/chamber-latest")
def get_incubator_chamber_latest(
    incubator_id: int = Path(..., description="Incubator ID"),
    chamber_id: Optional[str] = Query(None, description="Chamber ID (e.g. A1)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the single latest reading for incubator_temp, incubator_o2, incubator_co2."""
    incubator = (
        db.query(Incubator)
        .filter(
            Incubator.incubator_id == incubator_id,
            Incubator.hospital_id == current_user.hospital_id,
        )
        .first()
    )
    if not incubator:
        raise HTTPException(status_code=404, detail=f"Incubator '{incubator_id}' not found")

    effective_chamber_id = chamber_id or ""

    from sqlalchemy import func as sa_func

    subq = (
        db.query(
            KpiConfig.kpi_name,
            Readings.kpi_value,
            KpiConfig.unit,
            sa_func.row_number()
            .over(
                partition_by=KpiConfig.kpi_name,
                order_by=Readings.timestamp.desc(),
            )
            .label("rn"),
        )
        .join(Readings, Readings.kpi_config_id == KpiConfig.id)
        .filter(
            Readings.incubator_id == incubator_id,
            Readings.chamber_id == effective_chamber_id,
            KpiConfig.kpi_name.in_(list(_CHAMBER_HEALTH_KPIS.keys())),
        )
        .subquery()
    )

    rows = db.query(subq.c.kpi_name, subq.c.kpi_value, subq.c.unit).filter(subq.c.rn == 1).all()

    result = []
    for kpi_name, default_label_unit in _CHAMBER_HEALTH_KPIS.items():
        default_label, default_unit = default_label_unit
        match = next((r for r in rows if r.kpi_name == kpi_name), None)
        result.append({
            "kpi_name": kpi_name,
            "label": default_label,
            "value": float(match.kpi_value) if match else None,
            "unit": (match.unit if match and match.unit else default_unit),
        })

    return result


@router.get("/refrigerators/{refrigerator_id}/zones")
def get_refrigerator_zones(
    refrigerator_id: int = Path(..., description="Refrigerator ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the list of named zones defined for a refrigerator (derived from kpi_config)."""
    refrigerator = (
        db.query(Refrigerator)
        .filter(
            Refrigerator.refrigerator_id == refrigerator_id,
            Refrigerator.hospital_id == current_user.hospital_id,
        )
        .first()
    )
    if not refrigerator:
        raise HTTPException(status_code=404, detail=f"Refrigerator '{refrigerator_id}' not found")
    quality_service = QualityService(db)
    return quality_service.get_refrigerator_zones(refrigerator_id)


@router.get("/refrigerators/{refrigerator_id}/kpi-config")
def get_refrigerator_kpi_config(
    refrigerator_id: int = Path(..., description="Refrigerator ID"),
    zone_id: Optional[str] = Query(None, description="Zone ID (e.g. 'fridge', 'freezer')"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get KPI limits config for a refrigerator (optionally scoped to a zone)."""
    refrigerator = db.query(Refrigerator).filter(
        Refrigerator.refrigerator_id == refrigerator_id,
        Refrigerator.hospital_id == current_user.hospital_id,
    ).first()
    if not refrigerator:
        raise HTTPException(status_code=404, detail=f"Refrigerator '{refrigerator_id}' not found")
    quality_service = QualityService(db)
    return quality_service.get_refrigerator_kpi_config(
        refrigerator_id, refrigerator.refrigerator_code or f"R{refrigerator_id}", zone_id
    )


@router.get("/refrigerators/{refrigerator_id}/zone-latest")
def get_refrigerator_zone_latest(
    refrigerator_id: int = Path(..., description="Refrigerator ID"),
    zone_id: Optional[str] = Query(None, description="Zone ID to scope to a specific zone"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the latest reading per KPI for a refrigerator. Optionally scoped to a zone."""
    refrigerator = (
        db.query(Refrigerator)
        .filter(
            Refrigerator.refrigerator_id == refrigerator_id,
            Refrigerator.hospital_id == current_user.hospital_id,
        )
        .first()
    )
    if not refrigerator:
        raise HTTPException(status_code=404, detail=f"Refrigerator '{refrigerator_id}' not found")

    # Step 1: Get kpi_config IDs for this refrigerator (and zone if provided)
    config_q = db.query(KpiConfig).filter(KpiConfig.refrigerator_id == refrigerator_id)
    if zone_id is not None:
        config_q = config_q.filter(KpiConfig.zone_id == zone_id)
    configs = config_q.all()

    # Step 2: For each config, get the latest reading by kpi_config_id
    result = []
    for config in configs:
        reading = (
            db.query(Readings)
            .filter(Readings.kpi_config_id == config.id)
            .order_by(Readings.timestamp.desc())
            .first()
        )
        value = float(reading.kpi_value) if reading and reading.kpi_value is not None else None
        min_val = float(config.min) if config.min is not None else None
        max_val = float(config.max) if config.max is not None else None

        within_threshold = True
        if value is not None:
            if min_val is not None and value < min_val:
                within_threshold = False
            if max_val is not None and value > max_val:
                within_threshold = False

        result.append({
            "kpi_name": config.kpi_name,
            "label": config.kpi_name,
            "value": value,
            "unit": config.unit or "°C",
            "zone_id": zone_id,
            "timestamp": reading.timestamp.isoformat() if reading and reading.timestamp else None,
            "min": min_val,
            "max": max_val,
            "within_threshold": within_threshold,
        })

    if not result:
        for kpi_name, default_label_unit in _REFRIGERATOR_HEALTH_KPIS.items():
            default_label, default_unit = default_label_unit
            result.append({
                "kpi_name": kpi_name,
                "label": default_label,
                "value": None,
                "unit": default_unit,
                "zone_id": zone_id,
                "min": None,
                "max": None,
                "within_threshold": True,
            })

    return result


@router.get("/refrigerators/{refrigerator_id}/kpi-history")
def get_refrigerator_kpi_history(
    refrigerator_id: int = Path(..., description="Refrigerator ID"),
    zone_id: Optional[str] = Query(None, description="Zone ID to scope history to a specific zone"),
    duration_minutes: Optional[int] = Query(
        None,
        description="LIVE=omit. Static: 60=1H (1min buckets), 1440=24H (20min buckets), 10080=7D (3h buckets).",
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get KPI history for a refrigerator zone. Same time-range semantics as incubator endpoint."""
    refrigerator = db.query(Refrigerator).filter(
        Refrigerator.refrigerator_id == refrigerator_id,
        Refrigerator.hospital_id == current_user.hospital_id,
    ).first()
    if not refrigerator:
        raise HTTPException(status_code=404, detail=f"Refrigerator '{refrigerator_id}' not found")

    refrigerator_code = refrigerator.refrigerator_code or f"R{refrigerator_id}"
    quality_service = QualityService(db)

    since = (
        datetime.now(timezone.utc) - timedelta(minutes=duration_minutes)
        if duration_minutes
        else None
    )
    latest_timestamp = None
    if duration_minutes in {DURATION_1H, DURATION_24H, DURATION_7D}:
        latest_timestamp = quality_service.get_latest_refrigerator_kpi_timestamp(refrigerator_id, zone_id)
        if latest_timestamp is not None:
            since = latest_timestamp - timedelta(minutes=duration_minutes)

    aggregated_order_asc = False
    if duration_minutes == DURATION_1H:
        per_kpi = quality_service.get_refrigerator_kpi_history_aggregated(
            refrigerator_id, zone_id, since, AGG_BUCKET_MINUTES_1H, until=latest_timestamp
        ) or {}
        aggregated_order_asc = True
    elif duration_minutes == DURATION_24H:
        per_kpi = quality_service.get_refrigerator_kpi_history_aggregated(
            refrigerator_id, zone_id, since, AGG_BUCKET_MINUTES_24H, until=latest_timestamp
        ) or {}
        aggregated_order_asc = True
    elif duration_minutes == DURATION_7D:
        per_kpi = quality_service.get_refrigerator_kpi_history_aggregated(
            refrigerator_id, zone_id, since, AGG_BUCKET_MINUTES_7D, until=latest_timestamp
        ) or {}
        aggregated_order_asc = True
    elif duration_minutes is not None and duration_minutes > 0:
        per_kpi = quality_service.get_readings_per_kpi_since_refrigerator(refrigerator_id, since, zone_id) or {}
    else:
        per_kpi = quality_service.get_last_n_readings_per_kpi_refrigerator(
            refrigerator_id, DEFAULT_LIVE_READINGS_CAP, zone_id
        ) or {}

    kpi_series: dict = {}
    for item in per_kpi.get("kpis") or []:
        name = (item.get("name") or "").strip()
        if not name:
            continue
        kpi_series.setdefault(name, []).append(
            {
                "timestamp": item.get("timestamp"),
                "value": item.get("value"),
                "avg": item.get("avg"),
                "min": item.get("min"),
                "max": item.get("max"),
                "count": item.get("count"),
                "unit": item.get("unit") or "",
            }
        )

    if not aggregated_order_asc:
        for name in list(kpi_series.keys()):
            kpi_series[name].reverse()

    configs = db.query(KpiConfig).filter(
        KpiConfig.refrigerator_id == refrigerator_id,
    ).all()
    if zone_id:
        configs = [c for c in configs if c.zone_id == zone_id]

    kpi_configs_out = [
        {
            "id": c.id,
            "kpi_name": c.kpi_name,
            "alert_name": c.alert_name,
            "min": float(c.min) if c.min is not None else None,
            "max": float(c.max) if c.max is not None else None,
            "unit": c.unit or "",
            "zone_id": c.zone_id,
            "zone_name": c.zone_name,
        }
        for c in configs
    ]

    return {
        "refrigerator_id": refrigerator_id,
        "refrigerator_code": refrigerator_code,
        "zone_id": zone_id,
        "kpi_configs": kpi_configs_out,
        "kpi_series": kpi_series,
    }


@router.post("/incubators/{incubator_code}/kpi-readings")
def append_incubator_kpi_reading(
    incubator_code: str = Path(..., description="Incubator code"),
    request: Request = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    body: dict = Body(...),
):
    """
    Append an incubator KPI snapshot (store in DB + push to Redis for live graph).
    Body: { incubator_id?, incubator_code?, chamber_id, timestamp, kpis: [{ name, value, unit }] }.
    This is the sensor/device ingestion endpoint — mirrors POST /tanks/{code}/kpi-readings.
    """
    incubator_code_str = str(incubator_code).strip()
    incubator = db.query(Incubator).filter(
        Incubator.incubator_code == incubator_code_str,
        Incubator.hospital_id == current_user.hospital_id,
    ).first()
    if not incubator:
        raise HTTPException(status_code=404, detail=f"Incubator '{incubator_code}' not found")

    if not body or "kpis" not in body:
        raise HTTPException(status_code=400, detail="Body must include 'kpis' array")
    ts = body.get("timestamp")
    if not ts:
        raise HTTPException(status_code=400, detail="Body must include 'timestamp'")
    chamber_id = body.get("chamber_id", "")
    if isinstance(ts, str):
        ts = ts.replace("Z", "+00:00")
        try:
            ts = datetime.fromisoformat(ts)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid timestamp format")
    kpis = list(body["kpis"]) if isinstance(body["kpis"], list) else []
    append_incubator_kpi_snapshot_to_db(
        db, incubator.incubator_id, incubator_code_str, chamber_id, ts, kpis
    )
    db.commit()
    return {
        "incubator_id": incubator.incubator_id,
        "incubator_code": incubator_code_str,
        "chamber_id": chamber_id,
        "timestamp": ts.isoformat() if hasattr(ts, "isoformat") else str(ts),
    }


async def incubator_kpi_redis_listener():
    """Listen for incubator KPI readings from Redis and broadcast to incubator KPI WS clients."""
    loop = asyncio.get_event_loop()
    pubsub = None
    while True:
        try:
            if pubsub is None:
                try:
                    pubsub = get_incubator_kpi_pubsub()
                    logger.info("Incubator KPI Redis listener started")
                except Exception as e:
                    logger.error(f"Error connecting to incubator KPI Redis: {e}. Retrying in 5s...")
                    await asyncio.sleep(5)
                    continue
            message = await loop.run_in_executor(
                None,
                lambda: pubsub.get_message(timeout=1.0, ignore_subscribe_messages=True),
            )
            if message and message.get("type") == "message":
                try:
                    raw = message.get("data")
                    if isinstance(raw, bytes):
                        raw = raw.decode("utf-8")
                    parsed = json.loads(raw)
                    if isinstance(parsed, dict) and "data" in parsed and isinstance(parsed.get("data"), dict):
                        payload = parsed["data"]
                    else:
                        payload = parsed
                    await incubator_kpi_manager.broadcast_incubator(payload)
                except json.JSONDecodeError as e:
                    logger.error(f"Failed to parse incubator KPI message: {e}")
                except Exception as e:
                    logger.error(f"Error broadcasting incubator KPI message: {e}", exc_info=True)
        except Exception as e:
            logger.error(f"Error in incubator_kpi_redis_listener: {e}")
            pubsub = None
            await asyncio.sleep(5)


@router.websocket("/incubator-kpi-ws")
async def incubator_kpi_websocket_endpoint(websocket: WebSocket):
    """
    WebSocket for Incubator KPI Quality Tracking live graph.
    Query: ?token=<jwt>&branch_id_override=<id> (optional, Manager only).
    Send JSON: { "incubator_id": 1, "chamber_id": "A1", "live": true } to subscribe.
    Receives type "incubator_kpi" messages for that incubator/chamber.
    """
    connection_id = None
    user_id = None
    branch_id = None
    role = None

    try:
        query_params = dict(websocket.query_params)
        token = query_params.get("token")
        if not token:
            await websocket.close(code=4401)
            return

        branch_id_override = None
        if query_params.get("branch_id_override"):
            try:
                branch_id_override = int(query_params["branch_id_override"])
            except (ValueError, TypeError):
                pass

        try:
            from app.auth.auth import verify_websocket_token
            auth_info = verify_websocket_token(token)
            user_id = auth_info["user_id"]
        except InvalidTokenException as e:
            logger.warning(f"Incubator KPI WebSocket rejected: invalid token - {e}")
            await websocket.close(code=4401)
            return
        except Exception as e:
            logger.warning(f"Incubator KPI WebSocket rejected: token verification failed - {e}")
            await websocket.close(code=4401)
            return

        db_temp = SessionLocal()
        try:
            user = db_temp.query(User).filter(User.user_id == user_id).first()
            if not user or not user.status:
                await websocket.close(code=4403)
                return
            if getattr(user, "approved_status", None) != "approved":
                await websocket.close(code=4403)
                return
            if not is_specific_department(user.department, "IVF"):
                await websocket.close(code=4403)
                return
            role = user.role.value if hasattr(user.role, "value") else str(user.role)
            branch_id = user.branch_id
            if role == "Manager" and branch_id_override is not None:
                branch_id = branch_id_override
        finally:
            db_temp.close()

        await websocket.accept()
        connection_id = await incubator_kpi_manager.connect(websocket)
        incubator_kpi_manager.active_connections[connection_id]["user_id"] = user_id
        incubator_kpi_manager.active_connections[connection_id]["branch_id"] = branch_id
        incubator_kpi_manager.active_connections[connection_id]["role"] = role
        logger.info(
            f"Incubator KPI WebSocket authenticated: user={user_id}, branch={branch_id}, connection={connection_id}"
        )

    except Exception as e:
        logger.error(f"Incubator KPI WebSocket auth error: {e}", exc_info=True)
        try:
            if connection_id:
                incubator_kpi_manager.disconnect(connection_id)
            await websocket.close(code=1011, reason=str(e))
        except Exception:
            pass
        return

    try:
        db = SessionLocal()
        try:
            while True:
                try:
                    data = await asyncio.wait_for(websocket.receive_text(), timeout=1.0)
                    try:
                        message = json.loads(data)
                        if not isinstance(message, dict):
                            continue
                        incubator_id = message.get("incubator_id")
                        live_val = message.get("live")
                        if incubator_id is None:
                            if live_val is not None:
                                incubator_kpi_manager.set_live(connection_id, bool(live_val))
                            else:
                                await websocket.send_json({
                                    "type": "error",
                                    "message": "Subscription message must contain 'incubator_id'",
                                })
                            continue

                        try:
                            incubator_id_int = int(incubator_id)
                        except (TypeError, ValueError):
                            await websocket.send_json({"type": "error", "message": "Invalid 'incubator_id'"})
                            continue

                        chamber_id = str(message.get("chamber_id") or "")
                        incubator = db.query(Incubator).filter(
                            Incubator.incubator_id == incubator_id_int
                        ).first()
                        if not incubator:
                            await websocket.send_json({
                                "type": "error",
                                "message": f"Incubator {incubator_id_int} not found",
                            })
                            continue

                        incubator_kpi_manager.set_incubator_subscription(
                            connection_id,
                            incubator_id_int,
                            chamber_id,
                            incubator.incubator_code,
                        )
                        incubator_kpi_manager.set_live(connection_id, bool(message.get("live", True)))
                        await websocket.send_json({
                            "type": "subscription_confirmed",
                            "incubator_id": incubator_id_int,
                            "incubator_code": incubator.incubator_code or "",
                            "chamber_id": chamber_id,
                            "branch_id": incubator.branch_id,
                        })
                    except json.JSONDecodeError:
                        pass
                except asyncio.TimeoutError:
                    continue
        finally:
            db.close()
    except WebSocketDisconnect:
        incubator_kpi_manager.disconnect_by_websocket(websocket)
        logger.info(f"Incubator KPI WebSocket disconnected: {connection_id}")
    except Exception as e:
        logger.error(f"Incubator KPI WebSocket error: {e}")
        incubator_kpi_manager.disconnect_by_websocket(websocket)


# ===========================================================================
# Refrigerator KPI REST WebSocket
# ===========================================================================

refrigerator_kpi_manager = ConnectionManager()


async def refrigerator_kpi_redis_listener():
    """Listen for refrigerator KPI readings from Redis and broadcast to WS clients."""
    loop = asyncio.get_event_loop()
    pubsub = None
    while True:
        try:
            if pubsub is None:
                try:
                    pubsub = get_refrigerator_kpi_pubsub()
                    logger.info("Refrigerator KPI Redis listener started")
                except Exception as e:
                    logger.error(f"Error connecting to refrigerator KPI Redis: {e}. Retrying in 5s...")
                    await asyncio.sleep(5)
                    continue
            message = await loop.run_in_executor(
                None,
                lambda: pubsub.get_message(timeout=1.0, ignore_subscribe_messages=True),
            )
            if message and message.get("type") == "message":
                try:
                    raw = message.get("data")
                    if isinstance(raw, bytes):
                        raw = raw.decode("utf-8")
                    parsed = json.loads(raw)
                    if isinstance(parsed, dict) and "data" in parsed and isinstance(parsed.get("data"), dict):
                        payload = parsed["data"]
                    else:
                        payload = parsed
                    await refrigerator_kpi_manager.broadcast_refrigerator(payload)
                except json.JSONDecodeError as e:
                    logger.error(f"Failed to parse refrigerator KPI message: {e}")
                except Exception as e:
                    logger.error(f"Error broadcasting refrigerator KPI message: {e}", exc_info=True)
        except Exception as e:
            logger.error(f"Error in refrigerator_kpi_redis_listener: {e}")
            pubsub = None
            await asyncio.sleep(5)


@router.websocket("/refrigerator-kpi-ws")
async def refrigerator_kpi_websocket_endpoint(websocket: WebSocket):
    """
    WebSocket for Refrigerator KPI Quality Tracking live graph.
    Query: ?token=<jwt>&branch_id_override=<id> (optional, Manager only).
    Send JSON: { "refrigerator_id": 1, "zone_id": "fridge", "live": true } to subscribe.
    Receives type "refrigerator_kpi" messages for that refrigerator/zone.
    """
    connection_id = None
    user_id = None
    branch_id = None
    role = None

    try:
        query_params = dict(websocket.query_params)
        token = query_params.get("token")
        if not token:
            await websocket.close(code=4401)
            return

        branch_id_override = None
        if query_params.get("branch_id_override"):
            try:
                branch_id_override = int(query_params["branch_id_override"])
            except (ValueError, TypeError):
                pass

        try:
            from app.auth.auth import verify_websocket_token
            auth_info = verify_websocket_token(token)
            user_id = auth_info["user_id"]
        except InvalidTokenException as e:
            logger.warning(f"Refrigerator KPI WebSocket rejected: invalid token - {e}")
            await websocket.close(code=4401)
            return
        except Exception as e:
            logger.warning(f"Refrigerator KPI WebSocket rejected: token verification failed - {e}")
            await websocket.close(code=4401)
            return

        db_temp = SessionLocal()
        try:
            user = db_temp.query(User).filter(User.user_id == user_id).first()
            if not user or not user.status:
                await websocket.close(code=4403)
                return
            if getattr(user, "approved_status", None) != "approved":
                await websocket.close(code=4403)
                return
            if not is_specific_department(user.department, "IVF"):
                await websocket.close(code=4403)
                return
            role = user.role.value if hasattr(user.role, "value") else str(user.role)
            branch_id = user.branch_id
            if role == "Manager" and branch_id_override is not None:
                branch_id = branch_id_override
        finally:
            db_temp.close()

        await websocket.accept()
        connection_id = await refrigerator_kpi_manager.connect(websocket)
        refrigerator_kpi_manager.active_connections[connection_id]["user_id"] = user_id
        refrigerator_kpi_manager.active_connections[connection_id]["branch_id"] = branch_id
        refrigerator_kpi_manager.active_connections[connection_id]["role"] = role
        logger.info(
            f"Refrigerator KPI WebSocket authenticated: user={user_id}, branch={branch_id}, connection={connection_id}"
        )

    except Exception as e:
        logger.error(f"Refrigerator KPI WebSocket auth error: {e}", exc_info=True)
        try:
            if connection_id:
                refrigerator_kpi_manager.disconnect(connection_id)
            await websocket.close(code=1011, reason=str(e))
        except Exception:
            pass
        return

    try:
        db = SessionLocal()
        try:
            while True:
                try:
                    data = await asyncio.wait_for(websocket.receive_text(), timeout=1.0)
                    try:
                        message = json.loads(data)
                        if not isinstance(message, dict):
                            continue
                        refrigerator_id = message.get("refrigerator_id")
                        live_val = message.get("live")
                        if refrigerator_id is None:
                            if live_val is not None:
                                refrigerator_kpi_manager.set_live(connection_id, bool(live_val))
                            else:
                                await websocket.send_json({
                                    "type": "error",
                                    "message": "Subscription message must contain 'refrigerator_id'",
                                })
                            continue

                        try:
                            refrigerator_id_int = int(refrigerator_id)
                        except (TypeError, ValueError):
                            await websocket.send_json({"type": "error", "message": "Invalid 'refrigerator_id'"})
                            continue

                        zone_id = message.get("zone_id")
                        if zone_id is not None:
                            zone_id = str(zone_id)
                        refrigerator = db.query(Refrigerator).filter(
                            Refrigerator.refrigerator_id == refrigerator_id_int
                        ).first()
                        if not refrigerator:
                            await websocket.send_json({
                                "type": "error",
                                "message": f"Refrigerator {refrigerator_id_int} not found",
                            })
                            continue

                        refrigerator_kpi_manager.set_refrigerator_subscription(
                            connection_id,
                            refrigerator_id_int,
                            zone_id,
                            refrigerator.refrigerator_code,
                        )
                        refrigerator_kpi_manager.set_live(connection_id, bool(message.get("live", True)))
                        await websocket.send_json({
                            "type": "subscription_confirmed",
                            "refrigerator_id": refrigerator_id_int,
                            "refrigerator_code": refrigerator.refrigerator_code or "",
                            "zone_id": zone_id,
                            "branch_id": refrigerator.branch_id,
                        })
                    except json.JSONDecodeError:
                        pass
                except asyncio.TimeoutError:
                    continue
        finally:
            db.close()
    except WebSocketDisconnect:
        refrigerator_kpi_manager.disconnect_by_websocket(websocket)
        logger.info(f"Refrigerator KPI WebSocket disconnected: {connection_id}")
    except Exception as e:
        logger.error(f"Refrigerator KPI WebSocket error: {e}")
        refrigerator_kpi_manager.disconnect_by_websocket(websocket)
