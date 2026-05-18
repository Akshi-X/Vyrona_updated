"""
Configuration module for Telemetry Service Function.

This module loads configuration from environment variables.
For local development, set these in .env file.
For production, configure them in Azure Function App Settings.
Azure Key Vault secrets can be referenced in App Settings using:
@Microsoft.KeyVault(SecretUri=https://your-keyvault.vault.azure.net/secrets/secret-name/)
"""
import logging
from typing import Optional
from urllib.parse import quote_plus
from pydantic_settings import BaseSettings  # pyright: ignore[reportMissingImports]
from functools import lru_cache

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    """
    Application settings loaded from environment variables.
    Supports .env files for local development and Azure Key Vault references in production.
    """
    
    # ============================================
    # LOADED FROM .ENV / ENVIRONMENT VARIABLES
    # (Azure Key Vault secrets are injected as environment variables)
    # ============================================
    
    # Event Hub Configuration (required)
    EVENT_HUB_CONNECTION_STRING: str
    EVENT_HUB_NAME: str

    # Database Configuration (required)
    DB_USER: str
    DB_PASSWORD: str
    DB_HOST: str
    DB_PORT: str = "5432"
    DB_NAME: str

    # Redis Configuration (optional - defaults provided)
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6380
    REDIS_DB: int = 0
    REDIS_PASSWORD: Optional[str] = None
    REDIS_SOCKET_CONNECT_TIMEOUT: int = 5
    REDIS_SOCKET_TIMEOUT: int = 5

    # Service Bus Configuration (optional - kept for backward compatibility)
    SERVICE_BUS_CONNECTION_STRING: Optional[str] = None
    SERVICE_BUS_QUEUE_NAME: Optional[str] = None

    # Alert API Configuration (external App Service)
    ALERT_API_BASE_URL: Optional[str] = None
    ALERT_API_ENDPOINT: str = "/api/internal/alerts/send-immediate"
    ALERT_API_TIMEOUT: int = 5
    # Internal API Key for service-to-service authentication with dashboard-service
    INTERNAL_API_KEY: Optional[str] = None
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True
        extra = "ignore"  # Allow extra fields from environment
        
        @classmethod
        def customise_sources(
            cls,
            init_settings,
            env_settings,
            file_secret_settings,
        ):
            # Prioritize environment variables (Key Vault → Azure → env vars),
            # then .env file (local development)
            return (
                init_settings,
                env_settings,
                file_secret_settings,
            )

    @property
    def database_url(self) -> str:
        """Construct database URL from components"""
        password = quote_plus(self.DB_PASSWORD)
        # Extract endpoint ID from host (assumes host is like 'ep-xxxx.region.neon.tech')
        return (
            f"postgresql+psycopg2://{self.DB_USER}:{password}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
        )

    def validate(self) -> bool:
        """
        Validate that all required configuration values are present.

        Returns:
            True if all required config values are set, False otherwise
        """
        missing: list[str] = []

        if not self.EVENT_HUB_CONNECTION_STRING:
            missing.append("EVENT_HUB_CONNECTION_STRING")

        if not self.EVENT_HUB_NAME:
            missing.append("EVENT_HUB_NAME")

        # Database configuration is required
        if not self.DB_USER or self.DB_USER == "":
            missing.append("DB_USER")
        if not self.DB_PASSWORD or self.DB_PASSWORD == "":
            missing.append("DB_PASSWORD")
        if not self.DB_HOST or self.DB_HOST == "":
            missing.append("DB_HOST")
        if not self.DB_NAME or self.DB_NAME == "":
            missing.append("DB_NAME")

        if missing:
            logger.error(f"Missing required configuration: {', '.join(missing)}")
            return False

        return True

    def get_eventhub_connection_string(self) -> str:
        """
        Get the Event Hub connection string.

        Returns:
            Event Hub connection string

        Raises:
            ValueError: If connection string is not configured
        """
        if not self.EVENT_HUB_CONNECTION_STRING:
            raise ValueError("EVENT_HUB_CONNECTION_STRING is not configured")
        return self.EVENT_HUB_CONNECTION_STRING

    def get_eventhub_name(self) -> str:
        """
        Get the Event Hub name.

        Returns:
            Event Hub name

        Raises:
            ValueError: If Event Hub name is not configured
        """
        if not self.EVENT_HUB_NAME:
            raise ValueError("EVENT_HUB_NAME is not configured")
        return self.EVENT_HUB_NAME

    def get_servicebus_connection_string(self) -> str:
        """
        Get the Service Bus connection string.

        Returns:
            Service Bus connection string

        Raises:
            ValueError: If connection string is not configured
        """
        if not self.SERVICE_BUS_CONNECTION_STRING:
            raise ValueError("SERVICE_BUS_CONNECTION_STRING is not configured")
        return self.SERVICE_BUS_CONNECTION_STRING

    def get_servicebus_queue_name(self) -> str:
        """
        Get the Service Bus queue name.

        Returns:
            Service Bus queue name

        Raises:
            ValueError: If queue name is not configured
        """
        if not self.SERVICE_BUS_QUEUE_NAME:
            raise ValueError("SERVICE_BUS_QUEUE_NAME is not configured")
        return self.SERVICE_BUS_QUEUE_NAME


@lru_cache()
def get_settings() -> Settings:
    """Cached settings instance"""
    return Settings()


# Global settings instance
config = get_settings()
