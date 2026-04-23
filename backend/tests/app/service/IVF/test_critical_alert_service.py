"""
Unit tests for Critical Alert Service
"""
import pytest
from unittest.mock import MagicMock, Mock, patch
from datetime import datetime, timezone, date, timedelta
import uuid

from app.service.IVF.critical_alert_service import CriticalAlertService, QUALITY_LOSS_HIGH, QUALITY_LOSS_MEDIUM, REFILL_LOG_DAYS
from app.models.IVF.critical_alert_model import AlertSeverity, AlertStatus, AlertType
from app.constants.enums import CanisterStatus


@pytest.fixture
def db_session():
    """Create a mock database session"""
    return MagicMock()


@pytest.fixture
def alert_service(db_session):
    """Create Critical Alert Service instance"""
    return CriticalAlertService(db_session)


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
def mock_quality_log():
    """Create a mock quality log"""
    log = Mock()
    log.quality_log_id = 1
    log.canister_id = 1
    log.temperature = 5.0
    log.humidity = 50.0
    log.agitation = 2.0
    log.light = 1.0
    log.quality_loss = 0.0
    log.is_temp_loss = False
    log.is_humidity_loss = False
    log.is_agitation_loss = False
    log.is_light_loss = False
    return log


@pytest.fixture
def mock_ln2_log():
    """Create a mock LN2 log"""
    log = Mock()
    log.log_id = 1
    log.canister_id = 1
    log.refill_date = date.today()
    log.created_at = datetime.now(timezone.utc)
    return log


# ==========================================
# Tests for resolve_tank_id
# ==========================================

def test_resolve_tank_id_success(alert_service, db_session, mock_tank):
    """Test resolving tank code to ID successfully"""
    query = MagicMock()
    query.filter.return_value = query
    query.first.return_value = mock_tank
    
    db_session.query.return_value = query
    
    result = alert_service.resolve_tank_id("T1")
    
    assert result == 1


def test_resolve_tank_id_with_branch_filter(alert_service, db_session, mock_tank):
    """Test resolving tank code to ID with branch filter"""
    query = MagicMock()
    query.filter.return_value = query
    query.first.return_value = mock_tank
    
    db_session.query.return_value = query
    
    result = alert_service.resolve_tank_id("T1", branch_id=1)
    
    assert result == 1


def test_resolve_tank_id_not_found(alert_service, db_session):
    """Test resolving tank code when tank not found"""
    query = MagicMock()
    query.filter.return_value = query
    query.first.return_value = None
    
    db_session.query.return_value = query
    
    with pytest.raises(ValueError) as exc_info:
        alert_service.resolve_tank_id("INVALID")
    
    assert "not found" in str(exc_info.value).lower()


# ==========================================
# Tests for _check_kpi_deviation
# ==========================================

def test_check_kpi_deviation_no_violations(alert_service, mock_quality_log):
    """Test checking KPI deviation when no violations exist"""
    result = alert_service._check_kpi_deviation(mock_quality_log)
    
    assert result is None


def test_check_kpi_deviation_temperature_high(alert_service):
    """Test checking KPI deviation when temperature is too high"""
    log = Mock()
    log.temperature = 15.0  # Above max threshold
    log.humidity = None
    log.agitation = None
    log.light = None
    
    result = alert_service._check_kpi_deviation(log)
    
    assert result is not None
    assert result["severity"] == AlertSeverity.HIGH
    assert "Temperature" in result["message"]


def test_check_kpi_deviation_temperature_low(alert_service):
    """Test checking KPI deviation when temperature is too low"""
    log = Mock()
    log.temperature = -5.0  # Below min threshold
    log.humidity = None
    log.agitation = None
    log.light = None
    
    result = alert_service._check_kpi_deviation(log)
    
    assert result is not None
    assert result["severity"] == AlertSeverity.HIGH


def test_check_kpi_deviation_humidity_high(alert_service):
    """Test checking KPI deviation when humidity is too high"""
    log = Mock()
    log.temperature = None
    log.humidity = 60.0  # Above max threshold
    log.agitation = None
    log.light = None
    
    result = alert_service._check_kpi_deviation(log)
    
    assert result is not None
    assert result["severity"] == AlertSeverity.HIGH
    assert "Humidity" in result["message"]


def test_check_kpi_deviation_multiple_violations(alert_service):
    """Test checking KPI deviation with multiple violations"""
    log = Mock()
    log.temperature = 15.0  # Above max
    log.humidity = 60.0  # Above max
    log.agitation = None
    log.light = None
    
    result = alert_service._check_kpi_deviation(log)
    
    assert result is not None
    assert result["severity"] == AlertSeverity.HIGH
    assert "Temperature" in result["message"]
    assert "Humidity" in result["message"]


# ==========================================
# Tests for _check_quality_loss
# ==========================================

def test_check_quality_loss_no_loss(alert_service):
    """Test checking quality loss when no loss exists"""
    log = Mock()
    log.quality_loss = None
    
    result = alert_service._check_quality_loss(log)
    
    assert result is None


def test_check_quality_loss_high(alert_service):
    """Test checking quality loss when loss is high"""
    log = Mock()
    log.quality_loss = 20.0  # Above HIGH threshold
    
    result = alert_service._check_quality_loss(log)
    
    assert result is not None
    assert result["severity"] == AlertSeverity.HIGH
    assert "High quality loss" in result["message"]


def test_check_quality_loss_medium(alert_service):
    """Test checking quality loss when loss is medium"""
    log = Mock()
    log.quality_loss = 10.0  # Between MEDIUM and HIGH threshold
    
    result = alert_service._check_quality_loss(log)
    
    assert result is not None
    assert result["severity"] == AlertSeverity.MEDIUM
    assert "Quality loss" in result["message"]


def test_check_quality_loss_low(alert_service):
    """Test checking quality loss when loss is below threshold"""
    log = Mock()
    log.quality_loss = 2.0  # Below MEDIUM threshold
    
    result = alert_service._check_quality_loss(log)
    
    assert result is None


# ==========================================
# Tests for _check_refill_log
# ==========================================

def test_check_refill_log_no_log(alert_service, db_session):
    """Test checking refill log when no log exists"""
    query = MagicMock()
    query.filter.return_value = query
    query.order_by.return_value = query
    query.first.return_value = None
    
    db_session.query.return_value = query
    
    result = alert_service._check_refill_log(1)
    
    assert result is not None
    assert result["severity"] == AlertSeverity.HIGH
    assert "Refill log not found" in result["message"]


def test_check_refill_log_recent(alert_service, db_session, mock_ln2_log):
    """Test checking refill log when log is recent"""
    mock_ln2_log.refill_date = date.today() - timedelta(days=1)
    
    query = MagicMock()
    query.filter.return_value = query
    query.order_by.return_value = query
    query.first.return_value = mock_ln2_log
    
    db_session.query.return_value = query
    
    result = alert_service._check_refill_log(1)
    
    assert result is None  # No alert if within threshold


def test_check_refill_log_old(alert_service, db_session, mock_ln2_log):
    """Test checking refill log when log is too old"""
    mock_ln2_log.refill_date = date.today() - timedelta(days=REFILL_LOG_DAYS + 1)
    
    query = MagicMock()
    query.filter.return_value = query
    query.order_by.return_value = query
    query.first.return_value = mock_ln2_log
    
    db_session.query.return_value = query
    
    result = alert_service._check_refill_log(1)
    
    assert result is not None
    assert result["severity"] in [AlertSeverity.HIGH, AlertSeverity.MEDIUM]
    assert "refill log" in result["message"].lower()


# ==========================================
# Tests for get_tank_alerts_by_code
# ==========================================

def test_get_tank_alerts_by_code_success(alert_service, db_session, mock_tank):
    """Test getting tank alerts by code successfully"""
    # Mock resolve_tank_id
    with patch.object(alert_service, 'resolve_tank_id', return_value=1):
        # Mock alert query
        alert_query = MagicMock()
        alert_query.filter.return_value = alert_query
        alert_query.order_by.return_value = alert_query
        alert_query.all.return_value = []
        
        # Mock tank query
        mock_tank_obj = Mock()
        mock_tank_obj.tank_id = 1
        mock_tank_obj.tank_code = "T1"
        tank_query = MagicMock()
        tank_query.filter.return_value.first.return_value = mock_tank_obj
        
        query_call_count = [0]
        def query_side_effect(model):
            query_call_count[0] += 1
            if hasattr(model, '__name__') and model.__name__ == 'Tank':
                return tank_query
            if query_call_count[0] == 1:
                return alert_query
            return MagicMock()
        
        db_session.query.side_effect = query_side_effect
        
        result = alert_service.get_tank_alerts_by_code("T1")
        
        assert result.tank_code == "T1"
        assert result.tank_id == 1
        assert isinstance(result.alerts, list)
        assert result.total_count == 0


def test_get_tank_alerts_by_code_not_found(alert_service, db_session):
    """Test getting tank alerts when tank not found"""
    with patch.object(alert_service, 'resolve_tank_id', side_effect=ValueError("Not found")):
        with pytest.raises(ValueError):
            alert_service.get_tank_alerts_by_code("INVALID")


# ==========================================
# Tests for get_hospital_alerts
# ==========================================

def test_get_hospital_alerts_no_filter(alert_service, db_session):
    """Test getting hospital alerts without status filter"""
    alert_query = MagicMock()
    alert_query.join.return_value = alert_query
    alert_query.filter.return_value = alert_query
    alert_query.order_by.return_value = alert_query
    alert_query.all.return_value = []
    
    canister_query = MagicMock()
    canister_query.filter.return_value = canister_query
    canister_query.all.return_value = []
    
    query_call_count = [0]
    def query_side_effect(model):
        query_call_count[0] += 1
        if query_call_count[0] == 1:
            return alert_query
        elif query_call_count[0] == 2:
            return canister_query
        return MagicMock()
    
    db_session.query.side_effect = query_side_effect
    
    result = alert_service.get_hospital_alerts()
    
    assert isinstance(result.alerts, list)
    assert result.total_count == 0
    assert result.active_count == 0
    assert result.acknowledged_count == 0


def test_get_hospital_alerts_with_status_filter(alert_service, db_session):
    """Test getting hospital alerts with status filter"""
    from app.constants.enums import AlertStatus
    
    alert_query = MagicMock()
    alert_query.join.return_value = alert_query
    alert_query.filter.return_value = alert_query
    alert_query.order_by.return_value = alert_query
    alert_query.all.return_value = []
    
    canister_query = MagicMock()
    canister_query.filter.return_value = canister_query
    canister_query.all.return_value = []
    
    query_call_count = [0]
    def query_side_effect(model):
        query_call_count[0] += 1
        if query_call_count[0] == 1:
            return alert_query
        elif query_call_count[0] == 2:
            return canister_query
        return MagicMock()
    
    db_session.query.side_effect = query_side_effect
    
    result = alert_service.get_hospital_alerts(status=AlertStatus.ACTIVE)
    
    assert isinstance(result.alerts, list)
    assert result.total_count == 0


def test_get_hospital_alerts_with_branch_filter(alert_service, db_session):
    """Test getting hospital alerts with branch filter"""
    alert_query = MagicMock()
    alert_query.join.return_value = alert_query
    alert_query.filter.return_value = alert_query
    alert_query.order_by.return_value = alert_query
    alert_query.all.return_value = []
    
    branch_query = MagicMock()
    branch_query.filter.return_value = branch_query
    branch_query.first.return_value = None
    
    canister_query = MagicMock()
    canister_query.filter.return_value = canister_query
    canister_query.all.return_value = []
    
    query_call_count = [0]
    def query_side_effect(model):
        query_call_count[0] += 1
        if query_call_count[0] == 1:
            return alert_query
        elif query_call_count[0] == 2:
            return branch_query
        elif query_call_count[0] == 3:
            return canister_query
        return MagicMock()
    
    db_session.query.side_effect = query_side_effect
    
    result = alert_service.get_hospital_alerts(branch_id=1, role="User")
    
    assert isinstance(result.alerts, list)


# ==========================================
# Tests for acknowledge_alert
# ==========================================

def test_acknowledge_alert_success(alert_service, db_session):
    """Test acknowledging an alert successfully"""
    mock_alert = Mock()
    mock_alert.alert_id = str(uuid.uuid4())
    mock_alert.status = AlertStatus.ACTIVE.value
    mock_alert.acknowledged_by = None
    mock_alert.acknowledged_at = None
    
    query = MagicMock()
    query.filter.return_value = query
    query.first.return_value = mock_alert
    
    db_session.query.return_value = query
    
    result = alert_service.acknowledge_alert(mock_alert.alert_id, "USER-123")
    
    assert result.alert_id == mock_alert.alert_id
    assert mock_alert.status == AlertStatus.ACKNOWLEDGED.value
    assert mock_alert.acknowledged_by == "USER-123"
    assert mock_alert.acknowledged_at is not None
    db_session.commit.assert_called_once()


def test_acknowledge_alert_not_found(alert_service, db_session):
    """Test acknowledging an alert when alert not found"""
    query = MagicMock()
    query.filter.return_value = query
    query.first.return_value = None
    
    db_session.query.return_value = query
    
    with pytest.raises(ValueError) as exc_info:
        alert_service.acknowledge_alert("INVALID-ID", "USER-123")
    
    assert "not found" in str(exc_info.value).lower()


def test_acknowledge_alerts_success(alert_service, db_session):
    """Test acknowledging multiple alerts successfully"""
    alert_id_1 = str(uuid.uuid4())
    alert_id_2 = str(uuid.uuid4())
    mock_alert_1 = Mock()
    mock_alert_1.alert_id = alert_id_1
    mock_alert_1.status = AlertStatus.ACTIVE.value
    mock_alert_1.acknowledged_by = None
    mock_alert_1.acknowledged_at = None
    mock_alert_2 = Mock()
    mock_alert_2.alert_id = alert_id_2
    mock_alert_2.status = AlertStatus.ACTIVE.value
    mock_alert_2.acknowledged_by = None
    mock_alert_2.acknowledged_at = None

    query = MagicMock()
    query.filter.return_value = query
    query.all.return_value = [mock_alert_1, mock_alert_2]
    db_session.query.return_value = query

    result = alert_service.acknowledge_alerts([alert_id_1, alert_id_2], "USER-123")

    assert result.alert_id == [alert_id_1, alert_id_2]
    assert result.acknowledged_count == 2
    assert mock_alert_1.status == AlertStatus.ACKNOWLEDGED.value
    assert mock_alert_2.status == AlertStatus.ACKNOWLEDGED.value
    assert mock_alert_1.acknowledged_by == "USER-123"
    assert mock_alert_2.acknowledged_by == "USER-123"
    db_session.commit.assert_called_once()


# ==========================================
# Tests for check_and_create_alerts
# ==========================================

def test_check_and_create_alerts_no_alerts(alert_service, db_session, mock_canister):
    """Test checking and creating alerts when no alerts needed"""
    # Mock canister query
    canister_query = MagicMock()
    canister_query.join.return_value = canister_query
    canister_query.filter.return_value = canister_query
    canister_query.all.return_value = [mock_canister]
    
    # Mock quality log query (empty)
    quality_log_query = MagicMock()
    quality_log_query.filter.return_value = quality_log_query
    quality_log_query.order_by.return_value = quality_log_query
    quality_log_query.first.return_value = None
    
    # Mock LN2 log query (recent)
    ln2_log_query = MagicMock()
    ln2_log_query.filter.return_value = ln2_log_query
    ln2_log_query.order_by.return_value = ln2_log_query
    
    mock_ln2_log = Mock()
    mock_ln2_log.refill_date = date.today()
    ln2_log_query.first.return_value = mock_ln2_log
    
    # Mock tank query for _get_canister_hospital_branch
    tank_query = MagicMock()
    tank_query.filter.return_value = tank_query
    tank_query.first.return_value = Mock(branch_id=1)
    
    # Mock branch query
    branch_query = MagicMock()
    branch_query.filter.return_value = branch_query
    branch_query.first.return_value = Mock(hospital_id=1, branch_id=1)
    
    query_call_count = [0]
    def query_side_effect(model):
        query_call_count[0] += 1
        if hasattr(model, '__name__'):
            if model.__name__ == 'Canister':
                if query_call_count[0] == 1:
                    return canister_query
                elif query_call_count[0] == 4:
                    return tank_query
            elif model.__name__ == 'IVFQualityLog':
                return quality_log_query
            elif model.__name__ == 'CanisterLn2Log':
                return ln2_log_query
            elif model.__name__ == 'Tank':
                return tank_query
            elif model.__name__ == 'HospitalBranch':
                return branch_query
        return MagicMock()
    
    db_session.query.side_effect = query_side_effect
    
    result = alert_service.check_and_create_alerts()
    
    assert isinstance(result, list)
