"""
consumer.py
───────────
Azure Event Hub consumer for LN2 tank monitoring.

Per-device calibration flow
────────────────────────────
  1. Each incoming event carries a device_code (external string ID).
  2. DeviceConfigCache.get(device_code) returns a DeviceConfig loaded from
     Postgres (tanks + ln2_iot_devices) and cached in Redis for
     REDIS_CONFIG_TTL_SECONDS (default 5 min).
  3. Every downstream call — validate_and_convert, detect_refill,
     estimate_rate, step_state_machine — receives the DeviceConfig so it
     uses the correct calibration for that specific tank and sensor.

This means a single consumer process correctly handles events from many
different tank types and devices simultaneously.
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

import asyncpg
import redis.asyncio as aioredis
from azure.eventhub.aio import EventHubConsumerClient

from . import config
from .db_repository import LN2Repository
from .device_config import DeviceConfig, DeviceConfigCache
from .ln2_logic import (
    LidState,
    SensorStatus,
    WeightEventType,
    check_low_level_alert,
    check_precaution_advisory,
    classify_weight_event,
    compute_smoothed_ln2,
    confirm_lid_close_candidate,
    detect_refill,
    detect_transient_spike,
    EVAP_RATE_BUCKET_MINUTES,
    EVAP_RATE_MIN_BUCKETS,
    EVAP_RATE_WINDOW_HOURS,
    estimate_rate_from_buckets,
    step_state_machine,
    validate_and_convert,
)
from .redis_state import RedisStateManager

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s – %(message)s",
)
logger = logging.getLogger("ln2_consumer")


# ─────────────────────────────────────────────────────────────
# Per-device evaluation throttle
# ─────────────────────────────────────────────────────────────
# State-machine evaluation is throttled per device so that
# "consecutive_windows_for_state" really means N window-width intervals.
# We store the last eval time in memory (cheap; worst case = one extra
# early eval on restart, which is acceptable).
_last_eval: dict[str, datetime] = {}


# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────


def _parse_timestamp(ts_str: str) -> datetime:
    """Parse ISO-8601 timestamp, always returning a UTC-aware datetime."""
    dt = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _window_cutoff(now: datetime, cfg: DeviceConfig) -> datetime:
    """Return the oldest timestamp to include in the rolling window."""
    return now - timedelta(minutes=cfg.window_minutes)


# ─────────────────────────────────────────────────────────────
# Main event handler
# ─────────────────────────────────────────────────────────────


async def handle_event(
    event_body: str,
    rsm: RedisStateManager,
    repo: LN2Repository,
    cfg_cache: DeviceConfigCache,
) -> None:
    """
    Process one Event Hub message end-to-end.

    Separated from the Azure SDK callback so it can be unit-tested
    without a live Event Hub connection.
    """

    # ── 1. Parse payload ──────────────────────────────────────
    try:
        msg: dict = json.loads(event_body)
    except json.JSONDecodeError:
        logger.error("Non-JSON payload: %s", event_body[:200])
        return

    ts_str: Optional[str] = msg.get("timestamp")
    weight_kg_raw = msg.get("weight_kg")
    device_code: Optional[str] = msg.get("device_id")

    if ts_str is None or weight_kg_raw is None or device_code is None:
        logger.warning("Missing required fields in payload: %s", msg)
        return

    try:
        weight_kg = float(weight_kg_raw)
    except (TypeError, ValueError):
        logger.error(
            "Non-numeric weight_kg '%s' for device %s", weight_kg_raw, device_code
        )
        return

    ts = _parse_timestamp(ts_str)

    # ── 2. Load calibration config ────────────────────────────
    # Redis-cached (5 min TTL), falls back to Postgres on miss.
    cfg = await cfg_cache.get(device_code)
    if cfg is None:
        # Device not registered in ln2_iot_devices — nothing we can compute.
        logger.warning("Skipping event from unregistered device_code=%s", device_code)
        return

    # ── 3. Validate sensor reading using device-specific bounds ─
    reading = validate_and_convert(ts, weight_kg, cfg)

    if reading.status != SensorStatus.OK:
        logger.warning(
            "Sensor fault %s for device=%s — persisting raw, skipping rate/state.",
            reading.status,
            device_code,
        )
        await _persist_raw(repo, cfg, weight_kg, msg, ts)
        return

    logger.debug(
        "%s | device=%s tank=%d  W=%.2f kg  LN2=%.2f kg  %.1f L  %.1f%%",
        ts.isoformat(),
        device_code,
        cfg.tank_id,
        weight_kg,
        reading.ln2_mass_kg,
        reading.ln2_volume_l,
        reading.ln2_level_pct,
    )

    # ── 4. Transient spike detection (Case B) ───────────────
    #    Must run BEFORE refill detection — a V-shaped spike
    #    should not be mistaken for a refill.
    cutoff = _window_cutoff(ts, cfg)
    window_pts = await rsm.get_window_points(device_code, cutoff)

    spike = detect_transient_spike(window_pts, ts, reading.ln2_mass_kg, cfg)
    if spike:
        logger.info(
            "[SPIKE IGNORED] device=%s tank=%d at %s — place-and-remove detected, "
            "removing spike points from window.",
            device_code,
            cfg.tank_id,
            ts.isoformat(),
        )
        spike_cutoff = ts - timedelta(seconds=cfg.spike_max_duration_s)
        await rsm.remove_spike_points(device_code, spike_cutoff)
        # Re-fetch cleaned window (spike points removed)
        window_pts = await rsm.get_window_points(device_code, cutoff)
        # Do NOT treat this reading as refill — skip refill detection
        refill = False
    else:
        # ── 4b. Refill detection (before appending to window) ─
        refill = detect_refill(window_pts, reading.ln2_mass_kg, cfg)

        if refill:
            logger.info(
                "[REFILL] device=%s tank=%d at %s — clearing window.",
                device_code,
                cfg.tank_id,
                ts.isoformat(),
            )
            await rsm.clear_window(device_code)
            await rsm.clear_rate_buckets(device_code)
            window_pts = []

    # ── 4c. Weight-event classification (Cases C, canister, product) ─
    weight_event = classify_weight_event(window_pts, reading.ln2_mass_kg, cfg)
    if weight_event.event_type != WeightEventType.NONE:
        logger.info(
            "[WEIGHT EVENT] device=%s tank=%d  type=%s  delta=%.3f kg  at %s",
            device_code,
            cfg.tank_id,
            weight_event.event_type.value,
            weight_event.delta_kg,
            ts.isoformat(),
        )

    # ── 5. Append new point to rolling window ─────────────────
    await rsm.append_window_point(device_code, ts, reading.ln2_mass_kg, cfg)
    # Re-fetch (now includes the just-appended point)
    window_pts = await rsm.get_window_points(device_code, cutoff)

    smoothed_mass_kg, smoothed_level_pct, _smoothed_volume_l = compute_smoothed_ln2(
        window_pts,
        ts,
        cfg,
    )

    await rsm.update_rate_bucket(device_code, ts, reading.ln2_mass_kg)

    # ── 5b. Load persisted state (needed by multiple downstream steps) ─
    state_data = await rsm.get_device_state(device_code)
    current_state = LidState(state_data["current_state"])
    open_ctr = state_data["open_counter"]
    closed_ctr = state_data["closed_counter"]
    low_level_ctr = state_data["low_level_counter"]
    lid_candidate_ts = state_data["lid_candidate_since"]

    # ── 5c. Lid-close candidate tracking (Case C vs D) ────────
    if weight_event.event_type == WeightEventType.LID_CLOSE_CANDIDATE:
        # A jump in the lid-weight band was just detected — start tracking.
        lid_candidate_ts = ts.isoformat()
        logger.info(
            "[LID CANDIDATE] device=%s — lid-close candidate started at %s "
            "(confirming over next %d readings).",
            device_code,
            lid_candidate_ts,
            cfg.lid_confirm_stable_points,
        )

    if lid_candidate_ts is not None:
        candidate_dt = datetime.fromisoformat(lid_candidate_ts)
        confirmation = confirm_lid_close_candidate(window_pts, candidate_dt, cfg)

        if confirmation is True:
            # Case C confirmed — force CLOSED state immediately.
            logger.warning(
                "[LID CLOSE CONFIRMED] device=%s tank=%d at %s — "
                "lid weight band + stable → Lid_Status = CLOSED.",
                device_code,
                cfg.tank_id,
                ts.isoformat(),
            )
            current_state = LidState.CLOSED
            open_ctr = 0
            closed_ctr = cfg.consecutive_windows_for_state  # saturate
            lid_candidate_ts = None
        elif confirmation is False:
            # Case D — was refill, not lid close.
            logger.info(
                "[LID CANDIDATE REJECTED] device=%s — weight still rising, "
                "treating as refill.",
                device_code,
            )
            lid_candidate_ts = None
        # else: None — not enough data yet, keep waiting.

    # ── 6. Rate estimation + state machine (throttled) ────────
    now_utc = datetime.now(timezone.utc)
    last_eval = _last_eval.get(device_code)
    should_eval = last_eval is None or (now_utc - last_eval).total_seconds() >= 3600

    # Reuse last persisted evaporation rate between hourly recalculations.
    rate_for_db: Optional[float] = state_data["last_rate_kg_per_h"]

    if should_eval:
        _last_eval[device_code] = now_utc

        # Recalculate evaporation rate from 5-minute buckets over the daily window.
        rate_cutoff = ts - timedelta(hours=EVAP_RATE_WINDOW_HOURS)
        rate_buckets = await rsm.get_rate_buckets(device_code, rate_cutoff)
        rate_est = estimate_rate_from_buckets(
            rate_buckets,
            min_points=EVAP_RATE_MIN_BUCKETS,
        )

        if rate_est is not None:
            rate_for_db = rate_est.loss_rate_kg_per_h
            logger.info(
                "[RATE RECALC 1H] device=%s tank=%d  rate=%.4f kg/h (loss)  n=%d  R²=%.3f  "
                "thresholds: closed≤%.4f  open≥%.4f",
                device_code,
                cfg.tank_id,
                rate_est.loss_rate_kg_per_h,
                rate_est.n_points,
                rate_est.r_squared,
                cfg.closed_rate_max_kg_per_h,
                cfg.open_rate_min_kg_per_h,
            )

            # Advance state machine using point-to-point mass drop
            previous_mass_kg = (
                window_pts[-2][1] if len(window_pts) >= 2 else reading.ln2_mass_kg
            )
            step = step_state_machine(
                previous_mass_kg=previous_mass_kg,
                new_mass_kg=reading.ln2_mass_kg,
                current_state=current_state,
                open_counter=open_ctr,
                closed_counter=closed_ctr,
                refill_detected=refill,
                cfg=cfg,
            )
            current_state = step.new_state
            open_ctr = step.open_counter
            closed_ctr = step.closed_counter

            if step.state_changed:
                logger.warning(
                    "[STATE CHANGE] device=%s tank=%d  %s → %s  at %s",
                    device_code,
                    cfg.tank_id,
                    step.previous_state.value,
                    step.new_state.value,
                    ts.isoformat(),
                )
                # ── 6b. Precaution advisory (near threshold + lid just opened) ─
                if step.new_state == LidState.OPEN:
                    if check_precaution_advisory(
                        smoothed_level_pct, step.new_state, cfg
                    ):
                        logger.warning(
                            "[PRECAUTION] device=%s tank=%d — lid opened while "
                            "LN2 level %.1f%% ≤ precaution threshold %.1f%%.  "
                            "Advisory notification recommended.",
                            device_code,
                            cfg.tank_id,
                            smoothed_level_pct,
                            cfg.precaution_level_pct,
                        )
                        # TODO: send advisory notification via webhook / Event Hub

        else:
            logger.debug(
                "device=%s — not enough rate buckets yet (%d/%d), reusing last_rate=%s",
                device_code,
                len(rate_buckets),
                EVAP_RATE_MIN_BUCKETS,
                str(rate_for_db),
            )

    # ── 6c. Low-level alert check (Step 5) ────────────────────
    low_level = check_low_level_alert(
        smoothed_mass_kg,
        low_level_ctr,
        cfg,
    )
    low_level_ctr = low_level.consecutive_count

    if (
        low_level.alert_triggered
        and low_level.consecutive_count == cfg.low_level_consecutive_readings
    ):
        logger.warning(
            "[LOW-LEVEL ALERT] device=%s tank=%d — LN2 mass %.3f kg ≤ %.3f kg "
            "for %d consecutive readings.  Refill needed.",
            device_code,
            cfg.tank_id,
            smoothed_mass_kg,
            cfg.low_level_threshold_kg,
            low_level.consecutive_count,
        )
        # TODO: push refill alert to notification system

    # ── 6d. Persist updated state (all counters + candidate) ──
    await rsm.save_device_state(
        device_code=device_code,
        current_state=current_state.value,
        open_counter=open_ctr,
        closed_counter=closed_ctr,
        last_rate_kg_per_h=rate_for_db,
        last_updated=ts,
        low_level_counter=low_level_ctr,
        lid_candidate_since=lid_candidate_ts
        if isinstance(lid_candidate_ts, str)
        else (lid_candidate_ts.isoformat() if lid_candidate_ts else None),
    )

    # ── 7. Persist to PostgreSQL ──────────────────────────────
    await _persist_reading(repo, cfg, smoothed_level_pct, rate_for_db, ts)
    await _persist_raw(repo, cfg, weight_kg, msg, ts)


# ─────────────────────────────────────────────────────────────
# DB persistence helpers
# ─────────────────────────────────────────────────────────────


async def _persist_reading(
    repo: LN2Repository,
    cfg: DeviceConfig,
    ln2_level_pct: float,
    evap_rate: Optional[float],
    ts: datetime,
) -> None:
    try:
        row_id = await repo.upsert_ln2_reading(
            device_code=cfg.device_code,
            ln2_level_pct=ln2_level_pct,
            evaporation_rate_kg_per_h=evap_rate,
            reading_timestamp=ts,
        )
        logger.debug("ln2_readings row inserted id=%d", row_id)
    except Exception as exc:
        logger.error(
            "Failed to write ln2_readings for device=%s: %s", cfg.device_code, exc
        )


async def _persist_raw(
    repo: LN2Repository,
    cfg: DeviceConfig,
    weight_kg: float,
    full_payload: dict,
    ts: datetime,
) -> None:
    """
    Persist raw payload.  tank_id comes from the DeviceConfig (already
    resolved from ln2_iot_devices during cache load) — no extra DB round-trip.
    """
    try:
        row_id = await repo.insert_raw_data(
            tank_id=cfg.tank_id,
            device_code=cfg.device_code,
            raw_weight_kg=weight_kg,
            full_payload=full_payload,
            created_at=ts,
        )
        logger.debug("ln2_iot_raw_data row inserted id=%d", row_id)
    except Exception as exc:
        logger.error(
            "Failed to write ln2_iot_raw_data for device=%s: %s", cfg.device_code, exc
        )


# ─────────────────────────────────────────────────────────────
# Azure Event Hub wiring
# ─────────────────────────────────────────────────────────────


async def main() -> None:
    # ── Shared infrastructure ─────────────────────────────────
    redis_client = aioredis.Redis(
        host=config.REDIS_HOST,
        port=config.REDIS_PORT,
        db=config.REDIS_DB,
        password=config.REDIS_PASSWORD,
        decode_responses=True,
        socket_connect_timeout=5,
    )
    await redis_client.ping()

    pg_pool = await asyncpg.create_pool(dsn=config.PG_DSN, min_size=2, max_size=10)

    rsm = RedisStateManager()
    await rsm.connect()

    cfg_cache = DeviceConfigCache(redis=redis_client, pg=pg_pool)
    repo = LN2Repository(pg_pool)

    # ── Event handler closure ─────────────────────────────────
    async def on_event(partition_context, event):
        body = event.body_as_str()
        try:
            await handle_event(body, rsm, repo, cfg_cache)
        except Exception as exc:
            logger.exception("Unhandled error processing event: %s", exc)
        finally:
            await partition_context.update_checkpoint(event)

    # ── Start consuming ───────────────────────────────────────
    client = EventHubConsumerClient.from_connection_string(
        conn_str=config.EVENT_HUB_CONNECTION_STR,
        consumer_group=config.CONSUMER_GROUP,
    )

    logger.info(
        "Starting LN2 consumer (starting_position=%s) …",
        config.STARTING_POSITION,
    )

    try:
        async with client:
            await client.receive(
                on_event=on_event,
                starting_position=config.STARTING_POSITION,
            )
    finally:
        await rsm.close()
        await redis_client.aclose()
        await pg_pool.close()


if __name__ == "__main__":
    asyncio.run(main())
