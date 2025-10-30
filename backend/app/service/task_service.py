from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.constants.enums import TaskStatus
from app.constants.messages import ErrorMessages, SuccessMessages
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
from app.models.patient_model import Patient
from app.models.task_model import Tasks
from app.models.user_model import User
from app.schemas.task_schema import (
    CreateTaskRequest,
    UpdateTaskRequest,
    UpdateTaskStatusRequest,
    TaskResponse,
    TaskListResponse,
    CreateTaskResponse,
    UpdateTaskResponse,
    UpdateTaskStatusResponse,
    DeleteTaskResponse,
    TaskAssigneeInfo,
    TaskCreatorInfo,
    TaskPermissions
)
from app.utils.utils import get_user_by_id


def _build_task_response(task: Tasks, current_user: User) -> TaskResponse:
    """
    Build a TaskResponse from a Tasks model instance.
    Includes permission flags for frontend.
    
    Args:
        task: Tasks model instance
        current_user: Current authenticated user
        
    Returns:
        TaskResponse with all task details and permissions
    """
    # Build assignee info
    assignee_info = TaskAssigneeInfo(
        user_id=task.assignee.user_id,
        first_name=task.assignee.first_name,
        last_name=task.assignee.last_name,
        email=task.assignee.email,
        role=task.assignee.role
    )
    
    # Build creator info
    creator_info = TaskCreatorInfo(
        user_id=task.created_by.user_id,
        first_name=task.created_by.first_name,
        last_name=task.created_by.last_name,
        email=task.created_by.email,
        role=task.created_by.role
    )
    
    # Calculate permissions
    can_edit_all = (task.created_by_id == current_user.user_id)
    can_edit_status_only = (task.assignee_id == current_user.user_id)
    
    permissions = TaskPermissions(
        can_edit_all=can_edit_all,
        can_edit_status_only=can_edit_status_only
    )
    
    return TaskResponse(
        id=task.id,
        task_name=task.task_name,
        description=task.description,
        assignee=assignee_info,
        created_by=creator_info,
        patient_id=task.patient_id,
        due_date=task.due_date,
        priority=task.priority,
        status=task.status,
        created_at=task.created_at,
        updated_at=task.updated_at,
        permissions=permissions
    )


def create_task(
    request: CreateTaskRequest,
    current_user: User,
    db: Session
) -> CreateTaskResponse:
    """
    Create a new task. Only managers can create tasks.
    
    Args:
        request: CreateTaskRequest with task details
        current_user: Current authenticated user (must be manager)
        db: Database session
        
    Returns:
        CreateTaskResponse with created task details
        
    Raises:
        TaskManagerOnlyException: If user is not a manager
        TaskInvalidAssigneeException: If assignee not found or invalid
        TaskInvalidPatientException: If patient not found (when patient_id provided)
        TaskCreateFailedException: If task creation fails
    """
    try:
        # Check if user is manager
        if current_user.role != "manager":
            raise TaskManagerOnlyException(user_role=current_user.role)
        
        # Validate assignee exists and is from same company
        assignee = get_user_by_id(request.assignee_id, db)
        if not assignee or \
           assignee.pharma_id != current_user.pharma_id or \
           assignee.approved_status != 'approved' or \
           not assignee.status:
            raise TaskInvalidAssigneeException(user_id=request.assignee_id)
        
        # Validate patient exists (if provided)
        if request.patient_id:
            patient = db.query(Patient).filter(Patient.id == request.patient_id).first()
            if not patient:
                raise TaskInvalidPatientException(patient_id=request.patient_id)
        
        # Create task
        task = Tasks(
            task_name=request.task_name,
            description=request.description,
            assignee_id=request.assignee_id,
            created_by_id=current_user.user_id,
            updated_by_id=current_user.user_id,
            patient_id=request.patient_id,
            due_date=request.due_date,
            priority=request.priority,
            status=request.status or TaskStatus.NOT_STARTED,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )
        
        db.add(task)
        db.commit()
        db.refresh(task)
        
        # Build response
        task_response = _build_task_response(task, current_user)
        
        return CreateTaskResponse(
            message=SuccessMessages.TASK_CREATED,
            task=task_response
        )
        
    except (TaskManagerOnlyException, TaskInvalidAssigneeException, TaskInvalidPatientException):
        db.rollback()
        raise
    except IntegrityError as e:
        db.rollback()
        raise TaskCreateFailedException(reason=f"Database integrity error: {str(e)}")
    except Exception as e:
        db.rollback()
        raise TaskCreateFailedException(reason=str(e))


def get_all_tasks(current_user: User, db: Session) -> TaskListResponse:
    """
    Get all tasks for current user based on their role:
    - Manager: Tasks they created OR tasks assigned to them
    - User: Only tasks assigned to them
    
    Multi-tenant filtering: Users can only see tasks from their own company.
    
    Args:
        current_user: Current authenticated user
        db: Database session
        
    Returns:
        TaskListResponse with filtered tasks
    """
    try:
        if current_user.role == "manager":
            # Managers see tasks they created OR tasks assigned to them
            tasks = db.query(Tasks).filter(
                or_(
                    Tasks.created_by_id == current_user.user_id,
                    Tasks.assignee_id == current_user.user_id
                )
            ).order_by(Tasks.created_at.desc()).all()
        else:
            # Regular users only see tasks assigned to them
            tasks = db.query(Tasks).filter(
                Tasks.assignee_id == current_user.user_id
            ).order_by(Tasks.created_at.desc()).all()
        
        # Build response with permissions
        task_responses = [_build_task_response(task, current_user) for task in tasks]
        
        return TaskListResponse(
            total_tasks=len(task_responses),
            tasks=task_responses
        )
        
    except Exception as e:
        raise DatabaseQueryException(operation="list tasks", reason=str(e))


def get_task_by_id(task_id: int, current_user: User, db: Session) -> TaskResponse:
    """
    Get a specific task by ID.
    User can only view tasks they created or are assigned to.
    
    Args:
        task_id: Task ID to retrieve
        current_user: Current authenticated user
        db: Database session
        
    Returns:
        TaskResponse with task details
        
    Raises:
        TaskNotFoundException: If task not found or user has no access
    """
    try:
        # Query task
        task = db.query(Tasks).filter(Tasks.id == task_id).first()
        
        if not task:
            raise TaskNotFoundException(task_id=task_id)
        
        # Check access: user must be creator or assignee
        if task.created_by_id != current_user.user_id and task.assignee_id != current_user.user_id:
            raise TaskNotFoundException(task_id=task_id)  # Return 404 to avoid info leak
        
        # Build and return response
        return _build_task_response(task, current_user)
        
    except TaskNotFoundException:
        raise
    except Exception as e:
        raise DatabaseQueryException(operation="get task", reason=str(e))


def update_task(
    task_id: int,
    request: UpdateTaskRequest,
    current_user: User,
    db: Session
) -> UpdateTaskResponse:
    """
    Update a task (full update). Only the manager who created the task can do this.
    
    Args:
        task_id: Task ID to update
        request: UpdateTaskRequest with fields to update
        current_user: Current authenticated user
        db: Database session
        
    Returns:
        UpdateTaskResponse with updated task details
        
    Raises:
        TaskNotFoundException: If task not found
        TaskUnauthorizedEditException: If user is not the creator
        TaskInvalidAssigneeException: If new assignee is invalid
        TaskInvalidPatientException: If new patient is invalid
        TaskUpdateFailedException: If update fails
    """
    try:
        # Query task
        task = db.query(Tasks).filter(Tasks.id == task_id).first()
        
        if not task:
            raise TaskNotFoundException(task_id=task_id)
        
        # Check authorization: only creator can edit
        if task.created_by_id != current_user.user_id:
            raise TaskUnauthorizedEditException(task_id=task_id, user_id=current_user.user_id)
        
        # Validate new assignee (if provided)
        if request.assignee_id:
            assignee = get_user_by_id(request.assignee_id, db)
            if not assignee or \
               assignee.pharma_id != current_user.pharma_id or \
               assignee.approved_status != 'approved' or \
               not assignee.status:
                raise TaskInvalidAssigneeException(user_id=request.assignee_id)
            task.assignee_id = request.assignee_id
        
        # Validate new patient (if provided)
        if request.patient_id:
            patient = db.query(Patient).filter(Patient.id == request.patient_id).first()
            if not patient:
                raise TaskInvalidPatientException(patient_id=request.patient_id)
            task.patient_id = request.patient_id
        
        # Update fields (only if provided)
        if request.task_name is not None:
            task.task_name = request.task_name
        if request.description is not None:
            task.description = request.description
        if request.due_date is not None:
            task.due_date = request.due_date
        if request.priority is not None:
            task.priority = request.priority
        if request.status is not None:
            task.status = request.status
        
        # Update metadata
        task.updated_by_id = current_user.user_id
        task.updated_at = datetime.now(timezone.utc)
        
        db.commit()
        db.refresh(task)
        
        # Build response
        task_response = _build_task_response(task, current_user)
        
        return UpdateTaskResponse(
            message=SuccessMessages.TASK_UPDATED,
            task=task_response
        )
        
    except (TaskNotFoundException, TaskUnauthorizedEditException, TaskInvalidAssigneeException, TaskInvalidPatientException):
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise TaskUpdateFailedException(task_id=task_id, reason=str(e))


def update_task_status(
    task_id: int,
    request: UpdateTaskStatusRequest,
    current_user: User,
    db: Session
) -> UpdateTaskStatusResponse:
    """
    Update only the task status. Only the assignee can do this.
    
    Args:
        task_id: Task ID to update
        request: UpdateTaskStatusRequest with new status
        current_user: Current authenticated user
        db: Database session
        
    Returns:
        UpdateTaskStatusResponse with updated task details
        
    Raises:
        TaskNotFoundException: If task not found
        TaskUnauthorizedStatusException: If user is not the assignee
        TaskUpdateFailedException: If update fails
    """
    try:
        # Query task
        task = db.query(Tasks).filter(Tasks.id == task_id).first()
        
        if not task:
            raise TaskNotFoundException(task_id=task_id)
        
        # Check authorization: only assignee can change status
        if task.assignee_id != current_user.user_id:
            raise TaskUnauthorizedStatusException(task_id=task_id, user_id=current_user.user_id)
        
        # Update status
        task.status = request.status
        task.updated_by_id = current_user.user_id
        task.updated_at = datetime.now(timezone.utc)
        
        db.commit()
        db.refresh(task)
        
        # Build response
        task_response = _build_task_response(task, current_user)
        
        return UpdateTaskStatusResponse(
            message=SuccessMessages.TASK_STATUS_UPDATED,
            task=task_response
        )
        
    except (TaskNotFoundException, TaskUnauthorizedStatusException):
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise TaskUpdateFailedException(task_id=task_id, reason=str(e))


def delete_task(task_id: int, current_user: User, db: Session) -> DeleteTaskResponse:
    """
    Delete a task. Only the manager who created the task can do this.
    
    Args:
        task_id: Task ID to delete
        current_user: Current authenticated user
        db: Database session
        
    Returns:
        DeleteTaskResponse confirming deletion
        
    Raises:
        TaskNotFoundException: If task not found
        TaskUnauthorizedEditException: If user is not the creator
        TaskDeleteFailedException: If deletion fails
    """
    try:
        # Query task
        task = db.query(Tasks).filter(Tasks.id == task_id).first()
        
        if not task:
            raise TaskNotFoundException(task_id=task_id)
        
        # Check authorization: only creator can delete
        if task.created_by_id != current_user.user_id:
            raise TaskUnauthorizedEditException(task_id=task_id, user_id=current_user.user_id)
        
        # Delete task
        db.delete(task)
        db.commit()
        
        return DeleteTaskResponse(
            message=SuccessMessages.TASK_DELETED,
            task_id=task_id
        )
        
    except (TaskNotFoundException, TaskUnauthorizedEditException):
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise TaskDeleteFailedException(task_id=task_id, reason=str(e))

