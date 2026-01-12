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
    finally:
        db.close()


def init_db():
    """Initialize database tables"""
    # Import all model modules so SQLAlchemy registers the tables
    from ..models import (
        user_model,
        otp_model,
        ivf_otp_model,
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
        chat_message_tag,
        telemetry_model,
        quality_log_model,
        geolocation_model,
    )
    # Import IVF models
    from ..models.IVF import (
        hospital_model,
        hospital_branch_model,
        branch_login_model,
        tank_model,
        canister_model,
        canister_ln2_log_model,
        cane_model,
        cryolock_model,
        patient_model as ivf_patient_model,
        embryo_model
    )
    # Explicitly import IVFOTP to ensure it's registered
    from ..models.ivf_otp_model import IVFOTP
    
    # Create IVF schema if it doesn't exist
    with engine.connect() as conn:
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS ivf"))
        conn.commit()
    
    # Create all tables (main tables in public schema, IVF tables in ivf schema)
    Base.metadata.create_all(bind=engine)
