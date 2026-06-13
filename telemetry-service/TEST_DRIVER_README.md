# LN2 IoT Test Driver (v2)

Standalone test driver for testing the Telemetry Service Azure Function locally.
Simulates EventHub messages for both **CUSTOM_IOT (LN2 weight)** and **Tive (IVF)** payload types without requiring actual EventHub infrastructure.

## Features

- **Zero modification** to existing Azure Function code
- **Mock EventHub events** — simulates `func.EventHubEvent` objects
- **Dynamic device provisioning** — automatically creates test devices, tanks, and calibration in the connected DB
- **Device reuse** — on subsequent runs, offers to reuse previously created test devices
- **15 test scenarios** — 11 LN2 (CUSTOM_IOT) + 4 Tive (IVF) covering normal operation, faults, edge cases, and shipment monitoring
- **Calibration-derived payloads** — all weight values computed from `DeviceConfig` thresholds (not hardcoded magic numbers)
- **Real-time observation** of PostgreSQL and Redis writes
- **Multiple execution modes** — interactive menu, batch, single scenario, custom payload shell
- **Exit cleanup hook** — on exit, prompts to clean readings only, delete device entirely, or keep data
- **Tive IVF support** — temperature, shock, humidity, GPS location payloads matching `transform_webhook_to_ivf_quality_data()`

## Quick Start

### 1. Setup Environment

Create your local test configuration:

```bash
cd /home/sreejith/projects/mg-scale/telemetry-service

# Copy the template
cp .env.test.template .env.test

# Edit with your local database/Redis endpoints
nano .env.test
```

Update the following values in `.env.test`:
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` - Your local PostgreSQL
- `REDIS_HOST`, `REDIS_PORT` - Your local Redis instance

### 2. Setup Test Device

The v2 driver **automatically creates** test devices in the database — no manual SQL needed.

Just run the driver and it will walk you through it:

```bash
python test_ln2_driver.py
```

On first run, the interactive setup will:
1. Check for existing `LN2-TEST-*` devices in the database
2. If found, offer to reuse one or create a new device
3. If creating new, prompt for default or custom tank/calibration config
4. Insert records into `devices`, `tanks`, and `ln2_iot_devices` tables automatically

**Default test device configuration:**

| Parameter | Default Value |
|---|---|
| `empty_weight_kg` | 15.9 |
| `full_weight_kg` | 54.1 |
| `capacity_liters` | 47.3 |
| `static_evap_rate_l_per_day` | 0.38 |
| `sensor_min_kg` | 10.0 |
| `sensor_max_kg` | 100.0 |
| `refill_threshold_kg` | 5.0 |
| `window_minutes` | 1 |
| `min_points` | 3 |
| `consecutive_windows` | 1 |

You can also set up a device non-interactively:
```bash
python test_ln2_driver.py --setup
```

Or reuse a specific existing device:
```bash
python test_ln2_driver.py --device-code LN2-TEST-001
```

### 3. Run Tests

**Interactive Mode** (recommended for first-time use):
```bash
python test_ln2_driver.py
```

**Run Specific Scenario:**
```bash
# LN2 scenario
python test_ln2_driver.py --scenario refill_event

# Tive IVF scenario (requires --tive-device-id)
python test_ln2_driver.py --scenario tive_temp_excursion --tive-device-id TIVE-IVF-T10
```

**Batch Mode** (all scenarios):
```bash
# All 15 scenarios (LN2 + Tive)
python test_ln2_driver.py --batch

# LN2 only
python test_ln2_driver.py --batch --ln2-only
```

### 4. Verify Results

The driver will display:
- ✓ Database writes (`ln2_iot_raw_data`, `ln2_readings` for LN2; `ivf_telemetry_data` for Tive)
- ✓ Redis state (window points, state machine, quality history)
- ✓ Latest readings with calculated values
- ✓ Any errors or alerts triggered

You can also manually verify in PostgreSQL:
```sql
-- LN2 readings
SELECT * FROM ln2_readings ORDER BY reading_timestamp DESC LIMIT 5;

-- IVF telemetry
SELECT * FROM ivf_telemetry_data ORDER BY created_at DESC LIMIT 5;
```

And in Redis:
```bash
redis-cli
> HGETALL ln2:LN2-TEST-001:state
> LRANGE ln2:LN2-TEST-001:window 0 -1
```

### 5. Cleanup Test Data

The driver prompts for cleanup on exit automatically (via `atexit` hook). You can choose:
- **y** — delete readings and Redis keys only (keep device/tank for reuse)
- **d** — delete everything (device, tank, readings, Redis)
- **n** — keep all data

You can also clean up manually:
```bash
# Clean readings + Redis (keep device)
python test_ln2_driver.py --clean

# Clean everything including device/tank records
python test_ln2_driver.py --clean-all
```

## Test Scenarios

The driver includes **15 scenarios**: 11 LN2 (CUSTOM_IOT) + 4 Tive (IVF).

All LN2 weight values are **derived from the test device's calibration** — they are not hardcoded. For example, "75% full" is computed as `empty_weight_kg + 0.75 × (full_weight_kg − empty_weight_kg)`.

### LN2 (CUSTOM_IOT) Scenarios

#### 1. Normal (Lid Closed) — `normal_closed`
- **Behavior**: 20 readings at 30 s intervals, evaporation at `static_evap_kg_per_hour`
- **Expected**: State machine detects CLOSED state

#### 2. Normal (Lid Open) — `normal_open`
- **Behavior**: 20 readings, evaporation at 2× `open_rate_min_kg_per_h`
- **Expected**: State machine flips to OPEN state

#### 3. Refill Event — `refill_event`
- **Behavior**: Decline from 30% → jump to 90% (exceeds `refill_threshold_kg`) → post-refill decline
- **Expected**: Refill detected, sliding window cleared

#### 4. Sensor Fault (Below Empty) — `fault_below`
- **Behavior**: Weight drops below `sensor_min_kg`
- **Expected**: `SensorStatus.BELOW_EMPTY`, alert triggered

#### 5. Sensor Fault (Above Full) — `fault_above`
- **Behavior**: Weight exceeds `sensor_max_kg`
- **Expected**: `SensorStatus.ABOVE_FULL`, alert triggered

#### 6. State CLOSED → OPEN — `state_transition`
- **Behavior**: Three-phase sequence (closed → ramp → open evaporation)
- **Expected**: State transitions after consecutive confirming windows

#### 7. Rapid Decline / Leak — `rapid_decline`
- **Behavior**: 25 readings at 5× `open_rate_min_kg_per_h`
- **Expected**: Very high evaporation rate detected, OPEN state

#### 8. Stable Full Tank — `stable_full`
- **Behavior**: 15 readings at 95% fill, sub-static evaporation
- **Expected**: CLOSED state, baseline test

#### 9-11. Edge Cases
- **Missing Device ID** (`edge_no_devid`): Payload without `deviceid` — rejected
- **Invalid Timestamp** (`edge_bad_ts`): Malformed timestamp string — rejected
- **Non-Numeric Weight** (`edge_bad_wt`): Weight is a string — `float()` raises

### Tive (IVF) Scenarios

Tive scenarios require a `--tive-device-id` matching `tanks.tive_device_id` in the DB.

#### 12. Normal Temperature — `tive_normal_temp`
- **Behavior**: 10 readings, probe at −196 °C, minimal drift, no shock
- **Expected**: All KPIs green

#### 13. Temperature Excursion — `tive_temp_excursion`
- **Behavior**: 10 readings, probe warming from −196 °C to −185 °C
- **Expected**: Violation when probe exceeds −191 °C threshold

#### 14. Shock Event — `tive_shock`
- **Behavior**: 8 readings, G-force spikes above 1.0 G midway
- **Expected**: Shock KPI violation triggered

#### 15. Transit + GPS — `tive_transit`
- **Behavior**: 12 readings with changing latitude/longitude (Bangalore → Chennai)
- **Expected**: Location updates tracked, battery declining

## Command-Line Options

```bash
# Show help
python test_ln2_driver.py --help

# Interactive mode (default) — walks through device setup + menu
python test_ln2_driver.py

# Reuse an existing test device
python test_ln2_driver.py --device-code LN2-TEST-001

# Run specific LN2 scenario
python test_ln2_driver.py --scenario normal_closed
python test_ln2_driver.py --scenario refill_event
python test_ln2_driver.py --scenario rapid_decline

# Run specific Tive scenario (requires tive-device-id)
python test_ln2_driver.py --scenario tive_shock --tive-device-id TIVE-IVF-T10

# Batch mode — all 15 scenarios
python test_ln2_driver.py --batch

# Batch mode — LN2 only (skip Tive)
python test_ln2_driver.py --batch --ln2-only

# Setup test device only (prints config and exits)
python test_ln2_driver.py --setup

# Clean readings + Redis (keep device for reuse)
python test_ln2_driver.py --clean

# Clean everything including device/tank records
python test_ln2_driver.py --clean-all

# Enable debug logging
python test_ln2_driver.py --debug
```

## Available Scenario Keys

Use these keys with `--scenario`:

**LN2 (CUSTOM_IOT):**
- `normal_closed` — Normal operation, lid closed
- `normal_open` — Normal operation, lid open
- `refill_event` — Refill event detection
- `fault_below` — Sensor fault below empty
- `fault_above` — Sensor fault above full
- `state_transition` — State transition CLOSED → OPEN
- `rapid_decline` — Very high loss rate (leak)
- `stable_full` — Near-full tank baseline
- `edge_no_devid` — Edge case: missing device ID
- `edge_bad_ts` — Edge case: invalid timestamp
- `edge_bad_wt` — Edge case: non-numeric weight

**Tive (IVF):**
- `tive_normal_temp` — Normal probe temperature
- `tive_temp_excursion` — Probe temperature violation
- `tive_shock` — G-force shock event
- `tive_transit` — Transit with GPS location updates

## Understanding the Output

### Successful LN2 Test Example

```
================================================================================
  Normal (Lid Closed)  [LN2]
  Steady evaporation at static rate
================================================================================

→ Sending 20 EventHub messages …

Database writes:
  ln2_iot_raw_data: 20  |  ln2_readings: 2
    Level=75.3%  Rate=0.0128 kg/h  @2026-02-20 12:45:00
    Level=76.1%  Rate=0.0131 kg/h  @2026-02-20 12:35:00

Redis state:
  ln2:LN2-TEST-001:window  → 20 points
    current_state: CLOSED
    open_counter: 0
    closed_counter: 2
    last_rate_kg_per_h: 0.013
  quality_history → 2 entries

────────────────────────────────────────
✓ Completed in 2.34s
```

### Successful Tive Test Example

```
================================================================================
  Tive: Temp Excursion  [TIVE]
  Probe rises above -191 °C
================================================================================

→ Sending 10 EventHub messages …

Database writes:
  ivf_telemetry_data: 10
    t_int=-196.50  t_ext=22.00  shock=0.100  @2026-02-20 12:50:00

────────────────────────────────────────
✓ Completed in 1.12s
```

### What to Look For

**LN2 Database Writes:**
- `ln2_iot_raw_data`: Should match number of payloads sent
- `ln2_readings`: May be fewer (only calculated after enough window points + eval interval)

**Tive Database Writes:**
- `ivf_telemetry_data`: Should match number of payloads sent (requires matching `tanks.tive_device_id`)

**Redis State (LN2 only):**
- `window`: Number of recent readings in sliding window
- `state.current_state`: CLOSED, OPEN, or UNKNOWN
- `state.last_rate_kg_per_h`: Most recent evaporation rate
- `quality_history`: Recent quality records published

**Common Issues:**
- No database writes → Check database connection in `.env.test`
- No Redis state → Check Redis connection
- All readings but no state → State machine requires multiple windows
- Tive not writing → Verify `--tive-device-id` matches a `tanks.tive_device_id` row

## Architecture

The test driver consists of:

```
test_ln2_driver.py
├── Config Dataclasses
│   ├── TankConfig                # Physical tank spec (empty/full weight, capacity, evap rate)
│   ├── CalibrationConfig         # ln2_iot_devices thresholds (sensor bounds, refill, window)
│   └── TestDeviceInfo            # Combined identity + config with derived properties
│
├── TestDeviceSetup               # Dynamic DB provisioning
│   ├── find_existing_test_devices()   # Query LN2-TEST-* devices
│   ├── create_test_device()           # Insert device + tank + ln2_iot_devices
│   ├── load_device_info()             # Load full config from DB
│   ├── cleanup_device()               # Delete readings / device / tank
│   ├── cleanup_redis()                # Delete Redis keys
│   ├── full_cleanup()                 # DB + Redis
│   └── interactive_setup()            # Reuse or create with prompts
│
├── EventHubEventMock             # Mocks func.EventHubEvent
│
├── LN2PayloadGenerator           # CUSTOM_IOT payloads (calibration-derived)
│   ├── generate_normal_closed_lid()       # Static evap rate
│   ├── generate_normal_open_lid()         # 2× open_rate_min
│   ├── generate_refill_event()            # 30% → 90% jump
│   ├── generate_sensor_fault_below_empty()# Below sensor_min_kg
│   ├── generate_sensor_fault_above_full() # Above sensor_max_kg
│   ├── generate_state_transition_closed_to_open()
│   ├── generate_rapid_decline()           # 5× open_rate_min
│   ├── generate_stable_full_tank()        # 95% fill
│   └── generate_edge_*()                  # 3 edge cases
│
├── TivePayloadGenerator          # Tive IVF payloads
│   ├── generate_normal_temperature()      # Probe at -196 °C
│   ├── generate_temperature_excursion()   # Probe → -185 °C
│   ├── generate_shock_event()             # G > 1.0 spike
│   └── generate_transit_with_location()   # GPS drift
│
├── DatabaseObserver              # Queries PostgreSQL
│   ├── get_recent_raw_data()
│   ├── get_recent_readings()
│   ├── count_recent()
│   └── get_recent_ivf_data()     # ivf_telemetry_data
│
├── RedisObserver                 # Queries Redis keys
│   ├── get_window_points()
│   ├── get_device_state()
│   └── get_quality_history()
│
├── TestRunner                    # Orchestrates test execution
│   ├── run_scenario()            # Single scenario with observation
│   └── run_batch()               # Multiple scenarios + summary
│
├── custom_payload_shell()        # Interactive single-payload sender
├── show_menu()                   # Interactive menu (LN2 + Tive)
└── _exit_cleanup()               # atexit hook for cleanup prompt
```

## How It Works

1. **Load Configuration**: Reads `.env.test` or uses environment variable defaults
2. **Provision Device**: Interactively creates or reuses a test device in the DB (`TestDeviceSetup`)
3. **Generate Payloads**: Builds CUSTOM_IOT (LN2) or Tive (IVF) payloads using calibration-derived values
4. **Mock Events**: Wraps payloads in `EventHubEventMock` objects
5. **Invoke Function**: Calls `telemetry_hook_main(events)` directly — same entry point as Azure
6. **Observe Results**: Queries database (`ln2_iot_raw_data`, `ln2_readings`, `ivf_telemetry_data`) and Redis
7. **Display Output**: Formats results with DB row counts, latest readings, and Redis state
8. **Exit Cleanup**: `atexit` hook offers to clean readings only, delete device, or keep data

## Troubleshooting

### "Connection refused" Errors

**Database connection failed:**
```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Test connection
psql -h localhost -U postgres -d mgscale_dev
```

**Redis connection failed:**
```bash
# Check Redis is running
redis-cli ping

# Should return: PONG
```

### "Test device not found"

The v2 driver creates devices automatically. Just run:
```bash
python test_ln2_driver.py
```

If using `--device-code`, make sure the device was previously created by the driver (prefix `LN2-TEST-`).

### Function Execution Errors

Enable debug logging to see detailed errors:
```bash
python test_ln2_driver.py --scenario normal_closed --debug
```

Check the Azure Function logs for specific errors in processing logic.

### No Redis State Written

The LN2 state machine requires:
- Multiple readings (at least `window_min_points`, typically 5)
- Sufficient time span (at least `window_minutes`, typically 10 minutes)

For testing, the payloads are timestamped 30 seconds apart, so state should appear after ~10-15 readings.

## Advanced Usage

### Reusing a Device Across Runs

```bash
# First run creates LN2-TEST-001
python test_ln2_driver.py

# Subsequent runs can reuse it directly
python test_ln2_driver.py --device-code LN2-TEST-001
```

### Custom Tank/Calibration Config

When creating a new device, choose "n" at the "Use default config?" prompt to enter custom values for `empty_weight_kg`, `full_weight_kg`, `sensor_min_kg`, etc.

### Custom Payload Shell

From the interactive menu, select **P** to send a single CUSTOM_IOT payload with a user-specified weight. The shell shows the weight at 0%, 75%, 100% for reference.

### Testing Tive (IVF) Payloads

Tive scenarios require a `tive_device_id` that matches a `tanks.tive_device_id` in the database (e.g., `TIVE-IVF-T10` from tank T10):

```bash
python test_ln2_driver.py --scenario tive_temp_excursion --tive-device-id TIVE-IVF-T10
```

In interactive mode, you'll be prompted for the Tive device ID on startup.

### Adding Custom Scenarios

1. Add a generator method to `LN2PayloadGenerator` or `TivePayloadGenerator`
2. Add a `TestScenario` entry to `LN2_SCENARIOS` or `TIVE_SCENARIOS`
3. The scenario will automatically appear in the interactive menu and CLI

## Files

- `test_ln2_driver.py` — Main test driver (v2)
- `.env.test.template` — Configuration template
- `TEST_DRIVER_README.md` — This documentation
- **Not Modified**: Any existing Azure Function or shared code

## Dependencies

All dependencies already exist in the project:
- `azure-functions` - EventHub event types
- `sqlalchemy` - Database queries
- `redis` - Redis client
- `psycopg2-binary` - PostgreSQL driver
- Built-in: `json`, `logging`, `argparse`, `datetime`

Optional:
- `python-dotenv` - For loading .env.test (pip install python-dotenv)

## License

Same as parent project.
