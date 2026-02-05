#!/usr/bin/env python3
"""
Standalone Publisher Service
A single-file webhook receiver that publishes quality data to Redis.

This script is completely self-contained - no external files needed!
- Reads configuration from environment variables only
- No .publisher.env file required
- All dependencies embedded in this single file

Required Python packages:
- fastapi, uvicorn, redis, sqlalchemy, psycopg2-binary, pydantic-settings

================================================================================
HOW TO SET ENVIRONMENT VARIABLES:
================================================================================

WINDOWS (PowerShell):
--------------------
$env:DB_USER="postgres"
$env:DB_PASSWORD="your_password"
$env:DB_HOST="localhost"
$env:DB_NAME="mygrape"
$env:REDIS_HOST="localhost"
$env:REDIS_PORT="6379"
$env:REDIS_PASSWORD="your_redis_password"
$env:PUBLISHER_HOST="0.0.0.0"
$env:PUBLISHER_PORT="8000"
python publisher_standalone.py

WINDOWS (CMD):
--------------
set DB_USER=postgres
set DB_PASSWORD=your_password
set DB_HOST=localhost
set DB_NAME=mygrape
set REDIS_HOST=localhost
set REDIS_PORT=6379
set REDIS_PASSWORD=your_redis_password
set PUBLISHER_HOST=0.0.0.0
set PUBLISHER_PORT=8000
python publisher_standalone.py

LINUX/MAC (Bash):
-----------------
14.141.162.122:8000
python publisher_standalone.py

OR set them inline:
-------------------
DB_USER=postgres DB_PASSWORD=your_password DB_HOST=localhost DB_NAME=mygrape \
REDIS_PASSWORD=your_redis_password PUBLISHER_PORT=8000 python publisher_standalone.py
"""

import time
import json
import redis
import sys
import os
import logging
import asyncio
from datetime import datetime, timedelta
from typing import Dict, Any, Optional
from fastapi import FastAPI, Request, BackgroundTasks
from fastapi.responses import JSONResponse
import uvicorn
from urllib.parse import quote_plus

# Try to import CriticalAlertService at top level (may fail if app directory not available)
try:
    # Add backend directory to path to import from app
    current_dir = os.path.dirname(os.path.abspath(__file__))
    backend_dir = current_dir  # publisher.py is in backend/
    if backend_dir not in sys.path:
        sys.path.insert(0, backend_dir)
    from app.service.IVF.critical_alert_service import CriticalAlertService
    CRITICAL_ALERT_SERVICE_AVAILABLE = True
except ImportError:
    CRITICAL_ALERT_SERVICE_AVAILABLE = False
    CriticalAlertService = None

# Setup logging with immediate output
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
    force=True  # Override any existing configuration
)
logger = logging.getLogger(__name__)

# Force unbuffered output for immediate visibility
sys.stdout.reconfigure(line_buffering=True) if hasattr(sys.stdout, 'reconfigure') else None

# ============================================================================
# Configuration - Load from environment variables or .publisher.env file
# ============================================================================

try:
    from pydantic_settings import BaseSettings
    from pydantic import ConfigDict
    
    class PublisherSettings(BaseSettings):
        """Publisher settings loaded from environment variables"""
        # Pydantic V2 configuration
        model_config = ConfigDict(
            case_sensitive=True,
            extra="ignore"
        )
        
        # Redis Configuration
        REDIS_HOST: str = "localhost"
        REDIS_PORT: int = 6379
        REDIS_DB: int = 0
        REDIS_PASSWORD: str = ""
        REDIS_SOCKET_CONNECT_TIMEOUT: int = 5
        REDIS_SOCKET_TIMEOUT: int = 5
        
        # Database Configuration (required - set via environment variables)
        DB_USER: str
        DB_PASSWORD: str
        DB_HOST: str
        DB_PORT: str = "5432"
        DB_NAME: str
        
        # Publisher Server Configuration
        PUBLISHER_HOST: str = "0.0.0.0"
        PUBLISHER_PORT: int = 8000
        
        @property
        def database_url(self) -> str:
            """Construct database URL from components"""
            password = quote_plus(self.DB_PASSWORD)
            return f"postgresql+psycopg2://{self.DB_USER}:{password}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
    
    # Load settings from environment variables only (no .publisher.env file needed)
    try:
        # Explicitly check environment variable first
        env_port = os.getenv('PUBLISHER_PORT')
        if env_port:
            try:
                env_port = int(env_port)
                print(f"✓ Found PUBLISHER_PORT={env_port} in environment")
            except ValueError:
                print(f"⚠ Warning: PUBLISHER_PORT={env_port} is not a valid integer, using default")
                env_port = None
        
        publisher_settings = PublisherSettings()
        
        # Verify port was read correctly
        if env_port and publisher_settings.PUBLISHER_PORT != env_port:
            print(f"⚠ Warning: Environment variable PUBLISHER_PORT={env_port} but settings show {publisher_settings.PUBLISHER_PORT}")
        else:
            print(f"✓ Using port: {publisher_settings.PUBLISHER_PORT}")
    except Exception as e:
        print("\n" + "=" * 60)
        print("ERROR: Missing required environment variables!")
        print("=" * 60)
        print("Please set these environment variables before running:")
        print("\nRequired:")
        print("  DB_USER=postgres")
        print("  DB_PASSWORD=your_password")
        print("  DB_HOST=localhost")
        print("  DB_NAME=mygrape")
        print("\nOptional (have defaults):")
        print("  REDIS_HOST=localhost")
        print("  REDIS_PORT=6379")
        print("  REDIS_PASSWORD=your_redis_password")
        print("  PUBLISHER_HOST=0.0.0.0")
        print("  PUBLISHER_PORT=8000")
        print("\nExample (PowerShell):")
        print('  $env:DB_USER="postgres"')
        print('  $env:DB_PASSWORD="your_password"')
        print('  $env:DB_HOST="localhost"')
        print('  $env:DB_NAME="mygrape"')
        print("=" * 60 + "\n")
        sys.exit(1)
        
except ImportError:
    print("ERROR: pydantic-settings not installed. Install with: pip install pydantic-settings")
    sys.exit(1)

# ============================================================================
# Database Connection
# ============================================================================

try:
    from sqlalchemy import create_engine, text, bindparam
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.dialects.postgresql import JSONB
    
    # Create database engine
    engine = create_engine(
        publisher_settings.database_url,
        pool_pre_ping=True,
        echo=False,
        pool_size=5,
        max_overflow=10,
        pool_timeout=30,
        pool_recycle=3600
    )
    
    # Create session factory
    PublisherSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    
    # Ensure telemetry_data table exists (creates it if missing)
    def ensure_telemetry_table_exists():
        ddl = text("""
        CREATE TABLE IF NOT EXISTS telemetry_data (
            id BIGSERIAL PRIMARY KEY,
            shipment_id VARCHAR(255) NOT NULL,
            telemetry_data JSONB NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        )
        """)
        try:
            with engine.begin() as conn:
                conn.execute(ddl)
            print("✓ Ensured telemetry_data table exists", flush=True)
        except Exception as e:
            print(f"✗ Failed to ensure telemetry_data table: {e}", flush=True)

    # Run table creation check at startup
    ensure_telemetry_table_exists()
except ImportError:
    print("ERROR: sqlalchemy or psycopg2 not installed.")
    print("Install with: pip install sqlalchemy psycopg2-binary")
    sys.exit(1)

# ============================================================================
# Print Configuration Info
# ============================================================================

print("=" * 60)
print("PUBLISHER STARTUP - Standalone Configuration")
print("=" * 60)
print(f"Redis: {publisher_settings.REDIS_HOST}:{publisher_settings.REDIS_PORT} (DB: {publisher_settings.REDIS_DB})")
print(f"Database: {publisher_settings.DB_HOST}:{publisher_settings.DB_PORT}/{publisher_settings.DB_NAME}")
print("=" * 60)

# ============================================================================
# Redis Connection
# ============================================================================

try:
    redis_kwargs = {
        "host": publisher_settings.REDIS_HOST,
        "port": publisher_settings.REDIS_PORT,
        "db": publisher_settings.REDIS_DB,
        "decode_responses": True,
        "socket_connect_timeout": publisher_settings.REDIS_SOCKET_CONNECT_TIMEOUT,
        "socket_timeout": publisher_settings.REDIS_SOCKET_TIMEOUT
    }
    if publisher_settings.REDIS_PASSWORD:
        redis_kwargs["password"] = publisher_settings.REDIS_PASSWORD
    
    r = redis.Redis(**redis_kwargs)
    r.ping()
    print(f"✓ Redis connection established successfully")
except Exception as e:
    print(f"✗ Failed to connect to Redis: {e}")
    sys.exit(1)

# ============================================================================
# Get Patient IDs from Database
# ============================================================================

def get_patient_ids_from_db():
    """Fetch all patient IDs from the patient table using raw SQL query"""
    db = PublisherSessionLocal()
    try:
        result = db.execute(text("SELECT id FROM patient"))
        patient_ids = [row[0] for row in result]
        return patient_ids
    except Exception as e:
        print(f"Error fetching patients from database: {e}")
        import traceback
        traceback.print_exc()
        return []
    finally:
        db.close()

PATIENTS = get_patient_ids_from_db()

if not PATIENTS:
    print("Warning: No patients found in the database. Publisher will not publish any data.")
    print("Please ensure there are patients in the patient table before running the publisher.")

# ============================================================================
# IVF Shipment Detection
# ============================================================================

def find_ivf_shipment_by_identifiers(db, shipment_id: Optional[str] = None, 
                                     device_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """
    Find IVF shipment by shipment_id, iot_shipment_id, or device_id.
    Also fetches canister_number for WebSocket matching.
    
    Returns dict with: shipment_id, canister_id, canister_number, device_id, or None if not found.
    """
    try:
        # Import IVF model (using raw SQL to avoid import dependencies)
        query = text("""
            SELECT 
                ivf.shipment_id,
                ivf.iot_shipment_id,
                ivf.canister_id,
                ivf.device_id,
                ivf.cryolock_id,
                ivf.source_branch_id,
                ivf.destination_branch_id,
                c.canister_number
            FROM ivf_shipment ivf
            LEFT JOIN canisters c ON ivf.canister_id = c.canister_id
            WHERE 
                (ivf.shipment_id = :shipment_id AND :shipment_id IS NOT NULL)
                OR (ivf.iot_shipment_id = :shipment_id AND :shipment_id IS NOT NULL)
                OR (ivf.device_id = :device_id AND :device_id IS NOT NULL)
            ORDER BY ivf.created_at DESC
            LIMIT 1
        """)
        
        result = db.execute(query, {
            "shipment_id": shipment_id,
            "device_id": device_id
        })
        row = result.fetchone()
        
        if row:
            return {
                "shipment_id": row[0],
                "iot_shipment_id": row[1],
                "canister_id": row[2],
                "device_id": row[3],
                "cryolock_id": row[4],
                "source_branch_id": row[5],
                "destination_branch_id": row[6],
                "canister_number": row[7]  # Include canister_number for WebSocket matching
            }
        return None
    except Exception as e:
        logger.error(f"Error finding IVF shipment: {e}", exc_info=True)
        return None

def find_canister_by_tive_device_id(db, device_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """
    Find canister by tive_device_id (for canister monitoring scenario).
    
    Returns dict with: canister_id, canister_number, or None if not found.
    """
    if not device_id:
        return None
    
    try:
        query = text("""
            SELECT 
                canister_id,
                canister_number,
                tank_id,
                is_active,
                canister_status
            FROM canisters
            WHERE tive_device_id = :device_id
            AND is_active = true
            ORDER BY canister_id DESC
            LIMIT 1
        """)
        
        result = db.execute(query, {"device_id": device_id})
        row = result.fetchone()
        
        if row:
            return {
                "canister_id": row[0],
                "canister_number": row[1],
                "tank_id": row[2],
                "is_active": row[3],
                "canister_status": row[4]
            }
        return None
    except Exception as e:
        logger.error(f"Error finding canister by tive_device_id: {e}", exc_info=True)
        return None

def extract_device_id_from_webhook(webhook_data: Dict[str, Any]) -> Optional[str]:
    """
    Extract device_id from webhook data.
    Priority: EntityName (primary device identifier) > DeviceId > other fields
    """
    # Priority 1: EntityName (used as device_id for IVF canister/shipment mapping)
    device_id = webhook_data.get("EntityName")
    
    # Priority 2: Check other possible locations for device ID
    if not device_id:
        device_id = (
            webhook_data.get("DeviceId") or
            webhook_data.get("deviceId") or
            webhook_data.get("Device") or
            webhook_data.get("device") or
            webhook_data.get("TrackerId") or
            webhook_data.get("trackerId")
        )
    
    # Priority 3: Check in Shipment object
    if not device_id and "Shipment" in webhook_data:
        shipment_obj = webhook_data.get("Shipment")
        if isinstance(shipment_obj, dict):
            device_id = (
                shipment_obj.get("DeviceId") or
                shipment_obj.get("deviceId") or
                shipment_obj.get("Devices") or
                shipment_obj.get("devices")
            )
            # If Devices is a list, get first element
            if isinstance(device_id, list) and len(device_id) > 0:
                device_id = device_id[0]
    
    return device_id

# ============================================================================
# Parameter Thresholds (Fallback defaults - will be overridden by Therapy table or Tive if available)
# ============================================================================

PARAMETER_THRESHOLDS = {
    "temperature": {"min": 2, "max": 8, "unit": "°C"},
    "humidity": {"min": None, "max": 90, "unit": "%"},
    "agitation": {"min": 0, "max": 5, "unit": "G"},
}

# Cache for discovered foreign key column names (to avoid repeated schema queries)
_FK_COLUMNS_CACHE: Optional[Dict[str, str]] = None

def discover_fk_columns(db) -> Optional[Dict[str, str]]:
    """
    Discover the actual foreign key column names by querying the database schema.
    Returns a dict with keys: 'therapy_to_shipment_leg', 'shipment_leg_to_shipment', 'shipment_to_patient'
    Uses module-level cache to avoid repeated schema queries.
    """
    global _FK_COLUMNS_CACHE
    
    # Return cached value if available
    if _FK_COLUMNS_CACHE is not None:
        return _FK_COLUMNS_CACHE
    
    try:
        # Query to find foreign key relationships using information_schema
        fk_query = text("""
            SELECT 
                tc.table_name,
                kcu.column_name,
                ccu.table_name AS foreign_table_name,
                ccu.column_name AS foreign_column_name
            FROM information_schema.table_constraints AS tc
            JOIN information_schema.key_column_usage AS kcu
                ON tc.constraint_name = kcu.constraint_name
                AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage AS ccu
                ON ccu.constraint_name = tc.constraint_name
                AND ccu.table_schema = tc.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY'
                AND tc.table_schema = 'public'
                AND (
                    (tc.table_name = 'therapy' AND ccu.table_name = 'shipment_leg')
                    OR (tc.table_name = 'shipment_leg' AND ccu.table_name = 'shipment')
                    OR (tc.table_name = 'shipment' AND ccu.table_name = 'patient')
                )
            ORDER BY tc.table_name, kcu.column_name
        """)
        
        result = db.execute(fk_query)
        rows = result.fetchall()
        
        fk_columns = {}
        for row in rows:
            table_name, column_name, foreign_table, foreign_column = row
            
            if table_name == 'therapy' and foreign_table == 'shipment_leg':
                fk_columns['therapy_to_shipment_leg'] = column_name
            elif table_name == 'shipment_leg' and foreign_table == 'shipment':
                fk_columns['shipment_leg_to_shipment'] = column_name
            elif table_name == 'shipment' and foreign_table == 'patient':
                fk_columns['shipment_to_patient'] = column_name
        
        if len(fk_columns) == 3:
            logger.info(f"Discovered FK columns: {fk_columns}")
            # Cache the discovered columns
            _FK_COLUMNS_CACHE = fk_columns
            return fk_columns
        else:
            logger.warning(f"Could not discover all FK columns. Found: {fk_columns}")
            return None
            
    except Exception as e:
        logger.warning(f"Error discovering FK columns from schema: {e}")
        return None

def get_thresholds_from_therapy_table(patient_id: str) -> Optional[Dict[str, Dict[str, Any]]]:
    """
    Fetch threshold values from therapy table for a given patient.
    Returns thresholds dict in the same format as PARAMETER_THRESHOLDS, or None if not found.
    
    Table relationships:
    - therapy -> shipment_leg (therapy has FK to shipment_leg)
    - shipment_leg -> shipment (shipment_leg has FK to shipment)
    - shipment -> patient (shipment has FK to patient)
    
    Expected therapy table columns:
    - temperature_min, temperature_max (numeric, nullable)
    - humidity_min, humidity_max (numeric, nullable)
    - agitation_min, agitation_max (numeric, nullable)
    """
    db = PublisherSessionLocal()
    try:
        # First, discover the actual FK column names from the database schema
        fk_columns = discover_fk_columns(db)
        
        if not fk_columns:
            logger.error("Could not discover foreign key column names from database schema")
            return None
        
        therapy_fk = fk_columns['therapy_to_shipment_leg']
        shipment_leg_fk = fk_columns['shipment_leg_to_shipment']
        shipment_fk = fk_columns['shipment_to_patient']
        
        # Now use the discovered column names in a single query
        query_str = f"""
            SELECT 
                t.temperature_min, t.temperature_max,
                t.humidity_min, t.humidity_max,
                t.agitation_min, t.agitation_max
            FROM therapy t
            INNER JOIN shipment_leg sl ON t.{therapy_fk} = sl.id
            INNER JOIN shipment s ON sl.{shipment_leg_fk} = s.id
            WHERE s.{shipment_fk} = :patient_id
            ORDER BY t.id DESC
            LIMIT 1
        """
        
        query = text(query_str)
        result = db.execute(query, {"patient_id": patient_id})
        row = result.fetchone()
        
        if row is None:
            logger.debug(f"No therapy record found for patient {patient_id} through shipment_leg and shipment joins")
            return None
        
        # Process the row data
        thresholds = {}
        
        # Map database columns to threshold format
        # temperature_min, temperature_max
        if row[0] is not None or row[1] is not None:
            thresholds["temperature"] = {
                "min": float(row[0]) if row[0] is not None else None,
                "max": float(row[1]) if row[1] is not None else None,
                "unit": "°C"
            }
        
        # humidity_min, humidity_max
        if row[2] is not None or row[3] is not None:
            thresholds["humidity"] = {
                "min": float(row[2]) if row[2] is not None else None,
                "max": float(row[3]) if row[3] is not None else None,
                "unit": "%"
            }
        
        # agitation_min, agitation_max
        if row[4] is not None or row[5] is not None:
            thresholds["agitation"] = {
                "min": float(row[4]) if row[4] is not None else None,
                "max": float(row[5]) if row[5] is not None else None,
                "unit": "G"
            }
        
        if thresholds:
            logger.info(f"✓ Fetched thresholds from therapy table for patient {patient_id}: {json.dumps(thresholds, indent=2)}")
            print(f"✓ Using thresholds from therapy table for patient {patient_id}", flush=True)
            for param, threshold in thresholds.items():
                print(f"  - {param}: {threshold.get('min')} - {threshold.get('max')} {threshold.get('unit', '')}", flush=True)
            return thresholds
        else:
            logger.debug(f"No threshold values found in therapy table for patient {patient_id}")
            return None
            
    except Exception as e:
        logger.error(f"Error fetching thresholds from therapy table for patient {patient_id}: {e}", exc_info=True)
        print(f"✗ Error fetching thresholds from therapy table: {e}", flush=True)
        import traceback
        traceback.print_exc()
        return None
    finally:
        db.close()

def analyze_table_structure(db, table_name: str) -> Optional[Dict[str, Any]]:
    """
    Analyze table structure from the database.
    Returns a dictionary with column information.
    """
    try:
        query = text("""
            SELECT 
                column_name,
                data_type,
                character_maximum_length,
                numeric_precision,
                numeric_scale,
                is_nullable,
                column_default,
                ordinal_position
            FROM information_schema.columns
            WHERE table_schema = 'public'
            AND table_name = :table_name
            ORDER BY ordinal_position
        """)
        result = db.execute(query, {"table_name": table_name})
        columns = result.fetchall()
        
        if not columns:
            return None
        
        column_info = {}
        for col in columns:
            col_name, data_type, max_length, precision, scale, nullable, default, position = col
            column_info[col_name] = {
                "data_type": data_type,
                "max_length": max_length,
                "precision": precision,
                "scale": scale,
                "is_nullable": nullable == "YES",
                "default": default,
                "position": position
            }
        
        return column_info
    except Exception as e:
        logger.error(f"Error analyzing table {table_name}: {e}", exc_info=True)
        return None

def get_shipment_leg_id(db, shipment_id: Any) -> Optional[int]:
    """
    Get shipment_leg_id from shipment_id by querying the database.
    Returns the shipment_leg.id that corresponds to the given shipment_id.
    """
    try:
        # shipment_leg.shipment_id is an INTEGER FK to shipment.id.
        # Webhooks sometimes provide an external/public shipment identifier like "SHIP-2025-004".
        # If shipment_id is not int-like, avoid querying (it would error and abort the transaction).
        if shipment_id is None:
            return None

        shipment_id_int: Optional[int] = None
        if isinstance(shipment_id, int):
            shipment_id_int = shipment_id
        elif isinstance(shipment_id, str):
            shipment_id_str = shipment_id.strip()
            if shipment_id_str.isdigit():
                shipment_id_int = int(shipment_id_str)
            else:
                logger.warning(
                    "Skipping shipment_leg lookup: shipment_id is not an integer shipment.id "
                    f"(got {shipment_id!r})"
                )
                return None
        else:
            logger.warning(
                "Skipping shipment_leg lookup: shipment_id is not an integer shipment.id "
                f"(got type={type(shipment_id).__name__}, value={shipment_id!r})"
            )
            return None

        # Discover FK column name from shipment_leg to shipment
        fk_columns = discover_fk_columns(db)
        if not fk_columns:
            logger.warning("Could not discover FK columns, trying default column name")
            shipment_leg_fk = "shipment_id"  # Default assumption
        else:
            shipment_leg_fk = fk_columns.get('shipment_leg_to_shipment', 'shipment_id')
        
        # Query to get shipment_leg.id from shipment_id
        query = text(f"""
            SELECT id 
            FROM shipment_leg 
            WHERE {shipment_leg_fk} = :shipment_id
            ORDER BY id DESC
            LIMIT 1
        """)
        result = db.execute(query, {"shipment_id": shipment_id_int})
        row = result.fetchone()
        
        if row:
            shipment_leg_id = row[0]
            logger.debug(f"Found shipment_leg_id={shipment_leg_id} for shipment_id={shipment_id_int}")
            return shipment_leg_id
        else:
            logger.warning(f"No shipment_leg found for shipment_id={shipment_id_int}")
            return None
    except Exception as e:
        logger.error(f"Error getting shipment_leg_id for shipment_id={shipment_id}: {e}", exc_info=True)
        # Make sure one failed lookup doesn't abort the surrounding transaction/session.
        try:
            db.rollback()
        except Exception:
            pass
        return None

def insert_quality_log(db, telemetry_data_id: int, shipment_id: str, data: Dict[str, Any], created_at: datetime) -> bool:
    """
    Insert data into quality_log table.
    
    Expected columns:
    - id (auto-generated)
    - telemetry_data_id (FK to telemetry_data.id)
    - patient_id
    - shipment_leg_id
    - temperature
    - humidity
    - agitation
    - quality_loss
    - is_temp_loss
    - is_humidity_loss
    - is_agitation_loss
    - reading_timestamp
    - created_at (default now())
    - updated_at (default now())
    - created_by (nullable)
    - updated_by (nullable)
    """
    try:
        # Get shipment_leg_id from shipment_id
        shipment_leg_id = get_shipment_leg_id(db, shipment_id)
        
        # Get threshold violations to set boolean flags
        threshold_violations = data.get("threshold_violations", {})
        is_temp_loss = threshold_violations.get("temperature", False)
        is_humidity_loss = threshold_violations.get("humidity", False)
        is_agitation_loss = threshold_violations.get("agitation", False)
        
        # Build insert query
        #
        # NOTE: Although the SQLAlchemy model defines defaults for created_at/updated_at,
        # this function uses raw SQL, so we explicitly provide these values to satisfy
        # NOT NULL constraints even if the DB schema lacks server defaults.
        insert_query = text("""
            INSERT INTO quality_log 
            (telemetry_data_id, patient_id, shipment_leg_id, temperature, humidity, agitation, 
             quality_loss, is_temp_loss, is_humidity_loss, is_agitation_loss, reading_timestamp,
             created_at, updated_at)
            VALUES (:telemetry_data_id, :patient_id, :shipment_leg_id, :temperature, :humidity, :agitation,
                    :quality_loss, :is_temp_loss, :is_humidity_loss, :is_agitation_loss, :reading_timestamp,
                    :created_at, :updated_at)
        """)
        
        db.execute(insert_query, {
            "telemetry_data_id": telemetry_data_id,
            "patient_id": data.get("patient_id"),
            "shipment_leg_id": shipment_leg_id,
            "temperature": data.get("temperature"),
            "humidity": data.get("humidity"),
            "agitation": data.get("agitation"),
            "quality_loss": data.get("quality_loss"),
            "is_temp_loss": is_temp_loss,
            "is_humidity_loss": is_humidity_loss,
            "is_agitation_loss": is_agitation_loss,
            "reading_timestamp": created_at,
            "created_at": created_at,
            "updated_at": created_at,
        })
        
        logger.info(f"✓ Inserted into quality_log table (telemetry_data_id={telemetry_data_id}, shipment_id={shipment_id})")
        print(f"  → Inserted into quality_log table (telemetry_data_id={telemetry_data_id})", flush=True)
        return True
        
    except Exception as e:
        logger.error(f"Error inserting into quality_log table: {e}", exc_info=True)
        print(f"  ✗ Error inserting into quality_log: {e}", flush=True)
        import traceback
        traceback.print_exc()
        try:
            db.rollback()
        except Exception:
            pass
        return False

def insert_geolocation(db, telemetry_data_id: int, shipment_id: str, data: Dict[str, Any], created_at: datetime) -> bool:
    """
    Insert data into geolocation table.
    
    Expected columns:
    - id (auto-generated)
    - telemetry_data_id (FK to telemetry_data.id)
    - patient_id
    - shipment_leg_id
    - latitude (current location)
    - longitude (current location)
    - ship_from_latitude
    - ship_from_longitude
    - ship_from_address (could be TEXT or JSONB)
    - ship_to_latitude
    - ship_to_longitude
    - ship_to_address (could be TEXT or JSONB)
    - reading_timestamp
    - created_at (default now())
    - updated_at (default now())
    - created_by (nullable)
    - updated_by (nullable)
    """
    try:
        # Geolocation table schema (see app/models/geolocation_model.py):
        # - shipment_id (String)
        # - current_latitude/current_longitude
        # - shipment_from_* / shipment_to_*
        # - reading_timestamp, created_at, updated_at
        #
        # NOTE: This table does NOT have shipment_leg_id and does NOT store addresses.

        ship_from = data.get("ship_from", {}) if isinstance(data.get("ship_from", {}), dict) else {}
        ship_to = data.get("ship_to", {}) if isinstance(data.get("ship_to", {}), dict) else {}

        insert_query = text("""
            INSERT INTO geolocation 
            (shipment_id, patient_id, telemetry_data_id,
             current_latitude, current_longitude,
             shipment_from_latitude, shipment_from_longitude,
             shipment_to_latitude, shipment_to_longitude,
             reading_timestamp, created_at, updated_at)
            VALUES (:shipment_id, :patient_id, :telemetry_data_id,
                    :current_latitude, :current_longitude,
                    :shipment_from_latitude, :shipment_from_longitude,
                    :shipment_to_latitude, :shipment_to_longitude,
                    :reading_timestamp, :created_at, :updated_at)
        """)
        
        db.execute(insert_query, {
            "shipment_id": shipment_id,
            "telemetry_data_id": telemetry_data_id,
            "patient_id": data.get("patient_id"),
            "current_latitude": data.get("latitude"),
            "current_longitude": data.get("longitude"),
            "shipment_from_latitude": ship_from.get("latitude"),
            "shipment_from_longitude": ship_from.get("longitude"),
            "shipment_to_latitude": ship_to.get("latitude"),
            "shipment_to_longitude": ship_to.get("longitude"),
            "reading_timestamp": created_at,
            "created_at": created_at,
            "updated_at": created_at,
        })
        
        logger.info(f"✓ Inserted into geolocation table (telemetry_data_id={telemetry_data_id}, shipment_id={shipment_id})")
        print(f"  → Inserted into geolocation table (telemetry_data_id={telemetry_data_id})", flush=True)
        return True
        
    except Exception as e:
        logger.error(f"Error inserting into geolocation table: {e}", exc_info=True)
        print(f"  ✗ Error inserting into geolocation: {e}", flush=True)
        import traceback
        traceback.print_exc()
        try:
            db.rollback()
        except Exception:
            pass
        return False

def insert_ivf_telemetry_data(canister_id: int, data: Dict[str, Any]) -> bool:
    """
    Insert IVF telemetry data into the ivf_telemetry_data table.
    Also inserts into ivf_quality_log and ivf_geolocation tables.
    Automatically triggers alert creation and email sending if violations are detected.
    """
    db = PublisherSessionLocal()
    try:
        # Prepare telemetry_data payload
        telemetry_payload = data

        # Use timestamp from data if available, otherwise use current time
        created_at = data.get("timestamp")
        if created_at:
            try:
                if isinstance(created_at, str):
                    dt = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                    created_at = dt
            except:
                created_at = datetime.now()
        else:
            created_at = datetime.now()

        # Insert into ivf_telemetry_data table
        insert_query = text("""
            INSERT INTO ivf_telemetry_data 
            (canister_id, device_id, telemetry_data, created_at)
            VALUES (:canister_id, :device_id, :telemetry_data, :created_at)
            RETURNING id
        """).bindparams(bindparam("telemetry_data", type_=JSONB))
        
        result = db.execute(insert_query, {
            "canister_id": canister_id,
            "device_id": data.get("device_id"),
            "telemetry_data": telemetry_payload,
            "created_at": created_at
        })
        
        # Get the inserted ivf_telemetry_data.id
        ivf_telemetry_data_id = result.scalar()
        
        logger.info(f"✓ Inserted IVF telemetry data for canister {canister_id} (id={ivf_telemetry_data_id})")
        print(f"  → Inserted into database table 'ivf_telemetry_data' (id={ivf_telemetry_data_id}, canister_id: {canister_id})", flush=True)
        
        # Insert into ivf_quality_log table
        try:
            insert_ivf_quality_log(db, ivf_telemetry_data_id, canister_id, data, created_at)
        except Exception as e:
            logger.error(f"Error inserting into ivf_quality_log: {e}", exc_info=True)
            print(f"  ✗ Error inserting into ivf_quality_log: {e}", flush=True)
            # Rollback transaction and re-raise to let outer handler deal with it
            db.rollback()
            raise
        
        # Insert into ivf_geolocation table
        try:
            insert_ivf_geolocation(db, ivf_telemetry_data_id, canister_id, data, created_at)
        except Exception as e:
            logger.error(f"Error inserting into ivf_geolocation: {e}", exc_info=True)
            print(f"  ✗ Error inserting into ivf_geolocation: {e}", flush=True)
            # Rollback transaction and re-raise to let outer handler deal with it
            db.rollback()
            raise
        
        # Commit transaction only if all inserts succeeded
        db.commit()
        
        # Check if violations were detected and trigger alerts automatically
        try:
            threshold_violations = data.get("threshold_violations", {})
            quality_loss = data.get("quality_loss", 0.0) or 0.0
            kpi_statuses = data.get("kpi_statuses", {})
            triggers_alert = any(
                result.get("triggers_alert", False) 
                for result in data.get("magnitude_results", {}).values()
            )
            
            has_violations = (
                quality_loss > 0
                or any(threshold_violations.values())
                or any(status in ["Warning", "Critical"] for status in kpi_statuses.values())
                or triggers_alert
            )
            
            if has_violations:
                logger.info(f"Violations detected for canister {canister_id} - triggering alert check...")
                print(f"  → Violations detected - triggering automatic alert creation", flush=True)
                
                # Trigger alert service (imported at top level)
                try:
                    if not CRITICAL_ALERT_SERVICE_AVAILABLE or CriticalAlertService is None:
                        raise ImportError("CriticalAlertService not available")
                    
                    # Get canister number for alert service
                    canister_query = text("""
                        SELECT canister_number FROM canisters WHERE canister_id = :canister_id
                    """)
                    result = db.execute(canister_query, {"canister_id": canister_id})
                    row = result.fetchone()
                    canister_number = row[0] if row else None
                    
                    if canister_number:
                        # Create alert service instance and check/create alerts
                        alert_service = CriticalAlertService(db)
                        alerts_created = alert_service.check_and_create_alerts(
                            canister_number=canister_number,
                            branch_id=None  # No branch filter for automatic alerts
                        )
                        
                        if alerts_created:
                            logger.info(f"✓ Created {len(alerts_created)} alert(s) and sent email notifications")
                            print(f"  ✓ Created {len(alerts_created)} alert(s) and sent email notifications", flush=True)
                        else:
                            logger.debug(f"No new alerts created (may already exist)")
                            print(f"  → Alert check completed (no new alerts needed)", flush=True)
                    else:
                        logger.warning(f"Could not find canister_number for canister_id {canister_id}")
                        print(f"  ⚠ Could not find canister_number - skipping alert creation", flush=True)
                        
                except ImportError as e:
                    logger.warning(f"Could not import CriticalAlertService: {e}. Alerts will not be sent automatically.")
                    print(f"  ⚠ Warning: Alert service not available - alerts will not be sent automatically", flush=True)
                except Exception as e:
                    logger.error(f"Error triggering alert creation: {e}", exc_info=True)
                    print(f"  ✗ Error triggering alert creation: {e}", flush=True)
                    # Don't fail the main insert if alert creation fails
            else:
                logger.debug(f"No violations detected for canister {canister_id} - skipping alert check")
        
        except Exception as e:
            logger.error(f"Error checking for violations: {e}", exc_info=True)
            # Don't fail the main insert if violation check fails
        
        return True
                
    except Exception as e:
        db.rollback()
        logger.error(f"Error inserting IVF telemetry data for canister {canister_id}: {e}", exc_info=True)
        print(f"  ✗ Error inserting into database: {e}", flush=True)
        import traceback
        traceback.print_exc()
        return False
    finally:
        db.close()

def insert_ivf_quality_log(db, ivf_telemetry_data_id: int, canister_id: int, 
                           data: Dict[str, Any], created_at: datetime) -> bool:
    """
    Insert data into ivf_quality_log table ONLY when there are red/yellow deviations.
    
    Only inserts if:
    - quality_status is "Warning" (yellow) or "Critical" (red)
    - OR any KPI status is "Warning" (yellow) or "Critical" (red)
    
    Skips insertion when all KPIs are "Good" (green) - normal readings are not stored here.
    """
    try:
        # Get quality loss, quality status, and KPI statuses
        quality_loss = data.get("quality_loss", 0.0) or 0.0
        quality_status = data.get("quality_status", "Good")
        kpi_statuses = data.get("kpi_statuses", {})
        
        # Only insert when there are red/yellow deviations:
        #   - quality_status is "Warning" (yellow) or "Critical" (red)
        #   - OR any KPI status is "Warning" (yellow) or "Critical" (red)
        # 
        # Note: We check kpi_statuses directly instead of threshold_violations flags,
        # because threshold_violations can be True even for Green status (within ±5 acceptable band).
        # Only kpi_statuses accurately reflects red/yellow severity.
        has_violations = (
            quality_status in ["Warning", "Critical"]  # Quality loss is yellow or red
            or any(status in ["Warning", "Critical"] for status in kpi_statuses.values())  # Yellow or Red KPI status
        )
        
        # Only insert if there are violations (red/yellow deviations)
        if not has_violations:
            logger.debug(f"Skipping ivf_quality_log insert - no violations detected (quality_status={quality_status}, quality_loss={quality_loss}, violations={threshold_violations}, kpi_statuses={kpi_statuses})")
            print(f"  → Skipping ivf_quality_log insert - no violations (quality_status={quality_status}, all KPIs are Good)", flush=True)
            return True  # Return True to indicate success (we intentionally skipped)
        
        # Build insert query - IVF KPIs: Temp Internal, Temp External, Humidity, Shock
        # Note: Database model has temperature, humidity, agitation, light columns
        # We'll map: temp_internal -> temperature, temp_external -> (store in telemetry_data JSONB), shock -> agitation
        insert_query = text("""
            INSERT INTO ivf_quality_log 
            (telemetry_data_id, canister_id, device_id, temperature, humidity, agitation, 
             quality_loss, is_temp_loss, is_humidity_loss, is_agitation_loss, is_light_loss, reading_timestamp, created_at)
            VALUES (:telemetry_data_id, :canister_id, :device_id, :temperature, :humidity, :agitation,
                    :quality_loss, :is_temp_loss, :is_humidity_loss, :is_agitation_loss, :is_light_loss, :reading_timestamp, :created_at)
        """)
        
        # Map IVF KPIs to database columns
        # temperature column = temp_internal (primary temperature)
        # agitation column = shock value
        # humidity column = humidity
        # light column = not used (set to None, is_light_loss = False)
        db.execute(insert_query, {
            "telemetry_data_id": ivf_telemetry_data_id,
            "canister_id": canister_id,
            "device_id": data.get("device_id"),
            "temperature": data.get("temp_internal"),  # Temperature Internal
            "humidity": data.get("humidity"),  # Humidity
            "agitation": data.get("shock"),  # Shock (stored in agitation column)
            "quality_loss": quality_loss,
            "is_temp_loss": is_temp_internal_loss or is_temp_external_loss,  # Either temp violation
            "is_humidity_loss": is_humidity_loss,
            "is_agitation_loss": is_shock_loss,  # Shock violation stored in is_agitation_loss
            "is_light_loss": False,  # Not used for IVF
            "reading_timestamp": created_at,
            "created_at": created_at
        })
        
        logger.info(f"✓ Inserted into ivf_quality_log table (telemetry_data_id={ivf_telemetry_data_id}, canister_id={canister_id}, quality_loss={quality_loss})")
        print(f"  → Inserted into ivf_quality_log table (telemetry_data_id={ivf_telemetry_data_id}, quality_loss={quality_loss})", flush=True)
        return True
        
    except Exception as e:
        logger.error(f"Error inserting into ivf_quality_log table: {e}", exc_info=True)
        print(f"  ✗ Error inserting into ivf_quality_log: {e}", flush=True)
        import traceback
        traceback.print_exc()
        return False

def insert_ivf_geolocation(db, ivf_telemetry_data_id: int, canister_id: int, 
                          data: Dict[str, Any], created_at: datetime) -> bool:
    """Insert data into ivf_geolocation table"""
    try:
        # Extract location data
        ship_from = data.get("ship_from", {})
        ship_to = data.get("ship_to", {})
        
        # Build insert query - include created_at (required NOT NULL column)
        insert_query = text("""
            INSERT INTO ivf_geolocation 
            (canister_id, ivf_telemetry_data_id, shipment_id, current_latitude, current_longitude,
             shipment_from_latitude, shipment_from_longitude,
             shipment_to_latitude, shipment_to_longitude, reading_timestamp, created_at)
            VALUES (:canister_id, :ivf_telemetry_data_id, :shipment_id, :latitude, :longitude,
                    :ship_from_latitude, :ship_from_longitude,
                    :ship_to_latitude, :ship_to_longitude, :reading_timestamp, :created_at)
        """)
        
        db.execute(insert_query, {
            "canister_id": canister_id,
            "ivf_telemetry_data_id": ivf_telemetry_data_id,
            "shipment_id": data.get("shipment_id"),
            "latitude": data.get("latitude"),
            "longitude": data.get("longitude"),
            "ship_from_latitude": ship_from.get("latitude") if isinstance(ship_from, dict) else None,
            "ship_from_longitude": ship_from.get("longitude") if isinstance(ship_from, dict) else None,
            "ship_to_latitude": ship_to.get("latitude") if isinstance(ship_to, dict) else None,
            "ship_to_longitude": ship_to.get("longitude") if isinstance(ship_to, dict) else None,
            "reading_timestamp": created_at,
            "created_at": created_at  # Required NOT NULL column
        })
        
        logger.info(f"✓ Inserted into ivf_geolocation table (telemetry_data_id={ivf_telemetry_data_id}, canister_id={canister_id})")
        print(f"  → Inserted into ivf_geolocation table (telemetry_data_id={ivf_telemetry_data_id})", flush=True)
        return True
        
    except Exception as e:
        logger.error(f"Error inserting into ivf_geolocation table: {e}", exc_info=True)
        print(f"  ✗ Error inserting into ivf_geolocation: {e}", flush=True)
        import traceback
        traceback.print_exc()
        return False

def insert_telemetry_data(shipment_id: str, data: Dict[str, Any]) -> bool:
    """
    Insert telemetry data into the telemetry_data table.
    Also inserts into quality_log and geolocation tables.
    
    Table structure:
    - id: integer (auto-generated primary key)
    - shipment_id: varchar (NOT NULL)
    - telemetry_data: jsonb (NOT NULL) - stores all telemetry data as JSON
    - created_at: timestamp (NOT NULL)
    
    Args:
        shipment_id: Shipment ID from webhook
        data: Quality data dictionary containing all telemetry information
        
    Returns:
        True if successful, False otherwise
    """
    db = PublisherSessionLocal()
    try:
        # Prepare telemetry_data payload (keep as dict so SQLAlchemy/psycopg2 can adapt it)
        telemetry_payload = data

        # Use timestamp from data if available, otherwise use current time
        created_at = data.get("timestamp")
        if created_at:
            # Convert timestamp string to datetime if needed
            try:
                if isinstance(created_at, str):
                    # Try to parse the timestamp
                    dt = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                    created_at = dt
            except:
                # If parsing fails, use current time
                created_at = datetime.now()
        else:
            created_at = datetime.now()

        # Insert into telemetry_data table (bind telemetry_data as JSONB)
        # Use RETURNING to get the inserted ID
        insert_query = text("""
            INSERT INTO telemetry_data 
            (shipment_id, telemetry_data, created_at)
            VALUES (:shipment_id, :telemetry_data, :created_at)
            RETURNING id
        """).bindparams(bindparam("telemetry_data", type_=JSONB))
        
        result = db.execute(insert_query, {
            "shipment_id": shipment_id,
            "telemetry_data": telemetry_payload,
            "created_at": created_at
        })
        
        # Get the inserted telemetry_data.id
        telemetry_data_id = result.scalar()
        
        logger.info(f"✓ Inserted telemetry data for shipment {shipment_id} into telemetry_data table (id={telemetry_data_id})")
        print(f"  → Inserted into database table 'telemetry_data' (id={telemetry_data_id}, shipment_id: {shipment_id})", flush=True)
        
        # Insert into quality_log table
        try:
            insert_quality_log(db, telemetry_data_id, shipment_id, data, created_at)
        except Exception as e:
            logger.error(f"Error inserting into quality_log: {e}", exc_info=True)
            print(f"  ✗ Error inserting into quality_log: {e}", flush=True)
        
        # Insert into geolocation table
        try:
            insert_geolocation(db, telemetry_data_id, shipment_id, data, created_at)
        except Exception as e:
            logger.error(f"Error inserting into geolocation: {e}", exc_info=True)
            print(f"  ✗ Error inserting into geolocation: {e}", flush=True)
        
        db.commit()
        return True
                
    except Exception as e:
        db.rollback()
        logger.error(f"Error inserting telemetry data for shipment {shipment_id}: {e}", exc_info=True)
        print(f"  ✗ Error inserting into database: {e}", flush=True)
        import traceback
        traceback.print_exc()
        return False
    finally:
        db.close()

def extract_thresholds_from_tive_webhook(webhook_data: Dict[str, Any]) -> Optional[Dict[str, Dict[str, Any]]]:
    """
    Extract threshold information from Tive webhook payload.
    Tive webhooks may include Alert Preset information with threshold values.
    
    Returns thresholds dict or None if not found (will use fallback defaults)
    """
    thresholds = {}
    
    # Log the webhook structure for debugging
    logger.debug(f"Extracting thresholds from webhook data. Keys: {list(webhook_data.keys()) if isinstance(webhook_data, dict) else 'Not a dict'}")
    
    # Check multiple possible locations for Alert Preset data
    alert_preset = (
        webhook_data.get("AlertPreset") or 
        webhook_data.get("alert_preset") or 
        webhook_data.get("preset") or
        webhook_data.get("AlertPresetId") or
        webhook_data.get("alertPreset")
    )
    
    alert_info = (
        webhook_data.get("Alert") or 
        webhook_data.get("alert") or 
        webhook_data.get("AlertData") or
        webhook_data.get("alertData") or
        {}
    )
    
    # Check for data nested in different structures
    data_section = webhook_data.get("data") or webhook_data.get("Data") or {}
    if isinstance(data_section, dict):
        alert_preset = alert_preset or data_section.get("AlertPreset") or data_section.get("alert_preset")
        alert_info = alert_info or data_section.get("Alert") or data_section.get("alert") or {}
    
    # Extract thresholds from Alert Preset
    if alert_preset:
        logger.info(f"Found Alert Preset: {type(alert_preset)}")
        if isinstance(alert_preset, dict):
            triggers = (
                alert_preset.get("Triggers") or 
                alert_preset.get("triggers") or 
                alert_preset.get("Trigger") or
                alert_preset.get("trigger") or
                []
            )
            
            if not isinstance(triggers, list):
                triggers = [triggers] if triggers else []
            
            for trigger in triggers:
                if not isinstance(trigger, dict):
                    continue
                    
                trigger_type = (
                    trigger.get("Type") or 
                    trigger.get("type") or 
                    trigger.get("Parameter") or
                    trigger.get("parameter") or
                    ""
                ).lower()
                
                min_val = trigger.get("Min") or trigger.get("min") or trigger.get("Minimum") or trigger.get("minimum")
                max_val = trigger.get("Max") or trigger.get("max") or trigger.get("Maximum") or trigger.get("maximum")
                unit = trigger.get("Unit") or trigger.get("unit") or ""
                
                # Try to convert string values to numbers
                try:
                    if isinstance(min_val, str):
                        min_val = float(min_val) if min_val.lower() not in ['none', 'null', ''] else None
                    if isinstance(max_val, str):
                        max_val = float(max_val) if max_val.lower() not in ['none', 'null', ''] else None
                except (ValueError, AttributeError):
                    pass
                
                if "temperature" in trigger_type or "temp" in trigger_type:
                    thresholds["temperature"] = {
                        "min": min_val,
                        "max": max_val,
                        "unit": unit or "°C"
                    }
                    logger.info(f"Extracted temperature threshold: {min_val} - {max_val} {unit}")
                elif "humidity" in trigger_type or "humid" in trigger_type:
                    thresholds["humidity"] = {
                        "min": min_val,
                        "max": max_val,
                        "unit": unit or "%"
                    }
                    logger.info(f"Extracted humidity threshold: {min_val} - {max_val} {unit}")
                elif "shock" in trigger_type or "g" in trigger_type or "g-force" in trigger_type:
                    # Use shock threshold directly as agitation threshold (G-force)
                    thresholds["agitation"] = {
                        "min": float(min_val) if min_val is not None else None,
                        "max": float(max_val) if max_val is not None else None,
                        "unit": unit or "G"
                    }
                    logger.info(f"Extracted agitation threshold (from shock): {min_val} - {max_val} G")
    
    # Also check alert_info for threshold data
    if alert_info and isinstance(alert_info, dict) and not thresholds:
        threshold_breached = (
            alert_info.get("Threshold") or 
            alert_info.get("threshold") or
            alert_info.get("Thresholds") or
            alert_info.get("thresholds")
        )
        
        if threshold_breached:
            if isinstance(threshold_breached, dict):
                param_name = (
                    threshold_breached.get("Parameter") or 
                    threshold_breached.get("parameter") or 
                    threshold_breached.get("Type") or
                    threshold_breached.get("type") or
                    ""
                ).lower()
                
                min_val = threshold_breached.get("Min") or threshold_breached.get("min") or threshold_breached.get("Minimum")
                max_val = threshold_breached.get("Max") or threshold_breached.get("max") or threshold_breached.get("Maximum")
                unit = threshold_breached.get("Unit") or threshold_breached.get("unit") or ""
                
                if "temperature" in param_name:
                    thresholds["temperature"] = {"min": min_val, "max": max_val, "unit": unit or "°C"}
                elif "humidity" in param_name:
                    thresholds["humidity"] = {"min": min_val, "max": max_val, "unit": unit or "%"}
                elif "shock" in param_name or "g" in param_name:
                    # Use shock threshold directly as agitation threshold (G-force)
                    thresholds["agitation"] = {
                        "min": float(min_val) if min_val is not None else None,
                        "max": float(max_val) if max_val is not None else None,
                        "unit": unit or "G"
                    }
    
    # Check for conditions/measurements that might have threshold info
    conditions = webhook_data.get("conditions") or webhook_data.get("Conditions") or {}
    if isinstance(conditions, dict) and not thresholds:
        # Sometimes thresholds might be in conditions section
        temp_range = conditions.get("temperature_range") or conditions.get("TemperatureRange")
        humidity_range = conditions.get("humidity_range") or conditions.get("HumidityRange")
        
        if temp_range and isinstance(temp_range, dict):
            thresholds["temperature"] = {
                "min": temp_range.get("min") or temp_range.get("Min"),
                "max": temp_range.get("max") or temp_range.get("Max"),
                "unit": "°C"
            }
        if humidity_range and isinstance(humidity_range, dict):
            thresholds["humidity"] = {
                "min": humidity_range.get("min") or humidity_range.get("Min"),
                "max": humidity_range.get("max") or humidity_range.get("Max"),
                "unit": "%"
            }
    
    if thresholds:
        logger.info(f"Successfully extracted thresholds from Tive: {json.dumps(thresholds, indent=2)}")
        return thresholds
    else:
        logger.debug("No thresholds found in Tive webhook, will use static defaults")
        return None

# ============================================================================
# FastAPI App
# ============================================================================

app = FastAPI(title="Publisher Webhook Receiver", version="1.0.0")

# Add middleware to log all incoming requests
@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log all incoming requests for debugging"""
    start_time = time.time()
    logger.info(f"→ {request.method} {request.url.path} from {request.client.host if request.client else 'unknown'}")
    print(f"→ {request.method} {request.url.path} from {request.client.host if request.client else 'unknown'}", flush=True)
    response = await call_next(request)
    process_time = time.time() - start_time
    logger.info(f"← {request.method} {request.url.path} - {response.status_code} ({process_time:.3f}s)")
    return response

# ============================================================================
# Helper Functions
# ============================================================================

def convert_shock_g_to_agitation(shock_g: Optional[float]) -> float:
    """Return Shock.G (G-force) value directly as agitation"""
    if shock_g is None:
        return 0.0
    
    return round(float(shock_g), 1)

def check_threshold(parameter_name: str, value: float, thresholds: Optional[Dict[str, Dict[str, Any]]] = None) -> bool:
    """
    Check if a parameter value is within threshold.
    Uses Tive thresholds if provided, otherwise falls back to static defaults.
    """
    # Use provided thresholds (from Tive) or fall back to defaults
    if thresholds and parameter_name in thresholds:
        threshold = thresholds[parameter_name]
    else:
        threshold = PARAMETER_THRESHOLDS.get(parameter_name, {})
    
    min_val = threshold.get("min")
    max_val = threshold.get("max")
    
    if min_val is not None and value < min_val:
        return False
    if max_val is not None and value > max_val:
        return False
    return True

def calculate_quality_loss(parameters: Dict[str, float], thresholds: Dict[str, Dict[str, Any]], 
                          threshold_violations: Dict[str, bool]) -> float:
    """
    Calculate quality loss percentage based on threshold violations and deviations.
    
    Quality loss is calculated as:
    - If all parameters are within threshold: 0% loss
    - For each violated parameter: calculate deviation percentage from threshold
    - Sum the contributions (weighted by parameter importance)
    - Cap at 100%
    
    Args:
        parameters: Dictionary of parameter values (temperature, humidity, agitation)
        thresholds: Dictionary of threshold configurations with min/max values
        threshold_violations: Dictionary indicating which parameters violated thresholds
    
    Returns:
        Quality loss percentage (0.0 to 100.0)
    """
    # Parameter weights (temperature is most critical, then humidity, then agitation)
    parameter_weights = {
        "temperature": 0.5,  # 50% weight - most critical
        "humidity": 0.3,      # 30% weight
        "agitation": 0.2      # 20% weight
    }
    
    total_loss = 0.0
    
    for param_name in ["temperature", "humidity", "agitation"]:
        if not threshold_violations.get(param_name, False):
            # Parameter is within threshold, no loss
            continue
        
        value = parameters.get(param_name)
        if value is None:
            continue
        
        threshold_config = thresholds.get(param_name, {})
        min_val = threshold_config.get("min")
        max_val = threshold_config.get("max")
        weight = parameter_weights.get(param_name, 0.33)  # Default equal weight
        
        # Calculate deviation percentage
        deviation_loss = 0.0
        
        if min_val is not None and value < min_val:
            # Below minimum threshold
            deviation = min_val - value
            if max_val is not None:
                # Both min and max thresholds exist
                threshold_range = max_val - min_val
                if threshold_range > 0:
                    # Loss based on deviation relative to threshold range
                    deviation_loss = min((deviation / threshold_range) * 100, 100)
                else:
                    # Min and max are equal (shouldn't happen, but handle it)
                    deviation_loss = 100.0
            else:
                # Only min threshold exists
                if min_val != 0:
                    deviation_loss = min((deviation / abs(min_val)) * 100, 100)
                else:
                    # Min is 0, use absolute deviation with scaling
                    deviation_loss = min(abs(deviation) * 20, 100)
        
        elif max_val is not None and value > max_val:
            # Above maximum threshold
            deviation = value - max_val
            if min_val is not None:
                # Both min and max thresholds exist
                threshold_range = max_val - min_val
                if threshold_range > 0:
                    # Loss based on deviation relative to threshold range
                    deviation_loss = min((deviation / threshold_range) * 100, 100)
                else:
                    # Min and max are equal (shouldn't happen, but handle it)
                    deviation_loss = 100.0
            else:
                # Only max threshold exists (e.g., humidity max: 90%)
                # Calculate loss as percentage of how much we exceeded the max
                # If we exceed by 10% of max, that's significant
                if max_val != 0:
                    # Loss = (deviation / max_val) * 100, but scale it appropriately
                    # For example: max=90, value=95, deviation=5, loss = (5/90)*100 = 5.56%
                    # But we want this to be more significant, so multiply by a factor
                    deviation_loss = min((deviation / max_val) * 100 * 2, 100)  # 2x multiplier for max-only violations
                else:
                    deviation_loss = 100.0
        
        # Add weighted contribution to total loss
        total_loss += deviation_loss * weight
    
    # Cap at 100%
    quality_loss = min(total_loss, 100.0)
    return round(quality_loss, 2)

def score_kpi_status(parameter_name: str, value: float, thresholds: Dict[str, Dict[str, Any]]) -> int:
    """
    Score a single KPI based on magnitude deviation from thresholds.
    Based on Quality Status Logic PDF:
    - Green (0): Within threshold
    - Yellow (1): Minor deviation
    - Red (2): Significant deviation
    
    Args:
        parameter_name: Name of parameter (temperature, humidity, agitation)
        value: Current parameter value
        thresholds: Dictionary of threshold configurations
    
    Returns:
        KPI score: 0 (Green), 1 (Yellow), or 2 (Red)
    """
    if parameter_name not in thresholds:
        return 0  # Default to Green if threshold not found
    
    threshold_config = thresholds[parameter_name]
    min_val = threshold_config.get("min")
    max_val = threshold_config.get("max")
    
    if min_val is None and max_val is None:
        return 0  # No thresholds defined, assume Green
    
    # Temperature scoring (2-8°C range)
    if parameter_name == "temperature":
        if min_val is not None and max_val is not None:
            if min_val <= value <= max_val:
                return 0  #  Green: Within 2-8°C
            else:
                deviation = min(abs(value - min_val), abs(value - max_val))
                if deviation <= 3.0:
                    return 1  #  Yellow: ≤ ±3°C outside range
                else:
                    return 2  #  Red: > ±3°C outside range
        elif min_val is not None and value < min_val:
            deviation = min_val - value
            return 1 if deviation <= 3.0 else 2
        elif max_val is not None and value > max_val:
            deviation = value - max_val
            return 1 if deviation <= 3.0 else 2
    
    # Humidity scoring (20-90% RH)
    elif parameter_name == "humidity":
        if min_val is not None and max_val is not None:
            if min_val <= value <= max_val:
                return 0  #  Green: Within 20-90%
            else:
                deviation = min(abs(value - min_val), abs(value - max_val))
                if deviation <= 10.0:
                    return 1  #  Yellow: ≤ ±10% outside
                else:
                    return 2  #  Red: > ±10% outside
        elif min_val is not None and value < min_val:
            deviation = min_val - value
            return 1 if deviation <= 10.0 else 2
        elif max_val is not None and value > max_val:
            deviation = value - max_val
            return 1 if deviation <= 10.0 else 2
    
    # Vibration/Agitation scoring (≤1.5 g per PDF)
    elif parameter_name == "agitation":
        # PDF specifies: ≤1.5g = Green, 1.5-2.5g = Yellow, >2.5g = Red
        # Use PDF thresholds regardless of config max_val
        if value <= 1.5:
            return 0  #  Green: ≤1.5 g
        elif value <= 2.5:
            return 1  #  Yellow: 1.5-2.5 g
        else:
            return 2  #  Red: >2.5 g
    
    # Default: within threshold = Green
    return 0

def calculate_quality_status_from_kpis(kpi_scores: Dict[str, int]) -> tuple[str, float]:
    """
    Calculate overall quality status and percentage from KPI scores.
    Based on Quality Status Logic PDF:
    
    Step 1: Each KPI scored (Green=0, Yellow=1, Red=2)
    Step 2: Total_Deviation_Score = sum of all KPI scores
    Step 3: Cumulative_Quality_% = 100 × (1 - Total_Deviation_Score / Max_Possible_Score)
    Step 4: Map % to status:
        - ≥ 85% → Green
        - 60-84% → Yellow
        - < 60% → Red
    BUT: If ANY KPI = Red, force overall status to Red regardless of %
    
    Args:
        kpi_scores: Dictionary mapping KPI names to scores (0, 1, or 2)
    
    Returns:
        Tuple of (status_string, quality_percentage)
        status_string: "Good", "Warning", or "Critical"
        quality_percentage: 0.0 to 100.0
    """
    if not kpi_scores:
        return ("Good", 100.0)
    
    # Check if any KPI is Red (score = 2) - force Red status
    has_red = any(score == 2 for score in kpi_scores.values())
    
    # Calculate total deviation score
    total_deviation_score = sum(kpi_scores.values())
    
    # Max possible score = number of KPIs × 2 (since Red = 2)
    num_kpis = len(kpi_scores)
    max_possible_score = num_kpis * 2
    
    if max_possible_score == 0:
        return ("Good", 100.0)
    
    # Calculate cumulative quality percentage
    quality_percentage = 100.0 * (1.0 - (total_deviation_score / max_possible_score))
    quality_percentage = max(0.0, min(100.0, quality_percentage))  # Clamp to 0-100
    
    # Map percentage to status
    if has_red:
        # Force Red if any KPI is Red (safety rule)
        return ("Critical", quality_percentage)
    elif quality_percentage >= 85.0:
        return ("Good", quality_percentage)
    elif quality_percentage >= 60.0:
        return ("Warning", quality_percentage)
    else:
        return ("Critical", quality_percentage)

def calculate_quality_status(quality_loss: float, kpi_scores: Optional[Dict[str, int]] = None) -> str:
    """
    Calculate quality status based on KPI scores (preferred) or quality loss (fallback).
    
    If kpi_scores is provided, uses the PDF-based KPI scoring system.
    Otherwise, falls back to quality_loss-based calculation.
    
    Args:
        quality_loss: Quality loss percentage (0.0 to 100.0) - used as fallback
        kpi_scores: Optional dictionary of KPI scores (temperature, humidity, agitation)
    
    Returns:
        Quality status string: "Good", "Warning", or "Critical"
    """
    if kpi_scores:
        status, _ = calculate_quality_status_from_kpis(kpi_scores)
        return status
    else:
        # Fallback to quality_loss-based calculation
        # Convert quality_loss (loss %) to quality %: quality = 100 - loss
        quality_percentage = 100.0 - quality_loss
        if quality_percentage >= 85.0:
            return "Good"
        elif quality_percentage >= 60.0:
            return "Warning"
        else:
            return "Critical"

# ============================================================================
# IVF-Specific Threshold Logic Functions
# ============================================================================

def get_ivf_parameter_target(parameter_name: str) -> float:
    """
    Get the target value for IVF parameters.
    These are the center values for the ±5 acceptable band.
    Note: 
    - temp_internal: Operating range -20°C to 60°C (below -20°C covered by Dry Ice/Cryogenic probes)
    - temp_external: Anything above 30°C is a violation
    """
    IVF_TARGETS = {
        "temp_internal": 20.0,  # Center of operating range (-20°C to 60°C), target: 20°C
        "temp_external": 30.0,  # Threshold: 30°C (anything above 30°C is violation, no ±5 band)
        "humidity": 50.0,      # Target: 50% (acceptable: 45-55%, ±5 band)
        "shock": 0.0           # Target: 0G (acceptable: 0-5G, ±5 band)
    }
    return IVF_TARGETS.get(parameter_name, 0.0)

def check_ivf_threshold_magnitude(parameter_name: str, value: float) -> Dict[str, Any]:
    """
    Check IVF threshold using magnitude-based logic.
    
    Logic:
    - For temp_internal: Operating range -20°C to 60°C
      - Below -20°C: Covered by Dry Ice/Cryogenic probes (acceptable, but may need monitoring)
      - -20°C to 60°C: Green (acceptable operating range)
      - Above 60°C: Red (violation, triggers alert)
      - Uses ±5 band logic within operating range for Yellow/Red zones
    
    - For temp_external: Anything above 30°C is a violation
      - value <= 30°C = Green (acceptable)
      - value > 30°C = Red (violation, triggers alert)
    
    - For other KPIs: Acceptable band: ±5 from target
      - ±1 = Yellow (deviation of 1 unit from acceptable range edge)
      - >±3 = Red (deviation > 3 units from acceptable range edge)
      - within ±5 = Green (acceptable)
      - beyond ±5 = triggers email + SMS
    
    Returns:
        Dict with:
        - is_violation: bool (True if violation)
        - deviation: float (deviation from acceptable range)
        - magnitude_status: str ("Green", "Yellow", "Red", "Critical")
        - triggers_alert: bool (True if triggers email + SMS)
    """
    target = get_ivf_parameter_target(parameter_name)
    
    # Special case: temp_internal - Operating range -20°C to 60°C
    if parameter_name == "temp_internal":
        operating_min = -20.0  # Minimum operating temperature
        operating_max = 60.0   # Maximum operating temperature
        
        if value is None:
            return {
                "is_violation": False,
                "deviation": 0.0,
                "magnitude_status": "Green",
                "triggers_alert": False,
                "target": target,
                "acceptable_min": operating_min,
                "acceptable_max": operating_max
            }
        
        if value < operating_min:
            # Below -20°C: Covered by Dry Ice/Cryogenic probes (acceptable but monitor)
            # Treat as acceptable (Green) since it's covered by special probes
            magnitude_status = "Green"
            is_violation = False
            deviation = 0.0
            triggers_alert = False
        elif value <= operating_max:
            # Within operating range (-20°C to 60°C)
            # Apply ±5 band logic around target (20°C) for Yellow/Red zones
            acceptable_min = target - 5.0  # 15°C
            acceptable_max = target + 5.0  # 25°C
            
            if acceptable_min <= value <= acceptable_max:
                # Within ±5 band (15°C to 25°C) - Green
                magnitude_status = "Green"
                is_violation = False
                deviation = 0.0
                triggers_alert = False
            elif value < acceptable_min:
                # Below 15°C but above -20°C
                deviation = acceptable_min - value
                if deviation <= 1.0:
                    magnitude_status = "Yellow"
                elif deviation <= 3.0:
                    magnitude_status = "Red"
                else:
                    magnitude_status = "Critical"
                is_violation = True
                triggers_alert = (magnitude_status == "Critical")
            else:  # value > acceptable_max but <= operating_max
                # Above 25°C but below 60°C
                deviation = value - acceptable_max
                if deviation <= 1.0:
                    magnitude_status = "Yellow"
                elif deviation <= 3.0:
                    magnitude_status = "Red"
                else:
                    magnitude_status = "Critical"
                is_violation = True
                triggers_alert = (magnitude_status == "Critical")
        else:  # value > operating_max (60°C)
            # Above 60°C - Critical violation
            deviation = value - operating_max
            magnitude_status = "Critical"
            is_violation = True
            triggers_alert = True
        
        return {
            "is_violation": is_violation,
            "deviation": deviation,
            "magnitude_status": magnitude_status,
            "triggers_alert": triggers_alert,
            "target": target,
            "acceptable_min": operating_min,
            "acceptable_max": operating_max
        }
    
    # Special case: temp_external - anything above 30°C is a violation
    if parameter_name == "temp_external":
        acceptable_max = 30.0  # 30°C is the maximum acceptable
        acceptable_min = None  # No minimum limit
        
        if value is None:
            return {
                "is_violation": False,
                "deviation": 0.0,
                "magnitude_status": "Green",
                "triggers_alert": False,
                "target": target,
                "acceptable_min": acceptable_min,
                "acceptable_max": acceptable_max
            }
        
        if value <= acceptable_max:
            # Within acceptable range (≤30°C)
            magnitude_status = "Green"
            is_violation = False
            deviation = 0.0
            triggers_alert = False
        else:
            # Above 30°C - violation
            deviation = value - acceptable_max
            magnitude_status = "Red"  # Direct violation, no Yellow zone
            is_violation = True
            triggers_alert = True  # Above 30°C triggers alert
        
        return {
            "is_violation": is_violation,
            "deviation": deviation,
            "magnitude_status": magnitude_status,
            "triggers_alert": triggers_alert,
            "target": target,
            "acceptable_min": acceptable_min,
            "acceptable_max": acceptable_max
        }
    
    # Standard logic for other KPIs: ±5 acceptable band
    acceptable_min = target - 5.0
    acceptable_max = target + 5.0
    
    # Calculate deviation from acceptable range
    if value < acceptable_min:
        deviation = acceptable_min - value  # Negative deviation (below range)
    elif value > acceptable_max:
        deviation = value - acceptable_max  # Positive deviation (above range)
    else:
        deviation = 0.0  # Within acceptable range
    
    # Determine magnitude status
    # Logic: ±1 = Yellow, >±3 = Red, within ±5 = Green, beyond ±5 = triggers alert
    if deviation == 0.0:
        # Within acceptable band (±5)
        magnitude_status = "Green"
        is_violation = False
        triggers_alert = False
    elif deviation <= 1.0:
        # Deviation of ±1 from acceptable range edge = Yellow
        magnitude_status = "Yellow"
        is_violation = True
        triggers_alert = False
    elif deviation <= 3.0:
        # Deviation >±3 from acceptable range edge = Red
        magnitude_status = "Red"
        is_violation = True
        triggers_alert = False
    else:  # deviation > 3.0
        # Beyond ±5 from target = Critical (triggers email + SMS)
        magnitude_status = "Critical"
        is_violation = True
        triggers_alert = True
    
    return {
        "is_violation": is_violation,
        "deviation": deviation,
        "magnitude_status": magnitude_status,
        "triggers_alert": triggers_alert,
        "target": target,
        "acceptable_min": acceptable_min,
        "acceptable_max": acceptable_max
    }

def get_ivf_violation_frequency(canister_id: int, parameter_name: str, window_minutes: int = 60) -> Dict[str, Any]:
    """
    Get frequency of violations for a parameter within a time window.
    
    Logic:
    - 0 deviations = Green
    - 5 deviations = Yellow
    - >5 deviations = Red
    
    Args:
        canister_id: Canister ID
        parameter_name: Parameter name (temperature, humidity, agitation, light)
        window_minutes: Time window in minutes (default: 60)
    
    Returns:
        Dict with:
        - count: int (number of violations in window)
        - frequency_status: str ("Green", "Yellow", "Red")
    """
    db = PublisherSessionLocal()
    try:
        # Calculate window start time
        window_start = datetime.now() - timedelta(minutes=window_minutes)
        
        # Determine which violation flag to check
        violation_flag_map = {
            "temperature": "is_temp_loss",
            "humidity": "is_humidity_loss",
            "agitation": "is_agitation_loss",
            "light": "is_light_loss"
        }
        
        violation_flag = violation_flag_map.get(parameter_name)
        if not violation_flag:
            return {"count": 0, "frequency_status": "Green"}
        
        # Query violations in the time window
        query = text(f"""
            SELECT COUNT(*) as violation_count
            FROM ivf_quality_log
            WHERE canister_id = :canister_id
              AND {violation_flag} = true
              AND reading_timestamp >= :window_start
        """)
        
        result = db.execute(query, {
            "canister_id": canister_id,
            "window_start": window_start
        })
        
        count = result.scalar() or 0
        
        # Determine frequency status
        if count == 0:
            frequency_status = "Green"
        elif count == 5:
            frequency_status = "Yellow"
        elif count > 5:
            frequency_status = "Red"
        else:
            frequency_status = "Green"  # 1-4 deviations still Green
        
        return {
            "count": count,
            "frequency_status": frequency_status,
            "window_minutes": window_minutes
        }
    except Exception as e:
        logger.error(f"Error getting IVF violation frequency: {e}", exc_info=True)
        return {"count": 0, "frequency_status": "Green", "error": str(e)}
    finally:
        db.close()

def get_ivf_violation_duration(canister_id: int, parameter_name: str, current_violation: bool) -> Dict[str, Any]:
    """
    Get duration of current violation for a parameter.
    
    Logic:
    - 0 minutes = Green
    - ≥5 minutes = triggers alerting along with magnitude/frequency
    
    Args:
        canister_id: Canister ID
        parameter_name: Parameter name
        current_violation: Whether current reading is a violation
    
    Returns:
        Dict with:
        - duration_minutes: float (duration of violation in minutes)
        - duration_status: str ("Green", "Alert")
        - violation_start: datetime or None
    """
    db = PublisherSessionLocal()
    try:
        # Determine which violation flag to check (IVF KPIs: Temp Internal, Temp External, Humidity, Shock)
        violation_flag_map = {
            "temp_internal": "is_temp_loss",
            "temp_external": "is_temp_loss",  # Both temps use is_temp_loss flag
            "humidity": "is_humidity_loss",
            "shock": "is_agitation_loss"  # Shock uses is_agitation_loss flag
        }
        
        violation_flag = violation_flag_map.get(parameter_name)
        if not violation_flag:
            return {"duration_minutes": 0.0, "duration_status": "Green", "violation_start": None}
        
        if not current_violation:
            # No current violation
            return {"duration_minutes": 0.0, "duration_status": "Green", "violation_start": None}
        
        # Current reading is a violation - find when the violation sequence started
        # Look for the most recent non-violation, then the first violation after that
        # This finds the start of the current violation sequence
        query = text(f"""
            WITH violation_sequence AS (
                SELECT 
                    reading_timestamp,
                    {violation_flag} as is_violation,
                    LAG({violation_flag}) OVER (ORDER BY reading_timestamp DESC) as prev_violation
                FROM ivf_quality_log
                WHERE canister_id = :canister_id
                ORDER BY reading_timestamp DESC
                LIMIT 100
            )
            SELECT reading_timestamp
            FROM violation_sequence
            WHERE is_violation = true 
              AND (prev_violation = false OR prev_violation IS NULL)
            ORDER BY reading_timestamp DESC
            LIMIT 1
        """)
        
        result = db.execute(query, {"canister_id": canister_id})
        violation_start = result.scalar()
        
        if violation_start:
            duration_minutes = (datetime.now() - violation_start).total_seconds() / 60.0
            
            if duration_minutes >= 5.0:
                duration_status = "Alert"
            else:
                duration_status = "Green"
            
            return {
                "duration_minutes": round(duration_minutes, 2),
                "duration_status": duration_status,
                "violation_start": violation_start.isoformat() if hasattr(violation_start, 'isoformat') else str(violation_start)
            }
        else:
            # First violation in history (or no previous records)
            # Use current time as start
            violation_start = datetime.now()
            return {
                "duration_minutes": 0.0,
                "duration_status": "Green",
                "violation_start": violation_start.isoformat()
            }
    except Exception as e:
        logger.error(f"Error getting IVF violation duration: {e}", exc_info=True)
        return {"duration_minutes": 0.0, "duration_status": "Green", "violation_start": None, "error": str(e)}
    finally:
        db.close()

def calculate_ivf_kpi_score(parameter_name: str, value: float, 
                             magnitude_result: Dict[str, Any],
                             frequency_result: Dict[str, Any],
                             duration_result: Dict[str, Any]) -> int:
    """
    Calculate IVF KPI score based on magnitude, frequency, and duration.
    
    Returns:
        0 (Green), 1 (Yellow), or 2 (Red)
    """
    magnitude_status = magnitude_result.get("magnitude_status", "Green")
    frequency_status = frequency_result.get("frequency_status", "Green")
    duration_status = duration_result.get("duration_status", "Green")
    
    # Priority: Magnitude > Frequency > Duration
    # If magnitude is Critical, return Red (2)
    if magnitude_status == "Critical":
        return 2
    
    # If magnitude is Red, return Red (2)
    if magnitude_status == "Red":
        return 2
    
    # If magnitude is Yellow, check frequency and duration
    if magnitude_status == "Yellow":
        # If frequency is Red or duration is Alert, escalate to Red
        if frequency_status == "Red" or duration_status == "Alert":
            return 2
        # Otherwise Yellow
        return 1
    
    # Magnitude is Green, but check if frequency/duration indicate issues
    if frequency_status == "Red":
        return 2
    if frequency_status == "Yellow" or duration_status == "Alert":
        return 1
    
    # All Green
    return 0

def transform_webhook_to_ivf_quality_data(webhook_response: Dict[str, Any], ivf_shipment_info: Dict[str, Any]) -> Dict[str, Any]:
    """Transform webhook response data to IVF quality data format"""
    webhook_data = webhook_response.get("webhook_data", webhook_response)
    
    # Handle case where webhook_data has raw_body that needs parsing
    if isinstance(webhook_data, dict) and "raw_body" in webhook_data:
        raw_body = webhook_data.get("raw_body", "")
        if raw_body:
            try:
                parsed_data = json.loads(raw_body)
                if isinstance(parsed_data, dict):
                    webhook_data = parsed_data
                elif isinstance(parsed_data, dict) and "webhook_data" in parsed_data:
                    webhook_data = parsed_data["webhook_data"]
            except (json.JSONDecodeError, TypeError):
                pass
    
    # Extract thresholds from Tive webhook (if available)
    try:
        tive_thresholds = extract_thresholds_from_tive_webhook(webhook_data)
        if tive_thresholds:
            logger.info(f"✓ Using thresholds from Tive webhook for IVF: {json.dumps(tive_thresholds, indent=2)}")
            print(f"✓ Using thresholds from Tive webhook for IVF", flush=True)
        else:
            logger.warning("⚠ No thresholds found in Tive webhook for IVF, using fallback static thresholds")
            print(f"⚠ No thresholds found in Tive webhook for IVF, using fallback static thresholds", flush=True)
            tive_thresholds = None
    except Exception as e:
        logger.error(f"Error extracting Tive thresholds for IVF, using fallback: {e}", exc_info=True)
        tive_thresholds = None
    
    # Extract Temperature Internal (Probe) and External (Device) (IVF KPIs)
    # Internal = Probe temperature (inside cryogenic can)
    # External = Device temperature (TT7100 outside the can)
    temp_internal_celsius = None
    temp_internal_fahrenheit = None
    temp_external_celsius = None
    temp_external_fahrenheit = None
    
    # Check for ProbeTemperature (Internal/Probe temperature)
    if "ProbeTemperature" in webhook_data and webhook_data["ProbeTemperature"]:
        probe_obj = webhook_data["ProbeTemperature"]
        if isinstance(probe_obj, dict):
            temp_internal_celsius = probe_obj.get("Celsius")
            temp_internal_fahrenheit = probe_obj.get("Fahrenheit")
    elif "Probe" in webhook_data and webhook_data["Probe"]:
        probe_obj = webhook_data["Probe"]
        if isinstance(probe_obj, dict):
            if "Temperature" in probe_obj:
                probe_temp = probe_obj["Temperature"]
                if isinstance(probe_temp, dict):
                    temp_internal_celsius = probe_temp.get("Celsius")
                    temp_internal_fahrenheit = probe_temp.get("Fahrenheit")
    
    # Check for DeviceTemperature or ExternalTemperature (External/Device temperature)
    if "DeviceTemperature" in webhook_data and webhook_data["DeviceTemperature"]:
        device_obj = webhook_data["DeviceTemperature"]
        if isinstance(device_obj, dict):
            temp_external_celsius = device_obj.get("Celsius")
            temp_external_fahrenheit = device_obj.get("Fahrenheit")
    
    # Check for Temperature object (may contain Internal/External or just general Temperature)
    if "Temperature" in webhook_data and webhook_data["Temperature"]:
        temp_obj = webhook_data["Temperature"]
        # Check for Internal/External specific fields
        if "Internal" in temp_obj:
            internal_obj = temp_obj["Internal"]
            if isinstance(internal_obj, dict):
                temp_internal_celsius = temp_internal_celsius or internal_obj.get("Celsius")
                temp_internal_fahrenheit = temp_internal_fahrenheit or internal_obj.get("Fahrenheit")
        elif "InternalCelsius" in temp_obj:
            temp_internal_celsius = temp_internal_celsius or temp_obj.get("InternalCelsius")
            temp_internal_fahrenheit = temp_internal_fahrenheit or temp_obj.get("InternalFahrenheit")
        
        if "External" in temp_obj:
            external_obj = temp_obj["External"]
            if isinstance(external_obj, dict):
                temp_external_celsius = temp_external_celsius or external_obj.get("Celsius")
                temp_external_fahrenheit = temp_external_fahrenheit or external_obj.get("Fahrenheit")
        elif "ExternalCelsius" in temp_obj:
            temp_external_celsius = temp_external_celsius or temp_obj.get("ExternalCelsius")
            temp_external_fahrenheit = temp_external_fahrenheit or temp_obj.get("ExternalFahrenheit")
        
        # If no Internal/External found, use general Temperature as Internal (fallback)
        if temp_internal_celsius is None:
            temp_internal_celsius = temp_obj.get("Celsius")
            temp_internal_fahrenheit = temp_obj.get("Fahrenheit")
    
    # Also check for separate TemperatureInternal and TemperatureExternal objects
    if "TemperatureInternal" in webhook_data and webhook_data["TemperatureInternal"]:
        temp_int_obj = webhook_data["TemperatureInternal"]
        if isinstance(temp_int_obj, dict):
            temp_internal_celsius = temp_internal_celsius or temp_int_obj.get("Celsius")
            temp_internal_fahrenheit = temp_internal_fahrenheit or temp_int_obj.get("Fahrenheit")
    
    if "TemperatureExternal" in webhook_data and webhook_data["TemperatureExternal"]:
        temp_ext_obj = webhook_data["TemperatureExternal"]
        if isinstance(temp_ext_obj, dict):
            temp_external_celsius = temp_external_celsius or temp_ext_obj.get("Celsius")
            temp_external_fahrenheit = temp_external_fahrenheit or temp_ext_obj.get("Fahrenheit")
    
    # Extract humidity (IVF KPI)
    humidity = None
    if "Humidity" in webhook_data and webhook_data["Humidity"]:
        humidity = webhook_data["Humidity"].get("Percentage")
    
    # Extract Shock.G (IVF KPI)
    # Note: agitation and shock are the same - both represent Shock.G value
    # Check multiple possible field names for shock/G-force data
    # Handle null values: if Shock exists but is null, treat as no data (not 0)
    shock_g = None
    if "Shock" in webhook_data:
        shock_obj = webhook_data["Shock"]
        if shock_obj is not None:  # Explicitly check for null/None
            if isinstance(shock_obj, dict):
                shock_g = shock_obj.get("G") or shock_obj.get("GForce") or shock_obj.get("GForceValue") or shock_obj.get("Value")
            elif isinstance(shock_obj, (int, float)):
                shock_g = shock_obj
    if shock_g is None and "Acceleration" in webhook_data:
        accel_obj = webhook_data["Acceleration"]
        if accel_obj is not None:  # Explicitly check for null/None
            if isinstance(accel_obj, dict):
                shock_g = accel_obj.get("G") or accel_obj.get("GForce") or accel_obj.get("GForceValue")
    if shock_g is None and "GForce" in webhook_data:
        gforce_val = webhook_data.get("GForce")
        if gforce_val is not None:  # Explicitly check for null/None
            shock_g = gforce_val
    if shock_g is None and "GForceValue" in webhook_data:
        gforce_val = webhook_data.get("GForceValue")
        if gforce_val is not None:  # Explicitly check for null/None
            shock_g = gforce_val
    
    agitation = convert_shock_g_to_agitation(shock_g)
    # Use agitation value for shock (they are the same - agitation = shock)
    shock_value = agitation
    
    # Extract location (latitude and longitude) - current device location
    latitude = None
    longitude = None
    if "Location" in webhook_data and webhook_data["Location"]:
        location_obj = webhook_data["Location"]
        latitude = location_obj.get("Latitude")
        longitude = location_obj.get("Longitude")
    
    # Extract battery percentage - check multiple possible field names
    battery_percentage = None
    if "Battery" in webhook_data and webhook_data["Battery"]:
        battery_obj = webhook_data["Battery"]
        if isinstance(battery_obj, dict):
            battery_percentage = battery_obj.get("Percentage") or battery_obj.get("Percent") or battery_obj.get("Level")
        elif isinstance(battery_obj, (int, float)):
            battery_percentage = battery_obj
    elif "BatteryPercent" in webhook_data:
        battery_percentage = webhook_data.get("BatteryPercent")
    elif "BatteryLevel" in webhook_data:
        battery_percentage = webhook_data.get("BatteryLevel")
    
    # Extract ShipFrom and ShipTo from webhook or use IVF shipment info
    ship_from_latitude = None
    ship_from_longitude = None
    ship_to_latitude = None
    ship_to_longitude = None
    
    # Try to get from webhook Shipment object first
    if "Shipment" in webhook_data:
        shipment_obj = webhook_data.get("Shipment")
        if isinstance(shipment_obj, dict):
            if "ShipFrom" in shipment_obj and shipment_obj.get("ShipFrom"):
                ship_from_obj = shipment_obj["ShipFrom"]
                if isinstance(ship_from_obj, dict):
                    ship_from_latitude = ship_from_obj.get("Latitude")
                    ship_from_longitude = ship_from_obj.get("Longitude")
            
            if "ShipTo" in shipment_obj and shipment_obj.get("ShipTo"):
                ship_to_obj = shipment_obj["ShipTo"]
                if isinstance(ship_to_obj, dict):
                    ship_to_latitude = ship_to_obj.get("Latitude")
                    ship_to_longitude = ship_to_obj.get("Longitude")
    
    # Extract shipment_id
    shipment_id = webhook_data.get("ShipmentId") or ivf_shipment_info.get("shipment_id")
    if "Shipment" in webhook_data:
        shipment_obj = webhook_data.get("Shipment")
        if isinstance(shipment_obj, dict) and not shipment_id:
            shipment_id = shipment_obj.get("Id")
    
    # IVF-Specific Threshold Logic: Magnitude, Frequency, Duration
    # IVF KPIs: Temperature Internal, Temperature External, Humidity, Shock
    canister_id = ivf_shipment_info.get("canister_id")
    
    # Build parameters dict for IVF KPIs
    parameters = {
        "temp_internal": temp_internal_celsius,
        "temp_internal_fahrenheit": temp_internal_fahrenheit,
        "temp_external": temp_external_celsius,
        "temp_external_fahrenheit": temp_external_fahrenheit,
        "humidity": humidity,
        "shock": shock_value  # Use shock_g if available, otherwise use agitation (they are the same)
    }
    
    # IVF KPI names
    ivf_kpi_names = ["temp_internal", "temp_external", "humidity", "shock"]
    
    # Build thresholds info for IVF KPIs
    # Special cases:
    # - temp_internal: Operating range -20°C to 60°C (below -20°C covered by Dry Ice/Cryogenic probes)
    # - temp_external: anything above 30°C is a violation (no ±5 band)
    thresholds = {}
    for param_name in ivf_kpi_names:
        target = get_ivf_parameter_target(param_name)
        if param_name == "temp_internal":
            # Internal temp: Operating range -20°C to 60°C
            thresholds[param_name] = {
                "target": target,  # 20°C (center of range)
                "min": -20.0,  # Minimum operating temperature
                "max": 60.0,   # Maximum operating temperature
                "unit": "°C"
            }
        elif param_name == "temp_external":
            # External temp: anything above 30°C is a violation
            thresholds[param_name] = {
                "target": target,  # 30°C
                "min": None,  # No minimum (any value below 30°C is acceptable)
                "max": target,  # 30°C is the maximum acceptable
                "unit": "°C"
            }
        else:
            # Other KPIs: ±5 acceptable band
            thresholds[param_name] = {
                "target": target,
                "min": target - 5.0,  # ±5 acceptable band
                "max": target + 5.0,  # ±5 acceptable band
                "unit": "°C" if "temp" in param_name else ("%" if param_name == "humidity" else "G")
            }
    
    # Check thresholds using IVF-specific magnitude-based logic
    threshold_violations = {}
    violated_parameters = []
    magnitude_results = {}
    frequency_results = {}
    duration_results = {}
    kpi_scores = {}
    kpi_visualization = {}  # For image/PDF rendering
    
    # Process each IVF KPI (Temperature Internal, Temperature External, Humidity, Shock)
    for param_name in ivf_kpi_names:
        value = parameters[param_name]
        # Skip if value is None (e.g., Light might not be available)
        if value is None:
            continue
            
        # Check magnitude (deviation from ±5 acceptable band)
        magnitude_result = check_ivf_threshold_magnitude(param_name, value)
        magnitude_results[param_name] = magnitude_result
        
        # Get frequency (count of violations in time window)
        frequency_result = get_ivf_violation_frequency(canister_id, param_name, window_minutes=60)
        frequency_results[param_name] = frequency_result
        
        # Get duration (how long current violation has persisted)
        current_violation = magnitude_result.get("is_violation", False)
        duration_result = get_ivf_violation_duration(canister_id, param_name, current_violation)
        duration_results[param_name] = duration_result
        
        # Calculate highest severity from Magnitude, Frequency, Duration
        # Priority: Magnitude > Frequency > Duration
        magnitude_status = magnitude_result.get("magnitude_status", "Green")
        frequency_status = frequency_result.get("frequency_status", "Green")
        duration_status = duration_result.get("duration_status", "Green")
        
        # Map statuses to scores: Green=0, Yellow=1, Red=2, Critical=2, Alert=2
        magnitude_score = 0 if magnitude_status == "Green" else (1 if magnitude_status == "Yellow" else 2)
        frequency_score = 0 if frequency_status == "Green" else (1 if frequency_status == "Yellow" else 2)
        duration_score = 0 if duration_status == "Green" else 2  # Alert = Red
        
        # Highest severity wins (for visualization)
        highest_severity_score = max(magnitude_score, frequency_score, duration_score)
        kpi_scores[param_name] = highest_severity_score
        
        # Set violation flag (True if beyond ±5 acceptable band)
        threshold_violations[param_name] = magnitude_result.get("is_violation", False)
        if magnitude_result.get("is_violation", False):
            violated_parameters.append(param_name)
        
        # Build KPI visualization data for image/PDF rendering
        kpi_visualization[param_name] = {
            "value": value,
            "target": magnitude_result.get("target"),
            "acceptable_min": magnitude_result.get("acceptable_min"),
            "acceptable_max": magnitude_result.get("acceptable_max"),
            "deviation": magnitude_result.get("deviation", 0.0),
            "severity": "Green" if highest_severity_score == 0 else ("Yellow" if highest_severity_score == 1 else "Red"),
            "severity_score": highest_severity_score,
            "magnitude_status": magnitude_status,
            "magnitude_score": magnitude_score,
            "frequency_status": frequency_status,
            "frequency_count": frequency_result.get("count", 0),
            "frequency_score": frequency_score,
            "duration_status": duration_status,
            "duration_minutes": duration_result.get("duration_minutes", 0.0),
            "duration_breach": duration_status == "Alert",  # True if ≥5 minutes
            "duration_score": duration_score,
            "triggers_alert": magnitude_result.get("triggers_alert", False),  # Beyond ±5 triggers email + SMS
            "unit": thresholds[param_name].get("unit", "")
        }
    
    # Calculate quality loss percentage (based on magnitude deviations, only for tracked KPIs)
    quality_loss = 0.0
    for param_name in ivf_kpi_names:
        if param_name in magnitude_results and parameters.get(param_name) is not None:
            magnitude_result = magnitude_results[param_name]
            deviation = magnitude_result.get("deviation", 0.0)
            if deviation > 0:
                # Calculate loss based on deviation (deviation > 5 = 100% loss for that parameter)
                param_loss = min((deviation / 5.0) * 100, 100.0)
                # Weight by parameter importance (Temperature most critical)
                if "temp" in param_name:
                    weight = 0.35  # Both temps share weight
                elif param_name == "humidity":
                    weight = 0.25
                elif param_name == "shock":
                    weight = 0.15
                else:
                    weight = 0.1
                quality_loss += param_loss * weight
    
    quality_loss = min(quality_loss, 100.0)
    
    # Calculate quality status and percentage from KPI scores
    quality_status, quality_percentage = calculate_quality_status_from_kpis(kpi_scores)
    
    # Include KPI statuses
    kpi_statuses = {}
    for param_name, score in kpi_scores.items():
        if score == 0:
            kpi_statuses[param_name] = "Good"
        elif score == 1:
            kpi_statuses[param_name] = "Warning"
        else:
            kpi_statuses[param_name] = "Critical"
    
    # Get timestamp
    timestamp = webhook_response.get("received_at")
    if not timestamp:
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    else:
        try:
            dt = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
            timestamp = dt.strftime("%Y-%m-%d %H:%M:%S")
        except:
            pass
    
    # Build complete data structure for IVF
    data = {
        "canister_id": ivf_shipment_info.get("canister_id"),
        "canister_number": ivf_shipment_info.get("canister_number"),  # Include for WebSocket matching
        "shipment_id": shipment_id,
        "device_id": ivf_shipment_info.get("device_id"),
        "cryolock_id": ivf_shipment_info.get("cryolock_id"),
        # IVF KPIs: Temperature Internal, Temperature External, Humidity, Shock
        "temp_internal": parameters.get("temp_internal"),
        "temp_internal_fahrenheit": parameters.get("temp_internal_fahrenheit"),
        "temp_external": parameters.get("temp_external"),
        "temp_external_fahrenheit": parameters.get("temp_external_fahrenheit"),
        "humidity": parameters.get("humidity"),
        "shock": parameters.get("shock"),  # Shock in G
        "latitude": latitude,
        "longitude": longitude,
        "battery_percentage": battery_percentage,  # Device battery level (0-100)
        "ship_from": {
            "latitude": ship_from_latitude,
            "longitude": ship_from_longitude
        },
        "ship_to": {
            "latitude": ship_to_latitude,
            "longitude": ship_to_longitude
        },
        "timestamp": timestamp,
        "thresholds": thresholds,
        "threshold_violations": threshold_violations,
        "violated_parameters": violated_parameters,
        "quality_loss": quality_loss,
        "quality_status": quality_status,
        "quality_percentage": quality_percentage,
        "kpi_scores": kpi_scores,
        "kpi_statuses": kpi_statuses,
        # IVF-specific threshold logic results
        "magnitude_results": magnitude_results,  # Magnitude-based threshold results
        "frequency_results": frequency_results,  # Frequency-based threshold results
        "duration_results": duration_results,  # Duration-based threshold results
        # KPI visualization data for image/PDF rendering
        "kpi_visualization": kpi_visualization  # Complete KPI data for visualization (severity, duration breach, etc.)
    }
    
    return data

def transform_webhook_to_quality_data(webhook_response: Dict[str, Any], patient_id: str) -> Dict[str, Any]:
    """Transform webhook response data to quality data format"""
    webhook_data = webhook_response.get("webhook_data", webhook_response)
    
    # Handle case where webhook_data has raw_body that needs parsing
    if isinstance(webhook_data, dict) and "raw_body" in webhook_data:
        raw_body = webhook_data.get("raw_body", "")
        if raw_body:
            try:
                parsed_data = json.loads(raw_body)
                if isinstance(parsed_data, dict):
                    webhook_data = parsed_data
                elif isinstance(parsed_data, dict) and "webhook_data" in parsed_data:
                    webhook_data = parsed_data["webhook_data"]
            except (json.JSONDecodeError, TypeError):
                pass
    
    # Extract thresholds from Tive webhook (if available)
    # First, log the full webhook structure to debug threshold extraction
    logger.info(f" Full webhook data structure for threshold extraction: {json.dumps(webhook_data, indent=2, default=str)[:2000]}")
    print(f" Checking webhook for threshold data...", flush=True)
    
    try:
        tive_thresholds = extract_thresholds_from_tive_webhook(webhook_data)
        if tive_thresholds:
            logger.info(f"✓ Using thresholds from Tive webhook: {json.dumps(tive_thresholds, indent=2)}")
            print(f"✓ Using thresholds from Tive webhook:", flush=True)
            for param, threshold in tive_thresholds.items():
                print(f"  - {param}: {threshold.get('min')} - {threshold.get('max')} {threshold.get('unit', '')}", flush=True)
        else:
            logger.warning("⚠ No thresholds found in Tive webhook, using fallback static thresholds")
            logger.info(f"Webhook keys available: {list(webhook_data.keys()) if isinstance(webhook_data, dict) else 'Not a dict'}")
            print(f"⚠ No thresholds found in Tive webhook, using fallback static thresholds", flush=True)
            print(f"  Available webhook keys: {list(webhook_data.keys()) if isinstance(webhook_data, dict) else 'Not a dict'}", flush=True)
    except Exception as e:
        logger.error(f"Error extracting Tive thresholds, using fallback: {e}", exc_info=True)
        print(f"✗ Error extracting Tive thresholds, using fallback: {e}", flush=True)
        import traceback
        traceback.print_exc()
        tive_thresholds = None
    
    # Extract temperature
    temperature_celsius = None
    temperature_fahrenheit = None
    if "Temperature" in webhook_data and webhook_data["Temperature"]:
        temp_obj = webhook_data["Temperature"]
        temperature_celsius = temp_obj.get("Celsius")
        temperature_fahrenheit = temp_obj.get("Fahrenheit")
    
    # Extract humidity
    humidity = None
    if "Humidity" in webhook_data and webhook_data["Humidity"]:
        humidity = webhook_data["Humidity"].get("Percentage")
    
    # Extract Shock.G and convert to agitation
    shock_g = None
    if "Shock" in webhook_data and webhook_data["Shock"]:
        shock_g = webhook_data["Shock"].get("G")
    
    agitation = convert_shock_g_to_agitation(shock_g)
    
    # Extract location (latitude and longitude) - current device location
    latitude = None
    longitude = None
    if "Location" in webhook_data and webhook_data["Location"]:
        location_obj = webhook_data["Location"]
        latitude = location_obj.get("Latitude")
        longitude = location_obj.get("Longitude")
    
    # Extract ShipFrom location (origin/shipping from location)
    ship_from_latitude = None
    ship_from_longitude = None
    ship_from_address = None
    ship_from_formatted_address = None
    
    # Extract ShipTo location (destination/shipping to location)
    ship_to_latitude = None
    ship_to_longitude = None
    ship_to_address = None
    ship_to_formatted_address = None
    
    # Extract shipment_id and location data from webhook
    shipment_id = None
    if "ShipmentId" in webhook_data:
        shipment_id = webhook_data.get("ShipmentId")
    
    # Debug: Check webhook_data structure
    print(f" webhook_data keys: {list(webhook_data.keys()) if isinstance(webhook_data, dict) else 'Not a dict'}", flush=True)
    logger.debug(f"webhook_data keys: {list(webhook_data.keys()) if isinstance(webhook_data, dict) else 'Not a dict'}")
    
    # Always check Shipment object for location data (even if ShipmentId exists at top level)
    if "Shipment" in webhook_data:
        shipment_obj = webhook_data.get("Shipment")
        print(f" Shipment object found: {shipment_obj is not None}, type: {type(shipment_obj)}", flush=True)
        
        if shipment_obj is not None and isinstance(shipment_obj, dict):
            # Use Shipment.Id if shipment_id wasn't already set
            if not shipment_id:
                shipment_id = shipment_obj.get("Id")
            
            logger.debug(f"Found Shipment object, keys: {list(shipment_obj.keys())}")
            print(f" Shipment object keys: {list(shipment_obj.keys())}", flush=True)
            
            # Debug ShipFrom and ShipTo
            if "ShipFrom" in shipment_obj:
                ship_from_raw = shipment_obj.get("ShipFrom")
                print(f" ShipFrom present: True, type: {type(ship_from_raw)}, value: {json.dumps(ship_from_raw, default=str)[:300] if ship_from_raw else 'None/Empty'}", flush=True)
            else:
                print(f" ShipFrom key not found in Shipment object", flush=True)
                
            if "ShipTo" in shipment_obj:
                ship_to_raw = shipment_obj.get("ShipTo")
                print(f" ShipTo present: True, type: {type(ship_to_raw)}, value: {json.dumps(ship_to_raw, default=str)[:300] if ship_to_raw else 'None/Empty'}", flush=True)
            else:
                print(f" ShipTo key not found in Shipment object", flush=True)
            
            # Extract ShipFrom location - check if key exists and is not None
            if "ShipFrom" in shipment_obj and shipment_obj.get("ShipFrom") is not None:
                ship_from_obj = shipment_obj["ShipFrom"]
                if isinstance(ship_from_obj, dict):
                    ship_from_latitude = ship_from_obj.get("Latitude")
                    ship_from_longitude = ship_from_obj.get("Longitude")
                    ship_from_formatted_address = ship_from_obj.get("FormattedAddress")
                    logger.info(f"✓ Extracted ShipFrom: lat={ship_from_latitude}, lon={ship_from_longitude}, address={ship_from_formatted_address}")
                    print(f"✓ Extracted ShipFrom: lat={ship_from_latitude}, lon={ship_from_longitude}, address={ship_from_formatted_address}", flush=True)
                    if "Address" in ship_from_obj and ship_from_obj.get("Address") is not None:
                        address_obj = ship_from_obj["Address"]
                        if isinstance(address_obj, dict):
                            ship_from_address = {
                                "street": address_obj.get("Street"),
                                "sublocality": address_obj.get("Sublocality"),
                                "locality": address_obj.get("Locality"),
                                "state": address_obj.get("State"),
                                "country": address_obj.get("Country"),
                                "zip_code": address_obj.get("ZipCode")
                            }
                else:
                    logger.warning(f"ShipFrom is not a dict: {type(ship_from_obj)}")
            else:
                logger.debug(f"ShipFrom not found or is None. ShipFrom present: {'ShipFrom' in shipment_obj}, value: {shipment_obj.get('ShipFrom')}")
                print(f"⚠ ShipFrom check: present={'ShipFrom' in shipment_obj}, value={shipment_obj.get('ShipFrom')}", flush=True)
            
            # Extract ShipTo location - check if key exists and is not None
            if "ShipTo" in shipment_obj and shipment_obj.get("ShipTo") is not None:
                ship_to_obj = shipment_obj["ShipTo"]
                if isinstance(ship_to_obj, dict):
                    ship_to_latitude = ship_to_obj.get("Latitude")
                    ship_to_longitude = ship_to_obj.get("Longitude")
                    ship_to_formatted_address = ship_to_obj.get("FormattedAddress")
                    logger.info(f"✓ Extracted ShipTo: lat={ship_to_latitude}, lon={ship_to_longitude}, address={ship_to_formatted_address}")
                    print(f"✓ Extracted ShipTo: lat={ship_to_latitude}, lon={ship_to_longitude}, address={ship_to_formatted_address}", flush=True)
                    if "Address" in ship_to_obj and ship_to_obj.get("Address") is not None:
                        address_obj = ship_to_obj["Address"]
                        if isinstance(address_obj, dict):
                            ship_to_address = {
                                "street": address_obj.get("Street"),
                                "sublocality": address_obj.get("Sublocality"),
                                "locality": address_obj.get("Locality"),
                                "state": address_obj.get("State"),
                                "country": address_obj.get("Country"),
                                "zip_code": address_obj.get("ZipCode")
                            }
                else:
                    logger.warning(f"ShipTo is not a dict: {type(ship_to_obj)}")
            else:
                logger.debug(f"ShipTo not found or is None. ShipTo present: {'ShipTo' in shipment_obj}, value: {shipment_obj.get('ShipTo')}")
                print(f"⚠ ShipTo check: present={'ShipTo' in shipment_obj}, value={shipment_obj.get('ShipTo')}", flush=True)
    else:
        logger.debug(f"Shipment object not found in webhook_data. Keys: {list(webhook_data.keys()) if isinstance(webhook_data, dict) else 'Not a dict'}")
        print(f"⚠ Shipment object not found in webhook_data", flush=True)
    
    # Validate required fields
    if temperature_celsius is None or humidity is None:
        raise ValueError(f"Missing required webhook data: temperature={temperature_celsius}, humidity={humidity}")
    
    # Fetch thresholds from therapy table for this patient
    therapy_thresholds = get_thresholds_from_therapy_table(patient_id)
    
    # Priority: Tive webhook thresholds > Therapy table thresholds > Static defaults
    if tive_thresholds:
        active_thresholds = tive_thresholds
        logger.info(f"Using thresholds from Tive webhook for patient {patient_id}")
    elif therapy_thresholds:
        active_thresholds = therapy_thresholds
        logger.info(f"Using thresholds from therapy table for patient {patient_id}")
    else:
        active_thresholds = PARAMETER_THRESHOLDS
        logger.info(f"Using fallback static thresholds for patient {patient_id}")
    
    # Check thresholds
    parameters = {
        "temperature": temperature_celsius,
        "temperature_fahrenheit": temperature_fahrenheit,
        "humidity": humidity,
        "agitation": agitation
    }
    
    threshold_violations = {}
    violated_parameters = []
    
    for param_name in ["temperature", "humidity", "agitation"]:
        value = parameters[param_name]
        is_within_threshold = check_threshold(param_name, value, active_thresholds)
        threshold_violations[param_name] = not is_within_threshold
        if not is_within_threshold:
            violated_parameters.append(param_name)
    
    # Build thresholds info (use active thresholds - from Tive, Therapy table, or defaults)
    thresholds = {}
    for param_name in ["temperature", "humidity", "agitation"]:
        if param_name in active_thresholds:
            threshold_config = active_thresholds[param_name]
            thresholds[param_name] = {
                "min": threshold_config.get("min"),
                "max": threshold_config.get("max"),
                "unit": threshold_config.get("unit", "")
            }
        else:
            # Fallback: try therapy thresholds, then static defaults
            if therapy_thresholds and param_name in therapy_thresholds:
                threshold_config = therapy_thresholds[param_name]
                thresholds[param_name] = {
                    "min": threshold_config.get("min"),
                    "max": threshold_config.get("max"),
                    "unit": threshold_config.get("unit", "")
                }
            else:
                # Final fallback to static defaults
                default_config = PARAMETER_THRESHOLDS.get(param_name, {})
                thresholds[param_name] = {
                    "min": default_config.get("min"),
                    "max": default_config.get("max"),
                    "unit": default_config.get("unit", "")
                }
    
    # Calculate quality loss percentage (for backward compatibility)
    quality_loss = calculate_quality_loss(parameters, thresholds, threshold_violations)
    
    # Score each KPI based on PDF logic (Green=0, Yellow=1, Red=2)
    kpi_scores = {}
    for param_name in ["temperature", "humidity", "agitation"]:
        value = parameters.get(param_name)
        if value is not None:
            kpi_scores[param_name] = score_kpi_status(param_name, value, thresholds)
    
    # Calculate quality status and percentage from KPI scores (PDF-based logic)
    quality_status, quality_percentage = calculate_quality_status_from_kpis(kpi_scores)
    
    # Also include KPI scores in output for transparency
    kpi_statuses = {}
    for param_name, score in kpi_scores.items():
        if score == 0:
            kpi_statuses[param_name] = "Good"
        elif score == 1:
            kpi_statuses[param_name] = "Warning"
        else:
            kpi_statuses[param_name] = "Critical"
    
    # Get timestamp
    timestamp = webhook_response.get("received_at")
    if not timestamp:
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    else:
        try:
            dt = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
            timestamp = dt.strftime("%Y-%m-%d %H:%M:%S")
        except:
            pass
    
    # Build complete data structure
    data = {
        "patient_id": patient_id,
        "shipment_id": shipment_id,
        "temperature": parameters["temperature"],
        "temperature_fahrenheit": parameters["temperature_fahrenheit"],
        "humidity": parameters["humidity"],
        "agitation": parameters["agitation"],
        "latitude": latitude,
        "longitude": longitude,
        "ship_from": {
            "latitude": ship_from_latitude,
            "longitude": ship_from_longitude,
            "formatted_address": ship_from_formatted_address,
            "address": ship_from_address
        },
        "ship_to": {
            "latitude": ship_to_latitude,
            "longitude": ship_to_longitude,
            "formatted_address": ship_to_formatted_address,
            "address": ship_to_address
        },
        "timestamp": timestamp,
        "thresholds": thresholds,
        "threshold_violations": threshold_violations,
        "violated_parameters": violated_parameters,
        "quality_loss": quality_loss,
        "quality_status": quality_status,
        "quality_percentage": quality_percentage,
        "kpi_scores": kpi_scores,
        "kpi_statuses": kpi_statuses
    }
    
    return data

def process_webhook_data(webhook_response: Dict[str, Any]):
    """Process webhook data and publish to Redis for both CGT (patients) and IVF (canisters)"""
    try:
        logger.info("Starting webhook data processing...")
        print(f"Starting webhook data processing...", flush=True)
        
        webhook_data = webhook_response.get("webhook_data", webhook_response)
        
        # Log the webhook structure for debugging
        logger.info(f"Webhook data structure: {json.dumps(webhook_data, indent=2)[:1000]}")
        print(f"Webhook data keys: {list(webhook_data.keys()) if isinstance(webhook_data, dict) else 'Not a dict'}", flush=True)
        
        if isinstance(webhook_data, dict) and "raw_body" in webhook_data:
            raw_body = webhook_data.get("raw_body", "")
            if not raw_body or raw_body.strip() == "":
                logger.warning(f"Webhook entry has empty raw_body. Webhook structure: {json.dumps(webhook_response, indent=2)[:500]}")
                print(f"Warning: Webhook entry has empty raw_body. Webhook structure: {json.dumps(webhook_response, indent=2)[:500]}", flush=True)
                return 0
        
        # ========================================================================
        # STEP 1: Check for both IVF canister monitoring AND shipment monitoring
        # Both can happen simultaneously - device_id can match both canister and shipment
        # ========================================================================
        db = PublisherSessionLocal()
        canister_info = None
        ivf_shipment_info = None
        ivf_processed = False
        try:
            # Extract shipment_id and device_id from webhook
            shipment_id = webhook_data.get("ShipmentId")
            if "Shipment" in webhook_data:
                shipment_obj = webhook_data.get("Shipment")
                if isinstance(shipment_obj, dict) and not shipment_id:
                    shipment_id = shipment_obj.get("Id")
            
            device_id = extract_device_id_from_webhook(webhook_data)
            
            # Check 1: Canister monitoring (always check if device_id exists)
            if device_id:
                canister_info = find_canister_by_tive_device_id(db, device_id)
                if canister_info:
                    logger.info(f"✓ Found IVF canister (monitoring): canister_id={canister_info.get('canister_id')}, device_id={device_id}")
                    print(f"✓ Found IVF canister (monitoring): canister_id={canister_info.get('canister_id')}, device_id={device_id}", flush=True)
            
            # Check 2: Shipment monitoring (ALSO check - don't stop after canister)
            if shipment_id or device_id:
                ivf_shipment_info = find_ivf_shipment_by_identifiers(db, shipment_id, device_id)
                if ivf_shipment_info:
                    logger.info(f"✓ Found IVF shipment: shipment_id={ivf_shipment_info.get('shipment_id')}, canister_id={ivf_shipment_info.get('canister_id')}")
                    print(f"✓ Found IVF shipment: shipment_id={ivf_shipment_info.get('shipment_id')}, canister_id={ivf_shipment_info.get('canister_id')}", flush=True)
        except Exception as e:
            logger.error(f"Error checking for IVF shipment/canister: {e}", exc_info=True)
            print(f"✗ Error checking for IVF shipment/canister: {e}", flush=True)
        finally:
            db.close()
        
        # ========================================================================
        # STEP 2: Process IVF canister monitoring (if found)
        # ========================================================================
        if canister_info:
            try:
                logger.info("Processing IVF canister monitoring webhook...")
                print(f"Processing IVF canister monitoring webhook...", flush=True)
                
                # Convert canister_info to same format as ivf_shipment_info for processing
                canister_ivf_info = {
                    "shipment_id": None,
                    "iot_shipment_id": None,
                    "canister_id": canister_info.get("canister_id"),
                    "device_id": device_id,
                    "cryolock_id": None,
                    "source_branch_id": None,
                    "destination_branch_id": None,
                    "canister_number": canister_info.get("canister_number")
                }
                
                # Transform webhook data for IVF
                ivf_data = transform_webhook_to_ivf_quality_data(webhook_response, canister_ivf_info)
                canister_id = canister_info.get("canister_id")
                
                # Publish to IVF Redis channel
                try:
                    r.publish('ivf_quality_channel', json.dumps(ivf_data))
                    logger.info(f"Published to Redis channel 'ivf_quality_channel' for canister {canister_id} (canister monitoring)")
                    print(f"  → Published to Redis channel 'ivf_quality_channel' (canister monitoring)", flush=True)
                except Exception as e:
                    logger.error(f"Error publishing to IVF Redis channel for canister {canister_id}: {e}")
                    print(f"  ✗ Error publishing to IVF Redis channel: {e}", flush=True)
                
                # Store in canister-specific history list
                try:
                    history_key = f'ivf_quality_history:{canister_id}'
                    r.lpush(history_key, json.dumps(ivf_data))
                    r.ltrim(history_key, 0, 9)  # Keep last 10 messages
                    logger.info(f"Stored in Redis list '{history_key}' for canister {canister_id} (canister monitoring)")
                    print(f"  → Stored in Redis list '{history_key}' (canister monitoring)", flush=True)
                except Exception as e:
                    logger.error(f"Error storing in IVF Redis list for canister {canister_id}: {e}")
                    print(f"  ✗ Error storing in IVF Redis list: {e}", flush=True)
                
                # Store canister ID in set
                try:
                    r.sadd('ivf_canisters', str(canister_id))
                    logger.debug(f"Added canister {canister_id} to Redis set 'ivf_canisters'")
                except Exception as e:
                    logger.error(f"Error adding canister {canister_id} to Redis set: {e}")
                
                # Insert into IVF database tables
                try:
                    insert_ivf_telemetry_data(canister_id, ivf_data)
                    logger.info(f"✓ Inserted IVF telemetry data for canister {canister_id} (canister monitoring)")
                    print(f"✓ Inserted IVF telemetry data for canister {canister_id} (canister monitoring)", flush=True)
                except Exception as e:
                    logger.error(f"Error inserting IVF telemetry data for canister {canister_id}: {e}", exc_info=True)
                    print(f"  ✗ Error inserting IVF telemetry data: {e}", flush=True)
                
                logger.info(f"✓ Successfully processed IVF canister monitoring for canister {canister_id}")
                print(f"✓ Successfully processed IVF canister monitoring for canister {canister_id} at {ivf_data['timestamp']}", flush=True)
                ivf_processed = True
                
            except Exception as e:
                logger.error(f"Error processing IVF canister monitoring: {e}", exc_info=True)
                print(f"✗ Error processing IVF canister monitoring: {e}", flush=True)
                import traceback
                traceback.print_exc()
        
        # ========================================================================
        # STEP 3: Process IVF shipment monitoring (if found - runs even if canister was processed)
        # ========================================================================
        if ivf_shipment_info:
            try:
                logger.info("Processing IVF shipment webhook...")
                print(f"Processing IVF shipment webhook...", flush=True)
                
                # Transform webhook data for IVF
                ivf_data = transform_webhook_to_ivf_quality_data(webhook_response, ivf_shipment_info)
                canister_id = ivf_shipment_info.get("canister_id")
                
                # Publish to IVF Redis channel
                try:
                    r.publish('ivf_quality_channel', json.dumps(ivf_data))
                    logger.info(f"Published to Redis channel 'ivf_quality_channel' for canister {canister_id} (shipment monitoring)")
                    print(f"  → Published to Redis channel 'ivf_quality_channel' (shipment monitoring)", flush=True)
                except Exception as e:
                    logger.error(f"Error publishing to IVF Redis channel for canister {canister_id}: {e}")
                    print(f"  ✗ Error publishing to IVF Redis channel: {e}", flush=True)
                
                # Store in canister-specific history list
                try:
                    history_key = f'ivf_quality_history:{canister_id}'
                    r.lpush(history_key, json.dumps(ivf_data))
                    r.ltrim(history_key, 0, 9)  # Keep last 10 messages
                    logger.info(f"Stored in Redis list '{history_key}' for canister {canister_id} (shipment monitoring)")
                    print(f"  → Stored in Redis list '{history_key}' (shipment monitoring)", flush=True)
                except Exception as e:
                    logger.error(f"Error storing in IVF Redis list for canister {canister_id}: {e}")
                    print(f"  ✗ Error storing in IVF Redis list: {e}", flush=True)
                
                # Store canister ID in set
                try:
                    r.sadd('ivf_canisters', str(canister_id))
                    logger.debug(f"Added canister {canister_id} to Redis set 'ivf_canisters'")
                except Exception as e:
                    logger.error(f"Error adding canister {canister_id} to Redis set: {e}")
                
                # Insert into IVF database tables
                try:
                    insert_ivf_telemetry_data(canister_id, ivf_data)
                    logger.info(f"✓ Inserted IVF telemetry data for canister {canister_id} (shipment monitoring)")
                    print(f"✓ Inserted IVF telemetry data for canister {canister_id} (shipment monitoring)", flush=True)
                except Exception as e:
                    logger.error(f"Error inserting IVF telemetry data for canister {canister_id}: {e}", exc_info=True)
                    print(f"  ✗ Error inserting IVF telemetry data: {e}", flush=True)
                
                logger.info(f"✓ Successfully processed IVF shipment monitoring for canister {canister_id}")
                print(f"✓ Successfully processed IVF shipment monitoring for canister {canister_id} at {ivf_data['timestamp']}", flush=True)
                ivf_processed = True
                
            except Exception as e:
                logger.error(f"Error processing IVF shipment monitoring: {e}", exc_info=True)
                print(f"✗ Error processing IVF shipment monitoring: {e}", flush=True)
                import traceback
                traceback.print_exc()
        
        # Set ivf_processed flag if either canister or shipment was processed
        if not ivf_processed:
            ivf_processed = False
        
        # ========================================================================
        # STEP 3: Process as CGT shipment (parallel - runs regardless of IVF)
        # ========================================================================
        processed_count = 0
        logger.info(f"Processing webhook as CGT shipment for {len(PATIENTS)} patients")
        print(f"Processing webhook as CGT shipment for {len(PATIENTS)} patients", flush=True)
        
        # Prepare a single telemetry insert per webhook (will use first available shipment_id)
        telemetry_to_insert = None  # tuple(shipment_id, data)

        for patient_id in PATIENTS:
            try:
                logger.info(f"Processing patient {patient_id}...")
                data = transform_webhook_to_quality_data(webhook_response, patient_id)
                
                # Publish to Redis Pub/Sub channel
                try:
                    r.publish('quality_channel', json.dumps(data))
                    logger.info(f"Published to Redis channel 'quality_channel' for patient {patient_id}")
                    print(f"  → Published to Redis channel 'quality_channel'", flush=True)
                except Exception as e:
                    logger.error(f"Error publishing to Redis channel for patient {patient_id}: {e}")
                    print(f"  ✗ Error publishing to Redis channel: {e}", flush=True)
                
                # Store in patient-specific history list
                try:
                    history_key = f'quality_history:{patient_id}'
                    r.lpush(history_key, json.dumps(data))
                    r.ltrim(history_key, 0, 9)
                    logger.info(f"Stored in Redis list '{history_key}' for patient {patient_id}")
                    print(f"  → Stored in Redis list '{history_key}'", flush=True)
                except Exception as e:
                    logger.error(f"Error storing in Redis list for patient {patient_id}: {e}")
                    print(f"  ✗ Error storing in Redis list: {e}", flush=True)
                
                # Store patient ID in set
                try:
                    r.sadd('patients', patient_id)
                    logger.debug(f"Added patient {patient_id} to Redis set 'patients'")
                except Exception as e:
                    logger.error(f"Error adding patient {patient_id} to Redis set: {e}")
                    print(f"  ✗ Error adding patient to Redis set: {e}", flush=True)
                
                # Prepare telemetry insert once per webhook: capture first valid shipment_id/data
                if telemetry_to_insert is None:
                    shipment_id = data.get("shipment_id")
                    if shipment_id:
                        telemetry_to_insert = (shipment_id, data)
                    else:
                        logger.debug(f"No shipment_id found for patient {patient_id}; will continue searching other patients for shipment_id")
                
                processed_count += 1
                # Log the published data
                logger.info(f"✓ Published webhook data for patient {patient_id}")
                logger.info(f"  Data: {json.dumps(data, indent=2)}")
                print(f"✓ Published webhook data for patient {patient_id} at {data['timestamp']}", flush=True)
            except ValueError as e:
                logger.warning(f"Skipping patient {patient_id} - {e}")
                print(f"⚠ Warning: Skipping patient {patient_id} - {e}", flush=True)
                continue
            except Exception as e:
                logger.error(f"Error processing webhook for patient {patient_id}: {e}", exc_info=True)
                print(f"✗ Error processing webhook for patient {patient_id}: {e}", flush=True)
                continue
        
        # Perform a single database insert per webhook (if we captured one telemetry payload)
        if telemetry_to_insert is not None:
            try:
                sid, payload = telemetry_to_insert
                insert_telemetry_data(sid, payload)
                logger.info(f"✓ Inserted telemetry data for shipment {sid} (once per webhook)")
                print(f"✓ Inserted telemetry data for shipment {sid} (once per webhook)", flush=True)
            except Exception as e:
                logger.error(f"Error inserting telemetry data for shipment {sid}: {e}", exc_info=True)
                print(f"  ✗ Error inserting telemetry data for shipment {sid}: {e}", flush=True)
        else:
            logger.debug("No telemetry payload captured for this webhook; skipping DB insert")

        logger.info(f"Successfully processed {processed_count} patients")
        print(f"Successfully processed {processed_count} patients", flush=True)
        
        # Return total count: IVF (1 if processed) + CGT patients processed
        total_processed = (1 if ivf_processed else 0) + processed_count
        return total_processed
    
    except Exception as e:
        logger.error(f"Error in process_webhook_data: {e}", exc_info=True)
        print(f"✗ Error in process_webhook_data: {e}", flush=True)
        import traceback
        traceback.print_exc()
        return 0

# ============================================================================
# API Endpoints
# ============================================================================

@app.post("/api/iot/webhooks/consume")
async def receive_webhook(request: Request, background_tasks: BackgroundTasks):
    """Receive webhook data directly from Tive and process it in background"""
    try:
        # Log request immediately to verify it's reaching the server
        client_ip = request.client.host if request.client else "unknown"
        logger.info(f" Webhook request received from {client_ip} on port {publisher_settings.PUBLISHER_PORT}")
        print(f"\n{'='*60}", flush=True)
        print(f" Webhook request received from {client_ip} on port {publisher_settings.PUBLISHER_PORT}", flush=True)
        print(f"{'='*60}", flush=True)
        
        body = await request.body()
        
        try:
            webhook_data = json.loads(body)
        except json.JSONDecodeError:
            webhook_data = {"raw_body": body.decode('utf-8', errors='ignore')}
        
        # Check if this is a Tive alert/event webhook
        event_type = webhook_data.get("event_type") or webhook_data.get("type") or webhook_data.get("event")
        alert_info = webhook_data.get("alert") or webhook_data.get("alert_info") or {}
        
        if event_type or alert_info:
            logger.info(f" Tive Alert/Event detected: {event_type}")
            logger.info(f"Alert details: {json.dumps(alert_info, indent=2)}")
            print(f" Tive Alert/Event: {event_type}", flush=True)
            if alert_info:
                print(f"Alert Info: {json.dumps(alert_info, indent=2)}", flush=True)
        
        webhook_response = {
            "received_at": datetime.now().isoformat(),
            "client_ip": client_ip,
            "webhook_data": webhook_data,
            "event_type": event_type,
            "alert_info": alert_info
        }
        
        # Log incoming webhook data
        logger.info(f" Webhook received from {client_ip}")
        logger.info(f"Raw webhook data (full): {json.dumps(webhook_data, indent=2, default=str)}")
        print(f" Raw webhook data structure:", flush=True)
        print(f"{json.dumps(webhook_data, indent=2, default=str)[:1500]}", flush=True)
        
        print(f"Queuing webhook processing for {len(PATIENTS)} patient(s)...", flush=True)
        
        # Process in background to avoid timeout
        # Wrap in a function to catch any errors
        def process_with_error_handling():
            try:
                logger.info("Background task started processing webhook")
                print(f"\n{'='*60}", flush=True)
                print(f"Background task started processing webhook", flush=True)
                print(f"{'='*60}", flush=True)
                result = process_webhook_data(webhook_response)
                logger.info(f"Background task completed. Processed {result} patients")
                print(f"{'='*60}", flush=True)
                print(f"Background task completed. Processed {result} patients", flush=True)
                print(f"{'='*60}\n", flush=True)
                return result
            except Exception as e:
                logger.error(f"Error in background task: {e}", exc_info=True)
                print(f"\n{'='*60}", flush=True)
                print(f"✗ Error in background task: {e}", flush=True)
                print(f"{'='*60}", flush=True)
                import traceback
                traceback.print_exc()
                print(f"{'='*60}\n", flush=True)
                return 0
        
        background_tasks.add_task(process_with_error_handling)
        
        # Return immediate response to prevent timeout
        response = JSONResponse(
            status_code=200,
            content={
                "status": "accepted",
                "message": f"Webhook accepted and queued for processing for {len(PATIENTS)} patient(s)",
                "patients_count": len(PATIENTS),
                "event_type": event_type,
                "has_alert": bool(alert_info),
                "timestamp": webhook_response["received_at"]
            }
        )
        print(f"✓ Returning immediate response (200 OK)", flush=True)
        print(f"{'='*60}\n", flush=True)
        return response
        
    except Exception as e:
        logger.error(f"Error processing webhook: {e}", exc_info=True)
        print(f"✗ Error processing webhook: {e}", flush=True)
        import traceback
        traceback.print_exc()
        return JSONResponse(
            status_code=200,
            content={
                "status": "error",
                "message": f"Error processing webhook: {str(e)}",
                "timestamp": datetime.now().isoformat()
            }
        )

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    try:
        r.ping()
        return JSONResponse(
            status_code=200,
            content={
                "status": "healthy",
                "service": "publisher",
                "redis": "connected",
                "patients_count": len(PATIENTS),
                "message": "Publisher is running and ready to receive webhooks"
            }
        )
    except Exception as e:
        return JSONResponse(
            status_code=503,
            content={
                "status": "unhealthy",
                "service": "publisher",
                "redis": "disconnected",
                "error": str(e)
            }
        )

# ============================================================================
# Main Entry Point
# ============================================================================

if __name__ == "__main__":
    if not PATIENTS:
        print("ERROR: No patients found in database. Exiting...")
        sys.exit(1)
    
    print("=" * 60)
    print("PUBLISHER WEBHOOK RECEIVER")
    print("=" * 60)
    print(f"Publisher is completely independent - no backend dependencies")
    print(f"Listening on: {publisher_settings.PUBLISHER_HOST}:{publisher_settings.PUBLISHER_PORT}")
    print(f"Webhook endpoint: http://14.141.162.122:{publisher_settings.PUBLISHER_PORT}/api/iot/webhooks/consume")
    print(f"Health check: http://14.141.162.122:{publisher_settings.PUBLISHER_PORT}/health")
    print(f"Publishing data for {len(PATIENTS)} patient(s): {', '.join(PATIENTS)}")
    print("=" * 60)
    print("Press Ctrl+C to stop\n")
    
    # Suppress uvicorn binding address messages
    import logging
    uvicorn_logger = logging.getLogger("uvicorn")
    uvicorn_logger.setLevel(logging.WARNING)
    
    # Verify port before starting
    actual_port = publisher_settings.PUBLISHER_PORT
    
    # Check if port is already in use
    import socket
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(1)
    result = sock.connect_ex((publisher_settings.PUBLISHER_HOST if publisher_settings.PUBLISHER_HOST != "0.0.0.0" else "127.0.0.1", actual_port))
    sock.close()
    
    if result == 0:
        print(f"\n⚠ WARNING: Port {actual_port} is already in use!")
        print(f"⚠ Another process is listening on port {actual_port}")
        print(f"⚠ Please stop the other process or use a different port\n")
        print(f"⚠ To check what's using the port, run:")
        print(f"⚠   Windows: netstat -ano | findstr :{actual_port}")
        print(f"⚠   Linux:   netstat -tulpn | grep :{actual_port}\n")
    else:
        print(f"\n✓ Port {actual_port} is available")
    
    print(f"✓ Starting server on {publisher_settings.PUBLISHER_HOST}:{actual_port}")
    print(f"✓ Make sure port {actual_port} is open in firewall and not blocked\n")
    
    try:
        uvicorn.run(
            app,
            host=publisher_settings.PUBLISHER_HOST,
            port=actual_port,
            log_level="warning",
            timeout_keep_alive=75,  # Increase keep-alive timeout
            timeout_graceful_shutdown=30  # Graceful shutdown timeout
        )
    except OSError as e:
        if "Address already in use" in str(e) or "10048" in str(e):
            print(f"\n✗ ERROR: Port {actual_port} is already in use!")
            print(f"✗ Please stop the process using port {actual_port} or use a different port")
            print(f"✗ Set PUBLISHER_PORT to a different value (e.g., 8002, 8003, etc.)\n")
        raise

