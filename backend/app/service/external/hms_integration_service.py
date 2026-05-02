"""Service for processing single-record HMS push updates to patient_crylock_info.

Mirrors the upsert behaviour in `arc_ivf_service.save_ivf_storage_to_db` but is
scoped to the calling admin's hospital_id (not the global "ARC Fertility Hospitals"
default) and writes an activity_log entry per record with `actor=integration`,
`target=system`, and a structural diff in metadata that excludes HIS data.
"""

from __future__ import annotations

import logging
import time
from datetime import date, datetime, timezone
from typing import Any, Dict, Optional

from psycopg2.errors import DeadlockDetected
from sqlalchemy import func, or_
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.constants.enums import ActivityActorType, ActivityOutcome
from app.models.IVF.hospital_branch_model import HospitalBranch
from app.models.IVF.hospital_model import Hospital
from app.models.IVF.patient_crylock_info_model import PatientCrylockInfo
from app.models.IVF.tank_model import Tank
from app.models.user_model import User
from app.schemas.external.hms_schema import HMSCryolockUpdate
from app.service.activity_log_service import (
    ActivityActor,
    ActivityLogService,
    ActivityTarget,
)
from app.utils.ivf_helpers import (
    encrypt_sensitive_ivf_value,
    extract_canister_code_from_cryolock_number,
    extract_cane_code_from_cryolock_number,
    extract_position_from_cryolock_number,
    extract_tank_code_from_cryolock_number,
)
from app.utils.reservoir_utils import ensure_branch_reservoir

logger = logging.getLogger(__name__)


# Fields whose old/new values are safe to log as the change diff.
# Excludes his_number, crylock_number (encrypted PII), and siteName.
_LOGGABLE_DIFF_FIELDS = (
    "tank_id",
    "branch_id",
    "tank_code",
    "canister_number",
    "cane_code",
    "position_number",
    "tank_id_arc",
    "cane_id_arc",
    "date_of_vitrification",
)


class HMSIntegrationService:
    def __init__(self, db: Session):
        self.db = db

    def apply_cryolock_update(
        self,
        payload: HMSCryolockUpdate,
        hospital_id: int,
        actor_user: User,
    ) -> Dict[str, Any]:
        """Apply one HMS cryolock update. Always returns a result dict — never raises."""
        try:
            return self._apply_one(payload, hospital_id, actor_user)
        except Exception as e:
            self.db.rollback()
            logger.error(
                "HMS cryolock update failed (hospital_id=%s): %s",
                hospital_id,
                e,
                exc_info=True,
            )
            self._log_failure(hospital_id, actor_user, payload, reason=str(e))
            return {
                "status": "failed",
                "operation": None,
                "patient_crylock_id": None,
                "tank_id": None,
                "branch_id": None,
                "reason": str(e),
            }

    def _apply_one(
        self,
        payload: HMSCryolockUpdate,
        hospital_id: int,
        actor_user: User,
    ) -> Dict[str, Any]:
        cryolock_number = payload.cryolockNumber.strip()
        his_number = payload.hisNumber.strip()
        site_name = payload.siteName.strip()

        tank_code = extract_tank_code_from_cryolock_number(cryolock_number)
        canister_from_cryolock = extract_canister_code_from_cryolock_number(cryolock_number)
        cane_code = extract_cane_code_from_cryolock_number(cryolock_number)
        position_number = extract_position_from_cryolock_number(cryolock_number)

        if position_number is None:
            return {
                "status": "skipped",
                "operation": None,
                "patient_crylock_id": None,
                "tank_id": None,
                "branch_id": None,
                "reason": (
                    f"cryolockNumber '{cryolock_number}' does not have a numeric position; skipped"
                ),
            }

        if not tank_code:
            return {
                "status": "skipped",
                "operation": None,
                "patient_crylock_id": None,
                "tank_id": None,
                "branch_id": None,
                "reason": f"cryolockNumber '{cryolock_number}' missing tank code segment",
            }

        canister_to_use = canister_from_cryolock or (
            payload.canisterNumber.strip() if payload.canisterNumber else None
        )
        date_of_vitrification = self._parse_date(payload.dateofVitrification)

        hospital = (
            self.db.query(Hospital)
            .filter(Hospital.hospital_id == hospital_id)
            .first()
        )
        if not hospital:
            raise ValueError(f"Hospital {hospital_id} not found for calling admin")

        branch = self._resolve_or_create_branch(hospital.hospital_id, site_name, actor_user.user_id)
        tank = self._resolve_or_create_tank(
            tank_code=tank_code,
            tank_id_arc=payload.tankID,
            branch_id=branch.branch_id,
            created_by=actor_user.user_id,
        )
        if not tank:
            raise RuntimeError(
                f"Could not resolve tank for tank_code={tank_code} in branch={branch.branch_id}"
            )

        encrypted_his = encrypt_sensitive_ivf_value(his_number)
        encrypted_crylock = encrypt_sensitive_ivf_value(cryolock_number)

        existing: Optional[PatientCrylockInfo] = (
            self.db.query(PatientCrylockInfo)
            .filter(
                or_(
                    PatientCrylockInfo.his_number == encrypted_his,
                    PatientCrylockInfo.his_number == his_number,
                ),
                or_(
                    PatientCrylockInfo.crylock_number == encrypted_crylock,
                    PatientCrylockInfo.crylock_number == cryolock_number,
                ),
            )
            .first()
        )

        new_values = {
            "branch_id": branch.branch_id,
            "tank_id": tank.tank_id,
            "tank_code": tank_code,
            "canister_number": canister_to_use,
            "cane_code": cane_code,
            "position_number": position_number,
            "tank_id_arc": payload.tankID,
            "cane_id_arc": payload.caneID,
            "date_of_vitrification": date_of_vitrification,
        }

        if existing is None:
            record = PatientCrylockInfo(
                branch_id=new_values["branch_id"],
                tank_id=new_values["tank_id"],
                his_number=encrypted_his,
                crylock_number=encrypted_crylock,
                tank_code=new_values["tank_code"],
                canister_number=new_values["canister_number"],
                cane_code=new_values["cane_code"],
                position_number=new_values["position_number"],
                tank_id_arc=new_values["tank_id_arc"],
                cane_id_arc=new_values["cane_id_arc"],
                date_of_vitrification=new_values["date_of_vitrification"],
                in_transit=False,
                embryo_transfer=False,
                created_by=actor_user.user_id,
            )
            self.db.add(record)
            self.db.flush()

            diff = {field: {"old": None, "new": new_values[field]} for field in _LOGGABLE_DIFF_FIELDS}
            self._log_record(
                hospital_id=hospital_id,
                actor_user=actor_user,
                operation="create",
                record_id=record.id,
                tank_id=record.tank_id,
                branch_id=record.branch_id,
                changes=diff,
            )
            self.db.commit()

            return {
                "status": "success",
                "operation": "create",
                "patient_crylock_id": record.id,
                "tank_id": record.tank_id,
                "branch_id": record.branch_id,
                "reason": None,
            }

        diff: Dict[str, Dict[str, Any]] = {}
        for field in _LOGGABLE_DIFF_FIELDS:
            old_value = getattr(existing, field)
            new_value = new_values[field]
            if new_value is None:
                continue
            if old_value != new_value:
                diff[field] = {
                    "old": self._serialize(old_value),
                    "new": self._serialize(new_value),
                }
                setattr(existing, field, new_value)

        # Encrypt legacy plaintext on first touch.
        if existing.his_number != encrypted_his:
            existing.his_number = encrypted_his
        if existing.crylock_number != encrypted_crylock:
            existing.crylock_number = encrypted_crylock

        if diff:
            existing.updated_by = actor_user.user_id
            existing.updated_at = datetime.now(timezone.utc)

        self.db.flush()

        operation = "update" if diff else "noop"
        self._log_record(
            hospital_id=hospital_id,
            actor_user=actor_user,
            operation=operation,
            record_id=existing.id,
            tank_id=existing.tank_id,
            branch_id=existing.branch_id,
            changes=diff,
        )
        self.db.commit()

        return {
            "status": "success",
            "operation": operation,
            "patient_crylock_id": existing.id,
            "tank_id": existing.tank_id,
            "branch_id": existing.branch_id,
            "reason": None,
        }

    def _resolve_or_create_branch(
        self,
        hospital_id: int,
        site_name: str,
        created_by: str,
    ) -> HospitalBranch:
        branch = (
            self.db.query(HospitalBranch)
            .filter(
                func.lower(HospitalBranch.branch_name) == func.lower(site_name),
                HospitalBranch.hospital_id == hospital_id,
            )
            .first()
        )
        if branch:
            return branch

        branch = HospitalBranch(
            hospital_id=hospital_id,
            branch_name=site_name,
            created_by=created_by,
        )
        self.db.add(branch)
        self.db.flush()
        ensure_branch_reservoir(
            self.db,
            branch_id=branch.branch_id,
            hospital_id=hospital_id,
            branch_name=branch.branch_name or f"Branch {branch.branch_id}",
        )
        logger.info(
            "HMS integration created new branch %s ('%s') under hospital %s",
            branch.branch_id,
            branch.branch_name,
            hospital_id,
        )
        return branch

    def _resolve_or_create_tank(
        self,
        tank_code: str,
        tank_id_arc: Optional[str],
        branch_id: int,
        created_by: str,
    ) -> Optional[Tank]:
        retries = 0
        max_retries = 3
        delay = 0.1

        while retries <= max_retries:
            try:
                tank = (
                    self.db.query(Tank)
                    .filter(Tank.tank_code == tank_code, Tank.branch_id == branch_id)
                    .order_by(Tank.tank_id)
                    .with_for_update(nowait=False)
                    .first()
                )
                if tank is None:
                    tank = Tank(
                        branch_id=branch_id,
                        tank_code=tank_code,
                        tank_id_arc=tank_id_arc,
                        is_active=True,
                        created_by=created_by,
                    )
                    self.db.add(tank)
                    self.db.flush()
                else:
                    if tank_id_arc and tank.tank_id_arc != tank_id_arc:
                        tank.tank_id_arc = tank_id_arc
                        tank.updated_by = created_by
                        tank.updated_at = datetime.now(timezone.utc)
                        self.db.flush()
                return tank
            except OperationalError as e:
                if isinstance(e.orig, DeadlockDetected) and retries < max_retries:
                    retries += 1
                    self.db.rollback()
                    time.sleep(delay)
                    delay = min(delay * 2.0, 1.0)
                    continue
                raise
        return None

    def _log_record(
        self,
        hospital_id: int,
        actor_user: User,
        operation: str,
        record_id: int,
        tank_id: int,
        branch_id: int,
        changes: Dict[str, Dict[str, Any]],
    ) -> None:
        ActivityLogService(self.db).log_activity(
            action="patient_crylock.hms_update",
            outcome=ActivityOutcome.SUCCESS.value,
            actor=ActivityActor(
                actor_type=ActivityActorType.INTEGRATION.value,
                actor_id="hms",
                actor_label=f"HMS via admin {actor_user.email}",
                hospital_id=hospital_id,
            ),
            target=ActivityTarget(
                target_type="system",
                target_id=None,
                target_label="patient_crylock_info",
                hospital_id=hospital_id,
            ),
            metadata={
                "operation": operation,
                "patient_crylock_id": record_id,
                "tank_id": tank_id,
                "branch_id": branch_id,
                "admin_user_id": actor_user.user_id,
                "changes": changes,
            },
        )

    def _log_failure(
        self,
        hospital_id: int,
        actor_user: User,
        payload: HMSCryolockUpdate,
        reason: str,
    ) -> None:
        try:
            ActivityLogService(self.db).log_activity(
                action="patient_crylock.hms_update",
                outcome=ActivityOutcome.FAILURE.value,
                actor=ActivityActor(
                    actor_type=ActivityActorType.INTEGRATION.value,
                    actor_id="hms",
                    actor_label=f"HMS via admin {actor_user.email}",
                    hospital_id=hospital_id,
                ),
                target=ActivityTarget(
                    target_type="system",
                    target_id=None,
                    target_label="patient_crylock_info",
                    hospital_id=hospital_id,
                ),
                metadata={
                    "admin_user_id": actor_user.user_id,
                    "site_name_provided": bool(payload.siteName),
                    "tank_code": extract_tank_code_from_cryolock_number(payload.cryolockNumber),
                    "reason": reason,
                },
            )
        except Exception:
            logger.exception("Failed to record HMS update failure activity log")

    @staticmethod
    def _parse_date(value: Optional[str]) -> Optional[date]:
        if not value:
            return None
        try:
            return datetime.strptime(value, "%Y-%m-%d").date()
        except (ValueError, TypeError):
            logger.warning("HMS payload had unparseable dateofVitrification=%r", value)
            return None

    @staticmethod
    def _serialize(value: Any) -> Any:
        if isinstance(value, date) and not isinstance(value, datetime):
            return value.isoformat()
        if isinstance(value, datetime):
            return value.isoformat()
        return value
