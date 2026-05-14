"""
Unit tests for LN2 IoT Device Controller
"""
import pytest
from unittest.mock import MagicMock, Mock
from fastapi import FastAPI
from fastapi.testclient import TestClient
from datetime import datetime, timezone

from app.controller.IVF import ln2_iot_device_controller
from app.config import database
from app.dependencies import auth_dependencies


@pytest.fixture
def mock_user():
    user = Mock()
    user.user_id = "USER-123"
    user.email = "test@example.com"
    return user


@pytest.fixture
def mock_ln2_iot_device():
    d = Mock()
    d.id = 1
    d.tank_id = 1
    d.device_id = 1
    d.tank_max_capacity_reading = 100.0
    d.tank_min_capacity_reading = 10.0
    d.created_at = datetime.now(timezone.utc).isoformat()
    d.updated_at = None
    return d


@pytest.fixture
def app():
    app = FastAPI()
    app.include_router(ln2_iot_device_controller.router)
    return app


def override_get_db():
    yield MagicMock()


def test_create_ln2_iot_device_success(app, mock_user, mock_ln2_iot_device, monkeypatch):
    monkeypatch.setattr(ln2_iot_device_controller, "create_ln2_iot_device", lambda db, data: mock_ln2_iot_device)
    app.dependency_overrides[database.get_db] = override_get_db
    app.dependency_overrides[auth_dependencies.get_current_user] = lambda: mock_user

    client = TestClient(app)
    response = client.post(
        "/ln2-iot-devices",
        json={"tank_id": 1, "device_id": 1, "tank_max_capacity_reading": 100.0},
    )
    assert response.status_code == 201
    app.dependency_overrides.clear()


def test_get_ln2_iot_device_not_found(app, mock_user, monkeypatch):
    monkeypatch.setattr(ln2_iot_device_controller, "get_ln2_iot_device_by_id", lambda db, id: None)
    app.dependency_overrides[database.get_db] = override_get_db
    app.dependency_overrides[auth_dependencies.get_current_user] = lambda: mock_user

    client = TestClient(app)
    response = client.get("/ln2-iot-devices/999")
    assert response.status_code == 404
    app.dependency_overrides.clear()


def test_list_ln2_iot_devices_success(app, mock_user, mock_ln2_iot_device, monkeypatch):
    monkeypatch.setattr(ln2_iot_device_controller, "get_ln2_iot_devices", lambda db, **kw: ([mock_ln2_iot_device], 1))
    app.dependency_overrides[database.get_db] = override_get_db
    app.dependency_overrides[auth_dependencies.get_current_user] = lambda: mock_user

    client = TestClient(app)
    response = client.get("/ln2-iot-devices")
    assert response.status_code == 200
    app.dependency_overrides.clear()


def test_delete_ln2_iot_device_success(app, mock_user, monkeypatch):
    monkeypatch.setattr(ln2_iot_device_controller, "delete_ln2_iot_device", lambda db, id: True)
    app.dependency_overrides[database.get_db] = override_get_db
    app.dependency_overrides[auth_dependencies.get_current_user] = lambda: mock_user

    client = TestClient(app)
    response = client.delete("/ln2-iot-devices/1")
    assert response.status_code == 204
    app.dependency_overrides.clear()
