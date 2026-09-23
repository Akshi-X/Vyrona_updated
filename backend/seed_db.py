#!/usr/bin/env python3
"""
seed_db.py — Unified Master Database Seeding Script.

Comprehensive, all-in-one database initialization and demo data seeding script.
Can be safely run on a fresh or existing database (fully idempotent with ZERO clashes).

Creates:
  1. Pharma Companies (Pharma Company A)
  2. Hospitals & Branches:
       - ARC Fertility Hospitals (Chennai Main, Bangalore, Hyderabad)
       - Apollo Hospitals (Delhi, Mumbai)
       - Fortis Healthcare (Kolkata, Pune)
       - Max Super Speciality Hospital (Noida)
  3. Platform Users:
       - Mygrape Admin     (Mygrape_admin)  — platform superadmin
       - Pharma Admin      (Pharma_admin)   — pharma company admin
       - IVF Admin         (Admin)          — ARC Fertility, Chennai Main
       - Branch Manager    (Manager)        — ARC Fertility, Bangalore
       - Doctor Staff      (User)           — ARC Fertility, Hyderabad
       - Priya Raman       (User)           — ARC Fertility, Chennai Main
  4. Cryotanks (T10, T20, T30, T40, T50, TIVE-TEST-999) with tare/gross weights & evap rates
  5. Patient Cryolocks / Embryos (PatientCrylockInfo)
  6. IoT Devices & LN2 Mappings (Device, Ln2IotDevice, Ln2Reading, Ln2IotRawData)
  7. Telemetry & Quality Logs (IVFTelemetryData, IVFQualityLog) for deviation tracking
  8. Preset KPI Configurations & Thresholds (KpiConfig) for tanks
  9. Demo KPI Readings & Snapshots (Readings)
 10. Refrigerators (REF-01, REF-02), Refrigerator Devices, KPI Configs & Zone Readings
 11. CGT Demo Data (Providers, Carriers, Patients, Shipments, Tasks, Feedback, Chat)

Usage:
  cd /workspace/backend
  poetry run python seed_db.py
"""

import logging
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from uuid import uuid4

# Ensure backend root is on sys.path regardless of execution CWD
_backend_dir = Path(__file__).resolve().parent
if str(_backend_dir) not in sys.path:
    sys.path.insert(0, str(_backend_dir))

from sqlalchemy import text
from sqlalchemy.orm import Session

# Database configuration & tables
from app.config.database import Base, SessionLocal, engine
from app.config.database import init_db as create_tables
from app.init_db import sync_chat_schema, sync_ivf_schema
from app.auth.auth import get_password_hash
from app.utils.utils import generate_user_id
from app.utils.patient_utils import generate_patient_id

# Enums
from app.constants.enums import (
    AffectedModule,
    ApprovalStatus,
    CanisterStatus,
    FeedbackDepartment,
    FeedbackPriority,
    FeedbackStatus,
    FeedbackType,
    PatientStage as PatientStageEnum,
    RouteStatus,
    TaskPriority,
    TaskStatus,
    UserRole,
)

# Models
from app.models.carrier_model import Carrier
from app.models.chat_model import ChatMessage
from app.models.feedback_comments import Comment
from app.models.feedback_model import Feedback
from app.models.kpi_config_model import KpiConfig
from app.models.patient_model import Patient
from app.models.patient_stage_model import PatientStage
from app.models.pharma_model import Pharma
from app.models.provider_model import Provider
from app.models.readings_model import Readings
from app.models.shipment_leg_document_model import ShipmentLegDocument
from app.models.shipment_leg_model import ShipmentLeg
from app.models.shipment_model import Shipment
from app.models.task_model import Tasks
from app.models.therapy_model import Therapy
from app.models.user_model import User

# IVF Models
from app.models.IVF.device_model import Device
from app.models.IVF.hospital_branch_model import HospitalBranch
from app.models.IVF.hospital_model import Hospital
from app.models.IVF.ivf_quality_log_model import IVFQualityLog
from app.models.IVF.ivf_shipment_model import IVFShipment
from app.models.IVF.ivf_telemetry_data_model import IVFTelemetryData
from app.models.IVF.ln2_iot_device_model import Ln2IotDevice
from app.models.IVF.ln2_iot_raw_data_model import Ln2IotRawData
from app.models.IVF.ln2_readings_model import Ln2Reading
from app.models.IVF.patient_crylock_info_model import PatientCrylockInfo
from app.models.IVF.refrigerator_device_model import RefrigeratorDevice
from app.models.IVF.refrigerator_model import Refrigerator
from app.models.IVF.refrigerator_raw_data_model import RefrigeratorRawData
from app.models.IVF.tank_model import Tank

# Optional Redis publishers
try:
    from app.service.quality_service import push_ivf_quality_to_redis
    from app.controller.IVF.ivf_quality_controller import push_ln2_reading_to_redis
except Exception:
    push_ivf_quality_to_redis = None
    push_ln2_reading_to_redis = None

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler()],
)
logger = logging.getLogger("seed_db")
logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)


# ==============================================================================
# 1. STATIC DEFINITIONS
# ==============================================================================

HOSPITALS_DATA = [
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

USERS_DATA = [
    {
        "first_name": "Platform",
        "last_name": "Superadmin",
        "email": "mygrape_admin@test.com",
        "password": "Admin123",
        "role": UserRole.MYGRAPE_ADMIN.value,
        "pharma_name": None,
        "hospital_name": None,
        "branch_name": None,
        "department": "Platform",
    },
    {
        "first_name": "Pharma",
        "last_name": "Admin",
        "email": "pharma_admin@test.com",
        "password": "Admin123",
        "role": UserRole.PHARMA_ADMIN.value,
        "pharma_name": "Pharma Company A",
        "hospital_name": None,
        "branch_name": None,
        "department": "Supply Chain",
    },
    {
        "first_name": "Admin",
        "last_name": "User",
        "email": "admin@test.com",
        "password": "Admin123",
        "role": UserRole.ADMIN.value,
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
        "role": UserRole.MANAGER.value,
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
        "role": UserRole.USER.value,
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
        "role": UserRole.USER.value,
        "pharma_name": None,
        "hospital_name": "ARC Fertility Hospitals",
        "branch_name": "Chennai Main",
        "department": "IVF",
    },
]

TANKS_DATA = [
    {
        "tank_code": "T10",
        "capacity_liters": 100.0,
        "status": CanisterStatus.SAFE,
        "tank_id_arc": "5471",
        "tive_device_id": "J712149",
        "empty_weight_kg": 15.9,
        "full_weight_kg": 54.1,
        "static_evap_rate_l_per_day": 0.38,
    },
    {
        "tank_code": "T20",
        "capacity_liters": 180.0,
        "status": CanisterStatus.SAFE,
        "tank_id_arc": "5472",
        "tive_device_id": "J712150",
        "empty_weight_kg": 22.0,
        "full_weight_kg": 78.0,
        "static_evap_rate_l_per_day": 0.45,
    },
    {
        "tank_code": "T30",
        "capacity_liters": 100.0,
        "status": CanisterStatus.SAFE,
        "tank_id_arc": "5473",
        "tive_device_id": "J712151",
        "empty_weight_kg": 15.9,
        "full_weight_kg": 54.1,
        "static_evap_rate_l_per_day": 0.38,
    },
    {
        "tank_code": "T40",
        "capacity_liters": 250.0,
        "status": CanisterStatus.RISK,
        "tank_id_arc": "5474",
        "tive_device_id": "J712152",
        "empty_weight_kg": 35.0,
        "full_weight_kg": 110.0,
        "static_evap_rate_l_per_day": 0.60,
    },
    {
        "tank_code": "T50",
        "capacity_liters": 180.0,
        "status": CanisterStatus.SAFE,
        "tank_id_arc": "5475",
        "tive_device_id": None,
        "empty_weight_kg": 22.0,
        "full_weight_kg": 78.0,
        "static_evap_rate_l_per_day": 0.45,
    },
    {
        "tank_code": "TIVE-TEST-999",
        "capacity_liters": 47.3,
        "status": CanisterStatus.SAFE,
        "tank_id_arc": None,
        "tive_device_id": "TIVE-TEST-001",
        "empty_weight_kg": 15.9,
        "full_weight_kg": 54.1,
        "static_evap_rate_l_per_day": 0.38,
    },
]


# ==============================================================================
# 2. SCHEMA & TABLE PREPARATION
# ==============================================================================

def ensure_schema_and_tables(db: Session) -> None:
    """Ensure database tables and columns exist before seeding."""
    logger.info("Verifying tables and applying schema sync...")
    try:
        create_tables()
    except Exception as e:
        logger.warning(f"  create_tables warning: {e}")

    try:
        sync_ivf_schema()
    except Exception as e:
        logger.warning(f"  sync_ivf_schema warning: {e}")

    try:
        sync_chat_schema()
    except Exception as e:
        logger.warning(f"  sync_chat_schema warning: {e}")

    # Ensure tank_status enum and tanks table columns exist
    try:
        db.execute(text("""
            DO $$ BEGIN
                CREATE TYPE tank_status AS ENUM ('safe', 'risk', 'critical');
            EXCEPTION WHEN duplicate_object THEN null;
            END $$;
        """))
        for col, defn in [
            ("tank_id_arc", "VARCHAR(255)"),
            ("tive_device_id", "VARCHAR(255)"),
            ("status", "tank_status DEFAULT 'safe'"),
            ("empty_weight_kg", "NUMERIC(10,2)"),
            ("full_weight_kg", "NUMERIC(10,2)"),
            ("static_evap_rate_l_per_day", "NUMERIC(10,4)"),
        ]:
            db.execute(text(f"ALTER TABLE tanks ADD COLUMN IF NOT EXISTS {col} {defn}"))
        db.commit()
    except Exception as e:
        db.rollback()
        logger.warning(f"  Tanks schema check: {e}")


# ==============================================================================
# 3. SEED PHARMA & HOSPITALS
# ==============================================================================

def seed_pharma_companies(db: Session) -> Dict[str, int]:
    """Seed pharma companies if missing. Returns name -> pharma_id mapping."""
    logger.info("Checking pharma companies...")
    pharma_map: Dict[str, int] = {}
    companies = [{"name": "Pharma Company A", "location": "Mumbai, India"}]

    for comp in companies:
        existing = db.query(Pharma).filter(Pharma.pharma_name == comp["name"]).first()
        if existing:
            logger.info(f"  Pharma company already exists: {comp['name']} (id={existing.id})")
            pharma = existing
        else:
            pharma = Pharma(
                pharma_name=comp["name"],
                location=comp["location"],
                created_at=datetime.now(timezone.utc),
                created_by="system",
            )
            db.add(pharma)
            db.flush()
            logger.info(f"  + Created pharma company: {pharma.pharma_name} (id={pharma.id})")
        pharma_map[comp["name"]] = pharma.id

    db.commit()
    return pharma_map


def seed_hospitals_and_branches(db: Session) -> Tuple[Dict[str, int], Dict[Tuple[str, str], int]]:
    """Seed hospitals and their branches. Returns (hospital_map, branch_map)."""
    logger.info("Checking hospitals and branches...")
    hospital_map: Dict[str, int] = {}
    branch_map: Dict[Tuple[str, str], int] = {}

    for h_data in HOSPITALS_DATA:
        hospital = db.query(Hospital).filter(Hospital.hospital_name == h_data["hospital_name"]).first()
        if hospital:
            logger.info(f"  Hospital already exists: {h_data['hospital_name']} (id={hospital.hospital_id})")
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
            logger.info(f"  + Created hospital: {hospital.hospital_name} (id={hospital.hospital_id})")

        hospital_map[h_data["hospital_name"]] = hospital.hospital_id

        for b_data in h_data["branches"]:
            branch = (
                db.query(HospitalBranch)
                .filter(
                    HospitalBranch.hospital_id == hospital.hospital_id,
                    HospitalBranch.branch_name == b_data["branch_name"],
                )
                .first()
            )
            if branch:
                logger.info(f"    Branch already exists: {b_data['branch_name']} (id={branch.branch_id})")
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
                logger.info(f"    + Created branch: {branch.branch_name} (id={branch.branch_id})")

            branch_map[(h_data["hospital_name"], b_data["branch_name"])] = branch.branch_id

    db.commit()
    return hospital_map, branch_map


# ==============================================================================
# 4. SEED USERS
# ==============================================================================

def seed_users(
    db: Session,
    hospital_map: Dict[str, int],
    branch_map: Dict[Tuple[str, str], int],
    pharma_map: Dict[str, int],
) -> None:
    """Create platform, pharma, and hospital users if they do not exist."""
    logger.info("Checking users...")
    for u_data in USERS_DATA:
        existing = db.query(User).filter(User.email == u_data["email"]).first()
        if existing:
            logger.info(f"  User already exists: {u_data['email']} (role={existing.role})")
            continue

        hospital_id = hospital_map.get(u_data["hospital_name"]) if u_data["hospital_name"] else None
        branch_id = (
            branch_map.get((u_data["hospital_name"], u_data["branch_name"]))
            if (u_data["hospital_name"] and u_data["branch_name"])
            else None
        )
        pharma_id = pharma_map.get(u_data["pharma_name"]) if u_data["pharma_name"] else None

        user = User(
            user_id=generate_user_id(),
            first_name=u_data["first_name"],
            last_name=u_data["last_name"],
            email=u_data["email"],
            password_hash=get_password_hash(u_data["password"]),
            role=u_data["role"],
            pharma_id=pharma_id,
            hospital_id=hospital_id,
            branch_id=branch_id,
            department=u_data["department"],
            status=True,
            approved_status=ApprovalStatus.APPROVED.value,
            onboarding_completed=True,
            created_at=datetime.now(timezone.utc),
            created_by="system",
            updated_by="system",
        )
        db.add(user)
        logger.info(f"  + Created user: {u_data['email']} (role={u_data['role']})")

    db.commit()


# ==============================================================================
# 5. SEED CRYOTANKS & CRYOLOCKS
# ==============================================================================

def seed_cryotanks(
    db: Session,
    primary_branch_id: int,
    branch_map: Dict[Tuple[str, str], int],
) -> List[Tank]:
    """Seed cryotanks for primary branches (ARC Fertility Chennai Main, etc.)."""
    logger.info("Checking cryotanks...")
    if not primary_branch_id:
        logger.warning("Primary branch Chennai Main not found; skipping tanks seed")
        return []

    # 1. Primary branch tanks (T10-T50, TIVE-TEST-999)
    existing_tanks = db.query(Tank).filter(Tank.branch_id == primary_branch_id).all()
    existing_codes = {t.tank_code for t in existing_tanks}
    added = 0

    for d in TANKS_DATA:
        if d["tank_code"] in existing_codes:
            continue
        tank = Tank(
            branch_id=primary_branch_id,
            tank_code=d["tank_code"],
            tank_id_arc=d.get("tank_id_arc"),
            capacity_liters=d["capacity_liters"],
            status=d["status"],
            is_active=True,
            tive_device_id=d.get("tive_device_id"),
            empty_weight_kg=d.get("empty_weight_kg"),
            full_weight_kg=d.get("full_weight_kg"),
            static_evap_rate_l_per_day=d.get("static_evap_rate_l_per_day"),
            created_at=datetime.now(timezone.utc),
            created_by="system",
        )
        db.add(tank)
        added += 1

    # 2. Seed basic tanks for other branches if missing
    other_branches = [
        branch_map.get(("ARC Fertility Hospitals", "Bangalore")),
        branch_map.get(("ARC Fertility Hospitals", "Hyderabad")),
    ]
    for b_id in other_branches:
        if not b_id:
            continue
        for code, cap in [("T10", 100.0), ("T20", 180.0)]:
            t_exists = db.query(Tank).filter(Tank.branch_id == b_id, Tank.tank_code == code).first()
            if not t_exists:
                db.add(Tank(
                    branch_id=b_id,
                    tank_code=code,
                    capacity_liters=cap,
                    status=CanisterStatus.SAFE,
                    is_active=True,
                    empty_weight_kg=15.9,
                    full_weight_kg=54.1,
                    created_at=datetime.now(timezone.utc),
                    created_by="system",
                ))
                added += 1

    if added:
        db.commit()
        logger.info(f"  + Created {added} new tank(s)")
    else:
        logger.info("  All tanks already exist; no duplicates created")

    return db.query(Tank).filter(Tank.branch_id == primary_branch_id).all()


def seed_cryolocks(db: Session, branch_id: int, tanks: List[Tank]) -> List[PatientCrylockInfo]:
    """Seed patient cryolocks / embryos across tanks."""
    logger.info("Checking patient cryolocks...")
    existing = db.query(PatientCrylockInfo).filter(PatientCrylockInfo.branch_id == branch_id).count()
    if existing >= 12:
        logger.info(f"  Cryolocks already seeded ({existing} rows); skipping")
        return db.query(PatientCrylockInfo).filter(PatientCrylockInfo.branch_id == branch_id).all()

    tank_map = {t.tank_code: t for t in tanks if t.tank_code}
    cryolock_specs = [
        {"tc": "T10", "c": "C1", "cane": "E1", "pos": 1, "color": "Blue", "his": "HIS0001"},
        {"tc": "T10", "c": "C2", "cane": "E1", "pos": 2, "color": "Red", "his": "HIS0002"},
        {"tc": "T10", "c": "C3", "cane": "E2", "pos": 1, "color": "Green", "his": "HIS0003"},
        {"tc": "T20", "c": "C1", "cane": "E1", "pos": 1, "color": "Yellow", "his": "HIS0004"},
        {"tc": "T20", "c": "C2", "cane": "E1", "pos": 2, "color": "Blue", "his": "HIS0005"},
        {"tc": "T30", "c": "C1", "cane": "E1", "pos": 1, "color": "Red", "his": "HIS0006"},
        {"tc": "T30", "c": "C2", "cane": "E2", "pos": 2, "color": "Blue", "his": "HIS0007"},
        {"tc": "T40", "c": "C1", "cane": "E1", "pos": 1, "color": "Green", "his": "HIS0008"},
        {"tc": "T40", "c": "C2", "cane": "E1", "pos": 2, "color": "Yellow", "his": "HIS0009"},
        {"tc": "T50", "c": "C1", "cane": "E1", "pos": 1, "color": "Blue", "his": "HIS0010"},
        {"tc": "T10", "c": "C4", "cane": "E2", "pos": 3, "color": "Red", "his": "HIS0011"},
        {"tc": "T30", "c": "C3", "cane": "E1", "pos": 3, "color": "Blue", "his": "HIS0012"},
    ]

    created = 0
    for i, spec in enumerate(cryolock_specs, 1):
        already_has = (
            db.query(PatientCrylockInfo)
            .filter(
                PatientCrylockInfo.branch_id == branch_id,
                PatientCrylockInfo.his_number == spec["his"],
            )
            .first()
        )
        if already_has:
            continue

        tank = tank_map.get(spec["tc"])
        tank_id = tank.tank_id if tank else tanks[0].tank_id
        cl = PatientCrylockInfo(
            branch_id=branch_id,
            tank_id=tank_id,
            his_number=spec["his"],
            crylock_number=f"{spec['tc']}/{spec['c']}/{spec['cane']}/{spec['pos']}",
            tank_code=spec["tc"],
            canister_number=spec["c"],
            cane_code=spec["cane"],
            position_number=spec["pos"],
            embryo_transfer=False,
            in_transit=(i % 4 == 0),
            crylock_color=spec["color"],
            created_at=datetime.now(timezone.utc) - timedelta(days=i * 2),
        )
        db.add(cl)
        created += 1

    if created:
        db.commit()
        logger.info(f"  + Created {created} patient cryolocks")
    return db.query(PatientCrylockInfo).filter(PatientCrylockInfo.branch_id == branch_id).all()


# ==============================================================================
# 6. SEED LN2 DEVICES, READINGS & TELEMETRY
# ==============================================================================

def seed_ln2_devices_and_mappings(db: Session, branch_id: int, tanks: List[Tank]) -> None:
    """Seed LN2 IoT Devices and mappings for T10, T30, and TIVE-TEST-999."""
    logger.info("Checking LN2 devices and readings...")
    device_codes = [f"LN2-{branch_id}", "TIVE-TEST-001"]
    devices = {}
    for code in device_codes:
        dev = db.query(Device).filter(Device.device_code == code).first()
        if not dev:
            dev = Device(branch_id=branch_id, device_code=code)
            db.add(dev)
            db.flush()
            logger.info(f"  + Created device {code}")
        devices[code] = dev

    primary_dev = devices[f"LN2-{branch_id}"]

    for tank in tanks:
        if tank.tank_code in ("T10", "T30", "TIVE-TEST-999"):
            dev_target = devices["TIVE-TEST-001"] if tank.tank_code == "TIVE-TEST-999" else primary_dev
            mapping = db.query(Ln2IotDevice).filter(
                Ln2IotDevice.tank_id == tank.tank_id,
                Ln2IotDevice.device_id == dev_target.id,
            ).first()
            if not mapping:
                mapping = Ln2IotDevice(
                    tank_id=tank.tank_id,
                    device_id=dev_target.id,
                    tank_max_capacity_reading=float(tank.capacity_liters or 100.0),
                    tank_min_capacity_reading=10.0,
                )
                db.add(mapping)
                db.flush()
                try:
                    db.execute(text("""
                        UPDATE ln2_iot_devices SET
                            closed_noise_margin_kg_per_h = 0.027,
                            open_rate_min_kg_per_h = 0.10,
                            refill_threshold_kg = 1.0,
                            window_minutes = 10,
                            window_min_points = 5,
                            consecutive_windows_for_state = 2
                        WHERE id = :mid
                    """), {"mid": mapping.id})
                except Exception:
                    pass

    now = datetime.now(timezone.utc)
    for tank in tanks:
        if tank.tank_code not in ("T10", "T30"):
            continue

        existing_readings = db.query(Ln2Reading).filter(Ln2Reading.tank_id == tank.tank_id).count()
        if existing_readings < 12:
            for i in range(12):
                ts = now - timedelta(minutes=i * 30)
                evap = 0.04 + (i % 5) * 0.015
                mass = 19.0 - (i * 0.6) + (i % 3) * 0.25
                r = Ln2Reading(
                    device_id=primary_dev.id,
                    tank_id=tank.tank_id,
                    evaporation_rate_kg_per_h=round(evap, 4),
                    ln2_mass_kg=round(mass, 2),
                    ln2_level_pct=round(55 + (12 - i) * 2.2, 1),
                    reading_timestamp=ts,
                )
                db.add(r)
                if push_ln2_reading_to_redis:
                    try:
                        push_ln2_reading_to_redis(
                            tank.tank_id,
                            tank.tank_code,
                            {
                                "device_code": primary_dev.device_code,
                                "timestamp": ts.isoformat(),
                                "evaporation_rate_kg_per_h": float(r.evaporation_rate_kg_per_h),
                                "ln2_mass_kg": float(r.ln2_mass_kg),
                                "ln2_level_pct": float(r.ln2_level_pct),
                            },
                            publish=False,
                        )
                    except Exception:
                        pass

        existing_raw = db.query(Ln2IotRawData).filter(Ln2IotRawData.tank_id == tank.tank_id).count()
        if existing_raw < 6:
            for i in range(6):
                ts = now - timedelta(hours=i)
                payload = {
                    "temp_internal": -196.0 + (i * 1.2),
                    "temp_external": 24.5 + (i * 0.3),
                    "shock": 0.05 + (i * 0.1),
                    "battery_percentage": max(20, 95 - (i * 5)),
                    "timestamp": ts.isoformat(),
                }
                raw = Ln2IotRawData(
                    tank_id=tank.tank_id,
                    device_id=primary_dev.id,
                    raw_data=float(payload["temp_internal"]),
                    payload=payload,
                    created_at=ts,
                )
                db.add(raw)
                if push_ivf_quality_to_redis:
                    try:
                        push_ivf_quality_to_redis(tank.tank_id, tank.tank_code, payload, publish=False)
                    except Exception:
                        pass

    db.commit()


def seed_telemetry_and_quality_logs(db: Session, tanks: List[Tank]) -> None:
    """Seed IVF telemetry and quality logs for deviation charts."""
    logger.info("Checking telemetry and quality logs...")
    now = datetime.now(timezone.utc)
    for tank in tanks[:2]:
        telemetry = db.query(IVFTelemetryData).filter(IVFTelemetryData.tank_id == tank.tank_id).first()
        if not telemetry:
            telemetry = IVFTelemetryData(
                tank_id=tank.tank_id,
                device_id=f"DEV-{tank.tank_id}",
                telemetry_data={"temp_internal": -196, "temp_external": 25, "shock": 0.1},
            )
            db.add(telemetry)
            db.flush()

        existing_logs = db.query(IVFQualityLog).filter(IVFQualityLog.tank_id == tank.tank_id).count()
        if existing_logs < 5:
            for d in range(5):
                ts = now - timedelta(days=d)
                log = IVFQualityLog(
                    telemetry_data_id=telemetry.id,
                    tank_id=tank.tank_id,
                    temperature_internal=-196 + (d * 1.5),
                    temperature_external=24 + d,
                    shock=0.1 + (d * 0.2),
                    quality_loss=0.0 if d == 0 else 1.8 * d,
                    is_temp_internal_loss=(d >= 3),
                    is_temp_external_loss=False,
                    is_shock_loss=(d >= 4),
                    reading_timestamp=ts,
                    created_at=ts,
                )
                db.add(log)

    db.commit()


# ==============================================================================
# 7. SEED KPI CONFIGS & DEMO READINGS
# ==============================================================================

def seed_kpi_configs(db: Session, hospital_id: int, branch_id: int, tanks: List[Tank]) -> None:
    """Seed standard 8 KPI thresholds per tank for visualization and alerts."""
    logger.info("Checking KPI configurations...")
    for tank in tanks:
        existing = db.query(KpiConfig).filter(KpiConfig.tank_id == tank.tank_id).count()
        if existing > 0:
            continue

        def _add(kpi_name, alert_name=None, min_v=None, max_v=None, unit=None, alert_type=None):
            cfg = KpiConfig(
                hospital_id=hospital_id,
                branch_id=branch_id,
                tank_id=tank.tank_id,
                kpi_name=kpi_name,
                alert_name=alert_name,
                min=min_v,
                max=max_v,
                unit=unit,
                alert_type=alert_type,
                status=True,
            )
            db.add(cfg)

        _add("temp_external", "External Temperature", 20, 30, "°C")
        _add("temp_internal", "Internal Temperature", -220, -195, "°C")
        _add("evaporation_rate", "Evaporation Rate", 0.2, 0.5, "kg/h")
        _add("ln2_level", "LN2 L1", None, 60, "%", alert_type="soft")
        _add("ln2_level", "LN2 L2", None, 30, "%", alert_type="critical")
        _add("battery_level", "Battery Level", None, 20, "%", alert_type="soft")
        _add("shock", "Shock", 1, None, None, alert_type="critical")
        _add("lid_status", "Lid Status", 1, 1, None, alert_type="soft")

    db.commit()


def seed_kpi_readings(db: Session, hospital_id: int, branch_id: int, tanks: List[Tank]) -> None:
    """Seed 5 snapshots of multi-metric readings for T10 and T30."""
    logger.info("Checking demo KPI readings snapshots...")
    base_dt = datetime.now(timezone.utc).replace(hour=12, minute=0, second=0, microsecond=0)
    snapshots = [
        {"min_offset": 0, "values": {"temp_external": 25.2, "temp_internal": -201.3, "ln2_level": 72, "evaporation_rate": 0.27, "battery_level": 92, "lid_status": 1, "shock": 0}},
        {"min_offset": 15, "values": {"temp_external": 25.8, "temp_internal": -200.6, "ln2_level": 70, "evaporation_rate": 0.28, "battery_level": 90, "lid_status": 0, "shock": 1}},
        {"min_offset": 30, "values": {"temp_external": 25.9, "temp_internal": -200.2, "ln2_level": 68, "evaporation_rate": 0.29, "battery_level": 89, "lid_status": 1, "shock": 0}},
        {"min_offset": 45, "values": {"temp_external": 26.1, "temp_internal": -199.8, "ln2_level": 64, "evaporation_rate": 0.30, "battery_level": 87, "lid_status": 0, "shock": 0}},
        {"min_offset": 60, "values": {"temp_external": 26.3, "temp_internal": -199.5, "ln2_level": 62, "evaporation_rate": 0.31, "battery_level": 85, "lid_status": 1, "shock": 0}},
    ]

    for tank in tanks:
        if tank.tank_code not in ("T10", "T30"):
            continue

        existing_count = db.query(Readings).filter(Readings.tank_id == tank.tank_id).count()
        if existing_count >= 20:
            continue

        configs = (
            db.query(KpiConfig)
            .filter(KpiConfig.tank_id == tank.tank_id, KpiConfig.status.is_(True))
            .all()
        )
        config_map = {c.kpi_name: c.id for c in configs if c.alert_name in (None, "External Temperature", "Internal Temperature", "Evaporation Rate")}
        for c in configs:
            if c.kpi_name not in config_map:
                config_map[c.kpi_name] = c.id

        if not config_map:
            continue

        for snap in snapshots:
            ts = base_dt + timedelta(minutes=snap["min_offset"])
            for metric, val in snap["values"].items():
                if metric not in config_map:
                    continue
                db.add(Readings(
                    hospital_id=hospital_id,
                    branch_id=branch_id,
                    tank_id=tank.tank_id,
                    kpi_config_id=config_map[metric],
                    kpi_value=val,
                    timestamp=ts,
                    deviation=False,
                    deviation_alert_sent=False,
                ))

    db.commit()


# ==============================================================================
# 8. SEED REFRIGERATORS & REFRIGERATOR KPI/READINGS
# ==============================================================================

def seed_refrigerators(db: Session, hospital_id: int, branch_id: int) -> None:
    """Seed refrigerators, multi-zone devices, KPI configs and readings."""
    logger.info("Checking laboratory refrigerators...")
    existing = db.query(Refrigerator).filter(Refrigerator.branch_id == branch_id).first()
    if existing:
        logger.info("  Refrigerators already exist; skipping")
        return

    ref1 = Refrigerator(
        hospital_id=hospital_id,
        branch_id=branch_id,
        refrigerator_code="REF-01",
        external_id="RF-CH-01",
        type="Dual-Zone Lab Storage",
        zone_count=2,
        is_active=True,
        created_at=datetime.now(timezone.utc),
        created_by="system",
    )
    ref2 = Refrigerator(
        hospital_id=hospital_id,
        branch_id=branch_id,
        refrigerator_code="REF-02",
        external_id="RF-CH-02",
        type="Ultra-Low Biomedical Freezer",
        zone_count=1,
        is_active=True,
        created_at=datetime.now(timezone.utc),
        created_by="system",
    )
    db.add_all([ref1, ref2])
    db.flush()

    db.add_all([
        RefrigeratorDevice(refrigerator_id=ref1.refrigerator_id, zone_id="fridge", device_code="RF-DEV-001"),
        RefrigeratorDevice(refrigerator_id=ref1.refrigerator_id, zone_id="freezer", device_code="RF-DEV-002"),
    ])
    db.flush()

    cfg_fridge_temp = KpiConfig(
        hospital_id=hospital_id,
        branch_id=branch_id,
        refrigerator_id=ref1.refrigerator_id,
        zone_id="fridge",
        zone_name="Fridge Compartment",
        kpi_name="refrigerator_temp",
        alert_name="Fridge Temperature",
        min=2.0,
        max=8.0,
        unit="°C",
        status=True,
    )
    cfg_freezer_temp = KpiConfig(
        hospital_id=hospital_id,
        branch_id=branch_id,
        refrigerator_id=ref1.refrigerator_id,
        zone_id="freezer",
        zone_name="Freezer Compartment",
        kpi_name="refrigerator_temp",
        alert_name="Freezer Temperature",
        min=-25.0,
        max=-15.0,
        unit="°C",
        status=True,
    )
    cfg_humidity = KpiConfig(
        hospital_id=hospital_id,
        branch_id=branch_id,
        refrigerator_id=ref1.refrigerator_id,
        zone_id="fridge",
        zone_name="Fridge Compartment",
        kpi_name="refrigerator_humidity",
        alert_name="Fridge Humidity",
        min=30.0,
        max=60.0,
        unit="%",
        status=True,
    )
    cfg_door = KpiConfig(
        hospital_id=hospital_id,
        branch_id=branch_id,
        refrigerator_id=ref1.refrigerator_id,
        zone_id="fridge",
        zone_name="Fridge Compartment",
        kpi_name="door_open",
        alert_name="Door Open",
        min=1.0,
        max=1.0,
        alert_type="soft",
        status=True,
    )
    db.add_all([cfg_fridge_temp, cfg_freezer_temp, cfg_humidity, cfg_door])
    db.flush()

    now = datetime.now(timezone.utc)
    for i in range(6):
        ts = now - timedelta(hours=i)
        db.add(Readings(
            hospital_id=hospital_id,
            branch_id=branch_id,
            refrigerator_id=ref1.refrigerator_id,
            zone_id="fridge",
            kpi_config_id=cfg_fridge_temp.id,
            kpi_value=round(4.1 + (i % 3) * 0.3, 2),
            timestamp=ts,
            deviation=False,
        ))
        db.add(Readings(
            hospital_id=hospital_id,
            branch_id=branch_id,
            refrigerator_id=ref1.refrigerator_id,
            zone_id="freezer",
            kpi_config_id=cfg_freezer_temp.id,
            kpi_value=round(-20.5 + (i % 2) * 0.4, 2),
            timestamp=ts,
            deviation=False,
        ))

    db.add(RefrigeratorRawData(
        refrigerator_id=ref1.refrigerator_id,
        zone_id="fridge",
        device_code="RF-DEV-001",
        raw_temperature=4.2,
        raw_humidity=45.0,
        raw_battery_percentage=98.0,
        payload={"temperature": 4.2, "humidity": 45.0, "battery": 98.0},
        created_at=now,
    ))

    db.commit()
    logger.info("  + Created REF-01, REF-02 with multi-zone configs and readings")


# ==============================================================================
# 9. SEED IVF SHIPMENTS
# ==============================================================================

def seed_ivf_shipments(
    db: Session,
    hospital_id: int,
    source_branch_id: int,
    dest_branch_id: int,
    crylocks: List[PatientCrylockInfo],
) -> None:
    """Seed outbound IVF shipments between branches."""
    if not crylocks:
        return
    existing = db.query(IVFShipment).count()
    if existing >= 3:
        return

    logger.info("Checking IVF shipments...")
    now = datetime.now(timezone.utc)
    for i, cl in enumerate(crylocks[:3]):
        ship = IVFShipment(
            shipment_id=f"SHIP-IVF-{now.strftime('%Y%m%d')}-{i+1:02d}",
            patient_crylock_info_id=cl.id,
            source_branch_id=source_branch_id,
            destination_branch_id=dest_branch_id,
            shipment_status="delivered" if i < 2 else "in_transit",
            source_location="Chennai Main Lab",
            destination_location="Bangalore Clinic",
            departure_time=now - timedelta(days=4 - i),
            arrival_time=now - timedelta(days=2 - i) if i < 2 else None,
            created_at=now - timedelta(days=5),
        )
        db.add(ship)

    db.commit()
    logger.info("  + Created 3 IVF shipments")


# ==============================================================================
# 10. SEED CGT DEMO DATA (PATIENTS, SHIPMENTS, TASKS, FEEDBACK)
# ==============================================================================

def seed_cgt_data(db: Session, pharma_id: int) -> None:
    """Seed CGT dashboard data: Provider, Carrier, Patients, Shipments, Tasks, Feedback."""
    logger.info("Checking CGT / Pharma demo data...")
    provider = db.query(Provider).filter(Provider.pharma_id == pharma_id).first()
    if not provider:
        provider = Provider(
            id=f"PROV-{uuid4().hex[:8].upper()}",
            name="Demo Logistics Provider",
            location="Boston, MA",
            pharma_id=pharma_id,
        )
        db.add(provider)
        db.flush()

    carrier = db.query(Carrier).filter(Carrier.name == "FedEx Medical").first()
    if not carrier:
        carrier = Carrier(name="FedEx Medical", carrier_type="Air", is_active=True)
        db.add(carrier)
        db.flush()

    now = datetime.now(timezone.utc)
    existing_patients = db.query(Patient).filter(Patient.pharma_id == pharma_id).count()
    patient_ids = []
    if existing_patients < 5:
        first_id = generate_patient_id(db)
        prefix = first_id[:-3]
        start_seq = int(first_id[-3:])
        for i in range(5):
            pid = f"{prefix}{start_seq + i:03d}"
            patient_ids.append(pid)
            p = Patient(
                id=pid,
                patient_name=f"Patient {i+1}",
                condition="Cell & Gene Therapy",
                hospital_name="ARC Fertility Hospitals",
                location="Boston, MA",
                provider_id=provider.id,
                pharma_id=pharma_id,
                created_at=now - timedelta(days=15 - i),
                created_by="system",
            )
            db.add(p)
            db.flush()

            stage = PatientStage(
                patient_id=pid,
                stage=PatientStageEnum.TRANSPORTATION if i % 2 == 0 else PatientStageEnum.REINFUSION,
                is_active=(i <= 2),
                is_success=True if i > 2 else None,
                start_time=now - timedelta(days=10 - i),
                created_by="system",
            )
            db.add(stage)
    else:
        patient_ids = [p.id for p in db.query(Patient).filter(Patient.pharma_id == pharma_id).limit(5).all()]

    existing_shipments = db.query(Shipment).filter(Shipment.pharma_id == pharma_id).count()
    if existing_shipments < 3 and patient_ids:
        for i, pid in enumerate(patient_ids[:3]):
            dep_time = now - timedelta(days=4 - i)
            arr_time = dep_time + timedelta(days=2)
            ship = Shipment(
                source_location="Boston Manufacturing",
                destination_location="New York Treatment Center",
                source_country="USA",
                destination_country="USA",
                departure_time=dep_time,
                arrival_time=arr_time,
                handover_time=arr_time,
                scheduled_time=arr_time,
                overall_quality_loss=0.0,
                routes_status=RouteStatus.SAFE,
                transportation_success=True,
                patient_id=pid,
                pharma_id=pharma_id,
                provider_id=provider.id,
                carrier_id=carrier.id,
                created_by="system",
            )
            db.add(ship)
            db.flush()

            leg = ShipmentLeg(
                shipment_id=ship.id,
                provider_id=provider.id,
                carrier_id=carrier.id,
                leg_order=1,
                mode_of_transport="Air",
                from_location="Boston",
                to_location="New York",
                departure_time=dep_time,
                arrival_time=arr_time,
                handover_time=arr_time,
                scheduled_time=arr_time,
                leg_quality_loss=0.0,
                leg_status=RouteStatus.SAFE,
                leg_success=True,
                created_by="system",
            )
            db.add(leg)
            db.flush()

            db.add(Therapy(
                shipment_leg_id=leg.id,
                therapy_name="Autologous CAR-T",
                temperature_min=-196.0,
                temperature_max=-150.0,
                created_by="system",
            ))

    first_user = db.query(User).first()
    assignee_id = first_user.user_id if first_user else "USR-000001"

    if db.query(Tasks).count() == 0 and first_user:
        db.add(Tasks(
            task_name="Verify customs documentation",
            description="Verify export declaration and import clearance",
            assignee_id=assignee_id,
            created_by_id=assignee_id,
            due_date=now + timedelta(days=5),
            priority=TaskPriority.HIGH,
            status=TaskStatus.IN_PROGRESS,
            patient_id=patient_ids[0] if patient_ids else None,
        ))

    if db.query(Feedback).count() == 0 and first_user:
        fb = Feedback(
            ticket_id=f"TK-{now.year}-{now.month:02d}-001",
            department=FeedbackDepartment.LOGISTICS,
            feedback_type=FeedbackType.FEATURE_REQUEST,
            subject="Automatic refill scheduling",
            description="Requesting automated LN2 refill notifications based on static evap prediction.",
            priority=FeedbackPriority.HIGH,
            affected_modules=AffectedModule.CONTROL_TOWER.value,
            status=FeedbackStatus.OPEN,
            submitted_by=assignee_id,
        )
        db.add(fb)
        db.flush()
        db.add(Comment(
            ticket_id=fb.ticket_id,
            comment="Team is evaluating this feature for the next sprint.",
            commented_by=assignee_id,
        ))

    db.commit()


def seed_reservoirs(db: Session) -> None:
    """Ensure a default reservoir for every hospital branch."""
    logger.info("Checking reservoirs...")
    try:
        from app.utils.reservoir_utils import ensure_branch_reservoir
        branches = db.query(HospitalBranch).all()
        for b in branches:
            ensure_branch_reservoir(
                db,
                branch_id=b.branch_id,
                hospital_id=b.hospital_id,
                branch_name=b.branch_name or f"Branch {b.branch_id}",
            )
        db.commit()
    except Exception as e:
        logger.warning(f"  Reservoirs seed skipped or failed: {e}")


# ==============================================================================
# 11. MAIN RUNNER
# ==============================================================================

def run_seed() -> None:
    """Execute complete unified database seed safely."""
    logger.info("=" * 60)
    logger.info("🚀 STARTING UNIFIED DATABASE SEED")
    logger.info("=" * 60)

    db = SessionLocal()
    try:
        # Step 1: Ensure schema and tables
        ensure_schema_and_tables(db)

        # Step 2: Pharma companies & hospitals
        pharma_map = seed_pharma_companies(db)
        hospital_map, branch_map = seed_hospitals_and_branches(db)

        # Step 3: Platform users
        seed_users(db, hospital_map, branch_map, pharma_map)

        # Step 4: Cryotanks
        primary_hospital = db.query(Hospital).filter(Hospital.hospital_name == "ARC Fertility Hospitals").first()
        if not primary_hospital:
            logger.error("ARC Fertility Hospitals not found.")
            return

        primary_branch = (
            db.query(HospitalBranch)
            .filter(
                HospitalBranch.hospital_id == primary_hospital.hospital_id,
                HospitalBranch.branch_name == "Chennai Main",
            )
            .first()
        )
        dest_branch = (
            db.query(HospitalBranch)
            .filter(
                HospitalBranch.hospital_id == primary_hospital.hospital_id,
                HospitalBranch.branch_name == "Bangalore",
            )
            .first()
        )

        primary_hospital_id = primary_hospital.hospital_id
        primary_branch_id = primary_branch.branch_id
        dest_branch_id = dest_branch.branch_id if dest_branch else primary_branch_id

        tanks = seed_cryotanks(db, primary_branch_id, branch_map)

        # Step 5: Patient Cryolocks / Embryos
        crylocks = seed_cryolocks(db, primary_branch_id, tanks)

        # Step 6: LN2 Devices, Readings & Telemetry
        seed_ln2_devices_and_mappings(db, primary_branch_id, tanks)
        seed_telemetry_and_quality_logs(db, tanks)

        # Step 7: KPI Configurations & Demo Readings
        seed_kpi_configs(db, primary_hospital_id, primary_branch_id, tanks)
        seed_kpi_readings(db, primary_hospital_id, primary_branch_id, tanks)

        # Step 8: Refrigerators (multi-zone)
        seed_refrigerators(db, primary_hospital_id, primary_branch_id)

        # Step 9: IVF Shipments
        seed_ivf_shipments(db, primary_hospital_id, primary_branch_id, dest_branch_id, crylocks)

        # Step 10: Reservoirs
        seed_reservoirs(db)

        # Step 11: CGT Pharma Data
        pharma = db.query(Pharma).first()
        pharma_id = pharma.id if pharma else 1
        seed_cgt_data(db, pharma_id)

        logger.info("\n" + "=" * 60)
        logger.info("  ✅ DATABASE SEEDING COMPLETED SUCCESSFULLY!")
        logger.info("=" * 60)
        logger.info("\nAvailable Login Accounts:")
        logger.info(f"  {'ROLE':<18} {'EMAIL':<26} {'PASSWORD':<12} {'SCOPE'}")
        logger.info("  " + "-" * 75)
        for u in USERS_DATA:
            scope = u["hospital_name"] or u["pharma_name"] or "Global"
            if u["branch_name"]:
                scope += f" ({u['branch_name']})"
            logger.info(f"  {u['role']:<18} {u['email']:<26} {u['password']:<12} {scope}")
        logger.info("=" * 60 + "\n")

    except Exception as e:
        db.rollback()
        logger.error(f"❌ Seeding failed with error: {e}", exc_info=True)
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    run_seed()
