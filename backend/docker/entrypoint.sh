#!/bin/bash
set -e

echo "========================================"
echo "Backend Startup Script"
echo "========================================"

# Configuration
DB_HOST="${DB_HOST:-postgres}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-mygrape}"
DB_USER="${DB_USER:-postgres}"
MAX_RETRIES=30
RETRY_COUNT=0

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL at $DB_HOST:$DB_PORT..."
until pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" > /dev/null 2>&1; do
  RETRY_COUNT=$((RETRY_COUNT + 1))
  if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
    echo "ERROR: Could not connect to PostgreSQL after $MAX_RETRIES attempts"
    exit 1
  fi
  echo "PostgreSQL is unavailable - sleep 2s and retry (attempt $RETRY_COUNT/$MAX_RETRIES)"
  sleep 2
done

echo "✓ PostgreSQL is ready!"
echo ""

# Run Alembic migrations
echo "Running database migrations..."
if alembic upgrade head; then
  echo "✓ Database migrations completed successfully"
else
  echo "WARNING: Database migrations failed or had no changes"
fi
echo ""

# Run the auto seed script
echo "Running automatic demo data seed..."
if python scripts/auto_seed_demo_data.py; then
  echo "✓ Database seeding completed successfully"
else
  echo "WARNING: Database seeding had issues but continuing startup"
fi
echo ""

echo "========================================"
echo "Starting FastAPI application"
echo "========================================"
echo ""

# Start the FastAPI application
exec python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
