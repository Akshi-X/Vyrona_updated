# MyGrape Backend API

A comprehensive FastAPI-based backend for the MyGrape Supply Chain Tracking Platform. This RESTful API provides secure, scalable endpoints for patient management, shipment tracking, user authentication, feedback systems, and real-time collaboration.

## 🚀 Features

### Core Modules

- **User Management & Authentication**
  - User registration with email verification (OTP)
  - JWT-based authentication
  - Role-based access control (RBAC)
  - Password reset functionality
  - User approval workflow
  - Profile management

- **Patient Management**
  - Complete CRUD operations
  - Bulk patient creation
  - Advanced search and filtering
  - Patient journey tracking
  - Stage management
  - Statistics and analytics

- **Shipment Tracking**
  - Multi-leg shipment tracking
  - 3PL player management
  - Active routes monitoring
  - Transport time comparison
  - Control tower map visualization
  - Document checklist management
  - Carrier and region management

- **Task Management**
  - Task creation and assignment
  - Task status tracking
  - Priority management
  - Task filtering and search

- **Feedback System**
  - Ticket-based feedback system
  - File attachments support
  - Comments and discussions
  - Status tracking (open, in_progress, resolved, closed)
  - Priority levels
  - Module-based categorization

- **Chat System**
  - Real-time messaging
  - Patient-specific conversations
  - Unread message tracking
  - Message history

- **Dashboard & Analytics**
  - Performance metrics
  - Risk assessment
  - Compliance tracking
  - Logistics analytics
  - Critical alerts

- **Lane Risk Assessment**
  - Route risk analysis
  - Multi-factor risk scoring
  - Risk level categorization

- **Caching & Performance**
  - Redis-based caching for improved performance
  - Session management
  - Rate limiting support
  - Data caching for frequently accessed information

## 📋 Prerequisites

### Required Software

- **Python 3.12+** - [Download Python](https://www.python.org/downloads/)
- **Poetry** - Python dependency and package manager
  ```bash
  # Windows (PowerShell)
  (Invoke-WebRequest -Uri https://install.python-poetry.org -UseBasicParsing).Content | python -

  # macOS/Linux
  curl -sSL https://install.python-poetry.org | python3 -
  ```
- **PostgreSQL 15+** - [Download PostgreSQL](https://www.postgresql.org/download/)
  - Or use Docker: `docker run --name postgres -e POSTGRES_PASSWORD=yourpassword -p 5432:5432 -d postgres:15`
- **Redis 7+** - [Download Redis](https://redis.io/download/)
  - Or use Docker: `docker run --name redis -p 6379:6379 -d redis:7-alpine`
  - Used for caching, session management, and rate limiting
- **Git** - [Download Git](https://git-scm.com/downloads)

### Optional

- **Docker & Docker Compose** - For containerized deployment
- **Alembic** - For database migrations (included in dependencies)

## 🛠️ Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd mygrape/backend
```

### 2. Install Dependencies

```bash
poetry install
```

This will install all required packages including:
- FastAPI
- SQLAlchemy
- PostgreSQL drivers (psycopg2)
- Redis client (redis) - for caching and session management
- JWT authentication (python-jose)
- Password hashing (passlib, bcrypt)
- Email services (sendgrid, jinja2)
- And more...

### 3. Environment Configuration

Create a `.env` file in the `backend` directory:

```env
# ============================================
# Database Configuration
# ============================================
DB_USER=postgres
DB_PASSWORD=your_secure_password
DB_HOST=localhost
DB_PORT=5432
DB_NAME=mygrape

# ============================================
# Redis Configuration
# ============================================
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=  # Optional: Leave empty if no password
REDIS_DB=0  # Default database number (0-15)
REDIS_SSL=False  # Set to True for SSL connections
REDIS_DECODE_RESPONSES=True  # Automatically decode responses to strings

# ============================================
# Security Configuration
# ============================================
SECRET_KEY=your-secret-key-minimum-32-characters-long-for-jwt-tokens

# ============================================
# Email Configuration
# ============================================
ADMIN_EMAIL=admin@example.com
SENDGRID_API_KEY=your-sendgrid-api-key
SENDGRID_FROM_EMAIL=your-email@example.com

# ============================================
# External API Configuration
# ============================================
# FlightRadar24 API (for on-time flight performance)
# API Documentation: https://fr24api.flightradar24.com/docs/endpoints/overview
# Format: "uuid|token" (e.g., "019afc9b-9c8d-720c-8437-379631bea03f|d717VTkYrYoqoZFCh2GoqLvJp6pmeMz3FBfVPDMr20e9a583")
FLIGHTRADAR24_API_KEY=your-flightradar24-api-key

# Weather API (for weather adversities calculation)
WEATHER_API_KEY=your-weatherapi-key
WEATHER_API_PROVIDER=weatherapi  # Options: "weatherapi"

# ============================================
# Admin Account Configuration
# ============================================
ADMIN_DEFAULT_PASSWORD=secure-admin-password
MYGRAPE_ADMIN_EMAIL=admin@mygrape.com
MYGRAPE_ADMIN_PASSWORD=secure-mygrape-admin-password

# ============================================
# Application URLs
# ============================================
FRONTEND_URL=http://localhost:5173
BACKEND_URL=http://localhost:8000

# ============================================
# CORS Configuration
# ============================================
# Comma-separated list of allowed origins
# Example: "http://localhost:5173,http://localhost:3000"
# Use "*" for all origins (NOT recommended for production)
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000

# ============================================
# Environment Settings
# ============================================
ENVIRONMENT=development  # Options: "development" or "production"
DEBUG=True
HOST=0.0.0.0
PORT=8000
RELOAD=True
```

### 4. Pharma Admins Configuration

Copy the example file and configure pharma admins:

```bash
cp pharma_admins.json.example pharma_admins.json
```

Edit `pharma_admins.json` with your pharma admin details:

```json
[
  {
    "email": "admin1@pharma1.com",
    "password": "SecurePassword123!",
    "company": "Pharma Company 1",
    "first_name": "John",
    "last_name": "Admin",
    "location": "New York, USA"
  }
]
```

### 5. Database Setup

#### Create PostgreSQL Database

```bash
# Connect to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE mygrape;

# Exit psql
\q
```

#### Initialize Database

The application automatically creates all tables on first startup. Alternatively, you can use Alembic for migrations:

```bash
# Navigate to migration directory
cd migration

# Run migrations (if configured)
alembic upgrade head
```

### 6. Redis Setup

#### Install Redis

**Windows:**
- Download from [Redis for Windows](https://github.com/microsoftarchive/redis/releases) or use WSL
- Or use Docker: `docker run --name redis -p 6379:6379 -d redis:7-alpine`

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

#### Verify Redis Installation

```bash
# Test Redis connection
redis-cli ping
# Should return: PONG
```

#### Redis Configuration (Optional)

For production, configure Redis with a password in `redis.conf`:
```conf
requirepass your_redis_password
```

Then update your `.env` file:
```env
REDIS_PASSWORD=your_redis_password
```

### 7. Run the Application

#### Development Mode

```bash
poetry run uvicorn app.main:app --reload
```

#### Production Mode

```bash
poetry run uvicorn app.main:app --host 0.0.0.0 --port 8000
```

The API will be available at:
- **API Base URL**: `http://127.0.0.1:8000` (or `http://localhost:8000`)
- **Interactive Docs (Swagger)**: `http://127.0.0.1:8000/docs`
- **Alternative Docs (ReDoc)**: `http://127.0.0.1:8000/redoc`
- **Health Check**: `http://127.0.0.1:8000/health`

## 🐳 Docker Deployment

### Using Docker Compose

Navigate to the docker directory:

```bash
cd docker
```

Update `docker-compose.yml` with your configuration, then:

```bash
# Build and start services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

This will start:
- PostgreSQL database on port 5432
- Redis cache on port 6379
- Backend API on port 8000

### Docker Compose with Redis

To include Redis in your `docker-compose.yml`, add:

```yaml
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes

  # ... other services

volumes:
  redis_data:
```

## 📁 Project Structure

```
backend/
├── app/
│   ├── auth/                    # Authentication utilities
│   │   └── auth.py              # JWT token generation/validation
│   │
│   ├── config/                  # Configuration files
│   │   ├── config.py            # Application settings (from .env)
│   │   ├── database.py          # Database connection & session
│   │   └── permissions.py       # RBAC permissions
│   │
│   ├── constants/               # Application constants
│   │   ├── app_constants.py     # App-wide constants
│   │   ├── enums.py             # Enum definitions
│   │   ├── error_codes.py       # Error code constants
│   │   ├── http_status.py       # HTTP status codes
│   │   ├── messages.py          # Error/success messages
│   │   ├── roles.py             # User role definitions
│   │   └── status_constants.py  # Status constants
│   │
│   ├── controller/              # API route handlers
│   │   ├── user_controller.py   # User/auth endpoints
│   │   ├── patient_controller.py # Patient CRUD endpoints
│   │   ├── shipment_controller.py # Shipment tracking endpoints
│   │   ├── feedback_controller.py # Feedback system endpoints
│   │   ├── task_controller.py   # Task management endpoints
│   │   ├── chat_controller.py   # Chat/messaging endpoints
│   │   ├── dashboard_controller.py # Dashboard analytics endpoints
│   │   └── lane_risk_controller.py # Risk assessment endpoints
│   │
│   ├── dependencies/            # FastAPI dependencies
│   │   ├── auth_dependencies.py # Authentication dependencies
│   │   └── rbac_dependencies.py # RBAC dependencies
│   │
│   ├── exceptions/              # Custom exceptions
│   │   ├── custom_exceptions.py # General exceptions
│   │   └── patient_exceptions.py # Patient-specific exceptions
│   │
│   ├── middleware/              # Request middleware
│   │   ├── authentication_middleware.py
│   │   ├── exception_handler.py
│   │   ├── patient_validation_middleware.py
│   │   ├── rbac_middleware.py
│   │   ├── request_validation_middleware.py
│   │   ├── sanitization_middleware.py
│   │   └── token_validation_middleware.py
│   │
│   ├── models/                  # SQLAlchemy database models
│   │   ├── user_model.py
│   │   ├── patient_model.py
│   │   ├── shipment_model.py
│   │   ├── feedback_model.py
│   │   ├── task_model.py
│   │   ├── chat_model.py
│   │   └── ... (other models)
│   │
│   ├── schemas/                 # Pydantic request/response schemas
│   │   ├── auth_schema.py
│   │   ├── patient_schema.py
│   │   ├── user_schema.py
│   │   ├── feedback_schema.py
│   │   ├── task_schema.py
│   │   └── ... (other schemas)
│   │
│   ├── service/                 # Business logic layer
│   │   ├── user_service.py
│   │   ├── patient_service.py
│   │   ├── shipment_service.py
│   │   ├── feedback_service.py
│   │   ├── task_service.py
│   │   ├── chat_service.py
│   │   ├── email_service.py
│   │   ├── login_service.py
│   │   └── ... (other services)
│   │
│   ├── templates/               # Email templates
│   │   └── emails/
│   │       ├── otp_email.html
│   │       ├── password_reset_email.html
│   │       └── ... (other templates)
│   │
│   ├── utils/                   # Utility functions
│   │   ├── utils.py
│   │   └── patient_utils.py
│   │
│   ├── init_db.py               # Database initialization
│   └── main.py                  # FastAPI application entry point
│
├── docker/                      # Docker configuration
│   ├── Dockerfile
│   └── docker-compose.yml
│
├── migration/                   # Database migrations (Alembic)
│   ├── alembic.py
│   └── versions/
│
├── logs/                        # Application logs
│   └── app.log
│
├── static/                      # Static files
│   └── approvescreen.html
│
├── uploads/                     # File uploads
│   └── feedback/
│
├── pyproject.toml               # Poetry dependencies
├── poetry.lock                  # Locked dependency versions
├── pharma_admins.json           # Pharma admin configuration
├── pharma_admins.json.example   # Example pharma admins file
└── README.md                    # This file
```

## 🏗️ Architecture

The application follows a **clean architecture pattern** with clear separation of concerns:

### Layer Structure

1. **Controller Layer** (`app/controller/`)
   - Handles HTTP requests and responses
   - Validates input via Pydantic schemas
   - Delegates business logic to service layer
   - Returns standardized responses

2. **Service Layer** (`app/service/`)
   - Contains business logic
   - Orchestrates multiple operations
   - Handles validation and error handling
   - Interacts with repository/database layer

3. **Model Layer** (`app/models/`)
   - SQLAlchemy ORM models
   - Database table definitions
   - Relationships and constraints

4. **Schema Layer** (`app/schemas/`)
   - Pydantic models for request/response validation
   - Data serialization/deserialization
   - API contract definition

5. **Middleware Layer** (`app/middleware/`)
   - Request preprocessing
   - Authentication/authorization
   - Input sanitization
   - Exception handling
   - Logging

### Request Flow

```
HTTP Request
    ↓
CORS Middleware
    ↓
Exception Handler Middleware
    ↓
Sanitization Middleware
    ↓
Validation Middleware
    ↓
Token Validation Middleware
    ↓
RBAC Middleware
    ↓
Controller
    ↓
Service Layer
    ↓
Database (via SQLAlchemy)
    ↓
Response
```

## 🔌 API Endpoints

### Base URL

All API endpoints are prefixed with `/api` (configurable via `API_PREFIX`)

### Authentication Endpoints

- `POST /api/register` - User registration
- `POST /api/login` - User login
- `POST /api/verify-otp` - Verify OTP for email confirmation
- `POST /api/resend-otp` - Resend OTP
- `POST /api/logout` - User logout
- `POST /api/forgot-password` - Request password reset
- `POST /api/reset-password` - Reset password with token

### User Management Endpoints

- `GET /api/users` - Get all users (admin only)
- `GET /api/user/{user_id}` - Get user details
- `GET /api/profile` - Get current user profile
- `PATCH /api/user/{user_id}` - Update user
- `POST /api/user/approve` - Approve user (admin)
- `POST /api/user/reject` - Reject user (admin)
- `GET /api/approval-screen` - Get pending approvals

### Patient Management Endpoints

- `POST /api/patients/` - Create single or multiple patients
- `GET /api/patients/` - Get all patients (filtered by pharma)
- `GET /api/patients/ongoing` - Get ongoing patients
- `GET /api/patients/detailed` - Get detailed patient list
- `GET /api/patients/statistics` - Get pharma statistics
- `GET /api/patients/{patient_id}` - Get patient by ID
- `PUT /api/patients/{patient_id}` - Update patient
- `DELETE /api/patients/{patient_id}` - Delete patient
- `GET /api/patients/{patient_id}/stage` - Get patient stage
- `GET /api/patients/provider/{provider_id}` - Get patients by provider

### Shipment Tracking Endpoints

- `GET /api/shipment/3pl-players/{patient_id}` - Get 3PL player details
- `GET /api/shipment/active-routes` - Get active shipment routes
- `GET /api/shipment/transport-time-comparison/{patient_id}` - Transport time comparison
- `GET /api/shipment/patient/{patient_id}/summary` - Patient journey summary
- `GET /api/shipment/control-tower-map` - Control tower map data
- `GET /api/shipment/carriers` - Get all carriers
- `GET /api/shipment/regions` - Get all regions
- `GET /api/shipment/document-checklist/{patient_id}` - Get document checklist

### Task Management Endpoints

- `POST /api/tasks` - Create task
- `GET /api/tasks` - Get all tasks (for current user)
- `GET /api/tasks/{task_id}` - Get task by ID
- `PUT /api/tasks/{task_id}` - Update task
- `PATCH /api/tasks/{task_id}/status` - Update task status
- `DELETE /api/tasks/{task_id}` - Delete task

### Feedback System Endpoints

- `POST /api/create` - Create feedback ticket
- `GET /api/admin` - Get all feedback tickets (admin)
- `GET /api/user/{user_id}` - Get user's feedback tickets
- `GET /api/{feedback_id}` - Get feedback details
- `POST /api/{feedback_id}/comments` - Add comment to feedback
- `GET /api/{feedback_id}/comments` - Get feedback comments
- `PATCH /api/{feedback_id}/status` - Update feedback status

### Chat Endpoints

- `POST /api/messages` - Send message
- `GET /api/patients/{patient_id}/messages` - Get patient messages
- `GET /api/unread` - Get unread messages count
- `GET /api/health` - Chat service health check

### Dashboard Endpoints

- `GET /api/performance` - Performance metrics
- `GET /api/risk` - Risk assessment data
- `GET /api/compliance` - Compliance metrics
- `GET /api/logistics` - Logistics analytics
- `GET /api/alerts` - Critical alerts

### Lane Risk Assessment Endpoints

- `GET /api/lane-risk-assessment` - Get lane risk assessment

### Utility Endpoints

- `GET /health` - Health check endpoint

## 🔐 Authentication & Authorization

### JWT Authentication

The API uses JWT (JSON Web Tokens) for authentication:

1. **Login**: User logs in with email and password
2. **OTP Verification**: Email verification via OTP (if required)
3. **Token Generation**: JWT token is generated upon successful authentication
4. **Token Usage**: Include token in Authorization header for protected endpoints

```http
Authorization: Bearer <your-jwt-token>
```

### Role-Based Access Control (RBAC)

The application supports multiple user roles:

- **mygrape_admin**: Platform administrators with full access
- **pharma_admin**: Pharmaceutical company administrators
- **provider**: Healthcare providers
- **carrier**: Shipping carriers
- **manager**: Task managers

Permissions are enforced via middleware and dependency injection.

## 🗄️ Database

### Database Models

Key database models include:

- **User**: User accounts and authentication
- **Patient**: Patient records and information
- **Shipment**: Shipment tracking data
- **ShipmentLeg**: Individual shipment legs
- **ShipmentLegDocument**: Shipment documents
- **Feedback**: Feedback tickets
- **FeedbackAttachment**: Feedback file attachments
- **Comment**: Feedback comments
- **Tasks**: Task management
- **ChatMessage**: Chat messages
- **ChatReadStatus**: Message read status
- **Pharma**: Pharmaceutical companies
- **Provider**: Healthcare providers
- **Carrier**: Shipping carriers
- **PatientStage**: Patient stage tracking
- **OTP**: One-time passwords for verification

### Database Migrations

The application uses Alembic for database migrations:

```bash
# Create a new migration
alembic revision --autogenerate -m "Description"

# Apply migrations
alembic upgrade head

# Rollback migration
alembic downgrade -1
```

## 📧 Email Configuration

### SendGrid Configuration

```env
SENDGRID_API_KEY=your-sendgrid-api-key
SENDGRID_FROM_EMAIL=your-verified-email@example.com
```

## 🧪 Development

### Code Formatting

```bash
poetry run black .
```

### Import Sorting

```bash
poetry run isort .
```

### Type Checking

```bash
poetry run mypy .
```

### Linting

```bash
poetry run flake8 .
```

### Running Tests

```bash
poetry run pytest
```

### Running with Hot Reload

```bash
poetry run uvicorn app.main:app --reload
```

## 📚 API Documentation

### Interactive Documentation

Once the server is running, access the interactive API documentation:

- **Swagger UI**: `http://127.0.0.1:8000/docs`
- **ReDoc**: `http://127.0.0.1:8000/redoc`

> **Note**: You can also use `localhost` instead of `127.0.0.1` - both refer to the local machine.

### Additional Documentation

- **Patient API**: See `PATIENT_API_DOCUMENTATION.md` for detailed patient API documentation

## 🚨 Troubleshooting

### Common Issues

#### Port Already in Use

```bash
# Change PORT in .env file
PORT=8001

# Or kill the process using port 8000
# Windows
netstat -ano | findstr :8000
taskkill /PID <PID> /F

# Linux/Mac
lsof -ti:8000 | xargs kill -9
```

#### Database Connection Error

1. Verify PostgreSQL is running:
   ```bash
   # Windows
   services.msc  # Check PostgreSQL service

   # Linux/Mac
   sudo systemctl status postgresql
   ```

2. Check database credentials in `.env`
3. Ensure database `mygrape` exists
4. Verify network connectivity to database host

#### Poetry Installation Issues

1. Ensure Python 3.12+ is installed:
   ```bash
   python --version
   ```

2. Add Poetry to PATH (Linux/Mac):
   ```bash
   export PATH="$HOME/.local/bin:$PATH"
   ```

3. Reinstall Poetry if needed

#### Import Errors

```bash
# Reinstall dependencies
poetry install

# Activate virtual environment
poetry shell
```

#### Email Service Not Working

1. Verify SendGrid API key and sender email verification
2. Check email service logs in `logs/app.log`

#### Redis Connection Error

1. Verify Redis is running:
   ```bash
   # Windows
   # Check if Redis service is running or Docker container is up
   docker ps | findstr redis

   # Linux/Mac
   sudo systemctl status redis
   # Or check Docker
   docker ps | grep redis
   ```

2. Test Redis connection:
   ```bash
   redis-cli ping
   # Should return: PONG
   ```

3. Check Redis configuration in `.env`:
   - Verify `REDIS_HOST` and `REDIS_PORT`
   - If using password, ensure `REDIS_PASSWORD` is set correctly

4. Check Redis logs:
   ```bash
   # Docker
   docker logs redis

   # Linux/Mac (system service)
   sudo journalctl -u redis -f
   ```

5. Firewall issues:
   - Ensure port 6379 is not blocked
   - Check if Redis is bound to `127.0.0.1` or `0.0.0.0`

## 📝 Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DB_USER` | Yes | - | PostgreSQL username |
| `DB_PASSWORD` | Yes | - | PostgreSQL password |
| `DB_HOST` | Yes | - | Database host |
| `DB_PORT` | No | `5432` | Database port |
| `DB_NAME` | Yes | - | Database name |
| `REDIS_HOST` | No | `localhost` | Redis server host |
| `REDIS_PORT` | No | `6379` | Redis server port |
| `REDIS_PASSWORD` | No | - | Redis password (optional) |
| `REDIS_DB` | No | `0` | Redis database number (0-15) |
| `REDIS_SSL` | No | `False` | Enable SSL for Redis connection |
| `REDIS_DECODE_RESPONSES` | No | `True` | Automatically decode Redis responses |
| `SECRET_KEY` | Yes | - | JWT secret key (min 32 chars) |
| `ADMIN_EMAIL` | Yes | - | Admin email address |
| `SENDGRID_API_KEY` | Yes | - | SendGrid API key |
| `SENDGRID_FROM_EMAIL` | Yes | - | SendGrid sender email |
| `ADMIN_DEFAULT_PASSWORD` | Yes | - | Default admin password |
| `MYGRAPE_ADMIN_EMAIL` | Yes | - | MyGrape admin email |
| `MYGRAPE_ADMIN_PASSWORD` | Yes | - | MyGrape admin password |
| `FRONTEND_URL` | Yes | - | Frontend application URL |
| `BACKEND_URL` | Yes | - | Backend API URL |
| `ALLOWED_ORIGINS` | Yes | - | CORS allowed origins (comma-separated) |
| `ENVIRONMENT` | No | `development` | Environment (`development` or `production`) |
| `DEBUG` | No | `True` | Debug mode |
| `HOST` | No | `0.0.0.0` | Server host |
| `PORT` | No | `8000` | Server port |
| `RELOAD` | No | `True` | Auto-reload on code changes |
| `FLIGHTRADAR24_API_KEY` | No | - | FlightRadar24 API key for flight performance data |
| `WEATHER_API_KEY` | No | - | WeatherAPI.com API key for weather data |
| `WEATHER_API_PROVIDER` | No | `weatherapi` | Weather API provider |

## 🔒 Security Best Practices

1. **Never commit `.env` file** - Add to `.gitignore`
2. **Use strong SECRET_KEY** - Minimum 32 characters, random string
3. **Restrict CORS** - Don't use `*` in production
4. **Use HTTPS** - In production, always use HTTPS
5. **Regular Updates** - Keep dependencies updated
6. **Database Security** - Use strong database passwords
7. **Environment Variables** - Never hardcode secrets

## 📦 Dependencies

Key dependencies (see `pyproject.toml` for complete list):

- **FastAPI** - Modern web framework
- **SQLAlchemy** - ORM for database operations
- **psycopg2** - PostgreSQL adapter
- **redis** - Redis client for caching and session management
- **Pydantic** - Data validation
- **python-jose** - JWT token handling
- **passlib** - Password hashing
- **bcrypt** - Password encryption
- **uvicorn** - ASGI server
- **sendgrid** - Email service
- **jinja2** - Template engine
- **python-multipart** - File upload support

## 🤝 Contributing

1. Create a feature branch
2. Make your changes
3. Run tests and linting
4. Update documentation if needed
5. Submit a pull request

## 📄 License

[Add your license information here]

## 👥 Authors

- Surya Senthilkumar - surya.senthilkumar@zucisystems.com
- Jothika Rajendran - jothika.rajendran@zucisystems.com

## 🔗 Additional Resources

- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [SQLAlchemy Documentation](https://docs.sqlalchemy.org/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Redis Documentation](https://redis.io/docs/)
- [Poetry Documentation](https://python-poetry.org/docs/)
- [JWT.io](https://jwt.io/) - JWT token debugging

---

For more information or support, please contact the development team.
