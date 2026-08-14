from typing import List, Optional
import logging

from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from ...models.IVF.ivf_cycle_model import IvfCycle
from ...models.IVF.ivf_cycle_log_model import IvfCycleLog
from ...models.IVF.ivf_oocyte_image_model import IvfOocyteImage
from ...models.IVF.ivf_cycle_report_model import IvfCycleReport
from ...models.IVF.ivf_oocyte_grade_model import IvfOocyteGrade
from ...schemas.IVF.ivf_cycle_schema import GradeUpsert
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
        total_injected = m2 + m1

        for i in range(total_injected):
            if i < m2:
                maturity = "MII"
            else:
                maturity = "MI"
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
        incubator_id: Optional[int] = None,
        chamber_position: Optional[str] = None,
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
        if incubator_id is not None:
            q = q.filter(IvfCycle.incubator_id == incubator_id)
        if chamber_position:
            q = q.filter(IvfCycle.chamber_position == chamber_position)
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
        logs = (
            self.db.query(IvfCycleLog)
            .filter(IvfCycleLog.cycle_id == cycle_id)
            .order_by(IvfCycleLog.oocyte_no)
            .all()
        )
        counts = dict(
            self.db.query(IvfOocyteGrade.log_id, func.count(IvfOocyteGrade.grade_id))
            .filter(IvfOocyteGrade.cycle_id == cycle_id, IvfOocyteGrade.is_active.is_(True))
            .group_by(IvfOocyteGrade.log_id)
            .all()
        )
        for log in logs:
            log.grade_count = counts.get(log.log_id, 0)
        return logs

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

    # ── Reports ──────────────────────────────────────────────────────────────

    def add_report(
        self,
        cycle_id: int,
        file_url: str,
        file_name: Optional[str] = None,
        file_size: Optional[int] = None,
        report_type: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> IvfCycleReport:
        report = IvfCycleReport(
            cycle_id=cycle_id,
            file_url=file_url,
            file_name=file_name,
            file_size=file_size,
            report_type=report_type,
            generated_by=user_id,
        )
        self.db.add(report)
        self.db.commit()
        self.db.refresh(report)
        return report

    def list_reports(self, cycle_id: int) -> List[IvfCycleReport]:
        return (
            self.db.query(IvfCycleReport)
            .filter(IvfCycleReport.cycle_id == cycle_id)
            .order_by(IvfCycleReport.created_at.desc())
            .all()
        )

    def delete_report(self, report_id: int, cycle_id: int) -> Optional[str]:
        report = (
            self.db.query(IvfCycleReport)
            .filter(IvfCycleReport.report_id == report_id, IvfCycleReport.cycle_id == cycle_id)
            .first()
        )
        if not report:
            return None
        url = report.file_url
        self.db.delete(report)
        self.db.commit()
        return url

    # ── Oocyte Grade ─────────────────────────────────────────────────────────

    def create_grade(
        self,
        log_id: int,
        cycle_id: int,
        data: GradeUpsert,
        user_id: Optional[str] = None,
    ) -> IvfOocyteGrade:
        record = IvfOocyteGrade(
            log_id=log_id,
            cycle_id=cycle_id,
            graded_by=user_id,
            **data.model_dump(exclude_none=True),
        )
        self.db.add(record)
        self.db.commit()
        self.db.refresh(record)
        return record

    def update_grade(
        self,
        grade_id: int,
        cycle_id: int,
        data: GradeUpsert,
        user_id: Optional[str] = None,
    ) -> Optional[IvfOocyteGrade]:
        record = self.get_grade_by_id(grade_id, cycle_id)
        if not record:
            return None
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(record, field, value)
        record.graded_by = user_id
        if record.is_best and record.grade:
            log = self.db.query(IvfCycleLog).filter(IvfCycleLog.log_id == record.log_id).first()
            if log:
                log.blast_grade = record.grade
                log.updated_by = user_id
        self.db.commit()
        self.db.refresh(record)
        return record

    def list_grades(self, log_id: int) -> List[IvfOocyteGrade]:
        return (
            self.db.query(IvfOocyteGrade)
            .filter(IvfOocyteGrade.log_id == log_id)
            .options(selectinload(IvfOocyteGrade.images))
            .order_by(IvfOocyteGrade.created_at)
            .all()
        )

    def delete_grade(self, grade_id: int, cycle_id: int) -> bool:
        record = self.get_grade_by_id(grade_id, cycle_id)
        if not record:
            return False
        self.db.delete(record)
        self.db.commit()
        return True

    def select_best_grade(self, log_id: int, grade_id: int, cycle_id: int, user_id: Optional[str] = None) -> Optional[IvfOocyteGrade]:
        """Clear is_best on all grades for this log, then mark the chosen grade as best and sync blast_grade on the log."""
        grades = (
            self.db.query(IvfOocyteGrade)
            .filter(IvfOocyteGrade.log_id == log_id)
            .options(selectinload(IvfOocyteGrade.images))
            .all()
        )
        if not grades:
            return None
        chosen = None
        for g in grades:
            g.is_best = g.grade_id == grade_id
            if g.grade_id == grade_id:
                g.stage = 2
                g.graded_by = user_id
                chosen = g
        if chosen:
            log = self.db.query(IvfCycleLog).filter(IvfCycleLog.log_id == log_id).first()
            if log:
                log.blast_grade = chosen.grade
                log.updated_by = user_id
        self.db.commit()
        return chosen

    def get_grade_by_id(self, grade_id: int, cycle_id: int) -> Optional[IvfOocyteGrade]:
        return (
            self.db.query(IvfOocyteGrade)
            .filter(IvfOocyteGrade.grade_id == grade_id, IvfOocyteGrade.cycle_id == cycle_id)
            .options(selectinload(IvfOocyteGrade.images))
            .first()
        )

    # ── Images ───────────────────────────────────────────────────────────────

    def add_image(
        self,
        grade_id: int,
        cycle_id: int,
        upload_image_url: str,
        exp_img_url: Optional[str] = None,
        te_img_url: Optional[str] = None,
        icm_img_url: Optional[str] = None,
        annotated_img_url: Optional[str] = None,
        file_name: Optional[str] = None,
        file_size: Optional[int] = None,
        day: Optional[int] = None,
        user_id: Optional[str] = None,
    ) -> IvfOocyteImage:
        img = IvfOocyteImage(
            grade_id=grade_id,
            cycle_id=cycle_id,
            upload_image_url=upload_image_url,
            exp_img_url=exp_img_url,
            te_img_url=te_img_url,
            icm_img_url=icm_img_url,
            annotated_img_url=annotated_img_url,
            file_name=file_name,
            file_size=file_size,
            day=day,
            uploaded_by=user_id,
        )
        self.db.add(img)
        self.db.commit()
        self.db.refresh(img)
        return img

    def list_images(self, grade_id: int) -> List[IvfOocyteImage]:
        return (
            self.db.query(IvfOocyteImage)
            .filter(IvfOocyteImage.grade_id == grade_id)
            .order_by(IvfOocyteImage.created_at)
            .all()
        )

    def delete_image(self, image_id: int, cycle_id: int) -> Optional[List[Optional[str]]]:
        """Delete image record and return all blob URLs for the caller to clean up."""
        img = (
            self.db.query(IvfOocyteImage)
            .filter(IvfOocyteImage.image_id == image_id, IvfOocyteImage.cycle_id == cycle_id)
            .first()
        )
        if not img:
            return None
        urls = [img.upload_image_url, img.exp_img_url, img.te_img_url, img.icm_img_url]
        self.db.delete(img)
        self.db.commit()
        return urls
