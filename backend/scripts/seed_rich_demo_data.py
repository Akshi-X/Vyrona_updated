"""
seed_rich_demo_data.py

Injects rich, realistic telemetry, container status, and KPI deviations
into AWS RDS for hospital_id=1, branch_id=3 (ARC Fertility Hospitals).
Provides rich charts for:
- Quality Deviations Flagged
- Top Deviation Drivers
- Temperature Distribution
- Flagged Containers
"""

import sys
import uuid
from datetime import datetime, timezone, timedelta
from sqlalchemy import create_engine, text

DB_URL = "postgresql+psycopg2://postgres:Steezy%23123@vyrona-db.cxc6ciki4v61.ap-south-2.rds.amazonaws.com:5432/mygrape"
engine = create_engine(DB_URL)

def run():
    with engine.begin() as conn:
        print("1. Updating priya.ivf@test.com to branch_id = 3 (Chennai Main)...")
        conn.execute(text("UPDATE users SET branch_id = 3 WHERE email = 'priya.ivf@test.com'"))
        
        # Ensure tanks exist and have proper status
        print("2. Setting container statuses...")
        conn.execute(text("UPDATE tanks SET status = 'risk' WHERE tank_id = 4"))
        conn.execute(text("UPDATE tanks SET status = 'safe' WHERE tank_id IN (1, 2, 3, 5, 6)"))
        
        now = datetime.now(timezone.utc)
        
        # Insert time-series readings for the past 24 hours (snapshots every 30 mins)
        print("3. Generating 24-hour telemetry readings...")
        readings_to_insert = []
        
        # Tank 1 (T10): Normal temp, low LN2 deviation towards the end
        # Tank 2 (T20): Clean normal baseline
        # Tank 3 (T30): Normal baseline
        # Tank 4 (T40): Internal temp deviation & shock deviation!
        
        for i in range(48):  # 48 intervals of 30 mins = 24 hours
            ts = now - timedelta(minutes=30 * (47 - i))
            
            # Tank 1
            t1_ln2 = 65.0 - (i * 0.9)  # Drops to ~22%
            t1_ln2_dev = t1_ln2 < 30.0
            conn.execute(text("""
                INSERT INTO readings (hospital_id, branch_id, tank_id, kpi_config_id, kpi_value, timestamp, deviation, deviation_alert_sent)
                VALUES (1, 3, 1, 2, :temp_in, :ts, false, false),
                       (1, 3, 1, 1, :temp_ex, :ts, false, false),
                       (1, 3, 1, 5, :ln2, :ts, :dev, :dev)
            """), {
                "temp_in": -196.2 + (i % 5) * 0.1,
                "temp_ex": 24.5 + (i % 7) * 0.2,
                "ln2": round(t1_ln2, 1),
                "ts": ts,
                "dev": t1_ln2_dev
            })
            
            # Tank 4 (T40) - Breaches temperature & shock at recent hours
            if i >= 36: # In the last 6 hours: temperature deviation!
                t4_temp = -180.0 + (i - 36) * 3.5  # Reaches -141.5°C
                t4_dev = True
                t4_shock = 3.8 if i == 40 else 0.2
                t4_shock_dev = (t4_shock > 2.0)
            else:
                t4_temp = -197.5 + (i % 4) * 0.2
                t4_dev = False
                t4_shock = 0.2
                t4_shock_dev = False
                
            conn.execute(text("""
                INSERT INTO readings (hospital_id, branch_id, tank_id, kpi_config_id, kpi_value, timestamp, deviation, deviation_alert_sent)
                VALUES (1, 3, 4, 26, :temp_in, :ts, :dev, :dev),
                       (1, 3, 4, 25, 27.2, :ts, false, false),
                       (1, 3, 4, 28, 55.0, :ts, false, false),
                       (1, 3, 4, 31, :shock, :ts, :s_dev, :s_dev)
            """), {
                "temp_in": round(t4_temp, 2),
                "ts": ts,
                "dev": t4_dev,
                "shock": t4_shock,
                "s_dev": t4_shock_dev
            })

            # Tank 3 (T30)
            conn.execute(text("""
                INSERT INTO readings (hospital_id, branch_id, tank_id, kpi_config_id, kpi_value, timestamp, deviation, deviation_alert_sent)
                VALUES (1, 3, 3, 18, :temp_in, :ts, false, false),
                       (1, 3, 3, 17, 25.1, :ts, false, false),
                       (1, 3, 3, 20, 68.4, :ts, false, false)
            """), {
                "temp_in": -195.8 + (i % 3) * 0.2,
                "ts": ts
            })

        print("4. Inserting active October critical alerts...")
        alerts = [
            {
                "id": str(uuid.uuid4()),
                "tank_id": 4,
                "type": "DEVIATION",
                "source": "KPI",
                "severity": "CRITICAL",
                "msg": "Internal temperature breach on Tank T40: -141.5°C (Safety threshold: -195.0°C)",
                "status": "ACTIVE",
                "ts": now - timedelta(hours=2)
            },
            {
                "id": str(uuid.uuid4()),
                "tank_id": 4,
                "type": "SHOCK",
                "source": "KPI",
                "severity": "HIGH",
                "msg": "Physical shock anomaly detected on Tank T40: 3.8G (Limit: 2.0G)",
                "status": "ACTIVE",
                "ts": now - timedelta(hours=4)
            },
            {
                "id": str(uuid.uuid4()),
                "tank_id": 1,
                "type": "DEVIATION",
                "source": "KPI",
                "severity": "MEDIUM",
                "msg": "LN2 level dropped below safety buffer on Tank T10: 22.0% (Limit: 30.0%)",
                "status": "ACTIVE",
                "ts": now - timedelta(hours=6)
            },
            {
                "id": str(uuid.uuid4()),
                "tank_id": 3,
                "type": "LID_OPEN",
                "source": "KPI",
                "severity": "LOW",
                "msg": "Lid status open for extended duration (>30m) on Tank T30",
                "status": "ACKNOWLEDGED",
                "ts": now - timedelta(hours=14)
            },
            {
                "id": str(uuid.uuid4()),
                "tank_id": 4,
                "type": "TEMPERATURE_EXTERNAL",
                "source": "KPI",
                "severity": "MEDIUM",
                "msg": "High ambient temperature near Tank T40: 32.4°C",
                "status": "ACTIVE",
                "ts": now - timedelta(hours=18)
            }
        ]

        for a in alerts:
            conn.execute(text("""
                INSERT INTO critical_alerts (
                    alert_id, tank_id, hospital_id, branch_id,
                    alert_type, source, severity, message, status,
                    triggered_by, occurred_at, created_at
                ) VALUES (
                    :id, :tank_id, 1, 3,
                    :type, :source, :severity, :msg, :status,
                    'SYSTEM', :ts, :ts
                )
            """), a)

        print("5. Verifying counts...")
        reading_count = conn.execute(text("SELECT count(*) FROM readings WHERE timestamp >= NOW() - INTERVAL '2 days'")).scalar()
        alert_count = conn.execute(text("SELECT count(*) FROM critical_alerts WHERE occurred_at >= NOW() - INTERVAL '2 days'")).scalar()
        print(f"✅ Success! Injected {reading_count} recent readings and {alert_count} active alerts.")

if __name__ == "__main__":
    run()
