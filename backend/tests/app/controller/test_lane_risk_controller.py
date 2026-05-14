import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from fastapi.middleware.cors import CORSMiddleware
from unittest.mock import MagicMock
from datetime import datetime, timezone

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
            self.department = None  # For pharma users, department can be None
            self.branch_id = None
            self.hospital_id = None
            self.status = True
            self.approved_status = "approved"
            self.first_name = "Test"
            self.last_name = "User"

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
    
    # Mock SessionLocal and LaneRiskService
    db_mock = MagicMock(name="db_session")
    db_mock.close = MagicMock()  # Mock close method
    
    # Patch SessionLocal at the import location
    monkeypatch.setattr(
        "app.config.database.SessionLocal",
        lambda: db_mock
    )
    # Also patch it in the controller module
    monkeypatch.setattr(
        lane_risk_controller,
        "SessionLocal",
        lambda: db_mock
    )
    
    # Assessment result to return - must match LaneRiskAssessmentResponse schema
    assessment_result = {
        "patient_id": "PT-123",  # Required by schema
        "total_risk_factors": 5,
        "factors": [
            {
                "risk_factor": "Quality Deviations",
                "risk_contributors": ["Temperature Deviation - 5"],
                "risk_scale": "0"
            },
            {
                "risk_factor": "Weather",
                "risk_contributors": ["Humidity Deviation - 0"],
                "risk_scale": "--"
            },
            {
                "risk_factor": "Lane Complexity",
                "risk_contributors": [],
                "risk_scale": "0"
            },
            {
                "risk_factor": "External Factors",
                "risk_contributors": [],
                "risk_scale": "0"
            },
            {
                "risk_factor": "LPI Overall",
                "risk_contributors": [],
                "risk_scale": "0"
            }
        ],
        "last_updated": datetime.now(timezone.utc),  # Use datetime object, not ISO string
        "status": "success"
    }
    
    class MockLaneRiskService:
        def __init__(self, db):
            pass
        
        def calculate_lane_risk_assessment(self, patient_id, pharma_id):
            return assessment_result
    
    monkeypatch.setattr(
        lane_risk_controller,
        "LaneRiskService",
        MockLaneRiskService
    )

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

    response = test_client.get("/lane-risk-assessment?patient_id=PT-123")
    
    if response.status_code != 200:
        print(f"Response status: {response.status_code}")
        print(f"Response body: {response.json()}")

    assert response.status_code == 200
    data = response.json()
    assert "total_risk_factors" in data
    assert "factors" in data
    assert "last_updated" in data
    assert "status" in data
    assert data["status"] == "success"
    assert isinstance(data["factors"], list)
    assert len(data["factors"]) == 5  # Should have 5 risk factors
    
    # Verify lane structure
    row = data["factors"][0]
    assert "risk_factor" in row
    assert "risk_contributors" in row
    assert isinstance(row["risk_contributors"], list)
    assert "risk_scale" in row


def test_get_lane_risk_assessment_lane_data(client):
    """Test lane risk assessment returns correct lane data"""
    test_client, mock_user = client

    response = test_client.get("/lane-risk-assessment?patient_id=PT-123")

    assert response.status_code == 200
    data = response.json()
    factors = data["factors"]
    
    # Check Quality Deviations row
    quality_row = next((factor for factor in factors if factor["risk_factor"] == "Quality Deviations"), None)
    assert quality_row is not None
    assert quality_row["risk_contributors"][0] == "Temperature Deviation - 5"
    assert quality_row["risk_scale"] == "0"
    
    # Check Weather row
    weather_row = next((factor for factor in factors if factor["risk_factor"] == "Weather"), None)
    assert weather_row is not None
    # Mock data has only one contributor at index 0
    assert len(weather_row["risk_contributors"]) > 0
    assert weather_row["risk_contributors"][0] == "Humidity Deviation - 0"
    assert weather_row["risk_scale"] == "--"


def test_get_lane_risk_assessment_response_structure(client):
    """Test lane risk assessment response structure"""
    test_client, mock_user = client

    response = test_client.get("/lane-risk-assessment?patient_id=PT-123")

    assert response.status_code == 200
    data = response.json()
    
    # Verify response matches schema
    assert data["total_risk_factors"] == 5
    assert len(data["factors"]) == 5
    assert data["status"] == "success"
    assert "last_updated" in data
    # Verify last_updated is a valid ISO format datetime string
    try:
        datetime.fromisoformat(data["last_updated"].replace('Z', '+00:00'))
    except ValueError:
        pytest.fail("last_updated is not a valid ISO format datetime")

