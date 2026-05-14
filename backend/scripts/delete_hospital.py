#!/usr/bin/env python3
"""
Delete a hospital and all its dependent data (branch, users unlink, tanks, readings, etc.).
Usage: poetry run python scripts/delete_hospital.py 3
"""
import os
import sys

_script_dir = os.path.dirname(os.path.abspath(__file__))
_backend_dir = os.path.dirname(_script_dir)
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

_env_path = os.path.join(_backend_dir, ".env")
if os.path.isfile(_env_path):
    try:
        from dotenv import load_dotenv
        load_dotenv(_env_path)
    except ImportError:
        pass

from sqlalchemy import text
from app.config.database import SessionLocal


def delete_hospital(hospital_id: int) -> None:
    db = SessionLocal()
    try:
        # 1) Unlink users (set hospital_id and branch_id to NULL)
        r = db.execute(
            text("UPDATE users SET hospital_id = NULL, branch_id = NULL WHERE hospital_id = :hid"),
            {"hid": hospital_id},
        )
        print(f"Users unlinked: {r.rowcount}")

        # 2) Delete by hospital_id
        for table, col in [
            ("critical_alerts", "hospital_id"),
            ("readings", "hospital_id"),
            ("kpi_config", "hospital_id"),
        ]:
            r = db.execute(text(f"DELETE FROM {table} WHERE {col} = :hid"), {"hid": hospital_id})
            print(f"Deleted from {table}: {r.rowcount}")

        # 3) Get branch_ids for this hospital
        branches = db.execute(
            text("SELECT branch_id FROM hospital_branches WHERE hospital_id = :hid"),
            {"hid": hospital_id},
        ).fetchall()
        branch_ids = [b[0] for b in branches]
        if not branch_ids:
            db.execute(text("DELETE FROM hospitals WHERE hospital_id = :hid"), {"hid": hospital_id})
            db.commit()
            print(f"Hospital {hospital_id} (no branches) deleted.")
            return

        bid_list = ",".join(str(b) for b in branch_ids)

        # 4) Tables that reference tank_id (tanks belong to branches) – delete by tank_id IN (tanks of these branches)
        # First get tank_ids for these branches
        tank_rows = db.execute(
            text(f"SELECT tank_id FROM tanks WHERE branch_id IN ({bid_list})"),
        ).fetchall()
        tank_ids = [t[0] for t in tank_rows]
        if tank_ids:
            tid_list = ",".join(str(t) for t in tank_ids)
            for table, col in [
                ("chat_read_status_canister", "tank_id"),
                ("chat_messages", "tank_id"),  # nullable, we set null then delete tanks
                ("tasks", "tank_id"),
            ]:
                try:
                    if col == "tank_id" and table == "chat_messages":
                        r = db.execute(text(f"UPDATE {table} SET tank_id = NULL WHERE tank_id IN ({tid_list})"))
                    elif col == "tank_id" and table == "tasks":
                        r = db.execute(text(f"UPDATE {table} SET tank_id = NULL WHERE tank_id IN ({tid_list})"))
                    else:
                        r = db.execute(text(f"DELETE FROM {table} WHERE {col} IN ({tid_list})"))
                    print(f"  {table}: {r.rowcount}")
                except Exception as e:
                    print(f"  {table}: skip - {e}")

            for table in ["patient_crylock_info", "ln2_readings", "ln2_iot_raw_data", "ivf_telemetry_data", "ivf_quality_log"]:
                try:
                    r = db.execute(text(f"DELETE FROM {table} WHERE tank_id IN ({tid_list})"))
                    print(f"  {table}: {r.rowcount}")
                except Exception as e:
                    print(f"  {table}: skip - {e}")

        # 5) Devices (by branch_id)
        try:
            r = db.execute(text(f"DELETE FROM devices WHERE branch_id IN ({bid_list})"))
            print(f"devices: {r.rowcount}")
        except Exception as e:
            print(f"devices: skip - {e}")

        # 6) Delete tanks for these branches
        r = db.execute(text(f"DELETE FROM tanks WHERE branch_id IN ({bid_list})"))
        print(f"tanks: {r.rowcount}")

        # 7) canister_ln2_logs (branch_id nullable)
        try:
            r = db.execute(text(f"UPDATE canister_ln2_logs SET branch_id = NULL WHERE branch_id IN ({bid_list})"))
            print(f"canister_ln2_logs (nulled): {r.rowcount}")
        except Exception as e:
            print(f"canister_ln2_logs: skip - {e}")

        # 8) ivf_shipment (on delete SET NULL for branch)
        try:
            r = db.execute(
                text(f"UPDATE ivf_shipment SET source_branch_id = NULL WHERE source_branch_id IN ({bid_list})"),
            )
            r2 = db.execute(
                text(f"UPDATE ivf_shipment SET destination_branch_id = NULL WHERE destination_branch_id IN ({bid_list})"),
            )
            print(f"ivf_shipment: source={r.rowcount}, dest={r2.rowcount}")
        except Exception as e:
            print(f"ivf_shipment: skip - {e}")

        # 9) Delete branches then hospital
        r = db.execute(text(f"DELETE FROM hospital_branches WHERE hospital_id = :hid"), {"hid": hospital_id})
        print(f"hospital_branches: {r.rowcount}")
        r = db.execute(text("DELETE FROM hospitals WHERE hospital_id = :hid"), {"hid": hospital_id})
        print(f"hospitals: {r.rowcount}")

        db.commit()
        print(f"Hospital {hospital_id} and all dependent data deleted.")
    except Exception as e:
        db.rollback()
        print(f"Error: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    hid = int(sys.argv[1]) if len(sys.argv) > 1 else 3
    print(f"Deleting hospital_id = {hid}...")
    delete_hospital(hid)
