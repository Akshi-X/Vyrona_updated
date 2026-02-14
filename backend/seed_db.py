#!/usr/bin/env python3
"""
Seed script to populate demo data for CGT and IVF dashboards.
Run: poetry run python seed_db.py
"""
import logging
import sys
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from app.config.database import SessionLocal
from app.models.patient_model import Patient
from app.models.patient_stage_model import PatientStage
from app.models.shipment_model import Shipment
from app.models.shipment_leg_model import ShipmentLeg
from app.models.provider_model import Provider
from app.models.carrier_model import Carrier
from app.models.pharma_model import Pharma
from app.models.IVF.hospital_model import Hospital
from app.models.IVF.hospital_branch_model import HospitalBranch
from app.models.IVF.tank_model import Tank
from app.models.IVF.patient_crylock_info_model import PatientCrylockInfo
from app.models.IVF.ivf_telemetry_data_model import IVFTelemetryData
from app.models.IVF.ivf_quality_log_model import IVFQualityLog
from app.models.IVF.ivf_shipment_model import IVFShipment
from app.constants.enums import PatientStage as PatientStageEnum, RouteStatus
from app.utils.patient_utils import generate_patient_id

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger(__name__)
# Suppress SQLAlchemy SQL echo during seed
logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)


def seed_cgt_data(db):
    """Seed CGT/Pharma dashboard data: patients, shipments, providers, carriers."""
    # Get first pharma
    pharma = db.query(Pharma).first()
    if not pharma:
        logger.warning("No pharma company found. Create pharma_admins.json and restart.")
        return

    pharma_id = pharma.id
    logger.info(f"Seeding CGT data for pharma: {pharma.pharma_name} (ID: {pharma_id})")

    # Provider
    provider = db.query(Provider).filter(Provider.pharma_id == pharma_id).first()
    if not provider:
        provider = Provider(
            id=f"PROV-{uuid4().hex[:8].upper()}",
            name="Demo Logistics Provider",
            location="New York, USA",
            pharma_id=pharma_id,
        )
        db.add(provider)
        db.flush()
        logger.info(f"  Created provider: {provider.name}")

    # Carrier
    carrier = db.query(Carrier).filter(Carrier.name == "FedEx Medical").first()
    if not carrier:
        carrier = Carrier(name="FedEx Medical", carrier_type="Air", is_active=True)
        db.add(carrier)
        db.flush()
        logger.info(f"  Created carrier: {carrier.name}")

    # Patients
    now = datetime.now(timezone.utc)
    current_month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    existing_patients = db.query(Patient).filter(Patient.pharma_id == pharma_id).count()
    if existing_patients >= 5:
        logger.info(f"  Skipping patients (already {existing_patients} exist)")
    else:
        for i in range(1, 6):
            pid = generate_patient_id(db)
            patient = Patient(
                id=pid,
                patient_name=f"Demo Patient {i}",
                condition="CGT Treatment",
                hospital_name="Demo Hospital",
                location="Boston, MA",
                provider_id=provider.id,
                pharma_id=pharma_id,
                created_at=current_month_start + timedelta(days=i),
            )
            db.add(patient)
            db.flush()

            # Patient stage
            stage = PatientStage(
                patient_id=pid,
                stage=PatientStageEnum.TRANSPORTATION if i % 2 == 0 else PatientStageEnum.REINFUSION,
                is_active=(i <= 2),
                is_success=True if i > 2 else None,
                start_time=current_month_start + timedelta(days=i),
                end_time=current_month_start + timedelta(days=i + 3) if i > 2 else None,
            )
            db.add(stage)
        logger.info(f"  Created 5 patients")

    db.commit()

    # Shipments (for performance metrics: on-time %, lead time, success rate)
    existing_shipments = db.query(Shipment).filter(Shipment.pharma_id == pharma_id).count()
    if existing_shipments >= 5:
        logger.info(f"  Skipping shipments (already {existing_shipments} exist)")
        return

    patients = db.query(Patient).filter(Patient.pharma_id == pharma_id).limit(5).all()
    for i, patient in enumerate(patients):
        dep_time = current_month_start + timedelta(days=i + 1, hours=10)
        arr_time = dep_time + timedelta(days=2, hours=4)
        handover = arr_time
        scheduled = arr_time + timedelta(hours=-1 if i % 2 == 0 else 2)  # Mix on-time and delayed

        shipment = Shipment(
            source_location="Boston Manufacturing",
            destination_location="New York Treatment Center",
            source_country="USA",
            destination_country="USA",
            departure_time=dep_time,
            arrival_time=arr_time,
            handover_time=handover,
            scheduled_time=scheduled,
            overall_quality_loss=2.5 if i % 3 == 0 else 0.0,
            routes_status=RouteStatus.SAFE,
            transportation_success=True,
            patient_id=patient.id,
            pharma_id=pharma_id,
            provider_id=provider.id,
            carrier_id=carrier.id,
        )
        db.add(shipment)
        db.flush()

        leg = ShipmentLeg(
            shipment_id=shipment.id,
            provider_id=provider.id,
            carrier_id=carrier.id,
            leg_order=1,
            mode_of_transport="Air",
            from_location="Boston",
            to_location="New York",
            departure_time=dep_time,
            arrival_time=arr_time,
            handover_time=handover,
            scheduled_time=scheduled,
            leg_quality_loss=2.5 if i % 3 == 0 else 0.0,
            leg_status=RouteStatus.SAFE,
            leg_success=True,
        )
        db.add(leg)

    db.commit()
    logger.info(f"  Created {len(patients)} shipments with legs")


def _ensure_tanks_schema(db) -> bool:
    """Ensure tanks table has columns expected by Tank model. Add missing columns if needed."""
    from sqlalchemy import text
    try:
        # Create enum type if not exists (PostgreSQL)
        db.execute(text("""
            DO $$ BEGIN
                CREATE TYPE tank_status AS ENUM ('safe', 'risk', 'critical');
            EXCEPTION WHEN duplicate_object THEN null;
            END $$;
        """))
        # Add columns if missing
        for col, defn in [
            ("tank_id_arc", "VARCHAR(255)"),
            ("tive_device_id", "VARCHAR(255)"),
            ("status", "tank_status DEFAULT 'safe'"),
        ]:
            db.execute(text(f"ALTER TABLE tanks ADD COLUMN IF NOT EXISTS {col} {defn}"))
        db.commit()
        return True
    except Exception as e:
        logger.warning(f"  Schema sync for tanks failed: {e}")
        db.rollback()
        return False


def seed_ivf_data(db):
    """Seed IVF dashboard data: tanks, cryolocks, quality logs, shipments."""
    if not _ensure_tanks_schema(db):
        logger.warning("  Skipping IVF seed: could not sync tanks schema")
        return

    hospital = db.query(Hospital).filter(Hospital.hospital_name == "ARC Fertility Hospitals").first()
    if not hospital:
        logger.warning("Hospital not found. Run init_db first.")
        return

    branch = (
        db.query(HospitalBranch)
        .filter(HospitalBranch.hospital_id == hospital.hospital_id)
        .first()
    )
    if not branch:
        logger.warning("Branch not found. Run init_db first.")
        return

    logger.info(f"Seeding IVF data for {hospital.hospital_name} - {branch.branch_name}")

    # Tanks
    tanks = db.query(Tank).filter(Tank.branch_id == branch.branch_id).all()
    if len(tanks) < 2:
        for i in range(1, 4):
            tank = Tank(
                branch_id=branch.branch_id,
                tank_code=f"T{i}0",
                capacity_liters=100.0,
                is_active=True,
            )
            db.add(tank)
        db.commit()
        tanks = db.query(Tank).filter(Tank.branch_id == branch.branch_id).all()
        logger.info(f"  Created {len(tanks)} tanks")

    # PatientCrylockInfo (cryolocks / embryos)
    existing_crylocks = (
        db.query(PatientCrylockInfo)
        .filter(PatientCrylockInfo.branch_id == branch.branch_id)
        .count()
    )
    if existing_crylocks >= 8:
        logger.info(f"  Skipping cryolocks (already {existing_crylocks} exist)")
    else:
        tank_list = tanks[:2]
        tank_ids = [t.tank_id for t in tank_list]
        tank_codes = [t.tank_code or f"T{i+1}0" for i, t in enumerate(tank_list)]
        for i in range(1, 9):
            tix = (i - 1) % 2
            tank_id = tank_ids[tix]
            tc = tank_codes[tix]
            crylock = PatientCrylockInfo(
                branch_id=branch.branch_id,
                tank_id=tank_id,
                his_number=f"HIS{i:04d}",
                crylock_number=f"{tc}/C{i}/E1/{i}",
                tank_code=tc,
                canister_number=f"C{i}",
                cane_code="E1",
                position_number=i,
                embryo_transfer=False,
                in_transit=(i % 3 == 0),
                crylock_color="Blue" if i % 2 == 0 else "Red",
            )
            db.add(crylock)
        db.commit()
        logger.info(f"  Created 8 cryolocks")

    crylocks = (
        db.query(PatientCrylockInfo)
        .filter(
            PatientCrylockInfo.branch_id == branch.branch_id,
            PatientCrylockInfo.embryo_transfer == False,
        )
        .all()
    )

    # IVF telemetry + quality log for chart (optional - schema may vary)
    try:
        for tank in tanks[:2]:
            telemetry = db.query(IVFTelemetryData).filter(IVFTelemetryData.tank_id == tank.tank_id).first()
            if not telemetry:
                telemetry = IVFTelemetryData(
                    tank_id=tank.tank_id,
                    device_id=f"DEV-{tank.tank_id}",
                    telemetry_data={"temp_internal": -196, "temp_external": -150, "shock": 0.1},
                )
                db.add(telemetry)
                db.flush()

            # Quality log entries for deviations chart
            now = datetime.now(timezone.utc)
            for d in range(5):
                ts = now - timedelta(days=d)
                log = IVFQualityLog(
                    telemetry_data_id=telemetry.id,
                    tank_id=tank.tank_id,
                    temperature_internal=-196 + (d * 2),
                    temperature_external=-150 + d,
                    shock=0.1 + (d * 0.2),
                    quality_loss=0.0 if d == 0 else 2.0 * d,
                    is_temp_internal_loss=(d >= 2),
                    is_temp_external_loss=False,
                    is_shock_loss=(d >= 3),
                    reading_timestamp=ts,
                )
                db.add(log)
        db.commit()
        logger.info(f"  Created IVF telemetry and quality logs")
    except Exception as e:
        db.rollback()
        logger.info(f"  Skipped IVF quality logs (schema may differ): {e}")

    # IVFShipment (outbound) - need at least 2 branches; use same branch if only one
    dest_branch = (
        db.query(HospitalBranch)
        .filter(HospitalBranch.hospital_id == hospital.hospital_id)
        .filter(HospitalBranch.branch_id != branch.branch_id)
        .first()
    )
    if not dest_branch:
        dest_branch = branch  # Same branch for demo

    try:
        existing_ivf_shipments = db.query(IVFShipment).count()
        if existing_ivf_shipments < 3 and len(crylocks) >= 2:
            for i, crylock in enumerate(crylocks[:3]):
                ship = IVFShipment(
                    shipment_id=f"SHIP-IVF-{datetime.now().strftime('%Y%m%d')}-{i+1}",
                    patient_crylock_info_id=crylock.id,
                    source_branch_id=branch.branch_id,
                    destination_branch_id=dest_branch.branch_id,
                    shipment_status="delivered" if i < 2 else "in_transit",
                    source_location=branch.branch_name,
                    destination_location=dest_branch.branch_name,
                    departure_time=datetime.now(timezone.utc) - timedelta(days=5 - i),
                    arrival_time=datetime.now(timezone.utc) - timedelta(days=3 - i) if i < 2 else None,
                    created_at=datetime.now(timezone.utc) - timedelta(days=5),
                )
                db.add(ship)
            db.commit()
            logger.info(f"  Created 3 IVF outbound shipments")
    except Exception as e:
        db.rollback()
        logger.info(f"  Skipped IVF shipments (schema may differ): {e}")


def main():
    logger.info("=" * 60)
    logger.info("SEEDING DEMO DATA")
    logger.info("=" * 60)
    db = SessionLocal()
    try:
        seed_cgt_data(db)
        seed_ivf_data(db)
        logger.info("=" * 60)
        logger.info("SEED COMPLETE")
        logger.info("  CGT: Login as pharma user to see patients, shipments, metrics")
        logger.info("  IVF: Login as admin@zucisystems.com to see embryos, tanks, deviations")
        logger.info("=" * 60)
    except Exception as e:
        logger.error(f"Seed failed: {e}")
        db.rollback()
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()
