import pytest
from unittest.mock import MagicMock, Mock, patch
from datetime import datetime, timedelta, timezone

from app.service import account_locking_service
from app.exceptions import AccountLockedException
from app.models.user_model import User
from app.constants.app_constants import MAX_LOGIN_ATTEMPTS, ACCOUNT_LOCK_DURATION_MINUTES


@pytest.fixture
def db_session():
    """Create a mock database session"""
    return MagicMock()


@pytest.fixture
def mock_user():
    """Create a mock user"""
    user = Mock(spec=User)
    user.user_id = "USER-123"
    user.is_locked = False
    user.lock_expiry = None
    user.login_attempts = 0
    user.last_login = None
    return user


# ==========================================
# Tests for check_account_lock_status
# ==========================================

def test_check_account_lock_status_not_locked(db_session, mock_user):
    """Test checking account lock status when account is not locked"""
    # Account not locked
    mock_user.is_locked = False
    
    # Should not raise exception
    account_locking_service.check_account_lock_status(mock_user, db_session)
    
    # Should not call unlock_account
    db_session.commit.assert_not_called()


@patch('app.service.account_locking_service.unlock_account')
def test_check_account_lock_status_expired_lock(mock_unlock, db_session, mock_user):
    """Test checking account lock status when lock has expired"""
    # Account is locked but expiry is in the past
    mock_user.is_locked = True
    mock_user.lock_expiry = datetime.now(timezone.utc) - timedelta(minutes=5)
    
    # Should auto-unlock
    account_locking_service.check_account_lock_status(mock_user, db_session)
    
    # Should call unlock_account
    mock_unlock.assert_called_once_with(mock_user, db_session)


@patch('app.service.account_locking_service.unlock_account')
def test_check_account_lock_status_expired_lock_naive_datetime(mock_unlock, db_session, mock_user):
    """Test checking account lock status when lock has expired with naive datetime"""
    # Account is locked with naive datetime (expired)
    mock_user.is_locked = True
    # Create a naive datetime in the past
    naive_expiry = datetime.now() - timedelta(minutes=5)
    mock_user.lock_expiry = naive_expiry
    
    # Should auto-unlock
    account_locking_service.check_account_lock_status(mock_user, db_session)
    
    # Should call unlock_account
    mock_unlock.assert_called_once_with(mock_user, db_session)


def test_check_account_lock_status_active_lock(db_session, mock_user):
    """Test checking account lock status when account is actively locked"""
    # Account is locked and expiry is in the future
    future_time = datetime.now(timezone.utc) + timedelta(minutes=15)
    mock_user.is_locked = True
    mock_user.lock_expiry = future_time
    
    # Should raise AccountLockedException
    with pytest.raises(AccountLockedException) as exc_info:
        account_locking_service.check_account_lock_status(mock_user, db_session)
    
    assert exc_info.value.details['user_id'] == mock_user.user_id
    assert exc_info.value.details['minutes_remaining'] > 0
    assert exc_info.value.details['unlock_time'] is not None


def test_check_account_lock_status_active_lock_naive_datetime(db_session, mock_user):
    """Test checking account lock status when account is locked with naive datetime (future)"""
    # Account is locked with naive datetime (future)
    mock_user.is_locked = True
    # Create a naive datetime in the future
    naive_expiry = datetime.now() + timedelta(minutes=15)
    mock_user.lock_expiry = naive_expiry
    
    # Should raise AccountLockedException
    with pytest.raises(AccountLockedException) as exc_info:
        account_locking_service.check_account_lock_status(mock_user, db_session)
    
    assert exc_info.value.details['user_id'] == mock_user.user_id
    assert exc_info.value.details['minutes_remaining'] > 0


def test_check_account_lock_status_no_expiry(db_session, mock_user):
    """Test checking account lock status when account is locked but has no expiry"""
    # Account is locked but no expiry set
    mock_user.is_locked = True
    mock_user.lock_expiry = None
    
    # Should raise AccountLockedException with default duration
    with pytest.raises(AccountLockedException) as exc_info:
        account_locking_service.check_account_lock_status(mock_user, db_session)
    
    assert exc_info.value.details['user_id'] == mock_user.user_id
    assert exc_info.value.details['minutes_remaining'] == ACCOUNT_LOCK_DURATION_MINUTES
    assert exc_info.value.details['unlock_time'] is None


# ==========================================
# Tests for increment_failed_login_attempt
# ==========================================

@patch('app.service.account_locking_service.lock_account')
def test_increment_failed_login_attempt_below_threshold(mock_lock, db_session, mock_user):
    """Test incrementing failed login attempts when below threshold"""
    # User has 2 attempts, threshold is 5
    mock_user.login_attempts = 2
    
    account_locking_service.increment_failed_login_attempt(mock_user, db_session)
    
    # Should increment attempts
    assert mock_user.login_attempts == 3
    # Should commit but not lock
    db_session.commit.assert_called_once()
    mock_lock.assert_not_called()


@patch('app.service.account_locking_service.lock_account')
def test_increment_failed_login_attempt_at_threshold(mock_lock, db_session, mock_user):
    """Test incrementing failed login attempts when at threshold"""
    # User has 4 attempts, threshold is 5, so next attempt will trigger lock
    mock_user.login_attempts = MAX_LOGIN_ATTEMPTS - 1
    
    account_locking_service.increment_failed_login_attempt(mock_user, db_session)
    
    # Should increment attempts
    assert mock_user.login_attempts == MAX_LOGIN_ATTEMPTS
    # Should lock account
    mock_lock.assert_called_once_with(mock_user, db_session)
    # Should not commit separately (lock_account commits)
    # Note: lock_account will commit, so we don't check db_session.commit here


@patch('app.service.account_locking_service.lock_account')
def test_increment_failed_login_attempt_above_threshold(mock_lock, db_session, mock_user):
    """Test incrementing failed login attempts when already above threshold"""
    # User already has 5+ attempts (shouldn't happen in practice, but test edge case)
    mock_user.login_attempts = MAX_LOGIN_ATTEMPTS
    
    account_locking_service.increment_failed_login_attempt(mock_user, db_session)
    
    # Should still increment
    assert mock_user.login_attempts == MAX_LOGIN_ATTEMPTS + 1
    # Should lock account
    mock_lock.assert_called_once_with(mock_user, db_session)


# ==========================================
# Tests for lock_account
# ==========================================

def test_lock_account_default_duration(db_session, mock_user):
    """Test locking account with default duration"""
    account_locking_service.lock_account(mock_user, db_session)
    
    # Should set lock flags
    assert mock_user.is_locked is True
    assert mock_user.lock_expiry is not None
    
    # Check expiry is approximately 30 minutes from now
    expected_expiry = datetime.now(timezone.utc) + timedelta(minutes=ACCOUNT_LOCK_DURATION_MINUTES)
    time_diff = abs((mock_user.lock_expiry - expected_expiry).total_seconds())
    assert time_diff < 5  # Allow 5 seconds difference for test execution time
    
    # Should commit
    db_session.commit.assert_called_once()


def test_lock_account_custom_duration(db_session, mock_user):
    """Test locking account with custom duration"""
    custom_duration = 60  # 60 minutes
    
    account_locking_service.lock_account(mock_user, db_session, duration_minutes=custom_duration)
    
    # Should set lock flags
    assert mock_user.is_locked is True
    assert mock_user.lock_expiry is not None
    
    # Check expiry is approximately 60 minutes from now
    expected_expiry = datetime.now(timezone.utc) + timedelta(minutes=custom_duration)
    time_diff = abs((mock_user.lock_expiry - expected_expiry).total_seconds())
    assert time_diff < 5  # Allow 5 seconds difference
    
    # Should commit
    db_session.commit.assert_called_once()


# ==========================================
# Tests for unlock_account
# ==========================================

def test_unlock_account(db_session, mock_user):
    """Test unlocking account"""
    # Set up locked account
    mock_user.is_locked = True
    mock_user.lock_expiry = datetime.now(timezone.utc) + timedelta(minutes=15)
    mock_user.login_attempts = 5
    
    account_locking_service.unlock_account(mock_user, db_session)
    
    # Should reset all lock-related fields
    assert mock_user.is_locked is False
    assert mock_user.lock_expiry is None
    assert mock_user.login_attempts == 0
    
    # Should commit
    db_session.commit.assert_called_once()


def test_unlock_account_already_unlocked(db_session, mock_user):
    """Test unlocking account that is already unlocked"""
    # Account already unlocked
    mock_user.is_locked = False
    mock_user.lock_expiry = None
    mock_user.login_attempts = 0
    
    account_locking_service.unlock_account(mock_user, db_session)
    
    # Should still reset (idempotent)
    assert mock_user.is_locked is False
    assert mock_user.lock_expiry is None
    assert mock_user.login_attempts == 0
    
    # Should commit
    db_session.commit.assert_called_once()


# ==========================================
# Tests for reset_login_attempts
# ==========================================

def test_reset_login_attempts(db_session, mock_user):
    """Test resetting login attempts"""
    # Set up user with failed attempts
    mock_user.login_attempts = 3
    old_last_login = datetime.now(timezone.utc) - timedelta(days=1)
    mock_user.last_login = old_last_login
    
    account_locking_service.reset_login_attempts(mock_user, db_session)
    
    # Should reset attempts
    assert mock_user.login_attempts == 0
    
    # Should update last_login
    assert mock_user.last_login is not None
    assert isinstance(mock_user.last_login, datetime)
    # Should be recent (within last minute)
    time_diff = abs((mock_user.last_login - datetime.now(timezone.utc)).total_seconds())
    assert time_diff < 60
    
    # Should commit
    db_session.commit.assert_called_once()


def test_reset_login_attempts_no_previous_login(db_session, mock_user):
    """Test resetting login attempts when user has no previous login"""
    # User with no previous login
    mock_user.login_attempts = 2
    mock_user.last_login = None
    
    account_locking_service.reset_login_attempts(mock_user, db_session)
    
    # Should reset attempts
    assert mock_user.login_attempts == 0
    
    # Should set last_login
    assert mock_user.last_login is not None
    assert isinstance(mock_user.last_login, datetime)
    
    # Should commit
    db_session.commit.assert_called_once()


# ==========================================
# Tests for get_remaining_attempts
# ==========================================

def test_get_remaining_attempts_no_attempts(mock_user):
    """Test getting remaining attempts when user has no failed attempts"""
    mock_user.login_attempts = 0
    
    remaining = account_locking_service.get_remaining_attempts(mock_user)
    
    assert remaining == MAX_LOGIN_ATTEMPTS


def test_get_remaining_attempts_some_attempts(mock_user):
    """Test getting remaining attempts when user has some failed attempts"""
    mock_user.login_attempts = 2
    
    remaining = account_locking_service.get_remaining_attempts(mock_user)
    
    assert remaining == MAX_LOGIN_ATTEMPTS - 2


def test_get_remaining_attempts_at_threshold(mock_user):
    """Test getting remaining attempts when user is at threshold"""
    mock_user.login_attempts = MAX_LOGIN_ATTEMPTS - 1
    
    remaining = account_locking_service.get_remaining_attempts(mock_user)
    
    assert remaining == 1


def test_get_remaining_attempts_at_max(mock_user):
    """Test getting remaining attempts when user is at max"""
    mock_user.login_attempts = MAX_LOGIN_ATTEMPTS
    
    remaining = account_locking_service.get_remaining_attempts(mock_user)
    
    assert remaining == 0


def test_get_remaining_attempts_above_max(mock_user):
    """Test getting remaining attempts when user is above max (edge case)"""
    mock_user.login_attempts = MAX_LOGIN_ATTEMPTS + 2
    
    remaining = account_locking_service.get_remaining_attempts(mock_user)
    
    # Should return negative (edge case)
    assert remaining < 0


# ==========================================
# Tests for is_account_locked
# ==========================================

def test_is_account_locked_not_locked(mock_user):
    """Test checking if account is locked when not locked"""
    mock_user.is_locked = False
    
    result = account_locking_service.is_account_locked(mock_user)
    
    assert result is False


def test_is_account_locked_with_future_expiry(mock_user):
    """Test checking if account is locked when locked with future expiry"""
    mock_user.is_locked = True
    mock_user.lock_expiry = datetime.now(timezone.utc) + timedelta(minutes=15)
    
    result = account_locking_service.is_account_locked(mock_user)
    
    assert result is True


def test_is_account_locked_with_past_expiry(mock_user):
    """Test checking if account is locked when locked with past expiry"""
    mock_user.is_locked = True
    mock_user.lock_expiry = datetime.now(timezone.utc) - timedelta(minutes=5)
    
    result = account_locking_service.is_account_locked(mock_user)
    
    assert result is False  # Lock expired, so not locked


def test_is_account_locked_with_no_expiry(mock_user):
    """Test checking if account is locked when locked with no expiry"""
    mock_user.is_locked = True
    mock_user.lock_expiry = None
    
    result = account_locking_service.is_account_locked(mock_user)
    
    assert result is True  # Locked indefinitely


def test_is_account_locked_with_naive_datetime_future(mock_user):
    """Test checking if account is locked with naive datetime (future)"""
    mock_user.is_locked = True
    # Create a naive datetime in the future
    naive_expiry = datetime.now() + timedelta(minutes=15)
    mock_user.lock_expiry = naive_expiry
    
    result = account_locking_service.is_account_locked(mock_user)
    
    assert result is True


def test_is_account_locked_with_naive_datetime_past(mock_user):
    """Test checking if account is locked with naive datetime (past)"""
    mock_user.is_locked = True
    # Create a naive datetime in the past
    naive_expiry = datetime.now() - timedelta(minutes=5)
    mock_user.lock_expiry = naive_expiry
    
    result = account_locking_service.is_account_locked(mock_user)
    
    assert result is False  # Lock expired


def test_is_account_locked_exactly_at_expiry(mock_user):
    """Test checking if account is locked exactly at expiry time"""
    mock_user.is_locked = True
    # Set expiry to exactly now (should be considered expired)
    mock_user.lock_expiry = datetime.now(timezone.utc)
    
    result = account_locking_service.is_account_locked(mock_user)
    
    # At expiry time, should be considered not locked (expired)
    assert result is False

