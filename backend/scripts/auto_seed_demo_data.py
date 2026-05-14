"""
auto_seed_demo_data.py

Purpose:
- Seed required dummy/master data automatically after PostgreSQL is running.
- Safe to run multiple times: it avoids duplicate pharma, hospitals, branches, reservoirs, and reservoir logs.
- Updates missing tank weight values for existing tanks.

Place this file inside your backend project, for example:
    backend/scripts/auto_seed_demo_data.py

Run from backend container:
    python scripts/auto_seed_demo_data.py

Important:
- Do NOT run this during Docker image build because PostgreSQL is not available at build time.
- Run it after docker compose up, or call it from your backend startup/entrypoint after DB is healthy.
"""

import logging
from datetime import datetime

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.config.database import SessionLocal

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)

logger = logging.getLogger(__name__)


def table_exists(db, table_name: str) -> bool:
    return bool(
        db.execute(
            text("""
                SELECT EXISTS (
                    SELECT 1
                    FROM information_schema.tables
                    WHERE table_schema = 'public'
                    AND table_name = :table_name
                )
            """),
            {"table_name": table_name},
        ).scalar()
    )


def get_columns(db, table_name: str) -> set[str]:
    rows = db.execute(
        text("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'public'
            AND table_name = :table_name
        """),
        {"table_name": table_name},
    ).fetchall()
    return {row[0] for row in rows}


def seed_pharma(db):
    logger.info("Seeding pharma...")

    db.execute(
        text("""
            INSERT INTO pharma (
                pharma_name,
                location,
                created_at,
                updated_at,
                created_by,
                updated_by
            )
            SELECT
                :pharma_name,
                :location,
                NOW(),
                NOW(),
                'seed',
                'seed'
            WHERE NOT EXISTS (
                SELECT 1 FROM pharma WHERE pharma_name = :pharma_name
            )
        """),
        {
            "pharma_name": "MyGrape Demo Pharma",
            "location": "Chennai, India",
        },
    )

    db.execute(
        text("""
            INSERT INTO pharma (
                pharma_name,
                location,
                created_at,
                updated_at,
                created_by,
                updated_by
            )
            SELECT
                :pharma_name,
                :location,
                NOW(),
                NOW(),
                'seed',
                'seed'
            WHERE NOT EXISTS (
                SELECT 1 FROM pharma WHERE pharma_name = :pharma_name
            )
        """),
        {
            "pharma_name": "ARC Biotech",
            "location": "Bengaluru, India",
        },
    )


def seed_hospitals_and_branches(db):
    logger.info("Seeding hospitals and branches...")

    db.execute(
        text("""
            INSERT INTO hospitals (
                hospital_name,
                hospital_type,
                created_at,
                updated_at,
                created_by,
                updated_by
            )
            SELECT
                'ARC Fertility Hospitals',
                'IVF',
                NOW(),
                NOW(),
                'seed',
                'seed'
            WHERE NOT EXISTS (
                SELECT 1 FROM hospitals WHERE hospital_name = 'ARC Fertility Hospitals'
            )
        """)
    )

    db.execute(
        text("""
            INSERT INTO hospitals (
                hospital_name,
                hospital_type,
                created_at,
                updated_at,
                created_by,
                updated_by
            )
            SELECT
                'mygrape_test',
                'IVF',
                NOW(),
                NOW(),
                'seed',
                'seed'
            WHERE NOT EXISTS (
                SELECT 1 FROM hospitals WHERE hospital_name = 'mygrape_test'
            )
        """)
    )

    arc_hospital_id = db.execute(
        text("SELECT hospital_id FROM hospitals WHERE hospital_name = 'ARC Fertility Hospitals'")
    ).scalar()

    mygrape_hospital_id = db.execute(
        text("SELECT hospital_id FROM hospitals WHERE hospital_name = 'mygrape_test'")
    ).scalar()

    db.execute(
        text("""
            INSERT INTO hospital_branches (
                hospital_id,
                branch_name,
                district_name,
                state_name,
                country_name,
                created_at,
                updated_at,
                created_by,
                updated_by
            )
            SELECT
                :hospital_id,
                'Main Branch',
                'Chennai',
                'Tamil Nadu',
                'India',
                NOW(),
                NOW(),
                'seed',
                'seed'
            WHERE NOT EXISTS (
                SELECT 1
                FROM hospital_branches
                WHERE hospital_id = :hospital_id
                AND branch_name = 'Main Branch'
            )
        """),
        {"hospital_id": arc_hospital_id},
    )

    db.execute(
        text("""
            INSERT INTO hospital_branches (
                hospital_id,
                branch_name,
                district_name,
                state_name,
                country_name,
                created_at,
                updated_at,
                created_by,
                updated_by
            )
            SELECT
                :hospital_id,
                'Main',
                'Chennai',
                'Tamil Nadu',
                'India',
                NOW(),
                NOW(),
                'seed',
                'seed'
            WHERE NOT EXISTS (
                SELECT 1
                FROM hospital_branches
                WHERE hospital_id = :hospital_id
                AND branch_name = 'Main'
            )
        """),
        {"hospital_id": mygrape_hospital_id},
    )


def seed_reservoirs(db):
    logger.info("Seeding reservoirs...")

    reservoirs = [
        {
            "reservoir_name": "LN2 Reservoir A",
            "max_weight": 60.0,
            "current_weight": 55.4,
            "hospital_name": "ARC Fertility Hospitals",
            "branch_name": "Main Branch",
        },
        {
            "reservoir_name": "LN2 Reservoir B",
            "max_weight": 75.0,
            "current_weight": 70.2,
            "hospital_name": "ARC Fertility Hospitals",
            "branch_name": "Main Branch",
        },
        {
            "reservoir_name": "Cryo Backup Tank",
            "max_weight": 90.0,
            "current_weight": 82.8,
            "hospital_name": "mygrape_test",
            "branch_name": "Main",
        },
    ]

    for item in reservoirs:
        hospital_id = db.execute(
            text("SELECT hospital_id FROM hospitals WHERE hospital_name = :hospital_name"),
            {"hospital_name": item["hospital_name"]},
        ).scalar()

        branch_id = db.execute(
            text("""
                SELECT branch_id
                FROM hospital_branches
                WHERE hospital_id = :hospital_id
                AND branch_name = :branch_name
            """),
            {
                "hospital_id": hospital_id,
                "branch_name": item["branch_name"],
            },
        ).scalar()

        db.execute(
            text("""
                INSERT INTO reservoirs (
                    reservoir_name,
                    max_weight,
                    current_weight,
                    branch_id,
                    hospital_id,
                    created_at,
                    updated_at,
                    created_by,
                    updated_by
                )
                SELECT
                    :reservoir_name,
                    :max_weight,
                    :current_weight,
                    :branch_id,
                    :hospital_id,
                    NOW(),
                    NOW(),
                    'seed',
                    'seed'
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM reservoirs
                    WHERE reservoir_name = :reservoir_name
                    AND branch_id = :branch_id
                    AND hospital_id = :hospital_id
                )
            """),
            {
                "reservoir_name": item["reservoir_name"],
                "max_weight": item["max_weight"],
                "current_weight": item["current_weight"],
                "branch_id": branch_id,
                "hospital_id": hospital_id,
            },
        )


def update_existing_tanks(db):
    if not table_exists(db, "tanks"):
        logger.warning("tanks table not found. Skipping tank update.")
        return

    logger.info("Updating existing tanks with missing weight values...")

    db.execute(
        text("""
            UPDATE tanks
            SET
                empty_weight_kg = COALESCE(empty_weight_kg, 20.00),
                full_weight_kg = COALESCE(full_weight_kg, 80.00),
                static_evap_rate_l_per_day = COALESCE(static_evap_rate_l_per_day, 0.4500),
                updated_at = NOW(),
                updated_by = 'seed'
            WHERE tank_id IN (1, 3)
        """)
    )

    db.execute(
        text("""
            UPDATE tanks
            SET
                empty_weight_kg = COALESCE(empty_weight_kg, 25.00),
                full_weight_kg = COALESCE(full_weight_kg, 120.00),
                static_evap_rate_l_per_day = COALESCE(static_evap_rate_l_per_day, 0.6000),
                updated_at = NOW(),
                updated_by = 'seed'
            WHERE tank_id IN (2, 5)
        """)
    )

    db.execute(
        text("""
            UPDATE tanks
            SET
                empty_weight_kg = COALESCE(empty_weight_kg, 15.90),
                full_weight_kg = COALESCE(full_weight_kg, 54.10),
                static_evap_rate_l_per_day = COALESCE(static_evap_rate_l_per_day, 0.3800),
                updated_at = NOW(),
                updated_by = 'seed'
            WHERE tank_id = 6
        """)
    )


def seed_reservoir_logs(db):
    if not table_exists(db, "reservoir_logs"):
        logger.warning("reservoir_logs table not found. Skipping reservoir logs.")
        return

    logger.info("Seeding reservoir_logs...")

    columns = get_columns(db, "reservoir_logs")

    reservoir_ids = [
        row[0]
        for row in db.execute(
            text("SELECT reservoir_id FROM reservoirs ORDER BY reservoir_id LIMIT 3")
        ).fetchall()
    ]

    for reservoir_id in reservoir_ids:
        existing = db.execute(
            text("SELECT 1 FROM reservoir_logs WHERE reservoir_id = :reservoir_id LIMIT 1"),
            {"reservoir_id": reservoir_id},
        ).first()

        if existing:
            continue

        insert_cols = ["reservoir_id"]
        insert_vals = [":reservoir_id"]
        params = {"reservoir_id": reservoir_id}

        if "ln2_ordered_date" in columns:
            insert_cols.append("ln2_ordered_date")
            insert_vals.append("CURRENT_DATE - INTERVAL '3 days'")

        if "ln2_received_date" in columns:
            insert_cols.append("ln2_received_date")
            insert_vals.append("CURRENT_DATE - INTERVAL '1 day'")

        if "created_at" in columns:
            insert_cols.append("created_at")
            insert_vals.append("NOW()")

        if "updated_at" in columns:
            insert_cols.append("updated_at")
            insert_vals.append("NOW()")

        if "created_by" in columns:
            insert_cols.append("created_by")
            insert_vals.append("'seed'")

        if "updated_by" in columns:
            insert_cols.append("updated_by")
            insert_vals.append("'seed'")

        sql = f"""
            INSERT INTO reservoir_logs ({", ".join(insert_cols)})
            VALUES ({", ".join(insert_vals)})
        """

        db.execute(text(sql), params)


def seed_critical_alerts_if_possible(db):
    """
    This is dynamic because critical_alerts schemas vary a lot between projects.
    It inserts sample rows only if common required columns are available.
    If your table has different NOT NULL columns, this will skip safely.
    """
    if not table_exists(db, "critical_alerts"):
        logger.warning("critical_alerts table not found. Skipping.")
        return

    logger.info("Checking critical_alerts schema...")

    columns = get_columns(db, "critical_alerts")

    # Avoid duplicate seed alerts if there is any existing alert.
    existing = db.execute(text("SELECT 1 FROM critical_alerts LIMIT 1")).first()
    if existing:
        logger.info("critical_alerts already has data. Skipping.")
        return

    insert_cols = []
    insert_vals = []
    params = {}

    common_values = {
        "title": "LN2 Level Warning",
        "alert_title": "LN2 Level Warning",
        "message": "Reservoir current weight is below expected safe range.",
        "description": "Reservoir current weight is below expected safe range.",
        "alert_message": "Reservoir current weight is below expected safe range.",
        "severity": "High",
        "priority": "High",
        "status": "Open",
        "alert_status": "Open",
        "created_by": "seed",
        "updated_by": "seed",
    }

    for col, value in common_values.items():
        if col in columns:
            insert_cols.append(col)
            insert_vals.append(f":{col}")
            params[col] = value

    if "hospital_id" in columns:
        insert_cols.append("hospital_id")
        insert_vals.append(":hospital_id")
        params["hospital_id"] = db.execute(
            text("SELECT hospital_id FROM hospitals WHERE hospital_name = 'ARC Fertility Hospitals'")
        ).scalar()

    if "branch_id" in columns:
        insert_cols.append("branch_id")
        insert_vals.append(":branch_id")
        params["branch_id"] = db.execute(
            text("""
                SELECT hb.branch_id
                FROM hospital_branches hb
                JOIN hospitals h ON h.hospital_id = hb.hospital_id
                WHERE h.hospital_name = 'ARC Fertility Hospitals'
                AND hb.branch_name = 'Main Branch'
            """)
        ).scalar()

    if "tank_id" in columns and table_exists(db, "tanks"):
        insert_cols.append("tank_id")
        insert_vals.append(":tank_id")
        params["tank_id"] = db.execute(
            text("SELECT tank_id FROM tanks ORDER BY tank_id LIMIT 1")
        ).scalar()

    if "created_at" in columns:
        insert_cols.append("created_at")
        insert_vals.append("NOW()")

    if "updated_at" in columns:
        insert_cols.append("updated_at")
        insert_vals.append("NOW()")

    if "alert_time" in columns:
        insert_cols.append("alert_time")
        insert_vals.append("NOW()")

    if "triggered_at" in columns:
        insert_cols.append("triggered_at")
        insert_vals.append("NOW()")

    if len(insert_cols) < 2:
        logger.warning("critical_alerts schema not recognized. Skipping insert.")
        return

    try:
        sql = f"""
            INSERT INTO critical_alerts ({", ".join(insert_cols)})
            VALUES ({", ".join(insert_vals)})
        """
        db.execute(text(sql), params)
        logger.info("Inserted sample critical_alerts row.")
    except SQLAlchemyError as error:
        logger.warning("Could not seed critical_alerts because schema has extra required columns: %s", error)
        db.rollback()


def print_summary(db):
    logger.info("=" * 70)
    logger.info("SEED SUMMARY")

    for table in [
        "pharma",
        "hospitals",
        "hospital_branches",
        "reservoirs",
        "reservoir_logs",
        "tanks",
        "critical_alerts",
    ]:
        if table_exists(db, table):
            count = db.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar()
            logger.info("%s: %s rows", table, count)

    logger.info("=" * 70)


def run_seed():
    db = SessionLocal()

    try:
        seed_pharma(db)
        seed_hospitals_and_branches(db)
        seed_reservoirs(db)
        update_existing_tanks(db)
        seed_reservoir_logs(db)
        seed_critical_alerts_if_possible(db)

        db.commit()
        print_summary(db)

        logger.info("Automatic demo data seed completed successfully.")

    except Exception as error:
        db.rollback()
        logger.exception("Seed failed. Rolled back changes. Error: %s", error)
        raise

    finally:
        db.close()


if __name__ == "__main__":
    run_seed()
