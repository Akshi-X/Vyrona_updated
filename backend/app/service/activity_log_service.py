from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Sequence, Tuple

from sqlalchemy import String, cast, or_
from sqlalchemy.orm import Session

from app.config.config import settings
from app.constants.enums import ActivityActorType, ActivityOutcome
from app.models.activity_log_model import ActivityLog
from app.models.user_model import User
from app.models.IVF.tank_model import Tank
from app.models.IVF.hospital_branch_model import HospitalBranch
from app.models.IVF.hospital_model import Hospital


@dataclass
class ActivityActor:
    actor_type: str
    actor_id: Optional[str]
    actor_label: Optional[str]
    hospital_id: Optional[int] = None


@dataclass
class ActivityTarget:
    target_type: Optional[str]
    target_id: Optional[str]
    target_label: Optional[str]
    hospital_id: Optional[int] = None


class ActivityLogService:
    def __init__(self, db: Session):
        self.db = db

    def log_activity(
        self,
        action: str,
        outcome: str,
        actor: ActivityActor,
        target: Optional[ActivityTarget] = None,
        metadata: Optional[Dict[str, Any]] = None,
        audit_log_disabled: bool = False,
    ) -> Optional[ActivityLog]:
        # if settings.is_development or not settings.AUDIT_LOG_ENABLED or audit_log_disabled:
        #     return None

        hospital_id = actor.hospital_id
        if hospital_id is None and target is not None:
            hospital_id = target.hospital_id
        if hospital_id is None and target is not None:
            hospital_id = self._resolve_target_hospital_id(target)

        record = ActivityLog(
            action=action,
            outcome=outcome,
            actor_type=actor.actor_type,
            actor_id=actor.actor_id,
            actor_label=actor.actor_label,
            hospital_id=hospital_id,
            target_type=target.target_type if target else None,
            target_id=target.target_id if target else None,
            target_label=target.target_label if target else None,
            metadata_json=metadata or None,
            created_at=datetime.now(timezone.utc),
        )
        self.db.add(record)
        self.db.commit()
        self.db.refresh(record)
        return record

    def query_logs(
        self,
        hospital_id: Optional[int] = None,
        actions: Optional[List[str]] = None,
        action_prefix: Optional[str] = None,
        action: Optional[str] = None,
        actor_type: Optional[str] = None,
        actor_id: Optional[str] = None,
        target_type: Optional[str] = None,
        target_id: Optional[str] = None,
        outcome: Optional[str] = None,
        metadata_key: Optional[str] = None,
        metadata_value: Optional[str] = None,
        search: Optional[str] = None,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> Tuple[List[ActivityLog], int]:
        query = self.db.query(ActivityLog)

        if hospital_id is not None:
            query = query.filter(ActivityLog.hospital_id == hospital_id)

        if actions:
            query = query.filter(ActivityLog.action.in_(actions))
        elif action:
            query = query.filter(ActivityLog.action == action)
        elif action_prefix:
            query = query.filter(ActivityLog.action.like(f"{action_prefix}%"))

        if actor_type:
            query = query.filter(ActivityLog.actor_type == actor_type)
        if actor_id:
            query = query.filter(ActivityLog.actor_id == actor_id)
        if target_type:
            query = query.filter(ActivityLog.target_type == target_type)
        if target_id:
            query = query.filter(ActivityLog.target_id == target_id)
        if outcome:
            query = query.filter(ActivityLog.outcome == outcome)
        if metadata_key and metadata_value is not None:
            query = query.filter(ActivityLog.metadata_json[metadata_key].astext == str(metadata_value))
        if search:
            term = f"%{search.strip()}%"
            query = query.filter(
                or_(
                    ActivityLog.action.ilike(term),
                    ActivityLog.actor_label.ilike(term),
                    ActivityLog.actor_id.ilike(term),
                    ActivityLog.target_label.ilike(term),
                    ActivityLog.target_id.ilike(term),
                    cast(ActivityLog.metadata_json, String).ilike(term),
                )
            )
        if date_from:
            query = query.filter(ActivityLog.created_at >= date_from)
        if date_to:
            query = query.filter(ActivityLog.created_at <= date_to)

        total_count = query.count()
        rows = (
            query.order_by(ActivityLog.created_at.desc())
            .offset(max(page - 1, 0) * page_size)
            .limit(page_size)
            .all()
        )
        return rows, total_count

    def enrich_logs(self, rows: Sequence[ActivityLog]) -> List[Dict[str, Any]]:
        if not rows:
            return []

        actor_map = self._hydrate_actors(rows)
        target_map = self._hydrate_targets(rows)

        enriched: List[Dict[str, Any]] = []
        for row in rows:
            enriched.append(
                {
                    "id": row.id,
                    "action": row.action,
                    "outcome": row.outcome,
                    "actor_type": row.actor_type,
                    "actor_id": row.actor_id,
                    "actor_label": row.actor_label,
                    "hospital_id": row.hospital_id,
                    "target_type": row.target_type,
                    "target_id": row.target_id,
                    "target_label": row.target_label,
                    "metadata": row.metadata_json,
                    "created_at": row.created_at,
                    "actor_details": actor_map.get((row.actor_type, row.actor_id)),
                    "target_details": target_map.get((row.target_type, row.target_id)),
                }
            )
        return enriched

    def _hydrate_actors(self, rows: Sequence[ActivityLog]) -> Dict[Tuple[Optional[str], Optional[str]], Dict[str, Any]]:
        actor_ids_by_type: Dict[str, set[str]] = {}
        for row in rows:
            if not row.actor_type or not row.actor_id:
                continue
            actor_ids_by_type.setdefault(row.actor_type, set()).add(row.actor_id)

        hydrated: Dict[Tuple[Optional[str], Optional[str]], Dict[str, Any]] = {}

        for actor_type, ids in actor_ids_by_type.items():
            if actor_type == ActivityActorType.USER.value:
                users = self.db.query(User).filter(User.user_id.in_(ids)).all()
                branch_ids = {user.branch_id for user in users if user.branch_id is not None}
                branch_map: Dict[int, str] = {}
                if branch_ids:
                    for branch in (
                        self.db.query(HospitalBranch)
                        .filter(HospitalBranch.branch_id.in_(branch_ids))
                        .all()
                    ):
                        branch_map[branch.branch_id] = branch.branch_name

                for user in users:
                    hydrated[(actor_type, user.user_id)] = {
                        "user_id": user.user_id,
                        "first_name": user.first_name,
                        "last_name": user.last_name,
                        "email": user.email,
                        "role": user.role.value if hasattr(user.role, "value") else str(user.role),
                        "branch_id": user.branch_id,
                        "branch_name": branch_map.get(user.branch_id),
                    }
            elif actor_type == ActivityActorType.SYSTEM.value:
                for actor_id in ids:
                    hydrated[(actor_type, actor_id)] = {"label": "System"}
            elif actor_type == ActivityActorType.SCHEDULER.value:
                for actor_id in ids:
                    hydrated[(actor_type, actor_id)] = {"label": "Scheduler"}
            elif actor_type == ActivityActorType.WEBHOOK.value:
                for actor_id in ids:
                    hydrated[(actor_type, actor_id)] = {"webhook_id": actor_id}
            elif actor_type == ActivityActorType.INTEGRATION.value:
                for actor_id in ids:
                    hydrated[(actor_type, actor_id)] = {"integration_id": actor_id}

        return hydrated

    def _hydrate_targets(self, rows: Sequence[ActivityLog]) -> Dict[Tuple[Optional[str], Optional[str]], Dict[str, Any]]:
        target_ids_by_type: Dict[str, set[str]] = {}
        for row in rows:
            if not row.target_type or not row.target_id:
                continue
            target_ids_by_type.setdefault(row.target_type, set()).add(row.target_id)

        hydrated: Dict[Tuple[Optional[str], Optional[str]], Dict[str, Any]] = {}

        for target_type, ids in target_ids_by_type.items():
            if target_type == "user":
                users = self.db.query(User).filter(User.user_id.in_(ids)).all()
                branch_ids = {user.branch_id for user in users if user.branch_id is not None}
                branch_map: Dict[int, str] = {}
                if branch_ids:
                    for branch in (
                        self.db.query(HospitalBranch)
                        .filter(HospitalBranch.branch_id.in_(branch_ids))
                        .all()
                    ):
                        branch_map[branch.branch_id] = branch.branch_name

                for user in users:
                    hydrated[(target_type, user.user_id)] = {
                        "user_id": user.user_id,
                        "first_name": user.first_name,
                        "last_name": user.last_name,
                        "email": user.email,
                        "role": user.role.value if hasattr(user.role, "value") else str(user.role),
                        "branch_id": user.branch_id,
                        "branch_name": branch_map.get(user.branch_id),
                    }
            elif target_type == "tank":
                tank_ids = [int(value) for value in ids if value.isdigit()]
                if tank_ids:
                    tanks = self.db.query(Tank).filter(Tank.tank_id.in_(tank_ids)).all()
                    branch_ids = {tank.branch_id for tank in tanks if tank.branch_id is not None}
                    branch_map: Dict[int, HospitalBranch] = {}
                    if branch_ids:
                        for branch in (
                            self.db.query(HospitalBranch)
                            .filter(HospitalBranch.branch_id.in_(branch_ids))
                            .all()
                        ):
                            branch_map[branch.branch_id] = branch

                    for tank in tanks:
                        branch = branch_map.get(tank.branch_id)
                        hydrated[(target_type, str(tank.tank_id))] = {
                            "tank_id": tank.tank_id,
                            "tank_code": tank.tank_code,
                            "branch_id": tank.branch_id,
                            "branch_name": branch.branch_name if branch else None,
                            "hospital_id": branch.hospital_id if branch else None,
                        }
            elif target_type == "branch":
                branch_ids = [int(value) for value in ids if value.isdigit()]
                if branch_ids:
                    for branch in self.db.query(HospitalBranch).filter(HospitalBranch.branch_id.in_(branch_ids)).all():
                        hydrated[(target_type, str(branch.branch_id))] = {
                            "branch_id": branch.branch_id,
                            "branch_name": branch.branch_name,
                            "hospital_id": branch.hospital_id,
                        }
            elif target_type == "hospital":
                hospital_ids = [int(value) for value in ids if value.isdigit()]
                if hospital_ids:
                    for hospital in self.db.query(Hospital).filter(Hospital.hospital_id.in_(hospital_ids)).all():
                        hydrated[(target_type, str(hospital.hospital_id))] = {
                            "hospital_id": hospital.hospital_id,
                            "hospital_name": hospital.hospital_name,
                        }

        return hydrated

    def _resolve_target_hospital_id(self, target: ActivityTarget) -> Optional[int]:
        if not target.target_type or not target.target_id:
            return None

        if target.target_type == "hospital":
            return int(target.target_id) if target.target_id.isdigit() else None

        if target.target_type == "branch":
            if not target.target_id.isdigit():
                return None
            branch = (
                self.db.query(HospitalBranch)
                .filter(HospitalBranch.branch_id == int(target.target_id))
                .first()
            )
            return branch.hospital_id if branch else None

        if target.target_type == "tank":
            if not target.target_id.isdigit():
                return None
            tank = (
                self.db.query(Tank)
                .filter(Tank.tank_id == int(target.target_id))
                .first()
            )
            if not tank or tank.branch_id is None:
                return None
            branch = (
                self.db.query(HospitalBranch)
                .filter(HospitalBranch.branch_id == int(tank.branch_id))
                .first()
            )
            return branch.hospital_id if branch else None

        if target.target_type == "user":
            user = (
                self.db.query(User)
                .filter(User.user_id == target.target_id)
                .first()
            )
            return user.hospital_id if user else None

        return None


def build_actor_from_user(user: Optional[User]) -> ActivityActor:
    if not user:
        return ActivityActor(actor_type=ActivityActorType.SYSTEM.value, actor_id=None, actor_label="System")

    label = f"{user.first_name} {user.last_name}".strip()
    return ActivityActor(
        actor_type=ActivityActorType.USER.value,
        actor_id=user.user_id,
        actor_label=label or user.email,
        hospital_id=user.hospital_id,
    )


def build_system_actor(label: str = "System") -> ActivityActor:
    return ActivityActor(actor_type=ActivityActorType.SYSTEM.value, actor_id="system", actor_label=label)


def build_scheduler_actor(job_name: str) -> ActivityActor:
    return ActivityActor(actor_type=ActivityActorType.SCHEDULER.value, actor_id=job_name, actor_label=job_name)


def build_target(
    target_type: Optional[str],
    target_id: Optional[str],
    target_label: Optional[str] = None,
    hospital_id: Optional[int] = None,
) -> ActivityTarget:
    return ActivityTarget(
        target_type=target_type,
        target_id=target_id,
        target_label=target_label,
        hospital_id=hospital_id,
    )


def is_audit_log_disabled_for_user(user: Optional[User]) -> bool:
    if not user:
        return False
    role_value = user.role.value if hasattr(user.role, "value") else str(user.role)
    return role_value.lower() == "mygrape_admin"
