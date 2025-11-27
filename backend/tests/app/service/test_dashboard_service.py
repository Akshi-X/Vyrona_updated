from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch
import json

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


def test_get_success_rate_with_results(dashboard_service, db_session):
    """Success rate uses completed patient stages."""
    result_row = MagicMock()
    result_row.successful_outcomes = 8
    result_row.total_outcomes = 10

    filter_mock = MagicMock()
    filter_mock.one_or_none.return_value = result_row

    join_mock = MagicMock()
    join_mock.filter.return_value = filter_mock

    query_mock = MagicMock()
    query_mock.join.return_value = join_mock

    db_session.query.return_value = query_mock

    response = dashboard_service.get_success_rate(pharma_id=7)

    assert response.success_rate == 80.0
    assert response.successful_outcomes == 8
    assert response.total_outcomes == 10
    assert response.status == "success"


def test_get_success_rate_no_data(dashboard_service, db_session):
    """Gracefully handles when no completed outcomes exist."""
    filter_mock = MagicMock()
    filter_mock.one_or_none.return_value = None

    join_mock = MagicMock()
    join_mock.filter.return_value = filter_mock

    query_mock = MagicMock()
    query_mock.join.return_value = join_mock

    db_session.query.return_value = query_mock

    response = dashboard_service.get_success_rate(pharma_id=11)

    assert response.success_rate == 0.0
    assert response.successful_outcomes == 0
    assert response.total_outcomes == 0


def test_get_avg_quality_deviations_with_data(dashboard_service, db_session):
    """Calculate average quality deviations from Redis quality data."""
    now = datetime.now()
    current_month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    # Mock database query for patients with shipments
    filter_mock = MagicMock()
    filter_mock.distinct.return_value = filter_mock
    filter_mock.all.return_value = [("patient_1",), ("patient_2",)]
    
    query_mock = MagicMock()
    query_mock.filter.return_value = filter_mock
    db_session.query.return_value = query_mock
    
    # Mock Redis data
    quality_data_1 = [
        json.dumps({
            "patient_id": "patient_1",
            "timestamp": current_month_start.isoformat(),
            "violated_parameters": ["temperature", "humidity"],
            "threshold_violations": {"temperature": True, "humidity": True}
        }),
        json.dumps({
            "patient_id": "patient_1",
            "timestamp": (current_month_start + timedelta(days=5)).isoformat(),
            "violated_parameters": ["ph_level"],
            "threshold_violations": {"ph_level": True}
        })
    ]
    
    quality_data_2 = [
        json.dumps({
            "patient_id": "patient_2",
            "timestamp": (current_month_start + timedelta(days=10)).isoformat(),
            "violated_parameters": ["temperature"],
            "threshold_violations": {"temperature": True}
        })
    ]
    
    mock_redis = MagicMock()
    mock_redis.lrange.side_effect = [quality_data_1, quality_data_2]
    
    with patch('app.service.dashboard_service.get_redis', return_value=mock_redis):
        response = dashboard_service.get_avg_quality_deviations(pharma_id=42)
    
    # Total deviations: patient_1 has 2 + 1 = 3, patient_2 has 1 = 1, total = 4
    # Total treatments: 2
    # Average: 4 / 2 = 2.0
    assert response.avg_quality_deviations == 2.0
    assert response.total_deviations == 4
    assert response.total_treatments == 2
    assert response.pharma_id == 42
    assert response.status == "success"


def test_get_avg_quality_deviations_no_patients(dashboard_service, db_session):
    """Return zero when no patients have shipments in current month."""
    filter_mock = MagicMock()
    filter_mock.distinct.return_value = filter_mock
    filter_mock.all.return_value = []
    
    query_mock = MagicMock()
    query_mock.filter.return_value = filter_mock
    db_session.query.return_value = query_mock
    
    response = dashboard_service.get_avg_quality_deviations(pharma_id=99)
    
    assert response.avg_quality_deviations == 0.0
    assert response.total_deviations == 0
    assert response.total_treatments == 0
    assert response.pharma_id == 99


def test_get_avg_quality_deviations_redis_unavailable(dashboard_service, db_session):
    """Gracefully handle Redis connection errors."""
    now = datetime.now()
    current_month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    # Mock database query for patients
    filter_mock = MagicMock()
    filter_mock.distinct.return_value = filter_mock
    filter_mock.all.return_value = [("patient_1",)]
    
    query_mock = MagicMock()
    query_mock.filter.return_value = filter_mock
    db_session.query.return_value = query_mock
    
    # Mock Redis connection error
    with patch('app.service.dashboard_service.get_redis', side_effect=Exception("Redis connection failed")):
        response = dashboard_service.get_avg_quality_deviations(pharma_id=42)
    
    assert response.avg_quality_deviations == 0.0
    assert response.total_deviations == 0
    assert response.total_treatments == 1
    assert response.status == "success"


def test_get_avg_quality_deviations_uses_threshold_violations_fallback(dashboard_service, db_session):
    """Use threshold_violations dict when violated_parameters is not available."""
    now = datetime.now()
    current_month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    filter_mock = MagicMock()
    filter_mock.distinct.return_value = filter_mock
    filter_mock.all.return_value = [("patient_1",)]
    
    query_mock = MagicMock()
    query_mock.filter.return_value = filter_mock
    db_session.query.return_value = query_mock
    
    # Quality data with only threshold_violations (no violated_parameters list)
    quality_data = [
        json.dumps({
            "patient_id": "patient_1",
            "timestamp": current_month_start.isoformat(),
            "violated_parameters": [],  # Empty list
            "threshold_violations": {"temperature": True, "humidity": True, "ph_level": False}
        })
    ]
    
    mock_redis = MagicMock()
    mock_redis.lrange.return_value = quality_data
    
    with patch('app.service.dashboard_service.get_redis', return_value=mock_redis):
        response = dashboard_service.get_avg_quality_deviations(pharma_id=42)
    
    # Should count 2 violations from threshold_violations (temperature and humidity are True)
    assert response.avg_quality_deviations == 2.0
    assert response.total_deviations == 2
    assert response.total_treatments == 1
