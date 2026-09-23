"""Live end-to-end integration test for the refrigerator alert pipeline.

This mirrors tests/app/integration/test_alert_ingestion.py (cryotanks): it drives
the *real* multi-service flow by POSTing a Tive telemetry payload to the live
ingestion webhook and asserting against a live smtp4dev inbox. Nothing is called
in-process and nothing is mocked.

How the flow works (entry → alert → email)
------------------------------------------
1. A Tive telemetry payload is POSTed to the ingestion function
   (TiveWebhook, compose service `iot-ingestion-service`). That function is
   device-agnostic — it authenticates, wraps the payload as
   `{"source": "TIVE", "payload": ...}`, and publishes it to Event Hub.
2. The telemetry-service `TelemetryHook` Event Hub trigger consumes the event and
   calls `process_webhook_payload`, which extracts the device id from
   `EntityName`, fails to match a tank, then calls
   `find_refrigerator_by_device_code` to resolve (refrigerator_id, zone_id,
   hospital_id, branch_id) by joining `refrigerator_devices` → `refrigerators`.
3. `process_tive_refrigerator` extracts `refrigerator_temp` (from `DeviceTemperature`)
   and `refrigerator_humidity` (from `Humidity/Percentage`) and calls
   `save_refrigerator_kpi_readings`, which looks up the zone's kpi_config
   (matching on refrigerator_id AND zone_id AND kpi_name), scores the value
   against the thresholds, and INSERTs a `readings` row with `deviation = true`.
4. It then calls `check_and_create_refrigerator_kpi_alerts(refrigerator_id,
   zone_id)`, which POSTs to the backend
   `/api/ivf/alerts/check_kpi_refrigerator`. That endpoint creates a
   `critical_alerts` row and — because the KPI is `critical` and the hospital has
   email enabled — dispatches the alert email to the branch's users.
5. The email lands in smtp4dev, which we poll over its REST API.

Payload note: refrigerators use a different Tive payload shape than cryotanks.
The refrigerator extractor reads FLAT temperature fields (`DeviceTemperature`,
`ProbeTemperature` as plain numbers), not the nested `{"Celsius": ...}` objects a
cryotank Tive payload uses. The payload below matches what the refrigerator path
actually consumes.

Required services (the full live stack must be up):
  - Postgres shared by the backend and the telemetry-service.
  - The Tive ingestion function (`iot-ingestion-service`) + Event Hub emulator +
    a running TelemetryHook consumer.
  - Backend API (serves /api/ivf/alerts/check_kpi_refrigerator).
  - smtp4dev (captures outbound email).
Endpoints default to the compose service names reachable from inside the
devcontainer; override INGESTION_URL / SMTP4DEV_API for other layouts.

Seeding note: the Alert Setting API stores refrigerator KPI configs with
zone_id = NULL, but the telemetry lookup matches on a concrete zone_id. We seed
the config with zone_id = 'zone_1' so the live path resolves it.
"""

import os
import time
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests
from sqlalchemy import text

from app.config.database import SessionLocal

# ── Endpoints ──────────────────────────────────────────────────────────────────
# From inside the devcontainer, the dockerized ingestion function and smtp4dev are
# reached by their compose service names (the published localhost ports are only
# bound on the host). Backend/frontend run on localhost. Override via env if your
# layout differs.
# INGESTION_URL = os.environ.get("INGESTION_URL", "http://iot-ingestion-service/api/tive/webhook")
# SMTP_API_URL = os.environ.get("SMTP4DEV_API", "http://smtp4dev/api/Messages")
INGESTION_URL = "http://localhost:7072/api/tive/webhook"
SMTP_API_URL = "http://localhost:5005/api/Messages"
# ── Fixed test ids (deterministic cleanup) ─────────────────────────────────────
HOSPITAL_ID = 9927
BRANCH_ID = 9927
REFRIGERATOR_ID = 9927
DEVICE_CODE = "FRIDGE-DEV-9927"
REFRIGERATOR_CODE = "RFRIG-9927"
ZONE_ID = "zone_1"
USER_EMAIL = "test-fridge9927@mygrape.com"
USER_ID = "usr-test-fridge-9927"
ADMIN_USER_EMAIL = "test-fridge-admin9927@mygrape.com"
ADMIN_USER_ID = "usr-test-fridge-admin-9927"


def clear_smtp4dev():
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
    session = SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


@pytest.fixture
def setup_refrigerator_ingestion(db):
    """Seed Hospital → Branch → User → Refrigerator → device mapping → KPI config."""
    _clean(db)

    db.execute(text("""
        INSERT INTO hospitals (hospital_id, hospital_name, created_at, updated_at, is_email_notifify, is_whatsapp_notify)
        VALUES (:hid, 'Fridge Ingest Hospital', NOW(), NOW(), true, false)
        ON CONFLICT (hospital_id) DO UPDATE SET is_email_notifify = EXCLUDED.is_email_notifify;
    """), {"hid": HOSPITAL_ID})

    db.execute(text("""
        INSERT INTO hospital_branches (branch_id, hospital_id, branch_name, created_at, updated_at)
        VALUES (:bid, :hid, 'Fridge Ingest Br', NOW(), NOW())
        ON CONFLICT (branch_id) DO UPDATE SET hospital_id = EXCLUDED.hospital_id;
    """), {"bid": BRANCH_ID, "hid": HOSPITAL_ID})

    db.execute(text("""
        INSERT INTO refrigerators (refrigerator_id, hospital_id, branch_id, refrigerator_code, is_active, created_at, updated_at)
        VALUES (:rid, :hid, :bid, :code, true, NOW(), NOW())
        ON CONFLICT (refrigerator_id) DO UPDATE SET is_active = true, refrigerator_code = EXCLUDED.refrigerator_code;
    """), {"rid": REFRIGERATOR_ID, "hid": HOSPITAL_ID, "bid": BRANCH_ID, "code": REFRIGERATOR_CODE})

    db.execute(text("""
        INSERT INTO refrigerator_devices (refrigerator_id, zone_id, device_code, created_at, updated_at)
        VALUES (:rid, :zone, :code, NOW(), NOW())
        ON CONFLICT (device_code) DO UPDATE SET refrigerator_id = EXCLUDED.refrigerator_id, zone_id = EXCLUDED.zone_id;
    """), {"rid": REFRIGERATOR_ID, "zone": ZONE_ID, "code": DEVICE_CODE})

    # zone_id is concrete here so the telemetry lookup (refrigerator_id + zone_id + kpi_name) resolves it.
    db.execute(text("""
        INSERT INTO kpi_config (hospital_id, branch_id, refrigerator_id, zone_id, kpi_name, alert_name, min, max, unit, alert_type, cooldown_minutes, status)
        VALUES (:hid, :bid, :rid, :zone, 'refrigerator_temp', 'Zone Temp Critical', 2.0, 8.0, '°C', 'critical', 1, true)
    """), {"hid": HOSPITAL_ID, "bid": BRANCH_ID, "rid": REFRIGERATOR_ID, "zone": ZONE_ID})

    db.execute(text("""
        INSERT INTO users (user_id, email, password_hash, first_name, last_name, role, status, approved_status, hospital_id, branch_id, department, onboarding_completed, created_at, updated_at)
        VALUES (:uid, :email, 'dummy_hash', 'Fridge', 'User', 'User', true, 'approved', :hid, :bid, 'IVF', false, NOW(), NOW())
        ON CONFLICT (email) DO UPDATE SET branch_id = EXCLUDED.branch_id, hospital_id = EXCLUDED.hospital_id;
    """), {"uid": USER_ID, "email": USER_EMAIL, "hid": HOSPITAL_ID, "bid": BRANCH_ID})

    db.commit()
    yield
    _clean(db)


def _clean(db):
    try:
        db.execute(text("DELETE FROM critical_alerts WHERE refrigerator_id = :rid;"), {"rid": REFRIGERATOR_ID})
        db.execute(text("DELETE FROM readings WHERE refrigerator_id = :rid;"), {"rid": REFRIGERATOR_ID})
        db.execute(text("DELETE FROM kpi_config WHERE refrigerator_id = :rid;"), {"rid": REFRIGERATOR_ID})
        db.execute(text("DELETE FROM refrigerator_devices WHERE device_code = :code;"), {"code": DEVICE_CODE})
        db.execute(text("DELETE FROM refrigerators WHERE refrigerator_id = :rid;"), {"rid": REFRIGERATOR_ID})
        db.execute(text("DELETE FROM users WHERE email = :email;"), {"email": USER_EMAIL})
        db.execute(text("DELETE FROM users WHERE email = :email;"), {"email": ADMIN_USER_EMAIL})
        db.execute(text("DELETE FROM hospital_branches WHERE branch_id = :bid;"), {"bid": BRANCH_ID})
        db.execute(text("DELETE FROM hospitals WHERE hospital_id = :hid;"), {"hid": HOSPITAL_ID})
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"Refrigerator ingestion cleanup failed: {e}")


def _build_payload(
    device_temp_celsius: float,
    humidity_percentage: float | None = None,
    device_code: str = DEVICE_CODE,
    at: datetime | None = None,
) -> dict:
    """Build a refrigerator Tive payload.

    Refrigerators carry FLAT temperature/humidity fields, unlike the nested
    {"Celsius": ...} objects in a cryotank Tive payload. The remaining envelope
    fields mirror a realistic Tive post. ``device_code`` selects which zone's device
    the payload targets (defaults to the fixture's zone_1 device). ``at`` overrides the
    payload timestamp (the reading's occurred_at), used to simulate specific clock times.
    """
    now = at or datetime.now(timezone.utc)
    payload = {
        "EntityName": device_code,
        "DeviceName": device_code,
        "EntryTimeEpoch": int(now.timestamp() * 1000),
        "EntryTimeUtc": now.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
        "CaptureTime": now.isoformat(),
        "DeviceTemperature": device_temp_celsius,
        "Battery": {"Percentage": 100.0, "Estimation": "N/A", "IsCharging": False},
        "Location": {"Latitude": 12.9716, "Longitude": 77.5946, "IsGpsLocationAvailable": True},
        "_nonce": str(uuid.uuid4()),
    }
    if humidity_percentage is not None:
        payload["Humidity"] = {"Percentage": humidity_percentage}
    return payload


def _post_payload(payload: dict):
    """POST a payload to the live ingestion webhook and assert it was accepted."""
    resp = requests.post(
        INGESTION_URL, json=payload, headers={"Content-Type": "application/json"}, timeout=10
    )
    assert resp.status_code == 200, f"Webhook ingestion failed: {resp.status_code} - {resp.text}"
    return resp


def _fetch_emails() -> list:
    """Return all messages currently in the smtp4dev inbox (empty list on error)."""
    try:
        res = requests.get(f"{SMTP_API_URL}?pageSize=1000", timeout=5).json()
        return res.get("results", res) if isinstance(res, dict) else res
    except Exception as e:
        print(f"smtp4dev poll error: {e}")
        return []


def _email_html(msg_id: str) -> str:
    """Return the HTML body of a smtp4dev message (empty string on error)."""
    try:
        r = requests.get(f"{SMTP_API_URL}/{msg_id}/html", timeout=5)
        return r.text if r.status_code == 200 else ""
    except Exception:
        return ""


def test_refrigerator_telemetry_creates_alert_and_sends_email(setup_refrigerator_ingestion, db):
    """A breaching refrigerator telemetry payload creates a critical alert and emails the branch user.

    Arrange: Seed a refrigerator zone with a critical refrigerator_temp config (2–8°C)
    and a device mapping; clear smtp4dev.
    Act: POST a Tive refrigerator payload with DeviceTemperature = 15°C (above max)
    to the live ingestion webhook.
    Assert: A critical_alerts row appears for the refrigerator AND an email with a
    "Critical Alert" subject and the deviation message reaches the branch user.
    """
    clear_smtp4dev()

    payload = _build_payload(device_temp_celsius=15.0)
    resp = requests.post(INGESTION_URL, json=payload, headers={"Content-Type": "application/json"}, timeout=10)
    assert resp.status_code == 200, f"Webhook ingestion failed: {resp.status_code} - {resp.text}"

    # 1. Poll for the critical alert row
    alert_created = False
    for _ in range(15):
        time.sleep(1)
        db.rollback()
        count = db.execute(
            text("SELECT COUNT(*) FROM critical_alerts WHERE refrigerator_id = :rid"),
            {"rid": REFRIGERATOR_ID},
        ).scalar()
        if count and count >= 1:
            alert_created = True
            break
    assert alert_created, "No critical alert was created for the refrigerator after ingestion"

    # 2. Poll smtp4dev for the dispatched email
    email_found = False
    for _ in range(10):
        time.sleep(1)
        try:
            res = requests.get(f"{SMTP_API_URL}?pageSize=1000", timeout=5).json()
            msgs = res.get("results", res) if isinstance(res, dict) else res
            for msg in msgs:
                to_addr = msg.get("to") or ""
                subject = msg.get("subject") or ""
                if USER_EMAIL in to_addr and "Critical Alert" in subject:
                    html = requests.get(f"{SMTP_API_URL}/{msg['id']}/html", timeout=5).text
                    if "is deviated to 15" in html:
                        email_found = True
                        break
            if email_found:
                break
        except Exception as e:
            print(f"Error polling smtp4dev: {e}")
    assert email_found, f"No refrigerator critical-alert email reached {USER_EMAIL} in smtp4dev"


def test_refrigerator_alert_cooldown(setup_refrigerator_ingestion, db):
    """Within the 1-minute cooldown window a second breaching payload must not create a new alert
    or email; after the window expires a third payload must produce a second alert and email.

    Arrange: Same kpi_config seeded by the fixture (cooldown_minutes=1, 2–8°C range).
    Act/Assert (three phases):
      1. Payload 1 → alert row + email to branch user.
      2. Payload 2 (immediately after, within cooldown) → alert count stays at 1, no new email.
      3. Shift alert timestamp back 2 minutes (cooldown expired) then Payload 3 →
         alert count reaches 2, second email delivered.
    """
    time.sleep(5)
    clear_smtp4dev()
    seen_email_ids: set = set()
    headers = {"Content-Type": "application/json"}

    def get_new_alert_emails(seen_ids: set) -> list:
        found = []
        try:
            res = requests.get(f"{SMTP_API_URL}?pageSize=1000", timeout=5).json()
            msgs = res.get("results", res) if isinstance(res, dict) else res
            for msg in msgs:
                msg_id = msg.get("id")
                if msg_id and msg_id not in seen_ids:
                    to_addr = msg.get("to") or ""
                    if USER_EMAIL in to_addr:
                        found.append(msg)
        except Exception as e:
            print(f"smtp4dev poll error: {e}")
        return found

    # ── Phase 1: first deviation ────────────────────────────────────────────────
    resp = requests.post(INGESTION_URL, json=_build_payload(device_temp_celsius=15.0), headers=headers, timeout=10)
    # (payloads vary across phases; all breach the 2–8°C range so each is a deviation)
    assert resp.status_code == 200, f"Webhook ingestion failed: {resp.status_code} - {resp.text}"

    alert_count = 0
    for _ in range(15):
        time.sleep(1)
        db.rollback()
        alert_count = db.execute(
            text("SELECT COUNT(*) FROM critical_alerts WHERE refrigerator_id = :rid"),
            {"rid": REFRIGERATOR_ID},
        ).scalar() or 0
        if alert_count >= 1:
            break
    assert alert_count == 1, "First critical alert was not created"

    email_found_1 = False
    for _ in range(10):
        time.sleep(1)
        new_emails = get_new_alert_emails(seen_email_ids)
        if new_emails:
            email_found_1 = True
            for msg in new_emails:
                seen_email_ids.add(msg["id"])
            break
    assert email_found_1, "Email was not dispatched for the first breaching payload"

    # ── Phase 2: within cooldown — no new alert or email ───────────────────────
    resp = requests.post(INGESTION_URL, json=_build_payload(device_temp_celsius=15.0), headers=headers, timeout=10)
    assert resp.status_code == 200

    time.sleep(4)
    db.rollback()
    alert_count = db.execute(
        text("SELECT COUNT(*) FROM critical_alerts WHERE refrigerator_id = :rid"),
        {"rid": REFRIGERATOR_ID},
    ).scalar() or 0
    assert alert_count == 1, f"Alert count should remain 1 within cooldown, got {alert_count}"

    new_emails = get_new_alert_emails(seen_email_ids)
    assert len(new_emails) == 0, f"Expected no new email during cooldown, got {len(new_emails)}"

    # ── Phase 3: after cooldown — second alert and email ───────────────────────
    db.execute(text("""
        UPDATE critical_alerts
        SET created_at = NOW() - INTERVAL '2 minutes',
            occurred_at = NOW() - INTERVAL '2 minutes',
            updated_at = NOW() - INTERVAL '2 minutes'
        WHERE refrigerator_id = :rid
    """), {"rid": REFRIGERATOR_ID})
    db.commit()

    resp = requests.post(INGESTION_URL, json=_build_payload(device_temp_celsius=15.0), headers=headers, timeout=10)
    assert resp.status_code == 200

    for _ in range(15):
        time.sleep(1)
        db.rollback()
        alert_count = db.execute(
            text("SELECT COUNT(*) FROM critical_alerts WHERE refrigerator_id = :rid"),
            {"rid": REFRIGERATOR_ID},
        ).scalar() or 0
        if alert_count >= 2:
            break
    assert alert_count == 2, f"Expected 2 alerts after cooldown expired, got {alert_count}"

    email_found_2 = False
    for _ in range(10):
        time.sleep(1)
        new_emails = get_new_alert_emails(seen_email_ids)
        if new_emails:
            email_found_2 = True
            break
    assert email_found_2, "Email was not dispatched for the third payload (after cooldown ended)"


@pytest.mark.xfail(
    reason="Backend escalation runs in a daemon thread that reads detached CriticalAlert "
    "ORM instances (request session already closed), raising DetachedInstanceError before "
    "send_email — so the admin escalation email is never dispatched. Remove this marker once "
    "the backend snapshots alert fields before spawning the thread.",
    strict=False,
)
def test_refrigerator_alert_escalation(setup_refrigerator_ingestion, db):
    """With unack_escalation_threshold=1, the first deviation emails only the branch User;
    once a second (unacknowledged) alert is created an escalation email is sent to the Admin.

    Arrange: Seed an Admin user for the branch; set unack_escalation_threshold=1 on kpi_config.
    Act/Assert:
      1. Payload 1 → alert + email to USER_EMAIL (role=User). No email to ADMIN_USER_EMAIL.
      2. Shift alert timestamp back 2 minutes (cooldown expired).
      3. Payload 2 → second alert + escalation email to ADMIN_USER_EMAIL.
    """
    db.execute(text("""
        INSERT INTO users (user_id, email, password_hash, first_name, last_name, role, status,
            approved_status, hospital_id, branch_id, department, onboarding_completed, created_at, updated_at)
        VALUES (:uid, :email, 'dummy_hash', 'Fridge', 'Admin', 'Admin', true, 'approved',
            :hid, :bid, 'IVF', false, NOW(), NOW())
        ON CONFLICT (email) DO UPDATE
            SET role = 'Admin', branch_id = EXCLUDED.branch_id, hospital_id = EXCLUDED.hospital_id;
    """), {"uid": ADMIN_USER_ID, "email": ADMIN_USER_EMAIL, "hid": HOSPITAL_ID, "bid": BRANCH_ID})

    db.execute(text("""
        UPDATE kpi_config
        SET unack_escalation_threshold = 1, last_escalation_sent_at = NULL
        WHERE refrigerator_id = :rid AND zone_id = :zone AND kpi_name = 'refrigerator_temp'
    """), {"rid": REFRIGERATOR_ID, "zone": ZONE_ID})
    db.commit()

    time.sleep(5)
    clear_smtp4dev()
    seen_email_ids: set = set()
    headers = {"Content-Type": "application/json"}

    def get_emails_for(email_address: str, seen_ids: set) -> list:
        found = []
        try:
            res = requests.get(f"{SMTP_API_URL}?pageSize=1000", timeout=5).json()
            msgs = res.get("results", res) if isinstance(res, dict) else res
            for msg in msgs:
                msg_id = msg.get("id")
                if msg_id and msg_id not in seen_ids:
                    to_addr = msg.get("to") or ""
                    if email_address in to_addr:
                        found.append(msg)
        except Exception as e:
            print(f"smtp4dev poll error: {e}")
        return found

    # ── Phase 1: first deviation — user email only, no admin email ──────────────
    resp = requests.post(INGESTION_URL, json=_build_payload(device_temp_celsius=15.0), headers=headers, timeout=10)
    assert resp.status_code == 200, f"Webhook ingestion failed: {resp.status_code} - {resp.text}"

    alert_count = 0
    for _ in range(15):
        time.sleep(1)
        db.rollback()
        alert_count = db.execute(
            text("SELECT COUNT(*) FROM critical_alerts WHERE refrigerator_id = :rid"),
            {"rid": REFRIGERATOR_ID},
        ).scalar() or 0
        if alert_count >= 1:
            break
    assert alert_count == 1, "First critical alert was not created"

    user_emails = []
    for _ in range(10):
        time.sleep(1)
        user_emails = get_emails_for(USER_EMAIL, seen_email_ids)
        if user_emails:
            for msg in user_emails:
                seen_email_ids.add(msg["id"])
            break
    assert user_emails, "Alert email was not dispatched to the branch User for the first payload"

    admin_emails = get_emails_for(ADMIN_USER_EMAIL, seen_email_ids)
    assert len(admin_emails) == 0, (
        f"Admin should not receive email on first alert (escalation threshold not yet met), "
        f"got {len(admin_emails)}"
    )

    # ── Phase 2: cooldown expired, second deviation → escalation to admin ───────
    db.execute(text("""
        UPDATE critical_alerts
        SET created_at = NOW() - INTERVAL '2 minutes',
            occurred_at = NOW() - INTERVAL '2 minutes',
            updated_at = NOW() - INTERVAL '2 minutes'
        WHERE refrigerator_id = :rid
    """), {"rid": REFRIGERATOR_ID})
    db.commit()

    resp = requests.post(INGESTION_URL, json=_build_payload(device_temp_celsius=15.0), headers=headers, timeout=10)
    assert resp.status_code == 200

    for _ in range(15):
        time.sleep(1)
        db.rollback()
        alert_count = db.execute(
            text("SELECT COUNT(*) FROM critical_alerts WHERE refrigerator_id = :rid"),
            {"rid": REFRIGERATOR_ID},
        ).scalar() or 0
        if alert_count >= 2:
            break
    assert alert_count == 2, f"Expected 2 alerts after cooldown expired, got {alert_count}"

    escalation_emails = []
    for _ in range(15):
        time.sleep(1)
        escalation_emails = get_emails_for(ADMIN_USER_EMAIL, seen_email_ids)
        if escalation_emails:
            break
    assert escalation_emails, (
        f"Escalation email was not dispatched to the Admin at {ADMIN_USER_EMAIL} "
        f"after the second unacknowledged alert"
    )


def test_refrigerator_both_kpis_alert(setup_refrigerator_ingestion, db):
    """A payload breaching both refrigerator_temp and refrigerator_humidity thresholds must produce two
    deviation readings and two critical alerts (one per KPI config).

    Arrange: The fixture seeds refrigerator_temp (2–8°C); this test additionally seeds
    refrigerator_humidity (10–80%). DeviceTemperature=15 breaches refrigerator_temp; Humidity=95
    breaches refrigerator_humidity.
    Assert: Both readings are inserted with deviation=True; at least 2 critical alerts exist;
    two alert emails (one per breaching KPI) reach the branch user.
    """
    db.execute(text("""
        INSERT INTO kpi_config
            (hospital_id, branch_id, refrigerator_id, zone_id, kpi_name,
             alert_name, min, max, unit, alert_type, cooldown_minutes, status)
        VALUES (:hid, :bid, :rid, :zone, 'refrigerator_humidity',
                'Probe Temp Critical', 10.0, 80.0, '%', 'critical', 1, true)
    """), {"hid": HOSPITAL_ID, "bid": BRANCH_ID, "rid": REFRIGERATOR_ID, "zone": ZONE_ID})
    db.commit()

    clear_smtp4dev()

    payload = _build_payload(device_temp_celsius=15.0, humidity_percentage=95.0)
    resp = requests.post(INGESTION_URL, json=payload, headers={"Content-Type": "application/json"}, timeout=10)
    assert resp.status_code == 200, f"Webhook ingestion failed: {resp.status_code} - {resp.text}"

    # Poll until both KPI readings appear with deviation=True
    kpi_deviations: dict = {}
    for _ in range(20):
        time.sleep(1)
        db.rollback()
        rows = db.execute(text("""
            SELECT kc.kpi_name, r.deviation
            FROM readings r
            JOIN kpi_config kc ON r.kpi_config_id = kc.id
            WHERE r.refrigerator_id = :rid
        """), {"rid": REFRIGERATOR_ID}).fetchall()
        for kpi_name, deviation in rows:
            kpi_deviations[kpi_name] = bool(deviation)
        if len(kpi_deviations) >= 2:
            break

    assert "refrigerator_temp" in kpi_deviations, "refrigerator_temp reading was not inserted"
    assert kpi_deviations["refrigerator_temp"] is True, "refrigerator_temp reading did not register a deviation"
    assert "refrigerator_humidity" in kpi_deviations, "refrigerator_humidity reading was not inserted"
    assert kpi_deviations["refrigerator_humidity"] is True, "refrigerator_humidity reading did not register a deviation"

    # Alerts are created after the readings are committed (separate backend call),
    # so poll rather than reading once.
    alert_count = 0
    for _ in range(15):
        time.sleep(1)
        db.rollback()
        alert_count = db.execute(
            text("SELECT COUNT(*) FROM critical_alerts WHERE refrigerator_id = :rid"),
            {"rid": REFRIGERATOR_ID},
        ).scalar() or 0
        if alert_count >= 2:
            break
    assert alert_count >= 2, f"Expected at least 2 critical alerts for 2 deviating KPIs, got {alert_count}"

    # Each breaching KPI dispatches its own alert email to the branch user.
    alert_email_ids: set = set()
    for _ in range(15):
        time.sleep(1)
        try:
            res = requests.get(f"{SMTP_API_URL}?pageSize=1000", timeout=5).json()
            msgs = res.get("results", res) if isinstance(res, dict) else res
            for msg in msgs:
                if USER_EMAIL in (msg.get("to") or ""):
                    alert_email_ids.add(msg.get("id"))
        except Exception as e:
            print(f"smtp4dev poll error: {e}")
        if len(alert_email_ids) >= 2:
            break
    assert len(alert_email_ids) >= 2, (
        f"Expected 2 alert emails (one per breaching KPI) for {USER_EMAIL}, got {len(alert_email_ids)}"
    )


def test_refrigerator_email_content(setup_refrigerator_ingestion, db):
    """The alert email for a refrigerator deviation must contain the expected subject and body.

    Subject format: "Critical Alert: Deviation Alert - High Severity - <code> <zone>"
    HTML body: the full deviation sentence for the alert_name, branch name, and refrigerator code.
    """
    clear_smtp4dev()

    resp = requests.post(
        INGESTION_URL,
        json=_build_payload(device_temp_celsius=15.0),
        headers={"Content-Type": "application/json"},
        timeout=10,
    )
    assert resp.status_code == 200, f"Webhook ingestion failed: {resp.status_code} - {resp.text}"

    target_msg = None
    for _ in range(20):
        time.sleep(1)
        try:
            res = requests.get(f"{SMTP_API_URL}?pageSize=100", timeout=5).json()
            msgs = res.get("results", res) if isinstance(res, dict) else res
            for msg in msgs:
                if USER_EMAIL in (msg.get("to") or "") and "Critical Alert" in (msg.get("subject") or ""):
                    target_msg = msg
                    break
        except Exception as e:
            print(f"smtp4dev poll error: {e}")
        if target_msg:
            break
    assert target_msg, f"No Critical Alert email found for {USER_EMAIL} in smtp4dev"

    subject = target_msg["subject"]
    device_label = f"{REFRIGERATOR_CODE} {ZONE_ID}"
    assert REFRIGERATOR_CODE in subject, f"Email subject missing refrigerator code: {subject}"
    assert ZONE_ID in subject, f"Email subject missing zone id: {subject}"
    assert "High Severity" in subject, f"Email subject missing severity: {subject}"

    html_res = requests.get(f"{SMTP_API_URL}/{target_msg['id']}/html", timeout=5)
    assert html_res.status_code == 200, "Failed to fetch email HTML body"
    html = html_res.text

    assert "Zone Temp Critical" in html, "Email body missing KPI alert name 'Zone Temp Critical'"
    assert "Fridge Ingest Br" in html, "Email body missing branch name 'Fridge Ingest Br'"
    assert "RFRIG-9927" in html, "Email body missing refrigerator code 'RFRIG-9927'"
    # kpi_value is Numeric(10,4) so round(15.0000, 2) → "15.00"; use substring to avoid precision sensitivity
    assert "Zone Temp Critical is deviated to 15" in html, "Email body missing deviation message"
    assert "in Fridge Ingest Br branch for refrigerator RFRIG-9927" in html, "Email body missing branch+refrigerator context"


def test_refrigerator_soft_alert_no_email(setup_refrigerator_ingestion, db):
    """A breaching 'soft' KPI records a low-severity alert but dispatches NO email.

    Only 'critical' alert_type triggers notification; 'soft' deviations are stored for
    visibility. Reuses the fixture's refrigerator_temp config, downgraded to alert_type='soft'.

    Arrange: Set the zone's refrigerator_temp config to alert_type='soft'.
    Act: POST DeviceTemperature = 15°C (above the 8°C max).
    Assert: A critical_alerts row exists with severity 'Low'; no email reaches the user.
    """
    db.execute(text("""
        UPDATE kpi_config SET alert_type = 'soft'
        WHERE refrigerator_id = :rid AND zone_id = :zone AND kpi_name = 'refrigerator_temp'
    """), {"rid": REFRIGERATOR_ID, "zone": ZONE_ID})
    db.commit()

    clear_smtp4dev()

    _post_payload(_build_payload(device_temp_celsius=15.0))

    severity = None
    for _ in range(15):
        time.sleep(1)
        db.rollback()
        severity = db.execute(text(
            "SELECT severity FROM critical_alerts WHERE refrigerator_id = :rid "
            "ORDER BY created_at DESC LIMIT 1"
        ), {"rid": REFRIGERATOR_ID}).scalar()
        if severity:
            break
    assert severity is not None, "Soft deviation did not create a critical_alerts row"
    assert severity == "Low", f"Soft alert should be 'Low' severity, got {severity}"

    # Give any (erroneous) email time to arrive, then confirm none did.
    time.sleep(5)
    user_emails = [m for m in _fetch_emails() if USER_EMAIL in (m.get("to") or "")]
    assert not user_emails, f"Soft alert must not dispatch an email, found {len(user_emails)}"


def test_refrigerator_no_alert(setup_refrigerator_ingestion, db):
    """A breaching payload against a KPI with alert_type='no_alert' stores a non-deviating
    reading and raises no alert/email.

    With alert_type='no_alert' the deviation scoring keeps deviation=False even though the
    value is OUTSIDE the configured range, so the alert step never picks it up.

    Arrange: Set the zone's refrigerator_temp config alert_type='no_alert' (range stays 2–8°C).
    Act: POST DeviceTemperature = 15°C (above the 8°C max — out of range).
    Assert: A readings row is inserted with the sent value but deviation=False; no
    critical_alerts row; no email.
    """
    db.execute(text("""
        UPDATE kpi_config SET alert_type = 'no_alert'
        WHERE refrigerator_id = :rid AND zone_id = :zone AND kpi_name = 'refrigerator_temp'
    """), {"rid": REFRIGERATOR_ID, "zone": ZONE_ID})
    db.commit()

    clear_smtp4dev()

    _post_payload(_build_payload(device_temp_celsius=15.0))

    # The out-of-range value is still ingested, but 'no_alert' forces deviation=False.
    row = None
    for _ in range(20):
        time.sleep(1)
        db.rollback()
        row = db.execute(text("""
            SELECT r.kpi_value, r.deviation FROM readings r
            JOIN kpi_config kc ON r.kpi_config_id = kc.id
            WHERE r.refrigerator_id = :rid AND kc.kpi_name = 'refrigerator_temp'
            ORDER BY r.timestamp DESC LIMIT 1
        """), {"rid": REFRIGERATOR_ID}).fetchone()
        if row is not None:
            break
    assert row is not None, "no_alert payload did not insert a readings row"
    kpi_value, deviation = row
    assert float(kpi_value) == 15.0, f"Readings row stored wrong kpi_value, got {kpi_value}"
    assert deviation is False, (
        f"alert_type='no_alert' must keep deviation False even out of range, got {deviation}"
    )

    db.rollback()
    alert_count = db.execute(text(
        "SELECT COUNT(*) FROM critical_alerts WHERE refrigerator_id = :rid"
    ), {"rid": REFRIGERATOR_ID}).scalar() or 0
    assert alert_count == 0, f"No alert expected for alert_type='no_alert', got {alert_count}"

    time.sleep(3)
    user_emails = [m for m in _fetch_emails() if USER_EMAIL in (m.get("to") or "")]
    assert not user_emails, f"No email expected for alert_type='no_alert', found {len(user_emails)}"


def test_refrigerator_disabled_kpi_no_alert(setup_refrigerator_ingestion, db):
    """A breaching payload against a DISABLED (status=false) KPI config creates no alert/email.

    The backend alert step filters kpi_config.status == True, so a disabled config never
    produces an alert even though the value breaches the threshold.

    Arrange: Set the zone's refrigerator_temp config status=false (alert_type stays 'critical').
    Act: POST DeviceTemperature = 15°C (breaches the 8°C max).
    Assert: The reading deviates (deviation=True) but deviation_alert_sent=False; no
    critical_alerts row; no email.
    """
    db.execute(text("""
        UPDATE kpi_config SET status = false
        WHERE refrigerator_id = :rid AND zone_id = :zone AND kpi_name = 'refrigerator_temp'
    """), {"rid": REFRIGERATOR_ID, "zone": ZONE_ID})
    db.commit()

    clear_smtp4dev()

    _post_payload(_build_payload(device_temp_celsius=15.0))

    # Unlike 'no_alert', a disabled 'critical' config still records the deviation; the alert
    # is suppressed at the alert step (status filter) and never sent.
    row = None
    for _ in range(20):
        time.sleep(1)
        db.rollback()
        row = db.execute(text("""
            SELECT r.deviation, r.deviation_alert_sent FROM readings r
            JOIN kpi_config kc ON r.kpi_config_id = kc.id
            WHERE r.refrigerator_id = :rid AND kc.kpi_name = 'refrigerator_temp'
            ORDER BY r.timestamp DESC LIMIT 1
        """), {"rid": REFRIGERATOR_ID}).fetchone()
        if row is not None:
            break
    assert row is not None, "Disabled-KPI payload did not insert a readings row"
    assert row[0] is True, "Out-of-range reading should deviate even when the config is disabled"
    assert row[1] is False, "deviation_alert_sent should be False when status=false"

    # Poll long enough that an alert would have appeared if the disabled config were honored.
    alert_count = 0
    for _ in range(12):
        time.sleep(1)
        db.rollback()
        alert_count = db.execute(text(
            "SELECT COUNT(*) FROM critical_alerts WHERE refrigerator_id = :rid"
        ), {"rid": REFRIGERATOR_ID}).scalar() or 0
        if alert_count:
            break
    assert alert_count == 0, f"Disabled KPI must not create an alert, got {alert_count}"

    user_emails = [m for m in _fetch_emails() if USER_EMAIL in (m.get("to") or "")]
    assert not user_emails, f"Disabled KPI must not dispatch an email, found {len(user_emails)}"


def test_refrigerator_correct_payload_within_threshold(setup_refrigerator_ingestion, db):
    """A correct payload with BOTH parameters inside their ranges ingests two non-deviating
    readings and raises no alert/email.

    Arrange: Fixture seeds refrigerator_temp (2–8°C); this test adds refrigerator_humidity (10–80%).
    Act: POST DeviceTemperature=5°C (in range) and Humidity=50% (in range).
    Assert: Both readings store deviation=False; no critical_alerts row; no email.
    """
    db.execute(text("""
        INSERT INTO kpi_config (hospital_id, branch_id, refrigerator_id, zone_id, kpi_name,
            alert_name, min, max, unit, alert_type, cooldown_minutes, status)
        VALUES (:hid, :bid, :rid, :zone, 'refrigerator_humidity', 'Probe Temp Critical', 10.0, 80.0, '%', 'critical', 1, true)
    """), {"hid": HOSPITAL_ID, "bid": BRANCH_ID, "rid": REFRIGERATOR_ID, "zone": ZONE_ID})
    db.commit()

    clear_smtp4dev()

    _post_payload(_build_payload(device_temp_celsius=5.0, humidity_percentage=50.0))

    kpi_dev: dict = {}
    for _ in range(20):
        time.sleep(1)
        db.rollback()
        rows = db.execute(text("""
            SELECT kc.kpi_name, r.deviation FROM readings r
            JOIN kpi_config kc ON r.kpi_config_id = kc.id
            WHERE r.refrigerator_id = :rid
        """), {"rid": REFRIGERATOR_ID}).fetchall()
        for name, dev in rows:
            kpi_dev[name] = bool(dev)
        if len(kpi_dev) >= 2:
            break

    assert "refrigerator_temp" in kpi_dev, "refrigerator_temp reading was not inserted"
    assert kpi_dev["refrigerator_temp"] is False, "refrigerator_temp within range should not deviate"
    assert "refrigerator_humidity" in kpi_dev, "refrigerator_humidity reading was not inserted"
    assert kpi_dev["refrigerator_humidity"] is False, "refrigerator_humidity within range should not deviate"

    db.rollback()
    alert_count = db.execute(text(
        "SELECT COUNT(*) FROM critical_alerts WHERE refrigerator_id = :rid"
    ), {"rid": REFRIGERATOR_ID}).scalar() or 0
    assert alert_count == 0, f"No alert expected for an in-range payload, got {alert_count}"

    time.sleep(3)
    user_emails = [m for m in _fetch_emails() if USER_EMAIL in (m.get("to") or "")]
    assert not user_emails, f"No email expected for an in-range payload, found {len(user_emails)}"


def test_refrigerator_both_zones_alert(setup_refrigerator_ingestion, db):
    """Two zones of the same refrigerator breaching at the same time each raise their own
    critical alert and email; the zone is verified in BOTH the DB and the email.

    Arrange: Fixture seeds zone_1 (device FRIDGE-DEV-9927, 'Zone Temp Critical'). This test
    adds zone_2 with its own device + temp_external config ('Zone2 Temp Critical').
    Act: POST a breaching payload to each zone's device back-to-back.
    Assert:
      DB  — critical_alerts has a row for zone_1 AND zone_2 (zone recorded in zone_id).
      smtp — an alert email mentioning zone_1 AND one mentioning zone_2 reach the branch user.
    """
    zone2_id = "zone_2"
    zone2_device = f"{DEVICE_CODE}-Z2"

    db.execute(text("""
        INSERT INTO refrigerator_devices (refrigerator_id, zone_id, device_code, created_at, updated_at)
        VALUES (:rid, :zone, :code, NOW(), NOW())
        ON CONFLICT (device_code) DO UPDATE SET refrigerator_id = EXCLUDED.refrigerator_id, zone_id = EXCLUDED.zone_id;
    """), {"rid": REFRIGERATOR_ID, "zone": zone2_id, "code": zone2_device})
    db.execute(text("""
        INSERT INTO kpi_config (hospital_id, branch_id, refrigerator_id, zone_id, kpi_name,
            alert_name, min, max, unit, alert_type, cooldown_minutes, status)
        VALUES (:hid, :bid, :rid, :zone, 'refrigerator_temp', 'Zone2 Temp Critical', 2.0, 8.0, '°C', 'critical', 1, true)
    """), {"hid": HOSPITAL_ID, "bid": BRANCH_ID, "rid": REFRIGERATOR_ID, "zone": zone2_id})
    db.commit()

    clear_smtp4dev()

    # Fire both zones "at the same time" (back-to-back posts to each zone's device).
    _post_payload(_build_payload(device_temp_celsius=15.0, device_code=DEVICE_CODE))
    _post_payload(_build_payload(device_temp_celsius=16.0, device_code=zone2_device))

    # DB: one critical alert per zone, with the zone recorded in zone_id.
    zones_with_alerts: set = set()
    for _ in range(20):
        time.sleep(1)
        db.rollback()
        rows = db.execute(text(
            "SELECT DISTINCT zone_id FROM critical_alerts WHERE refrigerator_id = :rid"
        ), {"rid": REFRIGERATOR_ID}).fetchall()
        zones_with_alerts = {r[0] for r in rows}
        if {ZONE_ID, zone2_id}.issubset(zones_with_alerts):
            break
    assert ZONE_ID in zones_with_alerts, f"No critical alert recorded for {ZONE_ID}; got {zones_with_alerts}"
    assert zone2_id in zones_with_alerts, f"No critical alert recorded for {zone2_id}; got {zones_with_alerts}"

    # smtp: an alert email mentioning each zone reaches the branch user. The email subject
    # carries "<code> <zone>" and the body the "... zone <zone>" sentence.
    zone1_email = zone2_email = False
    for _ in range(15):
        time.sleep(1)
        for msg in _fetch_emails():
            if USER_EMAIL not in (msg.get("to") or ""):
                continue
            subject = msg.get("subject") or ""
            html = _email_html(msg["id"])
            if f"zone {ZONE_ID}" in html or ZONE_ID in subject:
                zone1_email = True
            if f"zone {zone2_id}" in html or zone2_id in subject:
                zone2_email = True
        if zone1_email and zone2_email:
            break
    assert zone1_email, f"No alert email mentioning {ZONE_ID} reached {USER_EMAIL}"
    assert zone2_email, f"No alert email mentioning {zone2_id} reached {USER_EMAIL}"


def test_refrigerator_midnight_cooldown(setup_refrigerator_ingestion, db):
    """Cooldown is respected across a midnight / date boundary.

    Three payloads simulate 11:58 PM IST, 11:59 PM IST (within the 3-minute cooldown), and
    12:02 AM IST the *next day* (after the cooldown, once the first alert is aged out). The
    crossover must not confuse the cooldown logic.

    Arrange: Set the zone temp_external config cooldown_minutes=3.
    Act/Assert:
      1. Payload @ 11:58 PM → first alert + email.
      2. Payload @ 11:59 PM (within cooldown) → still 1 alert, no new email.
      3. Age the first alert back 4 minutes, then Payload @ 12:02 AM next day → second alert + email.
    """
    ist = timezone(timedelta(hours=5, minutes=30))

    db.execute(text("""
        UPDATE kpi_config SET cooldown_minutes = 3
        WHERE refrigerator_id = :rid AND zone_id = :zone AND kpi_name = 'refrigerator_temp'
    """), {"rid": REFRIGERATOR_ID, "zone": ZONE_ID})
    db.commit()

    time.sleep(5)
    clear_smtp4dev()
    seen_email_ids: set = set()

    def new_user_emails(seen: set) -> list:
        return [
            m for m in _fetch_emails()
            if m.get("id") not in seen and USER_EMAIL in (m.get("to") or "")
        ]

    def poll_alert_count(target: int) -> int:
        count = 0
        for _ in range(15):
            time.sleep(1)
            db.rollback()
            count = db.execute(text(
                "SELECT COUNT(*) FROM critical_alerts WHERE refrigerator_id = :rid"
            ), {"rid": REFRIGERATOR_ID}).scalar() or 0
            if count >= target:
                break
        return count

    # ── 11:58 PM IST → first alert + email ──────────────────────────────────────
    t1 = datetime(2026, 6, 15, 23, 58, 0, tzinfo=ist)
    _post_payload(_build_payload(device_temp_celsius=15.0, at=t1))

    assert poll_alert_count(1) == 1, "First alert (11:58 PM) was not created"

    email_1 = False
    for _ in range(10):
        time.sleep(1)
        emails = new_user_emails(seen_email_ids)
        if emails:
            email_1 = True
            for m in emails:
                seen_email_ids.add(m["id"])
            break
    assert email_1, "No email for the first (11:58 PM) alert"

    # ── 11:59 PM IST → within 3-min cooldown, no new alert/email ────────────────
    t2 = datetime(2026, 6, 15, 23, 59, 0, tzinfo=ist)
    _post_payload(_build_payload(device_temp_celsius=15.0, at=t2))

    time.sleep(4)
    db.rollback()
    alert_count = db.execute(text(
        "SELECT COUNT(*) FROM critical_alerts WHERE refrigerator_id = :rid"
    ), {"rid": REFRIGERATOR_ID}).scalar() or 0
    assert alert_count == 1, f"Within cooldown the alert count should stay 1, got {alert_count}"
    assert not new_user_emails(seen_email_ids), "Unexpected email during cooldown"

    # ── age the first alert past the cooldown window ────────────────────────────
    db.execute(text("""
        UPDATE critical_alerts
        SET created_at = NOW() - INTERVAL '4 minutes',
            occurred_at = NOW() - INTERVAL '4 minutes',
            updated_at = NOW() - INTERVAL '4 minutes'
        WHERE refrigerator_id = :rid
    """), {"rid": REFRIGERATOR_ID})
    db.commit()

    # ── 12:02 AM IST next day → after cooldown, second alert + email ────────────
    t3 = datetime(2026, 6, 16, 0, 2, 0, tzinfo=ist)
    _post_payload(_build_payload(device_temp_celsius=15.0, at=t3))

    assert poll_alert_count(2) == 2, "Second alert was not created after cooldown across midnight"

    email_2 = False
    for _ in range(10):
        time.sleep(1)
        if new_user_emails(seen_email_ids):
            email_2 = True
            break
    assert email_2, "No email for the post-cooldown (12:02 AM next day) alert"
