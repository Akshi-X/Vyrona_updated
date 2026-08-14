"""
Job executor + handler for ML analysis (segmentation + grading).

create_job() inserts an ml_jobs row and returns its id (called synchronously by
the HTTP executor). run_job() is the background worker fired in-process after the
executor responds; it runs the model, writes the result straight into the IVF
grade/image the job was triggered for, and publishes progress/completion on the
job's redis channel. Persistence does not depend on a caller staying attached —
by the time 'complete' is published, the grade is already saved.
"""
import json
import logging
import os
import sys
from pathlib import Path
from typing import Optional, Tuple

from sqlalchemy import text

sys.path.insert(0, str(Path(__file__).parent.parent))
from shared import ml_models, storage
from shared.database import get_engine, get_session
from shared.redis_client import publish_job_event

logger = logging.getLogger(__name__)


def create_job(kind: str, input_image_id: str) -> int:
    """Insert a pending ml_jobs row and return its job_id."""
    Session = get_session()
    with Session() as session:
        row = session.execute(
            text("""
                INSERT INTO ml_jobs (kind, input_image_id, status, progress)
                VALUES (:kind, :img, 'pending', 0)
                RETURNING job_id
            """),
            {"kind": kind, "img": input_image_id},
        ).one()
        session.commit()
        return int(row.job_id)


def _update_job(session, job_id: int, **fields) -> None:
    """Update ml_jobs columns for a job; always bumps updated_at."""
    sets = ", ".join(f"{k} = :{k}" for k in fields)
    fields["job_id"] = job_id
    session.execute(
        text(f"UPDATE ml_jobs SET {sets}, updated_at = now() WHERE job_id = :job_id"),
        fields,
    )


def _emit(session, job_id: int, progress: int) -> None:
    _update_job(session, job_id, progress=progress)
    session.commit()
    publish_job_event(job_id, {"status": "running", "progress": progress})


def _parse_grade_ref(input_image_id: str) -> Optional[Tuple[int, int]]:
    """
    Pull (cycle_id, grade_id) out of the uploaded image's blob path.

    Blob layout is a backend convention (see shared/storage.py docstring):
    ivf/oocytes/{cycle_id}/{grade_id}/{label}_{uuid}.ext
    """
    parts = storage.resolve_blob_path(input_image_id).split("/")
    if len(parts) < 4 or parts[0] != "ivf" or parts[1] != "oocytes":
        return None
    try:
        return int(parts[2]), int(parts[3])
    except ValueError:
        return None


def _save_result(session, cycle_id: int, grade_id: int, upload_image_id: str, output: dict) -> None:
    """Write the analysis result straight into the grade/image the job was run for."""
    session.execute(
        text("""
            UPDATE ivf_oocyte_image
            SET exp_img_url = :exp, te_img_url = :te, icm_img_url = :icm, annotated_img_url = :annotated
            WHERE grade_id = :grade_id AND cycle_id = :cycle_id AND upload_image_url = :upload_url
        """),
        {
            "exp": output.get("exp"), "te": output.get("te"), "icm": output.get("icm"),
            "annotated": output.get("annotated"),
            "grade_id": grade_id, "cycle_id": cycle_id, "upload_url": upload_image_id,
        },
    )
    ai_score = output.get("ai_score")
    session.execute(
        text("""
            UPDATE ivf_oocyte_grade
            SET grade = :grade, ai_score = :ai_score, hatching = :hatching,
                zona_pellucida = :zona_pellucida, blastocoel = :blastocoel,
                icm_inference = :icm_inference, te_inference = :te_inference,
                exp_inference = :exp_inference, updated_at = now()
            WHERE grade_id = :grade_id AND cycle_id = :cycle_id
        """),
        {
            "grade": output.get("grade"),
            # The model scores 0-100; the grade record is on a 0-10 scale.
            "ai_score": round(ai_score / 10, 1) if ai_score is not None else None,
            "hatching": output.get("hatching"),
            "zona_pellucida": output.get("zona_pellucida"),
            "blastocoel": output.get("blastocoel"),
            "icm_inference": output.get("icm_inference"),
            "te_inference": output.get("te_inference"),
            "exp_inference": output.get("exp_inference"),
            "grade_id": grade_id, "cycle_id": cycle_id,
        },
    )


def run_job(job_id: int) -> None:
    """
    Background handler. Runs the model for the job, stores outputs, marks the
    row completed, and publishes progress/completion on ml:job:{job_id}.
    """
    Session = get_session()
    try:
        with Session() as session:
            # Take a row lock so a job is only ever processed once.
            row = session.execute(
                text("SELECT job_id, kind, input_image_id, status FROM ml_jobs "
                     "WHERE job_id = :job_id FOR UPDATE"),
                {"job_id": job_id},
            ).one_or_none()
            if row is None:
                logger.error(f"run_job: job {job_id} not found")
                return
            if row.status not in ("pending",):
                logger.info(f"run_job: job {job_id} already {row.status}; skipping")
                return

            kind = row.kind
            input_image_id = row.input_image_id
            if kind != "analysis":
                raise ValueError(f"Unknown job kind: {kind}")
            _update_job(session, job_id, status="running")
            _emit(session, job_id, 10)

            image_bytes = storage.download_bytes(input_image_id)
            _emit(session, job_id, 50)

            # Segmentation overlays and the grade come from the same forward
            # pass — one job produces both, so the pipeline never depends on
            # a second trigger to finish grading an image.
            result = ml_models.analyse(image_bytes)
            _emit(session, job_id, 90)
            prefix = os.path.dirname(storage.resolve_blob_path(input_image_id)) or "ivf/oocytes"
            output = dict(result["grading"])
            for label, data in result["images"].items():
                blob_path = storage.make_blob_path(prefix, f"{label}.png", label)
                output[label] = storage.upload_bytes(data, blob_path, content_type="image/png")

            # Persist straight into the grade/image the job was run for, in the
            # same transaction as marking the job completed — the caller (if any)
            # doesn't need to do anything further for the result to be saved.
            ref = _parse_grade_ref(input_image_id)
            if ref is not None:
                _save_result(session, ref[0], ref[1], input_image_id, output)
            else:
                logger.warning(f"run_job: could not parse cycle/grade id from {input_image_id}; result not persisted")

            _update_job(session, job_id, status="completed", progress=100,
                        output=json.dumps(output))
            session.commit()
            publish_job_event(job_id, {"status": "complete", "progress": 100, "output": output})
            logger.info(f"run_job: job {job_id} ({kind}) completed")

    except Exception as e:
        logger.error(f"run_job: job {job_id} failed: {e}", exc_info=True)
        try:
            Session = get_session()
            with Session() as session:
                _update_job(session, job_id, status="failed", error=str(e))
                session.commit()
        except Exception as inner:
            logger.error(f"run_job: failed to mark job {job_id} failed: {inner}")
        publish_job_event(job_id, {"status": "failed", "error": str(e)})
