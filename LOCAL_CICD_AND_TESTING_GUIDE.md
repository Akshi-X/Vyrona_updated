# mG-SCALE — Local Testing Guide

This guide walks you through running the backend tests on your own computer — no need to push anything to GitHub first. It is written for someone who may be doing this for the first time, so everything is explained step by step.

---

## Table of Contents

1. [What Are We Actually Doing?](#1-what-are-we-actually-doing)
2. [Step 1 — Install Docker Desktop](#2-step-1--install-docker-desktop)
3. [Step 2 — Install Python 3.12 and Poetry](#3-step-2--install-python-312-and-poetry)
4. [Step 3 — Install `act` (only if you need it)](#4-step-3--install-act-only-if-you-need-it)
5. [Step 4 — Start the Services](#5-step-4--start-the-services)
6. [Step 5 — Run Tests with Pytest](#6-step-5--run-tests-with-pytest)
7. [Step 6 — Run GitHub Actions on Your Computer with `act`](#7-step-6--run-github-actions-on-your-computer-with-act)
8. [Test Reports](#8-test-reports)
9. [How Deployments Work](#9-how-deployments-work)
10. [Something Went Wrong?](#10-something-went-wrong)

---

## 1. What Are We Actually Doing?

The backend is a Python app that needs a few other things running alongside it — a database, a cache, some cloud service replacements, and a fake email server. All of these run in Docker so you do not have to install them manually.

The tests live in `backend/tests/` and run using a tool called **Pytest**.

You have two ways to run the tests:

| Method | When to use it |
|--------|----------------|
| **Pytest directly** | The quickest option. Great for testing while you are writing code. |
| **`act`** | Makes your computer pretend to be GitHub's CI server. Use this when you want to be 100% sure your changes will pass before pushing. |

Both ways need Docker to be running first.

---

## 2. Step 1 — Install Docker Desktop

Docker lets you run apps in isolated boxes called containers. Instead of installing Postgres, Redis, and other tools directly on your computer, Docker runs them in the background without touching your system.

Docker Desktop is the easiest way to get Docker — it comes with everything you need in one installer.

### macOS

1. Go to [https://www.docker.com/products/docker-desktop/](https://www.docker.com/products/docker-desktop/) and download the right version:
   - **Apple chip (M1/M2/M3):** pick "Mac with Apple Silicon"
   - **Older Intel Mac:** pick "Mac with Intel chip"
2. Open the downloaded file and drag Docker into your Applications folder.
3. Open Docker from Applications. You will see a whale icon appear in your top menu bar.
4. Wait until it says **"Docker Desktop is running"**.
5. Open Terminal and type `docker ps` — if you see an empty table instead of an error, you are good.

### Windows

1. Go to [https://www.docker.com/products/docker-desktop/](https://www.docker.com/products/docker-desktop/) and download `Docker Desktop Installer.exe`.
2. Run the installer. When it asks about **WSL 2**, say yes — this is the recommended setup on Windows.
3. Restart your computer if it asks you to.
4. Open Docker Desktop from the Start Menu and wait for it to say **"Engine running"**.
5. Open PowerShell and type `docker ps` to confirm it works.

### Linux (Ubuntu/Debian)

**Option A — Docker Desktop (has a GUI):**
```bash
# Download the .deb file from https://www.docker.com/products/docker-desktop/ then run:
sudo apt install ./docker-desktop-<version>-amd64.deb
systemctl --user start docker-desktop
docker ps
```

**Option B — Just the Docker engine (lighter, no GUI):**
```bash
sudo apt update
sudo apt install docker.io docker-compose-plugin
sudo systemctl start docker
sudo usermod -aG docker $USER   # so you can run docker without sudo
newgrp docker                   # apply that change right now
docker ps
```

---

## 3. Step 2 — Install Python 3.12 and Poetry

The backend runs on **Python 3.12**. **Poetry** is the tool that installs all the Python packages the project needs and keeps them separate from anything else on your computer.

### macOS

```bash
# Install Homebrew first if you do not have it: https://brew.sh
# Then install Python 3.12:
brew install python@3.12

# Install Poetry:
curl -sSL https://install.python-poetry.org | python3 -

# Tell your terminal where to find Poetry.
# Add this line to ~/.zshrc, then restart Terminal:
export PATH="$HOME/.local/bin:$PATH"

# Check it worked:
python3.12 --version
poetry --version
```

### Windows (PowerShell)

1. Download Python 3.12 from [https://www.python.org/downloads/](https://www.python.org/downloads/) and run the installer. Make sure to check **"Add Python to PATH"**.
2. Then install Poetry:
   ```powershell
   (Invoke-WebRequest -Uri https://install.python-poetry.org -UseBasicParsing).Content | python -
   ```
3. Restart PowerShell and check:
   ```powershell
   python --version
   poetry --version
   ```

### Linux (Ubuntu/Debian)

```bash
sudo apt update && sudo apt install python3.12 python3.12-venv python3.12-dev

# Install Poetry:
curl -sSL https://install.python-poetry.org | python3 -

# Add this to ~/.bashrc, then restart your terminal:
export PATH="$HOME/.local/bin:$PATH"

# Check it worked:
python3.12 --version
poetry --version
```

---

## 4. Step 3 — Install `act` (only if you need it)

Skip this step if you just want to run Pytest directly (Step 5). You only need `act` if you want to simulate the full GitHub CI process on your computer.

`act` reads the GitHub Actions workflow files in `.github/workflows/` and runs them on your machine, in the same way GitHub would run them on its servers.

### macOS

```bash
brew install act
act --version
```

### Windows (PowerShell — run as Administrator)

```powershell
# Pick any one of these:
winget install nektos.act
# or
choco install act-cli
# or
scoop install act

act --version
```

### Linux

```bash
curl -s https://raw.githubusercontent.com/nektos/act/master/install.sh | sudo bash
# or, if you have Homebrew on Linux:
brew install act

act --version
```

> **First time running `act`?** It will ask you to pick an image size to download. These are like mini operating systems `act` uses to run your workflow:
> - **Micro** — too small, will be missing tools.
> - **Medium** — pick this one. It has everything needed.
> - **Large** — 17 GB download, way more than we need.

---

## 5. Step 4 — Start the Services

Before running any tests, you need to start the supporting services — the database, cache, and a few others. These all run in Docker containers.

Run this from the **root of the project** (the folder that has `docker-compose.yml` in it):

```bash
docker compose up -d postgres redis azurite eventhub-emulator smtp4dev backend telemetry-service iot-ingestion-service
docker compose up -d (alternative for above command)
```

The `-d` at the end means "run in the background" so your terminal stays free.

**What each service is for:**

| Service | Port | What it does |
|---------|------|--------------|
| `postgres` | 5432 | The main database |
| `redis` | 6379 | Stores temporary data like sessions |
| `azurite` | 10000–10002 | Pretends to be Azure file storage, locally |
| `eventhub-emulator` | 5672, 9092, 5300 | Pretends to be Azure's message system, locally |
| `smtp4dev` | 25, 80 | Catches emails sent by the app so nothing real is sent |
| `backend` | 8000 | The actual Python app |
| `telemetry-service` | — | Handles sensor data coming from devices |
| `iot-ingestion-service` | 7072 | Receives data from IoT devices |

**Check that everything started properly:**
```bash
docker compose ps
```
All services should show as `Up` or `healthy`.

**Also check the backend is responding:**
```bash
# macOS / Linux
curl http://localhost:8000/health

# Windows PowerShell
Invoke-WebRequest http://localhost:8000/health
```
You should get a success response, not an error.

---

## 6. Step 5 — Run Tests with Pytest

This is the quickest way to run tests. Use this while you are working on code day to day.

### 5a — Go to the backend folder and install packages

```bash
cd backend
poetry install
```

This reads the project's package list and installs everything into its own isolated environment. You only need to do this once, or when packages change.

### 5b — Set Up Database Isolation (Development vs Testing)

To avoid corrupting or polluting your local development data in `mygrape`, it is highly recommended to run tests against a separate database called **`mygrape_test`**.

#### 1. Create the test database
Run this command once in your terminal to create the test database inside your running PostgreSQL container:
```bash
docker exec -it mgscale-postgres psql -U postgres -c "CREATE DATABASE mygrape_test;"
```

#### 2. Copy the test environment settings
The tests read settings from `.env` inside the `backend/` folder. Copy the template `backend/.env.test` (which points to `mygrape_test`) to your active `backend/.env`:

**macOS / Linux:**
```bash
cp .env.test .env
```

**Windows (PowerShell):**
```powershell
Copy-Item .env.test .env
```

---

### Critical Integration Test Note: Database Alignment

> [!IMPORTANT]
> **Database alignment is only needed for running live integration tests or testing GitHub Actions locally.**
> Changing your root `.env` to `mygrape_test` is a **temporary configuration**. You must revert it back to your original database (`mygrape`) when you return to normal development and local UI testing.

Some tests (like `test_alert_ingestion.py` and `test_refrigerator_alert_ingestion.py`) are **live integration tests**. They post data to the IoT ingestion webhook on your host machine, which is processed by your running Docker containers (`telemetry-service`, `iot-ingestion-service`, etc.).

Because these host containers read your **root** `.env` file, they will search for devices and write telemetry data based on whatever database name is set there. 

If you want these live integration tests to pass locally under `act` or `pytest`, your host containers and your test configuration **must point to the same database**. 

To align them and run cleanly against the test database:
1. Edit your **root** `.env` file (in the project root directory) and set:
   ```env
   POSTGRES_DB=mygrape_test
   ```
2. Restart your host containers to apply the change:
   ```bash
   docker compose down
   docker compose up -d
   ```
3. Run `act` or `pytest`. They will now pass perfectly.
4. When going back to development, revert the root `.env` to `POSTGRES_DB=mygrape` and run `docker compose up -d` again.

---

### 5c — Set up the database tables

This initializes the tables and default schemas inside your active test database. Run it once before running the tests:

```bash
poetry run python -c "from app.config.database import init_db; init_db()"
poetry run python -c "from app.init_db import init_db; init_db()"
```

### 5d — Run the tests

```bash
# Run the full set of tests (same ones GitHub runs)
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

# Run one file and see each test name as it runs
poetry run pytest -v tests/app/auth/test_auth.py

# Run just one file
poetry run pytest tests/app/profile/test_profile.py

# Run with a coverage report
poetry run pytest --cov=app --cov-report=html
```

---

## 7. Step 6 — Run GitHub Actions on Your Computer with `act`

Use this when you want to check that your code will pass GitHub's checks before you push it.

### What `act` actually does

`act` opens `.github/workflows/backend-tests.yml` and runs every step in it on your computer, inside a container. It sets up Python, installs packages, creates the settings file, waits for the services to be ready, and then runs the tests — exactly the same as GitHub would do.

> The services (Postgres, Redis, etc.) still need to be started manually before you run `act`. More on why below.

---

### The `.actrc` file

There is already a `.actrc` file in the project root. `act` reads it automatically every time you run it. It contains:

```
--container-options --network host
```

- `--network host` — makes it so the container can reach `localhost` on your computer (so it can talk to Postgres, Redis, etc.).

---

### Running `act` — pick your operating system

#### macOS

On macOS, Docker's connection file lives at `~/.docker/run/docker.sock`. You need to tell `act` where to find it:

```bash
DOCKER_HOST=unix://$HOME/.docker/run/docker.sock \
  act -W .github/workflows/backend-tests.yml \
  --container-daemon-socket $HOME/.docker/run/docker.sock \
  --network host
```

#### Windows (PowerShell)

```powershell
act -W .github/workflows/backend-tests.yml --network host
```

If you get a connection error, make sure Docker Desktop is open and running.

#### Linux with Docker Desktop

Docker Desktop on Linux puts its connection file in a non-standard place:

```bash
DOCKER_HOST=unix://$HOME/.docker/desktop/docker.sock \
  act -W .github/workflows/backend-tests.yml \
  --container-daemon-socket $HOME/.docker/desktop/docker.sock \
  --network host
```

#### Linux with the Docker engine (no Docker Desktop)

```bash
act -W .github/workflows/backend-tests.yml
```

---

### Why does `act` skip some steps?

Two steps in the workflow file have this condition:

```yaml
if: ${{ !env.ACT }}
```

`act` automatically sets a variable called `ACT=true` when it runs. So any step with `!env.ACT` gets skipped when running locally. The skipped steps are:

- **"Start Docker services"** — on GitHub, this starts Postgres and Redis. On your computer, you already did that manually in Step 4.
- **"Create docker-compose.override.yml"** — only needed on GitHub's servers, not locally.

Everything else runs normally — Python setup, package install, settings file creation, database setup, and the actual tests.

---

### Other useful `act` commands

```bash
# See a list of all jobs across all workflow files
act -l

# Do a dry run — see what would happen without actually running anything
act -n

# Run just the 'test' job
act -j test

# Pretend a pull request was opened
act pull_request -W .github/workflows/backend-tests.yml
```

> [!NOTE]
> If you are on **macOS** or **Linux with Docker Desktop**, you must include your Docker socket environment variables and arguments (from Step 6) for **any** of these commands to avoid connection errors. For example:
> ```bash
> DOCKER_HOST=unix://$HOME/.docker/desktop/docker.sock \
>   act pull_request -W .github/workflows/backend-tests.yml \
>   --container-daemon-socket $HOME/.docker/desktop/docker.sock \
>   --network host
> ```

---

## 8. Test Reports

Every time you run Pytest, it automatically creates an HTML report in `backend/reports/`. These are regular files you can open in any browser.

```
backend/reports/test_auth_20260630_120000.html
backend/reports/test_alert_20260630_120010.html
```

Each report shows:
- How many tests passed, failed, or were skipped.
- How long each test took.
- For any failed test, you can expand it to see exactly what went wrong and why.

**Open a report:**

```bash
# macOS
open backend/reports/test_auth_20260630_120000.html

# Linux
xdg-open backend/reports/test_auth_20260630_120000.html
```

On Windows, just find the file in File Explorer and double-click it.

---

## 9. How Deployments Work

The GitHub Actions files live in `.github/workflows/`:

```
.github/workflows/
├── backend-tests.yml                         # Runs the tests on every push or pull request
├── main_mgscale-backend-dev.yml              # Deploys the backend to the dev environment
├── main_mgscale-backend-prod.yml             # Deploys the backend to production
├── main_mgscale-frontnd-dev.yml              # Builds and deploys the frontend to dev
├── master_mgscale-dashboard-service-prod.yml # Deploys the dashboard service to production
├── reusable-azure-webapp-docker.yml          # Shared file used by backend deploys
└── reusable-azure-webapp-node.yml            # Shared file used by frontend deploys
```

**What happens when you push code:**

1. You push to `develop` or open a pull request:
   - The tests run automatically.
   - If they pass, the backend gets packaged and deployed to the dev server on Azure.
   - The frontend gets built and deployed to the dev server too.

2. A pull request gets merged into `main`:
   - The same thing happens, but this time it goes to the production servers.

---

## 10. Something Went Wrong?

| What you see | Why it happens | How to fix it |
|--------------|----------------|---------------|
| `dial unix /var/run/docker.sock: no such file` | `act` cannot find Docker's connection file | Add `DOCKER_HOST` and `--container-daemon-socket` with the correct path for your OS (see Step 6). |
| `permission denied` on `/var/run/docker.sock` | Your user account does not have Docker access | Run `sudo usermod -aG docker $USER`, then `newgrp docker`, then try again. |
| `docker ps` says "Cannot connect to the Docker daemon" | Docker Desktop is not open | Open Docker Desktop and wait for it to say "Engine running". |
| `Port 5432 already in use` or `Port 8000 already in use` | Something else is using that port | Run `docker compose ps` to check. On macOS/Linux: `lsof -i :5432`. On Windows: `netstat -ano \| findstr 5432`. Stop whatever is using the port. |
| `poetry: command not found` | Poetry is not on your PATH | Add `export PATH="$HOME/.local/bin:$PATH"` to your shell settings file (`~/.zshrc` or `~/.bashrc`) and restart your terminal. |
| `poetry: command not found` inside `act` | The wrong image size was chosen for `act` | Delete `~/.cache/act` and run `act` again. When asked, pick **Medium**. |
| Tests fail with a database connection error | The database is not running, or the tables were never created | Run `docker compose ps` to check. Then run `poetry run python -c "from app.init_db import init_db; init_db()"`. |
| `Poetry lock file is not consistent with pyproject.toml` | A package was added but the lock file was not updated | Inside `backend/`, run `poetry lock --no-update` and then `poetry install`. |
| `act` skips the "Start Docker services" step | This is on purpose | That step only runs on GitHub. Locally, you start the services yourself in Step 4. |
| Tests are stuck waiting for `localhost:8000` | The backend container is still starting up | Wait 10–15 seconds and try again. Or run `docker compose logs backend` to see what is happening. |
| On macOS, `act` cannot connect to Docker | Wrong connection file path | Use `$HOME/.docker/run/docker.sock` — not the Linux path. Run `ls ~/.docker/run/` to confirm the file is there. |
