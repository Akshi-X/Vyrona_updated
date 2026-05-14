#!/usr/bin/env python3
"""
Seed Site Level Information (PatientCrylockInfo) for testing the Dashboard table.
Creates ~150 rows with varied HIS #, Cryolock #, Canister #, Tank, Cane ID,
Goblet Color, Cryolock Color, Date of Vitrification, Status, Description.

Requires: hospital, branch, and tanks to exist (run init_db and seed_db first, or at least one IVF branch).

Run from backend directory:
  poetry run python scripts/seed_site_level.py
"""

import os
import sys
import logging
from datetime import datetime, timedelta, timezone

_script_dir = os.path.dirname(os.path.abspath(__file__))
_backend_dir = os.path.dirname(_script_dir)
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

_env_path = os.path.join(_backend_dir, ".env")
if os.path.isfile(_env_path):
    from dotenv import load_dotenv
    load_dotenv(_env_path)

from app.config.database import SessionLocal
from app.models.IVF.hospital_model import Hospital
from app.models.IVF.hospital_branch_model import HospitalBranch
from app.models.IVF.tank_model import Tank
from app.models.IVF.patient_crylock_info_model import PatientCrylockInfo

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger(__name__)


def _ensure_extra_branches(db, hospital):
    """Ensure hospital has extra branches (North Lab, South Lab) for Site Name filter variety."""
    for name in ["North Lab", "South Lab"]:
        existing = (
            db.query(HospitalBranch)
            .filter(
                HospitalBranch.hospital_id == hospital.hospital_id,
                HospitalBranch.branch_name == name,
            )
            .first()
        )
        if not existing:
            branch = HospitalBranch(
                hospital_id=hospital.hospital_id,
                branch_name=name,
                district_name="Demo",
                state_name="CA",
                country_name="USA",
            )
            db.add(branch)
            db.flush()
            # Create one tank per branch so crylocks can be assigned
            tank = Tank(
                branch_id=branch.branch_id,
                tank_code=f"T-{name.replace(' ', '')[:4]}",
                capacity_liters=100.0,
                is_active=True,
            )
            db.add(tank)
            logger.info(f"  Created branch '{name}' and tank for Site Level seed")
    db.commit()


def seed_site_level(db, target_count=150):
    """
    Seed PatientCrylockInfo for Site Level Information table.
    Uses first IVF hospital/branch and its tanks; creates rows up to target_count total for that branch.
    """
    hospital = db.query(Hospital).filter(Hospital.hospital_name == "ARC Fertility Hospitals").first()
    if not hospital:
        logger.warning("Hospital 'ARC Fertility Hospitals' not found. Run init_db first.")
        return
    branch = (
        db.query(HospitalBranch)
        .filter(HospitalBranch.hospital_id == hospital.hospital_id)
        .first()
    )
    if not branch:
        logger.warning("No branch found. Run init_db first.")
        return
    _ensure_extra_branches(db, hospital)
    # Re-fetch branch after possible commit in _ensure_extra_branches
    branch = (
        db.query(HospitalBranch)
        .filter(HospitalBranch.hospital_id == hospital.hospital_id)
        .first()
    )
    tanks = db.query(Tank).filter(Tank.branch_id == branch.branch_id).all()
    if not tanks:
        logger.warning("No tanks found for branch. Create tanks first (e.g. run seed_db).")
        return

    existing = (
        db.query(PatientCrylockInfo)
        .filter(PatientCrylockInfo.branch_id == branch.branch_id)
        .count()
    )
    if existing >= target_count:
        logger.info(f"Already {existing} crylocks (target {target_count}). Nothing to do.")
        return

    to_create = target_count - existing
    goblet_colors = ["Red", "Blue", "Green", "Yellow", "Clear", "Orange"]
    crylock_colors = ["Blue", "Red", "Green", "Pink", "White", "Purple"]
    cane_codes = ["E1", "E2", "A1", "B1", "C1"]
    used_pairs = set(
        (r.his_number, r.crylock_number)
        for r in db.query(PatientCrylockInfo.his_number, PatientCrylockInfo.crylock_number).all()
    )
    base_date = datetime.now(timezone.utc).date()
    created = 0
    n = 0
    while created < to_create:
        n += 1
        his = f"HIS{n + 1000:05d}"
        for ti, tank in enumerate(tanks):
            if created >= to_create:
                break
            tc = tank.tank_code or f"T{ti+1}0"
            for c in range(1, 11):
                if created >= to_create:
                    break
                crylock_num = f"{tc}/C{c}/E1/{n * 10 + c}"
                if (his, crylock_num) in used_pairs:
                    continue
                used_pairs.add((his, crylock_num))
                vitr_date = base_date - timedelta(days=(n + c) % 365)
                in_transit = (created % 5) == 0
                embryo_transfer = (created % 7) == 1 and not in_transit
                crylock = PatientCrylockInfo(
                    branch_id=branch.branch_id,
                    tank_id=tank.tank_id,
                    his_number=his,
                    crylock_number=crylock_num,
                    tank_code=tc,
                    canister_number=f"C{c}",
                    cane_code=cane_codes[(n + c) % len(cane_codes)],
                    position_number=(n + c) % 20 + 1,
                    cane_id_arc=str(5000 + created),
                    date_of_vitrification=vitr_date,
                    goblet_color=goblet_colors[created % len(goblet_colors)],
                    crylock_color=crylock_colors[created % len(crylock_colors)],
                    in_transit=in_transit,
                    embryo_transfer=embryo_transfer,
                    description=f"Note #{created + 1}" if (created % 4) == 0 else None,
                )
                db.add(crylock)
                created += 1
    db.commit()
    logger.info(f"Site Level seed: created {created} crylocks for {branch.branch_name} (total target {target_count}).")


# Unusual values for filter/table testing: Goblet Color, Cryolock Color, Date of Vitrification, Description, Site Name, Status
UNUSUAL_GOBLET_COLORS = ["Teal", "Magenta", "Amber", "Coral", "Lavender", "Bronze", "Slate", "Mint"]
UNUSUAL_CRYLOCK_COLORS = ["Teal", "Gold", "Silver", "Navy", "Mint", "Coral", "Charcoal", "Ivory"]
UNUSUAL_DESCRIPTIONS = [
    "High-priority transfer; handle with care",
    "Legacy batch 2020-03; re-vitrified",
    "Patient consent on file; do not thaw without approval",
    "QC hold – resolved 2024-01",
    "Long-term storage; next review 2026",
    "⚠ Special handling – fragile carrier",
    "Batch #X7-K9; external audit trail",
    "Donor cycle; consent verified",
]


def seed_site_level_unusual(db, count=24):
    """
    Seed PatientCrylockInfo rows with unusual values for Goblet Color, Cryolock Color,
    Date of Vitrification, Description, Site Name (branch), and Status (in_transit / embryo_transfer).
    Ensures extra branches exist, then creates `count` rows spread across branches.
    """
    hospital = db.query(Hospital).filter(Hospital.hospital_name == "ARC Fertility Hospitals").first()
    if not hospital:
        logger.warning("Hospital 'ARC Fertility Hospitals' not found. Run init_db first.")
        return
    _ensure_extra_branches(db, hospital)
    branches = (
        db.query(HospitalBranch)
        .filter(HospitalBranch.hospital_id == hospital.hospital_id)
        .all()
    )
    if not branches:
        logger.warning("No branches found.")
        return
    # Collect (branch, tank) so we have at least one tank per branch
    branch_tanks = []
    for b in branches:
        tank = db.query(Tank).filter(Tank.branch_id == b.branch_id).first()
        if tank:
            branch_tanks.append((b, tank))
    if not branch_tanks:
        logger.warning("No tanks found for any branch. Run seed_db first.")
        return

    used_pairs = set(
        (r.his_number, r.crylock_number)
        for r in db.query(PatientCrylockInfo.his_number, PatientCrylockInfo.crylock_number).all()
    )
    base_date = datetime.now(timezone.utc).date()
    # Unusual vitrification dates: old, leap-day, future-ish, etc.
    unusual_dates = [
        base_date - timedelta(days=900),
        base_date - timedelta(days=366),
        base_date - timedelta(days=100),
        base_date - timedelta(days=1),
        base_date,
        base_date + timedelta(days=1),
    ]
    # Ensure we have a leap day in the list for one row
    try:
        from datetime import date as date_type
        leap = date_type(2024, 2, 29)
        if leap not in unusual_dates:
            unusual_dates.append(leap)
    except Exception:
        pass

    created = 0
    n = 9000
    while created < count:
        n += 1
        his = f"HIS-U{n:05d}"
        for bi, (branch, tank) in enumerate(branch_tanks):
            if created >= count:
                break
            tc = tank.tank_code or f"T{bi}0"
            for c in range(1, 4):
                if created >= count:
                    break
                crylock_num = f"{tc}/CU{c}/E1/{n}"
                if (his, crylock_num) in used_pairs:
                    continue
                used_pairs.add((his, crylock_num))
                gix = created % len(UNUSUAL_GOBLET_COLORS)
                cix = created % len(UNUSUAL_CRYLOCK_COLORS)
                dix = created % len(unusual_dates)
                desc_ix = created % len(UNUSUAL_DESCRIPTIONS)
                in_transit = (created % 3) == 0
                embryo_transfer = (created % 3) == 1 and not in_transit
                crylock = PatientCrylockInfo(
                    branch_id=branch.branch_id,
                    tank_id=tank.tank_id,
                    his_number=his,
                    crylock_number=crylock_num,
                    tank_code=tc,
                    canister_number=f"CU{c}",
                    cane_code="E1",
                    position_number=created % 20 + 1,
                    cane_id_arc=str(9000 + created),
                    date_of_vitrification=unusual_dates[dix],
                    goblet_color=UNUSUAL_GOBLET_COLORS[gix],
                    crylock_color=UNUSUAL_CRYLOCK_COLORS[cix],
                    in_transit=in_transit,
                    embryo_transfer=embryo_transfer,
                    description=UNUSUAL_DESCRIPTIONS[desc_ix],
                )
                db.add(crylock)
                created += 1
    db.commit()
    logger.info(f"Site Level unusual seed: created {created} crylocks (unusual Goblet/Cryolock/Date/Description/Site/Status).")


def main():
    db = SessionLocal()
    try:
        seed_site_level(db)
        seed_site_level_unusual(db, count=24)
    finally:
        db.close()


if __name__ == "__main__":
    main()
