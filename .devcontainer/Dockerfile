FROM mcr.microsoft.com/devcontainers/base:ubuntu-24.04

# Python runtime hygiene
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    # Install Poetry to a system-wide, user-agnostic location
    POETRY_HOME=/opt/poetry \
    PATH="/opt/poetry/bin:/usr/local/bin:$PATH"

# All apt dependencies + Node.js in one layer to minimise image size
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    python3-dev \
    build-essential \
    libpq-dev \
    postgresql-client \
    git \
    curl \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/* \
    # Set python3 as default in the same layer — no extra RUN needed
    && ln -sf /usr/bin/python3 /usr/local/bin/python

# Install Poetry as root into /opt/poetry — no user-switching required
RUN curl -sSL https://install.python-poetry.org | python3 -