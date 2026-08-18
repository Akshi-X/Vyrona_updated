"""
ML grading SSE bridge.

Triggers an analysis job on the grading-service (Azure Functions) and streams
its progress/completion to the client over Server-Sent Events by awaiting the
job's redis channel (ml:job:{job_id}). Segmentation and grading run together
as one job — see grading-service/shared/ml_models.py:analyse — so a single
trigger is enough for the image to end up fully graded even if nothing stays
connected to the stream.

Flow:
  1. POST the uploaded image id to the ML service -> {job_id}
  2. Subscribe to ml:job:{job_id}
  3. Stream each update to the client over SSE until 'complete'/'failed'
"""
import json
import logging
import time
from datetime import datetime, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import text

from app.config.config import settings
from app.config.database import SessionLocal
from app.utils.redis_async import get_pubsub_redis, job_channel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ivf/ml", tags=["IVF ML"])

_TERMINAL = ("completed", "failed")

# Inference is slow; give a job room to finish but never hold a stream forever.
STREAM_TIMEOUT_SECONDS = 15 * 60
HEARTBEAT_SECONDS = 10
# A job whose row has not moved for this long has lost its worker.
STALE_JOB_SECONDS = 5 * 60


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


def _read_job(job_id: int):
    """Current ml_jobs row, or None if the job is unknown."""
    with SessionLocal() as db:
        return db.execute(
            text("SELECT kind, status, progress, output, error, updated_at "
                 "FROM ml_jobs WHERE job_id = :id"),
            {"id": job_id},
        ).one_or_none()


def _terminal_event(row) -> Optional[dict]:
    """Terminal event for a finished job, else None."""
    if row is None or row.status not in _TERMINAL:
        return None
    if row.status == "completed":
        return {"status": "complete", "progress": 100, "output": row.output}
    event = {"status": "failed", "error": row.error}
    detection = row.output.get("detection") if isinstance(row.output, dict) else None
    if detection is not None:
        event["code"] = "no_embryo"
        event["detection"] = detection
    return event


def _read_terminal_state(job_id: int) -> Optional[dict]:
    """Terminal event if the job already finished, else None.

    Closes the race where the job completes between creation and our subscribe.
    """
    return _terminal_event(_read_job(job_id))


async def _trigger_job(image_id: str) -> int:
    """Call the grading-service Analysis function and return the job id."""
    headers = {}
    if settings.GRADING_SERVICE_KEY:
        headers["x-functions-key"] = settings.GRADING_SERVICE_KEY
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{settings.GRADING_SERVICE_URL}/api/Analysis",
            json={"image_id": image_id},
            headers=headers,
        )
        resp.raise_for_status()
        return int(resp.json()["job_id"])


async def _watch_job(job_id: int):
    """Follow a job's redis channel, yielding SSE frames until it finishes."""
    pubsub = get_pubsub_redis().pubsub()
    await pubsub.subscribe(job_channel(job_id))
    try:
        # Catch a job that already finished before we subscribed.
        terminal = _read_terminal_state(job_id)
        if terminal is not None:
            yield _sse(terminal)
            return

        deadline = time.monotonic() + STREAM_TIMEOUT_SECONDS
        while True:
            if time.monotonic() > deadline:
                logger.warning(f"ML job {job_id} stream timed out after {STREAM_TIMEOUT_SECONDS}s")
                yield _sse({"status": "failed", "error": "Timed out waiting for the ML job"})
                return

            message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=HEARTBEAT_SECONDS)
            if message is None:
                # Inference can run for minutes with nothing to report; the
                # comment keeps the connection alive through proxies.
                yield ": keepalive\n\n"
                # The publisher may have died without publishing a terminal event.
                terminal = _read_terminal_state(job_id)
                if terminal is not None:
                    yield _sse(terminal)
                    return
                continue

            data = message["data"]
            yield f"data: {data}\n\n"
            try:
                if json.loads(data).get("status") in ("complete", "failed"):
                    return
            except (ValueError, TypeError):
                continue
    finally:
        await pubsub.unsubscribe(job_channel(job_id))
        await pubsub.aclose()


async def _stream(image_id: str):
    """Trigger a new job, then follow it."""
    try:
        job_id = await _trigger_job(image_id)
    except Exception as e:
        logger.error(f"Failed to trigger analysis job: {e}", exc_info=True)
        yield _sse({"status": "failed", "error": "Failed to start ML job"})
        return

    yield _sse({"status": "queued", "job_id": job_id})
    async for frame in _watch_job(job_id):
        yield frame


async def _attach(job_id: int, row):
    """Follow a job that is already running, seeding the client with its state."""
    yield _sse({
        "status": "running" if row.status == "running" else "queued",
        "job_id": job_id,
        "kind": row.kind,
        "progress": row.progress,
    })

    terminal = _terminal_event(row)
    if terminal is not None:
        yield _sse(terminal)
        return

    # A recycled worker leaves the row stuck mid-flight with no publisher; without
    # this the client would wait out the full stream deadline for nothing.
    age = (datetime.now(timezone.utc) - row.updated_at).total_seconds()
    if age > STALE_JOB_SECONDS:
        logger.warning(f"ML job {job_id} looks stalled ({age:.0f}s since last update)")
        yield _sse({"status": "failed", "error": "ML job stalled", "code": "stale"})
        return

    async for frame in _watch_job(job_id):
        yield frame


_SSE_HEADERS = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}


@router.get("/analysis/stream")
async def analysis_stream(image_id: str = Query(..., description="Blob path/id of the uploaded image")):
    return StreamingResponse(
        _stream(image_id),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )


@router.get("/jobs/{job_id}/stream")
async def job_stream(job_id: int):
    """Re-attach to an existing job — used when a client reconnects mid-run."""
    row = _read_job(job_id)
    if row is None:
        raise HTTPException(status_code=404, detail="ML job not found")
    return StreamingResponse(
        _attach(job_id, row),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )
