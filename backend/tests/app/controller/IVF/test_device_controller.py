"""
Unit tests for Device Controller
"""
import pytest
from unittest.mock import MagicMock, Mock
from fastapi import FastAPI
from fastapi.testclient import TestClient
from datetime import datetime, timezone

from app.controller.IVF import device_controller
from app.config import database
from app.dependencies import auth_dependencies


@pytest.fixture
def mock_user():
    user = Mock()
    user.user_id = "USER-123"
    user.email = "test@example.com"
    return user


@pytest.fixture
def mock_device():
    device = Mock()
    device.id = 1
    device.branch_id = 1
    device.device_code = "J712149"
    device.created_at = datetime.now(timezone.utc)
    device.updated_at = None
    return device


@pytest.fixture
def app():
    app = FastAPI()
    app.include_router(device_controller.router)
    return app


def override_get_db():
    yield MagicMock()


def test_create_device_success(app, mock_user, mock_device, monkeypatch):
    """Test POST /devices creates device"""
    monkeypatch.setattr(device_controller, "create_device", lambda db, data: mock_device)
    app.dependency_overrides[database.get_db] = override_get_db
    app.dependency_overrides[auth_dependencies.get_current_user] = lambda: mock_user

    client = TestClient(app)
    response = client.post("/devices", json={"branch_id": 1, "device_code": "J712149"})

    assert response.status_code == 201
    data = response.json()
    assert data["id"] == 1
    assert data["branch_id"] == 1
    assert data["device_code"] == "J712149"

    app.dependency_overrides.clear()


def test_get_device_success(app, mock_user, mock_device, monkeypatch):
    """Test GET /devices/{id} returns device"""
    monkeypatch.setattr(device_controller, "get_device_by_id", lambda db, id: mock_device)
    app.dependency_overrides[database.get_db] = override_get_db
    app.dependency_overrides[auth_dependencies.get_current_user] = lambda: mock_user

    client = TestClient(app)
    response = client.get("/devices/1")

    assert response.status_code == 200
    assert response.json()["id"] == 1

    app.dependency_overrides.clear()


def test_get_device_not_found(app, mock_user, monkeypatch):
    """Test GET /devices/{id} returns 404 when not found"""
    monkeypatch.setattr(device_controller, "get_device_by_id", lambda db, id: None)
    app.dependency_overrides[database.get_db] = override_get_db
    app.dependency_overrides[auth_dependencies.get_current_user] = lambda: mock_user

    client = TestClient(app)
    response = client.get("/devices/999")

    assert response.status_code == 404

    app.dependency_overrides.clear()


def test_list_devices_success(app, mock_user, mock_device, monkeypatch):
    """Test GET /devices returns list"""
    monkeypatch.setattr(device_controller, "get_devices", lambda db, **kw: ([mock_device], 1))
    app.dependency_overrides[database.get_db] = override_get_db
    app.dependency_overrides[auth_dependencies.get_current_user] = lambda: mock_user

    client = TestClient(app)
    response = client.get("/devices")

    assert response.status_code == 200
    data = response.json()
    assert "devices" in data
    assert data["count"] == 1

    app.dependency_overrides.clear()


def test_update_device_success(app, mock_user, mock_device, monkeypatch):
    """Test PATCH /devices/{id} updates device"""
    monkeypatch.setattr(device_controller, "update_device", lambda db, id, data: mock_device)
    app.dependency_overrides[database.get_db] = override_get_db
    app.dependency_overrides[auth_dependencies.get_current_user] = lambda: mock_user

    client = TestClient(app)
    response = client.patch("/devices/1", json={"device_code": "UPDATED"})

    assert response.status_code == 200

    app.dependency_overrides.clear()


def test_delete_device_success(app, mock_user, monkeypatch):
    """Test DELETE /devices/{id} returns 204"""
    monkeypatch.setattr(device_controller, "delete_device", lambda db, id: True)
    app.dependency_overrides[database.get_db] = override_get_db
    app.dependency_overrides[auth_dependencies.get_current_user] = lambda: mock_user

    client = TestClient(app)
    response = client.delete("/devices/1")

    assert response.status_code == 204

    app.dependency_overrides.clear()


def test_delete_device_not_found(app, mock_user, monkeypatch):
    """Test DELETE /devices/{id} returns 404 when not found"""
    monkeypatch.setattr(device_controller, "delete_device", lambda db, id: False)
    app.dependency_overrides[database.get_db] = override_get_db
    app.dependency_overrides[auth_dependencies.get_current_user] = lambda: mock_user

    client = TestClient(app)
    response = client.delete("/devices/999")

    assert response.status_code == 404

    app.dependency_overrides.clear()
