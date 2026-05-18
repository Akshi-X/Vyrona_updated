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


# Expose port
EXPOSE 8000

# Command to run the application
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]