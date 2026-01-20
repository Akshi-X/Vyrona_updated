import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from unittest.mock import MagicMock
from datetime import datetime, timezone

from app.controller import shipment_controller
from app.exceptions.patient_exceptions import PatientNotFoundException, ShipmentNotStartedException, PatientException
from app.exceptions.custom_exceptions import AppException
from app.constants.status_constants import STATUS_FAILED
from app.middleware.rbac_middleware import RBACMiddleware
from app.middleware.token_validation_middleware import TokenValidationMiddleware
from app.middleware.request_validation_middleware import RequestValidationMiddleware
from app.middleware.patient_validation_middleware import PatientValidationMiddleware
from app.middleware.sanitization_middleware import SanitizationMiddleware
from app.middleware.exception_handler import exception_handler_middleware
from starlette.middleware.base import BaseHTTPMiddleware


def _create_test_client(monkeypatch):
    app = FastAPI()
    app.include_router(shipment_controller.router)

    # Set up exception handlers
    @app.exception_handler(PatientException)
    async def patient_exception_handler(request: Request, exc: PatientException):
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error_code": exc.error_code,
                "message": exc.message,
                "status": STATUS_FAILED,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                **exc.details
            }
        )

    @app.exception_handler(AppException)
    async def app_exception_handler(request: Request, exc: AppException):
        return JSONResponse(
            status_code=exc.status_code,
            content=exc.to_dict()
        )

    # Add CORS middleware (first, so it executes first)
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
            self.user_id = 1
            self.pharma_id = 42
            self.role = "pharma_admin"  # Role that can access shipment endpoints
            self.email = "test@example.com"
            self.is_approved = True

    mock_user = MockUser()

    # Create a mock TokenValidationMiddleware that always succeeds
    class MockTokenValidationMiddleware(BaseHTTPMiddleware):
        """Mock TokenValidationMiddleware that always succeeds and sets mock user"""
        async def dispatch(self, request: Request, call_next):
            # Set mock user in request.state (what TokenValidationMiddleware does)
            request.state.current_user = mock_user
            return await call_next(request)

    # Add middleware in reverse order (last added executes first)
    # Flow: CORS → Exception Handler → Sanitization → Patient Validation → Request Validation → Token → RBAC → Controller
    app.add_middleware(RBACMiddleware)
    app.add_middleware(MockTokenValidationMiddleware)  # Use mock instead of real TokenValidationMiddleware
    app.add_middleware(RequestValidationMiddleware)
    app.add_middleware(PatientValidationMiddleware)
    app.add_middleware(SanitizationMiddleware)
    app.add_middleware(BaseHTTPMiddleware, dispatch=exception_handler_middleware)

    db_mock = MagicMock(name="db_session")

    def override_get_db():
        yield db_mock

    app.dependency_overrides[shipment_controller.get_db] = override_get_db
    app.dependency_overrides[shipment_controller.get_current_user_pharma_id] = lambda: 42

    service_mock = MagicMock()
    monkeypatch.setattr(
        shipment_controller,
        "ShipmentService",
        MagicMock(return_value=service_mock),
    )

    client = TestClient(app)
    try:
        yield client, service_mock
    finally:
        client.close()


@pytest.fixture()
def client(monkeypatch):
    yield from _create_test_client(monkeypatch)


def test_get_three_pl_players_success(client):
    test_client, service_mock = client
    expected_response = {
        "3pl_players": [
            {"name": "Carrier A", "type": "Express"},
            {"name": "Carrier B", "type": "Standard"}
        ]
    }
    service_mock.get_3pl_player_details.return_value = expected_response

    response = test_client.get("/shipment/3pl-players/PT-123")

    assert response.status_code == 200
    assert response.json() == expected_response
    service_mock.get_3pl_player_details.assert_called_once_with(pharma_id=42, patient_id="PT-123")


def test_get_three_pl_players_patient_not_found(client):
    test_client, service_mock = client
    service_mock.get_3pl_player_details.side_effect = PatientNotFoundException(patient_id="PT-123")

    response = test_client.get("/shipment/3pl-players/PT-123")

    assert response.status_code == 404
    service_mock.get_3pl_player_details.assert_called_once_with(pharma_id=42, patient_id="PT-123")


def test_get_three_pl_players_shipment_not_started(client):
    test_client, service_mock = client
    service_mock.get_3pl_player_details.side_effect = ShipmentNotStartedException(patient_id="PT-123")

    response = test_client.get("/shipment/3pl-players/PT-123")

    assert response.status_code == 400
    service_mock.get_3pl_player_details.assert_called_once_with(pharma_id=42, patient_id="PT-123")


def test_get_three_pl_players_generic_error(client):
    test_client, service_mock = client
    service_mock.get_3pl_player_details.side_effect = Exception("Database error")

    response = test_client.get("/shipment/3pl-players/PT-123")

    assert response.status_code == 500
    assert "Error getting 3PL player details" in response.json()["detail"]


def test_get_active_routes_success(client):
    test_client, service_mock = client
    routes = [
        {
            "route": "A → B",
            "status": "Safe",
            "date": "2024-01-01",
            "company": "Company A",
            "transit_days": 3,
            "carrier": "Carrier A",
            "updated_at": "2024-01-01T10:00:00Z"
        }
    ]
    metrics = {
        "active_routes": 10,
        "avg_transit_days": 2.5,
        "safe_routes": 7,
        "delayed_routes": 2,
        "risky_routes": 1,
        "last_updated": "2024-01-01T10:00:00Z"
    }
    service_mock.get_active_routes.return_value = routes
    service_mock.get_real_time_metrics.return_value = metrics

    response = test_client.get("/shipment/active-routes")

    assert response.status_code == 200
    body = response.json()
    assert body["routes"] == routes
    assert body["metrics"] == metrics
    service_mock.get_active_routes.assert_called_once_with(42, route_status=None, carriers=None, regions=None)
    service_mock.get_real_time_metrics.assert_called_once_with(42, regions=None)


def test_get_active_routes_with_filters(client):
    test_client, service_mock = client
    routes = []
    metrics = {
        "active_routes": 0,
        "avg_transit_days": 0,
        "safe_routes": 0,
        "delayed_routes": 0,
        "risky_routes": 0,
        "last_updated": "2024-01-01T10:00:00Z"
    }
    service_mock.get_active_routes.return_value = routes
    service_mock.get_real_time_metrics.return_value = metrics

    response = test_client.get(
        "/shipment/active-routes",
        params={
            "route_status": "safe",
            "carriers": "Carrier A",
            "regions": "Europe"
        }
    )

    assert response.status_code == 200
    service_mock.get_active_routes.assert_called_once_with(
        42,
        route_status="safe",
        carriers="Carrier A",
        regions="Europe"
    )
    service_mock.get_real_time_metrics.assert_called_once_with(
        42,
        regions="Europe"
    )


def test_get_active_routes_error(client):
    test_client, service_mock = client
    service_mock.get_active_routes.side_effect = Exception("Database error")

    response = test_client.get("/shipment/active-routes")

    assert response.status_code == 500
    assert "Error getting active routes" in response.json()["detail"]


def test_get_transport_time_comparison_success(client):
    test_client, service_mock = client
    expected_response = [
        {
            "source_location": "Location A",
            "destination_location": "Location B",
            "scheduled_time": "2.5 h",
            "actual_time": "1.5 h"
        },
        {
            "source_location": "Location B",
            "destination_location": "Location C",
            "scheduled_time": "3.0 h",
            "actual_time": "2.8 h"
        }
    ]
    service_mock.get_transport_time_comparison.return_value = expected_response

    response = test_client.get("/shipment/transport-time-comparison/PT-123")

    assert response.status_code == 200
    assert response.json() == expected_response
    service_mock.get_transport_time_comparison.assert_called_once_with(patient_id="PT-123", pharma_id=42)


def test_get_transport_time_comparison_patient_not_found(client):
    test_client, service_mock = client
    service_mock.get_transport_time_comparison.side_effect = PatientNotFoundException(patient_id="PT-123")

    response = test_client.get("/shipment/transport-time-comparison/PT-123")

    assert response.status_code == 404
    service_mock.get_transport_time_comparison.assert_called_once_with(patient_id="PT-123", pharma_id=42)


def test_get_transport_time_comparison_shipment_not_started(client):
    test_client, service_mock = client
    service_mock.get_transport_time_comparison.side_effect = ShipmentNotStartedException(patient_id="PT-123")

    response = test_client.get("/shipment/transport-time-comparison/PT-123")

    assert response.status_code == 400
    service_mock.get_transport_time_comparison.assert_called_once_with(patient_id="PT-123", pharma_id=42)


def test_get_transport_time_comparison_error(client):
    test_client, service_mock = client
    service_mock.get_transport_time_comparison.side_effect = Exception("Database error")

    response = test_client.get("/shipment/transport-time-comparison/PT-123")

    assert response.status_code == 500
    assert "Error getting transport time comparison" in response.json()["detail"]


def test_get_patient_journey_summary_success(client):
    test_client, service_mock = client
    # Use the actual structure that matches PatientJourneySummaryResponse schema
    # Note: overall_stage can be None or a PatientStage enum value string
    expected_summary = {
        "patient_id": "PT-123",
        "condition": "Condition A",
        "hospital_name": "Hospital A",
        "leg1": None,
        "reengineering": None,
        "leg2": None,
        "current_status": {
            "leg1_status": "completed",
            "reengineering_status": "completed",
            "leg2_status": "in_progress",
            "overall_stage": None  # Can be None if no active stage
        }
    }
    service_mock.get_patient_journey_summary.return_value = expected_summary

    response = test_client.get("/shipment/patient/PT-123/summary")

    assert response.status_code == 200
    body = response.json()
    assert body["patient_id"] == "PT-123"
    assert body["condition"] == "Condition A"
    assert body["current_status"]["leg1_status"] == "completed"
    service_mock.get_patient_journey_summary.assert_called_once_with(patient_id="PT-123", pharma_id=42)


def test_get_patient_journey_summary_patient_not_found(client):
    test_client, service_mock = client
    service_mock.get_patient_journey_summary.side_effect = PatientNotFoundException(patient_id="PT-123")

    response = test_client.get("/shipment/patient/PT-123/summary")

    assert response.status_code == 404
    service_mock.get_patient_journey_summary.assert_called_once_with(patient_id="PT-123", pharma_id=42)


def test_get_patient_journey_summary_shipment_not_started(client):
    test_client, service_mock = client
    service_mock.get_patient_journey_summary.side_effect = ShipmentNotStartedException(patient_id="PT-123")

    response = test_client.get("/shipment/patient/PT-123/summary")

    assert response.status_code == 400
    service_mock.get_patient_journey_summary.assert_called_once_with(patient_id="PT-123", pharma_id=42)


def test_get_patient_journey_summary_error(client):
    test_client, service_mock = client
    service_mock.get_patient_journey_summary.side_effect = Exception("Database error")

    response = test_client.get("/shipment/patient/PT-123/summary")

    assert response.status_code == 500
    assert "Error getting patient journey summary" in response.json()["detail"]


def test_get_control_tower_map_success(client):
    test_client, service_mock = client
    expected_map_data = {
        "routes": [
            {
                "shipment_id": 1,
                "patient_id": "PT-123",
                "source_location": "Location A",
                "destination_location": "Location B",
                "source_latitude": 40.7128,
                "source_longitude": -74.0060,
                "destination_latitude": 34.0522,
                "destination_longitude": -118.2437,
                "route_status": "safe",
                "carrier": "Carrier A",
                "region": "North America",
                "source_region": "North America",
                "destination_region": "North America",
                "last_updated": "16:25:17"
            }
        ],
        "total_routes": 1,
        "last_updated": "16:25:17",
        "message": None
    }
    service_mock.get_control_tower_map_data.return_value = expected_map_data

    response = test_client.get("/shipment/control-tower-map")

    assert response.status_code == 200
    body = response.json()
    assert body["routes"] == expected_map_data["routes"]
    assert body["total_routes"] == 1
    service_mock.get_control_tower_map_data.assert_called_once_with(
        pharma_id=42,
        route_status=None,
        carriers=None,
        regions=None
    )


def test_get_control_tower_map_with_filters(client):
    test_client, service_mock = client
    expected_map_data = {
        "routes": [],
        "total_routes": 0,
        "last_updated": "16:25:17"
    }
    service_mock.get_control_tower_map_data.return_value = expected_map_data

    response = test_client.get(
        "/shipment/control-tower-map",
        params={
            "route_status": "delayed",
            "carriers": "Carrier A",
            "regions": "Asia"
        }
    )

    assert response.status_code == 200
    service_mock.get_control_tower_map_data.assert_called_once_with(
        pharma_id=42,
        route_status="delayed",
        carriers="Carrier A",
        regions="Asia"
    )


def test_get_control_tower_map_error(client):
    test_client, service_mock = client
    service_mock.get_control_tower_map_data.side_effect = Exception("Database error")

    response = test_client.get("/shipment/control-tower-map")

    assert response.status_code == 500
    assert "Error getting control tower map data" in response.json()["detail"]


def test_get_carriers_success_active_only(client):
    test_client, service_mock = client
    expected_carriers = ["Carrier A", "Carrier B", "Carrier C"]
    service_mock.get_all_carriers.return_value = expected_carriers

    response = test_client.get("/shipment/carriers")

    assert response.status_code == 200
    assert response.json() == expected_carriers
    service_mock.get_all_carriers.assert_called_once_with(pharma_id=42, active_only=True)


def test_get_carriers_success_all_carriers(client):
    test_client, service_mock = client
    expected_carriers = ["Carrier A", "Carrier B", "Carrier C", "Carrier D"]
    service_mock.get_all_carriers.return_value = expected_carriers

    response = test_client.get("/shipment/carriers?active_only=false")

    assert response.status_code == 200
    assert response.json() == expected_carriers
    service_mock.get_all_carriers.assert_called_once_with(pharma_id=42, active_only=False)


def test_get_carriers_error(client):
    test_client, service_mock = client
    service_mock.get_all_carriers.side_effect = Exception("Database error")

    response = test_client.get("/shipment/carriers")

    assert response.status_code == 500
    assert "Error getting carriers" in response.json()["detail"]


def test_get_available_regions_success(client):
    test_client, service_mock = client
    expected_regions = ["Asia", "Europe", "North America", "South America"]
    service_mock.get_available_regions.return_value = expected_regions

    response = test_client.get("/shipment/regions")

    assert response.status_code == 200
    assert response.json() == expected_regions
    service_mock.get_available_regions.assert_called_once_with(pharma_id=42)


def test_get_available_regions_error(client):
    test_client, service_mock = client
    service_mock.get_available_regions.side_effect = Exception("Database error")

    response = test_client.get("/shipment/regions")

    assert response.status_code == 500
    assert "Error getting available regions" in response.json()["detail"]


def test_get_document_checklist_success(client):
    test_client, service_mock = client
    expected_checklist = {
        "items": [
            {
                "stage": "Location A - Location B",
                "actual": 3,
                "needed": 5,
                "missed": 2,
                "missing_documents": ["Bill of Lading", "Customs Declaration"]
            },
            {
                "stage": "Location B - Location C",
                "actual": 4,
                "needed": 4,
                "missed": 0,
                "missing_documents": []
            }
        ],
        "total_items": 2,
        "non_compliance_percentage": 22.22
    }
    service_mock.get_document_checklist.return_value = expected_checklist

    response = test_client.get("/shipment/document-checklist/PT-123")

    assert response.status_code == 200
    body = response.json()
    assert body["items"] == expected_checklist["items"]
    assert body["total_items"] == 2
    assert body["non_compliance_percentage"] == 22.22
    # Verify missing_documents is at item level, not top level
    assert "missing_documents" not in body or body.get("missing_documents") is None
    assert body["items"][0]["missing_documents"] == ["Bill of Lading", "Customs Declaration"]
    service_mock.get_document_checklist.assert_called_once_with(patient_id="PT-123", pharma_id=42)


def test_get_document_checklist_patient_not_found(client):
    test_client, service_mock = client
    service_mock.get_document_checklist.side_effect = PatientNotFoundException(patient_id="PT-123")

    response = test_client.get("/shipment/document-checklist/PT-123")

    assert response.status_code == 404
    service_mock.get_document_checklist.assert_called_once_with(patient_id="PT-123", pharma_id=42)


def test_get_document_checklist_app_exception(client):
    test_client, service_mock = client
    app_exception = AppException(
        message="Validation error",
        error_code="ERR_4001",
        status_code=400
    )
    service_mock.get_document_checklist.side_effect = app_exception

    # AppException is re-raised by controller and handled by exception handler
    response = test_client.get("/shipment/document-checklist/PT-123")

    assert response.status_code == 400
    body = response.json()
    assert body["error_code"] == "ERR_4001"
    assert body["message"] == "Validation error"
    service_mock.get_document_checklist.assert_called_once_with(patient_id="PT-123", pharma_id=42)


def test_get_document_checklist_generic_error(client):
    test_client, service_mock = client
    service_mock.get_document_checklist.side_effect = Exception("Unexpected error")

    # Generic exception is caught and converted to AppException with 500 status
    response = test_client.get("/shipment/document-checklist/PT-123")
    
    assert response.status_code == 500
    body = response.json()
    # AppException.to_dict() returns error_code, message, status, timestamp, and details
    assert "error_code" in body
    assert "message" in body
    assert body.get("status") == "Failed"  # STATUS_FAILED constant value
    service_mock.get_document_checklist.assert_called_once_with(patient_id="PT-123", pharma_id=42)

