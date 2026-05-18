"""
Hospital Alerts Detail Report
------------------------------
Generates a CSV of all critical alerts for a hospital with:
  - Timestamp in IST (UTC+5:30), formatted as "12 Sept 2026 09:00 PM"
  - KPI config name (via dedup_key → kpi_config join, same as dashboard)
  - Branch name
  - Tank code
  - Tank ID ARC ref (mg_ref)
  - Severity, Status, Message

Run:
    cd backend
    poetry run python scripts/hospital_alerts_report.py <hospital_id>
    poetry run python scripts/hospital_alerts_report.py <hospital_id> --out alerts.csv
"""
import sys
import os
import csv
import argparse
from datetime import timezone, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from app.config.database import SessionLocal

IST = timezone(timedelta(hours=5, minutes=30))

MONTH_ABBR = {
    1: "Jan", 2: "Feb", 3: "Mar", 4: "Apr", 5: "May", 6: "Jun",
    7: "Jul", 8: "Aug", 9: "Sept", 10: "Oct", 11: "Nov", 12: "Dec",
}


def format_ist(dt_utc) -> str:
    """Convert a UTC datetime to IST and format as '12 Sept 2026 09:00 PM'."""
    if dt_utc is None:
        return ""
    if dt_utc.tzinfo is None:
        dt_utc = dt_utc.replace(tzinfo=timezone.utc)
    dt_ist = dt_utc.astimezone(IST)
    hour = dt_ist.hour
    minute = dt_ist.minute
    period = "AM" if hour < 12 else "PM"
    hour12 = hour % 12 or 12
    return f"{dt_ist.day} {MONTH_ABBR[dt_ist.month]} {dt_ist.year} {hour12:02d}:{minute:02d} {period}"


def fetch_alerts(db, hospital_id: int) -> list[dict]:
    sql = text("""
        SELECT
            c.alert_id,
            c.occurred_at,
            c.severity,
            c.status,
            c.alert_type,
            c.message,
            COALESCE(NULLIF(k.alert_name, ''), NULLIF(k.kpi_name, ''), 'Unknown') AS kpi_name,
            b.branch_name,
            t.tank_code,
            t.tank_id AS mg_tank_id
        FROM critical_alerts c
        LEFT JOIN kpi_config k
            ON k.id = CASE
                WHEN c.dedup_key ~ ':[0-9]+$'
                THEN CAST(regexp_replace(c.dedup_key, '^.*:', '') AS INTEGER)
                ELSE NULL
            END
        LEFT JOIN hospital_branches b ON b.branch_id = c.branch_id
        LEFT JOIN tanks t ON t.tank_id = c.tank_id
        WHERE c.hospital_id = :hospital_id
        ORDER BY c.occurred_at DESC
    """)

    rows = db.execute(sql, {"hospital_id": hospital_id}).fetchall()

    return [
        {
            "alert_id":   row[0],
            "timestamp":  format_ist(row[1]),
            "severity":   row[2],
            "status":     row[3],
            "alert_type": row[4],
            "kpi_name":   row[6],
            "branch_name":  row[7] or "",
            "tank_code":    row[8] or "",
            "mg_tank_id":   row[9] or "",
            "message":    row[5],
        }
        for row in rows
    ]


def write_csv(rows: list[dict], path: str) -> None:
    fields = [
        "alert_id", "timestamp", "branch_name", "tank_code", "mg_tank_id",
        "kpi_name", "severity", "status", "alert_type", "message",
    ]
    with open(path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)
    print(f"Report written to {path}  ({len(rows)} alerts)")


def print_table(rows: list[dict]) -> None:
    print(f"{'Timestamp':<25} {'Branch':<18} {'Tank':<8} {'MG Tank ID':<12} {'KPI':<25} {'Sev':<8} {'Status':<14} Message")
    print("-" * 120)
    for r in rows:
        print(
            f"{r['timestamp']:<25} {r['branch_name']:<18} {r['tank_code']:<8} "
            f"{str(r['mg_tank_id']):<12} {r['kpi_name']:<25} {r['severity']:<8} "
            f"{r['status']:<14} {r['message'][:50]}"
        )


def main():
    parser = argparse.ArgumentParser(description="Hospital alerts detail report")
    parser.add_argument("hospital_id", type=int, help="Hospital ID")
    parser.add_argument("--out", default=None, help="Output CSV path (omit to print to terminal)")
    args = parser.parse_args()

    print(f"Fetching alerts for hospital_id={args.hospital_id} ...")
    db = SessionLocal()
    try:
        rows = fetch_alerts(db, args.hospital_id)
    finally:
        db.close()

    if not rows:
        print("No alerts found.")
        sys.exit(0)

    if args.out:
        write_csv(rows, args.out)
    else:
        print_table(rows)


if __name__ == "__main__":
    main()
