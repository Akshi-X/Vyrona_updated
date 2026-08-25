# grading-service

Azure Functions (Python) service that grades IVF embryo images. One HTTP
endpoint kicks off a background job; a PyTorch pipeline segments the embryo
and grades it (Gardner grade, quality flags, AI score) in a single forward
pass, then writes the result straight into the same Postgres tables the main
`backend` service reads from.

## Request flow

```
POST /api/Analysis {"image_id": "<blob path or URL>"}
        │
        ▼
Analysis/__init__.py
  1. create_job()            → INSERT ml_jobs (status='pending')
  2. threading.Thread(run_job, daemon=True).start()   — fire and forget
  3. returns {"job_id": N} immediately (HTTP 202)
        │
        ▼  (continues after the response, in-process)
shared/job_handler.py: run_job()
  1. _claim_job()            → status='running'
  2. grade-mutex check       → bail if another live job already targets this grade_id
  3. download the image      (shared/storage.py, Azure Blob)
  4. ml_models.analyse()     → segmentation + grading, one forward pass
  5. upload overlay PNGs     (exp/icm/te/annotated)
  6. write the result        → UPDATE ivf_oocyte_grade / ivf_oocyte_image
  7. status='completed'
        │
        ▼  (throughout, not just at the end)
shared/redis_client.py: publish_job_event()
  → ml:job:{job_id} channel — progress/completion events for anyone still
    listening (e.g. the frontend's SSE stream). Nothing downstream depends
    on a listener being attached; the DB write in step 6 already happened.
```

The caller gets a `job_id` back in well under a second; everything from
"claim" onward runs on a background thread the HTTP response doesn't wait
for. A client can reconnect to `ml:job:{job_id}` at any point to pick up
progress, or just poll `ml_jobs` directly — nothing about correctness depends
on a live connection.

## Job coordination — no held locks

An earlier version of this service used a Postgres advisory lock held for a
job's entire lifetime, for both liveness tracking and a per-grade mutex. That
capped real concurrency at the connection pool's size (`pool_size=2,
max_overflow=5` in `shared/database.py` — 7 total) — a burst of concurrent
jobs exhausted the pool and failed outright instead of queuing behind it.

The current design (`shared/job_handler.py`) never holds a connection open
across the slow parts of a job (blob download, `ml_models.analyse()`). Every
DB touch is its own short session: claim, emit-progress, grade-mutex check,
save-result. Liveness and mutual exclusion are both plain committed row data
instead of a live lock:

- **Liveness** — a job counts as alive as long as `ml_jobs.updated_at` keeps
  moving while `status='running'`. Every stage but the model call bumps it
  naturally by touching the DB; that one stage (which can legitimately run
  from ~20s solo to minutes under concurrency) gets a dedicated heartbeat
  thread ticking every `HEARTBEAT_INTERVAL_SECONDS` (20s) so a genuinely-alive
  job never looks abandoned. `recover_incomplete_jobs()` only reclaims a
  `running` row once it's been stale for `STALE_RUNNING_MINUTES` (2 min) —
  comfortable margin over a few missed heartbeats, not over inference
  duration.
- **Graceful shutdown fast path** — SIGTERM/SIGINT/`atexit` flip this
  process's own in-flight jobs straight back to `pending` before exit, so the
  next startup's recovery sweep reclaims them immediately instead of waiting
  out the staleness window. A hard kill (`SIGKILL`, crash, power loss) can't
  run this — the heartbeat/staleness check above is what actually covers
  that case, and is what's verified to work by killing the process outright.
- **Grade mutex** — one quick `SELECT` for any other non-stale `running` job
  already targeting the same `grade_id`, back off if found. Best-effort, not
  atomic (a narrow race is possible if two jobs for the same grade start in
  the same instant) — acceptable since the worst outcome is a harmless
  last-write-wins on a grade both jobs compute near-identical results for.
- **Recovery on startup** — `start_recovery_once()` runs once per process
  (daemon thread, called both at module import and defensively inside the
  HTTP handler in case the DB wasn't reachable yet at import time). It
  reclaims up to `RECOVERY_BATCH_LIMIT` (25) stale/pending jobs and reruns
  each one **sequentially** — inference is CPU-bound, so recovery doesn't try
  to parallelize itself on top of whatever's already running.

## Concurrency limits

Nothing upstream of `ml_models.analyse()` caps how many requests can be
in flight — `Analysis/__init__.py` fires a brand new unbounded thread per
HTTP request. The actual cap is `_INFERENCE_SEMAPHORE` in `job_handler.py`,
sized by `config.ML_MAX_CONCURRENT_INFERENCE` (default **2**), wrapped
around the `ml_models.analyse()` call only — a job waiting for a slot stays
`running` with its heartbeat still ticking, so a long queue wait is never
mistaken for abandonment.

`ml_models.py` also caps PyTorch's own intra-op thread pool
(`torch.set_num_threads(cores // ML_MAX_CONCURRENT_INFERENCE)`), so the
concurrent slots the semaphore allows don't each also grab every core for
themselves. **Both numbers have to move together** — capping concurrency
without capping per-call threads still oversubscribes the CPU; capping
per-call threads too aggressively relative to concurrency instead **starves**
individual jobs (measured: 4 slots × 2 threads made each call take ~150s vs.
a ~21s solo baseline — ScoreCAM/EigenCAM need real width). 2 slots × 5
threads (on a 10-core box) matched the solo baseline and cleared a 20-job
concurrent batch cleanly in ~394s with zero failures. Re-verify with a live
test after changing this on a different box — see `others/commands.md`.

## The ML pipeline (`shared/ml_models.py`)

`analyse(image_bytes) -> dict` is the whole pipeline in one call:

1. Decode + resize to `IMG_SIZE` (384).
2. Segmentation model → per-pixel class map (background / zona pellucida /
   trophectoderm / blastocoel / ICM) + confidence.
3. `detect_embryo()` — structural sanity check on the segmentation output
   (area bounds, blob-share, circularity, confidence — all tunable via
   `DETECT_*` config). The model was never trained to reject non-embryo
   images, so this is a heuristic gate, not a learned one. If it fails,
   `analyse()` returns `{"detection": {...}, "grading": None, "images": {}}`
   and the job is marked `failed` with a `no_embryo` code rather than
   silently grading garbage.
4. Grading model (image + engineered features + the three segmentation
   masks) → expansion / ICM / TE class + confidence for each.
5. ScoreCAM (expansion) / EigenCAM (ICM, TE) → visual overlay PNGs
   explaining each prediction.
6. Derived fields: Gardner grade string, hatching/zona/blastocoel
   descriptions, AI score (0-100, later rescaled to 0-10 when saved),
   prognosis lookup.

Both models are lazily loaded once per process (`get_models()`,
`_models_cache`) — safe to call on every request. There's also a
**single-slot** result memoization keyed on the image's sha256 digest
(`_last`): a repeat call with byte-identical input is free. It's not a
general cache — only the single most-recently-completed result is kept — so
it essentially never triggers on a genuine concurrent burst of distinct
requests, but *can* produce a misleadingly instant completion if a test
happens to reuse the same image bytes right after a prior call finished.
Don't read a suspiciously fast completion at face value; check which stage
actually took the time.

## Config (`config.py`)

Pydantic `BaseSettings`, loaded from environment variables (`local.settings.json`
→ `Values` locally, Azure Function App Settings / Key Vault in prod). See the
file for the full list and defaults; the ones worth knowing:

| Var | Purpose |
|---|---|
| `DB_USER`/`DB_PASSWORD`/`DB_HOST`/`DB_PORT`/`DB_NAME` | Required. Same Postgres the `backend` service uses — this service writes straight into `ivf_oocyte_grade`/`ivf_oocyte_image`. |
| `AZURE_STORAGE_CONNECTION_STRING` | Required. Blob storage for both reading the uploaded image and writing overlay PNGs. |
| `REDIS_*` | Progress/completion pub-sub. Not required for correctness — `publish_job_event` is best-effort. |
| `ML_MAX_CONCURRENT_INFERENCE` | See Concurrency limits above. |
| `DETECT_*` | Embryo-detection heuristic thresholds. |

## Local development

```bash
# host must run with the project's .venv Python on PATH, or it silently
# falls back to system Python (missing torch/pydantic_settings/etc — every
# request 500s with ModuleNotFoundError)
nohup env PATH="$PWD/.venv/bin:$PATH" npx func start --verbose > /tmp/func_start.log 2>&1 &

curl -s -X POST http://localhost:7071/api/Analysis \
  -H "Content-Type: application/json" \
  -d '{"image_id": "ivf/oocytes/16/202/upload_stresstest.webp"}'
```

Requires: Postgres, Redis (or a reachable Azure Redis instance), and a blob
store — Azurite (`UseDevelopmentStorage=true`) works locally.

`test_grading_driver.py` runs the pipeline standalone on a single local
image file (no DB/queue involved), useful for iterating on the model code:
```bash
.venv/bin/python3 test_grading_driver.py path/to/image.jpg
```

## Load-test tooling and operational notes

`others/` holds ad-hoc concurrency-test scripts, generated CSVs/HTML, and
`others/commands.md` — start there for how to run a live concurrency test,
useful DB queries, and the full tuning history behind
`ML_MAX_CONCURRENT_INFERENCE`.

## Deployment

See `DEPLOYMENT.md` — Azure resource layout (dev/prod), provisioning
commands, Flex Consumption hosting config.
