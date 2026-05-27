from pydantic import BaseModel
from typing import Any, Dict, List, Optional
from datetime import date, datetime


# ── Cycle Report ─────────────────────────────────────────────────────────────

class ReportResponse(BaseModel):
    report_id: int
    cycle_id: int
    report_type: Optional[str]
    file_url: str
    file_name: Optional[str]
    file_size: Optional[int]
    generated_by: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


# ── Oocyte Image ─────────────────────────────────────────────────────────────

class ImageResponse(BaseModel):
    image_id: int
    grade_id: int
    cycle_id: int
    day: Optional[int]
    upload_image_url: str
    exp_img_url: Optional[str]
    te_img_url: Optional[str]
    icm_img_url: Optional[str]
    file_name: Optional[str]
    file_size: Optional[int]
    uploaded_by: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class ImageRegisterBody(BaseModel):
    upload_image_url: str
    exp_img_url: Optional[str] = None
    te_img_url: Optional[str] = None
    icm_img_url: Optional[str] = None
    file_name: Optional[str] = None
    file_size: Optional[int] = None
    day: Optional[int] = None


class ImagePresignResponse(BaseModel):
    container_sas_url: str
    prefix: str
    expires_in_minutes: int


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
    opu_date: Optional[date] = None
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
    opu_date: Optional[date] = None
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
    opu_date: Optional[date]
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
    d6_stage: Optional[str] = None
    d6_progression: Optional[str] = None
    blast_grade: Optional[str] = None
    fate: Optional[str] = None
    freeze_no: Optional[str] = None
    meta: Optional[Dict[str, Any]] = None


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
    d6_stage: Optional[str]
    d6_progression: Optional[str]
    blast_grade: Optional[str]
    fate: Optional[str]
    freeze_no: Optional[str]
    meta: Optional[Dict[str, Any]]
    grade_count: int = 0
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


# ── Oocyte Grade ─────────────────────────────────────────────────────────────

class GradeUpsert(BaseModel):
    stage: Optional[int] = None
    is_active: Optional[bool] = None
    is_best: Optional[bool] = None
    is_completed: Optional[bool] = None
    grade: Optional[str] = None
    ai_score: Optional[float] = None
    hatching: Optional[str] = None
    vacuolization: Optional[str] = None
    multinucleation: Optional[str] = None
    zona_pellucida: Optional[str] = None
    blastocoel: Optional[str] = None
    cytoplasmic_granularity: Optional[str] = None
    bridge: Optional[str] = None
    note: Optional[str] = None


class GradeResponse(BaseModel):
    grade_id: int
    log_id: int
    cycle_id: int
    stage: Optional[int]
    is_active: bool
    is_best: bool
    is_completed: bool
    grade: Optional[str]
    ai_score: Optional[float]
    hatching: Optional[str]
    vacuolization: Optional[str]
    multinucleation: Optional[str]
    zona_pellucida: Optional[str]
    blastocoel: Optional[str]
    cytoplasmic_granularity: Optional[str]
    bridge: Optional[str]
    note: Optional[str]
    images: List[ImageResponse] = []
    graded_by: Optional[str]
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


# ── Composite ────────────────────────────────────────────────────────────────

class CycleWithLogsResponse(CycleResponse):
    logs: List[LogResponse] = []
