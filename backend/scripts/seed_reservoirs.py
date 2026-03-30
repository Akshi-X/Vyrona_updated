"""
Seed script: creates one default Reservoir per branch that doesn't already have one.

Run:
    cd backend
    poetry run python scripts/seed_reservoirs.py

Safe to re-run — skips branches that already have a reservoir.
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.config.database import SessionLocal
from app.models.IVF.hospital_branch_model import HospitalBranch
from app.models.IVF.reservoir_model import Reservoir  # noqa: F401 — needed for Base registry


def seed_reservoirs():
    db = SessionLocal()
    try:
        branches = db.query(HospitalBranch).all()

        if not branches:
            print("No branches found in the database.")
            return

        created = 0
        skipped = 0

        for branch in branches:
            existing = (
                db.query(Reservoir)
                .filter(Reservoir.branch_id == branch.branch_id)
                .first()
            )
            if existing:
                print(
                    f"  SKIP  branch_id={branch.branch_id} ({branch.branch_name!r}) "
                    f"— reservoir '{existing.reservoir_name}' already exists"
                )
                skipped += 1
                continue

            reservoir = Reservoir(
                reservoir_name=f"{branch.branch_name} Reservoir",
                branch_id=branch.branch_id,
                hospital_id=branch.hospital_id,
                created_by="seed_script",
                updated_by="seed_script",
            )
            db.add(reservoir)
            db.flush()  # get reservoir_id before commit
            print(
                f"  CREATE branch_id={branch.branch_id} ({branch.branch_name!r}) "
                f"→ reservoir_id={reservoir.reservoir_id}"
            )
            created += 1

        db.commit()
        print(f"\nDone. Created: {created}, Skipped (already existed): {skipped}")

    except Exception as e:
        db.rollback()
        print(f"ERROR: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_reservoirs()
