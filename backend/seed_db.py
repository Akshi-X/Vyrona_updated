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
from app.models.IVF.device_model import Device
from app.models.IVF.ln2_iot_device_model import Ln2IotDevice
from app.models.IVF.ln2_readings_model import Ln2Reading
from app.models.IVF.ln2_iot_raw_data_model import Ln2IotRawData
from app.models import KpiConfig, Readings
from app.service.quality_service import push_ivf_quality_to_redis
from app.service.redis_service import get_redis
from app.controller.IVF.ivf_quality_controller import push_ln2_reading_to_redis
from sqlalchemy import text
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
    if len(tanks) < 3:
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

    # PatientCrylockInfo (cryolocks / embryos) – initial 8 + bulk for Site Level Information testing
    existing_crylocks = (
        db.query(PatientCrylockInfo)
        .filter(PatientCrylockInfo.branch_id == branch.branch_id)
        .count()
    )
    if existing_crylocks >= 8:
        logger.info(f"  Skipping initial cryolocks (already {existing_crylocks} exist)")
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

    # LN2 tables + Quality Tracking seed for T30
    seed_ln2_and_quality_data(db, branch, tanks)
    # KPI config (limits) + readings for Quality Tracking; config for visualization, readings from DB/socket
    seed_kpi_config_and_readings(db, tanks)
    # TIVE-TEST-001 test device, tank, ln2_iot_device
    seed_tive_test_data(db, branch)


def seed_ln2_and_quality_data(db, branch, tanks):
    """Seed LN2 devices, ln2_iot_raw_data for Quality Tracking chart. Push to Redis for T30."""
    tank_t30 = next((t for t in tanks if t.tank_code == "T30"), None)
    if not tank_t30:
        logger.info("  Skipping LN2 seed: T30 tank not found")
        return
    tank_id = tank_t30.tank_id
    tank_code = "T30"
    try:
        # Device for branch
        device = db.query(Device).filter(Device.branch_id == branch.branch_id).first()
        if not device:
            device = Device(branch_id=branch.branch_id, device_code=f"LN2-{branch.branch_id}")
            db.add(device)
            db.flush()
            logger.info(f"  Created device {device.device_code}")

        # Ln2IotDevice mapping T30 -> device
        mapping = db.query(Ln2IotDevice).filter(
            Ln2IotDevice.tank_id == tank_id,
            Ln2IotDevice.device_id == device.id,
        ).first()
        if not mapping:
            mapping = Ln2IotDevice(
                tank_id=tank_id,
                device_id=device.id,
                tank_max_capacity_reading=100.0,
                tank_min_capacity_reading=10.0,
            )
            db.add(mapping)
            db.flush()

        # LN2 readings (evaporation_rate_kg_per_h, ln2_mass_kg) - mock data for LN2 Readings card
        # Clear existing readings for this device to ensure clean mock data (device_id is INTEGER FK)
        db.query(Ln2Reading).filter(Ln2Reading.device_id == device.id).delete()
        db.flush()
        now = datetime.now(timezone.utc)
        dev_code = device.device_code or f"LN2-{device.id}"
        for i in range(12):
            ts = now - timedelta(minutes=i * 30)  # Every 30 min over last 6 hours
            evap = 0.04 + (i % 5) * 0.02  # 0.04–0.12 kg/h
            mass = 18.0 - (i * 0.8) + (i % 3) * 0.3  # ~7–19 kg varying
            r = Ln2Reading(
                device_id=device.id,
                tank_id=tank_id,
                evaporation_rate_kg_per_h=round(evap, 4),
                ln2_mass_kg=round(mass, 2),
                ln2_level_pct=round(50 + (12 - i) * 2.5, 1),
                reading_timestamp=ts,
            )
            db.add(r)
            db.flush()
            # Push to Redis so LN2 Readings card shows data immediately
            item = {
                "device_code": dev_code,
                "device_id": dev_code,  # backwards compat; value is device_code
                "timestamp": ts.isoformat(),
                "evaporation_rate_kg_per_h": float(r.evaporation_rate_kg_per_h),
                "ln2_mass_kg": float(r.ln2_mass_kg),
                "ln2_level_pct": float(r.ln2_level_pct) if r.ln2_level_pct else None,
            }
            push_ln2_reading_to_redis(tank_id, tank_code, item, publish=False)
        db.commit()
        logger.info(f"  Created 12 ln2_readings + pushed to Redis for LN2 Readings card (T30)")

        # ln2_iot_raw_data with quality payload (temp_internal, temp_external, shock) for chart
        existing_raw = db.query(Ln2IotRawData).filter(Ln2IotRawData.tank_id == tank_id).count()
        if existing_raw < 6:
            now = datetime.now(timezone.utc)
            for i in range(6):
                ts = now - timedelta(hours=i)
                payload = {
                    "temp_internal": -196 + (i * 1.5),
                    "temp_external": -150 + i,
                    "shock": 0.1 + (i * 0.15),
                    "timestamp": ts.isoformat(),
                }
                if i == 0:
                    payload["battery_percentage"] = 85
                raw = Ln2IotRawData(
                    tank_id=tank_id,
                    device_id=device.id,
                    raw_data=float(payload["temp_internal"]),
                    payload=payload,
                    created_at=ts,
                )
                db.add(raw)
                db.flush()
                push_ivf_quality_to_redis(tank_id, tank_code, payload, publish=False)
            db.commit()
            logger.info(f"  Created 6 ln2_iot_raw_data + pushed to Redis for {tank_code}")
    except Exception as e:
        db.rollback()
        logger.info(f"  Skipped LN2 seed: {e}")


def clear_all_kpi_config(db):
    """Delete all rows from kpi_config. Use before re-seeding to avoid duplicates."""
    try:
        deleted = db.query(KpiConfig).delete(synchronize_session=False)
        db.commit()
        logger.info(f"  Cleared all KPI config ({deleted} row(s))")
        return deleted
    except Exception as e:
        db.rollback()
        logger.warning(f"  Clear all KPI config failed: {e}")
        raise


def seed_kpi_config(db, tanks):
    """Seed preset KPI config (8 rows per tank) for any tank that has no config yet."""
    if not tanks:
        tanks = db.query(Tank).all()
    if not tanks:
        logger.warning("  No tanks found; skipping KPI config seed")
        return
    created = 0
    for tank in tanks:
        tank_id = tank.tank_id
        tank_code = tank.tank_code or f"T{tank_id}"
        branch = db.query(HospitalBranch).filter(HospitalBranch.branch_id == tank.branch_id).first()
        if not branch:
            logger.warning(f"  KPI config seed: no branch for tank {tank_code}; skipping")
            continue
        hospital_id = branch.hospital_id
        branch_id = tank.branch_id
        try:
            existing = db.query(KpiConfig).filter(KpiConfig.tank_id == tank_id).count()
            if existing > 0:
                logger.info(f"  KPI config for {tank_code} already exists; skipping")
                continue
            def _kpi_config_kwargs(alert_name=None, min_v=None, max_v=None, unit=None, alert_type=None):
                """Build KpiConfig kwargs with only non-null values."""
                kwargs = {
                    "hospital_id": hospital_id,
                    "branch_id": branch_id,
                    "tank_id": tank_id,
                    "status": True,
                }
                if alert_name is not None:
                    kwargs["alert_name"] = alert_name
                if min_v is not None:
                    kwargs["min"] = min_v
                if max_v is not None:
                    kwargs["max"] = max_v
                if unit is not None and str(unit).strip() != "":
                    kwargs["unit"] = unit
                if alert_type is not None:
                    kwargs["alert_type"] = alert_type
                return kwargs

            logger.info(f"  Seeding KPI config for {tank_code} (tank_id={tank_id})...")
            # Preset rows matching KPI config UI (kpi_name, alert_name display, min, max, alert_type)
            # Value configs (for readings)
            for kpi_name, alert_name, min_v, max_v, unit in [
                ("temp_external", "External Temperature", 20, 30, "°C"),
                ("temp_internal", "Internal Temperature", -220, -195, "°C"),
                ("evaporation_rate", "Evaporation Rate", 0.2, 0.5, "kg/h"),
            ]:
                kwargs = _kpi_config_kwargs(alert_name=alert_name, min_v=min_v, max_v=max_v, unit=unit)
                kwargs["kpi_name"] = kpi_name
                db.add(KpiConfig(**kwargs))
            # ln2_level: L1 below 60 = soft, L2 below 30 = critical
            for alert_name, min_v, max_v, alert_type in [
                ("LN2 L1", None, 60, "soft"),
                ("LN2 L2", None, 30, "critical"),
            ]:
                kwargs = _kpi_config_kwargs(alert_name=alert_name, max_v=max_v, alert_type=alert_type)
                kwargs["kpi_name"] = "ln2_level"
                db.add(KpiConfig(**kwargs))
            # battery_level: below 20 = soft (unit % on alert row)
            kwargs = _kpi_config_kwargs(alert_name="Battery Level", max_v=20, alert_type="soft", unit="%")
            kwargs["kpi_name"] = "battery_level"
            db.add(KpiConfig(**kwargs))
            # shock: min 1 = critical
            kwargs = _kpi_config_kwargs(alert_name="Shock", min_v=1, alert_type="critical")
            kwargs["kpi_name"] = "shock"
            db.add(KpiConfig(**kwargs))
            # lid_status: 1 = soft (open)
            kwargs = _kpi_config_kwargs(alert_name="Lid Status", min_v=1, max_v=1, alert_type="soft")
            kwargs["kpi_name"] = "lid_status"
            db.add(KpiConfig(**kwargs))
            db.flush()
            created += 1
        except Exception as e:
            db.rollback()
            logger.warning(f"  KPI config seed failed for {tank_code}: {e}")
            break
    try:
        db.commit()
        if created:
            logger.info(f"  KPI config seed: created config for {created} tank(s)")
        else:
            logger.info("  KPI config seed: no new rows (tanks may already have config)")
    except Exception as e:
        db.rollback()
        logger.warning(f"  KPI config seed commit failed: {e}")
        raise


def seed_kpi_readings(db, tanks=None):
    """Seed 5 snapshots of readings for T30 only. Uses existing KpiConfig for T30 (does not touch config or other tanks)."""
    if not tanks:
        tanks = db.query(Tank).all()
    t30_list = [t for t in tanks if (t.tank_code or "").strip().upper() == "T30"]
    if not t30_list:
        t30_list = db.query(Tank).filter(Tank.tank_code == "T30").all()
    if not t30_list:
        logger.warning("  No T30 tank found; skipping KPI readings seed")
        return
    value_kpis = [
        "temp_external", "temp_internal", "ln2_level", "evaporation_rate", "battery_level", "lid_status", "shock",
    ]
    base_dt = datetime.now(timezone.utc).replace(hour=12, minute=0, second=0, microsecond=0)
    readings_data = [
        {"timestamp": base_dt, "kpis": [{"name": "temp_external", "value": 25.2, "unit": "°C"}, {"name": "temp_internal", "value": -201.3, "unit": "°C"}, {"name": "ln2_level", "value": 72, "unit": "%"}, {"name": "evaporation_rate", "value": 0.27, "unit": "kg/h"}, {"name": "battery_level", "value": 92, "unit": "%"}, {"name": "lid_status", "value": 1, "unit": ""}, {"name": "shock", "value": 0, "unit": ""}]},
        {"timestamp": base_dt + timedelta(minutes=15), "kpis": [{"name": "temp_external", "value": 25.8, "unit": "°C"}, {"name": "temp_internal", "value": -200.6, "unit": "°C"}, {"name": "ln2_level", "value": 70, "unit": "%"}, {"name": "evaporation_rate", "value": 0.28, "unit": "kg/h"}, {"name": "battery_level", "value": 90, "unit": "%"}, {"name": "lid_status", "value": 0, "unit": ""}, {"name": "shock", "value": 1, "unit": ""}]},
        {"timestamp": base_dt + timedelta(minutes=30), "kpis": [{"name": "temp_external", "value": 25.9, "unit": "°C"}, {"name": "temp_internal", "value": -200.2, "unit": "°C"}, {"name": "ln2_level", "value": 68, "unit": "%"}, {"name": "evaporation_rate", "value": 0.29, "unit": "kg/h"}, {"name": "battery_level", "value": 89, "unit": "%"}, {"name": "lid_status", "value": 1, "unit": ""}, {"name": "shock", "value": 0, "unit": ""}]},
        {"timestamp": base_dt + timedelta(minutes=45), "kpis": [{"name": "temp_external", "value": 26.1, "unit": "°C"}, {"name": "temp_internal", "value": -199.8, "unit": "°C"}, {"name": "ln2_level", "value": 64, "unit": "%"}, {"name": "evaporation_rate", "value": 0.30, "unit": "kg/h"}, {"name": "battery_level", "value": 87, "unit": "%"}, {"name": "lid_status", "value": 0, "unit": ""}, {"name": "shock", "value": 0, "unit": ""}]},
        {"timestamp": base_dt + timedelta(hours=1), "kpis": [{"name": "temp_external", "value": 26.3, "unit": "°C"}, {"name": "temp_internal", "value": -199.5, "unit": "°C"}, {"name": "ln2_level", "value": 62, "unit": "%"}, {"name": "evaporation_rate", "value": 0.31, "unit": "kg/h"}, {"name": "battery_level", "value": 85, "unit": "%"}, {"name": "lid_status", "value": 1, "unit": ""}, {"name": "shock", "value": 1, "unit": ""}]},
    ]
    tanks_with_readings = 0
    for tank in t30_list:
        tank_id = tank.tank_id
        tank_code = tank.tank_code or f"T{tank_id}"
        branch = db.query(HospitalBranch).filter(HospitalBranch.branch_id == tank.branch_id).first()
        if not branch:
            continue
        hospital_id = branch.hospital_id
        branch_id = tank.branch_id
        # One config_id per kpi_name (first by id) so we can attach readings; works with alert_name null or set
        config_rows = (
            db.query(KpiConfig)
            .filter(KpiConfig.tank_id == tank_id, KpiConfig.status == True)
            .order_by(KpiConfig.kpi_name, KpiConfig.id)
            .all()
        )
        config_by_name = {}
        for c in config_rows:
            if c.kpi_name not in config_by_name:
                config_by_name[c.kpi_name] = c.id
        if not config_by_name:
            logger.warning(f"  No KPI config for {tank_code}; run seed_kpi_config first. Skipping readings.")
            continue
        try:
            existing_readings = db.query(Readings).filter(Readings.tank_id == tank_id).count()
            if existing_readings >= 5 * len(value_kpis):
                logger.info(f"  Readings for {tank_code} already sufficient; skipping")
                continue
            logger.info(f"  Seeding readings for {tank_code} (tank_id={tank_id})...")
            for r in readings_data:
                ts = r["timestamp"]
                for k in r["kpis"]:
                    name = (k.get("name") or "").strip()
                    if name not in config_by_name:
                        continue
                    try:
                        val = k.get("value")
                        if val is None:
                            continue
                        if not isinstance(val, (int, float)):
                            val = float(val)
                    except (TypeError, ValueError):
                        continue
                    row = Readings(
                        hospital_id=hospital_id,
                        branch_id=branch_id,
                        device_id=None,
                        tank_id=tank_id,
                        kpi_config_id=config_by_name[name],
                        kpi_value=val,
                        timestamp=ts,
                        deviation=False,
                        deviation_alert_sent=False,
                    )
                    db.add(row)
            tanks_with_readings += 1
        except Exception as e:
            db.rollback()
            logger.warning(f"  KPI readings seed failed for {tank_code}: {e}")
            break
    try:
        db.commit()
        if tanks_with_readings:
            logger.info(f"  KPI readings seed: created readings for {tanks_with_readings} tank(s)")
        else:
            logger.info("  KPI readings seed: no new rows")
    except Exception as e:
        db.rollback()
        logger.warning(f"  KPI readings seed commit failed: {e}")
        raise


def seed_kpi_config_and_readings(db, tanks):
    """Seed KPI config then readings for T30 (convenience wrapper)."""
    seed_kpi_config(db, tanks)
    seed_kpi_readings(db, tanks)


def seed_tive_test_data(db, branch):
    """Seed TIVE-TEST-001: device, tank (TIVE-TEST-999), ln2_iot_device with Tive params."""
    try:
        # 1. Device
        device = db.query(Device).filter(Device.device_code == "TIVE-TEST-001").first()
        if not device:
            device = Device(branch_id=branch.branch_id, device_code="TIVE-TEST-001")
            db.add(device)
            db.flush()
            logger.info("  Created device TIVE-TEST-001")

        # 2. Tank (tank_code TIVE-TEST-999, use safe status - no 'active' in our enum)
        tank = db.query(Tank).filter(Tank.tank_code == "TIVE-TEST-999").first()
        if not tank:
            tank = Tank(
                branch_id=branch.branch_id,
                tank_code="TIVE-TEST-999",
                capacity_liters=47.3,
                tive_device_id="TIVE-TEST-001",
                is_active=True,
            )
            db.add(tank)
            db.flush()
            db.execute(text("""
                UPDATE tanks SET
                    empty_weight_kg = 15.9,
                    full_weight_kg = 54.1,
                    static_evap_rate_l_per_day = 0.38
                WHERE tank_id = :tid
            """), {"tid": tank.tank_id})
            logger.info(f"  Created tank TIVE-TEST-999 (tank_id={tank.tank_id})")

        # 3. Ln2IotDevice: link device to tank with Tive params
        existing = db.query(Ln2IotDevice).filter(
            Ln2IotDevice.tank_id == tank.tank_id,
            Ln2IotDevice.device_id == device.id,
        ).first()
        if not existing:
            mapping = Ln2IotDevice(
                tank_id=tank.tank_id,
                device_id=device.id,
                tank_min_capacity_reading=13.9,
                tank_max_capacity_reading=56.1,
            )
            db.add(mapping)
            db.flush()
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
            logger.info("  Created ln2_iot_device for TIVE-TEST-001 -> TIVE-TEST-999")
        db.commit()
    except Exception as e:
        db.rollback()
        logger.info(f"  Skipped TIVE-TEST seed: {e}")


def main():
    logger.info("=" * 60)
    logger.info("SEEDING DEMO DATA")
    logger.info("=" * 60)
    # Ensure all tables exist (including kpi_config and readings)
    try:
        from app.config.database import init_db as create_tables
        create_tables()
        logger.info("  Tables verified/created")
    except Exception as e:
        logger.warning(f"  create_tables skipped: {e}")
    # Run schema sync (migrations) so new columns exist before seeding
    try:
        from app.init_db import sync_ivf_schema
        sync_ivf_schema()
    except Exception as e:
        logger.warning(f"  Schema sync skipped: {e}")
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
