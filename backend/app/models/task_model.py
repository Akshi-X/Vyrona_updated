import sqlalchemy
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Enum as SQLEnum
from sqlalchemy.orm import relationship

from ..config.database import Base
from ..constants.enums import TaskPriority, TaskStatus


class Tasks(Base):
    __tablename__ = "tasks"

    # Primary Key
    id = Column(Integer, primary_key=True, index=True)
    
    # Task Information
    task_name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    
    # Assignments
    assignee_id = Column(String, ForeignKey("users.user_id"), nullable=False)
    created_by_id = Column(String, ForeignKey("users.user_id"), nullable=False)
    updated_by_id = Column(String, ForeignKey("users.user_id"), nullable=True)
    
    # Task Fields
    due_date = Column(DateTime, nullable=True)
    priority = Column(SQLEnum(TaskPriority), nullable=False)
    status = Column(SQLEnum(TaskStatus), default=TaskStatus.NOT_STARTED, nullable=False)
    
    # Patient Reference
    patient_id = Column(String, ForeignKey("patient.id"), nullable=True)
    
    # Audit Trail
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    
    # Relationships
    assignee = relationship("User", foreign_keys=[assignee_id], backref="assigned_tasks")
    created_by = relationship("User", foreign_keys=[created_by_id], backref="created_tasks")
    updated_by = relationship("User", foreign_keys=[updated_by_id], backref="updated_tasks")
    patient = relationship("Patient", backref="tasks")

