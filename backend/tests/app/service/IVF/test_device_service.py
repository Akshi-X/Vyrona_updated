"""
Unit tests for Device Service
"""
import pytest
from unittest.mock import MagicMock, Mock
from datetime import datetime, timezone

from app.service.IVF.device_service import (
    create_device,
    get_device_by_id,
    get_devices,
    update_device,
    delete_device,
)
from app.schemas.IVF.device_schema import DeviceCreate, DeviceUpdate


@pytest.fixture
def db_session():
    return MagicMock()


@pytest.fixture
def mock_device():
    device = Mock()
    device.id = 1
    device.branch_id = 1
    device.device_code = "J712149"
    device.created_at = datetime.now(timezone.utc)
    device.updated_at = None
    return device


def test_create_device_success(db_session, mock_device, monkeypatch):
    """Test creating a device successfully"""
    from app.service.IVF import device_service
    monkeypatch.setattr(device_service, "Device", lambda **kw: mock_device)

    data = DeviceCreate(branch_id=1, device_code="J712149")
    result = create_device(db_session, data)

    assert result == mock_device
    db_session.add.assert_called_once_with(mock_device)
    db_session.commit.assert_called_once()
    db_session.refresh.assert_called_once_with(mock_device)


def test_get_device_by_id_found(db_session, mock_device):
    """Test get device by ID when found"""
    query = MagicMock()
    query.filter.return_value = query
    query.first.return_value = mock_device
    db_session.query.return_value = query

    result = get_device_by_id(db_session, 1)
    assert result == mock_device
    db_session.query.assert_called_once()


def test_get_device_by_id_not_found(db_session):
    """Test get device by ID when not found"""
    query = MagicMock()
    query.filter.return_value = query
    query.first.return_value = None
    db_session.query.return_value = query

    result = get_device_by_id(db_session, 999)
    assert result is None


def test_get_devices_list(db_session, mock_device):
    """Test listing devices"""
    query = MagicMock()
    query.filter.return_value = query
    query.order_by.return_value = query
    query.offset.return_value = query
    query.limit.return_value = query
    query.count.return_value = 1
    query.all.return_value = [mock_device]
    db_session.query.return_value = query

    devices, count = get_devices(db_session, skip=0, limit=10)
    assert len(devices) == 1
    assert count == 1
    assert devices[0] == mock_device


def test_get_devices_with_branch_filter(db_session, mock_device):
    """Test listing devices with branch filter"""
    query = MagicMock()
    query.filter.return_value = query
    query.order_by.return_value = query
    query.offset.return_value = query
    query.limit.return_value = query
    query.count.return_value = 1
    query.all.return_value = [mock_device]
    db_session.query.return_value = query

    devices, count = get_devices(db_session, branch_id=1)
    assert count == 1
    query.filter.assert_called()


def test_update_device_success(db_session, mock_device):
    """Test updating a device"""
    query = MagicMock()
    query.filter.return_value = query
    query.first.return_value = mock_device
    db_session.query.return_value = query

    data = DeviceUpdate(device_code="NEW_CODE")
    result = update_device(db_session, 1, data)

    assert result == mock_device
    assert mock_device.device_code == "NEW_CODE"
    db_session.commit.assert_called_once()


def test_update_device_not_found(db_session):
    """Test update when device not found"""
    query = MagicMock()
    query.filter.return_value = query
    query.first.return_value = None
    db_session.query.return_value = query

    result = update_device(db_session, 999, DeviceUpdate(device_code="X"))
    assert result is None


def test_delete_device_success(db_session, mock_device):
    """Test deleting a device"""
    query = MagicMock()
    query.filter.return_value = query
    query.first.return_value = mock_device
    db_session.query.return_value = query

    result = delete_device(db_session, 1)
    assert result is True
    db_session.delete.assert_called_once_with(mock_device)
    db_session.commit.assert_called_once()


def test_delete_device_not_found(db_session):
    """Test delete when device not found"""
    query = MagicMock()
    query.filter.return_value = query
    query.first.return_value = None
    db_session.query.return_value = query

    result = delete_device(db_session, 999)
    assert result is False
