"""
Critical Alert Service
Handles business logic for critical alerts including detection, creation, and email notifications
"""

import logging
import math
import threading
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from jinja2 import Environment, FileSystemLoader
from psycopg2.errors import UniqueViolation
from sqlalchemy import and_, desc, func, or_, text
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
from ...models.IVF.incubator_model import Incubator
from ...models.IVF.refrigerator_model import Refrigerator
from ...models.push_subscription_model import PushSubscription
from ...models.user_model import User
from ...schemas.IVF.critical_alert_schema import (
    AcknowledgeAlertResponse,
    AcknowledgeAlertsResponse,
    CriticalAlertListResponse,
    CriticalAlertResponse,
    HospitalAlertsResponse,
    IncubatorAlertsResponse,
    RefrigeratorAlertsResponse,
    TankAlertsResponse,
)
from ...service.email_service import send_email
from ...service.push_notification_service import (
    push_notifications_configured,
    send_web_push,
)
from ...service.redis_service import get_redis
from ...service.activity_log_service import (
    ActivityLogService,
    build_system_actor,
    build_target,
)
from ...constants.enums import ActivityOutcome

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

# Namespace for pg_try_advisory_xact_lock so concurrent /check_kpi runs for the
# same tank serialize instead of racing (arbitrary but stable across processes).
_ADVISORY_LOCK_NS_KPI = 4711

# Cross-process guard so a given alert is emailed to a given recipient only once.
_EMAIL_DEDUP_TTL_SECONDS = 21600  # 6 hours

# WhatsApp throttle, independent of kpi_config.cooldown_minutes and email.
# Redis holds, per kpi_config + role group ("user" = role User, "admin" =
# Manager/Admin), the reading timestamp of the last WhatsApp actually delivered to
# that group. Windows compare reading (device) timestamps, not wall clock. A newer
# deviation=False reading means the KPI recovered — fresh episode, that group is
# notified again regardless of its window. Fail-open when Redis is unreachable.
_WA_USER_COOLDOWN_SECONDS = 60 * 60
_WA_ADMIN_COOLDOWN_SECONDS = 2 * 60 * 60
_wa_last_sent_key = lambda kpi_config_id, group: f"alert:whatsapp:last_sent:{kpi_config_id}:{group}"

# WhatsApp Content Template SIDs
_WA_TEMPLATE_DEVIATION = "HX890c0696439223c8f7b952d35360ea25"   # "{{1}} is deviated to {{2}} in {{3}} branch for {{4}} tank"
_WA_TEMPLATE_LID_STATE = "HXb0f2ec1db58e9f6ac5be31473a6a6cf7"   # "{{1}} is {{2}} in {{3}} branch for {{4}} tank"
_WA_TEMPLATE_LN2_LEVEL = "HXcb6b9aeb47949e7b1c45efbfe7900eed"   # "{{1}} crossed L2 in {{2}} branch for {{3}} tank"

# Alert-email artwork. Embedded as inline CID attachments rather than linked, so the
# images render without a publicly reachable host and without the recipient having to
# allow external images. Paths resolve against the frontend's public/ directory.
# Inside the backend tree so the assets ship with the backend image; the frontend's
# public/ directory is not present in a backend-only deployment.
_EMAIL_ASSET_DIR = Path(__file__).resolve().parents[2] / "assets" / "email"
_EMAIL_BANNER_PATH = "/banner-hex.png"

_EMAIL_INLINE_ASSETS = {
    "mg_logo": "mygrape-logo.png",
    "mg_tank": "cryocan.png",
    "mg_pin": "email-icons/pin.png",
    "mg_tankicon": "email-icons/tank.png",
    "mg_clock": "email-icons/clock.png",
    "mg_bars": "email-icons/bars.png",
    "mg_pulse": "email-icons/pulse.png",
    "mg_clockg": "email-icons/clock_g.png",
}


# Per-KPI icon for the reading callout, mirroring the icons on the AlertSetting cards
# (CryoBentoGrid / DeviceKpiGrid). Only the matching one is attached, under a fixed
# content-id, so the template does not need to know which KPI it is rendering.
_KPI_ICON_FILES = {
    "temp_internal": "kpi_thermometer.png",
    "temp_external": "kpi_thermometer_sun.png",
    "incubator_temp": "kpi_thermometer.png",
    "incubator_o2": "kpi_wind.png",
    "incubator_co2": "kpi_cloud_fog.png",
    "incubator_humidity": "kpi_cloud_rain.png",
    "refrigerator_temp": "kpi_thermometer.png",
    "refrigerator_humidity": "kpi_cloud_rain.png",
    "humidity": "kpi_cloud_rain.png",
    "incubator_ph": "kpi_flask.png",
    "incubator_voc": "kpi_gauge.png",
    "tive_battery_percentage": "kpi_battery.png",
    "shock": "kpi_zap.png",
    "ln2_level": "kpi_droplet.png",
    "ln2_evaporation_rate": "kpi_waves.png",
    "ln2_lid_state": "kpi_door.png",
    "incubator_lid_state": "kpi_door.png",
}
_KPI_ICON_DEFAULT = "kpi_thermometer.png"
_KPI_ICON_CID = "mg_kpi"

# send_immediate_alert_email labels violations with its own type strings; map them onto
# the kpi_name keys _KPI_ICON_FILES understands so the callout icon matches the violation.
_IMMEDIATE_VIOLATION_ICON_KPI = {
    "temp_internal": "temp_internal",
    "temp_external": "temp_external",
    "shock": "shock",
    "ln2_evaporation": "ln2_evaporation_rate",
    "ln2_lid_open": "ln2_lid_state",
}


def _inline_alert_images(
    kpi_name: Optional[str] = None, include_tank: bool = True
) -> dict:
    """{content_id: absolute path} for every asset the alert templates reference.

    include_tank drops the cryotank artwork (the heaviest asset) for incubator and
    refrigerator alerts, where a picture of a tank would be misleading."""
    assets = dict(_EMAIL_INLINE_ASSETS)
    if not include_tank:
        assets.pop("mg_tank", None)
    assets[_KPI_ICON_CID] = "email-icons/" + _KPI_ICON_FILES.get(
        kpi_name or "", _KPI_ICON_DEFAULT
    )
    return {
        cid: str(_EMAIL_ASSET_DIR / rel)
        for cid, rel in assets.items()
        if (_EMAIL_ASSET_DIR / rel).is_file()
    }

# Lid-state gate. A lid open for a routine retrieval must not page anyone, so the
# first alert waits until the lid has been continuously open this long. Kept separate
# from kpi_config.cooldown_minutes, which governs only how often the alert repeats
# afterwards — one field cannot carry both meanings independently.
_LID_OPEN_TOLERANCE_SECONDS = 5 * 60

_LID_STATE_KPI_NAMES = {"ln2_lid_state", "incubator_lid_state"}
_LN2_LEVEL_KPI_NAMES = {"ln2_level"}
_DEVIATION_KPI_NAMES = {
    "temp_internal", "temp_external",
    "ln2_evaporation_rate", "shock", "tive_battery_percentage",
    "incubator_o2", "incubator_co2", "incubator_temp",
    "incubator_humidity", "incubator_ph", "incubator_voc",
}


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

    def _tank_has_email_alert_enabled(self, tank_id: int) -> bool:
        """True when any active KPI config for the tank has per-KPI email alerts on."""
        return (
            self.db.query(KpiConfig.id)
            .filter(
                KpiConfig.tank_id == tank_id,
                KpiConfig.status == True,
                KpiConfig.email_alert == True,
            )
            .first()
            is not None
        )

    def _episode_start(self, kpi_config_id: int, *device_filters) -> Optional[datetime]:
        """Timestamp of the first deviating reading in the current unbroken episode.

        Anchored to the most recent clearing reading, so a recovery ends the episode
        and the next deviation starts a fresh one. device_filters scope the lookup to
        one device (tank, or refrigerator + zone). Returns None when no deviating
        reading exists."""
        last_clear = (
            self.db.query(Readings)
            .filter(
                *device_filters,
                Readings.kpi_config_id == kpi_config_id,
                Readings.deviation == False,
            )
            .order_by(Readings.timestamp.desc())
            .first()
        )

        query = self.db.query(Readings).filter(
            *device_filters,
            Readings.kpi_config_id == kpi_config_id,
            Readings.deviation == True,
        )
        if last_clear:
            query = query.filter(Readings.timestamp >= last_clear.timestamp)

        first_deviation = query.order_by(Readings.timestamp.asc()).first()
        if not first_deviation or not first_deviation.timestamp:
            return None

        start_time = first_deviation.timestamp
        return start_time if start_time.tzinfo else start_time.replace(tzinfo=timezone.utc)

    def _format_ist_clock(self, moment: datetime) -> str:
        """Render a UTC moment as an IST wall-clock time, e.g. '9:00AM'."""
        aware = moment if moment.tzinfo else moment.replace(tzinfo=timezone.utc)
        ist = timezone(timedelta(hours=5, minutes=30))
        return aware.astimezone(ist).strftime("%I:%M %p").lstrip("0")

    def _format_ist_date(self, moment: datetime) -> str:
        """Render a UTC moment as an IST calendar date, e.g. '03 Aug 2026'. Derived from
        the IST-shifted moment so a late-evening UTC timestamp reports the next day."""
        aware = moment if moment.tzinfo else moment.replace(tzinfo=timezone.utc)
        ist = timezone(timedelta(hours=5, minutes=30))
        return aware.astimezone(ist).strftime("%d %b %Y")

    def _ln2_usable_span(self, tank_id: Optional[int]) -> Optional[float]:
        """Usable LN2 range in kg, used to express ln2_level as a percentage.

        The tank's own full/empty weights are the source of truth; the IoT device
        thresholds are only a fallback for tanks whose weights were never recorded.
        Note the track-shipment UI divides by the device thresholds instead, so the
        two can differ where both are populated."""
        if tank_id is None:
            return None

        tank = self.db.query(Tank).filter(Tank.tank_id == tank_id).first()
        if tank and tank.full_weight_kg is not None and tank.empty_weight_kg is not None:
            span = float(tank.full_weight_kg) - float(tank.empty_weight_kg)
            if span > 0:
                return span

        # Raw SQL rather than the ORM model: Ln2IotDevice declares a relationship that
        # does not resolve unless the whole model graph is imported, and importing it
        # here would break this module at load time.
        device = self.db.execute(
            text("""SELECT tank_max_capacity_reading, tank_min_capacity_reading
                    FROM ln2_iot_devices WHERE tank_id = :tank_id LIMIT 1"""),
            {"tank_id": tank_id},
        ).first()
        if device and device[0] is not None and device[1] is not None:
            span = float(device[0]) - float(device[1])
            if span > 0:
                return span
        return None

    def _format_kpi_value(
        self, kpi_config, value: Optional[float], tank_id: Optional[int] = None
    ) -> str:
        """Render a reading for display, e.g. '-150.2°C'. Lid-state KPIs carry a boolean
        in kpi_value, so they render as OPEN/CLOSED rather than 1/0."""
        if value is None:
            return ""
        if kpi_config is not None and kpi_config.kpi_name in _LID_STATE_KPI_NAMES:
            return "OPEN" if value == 1 else "CLOSED"

        # ln2_level is stored in kg; recipients think in percent, matching the UI.
        if kpi_config is not None and kpi_config.kpi_name in _LN2_LEVEL_KPI_NAMES:
            span = self._ln2_usable_span(tank_id)
            if span:
                return f"{math.floor(float(value) / span * 100)}%"

        unit = (kpi_config.unit or "") if kpi_config is not None else ""
        return f"{round(value, 2)}{unit}"

    def _format_duration(self, seconds: float) -> str:
        """Render an elapsed span as '2HR', '45MIN' or '2HR 15MIN'."""
        total_minutes = max(0, int(seconds // 60))
        hours, minutes = divmod(total_minutes, 60)
        if hours and minutes:
            return f"{hours}h {minutes}m"
        if hours:
            return f"{hours}h"
        return f"{minutes}m"

    def _hospital_push_configured(self, hospital_id: Optional[int]) -> bool:
        """Push stays a hospital-wide toggle (unlike email/whatsapp, which are
        per-KPI-config) — see Hospital.is_push_notify."""
        if hospital_id is None:
            return False

        push_enabled = (
            self.db.query(Hospital.is_push_notify)
            .filter(Hospital.hospital_id == hospital_id)
            .scalar()
        )
        return bool(push_enabled)

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
    ) -> tuple[CriticalAlert, bool]:
        """Create a new alert if it doesn't already exist (using dedup_key).

        Returns (alert, created) where created is True only when a new row was
        inserted. Callers must gate notifications on created to avoid re-sending
        for an alert that already exists (the concurrency de-dup path)."""
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
            return existing_alert, False

        tank = self.db.query(Tank).filter(Tank.tank_id == tank_id).first()
        tank_code = tank.tank_code if tank else None
        branch_name = None
        if branch_id is not None:
            branch = (
                self.db.query(HospitalBranch)
                .filter(HospitalBranch.branch_id == branch_id)
                .first()
            )
            branch_name = branch.branch_name if branch else None

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
            ActivityLogService(self.db).log_activity(
                action="alert.created",
                outcome=ActivityOutcome.SUCCESS.value,
                actor=build_system_actor("critical_alert"),
                target=build_target("tank", str(tank_id), tank_code),
                metadata={
                    "alert_id": alert.alert_id,
                    "alert_type": alert.alert_type,
                    "severity": alert.severity,
                    "message": message,
                    "tank_id": tank_id,
                    "tank_code": tank_code,
                    "branch_id": branch_id,
                    "branch_name": branch_name,
                },
            )
            return alert, True
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
                    return existing_alert, False
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
                    ActivityLogService(self.db).log_activity(
                        action="alert.created",
                        outcome=ActivityOutcome.SUCCESS.value,
                        actor=build_system_actor("critical_alert"),
                        target=build_target("tank", str(tank_id), tank_code),
                        metadata={
                            "alert_id": alert.alert_id,
                            "alert_type": alert.alert_type,
                            "severity": alert.severity,
                            "message": message,
                            "tank_id": tank_id,
                            "tank_code": tank_code,
                            "branch_id": branch_id,
                            "branch_name": branch_name,
                        },
                    )
                    return alert, True
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

        # Serialize concurrent /check_kpi runs for the same tank. Telemetry calls this
        # every ~5s while a deviation persists and the endpoint runs in a threadpool across
        # 2 workers, so without this the cooldown/dedup checks (which read committed state)
        # race and the same alert is emailed many times. A transaction-scoped advisory lock
        # auto-releases on commit/rollback; if another run holds it we skip — the next call
        # picks up any deviation left unchecked.
        if tank_id is not None:
            locked = self.db.execute(
                text("SELECT pg_try_advisory_xact_lock(:ns, :tank_id)"),
                {"ns": _ADVISORY_LOCK_NS_KPI, "tank_id": tank_id},
            ).scalar()
            if not locked:
                logger.info(
                    "check_kpi for tank_id=%s skipped; another run holds the advisory lock",
                    tank_id,
                )
                return []

        # Oldest first: only one alert is raised per kpi_config per run, so the row that
        # arrives first sets occurred_at. Without an explicit order Postgres returns heap
        # order, which shifts whenever a row is updated, and the alert lands on an
        # arbitrary reading instead of the one that started the excursion.
        deviations = (
            self.db.query(Readings)
            .filter(
                Readings.tank_id == tank_id,
                Readings.deviation == True,
                or_(Readings.checked.is_(None), Readings.checked == False),
            )
            .order_by(Readings.timestamp.asc())
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

            now = datetime.now(timezone.utc)
            # Use per-KPI configurable cooldown (default 60 minutes)
            cooldown_seconds = (
                int(kpi_config.cooldown_minutes) * 60
                if kpi_config.cooldown_minutes is not None
                else 3600
            )
            episode_start = self._episode_start(kpi_config.id, Readings.tank_id == tank_id)

            if kpi_config.kpi_name in _LID_STATE_KPI_NAMES and episode_start is not None:
                # Continuity is the span of the actual deviating readings — first open
                # reading to the latest one in this unbroken episode — not now-vs-start.
                # A single stale reading (device went silent after one "open") spans 0s
                # and must not page; only readings that genuinely persist open for the
                # tolerance window do.
                latest_deviation_ts = (
                    self.db.query(func.max(Readings.timestamp))
                    .filter(
                        Readings.tank_id == tank_id,
                        Readings.kpi_config_id == kpi_config.id,
                        Readings.deviation == True,
                        Readings.timestamp >= episode_start,
                    )
                    .scalar()
                )
                if latest_deviation_ts is not None and latest_deviation_ts.tzinfo is None:
                    latest_deviation_ts = latest_deviation_ts.replace(tzinfo=timezone.utc)
                continuity_seconds = (
                    (latest_deviation_ts - episode_start).total_seconds()
                    if latest_deviation_ts is not None
                    else 0.0
                )
                logger.info(
                    "%s continuity for kpi_config_id=%s: start_time=%s latest_reading=%s duration=%.0fs tolerance=%.0fs",
                    kpi_config.kpi_name,
                    kpi_config.id,
                    episode_start,
                    latest_deviation_ts,
                    continuity_seconds,
                    _LID_OPEN_TOLERANCE_SECONDS,
                )
                if continuity_seconds < _LID_OPEN_TOLERANCE_SECONDS:
                    logger.info(
                        "Skipping %s alert for kpi_config_id=%s; continuous deviation %.0fs below tolerance %.0fs",
                        kpi_config.kpi_name,
                        kpi_config.id,
                        continuity_seconds,
                        _LID_OPEN_TOLERANCE_SECONDS,
                    )
                    deviation.checked = True
                    checked_kpi_configs.append(kpi_config.id)
                    continue

            ## Check if last alert created for this config is not acknowledged and occurred within last 1 hour,
            # if yes skip creating new alert to avoid alert spam.
            # Use occurred_at for cooldown ordering to avoid reminder/ack updates
            # unintentionally resetting the cooldown window.
            last_activity_col = func.coalesce(
                CriticalAlert.created_at
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
            if last_alert:
                logger.info(
                    "Cooldown candidate for tank_id=%s kpi_config_id=%s: alert_id=%s status=%s dedup_key=%s occurred_at=%s created_at=%s updated_at=%s",
                    tank_id,
                    kpi_config.id,
                    last_alert.alert_id,
                    last_alert.status,
                    last_alert.dedup_key,
                    last_alert.occurred_at,
                    last_alert.created_at,
                    last_alert.updated_at,
                )

            # Ensure timezone-aware comparison using the most recent timestamp (updated_at or created_at)
            if last_alert:
                last_alert_time = last_alert.created_at
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
                            "Skipping alert creation for kpi_config_id=%s as last alert was created/updated within cooldown period (%s minutes) time_diff=%s seconds",
                            kpi_config.id,
                            kpi_config.cooldown_minutes,
                            time_diff,
                        )
                        deviation.checked = True
                        checked_kpi_configs.append(kpi_config.id)
                        continue

            # An alert already raised within the current episode means the condition never
            # cleared, so recipients get the continuation notice citing when it started
            # rather than a fresh "new alert". Status is deliberately not filtered — the
            # device condition is still live even if someone acknowledged an earlier alert.
            first_episode_alert = None
            if episode_start is not None:
                first_episode_alert = (
                    self.db.query(CriticalAlert)
                    .filter(
                        CriticalAlert.tank_id == tank_id,
                        CriticalAlert.alert_type == AlertType.DEVIATION_ALERT.value,
                        or_(
                            CriticalAlert.dedup_key.like(dedup_prefix),
                            CriticalAlert.dedup_key.like(f"{dedup_prefix}:%"),
                        ),
                        CriticalAlert.created_at >= episode_start,
                    )
                    .order_by(CriticalAlert.created_at.asc())
                    .first()
                )
            episode_first_alert_at = (
                first_episode_alert.created_at if first_episode_alert else None
            )

            # Readings.alert_id is stamped when an alert is raised, so this recovers the
            # exact measurement the first alert of the episode fired on.
            episode_first_value = None
            if first_episode_alert is not None:
                first_reading = (
                    self.db.query(Readings)
                    .filter(Readings.alert_id == first_episode_alert.alert_id)
                    .order_by(Readings.timestamp.asc())
                    .first()
                )
                if first_reading is not None:
                    episode_first_value = self._format_kpi_value(
                        kpi_config, first_reading.kpi_value, tank_id=tank_id
                    )

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
            if kpi_config.kpi_name in _LID_STATE_KPI_NAMES:
                message = f"{kpi_config.alert_name} is {'OPEN' if deviation.kpi_value == 1 else 'CLOSED'} in {branch_name} branch for {tank_code} tank"

            if kpi_config.kpi_name == "ln2_level":
                message = f"{kpi_config.alert_name} crossed L2 in {branch_name} branch for {tank_code} tank"

            alert, created = self._create_alert(
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

            # Per-KPI notification channels (kpi_config.email_alert / whatsapp_alert).
            if kpi_config.email_alert:
                if kpi_config.unack_escalation_threshold is not None:
                    # Escalation mode: initial alert goes to branch users only.
                    # Admins/Managers are notified when unack_escalation_threshold is reached.
                    self._send_alert_email_to_users_only(
                        alert,
                        alert_name=kpi_config.alert_name,
                        kpi_name=kpi_config.kpi_name,
                        first_alert_at=episode_first_alert_at,
                        first_alert_value=episode_first_value,
                        current_value=self._format_kpi_value(
                            kpi_config, deviation.kpi_value, tank_id=tank_id
                        ),
                    )
                else:
                    # Original behavior: Managers + Admins + branch Users all notified.
                    self._send_alert_email(
                        alert,
                        alert_name=kpi_config.alert_name,
                        kpi_name=kpi_config.kpi_name,
                        first_alert_at=episode_first_alert_at,
                        first_alert_value=episode_first_value,
                        current_value=self._format_kpi_value(
                            kpi_config, deviation.kpi_value, tank_id=tank_id
                        ),
                    )
            else:
                logger.info(
                    "Skipping email for alert_id=%s because kpi_config_id=%s has email_alert disabled",
                    alert.alert_id,
                    kpi_config.id,
                )
            if kpi_config.whatsapp_alert:
                self._send_alert_whatsapp(alert, kpi_config=kpi_config, kpi_value=deviation.kpi_value)
            else:
                logger.info(
                    "Skipping WhatsApp for alert_id=%s because kpi_config_id=%s has whatsapp_alert disabled",
                    alert.alert_id,
                    kpi_config.id,
                )

            # Push stays hospital-wide (Hospital.is_push_notify) and gated on `created` —
            # unlike email/whatsapp above it has no cooldown-driven re-notify design of its
            # own, only a per-alert-id Redis dedup guard for concurrent-worker safety.
            if created:
                if self._hospital_push_configured(alert.hospital_id):
                    self._send_alert_push(alert)
                else:
                    logger.info(
                        "Skipping push for alert_id=%s because hospital_id=%s has push notifications disabled",
                        alert.alert_id,
                        alert.hospital_id,
                    )

            # Escalation check: fires a background email to Admins/Managers when N
            # consecutive unacknowledged alerts exist for this KPI. Only evaluate when a
            # new alert was added — a returned-existing alert did not change the count.
            if created and kpi_config.unack_escalation_threshold is not None:
                if self._check_escalation_needed(kpi_config, tank_id):
                    dedup_prefix = f"{tank_id}:{AlertSource.KPI.value}:{AlertType.DEVIATION_ALERT.value}:%:{kpi_config.id}"
                    unack_alerts = (
                        self.db.query(CriticalAlert)
                        .filter(
                            CriticalAlert.tank_id == tank_id,
                            CriticalAlert.alert_type == AlertType.DEVIATION_ALERT.value,
                            or_(
                                CriticalAlert.dedup_key.like(dedup_prefix),
                                CriticalAlert.dedup_key.like(f"{dedup_prefix}:%"),
                            ),
                            CriticalAlert.status == AlertStatus.ACTIVE.value,
                        )
                        .order_by(CriticalAlert.created_at.desc())
                        .all()
                    )
                    kpi_cfg_id = kpi_config.id
                    alerts_snapshot = list(unack_alerts)
                    count = len(alerts_snapshot)

                    def _escalation_bg(
                        kpi_id=kpi_cfg_id, tid=tank_id, c=count, a=alerts_snapshot
                    ):
                        bg_db = SessionLocal()
                        try:
                            bg_kpi = (
                                bg_db.query(KpiConfig)
                                .filter(KpiConfig.id == kpi_id)
                                .first()
                            )
                            if bg_kpi:
                                CriticalAlertService(bg_db)._send_escalation_email_to_admins(
                                    bg_kpi, tid, c, a
                                )
                                bg_db.commit()
                        except Exception as exc:
                            logger.error(
                                "Escalation email failed for kpi_config_id=%s: %s",
                                kpi_id, exc, exc_info=True,
                            )
                        finally:
                            bg_db.close()

                    threading.Thread(target=_escalation_bg, daemon=True).start()
                    logger.info(
                        "Started escalation email thread for kpi_config_id=%s tank_id=%s (%s unacknowledged)",
                        kpi_config.id, tank_id, count,
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

    def _get_refrigerator_hospital_branch(self, refrigerator_id: int) -> tuple:
        """Get hospital_id and branch_id for a refrigerator."""
        refrigerator = self.db.query(Refrigerator).filter(
            Refrigerator.refrigerator_id == refrigerator_id
        ).first()
        if not refrigerator:
            raise ValueError(f"Refrigerator {refrigerator_id} not found")
        return refrigerator.hospital_id, refrigerator.branch_id

    def _create_refrigerator_alert(
        self,
        refrigerator_id: int,
        zone_id: Optional[str],
        alert_type: AlertType,
        source: AlertSource,
        severity: AlertSeverity,
        message: str,
        occurred_at: datetime,
        triggered_by: AlertTriggeredBy = AlertTriggeredBy.SYSTEM,
        extra_info: Optional[str] = None,
    ) -> tuple[CriticalAlert, bool]:
        """Create a new refrigerator alert if it doesn't already exist (using dedup_key).
        Returns (alert, created) — created=False means an existing ACTIVE row was
        reused, so callers must not re-send notifications for it."""
        hospital_id, branch_id = self._get_refrigerator_hospital_branch(refrigerator_id)

        zone_part = zone_id or "all"
        timestamp_str = occurred_at.strftime("%Y-%m-%d_%H:%M:%S")
        dedup_key = f"refrigerator:{refrigerator_id}:{zone_part}:{source.value}:{alert_type.value}:{timestamp_str}:{extra_info or ''}"

        existing_alert = (
            self.db.query(CriticalAlert)
            .filter(
                CriticalAlert.dedup_key == dedup_key,
                CriticalAlert.status == AlertStatus.ACTIVE.value,
            )
            .first()
        )
        if existing_alert:
            existing_alert.occurred_at = occurred_at
            existing_alert.updated_at = datetime.now(timezone.utc)
            return existing_alert, False

        refrigerator = self.db.query(Refrigerator).filter(
            Refrigerator.refrigerator_id == refrigerator_id
        ).first()
        refrigerator_code = refrigerator.refrigerator_code if refrigerator else None

        try:
            alert = CriticalAlert(
                alert_id=str(uuid.uuid4()),
                refrigerator_id=refrigerator_id,
                zone_id=zone_id,
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
            ActivityLogService(self.db).log_activity(
                action="alert.created",
                outcome=ActivityOutcome.SUCCESS.value,
                actor=build_system_actor("critical_alert"),
                target=build_target("refrigerator", str(refrigerator_id), refrigerator_code),
                metadata={
                    "alert_id": alert.alert_id,
                    "alert_type": alert.alert_type,
                    "severity": alert.severity,
                    "message": message,
                    "refrigerator_id": refrigerator_id,
                    "refrigerator_code": refrigerator_code,
                    "zone_id": zone_id,
                    "branch_id": branch_id,
                },
            )
            return alert, True
        except IntegrityError as e:
            if isinstance(e.orig, UniqueViolation) and "dedup_key" in str(e.orig):
                logger.info(
                    f"Refrigerator alert with dedup_key={dedup_key} already exists (race condition), fetching existing"
                )
                self.db.rollback()
                existing_alert = (
                    self.db.query(CriticalAlert)
                    .filter(
                        CriticalAlert.dedup_key == dedup_key,
                        CriticalAlert.status == AlertStatus.ACTIVE.value,
                    )
                    .first()
                )
                if existing_alert:
                    existing_alert.occurred_at = occurred_at
                    existing_alert.updated_at = datetime.now(timezone.utc)
                    self.db.flush()
                    return existing_alert, False
            raise

    def check_and_create_alert_for_refrigerator_kpi_deviations(
        self,
        refrigerator_id: int,
        zone_id: Optional[str] = None,
    ) -> list[dict]:
        """
        Check the readings table for unchecked KPI deviations on a refrigerator zone
        and create CriticalAlert records for each confirmed deviation.
        """
        query = self.db.query(Readings).filter(
            Readings.refrigerator_id == refrigerator_id,
            Readings.deviation == True,
            or_(Readings.checked.is_(None), Readings.checked == False),
        )
        if zone_id is not None:
            query = query.filter(Readings.zone_id == zone_id)
        deviations = query.all()

        logger.info(
            "Deviation count for refrigerator_id=%s zone_id=%s: %s",
            refrigerator_id,
            zone_id,
            len(deviations),
        )

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
            if not kpi_config or kpi_config.id in checked_kpi_configs:
                deviation.checked = True
                continue

            now = datetime.now(timezone.utc)
            cooldown_seconds = (
                int(kpi_config.cooldown_minutes) * 60
                if kpi_config.cooldown_minutes is not None
                else 3600
            )

            # Dedup prefix: refrigerator variant keyed by refrigerator_id and kpi_config_id
            zone_part = zone_id or "all"
            dedup_prefix = (
                f"refrigerator:{refrigerator_id}:{zone_part}"
                f":{AlertSource.KPI.value}:{AlertType.DEVIATION_ALERT.value}:%:{kpi_config.id}"
            )
            last_alert = (
                self.db.query(CriticalAlert)
                .filter(
                    CriticalAlert.refrigerator_id == refrigerator_id,
                    CriticalAlert.alert_type == AlertType.DEVIATION_ALERT.value,
                    or_(
                        CriticalAlert.dedup_key.like(dedup_prefix),
                        CriticalAlert.dedup_key.like(f"{dedup_prefix}:%"),
                    ),
                    CriticalAlert.status != AlertStatus.ACKNOWLEDGED.value,
                )
                .order_by(CriticalAlert.created_at.desc())
                .first()
            )

            if last_alert:
                last_alert_time = last_alert.created_at
                if last_alert_time:
                    last_alert_time = (
                        last_alert_time
                        if last_alert_time.tzinfo
                        else last_alert_time.replace(tzinfo=timezone.utc)
                    )
                    if abs((now - last_alert_time).total_seconds()) < cooldown_seconds:
                        logger.info(
                            "Skipping refrigerator alert for kpi_config_id=%s within cooldown (%s min)",
                            kpi_config.id,
                            kpi_config.cooldown_minutes,
                        )
                        deviation.checked = True
                        checked_kpi_configs.append(kpi_config.id)
                        continue

            # Episode tracking, mirroring the tank path: an alert already raised since
            # the last clearing reading means the condition never recovered, so
            # recipients get the continuation notice instead of a fresh alert.
            device_filters = [Readings.refrigerator_id == refrigerator_id]
            if zone_id is not None:
                device_filters.append(Readings.zone_id == zone_id)
            episode_start = self._episode_start(kpi_config.id, *device_filters)

            first_episode_alert = None
            if episode_start is not None:
                first_episode_alert = (
                    self.db.query(CriticalAlert)
                    .filter(
                        CriticalAlert.refrigerator_id == refrigerator_id,
                        CriticalAlert.alert_type == AlertType.DEVIATION_ALERT.value,
                        or_(
                            CriticalAlert.dedup_key.like(dedup_prefix),
                            CriticalAlert.dedup_key.like(f"{dedup_prefix}:%"),
                        ),
                        CriticalAlert.created_at >= episode_start,
                    )
                    .order_by(CriticalAlert.created_at.asc())
                    .first()
                )
            episode_first_alert_at = (
                first_episode_alert.created_at if first_episode_alert else None
            )
            episode_first_value = None
            if first_episode_alert is not None:
                first_reading = (
                    self.db.query(Readings)
                    .filter(Readings.alert_id == first_episode_alert.alert_id)
                    .order_by(Readings.timestamp.asc())
                    .first()
                )
                if first_reading is not None:
                    episode_first_value = self._format_kpi_value(
                        kpi_config, first_reading.kpi_value
                    )

            branch_name = (
                self.db.query(HospitalBranch.branch_name)
                .filter(HospitalBranch.branch_id == deviation.branch_id)
                .scalar()
            )
            refrigerator = self.db.query(Refrigerator).filter(
                Refrigerator.refrigerator_id == refrigerator_id
            ).first()
            refrigerator_code = refrigerator.refrigerator_code if refrigerator else str(refrigerator_id)

            message = (
                f"{kpi_config.alert_name} is deviated to {round(deviation.kpi_value, 2)}"
                f" in {branch_name} branch for refrigerator {refrigerator_code}"
                + (f" zone {zone_id}" if zone_id else "")
            )

            alert, created = self._create_refrigerator_alert(
                refrigerator_id=refrigerator_id,
                zone_id=zone_id,
                alert_type=AlertType.DEVIATION_ALERT,
                source=AlertSource.KPI,
                severity=AlertSeverity.LOW if kpi_config.alert_type == "soft" else AlertSeverity.HIGH,
                message=message,
                occurred_at=deviation.timestamp,
                triggered_by=AlertTriggeredBy.SYSTEM,
                extra_info=str(kpi_config.id),
            )

            if kpi_config.email_alert:
                if kpi_config.unack_escalation_threshold is not None:
                    self._send_alert_email_to_users_only(
                        alert,
                        alert_name=kpi_config.alert_name,
                        kpi_name=kpi_config.kpi_name,
                        first_alert_at=episode_first_alert_at,
                        first_alert_value=episode_first_value,
                        current_value=self._format_kpi_value(kpi_config, deviation.kpi_value),
                    )
                else:
                    self._send_alert_email(
                        alert,
                        alert_name=kpi_config.alert_name,
                        kpi_name=kpi_config.kpi_name,
                        first_alert_at=episode_first_alert_at,
                        first_alert_value=episode_first_value,
                        current_value=self._format_kpi_value(kpi_config, deviation.kpi_value),
                    )
            else:
                logger.info(
                    "Skipping email for alert_id=%s because kpi_config_id=%s has email_alert disabled",
                    alert.alert_id,
                    kpi_config.id,
                )
            if kpi_config.whatsapp_alert:
                self._send_alert_whatsapp(alert, kpi_config=kpi_config, kpi_value=deviation.kpi_value)
            else:
                logger.info(
                    "Skipping WhatsApp for alert_id=%s because kpi_config_id=%s has whatsapp_alert disabled",
                    alert.alert_id,
                    kpi_config.id,
                )

            # Push stays hospital-wide (Hospital.is_push_notify) and gated on `created` —
            # mirrors the tank path; unlike email/whatsapp it has no cooldown-driven
            # re-notify design of its own, only a per-alert-id Redis dedup guard.
            if created:
                if self._hospital_push_configured(alert.hospital_id):
                    self._send_alert_push(alert)
                else:
                    logger.info(
                        "Skipping push for alert_id=%s because hospital_id=%s has push notifications disabled",
                        alert.alert_id,
                        alert.hospital_id,
                    )

            if created and kpi_config.unack_escalation_threshold is not None:
                if self._check_refrigerator_escalation_needed(kpi_config, refrigerator_id, zone_id):
                    unack_alerts = (
                        self.db.query(CriticalAlert)
                        .filter(
                            CriticalAlert.refrigerator_id == refrigerator_id,
                            CriticalAlert.alert_type == AlertType.DEVIATION_ALERT.value,
                            or_(
                                CriticalAlert.dedup_key.like(dedup_prefix),
                                CriticalAlert.dedup_key.like(f"{dedup_prefix}:%"),
                            ),
                            CriticalAlert.status == AlertStatus.ACTIVE.value,
                        )
                        .order_by(CriticalAlert.created_at.desc())
                        .all()
                    )
                    kpi_cfg_id = kpi_config.id
                    alerts_snapshot = list(unack_alerts)
                    count = len(alerts_snapshot)

                    def _escalation_bg(
                        kpi_id=kpi_cfg_id, rid=refrigerator_id, zid=zone_id, c=count, a=alerts_snapshot
                    ):
                        bg_db = SessionLocal()
                        try:
                            bg_kpi = bg_db.query(KpiConfig).filter(KpiConfig.id == kpi_id).first()
                            if bg_kpi:
                                CriticalAlertService(bg_db)._send_refrigerator_escalation_email_to_admins(
                                    bg_kpi, rid, zid, c, a
                                )
                                bg_db.commit()
                        except Exception as exc:
                            logger.error(
                                "Refrigerator escalation email failed for kpi_config_id=%s: %s",
                                kpi_id, exc, exc_info=True,
                            )
                        finally:
                            bg_db.close()

                    threading.Thread(target=_escalation_bg, daemon=True).start()
                    logger.info(
                        "Started refrigerator escalation email thread for kpi_config_id=%s refrigerator_id=%s zone_id=%s (%s unacknowledged)",
                        kpi_config.id, refrigerator_id, zone_id, count,
                    )

            deviation.alert_id = alert.alert_id
            deviation.checked = True
            checked_kpi_configs.append(kpi_config.id)
            alerts_created.append(alert)

        logger.info(
            "Refrigerator alert creation complete for refrigerator_id=%s zone_id=%s: %s alert(s) created/updated",
            refrigerator_id,
            zone_id,
            len(alerts_created),
        )
        self.db.commit()
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

                    alert, _created = self._create_alert(
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

                    alert, _created = self._create_alert(
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
                alert, _created = self._create_alert(
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
                    bg_service = CriticalAlertService(bg_db)
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
                                and alert_refreshed.tank_id is not None
                                and bg_service._tank_has_email_alert_enabled(alert_refreshed.tank_id)
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

    def _resolve_alert_email_context(self, alert: CriticalAlert):
        """Resolve the device + branch presentation fields shared by the alert-email
        senders. Returns (branch, ctx) or (None, None) when the alert cannot be emailed
        (unknown device, or the device/branch row is missing). ctx carries device_label,
        device_branch_id, device_noun, device_code, zone_name and is_cryotank."""
        if alert.tank_id:
            tank = self.db.query(Tank).filter(Tank.tank_id == alert.tank_id).first()
            if not tank:
                return None, None
            device_label = tank.tank_code or f"Tank-{tank.tank_id}"
            ctx = {
                "device_label": device_label,
                "device_branch_id": tank.branch_id,
                "device_noun": "Tank",
                "device_code": device_label,
                "zone_name": None,
                # Cryotank artwork belongs only on cryotank alerts; incubators and
                # refrigerators carry their own ids and must not show a tank picture.
                "is_cryotank": not (alert.incubator_id or alert.refrigerator_id),
            }
        elif alert.refrigerator_id:
            refrigerator = self.db.query(Refrigerator).filter(
                Refrigerator.refrigerator_id == alert.refrigerator_id
            ).first()
            if not refrigerator:
                return None, None
            label = refrigerator.refrigerator_code or f"Refrigerator-{refrigerator.refrigerator_id}"
            ctx = {
                "device_label": f"{label} {alert.zone_id}" if alert.zone_id else label,
                "device_branch_id": refrigerator.branch_id,
                "device_noun": "Refrigerator",
                "device_code": label,
                "zone_name": alert.zone_id,
                "is_cryotank": False,
            }
        else:
            return None, None

        branch = (
            self.db.query(HospitalBranch)
            .filter(HospitalBranch.branch_id == ctx["device_branch_id"])
            .first()
        )
        if not branch:
            return None, None
        return branch, ctx

    def _dispatch_alert_emails(
        self,
        alert: CriticalAlert,
        recipients,
        branch,
        ctx: dict,
        *,
        alert_name: Optional[str] = None,
        kpi_name: Optional[str] = None,
        first_alert_at: Optional[datetime] = None,
        first_alert_value: Optional[str] = None,
        current_value: Optional[str] = None,
        escalation_mode: bool = False,
    ):
        """Render the critical/continuation alert email once and send it to each recipient.
        Shared by _send_alert_email and _send_alert_email_to_users_only.

        When first_alert_at is supplied the condition has already been alerted on in this
        episode, so the continuation template is used instead of the new-alert one."""
        device_label = ctx["device_label"]
        is_cryotank = ctx["is_cryotank"]

        alerts_url = f"{settings.FRONTEND_URL}/dashboard?alert_id={alert.alert_id}"
        template_dir = Path(__file__).parent.parent.parent / "templates" / "emails"
        jinja_env = Environment(loader=FileSystemLoader(str(template_dir)))

        is_continuation = first_alert_at is not None
        template_name = (
            "critical_alert_continuation_email.html"
            if is_continuation
            else "critical_alert_email.html"
        )

        try:
            template = jinja_env.get_template(template_name)
        except Exception as e:
            logger.error(f"Failed to load {template_name}: {str(e)}")
            template = None

        first_alert_clock = ""
        first_alert_date = ""
        duration_text = ""
        current_at = ""
        alert_stage = "Alert Continuity" if is_continuation else "Alert Created"
        if is_continuation:
            first_alert_clock = self._format_ist_clock(first_alert_at)
            first_alert_date = self._format_ist_date(first_alert_at)
            started = (
                first_alert_at
                if first_alert_at.tzinfo
                else first_alert_at.replace(tzinfo=timezone.utc)
            )
            now_utc = datetime.now(timezone.utc)
            duration_text = self._format_duration((now_utc - started).total_seconds())
            current_at = f"{self._format_ist_clock(now_utc)}, {self._format_ist_date(now_utc)}"

        severity_class = "high-severity"
        if alert.severity == "Medium":
            severity_class = "medium-severity"
        elif alert.severity == "Low":
            severity_class = "low-severity"

        # The attachment set depends only on kpi_name/is_cryotank, so build it once
        # instead of re-scanning the asset directory for every recipient.
        inline_images = _inline_alert_images(kpi_name, include_tank=is_cryotank)

        for user in recipients:
            # Cross-process guard: claim this (alert, recipient) atomically so concurrent
            # runs / retries can never send the same alert to the same user twice. Fail-open
            # if Redis is unreachable — never drop a critical alert because the cache is down.
            dedup_key = f"alert:email:{alert.alert_id}:{user.user_id}"
            try:
                if not get_redis().set(dedup_key, 1, nx=True, ex=_EMAIL_DEDUP_TTL_SECONDS):
                    logger.info(
                        "Skipping duplicate email to %s for alert_id=%s (redis guard)",
                        user.email, alert.alert_id,
                    )
                    continue
            except Exception as exc:
                logger.warning(
                    "Redis email-dedup guard unavailable for alert_id=%s (%s); sending anyway",
                    alert.alert_id, exc,
                )
            try:
                if is_continuation:
                    subject = f"Alert Continuation: {alert.alert_type} ongoing for {duration_text} - {device_label}"
                else:
                    subject = f"Critical Alert: {alert.alert_type} - {alert.severity} Severity - {device_label}"
                ist = timezone(timedelta(hours=5, minutes=30))
                utc_time = alert.occurred_at.replace(tzinfo=timezone.utc)  # mark as UTC
                timestamp_string = utc_time.astimezone(ist).strftime(
                    "%Y-%m-%d %H:%M:%S IST"
                )
                if template:
                    html_body = template.render(
                        subject=subject,
                        logo_url="cid:mg_logo",
                        device_image_url="cid:mg_tank" if is_cryotank else "",
                        device_noun=ctx["device_noun"],
                        device_code=ctx["device_code"],
                        zone_name=ctx["zone_name"],
                        banner_url=f"{settings.FRONTEND_URL}{_EMAIL_BANNER_PATH}",
                        alert_type=alert.alert_type,
                        alert_name=alert_name or alert.alert_type,
                        severity=alert.severity,
                        tank_id=alert.tank_id,
                        tank_code=device_label,
                        branch_name=branch.branch_name or "N/A",
                        message=alert.message,
                        occurred_at=timestamp_string,
                        first_alert_at=first_alert_clock,
                        first_alert_date=first_alert_date,
                        current_at=current_at,
                        alert_stage=alert_stage,
                        first_alert_value=first_alert_value or "",
                        current_value=current_value or "",
                        duration_text=duration_text,
                        acknowledge_url=alerts_url,
                        severity_class=severity_class,
                    )
                else:
                    # Fallback to simple HTML if template fails
                    html_body = f"""
                    <html>
                    <body>
                        <h2>{"Alert Continuation" if is_continuation else "Critical Alert Notification"}</h2>
                        {f"<p>First {alert_name or alert.alert_type} alert is noted at {first_alert_clock} on {first_alert_date}{f' at {first_alert_value}' if first_alert_value else ''}, alert continued for {duration_text}{f', currently {current_value}' if current_value else ''}, kindly pay attention.</p>" if is_continuation else ""}
                        <p><strong>Alert Type:</strong> {alert.alert_type}</p>
                        <p><strong>Severity:</strong> {alert.severity}</p>
                        <p><strong>Device:</strong> {device_label}</p>
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

                send_email(user.email, subject, html_body, inline_images=inline_images)
                logger.info(
                    f"Sent alert email to {user.email} for alert_id={alert.alert_id}"
                )
                success_metadata = {
                    "recipient_email": user.email,
                    "recipient_user_id": user.user_id,
                    "email_subject": subject,
                    "email_message": alert.message,
                    "alert_id": alert.alert_id,
                    "alert_type": alert.alert_type,
                    "severity": alert.severity,
                    "message": alert.message,
                    "occurred_at": timestamp_string,
                    "tank_id": alert.tank_id,
                    "tank_code": device_label,
                    "branch_id": branch.branch_id if branch else None,
                    "branch_name": branch.branch_name if branch else None,
                }
                if escalation_mode:
                    success_metadata["escalation_mode"] = True
                ActivityLogService(self.db).log_activity(
                    action="email.critical_alert_sent",
                    outcome=ActivityOutcome.SUCCESS.value,
                    actor=build_system_actor("critical_alert"),
                    target=build_target("user", user.user_id, user.email),
                    metadata=success_metadata,
                )
            except Exception as e:
                logger.error(f"Failed to send alert email to {user.email}: {str(e)}")
                failure_metadata = {
                    "recipient_email": user.email,
                    "recipient_user_id": user.user_id,
                    "alert_id": alert.alert_id,
                    "alert_type": alert.alert_type,
                    "severity": alert.severity,
                    "message": alert.message,
                    "tank_id": alert.tank_id,
                    "tank_code": device_label,
                    "branch_id": branch.branch_id if branch else None,
                    "branch_name": branch.branch_name if branch else None,
                    "error": str(e),
                }
                if escalation_mode:
                    failure_metadata["escalation_mode"] = True
                ActivityLogService(self.db).log_activity(
                    action="email.critical_alert_sent",
                    outcome=ActivityOutcome.FAILURE.value,
                    actor=build_system_actor("critical_alert"),
                    target=build_target("user", user.user_id, user.email),
                    metadata=failure_metadata,
                )
                # Release the guard so a genuinely failed send can be retried before TTL.
                try:
                    get_redis().delete(dedup_key)
                except Exception:
                    pass

    def _send_alert_push(self, alert: CriticalAlert):
        """Send a web push notification for critical (High severity) alerts only.
        Same recipient set and Redis dedup pattern as _send_alert_email, gated
        additionally on each user's push_enabled flag and per-device enabled flag."""
        if alert.severity != AlertSeverity.HIGH.value:
            logger.debug(
                f"Skipping push for non-critical alert_id={alert.alert_id} (severity={alert.severity})"
            )
            return

        if not push_notifications_configured():
            logger.debug("Skipping push for alert_id=%s: VAPID keys not configured", alert.alert_id)
            return

        recipients = self._resolve_alert_recipients(alert)
        if not recipients:
            return
        all_users, branch, device_label = recipients

        alerts_url = f"{settings.FRONTEND_URL}/dashboard?alert_id={alert.alert_id}"

        for user in all_users:
            if not user.push_enabled:
                continue

            # Same cross-process guard as email, keyed to the push channel so email and
            # push dedup independently (a user could opt out of one and not the other).
            dedup_key = f"alert:push:{alert.alert_id}:{user.user_id}"
            try:
                if not get_redis().set(dedup_key, 1, nx=True, ex=_EMAIL_DEDUP_TTL_SECONDS):
                    logger.info(
                        "Skipping duplicate push to %s for alert_id=%s (redis guard)",
                        user.user_id, alert.alert_id,
                    )
                    continue
            except Exception as exc:
                logger.warning(
                    "Redis push-dedup guard unavailable for alert_id=%s (%s); sending anyway",
                    alert.alert_id, exc,
                )

            subscriptions = (
                self.db.query(PushSubscription)
                .filter(
                    PushSubscription.user_id == user.user_id,
                    PushSubscription.enabled == True,
                )
                .all()
            )
            if not subscriptions:
                continue

            payload = {
                "title": f"Critical Alert: {alert.alert_type} - {device_label}",
                "body": alert.message,
                "alert_id": alert.alert_id,
                "severity": alert.severity,
                "tag": alert.dedup_key,
                "url": alerts_url,
                "device_label": device_label,
                "occurred_at": alert.occurred_at.isoformat() if alert.occurred_at else None,
            }

            sent_any = False
            for subscription in subscriptions:
                if send_web_push(self.db, subscription, payload):
                    sent_any = True

            ActivityLogService(self.db).log_activity(
                action="push.critical_alert_sent",
                outcome=ActivityOutcome.SUCCESS.value if sent_any else ActivityOutcome.FAILURE.value,
                actor=build_system_actor("critical_alert"),
                target=build_target("user", user.user_id, user.email),
                metadata={
                    "recipient_user_id": user.user_id,
                    "alert_id": alert.alert_id,
                    "alert_type": alert.alert_type,
                    "severity": alert.severity,
                    "message": alert.message,
                    "branch_id": branch.branch_id if branch else None,
                    "branch_name": branch.branch_name if branch else None,
                    "subscription_count": len(subscriptions),
                },
            )
            if not sent_any:
                # Release the guard so a genuinely failed send can be retried before TTL.
                try:
                    get_redis().delete(dedup_key)
                except Exception:
                    pass

    def _send_alert_email(
        self,
        alert: CriticalAlert,
        *,
        alert_name: Optional[str] = None,
        kpi_name: Optional[str] = None,
        first_alert_at: Optional[datetime] = None,
        first_alert_value: Optional[str] = None,
        current_value: Optional[str] = None,
    ):
        """Send email notification for critical (High severity) alerts only.
        Recipients: all Managers across the hospital + Users in the tank's branch.

        When first_alert_at is supplied the condition has already been alerted on in this
        episode, so the continuation template is used instead of the new-alert one."""
        # Only send emails for critical (High severity) alerts
        if alert.severity != AlertSeverity.HIGH.value:
            logger.debug(
                f"Skipping email for non-critical alert_id={alert.alert_id} (severity={alert.severity})"
            )
            return

        branch, ctx = self._resolve_alert_email_context(alert)
        if branch is None:
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
                or_(
                    User.branch_id.in_(branch_ids),
                    and_(User.hospital_id == hospital_id, User.branch_id.is_(None)),
                ),
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
                User.branch_id == ctx["device_branch_id"],
                User.status == True,
                User.approved_status == ApprovalStatus.APPROVED,
            )
            .all()
        )

        all_users = list({user.user_id: user for user in managers + branch_users}.values())

        self._dispatch_alert_emails(
            alert,
            all_users,
            branch,
            ctx,
            alert_name=alert_name,
            kpi_name=kpi_name,
            first_alert_at=first_alert_at,
            first_alert_value=first_alert_value,
            current_value=current_value,
            escalation_mode=False,
        )

    def _send_alert_email_to_users_only(
        self,
        alert: CriticalAlert,
        *,
        alert_name: Optional[str] = None,
        kpi_name: Optional[str] = None,
        first_alert_at: Optional[datetime] = None,
        first_alert_value: Optional[str] = None,
        current_value: Optional[str] = None,
    ):
        """Send critical alert email to branch Users only (role=User).
        Used when escalation mode is active — Admins/Managers are notified separately once the
        unack_escalation_threshold is reached.

        When first_alert_at is supplied the condition has already been alerted on in this
        episode, so the continuation template is used instead of the new-alert one."""
        if alert.severity != AlertSeverity.HIGH.value:
            logger.debug(
                f"Skipping users-only email for non-critical alert_id={alert.alert_id} (severity={alert.severity})"
            )
            return

        branch, ctx = self._resolve_alert_email_context(alert)
        if branch is None:
            return

        branch_users = (
            self.db.query(User)
            .filter(
                User.department == "IVF",
                User.role == "User",
                User.branch_id == ctx["device_branch_id"],
                User.status == True,
                User.approved_status == ApprovalStatus.APPROVED,
            )
            .all()
        )

        if not branch_users:
            logger.info(
                "No branch users found for alert_id=%s branch_id=%s — skipping users-only alert email",
                alert.alert_id,
                ctx["device_branch_id"],
            )
            return

        self._dispatch_alert_emails(
            alert,
            branch_users,
            branch,
            ctx,
            alert_name=alert_name,
            kpi_name=kpi_name,
            first_alert_at=first_alert_at,
            first_alert_value=first_alert_value,
            current_value=current_value,
            escalation_mode=True,
        )

    def _send_alert_whatsapp(self, alert: CriticalAlert, *, kpi_config=None, kpi_value: Optional[float] = None):
        """Send WhatsApp notification via Twilio for critical (High severity) alerts only.
        Recipients: all Managers across the hospital + Users in the tank's branch."""
        if alert.severity != AlertSeverity.HIGH.value:
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
                or_(
                    User.branch_id.in_(branch_ids),
                    and_(User.hospital_id == hospital_id, User.branch_id.is_(None)),
                ),
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

        import json

        client = Client(account_sid, auth_token)
        from_whatsapp_number = _to_whatsapp_number(from_number)
        tank_code = tank.tank_code or f"Tank-{tank.tank_id}"
        branch_name = branch.branch_name or "N/A"

        kpi_name = kpi_config.kpi_name if kpi_config else None
        alert_name = (kpi_config.alert_name or kpi_name or alert.alert_type) if kpi_config else alert.alert_type

        if kpi_name in _LN2_LEVEL_KPI_NAMES:
            template_sid = _WA_TEMPLATE_LN2_LEVEL
            content_variables = {"1": alert_name, "2": branch_name, "3": tank_code}
        elif kpi_name in _LID_STATE_KPI_NAMES:
            lid_str = "OPEN" if kpi_value == 1 else "CLOSED"
            template_sid = _WA_TEMPLATE_LID_STATE
            content_variables = {"1": alert_name, "2": lid_str, "3": branch_name, "4": tank_code}
        elif kpi_name in _DEVIATION_KPI_NAMES:
            value_str = str(round(kpi_value, 2)) if kpi_value is not None else "N/A"
            template_sid = _WA_TEMPLATE_DEVIATION
            content_variables = {"1": alert_name, "2": value_str, "3": branch_name, "4": tank_code}
        else:
            logger.warning(
                "Unrecognised kpi_name=%s for alert_id=%s; skipping WhatsApp",
                kpi_name, alert.alert_id,
            )
            return

        role_group = lambda u: "user" if u.role == "User" else "admin"
        sent_groups: set = set()
        if kpi_config is not None and alert.occurred_at is not None:
            _aware = lambda ts: ts if ts.tzinfo else ts.replace(tzinfo=timezone.utc)
            current_ts = _aware(alert.occurred_at)
            latest_clear_reading = (
                self.db.query(Readings)
                .filter(
                    Readings.tank_id == alert.tank_id,
                    Readings.kpi_config_id == kpi_config.id,
                    Readings.deviation == False,
                )
                .order_by(Readings.timestamp.desc())
                .first()
            )
            clear_ts = _aware(latest_clear_reading.timestamp) if latest_clear_reading else None

            # Baseline per group = reading timestamp of the group's last delivered
            # WhatsApp (not the last alert — alerts whose WhatsApp was suppressed or
            # disabled must not slide the window forward). Missing/unreadable key
            # counts as never sent, so Redis outages can only over-notify.
            def _last_sent_from_redis(group: str):
                try:
                    v = get_redis().get(_wa_last_sent_key(kpi_config.id, group))
                    return datetime.fromisoformat(v) if v else None
                except Exception as exc:
                    logger.warning(
                        "Redis WhatsApp last-sent lookup failed for kpi_config_id=%s %s (%s); treating as fresh",
                        kpi_config.id, group, exc,
                    )
                    return None

            group_last_sent = {
                "user": _last_sent_from_redis("user"),
                "admin": _last_sent_from_redis("admin"),
            }
            group_cooldowns = {
                "user": _WA_USER_COOLDOWN_SECONDS,
                "admin": _WA_ADMIN_COOLDOWN_SECONDS,
            }
            skipped_groups: set = set()
            for group, last_sent in group_last_sent.items():
                if last_sent is None:
                    continue  # never messaged this group for this KPI — fresh
                last_sent = _aware(last_sent)
                if clear_ts is not None and clear_ts > last_sent:
                    continue  # KPI recovered since this group's last message — fresh
                elapsed = (current_ts - last_sent).total_seconds()
                if elapsed < group_cooldowns[group]:
                    skipped_groups.add(group)
                    logger.info(
                        "Skipping WhatsApp %s recipients for alert_id=%s kpi_config_id=%s: "
                        "last delivered %.0fs before this reading (cooldown=%ss)",
                        group, alert.alert_id, kpi_config.id, elapsed, group_cooldowns[group],
                    )
            recipients = [u for u in recipients if role_group(u) not in skipped_groups]
            if not recipients:
                return

        for user in recipients:
            try:
                to_number = _to_whatsapp_number(user.phone_number)
                msg = client.messages.create(
                    from_=from_whatsapp_number,
                    content_sid=template_sid,
                    content_variables=json.dumps(content_variables),
                    to=to_number,
                )
                logger.info(
                    "Sent WhatsApp alert to %s for alert_id=%s (template=%s twilio_sid=%s)",
                    to_number, alert.alert_id, template_sid, msg.sid,
                )
                sent_groups.add(role_group(user))
                ActivityLogService(self.db).log_activity(
                    action="whatsapp.critical_alert_sent",
                    outcome=ActivityOutcome.SUCCESS.value,
                    actor=build_system_actor("critical_alert"),
                    target=build_target("user", user.user_id, user.phone_number),
                    metadata={
                        "recipient_phone": user.phone_number,
                        "recipient_user_id": user.user_id,
                        "alert_id": alert.alert_id,
                        "alert_type": alert.alert_type,
                        "severity": alert.severity,
                        "message": alert.message,
                        "tank_id": alert.tank_id,
                        "tank_code": tank_code,
                        "branch_name": branch_name,
                        "template_sid": template_sid,
                        "twilio_sid": msg.sid,
                    },
                )
            except Exception as e:
                logger.error(
                    "Failed to send WhatsApp to %s for alert_id=%s: %s",
                    getattr(user, "phone_number", "unknown"),
                    alert.alert_id,
                    str(e),
                    exc_info=True,
                )
                ActivityLogService(self.db).log_activity(
                    action="whatsapp.critical_alert_sent",
                    outcome=ActivityOutcome.FAILURE.value,
                    actor=build_system_actor("critical_alert"),
                    target=build_target("user", user.user_id, getattr(user, "phone_number", None)),
                    metadata={
                        "recipient_phone": getattr(user, "phone_number", None),
                        "recipient_user_id": user.user_id,
                        "alert_id": alert.alert_id,
                        "alert_type": alert.alert_type,
                        "severity": alert.severity,
                        "message": alert.message,
                        "tank_id": alert.tank_id,
                        "tank_code": tank_code,
                        "branch_name": branch_name,
                        "template_sid": template_sid,
                        "error": str(e),
                    },
                )

        # Stamp the delivered groups with this reading's timestamp.
        if kpi_config is not None and alert.occurred_at is not None and sent_groups:
            occurred = alert.occurred_at if alert.occurred_at.tzinfo else alert.occurred_at.replace(tzinfo=timezone.utc)
            for group in sent_groups:
                try:
                    get_redis().set(
                        _wa_last_sent_key(kpi_config.id, group),
                        occurred.isoformat(),
                        # Key lives exactly as long as the group's window; once it
                        # expires the next alert is fresh by definition.
                        ex=_WA_USER_COOLDOWN_SECONDS if group == "user" else _WA_ADMIN_COOLDOWN_SECONDS,
                    )
                except Exception as exc:
                    logger.warning(
                        "Failed to store WhatsApp last-sent in Redis for kpi_config_id=%s %s: %s",
                        kpi_config.id, group, exc,
                    )

    def _check_escalation_needed(self, kpi_config, tank_id: int) -> bool:
        """Return True when N consecutive unacknowledged alerts exist for a KPI and the
        escalation cooldown has passed. Returns False if escalation is disabled (threshold=None)."""
        if kpi_config.unack_escalation_threshold is None:
            return False

        threshold = int(kpi_config.unack_escalation_threshold)
        dedup_prefix = f"{tank_id}:{AlertSource.KPI.value}:{AlertType.DEVIATION_ALERT.value}:%:{kpi_config.id}"

        unack_count = (
            self.db.query(CriticalAlert)
            .filter(
                CriticalAlert.tank_id == tank_id,
                CriticalAlert.alert_type == AlertType.DEVIATION_ALERT.value,
                or_(
                    CriticalAlert.dedup_key.like(dedup_prefix),
                    CriticalAlert.dedup_key.like(f"{dedup_prefix}:%"),
                ),
                CriticalAlert.status == AlertStatus.ACTIVE.value,
            )
            .count()
        )

        if unack_count <= threshold:
            logger.info(
                "Escalation not triggered for kpi_config_id=%s tank_id=%s: %s unacknowledged <= threshold %s",
                kpi_config.id, tank_id, unack_count, threshold,
            )
            return False

        # Spam gate: don't re-escalate within the same cooldown window used for alert creation.
        # Using cooldown_minutes directly (not multiplied by threshold) keeps escalation
        # cadence aligned with how frequently new alerts are created for this KPI.
        if kpi_config.last_escalation_sent_at is not None:
            last_sent = kpi_config.last_escalation_sent_at
            if not last_sent.tzinfo:
                last_sent = last_sent.replace(tzinfo=timezone.utc)
            cooldown_secs = (
                int(kpi_config.cooldown_minutes) * 60
                if kpi_config.cooldown_minutes is not None
                else 3600
            )
            elapsed = (datetime.now(timezone.utc) - last_sent).total_seconds()
            if elapsed < cooldown_secs:
                logger.info(
                    "Skipping escalation for kpi_config_id=%s; last sent %.0fs ago (cooldown=%.0fs)",
                    kpi_config.id, elapsed, cooldown_secs,
                )
                return False

        logger.info(
            "Escalation triggered for kpi_config_id=%s tank_id=%s: %s unacknowledged alerts >= threshold %s",
            kpi_config.id, tank_id, unack_count, threshold,
        )
        return True

    def _send_escalation_email_to_admins(
        self, kpi_config, tank_id: int, unack_count: int, alerts: list
    ):
        """Send escalation email to Admins and Managers when N unacknowledged KPI alerts exist.
        Updates kpi_config.last_escalation_sent_at — caller is responsible for db.commit()."""
        tank = self.db.query(Tank).filter(Tank.tank_id == tank_id).first()
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
        if not (kpi_config.email_alert or kpi_config.whatsapp_alert):
            logger.info(
                "Skipping escalation email — kpi_config_id=%s has no notification channel enabled", kpi_config.id
            )
            return

        all_branch_ids = [
            b.branch_id
            for b in self.db.query(HospitalBranch)
            .filter(HospitalBranch.hospital_id == hospital_id)
            .all()
        ]
        recipients = (
            self.db.query(User)
            .filter(
                User.department == "IVF",
                User.role.in_(["Manager", "Admin"]),
                User.branch_id.in_(all_branch_ids),
                User.status == True,
                User.approved_status == ApprovalStatus.APPROVED,
            )
            .all()
        )
        recipients = list({u.user_id: u for u in recipients}.values())

        if not recipients:
            logger.warning(
                "No admin/manager recipients for escalation — kpi_config_id=%s tank_id=%s",
                kpi_config.id, tank_id,
            )
            return

        tank_code = tank.tank_code or f"Tank-{tank_id}"
        acknowledge_url = f"{settings.FRONTEND_URL}/dashboard"
        template_dir = Path(__file__).parent.parent.parent / "templates" / "emails"
        jinja_env = Environment(loader=FileSystemLoader(str(template_dir)))

        try:
            template = jinja_env.get_template("kpi_escalation_email.html")
        except Exception as e:
            logger.error(f"Failed to load escalation email template: {str(e)}")
            template = None

        ist = timezone(timedelta(hours=5, minutes=30))
        alert_data = []
        for a in alerts:
            try:
                utc_ts = a.occurred_at.replace(tzinfo=timezone.utc)
                hours_since = int((datetime.now(timezone.utc) - utc_ts).total_seconds() / 3600)
                alert_data.append({
                    "alert_id": a.alert_id,
                    "severity": a.severity,
                    "message": a.message,
                    "occurred_at": utc_ts.astimezone(ist).strftime("%Y-%m-%d %H:%M:%S IST"),
                    "hours_since": hours_since,
                })
            except Exception:
                pass

        subject = (
            f"Escalation: {unack_count} Unacknowledged Alerts — "
            f"{kpi_config.alert_name or kpi_config.kpi_name} — {tank_code}"
        )

        for user in recipients:
            try:
                if template:
                    html_body = template.render(
                        subject=subject,
                        kpi_name=kpi_config.alert_name or kpi_config.kpi_name,
                        tank_code=tank_code,
                        branch_name=branch.branch_name or "N/A",
                        unack_count=unack_count,
                        threshold=kpi_config.unack_escalation_threshold,
                        alerts=alert_data,
                        acknowledge_url=acknowledge_url,
                    )
                else:
                    alert_rows = "".join(
                        f"<li>{a['occurred_at']} — {a['message']}</li>" for a in alert_data
                    )
                    html_body = f"""
                    <html><body>
                        <h2>Escalation: {unack_count} Unacknowledged Alerts</h2>
                        <p><strong>KPI:</strong> {kpi_config.alert_name or kpi_config.kpi_name}</p>
                        <p><strong>Tank:</strong> {tank_code} — {branch.branch_name or "N/A"}</p>
                        <p><strong>Threshold:</strong> {kpi_config.unack_escalation_threshold} consecutive unacknowledged alerts</p>
                        <ul>{alert_rows}</ul>
                        <a href="{acknowledge_url}">View &amp; Acknowledge</a>
                    </body></html>
                    """

                send_email(user.email, subject, html_body)
                logger.info(
                    "Sent escalation email to %s for kpi_config_id=%s tank_id=%s",
                    user.email, kpi_config.id, tank_id,
                )
                ActivityLogService(self.db).log_activity(
                    action="email.escalation_sent",
                    outcome=ActivityOutcome.SUCCESS.value,
                    actor=build_system_actor("critical_alert"),
                    target=build_target("user", user.user_id, user.email),
                    metadata={
                        "recipient_email": user.email,
                        "recipient_user_id": user.user_id,
                        "kpi_config_id": kpi_config.id,
                        "kpi_name": kpi_config.kpi_name,
                        "tank_id": tank_id,
                        "tank_code": tank_code,
                        "unack_count": unack_count,
                        "threshold": kpi_config.unack_escalation_threshold,
                    },
                )
            except Exception as e:
                logger.error(
                    "Failed to send escalation email to %s: %s", user.email, str(e)
                )

        kpi_config.last_escalation_sent_at = datetime.now(timezone.utc)

    def _check_refrigerator_escalation_needed(
        self, kpi_config, refrigerator_id: int, zone_id: Optional[str]
    ) -> bool:
        """Return True when N consecutive unacknowledged alerts exist for a refrigerator KPI
        and the escalation cooldown has passed."""
        if kpi_config.unack_escalation_threshold is None:
            return False

        threshold = int(kpi_config.unack_escalation_threshold)
        zone_part = zone_id or "all"
        dedup_prefix = (
            f"refrigerator:{refrigerator_id}:{zone_part}"
            f":{AlertSource.KPI.value}:{AlertType.DEVIATION_ALERT.value}:%:{kpi_config.id}"
        )

        unack_count = (
            self.db.query(CriticalAlert)
            .filter(
                CriticalAlert.refrigerator_id == refrigerator_id,
                CriticalAlert.alert_type == AlertType.DEVIATION_ALERT.value,
                or_(
                    CriticalAlert.dedup_key.like(dedup_prefix),
                    CriticalAlert.dedup_key.like(f"{dedup_prefix}:%"),
                ),
                CriticalAlert.status == AlertStatus.ACTIVE.value,
            )
            .count()
        )

        if unack_count <= threshold:
            logger.info(
                "Escalation not triggered for kpi_config_id=%s refrigerator_id=%s zone_id=%s: %s unacknowledged <= threshold %s",
                kpi_config.id, refrigerator_id, zone_id, unack_count, threshold,
            )
            return False

        if kpi_config.last_escalation_sent_at is not None:
            last_sent = kpi_config.last_escalation_sent_at
            if not last_sent.tzinfo:
                last_sent = last_sent.replace(tzinfo=timezone.utc)
            cooldown_secs = (
                int(kpi_config.cooldown_minutes) * 60
                if kpi_config.cooldown_minutes is not None
                else 3600
            )
            elapsed = (datetime.now(timezone.utc) - last_sent).total_seconds()
            if elapsed < cooldown_secs:
                logger.info(
                    "Skipping refrigerator escalation for kpi_config_id=%s; last sent %.0fs ago (cooldown=%.0fs)",
                    kpi_config.id, elapsed, cooldown_secs,
                )
                return False

        logger.info(
            "Escalation triggered for kpi_config_id=%s refrigerator_id=%s zone_id=%s: %s unacknowledged >= threshold %s",
            kpi_config.id, refrigerator_id, zone_id, unack_count, threshold,
        )
        return True

    def _send_refrigerator_escalation_email_to_admins(
        self,
        kpi_config,
        refrigerator_id: int,
        zone_id: Optional[str],
        unack_count: int,
        alerts: list,
    ):
        """Send escalation email to Admins and Managers when N unacknowledged refrigerator KPI
        alerts exist. Updates kpi_config.last_escalation_sent_at — caller commits."""
        refrigerator = self.db.query(Refrigerator).filter(
            Refrigerator.refrigerator_id == refrigerator_id
        ).first()
        if not refrigerator:
            return

        branch = (
            self.db.query(HospitalBranch)
            .filter(HospitalBranch.branch_id == refrigerator.branch_id)
            .first()
        )
        if not branch:
            return

        hospital_id = refrigerator.hospital_id
        if not (kpi_config.email_alert or kpi_config.whatsapp_alert):
            logger.info(
                "Skipping refrigerator escalation email — kpi_config_id=%s has no notification channel enabled",
                kpi_config.id,
            )
            return

        all_branch_ids = [
            b.branch_id
            for b in self.db.query(HospitalBranch)
            .filter(HospitalBranch.hospital_id == hospital_id)
            .all()
        ]
        recipients = (
            self.db.query(User)
            .filter(
                User.department == "IVF",
                User.role.in_(["Manager", "Admin"]),
                User.branch_id.in_(all_branch_ids),
                User.status.is_(True),
                User.approved_status == ApprovalStatus.APPROVED,
            )
            .all()
        )
        recipients = list({u.user_id: u for u in recipients}.values())

        if not recipients:
            logger.warning(
                "No admin/manager recipients for refrigerator escalation — kpi_config_id=%s refrigerator_id=%s",
                kpi_config.id, refrigerator_id,
            )
            return

        label = refrigerator.refrigerator_code or f"Refrigerator-{refrigerator_id}"
        device_label = f"{label} {zone_id}" if zone_id else label
        acknowledge_url = f"{settings.FRONTEND_URL}/dashboard"
        template_dir = Path(__file__).parent.parent.parent / "templates" / "emails"
        jinja_env = Environment(loader=FileSystemLoader(str(template_dir)))

        try:
            template = jinja_env.get_template("escalation_alert_email.html")
        except Exception:
            template = None

        subject = (
            f"Escalation: {unack_count} Unacknowledged Alerts — "
            f"{kpi_config.alert_name or kpi_config.kpi_name} — {device_label}"
        )
        alert_data = [
            {
                "occurred_at": str(a.occurred_at),
                "message": a.message,
                "alert_id": a.alert_id,
            }
            for a in alerts
        ]

        for user in recipients:
            try:
                if template:
                    html_body = template.render(
                        subject=subject,
                        kpi_name=kpi_config.alert_name or kpi_config.kpi_name,
                        tank_code=device_label,
                        branch_name=branch.branch_name or "N/A",
                        unack_count=unack_count,
                        threshold=kpi_config.unack_escalation_threshold,
                        alerts=alert_data,
                        acknowledge_url=acknowledge_url,
                    )
                else:
                    alert_rows = "".join(
                        f"<li>{a['occurred_at']} — {a['message']}</li>" for a in alert_data
                    )
                    html_body = f"""
                    <html><body>
                        <h2>Escalation: {unack_count} Unacknowledged Alerts</h2>
                        <p><strong>KPI:</strong> {kpi_config.alert_name or kpi_config.kpi_name}</p>
                        <p><strong>Device:</strong> {device_label} — {branch.branch_name or "N/A"}</p>
                        <p><strong>Threshold:</strong> {kpi_config.unack_escalation_threshold} consecutive unacknowledged alerts</p>
                        <ul>{alert_rows}</ul>
                        <a href="{acknowledge_url}">View &amp; Acknowledge</a>
                    </body></html>
                    """

                send_email(user.email, subject, html_body)
                logger.info(
                    "Sent refrigerator escalation email to %s for kpi_config_id=%s refrigerator_id=%s",
                    user.email, kpi_config.id, refrigerator_id,
                )
                ActivityLogService(self.db).log_activity(
                    action="email.escalation_sent",
                    outcome=ActivityOutcome.SUCCESS.value,
                    actor=build_system_actor("critical_alert"),
                    target=build_target("user", user.user_id, user.email),
                    metadata={
                        "recipient_email": user.email,
                        "recipient_user_id": user.user_id,
                        "kpi_config_id": kpi_config.id,
                        "kpi_name": kpi_config.kpi_name,
                        "refrigerator_id": refrigerator_id,
                        "zone_id": zone_id,
                        "device_label": device_label,
                        "unack_count": unack_count,
                        "threshold": kpi_config.unack_escalation_threshold,
                    },
                )
            except Exception as e:
                logger.error(
                    "Failed to send refrigerator escalation email to %s: %s", user.email, str(e)
                )

        kpi_config.last_escalation_sent_at = datetime.now(timezone.utc)

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
                            or_(
                                User.branch_id.in_(branch_ids),
                                and_(User.hospital_id == hospital_id, User.branch_id.is_(None)),
                            ),
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
                                    violation_type=email_data["violation_type"],
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
        violation_type: Optional[str] = None,
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
            violation_type: Internal violation label (e.g. "shock") used to pick the callout icon
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

        # Attachment set is identical for every recipient; build it once, with the icon
        # matching this violation's KPI rather than always defaulting to a thermometer.
        immediate_inline_images = _inline_alert_images(
            _IMMEDIATE_VIOLATION_ICON_KPI.get(violation_type)
        )

        for user in recipients:
            try:
                if template:
                    html_body = template.render(
                        subject=subject,
                        logo_url="cid:mg_logo",
                        device_image_url="cid:mg_tank",
                        banner_url=f"{settings.FRONTEND_URL}{_EMAIL_BANNER_PATH}",
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
                send_email(user.email, subject, html_body, inline_images=immediate_inline_images)
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

    def get_incubator_alerts(
        self,
        incubator_id: int,
        chamber_id: Optional[str] = None,
        branch_id: Optional[int] = None,
        hospital_id: Optional[int] = None,
    ) -> IncubatorAlertsResponse:
        """Get all alerts for a specific incubator, optionally filtered by chamber."""
        incubator_query = self.db.query(Incubator).filter(Incubator.incubator_id == incubator_id)
        if hospital_id is not None:
            incubator_query = incubator_query.filter(Incubator.hospital_id == hospital_id)
        if branch_id is not None:
            incubator_query = incubator_query.filter(Incubator.branch_id == branch_id)
        incubator = incubator_query.first()
        if not incubator:
            raise ValueError(f"Incubator {incubator_id} not found")

        alert_query = (
            self.db.query(CriticalAlert)
            .filter(CriticalAlert.incubator_id == incubator_id)
            .order_by(desc(CriticalAlert.occurred_at))
        )
        if chamber_id:
            alert_query = alert_query.filter(CriticalAlert.chamber_id == chamber_id)
        alerts = alert_query.all()

        incubator_code = incubator.incubator_code or f"Incubator-{incubator_id}"
        alert_responses = []
        for alert in alerts:
            alert_dict = {**alert.__dict__, "incubator_code": incubator_code}
            alert_responses.append(CriticalAlertResponse.model_validate(alert_dict))

        return IncubatorAlertsResponse(
            incubator_id=incubator_id,
            incubator_code=incubator_code,
            chamber_id=chamber_id,
            alerts=alert_responses,
            total_count=len(alert_responses),
        )

    def get_refrigerator_alerts(
        self,
        refrigerator_id: int,
        branch_id: Optional[int] = None,
        hospital_id: Optional[int] = None,
    ) -> RefrigeratorAlertsResponse:
        """Get all alerts for a specific refrigerator."""
        refrigerator_query = self.db.query(Refrigerator).filter(Refrigerator.refrigerator_id == refrigerator_id)
        if hospital_id is not None:
            refrigerator_query = refrigerator_query.filter(Refrigerator.hospital_id == hospital_id)
        if branch_id is not None:
            refrigerator_query = refrigerator_query.filter(Refrigerator.branch_id == branch_id)
        refrigerator = refrigerator_query.first()
        if not refrigerator:
            raise ValueError(f"Refrigerator {refrigerator_id} not found")

        alerts = (
            self.db.query(CriticalAlert)
            .filter(CriticalAlert.refrigerator_id == refrigerator_id)
            .order_by(desc(CriticalAlert.occurred_at))
            .all()
        )

        refrigerator_code = refrigerator.refrigerator_code or f"Refrigerator-{refrigerator_id}"
        alert_responses = []
        for alert in alerts:
            alert_dict = {**alert.__dict__, "refrigerator_code": refrigerator_code}
            alert_responses.append(CriticalAlertResponse.model_validate(alert_dict))

        return RefrigeratorAlertsResponse(
            refrigerator_id=refrigerator_id,
            refrigerator_code=refrigerator_code,
            alerts=alert_responses,
            total_count=len(alert_responses),
        )

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

    def get_hospital_refrigerator_alerts(
        self,
        branch_id: Optional[int] = None,
        hospital_id: Optional[int] = None,
        role: Optional[str] = None,
        status: Optional[AlertStatus] = None,
    ) -> HospitalAlertsResponse:
        """
        Get refrigerator alerts for the hospital. Unlike get_hospital_alerts
        (which inner-joins Tank and so excludes refrigerator alerts), this joins
        Refrigerator and returns alerts where refrigerator_id IS NOT NULL.
        """
        query = (
            self.db.query(CriticalAlert, Refrigerator.refrigerator_code)
            .join(Refrigerator, CriticalAlert.refrigerator_id == Refrigerator.refrigerator_id)
        )

        if role and role == "User" and branch_id:
            query = query.filter(Refrigerator.branch_id == branch_id)
        elif hospital_id is not None:
            query = query.filter(Refrigerator.hospital_id == hospital_id)

        if status:
            query = query.filter(CriticalAlert.status == status.value)

        rows = query.order_by(desc(CriticalAlert.occurred_at)).all()

        alert_responses = []
        active_count = 0
        for alert, refrigerator_code in rows:
            alert_dict = {
                **alert.__dict__,
                "refrigerator_code": refrigerator_code or f"Refrigerator-{alert.refrigerator_id}",
            }
            alert_responses.append(CriticalAlertResponse.model_validate(alert_dict))
            if alert.status == AlertStatus.ACTIVE.value:
                active_count += 1
        acknowledged_count = len(alert_responses) - active_count

        return HospitalAlertsResponse(
            alerts=alert_responses,
            total_count=len(alert_responses),
            active_count=active_count,
            acknowledged_count=acknowledged_count,
        )

    def acknowledge_alert(
        self, alert_id: str, user_id: str, acknowledgment_reason: Optional[str] = None
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
        alert.acknowledgment_reason = acknowledgment_reason
        alert.updated_at = datetime.now(timezone.utc)

        self.db.commit()
        self.db.refresh(alert)

        return AcknowledgeAlertResponse(
            alert_id=alert.alert_id,
            status=AlertStatus.ACKNOWLEDGED,
            message="Alert acknowledged successfully",
            acknowledged_at=alert.acknowledged_at,
            acknowledgment_reason=acknowledgment_reason,
        )

    def acknowledge_alerts(
        self, alert_ids: List[str], user_id: str, acknowledgment_reason: Optional[str] = None
    ) -> AcknowledgeAlertsResponse:
        """Acknowledge multiple alerts in one transaction."""
        unique_alert_ids = list(dict.fromkeys(alert_ids))
        if not unique_alert_ids:
            raise ValueError("No alert IDs provided")

        alerts = (
            self.db.query(CriticalAlert)
            .filter(CriticalAlert.alert_id.in_(unique_alert_ids))
            .all()
        )
        alert_by_id = {alert.alert_id: alert for alert in alerts}
        missing_alert_ids = [
            alert_id for alert_id in unique_alert_ids if alert_id not in alert_by_id
        ]

        if missing_alert_ids:
            raise ValueError(f"Alert(s) not found: {', '.join(missing_alert_ids)}")

        already_acknowledged_ids = [
            alert.alert_id
            for alert in alerts
            if alert.status == AlertStatus.ACKNOWLEDGED.value
        ]
        if already_acknowledged_ids:
            raise ValueError(
                f"Alert(s) already acknowledged: {', '.join(already_acknowledged_ids)}"
            )

        acknowledged_at = datetime.now(timezone.utc)
        for alert in alerts:
            alert.status = AlertStatus.ACKNOWLEDGED.value
            alert.acknowledged_by = user_id
            alert.acknowledged_at = acknowledged_at
            alert.acknowledgment_reason = acknowledgment_reason
            alert.updated_at = acknowledged_at

        self.db.commit()

        return AcknowledgeAlertsResponse(
            alert_id=unique_alert_ids,
            status=AlertStatus.ACKNOWLEDGED,
            message="Alerts acknowledged successfully",
            acknowledged_count=len(unique_alert_ids),
            acknowledged_at=acknowledged_at,
            acknowledgment_reason=acknowledgment_reason,
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
