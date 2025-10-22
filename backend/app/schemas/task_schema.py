from datetime import datetime
from typing import Optional, List

from pydantic import BaseModel, field_validator

from app.constants.enums import TaskPriority, TaskStatus


# ==========================================
# REQUEST SCHEMAS
# ==========================================

class CreateTaskRequest(BaseModel):
    """Request schema for creating a new task"""
    task_name: str
    description: Optional[str] = None
    assignee_id: str
    patient_id: Optional[str] = None
    due_date: Optional[datetime] = None
    priority: TaskPriority
    status: Optional[TaskStatus] = TaskStatus.NOT_STARTED
    
    @field_validator('task_name')
    @classmethod
    def validate_task_name(cls, v):
        """Validate task name is not empty"""
        if not v or not v.strip():
            raise ValueError("Task name cannot be empty")
        if len(v) > 500:
            raise ValueError("Task name is too long (max 500 characters)")
        return v.strip()
    
    @field_validator('description')
    @classmethod
    def validate_description(cls, v):
        """Validate description length"""
        if v and len(v) > 2000:
            raise ValueError("Description is too long (max 2000 characters)")
        return v.strip() if v else None


class UpdateTaskRequest(BaseModel):
    """Request schema for updating a task (full update by manager)"""
    task_name: Optional[str] = None
    description: Optional[str] = None
    assignee_id: Optional[str] = None
    patient_id: Optional[str] = None
    due_date: Optional[datetime] = None
    priority: Optional[TaskPriority] = None
    status: Optional[TaskStatus] = None
    
    @field_validator('task_name')
    @classmethod
    def validate_task_name(cls, v):
        """Validate task name is not empty"""
        if v is not None:
            if not v or not v.strip():
                raise ValueError("Task name cannot be empty")
            if len(v) > 500:
                raise ValueError("Task name is too long (max 500 characters)")
            return v.strip()
        return v
    
    @field_validator('description')
    @classmethod
    def validate_description(cls, v):
        """Validate description length"""
        if v and len(v) > 2000:
            raise ValueError("Description is too long (max 2000 characters)")
        return v.strip() if v else None


class UpdateTaskStatusRequest(BaseModel):
    """Request schema for updating only task status (by assignee)"""
    status: TaskStatus


# ==========================================
# RESPONSE SCHEMAS
# ==========================================

class TaskPermissions(BaseModel):
    """Permissions for a task"""
    can_edit_all: bool
    can_edit_status_only: bool


class TaskAssigneeInfo(BaseModel):
    """Assignee information"""
    user_id: str
    first_name: str
    last_name: str
    email: str
    role: str
    
    class Config:
        from_attributes = True


class TaskCreatorInfo(BaseModel):
    """Creator information"""
    user_id: str
    first_name: str
    last_name: str
    email: str
    role: str
    
    class Config:
        from_attributes = True


class TaskResponse(BaseModel):
    """Response schema for a single task"""
    id: int
    task_name: str
    description: Optional[str]
    assignee: TaskAssigneeInfo
    created_by: TaskCreatorInfo
    patient_id: Optional[str]
    due_date: Optional[datetime]
    priority: TaskPriority
    status: TaskStatus
    created_at: datetime
    updated_at: datetime
    permissions: Optional[TaskPermissions] = None
    
    class Config:
        from_attributes = True


class TaskListResponse(BaseModel):
    """Response schema for listing tasks"""
    total_tasks: int
    tasks: List[TaskResponse]


class CreateTaskResponse(BaseModel):
    """Response schema after creating a task"""
    message: str
    task: TaskResponse


class UpdateTaskResponse(BaseModel):
    """Response schema after updating a task"""
    message: str
    task: TaskResponse


class UpdateTaskStatusResponse(BaseModel):
    """Response schema after updating task status"""
    message: str
    task: TaskResponse


class DeleteTaskResponse(BaseModel):
    """Response schema after deleting a task"""
    message: str
    task_id: int

