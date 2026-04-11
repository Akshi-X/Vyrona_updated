"""
Fix script: adds max_weight / current_weight columns to reservoirs,
adds refill_weight column to canister_ln2_logs,
and creates a default reservoir for any branch that doesn't have one.

Run once from the backend directory:
    cd backend
    poetry run python fix-conflict/add_reservoir_weights_and_seed.py
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from app.config.database import SessionLocal
from app.models.IVF.hospital_branch_model import HospitalBranch
from app.utils.reservoir_utils import ensure_branch_reservoir


def run():
    db = SessionLocal()
    try:
        # ------------------------------------------------------------------ #
        # 1. Add columns if they don't exist yet
        # ------------------------------------------------------------------ #
        print("Adding columns...")

        db.execute(text("""
            ALTER TABLE reservoirs
                ADD COLUMN IF NOT EXISTS max_weight FLOAT NOT NULL DEFAULT 60,
                ADD COLUMN IF NOT EXISTS current_weight FLOAT NOT NULL DEFAULT 60
        """))

        db.execute(text("""
            ALTER TABLE canister_ln2_logs
                ADD COLUMN IF NOT EXISTS refill_weight FLOAT NULL
        """))

        db.commit()
        print("  ✓ Columns added (or already existed)")

        # ------------------------------------------------------------------ #
        # 2. Ensure every branch has a reservoir
        # ------------------------------------------------------------------ #
        print("\nSeeding reservoirs...")
        branches = db.query(HospitalBranch).all()

        if not branches:
            print("  No branches found.")
        else:
            created = 0
            skipped = 0
            for branch in branches:
                from app.models.IVF.reservoir_model import Reservoir
                before = db.query(Reservoir).filter(Reservoir.branch_id == branch.branch_id).count()
                reservoir = ensure_branch_reservoir(
                    db,
                    branch_id=branch.branch_id,
                    hospital_id=branch.hospital_id,
                    branch_name=branch.branch_name or f"Branch {branch.branch_id}",
                )
                if before > 0:
                    print(f"  SKIP   branch_id={branch.branch_id} ({branch.branch_name!r}) — already has reservoir")
                    skipped += 1
                else:
                    print(f"  CREATE branch_id={branch.branch_id} ({branch.branch_name!r}) → reservoir_id={reservoir.reservoir_id}")
                    created += 1

            db.commit()
            print(f"\n  Done. Created: {created}, Skipped: {skipped}")

        print("\nAll done.")

    except Exception as e:
        db.rollback()
        print(f"ERROR: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    run()
