#!/usr/bin/env python3
"""
Continuously publish tank KPI payloads to Redis channel: tank_kpi_readings_channel.

Schedule:
- Every 1 second: ln2_level, lid_status, evaporation_rate
- Every 5 minutes: battery_level, shock, temp_external, temp_internal

Usage:
  python scripts/publish_tank_kpi_intervals.py
  python scripts/publish_tank_kpi_intervals.py 1
"""

import json
import os
import random
import sys
import time
from datetime import datetime, timezone
from typing import Any, Dict, List

# Load .env from backend root so REDIS_URL is available.
_script_dir = os.path.dirname(os.path.abspath(__file__))
_backend_dir = os.path.dirname(_script_dir)
_env_path = os.path.join(_backend_dir, ".env")
if os.path.isfile(_env_path):
    try:
        from dotenv import load_dotenv

        load_dotenv(_env_path)
    except ImportError:
        pass


# Explicit tank_id mention (can be overridden with CLI arg 1).
DEFAULT_TANK_ID = 1
FAST_INTERVAL_SECONDS = 1
SLOW_INTERVAL_SECONDS = 5 * 60
CHANNEL_NAME = "tank_kpi_readings_channel"


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def clamp(value: float, min_value: float, max_value: float) -> float:
    return max(min_value, min(max_value, value))


def build_fast_kpis(ts: str, state: Dict[str, float]) -> List[Dict[str, Any]]:
    # Small random walk so stream looks realistic.
    state["ln2_level"] = clamp(state["ln2_level"] + random.uniform(-0.2, 0.2), 20.0, 100.0)
    state["evaporation_rate"] = clamp(
        state["evaporation_rate"] + random.uniform(-0.01, 0.01), 0.05, 0.8
    )

    # Lid open/close simulated as 0/1 flips occasionally.
    if random.random() < 0.03:
        state["lid_status"] = 1.0 if state["lid_status"] == 0.0 else 0.0

    return [
        {"timestamp": ts, "name": "ln2_level", "value": round(state["ln2_level"], 2), "unit": "%"},
        {
            "timestamp": ts,
            "name": "evaporation_rate",
            "value": round(state["evaporation_rate"], 3),
            "unit": "kg/h",
        },
        {"timestamp": ts, "name": "lid_status", "value": int(state["lid_status"]), "unit": ""},
    ]


def build_slow_kpis(ts: str, state: Dict[str, float]) -> List[Dict[str, Any]]:
    state["battery_level"] = clamp(state["battery_level"] - random.uniform(0.0, 0.05), 5.0, 100.0)
    state["shock"] = 1.0 if random.random() < 0.01 else 0.0
    state["temp_external"] = clamp(state["temp_external"] + random.uniform(-0.2, 0.2), 15.0, 40.0)
    state["temp_internal"] = clamp(state["temp_internal"] + random.uniform(-0.1, 0.1), -205.0, -180.0)

    return [
        {
            "timestamp": ts,
            "name": "battery_level",
            "value": round(state["battery_level"], 2),
            "unit": "%",
        },
        {"timestamp": ts, "name": "shock", "value": int(state["shock"]), "unit": ""},
        {"timestamp": ts, "name": "temp_external", "value": round(state["temp_external"], 2), "unit": "C"},
        {"timestamp": ts, "name": "temp_internal", "value": round(state["temp_internal"], 2), "unit": "C"},
    ]


def main() -> None:
    tank_id = int(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_TANK_ID

    try:
        import redis
    except ImportError:
        print("Install redis: pip install redis")
        sys.exit(1)

    redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    state: Dict[str, float] = {
        "ln2_level": 62.0,
        "evaporation_rate": 0.31,
        "lid_status": 0.0,  # 0=closed, 1=open
        "battery_level": 85.0,
        "shock": 0.0,
        "temp_external": 26.5,
        "temp_internal": -199.2,
    }

    try:
        r = redis.from_url(redis_url)
        r.ping()
    except Exception as e:  # pragma: no cover
        print(f"Redis connection failed: {e}", file=sys.stderr)
        sys.exit(1)

    print(
        f"Publishing to {CHANNEL_NAME} for tank_id={tank_id}. "
        f"Fast every {FAST_INTERVAL_SECONDS}s, slow every {SLOW_INTERVAL_SECONDS}s."
    )

    next_slow_at = time.time()
    while True:
        now = time.time()
        ts = utc_now_iso()
        kpis = build_fast_kpis(ts, state)

        if now >= next_slow_at:
            kpis.extend(build_slow_kpis(ts, state))
            next_slow_at = now + SLOW_INTERVAL_SECONDS

        payload = {"type": "tank_kpi", "tank_id": tank_id, "kpis": kpis}
        msg = json.dumps(payload)
        r.publish(CHANNEL_NAME, msg)
        print(f"{ts} published {len(kpis)} KPI(s) for tank_id={tank_id}")

        time.sleep(FAST_INTERVAL_SECONDS)


if __name__ == "__main__":
    main()
