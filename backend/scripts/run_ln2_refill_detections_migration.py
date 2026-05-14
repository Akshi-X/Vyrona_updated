"""
One-time migration script: creates the ln2_refill_detections table.

Safe to re-run — skips silently if the table already exists.
Never drops or modifies existing tables/data.

Run once (server does NOT need to be running):
    cd backend
    poetry run python scripts/run_ln2_refill_detections_migration.py
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.init_db import _migrate_ln2_refill_detections

if __name__ == "__main__":
    print("Running ln2_refill_detections migration...")
    _migrate_ln2_refill_detections()
    print("Done.")
