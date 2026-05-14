from datetime import datetime
from types import SimpleNamespace
import sys
from unittest.mock import MagicMock

from fastapi import FastAPI
from fastapi.testclient import TestClient

if "country_converter" not in sys.modules:
    class _CountryConverterStub:
        def convert(self, *args, **kwargs):
            return None

    sys.modules["country_converter"] = SimpleNamespace(
        CountryConverter=lambda: _CountryConverterStub()
    )

from app.controller import dashboard_controller
from app.schemas.dashboard_schema import (
    DashboardCategoryResponse,
    AvgLeadTimeResponse,
    SuccessRateResponse,
    AvgQualityDeviationsResponse
)


def _create_test_client(monkeypatch, service_mock):
    app = FastAPI()
    app.include_router(dashboard_controller.router)

    def override_get_db():
        yield MagicMock()

    app.dependency_overrides[dashboard_controller.get_pharma_id_from_request] = lambda: 42
    app.dependency_overrides[dashboard_controller.get_db] = override_get_db

    monkeypatch.setattr(dashboard_controller, "DashboardService", MagicMock(return_value=service_mock))

    client = TestClient(app)
    return client


def test_performance_metrics_uses_dashboard_service(monkeypatch):
    """Verify controller delegates to DashboardService for performance metrics."""
    service_mock = MagicMock()
    expected_response = DashboardCategoryResponse(
        category="performance",
        metrics={"on_time_percentage": 90.0},
        last_updated=datetime.now(),
        status="success"
    )
    service_mock.get_performance_metrics.return_value = expected_response

    with _create_test_client(monkeypatch, service_mock) as client:
        response = client.get("/performance")

    assert response.status_code == 200
    assert response.json()["metrics"]["on_time_percentage"] == 90.0
    service_mock.get_performance_metrics.assert_called_once_with(42)


def test_average_lead_time_endpoint(monkeypatch):
    """Verify avg lead time endpoint returns service response."""
    service_mock = MagicMock()
    expected_response = AvgLeadTimeResponse(
        avg_lead_time_days=2.5,
        total_shipments=4,
        completed_shipments=3,
        pending_shipments=1,
        status="success",
        last_updated=datetime.now()
    )
    service_mock.get_average_lead_time.return_value = expected_response

    with _create_test_client(monkeypatch, service_mock) as client:
        response = client.get("/performance/avg-lead-time")

    assert response.status_code == 200
    body = response.json()
    assert body["avg_lead_time_days"] == 2.5
    service_mock.get_average_lead_time.assert_called_once_with(42)


def test_success_rate_endpoint(monkeypatch):
    """Verify success rate endpoint delegates to dashboard service."""
    service_mock = MagicMock()
    expected_response = SuccessRateResponse(
        pharma_id=42,
        success_rate=75.0,
        successful_outcomes=15,
        total_outcomes=20,
        status="success",
        last_updated=datetime.now()
    )
    service_mock.get_success_rate.return_value = expected_response

    with _create_test_client(monkeypatch, service_mock) as client:
        response = client.get("/performance/success-rate")

    assert response.status_code == 200
    body = response.json()
    assert body["success_rate"] == 75.0
    assert body["successful_outcomes"] == 15
    service_mock.get_success_rate.assert_called_once_with(42)


def test_avg_quality_deviations_endpoint(monkeypatch):
    """Verify avg quality deviations endpoint delegates to dashboard service."""
    service_mock = MagicMock()
    expected_response = AvgQualityDeviationsResponse(
        pharma_id=42,
        avg_quality_deviations=2.5,
        total_deviations=10,
        total_treatments=4,
        status="success",
        last_updated=datetime.now()
    )
    service_mock.get_avg_quality_deviations.return_value = expected_response

    with _create_test_client(monkeypatch, service_mock) as client:
        response = client.get("/performance/avg-quality-deviations")

    assert response.status_code == 200
    body = response.json()
    assert body["avg_quality_deviations"] == 2.5
    assert body["total_deviations"] == 10
    assert body["total_treatments"] == 4
    assert body["pharma_id"] == 42
    service_mock.get_avg_quality_deviations.assert_called_once_with(42)

