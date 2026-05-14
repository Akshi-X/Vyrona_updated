"""
IVF Reports Service
Service layer for IVF reports with role-based access control.
"""
from datetime import date, datetime
from typing import List, Optional, Tuple

from sqlalchemy import func, text
from sqlalchemy.orm import Session

from ...models.IVF.critical_alert_model import CriticalAlert
from ...models.IVF.canister_ln2_log_model import CanisterLn2Log
from ...models.IVF.reservoir_model import Reservoir
from ...models.IVF.reservoir_log_model import ReservoirLog
from ...models.IVF.tank_model import Tank
from ...models.IVF.hospital_branch_model import HospitalBranch


class IVFReportsService:
    """Service for IVF reports with role-based filtering."""

    def __init__(self, db: Session):
        self.db = db

    def _get_branch_filter(self, branch_id: Optional[int], role: Optional[str]) -> Optional[int]:
        if role is None:
            return None
        role_normalized = role.title() if role else None
        if role_normalized == "Manager":
            return None
        if role_normalized == "User":
            return branch_id
        if role_normalized == "Admin":
            return None
        return None

    def _parse_month(self, month_value: Optional[str]) -> Tuple[datetime, datetime, str]:
        if month_value:
            try:
                year_text, month_text = month_value.split("-")
                year = int(year_text)
                month = int(month_text)
            except ValueError as exc:
                raise ValueError("Invalid month format. Use YYYY-MM.") from exc
        else:
            now = datetime.now()
            year = now.year
            month = now.month

        if month < 1 or month > 12:
            raise ValueError("Invalid month value.")

        start = datetime(year, month, 1)
        if month == 12:
            end = datetime(year + 1, 1, 1)
        else:
            end = datetime(year, month + 1, 1)

        return start, end, f"{year:04d}-{month:02d}"

    def _parse_date(self, value: Optional[str]) -> Optional[date]:
        if not value:
            return None
        try:
            return datetime.strptime(value, "%Y-%m-%d").date()
        except ValueError as exc:
            raise ValueError("Invalid date format. Use YYYY-MM-DD.") from exc

    def get_monthly_summary(
        self,
        hospital_id: int,
        branch_id: Optional[int],
        role: Optional[str],
        month: Optional[str],
        page: int,
        page_size: int,
    ) -> dict:
        filter_branch_id = self._get_branch_filter(branch_id, role)
        start, end, month_label = self._parse_month(month)

        query = text(
            """
            WITH kpi_list AS (
                SELECT DISTINCT
                    COALESCE(NULLIF(k.alert_name, ''), NULLIF(k.kpi_name, ''), 'Unknown') AS kpi_label
                FROM
                    kpi_config k
                WHERE
                    k.hospital_id = :hospital_id
                    AND (:branch_id IS NULL OR k.branch_id = :branch_id)
            ),
            alert_counts AS (
                SELECT
                    COALESCE(NULLIF(k.alert_name, ''), NULLIF(k.kpi_name, ''), 'Unknown') AS kpi_label,
                    COUNT(c.alert_id) AS alerts_sent,
                    SUM(CASE WHEN c.status = 'Active' THEN 1 ELSE 0 END) AS deviations_found
                FROM
                    critical_alerts c
                LEFT JOIN
                    kpi_config k ON k.id = CASE
                        WHEN c.dedup_key ~ ':[0-9]+$'
                        THEN CAST(regexp_replace(c.dedup_key, '^.*:', '') AS INTEGER)
                        ELSE NULL
                    END
                WHERE
                    c.hospital_id = :hospital_id
                    AND c.source = 'KPI'
                    AND c.occurred_at >= :start_date
                    AND c.occurred_at < :end_date
                    AND (:branch_id IS NULL OR c.branch_id = :branch_id)
                GROUP BY
                    COALESCE(NULLIF(k.alert_name, ''), NULLIF(k.kpi_name, ''), 'Unknown')
            )
            SELECT
                kl.kpi_label,
                COALESCE(ac.alerts_sent, 0) AS alerts_sent,
                COALESCE(ac.deviations_found, 0) AS deviations_found
            FROM
                kpi_list kl
            LEFT JOIN
                alert_counts ac ON ac.kpi_label = kl.kpi_label
            ORDER BY
                kl.kpi_label;
            """
        )

        rows = (
            self.db.execute(
                query,
                {
                    "hospital_id": hospital_id,
                    "branch_id": filter_branch_id,
                    "start_date": start,
                    "end_date": end,
                },
            )
            .mappings()
            .fetchall()
        )

        formatted_rows = [
            {
                "kpi_name": row["kpi_label"],
                "alerts_sent": int(row["alerts_sent"] or 0),
                "deviations_found": int(row["deviations_found"] or 0),
            }
            for row in rows
        ]

        total_count = len(formatted_rows)
        offset = max(page - 1, 0) * page_size
        paged_rows = formatted_rows[offset : offset + page_size]

        return {
            "month": month_label,
            "rows": paged_rows,
            "total_kpis": total_count,
            "total_count": total_count,
            "page": page,
            "page_size": page_size,
        }

    def get_critical_alerts_report(
        self,
        hospital_id: int,
        branch_id: Optional[int],
        role: Optional[str],
        start_date: Optional[str],
        end_date: Optional[str],
        status: Optional[str],
        severity: Optional[str],
        tank_codes: Optional[List[str]],
        page: int,
        page_size: int,
    ) -> dict:
        filter_branch_id = self._get_branch_filter(branch_id, role)
        start = self._parse_date(start_date)
        end = self._parse_date(end_date)

        query = (
            self.db.query(
                CriticalAlert,
                Tank.tank_code,
                HospitalBranch.branch_name,
            )
            .join(Tank, CriticalAlert.tank_id == Tank.tank_id)
            .join(HospitalBranch, CriticalAlert.branch_id == HospitalBranch.branch_id)
            .filter(CriticalAlert.hospital_id == hospital_id)
        )

        if filter_branch_id is not None:
            query = query.filter(CriticalAlert.branch_id == filter_branch_id)

        if status:
            query = query.filter(CriticalAlert.status == status)

        if severity:
            query = query.filter(CriticalAlert.severity == severity)

        if tank_codes:
            cleaned_codes = [code for code in tank_codes if code]
            if cleaned_codes:
                query = query.filter(Tank.tank_code.in_(cleaned_codes))

        if start:
            query = query.filter(CriticalAlert.occurred_at >= datetime.combine(start, datetime.min.time()))

        if end:
            query = query.filter(CriticalAlert.occurred_at <= datetime.combine(end, datetime.max.time()))

        total_count = query.order_by(None).count()
        offset = max(page - 1, 0) * page_size
        results = (
            query.order_by(CriticalAlert.occurred_at.desc())
            .offset(offset)
            .limit(page_size)
            .all()
        )

        alerts: List[dict] = []
        for alert, tank_code, branch_name in results:
            alerts.append(
                {
                    "alert_id": alert.alert_id,
                    "tank_id": alert.tank_id,
                    "tank_code": tank_code,
                    "branch_id": alert.branch_id,
                    "branch_name": branch_name,
                    "alert_type": alert.alert_type,
                    "source": alert.source,
                    "severity": alert.severity,
                    "status": alert.status,
                    "message": alert.message,
                    "triggered_by": alert.triggered_by,
                    "occurred_at": alert.occurred_at,
                    "acknowledged_by": alert.acknowledged_by,
                    "acknowledged_at": alert.acknowledged_at,
                    "created_at": alert.created_at,
                }
            )

        return {
            "alerts": alerts,
            "total_count": total_count,
            "page": page,
            "page_size": page_size,
        }

    def get_refill_logs_report(
        self,
        hospital_id: int,
        branch_id: Optional[int],
        role: Optional[str],
        start_date: Optional[str],
        end_date: Optional[str],
        status: Optional[str],
        tank_codes: Optional[List[str]],
        page: int,
        page_size: int,
    ) -> dict:
        filter_branch_id = self._get_branch_filter(branch_id, role)
        start = self._parse_date(start_date)
        end = self._parse_date(end_date)

        reservoir_log_subq = (
            self.db.query(
                ReservoirLog.reservoir_id.label("reservoir_id"),
                func.max(ReservoirLog.ln2_ordered_date).label("ln2_ordered_date"),
                func.max(ReservoirLog.ln2_received_date).label("ln2_received_date"),
            )
            .group_by(ReservoirLog.reservoir_id)
            .subquery()
        )

        query = (
            self.db.query(
                CanisterLn2Log,
                Tank.tank_code,
                HospitalBranch.branch_name,
                Reservoir.reservoir_name,
                reservoir_log_subq.c.ln2_ordered_date,
                reservoir_log_subq.c.ln2_received_date,
            )
            .join(Tank, CanisterLn2Log.tank_id == Tank.tank_id)
            .join(HospitalBranch, Tank.branch_id == HospitalBranch.branch_id)
            .outerjoin(
                Reservoir,
                Reservoir.reservoir_id == CanisterLn2Log.reservoir_id,
            )
            .outerjoin(
                reservoir_log_subq,
                reservoir_log_subq.c.reservoir_id == Reservoir.reservoir_id,
            )
            .filter(HospitalBranch.hospital_id == hospital_id)
        )

        if filter_branch_id is not None:
            query = query.filter(HospitalBranch.branch_id == filter_branch_id)

        if status:
            query = query.filter(CanisterLn2Log.status == status)

        if tank_codes:
            cleaned_codes = [code for code in tank_codes if code]
            if cleaned_codes:
                query = query.filter(Tank.tank_code.in_(cleaned_codes))

        if start:
            query = query.filter(CanisterLn2Log.refill_date >= start)

        if end:
            query = query.filter(CanisterLn2Log.refill_date <= end)

        total_count = query.order_by(None).count()
        offset = max(page - 1, 0) * page_size
        results = (
            query.order_by(CanisterLn2Log.refill_date.desc())
            .offset(offset)
            .limit(page_size)
            .all()
        )

        logs: List[dict] = []
        for log, tank_code, branch_name, reservoir_name, ln2_ordered_date, ln2_received_date in results:
            logs.append(
                {
                    "log_id": log.log_id,
                    "tank_id": log.tank_id,
                    "tank_code": tank_code,
                    "branch_id": log.branch_id,
                    "branch_name": branch_name,
                    "refill_date": log.refill_date,
                    "refill_time": log.refill_time,
                    "refilled_by": log.refilled_by,
                    "description": log.description,
                    "status": log.status,
                    "reservoir": reservoir_name,
                    "ln2_ordered_date": ln2_ordered_date,
                    "ln2_received_date": ln2_received_date,
                    "created_at": log.created_at,
                }
            )

        return {
            "logs": logs,
            "total_count": total_count,
            "page": page,
            "page_size": page_size,
        }
