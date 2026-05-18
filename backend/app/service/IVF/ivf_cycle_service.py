from typing import List, Optional
import logging

from sqlalchemy.orm import Session

from ...models.IVF.ivf_cycle_model import IvfCycle
from ...models.IVF.ivf_cycle_log_model import IvfCycleLog
from ...schemas.IVF.ivf_cycle_schema import CycleCreate, CycleUpdate, LogUpsert

logger = logging.getLogger(__name__)


class IvfCycleService:

    def __init__(self, db: Session):
        self.db = db

    # ── Cycle ────────────────────────────────────────────────────────────────

    def create_cycle(self, hospital_id: int, data: CycleCreate, user_id: Optional[str] = None) -> IvfCycle:
        cycle = IvfCycle(
            hospital_id=hospital_id,
            created_by=user_id,
            updated_by=user_id,
            **data.model_dump(),
        )
        self.db.add(cycle)
        self.db.flush()  # get cycle_id before inserting logs

        m2 = data.oocyte_m2 or 0
        m1 = data.oocyte_m1 or 0
        others = data.oocyte_others or 0
        total_injected = m2 + m1 + others

        for i in range(total_injected):
            if i < m2:
                maturity = "MII"
            elif i < m2 + m1:
                maturity = "MI"
            else:
                maturity = "Others"
            self.db.add(IvfCycleLog(
                cycle_id=cycle.cycle_id,
                oocyte_no=i + 1,
                d0_maturity=maturity,
                created_by=user_id,
                updated_by=user_id,
            ))

        self.db.commit()
        self.db.refresh(cycle)
        logger.info("Created ivf_cycle cycle_id=%s his_id=%s with %d log rows", cycle.cycle_id, cycle.his_id, total_injected)
        return cycle

    def list_cycles(
        self,
        hospital_id: int,
        branch_id: Optional[int] = None,
        his_id: Optional[str] = None,
        status: Optional[str] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> List[IvfCycle]:
        q = self.db.query(IvfCycle).filter(IvfCycle.hospital_id == hospital_id)
        if branch_id:
            q = q.filter(IvfCycle.branch_id == branch_id)
        if his_id:
            q = q.filter(IvfCycle.his_id.ilike(f"%{his_id}%"))
        if status:
            q = q.filter(IvfCycle.status == status)
        return q.order_by(IvfCycle.created_at.desc()).offset(skip).limit(limit).all()

    def get_cycle(self, cycle_id: int, hospital_id: int) -> Optional[IvfCycle]:
        return (
            self.db.query(IvfCycle)
            .filter(IvfCycle.cycle_id == cycle_id, IvfCycle.hospital_id == hospital_id)
            .first()
        )

    def update_cycle(self, cycle_id: int, hospital_id: int, data: CycleUpdate, user_id: Optional[str] = None) -> Optional[IvfCycle]:
        cycle = self.get_cycle(cycle_id, hospital_id)
        if not cycle:
            return None
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(cycle, field, value)
        cycle.updated_by = user_id
        self.db.commit()
        self.db.refresh(cycle)
        return cycle

    # ── Log ──────────────────────────────────────────────────────────────────

    def upsert_log(self, cycle_id: int, data: LogUpsert, user_id: Optional[str] = None) -> IvfCycleLog:
        """Create log row or update it if oocyte_no already exists in this cycle."""
        log = (
            self.db.query(IvfCycleLog)
            .filter(IvfCycleLog.cycle_id == cycle_id, IvfCycleLog.oocyte_no == data.oocyte_no)
            .first()
        )
        if log:
            for field, value in data.model_dump(exclude_unset=True).items():
                setattr(log, field, value)
            log.updated_by = user_id
        else:
            log = IvfCycleLog(cycle_id=cycle_id, created_by=user_id, updated_by=user_id, **data.model_dump(exclude_none=True))
            self.db.add(log)
        self.db.commit()
        self.db.refresh(log)
        return log

    def get_logs(self, cycle_id: int) -> List[IvfCycleLog]:
        return (
            self.db.query(IvfCycleLog)
            .filter(IvfCycleLog.cycle_id == cycle_id)
            .order_by(IvfCycleLog.oocyte_no)
            .all()
        )

    def delete_log(self, log_id: int, cycle_id: int) -> bool:
        log = (
            self.db.query(IvfCycleLog)
            .filter(IvfCycleLog.log_id == log_id, IvfCycleLog.cycle_id == cycle_id)
            .first()
        )
        if not log:
            return False
        self.db.delete(log)
        self.db.commit()
        return True
