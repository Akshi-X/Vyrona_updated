"""
Quality Monitoring Service
Handles quality data retrieval and validation with pharma filtering
"""
import asyncio
import csv
import io
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Dict
from sqlalchemy.orm import Session
from sqlalchemy import and_

from fastapi.responses import Response

from app.models.patient_model import Patient
from app.models.user_model import User
from app.models.geolocation_model import Geolocation
from app.models.IVF.ivf_geolocation_model import IVFGeolocation
from app.models.IVF.tank_model import Tank
from app.models.IVF.patient_crylock_info_model import PatientCrylockInfo
from app.service.redis_service import get_redis, get_pubsub, reset_redis_connection
from app.config.database import SessionLocal
from app.exceptions.patient_exceptions import PatientNotFoundException
from app.constants.app_constants import COMMON_API_HEADERS, QUALITY_EXPORT_DEFAULT_MINUTES
from app.exceptions.quality_exceptions import (
    QualityCsvExportException,
    QualityDataNotFoundException,
    QualityServiceException,
    RedisConnectionException,
)

logger = logging.getLogger(__name__)


class QualityService:
    """Service for quality monitoring operations"""
    
    def __init__(self, db: Session):
        self.db = db
    
    def get_patients_with_quality_data(self, pharma_id: int) -> List[str]:
        """
        Get list of patient IDs from database that belong to the pharma
        and have quality data in Redis
        
        Args:
            pharma_id: The pharma ID to filter patients
            
        Returns:
            List of patient IDs
        """
        try:
            # Get all patients for this pharma from database
            db_patients = self.db.query(Patient.id).filter(
                Patient.pharma_id == pharma_id
            ).all()
            
            db_patient_ids = [patient[0] for patient in db_patients]
            
            # Get patient IDs from Redis that have quality data
            try:
                r = get_redis()
                redis_patient_ids = list(r.smembers('patients'))
            except Exception as e:
                logger.warning(f"Redis not available: {e}. Returning only database patients.")
                redis_patient_ids = []
            
            # Return intersection: patients that exist in both DB and Redis
            # This ensures we only return patients that belong to the pharma
            # and have quality data available
            valid_patient_ids = [pid for pid in db_patient_ids if pid in redis_patient_ids]
            
            return sorted(valid_patient_ids)
            
        except Exception as e:
            logger.error(f"Error getting patients with quality data: {e}")
            raise
    
    def validate_patient_belongs_to_pharma(self, patient_id: str, pharma_id: int) -> bool:
        """
        Validate that a patient belongs to the specified pharma
        
        Args:
            patient_id: Patient ID to validate
            pharma_id: Pharma ID to check against
            
        Returns:
            True if patient belongs to pharma, False otherwise
            
        Raises:
            PatientNotFoundException: If patient doesn't exist
        """
        try:
            patient = self.db.query(Patient).filter(
                and_(Patient.id == patient_id, Patient.pharma_id == pharma_id)
            ).first()
            
            if not patient:
                raise PatientNotFoundException(
                    patient_id=patient_id,
                    reason=f"Patient does not belong to pharma {pharma_id}"
                )
            
            return True
            
        except PatientNotFoundException:
            raise
        except Exception as e:
            logger.error(f"Error validating patient belongs to pharma: {e}")
            raise
    
    def get_quality_history(self, pharma_id: int, patient_id: Optional[str] = None, limit: int = 20) -> List[Dict]:
        """
        Get quality history for patients belonging to the pharma
        
        Args:
            pharma_id: The pharma ID to filter patients
            patient_id: Optional specific patient ID
            limit: Maximum number of records to return
            
        Returns:
            List of quality data dictionaries
        """
        try:
            r = get_redis()
            
            if patient_id:
                # Validate patient belongs to pharma
                self.validate_patient_belongs_to_pharma(patient_id, pharma_id)
                
                # Get history for specific patient
                history_key = f'quality_history:{patient_id}'
                history = r.lrange(history_key, 0, limit - 1)
                quality_data = [json.loads(item) for item in history]
                return quality_data
            else:
                # Get all patients for this pharma from database
                db_patients = self.db.query(Patient.id).filter(
                    Patient.pharma_id == pharma_id
                ).all()
                
                db_patient_ids = [patient[0] for patient in db_patients]
                
                # Get history for all pharma patients
                all_history = []
                for pid in db_patient_ids:
                    history_key = f'quality_history:{pid}'
                    history = r.lrange(history_key, 0, limit - 1)
                    for item in history:
                        try:
                            data = json.loads(item)
                            all_history.append(data)
                        except json.JSONDecodeError:
                            continue
                
                # Sort by timestamp (most recent first)
                all_history.sort(key=lambda x: x.get('timestamp', ''), reverse=True)
                return all_history[:limit]
                
        except PatientNotFoundException:
            raise
        except Exception as e:
            logger.error(f"Error getting quality history: {e}")
            raise
    
    def get_latest_quality_data(self, patient_id: str, pharma_id: int) -> Optional[Dict]:
        """
        Get the latest quality data for a specific patient
        
        Args:
            patient_id: Patient ID
            pharma_id: Pharma ID for validation
            
        Returns:
            Latest quality data dictionary or None
        """
        try:
            # Validate patient belongs to pharma
            self.validate_patient_belongs_to_pharma(patient_id, pharma_id)
            
            r = get_redis()
            history_key = f'quality_history:{patient_id}'
            latest = r.lindex(history_key, 0)  # Get first (most recent) item
            
            if latest:
                return json.loads(latest)
            return None
            
        except PatientNotFoundException:
            raise
        except Exception as e:
            logger.error(f"Error getting latest quality data: {e}")
            raise
    
    @staticmethod
    def _parse_timestamp(value: Optional[str]) -> Optional[datetime]:
        """Parse timestamp strings into naive UTC datetime objects."""
        if not value:
            return None

        parse_attempts = [
            datetime.fromisoformat,
        ]

        formats = [
            "%Y-%m-%d %H:%M:%S",
            "%Y-%m-%dT%H:%M:%S",
            "%Y-%m-%dT%H:%M:%SZ",
            "%Y-%m-%dT%H:%M:%S.%f",
            "%Y-%m-%dT%H:%M:%S.%fZ",
        ]

        for parser in parse_attempts:
            try:
                parsed = parser(value)
                if parsed.tzinfo:
                    parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
                return parsed
            except ValueError:
                continue

        for fmt in formats:
            try:
                parsed = datetime.strptime(value, fmt)
                return parsed
            except ValueError:
                continue

        return None

    def export_patient_quality_data_csv(
        self,
        patient_id: str,
        pharma_id: int,
        duration_minutes: int = QUALITY_EXPORT_DEFAULT_MINUTES
    ) -> Response:
        """
        Export quality data for a patient within the specified time range as CSV.

        Args:
            patient_id: Patient identifier.
            pharma_id: Pharma identifier for authorization.
            duration_minutes: Time window for export in minutes (default 10).

        Returns:
            FastAPI Response containing CSV data.

        Raises:
            PatientNotFoundException: When patient does not belong to pharma.
            RedisConnectionException: When Redis is unreachable.
            QualityDataNotFoundException: When no data found for time window.
            QualityCsvExportException: On CSV generation failure.
            QualityServiceException: On invalid parameters.
        """
        if duration_minutes <= 0 or duration_minutes > 1440:
            raise QualityServiceException(
                operation="export_patient_quality_data_csv",
                detail="duration_minutes must be between 1 and 1440"
            )

        # Validate patient ownership
        self.validate_patient_belongs_to_pharma(patient_id, pharma_id)

        try:
            redis_client = get_redis()
        except Exception as exc:
            logger.error(f"Redis connection failed during CSV export: {exc}")
            raise RedisConnectionException(detail=str(exc)) from exc

        history_key = f"quality_history:{patient_id}"

        try:
            raw_history = redis_client.lrange(history_key, 0, -1)
        except Exception as exc:
            logger.error(f"Failed to read Redis history for {patient_id}: {exc}")
            raise QualityCsvExportException(detail="Unable to read quality history from Redis") from exc

        if not raw_history:
            raise QualityDataNotFoundException(patient_id=patient_id)

        cutoff = datetime.now() - timedelta(minutes=duration_minutes)
        filtered_records = []

        for item in raw_history:
            try:
                record = json.loads(item)
            except json.JSONDecodeError:
                logger.warning(f"Skipping invalid JSON entry in quality history for patient {patient_id}")
                continue

            parsed_timestamp = self._parse_timestamp(record.get("timestamp"))
            if not parsed_timestamp:
                logger.warning(
                    "Skipping record with unparseable timestamp for patient %s: %s",
                    patient_id,
                    record.get("timestamp")
                )
                continue

            if parsed_timestamp < cutoff:
                continue

            record["_parsed_timestamp"] = parsed_timestamp
            filtered_records.append(record)

        if not filtered_records:
            raise QualityDataNotFoundException(
                patient_id=patient_id,
                detail=f"No quality data found in the last {duration_minutes} minutes."
            )

        filtered_records.sort(key=lambda entry: entry.get("_parsed_timestamp"))

        fieldnames = [
            "timestamp",
            "patient_id",
            "temperature",
            "humidity",
            "ph_level",
            "o2_level",
            "co2_level",
            "agitation",
        ]

        buffer = io.StringIO()

        try:
            writer = csv.DictWriter(buffer, fieldnames=fieldnames)
            writer.writeheader()

            for record in filtered_records:
                writer.writerow({
                    "timestamp": record.get("timestamp"),
                    "patient_id": record.get("patient_id"),
                    "temperature": record.get("temperature"),
                    "humidity": record.get("humidity"),
                    "ph_level": record.get("ph_level"),
                    "o2_level": record.get("o2_level"),
                    "co2_level": record.get("co2_level"),
                    "agitation": record.get("agitation"),
                })

            csv_text = buffer.getvalue()
        except Exception as exc:
            logger.error(
                "CSV export generation failed for patient %s: %s",
                patient_id,
                exc,
                exc_info=True
            )
            raise QualityCsvExportException(detail=str(exc)) from exc
        finally:
            buffer.close()

        csv_content = csv_text.encode("utf-8")
        for record in filtered_records:
            record.pop("_parsed_timestamp", None)

        filename = f"{patient_id}_quality_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}UTC.csv"
        response = Response(content=csv_content, media_type="text/csv")
        response.headers["Content-Disposition"] = f'attachment; filename="{filename}"'
        for header, value in COMMON_API_HEADERS.items():
            response.headers.setdefault(header, value)

        return response

    def check_redis_health(self) -> Dict[str, str]:
        """
        Check Redis connection health
        
        Returns:
            Dictionary with status and connection info
        """
        try:
            r = get_redis()
            r.ping()
            return {"status": "healthy", "redis": "connected", "error": None}
        except Exception as e:
            logger.error(f"Redis health check failed: {e}")
            return {"status": "unhealthy", "redis": "disconnected", "error": str(e)}
    
    def get_connections_for_pharma(self, pharma_id: int, connections_info: Dict, manager: 'ConnectionManager') -> Dict:
        """
        Filter WebSocket connections for a specific pharma
        
        Args:
            pharma_id: The pharma ID to filter connections
            connections_info: Raw connections info from ConnectionManager
            manager: ConnectionManager instance to access active connections
            
        Returns:
            Filtered connections info
        """
        try:
            filtered_connections = [
                conn for conn in connections_info["connections"]
                if manager.active_connections.get(conn["id"], {}).get("pharma_id") == pharma_id
            ]
            
            return {
                "count": len(filtered_connections),
                "connections": filtered_connections
            }
        except Exception as e:
            logger.error(f"Error filtering connections: {e}")
            raise QualityServiceException("get_connections_for_pharma", str(e))
    
    def get_patient_redis_history(self, patient_id: str, limit: int = 12) -> List[dict]:
        """
        Get last N messages for a patient from Redis
        
        Args:
            patient_id: Patient ID to get history for
            limit: Number of messages to retrieve (default: 12)
        
        Returns:
            List of quality data dictionaries, oldest first (ascending order)
        """
        try:
            redis_client = get_redis()
            history_key = f"quality_history:{patient_id}"
            
            # Get last N messages (0 to limit-1, since lrange is inclusive)
            # Redis lpush stores newest at index 0, so this gets newest first
            raw_history = redis_client.lrange(history_key, 0, limit - 1)
            
            if not raw_history:
                return []
            
            # Parse JSON strings and return as list of dicts
            history = []
            for raw_data in raw_history:
                try:
                    data = json.loads(raw_data)
                    history.append(data)
                except json.JSONDecodeError as e:
                    logger.warning(f"Failed to parse Redis message for patient {patient_id}: {e}")
                    continue
            
            # Reverse to get ascending order (oldest first)
            history.reverse()
            
            return history
        except Exception as e:
            logger.error(f"Error retrieving Redis history for patient {patient_id}: {e}")
            return []
    
    def get_patient_geolocation_history(self, patient_id: str, limit: int = 100) -> List[dict]:
        """
        Get geolocation records for a patient from database
        
        Args:
            patient_id: Patient ID to get geolocation history for
            limit: Maximum number of records to retrieve (default: 100)
        
        Returns:
            List of geolocation dictionaries, oldest first (ascending order)
        """
        try:
            # Query geolocation records for the patient, ordered by id
            geolocation_records = self.db.query(Geolocation).filter(
                Geolocation.patient_id == patient_id
            ).order_by(
                Geolocation.id.asc()
            ).limit(limit).all()
            
            # Convert to dictionary format
            geolocation_data = []
            for record in geolocation_records:
                geolocation_data.append({
                    "type": "geolocation",
                    "id": record.id,
                    "shipment_id": record.shipment_id,
                    "patient_id": record.patient_id,
                    "telemetry_data_id": record.telemetry_data_id,
                    "current_latitude": round(record.current_latitude, 2) if record.current_latitude is not None else None,
                    "current_longitude": round(record.current_longitude, 2) if record.current_longitude is not None else None,
                    "shipment_from_latitude": round(record.shipment_from_latitude, 2) if record.shipment_from_latitude is not None else None,
                    "shipment_from_longitude": round(record.shipment_from_longitude, 2) if record.shipment_from_longitude is not None else None,
                    "shipment_to_latitude": round(record.shipment_to_latitude, 2) if record.shipment_to_latitude is not None else None,
                    "shipment_to_longitude": round(record.shipment_to_longitude, 2) if record.shipment_to_longitude is not None else None,
                    "reading_timestamp": record.reading_timestamp.isoformat() if record.reading_timestamp else None,
                    "created_at": record.created_at.isoformat() if record.created_at else None,
                })
            
            return geolocation_data
        except Exception as e:
            logger.error(f"Error retrieving geolocation history for patient {patient_id}: {e}")
            return []
    
    def get_canister_redis_history(self, canister_id: int, limit: int = 12) -> List[dict]:
        """
        Get last N messages for an IVF canister from Redis
        
        Args:
            canister_id: Canister ID to get history for
            limit: Number of messages to retrieve (default: 12)
        
        Returns:
            List of quality data dictionaries, oldest first (ascending order)
        """
        try:
            redis_client = get_redis()
            history_key = f"ivf_quality_history:{canister_id}"
            
            # Get last N messages (0 to limit-1, since lrange is inclusive)
            # Redis lpush stores newest at index 0, so this gets newest first
            raw_history = redis_client.lrange(history_key, 0, limit - 1)
            
            if not raw_history:
                return []
            
            # Parse JSON strings and return as list of dicts
            history = []
            for raw_data in raw_history:
                try:
                    data = json.loads(raw_data)
                    history.append(data)
                except json.JSONDecodeError as e:
                    logger.warning(f"Failed to parse Redis message for canister {canister_id}: {e}")
                    continue
            
            # Reverse to get ascending order (oldest first)
            history.reverse()
            
            return history
        except Exception as e:
            logger.error(f"Error retrieving Redis history for canister {canister_id}: {e}")
            return []
    
    def get_canister_geolocation_history(self, canister_id: int, limit: int = 100) -> List[dict]:
        """
        Get geolocation records for an IVF canister from database
        
        Args:
            canister_id: Canister ID to get geolocation history for
            limit: Maximum number of records to retrieve (default: 100)
        
        Returns:
            List of geolocation dictionaries, oldest first (ascending order)
        """
        try:
            # Query geolocation records for the canister, ordered by id
            geolocation_records = self.db.query(IVFGeolocation).filter(
                IVFGeolocation.canister_id == canister_id
            ).order_by(
                IVFGeolocation.id.asc()
            ).limit(limit).all()
            
            # Convert to dictionary format
            geolocation_data = []
            for record in geolocation_records:
                geolocation_data.append({
                    "type": "ivf_geolocation",
                    "id": record.id,
                    "canister_id": record.canister_id,
                    "telemetry_data_id": record.ivf_telemetry_data_id,  # IVF model uses ivf_telemetry_data_id
                    "current_latitude": round(record.current_latitude, 2) if record.current_latitude is not None else None,
                    "current_longitude": round(record.current_longitude, 2) if record.current_longitude is not None else None,
                    "reading_timestamp": record.reading_timestamp.isoformat() if record.reading_timestamp else None,
                    "created_at": record.created_at.isoformat() if record.created_at else None,
                })
            
            return geolocation_data
        except Exception as e:
            logger.error(f"Error retrieving geolocation history for canister {canister_id}: {e}")
            return []
    
    def validate_tank_belongs_to_branch(self, tank_id: int, branch_id: Optional[int]) -> bool:
        """
        Validate that a tank belongs to the user's branch.
        Admin users (branch_id is None) can access all tanks.
        
        Args:
            tank_id: The tank ID to validate
            branch_id: The user's branch ID (None for Admin users)
        
        Returns:
            True if tank belongs to branch (or user is Admin), False otherwise
        
        Raises:
            Exception: If tank doesn't exist or validation fails
        """
        try:
            # Get tank
            tank = self.db.query(Tank).filter(Tank.tank_id == tank_id).first()
            if not tank:
                raise Exception(f"Tank {tank_id} not found")
            
            # Admin users (branch_id is None) can access all tanks
            if branch_id is None:
                return True
            
            # Validate branch match
            if tank.branch_id != branch_id:
                raise Exception(f"Tank {tank_id} does not belong to your branch")
            
            return True
        except Exception as e:
            logger.error(f"Error validating tank {tank_id} for branch {branch_id}: {e}")
            raise
    
    async def redis_listener(self, connection_manager: 'ConnectionManager'):
        """
        Listen for messages from Redis and broadcast to WebSocket clients
        
        Args:
            connection_manager: ConnectionManager instance to broadcast messages
        """
        loop = asyncio.get_event_loop()
        pubsub = None
        
        while True:
            try:
                # Try to get pubsub connection, retry if not available
                if pubsub is None:
                    try:
                        pubsub = get_pubsub()
                        logger.info("Redis listener started")
                    except Exception as e:
                        logger.error(f"Error connecting to Redis: {e}. Retrying in 5 seconds...")
                        await asyncio.sleep(5)
                        continue
                
                # Use run_in_executor to avoid blocking
                message = await loop.run_in_executor(
                    None,
                    lambda: pubsub.get_message(timeout=1.0, ignore_subscribe_messages=True)
                )
                
                if message and message.get("type") == "message":
                    try:
                        data = json.loads(message["data"])
                        # Get database session for pharma validation
                        db = SessionLocal()
                        try:
                            await connection_manager.broadcast(data, db)
                        finally:
                            db.close()
                    except json.JSONDecodeError as e:
                        logger.error(f"Failed to parse message: {e}")
                    except Exception as e:
                        logger.error(f"Error broadcasting message: {e}")
                        
            except Exception as e:
                logger.error(f"Error in redis_listener: {e}")
                pubsub = None
                reset_redis_connection()
                await asyncio.sleep(5)
    
    async def log_connections_periodically(self, connection_manager: 'ConnectionManager'):
        """
        Log WebSocket connections every 30 seconds
        
        Args:
            connection_manager: ConnectionManager instance to get connection info
        """
        while True:
            await asyncio.sleep(30)
            connections_info = connection_manager.get_connections_info()
            if connections_info['count'] > 0:
                logger.info(f"Active WebSocket connections: {connections_info['count']}")
                for conn in connections_info['connections']:
                    patient = conn.get('patient_id', 'Not subscribed')
                    logger.debug(
                        f"Connection {conn['id'][:8]}... | "
                        f"Patient: {patient} | "
                        f"Host: {conn['client_info']['host']}"
                    )

