# Vyrona — Azure Deployment Guide

How the Vyrona stack runs on Microsoft Azure, why the same code works locally and
in the cloud without changes, and the exact steps/config to deploy each piece.

> **Naming note.** The *product* is Vyrona, but the Azure *resource* names in the
> existing CI/CD are still `mgscale-*` (ACR `myscaledev`, resource group `Mgscale`,
> etc.). Renaming a live cloud resource breaks connectivity, so infra names were left
> as-is during the rebrand. This guide uses the real existing names; rename the
> Azure resources separately only if you want to, and update the workflow inputs to match.

---

## 1. What we are deploying

| Component | Local (docker-compose) | Runtime | Deployed to |
|-----------|------------------------|---------|-------------|
| **Backend API** | `backend/` (uvicorn) | FastAPI + Gunicorn/Uvicorn (Docker) | **Azure Web App for Containers** (`mgscale-backend-service-dev`) via **ACR** |
| **Frontend** | Vite dev server | Static build (`dist/`) | **Azure Web App (Node/static)** (`mgscale-frontnd-dev`) |
| **Telemetry function** | `telemetry-service` container | Python Azure Function | **Azure Functions** (`mgscale-telemetry-dev`) |
| **IoT/Tive ingestion** | `tive-ingestion-function` container | Python Azure Function (HTTP webhook) | **Azure Functions** (`mgscale-ingestion-dev`) |
| **Grading service** | `grading-service` | Python Azure Function | **Azure Functions** (`mgscale-grading-dev`) |

Backing services (all swapped from local emulators to Azure managed services):

| Concern | Local emulator | Azure managed service |
|---------|----------------|-----------------------|
| Database | `postgres:15` container | **Azure Database for PostgreSQL – Flexible Server** |
| Cache / pub-sub | `redis:7` container | **Azure Cache for Redis** |
| Blob storage (embryo media) | **Azurite** | **Azure Blob Storage** (Storage Account) |
| Event streaming | **Event Hubs emulator** | **Azure Event Hubs** |
| Email (SMTP) | **smtp4dev** | **SendGrid** (or any SMTP) |

---

## 2. Why the code doesn't break in the cloud

Nothing in the app hardcodes an environment. Every external dependency is injected
through **environment variables / connection strings**, so the *same image and the
same code* run locally and on Azure — only configuration changes.

The abstractions that make this true (all in `backend/app/config/config.py`, a
Pydantic `BaseSettings`):

- **Database** — built from `DB_USER/PASSWORD/HOST/PORT/NAME`. The URL builder appends
  `sslmode=require` for cloud Postgres (Neon/Azure), so Azure Flexible Server's
  mandatory TLS works with no code change.
- **Redis** — `REDIS_SSL` defaults to `True` and `REDIS_PORT` to `6380` (Azure Cache
  for Redis SSL port). Locally you set `REDIS_SSL=false` and port `6379`. Same client code.
- **Blob storage** — `AZURE_STORAGE_CONNECTION_STRING` + `AZURE_STORAGE_BLOB_CONTAINER`.
  Locally that string points at Azurite (`devstoreaccount1`); in Azure it points at a
  real Storage Account. The SDK is identical.
- **CORS** — `ALLOWED_ORIGINS` (comma-separated) is read at startup and passed to
  `CORSMiddleware`. In cloud you set it to the frontend's public URL.
- **Frontend API target** — `VITE_API_BASE_URL` is baked in **at build time** (Vite
  env). The GitHub Action injects the cloud backend URL when it builds `dist/`.
- **Email** — SendGrid (`SENDGRID_API_KEY`, `SENDER_EMAIL`) or SMTP
  (`SMTP_SERVER/PORT/USERNAME/PASSWORD`). Locally these point at smtp4dev; in cloud at
  SendGrid. The email service drops missing inline assets gracefully.
- **Event Hubs / Functions** — the functions read `EVENTHUB_CONNECTION`/`EVENT_HUB_*`
  and `AzureWebJobsStorage`. Locally these use the emulator connection string
  (`UseDevelopmentEmulator=true`); in Azure they use the real namespace connection strings.

**Rule of thumb:** if a value differs between laptop and cloud, it lives in an env
var / App Setting — never in code. Deploying = provisioning the managed services and
filling in those settings.

---

## 3. Prerequisites (one-time Azure setup)

Create these in a resource group (existing: `Mgscale`):

1. **Azure Container Registry** — `myscaledev` (login server `myscaledev.azurecr.io`). Enable admin user.
2. **Azure Web App for Containers** (Linux) — `mgscale-backend-service-dev`, on a Linux App Service Plan (B1+ for dev, P1v3+ for prod).
3. **Azure Web App (Node)** — `mgscale-frontnd-dev` for the static frontend.
4. **Azure Database for PostgreSQL – Flexible Server** — enable "Allow Azure services" or add the Web App's outbound IPs; SSL enforced.
5. **Azure Cache for Redis** — note the hostname, primary key, SSL port `6380`.
6. **Storage Account** — for embryo media blobs and as `AzureWebJobsStorage` for the Functions.
7. **Azure Event Hubs namespace** — with the hub `telemetry-events`.
8. **Function Apps** (Python 3.11, Flex Consumption) — `mgscale-telemetry-dev`, `mgscale-ingestion-dev`, `mgscale-grading-dev`.
9. **SendGrid** account (or SMTP relay) for transactional email.
10. A **service principal** with rights to deploy to all of the above (used as `AZURE_CREDENTIALS`).

---

## 4. Deployment pipelines (already in `.github/workflows/`)

Everything is wired to **push to the `develop` branch** with path filters, plus manual
`workflow_dispatch`. Reusable workflows keep each service one small caller file.

### 4.1 Backend (Docker → ACR → Web App)
`main_mgscale-backend-dev.yml` → `reusable-azure-webapp-docker.yml`:
1. `az login` with the service principal.
2. `docker login` to `myscaledev.azurecr.io`.
3. `docker build ./backend` (uses `backend/Dockerfile`: Python 3.12-slim, Poetry, Gunicorn + Uvicorn worker on `:8000`).
4. Tag with `${{ github.run_number }}`, push to ACR.
5. `azure/webapps-deploy` points the Web App at the new image tag.

### 4.2 Frontend (Vite build → static Web App)
`main_mgscale-frontnd-dev.yml` → `reusable-azure-webapp-node.yml`:
1. `npm ci` in `FrontEnd/`.
2. **Validates `VITE_API_BASE_URL` secret exists** (fails fast if missing).
3. `npm run build` with `VITE_API_BASE_URL`, `VITE_GOOGLE_MAPS_API_KEY`, `VITE_GOOGLE_MAP_ID` injected → produces `dist/`.
4. Copies `web.config` into `dist/` if present (SPA routing / IIS rewrite).
5. Deploys `FrontEnd/dist` to the Web App.

### 4.3 Functions (telemetry / ingestion / grading)
`*_mgscale-*-dev.yml` → `reusable-azure-function-python.yml`:
1. `az login`.
2. `Azure/functions-action` with `remote-build: true` (builds Python deps on Azure, Flex Consumption).

> Prod variants (`*-prod.yml`) mirror these with the prod app names — trigger on the prod branch.

---

## 5. Per-service configuration (App Settings)

Set these in each Azure resource (Web App / Function App → **Configuration → Application settings**).
These replace the local `.env` / `local.settings.json`. **Never commit real secrets** — use
App Settings or Key Vault references.

### 5.1 Backend Web App
```
# Database (Azure PostgreSQL Flexible Server)
DB_HOST=<server>.postgres.database.azure.com
DB_PORT=5432
DB_NAME=<db>
DB_USER=<user>
DB_PASSWORD=<secret>

# Redis (Azure Cache for Redis)
REDIS_HOST=<name>.redis.cache.windows.net
REDIS_PORT=6380
REDIS_SSL=true
REDIS_SSL_CERT_REQS=required
REDIS_PASSWORD=<primary-key>

# App
ENVIRONMENT=production
DEBUG=false
SECRET_KEY=<random>
FRONTEND_URL=https://mgscale-frontnd-dev.azurewebsites.net
BACKEND_URL=https://mgscale-backend-service-dev.azurewebsites.net
ALLOWED_ORIGINS=https://mgscale-frontnd-dev.azurewebsites.net

# Blob storage (embryo media)
AZURE_STORAGE_CONNECTION_STRING=<storage-account-connection-string>
AZURE_STORAGE_BLOB_CONTAINER=ivf-media

# Email
SENDGRID_API_KEY=<key>
SENDER_EMAIL=<verified-sender>

# IoT (Tive) + integrations
IOT_CLIENT_ID=... IOT_CLIENT_SECRET=... IOT_ACCOUNT_ID=...
GOOGLE_MAPS_API_KEY=... WEATHER_API_KEY=...
INTERNAL_API_KEY=<shared-secret-with-functions>
GRADING_SERVICE_URL=https://mgscale-grading-dev.azurewebsites.net
GRADING_SERVICE_KEY=<function-key>
```
Also set the Web App's **WEBSITES_PORT=8000** so the platform routes to the container's port.

### 5.2 Frontend Web App
Build-time only (injected by the Action from GitHub Secrets, not runtime App Settings):
```
VITE_API_BASE_URL=https://mgscale-backend-service-dev.azurewebsites.net
VITE_GOOGLE_MAPS_API_KEY=...
VITE_GOOGLE_MAP_ID=...
```

### 5.3 Function Apps
```
FUNCTIONS_WORKER_RUNTIME=python
AzureWebJobsStorage=<storage-account-connection-string>

# telemetry + ingestion
EVENT_HUB_CONNECTION_STRING / EVENTHUB_CONNECTION=<event-hubs-namespace-connection-string>
EVENT_HUB_NAME / EVENTHUB_NAME=telemetry-events

# telemetry also talks back to the backend
DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD=<azure postgres>
REDIS_HOST/REDIS_PORT/REDIS_PASSWORD=<azure redis>
ALERT_API_BASE_URL=https://mgscale-backend-service-dev.azurewebsites.net
INTERNAL_API_KEY=<same shared secret as backend>

# ingestion (Tive webhook)
TIVE_WEBHOOK_KEY=... TIVE_WEBHOOK_SECRET=...
# do NOT set ALLOW_UNAUTHENTICATED_FOR_DEBUG in cloud (local-only)
```

---

## 6. GitHub Secrets required

| Secret | Used by |
|--------|---------|
| `AZURE_CREDENTIALS` | all workflows (service principal JSON) |
| `ACR_ADMIN_PASSWORD` | backend Docker push |
| `VITE_API_BASE_URL` | frontend build |
| `VITE_GOOGLE_MAPS_API_KEY`, `VITE_GOOGLE_MAP_ID` | frontend build |

---

## 7. Networking, CORS, SSL

- **HTTPS** is provided by Azure App Service by default (`*.azurewebsites.net`, or bind a custom domain + managed cert).
- **CORS** is enforced by the backend, not App Service — the frontend origin must be in `ALLOWED_ORIGINS`. Update it whenever the frontend URL changes. (This is exactly the class of error you saw locally with `:4173`.)
- **PostgreSQL** requires TLS — handled automatically (`sslmode=require`). Add the Web App outbound IPs to the server firewall, or use "Allow Azure services", or (best) Private Endpoint + VNet integration.
- **Redis** requires TLS on `6380` — `REDIS_SSL=true` / `REDIS_SSL_CERT_REQS=required` (already the defaults).
- For production, prefer **VNet integration + Private Endpoints** for Postgres, Redis, Storage, and Event Hubs so traffic never leaves the Azure backbone.

---

## 8. Data, migrations, seeding

- The backend initializes/creates tables and seeds the platform admin on startup
  (`app/init_db.py`, driven by `MYGRAPE_ADMIN_EMAIL/PASSWORD`, `ADMIN_*`). Ensure those
  App Settings are present before first boot.
- For schema changes in production, use the **expand/contract** pattern (add nullable
  column → backfill → switch → drop) to avoid downtime. Never point the app at the DB
  mid-`DROP`.
- The Flexible Server database must exist first (create it, then let the app create tables).

---

## 9. Post-deploy verification

1. **Backend health** — `GET https://mgscale-backend-service-dev.azurewebsites.net/health` → `200`, `platform: "Vyrona"`.
2. **API docs** — `/docs` loads (Swagger).
3. **Frontend** — loads, and login works (confirms `VITE_API_BASE_URL` + backend CORS are aligned).
4. **Email** — trigger an OTP/invite; confirm SendGrid delivery (check the branded "Vyrona" template + `vyrona-logo.png` renders).
5. **Ingestion** — POST a test Tive webhook to `https://mgscale-ingestion-dev.azurewebsites.net/api/tive/webhook`; confirm a reading lands in Postgres and (if it breaches a threshold) an alert + email fire.
6. **Logs** — App Service → Log stream / Application Insights for each app.

---

## 10. Rollback

- **Backend**: images are tagged per run number in ACR — redeploy the previous tag
  (`azure/webapps-deploy` with the old `images:` value), or use App Service deployment slots.
- **Frontend/Functions**: re-run the previous successful workflow, or swap slots.
- Keep a **staging slot** on the backend and frontend Web Apps and swap after smoke tests
  for zero-downtime releases.

---

## 11. Cost / sizing (dev vs prod)

| Resource | Dev | Prod |
|----------|-----|------|
| App Service Plan | B1 | P1v3+ (autoscale) |
| PostgreSQL Flexible | Burstable B1ms | General Purpose + HA |
| Redis | Basic C0 | Standard C1+ |
| Functions | Flex Consumption | Flex Consumption / EP1 |
| Storage / Event Hubs | Standard | Standard + zone redundancy |

Start on the dev tier; the code is identical — scaling up is a plan/SKU change, not a code change.
