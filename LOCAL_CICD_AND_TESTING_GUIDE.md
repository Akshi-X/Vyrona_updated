# mG-SCALE — Local CI/CD & Testing Guide

This guide covers everything you need to run the backend test suite locally — either directly with Pytest via Poetry, or by running the full GitHub Actions workflow on your machine using **Nektos `act`**. Written for new interns who want to test without pushing to GitHub first.

---

## Table of Contents

1. [Overview — What Are We Running?](#1-overview--what-are-we-running)
2. [Prerequisites](#2-prerequisites)
   - [Install Docker Desktop](#install-docker-desktop)
   - [Install Python 3.12 & Poetry](#install-python-312--poetry)
   - [Install Nektos `act` (for GitHub Actions locally)](#install-nektos-act-for-github-actions-locally)
3. [Start the Docker Services](#3-start-the-docker-services)
4. [Running Tests Directly with Pytest](#4-running-tests-directly-with-pytest)
5. [Running GitHub Actions Locally with `act`](#5-running-github-actions-locally-with-act)
   - [What `act` does](#what-act-does)
   - [Why the Docker socket command looks unusual](#why-the-docker-socket-command-looks-unusual)
   - [The `.actrc` file — what it pre-configures](#the-actrc-file--what-it-pre-configures)
   - [What happens automatically when `act` runs](#what-happens-automatically-when-act-runs)
   - [Running the workflow](#running-the-workflow)
6. [Interactive HTML Test Reports](#6-interactive-html-test-reports)
7. [CI/CD Pipelines Overview](#7-cicd-pipelines-overview)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. Overview — What Are We Running?

The backend is a **FastAPI + SQLAlchemy** application that talks to PostgreSQL, Redis, Azurite (Azure Storage emulator), an Event Hub emulator, and an SMTP dev server. The test suite is in `backend/tests/` and uses **Pytest**.

There are two ways to run the tests:

| Method | When to use |
|--------|-------------|
| **Pytest directly** | Fastest. Run individual test files while developing. Services must already be up. |
| **`act` (GitHub Actions locally)** | Simulates what GitHub CI does end-to-end: installs Poetry, sets env vars, runs the full suite exactly as the workflow defines. Good for catching CI-specific failures before pushing. |

Both methods need Docker running to provide the backing services (Postgres, Redis, etc.).

---

## 2. Prerequisites

### Install Docker Desktop

Docker Desktop bundles the Docker engine, the CLI, and the Docker Compose plugin. It is the simplest way to get Docker running on both Windows and Linux without manually managing system daemons.

- **Download page:** https://www.docker.com/products/docker-desktop/
- Choose the installer for your OS (Linux `.deb`/`.rpm`, or Windows `.exe`).

**Linux (Debian/Ubuntu) — quick install:**
```bash
# Download the .deb from the Docker Desktop download page, then:
sudo apt install ./docker-desktop-<version>-amd64.deb

# Start Docker Desktop
systemctl --user start docker-desktop

# Confirm it's running
docker ps
```

**Windows:**
1. Run the downloaded `Docker Desktop Installer.exe`.
2. Follow the wizard (enable WSL 2 integration when prompted).
3. Launch Docker Desktop from the Start Menu and wait for it to show "Engine running".
4. Open PowerShell and run `docker ps` to verify.

> After Docker Desktop is running, the Docker socket is at:
> - **Linux:** `/home/<your-user>/.docker/desktop/docker.sock`
> - **Windows (WSL 2):** `//./pipe/dockerDesktopLinuxEngine` or use the WSL2 socket path

---

### Install Python 3.12 & Poetry

The backend requires **Python 3.12**. Poetry manages the virtual environment and dependencies.

**Linux:**
```bash
# Install Python 3.12 (if not already installed)
sudo apt update && sudo apt install python3.12 python3.12-venv python3.12-dev

# Install Poetry
curl -sSL https://install.python-poetry.org | python3 -

# Add Poetry to PATH (add this line to ~/.bashrc or ~/.zshrc, then restart terminal)
export PATH="$HOME/.local/bin:$PATH"

# Verify
poetry --version
```

**Windows (PowerShell):**
```powershell
# Download Python 3.12 from https://www.python.org/downloads/ and install.
# Then install Poetry:
(Invoke-WebRequest -Uri https://install.python-poetry.org -UseBasicParsing).Content | python -

# Add Poetry to PATH if prompted by the installer output, then restart the terminal.
poetry --version
```

---

### Install Nektos `act` (for GitHub Actions locally)

`act` is a CLI tool that reads your `.github/workflows/*.yml` files and executes each job inside a Docker container, replicating GitHub's runner environment on your own machine.

**Linux:**
```bash
curl -s https://raw.githubusercontent.com/nektos/act/master/install.sh | sudo bash

# Or via Homebrew if you have it:
brew install act

# Verify
act --version
```

**Windows (PowerShell as Administrator):**
```powershell
# Winget
winget install nektos.act

# Or Chocolatey
choco install act-cli

# Or Scoop
scoop install act

act --version
```

> On the **first run**, `act` asks which runner image size to pull:
> - **Micro** (~1 GB) — too minimal, missing most tools.
> - **Medium** (~5 GB) — **choose this**. Has the tools the workflow needs.
> - **Large** (~20 GB) — full Ubuntu VM image, overkill.

---

## 3. Start the Docker Services

Before running any tests (either Pytest directly or via `act`), the backing services must be running on your host machine. From the **project root** directory:

```bash
docker compose up -d postgres redis azurite eventhub-emulator smtp4dev backend telemetry-service iot-ingestion-service
```

**What each service does:**

| Service | Port | Purpose |
|---------|------|---------|
| `postgres` | 5432 | Main database (PostgreSQL 15, db: `mygrape`) |
| `redis` | 6379 | Session caching and pub/sub |
| `azurite` | 10000–10002 | Azure Blob/Queue/Table storage emulator (local replacement for Azure Storage) |
| `eventhub-emulator` | 5672, 9092, 5300 | Azure Event Hub emulator (local replacement for cloud message bus) |
| `smtp4dev` | 25, 80 | Catches outgoing emails so tests don't send real mail |
| `backend` | 8000 | The FastAPI app itself |
| `telemetry-service` | — | Processes device telemetry from IoT sensors |
| `iot-ingestion-service` | 7072 | Receives IoT webhook payloads (used in integration tests) |

Confirm everything is healthy:
```bash
docker compose ps
curl http://localhost:8000/health
```

---

## 4. Running Tests Directly with Pytest

This is the fastest way to run tests during development. No `act` or CI overhead.

### Step 1 — Navigate to the backend directory and install dependencies

```bash
cd backend

# Install all dependencies into the Poetry virtual environment
poetry install
```

### Step 2 — Set up the backend `.env` file

The tests expect a `.env` file at `backend/.env`. Create it once:

```bash
cat > .env << 'EOF'
DB_USER=postgres
DB_PASSWORD=postgresDB-pass
DB_HOST=localhost
DB_PORT=5432
DB_NAME=mygrape
SECRET_KEY=dummy_secret_key_for_testing
ADMIN_EMAIL=admin@example.com
ADMIN_DEFAULT_PASSWORD=password123
MYGRAPE_ADMIN_EMAIL=mygrapeadmin@example.com
MYGRAPE_ADMIN_PASSWORD=password123
FRONTEND_URL=http://localhost:5173
BACKEND_URL=http://localhost:8000
ALLOWED_ORIGINS=*
IOT_CLIENT_ID=test_client_id
IOT_CLIENT_SECRET=test_client_secret
IOT_ACCOUNT_ID=test_account_id
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_SSL=False
ENVIRONMENT=testing
DEBUG=True
HOST=0.0.0.0
PORT=8000
RELOAD=True
FIXED_OTP_MODE=True
FIXED_OTP_CODE=123456
EOF
```

### Step 3 — Initialize the database schema

This runs the app's `init_db()` which creates all tables and seeds the admin user:

```bash
poetry run python -c "from app.init_db import init_db; init_db()"
```

### Step 4 — Run tests

```bash
# Run the full CI suite (same files the workflow runs)
poetry run pytest \
  tests/app/auth/test_auth.py \
  tests/app/alert-config/test_alert.py \
  tests/app/dashboard/test_dashboard_consistency.py \
  tests/app/dashboard/report_dash.py \
  tests/app/integration/test_alert_ingestion.py \
  tests/app/integration/test_refrigerator_alert_ingestion.py \
  tests/app/profile/test_profile.py \
  tests/app/integration/test_feedback_integration.py \
  tests/app/activity_log/test_activity_log.py

# Run with verbose output (shows each test name as it runs)
poetry run pytest -v tests/app/auth/test_auth.py

# Run a single test file
poetry run pytest tests/app/profile/test_profile.py

# Run with coverage report
poetry run pytest --cov=app --cov-report=html
```

---

## 5. Running GitHub Actions Locally with `act`

### What `act` does

`act` reads `.github/workflows/backend-tests.yml` and runs each step of the `test` job inside a Docker container (the "runner"). It:

1. Pulls a base Ubuntu image (the Medium runner you selected on first run).
2. Clones the repo into the container's workspace.
3. Runs every `steps:` entry in the workflow sequentially — setting up Python, installing Poetry, creating the `.env` files, waiting for services to become healthy, initializing the DB, and finally running Pytest.

This is exactly what happens when you push to `develop` on GitHub, minus GitHub's own compute.

---

### Why the Docker socket command looks unusual

On **Linux with Docker Desktop**, the Docker socket is not at the standard `/var/run/docker.sock` — it is at:

```
/home/<your-user>/.docker/desktop/docker.sock
```

You must tell both `act` and the Docker CLI where this socket is, otherwise `act` cannot spin up the runner container. The full command is:

```bash
DOCKER_HOST=unix:///home/akshi/.docker/desktop/docker.sock \
  act -W .github/workflows/backend-tests.yml \
  --container-daemon-socket /home/akshi/.docker/desktop/docker.sock \
  --network host
```

**Breaking down each flag:**

| Part | What it does |
|------|--------------|
| `DOCKER_HOST=unix:///home/akshi/.docker/desktop/docker.sock` | Tells the Docker CLI in your shell session where the daemon socket is (overrides the default `/var/run/docker.sock`). |
| `act -W .github/workflows/backend-tests.yml` | Tells `act` to only run the backend tests workflow file. |
| `--container-daemon-socket /home/akshi/.docker/desktop/docker.sock` | Tells `act` itself where the Docker socket is so it can create and manage the runner container. |
| `--network host` | Runs the runner container in the **host network namespace**, meaning `localhost` inside the container resolves to your actual machine's `localhost`. This lets the tests reach Postgres on port 5432, Redis on 6379, and so on — without any extra network bridging. |

> **If you are on standard Linux (not Docker Desktop):** the socket is at `/var/run/docker.sock`, so the simpler command works:
> ```bash
> act -W .github/workflows/backend-tests.yml --network host
> ```

---

### The `.actrc` file — what it pre-configures

The repository already has a `.actrc` file at the project root. `act` automatically reads it before every run:

```
--container-options --network host
--secret-file .secrets
```

- `--container-options --network host` — pre-applies the host-network flag so you do not have to type it every time (for standard Linux sockets). When using Docker Desktop's socket, you still need to pass the `DOCKER_HOST` and `--container-daemon-socket` manually since those are machine-specific paths.
- `--secret-file .secrets` — loads a local file called `.secrets` from the project root as GitHub Actions secrets. This file already exists in the repo. It contains:

```
POSTGRES_PASSWORD=postgresDB-pass
DB_PASSWORD=postgresDB-pass
```

These are the dummy local passwords injected into the workflow wherever `${{ secrets.POSTGRES_PASSWORD }}` appears.

---

### What happens automatically when `act` runs

When you fire the command, here is the sequence of events (matching the workflow steps):

1. **Checkout** — `act` mounts the local repo into the runner container (it does not re-clone from GitHub).
2. **Set up Python 3.12** — installs Python inside the runner container.
3. **Install Poetry 2.4.1** — installs Poetry inside the runner.
4. **Cache dependencies** — checks for a cached `.venv` keyed on `poetry.lock`. On first run this misses; subsequent runs are faster.
5. **Install dependencies** — runs `poetry install` inside `backend/`.
6. **Create `backend/.env`** — the workflow writes the full env file using the secrets you configured.
7. **Create root `.env` and `docker-compose.override.yml` (CI only, skipped by `act`)** — the step has `if: ${{ !env.ACT }}`. Because `act` automatically sets `ACT=true` in its environment, this step is **skipped**. `act` relies on the services already running on your host instead.
8. **Start Docker services (CI only, skipped by `act`)** — same `if: ${{ !env.ACT }}` guard. On real GitHub CI, this step runs `docker compose up -d ...`. Locally, you started those services manually in Step 3 of this guide.
9. **Wait for services** — polls `http://localhost:8000/docs` and `http://localhost:7072/api/tive/webhook` every 4 seconds (up to 30 tries) until both respond. Because the runner container is in the **host network**, these `localhost` calls reach your actual running containers.
10. **Initialize database schema** — runs `init_db()` to create tables and seed the admin.
11. **Run Pytest** — runs the full list of test files and streams output to your terminal.
12. **Cleanup** — removes the temporary `docker-compose.override.yml` if it was created.

---

### Running the workflow

Make sure the Docker services are up first (see [Section 3](#3-start-the-docker-services)), then from the **project root**:

**Linux with Docker Desktop (most common setup here):**
```bash
DOCKER_HOST=unix:///home/<user>/.docker/desktop/docker.sock \
  act -W .github/workflows/backend-tests.yml \
  --container-daemon-socket /home/<user>/.docker/desktop/docker.sock \
  --network host
```

**Standard Linux (Docker installed system-wide, not Docker Desktop):**
```bash
act -W .github/workflows/backend-tests.yml
```

**Other useful `act` commands:**
```bash
# List all jobs in all workflow files
act -l

# Dry-run: show what would execute without actually running
act -n

# Run just the 'test' job by name
act -j test

# Simulate a pull_request event trigger
act pull_request -W .github/workflows/backend-tests.yml
```

---

## 6. Interactive HTML Test Reports

Every Pytest run generates a timestamped HTML report under `backend/reports/`. These are self-contained HTML files — open them in any browser.

```
backend/reports/test_auth_20260630_120000.html
backend/reports/test_alert_20260630_120010.html
...
```

Each report contains:
- A summary card: total / passed / failed / skipped counts.
- Per-test status rows with execution duration.
- An expandable "show logs" drawer for each test showing stdout, stderr, captured log output, and full tracebacks for failures.

```bash
# Open a report on Linux
xdg-open backend/reports/test_auth_20260630_120000.html
```

---

## 7. CI/CD Pipelines Overview

The workflows live in `.github/workflows/`:

```
.github/workflows/
├── backend-tests.yml                         # CI: runs Pytest on push/PR to develop
├── main_mgscale-backend-dev.yml              # CD: builds & deploys backend Docker image to dev Azure
├── main_mgscale-backend-prod.yml             # CD: builds & deploys backend Docker image to production Azure
├── main_mgscale-frontnd-dev.yml              # CD: builds Vite bundle, deploys frontend to dev Azure
├── master_mgscale-dashboard-service-prod.yml # CD: deploys dashboard service to production
├── reusable-azure-webapp-docker.yml          # Reusable: Docker build + Azure Web App deploy
└── reusable-azure-webapp-node.yml            # Reusable: Node/Vite build + Azure Web App deploy
```

**Deployment flow:**

1. Developer pushes to `develop` or opens a PR targeting `develop`:
   - `backend-tests.yml` runs. If it passes, the CD backend workflow builds a Docker image from `backend/Dockerfile`, pushes it to Azure Container Registry (ACR), and deploys to the Dev Web App.
   - The frontend CD workflow runs `vite build` and deploys the static bundle to the Frontend Dev Web App.
2. PR merged into `main`/`master`:
   - The production CD workflows publish Docker images to the production ACR and update the Production Web Apps.

---

## 8. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `dial unix /var/run/docker.sock: no such file` | `act` is looking at the wrong socket path | Pass `DOCKER_HOST` and `--container-daemon-socket` pointing to Docker Desktop's socket at `/home/<user>/.docker/desktop/docker.sock` |
| `permission denied` on `/var/run/docker.sock` | Your user is not in the `docker` group | Run `sudo usermod -aG docker $USER`, then `newgrp docker`, then retry |
| `Port 8000 already in use` or `Port 5432 already in use` | A native process or stale container is holding the port | Run `docker compose ps` and `lsof -i :8000` to identify the conflict. Stop the conflicting process or change the port mapping in `docker-compose.yml`. |
| `poetry: command not found` inside `act` | The Medium runner image is not selected | On the first `act` run when prompted, select **Medium**. Or delete `~/.cache/act` and rerun to get the prompt again. |
| Pytest fails immediately with DB connection error | Services are not up or DB is not initialized | Run `docker compose ps` to check container health. Make sure you ran `init_db()` before the test run. |
| `Poetry lock file is not consistent with pyproject.toml` | A dependency was added without updating the lock file | Inside `backend/`: run `poetry lock --no-update` then `poetry install`. |
| `act` skips the "Start Docker services" step | Expected — this is intentional | The step has `if: ${{ !env.ACT }}`. `act` sets `ACT=true`, so the step is skipped. You start services manually instead. |
| Tests time out waiting for `localhost:8000` | Backend container is not healthy yet | Wait a moment for the backend to finish starting, then retry. Or check `docker compose logs backend`. |
