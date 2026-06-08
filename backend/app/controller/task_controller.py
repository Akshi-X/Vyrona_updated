from fastapi import APIRouter, Depends, Query, Path
from sqlalchemy.orm import Session
from typing import Optional

from app.config import database
from app.dependencies.auth_dependencies import get_current_user
from app.constants.app_constants import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE
from app.constants.enums import TaskPriority, TaskStatus
from app.models import user_model
from app.schemas.task_schema import (
    CreateTaskRequest,
    CreateTaskResponse,
    UpdateTaskRequest,
    UpdateTaskResponse,
    UpdateTaskStatusRequest,
    UpdateTaskStatusResponse,
    DeleteTaskResponse,
    TaskResponse,
    TaskListResponse,
    PatientTaskListResponse
)
from app.service import task_service

router = APIRouter(tags=["Tasks"])


# ---------------------------
# 1. Create Task (Manager or Pharma Admin)
# ---------------------------
@router.post("/tasks", response_model=CreateTaskResponse)
def create_task(
    request: CreateTaskRequest,
    current_user: user_model.User = Depends(get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Create a new task. Managers and pharma_admins can create tasks.
    
    Protected endpoint. Manager or Pharma Admin role required.
    
    Request Body:
    - task_name: Name of the task (required)
    - description: Detailed description (optional)
    - assignee_id: User ID to assign the task to (required)
    - patient_id: Related patient ID (optional)
    - due_date: Task due date (optional)
    - priority: Task priority (High, Medium, Low)
    - status: Initial status (defaults to "Not started")
    """
    # Call service (business logic in service layer)
    result = task_service.create_task(
        request=request,
        current_user=current_user,
        db=db
    )
    
    # Return DTO (result is already CreateTaskResponse)
    return result


# ---------------------------
# 2. Get All Tasks (My Tasks)
# ---------------------------
@router.get("/tasks", response_model=TaskListResponse)
def get_all_tasks(
    current_user: user_model.User = Depends(get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Get tasks for current user as two arrays.
    
    Protected endpoint. Any authenticated user can view their tasks.
    
    Returns two arrays:
    - created_tasks: tasks created by the user (editable via PUT)
    - assigned_tasks: tasks assigned to the user (status editable via PATCH)
    """
    # Call service (business logic in service layer)
    result = task_service.get_all_tasks(
        current_user=current_user,
        db=db
    )
    
    # Return DTO (result is already TaskListResponse)
    return result


# ---------------------------
# 3. Get Task by ID
# ---------------------------
@router.get("/tasks/{task_id}", response_model=TaskResponse)
def get_task(
    task_id: int,
    current_user: user_model.User = Depends(get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Get a specific task by ID.
    
    Protected endpoint. User can only view tasks they created or are assigned to.
    
    Path Parameters:
    - task_id: ID of the task to retrieve
    """
    # Call service (business logic in service layer)
    result = task_service.get_task_by_id(
        task_id=task_id,
        current_user=current_user,
        db=db
    )
    
    # Return DTO (result is already TaskResponse)
    return result


@router.get("/patients/{patient_id}/tasks", response_model=PatientTaskListResponse)
def get_patient_tasks(
    patient_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    status: Optional[TaskStatus] = Query(None),
    priority: Optional[TaskPriority] = Query(None),
    current_user: user_model.User = Depends(get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Retrieve paginated tasks linked to a patient with optional filters (CGT flow).
    
    Protected endpoint. Managers/pharma admins can see all patient tasks, others
    are limited to their own created or assigned tasks.
    
    Query Parameters:
    - page: Page number (default 1)
    - page_size: Number of tasks per page (default from app constants)
    - status: Filter by task status
    - priority: Filter by task priority
    """
    return task_service.get_tasks_by_patient(
        patient_id=patient_id,
        current_user=current_user,
        db=db,
        status=status,
        priority=priority,
        page=page,
        page_size=page_size
    )


@router.get("/canisters/{tank_id}/tasks", response_model=PatientTaskListResponse)
def get_canister_tasks(
    tank_id: int = Path(..., description="Tank ID"),
    page: int = Query(1, ge=1),
    page_size: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    status: Optional[TaskStatus] = Query(None),
    priority: Optional[TaskPriority] = Query(None),
    current_user: user_model.User = Depends(get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Retrieve paginated tasks linked to a tank with optional filters (IVF flow).
    
    Protected endpoint. Managers/pharma admins can see all tank tasks, others
    are limited to their own created or assigned tasks.
    
    Path Parameters:
    - tank_id: Tank ID
    
    Query Parameters:
    - page: Page number (default 1)
    - page_size: Number of tasks per page (default from app constants)
    - status: Filter by task status
    - priority: Filter by task priority
    """
    return task_service.get_tasks_by_canister(
        tank_id=tank_id,
        current_user=current_user,
        db=db,
        status=status,
        priority=priority,
        page=page,
        page_size=page_size
    )


@router.get("/incubators/{incubator_id}/tasks", response_model=PatientTaskListResponse)
def get_incubator_tasks(
    incubator_id: int = Path(..., description="Incubator ID"),
    chamber_id: Optional[str] = Query(None, description="Filter by chamber (None = all chambers)"),
    page: int = Query(1, ge=1),
    page_size: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    status: Optional[TaskStatus] = Query(None),
    priority: Optional[TaskPriority] = Query(None),
    current_user: user_model.User = Depends(get_current_user),
    db: Session = Depends(database.get_db)
):
    """Retrieve paginated tasks linked to an incubator with optional filters."""
    return task_service.get_tasks_by_incubator(
        incubator_id=incubator_id,
        current_user=current_user,
        db=db,
        chamber_id=chamber_id,
        status=status,
        priority=priority,
        page=page,
        page_size=page_size
    )


@router.get("/refrigerators/{refrigerator_id}/tasks", response_model=PatientTaskListResponse)
def get_refrigerator_tasks(
    refrigerator_id: int = Path(..., description="Refrigerator ID"),
    page: int = Query(1, ge=1),
    page_size: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    status: Optional[TaskStatus] = Query(None),
    priority: Optional[TaskPriority] = Query(None),
    current_user: user_model.User = Depends(get_current_user),
    db: Session = Depends(database.get_db)
):
    """Retrieve paginated tasks linked to a refrigerator."""
    return task_service.get_tasks_by_refrigerator(
        refrigerator_id=refrigerator_id,
        current_user=current_user,
        db=db,
        status=status,
        priority=priority,
        page=page,
        page_size=page_size
    )


# ---------------------------
# 4. Update Task (Full Update - Creator or Assignee)
# ---------------------------
@router.put("/tasks/{task_id}", response_model=UpdateTaskResponse)
def update_task(
    task_id: int,
    request: UpdateTaskRequest,
    current_user: user_model.User = Depends(get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Update a task. Creator can update all fields, assignee can only update status.
    
    Protected endpoint. Creator or assignee can edit.
    
    Path Parameters:
    - task_id: ID of the task to update
    
    Request Body (all fields optional):
    - task_name: Updated task name (creator only)
    - description: Updated description (creator only)
    - assignee_id: New assignee user ID (creator only)
    - patient_id: New patient ID (creator only)
    - due_date: Updated due date (creator only)
    - priority: Updated priority (creator only)
    - status: Updated status (creator or assignee)
    """
    # Call service (business logic in service layer)
    result = task_service.update_task(
        task_id=task_id,
        request=request,
        current_user=current_user,
        db=db
    )
    
    # Return DTO (result is already UpdateTaskResponse)
    return result


# ---------------------------
# 5. Update Task Status (Assignee Only)
# ---------------------------
@router.patch("/tasks/{task_id}/status", response_model=UpdateTaskStatusResponse)
def update_task_status(
    task_id: int,
    request: UpdateTaskStatusRequest,
    current_user: user_model.User = Depends(get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Update only the task status. Only the assignee can do this.
    
    Protected endpoint. Only assignee can change status.
    
    Path Parameters:
    - task_id: ID of the task to update
    
    Request Body:
    - status: New status (Done, In progress, Not started)
    """
    # Call service (business logic in service layer)
    result = task_service.update_task_status(
        task_id=task_id,
        request=request,
        current_user=current_user,
        db=db
    )
    
    # Return DTO (result is already UpdateTaskStatusResponse)
    return result


# ---------------------------
# 6. Delete Task (Manager/Pharma Admin)
# ---------------------------
@router.delete("/tasks/{task_id}", response_model=DeleteTaskResponse)
def delete_task(
    task_id: int,
    current_user: user_model.User = Depends(get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Delete a task. Only the manager or pharma_admin who created the task can do this.
    
    Protected endpoint. Only creator can delete.
    
    Path Parameters:
    - task_id: ID of the task to delete
    """
    # Call service (business logic in service layer)
    result = task_service.delete_task(
        task_id=task_id,
        current_user=current_user,
        db=db
    )
    
    # Return DTO (result is already DeleteTaskResponse)
    return result

