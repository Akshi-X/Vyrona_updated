"""
CSV driver for CUSTOM_IOT LN2 simulation.

Reads a CSV of raw weights and simulates process_custom_iot_ln2 calculations
without Redis/DB. Prints payloads and computed quality_data for each row.
"""

import argparse
import csv
import json
import sys
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from shared.ln2_iot import config as ln2_config
from shared.ln2_iot.device_config import DeviceConfig
from shared.ln2_iot.ln2_logic import (
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


LN2_LEVEL_AVG_MINUTES = 10
REFILL_ANALYSIS_WINDOW_MINUTES = 5


def _parse_timestamp(value: str) -> str:
    """Return an ISO-8601 timestamp string from the CSV field."""
    # Pass through if already ISO-like
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return dt.isoformat()
    except ValueError:
        raise ValueError(f"Invalid timestamp '{value}'. Use ISO-8601.")


def _build_payload(device_id: str, timestamp_iso: str, weight_kg: float) -> dict:
    return {
        "deviceid": device_id,
        "timestamp": timestamp_iso,
        "payload": weight_kg,
        "source": "CUSTOM_IOT",
    }


def _load_device_config(config_path: str, device_id: str) -> DeviceConfig:
    with open(config_path, "r", encoding="utf-8") as handle:
        data = json.load(handle)

    data.setdefault("device_code", device_id)
    data.setdefault("device_pk", 0)
    data.setdefault("tank_id", 0)
    data.setdefault("tank_code", "SIM")

    required = [
        "empty_weight_kg",
        "full_weight_kg",
        "capacity_liters",
        "static_evap_rate_l_per_day",
        "closed_noise_margin_kg_per_h",
        "open_rate_min_kg_per_h",
        "refill_threshold_kg",
        "window_minutes",
        "window_min_points",
        "consecutive_windows_for_state",
    ]
    missing = [key for key in required if key not in data]
    if missing:
        raise ValueError(f"Missing config fields: {', '.join(missing)}")

    if "sensor_min_kg" not in data:
        data["sensor_min_kg"] = data["empty_weight_kg"] - ln2_config.SENSOR_FAULT_MARGIN_KG
    if "sensor_max_kg" not in data:
        data["sensor_max_kg"] = data["full_weight_kg"] + ln2_config.SENSOR_FAULT_MARGIN_KG

    return DeviceConfig(**data)


def _select_lid_weight(observed_delta: Optional[float], cfg: DeviceConfig) -> float:
    midpoint = (cfg.lid_weight_min_kg + cfg.lid_weight_max_kg) / 2.0
    if observed_delta is None:
        return midpoint
    if cfg.lid_weight_min_kg <= observed_delta <= cfg.lid_weight_max_kg:
        return observed_delta
    return midpoint


class Ln2Simulator:
    def __init__(self, cfg: DeviceConfig) -> None:
        self.cfg = cfg
        self.window_points: List[Tuple[datetime, float]] = []
        self.refill_points: List[Tuple[datetime, float]] = []
        self.rate_buckets: List[Tuple[datetime, float]] = []
        self.rate_bucket_state: Dict[str, Any] = {}
        self.state_data: Dict[str, Any] = {
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

    def _trim(self, points: List[Tuple[datetime, float]], max_len: int) -> None:
        if len(points) > max_len:
            del points[:-max_len]

    def append_window_point(self, timestamp: datetime, mass_kg: float) -> None:
        self.window_points.append((timestamp, round(mass_kg, 6)))
        self._trim(self.window_points, self.cfg.window_minutes * 60 + 120)

    def get_window_points(self, cutoff_ts: datetime) -> List[Tuple[datetime, float]]:
        return [(ts, m) for ts, m in self.window_points if ts >= cutoff_ts]

    def clear_window(self) -> None:
        self.window_points = []

    def remove_spike_points(self, spike_cutoff: datetime) -> None:
        self.window_points = [(ts, m) for ts, m in self.window_points if ts < spike_cutoff]

    def append_refill_point(self, timestamp: datetime, mass_kg: float) -> None:
        self.refill_points.append((timestamp, round(mass_kg, 6)))
        self._trim(self.refill_points, REFILL_ANALYSIS_WINDOW_MINUTES * 60 + 120)

    def get_refill_points(self, cutoff_ts: datetime) -> List[Tuple[datetime, float]]:
        return [(ts, m) for ts, m in self.refill_points if ts >= cutoff_ts]

    def clear_refill_window(self) -> None:
        self.refill_points = []

    def update_rate_bucket(self, timestamp: datetime, mass_kg: float) -> None:
        bucket_start = timestamp.replace(
            minute=(timestamp.minute // EVAP_RATE_BUCKET_MINUTES) * EVAP_RATE_BUCKET_MINUTES,
            second=0,
            microsecond=0,
        )
        state = self.rate_bucket_state
        if state.get("bucket_start") == bucket_start:
            state["sum_mass"] = float(state.get("sum_mass", 0.0)) + mass_kg
            state["count"] = int(state.get("count", 0)) + 1
            return

        if state.get("count"):
            prev_sum = float(state.get("sum_mass", 0.0))
            prev_count = int(state.get("count", 0))
            if prev_count > 0:
                avg_mass = prev_sum / prev_count
                self.rate_buckets.append((state["bucket_start"], round(avg_mass, 6)))

        self.rate_bucket_state = {
            "bucket_start": bucket_start,
            "sum_mass": mass_kg,
            "count": 1,
        }

        max_len = int((EVAP_RATE_WINDOW_HOURS * 60) / EVAP_RATE_BUCKET_MINUTES) + 24
        self._trim(self.rate_buckets, max_len)

    def get_rate_buckets(self, cutoff_ts: datetime) -> List[Tuple[datetime, float]]:
        return [(ts, m) for ts, m in self.rate_buckets if ts >= cutoff_ts]

    def clear_rate_buckets(self) -> None:
        self.rate_buckets = []
        self.rate_bucket_state = {}


def simulate_row(sim: Ln2Simulator, timestamp: datetime, weight_kg: float) -> Dict[str, Any]:
    cfg = sim.cfg
    sensor_reading = validate_and_convert(timestamp, weight_kg, cfg)

    # Sensor faults: return minimal quality data like live pipeline.
    if sensor_reading.status.value != "OK":
        return {
            "device_code": cfg.device_code,
            "tank_id": cfg.tank_id,
            "timestamp": timestamp.isoformat(),
            "sensor_status": sensor_reading.status.value,
            "ln2_level_pct": sensor_reading.ln2_level_pct,
        }

    cutoff_ts = timestamp - timedelta(minutes=cfg.window_minutes)
    window_points = sim.get_window_points(cutoff_ts)

    spike = detect_transient_spike(window_points, timestamp, sensor_reading.ln2_mass_kg, cfg)
    refill_detected = False

    if spike:
        spike_cutoff = timestamp - timedelta(seconds=cfg.spike_max_duration_s)
        sim.remove_spike_points(spike_cutoff)
        window_points = sim.get_window_points(cutoff_ts)
    else:
        refill_detected = detect_refill(window_points, sensor_reading.ln2_mass_kg, cfg)
        if refill_detected:
            sim.clear_window()
            sim.clear_rate_buckets()
            window_points = []

    weight_event = classify_weight_event(window_points, sensor_reading.ln2_mass_kg, cfg)

    sim.append_window_point(timestamp, sensor_reading.ln2_mass_kg)
    window_points = sim.get_window_points(cutoff_ts)

    smoothed_mass_kg, smoothed_level_pct, smoothed_volume_l = compute_smoothed_ln2(
        window_points,
        timestamp,
        cfg,
        avg_minutes=LN2_LEVEL_AVG_MINUTES,
    )

    state_data = sim.state_data
    current_state = LidState(state_data.get("current_state", "UNKNOWN"))
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

    if weight_event.event_type == WeightEventType.LID_CLOSE_CANDIDATE:
        lid_candidate_ts = timestamp.isoformat()

    if lid_candidate_ts is not None:
        candidate_dt = datetime.fromisoformat(lid_candidate_ts)
        confirmation = confirm_lid_close_candidate(window_points, candidate_dt, cfg)

        if confirmation is True:
            current_state = LidState.CLOSED
            open_ctr = 0
            closed_ctr = cfg.consecutive_windows_for_state
            lid_candidate_ts = None
        elif confirmation is False:
            lid_candidate_ts = None

    sim.update_rate_bucket(timestamp, sensor_reading.ln2_mass_kg)
    rate_cutoff = timestamp - timedelta(hours=EVAP_RATE_WINDOW_HOURS)
    rate_buckets = sim.get_rate_buckets(rate_cutoff)
    rate_estimate = estimate_rate_from_buckets(
        rate_buckets,
        min_points=EVAP_RATE_MIN_BUCKETS,
    )

    baseline_mass_kg = (
        sum(mass for _, mass in window_points[:-1]) / len(window_points[:-1])
        if len(window_points) >= 2
        else sensor_reading.ln2_mass_kg
    )
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

    if state_step.state_changed:
        if state_step.previous_state == LidState.CLOSED and state_step.new_state == LidState.OPEN:
            sim.clear_refill_window()
            observed_lid_drop = baseline_mass_kg - sensor_reading.ln2_mass_kg
            observed_lid_drop = observed_lid_drop if observed_lid_drop > 0 else None
            refill_lid_weight_kg = _select_lid_weight(observed_lid_drop, cfg)
            refill_active = True
            refill_start_ts = timestamp.isoformat()
            refill_last_updated = refill_start_ts

            adjusted_raw = sensor_reading.ln2_mass_kg + refill_lid_weight_kg
            adjusted_smoothed = smoothed_mass_kg + refill_lid_weight_kg
            refill_min_raw_kg = adjusted_raw
            refill_max_raw_kg = adjusted_raw
            refill_min_smoothed_kg = adjusted_smoothed
            refill_max_smoothed_kg = adjusted_smoothed

        if state_step.previous_state == LidState.OPEN and state_step.new_state == LidState.CLOSED and refill_active:
            observed_lid_gain = sensor_reading.ln2_mass_kg - baseline_mass_kg
            observed_lid_gain = observed_lid_gain if observed_lid_gain > 0 else None
            refill_lid_weight_kg = _select_lid_weight(observed_lid_gain, cfg)

            if refill_min_smoothed_kg is not None and refill_max_smoothed_kg is not None:
                refill_amount_kg = max(0.0, refill_max_smoothed_kg - refill_min_smoothed_kg)
                if refill_amount_kg >= cfg.refill_threshold_kg:
                    refill_event_triggered = True
                    refill_amount_l = refill_amount_kg / ln2_config.LN2_DENSITY_KG_PER_L
                    refill_event_start_ts = refill_start_ts
                    refill_event_end_ts = timestamp.isoformat()
                else:
                    refill_amount_kg = None

            refill_active = False
            refill_start_ts = None
            refill_lid_weight_kg = None
            refill_min_raw_kg = None
            refill_max_raw_kg = None
            refill_min_smoothed_kg = None
            refill_max_smoothed_kg = None
            refill_last_updated = timestamp.isoformat()
            sim.clear_refill_window()

        if state_step.new_state == LidState.OPEN:
            check_precaution_advisory(smoothed_level_pct, state_step.new_state, cfg)

    if current_state == LidState.OPEN and refill_active:
        refill_start_dt = (
            datetime.fromisoformat(refill_start_ts) if refill_start_ts else timestamp
        )
        refill_cutoff = max(
            refill_start_dt,
            timestamp - timedelta(minutes=REFILL_ANALYSIS_WINDOW_MINUTES),
        )
        refill_points = sim.get_refill_points(refill_cutoff)
        refill_spike = detect_transient_spike(
            refill_points,
            timestamp,
            sensor_reading.ln2_mass_kg,
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
                    raw_min if refill_min_raw_kg is None else min(refill_min_raw_kg, raw_min)
                )
                refill_max_raw_kg = (
                    raw_max if refill_max_raw_kg is None else max(refill_max_raw_kg, raw_max)
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
            refill_last_updated = timestamp.isoformat()

        sim.append_refill_point(timestamp, sensor_reading.ln2_mass_kg)

    low_level = check_low_level_alert(smoothed_mass_kg, low_level_ctr, cfg)
    low_level_ctr = low_level.consecutive_count
    low_level_alert_fired = False
    if low_level.alert_triggered and low_level.consecutive_count == cfg.low_level_consecutive_readings:
        low_level_alert_fired = True

    sim.state_data = {
        "current_state": current_state.value,
        "open_counter": open_ctr,
        "closed_counter": closed_ctr,
        "last_rate_kg_per_h": rate_estimate.rate_kg_per_h if rate_estimate else state_data.get("last_rate_kg_per_h"),
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
    }

    return {
        "device_code": cfg.device_code,
        "tank_code": cfg.tank_code,
        "tank_id": cfg.tank_id,
        "timestamp": timestamp.isoformat(),
        "raw_weight_kg": weight_kg,
        "ln2_mass_kg": smoothed_mass_kg,
        "ln2_level_pct": smoothed_level_pct,
        "ln2_volume_l": smoothed_volume_l,
        "sensor_status": sensor_reading.status.value,
        "evaporation_rate_kg_per_h": rate_estimate.loss_rate_kg_per_h if rate_estimate else None,
        "lid_state": current_state.value,
        "refill_detected": refill_detected,
        "refill_event": refill_event_triggered,
        "refill_amount_kg": refill_amount_kg,
        "refill_amount_l": refill_amount_l,
        "refill_start_ts": refill_event_start_ts,
        "refill_end_ts": refill_event_end_ts,
        "refill_active": refill_active,
        "weight_event": weight_event.event_type.value if weight_event.event_type != WeightEventType.NONE else None,
        "weight_event_delta_kg": weight_event.delta_kg if weight_event.event_type != WeightEventType.NONE else None,
        "transient_spike_ignored": spike,
        "low_level_alert": low_level_alert_fired,
        "quality_status": "Good",
    }


def run_csv(
    csv_path: str,
    device_id: str,
    config_path: str,
    weight_col: str,
    timestamp_col: Optional[str],
    start_time: Optional[str],
    interval_seconds: Optional[int],
) -> None:
    cfg = _load_device_config(config_path, device_id)
    simulator = Ln2Simulator(cfg)

    output_fields = [
        "deviceid",
        "timestamp",
        "payload",
        "source",
        "device_code",
        "tank_code",
        "tank_id",
        "raw_weight_kg",
        "ln2_mass_kg",
        "ln2_level_pct",
        "ln2_volume_l",
        "sensor_status",
        "evaporation_rate_kg_per_h",
        "lid_state",
        "refill_detected",
        "refill_event",
        "refill_amount_kg",
        "refill_amount_l",
        "refill_start_ts",
        "refill_end_ts",
        "refill_active",
        "weight_event",
        "weight_event_delta_kg",
        "transient_spike_ignored",
        "low_level_alert",
        "quality_status",
    ]

    writer = csv.DictWriter(sys.stdout, fieldnames=output_fields)
    writer.writeheader()

    with open(csv_path, newline="") as handle:
        reader = csv.DictReader(handle)
        if not reader.fieldnames:
            raise ValueError("CSV header is required.")

        if timestamp_col and timestamp_col not in reader.fieldnames:
            raise ValueError(f"Missing timestamp column '{timestamp_col}'.")
        if weight_col not in reader.fieldnames:
            raise ValueError(f"Missing weight column '{weight_col}'.")

        generated_ts = None
        if not timestamp_col:
            if not start_time or interval_seconds is None:
                raise ValueError(
                    "Provide --timestamp-col, or set --start-time and --interval-seconds."
                )
            generated_ts = datetime.fromisoformat(start_time.replace("Z", "+00:00"))

        row_count = 0
        for row in reader:
            row_count += 1
            weight_raw = row.get(weight_col)
            if weight_raw is None or weight_raw == "":
                continue

            weight_kg = float(weight_raw)

            if timestamp_col:
                timestamp_iso = _parse_timestamp(row[timestamp_col])
            else:
                timestamp_iso = generated_ts.isoformat()
                generated_ts = generated_ts + timedelta(seconds=interval_seconds)

            payload = _build_payload(device_id, timestamp_iso, weight_kg)
            quality_data = simulate_row(
                simulator,
                datetime.fromisoformat(timestamp_iso),
                weight_kg,
            )
            row = {**payload, **quality_data}
            writer.writerow(row)

        print(f"Simulated {row_count} rows from {csv_path}.")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Replay LN2 raw weights from CSV and print simulated quality_data"
    )
    parser.add_argument("--csv", required=True, help="Path to CSV file")
    parser.add_argument("--device-id", required=True, help="Device code")
    parser.add_argument("--config", required=True, help="Path to DeviceConfig JSON")
    parser.add_argument(
        "--weight-col",
        default="weight",
        help="Column name for raw weight in kg (default: weight)",
    )
    parser.add_argument(
        "--timestamp-col",
        default="timestamp",
        help="Column name for timestamp (default: timestamp)",
    )
    parser.add_argument(
        "--start-time",
        default=None,
        help="Start timestamp (ISO-8601) if no timestamp column is used",
    )
    parser.add_argument(
        "--interval-seconds",
        type=int,
        default=None,
        help="Interval seconds between generated timestamps",
    )

    args = parser.parse_args()

    timestamp_col = args.timestamp_col or None
    run_csv(
        csv_path=args.csv,
        device_id=args.device_id,
        config_path=args.config,
        weight_col=args.weight_col,
        timestamp_col=timestamp_col,
        start_time=args.start_time,
        interval_seconds=args.interval_seconds,
    )


if __name__ == "__main__":
    main()
