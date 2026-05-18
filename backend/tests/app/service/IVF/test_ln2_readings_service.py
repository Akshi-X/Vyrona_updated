"""
Unit tests for LN2 Readings Service
"""
import pytest
from unittest.mock import MagicMock, Mock
from datetime import datetime, timezone

from app.service.IVF.ln2_readings_service import (
    create_ln2_reading,
    get_ln2_reading_by_id,
    get_ln2_readings,
    update_ln2_reading,
    delete_ln2_reading,
)
from app.schemas.IVF.ln2_readings_schema import Ln2ReadingCreate, Ln2ReadingUpdate


@pytest.fixture
def db_session():
    return MagicMock()


@pytest.fixture
def mock_reading():
    r = Mock()
    r.id = 1
    r.device_id = 1
    r.evaporation_rate_kg_per_h = 0.05
    r.ln2_mass_kg = 12.5
    r.reading_timestamp = datetime.now(timezone.utc)
    r.created_at = datetime.now(timezone.utc)
    r.updated_at = None
    return r


def test_create_ln2_reading_success(db_session, mock_reading, monkeypatch):
    """Test creating LN2 reading"""
    from app.service.IVF import ln2_readings_service
    monkeypatch.setattr(ln2_readings_service, "Ln2Reading", lambda **kw: mock_reading)

    data = Ln2ReadingCreate(
        device_id=1,
        evaporation_rate_kg_per_h=0.05,
        ln2_mass_kg=12.5,
        reading_timestamp=datetime.now(timezone.utc),
    )
    result = create_ln2_reading(db_session, data)
    assert result == mock_reading
    db_session.add.assert_called_once()
    db_session.commit.assert_called_once()


def test_get_ln2_reading_by_id_found(db_session, mock_reading):
    """Test get reading by ID when found"""
    query = MagicMock()
    query.filter.return_value = query
    query.first.return_value = mock_reading
    db_session.query.return_value = query
    result = get_ln2_reading_by_id(db_session, 1)
    assert result == mock_reading


def test_get_ln2_reading_by_id_not_found(db_session):
    """Test get reading when not found"""
    query = MagicMock()
    query.filter.return_value = query
    query.first.return_value = None
    db_session.query.return_value = query
    result = get_ln2_reading_by_id(db_session, 999)
    assert result is None


def test_get_ln2_readings_list(db_session, mock_reading):
    """Test listing readings"""
    query = MagicMock()
    query.filter.return_value = query
    query.order_by.return_value = query
    query.offset.return_value = query
    query.limit.return_value = query
    query.count.return_value = 1
    query.all.return_value = [mock_reading]
    db_session.query.return_value = query

    readings, count = get_ln2_readings(db_session, skip=0, limit=10)
    assert len(readings) == 1
    assert count == 1


def test_update_ln2_reading_success(db_session, mock_reading):
    """Test updating reading"""
    query = MagicMock()
    query.filter.return_value = query
    query.first.return_value = mock_reading
    db_session.query.return_value = query

    data = Ln2ReadingUpdate(ln2_mass_kg=90.0)
    result = update_ln2_reading(db_session, 1, data)
    assert result == mock_reading
    assert mock_reading.ln2_mass_kg == 90.0
    db_session.commit.assert_called_once()


def test_delete_ln2_reading_success(db_session, mock_reading):
    """Test deleting reading"""
    query = MagicMock()
    query.filter.return_value = query
    query.first.return_value = mock_reading
    db_session.query.return_value = query

    result = delete_ln2_reading(db_session, 1)
    assert result is True
    db_session.delete.assert_called_once_with(mock_reading)
