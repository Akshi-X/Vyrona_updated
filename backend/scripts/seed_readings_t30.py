#!/usr/bin/env python3
"""
Seed 5 Quality Tracking readings for T30 only. Uses existing KPI config (does not change config).

Run from backend directory:
  poetry run python scripts/seed_readings_t30.py
"""

import os
import sys

_script_dir = os.path.dirname(os.path.abspath(__file__))
_backend_dir = os.path.dirname(_script_dir)
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

_env_path = os.path.join(_backend_dir, ".env")
if os.path.isfile(_env_path):
    from dotenv import load_dotenv
    load_dotenv(_env_path)

from app.config.database import SessionLocal
from app.models.IVF.tank_model import Tank
from seed_db import seed_kpi_readings


def main():
    db = SessionLocal()
    try:
        tanks = db.query(Tank).all()
        seed_kpi_readings(db, tanks)
    finally:
        db.close()


if __name__ == "__main__":
    main()
