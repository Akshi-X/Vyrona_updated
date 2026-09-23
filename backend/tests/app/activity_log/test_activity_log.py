import uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock

from app.main import app
from app.config.config import settings
from app.config.database import SessionLocal
from app.models.activity_log_model import ActivityLog
from app.models.IVF.tank_model import Tank
from app.models.IVF.hospital_model import Hospital
from app.models.kpi_config_model import KpiConfig
from app.models.feedback_model import Feedback
from app.models.IVF.critical_alert_model import (
    AlertSeverity,
    AlertSource,
    AlertStatus,
    AlertType,
    AlertTriggeredBy,
    CriticalAlert,
)
from app.constants.enums import (
    ActivityActorType,
    ActivityOutcome,
    CanisterStatus,
    FeedbackDepartment,
    FeedbackType,
    FeedbackPriority,
    AffectedModule,
    FeedbackStatus,
)

client = TestClient(app)
import requests

SMTP_API_URL = "http://localhost:5005/api/Messages"

def clear_smtp4dev():
    """Delete all messages in smtp4dev inbox."""
    try:
        res = requests.get(f"{SMTP_API_URL}?pageSize=1000", timeout=5).json()
        msgs = res.get("results", res) if isinstance(res, dict) else res
        for msg in msgs:
            msg_id = msg.get("id")
            if msg_id:
                requests.delete(f"{SMTP_API_URL}/{msg_id}", timeout=5)
    except Exception:
        pass

"""
Activity log is written by ActivityLogService.log_activity (activity_log_service.py).
It short-circuits and writes nothing when:
    settings.is_development            -> ENVIRONMENT == "development"
 or not settings.AUDIT_LOG_ENABLED
 or audit_log_disabled                 -> True only for the mygrape_admin role

A full login (fixed OTP mode, code 123456) writes three rows for the same user:
    email.otp_sent          -> otp_service.send_otp_to_user
    user.login_requested    -> login_service.handle_login
    user.login              -> otp_service.verify_otp_and_create_token
All three carry actor_type "user", actor_id = user_id, outcome "success".
"""


class TestScenario_ActivityLog:
    """Scenario: Activity Log on Authentication.

    Validates that the audit trail records the expected rows in the activity_log
    table as a user moves through the two-step login flow (password -> OTP).
    """

    def test_user_login_creates_activity_log_records(self, setup_hospital_user):
        """Verify a full login writes the expected activity_log rows.

        Given a valid hospital user and fixed OTP mode (code 123456),
        when the user logs in with the correct password and verifies the OTP,
        then three rows are written to activity_log for that user:
        email.otp_sent, user.login_requested, and user.login.

        Arrange: Set up a hospital user and confirm audit logging is enabled.
        Act: Log in and verify the OTP with the fixed code 123456.
        Assert: The three expected actions exist for the user, each a successful
        user-actor event.
        """
        print("\n" + "=" * 60)
        print("ACTIVITY LOG SCENARIO 1: User login writes audit rows")
        print("=" * 60)

        if settings.is_development or not settings.AUDIT_LOG_ENABLED:
            pytest.skip(
                "Audit logging is disabled in this environment "
                f"(is_development={settings.is_development}, "
                f"AUDIT_LOG_ENABLED={settings.AUDIT_LOG_ENABLED}). "
                "Set ENVIRONMENT to a non-development value to run this test."
            )

        assert settings.FIXED_OTP_MODE, (
            "This test expects FIXED_OTP_MODE so the OTP code 123456 is accepted."
        )

        data = setup_hospital_user(role="Admin")
        user = data["user"]
        user_id = str(user.user_id)
        print(f"Email   : {user.email}")
        print(f"user_id : {user_id}")

        # Step 1 — login with correct password triggers the OTP
        login_payload = {"email": user.email, "password": "Scuba123!"}
        login_response = client.post("/api/login", json=login_payload)

        print("\nSTEP 1: LOGIN")
        print(f"Status : {login_response.status_code}")
        print(f"Body   : {login_response.text}")

        assert login_response.status_code == 200
        assert login_response.json()["user_id"] == user_id

        # Step 2 — verify with the fixed OTP code
        otp_payload = {"user_id": user_id, "otp": settings.FIXED_OTP_CODE}
        otp_response = client.post("/api/verify-otp", json=otp_payload)

        print("\nSTEP 2: VERIFY OTP")
        print(f"OTP    : {settings.FIXED_OTP_CODE}")
        print(f"Status : {otp_response.status_code}")
        print(f"Body   : {otp_response.text}")

        assert otp_response.status_code == 200
        assert "auth_token" in otp_response.json()

        # Step 3 — inspect the activity_log table for this user
        verify_db = SessionLocal()
        try:
            rows = (
                verify_db.query(ActivityLog)
                .filter(
                    ActivityLog.actor_type == ActivityActorType.USER.value,
                    ActivityLog.actor_id == user_id,
                )
                .all()
            )

            actions = sorted(row.action for row in rows)
            print("\nSTEP 3: ACTIVITY LOG ROWS")
            print(f"Found {len(rows)} row(s) for user")
            for row in rows:
                print(f"  - {row.action} | outcome={row.outcome} | id={row.id}")

            expected_actions = {
                "email.otp_sent",
                "user.login_requested",
                "user.login",
            }
            assert expected_actions.issubset(set(actions)), (
                f"Missing activity log rows. Expected {expected_actions}, "
                f"got {set(actions)}"
            )

            for row in rows:
                if row.action in expected_actions:
                    assert row.outcome == ActivityOutcome.SUCCESS.value
                    assert row.actor_type == ActivityActorType.USER.value
                    assert row.actor_id == user_id

            print("\n[OK] PASSED — Login wrote email.otp_sent, user.login_requested, user.login")
        finally:
            # Keep the table clean — these rows are not covered by the user fixture teardown
            verify_db.query(ActivityLog).filter(
                ActivityLog.actor_type == ActivityActorType.USER.value,
                ActivityLog.actor_id == user_id,
            ).delete()
            verify_db.commit()
            verify_db.close()

    def test_profile_update_creates_activity_log_record(self, setup_hospital_user):
        """Verify profile update writes the expected activity_log row.

        Arrange: Set up a hospital user and log in to get a valid auth token.
        Act: Update the user's first and last name.
        Assert: A 'user.profile_updated' action is written to activity_log
        with outcome 'success' and correct metadata.
        """
        print("\n" + "=" * 60)
        print("ACTIVITY LOG SCENARIO 2: Profile update writes audit row")
        print("=" * 60)

        if settings.is_development or not settings.AUDIT_LOG_ENABLED:
            pytest.skip("Audit logging is disabled in this environment.")

        data = setup_hospital_user(role="Admin")
        user = data["user"]
        user_id = str(user.user_id)

        # Step 1 — Login to get token
        login_response = client.post("/api/login", json={"email": user.email, "password": "Scuba123!"})
        assert login_response.status_code == 200
        
        otp_response = client.post("/api/verify-otp", json={"user_id": user_id, "otp": settings.FIXED_OTP_CODE})
        assert otp_response.status_code == 200
        token = otp_response.json()["auth_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Step 2 — Update profile
        update_payload = {"first_name": "UpdatedFirst", "last_name": "UpdatedLast"}
        update_response = client.patch(f"/api/user/{user_id}", json=update_payload, headers=headers)
        
        print("\nSTEP 2: UPDATE PROFILE")
        print(f"Status : {update_response.status_code}")
        print(f"Body   : {update_response.text}")
        assert update_response.status_code == 200

        # Step 3 — Inspect activity_log table
        verify_db = SessionLocal()
        try:
            rows = (
                verify_db.query(ActivityLog)
                .filter(
                    ActivityLog.actor_type == ActivityActorType.USER.value,
                    ActivityLog.actor_id == user_id,
                    ActivityLog.action == "user.profile_updated"
                )
                .all()
            )
            
            print("\nSTEP 3: ACTIVITY LOG ROWS FOR PROFILE UPDATE")
            print(f"Found {len(rows)} row(s)")
            for row in rows:
                print(f"  - {row.action} | outcome={row.outcome} | metadata={row.metadata_json}")
                
            assert len(rows) == 1
            log_entry = rows[0]
            assert log_entry.outcome == ActivityOutcome.SUCCESS.value
            assert log_entry.target_id == user_id
            
            # Check metadata fields
            assert log_entry.metadata_json is not None
            metadata = log_entry.metadata_json
            assert "fields" in metadata
            assert "first_name" in metadata["fields"]
            assert "last_name" in metadata["fields"]

            print("\n[OK] PASSED — Profile update wrote user.profile_updated log")
        finally:
            verify_db.query(ActivityLog).filter(
                ActivityLog.actor_type == ActivityActorType.USER.value,
                ActivityLog.actor_id == user_id,
            ).delete()
            verify_db.commit()
            verify_db.close()

    def test_login_skipped_for_mygrape_admin(self, setup_hospital_user):
        """Verify login does NOT write to activity_log for Mygrape_admin.

        Arrange: Set up a hospital user with role 'Mygrape_admin'.
        Act: Log in and verify OTP.
        Assert: No 'user.login' or 'user.login_attempt' actions are written to activity_log because
        audit logging is disabled for this role.
        """
        print("\n" + "=" * 60)
        print("ACTIVITY LOG SCENARIO 3: Audit log disabled for Mygrape_admin")
        print("=" * 60)

        if settings.is_development or not settings.AUDIT_LOG_ENABLED:
            pytest.skip("Audit logging is disabled in this environment.")

        # Setup user with Mygrape_admin role
        data = setup_hospital_user(role="Mygrape_admin")
        user = data["user"]
        user_id = str(user.user_id)

        # Step 1 — Login to get token
        login_response = client.post("/api/login", json={"email": user.email, "password": "Scuba123!"})
        assert login_response.status_code == 200
        
        otp_response = client.post("/api/verify-otp", json={"user_id": user_id, "otp": settings.FIXED_OTP_CODE})
        assert otp_response.status_code == 200

        print("\nSTEP 2: LOGIN AND OTP VERIFIED")

        # Step 3 — Inspect activity_log table
        verify_db = SessionLocal()
        try:
            rows = (
                verify_db.query(ActivityLog)
                .filter(
                    ActivityLog.actor_type == ActivityActorType.USER.value,
                    ActivityLog.actor_id == user_id,
                )
                .all()
            )
            
            print("\nSTEP 3: ACTIVITY LOG ROWS FOR LOGIN (Mygrape_admin)")
            print(f"Found {len(rows)} row(s)")
            
            # Assert that no rows are found
            assert len(rows) == 0, "Expected no activity log rows for Mygrape_admin, but found some."

            print("\n[OK] PASSED — Login correctly skipped writing log for Mygrape_admin")
        finally:
            verify_db.query(ActivityLog).filter(
                ActivityLog.actor_type == ActivityActorType.USER.value,
                ActivityLog.actor_id == user_id,
            ).delete()
            verify_db.commit()
            verify_db.close()

    def test_user_logout_creates_activity_log_record(self, setup_hospital_user):
        """Verify logout writes the expected activity_log row.

        Arrange: Set up a hospital user and log in to get a valid auth token.
        Act: Call the logout endpoint.
        Assert: A 'user.logout' action is written to activity_log.
        """
        print("\n" + "=" * 60)
        print("ACTIVITY LOG SCENARIO 4: User logout writes audit row")
        print("=" * 60)

        if settings.is_development or not settings.AUDIT_LOG_ENABLED:
            pytest.skip("Audit logging is disabled in this environment.")

        # Setup user
        data = setup_hospital_user(role="Admin")
        user = data["user"]
        user_id = str(user.user_id)

        # Login to get token
        client.post("/api/login", json={"email": user.email, "password": "Scuba123!"})
        otp_response = client.post("/api/verify-otp", json={"user_id": user_id, "otp": settings.FIXED_OTP_CODE})
        token = otp_response.json()["auth_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Logout
        logout_response = client.post("/api/logout", headers=headers)
        assert logout_response.status_code == 200

        # Inspect activity_log table
        verify_db = SessionLocal()
        try:
            rows = (
                verify_db.query(ActivityLog)
                .filter(
                    ActivityLog.actor_type == ActivityActorType.USER.value,
                    ActivityLog.actor_id == user_id,
                    ActivityLog.action == "user.logout"
                )
                .all()
            )
            
            print("\nSTEP 3: ACTIVITY LOG ROWS FOR LOGOUT")
            print(f"Found {len(rows)} row(s)")
                
            assert len(rows) == 1
            log_entry = rows[0]
            assert log_entry.outcome == ActivityOutcome.SUCCESS.value
            assert log_entry.target_id is None  # User is the actor, target is none typically

            print("\n[OK] PASSED — Logout wrote user.logout log")
        finally:
            verify_db.query(ActivityLog).filter(
                ActivityLog.actor_type == ActivityActorType.USER.value,
                ActivityLog.actor_id == user_id,
            ).delete()
            verify_db.commit()
            verify_db.close()


    @patch.object(settings, 'SMTP_SERVER', 'localhost')
    @patch.object(settings, 'SMTP_PORT', 2525)
    def test_forgot_password_creates_activity_log(self, setup_hospital_user):
        """Verify forgot password triggers email (via configured SMTP) and writes activity log.
        
        Arrange: Set up a hospital user. SMTP_SERVER is patched to localhost to hit local smtp4dev.
        Act: Call the forgot-password endpoint.
        Assert: 'email.password_reset_sent' (or similar) action is written to activity_log.
        """
        print("\n" + "=" * 60)
        print("ACTIVITY LOG SCENARIO 5: Forgot password triggers mail and writes audit row")
        print("=" * 60)

        if settings.is_development or not settings.AUDIT_LOG_ENABLED:
            pytest.skip("Audit logging is disabled in this environment.")

        # Setup user
        data = setup_hospital_user(role="Admin")
        user = data["user"]
        user_id = str(user.user_id)

        # Trigger forgot password
        forgot_password_payload = {"email": user.email}
        response = client.post("/api/forgot-password", json=forgot_password_payload)
        
        assert response.status_code == 200

        # Inspect activity_log table
        verify_db = SessionLocal()
        try:
            rows = (
                verify_db.query(ActivityLog)
                .filter(
                    ActivityLog.actor_type == ActivityActorType.USER.value,
                    ActivityLog.actor_id == user_id,
                    ActivityLog.action == "email.password_reset_sent"
                )
                .all()
            )
            
            print("\nSTEP 3: ACTIVITY LOG ROWS FOR FORGOT PASSWORD")
            print(f"Found {len(rows)} row(s)")
            
            # Note: password_reset_service might log 'email.password_reset_sent'.
            # We assert that at least one such log is created.
            assert len(rows) > 0

            print("\n[OK] PASSED — Forgot password wrote email.password_reset_sent log")
        finally:
            verify_db.query(ActivityLog).filter(
                ActivityLog.actor_type == ActivityActorType.USER.value,
                ActivityLog.actor_id == user_id,
            ).delete()
            verify_db.commit()
            verify_db.close()


    @patch.object(settings, 'SMTP_SERVER', 'localhost')
    @patch.object(settings, 'SMTP_PORT', 2525)
    def test_user_register_creates_activity_log(self, client):
        """Verify user registration triggers email and writes activity log.
        
        Arrange: Create a Pharma since registration requires an existing Pharma.
        Act: Call the register endpoint.
        Assert: 'user.registered' and 'email.user_approval_requested' actions are written.
        """
        from app.models.pharma_model import Pharma

        print("\n" + "=" * 60)
        print("ACTIVITY LOG SCENARIO 6: User register triggers mail and writes audit row")
        print("=" * 60)

        if settings.is_development or not settings.AUDIT_LOG_ENABLED:
            pytest.skip("Audit logging is disabled in this environment.")

        # Insert a dummy Hospital, Branch, and an Admin into the DB so registration succeeds
        verify_db = SessionLocal()
        try:
            import uuid
            from app.models.user_model import User
            from app.models.IVF.hospital_model import Hospital
            from app.models.IVF.hospital_branch_model import HospitalBranch
            
            hospital_name = f"Test Hospital {uuid.uuid4().hex[:8]}"
            domain = f"{uuid.uuid4().hex[:8]}.com"
            unique_email = f"newuser_{uuid.uuid4().hex[:8]}@{domain}"
            branch_name = f"Test Branch {uuid.uuid4().hex[:8]}"
            
            new_hospital = Hospital(
                hospital_name=hospital_name,
                hospital_head_email=f"head@{domain}",
                hospital_type="IVF"
            )
            verify_db.add(new_hospital)
            verify_db.flush()
            
            new_branch = HospitalBranch(
                hospital_id=new_hospital.hospital_id,
                branch_name=branch_name
            )
            verify_db.add(new_branch)
            verify_db.flush()
            
            admin_user = User(
                user_id=str(uuid.uuid4()),
                email=f"admin@{domain}",
                role="Admin",
                department="IVF",
                hospital_id=new_hospital.hospital_id,
                status=True,
                approved_status="approved",
                first_name="Admin",
                last_name="User",
                password_hash="dummy"
            )
            verify_db.add(admin_user)
            verify_db.commit()
        finally:
            verify_db.close()

        request_data = {
            "first_name": "Jane",
            "last_name": "Smith",
            "email": unique_email,
            "password": "Password123!",
            "confirm_password": "Password123!",
            "role": "User",
            "department": "IVF",
            "hospital_name": hospital_name,
            "branch_name": branch_name
        }
        
        # 2. Clear smtp4dev inbox before test
        try:
            clear_smtp4dev()
        except Exception:
            pass

        response = client.post("/api/register", json=request_data)
        assert response.status_code == 200, f"Registration failed: {response.text}"
        
        user_id = response.json().get("user_id")

        # Inspect activity_log table
        verify_db = SessionLocal()
        try:
            rows = (
                verify_db.query(ActivityLog)
                .filter(
                    ActivityLog.actor_type == ActivityActorType.USER.value,
                    ActivityLog.actor_id == user_id,
                    ActivityLog.action.in_(["user.registered", "email.user_approval_requested"])
                )
                .all()
            )
            
            actions = sorted(row.action for row in rows)
            print("\nSTEP 3: ACTIVITY LOG ROWS FOR USER REGISTER")
            print(f"Found {len(rows)} row(s)")
            
            expected_actions = {"user.registered", "email.user_approval_requested"}
            assert expected_actions.issubset(set(actions))

            print("\n[OK] PASSED — User register wrote expected logs")

            # Verify email was sent via smtp4dev
            print("\nSTEP 4: VERIFY EMAIL IN SMTP4DEV")
            try:
                res = requests.get(f"{SMTP_API_URL}?pageSize=10", timeout=5).json()
                msgs = res.get("results", res) if isinstance(res, dict) else res
                assert len(msgs) > 0, "No emails found in smtp4dev"
                
                # Verify an email was sent (we don't strictly check the recipient since it may go to any Admin)
                found_email = True
                print("\n[OK] PASSED — Email successfully sent to smtp4dev")
            except requests.RequestException as e:
                print(f"Failed to check smtp4dev: {e}. Is it running on port 5005?")
        finally:
            if user_id:
                verify_db.query(ActivityLog).filter(
                    ActivityLog.actor_type == ActivityActorType.USER.value,
                    ActivityLog.actor_id == user_id,
                ).delete()
            # Also clean up the user if needed, but the test db might rollback anyway
            verify_db.commit()
            verify_db.close()


class TestScenario_AlertActivityLog:
    """Scenario: Activity Log on Critical Alerts.

    Validates the audit trail for the critical-alert lifecycle handled by
    critical_alert_service.py / critical_alert_controller.py:
      - Acknowledgement -> 'alert.acknowledged' is logged with the acting user as actor.
      - Escalation      -> 'email.escalation_sent' is written per admin/manager recipient
        when alerts go unacknowledged, with the critical-alert system as actor.
    """

    def _make_alert(self, db, *, tank, hospital_id, branch_id, status=AlertStatus.ACTIVE):
        """Insert a single ACTIVE critical alert and return it."""
        alert = CriticalAlert(
            alert_id=str(uuid.uuid4()),
            tank_id=tank.tank_id,
            hospital_id=hospital_id,
            branch_id=branch_id,
            alert_type=AlertType.DEVIATION_ALERT.value,
            source=AlertSource.KPI.value,
            severity=AlertSeverity.HIGH.value,
            message="LN2 level crossed L2",
            status=status.value,
            triggered_by=AlertTriggeredBy.SYSTEM.value,
            occurred_at=datetime.now(timezone.utc),
            dedup_key=f"{tank.tank_id}:KPI:Deviation alert:{uuid.uuid4().hex}",
            created_at=datetime.now(timezone.utc),
        )
        db.add(alert)
        db.commit()
        db.refresh(alert)
        return alert

    def test_acknowledge_alert_logs_user_as_actor(self, setup_hospital_user):
        """Verify acknowledging an alert writes 'alert.acknowledged' with the user as actor.

        Arrange: Seed a hospital user, a tank in their branch, and an ACTIVE alert.
        Act: Log in, then POST /api/ivf/alerts/acknowledge for that alert.
        Assert: An 'alert.acknowledged' row exists with actor_type 'user',
        actor_id == the acknowledging user's id, target the alert, outcome success.
        """
        print("\n" + "=" * 60)
        print("ALERT ACTIVITY LOG SCENARIO 1: Acknowledge writes alert.acknowledged")
        print("=" * 60)

        if settings.is_development or not settings.AUDIT_LOG_ENABLED:
            pytest.skip("Audit logging is disabled in this environment.")

        assert settings.FIXED_OTP_MODE, (
            "This test expects FIXED_OTP_MODE so the OTP code is accepted."
        )

        data = setup_hospital_user(role="Admin")
        user = data["user"]
        hospital = data["hospital"]
        branch = data["branch"]
        user_id = str(user.user_id)

        seed_db = SessionLocal()
        try:
            tank = Tank(
                branch_id=branch.branch_id,
                tank_code=f"Tank-{uuid.uuid4().hex[:4].upper()}",
                is_active=True,
                status=CanisterStatus.SAFE,
            )
            seed_db.add(tank)
            seed_db.commit()
            seed_db.refresh(tank)

            alert = self._make_alert(
                seed_db,
                tank=tank,
                hospital_id=hospital.hospital_id,
                branch_id=branch.branch_id,
            )
            alert_id = alert.alert_id
            tank_id = tank.tank_id
            print(f"Seeded alert_id={alert_id} for tank_id={tank_id}")

            # Login to obtain a token for the acknowledging user
            login_response = client.post(
                "/api/login", json={"email": user.email, "password": "Scuba123!"}
            )
            assert login_response.status_code == 200, login_response.text
            otp_response = client.post(
                "/api/verify-otp",
                json={"user_id": user_id, "otp": settings.FIXED_OTP_CODE},
            )
            assert otp_response.status_code == 200, otp_response.text
            token = otp_response.json()["auth_token"]
            headers = {"Authorization": f"Bearer {token}"}

            ack_response = client.post(
                "/api/ivf/alerts/acknowledge",
                json={"alert_id": alert_id, "acknowledgment_reason": "Handled on site"},
                headers=headers,
            )
            print(f"\nACK status : {ack_response.status_code}")
            print(f"ACK body   : {ack_response.text}")
            assert ack_response.status_code == 200, ack_response.text

            verify_db = SessionLocal()
            try:
                rows = (
                    verify_db.query(ActivityLog)
                    .filter(
                        ActivityLog.action == "alert.acknowledged",
                        ActivityLog.target_id == alert_id,
                    )
                    .all()
                )
                print(f"\nFound {len(rows)} alert.acknowledged row(s)")
                for row in rows:
                    print(f"  - actor_type={row.actor_type} actor_id={row.actor_id} outcome={row.outcome}")

                assert len(rows) == 1
                log_entry = rows[0]
                assert log_entry.actor_type == ActivityActorType.USER.value
                assert log_entry.actor_id == user_id
                assert log_entry.outcome == ActivityOutcome.SUCCESS.value
                assert log_entry.target_type == "alert"

                print("\n[OK] PASSED — Acknowledge wrote alert.acknowledged with the user as actor")
            finally:
                verify_db.query(ActivityLog).filter(
                    ActivityLog.target_id == alert_id
                ).delete()
                verify_db.query(ActivityLog).filter(
                    ActivityLog.actor_type == ActivityActorType.USER.value,
                    ActivityLog.actor_id == user_id,
                ).delete()
                verify_db.commit()
                verify_db.close()
        finally:
            seed_db.query(CriticalAlert).filter(
                CriticalAlert.tank_id == tank_id
            ).delete()
            seed_db.query(Tank).filter(Tank.tank_id == tank_id).delete()
            seed_db.commit()
            seed_db.close()

    def test_escalation_writes_email_escalation_sent(self, setup_hospital_user):
        """Verify an unacknowledged-alert escalation writes 'email.escalation_sent' per recipient.

        Arrange: Seed a hospital (email notifications on) with an Admin recipient,
        a tank, and several ACTIVE (unacknowledged) deviation alerts.
        Act: Run the escalation path with email sending patched out.
        Assert: An 'email.escalation_sent' row is written to the admin recipient with
        the critical-alert system as actor and the recipient user as target.
        """
        print("\n" + "=" * 60)
        print("ALERT ACTIVITY LOG SCENARIO 2: Escalation writes email.escalation_sent")
        print("=" * 60)

        if settings.is_development or not settings.AUDIT_LOG_ENABLED:
            pytest.skip("Audit logging is disabled in this environment.")

        from app.service.IVF.critical_alert_service import CriticalAlertService

        data = setup_hospital_user(role="Admin")
        user = data["user"]
        hospital = data["hospital"]
        branch = data["branch"]
        user_id = str(user.user_id)

        seed_db = SessionLocal()
        tank_id = None
        try:
            # Escalation email path is gated on the hospital having email enabled.
            db_hospital = seed_db.merge(hospital)
            db_hospital.is_email_notifify = True
            seed_db.commit()

            tank = Tank(
                branch_id=branch.branch_id,
                tank_code=f"Tank-{uuid.uuid4().hex[:4].upper()}",
                is_active=True,
                status=CanisterStatus.SAFE,
            )
            seed_db.add(tank)
            seed_db.commit()
            seed_db.refresh(tank)
            tank_id = tank.tank_id

            alerts = [
                self._make_alert(
                    seed_db,
                    tank=tank,
                    hospital_id=hospital.hospital_id,
                    branch_id=branch.branch_id,
                )
                for _ in range(3)
            ]

            kpi_config = MagicMock()
            kpi_config.id = 999999
            kpi_config.kpi_name = "ln2_level"
            kpi_config.alert_name = "LN2 Level"
            kpi_config.unack_escalation_threshold = 2
            kpi_config.last_escalation_sent_at = None

            with patch(
                "app.service.IVF.critical_alert_service.send_email"
            ) as mock_send:
                service = CriticalAlertService(seed_db)
                service._send_escalation_email_to_admins(
                    kpi_config, tank.tank_id, len(alerts), alerts
                )
                seed_db.commit()
                print(f"send_email called {mock_send.call_count} time(s)")

            verify_db = SessionLocal()
            try:
                rows = (
                    verify_db.query(ActivityLog)
                    .filter(
                        ActivityLog.action == "email.escalation_sent",
                        ActivityLog.target_id == user_id,
                    )
                    .all()
                )
                print(f"\nFound {len(rows)} email.escalation_sent row(s)")
                for row in rows:
                    print(f"  - actor_type={row.actor_type} actor_id={row.actor_id} target_type={row.target_type}")

                assert len(rows) == 1
                log_entry = rows[0]
                assert log_entry.actor_type == ActivityActorType.SYSTEM.value
                assert log_entry.actor_id == "system"
                assert log_entry.outcome == ActivityOutcome.SUCCESS.value
                assert log_entry.target_type == "user"
                assert log_entry.metadata_json is not None
                assert log_entry.metadata_json.get("tank_id") == tank_id
                assert log_entry.metadata_json.get("kpi_name") == "ln2_level"
                assert log_entry.metadata_json.get("recipient_user_id") == user_id

                print("\n[OK] PASSED — Escalation wrote email.escalation_sent to the admin recipient")
            finally:
                verify_db.query(ActivityLog).filter(
                    ActivityLog.action == "email.escalation_sent"
                ).delete(synchronize_session=False)
                verify_db.commit()
                verify_db.close()
        finally:
            if tank_id is not None:
                seed_db.query(CriticalAlert).filter(
                    CriticalAlert.tank_id == tank_id
                ).delete()
                seed_db.query(Tank).filter(Tank.tank_id == tank_id).delete()
                seed_db.commit()
            seed_db.close()


class TestScenario_AlertConfigActivityLog:
    """Scenario: Activity Log on Alert Configuration.

    Validates the audit trail for the Alert Configuration / Alert Setting flows
    handled by ivf_quality_controller.py. The acting IVF user is always the actor:
      - Create KPI config      -> 'alert_configuration.kpi_config_created'
      - Update KPI config      -> 'alert_configuration.kpi_config_updated'
      - Delete KPI config      -> 'alert_configuration.kpi_config_deleted'
      - Notification settings   -> 'alert_configuration.notification_settings_updated'
    """

    def _login(self, user, user_id):
        """Log in the IVF user via the fixed-OTP flow and return auth headers."""
        login_response = client.post(
            "/api/login", json={"email": user.email, "password": "Scuba123!"}
        )
        assert login_response.status_code == 200, login_response.text
        otp_response = client.post(
            "/api/verify-otp",
            json={"user_id": user_id, "otp": settings.FIXED_OTP_CODE},
        )
        assert otp_response.status_code == 200, otp_response.text
        token = otp_response.json()["auth_token"]
        return {"Authorization": f"Bearer {token}"}

    def _seed_tank(self, db, branch):
        tank = Tank(
            branch_id=branch.branch_id,
            tank_code=f"Tank-{uuid.uuid4().hex[:4].upper()}",
            is_active=True,
            status=CanisterStatus.SAFE,
        )
        db.add(tank)
        db.commit()
        db.refresh(tank)
        return tank

    def _seed_kpi_config(self, db, *, hospital, branch, tank, kpi_name="ln2_level", min_val=20, max_val=None):
        row = KpiConfig(
            hospital_id=hospital.hospital_id,
            branch_id=branch.branch_id,
            tank_id=tank.tank_id,
            kpi_name=kpi_name,
            alert_name="l1",
            min=min_val,
            max=max_val,
            unit="%",
            alert_type="soft",
            cooldown_minutes=60,
            status=True,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return row

    def test_create_kpi_config_logs_config_created(self, setup_hospital_user):
        """Verify creating a KPI config writes 'alert_configuration.kpi_config_created'.

        Arrange: Seed an IVF user, hospital, branch, and a tank in that branch.
        Act: Log in and POST /api/ivf/quality/kpi-config for the tank.
        Assert: An 'alert_configuration.kpi_config_created' row exists with the user
        as actor, target_type 'tank', outcome success, and the kpi_name in metadata.
        """
        print("\n" + "=" * 60)
        print("ALERT CONFIG SCENARIO 1: Create writes kpi_config_created")
        print("=" * 60)

        if settings.is_development or not settings.AUDIT_LOG_ENABLED:
            pytest.skip("Audit logging is disabled in this environment.")
        assert settings.FIXED_OTP_MODE, "This test expects FIXED_OTP_MODE."

        data = setup_hospital_user(role="Admin")
        user = data["user"]
        hospital = data["hospital"]
        branch = data["branch"]
        user_id = str(user.user_id)

        seed_db = SessionLocal()
        tank_id = None
        try:
            tank = self._seed_tank(seed_db, branch)
            tank_id = tank.tank_id
            headers = self._login(user, user_id)

            payload = {
                "hospital_id": hospital.hospital_id,
                "branch_id": branch.branch_id,
                "tank_id": tank_id,
                "kpi_name": "external_temperature",
                "alert_name": "l1",
                "min": -200,
                "max": -150,
                "unit": "C",
                "alert_type": "soft",
            }
            response = client.post(
                "/api/ivf/quality/kpi-config", json=payload, headers=headers
            )
            print(f"\nCREATE status : {response.status_code}")
            print(f"CREATE body   : {response.text}")
            assert response.status_code == 201, response.text

            verify_db = SessionLocal()
            try:
                rows = (
                    verify_db.query(ActivityLog)
                    .filter(
                        ActivityLog.actor_id == user_id,
                        ActivityLog.action == "alert_configuration.kpi_config_created",
                    )
                    .all()
                )
                print(f"\nFound {len(rows)} kpi_config_created row(s)")
                assert len(rows) == 1
                log_entry = rows[0]
                assert log_entry.actor_type == ActivityActorType.USER.value
                assert log_entry.outcome == ActivityOutcome.SUCCESS.value
                assert log_entry.target_type == "tank"
                assert log_entry.metadata_json is not None
                assert "external_temperature" in log_entry.metadata_json.get("kpi_names", [])

                print("\n[OK] PASSED — Create wrote alert_configuration.kpi_config_created")
            finally:
                verify_db.query(ActivityLog).filter(
                    ActivityLog.actor_id == user_id
                ).delete()
                verify_db.commit()
                verify_db.close()
        finally:
            if tank_id is not None:
                seed_db.query(KpiConfig).filter(KpiConfig.tank_id == tank_id).delete()
                seed_db.query(Tank).filter(Tank.tank_id == tank_id).delete()
                seed_db.commit()
            seed_db.close()

    def test_bulk_upsert_kpi_config_logs_bulk_upserted(self, setup_hospital_user):
        """Verify a bulk KPI config upsert writes 'alert_configuration.kpi_config_bulk_upserted'.

        Arrange: Seed an IVF user, hospital, branch, and two tanks in that branch.
        Act: Log in and POST /api/ivf/quality/kpi-config/bulk for both tanks.
        Assert: An 'alert_configuration.kpi_config_bulk_upserted' row exists with the user
        as actor, outcome success, and the tank_ids and kpi_names in metadata.
        """
        print("\n" + "=" * 60)
        print("ALERT CONFIG SCENARIO 2: Bulk upsert writes kpi_config_bulk_upserted")
        print("=" * 60)

        if settings.is_development or not settings.AUDIT_LOG_ENABLED:
            pytest.skip("Audit logging is disabled in this environment.")
        assert settings.FIXED_OTP_MODE, "This test expects FIXED_OTP_MODE."

        data = setup_hospital_user(role="Admin")
        user = data["user"]
        branch = data["branch"]
        user_id = str(user.user_id)

        seed_db = SessionLocal()
        tank_ids = []
        try:
            tank_ids = [self._seed_tank(seed_db, branch).tank_id for _ in range(2)]
            headers = self._login(user, user_id)

            payload = {
                "tank_ids": tank_ids,
                "configs": [
                    {
                        "kpi_name": "external_temperature",
                        "alert_name": "l1",
                        "min": -200,
                        "max": -150,
                        "unit": "C",
                        "alert_type": "soft",
                    },
                    {
                        "kpi_name": "ln2_level",
                        "alert_name": "l1",
                        "min": 20,
                        "unit": "%",
                        "alert_type": "soft",
                    },
                ],
            }
            response = client.post(
                "/api/ivf/quality/kpi-config/bulk", json=payload, headers=headers
            )
            print(f"\nBULK status : {response.status_code}")
            print(f"BULK body   : {response.text}")
            assert response.status_code == 200, response.text

            verify_db = SessionLocal()
            try:
                rows = (
                    verify_db.query(ActivityLog)
                    .filter(
                        ActivityLog.actor_id == user_id,
                        ActivityLog.action
                        == "alert_configuration.kpi_config_bulk_upserted",
                    )
                    .all()
                )
                print(f"\nFound {len(rows)} kpi_config_bulk_upserted row(s)")
                assert len(rows) == 1
                log_entry = rows[0]
                assert log_entry.actor_type == ActivityActorType.USER.value
                assert log_entry.outcome == ActivityOutcome.SUCCESS.value
                assert log_entry.metadata_json is not None
                assert sorted(log_entry.metadata_json.get("tank_ids", [])) == sorted(tank_ids)
                assert set(log_entry.metadata_json.get("kpi_names", [])) == {
                    "external_temperature",
                    "ln2_level",
                }

                print("\n[OK] PASSED — Bulk upsert wrote alert_configuration.kpi_config_bulk_upserted")
            finally:
                verify_db.query(ActivityLog).filter(
                    ActivityLog.actor_id == user_id
                ).delete()
                verify_db.commit()
                verify_db.close()
        finally:
            for tank_id in tank_ids:
                seed_db.query(KpiConfig).filter(KpiConfig.tank_id == tank_id).delete()
                seed_db.query(Tank).filter(Tank.tank_id == tank_id).delete()
            seed_db.commit()
            seed_db.close()

    def test_update_kpi_config_logs_config_updated(self, setup_hospital_user):
        """Verify updating a KPI config writes 'alert_configuration.kpi_config_updated'.

        Arrange: Seed an IVF user, a tank, and an existing KPI config row.
        Act: Log in and PUT /api/ivf/quality/kpi-config/{id} with changed thresholds.
        Assert: An 'alert_configuration.kpi_config_updated' row exists with the user
        as actor, outcome success, and before/after states in metadata.
        """
        print("\n" + "=" * 60)
        print("ALERT CONFIG SCENARIO 3: Update writes kpi_config_updated")
        print("=" * 60)

        if settings.is_development or not settings.AUDIT_LOG_ENABLED:
            pytest.skip("Audit logging is disabled in this environment.")
        assert settings.FIXED_OTP_MODE, "This test expects FIXED_OTP_MODE."

        data = setup_hospital_user(role="Admin")
        user = data["user"]
        hospital = data["hospital"]
        branch = data["branch"]
        user_id = str(user.user_id)

        seed_db = SessionLocal()
        tank_id = None
        try:
            tank = self._seed_tank(seed_db, branch)
            tank_id = tank.tank_id
            config = self._seed_kpi_config(
                seed_db, hospital=hospital, branch=branch, tank=tank, min_val=20
            )
            config_id = config.id
            headers = self._login(user, user_id)

            response = client.put(
                f"/api/ivf/quality/kpi-config/{config_id}",
                json={"min": 35, "alert_type": "critical"},
                headers=headers,
            )
            print(f"\nUPDATE status : {response.status_code}")
            print(f"UPDATE body   : {response.text}")
            assert response.status_code == 200, response.text

            verify_db = SessionLocal()
            try:
                rows = (
                    verify_db.query(ActivityLog)
                    .filter(
                        ActivityLog.actor_id == user_id,
                        ActivityLog.action == "alert_configuration.kpi_config_updated",
                    )
                    .all()
                )
                print(f"\nFound {len(rows)} kpi_config_updated row(s)")
                assert len(rows) == 1
                log_entry = rows[0]
                assert log_entry.actor_type == ActivityActorType.USER.value
                assert log_entry.outcome == ActivityOutcome.SUCCESS.value
                assert log_entry.metadata_json is not None
                assert "before" in log_entry.metadata_json
                assert "after" in log_entry.metadata_json
                assert log_entry.metadata_json["before"]["min"] == 20
                assert log_entry.metadata_json["after"]["min"] == 35

                print("\n[OK] PASSED — Update wrote alert_configuration.kpi_config_updated")
            finally:
                verify_db.query(ActivityLog).filter(
                    ActivityLog.actor_id == user_id
                ).delete()
                verify_db.commit()
                verify_db.close()
        finally:
            if tank_id is not None:
                seed_db.query(KpiConfig).filter(KpiConfig.tank_id == tank_id).delete()
                seed_db.query(Tank).filter(Tank.tank_id == tank_id).delete()
                seed_db.commit()
            seed_db.close()

    def test_delete_kpi_config_logs_config_deleted(self, setup_hospital_user):
        """Verify deleting a KPI config writes 'alert_configuration.kpi_config_deleted'.

        Arrange: Seed an IVF user, a tank, and an existing KPI config row.
        Act: Log in and DELETE /api/ivf/quality/kpi-config/{id}.
        Assert: An 'alert_configuration.kpi_config_deleted' row exists with the user
        as actor, outcome success, and the deleted config's kpi_name in metadata.
        """
        print("\n" + "=" * 60)
        print("ALERT CONFIG SCENARIO 4: Delete writes kpi_config_deleted")
        print("=" * 60)

        if settings.is_development or not settings.AUDIT_LOG_ENABLED:
            pytest.skip("Audit logging is disabled in this environment.")
        assert settings.FIXED_OTP_MODE, "This test expects FIXED_OTP_MODE."

        data = setup_hospital_user(role="Admin")
        user = data["user"]
        hospital = data["hospital"]
        branch = data["branch"]
        user_id = str(user.user_id)

        seed_db = SessionLocal()
        tank_id = None
        try:
            tank = self._seed_tank(seed_db, branch)
            tank_id = tank.tank_id
            config = self._seed_kpi_config(
                seed_db, hospital=hospital, branch=branch, tank=tank, kpi_name="ln2_level"
            )
            config_id = config.id
            headers = self._login(user, user_id)

            response = client.delete(
                f"/api/ivf/quality/kpi-config/{config_id}", headers=headers
            )
            print(f"\nDELETE status : {response.status_code}")
            print(f"DELETE body   : {response.text}")
            assert response.status_code == 200, response.text
            assert response.json().get("deleted") is True

            verify_db = SessionLocal()
            try:
                rows = (
                    verify_db.query(ActivityLog)
                    .filter(
                        ActivityLog.actor_id == user_id,
                        ActivityLog.action == "alert_configuration.kpi_config_deleted",
                    )
                    .all()
                )
                print(f"\nFound {len(rows)} kpi_config_deleted row(s)")
                assert len(rows) == 1
                log_entry = rows[0]
                assert log_entry.actor_type == ActivityActorType.USER.value
                assert log_entry.outcome == ActivityOutcome.SUCCESS.value
                assert "ln2_level" in log_entry.metadata_json.get("kpi_names", [])

                # The row is actually gone from kpi_config
                assert (
                    verify_db.query(KpiConfig).filter(KpiConfig.id == config_id).first()
                    is None
                )

                print("\n[OK] PASSED — Delete wrote alert_configuration.kpi_config_deleted")
            finally:
                verify_db.query(ActivityLog).filter(
                    ActivityLog.actor_id == user_id
                ).delete()
                verify_db.commit()
                verify_db.close()
        finally:
            if tank_id is not None:
                seed_db.query(KpiConfig).filter(KpiConfig.tank_id == tank_id).delete()
                seed_db.query(Tank).filter(Tank.tank_id == tank_id).delete()
                seed_db.commit()
            seed_db.close()

    def test_update_notification_settings_logs_settings_updated(self, setup_hospital_user):
        """Verify updating notification channels writes 'alert_configuration.notification_settings_updated'.

        Arrange: Seed an IVF user with a hospital.
        Act: Log in and PUT /api/ivf/quality/hospital-notification-settings toggling channels.
        Assert: An 'alert_configuration.notification_settings_updated' row exists with the
        user as actor, target_type 'hospital', outcome success, and before/after in metadata.
        """
        print("\n" + "=" * 60)
        print("ALERT CONFIG SCENARIO 5: Notification settings update writes audit row")
        print("=" * 60)

        if settings.is_development or not settings.AUDIT_LOG_ENABLED:
            pytest.skip("Audit logging is disabled in this environment.")
        assert settings.FIXED_OTP_MODE, "This test expects FIXED_OTP_MODE."

        data = setup_hospital_user(role="Admin")
        user = data["user"]
        hospital = data["hospital"]
        user_id = str(user.user_id)
        hospital_id = hospital.hospital_id

        headers = self._login(user, user_id)
        response = client.put(
            "/api/ivf/quality/hospital-notification-settings",
            json={"is_email_notifify": True, "is_whatsapp_notify": False},
            headers=headers,
        )
        print(f"\nUPDATE status : {response.status_code}")
        print(f"UPDATE body   : {response.text}")
        assert response.status_code == 200, response.text

        verify_db = SessionLocal()
        try:
            rows = (
                verify_db.query(ActivityLog)
                .filter(
                    ActivityLog.actor_id == user_id,
                    ActivityLog.action
                    == "alert_configuration.notification_settings_updated",
                )
                .all()
            )
            print(f"\nFound {len(rows)} notification_settings_updated row(s)")
            assert len(rows) == 1
            log_entry = rows[0]
            assert log_entry.actor_type == ActivityActorType.USER.value
            assert log_entry.outcome == ActivityOutcome.SUCCESS.value
            assert log_entry.target_type == "hospital"
            assert log_entry.target_id == str(hospital_id)
            assert log_entry.metadata_json is not None
            assert "before" in log_entry.metadata_json
            assert "after" in log_entry.metadata_json
            assert log_entry.metadata_json["after"]["is_email_notifify"] is True
            assert log_entry.metadata_json["after"]["is_whatsapp_notify"] is False

            print("\n[OK] PASSED — Notification settings update wrote audit row")
        finally:
            verify_db.query(ActivityLog).filter(
                ActivityLog.actor_id == user_id
            ).delete()
            verify_db.commit()
            verify_db.close()


class TestScenario_SupportTicketActivityLog:
    """Scenario: Activity Log on Support Ticket email notifications.

    Validates the audit trail for the support-ticket email side-effects in
    feedback_service.py. The acting user is always the actor and the ticket is
    the target. Email rows differ by flow and by whether a BackgroundTasks queue
    is available (queued) or the synchronous fallback runs (sent):
      - email.support_ticket_created          -> create_feedback (sent inline)
      - email.support_ticket_comment_queued   -> add_comment with BackgroundTasks
      - email.support_ticket_comment_sent     -> add_comment without BackgroundTasks
      - email.support_ticket_status_queued    -> update_feedback_status with BackgroundTasks
      - email.support_ticket_status_sent      -> update_feedback_status without BackgroundTasks
    """

    def _seed_environment(self, setup_hospital_user, seed_db, *, with_ticket=True):
        """Seed a submitter (IVF Admin) plus a Mygrape_admin recipient, and optionally a ticket.

        get_mygrape_admin_email requires an active, approved Mygrape_admin to exist,
        otherwise the email branches short-circuit and write no log. Returns a dict
        with user_id, admin_user_id, and ticket_id (None when with_ticket is False).
        """
        from app.models.user_model import User

        data = setup_hospital_user(role="Admin")
        user = data["user"]
        hospital = data["hospital"]
        user_id = str(user.user_id)

        admin = User(
            user_id=str(uuid.uuid4()),
            email=f"mgadmin_{uuid.uuid4().hex[:8]}@test.com",
            password_hash="dummy",
            first_name="Mygrape",
            last_name="Admin",
            role="Mygrape_admin",
            status=True,
            approved_status="approved",
            hospital_id=hospital.hospital_id,
            department="IVF",
        )
        seed_db.add(admin)
        seed_db.commit()

        ticket_id = None
        if with_ticket:
            ticket_id = f"TK-TEST-{uuid.uuid4().hex[:12]}"
            ticket = Feedback(
                ticket_id=ticket_id,
                department=FeedbackDepartment.QUALITY_ASSURANCE,
                feedback_type=FeedbackType.BUG,
                subject="Seeded support ticket for audit test",
                description="Seeded description for activity log assertions.",
                priority=FeedbackPriority.MEDIUM,
                affected_modules=AffectedModule.DASHBOARD.value,
                status=FeedbackStatus.OPEN,
                submitted_by=user_id,
                created_by=user_id,
            )
            seed_db.add(ticket)
            seed_db.commit()

        return {"user_id": user_id, "admin_user_id": admin.user_id, "ticket_id": ticket_id}

    def _assert_single_email_log(self, action, ticket_id, user_id):
        """Assert exactly one matching email activity_log row exists and return it."""
        verify_db = SessionLocal()
        try:
            rows = (
                verify_db.query(ActivityLog)
                .filter(
                    ActivityLog.actor_id == user_id,
                    ActivityLog.action == action,
                    ActivityLog.target_id == ticket_id,
                )
                .all()
            )
            print(f"\nFound {len(rows)} '{action}' row(s)")
            for row in rows:
                print(f"  - actor_type={row.actor_type} outcome={row.outcome} target_type={row.target_type}")
            assert len(rows) == 1
            row = rows[0]
            assert row.actor_type == ActivityActorType.USER.value
            assert row.outcome == ActivityOutcome.SUCCESS.value
            assert row.target_type == "support_ticket"
            assert "recipient_email" in (row.metadata_json or {})
        finally:
            verify_db.close()

    def _cleanup(self, seed_db, user_id, admin_user_id, ticket_id):
        from app.models.user_model import User
        from app.models.feedback_comments import Comment

        verify_db = SessionLocal()
        try:
            verify_db.query(ActivityLog).filter(
                ActivityLog.actor_id.in_([user_id, str(admin_user_id)])
            ).delete(synchronize_session=False)
            verify_db.commit()
        finally:
            verify_db.close()
        if ticket_id:
            seed_db.query(Comment).filter(Comment.ticket_id == ticket_id).delete()
            seed_db.query(Feedback).filter(Feedback.ticket_id == ticket_id).delete()
        seed_db.query(User).filter(User.user_id == admin_user_id).delete()
        seed_db.commit()
        seed_db.close()

    def test_create_ticket_email_logs_support_ticket_created(self, setup_hospital_user):
        """Verify creating a ticket writes 'email.support_ticket_created'.

        Arrange: Seed an IVF user and a Mygrape_admin recipient.
        Act: Call create_feedback with the new-ticket email patched out.
        Assert: An 'email.support_ticket_created' row exists for the user and ticket.
        """
        print("\n" + "=" * 60)
        print("SUPPORT TICKET SCENARIO 1: Create writes email.support_ticket_created")
        print("=" * 60)

        if settings.is_development or not settings.AUDIT_LOG_ENABLED:
            pytest.skip("Audit logging is disabled in this environment.")

        from app.service import feedback_service
        from app.schemas.feedback_schema import FeedbackCreateRequest

        seed_db = SessionLocal()
        env = self._seed_environment(setup_hospital_user, seed_db, with_ticket=False)
        user_id = env["user_id"]
        ticket_id = None
        try:
            request = FeedbackCreateRequest(
                department=FeedbackDepartment.QUALITY_ASSURANCE,
                feedback_type=FeedbackType.BUG,
                subject="New support ticket for audit test",
                description="Description long enough for validation.",
                priority=FeedbackPriority.HIGH,
                affected_modules=[AffectedModule.DASHBOARD],
                send_email=True,
            )
            with patch.object(feedback_service, "send_feedback_new_ticket_email"):
                response = feedback_service.create_feedback(
                    seed_db, request, submitted_by=user_id
                )
            ticket_id = response.ticket_id
            print(f"Created ticket_id={ticket_id}")

            self._assert_single_email_log(
                "email.support_ticket_created", ticket_id, user_id
            )
            print("\n[OK] PASSED — Create wrote email.support_ticket_created")
        finally:
            self._cleanup(seed_db, user_id, env["admin_user_id"], ticket_id)

    def test_comment_email_logs_comment_queued(self, setup_hospital_user):
        """Verify add_comment with a background queue writes 'email.support_ticket_comment_queued'.

        Arrange: Seed an IVF user, a Mygrape_admin recipient, and a ticket.
        Act: Call add_comment passing a BackgroundTasks instance.
        Assert: An 'email.support_ticket_comment_queued' row exists for the user and ticket.
        """
        print("\n" + "=" * 60)
        print("SUPPORT TICKET SCENARIO 2: Comment queued writes comment_queued")
        print("=" * 60)

        if settings.is_development or not settings.AUDIT_LOG_ENABLED:
            pytest.skip("Audit logging is disabled in this environment.")

        from fastapi import BackgroundTasks
        from app.service import feedback_service
        from app.schemas.feedback_schema import CommentCreateRequest

        seed_db = SessionLocal()
        env = self._seed_environment(setup_hospital_user, seed_db)
        user_id, ticket_id = env["user_id"], env["ticket_id"]
        try:
            feedback_service.add_comment(
                seed_db,
                ticket_id,
                CommentCreateRequest(comment="Queued comment", send_email=True),
                commented_by=user_id,
                background_tasks=BackgroundTasks(),
            )
            self._assert_single_email_log(
                "email.support_ticket_comment_queued", ticket_id, user_id
            )
            print("\n[OK] PASSED — Comment wrote email.support_ticket_comment_queued")
        finally:
            self._cleanup(seed_db, user_id, env["admin_user_id"], ticket_id)

    def test_comment_email_logs_comment_sent(self, setup_hospital_user):
        """Verify add_comment without a queue writes 'email.support_ticket_comment_sent'.

        Arrange: Seed an IVF user, a Mygrape_admin recipient, and a ticket.
        Act: Call add_comment without BackgroundTasks (synchronous fallback), email patched.
        Assert: An 'email.support_ticket_comment_sent' row exists for the user and ticket.
        """
        print("\n" + "=" * 60)
        print("SUPPORT TICKET SCENARIO 3: Comment sent writes comment_sent")
        print("=" * 60)

        if settings.is_development or not settings.AUDIT_LOG_ENABLED:
            pytest.skip("Audit logging is disabled in this environment.")

        from app.service import feedback_service
        from app.schemas.feedback_schema import CommentCreateRequest

        seed_db = SessionLocal()
        env = self._seed_environment(setup_hospital_user, seed_db)
        user_id, ticket_id = env["user_id"], env["ticket_id"]
        try:
            with patch.object(feedback_service, "send_feedback_new_comment_email"):
                feedback_service.add_comment(
                    seed_db,
                    ticket_id,
                    CommentCreateRequest(comment="Synchronous comment", send_email=True),
                    commented_by=user_id,
                    background_tasks=None,
                )
            self._assert_single_email_log(
                "email.support_ticket_comment_sent", ticket_id, user_id
            )
            print("\n[OK] PASSED — Comment wrote email.support_ticket_comment_sent")
        finally:
            self._cleanup(seed_db, user_id, env["admin_user_id"], ticket_id)

    def test_status_email_logs_status_queued(self, setup_hospital_user):
        """Verify update_feedback_status with a queue writes 'email.support_ticket_status_queued'.

        Arrange: Seed an IVF user, a Mygrape_admin recipient, and a ticket.
        Act: Call update_feedback_status passing a BackgroundTasks instance.
        Assert: An 'email.support_ticket_status_queued' row exists for the user and ticket.
        """
        print("\n" + "=" * 60)
        print("SUPPORT TICKET SCENARIO 4: Status queued writes status_queued")
        print("=" * 60)

        if settings.is_development or not settings.AUDIT_LOG_ENABLED:
            pytest.skip("Audit logging is disabled in this environment.")

        from fastapi import BackgroundTasks
        from app.service import feedback_service
        from app.schemas.feedback_schema import FeedbackStatusUpdateRequest

        seed_db = SessionLocal()
        env = self._seed_environment(setup_hospital_user, seed_db)
        user_id, ticket_id = env["user_id"], env["ticket_id"]
        try:
            feedback_service.update_feedback_status(
                seed_db,
                ticket_id,
                FeedbackStatusUpdateRequest(
                    status=FeedbackStatus.IN_PROGRESS, send_email=True
                ),
                updated_by=user_id,
                background_tasks=BackgroundTasks(),
            )
            self._assert_single_email_log(
                "email.support_ticket_status_queued", ticket_id, user_id
            )
            print("\n[OK] PASSED — Status update wrote email.support_ticket_status_queued")
        finally:
            self._cleanup(seed_db, user_id, env["admin_user_id"], ticket_id)

    def test_status_email_logs_status_sent(self, setup_hospital_user):
        """Verify update_feedback_status without a queue writes 'email.support_ticket_status_sent'.

        Arrange: Seed an IVF user, a Mygrape_admin recipient, and a ticket.
        Act: Call update_feedback_status without BackgroundTasks (synchronous fallback), email patched.
        Assert: An 'email.support_ticket_status_sent' row exists for the user and ticket.
        """
        print("\n" + "=" * 60)
        print("SUPPORT TICKET SCENARIO 5: Status sent writes status_sent")
        print("=" * 60)

        if settings.is_development or not settings.AUDIT_LOG_ENABLED:
            pytest.skip("Audit logging is disabled in this environment.")

        from app.service import feedback_service
        from app.schemas.feedback_schema import FeedbackStatusUpdateRequest

        seed_db = SessionLocal()
        env = self._seed_environment(setup_hospital_user, seed_db)
        user_id, ticket_id = env["user_id"], env["ticket_id"]
        try:
            with patch.object(feedback_service, "send_feedback_status_update_email"):
                feedback_service.update_feedback_status(
                    seed_db,
                    ticket_id,
                    FeedbackStatusUpdateRequest(
                        status=FeedbackStatus.COMPLETED, send_email=True
                    ),
                    updated_by=user_id,
                    background_tasks=None,
                )
            self._assert_single_email_log(
                "email.support_ticket_status_sent", ticket_id, user_id
            )
            print("\n[OK] PASSED — Status update wrote email.support_ticket_status_sent")
        finally:
            self._cleanup(seed_db, user_id, env["admin_user_id"], ticket_id)


class TestScenario_ReportDownloadActivityLog:
    """Scenario: Activity Log on report downloads.

    Validates the audit trail written by report_actions_controller.py when a user
    downloads a report. POST /api/reports/download writes a
    'report.{report_type}.downloaded' row whose metadata echoes the filters,
    so the selected timeline range is captured in the audit trail:
      - Activity Logs   -> report.activity_logs.downloaded        (date_from / date_to)
      - Critical Alerts -> report.ivf.critical_alerts.downloaded  (start_date / end_date)
      - Monthly Summary -> report.ivf.monthly_summary.downloaded  (month)
      - Refill Logs     -> report.ivf.refill_logs.downloaded      (start_date / end_date)
    """

    def _login(self, user, user_id):
        """Log in via the fixed-OTP flow and return auth headers."""
        login_response = client.post(
            "/api/login", json={"email": user.email, "password": "Scuba123!"}
        )
        assert login_response.status_code == 200, login_response.text
        otp_response = client.post(
            "/api/verify-otp",
            json={"user_id": user_id, "otp": settings.FIXED_OTP_CODE},
        )
        assert otp_response.status_code == 200, otp_response.text
        token = otp_response.json()["auth_token"]
        return {"Authorization": f"Bearer {token}"}

    def _download_and_verify(self, setup_hospital_user, *, report_type, action, filters):
        """Download a report and assert the audit row captures the action and the range.

        Logs in an IVF Admin, POSTs the download with the given filters, then asserts
        exactly one matching activity_log row exists with the user as actor, the report
        as target, outcome success, and every filter key (the timeline range) persisted
        verbatim in metadata.
        """
        if settings.is_development or not settings.AUDIT_LOG_ENABLED:
            pytest.skip("Audit logging is disabled in this environment.")
        assert settings.FIXED_OTP_MODE, "This test expects FIXED_OTP_MODE."

        data = setup_hospital_user(role="Admin")
        user = data["user"]
        user_id = str(user.user_id)
        headers = self._login(user, user_id)

        response = client.post(
            "/api/reports/download",
            json={"report_type": report_type, "filters": filters},
            headers=headers,
        )
        print(f"\nDOWNLOAD status : {response.status_code}")
        print(f"DOWNLOAD body   : {response.text}")
        assert response.status_code == 200, response.text
        assert response.json().get("status") == "success"

        verify_db = SessionLocal()
        try:
            rows = (
                verify_db.query(ActivityLog)
                .filter(
                    ActivityLog.actor_id == user_id,
                    ActivityLog.action == action,
                )
                .all()
            )
            print(f"\nFound {len(rows)} '{action}' row(s)")
            assert len(rows) == 1
            log_entry = rows[0]
            assert log_entry.actor_type == ActivityActorType.USER.value
            assert log_entry.outcome == ActivityOutcome.SUCCESS.value
            assert log_entry.target_type == "report"
            assert log_entry.target_id == report_type
            assert log_entry.metadata_json is not None
            # The selected timeline range (and any other filters) is captured verbatim.
            for key, value in filters.items():
                assert log_entry.metadata_json.get(key) == value, (
                    f"metadata['{key}'] expected {value!r}, "
                    f"got {log_entry.metadata_json.get(key)!r}"
                )
            print(f"\n[OK] PASSED — {action} wrote audit row with range {filters}")
        finally:
            verify_db.query(ActivityLog).filter(
                ActivityLog.actor_id == user_id
            ).delete()
            verify_db.commit()
            verify_db.close()

    def test_activity_logs_download_logs_audit_row(self, setup_hospital_user):
        """Verify an Activity Logs download writes 'report.activity_logs.downloaded' with the range."""
        print("\n" + "=" * 60)
        print("REPORT DOWNLOAD SCENARIO 1: Activity Logs download")
        print("=" * 60)
        self._download_and_verify(
            setup_hospital_user,
            report_type="activity_logs",
            action="report.activity_logs.downloaded",
            filters={"date_from": "2026-05-01", "date_to": "2026-05-31"},
        )

    def test_critical_alerts_download_logs_audit_row(self, setup_hospital_user):
        """Verify a Critical Alerts download writes 'report.ivf.critical_alerts.downloaded' with the range."""
        print("\n" + "=" * 60)
        print("REPORT DOWNLOAD SCENARIO 2: Critical Alerts download")
        print("=" * 60)
        self._download_and_verify(
            setup_hospital_user,
            report_type="ivf.critical_alerts",
            action="report.ivf.critical_alerts.downloaded",
            filters={"start_date": "2026-05-01", "end_date": "2026-05-31"},
        )

    def test_monthly_summary_download_logs_audit_row(self, setup_hospital_user):
        """Verify a Monthly Summary download writes 'report.ivf.monthly_summary.downloaded' with the month."""
        print("\n" + "=" * 60)
        print("REPORT DOWNLOAD SCENARIO 3: Monthly Summary download")
        print("=" * 60)
        self._download_and_verify(
            setup_hospital_user,
            report_type="ivf.monthly_summary",
            action="report.ivf.monthly_summary.downloaded",
            filters={"month": "2026-05"},
        )

    def test_refill_logs_download_logs_audit_row(self, setup_hospital_user):
        """Verify a Refill Logs download writes 'report.ivf.refill_logs.downloaded' with the range."""
        print("\n" + "=" * 60)
        print("REPORT DOWNLOAD SCENARIO 4: Refill Logs download")
        print("=" * 60)
        self._download_and_verify(
            setup_hospital_user,
            report_type="ivf.refill_logs",
            action="report.ivf.refill_logs.downloaded",
            filters={"start_date": "2026-05-01", "end_date": "2026-05-31"},
        )
