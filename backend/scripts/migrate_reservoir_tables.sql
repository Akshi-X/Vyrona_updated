-- Migration: Create reservoir & reservoir_logs tables; remove reservoir columns from canister_ln2_logs
-- Safe to run multiple times (uses IF NOT EXISTS / IF EXISTS guards)
-- Does NOT drop any existing data

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Create reservoirs table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reservoirs (
    reservoir_id  SERIAL       PRIMARY KEY,
    reservoir_name VARCHAR(255) NOT NULL,
    branch_id     INTEGER      REFERENCES hospital_branches(branch_id) ON DELETE SET NULL,
    hospital_id   INTEGER      REFERENCES hospitals(hospital_id)        ON DELETE SET NULL,
    created_at    TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMP             DEFAULT NOW(),
    created_by    VARCHAR,
    updated_by    VARCHAR
);

CREATE INDEX IF NOT EXISTS idx_reservoirs_branch_id   ON reservoirs(branch_id);
CREATE INDEX IF NOT EXISTS idx_reservoirs_hospital_id ON reservoirs(hospital_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Create reservoir_logs table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reservoir_logs (
    log_id            SERIAL   PRIMARY KEY,
    reservoir_id      INTEGER  NOT NULL REFERENCES reservoirs(reservoir_id) ON DELETE CASCADE,
    ln2_ordered_date  DATE,
    ln2_received_date DATE,
    created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMP          DEFAULT NOW(),
    created_by        VARCHAR,
    updated_by        VARCHAR
);

CREATE INDEX IF NOT EXISTS idx_reservoir_logs_reservoir_id ON reservoir_logs(reservoir_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Remove reservoir / ln2_ordered_date / ln2_received_date from canister_ln2_logs
--    Only drops the columns if they still exist (safe on repeated runs)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'canister_ln2_logs' AND column_name = 'reservoir'
    ) THEN
        ALTER TABLE canister_ln2_logs DROP COLUMN reservoir;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'canister_ln2_logs' AND column_name = 'ln2_ordered_date'
    ) THEN
        ALTER TABLE canister_ln2_logs DROP COLUMN ln2_ordered_date;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'canister_ln2_logs' AND column_name = 'ln2_received_date'
    ) THEN
        ALTER TABLE canister_ln2_logs DROP COLUMN ln2_received_date;
    END IF;
END $$;

COMMIT;
