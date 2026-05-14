"""
One-time data migration: moves legacy reservoir data from canister_ln2_logs
into the new reservoirs + reservoir_logs tables, then drops the old columns.

Safe to run multiple times (idempotent).

Usage:
    cd backend
    poetry run python scripts/migrate_reservoir_data.py
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from app.config.database import SessionLocal


def run():
    db = SessionLocal()
    try:
        # 1. Pull all rows that still have legacy data
        rows = db.execute(text("""
            SELECT log_id, branch_id, reservoir, ln2_ordered_date, ln2_received_date
            FROM canister_ln2_logs
            WHERE reservoir IS NOT NULL
               OR ln2_ordered_date IS NOT NULL
               OR ln2_received_date IS NOT NULL
        """)).fetchall()

        if not rows:
            print("No legacy reservoir data found — nothing to migrate.")
        else:
            print(f"Found {len(rows)} row(s) with legacy data. Migrating...")

        for row in rows:
            log_id, branch_id, reservoir_name, ln2_ordered, ln2_received = row

            # 2. Find or create a reservoir for this (name, branch_id) pair
            res_name = (reservoir_name or "").strip() or "Unknown"

            existing = db.execute(text("""
                SELECT reservoir_id FROM reservoirs
                WHERE reservoir_name = :name AND branch_id IS NOT DISTINCT FROM :branch_id
                LIMIT 1
            """), {"name": res_name, "branch_id": branch_id}).fetchone()

            if existing:
                reservoir_id = existing[0]
                print(f"  log_id={log_id}: reusing reservoir_id={reservoir_id} ({res_name})")
            else:
                result = db.execute(text("""
                    INSERT INTO reservoirs (reservoir_name, branch_id, created_at, updated_at)
                    VALUES (:name, :branch_id, NOW(), NOW())
                    RETURNING reservoir_id
                """), {"name": res_name, "branch_id": branch_id})
                reservoir_id = result.fetchone()[0]
                print(f"  log_id={log_id}: created reservoir_id={reservoir_id} ({res_name})")

            # 3. Link the canister_ln2_log row to the reservoir (if not already)
            db.execute(text("""
                UPDATE canister_ln2_logs
                SET reservoir_id = :rid
                WHERE log_id = :lid AND reservoir_id IS NULL
            """), {"rid": reservoir_id, "lid": log_id})

            # 4. Create a reservoir_log entry if either date exists and not already migrated
            if ln2_ordered or ln2_received:
                already = db.execute(text("""
                    SELECT 1 FROM reservoir_logs
                    WHERE reservoir_id = :rid
                      AND (ln2_ordered_date IS NOT DISTINCT FROM :ordered)
                      AND (ln2_received_date IS NOT DISTINCT FROM :received)
                    LIMIT 1
                """), {"rid": reservoir_id, "ordered": ln2_ordered, "received": ln2_received}).fetchone()

                if not already:
                    db.execute(text("""
                        INSERT INTO reservoir_logs (reservoir_id, ln2_ordered_date, ln2_received_date, created_at, updated_at)
                        VALUES (:rid, :ordered, :received, NOW(), NOW())
                    """), {"rid": reservoir_id, "ordered": ln2_ordered, "received": ln2_received})
                    print(f"    → reservoir_log created (ordered={ln2_ordered}, received={ln2_received})")
                else:
                    print(f"    → reservoir_log already exists, skipped")

        db.commit()
        print("\nData migration complete.")

        # 5. Now drop the legacy columns safely
        print("Dropping legacy columns from canister_ln2_logs...")
        for col in ["reservoir", "ln2_ordered_date", "ln2_received_date"]:
            db.execute(text(f"ALTER TABLE canister_ln2_logs DROP COLUMN IF EXISTS {col}"))
            print(f"  Dropped: {col}")

        db.commit()
        print("Done.")

    except Exception as e:
        db.rollback()
        print(f"ERROR: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    run()
