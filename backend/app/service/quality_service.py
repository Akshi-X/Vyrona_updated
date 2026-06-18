"""
Quality Monitoring Service
Handles quality data retrieval and validation with pharma filtering
"""

import asyncio
import csv
import io
import json
import logging
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

from fastapi.responses import Response
from sqlalchemy import and_, desc, func, lateral, select, text, true
from sqlalchemy.orm import Session

from app.config.database import SessionLocal
from app.constants.app_constants import (
    COMMON_API_HEADERS,
    QUALITY_EXPORT_DEFAULT_MINUTES,
)
from app.constants.kpi_constants import (
    AGG_BUCKET_MINUTES_1H,
    AGG_BUCKET_MINUTES_7D,
    AGG_BUCKET_MINUTES_24H,
)
from app.exceptions.patient_exceptions import PatientNotFoundException
from app.exceptions.quality_exceptions import (
    QualityCsvExportException,
    QualityDataNotFoundException,
    QualityServiceException,
    RedisConnectionException,
)
from app.models import KpiConfig, Readings
from app.models.geolocation_model import Geolocation
from app.models.IVF.hospital_branch_model import HospitalBranch
from app.models.IVF.ivf_geolocation_model import IVFGeolocation
from app.models.IVF.ivf_telemetry_data_model import IVFTelemetryData
from app.models.IVF.patient_crylock_info_model import PatientCrylockInfo
from app.models.IVF.ln2_iot_device_model import Ln2IotDevice
from app.models.IVF.incubator_model import Incubator
from app.models.IVF.tank_model import Tank
from app.models.patient_model import Patient
from app.models.user_model import User
from app.service.redis_service import get_pubsub, get_redis, reset_redis_connection

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
            db_patients = (
                self.db.query(Patient.id).filter(Patient.pharma_id == pharma_id).all()
            )

            db_patient_ids = [patient[0] for patient in db_patients]

            # Get patient IDs from Redis that have quality data
            try:
                r = get_redis()
                redis_patient_ids = list(r.smembers("patients"))
            except Exception as e:
                logger.warning(
                    f"Redis not available: {e}. Returning only database patients."
                )
                redis_patient_ids = []

            # Return intersection: patients that exist in both DB and Redis
            # This ensures we only return patients that belong to the pharma
            # and have quality data available
            valid_patient_ids = [
                pid for pid in db_patient_ids if pid in redis_patient_ids
            ]

            return sorted(valid_patient_ids)

        except Exception as e:
            logger.error(f"Error getting patients with quality data: {e}")
            raise

    def validate_patient_belongs_to_pharma(
        self, patient_id: str, pharma_id: int
    ) -> bool:
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
            patient = (
                self.db.query(Patient)
                .filter(and_(Patient.id == patient_id, Patient.pharma_id == pharma_id))
                .first()
            )

            if not patient:
                raise PatientNotFoundException(
                    patient_id=patient_id,
                    reason=f"Patient does not belong to pharma {pharma_id}",
                )

            return True

        except PatientNotFoundException:
            raise
        except Exception as e:
            logger.error(f"Error validating patient belongs to pharma: {e}")
            raise

    def get_quality_history(
        self, pharma_id: int, patient_id: Optional[str] = None, limit: int = 20
    ) -> List[Dict]:
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
                history_key = f"quality_history:{patient_id}"
                history = r.lrange(history_key, 0, limit - 1)
                quality_data = [json.loads(item) for item in history]
                return quality_data
            else:
                # Get all patients for this pharma from database
                db_patients = (
                    self.db.query(Patient.id)
                    .filter(Patient.pharma_id == pharma_id)
                    .all()
                )

                db_patient_ids = [patient[0] for patient in db_patients]

                # Get history for all pharma patients
                all_history = []
                for pid in db_patient_ids:
                    history_key = f"quality_history:{pid}"
                    history = r.lrange(history_key, 0, limit - 1)
                    for item in history:
                        try:
                            data = json.loads(item)
                            all_history.append(data)
                        except json.JSONDecodeError:
                            continue

                # Sort by timestamp (most recent first)
                all_history.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
                return all_history[:limit]

        except PatientNotFoundException:
            raise
        except Exception as e:
            logger.error(f"Error getting quality history: {e}")
            raise

    def get_latest_quality_data(
        self, patient_id: str, pharma_id: int
    ) -> Optional[Dict]:
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
            history_key = f"quality_history:{patient_id}"
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
        duration_minutes: int = QUALITY_EXPORT_DEFAULT_MINUTES,
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
                detail="duration_minutes must be between 1 and 1440",
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
            raise QualityCsvExportException(
                detail="Unable to read quality history from Redis"
            ) from exc

        if not raw_history:
            raise QualityDataNotFoundException(patient_id=patient_id)

        cutoff = datetime.now() - timedelta(minutes=duration_minutes)
        filtered_records = []

        for item in raw_history:
            try:
                record = json.loads(item)
            except json.JSONDecodeError:
                logger.warning(
                    f"Skipping invalid JSON entry in quality history for patient {patient_id}"
                )
                continue

            parsed_timestamp = self._parse_timestamp(record.get("timestamp"))
            if not parsed_timestamp:
                logger.warning(
                    "Skipping record with unparseable timestamp for patient %s: %s",
                    patient_id,
                    record.get("timestamp"),
                )
                continue

            if parsed_timestamp < cutoff:
                continue

            record["_parsed_timestamp"] = parsed_timestamp
            filtered_records.append(record)

        if not filtered_records:
            raise QualityDataNotFoundException(
                patient_id=patient_id,
                detail=f"No quality data found in the last {duration_minutes} minutes.",
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
                writer.writerow(
                    {
                        "timestamp": record.get("timestamp"),
                        "patient_id": record.get("patient_id"),
                        "temperature": record.get("temperature"),
                        "humidity": record.get("humidity"),
                        "ph_level": record.get("ph_level"),
                        "o2_level": record.get("o2_level"),
                        "co2_level": record.get("co2_level"),
                        "agitation": record.get("agitation"),
                    }
                )

            csv_text = buffer.getvalue()
        except Exception as exc:
            logger.error(
                "CSV export generation failed for patient %s: %s",
                patient_id,
                exc,
                exc_info=True,
            )
            raise QualityCsvExportException(detail=str(exc)) from exc
        finally:
            buffer.close()

        csv_content = csv_text.encode("utf-8")
        for record in filtered_records:
            record.pop("_parsed_timestamp", None)

        filename = (
            f"{patient_id}_quality_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}UTC.csv"
        )
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

    def get_connections_for_pharma(
        self, pharma_id: int, connections_info: Dict, manager: "ConnectionManager"
    ) -> Dict:
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
                conn
                for conn in connections_info["connections"]
                if manager.active_connections.get(conn["id"], {}).get("pharma_id")
                == pharma_id
            ]

            return {
                "count": len(filtered_connections),
                "connections": filtered_connections,
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
                    logger.warning(
                        f"Failed to parse Redis message for patient {patient_id}: {e}"
                    )
                    continue

            # Reverse to get ascending order (oldest first)
            history.reverse()

            return history
        except Exception as e:
            logger.error(
                f"Error retrieving Redis history for patient {patient_id}: {e}"
            )
            return []

    def get_patient_geolocation_history(
        self, patient_id: str, limit: int = 100
    ) -> List[dict]:
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
            geolocation_records = (
                self.db.query(Geolocation)
                .filter(Geolocation.patient_id == patient_id)
                .order_by(Geolocation.id.asc())
                .limit(limit)
                .all()
            )

            # Convert to dictionary format
            geolocation_data = []
            for record in geolocation_records:
                geolocation_data.append(
                    {
                        "type": "geolocation",
                        "id": record.id,
                        "shipment_id": record.shipment_id,
                        "patient_id": record.patient_id,
                        "telemetry_data_id": record.telemetry_data_id,
                        "current_latitude": round(record.current_latitude, 2)
                        if record.current_latitude is not None
                        else None,
                        "current_longitude": round(record.current_longitude, 2)
                        if record.current_longitude is not None
                        else None,
                        "shipment_from_latitude": round(
                            record.shipment_from_latitude, 2
                        )
                        if record.shipment_from_latitude is not None
                        else None,
                        "shipment_from_longitude": round(
                            record.shipment_from_longitude, 2
                        )
                        if record.shipment_from_longitude is not None
                        else None,
                        "shipment_to_latitude": round(record.shipment_to_latitude, 2)
                        if record.shipment_to_latitude is not None
                        else None,
                        "shipment_to_longitude": round(record.shipment_to_longitude, 2)
                        if record.shipment_to_longitude is not None
                        else None,
                        "reading_timestamp": record.reading_timestamp.isoformat()
                        if record.reading_timestamp
                        else None,
                        "created_at": record.created_at.isoformat()
                        if record.created_at
                        else None,
                    }
                )

            return geolocation_data
        except Exception as e:
            logger.error(
                f"Error retrieving geolocation history for patient {patient_id}: {e}"
            )
            return []

    def get_tank_redis_history(self, tank_id: int, limit: int = 12) -> List[dict]:
        """
        Get last N messages for an IVF tank from Redis

        Args:
            tank_id: Tank ID to get history for
            limit: Number of messages to retrieve (default: 12)

        Returns:
            List of quality data dictionaries, oldest first (ascending order)
        """
        try:
            redis_client = get_redis()
            history_key = f"ivf_quality_history:{tank_id}"

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
                    logger.warning(
                        f"Failed to parse Redis message for tank {tank_id}: {e}"
                    )
                    continue

            # Reverse to get ascending order (oldest first)
            history.reverse()

            return history
        except Exception as e:
            logger.error(f"Error retrieving Redis history for tank {tank_id}: {e}")
            return []

    def get_tank_kpi_config(self, tank_id: int, tank_code: str) -> dict:
        """
        Get KPI limits config for a tank from kpi_config table (nested kpi_limits for frontend).
        Only includes non-null, non-empty values (no unnecessary null data).
        """

        try:
            tank = self.db.query(Tank).filter(Tank.tank_id == tank_id).first()
            branch = None
            if tank and tank.branch_id is not None:
                branch = (
                    self.db.query(HospitalBranch)
                    .filter(HospitalBranch.branch_id == tank.branch_id)
                    .first()
                )

            ln2_device = (
                self.db.query(Ln2IotDevice)
                .filter(Ln2IotDevice.tank_id == tank_id)
                .first()
            )
            tank_max_capacity = (
                float(ln2_device.tank_max_capacity_reading)
                if ln2_device and ln2_device.tank_max_capacity_reading is not None
                else None
            )
            tank_min_capacity = (
                float(ln2_device.tank_min_capacity_reading)
                if ln2_device and ln2_device.tank_min_capacity_reading is not None
                else None
            )

            rows = (
                self.db.query(KpiConfig)
                .filter(KpiConfig.tank_id == tank_id)
                .all()
            )
            kpi_limits = {}
            for r in rows:
                alert_type = (r.alert_type or "").strip() or None
                if not bool(r.status) and alert_type is None:
                    continue
                name = r.kpi_name
                kpi_limits.setdefault(name, {})[r.alert_name] = {
                    "min": float(r.min) if r.min is not None else None,
                    "max": float(r.max) if r.max is not None else None,
                    "alert_type": alert_type,
                }
            return {
                "tank_id": tank_id,
                "tank_code": tank_code,
                "branch_id": tank.branch_id if tank else None,
                "branch_name": branch.branch_name if branch else None,
                "tank_max_capacity_reading": tank_max_capacity,
                "tank_min_capacity_reading": tank_min_capacity,
                "kpi_limits": kpi_limits,
            }
        except Exception as e:
            logger.error(f"Error retrieving KPI config for tank {tank_id}: {e}")
            self.db.rollback()
            return {
                "tank_id": tank_id,
                "tank_code": tank_code,
                "branch_id": None,
                "branch_name": None,
                "tank_max_capacity_reading": None,
                "tank_min_capacity_reading": None,
                "kpi_limits": {},
            }

    def list_kpi_config_by_tank(self, tank_id: int) -> List[dict]:
        """
        List all KpiConfig rows for a tank (raw rows for Alert Setting CRUD).
        Returns list of dict with id, hospital_id, branch_id, tank_id, kpi_name, alert_name, min, max, unit, alert_type, status.
        """
        try:
            rows = (
                self.db.query(KpiConfig)
                .filter(KpiConfig.tank_id == tank_id)
                .order_by(KpiConfig.kpi_name, KpiConfig.alert_name)
                .all()
            )
            return [
                {
                    "id": r.id,
                    "hospital_id": r.hospital_id,
                    "branch_id": r.branch_id,
                    "tank_id": r.tank_id,
                    "kpi_name": r.kpi_name,
                    "alert_name": r.alert_name,
                    "min": float(r.min) if r.min is not None else None,
                    "max": float(r.max) if r.max is not None else None,
                    "unit": r.unit,
                    "alert_type": r.alert_type,
                    "cooldown_minutes": int(r.cooldown_minutes)
                    if r.cooldown_minutes is not None
                    else 60,
                    "unack_escalation_threshold": r.unack_escalation_threshold,
                    "status": bool(r.status),
                }
                for r in rows
            ]
        except Exception as e:
            logger.error(f"Error listing KPI config for tank {tank_id}: {e}")
            self.db.rollback()
            return []

    def create_kpi_config(
        self,
        hospital_id: int,
        branch_id: int,
        tank_id: Optional[int] = None,
        incubator_id: Optional[int] = None,
        chamber_id: Optional[str] = None,
        refrigerator_id: Optional[int] = None,
        zone_id: Optional[str] = None,
        kpi_name: str = "",
        alert_name: Optional[str] = None,
        min_val: Optional[float] = None,
        max_val: Optional[float] = None,
        unit: Optional[str] = None,
        alert_type: Optional[str] = None,
        cooldown_minutes: Optional[int] = None,
        unack_escalation_threshold: Optional[int] = None,
        status: bool = True,
    ) -> KpiConfig:
        """Create a KpiConfig row for a tank, incubator, or refrigerator."""
        if tank_id is not None:
            self.validate_tank_belongs_to_branch(tank_id, branch_id)
        row = KpiConfig(
            hospital_id=hospital_id,
            branch_id=branch_id,
            tank_id=tank_id,
            incubator_id=incubator_id,
            chamber_id=chamber_id,
            refrigerator_id=refrigerator_id,
            zone_id=zone_id,
            kpi_name=kpi_name.strip(),
            alert_name=alert_name.strip() if alert_name else None,
            min=min_val,
            max=max_val,
            unit=unit.strip() if unit else None,
            alert_type=alert_type.strip() if alert_type else None,
            cooldown_minutes=cooldown_minutes if cooldown_minutes is not None else 60,
            unack_escalation_threshold=unack_escalation_threshold,
            status=status,
        )
        self.db.add(row)
        self.db.flush()
        return row

    def update_kpi_config(
        self,
        config_id: int,
        branch_id: Optional[int],
        kpi_name: Optional[str] = None,
        alert_name: Optional[str] = None,
        min_val: Optional[float] = None,
        max_val: Optional[float] = None,
        unit: Optional[str] = None,
        alert_type: Optional[str] = None,
        cooldown_minutes: Optional[int] = None,
        unack_escalation_threshold: Optional[int] = None,
        status: Optional[bool] = None,
    ) -> Optional[KpiConfig]:
        """Update a KpiConfig row. Validates config's tank belongs to branch when branch_id provided."""
        row = self.db.query(KpiConfig).filter(KpiConfig.id == config_id).first()
        if not row:
            return None
        if branch_id is not None and row.tank_id is not None:
            # Skip tank validation for incubator / refrigerator rows
            # (tank_id is NULL on those); device scoping is enforced upstream.
            self.validate_tank_belongs_to_branch(row.tank_id, branch_id)
        if kpi_name is not None:
            row.kpi_name = kpi_name.strip()
        if alert_name is not None:
            row.alert_name = alert_name.strip() if alert_name else None
        if min_val is not None:
            row.min = min_val
        if max_val is not None:
            row.max = max_val
        if unit is not None:
            row.unit = unit.strip() if unit else None
        row.alert_type = alert_type.strip() if isinstance(alert_type, str) and alert_type else None
        if cooldown_minutes is not None:
            row.cooldown_minutes = cooldown_minutes
        # None explicitly clears escalation (disables it), matching alert_type pattern
        row.unack_escalation_threshold = (
            int(unack_escalation_threshold)
            if isinstance(unack_escalation_threshold, (int, float))
            else None
        )
        if status is not None:
            row.status = status
        self.db.flush()
        return row

    def delete_kpi_config(
        self, config_id: int, branch_id: Optional[int] = None
    ) -> bool:
        """Delete a KpiConfig row. Validates config's tank belongs to branch when branch_id provided."""
        row = self.db.query(KpiConfig).filter(KpiConfig.id == config_id).first()
        if not row:
            return False
        if branch_id is not None and row.tank_id is not None:
            # Skip tank validation for incubator / refrigerator rows
            # (tank_id is NULL on those); device scoping is enforced upstream.
            self.validate_tank_belongs_to_branch(row.tank_id, branch_id)
        self.db.delete(row)
        self.db.flush()
        return True

    def bulk_upsert_kpi_config(
        self,
        tank_ids: List[int],
        configs: List[Dict],
        branch_id: Optional[int] = None,
    ) -> Dict:
        """
        For each tank and each config: if a row exists for (tank_id, kpi_name, alert_name), update it
        with min, max, alert_type (and unit); otherwise create a new row with the same shape.
        Config items must have kpi_name; optional: alert_name, min, max, unit, alert_type, status.
        Validates each tank belongs to branch when branch_id is provided.
        Returns {"updated": count, "created": count}.
        """
        updated = 0
        created = 0
        for tank_id in tank_ids:
            if branch_id is not None:
                self.validate_tank_belongs_to_branch(tank_id, branch_id)
            tank = self.db.query(Tank).filter(Tank.tank_id == tank_id).first()
            if not tank:
                continue
            branch = (
                self.db.query(HospitalBranch)
                .filter(HospitalBranch.branch_id == tank.branch_id)
                .first()
            )
            if not branch:
                continue
            hospital_id = branch.hospital_id
            branch_id_val = tank.branch_id
            for cfg in configs:
                kpi_name = (cfg.get("kpi_name") or "").strip()
                if not kpi_name:
                    continue
                alert_name = cfg.get("alert_name")
                if alert_name is not None and isinstance(alert_name, str):
                    alert_name = alert_name.strip() or None
                min_val = cfg.get("min")
                if min_val is not None and not isinstance(min_val, (int, float)):
                    try:
                        min_val = float(min_val)
                    except (TypeError, ValueError):
                        min_val = None
                max_val = cfg.get("max")
                if max_val is not None and not isinstance(max_val, (int, float)):
                    try:
                        max_val = float(max_val)
                    except (TypeError, ValueError):
                        max_val = None
                unit = cfg.get("unit")
                if unit is not None and isinstance(unit, str):
                    unit = unit.strip() or None
                alert_type_val = cfg.get("alert_type")
                if alert_type_val is not None and isinstance(alert_type_val, str):
                    alert_type_val = alert_type_val.strip() or None
                status_val = cfg.get("status")
                if status_val is None:
                    status_val = alert_type_val in ("critical", "soft")
                cooldown_val = cfg.get("cooldown_minutes")
                if cooldown_val is not None:
                    try:
                        cooldown_val = int(cooldown_val)
                    except (TypeError, ValueError):
                        cooldown_val = None
                escalation_threshold = cfg.get("unack_escalation_threshold")
                if escalation_threshold is not None:
                    try:
                        escalation_threshold = int(escalation_threshold)
                    except (TypeError, ValueError):
                        escalation_threshold = None
                query = self.db.query(KpiConfig).filter(
                    KpiConfig.tank_id == tank_id,
                    KpiConfig.kpi_name == kpi_name,
                )
                if alert_name is None:
                    query = query.filter(KpiConfig.alert_name.is_(None))
                else:
                    query = query.filter(KpiConfig.alert_name == alert_name)
                existing = query.first()
                if existing:
                    existing.min = min_val
                    existing.max = max_val
                    existing.alert_type = alert_type_val
                    existing.status = bool(status_val)
                    if unit is not None:
                        existing.unit = unit
                    if cooldown_val is not None:
                        existing.cooldown_minutes = cooldown_val
                    existing.unack_escalation_threshold = escalation_threshold
                    self.db.flush()
                    updated += 1
                else:
                    row = KpiConfig(
                        hospital_id=hospital_id,
                        branch_id=branch_id_val,
                        tank_id=tank_id,
                        kpi_name=kpi_name,
                        alert_name=alert_name,
                        min=min_val,
                        max=max_val,
                        unit=unit,
                        alert_type=alert_type_val,
                        cooldown_minutes=cooldown_val
                        if cooldown_val is not None
                        else 60,
                        unack_escalation_threshold=escalation_threshold,
                        status=bool(status_val),
                    )
                    self.db.add(row)
                    self.db.flush()
                    created += 1
        return {"updated": updated, "created": created}

    def bulk_upsert_kpi_config_for_incubator(
        self,
        incubator_id: int,
        chamber_id: Optional[str],
        configs: List[Dict],
        hospital_id: int,
        branch_id: int,
    ) -> Dict:
        """
        For each config: if a row exists for (incubator_id, chamber_id, kpi_name, alert_name) update it;
        otherwise create. Returns {"updated": count, "created": count}.
        """
        from app.models.IVF.incubator_model import Incubator
        updated = 0
        created = 0
        for cfg in configs:
            kpi_name = (cfg.get("kpi_name") or "").strip()
            if not kpi_name:
                continue
            alert_name = cfg.get("alert_name")
            if alert_name is not None and isinstance(alert_name, str):
                alert_name = alert_name.strip() or None
            def _to_float(v):
                if v is None:
                    return None
                try:
                    return float(v)
                except (TypeError, ValueError):
                    return None
            min_val = _to_float(cfg.get("min"))
            max_val = _to_float(cfg.get("max"))
            unit = (cfg.get("unit") or "").strip() or None
            alert_type_val = (cfg.get("alert_type") or "").strip() or None
            status_val = cfg.get("status")
            if status_val is None:
                status_val = alert_type_val in ("critical", "soft")
            cooldown_val = cfg.get("cooldown_minutes")
            try:
                cooldown_val = int(cooldown_val) if cooldown_val is not None else None
            except (TypeError, ValueError):
                cooldown_val = None
            escalation_threshold = cfg.get("unack_escalation_threshold")
            try:
                escalation_threshold = int(escalation_threshold) if escalation_threshold is not None else None
            except (TypeError, ValueError):
                escalation_threshold = None

            query = self.db.query(KpiConfig).filter(
                KpiConfig.incubator_id == incubator_id,
                KpiConfig.kpi_name == kpi_name,
            )
            if chamber_id is not None:
                query = query.filter(KpiConfig.chamber_id == chamber_id)
            else:
                query = query.filter(KpiConfig.chamber_id.is_(None))
            if alert_name is None:
                query = query.filter(KpiConfig.alert_name.is_(None))
            else:
                query = query.filter(KpiConfig.alert_name == alert_name)

            existing = query.first()
            if existing:
                existing.min = min_val
                existing.max = max_val
                existing.alert_type = alert_type_val
                existing.status = bool(status_val)
                if unit is not None:
                    existing.unit = unit
                if cooldown_val is not None:
                    existing.cooldown_minutes = cooldown_val
                existing.unack_escalation_threshold = escalation_threshold
                self.db.flush()
                updated += 1
            else:
                row = KpiConfig(
                    hospital_id=hospital_id,
                    branch_id=branch_id,
                    tank_id=None,
                    incubator_id=incubator_id,
                    chamber_id=chamber_id,
                    kpi_name=kpi_name,
                    alert_name=alert_name,
                    min=min_val,
                    max=max_val,
                    unit=unit,
                    alert_type=alert_type_val,
                    cooldown_minutes=cooldown_val if cooldown_val is not None else 60,
                    unack_escalation_threshold=escalation_threshold,
                    status=bool(status_val),
                )
                self.db.add(row)
                self.db.flush()
                created += 1
        return {"updated": updated, "created": created}

    def bulk_upsert_kpi_config_for_refrigerator(
        self,
        refrigerator_id: int,
        configs: List[Dict],
        hospital_id: int,
        branch_id: int,
        zone_id: Optional[str] = None,
        zone_name: Optional[str] = None,
    ) -> Dict:
        """
        For each config: if a row exists for (refrigerator_id, zone_id, kpi_name, alert_name) update it;
        otherwise create. zone_id=None targets the zone-less (legacy) configs.
        Returns {"updated": count, "created": count}.
        """
        updated = 0
        created = 0
        for cfg in configs:
            kpi_name = (cfg.get("kpi_name") or "").strip()
            if not kpi_name:
                continue
            alert_name = cfg.get("alert_name")
            if alert_name is not None and isinstance(alert_name, str):
                alert_name = alert_name.strip() or None
            def _to_float(v):
                if v is None:
                    return None
                try:
                    return float(v)
                except (TypeError, ValueError):
                    return None
            min_val = _to_float(cfg.get("min"))
            max_val = _to_float(cfg.get("max"))
            unit = (cfg.get("unit") or "").strip() or None
            alert_type_val = (cfg.get("alert_type") or "").strip() or None
            status_val = cfg.get("status")
            if status_val is None:
                status_val = alert_type_val in ("critical", "soft")
            cooldown_val = cfg.get("cooldown_minutes")
            try:
                cooldown_val = int(cooldown_val) if cooldown_val is not None else None
            except (TypeError, ValueError):
                cooldown_val = None
            escalation_threshold = cfg.get("unack_escalation_threshold")
            try:
                escalation_threshold = int(escalation_threshold) if escalation_threshold is not None else None
            except (TypeError, ValueError):
                escalation_threshold = None

            query = self.db.query(KpiConfig).filter(
                KpiConfig.refrigerator_id == refrigerator_id,
                KpiConfig.kpi_name == kpi_name,
            )
            if zone_id is not None:
                query = query.filter(KpiConfig.zone_id == zone_id)
            else:
                query = query.filter(KpiConfig.zone_id.is_(None))
            if alert_name is None:
                query = query.filter(KpiConfig.alert_name.is_(None))
            else:
                query = query.filter(KpiConfig.alert_name == alert_name)

            existing = query.first()
            if existing:
                existing.min = min_val
                existing.max = max_val
                existing.alert_type = alert_type_val
                existing.status = bool(status_val)
                if unit is not None:
                    existing.unit = unit
                if cooldown_val is not None:
                    existing.cooldown_minutes = cooldown_val
                existing.unack_escalation_threshold = escalation_threshold
                if zone_name is not None:
                    existing.zone_name = zone_name
                self.db.flush()
                updated += 1
            else:
                row = KpiConfig(
                    hospital_id=hospital_id,
                    branch_id=branch_id,
                    tank_id=None,
                    incubator_id=None,
                    chamber_id=None,
                    refrigerator_id=refrigerator_id,
                    zone_id=zone_id,
                    zone_name=zone_name,
                    kpi_name=kpi_name,
                    alert_name=alert_name,
                    min=min_val,
                    max=max_val,
                    unit=unit,
                    alert_type=alert_type_val,
                    cooldown_minutes=cooldown_val if cooldown_val is not None else 60,
                    unack_escalation_threshold=escalation_threshold,
                    status=bool(status_val),
                )
                self.db.add(row)
                self.db.flush()
                created += 1
        return {"updated": updated, "created": created}

    def get_last_n_readings_per_kpi(self, tank_id: int, n: int):
        db = self.db

        tank = db.query(Tank.tank_id, Tank.tank_code).filter(Tank.tank_id == tank_id).first()
        if not tank:
            return None

        # Drive from kpi_config (small set: ~KPIs per tank) so each lateral call
        # does a targeted index lookup using idx_readings_tank_kpi_ts instead of
        # sorting all readings for this tank with ROW_NUMBER().
        kpi_cfg = (
            select(KpiConfig.id.label("kpi_config_id"), KpiConfig.kpi_name, KpiConfig.unit)
            .where(KpiConfig.tank_id == tank_id)
            .subquery("kpi_cfg")
        )

        last_n = (
            select(Readings.kpi_value, Readings.timestamp)
            .where(
                Readings.tank_id == tank_id,
                Readings.kpi_config_id == kpi_cfg.c.kpi_config_id,
            )
            .order_by(desc(Readings.timestamp))
            .limit(n)
            .lateral("last_n")
        )

        stmt = (
            select(
                kpi_cfg.c.kpi_config_id,
                kpi_cfg.c.kpi_name,
                kpi_cfg.c.unit,
                last_n.c.kpi_value,
                last_n.c.timestamp,
            )
            .outerjoin(last_n, true())
            .order_by(kpi_cfg.c.kpi_config_id, desc(last_n.c.timestamp))
        )

        results = db.execute(stmt).fetchall()

        if not results:
            return None

        kpis = defaultdict(list)
        for row in results:
            if row.kpi_value is None:
                continue
            ts = row.timestamp.isoformat() if hasattr(row.timestamp, "isoformat") else str(row.timestamp)
            kpis[row.kpi_config_id].append({
                "name": row.kpi_name,
                "value": float(row.kpi_value),
                "unit": row.unit or "",
                "timestamp": ts,
            })

        return {
            "tank_id": tank.tank_id,
            "tank_code": tank.tank_code,
            "kpis": [reading for readings in kpis.values() for reading in readings],
        }

    def get_readings_per_kpi_since(self, tank_id: int, since: datetime):
        """
        Get all KPI readings for a tank where timestamp >= since (for duration-based x-axis).
        Returns same shape as get_last_n_readings_per_kpi: { tank_id, tank_code, kpis: [{ name, value, unit, timestamp }] }.
        """
        db = self.db
        results = (
            db.query(
                Readings.kpi_config_id,
                Readings.kpi_value,
                Readings.timestamp,
                KpiConfig.kpi_name,
                KpiConfig.unit,
                Tank.tank_id,
                Tank.tank_code,
            )
            .join(KpiConfig, Readings.kpi_config_id == KpiConfig.id)
            .join(Tank, Readings.tank_id == Tank.tank_id)
            .filter(Readings.tank_id == tank_id, Readings.timestamp >= since)
            .order_by(Readings.timestamp.desc())
            .all()
        )
        if not results:
            return None
        kpis = []
        tank_info = {"tank_id": results[0].tank_id, "tank_code": results[0].tank_code}
        for row in results:
            ts = (
                row.timestamp.isoformat()
                if hasattr(row.timestamp, "isoformat")
                else str(row.timestamp)
            )
            kpis.append(
                {
                    "name": row.kpi_name,
                    "value": float(row.kpi_value),
                    "unit": row.unit or "",
                    "timestamp": ts,
                }
            )
        return {**tank_info, "kpis": kpis}

    def get_tank_kpi_history_aggregated(
        self,
        tank_id: int,
        since: datetime,
        bucket_minutes: int,
        until: Optional[datetime] = None,
    ) -> Optional[dict]:
        """
        Efficient DB aggregation: group readings by time bucket, MIN/MAX/AVG(kpi_value) per bucket.
        Returns same shape as get_last_n_readings_per_kpi, with extra min/max/avg fields:
        { tank_id, tank_code, kpis: [{ name, value, avg, min, max, count, unit, timestamp }] }.
        bucket_minutes: bucket size in minutes (e.g. 1 for 1H range, 30 for 24H, 720 for 7D).
        No limit; suitable for large ranges (1H / 24H / 7D) so chart gets few points from DB.
        """
        bucket_seconds = bucket_minutes * 60
        # Aggregate over readings first (no join), then join kpi_config on the small
        # result set — reduces the internal sort from all readings rows to ~buckets×KPIs.
        # kpi_value cast to float8 before aggregation (Numeric arithmetic is ~3x slower).
        # Two templates to avoid the (:until IS NULL OR ...) OR-condition that blocks
        # the planner from using a tight two-sided range on idx_readings_tank_ts_covering.
        if until is not None:
            sql = text("""
                SELECT agg.bucket_start, k.kpi_name, k.unit,
                       agg.avg_value, agg.min_value, agg.max_value, agg.sample_count
                FROM (
                    SELECT
                        to_timestamp(
                            floor(extract(epoch from r.timestamp AT TIME ZONE 'UTC') / :bucket_sec) * :bucket_sec
                        ) AT TIME ZONE 'UTC' AS bucket_start,
                        r.kpi_config_id,
                        AVG(r.kpi_value::double precision) AS avg_value,
                        MIN(r.kpi_value::double precision) AS min_value,
                        MAX(r.kpi_value::double precision) AS max_value,
                        COUNT(*)::integer AS sample_count
                    FROM readings r
                    WHERE r.tank_id = :tank_id
                      AND r.timestamp >= :since
                      AND r.timestamp <= :until
                    GROUP BY bucket_start, r.kpi_config_id
                ) agg
                JOIN kpi_config k ON agg.kpi_config_id = k.id
                ORDER BY agg.bucket_start ASC
            """)
        else:
            sql = text("""
                SELECT agg.bucket_start, k.kpi_name, k.unit,
                       agg.avg_value, agg.min_value, agg.max_value, agg.sample_count
                FROM (
                    SELECT
                        to_timestamp(
                            floor(extract(epoch from r.timestamp AT TIME ZONE 'UTC') / :bucket_sec) * :bucket_sec
                        ) AT TIME ZONE 'UTC' AS bucket_start,
                        r.kpi_config_id,
                        AVG(r.kpi_value::double precision) AS avg_value,
                        MIN(r.kpi_value::double precision) AS min_value,
                        MAX(r.kpi_value::double precision) AS max_value,
                        COUNT(*)::integer AS sample_count
                    FROM readings r
                    WHERE r.tank_id = :tank_id
                      AND r.timestamp >= :since
                    GROUP BY bucket_start, r.kpi_config_id
                ) agg
                JOIN kpi_config k ON agg.kpi_config_id = k.id
                ORDER BY agg.bucket_start ASC
            """)
        try:
            self.db.execute(text("SET LOCAL work_mem = '64MB'"))
            rows = self.db.execute(
                sql,
                {
                    "tank_id": tank_id,
                    "since": since,
                    "until": until,
                    "bucket_sec": bucket_seconds,
                },
            ).fetchall()
        except Exception as e:
            logger.error(
                f"Error in get_tank_kpi_history_aggregated: {e}", exc_info=True
            )
            self.db.rollback()
            return None
        if not rows:
            return None
        tank = self.db.query(Tank).filter(Tank.tank_id == tank_id).first()
        tank_code = (tank.tank_code or f"T{tank_id}") if tank else f"T{tank_id}"
        kpis = []
        for row in rows:
            ts = (
                row.bucket_start.isoformat()
                if hasattr(row.bucket_start, "isoformat")
                else str(row.bucket_start)
            )
            kpis.append(
                {
                    "name": row.kpi_name or "",
                    "value": float(row.avg_value) if row.avg_value is not None else 0,
                    "avg": float(row.avg_value) if row.avg_value is not None else 0,
                    "min": float(row.min_value) if row.min_value is not None else None,
                    "max": float(row.max_value) if row.max_value is not None else None,
                    "count": int(row.sample_count) if row.sample_count is not None else 0,
                    "unit": row.unit or "",
                    "timestamp": ts,
                }
            )
        return {"tank_id": tank_id, "tank_code": tank_code, "kpis": kpis}

    def get_latest_tank_kpi_timestamp(self, tank_id: int) -> Optional[datetime]:
        """Return latest readings.timestamp for a tank (None when no data)."""
        try:
            latest_ts = (
                self.db.query(func.max(Readings.timestamp))
                .filter(Readings.tank_id == tank_id)
                .scalar()
            )
            return latest_ts
        except Exception as e:
            logger.error(f"Error getting latest KPI timestamp for tank {tank_id}: {e}")
            self.db.rollback()
            return None

    # ------------------------------------------------------------------
    # Incubator KPI methods (mirror tank methods, filter on incubator_id + chamber_id)
    # ------------------------------------------------------------------

    def get_incubator_kpi_config(
        self, incubator_id: int, incubator_code: str, chamber_id: Optional[str] = None
    ) -> dict:
        """Return KPI limits config for an incubator (optionally scoped to a chamber)."""
        try:
            incubator = self.db.query(Incubator).filter(Incubator.incubator_id == incubator_id).first()
            branch = None
            if incubator and incubator.branch_id is not None:
                branch = (
                    self.db.query(HospitalBranch)
                    .filter(HospitalBranch.branch_id == incubator.branch_id)
                    .first()
                )

            q = self.db.query(KpiConfig).filter(KpiConfig.incubator_id == incubator_id)
            if chamber_id is not None:
                q = q.filter(KpiConfig.chamber_id == chamber_id)
            rows = q.all()

            kpi_limits: dict = {}
            for r in rows:
                alert_type = (r.alert_type or "").strip() or None
                if not bool(r.status) and alert_type is None:
                    continue
                kpi_limits.setdefault(r.kpi_name, {})[r.alert_name] = {
                    "min": float(r.min) if r.min is not None else None,
                    "max": float(r.max) if r.max is not None else None,
                    "alert_type": alert_type,
                }
            return {
                "incubator_id": incubator_id,
                "incubator_code": incubator_code,
                "chamber_id": chamber_id,
                "branch_id": incubator.branch_id if incubator else None,
                "branch_name": branch.branch_name if branch else None,
                "kpi_limits": kpi_limits,
            }
        except Exception as e:
            logger.error(f"Error retrieving KPI config for incubator {incubator_id}: {e}")
            self.db.rollback()
            return {
                "incubator_id": incubator_id,
                "incubator_code": incubator_code,
                "chamber_id": chamber_id,
                "branch_id": None,
                "branch_name": None,
                "kpi_limits": {},
            }

    def get_last_n_readings_per_kpi_incubator(
        self, incubator_id: int, chamber_id: str, n: int
    ) -> Optional[dict]:
        """Last N readings per KPI config for an incubator chamber (mirrors get_last_n_readings_per_kpi)."""
        db = self.db
        row_number = (
            func.row_number()
            .over(
                partition_by=Readings.kpi_config_id, order_by=Readings.timestamp.desc()
            )
            .label("rn")
        )
        subquery = (
            db.query(Readings.id, row_number)
            .filter(
                Readings.incubator_id == incubator_id,
                Readings.chamber_id == chamber_id,
            )
            .subquery()
        )
        valid_ids = db.query(subquery.c.id).filter(subquery.c.rn <= n).subquery()

        results = (
            db.query(
                Readings.kpi_config_id,
                Readings.kpi_value,
                Readings.timestamp,
                KpiConfig.kpi_name,
                KpiConfig.unit,
            )
            .join(KpiConfig, Readings.kpi_config_id == KpiConfig.id)
            .filter(Readings.id.in_(valid_ids))
            .order_by(Readings.kpi_config_id, Readings.timestamp.desc())
            .all()
        )

        if not results:
            return None

        kpis = defaultdict(list)
        for row in results:
            ts = (
                row.timestamp.isoformat()
                if hasattr(row.timestamp, "isoformat")
                else str(row.timestamp)
            )
            kpis[row.kpi_config_id].append(
                {
                    "name": row.kpi_name,
                    "value": float(row.kpi_value),
                    "unit": row.unit or "",
                    "timestamp": ts,
                }
            )
        return {
            "incubator_id": incubator_id,
            "chamber_id": chamber_id,
            "kpis": [reading for readings in kpis.values() for reading in readings],
        }

    def get_readings_per_kpi_since_incubator(
        self, incubator_id: int, chamber_id: str, since: datetime
    ) -> Optional[dict]:
        """All KPI readings for an incubator chamber since a timestamp."""
        db = self.db
        results = (
            db.query(
                Readings.kpi_value,
                Readings.timestamp,
                KpiConfig.kpi_name,
                KpiConfig.unit,
            )
            .join(KpiConfig, Readings.kpi_config_id == KpiConfig.id)
            .filter(
                Readings.incubator_id == incubator_id,
                Readings.chamber_id == chamber_id,
                Readings.timestamp >= since,
            )
            .order_by(Readings.timestamp.desc())
            .all()
        )
        if not results:
            return None
        kpis = []
        for row in results:
            ts = (
                row.timestamp.isoformat()
                if hasattr(row.timestamp, "isoformat")
                else str(row.timestamp)
            )
            kpis.append(
                {
                    "name": row.kpi_name,
                    "value": float(row.kpi_value),
                    "unit": row.unit or "",
                    "timestamp": ts,
                }
            )
        return {"incubator_id": incubator_id, "chamber_id": chamber_id, "kpis": kpis}

    def get_incubator_kpi_history_aggregated(
        self,
        incubator_id: int,
        chamber_id: str,
        since: datetime,
        bucket_minutes: int,
        until: Optional[datetime] = None,
    ) -> Optional[dict]:
        """Aggregated KPI history for an incubator chamber (mirrors get_tank_kpi_history_aggregated)."""
        bucket_seconds = bucket_minutes * 60
        sql = text("""
            SELECT
                to_timestamp(
                    floor(extract(epoch from r.timestamp AT TIME ZONE 'UTC') / :bucket_sec) * :bucket_sec
                ) AT TIME ZONE 'UTC' AS bucket_start,
                k.kpi_name,
                k.unit,
                AVG(r.kpi_value)::double precision AS avg_value,
                MIN(r.kpi_value)::double precision AS min_value,
                MAX(r.kpi_value)::double precision AS max_value,
                COUNT(*)::integer AS sample_count
            FROM readings r
            JOIN kpi_config k ON r.kpi_config_id = k.id
            WHERE r.incubator_id = :incubator_id
              AND r.chamber_id = :chamber_id
              AND r.timestamp >= :since
              AND (:until IS NULL OR r.timestamp <= :until)
            GROUP BY bucket_start, k.id, k.kpi_name, k.unit
            ORDER BY bucket_start ASC
        """)
        try:
            rows = self.db.execute(
                sql,
                {
                    "incubator_id": incubator_id,
                    "chamber_id": chamber_id,
                    "since": since,
                    "until": until,
                    "bucket_sec": bucket_seconds,
                },
            ).fetchall()
        except Exception as e:
            logger.error(f"Error in get_incubator_kpi_history_aggregated: {e}", exc_info=True)
            self.db.rollback()
            return None
        if not rows:
            return None
        kpis = []
        for row in rows:
            ts = (
                row.bucket_start.isoformat()
                if hasattr(row.bucket_start, "isoformat")
                else str(row.bucket_start)
            )
            kpis.append(
                {
                    "name": row.kpi_name or "",
                    "value": float(row.avg_value) if row.avg_value is not None else 0,
                    "avg": float(row.avg_value) if row.avg_value is not None else 0,
                    "min": float(row.min_value) if row.min_value is not None else None,
                    "max": float(row.max_value) if row.max_value is not None else None,
                    "count": int(row.sample_count) if row.sample_count is not None else 0,
                    "unit": row.unit or "",
                    "timestamp": ts,
                }
            )
        return {"incubator_id": incubator_id, "chamber_id": chamber_id, "kpis": kpis}

    def get_latest_incubator_kpi_timestamp(
        self, incubator_id: int, chamber_id: str
    ) -> Optional[datetime]:
        """Return latest readings.timestamp for an incubator chamber (None when no data)."""
        try:
            return (
                self.db.query(func.max(Readings.timestamp))
                .filter(
                    Readings.incubator_id == incubator_id,
                    Readings.chamber_id == chamber_id,
                )
                .scalar()
            )
        except Exception as e:
            logger.error(
                f"Error getting latest KPI timestamp for incubator {incubator_id} chamber {chamber_id}: {e}"
            )
            self.db.rollback()
            return None

    def get_refrigerator_kpi_config(
        self, refrigerator_id: int, refrigerator_code: str, zone_id: Optional[str] = None
    ) -> dict:
        """Return KPI limits config for a refrigerator (optionally scoped to a zone)."""
        from app.models.IVF.refrigerator_model import Refrigerator
        try:
            refrigerator = self.db.query(Refrigerator).filter(Refrigerator.refrigerator_id == refrigerator_id).first()
            branch = None
            if refrigerator and refrigerator.branch_id is not None:
                branch = (
                    self.db.query(HospitalBranch)
                    .filter(HospitalBranch.branch_id == refrigerator.branch_id)
                    .first()
                )

            q = self.db.query(KpiConfig).filter(KpiConfig.refrigerator_id == refrigerator_id)
            if zone_id is not None:
                q = q.filter(KpiConfig.zone_id == zone_id)
            rows = q.all()

            kpi_limits: dict = {}
            for r in rows:
                alert_type = (r.alert_type or "").strip() or None
                if not bool(r.status) and alert_type is None:
                    continue
                kpi_limits.setdefault(r.kpi_name, {})[r.alert_name] = {
                    "min": float(r.min) if r.min is not None else None,
                    "max": float(r.max) if r.max is not None else None,
                    "alert_type": alert_type,
                }
            return {
                "refrigerator_id": refrigerator_id,
                "refrigerator_code": refrigerator_code,
                "zone_id": zone_id,
                "branch_id": refrigerator.branch_id if refrigerator else None,
                "branch_name": branch.branch_name if branch else None,
                "kpi_limits": kpi_limits,
            }
        except Exception as e:
            logger.error(f"Error retrieving KPI config for refrigerator {refrigerator_id}: {e}")
            self.db.rollback()
            return {
                "refrigerator_id": refrigerator_id,
                "refrigerator_code": refrigerator_code,
                "zone_id": zone_id,
                "branch_id": None,
                "branch_name": None,
                "kpi_limits": {},
            }

    def get_refrigerator_zones(self, refrigerator_id: int) -> List[dict]:
        """
        Return the N zones for a refrigerator, driven by refrigerator.zone_count.
        zone_id values are fixed as "zone_1" … "zone_N".  zone_name is the
        user-assigned label stored in kpi_config, defaulting to "Zone N" when
        no KPI config has been saved for that zone yet.
        """
        from app.models.IVF.refrigerator_model import Refrigerator
        try:
            ref = self.db.query(Refrigerator).filter(Refrigerator.refrigerator_id == refrigerator_id).first()
            zone_count = (ref.zone_count or 0) if ref else 0
            if zone_count == 0:
                return []
            # Fetch user-assigned names from kpi_config in one query
            existing = (
                self.db.query(KpiConfig.zone_id, KpiConfig.zone_name)
                .filter(
                    KpiConfig.refrigerator_id == refrigerator_id,
                    KpiConfig.zone_id.isnot(None),
                    KpiConfig.alert_name.is_(None),
                )
                .distinct()
                .all()
            )
            name_map = {r.zone_id: (r.zone_name or r.zone_id) for r in existing if r.zone_id}
            return [
                {"zone_id": f"zone_{i}", "zone_name": name_map.get(f"zone_{i}") or f"Zone {i}"}
                for i in range(1, zone_count + 1)
            ]
        except Exception as e:
            logger.error(f"Error retrieving zones for refrigerator {refrigerator_id}: {e}")
            self.db.rollback()
            return []

    def get_last_n_readings_per_kpi_refrigerator(
        self, refrigerator_id: int, n: int, zone_id: Optional[str] = None
    ) -> Optional[dict]:
        """Last N readings per KPI for a refrigerator (mirrors incubator variant). Optionally scoped to a zone."""
        db = self.db
        row_number = (
            func.row_number()
            .over(partition_by=Readings.kpi_config_id, order_by=Readings.timestamp.desc())
            .label("rn")
        )
        base_q = db.query(Readings.id, row_number).filter(Readings.refrigerator_id == refrigerator_id)
        if zone_id is not None:
            base_q = base_q.filter(Readings.zone_id == zone_id)
        subquery = base_q.subquery()
        valid_ids = db.query(subquery.c.id).filter(subquery.c.rn <= n).subquery()
        results = (
            db.query(Readings.kpi_config_id, Readings.kpi_value, Readings.timestamp, KpiConfig.kpi_name, KpiConfig.unit)
            .join(KpiConfig, Readings.kpi_config_id == KpiConfig.id)
            .filter(Readings.id.in_(valid_ids))
            .order_by(Readings.kpi_config_id, Readings.timestamp.desc())
            .all()
        )
        if not results:
            return None
        kpis = defaultdict(list)
        for row in results:
            ts = row.timestamp.isoformat() if hasattr(row.timestamp, "isoformat") else str(row.timestamp)
            kpis[row.kpi_config_id].append({"name": row.kpi_name, "value": float(row.kpi_value), "unit": row.unit or "", "timestamp": ts})
        return {"refrigerator_id": refrigerator_id, "zone_id": zone_id, "kpis": [r for readings in kpis.values() for r in readings]}

    def get_readings_per_kpi_since_refrigerator(
        self, refrigerator_id: int, since: datetime, zone_id: Optional[str] = None
    ) -> Optional[dict]:
        """All KPI readings for a refrigerator since a timestamp. Optionally scoped to a zone."""
        db = self.db
        q = (
            db.query(Readings.kpi_value, Readings.timestamp, KpiConfig.kpi_name, KpiConfig.unit)
            .join(KpiConfig, Readings.kpi_config_id == KpiConfig.id)
            .filter(Readings.refrigerator_id == refrigerator_id, Readings.timestamp >= since)
        )
        if zone_id is not None:
            q = q.filter(Readings.zone_id == zone_id)
        results = q.order_by(Readings.timestamp.desc()).all()
        if not results:
            return None
        kpis = []
        for row in results:
            ts = row.timestamp.isoformat() if hasattr(row.timestamp, "isoformat") else str(row.timestamp)
            kpis.append({"name": row.kpi_name, "value": float(row.kpi_value), "unit": row.unit or "", "timestamp": ts})
        return {"refrigerator_id": refrigerator_id, "zone_id": zone_id, "kpis": kpis}

    def get_refrigerator_kpi_history_aggregated(
        self,
        refrigerator_id: int,
        zone_id: Optional[str],
        since: datetime,
        bucket_minutes: int,
        until: Optional[datetime] = None,
    ) -> Optional[dict]:
        """Aggregated KPI history for a refrigerator zone (mirrors get_incubator_kpi_history_aggregated)."""
        bucket_seconds = bucket_minutes * 60
        sql = text("""
            SELECT
                to_timestamp(
                    floor(extract(epoch from r.timestamp AT TIME ZONE 'UTC') / :bucket_sec) * :bucket_sec
                ) AT TIME ZONE 'UTC' AS bucket_start,
                k.kpi_name,
                k.unit,
                AVG(r.kpi_value)::double precision AS avg_value,
                MIN(r.kpi_value)::double precision AS min_value,
                MAX(r.kpi_value)::double precision AS max_value,
                COUNT(*)::integer AS sample_count
            FROM readings r
            JOIN kpi_config k ON r.kpi_config_id = k.id
            WHERE r.refrigerator_id = :refrigerator_id
              AND (:zone_id IS NULL OR r.zone_id = :zone_id)
              AND r.timestamp >= :since
              AND (:until IS NULL OR r.timestamp <= :until)
            GROUP BY bucket_start, k.id, k.kpi_name, k.unit
            ORDER BY bucket_start ASC
        """)
        try:
            rows = self.db.execute(
                sql,
                {
                    "refrigerator_id": refrigerator_id,
                    "zone_id": zone_id,
                    "since": since,
                    "until": until,
                    "bucket_sec": bucket_seconds,
                },
            ).fetchall()
        except Exception as e:
            logger.error(f"Error in get_refrigerator_kpi_history_aggregated: {e}", exc_info=True)
            self.db.rollback()
            return None
        if not rows:
            return None
        kpis = []
        for row in rows:
            ts = (
                row.bucket_start.isoformat()
                if hasattr(row.bucket_start, "isoformat")
                else str(row.bucket_start)
            )
            kpis.append(
                {
                    "name": row.kpi_name or "",
                    "value": float(row.avg_value) if row.avg_value is not None else 0,
                    "avg": float(row.avg_value) if row.avg_value is not None else 0,
                    "min": float(row.min_value) if row.min_value is not None else None,
                    "max": float(row.max_value) if row.max_value is not None else None,
                    "count": int(row.sample_count) if row.sample_count is not None else 0,
                    "unit": row.unit or "",
                    "timestamp": ts,
                }
            )
        return {"refrigerator_id": refrigerator_id, "zone_id": zone_id, "kpis": kpis}

    def get_latest_refrigerator_kpi_timestamp(
        self, refrigerator_id: int, zone_id: Optional[str] = None
    ) -> Optional[datetime]:
        """Return latest readings.timestamp for a refrigerator zone (None when no data)."""
        try:
            q = self.db.query(func.max(Readings.timestamp)).filter(Readings.refrigerator_id == refrigerator_id)
            if zone_id is not None:
                q = q.filter(Readings.zone_id == zone_id)
            return q.scalar()
        except Exception as e:
            logger.error(f"Error getting latest KPI timestamp for refrigerator {refrigerator_id} zone {zone_id}: {e}")
            self.db.rollback()
            return None

    def get_tank_kpi_history_from_readings(
        self, tank_id: int, tank_code: str, limit: int = 50
    ) -> List[dict]:
        """
        Get KPI readings history from readings table: group by timestamp, build kpis array.
        Includes readings for any kpi_config of this tank; one value per kpi_name per timestamp (first by config id).
        Returns list of { tank_id, tank_code, timestamp, kpis } oldest first.
        """
        try:
            rows = (
                self.db.query(
                    Readings.timestamp,
                    Readings.kpi_value,
                    KpiConfig.kpi_name,
                    KpiConfig.unit,
                )
                .join(KpiConfig, Readings.kpi_config_id == KpiConfig.id)
                .filter(Readings.tank_id == tank_id)
                .order_by(Readings.timestamp.asc(), KpiConfig.id.asc())
                .all()
            )
            by_ts = {}
            seen_per_ts = {}
            for ts, value, kpi_name, unit in rows:
                key = ts.isoformat() if hasattr(ts, "isoformat") else str(ts)
                if key not in by_ts:
                    by_ts[key] = {"timestamp": key, "kpis": []}
                    seen_per_ts[key] = set()
                if kpi_name not in seen_per_ts[key]:
                    seen_per_ts[key].add(kpi_name)
                    by_ts[key]["kpis"].append(
                        {
                            "timestamp": key,
                            "name": kpi_name,
                            "value": float(value) if value is not None else 0,
                            "unit": unit or "",
                        }
                    )
            # Return with timestamp inside each kpi (no top-level timestamp)
            out = [
                {"tank_id": tank_id, "tank_code": tank_code, "kpis": t["kpis"]}
                for t in by_ts.values()
            ]
            out.sort(key=lambda x: x["kpis"][0]["timestamp"] if x.get("kpis") else "")
            return out[-limit:] if limit else out
        except Exception as e:
            logger.error(f"Error retrieving readings history for tank {tank_id}: {e}")
            self.db.rollback()
            return []

    def get_tank_kpi_history(self, tank_id: int, limit: int = 50) -> List[dict]:
        """
        Get KPI readings history for a tank from DB (readings table).
        Returns list of { tank_id, tank_code, timestamp, kpis } oldest first.
        """
        tank = self.db.query(Tank).filter(Tank.tank_id == tank_id).first()
        tank_code = (tank.tank_code or f"T{tank_id}") if tank else f"T{tank_id}"
        return self.get_tank_kpi_history_from_readings(tank_id, tank_code, limit=limit)

    def get_tank_kpi_redis_history(self, tank_id: int, limit: int = 30) -> List[dict]:
        """Get last N tank KPI readings from Redis (same shape as DB)."""
        try:
            r = get_redis()
            key = f"tank_kpi_history:{tank_id}"
            raw = r.lrange(key, 0, limit - 1)
            if not raw:
                return []
            out = []
            for item in raw:
                try:
                    out.append(json.loads(item))
                except json.JSONDecodeError:
                    continue
            out.reverse()
            return out
        except Exception as e:
            logger.error(
                f"Error retrieving tank KPI Redis history for tank {tank_id}: {e}"
            )
            return []

    def get_ln2_redis_history(self, tank_id: int, limit: int = 12) -> List[dict]:
        """
        Get last N LN2 readings for a tank from Redis (separate from quality history).
        Checks ln2_quality_history:{tank_id} first, then falls back to
        ln2_quality_history:{device_code} for data written before the key-fix.

        Args:
            tank_id: Tank ID to get LN2 history for
            limit: Number of messages to retrieve (default: 12)

        Returns:
            List of LN2 data dictionaries, oldest first (ascending order)
        """
        try:
            redis_client = get_redis()

            # Try primary key (tank_id based)
            history_key = f"ln2_quality_history:{tank_id}"
            raw_history = redis_client.lrange(history_key, 0, limit - 1)

            # Fallback: check device_code based keys (written by old telemetry code)
            if not raw_history:
                from app.models.IVF.device_model import Device
                from app.models.IVF.ln2_iot_device_model import Ln2IotDevice

                device_rows = (
                    self.db.query(Device.device_code)
                    .join(Ln2IotDevice, Ln2IotDevice.device_id == Device.id)
                    .filter(Ln2IotDevice.tank_id == tank_id)
                    .distinct()
                    .all()
                )
                for (dev_code,) in device_rows:
                    fallback_key = f"ln2_quality_history:{dev_code}"
                    raw_history = redis_client.lrange(fallback_key, 0, limit - 1)
                    if raw_history:
                        logger.info(
                            f"Found LN2 history under legacy key {fallback_key} for tank {tank_id}"
                        )
                        break

            if not raw_history:
                return []
            history = []
            for raw_data in raw_history:
                try:
                    data = json.loads(raw_data)
                    history.append(data)
                except json.JSONDecodeError as e:
                    logger.warning(
                        f"Failed to parse LN2 Redis message for tank {tank_id}: {e}"
                    )
                    continue
            history.reverse()
            return history
        except Exception as e:
            logger.error(f"Error retrieving LN2 Redis history for tank {tank_id}: {e}")
            return []

    def get_tank_telemetry_history(
        self, tank_id: int, branch_id: Optional[int], limit: int = 12
    ) -> List[dict]:
        """
        Get last N telemetry records for an IVF tank from database.

        Args:
            tank_id: Tank ID to get telemetry history for
            branch_id: Branch ID to scope records (None allows all branches)
            limit: Number of records to retrieve (default: 12)

        Returns:
            List of telemetry dictionaries, oldest first (ascending order)
        """
        try:
            query = (
                self.db.query(IVFTelemetryData)
                .join(Tank, IVFTelemetryData.tank_id == Tank.tank_id)
                .filter(IVFTelemetryData.tank_id == tank_id)
            )

            if branch_id is not None:
                query = query.filter(Tank.branch_id == branch_id)

            telemetry_records = (
                query.order_by(
                    IVFTelemetryData.created_at.desc(), IVFTelemetryData.id.desc()
                )
                .limit(limit)
                .all()
            )

            history: List[dict] = []
            for record in telemetry_records:
                raw_payload = (
                    record.telemetry_data
                    if isinstance(record.telemetry_data, dict)
                    else {}
                )
                payload = dict(raw_payload)
                timestamp_value = (
                    payload.get("timestamp")
                    or payload.get("reading_timestamp")
                    or (record.created_at.isoformat() if record.created_at else None)
                )
                payload.setdefault("type", "ivf_quality")
                payload["tank_id"] = record.tank_id
                payload["canister_id"] = record.tank_id
                payload["tank_code"] = (
                    record.tank.tank_code if record.tank else payload.get("tank_code")
                )
                payload["canister_number"] = (
                    payload.get("canister_number")
                    or payload.get("tank_code")
                    or (record.tank.tank_code if record.tank else None)
                )
                payload["device_id"] = payload.get("device_id") or record.device_id
                payload["telemetry_data_id"] = record.id
                payload["timestamp"] = timestamp_value
                payload["created_at"] = (
                    record.created_at.isoformat()
                    if record.created_at
                    else payload.get("created_at")
                )
                history.append(payload)

            # Return oldest first for websocket history replay consistency
            history.reverse()
            return history
        except Exception as e:
            logger.error(
                f"Error retrieving telemetry history for tank {tank_id}, branch {branch_id}: {e}"
            )
            return []

    def get_tank_geolocation_history(
        self, tank_id: int, limit: int = 100
    ) -> List[dict]:
        """
        Get geolocation records for an IVF tank from database

        Args:
            tank_id: Tank ID to get geolocation history for
            limit: Maximum number of records to retrieve (default: 100)

        Returns:
            List of geolocation dictionaries, oldest first (ascending order)
        """
        try:
            # Query geolocation records for the tank, ordered by id
            # Note: IVFGeolocation.canister_id is actually tank_id
            geolocation_records = (
                self.db.query(IVFGeolocation)
                .filter(IVFGeolocation.canister_id == tank_id)
                .order_by(IVFGeolocation.id.asc())
                .limit(limit)
                .all()
            )

            # Convert to dictionary format
            geolocation_data = []
            for record in geolocation_records:
                geolocation_data.append(
                    {
                        "type": "ivf_geolocation",
                        "id": record.id,
                        "tank_id": record.canister_id,  # canister_id is actually tank_id
                        "telemetry_data_id": record.ivf_telemetry_data_id,  # IVF model uses ivf_telemetry_data_id
                        "current_latitude": round(record.current_latitude, 2)
                        if record.current_latitude is not None
                        else None,
                        "current_longitude": round(record.current_longitude, 2)
                        if record.current_longitude is not None
                        else None,
                        "reading_timestamp": record.reading_timestamp.isoformat()
                        if record.reading_timestamp
                        else None,
                        "created_at": record.created_at.isoformat()
                        if record.created_at
                        else None,
                    }
                )

            return geolocation_data
        except Exception as e:
            logger.error(
                f"Error retrieving geolocation history for tank {tank_id}: {e}"
            )
            return []

    def get_canister_redis_history(
        self, canister_id: int, limit: int = 12
    ) -> List[dict]:
        """
        Deprecated: Use get_tank_redis_history instead. Kept for backward compatibility.
        Get last N messages for an IVF canister from Redis (canister_id is actually tank_id)
        """
        return self.get_tank_redis_history(canister_id, limit)

    def get_canister_geolocation_history(
        self, canister_id: int, limit: int = 100
    ) -> List[dict]:
        """
        Deprecated: Use get_tank_geolocation_history instead. Kept for backward compatibility.
        Get geolocation records for an IVF canister from database (canister_id is actually tank_id)
        """
        return self.get_tank_geolocation_history(canister_id, limit)

    def validate_tank_belongs_to_branch(
        self, tank_id: int, branch_id: Optional[int], hospital_id: Optional[int] = None
    ) -> bool:
        """
        Validate that a tank belongs to the user's hospital and branch.

        Args:
            tank_id: The tank ID to validate
            branch_id: The user's branch ID (None for Admin users)
            hospital_id: The user's hospital ID — always enforced when provided

        Returns:
            True if validation passes

        Raises:
            Exception: If tank doesn't exist or access is denied
        """
        try:
            from app.models.IVF.hospital_branch_model import HospitalBranch
            tank = self.db.query(Tank).filter(Tank.tank_id == tank_id).first()
            if not tank:
                raise Exception(f"Tank {tank_id} not found")

            # Always enforce hospital-level isolation when hospital_id is provided
            if hospital_id is not None:
                branch = self.db.query(HospitalBranch).filter(
                    HospitalBranch.branch_id == tank.branch_id
                ).first()
                if not branch or branch.hospital_id != hospital_id:
                    raise Exception(f"Access denied: tank does not belong to your hospital")

            # Branch-level check for non-Admin users
            if branch_id is not None and tank.branch_id != branch_id:
                raise Exception(f"Tank {tank_id} does not belong to your branch")

            return True
        except Exception as e:
            logger.error(f"Error validating tank {tank_id} for branch {branch_id}: {e}")
            raise

    async def redis_listener(self, connection_manager: "ConnectionManager"):
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
                        logger.error(
                            f"Error connecting to Redis: {e}. Retrying in 5 seconds..."
                        )
                        await asyncio.sleep(5)
                        continue

                # Use run_in_executor to avoid blocking
                message = await loop.run_in_executor(
                    None,
                    lambda: pubsub.get_message(
                        timeout=1.0, ignore_subscribe_messages=True
                    ),
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

    async def log_connections_periodically(
        self, connection_manager: "ConnectionManager"
    ):
        """
        Log WebSocket connections every 30 seconds

        Args:
            connection_manager: ConnectionManager instance to get connection info
        """
        while True:
            await asyncio.sleep(30)
            connections_info = connection_manager.get_connections_info()
            if connections_info["count"] > 0:
                logger.info(
                    f"Active WebSocket connections: {connections_info['count']}"
                )
                for conn in connections_info["connections"]:
                    patient = conn.get("patient_id", "Not subscribed")
                    logger.debug(
                        f"Connection {conn['id'][:8]}... | "
                        f"Patient: {patient} | "
                        f"Host: {conn['client_info']['host']}"
                    )


def push_ivf_quality_to_redis(
    tank_id: int, tank_code: str, data: dict, publish: bool = True
) -> None:
    """
    Push IVF quality data to Redis (history list + optionally publish for WebSocket).
    Used by seed, ln2_iot_raw_data ingestion, and quality controller fallback.

    Args:
        tank_id: Tank ID
        tank_code: Tank code (e.g., "T30")
        data: Dict with timestamp, temp_internal, temp_external, shock (and optional battery_percentage)
        publish: If True, publish to ivf_quality_channel for live WebSocket updates (False when backfilling)
    """
    try:
        r = get_redis()
        payload = dict(data)
        payload["tank_id"] = tank_id
        payload["tank_code"] = tank_code
        msg = json.dumps(payload)
        history_key = f"ivf_quality_history:{tank_id}"
        r.lpush(history_key, msg)
        r.ltrim(history_key, 0, 29)  # Keep last 30
        if publish:
            r.publish("ivf_quality_channel", msg)
        logger.debug(f"Pushed IVF quality to Redis for tank {tank_code} (id={tank_id})")
    except Exception as e:
        logger.warning(f"Failed to push IVF quality to Redis: {e}")


def append_tank_kpi_snapshot_to_db(
    db: Session,
    tank_id: int,
    tank_code: str,
    timestamp,
    kpis: List[dict],
) -> None:
    """
    Append a KPI snapshot to readings table (one row per kpi) and push to Redis.
    kpis: list of { name, value, unit }. Looks up kpi_config_id per (tank_id, kpi_name) where alert_name is null.
    """
    tank = db.query(Tank).filter(Tank.tank_id == tank_id).first()
    if not tank:
        return
    branch = (
        db.query(HospitalBranch)
        .filter(HospitalBranch.branch_id == tank.branch_id)
        .first()
    )
    hospital_id = branch.hospital_id if branch else None
    branch_id = tank.branch_id
    if hospital_id is None:
        return
    config_by_name = {
        c.kpi_name: c.id
        for c in db.query(KpiConfig)
        .filter(
            KpiConfig.tank_id == tank_id,
            KpiConfig.status == True,
            KpiConfig.alert_name.is_(None),
        )
        .all()
    }
    for k in kpis:
        name = (k.get("name") or "").strip()
        if not name or name not in config_by_name:
            continue
        try:
            val = k.get("value")
            if val is None:
                continue
            if not isinstance(val, (int, float)):
                val = float(val) if val else 0
        except (TypeError, ValueError):
            continue
        row = Readings(
            hospital_id=hospital_id,
            branch_id=branch_id,
            device_id=None,
            tank_id=tank_id,
            kpi_config_id=config_by_name[name],
            kpi_value=val,
            timestamp=timestamp,
            deviation=False,
            deviation_alert_sent=False,
        )
        db.add(row)
    db.flush()
    ts_iso = (
        timestamp.isoformat() if hasattr(timestamp, "isoformat") else str(timestamp)
    )
    kpis_with_ts = [
        {
            "timestamp": ts_iso,
            "name": k.get("name"),
            "value": k.get("value"),
            "unit": k.get("unit", ""),
        }
        for k in kpis
    ]
    payload = {"kpis": kpis_with_ts}
    push_tank_kpi_to_redis(tank_id, tank_code, payload, publish=True)


def append_incubator_kpi_snapshot_to_db(
    db: Session,
    incubator_id: int,
    incubator_code: str,
    chamber_id: str,
    timestamp,
    kpis: List[dict],
) -> None:
    """
    Append an incubator KPI snapshot to readings table (one row per kpi) and push to Redis.
    Mirrors append_tank_kpi_snapshot_to_db but for incubator/chamber.
    kpis: list of { name, value, unit }.
    """
    incubator = db.query(Incubator).filter(Incubator.incubator_id == incubator_id).first()
    if not incubator:
        return
    branch = (
        db.query(HospitalBranch)
        .filter(HospitalBranch.branch_id == incubator.branch_id)
        .first()
    )
    hospital_id = branch.hospital_id if branch else None
    branch_id = incubator.branch_id
    if hospital_id is None:
        return

    config_by_name = {
        c.kpi_name: c.id
        for c in db.query(KpiConfig)
        .filter(
            KpiConfig.incubator_id == incubator_id,
            KpiConfig.chamber_id == chamber_id,
            KpiConfig.status == True,
            KpiConfig.alert_name.is_(None),
        )
        .all()
    }
    for k in kpis:
        name = (k.get("name") or "").strip()
        if not name or name not in config_by_name:
            continue
        try:
            val = k.get("value")
            if val is None:
                continue
            if not isinstance(val, (int, float)):
                val = float(val) if val else 0
        except (TypeError, ValueError):
            continue
        row = Readings(
            hospital_id=hospital_id,
            branch_id=branch_id,
            device_id=None,
            tank_id=None,
            incubator_id=incubator_id,
            chamber_id=chamber_id,
            kpi_config_id=config_by_name[name],
            kpi_value=val,
            timestamp=timestamp,
            deviation=False,
            deviation_alert_sent=False,
        )
        db.add(row)
    db.flush()
    ts_iso = (
        timestamp.isoformat() if hasattr(timestamp, "isoformat") else str(timestamp)
    )
    kpis_with_ts = [
        {
            "timestamp": ts_iso,
            "name": k.get("name"),
            "value": k.get("value"),
            "unit": k.get("unit", ""),
        }
        for k in kpis
    ]
    push_incubator_kpi_to_redis(
        incubator_id, incubator_code, chamber_id, {"kpis": kpis_with_ts}, publish=True
    )


def push_refrigerator_kpi_to_redis(
    refrigerator_id: int, refrigerator_code: str, zone_id: Optional[str],
    payload: dict, publish: bool = True
) -> None:
    """Push refrigerator KPI snapshot to Redis (history list + optionally publish for live graph)."""
    try:
        r = get_redis()
        data = dict(payload)
        data["refrigerator_id"] = refrigerator_id
        data["refrigerator_code"] = refrigerator_code
        data["zone_id"] = zone_id
        data["type"] = "refrigerator_kpi"
        msg = json.dumps(data)
        key_suffix = zone_id or "default"
        history_key = f"refrigerator_kpi_history:{refrigerator_id}:{key_suffix}"
        r.lpush(history_key, msg)
        r.ltrim(history_key, 0, 49)
        if publish:
            r.publish("refrigerator_kpi_readings_channel", msg)
        logger.debug(
            f"Pushed refrigerator KPI to Redis for {refrigerator_code} zone {zone_id} (id={refrigerator_id})"
        )
    except Exception as e:
        logger.warning(f"Failed to push refrigerator KPI to Redis: {e}")


def push_incubator_kpi_to_redis(
    incubator_id: int, incubator_code: str, chamber_id: str,
    payload: dict, publish: bool = True
) -> None:
    """Push incubator KPI snapshot to Redis (history list + optionally publish for live graph)."""
    try:
        r = get_redis()
        data = dict(payload)
        data["incubator_id"] = incubator_id
        data["incubator_code"] = incubator_code
        data["chamber_id"] = chamber_id
        data["type"] = "incubator_kpi"
        msg = json.dumps(data)
        history_key = f"incubator_kpi_history:{incubator_id}:{chamber_id}"
        r.lpush(history_key, msg)
        r.ltrim(history_key, 0, 49)
        if publish:
            r.publish("incubator_kpi_readings_channel", msg)
        logger.debug(
            f"Pushed incubator KPI to Redis for {incubator_code} chamber {chamber_id} (id={incubator_id})"
        )
    except Exception as e:
        logger.warning(f"Failed to push incubator KPI to Redis: {e}")


def push_tank_kpi_to_redis(
    tank_id: int, tank_code: str, payload: dict, publish: bool = True
) -> None:
    """
    Push tank KPI snapshot to Redis (history list + optionally publish for live Quality Tracking graph).
    payload must include: kpis (list of { timestamp, name, value, unit }) — timestamp is per KPI, not top-level.
    """
    try:
        r = get_redis()
        data = dict(payload)
        # Log first KPI entry (raw) for debugging
        try:
            kpis = data.get("kpis") or []
            if kpis:
                first = kpis[0]
                logger.info("Tank KPI first entry raw data: %s", first)
        except Exception:
            # Don't let logging issues break publishing
            pass
        data["tank_id"] = tank_id
        data["tank_code"] = tank_code
        data["type"] = "tank_kpi"
        msg = json.dumps(data)
        history_key = f"tank_kpi_history:{tank_id}"
        r.lpush(history_key, msg)
        r.ltrim(history_key, 0, 49)
        if publish:
            r.publish("tank_kpi_readings_channel", msg)
        logger.debug(f"Pushed tank KPI to Redis for tank {tank_code} (id={tank_id})")
    except Exception as e:
        logger.warning(f"Failed to push tank KPI to Redis: {e}")
