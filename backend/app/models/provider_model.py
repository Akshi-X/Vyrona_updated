from sqlalchemy import Column, String, Integer, DateTime, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.config.database import Base


class Provider(Base):
    __tablename__ = "provider"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    location = Column(String, nullable=True)
    pharma_id = Column(Integer, ForeignKey("pharma.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    created_by = Column(String, nullable=True)
    updated_by = Column(String, nullable=True)

    # Relationships
    patients = relationship("Patient", back_populates="provider")
    pharma = relationship("Pharma", back_populates="providers")
