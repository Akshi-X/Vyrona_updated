"""
config.py
─────────
Infrastructure-level configuration only.

WHAT BELONGS HERE
─────────────────
Connection strings, ports, timeouts, and universal physical constants
(e.g. LN2 density — the same for every tank on Earth).

WHAT DOES NOT BELONG HERE
──────────────────────────
Any value that differs per tank or per device: empty/full weights,
static evaporation rate, detection thresholds, window sizes.
Those live in the `tanks` and `ln2_iot_devices` database tables and
are fetched + cached at runtime via DeviceConfigCache.
"""

from typing import Optional

# ── Universal physical constant ───────────────────────────────────────────────
# LN2 density is the same for every tank; no reason to put it in the DB.
LN2_DENSITY_KG_PER_L: float = 0.808   # kg/L at boiling point (−196 °C)

# ── Sensor fault tolerance ─────────────────────────────────────────────────────
# How many kg above/below the tank's stated empty/full weight the scale is
# allowed to read before we flag it as a hardware fault.
# This is a universal margin; individual tank bounds come from the DB.
SENSOR_FAULT_MARGIN_KG: float = 2.0

# ── Azure Event Hub ────────────────────────────────────────────────────────────
EVENT_HUB_CONNECTION_STR: str = (
    "Endpoint=sb://<namespace>.servicebus.windows.net/;"
    "SharedAccessKeyName=<keyname>;SharedAccessKey=<key>;"
    "EntityPath=<eventhub-name>"
)
CONSUMER_GROUP: str = "$Default"
# "@latest" = only new events (production default)
# "-1"      = replay from start of retention window (development only)
STARTING_POSITION: str = "@latest"

# ── Redis ──────────────────────────────────────────────────────────────────────
REDIS_HOST: str = "localhost"
REDIS_PORT: int = 6379
REDIS_DB: int = 0
REDIS_PASSWORD: Optional[str] = None

# How long per-device runtime state keys survive without a new reading.
REDIS_STATE_TTL_SECONDS: int = 86_400       # 24 h

# How long device calibration config is cached before a DB re-fetch.
# Short enough to pick up operator updates; long enough to not hammer PG.
REDIS_CONFIG_TTL_SECONDS: int = 300         # 5 minutes

# ── PostgreSQL (asyncpg DSN) ───────────────────────────────────────────────────
PG_DSN: str = "postgresql://user:password@localhost:5432/yourdb"

