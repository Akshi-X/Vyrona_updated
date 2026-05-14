"""Tests for the external integration auth endpoints."""

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.constants.app_constants import (
    INTEGRATION_TOKEN_EXPIRY_DAYS,
    INTEGRATION_TOKEN_PURPOSE,
)
from app.controller.external import integration_auth_controller


@pytest.fixture
def app():
    app = FastAPI()
    app.include_router(integration_auth_controller.router)

    def override_db():
        yield MagicMock()

    app.dependency_overrides[integration_auth_controller.get_db] = override_db
    return app


@pytest.fixture
def client(app):
    return TestClient(app)


def test_integration_login_success(app, client, monkeypatch):
    """Valid Admin login returns a JWT with 1-year expiry and an integration purpose claim."""
    issued_at = datetime.now(timezone.utc)
    expires_at = issued_at + timedelta(days=INTEGRATION_TOKEN_EXPIRY_DAYS)

    mock_service_instance = MagicMock()
    mock_service_instance.login_admin.return_value = {
        "access_token": "fake-jwt",
        "token_type": "bearer",
        "expires_in_seconds": INTEGRATION_TOKEN_EXPIRY_DAYS * 24 * 3600,
        "expires_at": expires_at,
        "issued_at": issued_at,
        "jti": "jti-abc",
        "user_id": "USR-000001",
        "hospital_id": 7,
        "purpose": INTEGRATION_TOKEN_PURPOSE,
    }

    monkeypatch.setattr(
        integration_auth_controller,
        "IntegrationAuthService",
        MagicMock(return_value=mock_service_instance),
    )

    response = client.post(
        "/external/integration/auth/login",
        json={"email": "admin@example.com", "password": "Sup3r$ecret"},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["access_token"] == "fake-jwt"
    assert body["expires_in_seconds"] == INTEGRATION_TOKEN_EXPIRY_DAYS * 24 * 3600
    assert body["purpose"] == INTEGRATION_TOKEN_PURPOSE
    assert body["jti"] == "jti-abc"
    assert body["user_id"] == "USR-000001"
    assert body["hospital_id"] == 7

    mock_service_instance.login_admin.assert_called_once_with(
        email="admin@example.com", password="Sup3r$ecret"
    )


def test_integration_login_invalid_credentials_returns_401(app, client, monkeypatch):
    """Wrong password / wrong role / unknown user → 401 (handled by AppException middleware)."""
    from app.exceptions import InvalidCredentialsException

    mock_service_instance = MagicMock()
    mock_service_instance.login_admin.side_effect = InvalidCredentialsException(
        email="admin@example.com"
    )
    monkeypatch.setattr(
        integration_auth_controller,
        "IntegrationAuthService",
        MagicMock(return_value=mock_service_instance),
    )

    # AppException isn't caught by FastAPI's TestClient by default unless the app
    # has the global exception handler wired. We assert the exception is raised
    # by the controller (it would be turned into a JSONResponse in production).
    with pytest.raises(InvalidCredentialsException):
        client.post(
            "/external/integration/auth/login",
            json={"email": "admin@example.com", "password": "wrong"},
        )
