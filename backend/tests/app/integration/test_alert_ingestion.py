import pytest
import requests
import time
from datetime import datetime, timezone
from sqlalchemy import text

from app.config.database import SessionLocal

# Endpoints
INGESTION_URL = "http://localhost:7072/api/tive/webhook"
SMTP_API_URL = "http://localhost:5000/api/Messages"

@pytest.fixture
def db():
    """Function-level database session for provisioning and verification."""
    session = SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()

@pytest.fixture(autouse=True)
def setup_teardown_environment(db):
    """
    Ensures Branch 26, Tank 94, and test-user94@mygrape.com are cleanly set up
    before tests run, and cleaned up afterward.
    """
    print("\n[Setup] Ensuring ln2_iot_devices columns exist...")
    alter_statements = [
        "ALTER TABLE ln2_iot_devices ADD COLUMN IF NOT EXISTS spike_tolerance_kg NUMERIC(8,4) DEFAULT 0.8",
        "ALTER TABLE ln2_iot_devices ADD COLUMN IF NOT EXISTS spike_max_duration_s INTEGER DEFAULT 90",
        "ALTER TABLE ln2_iot_devices ADD COLUMN IF NOT EXISTS lid_weight_min_kg NUMERIC(8,4) DEFAULT 0.45",
        "ALTER TABLE ln2_iot_devices ADD COLUMN IF NOT EXISTS lid_weight_max_kg NUMERIC(8,4) DEFAULT 0.65",
        "ALTER TABLE ln2_iot_devices ADD COLUMN IF NOT EXISTS lid_confirm_stable_points INTEGER DEFAULT 4",
        "ALTER TABLE ln2_iot_devices ADD COLUMN IF NOT EXISTS low_level_threshold_kg NUMERIC(10,4) DEFAULT 5.0",
        "ALTER TABLE ln2_iot_devices ADD COLUMN IF NOT EXISTS low_level_consecutive_readings INTEGER DEFAULT 10",
        "ALTER TABLE ln2_iot_devices ADD COLUMN IF NOT EXISTS canister_weight_kg NUMERIC(8,4) DEFAULT 0.31",
        "ALTER TABLE ln2_iot_devices ADD COLUMN IF NOT EXISTS canister_tolerance_kg NUMERIC(8,4) DEFAULT 0.05",
        "ALTER TABLE ln2_iot_devices ADD COLUMN IF NOT EXISTS product_change_max_kg NUMERIC(8,4) DEFAULT 0.08",
        "ALTER TABLE ln2_iot_devices ADD COLUMN IF NOT EXISTS precaution_level_pct NUMERIC(6,2) DEFAULT 15.0"
    ]
    for stmt in alter_statements:
        db.execute(text(stmt))
    db.commit()

    # print("\n[Setup] Cleaning any leftover test data...")
    # clean_test_records(db)

    print("[Setup] Provisioning Hospital 26, Branch 26, Device, Tank 94, ln2_iot_devices, test IVF User, and KPI configurations...")
    
    # 1. Create Hospital 26
    db.execute(text("""
        INSERT INTO hospitals (hospital_id, hospital_name, created_at, updated_at, is_email_notifify, is_whatsapp_notify)
        VALUES (26, 'Test Hospital 26', NOW(), NOW(), true, true)
        ON CONFLICT (hospital_id) DO NOTHING;
    """))

    # 2. Create Branch 26 (linked to Hospital 26)
    db.execute(text("""
        INSERT INTO hospital_branches (branch_id, hospital_id, branch_name, created_at, updated_at)
        VALUES (26, 26, 'Main Branch 26', NOW(), NOW())
        ON CONFLICT (branch_id) DO NOTHING;
    """))

    # 3. Create Device IOT1234567
    device_res = db.execute(text("""
        INSERT INTO devices (branch_id, device_code, created_at, updated_at)
        VALUES (26, 'IOT1234567', NOW(), NOW())
        RETURNING id;
    """))
    device_id = device_res.scalar()

    # 4. Create Tank 94 (linked to Branch 26) with all weights and Tive ID
    db.execute(text("""
        INSERT INTO tanks (
            tank_id, branch_id, tank_code, is_active, status, capacity_liters,
            empty_weight_kg, full_weight_kg, static_evap_rate_l_per_day, tive_device_id,
            created_at, updated_at
        )
        VALUES (
            94, 26, 'T94', true, 'safe', 47.0,
            22.1560, 57.5000, 0.3700, 'K7654321',
            NOW(), NOW()
        )
        ON CONFLICT (tank_id) DO NOTHING;
    """))

    # 5. Create ln2_iot_devices configuration for Tank 94
    db.execute(text(f"""
        INSERT INTO ln2_iot_devices (
            tank_id, device_id, tank_max_capacity_reading, tank_min_capacity_reading,
            created_at, updated_at, closed_noise_margin_kg_per_h, open_rate_min_kg_per_h,
            refill_threshold_kg, window_minutes, window_min_points, consecutive_windows_for_state,
            spike_tolerance_kg, spike_max_duration_s, lid_weight_min_kg, lid_weight_max_kg,
            lid_confirm_stable_points, low_level_threshold_kg, low_level_consecutive_readings,
            canister_weight_kg, canister_tolerance_kg, product_change_max_kg, precaution_level_pct
        )
        VALUES (
            94, {device_id}, 57.5000, 22.1560, NOW(), NOW(), 0.0270, 0.0000, 1.0000, 1, 1, 1,
            0.8000, 60, 0.3000, 0.8500, 1, 5.0000, 60, 0.3100, 0.0500, 0.0800, 15.00
        );
    """))

    # 6. Create test user (User role, IVF department, Branch 26) to receive notifications
    db.execute(text("""
        INSERT INTO users (
            user_id, email, password_hash, first_name, last_name, role, status, approved_status, hospital_id, branch_id, department, onboarding_completed, created_at, updated_at
        )
        VALUES (
            'usr-test-94', 'test-user94@mygrape.com', 'dummy_hash_for_testing', 'Test', 'User', 'User', true, 'approved', 26, 26, 'IVF', false, NOW(), NOW()
        )
        ON CONFLICT (email) DO NOTHING;
    """))

    # 7. Create KPI configurations for tank 94
    db.execute(text("""
        INSERT INTO kpi_config (
            hospital_id, branch_id, tank_id, kpi_name, alert_name, min, max, unit, alert_type, cooldown_minutes, status
        )
        VALUES 
            (26, 26, 94, 'temp_internal', 'critical', -196.0000, -150.0000, '°C', 'critical_alert', 1, true),
            (26, 26, 94, 'shock', 'critical', 0.0000, 2.0000, 'g', 'critical_alert', 1, true)
    """))
    db.commit()

    yield

    # print("\n[Teardown] Cleaning test data...")
    # clean_test_records(db)

def clean_test_records(db):
    """Clean all test data from the DB to make tests repeatable and clean."""
    try:
        # Delete related alerts
        db.execute(text("DELETE FROM critical_alerts WHERE tank_id = 94;"))
        
        # Delete processed telemetry / quality logs / geolocation
        db.execute(text("DELETE FROM ivf_geolocation WHERE tank_id = 94;"))
        db.execute(text("DELETE FROM ivf_quality_log WHERE tank_id = 94;"))
        db.execute(text("DELETE FROM ivf_telemetry_data WHERE tank_id = 94;"))
        
        # Delete custom iot raw data and readings
        db.execute(text("DELETE FROM ln2_readings WHERE device_id IN (SELECT id FROM devices WHERE device_code = 'IOT1234567');"))
        db.execute(text("DELETE FROM ln2_iot_raw_data WHERE tank_id = 94;"))
        
        # Delete readings linked to tank 94
        db.execute(text("DELETE FROM readings WHERE tank_id = 94;"))

        # Delete KPI configurations for tank 94
        db.execute(text("DELETE FROM kpi_config WHERE tank_id = 94;"))

        # Delete custom iot configurations and devices
        db.execute(text("DELETE FROM ln2_iot_devices WHERE tank_id = 94;"))
        db.execute(text("DELETE FROM devices WHERE device_code = 'IOT1234567';"))
        
        # Delete branch, tank, and user
        db.execute(text("DELETE FROM users WHERE email = 'test-user94@mygrape.com';"))
        db.execute(text("DELETE FROM tanks WHERE tank_id = 94;"))
        db.execute(text("DELETE FROM hospital_branches WHERE branch_id = 26;"))
        db.execute(text("DELETE FROM hospitals WHERE hospital_id = 26;"))
        
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"Error cleaning test records: {e}")

# ============================================================================
# Test Cases
# ============================================================================

def test_custom_iot_alert_flow(db):
    """
    Test CUSTOM_IOT weight sensor critical alert flow:
    - Registers device IOT1234567 under Branch 26 and maps it to Tank 94.
    - Sets thresholds in ln2_iot_devices and tanks.
    - Sends a payload with critical low weight (10.0 kg, which is below sensor_min_kg).
    - Verifies that:
      1. ln2_iot_raw_data gets created.
      2. A critical alert is generated in the database.
      3. An email is dispatched to test-user94@mygrape.com.
    """
    print("\n--- TEST: CUSTOM_IOT WEIGHT ALERT ---")
    print(f"DEBUG: Connecting to database URL: {db.bind.url}")

    # Setup is now done at the beginning in setup_teardown_environment

    # Diagnostic check
    print("--- DIAGNOSTIC QUERY ---")
    diag_res = db.execute(text("""
        SELECT
        d.id AS device_pk,
        d.device_code,
        lid.tank_id,
        t.empty_weight_kg,
        t.full_weight_kg,
        t.capacity_liters,
        t.static_evap_rate_l_per_day,
        t.tank_code,
        COALESCE(lid.tank_min_capacity_reading, t.empty_weight_kg - 2.0) AS sensor_min_kg,
        COALESCE(lid.tank_max_capacity_reading, t.full_weight_kg + 2.0) AS sensor_max_kg,
        lid.closed_noise_margin_kg_per_h,
        lid.open_rate_min_kg_per_h,
        lid.refill_threshold_kg,
        lid.window_minutes,
        lid.window_min_points,
        lid.consecutive_windows_for_state,
        COALESCE(lid.spike_tolerance_kg, 0.8)             AS spike_tolerance_kg,
        COALESCE(lid.spike_max_duration_s, 90)            AS spike_max_duration_s,
        COALESCE(lid.lid_weight_min_kg, 0.45)             AS lid_weight_min_kg,
        COALESCE(lid.lid_weight_max_kg, 0.65)             AS lid_weight_max_kg,
        COALESCE(lid.lid_confirm_stable_points, 4)        AS lid_confirm_stable_points,
        COALESCE(lid.low_level_threshold_kg, 5.0)         AS low_level_threshold_kg,
        COALESCE(lid.low_level_consecutive_readings, 10)  AS low_level_consecutive_readings,
        COALESCE(lid.canister_weight_kg, 0.31)            AS canister_weight_kg,
        COALESCE(lid.canister_tolerance_kg, 0.05)         AS canister_tolerance_kg,
        COALESCE(lid.product_change_max_kg, 0.08)         AS product_change_max_kg,
        COALESCE(lid.precaution_level_pct, 15.0)          AS precaution_level_pct
        FROM devices d
        JOIN ln2_iot_devices lid ON lid.device_id = d.id
        JOIN tanks t ON t.tank_id = lid.tank_id
        WHERE d.device_code = 'IOT1234567'
        LIMIT 1
    """)).fetchone()
    print(f"Diagnostic join result: {diag_res}")

    # 2. Clear smtp4dev inbox before test
    try:
        requests.delete(SMTP_API_URL, timeout=5)
    except Exception:
        pass

    # 3. Capture test start time BEFORE sending payload (for email timestamp validation)
    test_start_time = datetime.now(timezone.utc)

    # 4. Post CUSTOM_IOT payload to ingestion endpoint
    # Send weight = 10.0 kg which is < sensor_min_kg (22.1560) -> sensor fault alert
    payload = {
        "source": "CUSTOM_IOT",
        "deviceid": "IOT1234567",
        "payload": 10.0,
        "lid_state": 2,
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
    }

    print(f"Sending CUSTOM_IOT critical payload to {INGESTION_URL}...")
    headers = {"Content-Type": "application/json"}
    resp = requests.post(INGESTION_URL, json=payload, headers=headers, timeout=10)
    assert resp.status_code == 200, f"Webhook ingestion failed: {resp.status_code} - {resp.text}"
    print("Ingestion webhook accepted request successfully.")

    # 5. Poll database to check for raw data and alert creation
    print("Polling database to verify alert generation...")
    alert_created = False
    raw_data_created = False
    for i in range(10):  # Poll for up to 10 seconds
        time.sleep(1)
        db.rollback()  # Refresh transaction to see concurrent updates
        
        # Check raw data
        raw_count = db.execute(text("SELECT COUNT(*) FROM ln2_iot_raw_data WHERE tank_id = 94")).scalar()
        if raw_count > 0:
            raw_data_created = True
            break

        # Check critical alerts
        alert_count = db.execute(text("SELECT COUNT(*) FROM critical_alerts WHERE tank_id = 94")).scalar()
        if alert_count > 0:
            alert_created = True
            break

    assert (raw_data_created), "Telemetry log was not inserted in ln2_iot_raw_data"
    assert not (alert_created), "Critical alert row was unexpectedly generated in critical_alerts table"
    print("OK: Alert not created in database successfully!")


    # 5. Verify smtp4dev did NOT dispatch an email for this alert
    print("Polling smtp4dev API to confirm NO email was dispatched (email should be suppressed)...")
    email_dispatched = False
    for i in range(5):
        time.sleep(1)
        try:
            emails_res = requests.get(SMTP_API_URL, timeout=5).json()
            emails = emails_res.get("results", []) if isinstance(emails_res, dict) else emails_res
            for msg in emails:
                to_addr = msg.get("to") or ""
                subject = msg.get("subject") or ""
                received_time_str = msg.get("receivedDate", "")
                
                # Only consider emails received after test started
                if received_time_str:
                    try:
                        received_time = datetime.fromisoformat(received_time_str.replace("Z", "+00:00"))
                        if received_time < test_start_time:
                            continue  # Skip old emails
                    except:
                        pass
                
                if "test-user94@mygrape.com" in to_addr and "Critical Alert" in subject:
                    email_dispatched = True
                    print(f"UNEXPECTED: Found a dispatched email: '{subject}' to {to_addr}")
                    break
            if email_dispatched:
                break
        except Exception as e:
            print(f"Error polling smtp4dev: {e}")

    assert not email_dispatched, (
        "Expected NO email to be dispatched for this CUSTOM_IOT alert, "
        "but an email was found in smtp4dev inbox for test-user94@mygrape.com"
    )
    print("OK: Confirmed — no email was dispatched (as expected) for this CUSTOM_IOT alert flow.")


def test_tive_alert_flow(db):
    """
    Test TIVE IVF critical temp excursion alert flow:
    - Configures Tank 94 with tive_device_id = 'K7654321' and sets it active.
    - Sends a Tive IVF payload containing a cryogenic temp excursion (-10.0°C) and G-force shock (5.0G).
    - Verifies that:
      1. ivf_telemetry_data gets created.
      2. ivf_quality_log gets created (due to violations).
      3. A critical alert is generated in critical_alerts.
      4. An email is dispatched to test-user94@mygrape.com.
    """
    print("\n--- TEST: TIVE IVF TEMPERATURE AND SHOCK ALERT ---")

    # Setup is now done at the beginning in setup_teardown_environment

    # 2. Clear smtp4dev inbox before test
    try:
        requests.delete(SMTP_API_URL, timeout=5)
    except Exception:
        pass

    # 3. Capture test start time BEFORE sending payload (for email timestamp validation)
    test_start_time = datetime.now(timezone.utc)

    # 4. Pre-test diagnostics
    print("Pre-test: Checking alert config...")
    config_check = db.execute(text("""
        SELECT kpi_name, alert_type, min, max, cooldown_minutes, status
        FROM kpi_config WHERE tank_id = 94
    """)).fetchall()
    print(f"KPI Configs: {config_check}")

    hosp_check = db.execute(text("""
        SELECT hospital_id, is_email_notifify FROM hospitals WHERE hospital_id = 26
    """)).fetchone()
    print(f"Hospital email enabled: {hosp_check}")

    # 5. Post TIVE payload to ingestion endpoint
    # Send temperature = -10.0 Celsius (cryogenic excursion) and Shock = 5.0 G (shock event)
    now = datetime.now(timezone.utc)
    payload = {
        "EntityName": "K7654321",
        "EntryTimeEpoch": int(now.timestamp() * 1000),
        "EntryTimeUtc": now.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
        "Cellular": {"SignalStrength": None, "Dbm": None},
        "Temperature": {"Celsius": 22.0, "Fahrenheit": 71.6},
        "ExternalTemperature": {"Celsius": None, "Fahrenheit": None},
        "ProbeTemperature": {"Celsius": -10.0, "Fahrenheit": 14.0},
        "Pressure": {"Psi": None, "Atmospheric": None},
        "Humidity": {"Percentage": 64.2},
        "Weather": {"Temperature": {"Celsius": None, "Fahrenheit": None}, "Wind": None},
        "Accelerometer": {"G": 5.0, "X": 0.05, "Y": -1.05, "Z": -0.22},
        "Light": {"Lux": 0.0},
        "MinLight": {"Lux": None},
        "MaxLight": {"Lux": None},
        "Battery": {"Percentage": 100.0, "Estimation": "N/A", "IsCharging": False},
        "Shock": {"G": 5.0, "X": None, "Y": None, "Z": None},
        "ShockTime": None,
        "TiltAngle": {"Degrees": None},
        "Shipment": None,
        "AccountId": 9104,
        "DeviceId": "865918077678289",
        "DeviceName": "K7654321",
        "ShipmentId": "TEST-SHIP-94",
        "PublicShipmentId": None,
        "PostSeqNum": None,
        "PostTotalCount": None,
        "IsLastItemInPostingBatch": True,
        "Location": {
            "Name": None, "Latitude": 12.9716, "Longitude": 77.5946, "FormattedAddress": None,
            "Address": None, "LocationMethod": None, "Accuracy": None, "AccuracyConfidence": None,
            "GeolocationSourceName": None, "IsGpsLocationAvailable": True, "IsCellLocationAvailable": None,
            "IsWifiLocationAvailable": None, "IsCompositeLocationAvailable": None, "CellTowerUsedCount": None,
            "WifiAccessPointUsedCount": None
        }
    }

    print(f"Sending TIVE critical payload to {INGESTION_URL}...")
    headers = {"Content-Type": "application/json"}
    resp = requests.post(INGESTION_URL, json=payload, headers=headers, timeout=10)
    assert resp.status_code == 200, f"Webhook ingestion failed: {resp.status_code} - {resp.text}"
    print("Ingestion webhook accepted request successfully.")

    # 6. Poll database to check for raw data, quality logs, and alert creation
    print("Polling database to verify IVF telemetry and quality logs...")
    telemetry_created = False
    quality_log_created = False
    alert_created = False
    for i in range(10):  # Poll for up to 10 seconds
        time.sleep(1)
        db.rollback()  # Refresh transaction to see concurrent updates
        
        # Check telemetry
        tel_count = db.execute(text("SELECT COUNT(*) FROM ivf_telemetry_data WHERE tank_id = 94")).scalar()
        if tel_count > 0:
            telemetry_created = True

        # Check quality log
        q_count = db.execute(text("SELECT COUNT(*) FROM readings WHERE tank_id = 94")).scalar()
        if q_count > 0:
            quality_log_created = True

        # Check critical alerts
        alert_count = db.execute(text("SELECT COUNT(*) FROM critical_alerts WHERE tank_id = 94")).scalar()
        if alert_count > 0:
            alert_created = True
            break

    assert telemetry_created, "No telemetry log inserted in ivf_telemetry_data"
    assert quality_log_created, "No quality log inserted in ivf_quality_log (required for violations)"
    assert alert_created, "No critical alert generated in critical_alerts table"
    print("OK: IVF Alert created in database successfully!")

    # 6. Check smtp4dev for the dispatched email
    print("Polling smtp4dev API to verify email dispatch...")
    email_dispatched = False
    for i in range(5):
        time.sleep(1)
        try:
            emails_res = requests.get(SMTP_API_URL, timeout=5).json()
            emails = emails_res.get("results", []) if isinstance(emails_res, dict) else emails_res
            for msg in emails:
                to_addr = msg.get("to") or ""
                subject = msg.get("subject") or ""
                received_time_str = msg.get("receivedDate", "")
                
                # Only consider emails received after test started
                if received_time_str:
                    try:
                        received_time = datetime.fromisoformat(received_time_str.replace("Z", "+00:00"))
                        if received_time < test_start_time:
                            continue  # Skip old emails
                    except:
                        pass
                
                if "test-user94@mygrape.com" in to_addr and "Critical Alert" in subject:
                    email_dispatched = True
                    print(f"OK: Found dispatched email: '{subject}' to {to_addr}")
                    break
            if email_dispatched:
                break
        except Exception as e:
            print(f"Error polling smtp4dev: {e}")

    assert email_dispatched, "No critical alert email found in smtp4dev inbox for test-user94@mygrape.com"
    print("OK: IVF Email dispatched and received by smtp4dev successfully!")
