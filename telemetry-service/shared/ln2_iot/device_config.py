"""
device_config.py
────────────────
Defines DeviceConfig — the single object that carries every calibration
value needed to process one device's readings — and DeviceConfigCache,
which loads it from Postgres on first access and caches it in Redis.

Data sources
────────────
  tanks table          → physical tank spec (weights, capacity, static evap)
  ln2_iot_devices      → detection thresholds and rolling-window parameters
                         (the existing tank_min/max_capacity_reading columns
                          serve as sensor fault bounds)
  config.py            → universal constants and TTLs only

Redis key schema
────────────────
  ln2:cfg:{device_code}    STRING  JSON-encoded DeviceConfig
  TTL = REDIS_CONFIG_TTL_SECONDS (default 5 min)

Cache invalidation
──────────────────
  Call  await cache.invalidate(device_code)  after updating the DB
  (e.g. from an admin endpoint).  The next sensor event will re-fetch.
"""

from __future__ import annotations

import json
import logging
from dataclasses import asdict, dataclass
from datetime import datetime
from typing import Optional

import asyncpg
import redis.asyncio as aioredis

from . import config

logger = logging.getLogger(__name__)


def _compute_sensor_bounds(
    empty_weight_kg: float,
    full_weight_kg: float,
    sensor_min_kg: Optional[float],
    sensor_max_kg: Optional[float],
) -> tuple[float, float]:
    """
    Compute sensor bounds with fallback to fault margin if not specified.
    
    Returns (sensor_min_kg, sensor_max_kg).
    """
    fault_margin = config.SENSOR_FAULT_MARGIN_KG
    computed_min = float(sensor_min_kg) if sensor_min_kg is not None \
        else empty_weight_kg - fault_margin
    computed_max = float(sensor_max_kg) if sensor_max_kg is not None \
        else full_weight_kg + fault_margin
    return computed_min, computed_max


# ─────────────────────────────────────────────────────────────────────────────
# DeviceConfig — single source of truth for one device's calibration
# ─────────────────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class DeviceConfig:
    """
    All calibration and tuning values needed to process a device's readings.
    Immutable once constructed.

    Tank-level fields (from `tanks`)
    ─────────────────────────────────
    empty_weight_kg          – tare weight of the empty vessel
    full_weight_kg           – weight when 100 % full of LN2
    capacity_liters          – usable LN2 capacity (litres); maps to tanks.capacity_liters
    static_evap_rate_l_per_day – passive evaporation with lid closed

    Mapping-level fields (from `ln2_iot_devices`)
    ──────────────────────────────────────────────
    tank_id                  – FK to tanks
    device_pk                – devices.id (integer PK)
    sensor_min_kg            – tank_min_capacity_reading (raw scale lower bound)
    sensor_max_kg            – tank_max_capacity_reading (raw scale upper bound)
    closed_noise_margin_kg_per_h  – tolerance above static evap → still "closed"
    open_rate_min_kg_per_h        – loss rate that reliably means lid is open
    refill_threshold_kg           – mass increase that triggers a refill event
    window_minutes                – rolling window width
    window_min_points             – min points before computing a rate
    consecutive_windows_for_state – debounce: N agreeing windows to flip state

    Event-detection fields (optional, with defaults)
    ────────────────────────────────────────────────
    spike_tolerance_kg          – rise/fall (kg) to classify as transient spike
    spike_max_duration_s        – max seconds for a place-and-remove to complete
    lid_weight_min_kg           – lower bound of lid-weight increase (kg)
    lid_weight_max_kg           – upper bound of lid-weight increase (kg)
    lid_confirm_stable_points   – readings after candidate to confirm no continued rise
    low_level_threshold_kg      – LN2 mass (kg) below which low-level alert fires
    low_level_consecutive_readings – consecutive below-threshold readings before alert
    canister_weight_kg          – expected single canister weight (kg)
    canister_tolerance_kg       – tolerance around canister weight (kg)
    product_change_max_kg       – max weight change (kg) classified as product insertion
    precaution_level_pct        – level % below which an advisory is sent on lid open
    """

    # ── Identity ──────────────────────────────────────────────
    device_code: str          # external string ID from the IoT payload
    device_pk: int            # devices.id
    tank_id: int
    tank_code: str

    # ── Tank physical spec ────────────────────────────────────
    empty_weight_kg: float
    full_weight_kg: float
    capacity_liters: float          # maps to tanks.capacity_liters (pre-existing column)
    static_evap_rate_l_per_day: float

    # ── Sensor fault bounds (raw scale readings) ──────────────
    sensor_min_kg: float      # reading below this → BELOW_EMPTY fault
    sensor_max_kg: float      # reading above this → ABOVE_FULL fault

    # ── Detection thresholds ──────────────────────────────────
    closed_noise_margin_kg_per_h: float
    open_rate_min_kg_per_h: float
    refill_threshold_kg: float

    # ── Rolling-window / debounce ─────────────────────────────
    window_minutes: int
    window_min_points: int
    consecutive_windows_for_state: int

    # ── Transient spike filter (Case B) ───────────────────────
    spike_tolerance_kg: float = 0.8           # rise+fall ≥ this → transient spike
    spike_max_duration_s: int = 90            # spike must complete within this window

    # ── Lid weight-band detection (Case C) ────────────────────
    lid_weight_min_kg: float = 0.50           # lower bound of lid weight increase
    lid_weight_max_kg: float = 0.55           # upper bound of lid weight increase
    lid_confirm_stable_points: int = 4        # readings to confirm no continued rise

    # ── Low-level refill alert (Step 5) ───────────────────────
    low_level_threshold_kg: float = 54.05       # LN2 mass below which alert considered
    low_level_consecutive_readings: int = 3  # consecutive below-threshold → alert

    # ── Canister / product event detection ────────────────────
    canister_weight_kg: float = 0.309          # expected canister weight
    canister_tolerance_kg: float = 0.05       # tolerance around canister weight
    product_change_max_kg: float = 0.08       # max change for product insertion/removal

    # ── Precaution advisory ───────────────────────────────────
    precaution_level_pct: float = 15.0        # level % below which advisory fires on lid open

    # ─────────────────────────────────────────────────────────
    # Derived properties (computed, never stored)
    # ─────────────────────────────────────────────────────────

    @property
    def ln2_max_mass_kg(self) -> float:
        """Maximum LN2 mass the tank can hold (kg)."""
        return self.full_weight_kg - self.empty_weight_kg

    @property
    def static_evap_kg_per_hour(self) -> float:
        """Static evaporation rate converted to kg/hour."""
        static_kg_per_day = self.static_evap_rate_l_per_day * config.LN2_DENSITY_KG_PER_L
        return static_kg_per_day / 24.0

    @property
    def closed_rate_max_kg_per_h(self) -> float:
        """
        Upper bound for "lid closed" loss rate.
        = static evap + allowed noise margin.
        """
        return self.static_evap_kg_per_hour + self.closed_noise_margin_kg_per_h

    @property
    def eval_interval_seconds(self) -> float:
        """
        How often (seconds) the state machine is evaluated per device.
        = half the window width, so each window has two evaluation points.
        """
        return self.window_minutes * 60 / 2


# ─────────────────────────────────────────────────────────────────────────────
# DeviceConfigCache
# ─────────────────────────────────────────────────────────────────────────────

class DeviceConfigCache:
    """
    Two-level cache:  Redis (TTL-based) → PostgreSQL (authoritative).

    Thread/coroutine safety: single asyncio event loop assumed (standard for
    Azure Event Hub consumers).  No locking needed.

    Usage:
        cache = DeviceConfigCache(redis_client, pg_pool)
        cfg = await cache.get("TIVE-ABC123")
        if cfg is None:
            # device not registered — skip processing
    """

    _REDIS_KEY_PREFIX = "ln2:cfg:"

    def __init__(
        self,
        redis: aioredis.Redis,
        pg: asyncpg.Pool,
    ) -> None:
        self._redis = redis
        self._pg = pg

    # ─────────────────────────────────────────────
    # Public API
    # ─────────────────────────────────────────────

    async def get(self, device_code: str) -> Optional[DeviceConfig]:
        """
        Return calibration config for *device_code*, or None if unknown.
        Hits Redis first, falls back to Postgres, writes through to Redis.
        """
        # 1. Redis hit?
        cfg = await self._load_from_redis(device_code)
        if cfg is not None:
            return cfg

        # 2. Postgres
        cfg = await self._load_from_postgres(device_code)
        if cfg is None:
            logger.warning(
                "device_code=%s has no calibration record in DB — "
                "register it via ln2_iot_devices before sending data.",
                device_code,
            )
            return None

        # 3. Write-through to Redis
        await self._save_to_redis(cfg)
        return cfg

    async def invalidate(self, device_code: str) -> None:
        """
        Force a cache miss for *device_code* so the next get() re-fetches
        from Postgres.  Call this from an admin endpoint after updating
        calibration values in the DB.
        """
        key = self._REDIS_KEY_PREFIX + device_code
        await self._redis.delete(key)
        logger.info("Cache invalidated for device_code=%s", device_code)

    # ─────────────────────────────────────────────
    # Internal helpers
    # ─────────────────────────────────────────────

    def _redis_key(self, device_code: str) -> str:
        return self._REDIS_KEY_PREFIX + device_code

    async def _load_from_redis(self, device_code: str) -> Optional[DeviceConfig]:
        try:
            raw = await self._redis.get(self._redis_key(device_code))
            if raw is None:
                return None
            data = json.loads(raw)
            return DeviceConfig(**data)
        except Exception as exc:
            logger.warning(
                "Redis config cache read failed for %s: %s — falling back to DB",
                device_code, exc,
            )
            return None

    async def _save_to_redis(self, cfg: DeviceConfig) -> None:
        key = self._redis_key(cfg.device_code)
        try:
            await self._redis.set(
                key,
                json.dumps(asdict(cfg)),
                ex=config.REDIS_CONFIG_TTL_SECONDS,
            )
        except Exception as exc:
            # Non-fatal: we already have the value in memory; next call will
            # hit Postgres again and repopulate the cache.
            logger.warning("Redis config cache write failed for %s: %s", cfg.device_code, exc)

    async def _load_from_postgres(self, device_code: str) -> Optional[DeviceConfig]:
        """
        Single JOIN across devices → ln2_iot_devices → tanks.
        Returns None if the device is not fully configured.
        """
        row = await self._pg.fetchrow(
            """
            SELECT
                -- Identity
                d.id                                AS device_pk,
                d.device_code,
                lid.tank_id,

                -- Tank physical spec
                -- capacity_liters is a pre-existing column on tanks;
                -- empty_weight_kg, full_weight_kg, static_evap_rate_l_per_day
                -- are added by migration 001.
                t.empty_weight_kg,
                t.full_weight_kg,
                t.capacity_liters,
                t.static_evap_rate_l_per_day,

                -- Sensor fault bounds (pre-existing ln2_iot_devices columns)
                lid.tank_min_capacity_reading       AS sensor_min_kg,
                lid.tank_max_capacity_reading       AS sensor_max_kg,

                -- Detection thresholds (added by migration 001)
                lid.closed_noise_margin_kg_per_h,
                lid.open_rate_min_kg_per_h,
                lid.refill_threshold_kg,

                -- Rolling-window / debounce (added by migration 001)
                lid.window_minutes,
                lid.window_min_points,
                lid.consecutive_windows_for_state

            FROM devices d
            JOIN ln2_iot_devices lid ON lid.device_id = d.id
            JOIN tanks           t   ON t.tank_id     = lid.tank_id
            WHERE d.device_code = $1
                tank_id=int(row["tank_id"]),
                tank_code=str(row["tank_code"]),
            """,
            device_code,
        )

        if row is None:
            return None

        # Fall back to universal fault margin if the DB has no specific bounds
        sensor_min, sensor_max = _compute_sensor_bounds(
            empty_weight_kg=float(row["empty_weight_kg"]),
            full_weight_kg=float(row["full_weight_kg"]),
            sensor_min_kg=row["sensor_min_kg"],
            sensor_max_kg=row["sensor_max_kg"],
        )

        try:
            return DeviceConfig(
                device_code=device_code,
                device_pk=int(row["device_pk"]),
                tank_id=int(row["tank_id"]),
                empty_weight_kg=float(row["empty_weight_kg"]),
                full_weight_kg=float(row["full_weight_kg"]),
                capacity_liters=float(row["capacity_liters"]),
                static_evap_rate_l_per_day=float(row["static_evap_rate_l_per_day"]),
                sensor_min_kg=sensor_min,
                sensor_max_kg=sensor_max,
                closed_noise_margin_kg_per_h=float(row["closed_noise_margin_kg_per_h"]),
                open_rate_min_kg_per_h=float(row["open_rate_min_kg_per_h"]),
                refill_threshold_kg=float(row["refill_threshold_kg"]),
                window_minutes=int(row["window_minutes"]),
                window_min_points=int(row["window_min_points"]),
                consecutive_windows_for_state=int(row["consecutive_windows_for_state"]),
            )
        except (KeyError, TypeError, ValueError) as exc:
            logger.error(
                "Malformed calibration data for device_code=%s: %s",
                device_code, exc,
            )
            return None
