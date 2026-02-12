# ---------- Base image ----------
FROM python:3.12-slim

# ---------- System dependencies ----------
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# ---------- Install Poetry ----------
ENV POETRY_VERSION=2.3.2
RUN curl -sSL https://install.python-poetry.org | python3 -

# Add Poetry to PATH
ENV PATH="/root/.local/bin:$PATH"

# ---------- Disable venv inside container ----------
RUN poetry config virtualenvs.create false

# ---------- Working directory ----------
WORKDIR /app

# ---------- Copy dependency files ----------
COPY pyproject.toml poetry.lock ./

# ---------- Install dependencies ----------
RUN poetry install --only main --no-interaction --no-ansi

# ---------- Copy application code ----------
COPY . .

# ---------- Environment ----------
ENV PYTHONUNBUFFERED=1
ENV PORT=8000

# ---------- Expose port ----------
EXPOSE 8000

# ---------- Start app ----------
CMD ["gunicorn", "app.main:app", \
     "--workers", "2", \
     "--worker-class", "uvicorn.workers.UvicornWorker", \
     "--bind", "0.0.0.0:8000"]

