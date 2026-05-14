"""
One-time migration script: creates reservoirs + reservoir_logs tables,
and drops the legacy reservoir/ln2_ordered_date/ln2_received_date columns
from canister_ln2_logs.

Run once (server does NOT need to be running):
    cd backend
    ALLOW_RESERVOIR_COLUMN_DROP=true poetry run python scripts/run_reservoir_migration.py
"""
import sys
import os

# Allow imports from backend root
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.init_db import _migrate_reservoir_tables

if __name__ == "__main__":
    print("Running reservoir migration...")
    _migrate_reservoir_tables()
    print("Done.")
