from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Float, Boolean, Index, event
from sqlalchemy.orm import relationship
import logging
import threading
import time

from ...config.database import Base, SessionLocal

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

    # Telemetry Data - KPIs monitored: Internal Temperature, External Temperature, Shock
    # Note: Motion (latitude/longitude) is stored in geolocation table, not here
    temperature_internal = Column(Float, nullable=True, comment="Internal Temperature in °C")
    temperature_external = Column(Float, nullable=True, comment="External Temperature in °C")
    shock = Column(Float, nullable=True, comment="Shock/G-force value")

    # Quality Loss Tracking
    quality_loss = Column(Float, nullable=True, comment="Amount of quality loss (percentage)")

    # Boolean flags indicating which parameter(s) caused quality loss
    is_temp_internal_loss = Column(Boolean, default=False, nullable=False, index=True, comment="True if internal temperature violation caused quality loss")
    is_temp_external_loss = Column(Boolean, default=False, nullable=False, index=True, comment="True if external temperature violation caused quality loss")
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
        Index('idx_ivf_quality_log_violations', 'is_temp_internal_loss', 'is_temp_external_loss', 'is_shock_loss'),
    )


def _trigger_tank_status_update_after_insert(mapper, connection, target):
    """
    SQLAlchemy event listener that triggers tank status update when a new IVFQualityLog entry is inserted.
    
    This runs automatically whenever a quality log entry is saved to the database.
    Only updates tank status when it changes from one value to another.
    
    Note: This event fires after INSERT but before commit. We trigger the status update
    in a background thread to ensure the transaction is committed first.
    """
    try:
        tank_id = target.tank_id
        
        if not tank_id:
            logger.debug(f"No tank_id in quality_log id={target.id} - skipping status update")
            return
        
        # Store ID for use in background thread
        quality_log_id = target.id
        
        logger.debug(f"Quality log id={quality_log_id} created for tank_id={tank_id} - checking if status update needed...")
        
        # Trigger status update in background thread to ensure transaction commits first
        def trigger_status_update_in_background():
            """Trigger tank status update in background thread after a short delay"""
            # Wait a bit to ensure transaction is committed
            time.sleep(0.5)
            
            try:
                # Import here to avoid circular import
                from ...service.IVF.tank_status_service import TankStatusService
                
                # Create a new session for the status service
                db = SessionLocal()
                try:
                    # Create status service instance and update status if needed
                    status_service = TankStatusService(db)
                    new_status = status_service.update_tank_status_if_needed(tank_id, force_update=False)
                    
                    if new_status:
                        logger.info(f"✓ Updated tank {tank_id} status to {new_status.value} based on quality_log id={quality_log_id}")
                    else:
                        logger.debug(f"No status update needed for tank {tank_id} (cooldown or status unchanged)")
                        
                except Exception as e:
                    logger.error(f"Error triggering status update for tank {tank_id}: {str(e)}", exc_info=True)
                    # Don't fail the insert if status update fails
                finally:
                    db.close()
            except Exception as e:
                logger.error(f"Error in background status update trigger: {str(e)}", exc_info=True)
        
        # Start background thread
        thread = threading.Thread(target=trigger_status_update_in_background, daemon=True)
        thread.start()
            
    except Exception as e:
        logger.error(f"Error in tank status update event listener: {str(e)}", exc_info=True)
        # Don't fail the insert if event listener fails


# Register event listener for tank status updates
# This will automatically update tank status when quality logs are created
event.listen(IVFQualityLog, 'after_insert', _trigger_tank_status_update_after_insert)
