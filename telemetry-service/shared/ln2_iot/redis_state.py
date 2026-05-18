"""
redis_state.py
--------------
Manages all per-device mutable runtime state in Redis.

Changes in this version
────────────────────────
  • _MAX_WINDOW_LEN is now computed per-device from cfg.window_minutes
    instead of a single global constant, because different devices can
    have different configured window widths.
  • append_window_point and get_window_points both accept a DeviceConfig
    so trimming and cutoff arithmetic use the right window size.

Redis key schema (unchanged)
────────────────────────────
  ln2:{device_code}:window   LIST  – JSON (iso_ts, mass_kg), newest at tail
  ln2:{device_code}:state    HASH  – current_state, counters, last_rate, last_updated
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta
from typing import Optional

import redis.asyncio as aioredis

from . import config
from .device_config import DeviceConfig
from .ln2_logic import EVAP_RATE_BUCKET_MINUTES, EVAP_RATE_WINDOW_HOURS

logger = logging.getLogger(__name__)


class RedisStateManager:
    """
    Async wrapper around all Redis I/O for LN2 device runtime state.

    Usage (one shared instance per process):
        rsm = RedisStateManager()
        await rsm.connect()
        ...
        await rsm.close()
    """

    def __init__(self) -> None:
        self._pool: Optional[aioredis.Redis] = None

    # ─────────────────────────────────────────────
    # Lifecycle
    # ─────────────────────────────────────────────

    async def connect(self) -> None:
        self._pool = aioredis.Redis(
            host=config.REDIS_HOST,
            port=config.REDIS_PORT,
            db=config.REDIS_DB,
            password=config.REDIS_PASSWORD,
            decode_responses=True,
            socket_connect_timeout=5,
        )
        await self._pool.ping()
        logger.info("Redis connection established.")

    async def close(self) -> None:
        if self._pool:
            await self._pool.aclose()

    # ─────────────────────────────────────────────
    # Internal helpers
    # ─────────────────────────────────────────────

    def _window_key(self, device_code: str) -> str:
        return f"ln2:{device_code}:window"

    def _state_key(self, device_code: str) -> str:
        return f"ln2:{device_code}:state"

    def _rate_bucket_key(self, device_code: str) -> str:
        return f"ln2:{device_code}:rate_buckets"

    def _rate_bucket_state_key(self, device_code: str) -> str:
        return f"ln2:{device_code}:rate_bucket_state"

    @staticmethod
    def _max_window_len(cfg: DeviceConfig) -> int:
        """
        Maximum LIST entries to retain in Redis.
        At 1 reading/s: window_minutes * 60 readings, plus headroom.
        Each device can have a different window_minutes so this is per-device.
        """
        return cfg.window_minutes * 60 + 120

    # ─────────────────────────────────────────────
    # Sliding window (LIST)
    # ─────────────────────────────────────────────

    async def append_window_point(
        self,
        device_code: str,
        timestamp: datetime,
        mass_kg: float,
        cfg: DeviceConfig,
    ) -> None:
        """
        Append a (timestamp, mass) pair to this device's sliding window,
        trim the list to cfg-appropriate length, and refresh the TTL.
        All in one pipeline to minimise round-trips.
        """
        key   = self._window_key(device_code)
        entry = json.dumps({"ts": timestamp.isoformat(), "mass": round(mass_kg, 6)})
        max_len = self._max_window_len(cfg)

        async with self._pool.pipeline(transaction=False) as pipe:
            pipe.rpush(key, entry)
            pipe.ltrim(key, -max_len, -1)
            pipe.expire(key, config.REDIS_STATE_TTL_SECONDS)
            await pipe.execute()

    async def get_window_points(
        self,
        device_code: str,
        cutoff_ts: datetime,
    ) -> list[tuple[datetime, float]]:
        """
        Return all (timestamp, mass) pairs newer than *cutoff_ts*.
        Stale leading entries are lazily pruned from the list.
        """
        key      = self._window_key(device_code)
        raw_list = await self._pool.lrange(key, 0, -1)

        points:      list[tuple[datetime, float]] = []
        stale_count: int = 0

        for raw in raw_list:
            try:
                obj  = json.loads(raw)
                ts   = datetime.fromisoformat(obj["ts"])
                mass = float(obj["mass"])
            except (json.JSONDecodeError, KeyError, ValueError) as exc:
                logger.warning(
                    "Corrupt window entry for device=%s: %s – %s",
                    device_code, raw, exc,
                )
                stale_count += 1
                continue

            if ts >= cutoff_ts:
                points.append((ts, mass))
            else:
                stale_count += 1

        if stale_count:
            keep_from = len(raw_list) - len(points)
            if keep_from > 0:
                await self._pool.ltrim(key, keep_from, -1)

        return points

    async def clear_window(self, device_code: str) -> None:
        """Delete the entire window list for this device (e.g. after a refill)."""
        await self._pool.delete(self._window_key(device_code))

    # ─────────────────────────────────────────────
    # Evaporation rate buckets (LIST + HASH)
    # ─────────────────────────────────────────────

    @staticmethod
    def _rate_bucket_start(ts: datetime) -> datetime:
        minute = (ts.minute // EVAP_RATE_BUCKET_MINUTES) * EVAP_RATE_BUCKET_MINUTES
        return ts.replace(minute=minute, second=0, microsecond=0)

    @staticmethod
    def _rate_bucket_max_len() -> int:
        return int((EVAP_RATE_WINDOW_HOURS * 60) / EVAP_RATE_BUCKET_MINUTES) + 24

    async def update_rate_bucket(
        self,
        device_code: str,
        timestamp: datetime,
        mass_kg: float,
    ) -> None:
        """Update the in-progress bucket; finalize the previous bucket on rollover."""
        state_key = self._rate_bucket_state_key(device_code)
        bucket_key = self._rate_bucket_key(device_code)
        bucket_start = self._rate_bucket_start(timestamp).isoformat()

        state = await self._pool.hgetall(state_key)

        if state and state.get("bucket_start") == bucket_start:
            sum_mass = float(state.get("sum_mass", 0.0)) + mass_kg
            count = int(state.get("count", 0)) + 1
            async with self._pool.pipeline(transaction=False) as pipe:
                pipe.hset(state_key, mapping={
                    "bucket_start": bucket_start,
                    "sum_mass": str(round(sum_mass, 6)),
                    "count": str(count),
                })
                pipe.expire(state_key, config.REDIS_STATE_TTL_SECONDS)
                await pipe.execute()
            return

        async with self._pool.pipeline(transaction=False) as pipe:
            if state and state.get("count") not in (None, "0", ""):
                try:
                    prev_sum = float(state.get("sum_mass", 0.0))
                    prev_count = int(state.get("count", 0))
                    if prev_count > 0:
                        avg_mass = prev_sum / prev_count
                        entry = json.dumps(
                            {"ts": state.get("bucket_start"), "avg_mass": round(avg_mass, 6)}
                        )
                        max_len = self._rate_bucket_max_len()
                        pipe.rpush(bucket_key, entry)
                        pipe.ltrim(bucket_key, -max_len, -1)
                        pipe.expire(bucket_key, config.REDIS_STATE_TTL_SECONDS)
                except (ValueError, TypeError):
                    pass

            pipe.hset(state_key, mapping={
                "bucket_start": bucket_start,
                "sum_mass": str(round(mass_kg, 6)),
                "count": "1",
            })
            pipe.expire(state_key, config.REDIS_STATE_TTL_SECONDS)
            await pipe.execute()

    async def get_rate_buckets(
        self,
        device_code: str,
        cutoff_ts: datetime,
    ) -> list[tuple[datetime, float]]:
        key = self._rate_bucket_key(device_code)
        raw_list = await self._pool.lrange(key, 0, -1)

        points: list[tuple[datetime, float]] = []
        stale_count: int = 0

        for raw in raw_list:
            try:
                obj = json.loads(raw)
                ts = datetime.fromisoformat(obj["ts"])
                mass = float(obj["avg_mass"])
            except (json.JSONDecodeError, KeyError, ValueError) as exc:
                logger.warning(
                    "Corrupt rate bucket entry for device=%s: %s – %s",
                    device_code, raw, exc,
                )
                stale_count += 1
                continue

            if ts >= cutoff_ts:
                points.append((ts, mass))
            else:
                stale_count += 1

        if stale_count:
            keep_from = len(raw_list) - len(points)
            if keep_from > 0:
                await self._pool.ltrim(key, keep_from, -1)

        return points

    async def clear_rate_buckets(self, device_code: str) -> None:
        async with self._pool.pipeline(transaction=False) as pipe:
            pipe.delete(self._rate_bucket_key(device_code))
            pipe.delete(self._rate_bucket_state_key(device_code))
            await pipe.execute()

    # ─────────────────────────────────────────────
    # Lid state (HASH)
    # ─────────────────────────────────────────────

    async def get_device_state(self, device_code: str) -> dict:
        """
        Return the current runtime state dict for *device_code*.
        Fields: current_state, open_counter, closed_counter,
                last_rate_kg_per_h, last_updated,
                low_level_counter, lid_candidate_since.
        """
        key  = self._state_key(device_code)
        data = await self._pool.hgetall(key)

        if not data:
            return {
                "current_state":    "UNKNOWN",
                "open_counter":     0,
                "closed_counter":   0,
                "last_rate_kg_per_h": None,
                "last_updated":     None,
                "low_level_counter": 0,
                "lid_candidate_since": None,
            }

        return {
            "current_state":  data.get("current_state", "UNKNOWN"),
            "open_counter":   int(data.get("open_counter", 0)),
            "closed_counter": int(data.get("closed_counter", 0)),
            "last_rate_kg_per_h": (
                float(data["last_rate_kg_per_h"])
                if data.get("last_rate_kg_per_h") not in (None, "None", "")
                else None
            ),
            "last_updated": data.get("last_updated"),
            "low_level_counter": int(data.get("low_level_counter", 0)),
            "lid_candidate_since": (
                data["lid_candidate_since"]
                if data.get("lid_candidate_since") not in (None, "None", "")
                else None
            ),
        }

    async def save_device_state(
        self,
        device_code: str,
        current_state: str,
        open_counter: int,
        closed_counter: int,
        last_rate_kg_per_h: Optional[float],
        last_updated: datetime,
        low_level_counter: int = 0,
        lid_candidate_since: Optional[str] = None,
    ) -> None:
        key     = self._state_key(device_code)
        mapping = {
            "current_state":      current_state,
            "open_counter":       str(open_counter),
            "closed_counter":     str(closed_counter),
            "last_rate_kg_per_h": (
                str(round(last_rate_kg_per_h, 6))
                if last_rate_kg_per_h is not None
                else "None"
            ),
            "last_updated": last_updated.isoformat(),
            "low_level_counter": str(low_level_counter),
            "lid_candidate_since": lid_candidate_since if lid_candidate_since else "None",
        }
        async with self._pool.pipeline(transaction=False) as pipe:
            pipe.hset(key, mapping=mapping)
            pipe.expire(key, config.REDIS_STATE_TTL_SECONDS)
            await pipe.execute()

    async def remove_spike_points(
        self,
        device_code: str,
        spike_cutoff: datetime,
    ) -> None:
        """
        Remove window points that are part of a transient spike.

        Deletes all entries with timestamp ≥ spike_cutoff from the window
        list.  Called after detect_transient_spike returns True.
        """
        key      = self._window_key(device_code)
        raw_list = await self._pool.lrange(key, 0, -1)

        keep: list[str] = []
        for raw in raw_list:
            try:
                obj = json.loads(raw)
                ts  = datetime.fromisoformat(obj["ts"])
            except (json.JSONDecodeError, KeyError, ValueError):
                continue
            if ts < spike_cutoff:
                keep.append(raw)

        async with self._pool.pipeline(transaction=False) as pipe:
            pipe.delete(key)
            if keep:
                pipe.rpush(key, *keep)
            pipe.expire(key, config.REDIS_STATE_TTL_SECONDS)
            await pipe.execute()

        logger.info(
            "Removed spike points from window for device=%s (cutoff=%s, kept=%d)",
            device_code, spike_cutoff.isoformat(), len(keep),
        )
