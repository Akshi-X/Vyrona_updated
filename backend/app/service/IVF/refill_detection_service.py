"""
Service for creating and managing LN2 refill detection records.
"""
import logging
from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy.orm import Session

from app.models.IVF.ln2_refill_detection_model import Ln2RefillDetection
from app.models.IVF.tank_model import Tank
from app.models.user_model import User
from app.service.activity_log_service import (
    ActivityLogService,
    build_actor_from_user,
    build_system_actor,
    build_target,
    is_audit_log_disabled_for_user,
)
from app.constants.enums import ActivityOutcome

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

        ActivityLogService(self.db).log_activity(
            action="refill_detection.created",
            outcome=ActivityOutcome.SUCCESS.value,
            actor=build_system_actor("refill_detection"),
            target=build_target("refill_detection", str(detection.id)),
            metadata={
                "tank_id": tank_id,
                "branch_id": branch_id,
                "hospital_id": hospital_id,
                "refill_weight": refill_weight,
            },
        )

        return detection

    def get_pending_detections(
        self, hospital_id: Optional[int], branch_id: Optional[int] = None
    ) -> List[Ln2RefillDetection]:
        """
        Return unconfirmed (is_confirmed IS NULL) detections for a hospital.
        Optionally scoped to a specific branch for regular users.
        """
        query = self.db.query(Ln2RefillDetection).filter(
            Ln2RefillDetection.is_confirmed == None  # noqa: E711
        )
        if hospital_id is not None:
            query = query.filter(Ln2RefillDetection.hospital_id == hospital_id)
        if branch_id is not None:
            query = query.filter(Ln2RefillDetection.branch_id == branch_id)
        return query.order_by(Ln2RefillDetection.detected_at.asc()).all()

    def review_detection(
        self,
        detection_id: int,
        is_confirmed: bool,
        confirmed_by: str,
        notes: Optional[str] = None,
    ) -> Ln2RefillDetection:
        """
        Confirm or reject a detected refill event.

        Args:
            detection_id: Primary key of the detection record.
            is_confirmed: True to confirm, False to reject.
            confirmed_by: Identifier of the staff member reviewing.
            notes:        Optional staff notes.

        Returns:
            The updated Ln2RefillDetection row.

        Raises:
            ValueError: If the detection_id does not exist.
        """
        detection: Optional[Ln2RefillDetection] = (
            self.db.query(Ln2RefillDetection)
            .filter(Ln2RefillDetection.id == detection_id)
            .first()
        )
        if detection is None:
            raise ValueError(f"Refill detection with id={detection_id} not found")

        detection.is_confirmed = is_confirmed
        detection.acknowledged_by = confirmed_by
        detection.acknowledged_at = datetime.now(timezone.utc)
        if notes is not None:
            detection.notes = notes

        self.db.commit()
        self.db.refresh(detection)

        reviewer = (
            self.db.query(User)
            .filter(User.user_id == confirmed_by)
            .first()
        )
        ActivityLogService(self.db).log_activity(
            action="refill_detection.reviewed",
            outcome=ActivityOutcome.SUCCESS.value,
            actor=build_actor_from_user(reviewer),
            target=build_target("refill_detection", str(detection.id)),
            metadata={"is_confirmed": is_confirmed, "notes": notes},
            audit_log_disabled=is_audit_log_disabled_for_user(reviewer),
        )

        logger.info(
            f"Refill detection id={detection_id} reviewed: "
            f"is_confirmed={is_confirmed}, confirmed_by={confirmed_by}"
        )
        return detection
