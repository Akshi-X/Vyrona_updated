from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import or_, and_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.constants.app_constants import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE
from app.constants.enums import TaskStatus, TaskPriority
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
from app.models.IVF.tank_model import Tank
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
    TaskPermissions,
    PatientTaskListResponse
)
from app.utils.utils import get_user_by_id, normalize_role_to_title_case
from app.utils.user_helpers import is_hospital_department


def _resolve_tank_code_to_id(tank_code: str, db: Session) -> int:
    """
    Resolve tank_code (string) to tank_id (int) for internal database operations.
    
    Args:
        tank_code: Tank code (e.g., "T1")
        db: Database session
        
    Returns:
        tank_id (int)
        
    Raises:
        TaskInvalidPatientException: If tank not found
    """
    tank = db.query(Tank).filter(Tank.tank_code == tank_code).first()
    if not tank:
        raise TaskInvalidPatientException(patient_id=f"Tank with code '{tank_code}' not found")
    return tank.tank_id


def _build_task_response(task: Tasks, current_user: User, db: Session) -> TaskResponse:
    """
    Build a TaskResponse from a Tasks model instance.
    Includes permission flags for frontend.
    
    Args:
        task: Tasks model instance
        current_user: Current authenticated user
        db: Database session (needed to fetch canister_number)
        
    Returns:
        TaskResponse with all task details and permissions
    """
    # Build assignee info
    assignee_info = TaskAssigneeInfo(
        user_id=task.assignee.user_id,
        first_name=task.assignee.first_name,
        last_name=task.assignee.last_name,
        email=task.assignee.email,
        role=normalize_role_to_title_case(task.assignee.role)
    )
    
    # Build creator info
    creator_info = TaskCreatorInfo(
        user_id=task.created_by.user_id,
        first_name=task.created_by.first_name,
        last_name=task.created_by.last_name,
        email=task.created_by.email,
        role=normalize_role_to_title_case(task.created_by.role)
    )
    
    # Calculate permissions
    can_edit_all = (task.created_by_id == current_user.user_id)
    can_edit_status_only = (task.assignee_id == current_user.user_id)
    
    permissions = TaskPermissions(
        can_edit_all=can_edit_all,
        can_edit_status_only=can_edit_status_only
    )
    
    # Get tank_code if tank_id exists (backward compatibility: map to canister_number)
    tank_code = None
    if task.tank_id:
        tank = db.query(Tank).filter(Tank.tank_id == task.tank_id).first()
        if tank:
            tank_code = tank.tank_code
    
    return TaskResponse(
        id=task.id,
        task_name=task.task_name,
        description=task.description,
        assignee=assignee_info,
        created_by=creator_info,
        patient_id=task.patient_id,
        tank_code=tank_code,
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
    Create a new task.
    
    For CGT (pharma users): Only managers and pharma_admins can create tasks.
    For IVF (hospital users): Users and managers can create tasks.
    
    Args:
        request: CreateTaskRequest with task details
        current_user: Current authenticated user
        db: Database session
        
    Returns:
        CreateTaskResponse with created task details
        
    Raises:
        TaskManagerOnlyException: If user is not authorized (CGT: not manager/pharma_admin)
        TaskInvalidAssigneeException: If assignee not found or invalid
        TaskInvalidPatientException: If patient not found (when patient_id provided)
        TaskCreateFailedException: If task creation fails
    """
    try:
        # Determine if user is hospital user (IVF) or pharma user (CGT)
        is_hospital_user = is_hospital_department(current_user.department) if current_user.department else False
        
        # Get role as string (handle enum)
        user_role_str = current_user.role.value if hasattr(current_user.role, 'value') else str(current_user.role)
        user_role_lower = user_role_str.lower()
        
        # Permission check: Different rules for CGT vs IVF
        if is_hospital_user:
            # IVF (hospital users): Users and managers can create tasks
            if user_role_lower not in ("user", "manager", "admin"):
                raise TaskManagerOnlyException(user_role=user_role_str)
        else:
            # CGT (pharma users): Only managers and pharma_admins can create tasks
            if user_role_lower not in ("manager", "pharma_admin"):
                raise TaskManagerOnlyException(user_role=user_role_str)
        
        # Validate assignee exists and is from same company/hospital
        assignee = get_user_by_id(request.assignee_id, db)
        if not assignee or assignee.approved_status != 'approved' or not assignee.status:
            raise TaskInvalidAssigneeException(user_id=request.assignee_id)
        
        # Validate assignee is in same company/hospital
        if is_hospital_user:
            # IVF: Validate by hospital_id
            if not assignee.hospital_id or assignee.hospital_id != current_user.hospital_id:
                raise TaskInvalidAssigneeException(user_id=request.assignee_id)
            
            # IVF: User cannot assign tasks to manager
            assignee_role_str = assignee.role.value if hasattr(assignee.role, 'value') else str(assignee.role)
            if user_role_lower == "user" and assignee_role_str.lower() == "manager":
                raise TaskInvalidAssigneeException(user_id=request.assignee_id)
        else:
            # CGT: Validate by pharma_id
            if not assignee.pharma_id or assignee.pharma_id != current_user.pharma_id:
                raise TaskInvalidAssigneeException(user_id=request.assignee_id)
        
        # Validate that only one is provided (not both)
        if request.patient_id and request.canister_number:
            raise TaskInvalidPatientException(patient_id="Cannot provide both patient_id and canister_number. Use patient_id for CGT or canister_number for IVF")
        
        # Ensure at least one is provided (patient_id for CGT or canister_number for IVF)
        if not request.patient_id and not request.canister_number:
            raise TaskInvalidPatientException(patient_id="Either patient_id (CGT) or canister_number (IVF) must be provided")
        
        # Validate patient exists (if provided for CGT flow)
        if request.patient_id:
            patient = db.query(Patient).filter(Patient.id == request.patient_id).first()
            if not patient:
                raise TaskInvalidPatientException(patient_id=request.patient_id)
        
        # Resolve tank_code to tank_id if provided (for IVF flow)
        tank_id = None
        if request.tank_code:
            tank_id = _resolve_tank_code_to_id(request.tank_code, db)
        
        # Create task
        task = Tasks(
            task_name=request.task_name,
            description=request.description,
            assignee_id=request.assignee_id,
            created_by_id=current_user.user_id,
            updated_by_id=current_user.user_id,
            patient_id=request.patient_id,
            tank_id=tank_id,
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
        task_response = _build_task_response(task, current_user, db)
        
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
    Get tasks for current user split into two lists:
    - created_tasks: Tasks created by the user (editable via PUT)
    - assigned_tasks: Tasks assigned to the user (status editable via PATCH)
    
    Multi-tenant filtering: Users can only see tasks from their own company.
    
    Args:
        current_user: Current authenticated user
        db: Database session
        
    Returns:
        TaskListResponse with filtered tasks
    """
    try:
        # Always compute split lists for all roles
        created = db.query(Tasks).filter(
            Tasks.created_by_id == current_user.user_id
        ).order_by(Tasks.created_at.desc()).all()

        # Get assigned tasks, but exclude tasks where user is both creator and assignee
        # (those should only appear in created_tasks)
        assigned = db.query(Tasks).filter(
            and_(
                Tasks.assignee_id == current_user.user_id,
                Tasks.created_by_id != current_user.user_id
            )
        ).order_by(Tasks.created_at.desc()).all()

        created_responses = [_build_task_response(task, current_user, db) for task in created]
        assigned_responses = [_build_task_response(task, current_user, db) for task in assigned]

        return TaskListResponse(
            total_created=len(created_responses),
            total_assigned=len(assigned_responses),
            created_tasks=created_responses,
            assigned_tasks=assigned_responses
        )
        
    except Exception as e:
        raise DatabaseQueryException(operation="list tasks", reason=str(e))


def get_tasks_by_patient(
    patient_id: str,
    current_user: User,
    db: Session,
    *,
    status: Optional[TaskStatus] = None,
    priority: Optional[TaskPriority] = None,
    page: int = 1,
    page_size: int = DEFAULT_PAGE_SIZE
) -> PatientTaskListResponse:
    """
    Retrieve tasks associated with a specific patient with pagination/filtering.

    Managers and pharma admins in the same pharma can see all patient tasks.
    Other roles are limited to tasks they created or are assigned to.
    """
    try:
        if not patient_id:
            raise TaskInvalidPatientException(patient_id=patient_id)

        patient_query = db.query(Patient).filter(Patient.id == patient_id)
        if current_user.pharma_id is not None:
            patient_query = patient_query.filter(Patient.pharma_id == current_user.pharma_id)

        patient = patient_query.first()
        if not patient:
            raise TaskInvalidPatientException(patient_id=patient_id)

        sanitized_page = max(page, 1)
        sanitized_page_size = max(1, min(page_size, MAX_PAGE_SIZE))

        query = (
            db.query(Tasks)
            .options(
                selectinload(Tasks.assignee),
                selectinload(Tasks.created_by)
            )
            .filter(Tasks.patient_id == patient_id)
        )

        privileged_roles = {"manager", "pharma_admin", "admin", "mygrape_admin"}
        if current_user.role.lower() not in privileged_roles:
            query = query.filter(
                or_(
                    Tasks.created_by_id == current_user.user_id,
                    Tasks.assignee_id == current_user.user_id
                )
            )

        if status:
            query = query.filter(Tasks.status == status)
        if priority:
            query = query.filter(Tasks.priority == priority)

        total = query.count()

        tasks = (
            query.order_by(Tasks.created_at.desc())
            .offset((sanitized_page - 1) * sanitized_page_size)
            .limit(sanitized_page_size)
            .all()
        )

        task_responses = [_build_task_response(task, current_user, db) for task in tasks]

        return PatientTaskListResponse(
            message=SuccessMessages.TASKS_RETRIEVED,
            patient_id=patient_id,
            canister_number=None,
            total=total,
            page=sanitized_page,
            page_size=sanitized_page_size,
            has_next=((sanitized_page - 1) * sanitized_page_size + len(task_responses)) < total,
            tasks=task_responses
        )

    except TaskInvalidPatientException:
        raise
    except Exception as e:
        raise DatabaseQueryException(operation="get patient tasks", reason=str(e))


def get_tasks_by_canister(
    tank_code: str,
    current_user: User,
    db: Session,
    *,
    status: Optional[TaskStatus] = None,
    priority: Optional[TaskPriority] = None,
    page: int = 1,
    page_size: int = DEFAULT_PAGE_SIZE
) -> PatientTaskListResponse:
    """
    Retrieve tasks associated with a specific tank with pagination/filtering (IVF flow).

    Managers and pharma admins in the same pharma can see all tank tasks.
    Other roles are limited to tasks they created or are assigned to.
    """
    try:
        if not tank_code:
            raise TaskInvalidPatientException(patient_id=f"Invalid tank_code: {tank_code}")

        # Resolve tank_code to tank_id
        tank_id = _resolve_tank_code_to_id(tank_code, db)
        tank = db.query(Tank).filter(Tank.tank_id == tank_id).first()
        if not tank:
            raise TaskInvalidPatientException(patient_id=f"Tank {tank_code} not found")

        sanitized_page = max(page, 1)
        sanitized_page_size = max(1, min(page_size, MAX_PAGE_SIZE))

        query = (
            db.query(Tasks)
            .options(
                selectinload(Tasks.assignee),
                selectinload(Tasks.created_by)
            )
            .filter(Tasks.tank_id == tank_id)
        )

        privileged_roles = {"manager", "pharma_admin", "admin", "mygrape_admin"}
        if current_user.role.lower() not in privileged_roles:
            query = query.filter(
                or_(
                    Tasks.created_by_id == current_user.user_id,
                    Tasks.assignee_id == current_user.user_id
                )
            )

        if status:
            query = query.filter(Tasks.status == status)
        if priority:
            query = query.filter(Tasks.priority == priority)

        total = query.count()

        tasks = (
            query.order_by(Tasks.created_at.desc())
            .offset((sanitized_page - 1) * sanitized_page_size)
            .limit(sanitized_page_size)
            .all()
        )

        task_responses = [_build_task_response(task, current_user, db) for task in tasks]

        return PatientTaskListResponse(
            message=SuccessMessages.TASKS_RETRIEVED,
            patient_id=None,
            tank_code=tank_code,
            total=total,
            page=sanitized_page,
            page_size=sanitized_page_size,
            has_next=((sanitized_page - 1) * sanitized_page_size + len(task_responses)) < total,
            tasks=task_responses
        )

    except TaskInvalidPatientException:
        raise
    except Exception as e:
        raise DatabaseQueryException(operation="get canister tasks", reason=str(e))


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
        return _build_task_response(task, current_user, db)
        
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
    Update a task (full update). Only the manager or pharma_admin who created the task can do this.
    
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
            if not assignee or assignee.approved_status != 'approved' or not assignee.status:
                raise TaskInvalidAssigneeException(user_id=request.assignee_id)
            
            # Determine if user is hospital user (IVF) or pharma user (CGT)
            is_hospital_user = is_hospital_department(current_user.department) if current_user.department else False
            
            # Get roles as strings (handle enum)
            current_user_role_str = current_user.role.value if hasattr(current_user.role, 'value') else str(current_user.role)
            current_user_role_lower = current_user_role_str.lower()
            assignee_role_str = assignee.role.value if hasattr(assignee.role, 'value') else str(assignee.role)
            assignee_role_lower = assignee_role_str.lower()
            
            # Validate assignee is in same company/hospital
            if is_hospital_user:
                # IVF: Validate by hospital_id
                if not assignee.hospital_id or assignee.hospital_id != current_user.hospital_id:
                    raise TaskInvalidAssigneeException(user_id=request.assignee_id)
                
                # IVF: User cannot assign tasks to manager
                if current_user_role_lower == "user" and assignee_role_lower == "manager":
                    raise TaskInvalidAssigneeException(user_id=request.assignee_id)
            else:
                # CGT: Validate by pharma_id
                if not assignee.pharma_id or assignee.pharma_id != current_user.pharma_id:
                    raise TaskInvalidAssigneeException(user_id=request.assignee_id)
            
            task.assignee_id = request.assignee_id
        
        # Validate that only one is provided (not both) - schema validation should catch this, but double-check
        if request.patient_id and request.tank_code:
            raise TaskInvalidPatientException(patient_id="Cannot provide both patient_id and tank_code. Use patient_id for CGT or tank_code for IVF")
        
        # Validate new patient (if provided for CGT flow)
        if request.patient_id:
            patient = db.query(Patient).filter(Patient.id == request.patient_id).first()
            if not patient:
                raise TaskInvalidPatientException(patient_id=request.patient_id)
            task.patient_id = request.patient_id
            task.tank_id = None  # Clear tank_id when setting patient_id
        
        # Resolve tank_code to tank_id if provided (for IVF flow)
        if request.tank_code:
            tank_id = _resolve_tank_code_to_id(request.tank_code, db)
            task.tank_id = tank_id
            task.patient_id = None  # Clear patient_id when setting tank_id
        
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
        task_response = _build_task_response(task, current_user, db)
        
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
        task_response = _build_task_response(task, current_user, db)
        
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
    Delete a task. Only the manager or pharma_admin who created the task can do this.
    
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
