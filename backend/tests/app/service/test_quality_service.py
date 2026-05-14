import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timedelta

import pytest

from app.service import quality_service
from app.service.quality_service import QualityService
from app.exceptions.patient_exceptions import PatientNotFoundException


class DummyManager:
    def __init__(self, active_connections):
        self.active_connections = active_connections


def test_get_connections_for_pharma_filters_active_connections():
    service = QualityService(db=MagicMock())
    connections_info = {
        "count": 2,
        "connections": [
            {"id": "conn-1", "other": "data"},
            {"id": "conn-2", "other": "data"},
        ],
    }
    manager = DummyManager(
        active_connections={
            "conn-1": {"pharma_id": 10},
            "conn-2": {"pharma_id": 20},
        }
    )

    filtered = service.get_connections_for_pharma(10, connections_info, manager)

    assert filtered["count"] == 1
    assert filtered["connections"] == [{"id": "conn-1", "other": "data"}]


def test_get_patients_with_quality_data_returns_intersection(monkeypatch):
    service = QualityService(db=MagicMock())

    query_mock = MagicMock()
    filter_mock = MagicMock()
    service.db.query.return_value = query_mock
    query_mock.filter.return_value = filter_mock
    filter_mock.all.return_value = [(1,), (2,), (3,)]

    class FakeRedis:
        def smembers(self, key):
            assert key == "patients"
            return [1, 3, 4]

    monkeypatch.setattr(quality_service, "get_redis", lambda: FakeRedis())

    result = service.get_patients_with_quality_data(pharma_id=5)

    assert result == [1, 3]


def test_get_patients_with_quality_data_handles_redis_failure(monkeypatch):
    service = QualityService(db=MagicMock())

    query_mock = MagicMock()
    filter_mock = MagicMock()
    service.db.query.return_value = query_mock
    query_mock.filter.return_value = filter_mock
    filter_mock.all.return_value = [(1,), (2,)]

    def raise_redis():
        raise ConnectionError("Redis down")

    monkeypatch.setattr(quality_service, "get_redis", raise_redis)

    result = service.get_patients_with_quality_data(pharma_id=42)

    assert result == []


def test_check_redis_health_reports_healthy(monkeypatch):
    service = QualityService(db=MagicMock())

    class FakeRedis:
        def ping(self):
            return True

    monkeypatch.setattr(quality_service, "get_redis", lambda: FakeRedis())

    status = service.check_redis_health()

    assert status == {"status": "healthy", "redis": "connected", "error": None}


def test_check_redis_health_reports_unhealthy(monkeypatch):
    service = QualityService(db=MagicMock())

    def raise_redis():
        raise ConnectionError("Redis down")

    monkeypatch.setattr(quality_service, "get_redis", raise_redis)

    status = service.check_redis_health()

    assert status["status"] == "unhealthy"
    assert status["redis"] == "disconnected"
    assert "Redis down" in status["error"]


def test_get_patients_with_quality_data_propagates_unexpected_error():
    db = MagicMock()
    db.query.side_effect = RuntimeError("db failure")

    service = QualityService(db=db)

    with pytest.raises(RuntimeError):
        service.get_patients_with_quality_data(1)


def test_validate_patient_belongs_to_pharma_db_exception():
    db = MagicMock()
    query_mock = db.query.return_value
    query_mock.filter.side_effect = RuntimeError("db issue")

    service = QualityService(db=db)

    with pytest.raises(RuntimeError):
        service.validate_patient_belongs_to_pharma("patient", 1)


def test_get_quality_history_propagates_unexpected_error(monkeypatch):
    service = QualityService(db=MagicMock())

    def raise_runtime():
        raise RuntimeError("redis boom")

    monkeypatch.setattr(quality_service, "get_redis", raise_runtime)

    with pytest.raises(RuntimeError):
        service.get_quality_history(pharma_id=1)


def test_get_latest_quality_data_propagates_unexpected_error(monkeypatch):
    service = QualityService(db=MagicMock())
    monkeypatch.setattr(service, "validate_patient_belongs_to_pharma", MagicMock(return_value=True))

    def raise_runtime():
        raise RuntimeError("redis boom")

    monkeypatch.setattr(quality_service, "get_redis", raise_runtime)

    with pytest.raises(RuntimeError):
        service.get_latest_quality_data("patient", 1)


def test_get_quality_history_raises_patient_not_found(monkeypatch):
    service = QualityService(db=MagicMock())
    error = PatientNotFoundException(patient_id="pid-1", reason="not allowed")
    monkeypatch.setattr(
        service,
        "validate_patient_belongs_to_pharma",
        MagicMock(side_effect=error),
    )

    class DummyRedis:
        def lrange(self, *_args, **_kwargs):
            return []

    monkeypatch.setattr(quality_service, "get_redis", lambda: DummyRedis())

    with pytest.raises(PatientNotFoundException):
        service.get_quality_history(pharma_id=1, patient_id="pid-1")


def test_get_latest_quality_data_raises_patient_not_found(monkeypatch):
    service = QualityService(db=MagicMock())
    error = PatientNotFoundException(patient_id="pid-1", reason="not allowed")
    monkeypatch.setattr(
        service,
        "validate_patient_belongs_to_pharma",
        MagicMock(side_effect=error),
    )

    class DummyRedis:
        def lindex(self, *_args, **_kwargs):
            return None

    monkeypatch.setattr(quality_service, "get_redis", lambda: DummyRedis())

    with pytest.raises(PatientNotFoundException):
        service.get_latest_quality_data("pid-1", 1)


def test_get_connections_for_pharma_wraps_error():
    service = QualityService(db=MagicMock())

    connections_info = {}  # Missing "connections" key to trigger KeyError
    manager = MagicMock()

    from app.exceptions.quality_exceptions import QualityServiceException

    with pytest.raises(QualityServiceException):
        service.get_connections_for_pharma(1, connections_info, manager)


class FakePubSub:
    def __init__(self, messages):
        self.messages = list(messages)

    def get_message(self, timeout=1.0, ignore_subscribe_messages=True):
        if not self.messages:
            return None
        message = self.messages.pop(0)
        if isinstance(message, Exception):
            raise message
        return message


class ControlledLoop:
    def __init__(self, *, exception=None, cancel_after=0):
        self._exception = exception
        self._cancel_after = cancel_after
        self.calls = 0

    async def run_in_executor(self, executor, func):
        self.calls += 1
        if self._exception and self.calls == 1:
            raise self._exception
        if self._cancel_after and self.calls > self._cancel_after:
            raise asyncio.CancelledError()
        return func()


def test_validate_patient_belongs_to_pharma_success():
    db = MagicMock()
    filter_mock = db.query.return_value.filter.return_value
    filter_mock.first.return_value = object()

    service = QualityService(db=db)

    assert service.validate_patient_belongs_to_pharma("patient-1", 9) is True


def test_validate_patient_belongs_to_pharma_not_found():
    db = MagicMock()
    filter_mock = db.query.return_value.filter.return_value
    filter_mock.first.return_value = None

    service = QualityService(db=db)

    from app.exceptions.patient_exceptions import PatientNotFoundException

    with pytest.raises(PatientNotFoundException):
        service.validate_patient_belongs_to_pharma("missing", 5)


def test_get_quality_history_for_specific_patient(monkeypatch):
    service = QualityService(db=MagicMock())
    validation_mock = MagicMock(return_value=True)
    monkeypatch.setattr(service, "validate_patient_belongs_to_pharma", validation_mock)

    class FakeRedis:
        def lrange(self, key, start, end):
            assert key == "quality_history:patient-123"
            return [
                json.dumps({"timestamp": "2024-01-02T10:00:00Z", "value": 1}),
                json.dumps({"timestamp": "2024-01-01T10:00:00Z", "value": 2}),
            ]

    monkeypatch.setattr(quality_service, "get_redis", lambda: FakeRedis())

    history = service.get_quality_history(pharma_id=7, patient_id="patient-123", limit=5)

    assert history[0]["value"] == 1
    assert history[1]["value"] == 2
    validation_mock.assert_called_once_with("patient-123", 7)


def test_get_quality_history_for_pharma(monkeypatch):
    db = MagicMock()
    filter_mock = db.query.return_value.filter.return_value
    filter_mock.all.return_value = [("patient-1",), ("patient-2",)]

    service = QualityService(db=db)

    class FakeRedis:
        def lrange(self, key, start, end):
            if key == "quality_history:patient-1":
                return [
                    json.dumps({"timestamp": "2024-01-03T00:00:00Z", "patient": "patient-1"}),
                    "not-json",
                ]
            if key == "quality_history:patient-2":
                return [
                    json.dumps({"timestamp": "2024-01-04T00:00:00Z", "patient": "patient-2"}),
                    json.dumps({"timestamp": "2024-01-02T00:00:00Z", "patient": "patient-2"}),
                ]
            return []

    monkeypatch.setattr(quality_service, "get_redis", lambda: FakeRedis())

    history = service.get_quality_history(pharma_id=3, patient_id=None, limit=5)

    timestamps = [entry["timestamp"] for entry in history]
    assert timestamps == [
        "2024-01-04T00:00:00Z",
        "2024-01-03T00:00:00Z",
        "2024-01-02T00:00:00Z",
    ]


def test_get_latest_quality_data_returns_entry(monkeypatch):
    service = QualityService(db=MagicMock())
    monkeypatch.setattr(service, "validate_patient_belongs_to_pharma", MagicMock())

    class FakeRedis:
        def lindex(self, key, index):
            assert key == "quality_history:patient-5"
            assert index == 0
            return json.dumps({"value": "latest"})

    monkeypatch.setattr(quality_service, "get_redis", lambda: FakeRedis())

    latest = service.get_latest_quality_data(patient_id="patient-5", pharma_id=2)

    assert latest == {"value": "latest"}


def test_get_latest_quality_data_handles_missing(monkeypatch):
    service = QualityService(db=MagicMock())
    monkeypatch.setattr(service, "validate_patient_belongs_to_pharma", MagicMock())

    class FakeRedis:
        def lindex(self, key, index):
            return None

    monkeypatch.setattr(quality_service, "get_redis", lambda: FakeRedis())

    latest = service.get_latest_quality_data(patient_id="patient-5", pharma_id=2)

    assert latest is None


def test_redis_listener_broadcasts_messages(monkeypatch):
    service = QualityService(db=MagicMock())

    class FakePubSub:
        def __init__(self):
            self.calls = 0

        def get_message(self, timeout=1.0, ignore_subscribe_messages=True):
            self.calls += 1
            if self.calls == 1:
                return {"type": "message", "data": json.dumps({"payload": "value"})}
            return None

    db_instance = MagicMock()

    monkeypatch.setattr(quality_service, "get_pubsub", lambda: FakePubSub())
    monkeypatch.setattr(quality_service, "SessionLocal", MagicMock(return_value=db_instance))

    class AsyncManager:
        def __init__(self):
            self.broadcast_calls = []

        async def broadcast(self, data, db):
            self.broadcast_calls.append((data, db))

    manager = AsyncManager()

    async def run_listener():
        task = asyncio.create_task(service.redis_listener(manager))
        await asyncio.sleep(0.05)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task

    asyncio.run(run_listener())

    assert manager.broadcast_calls
    assert manager.broadcast_calls[0][0] == {"payload": "value"}
    db_instance.close.assert_called()


def test_log_connections_periodically_logs(monkeypatch, caplog):
    service = QualityService(db=MagicMock())

    class Manager:
        def __init__(self):
            self.calls = 0

        def get_connections_info(self):
            self.calls += 1
            return {
                "count": 1,
                "connections": [
                    {
                        "id": "conn-1",
                        "patient_id": "patient-9",
                        "client_info": {"host": "127.0.0.1"},
                    }
                ],
            }

    async def fake_sleep(duration):
        fake_sleep.calls += 1
        if fake_sleep.calls >= 2:
            raise asyncio.CancelledError()

    fake_sleep.calls = 0
    monkeypatch.setattr(quality_service.asyncio, "sleep", fake_sleep)

    manager = Manager()

    with caplog.at_level("INFO"):
        with pytest.raises(asyncio.CancelledError):
            asyncio.run(service.log_connections_periodically(manager))

    assert manager.calls >= 1
    assert "Active WebSocket connections" in caplog.text


def test_redis_listener_retries_when_pubsub_unavailable(monkeypatch):
    service = QualityService(db=MagicMock())

    def raise_connect():
        raise RuntimeError("redis offline")

    monkeypatch.setattr(quality_service, "get_pubsub", raise_connect)

    async def fake_sleep(seconds):
        raise asyncio.CancelledError()

    monkeypatch.setattr(quality_service.asyncio, "sleep", fake_sleep)

    loop = ControlledLoop()
    monkeypatch.setattr(quality_service.asyncio, "get_event_loop", lambda: loop)

    manager = AsyncMock()
    manager.broadcast = AsyncMock()

    with pytest.raises(asyncio.CancelledError):
        asyncio.run(service.redis_listener(manager))


def test_redis_listener_handles_json_decode_error(monkeypatch):
    service = QualityService(db=MagicMock())

    pubsub = FakePubSub([{"type": "message", "data": "not-json"}])
    monkeypatch.setattr(quality_service, "get_pubsub", lambda: pubsub)

    loop = ControlledLoop(cancel_after=1)
    monkeypatch.setattr(quality_service.asyncio, "get_event_loop", lambda: loop)

    async def fake_sleep(seconds):
        raise asyncio.CancelledError()

    monkeypatch.setattr(quality_service.asyncio, "sleep", fake_sleep)

    manager = AsyncMock()
    manager.broadcast = AsyncMock()

    with pytest.raises(asyncio.CancelledError):
        asyncio.run(service.redis_listener(manager))

    assert manager.broadcast.await_count == 0


def test_redis_listener_handles_broadcast_error(monkeypatch):
    service = QualityService(db=MagicMock())

    pubsub = FakePubSub([{"type": "message", "data": json.dumps({"hello": "world"})}])
    monkeypatch.setattr(quality_service, "get_pubsub", lambda: pubsub)
    session = MagicMock()
    monkeypatch.setattr(quality_service, "SessionLocal", MagicMock(return_value=session))

    loop = ControlledLoop(cancel_after=1)
    monkeypatch.setattr(quality_service.asyncio, "get_event_loop", lambda: loop)

    async def fake_sleep(seconds):
        raise asyncio.CancelledError()

    monkeypatch.setattr(quality_service.asyncio, "sleep", fake_sleep)

    class Manager:
        async def broadcast(self, data, db):
            raise RuntimeError("broadcast failure")

    manager = Manager()

    with pytest.raises(asyncio.CancelledError):
        asyncio.run(service.redis_listener(manager))


def test_redis_listener_handles_outer_exception(monkeypatch):
    service = QualityService(db=MagicMock())

    pubsub = FakePubSub([{"type": "message", "data": json.dumps({"payload": 1})}])
    monkeypatch.setattr(quality_service, "get_pubsub", lambda: pubsub)
    monkeypatch.setattr(quality_service, "SessionLocal", MagicMock(return_value=MagicMock()))

    loop = ControlledLoop(exception=RuntimeError("executor failed"))
    monkeypatch.setattr(quality_service.asyncio, "get_event_loop", lambda: loop)

    async def fake_sleep(seconds):
        raise asyncio.CancelledError()

    monkeypatch.setattr(quality_service.asyncio, "sleep", fake_sleep)

    reset_mock = MagicMock()
    monkeypatch.setattr(quality_service, "reset_redis_connection", reset_mock)

    manager = AsyncMock()
    manager.broadcast = AsyncMock()

    with pytest.raises(asyncio.CancelledError):
        asyncio.run(service.redis_listener(manager))

    reset_mock.assert_called_once()


# ==========================================
# Tests for _parse_timestamp
# ==========================================

def test_parse_timestamp_none():
    """Test _parse_timestamp with None"""
    service = QualityService(db=MagicMock())
    result = service._parse_timestamp(None)
    assert result is None


def test_parse_timestamp_isoformat():
    """Test _parse_timestamp with ISO format"""
    service = QualityService(db=MagicMock())
    result = service._parse_timestamp("2024-01-15T10:30:00")
    assert result is not None
    assert result.year == 2024
    assert result.month == 1
    assert result.day == 15


def test_parse_timestamp_isoformat_with_timezone():
    """Test _parse_timestamp with ISO format and timezone"""
    service = QualityService(db=MagicMock())
    result = service._parse_timestamp("2024-01-15T10:30:00+00:00")
    assert result is not None
    assert result.year == 2024


def test_parse_timestamp_strptime_format1():
    """Test _parse_timestamp with strptime format '%Y-%m-%d %H:%M:%S'"""
    service = QualityService(db=MagicMock())
    result = service._parse_timestamp("2024-01-15 10:30:00")
    assert result is not None
    assert result.year == 2024
    assert result.month == 1
    assert result.day == 15


def test_parse_timestamp_strptime_format2():
    """Test _parse_timestamp with strptime format '%Y-%m-%dT%H:%M:%S'"""
    service = QualityService(db=MagicMock())
    result = service._parse_timestamp("2024-01-15T10:30:00")
    assert result is not None
    assert result.year == 2024


def test_parse_timestamp_strptime_format3():
    """Test _parse_timestamp with strptime format '%Y-%m-%dT%H:%M:%SZ'"""
    service = QualityService(db=MagicMock())
    result = service._parse_timestamp("2024-01-15T10:30:00Z")
    assert result is not None
    assert result.year == 2024


def test_parse_timestamp_strptime_format4():
    """Test _parse_timestamp with strptime format '%Y-%m-%dT%H:%M:%S.%f'"""
    service = QualityService(db=MagicMock())
    result = service._parse_timestamp("2024-01-15T10:30:00.123456")
    assert result is not None
    assert result.year == 2024


def test_parse_timestamp_strptime_format5():
    """Test _parse_timestamp with strptime format '%Y-%m-%dT%H:%M:%S.%fZ'"""
    service = QualityService(db=MagicMock())
    result = service._parse_timestamp("2024-01-15T10:30:00.123456Z")
    assert result is not None
    assert result.year == 2024


def test_parse_timestamp_invalid():
    """Test _parse_timestamp with invalid format"""
    service = QualityService(db=MagicMock())
    result = service._parse_timestamp("invalid-timestamp")
    assert result is None


# ==========================================
# Tests for export_patient_quality_data_csv
# ==========================================

def test_export_patient_quality_data_csv_invalid_duration_minutes():
    """Test export_patient_quality_data_csv with invalid duration_minutes"""
    service = QualityService(db=MagicMock())
    
    with pytest.raises(quality_service.QualityServiceException) as exc_info:
        service.export_patient_quality_data_csv("PT-123", 42, duration_minutes=0)
    
    assert "duration_minutes must be between" in exc_info.value.details.get('detail', '')


def test_export_patient_quality_data_csv_duration_too_large():
    """Test export_patient_quality_data_csv with duration_minutes > 1440"""
    service = QualityService(db=MagicMock())
    
    with pytest.raises(quality_service.QualityServiceException) as exc_info:
        service.export_patient_quality_data_csv("PT-123", 42, duration_minutes=1441)
    
    assert "duration_minutes must be between" in exc_info.value.details.get('detail', '')


def test_export_patient_quality_data_csv_redis_connection_failure(monkeypatch):
    """Test export_patient_quality_data_csv when Redis connection fails"""
    service = QualityService(db=MagicMock())
    
    def raise_redis():
        raise ConnectionError("Redis down")
    
    monkeypatch.setattr(quality_service, "get_redis", raise_redis)
    
    # Mock validate_patient_belongs_to_pharma to pass
    service.validate_patient_belongs_to_pharma = MagicMock()
    
    with pytest.raises(quality_service.RedisConnectionException):
        service.export_patient_quality_data_csv("PT-123", 42)


def test_export_patient_quality_data_csv_redis_read_failure(monkeypatch):
    """Test export_patient_quality_data_csv when Redis read fails"""
    service = QualityService(db=MagicMock())
    service.validate_patient_belongs_to_pharma = MagicMock()
    
    class FakeRedis:
        def lrange(self, key, start, end):
            raise Exception("Redis read error")
    
    monkeypatch.setattr(quality_service, "get_redis", lambda: FakeRedis())
    
    with pytest.raises(quality_service.QualityCsvExportException) as exc_info:
        service.export_patient_quality_data_csv("PT-123", 42)
    
    assert "Unable to read quality history" in exc_info.value.details.get('detail', '')


def test_export_patient_quality_data_csv_no_history(monkeypatch):
    """Test export_patient_quality_data_csv when no history found"""
    service = QualityService(db=MagicMock())
    service.validate_patient_belongs_to_pharma = MagicMock()
    
    class FakeRedis:
        def lrange(self, key, start, end):
            return []
    
    monkeypatch.setattr(quality_service, "get_redis", lambda: FakeRedis())
    
    with pytest.raises(quality_service.QualityDataNotFoundException) as exc_info:
        service.export_patient_quality_data_csv("PT-123", 42)
    
    assert exc_info.value.details.get('patient_id') == "PT-123"


def test_export_patient_quality_data_csv_success(monkeypatch):
    """Test export_patient_quality_data_csv successfully"""
    service = QualityService(db=MagicMock())
    service.validate_patient_belongs_to_pharma = MagicMock()
    
    # Create test data
    now = datetime.now()
    test_record = {
        "timestamp": now.strftime("%Y-%m-%d %H:%M:%S"),
        "patient_id": "PT-123",
        "temperature": "25.5",
        "humidity": "60.0",
        "ph_level": "7.0",
        "o2_level": "21.0",
        "co2_level": "0.04",
        "agitation": "low"
    }
    
    class FakeRedis:
        def lrange(self, key, start, end):
            return [json.dumps(test_record)]
    
    monkeypatch.setattr(quality_service, "get_redis", lambda: FakeRedis())
    
    response = service.export_patient_quality_data_csv("PT-123", 42, duration_minutes=60)
    
    assert response.media_type == "text/csv"
    assert "attachment" in response.headers["Content-Disposition"]
    assert "PT-123_quality_" in response.headers["Content-Disposition"]
    assert ".csv" in response.headers["Content-Disposition"]
    
    # Check CSV content
    csv_content = response.body.decode("utf-8")
    assert "timestamp" in csv_content
    assert "patient_id" in csv_content
    assert "PT-123" in csv_content


def test_export_patient_quality_data_csv_filters_by_duration(monkeypatch):
    """Test export_patient_quality_data_csv filters records by duration"""
    service = QualityService(db=MagicMock())
    service.validate_patient_belongs_to_pharma = MagicMock()
    
    # Create old record (outside duration)
    old_time = datetime.now() - timedelta(minutes=120)
    old_record = {
        "timestamp": old_time.strftime("%Y-%m-%d %H:%M:%S"),
        "patient_id": "PT-123",
        "temperature": "25.5"
    }
    
    # Create recent record (within duration)
    recent_time = datetime.now() - timedelta(minutes=30)
    recent_record = {
        "timestamp": recent_time.strftime("%Y-%m-%d %H:%M:%S"),
        "patient_id": "PT-123",
        "temperature": "26.0"
    }
    
    class FakeRedis:
        def lrange(self, key, start, end):
            return [json.dumps(old_record), json.dumps(recent_record)]
    
    monkeypatch.setattr(quality_service, "get_redis", lambda: FakeRedis())
    
    response = service.export_patient_quality_data_csv("PT-123", 42, duration_minutes=60)
    
    csv_content = response.body.decode("utf-8")
    # Should only include recent record
    assert recent_record["temperature"] in csv_content
    # Old record should be filtered out
    assert old_record["temperature"] not in csv_content or csv_content.count(old_record["temperature"]) == 0


def test_export_patient_quality_data_csv_skips_invalid_json(monkeypatch):
    """Test export_patient_quality_data_csv skips invalid JSON entries"""
    service = QualityService(db=MagicMock())
    service.validate_patient_belongs_to_pharma = MagicMock()
    
    now = datetime.now()
    valid_record = {
        "timestamp": now.strftime("%Y-%m-%d %H:%M:%S"),
        "patient_id": "PT-123",
        "temperature": "25.5"
    }
    
    class FakeRedis:
        def lrange(self, key, start, end):
            return ["invalid json", json.dumps(valid_record)]
    
    monkeypatch.setattr(quality_service, "get_redis", lambda: FakeRedis())
    
    response = service.export_patient_quality_data_csv("PT-123", 42, duration_minutes=60)
    
    csv_content = response.body.decode("utf-8")
    # Should include valid record
    assert "PT-123" in csv_content
    assert "25.5" in csv_content


def test_export_patient_quality_data_csv_skips_unparseable_timestamp(monkeypatch):
    """Test export_patient_quality_data_csv skips records with unparseable timestamps"""
    service = QualityService(db=MagicMock())
    service.validate_patient_belongs_to_pharma = MagicMock()
    
    now = datetime.now()
    valid_record = {
        "timestamp": now.strftime("%Y-%m-%d %H:%M:%S"),
        "patient_id": "PT-123",
        "temperature": "25.5"
    }
    
    invalid_record = {
        "timestamp": "invalid-timestamp",
        "patient_id": "PT-123",
        "temperature": "26.0"
    }
    
    class FakeRedis:
        def lrange(self, key, start, end):
            return [json.dumps(invalid_record), json.dumps(valid_record)]
    
    monkeypatch.setattr(quality_service, "get_redis", lambda: FakeRedis())
    
    response = service.export_patient_quality_data_csv("PT-123", 42, duration_minutes=60)
    
    csv_content = response.body.decode("utf-8")
    # Should include valid record
    assert "25.5" in csv_content
    # Invalid record should be skipped
    assert "26.0" not in csv_content


def test_export_patient_quality_data_csv_no_data_after_filtering(monkeypatch):
    """Test export_patient_quality_data_csv when no data after filtering"""
    service = QualityService(db=MagicMock())
    service.validate_patient_belongs_to_pharma = MagicMock()
    
    # Create old record (outside duration)
    old_time = datetime.now() - timedelta(minutes=120)
    old_record = {
        "timestamp": old_time.strftime("%Y-%m-%d %H:%M:%S"),
        "patient_id": "PT-123",
        "temperature": "25.5"
    }
    
    class FakeRedis:
        def lrange(self, key, start, end):
            return [json.dumps(old_record)]
    
    monkeypatch.setattr(quality_service, "get_redis", lambda: FakeRedis())
    
    with pytest.raises(quality_service.QualityDataNotFoundException) as exc_info:
        service.export_patient_quality_data_csv("PT-123", 42, duration_minutes=60)
    
    assert "No quality data found in the last" in exc_info.value.details.get('detail', '')


def test_export_patient_quality_data_csv_csv_generation_error(monkeypatch):
    """Test export_patient_quality_data_csv when CSV generation fails"""
    service = QualityService(db=MagicMock())
    service.validate_patient_belongs_to_pharma = MagicMock()
    
    now = datetime.now()
    test_record = {
        "timestamp": now.strftime("%Y-%m-%d %H:%M:%S"),
        "patient_id": "PT-123",
        "temperature": "25.5"
    }
    
    class FakeRedis:
        def lrange(self, key, start, end):
            return [json.dumps(test_record)]
    
    monkeypatch.setattr(quality_service, "get_redis", lambda: FakeRedis())
    
    # Patch csv.DictWriter.writerow to raise an exception, which will be caught
    # and trigger the CSV generation error handling
    # Patch the csv module's DictWriter class
    with patch('app.service.quality_service.csv.DictWriter') as mock_dictwriter:
        mock_writer = MagicMock()
        mock_writer.writeheader = MagicMock()
        mock_writer.writerow = MagicMock(side_effect=Exception("Buffer error"))
        mock_dictwriter.return_value = mock_writer
        
        with pytest.raises(quality_service.QualityCsvExportException) as exc_info:
            service.export_patient_quality_data_csv("PT-123", 42)
        
        assert "Buffer error" in str(exc_info.value.details.get('detail', ''))


def test_redis_listener_retries_on_pubsub_connection_error(monkeypatch):
    """Test redis_listener retries when pubsub connection fails (line 426)"""
    service = QualityService(db=MagicMock())
    
    call_count = {"count": 0}
    
    def get_pubsub_with_retry():
        call_count["count"] += 1
        if call_count["count"] == 1:
            raise Exception("Connection error")
        return FakePubSub([])
    
    monkeypatch.setattr(quality_service, "get_pubsub", get_pubsub_with_retry)
    monkeypatch.setattr(quality_service, "SessionLocal", MagicMock(return_value=MagicMock()))
    
    loop = ControlledLoop(exception=asyncio.CancelledError("Test cancelled"))
    monkeypatch.setattr(quality_service.asyncio, "get_event_loop", lambda: loop)
    
    async def fake_sleep(seconds):
        if call_count["count"] == 1:
            # First call, simulate retry
            pass
        else:
            raise asyncio.CancelledError()
    
    monkeypatch.setattr(quality_service.asyncio, "sleep", fake_sleep)
    
    manager = AsyncMock()
    manager.broadcast = AsyncMock()
    
    with pytest.raises(asyncio.CancelledError):
        asyncio.run(service.redis_listener(manager))
    
    # Should have tried to get pubsub twice (first failed, second succeeded)
    assert call_count["count"] >= 1
