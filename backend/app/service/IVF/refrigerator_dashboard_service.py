"""
Refrigerator Dashboard Service
Service layer for refrigerator-specific dashboard metrics.
Scoped exclusively to refrigerator data (c.refrigerator_id IS NOT NULL).
"""
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from sqlalchemy import func, and_, text
from sqlalchemy.orm import Session

from ...models.IVF.refrigerator_model import Refrigerator
from ...models.IVF.hospital_branch_model import HospitalBranch
from ...models.IVF.critical_alert_model import CriticalAlert
from ...models.chat_model import ChatMessage
from ...models.chat_read_status_refrigerator import ChatReadStatusRefrigerator
from ...models.task_model import Tasks
from ...constants.enums import TaskStatus

KPI_LABELS: Dict[str, str] = {
    "temp_internal": "Internal Temperature",
    "temp_external": "External Temperature",
    "ivf_temperature_external": "External Temperature",
    "ivf_temperature_internal": "Internal Temperature",
    "door_open": "Door Open",
    "door": "Door",
    "power": "Power Failure",
    "power_failure": "Power Failure",
    "humidity": "Humidity",
    "shock": "Shock / Vibration",
    "ln2_level": "LN2 Level",
    "co2": "CO2 Level",
    "o2": "O2 Level",
    "pressure": "Pressure",
    "battery": "Battery",
}


def _prettify_kpi(kpi_name: str) -> str:
    if kpi_name in KPI_LABELS:
        return KPI_LABELS[kpi_name]
    return kpi_name.replace("_", " ").title()


class RefrigeratorDashboardService:
    def __init__(self, db: Session):
        self.db = db

    def _get_branch_filter(self, branch_id: Optional[int], role: Optional[str]) -> Optional[int]:
        if role is None:
            return None
        role_normalized = role.title() if role else None
        if role_normalized in ("Manager", "Admin"):
            return None
        if role_normalized == "User":
            return branch_id
        return None

    def _prev_period(self, from_dt: datetime, to_dt: datetime):
        period = to_dt - from_dt
        return from_dt - period, from_dt

    def _base_params(self, hospital_id: int, branch_id: Optional[int],
                     from_dt: Optional[datetime], to_dt: Optional[datetime]) -> dict:
        return {
            "hospital_id": hospital_id,
            "branch_id": branch_id,
            "from_dt": from_dt,
            "to_dt": to_dt,
        }

    # ------------------------------------------------------------------
    # 1. Deviation trend — cumulative SUM() OVER (ORDER BY day)
    # ------------------------------------------------------------------
    def get_deviation_trend(
        self,
        hospital_id: int,
        branch_id: Optional[int],
        role: Optional[str],
        from_dt: Optional[datetime],
        to_dt: Optional[datetime],
    ) -> dict:
        filter_branch = self._get_branch_filter(branch_id, role)

        series_sql = text("""
            SELECT day::text, SUM(daily_count) OVER (ORDER BY day) AS cumulative
            FROM (
                SELECT date_trunc('day', c.created_at) AS day, COUNT(c.alert_id) AS daily_count
                FROM critical_alerts c
                WHERE c.hospital_id = :hospital_id
                  AND c.refrigerator_id IS NOT NULL
                  AND (:branch_id IS NULL OR c.branch_id = :branch_id)
                  AND (:from_dt IS NULL OR c.created_at >= :from_dt)
                  AND (:to_dt IS NULL OR c.created_at < :to_dt)
                GROUP BY date_trunc('day', c.created_at)
            ) d
            ORDER BY day
        """)

        count_sql = text("""
            SELECT COUNT(c.alert_id)
            FROM critical_alerts c
            WHERE c.hospital_id = :hospital_id
              AND c.refrigerator_id IS NOT NULL
              AND (:branch_id IS NULL OR c.branch_id = :branch_id)
              AND (:from_dt IS NULL OR c.created_at >= :from_dt)
              AND (:to_dt IS NULL OR c.created_at < :to_dt)
        """)

        params = self._base_params(hospital_id, filter_branch, from_dt, to_dt)
        rows = self.db.execute(series_sql, params).fetchall()
        total = self.db.execute(count_sql, params).scalar() or 0

        series = [{"day": row[0], "cumulative": int(row[1])} for row in rows]

        previous_total = 0
        delta_pct = None
        if from_dt and to_dt:
            prev_from, prev_to = self._prev_period(from_dt, to_dt)
            prev_params = self._base_params(hospital_id, filter_branch, prev_from, prev_to)
            previous_total = self.db.execute(count_sql, prev_params).scalar() or 0
            if previous_total > 0:
                delta_pct = round((total - previous_total) / previous_total * 100)
            elif total > 0:
                delta_pct = 100

        return {
            "total": total,
            "previous_total": previous_total,
            "delta_pct": delta_pct,
            "series": series,
        }

    # ------------------------------------------------------------------
    # 2. Deviations by category — top N KPIs as % of grand total
    # ------------------------------------------------------------------
    def get_deviations_by_category(
        self,
        hospital_id: int,
        branch_id: Optional[int],
        role: Optional[str],
        from_dt: Optional[datetime],
        to_dt: Optional[datetime],
        top_n: int = 5,
    ) -> dict:
        filter_branch = self._get_branch_filter(branch_id, role)

        top_sql = text("""
            SELECT k.kpi_name, COUNT(c.alert_id) AS cnt
            FROM critical_alerts c
            JOIN kpi_config k ON k.id = CASE
                WHEN c.dedup_key ~ ':[0-9]+$'
                THEN CAST(regexp_replace(c.dedup_key, '^.*:', '') AS INTEGER)
                ELSE NULL END
            WHERE c.hospital_id = :hospital_id
              AND c.refrigerator_id IS NOT NULL
              AND c.source = 'KPI'
              AND (:branch_id IS NULL OR c.branch_id = :branch_id)
              AND (:from_dt IS NULL OR c.created_at >= :from_dt)
              AND (:to_dt IS NULL OR c.created_at < :to_dt)
            GROUP BY k.kpi_name
            ORDER BY cnt DESC
            LIMIT :top_n
        """)

        total_sql = text("""
            SELECT COUNT(c.alert_id)
            FROM critical_alerts c
            WHERE c.hospital_id = :hospital_id
              AND c.refrigerator_id IS NOT NULL
              AND c.source = 'KPI'
              AND (:branch_id IS NULL OR c.branch_id = :branch_id)
              AND (:from_dt IS NULL OR c.created_at >= :from_dt)
              AND (:to_dt IS NULL OR c.created_at < :to_dt)
        """)

        params = {**self._base_params(hospital_id, filter_branch, from_dt, to_dt), "top_n": top_n}
        base_params = self._base_params(hospital_id, filter_branch, from_dt, to_dt)

        rows = self.db.execute(top_sql, params).fetchall()
        total = self.db.execute(total_sql, base_params).scalar() or 0

        previous_total = 0
        delta_pct = None
        if from_dt and to_dt:
            prev_from, prev_to = self._prev_period(from_dt, to_dt)
            prev_params = self._base_params(hospital_id, filter_branch, prev_from, prev_to)
            previous_total = self.db.execute(total_sql, prev_params).scalar() or 0
            if previous_total > 0:
                delta_pct = round((total - previous_total) / previous_total * 100)
            elif total > 0:
                delta_pct = 100

        categories = []
        for kpi_name, cnt in rows:
            pct = round(cnt / total * 100, 1) if total > 0 else 0.0
            categories.append({
                "kpi_name": kpi_name,
                "label": _prettify_kpi(kpi_name or ""),
                "count": int(cnt),
                "pct": pct,
            })

        return {
            "total": total,
            "previous_total": previous_total,
            "delta_pct": delta_pct,
            "categories": categories,
        }

    # ------------------------------------------------------------------
    # 3. Top deviated KPI
    # ------------------------------------------------------------------
    def get_top_kpi(
        self,
        hospital_id: int,
        branch_id: Optional[int],
        role: Optional[str],
        from_dt: Optional[datetime],
        to_dt: Optional[datetime],
    ) -> dict:
        filter_branch = self._get_branch_filter(branch_id, role)

        top_sql = text("""
            SELECT k.kpi_name, COUNT(c.alert_id) AS cnt
            FROM critical_alerts c
            JOIN kpi_config k ON k.id = CASE
                WHEN c.dedup_key ~ ':[0-9]+$'
                THEN CAST(regexp_replace(c.dedup_key, '^.*:', '') AS INTEGER)
                ELSE NULL END
            WHERE c.hospital_id = :hospital_id
              AND c.refrigerator_id IS NOT NULL
              AND c.source = 'KPI'
              AND (:branch_id IS NULL OR c.branch_id = :branch_id)
              AND (:from_dt IS NULL OR c.created_at >= :from_dt)
              AND (:to_dt IS NULL OR c.created_at < :to_dt)
            GROUP BY k.kpi_name
            ORDER BY cnt DESC
            LIMIT 1
        """)

        prev_sql = text("""
            SELECT COUNT(c.alert_id)
            FROM critical_alerts c
            JOIN kpi_config k ON k.id = CASE
                WHEN c.dedup_key ~ ':[0-9]+$'
                THEN CAST(regexp_replace(c.dedup_key, '^.*:', '') AS INTEGER)
                ELSE NULL END
            WHERE c.hospital_id = :hospital_id
              AND c.refrigerator_id IS NOT NULL
              AND c.source = 'KPI'
              AND k.kpi_name = :kpi_name
              AND (:branch_id IS NULL OR c.branch_id = :branch_id)
              AND (:from_dt IS NULL OR c.created_at >= :from_dt)
              AND (:to_dt IS NULL OR c.created_at < :to_dt)
        """)

        params = self._base_params(hospital_id, filter_branch, from_dt, to_dt)
        row = self.db.execute(top_sql, params).fetchone()

        if not row or not row[0]:
            return {"kpi_name": None, "label": "N/A", "count": 0, "previous_count": 0, "delta_pct": None}

        kpi_name, cnt = row[0], int(row[1])
        label = _prettify_kpi(kpi_name)

        previous_count = 0
        delta_pct = None
        if from_dt and to_dt:
            prev_from, prev_to = self._prev_period(from_dt, to_dt)
            prev_params = {
                **self._base_params(hospital_id, filter_branch, prev_from, prev_to),
                "kpi_name": kpi_name,
            }
            previous_count = self.db.execute(prev_sql, prev_params).scalar() or 0
            if previous_count > 0:
                delta_pct = round((cnt - previous_count) / previous_count * 100)
            elif cnt > 0:
                delta_pct = 100

        return {
            "kpi_name": kpi_name,
            "label": label,
            "count": cnt,
            "previous_count": previous_count,
            "delta_pct": delta_pct,
        }

    # ------------------------------------------------------------------
    # 4. Branch-wise critical alert distribution (always all branches)
    # ------------------------------------------------------------------
    def get_branch_critical_distribution(
        self,
        hospital_id: int,
        from_dt: Optional[datetime],
        to_dt: Optional[datetime],
    ) -> dict:
        dist_sql = text("""
            SELECT b.branch_id, b.branch_name, COUNT(c.alert_id) AS cnt
            FROM critical_alerts c
            JOIN hospital_branches b ON c.branch_id = b.branch_id
            WHERE c.hospital_id = :hospital_id
              AND c.refrigerator_id IS NOT NULL
              AND c.severity = 'High'
              AND (:from_dt IS NULL OR c.created_at >= :from_dt)
              AND (:to_dt IS NULL OR c.created_at < :to_dt)
            GROUP BY b.branch_id, b.branch_name
            ORDER BY cnt DESC
        """)

        total_sql = text("""
            SELECT COUNT(c.alert_id)
            FROM critical_alerts c
            WHERE c.hospital_id = :hospital_id
              AND c.refrigerator_id IS NOT NULL
              AND c.severity = 'High'
              AND (:from_dt IS NULL OR c.created_at >= :from_dt)
              AND (:to_dt IS NULL OR c.created_at < :to_dt)
        """)

        params = {"hospital_id": hospital_id, "from_dt": from_dt, "to_dt": to_dt}
        rows = self.db.execute(dist_sql, params).fetchall()
        total = self.db.execute(total_sql, params).scalar() or 0

        previous_total = 0
        delta_pct = None
        if from_dt and to_dt:
            prev_from, prev_to = self._prev_period(from_dt, to_dt)
            prev_params = {"hospital_id": hospital_id, "from_dt": prev_from, "to_dt": prev_to}
            previous_total = self.db.execute(total_sql, prev_params).scalar() or 0
            if previous_total > 0:
                delta_pct = round((total - previous_total) / previous_total * 100)
            elif total > 0:
                delta_pct = 100

        branches = []
        for branch_id, branch_name, cnt in rows:
            pct = round(cnt / total * 100, 1) if total > 0 else 0.0
            branches.append({
                "branch_id": branch_id,
                "branch_name": branch_name,
                "count": int(cnt),
                "pct": pct,
            })

        return {
            "total": total,
            "previous_total": previous_total,
            "delta_pct": delta_pct,
            "branches": branches,
        }

    # ------------------------------------------------------------------
    # 5. Operations counts (current state, branch-filtered, no date range)
    # ------------------------------------------------------------------
    def get_operations_counts(
        self,
        hospital_id: int,
        branch_id: Optional[int],
        role: Optional[str],
        user_id: str,
    ) -> dict:
        filter_branch = self._get_branch_filter(branch_id, role)

        active_alerts_sql = text("""
            SELECT COUNT(c.alert_id)
            FROM critical_alerts c
            WHERE c.hospital_id = :hospital_id
              AND c.refrigerator_id IS NOT NULL
              AND c.status = 'Active'
              AND (:branch_id IS NULL OR c.branch_id = :branch_id)
        """)
        active_alerts = self.db.execute(
            active_alerts_sql,
            {"hospital_id": hospital_id, "branch_id": filter_branch}
        ).scalar() or 0

        unread_q = (
            self.db.query(func.count(ChatMessage.id))
            .join(Refrigerator, Refrigerator.refrigerator_id == ChatMessage.refrigerator_id)
            .outerjoin(
                ChatReadStatusRefrigerator,
                and_(
                    ChatReadStatusRefrigerator.refrigerator_id == ChatMessage.refrigerator_id,
                    ChatReadStatusRefrigerator.user_id == user_id,
                )
            )
            .filter(
                ChatMessage.refrigerator_id.isnot(None),
                Refrigerator.hospital_id == hospital_id,
                ChatMessage.id > func.coalesce(ChatReadStatusRefrigerator.last_read_message_id, 0),
            )
        )
        if filter_branch is not None:
            unread_q = unread_q.filter(Refrigerator.branch_id == filter_branch)
        unread_messages = unread_q.scalar() or 0

        tasks_q = (
            self.db.query(func.count(Tasks.id))
            .join(Refrigerator, Refrigerator.refrigerator_id == Tasks.refrigerator_id)
            .filter(
                Tasks.refrigerator_id.isnot(None),
                Refrigerator.hospital_id == hospital_id,
                Tasks.status.notin_([TaskStatus.DONE.value, TaskStatus.CANCELLED.value]),
            )
        )
        if filter_branch is not None:
            tasks_q = tasks_q.filter(Refrigerator.branch_id == filter_branch)
        active_tasks = tasks_q.scalar() or 0

        return {
            "active_alerts": int(active_alerts),
            "unread_messages": int(unread_messages),
            "active_tasks": int(active_tasks),
        }
