"""
Analysis job executor (HTTP trigger).

1. Receives a call to analyse with the id of the uploaded image in storage.
2. Creates a row in ml_jobs and responds with the job id.
3. Fires the analysis handler in-process (it continues after this response);
   each update is published to the ml:job:{job_id} redis channel until complete.

One job runs segmentation and grading together (they come from the same model
forward pass — see shared/ml_models.py:analyse) so triggering this once is
enough for the image to end up fully graded, whether or not anything is still
listening to the stream.
"""
import json
import logging
import sys
import threading
from pathlib import Path

import azure.functions as func

sys.path.insert(0, str(Path(__file__).parent.parent))
from config import config
from shared.database import ensure_ml_jobs_table_exists
from shared.job_handler import create_job, run_job

logger = logging.getLogger(__name__)


def main(req: func.HttpRequest) -> func.HttpResponse:
    if not config.validate():
        return func.HttpResponse("Service configuration error", status_code=500)

    try:
        body = req.get_json()
    except ValueError:
        return func.HttpResponse("Invalid JSON", status_code=400)

    input_image_id = body.get("image_id") or body.get("input_image_id")
    if not input_image_id:
        return func.HttpResponse("Missing image_id", status_code=400)

    try:
        ensure_ml_jobs_table_exists()
        job_id = create_job("analysis", input_image_id)
    except Exception as e:
        logger.error(f"Failed to create analysis job: {e}", exc_info=True)
        return func.HttpResponse("Failed to create job", status_code=500)

    # Fire-and-forget: the handler runs in a background thread and continues
    # after this HTTP response returns the job id.
    threading.Thread(target=run_job, args=(job_id,), daemon=True).start()

    return func.HttpResponse(
        json.dumps({"job_id": job_id}),
        status_code=202,
        mimetype="application/json",
    )
