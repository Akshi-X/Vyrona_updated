#!/usr/bin/env python3
"""
Seed all demo data for tank T10: cryolocks, telemetry, quality log, LN2 device/readings/raw,
KPI config, and KPI readings. Optionally create T10 on the given branch if missing.
Run from backend/: poetry run python scripts/seed_t10_data.py [branch_id]
"""
import argparse
import logging
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

_backend = Path(__file__).resolve().parent.parent
if str(_backend) not in sys.path:
    sys.path.insert(0, str(_backend))

from app.config.database import SessionLocal
from app.models.IVF.hospital_branch_model import HospitalBranch
from app.models.IVF.tank_model import Tank
from app.models.IVF.patient_crylock_info_model import PatientCrylockInfo
from app.models.IVF.ivf_telemetry_data_model import IVFTelemetryData
from app.models.IVF.ivf_quality_log_model import IVFQualityLog
from app.models.IVF.device_model import Device
from app.models.IVF.ln2_iot_device_model import Ln2IotDevice
from app.models.IVF.ln2_readings_model import Ln2Reading
from app.models.IVF.ln2_iot_raw_data_model import Ln2IotRawData
from app.models import KpiConfig, Readings
from app.service.quality_service import push_ivf_quality_to_redis
from app.controller.IVF.ivf_quality_controller import push_ln2_reading_to_redis
from app.constants.enums import CanisterStatus

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger(__name__)
logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)

TANK_CODE = "T10"
DEFAULT_BRANCH_ID = 20

# KPI readings snapshot data (same shape as seed_db for T30)
READINGS_SNAPSHOTS = [
    {"timestamp_offset_min": 0, "kpis": [{"name": "temp_external", "value": 25.2, "unit": "°C"}, {"name": "temp_internal", "value": -201.3, "unit": "°C"}, {"name": "ln2_level", "value": 72, "unit": "%"}, {"name": "evaporation_rate", "value": 0.27, "unit": "kg/h"}, {"name": "battery_level", "value": 92, "unit": "%"}, {"name": "lid_status", "value": 1, "unit": ""}, {"name": "shock", "value": 0, "unit": ""}]},
    {"timestamp_offset_min": 15, "kpis": [{"name": "temp_external", "value": 25.8, "unit": "°C"}, {"name": "temp_internal", "value": -200.6, "unit": "°C"}, {"name": "ln2_level", "value": 70, "unit": "%"}, {"name": "evaporation_rate", "value": 0.28, "unit": "kg/h"}, {"name": "battery_level", "value": 90, "unit": "%"}, {"name": "lid_status", "value": 0, "unit": ""}, {"name": "shock", "value": 1, "unit": ""}]},
    {"timestamp_offset_min": 30, "kpis": [{"name": "temp_external", "value": 25.9, "unit": "°C"}, {"name": "temp_internal", "value": -200.2, "unit": "°C"}, {"name": "ln2_level", "value": 68, "unit": "%"}, {"name": "evaporation_rate", "value": 0.29, "unit": "kg/h"}, {"name": "battery_level", "value": 89, "unit": "%"}, {"name": "lid_status", "value": 1, "unit": ""}, {"name": "shock", "value": 0, "unit": ""}]},
    {"timestamp_offset_min": 45, "kpis": [{"name": "temp_external", "value": 26.1, "unit": "°C"}, {"name": "temp_internal", "value": -199.8, "unit": "°C"}, {"name": "ln2_level", "value": 64, "unit": "%"}, {"name": "evaporation_rate", "value": 0.30, "unit": "kg/h"}, {"name": "battery_level", "value": 87, "unit": "%"}, {"name": "lid_status", "value": 0, "unit": ""}, {"name": "shock", "value": 0, "unit": ""}]},
    {"timestamp_offset_min": 60, "kpis": [{"name": "temp_external", "value": 26.3, "unit": "°C"}, {"name": "temp_internal", "value": -199.5, "unit": "°C"}, {"name": "ln2_level", "value": 62, "unit": "%"}, {"name": "evaporation_rate", "value": 0.31, "unit": "kg/h"}, {"name": "battery_level", "value": 85, "unit": "%"}, {"name": "lid_status", "value": 1, "unit": ""}, {"name": "shock", "value": 1, "unit": ""}]},
]


def get_or_create_t10(db, branch_id: Optional[int]) -> tuple:
    """Return (tank, branch) for T10. If branch_id given, find or create T10 on that branch."""
    branch = None
    if branch_id is not None:
        branch = db.query(HospitalBranch).filter(HospitalBranch.branch_id == branch_id).first()
        if not branch:
            logger.error(f"Branch id {branch_id} not found.")
            sys.exit(1)
        tank = db.query(Tank).filter(Tank.branch_id == branch_id, Tank.tank_code == TANK_CODE).first()
        if not tank:
            tank = Tank(
                branch_id=branch_id,
                tank_code=TANK_CODE,
                tank_id_arc="5471",
                capacity_liters=100.0,
                is_active=True,
                status=CanisterStatus.SAFE,
                tive_device_id="J712149",
            )
            db.add(tank)
            db.flush()
            db.commit()
            logger.info(f"Created tank {TANK_CODE} on branch_id={branch_id}.")
        return tank, branch

    tank = db.query(Tank).filter(Tank.tank_code == TANK_CODE).first()
    if not tank:
        logger.error(f"Tank {TANK_CODE} not found. Provide branch_id to create it (e.g. poetry run python scripts/seed_t10_data.py 20).")
        sys.exit(1)
    branch = db.query(HospitalBranch).filter(HospitalBranch.branch_id == tank.branch_id).first()
    if not branch:
        logger.error(f"Branch for tank {TANK_CODE} not found.")
        sys.exit(1)
    return tank, branch


def seed_crylocks(db, branch: HospitalBranch, tank: Tank) -> None:
    existing = db.query(PatientCrylockInfo).filter(
        PatientCrylockInfo.branch_id == branch.branch_id,
        PatientCrylockInfo.tank_id == tank.tank_id,
    ).count()
    if existing >= 4:
        logger.info(f"  Crylocks for {TANK_CODE} already exist; skipping.")
        return
    tc = tank.tank_code or TANK_CODE
    for i in range(1, 5):
        crylock = PatientCrylockInfo(
            branch_id=branch.branch_id,
            tank_id=tank.tank_id,
            his_number=f"HIS-T10-{i:04d}",
            crylock_number=f"{tc}/C{i}/E1/{i}",
            tank_code=tc,
            canister_number=f"C{i}",
            cane_code="E1",
            position_number=i,
            embryo_transfer=False,
            in_transit=(i % 2 == 0),
            crylock_color="Blue" if i % 2 == 0 else "Red",
        )
        db.add(crylock)
    db.commit()
    logger.info(f"  Created 4 crylocks for {TANK_CODE}.")


def seed_telemetry_and_quality_log(db, tank: Tank) -> None:
    telemetry = db.query(IVFTelemetryData).filter(IVFTelemetryData.tank_id == tank.tank_id).first()
    if not telemetry:
        telemetry = IVFTelemetryData(
            tank_id=tank.tank_id,
            device_id=f"DEV-{tank.tank_id}",
            telemetry_data={"temp_internal": -196, "temp_external": -150, "shock": 0.1},
        )
        db.add(telemetry)
        db.flush()
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
    logger.info(f"  Created telemetry + 5 quality log entries for {TANK_CODE}.")


def seed_ln2_and_raw(db, branch: HospitalBranch, tank: Tank) -> None:
    tank_id = tank.tank_id
    tank_code = tank.tank_code or TANK_CODE
    device = db.query(Device).filter(Device.branch_id == branch.branch_id).first()
    if not device:
        device = Device(branch_id=branch.branch_id, device_code=f"LN2-T10-{branch.branch_id}")
        db.add(device)
        db.flush()
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

    db.query(Ln2Reading).filter(Ln2Reading.device_id == device.id).delete()
    db.flush()
    now = datetime.now(timezone.utc)
    dev_code = device.device_code or f"LN2-{device.id}"
    for i in range(12):
        ts = now - timedelta(minutes=i * 30)
        evap = 0.04 + (i % 5) * 0.02
        mass = 18.0 - (i * 0.8) + (i % 3) * 0.3
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
        item = {
            "device_code": dev_code,
            "device_id": dev_code,
            "timestamp": ts.isoformat(),
            "evaporation_rate_kg_per_h": float(r.evaporation_rate_kg_per_h),
            "ln2_mass_kg": float(r.ln2_mass_kg),
            "ln2_level_pct": float(r.ln2_level_pct) if r.ln2_level_pct else None,
        }
        push_ln2_reading_to_redis(tank_id, tank_code, item, publish=False)
    db.commit()
    logger.info(f"  Created 12 LN2 readings + Redis for {TANK_CODE}.")

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
        logger.info(f"  Created 6 ln2_iot_raw_data + Redis for {TANK_CODE}.")


def seed_kpi_config(db, branch: HospitalBranch, tank: Tank) -> None:
    hospital_id = branch.hospital_id
    branch_id = tank.branch_id
    tank_id = tank.tank_id
    tank_code = tank.tank_code or TANK_CODE
    if db.query(KpiConfig).filter(KpiConfig.tank_id == tank_id).count() > 0:
        logger.info(f"  KPI config for {TANK_CODE} already exists; skipping.")
        return

    def add(name, alert_name=None, min_v=None, max_v=None, unit=None, alert_type=None):
        kwargs = {"hospital_id": hospital_id, "branch_id": branch_id, "tank_id": tank_id, "status": True}
        if alert_name is not None:
            kwargs["alert_name"] = alert_name
        if min_v is not None:
            kwargs["min"] = min_v
        if max_v is not None:
            kwargs["max"] = max_v
        if unit:
            kwargs["unit"] = unit
        if alert_type is not None:
            kwargs["alert_type"] = alert_type
        kwargs["kpi_name"] = name
        db.add(KpiConfig(**kwargs))

    for kpi_name, alert_name, min_v, max_v, unit in [
        ("temp_external", "External Temperature", 20, 30, "°C"),
        ("temp_internal", "Internal Temperature", -220, -195, "°C"),
        ("evaporation_rate", "Evaporation Rate", 0.2, 0.5, "kg/h"),
    ]:
        add(kpi_name, alert_name=alert_name, min_v=min_v, max_v=max_v, unit=unit)
    for alert_name, min_v, max_v, alert_type in [
        ("LN2 L1", None, 60, "soft"),
        ("LN2 L2", None, 30, "critical"),
    ]:
        add("ln2_level", alert_name=alert_name, max_v=max_v, alert_type=alert_type)
    add("battery_level", alert_name="Battery Level", max_v=20, alert_type="soft", unit="%")
    add("shock", alert_name="Shock", min_v=1, alert_type="critical")
    add("lid_status", alert_name="Lid Status", min_v=1, max_v=1, alert_type="soft")
    db.commit()
    logger.info(f"  Created KPI config for {TANK_CODE}.")


def seed_kpi_readings(db, branch: HospitalBranch, tank: Tank) -> None:
    hospital_id = branch.hospital_id
    branch_id = tank.branch_id
    tank_id = tank.tank_id
    tank_code = tank.tank_code or TANK_CODE
    config_rows = (
        db.query(KpiConfig)
        .filter(KpiConfig.tank_id == tank_id, KpiConfig.status == True)
        .order_by(KpiConfig.kpi_name, KpiConfig.id)
        .all()
    )
    config_by_name = {c.kpi_name: c.id for c in config_rows}
    if not config_by_name:
        logger.warning(f"  No KPI config for {TANK_CODE}; run KPI config first. Skipping readings.")
        return
    base_dt = datetime.now(timezone.utc).replace(hour=12, minute=0, second=0, microsecond=0)
    for snap in READINGS_SNAPSHOTS:
        ts = base_dt + timedelta(minutes=snap["timestamp_offset_min"])
        for k in snap["kpis"]:
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
            db.add(Readings(
                hospital_id=hospital_id,
                branch_id=branch_id,
                device_id=None,
                tank_id=tank_id,
                kpi_config_id=config_by_name[name],
                kpi_value=val,
                timestamp=ts,
                deviation=False,
                deviation_alert_sent=False,
            ))
    db.commit()
    logger.info(f"  Created KPI readings (5 snapshots) for {TANK_CODE}.")


def run(branch_id: Optional[int]) -> None:
    db = SessionLocal()
    try:
        tank, branch = get_or_create_t10(db, branch_id)
        logger.info(f"Seeding data for {TANK_CODE} (tank_id={tank.tank_id}, branch={branch.branch_name})")
        seed_crylocks(db, branch, tank)
        seed_telemetry_and_quality_log(db, tank)
        seed_ln2_and_raw(db, branch, tank)
        seed_kpi_config(db, branch, tank)
        seed_kpi_readings(db, branch, tank)
        logger.info("Done.")
    except Exception as e:
        db.rollback()
        logger.exception(e)
        sys.exit(1)
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser(description=f"Seed all demo data for tank {TANK_CODE}")
    parser.add_argument(
        "branch_id",
        type=int,
        nargs="?",
        default=None,
        help=f"Branch ID (optional). If given, T10 is created on this branch when missing. Default: use existing {TANK_CODE}.",
    )
    args = parser.parse_args()
    run(args.branch_id)


if __name__ == "__main__":
    main()
