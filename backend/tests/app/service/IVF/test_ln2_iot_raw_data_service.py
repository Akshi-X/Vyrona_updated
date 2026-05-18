"""
Unit tests for LN2 IoT Raw Data Service
"""
import pytest
from unittest.mock import MagicMock, Mock
from datetime import datetime, timezone

from app.service.IVF.ln2_iot_raw_data_service import (
    create_ln2_iot_raw_data,
    get_ln2_iot_raw_data_by_id,
    get_ln2_iot_raw_data_list,
    update_ln2_iot_raw_data,
    delete_ln2_iot_raw_data,
)
from app.schemas.IVF.ln2_iot_raw_data_schema import Ln2IotRawDataCreate, Ln2IotRawDataUpdate


@pytest.fixture
def db_session():
    return MagicMock()


@pytest.fixture
def mock_raw_data():
    r = Mock()
    r.id = 1
    r.tank_id = 1
    r.device_id = "J712149"
    r.raw_data = 85.5
    r.payload = {"temp": 25.2}
    r.created_at = datetime.now(timezone.utc)
    r.updated_at = None
    return r


def test_create_ln2_iot_raw_data_success(db_session, mock_raw_data, monkeypatch):
    """Test creating LN2 IoT raw data"""
    from app.service.IVF import ln2_iot_raw_data_service
    monkeypatch.setattr(ln2_iot_raw_data_service, "Ln2IotRawData", lambda **kw: mock_raw_data)

    data = Ln2IotRawDataCreate(tank_id=1, device_id="J712149", raw_data=85.5, payload={"temp": 25.2})
    result = create_ln2_iot_raw_data(db_session, data)
    assert result == mock_raw_data
    db_session.add.assert_called_once()
    db_session.commit.assert_called_once()


def test_get_ln2_iot_raw_data_by_id_found(db_session, mock_raw_data):
    """Test get by ID when found"""
    query = MagicMock()
    query.filter.return_value = query
    query.first.return_value = mock_raw_data
    db_session.query.return_value = query
    result = get_ln2_iot_raw_data_by_id(db_session, 1)
    assert result == mock_raw_data


def test_get_ln2_iot_raw_data_list(db_session, mock_raw_data):
    """Test listing raw data"""
    query = MagicMock()
    query.filter.return_value = query
    query.order_by.return_value = query
    query.offset.return_value = query
    query.limit.return_value = query
    query.count.return_value = 1
    query.all.return_value = [mock_raw_data]
    db_session.query.return_value = query

    records, count = get_ln2_iot_raw_data_list(db_session)
    assert len(records) == 1
    assert count == 1


def test_update_ln2_iot_raw_data_success(db_session, mock_raw_data):
    """Test updating raw data"""
    query = MagicMock()
    query.filter.return_value = query
    query.first.return_value = mock_raw_data
    db_session.query.return_value = query

    data = Ln2IotRawDataUpdate(raw_data=90.0)
    result = update_ln2_iot_raw_data(db_session, 1, data)
    assert result == mock_raw_data
    assert mock_raw_data.raw_data == 90.0


def test_delete_ln2_iot_raw_data_success(db_session, mock_raw_data):
    """Test deleting raw data"""
    query = MagicMock()
    query.filter.return_value = query
    query.first.return_value = mock_raw_data
    db_session.query.return_value = query

    result = delete_ln2_iot_raw_data(db_session, 1)
    assert result is True
