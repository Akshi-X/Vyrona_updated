-- Seed branch and tanks for Yellow IVF (hospital_id = 3).
-- Run against your PostgreSQL DB (e.g. psql -f scripts/seed_yellow_ivf.sql).
-- Idempotent: skips branch/tanks if they already exist.

-- 1) Ensure Yellow IVF has a "Main Lab" branch
INSERT INTO hospital_branches (
    hospital_id,
    branch_name,
    district_name,
    state_name,
    country_name,
    created_at,
    updated_at
)
SELECT
    3,
    'Main Lab',
    'Demo',
    'CA',
    'India',
    NOW(),
    NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM hospital_branches
    WHERE hospital_id = 3 AND branch_name = 'Main Lab'
);

-- 2) Insert tanks T10–T50 for that branch (skip if tank_code already exists for branch)
INSERT INTO tanks (
    branch_id,
    tank_code,
    tank_id_arc,
    capacity_liters,
    is_active,
    status,
    tive_device_id,
    created_at,
    updated_at
)
SELECT
    b.branch_id,
    v.tank_code,
    v.tank_id_arc,
    v.capacity_liters,
    true,
    v.status::tank_status,
    v.tive_device_id,
    NOW(),
    NOW()
FROM hospital_branches b
CROSS JOIN (
    VALUES
        ('T10', '5471', 100.0, 'safe', 'J712149'),
        ('T20', '5472', 180.0, 'safe', 'J712150'),
        ('T30', '5473', 100.0, 'safe', 'J712151'),
        ('T40', '5474', 250.0, 'risk', 'J712152'),
        ('T50', '5475', 180.0, 'safe', NULL)
) AS v(tank_code, tank_id_arc, capacity_liters, status, tive_device_id)
WHERE b.hospital_id = 3 AND b.branch_name = 'Main Lab'
  AND NOT EXISTS (
      SELECT 1 FROM tanks t
      WHERE t.branch_id = b.branch_id AND t.tank_code = v.tank_code
  );
