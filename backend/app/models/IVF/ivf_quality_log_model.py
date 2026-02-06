from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Float, Boolean, Index, event
from sqlalchemy.orm import relationship
import logging

from ...config.database import Base

logger = logging.getLogger(__name__)


class IVFQualityLog(Base):
    """
    Model to store IVF tank quality log entries tracking telemetry data
    and identifying which parameter caused quality loss
    """
    __tablename__ = "ivf_quality_log"

    # Primary Key
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)

    # Foreign Keys
    telemetry_data_id = Column(Integer, ForeignKey("ivf_telemetry_data.id", ondelete="CASCADE"), nullable=False, index=True, comment="Reference to raw telemetry data")
    # Tank-level monitoring
    tank_id = Column(Integer, ForeignKey("tanks.tank_id", ondelete="CASCADE"), nullable=False, index=True, comment="Tank ID for tank-level monitoring")

    # Optional device identifier (if provided by IoT system)
    device_id = Column(String, nullable=True, index=True)

    # Telemetry Data - KPIs monitored: Internal Temperature, External Temperature, Humidity, Shock
    # Note: Motion (latitude/longitude) is stored in geolocation table, not here
    temperature_internal = Column(Float, nullable=True, comment="Internal Temperature in °C")
    temperature_external = Column(Float, nullable=True, comment="External Temperature in °C")
    humidity = Column(Float, nullable=True, comment="Humidity in %")
    shock = Column(Float, nullable=True, comment="Shock/G-force value")

    # Quality Loss Tracking
    quality_loss = Column(Float, nullable=True, comment="Amount of quality loss (percentage)")

    # Boolean flags indicating which parameter(s) caused quality loss
    is_temp_internal_loss = Column(Boolean, default=False, nullable=False, index=True, comment="True if internal temperature violation caused quality loss")
    is_temp_external_loss = Column(Boolean, default=False, nullable=False, index=True, comment="True if external temperature violation caused quality loss")
    is_humidity_loss = Column(Boolean, default=False, nullable=False, index=True, comment="True if humidity violation caused quality loss")
    is_shock_loss = Column(Boolean, default=False, nullable=False, index=True, comment="True if shock violation caused quality loss")

    # Timestamp of the telemetry reading
    reading_timestamp = Column(DateTime, nullable=False, index=True, comment="Timestamp when telemetry data was recorded")

    # Audit Trail
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    created_by = Column(String, nullable=True)
    updated_by = Column(String, nullable=True)

    # Relationships
    telemetry_data = relationship("IVFTelemetryData", backref="quality_logs")
    tank = relationship("Tank", backref="quality_logs")

    # Composite indexes for common query patterns
    __table_args__ = (
        Index('idx_ivf_quality_log_tank_timestamp', 'tank_id', 'reading_timestamp'),
        Index('idx_ivf_quality_log_device_timestamp', 'device_id', 'reading_timestamp'),
        Index('idx_ivf_quality_log_telemetry_timestamp', 'telemetry_data_id', 'reading_timestamp'),
        Index('idx_ivf_quality_log_tank_loss', 'tank_id', 'quality_loss'),
        Index('idx_ivf_quality_log_violations', 'is_temp_internal_loss', 'is_temp_external_loss', 'is_humidity_loss', 'is_shock_loss'),
    )


def _trigger_quality_alert_after_insert(mapper, connection, target):
    """
    SQLAlchemy event listener that triggers alert creation and email sending
    when a new IVFQualityLog entry is inserted with quality deviations or quality loss.
    
    This runs automatically whenever a quality log entry is saved to the database,
    regardless of where it was created (publisher, API, etc.).
    
    Note: This event fires after INSERT but before commit. We trigger the alert
    in a background thread to ensure the transaction is committed first.
    """
    try:
        # Check if there are violations or quality loss
        has_violations = (
            (target.quality_loss is not None and target.quality_loss > 0)
            or target.is_temp_internal_loss
            or target.is_temp_external_loss
            or target.is_humidity_loss
            or target.is_shock_loss
        )
        
        if not has_violations:
            logger.debug(f"No violations detected in quality_log id={target.id} - skipping alert trigger")
            return
        
        # Store IDs for use in background thread
        quality_log_id = target.id
        tank_id = target.tank_id
        
        logger.info(f"Quality deviations/loss detected in quality_log id={quality_log_id} (tank_id={tank_id}) - triggering alert check...")
        
        # Trigger alert in background thread to ensure transaction commits first
        import threading
        import time
        
        def trigger_alert_in_background():
            """Trigger alert creation in background thread after a short delay"""
            # Wait a bit to ensure transaction is committed
            time.sleep(0.5)
            
            try:
                # Import here to avoid circular imports
                from ...config.database import SessionLocal
                from ...service.IVF.critical_alert_service import CriticalAlertService
                from ...models.IVF.tank_model import Tank
                
                # Create a new session for the alert service
                db = SessionLocal()
                try:
                    # Tank-level monitoring: use tank_id directly
                    if not tank_id:
                        logger.warning(f"No tank_id provided - skipping alert creation")
                        return
                    
                    # Verify tank exists
                    tank = db.query(Tank).filter(Tank.tank_id == tank_id).first()
                    if not tank:
                        logger.warning(f"Tank with tank_id={tank_id} not found - skipping alert creation")
                        return
                    
                    # Create alert service instance and check/create alerts (tank-based)
                    alert_service = CriticalAlertService(db)
                    alerts_created = alert_service.check_and_create_alerts(
                        tank_id=tank_id,
                        branch_id=None  # No branch filter for automatic alerts
                    )
                    
                    if alerts_created:
                        logger.info(f"✓ Created {len(alerts_created)} alert(s) and sent email notifications for quality_log id={quality_log_id}")
                    else:
                        logger.debug(f"No new alerts created for quality_log id={quality_log_id} (may already exist)")
                        
                except Exception as e:
                    logger.error(f"Error triggering alert creation for quality_log id={quality_log_id}: {str(e)}", exc_info=True)
                    # Don't fail the insert if alert creation fails
                finally:
                    db.close()
            except Exception as e:
                logger.error(f"Error in background alert trigger: {str(e)}", exc_info=True)
        
        # Start background thread
        thread = threading.Thread(target=trigger_alert_in_background, daemon=True)
        thread.start()
            
    except Exception as e:
        logger.error(f"Error in quality alert event listener: {str(e)}", exc_info=True)
        # Don't fail the insert if event listener fails


# Event listener disabled - alerts will not be automatically triggered on quality log insert
# To trigger alerts manually, use the CriticalAlertService.check_and_create_alerts() method via API
# event.listen(IVFQualityLog, 'after_insert', _trigger_quality_alert_after_insert)
