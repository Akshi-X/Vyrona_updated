"""
Unit tests for Critical Alert Controller
"""
import pytest
from unittest.mock import MagicMock, Mock, patch
from datetime import datetime, timezone
from fastapi import FastAPI
from fastapi.testclient import TestClient
import uuid

from app.controller.IVF import critical_alert_controller
from app.constants.enums import AlertStatus
from app.exceptions.custom_exceptions import AppException
from app.schemas.IVF.critical_alert_schema import (
    AcknowledgeAlertResponse,
    AcknowledgeAlertsResponse,
    HospitalAlertsResponse,
    TankAlertsResponse,
)


@pytest.fixture
def mock_db():
    """Create a mock database session"""
    return MagicMock()


@pytest.fixture
def mock_request():
    """Create a mock request"""
    request = MagicMock()
    request.state.current_user = Mock()
    request.state.current_user.user_id = "USER-123"
    request.state.current_user.department = "IVF"
    return request


@pytest.fixture
def app():
    """Create FastAPI app for testing"""
    app = FastAPI()
    app.include_router(critical_alert_controller.router)
    return app


def override_get_db():
    yield MagicMock()


# ==========================================
# Tests for get_tank_alerts endpoint
# ==========================================

def test_get_tank_alerts_success(app, monkeypatch):
    """Test getting tank alerts successfully"""
    mock_response = TankAlertsResponse(
        tank_id=1,
        tank_code="T1",
        alerts=[],
        total_count=0
    )
    
    mock_service = MagicMock()
    mock_service.get_tank_alerts_by_code.return_value = mock_response
    
    monkeypatch.setattr(
        critical_alert_controller,
        "CriticalAlertService",
        MagicMock(return_value=mock_service)
    )
    
    monkeypatch.setattr(
        critical_alert_controller,
        "get_branch_filter_info",
        lambda x: (None, "Manager") if x else (None, None)
    )
    
    app.dependency_overrides[critical_alert_controller.get_db] = override_get_db
    
    client = TestClient(app)
    response = client.get("/ivf/alerts/tank/T1")
    
    assert response.status_code == 200
    data = response.json()
    assert data["tank_code"] == "T1"
    assert "alerts" in data


def test_get_tank_alerts_not_found(app, monkeypatch):
    """Test getting tank alerts when tank not found"""
    mock_service = MagicMock()
    mock_service.get_tank_alerts_by_code.side_effect = ValueError("Tank not found")
    
    monkeypatch.setattr(
        critical_alert_controller,
        "CriticalAlertService",
        MagicMock(return_value=mock_service)
    )
    
    monkeypatch.setattr(
        critical_alert_controller,
        "get_branch_filter_info",
        lambda x: (None, "Manager")
    )
    
    app.dependency_overrides[critical_alert_controller.get_db] = override_get_db
    
    client = TestClient(app)
    response = client.get("/ivf/alerts/tank/INVALID")
    
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


def test_get_tank_alerts_error(app, monkeypatch):
    """Test getting tank alerts with error"""
    mock_service = MagicMock()
    mock_service.get_tank_alerts_by_code.side_effect = Exception("Database error")
    
    monkeypatch.setattr(
        critical_alert_controller,
        "CriticalAlertService",
        MagicMock(return_value=mock_service)
    )
    
    monkeypatch.setattr(
        critical_alert_controller,
        "get_branch_filter_info",
        lambda x: (None, "Manager")
    )
    
    app.dependency_overrides[critical_alert_controller.get_db] = override_get_db
    
    client = TestClient(app)
    response = client.get("/ivf/alerts/tank/T1")
    
    assert response.status_code == 500
    assert "error" in response.json()["detail"].lower()


# ==========================================
# Tests for get_hospital_alerts endpoint
# ==========================================

def test_get_hospital_alerts_success(app, monkeypatch):
    """Test getting hospital alerts successfully"""
    mock_response = HospitalAlertsResponse(
        alerts=[],
        total_count=0,
        active_count=0,
        acknowledged_count=0
    )
    
    mock_service = MagicMock()
    mock_service.get_hospital_alerts.return_value = mock_response
    
    monkeypatch.setattr(
        critical_alert_controller,
        "CriticalAlertService",
        MagicMock(return_value=mock_service)
    )
    
    monkeypatch.setattr(
        critical_alert_controller,
        "get_branch_filter_info",
        lambda x: (None, "Manager")
    )
    
    app.dependency_overrides[critical_alert_controller.get_db] = override_get_db
    
    client = TestClient(app)
    response = client.get("/ivf/alerts/hospital")
    
    assert response.status_code == 200
    data = response.json()
    assert "alerts" in data
    assert "total_count" in data


def test_get_hospital_alerts_with_status_filter(app, monkeypatch):
    """Test getting hospital alerts with status filter"""
    mock_response = HospitalAlertsResponse(
        alerts=[],
        total_count=0,
        active_count=0,
        acknowledged_count=0
    )
    
    mock_service = MagicMock()
    mock_service.get_hospital_alerts.return_value = mock_response
    
    monkeypatch.setattr(
        critical_alert_controller,
        "CriticalAlertService",
        MagicMock(return_value=mock_service)
    )
    
    monkeypatch.setattr(
        critical_alert_controller,
        "get_branch_filter_info",
        lambda x: (None, "Manager")
    )
    
    app.dependency_overrides[critical_alert_controller.get_db] = override_get_db
    
    client = TestClient(app)
    response = client.get("/ivf/alerts/hospital?status=Active")
    
    assert response.status_code == 200
    data = response.json()
    assert "alerts" in data


# ==========================================
# Tests for acknowledge_alert endpoint
# ==========================================

def test_acknowledge_alert_success(app, monkeypatch, mock_request):
    """Test acknowledging an alert successfully"""
    alert_id = str(uuid.uuid4())
    
    mock_response = AcknowledgeAlertResponse(
        alert_id=alert_id,
        status=AlertStatus.ACKNOWLEDGED,
        message="Alert acknowledged successfully",
        acknowledged_at=datetime.now(timezone.utc)
    )
    
    mock_service = MagicMock()
    mock_service.acknowledge_alert.return_value = mock_response
    
    monkeypatch.setattr(
        critical_alert_controller,
        "CriticalAlertService",
        MagicMock(return_value=mock_service)
    )
    
    app.dependency_overrides[critical_alert_controller.get_db] = override_get_db
    
    # Add middleware to set request state
    @app.middleware("http")
    async def set_request_state(request, call_next):
        request.state.current_user = mock_request.state.current_user
        response = await call_next(request)
        return response
    
    client = TestClient(app)
    response = client.post(
        "/ivf/alerts/acknowledge",
        json={"alert_id": alert_id}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["alert_id"] == alert_id


def test_acknowledge_alerts_success(app, monkeypatch, mock_request):
    """Test acknowledging multiple alerts successfully"""
    alert_ids = [str(uuid.uuid4()), str(uuid.uuid4())]

    mock_response = AcknowledgeAlertsResponse(
        alert_id=alert_ids,
        status=AlertStatus.ACKNOWLEDGED,
        message="Alerts acknowledged successfully",
        acknowledged_count=2,
        acknowledged_at=datetime.now(timezone.utc)
    )

    mock_service = MagicMock()
    mock_service.acknowledge_alerts.return_value = mock_response

    monkeypatch.setattr(
        critical_alert_controller,
        "CriticalAlertService",
        MagicMock(return_value=mock_service)
    )

    app.dependency_overrides[critical_alert_controller.get_db] = override_get_db

    @app.middleware("http")
    async def set_request_state(request, call_next):
        request.state.current_user = mock_request.state.current_user
        response = await call_next(request)
        return response

    client = TestClient(app)
    response = client.post(
        "/ivf/alerts/acknowledge-all",
        json={"alert_id": alert_ids}
    )

    assert response.status_code == 200
    data = response.json()
    assert data["alert_id"] == alert_ids
    assert data["acknowledged_count"] == 2
    mock_service.acknowledge_alerts.assert_called_once_with(alert_ids, "USER-123")


def test_acknowledge_alert_not_authenticated(app, monkeypatch):
    """Test acknowledging an alert when user not authenticated"""
    alert_id = str(uuid.uuid4())
    
    mock_request = MagicMock()
    # Remove current_user to simulate unauthenticated request
    if hasattr(mock_request.state, 'current_user'):
        delattr(mock_request.state, 'current_user')
    
    app.dependency_overrides[critical_alert_controller.get_db] = override_get_db
    
    with patch('app.controller.IVF.critical_alert_controller.Request', return_value=mock_request):
        client = TestClient(app)
        response = client.post(
            "/ivf/alerts/acknowledge",
            json={"alert_id": alert_id}
        )
        
        # Should return 401 or 500 depending on implementation
        assert response.status_code in [401, 500]


def test_acknowledge_alert_not_found(app, monkeypatch, mock_request):
    """Test acknowledging an alert when alert not found"""
    alert_id = str(uuid.uuid4())
    
    mock_service = MagicMock()
    mock_service.acknowledge_alert.side_effect = AppException(
        message="Alert not found",
        error_code="NOT_FOUND",
        status_code=404
    )
    
    monkeypatch.setattr(
        critical_alert_controller,
        "CriticalAlertService",
        MagicMock(return_value=mock_service)
    )
    
    app.dependency_overrides[critical_alert_controller.get_db] = override_get_db
    
    # Add middleware to set request state
    @app.middleware("http")
    async def set_request_state(request, call_next):
        request.state.current_user = mock_request.state.current_user
        response = await call_next(request)
        return response
    
    client = TestClient(app)
    response = client.post(
        "/ivf/alerts/acknowledge",
        json={"alert_id": alert_id}
    )
    
    assert response.status_code == 404


# ==========================================
# Tests for check_and_create_alerts endpoint
# ==========================================

def test_check_and_create_alerts_success(app, monkeypatch):
    """Test checking and creating alerts successfully"""
    mock_service = MagicMock()
    mock_service.check_and_create_alerts.return_value = []  # Returns list of alerts
    
    monkeypatch.setattr(
        critical_alert_controller,
        "CriticalAlertService",
        MagicMock(return_value=mock_service)
    )
    
    app.dependency_overrides[critical_alert_controller.get_db] = override_get_db
    
    # Create a mock user for middleware
    mock_user = Mock()
    mock_user.user_id = "USER-123"
    mock_user.department = "IVF"
    mock_user.branch_id = None
    mock_user.hospital_id = None
    mock_user.status = True
    mock_user.approved_status = "approved"
    mock_user.first_name = "Test"
    mock_user.last_name = "User"
    
    # Add middleware to set request state
    @app.middleware("http")
    async def set_request_state(request, call_next):
        if not hasattr(request.state, 'current_user'):
            request.state.current_user = mock_user
        response = await call_next(request)
        return response
    
    # Mock the database query for canisters
    mock_db = MagicMock()
    mock_canister = MagicMock()
    mock_canister.canister_id = 1
    mock_canister.canister_number = "C1"
    mock_db.query.return_value.filter.return_value.all.return_value = [mock_canister]
    
    app.dependency_overrides[critical_alert_controller.get_db] = lambda: mock_db
    
    client = TestClient(app)
    response = client.post("/ivf/alerts/check")
    
    assert response.status_code == 200
    data = response.json()
    # Returns CriticalAlertListResponse with alerts, total_count, active_count, acknowledged_count
    assert isinstance(data, dict)
    assert "alerts" in data
    assert isinstance(data["alerts"], list)
