# HMS Cryolock Real-Time Integration API

## Overview

The integration uses two steps:

1. **One-time setup:** An ARC admin generates a long-lived API token via a dedicated login endpoint.
   This token is shared with HMS and used for all subsequent calls.
2. **Per-change push:** When a cryolock record changes in HMS, HMS calls the cryolock update endpoint
   with the updated record.

**Base URL:** `https://<your-api-base-url>/api`

---

## Step 1 — Obtain an Integration Token

This is a one-time action performed by an ARC admin. The token is valid for **1 year** and scoped
to the admin's hospital.

### `POST /external/integration/auth/login`

**Authentication:** None (public endpoint — uses ARC admin email + password credentials)

**Request Body:**

```json
{
  "email": "admin@arcfertility.in",
  "password": "your-password",
  "label": "ARC HMS Integration - Production"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `email` | string | Yes | ARC admin email address |
| `password` | string | Yes | ARC admin account password |
| `label` | string | No | Optional note to identify this token in audit logs |

**Success Response (200):**

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in_seconds": 31536000,
  "expires_at": "2027-05-01T10:30:00Z",
  "issued_at": "2026-05-01T10:30:00Z",
  "jti": "a1b2c3d4e5f6...",
  "user_id": "USR-000001",
  "hospital_id": 7,
  "purpose": "hms_integration"
}
```

| Field | Description |
|---|---|
| `access_token` | The Bearer token to include in all HMS API calls |
| `expires_at` | UTC timestamp when the token expires (1 year from issuance) |
| `jti` | Unique token ID — keep this; it is needed to revoke the token if compromised |
| `purpose` | Always `"hms_integration"` — confirms this is an integration token, not a user session |

The `access_token` value must be stored securely in HMS configuration and included in the
`Authorization` header of every subsequent API call:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## Step 2 — Push Cryolock Updates

### `POST /external/hms/patient-cryolock`

**Authentication:** `Authorization: Bearer <token>` (token from Step 1)

**Content-Type:** `application/json`

Accepts either a **single record object** or an **array of records** in the same call. HMS should
call this endpoint whenever any cryolock record is created or modified.

---

### Request Payload Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `hisNumber` | string | **Yes** | Patient MRN / HIS number |
| `siteName` | string | **Yes** | Branch or site name (e.g. `"Tambaram"`, `"Egmore"`). If the branch does not yet exist in our system, it will be created automatically. |
| `cryolockNumber` | string | **Yes** | Full cryolock position in format `Tank/Canister/Cane/Position`. Example: `"T10/C5/E1/3"` |
| `oldCryolockNumber` | string | No | **Only for moves.** The previous cryolock number before the sample was physically relocated. When provided and different from `cryolockNumber`, the old record is deleted and a new one is created atomically. See [Move scenario](#scenario-3--sample-physically-moved-to-a-different-tank--position) below. |
| `canisterNumber` | string | No | Canister identifier. Used as a fallback if the canister segment cannot be parsed from `cryolockNumber`. |
| `tankID` | string | No | Your internal tank ID (e.g. `"582"`). Stored for cross-reference. |
| `caneID` | string | No | Your internal cane ID. Stored for cross-reference. |
| `dateofVitrification` | string | No | Date the embryo was vitrified. Format: `YYYY-MM-DD` (e.g. `"2023-03-11"`) |

> **Note on `cryolockNumber` format:** The position segment (last part, e.g. `3` in `T10/C5/E1/3`)
> must be numeric. Records with a non-numeric position (e.g. `T1/C1/E1/X`) will be skipped and
> flagged in the response — no data is written.

---

### Scenario 1 — New Record

First time HMS sends a particular `hisNumber` + `cryolockNumber` combination.

**Request:**

```json
POST /api/external/hms/patient-cryolock
Authorization: Bearer <token>
Content-Type: application/json

{
  "hisNumber": "HIS1234",
  "siteName": "Tambaram",
  "cryolockNumber": "T1/C5/E1/3",
  "canisterNumber": "C5",
  "tankID": "5471",
  "caneID": "1001",
  "dateofVitrification": "2023-03-11"
}
```

**Response:**

```json
{
  "accepted": 1,
  "created": 1,
  "updated": 0,
  "moved": 0,
  "noop": 0,
  "skipped": 0,
  "failed": 0,
  "results": [
    {
      "status": "success",
      "operation": "create",
      "patient_crylock_id": 101,
      "old_patient_crylock_id": null,
      "tank_id": 55,
      "branch_id": 3,
      "reason": null
    }
  ]
}
```

---

### Scenario 2 — Update Existing Record

Send the same `hisNumber` + `cryolockNumber` combination with updated field values. The existing
record is updated in place.

> **User-managed fields** set by ARC clinical staff (`crylock_color`, `goblet_color`, `description`,
> `embryo_transfer`, `in_transit`) are **never overwritten** by HMS pushes.

**Request:**

```json
POST /api/external/hms/patient-cryolock
Authorization: Bearer <token>
Content-Type: application/json

{
  "hisNumber": "HIS1234",
  "siteName": "Tambaram",
  "cryolockNumber": "T1/C5/E1/3",
  "canisterNumber": "C5",
  "tankID": "5471",
  "caneID": "1001",
  "dateofVitrification": "2023-04-15"
}
```

**Response:**

```json
{
  "accepted": 1,
  "created": 0,
  "updated": 1,
  "moved": 0,
  "noop": 0,
  "skipped": 0,
  "failed": 0,
  "results": [
    {
      "status": "success",
      "operation": "update",
      "patient_crylock_id": 101,
      "old_patient_crylock_id": null,
      "tank_id": 55,
      "branch_id": 3,
      "reason": null
    }
  ]
}
```

> If the values are identical to what is already stored, `operation` will be `"noop"` and nothing
> is written. The call is safe to repeat — idempotent by design.

---

### Scenario 3 — Sample Physically Moved to a Different Tank / Position

When a sample moves from one cryolock position to another, include `oldCryolockNumber` set to the
previous position. The system atomically deletes the old record and creates the new one, transferring
all clinical state (colors, notes, flags) to the new record.

**Request:**

```json
POST /api/external/hms/patient-cryolock
Authorization: Bearer <token>
Content-Type: application/json

{
  "hisNumber": "HIS1234",
  "siteName": "Tambaram",
  "cryolockNumber": "T2/C5/E1/3",
  "oldCryolockNumber": "T1/C5/E1/3",
  "canisterNumber": "C5",
  "tankID": "582",
  "caneID": "1001",
  "dateofVitrification": "2023-03-11"
}
```

**Response:**

```json
{
  "accepted": 1,
  "created": 0,
  "updated": 0,
  "moved": 1,
  "noop": 0,
  "skipped": 0,
  "failed": 0,
  "results": [
    {
      "status": "success",
      "operation": "move",
      "patient_crylock_id": 102,
      "old_patient_crylock_id": 101,
      "tank_id": 56,
      "branch_id": 3,
      "reason": null
    }
  ]
}
```

| Field | Description |
|---|---|
| `patient_crylock_id` | Internal ID of the **new** record at the destination position |
| `old_patient_crylock_id` | Internal ID of the **deleted** record at the source position — useful for reconciliation |

> If `oldCryolockNumber` is provided but the old record is not found (already removed), the record
> is **skipped** with an explanatory `reason` — no partial writes occur. To create or update a record
> at the new position without a move, omit `oldCryolockNumber`.

---

### Scenario 4 — Batch Push

Send an array to push multiple records in one call. Each record is processed independently — one
failure does not stop the rest.

**Request:**

```json
POST /api/external/hms/patient-cryolock
Authorization: Bearer <token>
Content-Type: application/json

[
  {
    "hisNumber": "HIS1234",
    "siteName": "Tambaram",
    "cryolockNumber": "T2/C5/E1/3",
    "oldCryolockNumber": "T1/C5/E1/3",
    "tankID": "582",
    "caneID": "1001",
    "dateofVitrification": "2023-03-11"
  },
  {
    "hisNumber": "HIS5678",
    "siteName": "Egmore",
    "cryolockNumber": "T3/C2/B4/7",
    "tankID": "601",
    "caneID": "2002",
    "dateofVitrification": "2024-01-20"
  }
]
```

**Response:**

```json
{
  "accepted": 2,
  "created": 1,
  "updated": 0,
  "moved": 1,
  "noop": 0,
  "skipped": 0,
  "failed": 0,
  "results": [
    {
      "status": "success",
      "operation": "move",
      "patient_crylock_id": 102,
      "old_patient_crylock_id": 101,
      "tank_id": 56,
      "branch_id": 3,
      "reason": null
    },
    {
      "status": "success",
      "operation": "create",
      "patient_crylock_id": 103,
      "old_patient_crylock_id": null,
      "tank_id": 60,
      "branch_id": 5,
      "reason": null
    }
  ]
}
```

---

## Response Field Reference

### Envelope

| Field | Type | Description |
|---|---|---|
| `accepted` | integer | Total number of records received |
| `created` | integer | New records created |
| `updated` | integer | Existing records updated with changed data |
| `moved` | integer | Records relocated to a new position (old deleted, new created) |
| `noop` | integer | Records received with no changes — nothing written |
| `skipped` | integer | Records skipped due to a data issue. Check `reason` in the corresponding result. |
| `failed` | integer | Records that failed due to a server-side error. Safe to retry. |

### Per-record `results`

| Field | Type | Description |
|---|---|---|
| `status` | string | `"success"`, `"skipped"`, or `"failed"` |
| `operation` | string | `"create"`, `"update"`, `"move"`, or `"noop"` |
| `patient_crylock_id` | integer | Internal ID of the created / updated / moved-to record |
| `old_patient_crylock_id` | integer | For `"move"` operations: internal ID of the deleted source record |
| `tank_id` | integer | Internal tank ID the record now belongs to |
| `branch_id` | integer | Internal branch ID |
| `reason` | string | Populated for `"skipped"` and `"failed"` — describes why the record was not processed |

---

## Error Responses

| HTTP Status | Meaning |
|---|---|
| `200` | Request processed. Check per-record `status` in `results` for individual outcomes. |
| `400` | Bad request — empty payload, or token has no `hospital_id` claim. |
| `401` | Invalid, expired, or revoked token. Re-issue a token via the login endpoint. |
| `403` | The token belongs to a non-Admin user. Only Admin-role tokens are accepted on this endpoint. |

---

## Token Management

Tokens are managed by ARC admins using their regular dashboard session credentials.

### List issued tokens

```
GET /api/external/integration/auth/tokens
Authorization: Bearer <admin-session-token>
```

### Revoke a compromised token

```
POST /api/external/integration/auth/tokens/{jti}/revoke
Authorization: Bearer <admin-session-token>
Content-Type: application/json

{
  "reason": "Token exposed in config file"
}
```

After revocation any call using that token returns `401` immediately. A new token can be issued
right away via the login endpoint.

---

## Operation Decision Reference

The table below summarises which operation is applied based on the payload and existing data state:

| `oldCryolockNumber` | Old record found? | New record exists? | Result |
|---|---|---|---|
| Absent or same as `cryolockNumber` | — | No | `create` at new position |
| Absent or same as `cryolockNumber` | — | Yes | `update` or `noop` |
| Different from `cryolockNumber` | Yes | No | `move` — old deleted, new created |
| Different from `cryolockNumber` | Yes | Yes (different record) | `skipped` — duplicate guard |
| Different from `cryolockNumber` | No | — | `skipped` — source already gone |
