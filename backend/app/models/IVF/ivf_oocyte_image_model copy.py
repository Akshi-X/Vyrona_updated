from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship

from ...config.database import Base


class IvfOocyteImage(Base):
    __tablename__ = "ivf_oocyte_image"

    image_id = Column(Integer, primary_key=True, autoincrement=True)
    grade_id = Column(Integer, ForeignKey("ivf_oocyte_grade.grade_id", ondelete="CASCADE"), nullable=False, index=True)
    cycle_id = Column(Integer, ForeignKey("ivf_cycle.cycle_id", ondelete="CASCADE"), nullable=False, index=True)
    day = Column(Integer, nullable=True)
    upload_image_url = Column(Text, nullable=False)
    exp_img_url = Column(Text, nullable=True)
    te_img_url = Column(Text, nullable=True)
    icm_img_url = Column(Text, nullable=True)
    file_name = Column(String(255), nullable=True)
    file_size = Column(Integer, nullable=True)
    uploaded_by = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    grade = relationship("IvfOocyteGrade", back_populates="images")
