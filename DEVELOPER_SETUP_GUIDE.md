# MyGrape Developer Setup Guide

**Complete setup guide for new developers - No questions needed!**

This guide provides step-by-step instructions to set up the entire MyGrape development environment from scratch. Follow this guide sequentially, and you'll have everything running without needing to ask anyone.

---

## 📋 Table of Contents

1. [Prerequisites & Versions](#prerequisites--versions)
2. [Project Overview](#project-overview)
3. [Initial Setup](#initial-setup)
4. [Backend Setup](#backend-setup)
5. [Frontend Setup](#frontend-setup)
6. [Publisher Service Setup](#publisher-service-setup)
7. [Database Setup](#database-setup)
8. [Redis Setup](#redis-setup)
9. [Running the Application](#running-the-application)
10. [Verification & Testing](#verification--testing)
11. [Troubleshooting](#troubleshooting)
12. [Development Workflow](#development-workflow)

---

## 📦 Prerequisites & Versions

### Required Software & Versions

| Software | Version | Download Link | Notes |
|----------|---------|---------------|-------|
| **Python** | **3.12+** | [python.org/downloads](https://www.python.org/downloads/) | Must be 3.12 or higher |
| **Poetry** | Latest | [python-poetry.org](https://python-poetry.org/docs/#installation) | Python dependency manager |
| **Node.js** | **20.19+ or 22.12+** | [nodejs.org](https://nodejs.org/) | For frontend development (Vite 7 requirement) |
| **npm** | Comes with Node.js | - | Package manager for frontend |
| **PostgreSQL** | **15+** | [postgresql.org/download](https://www.postgresql.org/download/) | Database server |
| **Redis** | **6.x or 7.x** | [redis.io/download](https://redis.io/download/) | Caching & pub/sub (Python redis client 5.x compatible) |
| **Git** | Latest | [git-scm.com](https://git-scm.com/downloads) | Version control |

### Optional Software

| Software | Version | Purpose |
|----------|---------|---------|
| **Docker** | Latest | Containerized deployment (optional) |
| **Docker Compose** | Latest | Multi-container orchestration (optional) |
| **Postman** | Latest | API testing (optional) |

### Python Dependencies (Backend)

All Python dependencies are managed via Poetry. Key versions:

- **FastAPI**: 0.118.0 (>=0.118.0,<0.119.0)
- **SQLAlchemy**: 2.0.43+ (>=2.0.43,<3.0.0)
- **psycopg2**: 2.9.10+ (>=2.9.10,<3.0.0)
- **Pydantic**: 2.11.9+ (>=2.11.9,<3.0.0)
- **uvicorn**: 0.37.0+ (>=0.37.0,<0.38.0)
- **python-jose**: 3.3.0+ (>=3.3.0,<4.0.0)
- **redis**: 5.0.0+ (>=5.0.0,<6.0.0)
- **alembic**: 1.13.0+ (>=1.13.0,<2.0.0)
- **websockets**: 12.0+ (>=12.0,<16.0)

See `backend/pyproject.toml` for complete dependency list.

### Frontend Dependencies

All frontend dependencies are managed via npm. Key versions:

- **React**: 19.1.1
- **TypeScript**: ~5.8.3
- **Vite**: ^7.1.7 (requires Node.js 20.19+ or 22.12+)
- **Material-UI**: ^7.3.4
- **Axios**: ^1.12.2
- **React Router**: ^6.30.1
- **Tailwind CSS**: ^4.1.14

**Important:** Vite 7 requires Node.js version 20.19+ or 22.12+. Make sure you have the correct Node.js version installed.

See `FrontEnd/package.json` for complete dependency list.

---

## 🏗️ Project Overview

The MyGrape project consists of three main components:

1. **Backend** (`backend/`) - FastAPI REST API server
2. **Frontend** (`FrontEnd/`) - React + TypeScript web application
3. **Publisher** (`publisher/`) - Quality data publisher service (Redis Pub/Sub)

### Project Structure

```
mygrape/
├── backend/              # FastAPI backend application
│   ├── app/              # Application code
│   ├── migration/        # Database migrations (Alembic)
│   ├── docker/           # Docker configuration
│   ├── tests/            # Test files
│   ├── pyproject.toml    # Python dependencies
│   └── .env              # Environment variables (create this)
│
├── FrontEnd/             # React frontend application
│   ├── src/              # Source code
│   ├── package.json      # Node dependencies
│   └── vite.config.ts    # Vite configuration
│
└── publisher/            # Quality data publisher service
    ├── publisher.py      # Main publisher script
    ├── publisher_config.py
    ├── publisher_database.py
    └── .publisher.env     # Publisher environment variables (create this)
```

---

## 🚀 Initial Setup

### Step 1: Clone the Repository

```bash
# Clone the repository
git clone <repository-url>
cd mygrape
```

### Step 2: Verify Prerequisites

```bash
# Check Python version (must be 3.12+)
python --version
# Expected: Python 3.12.x or higher

# Check Node.js version (must be 20.19+ or 22.12+)
node --version
# Expected: v20.19.x or higher, OR v22.12.x or higher
# Note: Vite 7 requires Node.js 20.19+ or 22.12+

# Check npm version
npm --version

# Check if Poetry is installed
poetry --version
# If not installed, see installation instructions below

# Check PostgreSQL version
psql --version
# Expected: psql (PostgreSQL) 15.x or higher

# Check Redis version
redis-cli --version
# Expected: redis-cli 6.x.x or higher (6.x or 7.x recommended)
```

### Step 3: Install Poetry (if not installed)

**Windows (PowerShell):**
```powershell
(Invoke-WebRequest -Uri https://install.python-poetry.org -UseBasicParsing).Content | python -
```

**macOS/Linux:**
```bash
curl -sSL https://install.python-poetry.org | python3 -
```

**Add Poetry to PATH:**

**Windows:**
- Add `%APPDATA%\Python\Scripts` to your PATH environment variable

**macOS/Linux:**
```bash
export PATH="$HOME/.local/bin:$PATH"
# Add to ~/.bashrc or ~/.zshrc for persistence
```

---

## 🗄️ Database Setup

### Step 1: Install PostgreSQL

**Windows:**
- Download from [postgresql.org/download/windows](https://www.postgresql.org/download/windows/)
- Run installer and follow setup wizard
- Remember the password you set for the `postgres` user

**macOS:**
```bash
brew install postgresql@15
brew services start postgresql@15
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt-get update
sudo apt-get install postgresql-15 postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### Step 2: Create Database

```bash
# Connect to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE mygrape;

# Verify database was created
\l

# Exit psql
\q
```

**Note:** If you get authentication errors, you may need to:
- Use `sudo -u postgres psql` on Linux/Mac
- Or configure PostgreSQL authentication settings

### Step 3: Verify Database Connection

```bash
# Test connection
psql -U postgres -d mygrape -c "SELECT version();"
```

---

## 🔴 Redis Setup

### Step 1: Install Redis

**Windows:**
- Option 1: Use WSL (Windows Subsystem for Linux)
- Option 2: Use Docker: `docker run --name redis -p 6379:6379 -d redis:7-alpine` (or `redis:6-alpine`)
- Option 3: Download from [GitHub releases](https://github.com/microsoftarchive/redis/releases)

**macOS:**
```bash
brew install redis
brew services start redis
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt-get update
sudo apt-get install redis-server
sudo systemctl start redis-server
sudo systemctl enable redis-server
```

### Step 2: Verify Redis Installation

```bash
# Test Redis connection
redis-cli ping
# Expected output: PONG

# Check Redis version
redis-cli --version
```

### Step 3: Redis Configuration (Optional)

For production, you may want to set a password. Edit Redis config file:

**Linux/Mac:** `/etc/redis/redis.conf`
**Windows:** Redis config file location depends on installation

Add:
```
requirepass your_redis_password
```

Then restart Redis service.

**Important:** If you set a Redis password, you must also add it to your `.env` file:
```
REDIS_PASSWORD=your_redis_password
```

If Redis doesn't require a password (default for local development), you can omit this variable or leave it empty.

---

## 🔧 Backend Setup

### Step 1: Navigate to Backend Directory

```bash
cd backend
```

### Step 2: Install Python Dependencies

```bash
# Install all dependencies (including dev dependencies)
poetry install

# This will:
# - Create a virtual environment
# - Install all packages from pyproject.toml
# - Install dev dependencies (pytest, coverage, etc.)
```

**Note:** If you encounter issues, try:
```bash
# Clear Poetry cache
poetry cache clear pypi --all

# Reinstall dependencies
poetry install --no-cache
```

### Step 3: Activate Poetry Virtual Environment

```bash
# Activate the virtual environment
poetry shell

# You should see your prompt change to indicate the virtual environment is active
# On Windows: (backend-xxxxx-py3.12)
# On Mac/Linux: (backend-xxxxx-py3.12)
```

**Alternative:** Run commands with `poetry run` prefix:
```bash
poetry run python app/main.py
poetry run pytest
```

### Step 4: Create Environment File

Create a `.env` file in the `backend/` directory:

```bash
# Windows PowerShell
New-Item -Path .env -ItemType File

# Mac/Linux
touch .env
```

### Step 5: Configure Environment Variables

Edit `backend/.env` with the following content:

```env
# ============================================
# Database Configuration
# ============================================
DB_USER=postgres
DB_PASSWORD=your_postgres_password_here
DB_HOST=localhost
DB_PORT=5432
DB_NAME=mygrape

# ============================================
# Redis Configuration
# ============================================
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0
REDIS_PASSWORD=  # Optional: Set if Redis requires authentication (leave empty if no password)
REDIS_SOCKET_CONNECT_TIMEOUT=5
REDIS_SOCKET_TIMEOUT=5

# ============================================
# Security Configuration
# ============================================
# IMPORTANT: Generate a secure random string (minimum 32 characters)
# You can use: python -c "import secrets; print(secrets.token_urlsafe(32))"
SECRET_KEY=your-secret-key-minimum-32-characters-long-generate-random-string

# ============================================
# Email Configuration
# ============================================
ADMIN_EMAIL=admin@example.com
# SendGrid Configuration
SENDGRID_API_KEY=your-sendgrid-api-key
SENDER_EMAIL=your-email@example.com

# ============================================
# Admin Account Configuration
# ============================================
ADMIN_DEFAULT_PASSWORD=SecureAdminPassword123!
MYGRAPE_ADMIN_EMAIL=admin@mygrape.com
MYGRAPE_ADMIN_PASSWORD=SecureMyGrapeAdmin123!

# ============================================
# Application URLs
# ============================================
FRONTEND_URL=http://localhost:5173
BACKEND_URL=http://localhost:8000

# ============================================
# CORS Configuration
# ============================================
# Comma-separated list of allowed origins
# Use "*" for all origins (NOT recommended for production)
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000

# ============================================
# Environment Settings
# ============================================
ENVIRONMENT=development
DEBUG=True
HOST=0.0.0.0
PORT=8000
RELOAD=True
```

**Important Notes:**
- Replace `your_postgres_password_here` with your actual PostgreSQL password
- Generate a secure `SECRET_KEY` using: `python -c "import secrets; print(secrets.token_urlsafe(32))"`

### Step 6: Configure Pharma Admins

Create `backend/pharma_admins.json`:

```bash
# Copy example file
cp pharma_admins.json.example pharma_admins.json
```

Edit `backend/pharma_admins.json`:

```json
[
  {
    "email": "admin1@pharma1.com",
    "password": "SecurePassword123!",
    "company": "Pharma Company 1",
    "first_name": "John",
    "last_name": "Admin",
    "location": "New York, USA"
  },
  {
    "email": "admin2@pharma2.com",
    "password": "SecurePassword456!",
    "company": "Pharma Company 2",
    "first_name": "Jane",
    "last_name": "Admin",
    "location": "London, UK"
  }
]
```

**Note:** You can add multiple pharma admins. Each pharma company will be created automatically when the backend starts.

### Step 7: Initialize Database Tables

The database tables are created automatically when you first run the backend. However, if you want to run migrations manually:

```bash
# Make sure you're in the backend directory
cd backend

# Run Alembic migrations (if configured)
poetry run alembic upgrade head
```

**Note:** The application uses SQLAlchemy's `create_all()` method on startup, so migrations are optional but recommended for production.

---

## 🎨 Frontend Setup

### Step 1: Navigate to Frontend Directory

```bash
# From project root
cd FrontEnd
```

### Step 2: Install Node Dependencies

```bash
# Install all dependencies
npm install

# This will:
# - Read package.json
# - Install all dependencies to node_modules/
# - Create package-lock.json
```

**Note:** If you encounter issues:
```bash
# Clear npm cache
npm cache clean --force

# Delete node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

### Step 3: Verify Frontend Configuration

The frontend is configured to connect to `http://localhost:8000` by default. Check `FrontEnd/src/api/` for API configuration files.

**Note:** No environment file is needed for frontend in development mode. The API URL is typically configured in the API client files.

---

## 📡 Publisher Service Setup

### Step 1: Navigate to Publisher Directory

```bash
# From project root
cd publisher
```

### Step 2: Create Publisher Environment File

```bash
# Windows PowerShell
Copy-Item .publisher.env.example .publisher.env

# Mac/Linux
cp .publisher.env.example .publisher.env
```

### Step 3: Configure Publisher Environment

Edit `publisher/.publisher.env`:

```env
# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0
REDIS_PASSWORD=  # Optional: Set if Redis requires authentication (leave empty if no password)
REDIS_SOCKET_CONNECT_TIMEOUT=5
REDIS_SOCKET_TIMEOUT=5

# Database Configuration
# These should match your backend database credentials
DB_USER=postgres
DB_PASSWORD=your_postgres_password_here
DB_HOST=localhost
DB_PORT=5432
DB_NAME=mygrape

# Optional: Backend Path
# If the publisher can't auto-detect the backend directory, specify it here
# Use absolute path (recommended) or path relative to publisher directory
# Examples:
# BACKEND_PATH=D:\testing\mygrape\backend
# BACKEND_PATH=C:\Users\YourName\projects\mygrape\backend
# BACKEND_PATH=../backend
```

**Important:** The publisher needs database access to fetch patient IDs. Make sure the database credentials match your backend `.env` file.

### Step 4: Install Publisher Dependencies

The publisher uses the same Python environment as the backend. Make sure you have:

```bash
# From publisher directory or project root
# The publisher imports from backend, so backend dependencies must be installed
cd ../backend
poetry install

# Publisher-specific dependencies (if any) are included in backend dependencies
```

---

## 🚀 Running the Application

### Running All Services

You need to run three services simultaneously:

1. **Backend API** (FastAPI)
2. **Frontend** (React/Vite)
3. **Publisher** (Quality data publisher)

### Terminal Setup

Open **three separate terminal windows/tabs**:

- **Terminal 1:** Backend
- **Terminal 2:** Frontend
- **Terminal 3:** Publisher

---

### Terminal 1: Start Backend

```bash
# Navigate to backend directory
cd backend

# Activate Poetry environment (if not already activated)
poetry shell

# Run the backend server
poetry run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Alternative: Run directly
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Expected Output:**
```
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
INFO:     Started reloader process
INFO:     Started server process
INFO:     Waiting for application startup.
INFO:     Application startup complete.
```

**Backend URLs:**
- **API Base:** http://localhost:8000
- **Swagger Docs:** http://localhost:8000/docs
- **ReDoc Docs:** http://localhost:8000/redoc
- **Health Check:** http://localhost:8000/health

**First Run Notes:**
- On first startup, the backend will:
  1. Create all database tables automatically
  2. Create pharma companies from `pharma_admins.json`
  3. Create pharma admin users
  4. Create MyGrape platform admin user
  5. Start quality monitoring background tasks

Check the console output for confirmation messages.

---

### Terminal 2: Start Frontend

```bash
# Navigate to frontend directory
cd FrontEnd

# Start development server
npm run dev

# Alternative: Use yarn if you prefer
# yarn dev
```

**Expected Output:**
```
  VITE v7.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

**Frontend URL:**
- **Application:** http://localhost:5173

The frontend will automatically reload when you make changes to the code.

---

### Terminal 3: Start Publisher

```bash
# Navigate to publisher directory
cd publisher

# Make sure backend dependencies are installed
# The publisher uses backend's database models

# Run the publisher
python -m publisher.publisher

# Alternative: Run directly
python publisher/publisher.py
```

**Expected Output:**
```
============================================================
PUBLISHER STARTUP - Independent Configuration
============================================================
Backend Directory: D:\testing\mygrape\backend
Redis: localhost:6379 (DB: 0)
Database: localhost:5432/mygrape
============================================================
✓ Redis connection established successfully
Starting quality data publisher for multiple patients...
Publishing data for X patient(s): patient_id_1, patient_id_2, ...
Press Ctrl+C to stop
```

**Publisher Notes:**
- The publisher publishes quality data to Redis every 1 second
- It reads patient IDs from the database
- If no patients exist, it will exit with a warning
- Make sure you have at least one patient in the database before running

---

## ✅ Verification & Testing

### Step 1: Verify Backend is Running

```bash
# Check health endpoint
curl http://localhost:8000/health

# Or open in browser:
# http://localhost:8000/health
```

**Expected Response:**
```json
{
  "status": "healthy",
  "platform": "MyGrape",
  "service": "Supply Chain Tracking",
  "environment": "development",
  "database_connected": true
}
```

### Step 2: Verify Frontend is Running

Open http://localhost:5173 in your browser. You should see the MyGrape application.

### Step 3: Verify Publisher is Running

Check the publisher terminal for continuous output showing data being published.

### Step 4: Test API Endpoints

**Using Swagger UI:**
1. Open http://localhost:8000/docs
2. Try the `/health` endpoint
3. Explore other endpoints

**Using curl:**
```bash
# Health check
curl http://localhost:8000/health

# Get API docs
curl http://localhost:8000/openapi.json
```

### Step 5: Verify Database Connection

```bash
# Connect to database
psql -U postgres -d mygrape

# Check tables
\dt

# Check users table
SELECT user_id, email, role FROM "user" LIMIT 5;

# Exit
\q
```

### Step 6: Verify Redis Connection

```bash
# Connect to Redis
redis-cli

# Test connection
PING
# Expected: PONG

# Check published data (if publisher is running)
SUBSCRIBE quality_channel
# You should see messages being published

# Exit (Ctrl+C to stop subscribing)
```

---

## 🧪 Running Tests

### Backend Tests

```bash
# Navigate to backend directory
cd backend

# Activate Poetry environment
poetry shell

# Run all tests
poetry run pytest

# Run tests with coverage
poetry run pytest --cov=app --cov-report=html

# Run specific test file
poetry run pytest tests/app/controller/test_user_controller.py

# Run tests with verbose output
poetry run pytest -v
```

### Frontend Tests

```bash
# Navigate to frontend directory
cd FrontEnd

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm test -- --watch
```

---

## 🐛 Troubleshooting

### Common Issues and Solutions

#### 1. Backend Won't Start

**Error: `ModuleNotFoundError` or Import Errors**

```bash
# Solution: Make sure dependencies are installed
cd backend
poetry install

# Activate virtual environment
poetry shell

# Verify Python path
poetry run python -c "import app; print('OK')"
```

**Error: `Database connection failed`**

```bash
# Solution 1: Check PostgreSQL is running
# Windows: Check Services (services.msc)
# Mac/Linux: sudo systemctl status postgresql

# Solution 2: Verify database credentials in .env
# Check: DB_USER, DB_PASSWORD, DB_HOST, DB_PORT, DB_NAME

# Solution 3: Test database connection manually
psql -U postgres -d mygrape -c "SELECT 1;"
```

**Error: `Port 8000 already in use`**

```bash
# Solution 1: Change port in .env
PORT=8001

# Solution 2: Kill process using port 8000
# Windows:
netstat -ano | findstr :8000
taskkill /PID <PID> /F

# Mac/Linux:
lsof -ti:8000 | xargs kill -9
```

#### 2. Frontend Won't Start

**Error: `Vite requires Node.js version 20.19+ or 22.12+`**

```bash
# Solution: Upgrade Node.js to required version
# Check current version:
node --version

# Install Node.js 20.19+ or 22.12+ from:
# https://nodejs.org/

# After upgrading, reinstall dependencies:
cd FrontEnd
rm -rf node_modules package-lock.json
npm install
```

**Error: `Port 5173 already in use`**

```bash
# Solution: Kill process or change port in vite.config.ts
# Or use different port:
npm run dev -- --port 3000
```

**Error: `Cannot find module`**

```bash
# Solution: Reinstall dependencies
cd FrontEnd
rm -rf node_modules package-lock.json
npm install
```

#### 3. Publisher Won't Start

**Error: `Backend directory not found`**

```bash
# Solution: Set BACKEND_PATH in .publisher.env
# Edit publisher/.publisher.env and add:
BACKEND_PATH=D:\testing\mygrape\backend
# Use absolute path to your backend directory
```

**Error: `No patients found in database`**

```bash
# Solution: Create at least one patient first
# Use the backend API or database directly
# The publisher needs patients to publish data for
```

**Error: `Redis connection failed`**

```bash
# Solution 1: Check Redis is running
redis-cli ping
# Should return: PONG

# Solution 2: Verify Redis configuration in .publisher.env
# Check: REDIS_HOST, REDIS_PORT

# Solution 3: Start Redis
# Windows (Docker):
docker start redis

# Mac/Linux:
sudo systemctl start redis
# or
brew services start redis
```

#### 4. Database Migration Issues

**Error: `Alembic revision failed`**

```bash
# Solution: Make sure all models are imported in migration/env.py
# Check backend/migration/env.py has all model imports

# Then try:
cd backend
poetry run alembic revision --autogenerate -m "description"
```

#### 5. Poetry Issues

**Error: `Poetry command not found`**

```bash
# Solution: Add Poetry to PATH
# Windows: Add %APPDATA%\Python\Scripts to PATH
# Mac/Linux: Add ~/.local/bin to PATH

# Or reinstall Poetry:
curl -sSL https://install.python-poetry.org | python3 -
```

**Error: `Poetry lock file out of date`**

```bash
# Solution: Update lock file
cd backend
poetry lock --no-update
poetry install
```

#### 6. Email Service Issues

**SendGrid Authentication Failed**

```bash
# Check .env file:
SENDGRID_API_KEY=your-sendgrid-api-key
SENDER_EMAIL=your-verified-email@example.com
```

#### 7. CORS Errors in Browser

**Error: `CORS policy blocked`**

```bash
# Solution: Check ALLOWED_ORIGINS in backend/.env
# Make sure frontend URL is included:
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000

# Restart backend after changing .env
```

---

## 🔄 Development Workflow

### Daily Development Routine

1. **Start Services:**
   ```bash
   # Terminal 1: Backend
   cd backend && poetry shell && poetry run uvicorn app.main:app --reload

   # Terminal 2: Frontend
   cd FrontEnd && npm run dev

   # Terminal 3: Publisher (if needed)
   cd publisher && python -m publisher.publisher
   ```

2. **Make Changes:**
   - Backend changes auto-reload (if `--reload` flag is used)
   - Frontend changes auto-reload via Vite HMR

3. **Run Tests:**
   ```bash
   # Backend tests
   cd backend && poetry run pytest

   # Frontend tests
   cd FrontEnd && npm test
   ```

4. **Check Logs:**
   - Backend logs: `backend/logs/app.log`
   - Console output for real-time logs

### Creating Database Migrations

```bash
# Navigate to backend
cd backend

# Create a new migration
poetry run alembic revision --autogenerate -m "Description of changes"

# Review the generated migration file in migration/versions/

# Apply migration
poetry run alembic upgrade head

# Rollback if needed
poetry run alembic downgrade -1
```

### Adding New Dependencies

**Backend (Python):**
```bash
cd backend

# Add a new dependency
poetry add package-name

# Add a dev dependency
poetry add --group dev package-name

# Update lock file
poetry lock
```

**Frontend (Node):**
```bash
cd FrontEnd

# Add a new dependency
npm install package-name

# Add a dev dependency
npm install --save-dev package-name
```

### Code Formatting

**Backend:**
```bash
cd backend
poetry run black .
poetry run isort .
```

**Frontend:**
```bash
cd FrontEnd
npm run lint
```

---

## 📝 Important Notes

### Environment Files

- **NEVER commit `.env` files** - They contain secrets
- **NEVER commit `.publisher.env` files** - They contain database credentials
- Use `.env.example` files as templates
- Add `.env` and `.publisher.env` to `.gitignore`

### Database

- The backend automatically creates tables on first startup
- Use Alembic migrations for production deployments
- Always backup database before migrations

### Redis

- Redis is used for:
  - Caching (performance)
  - Pub/Sub (real-time quality data)
  - Session management
- Publisher publishes to Redis channel `quality_channel`
- Backend subscribes to Redis for quality monitoring

### Security

- Always use strong passwords
- Generate secure `SECRET_KEY` (minimum 32 characters)
- Never expose `.env` files
- Use App Passwords for email (Gmail)
- Restrict CORS origins in production

### Ports

- **Backend:** 8000 (configurable via `.env`)
- **Frontend:** 5173 (Vite default, configurable)
- **PostgreSQL:** 5432 (default)
- **Redis:** 6379 (default)

---

## 📚 Additional Resources

### Documentation

- **Backend API Docs:** http://localhost:8000/docs (when backend is running)
- **FastAPI Docs:** https://fastapi.tiangolo.com/
- **React Docs:** https://react.dev/
- **Vite Docs:** https://vitejs.dev/
- **PostgreSQL Docs:** https://www.postgresql.org/docs/
- **Redis Docs:** https://redis.io/docs/

### Getting Help

1. Check this guide first
2. Check the troubleshooting section
3. Review error messages carefully
4. Check application logs: `backend/logs/app.log`
5. Verify all services are running
6. Verify environment variables are set correctly

---

## ✅ Setup Checklist

Use this checklist to verify your setup:

- [ ] Python 3.12+ installed
- [ ] Poetry installed and in PATH
- [ ] Node.js 20.19+ or 22.12+ installed (Vite 7 requirement)
- [ ] PostgreSQL 15+ installed and running
- [ ] Redis 6.x or 7.x installed and running
- [ ] Database `mygrape` created
- [ ] Backend dependencies installed (`poetry install`)
- [ ] Frontend dependencies installed (`npm install`)
- [ ] Backend `.env` file created and configured
- [ ] Publisher `.publisher.env` file created and configured
- [ ] `pharma_admins.json` created
- [ ] Backend starts successfully
- [ ] Frontend starts successfully
- [ ] Publisher starts successfully (if needed)
- [ ] Health check endpoint works
- [ ] Frontend loads in browser
- [ ] Database connection verified
- [ ] Redis connection verified

---

## 🎉 You're All Set!

If you've completed all the steps above, you should have:

1. ✅ Backend API running on http://localhost:8000
2. ✅ Frontend application running on http://localhost:5173
3. ✅ Publisher service running (if needed)
4. ✅ Database connected and initialized
5. ✅ Redis connected and working

**Next Steps:**
- Explore the API documentation at http://localhost:8000/docs
- Start developing features
- Run tests to verify everything works
- Check the project README files for more information

**Happy Coding! 🚀**

---

## 📞 Support

If you encounter issues not covered in this guide:

1. Check the troubleshooting section
2. Review error messages and logs
3. Verify all versions match requirements
4. Ensure all services are running
5. Check environment variables are correct

**Last Updated:** 2024
**Maintained By:** MyGrape Development Team

