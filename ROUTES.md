# mG-SCALE Routes Reference

All frontend (React) and backend (API) routes. Backend base URL uses `API_PREFIX = "/api"`.

---

## Frontend routes (React Router)

| Path | Auth | Variant support | Description |
|------|------|-----------------|-------------|
| `/` | — | — | Auth redirect (to dashboard or login) |
| `/login` | No | — | Login |
| `/signup` | No | — | Signup |
| `/verify-otp` | No | — | Verify OTP |
| `/forgot-password` | No | — | Forgot password |
| `/reset-password` | No | — | Reset password |
| `/success` | No | — | Success alert |
| `/dashboard` | Yes | Yes | Dashboard (hospital variants: e.g. DashboardHospital6) |
| `/control-tower` | Yes | Yes | Control Tower |
| `/track/:patientId` | Yes | Yes | Track page |
| `/ivf-track-shipment` | Yes | Yes | IVF track shipment |
| `/ivf-track-shipment/:tankId` | Yes | Yes | IVF track shipment (tank) |
| `/outbound-quality-tracking` | Yes | Yes | Outbound quality tracking |
| `/outbound-quality-tracking/:canisterId` | Yes | Yes | Outbound quality tracking (canister) |
| `/alert-setting` | Yes (Manager/Admin) | Yes | Alert setting |
| `/embryo-grading` | Yes | — | Embryo grading |
| `/incubator-tracking` | Yes | — | Incubator tracking list |
| `/incubator-tracking/:id` | Yes | — | Incubator detail |
| `/database` | Yes | — | Database |
| `/track-and-trace` | Yes | — | Track and trace |
| `/user-profile` | Yes | — | User profile |
| `/support` | Yes | — | Support |
| `/approval` | Yes | — | Approval layout |
| `/approval-screen` | Yes | — | Approval screen |
| `*` | — | — | Not found |

**Variant route paths** (used in `ui_route_variants` and `VariantRoute`):

- `/dashboard`
- `/control-tower`
- `/track/:patientId`
- `/ivf-track-shipment`
- `/ivf-track-shipment/:tankId`
- `/outbound-quality-tracking`
- `/outbound-quality-tracking/:canisterId`
- `/alert-setting`

---

## Backend API routes (FastAPI)

All under **`/api`** unless noted. Controllers are mounted with `prefix=API_PREFIX` (`/api`).

### UI Variants (`/api/ui-variants`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/ui-variants/` | Variants for current user's hospital (auth) |
| GET | `/api/ui-variants/health-check` | All variants (admin, non-prod) |
| POST | `/api/ui-variants/` | Create variant (admin) |
| PUT | `/api/ui-variants/{variant_id}` | Update variant (admin) |
| DELETE | `/api/ui-variants/{variant_id}` | Delete variant (admin) |
| GET | `/api/ui-variants/hospital/{hospital_id}` | Variants for hospital (admin) |

### Other API prefixes (under `/api`)

| Prefix | Controller / purpose |
|--------|------------------------|
| (none) | User: `/api/register`, `/api/login`, `/api/verify-otp`, `/api/profile`, `/api/users`, `/api/user/{user_id}`, etc. |
| (none) | Dashboard: `/api/performance`, `/api/risk`, `/api/compliance`, `/api/logistics`, `/api/alerts` |
| (none) | Tasks, Lane Risk (no prefix) |
| `/patients` | Patient controller |
| `/feedback` | Feedback controller |
| `/chat` | Chat controller |
| `/shipment` | Shipment controller |
| `/quality` | Quality monitoring |
| `/iot` | IoT controller |
| `/kpi` | KPI WebSocket |
| `/quality-tracking` | IVF quality tracking |
| `/ivf` | IVF (treatments, etc.) |
| `/ivf/dashboard` | IVF dashboard metrics |
| `/ivf/quality` | IVF quality monitoring |
| `/ivf/alerts` | IVF critical alerts |
| `/internal/alerts` | Internal (service-to-service) alerts |
| `/ln2-readings` | LN2 readings |
| `/devices` | Devices (IVF) |

**OpenAPI (Swagger):** When the backend is running, full API docs are at `/docs` (Swagger UI) and `/redoc` (ReDoc).
