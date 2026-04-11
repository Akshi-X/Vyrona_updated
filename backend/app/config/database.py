from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import logging

from .config import settings
from ..constants.app_constants import DB_POOL_SIZE, DB_MAX_OVERFLOW, DB_POOL_TIMEOUT, DB_POOL_RECYCLE, DB_ECHO

logger = logging.getLogger(__name__)

# Get database URL from settings
DATABASE_URL = settings.database_url

# Create engine with connection pooling
engine = create_engine(
    DATABASE_URL, 
    pool_pre_ping=True, 
    echo=DB_ECHO,   
    pool_size=DB_POOL_SIZE,
    max_overflow=DB_MAX_OVERFLOW,
    pool_timeout=DB_POOL_TIMEOUT,
    pool_recycle=DB_POOL_RECYCLE
)

# Priority 3: Add pool monitoring function
def log_pool_status():
    """Log connection pool status for monitoring"""
    try:
        pool = engine.pool
        logger.info(
            f"[POOL] Size: {pool.size()}, Checked out: {pool.checkedout()}, "
            f"Overflow: {pool.overflow()}, Checked in: {pool.checkedin()}"
        )
    except Exception as e:
        logger.warning(f"Failed to log pool status: {e}")

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """Dependency for database session"""
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()  # Rollback on any error
        raise
    finally:
        db.close()


def init_db():
    """Initialize database tables"""
    # Import all model modules so SQLAlchemy registers the tables
    from ..models import (
        user_model,
        otp_model,
        patient_model,
        patient_stage_model,
        feedback_model,
        feedback_attachment,
        feedback_comments,
        shipment_model,
        shipment_leg_model,
        therapy_model,
        pharma_model,
        provider_model,
        carrier_model,
        task_model,
        chat_model,
        chat_read_status,
        chat_read_status_canister,
        chat_message_tag,
        telemetry_model,
        quality_log_model,
        geolocation_model,
    )
    # Import IVF models
    from ..models.IVF import (
        hospital_model,
        hospital_branch_model,
        tank_model,
        canister_ln2_log_model,
        patient_crylock_info_model,
        critical_alert_model,
    )
    from ..models.IVF import (
        device_model,
        ln2_iot_device_model,
        ln2_readings_model,
        ln2_iot_raw_data_model,
    )
    from ..models import kpi_config_model, readings_model

    from ..models import onboarding_state_model, onboarding_event_model

    # Note: IVF schema separation has been removed
    # All tables (including IVF tables) are now in public schema
    # If you need to migrate existing tables from ivf schema to public schema,
    # run the migration script: migrations/move_ivf_schema_to_public.sql
    
    # Create all tables in public schema
    Base.metadata.create_all(bind=engine)
