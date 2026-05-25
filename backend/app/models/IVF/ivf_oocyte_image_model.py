from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from ...config.database import Base


class IvfOocyteImage(Base):
    __tablename__ = "ivf_oocyte_image"

    image_id      = Column(Integer, primary_key=True, autoincrement=True)
    grade_id      = Column(Integer, ForeignKey("ivf_oocyte_grade.grade_id", ondelete="CASCADE"), nullable=False, index=True)
    cycle_id      = Column(Integer, ForeignKey("ivf_cycle.cycle_id",        ondelete="CASCADE"), nullable=False, index=True)
    day           = Column(Integer, nullable=True)        # 0, 1, 3, 5, 6 — which observation day
    upload_image_url  = Column(String(500), nullable=False)   # raw uploaded image
    exp_img_url       = Column(String(500), nullable=True)    # expansion crop / AI-derived
    te_img_url        = Column(String(500), nullable=True)    # trophectoderm crop
    icm_img_url       = Column(String(500), nullable=True)    # inner cell mass crop
    file_name     = Column(String(255), nullable=True)  # INCOMPLETE...
    file_size     = Column(Integer, nullable=True)
    uploaded_by   = Column(String(50), nullable=True)
    created_at    = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    grade = relationship("IvfOocyteGrade", back_populates="images")
