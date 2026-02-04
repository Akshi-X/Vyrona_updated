"""
Unit tests for Quality Tracking Controller
"""
import pytest
from unittest.mock import MagicMock, Mock, patch
from fastapi import FastAPI
from fastapi.testclient import TestClient
from datetime import date, time

from app.controller.IVF import quality_tracking_controller
from app.schemas.IVF.quality_tracking_schema import (
    RefillLogCreate,
    CryolockColorUpdate,
    GobletColorUpdate
)


@pytest.fixture
def mock_db():
    """Create a mock database session"""
    return MagicMock()


@pytest.fixture
def mock_user():
    """Create a mock user"""
    user = Mock()
    user.user_id = "USER-123"
    user.email = "test@example.com"
    user.department = "IVF"
    return user


@pytest.fixture
def mock_request():
    """Create a mock request"""
    request = MagicMock()
    request.state.current_user = Mock()
    request.state.current_user.department = "IVF"
    request.state.current_user.branch_id = 1
    return request


@pytest.fixture
def app():
    """Create FastAPI app for testing"""
    app = FastAPI()
    app.include_router(quality_tracking_controller.router)
    return app


def override_get_db():
    yield MagicMock()


def override_get_current_user():
    user = Mock()
    user.user_id = "USER-123"
    user.email = "test@example.com"
    return user


# ==========================================
# Tests for create_refill_log endpoint
# ==========================================

def test_create_refill_log_success(app, monkeypatch, mock_user):
    """Test creating a refill log successfully"""
    from app.schemas.IVF.quality_tracking_schema import RefillLogResponse
    from app.constants.enums import TaskStatus
    from datetime import datetime, timezone
    
    mock_refill_log = RefillLogResponse(
        log_id=1,
        canister_id=1,
        refill_date=date.today(),
        refill_time=time(10, 30, 0),
        refilled_by="Test User",
        description="Test description",
        status=TaskStatus.NOT_STARTED,
        created_at=datetime.now(timezone.utc),
        created_by="test@example.com"
    )
    
    mock_service = MagicMock()
    mock_service.resolve_canister_id.return_value = 1
    mock_service.create_refill_log.return_value = mock_refill_log
    
    monkeypatch.setattr(
        quality_tracking_controller,
        "QualityTrackingService",
        MagicMock(return_value=mock_service)
    )
    
    monkeypatch.setattr(
        quality_tracking_controller,
        "get_branch_filter_info",
        lambda x: (1, "User") if x else (None, None)
    )
    
    app.dependency_overrides[quality_tracking_controller.get_db] = override_get_db
    app.dependency_overrides[quality_tracking_controller.get_current_user] = override_get_current_user
    
    client = TestClient(app)
    response = client.post(
        "/quality-tracking/canisters/C1/refill-logs",
        json={
            "refill_date": str(date.today()),
            "refill_time": "10:30:00",
            "refilled_by": "Test User",
            "description": "Test description",
            "status": "Not started"
        }
    )
    
    assert response.status_code == 201
    assert mock_service.resolve_canister_id.called
    assert mock_service.create_refill_log.called


def test_create_refill_log_canister_not_found(app, monkeypatch):
    """Test creating a refill log when canister not found"""
    from app.exceptions.custom_exceptions import AppException
    from fastapi import HTTPException
    from fastapi.responses import JSONResponse
    
    # Add exception handler for AppException
    @app.exception_handler(AppException)
    async def app_exception_handler(request, exc: AppException):
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.message}
        )
    
    mock_service = MagicMock()
    mock_service.resolve_canister_id.side_effect = AppException(
        message="Canister not found",
        error_code="NOT_FOUND",
        status_code=404
    )
    
    monkeypatch.setattr(
        quality_tracking_controller,
        "QualityTrackingService",
        MagicMock(return_value=mock_service)
    )
    
    monkeypatch.setattr(
        quality_tracking_controller,
        "get_branch_filter_info",
        lambda x: (1, "User")
    )
    
    app.dependency_overrides[quality_tracking_controller.get_db] = override_get_db
    app.dependency_overrides[quality_tracking_controller.get_current_user] = override_get_current_user
    
    client = TestClient(app)
    response = client.post(
        "/quality-tracking/canisters/INVALID/refill-logs",
        json={
            "refill_date": str(date.today()),
            "refill_time": "10:30:00",
            "refilled_by": "Test User"
        }
    )
    
    assert response.status_code == 404


# ==========================================
# Tests for get_refill_logs_by_container endpoint
# ==========================================

def test_get_refill_logs_by_container_success(app, monkeypatch):
    """Test getting refill logs by container successfully"""
    from app.schemas.IVF.quality_tracking_schema import RefillLogListResponse
    
    mock_response = RefillLogListResponse(
        refill_logs=[],
        count=0
    )
    
    mock_service = MagicMock()
    mock_service.resolve_canister_id.return_value = 1
    mock_service.get_refill_logs.return_value = mock_response
    
    monkeypatch.setattr(
        quality_tracking_controller,
        "QualityTrackingService",
        MagicMock(return_value=mock_service)
    )
    
    monkeypatch.setattr(
        quality_tracking_controller,
        "get_branch_filter_info",
        lambda x: (1, "User") if x else (None, None)
    )
    
    app.dependency_overrides[quality_tracking_controller.get_db] = override_get_db
    app.dependency_overrides[quality_tracking_controller.get_current_user] = override_get_current_user
    
    client = TestClient(app)
    response = client.get("/quality-tracking/canisters/C1/refill-logs")
    
    assert response.status_code == 200
    assert mock_service.resolve_canister_id.called
    assert mock_service.get_refill_logs.called


def test_get_refill_logs_by_container_with_filters(app, monkeypatch):
    """Test getting refill logs with status and limit filters"""
    from app.schemas.IVF.quality_tracking_schema import RefillLogListResponse
    
    mock_response = RefillLogListResponse(
        refill_logs=[],
        count=0
    )
    
    mock_service = MagicMock()
    mock_service.resolve_canister_id.return_value = 1
    mock_service.get_refill_logs.return_value = mock_response
    
    monkeypatch.setattr(
        quality_tracking_controller,
        "QualityTrackingService",
        MagicMock(return_value=mock_service)
    )
    
    monkeypatch.setattr(
        quality_tracking_controller,
        "get_branch_filter_info",
        lambda x: (1, "User") if x else (None, None)
    )
    
    app.dependency_overrides[quality_tracking_controller.get_db] = override_get_db
    app.dependency_overrides[quality_tracking_controller.get_current_user] = override_get_current_user
    
    client = TestClient(app)
    response = client.get("/quality-tracking/canisters/C1/refill-logs?status=Done&limit=10")
    
    assert response.status_code == 200
    # Verify service was called with filters
    mock_service.get_refill_logs.assert_called_once()
    call_args = mock_service.get_refill_logs.call_args
    assert call_args[1]["status"] == "Done"
    assert call_args[1]["limit"] == 10


# ==========================================
# Tests for get_canister_tracking_details endpoint
# ==========================================

def test_get_canister_tracking_details_success(app, monkeypatch):
    """Test getting canister tracking details successfully"""
    from app.schemas.IVF.quality_tracking_schema import IVFCanisterTrackingResponse
    
    mock_response = IVFCanisterTrackingResponse(
        data=[],
        total=10,
        available_slots=10
    )
    
    mock_service = MagicMock()
    mock_service.resolve_canister_id.return_value = 1  # Mock canister_id resolution
    mock_service.get_canister_tracking_details.return_value = mock_response
    
    monkeypatch.setattr(
        quality_tracking_controller,
        "QualityTrackingService",
        MagicMock(return_value=mock_service)
    )
    
    monkeypatch.setattr(
        quality_tracking_controller,
        "get_branch_filter_info",
        lambda x: (None, "Manager")
    )
    
    app.dependency_overrides[quality_tracking_controller.get_db] = override_get_db
    app.dependency_overrides[quality_tracking_controller.get_current_user] = override_get_current_user
    
    client = TestClient(app)
    response = client.get("/quality-tracking/canisters/C1/tracking-details")
    
    assert response.status_code == 200
    data = response.json()
    assert "data" in data
    assert "total" in data
    assert "available_slots" in data


def test_get_canister_tracking_details_not_found(app, monkeypatch):
    """Test getting canister tracking details when canister not found"""
    from app.exceptions.custom_exceptions import AppException
    
    mock_service = MagicMock()
    mock_service.get_canister_tracking_details.side_effect = AppException(
        message="Canister not found",
        error_code="NOT_FOUND",
        status_code=404
    )
    
    monkeypatch.setattr(
        quality_tracking_controller,
        "QualityTrackingService",
        MagicMock(return_value=mock_service)
    )
    
    app.dependency_overrides[quality_tracking_controller.get_db] = override_get_db
    app.dependency_overrides[quality_tracking_controller.get_current_user] = override_get_current_user
    
    client = TestClient(app)
    response = client.get("/quality-tracking/canisters/INVALID/tracking")
    
    assert response.status_code == 404


# ==========================================
# Tests for update_cryolock_color endpoint
# ==========================================

def test_update_cryolock_color_success(app, monkeypatch):
    """Test updating cryolock color successfully"""
    from app.schemas.IVF.quality_tracking_schema import ColorUpdateResponse
    
    mock_response = ColorUpdateResponse(
        success=True,
        message="Color updated successfully",
        cryolock_number="CL1",
        updated_color="blue"
    )
    
    mock_service = MagicMock()
    mock_service.resolve_canister_id.return_value = 1  # Mock canister_id resolution
    mock_service.update_cryolock_color.return_value = mock_response
    
    monkeypatch.setattr(
        quality_tracking_controller,
        "QualityTrackingService",
        MagicMock(return_value=mock_service)
    )
    
    monkeypatch.setattr(
        quality_tracking_controller,
        "get_branch_filter_info",
        lambda x: (None, "Manager")
    )
    
    app.dependency_overrides[quality_tracking_controller.get_db] = override_get_db
    app.dependency_overrides[quality_tracking_controller.get_current_user] = override_get_current_user
    
    client = TestClient(app)
    response = client.patch(
        "/quality-tracking/canisters/C1/cryolock-color",
        json={"cryolock_number": "CL1", "cryolock_color": "blue"}
    )
    
    assert response.status_code == 200
    assert mock_service.update_cryolock_color.called


def test_update_cryolock_color_not_found(app, monkeypatch):
    """Test updating cryolock color when cryolock not found"""
    from app.exceptions.custom_exceptions import AppException
    
    mock_service = MagicMock()
    mock_service.update_cryolock_color.side_effect = AppException(
        message="Cryolock not found",
        error_code="NOT_FOUND",
        status_code=404
    )
    
    monkeypatch.setattr(
        quality_tracking_controller,
        "QualityTrackingService",
        MagicMock(return_value=mock_service)
    )
    
    app.dependency_overrides[quality_tracking_controller.get_db] = override_get_db
    app.dependency_overrides[quality_tracking_controller.get_current_user] = override_get_current_user
    
    client = TestClient(app)
    response = client.patch(
        "/quality-tracking/cryolocks/999/color",
        json={"color": "blue"}
    )
    
    assert response.status_code == 404


# ==========================================
# Tests for update_goblet_color endpoint
# ==========================================

def test_update_goblet_color_success(app, monkeypatch):
    """Test updating goblet color successfully"""
    from app.schemas.IVF.quality_tracking_schema import ColorUpdateResponse
    
    mock_response = ColorUpdateResponse(
        success=True,
        message="Color updated successfully",
        cryolock_number="CL1",
        updated_color="blue"
    )
    
    mock_service = MagicMock()
    mock_service.resolve_canister_id.return_value = 1  # Mock canister_id resolution
    mock_service.update_goblet_color.return_value = mock_response
    
    monkeypatch.setattr(
        quality_tracking_controller,
        "QualityTrackingService",
        MagicMock(return_value=mock_service)
    )
    
    monkeypatch.setattr(
        quality_tracking_controller,
        "get_branch_filter_info",
        lambda x: (None, "Manager")
    )
    
    app.dependency_overrides[quality_tracking_controller.get_db] = override_get_db
    app.dependency_overrides[quality_tracking_controller.get_current_user] = override_get_current_user
    
    client = TestClient(app)
    response = client.patch(
        "/quality-tracking/canisters/C1/goblet-color",
        json={"cryolock_number": "CL1", "goblet_color": "blue"}
    )
    
    assert response.status_code == 200
    assert mock_service.update_goblet_color.called


def test_update_goblet_color_not_found(app, monkeypatch):
    """Test updating goblet color when goblet not found"""
    from app.exceptions.custom_exceptions import AppException
    
    mock_service = MagicMock()
    mock_service.update_goblet_color.side_effect = AppException(
        message="Goblet not found",
        error_code="NOT_FOUND",
        status_code=404
    )
    
    monkeypatch.setattr(
        quality_tracking_controller,
        "QualityTrackingService",
        MagicMock(return_value=mock_service)
    )
    
    app.dependency_overrides[quality_tracking_controller.get_db] = override_get_db
    app.dependency_overrides[quality_tracking_controller.get_current_user] = override_get_current_user
    
    client = TestClient(app)
    response = client.patch(
        "/quality-tracking/goblets/999/color",
        json={"color": "blue"}
    )
    
    assert response.status_code == 404
