import logging
from datetime import datetime, timezone

from sqlalchemy import inspect as sa_inspect
from sqlalchemy import text

from app.auth.auth import get_password_hash
from app.config.config import settings
from app.config.database import Base, SessionLocal, engine
from app.models import (
    otp_model,
    patient_model,
    pharma_model,
    provider_model,
    user_model,
)
from app.models.IVF.hospital_branch_model import HospitalBranch
from app.models.IVF.hospital_model import Hospital
from app.models.IVF.ivf_cycle_model import IvfCycle
from app.models.IVF.ivf_cycle_log_model import IvfCycleLog
from app.models.user_model import User
from app.utils.utils import generate_user_id

logger = logging.getLogger(__name__)


def _migrate_ln2_readings_device_id(db):
    """Migrate ln2_readings.device_id from VARCHAR (device_code) to INTEGER FK (devices.id)."""
    try:
        insp = sa_inspect(db.get_bind())
        if "ln2_readings" not in insp.get_table_names():
            return
        cols = {c["name"]: c for c in insp.get_columns("ln2_readings")}
        if "device_id" not in cols:
            db.execute(
                text(
                    "ALTER TABLE ln2_readings ADD COLUMN device_id INTEGER REFERENCES devices(id) ON DELETE CASCADE"
                )
            )
            return
        if "VARCHAR" not in str(cols["device_id"]["type"]) and "CHARACTER" not in str(
            cols["device_id"]["type"]
        ):
            return  # Already migrated (integer)
        db.execute(
            text(
                "ALTER TABLE ln2_readings ADD COLUMN IF NOT EXISTS device_fk INTEGER REFERENCES devices(id) ON DELETE CASCADE"
            )
        )
        db.execute(
            text("""
            UPDATE ln2_readings r SET device_fk = d.id
            FROM devices d WHERE d.device_code = r.device_id
        """)
        )
        db.execute(text("ALTER TABLE ln2_readings DROP COLUMN device_id"))
        db.execute(
            text("ALTER TABLE ln2_readings RENAME COLUMN device_fk TO device_id")
        )
        db.execute(text("ALTER TABLE ln2_readings ALTER COLUMN device_id SET NOT NULL"))
    except Exception as e:
        logger.warning(f"ln2_readings device_id migration skipped: {e}")


def _migrate_ln2_iot_raw_data_device_id(db):
    """Migrate ln2_iot_raw_data.device_id from VARCHAR to INTEGER FK (devices.id)."""
    try:
        insp = sa_inspect(db.get_bind())
        if "ln2_iot_raw_data" not in insp.get_table_names():
            return
        cols = {c["name"]: c for c in insp.get_columns("ln2_iot_raw_data")}
        if "device_id" not in cols:
            db.execute(
                text(
                    "ALTER TABLE ln2_iot_raw_data ADD COLUMN device_id INTEGER REFERENCES devices(id) ON DELETE CASCADE"
                )
            )
            return
        if "VARCHAR" not in str(cols["device_id"]["type"]) and "CHARACTER" not in str(
            cols["device_id"]["type"]
        ):
            return  # Already migrated (integer)
        db.execute(
            text(
                "ALTER TABLE ln2_iot_raw_data ADD COLUMN IF NOT EXISTS device_fk INTEGER REFERENCES devices(id) ON DELETE CASCADE"
            )
        )
        db.execute(
            text("""
            UPDATE ln2_iot_raw_data r SET device_fk = d.id
            FROM devices d WHERE d.device_code = r.device_id
        """)
        )
        db.execute(text("ALTER TABLE ln2_iot_raw_data DROP COLUMN device_id"))
        db.execute(
            text("ALTER TABLE ln2_iot_raw_data RENAME COLUMN device_fk TO device_id")
        )
        db.execute(
            text("ALTER TABLE ln2_iot_raw_data ALTER COLUMN device_id SET NOT NULL")
        )
    except Exception as e:
        logger.warning(f"ln2_iot_raw_data device_id migration skipped: {e}")


def _drop_legacy_tables(db):
    """Drop old tables that have been replaced (e.g. tank_kpi_readings -> kpi_config + readings)."""
    try:
        insp = sa_inspect(db.get_bind())
        tables = insp.get_table_names()
        if "tank_kpi_readings" in tables:
            db.execute(text("DROP TABLE IF EXISTS tank_kpi_readings CASCADE"))
            logger.info("Dropped legacy table: tank_kpi_readings")
    except Exception as e:
        logger.warning(f"Drop legacy tables skipped: {e}")


def sync_ivf_schema():
    """
    Add missing columns to IVF tables for older databases.
    Handles schema drift when model was updated (e.g. tank-level monitoring).
    """
    db = SessionLocal()
    try:
        db.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS activity_log (
                    id SERIAL PRIMARY KEY,
                    action VARCHAR NOT NULL,
                    outcome VARCHAR NOT NULL,
                    actor_type VARCHAR NOT NULL,
                    actor_id VARCHAR,
                    actor_label VARCHAR,
                    hospital_id INTEGER,
                    target_type VARCHAR,
                    target_id VARCHAR,
                    target_label VARCHAR,
                    metadata JSONB,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
        )
        db.execute(text("ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS hospital_id INTEGER"))
        db.execute(text("CREATE INDEX IF NOT EXISTS idx_activity_log_action ON activity_log (action)"))
        db.execute(text("CREATE INDEX IF NOT EXISTS idx_activity_log_outcome ON activity_log (outcome)"))
        db.execute(text("CREATE INDEX IF NOT EXISTS idx_activity_log_actor ON activity_log (actor_type, actor_id)"))
        db.execute(text("CREATE INDEX IF NOT EXISTS idx_activity_log_hospital ON activity_log (hospital_id)"))
        db.execute(text("CREATE INDEX IF NOT EXISTS idx_activity_log_target ON activity_log (target_type, target_id)"))
        db.execute(text("CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log (created_at)"))
        db.execute(text("CREATE INDEX IF NOT EXISTS idx_activity_log_metadata ON activity_log USING GIN (metadata)"))

        _drop_legacy_tables(db)
        # ivf_quality_log: tank_id, telemetry_data_id for deviations graph
        db.execute(
            text(
                "ALTER TABLE ivf_quality_log ADD COLUMN IF NOT EXISTS tank_id INTEGER REFERENCES tanks(tank_id) ON DELETE CASCADE"
            )
        )
        db.execute(
            text(
                "ALTER TABLE ivf_quality_log ADD COLUMN IF NOT EXISTS telemetry_data_id INTEGER REFERENCES ivf_telemetry_data(id) ON DELETE CASCADE"
            )
        )
        # Boolean violation flags (required for deviations graph / total-deviations)
        db.execute(
            text(
                "ALTER TABLE ivf_quality_log ADD COLUMN IF NOT EXISTS is_temp_internal_loss BOOLEAN DEFAULT false NOT NULL"
            )
        )
        db.execute(
            text(
                "ALTER TABLE ivf_quality_log ADD COLUMN IF NOT EXISTS is_temp_external_loss BOOLEAN DEFAULT false NOT NULL"
            )
        )
        db.execute(
            text(
                "ALTER TABLE ivf_quality_log ADD COLUMN IF NOT EXISTS is_shock_loss BOOLEAN DEFAULT false NOT NULL"
            )
        )
        # Other columns the model expects
        db.execute(
            text(
                "ALTER TABLE ivf_quality_log ADD COLUMN IF NOT EXISTS device_id VARCHAR"
            )
        )
        db.execute(
            text(
                "ALTER TABLE ivf_quality_log ADD COLUMN IF NOT EXISTS temperature_internal FLOAT"
            )
        )
        db.execute(
            text(
                "ALTER TABLE ivf_quality_log ADD COLUMN IF NOT EXISTS temperature_external FLOAT"
            )
        )
        db.execute(
            text("ALTER TABLE ivf_quality_log ADD COLUMN IF NOT EXISTS shock FLOAT")
        )
        db.execute(
            text(
                "ALTER TABLE ivf_quality_log ADD COLUMN IF NOT EXISTS quality_loss FLOAT"
            )
        )
        db.execute(
            text(
                "ALTER TABLE ivf_quality_log ADD COLUMN IF NOT EXISTS reading_timestamp TIMESTAMP WITH TIME ZONE"
            )
        )
        db.execute(
            text(
                "ALTER TABLE ivf_quality_log ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL"
            )
        )
        db.execute(
            text(
                "ALTER TABLE ivf_quality_log ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()"
            )
        )
        db.execute(
            text(
                "ALTER TABLE ivf_quality_log ADD COLUMN IF NOT EXISTS created_by VARCHAR"
            )
        )
        db.execute(
            text(
                "ALTER TABLE ivf_quality_log ADD COLUMN IF NOT EXISTS updated_by VARCHAR"
            )
        )
        # canister_ln2_logs: branch_id and quality-tracking columns
        db.execute(
            text(
                "ALTER TABLE canister_ln2_logs ADD COLUMN IF NOT EXISTS branch_id INTEGER REFERENCES hospital_branches(branch_id)"
            )
        )
        db.execute(
            text(
                "ALTER TABLE canister_ln2_logs ADD COLUMN IF NOT EXISTS refill_date DATE"
            )
        )
        db.execute(
            text(
                "ALTER TABLE canister_ln2_logs ADD COLUMN IF NOT EXISTS refill_time TIME"
            )
        )
        db.execute(
            text(
                "ALTER TABLE canister_ln2_logs ADD COLUMN IF NOT EXISTS refilled_by VARCHAR(255)"
            )
        )
        db.execute(
            text(
                "ALTER TABLE canister_ln2_logs ADD COLUMN IF NOT EXISTS description TEXT"
            )
        )
        db.execute(
            text(
                "ALTER TABLE canister_ln2_logs ADD COLUMN IF NOT EXISTS status VARCHAR"
            )
        )
        db.execute(
            text(
                "ALTER TABLE canister_ln2_logs ADD COLUMN IF NOT EXISTS cryoshipper VARCHAR(255)"
            )
        )
        db.execute(
            text(
                "ALTER TABLE canister_ln2_logs ADD COLUMN IF NOT EXISTS disinfected_shipper_infected_tank_description TEXT"
            )
        )
        db.execute(
            text(
                "ALTER TABLE canister_ln2_logs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()"
            )
        )
        db.execute(
            text(
                "ALTER TABLE canister_ln2_logs ADD COLUMN IF NOT EXISTS updated_by VARCHAR"
            )
        )
        db.execute(
            text(
                "ALTER TABLE canister_ln2_logs ADD COLUMN IF NOT EXISTS reservoir_id INTEGER REFERENCES reservoirs(reservoir_id)"
            )
        )
        # ln2_readings.device_id: migrate from VARCHAR to INTEGER FK (devices.id)
        _migrate_ln2_readings_device_id(db)
        # ln2_readings: new schema columns (tank_id, raw_weight_kg, ln2_mass_kg, evaporation_rate_kg_per_h, etc.)
        db.execute(
            text(
                "ALTER TABLE ln2_readings ADD COLUMN IF NOT EXISTS tank_id INTEGER REFERENCES tanks(tank_id) ON DELETE CASCADE"
            )
        )
        db.execute(
            text(
                "ALTER TABLE ln2_readings ADD COLUMN IF NOT EXISTS raw_weight_kg NUMERIC(12,4)"
            )
        )
        db.execute(
            text(
                "ALTER TABLE ln2_readings ADD COLUMN IF NOT EXISTS ln2_mass_kg NUMERIC(12,4)"
            )
        )
        db.execute(
            text(
                "ALTER TABLE ln2_readings ADD COLUMN IF NOT EXISTS ln2_level_pct NUMERIC(6,2)"
            )
        )
        db.execute(
            text(
                "ALTER TABLE ln2_readings ADD COLUMN IF NOT EXISTS ln2_volume_l NUMERIC(12,4)"
            )
        )
        db.execute(
            text(
                "ALTER TABLE ln2_readings ADD COLUMN IF NOT EXISTS sensor_status VARCHAR(50)"
            )
        )
        db.execute(
            text(
                "ALTER TABLE ln2_readings ADD COLUMN IF NOT EXISTS evaporation_rate_kg_per_h NUMERIC(12,6)"
            )
        )
        db.execute(
            text(
                "ALTER TABLE ln2_readings ADD COLUMN IF NOT EXISTS lid_state VARCHAR(50)"
            )
        )
        db.execute(
            text(
                "ALTER TABLE ln2_readings ADD COLUMN IF NOT EXISTS refill_detected BOOLEAN"
            )
        )
        db.execute(
            text(
                "ALTER TABLE ln2_readings ADD COLUMN IF NOT EXISTS quality_status VARCHAR(50)"
            )
        )
        db.execute(
            text(
                "ALTER TABLE readings ADD COLUMN IF NOT EXISTS checked BOOLEAN DEFAULT false"
            )
        )
        # ln2_readings: drop legacy columns (replaced by evaporation_rate_kg_per_h, ln2_mass_kg)
        db.execute(
            text("ALTER TABLE ln2_readings DROP COLUMN IF EXISTS ln2_evaporation_rate")
        )
        db.execute(text("ALTER TABLE ln2_readings DROP COLUMN IF EXISTS ln2_level"))
        # ln2_iot_raw_data.device_id: migrate from VARCHAR to INTEGER FK (devices.id)
        _migrate_ln2_iot_raw_data_device_id(db)
        # tanks: Tive-related columns (empty_weight_kg, full_weight_kg, static_evap_rate_l_per_day)
        db.execute(
            text(
                "ALTER TABLE tanks ADD COLUMN IF NOT EXISTS empty_weight_kg NUMERIC(10,2)"
            )
        )
        db.execute(
            text(
                "ALTER TABLE tanks ADD COLUMN IF NOT EXISTS full_weight_kg NUMERIC(10,2)"
            )
        )
        db.execute(
            text(
                "ALTER TABLE tanks ADD COLUMN IF NOT EXISTS static_evap_rate_l_per_day NUMERIC(10,4)"
            )
        )
        # ln2_iot_devices: Tive algorithm params
        db.execute(
            text(
                "ALTER TABLE ln2_iot_devices ADD COLUMN IF NOT EXISTS closed_noise_margin_kg_per_h NUMERIC(10,4)"
            )
        )
        db.execute(
            text(
                "ALTER TABLE ln2_iot_devices ADD COLUMN IF NOT EXISTS open_rate_min_kg_per_h NUMERIC(10,4)"
            )
        )
        db.execute(
            text(
                "ALTER TABLE ln2_iot_devices ADD COLUMN IF NOT EXISTS refill_threshold_kg NUMERIC(10,4)"
            )
        )
        db.execute(
            text(
                "ALTER TABLE ln2_iot_devices ADD COLUMN IF NOT EXISTS window_minutes INTEGER"
            )
        )
        db.execute(
            text(
                "ALTER TABLE ln2_iot_devices ADD COLUMN IF NOT EXISTS window_min_points INTEGER"
            )
        )
        db.execute(
            text(
                "ALTER TABLE ln2_iot_devices ADD COLUMN IF NOT EXISTS consecutive_windows_for_state INTEGER"
            )
        )
        # kpi_config: columns for limits/units (unit, alert_type may be missing on older DBs)
        db.execute(
            text("ALTER TABLE kpi_config ADD COLUMN IF NOT EXISTS unit VARCHAR(64)")
        )
        db.execute(
            text(
                "ALTER TABLE kpi_config ADD COLUMN IF NOT EXISTS alert_type VARCHAR(100)"
            )
        )
        db.execute(
            text(
                "ALTER TABLE kpi_config ADD COLUMN IF NOT EXISTS cooldown_minutes INTEGER NOT NULL DEFAULT 60"
            )
        )
        # tasks: ensure IVF tank linkage column exists for task scoping
        db.execute(
            text(
                "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS tank_id INTEGER REFERENCES tanks(tank_id)"
            )
        )

        # Add 'Cancelled' to task status enum (PostgreSQL only)
        try:
            if db.get_bind().dialect.name == "postgresql":
                db.execute(
                    text("ALTER TYPE taskstatus ADD VALUE IF NOT EXISTS 'Cancelled'")
                )
        except Exception as enum_err:
            logger.warning(f"TaskStatus enum sync skipped: {enum_err}")

        # hospitals: notification channel flags
        db.execute(
            text(
                "ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS is_email_notifify BOOLEAN NOT NULL DEFAULT true"
            )
        )
        db.execute(
            text(
                "ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS is_whatsapp_notify BOOLEAN NOT NULL DEFAULT false"
            )
        )

        # users: optional phone number
        db.execute(
            text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20)"
            )
        )

        db.commit()
        logger.info("IVF schema sync completed")
    except Exception as e:
        logger.warning(f"IVF schema sync skipped or failed: {e}")
        db.rollback()
    finally:
        db.close()

    # Note: reservoir table migration is run as a separate one-time script
    # Run: python scripts/run_reservoir_migration.py


def _migrate_reservoir_tables():
    """
    1. Create reservoirs and reservoir_logs tables (safe, idempotent).
    2. Drop reservoir / ln2_ordered_date / ln2_received_date from canister_ln2_logs
       ONLY when the caller explicitly passes confirmation, because those columns
       may still hold live data.

    Permission gate: the caller must set env var
        ALLOW_RESERVOIR_COLUMN_DROP=true
    or pass confirm_drop=True when calling this function directly.
    If the columns exist and the gate is not open, a WARNING is logged and the
    drop is skipped — the server still starts normally.
    """
    import os

    db = SessionLocal()
    try:
        insp = sa_inspect(db.get_bind())
        existing_tables = insp.get_table_names()

        # ── 1. Create reservoirs ──────────────────────────────────────────────
        if "reservoirs" not in existing_tables:
            db.execute(text("""
                CREATE TABLE reservoirs (
                    reservoir_id  SERIAL       PRIMARY KEY,
                    reservoir_name VARCHAR(255) NOT NULL,
                    branch_id     INTEGER      REFERENCES hospital_branches(branch_id) ON DELETE SET NULL,
                    hospital_id   INTEGER      REFERENCES hospitals(hospital_id)        ON DELETE SET NULL,
                    created_at    TIMESTAMP    NOT NULL DEFAULT NOW(),
                    updated_at    TIMESTAMP             DEFAULT NOW(),
                    created_by    VARCHAR,
                    updated_by    VARCHAR
                )
            """))
            db.execute(text("CREATE INDEX IF NOT EXISTS idx_reservoirs_branch_id   ON reservoirs(branch_id)"))
            db.execute(text("CREATE INDEX IF NOT EXISTS idx_reservoirs_hospital_id ON reservoirs(hospital_id)"))
            db.commit()
            logger.info("Created table: reservoirs")
        else:
            logger.info("Table reservoirs already exists — skipped")

        # ── 2. Create reservoir_logs ──────────────────────────────────────────
        if "reservoir_logs" not in existing_tables:
            db.execute(text("""
                CREATE TABLE reservoir_logs (
                    log_id            SERIAL   PRIMARY KEY,
                    reservoir_id      INTEGER  NOT NULL REFERENCES reservoirs(reservoir_id) ON DELETE CASCADE,
                    ln2_ordered_date  DATE,
                    ln2_received_date DATE,
                    created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
                    updated_at        TIMESTAMP          DEFAULT NOW(),
                    created_by        VARCHAR,
                    updated_by        VARCHAR
                )
            """))
            db.execute(text("CREATE INDEX IF NOT EXISTS idx_reservoir_logs_reservoir_id ON reservoir_logs(reservoir_id)"))
            db.commit()
            logger.info("Created table: reservoir_logs")
        else:
            logger.info("Table reservoir_logs already exists — skipped")

        # ── 3. Drop legacy columns from canister_ln2_logs (destructive — needs permission) ──
        legacy_cols = ["reservoir", "ln2_ordered_date", "ln2_received_date"]
        if "canister_ln2_logs" not in existing_tables:
            return  # nothing to do

        existing_col_names = {c["name"] for c in insp.get_columns("canister_ln2_logs")}
        cols_to_drop = [c for c in legacy_cols if c in existing_col_names]

        if not cols_to_drop:
            logger.info("canister_ln2_logs: legacy reservoir columns already removed")
            return

        # Check env-var permission gate
        allow_drop = os.environ.get("ALLOW_RESERVOIR_COLUMN_DROP", "").strip().lower() == "true"
        if not allow_drop:
            logger.warning(
                "canister_ln2_logs still has legacy columns %s. "
                "Set env var ALLOW_RESERVOIR_COLUMN_DROP=true to drop them on next startup.",
                cols_to_drop,
            )
            return

        # Check if any of the columns have live data before dropping
        for col in cols_to_drop:
            row = db.execute(
                text(f"SELECT COUNT(*) FROM canister_ln2_logs WHERE {col} IS NOT NULL")
            ).scalar()
            if row and row > 0:
                logger.warning(
                    "Column canister_ln2_logs.%s has %d non-null rows. "
                    "Data will be lost. Skipping drop — back up first or confirm by "
                    "also setting ALLOW_RESERVOIR_DATA_LOSS=true.",
                    col, row,
                )
                if os.environ.get("ALLOW_RESERVOIR_DATA_LOSS", "").strip().lower() != "true":
                    return

        for col in cols_to_drop:
            db.execute(text(f"ALTER TABLE canister_ln2_logs DROP COLUMN IF EXISTS {col}"))
            logger.info("Dropped column canister_ln2_logs.%s", col)

        db.commit()
        logger.info("canister_ln2_logs: legacy reservoir columns removed")

    except Exception as e:
        logger.warning(f"_migrate_reservoir_tables skipped or failed: {e}")
        db.rollback()
    finally:
        db.close()


def _migrate_ln2_refill_detections():
    """
    Create ln2_refill_detections table (safe, idempotent — never drops the table).
    If the table already exists it is left untouched.
    """
    db = SessionLocal()
    try:
        insp = sa_inspect(db.get_bind())
        existing_tables = insp.get_table_names()

        if "ln2_refill_detections" in existing_tables:
            logger.info("Table ln2_refill_detections already exists — skipped")
            return

        db.execute(text("""
            CREATE TABLE ln2_refill_detections (
                id            SERIAL       PRIMARY KEY,
                tank_id       INTEGER      NOT NULL REFERENCES tanks(tank_id) ON DELETE CASCADE,
                hospital_id   INTEGER      REFERENCES hospitals(hospital_id) ON DELETE SET NULL,
                branch_id     INTEGER      REFERENCES hospital_branches(branch_id) ON DELETE SET NULL,
                detected_at   TIMESTAMPTZ  NOT NULL,
                refill_weight NUMERIC(12, 4),
                is_confirmed  BOOLEAN      DEFAULT NULL,
                confirmed_by  VARCHAR(255),
                confirmed_at  TIMESTAMPTZ,
                notes         TEXT,
                created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
                updated_at    TIMESTAMPTZ           DEFAULT NOW()
            )
        """))
        db.execute(text("CREATE INDEX IF NOT EXISTS idx_refill_det_tank_detected   ON ln2_refill_detections (tank_id, detected_at)"))
        db.execute(text("CREATE INDEX IF NOT EXISTS idx_refill_det_branch_detected ON ln2_refill_detections (branch_id, detected_at)"))
        db.execute(text("CREATE INDEX IF NOT EXISTS idx_refill_det_confirmed       ON ln2_refill_detections (is_confirmed)"))
        db.execute(text("CREATE INDEX IF NOT EXISTS idx_refill_det_hospital        ON ln2_refill_detections (hospital_id)"))
        db.commit()
        logger.info("Created table: ln2_refill_detections")

    except Exception as e:
        logger.warning(f"_migrate_ln2_refill_detections skipped or failed: {e}")
        db.rollback()
    finally:
        db.close()


def sync_chat_schema():
    """
    Ensure chat tables have required columns for IVF canister chat.
    - chat_messages.tank_id (for tank-level messages)
    - chat_read_status_canister table
    """
    db = SessionLocal()
    try:
        # chat_messages: tank_id required for IVF canister chat
        db.execute(
            text(
                "ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS tank_id INTEGER REFERENCES tanks(tank_id)"
            )
        )
        db.commit()
        logger.info("Chat schema sync: ensured chat_messages.tank_id exists")

        insp = sa_inspect(db.get_bind())
        if "chat_read_status_canister" not in insp.get_table_names():
            db.execute(
                text("""
                CREATE TABLE IF NOT EXISTS chat_read_status_canister (
                    user_id VARCHAR NOT NULL REFERENCES users(user_id),
                    tank_id INTEGER NOT NULL REFERENCES tanks(tank_id),
                    last_read_message_id INTEGER REFERENCES chat_messages(id),
                    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                    PRIMARY KEY (user_id, tank_id)
                )
            """)
            )
            db.commit()
            logger.info("Chat schema sync: created chat_read_status_canister table")
    except Exception as e:
        logger.warning(f"Chat schema sync skipped or failed: {e}")
        db.rollback()
    finally:
        db.close()


def create_pharma_admins():
    """
    Create pharma admin accounts on first startup.
    Each pharma admin can approve users/managers from their own company.
    """
    logger.info("=" * 60)
    logger.info("CHECKING PHARMA ADMIN ACCOUNTS...")
    logger.info("=" * 60)

    db = SessionLocal()
    try:
        pharma_admins = settings.get_pharma_admins()

        if not pharma_admins:
            logger.warning("No pharma admins configured in environment variables")
            return

        for pharma_admin in pharma_admins:
            email = pharma_admin["email"]
            company = pharma_admin["company"]

            logger.info(f"Processing pharma admin: {email} for company: {company}")

            # First, ensure the pharma company exists
            existing_pharma = (
                db.query(pharma_model.Pharma)
                .filter(pharma_model.Pharma.pharma_name == company)
                .first()
            )
            if not existing_pharma:
                logger.error(
                    f"Pharma company '{company}' not found. Please create pharma companies first."
                )
                continue

            pharma_id = existing_pharma.id

            # Check if pharma admin already exists
            existing_admin = db.query(User).filter(User.email == email).first()

            if existing_admin:
                logger.info(f"Existing pharma admin found: {email}")

                # Update existing admin to ensure it's active and approved
                needs_update = False
                if not existing_admin.status:
                    existing_admin.status = True
                    needs_update = True
                if existing_admin.approved_status != "approved":
                    existing_admin.approved_status = "approved"
                    needs_update = True
                if existing_admin.pharma_id != pharma_id:
                    existing_admin.pharma_id = pharma_id
                    needs_update = True
                if existing_admin.role != "Pharma_admin":
                    existing_admin.role = "Pharma_admin"
                    needs_update = True

                if needs_update:
                    db.commit()
                    db.refresh(existing_admin)
                    logger.info(
                        f"Pharma admin updated: {email} (ID: {existing_admin.user_id})"
                    )
                else:
                    logger.info(f"Pharma admin already active: {email}")
                continue

            # No existing admin - create new one
            logger.info(f"Creating new pharma admin: {email}")

            # Create pharma admin
            admin_user = User(
                user_id=generate_user_id(),
                email=email,
                password_hash=get_password_hash(pharma_admin["password"]),
                first_name=pharma_admin["first_name"],
                last_name=pharma_admin["last_name"],
                role="Pharma_admin",
                pharma_id=pharma_id,
                approved_status="approved",
                status=True,
                session_timeout=120,
                created_at=datetime.now(timezone.utc),
                updated_at=datetime.now(timezone.utc),
            )

            db.add(admin_user)
            db.commit()
            db.refresh(admin_user)

            logger.info(
                f"PHARMA ADMIN CREATED: {email} (ID: {admin_user.user_id}) for pharma_id: {pharma_id}"
            )

        logger.info("=" * 60)
        logger.info(
            f"PHARMA ADMIN SETUP COMPLETE: {len(pharma_admins)} admins configured"
        )
        logger.info("=" * 60)

    except Exception as e:
        db.rollback()
        logger.error(f"ERROR creating/updating pharma admins: {str(e)}", exc_info=True)
    finally:
        db.close()


def create_pharma_companies():
    """
    Create pharma companies in the pharma table for each pharma admin.
    Pharma companies are created first, then admin users are created and linked to them.
    """
    logger.info("=" * 60)
    logger.info("CREATING PHARMA COMPANIES...")
    logger.info("=" * 60)

    db = SessionLocal()
    try:
        pharma_admins = settings.get_pharma_admins()

        if not pharma_admins:
            logger.warning("No pharma admins configured in environment variables")
            return

        for pharma_admin in pharma_admins:
            company_name = pharma_admin["company"]
            location = pharma_admin.get(
                "location"
            )  # Get location if provided, None otherwise

            logger.info(f"Processing pharma company: {company_name}")

            # Check if pharma company already exists
            existing_pharma = (
                db.query(pharma_model.Pharma)
                .filter(pharma_model.Pharma.pharma_name == company_name)
                .first()
            )

            if existing_pharma:
                logger.info(f"Pharma company already exists: {company_name}")
                # Update location if provided and different
                if location and existing_pharma.location != location:
                    existing_pharma.location = location
                    db.commit()
                    logger.info(f"Updated location for {company_name}: {location}")
                continue

            # Create new pharma company
            logger.info(f"Creating pharma company: {company_name}")

            new_pharma = pharma_model.Pharma(
                pharma_name=company_name, location=location, created_by="system"
            )

            db.add(new_pharma)
            db.commit()
            db.refresh(new_pharma)

            logger.info(f"PHARMA COMPANY CREATED: {company_name} (ID: {new_pharma.id})")

        # Show all pharma companies
        all_pharmas = db.query(pharma_model.Pharma).all()
        logger.info(f"All pharma companies in database ({len(all_pharmas)} total):")
        for pharma in all_pharmas:
            location_info = f", Location: {pharma.location}" if pharma.location else ""
            logger.info(
                f"  - ID: {pharma.id}, Name: {pharma.pharma_name}{location_info}"
            )

        logger.info("=" * 60)
        logger.info(f"PHARMA COMPANIES SETUP COMPLETE: {len(all_pharmas)} companies")
        logger.info("=" * 60)

    except Exception as e:
        db.rollback()
        logger.error(f"ERROR creating pharma companies: {str(e)}", exc_info=True)
    finally:
        db.close()


def create_hospitals_and_branches():
    """
    Create default hospital and branch for IVF users if they don't exist.
    Required for hospital users (email @zucisystems.com or @mygrape.org).
    """
    logger.info("=" * 60)
    logger.info("CHECKING HOSPITALS AND BRANCHES...")
    logger.info("=" * 60)

    db = SessionLocal()
    try:
        hospital_name = "ARC Fertility Hospitals"
        branch_name = "Main Branch"

        # Create hospital if not exists
        existing_hospital = (
            db.query(Hospital).filter(Hospital.hospital_name == hospital_name).first()
        )

        if not existing_hospital:
            hospital = Hospital(
                hospital_name=hospital_name, hospital_type="IVF", created_by="system"
            )
            db.add(hospital)
            db.commit()
            db.refresh(hospital)
            logger.info(
                f"Hospital created: {hospital_name} (ID: {hospital.hospital_id})"
            )
            hospital_id = hospital.hospital_id
        else:
            hospital_id = existing_hospital.hospital_id
            logger.info(f"Hospital already exists: {hospital_name} (ID: {hospital_id})")

        # Create branch if not exists
        existing_branch = (
            db.query(HospitalBranch)
            .filter(
                HospitalBranch.hospital_id == hospital_id,
                HospitalBranch.branch_name == branch_name,
            )
            .first()
        )

        if not existing_branch:
            branch = HospitalBranch(
                hospital_id=hospital_id,
                branch_name=branch_name,
                district_name="Default",
                state_name="Default",
                country_name="India",
                created_by="system",
            )
            db.add(branch)
            db.commit()
            db.refresh(branch)
            logger.info(
                f"Branch created: {branch_name} (ID: {branch.branch_id}) for {hospital_name}"
            )
        else:
            logger.info(f"Branch already exists: {branch_name} for {hospital_name}")

        # Create separate hospital: mygrape_test (for testing / separate tenant)
        mygrape_hospital_name = "mygrape_test"
        mygrape_branch_name = "Main"

        existing_mygrape = (
            db.query(Hospital)
            .filter(Hospital.hospital_name == mygrape_hospital_name)
            .first()
        )

        if not existing_mygrape:
            mygrape_hospital = Hospital(
                hospital_name=mygrape_hospital_name,
                hospital_type="IVF",
                created_by="system",
            )
            db.add(mygrape_hospital)
            db.commit()
            db.refresh(mygrape_hospital)
            logger.info(
                f"Hospital created: {mygrape_hospital_name} (ID: {mygrape_hospital.hospital_id})"
            )
            mygrape_hospital_id = mygrape_hospital.hospital_id
        else:
            mygrape_hospital_id = existing_mygrape.hospital_id
            logger.info(
                f"Hospital already exists: {mygrape_hospital_name} (ID: {mygrape_hospital_id})"
            )

        existing_mygrape_branch = (
            db.query(HospitalBranch)
            .filter(
                HospitalBranch.hospital_id == mygrape_hospital_id,
                HospitalBranch.branch_name == mygrape_branch_name,
            )
            .first()
        )

        if not existing_mygrape_branch:
            mygrape_branch = HospitalBranch(
                hospital_id=mygrape_hospital_id,
                branch_name=mygrape_branch_name,
                district_name="Default",
                state_name="Default",
                country_name="India",
                created_by="system",
            )
            db.add(mygrape_branch)
            db.commit()
            db.refresh(mygrape_branch)
            logger.info(
                f"Branch created: {mygrape_branch_name} (ID: {mygrape_branch.branch_id}) for {mygrape_hospital_name}"
            )
        else:
            logger.info(
                f"Branch already exists: {mygrape_branch_name} for {mygrape_hospital_name}"
            )

        logger.info("=" * 60)
        logger.info("HOSPITALS AND BRANCHES SETUP COMPLETE")
        logger.info("=" * 60)
    except Exception as e:
        db.rollback()
        logger.error(f"ERROR creating hospitals/branches: {str(e)}", exc_info=True)
    finally:
        db.close()


def create_ivf_admins():
    """
    Create IVF admin/user accounts on startup.
    Users must have email @zucisystems.com or @mygrape.org.
    """
    logger.info("=" * 60)
    logger.info("CHECKING IVF ADMIN ACCOUNTS...")
    logger.info("=" * 60)

    db = SessionLocal()
    try:
        ivf_admins = settings.get_ivf_admins()
        if not ivf_admins:
            logger.info("No ivf_admins.json found - skip IVF admin setup")
            return

        for admin in ivf_admins:
            email = admin.get("email")
            if not email:
                logger.warning("IVF admin entry missing email, skipping")
                continue

            hospital_name = admin.get("hospital_name") or "ARC Fertility Hospitals"
            branch_name = admin.get("branch_name") or "Main Branch"
            department = admin.get("department") or "IVF"
            role = admin.get("role") or "Admin"

            # Validate hospital exists
            hospital = (
                db.query(Hospital)
                .filter(Hospital.hospital_name == hospital_name)
                .first()
            )
            if not hospital:
                logger.error(
                    f"Hospital '{hospital_name}' not found. Run create_hospitals_and_branches first."
                )
                continue

            # Validate branch exists
            branch = (
                db.query(HospitalBranch)
                .filter(
                    HospitalBranch.hospital_id == hospital.hospital_id,
                    HospitalBranch.branch_name == branch_name,
                )
                .first()
            )
            if not branch:
                logger.error(f"Branch '{branch_name}' not found for {hospital_name}")
                continue

            existing = db.query(User).filter(User.email == email).first()
            if existing:
                needs_update = False
                if existing.branch_id != branch.branch_id:
                    existing.branch_id = branch.branch_id
                    needs_update = True
                if existing.hospital_id != hospital.hospital_id:
                    existing.hospital_id = hospital.hospital_id
                    needs_update = True
                if existing.department != department:
                    existing.department = department
                    needs_update = True
                if existing.role != role:
                    existing.role = role
                    needs_update = True
                if not existing.status:
                    existing.status = True
                    needs_update = True
                if existing.approved_status != "approved":
                    existing.approved_status = "approved"
                    needs_update = True
                if needs_update:
                    db.commit()
                    db.refresh(existing)
                    logger.info(f"IVF user updated: {email}")
                else:
                    logger.info(f"IVF user already exists: {email}")
                continue

            # Create new IVF user
            user = User(
                user_id=generate_user_id(),
                email=email,
                password_hash=get_password_hash(admin.get("password", "")),
                first_name=admin.get("first_name", "IVF"),
                last_name=admin.get("last_name", "User"),
                role=role,
                pharma_id=None,
                branch_id=branch.branch_id,
                hospital_id=hospital.hospital_id,
                department=department,
                status=True,
                approved_status="approved",
                created_at=datetime.now(timezone.utc),
                updated_at=datetime.now(timezone.utc),
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            logger.info(f"IVF user created: {email} (role={role}, dept={department})")

        logger.info("=" * 60)
        logger.info("IVF ADMIN SETUP COMPLETE")
        logger.info("=" * 60)
    except Exception as e:
        db.rollback()
        logger.error(f"ERROR creating IVF admins: {str(e)}", exc_info=True)
    finally:
        db.close()


def create_mygrape_admin():
    """
    Create MyGrape platform admin account.
    This admin can view all feedback tickets and manage the platform.
    """
    logger.info("=" * 60)
    logger.info("CHECKING MYGRAPE PLATFORM ADMIN...")
    logger.info("=" * 60)

    db = SessionLocal()
    try:
        # Check if MyGrape admin already exists
        existing_admin = (
            db.query(User).filter(User.email == settings.MYGRAPE_ADMIN_EMAIL).first()
        )

        if existing_admin:
            logger.info(f"MyGrape admin already exists: {settings.MYGRAPE_ADMIN_EMAIL}")
            return

        # Create MyGrape admin
        mygrape_admin = User(
            user_id=generate_user_id(),
            first_name="MyGrape",
            last_name="Admin",
            email=settings.MYGRAPE_ADMIN_EMAIL,
            password_hash=get_password_hash(settings.MYGRAPE_ADMIN_PASSWORD),
            role="Mygrape_admin",
            pharma_id=None,  # MyGrape admin doesn't belong to any pharma company
            status=True,
            approved_status="approved",
            created_by="system",
            updated_by="system",
        )

        db.add(mygrape_admin)
        db.commit()
        db.refresh(mygrape_admin)

        logger.info(
            f"MyGrape platform admin created successfully: {settings.MYGRAPE_ADMIN_EMAIL}"
        )

    except Exception as e:
        logger.error(f"ERROR creating MyGrape admin: {str(e)}")
        db.rollback()
    finally:
        db.close()


def seed_ivf_cycles():
    """
    Seed ivf_cycle and ivf_cycle_log tables with representative sample data.
    Idempotent: skips if any cycles already exist for ARC Fertility Hospitals.
    """
    logger.info("Seeding IVF cycles...")
    db = SessionLocal()
    try:
        hospital = db.query(Hospital).filter(Hospital.hospital_name == "ARC Fertility Hospitals").first()
        if not hospital:
            logger.warning("ARC Fertility Hospitals not found — skipping IVF cycle seed")
            return

        hospital_id = hospital.hospital_id
        if db.query(IvfCycle).filter(IvfCycle.hospital_id == hospital_id).first():
            logger.info("IVF cycles already seeded — skipping")
            return

        branch = db.query(HospitalBranch).filter(HospitalBranch.hospital_id == hospital_id).first()
        branch_id = branch.branch_id if branch else None

        CYCLES = [
            dict(his_id="HIS001", patient_name="Ananya Krishnan",   injection_method="ICSI",  sperm_quality="Good",         oocyte_quality="Good",           cycle_type="OG",    oocyte_m2=8, oocyte_m1=1, oocyte_gv=0, oocyte_others=1, status="Active"),
            dict(his_id="HIS002", patient_name="Priya Subramaniam", injection_method="PICSI", sperm_quality="Average",       oocyte_quality="Good",           cycle_type="DOHSP", oocyte_m2=7, oocyte_m1=2, oocyte_gv=1, oocyte_others=0, status="Active"),
            dict(his_id="HIS003", patient_name="Meena Rajan",       injection_method="ICSI",  sperm_quality="Good",         oocyte_quality="Average",        cycle_type="OG",    oocyte_m2=6, oocyte_m1=1, oocyte_gv=1, oocyte_others=2, status="Active"),
            dict(his_id="HIS004", patient_name="Divya Nair",        injection_method="IMSI",  sperm_quality="Poor",         oocyte_quality="Average to Poor", cycle_type="DET",   oocyte_m2=5, oocyte_m1=2, oocyte_gv=0, oocyte_others=1, status="Completed"),
            dict(his_id="HIS005", patient_name="Lakshmi Venkat",    injection_method="ICSI",  sperm_quality="Average (NI)", oocyte_quality="Good",           cycle_type="OG",    oocyte_m2=9, oocyte_m1=1, oocyte_gv=0, oocyte_others=0, status="Active"),
        ]

        LOGS = {
            "HIS001": [
                dict(oocyte_no=1, oocyte_comments="Good cytoplasm",    d0_maturity="MII", d0_drop_no="1", d1_pn="2PN", d1_zygote_status="Normal",   d3_drop_no="1", d3_grade="8C1", d3_symmetry="Even",            d5_stage="Blastocyst", d5_grade="4AA", fate="Freeze", freeze_no="1", meta={"d0_notes":"","d1_notes":"","d3_notes":"Good cleavage","d5_notes":"Top grade","d6_notes":"","final_notes":""}),
                dict(oocyte_no=2, oocyte_comments="Minor granularity", d0_maturity="MII", d0_drop_no="1", d1_pn="2PN", d1_zygote_status="Normal",   d3_drop_no="1", d3_grade="6C2", d3_symmetry="Slightly uneven", d5_stage="Blastocyst", d5_grade="4AB", fate="Freeze", freeze_no="2", meta={"d0_notes":"","d1_notes":"","d3_notes":"","d5_notes":"","d6_notes":"","final_notes":""}),
                dict(oocyte_no=3, oocyte_comments="Good cytoplasm",    d0_maturity="MII", d0_drop_no="2", d1_pn="2PN", d1_zygote_status="Normal",   d3_drop_no="2", d3_grade="8C1", d3_symmetry="Even",            d5_stage="Blastocyst", d5_grade="4BB", fate="Freeze", freeze_no="3", meta={"d0_notes":"","d1_notes":"","d3_notes":"","d5_notes":"","d6_notes":"","final_notes":""}),
                dict(oocyte_no=4, oocyte_comments="Good cytoplasm",    d0_maturity="MII", d0_drop_no="2", d1_pn="1PN", d1_zygote_status="Abnormal", d3_drop_no="2", d3_grade="4C3", d3_symmetry="Uneven",          d5_stage="Morula",     d5_grade=None,  fate="Discard",freeze_no=None, meta={"d0_notes":"","d1_notes":"Abnormal PN","d3_notes":"Poor cleavage","d5_notes":"","d6_notes":"","final_notes":"Discarded due to abnormal fertilization"}),
                dict(oocyte_no=5, oocyte_comments="Good cytoplasm",    d0_maturity="MI",  d0_drop_no="3", d1_pn="0PN", d1_zygote_status=None,       d3_drop_no=None,d3_grade=None,  d3_symmetry=None,              d5_stage=None,         d5_grade=None,  fate="Discard",freeze_no=None, meta={"d0_notes":"MI oocyte","d1_notes":"Failed fertilization","d3_notes":"","d5_notes":"","d6_notes":"","final_notes":""}),
            ],
            "HIS002": [
                dict(oocyte_no=1, oocyte_comments="Good cytoplasm", d0_maturity="MII", d0_drop_no="1", d1_pn="2PN", d1_zygote_status="Normal", d3_drop_no="1", d3_grade="8C1", d3_symmetry="Even",  d5_stage="Blastocyst", d5_grade="4AA", fate="Freeze", freeze_no="1", meta={"d0_notes":"","d1_notes":"","d3_notes":"","d5_notes":"","d6_notes":"","final_notes":""}),
                dict(oocyte_no=2, oocyte_comments="Good cytoplasm", d0_maturity="MII", d0_drop_no="1", d1_pn="2PN", d1_zygote_status="Normal", d3_drop_no="1", d3_grade="7C1", d3_symmetry="Even",  d5_stage="Blastocyst", d5_grade="4AB", fate="Freeze", freeze_no="2", meta={"d0_notes":"","d1_notes":"","d3_notes":"","d5_notes":"","d6_notes":"","final_notes":""}),
                dict(oocyte_no=3, oocyte_comments="Good cytoplasm", d0_maturity="MII", d0_drop_no="2", d1_pn="2PN", d1_zygote_status="Normal", d3_drop_no="2", d3_grade="6C2", d3_symmetry="Slightly uneven", d5_stage="Early Blast", d5_grade=None, fate="Discard", freeze_no=None, meta={"d0_notes":"","d1_notes":"","d3_notes":"","d5_notes":"Did not reach blast","d6_notes":"","final_notes":""}),
            ],
            "HIS003": [
                dict(oocyte_no=1, oocyte_comments="Good cytoplasm", d0_maturity="MII", d0_drop_no="1", d1_pn="2PN", d1_zygote_status="Normal", d3_drop_no="1", d3_grade="8C1", d3_symmetry="Even", d5_stage="Blastocyst", d5_grade="4BA", fate="Freeze", freeze_no="1", meta={"d0_notes":"","d1_notes":"","d3_notes":"","d5_notes":"","d6_notes":"","final_notes":""}),
                dict(oocyte_no=2, oocyte_comments="Minor granularity", d0_maturity="MII", d0_drop_no="1", d1_pn="2PN", d1_zygote_status="Normal", d3_drop_no="1", d3_grade="6C2", d3_symmetry="Slightly uneven", d5_stage="Morula", d5_grade=None, d6_stage="Blastocyst", d6_grade="5BB", d6_progression="Delayed development", fate="Freeze", freeze_no="2", meta={"d0_notes":"","d1_notes":"","d3_notes":"","d5_notes":"Slow — check D6","d6_notes":"Late blast","final_notes":""}),
            ],
            "HIS004": [
                dict(oocyte_no=1, oocyte_comments="Good cytoplasm", d0_maturity="MII", d0_drop_no="1", d1_pn="2PN", d1_zygote_status="Normal", d3_drop_no="1", d3_grade="8C1", d3_symmetry="Even", d5_stage="Blastocyst", d5_grade="4AA", fate="Transfer", freeze_no=None, meta={"d0_notes":"","d1_notes":"","d3_notes":"","d5_notes":"","d6_notes":"","final_notes":"Selected for FET"}),
                dict(oocyte_no=2, oocyte_comments="Good cytoplasm", d0_maturity="MII", d0_drop_no="1", d1_pn="2PN", d1_zygote_status="Normal", d3_drop_no="1", d3_grade="6C1", d3_symmetry="Even", d5_stage="Blastocyst", d5_grade="4BB", fate="Freeze", freeze_no="1", meta={"d0_notes":"","d1_notes":"","d3_notes":"","d5_notes":"","d6_notes":"","final_notes":""}),
            ],
            "HIS005": [
                dict(oocyte_no=1, oocyte_comments="Good cytoplasm",    d0_maturity="MII", d0_drop_no="1", d1_pn="2PN", d1_zygote_status="Normal", d3_drop_no="1", d3_grade="8C1", d3_symmetry="Even", d5_stage="Blastocyst", d5_grade="4AA", fate="Freeze", freeze_no="1", meta={"d0_notes":"","d1_notes":"","d3_notes":"","d5_notes":"","d6_notes":"","final_notes":""}),
                dict(oocyte_no=2, oocyte_comments="Good cytoplasm",    d0_maturity="MII", d0_drop_no="1", d1_pn="2PN", d1_zygote_status="Normal", d3_drop_no="1", d3_grade="8C1", d3_symmetry="Even", d5_stage="Blastocyst", d5_grade="4BB", fate="Freeze", freeze_no="2", meta={"d0_notes":"","d1_notes":"","d3_notes":"","d5_notes":"","d6_notes":"","final_notes":""}),
                dict(oocyte_no=3, oocyte_comments="Minor granularity", d0_maturity="MII", d0_drop_no="2", d1_pn="2PN", d1_zygote_status="Normal", d3_drop_no="2", d3_grade="6C2", d3_symmetry="Slightly uneven", d5_stage="Early Blast", d5_grade=None, fate="Discard", freeze_no=None, meta={"d0_notes":"","d1_notes":"","d3_notes":"","d5_notes":"","d6_notes":"","final_notes":""}),
            ],
        }

        cycle_map = {}
        for c in CYCLES:
            cycle = IvfCycle(
                hospital_id=hospital_id,
                branch_id=branch_id,
                created_by="system",
                updated_by="system",
                **c,
            )
            db.add(cycle)
            db.flush()
            cycle_map[c["his_id"]] = cycle.cycle_id

        for his_id, logs in LOGS.items():
            cycle_id = cycle_map[his_id]
            for log in logs:
                db.add(IvfCycleLog(cycle_id=cycle_id, created_by="system", updated_by="system", **log))

        db.commit()
        logger.info("Seeded %d IVF cycles with logs", len(CYCLES))
    except Exception as e:
        db.rollback()
        logger.error("ERROR seeding IVF cycles: %s", str(e), exc_info=True)
    finally:
        db.close()


def init_db():
    """
    Initialize database tables and create pharma admins and companies if not exists.
    """
    logger.info("=" * 60)
    logger.info("INITIALIZING DATABASE...")
    logger.info("=" * 60)

    Base.metadata.create_all(bind=engine)
    sync_ivf_schema()
    sync_chat_schema()
    logger.info("Database tables created/verified")

    # Create pharma companies if not exists
    # create_pharma_companies()

    # Create pharma admins if not exists
    # create_pharma_admins()

    # Create hospitals and branches for IVF users
    # create_hospitals_and_branches()

    # Seed IVF cycle sample data
    # seed_ivf_cycles()

    # Create IVF admins if ivf_admins.json exists
    # create_ivf_admins()

    # Create MyGrape platform admin if not exists
    # create_mygrape_admin()

    logger.info("Database initialization complete")
    logger.info("=" * 60)
