"""
Unit tests for IVF Dashboard Service
"""
import pytest
from unittest.mock import MagicMock, Mock, patch
from datetime import datetime, timezone

from app.service.IVF.ivf_dashboard_service import IVFDashboardService
from app.constants.enums import CanisterStatus


@pytest.fixture
def db_session():
    """Create a mock database session"""
    return MagicMock()


@pytest.fixture
def dashboard_service(db_session):
    """Create IVF Dashboard Service instance"""
    return IVFDashboardService(db_session)


@pytest.fixture
def mock_embryo():
    """Create a mock embryo"""
    embryo = Mock()
    embryo.embryo_id = 1
    embryo.is_active = True
    embryo.cryolock_id = 1
    return embryo


@pytest.fixture
def mock_cryolock():
    """Create a mock cryolock"""
    cryolock = Mock()
    cryolock.cryolock_id = 1
    cryolock.cane_id = 1
    return cryolock


@pytest.fixture
def mock_cane():
    """Create a mock cane"""
    cane = Mock()
    cane.cane_id = 1
    cane.canister_id = 1
    return cane


@pytest.fixture
def mock_canister():
    """Create a mock canister"""
    canister = Mock()
    canister.canister_id = 1
    canister.canister_number = "C1"
    canister.is_active = True
    canister.canister_status = CanisterStatus.SAFE
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
def mock_branch():
    """Create a mock hospital branch"""
    branch = Mock()
    branch.branch_id = 1
    branch.branch_name = "Test Branch"
    return branch


# ==========================================
# Tests for _get_branch_filter
# ==========================================

def test_get_branch_filter_manager_role(dashboard_service):
    """Test branch filter returns None for Manager role"""
    result = dashboard_service._get_branch_filter(branch_id=1, role="Manager")
    assert result is None


def test_get_branch_filter_admin_role(dashboard_service):
    """Test branch filter returns None for Admin role"""
    result = dashboard_service._get_branch_filter(branch_id=1, role="Admin")
    assert result is None


def test_get_branch_filter_user_role(dashboard_service):
    """Test branch filter returns branch_id for User role"""
    result = dashboard_service._get_branch_filter(branch_id=42, role="User")
    assert result == 42


def test_get_branch_filter_none_role(dashboard_service):
    """Test branch filter returns None when role is None"""
    result = dashboard_service._get_branch_filter(branch_id=1, role=None)
    assert result is None


def test_get_branch_filter_unknown_role(dashboard_service):
    """Test branch filter returns None for unknown role"""
    result = dashboard_service._get_branch_filter(branch_id=1, role="Unknown")
    assert result is None


# ==========================================
# Tests for _get_current_month_bounds
# ==========================================

def test_get_current_month_bounds(dashboard_service):
    """Test getting current month bounds"""
    start, end = dashboard_service._get_current_month_bounds()
    
    assert isinstance(start, datetime)
    assert isinstance(end, datetime)
    assert start.day == 1
    assert start.hour == 0
    assert start.minute == 0
    assert start.second == 0
    assert start.microsecond == 0
    assert end > start


# ==========================================
# Tests for get_total_embryos_cryolocks
# ==========================================

def test_get_total_embryos_cryolocks_no_filter(dashboard_service, db_session):
    """Test getting total embryos and cryolocks without branch filter"""
    # Mock queries - func.count() returns a query that chains filter().join().scalar()
    embryo_query = MagicMock()
    embryo_query.filter.return_value = embryo_query
    embryo_query.join.return_value = embryo_query
    embryo_query.scalar.return_value = 100
    
    cryolock_query = MagicMock()
    cryolock_query.scalar.return_value = 50
    
    query_call_count = [0]
    def query_side_effect(*args, **kwargs):
        query_call_count[0] += 1
        # First call is func.count(Embryo.embryo_id), second is func.count(Cryolock.cryolock_id)
        if query_call_count[0] == 1:
            return embryo_query
        elif query_call_count[0] == 2:
            return cryolock_query
        return MagicMock()
    
    db_session.query.side_effect = query_side_effect
    
    result = dashboard_service.get_total_embryos_cryolocks()
    
    assert result["total_embryos"] == 100
    assert result["total_cryolocks"] == 50
    assert result["total_embryos_cryolocks"] == 150


def test_get_total_embryos_cryolocks_with_branch_filter(dashboard_service, db_session):
    """Test getting total embryos and cryolocks with branch filter"""
    # Mock queries with proper chaining for branch filter
    embryo_query = MagicMock()
    embryo_query.filter.return_value = embryo_query
    embryo_query.join.return_value = embryo_query
    embryo_query.scalar.return_value = 50
    
    cryolock_query = MagicMock()
    cryolock_query.join.return_value = cryolock_query
    cryolock_query.filter.return_value = cryolock_query
    cryolock_query.scalar.return_value = 25
    
    query_call_count = [0]
    def query_side_effect(*args, **kwargs):
        query_call_count[0] += 1
        if query_call_count[0] == 1:
            return embryo_query
        elif query_call_count[0] == 2:
            return cryolock_query
        return MagicMock()
    
    db_session.query.side_effect = query_side_effect
    
    result = dashboard_service.get_total_embryos_cryolocks(branch_id=1, role="User")
    
    assert result["total_embryos"] == 50
    assert result["total_cryolocks"] == 25
    assert result["total_embryos_cryolocks"] == 75


def test_get_total_embryos_cryolocks_empty_results(dashboard_service, db_session):
    """Test getting total embryos and cryolocks when no results"""
    embryo_query = MagicMock()
    embryo_query.filter.return_value = embryo_query
    embryo_query.join.return_value = embryo_query
    embryo_query.scalar.return_value = None
    
    cryolock_query = MagicMock()
    cryolock_query.scalar.return_value = None
    
    query_call_count = [0]
    def query_side_effect(*args, **kwargs):
        query_call_count[0] += 1
        if query_call_count[0] == 1:
            return embryo_query
        elif query_call_count[0] == 2:
            return cryolock_query
        return MagicMock()
    
    db_session.query.side_effect = query_side_effect
    
    result = dashboard_service.get_total_embryos_cryolocks()
    
    assert result["total_embryos"] == 0
    assert result["total_cryolocks"] == 0
    assert result["total_embryos_cryolocks"] == 0


# ==========================================
# Tests for get_total_containers
# ==========================================

def test_get_total_containers_no_filter(dashboard_service, db_session):
    """Test getting total containers without branch filter"""
    canister_query = MagicMock()
    canister_query.filter.return_value = canister_query
    canister_query.scalar.return_value = 20
    
    def query_side_effect(*args, **kwargs):
        return canister_query
    
    db_session.query.side_effect = query_side_effect
    
    result = dashboard_service.get_total_containers()
    
    assert result["total_containers"] == 20


def test_get_total_containers_with_branch_filter(dashboard_service, db_session):
    """Test getting total containers with branch filter"""
    canister_query = MagicMock()
    canister_query.filter.return_value = canister_query
    canister_query.join.return_value = canister_query
    canister_query.scalar.return_value = 10
    
    def query_side_effect(*args, **kwargs):
        return canister_query
    
    db_session.query.side_effect = query_side_effect
    
    result = dashboard_service.get_total_containers(branch_id=1, role="User")
    
    assert result["total_containers"] == 10


def test_get_total_containers_empty_results(dashboard_service, db_session):
    """Test getting total containers when no results"""
    canister_query = MagicMock()
    canister_query.filter.return_value = canister_query
    canister_query.scalar.return_value = None
    
    def query_side_effect(*args, **kwargs):
        return canister_query
    
    db_session.query.side_effect = query_side_effect
    
    result = dashboard_service.get_total_containers()
    
    assert result["total_containers"] == 0


# ==========================================
# Tests for get_quality_deviations_flagged
# ==========================================

def test_get_quality_deviations_flagged_no_filter(dashboard_service, db_session):
    """Test getting quality deviations without branch filter"""
    canister_query = MagicMock()
    canister_query.filter.return_value = canister_query
    canister_query.scalar.return_value = 5
    
    log_query = MagicMock()
    log_query.filter.return_value = log_query
    log_query.scalar.return_value = 3
    
    query_call_count = [0]
    def query_side_effect(*args, **kwargs):
        query_call_count[0] += 1
        if query_call_count[0] == 1:
            return canister_query
        elif query_call_count[0] == 2:
            return log_query
        return MagicMock()
    
    db_session.query.side_effect = query_side_effect
    
    result = dashboard_service.get_quality_deviations_flagged()
    
    assert result["canister_status_deviations"] == 5
    assert result["ln2_level_deviations"] == 3
    assert result["total_quality_deviations"] == 8


def test_get_quality_deviations_flagged_with_branch_filter(dashboard_service, db_session):
    """Test getting quality deviations with branch filter"""
    canister_query = MagicMock()
    canister_query.filter.return_value = canister_query
    canister_query.join.return_value = canister_query
    canister_query.scalar.return_value = 2
    
    log_query = MagicMock()
    log_query.filter.return_value = log_query
    log_query.join.return_value = log_query
    log_query.scalar.return_value = 1
    
    query_call_count = [0]
    def query_side_effect(*args, **kwargs):
        query_call_count[0] += 1
        if query_call_count[0] == 1:
            return canister_query
        elif query_call_count[0] == 2:
            return log_query
        return MagicMock()
    
    db_session.query.side_effect = query_side_effect
    
    result = dashboard_service.get_quality_deviations_flagged(branch_id=1, role="User")
    
    assert result["canister_status_deviations"] == 2
    assert result["ln2_level_deviations"] == 1
    assert result["total_quality_deviations"] == 3


# ==========================================
# Tests for get_top_deviation_driver
# ==========================================

def test_get_top_deviation_driver_temperature(dashboard_service, db_session):
    """Test getting top deviation driver when temperature has most deviations"""
    # Mock temperature count query
    temp_query = MagicMock()
    temp_query.join.return_value = temp_query
    temp_query.filter.return_value = temp_query
    temp_query.scalar.return_value = 10
    
    # Mock humidity count query
    humidity_query = MagicMock()
    humidity_query.join.return_value = humidity_query
    humidity_query.filter.return_value = humidity_query
    humidity_query.scalar.return_value = 5
    
    # Mock agitation count query
    agitation_query = MagicMock()
    agitation_query.join.return_value = agitation_query
    agitation_query.filter.return_value = agitation_query
    agitation_query.scalar.return_value = 3
    
    query_call_count = [0]
    def query_side_effect(*args, **kwargs):
        query_call_count[0] += 1
        if query_call_count[0] == 1:
            return temp_query
        elif query_call_count[0] == 2:
            return humidity_query
        elif query_call_count[0] == 3:
            return agitation_query
        return MagicMock()
    
    db_session.query.side_effect = query_side_effect
    
    result = dashboard_service.get_top_deviation_driver()
    
    assert result["driver_name"] == "Temperature"
    assert result["count"] == 10
    assert result["percentage"] == pytest.approx(55.56, rel=0.1)  # 10 / 18 * 100


def test_get_top_deviation_driver_no_deviations(dashboard_service, db_session):
    """Test getting top deviation driver when no deviations exist"""
    temp_query = MagicMock()
    temp_query.join.return_value = temp_query
    temp_query.filter.return_value = temp_query
    temp_query.scalar.return_value = 0
    
    humidity_query = MagicMock()
    humidity_query.join.return_value = humidity_query
    humidity_query.filter.return_value = humidity_query
    humidity_query.scalar.return_value = 0
    
    agitation_query = MagicMock()
    agitation_query.join.return_value = agitation_query
    agitation_query.filter.return_value = agitation_query
    agitation_query.scalar.return_value = 0
    
    query_call_count = [0]
    def query_side_effect(*args, **kwargs):
        query_call_count[0] += 1
        if query_call_count[0] == 1:
            return temp_query
        elif query_call_count[0] == 2:
            return humidity_query
        elif query_call_count[0] == 3:
            return agitation_query
        return MagicMock()
    
    db_session.query.side_effect = query_side_effect
    
    result = dashboard_service.get_top_deviation_driver()
    
    assert result["driver_name"] == "N/A"
    assert result["count"] == 0
    assert result["percentage"] == 0.0


# ==========================================
# Tests for get_outbound_shipments
# ==========================================

def test_get_outbound_shipments_no_filter(dashboard_service, db_session):
    """Test getting outbound shipments without branch filter"""
    shipment_query = MagicMock()
    shipment_query.filter.return_value = shipment_query
    shipment_query.scalar.return_value = 15
    
    def query_side_effect(*args, **kwargs):
        return shipment_query
    
    db_session.query.side_effect = query_side_effect
    
    result = dashboard_service.get_outbound_shipments()
    
    assert result["total_outbound_shipments"] == 15


def test_get_outbound_shipments_with_branch_filter(dashboard_service, db_session):
    """Test getting outbound shipments with branch filter"""
    # Create shipment_query first (this is created before branch query)
    shipment_query = MagicMock()
    shipment_query.filter.return_value = shipment_query
    shipment_query.scalar.return_value = 8
    
    # Create branch_query for branch_name lookup
    branch_query = MagicMock()
    branch_query.filter.return_value = branch_query
    branch_query.scalar.return_value = "Test Branch"
    
    query_call_count = [0]
    def query_side_effect(*args, **kwargs):
        query_call_count[0] += 1
        # First call creates shipment_query (func.count(Shipment.id))
        if query_call_count[0] == 1:
            return shipment_query
        # Second call gets branch_name (HospitalBranch.branch_name)
        elif query_call_count[0] == 2:
            return branch_query
        return MagicMock()
    
    db_session.query.side_effect = query_side_effect
    
    result = dashboard_service.get_outbound_shipments(branch_id=1, role="User")
    
    assert result["total_outbound_shipments"] == 8
    assert isinstance(result["total_outbound_shipments"], int)


# ==========================================
# Tests for get_deviations_graph
# ==========================================

def test_get_deviations_graph_user_role(dashboard_service, db_session):
    """Test getting deviations graph for User role (container level)"""
    # Mock canister query
    canister_query = MagicMock()
    canister_query.join.return_value = canister_query
    canister_query.filter.return_value = canister_query
    canister_query.all.return_value = []
    
    # Mock quality log queries
    quality_log_query = MagicMock()
    quality_log_query.join.return_value = quality_log_query
    quality_log_query.filter.return_value = quality_log_query
    quality_log_query.all.return_value = []
    
    query_call_count = [0]
    def query_side_effect(*args, **kwargs):
        query_call_count[0] += 1
        if query_call_count[0] == 1:
            return canister_query
        elif query_call_count[0] >= 2:
            return quality_log_query
        return MagicMock()
    
    db_session.query.side_effect = query_side_effect
    
    result = dashboard_service.get_deviations_graph(branch_id=1, role="User")
    
    assert result["view_level"] == "container"
    assert isinstance(result["data"], list)


def test_get_deviations_graph_manager_role(dashboard_service, db_session):
    """Test getting deviations graph for Manager role (site level)"""
    # Mock branch query
    branch_query = MagicMock()
    branch_query.all.return_value = []
    
    # Mock quality log queries
    quality_log_query = MagicMock()
    quality_log_query.join.return_value = quality_log_query
    quality_log_query.filter.return_value = quality_log_query
    quality_log_query.all.return_value = []
    
    query_call_count = [0]
    def query_side_effect(*args, **kwargs):
        query_call_count[0] += 1
        if query_call_count[0] == 1:
            return branch_query
        elif query_call_count[0] >= 2:
            return quality_log_query
        return MagicMock()
    
    db_session.query.side_effect = query_side_effect
    
    result = dashboard_service.get_deviations_graph(role="Manager")
    
    assert result["view_level"] == "site"
    assert isinstance(result["data"], list)


# ==========================================
# Tests for get_total_deviations
# ==========================================

def test_get_total_deviations_no_filter(dashboard_service, db_session):
    """Test getting total deviations without branch filter"""
    temp_query = MagicMock()
    temp_query.join.return_value = temp_query
    temp_query.filter.return_value = temp_query
    temp_query.scalar.return_value = 10
    
    humidity_query = MagicMock()
    humidity_query.join.return_value = humidity_query
    humidity_query.filter.return_value = humidity_query
    humidity_query.scalar.return_value = 5
    
    agitation_query = MagicMock()
    agitation_query.join.return_value = agitation_query
    agitation_query.filter.return_value = agitation_query
    agitation_query.scalar.return_value = 3
    
    light_query = MagicMock()
    light_query.join.return_value = light_query
    light_query.filter.return_value = light_query
    light_query.scalar.return_value = 2
    
    total_query = MagicMock()
    total_query.join.return_value = total_query
    total_query.filter.return_value = total_query
    total_query.scalar.return_value = 20
    
    query_call_count = [0]
    def query_side_effect(*args, **kwargs):
        query_call_count[0] += 1
        if query_call_count[0] == 1:
            return temp_query
        elif query_call_count[0] == 2:
            return humidity_query
        elif query_call_count[0] == 3:
            return agitation_query
        elif query_call_count[0] == 4:
            return light_query
        elif query_call_count[0] == 5:
            return total_query
        return MagicMock()
    
    db_session.query.side_effect = query_side_effect
    
    result = dashboard_service.get_total_deviations()
    
    assert result["temperature_deviations"] == 10
    assert result["humidity_deviations"] == 5
    assert result["agitation_deviations"] == 3
    assert result["light_deviations"] == 2
    assert result["total_deviations"] == 20


def test_get_total_deviations_with_branch_filter(dashboard_service, db_session):
    """Test getting total deviations with branch filter"""
    temp_query = MagicMock()
    temp_query.join.return_value = temp_query
    temp_query.filter.return_value = temp_query
    temp_query.scalar.return_value = 5
    
    humidity_query = MagicMock()
    humidity_query.join.return_value = humidity_query
    humidity_query.filter.return_value = humidity_query
    humidity_query.scalar.return_value = 2
    
    agitation_query = MagicMock()
    agitation_query.join.return_value = agitation_query
    agitation_query.filter.return_value = agitation_query
    agitation_query.scalar.return_value = 1
    
    light_query = MagicMock()
    light_query.join.return_value = light_query
    light_query.filter.return_value = light_query
    light_query.scalar.return_value = 1
    
    total_query = MagicMock()
    total_query.join.return_value = total_query
    total_query.filter.return_value = total_query
    total_query.scalar.return_value = 9
    
    query_call_count = [0]
    def query_side_effect(*args, **kwargs):
        query_call_count[0] += 1
        if query_call_count[0] == 1:
            return temp_query
        elif query_call_count[0] == 2:
            return humidity_query
        elif query_call_count[0] == 3:
            return agitation_query
        elif query_call_count[0] == 4:
            return light_query
        elif query_call_count[0] == 5:
            return total_query
        return MagicMock()
    
    db_session.query.side_effect = query_side_effect
    
    result = dashboard_service.get_total_deviations(branch_id=1, role="User")
    
    assert result["temperature_deviations"] == 5
    assert result["humidity_deviations"] == 2
    assert result["agitation_deviations"] == 1
    assert result["light_deviations"] == 1
    assert result["total_deviations"] == 9
