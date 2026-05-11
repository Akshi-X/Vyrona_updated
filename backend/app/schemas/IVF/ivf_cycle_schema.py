from pydantic import BaseModel
from typing import Any, Dict, List, Optional
from datetime import datetime


# ── Cycle ────────────────────────────────────────────────────────────────────

class CycleCreate(BaseModel):
    his_id: str
    patient_name: Optional[str] = None
    branch_id: Optional[int] = None
    incubator_id: Optional[int] = None
    chamber_position: Optional[str] = None
    injection_method: Optional[str] = None
    sperm_quality: Optional[str] = None
    oocyte_quality: Optional[str] = None
    cycle_type: Optional[str] = None
    oocyte_m2: Optional[int] = None
    oocyte_m1: Optional[int] = None
    oocyte_gv: Optional[int] = None
    oocyte_others: Optional[int] = None
    status: Optional[str] = "Active"


class CycleUpdate(BaseModel):
    patient_name: Optional[str] = None
    branch_id: Optional[int] = None
    incubator_id: Optional[int] = None
    chamber_position: Optional[str] = None
    injection_method: Optional[str] = None
    sperm_quality: Optional[str] = None
    oocyte_quality: Optional[str] = None
    cycle_type: Optional[str] = None
    oocyte_m2: Optional[int] = None
    oocyte_m1: Optional[int] = None
    oocyte_gv: Optional[int] = None
    oocyte_others: Optional[int] = None
    status: Optional[str] = None


class CycleResponse(BaseModel):
    cycle_id: int
    hospital_id: int
    branch_id: Optional[int]
    his_id: str
    patient_name: Optional[str]
    incubator_id: Optional[int]
    chamber_position: Optional[str]
    injection_method: Optional[str]
    sperm_quality: Optional[str]
    oocyte_quality: Optional[str]
    cycle_type: Optional[str]
    oocyte_m2: Optional[int]
    oocyte_m1: Optional[int]
    oocyte_gv: Optional[int]
    oocyte_others: Optional[int]
    status: Optional[str]
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


# ── Log ──────────────────────────────────────────────────────────────────────

class LogUpsert(BaseModel):
    oocyte_no: int
    oocyte_comments: Optional[str] = None
    d0_maturity: Optional[str] = None
    d0_drop_no: Optional[str] = None
    d1_pn: Optional[str] = None
    d1_zygote_status: Optional[str] = None
    d3_drop_no: Optional[str] = None
    d3_grade: Optional[str] = None
    d3_symmetry: Optional[str] = None
    d5_stage: Optional[str] = None
    d5_grade: Optional[str] = None
    d6_stage: Optional[str] = None
    d6_grade: Optional[str] = None
    d6_progression: Optional[str] = None
    fate: Optional[str] = None
    freeze_no: Optional[str] = None
    meta: Optional[Dict[str, Any]] = None   # {d0_notes, d1_notes, d3_notes, d5_notes, d6_notes, final_notes}


class LogResponse(BaseModel):
    log_id: int
    cycle_id: int
    oocyte_no: int
    oocyte_comments: Optional[str]
    d0_maturity: Optional[str]
    d0_drop_no: Optional[str]
    d1_pn: Optional[str]
    d1_zygote_status: Optional[str]
    d3_drop_no: Optional[str]
    d3_grade: Optional[str]
    d3_symmetry: Optional[str]
    d5_stage: Optional[str]
    d5_grade: Optional[str]
    d6_stage: Optional[str]
    d6_grade: Optional[str]
    d6_progression: Optional[str]
    fate: Optional[str]
    freeze_no: Optional[str]
    meta: Optional[Dict[str, Any]]
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


# ── Composite ────────────────────────────────────────────────────────────────

class CycleWithLogsResponse(CycleResponse):
    logs: List[LogResponse] = []
