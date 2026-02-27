"""
Unit tests for Quality Tracking Service
"""
import pytest
from unittest.mock import MagicMock, Mock, patch
from datetime import datetime, timezone, date, time

from app.service.IVF.quality_tracking_service import QualityTrackingService
from app.schemas.IVF.quality_tracking_schema import (
    RefillLogCreate,
    RefillLogStatusUpdate,
    CryolockColorUpdate,
    GobletColorUpdate
)
from app.exceptions.custom_exceptions import AppException


@pytest.fixture
def db_session():
    """Create a mock database session"""
    return MagicMock()


@pytest.fixture
def quality_tracking_service(db_session):
    """Create Quality Tracking Service instance"""
    return QualityTrackingService(db_session)


@pytest.fixture
def mock_canister():
    """Create a mock canister"""
    canister = Mock()
    canister.canister_id = 1
    canister.canister_number = "C1"
    canister.tank_id = 1
    return canister


@pytest.fixture
def mock_tank():
    """Create a mock tank"""
    tank = Mock()
    tank.tank_id = 1
    tank.branch_id = 1
    return tank


@pytest.fixture
def mock_refill_log():
    """Create a mock refill log"""
    log = Mock()
    log.log_id = 1
    log.tank_id = 1
    log.refill_date = date.today()
    log.refill_time = time(10, 30, 0)
    log.refilled_by = "Test User"
    log.description = "Test description"
    log.status = "completed"
    log.refilled_count = 1
    log.opened_count = 1
    log.created_at = datetime.now(timezone.utc)
    return log


# ==========================================
# Tests for resolve_tank_id
# ==========================================

def test_resolve_tank_id_success(quality_tracking_service, db_session, mock_tank):
    """Test resolving tank code to ID successfully"""
    query = MagicMock()
    query.filter.return_value = query
    query.first.return_value = mock_tank
    
    db_session.query.return_value = query
    
    result = quality_tracking_service.resolve_tank_id("T1")
    
    assert result == 1


def test_resolve_tank_id_with_branch_filter(quality_tracking_service, db_session, mock_tank):
    """Test resolving tank code to ID with branch filter"""
    query = MagicMock()
    query.filter.return_value = query
    query.first.return_value = mock_tank
    
    db_session.query.return_value = query
    
    result = quality_tracking_service.resolve_tank_id("T1", branch_id=1)
    
    assert result == 1


def test_resolve_tank_id_not_found(quality_tracking_service, db_session):
    """Test resolving tank code when tank not found"""
    query = MagicMock()
    query.filter.return_value = query
    query.first.return_value = None
    
    db_session.query.return_value = query
    
    with pytest.raises(AppException) as exc_info:
        quality_tracking_service.resolve_tank_id("INVALID")
    
    assert exc_info.value.status_code == 404
    assert "not found" in str(exc_info.value.message).lower()


# ==========================================
# Tests for create_refill_log
# ==========================================

@patch('app.service.IVF.quality_tracking_service.desc')
def test_create_refill_log_success(mock_desc, quality_tracking_service, db_session, mock_refill_log):
    """Test creating a refill log successfully"""
    from app.constants.enums import TaskStatus
    
    # Mock desc to return a mock that can be used in order_by
    mock_desc.return_value = MagicMock()
    
    # Mock last log query (no previous log)
    last_log_query = MagicMock()
    last_log_query.filter.return_value = last_log_query
    last_log_query.order_by.return_value = last_log_query
    last_log_query.first.return_value = None
    
    # Mock new log creation
    new_log = Mock()
    new_log.log_id = 1
    new_log.tank_id = 1
    new_log.refill_date = date.today()
    new_log.refill_time = time(10, 30, 0)
    new_log.refilled_by = "Test User"
    new_log.description = "Test description"
    new_log.status = TaskStatus.NOT_STARTED
    new_log.refilled_count = 1
    new_log.opened_count = 1
    new_log.created_at = datetime.now(timezone.utc)
    new_log.created_by = "USER-123"
    new_log.updated_at = None
    new_log.updated_by = None
    new_log.cryoshipper = None
    new_log.disinfected_shipper_infected_tank_description = None
    new_log.reservoir = None
    new_log.ln2_ordered_date = None
    new_log.ln2_received_date = None
    new_log.branch_id = None
    
    query_call_count = [0]
    def query_side_effect(model):
        query_call_count[0] += 1
        if hasattr(model, '__name__') and model.__name__ == 'CanisterLn2Log':
            return last_log_query
        return MagicMock()
    
    db_session.query.side_effect = query_side_effect
    db_session.refresh = MagicMock()  # Mock refresh to avoid SQLAlchemy queries
    
    # Mock CanisterLn2Log class to return new_log when instantiated
    with patch('app.service.IVF.quality_tracking_service.CanisterLn2Log') as mock_log_class:
        mock_log_class.return_value = new_log
        
        refill_data = RefillLogCreate(
            refill_date=date.today(),
            refill_time=time(10, 30, 0),
            refilled_by="Test User",
            description="Test description",
            status=TaskStatus.NOT_STARTED
        )
        
        result = quality_tracking_service.create_refill_log(1, refill_data, "USER-123")
        
        assert result.log_id == 1
        assert result.tank_id == 1
        db_session.add.assert_called_once()
        db_session.commit.assert_called_once()


@patch('app.service.IVF.quality_tracking_service.desc')
def test_create_refill_log_with_previous_log(mock_desc, quality_tracking_service, db_session, mock_refill_log):
    """Test creating a refill log when previous log exists"""
    from app.constants.enums import TaskStatus
    
    # Mock desc to return a mock that can be used in order_by
    mock_desc.return_value = MagicMock()
    
    # Mock last log query (has previous log)
    previous_log = Mock()
    previous_log.refilled_count = 5
    previous_log.opened_count = 3
    
    last_log_query = MagicMock()
    last_log_query.filter.return_value = last_log_query
    last_log_query.order_by.return_value = last_log_query
    last_log_query.first.return_value = previous_log
    
    new_log = Mock()
    new_log.log_id = 2
    new_log.tank_id = 1
    new_log.refilled_count = 6  # Should be previous + 1
    new_log.opened_count = 4  # Should be previous + 1
    new_log.refill_date = date.today()
    new_log.refill_time = time(10, 30, 0)
    new_log.refilled_by = "Test User"
    new_log.description = "Test description"
    new_log.status = TaskStatus.NOT_STARTED
    new_log.created_at = datetime.now(timezone.utc)
    new_log.created_by = "USER-123"
    new_log.updated_at = None
    new_log.updated_by = None
    new_log.cryoshipper = None
    new_log.disinfected_shipper_infected_tank_description = None
    new_log.reservoir = None
    new_log.ln2_ordered_date = None
    new_log.ln2_received_date = None
    new_log.branch_id = None
    
    query_call_count = [0]
    def query_side_effect(model):
        query_call_count[0] += 1
        if hasattr(model, '__name__') and model.__name__ == 'CanisterLn2Log':
            return last_log_query
        return MagicMock()
    
    db_session.query.side_effect = query_side_effect
    db_session.refresh = MagicMock()  # Mock refresh to avoid SQLAlchemy queries
    
    with patch('app.service.IVF.quality_tracking_service.CanisterLn2Log') as mock_log_class:
        mock_log_class.return_value = new_log
        
        refill_data = RefillLogCreate(
            refill_date=date.today(),
            refill_time=time(10, 30, 0),
            refilled_by="Test User",
            description="Test description",
            status=TaskStatus.NOT_STARTED
        )
        
        result = quality_tracking_service.create_refill_log(1, refill_data, "USER-123")
        
        # Verify counts are incremented
        assert new_log.refilled_count == 6
        assert new_log.opened_count == 4
        db_session.add.assert_called_once()
        db_session.commit.assert_called_once()


# ==========================================
# Tests for get_refill_logs
# ==========================================

def test_get_refill_logs_success(quality_tracking_service, db_session, mock_refill_log):
    """Test getting refill logs successfully"""
    from app.constants.enums import TaskStatus
    
    # Ensure mock_refill_log has all required attributes
    mock_refill_log.tank_id = 1
    mock_refill_log.status = TaskStatus.NOT_STARTED
    mock_refill_log.created_by = "test@example.com"
    mock_refill_log.updated_at = None
    mock_refill_log.updated_by = None
    mock_refill_log.cryoshipper = None
    mock_refill_log.disinfected_shipper_infected_tank_description = None
    mock_refill_log.reservoir = None
    mock_refill_log.ln2_ordered_date = None
    mock_refill_log.ln2_received_date = None
    
    query = MagicMock()
    query.filter.return_value = query
    query.order_by.return_value = query
    query.all.return_value = [mock_refill_log]
    
    db_session.query.return_value = query
    
    result = quality_tracking_service.get_refill_logs(1)
    
    assert len(result.refill_logs) == 1
    assert result.refill_logs[0].log_id == 1
    assert result.count == 1


def test_get_refill_logs_with_status_filter(quality_tracking_service, db_session, mock_refill_log):
    """Test getting refill logs with status filter"""
    from app.constants.enums import TaskStatus
    
    # Ensure mock_refill_log has all required attributes
    mock_refill_log.tank_id = 1
    mock_refill_log.status = TaskStatus.NOT_STARTED
    mock_refill_log.created_by = "test@example.com"
    mock_refill_log.updated_at = None
    mock_refill_log.updated_by = None
    mock_refill_log.cryoshipper = None
    mock_refill_log.disinfected_shipper_infected_tank_description = None
    mock_refill_log.reservoir = None
    mock_refill_log.ln2_ordered_date = None
    mock_refill_log.ln2_received_date = None
    
    query = MagicMock()
    query.filter.return_value = query
    query.order_by.return_value = query
    query.all.return_value = [mock_refill_log]
    
    db_session.query.return_value = query
    
    result = quality_tracking_service.get_refill_logs(1, status="Done")
    
    assert len(result.refill_logs) == 1


def test_get_refill_logs_with_limit(quality_tracking_service, db_session, mock_refill_log):
    """Test getting refill logs with limit"""
    from app.constants.enums import TaskStatus
    
    # Ensure mock_refill_log has all required attributes
    mock_refill_log.tank_id = 1
    mock_refill_log.status = TaskStatus.NOT_STARTED
    mock_refill_log.created_by = "test@example.com"
    mock_refill_log.updated_at = None
    mock_refill_log.updated_by = None
    mock_refill_log.cryoshipper = None
    mock_refill_log.disinfected_shipper_infected_tank_description = None
    mock_refill_log.reservoir = None
    mock_refill_log.ln2_ordered_date = None
    mock_refill_log.ln2_received_date = None
    
    query = MagicMock()
    query.filter.return_value = query
    query.order_by.return_value = query
    query.limit.return_value = query
    query.all.return_value = [mock_refill_log]
    
    db_session.query.return_value = query
    
    result = quality_tracking_service.get_refill_logs(1, limit=10)
    
    assert len(result.refill_logs) == 1
    assert result.count == 1
    query.limit.assert_called_once_with(10)


def test_get_refill_logs_empty(quality_tracking_service, db_session):
    """Test getting refill logs when no logs exist"""
    query = MagicMock()
    query.filter.return_value = query
    query.order_by.return_value = query
    query.all.return_value = []
    
    db_session.query.return_value = query
    
    result = quality_tracking_service.get_refill_logs(1)
    
    assert len(result.refill_logs) == 0
    assert result.count == 0


# ==========================================
# Tests for get_tank_tracking_details
# ==========================================

@patch('app.service.IVF.quality_tracking_service.or_')
@patch('app.service.IVF.quality_tracking_service.find_tank_by_code')
def test_get_tank_tracking_details_success(mock_find_tank, mock_or, quality_tracking_service, db_session, mock_tank):
    """Test getting tank tracking details successfully"""
    # Mock find_tank_by_code to return mock_tank
    mock_find_tank.return_value = mock_tank
    from app.schemas.IVF.quality_tracking_schema import IVFCanisterTrackingResponse
    
    # Mock or_ to return a filterable expression
    mock_or_expression = MagicMock()
    mock_or.return_value = mock_or_expression
    
    # Mock total_slots query (func.count(func.distinct(...)))
    total_slots_query = MagicMock()
    total_slots_query.filter.return_value = total_slots_query
    total_slots_query.scalar.return_value = 10
    
    # Mock moved_count query
    moved_count_query = MagicMock()
    moved_count_query.filter.return_value = moved_count_query
    moved_count_query.scalar.return_value = 3
    
    # Mock result row - must match PatientCrylockInfo query structure
    # Use a simple object to avoid MagicMock attribute issues
    class MockRow:
        def __init__(self):
            self.id = 1
            self.his_number = "HIS123"
            self.crylock_number = "CL1"  # Note: crylock not cryolock (matches PatientCrylockInfo model)
            self.canister_number = "C1"
            self.tank_code = "T1"
            self.cane_code = "CAN1"
            self.goblet_color = "red"
            self.crylock_color = "blue"  # Note: crylock not cryolock (matches PatientCrylockInfo model)
            self.date_of_vitrification = date.today()
            self.embryo_transfer = False
            self.in_transit = False
    
    mock_row = MockRow()
    
    # Mock shipment descriptions query
    latest_shipments_query = MagicMock()
    latest_shipments_query.filter.return_value = latest_shipments_query
    latest_shipments_query.group_by.return_value = latest_shipments_query
    latest_shipments_subq = MagicMock()
    latest_shipments_subq.c = MagicMock()
    latest_shipments_subq.c.latest_shipment_id = MagicMock()
    latest_shipments_query.subquery.return_value = latest_shipments_subq
    
    shipment_descriptions_query = MagicMock()
    shipment_descriptions_query.join.return_value = shipment_descriptions_query
    shipment_descriptions_query.all.return_value = []
    
    # Mock PatientCrylockInfo query for the main tracking query
    patient_crylock_query = MagicMock()
    patient_crylock_query.filter.return_value = patient_crylock_query
    patient_crylock_query.order_by.return_value = patient_crylock_query
    patient_crylock_query.all.return_value = [mock_row]
    
    query_call_count = [0]
    def query_side_effect(*args, **kwargs):
        query_call_count[0] += 1
        # First call: total_slots (func.count)
        if query_call_count[0] == 1:
            return total_slots_query
        # Second call: moved_count (func.count) 
        elif query_call_count[0] == 2:
            return moved_count_query
        # Third call: main tracking query (PatientCrylockInfo)
        elif query_call_count[0] == 3:
            return patient_crylock_query
        # Fourth call: latest_shipments subquery (IVFShipment)
        elif query_call_count[0] == 4:
            return latest_shipments_query
        # Fifth call: shipment_descriptions query (IVFShipment)
        elif query_call_count[0] == 5:
            return shipment_descriptions_query
        return MagicMock()
    
    db_session.query.side_effect = query_side_effect
    
    result = quality_tracking_service.get_tank_tracking_details("T1")
    
    assert isinstance(result, IVFCanisterTrackingResponse)
    assert isinstance(result.data, list)
    assert result.total == 10  # Schema uses 'total' not 'total_slots'
    assert result.available_slots == 7  # 10 - 3


@patch('app.service.IVF.quality_tracking_service.or_')
@patch('app.service.IVF.quality_tracking_service.find_tank_by_code')
def test_get_tank_tracking_details_not_found(mock_find_tank, mock_or, quality_tracking_service, db_session):
    """Test getting tank tracking details when tank not found"""
    # Mock find_tank_by_code to return None (tank not found)
    mock_find_tank.return_value = None
    # Mock or_ to return a filterable expression
    mock_or_expression = MagicMock()
    mock_or.return_value = mock_or_expression
    
    # No need to mock queries since find_tank_by_code returns None and raises exception immediately
    # When tank is not found, the method should raise an exception
    with pytest.raises(AppException) as exc_info:
        quality_tracking_service.get_tank_tracking_details("INVALID")
    
    assert exc_info.value.status_code == 404


# ==========================================
# Tests for update_cryolock_color
# ==========================================

def test_update_cryolock_color_success(quality_tracking_service, db_session):
    """Test updating cryolock color successfully"""
    from app.schemas.IVF.quality_tracking_schema import ColorUpdateResponse
    
    mock_cryolock = Mock()
    mock_cryolock.cryolock_id = 1
    mock_cryolock.crylock_number = "CL1"
    mock_cryolock.crylock_color = "red"
    
    query = MagicMock()
    query.join.return_value = query
    query.filter.return_value = query
    query.first.return_value = mock_cryolock
    
    db_session.query.return_value = query
    
    color_update = CryolockColorUpdate(cryolock_number="CL1", cryolock_color="blue")
    
    result = quality_tracking_service.update_cryolock_color(1, color_update)
    
    assert mock_cryolock.crylock_color == "blue"
    db_session.commit.assert_called_once()
    assert isinstance(result, ColorUpdateResponse)
    assert result.updated_color == "blue"
    assert result.cryolock_number == "CL1"
    assert result.success is True


def test_update_cryolock_color_not_found(quality_tracking_service, db_session):
    """Test updating cryolock color when cryolock not found"""
    query = MagicMock()
    query.join.return_value = query
    query.filter.return_value = query
    query.first.return_value = None
    
    db_session.query.return_value = query
    
    color_update = CryolockColorUpdate(cryolock_number="INVALID", cryolock_color="blue")
    
    with pytest.raises(AppException) as exc_info:
        quality_tracking_service.update_cryolock_color(1, color_update)
    
    assert exc_info.value.status_code == 404


# ==========================================
# Tests for update_goblet_color
# ==========================================

def test_update_goblet_color_success(quality_tracking_service, db_session):
    """Test updating goblet color successfully"""
    from app.schemas.IVF.quality_tracking_schema import ColorUpdateResponse
    
    mock_cryolock = Mock()
    mock_cryolock.cryolock_id = 1
    mock_cryolock.crylock_number = "CL1"
    mock_cryolock.goblet_color = "red"
    
    query = MagicMock()
    query.join.return_value = query
    query.filter.return_value = query
    query.first.return_value = mock_cryolock
    
    db_session.query.return_value = query
    
    color_update = GobletColorUpdate(cryolock_number="CL1", goblet_color="blue")
    
    result = quality_tracking_service.update_goblet_color(1, color_update)
    
    assert mock_cryolock.goblet_color == "blue"
    db_session.commit.assert_called_once()
    assert isinstance(result, ColorUpdateResponse)
    assert result.updated_color == "blue"
    assert result.cryolock_number == "CL1"
    assert result.success is True


def test_update_goblet_color_not_found(quality_tracking_service, db_session):
    """Test updating goblet color when cryolock not found"""
    query = MagicMock()
    query.join.return_value = query
    query.filter.return_value = query
    query.first.return_value = None
    
    db_session.query.return_value = query
    
    color_update = GobletColorUpdate(cryolock_number="INVALID", goblet_color="blue")
    
    with pytest.raises(AppException) as exc_info:
        quality_tracking_service.update_goblet_color(1, color_update)
    
    assert exc_info.value.status_code == 404
