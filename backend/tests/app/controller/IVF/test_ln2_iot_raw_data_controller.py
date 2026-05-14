"""
Unit tests for LN2 IoT Raw Data Controller
"""
import pytest
from unittest.mock import MagicMock, Mock
from fastapi import FastAPI
from fastapi.testclient import TestClient
from datetime import datetime, timezone

from app.controller.IVF import ln2_iot_raw_data_controller
from app.config import database
from app.dependencies import auth_dependencies


@pytest.fixture
def mock_user():
    user = Mock()
    user.user_id = "USER-123"
    user.email = "test@example.com"
    return user


@pytest.fixture
def mock_raw_data():
    r = Mock()
    r.id = 1
    r.tank_id = 1
    r.device_id = 1
    r.raw_data = 85.5
    r.payload = {"temp": 25.2}
    r.created_at = datetime.now(timezone.utc).isoformat()
    r.updated_at = None
    return r


@pytest.fixture
def app():
    app = FastAPI()
    app.include_router(ln2_iot_raw_data_controller.router)
    return app


def override_get_db():
    yield MagicMock()


def test_create_ln2_iot_raw_data_success(app, mock_user, mock_raw_data, monkeypatch):
    monkeypatch.setattr(ln2_iot_raw_data_controller, "create_ln2_iot_raw_data", lambda db, data: mock_raw_data)
    app.dependency_overrides[database.get_db] = override_get_db
    app.dependency_overrides[auth_dependencies.get_current_user] = lambda: mock_user

    client = TestClient(app)
    response = client.post(
        "/ln2-iot-raw-data",
        json={"tank_id": 1, "device_id": 1, "raw_data": 85.5, "payload": {"temp": 25.2}},
    )
    assert response.status_code == 201
    app.dependency_overrides.clear()


def test_get_ln2_iot_raw_data_not_found(app, mock_user, monkeypatch):
    monkeypatch.setattr(ln2_iot_raw_data_controller, "get_ln2_iot_raw_data_by_id", lambda db, id: None)
    app.dependency_overrides[database.get_db] = override_get_db
    app.dependency_overrides[auth_dependencies.get_current_user] = lambda: mock_user

    client = TestClient(app)
    response = client.get("/ln2-iot-raw-data/999")
    assert response.status_code == 404
    app.dependency_overrides.clear()


def test_list_ln2_iot_raw_data_success(app, mock_user, mock_raw_data, monkeypatch):
    monkeypatch.setattr(
        ln2_iot_raw_data_controller,
        "get_ln2_iot_raw_data_list",
        lambda db, **kw: ([mock_raw_data], 1),
    )
    app.dependency_overrides[database.get_db] = override_get_db
    app.dependency_overrides[auth_dependencies.get_current_user] = lambda: mock_user

    client = TestClient(app)
    response = client.get("/ln2-iot-raw-data")
    assert response.status_code == 200
    app.dependency_overrides.clear()


def test_delete_ln2_iot_raw_data_success(app, mock_user, monkeypatch):
    monkeypatch.setattr(ln2_iot_raw_data_controller, "delete_ln2_iot_raw_data", lambda db, id: True)
    app.dependency_overrides[database.get_db] = override_get_db
    app.dependency_overrides[auth_dependencies.get_current_user] = lambda: mock_user

    client = TestClient(app)
    response = client.delete("/ln2-iot-raw-data/1")
    assert response.status_code == 204
    app.dependency_overrides.clear()
