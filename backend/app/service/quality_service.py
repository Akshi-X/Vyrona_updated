"""
Quality Monitoring Service
Handles quality data retrieval and validation with pharma filtering
"""
import asyncio
import json
import logging
from typing import List, Optional, Dict
from sqlalchemy.orm import Session
from sqlalchemy import and_

from app.models.patient_model import Patient
from app.models.user_model import User
from app.service.redis_service import get_redis, get_pubsub, reset_redis_connection
from app.config.database import SessionLocal
from app.exceptions.patient_exceptions import PatientNotFoundException
from app.exceptions.quality_exceptions import QualityServiceException

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

