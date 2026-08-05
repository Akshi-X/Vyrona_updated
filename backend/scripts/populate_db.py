"""
populate_db.py — Populate users, hospitals, and hospital_branches tables.

Creates:
  - 4 Hospitals with branches
      1. ARC Fertility Hospitals        → 3 branches (Chennai, Bangalore, Hyderabad)
      2. Apollo Hospitals               → 2 branches (Delhi, Mumbai)
      3. Fortis Healthcare              → 2 branches (Kolkata, Pune)
      4. Max Super Speciality Hospital  → 1 branch  (Noida)
  - 4 Users:
      1. MyGrape Admin   (Mygrape_admin) — platform superadmin
      2. Pharma Admin    (Pharma_admin)  — belongs to a pharma company
      3. IVF Admin       (Admin)         — belongs to ARC Fertility, Main Branch
      4. IVF User 1      (User)          — belongs to ARC Fertility, Main Branch
      5. IVF User 2      (User)          — belongs to Apollo, Branch 1

Usage:
    cd /workspace/backend
    poetry run python populate_db.py
"""

import logging
import sys
import os
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


from sqlalchemy.orm import Session
from app.config.database import init_db as create_tables

from app.config.database import SessionLocal
from app.auth.auth import get_password_hash
from app.utils.utils import generate_user_id

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler()],
)
logger = logging.getLogger(__name__)


create_tables()

# ── Hospital & Branch Data ────────────────────────────────────────────────────

HOSPITALS = [
    {
        "hospital_name": "ARC Fertility Hospitals",
        "hospital_type": "IVF",
        "hospital_head_email": "head@arcfertility.com",
        "branches": [
            {
                "branch_name": "Chennai Main",
                "district_name": "Chennai",
                "state_name": "Tamil Nadu",
                "country_name": "India",
                "area": "Anna Nagar, Chennai",
                "pincode": "600040",
                "latitude": 13.0827,
                "longitude": 80.2707,
            },
            {
                "branch_name": "Bangalore",
                "district_name": "Bangalore Urban",
                "state_name": "Karnataka",
                "country_name": "India",
                "area": "Koramangala, Bangalore",
                "pincode": "560034",
                "latitude": 12.9716,
                "longitude": 77.5946,
            },
            {
                "branch_name": "Hyderabad",
                "district_name": "Hyderabad",
                "state_name": "Telangana",
                "country_name": "India",
                "area": "Banjara Hills, Hyderabad",
                "pincode": "500034",
                "latitude": 17.3850,
                "longitude": 78.4867,
            },
        ],
    },
    {
        "hospital_name": "Apollo Hospitals",
        "hospital_type": "Multi-Speciality",
        "hospital_head_email": "head@apollohospitals.com",
        "branches": [
            {
                "branch_name": "Delhi",
                "district_name": "New Delhi",
                "state_name": "Delhi",
                "country_name": "India",
                "area": "Sarita Vihar, Delhi",
                "pincode": "110076",
                "latitude": 28.6139,
                "longitude": 77.2090,
            },
            {
                "branch_name": "Mumbai",
                "district_name": "Mumbai",
                "state_name": "Maharashtra",
                "country_name": "India",
                "area": "Navi Mumbai",
                "pincode": "400614",
                "latitude": 19.0760,
                "longitude": 72.8777,
            },
        ],
    },
    {
        "hospital_name": "Fortis Healthcare",
        "hospital_type": "Multi-Speciality",
        "hospital_head_email": "head@fortishealthcare.com",
        "branches": [
            {
                "branch_name": "Kolkata",
                "district_name": "Kolkata",
                "state_name": "West Bengal",
                "country_name": "India",
                "area": "Anandapur, Kolkata",
                "pincode": "700107",
                "latitude": 22.5726,
                "longitude": 88.3639,
            },
            {
                "branch_name": "Pune",
                "district_name": "Pune",
                "state_name": "Maharashtra",
                "country_name": "India",
                "area": "Viman Nagar, Pune",
                "pincode": "411014",
                "latitude": 18.5204,
                "longitude": 73.8567,
            },
        ],
    },
    {
        "hospital_name": "Max Super Speciality Hospital",
        "hospital_type": "Super Speciality",
        "hospital_head_email": "head@maxhospital.com",
        "branches": [
            {
                "branch_name": "Noida",
                "district_name": "Gautam Buddha Nagar",
                "state_name": "Uttar Pradesh",
                "country_name": "India",
                "area": "Sector 19, Noida",
                "pincode": "201301",
                "latitude": 28.5355,
                "longitude": 77.3910,
            },
        ],
    },
]


# ── User Data ─────────────────────────────────────────────────────────────────

USERS = [
    {
        "first_name": "Admin",
        "last_name": "User",
        "email": "admin@test.com",
        "password": "Admin123",
        "role": "Admin",
        "pharma_id": None,
        "pharma_name": None,
        "hospital_name": "ARC Fertility Hospitals",
        "branch_name": "Chennai Main",
        "department": "IT",
    },
    {
        "first_name": "Branch",
        "last_name": "Manager",
        "email": "manager@test.com",
        "password": "Admin123",
        "role": "Manager",
        "pharma_id": None,
        "pharma_name": None,
        "hospital_name": "ARC Fertility Hospitals",
        "branch_name": "Bangalore",
        "department": "Operations",
    },
    {
        "first_name": "Doctor",
        "last_name": "Staff",
        "email": "doctor@test.com",
        "password": "Admin123",
        "role": "User",
        "pharma_id": None,
        "pharma_name": None,
        "hospital_name": "ARC Fertility Hospitals",
        "branch_name": "Hyderabad",
        "department": "Medical",
    },
    {
        "first_name": "Priya",
        "last_name": "Raman",
        "email": "priya.ivf@test.com",
        "password": "Ivf@1234",
        "role": "User",
        "pharma_id": None,
        "pharma_name": None,
        "hospital_name": "ARC Fertility Hospitals",
        "branch_name": "Chennai Main",
        "department": "IVF",
    },
]


# ── Pharma Company Data ───────────────────────────────────────────────────────

PHARMA_COMPANIES = [
    {
        "pharma_name": "Pharma Company A",
        "location": "Mumbai, India",
    },
]


def create_pharma_companies(db: Session):
    """Create pharma companies."""
    from app.models.pharma_model import Pharma

    logger.info("Creating pharma companies...")
    pharma_map = {}  # pharma_name -> pharma_id

    for p_data in PHARMA_COMPANIES:
        existing = (
            db.query(Pharma).filter(Pharma.pharma_name == p_data["pharma_name"]).first()
        )

        if existing:
            logger.info(f"  Pharma company already exists: {p_data['pharma_name']}")
            pharma = existing
        else:
            pharma = Pharma(
                pharma_name=p_data["pharma_name"],
                location=p_data["location"],
                created_at=datetime.now(timezone.utc),
                created_by="system",
            )
            db.add(pharma)
            db.flush()
            logger.info(
                f"  Created pharma company: {pharma.pharma_name} (id={pharma.id})"
            )
        pharma_map[p_data["pharma_name"]] = pharma.id

    db.commit()
    logger.info("Pharma companies created successfully.")
    return pharma_map


# ── Hospital Creation ─────────────────────────────────────────────────────────


def create_hospitals_and_branches(db: Session):
    """Create hospitals and their branches."""
    from app.models.IVF.hospital_model import Hospital
    from app.models.IVF.hospital_branch_model import HospitalBranch

    logger.info("Creating hospitals and branches...")
    hospital_map = {}  # hospital_name -> hospital_id
    branch_map = {}  # (hospital_name, branch_name) -> branch_id

    for h_data in HOSPITALS:
        # Check if hospital already exists
        existing = (
            db.query(Hospital)
            .filter(Hospital.hospital_name == h_data["hospital_name"])
            .first()
        )

        if existing:
            logger.info(f"  Hospital already exists: {h_data['hospital_name']}")
            hospital = existing
        else:
            hospital = Hospital(
                hospital_name=h_data["hospital_name"],
                hospital_type=h_data["hospital_type"],
                hospital_head_email=h_data["hospital_head_email"],
                created_at=datetime.now(timezone.utc),
                created_by="system",
            )
            db.add(hospital)
            db.flush()
            logger.info(
                f"  Created hospital: {hospital.hospital_name} (id={hospital.hospital_id})"
            )

        hospital_map[h_data["hospital_name"]] = hospital.hospital_id

        for b_data in h_data["branches"]:
            existing_branch = (
                db.query(HospitalBranch)
                .filter(
                    HospitalBranch.hospital_id == hospital.hospital_id,
                    HospitalBranch.branch_name == b_data["branch_name"],
                )
                .first()
            )

            if existing_branch:
                logger.info(f"    Branch already exists: {b_data['branch_name']}")
                branch = existing_branch
            else:
                branch = HospitalBranch(
                    hospital_id=hospital.hospital_id,
                    branch_name=b_data["branch_name"],
                    district_name=b_data["district_name"],
                    state_name=b_data["state_name"],
                    country_name=b_data["country_name"],
                    area=b_data["area"],
                    pincode=b_data["pincode"],
                    latitude=b_data["latitude"],
                    longitude=b_data["longitude"],
                    created_at=datetime.now(timezone.utc),
                    created_by="system",
                )
                db.add(branch)
                db.flush()
                logger.info(
                    f"    Created branch: {branch.branch_name} (id={branch.branch_id})"
                )

            branch_map[(h_data["hospital_name"], b_data["branch_name"])] = (
                branch.branch_id
            )

    db.commit()
    logger.info("Hospitals and branches created successfully.")
    return hospital_map, branch_map


# ── User Creation ─────────────────────────────────────────────────────────────


def create_users(db: Session, hospital_map: dict, branch_map: dict, pharma_map: dict):
    """Create users."""
    from app.models.user_model import User
    from app.models.pharma_model import Pharma

    logger.info("Creating users...")

    for u_data in USERS:
        # Check if user already exists
        existing = db.query(User).filter(User.email == u_data["email"]).first()
        if existing:
            logger.info(f"  User already exists: {u_data['email']}")
            continue

        # Resolve hospital_id, branch_id, and pharma_id
        hospital_id = None
        branch_id = None
        pharma_id = None

        if u_data["hospital_name"]:
            hospital_id = hospital_map.get(u_data["hospital_name"])
            if u_data["branch_name"]:
                branch_id = branch_map.get(
                    (u_data["hospital_name"], u_data["branch_name"])
                )

        if u_data["pharma_name"]:
            pharma_id = pharma_map.get(u_data["pharma_name"])

        user = User(
            user_id=generate_user_id(),
            first_name=u_data["first_name"],
            last_name=u_data["last_name"],
            email=u_data["email"],
            password_hash=get_password_hash(u_data["password"]),
            role=u_data["role"],
            pharma_id=pharma_id,  # Use the resolved pharma_id
            hospital_id=hospital_id,
            branch_id=branch_id,
            department=u_data["department"],
            status=True,
            approved_status="approved",
            onboarding_completed=True,
            created_at=datetime.now(timezone.utc),
            created_by="system",
            updated_by="system",
        )
        db.add(user)
        logger.info(f"  Created user: {u_data['email']} (role={u_data['role']})")

    db.commit()
    logger.info("Users created successfully.")


# ── Main ──────────────────────────────────────────────────────────────────────


def run():
    db = SessionLocal()
    try:
        pharma_map = create_pharma_companies(db)
        hospital_map, branch_map = create_hospitals_and_branches(db)
        create_users(db, hospital_map, branch_map, pharma_map)

        logger.info("\n" + "=" * 60)
        logger.info("  ✅ DATABASE POPULATION COMPLETE!")
        logger.info("=" * 60)
        logger.info("\nCreated accounts:")
        for u in USERS:
            logger.info(f"  {u['role']:<20} {u['email']}  /  password: {u['password']}")

    except Exception as e:
        db.rollback()
        logger.error(f"❌ Population failed: {e}", exc_info=True)
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    run()
