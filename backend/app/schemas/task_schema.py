from datetime import datetime
from typing import Optional, List, Dict, Any

from pydantic import BaseModel, field_validator, field_serializer, model_serializer, model_validator

from app.constants.enums import TaskPriority, TaskStatus


# ==========================================
# REQUEST SCHEMAS
# ==========================================

class CreateTaskRequest(BaseModel):
    """Request schema for creating a new task"""
    task_name: str
    description: Optional[str] = None
    assignee_id: str
    patient_id: Optional[str] = None  # For CGT flow
    tank_code: Optional[str] = None  # For IVF flow (e.g., "T1")
    tank_id: Optional[int] = None  # For IVF flow (internal tank ID)
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

    @model_validator(mode='after')
    def validate_patient_or_tank(self):
        """Validate that exactly one of patient_id, tank_code, tank_id is provided."""
        patient_id = self.patient_id.strip() if self.patient_id and isinstance(self.patient_id, str) else self.patient_id
        tank_code = self.tank_code.strip() if self.tank_code and isinstance(self.tank_code, str) else self.tank_code
        tank_id = self.tank_id

        provided = [bool(patient_id), bool(tank_code), tank_id is not None]
        if sum(provided) > 1:
            raise ValueError("Provide only one of patient_id, tank_code, or tank_id")
        if sum(provided) == 0:
            raise ValueError("Either patient_id (CGT) or tank_code/tank_id (IVF) must be provided")

        self.patient_id = patient_id if patient_id else None
        self.tank_code = tank_code if tank_code else None
        return self


class UpdateTaskRequest(BaseModel):
    """Request schema for updating a task (full update by manager)"""
    task_name: Optional[str] = None
    description: Optional[str] = None
    assignee_id: Optional[str] = None
    patient_id: Optional[str] = None  # For CGT flow
    tank_code: Optional[str] = None  # For IVF flow (e.g., "T1")
    tank_id: Optional[int] = None  # For IVF flow (internal tank ID)
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
    
    @model_validator(mode='after')
    def validate_patient_or_tank(self):
        """Validate that patient_id, tank_code, tank_id are not provided together"""
        # Treat empty strings as None
        patient_id = self.patient_id.strip() if self.patient_id and isinstance(self.patient_id, str) else self.patient_id
        tank_code = self.tank_code.strip() if self.tank_code and isinstance(self.tank_code, str) else self.tank_code
        tank_id = self.tank_id
        
        provided = [bool(patient_id), bool(tank_code), tank_id is not None]
        if sum(provided) > 1:
            raise ValueError("Provide only one of patient_id, tank_code, or tank_id")
        
        # Update the model with cleaned values
        self.patient_id = patient_id if patient_id else None
        self.tank_code = tank_code if tank_code else None
        return self


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
    patient_id: Optional[str]  # For CGT flow
    tank_code: Optional[str]  # For IVF flow (e.g., "T1")
    tank_id: Optional[int]  # For IVF flow (internal tank ID)
    due_date: Optional[datetime]
    priority: TaskPriority
    status: TaskStatus
    created_at: datetime
    updated_at: datetime
    permissions: Optional[TaskPermissions] = None
    
    @field_serializer('due_date')
    def serialize_due_date(self, due_date: Optional[datetime]) -> Optional[str]:
        """Format due_date as YYYY-M-D (e.g., 2025-10-3)"""
        if due_date is None:
            return None
        # Format as YYYY-M-D without leading zeros
        return f"{due_date.year}-{due_date.month}-{due_date.day}"
    
    class Config:
        from_attributes = True


class TaskListResponse(BaseModel):
    """Response schema for listing tasks split by role context"""
    total_created: int
    total_assigned: int
    created_tasks: List[TaskResponse]
    assigned_tasks: List[TaskResponse]
    
    @model_serializer
    def serialize_model(self) -> Dict[str, Any]:
        """Serialize model, excluding empty list fields"""
        result = {
            "total_created": self.total_created,
            "total_assigned": self.total_assigned,
        }
        # Only include created_tasks if not empty
        if self.created_tasks:
            result["created_tasks"] = self.created_tasks
        # Only include assigned_tasks if not empty
        if self.assigned_tasks:
            result["assigned_tasks"] = self.assigned_tasks
        return result


class PatientTaskListResponse(BaseModel):
    """Response schema for tasks associated with a patient or tank"""
    message: str
    patient_id: Optional[str] = None  # For CGT flow
    tank_code: Optional[str] = None  # For IVF flow (e.g., "T1")
    total: int
    page: int
    page_size: int
    has_next: bool
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
