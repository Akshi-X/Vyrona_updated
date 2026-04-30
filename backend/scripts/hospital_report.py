"""
Hospital Summary Report
-----------------------
Generates a CSV report for a given hospital_id with:
  - Total LN2 readings per branch / overall
  - Total critical alerts sent per branch / overall
  - High-deviation KPI names per branch (High-severity alerts, joined via dedup_key → kpi_config)

Run:
    cd backend
    poetry run python scripts/hospital_report.py <hospital_id>
    poetry run python scripts/hospital_report.py <hospital_id> --out report.csv
"""
import sys
import os
import csv
import argparse

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import func, text
from app.config.database import SessionLocal
from app.models.IVF.hospital_branch_model import HospitalBranch
from app.models.IVF.tank_model import Tank
from app.models.IVF.critical_alert_model import CriticalAlert
from app.models.IVF.device_model import Device  # noqa: F401 — resolves Ln2Reading.device relationship
from app.models.IVF.ln2_readings_model import Ln2Reading
from app.models.readings_model import Readings


def get_kpi_alert_counts(db, hospital_id: int, branch_id: int) -> list[tuple[str, int]]:
    """
    Return KPI names with alert counts (all severities) for a branch.
    Mirrors the dashboard logic: kpi_config_id is extracted from the last
    segment of dedup_key (format: tank_id:source:alert_type:date:kpi_config_id),
    then joined to kpi_config for the label.
    """
    sql = text("""
        SELECT
            COALESCE(NULLIF(k.alert_name, ''), NULLIF(k.kpi_name, ''), 'Unknown') AS kpi_label,
            COUNT(*) AS alert_count
        FROM critical_alerts c
        LEFT JOIN kpi_config k
            ON k.id = CASE
                WHEN c.dedup_key ~ ':[0-9]+$'
                THEN CAST(regexp_replace(c.dedup_key, '^.*:', '') AS INTEGER)
                ELSE NULL
            END
        WHERE c.hospital_id = :hospital_id
          AND c.branch_id   = :branch_id
        GROUP BY kpi_label
        ORDER BY alert_count DESC, kpi_label
    """)
    rows = db.execute(sql, {"hospital_id": hospital_id, "branch_id": branch_id}).fetchall()
    return [(r[0], r[1]) for r in rows]


def build_report(hospital_id: int) -> list[dict]:
    db = SessionLocal()
    try:
        branches = (
            db.query(HospitalBranch)
            .filter(HospitalBranch.hospital_id == hospital_id)
            .order_by(HospitalBranch.branch_id)
            .all()
        )

        if not branches:
            print(f"No branches found for hospital_id={hospital_id}")
            return []

        # Pre-fetch tank_ids per branch for ln2_readings count
        branch_tank_ids: dict[int, list[int]] = {}
        for branch in branches:
            tank_ids = [
                t.tank_id
                for t in db.query(Tank.tank_id)
                .filter(Tank.branch_id == branch.branch_id)
                .all()
            ]
            branch_tank_ids[branch.branch_id] = tank_ids

        rows = []
        total_readings = 0
        total_alerts = 0
        all_high_kpis: dict[str, int] = {}
        total_deviations = 0

        for branch in branches:
            tank_ids = branch_tank_ids[branch.branch_id]

            # ── readings ──
            reading_count = (
                db.query(func.count(Ln2Reading.id))
                .filter(Ln2Reading.tank_id.in_(tank_ids))
                .scalar()
                if tank_ids else 0
            ) or 0

            # ── deviation flagged readings ──
            deviation_count = (
                db.query(func.count(Readings.id))
                .filter(
                    Readings.hospital_id == hospital_id,
                    Readings.branch_id == branch.branch_id,
                    Readings.deviation == True,
                )
                .scalar()
            ) or 0

            # ── total alerts (all severities) ──
            alert_count = (
                db.query(func.count(CriticalAlert.alert_id))
                .filter(
                    CriticalAlert.hospital_id == hospital_id,
                    CriticalAlert.branch_id == branch.branch_id,
                )
                .scalar()
            ) or 0

            # ── KPI alert counts (all severities, dashboard logic) ──
            high_kpis = get_kpi_alert_counts(db, hospital_id, branch.branch_id)

            total_readings += reading_count
            total_deviations += deviation_count
            total_alerts += alert_count
            for kpi_label, count in high_kpis:
                all_high_kpis[kpi_label] = all_high_kpis.get(kpi_label, 0) + count

            kpi_str = ", ".join(f"{name}:{count}" for name, count in high_kpis) if high_kpis else "None"

            rows.append({
                "branch_id": branch.branch_id,
                "branch_name": branch.branch_name or f"Branch {branch.branch_id}",
                "total_readings": reading_count,
                "total_deviation_flagged": deviation_count,
                "total_alerts": alert_count,
                "kpi_alert_counts": kpi_str,
            })

        # ── summary row ──
        total_kpi_str = (
            ", ".join(f"{name}:{count}" for name, count in sorted(all_high_kpis.items(), key=lambda x: -x[1]))
            if all_high_kpis else "None"
        )
        rows.append({
            "branch_id": "TOTAL",
            "branch_name": "All Branches",
            "total_readings": total_readings,
            "total_deviation_flagged": total_deviations,
            "total_alerts": total_alerts,
            "kpi_alert_counts": total_kpi_str,
        })

        return rows
    finally:
        db.close()


def write_csv(rows: list[dict], path: str) -> None:
    fields = ["branch_id", "branch_name", "total_readings", "total_deviation_flagged", "total_alerts", "kpi_alert_counts"]
    with open(path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)
    print(f"Report written to {path}")


def print_table(rows: list[dict]) -> None:
    header = f"{'Branch ID':<12} {'Branch Name':<25} {'Readings':>10} {'Alerts':>8}  High Deviation KPIs"
    print(header)
    print("-" * 80)
    for row in rows:
        print(
            f"{str(row['branch_id']):<12} {str(row['branch_name']):<25} "
            f"{row['total_readings']:>10} {row['alerts_sent']:>8}  {row['high_deviation_kpis']}"
        )


def main():
    parser = argparse.ArgumentParser(description="Hospital summary report")
    parser.add_argument("hospital_id", type=int, help="Hospital ID to report on")
    parser.add_argument("--out", default=None, help="Output CSV path (omit to print to terminal)")
    args = parser.parse_args()

    print(f"Generating report for hospital_id={args.hospital_id} ...")
    rows = build_report(args.hospital_id)

    if not rows:
        sys.exit(1)

    if args.out:
        write_csv(rows, args.out)
    else:
        print_table(rows)


if __name__ == "__main__":
    main()
