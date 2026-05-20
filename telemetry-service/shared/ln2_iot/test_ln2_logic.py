"""
tests/test_ln2_logic.py
────────────────────────
Unit tests for every fix applied.  No I/O required — all tested functions
are pure (ln2_logic.py).

Run with:  pytest -v tests/
"""

from __future__ import annotations

import pathlib
import sys
from datetime import datetime, timedelta, timezone

import pytest

sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))

from device_config import DeviceConfig
from ln2_logic import (
    LidState,
    LowLevelCheck,
    SensorStatus,
    WeightEventType,
    check_low_level_alert,
    check_precaution_advisory,
    classify_weight_event,
    confirm_lid_close_candidate,
    detect_refill,
    detect_transient_spike,
    estimate_rate,
    step_state_machine,
    validate_and_convert,
)

# ─────────────────────────────────────────────────────────────
# Shared test fixture — a realistic DeviceConfig
# ─────────────────────────────────────────────────────────────


def make_cfg(**overrides) -> DeviceConfig:
    """
    Build a DeviceConfig with sensible J12-equivalent defaults.
    Pass keyword args to override individual fields for edge-case tests.
    """
    defaults = dict(
        device_code="TEST-DEVICE-001",
        device_pk=1,
        tank_id=42,
        tank_code="TANK-TEST-042",
        empty_weight_kg=15.9,
        full_weight_kg=54.1,
        capacity_liters=47.3,  # maps to tanks.capacity_liters
        static_evap_rate_l_per_day=0.38,
        sensor_min_kg=13.9,
        sensor_max_kg=56.1,
        closed_noise_margin_kg_per_h=0.027,
        open_rate_min_kg_per_h=0.10,
        refill_threshold_kg=1.0,
        window_minutes=10,
        window_min_points=5,
        consecutive_windows_for_state=2,
    )
    defaults.update(overrides)
    return DeviceConfig(**defaults)


DEFAULT_CFG = make_cfg()

T0 = datetime(2024, 1, 1, 12, 0, 0, tzinfo=timezone.utc)


# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────


def _make_window(
    start: datetime,
    n: int,
    interval_s: float,
    rate_kg_per_h: float,
    start_mass: float = 20.0,
) -> list[tuple[datetime, float]]:
    pts = []
    for i in range(n):
        ts = start + timedelta(seconds=i * interval_s)
        mass = start_mass + rate_kg_per_h * (i * interval_s / 3600.0)
        pts.append((ts, max(0.0, mass)))
    return pts


# ─────────────────────────────────────────────────────────────
# Fix 5: Sensor validation — uses DeviceConfig bounds
# ─────────────────────────────────────────────────────────────


class TestSensorValidation:
    def test_normal_reading_ok(self):
        r = validate_and_convert(T0, 30.0, DEFAULT_CFG)
        assert r.status == SensorStatus.OK
        assert r.ln2_mass_kg == pytest.approx(
            30.0 - DEFAULT_CFG.empty_weight_kg, abs=0.001
        )

    def test_below_empty_flagged(self):
        r = validate_and_convert(T0, DEFAULT_CFG.sensor_min_kg - 0.5, DEFAULT_CFG)
        assert r.status == SensorStatus.BELOW_EMPTY
        assert r.ln2_mass_kg == 0.0

    def test_above_full_flagged(self):
        r = validate_and_convert(T0, DEFAULT_CFG.sensor_max_kg + 0.5, DEFAULT_CFG)
        assert r.status == SensorStatus.ABOVE_FULL

    def test_level_pct_bounds(self):
        r_empty = validate_and_convert(T0, DEFAULT_CFG.empty_weight_kg, DEFAULT_CFG)
        assert r_empty.ln2_level_pct == pytest.approx(0.0, abs=0.01)

        r_full = validate_and_convert(T0, DEFAULT_CFG.full_weight_kg, DEFAULT_CFG)
        assert r_full.ln2_level_pct == pytest.approx(100.0, abs=0.01)

    def test_different_tank_uses_its_own_bounds(self):
        """
        A heavier tank model has different sensor_min/max.
        A weight of 14.5 kg is above the default tank's sensor_min (13.9),
        so it reads OK there.  But a tank with sensor_min=38.0 should flag it
        as BELOW_EMPTY.
        """
        heavy_cfg = make_cfg(
            empty_weight_kg=40.0,
            full_weight_kg=120.0,
            sensor_min_kg=38.0,
            sensor_max_kg=122.0,
        )
        # weight=14.5 is valid (above 13.9) for the default light tank
        # but far below the heavy tank's sensor_min of 38.0
        r_light = validate_and_convert(T0, 14.5, DEFAULT_CFG)
        r_heavy = validate_and_convert(T0, 14.5, heavy_cfg)

        assert r_light.status == SensorStatus.OK
        assert r_heavy.status == SensorStatus.BELOW_EMPTY

    def test_silent_clamp_replaced_by_explicit_status(self):
        r = validate_and_convert(T0, DEFAULT_CFG.empty_weight_kg - 5.0, DEFAULT_CFG)
        assert r.status != SensorStatus.OK
        assert r.ln2_mass_kg == 0.0


# ─────────────────────────────────────────────────────────────
# Fix 1: Refill detection — threshold from DeviceConfig
# ─────────────────────────────────────────────────────────────


class TestRefillDetection:
    def test_refill_detected_on_large_increase(self):
        window = [(T0, 10.0)]
        assert detect_refill(window, 15.0, DEFAULT_CFG) is True

    def test_normal_evaporation_not_refill(self):
        window = [(T0, 20.0)]
        assert detect_refill(window, 19.9, DEFAULT_CFG) is False

    def test_small_increase_noise_not_refill(self):
        window = [(T0, 20.0)]
        assert detect_refill(window, 20.3, DEFAULT_CFG) is False

    def test_empty_window_no_refill(self):
        assert detect_refill([], 20.0, DEFAULT_CFG) is False

    def test_custom_refill_threshold_respected(self):
        """A device configured with a 3 kg threshold should not trigger on a 2 kg jump."""
        sensitive_cfg = make_cfg(refill_threshold_kg=3.0)
        window = [(T0, 20.0)]
        assert detect_refill(window, 22.5, sensitive_cfg) is False  # 2.5 < 3.0
        assert detect_refill(window, 23.5, sensitive_cfg) is True  # 3.5 >= 3.0


# ─────────────────────────────────────────────────────────────
# Fix 2: Rate estimation — window_min_points from DeviceConfig
# ─────────────────────────────────────────────────────────────


class TestRateEstimation:
    def test_clean_evaporation_rate_correct(self):
        target = -DEFAULT_CFG.open_rate_min_kg_per_h
        window = _make_window(T0, n=30, interval_s=60, rate_kg_per_h=target)
        est = estimate_rate(window, DEFAULT_CFG)
        assert est is not None
        assert est.rate_kg_per_h == pytest.approx(target, abs=0.001)
        assert est.r_squared > 0.999

    def test_returns_none_below_min_points(self):
        window = _make_window(T0, n=2, interval_s=60, rate_kg_per_h=-0.1)
        assert estimate_rate(window, DEFAULT_CFG) is None

    def test_custom_min_points_respected(self):
        """A device with window_min_points=10 should return None for 8 points."""
        strict_cfg = make_cfg(window_min_points=10)
        window = _make_window(T0, n=8, interval_s=60, rate_kg_per_h=-0.1)
        assert estimate_rate(window, strict_cfg) is None
        window_10 = _make_window(T0, n=10, interval_s=60, rate_kg_per_h=-0.1)
        assert estimate_rate(window_10, strict_cfg) is not None

    def test_noise_resilience(self):
        true_rate = -0.15
        window = _make_window(T0, n=60, interval_s=60, rate_kg_per_h=true_rate)
        noisy = [
            (ts, m + (0.05 if i % 2 == 0 else -0.05))
            for i, (ts, m) in enumerate(window)
        ]
        est = estimate_rate(noisy, DEFAULT_CFG)
        assert est is not None
        assert abs(est.rate_kg_per_h - true_rate) < abs(true_rate) * 0.10

    def test_first_last_endpoint_vs_regression(self):
        true_rate = -0.10
        window = _make_window(T0, n=30, interval_s=60, rate_kg_per_h=true_rate)
        spiked = list(window)
        ts_last, _ = spiked[-1]
        spiked[-1] = (ts_last, spiked[0][1] + 5.0)

        old_rate = (spiked[-1][1] - spiked[0][1]) / (
            (spiked[-1][0] - spiked[0][0]).total_seconds() / 3600.0
        )
        est = estimate_rate(spiked, DEFAULT_CFG)
        assert est is not None
        assert old_rate > 5.0
        assert abs(est.rate_kg_per_h - true_rate) < abs(old_rate - true_rate)


# ─────────────────────────────────────────────────────────────
# Fix 3 + thresholds: State machine uses DeviceConfig values
# ─────────────────────────────────────────────────────────────


class TestStateMachineCounters:
    def _open_rate_est(self, cfg=None):
        cfg = cfg or DEFAULT_CFG
        window = _make_window(T0, 30, 60, -(cfg.open_rate_min_kg_per_h + 0.05))
        return estimate_rate(window, cfg)

    def _closed_rate_est(self, cfg=None):
        cfg = cfg or DEFAULT_CFG
        window = _make_window(T0, 30, 60, -cfg.static_evap_kg_per_hour)
        return estimate_rate(window, cfg)

    def test_does_not_flip_on_first_open_window(self):
        step = step_state_machine(
            previous_mass_kg=20.0,
            new_mass_kg=20.0 - DEFAULT_CFG.lid_weight_min_kg,
            current_state=LidState.UNKNOWN,
            open_counter=0,
            closed_counter=0,
            refill_detected=False,
            cfg=DEFAULT_CFG,
        )
        assert step.new_state == LidState.UNKNOWN
        assert step.open_counter == 1

    def test_flips_after_consecutive_windows(self):
        state = LidState.UNKNOWN
        open_c = 0
        closed_c = 0
        for _ in range(DEFAULT_CFG.consecutive_windows_for_state):
            step = step_state_machine(
                previous_mass_kg=20.0,
                new_mass_kg=20.0 - DEFAULT_CFG.lid_weight_min_kg,
                current_state=state,
                open_counter=open_c,
                closed_counter=closed_c,
                refill_detected=False,
                cfg=DEFAULT_CFG,
            )
            state = step.new_state
            open_c = step.open_counter
            closed_c = step.closed_counter
        assert state == LidState.OPEN

    def test_refill_resets_counters_and_holds_state(self):
        step = step_state_machine(
            previous_mass_kg=20.0,
            new_mass_kg=19.4,
            current_state=LidState.OPEN,
            open_counter=5,
            closed_counter=0,
            refill_detected=True,
            cfg=DEFAULT_CFG,
        )
        assert step.new_state == LidState.OPEN
        assert step.open_counter == 0
        assert step.closed_counter == 0

    def test_in_between_zone_holds_counters(self):
        # Delta outside both lid bands should keep counters unchanged.
        # Use a value between product noise and lid threshold.
        step = step_state_machine(
            previous_mass_kg=20.0,
            new_mass_kg=20.0 - (DEFAULT_CFG.lid_weight_min_kg * 0.5),
            current_state=LidState.UNKNOWN,
            open_counter=1,
            closed_counter=1,
            refill_detected=False,
            cfg=DEFAULT_CFG,
        )
        assert step.open_counter == 1
        assert step.closed_counter == 1

    def test_different_devices_use_their_own_thresholds(self):
        """
        Device A (lid_weight_min=0.60): a -0.55 kg drop should NOT trigger open.
        Device B (lid_weight_min=0.50): the same drop SHOULD trigger open.
        """
        cfg_a = make_cfg(lid_weight_min_kg=0.60, consecutive_windows_for_state=1)
        cfg_b = make_cfg(lid_weight_min_kg=0.50, consecutive_windows_for_state=1)

        prev_mass = 20.0
        new_mass = 19.45  # delta = -0.55

        step_a = step_state_machine(
            previous_mass_kg=prev_mass,
            new_mass_kg=new_mass,
            current_state=LidState.UNKNOWN,
            open_counter=0,
            closed_counter=0,
            refill_detected=False,
            cfg=cfg_a,
        )
        step_b = step_state_machine(
            previous_mass_kg=prev_mass,
            new_mass_kg=new_mass,
            current_state=LidState.UNKNOWN,
            open_counter=0,
            closed_counter=0,
            refill_detected=False,
            cfg=cfg_b,
        )

        # Device A: abs(delta)=0.55 < 0.60 → not enough for open
        assert step_a.new_state != LidState.OPEN

        # Device B: abs(delta)=0.55 >= 0.50 and <= lid_weight_max → open
        assert step_b.new_state == LidState.OPEN


# ─────────────────────────────────────────────────────────────
# Fix 4: Thresholds derived from static evap rate
# ─────────────────────────────────────────────────────────────


class TestThresholds:
    def test_closed_threshold_above_static_evap(self):
        assert (
            DEFAULT_CFG.closed_rate_max_kg_per_h > DEFAULT_CFG.static_evap_kg_per_hour
        )
        assert DEFAULT_CFG.closed_rate_max_kg_per_h < DEFAULT_CFG.open_rate_min_kg_per_h

    def test_static_evap_classified_as_closed(self):
        window = _make_window(T0, 30, 60, -DEFAULT_CFG.static_evap_kg_per_hour)
        rate = estimate_rate(window, DEFAULT_CFG)
        assert rate is not None
        assert rate.loss_rate_kg_per_h <= DEFAULT_CFG.closed_rate_max_kg_per_h

    def test_higher_static_evap_tank_shifts_thresholds(self):
        """
        A tank with worse insulation (higher static evap) should have a
        proportionally higher closed_rate_max threshold.
        """
        old_tank_cfg = make_cfg(static_evap_rate_l_per_day=1.0)  # degraded insulation
        assert (
            old_tank_cfg.closed_rate_max_kg_per_h > DEFAULT_CFG.closed_rate_max_kg_per_h
        )

    def test_derived_properties_are_correct(self):
        cfg = make_cfg(
            empty_weight_kg=15.9,
            full_weight_kg=54.1,
            static_evap_rate_l_per_day=0.38,
            closed_noise_margin_kg_per_h=0.027,
        )
        assert cfg.ln2_max_mass_kg == pytest.approx(38.2, abs=0.01)
        # static_evap_kg_per_hour = 0.38 * 0.808 / 24 ≈ 0.01279
        assert cfg.static_evap_kg_per_hour == pytest.approx(0.38 * 0.808 / 24, abs=1e-5)
        assert cfg.closed_rate_max_kg_per_h == pytest.approx(
            cfg.static_evap_kg_per_hour + 0.027, abs=1e-6
        )


# ─────────────────────────────────────────────────────────────
# Transient spike detection (Case B)
# ─────────────────────────────────────────────────────────────


class TestTransientSpikeDetection:
    def test_classic_v_shape_detected(self):
        """Place +1 kg at t=30, remove at t=60 → spike."""
        window = [
            (T0, 20.0),
            (T0 + timedelta(seconds=30), 21.0),  # spike peak
        ]
        # New reading returns to baseline
        assert (
            detect_transient_spike(
                window, T0 + timedelta(seconds=60), 20.0, DEFAULT_CFG
            )
            is True
        )

    def test_normal_increase_not_spike(self):
        """Steady rise is not a spike."""
        window = [
            (T0, 20.0),
            (T0 + timedelta(seconds=30), 20.5),
        ]
        assert (
            detect_transient_spike(
                window, T0 + timedelta(seconds=60), 21.0, DEFAULT_CFG
            )
            is False
        )

    def test_partial_drop_not_spike(self):
        """Rise of 1 kg but only drops 0.3 kg — not a V-shape."""
        window = [
            (T0, 20.0),
            (T0 + timedelta(seconds=30), 21.0),
        ]
        # Only dropped to 20.7, still 0.7 above baseline → not full V-shape
        assert (
            detect_transient_spike(
                window, T0 + timedelta(seconds=60), 20.7, DEFAULT_CFG
            )
            is False
        )

    def test_empty_window_no_spike(self):
        assert detect_transient_spike([], T0, 20.0, DEFAULT_CFG) is False

    def test_spike_outside_duration_window_not_detected(self):
        """Spike older than spike_max_duration_s is ignored."""
        cfg = make_cfg(spike_max_duration_s=30)
        window = [
            (T0, 20.0),
            (T0 + timedelta(seconds=15), 21.0),  # peak
        ]
        # New reading arrives 60s after the peak — outside the 30s window.
        # The baseline point (T0) is also outside the window.
        assert (
            detect_transient_spike(window, T0 + timedelta(seconds=75), 20.0, cfg)
            is False
        )


# ─────────────────────────────────────────────────────────────
# Weight-event classification (Cases C, canister, product)
# ─────────────────────────────────────────────────────────────


class TestWeightEventClassification:
    def test_lid_close_candidate(self):
        """Delta of +540 g (in 450-650 range) → LID_CLOSE_CANDIDATE."""
        window = [(T0, 20.0)]
        result = classify_weight_event(window, 20.54, DEFAULT_CFG)
        assert result.event_type == WeightEventType.LID_CLOSE_CANDIDATE
        assert result.delta_kg == pytest.approx(0.54, abs=0.001)

    def test_canister_removed(self):
        """Drop of ~310 g → CANISTER_REMOVED."""
        window = [(T0, 20.0)]
        result = classify_weight_event(window, 19.69, DEFAULT_CFG)
        assert result.event_type == WeightEventType.CANISTER_REMOVED

    def test_canister_added(self):
        """Increase of ~310 g → CANISTER_ADDED."""
        window = [(T0, 20.0)]
        result = classify_weight_event(window, 20.31, DEFAULT_CFG)
        assert result.event_type == WeightEventType.CANISTER_ADDED

    def test_product_change(self):
        """Small change (< 80 g) → PRODUCT_CHANGE."""
        window = [(T0, 20.0)]
        result = classify_weight_event(window, 20.05, DEFAULT_CFG)
        assert result.event_type == WeightEventType.PRODUCT_CHANGE

    def test_large_change_none(self):
        """Large change (> 650 g, not canister) → NONE."""
        window = [(T0, 20.0)]
        result = classify_weight_event(window, 22.0, DEFAULT_CFG)
        assert result.event_type == WeightEventType.NONE

    def test_empty_window_none(self):
        result = classify_weight_event([], 20.0, DEFAULT_CFG)
        assert result.event_type == WeightEventType.NONE

    def test_zero_change_none(self):
        """Exactly 0 delta → NONE (not product change)."""
        window = [(T0, 20.0)]
        result = classify_weight_event(window, 20.0, DEFAULT_CFG)
        assert result.event_type == WeightEventType.NONE


# ─────────────────────────────────────────────────────────────
# Lid-close candidate confirmation (Case C vs D)
# ─────────────────────────────────────────────────────────────


class TestLidCloseConfirmation:
    def test_stable_after_jump_confirms_lid_close(self):
        """Case C: jump then stable → confirmed."""
        candidate_ts = T0
        # 4 stable readings after the candidate
        window = [(T0 + timedelta(seconds=30 * i), 20.5) for i in range(1, 6)]
        result = confirm_lid_close_candidate(window, candidate_ts, DEFAULT_CFG)
        assert result is True

    def test_continued_rise_rejects_candidate(self):
        """Case D: jump then continued rise → rejected (refill)."""
        candidate_ts = T0
        # Readings keep climbing after the jump
        window = [(T0 + timedelta(seconds=30 * i), 20.5 + 0.3 * i) for i in range(1, 6)]
        result = confirm_lid_close_candidate(window, candidate_ts, DEFAULT_CFG)
        assert result is False

    def test_not_enough_data_returns_none(self):
        """Not enough points yet → None."""
        candidate_ts = T0
        window = [
            (T0 + timedelta(seconds=30), 20.5),
        ]
        result = confirm_lid_close_candidate(window, candidate_ts, DEFAULT_CFG)
        assert result is None


# ─────────────────────────────────────────────────────────────
# Low-level refill alert (Step 5)
# ─────────────────────────────────────────────────────────────


class TestLowLevelAlert:
    def test_below_threshold_increments_counter(self):
        result = check_low_level_alert(3.0, 0, DEFAULT_CFG)
        assert result.is_below_threshold is True
        assert result.consecutive_count == 1
        assert result.alert_triggered is False

    def test_above_threshold_resets_counter(self):
        result = check_low_level_alert(10.0, 5, DEFAULT_CFG)
        assert result.is_below_threshold is False
        assert result.consecutive_count == 0
        assert result.alert_triggered is False

    def test_alert_triggers_at_threshold(self):
        cfg = make_cfg(low_level_consecutive_readings=3)
        r1 = check_low_level_alert(3.0, 0, cfg)
        r2 = check_low_level_alert(3.0, r1.consecutive_count, cfg)
        r3 = check_low_level_alert(3.0, r2.consecutive_count, cfg)
        assert r1.alert_triggered is False
        assert r2.alert_triggered is False
        assert r3.alert_triggered is True

    def test_custom_threshold_respected(self):
        cfg = make_cfg(low_level_threshold_kg=10.0)
        result = check_low_level_alert(9.0, 0, cfg)
        assert result.is_below_threshold is True


# ─────────────────────────────────────────────────────────────
# Precaution advisory (near threshold + lid open)
# ─────────────────────────────────────────────────────────────


class TestPrecautionAdvisory:
    def test_low_level_and_open_triggers(self):
        assert check_precaution_advisory(10.0, LidState.OPEN, DEFAULT_CFG) is True

    def test_low_level_but_closed_no_trigger(self):
        assert check_precaution_advisory(10.0, LidState.CLOSED, DEFAULT_CFG) is False

    def test_high_level_and_open_no_trigger(self):
        assert check_precaution_advisory(50.0, LidState.OPEN, DEFAULT_CFG) is False

    def test_custom_precaution_level(self):
        cfg = make_cfg(precaution_level_pct=25.0)
        assert check_precaution_advisory(20.0, LidState.OPEN, cfg) is True
        assert check_precaution_advisory(30.0, LidState.OPEN, cfg) is False
