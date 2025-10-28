# MyGrape Patient API

A comprehensive Patient Information System API built with FastAPI, SQLAlchemy, and PostgreSQL.

## Features

- **Patient CRUD Operations**: Create, read, update, and delete patient records
- **Bulk Operations**: Create multiple patients in a single request
- **Advanced Search**: Multi-field filtering with partial text matching
- **Statistics**: Comprehensive pharma-specific analytics with monthly trends
- **Auto-generated IDs**: Custom patient ID format (PTddmmyy-001)
- **Validation**: Comprehensive input validation with field length limits
- **Error Handling**: Detailed error responses with proper HTTP status codes

## API Endpoints

- `POST /patients/` - Create single or multiple patients
- `GET /patients/` - Get all patients
- `GET /patients/{patient_id}` - Get patient by ID
- `PUT /patients/{patient_id}` - Update patient
- `DELETE /patients/{patient_id}` - Delete patient
- `GET /patients/pharma/{pharma_id}` - Get patients by pharma
- `GET /patients/statistics/pharma/{pharma_id}` - Get pharma statistics
- `GET /patients/search/advanced` - Advanced search

## Installation

1. Install Poetry (if not already installed):
```bash
curl -sSL https://install.python-poetry.org | python3 -
```

2. Install dependencies:
```bash
poetry install
```

3. Set up your database configuration in `app/config/database.py`

4. Run the application:
```bash
poetry run uvicorn app.main:app --reload
```

## Development

- **Code formatting**: `poetry run black .`
- **Import sorting**: `poetry run isort .`
- **Type checking**: `poetry run mypy .`
- **Linting**: `poetry run flake8 .`
- **Testing**: `poetry run pytest`

## Documentation

See `PATIENT_API_DOCUMENTATION.md` for detailed API documentation with examples.

## Architecture

The application follows a clean architecture pattern with clear separation of concerns:

- **Models**: SQLAlchemy database models
- **Schemas**: Pydantic request/response validation
- **Repository**: Database operations and queries
- **Service**: Business logic and validation
- **Controller**: API endpoints and HTTP handling
- **Utils**: Helper functions and utilities
