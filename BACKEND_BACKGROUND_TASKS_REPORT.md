# Backend Background Tasks Report

Generated: summary of background processes in the backend (mG-SCALE/backend)

This report enumerates background/async processing patterns in the backend, groups them by type, shows counts for each category, and lists the primary locations (file + function) where they are implemented. Use this as a quick audit of how background work is implemented today and where to look if you want to modify behavior, add graceful shutdown, or replace one-off threads with a centralized worker.

## Top-level counts (by category)
- Long-running asyncio background loops (scheduled listeners / schedulers / periodic loggers): 6
- Fire-and-forget `asyncio.create_task` usages (non-blocking work started from request/startup): 8
- `threading.Thread` usages (daemon threads started for background work): 3
- FastAPI `BackgroundTasks.add_task` usages (per-request deferred jobs): 2
- Uses of `run_in_executor` to wrap blocking I/O in async loops: 3

---

## 1) Long-running asyncio background loops — count: 6

These are async functions that run a persistent loop (usually `while True`) and are intended to run for the lifetime of the application. They are typically started at application startup with `asyncio.create_task(...)`.

Primary locations:
- `app.service.quality_service.QualityService.redis_listener`  
  - Purpose: Redis pubsub listener that receives quality messages and broadcasts to WebSocket clients.  
  - Remarks: uses `run_in_executor` to call blocking `pubsub.get_message` in a threadpool and then `await connection_manager.broadcast(...)`. (Long-running loop.)
- `app.service.quality_service.QualityService.log_connections_periodically`  
  - Purpose: Periodically (every 30s) logs active WebSocket connection counts and some per-connection info. (Long-running loop.)
- `app.controller.IVF.ivf_quality_controller.ln2_redis_listener`  
  - Purpose: Redis listener for LN2 readings (IVF) — receives LN2 messages and broadcasts to LN2 WebSocket clients. (Long-running loop.)
- `app.controller.IVF.ivf_quality_controller.tank_kpi_redis_listener`  
  - Purpose: Redis listener for tank KPI messages — broadcasts to quality/kpi WebSocket managers and performs logging. (Long-running loop.)
- `app.utils.lane_risk_utils.schedule_daily_lpi_fetch`  
  - Purpose: Scheduled daily job to fetch World Bank LPI data at midnight UTC every day. (Long-running loop that sleeps until next midnight.)
- `app.utils.alert_reminder_scheduler.schedule_alert_reminders`  
  - Purpose: Hourly scheduler that sends reminder emails for unacknowledged alerts. (Long-running loop with 1-hour sleeps.)

Where started:
- These are started via `asyncio.create_task(...)` in the application startup function: `app.main.startup_event` (and also mirrored in `backend/main.py`).

---

## 2) Fire-and-forget `asyncio.create_task` usages — count: 8

These are usages of `asyncio.create_task(...)` to run work in the background without awaiting it. They fall into two groups: startup tasks (starting long-running loops) and request-scoped non-blocking broadcasts.

A. Startup (long-running tasks started at startup) — counted here as `create_task` usages:
- `quality_service.redis_listener(...)` — created in startup
- `quality_service.log_connections_periodically(...)` — created in startup
- `ivf_quality_controller.ln2_redis_listener()` — created in startup
- `ivf_quality_controller.tank_kpi_redis_listener()` — created in startup
- `schedule_daily_lpi_fetch()` — created in startup
- `schedule_alert_reminders()` — created in startup

B. Request-scoped fire-and-forget broadcasts (non-blocking):
- `app.controller.chat_controller.send_chat_message`  
  - Purpose: after storing a chat message, calls `asyncio.create_task(broadcast_new_message(...))` to broadcast to WebSocket clients without blocking the HTTP response.
- `app.controller.chat_controller.mark_patient_messages_as_read`  
  - Purpose: after marking messages as read, `asyncio.create_task(broadcast_unread_messages_update(...))` to update unread counts via WebSocket.
- `app.controller.chat_controller.mark_canister_messages_as_read`  
  - Same pattern as above for canister/tank messages.

Notes:
- Total `create_task` occurrences counted across startup and request code: 8 (startup tasks + chat-related broadcasts).
- Some tests also create short-lived tasks (test coverage). Tests use `asyncio.create_task` to exercise listeners.

---

## 3) `threading.Thread` usages — count: 3

Plain Python threads are used in a few places to offload synchronous/sometimes blocking work (notably email sending) using daemon threads:

- `app.service.IVF.critical_alert_service.check_and_create_alerts` (and related immediate alert email methods)
  - Purpose: starts a `threading.Thread(target=send_emails_background, daemon=True)` to send batches of alert emails in background so the main flow returns quickly.
  - There are at least two separate places in the critical alert flow where a background thread is started to send emails (one for batched/scheduled emails and one for immediate alert emails).
- `app.models.IVF.ivf_quality_log_model._trigger_tank_status_update_after_insert`  
  - Purpose: starts a tiny daemon thread to run `trigger_status_update_in_background` after insert trigger in the model (fires immediately after DB insert).

Remarks:
- These are classic blocking-work-in-thread approaches. Threads are daemonized (so they don't prevent process exit), but they are not coordinated with app shutdown—no graceful join is performed.

---

## 4) FastAPI `BackgroundTasks` usage (per-request) — count: 2 (add_task occurrences)

FastAPI `BackgroundTasks` is used to schedule work that should run after the HTTP response is sent (managed by FastAPI/Starlette).

Primary locations:
- `app.controller.feedback_controller.add_comment_endpoint` → uses a `BackgroundTasks` dependency and forwards it to the service layer.
- `app.controller.feedback_controller.update_feedback_status_endpoint` → same pattern.
- In the service layer: `app.service.feedback_service.add_comment` and `...update_feedback_status` use `background_tasks.add_task(...)` to queue email-sending functions such as `send_feedback_new_comment_email` and `send_feedback_status_update_email`.

Count notes:
- The report counts the primary `add_task` usage sites in the feedback service as 2 (one for new comment notifications and one for status update notifications).
- These are per-request background jobs managed by the framework (they run after response); they do not persist across process restarts.

---

## 5) `run_in_executor` usages — count: 3

To integrate blocking Redis pubsub client calls (`pubsub.get_message`) in async loops, the code uses `loop.run_in_executor(None, lambda: pubsub.get_message(...))` in multiple listeners:
- `app.service.quality_service.redis_listener` — uses `run_in_executor` to call `pubsub.get_message`.
- `app.controller.IVF.ivf_quality_controller.ln2_redis_listener` — uses `run_in_executor`.
- `app.controller.IVF.ivf_quality_controller.tank_kpi_redis_listener` — uses `run_in_executor`.

This pattern avoids blocking the event loop while waiting for messages from a blocking Redis client.

---

## 6) Where these background processors are started

- Application startup (single place): `app.main.startup_event` — starts the main async listeners, schedulers, and loggers with `asyncio.create_task(...)` and creates the `QualityService` instance used by those tasks.
- Web request handlers: `chat_controller` uses `asyncio.create_task` to broadcast messages and unread-count updates without blocking HTTP responses.
- Model-level code: certain ORM/model hooks spawn daemon threads for follow-up behavior.
- Feedback endpoints: `BackgroundTasks` are injected by FastAPI into the request and used to add email tasks.

---

## 7) Potential issues and upgrade notes (recommendations)

1. Graceful shutdown: many background loops are fire-and-forget with no shutdown coordination. Consider:
   - Tracking created tasks (keep references) so they can be canceled on shutdown.
   - Using FastAPI lifespan events (startup/shutdown) to register tasks and cancel them gracefully.

2. Replace ad-hoc threads for critical work with a consistent pattern:
   - If email sending must be reliable and survive restarts, consider a durable job queue (e.g., Redis queue + worker, RQ, Celery, or a simple DB-backed job table + worker).
   - If emails are simple and stateless, using an async mail client or running them in an executor via a managed task queue could be cleaner.

3. Centralize scheduling:
   - The code uses multiple custom scheduler loops. Consider a single scheduler service or a library (APScheduler or dedicated background worker processes), depending on scalability needs.

4. Redis pubsub integration:
   - Current approach uses blocking Redis client with `run_in_executor`. If you move to an async Redis client (e.g., aioredis), you can simplify code and avoid threadpool usage.

5. Observability:
   - Add metrics (task counts, last-run timestamps, failures) for the long-running loops and thread-backed workers.
   - Ensure logging includes correlation IDs where appropriate for background email sending.

---

## 8) Quick actionable list (if you want me to proceed)
- Produce a file that lists exact line numbers for each background-task declaration (I can generate a precise list).
- Implement graceful shutdown hooks: track task objects started in `startup_event` and cancel them in a `shutdown` handler.
- Migrate ad-hoc threads to a simple in-process task runner or to an external worker queue (I can draft a migration plan).
- Replace blocking Redis pubsub + `run_in_executor` with an async Redis client (I can prepare a PR showing the code changes).

---

## 9) References — primary file locations to inspect
- `mG-SCALE/backend/app/main.py` — app startup where many background tasks are started
- `mG-SCALE/backend/app/service/quality_service.py` — quality Redis listener, connection logger
- `mG-SCALE/backend/app/controller/IVF/ivf_quality_controller.py` — LN2 and tank KPI listeners
- `mG-SCALE/backend/app/utils/alert_reminder_scheduler.py` — hourly alert reminder scheduler
- `mG-SCALE/backend/app/utils/lane_risk_utils.py` — daily LPI fetch scheduler
- `mG-SCALE/backend/app/controller/chat_controller.py` — request-scoped non-blocking broadcasts with `asyncio.create_task`
- `mG-SCALE/backend/app/service/IVF/critical_alert_service.py` — background threads for email sending
- `mG-SCALE/backend/app/service/feedback_service.py` — `background_tasks.add_task(...)` usage
- `mG-SCALE/backend/app/models/IVF/ivf_quality_log_model.py` — model-triggered background thread

---

If you want, I will:
- Produce a more detailed file that includes exact function signatures and line numbers for every background-task site (ready to be committed).
- Or I can open a PR to add graceful shutdown handling to the `startup_event` flow.
Which would you like me to do next?