import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime

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


def test_parse_timestamp_none():
    """Test _parse_timestamp with None"""
    result = QualityService._parse_timestamp(None)
    assert result is None


def test_parse_timestamp_fromisoformat():
    """Test _parse_timestamp with fromisoformat"""
    result = QualityService._parse_timestamp("2024-01-01T10:00:00")
    assert result is not None
    assert isinstance(result, datetime)


def test_parse_timestamp_fromisoformat_with_tz():
    """Test _parse_timestamp with fromisoformat and timezone"""
    result = QualityService._parse_timestamp("2024-01-01T10:00:00+00:00")
    assert result is not None
    assert isinstance(result, datetime)


def test_parse_timestamp_strptime_formats():
    """Test _parse_timestamp with various strptime formats"""
    formats = [
        ("2024-01-01 10:00:00", "%Y-%m-%d %H:%M:%S"),
        ("2024-01-01T10:00:00", "%Y-%m-%dT%H:%M:%S"),
        ("2024-01-01T10:00:00Z", "%Y-%m-%dT%H:%M:%SZ"),
        ("2024-01-01T10:00:00.123456", "%Y-%m-%dT%H:%M:%S.%f"),
        ("2024-01-01T10:00:00.123456Z", "%Y-%m-%dT%H:%M:%S.%fZ"),
    ]
    
    for timestamp_str, _ in formats:
        result = QualityService._parse_timestamp(timestamp_str)
        assert result is not None
        assert isinstance(result, datetime)


def test_parse_timestamp_invalid():
    """Test _parse_timestamp with invalid format"""
    result = QualityService._parse_timestamp("invalid-timestamp")
    assert result is None


def test_export_patient_quality_data_csv_invalid_duration(monkeypatch):
    """Test export_patient_quality_data_csv with invalid duration"""
    service = QualityService(db=MagicMock())
    
    from app.exceptions.quality_exceptions import QualityServiceException
    
    with pytest.raises(QualityServiceException):
        service.export_patient_quality_data_csv("patient-1", 1, duration_minutes=0)
    
    with pytest.raises(QualityServiceException):
        service.export_patient_quality_data_csv("patient-1", 1, duration_minutes=1441)


def test_export_patient_quality_data_csv_redis_connection_error(monkeypatch):
    """Test export_patient_quality_data_csv when Redis connection fails"""
    service = QualityService(db=MagicMock())
    monkeypatch.setattr(service, "validate_patient_belongs_to_pharma", MagicMock(return_value=True))
    
    def raise_redis():
        raise ConnectionError("Redis down")
    
    monkeypatch.setattr(quality_service, "get_redis", raise_redis)
    
    from app.exceptions.quality_exceptions import RedisConnectionException
    
    with pytest.raises(RedisConnectionException):
        service.export_patient_quality_data_csv("patient-1", 1)


def test_export_patient_quality_data_csv_redis_read_error(monkeypatch):
    """Test export_patient_quality_data_csv when Redis read fails"""
    service = QualityService(db=MagicMock())
    monkeypatch.setattr(service, "validate_patient_belongs_to_pharma", MagicMock(return_value=True))
    
    class FakeRedis:
        def lrange(self, key, start, end):
            raise Exception("Read failed")
    
    monkeypatch.setattr(quality_service, "get_redis", lambda: FakeRedis())
    
    from app.exceptions.quality_exceptions import QualityCsvExportException
    
    with pytest.raises(QualityCsvExportException):
        service.export_patient_quality_data_csv("patient-1", 1)


def test_export_patient_quality_data_csv_no_data(monkeypatch):
    """Test export_patient_quality_data_csv when no data found"""
    service = QualityService(db=MagicMock())
    monkeypatch.setattr(service, "validate_patient_belongs_to_pharma", MagicMock(return_value=True))
    
    class FakeRedis:
        def lrange(self, key, start, end):
            return []
    
    monkeypatch.setattr(quality_service, "get_redis", lambda: FakeRedis())
    
    from app.exceptions.quality_exceptions import QualityDataNotFoundException
    
    with pytest.raises(QualityDataNotFoundException):
        service.export_patient_quality_data_csv("patient-1", 1)


def test_export_patient_quality_data_csv_success(monkeypatch):
    """Test successful export_patient_quality_data_csv"""
    service = QualityService(db=MagicMock())
    monkeypatch.setattr(service, "validate_patient_belongs_to_pharma", MagicMock(return_value=True))
    
    from datetime import datetime, timedelta
    
    now = datetime.now()
    recent_time = (now - timedelta(minutes=5)).isoformat()
    
    class FakeRedis:
        def lrange(self, key, start, end):
            return [
                json.dumps({
                    "timestamp": recent_time,
                    "patient_id": "patient-1",
                    "temperature": 25.5,
                    "humidity": 60.0,
                    "ph_level": 7.0,
                    "o2_level": 20.0,
                    "co2_level": 0.04,
                    "agitation": 100
                })
            ]
    
    monkeypatch.setattr(quality_service, "get_redis", lambda: FakeRedis())
    
    response = service.export_patient_quality_data_csv("patient-1", 1, duration_minutes=10)
    
    assert response is not None
    assert response.media_type == "text/csv"
    assert "attachment" in response.headers["Content-Disposition"]
    assert "patient-1_quality_" in response.headers["Content-Disposition"]


def test_export_patient_quality_data_csv_invalid_json(monkeypatch):
    """Test export_patient_quality_data_csv with invalid JSON"""
    service = QualityService(db=MagicMock())
    monkeypatch.setattr(service, "validate_patient_belongs_to_pharma", MagicMock(return_value=True))
    
    from datetime import datetime, timedelta
    
    now = datetime.now()
    recent_time = (now - timedelta(minutes=5)).isoformat()
    
    class FakeRedis:
        def lrange(self, key, start, end):
            return [
                "invalid-json",
                json.dumps({
                    "timestamp": recent_time,
                    "patient_id": "patient-1",
                    "temperature": 25.5,
                    "humidity": 60.0,
                    "ph_level": 7.0,
                    "o2_level": 20.0,
                    "co2_level": 0.04,
                    "agitation": 100
                })
            ]
    
    monkeypatch.setattr(quality_service, "get_redis", lambda: FakeRedis())
    
    response = service.export_patient_quality_data_csv("patient-1", 1, duration_minutes=10)
    
    # Should skip invalid JSON and continue
    assert response is not None


def test_export_patient_quality_data_csv_unparseable_timestamp(monkeypatch):
    """Test export_patient_quality_data_csv with unparseable timestamp"""
    service = QualityService(db=MagicMock())
    monkeypatch.setattr(service, "validate_patient_belongs_to_pharma", MagicMock(return_value=True))
    
    from datetime import datetime, timedelta
    
    now = datetime.now()
    recent_time = (now - timedelta(minutes=5)).isoformat()
    
    class FakeRedis:
        def lrange(self, key, start, end):
            return [
                json.dumps({
                    "timestamp": "invalid-timestamp",
                    "patient_id": "patient-1"
                }),
                json.dumps({
                    "timestamp": recent_time,
                    "patient_id": "patient-1",
                    "temperature": 25.5,
                    "humidity": 60.0,
                    "ph_level": 7.0,
                    "o2_level": 20.0,
                    "co2_level": 0.04,
                    "agitation": 100
                })
            ]
    
    monkeypatch.setattr(quality_service, "get_redis", lambda: FakeRedis())
    
    response = service.export_patient_quality_data_csv("patient-1", 1, duration_minutes=10)
    
    # Should skip unparseable timestamp and continue
    assert response is not None


def test_export_patient_quality_data_csv_old_data_filtered(monkeypatch):
    """Test export_patient_quality_data_csv filters old data"""
    service = QualityService(db=MagicMock())
    monkeypatch.setattr(service, "validate_patient_belongs_to_pharma", MagicMock(return_value=True))
    
    from datetime import datetime, timedelta
    
    now = datetime.now()
    old_time = (now - timedelta(minutes=20)).isoformat()
    recent_time = (now - timedelta(minutes=5)).isoformat()
    
    class FakeRedis:
        def lrange(self, key, start, end):
            return [
                json.dumps({
                    "timestamp": old_time,
                    "patient_id": "patient-1"
                }),
                json.dumps({
                    "timestamp": recent_time,
                    "patient_id": "patient-1",
                    "temperature": 25.5,
                    "humidity": 60.0,
                    "ph_level": 7.0,
                    "o2_level": 20.0,
                    "co2_level": 0.04,
                    "agitation": 100
                })
            ]
    
    monkeypatch.setattr(quality_service, "get_redis", lambda: FakeRedis())
    
    response = service.export_patient_quality_data_csv("patient-1", 1, duration_minutes=10)
    
    # Should only include recent data
    assert response is not None
    csv_content = response.body.decode("utf-8")
    assert "patient-1" in csv_content
    # Old data should be filtered out


def test_export_patient_quality_data_csv_no_data_in_window(monkeypatch):
    """Test export_patient_quality_data_csv when no data in time window"""
    service = QualityService(db=MagicMock())
    monkeypatch.setattr(service, "validate_patient_belongs_to_pharma", MagicMock(return_value=True))
    
    from datetime import datetime, timedelta
    
    now = datetime.now()
    old_time = (now - timedelta(minutes=20)).isoformat()
    
    class FakeRedis:
        def lrange(self, key, start, end):
            return [
                json.dumps({
                    "timestamp": old_time,
                    "patient_id": "patient-1"
                })
            ]
    
    monkeypatch.setattr(quality_service, "get_redis", lambda: FakeRedis())
    
    from app.exceptions.quality_exceptions import QualityDataNotFoundException
    
    with pytest.raises(QualityDataNotFoundException):
        service.export_patient_quality_data_csv("patient-1", 1, duration_minutes=10)


def test_export_patient_quality_data_csv_csv_generation_error(monkeypatch):
    """Test export_patient_quality_data_csv when CSV generation fails"""
    service = QualityService(db=MagicMock())
    monkeypatch.setattr(service, "validate_patient_belongs_to_pharma", MagicMock(return_value=True))
    
    from datetime import datetime, timedelta
    
    now = datetime.now()
    recent_time = (now - timedelta(minutes=5)).isoformat()
    
    class FakeRedis:
        def lrange(self, key, start, end):
            return [
                json.dumps({
                    "timestamp": recent_time,
                    "patient_id": "patient-1",
                    "temperature": 25.5,
                    "humidity": 60.0,
                    "ph_level": 7.0,
                    "o2_level": 20.0,
                    "co2_level": 0.04,
                    "agitation": 100
                })
            ]
    
    monkeypatch.setattr(quality_service, "get_redis", lambda: FakeRedis())
    
    # Mock csv.DictWriter to raise exception
    with patch('app.service.quality_service.csv.DictWriter') as mock_writer:
        mock_writer.side_effect = Exception("CSV error")
        
        from app.exceptions.quality_exceptions import QualityCsvExportException
        
        with pytest.raises(QualityCsvExportException):
            service.export_patient_quality_data_csv("patient-1", 1, duration_minutes=10)