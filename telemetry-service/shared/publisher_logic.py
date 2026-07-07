"""
Publisher logic module - Core processing functions adapted from Publisher 7.py
Optimized for Azure Functions with error handling, idempotency, and connection pooling.
"""

import json
import logging
import sys
from datetime import datetime, timedelta
from types import SimpleNamespace
from pathlib import Path
from typing import Any, Dict, List, Optional

from sqlalchemy import bindparam, text
from sqlalchemy.dialects.postgresql import JSONB

from .kpi_utils import KPI_NAMES, save_kpi_readings

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))
from shared.alert_api_client import (
    check_and_create_alerts,
    send_refill_detection_to_backend,
    trigger_immediate_alert_email,
)
from shared.database import ensure_telemetry_table_exists, get_session
from shared.idempotency import (
    check_message_processed,
    generate_message_id,
    mark_message_processed,
)
from shared.redis_client import get_redis_client

logger = logging.getLogger(__name__)

# Cache for patient IDs (loaded once, reused across invocations)
_patient_ids_cache: Optional[List[str]] = None

# Parameter thresholds (fallback defaults - will be overridden by Therapy table or Tive if available)
PARAMETER_THRESHOLDS = {
    "temperature": {"min": 2, "max": 8, "unit": "°C"},
    "humidity": {"min": None, "max": 90, "unit": "%"},
    "agitation": {"min": 0, "max": 5, "unit": "G"},
}

# Cache for discovered foreign key column names (to avoid repeated schema queries)
_FK_COLUMNS_CACHE: Optional[Dict[str, str]] = None

# LN2 level smoothing window (minutes)
LN2_LEVEL_AVG_MINUTES = 10
REFILL_ANALYSIS_WINDOW_MINUTES = 5


# ============================================================================
# IVF Detection Helper Functions
# ============================================================================


def extract_device_id_from_webhook(webhook_data: Dict[str, Any]) -> Optional[str]:
    """
    Extract device_id from webhook data.
    Priority: EntityName (primary device identifier) > DeviceId > other fields
    """
    # Priority 1: EntityName (used as device_id for IVF canister/shipment mapping)
    device_id = webhook_data.get("EntityName")

    # Priority 2: Check other possible locations for device ID
    if not device_id:
        device_id = (
            webhook_data.get("DeviceId")
            or webhook_data.get("deviceId")
            or webhook_data.get("Device")
            or webhook_data.get("device")
            or webhook_data.get("TrackerId")
            or webhook_data.get("trackerId")
        )

    # Priority 3: Check in Shipment object
    if not device_id and "Shipment" in webhook_data:
        shipment_obj = webhook_data.get("Shipment")
        if isinstance(shipment_obj, dict):
            device_id = (
                shipment_obj.get("DeviceId")
                or shipment_obj.get("deviceId")
                or shipment_obj.get("Devices")
                or shipment_obj.get("devices")
            )
            # If Devices is a list, get first element
            if isinstance(device_id, list) and len(device_id) > 0:
                device_id = device_id[0]

    return device_id


def find_tank_by_tive_device_id(
    db_session, device_id: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """
    Find tank by tive_device_id (for tank-level monitoring).

    Returns dict with: tank_id, tank_code, branch_id, or None if not found.
    """
    if not device_id:
        return None

    try:
        query = text("""
            SELECT
                tank_id,
                tank_code,
                branch_id,
                is_active,
                status
            FROM tanks
            WHERE tive_device_id = :device_id
            AND is_active = true
            ORDER BY tank_id DESC
            LIMIT 1
        """)

        result = db_session.execute(query, {"device_id": device_id})
        row = result.fetchone()

        if row:
            return {
                "tank_id": row[0],
                "tank_code": row[1],
                "branch_id": row[2],
                "is_active": row[3],
                "status": row[4],
            }
        return None
    except Exception as e:
        logger.error(f"Error finding tank by tive_device_id: {e}", exc_info=True)
        return None


def is_custom_iot_source(webhook_payload: Dict[str, Any]) -> bool:
    """
    Detect CUSTOM_IOT source from payload field.
    CUSTOM_IOT payloads have source="CUSTOM_IOT".
    """
    return (
        webhook_payload.get("source") == "CUSTOM_IOT"
        or webhook_payload.get("source") == "CUSTOM-IOT"
    )


def find_ivf_shipment_by_identifiers(
    db_session, shipment_id: Optional[str] = None, device_id: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """
    Find IVF shipment by shipment_id, iot_shipment_id, or device_id.

    Returns dict with: shipment_id, iot_shipment_id, device_id, source_branch_id, destination_branch_id.
    Note: tank_id, tank_code, and canister_number should be obtained from find_tank_by_tive_device_id().
    """
    try:
        # Query only ivf_shipment table - tank info comes from find_tank_by_tive_device_id()
        query = text("""
            SELECT
                ivf.shipment_id,
                ivf.iot_shipment_id,
                ivf.device_id,
                ivf.source_branch_id,
                ivf.destination_branch_id
            FROM ivf_shipment ivf
            WHERE
                (ivf.shipment_id = :shipment_id AND :shipment_id IS NOT NULL)
                OR (ivf.iot_shipment_id = :shipment_id AND :shipment_id IS NOT NULL)
                OR (ivf.device_id = :device_id AND :device_id IS NOT NULL)
            ORDER BY ivf.created_at DESC
            LIMIT 1
        """)

        result = db_session.execute(
            query, {"shipment_id": shipment_id, "device_id": device_id}
        )
        row = result.fetchone()

        if row:
            return {
                "shipment_id": row[0],
                "iot_shipment_id": row[1],
                "device_id": row[2],
                "source_branch_id": row[3],
                "destination_branch_id": row[4],
                "tank_id": None,  # Will be populated from tank_info
                "canister_number": None,  # Will be populated from tank_info if available
                "tank_code": None,  # Will be populated from tank_info
            }
        return None
    except Exception as e:
        logger.error(f"Error finding IVF shipment: {e}", exc_info=True)
        # Rollback transaction to clear failed state
        try:
            db_session.rollback()
        except:
            pass  # Ignore rollback errors
        return None


# ============================================================================
# LN2 IoT Helper Functions (CUSTOM_IOT source)
# ============================================================================


def _parse_optional_float(value: Optional[Any]) -> Optional[float]:
    if value in (None, "None", ""):
        return None
    if isinstance(value, (bytes, bytearray)):
        try:
            value = value.decode()
        except Exception:
            return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _parse_bool(value: Optional[Any]) -> bool:
    return str(value).lower() in ("1", "true", "yes", "y", "t")


def _select_lid_weight(observed_delta: Optional[float], cfg) -> float:
    midpoint = (cfg.lid_weight_min_kg + cfg.lid_weight_max_kg) / 2.0
    if observed_delta is None:
        return midpoint
    if cfg.lid_weight_min_kg <= observed_delta <= cfg.lid_weight_max_kg:
        return observed_delta
    return midpoint


def _start_refill_session(
    device_code: str,
    timestamp: datetime,
    baseline_mass_kg: float,
    raw_mass_kg: float,
    smoothed_mass_kg: float,
    cfg,
) -> Dict[str, Any]:
    """Initialize a refill session when the lid transitions CLOSED -> OPEN."""
    clear_ln2_refill_window(device_code)
    observed_lid_drop = baseline_mass_kg - raw_mass_kg
    observed_lid_drop = observed_lid_drop if observed_lid_drop > 0 else None
    lid_weight_kg = _select_lid_weight(observed_lid_drop, cfg)
    start_ts = timestamp.isoformat()

    adjusted_raw = raw_mass_kg + lid_weight_kg
    adjusted_smoothed = smoothed_mass_kg + lid_weight_kg

    return {
        "refill_active": True,
        "refill_start_ts": start_ts,
        "refill_lid_weight_kg": lid_weight_kg,
        "refill_min_raw_kg": adjusted_raw,
        "refill_max_raw_kg": adjusted_raw,
        "refill_min_smoothed_kg": adjusted_smoothed,
        "refill_max_smoothed_kg": adjusted_smoothed,
        "refill_last_updated": start_ts,
    }


def _update_refill_session(
    device_code: str,
    timestamp: datetime,
    refill_start_ts: Optional[str],
    refill_lid_weight_kg: Optional[float],
    refill_min_raw_kg: Optional[float],
    refill_max_raw_kg: Optional[float],
    refill_min_smoothed_kg: Optional[float],
    refill_max_smoothed_kg: Optional[float],
    window_minutes: int,
    smoothed_mass_kg: float,
    raw_mass_kg: float,
    cfg,
) -> Dict[str, Any]:
    """Update min/max values from the refill buffer while lid is OPEN."""
    from .ln2_iot.ln2_logic import detect_transient_spike

    refill_start_dt = (
        datetime.fromisoformat(refill_start_ts) if refill_start_ts else timestamp
    )
    refill_cutoff = max(
        refill_start_dt,
        timestamp - timedelta(minutes=window_minutes),
    )
    refill_points = get_ln2_refill_points(device_code, refill_cutoff)
    refill_spike = detect_transient_spike(
        refill_points,
        timestamp,
        raw_mass_kg,
        cfg,
    )

    if not refill_spike:
        adjusted_raw_points = [
            m + (refill_lid_weight_kg or 0.0)
            for ts, m in refill_points
            if ts >= refill_start_dt
        ]
        if adjusted_raw_points:
            raw_min = min(adjusted_raw_points)
            raw_max = max(adjusted_raw_points)
            refill_min_raw_kg = (
                raw_min
                if refill_min_raw_kg is None
                else min(refill_min_raw_kg, raw_min)
            )
            refill_max_raw_kg = (
                raw_max
                if refill_max_raw_kg is None
                else max(refill_max_raw_kg, raw_max)
            )

        adjusted_smoothed = smoothed_mass_kg + (refill_lid_weight_kg or 0.0)
        refill_min_smoothed_kg = (
            adjusted_smoothed
            if refill_min_smoothed_kg is None
            else min(refill_min_smoothed_kg, adjusted_smoothed)
        )
        refill_max_smoothed_kg = (
            adjusted_smoothed
            if refill_max_smoothed_kg is None
            else max(refill_max_smoothed_kg, adjusted_smoothed)
        )

    append_ln2_refill_point(device_code, timestamp, raw_mass_kg)

    return {
        "refill_min_raw_kg": refill_min_raw_kg,
        "refill_max_raw_kg": refill_max_raw_kg,
        "refill_min_smoothed_kg": refill_min_smoothed_kg,
        "refill_max_smoothed_kg": refill_max_smoothed_kg,
        "refill_last_updated": timestamp.isoformat(),
    }


def _close_refill_session(
    device_code: str,
    timestamp: datetime,
    baseline_mass_kg: float,
    raw_mass_kg: float,
    refill_active: bool,
    refill_start_ts: Optional[str],
    refill_min_smoothed_kg: Optional[float],
    refill_max_smoothed_kg: Optional[float],
    cfg,
    ln2_density_kg_per_l: float,
) -> Dict[str, Any]:
    """Close refill session and compute refill amount when lid transitions OPEN -> CLOSED."""
    observed_lid_gain = raw_mass_kg - baseline_mass_kg
    observed_lid_gain = observed_lid_gain if observed_lid_gain > 0 else None
    lid_weight_kg = _select_lid_weight(observed_lid_gain, cfg)

    refill_event_triggered = False
    refill_amount_kg = None
    refill_amount_l = None
    refill_event_start_ts = None
    refill_event_end_ts = None

    if refill_active and refill_min_smoothed_kg is not None and refill_max_smoothed_kg is not None:
        refill_amount_kg = max(0.0, refill_max_smoothed_kg - refill_min_smoothed_kg)
        if refill_amount_kg >= cfg.refill_threshold_kg:
            refill_event_triggered = True
            refill_amount_l = refill_amount_kg / ln2_density_kg_per_l
            refill_event_start_ts = refill_start_ts
            refill_event_end_ts = timestamp.isoformat()
        else:
            refill_amount_kg = None

    clear_ln2_refill_window(device_code)

    return {
        "refill_active": False,
        "refill_start_ts": None,
        "refill_lid_weight_kg": None,
        "refill_min_raw_kg": None,
        "refill_max_raw_kg": None,
        "refill_min_smoothed_kg": None,
        "refill_max_smoothed_kg": None,
        "refill_last_updated": timestamp.isoformat(),
        "refill_event_triggered": refill_event_triggered,
        "refill_amount_kg": refill_amount_kg,
        "refill_amount_l": refill_amount_l,
        "refill_event_start_ts": refill_event_start_ts,
        "refill_event_end_ts": refill_event_end_ts,
        "refill_lid_weight_kg_override": lid_weight_kg,
    }


def get_ln2_device_config(db_session, device_code: str):
    """
    Load DeviceConfig from database (synchronous version for webhook processing).
    Query joins: devices → ln2_iot_devices → tanks

    Returns DeviceConfig dataclass or None if device not registered.
    """
    try:
        query = text("""
            SELECT
            d.id AS device_pk,
            d.device_code,
            lid.tank_id,
            t.empty_weight_kg,
            t.full_weight_kg,
            t.capacity_liters,
            t.static_evap_rate_l_per_day,
            t.tank_code,
            COALESCE(lid.tank_min_capacity_reading, t.empty_weight_kg - 2.0) AS sensor_min_kg,
            COALESCE(lid.tank_max_capacity_reading, t.full_weight_kg + 2.0) AS sensor_max_kg,
            lid.closed_noise_margin_kg_per_h,
            lid.open_rate_min_kg_per_h,
            lid.refill_threshold_kg,
            lid.window_minutes,
            lid.window_min_points,
            lid.consecutive_windows_for_state,
            COALESCE(lid.spike_tolerance_kg, 0.8)             AS spike_tolerance_kg,
            COALESCE(lid.spike_max_duration_s, 90)            AS spike_max_duration_s,
            COALESCE(lid.lid_weight_min_kg, 0.45)             AS lid_weight_min_kg,
            COALESCE(lid.lid_weight_max_kg, 0.65)             AS lid_weight_max_kg,
            COALESCE(lid.lid_confirm_stable_points, 4)        AS lid_confirm_stable_points,
            COALESCE(lid.low_level_threshold_kg, 5.0)         AS low_level_threshold_kg,
            COALESCE(lid.low_level_consecutive_readings, 10)  AS low_level_consecutive_readings,
            COALESCE(lid.canister_weight_kg, 0.31)            AS canister_weight_kg,
            COALESCE(lid.canister_tolerance_kg, 0.05)         AS canister_tolerance_kg,
            COALESCE(lid.product_change_max_kg, 0.08)         AS product_change_max_kg,
            COALESCE(lid.precaution_level_pct, 15.0)          AS precaution_level_pct
            FROM devices d
            JOIN ln2_iot_devices lid ON lid.device_id = d.id
            JOIN tanks t ON t.tank_id = lid.tank_id
            WHERE d.device_code = :device_code
            LIMIT 1
        """)

        result = db_session.execute(query, {"device_code": device_code})
        row = result.fetchone()

        if row is None:
            return None

        # Import DeviceConfig dataclass from ln2_iot.device_config
        from .ln2_iot.device_config import DeviceConfig

        return DeviceConfig(
            device_code=device_code,
            device_pk=int(row[0]),
            tank_id=int(row[2]),
            tank_code=row[7],
            empty_weight_kg=float(row[3]),
            full_weight_kg=float(row[4]),
            capacity_liters=float(row[5]),
            static_evap_rate_l_per_day=float(row[6]),
            sensor_min_kg=float(row[8]),
            sensor_max_kg=float(row[9]),
            closed_noise_margin_kg_per_h=float(row[10]),
            open_rate_min_kg_per_h=float(row[11]),
            refill_threshold_kg=float(row[12]),
            window_minutes=int(row[13]),
            window_min_points=int(row[14]),
            consecutive_windows_for_state=int(row[15]),
            # ── New event-detection fields ──
            spike_tolerance_kg=float(row[16]),
            spike_max_duration_s=int(row[17]),
            lid_weight_min_kg=float(row[18]),
            lid_weight_max_kg=float(row[19]),
            lid_confirm_stable_points=int(row[20]),
            low_level_threshold_kg=float(row[21]),
            low_level_consecutive_readings=int(row[22]),
            canister_weight_kg=float(row[23]),
            canister_tolerance_kg=float(row[24]),
            product_change_max_kg=float(row[25]),
            precaution_level_pct=float(row[26]),
        )
    except Exception as e:
        logger.error(
            f"Error loading LN2 device config for {device_code}: {e}", exc_info=True
        )
        return None


def get_ln2_device_state(device_code: str) -> Dict[str, Any]:
    """Get current lid state from Redis (synchronous)."""
    try:
        r = get_redis_client()
        key = f"ln2:{device_code}:state"
        data = r.hgetall(key)

        if not data:
            return {
                "current_state": "UNKNOWN",
                "open_counter": 0,
                "closed_counter": 0,
                "last_rate_kg_per_h": None,
                "last_updated": None,
                "low_level_counter": 0,
                "lid_candidate_since": None,
                "refill_active": False,
                "refill_start_ts": None,
                "refill_lid_weight_kg": None,
                "refill_min_raw_kg": None,
                "refill_max_raw_kg": None,
                "refill_min_smoothed_kg": None,
                "refill_max_smoothed_kg": None,
                "refill_last_updated": None,
            }

        return {
            "current_state": data.get("current_state", "UNKNOWN"),
            "open_counter": int(data.get("open_counter", 0)),
            "closed_counter": int(data.get("closed_counter", 0)),
            "last_rate_kg_per_h": float(data["last_rate_kg_per_h"])
            if data.get("last_rate_kg_per_h") not in (None, "None", "")
            else None,
            "last_updated": data.get("last_updated"),
            "low_level_counter": int(data.get("low_level_counter", 0)),
            "lid_candidate_since": (
                data["lid_candidate_since"]
                if data.get("lid_candidate_since") not in (None, "None", "")
                else None
            ),
            "refill_active": _parse_bool(data.get("refill_active")),
            "refill_start_ts": (
                data["refill_start_ts"]
                if data.get("refill_start_ts") not in (None, "None", "")
                else None
            ),
            "refill_lid_weight_kg": _parse_optional_float(
                data.get("refill_lid_weight_kg")
            ),
            "refill_min_raw_kg": _parse_optional_float(data.get("refill_min_raw_kg")),
            "refill_max_raw_kg": _parse_optional_float(data.get("refill_max_raw_kg")),
            "refill_min_smoothed_kg": _parse_optional_float(
                data.get("refill_min_smoothed_kg")
            ),
            "refill_max_smoothed_kg": _parse_optional_float(
                data.get("refill_max_smoothed_kg")
            ),
            "refill_last_updated": (
                data["refill_last_updated"]
                if data.get("refill_last_updated") not in (None, "None", "")
                else None
            ),
        }
    except Exception as e:
        logger.error(f"Error getting LN2 device state for {device_code}: {e}")
        return {
            "current_state": "UNKNOWN",
            "open_counter": 0,
            "closed_counter": 0,
            "last_rate_kg_per_h": None,
            "last_updated": None,
            "low_level_counter": 0,
            "lid_candidate_since": None,
            "refill_active": False,
            "refill_start_ts": None,
            "refill_lid_weight_kg": None,
            "refill_min_raw_kg": None,
            "refill_max_raw_kg": None,
            "refill_min_smoothed_kg": None,
            "refill_max_smoothed_kg": None,
            "refill_last_updated": None,
        }


def save_ln2_device_state(device_code: str, state_data: Dict[str, Any]) -> None:
    """Save lid state to Redis with TTL (synchronous)."""
    try:
        r = get_redis_client()
        key = f"ln2:{device_code}:state"
        mapping = {
            "current_state": state_data["current_state"],
            "open_counter": str(state_data["open_counter"]),
            "closed_counter": str(state_data["closed_counter"]),
            "last_rate_kg_per_h": str(round(state_data["last_rate_kg_per_h"], 6))
            if state_data.get("last_rate_kg_per_h")
            else "None",
            "last_updated": state_data["last_updated"],
            "low_level_counter": str(state_data.get("low_level_counter", 0)),
            "lid_candidate_since": state_data.get("lid_candidate_since") or "None",
            "refill_active": "1" if state_data.get("refill_active") else "0",
            "refill_start_ts": state_data.get("refill_start_ts") or "None",
            "refill_lid_weight_kg": str(round(state_data["refill_lid_weight_kg"], 6))
            if state_data.get("refill_lid_weight_kg") is not None
            else "None",
            "refill_min_raw_kg": str(round(state_data["refill_min_raw_kg"], 6))
            if state_data.get("refill_min_raw_kg") is not None
            else "None",
            "refill_max_raw_kg": str(round(state_data["refill_max_raw_kg"], 6))
            if state_data.get("refill_max_raw_kg") is not None
            else "None",
            "refill_min_smoothed_kg": str(
                round(state_data["refill_min_smoothed_kg"], 6)
            )
            if state_data.get("refill_min_smoothed_kg") is not None
            else "None",
            "refill_max_smoothed_kg": str(
                round(state_data["refill_max_smoothed_kg"], 6)
            )
            if state_data.get("refill_max_smoothed_kg") is not None
            else "None",
            "refill_last_updated": state_data.get("refill_last_updated") or "None",
        }
        r.hset(key, mapping=mapping)
        r.expire(key, 86400)  # 24h TTL
    except Exception as e:
        logger.error(f"Error saving LN2 device state for {device_code}: {e}")


def append_ln2_window_point(
    device_code: str, timestamp: datetime, mass_kg: float, cfg
) -> None:
    """Append (timestamp, mass) to sliding window (synchronous)."""
    try:
        r = get_redis_client()
        key = f"ln2:{device_code}:window"
        entry = json.dumps({"ts": timestamp.isoformat(), "mass": round(mass_kg, 6)})
        max_len = cfg.window_minutes * 60 + 120

        r.rpush(key, entry)
        r.ltrim(key, -max_len, -1)
        r.expire(key, 86400)
    except Exception as e:
        logger.error(f"Error appending LN2 window point for {device_code}: {e}")


def append_ln2_refill_point(device_code: str, timestamp: datetime, mass_kg: float) -> None:
    """Append (timestamp, mass) to refill-session buffer (synchronous)."""
    try:
        r = get_redis_client()
        key = f"ln2:{device_code}:refill_window"
        entry = json.dumps({"ts": timestamp.isoformat(), "mass": round(mass_kg, 6)})
        max_len = REFILL_ANALYSIS_WINDOW_MINUTES * 60 + 120

        r.rpush(key, entry)
        r.ltrim(key, -max_len, -1)
        r.expire(key, 86400)
    except Exception as e:
        logger.error(f"Error appending LN2 refill point for {device_code}: {e}")


def get_ln2_window_points(device_code: str, cutoff_ts: datetime) -> List:
    """Get window points newer than cutoff_ts (synchronous)."""
    try:
        r = get_redis_client()
        key = f"ln2:{device_code}:window"
        raw_list = r.lrange(key, 0, -1)

        points = []
        stale_count = 0

        for raw in raw_list:
            try:
                obj = json.loads(raw)
                ts = datetime.fromisoformat(obj["ts"])
                mass = float(obj["mass"])

                if ts >= cutoff_ts:
                    points.append((ts, mass))
                else:
                    stale_count += 1
            except (json.JSONDecodeError, KeyError, ValueError) as exc:
                logger.warning(f"Corrupt window entry for {device_code}: {exc}")
                stale_count += 1

        # Lazy cleanup of stale entries
        if stale_count > 0:
            keep_from = len(raw_list) - len(points)
            if keep_from > 0:
                r.ltrim(key, keep_from, -1)

        return points
    except Exception as e:
        logger.error(f"Error getting LN2 window points for {device_code}: {e}")
        return []


def get_ln2_refill_points(device_code: str, cutoff_ts: datetime) -> List:
    """Get refill-session points newer than cutoff_ts (synchronous)."""
    try:
        r = get_redis_client()
        key = f"ln2:{device_code}:refill_window"
        raw_list = r.lrange(key, 0, -1)

        points = []
        stale_count = 0

        for raw in raw_list:
            try:
                obj = json.loads(raw)
                ts = datetime.fromisoformat(obj["ts"])
                mass = float(obj["mass"])

                if ts >= cutoff_ts:
                    points.append((ts, mass))
                else:
                    stale_count += 1
            except (json.JSONDecodeError, KeyError, ValueError) as exc:
                logger.warning(f"Corrupt refill entry for {device_code}: {exc}")
                stale_count += 1

        if stale_count > 0:
            keep_from = len(raw_list) - len(points)
            if keep_from > 0:
                r.ltrim(key, keep_from, -1)

        return points
    except Exception as e:
        logger.error(f"Error getting LN2 refill points for {device_code}: {e}")
        return []


def clear_ln2_refill_window(device_code: str) -> None:
    """Clear refill-session buffer (synchronous)."""
    try:
        r = get_redis_client()
        r.delete(f"ln2:{device_code}:refill_window")
    except Exception as e:
        logger.error(f"Error clearing LN2 refill window for {device_code}: {e}")


def clear_ln2_window(device_code: str) -> None:
    """Clear window after refill (synchronous)."""
    try:
        r = get_redis_client()
        r.delete(f"ln2:{device_code}:window")
    except Exception as e:
        logger.error(f"Error clearing LN2 window for {device_code}: {e}")


def remove_ln2_spike_points(device_code: str, spike_cutoff: datetime) -> None:
    """
    Remove window points that are part of a transient spike (synchronous).
    Deletes all entries with timestamp ≥ spike_cutoff from the window list.
    """
    try:
        r = get_redis_client()
        key = f"ln2:{device_code}:window"
        raw_list = r.lrange(key, 0, -1)

        keep = []
        for raw in raw_list:
            try:
                obj = json.loads(raw)
                ts = datetime.fromisoformat(obj["ts"])
            except (json.JSONDecodeError, KeyError, ValueError):
                continue
            if ts < spike_cutoff:
                keep.append(raw)

        pipe = r.pipeline(transaction=False)
        pipe.delete(key)
        if keep:
            pipe.rpush(key, *keep)
        pipe.expire(key, 86400)
        pipe.execute()

        logger.info(
            f"Removed spike points from window for device={device_code} "
            f"(cutoff={spike_cutoff.isoformat()}, kept={len(keep)})"
        )
    except Exception as e:
        logger.error(f"Error removing spike points for {device_code}: {e}")


def _rate_bucket_key(device_code: str) -> str:
    return f"ln2:{device_code}:rate_buckets"


def _rate_bucket_state_key(device_code: str) -> str:
    return f"ln2:{device_code}:rate_bucket_state"


def _rate_bucket_start(ts: datetime, bucket_minutes: int) -> datetime:
    minute = (ts.minute // bucket_minutes) * bucket_minutes
    return ts.replace(minute=minute, second=0, microsecond=0)


def _rate_bucket_max_len(bucket_minutes: int, window_hours: int) -> int:
    return int((window_hours * 60) / bucket_minutes) + 24


def update_ln2_rate_bucket(
    device_code: str,
    timestamp: datetime,
    mass_kg: float,
    bucket_minutes: int,
    window_hours: int,
) -> None:
    """Update the in-progress bucket; finalize the previous bucket on rollover."""
    try:
        r = get_redis_client()
        state_key = _rate_bucket_state_key(device_code)
        bucket_key = _rate_bucket_key(device_code)

        bucket_start = _rate_bucket_start(timestamp, bucket_minutes).isoformat()
        state = r.hgetall(state_key)

        if state and state.get("bucket_start") == bucket_start:
            sum_mass = float(state.get("sum_mass", 0.0)) + mass_kg
            count = int(state.get("count", 0)) + 1
            r.hset(state_key, mapping={
                "bucket_start": bucket_start,
                "sum_mass": str(round(sum_mass, 6)),
                "count": str(count),
            })
            r.expire(state_key, 86400)
            return

        pipe = r.pipeline(transaction=False)
        if state and state.get("count") not in (None, "0", ""):
            try:
                prev_sum = float(state.get("sum_mass", 0.0))
                prev_count = int(state.get("count", 0))
                if prev_count > 0:
                    avg_mass = prev_sum / prev_count
                    entry = json.dumps(
                        {"ts": state.get("bucket_start"), "avg_mass": round(avg_mass, 6)}
                    )
                    max_len = _rate_bucket_max_len(bucket_minutes, window_hours)
                    pipe.rpush(bucket_key, entry)
                    pipe.ltrim(bucket_key, -max_len, -1)
                    pipe.expire(bucket_key, 86400)
            except (ValueError, TypeError):
                pass

        pipe.hset(state_key, mapping={
            "bucket_start": bucket_start,
            "sum_mass": str(round(mass_kg, 6)),
            "count": "1",
        })
        pipe.expire(state_key, 86400)
        pipe.execute()
    except Exception as e:
        logger.error(f"Error updating LN2 rate bucket for {device_code}: {e}")


def get_ln2_rate_buckets(
    device_code: str,
    cutoff_ts: datetime,
) -> List:
    """Return bucket points newer than cutoff_ts (synchronous)."""
    try:
        r = get_redis_client()
        key = _rate_bucket_key(device_code)
        raw_list = r.lrange(key, 0, -1)

        points = []
        stale_count = 0

        for raw in raw_list:
            try:
                obj = json.loads(raw)
                ts = datetime.fromisoformat(obj["ts"])
                mass = float(obj["avg_mass"])

                if ts >= cutoff_ts:
                    points.append((ts, mass))
                else:
                    stale_count += 1
            except (json.JSONDecodeError, KeyError, ValueError) as exc:
                logger.warning(f"Corrupt rate bucket entry for {device_code}: {exc}")
                stale_count += 1

        if stale_count > 0:
            keep_from = len(raw_list) - len(points)
            if keep_from > 0:
                r.ltrim(key, keep_from, -1)

        return points
    except Exception as e:
        logger.error(f"Error getting LN2 rate buckets for {device_code}: {e}")
        return []


def clear_ln2_rate_buckets(device_code: str) -> None:
    """Clear rate bucket state and history (synchronous)."""
    try:
        r = get_redis_client()
        pipe = r.pipeline(transaction=False)
        pipe.delete(_rate_bucket_key(device_code))
        pipe.delete(_rate_bucket_state_key(device_code))
        pipe.execute()
    except Exception as e:
        logger.error(f"Error clearing LN2 rate buckets for {device_code}: {e}")


def insert_ln2_iot_raw_data(
    db_session,
    tank_id: int,
    device_id: int,
    raw_data: float,
    payload: Dict[str, Any],
    timestamp: datetime,
) -> Optional[int]:
    """Insert raw sensor data into ln2_iot_raw_data table."""
    try:
        insert_query = text("""
            INSERT INTO ln2_iot_raw_data
            (tank_id, device_id, raw_data, payload, created_at)
            VALUES (:tank_id, :device_id, :raw_data, :payload, :created_at)
            RETURNING id
        """).bindparams(bindparam("payload", type_=JSONB))

        result = db_session.execute(
            insert_query,
            {
                "tank_id": tank_id,
                "device_id": device_id,
                "raw_data": raw_data,
                "payload": payload,
                "created_at": timestamp,
            },
        )

        row_id = result.scalar()
        logger.info(f"✓ Inserted ln2_iot_raw_data (id={row_id}, device_id={device_id})")
        return row_id
    except Exception as e:
        logger.error(f"Error inserting ln2_iot_raw_data: {e}", exc_info=True)
        raise


def insert_ln2_reading(
    db_session,
    device_id: int,
    tank_id: int,
    ln2_level_pct: float,
    evap_rate: Optional[float],
    timestamp: datetime,
    raw_weight_kg: Optional[float] = None,
    ln2_mass_kg: Optional[float] = None,
    ln2_volume_l: Optional[float] = None,
    sensor_status: Optional[str] = None,
    lid_state: Optional[str] = None,
    refill_detected: Optional[bool] = None,
    quality_status: Optional[str] = None,
) -> Optional[int]:
    """Insert processed reading into ln2_readings table (only when rate available)."""
    if evap_rate is None:
        return None  # Don't insert until we have a rate estimate

    try:
        insert_query = text("""
            INSERT INTO ln2_readings
            (device_id, tank_id, ln2_level_pct, evaporation_rate_kg_per_h, reading_timestamp, created_at,
             raw_weight_kg, ln2_mass_kg, ln2_volume_l, sensor_status, lid_state, refill_detected, quality_status)
            VALUES (:device_id, :tank_id, :ln2_level_pct, :evap_rate, :reading_timestamp, :created_at,
                    :raw_weight_kg, :ln2_mass_kg, :ln2_volume_l, :sensor_status, :lid_state, :refill_detected, :quality_status)
            RETURNING id
        """)

        result = db_session.execute(
            insert_query,
            {
                "device_id": device_id,
                "tank_id": tank_id,
                "ln2_level_pct": ln2_level_pct,
                "evap_rate": evap_rate,
                "reading_timestamp": timestamp,
                "created_at": datetime.now(),
                "raw_weight_kg": raw_weight_kg,
                "ln2_mass_kg": ln2_mass_kg,
                "ln2_volume_l": ln2_volume_l,
                "sensor_status": sensor_status,
                "lid_state": lid_state,
                "refill_detected": refill_detected,
                "quality_status": quality_status,
            },
        )

        row_id = result.scalar()
        logger.info(f"✓ Inserted ln2_reading (id={row_id}, device_id={device_id})")
        return row_id
    except Exception as e:
        logger.error(f"Error inserting ln2_reading: {e}", exc_info=True)
        raise


def publish_ln2_to_redis(device_code: str, quality_data: Dict[str, Any]) -> bool:
    """Publish LN2 quality data to Redis (similar to IVF pattern)."""
    try:
        r = get_redis_client()
        data_json = json.dumps(quality_data)

        # Publish to channel
        r.publish(f"ln2_readings_channel:{device_code}", data_json)
        logger.info(f"✓ Published to ln2_readings_channel (device={device_code})")

        # Store in history – key by tank_id so the dashboard can read it back
        tank_id = quality_data.get("tank_id")
        history_key = (
            f"ln2_quality_history:{tank_id}"
            if tank_id
            else f"ln2_quality_history:{device_code}"
        )
        r.lpush(history_key, data_json)
        r.ltrim(history_key, 0, 29)  # Keep last 30 (matches dashboard limit)

        # Add to devices set
        r.sadd("ln2_devices", device_code)

        return True
    except Exception as e:
        logger.error(f"Error publishing LN2 to Redis: {e}")
        return False  # Non-critical


def check_ln2_alert_conditions(
    rate_estimate, state_step, sensor_reading, cfg, last_state_change
) -> Dict[str, bool]:
    """
    Determine which alert conditions are met.
    Returns dict of alert flags.
    """
    alerts = {
        "excessive_evaporation": False,
        "lid_open_beyond_threshold": False,
        "sensor_fault": False,
    }

    # 1. Excessive evaporation (rate > threshold)
    if rate_estimate is not None:
        threshold = cfg.open_rate_min_kg_per_h * 1.5  # 50% above open rate
        alerts["excessive_evaporation"] = rate_estimate.loss_rate_kg_per_h > threshold

    # 2. Lid open beyond threshold (>30 minutes)
    if state_step and state_step.new_state.value == "OPEN":
        if last_state_change:
            try:
                last_change_dt = datetime.fromisoformat(last_state_change)
                duration_minutes = (
                    datetime.now() - last_change_dt
                ).total_seconds() / 60
                alerts["lid_open_beyond_threshold"] = duration_minutes > 30
            except (ValueError, TypeError) as e:
                logger.warning(
                    f"Failed to parse last_state_change '{last_state_change}': {e}"
                )

    # 3. Sensor fault
    alerts["sensor_fault"] = sensor_reading.status.value != "OK"

    return alerts


def trigger_ln2_alerts(
    tank_id: int,
    device_code: str,
    alert_conditions: Dict[str, bool],
    quality_data: Dict[str, Any],
) -> None:
    """Trigger email alerts for LN2 violations."""
    if not any(alert_conditions.values()):
        return  # No alerts needed

    alert_payload = {
        "device_code": device_code,
        "tank_id": tank_id,
        "alert_type": "LN2_MONITORING",
        "excessive_evaporation": alert_conditions["excessive_evaporation"],
        "lid_open_beyond_threshold": alert_conditions["lid_open_beyond_threshold"],
        "sensor_fault": alert_conditions["sensor_fault"],
        "ln2_level_pct": quality_data.get("ln2_level_pct"),
        "evaporation_rate": quality_data.get("evaporation_rate_kg_per_h"),
        "lid_state": quality_data.get("lid_state"),
        "sensor_status": quality_data.get("sensor_status"),
    }

    try:
        trigger_immediate_alert_email(
            tank_id=tank_id,
            quality_log_data=alert_payload,
            occurred_at=quality_data.get("timestamp"),
        )
        logger.info(f"✓ Triggered LN2 alert for tank {tank_id}, device {device_code}")
    except Exception as e:
        logger.error(f"Error triggering LN2 alert: {e} (non-critical)")


def process_custom_iot_ln2(db_session, webhook_payload: Dict[str, Any]) -> bool:
    """
    Process CUSTOM_IOT LN2 weight sensor readings.

    Flow:
    1.  Extract payload (deviceid, timestamp, payload:weight)
    2.  Load DeviceConfig
    3.  Validate sensor reading (ln2_logic.validate_and_convert)
    4.  Insert raw data (always)
    5.  Handle sensor faults (trigger alert, return)
    6.  Transient spike detection — Case B
    6b. Refill detection (ln2_logic.detect_refill) — if not spike
    6c. Weight-event classification (Cases C, canister, product)
    7.  Append to sliding window
    7b. Lid-close candidate tracking (Case C vs D)
    8.  Estimate rate (ln2_logic.estimate_rate, throttled)
    9.  Step state machine (ln2_logic.step_state_machine)
    9b. Precaution advisory (near threshold + lid just opened)
    9c. Low-level refill alert (Step 5)
    10. Persist state to Redis (all counters + candidate)
    11. Insert processed reading
    12. Build quality data + publish to Redis
    13. Check and trigger alerts
    """
    try:
        # 1. Extract payload
        device_code = webhook_payload.get("deviceid") or webhook_payload.get("DeviceId")
        timestamp_str = webhook_payload.get("timestamp")
        weight_kg = float(webhook_payload.get("payload", 0))
        raw_lid_state = webhook_payload.get("lid_state")
        explicit_lid_state = None
        logger.info(
            "CUSTOM_IOT lid_state payload for %s: %r",
            device_code,
            raw_lid_state,
        )
        if raw_lid_state is not None:
            try:
                raw_lid_state = int(raw_lid_state)
            except (TypeError, ValueError):
                raw_lid_state = None
            if raw_lid_state == 2:
                explicit_lid_state = "OPEN"
            elif raw_lid_state == 1:
                explicit_lid_state = "CLOSED"
            elif raw_lid_state == 0:
                explicit_lid_state = None
                logger.warning(
                    f"No Reed Switch Data for lid_state, got '{webhook_payload.get('lid_state')}' for {device_code}"
                )
            else:
                logger.warning(
                    f"Invalid lid_state '{webhook_payload.get('lid_state')}' for {device_code}"
                )
        logger.info(
            "CUSTOM_IOT lid_state resolved for %s: %s",
            device_code,
            explicit_lid_state,
        )
        # Only a reed-switch value of 1 (CLOSED) or 2 (OPEN) makes lid_state
        # eligible for KPI/alerting; missing, 0, or unparsable values fall
        # back to the algorithmic state machine for internal use only.
        lid_state_kpi_eligible = explicit_lid_state is not None

        if not device_code or not timestamp_str:
            logger.warning("Missing required CUSTOM_IOT fields (deviceid or timestamp)")
            return False

        # Handle ISO timestamp with 'Z' suffix
        if timestamp_str.endswith("Z"):
            timestamp_str = timestamp_str[:-1] + "+00:00"
        timestamp = datetime.fromisoformat(timestamp_str)

        # 2. Load DeviceConfig
        cfg = get_ln2_device_config(db_session, device_code)
        if cfg is None:
            logger.warning(f"Device {device_code} not registered - skipping")
            return False

        # 3. Validate sensor reading
        from .ln2_iot.ln2_logic import (
            EVAP_RATE_BUCKET_MINUTES,
            EVAP_RATE_MIN_BUCKETS,
            EVAP_RATE_WINDOW_HOURS,
            LidState,
            WeightEventType,
            check_low_level_alert,
            check_precaution_advisory,
            classify_weight_event,
            compute_smoothed_ln2,
            confirm_lid_close_candidate,
            detect_refill,
            detect_transient_spike,
            estimate_rate_from_buckets,
            step_state_machine,
            validate_and_convert,
        )
        from .ln2_iot import config as ln2_config

        sensor_reading = validate_and_convert(timestamp, weight_kg, cfg)

        # 4. Insert raw data (always)
        insert_ln2_iot_raw_data(
            db_session,
            cfg.tank_id,
            cfg.device_pk,
            weight_kg,
            webhook_payload,
            timestamp,
        )

        # 5. Handle sensor faults
        if sensor_reading.status.value != "OK":
            logger.warning(
                f"Sensor fault {sensor_reading.status.value} for {device_code}"
            )
            quality_data = {
                "device_code": device_code,
                "tank_id": cfg.tank_id,
                "timestamp": timestamp.isoformat(),
                "sensor_status": sensor_reading.status.value,
                "ln2_level_pct": sensor_reading.ln2_level_pct,
            }
            alert_conditions = {
                "sensor_fault": True,
                "excessive_evaporation": False,
                "lid_open_beyond_threshold": False,
            }
            trigger_ln2_alerts(cfg.tank_id, device_code, alert_conditions, quality_data)
            return True

        # Load persisted state (needed by multiple downstream steps)
        state_data = get_ln2_device_state(device_code)
        current_state = LidState(state_data.get("current_state", "UNKNOWN"))
        previous_state = current_state
        open_ctr = state_data.get("open_counter", 0)
        closed_ctr = state_data.get("closed_counter", 0)
        low_level_ctr = state_data.get("low_level_counter", 0)
        lid_candidate_ts = state_data.get("lid_candidate_since")
        refill_active = state_data.get("refill_active", False)
        refill_start_ts = state_data.get("refill_start_ts")
        refill_lid_weight_kg = state_data.get("refill_lid_weight_kg")
        refill_min_raw_kg = state_data.get("refill_min_raw_kg")
        refill_max_raw_kg = state_data.get("refill_max_raw_kg")
        refill_min_smoothed_kg = state_data.get("refill_min_smoothed_kg")
        refill_max_smoothed_kg = state_data.get("refill_max_smoothed_kg")
        refill_last_updated = state_data.get("refill_last_updated")
        refill_event_triggered = False
        refill_amount_kg = None
        refill_amount_l = None
        refill_event_start_ts = None
        refill_event_end_ts = None

        r = get_redis_client()
        last_known_rate_key_h = f"ln2:{device_code}:last_known_rate_kg_per_h"
        last_known_rate_key_d = f"ln2:{device_code}:last_known_rate_kg_per_day"
        last_known_rate_kg_per_h = _parse_optional_float(r.get(last_known_rate_key_h))
        last_known_rate_kg_per_day = _parse_optional_float(r.get(last_known_rate_key_d))

        # 6. Transient spike detection (Case B) — before refill detection
        from datetime import timedelta

        cutoff_ts = timestamp - timedelta(minutes=cfg.window_minutes)
        window_points = get_ln2_window_points(device_code, cutoff_ts)

        spike = detect_transient_spike(
            window_points, timestamp, sensor_reading.ln2_mass_kg, cfg
        )
        refill_detected = False

        if spike:
            logger.info(
                f"[SPIKE IGNORED] {device_code} at {timestamp.isoformat()} — "
                "place-and-remove detected, removing spike points."
            )
            spike_cutoff = timestamp - timedelta(seconds=cfg.spike_max_duration_s)
            remove_ln2_spike_points(device_code, spike_cutoff)
            window_points = get_ln2_window_points(device_code, cutoff_ts)
        else:
            # 6b. Refill detection
            refill_detected = detect_refill(
                window_points, sensor_reading.ln2_mass_kg, cfg
            )

            if refill_detected:
                logger.info(f"[REFILL] detected for {device_code}")
                last_rate_signed = state_data.get("last_rate_kg_per_h")
                last_loss_rate = None
                if last_rate_signed is not None:
                    last_loss_rate = max(0.0, -float(last_rate_signed))
                elif last_known_rate_kg_per_h is not None:
                    last_loss_rate = last_known_rate_kg_per_h

                if last_loss_rate is not None:
                    last_known_rate_kg_per_h = round(last_loss_rate, 8)
                    last_known_rate_kg_per_day = round(last_loss_rate * 24.0, 8)
                    r.set(last_known_rate_key_h, str(last_known_rate_kg_per_h))
                    r.set(last_known_rate_key_d, str(last_known_rate_kg_per_day))
                    r.expire(last_known_rate_key_h, 86400)
                    r.expire(last_known_rate_key_d, 86400)

                clear_ln2_window(device_code)
                clear_ln2_rate_buckets(device_code)
                window_points = []
            else:
                logger.info(
                    "[REFILL] not detected for %s at %s (delta=%s)",
                    device_code,
                    timestamp.isoformat(),
                    sensor_reading.ln2_mass_kg,
                )

        # 6c. Weight-event classification (Cases C, canister, product)
        weight_event = classify_weight_event(
            window_points, sensor_reading.ln2_mass_kg, cfg
        )
        if weight_event.event_type != WeightEventType.NONE:
            logger.info(
                f"[WEIGHT EVENT] {device_code}  type={weight_event.event_type.value}  "
                f"delta={weight_event.delta_kg:.3f} kg  at {timestamp.isoformat()}"
            )

        # 7. Append to window
        append_ln2_window_point(device_code, timestamp, sensor_reading.ln2_mass_kg, cfg)
        window_points = get_ln2_window_points(device_code, cutoff_ts)

        smoothed_mass_kg, smoothed_level_pct, smoothed_volume_l = (
            compute_smoothed_ln2(
                window_points,
                timestamp,
                cfg,
                avg_minutes=LN2_LEVEL_AVG_MINUTES,
            )
        )

        if explicit_lid_state is not None:
            current_state = LidState(explicit_lid_state)
            lid_candidate_ts = None
            if current_state == LidState.OPEN:
                open_ctr = cfg.consecutive_windows_for_state
                closed_ctr = 0
            else:
                closed_ctr = cfg.consecutive_windows_for_state
                open_ctr = 0

        # 7c. Lid-close candidate tracking (Case C vs D)
        if explicit_lid_state is None and weight_event.event_type == WeightEventType.LID_CLOSE_CANDIDATE:
            lid_candidate_ts = timestamp.isoformat()
            logger.info(
                f"[LID CANDIDATE] {device_code} — lid-close candidate started at {lid_candidate_ts} "
                f"(confirming over next {cfg.lid_confirm_stable_points} readings)."
            )

        if explicit_lid_state is None and lid_candidate_ts is not None:
            candidate_dt = datetime.fromisoformat(lid_candidate_ts)
            confirmation = confirm_lid_close_candidate(window_points, candidate_dt, cfg)

            if confirmation is True:
                # Case C confirmed — force CLOSED state immediately
                logger.warning(
                    f"[LID CLOSE CONFIRMED] {device_code} tank {cfg.tank_id} at {timestamp.isoformat()} — "
                    "lid weight band + stable → Lid_Status = CLOSED."
                )
                current_state = LidState.CLOSED
                open_ctr = 0
                closed_ctr = cfg.consecutive_windows_for_state  # saturate
                lid_candidate_ts = None
            elif confirmation is False:
                # Case D — was refill, not lid close
                logger.info(
                    f"[LID CANDIDATE REJECTED] {device_code} — weight still rising, treating as refill."
                )
                lid_candidate_ts = None
            # else: None — not enough data yet, keep waiting

        # 8. Rate estimation (bucketed for daily stability)
        update_ln2_rate_bucket(
            device_code,
            timestamp,
            sensor_reading.ln2_mass_kg,
            bucket_minutes=EVAP_RATE_BUCKET_MINUTES,
            window_hours=EVAP_RATE_WINDOW_HOURS,
        )
        rate_cutoff = timestamp - timedelta(hours=EVAP_RATE_WINDOW_HOURS)
        rate_buckets = get_ln2_rate_buckets(device_code, rate_cutoff)
        rate_estimate = estimate_rate_from_buckets(
            rate_buckets,
            min_points=EVAP_RATE_MIN_BUCKETS,
        )
        effective_rate_kg_per_h = None
        effective_rate_kg_per_day = None
        rate_source = None

        if rate_estimate is not None:
            effective_rate_kg_per_h = rate_estimate.loss_rate_kg_per_h
            effective_rate_kg_per_day = round(effective_rate_kg_per_h * 24.0, 8)
            rate_source = "measured"
        elif last_known_rate_kg_per_h is not None:
            effective_rate_kg_per_h = last_known_rate_kg_per_h
            if last_known_rate_kg_per_day is not None:
                effective_rate_kg_per_day = last_known_rate_kg_per_day
            else:
                effective_rate_kg_per_day = round(last_known_rate_kg_per_h * 24.0, 8)
            rate_source = "carried_forward"
        state_step = None

        # 9. State machine step (delta-based contract) — run on every valid sample
        baseline_mass_kg = (
            sum(mass for _, mass in window_points[:-1]) / len(window_points[:-1])
            if len(window_points) >= 2
            else sensor_reading.ln2_mass_kg
        )
        if explicit_lid_state is None:
            state_step = step_state_machine(
                baseline_mass_kg=baseline_mass_kg,
                new_mass_kg=sensor_reading.ln2_mass_kg,
                current_state=current_state,
                open_counter=open_ctr,
                closed_counter=closed_ctr,
                refill_detected=refill_detected,
                cfg=cfg,
            )
            current_state = state_step.new_state
            open_ctr = state_step.open_counter
            closed_ctr = state_step.closed_counter
        else:
            state_step = SimpleNamespace(
                previous_state=previous_state,
                new_state=current_state,
                state_changed=previous_state != current_state,
                open_counter=open_ctr,
                closed_counter=closed_ctr,
            )

        if state_step.state_changed:
            logger.warning(
                f"[STATE CHANGE] {device_code}: {state_step.previous_state.value} → {state_step.new_state.value}"
            )

            if (
                state_step.previous_state == LidState.CLOSED
                and state_step.new_state == LidState.OPEN
            ):
                logger.info(
                    "[REFILL SESSION START] %s at %s (baseline=%.3f, raw=%.3f)",
                    device_code,
                    timestamp.isoformat(),
                    baseline_mass_kg,
                    sensor_reading.ln2_mass_kg,
                )
                start_state = _start_refill_session(
                    device_code,
                    timestamp,
                    baseline_mass_kg,
                    sensor_reading.ln2_mass_kg,
                    smoothed_mass_kg,
                    cfg,
                )
                refill_active = start_state["refill_active"]
                refill_start_ts = start_state["refill_start_ts"]
                refill_lid_weight_kg = start_state["refill_lid_weight_kg"]
                refill_min_raw_kg = start_state["refill_min_raw_kg"]
                refill_max_raw_kg = start_state["refill_max_raw_kg"]
                refill_min_smoothed_kg = start_state["refill_min_smoothed_kg"]
                refill_max_smoothed_kg = start_state["refill_max_smoothed_kg"]
                refill_last_updated = start_state["refill_last_updated"]

            if (
                state_step.previous_state == LidState.OPEN
                and state_step.new_state == LidState.CLOSED
                and refill_active
            ):
                # Refill session complete, refill details will be sent to backend.
                logger.info(
                    "[REFILL SESSION END] %s at %s (baseline=%.3f, raw=%.3f)",
                    device_code,
                    timestamp.isoformat(),
                    baseline_mass_kg,
                    sensor_reading.ln2_mass_kg,
                )
                close_state = _close_refill_session(
                    device_code,
                    timestamp,
                    baseline_mass_kg,
                    sensor_reading.ln2_mass_kg,
                    refill_active,
                    refill_start_ts,
                    refill_min_smoothed_kg,
                    refill_max_smoothed_kg,
                    cfg,
                    ln2_config.LN2_DENSITY_KG_PER_L,
                )
                refill_active = close_state["refill_active"]
                refill_start_ts = close_state["refill_start_ts"]
                refill_lid_weight_kg = close_state["refill_lid_weight_kg"]
                refill_min_raw_kg = close_state["refill_min_raw_kg"]
                refill_max_raw_kg = close_state["refill_max_raw_kg"]
                refill_min_smoothed_kg = close_state["refill_min_smoothed_kg"]
                refill_max_smoothed_kg = close_state["refill_max_smoothed_kg"]
                refill_last_updated = close_state["refill_last_updated"]
                refill_event_triggered = close_state["refill_event_triggered"]
                refill_amount_kg = close_state["refill_amount_kg"]
                refill_amount_l = close_state["refill_amount_l"]
                refill_event_start_ts = close_state["refill_event_start_ts"]
                refill_event_end_ts = close_state["refill_event_end_ts"]
                refill_lid_weight_kg = close_state["refill_lid_weight_kg_override"]

                if refill_event_triggered:
                    logger.info(
                        "[REFILL EVENT] %s amount=%.3f kg (start=%s end=%s)",
                        device_code,
                        refill_amount_kg or 0.0,
                        refill_event_start_ts,
                        refill_event_end_ts,
                    )
                    send_refill_detection_to_backend(tank_id=cfg.tank_id, refill_data={"refill_weight": refill_amount_kg}, detected_at=refill_event_end_ts)
                else:
                    logger.info(
                        "[REFILL EVENT] not triggered for %s (amount=%s)",
                        device_code,
                        refill_amount_kg,
                    )

                

            # 9b. Precaution advisory (near threshold + lid just opened)
            if state_step.new_state == LidState.OPEN:
                if check_precaution_advisory(
                    smoothed_level_pct, state_step.new_state, cfg
                ):
                    logger.warning(
                        f"[PRECAUTION] {device_code} tank {cfg.tank_id} — lid opened while "
                        f"LN2 level {smoothed_level_pct:.1f}% ≤ precaution threshold "
                        f"{cfg.precaution_level_pct:.1f}%.  Advisory notification recommended."
                    )
                    # TODO: send advisory notification via webhook / Event Hub

        if current_state == LidState.OPEN and refill_active:
            update_state = _update_refill_session(
                device_code,
                timestamp,
                refill_start_ts,
                refill_lid_weight_kg,
                refill_min_raw_kg,
                refill_max_raw_kg,
                refill_min_smoothed_kg,
                refill_max_smoothed_kg,
                REFILL_ANALYSIS_WINDOW_MINUTES,
                smoothed_mass_kg,
                sensor_reading.ln2_mass_kg,
                cfg,
            )
            refill_min_raw_kg = update_state["refill_min_raw_kg"]
            refill_max_raw_kg = update_state["refill_max_raw_kg"]
            refill_min_smoothed_kg = update_state["refill_min_smoothed_kg"]
            refill_max_smoothed_kg = update_state["refill_max_smoothed_kg"]
            refill_last_updated = update_state["refill_last_updated"]
            logger.info(
                "[REFILL SESSION UPDATE] %s min=%.3f max=%.3f smoothed_min=%.3f smoothed_max=%.3f",
                device_code,
                refill_min_raw_kg or 0.0,
                refill_max_raw_kg or 0.0,
                refill_min_smoothed_kg or 0.0,
                refill_max_smoothed_kg or 0.0,
            )

        # 10. Insert reading (include all computed fields) — persist every valid sample
        lid_state_val = current_state.value
        insert_ln2_reading(
            db_session,
            cfg.device_pk,
            cfg.tank_id,
            smoothed_level_pct,
            (effective_rate_kg_per_h if effective_rate_kg_per_h is not None else 0.0),
            timestamp,
            raw_weight_kg=weight_kg,
            ln2_mass_kg=smoothed_mass_kg,
            ln2_volume_l=smoothed_volume_l,
            sensor_status=sensor_reading.status.value,
            lid_state=lid_state_val,
            refill_detected=refill_detected,
            quality_status="Good",
        )

        # 9c. Low-level alert check (Step 5)
        low_level = check_low_level_alert(
            smoothed_mass_kg, low_level_ctr, cfg
        )
        low_level_ctr = low_level.consecutive_count

        low_level_alert_fired = False
        if (
            low_level.alert_triggered
            and low_level.consecutive_count == cfg.low_level_consecutive_readings
        ):
            low_level_alert_fired = True
            logger.warning(
                f"[LOW-LEVEL ALERT] {device_code} tank {cfg.tank_id} — LN2 mass "
                f"{smoothed_mass_kg:.3f} kg ≤ {cfg.low_level_threshold_kg:.3f} kg "
                f"for {low_level.consecutive_count} consecutive readings. Refill needed."
            )
            # TODO: push refill alert to notification system

        # 10b. Persist updated state (all counters + candidate)
        save_ln2_device_state(
            device_code,
            {
                "current_state": current_state.value,
                "open_counter": open_ctr,
                "closed_counter": closed_ctr,
                "last_rate_kg_per_h": rate_estimate.rate_kg_per_h
                if rate_estimate
                else state_data.get("last_rate_kg_per_h"),
                "last_updated": timestamp.isoformat(),
                "low_level_counter": low_level_ctr,
                "lid_candidate_since": lid_candidate_ts,
                "refill_active": refill_active,
                "refill_start_ts": refill_start_ts,
                "refill_lid_weight_kg": refill_lid_weight_kg,
                "refill_min_raw_kg": refill_min_raw_kg,
                "refill_max_raw_kg": refill_max_raw_kg,
                "refill_min_smoothed_kg": refill_min_smoothed_kg,
                "refill_max_smoothed_kg": refill_max_smoothed_kg,
                "refill_last_updated": refill_last_updated,
            },
        )

        # 11. Build quality data
        quality_data = {
            "device_code": device_code,
            "tank_code": cfg.tank_code,
            "tank_id": cfg.tank_id,
            "timestamp": timestamp.isoformat(),
            "raw_weight_kg": weight_kg,
            "ln2_mass_kg": smoothed_mass_kg,
            "ln2_level_pct": smoothed_level_pct,
            "ln2_volume_l": smoothed_volume_l,
            "sensor_status": sensor_reading.status.value,
            #"evaporation_rate_kg_per_h": effective_rate_kg_per_h,
            "evaporation_rate_kg_per_h": cfg.static_evap_kg_per_hour,
            #"evaporation_rate_kg_per_day": effective_rate_kg_per_day,
            "evaporation_rate_kg_per_day": round(cfg.static_evap_kg_per_hour * 24.0, 8),
            "rate_source": rate_source,
            "lid_state": current_state.value,
            "lid_state_kpi_eligible": lid_state_kpi_eligible,
            "refill_detected": refill_detected,
            "refill_event": refill_event_triggered,
            "refill_amount_kg": refill_amount_kg,
            "refill_amount_l": refill_amount_l,
            "refill_start_ts": refill_event_start_ts,
            "refill_end_ts": refill_event_end_ts,
            "refill_active": refill_active,
            "weight_event": weight_event.event_type.value
            if weight_event.event_type != WeightEventType.NONE
            else None,
            "weight_event_delta_kg": weight_event.delta_kg
            if weight_event.event_type != WeightEventType.NONE
            else None,
            "transient_spike_ignored": spike,
            "low_level_alert": low_level_alert_fired,
            "quality_status": "Good",  # TODO: Calculate based on alerts
        }

        kpi_data = KPI_NAMES.convert_custom_iot_payload_to_kpi_names_mapped_array(
            quality_data
        )
        save_kpi_readings(db_session, device_code, kpi_data)

        # 12. Publish to Redis
        publish_ln2_to_redis(device_code, quality_data)

        # 13. Check and trigger alerts
        alert_conditions = check_ln2_alert_conditions(
            rate_estimate,
            state_step,
            sensor_reading,
            cfg,
            state_data.get("last_updated"),
        )
        # Add low-level alert condition
        alert_conditions["low_level_refill"] = low_level_alert_fired
        trigger_ln2_alerts(cfg.tank_id, device_code, alert_conditions, quality_data)

        logger.info(f"✓ Processed CUSTOM_IOT for {device_code}, tank {cfg.tank_id}")
        return True

    except Exception as e:
        logger.error(f"Error processing CUSTOM_IOT LN2: {e}", exc_info=True)
        raise


# ============================================================================
# Helper Functions for Webhook Transformation
# ============================================================================


def convert_shock_g_to_agitation(shock_g: Optional[float]) -> float:
    """Return Shock.G (G-force) value directly as agitation"""
    if shock_g is None:
        return 0.0
    return round(float(shock_g), 1)


def check_threshold(
    parameter_name: str,
    value: float,
    thresholds: Optional[Dict[str, Dict[str, Any]]] = None,
) -> bool:
    """
    Check if a parameter value is within threshold.
    Uses Tive thresholds if provided, otherwise falls back to static defaults.
    """
    # Use provided thresholds (from Tive) or fall back to defaults
    if thresholds and parameter_name in thresholds:
        threshold = thresholds[parameter_name]
    else:
        threshold = PARAMETER_THRESHOLDS.get(parameter_name, {})

    min_val = threshold.get("min")
    max_val = threshold.get("max")

    if min_val is not None and value < min_val:
        return False
    if max_val is not None and value > max_val:
        return False
    return True


def calculate_quality_loss(
    parameters: Dict[str, float],
    thresholds: Dict[str, Dict[str, Any]],
    threshold_violations: Dict[str, bool],
) -> float:
    """
    Calculate quality loss percentage based on threshold violations and deviations.

    Quality loss is calculated as:
    - If all parameters are within threshold: 0% loss
    - For each violated parameter: calculate deviation percentage from threshold
    - Sum the contributions (weighted by parameter importance)
    - Cap at 100%

    Args:
        parameters: Dictionary of parameter values (temperature, humidity, agitation)
        thresholds: Dictionary of threshold configurations with min/max values
        threshold_violations: Dictionary indicating which parameters violated thresholds

    Returns:
        Quality loss percentage (0.0 to 100.0)
    """
    # Parameter weights (temperature is most critical, then humidity, then agitation)
    parameter_weights = {
        "temperature": 0.5,  # 50% weight - most critical
        "humidity": 0.3,  # 30% weight
        "agitation": 0.2,  # 20% weight
    }

    total_loss = 0.0

    for param_name in ["temperature", "humidity", "agitation"]:
        if not threshold_violations.get(param_name, False):
            # Parameter is within threshold, no loss
            continue

        value = parameters.get(param_name)
        if value is None:
            continue

        threshold_config = thresholds.get(param_name, {})
        min_val = threshold_config.get("min")
        max_val = threshold_config.get("max")
        weight = parameter_weights.get(param_name, 0.33)  # Default equal weight

        # Calculate deviation percentage
        deviation_loss = 0.0

        if min_val is not None and value < min_val:
            # Below minimum threshold
            deviation = min_val - value
            if max_val is not None:
                # Both min and max thresholds exist
                threshold_range = max_val - min_val
                if threshold_range > 0:
                    # Loss based on deviation relative to threshold range
                    deviation_loss = min((deviation / threshold_range) * 100, 100)
                else:
                    # Min and max are equal (shouldn't happen, but handle it)
                    deviation_loss = 100.0
            else:
                # Only min threshold exists
                if min_val != 0:
                    deviation_loss = min((deviation / abs(min_val)) * 100, 100)
                else:
                    # Min is 0, use absolute deviation with scaling
                    deviation_loss = min(abs(deviation) * 20, 100)

        elif max_val is not None and value > max_val:
            # Above maximum threshold
            deviation = value - max_val
            if min_val is not None:
                # Both min and max thresholds exist
                threshold_range = max_val - min_val
                if threshold_range > 0:
                    # Loss based on deviation relative to threshold range
                    deviation_loss = min((deviation / threshold_range) * 100, 100)
                else:
                    # Min and max are equal (shouldn't happen, but handle it)
                    deviation_loss = 100.0
            else:
                # Only max threshold exists (e.g., humidity max: 90%)
                if max_val != 0:
                    deviation_loss = min(
                        (deviation / max_val) * 100 * 2, 100
                    )  # 2x multiplier for max-only violations
                else:
                    deviation_loss = 100.0

        # Add weighted contribution to total loss
        total_loss += deviation_loss * weight

    # Cap at 100%
    quality_loss = min(total_loss, 100.0)
    return round(quality_loss, 2)


def score_kpi_status(
    parameter_name: str, value: float, thresholds: Dict[str, Dict[str, Any]]
) -> int:
    """
    Score a single KPI based on magnitude deviation from thresholds.
    Based on Quality Status Logic PDF:
    - Green (0): Within threshold
    - Yellow (1): Minor deviation
    - Red (2): Significant deviation

    Args:
        parameter_name: Name of parameter (temperature, humidity, agitation)
        value: Current parameter value
        thresholds: Dictionary of threshold configurations

    Returns:
        KPI score: 0 (Green), 1 (Yellow), or 2 (Red)
    """
    if parameter_name not in thresholds:
        return 0  # Default to Green if threshold not found

    threshold_config = thresholds[parameter_name]
    min_val = threshold_config.get("min")
    max_val = threshold_config.get("max")

    if min_val is None and max_val is None:
        return 0  # No thresholds defined, assume Green

    # Temperature scoring (2-8°C range)
    if parameter_name == "temperature":
        if min_val is not None and max_val is not None:
            if min_val <= value <= max_val:
                return 0  # Green: Within 2-8°C
            else:
                deviation = min(abs(value - min_val), abs(value - max_val))
                if deviation <= 3.0:
                    return 1  # Yellow: ≤ ±3°C outside range
                else:
                    return 2  # Red: > ±3°C outside range
        elif min_val is not None and value < min_val:
            deviation = min_val - value
            return 1 if deviation <= 3.0 else 2
        elif max_val is not None and value > max_val:
            deviation = value - max_val
            return 1 if deviation <= 3.0 else 2

    # Humidity scoring (20-90% RH)
    elif parameter_name == "humidity":
        if min_val is not None and max_val is not None:
            if min_val <= value <= max_val:
                return 0  # Green: Within 20-90%
            else:
                deviation = min(abs(value - min_val), abs(value - max_val))
                if deviation <= 10.0:
                    return 1  # Yellow: ≤ ±10% outside
                else:
                    return 2  # Red: > ±10% outside
        elif min_val is not None and value < min_val:
            deviation = min_val - value
            return 1 if deviation <= 10.0 else 2
        elif max_val is not None and value > max_val:
            deviation = value - max_val
            return 1 if deviation <= 10.0 else 2

    # Vibration/Agitation scoring (≤1.5 g per PDF)
    elif parameter_name == "agitation":
        # PDF specifies: ≤1.5g = Green, 1.5-2.5g = Yellow, >2.5g = Red
        # Use PDF thresholds regardless of config max_val
        if value <= 1.5:
            return 0  # Green: ≤1.5 g
        elif value <= 2.5:
            return 1  # Yellow: 1.5-2.5 g
        else:
            return 2  # Red: >2.5 g

    # Default: within threshold = Green
    return 0


def calculate_quality_status_from_kpis(kpi_scores: Dict[str, int]) -> tuple:
    """
    Calculate overall quality status and percentage from KPI scores.
    Based on Quality Status Logic PDF:

    Step 1: Each KPI scored (Green=0, Yellow=1, Red=2)
    Step 2: Total_Deviation_Score = sum of all KPI scores
    Step 3: Cumulative_Quality_% = 100 × (1 - Total_Deviation_Score / Max_Possible_Score)
    Step 4: Map % to status:
        - ≥ 85% → Green
        - 60-84% → Yellow
        - < 60% → Red

    Args:
        kpi_scores: Dictionary mapping KPI names to scores (0, 1, or 2)

    Returns:
        Tuple of (status_string, quality_percentage)
        status_string: "Good", "Warning", or "Critical"
        quality_percentage: 0.0 to 100.0
    """
    if not kpi_scores:
        return ("Good", 100.0)

    # Calculate total deviation score
    total_deviation_score = sum(kpi_scores.values())

    # Max possible score = number of KPIs × 2 (since Red = 2)
    num_kpis = len(kpi_scores)
    max_possible_score = num_kpis * 2

    if max_possible_score == 0:
        return ("Good", 100.0)

    # Calculate cumulative quality percentage
    quality_percentage = 100.0 * (1.0 - (total_deviation_score / max_possible_score))
    quality_percentage = max(0.0, min(100.0, quality_percentage))  # Clamp to 0-100

    # Map percentage to status
    if quality_percentage >= 85.0:
        return ("Good", quality_percentage)
    elif quality_percentage >= 60.0:
        return ("Warning", quality_percentage)
    else:
        return ("Critical", quality_percentage)


def extract_thresholds_from_tive_webhook(
    webhook_data: Dict[str, Any],
) -> Optional[Dict[str, Dict[str, Any]]]:
    """
    Extract threshold information from Tive webhook payload.
    Tive webhooks may include Alert Preset information with threshold values.

    Returns thresholds dict or None if not found (will use fallback defaults)
    """
    thresholds = {}

    # Check multiple possible locations for Alert Preset data
    alert_preset = (
        webhook_data.get("AlertPreset")
        or webhook_data.get("alert_preset")
        or webhook_data.get("preset")
        or webhook_data.get("AlertPresetId")
        or webhook_data.get("alertPreset")
    )

    alert_info = (
        webhook_data.get("Alert")
        or webhook_data.get("alert")
        or webhook_data.get("AlertData")
        or webhook_data.get("alertData")
        or {}
    )

    # Check for data nested in different structures
    data_section = webhook_data.get("data") or webhook_data.get("Data") or {}
    if isinstance(data_section, dict):
        alert_preset = (
            alert_preset
            or data_section.get("AlertPreset")
            or data_section.get("alert_preset")
        )
        alert_info = (
            alert_info or data_section.get("Alert") or data_section.get("alert") or {}
        )

    # Extract thresholds from Alert Preset
    if alert_preset:
        if isinstance(alert_preset, dict):
            triggers = (
                alert_preset.get("Triggers")
                or alert_preset.get("triggers")
                or alert_preset.get("Trigger")
                or alert_preset.get("trigger")
                or []
            )

            if not isinstance(triggers, list):
                triggers = [triggers] if triggers else []

            for trigger in triggers:
                if not isinstance(trigger, dict):
                    continue

                trigger_type = (
                    trigger.get("Type")
                    or trigger.get("type")
                    or trigger.get("Parameter")
                    or trigger.get("parameter")
                    or ""
                ).lower()

                min_val = (
                    trigger.get("Min")
                    or trigger.get("min")
                    or trigger.get("Minimum")
                    or trigger.get("minimum")
                )
                max_val = (
                    trigger.get("Max")
                    or trigger.get("max")
                    or trigger.get("Maximum")
                    or trigger.get("maximum")
                )
                unit = trigger.get("Unit") or trigger.get("unit") or ""

                # Try to convert string values to numbers
                try:
                    if isinstance(min_val, str):
                        min_val = (
                            float(min_val)
                            if min_val.lower() not in ["none", "null", ""]
                            else None
                        )
                    if isinstance(max_val, str):
                        max_val = (
                            float(max_val)
                            if max_val.lower() not in ["none", "null", ""]
                            else None
                        )
                except (ValueError, AttributeError):
                    pass

                if "temperature" in trigger_type or "temp" in trigger_type:
                    thresholds["temperature"] = {
                        "min": min_val,
                        "max": max_val,
                        "unit": unit or "°C",
                    }
                elif "humidity" in trigger_type or "humid" in trigger_type:
                    thresholds["humidity"] = {
                        "min": min_val,
                        "max": max_val,
                        "unit": unit or "%",
                    }
                elif (
                    "shock" in trigger_type
                    or "g" in trigger_type
                    or "g-force" in trigger_type
                ):
                    thresholds["agitation"] = {
                        "min": float(min_val) if min_val is not None else None,
                        "max": float(max_val) if max_val is not None else None,
                        "unit": unit or "G",
                    }

    # Also check alert_info for threshold data
    if alert_info and isinstance(alert_info, dict) and not thresholds:
        threshold_breached = (
            alert_info.get("Threshold")
            or alert_info.get("threshold")
            or alert_info.get("Thresholds")
            or alert_info.get("thresholds")
        )

        if threshold_breached:
            if isinstance(threshold_breached, dict):
                param_name = (
                    threshold_breached.get("Parameter")
                    or threshold_breached.get("parameter")
                    or threshold_breached.get("Type")
                    or threshold_breached.get("type")
                    or ""
                ).lower()

                min_val = (
                    threshold_breached.get("Min")
                    or threshold_breached.get("min")
                    or threshold_breached.get("Minimum")
                )
                max_val = (
                    threshold_breached.get("Max")
                    or threshold_breached.get("max")
                    or threshold_breached.get("Maximum")
                )
                unit = (
                    threshold_breached.get("Unit")
                    or threshold_breached.get("unit")
                    or ""
                )

                if "temperature" in param_name:
                    thresholds["temperature"] = {
                        "min": min_val,
                        "max": max_val,
                        "unit": unit or "°C",
                    }
                elif "humidity" in param_name:
                    thresholds["humidity"] = {
                        "min": min_val,
                        "max": max_val,
                        "unit": unit or "%",
                    }
                elif "shock" in param_name or "g" in param_name:
                    thresholds["agitation"] = {
                        "min": float(min_val) if min_val is not None else None,
                        "max": float(max_val) if max_val is not None else None,
                        "unit": unit or "G",
                    }

    # Check for conditions/measurements that might have threshold info
    conditions = webhook_data.get("conditions") or webhook_data.get("Conditions") or {}
    if isinstance(conditions, dict) and not thresholds:
        temp_range = conditions.get("temperature_range") or conditions.get(
            "TemperatureRange"
        )
        humidity_range = conditions.get("humidity_range") or conditions.get(
            "HumidityRange"
        )

        if temp_range and isinstance(temp_range, dict):
            thresholds["temperature"] = {
                "min": temp_range.get("min") or temp_range.get("Min"),
                "max": temp_range.get("max") or temp_range.get("Max"),
                "unit": "°C",
            }
        if humidity_range and isinstance(humidity_range, dict):
            thresholds["humidity"] = {
                "min": humidity_range.get("min") or humidity_range.get("Min"),
                "max": humidity_range.get("max") or humidity_range.get("Max"),
                "unit": "%",
            }

    if thresholds:
        logger.info(
            f"Successfully extracted thresholds from Tive: {json.dumps(thresholds, indent=2)}"
        )
        return thresholds
    else:
        logger.info("No thresholds found in Tive webhook, will use static defaults")
        return None


def discover_fk_columns(db_session) -> Optional[Dict[str, str]]:
    """
    Discover the actual foreign key column names by querying the database schema.
    Returns a dict with keys: 'therapy_to_shipment_leg', 'shipment_leg_to_shipment', 'shipment_to_patient'
    Uses module-level cache to avoid repeated schema queries.
    """
    global _FK_COLUMNS_CACHE

    # Return cached value if available
    if _FK_COLUMNS_CACHE is not None:
        return _FK_COLUMNS_CACHE

    try:
        # Query to find foreign key relationships using information_schema
        fk_query = text("""
            SELECT
                tc.table_name,
                kcu.column_name,
                ccu.table_name AS foreign_table_name,
                ccu.column_name AS foreign_column_name
            FROM information_schema.table_constraints AS tc
            JOIN information_schema.key_column_usage AS kcu
                ON tc.constraint_name = kcu.constraint_name
                AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage AS ccu
                ON ccu.constraint_name = tc.constraint_name
                AND ccu.table_schema = tc.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY'
                AND tc.table_schema = 'public'
                AND (
                    (tc.table_name = 'therapy' AND ccu.table_name = 'shipment_leg')
                    OR (tc.table_name = 'shipment_leg' AND ccu.table_name = 'shipment')
                    OR (tc.table_name = 'shipment' AND ccu.table_name = 'patient')
                )
            ORDER BY tc.table_name, kcu.column_name
        """)

        result = db_session.execute(fk_query)
        rows = result.fetchall()

        fk_columns = {}
        for row in rows:
            table_name, column_name, foreign_table, foreign_column = row

            if table_name == "therapy" and foreign_table == "shipment_leg":
                fk_columns["therapy_to_shipment_leg"] = column_name
            elif table_name == "shipment_leg" and foreign_table == "shipment":
                fk_columns["shipment_leg_to_shipment"] = column_name
            elif table_name == "shipment" and foreign_table == "patient":
                fk_columns["shipment_to_patient"] = column_name

        if len(fk_columns) == 3:
            logger.info(f"Discovered FK columns: {fk_columns}")
            # Cache the discovered columns
            _FK_COLUMNS_CACHE = fk_columns
            return fk_columns
        else:
            logger.warning(f"Could not discover all FK columns. Found: {fk_columns}")
            return None

    except Exception as e:
        logger.warning(f"Error discovering FK columns from schema: {e}")
        return None


def get_thresholds_from_therapy_table(
    patient_id: str,
) -> Optional[Dict[str, Dict[str, Any]]]:
    """
    Fetch threshold values from therapy table for a given patient.
    Returns thresholds dict in the same format as PARAMETER_THRESHOLDS, or None if not found.

    Table relationships:
    - therapy -> shipment_leg (therapy has FK to shipment_leg)
    - shipment_leg -> shipment (shipment_leg has FK to shipment)
    - shipment -> patient (shipment has FK to patient)

    Expected therapy table columns:
    - temperature_min, temperature_max (numeric, nullable)
    - humidity_min, humidity_max (numeric, nullable)
    - agitation_min, agitation_max (numeric, nullable)
    """
    SessionLocal = get_session()
    db = SessionLocal()
    try:
        # First, discover the actual FK column names from the database schema
        fk_columns = discover_fk_columns(db)

        if not fk_columns:
            logger.error(
                "Could not discover foreign key column names from database schema"
            )
            return None

        therapy_fk = fk_columns["therapy_to_shipment_leg"]
        shipment_leg_fk = fk_columns["shipment_leg_to_shipment"]
        shipment_fk = fk_columns["shipment_to_patient"]

        # Now use the discovered column names in a single query
        query_str = f"""
            SELECT
                t.temperature_min, t.temperature_max,
                t.humidity_min, t.humidity_max,
                t.agitation_min, t.agitation_max
            FROM therapy t
            INNER JOIN shipment_leg sl ON t.{therapy_fk} = sl.id
            INNER JOIN shipment s ON sl.{shipment_leg_fk} = s.id
            WHERE s.{shipment_fk} = :patient_id
            ORDER BY t.id DESC
            LIMIT 1
        """

        query = text(query_str)
        result = db.execute(query, {"patient_id": patient_id})
        row = result.fetchone()

        if row is None:
            logger.info(
                f"No therapy record found for patient {patient_id} through shipment_leg and shipment joins"
            )
            return None

        # Process the row data
        thresholds = {}

        # Map database columns to threshold format
        # temperature_min, temperature_max
        if row[0] is not None or row[1] is not None:
            thresholds["temperature"] = {
                "min": float(row[0]) if row[0] is not None else None,
                "max": float(row[1]) if row[1] is not None else None,
                "unit": "°C",
            }

        # humidity_min, humidity_max
        if row[2] is not None or row[3] is not None:
            thresholds["humidity"] = {
                "min": float(row[2]) if row[2] is not None else None,
                "max": float(row[3]) if row[3] is not None else None,
                "unit": "%",
            }

        # agitation_min, agitation_max
        if row[4] is not None or row[5] is not None:
            thresholds["agitation"] = {
                "min": float(row[4]) if row[4] is not None else None,
                "max": float(row[5]) if row[5] is not None else None,
                "unit": "G",
            }

        if thresholds:
            logger.info(
                f"✓ Fetched thresholds from therapy table for patient {patient_id}: {json.dumps(thresholds, indent=2)}"
            )
            return thresholds
        else:
            logger.info(
                f"No threshold values found in therapy table for patient {patient_id}"
            )
            return None

    except Exception as e:
        logger.error(
            f"Error fetching thresholds from therapy table for patient {patient_id}: {e}",
            exc_info=True,
        )
        return None
    finally:
        db.close()


def get_patient_ids() -> List[str]:
    """
    Get patient IDs from database (cached for performance).
    Uses singleton pattern to cache across Azure Function invocations.

    Returns:
        List of patient IDs
    """
    global _patient_ids_cache
    if _patient_ids_cache is None:
        SessionLocal = get_session()
        db = SessionLocal()
        try:
            result = db.execute(text("SELECT id FROM patient"))
            _patient_ids_cache = [str(row[0]) for row in result]
            logger.info(f"✓ Loaded {len(_patient_ids_cache)} patient IDs from database")
        except Exception as e:
            logger.error(f"Error fetching patients from database: {e}")
            _patient_ids_cache = []
        finally:
            db.close()
    return _patient_ids_cache


def insert_telemetry_data(
    db_session, shipment_id: str, data: Dict[str, Any]
) -> Optional[int]:
    """
    Insert telemetry data into the telemetry_data table.
    Also inserts into quality_log and geolocation tables.

    Args:
        db_session: Database session
        shipment_id: Shipment ID from webhook
        data: Quality data dictionary containing all telemetry information

    Returns:
        telemetry_data_id if successful, None otherwise
    """
    try:
        # Ensure table exists before inserting (safety check)
        try:
            ensure_telemetry_table_exists()
        except Exception as e:
            logger.warning(
                f"Failed to ensure telemetry_data table exists: {e}, continuing anyway..."
            )

        # Use timestamp from data if available, otherwise use current time
        created_at = data.get("timestamp")
        if created_at:
            try:
                if isinstance(created_at, str):
                    dt = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
                    created_at = dt
            except:
                created_at = datetime.now()
        else:
            created_at = datetime.now()

        # Insert into telemetry_data table
        insert_query = text("""
            INSERT INTO telemetry_data
            (shipment_id, telemetry_data, created_at)
            VALUES (:shipment_id, :telemetry_data, :created_at)
            RETURNING id
        """).bindparams(bindparam("telemetry_data", type_=JSONB))

        result = db_session.execute(
            insert_query,
            {
                "shipment_id": shipment_id,
                "telemetry_data": data,
                "created_at": created_at,
            },
        )

        telemetry_data_id = result.scalar()

        logger.info(
            f"✓ Inserted telemetry data for shipment {shipment_id} (id={telemetry_data_id})"
        )

        # Insert into quality_log table (non-critical - log errors but continue)
        # Use savepoint to prevent transaction abort if this fails
        try:
            savepoint = db_session.begin_nested()
            try:
                insert_quality_log(
                    db_session, telemetry_data_id, shipment_id, data, created_at
                )
                savepoint.commit()
            except Exception as e:
                savepoint.rollback()
                logger.error(f"Error inserting into quality_log (non-critical): {e}")
        except Exception as e:
            logger.error(
                f"Error creating savepoint for quality_log (non-critical): {e}"
            )

        # Insert into geolocation table (non-critical - log errors but continue)
        # Use savepoint to prevent transaction abort if this fails
        try:
            savepoint = db_session.begin_nested()
            try:
                insert_geolocation(
                    db_session, telemetry_data_id, shipment_id, data, created_at
                )
                savepoint.commit()
            except Exception as e:
                savepoint.rollback()
                logger.error(f"Error inserting into geolocation (non-critical): {e}")
        except Exception as e:
            logger.error(
                f"Error creating savepoint for geolocation (non-critical): {e}"
            )

        return telemetry_data_id

    except Exception as e:
        logger.error(
            f"Error inserting telemetry data for shipment {shipment_id}: {e}",
            exc_info=True,
        )
        raise


def insert_quality_log(
    db_session,
    telemetry_data_id: int,
    shipment_id: str,
    data: Dict[str, Any],
    created_at: datetime,
) -> bool:
    """Insert data into quality_log table."""
    try:
        # Get shipment_leg_id from shipment_id (simplified - may return None)
        shipment_leg_id = None
        try:
            # Try to get shipment_leg_id if shipment_id is numeric
            if shipment_id and shipment_id.isdigit():
                query = text(
                    "SELECT id FROM shipment_leg WHERE shipment_id = :shipment_id LIMIT 1"
                )
                result = db_session.execute(query, {"shipment_id": int(shipment_id)})
                row = result.fetchone()
                if row:
                    shipment_leg_id = row[0]
        except Exception:
            pass  # Non-critical - continue without shipment_leg_id

        # Extract temperature from nested structure (Temperature.Celsius or Temperature.Fahrenheit)
        temperature = None
        if "Temperature" in data and isinstance(data["Temperature"], dict):
            temperature = data["Temperature"].get("Celsius") or data["Temperature"].get(
                "Fahrenheit"
            )
        elif "temperature" in data:
            temperature = data["temperature"]
        # Default to 0.0 if still None (required NOT NULL field)
        if temperature is None:
            temperature = 0.0

        # Extract humidity from nested structure (Humidity.Percentage)
        humidity = None
        if "Humidity" in data and isinstance(data["Humidity"], dict):
            humidity = data["Humidity"].get("Percentage")
        elif "humidity" in data:
            humidity = data["humidity"]
        # Default to 0.0 if still None (required NOT NULL field)
        if humidity is None:
            humidity = 0.0

        # Extract agitation (from Accelerometer.G or Shock.G)
        agitation = None
        if "Accelerometer" in data and isinstance(data["Accelerometer"], dict):
            agitation = data["Accelerometer"].get("G")
        elif "Shock" in data and isinstance(data["Shock"], dict):
            agitation = data["Shock"].get("G")
        elif "agitation" in data:
            agitation = data["agitation"]
        # Default to 0.0 if still None (required NOT NULL field)
        if agitation is None:
            agitation = 0.0

        threshold_violations = data.get("threshold_violations", {})
        is_temp_loss = threshold_violations.get("temperature", False)
        is_humidity_loss = threshold_violations.get("humidity", False)
        is_agitation_loss = threshold_violations.get("agitation", False)

        insert_query = text("""
            INSERT INTO quality_log
            (telemetry_data_id, patient_id, shipment_leg_id, temperature, humidity, agitation,
             quality_loss, is_temp_loss, is_humidity_loss, is_agitation_loss, reading_timestamp,
             created_at, updated_at)
            VALUES (:telemetry_data_id, :patient_id, :shipment_leg_id, :temperature, :humidity, :agitation,
                    :quality_loss, :is_temp_loss, :is_humidity_loss, :is_agitation_loss, :reading_timestamp,
                    :created_at, :updated_at)
        """)

        db_session.execute(
            insert_query,
            {
                "telemetry_data_id": telemetry_data_id,
                "patient_id": data.get("patient_id"),
                "shipment_leg_id": shipment_leg_id,
                "temperature": temperature,
                "humidity": humidity,
                "agitation": agitation,
                "quality_loss": data.get("quality_loss", 0.0),
                "is_temp_loss": is_temp_loss,
                "is_humidity_loss": is_humidity_loss,
                "is_agitation_loss": is_agitation_loss,
                "reading_timestamp": created_at,
                "created_at": created_at,
                "updated_at": created_at,
            },
        )

        return True
    except Exception as e:
        logger.error(f"Error inserting into quality_log: {e}")
        raise


def insert_geolocation(
    db_session,
    telemetry_data_id: int,
    shipment_id: str,
    data: Dict[str, Any],
    created_at: datetime,
) -> bool:
    """Insert data into geolocation table."""
    try:
        ship_from = (
            data.get("ship_from", {})
            if isinstance(data.get("ship_from", {}), dict)
            else {}
        )
        ship_to = (
            data.get("ship_to", {}) if isinstance(data.get("ship_to", {}), dict) else {}
        )

        # Extract latitude/longitude - provide defaults if None (columns are NOT NULL)
        # Use 0.0 as default if location data is missing
        latitude = data.get("latitude")
        longitude = data.get("longitude")

        # If latitude/longitude are None, use 0.0 as default (required by NOT NULL constraint)
        if latitude is None:
            latitude = 0.0
            logger.warning(
                f"Missing latitude for shipment {shipment_id}, using default 0.0"
            )
        if longitude is None:
            longitude = 0.0
            logger.warning(
                f"Missing longitude for shipment {shipment_id}, using default 0.0"
            )

        insert_query = text("""
            INSERT INTO geolocation
            (shipment_id, patient_id, telemetry_data_id,
             current_latitude, current_longitude,
             shipment_from_latitude, shipment_from_longitude,
             shipment_to_latitude, shipment_to_longitude,
             reading_timestamp, created_at, updated_at)
            VALUES (:shipment_id, :patient_id, :telemetry_data_id,
                    :current_latitude, :current_longitude,
                    :shipment_from_latitude, :shipment_from_longitude,
                    :shipment_to_latitude, :shipment_to_longitude,
                    :reading_timestamp, :created_at, :updated_at)
        """)

        db_session.execute(
            insert_query,
            {
                "shipment_id": shipment_id,
                "telemetry_data_id": telemetry_data_id,
                "patient_id": data.get("patient_id"),
                "current_latitude": latitude,
                "current_longitude": longitude,
                "shipment_from_latitude": ship_from.get("latitude"),
                "shipment_from_longitude": ship_from.get("longitude"),
                "shipment_to_latitude": ship_to.get("latitude"),
                "shipment_to_longitude": ship_to.get("longitude"),
                "reading_timestamp": created_at,
                "created_at": created_at,
                "updated_at": created_at,
            },
        )

        return True
    except Exception as e:
        logger.error(f"Error inserting into geolocation: {e}")
        raise


def publish_to_redis(
    channel: str, data: Dict[str, Any], history_key: Optional[str] = None
) -> bool:
    """
    Publish data to Redis channel and optionally store in history list.

    Args:
        channel: Redis channel name
        data: Data dictionary to publish
        history_key: Optional Redis list key for history storage

    Returns:
        True if successful, False otherwise (non-critical - logs error but doesn't raise)
    """
    try:
        r = get_redis_client()
        data_json = json.dumps(data)

        # Publish to channel
        r.publish(channel, data_json)
        logger.info(f"✓ Published to Redis channel '{channel}'")

        # Store in history list if provided
        if history_key:
            r.lpush(history_key, data_json)
            r.ltrim(history_key, 0, 9)  # Keep last 10 messages
            logger.info(f"✓ Stored in Redis list '{history_key}'")

        return True
    except Exception as e:
        logger.error(f"Error publishing to Redis (non-critical): {e}")
        return False  # Non-critical - don't fail entire processing


def insert_ivf_telemetry_data(db_session, tank_id: int, data: Dict[str, Any]) -> bool:
    """
    Insert IVF telemetry data into the ivf_telemetry_data table.
    Also inserts into ivf_quality_log and ivf_geolocation tables.
    Email notifications are triggered automatically from insert_ivf_quality_log if violations are detected.
    Critical alert records are created automatically after successful commit.

    Args:
        db_session: Database session
        tank_id: Tank ID for tank-level monitoring
        data: Telemetry data dictionary

    Returns:
        True if successful, False otherwise
    """
    try:
        # Use timestamp from data if available, otherwise use current time
        created_at = data.get("timestamp")
        if created_at:
            try:
                if isinstance(created_at, str):
                    dt = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
                    created_at = dt
            except:
                created_at = datetime.now()
        else:
            created_at = datetime.now()

        # Prefer webhook device_id; if missing, fallback to tank's mapped Tive device id
        webhook_device_id = data.get("device_id")
        if not webhook_device_id:
            try:
                tank_device_row = db_session.execute(
                    text("SELECT tive_device_id FROM tanks WHERE tank_id = :tank_id"),
                    {"tank_id": tank_id},
                ).fetchone()
                webhook_device_id = tank_device_row[0] if tank_device_row else None
            except Exception:
                pass  # Best-effort only; don't block telemetry insert

        # Insert into ivf_telemetry_data table
        insert_query = text("""
            INSERT INTO ivf_telemetry_data
            (tank_id, device_id, telemetry_data, created_at)
            VALUES (:tank_id, :device_id, :telemetry_data, :created_at)
            RETURNING id
        """).bindparams(bindparam("telemetry_data", type_=JSONB))

        result = db_session.execute(
            insert_query,
            {
                "tank_id": tank_id,
                "device_id": webhook_device_id,
                "telemetry_data": data,
                "created_at": created_at,
            },
        )

        # Get the inserted ivf_telemetry_data.id
        ivf_telemetry_data_id = result.scalar()

        logger.info(
            f"✓ Inserted IVF telemetry data for tank {tank_id} (id={ivf_telemetry_data_id})"
        )

        # Determine whether this payload contains red/yellow violations
        quality_status = data.get("quality_status", "Good")
        kpi_statuses = data.get("kpi_statuses", {})
        has_violations = quality_status in ["Warning", "Critical"] or any(
            status in ["Warning", "Critical"] for status in kpi_statuses.values()
        )

        # Insert into ivf_quality_log table (includes automatic alert email trigger)
        try:
            insert_ivf_quality_log(
                db_session, ivf_telemetry_data_id, tank_id, data, created_at
            )
        except Exception as e:
            logger.error(f"Error inserting into ivf_quality_log: {e}", exc_info=True)
            raise

        # Insert into ivf_geolocation table
        try:
            insert_ivf_geolocation(
                db_session, ivf_telemetry_data_id, tank_id, data, created_at
            )
        except Exception as e:
            logger.error(f"Error inserting into ivf_geolocation: {e}", exc_info=True)
            raise

        # Auto-create/update critical alert records after commit (non-blocking)
        if has_violations:
            try:
                alerts = check_and_create_alerts(
                    tank_id=tank_id, branch_id=None, send_notifications=False
                )
                logger.info(
                    f"✓ Auto critical alert check completed for tank {tank_id} (alerts created/updated: {len(alerts)})"
                )
            except Exception as e:
                logger.error(
                    f"Error auto-creating critical alerts for tank {tank_id} (non-critical): {e}"
                )
                # Don't fail - non-critical operation

        return True

    except Exception as e:
        logger.error(
            f"Error inserting IVF telemetry data for tank {tank_id}: {e}", exc_info=True
        )
        raise


def insert_ivf_quality_log(
    db_session,
    ivf_telemetry_data_id: int,
    tank_id: int,
    data: Dict[str, Any],
    created_at: datetime,
) -> bool:
    """
    Insert data into ivf_quality_log table ONLY when there are red/yellow deviations.
    Automatically triggers alert email API when violations are detected.

    Only inserts if:
    - quality_status is "Warning" (yellow) or "Critical" (red)
    - OR any KPI status is "Warning" (yellow) or "Critical" (red)

    Skips insertion when all KPIs are "Good" (green) - normal readings are not stored here.
    """
    try:
        # Get quality loss, quality status, and KPI statuses
        quality_loss = data.get("quality_loss", 0.0) or 0.0
        quality_status = data.get("quality_status", "Good")
        kpi_statuses = data.get("kpi_statuses", {})

        # Only insert when there are red/yellow deviations
        has_violations = quality_status in ["Warning", "Critical"] or any(
            status in ["Warning", "Critical"] for status in kpi_statuses.values()
        )

        # Only insert if there are violations (red/yellow deviations)
        if not has_violations:
            logger.info(
                f"Skipping ivf_quality_log insert - no violations detected (quality_status={quality_status})"
            )
            return True  # Return True to indicate success (we intentionally skipped)

        # Calculate loss flags from kpi_statuses
        # Note: humidity is not monitored for IVF, so no is_humidity_loss column exists
        is_temp_internal_loss = kpi_statuses.get("temp_internal", "Good") in [
            "Warning",
            "Critical",
        ]
        is_temp_external_loss = kpi_statuses.get("temp_external", "Good") in [
            "Warning",
            "Critical",
        ]
        is_shock_loss = kpi_statuses.get("shock", "Good") in ["Warning", "Critical"]

        # Build insert query - using exact columns from existing table schema
        # Note: humidity and is_humidity_loss columns do NOT exist in ivf_quality_log table
        insert_query = text("""
            INSERT INTO ivf_quality_log
            (telemetry_data_id, tank_id, device_id, temperature_internal, temperature_external, shock,
             quality_loss, is_temp_internal_loss, is_temp_external_loss, is_shock_loss, reading_timestamp, created_at)
            VALUES (:telemetry_data_id, :tank_id, :device_id, :temperature_internal, :temperature_external, :shock,
                    :quality_loss, :is_temp_internal_loss, :is_temp_external_loss, :is_shock_loss, :reading_timestamp, :created_at)
        """)

        # Prefer webhook device_id; if missing, fallback to tank's mapped tracker id
        webhook_device_id = data.get("device_id")
        if not webhook_device_id:
            try:
                tank_device_row = db_session.execute(
                    text("SELECT tive_device_id FROM tanks WHERE tank_id = :tank_id"),
                    {"tank_id": tank_id},
                ).fetchone()
                webhook_device_id = tank_device_row[0] if tank_device_row else None
            except Exception:
                pass

        db_session.execute(
            insert_query,
            {
                "telemetry_data_id": ivf_telemetry_data_id,
                "tank_id": tank_id,
                "device_id": webhook_device_id,
                "temperature_internal": data.get("temp_internal"),
                "temperature_external": data.get("temp_external"),
                "shock": data.get("shock"),
                "quality_loss": quality_loss,
                "is_temp_internal_loss": is_temp_internal_loss,
                "is_temp_external_loss": is_temp_external_loss,
                "is_shock_loss": is_shock_loss,
                "reading_timestamp": created_at,
                "created_at": created_at,
            },
        )

        logger.info(
            f"✓ Inserted into ivf_quality_log table (telemetry_data_id={ivf_telemetry_data_id}, tank_id={tank_id}, quality_loss={quality_loss})"
        )

        # Trigger immediate alert email notification (IVF only) - AUTOMATIC TRIGGER
        # This sends emails to branch users if occurrence < 3, or managers if >= 3
        # Same behavior as Publisher 7.py, but uses HTTP API instead of direct service call
        try:
            quality_log_data = {
                "is_temp_internal_loss": is_temp_internal_loss,
                "is_temp_external_loss": is_temp_external_loss,
                "is_shock_loss": is_shock_loss,
                "quality_loss": quality_loss,
                "kpi_statuses": kpi_statuses,
                "temp_internal": data.get("temp_internal"),
                "temp_external": data.get("temp_external"),
                "shock": data.get("shock"),
            }

            # Call external API (non-critical - log errors but don't fail)
            trigger_immediate_alert_email(
                tank_id=tank_id,
                quality_log_data=quality_log_data,
                occurred_at=created_at,
            )
            logger.info(f"✓ Triggered immediate alert email check for tank {tank_id}")
        except Exception as e:
            logger.error(
                f"Error triggering immediate alert email for tank {tank_id} (non-critical): {e}"
            )
            # Don't fail the insert if email trigger fails

        return True

    except Exception as e:
        logger.error(f"Error inserting into ivf_quality_log table: {e}", exc_info=True)
        raise


def insert_ivf_geolocation(
    db_session,
    ivf_telemetry_data_id: int,
    tank_id: int,
    data: Dict[str, Any],
    created_at: datetime,
) -> bool:
    """Insert data into ivf_geolocation table"""
    try:
        # Extract location data
        ship_from = (
            data.get("ship_from", {})
            if isinstance(data.get("ship_from", {}), dict)
            else {}
        )
        ship_to = (
            data.get("ship_to", {}) if isinstance(data.get("ship_to", {}), dict) else {}
        )

        # Extract latitude/longitude - provide defaults if None (columns are NOT NULL)
        # Use 0.0 as default if location data is missing
        latitude = data.get("latitude")
        longitude = data.get("longitude")

        # If latitude/longitude are None, use 0.0 as default (required by NOT NULL constraint)
        if latitude is None:
            latitude = 0.0
            logger.warning(f"Missing latitude for tank {tank_id}, using default 0.0")
        if longitude is None:
            longitude = 0.0
            logger.warning(f"Missing longitude for tank {tank_id}, using default 0.0")

        # Build insert query
        insert_query = text("""
            INSERT INTO ivf_geolocation
            (tank_id, ivf_telemetry_data_id, shipment_id, current_latitude, current_longitude,
             shipment_from_latitude, shipment_from_longitude,
             shipment_to_latitude, shipment_to_longitude, reading_timestamp, created_at)
            VALUES (:tank_id, :ivf_telemetry_data_id, :shipment_id, :latitude, :longitude,
                    :ship_from_latitude, :ship_from_longitude,
                    :ship_to_latitude, :ship_to_longitude, :reading_timestamp, :created_at)
        """)

        db_session.execute(
            insert_query,
            {
                "tank_id": tank_id,
                "ivf_telemetry_data_id": ivf_telemetry_data_id,
                "shipment_id": data.get("shipment_id"),
                "latitude": latitude,
                "longitude": longitude,
                "ship_from_latitude": ship_from.get("latitude"),
                "ship_from_longitude": ship_from.get("longitude"),
                "ship_to_latitude": ship_to.get("latitude"),
                "ship_to_longitude": ship_to.get("longitude"),
                "reading_timestamp": created_at,
                "created_at": created_at,
            },
        )

        logger.info(
            f"✓ Inserted into ivf_geolocation table (telemetry_data_id={ivf_telemetry_data_id}, tank_id={tank_id})"
        )
        return True

    except Exception as e:
        logger.error(f"Error inserting into ivf_geolocation table: {e}", exc_info=True)
        raise


def transform_webhook_to_quality_data(
    webhook_response: Dict[str, Any], patient_id: str
) -> Dict[str, Any]:
    """Transform webhook response data to quality data format - matches Publisher 7.py format"""
    webhook_data = webhook_response.get("webhook_data", webhook_response)

    # Handle case where webhook_data has raw_body that needs parsing
    if isinstance(webhook_data, dict) and "raw_body" in webhook_data:
        raw_body = webhook_data.get("raw_body", "")
        if raw_body:
            try:
                parsed_data = json.loads(raw_body)
                if isinstance(parsed_data, dict):
                    webhook_data = parsed_data
                elif isinstance(parsed_data, dict) and "webhook_data" in parsed_data:
                    webhook_data = parsed_data["webhook_data"]
            except (json.JSONDecodeError, TypeError):
                pass

    # Extract thresholds from Tive webhook (if available)
    try:
        tive_thresholds = extract_thresholds_from_tive_webhook(webhook_data)
        if tive_thresholds:
            logger.info(
                f"✓ Using thresholds from Tive webhook: {json.dumps(tive_thresholds, indent=2)}"
            )
        else:
            logger.warning(
                "⚠ No thresholds found in Tive webhook, using fallback static thresholds"
            )
            logger.info(
                f"Webhook keys available: {list(webhook_data.keys()) if isinstance(webhook_data, dict) else 'Not a dict'}"
            )
    except Exception as e:
        logger.error(
            f"Error extracting Tive thresholds, using fallback: {e}", exc_info=True
        )
        tive_thresholds = None

    # Extract temperature
    temperature_celsius = None
    temperature_fahrenheit = None
    if "Temperature" in webhook_data and webhook_data["Temperature"]:
        temp_obj = webhook_data["Temperature"]
        temperature_celsius = temp_obj.get("Celsius")
        temperature_fahrenheit = temp_obj.get("Fahrenheit")

    # Extract humidity
    humidity = None
    if "Humidity" in webhook_data and webhook_data["Humidity"]:
        humidity = webhook_data["Humidity"].get("Percentage")

    # Extract Shock.G and convert to agitation
    shock_g = None
    if "Shock" in webhook_data and webhook_data["Shock"]:
        shock_g = webhook_data["Shock"].get("G")

    agitation = convert_shock_g_to_agitation(shock_g)

    # Extract location (latitude and longitude) - current device location
    latitude = None
    longitude = None
    if "Location" in webhook_data and webhook_data["Location"]:
        location_obj = webhook_data["Location"]
        latitude = location_obj.get("Latitude")
        longitude = location_obj.get("Longitude")

    # Extract ShipFrom location (origin/shipping from location)
    ship_from_latitude = None
    ship_from_longitude = None
    ship_from_address = None
    ship_from_formatted_address = None

    # Extract ShipTo location (destination/shipping to location)
    ship_to_latitude = None
    ship_to_longitude = None
    ship_to_address = None
    ship_to_formatted_address = None

    # Extract shipment_id and location data from webhook
    shipment_id = None
    if "ShipmentId" in webhook_data:
        shipment_id = webhook_data.get("ShipmentId")

    # Always check Shipment object for location data (even if ShipmentId exists at top level)
    if "Shipment" in webhook_data:
        shipment_obj = webhook_data.get("Shipment")

        if shipment_obj is not None and isinstance(shipment_obj, dict):
            # Use Shipment.Id if shipment_id wasn't already set
            if not shipment_id:
                shipment_id = shipment_obj.get("Id")

            # Extract ShipFrom location - check if key exists and is not None
            if "ShipFrom" in shipment_obj and shipment_obj.get("ShipFrom") is not None:
                ship_from_obj = shipment_obj["ShipFrom"]
                if isinstance(ship_from_obj, dict):
                    ship_from_latitude = ship_from_obj.get("Latitude")
                    ship_from_longitude = ship_from_obj.get("Longitude")
                    ship_from_formatted_address = ship_from_obj.get("FormattedAddress")
                    logger.info(
                        f"✓ Extracted ShipFrom: lat={ship_from_latitude}, lon={ship_from_longitude}, address={ship_from_formatted_address}"
                    )
                    if (
                        "Address" in ship_from_obj
                        and ship_from_obj.get("Address") is not None
                    ):
                        address_obj = ship_from_obj["Address"]
                        if isinstance(address_obj, dict):
                            ship_from_address = {
                                "street": address_obj.get("Street"),
                                "sublocality": address_obj.get("Sublocality"),
                                "locality": address_obj.get("Locality"),
                                "state": address_obj.get("State"),
                                "country": address_obj.get("Country"),
                                "zip_code": address_obj.get("ZipCode"),
                            }

            # Extract ShipTo location - check if key exists and is not None
            if "ShipTo" in shipment_obj and shipment_obj.get("ShipTo") is not None:
                ship_to_obj = shipment_obj["ShipTo"]
                if isinstance(ship_to_obj, dict):
                    ship_to_latitude = ship_to_obj.get("Latitude")
                    ship_to_longitude = ship_to_obj.get("Longitude")
                    ship_to_formatted_address = ship_to_obj.get("FormattedAddress")
                    logger.info(
                        f"✓ Extracted ShipTo: lat={ship_to_latitude}, lon={ship_to_longitude}, address={ship_to_formatted_address}"
                    )
                    if (
                        "Address" in ship_to_obj
                        and ship_to_obj.get("Address") is not None
                    ):
                        address_obj = ship_to_obj["Address"]
                        if isinstance(address_obj, dict):
                            ship_to_address = {
                                "street": address_obj.get("Street"),
                                "sublocality": address_obj.get("Sublocality"),
                                "locality": address_obj.get("Locality"),
                                "state": address_obj.get("State"),
                                "country": address_obj.get("Country"),
                                "zip_code": address_obj.get("ZipCode"),
                            }

    # Validate required fields
    if temperature_celsius is None or humidity is None:
        raise ValueError(
            f"Missing required webhook data: temperature={temperature_celsius}, humidity={humidity}"
        )

    # Fetch thresholds from therapy table for this patient
    therapy_thresholds = get_thresholds_from_therapy_table(patient_id)

    # Priority: Tive webhook thresholds > Therapy table thresholds > Static defaults
    if tive_thresholds:
        active_thresholds = tive_thresholds
        logger.info(f"Using thresholds from Tive webhook for patient {patient_id}")
    elif therapy_thresholds:
        active_thresholds = therapy_thresholds
        logger.info(f"Using thresholds from therapy table for patient {patient_id}")
    else:
        active_thresholds = PARAMETER_THRESHOLDS
        logger.info(f"Using fallback static thresholds for patient {patient_id}")

    # Check thresholds
    parameters = {
        "temperature": temperature_celsius,
        "temperature_fahrenheit": temperature_fahrenheit,
        "humidity": humidity,
        "agitation": agitation,
    }

    threshold_violations = {}
    violated_parameters = []

    for param_name in ["temperature", "humidity", "agitation"]:
        value = parameters[param_name]
        is_within_threshold = check_threshold(param_name, value, active_thresholds)
        threshold_violations[param_name] = not is_within_threshold
        if not is_within_threshold:
            violated_parameters.append(param_name)

    # Build thresholds info (use active thresholds - from Tive, Therapy table, or defaults)
    thresholds = {}
    for param_name in ["temperature", "humidity", "agitation"]:
        if param_name in active_thresholds:
            threshold_config = active_thresholds[param_name]
            thresholds[param_name] = {
                "min": threshold_config.get("min"),
                "max": threshold_config.get("max"),
                "unit": threshold_config.get("unit", ""),
            }
        else:
            # Fallback: try therapy thresholds, then static defaults
            if therapy_thresholds and param_name in therapy_thresholds:
                threshold_config = therapy_thresholds[param_name]
                thresholds[param_name] = {
                    "min": threshold_config.get("min"),
                    "max": threshold_config.get("max"),
                    "unit": threshold_config.get("unit", ""),
                }
            else:
                # Final fallback to static defaults
                default_config = PARAMETER_THRESHOLDS.get(param_name, {})
                thresholds[param_name] = {
                    "min": default_config.get("min"),
                    "max": default_config.get("max"),
                    "unit": default_config.get("unit", ""),
                }

    # Calculate quality loss percentage (for backward compatibility)
    quality_loss = calculate_quality_loss(parameters, thresholds, threshold_violations)

    # Score each KPI based on PDF logic (Green=0, Yellow=1, Red=2)
    kpi_scores = {}
    for param_name in ["temperature", "humidity", "agitation"]:
        value = parameters.get(param_name)
        if value is not None:
            kpi_scores[param_name] = score_kpi_status(param_name, value, thresholds)

    # Calculate quality status and percentage from KPI scores (PDF-based logic)
    quality_status, quality_percentage = calculate_quality_status_from_kpis(kpi_scores)

    # Also include KPI scores in output for transparency
    kpi_statuses = {}
    for param_name, score in kpi_scores.items():
        if score == 0:
            kpi_statuses[param_name] = "Good"
        elif score == 1:
            kpi_statuses[param_name] = "Warning"
        else:
            kpi_statuses[param_name] = "Critical"

    # Get timestamp
    timestamp = webhook_response.get("received_at")
    if not timestamp:
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    else:
        try:
            if isinstance(timestamp, str):
                dt = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
                timestamp = dt.strftime("%Y-%m-%d %H:%M:%S")
        except:
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # Build complete data structure - matches Publisher 7.py format exactly
    data = {
        "patient_id": patient_id,
        "shipment_id": shipment_id,
        "temperature": parameters["temperature"],
        "temperature_fahrenheit": parameters["temperature_fahrenheit"],
        "humidity": parameters["humidity"],
        "agitation": parameters["agitation"],
        "latitude": latitude,
        "longitude": longitude,
        "ship_from": {
            "latitude": ship_from_latitude,
            "longitude": ship_from_longitude,
            "formatted_address": ship_from_formatted_address,
            "address": ship_from_address,
        },
        "ship_to": {
            "latitude": ship_to_latitude,
            "longitude": ship_to_longitude,
            "formatted_address": ship_to_formatted_address,
            "address": ship_to_address,
        },
        "timestamp": timestamp,
        "thresholds": thresholds,
        "threshold_violations": threshold_violations,
        "violated_parameters": violated_parameters,
        "quality_loss": quality_loss,
        "quality_status": quality_status,
        "quality_percentage": quality_percentage,
        "kpi_scores": kpi_scores,
        "kpi_statuses": kpi_statuses,
    }

    return data


# ============================================================================
# IVF-Specific Threshold Logic Functions
# ============================================================================


def get_ivf_parameter_target(parameter_name: str) -> float:
    """
    Get the target value for IVF parameters.
    Note:
    - temp_internal: Cryogenic storage at -196°C (nominal setpoint)
    - temp_external: Operating range -20°C to 60°C
    - shock: Threshold 1G (≤1G = Green, >1G = Red)
    """
    IVF_TARGETS = {
        "temp_internal": -196.0,  # Cryogenic storage nominal setpoint: -196°C
        "temp_external": 20.0,  # Center of operating range (-20°C to 60°C)
        "shock": 0.0,  # Target: 0G (threshold: 1G)
    }
    return IVF_TARGETS.get(parameter_name, 0.0)


def check_ivf_threshold_magnitude(parameter_name: str, value: float) -> Dict[str, Any]:
    """
    Check IVF threshold using magnitude-based logic.

    Logic:
    - For temp_internal (Cryogenic Storage):
      - Nominal setpoint: -196°C
      - Yellow condition: ±5°C from -196°C (range: -201°C to -191°C)
      - Red condition: Any value outside this range
      - Red triggers Critical Alert

    - For shock:
      - Threshold: 1G
      - ≤1G = Green (No quality loss)
      - >1G = Red (High impact shock - Critical risk)
      - Any >1G triggers Immediate Critical Alert

    - For temp_external (Operating Limits):
      - Operating range: -20°C to 60°C
      - Within range → Green
      - ≤5°C outside range → Yellow
      - >5°C outside range → Red

    Returns:
        Dict with:
        - is_violation: bool (True if violation)
        - deviation: float (deviation from acceptable range)
        - magnitude_status: str ("Green", "Yellow", "Red", "Critical")
        - triggers_alert: bool (True if triggers email + SMS)
    """
    target = get_ivf_parameter_target(parameter_name)

    # Special case: temp_internal - Cryogenic storage at -196°C
    if parameter_name == "temp_internal":
        acceptable_min = -201.0  # -196°C - 5°C
        acceptable_max = -191.0  # -196°C + 5°C

        if value is None:
            return {
                "is_violation": False,
                "deviation": 0.0,
                "magnitude_status": "Green",
                "triggers_alert": False,
                "target": target,
                "acceptable_min": acceptable_min,
                "acceptable_max": acceptable_max,
            }

        if acceptable_min <= value <= acceptable_max:
            # Within ±5°C band (-201°C to -191°C)
            # Check if very close to target (-196°C ± 1°C) = Green, otherwise Yellow
            if -197.0 <= value <= -195.0:
                magnitude_status = "Green"
                is_violation = False
                deviation = 0.0
                triggers_alert = False
            else:
                magnitude_status = "Yellow"
                is_violation = True
                deviation = abs(value - target)
                triggers_alert = False
        else:
            # Outside acceptable range - Red (Critical cryogenic breach)
            if value < acceptable_min:
                deviation = acceptable_min - value
            else:
                deviation = value - acceptable_max
            magnitude_status = "Red"
            is_violation = True
            triggers_alert = True

        return {
            "is_violation": is_violation,
            "deviation": deviation,
            "magnitude_status": magnitude_status,
            "triggers_alert": triggers_alert,
            "target": target,
            "acceptable_min": acceptable_min,
            "acceptable_max": acceptable_max,
        }

    # Special case: shock - Threshold 1G
    if parameter_name == "shock":
        threshold = 1.0  # 1G threshold

        if value is None:
            return {
                "is_violation": False,
                "deviation": 0.0,
                "magnitude_status": "Green",
                "triggers_alert": False,
                "target": target,
                "acceptable_min": None,
                "acceptable_max": threshold,
            }

        if value <= threshold:
            magnitude_status = "Green"
            is_violation = False
            deviation = 0.0
            triggers_alert = False
        else:
            deviation = value - threshold
            magnitude_status = "Red"
            is_violation = True
            triggers_alert = True

        return {
            "is_violation": is_violation,
            "deviation": deviation,
            "magnitude_status": magnitude_status,
            "triggers_alert": triggers_alert,
            "target": target,
            "acceptable_min": None,
            "acceptable_max": threshold,
        }

    # Special case: temp_external - Operating range -20°C to 60°C
    if parameter_name == "temp_external":
        operating_min = -20.0
        operating_max = 60.0

        if value is None:
            return {
                "is_violation": False,
                "deviation": 0.0,
                "magnitude_status": "Green",
                "triggers_alert": False,
                "target": target,
                "acceptable_min": operating_min,
                "acceptable_max": operating_max,
            }

        if operating_min <= value <= operating_max:
            magnitude_status = "Green"
            is_violation = False
            deviation = 0.0
            triggers_alert = False
        else:
            if value < operating_min:
                deviation = operating_min - value
            else:
                deviation = value - operating_max

            if deviation <= 5.0:
                magnitude_status = "Yellow"
            else:
                magnitude_status = "Red"
            is_violation = True
            triggers_alert = magnitude_status == "Red"

        return {
            "is_violation": is_violation,
            "deviation": deviation,
            "magnitude_status": magnitude_status,
            "triggers_alert": triggers_alert,
            "target": target,
            "acceptable_min": operating_min,
            "acceptable_max": operating_max,
        }

    # Standard logic for other KPIs: ±5 acceptable band
    acceptable_min = target - 5.0
    acceptable_max = target + 5.0

    if value < acceptable_min:
        deviation = acceptable_min - value
    elif value > acceptable_max:
        deviation = value - acceptable_max
    else:
        deviation = 0.0

    if deviation == 0.0:
        magnitude_status = "Green"
        is_violation = False
        triggers_alert = False
    else:
        magnitude_status = "Red"
        is_violation = True
        triggers_alert = True

    return {
        "is_violation": is_violation,
        "deviation": deviation,
        "magnitude_status": magnitude_status,
        "triggers_alert": triggers_alert,
        "target": target,
        "acceptable_min": acceptable_min,
        "acceptable_max": acceptable_max,
    }


def get_ivf_violation_frequency(
    tank_id: int, parameter_name: str, window_minutes: int = 60
) -> Dict[str, Any]:
    """
    Get frequency of violations for a parameter within a time window.

    Logic:
    - 0 deviations = Green
    - 5 deviations = Yellow
    - >5 deviations = Red

    Args:
        tank_id: Tank ID
        parameter_name: Parameter name (temp_internal, temp_external, shock)
        window_minutes: Time window in minutes (default: 60)

    Returns:
        Dict with:
        - count: int (number of violations in window)
        - frequency_status: str ("Green", "Yellow", "Red")
    """
    SessionLocal = get_session()
    db = SessionLocal()
    try:
        window_start = datetime.now() - timedelta(minutes=window_minutes)

        violation_flag_map = {
            "temp_internal": "is_temp_internal_loss",
            "temp_external": "is_temp_external_loss",
            "shock": "is_shock_loss",
        }

        violation_flag = violation_flag_map.get(parameter_name)
        if not violation_flag:
            return {"count": 0, "frequency_status": "Green"}

        query = text(f"""
            SELECT COUNT(*) as violation_count
            FROM ivf_quality_log
            WHERE tank_id = :tank_id
              AND {violation_flag} = true
              AND reading_timestamp >= :window_start
        """)

        result = db.execute(query, {"tank_id": tank_id, "window_start": window_start})

        count = result.scalar() or 0

        if count == 0:
            frequency_status = "Green"
        elif count == 5:
            frequency_status = "Yellow"
        elif count > 5:
            frequency_status = "Red"
        else:
            frequency_status = "Green"  # 1-4 deviations still Green

        return {
            "count": count,
            "frequency_status": frequency_status,
            "window_minutes": window_minutes,
        }
    except Exception as e:
        logger.error(f"Error getting IVF violation frequency: {e}", exc_info=True)
        return {"count": 0, "frequency_status": "Green", "error": str(e)}
    finally:
        db.close()


def get_ivf_violation_duration(
    tank_id: int, parameter_name: str, current_violation: bool
) -> Dict[str, Any]:
    """
    Get duration of current violation for a parameter.

    Logic:
    - 0 minutes = Green
    - ≥5 minutes = triggers alerting along with magnitude/frequency

    Args:
        tank_id: Tank ID
        parameter_name: Parameter name
        current_violation: Whether current reading is a violation

    Returns:
        Dict with:
        - duration_minutes: float (duration of violation in minutes)
        - duration_status: str ("Green", "Alert")
        - violation_start: datetime or None
    """
    SessionLocal = get_session()
    db = SessionLocal()
    try:
        violation_flag_map = {
            "temp_internal": "is_temp_internal_loss",
            "temp_external": "is_temp_external_loss",
            "shock": "is_shock_loss",
        }

        violation_flag = violation_flag_map.get(parameter_name)
        if not violation_flag:
            return {
                "duration_minutes": 0.0,
                "duration_status": "Green",
                "violation_start": None,
            }

        if not current_violation:
            return {
                "duration_minutes": 0.0,
                "duration_status": "Green",
                "violation_start": None,
            }

        query = text(f"""
            WITH violation_sequence AS (
                SELECT
                    reading_timestamp,
                    {violation_flag} as is_violation,
                    LAG({violation_flag}) OVER (ORDER BY reading_timestamp DESC) as prev_violation
                FROM ivf_quality_log
                WHERE tank_id = :tank_id
                ORDER BY reading_timestamp DESC
                LIMIT 100
            )
            SELECT reading_timestamp
            FROM violation_sequence
            WHERE is_violation = true
              AND (prev_violation = false OR prev_violation IS NULL)
            ORDER BY reading_timestamp DESC
            LIMIT 1
        """)

        result = db.execute(query, {"tank_id": tank_id})
        violation_start = result.scalar()

        if violation_start:
            duration_minutes = (datetime.now() - violation_start).total_seconds() / 60.0

            if duration_minutes >= 5.0:
                duration_status = "Alert"
            else:
                duration_status = "Green"

            return {
                "duration_minutes": round(duration_minutes, 2),
                "duration_status": duration_status,
                "violation_start": violation_start.isoformat()
                if hasattr(violation_start, "isoformat")
                else str(violation_start),
            }
        else:
            violation_start = datetime.now()
            return {
                "duration_minutes": 0.0,
                "duration_status": "Green",
                "violation_start": violation_start.isoformat(),
            }
    except Exception as e:
        logger.error(f"Error getting IVF violation duration: {e}", exc_info=True)
        return {
            "duration_minutes": 0.0,
            "duration_status": "Green",
            "violation_start": None,
            "error": str(e),
        }
    finally:
        db.close()


def transform_webhook_to_ivf_quality_data(
    webhook_response: Dict[str, Any], ivf_shipment_info: Dict[str, Any]
) -> Dict[str, Any]:
    """Transform webhook response data to IVF quality data format"""
    webhook_data = webhook_response.get("webhook_data", webhook_response)

    # Handle case where webhook_data has raw_body that needs parsing
    if isinstance(webhook_data, dict) and "raw_body" in webhook_data:
        raw_body = webhook_data.get("raw_body", "")
        if raw_body:
            try:
                parsed_data = json.loads(raw_body)
                if isinstance(parsed_data, dict):
                    webhook_data = parsed_data
                elif isinstance(parsed_data, dict) and "webhook_data" in parsed_data:
                    webhook_data = parsed_data["webhook_data"]
            except (json.JSONDecodeError, TypeError):
                pass

    # Extract thresholds from Tive webhook (if available)
    try:
        tive_thresholds = extract_thresholds_from_tive_webhook(webhook_data)
        if tive_thresholds:
            logger.info(
                f"✓ Using thresholds from Tive webhook for IVF: {json.dumps(tive_thresholds, indent=2)}"
            )
        else:
            logger.warning(
                "⚠ No thresholds found in Tive webhook for IVF, using fallback static thresholds"
            )
            tive_thresholds = None
    except Exception as e:
        logger.error(
            f"Error extracting Tive thresholds for IVF, using fallback: {e}",
            exc_info=True,
        )
        tive_thresholds = None

    # Extract Temperature Internal (Probe) and External (Device) (IVF KPIs)
    temp_internal_celsius = None
    temp_internal_fahrenheit = None
    temp_external_celsius = None
    temp_external_fahrenheit = None

    # Check for ProbeTemperature (Internal/Probe temperature)
    # IMPORTANT: Internal temperature must come only from ProbeTemperature.
    # If ProbeTemperature is missing, temp_internal remains None (no fallback).
    if "ProbeTemperature" in webhook_data and webhook_data["ProbeTemperature"]:
        probe_obj = webhook_data["ProbeTemperature"]
        if isinstance(probe_obj, dict):
            temp_internal_celsius = probe_obj.get("Celsius")
            temp_internal_fahrenheit = probe_obj.get("Fahrenheit")

    # Check for DeviceTemperature or ExternalTemperature (External/Device temperature)
    if "DeviceTemperature" in webhook_data and webhook_data["DeviceTemperature"]:
        device_obj = webhook_data["DeviceTemperature"]
        if isinstance(device_obj, dict):
            temp_external_celsius = device_obj.get("Celsius")
            temp_external_fahrenheit = device_obj.get("Fahrenheit")

    # Check for Temperature object (may contain Internal/External or just general Temperature)
    if "Temperature" in webhook_data and webhook_data["Temperature"]:
        temp_obj = webhook_data["Temperature"]


        if "External" in temp_obj:
            external_obj = temp_obj["External"]
            if isinstance(external_obj, dict):
                temp_external_celsius = temp_external_celsius or external_obj.get(
                    "Celsius"
                )
                temp_external_fahrenheit = temp_external_fahrenheit or external_obj.get(
                    "Fahrenheit"
                )
        elif "ExternalCelsius" in temp_obj:
            temp_external_celsius = temp_external_celsius or temp_obj.get(
                "ExternalCelsius"
            )
            temp_external_fahrenheit = temp_external_fahrenheit or temp_obj.get(
                "ExternalFahrenheit"
            )

    if "TemperatureExternal" in webhook_data and webhook_data["TemperatureExternal"]:
        temp_ext_obj = webhook_data["TemperatureExternal"]
        if isinstance(temp_ext_obj, dict):
            temp_external_celsius = temp_external_celsius or temp_ext_obj.get("Celsius")
            temp_external_fahrenheit = temp_external_fahrenheit or temp_ext_obj.get(
                "Fahrenheit"
            )

    # PATCH: If temp_external_celsius is still None, use webhook_data['Temperature']['Celsius'] as fallback
    if (
        temp_external_celsius is None
        and "Temperature" in webhook_data
        and webhook_data["Temperature"]
    ):
        temp_obj = webhook_data["Temperature"]
        if isinstance(temp_obj, dict) and "Celsius" in temp_obj:
            temp_external_celsius = temp_obj.get("Celsius")
            temp_external_fahrenheit = temp_obj.get("Fahrenheit")

    # Extract humidity (not monitored for IVF, but may be in webhook data)
    humidity = None
    if "Humidity" in webhook_data and webhook_data["Humidity"]:
        humidity = webhook_data["Humidity"].get("Percentage")

    # Extract Shock.G (IVF KPI)
    shock_g = None
    if "Shock" in webhook_data:
        shock_obj = webhook_data["Shock"]
        if shock_obj is not None:
            if isinstance(shock_obj, dict):
                shock_g = (
                    shock_obj.get("G")
                    or shock_obj.get("GForce")
                    or shock_obj.get("GForceValue")
                    or shock_obj.get("Value")
                )
            elif isinstance(shock_obj, (int, float)):
                shock_g = shock_obj
    if shock_g is None and "Accelerometer" in webhook_data:
        accel_obj = webhook_data["Accelerometer"]
        if accel_obj is not None:
            if isinstance(accel_obj, dict):
                shock_g = (
                    accel_obj.get("G")
                    or accel_obj.get("GForce")
                    or accel_obj.get("GForceValue")
                )
    if shock_g is None and "GForce" in webhook_data:
        gforce_val = webhook_data.get("GForce")
        if gforce_val is not None:
            shock_g = gforce_val
    if shock_g is None and "GForceValue" in webhook_data:
        gforce_val = webhook_data.get("GForceValue")
        if gforce_val is not None:
            shock_g = gforce_val

    agitation = convert_shock_g_to_agitation(shock_g)
    shock_value = agitation

    # Extract location (latitude and longitude) - current device location
    latitude = None
    longitude = None
    if "Location" in webhook_data and webhook_data["Location"]:
        location_obj = webhook_data["Location"]
        latitude = location_obj.get("Latitude")
        longitude = location_obj.get("Longitude")

    # Extract battery percentage
    battery_percentage = None
    if "Battery" in webhook_data and webhook_data["Battery"]:
        battery_obj = webhook_data["Battery"]
        if isinstance(battery_obj, dict):
            battery_percentage = (
                battery_obj.get("Percentage")
                or battery_obj.get("Percent")
                or battery_obj.get("Level")
            )
        elif isinstance(battery_obj, (int, float)):
            battery_percentage = battery_obj
    elif "BatteryPercent" in webhook_data:
        battery_percentage = webhook_data.get("BatteryPercent")
    elif "BatteryLevel" in webhook_data:
        battery_percentage = webhook_data.get("BatteryLevel")

    # Extract ShipFrom and ShipTo from webhook
    ship_from_latitude = None
    ship_from_longitude = None
    ship_to_latitude = None
    ship_to_longitude = None

    if "Shipment" in webhook_data:
        shipment_obj = webhook_data.get("Shipment")
        if isinstance(shipment_obj, dict):
            if "ShipFrom" in shipment_obj and shipment_obj.get("ShipFrom"):
                ship_from_obj = shipment_obj["ShipFrom"]
                if isinstance(ship_from_obj, dict):
                    ship_from_latitude = ship_from_obj.get("Latitude")
                    ship_from_longitude = ship_from_obj.get("Longitude")

            if "ShipTo" in shipment_obj and shipment_obj.get("ShipTo"):
                ship_to_obj = shipment_obj["ShipTo"]
                if isinstance(ship_to_obj, dict):
                    ship_to_latitude = ship_to_obj.get("Latitude")
                    ship_to_longitude = ship_to_obj.get("Longitude")

    # Extract shipment_id
    shipment_id = webhook_data.get("ShipmentId") or ivf_shipment_info.get("shipment_id")
    if "Shipment" in webhook_data:
        shipment_obj = webhook_data.get("Shipment")
        if isinstance(shipment_obj, dict) and not shipment_id:
            shipment_id = shipment_obj.get("Id")

    # IVF-Specific Threshold Logic: Magnitude, Frequency, Duration
    tank_id = ivf_shipment_info.get("tank_id")

    # Build parameters dict for IVF KPIs
    parameters = {
        "temp_internal": temp_internal_celsius,
        "temp_internal_fahrenheit": temp_internal_fahrenheit,
        "temp_external": temp_external_celsius,
        "temp_external_fahrenheit": temp_external_fahrenheit,
        "humidity": humidity,
        "shock": shock_value,
    }

    # IVF KPI names (humidity not monitored for IVF)
    ivf_kpi_names = ["temp_internal", "temp_external", "shock"]

    # Build thresholds info for IVF KPIs
    thresholds = {}
    for param_name in ivf_kpi_names:
        target = get_ivf_parameter_target(param_name)
        if param_name == "temp_internal":
            thresholds[param_name] = {
                "target": target,
                "min": -201.0,
                "max": -191.0,
                "unit": "°C",
            }
        elif param_name == "temp_external":
            thresholds[param_name] = {
                "target": target,
                "min": -20.0,
                "max": 60.0,
                "unit": "°C",
            }
        elif param_name == "shock":
            thresholds[param_name] = {
                "target": target,
                "min": None,
                "max": 1.0,
                "unit": "G",
            }

    # Check thresholds using IVF-specific magnitude-based logic
    threshold_violations = {}
    violated_parameters = []
    magnitude_results = {}
    frequency_results = {}
    duration_results = {}
    kpi_scores = {}
    kpi_visualization = {}

    # Process each IVF KPI
    for param_name in ivf_kpi_names:
        value = parameters[param_name]
        if value is None:
            continue

        # Check magnitude
        magnitude_result = check_ivf_threshold_magnitude(param_name, value)
        magnitude_results[param_name] = magnitude_result

        # Get frequency
        if tank_id:
            frequency_result = get_ivf_violation_frequency(
                tank_id, param_name, window_minutes=60
            )
            frequency_results[param_name] = frequency_result

            current_violation = magnitude_result.get("is_violation", False)
            duration_result = get_ivf_violation_duration(
                tank_id, param_name, current_violation
            )
        else:
            frequency_result = {"count": 0, "frequency_status": "Green"}
            frequency_results[param_name] = frequency_result
            duration_result = {
                "duration_minutes": 0.0,
                "duration_status": "Green",
                "violation_start": None,
            }
        duration_results[param_name] = duration_result

        # Calculate highest severity from Magnitude, Frequency, Duration
        magnitude_status = magnitude_result.get("magnitude_status", "Green")
        frequency_status = frequency_result.get("frequency_status", "Green")
        duration_status = duration_result.get("duration_status", "Green")

        magnitude_score = (
            0
            if magnitude_status == "Green"
            else (1 if magnitude_status == "Yellow" else 2)
        )
        frequency_score = (
            0
            if frequency_status == "Green"
            else (1 if frequency_status == "Yellow" else 2)
        )
        duration_score = 0 if duration_status == "Green" else 2

        highest_severity_score = max(magnitude_score, frequency_score, duration_score)
        kpi_scores[param_name] = highest_severity_score

        threshold_violations[param_name] = magnitude_result.get("is_violation", False)
        if magnitude_result.get("is_violation", False):
            violated_parameters.append(param_name)

        # Build KPI visualization data
        kpi_visualization[param_name] = {
            "value": value,
            "target": magnitude_result.get("target"),
            "acceptable_min": magnitude_result.get("acceptable_min"),
            "acceptable_max": magnitude_result.get("acceptable_max"),
            "deviation": magnitude_result.get("deviation", 0.0),
            "severity": "Green"
            if highest_severity_score == 0
            else ("Yellow" if highest_severity_score == 1 else "Red"),
            "severity_score": highest_severity_score,
            "magnitude_status": magnitude_status,
            "magnitude_score": magnitude_score,
            "frequency_status": frequency_status,
            "frequency_count": frequency_result.get("count", 0),
            "frequency_score": frequency_score,
            "duration_status": duration_status,
            "duration_minutes": duration_result.get("duration_minutes", 0.0),
            "duration_breach": duration_status == "Alert",
            "duration_score": duration_score,
            "triggers_alert": magnitude_result.get("triggers_alert", False),
            "unit": thresholds[param_name].get("unit", ""),
        }

    # Calculate quality loss percentage
    quality_loss = 0.0
    for param_name in ivf_kpi_names:
        if param_name in magnitude_results and parameters.get(param_name) is not None:
            magnitude_result = magnitude_results[param_name]
            deviation = magnitude_result.get("deviation", 0.0)
            if deviation > 0:
                param_loss = min((deviation / 5.0) * 100, 100.0)
                if "temp" in param_name:
                    weight = 0.45
                elif param_name == "shock":
                    weight = 0.20
                else:
                    weight = 0.1
                quality_loss += param_loss * weight

    quality_loss = min(quality_loss, 100.0)

    # Calculate quality status and percentage from KPI scores
    quality_status, quality_percentage = calculate_quality_status_from_kpis(kpi_scores)

    # Include KPI statuses
    kpi_statuses = {}
    for param_name, score in kpi_scores.items():
        if score == 0:
            kpi_statuses[param_name] = "Good"
        elif score == 1:
            kpi_statuses[param_name] = "Warning"
        else:
            kpi_statuses[param_name] = "Critical"

    # Get timestamp
    timestamp = webhook_data.get("EntryTimeUtc")
    if not timestamp:
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    else:
        try:
            if isinstance(timestamp, str):
                dt = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
                timestamp = dt.strftime("%Y-%m-%d %H:%M:%S")
        except:
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # Build complete data structure for IVF
    data = {
        "tank_id": ivf_shipment_info.get("tank_id"),
        "tank_code": ivf_shipment_info.get("tank_code"),
        "canister_number": ivf_shipment_info.get("canister_number"),
        "shipment_id": shipment_id,
        "device_id": ivf_shipment_info.get("device_id"),
        "temp_internal": parameters.get("temp_internal"),
        "temp_internal_fahrenheit": parameters.get("temp_internal_fahrenheit"),
        "temp_external": parameters.get("temp_external"),
        "temp_external_fahrenheit": parameters.get("temp_external_fahrenheit"),
        "shock": parameters.get("shock"),
        "latitude": latitude,
        "longitude": longitude,
        "battery_percentage": battery_percentage,
        "ship_from": {"latitude": ship_from_latitude, "longitude": ship_from_longitude},
        "ship_to": {"latitude": ship_to_latitude, "longitude": ship_to_longitude},
        "timestamp": timestamp,
        "thresholds": thresholds,
        "threshold_violations": threshold_violations,
        "violated_parameters": violated_parameters,
        "quality_loss": quality_loss,
        "quality_status": quality_status,
        "quality_percentage": quality_percentage,
        "kpi_scores": kpi_scores,
        "kpi_statuses": kpi_statuses,
        "magnitude_results": magnitude_results,
        "frequency_results": frequency_results,
        "duration_results": duration_results,
        "kpi_visualization": kpi_visualization,
    }

    return data


def process_webhook_payload(event_data, webhook_payload: Dict[str, Any]) -> int:
    """
    Process webhook payload - main processing function adapted for Azure Functions.

    Processes both IVF (tank-based) and CGT (patient-based) webhooks.
    IVF processing takes priority - if IVF is detected, it processes IVF first, then CGT.

    Args:
        event_data: Event Hub event data (for idempotency)
        webhook_payload: Parsed webhook payload

    Returns:
        Number of items processed
    """
    SessionLocal = get_session()
    db = SessionLocal()

    try:
        logger.info(f"Printing event data: {event_data}:{webhook_payload}")
        # 1. Idempotency check (with transaction safety)
        message_id = generate_message_id(event_data)
        try:
            if check_message_processed(db, message_id):
                logger.info(f"Message {message_id} already processed - skipping")
                return 0
        except Exception as e:
            logger.warning(f"Idempotency check failed, continuing anyway: {e}")
            try:
                db.rollback()
            except:
                pass

        # 2. CUSTOM_IOT (LN2) - handled as before
        if is_custom_iot_source(webhook_payload):
            logger.info("Processing CUSTOM_IOT (LN2) webhook...")
            try:
                success = process_custom_iot_ln2(db, webhook_payload)
                if success:
                    mark_message_processed(
                        db, message_id, json.dumps(webhook_payload)[:200]
                    )
                    db.commit()
                    return 1
                else:
                    logger.warning("CUSTOM_IOT processing failed")
                    db.rollback()
                    return 0
            except Exception as e:
                logger.error(f"Error in CUSTOM_IOT processing: {e}", exc_info=True)
                db.rollback()
                raise

        # 3. IVF tank-level monitoring (Tive device_id maps to tank)
        logger.info(
            f"[DEBUG] Attempting IVF tank-level detection for payload: {webhook_payload}"
        )
        device_id = extract_device_id_from_webhook(webhook_payload)
        logger.info(f"[DEBUG] Extracted device_id for IVF lookup: {device_id}")
        tank_info = find_tank_by_tive_device_id(db, device_id) if device_id else None
        logger.info(
            f"[DEBUG] IVF tank_info from find_tank_by_tive_device_id: {tank_info}"
        )
        if tank_info:
            logger.info(
                f"✓ Found IVF tank (monitoring): tank_id={tank_info.get('tank_id')}, device_id={device_id}"
            )
            tank_ivf_info = {
                "shipment_id": None,
                "tank_id": tank_info.get("tank_id"),
                "device_id": device_id,
                "branch_id": tank_info.get("branch_id"),
                "tank_code": tank_info.get("tank_code"),
            }
            webhook_response = {
                "webhook_data": webhook_payload,
                "received_at": datetime.now().isoformat(),
            }
            logger.info(f"[DEBUG] IVF tank_ivf_info: {tank_ivf_info}")
            ivf_data = transform_webhook_to_ivf_quality_data(
                webhook_response, tank_ivf_info
            )
            logger.info(f"[DEBUG] IVF ivf_data: {ivf_data}")
            tank_id = tank_info.get("tank_id")
            kpi_data = KPI_NAMES.convert_ivf_quality_to_kpi_names_mapped_array(ivf_data)
            logger.info(f"[DEBUG] IVF kpi_data: {kpi_data}")
            save_kpi_readings(db, device_id, kpi_data)
            try:
                r = get_redis_client()
                r.publish("ivf_quality_channel", json.dumps(ivf_data))
                history_key = f"ivf_quality_history:{tank_id}"
                r.lpush(history_key, json.dumps(ivf_data))
                r.ltrim(history_key, 0, 9)
                r.sadd("ivf_tanks", str(tank_id))
            except Exception as e:
                logger.error(f"Error publishing to Redis for tank {tank_id}: {e}")
            insert_ivf_telemetry_data(db, tank_id, ivf_data)
            logger.info(
                f"✓ Inserted IVF telemetry data for tank {tank_id} (tank monitoring)"
            )
            mark_message_processed(db, message_id, json.dumps(webhook_payload)[:200])
            db.commit()
            return 1

        # 4. CGT (patient-based) - only if valid patient_id and shipment_id
        patient_id = webhook_payload.get("PatientId")
        shipment_id = webhook_payload.get("ShipmentId")
        if patient_id and shipment_id:
            logger.info(
                f"Processing CGT shipment webhook: patient_id={patient_id}, shipment_id={shipment_id}"
            )
            webhook_response = {
                "webhook_data": webhook_payload,
                "received_at": datetime.now().isoformat(),
            }
            quality_data = transform_webhook_to_quality_data(
                webhook_response, patient_id
            )
            telemetry_data_id = insert_telemetry_data(db, shipment_id, quality_data)
            if telemetry_data_id:
                insert_quality_log(
                    db, telemetry_data_id, shipment_id, quality_data, datetime.now()
                )
                insert_geolocation(
                    db, telemetry_data_id, shipment_id, quality_data, datetime.now()
                )
                logger.info(
                    f"✓ Inserted telemetry data for shipment {shipment_id} (id={telemetry_data_id})"
                )
            mark_message_processed(db, message_id, json.dumps(webhook_payload)[:200])
            db.commit()
            return 1
        else:
            logger.warning(
                "No valid patient_id and shipment_id found for CGT processing. Skipping CGT inserts."
            )
            mark_message_processed(db, message_id, json.dumps(webhook_payload)[:200])
            db.commit()
            return 0

    except Exception as e:
        db.rollback()
        logger.error(f"Error processing webhook payload: {e}", exc_info=True)
        raise
    finally:
        db.close()
