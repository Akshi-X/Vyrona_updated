import logging

from fastapi import APIRouter, Depends, HTTPException, Request, Query, UploadFile, File, Form  # UploadFile/File/Form used by report upload
from sqlalchemy.orm import Session
from typing import List, Optional

from app.utils import ivf_blob

from app.config.database import get_db
from app.service.IVF.ivf_cycle_service import IvfCycleService
from app.schemas.IVF.ivf_cycle_schema import (
    CycleCreate,
    CycleUpdate,
    CycleResponse,
    CycleWithLogsResponse,
    LogUpsert,
    LogResponse,
    ImageResponse,
    ImagePresignResponse,
    ReportResponse,
    GradeUpsert,
    GradeResponse,
    GradeUploadResponse,
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

# Matches the limit the upload UI advertises.
MAX_IMAGE_BYTES = 20 * 1024 * 1024


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
    if payload.d6_stage is not None or payload.d6_progression is not None:
        return "ivf_cycle.oocyte_log.d6_updated"
    if payload.d5_stage is not None:
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
        total_oocytes = (payload.oocyte_m2 or 0) + (payload.oocyte_m1 or 0)
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
    incubator_id: Optional[int] = Query(None),
    chamber_position: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    user = _ivf_user(request)
    hospital_id = _hospital_id(request, db, user)
    branch_id, _ = get_branch_filter_info(request)
    try:
        svc = IvfCycleService(db)
        return svc.list_cycles(
            hospital_id,
            branch_id=branch_id,
            his_id=his_id,
            status=status,
            incubator_id=incubator_id,
            chamber_position=chamber_position,
            skip=skip,
            limit=limit,
        )
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


# ── Grade endpoints ───────────────────────────────────────────────────────────

@router.post("/cycles/{cycle_id}/logs/{log_id}/grades", response_model=GradeResponse, status_code=201)
def create_grade(
    cycle_id: int,
    log_id: int,
    payload: GradeUpsert,
    request: Request,
    db: Session = Depends(get_db),
):
    user = _ivf_user(request)
    hospital_id = _hospital_id(request, db, user)
    svc = IvfCycleService(db)
    if not svc.get_cycle(cycle_id, hospital_id):
        raise HTTPException(status_code=404, detail="Cycle not found")
    return _grade_with_read_sas(svc.create_grade(log_id, cycle_id, payload, user_id=str(user.user_id)))


@router.get("/cycles/{cycle_id}/logs/{log_id}/grades", response_model=List[GradeResponse])
def list_grades(
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
    return [_grade_with_read_sas(g) for g in svc.list_grades(log_id)]


@router.post("/cycles/{cycle_id}/logs/{log_id}/grades/{grade_id}/select-best", response_model=GradeResponse)
def select_best_grade(
    cycle_id: int,
    log_id: int,
    grade_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    user = _ivf_user(request)
    hospital_id = _hospital_id(request, db, user)
    svc = IvfCycleService(db)
    if not svc.get_cycle(cycle_id, hospital_id):
        raise HTTPException(status_code=404, detail="Cycle not found")
    record = svc.select_best_grade(log_id, grade_id, cycle_id, user_id=str(user.user_id))
    if not record:
        raise HTTPException(status_code=404, detail="Grade not found")
    ActivityLogService(db).log_activity(
        action="ivf_cycle.grade.best_selected",
        outcome=ActivityOutcome.SUCCESS.value,
        actor=build_actor_from_user(user),
        target=build_target("ivf_cycle", str(cycle_id), None, hospital_id),
        metadata={"cycle_id": cycle_id, "log_id": log_id, "grade_id": grade_id},
        audit_log_disabled=is_audit_log_disabled_for_user(user),
    )
    return _grade_with_read_sas(record)


@router.put("/cycles/{cycle_id}/grades/{grade_id}", response_model=GradeResponse)
def update_grade(
    cycle_id: int,
    grade_id: int,
    payload: GradeUpsert,
    request: Request,
    db: Session = Depends(get_db),
):
    user = _ivf_user(request)
    hospital_id = _hospital_id(request, db, user)
    svc = IvfCycleService(db)
    record = svc.update_grade(grade_id, cycle_id, payload, user_id=str(user.user_id))
    if not record:
        raise HTTPException(status_code=404, detail="Grade not found")
    return _grade_with_read_sas(record)


@router.delete("/cycles/{cycle_id}/grades/{grade_id}", status_code=204)
def delete_grade(
    cycle_id: int,
    grade_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    user = _ivf_user(request)
    hospital_id = _hospital_id(request, db, user)
    svc = IvfCycleService(db)
    if not svc.delete_grade(grade_id, cycle_id):
        raise HTTPException(status_code=404, detail="Grade not found")


# ── Image helpers ────────────────────────────────────────────────────────────

def _sas_image(r: ImageResponse) -> ImageResponse:
    for field in ("upload_image_url", "exp_img_url", "te_img_url", "icm_img_url", "annotated_img_url"):
        val = getattr(r, field, None)
        if val:
            setattr(r, field, ivf_blob.generate_read_sas_url(val))
    return r


def _with_read_sas(img) -> ImageResponse:
    return _sas_image(ImageResponse.model_validate(img))


def _grade_with_read_sas(grade) -> GradeResponse:
    r = GradeResponse.model_validate(grade)
    r.images = [_sas_image(img) for img in r.images]
    return r


# ── Image endpoints ───────────────────────────────────────────────────────────

@router.get("/cycles/{cycle_id}/grades/{grade_id}/images/presign", response_model=ImagePresignResponse)
def get_image_presign(
    cycle_id: int,
    grade_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    """Return a short-lived container write SAS URL for direct browser → Azure upload."""
    user = _ivf_user(request)
    _hospital_id(request, db, user)
    svc = IvfCycleService(db)
    if not svc.get_grade_by_id(grade_id, cycle_id):
        raise HTTPException(status_code=404, detail="Grade record not found")
    try:
        ivf_blob._ensure_cors()
        sas_url = ivf_blob.generate_container_write_sas_url(expiry_minutes=15)
    except Exception as exc:
        logger.warning("presign failed: %s", exc)
        raise HTTPException(status_code=500, detail="Storage service unavailable")
    return ImagePresignResponse(
        container_sas_url=sas_url,
        prefix=f"ivf/oocytes/{cycle_id}/{grade_id}",
        expires_in_minutes=15,
    )


@router.post("/cycles/{cycle_id}/logs/{log_id}/grades/upload",
             response_model=GradeUploadResponse, status_code=201)
def create_grade_with_image(
    cycle_id: int,
    log_id: int,
    file: UploadFile = File(...),
    stage: Optional[int] = Form(None),
    request: Request = None,
    db: Session = Depends(get_db),
):
    """Create a grade with its source image in one round trip.

    The presign + direct-to-blob flow costs three calls before inference can even
    start. The image row is written here rather than after grading so the grade is
    displayable — with its image — for the whole time the model is running; the
    annotation URLs are filled in later by grading-service itself once analysis
    completes (see grading-service/shared/job_handler.py:_save_result).
    """
    user = _ivf_user(request)
    hospital_id = _hospital_id(request, db, user)
    svc = IvfCycleService(db)
    if not svc.get_cycle(cycle_id, hospital_id):
        raise HTTPException(status_code=404, detail="Cycle not found")
    grade = svc.create_grade(log_id, cycle_id, GradeUpsert(stage=stage), user_id=str(user.user_id))

    try:
        data = file.file.read()
        if len(data) > MAX_IMAGE_BYTES:
            raise ValueError(f"Image exceeds the {MAX_IMAGE_BYTES // (1024 * 1024)}MB limit")
        blob_path = ivf_blob.make_blob_path(
            f"ivf/oocytes/{cycle_id}/{grade.grade_id}", file.filename or "", "upload",
        )
        image_url = ivf_blob.upload_bytes(data, blob_path, file.content_type or "application/octet-stream")
    except ValueError as e:
        svc.delete_grade(grade.grade_id, cycle_id)
        raise HTTPException(status_code=413, detail=str(e))
    except Exception as e:
        logger.exception("Blob upload failed for grade=%s", grade.grade_id)
        svc.delete_grade(grade.grade_id, cycle_id)
        raise HTTPException(status_code=500, detail=f"Storage error: {e}")

    image = svc.add_image(
        grade_id=grade.grade_id,
        cycle_id=cycle_id,
        upload_image_url=image_url,
        file_name=file.filename,
        file_size=len(data),
        user_id=str(user.user_id),
    )

    return GradeUploadResponse(
        grade_id=grade.grade_id,
        image_id=image.image_id,
        upload_image_url=image_url,
        file_name=file.filename,
        file_size=len(data),
    )


@router.get("/cycles/{cycle_id}/grades/{grade_id}/images", response_model=List[ImageResponse])
def list_images(
    cycle_id: int,
    grade_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    user = _ivf_user(request)
    hospital_id = _hospital_id(request, db, user)
    svc = IvfCycleService(db)
    if not svc.get_grade_by_id(grade_id, cycle_id):
        raise HTTPException(status_code=404, detail="Grade record not found")
    return [_with_read_sas(img) for img in svc.list_images(grade_id)]


@router.delete("/cycles/{cycle_id}/grades/{grade_id}/images/{image_id}", status_code=204)
def delete_image(
    cycle_id: int,
    grade_id: int,
    image_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    user = _ivf_user(request)
    hospital_id = _hospital_id(request, db, user)
    svc = IvfCycleService(db)
    if not svc.get_grade_by_id(grade_id, cycle_id):
        raise HTTPException(status_code=404, detail="Grade record not found")
    urls = svc.delete_image(image_id, cycle_id)
    if urls is None:
        raise HTTPException(status_code=404, detail="Image not found")
    ivf_blob.delete_blobs_by_urls(urls)


# ── Report endpoints ──────────────────────────────────────────────────────────

@router.post("/cycles/{cycle_id}/reports", response_model=ReportResponse, status_code=201)
def upload_report(
    cycle_id: int,
    file: UploadFile = File(...),
    report_type: Optional[str] = Form(None),
    request: Request = None,
    db: Session = Depends(get_db),
):
    user = _ivf_user(request)
    hospital_id = _hospital_id(request, db, user)
    svc = IvfCycleService(db)
    if not svc.get_cycle(cycle_id, hospital_id):
        raise HTTPException(status_code=404, detail="Cycle not found")

    try:
        data = file.file.read()
        blob_path = ivf_blob.make_blob_path(f"ivf/reports/{cycle_id}", file.filename or "", "report")
        file_url = ivf_blob.upload_bytes(data, blob_path, file.content_type or "application/octet-stream")
    except Exception as e:
        logger.exception("Blob upload failed for report cycle=%s", cycle_id)
        raise HTTPException(status_code=500, detail=f"Storage error: {e}")

    return svc.add_report(
        cycle_id=cycle_id,
        file_url=file_url,
        file_name=file.filename,
        file_size=len(data),
        report_type=report_type,
        user_id=str(user.user_id),
    )


@router.get("/cycles/{cycle_id}/reports", response_model=List[ReportResponse])
def list_reports(
    cycle_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    user = _ivf_user(request)
    hospital_id = _hospital_id(request, db, user)
    svc = IvfCycleService(db)
    if not svc.get_cycle(cycle_id, hospital_id):
        raise HTTPException(status_code=404, detail="Cycle not found")
    return svc.list_reports(cycle_id)


@router.delete("/cycles/{cycle_id}/reports/{report_id}", status_code=204)
def delete_report(
    cycle_id: int,
    report_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    user = _ivf_user(request)
    hospital_id = _hospital_id(request, db, user)
    svc = IvfCycleService(db)
    if not svc.get_cycle(cycle_id, hospital_id):
        raise HTTPException(status_code=404, detail="Cycle not found")
    file_url = svc.delete_report(report_id, cycle_id)
    if file_url is None:
        raise HTTPException(status_code=404, detail="Report not found")
    ivf_blob.delete_blob_by_url(file_url)
