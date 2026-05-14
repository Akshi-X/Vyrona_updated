"""
Unit tests for IVF Service
"""
import pytest
from unittest.mock import MagicMock, Mock, patch
from datetime import datetime, timezone, date, time
from decimal import Decimal
from collections import defaultdict

from app.service.IVF.ivf_service import IVFService
from app.constants.enums import CanisterStatus


@pytest.fixture
def db_session():
    """Create a mock database session"""
    return MagicMock()


@pytest.fixture
def ivf_service(db_session):
    """Create IVF Service instance"""
    return IVFService(db_session)


@pytest.fixture
def mock_hospital():
    """Create a mock hospital"""
    hospital = Mock()
    hospital.hospital_id = 1
    hospital.hospital_name = "Test Hospital"
    hospital.hospital_type = "IVF"
    return hospital


@pytest.fixture
def mock_branch(mock_hospital):
    """Create a mock hospital branch"""
    branch = Mock()
    branch.branch_id = 1
    branch.branch_name = "Test Branch"
    branch.state_name = "Tamil Nadu"
    branch.country_name = "India"
    branch.area = "Test Area"
    branch.district_name = "Test District"
    branch.pincode = "600001"
    branch.latitude = Decimal("13.069505")
    branch.longitude = Decimal("80.255197")
    branch.hospital = mock_hospital
    return branch


@pytest.fixture
def mock_canister():
    """Create a mock canister"""
    canister = Mock()
    canister.canister_id = 1
    canister.canister_number = "C1"
    canister.is_active = True
    canister.canister_status = CanisterStatus.SAFE
    canister.tank_id = 1
    canister.created_at = datetime.now(timezone.utc)
    return canister


@pytest.fixture
def mock_tank():
    """Create a mock tank"""
    tank = Mock()
    tank.tank_id = 1
    tank.branch_id = 1
    return tank


@pytest.fixture
def mock_ln2_log():
    """Create a mock LN2 log"""
    log = Mock()
    log.canister_id = 1
    log.refill_date = date.today()
    log.refill_time = time(10, 30, 0)
    return log


# ==========================================
# Tests for get_control_tower_map_locations
# ==========================================

@pytest.fixture
def mock_hospital():
    """Create a mock hospital"""
    hospital = Mock()
    hospital.hospital_id = 1
    hospital.hospital_name = "Test Hospital"
    hospital.hospital_type = "IVF"
    return hospital

def test_get_control_tower_map_locations_no_branch_filter(ivf_service, db_session, mock_branch, mock_hospital):
    """Test getting control tower map locations without branch filter"""
    # Mock hospital
    mock_branch.hospital = mock_hospital
    
    # Mock query
    query = MagicMock()
    query.join.return_value = query
    query.all.return_value = [mock_branch]
    
    db_session.query.return_value = query
    
    result = ivf_service.get_control_tower_map_locations()
    
    assert result["hospitalName"] == "Test Hospital"
    assert result["hospital_type"] == "IVF"
    assert "states" in result
    assert isinstance(result["states"], dict)


def test_get_control_tower_map_locations_with_branch_filter(ivf_service, db_session, mock_branch, mock_hospital):
    """Test getting control tower map locations with branch filter"""
    mock_branch.hospital = mock_hospital
    
    query = MagicMock()
    query.join.return_value = query
    query.filter.return_value = query
    query.all.return_value = [mock_branch]
    
    db_session.query.return_value = query
    
    result = ivf_service.get_control_tower_map_locations(branch_id=1)
    
    assert result["hospitalName"] == "Test Hospital"
    assert "states" in result


def test_get_control_tower_map_locations_no_branches(ivf_service, db_session):
    """Test getting control tower map locations when no branches exist"""
    query = MagicMock()
    query.join.return_value = query
    query.all.return_value = []
    
    db_session.query.return_value = query
    
    result = ivf_service.get_control_tower_map_locations()
    
    assert result["hospitalName"] == ""
    assert result["hospital_type"] is None
    assert result["states"] == {}
    assert result["highest_branch_count_country"] is None


def test_get_control_tower_map_locations_multiple_states(ivf_service, db_session):
    """Test getting control tower map locations with multiple states"""
    branch1 = Mock()
    branch1.branch_id = 1
    branch1.branch_name = "Branch 1"
    branch1.state_name = "Tamil Nadu"
    branch1.country_name = "India"
    branch1.area = "Area 1"
    branch1.district_name = "District 1"
    branch1.pincode = "600001"
    branch1.latitude = Decimal("13.069505")
    branch1.longitude = Decimal("80.255197")
    
    branch2 = Mock()
    branch2.branch_id = 2
    branch2.branch_name = "Branch 2"
    branch2.state_name = "Karnataka"
    branch2.country_name = "India"
    branch2.area = "Area 2"
    branch2.district_name = "District 2"
    branch2.pincode = "560001"
    branch2.latitude = Decimal("12.971599")
    branch2.longitude = Decimal("77.594563")
    
    mock_hospital = Mock()
    mock_hospital.hospital_name = "Test Hospital"
    mock_hospital.hospital_type = "IVF"
    branch1.hospital = mock_hospital
    branch2.hospital = mock_hospital
    
    # Mock canister queries for branch status calculation
    canister_query = MagicMock()
    canister_query.join.return_value = canister_query
    canister_query.filter.return_value = canister_query
    canister_query.all.return_value = []
    
    query = MagicMock()
    query.join.return_value = query
    query.all.return_value = [branch1, branch2]
    
    query_call_count = [0]
    def query_side_effect(model):
        query_call_count[0] += 1
        if query_call_count[0] == 1:
            return query
        elif hasattr(model, '__name__') and model.__name__ == 'Canister':
            return canister_query
        return MagicMock()
    
    db_session.query.side_effect = query_side_effect
    
    result = ivf_service.get_control_tower_map_locations()
    
    assert result["hospitalName"] == "Test Hospital"
    assert len(result["states"]) == 2
    assert "Tamil Nadu" in result["states"]
    assert "Karnataka" in result["states"]


# ==========================================
# Tests for get_active_tanks
# ==========================================

def test_get_active_tanks_no_branch_filter(ivf_service, db_session, mock_tank):
    """Test getting active tanks without branch filter"""
    # Mock branch
    branch_id = 1
    branch_name = "Test Branch"
    mock_tank.updated_at = datetime(2026, 2, 26, 10, 30, 0)
    mock_tank.created_at = datetime(2026, 2, 26, 9, 0, 0)

    db_session.execute.return_value.fetchall.return_value = [
        (mock_tank, branch_id, branch_name, 0, None, None)
    ]
    
    result = ivf_service.get_active_tanks()
    
    assert "branches" in result
    assert "total" in result
    assert result["total"] == 1
    assert len(result["branches"]) == 1
    assert result["branches"][0]["tanks"][0]["updated_at"] is None


def test_get_active_tanks_with_branch_filter(ivf_service, db_session, mock_tank):
    """Test getting active tanks with branch filter"""
    branch_id = 1
    branch_name = "Test Branch"
    mock_tank.updated_at = datetime(2026, 2, 26, 10, 30, 0)
    mock_tank.created_at = datetime(2026, 2, 26, 9, 0, 0)

    db_session.execute.return_value.fetchall.return_value = [
        (mock_tank, branch_id, branch_name, 0, None, None)
    ]
    
    result = ivf_service.get_active_tanks(branch_name="Test Branch")
    
    assert result["total"] == 1
    assert len(result["branches"]) == 1
    assert result["branches"][0]["tanks"][0]["updated_at"] is None


def test_get_active_tanks_with_refill_log(ivf_service, db_session, mock_tank):
    """Test getting active tanks with refill log"""
    branch_id = 1
    branch_name = "Test Branch"
    mock_tank.updated_at = datetime(2026, 2, 26, 10, 30, 0)
    mock_tank.created_at = datetime(2026, 2, 26, 9, 0, 0)
    latest_refill_date = date(2026, 2, 25)
    latest_refill_time = time(8, 45, 0)

    db_session.execute.return_value.fetchall.return_value = [
        (mock_tank, branch_id, branch_name, 0, latest_refill_date, latest_refill_time)
    ]
    
    result = ivf_service.get_active_tanks()
    
    assert result["total"] == 1
    assert len(result["branches"]) == 1
    assert result["branches"][0]["tanks"][0]["updated_at"] is not None
    assert result["branches"][0]["tanks"][0]["updated_at"].date() == latest_refill_date


def test_get_active_tanks_empty_results(ivf_service, db_session):
    """Test getting active tanks when no tanks exist"""
    db_session.execute.return_value.fetchall.return_value = []
    
    result = ivf_service.get_active_tanks()
    
    assert result["total"] == 0
    assert len(result["branches"]) == 0


# ==========================================
# Tests for _calculate_branch_status
# ==========================================

def test_calculate_branch_status_critical(ivf_service, db_session):
    """Test calculating branch status when tank is critical"""
    critical_tank = Mock()
    critical_tank.status = CanisterStatus.CRITICAL
    
    query = MagicMock()
    query.filter.return_value = query
    query.all.return_value = [critical_tank]
    
    db_session.query.return_value = query
    
    result = ivf_service._calculate_branch_status(1)
    
    assert result == "critical"


def test_calculate_branch_status_risk(ivf_service, db_session):
    """Test calculating branch status when tank is risk"""
    risk_tank = Mock()
    risk_tank.status = CanisterStatus.RISK
    
    query = MagicMock()
    query.filter.return_value = query
    query.all.return_value = [risk_tank]
    
    db_session.query.return_value = query
    
    result = ivf_service._calculate_branch_status(1)
    
    assert result == "risk"


def test_calculate_branch_status_safe(ivf_service, db_session):
    """Test calculating branch status when all tanks are safe"""
    safe_tank = Mock()
    safe_tank.status = CanisterStatus.SAFE
    
    query = MagicMock()
    query.filter.return_value = query
    query.all.return_value = [safe_tank]
    
    db_session.query.return_value = query
    
    result = ivf_service._calculate_branch_status(1)
    
    assert result == "safe"


def test_calculate_branch_status_no_tanks(ivf_service, db_session):
    """Test calculating branch status when no tanks exist"""
    query = MagicMock()
    query.filter.return_value = query
    query.all.return_value = []
    
    db_session.query.return_value = query
    
    result = ivf_service._calculate_branch_status(1)
    
    assert result == "safe"  # Default to safe


def test_calculate_branch_status_mixed_statuses(ivf_service, db_session):
    """Test calculating branch status with mixed tank statuses (should return critical)"""
    safe_tank = Mock()
    safe_tank.status = CanisterStatus.SAFE
    
    critical_tank = Mock()
    critical_tank.status = CanisterStatus.CRITICAL
    
    query = MagicMock()
    query.filter.return_value = query
    query.all.return_value = [safe_tank, critical_tank]
    
    db_session.query.return_value = query
    
    result = ivf_service._calculate_branch_status(1)
    
    assert result == "critical"  # Critical takes precedence


# ==========================================
# Tests for get_embryo_tracking
# ==========================================

def test_get_embryo_tracking_no_branch_filter(ivf_service, db_session):
    """Test getting embryo tracking without branch filter"""
    # Mock complex query with multiple joins
    embryo_query = MagicMock()
    embryo_query.join.return_value = embryo_query
    embryo_query.outerjoin.return_value = embryo_query
    embryo_query.filter.return_value = embryo_query
    embryo_query.group_by.return_value = embryo_query
    embryo_query.order_by.return_value = embryo_query
    embryo_query.count.return_value = 1
    embryo_query.offset.return_value = embryo_query
    embryo_query.limit.return_value = embryo_query
    
    # Create mock row objects
    mock_row = Mock()
    mock_row.cryolock_id = 1
    mock_row.his_number = "HIS-123"
    mock_row.cryolock_number = "CL-01"
    mock_row.canister_number = "C1"
    mock_row.tank_code = "T1"
    mock_row.cane_code = "A12"
    mock_row.goblet_color = "Yellow"
    mock_row.cryolock_color = "Blue"
    mock_row.date_of_vitrification = date.today()
    mock_row.branch_name = "Test Branch"
    mock_row.embryo_grading = "4AB"
    
    embryo_query.all.return_value = [mock_row]
    
    # Mock latest shipments subquery builder
    latest_shipments_query = MagicMock()
    latest_shipments_query.filter.return_value = latest_shipments_query
    latest_shipments_query.group_by.return_value = latest_shipments_query
    latest_shipments_query.subquery.return_value = MagicMock()
    
    query_call_count = [0]
    def query_side_effect(*args, **kwargs):
        query_call_count[0] += 1
        # First call builds latest_shipments_subq
        if query_call_count[0] == 1:
            return latest_shipments_query
        # Second call is the main embryo query
        elif query_call_count[0] == 2:
            return embryo_query
        return MagicMock()
    
    db_session.query.side_effect = query_side_effect
    
    result = ivf_service.get_embryo_tracking()
    
    assert "data" in result
    assert "total" in result
    assert isinstance(result["data"], list)
    assert result["data"][0]["site_name"] == "Test Branch"


def test_get_embryo_tracking_with_branch_filter(ivf_service, db_session):
    """Test getting embryo tracking with branch filter"""
    # Mock complex query with multiple joins
    embryo_query = MagicMock()
    embryo_query.join.return_value = embryo_query
    embryo_query.outerjoin.return_value = embryo_query
    embryo_query.filter.return_value = embryo_query
    embryo_query.group_by.return_value = embryo_query
    embryo_query.order_by.return_value = embryo_query
    embryo_query.count.return_value = 1
    embryo_query.offset.return_value = embryo_query
    embryo_query.limit.return_value = embryo_query
    
    # Create mock row objects
    mock_row = Mock()
    mock_row.cryolock_id = 1
    mock_row.his_number = "HIS-123"
    mock_row.cryolock_number = "CL-01"
    mock_row.canister_number = "C1"
    mock_row.tank_code = "T1"
    mock_row.cane_code = "A12"
    mock_row.goblet_color = "Yellow"
    mock_row.cryolock_color = "Blue"
    mock_row.date_of_vitrification = date.today()
    mock_row.branch_name = "Test Branch"
    mock_row.embryo_grading = "4AB"
    
    embryo_query.all.return_value = [mock_row]
    
    # Mock latest shipments subquery builder
    latest_shipments_query = MagicMock()
    latest_shipments_query.filter.return_value = latest_shipments_query
    latest_shipments_query.group_by.return_value = latest_shipments_query
    latest_shipments_query.subquery.return_value = MagicMock()
    
    query_call_count = [0]
    def query_side_effect(*args, **kwargs):
        query_call_count[0] += 1
        # First call builds latest_shipments_subq
        if query_call_count[0] == 1:
            return latest_shipments_query
        # Second call is the main embryo query
        elif query_call_count[0] == 2:
            return embryo_query
        return MagicMock()
    
    db_session.query.side_effect = query_side_effect
    
    result = ivf_service.get_embryo_tracking(branch_id=1)
    
    assert "data" in result
    assert "total" in result
    assert isinstance(result["data"], list)
    assert result["data"][0]["site_name"] == "Test Branch"
