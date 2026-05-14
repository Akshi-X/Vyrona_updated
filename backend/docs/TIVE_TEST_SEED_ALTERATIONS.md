# TIVE-TEST Seed: SQL to mG-SCALE Schema Adaptations

This document describes the alterations made from the original SQL insert statements to fit the mG-SCALE database schema.

---

## 1. devices

### Original
```sql
INSERT INTO devices (device_code, created_at) VALUES ('TIVE-TEST-001', NOW());
```

### Adaptations

| Aspect | Change | Reason |
|--------|--------|--------|
| `branch_id` | Added (required) | mG-SCALE `Device` model requires `branch_id` FK to `hospital_branches` |
| `created_at` | Handled by model default | ORM sets this automatically |
| `updated_at` | Handled by model default | ORM sets this automatically |

### Implemented
Device created with `device_code='TIVE-TEST-001'` and `branch_id` from the first branch in the system.

---

## 2. tanks

### Original
```sql
INSERT INTO tanks (
    id, empty_weight_kg, full_weight_kg, capacity_liters,
    static_evap_rate_l_per_day, tive_device_id, is_active, status
) VALUES (
    999, 15.9, 54.1, 47.3, 0.38, 'TIVE-TEST-001', true, 'active'
);
```

### Adaptations

| Original | Adapted | Reason |
|----------|---------|--------|
| `id` = 999 | `tank_code` = 'TIVE-TEST-999' | mG-SCALE uses `tank_id` (auto-increment PK), not `id`. The value 999 is used as `tank_code` for identification |
| `status` = 'active' | `status` = 'safe' | Tank enum only allows `safe`, `risk`, `critical` |
| — | `branch_id` (added) | Required by Tank model |

**Preserved values:**
- `empty_weight_kg` = 15.9
- `full_weight_kg` = 54.1
- `capacity_liters` = 47.3
- `static_evap_rate_l_per_day` = 0.38
- `tive_device_id` = 'TIVE-TEST-001'
- `is_active` = true

---

## 3. ln2_iot_devices

### Original
```sql
INSERT INTO ln2_iot_devices (
    device_code, tank_id, tank_min_capacity_reading, tank_max_capacity_reading,
    closed_noise_margin_kg_per_h, open_rate_min_kg_per_h, refill_threshold_kg,
    window_minutes, window_min_points, consecutive_windows_for_state
) VALUES (
    'TIVE-TEST-001', 999, 13.9, 56.1, 0.027, 0.10, 1.0, 10, 5, 2
);
```

### Adaptations

| Original | Adapted | Reason |
|----------|---------|--------|
| `device_code` = 'TIVE-TEST-001' | `device_id` = Device.id (integer FK) | mG-SCALE uses `device_id` FK to `devices.id`, not `device_code` |
| `tank_id` = 999 | `tank_id` = actual tank's `tank_id` | Tank 999 doesn't exist; use the auto-generated `tank_id` of the created TIVE-TEST-999 tank |

**Preserved values:**
- `tank_min_capacity_reading` = 13.9
- `tank_max_capacity_reading` = 56.1
- `closed_noise_margin_kg_per_h` = 0.027
- `open_rate_min_kg_per_h` = 0.10
- `refill_threshold_kg` = 1.0
- `window_minutes` = 10
- `window_min_points` = 5
- `consecutive_windows_for_state` = 2

---

## 4. New Schema Migrations Added

The original SQL referenced columns that did not exist in mG-SCALE. The following migrations were added in `init_db.py`:

### tanks (new columns)
- `empty_weight_kg` (NUMERIC)
- `full_weight_kg` (NUMERIC)
- `static_evap_rate_l_per_day` (NUMERIC)

### ln2_iot_devices (new columns)
- `closed_noise_margin_kg_per_h` (NUMERIC)
- `open_rate_min_kg_per_h` (NUMERIC)
- `refill_threshold_kg` (NUMERIC)
- `window_minutes` (INTEGER)
- `window_min_points` (INTEGER)
- `consecutive_windows_for_state` (INTEGER)

---

## 5. Seed Location

The TIVE-TEST seed is implemented in `seed_db.py` in the function `seed_tive_test_data(db, branch)`.

Run the seed with:
```bash
cd backend && poetry run python seed_db.py
```
