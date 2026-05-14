"""
Unit tests for LN2 IoT Device Service
"""
import pytest
from unittest.mock import MagicMock, Mock
from datetime import datetime, timezone

from app.service.IVF.ln2_iot_device_service import (
    create_ln2_iot_device,
    get_ln2_iot_device_by_id,
    get_ln2_iot_devices,
    update_ln2_iot_device,
    delete_ln2_iot_device,
)
from app.schemas.IVF.ln2_iot_device_schema import Ln2IotDeviceCreate, Ln2IotDeviceUpdate


@pytest.fixture
def db_session():
    return MagicMock()


@pytest.fixture
def mock_ln2_iot_device():
    d = Mock()
    d.id = 1
    d.tank_id = 1
    d.device_id = 1
    d.tank_max_capacity_reading = 100.0
    d.tank_min_capacity_reading = 10.0
    d.created_at = datetime.now(timezone.utc)
    d.updated_at = None
    return d


def test_create_ln2_iot_device_success(db_session, mock_ln2_iot_device, monkeypatch):
    """Test creating LN2 IoT device mapping"""
    from app.service.IVF import ln2_iot_device_service
    monkeypatch.setattr(ln2_iot_device_service, "Ln2IotDevice", lambda **kw: mock_ln2_iot_device)

    data = Ln2IotDeviceCreate(tank_id=1, device_id=1, tank_max_capacity_reading=100.0)
    result = create_ln2_iot_device(db_session, data)
    assert result == mock_ln2_iot_device
    db_session.add.assert_called_once()
    db_session.commit.assert_called_once()


def test_get_ln2_iot_device_by_id_found(db_session, mock_ln2_iot_device):
    """Test get by ID when found"""
    query = MagicMock()
    query.filter.return_value = query
    query.first.return_value = mock_ln2_iot_device
    db_session.query.return_value = query
    result = get_ln2_iot_device_by_id(db_session, 1)
    assert result == mock_ln2_iot_device


def test_get_ln2_iot_devices_list(db_session, mock_ln2_iot_device):
    """Test listing LN2 IoT devices"""
    query = MagicMock()
    query.filter.return_value = query
    query.order_by.return_value = query
    query.offset.return_value = query
    query.limit.return_value = query
    query.count.return_value = 1
    query.all.return_value = [mock_ln2_iot_device]
    db_session.query.return_value = query

    devices, count = get_ln2_iot_devices(db_session)
    assert len(devices) == 1
    assert count == 1


def test_update_ln2_iot_device_success(db_session, mock_ln2_iot_device):
    """Test updating LN2 IoT device"""
    query = MagicMock()
    query.filter.return_value = query
    query.first.return_value = mock_ln2_iot_device
    db_session.query.return_value = query

    data = Ln2IotDeviceUpdate(tank_min_capacity_reading=15.0)
    result = update_ln2_iot_device(db_session, 1, data)
    assert result == mock_ln2_iot_device
    assert mock_ln2_iot_device.tank_min_capacity_reading == 15.0


def test_delete_ln2_iot_device_success(db_session, mock_ln2_iot_device):
    """Test deleting LN2 IoT device"""
    query = MagicMock()
    query.filter.return_value = query
    query.first.return_value = mock_ln2_iot_device
    db_session.query.return_value = query

    result = delete_ln2_iot_device(db_session, 1)
    assert result is True
    db_session.delete.assert_called_once_with(mock_ln2_iot_device)
