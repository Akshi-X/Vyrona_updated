#!/usr/bin/env python3
"""
Seed branch(es), tanks, and full T10 demo data for Yellow IVF (hospital_id=3).
Creates: one branch "Main Lab", tanks T10–T50, and full T10 demo data (crylocks,
telemetry, LN2, KPI config/readings).

Run from backend/: poetry run python scripts/seed_yellow_ivf.py
"""
import logging
import sys
from pathlib import Path

_backend = Path(__file__).resolve().parent.parent
_scripts = Path(__file__).resolve().parent
for p in (str(_backend), str(_scripts)):
    if p not in sys.path:
        sys.path.insert(0, p)

from app.config.database import SessionLocal
from app.models.IVF.hospital_model import Hospital
from app.models.IVF.hospital_branch_model import HospitalBranch
from app.models.IVF.tank_model import Tank
from app.constants.enums import CanisterStatus

# Reuse T10 seed logic (import from same directory)
import seed_t10_data

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger(__name__)
logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)

YELLOW_IVF_HOSPITAL_ID = 3
BRANCH_NAME = "Main Lab"

TANK_DETAILS = [
    {"tank_code": "T10", "capacity_liters": 100.0, "status": CanisterStatus.SAFE, "tank_id_arc": "5471", "tive_device_id": "J712149"},
    {"tank_code": "T20", "capacity_liters": 180.0, "status": CanisterStatus.SAFE, "tank_id_arc": "5472", "tive_device_id": "J712150"},
    {"tank_code": "T30", "capacity_liters": 100.0, "status": CanisterStatus.SAFE, "tank_id_arc": "5473", "tive_device_id": "J712151"},
    {"tank_code": "T40", "capacity_liters": 250.0, "status": CanisterStatus.RISK, "tank_id_arc": "5474", "tive_device_id": "J712152"},
    {"tank_code": "T50", "capacity_liters": 180.0, "status": CanisterStatus.SAFE, "tank_id_arc": "5475", "tive_device_id": None},
]


def get_or_create_yellow_ivf_branch(db):
    """Get or create Yellow IVF (hospital_id=3) and a Main Lab branch. Returns (hospital, branch)."""
    hospital = db.query(Hospital).filter(Hospital.hospital_id == YELLOW_IVF_HOSPITAL_ID).first()
    if not hospital:
        logger.error(f"Hospital with hospital_id={YELLOW_IVF_HOSPITAL_ID} (Yellow IVF) not found.")
        sys.exit(1)

    branch = (
        db.query(HospitalBranch)
        .filter(
            HospitalBranch.hospital_id == YELLOW_IVF_HOSPITAL_ID,
            HospitalBranch.branch_name == BRANCH_NAME,
        )
        .first()
    )
    if not branch:
        branch = HospitalBranch(
            hospital_id=YELLOW_IVF_HOSPITAL_ID,
            branch_name=BRANCH_NAME,
            district_name="Demo",
            state_name="CA",
            country_name="India",
        )
        db.add(branch)
        db.flush()
        db.commit()
        logger.info(f"Created branch '{BRANCH_NAME}' for Yellow IVF (hospital_id={YELLOW_IVF_HOSPITAL_ID}).")
    else:
        logger.info(f"Using existing branch '{BRANCH_NAME}' (branch_id={branch.branch_id}).")
    return hospital, branch


def seed_tanks_for_branch(db, branch_id: int) -> None:
    """Create T10–T50 on the branch if not present."""
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
        logger.info(f"Created {added} tanks for branch_id={branch_id}.")
    else:
        logger.info(f"Branch_id={branch_id} already has all tanks.")


def run():
    db = SessionLocal()
    try:
        hospital, branch = get_or_create_yellow_ivf_branch(db)
        branch_id = branch.branch_id
        seed_tanks_for_branch(db, branch_id)

        # Full T10 demo data (crylocks, telemetry, LN2, KPI)
        tank, branch = seed_t10_data.get_or_create_t10(db, branch_id)
        logger.info(f"Seeding T10 demo data for Yellow IVF (tank_id={tank.tank_id}, branch={branch.branch_name})")
        seed_t10_data.seed_crylocks(db, branch, tank)
        seed_t10_data.seed_telemetry_and_quality_log(db, tank)
        seed_t10_data.seed_ln2_and_raw(db, branch, tank)
        seed_t10_data.seed_kpi_config(db, branch, tank)
        seed_t10_data.seed_kpi_readings(db, branch, tank)
        logger.info("Done. Yellow IVF has branch, tanks, and T10 demo data.")
    except Exception as e:
        db.rollback()
        logger.exception(e)
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    run()
