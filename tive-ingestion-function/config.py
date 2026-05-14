"""
Configuration module for Tive Ingestion Function. 

This module loads configuration from environment variables.
For local development, set these in .env file.
For production, configure them in Azure Function App Settings.
Azure Key Vault secrets can be referenced in App Settings using:
@Microsoft.KeyVault(SecretUri=https://your-keyvault.vault.azure.net/secrets/secret-name/)
"""
import logging
from typing import Optional
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
    
    # Tive Webhook Authentication
    # API Key for manual testing (required)
    TIVE_WEBHOOK_KEY: str
    
    # Tive Webhook Secret for signature verification (optional, for production)
    # This is the secret key from Tive webhook configuration
    TIVE_WEBHOOK_SECRET: Optional[str] = None

    # Event Hub Configuration (required)
    EVENTHUB_CONNECTION: str
    EVENTHUB_NAME: str
    
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

    def validate(self) -> bool:
        """
        Validate that all required configuration values are present.

        Returns:
            True if all required config values are set, False otherwise
        """
        missing: list[str] = []

        if not self.TIVE_WEBHOOK_KEY:
            missing.append("TIVE_WEBHOOK_KEY")

        if not self.EVENTHUB_CONNECTION:
            missing.append("EVENTHUB_CONNECTION")

        if not self.EVENTHUB_NAME:
            missing.append("EVENTHUB_NAME")

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
        if not self.EVENTHUB_CONNECTION:
            raise ValueError("EVENTHUB_CONNECTION is not configured")
        return self.EVENTHUB_CONNECTION

    def get_eventhub_name(self) -> str:
        """
        Get the Event Hub name.

        Returns:
            Event Hub name

        Raises:
            ValueError: If Event Hub name is not configured
        """
        if not self.EVENTHUB_NAME:
            raise ValueError("EVENTHUB_NAME is not configured")
        return self.EVENTHUB_NAME

    def get_webhook_key(self) -> str:
        """
        Get the Tive webhook authentication key (for manual testing).

        Returns:
            Webhook authentication key

        Raises:
            ValueError: If webhook key is not configured
        """
        if not self.TIVE_WEBHOOK_KEY:
            raise ValueError("TIVE_WEBHOOK_KEY is not configured")
        return self.TIVE_WEBHOOK_KEY

    def get_webhook_secret(self) -> str:
        """
        Get the Tive webhook secret key for signature verification.

        Returns:
            Webhook secret key (empty string if not configured)
        """
        return self.TIVE_WEBHOOK_SECRET or ""


@lru_cache()
def get_settings() -> Settings:
    """Cached settings instance"""
    return Settings()


# Global settings instance
config = get_settings()
