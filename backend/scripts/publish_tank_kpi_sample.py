#!/usr/bin/env python3
"""
Publish a sample tank KPI payload to Redis so the Quality Tracking live graph updates.

Channel: tank_kpi_readings_channel
The IVF quality WebSocket subscribes to this channel and broadcasts to connected clients;
the frontend Quality Tracking card shows live data when it receives type === "tank_kpi".

Usage:
  # From backend directory, with .env loaded (REDIS_URL):
  python scripts/publish_tank_kpi_sample.py [tank_id] [tank_code]

  Example (default tank_id=1, tank_code=T30):
  python scripts/publish_tank_kpi_sample.py
  python scripts/publish_tank_kpi_sample.py 1 T30

Redis CLI one-liner (timestamp inside each kpi):
  redis-cli PUBLISH tank_kpi_readings_channel '{"type":"tank_kpi","tank_id":1,"tank_code":"T30","kpis":[{"timestamp":"2026-02-22T13:00:00Z","name":"temp_external","value":26.5,"unit":"°C"},{"timestamp":"2026-02-22T13:00:00Z","name":"temp_internal","value":-199.2,"unit":"°C"},{"timestamp":"2026-02-22T13:00:00Z","name":"ln2_level","value":62,"unit":"%"},{"timestamp":"2026-02-22T13:00:00Z","name":"evaporation_rate","value":0.31,"unit":"kg/h"},{"timestamp":"2026-02-22T13:00:00Z","name":"battery_level","value":85,"unit":"%"},{"timestamp":"2026-02-22T13:00:00Z","name":"lid_status","value":1,"unit":""},{"timestamp":"2026-02-22T13:00:00Z","name":"shock","value":0,"unit":""}]}'
"""

import json
import os
import sys
from datetime import datetime, timezone

# Load .env from backend root so REDIS_URL is set when run via poetry/python
_script_dir = os.path.dirname(os.path.abspath(__file__))
_backend_dir = os.path.dirname(_script_dir)
_env_path = os.path.join(_backend_dir, ".env")
if os.path.isfile(_env_path):
    try:
        from dotenv import load_dotenv
        load_dotenv(_env_path)
    except ImportError:
        pass


def main() -> None:
    tank_id = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    tank_code = sys.argv[2] if len(sys.argv) > 2 else "T30"

    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
    payload = {
        "type": "tank_kpi",
        "tank_id": tank_id,
        "tank_code": tank_code,
        "kpis": [
            {"timestamp": ts, "name": "temp_external", "value": 26.5, "unit": "°C"},
            {"timestamp": ts, "name": "temp_internal", "value": -199.2, "unit": "°C"},
            {"timestamp": ts, "name": "ln2_level", "value": 62, "unit": "%"},
            {"timestamp": ts, "name": "evaporation_rate", "value": 0.31, "unit": "kg/h"},
            {"timestamp": ts, "name": "battery_level", "value": 85, "unit": "%"},
            {"timestamp": ts, "name": "lid_status", "value": 1, "unit": ""},
            {"timestamp": ts, "name": "shock", "value": 0, "unit": ""},
        ],
    }

    try:
        import redis
    except ImportError:
        print("Install redis: pip install redis")
        sys.exit(1)

    redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    try:
        r = redis.from_url(redis_url)
        msg = json.dumps(payload)
        r.publish("tank_kpi_readings_channel", msg)
        print(f"Published to tank_kpi_readings_channel for {tank_code} (tank_id={tank_id})")
        print("Payload:", msg)
    except redis.ConnectionError as e:
        print("Redis connection failed:", e, file=sys.stderr)
        print(
            "Make sure Redis is running (e.g. brew services start redis or docker run -p 6379:6379 redis). "
            "Set REDIS_URL in backend/.env if Redis is on another host.",
            file=sys.stderr,
        )
        sys.exit(1)


if __name__ == "__main__":
    main()
