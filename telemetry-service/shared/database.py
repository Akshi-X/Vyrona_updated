"""
Database connection module optimized for Azure Functions.
Uses connection pooling and handles cold starts with singleton pattern.
"""
import logging
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import QueuePool
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))
from config import config

logger = logging.getLogger(__name__)

# Global engine (reused across invocations - singleton pattern)
_engine = None
_SessionLocal = None


def get_engine():
    """Get or create database engine (singleton pattern for Azure Functions)."""
    global _engine
    if _engine is None:
        _engine = create_engine(
            config.database_url,
            pool_pre_ping=True,  # Verify connections before using
            echo=False,
            pool_size=2,  # Smaller pool for serverless
            max_overflow=5,
            pool_timeout=30,
            pool_recycle=3600,  # Recycle connections after 1 hour
            poolclass=QueuePool
        )
        logger.info("Database engine created")
    return _engine


def get_session():
    """Get database session factory."""
    global _SessionLocal
    if _SessionLocal is None:
        _SessionLocal = sessionmaker(
            autocommit=False,
            autoflush=False,
            bind=get_engine()
        )
    return _SessionLocal


def ensure_telemetry_table_exists():
    """Ensure telemetry_data table exists (idempotent)."""
    try:
        engine = get_engine()
        ddl = text("""
        CREATE TABLE IF NOT EXISTS telemetry_data (
            id BIGSERIAL PRIMARY KEY,
            shipment_id VARCHAR(255) NOT NULL,
            telemetry_data JSONB NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        )
        """)
        with engine.begin() as conn:
            conn.execute(ddl)
    except Exception as e:
        logger.error(f"✗ Failed to ensure telemetry_data table: {e}")
        raise


def ensure_ln2_event_detection_columns():
    """
    Add event-detection columns to ln2_iot_devices (idempotent).

    These columns support:
      • Case B  – transient spike filtering
      • Case C  – lid weight-band detection
      • Step 5  – low-level refill alert
      • Canister / product event classification
      • Precaution advisory

    All columns are nullable with sensible defaults so existing rows
    continue to work without manual backfill.
    """
    try:
        engine = get_engine()

        # Each statement is idempotent (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
        alter_statements = [
            # ── Transient spike filter (Case B) ──
            """ALTER TABLE ln2_iot_devices
               ADD COLUMN IF NOT EXISTS spike_tolerance_kg
               NUMERIC(8,4) DEFAULT 0.8""",
            """ALTER TABLE ln2_iot_devices
               ADD COLUMN IF NOT EXISTS spike_max_duration_s
               INTEGER DEFAULT 90""",

            # ── Lid weight-band detection (Case C) ──
            """ALTER TABLE ln2_iot_devices
               ADD COLUMN IF NOT EXISTS lid_weight_min_kg
               NUMERIC(8,4) DEFAULT 0.45""",
            """ALTER TABLE ln2_iot_devices
               ADD COLUMN IF NOT EXISTS lid_weight_max_kg
               NUMERIC(8,4) DEFAULT 0.65""",
            """ALTER TABLE ln2_iot_devices
               ADD COLUMN IF NOT EXISTS lid_confirm_stable_points
               INTEGER DEFAULT 4""",

            # ── Low-level refill alert (Step 5) ──
            """ALTER TABLE ln2_iot_devices
               ADD COLUMN IF NOT EXISTS low_level_threshold_kg
               NUMERIC(10,4) DEFAULT 5.0""",
            """ALTER TABLE ln2_iot_devices
               ADD COLUMN IF NOT EXISTS low_level_consecutive_readings
               INTEGER DEFAULT 10""",

            # ── Canister / product event detection ──
            """ALTER TABLE ln2_iot_devices
               ADD COLUMN IF NOT EXISTS canister_weight_kg
               NUMERIC(8,4) DEFAULT 0.31""",
            """ALTER TABLE ln2_iot_devices
               ADD COLUMN IF NOT EXISTS canister_tolerance_kg
               NUMERIC(8,4) DEFAULT 0.05""",
            """ALTER TABLE ln2_iot_devices
               ADD COLUMN IF NOT EXISTS product_change_max_kg
               NUMERIC(8,4) DEFAULT 0.08""",

            # ── Precaution advisory ──
            """ALTER TABLE ln2_iot_devices
               ADD COLUMN IF NOT EXISTS precaution_level_pct
               NUMERIC(6,2) DEFAULT 15.0""",
        ]

        with engine.begin() as conn:
            for stmt in alter_statements:
                conn.execute(text(stmt))

        logger.info("✓ ln2_iot_devices event-detection columns ensured")
    except Exception as e:
        logger.error(f"✗ Failed to ensure ln2 event-detection columns: {e}")
        raise
