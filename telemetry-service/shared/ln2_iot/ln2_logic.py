"""
ln2_logic.py
────────────
Pure functions for:
  1. Sensor-reading validation
  2. LN2 mass / volume / level conversion
  3. Rate estimation (linear regression over the whole window)
  4. Refill detection
  5. Open/Closed state machine step

No I/O here — all side effects (Redis, DB, Event Hub) live in the consumer.
All calibration values are received as a DeviceConfig argument, not imported
from config.py, so the same functions work correctly for every tank/device.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import Enum
from typing import Optional

from . import config
from .device_config import DeviceConfig

logger = logging.getLogger(__name__)

# Evaporation rate bucket defaults
EVAP_RATE_BUCKET_MINUTES = 5
EVAP_RATE_WINDOW_HOURS = 24
EVAP_RATE_MIN_BUCKETS = 12


# ─────────────────────────────────────────────────────────────
# Types / data-classes
# ─────────────────────────────────────────────────────────────


class LidState(str, Enum):
    UNKNOWN = "UNKNOWN"
    OPEN = "OPEN"
    CLOSED = "CLOSED"


class SensorStatus(str, Enum):
    OK = "OK"
    BELOW_EMPTY = "BELOW_EMPTY"  # weight_kg < cfg.sensor_min_kg
    ABOVE_FULL = "ABOVE_FULL"  # weight_kg > cfg.sensor_max_kg


@dataclass
class SensorReading:
    timestamp: datetime
    raw_weight_kg: float
    status: SensorStatus
    ln2_mass_kg: float
    ln2_level_pct: float
    ln2_volume_l: float


@dataclass
class RateEstimate:
    rate_kg_per_h: float  # negative = evaporation (mass loss)
    loss_rate_kg_per_h: float  # always ≥ 0, for convenience
    n_points: int
    r_squared: float  # OLS goodness-of-fit


@dataclass
class StateMachineStep:
    """
    One step of the lid open/closed state machine.
    The caller persists new_state, open_counter, closed_counter to Redis.
    """

    previous_state: LidState
    new_state: LidState
    open_counter: int
    closed_counter: int
    state_changed: bool
    refill_detected: bool = False


class WeightEventType(str, Enum):
    """Classified point-to-point weight change events."""

    NONE = "NONE"
    LID_CLOSE_CANDIDATE = "LID_CLOSE_CANDIDATE"  # +450 g – +650 g (Case C)
    CANISTER_REMOVED = "CANISTER_REMOVED"  # ≈ −310 g drop
    CANISTER_ADDED = "CANISTER_ADDED"  # ≈ +310 g increase
    PRODUCT_CHANGE = "PRODUCT_CHANGE"  # < 80 g change


@dataclass
class WeightEventResult:
    """Result of classify_weight_event()."""

    event_type: WeightEventType
    delta_kg: float  # raw point-to-point delta (signed)


@dataclass
class LowLevelCheck:
    """Result of check_low_level_alert()."""

    is_below_threshold: bool
    consecutive_count: int  # updated counter (caller persists to Redis)
    alert_triggered: bool  # True once count ≥ cfg.low_level_consecutive_readings


# ─────────────────────────────────────────────────────────────
# 1. Sensor validation + LN2 conversions
# ─────────────────────────────────────────────────────────────


def validate_and_convert(
    timestamp: datetime,
    weight_kg: float,
    cfg: DeviceConfig,
) -> SensorReading:
    """
    Validate raw sensor weight using this device's calibration and derive
    LN2 mass, level %, and volume.

    Fault bounds (cfg.sensor_min_kg / cfg.sensor_max_kg) come from
    ln2_iot_devices.tank_min/max_capacity_reading, with a universal fallback
    of ±SENSOR_FAULT_MARGIN_KG around the tank's empty/full weights.
    """
    status = SensorStatus.OK

    if weight_kg < cfg.sensor_min_kg:
        logger.warning(
            "Sensor fault device=%s at %s: %.3f kg < min %.3f kg (BELOW_EMPTY)",
            cfg.device_code,
            timestamp.isoformat(),
            weight_kg,
            cfg.sensor_min_kg,
        )
        status = SensorStatus.BELOW_EMPTY

    elif weight_kg > cfg.sensor_max_kg:
        logger.warning(
            "Sensor fault device=%s at %s: %.3f kg > max %.3f kg (ABOVE_FULL)",
            cfg.device_code,
            timestamp.isoformat(),
            weight_kg,
            cfg.sensor_max_kg,
        )
        status = SensorStatus.ABOVE_FULL

    # Clamp derived quantities to the physically valid range.
    # At this point any out-of-range raw reading has already been detected,
    # logged, and reflected in `status` (BELOW_EMPTY / ABOVE_FULL).  We still
    # return bounded ln2_mass/level/volume so downstream calculations operate
    # on safe, non-extreme values, while callers that require strict sensor
    # validity must check `status` and reject non-OK readings rather than
    # relying solely on the clamped numbers.
    raw_mass = weight_kg - cfg.empty_weight_kg
    ln2_mass = max(0.0, min(raw_mass, cfg.ln2_max_mass_kg))
    level_pct = (
        100.0 * ln2_mass / cfg.ln2_max_mass_kg if cfg.ln2_max_mass_kg > 0 else 0.0
    )
    volume_l = ln2_mass / config.LN2_DENSITY_KG_PER_L

    return SensorReading(
        timestamp=timestamp,
        raw_weight_kg=weight_kg,
        status=status,
        ln2_mass_kg=round(ln2_mass, 6),
        ln2_level_pct=round(level_pct, 4),
        ln2_volume_l=round(volume_l, 4),
    )


def compute_smoothed_ln2(
    window: list[tuple[datetime, float]],
    now_ts: datetime,
    cfg: DeviceConfig,
    avg_minutes: int = 5,
) -> tuple[float, float, float]:
    """
    Compute smoothed LN2 mass/level/volume using a running average over
    the last `avg_minutes` of window points.

    Returns (ln2_mass_kg, ln2_level_pct, ln2_volume_l).
    """
    if avg_minutes <= 0:
        avg_minutes = 1

    cutoff = now_ts - timedelta(minutes=avg_minutes)
    recent_masses = [mass for ts, mass in window if ts >= cutoff]

    if recent_masses:
        avg_mass = sum(recent_masses) / float(len(recent_masses))
    elif window:
        avg_mass = window[-1][1]
    else:
        avg_mass = 0.0

    avg_mass = max(0.0, min(avg_mass, cfg.ln2_max_mass_kg))
    level_pct = (
        100.0 * avg_mass / cfg.ln2_max_mass_kg if cfg.ln2_max_mass_kg > 0 else 0.0
    )
    volume_l = avg_mass / config.LN2_DENSITY_KG_PER_L

    return (round(avg_mass, 6), round(level_pct, 4), round(volume_l, 4))


# ─────────────────────────────────────────────────────────────
# 2. Refill detection
# ─────────────────────────────────────────────────────────────


def detect_refill(
    window: list[tuple[datetime, float]],
    new_mass_kg: float,
    cfg: DeviceConfig,
) -> bool:
    """
    Returns True when the new reading is significantly *higher* than the
    most-recent window value — i.e. a refill just happened.

    Threshold comes from cfg.refill_threshold_kg (per-device, from DB).
    A refill makes the rate estimator return a positive (mass-gain) value
    that must NOT be interpreted as a "lid closed" signal.
    """
    if not window:
        return False
    latest_mass = window[-1][1]
    return (new_mass_kg - latest_mass) >= cfg.refill_threshold_kg


# ─────────────────────────────────────────────────────────────
# 3. Rate estimation (OLS linear regression over full window)
# ─────────────────────────────────────────────────────────────


def estimate_rate(
    window: list[tuple[datetime, float]],
    cfg: DeviceConfig,
) -> Optional[RateEstimate]:
    """
    Estimate LN2 evaporation rate via OLS over all window points.
    Returns None when fewer than cfg.window_min_points are available.

    Using all points (not just first/last):
      • Much less sensitive to endpoint noise.
      • R² provides an anomaly signal (low R² = non-linear event in window).
      • O(n) — negligible CPU at ~600 pts/window.
    """
    n = len(window)
    if n < cfg.window_min_points:
        return None

    t0 = window[0][0].timestamp()
    xs = [(ts.timestamp() - t0) / 3600.0 for ts, _ in window]
    ys = [mass for _, mass in window]

    n_f = float(n)
    sum_x = sum(xs)
    sum_y = sum(ys)
    sum_xy = sum(x * y for x, y in zip(xs, ys))
    sum_x2 = sum(x * x for x in xs)

    denom = n_f * sum_x2 - sum_x**2
    if abs(denom) < 1e-12:
        return None  # degenerate — all same timestamp

    slope = (n_f * sum_xy - sum_x * sum_y) / denom  # kg/hour
    intercept = (sum_y - slope * sum_x) / n_f

    y_mean = sum_y / n_f
    ss_tot = sum((y - y_mean) ** 2 for y in ys)
    if ss_tot < 1e-12:
        r_sq = 1.0
    else:
        ss_res = sum((y - (slope * x + intercept)) ** 2 for x, y in zip(xs, ys))
        r_sq = 1.0 - ss_res / ss_tot

    return RateEstimate(
        rate_kg_per_h=round(slope, 8),
        loss_rate_kg_per_h=round(max(0.0, -slope), 8),
        n_points=n,
        r_squared=round(r_sq, 6),
    )


def estimate_rate_from_buckets(
    buckets: list[tuple[datetime, float]],
    min_points: int = EVAP_RATE_MIN_BUCKETS,
) -> Optional[RateEstimate]:
    """
    Estimate evaporation rate from pre-averaged bucket points.
    Returns None when fewer than min_points are available.
    """
    n = len(buckets)
    if n < min_points:
        return None

    t0 = buckets[0][0].timestamp()
    xs = [(ts.timestamp() - t0) / 3600.0 for ts, _ in buckets]
    ys = [mass for _, mass in buckets]

    n_f = float(n)
    sum_x = sum(xs)
    sum_y = sum(ys)
    sum_xy = sum(x * y for x, y in zip(xs, ys))
    sum_x2 = sum(x * x for x in xs)

    denom = n_f * sum_x2 - sum_x**2
    if abs(denom) < 1e-12:
        return None

    slope = (n_f * sum_xy - sum_x * sum_y) / denom
    intercept = (sum_y - slope * sum_x) / n_f

    y_mean = sum_y / n_f
    ss_tot = sum((y - y_mean) ** 2 for y in ys)
    if ss_tot < 1e-12:
        r_sq = 1.0
    else:
        ss_res = sum((y - (slope * x + intercept)) ** 2 for x, y in zip(xs, ys))
        r_sq = 1.0 - ss_res / ss_tot

    return RateEstimate(
        rate_kg_per_h=round(slope, 8),
        loss_rate_kg_per_h=round(max(0.0, -slope), 8),
        n_points=n,
        r_squared=round(r_sq, 6),
    )


# ─────────────────────────────────────────────────────────────
# 4. State-machine step
# ─────────────────────────────────────────────────────────────


def step_state_machine(
    baseline_mass_kg: float,
    new_mass_kg: float,
    current_state: LidState,
    open_counter: int,
    closed_counter: int,
    refill_detected: bool,
    cfg: DeviceConfig,
) -> StateMachineStep:
    """
    Advance the lid open/closed state machine by one reading using
    delta from an averaged window baseline (instead of immediate previous mass).

    Rules:
      • Refill → hold state, zero both counters.
      • Lid-open candidate (negative lid-band delta)  → increment open_counter, reset closed_counter.
      • Lid-close candidate (positive lid-band delta) → increment closed_counter, reset open_counter.
      • In-between zone                               → neither counter changes (hysteresis).
      • Counter ≥ consecutive_windows_for_state → flip state.

    Delta bands (from per-device DB config):
      • OPEN  candidate: -cfg.lid_weight_max_kg <= delta <= -cfg.lid_weight_min_kg
      • CLOSE candidate:  cfg.lid_weight_min_kg <= delta <=  cfg.lid_weight_max_kg

    Refill guard:
      • Any positive delta >= cfg.refill_threshold_kg is treated as refill-like
        and does not contribute to lid-close counting.
    """
    if refill_detected:
        logger.info(
            "Refill detected for device=%s — holding state, resetting counters.",
            cfg.device_code,
        )
        return StateMachineStep(
            previous_state=current_state,
            new_state=current_state,
            open_counter=0,
            closed_counter=0,
            state_changed=False,
            refill_detected=True,
        )

    delta_kg = new_mass_kg - baseline_mass_kg
    cap = cfg.consecutive_windows_for_state + 10  # soft cap to prevent overflow

    open_candidate = (-cfg.lid_weight_max_kg) <= delta_kg <= (-cfg.lid_weight_min_kg)
    close_candidate = cfg.lid_weight_min_kg <= delta_kg <= cfg.lid_weight_max_kg
    # Treat as refill-like only when the jump exceeds the lid band.
    # This prevents small lid-close deltas (e.g., 0.3–0.7 kg) from being
    # filtered out when refill_threshold_kg is configured near the lid range.
    refill_like_jump = (
        delta_kg >= cfg.refill_threshold_kg and delta_kg > cfg.lid_weight_max_kg
    )

    if open_candidate:
        open_counter = min(open_counter + 1, cap)
        closed_counter = 0
    elif close_candidate and not refill_like_jump:
        closed_counter = min(closed_counter + 1, cap)
        open_counter = 0
    # else: hysteresis / ambiguous zone — neither counter changes

    new_state = current_state

    if (
        open_counter >= cfg.consecutive_windows_for_state
        and current_state != LidState.OPEN
    ):
        new_state = LidState.OPEN
    elif (
        closed_counter >= cfg.consecutive_windows_for_state
        and current_state != LidState.CLOSED
    ):
        new_state = LidState.CLOSED

    return StateMachineStep(
        previous_state=current_state,
        new_state=new_state,
        open_counter=open_counter,
        closed_counter=closed_counter,
        state_changed=(new_state != current_state),
        refill_detected=False,
    )


# ─────────────────────────────────────────────────────────────
# 5. Transient spike detection  (Case B)
# ─────────────────────────────────────────────────────────────


def detect_transient_spike(
    window: list[tuple[datetime, float]],
    new_ts: datetime,
    new_mass_kg: float,
    cfg: DeviceConfig,
) -> bool:
    """
    Detect a place-and-remove event (Case B).

    Pattern: within the last *cfg.spike_max_duration_s* seconds the mass
    rose by ≥ cfg.spike_tolerance_kg above a baseline and then fell back
    to approximately the baseline (V-shape).

    If True the consumer should:
      • NOT treat the preceding rise as a refill.
      • Remove the affected spike points from the rolling window.
    """
    if not window:
        return False

    cutoff = new_ts - timedelta(seconds=cfg.spike_max_duration_s)
    recent = [(ts, m) for ts, m in window if ts >= cutoff]

    if len(recent) < 2:
        return False

    baseline = recent[0][1]
    peak = max(m for _, m in recent)
    rise = peak - baseline
    fall = peak - new_mass_kg

    # Both the rise and the fall must meet the tolerance for a V-shape.
    if rise >= cfg.spike_tolerance_kg and fall >= cfg.spike_tolerance_kg:
        # Additionally, the new reading must be approximately back at
        # baseline (within half the tolerance) — rules out a partial drop.
        if abs(new_mass_kg - baseline) < cfg.spike_tolerance_kg * 0.5:
            logger.info(
                "Transient spike detected (Case B): baseline=%.3f kg  peak=%.3f kg  "
                "current=%.3f kg  duration_s=%d  device context follows.",
                baseline,
                peak,
                new_mass_kg,
                cfg.spike_max_duration_s,
            )
            return True

    return False


# ─────────────────────────────────────────────────────────────
# 6. Weight-event classification  (Cases C, canister, product)
# ─────────────────────────────────────────────────────────────


def classify_weight_event(
    window: list[tuple[datetime, float]],
    new_mass_kg: float,
    cfg: DeviceConfig,
) -> WeightEventResult:
    """
    Classify the point-to-point delta between the newest window entry
    and the just-received reading.

    Returns a WeightEventResult with the classified type and raw delta.
    The caller decides what to do with each event type (log, flag, etc.).
    """
    if not window:
        return WeightEventResult(WeightEventType.NONE, 0.0)

    last_mass = window[-1][1]
    delta = new_mass_kg - last_mass

    # ── Case C: lid placement (+450 g – +650 g) ──────────────
    if cfg.lid_weight_min_kg <= delta <= cfg.lid_weight_max_kg:
        return WeightEventResult(WeightEventType.LID_CLOSE_CANDIDATE, round(delta, 6))

    # ── Canister removed (≈ −310 g) ──────────────────────────
    if abs(delta + cfg.canister_weight_kg) <= cfg.canister_tolerance_kg:
        return WeightEventResult(WeightEventType.CANISTER_REMOVED, round(delta, 6))

    # ── Canister added (≈ +310 g) ────────────────────────────
    if abs(delta - cfg.canister_weight_kg) <= cfg.canister_tolerance_kg:
        return WeightEventResult(WeightEventType.CANISTER_ADDED, round(delta, 6))

    # ── Product insertion / removal (< 80 g) ─────────────────
    if 0 < abs(delta) <= cfg.product_change_max_kg:
        return WeightEventResult(WeightEventType.PRODUCT_CHANGE, round(delta, 6))

    return WeightEventResult(WeightEventType.NONE, round(delta, 6))


# ─────────────────────────────────────────────────────────────
# 7. Lid-close candidate confirmation  (Case C vs D)
# ─────────────────────────────────────────────────────────────


def confirm_lid_close_candidate(
    window: list[tuple[datetime, float]],
    candidate_since: datetime,
    cfg: DeviceConfig,
) -> Optional[bool]:
    """
    After a LID_CLOSE_CANDIDATE event was flagged at *candidate_since*,
    check whether the weight has *stabilised* or is still climbing.

    Returns:
      True  — weight stabilised → lid close confirmed  (Case C)
      False — weight still rising → reject, was part of refill  (Case D)
      None  — not enough data yet; keep waiting
    """
    # Collect readings recorded AFTER the candidate was first detected.
    post_candidate = [(ts, m) for ts, m in window if ts > candidate_since]

    if len(post_candidate) < cfg.lid_confirm_stable_points:
        return None  # not enough data yet

    # Check if there is a significant upward trend in the confirmation
    # interval.  A rise ≥ 50 % of refill_threshold_kg means the weight
    # is still climbing (Case D — the jump was part of a refill).
    first_mass = post_candidate[0][1]
    last_mass = post_candidate[-1][1]
    rise = last_mass - first_mass

    if rise >= cfg.refill_threshold_kg * 0.5:
        logger.info(
            "Lid-close candidate REJECTED (Case D): post-jump rise=%.3f kg "
            "≥ threshold %.3f kg — weight still climbing, treating as refill.",
            rise,
            cfg.refill_threshold_kg * 0.5,
        )
        return False

    logger.info(
        "Lid-close candidate CONFIRMED (Case C): post-jump change=%.3f kg "
        "— weight is stable.",
        rise,
    )
    return True


# ─────────────────────────────────────────────────────────────
# 8. Low-level refill alert  (Step 5)
# ─────────────────────────────────────────────────────────────


def check_low_level_alert(
    ln2_mass_kg: float,
    current_consecutive: int,
    cfg: DeviceConfig,
) -> LowLevelCheck:
    """
    Track consecutive below-threshold readings and trigger an alert
    once the count reaches cfg.low_level_consecutive_readings.

    The caller persists *consecutive_count* to Redis so it survives
    across process restarts.

    At 30-second sampling, 10 consecutive readings ≈ 5 minutes, which
    filters out transient dips and sensor glitches.
    """
    is_below = ln2_mass_kg <= cfg.low_level_threshold_kg

    if is_below:
        new_count = current_consecutive + 1
    else:
        new_count = 0

    alert = new_count >= cfg.low_level_consecutive_readings

    if alert and new_count == cfg.low_level_consecutive_readings:
        # Log only on the exact threshold crossing, not every reading after.
        logger.warning(
            "LOW-LEVEL ALERT: LN2 mass %.3f kg ≤ threshold %.3f kg "
            "for %d consecutive readings.",
            ln2_mass_kg,
            cfg.low_level_threshold_kg,
            new_count,
        )

    return LowLevelCheck(
        is_below_threshold=is_below,
        consecutive_count=new_count,
        alert_triggered=alert,
    )


# ─────────────────────────────────────────────────────────────
# 9. Precaution advisory  (near threshold + lid open)
# ─────────────────────────────────────────────────────────────


def check_precaution_advisory(
    ln2_level_pct: float,
    lid_state: LidState,
    cfg: DeviceConfig,
) -> bool:
    """
    Returns True when the tank is near the low-level threshold AND the
    lid has just been opened.  The caller should send an advisory
    notification (separate from the main refill alert).

    This warns operators that opening a nearly-empty tank accelerates
    evaporation and may push it into the refill-alert zone.
    """
    return ln2_level_pct <= cfg.precaution_level_pct and lid_state == LidState.OPEN
