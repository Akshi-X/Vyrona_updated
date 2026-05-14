import os

_DEFAULT_ENV = {
    "DB_USER": "pytest",
    "DB_PASSWORD": "pytest",
    "DB_HOST": "localhost",
    "DB_NAME": "pytest",
    "SECRET_KEY": "test-secret",
    "ADMIN_EMAIL": "admin@example.com",
    "ADMIN_DEFAULT_PASSWORD": "changeme",
    "MYGRAPE_ADMIN_EMAIL": "mygrape@example.com",
    "MYGRAPE_ADMIN_PASSWORD": "changeme",
    "FRONTEND_URL": "http://localhost:3000",
    "BACKEND_URL": "http://localhost:8000",
    "ALLOWED_ORIGINS": "http://localhost:3000",
}

for key, value in _DEFAULT_ENV.items():
    os.environ.setdefault(key, value)

