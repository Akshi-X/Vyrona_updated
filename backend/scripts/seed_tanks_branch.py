#!/usr/bin/env python3
"""
Seed tank details for a specific branch (default branch_id=20).
Run from backend/: poetry run python scripts/seed_tanks_branch.py [branch_id]
"""
import argparse
import logging
import sys
from pathlib import Path

# Ensure backend root is on path so "app" resolves when run as script
_backend = Path(__file__).resolve().parent.parent
if str(_backend) not in sys.path:
    sys.path.insert(0, str(_backend))

from app.config.database import SessionLocal
from app.models.IVF.tank_model import Tank
from app.models.IVF.hospital_branch_model import HospitalBranch
from app.constants.enums import CanisterStatus

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger(__name__)
logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)

DEFAULT_BRANCH_ID = 20

TANK_DETAILS = [
    {"tank_code": "T10", "capacity_liters": 100.0, "status": CanisterStatus.SAFE, "tank_id_arc": "5471", "tive_device_id": "J712149"},
    {"tank_code": "T20", "capacity_liters": 180.0, "status": CanisterStatus.SAFE, "tank_id_arc": "5472", "tive_device_id": "J712150"},
    {"tank_code": "T30", "capacity_liters": 100.0, "status": CanisterStatus.SAFE, "tank_id_arc": "5473", "tive_device_id": "J712151"},
    {"tank_code": "T40", "capacity_liters": 250.0, "status": CanisterStatus.RISK, "tank_id_arc": "5474", "tive_device_id": "J712152"},
    {"tank_code": "T50", "capacity_liters": 180.0, "status": CanisterStatus.SAFE, "tank_id_arc": "5475", "tive_device_id": None},
]


def seed_tanks_for_branch(branch_id: int) -> None:
    db = SessionLocal()
    try:
        branch = db.query(HospitalBranch).filter(HospitalBranch.branch_id == branch_id).first()
        if not branch:
            logger.error(f"Branch id {branch_id} not found.")
            sys.exit(1)

        tanks = db.query(Tank).filter(Tank.branch_id == branch_id).all()
        existing_codes = {t.tank_code for t in tanks}
        added = 0
        for d in TANK_DETAILS:
            if d["tank_code"] in existing_codes:
                continue
            tank = Tank(
                branch_id=branch_id,
                tank_code=d["tank_code"],
                tank_id_arc=d["tank_id_arc"],
                capacity_liters=d["capacity_liters"],
                is_active=True,
                status=d["status"],
                tive_device_id=d.get("tive_device_id"),
            )
            db.add(tank)
            added += 1

        if added:
            db.commit()
            tanks = db.query(Tank).filter(Tank.branch_id == branch_id).all()
            logger.info(f"Created {added} tanks for branch_id={branch_id} (total {len(tanks)} tanks).")
        else:
            logger.info(f"Branch_id={branch_id} already has all tanks; nothing added.")
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser(description="Seed tank details for a branch")
    parser.add_argument("branch_id", type=int, nargs="?", default=DEFAULT_BRANCH_ID, help=f"Branch ID (default: {DEFAULT_BRANCH_ID})")
    args = parser.parse_args()
    seed_tanks_for_branch(args.branch_id)


if __name__ == "__main__":
    main()
