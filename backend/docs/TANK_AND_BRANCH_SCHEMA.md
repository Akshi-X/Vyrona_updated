# Tank and Hospital Branch Schema

---

## `tanks` Table

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| tank_id | INTEGER (PK) | No | Auto-increment |
| branch_id | INTEGER (FK → hospital_branches.branch_id) | No | Branch this tank belongs to |
| tank_code | VARCHAR(255) | Yes | Tank code |
| tank_id_arc | VARCHAR(255) | Yes | ARC API tank ID (e.g. '5471') |
| capacity_liters | NUMERIC(10, 2) | Yes | Capacity in liters |
| is_active | BOOLEAN | No | Default `true` |
| status | ENUM (tank_status) | No | Values: `safe`, `risk`, `critical` (default: `safe`) |
| tive_device_id | VARCHAR(255) | Yes | Tive device ID for tank-level monitoring |
| created_at | TIMESTAMP | No | Created timestamp |
| updated_at | TIMESTAMP | Yes | Updated timestamp |
| created_by | VARCHAR | Yes | Audit: created by |
| updated_by | VARCHAR | Yes | Audit: updated by |

**Constraints:** `UNIQUE (tank_code, branch_id)`

---

## `hospital_branches` Table

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| branch_id | INTEGER (PK) | No | Auto-increment |
| hospital_id | INTEGER (FK → hospitals.hospital_id) | No | Parent hospital |
| branch_name | VARCHAR(20) | Yes | Branch name |
| district_name | VARCHAR(20) | Yes | District |
| state_name | VARCHAR(20) | Yes | State |
| country_name | VARCHAR(50) | Yes | Country |
| area | TEXT | Yes | Area/address |
| pincode | VARCHAR(10) | Yes | Pincode |
| latitude | NUMERIC(10, 7) | Yes | Latitude |
| longitude | NUMERIC(10, 7) | Yes | Longitude |
| created_at | TIMESTAMP | No | Created timestamp |
| updated_at | TIMESTAMP | Yes | Updated timestamp |
| created_by | VARCHAR | Yes | Audit: created by |
| updated_by | VARCHAR | Yes | Audit: updated by |

---

## Relationships

```
hospitals (1) ──── (N) hospital_branches
hospital_branches (1) ──── (N) tanks
```

`tanks.branch_id` → `hospital_branches.branch_id`

---

*Source: mG-SCALE backend models*
