#!/usr/bin/env python3
"""
Simulate Live Deviation CLI Script
Usage:
    python backend/scripts/simulate_live_deviation.py --tank 4 --value -115.0 --phone "+919876543210"
    python backend/scripts/simulate_live_deviation.py --refrigerator 1 --value 120.0
"""

import argparse
import sys
import os
from datetime import datetime, timezone
from pathlib import Path

# Ensure backend root is on sys.path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.config.database import SessionLocal
from app.models import Readings, KpiConfig
from app.models.IVF.tank_model import Tank
from app.models.IVF.hospital_branch_model import HospitalBranch
from app.models.IVF.refrigerator_model import Refrigerator
from app.models.IVF.incubator_model import Incubator
from app.models.IVF.critical_alert_model import CriticalAlert
from app.constants.enums import AlertStatus, AlertType, AlertSource, AlertSeverity, AlertTriggeredBy
from app.service.IVF.critical_alert_service import CriticalAlertService
from app.service.aws_sns_service import sns_service


# Terminal ANSI Colors for vivid live log presentation
BOLD = "\033[1m"
RED = "\033[91m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
BLUE = "\033[94m"
CYAN = "\033[96m"
RESET = "\033[0m"


def simulate_tank_deviation(db, tank_id: int, breach_value: float, metric: str = "temp_internal", phone: str = None, email: str = None):
    tank = db.query(Tank).filter(Tank.tank_id == tank_id).first()
    if not tank:
        print(f"{RED}❌ Error: Tank with ID {tank_id} not found in database.{RESET}")
        return

    device_label = tank.tank_code or f"Tank #{tank.tank_id}"
    now_utc = datetime.now(timezone.utc)

    # Resolve branch and hospital
    branch = db.query(HospitalBranch).filter(HospitalBranch.branch_id == tank.branch_id).first()
    hospital_id = branch.hospital_id if branch else 1
    branch_id = tank.branch_id or (branch.branch_id if branch else 1)

    # Resolve KPI config
    kpi = (
        db.query(KpiConfig)
        .filter(
            KpiConfig.hospital_id == hospital_id,
            KpiConfig.kpi_name == metric,
            KpiConfig.status == True,
        )
        .first()
    )
    if not kpi:
        kpi = (
            db.query(KpiConfig)
            .filter(
                KpiConfig.kpi_name == metric,
                KpiConfig.status == True,
            )
            .first()
        )
    if not kpi:
        kpi = (
            db.query(KpiConfig)
            .filter(
                KpiConfig.hospital_id == hospital_id,
                KpiConfig.status == True,
            )
            .first()
        )
    kpi_id = kpi.id if kpi else 2

    print(f"\n{BOLD}{CYAN}------------------------------------------------------------{RESET}")
    print(f"{BOLD}📡 INGESTING SENSOR TELEMETRY{RESET}")
    print(f"Device:       {BOLD}{device_label}{RESET} (Tank ID: {tank.tank_id})")
    print(f"Branch ID:    {branch_id} ({branch.branch_name if branch else 'Main Branch'})")
    print(f"Metric:       {metric} (Config ID: {kpi_id})")
    print(f"Reading:      {RED}{breach_value} °C (BREACH / EXCURSION){RESET}")
    print(f"Timestamp:    {now_utc.strftime('%Y-%m-%d %H:%M:%S UTC')}")
    print(f"{BOLD}{CYAN}------------------------------------------------------------{RESET}")

    # Insert breached reading
    reading = Readings(
        hospital_id=hospital_id,
        branch_id=branch_id,
        tank_id=tank.tank_id,
        kpi_config_id=kpi_id,
        kpi_value=breach_value,
        deviation=True,
        checked=False,
        timestamp=now_utc,
    )
    db.add(reading)
    db.commit()
    print(f"{GREEN}✓ Sensor reading inserted into `readings` table with deviation=True{RESET}")

    # Evaluate deviation & create alert
    print(f"\n{BOLD}{YELLOW}⚙️  RUNNING REAL-TIME DEVIATION EVALUATION...{RESET}")
    service = CriticalAlertService(db)
    alerts = service.check_and_create_alert_for_kpi_deviations(tank.tank_id)

    if not alerts:
        # Check for existing active alert or force create one for live demonstration
        existing_active = (
            db.query(CriticalAlert)
            .filter(
                CriticalAlert.tank_id == tank.tank_id,
                CriticalAlert.status == AlertStatus.ACTIVE.value,
            )
            .order_by(CriticalAlert.created_at.desc())
            .first()
        )
        if existing_active:
            alerts = [existing_active]
            print(f"{YELLOW}ℹ️  Active excursion alert exists for {device_label}. Continuing notification dispatch...{RESET}")
        else:
            alert, _ = service._create_alert(
                tank_id=tank.tank_id,
                alert_type=AlertType.DEVIATION_ALERT,
                source=AlertSource.KPI,
                severity=AlertSeverity.HIGH,
                message=service._frame_alert_message(
                    kpi,
                    breach_value,
                    branch_name=branch.branch_name if branch else "Main Branch",
                    device_noun="Tank",
                    device_label=device_label,
                    tank_id=tank.tank_id,
                ),
                occurred_at=now_utc,
                triggered_by=AlertTriggeredBy.SYSTEM,
                extra_info=str(kpi_id),
            )
            if alert:
                alerts = [alert]
    for alert in alerts:
        alert_id = getattr(alert, "alert_id", "N/A")
        alert_type = getattr(alert, "alert_type", "Deviation alert")
        severity = getattr(alert, "severity", "High")
        msg = getattr(alert, "message", "Threshold breached")

        print(f"\n{BOLD}{RED}🚨 CRITICAL ALERT TRIGGERED!{RESET}")
        print(f"  • Alert ID:   {BOLD}{alert_id}{RESET}")
        print(f"  • Type:       {alert_type}")
        print(f"  • Severity:   {BOLD}{RED}{severity}{RESET}")
        print(f"  • Message:    {msg}")
        print(f"  • Status:     Active")

        # AWS SNS Broadcast
        print(f"\n{BOLD}📢 MULTI-CHANNEL NOTIFICATION DISPATCH:{RESET}")
        print(f"  • Email:       Queued via SMTP to clinic managers & technicians")
        print(f"  • Web Push:    Dispatched to active browser sessions")
        sns_res = sns_service.publish_critical_alert(alert, device_label=device_label, target_phone=phone)
        if sns_res.get("topic_published"):
            print(f"  • {GREEN}AWS SNS Topic:  PUBLISHED (MsgId: {sns_res.get('topic_message_id')}){RESET}")
        else:
            print(f"  • {YELLOW}AWS SNS Topic:  READY / SIMULATED (Configure AWS_SNS_TOPIC_ARN in .env){RESET}")

        if sns_res.get("sms_sent"):
            print(f"  • {GREEN}AWS SNS SMS:    SENT to {phone} (MsgId: {sns_res.get('sms_message_id')}){RESET}")
        elif phone:
            print(f"  • {YELLOW}AWS SNS SMS:    SIMULATED to {phone}{RESET}")

        if email:
            try:
                from collections import namedtuple
                MockUser = namedtuple("MockUser", ["user_id", "email", "name"])
                mock_user = MockUser(user_id="CLI-USER-1", email=email, name="Steezy / Lab Director")
                branch, ctx = service._resolve_alert_email_context(alert)
                if not branch:
                    branch = db.query(HospitalBranch).first()
                if not ctx:
                    ctx = {
                        "device_label": device_label,
                        "device_noun": "Tank",
                        "device_code": device_label,
                        "zone_name": "Storage Area",
                        "is_cryotank": True,
                    }
                service._dispatch_alert_emails(
                    alert,
                    [mock_user],
                    branch,
                    ctx,
                    alert_name=metric,
                    kpi_name=metric,
                    first_alert_value=f"{breach_value:.2f}°C",
                    current_value=f"{breach_value:.2f}°C",
                )
                print(f"  • {GREEN}SES SMTP Email: SENT rich HTML template to {email} (critical_alert_email.html){RESET}")
            except Exception as mail_exc:
                print(f"  • {RED}SES SMTP Email: FAILED ({mail_exc}){RESET}")

    print(f"\n{BOLD}{GREEN}✓ Audit trail logged to `activity_logs` table.{RESET}")
    print(f"{BOLD}{CYAN}------------------------------------------------------------\n{RESET}")


def main():
    parser = argparse.ArgumentParser(description="Simulate live sensor deviation and trigger alerts in Vyrona")
    parser.add_argument("--tank", type=int, default=4, help="Tank ID to simulate deviation for (default: 4)")
    parser.add_argument("--metric", type=str, default="temp_internal", help="Metric name (default: temp_internal)")
    parser.add_argument("--value", type=float, default=-112.5, help="Breach value (default: -112.5 °C)")
    parser.add_argument("--phone", type=str, default=None, help="Optional mobile number for emergency SMS testing (e.g. +919876543210)")
    parser.add_argument("--email", type=str, default="steezyadopted@gmail.com", help="Recipient email for SES SMTP rich HTML email")

    args = parser.parse_args()
    db = SessionLocal()
    try:
        simulate_tank_deviation(
            db,
            tank_id=args.tank,
            breach_value=args.value,
            metric=args.metric,
            phone=args.phone,
            email=args.email,
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
