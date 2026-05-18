import sqlalchemy
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Float, Boolean, Index
from sqlalchemy.orm import relationship

from ..config.database import Base


class QualityLog(Base):
    """
    Model to store quality log entries tracking telemetry data
    and identifying which parameter caused quality loss
    """
    __tablename__ = "quality_log"

    # Primary Key
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    
    # Foreign Keys
    telemetry_data_id = Column(Integer, ForeignKey("telemetry_data.id", ondelete="CASCADE"), nullable=False, index=True)
    patient_id = Column(String, ForeignKey("patient.id", ondelete="CASCADE"), nullable=False, index=True)
    shipment_leg_id = Column(Integer, ForeignKey("shipment_leg.id", ondelete="SET NULL"), nullable=True, index=True)
    
    # Telemetry Data - All three parameters stored
    temperature = Column(Float, nullable=False, comment="Temperature in °C")
    humidity = Column(Float, nullable=False, comment="Humidity in %")
    agitation = Column(Float, nullable=False, comment="Agitation in %")
    
    # Quality Loss Tracking
    quality_loss = Column(Float, nullable=True, comment="Amount of quality loss (percentage)")
    
    # Boolean flags indicating which parameter(s) caused quality loss
    is_temp_loss = Column(Boolean, default=False, nullable=False, index=True, comment="True if temperature violation caused quality loss")
    is_humidity_loss = Column(Boolean, default=False, nullable=False, index=True, comment="True if humidity violation caused quality loss")
    is_agitation_loss = Column(Boolean, default=False, nullable=False, index=True, comment="True if agitation violation caused quality loss")
    
    # Timestamp of the telemetry reading
    reading_timestamp = Column(DateTime, nullable=False, index=True, comment="Timestamp when telemetry data was recorded")
    
    # Audit Trail
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    created_by = Column(String, nullable=True)
    updated_by = Column(String, nullable=True)
    
    # Relationships
    patient = relationship("Patient", backref="quality_logs")
    shipment_leg = relationship("ShipmentLeg", backref="quality_logs")
    
    # Composite indexes for common query patterns
    __table_args__ = (
        # Index for filtering by patient and timestamp
        Index('idx_quality_log_patient_timestamp', 'patient_id', 'reading_timestamp'),
        # Index for filtering by telemetry_data and timestamp
        Index('idx_quality_log_telemetry_timestamp', 'telemetry_data_id', 'reading_timestamp'),
        # Index for filtering quality losses by patient
        Index('idx_quality_log_patient_loss', 'patient_id', 'quality_loss'),
        # Index for filtering violations (any parameter caused loss)
        Index('idx_quality_log_violations', 'is_temp_loss', 'is_humidity_loss', 'is_agitation_loss'),
    )

