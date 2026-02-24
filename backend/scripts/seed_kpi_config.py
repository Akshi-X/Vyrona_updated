#!/usr/bin/env python3
"""
Clear all kpi_config rows and seed KPI config for T30 only.

Run from backend directory:
  poetry run python scripts/seed_kpi_config.py
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
from seed_db import clear_all_kpi_config, seed_kpi_config


def main():
    db = SessionLocal()
    try:
        clear_all_kpi_config(db)
        tanks = db.query(Tank).all()
        seed_kpi_config(db, tanks)
    finally:
        db.close()


if __name__ == "__main__":
    main()
