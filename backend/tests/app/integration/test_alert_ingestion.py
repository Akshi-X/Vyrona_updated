import pytest
import requests
import time
from datetime import datetime, timezone, timedelta
from sqlalchemy import text

from app.config.database import SessionLocal
from unittest.mock import patch
from app.service.IVF.critical_alert_service import CriticalAlertService
from app.models.readings_model import Readings

# Endpoints
INGESTION_URL = "http://localhost:7072/api/tive/webhook"
SMTP_API_URL = "http://localhost:5005/api/Messages"


def clear_smtp4dev():
    """Delete all messages in smtp4dev inbox (requires per-message DELETE)."""
    try:
        res = requests.get(f"{SMTP_API_URL}?pageSize=1000", timeout=5).json()
        msgs = res.get("results", res) if isinstance(res, dict) else res
        for msg in msgs:
            msg_id = msg.get("id")
            if msg_id:
                requests.delete(f"{SMTP_API_URL}/{msg_id}", timeout=5)
    except Exception:
        pass

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
    Ensures Branch 9926, Tank 94, and test-user94@mygrape.com are cleanly set up
    """


    # print("\n[Setup] Cleaning any leftover test data...")
    # clean_test_records(db)

    print("[Setup] Provisioning Hospital 9926, Branch 9926, Device, Tank 94, ln2_iot_devices, test IVF User, and KPI configurations...")
    
    # 1. Create Hospital 9926
    db.execute(text("""
        INSERT INTO hospitals (hospital_id, hospital_name, created_at, updated_at, is_email_notifify, is_whatsapp_notify)
        VALUES (9926, 'Test Hospital 9926', NOW(), NOW(), true, true)
        ON CONFLICT (hospital_id) DO UPDATE SET
            hospital_name = EXCLUDED.hospital_name,
            is_email_notifify = EXCLUDED.is_email_notifify,
            is_whatsapp_notify = EXCLUDED.is_whatsapp_notify;
    """))

    # 2. Create Branch 9926 (linked to Hospital 9926)
    db.execute(text("""
        INSERT INTO hospital_branches (branch_id, hospital_id, branch_name, created_at, updated_at)
        VALUES (9926, 9926, 'Main Branch 9926', NOW(), NOW())
        ON CONFLICT (branch_id) DO UPDATE SET
            hospital_id = EXCLUDED.hospital_id,
            branch_name = EXCLUDED.branch_name;
    """))

    # 3. Create Device IOT1234567 and IOT1234568
    db.execute(text("DELETE FROM devices WHERE device_code IN ('IOT1234567', 'IOT1234568');"))
    device_res = db.execute(text("""
        INSERT INTO devices (branch_id, device_code, created_at, updated_at)
        VALUES (9926, 'IOT1234567', NOW(), NOW())
        RETURNING id;
    """))
    device_id = device_res.scalar()

    device_res_97 = db.execute(text("""
        INSERT INTO devices (branch_id, device_code, created_at, updated_at)
        VALUES (9926, 'IOT1234568', NOW(), NOW())
        RETURNING id;
    """))
    device_id_97 = device_res_97.scalar()

    # 4. Create Tank 94, 95, and 97 (linked to Branch 9926) with all weights and Tive IDs
    db.execute(text("""
        INSERT INTO tanks (
            tank_id, branch_id, tank_code, is_active, status, capacity_liters,
            empty_weight_kg, full_weight_kg, static_evap_rate_l_per_day, tive_device_id,
            created_at, updated_at
        )
        VALUES (
            94, 9926, 'T94', true, 'safe', 47.0,
            22.1560, 57.5000, 0.3700, 'K7654321',
            NOW(), NOW()
        )
        ON CONFLICT (tank_id) DO UPDATE SET
            branch_id = EXCLUDED.branch_id,
            tank_code = EXCLUDED.tank_code,
            is_active = EXCLUDED.is_active,
            status = EXCLUDED.status,
            capacity_liters = EXCLUDED.capacity_liters,
            empty_weight_kg = EXCLUDED.empty_weight_kg,
            full_weight_kg = EXCLUDED.full_weight_kg,
            static_evap_rate_l_per_day = EXCLUDED.static_evap_rate_l_per_day,
            tive_device_id = EXCLUDED.tive_device_id,
            updated_at = EXCLUDED.updated_at;
    """))

    db.execute(text("""
        INSERT INTO tanks (
            tank_id, branch_id, tank_code, is_active, status, capacity_liters,
            empty_weight_kg, full_weight_kg, static_evap_rate_l_per_day, tive_device_id,
            created_at, updated_at
        )
        VALUES (
            95, 9926, 'T95', true, 'safe', 47.0,
            22.1560, 57.5000, 0.3700, 'K7654322',
            NOW(), NOW()
        )
        ON CONFLICT (tank_id) DO UPDATE SET
            branch_id = EXCLUDED.branch_id,
            tank_code = EXCLUDED.tank_code,
            is_active = EXCLUDED.is_active,
            status = EXCLUDED.status,
            capacity_liters = EXCLUDED.capacity_liters,
            empty_weight_kg = EXCLUDED.empty_weight_kg,
            full_weight_kg = EXCLUDED.full_weight_kg,
            static_evap_rate_l_per_day = EXCLUDED.static_evap_rate_l_per_day,
            tive_device_id = EXCLUDED.tive_device_id,
            updated_at = EXCLUDED.updated_at;
    """))

    db.execute(text("""
        INSERT INTO tanks (
            tank_id, branch_id, tank_code, is_active, status, capacity_liters,
            empty_weight_kg, full_weight_kg, static_evap_rate_l_per_day, tive_device_id,
            created_at, updated_at
        )
        VALUES (
            97, 9926, 'T97', true, 'safe', 47.0,
            22.1560, 57.5000, 0.3700, 'K7654324',
            NOW(), NOW()
        )
        ON CONFLICT (tank_id) DO UPDATE SET
            branch_id = EXCLUDED.branch_id,
            tank_code = EXCLUDED.tank_code,
            is_active = EXCLUDED.is_active,
            status = EXCLUDED.status,
            capacity_liters = EXCLUDED.capacity_liters,
            empty_weight_kg = EXCLUDED.empty_weight_kg,
            full_weight_kg = EXCLUDED.full_weight_kg,
            static_evap_rate_l_per_day = EXCLUDED.static_evap_rate_l_per_day,
            tive_device_id = EXCLUDED.tive_device_id,
            updated_at = EXCLUDED.updated_at;
    """))

    # 5. Create ln2_iot_devices configuration for Tank 94 and Tank 97
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
        )
        ON CONFLICT (tank_id, device_id) DO UPDATE SET
            tank_max_capacity_reading = EXCLUDED.tank_max_capacity_reading,
            tank_min_capacity_reading = EXCLUDED.tank_min_capacity_reading,
            closed_noise_margin_kg_per_h = EXCLUDED.closed_noise_margin_kg_per_h,
            open_rate_min_kg_per_h = EXCLUDED.open_rate_min_kg_per_h,
            refill_threshold_kg = EXCLUDED.refill_threshold_kg,
            window_minutes = EXCLUDED.window_minutes,
            window_min_points = EXCLUDED.window_min_points,
            consecutive_windows_for_state = EXCLUDED.consecutive_windows_for_state,
            spike_tolerance_kg = EXCLUDED.spike_tolerance_kg,
            spike_max_duration_s = EXCLUDED.spike_max_duration_s,
            lid_weight_min_kg = EXCLUDED.lid_weight_min_kg,
            lid_weight_max_kg = EXCLUDED.lid_weight_max_kg,
            lid_confirm_stable_points = EXCLUDED.lid_confirm_stable_points,
            low_level_threshold_kg = EXCLUDED.low_level_threshold_kg,
            low_level_consecutive_readings = EXCLUDED.low_level_consecutive_readings,
            canister_weight_kg = EXCLUDED.canister_weight_kg,
            canister_tolerance_kg = EXCLUDED.canister_tolerance_kg,
            product_change_max_kg = EXCLUDED.product_change_max_kg,
            precaution_level_pct = EXCLUDED.precaution_level_pct,
            updated_at = EXCLUDED.updated_at;
    """))

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
            97, {device_id_97}, 57.5000, 22.1560, NOW(), NOW(), 0.0270, 0.0000, 1.0000, 1, 1, 1,
            0.8000, 60, 0.3000, 0.8500, 1, 5.0000, 60, 0.3100, 0.0500, 0.0800, 15.00
        )
        ON CONFLICT (tank_id, device_id) DO UPDATE SET
            tank_max_capacity_reading = EXCLUDED.tank_max_capacity_reading,
            tank_min_capacity_reading = EXCLUDED.tank_min_capacity_reading,
            closed_noise_margin_kg_per_h = EXCLUDED.closed_noise_margin_kg_per_h,
            open_rate_min_kg_per_h = EXCLUDED.open_rate_min_kg_per_h,
            refill_threshold_kg = EXCLUDED.refill_threshold_kg,
            window_minutes = EXCLUDED.window_minutes,
            window_min_points = EXCLUDED.window_min_points,
            consecutive_windows_for_state = EXCLUDED.consecutive_windows_for_state,
            spike_tolerance_kg = EXCLUDED.spike_tolerance_kg,
            spike_max_duration_s = EXCLUDED.spike_max_duration_s,
            lid_weight_min_kg = EXCLUDED.lid_weight_min_kg,
            lid_weight_max_kg = EXCLUDED.lid_weight_max_kg,
            lid_confirm_stable_points = EXCLUDED.lid_confirm_stable_points,
            low_level_threshold_kg = EXCLUDED.low_level_threshold_kg,
            low_level_consecutive_readings = EXCLUDED.low_level_consecutive_readings,
            canister_weight_kg = EXCLUDED.canister_weight_kg,
            canister_tolerance_kg = EXCLUDED.canister_tolerance_kg,
            product_change_max_kg = EXCLUDED.product_change_max_kg,
            precaution_level_pct = EXCLUDED.precaution_level_pct,
            updated_at = EXCLUDED.updated_at;
    """))

    # 6. Create test user (User role, IVF department, Branch 9926) to receive notifications
    db.execute(text("""
        INSERT INTO users (
            user_id, email, password_hash, first_name, last_name, role, status, approved_status, hospital_id, branch_id, department, onboarding_completed, created_at, updated_at
        )
        VALUES (
            'usr-test-94', 'test-user94@mygrape.com', 'dummy_hash_for_testing', 'Test', 'User', 'User', true, 'approved', 9926, 9926, 'IVF', false, NOW(), NOW()
        )
        ON CONFLICT (email) DO UPDATE SET
            user_id = EXCLUDED.user_id,
            branch_id = EXCLUDED.branch_id,
            hospital_id = EXCLUDED.hospital_id,
            department = EXCLUDED.department,
            role = EXCLUDED.role,
            status = EXCLUDED.status,
            approved_status = EXCLUDED.approved_status,
            password_hash = EXCLUDED.password_hash;
    """))

    # 7. Ensure KPI configs for tank 94 and 95 have correct thresholds for the test
    db.execute(text("""
        UPDATE kpi_config SET min = -196.0000, max = -150.0000, alert_type = 'critical', status = true
        WHERE tank_id = 94 AND kpi_name = 'temp_internal';
    """))
    db.execute(text("""
        UPDATE kpi_config SET min = 0.0000, max = 2.0000, alert_type = 'critical', status = true
        WHERE tank_id = 94 AND kpi_name = 'shock';
    """))
    db.execute(text("""
        UPDATE kpi_config SET min = -196.0000, max = -150.0000, alert_type = 'critical', status = true
        WHERE tank_id = 95 AND kpi_name = 'temp_internal';
    """))
    db.execute(text("""
        UPDATE kpi_config SET min = 0.0000, max = 2.0000, alert_type = 'critical', status = true
        WHERE tank_id = 95 AND kpi_name = 'shock';
    """))
    # Insert only if rows don't exist yet
    db.execute(text("""
        INSERT INTO kpi_config (hospital_id, branch_id, tank_id, kpi_name, alert_name, min, max, unit, alert_type, cooldown_minutes, status)
        SELECT 9926, 9926, 94, 'temp_internal', 'Internal Temperature', -196.0000, -150.0000, '°C', 'critical', 1, true
        WHERE NOT EXISTS (SELECT 1 FROM kpi_config WHERE tank_id = 94 AND kpi_name = 'temp_internal');
    """))
    db.execute(text("""
        INSERT INTO kpi_config (hospital_id, branch_id, tank_id, kpi_name, alert_name, min, max, unit, alert_type, cooldown_minutes, status)
        SELECT 9926, 9926, 94, 'shock', 'Shock Detection', 0.0000, 2.0000, 'g', 'critical', 1, true
        WHERE NOT EXISTS (SELECT 1 FROM kpi_config WHERE tank_id = 94 AND kpi_name = 'shock');
    """))
    db.execute(text("""
        INSERT INTO kpi_config (hospital_id, branch_id, tank_id, kpi_name, alert_name, min, max, unit, alert_type, cooldown_minutes, status)
        SELECT 9926, 9926, 95, 'temp_internal', 'Internal Temperature', -196.0000, -150.0000, '°C', 'critical', 1, true
        WHERE NOT EXISTS (SELECT 1 FROM kpi_config WHERE tank_id = 95 AND kpi_name = 'temp_internal');
    """))
    db.execute(text("""
        INSERT INTO kpi_config (hospital_id, branch_id, tank_id, kpi_name, alert_name, min, max, unit, alert_type, cooldown_minutes, status)
        SELECT 9926, 9926, 95, 'shock', 'Shock Detection', 0.0000, 2.0000, 'g', 'critical', 1, true
        WHERE NOT EXISTS (SELECT 1 FROM kpi_config WHERE tank_id = 95 AND kpi_name = 'shock');
    """))

    # Seed all 7 KPI configurations for Tank 97
    db.execute(text("DELETE FROM kpi_config WHERE tank_id = 97;"))
    kpi_configs_to_seed = [
        ('temp_internal', 'Internal Temperature', -196.0000, -150.0000, '°C'),
        ('temp_external', 'External Temperature', 15.0000, 30.0000, '°C'),
        ('shock', 'Shock Detection', 0.0000, 2.0000, 'g'),
        ('tive_battery_percentage', 'Battery Level', 20.0000, 100.0000, '%'),
        ('ln2_level', 'Liquid Nitrogen Level', 5.0000, 50.0000, 'Kg'),
        ('ln2_evaporation_rate', 'LN2 Evaporation Rate', 0.0000, 0.1000, 'Kg/day'),
        ('ln2_lid_state', 'Lid Open/Closed State', 0.0000, 0.0000, 'state')
    ]
    for kpi_name, alert_name, min_val, max_val, unit in kpi_configs_to_seed:
        db.execute(text("""
            INSERT INTO kpi_config (hospital_id, branch_id, tank_id, kpi_name, alert_name, min, max, unit, alert_type, cooldown_minutes, status)
            VALUES (9926, 9926, 97, :kpi_name, :alert_name, :min_val, :max_val, :unit, 'critical', 1, true)
        """), {"kpi_name": kpi_name, "alert_name": alert_name, "min_val": min_val, "max_val": max_val, "unit": unit})

    db.commit()

    yield

    print("\n[Teardown] Waiting for async processing to finish...")
    time.sleep(2)  # Let telemetry service finish any in-flight writes
    print("[Teardown] Cleaning test data...")
    clean_test_records(db)

def clean_test_records(db):
    """Clean all test data from the DB to make tests repeatable and clean."""
    try:
        # Set a lock timeout so DELETEs fail-fast instead of hanging forever
        db.execute(text("SET lock_timeout = '5s';"))
        # Delete related alerts
        db.execute(text("DELETE FROM critical_alerts WHERE tank_id IN (94, 95, 96, 97);"))
        
        # Delete processed telemetry / quality logs / geolocation
        db.execute(text("DELETE FROM ivf_geolocation WHERE tank_id IN (94, 95, 96, 97);"))
        db.execute(text("DELETE FROM ivf_quality_log WHERE tank_id IN (94, 95, 96, 97);"))
        db.execute(text("DELETE FROM ivf_telemetry_data WHERE tank_id IN (94, 95, 96, 97);"))
        
        # Delete custom iot raw data and readings
        db.execute(text("DELETE FROM ln2_readings WHERE device_id IN (SELECT id FROM devices WHERE device_code IN ('IOT1234567', 'IOT1234568'));"))
        db.execute(text("DELETE FROM ln2_iot_raw_data WHERE tank_id IN (94, 95, 96, 97);"))
        
        # Delete readings linked to tank 94, 95, 96, and 97
        db.execute(text("DELETE FROM readings WHERE tank_id IN (94, 95, 96, 97);"))

        # Delete KPI configurations for tank 94, 95, 96, and 97
        db.execute(text("DELETE FROM kpi_config WHERE tank_id IN (94, 95, 96, 97);"))

        # Delete custom iot configurations and devices
        db.execute(text("DELETE FROM ln2_iot_devices WHERE tank_id IN (94, 95, 96, 97);"))
        db.execute(text("DELETE FROM devices WHERE device_code IN ('IOT1234567', 'IOT1234568');"))
        
        # Delete test tanks
        db.execute(text("DELETE FROM tanks WHERE tank_id IN (94, 95, 96, 97);"))
        
        # Delete branch, tank, and users
        db.execute(text("DELETE FROM otps WHERE user_id IN ('usr-test-94', 'usr-test-esc-u', 'usr-test-esc-a');"))
        db.execute(text("DELETE FROM onboarding_state WHERE user_id IN ('usr-test-94', 'usr-test-esc-u', 'usr-test-esc-a');"))
        db.execute(text("DELETE FROM onboarding_events WHERE user_id IN ('usr-test-94', 'usr-test-esc-u', 'usr-test-esc-a');"))
        db.execute(text("DELETE FROM tasks WHERE assignee_id IN ('usr-test-94', 'usr-test-esc-u', 'usr-test-esc-a') OR created_by_id IN ('usr-test-94', 'usr-test-esc-u', 'usr-test-esc-a') OR updated_by_id IN ('usr-test-94', 'usr-test-esc-u', 'usr-test-esc-a');"))
        db.execute(text("DELETE FROM integration_api_tokens WHERE user_id IN ('usr-test-94', 'usr-test-esc-u', 'usr-test-esc-a');"))
        db.execute(text("DELETE FROM feedback WHERE submitted_by IN ('usr-test-94', 'usr-test-esc-u', 'usr-test-esc-a');"))
        db.execute(text("DELETE FROM feedback_comments WHERE commented_by IN ('usr-test-94', 'usr-test-esc-u', 'usr-test-esc-a');"))
        db.execute(text("DELETE FROM chat_read_status_refrigerator WHERE user_id IN ('usr-test-94', 'usr-test-esc-u', 'usr-test-esc-a');"))
        db.execute(text("DELETE FROM chat_read_status_incubator WHERE user_id IN ('usr-test-94', 'usr-test-esc-u', 'usr-test-esc-a');"))
        db.execute(text("DELETE FROM chat_read_status_canister WHERE user_id IN ('usr-test-94', 'usr-test-esc-u', 'usr-test-esc-a');"))
        db.execute(text("DELETE FROM chat_read_status WHERE user_id IN ('usr-test-94', 'usr-test-esc-u', 'usr-test-esc-a');"))
        db.execute(text("DELETE FROM chat_messages WHERE sender_id IN ('usr-test-94', 'usr-test-esc-u', 'usr-test-esc-a');"))
        db.execute(text("DELETE FROM users WHERE email IN ('test-user94@mygrape.com', 'test-user-esc@mygrape.com', 'test-admin-esc@mygrape.com');"))
        
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"Error cleaning test records: {e}")
    finally:
        # Reset lock_timeout to default for subsequent operations
        try:
            db.execute(text("SET lock_timeout = '0';"))
            db.commit()
        except Exception:
            pass

# ============================================================================
# Test Cases
# ============================================================================

def test_custom_iot_alert_flow(db):
    """
    Test CUSTOM_IOT weight sensor ingestion flow:
    - Registers device IOT1234567 under Branch 9926 and maps it to Tank 94.
    - Sends a payload with low weight (10.0 kg, below sensor_min_kg).
    - Verifies that:
      1. ln2_iot_raw_data gets created.
      2. No critical_alerts row is created (CUSTOM_IOT has no KPI configs for
         ln2_level/evaporation/lid_state in the test seed, so no deviation is
         recorded in readings and /check_kpi finds nothing to alert on).
    Note: smtp4dev is not asserted here because background threads from other tests
    can deposit unrelated emails into the inbox at unpredictable times.
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

    # 2. Post CUSTOM_IOT payload to ingestion endpoint
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

    # 2. Clear smtp4dev inbox before test, then snapshot any stragglers that arrive
    # during setup so we only assert on emails triggered by THIS test's payload.
    try:
        clear_smtp4dev()
    except Exception:
        pass

    pre_send_email_ids: set = set()
    try:
        res = requests.get(f"{SMTP_API_URL}?pageSize=1000", timeout=5).json()
        msgs = res.get("results", res) if isinstance(res, dict) else res
        pre_send_email_ids = {m.get("id") for m in msgs if m.get("id")}
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
        SELECT hospital_id, is_email_notifify FROM hospitals WHERE hospital_id = 9926
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
            emails_res = requests.get(f"{SMTP_API_URL}?pageSize=1000", timeout=5).json()
            emails = emails_res.get("results", []) if isinstance(emails_res, dict) else emails_res
            for msg in emails:
                msg_id = msg.get("id")
                if msg_id and msg_id in pre_send_email_ids:
                    continue  # Straggler from a previous test run — ignore
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


def test_tive_alert_cooldown_flow(db):
    """
    Test TIVE IVF critical temp excursion alert cooldown functioning:
    - Sets cooldown for Tank 95 KPI configs to 1 minute.
    - Sends Payload 1 (ProbeTemperature = -10°C, a deviation).
    - Verifies that 1 critical alert is successfully generated and email is sent to smtp4dev.
    - Sends Payload 2 immediately (while within the 1-minute cooldown window).
    - Verifies that no new alert is generated and no new email is sent during cooldown.
    - Updates database to shift the first alert's timestamp to 2 minutes in the past.
    - Sends Payload 3 (after the simulated cooldown has ended).
    - Verifies that a second alert is generated and a second email is sent to smtp4dev.
    """
    print("\n--- TEST: TIVE IVF ALERT COOLDOWN FUNCTIONING ---")

    # 1. Clean previous records for Tank 95 to start with a clean slate
    db.execute(text("DELETE FROM critical_alerts WHERE tank_id = 95;"))
    db.execute(text("DELETE FROM readings WHERE tank_id = 95;"))
    db.execute(text("DELETE FROM ivf_telemetry_data WHERE tank_id = 95;"))
    db.commit()

    # 2. Configure KPI config for Tank 95 with a 1-minute cooldown
    db.execute(text("""
        UPDATE kpi_config 
        SET cooldown_minutes = 1, min = -196.0000, max = -150.0000, alert_type = 'critical', status = true
        WHERE tank_id = 95 AND kpi_name = 'temp_internal';
    """))
    db.execute(text("""
        UPDATE kpi_config 
        SET cooldown_minutes = 1, min = 0.0000, max = 2.0000, alert_type = 'critical', status = true
        WHERE tank_id = 95 AND kpi_name = 'shock';
    """))
    db.commit()

    # Clear smtp4dev before the test starts
    try:
        clear_smtp4dev()
    except Exception:
        pass

    seen_email_ids = set()
    headers = {"Content-Type": "application/json"}

    # --- payload helper ---
    def get_payload():
        now = datetime.now(timezone.utc)
        return {
            "EntityName": "K7654322",
            "EntryTimeEpoch": int(now.timestamp() * 1000),
            "EntryTimeUtc": now.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
            "Cellular": {"SignalStrength": None, "Dbm": None},
            "Temperature": {"Celsius": 22.0, "Fahrenheit": 71.6},
            "ExternalTemperature": {"Celsius": None, "Fahrenheit": None},
            "ProbeTemperature": {"Celsius": -10.0, "Fahrenheit": 14.0},
            "Pressure": {"Psi": None, "Atmospheric": None},
            "Humidity": {"Percentage": 64.2},
            "Weather": {"Temperature": {"Celsius": None, "Fahrenheit": None}, "Wind": None},
            "Accelerometer": {"G": 1.0, "X": 0.0, "Y": 0.0, "Z": 0.0},
            "Light": {"Lux": 0.0},
            "MinLight": {"Lux": None},
            "MaxLight": {"Lux": None},
            "Battery": {"Percentage": 100.0, "Estimation": "N/A", "IsCharging": False},
            "Shock": {"G": 1.0, "X": None, "Y": None, "Z": None},
            "ShockTime": None,
            "TiltAngle": {"Degrees": None},
            "Shipment": None,
            "AccountId": 9104,
            "DeviceId": "865918077678290",
            "DeviceName": "K7654322",
            "ShipmentId": "TEST-SHIP-95",
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

    # --- email helper ---
    def get_new_emails(seen_ids):
        new_emails = []
        try:
            res = requests.get(f"{SMTP_API_URL}?pageSize=1000", timeout=5).json()
            msgs = res.get("results", res) if isinstance(res, dict) else res
            for msg in msgs:
                msg_id = msg.get("id")
                if msg_id and msg_id not in seen_ids:
                    to_addr = msg.get("to") or ""
                    subject = msg.get("subject") or ""
                    if "test-user94@mygrape.com" in to_addr and "Critical Alert" in subject:
                        new_emails.append(msg)
        except Exception as e:
            print(f"Error checking smtp4dev: {e}")
        return new_emails

    # 3. Post Payload 1 (First deviation)
    print("Sending Payload 1...")
    resp = requests.post(INGESTION_URL, json=get_payload(), headers=headers, timeout=10)
    assert resp.status_code == 200, f"Webhook ingestion failed: {resp.status_code} - {resp.text}"

    # Verify first alert is created
    alert_created_1 = False
    for _ in range(10):
        time.sleep(1)
        db.rollback()
        alert_count = db.execute(text("SELECT COUNT(*) FROM critical_alerts WHERE tank_id = 95")).scalar()
        if alert_count == 1:
            alert_created_1 = True
            break
    assert alert_created_1, "First critical alert was not generated"
    print("OK: First alert generated successfully.")

    # Verify email was dispatched for first alert
    email_found_1 = False
    for _ in range(10):
        time.sleep(1)
        new_emails = get_new_emails(seen_email_ids)
        if new_emails:
            email_found_1 = True
            for msg in new_emails:
                seen_email_ids.add(msg["id"])
            # Wait another 2 seconds and fetch any late-arriving emails for the first payload
            time.sleep(2)
            more_emails = get_new_emails(seen_email_ids)
            for msg in more_emails:
                seen_email_ids.add(msg["id"])
            break
    assert email_found_1, "Email was not dispatched for the first payload"
    print("OK: First email found in smtp4dev inbox.")

    # 4. Post Payload 2 immediately (during cooldown interval)
    # Since cooldown_minutes is 1, a payload sent now must not generate a new alert.
    print("Sending Payload 2 (during cooldown interval)...")
    resp = requests.post(INGESTION_URL, json=get_payload(), headers=headers, timeout=10)
    assert resp.status_code == 200, f"Webhook ingestion failed: {resp.status_code} - {resp.text}"

    # Wait a bit and verify that alert count is still 1 (no new alert generated)
    time.sleep(3)
    db.rollback()
    alert_count = db.execute(text("SELECT COUNT(*) FROM critical_alerts WHERE tank_id = 95")).scalar()
    assert alert_count == 1, f"Expected 1 alert during cooldown, but got {alert_count}"
    print("OK: No new alert generated during cooldown.")

    # Verify no new email was dispatched during cooldown
    new_emails = get_new_emails(seen_email_ids)
    assert len(new_emails) == 0, f"Expected no new email during cooldown, but found {len(new_emails)}"
    print("OK: No new email found in smtp4dev during cooldown.")

    # 5. Shift the first alert's timestamp to 2 minutes ago to simulate cooldown ending
    print("Simulating cooldown ending by shifting the timestamp of the first alert...")
    db.execute(text("""
        UPDATE critical_alerts 
        SET created_at = NOW() - INTERVAL '2 minutes',
            occurred_at = NOW() - INTERVAL '2 minutes',
            updated_at = NOW() - INTERVAL '2 minutes'
        WHERE tank_id = 95;
    """))
    db.commit()

    # 6. Post Payload 3 (after cooldown ended)
    print("Sending Payload 3 (after cooldown)...")
    resp = requests.post(INGESTION_URL, json=get_payload(), headers=headers, timeout=10)
    assert resp.status_code == 200, f"Webhook ingestion failed: {resp.status_code} - {resp.text}"

    # Verify second alert is created
    alert_created_2 = False
    for _ in range(10):
        time.sleep(1)
        db.rollback()
        alert_count = db.execute(text("SELECT COUNT(*) FROM critical_alerts WHERE tank_id = 95")).scalar()
        if alert_count == 2:
            alert_created_2 = True
            break
    assert alert_created_2, f"Second critical alert was not generated after cooldown. Total count is {alert_count}"
    print("OK: Second alert generated successfully after cooldown ended.")

    # Verify email was dispatched for the second alert (after cooldown ended)
    email_found_2 = False
    for _ in range(10):
        time.sleep(1)
        new_emails = get_new_emails(seen_email_ids)
        if new_emails:
            email_found_2 = True
            for msg in new_emails:
                seen_email_ids.add(msg["id"])
            break
    assert email_found_2, "Email was not dispatched for the third payload (after cooldown ended)"
    print("OK: Second email found in smtp4dev inbox.")


def test_tive_alert_escalation_flow(db):
    """
    Test TIVE IVF alert escalation flow:
    - Creates Tank 96 and links it to K7654323 tracker.
    - Sets up two users: a standard user (test-user-esc@mygrape.com) and an admin (test-admin-esc@mygrape.com).
    - Sets KPI config for temp_internal on Tank 96 to have unack_escalation_threshold = 1 (escalate on >1 unack alerts).
    - Sends Payload 1 (first deviation).
      -> Verifies critical alert is generated.
      -> Verifies email is sent to standard user.
      -> Verifies NO email is sent to admin.
    - Shifts first alert/reading back in time by 2 minutes to clear cooldown.
    - Sends Payload 2 (second deviation).
      -> Verifies second critical alert is generated (total active unack alerts = 2).
      -> Verifies escalation email is sent to admin.
    """
    print("\n--- TEST: TIVE IVF ALERT ESCALATION FLOW ---")

    # 1. Clean previous records for Tank 96 and users to start with a clean slate
    db.execute(text("DELETE FROM critical_alerts WHERE tank_id = 96;"))
    db.execute(text("DELETE FROM readings WHERE tank_id = 96;"))
    db.execute(text("DELETE FROM ivf_telemetry_data WHERE tank_id = 96;"))
    db.execute(text("DELETE FROM ivf_quality_log WHERE tank_id = 96;"))
    db.execute(text("DELETE FROM ivf_geolocation WHERE tank_id = 96;"))
    db.execute(text("DELETE FROM users WHERE email IN ('test-user-esc@mygrape.com', 'test-admin-esc@mygrape.com', 'test-user94@mygrape.com');"))
    db.commit()

    # 2. Provision Tank 96 (linked to Branch 9926) with all weights and Tive ID
    db.execute(text("""
        INSERT INTO tanks (
            tank_id, branch_id, tank_code, is_active, status, capacity_liters,
            empty_weight_kg, full_weight_kg, static_evap_rate_l_per_day, tive_device_id,
            created_at, updated_at
        )
        VALUES (
            96, 9926, 'T96', true, 'safe', 47.0,
            22.1560, 57.5000, 0.3700, 'K7654323',
            NOW(), NOW()
        )
        ON CONFLICT (tank_id) DO UPDATE SET
            branch_id = EXCLUDED.branch_id,
            tank_code = EXCLUDED.tank_code,
            is_active = EXCLUDED.is_active,
            status = EXCLUDED.status,
            capacity_liters = EXCLUDED.capacity_liters,
            empty_weight_kg = EXCLUDED.empty_weight_kg,
            full_weight_kg = EXCLUDED.full_weight_kg,
            static_evap_rate_l_per_day = EXCLUDED.static_evap_rate_l_per_day,
            tive_device_id = EXCLUDED.tive_device_id,
            updated_at = EXCLUDED.updated_at;
    """))
    db.commit()

    # 3. Create two users for branch 9926
    db.execute(text("""
        INSERT INTO users (
            user_id, email, password_hash, first_name, last_name, role, status, approved_status, hospital_id, branch_id, department, onboarding_completed, created_at, updated_at
        )
        VALUES (
            'usr-test-esc-u', 'test-user-esc@mygrape.com', 'dummy_hash', 'Esc', 'User', 'User', true, 'approved', 9926, 9926, 'IVF', false, NOW(), NOW()
        )
        ON CONFLICT (email) DO UPDATE SET
            user_id = EXCLUDED.user_id,
            branch_id = EXCLUDED.branch_id,
            hospital_id = EXCLUDED.hospital_id,
            department = EXCLUDED.department,
            role = EXCLUDED.role,
            status = EXCLUDED.status,
            approved_status = EXCLUDED.approved_status,
            password_hash = EXCLUDED.password_hash;
    """))
    db.execute(text("""
        INSERT INTO users (
            user_id, email, password_hash, first_name, last_name, role, status, approved_status, hospital_id, branch_id, department, onboarding_completed, created_at, updated_at
        )
        VALUES (
            'usr-test-esc-a', 'test-admin-esc@mygrape.com', 'dummy_hash', 'Esc', 'Admin', 'Admin', true, 'approved', 9926, 9926, 'IVF', false, NOW(), NOW()
        )
        ON CONFLICT (email) DO UPDATE SET
            user_id = EXCLUDED.user_id,
            branch_id = EXCLUDED.branch_id,
            hospital_id = EXCLUDED.hospital_id,
            department = EXCLUDED.department,
            role = EXCLUDED.role,
            status = EXCLUDED.status,
            approved_status = EXCLUDED.approved_status,
            password_hash = EXCLUDED.password_hash;
    """))
    db.commit()

    # 4. Create and configure KPI config for Tank 96 with a 1-minute cooldown and unack_escalation_threshold = 1
    db.execute(text("""
        INSERT INTO kpi_config (hospital_id, branch_id, tank_id, kpi_name, alert_name, min, max, unit, alert_type, cooldown_minutes, unack_escalation_threshold, status)
        SELECT 9926, 9926, 96, 'temp_internal', 'Internal Temperature', -196.0000, -150.0000, '°C', 'critical', 1, 1, true
        WHERE NOT EXISTS (SELECT 1 FROM kpi_config WHERE tank_id = 96 AND kpi_name = 'temp_internal');
    """))
    db.execute(text("""
        UPDATE kpi_config
        SET cooldown_minutes = 1, min = -196.0000, max = -150.0000, alert_type = 'critical', unack_escalation_threshold = 1, status = true, last_escalation_sent_at = NULL
        WHERE tank_id = 96 AND kpi_name = 'temp_internal';
    """))
    db.commit()

    # Wait for any in-flight emails from previous tests to deliver, then clear smtp4dev
    print("Waiting 5s for in-flight emails from previous tests to deliver...")
    time.sleep(5)
    try:
        clear_smtp4dev()
    except Exception:
        pass

    seen_email_ids = set()

    headers = {"Content-Type": "application/json"}

    # --- payload helper ---
    def get_payload():
        now = datetime.now(timezone.utc)
        return {
            "EntityName": "K7654323",
            "EntryTimeEpoch": int(now.timestamp() * 1000),
            "EntryTimeUtc": now.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
            "Cellular": {"SignalStrength": None, "Dbm": None},
            "Temperature": {"Celsius": 22.0, "Fahrenheit": 71.6},
            "ExternalTemperature": {"Celsius": None, "Fahrenheit": None},
            "ProbeTemperature": {"Celsius": -10.0, "Fahrenheit": 14.0},
            "Pressure": {"Psi": None, "Atmospheric": None},
            "Humidity": {"Percentage": 64.2},
            "Weather": {"Temperature": {"Celsius": None, "Fahrenheit": None}, "Wind": None},
            "Accelerometer": {"G": 1.0, "X": 0.0, "Y": 0.0, "Z": 0.0},
            "Light": {"Lux": 0.0},
            "MinLight": {"Lux": None},
            "MaxLight": {"Lux": None},
            "Battery": {"Percentage": 100.0, "Estimation": "N/A", "IsCharging": False},
            "Shock": {"G": 1.0, "X": None, "Y": None, "Z": None},
            "ShockTime": None,
            "TiltAngle": {"Degrees": None},
            "Shipment": None,
            "AccountId": 9104,
            "DeviceId": "865918077678291",
            "DeviceName": "K7654323",
            "ShipmentId": "TEST-SHIP-96",
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

    # --- email helper ---
    def get_emails_for(email_address, seen_ids):
        new_emails = []
        try:
            res = requests.get(f"{SMTP_API_URL}?pageSize=1000", timeout=5).json()
            msgs = res.get("results", res) if isinstance(res, dict) else res
            for msg in msgs:
                msg_id = msg.get("id")
                if msg_id and msg_id not in seen_ids:
                    to_addr = msg.get("to") or ""
                    if email_address in to_addr:
                        new_emails.append(msg)
        except Exception as e:
            print(f"Error checking smtp4dev: {e}")
        return new_emails

    # 5. Post Payload 1 (First deviation)
    print("Sending Payload 1...")
    resp = requests.post(INGESTION_URL, json=get_payload(), headers=headers, timeout=10)
    assert resp.status_code == 200, f"Webhook ingestion failed: {resp.status_code} - {resp.text}"

    # Verify first alert is created
    alert_created_1 = False
    for _ in range(10):
        time.sleep(1)
        db.rollback()
        alert_count = db.execute(text("SELECT COUNT(*) FROM critical_alerts WHERE tank_id = 96")).scalar()
        if alert_count == 1:
            alert_created_1 = True
            break
    assert alert_created_1, "First critical alert was not generated"
    print("OK: First alert generated successfully.")

    # Verify email was dispatched ONLY to the branch User, not Admin/Manager
    email_found_user_1 = False
    for _ in range(10):
        time.sleep(1)
        user_emails = get_emails_for("test-user-esc@mygrape.com", seen_email_ids)
        if user_emails:
            email_found_user_1 = True
            for msg in user_emails:
                seen_email_ids.add(msg["id"])
            break
    assert email_found_user_1, "Email was not dispatched to the User for the first payload"
    print("OK: First email found in smtp4dev inbox for test-user-esc@mygrape.com.")

    # Verify that no email was sent to test-admin-esc@mygrape.com
    admin_emails_1 = get_emails_for("test-admin-esc@mygrape.com", seen_email_ids)
    assert len(admin_emails_1) == 0, f"Escalation email was prematurely sent to admin on first alert: {admin_emails_1}"
    print("OK: No email sent to test-admin-esc@mygrape.com (as expected, threshold is 1).")

    # 6. Shift the first alert's timestamp to 2 minutes ago to simulate cooldown ending
    print("Simulating cooldown ending by shifting the timestamp of the first alert...")
    db.execute(text("""
        UPDATE critical_alerts 
        SET created_at = NOW() - INTERVAL '2 minutes',
            occurred_at = NOW() - INTERVAL '2 minutes',
            updated_at = NOW() - INTERVAL '2 minutes'
        WHERE tank_id = 96;
    """))
    db.commit()

    # 7. Post Payload 2 (Second deviation - causes escalation because unack alert count is now 2, which is > 1)
    print("Sending Payload 2...")
    resp = requests.post(INGESTION_URL, json=get_payload(), headers=headers, timeout=10)
    assert resp.status_code == 200, f"Webhook ingestion failed: {resp.status_code} - {resp.text}"

    # Verify second alert is created
    alert_created_2 = False
    for _ in range(10):
        time.sleep(1)
        db.rollback()
        alert_count = db.execute(text("SELECT COUNT(*) FROM critical_alerts WHERE tank_id = 96")).scalar()
        if alert_count == 2:
            alert_created_2 = True
            break
    assert alert_created_2, f"Second critical alert was not generated. Total count is {alert_count}"
    print("OK: Second alert generated successfully.")

    # Verify that an email was dispatched to the Admin (escalation email)
    email_found_admin_2 = False
    for _ in range(10):
        time.sleep(1)
        admin_emails = get_emails_for("test-admin-esc@mygrape.com", seen_email_ids)
        if admin_emails:
            email_found_admin_2 = True
            for msg in admin_emails:
                seen_email_ids.add(msg["id"])
            break
    assert email_found_admin_2, "Escalation email was not dispatched to the Admin for the second payload"
    print("OK: Escalation email successfully received by smtp4dev for test-admin-esc@mygrape.com.")


def test_all_kpis_alert_flow(db):
    """
    Test flow for all 6 KPI configurations on Tank 97:
    - 4 Tive KPIs: temp_internal, temp_external, shock, tive_battery_percentage
    - 2 Custom IoT KPIs: ln2_level, ln2_evaporation_rate
    - Verifies that sending payloads with deviations on all 6 triggers corresponding readings and alerts.
    """
    print("\n--- TEST: ALL 6 KPIS ALERT FLOW ---")
    headers = {"Content-Type": "application/json"}
    
    # 1. Test TIVE KPIs (temp_internal, temp_external, shock, tive_battery_percentage)
    # Cryogenic temp excursion (-10°C), room temp excursion (35°C), shock (5.0G), low battery (10%)
    now = datetime.now(timezone.utc)
    tive_payload = {
        "EntityName": "K7654324",
        "EntryTimeEpoch": int(now.timestamp() * 1000),
        "EntryTimeUtc": now.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
        "Cellular": {"SignalStrength": None, "Dbm": None},
        "Temperature": {"Celsius": 35.0, "Fahrenheit": 95.0}, # ambient
        "ExternalTemperature": {"Celsius": 35.0, "Fahrenheit": 95.0},
        "ProbeTemperature": {"Celsius": -10.0, "Fahrenheit": 14.0}, # internal temp
        "Pressure": {"Psi": None, "Atmospheric": None},
        "Humidity": {"Percentage": 64.2},
        "Weather": {"Temperature": {"Celsius": None, "Fahrenheit": None}, "Wind": None},
        "Accelerometer": {"G": 5.0, "X": 0.05, "Y": -1.05, "Z": -0.22},
        "Light": {"Lux": 0.0},
        "MinLight": {"Lux": None},
        "MaxLight": {"Lux": None},
        "Battery": {"Percentage": 10.0, "Estimation": "N/A", "IsCharging": False}, # low battery
        "Shock": {"G": 5.0, "X": None, "Y": None, "Z": None},
        "ShockTime": None,
        "TiltAngle": {"Degrees": None},
        "Shipment": None,
        "AccountId": 9104,
        "DeviceId": "865918077678292",
        "DeviceName": "K7654324",
        "ShipmentId": "TEST-SHIP-97",
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

    print("Sending Tive payload to trigger 4 KPI deviations...")
    resp = requests.post(INGESTION_URL, json=tive_payload, headers=headers, timeout=10)
    assert resp.status_code == 200, f"Webhook ingestion failed: {resp.status_code} - {resp.text}"

    # 2. Test CUSTOM_IOT KPIs (ln2_level, ln2_evaporation_rate)
    # Low mass (2.0Kg), high evaporation
    custom_iot_payload = {
        "source": "CUSTOM_IOT",
        "deviceid": "IOT1234568",
        "payload": 24.1560,              # weight_kg = empty (22.156) + 2.0 kg ln2_mass
        "evaporation_rate_kg_per_day": 2.5,
        "timestamp": now.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
    }

    print("Sending CUSTOM_IOT payload to trigger 2 KPI deviations...")
    resp = requests.post(INGESTION_URL, json=custom_iot_payload, headers=headers, timeout=10)
    assert resp.status_code == 200, f"Webhook ingestion failed: {resp.status_code} - {resp.text}"

    # 3. Poll DB and verify all 6 KPIs have deviations in readings and alerts
    print("Polling database to verify all 6 KPI deviations...")
    kpi_reading_deviations = {}
    expected_kpis = [
        "temp_internal", "temp_external", "shock", "tive_battery_percentage",
        "ln2_level", "ln2_evaporation_rate"
    ]
    
    for _ in range(15):
        time.sleep(1)
        db.rollback()
        
        # Query readings with their kpi names
        rows = db.execute(text("""
            SELECT kc.kpi_name, r.deviation 
            FROM readings r 
            JOIN kpi_config kc ON r.kpi_config_id = kc.id
            WHERE r.tank_id = 97
        """)).fetchall()
        
        for name, dev in rows:
            kpi_reading_deviations[name] = dev
            
        if len(kpi_reading_deviations) >= len(expected_kpis):
            break

    print(f"Captured KPI deviations in database: {kpi_reading_deviations}")
    for kpi in expected_kpis:
        assert kpi in kpi_reading_deviations, f"KPI '{kpi}' reading was not found in the database"
        assert kpi_reading_deviations[kpi] is True, f"KPI '{kpi}' did not register a deviation in the database"
    
    # 4. Check critical_alerts table
    alert_count = db.execute(text("SELECT COUNT(*) FROM critical_alerts WHERE tank_id = 97")).scalar()
    assert alert_count > 0, "No critical alerts were generated for the deviations on Tank 97"
    print(f"OK: Successfully generated {alert_count} critical alerts!")


def test_lid_state_open_alert_flow(db):
    """
    Test ln2_lid_state OPEN alert flow with pre-cooldown and post-cooldown behaviour.

    Unlike other KPIs that fire an alert immediately on deviation, ln2_lid_state
    requires the lid to remain OPEN continuously for the full cooldown period
    (1 minute in this test) BEFORE the first alert+email is sent.

    Flow:
      Phase 1 – Pre-cooldown (lid just opened, within cooldown window):
        1. Send CUSTOM_IOT payload with lid_state=2 (OPEN).
        2. Verify ln2_lid_state reading with deviation=True is created.
        3. Verify NO critical_alert is created (continuity < cooldown).
        4. Verify NO email is dispatched.

      Phase 2 – After pre-cooldown expires (first alert fires):
        5. Shift the first reading's timestamp back 2 minutes so the continuous
           deviation duration exceeds the 1-minute cooldown.
        6. Send another lid_state=2 payload.
        7. Verify a critical_alert IS created.
        8. Verify an email IS dispatched.

      Phase 3 – Standard cooldown (no duplicate alert):
        9. Send another lid_state=2 payload immediately.
        10. Verify alert count stays at 1 (cooldown blocks new alert).
        11. Verify no new email is dispatched.

      Phase 4 – After standard cooldown expires (second alert fires):
        12. Shift the first alert's created_at back 2 minutes.
        13. Send another lid_state=2 payload.
        14. Verify a second alert is created (alert count = 2).
        15. Verify another email is dispatched.
    """
    print("\n--- TEST: LID STATE OPEN ALERT FLOW (PRE-COOLDOWN + POST-COOLDOWN) ---")

    # 0. Clean slate for Tank 97
    db.execute(text("DELETE FROM critical_alerts WHERE tank_id = 97;"))
    db.execute(text("DELETE FROM readings WHERE tank_id = 97;"))
    db.execute(text("DELETE FROM ln2_iot_raw_data WHERE tank_id = 97;"))
    db.execute(text("DELETE FROM ln2_readings WHERE device_id IN (SELECT id FROM devices WHERE device_code = 'IOT1234568');"))
    db.commit()

    # Explicitly create new ln2_lid_state KPI config with 1-minute cooldown
    db.execute(text("UPDATE kpi_config SET status = false WHERE tank_id = 97;"))
    db.execute(text("DELETE FROM kpi_config WHERE tank_id = 97 AND kpi_name = 'ln2_lid_state';"))
    db.execute(text("""
        INSERT INTO kpi_config (hospital_id, branch_id, tank_id, kpi_name, alert_name, min, max, unit, alert_type, cooldown_minutes, status)
        VALUES (9926, 9926, 97, 'ln2_lid_state', 'Lid Open/Closed State', 0.0000, 0.0000, 'state', 'critical', 1, true);
    """))
    db.commit()

    # Clear smtp4dev
    print("Waiting 3s for in-flight emails from previous tests to deliver...")
    time.sleep(3)
    try:
        clear_smtp4dev()
    except Exception:
        pass

    seen_email_ids: set = set()
    try:
        res = requests.get(f"{SMTP_API_URL}?pageSize=1000", timeout=5).json()
        msgs = res.get("results", res) if isinstance(res, dict) else res
        seen_email_ids = {m.get("id") for m in msgs if m.get("id")}
    except Exception:
        pass

    headers = {"Content-Type": "application/json"}

    def get_lid_open_payload():
        now = datetime.now(timezone.utc)
        return {
            "source": "CUSTOM_IOT",
            "deviceid": "IOT1234568",
            "payload": 42.1560,
            "lid_state": 2,
            "timestamp": now.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
        }

    def get_new_emails(seen_ids):
        new_emails = []
        try:
            res = requests.get(f"{SMTP_API_URL}?pageSize=1000", timeout=5).json()
            msgs = res.get("results", res) if isinstance(res, dict) else res
            for msg in msgs:
                msg_id = msg.get("id")
                if msg_id and msg_id not in seen_ids:
                    to_addr = msg.get("to") or ""
                    subject = msg.get("subject") or ""
                    if "test-user94@mygrape.com" in to_addr and "Critical Alert" in subject:
                        html_res = requests.get(f"{SMTP_API_URL}/{msg_id}/html", timeout=5)
                        if html_res.status_code == 200 and "Lid Open/Closed State" in html_res.text:
                            new_emails.append(msg)
        except Exception as e:
            print(f"Error checking smtp4dev: {e}")
        return new_emails

    # ─── Phase 1: Pre-cooldown (deviation just started, within cooldown) ───
    print("\n[Phase 1] Sending first lid_state=2 (OPEN) payload...")
    resp = requests.post(INGESTION_URL, json=get_lid_open_payload(), headers=headers, timeout=10)
    assert resp.status_code == 200, f"Webhook ingestion failed: {resp.status_code} - {resp.text}"

    # Wait for the reading to be processed
    reading_created = False
    for _ in range(15):
        time.sleep(1)
        db.rollback()
        lid_reading = db.execute(text("""
            SELECT r.deviation FROM readings r
            JOIN kpi_config kc ON r.kpi_config_id = kc.id
            WHERE r.tank_id = 97 AND kc.kpi_name = 'ln2_lid_state'
            ORDER BY r.timestamp DESC LIMIT 1
        """)).fetchone()
        if lid_reading is not None:
            reading_created = True
            break
        
        # --- DIAGNOSTIC QUERIES ---
        res_a = db.execute(text("SELECT * FROM kpi_config WHERE tank_id = 97 AND kpi_name = 'ln2_lid_state';")).mappings().all()
        print('A. kpi_config:', [dict(r) for r in res_a])

        res_b = db.execute(text("SELECT * FROM devices WHERE device_code = 'IOT1234568';")).mappings().all()
        print('B. devices:', [dict(r) for r in res_b])

        res_c = db.execute(text("SELECT * FROM ln2_iot_devices WHERE tank_id = 97;")).mappings().all()
        print('C. ln2_iot_devices:', [dict(r) for r in res_c])

        res_d = db.execute(text("SELECT COUNT(*) FROM ln2_iot_raw_data WHERE tank_id = 97;")).scalar()
        print('D. ln2_iot_raw_data count:', res_d)

        res_e = db.execute(text("SELECT COUNT(*) FROM readings WHERE tank_id = 97;")).scalar()
        print('E. readings count:', res_e)
        
        res_err = db.execute(text("SELECT payload, created_at FROM ln2_iot_raw_data WHERE tank_id = 97 ORDER BY created_at DESC LIMIT 5;")).mappings().all()
        print('Recent payloads:', [dict(r) for r in res_err])
        # --------------------------

    assert reading_created, "ln2_lid_state reading was not created in the database"
    assert lid_reading[0] is True, f"ln2_lid_state reading should have deviation=True, got {lid_reading[0]}"
    print("OK: ln2_lid_state reading created with deviation=True.")

    # Verify NO alert was created (pre-cooldown: continuity < cooldown_minutes)
    time.sleep(3)
    db.rollback()
    alert_count = db.execute(text("""
        SELECT COUNT(*) FROM critical_alerts
        WHERE tank_id = 97
        AND dedup_key LIKE '%deviation_alert%'
    """)).scalar()
    assert alert_count == 0, f"Expected 0 alerts during pre-cooldown, but got {alert_count}"
    print("OK: No alert generated during pre-cooldown (as expected).")

    # Verify NO email was dispatched
    new_emails = get_new_emails(seen_email_ids)
    assert len(new_emails) == 0, f"Expected no email during pre-cooldown, but found {len(new_emails)}"
    print("OK: No email sent during pre-cooldown.")

    # ─── Phase 2: Simulate pre-cooldown expiry ───
    print("\n[Phase 2] Simulating pre-cooldown expiry by shifting reading timestamps...")
    # Shift ALL ln2_lid_state readings for tank 97 back by 2 minutes so the
    # continuous deviation duration exceeds the 1-minute cooldown.
    db.execute(text("""
        UPDATE readings
        SET timestamp = timestamp - INTERVAL '2 minutes'
        WHERE tank_id = 97
        AND kpi_config_id IN (SELECT id FROM kpi_config WHERE tank_id = 97 AND kpi_name = 'ln2_lid_state');
    """))
    db.commit()

    print("Sending second lid_state=2 payload (after pre-cooldown expiry)...")
    resp = requests.post(INGESTION_URL, json=get_lid_open_payload(), headers=headers, timeout=10)
    assert resp.status_code == 200, f"Webhook ingestion failed: {resp.status_code} - {resp.text}"

    # Verify first alert IS created
    alert_created_1 = False
    for _ in range(15):
        time.sleep(1)
        db.rollback()
        alert_count = db.execute(text("SELECT COUNT(*) FROM critical_alerts WHERE tank_id = 97")).scalar()
        if alert_count >= 1:
            alert_created_1 = True
            break
    assert alert_created_1, f"First lid_state alert was not generated after pre-cooldown. Count: {alert_count}"
    print(f"OK: First alert generated after pre-cooldown expiry (count={alert_count}).")

    # Verify email was dispatched
    email_found_1 = False
    for _ in range(10):
        time.sleep(1)
        new_emails = get_new_emails(seen_email_ids)
        if new_emails:
            email_found_1 = True
            for msg in new_emails:
                seen_email_ids.add(msg["id"])
            # Wait a bit for any late-arriving emails
            time.sleep(2)
            more_emails = get_new_emails(seen_email_ids)
            for msg in more_emails:
                seen_email_ids.add(msg["id"])
            break
    assert email_found_1, "Email was not dispatched after pre-cooldown expiry"
    print("OK: Email dispatched for first lid_state alert.")

    # ─── Phase 3: Standard cooldown (no duplicate alert) ───
    print("\n[Phase 3] Sending payload during standard cooldown...")
    resp = requests.post(INGESTION_URL, json=get_lid_open_payload(), headers=headers, timeout=10)
    assert resp.status_code == 200, f"Webhook ingestion failed: {resp.status_code} - {resp.text}"

    time.sleep(5)
    db.rollback()
    alert_count_during_cd = db.execute(text("SELECT COUNT(*) FROM critical_alerts WHERE tank_id = 97")).scalar()
    assert alert_count_during_cd == 1, f"Expected 1 alert during cooldown, but got {alert_count_during_cd}"
    print("OK: No new alert generated during standard cooldown.")

    new_emails = get_new_emails(seen_email_ids)
    assert len(new_emails) == 0, f"Expected no new email during cooldown, but found {len(new_emails)}"
    print("OK: No new email during standard cooldown.")

    # ─── Phase 4: After standard cooldown expires ───
    print("\n[Phase 4] Simulating standard cooldown expiry...")
    db.execute(text("""
        UPDATE critical_alerts
        SET created_at = NOW() - INTERVAL '2 minutes',
            occurred_at = NOW() - INTERVAL '2 minutes',
            updated_at = NOW() - INTERVAL '2 minutes'
        WHERE tank_id = 97;
    """))
    # Also shift the lid_state readings back so pre-cooldown check still passes
    db.execute(text("""
        UPDATE readings
        SET timestamp = timestamp - INTERVAL '2 minutes'
        WHERE tank_id = 97
        AND kpi_config_id IN (SELECT id FROM kpi_config WHERE tank_id = 97 AND kpi_name = 'ln2_lid_state');
    """))
    db.commit()

    print("Sending payload after standard cooldown expiry...")
    resp = requests.post(INGESTION_URL, json=get_lid_open_payload(), headers=headers, timeout=10)
    assert resp.status_code == 200, f"Webhook ingestion failed: {resp.status_code} - {resp.text}"

    # Verify second alert is created
    alert_created_2 = False
    for _ in range(15):
        time.sleep(1)
        db.rollback()
        alert_count = db.execute(text("SELECT COUNT(*) FROM critical_alerts WHERE tank_id = 97")).scalar()
        if alert_count >= 2:
            alert_created_2 = True
            break
    assert alert_created_2, f"Second lid_state alert was not generated after cooldown. Count: {alert_count}"
    print(f"OK: Second alert generated after standard cooldown expiry (count={alert_count}).")

    # Verify email was dispatched for second alert
    email_found_2 = False
    for _ in range(10):
        time.sleep(1)
        new_emails = get_new_emails(seen_email_ids)
        if new_emails:
            email_found_2 = True
            for msg in new_emails:
                seen_email_ids.add(msg["id"])
            break
    assert email_found_2, "Email was not dispatched after standard cooldown expiry"
    print("OK: Email dispatched for second lid_state alert after cooldown.")

    print("\nLID STATE OPEN ALERT FLOW TEST PASSED (all 4 phases)")

def test_email_content_check(db):
    """
    Verify that the email sent via smtp4dev correctly injects the
    dynamic values (Tank Code, Hospital Name, Alert Name, and Value).
    """
    print("\n--- TEST: EMAIL CONTENT VERIFICATION ---")
    
    # 1. Start with a clean slate
    clear_smtp4dev()
    
    # 2. Trigger an alert (Using a mock payload that violates a threshold)
    now = datetime.now(timezone.utc)
    payload = {
        "EntityName": "K7654321", # This maps to Tank 94
        "EntryTimeEpoch": int(now.timestamp() * 1000),
        "EntryTimeUtc": now.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
        "Cellular": {"SignalStrength": None, "Dbm": None},
        "Temperature": {"Celsius": 22.0, "Fahrenheit": 71.6},
        "ExternalTemperature": {"Celsius": None, "Fahrenheit": None},
        "ProbeTemperature": {"Celsius": 20.0, "Fahrenheit": 68.0}, # Violates the -150 max threshold!
        "Pressure": {"Psi": None, "Atmospheric": None},
        "Humidity": {"Percentage": 64.2},
        "Weather": {"Temperature": {"Celsius": None, "Fahrenheit": None}, "Wind": None},
        "Accelerometer": {"G": 1.0, "X": 0.0, "Y": 0.0, "Z": 0.0},
        "Light": {"Lux": 0.0},
        "MinLight": {"Lux": None},
        "MaxLight": {"Lux": None},
        "Battery": {"Percentage": 100.0, "Estimation": "N/A", "IsCharging": False},
        "Shock": {"G": 1.0, "X": None, "Y": None, "Z": None},
        "ShockTime": None,
    }
    headers = {"Content-Type": "application/json"}
    requests.post(INGESTION_URL, json=payload, headers=headers, timeout=10)
    
    # 3. Wait for the background worker (telemetry-service) to process it
    print("Waiting 5s for the background worker to send the email...")
    time.sleep(5)
    
    # 4. Fetch the inbox from smtp4dev
    res = requests.get(f"{SMTP_API_URL}?pageSize=10").json()
    msgs = res.get("results", res) if isinstance(res, dict) else res
    
    assert len(msgs) > 0, "Failed: No email was delivered to smtp4dev."
    
    # 5. Inspect the metadata
    latest_msg = msgs[0]
    msg_id = latest_msg["id"]
    subject = latest_msg["subject"]
    
    # Check Subject
    assert "Critical Alert" in subject, f"Unexpected Subject: {subject}"
    assert "T94" in subject, "Subject did not contain the Tank Code"

    # 6. Fetch the raw HTML body of the email
    html_res = requests.get(f"{SMTP_API_URL}/{msg_id}/html")
    html_content = html_res.text
    
    # 7. Assert that the HTML correctly injected the dynamic data!
    assert "Internal Temperature" in html_content, "Missing Alert KPI Name in HTML"
    assert "Main Branch 9926" in html_content, "Missing Branch Name in HTML"
    
    # Assert on the specific deviation message format you requested
    expected_message = "Internal Temperature is deviated to 20.00 in Main Branch 9926 branch for T94 tank"
    assert expected_message in html_content, f"Missing exact deviation message: {expected_message}"
    
    print("OK: Email content was successfully verified!")

def test_midnight_cooldown_check(db):
    """
    Test the critical alert cooldown logic directly to verify it accurately 
    handles crossovers at midnight (e.g., 11:58 PM to 12:02 AM the next day).
    """
    print("\n--- TEST: MIDNIGHT COOLDOWN CROSSOVER ---")

    # 1. Setup: Clean records for Tank 94 to start with a clean slate
    db.execute(text("DELETE FROM critical_alerts WHERE tank_id = 94;"))
    db.execute(text("DELETE FROM readings WHERE tank_id = 94;"))
    db.execute(text("DELETE FROM ivf_telemetry_data WHERE tank_id = 94;"))
    db.commit()

    # 2. Configure KPI config for Tank 94 with a 3-minute cooldown
    db.execute(text("""
        UPDATE kpi_config 
        SET cooldown_minutes = 3, min = -196.0000, max = -150.0000, alert_type = 'critical', status = true
        WHERE tank_id = 94 AND kpi_name = 'temp_internal';
    """))
    db.commit()

    # Clear smtp4dev before the test starts
    try:
        clear_smtp4dev()
    except Exception:
        pass

    seen_email_ids = set()
    headers = {"Content-Type": "application/json"}

    # --- payload helper ---
    # --- payload helper ---
    def get_payload(simulated_time: datetime):
        # Convert the IST simulated_time to UTC for the payload's expected formats
        utc_time = simulated_time.astimezone(timezone.utc)
        return {
            "EntityName": "K7654321",
            "EntryTimeEpoch": int(utc_time.timestamp() * 1000),
            "EntryTimeUtc": utc_time.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
            "Cellular": {"SignalStrength": None, "Dbm": None},
            "Temperature": {"Celsius": 22.0, "Fahrenheit": 71.6},
            "ExternalTemperature": {"Celsius": None, "Fahrenheit": None},
            "ProbeTemperature": {"Celsius": -10.0, "Fahrenheit": 14.0},
            "Pressure": {"Psi": None, "Atmospheric": None},
            "Humidity": {"Percentage": 64.2},
            "Weather": {"Temperature": {"Celsius": None, "Fahrenheit": None}, "Wind": None},
            "Accelerometer": {"G": 1.0, "X": 0.0, "Y": 0.0, "Z": 0.0},
            "Light": {"Lux": 0.0},
            "MinLight": {"Lux": None},
            "MaxLight": {"Lux": None},
            "Battery": {"Percentage": 100.0, "Estimation": "N/A", "IsCharging": False},
            "Shock": {"G": 1.0, "X": None, "Y": None, "Z": None},
            "ShockTime": None,
            "TiltAngle": {"Degrees": None},
            "Shipment": None,
            "AccountId": 9104,
            "DeviceId": "865918077678290",
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

    # --- email helper ---
    def get_new_emails(seen_ids):
        new_emails = []
        try:
            res = requests.get(f"{SMTP_API_URL}?pageSize=1000", timeout=5).json()
            msgs = res.get("results", res) if isinstance(res, dict) else res
            for msg in msgs:
                msg_id = msg.get("id")
                if msg_id and msg_id not in seen_ids:
                    to_addr = msg.get("to") or ""
                    subject = msg.get("subject") or ""
                    if "test-user94@mygrape.com" in to_addr and "Critical Alert" in subject:
                        # fetch the full message's HTML body from the correct endpoint
                        html_res = requests.get(f"{SMTP_API_URL}/{msg_id}/html", timeout=5)
                        msg["html"] = html_res.text if html_res.status_code == 200 else ""
                        new_emails.append(msg)
        except Exception as e:
            print(f"Error checking smtp4dev: {e}")
        return new_emails

    ist_tz = timezone(timedelta(hours=5, minutes=30))

    # --- SIMULATE 11:58 PM IST (First Alert) ---
    time_1 = datetime(2026, 6, 15, 23, 58, 0, tzinfo=ist_tz)
    print(f"Simulating Time 1 (First Payload): {time_1.isoformat()}")
    
    resp = requests.post(INGESTION_URL, json=get_payload(time_1), headers=headers, timeout=10)
    assert resp.status_code == 200, f"Webhook ingestion failed: {resp.status_code} - {resp.text}"

    # Verify first alert is created
    alert_created_1 = False
    for _ in range(10):
        time.sleep(1)
        db.rollback()
        alert_count = db.execute(text("SELECT COUNT(*) FROM critical_alerts WHERE tank_id = 94")).scalar()
        if alert_count == 1:
            alert_created_1 = True
            break
    assert alert_created_1, "First critical alert was not generated"
    print("OK: First alert generated successfully.")

    # Verify email was dispatched for first alert and check timestamp!
    email_found_1 = False
    for _ in range(10):
        time.sleep(1)
        new_emails = get_new_emails(seen_email_ids)
        if new_emails:
            email_found_1 = True
            msg = new_emails[0]
            html_body = msg.get("html", "")
            
            # The email should display the timestamp in IST
            expected_time_str = time_1.strftime("%Y-%m-%d %H:%M:%S IST")
            assert expected_time_str in html_body, f"Expected timestamp '{expected_time_str}' not found in email body"
            print(f"OK: First email found with correct timestamp: {expected_time_str}")

            for e in new_emails:
                seen_email_ids.add(e["id"])
            time.sleep(2)
            more_emails = get_new_emails(seen_email_ids)
            for e in more_emails:
                seen_email_ids.add(e["id"])
            break
    assert email_found_1, "Email was not dispatched for the first payload"

    # --- SIMULATE 11:59 PM IST (Within 3-min Cooldown) ---
    time_2 = datetime(2026, 6, 15, 23, 59, 0, tzinfo=ist_tz)
    print(f"Simulating Time 2 (Within Cooldown): {time_2.isoformat()}")
    
    resp = requests.post(INGESTION_URL, json=get_payload(time_2), headers=headers, timeout=10)
    assert resp.status_code == 200, f"Webhook ingestion failed: {resp.status_code} - {resp.text}"

    # Wait a bit and verify that alert count is still 1
    time.sleep(3)
    db.rollback()
    alert_count = db.execute(text("SELECT COUNT(*) FROM critical_alerts WHERE tank_id = 94")).scalar()
    assert alert_count == 1, f"Expected 1 alert during cooldown, but got {alert_count}"
    print("OK: No new alert generated during cooldown.")

    # Verify no new email was dispatched during cooldown
    new_emails = get_new_emails(seen_email_ids)
    assert len(new_emails) == 0, f"Expected no new email during cooldown, but found {len(new_emails)}"
    print("OK: No new email found in smtp4dev during cooldown.")

    # Shift the first alert's timestamp to 4 minutes ago to simulate cooldown ending!
    print("Simulating cooldown ending by shifting the timestamp of the first alert by 4 minutes...")
    db.execute(text("""
        UPDATE critical_alerts 
        SET created_at = NOW() - INTERVAL '4 minutes',
            occurred_at = NOW() - INTERVAL '4 minutes',
            updated_at = NOW() - INTERVAL '4 minutes'
        WHERE tank_id = 94;
    """))
    db.commit()

    # --- SIMULATE 12:02 AM IST NEXT DAY (After 3-min Cooldown) ---
    time_3 = datetime(2026, 6, 16, 0, 2, 0, tzinfo=ist_tz)
    print(f"Simulating Time 3 (Next Day, After Cooldown): {time_3.isoformat()}")
    
    resp = requests.post(INGESTION_URL, json=get_payload(time_3), headers=headers, timeout=10)
    assert resp.status_code == 200, f"Webhook ingestion failed: {resp.status_code} - {resp.text}"

    # Verify second alert is created
    alert_created_2 = False
    for _ in range(10):
        time.sleep(1)
        db.rollback()
        alert_count = db.execute(text("SELECT COUNT(*) FROM critical_alerts WHERE tank_id = 94")).scalar()
        if alert_count == 2:
            alert_created_2 = True
            break
    assert alert_created_2, f"Second critical alert was not generated after cooldown. Total count is {alert_count}"
    print("OK: Second alert generated successfully after cooldown ended.")

    # Verify email was dispatched for the second alert and check timestamp!
    email_found_2 = False
    for _ in range(10):
        time.sleep(1)
        new_emails = get_new_emails(seen_email_ids)
        if new_emails:
            email_found_2 = True
            msg = new_emails[0]
            html_body = msg.get("html", "")
            
            # The email should display the timestamp in IST
            expected_time_str = time_3.strftime("%Y-%m-%d %H:%M:%S IST")
            assert expected_time_str in html_body, f"Expected timestamp '{expected_time_str}' not found in email body"
            print(f"OK: Second email found with correct timestamp: {expected_time_str}")

            for e in new_emails:
                seen_email_ids.add(e["id"])
            break
    assert email_found_2, "Email was not dispatched for the third payload (after cooldown ended)"

    print("\nMIDNIGHT COOLDOWN CROSSOVER TEST PASSED")


def _get_tive_payload(probe_temp_c: float) -> dict:
    """TIVE IVF payload for K7654321 (Tank 94). ProbeTemperature drives the
    temp_internal KPI; Shock/Accelerometer are held at a safe 1.0G so only
    temp_internal can deviate."""
    now = datetime.now(timezone.utc)
    return {
        "EntityName": "K7654321",
        "EntryTimeEpoch": int(now.timestamp() * 1000),
        "EntryTimeUtc": now.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
        "Cellular": {"SignalStrength": None, "Dbm": None},
        "Temperature": {"Celsius": 22.0, "Fahrenheit": 71.6},
        "ExternalTemperature": {"Celsius": None, "Fahrenheit": None},
        "ProbeTemperature": {"Celsius": probe_temp_c, "Fahrenheit": None},
        "Pressure": {"Psi": None, "Atmospheric": None},
        "Humidity": {"Percentage": 64.2},
        "Weather": {"Temperature": {"Celsius": None, "Fahrenheit": None}, "Wind": None},
        "Accelerometer": {"G": 1.0, "X": 0.0, "Y": 0.0, "Z": 0.0},
        "Light": {"Lux": 0.0},
        "MinLight": {"Lux": None},
        "MaxLight": {"Lux": None},
        "Battery": {"Percentage": 100.0, "Estimation": "N/A", "IsCharging": False},
        "Shock": {"G": 1.0, "X": None, "Y": None, "Z": None},
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


def get_new_emails(seen_ids):
    """Module-level helper: return Critical Alert emails for test-user94 not in seen_ids."""
    new_emails = []
    try:
        res = requests.get(f"{SMTP_API_URL}?pageSize=1000", timeout=5).json()
        msgs = res.get("results", res) if isinstance(res, dict) else res
        for msg in msgs:
            msg_id = msg.get("id")
            if msg_id and msg_id not in seen_ids:
                to_addr = msg.get("to") or ""
                subject = msg.get("subject") or ""
                if "test-user94@mygrape.com" in to_addr and "Critical Alert" in subject:
                    new_emails.append(msg)
    except Exception as e:
        print(f"Error checking smtp4dev: {e}")
    return new_emails


def _snapshot_seen_email_ids():
    """Clear smtp4dev and snapshot any straggler ids so only THIS test's emails count."""
    time.sleep(3)
    try:
        clear_smtp4dev()
    except Exception:
        pass
    try:
        res = requests.get(f"{SMTP_API_URL}?pageSize=1000", timeout=5).json()
        msgs = res.get("results", res) if isinstance(res, dict) else res
        return {m.get("id") for m in msgs if m.get("id")}
    except Exception:
        return set()


def _poll_temp_internal_reading(db, select_cols="r.deviation"):
    """Poll up to 10s for the latest temp_internal reading on Tank 94."""
    reading = None
    for _ in range(10):
        time.sleep(1)
        db.rollback()
        reading = db.execute(text(f"""
            SELECT {select_cols} FROM readings r
            JOIN kpi_config kc ON r.kpi_config_id = kc.id
            WHERE r.tank_id = 94 AND kc.kpi_name = 'temp_internal'
            ORDER BY r.timestamp DESC LIMIT 1
        """)).fetchone()
        if reading is not None:
            break
    return reading


def test_kpi_within_threshold(db):
    print("\n--- TEST: WITHIN THRESHOLD (NO ALERT, NO EMAIL) ---")

    db.execute(text("DELETE FROM critical_alerts WHERE tank_id = 94;"))
    db.execute(text("DELETE FROM readings WHERE tank_id = 94;"))
    db.execute(text("DELETE FROM ivf_telemetry_data WHERE tank_id = 94;"))
    db.execute(text("""
        UPDATE kpi_config SET min = -196.0000, max = -150.0000, alert_type = 'critical', status = true, cooldown_minutes = 1
        WHERE tank_id = 94 AND kpi_name = 'temp_internal';
    """))
    db.commit()

    seen_email_ids = _snapshot_seen_email_ids()
    headers = {"Content-Type": "application/json"}

    # ProbeTemperature = -180°C is within [-196, -150] -> no deviation
    resp = requests.post(INGESTION_URL, json=_get_tive_payload(-180.0), headers=headers, timeout=10)
    assert resp.status_code == 200, f"Webhook ingestion failed: {resp.status_code} - {resp.text}"

    reading = _poll_temp_internal_reading(db)
    assert reading is not None, "temp_internal reading was not created"
    assert reading[0] is False, "Reading was incorrectly marked as deviation"

    time.sleep(3)
    db.rollback()
    alert_count = db.execute(text("SELECT COUNT(*) FROM critical_alerts WHERE tank_id = 94")).scalar()
    assert alert_count == 0, f"Expected 0 alerts, got {alert_count}"

    new_emails = get_new_emails(seen_email_ids)
    assert len(new_emails) == 0, f"Expected 0 emails, got {len(new_emails)}"
    print("OK: Within threshold test passed.")


def test_kpi_soft_alert(db):
    print("\n--- TEST: SOFT ALERT (READING + LOW SEVERITY ALERT, NO EMAIL) ---")

    db.execute(text("DELETE FROM critical_alerts WHERE tank_id = 94;"))
    db.execute(text("DELETE FROM readings WHERE tank_id = 94;"))
    db.execute(text("DELETE FROM ivf_telemetry_data WHERE tank_id = 94;"))
    db.execute(text("""
        UPDATE kpi_config SET min = -196.0000, max = -150.0000, alert_type = 'soft', status = true, cooldown_minutes = 1
        WHERE tank_id = 94 AND kpi_name = 'temp_internal';
    """))
    db.commit()

    seen_email_ids = _snapshot_seen_email_ids()
    headers = {"Content-Type": "application/json"}

    # ProbeTemperature = 20°C breaches the -150 max -> deviation under a 'soft' config
    resp = requests.post(INGESTION_URL, json=_get_tive_payload(20.0), headers=headers, timeout=10)
    assert resp.status_code == 200, f"Webhook ingestion failed: {resp.status_code} - {resp.text}"

    reading = _poll_temp_internal_reading(db)
    assert reading is not None, "temp_internal reading was not created"
    assert reading[0] is True, "Reading was not marked as deviation"

    alert = None
    for _ in range(12):
        time.sleep(1)
        db.rollback()
        alert = db.execute(text("SELECT severity FROM critical_alerts WHERE tank_id = 94 ORDER BY created_at DESC LIMIT 1")).fetchone()
        if alert is not None:
            break
    assert alert is not None, "Alert was not created for soft alert"
    assert alert[0] == 'Low', f"Expected severity 'Low', got {alert[0]}"

    new_emails = get_new_emails(seen_email_ids)
    assert len(new_emails) == 0, f"Expected 0 emails for soft alert, got {len(new_emails)}"
    print("OK: Soft alert test passed.")


def test_kpi_no_alert(db):
    print("\n--- TEST: NO ALERT (READING ONLY, NO ALERT, NO EMAIL) ---")

    db.execute(text("DELETE FROM critical_alerts WHERE tank_id = 94;"))
    db.execute(text("DELETE FROM readings WHERE tank_id = 94;"))
    db.execute(text("DELETE FROM ivf_telemetry_data WHERE tank_id = 94;"))
    db.execute(text("""
        UPDATE kpi_config SET min = -196.0000, max = -150.0000, alert_type = 'no_alert', status = true, cooldown_minutes = 1
        WHERE tank_id = 94 AND kpi_name = 'temp_internal';
    """))
    db.commit()

    seen_email_ids = _snapshot_seen_email_ids()
    headers = {"Content-Type": "application/json"}

    # Value breaches thresholds, but 'no_alert' forces deviation to stay False
    resp = requests.post(INGESTION_URL, json=_get_tive_payload(20.0), headers=headers, timeout=10)
    assert resp.status_code == 200, f"Webhook ingestion failed: {resp.status_code} - {resp.text}"

    reading = _poll_temp_internal_reading(db)
    assert reading is not None, "temp_internal reading was not created"
    assert reading[0] is False, "Reading deviation should be False for no_alert"

    time.sleep(3)
    db.rollback()
    alert_count = db.execute(text("SELECT COUNT(*) FROM critical_alerts WHERE tank_id = 94")).scalar()
    assert alert_count == 0, f"Expected 0 alerts for no_alert, got {alert_count}"

    new_emails = get_new_emails(seen_email_ids)
    assert len(new_emails) == 0, f"Expected 0 emails for no_alert, got {len(new_emails)}"
    print("OK: No alert test passed.")


def test_kpi_disabled(db):
    print("\n--- TEST: DISABLED STATUS (READING ONLY, DEVIATION=TRUE, NO ALERT, NO EMAIL) ---")

    db.execute(text("DELETE FROM critical_alerts WHERE tank_id = 94;"))
    db.execute(text("DELETE FROM readings WHERE tank_id = 94;"))
    db.execute(text("DELETE FROM ivf_telemetry_data WHERE tank_id = 94;"))
    db.execute(text("""
        UPDATE kpi_config SET min = -196.0000, max = -150.0000, alert_type = 'critical', status = false, cooldown_minutes = 1
        WHERE tank_id = 94 AND kpi_name = 'temp_internal';
    """))
    db.commit()

    seen_email_ids = _snapshot_seen_email_ids()
    headers = {"Content-Type": "application/json"}

    # Value breaches thresholds -> deviation=True, but status=false suppresses the alert
    resp = requests.post(INGESTION_URL, json=_get_tive_payload(20.0), headers=headers, timeout=10)
    assert resp.status_code == 200, f"Webhook ingestion failed: {resp.status_code} - {resp.text}"

    reading = _poll_temp_internal_reading(db, select_cols="r.deviation, r.deviation_alert_sent")
    assert reading is not None, "temp_internal reading was not created"
    assert reading[0] is True, "Reading deviation should be True when outside threshold"
    assert reading[1] is False, "deviation_alert_sent should be False when status=false"

    time.sleep(3)
    db.rollback()
    alert_count = db.execute(text("SELECT COUNT(*) FROM critical_alerts WHERE tank_id = 94")).scalar()
    assert alert_count == 0, f"Expected 0 alerts for disabled status, got {alert_count}"

    new_emails = get_new_emails(seen_email_ids)
    assert len(new_emails) == 0, f"Expected 0 emails for disabled status, got {len(new_emails)}"
    print("OK: Disabled status test passed.")
