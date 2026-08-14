

tive connect,
in tank table add tive id
and setup alert config 

-------------------------------

tanks -
 empty_weight_kg(tank_min_capacity_reading should be sync) | full_weight_kg(tank_max_capacity_reading should be sync) | 

ln2_iot_device - 
 id | tank_id (SCHANGE) | device_id (SCHANGE) | tank_max_capacity_reading (SCHANGE)| tank_min_capacity_reading (SCHANGE)| closed_noise_margin_kg_per_h | open_rate_min_kg_per_h | refill_threshold_kg | window_minutes | window_min_points | consecutive_windows_for_state | spike_tolerance_kg | spike_max_duration_s | lid_weight_min_kg | lid_weight_max_kg | lid_confirm_stable_points | low_level_threshold_kg | low_level_consecutive_readings | canister_weight_kg | canister_tolerance_kg | product_change_max_kg | precaution_level_pct 



INSERT INTO devices (
    branch_id,
    device_code,
    created_at,
    updated_at
)
VALUES (
    26,                -- use correct branch_id
    'IOTISWT1',        -- update this too
    NOW(),
    NOW()
)
RETURNING id;


INSERT INTO ln2_iot_devices (
    tank_id,
    device_id,
    tank_max_capacity_reading,
    tank_min_capacity_reading,
    created_at,
    updated_at,
    closed_noise_margin_kg_per_h,
    open_rate_min_kg_per_h,
    refill_threshold_kg,
    window_minutes,
    window_min_points,
    consecutive_windows_for_state,
    spike_tolerance_kg,
    spike_max_duration_s,
    lid_weight_min_kg,
    lid_weight_max_kg,
    lid_confirm_stable_points,
    low_level_threshold_kg,
    low_level_consecutive_readings,
    canister_weight_kg,
    canister_tolerance_kg,
    product_change_max_kg,
    precaution_level_pct
)
SELECT
    94 AS tank_id,     -- update with latest
    13 AS device_id,   -- 👈 use returned ID here
    tank_max_capacity_reading,
    tank_min_capacity_reading,
    NOW(),
    NOW(),
    closed_noise_margin_kg_per_h,
    open_rate_min_kg_per_h,
    refill_threshold_kg,
    window_minutes,
    window_min_points,
    consecutive_windows_for_state,
    spike_tolerance_kg,
    spike_max_duration_s,
    lid_weight_min_kg,
    lid_weight_max_kg,
    lid_confirm_stable_points,
    low_level_threshold_kg,
    low_level_consecutive_readings,
    canister_weight_kg,
    canister_tolerance_kg,
    product_change_max_kg,
    precaution_level_pct
FROM ln2_iot_devices
WHERE tank_id = 60;
-------------------------------

to check live for iot
SELECT * FROM ln2_iot_raw_data WHERE payload->>'deviceid' = 'IOTYELDELT1' ORDER BY created_at DESC LIMIT 1;

to check live for tive
SELECT * FROM ivf_telemetry_data where device_id = 'K1131601' ORDER BY created_at DESC LIMIT 1;





Calibration Command

UPDATE tanks
SET 
    full_weight_kg = 64.0000,
    updated_at = NOW()
WHERE tank_id = 92;

UPDATE ln2_iot_devices
SET 
    tank_max_capacity_reading = 64.0000,
    updated_at = NOW()
WHERE tank_id = 92;






to fix-conflict

1. backend % poetry run python fix-conflict/add_reservoir_weights_and_seed.py   


npm run dev --  --port 5174

poetry run uvicorn app.main:app --port 8001 --reload



## Stress Test — readings table (CTE + 6h buckets + window functions)
cd backend
poetry run python other/stress_test_readings.py

# override tank or run count:
poetry run python other/stress_test_readings.py --tank-id 3 --runs 10


## TimescaleDB comparison benchmark (plain vs hyper vs continuous agg)
cd backend
poetry run python other/stress_test_compare.py
# Report auto-written to: backend/other/timescaledb-report.md
# Setup steps: see backend/other/timescaledb-setup.md

## Stress Test — readings multi-query suite (Q1–Q4)
# Q1 large row scan | Q2 derived-table subquery | Q3 multi-join | Q4 GROUP BY daily agg
cd backend
poetry run python other/stress_test_readings_q1.py

# override tank or run count:
poetry run python other/stress_test_readings_q1.py --tank-id 3 --runs 10



cd /Users/nishaanth/Documents/work/mg/mG-SCALE
docker compose up --build grading-service

That pulls in its dependencies automatically (postgres, redis, azurite, all with health gates) and exposes the function host on localhost:7073.

The first build is slow — it installs CPU torch plus timm and segmentation-models-pytorch, and copies the 137MB of checkpoints. Expect several GB of image and a long first run; subsequent builds are cached unless requirements.txt changes.

Hit it

curl -X POST http://localhost:7073/api/Segmentation \
  -H 'Content-Type: application/json' \
  -d '{"image_id":"ivf/oocytes/1/1/upload_abc.jpg"}'

Returns 202 {"job_id": N} immediately. Same shape for /api/Grading.

image_id must be a blob that already exists in Azurite under the ivf-media container, otherwise download_bytes throws and the job goes to failed. To watch a job as it runs:

docker compose exec redis redis-cli psubscribe 'ml:job:*'
docker compose exec postgres psql -U postgres -d mygrape -c 'select * from ml_jobs order by job_id desc limit 5;'

Through the backend SSE bridge

docker compose up -d backend
curl -N 'http://localhost:8000/api/ivf/ml/segmentation/stream?image_id=<blob-path>'

Note that route sits behind TokenValidationMiddleware, so you'll need a bearer token or the auth_token cookie.

What to expect the first time

Things I'd flag rather than have you discover mid-run:

- First request is slow twice over — the worker cold-starts, then get_models() loads 137MB of checkpoints. After that they're cached per process.
- ScoreCAM on CPU is the real risk. ~192 DenseNet-121 forward passes at 384×384 per image. If it blows past the 10-minute functionTimeout in host.json, the job dies with the row stuck at running and the SSE stream hangs — that's the missing-timeout issue I flagged earlier, and local is exactly where you'll hit it. Raise functionTimeout if you need headroom while testing.
- I haven't executed this pipeline. torch isn't installed in my environment, so the models have never been loaded and no image has gone through them. The container run is the first real execution — if a checkpoint's state_dict doesn't match the architecture, that's where it surfaces, as a load_state_dict error at first request.

Not via Core Tools, by the way: func 4.7.0 is installed, but your local Python is 3.13 and the app targets 3.10, and you'd be installing torch into your system Python. Docker avoids both.









Two ways, and they hit different databases — that's the thing to get right.

Option A — Docker (local containers)

cd /Users/nishaanth/Documents/work/mg/mG-SCALE
docker compose up --build grading-service

Host on localhost:7073. Starts postgres, redis, azurite alongside it.

This ignores the .env you just gave me — .dockerignore excludes .env*, and the compose environment: block hardcodes DB_HOST=postgres, REDIS_HOST=redis, and the Azurite connection string, which win ovs fully local.

Option B — Function host direct

python3.10 is installed, which

cd /Users/nishaanth/Documents/wrvice
python3.10 -m venv .venv && source .venv/bin/activate
pip install --index-url https:/cpu \
            --extra-index-url https://pypi.org/simple torch torchvision
pip install -r requirements.txt
func start

Default port 7071 (func start --port 7073 to match compose). config.py reads .env, so
this talks to mygrape-dev on Aze real ivf-media storage account — jobs write real rows and real blobs.

Note local.settings.json also sets DB/Redis values pointing at localhost. Core Tools
loads those into the environmenes beat the .env file inpydantic-settings — so for Option B to actually use your dev credentials you need to
strip the overlapping keys out ep AzureWebJobsStorage andFUNCTIONS_WORKER_RUNTIME). Want me to do that?

Then hit it

curl -X POST http://localhost:7073/api/Segmentation \
  -H 'Content-Type: application
  -d '{"image_id":"<blob path or full blob URL>"}'

202 {"job_id": N} comes back immediately; the work continues on a background thread.
Watch it with:

docker compose exec redis redis     # Option A
docker compose exec postgres psql -U postgres -d mygrape -c \
  'select job_id,kind,status,prorder by job_id desc limit 5;'

The image_id must already existr of whichever storage accountthat run is pointed at, or the job fails at download_bytes.

Still true from before: nothing here has ever been executed — first request loads 137MB of checkpoints and runs ~192 CPCAM, which may exceed the10-minute functionTimeout. If a checkpoint's state_dict doesn't match the ported architecture, that surfaces as a load_state_dict error on the first request.