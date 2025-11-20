from datetime import datetime, timedelta
from unittest.mock import MagicMock

import pytest

from app.service.dashboard_service import DashboardService


@pytest.fixture
def db_session():
    return MagicMock()


@pytest.fixture
def dashboard_service(db_session):
    return DashboardService(db_session)


def _set_query_results(db_session, rows):
    """Configure the SQLAlchemy query chain to return provided rows."""
    filter_mock = MagicMock()
    filter_mock.all.return_value = rows

    query_mock = MagicMock()
    query_mock.filter.return_value = filter_mock

    db_session.query.return_value = query_mock


def test_get_performance_metrics_average_lead_time(dashboard_service, db_session):
    """Average lead time is computed from completed shipments in current month."""
    now = datetime.now()
    current_month_start = now.replace(day=1, hour=9, minute=0, second=0, microsecond=0)

    shipments = [
        (
            current_month_start,
            current_month_start + timedelta(days=2),
        ),
        (
            current_month_start + timedelta(days=5),
            current_month_start + timedelta(days=6),
        ),
        (
            current_month_start + timedelta(days=10),
            None,
        ),
    ]

    _set_query_results(db_session, shipments)

    response = dashboard_service.get_performance_metrics(pharma_id=42)

    assert response.metrics["total_shipments"] == 3
    assert response.metrics["completed_shipments"] == 2
    assert response.metrics["pending_shipments"] == 1
    assert response.metrics["avg_lead_time_days"] == 1.5
    assert response.category == "performance"
    assert response.status == "success"
    assert isinstance(response.last_updated, datetime)


def test_get_performance_metrics_no_shipments(dashboard_service, db_session):
    """When there are no shipments, counts and averages default to zero."""
    _set_query_results(db_session, [])

    response = dashboard_service.get_performance_metrics(pharma_id=99)

    assert response.metrics["total_shipments"] == 0
    assert response.metrics["completed_shipments"] == 0
    assert response.metrics["pending_shipments"] == 0
    assert response.metrics["avg_lead_time_days"] == 0.0


def test_get_average_lead_time_response(dashboard_service, db_session):
    """Average lead time endpoint returns focused response."""
    now = datetime.now()
    current_month_start = now.replace(day=1, hour=9, minute=0, second=0, microsecond=0)
    shipments = [
        (
            current_month_start,
            current_month_start + timedelta(days=1),
        ),
        (
            current_month_start + timedelta(days=3),
            current_month_start + timedelta(days=4),
        ),
    ]
    _set_query_results(db_session, shipments)

    response = dashboard_service.get_average_lead_time(pharma_id=10)

    assert response.avg_lead_time_days == 1.0
    assert response.total_shipments == 2
    assert response.completed_shipments == 2
    assert response.pending_shipments == 0
    assert response.status == "success"

