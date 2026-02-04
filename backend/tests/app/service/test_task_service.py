import pytest
from unittest.mock import MagicMock, Mock, patch
from datetime import datetime, timezone
from sqlalchemy.exc import IntegrityError

from app.service import task_service
from app.exceptions import (
    TaskCreateFailedException,
    TaskNotFoundException,
    TaskInvalidAssigneeException,
    TaskInvalidPatientException,
    TaskUpdateFailedException,
    TaskDeleteFailedException,
    TaskUnauthorizedEditException,
    TaskUnauthorizedStatusException,
    TaskManagerOnlyException,
    DatabaseQueryException
)
from app.models.task_model import Tasks
from app.models.user_model import User
from app.models.patient_model import Patient
from app.schemas.task_schema import (
    CreateTaskRequest,
    UpdateTaskRequest,
    UpdateTaskStatusRequest
)
from app.constants.enums import TaskStatus, TaskPriority


@pytest.fixture
def db_session():
    """Create a mock database session"""
    return MagicMock()


@pytest.fixture
def mock_user():
    """Create a mock user"""
    user = Mock(spec=User)
    user.user_id = "USER-123"
    user.pharma_id = 42
    user.role = "manager"
    user.first_name = "John"
    user.last_name = "Doe"
    user.email = "john.doe@example.com"
    user.approved_status = "approved"
    user.status = True
    user.department = None  # None means pharma user (CGT), not hospital user (IVF)
    user.hospital_id = None
    user.branch_id = None
    return user


@pytest.fixture
def mock_assignee():
    """Create a mock assignee user"""
    assignee = Mock(spec=User)
    assignee.user_id = "USER-456"
    assignee.pharma_id = 42
    assignee.role = "staff"
    assignee.first_name = "Jane"
    assignee.last_name = "Smith"
    assignee.email = "jane.smith@example.com"
    assignee.approved_status = "approved"
    assignee.status = True
    assignee.department = None  # None means pharma user (CGT)
    assignee.hospital_id = None
    assignee.branch_id = None
    return assignee


@pytest.fixture
def mock_task(mock_user, mock_assignee):
    """Create a mock task"""
    task = Mock(spec=Tasks)
    task.id = 1
    task.task_name = "Test Task"
    task.description = "Test Description"
    task.assignee_id = mock_assignee.user_id
    task.assignee = mock_assignee
    task.created_by_id = mock_user.user_id
    task.created_by = mock_user
    task.updated_by_id = mock_user.user_id
    task.patient_id = None
    task.canister_id = None  # Explicitly set to None
    task.due_date = None
    task.priority = TaskPriority.MEDIUM
    task.status = TaskStatus.NOT_STARTED
    task.created_at = datetime.now(timezone.utc)
    task.updated_at = datetime.now(timezone.utc)
    return task


@pytest.fixture
def mock_patient():
    """Create a mock patient"""
    patient = Mock(spec=Patient)
    patient.id = "PT-123"
    patient.pharma_id = 42
    return patient


def _setup_patient_task_queries(db_session, mock_patient, task_list, total_count=None):
    """Helper to mock patient lookup and task query chain"""
    patient_query = MagicMock()
    patient_query.filter.return_value = patient_query
    patient_query.first.return_value = mock_patient

    tasks_query = MagicMock()
    tasks_query.options.return_value = tasks_query
    tasks_query.filter.return_value = tasks_query
    tasks_query.order_by.return_value = tasks_query
    tasks_query.offset.return_value = tasks_query
    tasks_query.limit.return_value = tasks_query
    tasks_query.count.return_value = total_count if total_count is not None else len(task_list)
    tasks_query.all.return_value = task_list

    def query_side_effect(model):
        if model == Patient:
            return patient_query
        if model == Tasks:
            return tasks_query
        return MagicMock()

    db_session.query.side_effect = query_side_effect
    return patient_query, tasks_query


# ==========================================
# Tests for _build_task_response
# ==========================================

def test_build_task_response_success(mock_user, mock_assignee, mock_task, db_session):
    """Test building task response successfully"""
    result = task_service._build_task_response(mock_task, mock_user, db_session)
    
    assert result.id == mock_task.id
    assert result.task_name == mock_task.task_name
    assert result.description == mock_task.description
    assert result.assignee.user_id == mock_assignee.user_id
    assert result.created_by.user_id == mock_user.user_id
    assert result.permissions.can_edit_all is True  # User is creator
    assert result.permissions.can_edit_status_only is False  # User is not assignee


def test_build_task_response_assignee_permissions(mock_user, mock_assignee, mock_task, db_session):
    """Test building task response when user is assignee"""
    # Make user the assignee
    mock_task.assignee_id = mock_user.user_id
    mock_task.assignee = mock_user
    mock_task.created_by_id = "OTHER-USER"
    
    result = task_service._build_task_response(mock_task, mock_user, db_session)
    
    assert result.permissions.can_edit_all is False  # User is not creator
    assert result.permissions.can_edit_status_only is True  # User is assignee


# ==========================================
# Tests for create_task
# ==========================================

@patch('app.service.task_service.get_user_by_id')
@patch('app.service.task_service._build_task_response')
@patch('app.service.task_service.Tasks')
def test_create_task_success(mock_tasks_class, mock_build_response, mock_get_user, db_session, mock_user, mock_assignee, mock_patient):
    """Test creating a task successfully"""
    # Setup mocks
    mock_get_user.return_value = mock_assignee
    
    request = CreateTaskRequest(
        task_name="New Task",
        description="Task Description",
        assignee_id=mock_assignee.user_id,
        patient_id=mock_patient.id,
        due_date=datetime.now(timezone.utc),
        priority=TaskPriority.HIGH,
        status=TaskStatus.NOT_STARTED
    )
    
    # Mock patient query
    patient_query = MagicMock()
    patient_query.filter.return_value.first.return_value = mock_patient
    
    # Mock task creation - create a mock task instance
    new_task = Mock(spec=Tasks)
    new_task.id = 1
    new_task.task_name = request.task_name
    new_task.description = request.description
    new_task.assignee_id = request.assignee_id
    new_task.assignee = mock_assignee
    new_task.created_by_id = mock_user.user_id
    new_task.created_by = mock_user
    new_task.updated_by_id = mock_user.user_id
    new_task.patient_id = request.patient_id
    new_task.canister_id = None
    new_task.due_date = request.due_date
    new_task.priority = request.priority
    new_task.status = request.status
    new_task.created_at = datetime.now(timezone.utc)
    new_task.updated_at = datetime.now(timezone.utc)
    
    # Mock db.query to return patient_query for Patient
    def query_side_effect(model):
        if model.__name__ == 'Patient':
            return patient_query
        return MagicMock()
    
    db_session.query.side_effect = query_side_effect
    
    # Mock Tasks constructor to return our mock task
    mock_tasks_class.return_value = new_task
    
    # Mock db.add, commit, refresh
    db_session.add = MagicMock()
    db_session.commit = MagicMock()
    db_session.refresh = MagicMock(side_effect=lambda obj: None)  # refresh updates the object in place
    
    # Mock _build_task_response to return a proper response
    from app.schemas.task_schema import TaskResponse, TaskAssigneeInfo, TaskCreatorInfo, TaskPermissions
    mock_response = TaskResponse(
        id=new_task.id,
        task_name=new_task.task_name,
        description=new_task.description,
        assignee=TaskAssigneeInfo(
            user_id=mock_assignee.user_id,
            first_name=mock_assignee.first_name,
            last_name=mock_assignee.last_name,
            email=mock_assignee.email,
            role="Manager"
        ),
        created_by=TaskCreatorInfo(
            user_id=mock_user.user_id,
            first_name=mock_user.first_name,
            last_name=mock_user.last_name,
            email=mock_user.email,
            role="Manager"
        ),
        patient_id=new_task.patient_id,
        canister_number=None,
        due_date=new_task.due_date,
        priority=new_task.priority,
        status=new_task.status,
        created_at=new_task.created_at,
        updated_at=new_task.updated_at,
        permissions=TaskPermissions(can_edit_all=True, can_edit_status_only=False)
    )
    mock_build_response.return_value = mock_response
    
    result = task_service.create_task(request, mock_user, db_session)
    
    assert result.message is not None
    assert result.task.id == 1
    assert result.task.task_name == request.task_name
    db_session.add.assert_called_once()
    db_session.commit.assert_called_once()


@patch('app.service.task_service.get_user_by_id')
def test_create_task_manager_only_exception(mock_get_user, db_session, mock_user):
    """Test creating task when user is not manager or pharma_admin"""
    mock_user.role = "staff"
    
    request = CreateTaskRequest(
        task_name="New Task",
        assignee_id="USER-456",
        priority=TaskPriority.MEDIUM
    )
    
    with pytest.raises(TaskManagerOnlyException) as exc_info:
        task_service.create_task(request, mock_user, db_session)
    
    assert exc_info.value.details['user_role'] == "staff"


@patch('app.service.task_service.get_user_by_id')
def test_create_task_invalid_assignee_not_found(mock_get_user, db_session, mock_user):
    """Test creating task when assignee is not found"""
    mock_get_user.return_value = None
    
    request = CreateTaskRequest(
        task_name="New Task",
        assignee_id="INVALID-USER",
        priority=TaskPriority.MEDIUM
    )
    
    with pytest.raises(TaskInvalidAssigneeException) as exc_info:
        task_service.create_task(request, mock_user, db_session)
    
    assert exc_info.value.details['user_id'] == "INVALID-USER"


@patch('app.service.task_service.get_user_by_id')
def test_create_task_invalid_assignee_different_pharma(mock_get_user, db_session, mock_user, mock_assignee):
    """Test creating task when assignee is from different company"""
    mock_assignee.pharma_id = 99  # Different pharma_id
    mock_get_user.return_value = mock_assignee
    
    request = CreateTaskRequest(
        task_name="New Task",
        assignee_id=mock_assignee.user_id,
        priority=TaskPriority.MEDIUM
    )
    
    with pytest.raises(TaskInvalidAssigneeException):
        task_service.create_task(request, mock_user, db_session)


@patch('app.service.task_service.get_user_by_id')
def test_create_task_invalid_assignee_not_approved(mock_get_user, db_session, mock_user, mock_assignee):
    """Test creating task when assignee is not approved"""
    mock_assignee.approved_status = "pending"
    mock_get_user.return_value = mock_assignee
    
    request = CreateTaskRequest(
        task_name="New Task",
        assignee_id=mock_assignee.user_id,
        priority=TaskPriority.MEDIUM
    )
    
    with pytest.raises(TaskInvalidAssigneeException):
        task_service.create_task(request, mock_user, db_session)


@patch('app.service.task_service.get_user_by_id')
def test_create_task_invalid_assignee_inactive(mock_get_user, db_session, mock_user, mock_assignee):
    """Test creating task when assignee is inactive"""
    mock_assignee.status = False
    mock_get_user.return_value = mock_assignee
    
    request = CreateTaskRequest(
        task_name="New Task",
        assignee_id=mock_assignee.user_id,
        priority=TaskPriority.MEDIUM
    )
    
    with pytest.raises(TaskInvalidAssigneeException):
        task_service.create_task(request, mock_user, db_session)


@patch('app.service.task_service.get_user_by_id')
def test_create_task_invalid_patient(mock_get_user, db_session, mock_user, mock_assignee):
    """Test creating task when patient is not found"""
    mock_get_user.return_value = mock_assignee
    
    request = CreateTaskRequest(
        task_name="New Task",
        assignee_id=mock_assignee.user_id,
        patient_id="INVALID-PATIENT",
        priority=TaskPriority.MEDIUM
    )
    
    # Mock patient query to return None
    patient_query = MagicMock()
    patient_query.filter.return_value.first.return_value = None
    db_session.query.return_value = patient_query
    
    with pytest.raises(TaskInvalidPatientException) as exc_info:
        task_service.create_task(request, mock_user, db_session)
    
    assert exc_info.value.details['patient_id'] == "INVALID-PATIENT"


@patch('app.service.task_service.get_user_by_id')
def test_create_task_integrity_error(mock_get_user, db_session, mock_user, mock_assignee, mock_patient):
    """Test creating task when database integrity error occurs"""
    mock_get_user.return_value = mock_assignee
    
    request = CreateTaskRequest(
        task_name="New Task",
        assignee_id=mock_assignee.user_id,
        patient_id=mock_patient.id,  # Required for CGT users
        priority=TaskPriority.MEDIUM
    )
    
    # Mock patient query
    patient_query = MagicMock()
    patient_query.filter.return_value.first.return_value = mock_patient
    
    def query_side_effect(model):
        if model.__name__ == 'Patient':
            return patient_query
        return MagicMock()
    
    db_session.query.side_effect = query_side_effect
    
    # Mock db.commit to raise IntegrityError
    db_session.commit.side_effect = IntegrityError("statement", "params", "orig")
    
    with pytest.raises(TaskCreateFailedException):
        task_service.create_task(request, mock_user, db_session)
    
    db_session.rollback.assert_called_once()


@patch('app.service.task_service.get_user_by_id')
def test_create_task_general_exception(mock_get_user, db_session, mock_user, mock_assignee, mock_patient):
    """Test creating task when general exception occurs"""
    mock_get_user.return_value = mock_assignee
    
    request = CreateTaskRequest(
        task_name="New Task",
        assignee_id=mock_assignee.user_id,
        patient_id=mock_patient.id,  # Required for CGT users
        priority=TaskPriority.MEDIUM
    )
    
    # Mock patient query
    patient_query = MagicMock()
    patient_query.filter.return_value.first.return_value = mock_patient
    
    def query_side_effect(model):
        if model.__name__ == 'Patient':
            return patient_query
        return MagicMock()
    
    db_session.query.side_effect = query_side_effect
    
    # Mock db.add to raise exception
    db_session.add.side_effect = Exception("Database error")
    
    with pytest.raises(TaskCreateFailedException):
        task_service.create_task(request, mock_user, db_session)
    
    db_session.rollback.assert_called_once()


@patch('app.service.task_service.get_user_by_id')
def test_create_task_without_patient(mock_get_user, db_session, mock_user, mock_assignee):
    """Test creating task without patient_id or canister_number - should raise exception"""
    mock_get_user.return_value = mock_assignee
    
    request = CreateTaskRequest(
        task_name="New Task",
        assignee_id=mock_assignee.user_id,
        priority=TaskPriority.MEDIUM
        # No patient_id or canister_number - should fail
    )
    
    with pytest.raises(TaskInvalidPatientException) as exc_info:
        task_service.create_task(request, mock_user, db_session)
    
    # Check that the exception was raised (the message is "Invalid patient ID for task")
    # The custom message is stored in details['patient_id']
    assert exc_info.value.details.get('patient_id') is not None
    # Verify the exception message contains "patient"
    error_message = str(exc_info.value).lower()
    assert "patient" in error_message


# ==========================================
# Tests for get_all_tasks
# ==========================================

def test_get_all_tasks_success(db_session, mock_user, mock_assignee, mock_task):
    """Test getting all tasks successfully"""
    # Create another task where user is assignee
    assigned_task = Mock(spec=Tasks)
    assigned_task.id = 2
    assigned_task.task_name = "Assigned Task"
    assigned_task.description = None
    assigned_task.assignee_id = mock_user.user_id
    assigned_task.assignee = mock_user
    assigned_task.created_by_id = "OTHER-USER"
    assigned_task.created_by = Mock(spec=User)
    assigned_task.created_by.user_id = "OTHER-USER"
    assigned_task.created_by.first_name = "Other"
    assigned_task.created_by.last_name = "User"
    assigned_task.created_by.email = "other@example.com"
    assigned_task.created_by.role = "manager"
    assigned_task.updated_by_id = None
    assigned_task.patient_id = None
    assigned_task.canister_id = None  # Explicitly set to None
    assigned_task.due_date = None
    assigned_task.priority = TaskPriority.LOW
    assigned_task.status = TaskStatus.IN_PROGRESS
    assigned_task.created_at = datetime.now(timezone.utc)
    assigned_task.updated_at = datetime.now(timezone.utc)
    
    # Mock created tasks query
    created_query = MagicMock()
    created_query.filter.return_value.order_by.return_value.all.return_value = [mock_task]
    
    # Mock assigned tasks query
    assigned_query = MagicMock()
    assigned_query.filter.return_value.order_by.return_value.all.return_value = [assigned_task]
    
    # Setup query chain
    def query_side_effect(model):
        if model == Tasks:
            # First call for created tasks
            if not hasattr(query_side_effect, 'call_count'):
                query_side_effect.call_count = 0
            query_side_effect.call_count += 1
            if query_side_effect.call_count == 1:
                return created_query
            else:
                return assigned_query
        return MagicMock()
    
    db_session.query.side_effect = query_side_effect
    
    result = task_service.get_all_tasks(mock_user, db_session)
    
    assert result.total_created == 1
    assert result.total_assigned == 1
    assert len(result.created_tasks) == 1
    assert len(result.assigned_tasks) == 1
    assert result.created_tasks[0].id == mock_task.id
    assert result.assigned_tasks[0].id == assigned_task.id


def test_get_all_tasks_empty(db_session, mock_user):
    """Test getting all tasks when user has no tasks"""
    # Mock empty queries
    created_query = MagicMock()
    created_query.filter.return_value.order_by.return_value.all.return_value = []
    
    assigned_query = MagicMock()
    assigned_query.filter.return_value.order_by.return_value.all.return_value = []
    
    def query_side_effect(model):
        if model == Tasks:
            if not hasattr(query_side_effect, 'call_count'):
                query_side_effect.call_count = 0
            query_side_effect.call_count += 1
            if query_side_effect.call_count == 1:
                return created_query
            else:
                return assigned_query
        return MagicMock()
    
    db_session.query.side_effect = query_side_effect
    
    result = task_service.get_all_tasks(mock_user, db_session)
    
    assert result.total_created == 0
    assert result.total_assigned == 0
    assert len(result.created_tasks) == 0
    assert len(result.assigned_tasks) == 0


def test_get_all_tasks_excludes_self_assigned(db_session, mock_user, mock_task):
    """Test that tasks where user is both creator and assignee only appear in created_tasks"""
    # Make user both creator and assignee
    mock_task.assignee_id = mock_user.user_id
    mock_task.assignee = mock_user
    
    # Mock created tasks query
    created_query = MagicMock()
    created_query.filter.return_value.order_by.return_value.all.return_value = [mock_task]
    
    # Mock assigned tasks query (should be empty)
    assigned_query = MagicMock()
    assigned_query.filter.return_value.order_by.return_value.all.return_value = []
    
    def query_side_effect(model):
        if model == Tasks:
            if not hasattr(query_side_effect, 'call_count'):
                query_side_effect.call_count = 0
            query_side_effect.call_count += 1
            if query_side_effect.call_count == 1:
                return created_query
            else:
                return assigned_query
        return MagicMock()
    
    db_session.query.side_effect = query_side_effect
    
    result = task_service.get_all_tasks(mock_user, db_session)
    
    assert result.total_created == 1
    assert result.total_assigned == 0
    assert len(result.created_tasks) == 1
    assert len(result.assigned_tasks) == 0


def test_get_all_tasks_database_exception(db_session, mock_user):
    """Test getting all tasks when database exception occurs"""
    db_session.query.side_effect = Exception("Database error")
    
    with pytest.raises(DatabaseQueryException) as exc_info:
        task_service.get_all_tasks(mock_user, db_session)
    
    assert "list tasks" in exc_info.value.details['operation'].lower()


# ==========================================
# Tests for get_tasks_by_patient
# ==========================================

def test_get_tasks_by_patient_success(db_session, mock_user, mock_task, mock_patient):
    """Test fetching patient tasks successfully for privileged user"""
    mock_task.patient_id = mock_patient.id
    _setup_patient_task_queries(db_session, mock_patient, [mock_task], total_count=1)

    result = task_service.get_tasks_by_patient(
        patient_id=mock_patient.id,
        current_user=mock_user,
        db=db_session,
        page=1,
        page_size=10
    )

    assert result.patient_id == mock_patient.id
    assert result.total == 1
    assert len(result.tasks) == 1
    assert result.has_next is False


def test_get_tasks_by_patient_has_next(db_session, mock_user, mock_task, mock_patient):
    """Test has_next flag when more records exist"""
    mock_task.patient_id = mock_patient.id
    _setup_patient_task_queries(db_session, mock_patient, [mock_task], total_count=3)

    result = task_service.get_tasks_by_patient(
        patient_id=mock_patient.id,
        current_user=mock_user,
        db=db_session,
        page=1,
        page_size=2
    )

    assert result.has_next is True


def test_get_tasks_by_patient_non_privileged_filters(monkeypatch, db_session, mock_user, mock_task, mock_patient):
    """Ensure non-privileged users trigger additional filtering"""
    mock_user.role = "user"
    mock_task.patient_id = mock_patient.id
    _setup_patient_task_queries(db_session, mock_patient, [mock_task], total_count=1)

    or_spy = MagicMock(return_value="or_clause")
    monkeypatch.setattr(task_service, "or_", or_spy)

    task_service.get_tasks_by_patient(
        patient_id=mock_patient.id,
        current_user=mock_user,
        db=db_session
    )

    or_spy.assert_called_once()


def test_get_tasks_by_patient_invalid_patient(db_session, mock_user):
    """Test fetching patient tasks when patient does not exist"""
    patient_query = MagicMock()
    patient_query.filter.return_value = patient_query
    patient_query.first.return_value = None

    def query_side_effect(model):
        if model == Patient:
            return patient_query
        return MagicMock()

    db_session.query.side_effect = query_side_effect

    with pytest.raises(TaskInvalidPatientException):
        task_service.get_tasks_by_patient(
            patient_id="PT-404",
            current_user=mock_user,
            db=db_session
        )


def test_get_tasks_by_patient_database_exception(db_session, mock_user, mock_patient):
    """Test fetching patient tasks when database error occurs"""
    patient_query = MagicMock()
    patient_query.filter.return_value = patient_query
    patient_query.first.return_value = mock_patient

    def query_side_effect(model):
        if model == Patient:
            return patient_query
        if model == Tasks:
            raise Exception("Database error")
        return MagicMock()

    db_session.query.side_effect = query_side_effect

    with pytest.raises(DatabaseQueryException):
        task_service.get_tasks_by_patient(
            patient_id=mock_patient.id,
            current_user=mock_user,
            db=db_session
        )


# ==========================================
# Tests for get_task_by_id
# ==========================================

def test_get_task_by_id_success(db_session, mock_user, mock_task):
    """Test getting task by ID successfully"""
    db_session.query.return_value.filter.return_value.first.return_value = mock_task
    
    result = task_service.get_task_by_id(1, mock_user, db_session)
    
    assert result.id == mock_task.id
    assert result.task_name == mock_task.task_name


def test_get_task_by_id_not_found(db_session, mock_user):
    """Test getting task by ID when task doesn't exist"""
    db_session.query.return_value.filter.return_value.first.return_value = None
    
    with pytest.raises(TaskNotFoundException) as exc_info:
        task_service.get_task_by_id(999, mock_user, db_session)
    
    assert exc_info.value.details['task_id'] == 999


def test_get_task_by_id_unauthorized(db_session, mock_user, mock_task):
    """Test getting task by ID when user is neither creator nor assignee"""
    # Make user neither creator nor assignee
    mock_task.created_by_id = "OTHER-USER"
    mock_task.assignee_id = "ANOTHER-USER"
    
    db_session.query.return_value.filter.return_value.first.return_value = mock_task
    
    with pytest.raises(TaskNotFoundException) as exc_info:
        task_service.get_task_by_id(1, mock_user, db_session)
    
    assert exc_info.value.details['task_id'] == 1


def test_get_task_by_id_as_assignee(db_session, mock_user, mock_task):
    """Test getting task by ID when user is assignee"""
    # Make user the assignee
    mock_task.assignee_id = mock_user.user_id
    mock_task.assignee = mock_user
    mock_task.created_by_id = "OTHER-USER"
    
    db_session.query.return_value.filter.return_value.first.return_value = mock_task
    
    result = task_service.get_task_by_id(1, mock_user, db_session)
    
    assert result.id == mock_task.id


def test_get_task_by_id_database_exception(db_session, mock_user):
    """Test getting task by ID when database exception occurs"""
    db_session.query.side_effect = Exception("Database error")
    
    with pytest.raises(DatabaseQueryException) as exc_info:
        task_service.get_task_by_id(1, mock_user, db_session)
    
    assert "get task" in exc_info.value.details['operation'].lower()


# ==========================================
# Tests for update_task
# ==========================================

@patch('app.service.task_service.get_user_by_id')
def test_update_task_success(mock_get_user, db_session, mock_user, mock_task, mock_assignee):
    """Test updating a task successfully"""
    db_session.query.return_value.filter.return_value.first.return_value = mock_task
    
    request = UpdateTaskRequest(
        task_name="Updated Task",
        description="Updated Description",
        priority=TaskPriority.HIGH
    )
    
    result = task_service.update_task(1, request, mock_user, db_session)
    
    assert result.message is not None
    assert result.task.task_name == "Updated Task"
    assert result.task.description == "Updated Description"
    assert result.task.priority == TaskPriority.HIGH
    db_session.commit.assert_called_once()
    db_session.refresh.assert_called_once()


@patch('app.service.task_service.get_user_by_id')
def test_update_task_not_found(mock_get_user, db_session, mock_user):
    """Test updating task when task doesn't exist"""
    db_session.query.return_value.filter.return_value.first.return_value = None
    
    request = UpdateTaskRequest(task_name="Updated Task")
    
    with pytest.raises(TaskNotFoundException):
        task_service.update_task(999, request, mock_user, db_session)
    
    db_session.rollback.assert_called_once()


@patch('app.service.task_service.get_user_by_id')
def test_update_task_unauthorized(mock_get_user, db_session, mock_user, mock_task):
    """Test updating task when user is not the creator"""
    mock_task.created_by_id = "OTHER-USER"
    db_session.query.return_value.filter.return_value.first.return_value = mock_task
    
    request = UpdateTaskRequest(task_name="Updated Task")
    
    with pytest.raises(TaskUnauthorizedEditException) as exc_info:
        task_service.update_task(1, request, mock_user, db_session)
    
    assert exc_info.value.details['task_id'] == 1
    assert exc_info.value.details['user_id'] == mock_user.user_id
    db_session.rollback.assert_called_once()


@patch('app.service.task_service.get_user_by_id')
def test_update_task_with_new_assignee(mock_get_user, db_session, mock_user, mock_task, mock_assignee):
    """Test updating task with new assignee"""
    db_session.query.return_value.filter.return_value.first.return_value = mock_task
    mock_get_user.return_value = mock_assignee
    
    request = UpdateTaskRequest(assignee_id=mock_assignee.user_id)
    
    result = task_service.update_task(1, request, mock_user, db_session)
    
    assert result.task.assignee.user_id == mock_assignee.user_id
    db_session.commit.assert_called_once()


@patch('app.service.task_service.get_user_by_id')
def test_update_task_invalid_new_assignee(mock_get_user, db_session, mock_user, mock_task):
    """Test updating task with invalid new assignee"""
    db_session.query.return_value.filter.return_value.first.return_value = mock_task
    mock_get_user.return_value = None
    
    request = UpdateTaskRequest(assignee_id="INVALID-USER")
    
    with pytest.raises(TaskInvalidAssigneeException):
        task_service.update_task(1, request, mock_user, db_session)
    
    db_session.rollback.assert_called_once()


@patch('app.service.task_service.get_user_by_id')
def test_update_task_with_new_patient(mock_get_user, db_session, mock_user, mock_task, mock_patient):
    """Test updating task with new patient"""
    db_session.query.return_value.filter.return_value.first.return_value = mock_task
    
    # Mock patient query
    patient_query = MagicMock()
    patient_query.filter.return_value.first.return_value = mock_patient
    
    def query_side_effect(model):
        if model == Tasks:
            return db_session.query.return_value
        elif model == Patient:
            return patient_query
        return MagicMock()
    
    db_session.query.side_effect = query_side_effect
    
    request = UpdateTaskRequest(patient_id=mock_patient.id)
    
    result = task_service.update_task(1, request, mock_user, db_session)
    
    assert result.task.patient_id == mock_patient.id
    db_session.commit.assert_called_once()


@patch('app.service.task_service.get_user_by_id')
def test_update_task_invalid_patient(mock_get_user, db_session, mock_user, mock_task):
    """Test updating task with invalid patient"""
    db_session.query.return_value.filter.return_value.first.return_value = mock_task
    
    # Mock patient query to return None
    patient_query = MagicMock()
    patient_query.filter.return_value.first.return_value = None
    
    def query_side_effect(model):
        if model == Tasks:
            return db_session.query.return_value
        elif model == Patient:
            return patient_query
        return MagicMock()
    
    db_session.query.side_effect = query_side_effect
    
    request = UpdateTaskRequest(patient_id="INVALID-PATIENT")
    
    with pytest.raises(TaskInvalidPatientException):
        task_service.update_task(1, request, mock_user, db_session)
    
    db_session.rollback.assert_called_once()


@patch('app.service.task_service.get_user_by_id')
def test_update_task_partial_update(mock_get_user, db_session, mock_user, mock_task):
    """Test updating task with only some fields"""
    db_session.query.return_value.filter.return_value.first.return_value = mock_task
    
    request = UpdateTaskRequest(
        task_name="Updated Name",
        # Other fields are None, should not be updated
    )
    
    result = task_service.update_task(1, request, mock_user, db_session)
    
    assert result.task.task_name == "Updated Name"
    # Original values should be preserved for fields not updated
    db_session.commit.assert_called_once()


@patch('app.service.task_service.get_user_by_id')
def test_update_task_general_exception(mock_get_user, db_session, mock_user, mock_task):
    """Test updating task when general exception occurs"""
    db_session.query.return_value.filter.return_value.first.return_value = mock_task
    db_session.commit.side_effect = Exception("Database error")
    
    request = UpdateTaskRequest(task_name="Updated Task")
    
    with pytest.raises(TaskUpdateFailedException) as exc_info:
        task_service.update_task(1, request, mock_user, db_session)
    
    assert exc_info.value.details['task_id'] == 1
    db_session.rollback.assert_called_once()


# ==========================================
# Tests for update_task_status
# ==========================================

def test_update_task_status_success(db_session, mock_user, mock_task):
    """Test updating task status successfully"""
    # Make user the assignee
    mock_task.assignee_id = mock_user.user_id
    mock_task.assignee = mock_user
    
    db_session.query.return_value.filter.return_value.first.return_value = mock_task
    
    request = UpdateTaskStatusRequest(status=TaskStatus.DONE)
    
    result = task_service.update_task_status(1, request, mock_user, db_session)
    
    assert result.message is not None
    assert result.task.status == TaskStatus.DONE
    db_session.commit.assert_called_once()
    db_session.refresh.assert_called_once()


def test_update_task_status_not_found(db_session, mock_user):
    """Test updating task status when task doesn't exist"""
    db_session.query.return_value.filter.return_value.first.return_value = None
    
    request = UpdateTaskStatusRequest(status=TaskStatus.DONE)
    
    with pytest.raises(TaskNotFoundException):
        task_service.update_task_status(999, request, mock_user, db_session)
    
    db_session.rollback.assert_called_once()


def test_update_task_status_unauthorized(db_session, mock_user, mock_task):
    """Test updating task status when user is not the assignee"""
    # User is creator but not assignee
    mock_task.created_by_id = mock_user.user_id
    mock_task.assignee_id = "OTHER-USER"
    
    db_session.query.return_value.filter.return_value.first.return_value = mock_task
    
    request = UpdateTaskStatusRequest(status=TaskStatus.DONE)
    
    with pytest.raises(TaskUnauthorizedStatusException) as exc_info:
        task_service.update_task_status(1, request, mock_user, db_session)
    
    assert exc_info.value.details['task_id'] == 1
    assert exc_info.value.details['user_id'] == mock_user.user_id
    db_session.rollback.assert_called_once()


def test_update_task_status_general_exception(db_session, mock_user, mock_task):
    """Test updating task status when general exception occurs"""
    # Make user the assignee
    mock_task.assignee_id = mock_user.user_id
    mock_task.assignee = mock_user
    
    db_session.query.return_value.filter.return_value.first.return_value = mock_task
    db_session.commit.side_effect = Exception("Database error")
    
    request = UpdateTaskStatusRequest(status=TaskStatus.DONE)
    
    with pytest.raises(TaskUpdateFailedException) as exc_info:
        task_service.update_task_status(1, request, mock_user, db_session)
    
    assert exc_info.value.details['task_id'] == 1
    db_session.rollback.assert_called_once()


# ==========================================
# Tests for delete_task
# ==========================================

def test_delete_task_success(db_session, mock_user, mock_task):
    """Test deleting a task successfully"""
    db_session.query.return_value.filter.return_value.first.return_value = mock_task
    
    result = task_service.delete_task(1, mock_user, db_session)
    
    assert result.message is not None
    assert result.task_id == 1
    db_session.delete.assert_called_once_with(mock_task)
    db_session.commit.assert_called_once()


def test_delete_task_not_found(db_session, mock_user):
    """Test deleting task when task doesn't exist"""
    db_session.query.return_value.filter.return_value.first.return_value = None
    
    with pytest.raises(TaskNotFoundException):
        task_service.delete_task(999, mock_user, db_session)
    
    db_session.rollback.assert_called_once()


def test_delete_task_unauthorized(db_session, mock_user, mock_task):
    """Test deleting task when user is not the creator"""
    mock_task.created_by_id = "OTHER-USER"
    db_session.query.return_value.filter.return_value.first.return_value = mock_task
    
    with pytest.raises(TaskUnauthorizedEditException) as exc_info:
        task_service.delete_task(1, mock_user, db_session)
    
    assert exc_info.value.details['task_id'] == 1
    assert exc_info.value.details['user_id'] == mock_user.user_id
    db_session.rollback.assert_called_once()


def test_delete_task_general_exception(db_session, mock_user, mock_task):
    """Test deleting task when general exception occurs"""
    db_session.query.return_value.filter.return_value.first.return_value = mock_task
    db_session.delete.side_effect = Exception("Database error")
    
    with pytest.raises(TaskDeleteFailedException) as exc_info:
        task_service.delete_task(1, mock_user, db_session)
    
    assert exc_info.value.details['task_id'] == 1
    db_session.rollback.assert_called_once()

