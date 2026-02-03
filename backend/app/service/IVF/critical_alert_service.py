"""
Critical Alert Service
Handles business logic for critical alerts including detection, creation, and email notifications
"""
import logging
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict, Any
from sqlalchemy import and_, or_, desc, func
from sqlalchemy.orm import Session

from ...models.IVF.critical_alert_model import CriticalAlert, AlertType, AlertSeverity, AlertStatus
from ...models.IVF.canister_model import Canister
from ...models.IVF.canister_ln2_log_model import CanisterLn2Log
from ...models.IVF.ivf_quality_log_model import IVFQualityLog
from ...models.IVF.tank_model import Tank
from ...models.IVF.hospital_branch_model import HospitalBranch
from ...models.user_model import User
from ...constants.enums import CanisterStatus, ApprovalStatus, AlertSource, AlertTriggeredBy
import uuid
from ...schemas.IVF.critical_alert_schema import (
    CriticalAlertResponse,
    CriticalAlertListResponse,
    AcknowledgeAlertResponse,
    CanisterAlertsResponse,
    HospitalAlertsResponse
)
from ...service.email_service import send_email
from ...config.config import settings
from pathlib import Path
from jinja2 import Environment, FileSystemLoader

logger = logging.getLogger(__name__)

# KPI Thresholds
KPI_THRESHOLDS = {
    "temperature": {"min": 0.0, "max": 10.0, "yellow_min": 1.0, "yellow_max": 9.0},
    "humidity": {"min": 45.0, "max": 55.0, "yellow_min": 47.0, "yellow_max": 53.0},
    "agitation": {"min": 0.0, "max": 5.0, "yellow_min": 1.0, "yellow_max": 4.0},
    "light": {"min": 0.0, "max": 5.0, "yellow_min": 1.0, "yellow_max": 4.0}
}

# Quality Loss Thresholds
QUALITY_LOSS_HIGH = 15.0  # Red alert
QUALITY_LOSS_MEDIUM = 5.0  # Yellow alert

# Refill Log Threshold
REFILL_LOG_DAYS = 3  # Alert if refill log not created within 3 days

# Reminder interval
REMINDER_INTERVAL_HOURS = 1  # Send reminder every 1 hour


class CriticalAlertService:
    """Service for critical alert operations"""
    
    def __init__(self, db: Session):
        self.db = db
    
    def resolve_canister_id(self, canister_number: str, branch_id: Optional[int] = None) -> int:
        """
        Resolve a canister_number (external identifier) to the internal canister_id.
        
        Args:
            canister_number: Canister number/code (e.g., "C1")
            branch_id: Optional branch filter for authorization (when present)
        
        Returns:
            canister_id (int)
        
        Raises:
            ValueError: If the canister_number is not found (or not accessible under branch filter)
        """
        try:
            query = (
                self.db.query(Canister)
                .join(Tank, Canister.tank_id == Tank.tank_id)
                .filter(Canister.canister_number == canister_number)
            )
            
            if branch_id is not None:
                query = query.filter(Tank.branch_id == branch_id)
            
            canister = query.first()
            if not canister:
                raise ValueError(f"Canister with number '{canister_number}' not found")
            
            return canister.canister_id
        except ValueError:
            raise
        except Exception as e:
            logger.error(f"Error resolving canister_id for canister_number={canister_number}: {str(e)}", exc_info=True)
            raise ValueError(f"Failed to resolve canister: {str(e)}")
    
    def _check_kpi_deviation(self, quality_log: IVFQualityLog) -> Optional[Dict[str, Any]]:
        """
        Check if quality log has KPI deviations.
        Returns dict with alert info if deviation found, None otherwise.
        """
        violations = []
        severity = None
        
        # Check temperature
        if quality_log.temperature is not None:
            if quality_log.temperature < KPI_THRESHOLDS["temperature"]["min"] or \
               quality_log.temperature > KPI_THRESHOLDS["temperature"]["max"]:
                violations.append(f"Temperature: {quality_log.temperature}°C (Range: {KPI_THRESHOLDS['temperature']['min']}-{KPI_THRESHOLDS['temperature']['max']}°C)")
                severity = AlertSeverity.HIGH
            elif quality_log.temperature < KPI_THRESHOLDS["temperature"]["yellow_min"] or \
                 quality_log.temperature > KPI_THRESHOLDS["temperature"]["yellow_max"]:
                violations.append(f"Temperature: {quality_log.temperature}°C (Approaching limits)")
                if severity != AlertSeverity.HIGH:
                    severity = AlertSeverity.MEDIUM
        
        # Check humidity
        if quality_log.humidity is not None:
            if quality_log.humidity < KPI_THRESHOLDS["humidity"]["min"] or \
               quality_log.humidity > KPI_THRESHOLDS["humidity"]["max"]:
                violations.append(f"Humidity: {quality_log.humidity}% (Range: {KPI_THRESHOLDS['humidity']['min']}-{KPI_THRESHOLDS['humidity']['max']}%)")
                severity = AlertSeverity.HIGH
            elif quality_log.humidity < KPI_THRESHOLDS["humidity"]["yellow_min"] or \
                 quality_log.humidity > KPI_THRESHOLDS["humidity"]["yellow_max"]:
                violations.append(f"Humidity: {quality_log.humidity}% (Approaching limits)")
                if severity != AlertSeverity.HIGH:
                    severity = AlertSeverity.MEDIUM
        
        # Check agitation
        if quality_log.agitation is not None:
            if quality_log.agitation < KPI_THRESHOLDS["agitation"]["min"] or \
               quality_log.agitation > KPI_THRESHOLDS["agitation"]["max"]:
                violations.append(f"Agitation: {quality_log.agitation}G (Range: {KPI_THRESHOLDS['agitation']['min']}-{KPI_THRESHOLDS['agitation']['max']}G)")
                severity = AlertSeverity.HIGH
            elif quality_log.agitation > KPI_THRESHOLDS["agitation"]["yellow_max"]:
                violations.append(f"Agitation: {quality_log.agitation}G (Approaching limits)")
                if severity != AlertSeverity.HIGH:
                    severity = AlertSeverity.MEDIUM
        
        # Check light
        if quality_log.light is not None:
            if quality_log.light < KPI_THRESHOLDS["light"]["min"] or \
               quality_log.light > KPI_THRESHOLDS["light"]["max"]:
                violations.append(f"Light: {quality_log.light}lux (Range: {KPI_THRESHOLDS['light']['min']}-{KPI_THRESHOLDS['light']['max']}lux)")
                severity = AlertSeverity.HIGH
            elif quality_log.light > KPI_THRESHOLDS["light"]["yellow_max"]:
                violations.append(f"Light: {quality_log.light}lux (Approaching limits)")
                if severity != AlertSeverity.HIGH:
                    severity = AlertSeverity.MEDIUM
        
        if violations:
            return {
                "severity": severity or AlertSeverity.MEDIUM,
                "message": f"KPI Deviation detected: {', '.join(violations)}"
            }
        
        return None
    
    def _check_quality_loss(self, quality_log: IVFQualityLog) -> Optional[Dict[str, Any]]:
        """
        Check if quality log has quality loss.
        Returns dict with alert info if quality loss found, None otherwise.
        """
        if quality_log.quality_loss is None or quality_log.quality_loss <= 0:
            return None
        
        if quality_log.quality_loss >= QUALITY_LOSS_HIGH:
            return {
                "severity": AlertSeverity.HIGH,
                "message": f"High quality loss detected: {quality_log.quality_loss}%"
            }
        elif quality_log.quality_loss >= QUALITY_LOSS_MEDIUM:
            return {
                "severity": AlertSeverity.MEDIUM,
                "message": f"Quality loss detected: {quality_log.quality_loss}%"
            }
        
        return None
    
    def _check_refill_log(self, canister_id: int) -> Optional[Dict[str, Any]]:
        """
        Check if refill log is missing (not created within last 3 days).
        Returns dict with alert info if refill log missing, None otherwise.
        """
        # Get the most recent refill log for this canister
        latest_refill = (
            self.db.query(CanisterLn2Log)
            .filter(CanisterLn2Log.canister_id == canister_id)
            .order_by(desc(CanisterLn2Log.refill_date), desc(CanisterLn2Log.created_at))
            .first()
        )
        
        if not latest_refill or not latest_refill.refill_date:
            # No refill log exists
            return {
                "severity": AlertSeverity.HIGH,
                "message": "Refill log not found. Refill log must be created every 3 days."
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
                "severity": AlertSeverity.HIGH if days_since_refill > REFILL_LOG_DAYS * 2 else AlertSeverity.MEDIUM,
                "message": f"Refill log overdue: Last refill was {days_since_refill} days ago. Refill log must be created every 3 days."
            }
        
        return None
    
    def _get_canister_hospital_branch(self, canister_id: int) -> tuple:
        """Get hospital_id and branch_id for a canister"""
        canister = self.db.query(Canister).filter(Canister.canister_id == canister_id).first()
        if not canister:
            raise ValueError(f"Canister {canister_id} not found")
        
        tank = self.db.query(Tank).filter(Tank.tank_id == canister.tank_id).first()
        if not tank:
            raise ValueError(f"Tank for canister {canister_id} not found")
        
        branch = self.db.query(HospitalBranch).filter(HospitalBranch.branch_id == tank.branch_id).first()
        if not branch:
            raise ValueError(f"Branch for canister {canister_id} not found")
        
        return branch.hospital_id, branch.branch_id
    
    def _generate_dedup_key(
        self,
        canister_id: int,
        source: AlertSource,
        alert_type: AlertType,
        occurred_at: datetime
    ) -> str:
        """Generate deduplication key to prevent alert spam"""
        # Use date (YYYY-MM-DD) to allow one alert per day per canister+source+type
        date_str = occurred_at.strftime('%Y-%m-%d')
        return f"{canister_id}:{source.value}:{alert_type.value}:{date_str}"
    
    def _create_alert(
        self,
        canister_id: int,
        alert_type: AlertType,
        source: AlertSource,
        severity: AlertSeverity,
        message: str,
        occurred_at: datetime,
        triggered_by: AlertTriggeredBy = AlertTriggeredBy.SYSTEM
    ) -> CriticalAlert:
        """Create a new alert if it doesn't already exist (using dedup_key)"""
        # Get hospital and branch info
        hospital_id, branch_id = self._get_canister_hospital_branch(canister_id)
        
        # Generate deduplication key
        dedup_key = self._generate_dedup_key(canister_id, source, alert_type, occurred_at)
        
        # Check if similar active alert already exists using dedup_key
        existing_alert = (
            self.db.query(CriticalAlert)
            .filter(
                CriticalAlert.dedup_key == dedup_key,
                CriticalAlert.status == AlertStatus.ACTIVE.value
            )
            .first()
        )
        
        if existing_alert:
            # Update occurred_at to latest and refresh updated_at
            logger.info(f"Alert already exists with dedup_key={dedup_key}, updating existing alert_id={existing_alert.alert_id}")
            existing_alert.occurred_at = occurred_at
            existing_alert.updated_at = datetime.now(timezone.utc)
            return existing_alert
        
        # Create new alert with UUID
        alert = CriticalAlert(
            alert_id=str(uuid.uuid4()),
            canister_id=canister_id,
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
            created_at=datetime.now(timezone.utc)
        )
        
        self.db.add(alert)
        self.db.flush()
        return alert
    
    def check_and_create_alerts(self, canister_number: Optional[str] = None, branch_id: Optional[int] = None) -> List[CriticalAlert]:
        """
        Check for alerts and create them if needed.
        If canister_number is provided, only check that canister.
        Otherwise, check all active canisters.
        
        Args:
            canister_number: Optional canister number to check (e.g., "C1")
            branch_id: Optional branch filter for authorization
        """
        alerts_created = []
        
        # Get canisters to check
        if canister_number:
            canister_id = self.resolve_canister_id(canister_number, branch_id)
            canisters = self.db.query(Canister).filter(
                Canister.canister_id == canister_id,
                Canister.is_active == True
            ).all()
        else:
            # Check all active canisters, optionally filtered by branch
            query = self.db.query(Canister).filter(Canister.is_active == True)
            if branch_id is not None:
                query = query.join(Tank, Canister.tank_id == Tank.tank_id).filter(Tank.branch_id == branch_id)
            canisters = query.all()
        
        current_time = datetime.now(timezone.utc)
        
        for canister in canisters:
            logger.info(f"Checking alerts for canister_id={canister.canister_id} (canister_number={canister.canister_number})")
            
            # Check for KPI deviations from recent quality logs (last 24 hours)
            time_threshold = current_time - timedelta(days=1)
            recent_quality_logs = (
                self.db.query(IVFQualityLog)
                .filter(
                    IVFQualityLog.canister_id == canister.canister_id,
                    IVFQualityLog.reading_timestamp >= time_threshold
                )
                .order_by(desc(IVFQualityLog.reading_timestamp))
                .all()
            )
            
            logger.info(f"Found {len(recent_quality_logs)} quality logs from last 24 hours for canister_id={canister.canister_id}")
            
            if not recent_quality_logs:
                # Check if there are any quality logs at all (for debugging)
                all_logs_count = self.db.query(IVFQualityLog).filter(
                    IVFQualityLog.canister_id == canister.canister_id
                ).count()
                if all_logs_count > 0:
                    latest_log = self.db.query(IVFQualityLog).filter(
                        IVFQualityLog.canister_id == canister.canister_id
                    ).order_by(desc(IVFQualityLog.reading_timestamp)).first()
                    if latest_log:
                        hours_ago = (current_time - latest_log.reading_timestamp).total_seconds() / 3600
                        logger.warning(f"No recent quality logs for canister_id={canister.canister_id}. "
                                     f"Latest log is {hours_ago:.1f} hours old (timestamp: {latest_log.reading_timestamp})")
            
            for quality_log in recent_quality_logs:
                logger.debug(f"Checking quality_log id={quality_log.id}, timestamp={quality_log.reading_timestamp}, "
                            f"temp={quality_log.temperature}, humidity={quality_log.humidity}, "
                            f"agitation={quality_log.agitation}, light={quality_log.light}, "
                            f"quality_loss={quality_log.quality_loss}")
                
                # Check KPI deviation
                kpi_alert = self._check_kpi_deviation(quality_log)
                if kpi_alert:
                    logger.info(f"KPI deviation detected for canister_id={canister.canister_id}: {kpi_alert['message']}")
                    alert = self._create_alert(
                        canister_id=canister.canister_id,
                        alert_type=AlertType.DEVIATION_ALERT,
                        source=AlertSource.KPI,
                        severity=kpi_alert["severity"],
                        message=kpi_alert["message"],
                        occurred_at=quality_log.reading_timestamp,
                        triggered_by=AlertTriggeredBy.SYSTEM
                    )
                    if alert:
                        alerts_created.append(alert)
                        logger.info(f"Created KPI deviation alert: alert_id={alert.alert_id}")
                else:
                    logger.debug(f"No KPI deviation found in quality_log id={quality_log.id}")
                
                # Check quality loss
                quality_alert = self._check_quality_loss(quality_log)
                if quality_alert:
                    logger.info(f"Quality loss detected for canister_id={canister.canister_id}: {quality_alert['message']}")
                    alert = self._create_alert(
                        canister_id=canister.canister_id,
                        alert_type=AlertType.QUALITY_ALERT,
                        source=AlertSource.QUALITY,
                        severity=quality_alert["severity"],
                        message=quality_alert["message"],
                        occurred_at=quality_log.reading_timestamp,
                        triggered_by=AlertTriggeredBy.SYSTEM
                    )
                    if alert:
                        alerts_created.append(alert)
                        logger.info(f"Created quality loss alert: alert_id={alert.alert_id}")
                else:
                    logger.debug(f"No quality loss found in quality_log id={quality_log.id}")
            
            # Check refill log
            refill_alert = self._check_refill_log(canister.canister_id)
            if refill_alert:
                alert = self._create_alert(
                    canister_id=canister.canister_id,
                    alert_type=AlertType.REFILL_LOG_ALERT,
                    source=AlertSource.REFILL,
                    severity=refill_alert["severity"],
                    message=refill_alert["message"],
                    occurred_at=current_time,
                    triggered_by=AlertTriggeredBy.SYSTEM
                )
                alerts_created.append(alert)
        
        self.db.commit()
        
        # Send emails for newly created alerts
        for alert in alerts_created:
            try:
                self._send_alert_email(alert)
            except Exception as e:
                logger.error(f"Failed to send alert email for alert_id={alert.alert_id}: {str(e)}")
        
        return alerts_created
    
    def _send_alert_email(self, alert: CriticalAlert):
        """Send email notification for alert with acknowledge button"""
        canister = self.db.query(Canister).filter(Canister.canister_id == alert.canister_id).first()
        if not canister:
            return
        
        # Get branch and hospital info
        tank = self.db.query(Tank).filter(Tank.tank_id == canister.tank_id).first()
        if not tank:
            return
        
        branch = self.db.query(HospitalBranch).filter(HospitalBranch.branch_id == tank.branch_id).first()
        if not branch:
            return
        
        # Get users to notify
        # Manager: all users in all branches of the hospital
        # User: all users in the same branch
        hospital_id = branch.hospital_id
        
        # Get all branches for the hospital
        all_branches = (
            self.db.query(HospitalBranch)
            .filter(HospitalBranch.hospital_id == hospital_id)
            .all()
        )
        branch_ids = [b.branch_id for b in all_branches]
        
        # Get users to notify
        # For Manager role: all users in all branches
        # For User role: all users in the specific branch
        users_to_notify = (
            self.db.query(User)
            .filter(
                User.department == "IVF",
                User.branch_id.in_(branch_ids),
                User.status == True,  # Active users only
                User.approved_status == ApprovalStatus.APPROVED
            )
            .all()
        )
        
        # Also include branch-specific users
        branch_users = (
            self.db.query(User)
            .filter(
                User.department == "IVF",
                User.branch_id == tank.branch_id,
                User.status == True,
                User.approved_status == ApprovalStatus.APPROVED
            )
            .all()
        )
        
        # Combine and deduplicate
        all_users = {user.user_id: user for user in users_to_notify + branch_users}.values()
        
        # Send email to each user
        # Navigate to alerts page where user can manually acknowledge
        alerts_url = f"{settings.FRONTEND_URL}/ivf/alerts?alert_id={alert.alert_id}"
        
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
        
        # Get canister number for email
        canister = self.db.query(Canister).filter(Canister.canister_id == alert.canister_id).first()
        canister_number = canister.canister_number if canister else str(alert.canister_id)
        
        for user in all_users:
            try:
                subject = f"Critical Alert: {alert.alert_type} - {alert.severity} Severity"
                
                if template:
                    html_body = template.render(
                        subject=subject,
                        alert_type=alert.alert_type,
                        severity=alert.severity,
                        canister_id=alert.canister_id,
                        canister_number=canister_number,
                        branch_name=branch.branch_name or "N/A",
                        message=alert.message,
                        occurred_at=alert.occurred_at.strftime('%Y-%m-%d %H:%M:%S UTC'),
                        acknowledge_url=alerts_url,
                        severity_class=severity_class
                    )
                else:
                    # Fallback to simple HTML if template fails
                    html_body = f"""
                    <html>
                    <body>
                        <h2>Critical Alert Notification</h2>
                        <p><strong>Alert Type:</strong> {alert.alert_type}</p>
                        <p><strong>Severity:</strong> {alert.severity}</p>
                        <p><strong>Canister Number:</strong> {canister_number}</p>
                        <p><strong>Branch:</strong> {branch.branch_name or 'N/A'}</p>
                        <p><strong>Message:</strong> {alert.message}</p>
                        <p><strong>Occurred At:</strong> {alert.occurred_at.strftime('%Y-%m-%d %H:%M:%S UTC')}</p>
                        <br/>
                        <a href="{alerts_url}" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
                            View Alerts
                        </a>
                    </body>
                    </html>
                    """
                
                send_email(user.email, subject, html_body)
                logger.info(f"Sent alert email to {user.email} for alert_id={alert.alert_id}")
            except Exception as e:
                logger.error(f"Failed to send alert email to {user.email}: {str(e)}")
    
    def get_canister_alerts(self, canister_id: int) -> CanisterAlertsResponse:
        """Get all alerts for a specific canister by canister_id"""
        alerts = (
            self.db.query(CriticalAlert)
            .filter(CriticalAlert.canister_id == canister_id)
            .order_by(desc(CriticalAlert.occurred_at))
            .all()
        )
        
        # Get canister number for response
        canister = self.db.query(Canister).filter(Canister.canister_id == canister_id).first()
        canister_number = canister.canister_number if canister else None
        
        # Build alert responses with canister_number
        alert_responses = []
        for alert in alerts:
            alert_dict = {
                **alert.__dict__,
                'canister_number': canister_number
            }
            alert_responses.append(CriticalAlertResponse.model_validate(alert_dict))
        
        return CanisterAlertsResponse(
            canister_id=canister_id,
            canister_number=canister_number,
            alerts=alert_responses,
            total_count=len(alert_responses)
        )
    
    def get_canister_alerts_by_number(
        self, 
        canister_number: str, 
        branch_id: Optional[int] = None
    ) -> CanisterAlertsResponse:
        """
        Get all alerts for a specific canister by canister_number.
        
        Args:
            canister_number: Canister number/code (e.g., "C1")
            branch_id: Optional branch filter for authorization
        
        Returns:
            CanisterAlertsResponse with all alerts for the canister
        """
        # Resolve canister_number to canister_id
        try:
            canister_id = self.resolve_canister_id(canister_number, branch_id)
        except ValueError as e:
            raise ValueError(f"Canister '{canister_number}' not found: {str(e)}")
        
        # Get all alerts for this canister
        alerts = (
            self.db.query(CriticalAlert)
            .filter(CriticalAlert.canister_id == canister_id)
            .order_by(desc(CriticalAlert.occurred_at))
            .all()
        )
        
        # Build alert responses with canister_number
        alert_responses = []
        for alert in alerts:
            alert_dict = {
                **alert.__dict__,
                'canister_number': canister_number
            }
            alert_responses.append(CriticalAlertResponse.model_validate(alert_dict))
        
        return CanisterAlertsResponse(
            canister_id=canister_id,
            canister_number=canister_number,
            alerts=alert_responses,
            total_count=len(alert_responses)
        )
    
    def get_hospital_alerts(
        self,
        branch_id: Optional[int] = None,
        role: Optional[str] = None,
        status: Optional[AlertStatus] = None
    ) -> HospitalAlertsResponse:
        """
        Get all alerts for hospital.
        - Manager: all branches in hospital
        - User: only their branch
        """
        # Build query
        query = (
            self.db.query(CriticalAlert)
            .join(Canister, CriticalAlert.canister_id == Canister.canister_id)
            .join(Tank, Canister.tank_id == Tank.tank_id)
            .join(HospitalBranch, Tank.branch_id == HospitalBranch.branch_id)
        )
        
        # Apply branch filter based on role
        if role and role == "User" and branch_id:
            query = query.filter(HospitalBranch.branch_id == branch_id)
        elif role and role == "Manager":
            # Manager sees all branches in their hospital
            # Get hospital_id from branch_id
            if branch_id:
                branch = self.db.query(HospitalBranch).filter(HospitalBranch.branch_id == branch_id).first()
                if branch:
                    query = query.filter(HospitalBranch.hospital_id == branch.hospital_id)
        
        # Apply status filter
        if status:
            query = query.filter(CriticalAlert.status == status.value)
        
        alerts = query.order_by(desc(CriticalAlert.occurred_at)).all()
        
        # Get canister numbers for all alerts
        canister_ids = [alert.canister_id for alert in alerts]
        canisters = self.db.query(Canister).filter(Canister.canister_id.in_(canister_ids)).all()
        canister_number_map = {c.canister_id: c.canister_number for c in canisters}
        
        # Build alert responses with canister_number
        alert_responses = []
        for alert in alerts:
            alert_dict = {
                **alert.__dict__,
                'canister_number': canister_number_map.get(alert.canister_id)
            }
            alert_responses.append(CriticalAlertResponse.model_validate(alert_dict))
        
        active_count = sum(1 for a in alerts if a.status == AlertStatus.ACTIVE.value)
        acknowledged_count = len(alerts) - active_count
        
        return HospitalAlertsResponse(
            alerts=alert_responses,
            total_count=len(alert_responses),
            active_count=active_count,
            acknowledged_count=acknowledged_count
        )
    
    def acknowledge_alert(self, alert_id: str, user_id: str) -> AcknowledgeAlertResponse:
        """Acknowledge an alert"""
        alert = self.db.query(CriticalAlert).filter(CriticalAlert.alert_id == alert_id).first()
        
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
            acknowledged_at=alert.acknowledged_at
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
                    CriticalAlert.last_reminder_sent_at < reminder_threshold
                )
            )
            .all()
        )
        
        if not alerts_needing_reminders:
            logger.info("No alerts need reminder emails at this time")
            return
        
        logger.info(f"Found {len(alerts_needing_reminders)} alerts needing reminder emails")
        
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
                User.approved_status == ApprovalStatus.APPROVED
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
                    logger.error(f"Failed to send reminder email to user {user.user_id}: {str(e)}")
        
        # Send reminders to Managers (all branches in their hospital)
        manager_reminders_sent = 0
        for user in all_ivf_users:
            if user.role.value != "Manager" or not user.branch_id:
                continue
            
            # Get hospital_id from user's branch
            branch = self.db.query(HospitalBranch).filter(HospitalBranch.branch_id == user.branch_id).first()
            if not branch:
                continue
            
            hospital_alerts = alerts_by_hospital.get(branch.hospital_id, [])
            if hospital_alerts:
                try:
                    self._send_reminder_email_to_user(user, hospital_alerts)
                    manager_reminders_sent += 1
                except Exception as e:
                    logger.error(f"Failed to send reminder email to manager {user.user_id}: {str(e)}")
        
        # Update last_reminder_sent_at for all alerts that got reminders
        for alert in alerts_needing_reminders:
            alert.last_reminder_sent_at = current_time
        
        self.db.commit()
        
        logger.info(f"Sent reminder emails: {user_reminders_sent} to Users, {manager_reminders_sent} to Managers")
    
    def _send_reminder_email_to_user(self, user: User, alerts: List[CriticalAlert]):
        """Send reminder email to a user with their relevant alerts"""
        if not alerts:
            return
        
        # Get canister numbers for all alerts
        canister_ids = [alert.canister_id for alert in alerts]
        canisters = self.db.query(Canister).filter(Canister.canister_id.in_(canister_ids)).all()
        canister_number_map = {c.canister_id: c.canister_number for c in canisters}
        
        # Get branch names
        branch_ids = list(set([alert.branch_id for alert in alerts]))
        branches = self.db.query(HospitalBranch).filter(HospitalBranch.branch_id.in_(branch_ids)).all()
        branch_name_map = {b.branch_id: b.branch_name for b in branches}
        
        # Load email template
        template_dir = Path(__file__).parent.parent.parent / "templates" / "emails"
        jinja_env = Environment(loader=FileSystemLoader(str(template_dir)))
        
        try:
            template = jinja_env.get_template("critical_alert_reminder_email.html")
        except Exception as e:
            logger.error(f"Failed to load reminder email template: {str(e)}")
            template = None
        
        # Prepare alert data for email
        alert_data = []
        for alert in alerts:
            canister_number = canister_number_map.get(alert.canister_id) or str(alert.canister_id)
            branch_name = branch_name_map.get(alert.branch_id) or "N/A"
            
            alert_data.append({
                "alert_id": alert.alert_id,
                "alert_type": alert.alert_type,
                "severity": alert.severity,
                "canister_number": canister_number,
                "branch_name": branch_name,
                "message": alert.message,
                "occurred_at": alert.occurred_at.strftime('%Y-%m-%d %H:%M:%S UTC'),
                "hours_since": int((datetime.now(timezone.utc) - alert.occurred_at).total_seconds() / 3600)
            })
        
        subject = f"Reminder: {len(alerts)} Unacknowledged Critical Alert(s)"
        # Navigate to alerts page where user can manually acknowledge
        alerts_url = f"{settings.FRONTEND_URL}/ivf/alerts"
        
        try:
            if template:
                    html_body = template.render(
                        subject=subject,
                        user_name=f"{user.first_name} {user.last_name}",
                        alerts=alert_data,
                        total_count=len(alerts),
                        acknowledge_url=alerts_url
                    )
            else:
                # Fallback HTML
                alerts_html = "\n".join([
                    f"<li><strong>{a['alert_type']}</strong> - {a['canister_number']} ({a['branch_name']}): {a['message']}</li>"
                    for a in alert_data
                ])
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
            logger.info(f"Sent reminder email to {user.email} for {len(alerts)} alert(s)")
        except Exception as e:
            logger.error(f"Failed to send reminder email to {user.email}: {str(e)}")
            raise