"""
Critical Alert Service
Handles business logic for critical alerts including detection, creation, and email notifications
"""

import logging
import threading
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from jinja2 import Environment, FileSystemLoader
from psycopg2.errors import UniqueViolation
from sqlalchemy import and_, desc, func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ...config.config import settings
from ...config.database import SessionLocal
from ...constants.enums import (
    AlertSource,
    AlertTriggeredBy,
    ApprovalStatus,
    CanisterStatus,
)
from ...models import KpiConfig, Readings
from ...models.IVF.canister_ln2_log_model import CanisterLn2Log
from ...models.IVF.critical_alert_model import (
    AlertSeverity,
    AlertStatus,
    AlertType,
    CriticalAlert,
)
from ...models.IVF.hospital_branch_model import HospitalBranch
from ...models.IVF.hospital_model import Hospital
from ...models.IVF.ivf_quality_log_model import IVFQualityLog
from ...models.IVF.tank_model import Tank
from ...models.user_model import User
from ...schemas.IVF.critical_alert_schema import (
    AcknowledgeAlertResponse,
    CriticalAlertListResponse,
    CriticalAlertResponse,
    HospitalAlertsResponse,
    TankAlertsResponse,
)
from ...service.email_service import send_email

logger = logging.getLogger(__name__)

# Note: IVF thresholds are checked in publisher.py using check_ivf_threshold_magnitude()
# The quality_log already has violation flags set (is_temp_internal_loss, is_temp_external_loss, is_shock_loss, etc.)
# We use those flags instead of re-checking thresholds here

# Quality Loss Thresholds
QUALITY_LOSS_HIGH = 15.0  # Red alert
QUALITY_LOSS_MEDIUM = 5.0  # Yellow alert

# Refill Log Threshold
REFILL_LOG_DAYS = 3  # Alert if refill log not created within 3 days

# Reminder interval
REMINDER_INTERVAL_HOURS = 1  # Send reminder every 1 hour

# Occurrence tracking window for immediate alerts (24 hours)
OCCURRENCE_TRACKING_HOURS = 24  # Track occurrences in last 24 hours
OCCURRENCE_THRESHOLD = 3  # Send to managers after 3 occurrences


class CriticalAlertService:
    """Service for critical alert operations"""

    def __init__(self, db: Session):
        self.db = db

    def resolve_tank_id(self, tank_code: str, branch_id: Optional[int] = None) -> int:
        """
        Resolve a tank_code (external identifier) to the internal tank_id.

        Args:
            tank_code: Tank code (e.g., "T1")
            branch_id: Optional branch filter for authorization (when present)

        Returns:
            tank_id (int)

        Raises:
            ValueError: If the tank_code is not found (or not accessible under branch filter)
        """
        try:
            query = self.db.query(Tank).filter(Tank.tank_code == tank_code)

            if branch_id is not None:
                query = query.filter(Tank.branch_id == branch_id)

            tank = query.first()
            if not tank:
                raise ValueError(f"Tank with code '{tank_code}' not found")

            return tank.tank_id
        except ValueError:
            raise
        except Exception as e:
            logger.error(
                f"Error resolving tank_id for tank_code={tank_code}: {str(e)}",
                exc_info=True,
            )
            raise ValueError(f"Failed to resolve tank: {str(e)}")

    def _max_severity(
        self, current: AlertSeverity, candidate: AlertSeverity
    ) -> AlertSeverity:
        """Return the higher severity between current and candidate."""
        rank = {AlertSeverity.LOW: 1, AlertSeverity.MEDIUM: 2, AlertSeverity.HIGH: 3}
        return candidate if rank[candidate] > rank[current] else current

    def _map_kpi_status_to_severity(
        self, kpi_status: Optional[str]
    ) -> Optional[AlertSeverity]:
        """Map KPI status string to alert severity."""
        if not kpi_status:
            return None
        normalized = kpi_status.strip().lower()
        if normalized == "critical":
            return AlertSeverity.HIGH
        if normalized == "warning":
            return AlertSeverity.MEDIUM
        return None

    def _infer_deviation_severity_from_value(
        self, metric: str, value: Optional[float]
    ) -> AlertSeverity:
        """
        Infer deviation severity from measured value when explicit KPI status is unavailable.
        Uses IVF parameter rules; defaults to HIGH for safety when value is missing/invalid.
        """
        if value is None:
            return AlertSeverity.HIGH

        if metric == "temp_external":
            if value < -20.0:
                deviation = -20.0 - value
                return AlertSeverity.HIGH if deviation > 5.0 else AlertSeverity.MEDIUM
            if value > 60.0:
                deviation = value - 60.0
                return AlertSeverity.HIGH if deviation > 5.0 else AlertSeverity.MEDIUM
            # Flag is true but value appears in range; keep warning level as safer fallback.
            return AlertSeverity.MEDIUM

        # temp_internal (cryogenic breach) and shock are treated as high risk breaches.
        return AlertSeverity.HIGH

    def _check_kpi_deviation(
        self, quality_log: IVFQualityLog
    ) -> Optional[Dict[str, Any]]:
        """
        Check if quality log has KPI deviations using persisted violation flags.
        Threshold evaluation is performed upstream in publisher before writing quality_log.
        Returns dict with alert info if deviation found, None otherwise.
        """
        violations = []
        overall_severity = AlertSeverity.LOW

        # Trust stored flags from quality_log.
        # IVF KPIs: temp_internal, temp_external, shock (humidity not monitored for IVF).
        if quality_log.is_temp_internal_loss:
            temp_internal_value = quality_log.temperature_internal
            violation_severity = self._infer_deviation_severity_from_value(
                "temp_internal", temp_internal_value
            )
            overall_severity = self._max_severity(overall_severity, violation_severity)
            severity_text = (
                "Critical" if violation_severity == AlertSeverity.HIGH else "Warning"
            )
            if temp_internal_value is not None:
                violations.append(
                    f"Temperature Internal: {temp_internal_value}°C ({severity_text} deviation)"
                )
            else:
                violations.append(
                    f"Temperature Internal {severity_text.lower()} deviation detected"
                )

        if quality_log.is_temp_external_loss:
            temp_external_value = quality_log.temperature_external
            violation_severity = self._infer_deviation_severity_from_value(
                "temp_external", temp_external_value
            )
            overall_severity = self._max_severity(overall_severity, violation_severity)
            severity_text = (
                "Critical" if violation_severity == AlertSeverity.HIGH else "Warning"
            )
            if temp_external_value is not None:
                violations.append(
                    f"Temperature External: {temp_external_value}°C ({severity_text} deviation)"
                )
            else:
                violations.append(
                    f"Temperature External {severity_text.lower()} deviation detected"
                )

        if quality_log.is_shock_loss:
            shock_value = quality_log.shock
            violation_severity = self._infer_deviation_severity_from_value(
                "shock", shock_value
            )
            overall_severity = self._max_severity(overall_severity, violation_severity)
            severity_text = (
                "Critical" if violation_severity == AlertSeverity.HIGH else "Warning"
            )
            if shock_value is not None:
                violations.append(f"Shock: {shock_value}G ({severity_text} deviation)")
            else:
                violations.append(f"Shock {severity_text.lower()} deviation detected")

        if violations:
            return {
                "severity": overall_severity
                if overall_severity != AlertSeverity.LOW
                else AlertSeverity.HIGH,
                "message": f"KPI Deviation detected: {', '.join(violations)}",
            }

        return None

    def _check_quality_loss(
        self, quality_log: IVFQualityLog
    ) -> Optional[Dict[str, Any]]:
        """
        Check if quality log has quality loss.
        Returns dict with alert info if quality loss found, None otherwise.
        """
        if quality_log.quality_loss is None or quality_log.quality_loss <= 0:
            return None

        if quality_log.quality_loss >= QUALITY_LOSS_HIGH:
            return {
                "severity": AlertSeverity.HIGH,
                "message": f"High quality loss detected: {quality_log.quality_loss}%",
            }
        elif quality_log.quality_loss >= QUALITY_LOSS_MEDIUM:
            return {
                "severity": AlertSeverity.MEDIUM,
                "message": f"Quality loss detected: {quality_log.quality_loss}%",
            }

        return None

    def _check_refill_log(self, tank_id: int) -> Optional[Dict[str, Any]]:
        """
        Check if refill log is missing (not created within last 3 days).
        Returns dict with alert info if refill log missing, None otherwise.
        """
        # Get the most recent refill log for this tank
        latest_refill = (
            self.db.query(CanisterLn2Log)
            .filter(CanisterLn2Log.tank_id == tank_id)
            .order_by(desc(CanisterLn2Log.refill_date), desc(CanisterLn2Log.created_at))
            .first()
        )

        if not latest_refill or not latest_refill.refill_date:
            # No refill log exists
            return {
                "severity": AlertSeverity.HIGH,
                "message": "Refill log not found. Refill log must be created every 3 days.",
            }

        # Calculate days since last refill
        today = datetime.now(timezone.utc).date()
        if isinstance(latest_refill.refill_date, datetime):
            last_refill_date = latest_refill.refill_date.date()
        else:
            last_refill_date = latest_refill.refill_date

        days_since_refill = (today - last_refill_date).days

        if days_since_refill > REFILL_LOG_DAYS:
            return {
                "severity": AlertSeverity.HIGH
                if days_since_refill > REFILL_LOG_DAYS * 2
                else AlertSeverity.MEDIUM,
                "message": f"Refill log overdue: Last refill was {days_since_refill} days ago. Refill log must be created every 3 days.",
            }

        return None

    def _get_tank_hospital_branch(self, tank_id: int) -> tuple:
        """Get hospital_id and branch_id for a tank"""
        tank = self.db.query(Tank).filter(Tank.tank_id == tank_id).first()
        if not tank:
            raise ValueError(f"Tank {tank_id} not found")

        branch = (
            self.db.query(HospitalBranch)
            .filter(HospitalBranch.branch_id == tank.branch_id)
            .first()
        )
        if not branch:
            raise ValueError(f"Branch for tank {tank_id} not found")

        return branch.hospital_id, branch.branch_id

    def _get_hospital_notification_config(
        self, hospital_id: Optional[int]
    ) -> tuple[bool, bool]:
        """Return hospital notification config as (email_enabled, whatsapp_enabled)."""
        if hospital_id is None:
            return False, False

        config = (
            self.db.query(Hospital.is_email_notifify, Hospital.is_whatsapp_notify)
            .filter(Hospital.hospital_id == hospital_id)
            .first()
        )
        if not config:
            return False, False

        email_enabled, whatsapp_enabled = config
        return bool(email_enabled), bool(whatsapp_enabled)

    def _generate_dedup_key(
        self,
        tank_id: int,
        source: AlertSource,
        alert_type: AlertType,
        occurred_at: datetime,
        extra_info: Optional[str] = None,
    ) -> str:
        """Generate unique deduplication key with timestamp for each alert"""
        # Use timestamp (YYYY-MM-DD_HH:MM:SS) to make each alert unique
        timestamp_str = occurred_at.strftime("%Y-%m-%d_%H:%M:%S")
        return f"{tank_id}:{source.value}:{alert_type.value}:{timestamp_str}:{extra_info or ''}"

    def _create_alert(
        self,
        tank_id: int,
        alert_type: AlertType,
        source: AlertSource,
        severity: AlertSeverity,
        message: str,
        occurred_at: datetime,
        triggered_by: AlertTriggeredBy = AlertTriggeredBy.SYSTEM,
        extra_info: Optional[str] = None,
    ) -> CriticalAlert:
        """Create a new alert if it doesn't already exist (using dedup_key)"""
        # Get hospital and branch info
        hospital_id, branch_id = self._get_tank_hospital_branch(tank_id)

        # Generate deduplication key
        dedup_key = self._generate_dedup_key(
            tank_id, source, alert_type, occurred_at, extra_info=extra_info
        )

        # Check if similar active alert already exists using dedup_key
        existing_alert = (
            self.db.query(CriticalAlert)
            .filter(
                CriticalAlert.dedup_key == dedup_key,
                CriticalAlert.status == AlertStatus.ACTIVE.value,
            )
            .first()
        )

        if existing_alert:
            # Update occurred_at to latest and refresh updated_at
            logger.info(
                f"Alert already exists with dedup_key={dedup_key}, updating existing alert_id={existing_alert.alert_id}"
            )
            existing_alert.occurred_at = occurred_at
            existing_alert.updated_at = datetime.now(timezone.utc)
            return existing_alert

        # Create new alert with UUID
        try:
            alert = CriticalAlert(
                alert_id=str(uuid.uuid4()),
                tank_id=tank_id,
                hospital_id=hospital_id,
                branch_id=branch_id,
                alert_type=alert_type.value,
                source=source.value,
                severity=severity.value,
                message=message,
                status=AlertStatus.ACTIVE.value,
                triggered_by=triggered_by.value,
                occurred_at=occurred_at,
                dedup_key=dedup_key,
                created_at=datetime.now(timezone.utc),
            )

            self.db.add(alert)
            self.db.flush()
            return alert
        except IntegrityError as e:
            # Handle race condition: if another process created the alert between our check and insert
            if isinstance(e.orig, UniqueViolation) and "dedup_key" in str(e.orig):
                logger.info(
                    f"Alert with dedup_key={dedup_key} already exists (race condition), fetching existing alert"
                )
                self.db.rollback()

                # Fetch the existing alert
                existing_alert = (
                    self.db.query(CriticalAlert)
                    .filter(
                        CriticalAlert.dedup_key == dedup_key,
                        CriticalAlert.status == AlertStatus.ACTIVE.value,
                    )
                    .first()
                )

                if existing_alert:
                    # Update occurred_at to latest and refresh updated_at
                    existing_alert.occurred_at = occurred_at
                    existing_alert.updated_at = datetime.now(timezone.utc)
                    self.db.flush()
                    return existing_alert
                else:
                    # Alert exists but was acknowledged/resolved, create new one with different dedup_key
                    logger.warning(
                        f"Alert with dedup_key={dedup_key} exists but is not active, creating new alert"
                    )
                    # Create new alert using current time to produce a distinct dedup_key
                    new_dedup_key = self._generate_dedup_key(
                        tank_id, source, alert_type,
                        datetime.now(timezone.utc),
                        extra_info=extra_info,
                    )
                    alert = CriticalAlert(
                        alert_id=str(uuid.uuid4()),
                        tank_id=tank_id,
                        hospital_id=hospital_id,
                        branch_id=branch_id,
                        alert_type=alert_type.value,
                        source=source.value,
                        severity=severity.value,
                        message=message,
                        status=AlertStatus.ACTIVE.value,
                        triggered_by=triggered_by.value,
                        occurred_at=occurred_at,
                        dedup_key=new_dedup_key,
                        created_at=datetime.now(timezone.utc),
                    )
                    self.db.add(alert)
                    self.db.flush()
                    return alert
            else:
                # Re-raise if it's a different integrity error
                raise

    def check_and_create_alert_for_kpi_deviations(
        self,
        tank_id: Optional[int] = None,
    ) -> list[dict]:
        """
        Check the readings table to see if there is any deviation and create alert not create.
        """

        deviations = (
            self.db.query(Readings)
            .filter(
                Readings.tank_id == tank_id,
                Readings.deviation == True,
                or_(Readings.checked.is_(None), Readings.checked == False),
            )
            .all()
        )

        logger.info("Deviation count for tank_id=%s: %s", tank_id, len(deviations))

        alerts_created = []

        checked_kpi_configs = []

        for deviation in deviations:
            kpi_config = (
                self.db.query(KpiConfig)
                .filter(
                    KpiConfig.id == deviation.kpi_config_id,
                    KpiConfig.status == True,
                )
                .first()
            )
            logger.info(
                "Processing deviation id=%s for tank_id=%s: kpi_config_id=%s, deviation=%s",
                deviation.id,
                tank_id,
                deviation.kpi_config_id,
                deviation.deviation,
            )
            if not kpi_config or kpi_config.id in checked_kpi_configs:
                deviation.checked = True
                continue

            ## Check if last alert created/updated for this config is not acknowledged and occurred within last 1 hour,
            # if yes skip creating new alert to avoid alert spam.
            # Use COALESCE(updated_at, created_at) so that dedup-updates (which only set updated_at)
            # correctly reset the 1-hour cooldown window.
            last_activity_col = func.coalesce(
                CriticalAlert.updated_at, CriticalAlert.created_at
            )
            # Build LIKE patterns anchored to tank_id to avoid false matches
            # (e.g. kpi_config_id=5 must not match :15, :25, :55, etc.)
            # Pattern 1: new keys via _generate_dedup_key → {tank_id}:{source}:{alert_type}:{timestamp}:{kpi_config.id}
            # Pattern 2: legacy keys from old race-condition path → same but with :{HHMMSS} appended
            dedup_prefix = f"{tank_id}:{AlertSource.KPI.value}:{AlertType.DEVIATION_ALERT.value}:%:{kpi_config.id}"
            last_alert = (
                self.db.query(CriticalAlert)
                .filter(
                    CriticalAlert.tank_id == tank_id,
                    CriticalAlert.alert_type == AlertType.DEVIATION_ALERT.value,
                    or_(
                        CriticalAlert.dedup_key.like(dedup_prefix),
                        CriticalAlert.dedup_key.like(f"{dedup_prefix}:%"),
                    ),
                    CriticalAlert.status != AlertStatus.ACKNOWLEDGED.value,
                )
                .order_by(last_activity_col.desc())
                .first()
            )

            now = datetime.now(timezone.utc)
            # Use per-KPI configurable cooldown (default 60 minutes)
            cooldown_seconds = (
                int(kpi_config.cooldown_minutes) * 60
                if kpi_config.cooldown_minutes is not None
                else 3600
            )
            # Ensure timezone-aware comparison using the most recent timestamp (updated_at or created_at)
            if last_alert:
                last_alert_time = last_alert.updated_at or last_alert.created_at
                if last_alert_time:
                    last_alert_time = (
                        last_alert_time
                        if last_alert_time.tzinfo
                        else last_alert_time.replace(tzinfo=timezone.utc)
                    )
                    time_diff = (now - last_alert_time).total_seconds()
                    # Ensure time difference is positive (in case of clock skew/tz mismatch making it negative)
                    # and check if the absolute difference is within the cooldown period.
                    if abs(time_diff) < cooldown_seconds:
                        logger.info(
                            "Skipping alert creation for kpi_config_id=%s as last alert was created/updated within cooldown period (%s minutes) time_diff=%s seconds TIMEDIFF=%s",
                            kpi_config.id,
                            kpi_config.cooldown_minutes,
                            time_diff
                        )
                        deviation.checked = True
                        checked_kpi_configs.append(kpi_config.id)
                        continue

            tank_code = (
                self.db.query(Tank.tank_code).filter(Tank.tank_id == tank_id).scalar()
            )
            branch_name = (
                self.db.query(HospitalBranch.branch_name)
                .filter(HospitalBranch.branch_id == deviation.branch_id)
                .scalar()
            )

            # Frame message
            message = f"{kpi_config.alert_name} is deviated to {round(deviation.kpi_value, 2)} in {branch_name} branch for {tank_code} tank"
            if kpi_config.kpi_name == "ln2_lid_state":
                message = f"{kpi_config.alert_name} is {'OPEN' if deviation.kpi_value == 1 else 'CLOSED'} in {branch_name} branch for {tank_code} tank"

            if kpi_config.kpi_name == "ln2_level":
                message = f"{kpi_config.alert_name} crossed L2 in {branch_name} branch for {tank_code} tank"

            alert = self._create_alert(
                tank_id=tank_id,
                alert_type=AlertType.DEVIATION_ALERT,
                source=AlertSource.KPI,
                severity=AlertSeverity.LOW
                if kpi_config.alert_type == "soft"
                else AlertSeverity.HIGH,
                message=message,
                occurred_at=deviation.timestamp,
                triggered_by=AlertTriggeredBy.SYSTEM,
                extra_info=str(
                    kpi_config.id
                ),  # Include kpi_config_id in dedup_key for better tracking
            )

            alert.branch_id = (
                deviation.branch_id
            )  # Set branch_id on alert for better filtering and notification targeting
            alert.tank_id = tank_id  # Set tank_id on alert for better filtering and notification targeting

            # Fetch both notification flags in a single DB query.
            if kpi_config.alert_type == "critical":
                (
                    is_hospital_email_configured,
                    is_hospital_whatsapp_configured,
                ) = self._get_hospital_notification_config(alert.hospital_id)
                if is_hospital_email_configured:
                    self._send_alert_email(alert)
                else:
                    logger.info(
                        "Skipping email for alert_id=%s because hospital_id=%s has email notifications disabled",
                        alert.alert_id,
                        alert.hospital_id,
                    )
                if is_hospital_whatsapp_configured:
                    self._send_alert_whatsapp(alert)
                else:
                    logger.info(
                        "Skipping WhatsApp for alert_id=%s because hospital_id=%s has whatsapp notifications disabled",
                        alert.alert_id,
                        alert.hospital_id,
                    )

            deviation.alert_id = alert.alert_id
            deviation.checked = True
            checked_kpi_configs.append(kpi_config.id)
            alerts_created.append(alert)
        logger.info(
            "Alert creation complete for tank_id=%s: %s alert(s) created/updated",
            tank_id,
            len(alerts_created),
        )
        self.db.commit()
        # self.db.rollback()  # Rollback since we are not actually creating alerts in this method, just checking and simulating alert creation for KPI deviations

        return alerts_created

    def check_and_create_alerts(
        self,
        tank_id: Optional[int] = None,
        branch_id: Optional[int] = None,
        send_notifications: bool = True,
    ) -> List[CriticalAlert]:
        """
        Check for alerts and create them if needed (tank-level monitoring).
        If tank_id is provided, only check that tank.
        Otherwise, check all active tanks.

        Args:
            tank_id: Optional tank ID to check
            branch_id: Optional branch filter for authorization
            send_notifications: If True, queue alert emails. If False, only create/update alerts.
        """
        alerts_created = []
        # Track dedup_keys we've already sent emails for to prevent duplicate emails
        # This ensures we only send one email per alert type per tank per day
        sent_email_dedup_keys = set()

        # Get tanks to check
        if tank_id:
            tanks = (
                self.db.query(Tank)
                .filter(Tank.tank_id == tank_id, Tank.is_active == True)
                .all()
            )
        else:
            # Check all active tanks, optionally filtered by branch
            query = self.db.query(Tank).filter(Tank.is_active == True)
            if branch_id is not None:
                query = query.filter(Tank.branch_id == branch_id)
            tanks = query.all()

        current_time = datetime.now(timezone.utc)

        for tank in tanks:
            logger.info(
                f"Checking alerts for tank_id={tank.tank_id} (tank_code={tank.tank_code})"
            )

            # Check for KPI deviations and quality loss from recent quality logs (last 24 hours)
            time_threshold = current_time - timedelta(days=1)
            recent_quality_logs = (
                self.db.query(IVFQualityLog)
                .filter(
                    IVFQualityLog.tank_id == tank.tank_id,
                    IVFQualityLog.reading_timestamp >= time_threshold,
                )
                .order_by(desc(IVFQualityLog.reading_timestamp))
                .all()
            )

            logger.info(
                f"Found {len(recent_quality_logs)} quality logs from last 24 hours for tank_id={tank.tank_id} (tank_code={tank.tank_code})"
            )

            if not recent_quality_logs:
                # Check if there are any quality logs at all (for debugging)
                all_logs_count = (
                    self.db.query(IVFQualityLog)
                    .filter(IVFQualityLog.tank_id == tank.tank_id)
                    .count()
                )
                if all_logs_count > 0:
                    latest_log = (
                        self.db.query(IVFQualityLog)
                        .filter(IVFQualityLog.tank_id == tank.tank_id)
                        .order_by(desc(IVFQualityLog.reading_timestamp))
                        .first()
                    )
                    if latest_log:
                        hours_ago = (
                            current_time - latest_log.reading_timestamp
                        ).total_seconds() / 3600
                        logger.warning(
                            f"No recent quality logs for tank_id={tank.tank_id} (tank_code={tank.tank_code}). "
                            f"Latest log is {hours_ago:.1f} hours old (timestamp: {latest_log.reading_timestamp}). "
                            f"Will only check refill logs."
                        )
                else:
                    logger.info(
                        f"No quality logs found for tank_id={tank.tank_id} (tank_code={tank.tank_code}). "
                        f"Will check refill logs only. KPI and quality alerts require quality log entries with violations."
                    )

            for quality_log in recent_quality_logs:
                logger.info(
                    f"Checking quality_log id={quality_log.id}, timestamp={quality_log.reading_timestamp}, "
                    f"temp_internal={quality_log.temperature_internal}°C, temp_external={quality_log.temperature_external}°C, "
                    f"shock={quality_log.shock}G, quality_loss={quality_log.quality_loss}%, "
                    f"violations: temp_internal={quality_log.is_temp_internal_loss}, temp_external={quality_log.is_temp_external_loss}, "
                    f"shock={quality_log.is_shock_loss}"
                )

                # Check KPI deviation (uses violation flags from quality_log)
                kpi_alert = self._check_kpi_deviation(quality_log)
                if kpi_alert:
                    logger.info(
                        f"✓ KPI deviation detected for tank_id={tank.tank_id}: {kpi_alert['message']}"
                    )
                    # Generate dedup_key to check if we've already sent email for this alert
                    dedup_key = self._generate_dedup_key(
                        tank.tank_id,
                        AlertSource.KPI,
                        AlertType.DEVIATION_ALERT,
                        quality_log.reading_timestamp,
                    )

                    alert = self._create_alert(
                        tank_id=tank.tank_id,
                        alert_type=AlertType.DEVIATION_ALERT,
                        source=AlertSource.KPI,
                        severity=kpi_alert["severity"],
                        message=kpi_alert["message"],
                        occurred_at=quality_log.reading_timestamp,
                        triggered_by=AlertTriggeredBy.SYSTEM,
                    )
                    if alert:
                        alerts_created.append(alert)
                        # Only send email if we haven't sent one for this dedup_key yet
                        if dedup_key not in sent_email_dedup_keys:
                            sent_email_dedup_keys.add(dedup_key)
                            logger.info(
                                f"✓ Created/updated KPI deviation alert: alert_id={alert.alert_id}, tank_id={tank.tank_id}, will send email"
                            )
                        else:
                            logger.debug(
                                f"Skipping duplicate email for KPI deviation alert (dedup_key={dedup_key} already processed)"
                            )
                else:
                    logger.debug(
                        f"No KPI deviation found in quality_log id={quality_log.id} (violation flags all False)"
                    )

                # Check quality loss
                quality_alert = self._check_quality_loss(quality_log)
                if quality_alert:
                    logger.info(
                        f"✓ Quality loss detected for tank_id={tank.tank_id}: {quality_alert['message']}"
                    )
                    # Generate dedup_key to check if we've already sent email for this alert
                    dedup_key = self._generate_dedup_key(
                        tank.tank_id,
                        AlertSource.QUALITY,
                        AlertType.QUALITY_ALERT,
                        quality_log.reading_timestamp,
                    )

                    alert = self._create_alert(
                        tank_id=tank.tank_id,
                        alert_type=AlertType.QUALITY_ALERT,
                        source=AlertSource.QUALITY,
                        severity=quality_alert["severity"],
                        message=quality_alert["message"],
                        occurred_at=quality_log.reading_timestamp,
                        triggered_by=AlertTriggeredBy.SYSTEM,
                    )
                    if alert:
                        alerts_created.append(alert)
                        # Only send email if we haven't sent one for this dedup_key yet
                        if dedup_key not in sent_email_dedup_keys:
                            sent_email_dedup_keys.add(dedup_key)
                            logger.info(
                                f"✓ Created/updated quality loss alert: alert_id={alert.alert_id}, tank_id={tank.tank_id}, will send email"
                            )
                        else:
                            logger.debug(
                                f"Skipping duplicate email for quality loss alert (dedup_key={dedup_key} already processed)"
                            )
                else:
                    logger.debug(
                        f"No quality loss found in quality_log id={quality_log.id} (quality_loss={quality_log.quality_loss})"
                    )

            # Check refill log (for the tank)
            # Refill logs are tank-based - this check always runs regardless of quality logs
            logger.info(
                f"Checking refill log status for tank_id={tank.tank_id} (tank_code={tank.tank_code})"
            )
            refill_alert = self._check_refill_log(tank.tank_id)
            if refill_alert:
                dedup_key = self._generate_dedup_key(
                    tank.tank_id,
                    AlertSource.REFILL,
                    AlertType.REFILL_LOG_ALERT,
                    current_time,
                )
                alert = self._create_alert(
                    tank_id=tank.tank_id,
                    alert_type=AlertType.REFILL_LOG_ALERT,
                    source=AlertSource.REFILL,
                    severity=refill_alert["severity"],
                    message=refill_alert["message"],
                    occurred_at=current_time,
                    triggered_by=AlertTriggeredBy.SYSTEM,
                )
                if alert:
                    alerts_created.append(alert)
                    if dedup_key not in sent_email_dedup_keys:
                        sent_email_dedup_keys.add(dedup_key)

        self.db.commit()

        # Send emails ONLY for dedup_keys we haven't sent emails for yet.
        # Keep a single alert per dedup_key to prevent duplicate emails in the same run.
        alerts_to_email = []
        queued_dedup_keys = set()
        for alert in alerts_created:
            if (
                alert.dedup_key in sent_email_dedup_keys
                and alert.dedup_key not in queued_dedup_keys
            ):
                alerts_to_email.append(alert)
                queued_dedup_keys.add(alert.dedup_key)
        logger.info(
            f"Queueing {len(alerts_to_email)} email(s) for background sending out of {len(alerts_created)} total alert(s) processed"
        )

        if not send_notifications:
            logger.info(
                "Email notifications disabled for this check_and_create_alerts run"
            )
            return alerts_created

        # Send emails in background thread to avoid blocking
        if alerts_to_email:

            def send_emails_background():
                """Send emails in background thread"""
                # Create new database session for background thread
                bg_db = SessionLocal()
                try:
                    for alert in alerts_to_email:
                        try:
                            # Refresh alert from database for background thread
                            alert_refreshed = (
                                bg_db.query(CriticalAlert)
                                .filter(CriticalAlert.alert_id == alert.alert_id)
                                .first()
                            )
                            if (
                                alert_refreshed
                                and alert_refreshed.severity == AlertSeverity.HIGH.value
                            ):
                                self._send_alert_email(alert_refreshed)
                        except Exception as e:
                            logger.error(
                                f"Failed to send alert email for alert_id={alert.alert_id}: {str(e)}"
                            )
                finally:
                    bg_db.close()

            # Start background thread
            thread = threading.Thread(target=send_emails_background, daemon=True)
            thread.start()
            logger.info(
                f"Started background thread to send {len(alerts_to_email)} email(s)"
            )

        return alerts_created

    def _send_alert_email(self, alert: CriticalAlert):
        """Send email notification for critical (High severity) alerts only.
        Recipients: all Managers across the hospital + Users in the tank's branch."""
        # Only send emails for critical (High severity) alerts
        if alert.severity != AlertSeverity.HIGH.value:
            logger.debug(
                f"Skipping email for non-critical alert_id={alert.alert_id} (severity={alert.severity})"
            )
            return

        # Get tank directly (tank-level monitoring)
        tank = self.db.query(Tank).filter(Tank.tank_id == alert.tank_id).first()
        if not tank:
            return

        # Get branch and hospital info
        branch = (
            self.db.query(HospitalBranch)
            .filter(HospitalBranch.branch_id == tank.branch_id)
            .first()
        )
        if not branch:
            return

        hospital_id = branch.hospital_id

        # Get all branches for the hospital (needed to find all managers)
        all_branches = (
            self.db.query(HospitalBranch)
            .filter(HospitalBranch.hospital_id == hospital_id)
            .all()
        )
        branch_ids = [b.branch_id for b in all_branches]

        # All Managers across every branch of the hospital
        managers = (
            self.db.query(User)
            .filter(
                User.department == "IVF",
                User.role.in_(["Manager", "Admin"]),
                User.branch_id.in_(branch_ids),
                User.status == True,
                User.approved_status == ApprovalStatus.APPROVED,
            )
            .all()
        )

        # Users (non-manager) in the tank's branch only
        branch_users = (
            self.db.query(User)
            .filter(
                User.department == "IVF",
                User.role == "User",
                User.branch_id == tank.branch_id,
                User.status == True,
                User.approved_status == ApprovalStatus.APPROVED,
            )
            .all()
        )

        # Combine and deduplicate
        all_users = {user.user_id: user for user in managers + branch_users}.values()

        # Send email to each user
        # Navigate to dashboard with alert_id query param - Dashboard will open alerts modal automatically
        alerts_url = f"{settings.FRONTEND_URL}/dashboard?alert_id={alert.alert_id}"

        # Load email template
        template_dir = Path(__file__).parent.parent.parent / "templates" / "emails"
        jinja_env = Environment(loader=FileSystemLoader(str(template_dir)))

        try:
            template = jinja_env.get_template("critical_alert_email.html")
        except Exception as e:
            logger.error(f"Failed to load alert email template: {str(e)}")
            template = None

        # Determine severity class for styling
        severity_class = "high-severity"
        if alert.severity == "Medium":
            severity_class = "medium-severity"
        elif alert.severity == "Low":
            severity_class = "low-severity"

        # Get tank code for email (tank-level monitoring)
        tank_code = tank.tank_code or f"Tank-{tank.tank_id}"

        for user in all_users:
            try:
                subject = f"Critical Alert: {alert.alert_type} - {alert.severity} Severity - {tank_code}"
                ist = timezone(timedelta(hours=5, minutes=30))
                utc_time = alert.occurred_at.replace(tzinfo=timezone.utc)  # mark as UTC
                timestamp_string = utc_time.astimezone(ist).strftime(
                    "%Y-%m-%d %H:%M:%S IST"
                )
                if template:
                    html_body = template.render(
                        subject=subject,
                        alert_type=alert.alert_type,
                        severity=alert.severity,
                        tank_id=alert.tank_id,
                        tank_code=tank_code,
                        branch_name=branch.branch_name or "N/A",
                        message=alert.message,
                        occurred_at=timestamp_string,
                        acknowledge_url=alerts_url,
                        severity_class=severity_class,
                    )
                else:
                    # Fallback to simple HTML if template fails
                    html_body = f"""
                    <html>
                    <body>
                        <h2>Critical Alert Notification</h2>
                        <p><strong>Alert Type:</strong> {alert.alert_type}</p>
                        <p><strong>Severity:</strong> {alert.severity}</p>
                        <p><strong>Tank:</strong> {tank_code}</p>
                        <p><strong>Branch:</strong> {branch.branch_name or "N/A"}</p>
                        <p><strong>Message:</strong> {alert.message}</p>
                        <p><strong>Occurred At:</strong> {timestamp_string}</p>
                        <br/>
                        <a href="{alerts_url}" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
                            View Alerts
                        </a>
                    </body>
                    </html>
                    """

                send_email(user.email, subject, html_body)
                logger.info(
                    f"Sent alert email to {user.email} for alert_id={alert.alert_id}"
                )
            except Exception as e:
                logger.error(f"Failed to send alert email to {user.email}: {str(e)}")

    def _send_alert_whatsapp(self, alert: CriticalAlert):
        """Send WhatsApp notification via Twilio for critical (High severity) alerts only.
        Recipients: all Managers across the hospital + Users in the tank's branch."""
        if alert.severity != AlertSeverity.HIGH.value:
            logger.debug(
                f"Skipping WhatsApp for non-critical alert_id={alert.alert_id} (severity={alert.severity})"
            )
            return

        account_sid = settings.TWILIO_ACCOUNT_SID
        auth_token = settings.TWILIO_AUTH_TOKEN
        from_number = settings.TWILIO_WHATSAPP_FROM

        def _to_whatsapp_number(number: str) -> str:
            normalized = number.strip()
            if normalized.startswith("whatsapp:"):
                return normalized
            return f"whatsapp:{normalized}"

        if not account_sid or not auth_token or not from_number:
            logger.warning(
                "Skipping WhatsApp for alert_id=%s because Twilio settings are incomplete",
                alert.alert_id,
            )
            return

        try:
            from twilio.rest import Client
        except Exception as e:
            logger.error(
                "Twilio library not available; install twilio package. Error: %s",
                str(e),
            )
            return

        tank = self.db.query(Tank).filter(Tank.tank_id == alert.tank_id).first()
        if not tank:
            return

        branch = (
            self.db.query(HospitalBranch)
            .filter(HospitalBranch.branch_id == tank.branch_id)
            .first()
        )
        if not branch:
            return

        hospital_id = branch.hospital_id
        all_branches = (
            self.db.query(HospitalBranch)
            .filter(HospitalBranch.hospital_id == hospital_id)
            .all()
        )
        branch_ids = [b.branch_id for b in all_branches]

        managers = (
            self.db.query(User)
            .filter(
                User.department == "IVF",
                User.role.in_(["Manager", "Admin"]),
                User.branch_id.in_(branch_ids),
                User.status == True,
                User.approved_status == ApprovalStatus.APPROVED,
            )
            .all()
        )
        branch_users = (
            self.db.query(User)
            .filter(
                User.department == "IVF",
                User.role == "User",
                User.branch_id == tank.branch_id,
                User.status == True,
                User.approved_status == ApprovalStatus.APPROVED,
            )
            .all()
        )

        all_users = {user.user_id: user for user in managers + branch_users}.values()
        recipients = [user for user in all_users if getattr(user, "phone_number", None)]

        if not recipients:
            logger.info(
                "No recipients with phone_number found for alert_id=%s; skipping WhatsApp",
                alert.alert_id,
            )
            return

        client = Client(account_sid, auth_token)
        from_whatsapp_number = _to_whatsapp_number(from_number)
        tank_code = tank.tank_code or f"Tank-{tank.tank_id}"
        message_body = (
            f"Critical Alert | Tank: {tank_code} | Branch: {branch.branch_name or 'N/A'} | "
            f"Type: {alert.alert_type} | Severity: {alert.severity} | {alert.message}"
        )

        for user in recipients:
            try:
                to_number = _to_whatsapp_number(user.phone_number)
                client.messages.create(
                    from_=from_whatsapp_number,
                    body=message_body,
                    to=to_number,
                )
                logger.info(
                    "Sent WhatsApp alert to %s for alert_id=%s",
                    to_number,
                    alert.alert_id,
                )
            except Exception as e:
                logger.error(
                    "Failed to send WhatsApp to %s for alert_id=%s: %s",
                    getattr(user, "phone_number", "unknown"),
                    alert.alert_id,
                    str(e),
                )

    def _count_occurrences(
        self, tank_id: int, violation_type: str, occurred_at: datetime
    ) -> int:
        """
        Count how many times a specific violation type occurred for a tank in the tracking window.

        Args:
            tank_id: Tank ID
            violation_type: Type of violation ('temp_internal', 'temp_external', 'shock', 'quality_loss')
            occurred_at: Timestamp of current occurrence

        Returns:
            Count of occurrences in the tracking window
        """
        time_threshold = occurred_at - timedelta(hours=OCCURRENCE_TRACKING_HOURS)

        query = self.db.query(IVFQualityLog).filter(
            IVFQualityLog.tank_id == tank_id,
            IVFQualityLog.reading_timestamp >= time_threshold,
            IVFQualityLog.reading_timestamp <= occurred_at,
        )

        # Apply violation-specific filter
        if violation_type == "quality_loss":
            query = query.filter(IVFQualityLog.quality_loss > 0)
        elif violation_type == "temp_internal":
            query = query.filter(IVFQualityLog.is_temp_internal_loss == True)
        elif violation_type == "temp_external":
            query = query.filter(IVFQualityLog.is_temp_external_loss == True)
        elif violation_type == "shock":
            query = query.filter(IVFQualityLog.is_shock_loss == True)
        else:
            return 0

        count = query.count()
        return count

    def send_immediate_alert_email(
        self, tank_id: int, quality_log_data: Dict[str, Any], occurred_at: datetime
    ):
        """
        Send immediate alert email after inserting quality log with deviation/quality loss.
        This is called directly from publisher after inserting ivf_quality_log.

        Logic:
        - If same issue occurs < 3 times: Send email to branch users
        - If same issue occurs >= 3 times: Send email to managers

        Args:
            tank_id: Tank ID
            quality_log_data: Dict with violation flags and quality loss info
            occurred_at: Timestamp when violation occurred
        """
        try:
            # Get tank and branch info
            tank = self.db.query(Tank).filter(Tank.tank_id == tank_id).first()
            if not tank:
                logger.warning(
                    f"Tank {tank_id} not found - skipping immediate alert email"
                )
                return

            branch = (
                self.db.query(HospitalBranch)
                .filter(HospitalBranch.branch_id == tank.branch_id)
                .first()
            )
            if not branch:
                logger.warning(
                    f"Branch for tank {tank_id} not found - skipping immediate alert email"
                )
                return

            hospital_id = branch.hospital_id
            tank_code = tank.tank_code or f"Tank-{tank_id}"

            # Determine violation types from quality_log_data
            violations_to_check = []

            kpi_statuses = quality_log_data.get("kpi_statuses", {}) or {}

            # Check KPI violations
            if quality_log_data.get("is_temp_internal_loss"):
                status_severity = self._map_kpi_status_to_severity(
                    kpi_statuses.get("temp_internal")
                )
                severity = status_severity or self._infer_deviation_severity_from_value(
                    "temp_internal", quality_log_data.get("temp_internal")
                )
                severity_text = (
                    "Critical" if severity == AlertSeverity.HIGH else "Warning"
                )
                violations_to_check.append(
                    {
                        "type": "temp_internal",
                        "alert_type": AlertType.DEVIATION_ALERT.value,
                        "source": AlertSource.KPI.value,
                        "message": f"Temperature Internal {severity_text.lower()} deviation detected: {quality_log_data.get('temp_internal', 'N/A')}°C",
                        "severity": severity.value,
                    }
                )

            if quality_log_data.get("is_temp_external_loss"):
                status_severity = self._map_kpi_status_to_severity(
                    kpi_statuses.get("temp_external")
                )
                severity = status_severity or self._infer_deviation_severity_from_value(
                    "temp_external", quality_log_data.get("temp_external")
                )
                severity_text = (
                    "Critical" if severity == AlertSeverity.HIGH else "Warning"
                )
                violations_to_check.append(
                    {
                        "type": "temp_external",
                        "alert_type": AlertType.DEVIATION_ALERT.value,
                        "source": AlertSource.KPI.value,
                        "message": f"Temperature External {severity_text.lower()} deviation detected: {quality_log_data.get('temp_external', 'N/A')}°C",
                        "severity": severity.value,
                    }
                )

            if quality_log_data.get("is_shock_loss"):
                status_severity = self._map_kpi_status_to_severity(
                    kpi_statuses.get("shock")
                )
                severity = status_severity or self._infer_deviation_severity_from_value(
                    "shock", quality_log_data.get("shock")
                )
                severity_text = (
                    "Critical" if severity == AlertSeverity.HIGH else "Warning"
                )
                violations_to_check.append(
                    {
                        "type": "shock",
                        "alert_type": AlertType.DEVIATION_ALERT.value,
                        "source": AlertSource.KPI.value,
                        "message": f"Shock {severity_text.lower()} deviation detected: {quality_log_data.get('shock', 'N/A')}G",
                        "severity": severity.value,
                    }
                )

            # Check LN2 Alert
            if quality_log_data.get("alert_type") == "LN2_MONITORING":
                # Handle LN2-specific violations
                if quality_log_data.get("excessive_evaporation"):
                    violations_to_check.append(
                        {
                            "type": "ln2_evaporation",
                            "alert_type": AlertType.DEVIATION_ALERT.value,
                            "source": AlertSource.KPI.value,
                            "message": f"Excessive LN2 evaporation detected: {quality_log_data.get('evaporation_rate', 'N/A')} kg/h",
                            "severity": AlertSeverity.HIGH.value,
                        }
                    )

                if quality_log_data.get("lid_open_beyond_threshold"):
                    violations_to_check.append(
                        {
                            "type": "ln2_lid_open",
                            "alert_type": AlertType.DEVIATION_ALERT.value,
                            "source": AlertSource.KPI.value,
                            "message": f"LN2 tank lid open beyond threshold (>30 minutes). Current state: {quality_log_data.get('lid_state', 'N/A')}",
                            "severity": AlertSeverity.MEDIUM.value,
                        }
                    )

                if quality_log_data.get("sensor_fault"):
                    violations_to_check.append(
                        {
                            "type": "ln2_sensor_fault",
                            "alert_type": AlertType.DEVIATION_ALERT.value,
                            "source": AlertSource.KPI.value,
                            "message": f"LN2 sensor fault detected. Sensor status: {quality_log_data.get('sensor_status', 'UNKNOWN')}",
                            "severity": AlertSeverity.HIGH.value,
                        }
                    )

                # Check LN2 level warning
                ln2_level_pct = quality_log_data.get("ln2_level_pct")
                if ln2_level_pct is not None and ln2_level_pct < 20.0:
                    violations_to_check.append(
                        {
                            "type": "ln2_low_level",
                            "alert_type": AlertType.QUALITY_ALERT.value,
                            "source": AlertSource.QUALITY.value,
                            "message": f"LN2 level critically low: {ln2_level_pct}%",
                            "severity": AlertSeverity.HIGH.value
                            if ln2_level_pct < 10.0
                            else AlertSeverity.MEDIUM.value,
                        }
                    )

            # Check quality loss
            quality_loss = quality_log_data.get("quality_loss", 0.0) or 0.0
            if quality_loss > 0:
                if quality_loss >= QUALITY_LOSS_HIGH:
                    severity = AlertSeverity.HIGH.value
                    message = f"High quality loss detected: {quality_loss}%"
                elif quality_loss >= QUALITY_LOSS_MEDIUM:
                    severity = AlertSeverity.MEDIUM.value
                    message = f"Quality loss detected: {quality_loss}%"
                else:
                    severity = AlertSeverity.MEDIUM.value
                    message = f"Quality loss detected: {quality_loss}%"

                violations_to_check.append(
                    {
                        "type": "quality_loss",
                        "alert_type": AlertType.QUALITY_ALERT.value,
                        "source": AlertSource.QUALITY.value,
                        "message": message,
                        "severity": severity,
                    }
                )

            if not violations_to_check:
                logger.debug(
                    f"No violations detected in quality_log_data for tank {tank_id} - skipping email"
                )
                return

            # Process each violation
            for violation in violations_to_check:
                violation_type = violation["type"]

                # Count occurrences of this violation type
                occurrence_count = self._count_occurrences(
                    tank_id, violation_type, occurred_at
                )

                # Determine recipients based on occurrence count
                if occurrence_count >= OCCURRENCE_THRESHOLD:
                    # Send to BOTH managers AND branch users when >= 3 occurrences

                    # Get managers from the branch
                    branch_managers = (
                        self.db.query(User)
                        .filter(
                            User.department == "IVF",
                            User.role == "Manager",
                            User.branch_id == tank.branch_id,
                            User.status == True,
                            User.approved_status == ApprovalStatus.APPROVED,
                        )
                        .all()
                    )

                    # Get managers from all branches in the hospital
                    all_branches = (
                        self.db.query(HospitalBranch)
                        .filter(HospitalBranch.hospital_id == hospital_id)
                        .all()
                    )
                    branch_ids = [b.branch_id for b in all_branches]

                    hospital_managers = (
                        self.db.query(User)
                        .filter(
                            User.department == "IVF",
                            User.role == "Manager",
                            User.branch_id.in_(branch_ids),
                            User.status == True,
                            User.approved_status == ApprovalStatus.APPROVED,
                        )
                        .all()
                    )

                    # Get branch users (User role) from the occurred branch
                    branch_users = (
                        self.db.query(User)
                        .filter(
                            User.department == "IVF",
                            User.role == "User",
                            User.branch_id == tank.branch_id,
                            User.status == True,
                            User.approved_status == ApprovalStatus.APPROVED,
                        )
                        .all()
                    )

                    # Combine managers and branch users, deduplicate
                    all_recipients = {
                        user.user_id: user
                        for user in branch_managers + hospital_managers + branch_users
                    }.values()
                    recipient_type = "managers and branch users"
                else:
                    # Send to branch users only when < 3 occurrences
                    all_recipients = (
                        self.db.query(User)
                        .filter(
                            User.department == "IVF",
                            User.role == "User",
                            User.branch_id == tank.branch_id,
                            User.status == True,
                            User.approved_status == ApprovalStatus.APPROVED,
                        )
                        .all()
                    )
                    recipient_type = "branch users"

                if not all_recipients:
                    logger.warning(
                        f"No {recipient_type} found for tank {tank_id} - skipping email"
                    )
                    continue

                # Send emails in background thread to avoid blocking
                # Prepare email data for background sending

                email_data = {
                    "recipients": list(
                        all_recipients
                    ),  # Convert to list to avoid session issues
                    "tank_code": tank_code,
                    "branch_name": branch.branch_name or "N/A",
                    "alert_type": violation["alert_type"],
                    "severity": violation["severity"],
                    "message": violation["message"],
                    "occurred_at": occurred_at,
                    "occurrence_count": occurrence_count,
                    "tank_id": tank_id,
                    "violation_type": violation_type,
                    "recipient_type": recipient_type,
                }

                def send_emails_background():
                    """Send emails in background thread"""
                    bg_db = SessionLocal()
                    try:
                        emails_sent = 0
                        emails_failed = 0
                        failed_recipients = []

                        for recipient in email_data["recipients"]:
                            try:
                                # Create a new service instance for background thread
                                bg_service = CriticalAlertService(bg_db)
                                bg_service._send_immediate_alert_email_to_users(
                                    recipients=[recipient],
                                    tank_code=email_data["tank_code"],
                                    branch_name=email_data["branch_name"],
                                    alert_type=email_data["alert_type"],
                                    severity=email_data["severity"],
                                    message=email_data["message"],
                                    occurred_at=email_data["occurred_at"],
                                    occurrence_count=email_data["occurrence_count"],
                                )
                                emails_sent += 1
                            except Exception as e:
                                emails_failed += 1
                                failed_recipients.append(recipient.email)
                                logger.error(
                                    f"Failed to send email to {recipient.email}: {str(e)}"
                                )

                        # Log summary
                        if emails_sent > 0:
                            logger.info(
                                f"✓ Sent immediate alert emails: {emails_sent} successful, {emails_failed} failed "
                                f"to {email_data['recipient_type']} for tank {email_data['tank_id']}, "
                                f"violation_type={email_data['violation_type']}, "
                                f"occurrence_count={email_data['occurrence_count']}"
                            )
                        if emails_failed > 0:
                            logger.warning(
                                f"⚠ Failed to send emails to {emails_failed} recipient(s): {', '.join(failed_recipients)}"
                            )
                    finally:
                        bg_db.close()

                # Start background thread
                thread = threading.Thread(target=send_emails_background, daemon=True)
                thread.start()
                logger.info(
                    f"Queued {len(all_recipients)} email(s) for background sending to {recipient_type} for tank {tank_id}"
                )

        except Exception as e:
            logger.error(
                f"Error sending immediate alert email for tank {tank_id}: {str(e)}",
                exc_info=True,
            )

    def _send_immediate_alert_email_to_users(
        self,
        recipients: List[User],
        tank_code: str,
        branch_name: str,
        alert_type: str,
        severity: str,
        message: str,
        occurred_at: datetime,
        occurrence_count: int,
    ):
        """
        Send immediate alert email to a list of users.

        Args:
            recipients: List of User objects to send email to
            tank_code: Tank code
            branch_name: Branch name
            alert_type: Type of alert
            severity: Alert severity
            message: Alert message
            occurred_at: When violation occurred
            occurrence_count: How many times this issue occurred
        """
        # Load email template
        template_dir = Path(__file__).parent.parent.parent / "templates" / "emails"
        jinja_env = Environment(loader=FileSystemLoader(str(template_dir)))

        try:
            template = jinja_env.get_template("critical_alert_email.html")
        except Exception as e:
            logger.error(f"Failed to load alert email template: {str(e)}")
            template = None

        # Determine severity class for styling
        severity_class = "high-severity"
        if severity == "Medium":
            severity_class = "medium-severity"
        elif severity == "Low":
            severity_class = "low-severity"

        # Dashboard URL
        alerts_url = f"{settings.FRONTEND_URL}/dashboard"

        # Add occurrence count to message if >= threshold
        if occurrence_count >= OCCURRENCE_THRESHOLD:
            message_with_count = f"{message} (This issue has occurred {occurrence_count} times in the last {OCCURRENCE_TRACKING_HOURS} hours)"
        else:
            message_with_count = message

        subject = f"Critical Alert: {alert_type} - {severity} Severity - {tank_code}"

        for user in recipients:
            try:
                if template:
                    html_body = template.render(
                        subject=subject,
                        alert_type=alert_type,
                        severity=severity,
                        tank_id=None,  # Not needed for template
                        tank_code=tank_code,
                        canister_number=tank_code,  # Template uses canister_number
                        branch_name=branch_name,
                        message=message_with_count,
                        occurred_at=occurred_at.strftime("%Y-%m-%d %H:%M:%S UTC"),
                        acknowledge_url=alerts_url,
                        severity_class=severity_class,
                    )
                else:
                    # Fallback HTML
                    html_body = f"""
                    <html>
                    <body>
                        <h2>Critical Alert Notification</h2>
                        <p><strong>Alert Type:</strong> {alert_type}</p>
                        <p><strong>Severity:</strong> {severity}</p>
                        <p><strong>Tank:</strong> {tank_code}</p>
                        <p><strong>Branch:</strong> {branch_name}</p>
                        <p><strong>Message:</strong> {message_with_count}</p>
                        <p><strong>Occurred At:</strong> {occurred_at.strftime("%Y-%m-%d %H:%M:%S UTC")}</p>
                        <br/>
                        <a href="{alerts_url}" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
                            View Alerts
                        </a>
                    </body>
                    </html>
                    """

                # Send email and track result
                send_email(user.email, subject, html_body)
                logger.info(
                    f"✓ Successfully sent immediate alert email to {user.email} for tank {tank_code}, violation: {alert_type}"
                )
            except Exception as email_error:
                logger.error(
                    f"✗ Failed to send immediate alert email to {user.email}: {str(email_error)}",
                    exc_info=True,
                )
                # Re-raise to track in calling function
                raise

    def get_tank_alerts(
        self, tank_id: int, branch_id: Optional[int] = None
    ) -> TankAlertsResponse:
        """Get all alerts for a specific tank by tank_id (tank-level monitoring)"""
        # Get tank
        tank_query = self.db.query(Tank).filter(Tank.tank_id == tank_id)
        if branch_id is not None:
            tank_query = tank_query.filter(Tank.branch_id == branch_id)
        tank = tank_query.first()
        if not tank:
            raise ValueError(f"Tank {tank_id} not found")

        # Get alerts for the tank
        alerts = (
            self.db.query(CriticalAlert)
            .filter(CriticalAlert.tank_id == tank_id)
            .order_by(desc(CriticalAlert.occurred_at))
            .all()
        )

        tank_code = tank.tank_code or f"Tank-{tank_id}"

        # Build alert responses with tank_code
        alert_responses = []
        for alert in alerts:
            alert_dict = {**alert.__dict__, "tank_code": tank_code}
            alert_responses.append(CriticalAlertResponse.model_validate(alert_dict))

        return TankAlertsResponse(
            tank_id=tank_id,
            tank_code=tank_code,
            alerts=alert_responses,
            total_count=len(alert_responses),
        )

    def get_tank_alerts_by_code(
        self, tank_code: str, branch_id: Optional[int] = None
    ) -> TankAlertsResponse:
        """
        Get all alerts for a specific tank by tank_code (tank-level monitoring).

        Args:
            tank_code: Tank code (e.g., "T1")
            branch_id: Optional branch filter for authorization

        Returns:
            TankAlertsResponse with all alerts for the tank
        """
        # Resolve tank_code to tank_id
        try:
            tank_id = self.resolve_tank_id(tank_code, branch_id)
        except ValueError as e:
            raise ValueError(f"Tank '{tank_code}' not found: {str(e)}")

        return self.get_tank_alerts(tank_id)

    def get_hospital_alerts(
        self,
        branch_id: Optional[int] = None,
        hospital_id: Optional[int] = None,
        role: Optional[str] = None,
        status: Optional[AlertStatus] = None,
    ) -> HospitalAlertsResponse:
        """
        Get all alerts for hospital.
        - User: only their branch (branch_id from token)
        - Manager/Admin: all branches in their hospital (hospital_id from token)
        """
        # Build query
        query = (
            self.db.query(CriticalAlert)
            .join(Tank, CriticalAlert.tank_id == Tank.tank_id)
            .join(HospitalBranch, Tank.branch_id == HospitalBranch.branch_id)
        )

        # Apply branch or hospital filter based on role
        if role and role == "User" and branch_id:
            query = query.filter(HospitalBranch.branch_id == branch_id)
        elif hospital_id is not None:
            # Manager/Admin: scope to branches of this hospital (hospital_id from token)
            query = query.filter(HospitalBranch.hospital_id == hospital_id)

        # Apply status filter
        if status:
            query = query.filter(CriticalAlert.status == status.value)

        alerts = query.order_by(desc(CriticalAlert.occurred_at)).all()

        # Get tank codes and canister numbers for all alerts (tank-level monitoring)
        tank_ids = [alert.tank_id for alert in alerts]
        tanks = self.db.query(Tank).filter(Tank.tank_id.in_(tank_ids)).all()
        tank_code_map = {t.tank_id: t.tank_code for t in tanks}

        # Build alert responses with tank_code
        alert_responses = []
        for alert in alerts:
            tank_code = tank_code_map.get(alert.tank_id) or f"Tank-{alert.tank_id}"
            alert_dict = {**alert.__dict__, "tank_code": tank_code}
            alert_responses.append(CriticalAlertResponse.model_validate(alert_dict))

        active_count = sum(1 for a in alerts if a.status == AlertStatus.ACTIVE.value)
        acknowledged_count = len(alerts) - active_count

        return HospitalAlertsResponse(
            alerts=alert_responses,
            total_count=len(alert_responses),
            active_count=active_count,
            acknowledged_count=acknowledged_count,
        )

    def acknowledge_alert(
        self, alert_id: str, user_id: str
    ) -> AcknowledgeAlertResponse:
        """Acknowledge an alert"""
        alert = (
            self.db.query(CriticalAlert)
            .filter(CriticalAlert.alert_id == alert_id)
            .first()
        )

        if not alert:
            raise ValueError(f"Alert with ID {alert_id} not found")

        if alert.status == AlertStatus.ACKNOWLEDGED.value:
            raise ValueError(f"Alert {alert_id} is already acknowledged")

        # Update alert status
        alert.status = AlertStatus.ACKNOWLEDGED.value
        alert.acknowledged_by = user_id
        alert.acknowledged_at = datetime.now(timezone.utc)
        alert.updated_at = datetime.now(timezone.utc)

        self.db.commit()
        self.db.refresh(alert)

        return AcknowledgeAlertResponse(
            alert_id=alert.alert_id,
            status=AlertStatus.ACKNOWLEDGED,
            message="Alert acknowledged successfully",
            acknowledged_at=alert.acknowledged_at,
        )

    async def send_reminder_emails(self):
        """
        Send reminder emails for unacknowledged alerts.

        Rules:
        - Only send reminders for Active alerts
        - Only send if last reminder was sent more than 1 hour ago (or never sent)
        - User role: Send reminders for alerts in their branch
        - Manager role: Send reminders for alerts in all branches of their hospital
        """
        current_time = datetime.now(timezone.utc)
        reminder_threshold = current_time - timedelta(hours=REMINDER_INTERVAL_HOURS)

        # Get all active alerts that need reminders
        # (status = Active AND (last_reminder_sent_at is None OR last_reminder_sent_at < threshold))
        alerts_needing_reminders = (
            self.db.query(CriticalAlert)
            .filter(
                CriticalAlert.status == AlertStatus.ACTIVE.value,
                or_(
                    CriticalAlert.last_reminder_sent_at.is_(None),
                    CriticalAlert.last_reminder_sent_at < reminder_threshold,
                ),
            )
            .all()
        )

        if not alerts_needing_reminders:
            logger.info("No alerts need reminder emails at this time")
            return

        logger.info(
            f"Found {len(alerts_needing_reminders)} alerts needing reminder emails"
        )

        # Group alerts by hospital and branch for efficient user lookup
        alerts_by_hospital: Dict[int, List[CriticalAlert]] = {}
        alerts_by_branch: Dict[int, List[CriticalAlert]] = {}

        for alert in alerts_needing_reminders:
            # Group by hospital (for Managers)
            if alert.hospital_id not in alerts_by_hospital:
                alerts_by_hospital[alert.hospital_id] = []
            alerts_by_hospital[alert.hospital_id].append(alert)

            # Group by branch (for Users)
            if alert.branch_id not in alerts_by_branch:
                alerts_by_branch[alert.branch_id] = []
            alerts_by_branch[alert.branch_id].append(alert)

        # Get all IVF users (active and approved)
        all_ivf_users = (
            self.db.query(User)
            .filter(
                User.department == "IVF",
                User.status == True,
                User.approved_status == ApprovalStatus.APPROVED,
            )
            .all()
        )

        # Send reminders to Users (their branch alerts)
        user_reminders_sent = 0
        for user in all_ivf_users:
            if user.role.value != "User" or not user.branch_id:
                continue

            branch_alerts = alerts_by_branch.get(user.branch_id, [])
            if branch_alerts:
                try:
                    self._send_reminder_email_to_user(user, branch_alerts)
                    user_reminders_sent += 1
                except Exception as e:
                    logger.error(
                        f"Failed to send reminder email to user {user.user_id}: {str(e)}"
                    )

        # Send reminders to Managers (all branches in their hospital)
        manager_reminders_sent = 0
        for user in all_ivf_users:
            if user.role.value != "Manager" or not user.branch_id:
                continue

            # Get hospital_id from user's branch
            branch = (
                self.db.query(HospitalBranch)
                .filter(HospitalBranch.branch_id == user.branch_id)
                .first()
            )
            if not branch:
                continue

            hospital_alerts = alerts_by_hospital.get(branch.hospital_id, [])
            if hospital_alerts:
                try:
                    self._send_reminder_email_to_user(user, hospital_alerts)
                    manager_reminders_sent += 1
                except Exception as e:
                    logger.error(
                        f"Failed to send reminder email to manager {user.user_id}: {str(e)}"
                    )

        # Update last_reminder_sent_at for all alerts that got reminders
        for alert in alerts_needing_reminders:
            alert.last_reminder_sent_at = current_time

        self.db.commit()

        logger.info(
            f"Sent reminder emails: {user_reminders_sent} to Users, {manager_reminders_sent} to Managers"
        )

    def _send_reminder_email_to_user(self, user: User, alerts: List[CriticalAlert]):
        """Send reminder email to a user with their relevant alerts"""
        if not alerts:
            return

        # Get tank codes for all alerts (tank-level monitoring)
        tank_ids = [alert.tank_id for alert in alerts]
        tanks = self.db.query(Tank).filter(Tank.tank_id.in_(tank_ids)).all()
        tank_code_map = {t.tank_id: t.tank_code for t in tanks}

        # Get branch names
        branch_ids = list(set([alert.branch_id for alert in alerts]))
        branches = (
            self.db.query(HospitalBranch)
            .filter(HospitalBranch.branch_id.in_(branch_ids))
            .all()
        )
        branch_name_map = {b.branch_id: b.branch_name for b in branches}

        # Load email template
        template_dir = Path(__file__).parent.parent.parent / "templates" / "emails"
        jinja_env = Environment(loader=FileSystemLoader(str(template_dir)))

        try:
            template = jinja_env.get_template("critical_alert_reminder_email.html")
        except Exception as e:
            logger.error(f"Failed to load reminder email template: {str(e)}")
            template = None

        # Get tank codes for alerts (tank-level monitoring)
        tank_ids = [alert.tank_id for alert in alerts]
        tanks = self.db.query(Tank).filter(Tank.tank_id.in_(tank_ids)).all()
        tank_code_map = {t.tank_id: t.tank_code for t in tanks}

        # Prepare alert data for email
        alert_data = []
        for alert in alerts:
            tank_code = tank_code_map.get(alert.tank_id) or f"Tank-{alert.tank_id}"
            branch_name = branch_name_map.get(alert.branch_id) or "N/A"

            alert_data.append(
                {
                    "alert_id": alert.alert_id,
                    "alert_type": alert.alert_type,
                    "severity": alert.severity,
                    "tank_code": tank_code,
                    "branch_name": branch_name,
                    "message": alert.message,
                    "occurred_at": alert.occurred_at.strftime("%Y-%m-%d %H:%M:%S UTC"),
                    "hours_since": int(
                        (datetime.now(timezone.utc) - alert.occurred_at).total_seconds()
                        / 3600
                    ),
                }
            )

        subject = f"Reminder: {len(alerts)} Unacknowledged Critical Alert(s)"
        # Navigate to dashboard - Dashboard will show alerts modal
        alerts_url = f"{settings.FRONTEND_URL}/dashboard"

        try:
            if template:
                html_body = template.render(
                    subject=subject,
                    user_name=f"{user.first_name} {user.last_name}",
                    alerts=alert_data,
                    total_count=len(alerts),
                    acknowledge_url=alerts_url,
                )
            else:
                # Fallback HTML
                alerts_html = "\n".join(
                    [
                        f"<li><strong>{a['alert_type']}</strong> - {a['canister_number']} ({a['branch_name']}): {a['message']}</li>"
                        for a in alert_data
                    ]
                )
                html_body = f"""
                <html>
                <body>
                    <h2>Critical Alert Reminder</h2>
                    <p>You have {len(alerts)} unacknowledged critical alert(s):</p>
                    <ul>{alerts_html}</ul>
                    <br/>
                    <a href="{alerts_url}" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
                        View Alerts
                    </a>
                </body>
                </html>
                """

            send_email(user.email, subject, html_body)
            logger.info(
                f"Sent reminder email to {user.email} for {len(alerts)} alert(s)"
            )
        except Exception as e:
            logger.error(f"Failed to send reminder email to {user.email}: {str(e)}")
            raise
