from fastapi import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy.orm import Session
from typing import List, Optional
import logging

from app.config.database import get_db
from app.service.IVF.ivf_cycle_service import IvfCycleService
from app.schemas.IVF.ivf_cycle_schema import (
    CycleCreate,
    CycleUpdate,
    CycleResponse,
    CycleWithLogsResponse,
    LogUpsert,
    LogResponse,
)
from app.models.IVF.hospital_branch_model import HospitalBranch
from app.utils.ivf_helpers import get_branch_filter_info
from app.utils.user_helpers import is_specific_department
from app.constants.enums import ActivityOutcome
from app.service.activity_log_service import (
    ActivityLogService,
    build_actor_from_user,
    build_target,
    is_audit_log_disabled_for_user,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ivf", tags=["IVF Cycles"])


def _ivf_user(request: Request):
    if not hasattr(request.state, "current_user"):
        raise HTTPException(status_code=401, detail="User not authenticated")
    user = request.state.current_user
    if not is_specific_department(user.department, "IVF"):
        raise HTTPException(status_code=403, detail="IVF department access required")
    return user


def _hospital_id(request: Request, db: Session, user) -> int:
    if hasattr(request.state, "hospital_id") and request.state.hospital_id:
        return request.state.hospital_id
    if user.hospital_id:
        return user.hospital_id
    if user.branch_id:
        branch = db.query(HospitalBranch).filter(HospitalBranch.branch_id == user.branch_id).first()
        if branch:
            return branch.hospital_id
    raise HTTPException(status_code=400, detail="Unable to determine hospital for this user")


def _log_action_for_payload(payload: LogUpsert) -> str:
    if payload.fate is not None:
        return "ivf_cycle.oocyte_log.fate_set"
    if payload.d6_grade is not None or payload.d6_stage is not None or payload.d6_progression is not None:
        return "ivf_cycle.oocyte_log.d6_updated"
    if payload.d5_grade is not None or payload.d5_stage is not None:
        return "ivf_cycle.oocyte_log.d5_updated"
    if payload.d3_grade is not None or payload.d3_symmetry is not None or payload.d3_drop_no is not None:
        return "ivf_cycle.oocyte_log.d3_updated"
    if payload.d1_pn is not None or payload.d1_zygote_status is not None:
        return "ivf_cycle.oocyte_log.d1_updated"
    return "ivf_cycle.oocyte_log.d0_saved"


def _log_metadata(cycle_id: int, his_id: Optional[str], payload: LogUpsert) -> dict:
    data: dict = {"cycle_id": cycle_id, "his_id": his_id, "oocyte_no": payload.oocyte_no}
    if payload.d0_maturity is not None:
        data["d0_maturity"] = payload.d0_maturity
    if payload.d1_pn is not None:
        data["d1_pn"] = payload.d1_pn
    if payload.d1_zygote_status is not None:
        data["d1_zygote_status"] = payload.d1_zygote_status
    if payload.d3_grade is not None:
        data["d3_grade"] = payload.d3_grade
    if payload.d5_grade is not None:
        data["d5_grade"] = payload.d5_grade
    if payload.d6_grade is not None:
        data["d6_grade"] = payload.d6_grade
    if payload.fate is not None:
        data["fate"] = payload.fate
    return data


# ── Cycle endpoints ───────────────────────────────────────────────────────────

@router.post("/cycles", response_model=CycleResponse, status_code=201)
def create_cycle(
    payload: CycleCreate,
    request: Request,
    db: Session = Depends(get_db),
):
    user = _ivf_user(request)
    hospital_id = _hospital_id(request, db, user)
    try:
        svc = IvfCycleService(db)
        cycle = svc.create_cycle(hospital_id, payload, user_id=str(user.user_id))
        total_oocytes = (payload.oocyte_m2 or 0) + (payload.oocyte_m1 or 0) + (payload.oocyte_others or 0)
        ActivityLogService(db).log_activity(
            action="ivf_cycle.created",
            outcome=ActivityOutcome.SUCCESS.value,
            actor=build_actor_from_user(user),
            target=build_target("ivf_cycle", str(cycle.cycle_id), cycle.his_id, hospital_id),
            metadata={
                "cycle_id": cycle.cycle_id,
                "his_id": cycle.his_id,
                "patient_name": cycle.patient_name,
                "injection_method": cycle.injection_method,
                "total_oocytes_injected": total_oocytes,
                "oocyte_m2": payload.oocyte_m2,
                "oocyte_m1": payload.oocyte_m1,
                "oocyte_others": payload.oocyte_others,
            },
            audit_log_disabled=is_audit_log_disabled_for_user(user),
        )
        return cycle
    except Exception as e:
        logger.exception("create_cycle failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/cycles", response_model=List[CycleResponse])
def list_cycles(
    request: Request,
    his_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    user = _ivf_user(request)
    hospital_id = _hospital_id(request, db, user)
    branch_id, _ = get_branch_filter_info(request)
    try:
        svc = IvfCycleService(db)
        return svc.list_cycles(hospital_id, branch_id=branch_id, his_id=his_id, status=status, skip=skip, limit=limit)
    except Exception as e:
        logger.exception("list_cycles failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/cycles/{cycle_id}", response_model=CycleWithLogsResponse)
def get_cycle(
    cycle_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    user = _ivf_user(request)
    hospital_id = _hospital_id(request, db, user)
    svc = IvfCycleService(db)
    cycle = svc.get_cycle(cycle_id, hospital_id)
    if not cycle:
        raise HTTPException(status_code=404, detail="Cycle not found")
    logs = svc.get_logs(cycle_id)
    data = CycleResponse.model_validate(cycle).model_dump()
    data["logs"] = [LogResponse.model_validate(l).model_dump() for l in logs]
    return data


@router.put("/cycles/{cycle_id}", response_model=CycleResponse)
def update_cycle(
    cycle_id: int,
    payload: CycleUpdate,
    request: Request,
    db: Session = Depends(get_db),
):
    user = _ivf_user(request)
    hospital_id = _hospital_id(request, db, user)
    svc = IvfCycleService(db)
    cycle = svc.update_cycle(cycle_id, hospital_id, payload, user_id=str(user.user_id))
    if not cycle:
        raise HTTPException(status_code=404, detail="Cycle not found")
    ActivityLogService(db).log_activity(
        action="ivf_cycle.updated",
        outcome=ActivityOutcome.SUCCESS.value,
        actor=build_actor_from_user(user),
        target=build_target("ivf_cycle", str(cycle.cycle_id), cycle.his_id, hospital_id),
        metadata={
            "cycle_id": cycle.cycle_id,
            "his_id": cycle.his_id,
            "fields_updated": list(payload.model_dump(exclude_unset=True).keys()),
        },
        audit_log_disabled=is_audit_log_disabled_for_user(user),
    )
    return cycle


# ── Log endpoints ─────────────────────────────────────────────────────────────

@router.post("/cycles/{cycle_id}/logs", response_model=LogResponse, status_code=201)
def upsert_log(
    cycle_id: int,
    payload: LogUpsert,
    request: Request,
    db: Session = Depends(get_db),
):
    user = _ivf_user(request)
    hospital_id = _hospital_id(request, db, user)
    svc = IvfCycleService(db)
    cycle = svc.get_cycle(cycle_id, hospital_id)
    if not cycle:
        raise HTTPException(status_code=404, detail="Cycle not found")
    try:
        log = svc.upsert_log(cycle_id, payload, user_id=str(user.user_id))
        ActivityLogService(db).log_activity(
            action=_log_action_for_payload(payload),
            outcome=ActivityOutcome.SUCCESS.value,
            actor=build_actor_from_user(user),
            target=build_target("ivf_cycle", str(cycle_id), cycle.his_id, hospital_id),
            metadata=_log_metadata(cycle_id, cycle.his_id, payload),
            audit_log_disabled=is_audit_log_disabled_for_user(user),
        )
        return log
    except Exception as e:
        logger.exception("upsert_log failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/cycles/{cycle_id}/logs", response_model=List[LogResponse])
def get_logs(
    cycle_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    user = _ivf_user(request)
    hospital_id = _hospital_id(request, db, user)
    svc = IvfCycleService(db)
    if not svc.get_cycle(cycle_id, hospital_id):
        raise HTTPException(status_code=404, detail="Cycle not found")
    return svc.get_logs(cycle_id)


@router.delete("/cycles/{cycle_id}/logs/{log_id}", status_code=204)
def delete_log(
    cycle_id: int,
    log_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    user = _ivf_user(request)
    hospital_id = _hospital_id(request, db, user)
    svc = IvfCycleService(db)
    if not svc.get_cycle(cycle_id, hospital_id):
        raise HTTPException(status_code=404, detail="Cycle not found")
    if not svc.delete_log(log_id, cycle_id):
        raise HTTPException(status_code=404, detail="Log entry not found")
