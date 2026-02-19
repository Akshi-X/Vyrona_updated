# LN2 Tables – Schema, Endpoints & DTOs

API base path: `/api`  
Auth: All endpoints require `Authorization: Bearer <token>` header.

---

## Table Summary

| Table | Purpose |
|-------|---------|
| `devices` | IoT devices per branch |
| `ln2_readings` | LN2 sensor readings (evaporation, level) |
| `ln2_iot_devices` | Tank ↔ Device mapping + capacity thresholds |
| `ln2_iot_raw_data` | Raw IoT payloads per tank |

---

## Endpoint Summary

| Method | Path | Table | Description |
|--------|------|-------|-------------|
| POST | `/api/devices` | devices | Create device |
| GET | `/api/devices` | devices | List devices (filter: `branch_id`) |
| GET | `/api/devices/{id}` | devices | Get device by ID |
| PATCH | `/api/devices/{id}` | devices | Update device |
| DELETE | `/api/devices/{id}` | devices | Delete device |
| POST | `/api/ln2-readings` | ln2_readings | Create reading |
| GET | `/api/ln2-readings` | ln2_readings | List readings (filter: `device_id`) |
| GET | `/api/ln2-readings/{id}` | ln2_readings | Get reading by ID |
| PATCH | `/api/ln2-readings/{id}` | ln2_readings | Update reading |
| DELETE | `/api/ln2-readings/{id}` | ln2_readings | Delete reading |
| POST | `/api/ln2-iot-devices` | ln2_iot_devices | Create tank-device mapping |
| GET | `/api/ln2-iot-devices` | ln2_iot_devices | List mappings (filter: `tank_id`, `device_id`) |
| GET | `/api/ln2-iot-devices/{id}` | ln2_iot_devices | Get mapping by ID |
| PATCH | `/api/ln2-iot-devices/{id}` | ln2_iot_devices | Update mapping |
| DELETE | `/api/ln2-iot-devices/{id}` | ln2_iot_devices | Delete mapping |
| POST | `/api/ln2-iot-raw-data` | ln2_iot_raw_data | Create raw data |
| GET | `/api/ln2-iot-raw-data` | ln2_iot_raw_data | List raw data (filter: `tank_id`, `device_id`) |
| GET | `/api/ln2-iot-raw-data/{id}` | ln2_iot_raw_data | Get raw data by ID |
| PATCH | `/api/ln2-iot-raw-data/{id}` | ln2_iot_raw_data | Update raw data |
| DELETE | `/api/ln2-iot-raw-data/{id}` | ln2_iot_raw_data | Delete raw data |

---

## Table Schemas

### `devices`
| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | INTEGER (PK) | No | Auto-increment |
| branch_id | INTEGER (FK → hospital_branches.branch_id) | No | Branch ID |
| device_code | VARCHAR(255) | Yes | External device ID (e.g. Tive) |
| created_at | TIMESTAMP WITH TIME ZONE | No | Created time |
| updated_at | TIMESTAMP WITH TIME ZONE | Yes | Updated time |

### `ln2_readings`
| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | INTEGER (PK) | No | Auto-increment |
| device_id | VARCHAR(255) | No | Device/sensor identifier |
| ln2_evaporation_rate | NUMERIC(10,4) | Yes | LN2 evaporation rate |
| ln2_level | NUMERIC(10,4) | Yes | LN2 level |
| reading_timestamp | TIMESTAMP WITH TIME ZONE | No | Sensor reading time |
| created_at | TIMESTAMP WITH TIME ZONE | No | Created time |
| updated_at | TIMESTAMP WITH TIME ZONE | Yes | Updated time |

### `ln2_iot_devices`
| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | INTEGER (PK) | No | Auto-increment |
| tank_id | INTEGER (FK → tanks.tank_id) | No | Tank ID |
| device_id | INTEGER (FK → devices.id) | No | Device ID |
| tank_max_capacity_reading | NUMERIC(10,4) | Yes | Max capacity threshold |
| tank_min_capacity_reading | NUMERIC(10,4) | Yes | Min capacity threshold |
| created_at | TIMESTAMP WITH TIME ZONE | No | Created time |
| updated_at | TIMESTAMP WITH TIME ZONE | Yes | Updated time |
| **UNIQUE** | (tank_id, device_id) | | One mapping per tank-device pair |

### `ln2_iot_raw_data`
| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | INTEGER (PK) | No | Auto-increment |
| tank_id | INTEGER (FK → tanks.tank_id) | No | Tank ID |
| device_id | VARCHAR(255) | No | IoT device identifier |
| raw_data | NUMERIC(10,4) | Yes | Raw numeric value |
| payload | JSONB | Yes | Full JSON payload |
| created_at | TIMESTAMP WITH TIME ZONE | No | Created time |
| updated_at | TIMESTAMP WITH TIME ZONE | Yes | Updated time |

---

## Entity Relationships

```
hospital_branches (1) ──── (N) devices
tanks (1) ──── (N) ln2_iot_devices ──── (1) devices
tanks (1) ──── (N) ln2_iot_raw_data
ln2_readings (standalone, device_id is string)
```

**Workflow:** Create `Device` first (with `branch_id`) → then create `Ln2IotDevice` mapping (tank + device + thresholds).

---

## 1. Devices (`/api/devices`)

**Table:** `devices`  
**Purpose:** IoT devices associated with hospital branches.

### Create (POST /)
```json
{
  "branch_id": 1,           // required, int - hospital_branches.branch_id
  "device_code": "J712149"  // optional, string - external ID (e.g. Tive)
}
```

### Update (PATCH /{id})
```json
{
  "branch_id": 1,           // optional, int
  "device_code": "J712149"  // optional, string
}
```

### Response (single)
```json
{
  "id": 1,
  "branch_id": 1,
  "device_code": "J712149",
  "created_at": "2025-02-15T10:00:00Z",
  "updated_at": null
}
```

### List Response (GET /)
```json
{
  "devices": [
    { "id": 1, "branch_id": 1, "device_code": "J712149", "created_at": "...", "updated_at": null }
  ],
  "count": 1,
  "skip": 0,
  "limit": 100
}
```

**Query params:** `branch_id` (optional), `skip`, `limit`

---

## 2. LN2 Readings (`/api/ln2-readings`)

**Table:** `ln2_readings`  
**Purpose:** LN2 telemetry readings from sensors (evaporation rate, level, timestamp).

### Create (POST /)
```json
{
  "device_id": "J712149",          // required, string - sensor/device identifier
  "ln2_evaporation_rate": 0.5,    // optional, float - e.g. %/day or L/day
  "ln2_level": 85.2,               // optional, float - e.g. % 0-100 or volume
  "reading_timestamp": "2025-02-15T10:00:00Z"  // required, ISO8601 datetime
}
```

### Update (PATCH /{id})
```json
{
  "device_id": "J712149",          // optional
  "ln2_evaporation_rate": 0.5,     // optional
  "ln2_level": 85.2,               // optional
  "reading_timestamp": "2025-02-15T10:00:00Z"  // optional
}
```

### Response (single)
```json
{
  "id": 1,
  "device_id": "J712149",
  "ln2_evaporation_rate": 0.5,
  "ln2_level": 85.2,
  "reading_timestamp": "2025-02-15T10:00:00Z",
  "created_at": "2025-02-15T10:00:05Z",
  "updated_at": null
}
```

### List Response (GET /)
```json
{
  "readings": [ /* array of Ln2ReadingResponse */ ],
  "count": 50,
  "skip": 0,
  "limit": 100
}
```

**Query params:** `device_id` (optional), `skip`, `limit`

---

## 3. LN2 IoT Devices (`/api/ln2-iot-devices`)

**Table:** `ln2_iot_devices`  
**Purpose:** Maps a tank to a device (from `devices` table) with capacity thresholds.

### Create (POST /)
```json
{
  "tank_id": 1,                    // required, int - tanks.tank_id
  "device_id": 1,                   // required, int - devices.id (FK)
  "tank_max_capacity_reading": 100,  // optional, float
  "tank_min_capacity_reading": 10    // optional, float
}
```

### Update (PATCH /{id})
```json
{
  "tank_id": 1,
  "device_id": 1,
  "tank_max_capacity_reading": 100,
  "tank_min_capacity_reading": 10
}
```
All fields optional.

### Response (single)
```json
{
  "id": 1,
  "tank_id": 1,
  "device_id": 1,
  "tank_max_capacity_reading": 100,
  "tank_min_capacity_reading": 10,
  "created_at": "2025-02-15T10:00:00Z",
  "updated_at": null
}
```

### List Response (GET /)
```json
{
  "devices": [ /* array of Ln2IotDeviceResponse */ ],
  "count": 5,
  "skip": 0,
  "limit": 100
}
```

**Query params:** `tank_id` (optional), `device_id` (optional), `skip`, `limit`

---

## 4. LN2 IoT Raw Data (`/api/ln2-iot-raw-data`)

**Table:** `ln2_iot_raw_data`  
**Purpose:** Raw IoT telemetry payloads from sensors.

### Create (POST /)
```json
{
  "tank_id": 1,           // required, int - tanks.tank_id
  "device_id": "J712149", // required, string - IoT device identifier
  "raw_data": 85.5,       // optional, float - raw numeric from sensor
  "payload": {            // optional, object - full JSON payload
    "temperature": 25.2,
    "humidity": 60,
    "custom_field": "value"
  }
}
```

### Update (PATCH /{id})
```json
{
  "tank_id": 1,
  "device_id": "J712149",
  "raw_data": 85.5,
  "payload": { /* any JSON object */ }
}
```
All fields optional.

### Response (single)
```json
{
  "id": 1,
  "tank_id": 1,
  "device_id": "J712149",
  "raw_data": 85.5,
  "payload": { "temperature": 25.2, "humidity": 60 },
  "created_at": "2025-02-15T10:00:00Z",
  "updated_at": null
}
```

### List Response (GET /)
```json
{
  "data": [ /* array of Ln2IotRawDataResponse */ ],
  "count": 100,
  "skip": 0,
  "limit": 100
}
```

**Query params:** `tank_id` (optional), `device_id` (optional), `skip`, `limit`

---

*Generated for mG-SCALE backend LN2 module*
