import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from fastapi.middleware.cors import CORSMiddleware
from unittest.mock import MagicMock
from datetime import datetime

from app.controller import lane_risk_controller
from app.schemas.lane_risk_schema import (
    LaneRiskAssessmentResponse,
    LaneRiskAssessmentItem
)
from starlette.middleware.base import BaseHTTPMiddleware
from app.middleware.rbac_middleware import RBACMiddleware
from app.middleware.token_validation_middleware import TokenValidationMiddleware
from app.middleware.request_validation_middleware import RequestValidationMiddleware
from app.middleware.patient_validation_middleware import PatientValidationMiddleware
from app.middleware.sanitization_middleware import SanitizationMiddleware
from app.middleware.exception_handler import exception_handler_middleware


def _create_test_client(monkeypatch):
    app = FastAPI()
    app.include_router(lane_risk_controller.router)

    # Add CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Create a mock user for middleware
    class MockUser:
        def __init__(self):
            self.id = 1
            self.user_id = "USER-123"
            self.pharma_id = 42
            self.role = "pharma_admin"
            self.email = "test@example.com"
            self.is_approved = True

    mock_user = MockUser()

    # Create a mock TokenValidationMiddleware
    class MockTokenValidationMiddleware(BaseHTTPMiddleware):
        async def dispatch(self, request: Request, call_next):
            request.state.current_user = mock_user
            request.state.pharma_id = mock_user.pharma_id
            return await call_next(request)

    # Add middleware
    app.add_middleware(RBACMiddleware)
    app.add_middleware(MockTokenValidationMiddleware)
    app.add_middleware(RequestValidationMiddleware)
    app.add_middleware(PatientValidationMiddleware)
    app.add_middleware(SanitizationMiddleware)
    app.add_middleware(BaseHTTPMiddleware, dispatch=exception_handler_middleware)

    from app.dependencies import auth_dependencies
    app.dependency_overrides[auth_dependencies.get_pharma_id_from_request] = lambda: mock_user.pharma_id

    client = TestClient(app)
    try:
        yield client, mock_user
    finally:
        client.close()


@pytest.fixture()
def client(monkeypatch):
    yield from _create_test_client(monkeypatch)


# ==========================================
# Tests for GET /lane-risk-assessment
# ==========================================

def test_get_lane_risk_assessment_success(client):
    """Test getting lane risk assessment successfully"""
    test_client, mock_user = client

    response = test_client.get("/lane-risk-assessment")

    assert response.status_code == 200
    data = response.json()
    assert "total_lanes" in data
    assert "lanes" in data
    assert "last_updated" in data
    assert "status" in data
    assert data["status"] == "success"
    assert isinstance(data["lanes"], list)
    assert len(data["lanes"]) == 3  # Should have 3 mock lanes
    
    # Verify lane structure
    lane = data["lanes"][0]
    assert "route" in lane
    assert "quality_deviations" in lane
    assert "returns_regulatory" in lane
    assert "loss_physical_damage" in lane
    assert "three_pl_reliability" in lane
    assert "weather" in lane
    assert "lane_complexity" in lane
    assert "geopolitical" in lane
    assert "digital_communication" in lane
    assert "risk_level" in lane


def test_get_lane_risk_assessment_lane_data(client):
    """Test lane risk assessment returns correct lane data"""
    test_client, mock_user = client

    response = test_client.get("/lane-risk-assessment")

    assert response.status_code == 200
    data = response.json()
    lanes = data["lanes"]
    
    # Check Route A
    route_a = next((lane for lane in lanes if lane["route"] == "A"), None)
    assert route_a is not None
    assert route_a["risk_level"] == "Medium"
    
    # Check Route B
    route_b = next((lane for lane in lanes if lane["route"] == "B"), None)
    assert route_b is not None
    assert route_b["risk_level"] == "High"
    
    # Check Route C
    route_c = next((lane for lane in lanes if lane["route"] == "C"), None)
    assert route_c is not None
    assert route_c["risk_level"] == "Low"


def test_get_lane_risk_assessment_response_structure(client):
    """Test lane risk assessment response structure"""
    test_client, mock_user = client

    response = test_client.get("/lane-risk-assessment")

    assert response.status_code == 200
    data = response.json()
    
    # Verify response matches schema
    assert data["total_lanes"] == 3
    assert len(data["lanes"]) == 3
    assert data["status"] == "success"
    assert "last_updated" in data
    # Verify last_updated is a valid ISO format datetime string
    try:
        datetime.fromisoformat(data["last_updated"].replace('Z', '+00:00'))
    except ValueError:
        pytest.fail("last_updated is not a valid ISO format datetime")

