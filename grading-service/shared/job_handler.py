"""
Job executor + handler for ML analysis (segmentation + grading).

create_job() inserts an ml_jobs row and returns its id (called synchronously by
the HTTP executor). run_job() is the background worker fired in-process after the
executor responds; it runs the model, writes the result straight into the IVF
grade/image the job was triggered for, and publishes progress/completion on the
job's redis channel. Persistence does not depend on a caller staying attached —
by the time 'complete' is published, the grade is already saved.

Connection lifetime: no connection is ever held open across the slow parts of a
job (blob download, ml_models.analyse()). Every DB touch — claiming the job,
emitting progress, the grade-mutex check, saving the result — opens a session,
does one short statement, commits, and closes immediately. This is deliberate:
an earlier version of this module held one Postgres advisory-lock connection
open for a job's entire life (used for both liveness tracking and a per-grade
mutex), which capped real concurrency at exactly the connection pool's size —
a burst of concurrent jobs measurably exhausted the pool and failed outright
rather than queuing behind it.

Liveness and mutual exclusion are both handled with plain committed row data
instead of a live lock, matching the pattern telemetry-service already uses
(shared/idempotency.py's unique-constraint insert) rather than reintroducing
a connection-bound primitive:

- Liveness: a job is "alive" as long as ml_jobs.updated_at keeps moving while
  status='running'. Every stage but ml_models.analyse() bumps it naturally by
  touching the DB; that one stage gets a dedicated heartbeat thread (see
  _heartbeat) ticking every HEARTBEAT_INTERVAL_SECONDS so a real job's
  updated_at never goes stale no matter how long inference itself takes —
  observed anywhere from ~22s solo to 70+ minutes under severe concurrency.
  Recovery (see recover_incomplete_jobs) only reclaims a 'running' row once
  it's gone stale for STALE_RUNNING_MINUTES, which only needs margin over a
  few missed heartbeats now, not over inference duration. This trades instant
  crash detection (what a held advisory-lock connection gave for free) for
  the ability to run far more concurrent jobs than the connection pool has
  slots — the right trade for a batch ML workload, and the heartbeat keeps
  that trade from costing minutes of stale-looking-but-fine jobs.

  A graceful stop (Ctrl+C / SIGTERM) skips the staleness wait entirely: see
  _release_active_jobs, installed via _install_shutdown_handler at import
  time. It flips this process's own in-flight jobs straight back to
  'pending' before exiting, so the very next startup's recovery sweep
  reclaims them immediately. A hard kill (SIGKILL, crash, power loss) can't
  run this — the staleness check above is what actually covers that case.

- Grade mutex: before starting real work, a job does one quick SELECT for any
  other non-stale 'running' job already targeting the same grade_id, and
  backs off if it finds one. This is best-effort, not atomic (a narrow race
  is possible if two jobs for the same grade start within the same instant) —
  acceptable here since two jobs colliding on the same grade_id is a rare
  edge case in practice, and the worst outcome is a harmless last-write-wins
  on a grade both jobs are computing near-identical results for anyway.
"""
import atexit
import json
import logging
import os
import signal
import sys
import threading
import time
from contextlib import contextmanager as _contextmanager
from pathlib import Path
from typing import Optional, Tuple

from sqlalchemy import text

sys.path.insert(0, str(Path(__file__).parent.parent))
from config import config
from shared import ml_models, storage
from shared.database import ensure_ml_jobs_table_exists, get_session
from shared.redis_client import publish_job_event

logger = logging.getLogger(__name__)

# Bound the work a cold start takes on before it serves its first request.
RECOVERY_BATCH_LIMIT = 25

# Analysis/__init__.py fires an unbounded thread per HTTP request, so nothing
# upstream limits how many ml_models.analyse() calls could start at once. This
# is the actual cap — everything past it just waits its turn (heartbeat keeps
# ticking while it does, so a long wait never looks stale).
_INFERENCE_SEMAPHORE = threading.Semaphore(max(1, config.ML_MAX_CONCURRENT_INFERENCE))

# How often the heartbeat thread bumps updated_at while ml_models.analyse()
# runs — the one stage long enough, and DB-free enough, to otherwise look
# abandoned. Comfortably below STALE_RUNNING_MINUTES so a genuinely-alive job
# never gets close to going stale, no matter how long inference itself takes.
HEARTBEAT_INTERVAL_SECONDS = 20

# A 'running' row untouched for this long is assumed abandoned (crashed
# worker, killed process) rather than genuinely still in progress. The
# heartbeat above keeps a real job's updated_at moving every 20s throughout
# ml_models.analyse() regardless of how long that call takes, so this only
# needs margin over a few missed heartbeats — not over inference duration —
# see the module docstring for the liveness design.
STALE_RUNNING_MINUTES = 2

_STALE_CUTOFF_SQL = "updated_at < now() - make_interval(mins => :stale_minutes)"

_recovery_started = False
_recovery_lock = threading.Lock()

# job_ids this process currently has 'running' in a background thread. Used
# only for a graceful-stop fast path (see _release_active_jobs) — the
# heartbeat/staleness mechanism above is what actually guarantees recovery;
# this just avoids waiting out STALE_RUNNING_MINUTES on a clean shutdown.
_active_job_ids = set()
_active_jobs_lock = threading.Lock()


def _mark_active(job_id: int) -> None:
    with _active_jobs_lock:
        _active_job_ids.add(job_id)


def _mark_inactive(job_id: int) -> None:
    with _active_jobs_lock:
        _active_job_ids.discard(job_id)


def _release_active_jobs() -> None:
    """Best-effort, called on a graceful stop (Ctrl+C / SIGTERM): flip this
    process's in-flight jobs straight back to 'pending' so the next startup's
    recovery sweep reclaims them immediately instead of waiting out
    STALE_RUNNING_MINUTES. Cannot help with a hard kill (SIGKILL, crash, power
    loss) — no code runs after those, which is exactly why the heartbeat-based
    staleness check above has to remain the real guarantee, not this."""
    with _active_jobs_lock:
        job_ids = list(_active_job_ids)
    if not job_ids:
        return
    try:
        Session = get_session()
        with Session() as session:
            session.execute(
                text("UPDATE ml_jobs SET status = 'pending', updated_at = now() "
                     "WHERE job_id = ANY(:ids) AND status = 'running'"),
                {"ids": job_ids},
            )
            session.commit()
        logger.info(f"shutdown: released {len(job_ids)} in-flight job(s) back to pending: {job_ids}")
    except Exception as e:
        logger.error(f"shutdown: failed to release in-flight jobs: {e}")


def _install_shutdown_handler() -> None:
    atexit.register(_release_active_jobs)

    def _handler(signum, frame):
        _release_active_jobs()
        # Restore the default handler and re-signal ourselves so the process
        # still actually terminates the normal way — this hook only wants to
        # run cleanup first, not replace the host's own shutdown behavior.
        signal.signal(signum, signal.SIG_DFL)
        os.kill(os.getpid(), signum)

    for sig in (signal.SIGTERM, signal.SIGINT):
        try:
            signal.signal(sig, _handler)
        except (ValueError, OSError):
            pass  # not the main thread, or platform doesn't support it


_install_shutdown_handler()


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
    """Update ml_jobs columns for a job; always bumps updated_at — the
    heartbeat every liveness/staleness check downstream relies on."""
    sets = ", ".join(f"{k} = :{k}" for k in fields)
    fields["job_id"] = job_id
    session.execute(
        text(f"UPDATE ml_jobs SET {sets}, updated_at = now() WHERE job_id = :job_id"),
        fields,
    )


def _finish_job(job_id: int, **fields) -> None:
    """Short, standalone transaction — update ml_jobs and commit immediately."""
    Session = get_session()
    with Session() as session:
        _update_job(session, job_id, **fields)
        session.commit()


def _emit_progress(job_id: int, progress: int) -> None:
    """Short, standalone transaction so progress updates never hold a
    connection open between calls, and double as the liveness heartbeat."""
    _finish_job(job_id, progress=progress)
    publish_job_event(job_id, {"status": "running", "progress": progress})


def _claim_job(job_id: int) -> Optional[Tuple[str, str]]:
    """
    Short transaction: read the job and flip it to 'running'. Returns
    (kind, input_image_id), or None if the row doesn't exist or isn't
    claimable (already completed/failed elsewhere). The connection is held
    only for this one statement plus the commit — never across ML inference.
    """
    Session = get_session()
    with Session() as session:
        row = session.execute(
            text("SELECT kind, input_image_id, status FROM ml_jobs "
                 "WHERE job_id = :job_id FOR UPDATE SKIP LOCKED"),
            {"job_id": job_id},
        ).one_or_none()
        if row is None:
            return None
        if row.status not in ("pending", "running"):
            logger.info(f"run_job: job {job_id} already {row.status}; skipping")
            return None
        _update_job(session, job_id, status="running")
        session.commit()
        return row.kind, row.input_image_id


def _heartbeat_tick(job_id: int) -> None:
    """Cheap standalone UPDATE that only bumps updated_at — no status change,
    just proof of life. Own short session, never held between ticks."""
    Session = get_session()
    with Session() as session:
        session.execute(
            text("UPDATE ml_jobs SET updated_at = now() WHERE job_id = :job_id"),
            {"job_id": job_id},
        )
        session.commit()


@_contextmanager
def _heartbeat(job_id: int):
    """Keep updated_at moving on a background thread for the duration of the
    wrapped block. Exists for ml_models.analyse(): it can legitimately run
    long under heavy concurrency (minutes, not seconds) with no DB touch of
    its own, which would otherwise make a genuinely-alive job look stale and
    abandoned to recover_incomplete_jobs()."""
    stop = threading.Event()

    def _loop():
        while not stop.wait(HEARTBEAT_INTERVAL_SECONDS):
            try:
                _heartbeat_tick(job_id)
            except Exception as e:
                logger.warning(f"heartbeat: job {job_id} tick failed: {e}")

    t = threading.Thread(target=_loop, name=f"ml-heartbeat-{job_id}", daemon=True)
    t.start()
    try:
        yield
    finally:
        stop.set()
        t.join(timeout=2)


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


def _grade_already_in_progress(grade_id: int, this_job_id: int) -> bool:
    """
    Best-effort mutex: true if some other live (non-stale) 'running' job is
    already targeting this grade_id. One short SELECT, no held connection —
    see the module docstring for why this is best-effort rather than atomic.
    """
    Session = get_session()
    with Session() as session:
        rows = session.execute(
            text(f"""
                SELECT input_image_id FROM ml_jobs
                WHERE status = 'running' AND job_id != :job_id
                  AND NOT ({_STALE_CUTOFF_SQL})
            """),
            {"job_id": this_job_id, "stale_minutes": STALE_RUNNING_MINUTES},
        ).all()
    for row in rows:
        ref = _parse_grade_ref(row.input_image_id)
        if ref is not None and ref[1] == grade_id:
            return True
    return False


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


def _run_analysis(job_id: int, kind: str, input_image_id: str) -> None:
    """Run the model and persist its result. No DB connection is held open
    across the ml_models.analyse() call — only the short emit/save transactions
    around it."""
    _emit_progress(job_id, 10)

    image_bytes = storage.download_bytes(input_image_id)
    _emit_progress(job_id, 50)

    # Segmentation overlays and the grade come from the same forward pass —
    # one job produces both, so the pipeline never depends on a second
    # trigger to finish grading an image.
    with _heartbeat(job_id), _INFERENCE_SEMAPHORE:
        result = ml_models.analyse(image_bytes)
    if result["grading"] is None:
        detection = result["detection"]
        message = "No embryo detected in this image"
        _finish_job(job_id, status="failed", progress=100, error=message,
                    output=json.dumps({"detection": detection}))
        publish_job_event(job_id, {
            "status": "failed", "error": message,
            "code": "no_embryo", "detection": detection,
        })
        logger.info(f"run_job: job {job_id} rejected — {detection['reasons']}")
        return

    _emit_progress(job_id, 90)
    prefix = os.path.dirname(storage.resolve_blob_path(input_image_id)) or "ivf/oocytes"
    output = dict(result["grading"])
    for label, data in result["images"].items():
        blob_path = storage.make_blob_path(prefix, f"{label}.png", label)
        output[label] = storage.upload_bytes(data, blob_path, content_type="image/png")

    # Persist straight into the grade/image the job was run for, in the same
    # short transaction as marking the job completed — the caller (if any)
    # doesn't need to do anything further for the result to be saved.
    Session = get_session()
    with Session() as session:
        ref = _parse_grade_ref(input_image_id)
        if ref is not None:
            _save_result(session, ref[0], ref[1], input_image_id, output)
        else:
            logger.warning(f"run_job: could not parse cycle/grade id from {input_image_id}; result not persisted")
        _update_job(session, job_id, status="completed", progress=100, output=json.dumps(output))
        session.commit()

    publish_job_event(job_id, {"status": "complete", "progress": 100, "output": output})
    logger.info(f"run_job: job {job_id} ({kind}) completed")


def run_job(job_id: int) -> None:
    """
    Background handler. Runs the model for the job, stores outputs, marks the
    row completed, and publishes progress/completion on ml:job:{job_id}.

    Everything from claiming the row through running the model is inside one
    try/except, so a failure anywhere marks the job failed instead of silently
    killing this background thread and leaving the row stuck 'pending' forever.
    """
    try:
        claimed = _claim_job(job_id)
        if claimed is None:
            return
        _mark_active(job_id)
        kind, input_image_id = claimed
        if kind != "analysis":
            raise ValueError(f"Unknown job kind: {kind}")

        ref = _parse_grade_ref(input_image_id)
        grade_id = ref[1] if ref else None

        if grade_id is not None and _grade_already_in_progress(grade_id, job_id):
            message = f"grade {grade_id} is already being processed by another job"
            logger.info(f"run_job: job {job_id} — {message}")
            _finish_job(job_id, status="failed", error=message)
            publish_job_event(job_id, {"status": "failed", "error": message})
            return

        _run_analysis(job_id, kind, input_image_id)

    except Exception as e:
        logger.error(f"run_job: job {job_id} failed: {e}", exc_info=True)
        try:
            _finish_job(job_id, status="failed", error=str(e))
        except Exception as inner:
            logger.error(f"run_job: failed to mark job {job_id} failed: {inner}")
        publish_job_event(job_id, {"status": "failed", "error": str(e)})
    finally:
        _mark_inactive(job_id)


def survey_incomplete_jobs() -> list:
    """Unfinished jobs, each flagged with whether they look stale (abandoned)
    or recently touched (a live worker is plausibly still on it)."""
    Session = get_session()
    with Session() as session:
        return session.execute(
            text(f"""
                SELECT job_id, status, progress, updated_at,
                       ({_STALE_CUTOFF_SQL}) AS stale
                FROM ml_jobs
                WHERE status IN ('pending', 'running')
                ORDER BY created_at
            """),
            {"stale_minutes": STALE_RUNNING_MINUTES},
        ).all()


def claim_incomplete_jobs(limit: int = RECOVERY_BATCH_LIMIT) -> list:
    """
    Requeue jobs a previous process left unfinished and return their ids.

    A job only exists in memory as the thread run_job() is executing in, so a
    host restart or a crash mid-inference strands the row: 'pending' rows were
    never picked up, 'running' rows died partway. A 'running' row only counts
    as abandoned once its updated_at heartbeat has gone stale for
    STALE_RUNNING_MINUTES — see the module docstring — so a job another
    instance is still genuinely working on is left alone.
    """
    Session = get_session()
    with Session() as session:
        rows = session.execute(
            text(f"""
                UPDATE ml_jobs SET status = 'pending', updated_at = now()
                WHERE job_id IN (
                    SELECT job_id FROM ml_jobs
                    WHERE status = 'pending'
                       OR (status = 'running' AND ({_STALE_CUTOFF_SQL}))
                    ORDER BY created_at
                    LIMIT :limit
                    FOR UPDATE SKIP LOCKED
                )
                RETURNING job_id
            """),
            {"limit": limit, "stale_minutes": STALE_RUNNING_MINUTES},
        ).all()
        session.commit()
        job_ids = [int(r.job_id) for r in rows]
        if len(job_ids) == limit:
            logger.warning(f"recovery: hit the {limit}-job batch limit; "
                           "more may still be waiting for the next sweep")
        return job_ids


def _log_survey(rows: list) -> None:
    """Say what was found before anything is claimed, so 'resuming 0 jobs'
    can't be confused with 'nothing was ever stuck'."""
    logger.info(
        f"recovery: {len(rows)} unfinished job(s) — "
        f"pending={sum(1 for r in rows if r.status == 'pending')}, "
        f"running={sum(1 for r in rows if r.status == 'running')}, "
        f"stale={sum(1 for r in rows if r.stale)}"
    )
    for r in rows:
        state = "stale, will resume" if (r.status != "running" or r.stale) else "recently touched, left alone"
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
