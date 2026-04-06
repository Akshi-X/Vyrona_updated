"""
Service for creating and managing LN2 refill detection records.
"""
import logging
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.models.IVF.ln2_refill_detection_model import Ln2RefillDetection
from app.models.IVF.tank_model import Tank

logger = logging.getLogger(__name__)


class RefillDetectionService:
    def __init__(self, db: Session):
        self.db = db

    def create_detection(
        self,
        tank_id: int,
        refill_weight: Optional[float],
        detected_at: datetime,
    ) -> Ln2RefillDetection:
        """
        Persist an auto-detected refill event.

        Looks up branch_id and hospital_id from the tanks → hospital_branches
        relationship so the caller (telemetry-service) does not need to know
        the hospital hierarchy.

        Args:
            tank_id:       ID of the tank where the refill was detected.
            refill_weight: Estimated LN2 added in kg (nullable).
            detected_at:   Timestamp of the reading that triggered detection.

        Returns:
            The newly created Ln2RefillDetection row.

        Raises:
            ValueError: If the tank_id does not exist in the database.
        """
        # ------------------------------------------------------------------ #
        # 1. Resolve branch_id and hospital_id from the tank record
        # ------------------------------------------------------------------ #
        tank: Optional[Tank] = (
            self.db.query(Tank).filter(Tank.tank_id == tank_id).first()
        )
        if tank is None:
            raise ValueError(f"Tank with tank_id={tank_id} not found")

        branch_id: Optional[int] = tank.branch_id
        hospital_id: Optional[int] = (
            tank.branch.hospital_id
            if tank.branch is not None
            else None
        )

        logger.info(
            f"Creating refill detection: tank_id={tank_id}, "
            f"branch_id={branch_id}, hospital_id={hospital_id}, "
            f"detected_at={detected_at}, refill_weight={refill_weight}"
        )

        # ------------------------------------------------------------------ #
        # 2. Insert the detection record
        # ------------------------------------------------------------------ #
        detection = Ln2RefillDetection(
            tank_id=tank_id,
            branch_id=branch_id,
            hospital_id=hospital_id,
            detected_at=detected_at,
            refill_weight=refill_weight,
        )

        self.db.add(detection)
        self.db.commit()
        self.db.refresh(detection)

        return detection
