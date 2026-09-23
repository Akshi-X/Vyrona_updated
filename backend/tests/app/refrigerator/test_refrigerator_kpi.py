"""Tests for refrigerator KPI alert configuration validation.

This module contains integration-style tests that exercise the KPI
configuration endpoints for refrigerator devices. Each test class targets a
single refrigerator KPI scenario (ambient zone temperature or probe temperature)
and verifies the API's behavior for common cases:

- Valid saves (min-only, max-only, both min and max)
- Negative values (allowed — temperatures can go below zero)
- Persistence (saved values can be retrieved via lookup)
- Rejection of non-numeric symbol inputs

Tests use module-local fixtures that seed a Refrigerator (instead of a Tank)
and build a matching JWT so the branch-check middleware passes:
- `setup_refrigerator_environment`: Hospital → Branch → User → Refrigerator
- `auth_headers_refrigerator`: signed JWT aligned to the seeded user
- `base_refrigerator_payload`: common POST body fields
- `post_refrigerator_kpi_config`: authorized POST helper

`get_config_by_refrigerator_kpi` is a standalone helper (not a fixture) that
GETs the KPI list by refrigerator_id and returns the matching entry.

Each test follows the arrange-act-assert pattern.
"""

import uuid
import datetime
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.config.database import SessionLocal
from app.models.user_model import User
from app.auth.auth import get_password_hash, create_access_token
from app.models.IVF.hospital_model import Hospital
from app.models.IVF.hospital_branch_model import HospitalBranch
from app.models.IVF.refrigerator_model import Refrigerator
from app.models.kpi_config_model import KpiConfig
from app.models.readings_model import Readings
from app.models.IVF.critical_alert_model import CriticalAlert
from app.service.IVF.critical_alert_service import CriticalAlertService
from app.models.IVF.critical_alert_model import AlertType

KPI_GET_LIST_URL = "/api/ivf/quality/kpi-config/list"
KPI_POST_URL     = "/api/ivf/quality/kpi-config"


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def client():
    return TestClient(app)


@pytest.fixture
def setup_refrigerator_environment():
    """Seeds Hospital → Branch → User → Refrigerator for KPI config tests."""
    db = SessionLocal()

    hospital = Hospital(hospital_name="Refrigerator KPI Test Hospital")
    db.add(hospital)
    db.commit()
    db.refresh(hospital)

    branch = HospitalBranch(
        hospital_id=hospital.hospital_id,
        branch_name="Fridge KPI Branch",
    )
    db.add(branch)
    db.commit()
    db.refresh(branch)

    user = User(
        user_id=str(uuid.uuid4()),
        email=f"{uuid.uuid4()}@test.com",
        password_hash=get_password_hash("Scuba123!"),
        first_name="Fridge",
        last_name="Tester",
        role="Admin",
        status=True,
        approved_status="approved",
        hospital_id=hospital.hospital_id,
        branch_id=branch.branch_id,
        department="IVF",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    refrigerator = Refrigerator(
        hospital_id=hospital.hospital_id,
        branch_id=branch.branch_id,
        refrigerator_code=f"FRIDGE-{uuid.uuid4().hex[:4].upper()}",
        is_active=True,
    )
    db.add(refrigerator)
    db.commit()
    db.refresh(refrigerator)

    yield {
        "db":               db,
        "hospital_id":      hospital.hospital_id,
        "branch_id":        branch.branch_id,
        "refrigerator_id":  refrigerator.refrigerator_id,
        "user_id":          user.user_id,
        "email":            user.email,
    }

    try:
        from app.models.kpi_config_model import KpiConfig
        db.query(KpiConfig).filter(
            KpiConfig.refrigerator_id == refrigerator.refrigerator_id
        ).delete()
        db.commit()
        db.delete(refrigerator)
        db.commit()
        from app.models.otp_model import OTP
        db.query(OTP).filter(OTP.user_id == user.user_id).delete()
        db.commit()
        db.delete(user)
        db.commit()
        db.delete(branch)
        db.commit()
        db.delete(hospital)
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"Refrigerator KPI teardown failed: {e}")
    finally:
        db.close()


@pytest.fixture
def auth_headers_refrigerator(setup_refrigerator_environment):
    """Signed JWT whose claims match the seeded refrigerator environment user."""
    env = setup_refrigerator_environment
    token_data = {
        "sub":         str(env["user_id"]),
        "id":          str(env["user_id"]),
        "user_id":     str(env["user_id"]),
        "email":       env["email"],
        "role":        "Admin",
        "user_role":   "Admin",
        "type":        "hospital_user",
        "user_type":   "hospital_user",
        "hospital_id": str(env["hospital_id"]),
        "branch_id":   str(env["branch_id"]),
        "department":  "IVF",
        "token_type":  "access",
        "identity":    str(env["user_id"]),
        "exp": datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=1),
        "iat": datetime.datetime.now(datetime.timezone.utc),
    }
    token = create_access_token(data=token_data)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def base_refrigerator_payload(setup_refrigerator_environment):
    """Common POST body fields using seeded refrigerator IDs."""
    env = setup_refrigerator_environment
    return {
        "hospital_id":                env["hospital_id"],
        "branch_id":                  env["branch_id"],
        "refrigerator_id":            env["refrigerator_id"],
        "alert_type":                 "critical",
        "cooldown_minutes":           60,
        "unack_escalation_threshold": None,
        "status":                     True,
    }


@pytest.fixture
def post_refrigerator_kpi_config(client, base_refrigerator_payload, auth_headers_refrigerator):
    """Executes an authorized POST to the KPI endpoint with refrigerator context."""
    def _post(fields: dict):
        return client.post(
            KPI_POST_URL,
            json={**base_refrigerator_payload, **fields},
            headers=auth_headers_refrigerator,
        )
    return _post


# ── Helper ────────────────────────────────────────────────────────────────────

def get_config_by_refrigerator_kpi(
    client: TestClient,
    env_data: dict,
    kpi_name: str,
    auth_headers: dict,
) -> dict | None:
    """Fetch the KPI config list for a refrigerator and return the matching entry."""
    resp = client.get(
        KPI_GET_LIST_URL,
        params={"refrigerator_id": env_data["refrigerator_id"]},
        headers=auth_headers,
    )
    assert resp.status_code == 200, f"GET list failed: {resp.text}"
    configs = resp.json().get("config", [])
    return next((c for c in configs if c["kpi_name"] == kpi_name), None)


def make_refrigerator(db, hospital_id: int, branch_id: int) -> Refrigerator:
    """Create and persist an extra refrigerator in the given hospital/branch."""
    fridge = Refrigerator(
        hospital_id=hospital_id,
        branch_id=branch_id,
        refrigerator_code=f"FRIDGE-{uuid.uuid4().hex[:4].upper()}",
        is_active=True,
    )
    db.add(fridge)
    db.commit()
    db.refresh(fridge)
    return fridge


def delete_refrigerator(db, refrigerator_id: int) -> None:
    """Remove a refrigerator and any KPI config rows attached to it."""
    db.query(KpiConfig).filter(
        KpiConfig.refrigerator_id == refrigerator_id
    ).delete()
    db.commit()
    fridge = db.query(Refrigerator).filter(
        Refrigerator.refrigerator_id == refrigerator_id
    ).first()
    if fridge:
        db.delete(fridge)
        db.commit()


def insert_deviation_reading(
    db,
    env: dict,
    kpi_config_id: int,
    kpi_value: float,
    zone_id: str = "zone_1",
    deviation: bool = True,
    timestamp: datetime.datetime | None = None,
) -> Readings:
    """Insert a single readings row for a refrigerator zone.

    This mirrors what the ingestion pipeline writes after evaluating a telemetry
    payload against the zone's KPI thresholds: one row per (kpi_config, timestamp)
    with `deviation` set when the value breached the configured min/max.
    """
    reading = Readings(
        hospital_id=env["hospital_id"],
        branch_id=env["branch_id"],
        refrigerator_id=env["refrigerator_id"],
        zone_id=zone_id,
        kpi_config_id=kpi_config_id,
        kpi_value=kpi_value,
        timestamp=timestamp or datetime.datetime.now(datetime.timezone.utc),
        deviation=deviation,
        checked=False,
    )
    db.add(reading)
    db.commit()
    db.refresh(reading)
    return reading


def clear_refrigerator_alerts(db, refrigerator_id: int) -> None:
    """Remove alert + reading rows for a refrigerator so the fixture teardown
    (which deletes the refrigerator) does not hit a critical_alerts FK."""
    db.query(CriticalAlert).filter(
        CriticalAlert.refrigerator_id == refrigerator_id
    ).delete()
    db.query(Readings).filter(
        Readings.refrigerator_id == refrigerator_id
    ).delete()
    db.commit()


# ── Test Classes ──────────────────────────────────────────────────────────────

class TestScenario_RefrigeratorTemperature:
    """Scenario: Refrigerator Zone Temperature (ambient, °C).

    KPI name: temp_external. Tracks the ambient air temperature of a
    refrigerator zone. Both min and max are configurable; negative values
    are valid for cold-storage units. Tests cover valid saves with various
    min/max combinations, negative-value acceptance, and persistence.
    """

    KPI  = "temp_external"
    UNIT = "°C"

    def test_valid_min_max_saves_successfully(self, post_refrigerator_kpi_config):
        """Verify a valid temperature range saves successfully.

        Given a KPI config payload with both min and max provided,
        when POSTing the config,
        then the API creates the resource and returns 201.

        Arrange: Provide valid min and max temperature values.
        Act: POST the refrigerator KPI config.
        Assert: API returns 201 (Created).
        """
        resp = post_refrigerator_kpi_config({
            "kpi_name":   self.KPI,
            "alert_name": "Zone Temp Warning",
            "unit":       self.UNIT,
            "min":        2,
            "max":        8,
        })
        assert resp.status_code == 201

    def test_min_only_saves_successfully(self, post_refrigerator_kpi_config):
        """Verify min-only config is accepted by the backend.

        Given a KPI config payload with only min provided and max null,
        when POSTing the config,
        then the API creates the resource and returns 201.

        Arrange: Provide min only; leave max null.
        Act: POST the refrigerator KPI config.
        Assert: API returns 201.
        """
        resp = post_refrigerator_kpi_config({
            "kpi_name":   self.KPI,
            "alert_name": "Zone Temp Min Warning",
            "unit":       self.UNIT,
            "min":        2,
            "max":        None,
        })
        assert resp.status_code == 201

    def test_max_only_saves_successfully(self, post_refrigerator_kpi_config):
        """Verify max-only config is accepted by the backend.

        Given a KPI config payload with only max provided and min null,
        when POSTing the config,
        then the API creates the resource and returns 201.

        Arrange: Provide max only; leave min null.
        Act: POST the refrigerator KPI config.
        Assert: API returns 201.
        """
        resp = post_refrigerator_kpi_config({
            "kpi_name":   self.KPI,
            "alert_name": "Zone Temp Max Warning",
            "unit":       self.UNIT,
            "min":        None,
            "max":        8,
        })
        assert resp.status_code == 201

    def test_negative_min_is_valid(self, post_refrigerator_kpi_config):
        """Verify negative temperature min values are accepted.

        Given a KPI config payload with a negative min temperature,
        when POSTing the config,
        then the API creates the resource and returns 201.

        Arrange: Set min to a negative value (valid for freezer zones).
        Act: POST the refrigerator KPI config.
        Assert: API returns 201.
        """
        resp = post_refrigerator_kpi_config({
            "kpi_name":   self.KPI,
            "alert_name": "Freezer Zone Warning",
            "unit":       self.UNIT,
            "min":        -25,
            "max":        -18,
        })
        assert resp.status_code == 201

    def test_config_persists_on_reopen(
        self,
        client,
        setup_refrigerator_environment,
        post_refrigerator_kpi_config,
        auth_headers_refrigerator,
    ):
        """Verify saved temperature config is retrievable via the list endpoint.

        Given a valid KPI config that has been saved,
        when reading it back via the lookup endpoint,
        then the persisted entry matches the saved min and max values.

        Arrange: Save a valid zone temperature config.
        Act: Read it back using the lookup endpoint.
        Assert: The retrieved entry has the expected min and max.
        """
        post_refrigerator_kpi_config({
            "kpi_name":   self.KPI,
            "alert_name": "Zone Temp Warning",
            "unit":       self.UNIT,
            "min":        2,
            "max":        8,
        })

        entry = get_config_by_refrigerator_kpi(
            client,
            setup_refrigerator_environment,
            self.KPI,
            auth_headers_refrigerator,
        )
        assert entry is not None
        assert entry["min"] == 2
        assert entry["max"] == 8


class TestScenario_ProbeTemperature:
    """Scenario: Refrigerator Probe Temperature (sensor, °C).

    KPI name: probe_temp. Tracks the temperature reading from a physical
    probe sensor mounted inside the refrigerator zone. Supports the same
    range of values as ambient temperature: both min/max configurable,
    negatives allowed. Tests mirror the ambient temperature scenario.
    """

    KPI  = "probe_temp"
    UNIT = "°C"

    def test_valid_min_max_saves_successfully(self, post_refrigerator_kpi_config):
        """Verify a valid probe temperature range saves successfully.

        Given a KPI config payload with both min and max provided,
        when POSTing the config,
        then the API creates the resource and returns 201.

        Arrange: Provide valid min and max probe temperature values.
        Act: POST the refrigerator KPI config.
        Assert: API returns 201 (Created).
        """
        resp = post_refrigerator_kpi_config({
            "kpi_name":   self.KPI,
            "alert_name": "Probe Temp Warning",
            "unit":       self.UNIT,
            "min":        2,
            "max":        8,
        })
        assert resp.status_code == 201

    def test_min_only_saves_successfully(self, post_refrigerator_kpi_config):
        """Verify min-only probe temp config is accepted by the backend.

        Given a KPI config payload with only min provided and max null,
        when POSTing the config,
        then the API creates the resource and returns 201.

        Arrange: Provide min only; leave max null.
        Act: POST the refrigerator KPI config.
        Assert: API returns 201.
        """
        resp = post_refrigerator_kpi_config({
            "kpi_name":   self.KPI,
            "alert_name": "Probe Temp Min Warning",
            "unit":       self.UNIT,
            "min":        2,
            "max":        None,
        })
        assert resp.status_code == 201

    def test_negative_min_is_valid(self, post_refrigerator_kpi_config):
        """Verify negative probe temperature min values are accepted.

        Given a KPI config payload with a negative min probe temperature,
        when POSTing the config,
        then the API creates the resource and returns 201.

        Arrange: Set min to a negative value (valid for freezer probe sensors).
        Act: POST the refrigerator KPI config.
        Assert: API returns 201.
        """
        resp = post_refrigerator_kpi_config({
            "kpi_name":   self.KPI,
            "alert_name": "Freezer Probe Warning",
            "unit":       self.UNIT,
            "min":        -20,
            "max":        -15,
        })
        assert resp.status_code == 201

    def test_config_persists_on_reopen(
        self,
        client,
        setup_refrigerator_environment,
        post_refrigerator_kpi_config,
        auth_headers_refrigerator,
    ):
        """Verify saved probe temperature config is retrievable via the list endpoint.

        Given a valid KPI config that has been saved,
        when reading it back via the lookup endpoint,
        then the persisted entry matches the saved min and max values.

        Arrange: Save a valid probe temperature config.
        Act: Read it back using the lookup endpoint.
        Assert: The retrieved entry has the expected min and max.
        """
        post_refrigerator_kpi_config({
            "kpi_name":   self.KPI,
            "alert_name": "Probe Temp Warning",
            "unit":       self.UNIT,
            "min":        2,
            "max":        8,
        })

        entry = get_config_by_refrigerator_kpi(
            client,
            setup_refrigerator_environment,
            self.KPI,
            auth_headers_refrigerator,
        )
        assert entry is not None
        assert entry["min"] == 2
        assert entry["max"] == 8


class TestRefrigeratorKpiValidation:
    """Cross-KPI validation checks for refrigerator alert configs.

    Groups tests that apply to all refrigerator KPIs: rejecting non-numeric
    symbol inputs and accepting equal min/max values.
    """

    KPI_CASES = [
        ("temp_external", "Zone Temp Warning",  "°C", 2,   8),
        ("probe_temp",    "Probe Temp Warning", "°C", 2,   8),
    ]

    @pytest.mark.parametrize("kpi, alert_name, unit, min_val, max_val", KPI_CASES)
    def test_symbols_in_min_returns_400(
        self, post_refrigerator_kpi_config, kpi, alert_name, unit, min_val, max_val
    ):
        """Verify non-numeric symbols in min are rejected with 400.

        Given a KPI config payload with symbols in the min field,
        when POSTing the config,
        then the API rejects the request with 400.

        Arrange: Set min to a non-numeric string.
        Act: POST the refrigerator KPI config.
        Assert: API returns 400.
        """
        resp = post_refrigerator_kpi_config({
            "kpi_name":   kpi,
            "alert_name": alert_name,
            "unit":       unit,
            "min":        "@#$%",
            "max":        max_val,
        })
        assert resp.status_code == 400

    @pytest.mark.parametrize("kpi, alert_name, unit, min_val, max_val", KPI_CASES)
    def test_symbols_in_max_returns_400(
        self, post_refrigerator_kpi_config, kpi, alert_name, unit, min_val, max_val
    ):
        """Verify non-numeric symbols in max are rejected with 400.

        Given a KPI config payload with symbols in the max field,
        when POSTing the config,
        then the API rejects the request with 400.

        Arrange: Set max to a non-numeric string.
        Act: POST the refrigerator KPI config.
        Assert: API returns 400.
        """
        resp = post_refrigerator_kpi_config({
            "kpi_name":   kpi,
            "alert_name": alert_name,
            "unit":       unit,
            "min":        min_val,
            "max":        "@#$%",
        })
        assert resp.status_code == 400

    @pytest.mark.parametrize("kpi, alert_name, unit, min_val, max_val", KPI_CASES)
    def test_min_equal_to_max_is_valid(
        self, post_refrigerator_kpi_config, kpi, alert_name, unit, min_val, max_val
    ):
        """Verify min equal to max is accepted as a valid boundary config.

        Given a KPI config payload where min equals max,
        when POSTing the config,
        then the API creates the resource and returns 201.

        Arrange: Set min and max to the same value.
        Act: POST the refrigerator KPI config.
        Assert: API returns 201 (Created).
        """
        resp = post_refrigerator_kpi_config({
            "kpi_name":   kpi,
            "alert_name": alert_name,
            "unit":       unit,
            "min":        min_val,
            "max":        min_val,
        })
        assert resp.status_code == 201


class TestRefrigeratorRangeValidation:
    """Range and business-rule checks for refrigerator KPI min/max values.

    Refrigerator KPIs (temp_external, probe_temp) are NOT part of the
    cryotank validated-KPI set in the controller, so the backend does not
    enforce min/max ordering or "both required" for them — only the numeric
    parse (float()) gates the value. These tests pin that actual contract:
    inverted ranges and empty configs are accepted, while non-numeric inputs
    (empty string, whitespace) are rejected at parse time.
    """

    KPI  = "temp_external"
    UNIT = "°C"

    def test_min_greater_than_max_is_accepted(self, post_refrigerator_kpi_config):
        """Inverted range (min > max) is accepted for refrigerator KPIs.

        These KPIs are not in the controller's ordering-validated set, so no
        "Min must be ≤ Max" rule applies and the API returns 201. If product
        later requires rejection, add temp_external/probe_temp to that set and
        flip this test to expect 400.
        """
        resp = post_refrigerator_kpi_config({
            "kpi_name":   self.KPI,
            "alert_name": "Temp Alert",
            "unit":       self.UNIT,
            "min":        8,
            "max":        2,
        })
        assert resp.status_code == 201

    def test_both_min_and_max_null_is_accepted(self, post_refrigerator_kpi_config):
        """A config with neither min nor max is accepted (201).

        No "both required" rule applies to refrigerator KPIs, so an empty
        threshold pair persists rather than being rejected.
        """
        resp = post_refrigerator_kpi_config({
            "kpi_name":   self.KPI,
            "alert_name": "Temp Alert",
            "unit":       self.UNIT,
            "min":        None,
            "max":        None,
        })
        assert resp.status_code == 201

    def test_empty_string_min_returns_400(self, post_refrigerator_kpi_config):
        """An empty-string min fails numeric parsing and returns 400."""
        resp = post_refrigerator_kpi_config({
            "kpi_name":   self.KPI,
            "alert_name": "Temp Alert",
            "unit":       self.UNIT,
            "min":        "",
            "max":        8,
        })
        assert resp.status_code == 400

    def test_whitespace_max_returns_400(self, post_refrigerator_kpi_config):
        """A whitespace-only max fails numeric parsing and returns 400."""
        resp = post_refrigerator_kpi_config({
            "kpi_name":   self.KPI,
            "alert_name": "Temp Alert",
            "unit":       self.UNIT,
            "min":        2,
            "max":        " ",
        })
        assert resp.status_code == 400

    def test_decimal_values_persist(
        self,
        client,
        setup_refrigerator_environment,
        post_refrigerator_kpi_config,
        auth_headers_refrigerator,
    ):
        """Decimal min/max values are accepted and persisted exactly.

        Arrange: POST a config with fractional thresholds (2.5 / 7.5).
        Act: Read it back via the list endpoint.
        Assert: 201 on save and the persisted floats match.
        """
        resp = post_refrigerator_kpi_config({
            "kpi_name":   self.KPI,
            "alert_name": "Temp Alert",
            "unit":       self.UNIT,
            "min":        2.5,
            "max":        7.5,
        })
        assert resp.status_code == 201

        entry = get_config_by_refrigerator_kpi(
            client,
            setup_refrigerator_environment,
            self.KPI,
            auth_headers_refrigerator,
        )
        assert entry is not None
        assert entry["min"] == 2.5
        assert entry["max"] == 7.5


class TestRefrigeratorResourceResolution:
    """Resource-scoping checks for the refrigerator KPI list endpoint.

    Verifies the list endpoint resolves the refrigerator within the caller's
    hospital, returns 404 for unknown or cross-hospital IDs, returns an empty
    config list for a refrigerator with no KPIs, and never leaks one
    refrigerator's configs into another's list.
    """

    KPI  = "temp_external"
    UNIT = "°C"

    def test_nonexistent_refrigerator_returns_404(
        self, client, setup_refrigerator_environment, auth_headers_refrigerator
    ):
        """An unknown refrigerator_id returns 404 from the list endpoint."""
        missing_id = setup_refrigerator_environment["refrigerator_id"] + 999_999
        resp = client.get(
            KPI_GET_LIST_URL,
            params={"refrigerator_id": missing_id},
            headers=auth_headers_refrigerator,
        )
        assert resp.status_code == 404

    def test_refrigerator_in_other_hospital_returns_404(
        self, client, setup_refrigerator_environment, auth_headers_refrigerator
    ):
        """A refrigerator owned by another hospital is invisible (404).

        The list endpoint filters by the caller's hospital_id, so a device in
        a different hospital must not resolve even though its id is valid.
        """
        db = setup_refrigerator_environment["db"]
        other_hospital = Hospital(hospital_name="Other Fridge Hospital")
        db.add(other_hospital)
        db.commit()
        db.refresh(other_hospital)
        other_branch = HospitalBranch(
            hospital_id=other_hospital.hospital_id,
            branch_name="Other Fridge Branch",
        )
        db.add(other_branch)
        db.commit()
        db.refresh(other_branch)
        other_fridge = make_refrigerator(
            db, other_hospital.hospital_id, other_branch.branch_id
        )
        try:
            resp = client.get(
                KPI_GET_LIST_URL,
                params={"refrigerator_id": other_fridge.refrigerator_id},
                headers=auth_headers_refrigerator,
            )
            assert resp.status_code == 404
        finally:
            delete_refrigerator(db, other_fridge.refrigerator_id)
            db.delete(other_branch)
            db.commit()
            db.delete(other_hospital)
            db.commit()

    def test_post_mismatched_branch_returns_403(
        self, client, setup_refrigerator_environment
    ):
        """A branch-scoped User creating a config for another branch is rejected.

        Branch scoping only applies to the User role (Admins see all branches),
        so this seeds a User in the caller's branch and POSTs with a foreign
        branch_id, expecting a 403 before any write.
        """
        env = setup_refrigerator_environment
        db = env["db"]
        scoped_user = User(
            user_id=str(uuid.uuid4()),
            email=f"{uuid.uuid4()}@test.com",
            password_hash=get_password_hash("Scuba123!"),
            first_name="Branch",
            last_name="Scoped",
            role="User",
            status=True,
            approved_status="approved",
            hospital_id=env["hospital_id"],
            branch_id=env["branch_id"],
            department="IVF",
        )
        db.add(scoped_user)
        db.commit()
        db.refresh(scoped_user)

        token = create_access_token(data={
            "sub":         str(scoped_user.user_id),
            "id":          str(scoped_user.user_id),
            "user_id":     str(scoped_user.user_id),
            "email":       scoped_user.email,
            "role":        "User",
            "user_role":   "User",
            "type":        "hospital_user",
            "user_type":   "hospital_user",
            "hospital_id": str(env["hospital_id"]),
            "branch_id":   str(env["branch_id"]),
            "department":  "IVF",
            "token_type":  "access",
            "identity":    str(scoped_user.user_id),
            "exp": datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=1),
            "iat": datetime.datetime.now(datetime.timezone.utc),
        })

        foreign_branch_id = env["branch_id"] + 999_999
        try:
            resp = client.post(
                KPI_POST_URL,
                json={
                    "hospital_id":     env["hospital_id"],
                    "branch_id":       foreign_branch_id,
                    "refrigerator_id": env["refrigerator_id"],
                    "kpi_name":        self.KPI,
                    "alert_name":      "Temp Alert",
                    "unit":            self.UNIT,
                    "min":             2,
                    "max":             8,
                },
                headers={"Authorization": f"Bearer {token}"},
            )
            assert resp.status_code == 403
        finally:
            from app.models.otp_model import OTP
            db.query(OTP).filter(OTP.user_id == scoped_user.user_id).delete()
            db.commit()
            db.delete(scoped_user)
            db.commit()

    def test_list_with_no_configs_returns_empty(
        self, client, setup_refrigerator_environment, auth_headers_refrigerator
    ):
        """A freshly seeded refrigerator with no KPIs returns 200 + empty list."""
        resp = client.get(
            KPI_GET_LIST_URL,
            params={"refrigerator_id": setup_refrigerator_environment["refrigerator_id"]},
            headers=auth_headers_refrigerator,
        )
        assert resp.status_code == 200
        assert resp.json().get("config", []) == []

    def test_configs_do_not_leak_between_refrigerators(
        self,
        client,
        setup_refrigerator_environment,
        post_refrigerator_kpi_config,
        auth_headers_refrigerator,
    ):
        """A config saved on one refrigerator never appears in another's list.

        Arrange: Save a KPI on the seeded refrigerator and create a second
        empty refrigerator in the same branch.
        Act: List configs for the second refrigerator.
        Assert: The second list is empty while the first contains the config.
        """
        save = post_refrigerator_kpi_config({
            "kpi_name":   self.KPI,
            "alert_name": "Temp Alert",
            "unit":       self.UNIT,
            "min":        2,
            "max":        8,
        })
        assert save.status_code == 201

        db = setup_refrigerator_environment["db"]
        second_fridge = make_refrigerator(
            db,
            setup_refrigerator_environment["hospital_id"],
            setup_refrigerator_environment["branch_id"],
        )
        try:
            resp = client.get(
                KPI_GET_LIST_URL,
                params={"refrigerator_id": second_fridge.refrigerator_id},
                headers=auth_headers_refrigerator,
            )
            assert resp.status_code == 200
            assert resp.json().get("config", []) == []

            first = get_config_by_refrigerator_kpi(
                client,
                setup_refrigerator_environment,
                self.KPI,
                auth_headers_refrigerator,
            )
            assert first is not None
        finally:
            delete_refrigerator(db, second_fridge.refrigerator_id)


class TestRefrigeratorKpiUpsert:
    """Update behavior for refrigerator KPI configs.

    In-place changes go through the PUT endpoint, which mutates the existing
    row rather than adding a new one. This test pins that behavior.
    """

    KPI  = "temp_external"
    UNIT = "°C"

    def test_put_updates_existing_config_in_place(
        self,
        client,
        setup_refrigerator_environment,
        post_refrigerator_kpi_config,
        auth_headers_refrigerator,
    ):
        """Updating a config via PUT changes its values without adding a row.

        Arrange: Create a config and capture its id.
        Act: PUT new min/max for that id, then read the list back.
        Assert: The same id now reports the new values and remains unique.
        """
        created = post_refrigerator_kpi_config({
            "kpi_name":   self.KPI,
            "alert_name": "Temp Alert",
            "unit":       self.UNIT,
            "min":        2,
            "max":        8,
        })
        assert created.status_code == 201
        config_id = created.json()["id"]

        put = client.put(
            f"{KPI_POST_URL}/{config_id}",
            json={"min": 4, "max": 6},
            headers=auth_headers_refrigerator,
        )
        assert put.status_code == 200
        assert put.json()["min"] == 4
        assert put.json()["max"] == 6

        resp = client.get(
            KPI_GET_LIST_URL,
            params={"refrigerator_id": setup_refrigerator_environment["refrigerator_id"]},
            headers=auth_headers_refrigerator,
        )
        matching = [c for c in resp.json()["config"] if c["id"] == config_id]
        assert len(matching) == 1
        assert matching[0]["min"] == 4
        assert matching[0]["max"] == 6


class TestRefrigeratorAlertIntegration:
    """End-to-end alert pipeline for a refrigerator zone.

    These exercise the same path the live ingestion stack drives, but in-process:
    a critical KPI threshold is configured via the API, a deviating reading (the
    row ingestion writes after scoring a telemetry payload) is inserted, and the
    deviation checker is run. We assert a critical_alerts row is created and the
    alert email is dispatched. The SMTP send itself is mocked — the reference
    suite (tests/app/integration/test_alert_ingestion.py) asserts against a live
    smtp4dev inbox + ingestion webhook, which are external services not available
    in unit runs; here we assert the service reaches the email-dispatch call.
    """

    KPI  = "temp_external"
    UNIT = "°C"

    def _configure_critical_kpi(self, post_refrigerator_kpi_config) -> int:
        """Create a critical zone-temperature config (range 2–8°C) and return its id."""
        resp = post_refrigerator_kpi_config({
            "kpi_name":   self.KPI,
            "alert_name": "Zone Temp Critical",
            "unit":       self.UNIT,
            "min":        2,
            "max":        8,
            "alert_type": "critical",
            "cooldown_minutes": 60,
        })
        assert resp.status_code == 201
        return resp.json()["id"]

    def test_deviation_creates_critical_alert_and_sends_email(
        self, setup_refrigerator_environment, post_refrigerator_kpi_config
    ):
        """A breaching reading creates a critical alert and triggers the email.

        Arrange: Configure a critical zone-temp KPI (2–8°C) and insert a reading
        of 15°C (above max) flagged as a deviation.
        Act: Run the refrigerator deviation checker with the email send mocked.
        Assert: A critical_alerts row exists for the refrigerator and the alert
        email dispatch was invoked once.
        """
        env = setup_refrigerator_environment
        db = env["db"]
        kpi_config_id = self._configure_critical_kpi(post_refrigerator_kpi_config)
        insert_deviation_reading(db, env, kpi_config_id, kpi_value=15.0)

        try:
            with patch.object(CriticalAlertService, "_send_alert_email") as mock_email:
                created = CriticalAlertService(db).check_and_create_alert_for_refrigerator_kpi_deviations(
                    refrigerator_id=env["refrigerator_id"],
                    zone_id="zone_1",
                )

            assert len(created) >= 1
            alert_count = db.query(CriticalAlert).filter(
                CriticalAlert.refrigerator_id == env["refrigerator_id"],
                CriticalAlert.alert_type == AlertType.DEVIATION_ALERT.value,
            ).count()
            assert alert_count == 1
            assert mock_email.call_count == 1
        finally:
            clear_refrigerator_alerts(db, env["refrigerator_id"])

    def test_reading_within_range_creates_no_alert_or_email(
        self, setup_refrigerator_environment, post_refrigerator_kpi_config
    ):
        """A non-deviating reading produces no alert and no email.

        Arrange: Configure the same critical KPI and insert a 5°C reading inside
        the 2–8°C range with deviation=False.
        Act: Run the deviation checker with the email send mocked.
        Assert: No critical_alerts row is created and no email is dispatched.
        """
        env = setup_refrigerator_environment
        db = env["db"]
        kpi_config_id = self._configure_critical_kpi(post_refrigerator_kpi_config)
        insert_deviation_reading(db, env, kpi_config_id, kpi_value=5.0, deviation=False)

        try:
            with patch.object(CriticalAlertService, "_send_alert_email") as mock_email:
                created = CriticalAlertService(db).check_and_create_alert_for_refrigerator_kpi_deviations(
                    refrigerator_id=env["refrigerator_id"],
                    zone_id="zone_1",
                )

            assert created == []
            alert_count = db.query(CriticalAlert).filter(
                CriticalAlert.refrigerator_id == env["refrigerator_id"]
            ).count()
            assert alert_count == 0
            assert mock_email.call_count == 0
        finally:
            clear_refrigerator_alerts(db, env["refrigerator_id"])

    def test_second_deviation_within_cooldown_creates_no_new_alert(
        self, setup_refrigerator_environment, post_refrigerator_kpi_config
    ):
        """A second deviation inside the cooldown window does not re-alert.

        Arrange: Configure a critical KPI with a 60-minute cooldown and fire one
        deviation that creates an alert + email.
        Act: Insert a second deviation and run the checker again immediately.
        Assert: Still exactly one alert exists and no second email is sent.
        """
        env = setup_refrigerator_environment
        db = env["db"]
        kpi_config_id = self._configure_critical_kpi(post_refrigerator_kpi_config)

        try:
            with patch.object(CriticalAlertService, "_send_alert_email") as mock_email:
                insert_deviation_reading(db, env, kpi_config_id, kpi_value=15.0)
                CriticalAlertService(db).check_and_create_alert_for_refrigerator_kpi_deviations(
                    refrigerator_id=env["refrigerator_id"],
                    zone_id="zone_1",
                )
                first_count = db.query(CriticalAlert).filter(
                    CriticalAlert.refrigerator_id == env["refrigerator_id"]
                ).count()
                assert first_count == 1
                assert mock_email.call_count == 1

                insert_deviation_reading(
                    db, env, kpi_config_id, kpi_value=16.0,
                    timestamp=datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(seconds=1),
                )
                CriticalAlertService(db).check_and_create_alert_for_refrigerator_kpi_deviations(
                    refrigerator_id=env["refrigerator_id"],
                    zone_id="zone_1",
                )

            second_count = db.query(CriticalAlert).filter(
                CriticalAlert.refrigerator_id == env["refrigerator_id"]
            ).count()
            assert second_count == 1
            assert mock_email.call_count == 1
        finally:
            clear_refrigerator_alerts(db, env["refrigerator_id"])
