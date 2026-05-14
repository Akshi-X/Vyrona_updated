"""Tests for the HMS patient-cryolock endpoint.

Auth runs at the middleware layer in production; in this test app we install only
the router and inject `request.state.current_user` via a tiny middleware shim.
"""

from unittest.mock import MagicMock, Mock

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from app.controller.external import hms_controller


def _make_app(*, role: str = "Admin", hospital_id=7):
    app = FastAPI()

    @app.middleware("http")
    async def inject_auth_state(request: Request, call_next):
        user = Mock()
        user.role = Mock()
        user.role.value = role
        user.user_id = "USR-000001"
        user.email = "admin@example.com"
        user.first_name = "Test"
        user.last_name = "Admin"
        user.hospital_id = hospital_id
        user.branch_id = None
        request.state.current_user = user
        request.state.hospital_id = hospital_id
        return await call_next(request)

    app.include_router(hms_controller.router)

    def override_db():
        yield MagicMock()

    app.dependency_overrides[hms_controller.get_db] = override_db
    return app


@pytest.fixture
def admin_app():
    return _make_app(role="Admin", hospital_id=7)


@pytest.fixture
def admin_client(admin_app):
    return TestClient(admin_app)


VALID_PAYLOAD = {
    "hisNumber": "HIS1234",
    "siteName": "Tambaram",
    "cryolockNumber": "T2/C5/E1/3",
    "canisterNumber": "C5",
    "tankID": "582",
    "caneID": "1001",
    "dateofVitrification": "2023-03-11",
}


def test_single_record_success(admin_app, admin_client, monkeypatch):
    """One valid record → 200, accepted=1, updated=1."""
    mock_service = MagicMock()
    mock_service.apply_cryolock_update.return_value = {
        "status": "success",
        "operation": "update",
        "patient_crylock_id": 42,
        "tank_id": 56,
        "branch_id": 7,
        "reason": None,
    }
    monkeypatch.setattr(
        hms_controller,
        "HMSIntegrationService",
        MagicMock(return_value=mock_service),
    )

    resp = admin_client.post("/external/hms/patient-cryolock", json=VALID_PAYLOAD)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["accepted"] == 1
    assert body["updated"] == 1
    assert body["created"] == 0
    assert body["failed"] == 0
    assert body["results"][0]["status"] == "success"
    assert body["results"][0]["operation"] == "update"
    assert body["results"][0]["patient_crylock_id"] == 42

    # Service was called once with the expected hospital_id (taken from request.state)
    assert mock_service.apply_cryolock_update.call_count == 1
    args, kwargs = mock_service.apply_cryolock_update.call_args
    # apply_cryolock_update(payload, hospital_id, actor_user)
    assert args[1] == 7
    assert args[2].user_id == "USR-000001"


def test_batch_with_mixed_outcomes(admin_app, admin_client, monkeypatch):
    """Batch with one success + one skipped + one failed → counters reflect each."""
    outcomes = [
        {"status": "success", "operation": "create", "patient_crylock_id": 1, "tank_id": 1, "branch_id": 1, "reason": None},
        {"status": "skipped", "operation": None, "patient_crylock_id": None, "tank_id": None, "branch_id": None, "reason": "non-numeric position"},
        {"status": "failed", "operation": None, "patient_crylock_id": None, "tank_id": None, "branch_id": None, "reason": "boom"},
    ]
    mock_service = MagicMock()
    mock_service.apply_cryolock_update.side_effect = outcomes
    monkeypatch.setattr(
        hms_controller,
        "HMSIntegrationService",
        MagicMock(return_value=mock_service),
    )

    resp = admin_client.post(
        "/external/hms/patient-cryolock",
        json=[VALID_PAYLOAD, VALID_PAYLOAD, VALID_PAYLOAD],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["accepted"] == 3
    assert body["created"] == 1
    assert body["skipped"] == 1
    assert body["failed"] == 1
    assert [r["status"] for r in body["results"]] == ["success", "skipped", "failed"]


def test_non_admin_role_rejected(monkeypatch):
    """A Manager/User reaching this endpoint (e.g., RBAC bypassed) → 403 from defensive check."""
    app = _make_app(role="Manager", hospital_id=7)
    client = TestClient(app)
    resp = client.post("/external/hms/patient-cryolock", json=VALID_PAYLOAD)
    assert resp.status_code == 403


def test_missing_hospital_id_rejected():
    """Admin without hospital_id in token state → 400."""
    app = _make_app(role="Admin", hospital_id=None)
    client = TestClient(app)
    resp = client.post("/external/hms/patient-cryolock", json=VALID_PAYLOAD)
    assert resp.status_code == 400


def test_empty_array_rejected(admin_app, admin_client):
    resp = admin_client.post("/external/hms/patient-cryolock", json=[])
    assert resp.status_code == 400


def test_move_operation(admin_app, admin_client, monkeypatch):
    """oldCryolockNumber present and different → operation=move, old_patient_crylock_id populated."""
    mock_service = MagicMock()
    mock_service.apply_cryolock_update.return_value = {
        "status": "success",
        "operation": "move",
        "patient_crylock_id": 99,
        "old_patient_crylock_id": 42,
        "tank_id": 56,
        "branch_id": 7,
        "reason": None,
    }
    monkeypatch.setattr(
        hms_controller,
        "HMSIntegrationService",
        MagicMock(return_value=mock_service),
    )

    move_payload = {**VALID_PAYLOAD, "oldCryolockNumber": "T1/C5/E1/3"}
    resp = admin_client.post("/external/hms/patient-cryolock", json=move_payload)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["moved"] == 1
    assert body["created"] == 0
    assert body["updated"] == 0
    r = body["results"][0]
    assert r["operation"] == "move"
    assert r["patient_crylock_id"] == 99
    assert r["old_patient_crylock_id"] == 42


def test_move_same_cryolock_number_treated_as_upsert(admin_app, admin_client, monkeypatch):
    """oldCryolockNumber == cryolockNumber → move branch skipped, normal upsert runs."""
    mock_service = MagicMock()
    mock_service.apply_cryolock_update.return_value = {
        "status": "success",
        "operation": "noop",
        "patient_crylock_id": 42,
        "old_patient_crylock_id": None,
        "tank_id": 56,
        "branch_id": 7,
        "reason": None,
    }
    monkeypatch.setattr(
        hms_controller,
        "HMSIntegrationService",
        MagicMock(return_value=mock_service),
    )

    # Same value in both fields — must not be treated as a move
    same_payload = {**VALID_PAYLOAD, "oldCryolockNumber": VALID_PAYLOAD["cryolockNumber"]}
    resp = admin_client.post("/external/hms/patient-cryolock", json=same_payload)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["moved"] == 0
    assert body["noop"] == 1
