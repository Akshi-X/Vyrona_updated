# Vyrona – Technical Documentation

Technical reference for the Vyrona Supply Chain Tracking Platform. For setup and run instructions, see [DEVELOPER_SETUP_GUIDE.md](./DEVELOPER_SETUP_GUIDE.md) and [README.md](./README.md).

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture](#2-architecture)
3. [Backend](#3-backend)
4. [Frontend](#4-frontend)
5. [Database & Models](#5-database--models)
6. [Authentication & Authorization](#6-authentication--authorization)
7. [API Reference](#7-api-reference)
8. [Environment & Configuration](#8-environment--configuration)
9. [CI/CD & Deployment](#9-cicd--deployment)
10. [External Integrations](#10-external-integrations)
11. [Comparable Products](#11-comparable-products)

---

## 1. System Overview

**Vyrona** is a supply chain tracking platform with:

- **Real-time monitoring** of shipments and patients  
- **Patient management** and journey tracking  
- **Shipment tracking** (multi-leg, 3PL, control tower)  
- **Quality monitoring** (Redis Pub/Sub, loss/connection metrics)  
- **Feedback/Support** (tickets, comments, attachments)  
- **Task management** and **chat** (patient-scoped, WebSocket)  
- **Lane risk assessment** (LPI, weather, external factors)  
- **IVF module** (hospitals, tanks, canisters, embryos, LN2 logs)  
- **IoT provider integration** (Tive API) for device/sensor data  

### Tech Stack Summary

| Layer        | Technologies |
|-------------|--------------|
| **Backend** | Python 3.12+, FastAPI, SQLAlchemy 2, PostgreSQL, Redis, Poetry, Uvicorn |
| **Frontend**| React 19, TypeScript, Vite 7, Material-UI 7, Tailwind CSS 4, Axios, React Router 6 |
| **Auth**    | JWT (python-jose), passlib/bcrypt, role-based access (RBAC) |
| **APIs**    | REST under `/api`, OpenAPI at `/docs`, WebSockets for chat |
| **Deploy**  | Docker, Azure Web App (Container), ACR, GitHub Actions |

---

## 2. Architecture

### 2.1 Repository Layout

```
mG-SCALE/
├── .github/workflows/          # CI/CD (backend & frontend deploy)
├── backend/                    # FastAPI application
│   ├── app/
│   │   ├── auth/               # Auth helpers
│   │   ├── config/             # Settings, DB, permissions
│   │   ├── constants/          # App constants, enums, error codes, roles
│   │   ├── controller/         # API route handlers (REST)
│   │   │   └── IVF/            # IVF-specific controllers
│   │   ├── dependencies/       # Auth & RBAC dependencies
│   │   ├── exceptions/         # Custom exception classes
│   │   ├── middleware/          # CORS, RBAC, token, sanitization, validation
│   │   ├── models/             # SQLAlchemy ORM models
│   │   │   └── IVF/            # IVF domain models
│   │   ├── schemas/            # Pydantic request/response schemas
│   │   │   └── IVF/
│   │   ├── service/            # Business logic
│   │   │   └── IVF/
│   │   ├── templates/emails/   # Email HTML templates
│   │   └── utils/              # Helpers (WebSocket, lane risk, etc.)
│   ├── migration/              # Alembic migrations
│   ├── tests/                  # Pytest tests
│   ├── main.py                 # App entry, lifespan, route includes
│   ├── pyproject.toml         # Poetry deps
│   ├── Dockerfile
│   └── .env / .env.example
├── FrontEnd/
│   ├── src/
│   │   ├── api/                # API client setup
│   │   ├── components/         # Reusable UI (e.g. RoleBasedRoute, AuthRedirect)
│   │   ├── constants/         # App constants
│   │   ├── contexts/          # React context
│   │   ├── hooks/
│   │   ├── pages/              # Route-level pages
│   │   ├── routes/             # React Router config
│   │   ├── services/           # API services (auth, shipment, chat, etc.)
│   │   ├── types/
│   │   └── utils/
│   ├── package.json
│   └── vite.config.ts
├── DEVELOPER_SETUP_GUIDE.md
├── README.md
└── TECHNICAL_DOCUMENTATION.md  # This file
```
### Architecture Diagram 

flowchart TD

subgraph group_web["Web application"]
  node_webapp["React application<br/>[App.tsx]"]
  node_routes["Page routing<br/>[index.tsx]"]
  node_tracking["Shipment tracking<br/>[index.tsx]"]
  node_ivftracking["IVF tracking<br/>[index.tsx]"]
  node_refrigerator["Cold storage<br/>[index.tsx]"]
  node_embryo["Embryo grading<br/>[index.tsx]"]
  node_dashboard["Operational dashboards<br/>[index.tsx]"]
  node_authui["Authentication client<br/>[authService.ts]"]
end

subgraph group_api["API and domain"]
  node_api["FastAPI application<br/>[main.py]"]
  node_authcontroller["Integration auth"]
  node_authservice["Integration token service"]
  node_shipmentcontroller["Shipment endpoints"]
  node_ivfcontroller["IVF quality endpoints"]
  node_refillcontroller["Refill and quality logs"]
  node_chatcontroller["Stakeholder messaging<br/>[chat_controller.py]"]
  node_shipmentservice["Shipment domain service"]
  node_qualityservice["Quality monitoring<br/>[quality_service.py]"]
end

subgraph group_data["Persistence"]
  node_database[("SQL database<br/>[database.py]")]
  node_models["Domain records"]
end

subgraph group_ingest["Telemetry and integrations"]
  node_telemetry["Telemetry processing<br/>[consumer.py]"]
  node_webhook["Tive webhook ingestion<br/>[__init__.py]"]
  node_redis[("Redis state and pub/sub<br/>[redis_client.py]")]
end

node_user(("Platform user"))
node_hms(("Hospital system"))

node_user -->|"uses"| node_webapp
node_webapp -->|"renders routes"| node_routes
node_routes -->|"selects page"| node_tracking
node_routes -->|"selects page"| node_ivftracking
node_routes -->|"selects page"| node_refrigerator
node_routes -->|"selects page"| node_embryo
node_routes -->|"selects page"| node_dashboard
node_authui -->|"sends auth requests"| node_api
node_api -->|"dispatches"| node_authcontroller
node_authcontroller -->|"calls"| node_authservice
node_hms -.->|"requests integration access"| node_authcontroller
node_api -->|"dispatches"| node_shipmentcontroller
node_api -->|"dispatches"| node_ivfcontroller
node_api -->|"dispatches"| node_refillcontroller
node_api -->|"dispatches"| node_chatcontroller
node_shipmentcontroller -->|"calls"| node_shipmentservice
node_authservice -->|"reads and writes tokens"| node_database
node_api -->|"starts listener"| node_qualityservice
node_qualityservice -->|"listens"| node_redis
node_telemetry -->|"uses state"| node_redis
node_webhook -.->|"ingests events"| node_api
node_database -->|"persists"| node_models

click node_webapp "https://github.com/akshi-x/vyrona_updated/blob/main/FrontEnd/src/App.tsx"
click node_routes "https://github.com/akshi-x/vyrona_updated/blob/main/FrontEnd/src/routes/index.tsx"
click node_tracking "https://github.com/akshi-x/vyrona_updated/blob/main/FrontEnd/src/pages/Track/index.tsx"
click node_ivftracking "https://github.com/akshi-x/vyrona_updated/blob/main/FrontEnd/src/pages/IVFTrackShipment/index.tsx"
click node_refrigerator "https://github.com/akshi-x/vyrona_updated/blob/main/FrontEnd/src/pages/RefrigeratorTracking/index.tsx"
click node_embryo "https://github.com/akshi-x/vyrona_updated/blob/main/FrontEnd/src/pages/EmbryoGrading/index.tsx"
click node_dashboard "https://github.com/akshi-x/vyrona_updated/blob/main/FrontEnd/src/pages/Dashboard/index.tsx"
click node_authui "https://github.com/akshi-x/vyrona_updated/blob/main/FrontEnd/src/services/authService.ts"
click node_api "https://github.com/akshi-x/vyrona_updated/blob/main/backend/app/main.py"
click node_authcontroller "https://github.com/akshi-x/vyrona_updated/blob/main/backend/app/controller/external/integration_auth_controller.py"
click node_authservice "https://github.com/akshi-x/vyrona_updated/blob/main/backend/app/service/external/integration_auth_service.py"
click node_shipmentcontroller "https://github.com/akshi-x/vyrona_updated/blob/main/backend/app/controller/shipment_controller.py"
click node_ivfcontroller "https://github.com/akshi-x/vyrona_updated/blob/main/backend/app/controller/IVF/ivf_quality_controller.py"
click node_refillcontroller "https://github.com/akshi-x/vyrona_updated/blob/main/backend/app/controller/IVF/quality_tracking_controller.py"
click node_chatcontroller "https://github.com/akshi-x/vyrona_updated/blob/main/backend/app/controller/chat_controller.py"
click node_shipmentservice "https://github.com/akshi-x/vyrona_updated/blob/main/backend/app/service/shipment_service.py"
click node_qualityservice "https://github.com/akshi-x/vyrona_updated/blob/main/backend/app/service/quality_service.py"
click node_database "https://github.com/akshi-x/vyrona_updated/blob/main/backend/app/config/database.py"
click node_models "https://github.com/akshi-x/vyrona_updated/tree/main/backend/app/models"
click node_telemetry "https://github.com/akshi-x/vyrona_updated/blob/main/telemetry-service/shared/ln2_iot/consumer.py"
click node_webhook "https://github.com/akshi-x/vyrona_updated/blob/main/tive-ingestion-function/TiveWebhook/__init__.py"
click node_redis "https://github.com/akshi-x/vyrona_updated/blob/main/telemetry-service/shared/redis_client.py"

classDef toneNeutral fill:#f8fafc,stroke:#334155,stroke-width:1.5px,color:#0f172a
classDef toneBlue fill:#dbeafe,stroke:#2563eb,stroke-width:1.5px,color:#172554
classDef toneAmber fill:#fef3c7,stroke:#d97706,stroke-width:1.5px,color:#78350f
classDef toneMint fill:#dcfce7,stroke:#16a34a,stroke-width:1.5px,color:#14532d
classDef toneRose fill:#ffe4e6,stroke:#e11d48,stroke-width:1.5px,color:#881337
classDef toneIndigo fill:#e0e7ff,stroke:#4f46e5,stroke-width:1.5px,color:#312e81
classDef toneTeal fill:#ccfbf1,stroke:#0f766e,stroke-width:1.5px,color:#134e4a
class node_webapp,node_routes,node_tracking,node_ivftracking,node_refrigerator,node_embryo,node_dashboard,node_authui,node_user toneBlue
class node_api,node_authcontroller,node_authservice,node_shipmentcontroller,node_ivfcontroller,node_refillcontroller,node_chatcontroller,node_shipmentservice,node_qualityservice toneAmber
class node_database,node_models toneMint
class node_telemetry,node_webhook,node_redis toneRose
class node_hms toneIndigo

![alt text](diagram(2).png)

### 2.2 Request Flow (Backend)

1. **Uvicorn** → **FastAPI** → **CORS**  
2. **Exception handler** (middleware)  
3. **Sanitization** → **Patient validation** → **Request validation**  
4. **Token validation** (JWT) → **RBAC** (permissions)  
5. **Controller** → **Service** → **Model/DB**  
6. Response (JSON) or WebSocket message  

Static: `/static`, `/uploads`; OpenAPI: `/docs`, `/openapi.json`, `/redoc`; Health: `/health`.

### 2.3 Data Flow (High Level)

- **REST**: Frontend (`VITE_API_BASE_URL` + `/api/...`) → Backend → PostgreSQL; optional caching via Redis.  
- **Chat**: Frontend WebSocket → Backend WebSocket manager → Redis/broadcast; persistence via DB.  
- **Quality**: External publisher (or similar) → Redis Pub/Sub → Backend `QualityService` → DB/logs; frontend can poll or receive updates.

---

## 3. Backend

### 3.1 Entry Point & Server

- **Entry**: `backend/main.py`.  
- **ASGI**: `uvicorn` (run via `poetry run python main.py` or `uvicorn main:app --reload`).  
- **Lifespan**: Startup creates DB tables, pharma admins, quality background tasks, and LPI scheduler; no deprecated `on_event("startup")`.  
- **Reload**: When `RELOAD=true`, uvicorn is invoked with `"main:app"` (import string) so reload works correctly.

### 3.2 API Prefix & Routers

All REST APIs are under **`/api`** (`API_PREFIX` in `app_constants.py`). Routers included in `main.py`:

| Router (module)           | Prefix | Purpose |
|---------------------------|--------|--------|
| user_controller           | /api   | Register, login, OTP, approve/reject, profile, password reset |
| patient_controller        | /api   | Patients CRUD, bulk, search, stages, stats |
| feedback_controller       | /api   | Tickets, comments, attachments, status |
| task_controller           | /api   | Tasks CRUD, assign, filter |
| dashboard_controller      | /api   | Performance, risk, compliance, volume, logistics, alerts |
| chat_controller           | /api   | Chat + WebSocket (patient-scoped) |
| shipment_controller       | /api   | Shipments, legs, documents, control tower, carriers |
| lane_risk_controller      | /api   | Lane risk, LPI, complexity |
| quality_controller        | /api   | Quality health, loss/decision, monitoring |
| iot_controller            | /api   | IoT provider (Tive) proxy/actions |
| ivf_controller            | /api   | IVF hospitals, branches, tanks, canisters, embryos, etc. |
| ivf_dashboard_controller  | /api   | IVF dashboard/analytics |

### 3.3 Backend Structure (app/)

| Layer        | Role |
|-------------|------|
| **config**  | `config.py`: Pydantic Settings from env; `database.py`: SQLAlchemy engine, session, `init_db`; `permissions.py`: PUBLIC_ENDPOINTS, ADMIN_ONLY, PHARMA_ADMIN, MYGRAPE_ADMIN. |
| **constants** | App-wide constants: API_PREFIX, auth (JWT, session, lock, password policy), OTP, pagination, DB pool, feedback, WebSocket message types, IoT, regex. |
| **controller** | FastAPI routers; thin layer calling **service** and returning schemas. |
| **service**  | Business logic, DB access, external APIs (email, World Bank LPI, weather, FlightRadar24, IoT). |
| **models**   | SQLAlchemy declarative models (user, patient, shipment, feedback, task, chat, quality, IVF, etc.). |
| **schemas**  | Pydantic request/response models. |
| **middleware** | CORS, exception handler, sanitization, patient validation, request validation, token validation, RBAC. |
| **dependencies** | FastAPI dependencies for auth and RBAC. |
| **utils**    | WebSocket managers, lane risk/LPI helpers, IVF helpers, etc. |

### 3.4 Database & Connection

- **Driver**: `postgresql+psycopg2` (SQLAlchemy).  
- **URL**: Built in `config.Settings.database_url` from `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`, `DB_NAME`; password URL-encoded.  
- **SSL**: `database.enforce_sslmode()` adds `sslmode=require` to the URL (e.g. for Neon/Azure).  
- **Pool**: Configurable size, max overflow, timeout, recycle (see `app_constants.py`).  
- **Startup**: `init_db()` in `database.py` creates tables for all imported models (including IVF).

### 3.5 Testing

- **Framework**: Pytest; `backend/tests/` with `conftest.py` and per-controller/service tests.  
- **Env**: Tests can override config (e.g. `DB_NAME=pytest`) via `tests/__init__.py` or env.  
- Run: `poetry run pytest` from `backend/`.

### 3.6 Quality Tracking – Tank KPI live graph (Redis)

- **Channel**: `tank_kpi_readings_channel`. The IVF quality WebSocket subscribes and broadcasts to clients; the frontend Quality Tracking card shows live data when it receives `type === "tank_kpi"`.
- **Payload** (JSON): `type`, `tank_id`, `tank_code`, `timestamp` (ISO), `kpis` (array of `{ name, value, unit }`). KPIs: `temp_external`, `temp_internal`, `ln2_level`, `evaporation_rate`, `battery_level`.
- **Publish sample** (from `backend/` with `REDIS_URL` in env):  
  `python scripts/publish_tank_kpi_sample.py [tank_id] [tank_code]`  
  Or via redis-cli:  
  `redis-cli PUBLISH tank_kpi_readings_channel '{"type":"tank_kpi","tank_id":1,"tank_code":"T30","timestamp":"2026-02-22T13:00:00Z","kpis":[{"name":"temp_external","value":26.5,"unit":"°C"},{"name":"temp_internal","value":-199.2,"unit":"°C"},{"name":"ln2_level","value":62,"unit":"%"},{"name":"evaporation_rate","value":0.31,"unit":"kg/day"},{"name":"battery_level","value":85,"unit":"%"}]}'`

---

## 4. Frontend

### 4.1 Stack

- **React 19**, **TypeScript**, **Vite 7** (requires Node 20.19+ or 22.12+).  
- **Material-UI 7**, **Tailwind CSS 4**, **React Router 6**, **Axios**.  
- **Charts**: Chart.js / react-chartjs-2.  
- **Maps**: `@react-google-maps/api`.  
- **Auth**: JWT in headers; token stored (e.g. cookie/localStorage) via `utils/auth`; `RoleBasedRoute` and `AuthRedirect` for protected routes.

### 4.2 API Base URL

- **Env**: `VITE_API_BASE_URL` (build-time).  
- **Usage**: `FrontEnd/src/services/baseApiService.ts` – all API services extend `BaseApiService` and use this base URL + `getAuthHeaders()` for JWT.  
- **Local**: Typically `http://localhost:8000` (backend).

### 4.3 Routing (React Router)

| Path                    | Component / Guard        | Notes |
|-------------------------|--------------------------|--------|
| /                       | AuthRedirect             | Redirect to dashboard or login |
| /login                  | Login                    | Public |
| /signup                 | Signup                   | Public |
| /verify-otp             | VerifyOtp                | Public |
| /forgot-password        | ForgotPassword           | Public |
| /reset-password         | ResetPassword            | Public |
| /track-and-trace        | TrackAndTrace            | Public |
| /user-profile           | UserProfilePage          | |
| /support                | Support                  | |
| /success                | SuccessAlert             | |
| /dashboard              | Dashboard                | RoleBasedRoute (restricted: mygrape_admin) |
| /database               | Database                 | RoleBasedRoute (restricted: mygrape_admin) |
| /control-tower          | ControlTower             | RoleBasedRoute (restricted: mygrape_admin) |
| /track/:patientId       | TrackPage                | RoleBasedRoute (restricted: mygrape_admin) |
| /ivf-track-shipment/:patientId | IVFTrackShipmentPage | RoleBasedRoute (restricted: mygrape_admin) |
| /ivf-track-shipment     | IVFTrackShipmentPage     | RoleBasedRoute (restricted: mygrape_admin) |
| /approval-screen        | ApprovalScreen           | Public (approval flow) |
| *                       | NotFound                 | 404 |

### 4.4 Services (Frontend)

Services in `src/services/` call backend `/api` and use `BaseApiService` (auth headers, base URL):

- `authService`, `userService`, `patientService`, `shipmentService`, `trackingService`  
- `feedbackService`, `tasksService`, `chatService`  
- `dashboardService` (or split into performance, risk, compliance, etc.)  
- `laneRiskService`, `qualityService` (if exposed), `complianceService`, `criticalAlertsService`  
- `logisticsService`, `riskService`, `performanceService`  
- Base: `baseApiService.ts`

---

## 5. Database & Models

### 5.1 Database

- **PostgreSQL** (15+); compatible with Neon, Azure, or local.  
- **Migrations**: Alembic under `backend/migration/`; `alembic.ini` in `backend/`.  
- **Schema**: Single `public` schema (IVF previously had separate schema; now in public).

### 5.2 Main Model Areas

- **User / Auth**: user, OTP, roles (Admin, Pharma_admin, Mygrape_admin, Manager, User).  
- **Patient**: patient, patient_stage.  
- **Shipment**: shipment, shipment_leg, shipment_leg_document, carrier, provider, therapy, pharma.  
- **Feedback**: feedback, feedback_attachment, feedback_comments.  
- **Task**: task.  
- **Chat**: chat, chat_read_status, chat_message_tag.  
- **Quality / Telemetry**: quality_log, telemetry_model.  
- **Other**: geolocation, lane risk (may use external APIs + cache).  
- **IVF**: hospital, hospital_branch, tank, canister, canister_ln2_log, cane, cryolock, patient (IVF), embryo.

### 5.3 Connection Details

- Built from `.env`: `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`, `DB_NAME`.  
- For Neon: use the database name in your connection string (e.g. `firecrawl`); ensure `sslmode=require` (handled by backend).

---

## 6. Authentication & Authorization

### 6.1 Authentication

- **Login**: POST with credentials → JWT access token (and optional refresh).  
- **OTP**: Email OTP for verify step; resend and verify endpoints.  
- **Token**: `Authorization: Bearer <token>`; validated in `TokenValidationMiddleware` and auth dependencies.  
- **Session**: Role-based session timeouts (Admin 120 min, Manager 60 min, User 30 min); “remember me” extends to 9 hours.  
- **Account lock**: After 5 failed attempts, lock 30 minutes (configurable).  
- **Password**: Min length 8, upper/lower/digit/special; reset via token with 30 min expiry.

### 6.2 Roles (Backend)

Defined in `app/constants/roles.py`:

- **Admin**, **Pharma_admin**, **Mygrape_admin**, **Manager**, **User**.  
- **APPROVAL_ROLES**: Admin, Pharma_admin (user approval).  
- **FEEDBACK_ROLES**: Mygrape_admin (full feedback access).  
- **MANAGEMENT_ROLES**: Admin, Pharma_admin, Mygrape_admin, Manager.

### 6.3 Permissions (RBAC)

- **config/permissions.py**:  
  - **PUBLIC_ENDPOINTS**: register, login, verify-otp, resend-otp, forgot-password, reset-password, approval-screen, hospital-info-by-email, dashboard performance/risk/compliance/volume/logistics/alerts, health, docs, openapi, redoc, quality health/test, quality loss decision.  
  - **ADMIN_ONLY_ENDPOINTS**, **PHARMA_ADMIN_ENDPOINTS**, **MYGRAPE_ADMIN_ENDPOINTS**: method + path tuples; RBAC middleware allows/denies by role.

---

## 7. API Reference

### 7.1 Base URL & Docs

- **Base**: `{BACKEND_URL}/api` (e.g. `http://localhost:8000/api`).  
- **OpenAPI**: `GET /docs` (Swagger UI), `GET /openapi.json`, `GET /redoc`.  
- **Health**: `GET /health` (no auth).

### 7.2 Auth & Users

- **POST /api/register** – Register (public).  
- **POST /api/login** – Login (public).  
- **POST /api/verify-otp** – Verify OTP (public).  
- **POST /api/resend-otp** – Resend OTP (public).  
- **POST /api/forgot-password**, **POST /api/reset-password** – Password reset (public).  
- **GET/PUT /api/user/...** – Profile and user operations (protected).  
- **POST /api/user/approve**, **POST /api/user/reject** – Approval (pharma admin).  
- **GET /api/approval-screen** – Approval screen data (public).

### 7.3 Patients, Shipments, Tasks, Feedback, Chat

- **Patients**: CRUD, bulk create, search, filters, stages, stats under `/api/patients` (or similar).  
- **Shipments**: Shipments, legs, documents, control tower, carriers under `/api/shipments` (or similar).  
- **Tasks**: CRUD under `/api/tasks`.  
- **Feedback**: Tickets, comments, attachments under `/api/feedback` (or similar).  
- **Chat**: REST + WebSocket; patient-scoped; unread, mark read.

Exact paths and request/response shapes are in **Swagger `/docs`** (generated from FastAPI).

### 7.4 Dashboard, Lane Risk, Quality, IoT, IVF

- **Dashboard**: `/api/dashboard/performance`, `/risk`, `/compliance`, `/volume`, `/logistics`, `/alerts` (some public for dashboard widgets).  
- **Lane risk**: Lane risk and LPI-related endpoints under `/api/lane-risk` (or similar).  
- **Quality**: `/api/quality/health`, `/api/quality/test`, `PUT /api/quality/loss/decision` (public where noted in permissions).  
- **IoT**: Proxy to Tive (or other) under `/api/iot/...`.  
- **IVF**: Hospitals, branches, tanks, canisters, embryos, refill logs, etc. under `/api/ivf/...` and IVF dashboard under `/api/ivf-dashboard/...` (or as in OpenAPI).

---

## 8. Environment & Configuration

### 8.1 Backend (.env)

Required and optional variables (see `backend/.env.example` and `backend/app/config/config.py`):

| Variable | Required | Description |
|----------|----------|-------------|
| DB_USER, DB_PASSWORD, DB_HOST, DB_PORT, DB_NAME | Yes | PostgreSQL connection. |
| SECRET_KEY | Yes | JWT signing (min 32 chars). |
| ADMIN_EMAIL | Yes | Admin email. |
| ADMIN_DEFAULT_PASSWORD | Yes | Super admin bootstrap. |
| MYGRAPE_ADMIN_EMAIL, MYGRAPE_ADMIN_PASSWORD | Yes | Vyrona platform admin. |
| FRONTEND_URL, BACKEND_URL | Yes | URLs for CORS and links. |
| ALLOWED_ORIGINS | Yes | CORS origins (comma or *). |
| IOT_CLIENT_ID, IOT_CLIENT_SECRET, IOT_ACCOUNT_ID | Yes | IoT provider (e.g. Tive). |
| REDIS_HOST, REDIS_PORT, REDIS_DB, REDIS_PASSWORD | No | Defaults: localhost, 6379, 0, None. |
| SENDGRID_API_KEY, SENDER_EMAIL | No | SendGrid. |
| WEATHER_API_KEY, GOOGLE_MAPS_API_KEY, FLIGHTRADAR24_API_KEY | No | External APIs. |
| ENVIRONMENT, DEBUG, HOST, PORT, RELOAD | No | App and server settings. |

Database URL is built from DB_* and SSL is enforced in code; for Neon use the correct `DB_NAME` (e.g. `firecrawl`).

### 8.2 Frontend (.env)

- **VITE_API_BASE_URL**: Backend base URL (e.g. `http://localhost:8000`).  
- **VITE_GOOGLE_MAPS_API_KEY** (if used): Google Maps for maps/tracking.  
- Other `VITE_*` as needed for build.

---

## 9. CI/CD & Deployment

### 9.1 GitHub Actions

- **Backend**: `.github/workflows/main_mgscale-backend-dev.yml`  
  - On push to `main` or workflow_dispatch.  
  - Checkout → Azure login (service principal) → Verify Web App → Login to ACR → Build Docker image from `./backend` → Push to `myscaledev.azurecr.io/mgscale-backend:$run_number` → Deploy to Azure Web App `mgscale-backend-service-dev` (resource group `Mgscale`).  
- **Frontend**: `.github/workflows/main_mgscale-frontnd-dev.yml` – build and deploy frontend (e.g. Azure Static Web Apps or similar; see workflow file).

### 9.2 Backend Docker

- **Dockerfile**: `backend/Dockerfile`; multi-stage build, Poetry install, run uvicorn.  
- **Image**: Used by GitHub Actions; tag with `github.run_number`.

### 9.3 Secrets (GitHub / Azure)

- **AZURE_CREDENTIALS**: Service principal for Azure login.  
- **ACR_ADMIN_PASSWORD**: Azure Container Registry.  
- Frontend: **VITE_API_BASE_URL** (and other VITE_*) set in build if needed.

---

## 10. External Integrations

| Integration | Purpose | Config / Notes |
|-------------|--------|----------------|
| **PostgreSQL** | Primary DB | DB_* in .env; Neon/Azure supported with SSL. |
| **Redis** | Cache, session, pub/sub (quality) | REDIS_* in .env. |
| **SendGrid** | Transactional email | SENDGRID_API_KEY, SENDER_EMAIL. |
| **World Bank LPI** | Lane risk (timeliness, overall) | LPI_* URLs in config; optional. |
| **WeatherAPI.com** | Weather for lane risk | WEATHER_API_KEY. |
| **Google Maps** | Geocoding / maps | GOOGLE_MAPS_API_KEY (backend/frontend). |
| **FlightRadar24** | On-time flight data | FLIGHTRADAR24_API_KEY. |
| **Tive (IoT)** | Device/sensor API | IOT_CLIENT_ID, IOT_CLIENT_SECRET, IOT_ACCOUNT_ID; base URL in constants. |

---

## 11. Comparable Products

Similar commercial products, for market reference. Most specialize in one area; Vyrona spans all three (lab management + LN2 monitoring + AI grading).

| Product | What it does |
|---------|--------------|
| [ART Compass](https://www.artcompass.io/ivf-lab-management-software/) | IVF lab management with embryo tracking, cryostorage, and cycle logging. Closest all-in-one analog to Vyrona. |
| [IVFcheck (IVFtech)](https://www.ivftech.com/products/witness-system/ivfcheck/) | Lab management with embryo tracking, tank management, and pregnancy/statistics reports. Overlaps our cryotank + embryo modules. |
| [eWitness (Vitrolife)](https://www.vitrolife.com/products/electronic-witnessing/ewitness/) | Barcode/RFID electronic witnessing that logs every lab action. Comparable to our audit-trail and traceability. |
| [Gelida Connect (Genea Biomedx)](https://www.geneabiomedx.com/products/cryostorage-solution/gelida-47/) | Smart LN2 tanks with real-time temp/level monitoring and mobile alerts. Comparable to our ControlTower + alert configs. |
| [CenTrak](https://centrak.com/solutions/environment/cryogenic-storage) | Wireless cryo temperature/level monitoring with threshold alerts. Comparable to our KPI alert thresholds. |
| [Caremaps-AI (Care Fertility)](https://carefertility.com/blog/how-we-select-your-embryos-with-caremapsai) | AI morphokinetic embryo scoring for viability. Comparable to our AdvancedTool AI grading page. |

---

## Document History

- Single technical document for the whole repo: architecture, backend, frontend, database, auth, APIs, env, CI/CD, and integrations.  
- For step-by-step setup: **DEVELOPER_SETUP_GUIDE.md**.  
- For high-level overview and quick start: **README.md**.  
- For backend-only API details and examples: **backend/README.md**.
