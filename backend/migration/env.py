"""
Alembic environment configuration for database migrations.

This file is used by Alembic to:
1. Connect to the database
2. Discover all SQLAlchemy models
3. Generate migration scripts automatically
"""

from logging.config import fileConfig
import sys
import os
from pathlib import Path

from sqlalchemy import engine_from_config
from sqlalchemy import pool
from alembic import context

# Get the backend directory (parent of migration directory)
# This ensures we can import app modules correctly
backend_dir = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(backend_dir))

# Import your database configuration
from app.config.database import Base, engine
from app.config.config import settings

# Import all models so Alembic can detect them
# This is critical - Alembic needs to see all your models
# We import both the modules AND the model classes to ensure they're registered with Base.metadata

# Import model modules (triggers class definition and registration with Base)
from app.models import (
    user_model,
    otp_model,
    patient_model,
    patient_stage_model,
    feedback_model,
    feedback_attachment,
    feedback_comments,
    shipment_model,
    shipment_leg_model,
    pharma_model,
    provider_model,
    carrier_model,
    task_model,
    chat_model,
    chat_read_status,
)

# Also import the model classes explicitly to ensure they're loaded
# This helps Alembic detect all models even if they're not directly used
from app.models.user_model import User
from app.models.otp_model import OTP
from app.models.patient_model import Patient
from app.models.patient_stage_model import PatientStage
from app.models.feedback_model import Feedback
from app.models.feedback_attachment import FeedbackAttachment
from app.models.feedback_comments import Comment
from app.models.pharma_model import Pharma
from app.models.provider_model import Provider
from app.models.carrier_model import Carrier
from app.models.shipment_model import Shipment
from app.models.shipment_leg_model import ShipmentLeg
from app.models.task_model import Tasks
from app.models.chat_model import ChatMessage
from app.models.chat_read_status import ChatReadStatus

# Import IVF model modules
from app.models.IVF import (
    hospital_model,
    hospital_branch_model,
    tank_model,
    canister_model,
    canister_ln2_log_model,
    cane_model,
    cryolock_model,
    patient_model as ivf_patient_model,
    embryo_model
)

# Import IVF model classes explicitly
from app.models.IVF.hospital_model import Hospital
from app.models.IVF.hospital_branch_model import HospitalBranch
from app.models.IVF.tank_model import Tank
from app.models.IVF.canister_model import Canister
from app.models.IVF.canister_ln2_log_model import CanisterLn2Log
from app.models.IVF.cane_model import Cane
from app.models.IVF.cryolock_model import Cryolock
from app.models.IVF.patient_model import IVFPatient
from app.models.IVF.embryo_model import Embryo

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Override sqlalchemy.url from alembic.ini with our settings
# This ensures we use the same database connection as the app
# The database URL comes from your .env file via settings
# Use attributes dict to bypass ConfigParser interpolation (handles % in passwords)
config.attributes['sqlalchemy.url'] = settings.database_url

# Add your model's MetaData object here
# for 'autogenerate' support
# All models imported above will be registered in Base.metadata
target_metadata = Base.metadata

# other values from the config, defined by the needs of env.py,
# can be acquired:
# my_important_option = config.get_main_option("my_important_option")
# ... etc.


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    # Get URL from attributes (bypasses ConfigParser interpolation issues)
    url = config.attributes.get('sqlalchemy.url', config.get_main_option("sqlalchemy.url"))
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,  # Detect column type changes
        compare_server_default=True,  # Detect default value changes
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.

    """
    # Use the existing engine from database.py
    # This ensures we use the same connection settings (pooling, etc.)
    connectable = engine

    with connectable.connect() as connection:
        context.configure(
            connection=connection, 
            target_metadata=target_metadata,
            compare_type=True,  # Detect column type changes
            compare_server_default=True,  # Detect default value changes
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()

