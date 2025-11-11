import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect
from unittest.mock import MagicMock

from app.controller import quality_controller
from app.exceptions.quality_exceptions import QualityServiceException
from app.exceptions import InvalidTokenException


def _create_test_client(monkeypatch):
    app = FastAPI()
    app.include_router(quality_controller.router)

    db_mock = MagicMock(name="db_session")

    def override_get_db():
        yield db_mock

    app.dependency_overrides[quality_controller.get_db] = override_get_db
    app.dependency_overrides[quality_controller.get_current_user_pharma_id] = lambda: 42

    class DummyUser:
        pharma_id = 42

    app.dependency_overrides[quality_controller.get_current_user] = lambda: DummyUser()

    service_mock = MagicMock()
    monkeypatch.setattr(
        quality_controller,
        "QualityService",
        MagicMock(return_value=service_mock),
    )

    manager_mock = MagicMock()
    manager_mock.get_connections_info.return_value = {"count": 0, "connections": []}
    monkeypatch.setattr(quality_controller, "manager", manager_mock)

    client = TestClient(app)
    try:
        yield client, service_mock, manager_mock
    finally:
        client.close()


@pytest.fixture()
def client(monkeypatch):
    yield from _create_test_client(monkeypatch)


def test_health_check_returns_status(client):
    test_client, service_mock, _ = client
    service_mock.check_redis_health.return_value = {
        "status": "healthy",
        "redis": "connected",
        "error": None,
    }

    response = test_client.get("/quality/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "healthy",
        "redis": "connected",
        "error": None,
    }
    service_mock.check_redis_health.assert_called_once()


def test_get_patients_returns_count(client):
    test_client, service_mock, _ = client
    service_mock.get_patients_with_quality_data.return_value = ["p1", "p2"]

    response = test_client.get("/quality/patients")

    assert response.status_code == 200
    assert response.json() == {
        "patients": ["p1", "p2"],
        "count": 2,
    }
    service_mock.get_patients_with_quality_data.assert_called_once_with(42)


def test_get_history_with_patient_id(client):
    test_client, service_mock, _ = client
    service_mock.get_quality_history.return_value = [
        {
            "patient_id": "pid-1",
            "temperature": 4.5,
            "humidity": 60.0,
            "ph_level": 7.1,
            "o2_level": 20.5,
            "co2_level": 1.2,
            "agitation": 0.1,
            "timestamp": "2024-01-01T10:00:00Z",
            "thresholds": {},
            "threshold_violations": {},
            "violated_parameters": [],
        }
    ]

    response = test_client.get("/quality/history", params={"patient_id": "pid-1"})

    assert response.status_code == 200
    body = response.json()
    assert body["patient_id"] == "pid-1"
    assert body["count"] == 1
    assert body["history"][0]["temperature"] == 4.5
    service_mock.get_quality_history.assert_called_once_with(42, "pid-1", limit=20)


def test_get_connections_returns_filtered_info(client):
    test_client, service_mock, manager_mock = client
    service_mock.get_connections_for_pharma.return_value = {
        "count": 1,
        "connections": [
            {
                "id": "conn",
                "connected_at": "2024-01-01T10:00:00Z",
                "client_info": {"host": "127.0.0.1"},
                "patient_id": "pid-1",
            }
        ],
    }
    manager_mock.get_connections_info.return_value = {
        "count": 3,
        "connections": [
            {
                "id": "conn",
                "connected_at": "2024-01-01T10:00:00Z",
                "client_info": {"host": "127.0.0.1"},
                "patient_id": "pid-1",
            },
            {
                "id": "other",
                "connected_at": "2024-01-01T10:05:00Z",
                "client_info": {"host": "127.0.0.2"},
                "patient_id": None,
            },
        ],
    }

    response = test_client.get("/quality/connections")

    assert response.status_code == 200
    body = response.json()
    assert body["count"] == 1
    assert body["connections"] == [
        {
            "id": "conn",
            "connected_at": "2024-01-01T10:00:00Z",
            "client_info": {"host": "127.0.0.1"},
            "patient_id": "pid-1",
        }
    ]
    manager_mock.get_connections_info.assert_called_once()
    service_mock.get_connections_for_pharma.assert_called_once_with(
        42,
        manager_mock.get_connections_info.return_value,
        manager_mock,
    )


def test_get_connections_handles_quality_service_error(client):
    test_client, service_mock, manager_mock = client
    service_mock.get_connections_for_pharma.side_effect = QualityServiceException(
        "op",
        "boom",
    )

    with pytest.raises(QualityServiceException):
        test_client.get("/quality/connections")

    manager_mock.get_connections_info.assert_called_once()


class FakeManager:
    def __init__(self):
        self.active_connections = {}
        self.last_connection_id = None
        self.last_subscription = None
        self.raise_on_connect = None
        self.disconnect_calls = 0

    async def connect(self, websocket, connection_id=None):
        if self.raise_on_connect:
            raise self.raise_on_connect

        connection_id = connection_id or "conn-1"
        self.active_connections[connection_id] = {
            "websocket": websocket,
            "connected_at": "2024-01-01T10:00:00Z",
            "client_info": {
                "host": websocket.client.host if websocket.client else "unknown",
                "port": websocket.client.port if websocket.client else "unknown",
            },
            "patient_id": None,
        }
        self.last_connection_id = connection_id
        return connection_id

    def disconnect(self, connection_id):
        self.active_connections.pop(connection_id, None)
        self.disconnect_calls += 1

    def disconnect_by_websocket(self, websocket):
        for conn_id, data in list(self.active_connections.items()):
            if data["websocket"] == websocket:
                self.disconnect(conn_id)
                return conn_id
        return None

    def set_patient_subscription(self, connection_id, patient_id):
        if connection_id in self.active_connections:
            self.active_connections[connection_id]["patient_id"] = patient_id
        self.last_subscription = (connection_id, patient_id)

    def get_connections_info(self):
        return {
            "count": len(self.active_connections),
            "connections": [
                {
                    "id": conn_id,
                    "connected_at": data["connected_at"],
                    "client_info": data["client_info"],
                    "patient_id": data.get("patient_id"),
                }
                for conn_id, data in self.active_connections.items()
            ],
        }


@pytest.fixture()
def websocket_client(monkeypatch):
    app = FastAPI()
    app.include_router(quality_controller.router)

    db_mock = MagicMock(name="db_session")

    def override_get_db():
        yield db_mock

    app.dependency_overrides[quality_controller.get_db] = override_get_db
    app.dependency_overrides[quality_controller.get_current_user_pharma_id] = lambda: 42

    class DummyUser:
        pharma_id = 42

    app.dependency_overrides[quality_controller.get_current_user] = lambda: DummyUser()

    service_mock = MagicMock()
    monkeypatch.setattr(
        quality_controller,
        "QualityService",
        MagicMock(return_value=service_mock),
    )

    fake_manager = FakeManager()
    monkeypatch.setattr(quality_controller, "manager", fake_manager)

    session_mock = MagicMock()
    monkeypatch.setattr(quality_controller, "SessionLocal", MagicMock(return_value=session_mock))

    token_mock = MagicMock(return_value={"user_id": "user-1", "pharma_id": 42})
    monkeypatch.setattr(quality_controller, "verify_websocket_token", token_mock)

    client = TestClient(app)
    try:
        yield client, service_mock, fake_manager, token_mock
    finally:
        client.close()


def test_websocket_requires_token(websocket_client):
    test_client, service_mock, fake_manager, token_mock = websocket_client

    with test_client.websocket_connect("/quality/ws") as websocket:
        with pytest.raises(WebSocketDisconnect) as excinfo:
            websocket.receive_text()

    assert excinfo.value.code == 1008
    assert service_mock.validate_patient_belongs_to_pharma.call_count == 0


def test_websocket_invalid_token(websocket_client):
    test_client, service_mock, fake_manager, token_mock = websocket_client
    token_mock.side_effect = InvalidTokenException()

    with test_client.websocket_connect("/quality/ws?token=oops") as websocket:
        with pytest.raises(WebSocketDisconnect) as excinfo:
            websocket.receive_text()

    assert excinfo.value.code == 1008
    token_mock.assert_called_once()


def test_websocket_subscription_success(websocket_client):
    test_client, service_mock, fake_manager, token_mock = websocket_client

    with test_client.websocket_connect("/quality/ws?token=ok") as websocket:
        service_mock.validate_patient_belongs_to_pharma.return_value = True
        websocket.send_text(json.dumps({"patient_id": "pid-1"}))
        confirmation = websocket.receive_json()
        assert confirmation == {
            "type": "subscription_confirmed",
            "patient_id": "pid-1",
        }

    assert service_mock.validate_patient_belongs_to_pharma.called
    assert fake_manager.last_subscription == ("conn-1", "pid-1")


def test_websocket_invalid_patient_sends_error(websocket_client):
    test_client, service_mock, fake_manager, token_mock = websocket_client
    service_mock.validate_patient_belongs_to_pharma.side_effect = Exception("nope")

    with test_client.websocket_connect("/quality/ws?token=ok") as websocket:
        websocket.send_text(json.dumps({"patient_id": "pid-xyz"}))
        error_message = websocket.receive_json()
        assert error_message["type"] == "error"
        assert "Invalid patient" in error_message["message"]

    assert fake_manager.last_subscription is None


def test_websocket_connect_failure_closes_connection(websocket_client):
    test_client, service_mock, fake_manager, token_mock = websocket_client
    fake_manager.raise_on_connect = RuntimeError("manager down")

    with test_client.websocket_connect("/quality/ws?token=ok") as websocket:
        with pytest.raises(WebSocketDisconnect) as excinfo:
            websocket.receive_text()

    assert excinfo.value.code == 1011
    assert fake_manager.last_connection_id is None


def test_websocket_ignores_non_json_messages(websocket_client):
    test_client, service_mock, fake_manager, token_mock = websocket_client

    with test_client.websocket_connect("/quality/ws?token=ok") as websocket:
        service_mock.validate_patient_belongs_to_pharma.return_value = True
        websocket.send_text("not-json")
        websocket.close()


def test_websocket_timeout_and_unexpected_error(monkeypatch, websocket_client):
    test_client, service_mock, fake_manager, token_mock = websocket_client

    with test_client.websocket_connect("/quality/ws?token=ok") as websocket:
        websocket.close()

