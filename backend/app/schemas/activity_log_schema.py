from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class ActivityLogRecord(BaseModel):
    id: int
    action: str
    outcome: str
    actor_type: str
    actor_id: Optional[str] = None
    actor_label: Optional[str] = None
    hospital_id: Optional[int] = None
    target_type: Optional[str] = None
    target_id: Optional[str] = None
    target_label: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    created_at: datetime
    actor_details: Optional[Dict[str, Any]] = None
    target_details: Optional[Dict[str, Any]] = None


class ActivityLogQueryResponse(BaseModel):
    logs: List[ActivityLogRecord]
    total_count: int
    page: int
    page_size: int
    status: str = "success"


class ActivityLogDownloadRequest(BaseModel):
    report_type: str
    filters: Optional[Dict[str, Any]] = None


class ActivityLogDownloadResponse(BaseModel):
    status: str = "success"
