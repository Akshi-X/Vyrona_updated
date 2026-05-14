"""
Unit tests for LN2 Readings Controller
"""
import pytest
from unittest.mock import MagicMock, Mock
from fastapi import FastAPI
from fastapi.testclient import TestClient
from datetime import datetime, timezone

from app.controller.IVF import ln2_readings_controller
from app.config import database
from app.dependencies import auth_dependencies


@pytest.fixture
def mock_user():
    user = Mock()
    user.user_id = "USER-123"
    user.email = "test@example.com"
    return user


@pytest.fixture
def mock_reading():
    ts = datetime.now(timezone.utc)
    r = Mock()
    r.id = 1
    r.device_id = 1
    r.tank_id = None
    r.reading_timestamp = ts
    r.timestamp = ts
    r.evaporation_rate_kg_per_h = 0.05
    r.ln2_mass_kg = 12.5
    r.raw_weight_kg = None
    r.ln2_level_pct = None
    r.ln2_volume_l = None
    r.sensor_status = None
    r.lid_state = None
    r.refill_detected = None
    r.quality_status = None
    r.created_at = ts
    r.updated_at = None
    return r


@pytest.fixture
def app():
    app = FastAPI()
    app.include_router(ln2_readings_controller.router)
    return app


def override_get_db():
    yield MagicMock()


def test_create_ln2_reading_success(app, mock_user, mock_reading, monkeypatch):
    monkeypatch.setattr(ln2_readings_controller, "create_ln2_reading", lambda db, data: mock_reading)
    app.dependency_overrides[database.get_db] = override_get_db
    app.dependency_overrides[auth_dependencies.get_current_user] = lambda: mock_user

    client = TestClient(app)
    response = client.post(
        "/ln2-readings",
        json={
            "device_id": 1,
            "evaporation_rate_kg_per_h": 0.05,
            "ln2_mass_kg": 12.5,
            "reading_timestamp": datetime.now(timezone.utc).isoformat(),
        },
    )
    assert response.status_code == 201
    app.dependency_overrides.clear()


def test_get_ln2_reading_success(app, mock_user, mock_reading, monkeypatch):
    monkeypatch.setattr(ln2_readings_controller, "get_ln2_reading_by_id", lambda db, id: mock_reading)
    app.dependency_overrides[database.get_db] = override_get_db
    app.dependency_overrides[auth_dependencies.get_current_user] = lambda: mock_user

    client = TestClient(app)
    response = client.get("/ln2-readings/1")
    assert response.status_code == 200
    app.dependency_overrides.clear()


def test_get_ln2_reading_not_found(app, mock_user, monkeypatch):
    monkeypatch.setattr(ln2_readings_controller, "get_ln2_reading_by_id", lambda db, id: None)
    app.dependency_overrides[database.get_db] = override_get_db
    app.dependency_overrides[auth_dependencies.get_current_user] = lambda: mock_user

    client = TestClient(app)
    response = client.get("/ln2-readings/999")
    assert response.status_code == 404
    app.dependency_overrides.clear()


def test_list_ln2_readings_success(app, mock_user, mock_reading, monkeypatch):
    monkeypatch.setattr(ln2_readings_controller, "get_ln2_readings", lambda db, **kw: ([mock_reading], 1))
    app.dependency_overrides[database.get_db] = override_get_db
    app.dependency_overrides[auth_dependencies.get_current_user] = lambda: mock_user

    client = TestClient(app)
    response = client.get("/ln2-readings")
    assert response.status_code == 200
    assert response.json()["count"] == 1
    app.dependency_overrides.clear()


def test_delete_ln2_reading_success(app, mock_user, monkeypatch):
    monkeypatch.setattr(ln2_readings_controller, "delete_ln2_reading", lambda db, id: True)
    app.dependency_overrides[database.get_db] = override_get_db
    app.dependency_overrides[auth_dependencies.get_current_user] = lambda: mock_user

    client = TestClient(app)
    response = client.delete("/ln2-readings/1")
    assert response.status_code == 204
    app.dependency_overrides.clear()
