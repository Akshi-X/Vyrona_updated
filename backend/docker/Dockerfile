FROM python:3.12-slim

# Set working directory
WORKDIR /app

# Install system dependencies (including postgresql-client for pg_isready)
RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY pyproject.toml poetry.lock ./

# Install Poetry
RUN pip install poetry

# Configure Poetry
RUN poetry config virtualenvs.create false

# Install dependencies
RUN poetry install --no-dev

# Copy application code
COPY app/ ./app/
COPY static/ ./static/
COPY scripts/ ./scripts/
COPY migration/ ./migration/
COPY alembic.ini ./

# Copy entrypoint script
COPY docker/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

# Expose port
EXPOSE 8000

# Use entrypoint script for initialization and startup
ENTRYPOINT ["./entrypoint.sh"]
