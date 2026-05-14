#!/usr/bin/env python3
"""
LN2 IoT Test Driver (v2)
=========================
Standalone test driver for testing Telemetry Service Azure Function locally.
Simulates EventHub messages for both CUSTOM_IOT (LN2 weight) and Tive (IVF)
payload types without requiring actual EventHub infrastructure.

The driver dynamically creates test devices/tanks in the connected database,
executes test scenarios, and offers cleanup on exit. On subsequent runs it
can reuse previously created test devices.

Usage:
    # Interactive mode
    python test_ln2_driver.py

    # Run specific scenario
    python test_ln2_driver.py --scenario refill_event

    # Batch mode (all scenarios)
    python test_ln2_driver.py --batch

    # Setup test device only
    python test_ln2_driver.py --setup

    # Clean test data
    python test_ln2_driver.py --clean

    # Run Tive IVF scenarios
    python test_ln2_driver.py --scenario tive_normal_temp
"""

import argparse
import atexit
import json
import logging
import os
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


# ============================================================================
# Environment Setup
# ============================================================================


def setup_environment():
    """Configure environment variables for local testing."""
    env_path = Path(__file__).parent / ".env.test"
    if env_path.exists():
        try:
            from dotenv import load_dotenv
            load_dotenv(env_path)
            print(f"✓ Loaded config from {env_path}")
        except ImportError:
            print("⚠ python-dotenv not installed, using environment variables")
    else:
        os.environ.setdefault("DB_HOST", "localhost")
        os.environ.setdefault("DB_PORT", "5432")
        os.environ.setdefault("DB_NAME", "mgscale_dev")
        os.environ.setdefault("DB_USER", "postgres")
        os.environ.setdefault("DB_PASSWORD", "postgres")
        os.environ.setdefault("REDIS_HOST", "localhost")
        os.environ.setdefault("REDIS_PORT", "6379")
        os.environ.setdefault("REDIS_DB", "0")
        os.environ.setdefault(
            "EVENT_HUB_CONNECTION_STRING",
            "Endpoint=sb://dummy.servicebus.windows.net/",
        )
        os.environ.setdefault("EVENT_HUB_NAME", "dummy-eventhub")
        print("⚠ No .env.test found, using default environment configuration")


# Must run before project imports
setup_environment()

import azure.functions as func

project_root = Path(__file__).parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

from config import config
from shared.database import get_engine, get_session
from shared.redis_client import get_redis_client
from sqlalchemy import text
from TelemetryHook import main as telemetry_hook_main

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Constants from the LN2 processing pipeline
LN2_DENSITY_KG_PER_L = 0.808
SENSOR_FAULT_MARGIN_KG = 2.0

# Prefix for all test-created device codes (makes cleanup easy)
TEST_DEVICE_PREFIX = "LN2-TEST-"
TEST_TIVE_PREFIX = "TIVE-TEST-"


# ============================================================================
# EventHub Mock
# ============================================================================


class EventHubEventMock:
    """Mock implementation of func.EventHubEvent for local testing."""

    def __init__(
        self,
        payload_dict: Dict[str, Any],
        enqueued_time: Optional[datetime] = None,
    ):
        self._body = json.dumps(payload_dict).encode("utf-8")
        self.enqueued_time = enqueued_time or datetime.now(timezone.utc)
        self.partition_key = "test-partition-0"
        self.sequence_number = 1
        self.offset = "0"
        self.metadata = {}

    def get_body(self) -> bytes:
        return self._body


# ============================================================================
# Configuration Dataclasses
# ============================================================================


@dataclass
class TankConfig:
    """Physical tank specification used when creating a test tank."""
    tank_code: str = "T-TEST-01"
    empty_weight_kg: float = 15.9
    full_weight_kg: float = 54.1
    capacity_liters: float = 47.3
    static_evap_rate_l_per_day: float = 0.38
    status: str = "safe"


@dataclass
class CalibrationConfig:
    """LN2 IoT device calibration (ln2_iot_devices row)."""
    sensor_min_kg: float = 10.0
    sensor_max_kg: float = 100.0
    closed_noise_margin_kg_per_h: float = 0.005
    open_rate_min_kg_per_h: float = 0.05
    refill_threshold_kg: float = 5.0
    window_minutes: int = 1
    min_points: int = 3
    consecutive_windows: int = 1


@dataclass
class TestDeviceInfo:
    """Result of device setup — everything needed to generate payloads."""
    device_code: str
    device_pk: int
    tank_id: int
    tank_code: str
    branch_id: int
    tank: TankConfig
    calibration: CalibrationConfig

    # Derived helpers matching DeviceConfig properties
    @property
    def ln2_max_mass_kg(self) -> float:
        return self.tank.full_weight_kg - self.tank.empty_weight_kg

    @property
    def static_evap_kg_per_hour(self) -> float:
        return (self.tank.static_evap_rate_l_per_day * LN2_DENSITY_KG_PER_L) / 24.0

    @property
    def closed_rate_max_kg_per_h(self) -> float:
        return self.static_evap_kg_per_hour + self.calibration.closed_noise_margin_kg_per_h

    @property
    def weight_at_pct(self) -> "callable":
        """Return a function that converts LN2 level % → total weight on scale."""
        def _fn(pct: float) -> float:
            ln2_mass = (pct / 100.0) * self.ln2_max_mass_kg
            return self.tank.empty_weight_kg + ln2_mass
        return _fn


# ============================================================================
# Test Device Setup (Dynamic DB Provisioning)
# ============================================================================


class TestDeviceSetup:
    """
    Manages test device lifecycle in the connected database.

    On each run:
     1. Check for existing test devices (prefix LN2-TEST-).
     2. If found, offer to reuse or create a new one.
     3. Create device → tank → ln2_iot_devices mapping.
     4. On exit, offer to clean up created data.
    """

    def __init__(self):
        self._session_factory = get_session()

    # ────────────────── Query helpers ──────────────────

    def find_existing_test_devices(self) -> List[Dict[str, Any]]:
        """Return all devices whose device_code starts with the test prefix."""
        with self._session_factory() as session:
            rows = session.execute(
                text("""
                    SELECT d.id, d.device_code, d.branch_id,
                           lid.tank_id, t.tank_code
                    FROM devices d
                    LEFT JOIN ln2_iot_devices lid ON d.id = lid.device_id
                    LEFT JOIN tanks t ON lid.tank_id = t.tank_id
                    WHERE d.device_code LIKE :prefix
                    ORDER BY d.id
                """),
                {"prefix": f"{TEST_DEVICE_PREFIX}%"},
            ).fetchall()
            return [
                {
                    "device_pk": r[0],
                    "device_code": r[1],
                    "branch_id": r[2],
                    "tank_id": r[3],
                    "tank_code": r[4],
                }
                for r in rows
            ]

    def _get_default_branch_id(self) -> int:
        """Return the first available hospital_branches.id."""
        with self._session_factory() as session:
            row = session.execute(
                text("SELECT branch_id as id FROM hospital_branches ORDER BY id LIMIT 1")
            ).fetchone()
            if row is None:
                raise RuntimeError(
                    "No hospital branches found in DB. "
                    "Seed the database first (see DEVELOPER_SETUP_GUIDE)."
                )
            return row[0]

    def _next_device_code(self) -> str:
        """Generate the next sequential test device code."""
        existing = self.find_existing_test_devices()
        max_num = 0
        for d in existing:
            try:
                num = int(d["device_code"].replace(TEST_DEVICE_PREFIX, ""))
                max_num = max(max_num, num)
            except ValueError:
                pass
        return f"{TEST_DEVICE_PREFIX}{max_num + 1:03d}"

    # ────────────────── Create ──────────────────

    def create_test_device(
        self,
        device_code: Optional[str] = None,
        branch_id: Optional[int] = None,
        tank_cfg: Optional[TankConfig] = None,
        cal_cfg: Optional[CalibrationConfig] = None,
    ) -> TestDeviceInfo:
        """
        Create a full test device setup: device + tank + ln2_iot_devices mapping.
        Returns a TestDeviceInfo with all IDs populated.
        """
        device_code = device_code or self._next_device_code()
        branch_id = branch_id or self._get_default_branch_id()
        tank_cfg = tank_cfg or TankConfig()
        cal_cfg = cal_cfg or CalibrationConfig()

        # Derive a unique tank code from device code
        tank_code = f"T-{device_code}"
        tank_cfg.tank_code = tank_code

        with self._session_factory() as session:
            try:
                # 1. Insert device
                device_row = session.execute(
                    text("""
                        INSERT INTO devices (device_code, branch_id, created_at, updated_at)
                        VALUES (:code, :branch, NOW(), NOW())
                        RETURNING id
                    """),
                    {"code": device_code, "branch": branch_id},
                ).fetchone()
                device_pk = device_row[0]

                # 2. Insert tank
                tank_row = session.execute(
                    text("""
                        INSERT INTO tanks (
                            tank_code, branch_id, is_active, status,
                            empty_weight_kg, full_weight_kg, capacity_liters,
                            static_evap_rate_l_per_day, created_at, updated_at
                        )
                        VALUES (
                            :tank_code, :branch, true, :status,
                            :empty_w, :full_w, :cap,
                            :evap, NOW(), NOW()
                        )
                        RETURNING tank_id
                    """),
                    {
                        "tank_code": tank_code,
                        "branch": branch_id,
                        "status": tank_cfg.status,
                        "empty_w": tank_cfg.empty_weight_kg,
                        "full_w": tank_cfg.full_weight_kg,
                        "cap": tank_cfg.capacity_liters,
                        "evap": tank_cfg.static_evap_rate_l_per_day,
                    },
                ).fetchone()
                tank_id = tank_row[0]

                # 3. Insert ln2_iot_devices mapping
                session.execute(
                    text("""
                        INSERT INTO ln2_iot_devices (
                            device_id, tank_id,
                            tank_min_capacity_reading, tank_max_capacity_reading,
                            closed_noise_margin_kg_per_h, open_rate_min_kg_per_h,
                            refill_threshold_kg, window_minutes,
                            window_min_points, consecutive_windows_for_state,
                            created_at, updated_at
                        )
                        VALUES (
                            :dev, :tank,
                            :s_min, :s_max,
                            :noise, :open_rate,
                            :refill, :win_min,
                            :min_pts, :consec,
                            NOW(), NOW()
                        )
                    """),
                    {
                        "dev": device_pk,
                        "tank": tank_id,
                        "s_min": cal_cfg.sensor_min_kg,
                        "s_max": cal_cfg.sensor_max_kg,
                        "noise": cal_cfg.closed_noise_margin_kg_per_h,
                        "open_rate": cal_cfg.open_rate_min_kg_per_h,
                        "refill": cal_cfg.refill_threshold_kg,
                        "win_min": cal_cfg.window_minutes,
                        "min_pts": cal_cfg.min_points,
                        "consec": cal_cfg.consecutive_windows,
                    },
                )

                session.commit()

                info = TestDeviceInfo(
                    device_code=device_code,
                    device_pk=device_pk,
                    tank_id=tank_id,
                    tank_code=tank_code,
                    branch_id=branch_id,
                    tank=tank_cfg,
                    calibration=cal_cfg,
                )
                print(f"✓ Created test device: {device_code}")
                print(f"  device_id={device_pk}  tank_id={tank_id}  tank_code={tank_code}")
                return info

            except Exception as exc:
                session.rollback()
                raise RuntimeError(f"Failed to create test device: {exc}") from exc

    def load_device_info(self, device_code: str) -> Optional[TestDeviceInfo]:
        """Load full TestDeviceInfo for an existing test device."""
        with self._session_factory() as session:
            row = session.execute(
                text("""
                    SELECT
                        d.id, d.device_code, d.branch_id,
                        t.tank_id, t.tank_code,
                        t.empty_weight_kg, t.full_weight_kg,
                        t.capacity_liters, t.static_evap_rate_l_per_day,
                        t.status,
                        lid.tank_min_capacity_reading, lid.tank_max_capacity_reading,
                        lid.closed_noise_margin_kg_per_h, lid.open_rate_min_kg_per_h,
                        lid.refill_threshold_kg, lid.window_minutes,
                        lid.window_min_points, lid.consecutive_windows_for_state
                    FROM devices d
                    JOIN ln2_iot_devices lid ON d.id = lid.device_id
                    JOIN tanks t ON lid.tank_id = t.tank_id
                    WHERE d.device_code = :code
                """),
                {"code": device_code},
            ).fetchone()

            if row is None:
                return None

            tank_cfg = TankConfig(
                tank_code=row[4],
                empty_weight_kg=float(row[5] or 15.9),
                full_weight_kg=float(row[6] or 54.1),
                capacity_liters=float(row[7] or 47.3),
                static_evap_rate_l_per_day=float(row[8] or 0.38),
                status=row[9] or "safe",
            )
            cal_cfg = CalibrationConfig(
                sensor_min_kg=float(row[10] or 10.0),
                sensor_max_kg=float(row[11] or 100.0),
                closed_noise_margin_kg_per_h=float(row[12] or 0.005),
                open_rate_min_kg_per_h=float(row[13] or 0.05),
                refill_threshold_kg=float(row[14] or 5.0),
                window_minutes=int(row[15] or 1),
                min_points=int(row[16] or 3),
                consecutive_windows=int(row[17] or 1),
            )
            return TestDeviceInfo(
                device_code=row[1],
                device_pk=row[0],
                tank_id=row[3],
                tank_code=row[4],
                branch_id=row[2],
                tank=tank_cfg,
                calibration=cal_cfg,
            )

    # ────────────────── Cleanup ──────────────────

    def cleanup_device(self, device_code: str, *, delete_device: bool = True) -> None:
        """Remove all test data for a single device."""
        with self._session_factory() as session:
            try:
                dev_row = session.execute(
                    text("SELECT id FROM devices WHERE device_code = :c"),
                    {"c": device_code},
                ).fetchone()
                if dev_row is None:
                    print(f"  Device {device_code} not found — nothing to clean")
                    return
                dev_id = dev_row[0]

                # Get linked tank_id
                lid_row = session.execute(
                    text("SELECT tank_id FROM ln2_iot_devices WHERE device_id = :d"),
                    {"d": dev_id},
                ).fetchone()
                tank_id = lid_row[0] if lid_row else None

                # Delete readings / raw data
                r1 = session.execute(
                    text("DELETE FROM ln2_readings WHERE device_id = :d"),
                    {"d": dev_id},
                ).rowcount
                r2 = session.execute(
                    text("DELETE FROM ln2_iot_raw_data WHERE device_id = :d"),
                    {"d": dev_id},
                ).rowcount
                print(f"  ✓ Deleted {r1} ln2_readings, {r2} ln2_iot_raw_data rows")

                # Delete mapping
                session.execute(
                    text("DELETE FROM ln2_iot_devices WHERE device_id = :d"),
                    {"d": dev_id},
                )

                if delete_device:
                    session.execute(
                        text("DELETE FROM devices WHERE id = :d"),
                        {"d": dev_id},
                    )
                    if tank_id:
                        session.execute(
                            text("DELETE FROM tanks WHERE tank_id = :t"),
                            {"t": tank_id},
                        )
                    print(f"  ✓ Deleted device + tank records")

                session.commit()
            except Exception as exc:
                session.rollback()
                logger.error(f"Cleanup failed for {device_code}: {exc}")
                print(f"  ✗ Cleanup failed: {exc}")

    def cleanup_redis(self, device_code: str) -> None:
        """Remove Redis keys for a device."""
        redis = get_redis_client()
        keys = [
            f"ln2:{device_code}:window",
            f"ln2:{device_code}:state",
            f"ln2_quality_history:{device_code}",
            f"ln2:cfg:{device_code}",
        ]
        deleted = 0
        for k in keys:
            if redis.exists(k):
                redis.delete(k)
                deleted += 1
                print(f"  ✓ Deleted Redis key: {k}")
        if deleted == 0:
            print(f"  (no Redis keys found for {device_code})")

    def full_cleanup(self, device_code: str) -> None:
        """Clean database + Redis for a device."""
        print(f"\nCleaning up device: {device_code}")
        self.cleanup_redis(device_code)
        self.cleanup_device(device_code)

    # ────────────────── Interactive setup ──────────────────

    def interactive_setup(self) -> TestDeviceInfo:
        """
        Interactive device setup flow:
         • If existing test devices found → offer reuse
         • Otherwise → create new device with default or custom config
        """
        existing = self.find_existing_test_devices()

        if existing:
            print("\n── Existing test devices ──")
            for i, d in enumerate(existing, 1):
                linked = f"→ tank {d['tank_code']}" if d["tank_code"] else "(no tank)"
                print(f"  {i}. {d['device_code']}  {linked}")
            print(f"  N. Create new device")

            choice = input("\nSelect device (number) or N for new: ").strip()
            if choice.upper() != "N" and choice.isdigit():
                idx = int(choice) - 1
                if 0 <= idx < len(existing):
                    code = existing[idx]["device_code"]
                    info = self.load_device_info(code)
                    if info:
                        print(f"✓ Reusing device: {code}")
                        return info
                    else:
                        print(f"⚠ Could not load full config for {code} — creating new")

        # Create new device
        print("\n── Create New Test Device ──")
        use_defaults = input("Use default tank/calibration config? (Y/n): ").strip().lower()

        tank_cfg = TankConfig()
        cal_cfg = CalibrationConfig()

        if use_defaults not in ("", "y", "yes"):
            print("\nTank configuration:")
            tank_cfg.empty_weight_kg = _input_float("  empty_weight_kg", 15.9)
            tank_cfg.full_weight_kg = _input_float("  full_weight_kg", 54.1)
            tank_cfg.capacity_liters = _input_float("  capacity_liters", 47.3)
            tank_cfg.static_evap_rate_l_per_day = _input_float(
                "  static_evap_rate_l_per_day", 0.38
            )
            print("\nCalibration (ln2_iot_devices):")
            cal_cfg.sensor_min_kg = _input_float("  sensor_min_kg", 10.0)
            cal_cfg.sensor_max_kg = _input_float("  sensor_max_kg", 100.0)
            cal_cfg.refill_threshold_kg = _input_float("  refill_threshold_kg", 5.0)
            cal_cfg.window_minutes = int(_input_float("  window_minutes", 1))
            cal_cfg.min_points = int(_input_float("  min_points", 3))
            cal_cfg.consecutive_windows = int(_input_float("  consecutive_windows", 1))

        return self.create_test_device(tank_cfg=tank_cfg, cal_cfg=cal_cfg)


def _input_float(prompt: str, default: float) -> float:
    """Prompt for a float value with a default."""
    raw = input(f"{prompt} [{default}]: ").strip()
    if not raw:
        return default
    try:
        return float(raw)
    except ValueError:
        print(f"  Invalid number, using default {default}")
        return default


# ============================================================================
# LN2 (CUSTOM_IOT) Payload Generator
# ============================================================================


class LN2PayloadGenerator:
    """
    Generates realistic CUSTOM_IOT LN2 weight-sensor payloads.

    All weight values are derived from the TestDeviceInfo calibration so that
    tests exercise the exact thresholds the processing pipeline uses.
    """

    def __init__(self, device_info: TestDeviceInfo):
        self.info = device_info
        self.device_code = device_info.device_code

    def _make(self, weight_kg: float, ts: datetime) -> Dict[str, Any]:
        """Build a single EventHub-compatible CUSTOM_IOT payload dict."""
        return {
            "payload": {
                "source": "CUSTOM_IOT",
                "deviceid": self.device_code,
                "EntityName": self.device_code,
                "timestamp": ts.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
                "payload": round(weight_kg, 3),
            }
        }

    # ────── Normal operation scenarios ──────

    def generate_normal_closed_lid(self) -> List[Dict[str, Any]]:
        """
        Steady evaporation at the static rate (lid closed).
        Generates 20 readings at 30-second intervals.
        Rate is below closed_rate_max_kg_per_h so state machine should see CLOSED.
        """
        logger.info("Generating: Normal operation (lid closed)")
        start = datetime.now(timezone.utc)
        w_fn = self.info.weight_at_pct
        start_weight = w_fn(75.0)  # 75% full
        rate = self.info.static_evap_kg_per_hour  # kg/h

        payloads = []
        for i in range(20):
            ts = start + timedelta(seconds=i * 30)
            hours = (i * 30) / 3600.0
            weight = start_weight - (rate * hours)
            payloads.append(self._make(weight, ts))

        logger.info(
            f"  {len(payloads)} payloads: {start_weight:.3f} → {weight:.3f} kg  "
            f"(rate={rate:.4f} kg/h)"
        )
        return payloads

    def generate_normal_open_lid(self) -> List[Dict[str, Any]]:
        """
        Higher evaporation when lid is open.
        Rate exceeds open_rate_min_kg_per_h so state machine should flip to OPEN.
        """
        logger.info("Generating: Normal operation (lid open)")
        start = datetime.now(timezone.utc)
        w_fn = self.info.weight_at_pct
        start_weight = w_fn(65.0)
        # Use 2× open threshold to clearly trigger OPEN state
        rate = self.info.calibration.open_rate_min_kg_per_h * 2.0

        payloads = []
        for i in range(20):
            ts = start + timedelta(seconds=i * 30)
            hours = (i * 30) / 3600.0
            weight = start_weight - (rate * hours)
            payloads.append(self._make(weight, ts))

        logger.info(
            f"  {len(payloads)} payloads: {start_weight:.3f} → {weight:.3f} kg  "
            f"(rate={rate:.4f} kg/h)"
        )
        return payloads

    # ────── Refill scenario ──────

    def generate_refill_event(self) -> List[Dict[str, Any]]:
        """
        Pre-refill decline → sudden jump exceeding refill_threshold_kg → post-refill.
        """
        logger.info("Generating: Refill event")
        start = datetime.now(timezone.utc)
        w_fn = self.info.weight_at_pct
        pre_weight = w_fn(30.0)  # low level before refill
        post_weight = w_fn(90.0)  # high level after refill

        payloads = []

        # Phase 1: 10 readings of slow decline
        rate = self.info.static_evap_kg_per_hour
        for i in range(10):
            ts = start + timedelta(seconds=i * 30)
            hours = (i * 30) / 3600.0
            weight = pre_weight - (rate * hours)
            payloads.append(self._make(weight, ts))

        last_pre = weight

        # Phase 2: refill jump (exceeds refill_threshold_kg)
        refill_time = start + timedelta(seconds=10 * 30)
        payloads.append(self._make(post_weight, refill_time))
        logger.info(
            f"  Refill jump: {last_pre:.3f} → {post_weight:.3f} kg  "
            f"(delta={post_weight - last_pre:.1f} kg, threshold={self.info.calibration.refill_threshold_kg} kg)"
        )

        # Phase 3: 10 readings of slow decline after refill
        for i in range(10):
            ts = refill_time + timedelta(seconds=(i + 1) * 30)
            hours = ((i + 1) * 30) / 3600.0
            weight = post_weight - (rate * hours)
            payloads.append(self._make(weight, ts))

        logger.info(f"  {len(payloads)} payloads with refill event")
        return payloads

    # ────── Sensor fault scenarios ──────

    def generate_sensor_fault_below_empty(self) -> List[Dict[str, Any]]:
        """
        Weight drops below sensor_min_kg → SensorStatus.BELOW_EMPTY.
        """
        logger.info("Generating: Sensor fault (below empty)")
        start = datetime.now(timezone.utc)
        fault_weight = self.info.calibration.sensor_min_kg - 1.0

        payloads = []
        # A few normal readings first
        w_fn = self.info.weight_at_pct
        for i in range(5):
            ts = start + timedelta(seconds=i * 30)
            weight = w_fn(10.0) - (i * 0.05)
            payloads.append(self._make(weight, ts))

        # Fault readings
        for i in range(6):
            ts = start + timedelta(seconds=(5 + i) * 30)
            payloads.append(self._make(fault_weight - (i * 0.2), ts))

        logger.info(
            f"  {len(payloads)} payloads — fault weight={fault_weight:.1f} kg  "
            f"(sensor_min_kg={self.info.calibration.sensor_min_kg})"
        )
        return payloads

    def generate_sensor_fault_above_full(self) -> List[Dict[str, Any]]:
        """
        Weight exceeds sensor_max_kg → SensorStatus.ABOVE_FULL.
        """
        logger.info("Generating: Sensor fault (above full)")
        start = datetime.now(timezone.utc)
        fault_weight = self.info.calibration.sensor_max_kg + 1.0

        payloads = []
        w_fn = self.info.weight_at_pct
        for i in range(5):
            ts = start + timedelta(seconds=i * 30)
            weight = w_fn(95.0) + (i * 0.1)
            payloads.append(self._make(weight, ts))

        for i in range(6):
            ts = start + timedelta(seconds=(5 + i) * 30)
            payloads.append(self._make(fault_weight + (i * 0.2), ts))

        logger.info(
            f"  {len(payloads)} payloads — fault weight={fault_weight:.1f} kg  "
            f"(sensor_max_kg={self.info.calibration.sensor_max_kg})"
        )
        return payloads

    # ────── State transition scenarios ──────

    def generate_state_transition_closed_to_open(self) -> List[Dict[str, Any]]:
        """
        Phase 1: CLOSED (low evaporation)
        Phase 2: Transition ramp
        Phase 3: OPEN (high evaporation, exceeding open_rate_min_kg_per_h)
        """
        logger.info("Generating: State transition CLOSED → OPEN")
        start = datetime.now(timezone.utc)
        w_fn = self.info.weight_at_pct
        weight = w_fn(80.0)
        closed_rate = self.info.static_evap_kg_per_hour
        open_rate = self.info.calibration.open_rate_min_kg_per_h * 2.5

        payloads = []

        # Phase 1: 15 readings CLOSED
        for i in range(15):
            ts = start + timedelta(seconds=i * 30)
            hours = (i * 30) / 3600.0
            w = weight - (closed_rate * hours)
            payloads.append(self._make(w, ts))
        weight = w

        # Phase 2: 10 readings ramping up
        t_offset = 15 * 30
        for i in range(10):
            ts = start + timedelta(seconds=t_offset + i * 30)
            progress = (i + 1) / 10.0
            current_rate = closed_rate + progress * (open_rate - closed_rate)
            hours = (i * 30) / 3600.0
            w = weight - (current_rate * hours)
            payloads.append(self._make(w, ts))
        weight = w

        # Phase 3: 15 readings OPEN
        t_offset += 10 * 30
        for i in range(15):
            ts = start + timedelta(seconds=t_offset + i * 30)
            hours = (i * 30) / 3600.0
            w = weight - (open_rate * hours)
            payloads.append(self._make(w, ts))

        logger.info(f"  {len(payloads)} payloads over 3 phases")
        return payloads

    def generate_rapid_decline(self) -> List[Dict[str, Any]]:
        """
        Rapid LN2 loss — simulates a leak or sustained open lid.
        Evaporation well above open_rate_min, declining from 60% to ~20%.
        """
        logger.info("Generating: Rapid decline (leak / sustained open)")
        start = datetime.now(timezone.utc)
        w_fn = self.info.weight_at_pct
        start_weight = w_fn(60.0)
        # Very high loss rate
        rate = self.info.calibration.open_rate_min_kg_per_h * 5.0

        payloads = []
        for i in range(25):
            ts = start + timedelta(seconds=i * 30)
            hours = (i * 30) / 3600.0
            weight = start_weight - (rate * hours)
            payloads.append(self._make(max(weight, self.info.tank.empty_weight_kg + 0.5), ts))

        logger.info(
            f"  {len(payloads)} payloads: {start_weight:.3f} → {weight:.3f} kg  "
            f"(rate={rate:.4f} kg/h)"
        )
        return payloads

    def generate_stable_full_tank(self) -> List[Dict[str, Any]]:
        """
        Nearly full tank with minimal evaporation.  Good baseline test.
        """
        logger.info("Generating: Stable full tank")
        start = datetime.now(timezone.utc)
        w_fn = self.info.weight_at_pct
        start_weight = w_fn(95.0)
        rate = self.info.static_evap_kg_per_hour * 0.8  # slightly below static

        payloads = []
        for i in range(15):
            ts = start + timedelta(seconds=i * 30)
            hours = (i * 30) / 3600.0
            weight = start_weight - (rate * hours)
            payloads.append(self._make(weight, ts))

        logger.info(f"  {len(payloads)} payloads: {start_weight:.3f} → {weight:.3f} kg")
        return payloads

    # ────── Edge cases ──────

    def generate_edge_missing_deviceid(self) -> List[Dict[str, Any]]:
        """Payload missing deviceid — should be rejected by process_custom_iot_ln2."""
        logger.info("Generating edge case: missing deviceid")
        ts = datetime.now(timezone.utc)
        return [
            {
                "payload": {
                    "source": "CUSTOM_IOT",
                    "timestamp": ts.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
                    "payload": 40.0,
                }
            }
        ]

    def generate_edge_invalid_timestamp(self) -> List[Dict[str, Any]]:
        """Payload with un-parseable timestamp."""
        logger.info("Generating edge case: invalid timestamp")
        return [
            {
                "payload": {
                    "source": "CUSTOM_IOT",
                    "deviceid": self.device_code,
                    "EntityName": self.device_code,
                    "timestamp": "NOT-A-VALID-TS",
                    "payload": 40.0,
                }
            }
        ]

    def generate_edge_non_numeric_weight(self) -> List[Dict[str, Any]]:
        """Payload with non-numeric weight — float() will raise."""
        logger.info("Generating edge case: non-numeric weight")
        ts = datetime.now(timezone.utc)
        return [
            {
                "payload": {
                    "source": "CUSTOM_IOT",
                    "deviceid": self.device_code,
                    "EntityName": self.device_code,
                    "timestamp": ts.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
                    "payload": "NaN-string",
                }
            }
        ]


# ============================================================================
# Tive (IVF) Payload Generator
# ============================================================================


class TivePayloadGenerator:
    """
    Generates Tive-style IVF webhook payloads.

    These payloads use the *top-level* Tive schema recognised by
    transform_webhook_to_ivf_quality_data() in publisher_logic.py.
    The EntityName must match a tank's tive_device_id for routing.
    """

    def __init__(self, tive_device_id: str, shipment_id: Optional[str] = None):
        """
        Args:
            tive_device_id: Must match tanks.tive_device_id in the DB.
            shipment_id: Optional IVF shipment ID.
        """
        self.device_id = tive_device_id
        self.shipment_id = shipment_id or f"TEST-SHIP-{tive_device_id}"

    def _make(
        self,
        ts: datetime,
        *,
        probe_c: float = -196.5,
        device_c: float = 22.0,
        humidity_pct: float = 45.0,
        shock_g: float = 0.1,
        lat: float = 12.9716,
        lon: float = 77.5946,
        battery_pct: float = 85.0,
    ) -> Dict[str, Any]:
        """Build a single Tive IVF webhook payload."""
        probe_f = probe_c * 9.0 / 5.0 + 32.0
        device_f = device_c * 9.0 / 5.0 + 32.0
        return {
            "EntityName": self.device_id,
            "ShipmentId": self.shipment_id,
            "Timestamp": ts.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
            "Temperature": {
                "Celsius": round(device_c, 2),
                "Fahrenheit": round(device_f, 2),
            },
            "ProbeTemperature": {
                "Celsius": round(probe_c, 2),
                "Fahrenheit": round(probe_f, 2),
            },
            "Humidity": {"Percentage": round(humidity_pct, 1)},
            "Shock": {"G": round(shock_g, 3)},
            "Location": {
                "Latitude": round(lat, 6),
                "Longitude": round(lon, 6),
            },
            "Battery": {"Percentage": round(battery_pct, 1)},
            "Shipment": {
                "Id": self.shipment_id,
                "ShipFrom": {"Latitude": 12.9352, "Longitude": 77.6245},
                "ShipTo": {"Latitude": 13.0827, "Longitude": 80.2707},
            },
        }

    def generate_normal_temperature(self) -> List[Dict[str, Any]]:
        """Normal IVF monitoring — probe at -196 °C, no shock."""
        logger.info("Generating Tive: Normal temperature readings")
        start = datetime.now(timezone.utc)
        payloads = []
        for i in range(10):
            ts = start + timedelta(minutes=i * 5)
            probe_c = -196.5 + (i * 0.05)  # very small drift
            payloads.append(self._make(ts, probe_c=probe_c, shock_g=0.05))
        logger.info(f"  {len(payloads)} Tive payloads")
        return payloads

    def generate_temperature_excursion(self) -> List[Dict[str, Any]]:
        """Probe temperature rises above -191 °C threshold — IVF violation."""
        logger.info("Generating Tive: Temperature excursion")
        start = datetime.now(timezone.utc)
        payloads = []
        for i in range(10):
            ts = start + timedelta(minutes=i * 5)
            # Gradually warming from -196 to -185
            probe_c = -196.5 + (i * 1.3)
            payloads.append(self._make(ts, probe_c=probe_c))
        logger.info(
            f"  {len(payloads)} Tive payloads: probe -196.5 → {probe_c:.1f} °C"
        )
        return payloads

    def generate_shock_event(self) -> List[Dict[str, Any]]:
        """High G-force shock event exceeding 1.0 G threshold."""
        logger.info("Generating Tive: Shock event")
        start = datetime.now(timezone.utc)
        payloads = []
        for i in range(8):
            ts = start + timedelta(minutes=i * 5)
            shock = 0.1 if i < 4 else 2.5 + (i - 4) * 0.3  # spike at reading 5
            payloads.append(self._make(ts, shock_g=shock))
        logger.info(f"  {len(payloads)} Tive payloads with shock spike")
        return payloads

    def generate_transit_with_location(self) -> List[Dict[str, Any]]:
        """Simulate shipment in transit with changing GPS coordinates."""
        logger.info("Generating Tive: Transit with location updates")
        start = datetime.now(timezone.utc)
        # Approximate route: Bangalore → Chennai
        start_lat, start_lon = 12.9716, 77.5946
        end_lat, end_lon = 13.0827, 80.2707

        payloads = []
        for i in range(12):
            ts = start + timedelta(minutes=i * 10)
            progress = i / 11.0
            lat = start_lat + progress * (end_lat - start_lat)
            lon = start_lon + progress * (end_lon - start_lon)
            payloads.append(
                self._make(ts, probe_c=-196.0, lat=lat, lon=lon, battery_pct=85 - i * 0.5)
            )
        logger.info(f"  {len(payloads)} Tive payloads with location drift")
        return payloads


# ============================================================================
# Database Observer
# ============================================================================


class DatabaseObserver:
    """Observes database writes during test execution."""

    def __init__(self):
        self.session = None

    def __enter__(self):
        self.session = get_session()()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            self.session.close()

    def get_recent_raw_data(self, device_code: str, limit: int = 20) -> List[Tuple]:
        try:
            result = self.session.execute(
                text("""
                    SELECT lrd.id, lrd.tank_id, d.device_code, lrd.raw_data, lrd.created_at
                    FROM ln2_iot_raw_data lrd
                    JOIN devices d ON d.id = lrd.device_id
                    WHERE d.device_code = :dc
                    ORDER BY lrd.created_at DESC LIMIT :lim
                """),
                {"dc": device_code, "lim": limit},
            )
            return result.fetchall()
        except Exception as e:
            logger.error(f"Query ln2_iot_raw_data failed: {e}")
            return []

    def get_recent_readings(self, device_code: str, limit: int = 10) -> List[Tuple]:
        try:
            result = self.session.execute(
                text("""
                    SELECT lr.id, d.device_code, lr.ln2_level_pct,
                           lr.evaporation_rate_kg_per_h, lr.reading_timestamp, lr.created_at
                    FROM ln2_readings lr
                    JOIN devices d ON d.id = lr.device_id
                    WHERE d.device_code = :dc
                    ORDER BY lr.reading_timestamp DESC LIMIT :lim
                """),
                {"dc": device_code, "lim": limit},
            )
            return result.fetchall()
        except Exception as e:
            logger.error(f"Query ln2_readings failed: {e}")
            return []

    def count_recent(self, device_code: str, table: str, minutes: int = 60) -> int:
        try:
            result = self.session.execute(
                text(f"""
                    SELECT COUNT(*) FROM {table} t
                    JOIN devices d ON d.id = t.device_id
                    WHERE d.device_code = :dc
                      AND t.created_at > NOW() - INTERVAL '{minutes} minutes'
                """),
                {"dc": device_code},
            )
            row = result.fetchone()
            return row[0] if row else 0
        except Exception as e:
            logger.error(f"Count in {table} failed: {e}")
            return 0

    def get_recent_ivf_data(self, tive_device_id: str, limit: int = 10) -> List[Tuple]:
        """Get recent ivf_telemetry_data for a Tive device."""
        try:
            result = self.session.execute(
                text("""
                    SELECT id, tank_id, device_id, telemetry_data, created_at
                    FROM ivf_telemetry_data
                    WHERE device_id = :did
                    ORDER BY created_at DESC LIMIT :lim
                """),
                {"did": tive_device_id, "lim": limit},
            )
            return result.fetchall()
        except Exception as e:
            logger.error(f"Query ivf_telemetry_data failed: {e}")
            return []


# ============================================================================
# Redis Observer
# ============================================================================


class RedisObserver:
    """Observes Redis state during test execution."""

    def __init__(self):
        self.redis = get_redis_client()

    def get_window_points(self, device_code: str) -> List[Tuple[str, float]]:
        try:
            raw_list = self.redis.lrange(f"ln2:{device_code}:window", 0, -1)
            pts = []
            for raw in raw_list:
                try:
                    obj = json.loads(raw)
                    pts.append((obj.get("ts", "?"), obj.get("mass", 0.0)))
                except json.JSONDecodeError:
                    pass
            return pts
        except Exception as e:
            logger.error(f"Redis window points error: {e}")
            return []

    def get_device_state(self, device_code: str) -> Dict[str, Any]:
        try:
            raw = self.redis.hgetall(f"ln2:{device_code}:state")
            return {
                (k.decode() if isinstance(k, bytes) else k): (
                    v.decode() if isinstance(v, bytes) else v
                )
                for k, v in raw.items()
            }
        except Exception as e:
            logger.error(f"Redis device state error: {e}")
            return {}

    def get_quality_history(self, device_code: str) -> List[Dict[str, Any]]:
        try:
            raw_list = self.redis.lrange(f"ln2_quality_history:{device_code}", 0, -1)
            history = []
            for raw in raw_list:
                try:
                    history.append(json.loads(raw))
                except json.JSONDecodeError:
                    pass
            return history
        except Exception as e:
            logger.error(f"Redis quality history error: {e}")
            return []

    def key_exists(self, key: str) -> bool:
        try:
            return self.redis.exists(key) > 0
        except Exception:
            return False


# ============================================================================
# Test Scenarios Registry
# ============================================================================


@dataclass
class TestScenario:
    """Metadata for one test scenario."""
    name: str
    description: str
    key: str
    payload_type: str   # "ln2" or "tive"
    generator_method: str


LN2_SCENARIOS = [
    TestScenario("Normal (Lid Closed)", "Steady evaporation at static rate", "normal_closed", "ln2", "generate_normal_closed_lid"),
    TestScenario("Normal (Lid Open)", "Higher evaporation > open_rate_min", "normal_open", "ln2", "generate_normal_open_lid"),
    TestScenario("Refill Event", "Pre-decline → jump → post-refill", "refill_event", "ln2", "generate_refill_event"),
    TestScenario("Sensor Fault (Below Empty)", "Weight below sensor_min_kg", "fault_below", "ln2", "generate_sensor_fault_below_empty"),
    TestScenario("Sensor Fault (Above Full)", "Weight above sensor_max_kg", "fault_above", "ln2", "generate_sensor_fault_above_full"),
    TestScenario("State CLOSED → OPEN", "Three-phase lid state transition", "state_transition", "ln2", "generate_state_transition_closed_to_open"),
    TestScenario("Rapid Decline / Leak", "Very high loss rate", "rapid_decline", "ln2", "generate_rapid_decline"),
    TestScenario("Stable Full Tank", "Near-full, minimal evaporation", "stable_full", "ln2", "generate_stable_full_tank"),
    TestScenario("Edge: Missing deviceid", "Payload without deviceid", "edge_no_devid", "ln2", "generate_edge_missing_deviceid"),
    TestScenario("Edge: Invalid timestamp", "Malformed timestamp string", "edge_bad_ts", "ln2", "generate_edge_invalid_timestamp"),
    TestScenario("Edge: Non-numeric weight", "Weight field is a string", "edge_bad_wt", "ln2", "generate_edge_non_numeric_weight"),
]

TIVE_SCENARIOS = [
    TestScenario("Tive: Normal Temp", "Probe at -196 °C, no shock", "tive_normal_temp", "tive", "generate_normal_temperature"),
    TestScenario("Tive: Temp Excursion", "Probe rises above -191 °C", "tive_temp_excursion", "tive", "generate_temperature_excursion"),
    TestScenario("Tive: Shock Event", "G-force spike > 1.0 G", "tive_shock", "tive", "generate_shock_event"),
    TestScenario("Tive: Transit + GPS", "Changing location during shipment", "tive_transit", "tive", "generate_transit_with_location"),
]

ALL_SCENARIOS = LN2_SCENARIOS + TIVE_SCENARIOS


# ============================================================================
# Test Runner
# ============================================================================


class TestRunner:
    """Orchestrates test scenario execution with DB/Redis observation."""

    def __init__(
        self,
        device_info: TestDeviceInfo,
        tive_device_id: Optional[str] = None,
        tive_shipment_id: Optional[str] = None,
    ):
        self.device_info = device_info
        self.ln2_gen = LN2PayloadGenerator(device_info)
        self.tive_gen = (
            TivePayloadGenerator(tive_device_id, tive_shipment_id)
            if tive_device_id
            else None
        )

    def run_scenario(self, scenario: TestScenario) -> Dict[str, Any]:
        """Run one scenario and return a result dict."""
        print(f"\n{'=' * 80}")
        print(f"  {scenario.name}  [{scenario.payload_type.upper()}]")
        print(f"  {scenario.description}")
        print(f"{'=' * 80}\n")

        result: Dict[str, Any] = {
            "scenario": scenario.name,
            "key": scenario.key,
            "status": "UNKNOWN",
            "duration_s": 0,
            "message_count": 0,
            "errors": [],
            "db_writes": {},
            "redis_state": {},
        }

        try:
            # Pick the right generator
            if scenario.payload_type == "ln2":
                gen = self.ln2_gen
            elif scenario.payload_type == "tive" and self.tive_gen:
                gen = self.tive_gen
            else:
                print("⚠ No Tive generator configured — skipping")
                result["status"] = "SKIPPED"
                return result

            method = getattr(gen, scenario.generator_method)
            payloads = method()
            result["message_count"] = len(payloads)

            events = [EventHubEventMock(p) for p in payloads]
            print(f"→ Sending {len(events)} EventHub messages …\n")

            t0 = time.time()
            try:
                telemetry_hook_main(events)
                result["status"] = "SUCCESS"
            except Exception as func_err:
                result["status"] = "FAILED"
                result["errors"].append(str(func_err))
                logger.error(f"Function error: {func_err}", exc_info=True)

            result["duration_s"] = round(time.time() - t0, 3)
            time.sleep(0.5)  # allow commit flush

            # ── Observe DB ──
            device_code = self.device_info.device_code
            print("Database writes:")
            with DatabaseObserver() as dbo:
                if scenario.payload_type == "ln2":
                    raw_n = dbo.count_recent(device_code, "ln2_iot_raw_data", 5)
                    read_n = dbo.count_recent(device_code, "ln2_readings", 5)
                    result["db_writes"]["ln2_iot_raw_data"] = raw_n
                    result["db_writes"]["ln2_readings"] = read_n
                    print(f"  ln2_iot_raw_data: {raw_n}  |  ln2_readings: {read_n}")

                    if read_n > 0:
                        recent = dbo.get_recent_readings(device_code, 3)
                        for r in recent:
                            print(
                                f"    Level={r[2]:.1f}%  Rate={r[3]:.4f} kg/h  @{r[4]}"
                            )
                elif scenario.payload_type == "tive" and self.tive_gen:
                    ivf_rows = dbo.get_recent_ivf_data(self.tive_gen.device_id, 5)
                    result["db_writes"]["ivf_telemetry_data"] = len(ivf_rows)
                    print(f"  ivf_telemetry_data: {len(ivf_rows)}")
                    for r in ivf_rows[:3]:
                        print(f"    t_int={r[2]}  t_ext={r[3]}  shock={r[5]}  @{r[8]}")

            # ── Observe Redis ──
            print("\nRedis state:")
            ro = RedisObserver()
            if scenario.payload_type == "ln2":
                wpts = ro.get_window_points(device_code)
                print(f"  ln2:{device_code}:window  → {len(wpts)} points")
                state = ro.get_device_state(device_code)
                result["redis_state"]["window_points"] = len(wpts)
                result["redis_state"]["device_state"] = state
                if state:
                    for k, v in state.items():
                        print(f"    {k}: {v}")
                qh = ro.get_quality_history(device_code)
                result["redis_state"]["quality_history"] = len(qh)
                print(f"  quality_history → {len(qh)} entries")

            # Summary
            print(f"\n{'─' * 40}")
            if result["status"] == "SUCCESS":
                print(f"✓ Completed in {result['duration_s']:.2f}s")
            else:
                print(f"✗ {result['status']} in {result['duration_s']:.2f}s")
                for e in result["errors"]:
                    print(f"  Error: {e}")

        except Exception as exc:
            result["status"] = "ERROR"
            result["errors"].append(str(exc))
            logger.error(f"Runner error: {exc}", exc_info=True)
            print(f"\n✗ Error: {exc}")

        return result

    def run_batch(
        self,
        scenarios: Optional[List[TestScenario]] = None,
        skip_edge: bool = False,
    ) -> List[Dict[str, Any]]:
        """Run multiple scenarios sequentially."""
        items = scenarios or ALL_SCENARIOS
        if skip_edge:
            items = [s for s in items if not s.key.startswith("edge_")]

        results = []
        for i, sc in enumerate(items):
            result = self.run_scenario(sc)
            results.append(result)
            if i < len(items) - 1:
                time.sleep(1)

        # Print summary
        print(f"\n{'=' * 80}")
        print("  Batch Summary")
        print(f"{'=' * 80}")
        ok = sum(1 for r in results if r["status"] == "SUCCESS")
        print(f"  Total: {len(results)}  |  Success: {ok}  |  Other: {len(results) - ok}")
        for r in results:
            mark = "✓" if r["status"] == "SUCCESS" else "✗"
            print(f"  {mark} {r['scenario']:40s} {r['status']}")
        return results


# ============================================================================
# Custom Payload Shell
# ============================================================================


def custom_payload_shell(device_info: TestDeviceInfo) -> None:
    """
    Interactive prompt to send a single CUSTOM_IOT payload with a
    user-specified weight.
    """
    print("\n── Custom LN2 Payload ──")
    print(f"Device: {device_info.device_code}")
    w_fn = device_info.weight_at_pct
    print(f"  0% (empty) = {device_info.tank.empty_weight_kg:.1f} kg")
    print(f"  100% (full) = {device_info.tank.full_weight_kg:.1f} kg")
    print(f"  75% example = {w_fn(75.0):.3f} kg")

    raw = input("\nEnter weight_kg (or 'q' to cancel): ").strip()
    if raw.lower() == "q":
        return
    try:
        wt = float(raw)
    except ValueError:
        print("Invalid number")
        return

    ts = datetime.now(timezone.utc)
    gen = LN2PayloadGenerator(device_info)
    payload = gen._make(wt, ts)
    print(f"\nPayload: {json.dumps(payload, indent=2)}")
    confirm = input("Send? (Y/n): ").strip().lower()
    if confirm in ("", "y", "yes"):
        event = EventHubEventMock(payload)
        try:
            telemetry_hook_main([event])
            print("✓ Sent successfully")
        except Exception as exc:
            print(f"✗ Error: {exc}")


# ============================================================================
# Interactive Menu
# ============================================================================


def show_menu(device_info: TestDeviceInfo, tive_device_id: Optional[str] = None) -> None:
    """Main interactive menu."""
    runner = TestRunner(
        device_info,
        tive_device_id=tive_device_id,
    )

    while True:
        print(f"\n{'=' * 80}")
        print(f"  LN2 IoT Test Driver v2")
        print(f"  Device: {device_info.device_code}  │  Tank: {device_info.tank_code}")
        if tive_device_id:
            print(f"  Tive:   {tive_device_id}")
        print(f"{'=' * 80}")

        print("\n── LN2 (CUSTOM_IOT) Scenarios ──")
        for i, s in enumerate(LN2_SCENARIOS, 1):
            print(f"  {i:2d}. {s.name:40s} {s.description}")

        tive_offset = len(LN2_SCENARIOS)
        if tive_device_id:
            print("\n── Tive (IVF) Scenarios ──")
            for i, s in enumerate(TIVE_SCENARIOS, tive_offset + 1):
                print(f"  {i:2d}. {s.name:40s} {s.description}")

        print(f"\n   A  Run ALL scenarios")
        print(f"   L  Run all LN2 scenarios")
        if tive_device_id:
            print(f"   T  Run all Tive scenarios")
        print(f"   P  Send custom payload")
        print(f"   C  Clean test data (Redis + DB readings)")
        print(f"   D  Device info")
        print(f"   Q  Quit")

        choice = input("\nSelect: ").strip().upper()

        if choice == "Q":
            break
        elif choice == "A":
            runner.run_batch()
        elif choice == "L":
            runner.run_batch(LN2_SCENARIOS)
        elif choice == "T" and tive_device_id:
            runner.run_batch(TIVE_SCENARIOS)
        elif choice == "P":
            custom_payload_shell(device_info)
        elif choice == "C":
            if input("Clean test data? (yes/no): ").strip().lower() in ("y", "yes"):
                setup = TestDeviceSetup()
                setup.cleanup_redis(device_info.device_code)
                # Only clean readings, keep device/tank
                setup.cleanup_device(device_info.device_code, delete_device=False)
        elif choice == "D":
            _show_device_info(device_info)
        elif choice.isdigit():
            idx = int(choice) - 1
            if 0 <= idx < len(ALL_SCENARIOS):
                runner.run_scenario(ALL_SCENARIOS[idx])
            else:
                print("Invalid selection")
        else:
            print("Invalid selection")


def _show_device_info(info: TestDeviceInfo) -> None:
    """Print detailed device configuration."""
    print(f"\n── Device Configuration ──")
    print(f"  device_code:     {info.device_code}")
    print(f"  device_pk:       {info.device_pk}")
    print(f"  tank_id:         {info.tank_id}")
    print(f"  tank_code:       {info.tank_code}")
    print(f"  branch_id:       {info.branch_id}")
    print(f"\n  Tank:")
    print(f"    empty_weight_kg:             {info.tank.empty_weight_kg}")
    print(f"    full_weight_kg:              {info.tank.full_weight_kg}")
    print(f"    capacity_liters:             {info.tank.capacity_liters}")
    print(f"    static_evap_rate_l_per_day:  {info.tank.static_evap_rate_l_per_day}")
    print(f"    ln2_max_mass_kg:             {info.ln2_max_mass_kg:.3f}")
    print(f"    static_evap_kg_per_hour:     {info.static_evap_kg_per_hour:.6f}")
    print(f"\n  Calibration (ln2_iot_devices):")
    c = info.calibration
    print(f"    sensor_min_kg:               {c.sensor_min_kg}")
    print(f"    sensor_max_kg:               {c.sensor_max_kg}")
    print(f"    closed_noise_margin_kg_per_h:{c.closed_noise_margin_kg_per_h}")
    print(f"    open_rate_min_kg_per_h:      {c.open_rate_min_kg_per_h}")
    print(f"    refill_threshold_kg:          {c.refill_threshold_kg}")
    print(f"    window_minutes:              {c.window_minutes}")
    print(f"    min_points:                  {c.min_points}")
    print(f"    consecutive_windows:         {c.consecutive_windows}")
    print(f"    closed_rate_max_kg_per_h:    {info.closed_rate_max_kg_per_h:.6f}")
    print(f"\n  Weight reference:")
    w = info.weight_at_pct
    for pct in (0, 25, 50, 75, 100):
        print(f"    {pct:3d}% → {w(pct):.3f} kg")


# ============================================================================
# Exit Cleanup Hook
# ============================================================================


_active_device_code: Optional[str] = None


def _exit_cleanup() -> None:
    """atexit handler — offers to clean test device data."""
    if _active_device_code is None:
        return
    try:
        answer = input(
            f"\n\nClean up test data for {_active_device_code}? "
            f"(y = readings only / d = delete device too / n = keep): "
        ).strip().lower()
        setup = TestDeviceSetup()
        if answer == "y":
            setup.cleanup_redis(_active_device_code)
            setup.cleanup_device(_active_device_code, delete_device=False)
        elif answer == "d":
            setup.full_cleanup(_active_device_code)
        else:
            print("Keeping test data.")
    except (EOFError, KeyboardInterrupt):
        print("\nSkipping cleanup.")


# ============================================================================
# Main Entry Point
# ============================================================================


def main():
    parser = argparse.ArgumentParser(
        description="LN2 IoT Test Driver v2 — CUSTOM_IOT + Tive payloads",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python test_ln2_driver.py                      # interactive mode
  python test_ln2_driver.py --scenario refill_event
  python test_ln2_driver.py --batch              # all scenarios
  python test_ln2_driver.py --batch --ln2-only   # LN2 only
  python test_ln2_driver.py --setup              # create test device
  python test_ln2_driver.py --clean              # clean test data
  python test_ln2_driver.py --device-code LN2-TEST-001
  python test_ln2_driver.py --tive-device-id TIVE-IVF-T10
        """,
    )

    parser.add_argument("--device-code", default=None, help="Reuse an existing test device code")
    parser.add_argument("--tive-device-id", default=None, help="Tive EntityName matching tanks.tive_device_id")
    parser.add_argument("--scenario", choices=[s.key for s in ALL_SCENARIOS], help="Run one scenario")
    parser.add_argument("--batch", action="store_true", help="Run all scenarios")
    parser.add_argument("--ln2-only", action="store_true", help="With --batch, skip Tive scenarios")
    parser.add_argument("--setup", action="store_true", help="Setup test device and exit")
    parser.add_argument("--clean", action="store_true", help="Clean test data and exit")
    parser.add_argument("--clean-all", action="store_true", help="Clean + delete device/tank")
    parser.add_argument("--debug", action="store_true", help="Enable DEBUG logging")

    args = parser.parse_args()

    if args.debug:
        logging.getLogger().setLevel(logging.DEBUG)

    # Banner
    print(f"\n{'=' * 80}")
    print(f"  LN2 IoT Test Driver v2")
    print(f"{'=' * 80}")
    db_host = os.getenv("DB_HOST", "?")
    db_name = os.getenv("DB_NAME", "?")
    print(f"  DB: {db_host}/{db_name}")
    print(f"  Redis: {os.getenv('REDIS_HOST', '?')}:{os.getenv('REDIS_PORT', '?')}")
    print(f"{'=' * 80}")

    setup = TestDeviceSetup()

    # ── Clean mode ──
    if args.clean or args.clean_all:
        code = args.device_code
        if not code:
            existing = setup.find_existing_test_devices()
            if not existing:
                print("No test devices found.")
                return
            for i, d in enumerate(existing, 1):
                print(f"  {i}. {d['device_code']}")
            ch = input("Select device to clean (number or 'all'): ").strip()
            if ch.lower() == "all":
                for d in existing:
                    setup.full_cleanup(d["device_code"])
                return
            elif ch.isdigit() and 0 < int(ch) <= len(existing):
                code = existing[int(ch) - 1]["device_code"]
            else:
                print("Cancelled.")
                return
        setup.cleanup_redis(code)
        setup.cleanup_device(code, delete_device=args.clean_all)
        return

    # ── Obtain device ──
    device_info: Optional[TestDeviceInfo] = None

    if args.device_code:
        device_info = setup.load_device_info(args.device_code)
        if device_info is None:
            print(f"✗ Device {args.device_code} not found or not fully configured.")
            return
        print(f"✓ Loaded device: {args.device_code}")
    else:
        # Interactive setup (reuse or create)
        device_info = setup.interactive_setup()

    global _active_device_code
    _active_device_code = device_info.device_code
    atexit.register(_exit_cleanup)

    # Tive device ID
    tive_id = args.tive_device_id

    # ── Setup-only mode ──
    if args.setup:
        _show_device_info(device_info)
        return

    # ── Scenario mode ──
    if args.scenario:
        sc = next((s for s in ALL_SCENARIOS if s.key == args.scenario), None)
        if sc is None:
            print(f"Unknown scenario: {args.scenario}")
            return
        if sc.payload_type == "tive" and not tive_id:
            tive_id = input("Enter Tive device ID (tanks.tive_device_id): ").strip()
            if not tive_id:
                print("Cancelled.")
                return
        runner = TestRunner(device_info, tive_device_id=tive_id)
        runner.run_scenario(sc)
        return

    # ── Batch mode ──
    if args.batch:
        scenarios = LN2_SCENARIOS if args.ln2_only else ALL_SCENARIOS
        if not args.ln2_only and not tive_id:
            tive_id = input(
                "Enter Tive device ID for IVF scenarios (or press Enter to skip): "
            ).strip() or None
            if not tive_id:
                scenarios = LN2_SCENARIOS
                print("(Skipping Tive scenarios — no tive_device_id)")
        runner = TestRunner(device_info, tive_device_id=tive_id)
        runner.run_batch(scenarios)
        return

    # ── Default: interactive ──
    if not tive_id:
        tive_id = input(
            "Enter Tive device ID for IVF scenarios (or press Enter to skip): "
        ).strip() or None
    show_menu(device_info, tive_device_id=tive_id)


if __name__ == "__main__":
    main()
