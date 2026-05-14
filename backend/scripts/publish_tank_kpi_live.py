#!/usr/bin/env python3
"""
Publish two different tank KPI payloads to Redis tank_kpi_readings_channel every 5 seconds,
alternating: example 1 (with kpi_config_id) then example 2 (kpi_config_id null).
Quality Tracking graph will live-update when viewing the matching tank_id.

Example 1: tank_id/tank_code for first tank, KPIs with kpi_config_id (matches kpi_config).
Example 2: tank_id/tank_code for second tank, KPIs with kpi_config_id null.

Usage:
  poetry run python scripts/publish_tank_kpi_live.py
  poetry run python scripts/publish_tank_kpi_live.py --tank1 17 --tank2 20
  poetry run python scripts/publish_tank_kpi_live.py --interval 5 --once   # publish each once and exit

Live test: Start Redis and the backend (so /api/kpi/ws subscriber forwards to clients).
Open IVF Track Shipment -> Quality Tracking for tank T10 or T40; run this script to see graph update every 5s.
Unit tests: pytest tests/scripts/test_publish_tank_kpi_live.py -v
"""
import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone

_script_dir = os.path.dirname(os.path.abspath(__file__))
_backend_dir = os.path.dirname(_script_dir)
_env_path = os.path.join(_backend_dir, ".env")
if os.path.isfile(_env_path):
    try:
        from dotenv import load_dotenv
        load_dotenv(_env_path)
    except ImportError:
        pass
if str(_backend_dir) not in sys.path:
    sys.path.insert(0, str(_backend_dir))

CHANNEL = "tank_kpi_readings_channel"

# KPI config IDs for tank_id=17 (Yellow IVF T10) - match seed_yellow_ivf_kpi_readings kpi_config
# temp_internal=154, temp_external=155, ln2_level=156, ln2_evaporation_rate=157, shock=158, tive_battery_percentage=159, ln2_lid_state=160
KPI_CONFIG_IDS = {
    "temp_internal": 154,
    "temp_external": 155,
    "ln2_level": 156,
    "ln2_evaporation_rate": 157,
    "shock": 158,
    "tive_battery_percentage": 159,
    "ln2_lid_state": 160,
}


def utc_ts_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def utc_ts_space() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def build_example1(tank_id: int, tank_code: str, variation: float = 0.0) -> dict:
    """Format with kpi_config_id (matches our kpi_config). Slight value variation for live feel."""
    ts = utc_ts_iso()
    v = variation
    kpis = [
        {"timestamp": ts, "name": "ln2_level", "value": round(33.04 + v, 2), "unit": "Kg", "deviation": False, "kpi_config_id": KPI_CONFIG_IDS["ln2_level"], "deviation_alert_sent": False},
        {"timestamp": ts, "name": "ln2_evaporation_rate", "value": round(0 + v * 0.01, 4), "unit": "Kg/day", "deviation": False, "kpi_config_id": KPI_CONFIG_IDS["ln2_evaporation_rate"], "deviation_alert_sent": False},
        {"timestamp": ts, "name": "ln2_lid_state", "value": 0, "unit": "state", "deviation": False, "kpi_config_id": KPI_CONFIG_IDS["ln2_lid_state"], "deviation_alert_sent": False},
        {"timestamp": ts, "name": "temp_internal", "value": round(-195.5 + v, 2), "unit": "°C", "deviation": False, "kpi_config_id": KPI_CONFIG_IDS["temp_internal"], "deviation_alert_sent": False},
        {"timestamp": ts, "name": "temp_external", "value": round(25.2 + v, 2), "unit": "°C", "deviation": False, "kpi_config_id": KPI_CONFIG_IDS["temp_external"], "deviation_alert_sent": False},
        {"timestamp": ts, "name": "shock", "value": 0, "unit": "g", "deviation": False, "kpi_config_id": KPI_CONFIG_IDS["shock"], "deviation_alert_sent": False},
        {"timestamp": ts, "name": "tive_battery_percentage", "value": round(88 - v * 2, 1), "unit": "%", "deviation": False, "kpi_config_id": KPI_CONFIG_IDS["tive_battery_percentage"], "deviation_alert_sent": False},
    ]
    return {"tank_id": tank_id, "tank_code": tank_code, "type": "tank_kpi", "kpis": kpis}


def build_example2(tank_id: int, tank_code: str, variation: float = 0.0) -> dict:
    """Format with kpi_config_id null (e.g. from device)."""
    ts = utc_ts_space()
    v = variation
    kpis = [
        {"timestamp": ts, "name": "temp_internal", "value": round(-185.5 + v, 2), "unit": "°C", "deviation": False, "kpi_config_id": None, "deviation_alert_sent": False},
        {"timestamp": ts, "name": "temp_external", "value": round(27.171875 + v, 4), "unit": "°C", "deviation": False, "kpi_config_id": None, "deviation_alert_sent": False},
        {"timestamp": ts, "name": "shock", "value": 1.0, "unit": "g", "deviation": False, "kpi_config_id": None, "deviation_alert_sent": False},
        {"timestamp": ts, "name": "tive_battery_percentage", "value": round(100.0 - v * 2, 1), "unit": "%", "deviation": False, "kpi_config_id": None, "deviation_alert_sent": False},
        {"timestamp": ts, "name": "ln2_level", "value": round(55 + v, 2), "unit": "%", "deviation": False, "kpi_config_id": None, "deviation_alert_sent": False},
        {"timestamp": ts, "name": "ln2_evaporation_rate", "value": round(0.06 + v * 0.01, 4), "unit": "%/day", "deviation": False, "kpi_config_id": None, "deviation_alert_sent": False},
        {"timestamp": ts, "name": "ln2_lid_state", "value": 0, "unit": None, "deviation": False, "kpi_config_id": None, "deviation_alert_sent": False},
    ]
    return {"tank_id": tank_id, "tank_code": tank_code, "type": "tank_kpi", "kpis": kpis}


def main(redis_client=None):
    """Run the publish loop. If redis_client is provided, use it; else create from REDIS_URL."""
    parser = argparse.ArgumentParser(description="Publish tank KPI payloads to Redis every 5s (example1 then example2)")
    parser.add_argument("--tank1", type=int, default=17, help="tank_id for example 1 (with kpi_config_id), e.g. T10")
    parser.add_argument("--code1", type=str, default="T10", help="tank_code for example 1")
    parser.add_argument("--tank2", type=int, default=20, help="tank_id for example 2 (kpi_config_id null), e.g. T40")
    parser.add_argument("--code2", type=str, default="T40", help="tank_code for example 2")
    parser.add_argument("--interval", type=float, default=5.0, help="Seconds between each publish (default 5)")
    parser.add_argument("--once", action="store_true", help="Publish each example once and exit (for testing)")
    parser.add_argument("--variation", type=float, default=0.5, help="Random-ish value variation (default 0.5)")
    args = parser.parse_args()

    r = redis_client
    if r is None:
        try:
            from app.service.redis_service import get_redis
            r = get_redis()
        except Exception as e:
            print(f"Redis connection failed: {e}", file=sys.stderr)
            print(
                "Ensure backend/.env has Redis config (REDIS_HOST, REDIS_PORT, REDIS_PASSWORD, etc.) "
                "or REDIS_URL, and Redis is reachable.",
                file=sys.stderr,
            )
            sys.exit(1)

    step = 0
    while True:
        step += 1
        # Example 1 first (with kpi_config_id)
        variation = (step % 10) * args.variation * 0.2  # mild variation over steps
        payload1 = build_example1(args.tank1, args.code1, variation)
        msg1 = json.dumps(payload1)
        r.publish(CHANNEL, msg1)
        print(f"[{datetime.now(timezone.utc).isoformat()}] Example 1: tank_id={args.tank1} {args.code1} -> {CHANNEL}")

        if args.once:
            time.sleep(0.5)
            payload2 = build_example2(args.tank2, args.code2, variation)
            msg2 = json.dumps(payload2)
            r.publish(CHANNEL, msg2)
            print(f"[{datetime.now(timezone.utc).isoformat()}] Example 2: tank_id={args.tank2} {args.code2} -> {CHANNEL}")
            print("Done (--once).")
            return

        time.sleep(args.interval)

        # Example 2 second (kpi_config_id null)
        step += 1
        variation = (step % 10) * args.variation * 0.2
        payload2 = build_example2(args.tank2, args.code2, variation)
        msg2 = json.dumps(payload2)
        r.publish(CHANNEL, msg2)
        print(f"[{datetime.now(timezone.utc).isoformat()}] Example 2: tank_id={args.tank2} {args.code2} -> {CHANNEL}")

        time.sleep(args.interval)


if __name__ == "__main__":
    main()
