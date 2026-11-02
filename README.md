<div align="center">

# ❄️ Vyrona

**Real-Time Cold Chain, Specimen Journey & Cryogenic Telemetry Platform**

A production-grade supply chain intelligence and clinical tracking platform engineered for cryogenic cold chain custody, IVF biological specimens, IoT sensor telemetry, and multi-channel critical alert management.

[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688.svg?style=flat&logo=FastAPI&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-19.0+-61DAFB.svg?style=flat&logo=React&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-3178C6.svg?style=flat&logo=TypeScript&logoColor=white)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16+-4169E1.svg?style=flat&logo=PostgreSQL&logoColor=white)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7.0+-DC382D.svg?style=flat&logo=Redis&logoColor=white)](https://redis.io/)
[![Docker](https://img.shields.io/badge/Docker-Enabled-2496ED.svg?style=flat&logo=Docker&logoColor=white)](https://www.docker.com/)
[![AWS](https://img.shields.io/badge/AWS-EC2%20%7C%20SNS-FF9900.svg?style=flat&logo=AmazonAWS&logoColor=white)](https://aws.amazon.com/)

</div>

---

## 🏛️ System Architecture

Vyrona is organized across **four core architectural layers** deployed inside containerized environments (Docker Compose / AWS EC2), decoupling telemetry ingestion, real-time KPI threshold evaluation, and user-facing operational applications.

### 📐 Text-Based Architecture Schematic

```text
===================================================================================================
1. SOURCE LAYER
   ┌─────────────────────────────────────────┐         ┌ - - - - - - - - - - - - - - - - - - - - ┐
   │        Live Deviation Simulator         │         │     IoT Edge Sensors (Tive Trackers,    │
   │  [Python, local test / telemetry demo]  │         │     Cryotanks & Refrigerator Probes)    │
   │      (scripts/simulate_live_deviation)  │         │               (Planned)                 │
   └────────────────────┬────────────────────┘         └ - - - - - - - - - - ┬ - - - - - - - - - ┘
                        │                                                    │
========================╪====================================================╪=====================
2. INGESTION & EVENTS   │                                                    │
   ┌────────────────────▼────────────────────┐                               │
   │      IoT Ingestion Function (:7071)     │◄──────────────────────────────┘
   │ [tive-ingestion-function / HTTP webhook]│
   └────────────────────┬────────────────────┘
                        ▼
   ┌─────────────────────────────────────────┐
   │           Event Hub Emulator            │
   │    [Azure Event Hubs / pub-sub buffer]  │
   └────────────────────┬────────────────────┘
                        ▼
   ┌─────────────────────────────────────────┐         ┌─────────────────────────────────────────┐
   │        Telemetry Function (:7072)       │◄───────►│                 Azurite                 │
   │     [Validate payload, match asset]     │         │     [Azure Blob storage emulator]       │
   └────────────────────┬────────────────────┘         │          (ivf-media container)          │
                        │                              └─────────────────────────────────────────┘
========================╪==========================================================================
3. DATA & LOGIC LAYER   │
   ┌────────────────────▼────────────────────┐         ┌─────────────────────────────────────────┐
   │      KPI Evaluation & Alert Engine      │◄───────►│              Redis Cache                │
   │   [Threshold rules, loss/spike checks]  │         │      (:6379, pub/sub & fast state)      │
   └────────────────────┬────────────────────┘         └─────────────────────────────────────────┘
                        ▼
   ┌─────────────────────────────────────────┐
   │           PostgreSQL (:5432)            │
   │  [Assets, shipments, KPIs, telemetry]   │
   └────────────────────┬────────────────────┘
                        ▲
                        │ (Queries / State Persistence)
========================╪==========================================================================
4. APPLICATION & AWS INFRASTRUCTURE (Docker Compose Stack / AWS EC2: 16.113.114.79)
                        │
   ┌────────────────────▼────────────────────┐
   │           Backend REST API              │─────────► 📡 AWS SNS Service (Emergency SMS & Alerts)
   │     [FastAPI, port :8000, Uvicorn]      │              - Topic ARN: arn:aws:sns:ap-south-2:...
   │    - Auth, JWT, RBAC & scope checks     │              - Direct E.164 phone SMS delivery
   │    - IVF tracking & canister management │
   │    - Critical alert escalation engine   │─────────► ✉️ SMTP / Amazon SES (:587, Notifications)
   └────────────────────▲────────────────────┘              - Escalation & OTP transactional emails
                        │
                        │ (REST & WebSocket / Proxy via Nginx)
                        ▼
   ┌─────────────────────────────────────────┐
   │       React + Vite Web Dashboard        │
   │    [Port :5173 (Dev) / Nginx :80 (EC2)] │
   │    - Control Tower Map (Google Maps JS) │
   │    - Cryocan LN2 & Refrigerator charts  │
   │    - AI Embryo Grading & Reports        │
   └────────────────────▲────────────────────┘
                        │
                        ▼
   ┌─────────────────────────────────────────┐
   │            Authorized Staff             │
   │ [Clinicians, Embryologists, Couriers]   │
   └─────────────────────────────────────────┘
===================================================================================================
```

---

### 📊 Layered System Architecture Flow

```mermaid
graph TD
  classDef source fill:#eff6ff,stroke:#3b82f6,stroke-width:2px;
  classDef ingestion fill:#1e293b,stroke:#0f172a,stroke-width:2px,color:#ffffff;
  classDef data fill:#f8fafc,stroke:#0284c7,stroke-width:2px;
  classDef app fill:#f0fdf4,stroke:#16a34a,stroke-width:2px;
  classDef cloud fill:#fffbeb,stroke:#d97706,stroke-width:2px;
  classDef user fill:#faf5ff,stroke:#9333ea,stroke-width:2px;

  subgraph LAYER1["1. SOURCE"]
    SIM["Live Simulator<br/>(Python script, local)"]:::source
    IOT[/"IoT Devices<br/>(Tive sensors, cryotanks - planned)"/]:::source
  end

  subgraph LAYER2["2. INGESTION & EVENTS"]
    INGEST["IoT Ingestion Function<br/>:7071"]:::ingestion
    HUB["Event Hub Emulator<br/>(Publish / Consume Buffer)"]:::ingestion
    TELEM["Telemetry Function<br/>:7072"]:::ingestion
  end

  subgraph LAYER3["3. DATA & LOGIC"]
    AZURITE[("Azurite<br/>Blob Storage Emulator")]:::data
    REDIS[("Redis Cache<br/>:6379")]:::data
    KPI["KPI Evaluation & Alerts<br/>(Threshold Rules)"]:::data
    PG[("PostgreSQL<br/>:5432 (Assets, Telemetry, KPIs)")]:::data
  end

  subgraph LAYER4["4. APPLICATION & AWS INFRASTRUCTURE (Docker Compose on EC2)"]
    API["Backend API<br/>FastAPI :8000<br/>(Auth, Roles, Scope Checks)"]:::app
    DASH["React Dashboard<br/>Vite :5173 / Nginx :80<br/>(Control Tower & Telemetry)"]:::app
    SNS["AWS SNS Service<br/>(Emergency SMS Broadcast & Topics)"]:::cloud
    SMTP["SMTP / SES Service<br/>(:587 / :5000 Notifications)"]:::cloud
  end

  STAFF["Authorized Staff<br/>(Clinicians, Couriers, Admins)"]:::user

  %% Ingestion & Event pipeline
  SIM --> INGEST
  IOT -.-> INGEST
  INGEST --> HUB
  HUB --> TELEM
  TELEM <--> AZURITE
  TELEM --> KPI

  %% Data & Logic pipeline
  KPI <--> REDIS
  KPI --> PG
  PG <--> API

  %% Application, Cloud Alerts & Dashboard
  API --> SNS
  API --> SMTP
  API <--> DASH
  DASH <--> STAFF
```

---

### 🧩 Layer Breakdown Matrix

| Layer | Component | Port / Interface | Role & Implementation |
| :--- | :--- | :--- | :--- |
| **1. Source** | **Live Deviation Simulator** | CLI / Python | Generates simulated live sensor telemetry, GPS breadcrumbs, and temperature spikes. |
| | **IoT Devices (Tive Trackers)** | Cellular / BLE | Planned physical edge sensors deployed on liquid nitrogen cryotanks and lab refrigerators. |
| **2. Ingestion & Events** | **IoT Ingestion Function** | `:7071` (HTTP) | Azure Function receiver validating incoming tracker webhooks and formatting events. |
| | **Event Hub Emulator** | AMQP / Kafka | Local Azure Event Hubs emulator acting as the ingestion buffer and message distributor. |
| | **Telemetry Function** | `:7072` | Event-driven stream processor matching incoming device IDs to registered clinic assets. |
| | **Azurite** | `:10000` | Local Azure Blob Storage emulator storing raw payloads, specimen photos, and media. |
| **3. Data & Logic** | **KPI Evaluation Engine** | In-Process | Evaluates real-time threshold breaches (e.g. LN2 temp > -150°C, tilt, vibration, route deviation). |
| | **Redis Cache** | `:6379` | Fast in-memory state store, Pub/Sub channel for live deviation feeds, and token caching. |
| | **PostgreSQL** | `:5432` | System of record for users, hospital clinics, tanks, canisters, shipments, and telemetry logs. |
| **4. Application & Cloud** | **FastAPI Backend API** | `:8000` | REST API layer handling JWT authentication, RBAC, domain entities, and alert triggers. |
| | **React + Vite Dashboard** | `:5173` / `:80` | High-fidelity frontend containing Control Tower Google Map, Cryocan views, and reports. |
| | **AWS SNS Service** | Cloud (AWS) | Critical multi-channel notification engine dispatching instant SMS to on-call embryologists. |
| | **SMTP / Amazon SES** | `:587` / `:5000` | Transactional email delivery for OTPs, weekly SLA reports, and incident escalation notices. |
| | **AWS EC2 Host** | `16.113.114.79` | Production cloud host running the containerized Docker Compose stack behind Nginx. |

---

## 🌟 Key Features & Capabilities

- **🛰️ Control Tower & Live Geolocation**: Interactive global tracking map using Google Maps JS API with real-time route polyline rendering, dynamic deviation markers, live telemetry overlay, and waypoints.
- **❄️ Cryogenic Cold Storage (LN2) Monitoring**: Precision cryogenic tracking for liquid nitrogen tanks, real-time temperature/evaporation decay modeling, tilt and shock detection, and refill audit logs.
- **🧬 IVF & Biological Specimen Custody**: Full chain-of-custody tracking for embryos, oocytes, and sperm tanks across clinics, labs, and couriers with verification gating.
- **🚨 Multi-Channel Critical Alerting**: Threshold breach detection triggered via real-time telemetry, routing emergency SMS alerts via **AWS SNS**, escalation emails, and push notifications.
- **🧪 Real-Time Deviation Simulator**: Built-in test harness (`simulate_live_deviation.py`) for injecting realistic multi-step sensor breaches (temperature spikes, humidity loss, GPS route deviation) into active shipments.
- **🔬 AI Embryo Grading**: Image-based morphological scoring and stage verification workflows for laboratory embryologists.
- **🔒 Granular RBAC & Security**: Role-based access control (Super Admin, Hospital Admin, Clinician, Courier, Patient) backed by JWT authorization.

---

## 📁 Repository Structure

```text
mG-SCALE/
├── architecture-diagram.png     # Rendered system architecture diagram
├── diagram(2).png              # Architectural graphic asset
├── deploy.sh                   # One-command AWS EC2 deployment automation
├── deploy-nginx.conf           # Production Nginx reverse-proxy configuration
├── docker-compose.aws.yml      # Multi-container stack optimized for AWS EC2
├── docker-compose.yml          # Local multi-service development stack
├── backend/                    # FastAPI REST API Backend
│   ├── app/
│   │   ├── auth/               # JWT authentication & password policies
│   │   ├── config/             # Pydantic environment configuration
│   │   ├── controller/         # REST API routers & route handlers
│   │   │   └── IVF/            # IVF-specific endpoints (quality, alerts, dashboard)
│   │   ├── models/             # SQLAlchemy ORM database models
│   │   ├── service/            # Core business domain logic
│   │   │   ├── aws_sns_service.py # AWS SNS emergency broadcast integration
│   │   │   └── email_service.py   # Transactional email dispatcher
│   │   └── templates/emails/   # Responsive HTML email notification templates
│   ├── migration/              # Alembic database migration revisions
│   ├── scripts/                # Utility & demo simulation tools
│   │   ├── seed_rich_demo_data.py # Populates complete realistic demo data
│   │   └── simulate_live_deviation.py # Injects live sensor threshold breaches
│   ├── seed_db.py              # Base database seeder script
│   └── pyproject.toml          # Poetry dependency manifest
├── FrontEnd/                   # React 19 + TypeScript Frontend
│   ├── src/
│   │   ├── components/         # Reusable UI widgets & ControlTowerMap
│   │   ├── contexts/           # Global providers (Auth, Google Maps, Capability)
│   │   ├── pages/              # Primary route views (Dashboard, Track, Cryocan, etc.)
│   │   ├── routes/             # App routing tree & role-guarded paths
│   │   └── services/           # Axios HTTP API client layers
│   └── vite.config.ts          # Vite build & bundle configuration
├── telemetry-service/          # IoT ingestion function & stream processor
├── tive-ingestion-function/    # Azure Function webhook receiver for Tive trackers
└── DEVELOPER_SETUP_GUIDE.md    # Exhaustive developer workstation setup guide
```

---

## 🛠️ Technology Stack

| Domain | Technology | Description |
| :--- | :--- | :--- |
| **Backend Framework** | **FastAPI** (Python 3.12+) | High-performance async REST API framework |
| **Data Persistence** | **PostgreSQL 16** + **SQLAlchemy 2** | Relational data store with Alembic schema migrations |
| **Caching & Pub/Sub** | **Redis 7** | In-memory message broker, queue, and KPI cache |
| **Frontend Framework** | **React 19** + **TypeScript** | Strict component-driven UI with Vite 7 build tooling |
| **UI Design System** | **Tailwind CSS 4** + **Material-UI 7** | Clean responsive layouts, dark/light aesthetics, bento grids |
| **Mapping & Geospatial**| **Google Maps JavaScript API** | Satellite/roadmap projection, waypoint overlays, path interpolation |
| **Alerting & Cloud** | **AWS SNS** + **SMTP / SES** | Real-time SMS broadcast and transactional notification delivery |
| **Cloud Hosting** | **AWS EC2** (Ubuntu) + **Nginx** | Containerized backend services with Nginx frontend edge |

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- **Docker & Docker Compose** (v2+)
- **Python 3.12+** and **Poetry**
- **Node.js 20+** and **npm**

---

### Option A: Run via Docker Compose (Recommended for Local Dev)

Spin up PostgreSQL, Redis, Azurite, and backend services with a single command:

```bash
# Clone the repository
git clone git@github-akshi-x:Akshi-X/Vyrona_updated.git
cd Vyrona_updated

# Start local infrastructure
docker compose up -d

# Verify services are healthy
docker compose ps
```

---

### Option B: Manual Local Setup

#### Step 1: Backend Setup
```bash
cd backend

# Install dependencies via Poetry
poetry install

# Copy environment configuration
cp .env.example .env

# Run database migrations
poetry run alembic upgrade head

# Seed initial baseline data
poetry run python seed_db.py

# Optional: Seed rich demo scenarios (shipments, incubators, tanks)
poetry run python scripts/seed_rich_demo_data.py

# Start backend server
poetry run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
API Documentation will be available at: **http://localhost:8000/docs**

#### Step 2: Frontend Setup
```bash
cd FrontEnd

# Install npm packages
npm install

# Copy environment configuration
cp .env.example .env

# Start Vite dev server
npm run dev
```
Web app will be available at: **http://localhost:5173**

---

## 🧪 Real-Time Deviation Simulation

Vyrona includes an automated live simulation engine to demonstrate real-time telemetry processing, trigger deviation badges on the Control Tower map, and test AWS SNS alerts:

```bash
# From the backend directory:
poetry run python scripts/simulate_live_deviation.py
```
This script steps through a shipment journey, simulates GPS waypoints, injects an out-of-spec temperature excursion, and triggers critical alerts through the notification pipeline.

---

## 🚢 Deployment to AWS EC2

Automated deployment tooling is provided in `deploy.sh` to update an AWS EC2 host:

```bash
# Deploy both Backend & Frontend:
./deploy.sh all

# Deploy only Backend updates:
./deploy.sh backend

# Deploy only Frontend build:
./deploy.sh frontend
```

*For complete step-by-step production setup on AWS or Azure, see [DEVELOPER_SETUP_GUIDE.md](./DEVELOPER_SETUP_GUIDE.md) and [AZURE_DEPLOYMENT.md](./AZURE_DEPLOYMENT.md).*

---

## 📚 Supplementary Documentation

- 📖 **[Developer Setup Guide](./DEVELOPER_SETUP_GUIDE.md)**: Exhaustive manual environment setup instructions.
- 📐 **[Technical Documentation](./TECHNICAL_DOCUMENTATION.md)**: Deep dive on domain models, auth flows, and schema tables.
- ☁️ **[Azure Deployment Guide](./AZURE_DEPLOYMENT.md)**: Cloud deployment instructions for Azure App Service & EventHub.
- 🔐 **[OTP Configuration Guide](./OTP_CONFIGURATION.md)**: One-time password verification modes & email templates.
- 🗺️ **[Route Index](./ROUTES.md)**: Comprehensive mapping of frontend URLs and backend endpoints.

---

## 👥 Authors

- **Akshith Mahesh K** ([@Akshi-X](https://github.com/Akshi-X))

---

## 📄 License

This project is proprietary and confidential. All rights reserved.
