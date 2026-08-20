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
import threading
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Optional, Tuple

from sqlalchemy import text

sys.path.insert(0, str(Path(__file__).parent.parent))
from shared import ml_models, storage
from shared.database import ensure_ml_jobs_table_exists, get_engine, get_session
from shared.redis_client import publish_job_event

logger = logging.getLogger(__name__)

# Namespace for the advisory locks below, so they can never collide with an
# advisory lock taken by anything else against the same database.
ML_JOB_LOCK_NS = 4271

# Bound the work a cold start takes on before it serves its first request.
RECOVERY_BATCH_LIMIT = 25

# Whether a worker is alive and owns this job. Shared by the survey and the
# claim so the two can never disagree on what counts as abandoned.
_LOCK_HELD = """EXISTS (
    SELECT 1 FROM pg_locks l
    WHERE l.locktype = 'advisory' AND l.granted
      AND l.classid::bigint = :ns AND l.objid::bigint = j.job_id
)"""

_recovery_started = False
_recovery_lock = threading.Lock()


@contextmanager
def job_lock(job_id: int):
    """
    Hold a Postgres session advisory lock for as long as the job is worked on.

    Ownership has to survive the progress commits run_job() makes, which rules
    out a row lock — SELECT ... FOR UPDATE would be released at the first commit,
    leaving the rest of the run unprotected. It also has to disappear the moment
    the worker dies: the lock sits on its own connection, so if the process is
    killed the backend goes with it and Postgres drops the lock, which is what
    lets recovery tell an abandoned job from one another instance still owns.

    Yields True when the lock was taken, False when another worker holds it.
    """
    conn = get_engine().connect()
    acquired = False
    try:
        # The two-argument form is (int4, int4); job_id is a BIGSERIAL, so the
        # cast is explicit. Ids past 2^31 would collide — ~2bn jobs away.
        # CAST(), not ::int4 — text() does not read ":name" followed by a colon
        # as a bind parameter, and the placeholder reaches Postgres verbatim.
        acquired = bool(conn.execute(
            text("SELECT pg_try_advisory_lock(CAST(:ns AS int4), CAST(:id AS int4))"),
            {"ns": ML_JOB_LOCK_NS, "id": job_id},
        ).scalar())
        yield acquired
    finally:
        try:
            if acquired:
                conn.execute(
                    text("SELECT pg_advisory_unlock(CAST(:ns AS int4), CAST(:id AS int4))"),
                    {"ns": ML_JOB_LOCK_NS, "id": job_id},
                )
        except Exception as e:
            # Closing the connection releases it anyway.
            logger.warning(f"job_lock: unlock failed for job {job_id}: {e}")
        finally:
            conn.close()


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
            SET grade = :grade, ai_score = :ai_score, quality_flags = :quality_flags,
                icm_inference = :icm_inference, te_inference = :te_inference,
                exp_inference = :exp_inference, updated_at = now()
            WHERE grade_id = :grade_id AND cycle_id = :cycle_id
        """),
        {
            "grade": output.get("grade"),
            # The model scores 0-100; the grade record is on a 0-10 scale.
            "ai_score": round(ai_score / 10, 1) if ai_score is not None else None,
            # Model only ever produces these 3 quality-flag keys; the rest
            # (bridge, blackspot, early_blast) are manual-entry only and stay
            # absent until a human sets them via an override.
            "quality_flags": json.dumps({
                "hatching": output.get("hatching"),
                "zona_pellucida": output.get("zona_pellucida"),
                "blastocoel": output.get("blastocoel"),
            }),
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

    Held under an advisory lock for the whole run, so the row is never worked on
    by two workers at once and is freed for recovery the instant this one dies.
    """
    with job_lock(job_id) as acquired:
        if not acquired:
            logger.info(f"run_job: job {job_id} is locked by another worker; skipping")
            return
        _run_job_locked(job_id)


def _run_job_locked(job_id: int) -> None:
    Session = get_session()
    try:
        with Session() as session:
            row = session.execute(
                text("SELECT job_id, kind, input_image_id, status FROM ml_jobs "
                     "WHERE job_id = :job_id"),
                {"job_id": job_id},
            ).one_or_none()
            if row is None:
                logger.error(f"run_job: job {job_id} not found")
                return
            # 'running' is resumable: holding the advisory lock proves whoever
            # set it is gone, since the lock would still be held otherwise.
            if row.status not in ("pending", "running"):
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
            if result["grading"] is None:
                detection = result["detection"]
                message = "No embryo detected in this image"
                _update_job(session, job_id, status="failed", progress=100,
                            error=message, output=json.dumps({"detection": detection}))
                session.commit()
                publish_job_event(job_id, {
                    "status": "failed", "error": message,
                    "code": "no_embryo", "detection": detection,
                })
                logger.info(f"run_job: job {job_id} rejected — {detection['reasons']}")
                return
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


def survey_incomplete_jobs() -> list:
    """Unfinished jobs, each flagged with whether a live worker holds its lock."""
    Session = get_session()
    with Session() as session:
        return session.execute(
            text(f"""
                SELECT j.job_id, j.status, j.progress, j.updated_at, {_LOCK_HELD} AS locked
                FROM ml_jobs j
                WHERE j.status IN ('pending', 'running')
                ORDER BY j.created_at
            """),
            {"ns": ML_JOB_LOCK_NS},
        ).all()


def claim_incomplete_jobs(limit: int = RECOVERY_BATCH_LIMIT) -> list:
    """
    Requeue jobs a previous process left unfinished and return their ids.

    A job only exists in memory as the thread run_job() is executing in, so a
    host restart or a crash mid-inference strands the row: 'pending' rows were
    never picked up, 'running' rows died partway. Both are abandoned only if
    unlocked, so a job another instance is still working on is left alone.
    """
    Session = get_session()
    with Session() as session:
        rows = session.execute(
            text(f"""
                UPDATE ml_jobs SET status = 'pending', updated_at = now()
                WHERE job_id IN (
                    SELECT j.job_id FROM ml_jobs j
                    WHERE j.status IN ('pending', 'running')
                      AND NOT {_LOCK_HELD}
                    ORDER BY j.created_at
                    LIMIT :limit
                    FOR UPDATE SKIP LOCKED
                )
                RETURNING job_id
            """),
            {"limit": limit, "ns": ML_JOB_LOCK_NS},
        ).all()
        session.commit()
        job_ids = [int(r.job_id) for r in rows]
        if len(job_ids) == limit:
            logger.warning(f"recovery: hit the {limit}-job batch limit; "
                           "more may still be waiting for the next sweep")
        return job_ids


def _log_survey(rows: list) -> None:
    """Say what was found before anything is claimed, locked rows included —
    otherwise 'resuming 0 jobs' can't be told from 'another instance has them'."""
    logger.info(
        f"recovery: {len(rows)} unfinished job(s) — "
        f"pending={sum(1 for r in rows if r.status == 'pending')}, "
        f"running={sum(1 for r in rows if r.status == 'running')}, "
        f"held by a live worker={sum(1 for r in rows if r.locked)}"
    )
    for r in rows:
        state = "locked, another worker owns it" if r.locked else "abandoned, will resume"
        logger.info(f"recovery:   job {r.job_id} {r.status} progress={r.progress} "
                    f"last update {r.updated_at:%Y-%m-%d %H:%M:%S} ({state})")


def _log_outcome(job_ids: list, elapsed: float) -> None:
    try:
        Session = get_session()
        with Session() as session:
            counts = session.execute(
                text("SELECT status, count(*) AS n FROM ml_jobs "
                     "WHERE job_id = ANY(:ids) GROUP BY status"),
                {"ids": job_ids},
            ).all()
        summary = ", ".join(f"{r.status}={r.n}" for r in counts) or "no rows"
    except Exception as e:
        summary = f"unavailable ({e})"
    logger.info(f"recovery: finished {len(job_ids)} job(s) in {elapsed:.1f}s — {summary}")


def recover_incomplete_jobs() -> None:
    """Resume what a previous process left behind. Sequential: inference is CPU-bound."""
    global _recovery_started
    try:
        ensure_ml_jobs_table_exists()
        _log_survey(survey_incomplete_jobs())
        job_ids = claim_incomplete_jobs()
    except Exception as e:
        # Usually the database isn't up yet at container start; let the next
        # request retry the sweep rather than skipping recovery for this process.
        logger.error(f"recovery: could not claim jobs: {e}", exc_info=True)
        with _recovery_lock:
            _recovery_started = False
        return

    if not job_ids:
        logger.info("recovery: nothing to resume")
        return

    logger.info(f"recovery: resuming {len(job_ids)} job(s): {job_ids}")
    started = time.monotonic()
    for i, job_id in enumerate(job_ids, start=1):
        logger.info(f"recovery: [{i}/{len(job_ids)}] running job {job_id}")
        run_job(job_id)  # marks the row failed on error; never raises
    _log_outcome(job_ids, time.monotonic() - started)


def start_recovery_once() -> None:
    """
    Kick off recovery in the background, at most once per process.

    Called as the service starts; it must never block or break startup, so the
    sweep runs on a daemon thread and every failure is logged and dropped.
    """
    global _recovery_started
    with _recovery_lock:
        if _recovery_started:
            return
        _recovery_started = True
    threading.Thread(target=recover_incomplete_jobs, name="ml-job-recovery", daemon=True).start()
