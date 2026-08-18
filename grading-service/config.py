"""
Configuration module for the Grading (ML) Service Function.

Loads configuration from environment variables. For local development, set these
in local.settings.json / .env. For production, configure them in Azure Function
App Settings (Key Vault secrets are injected as environment variables).
"""
import logging
from typing import Optional
from urllib.parse import quote_plus
from functools import lru_cache

from pydantic_settings import BaseSettings  # pyright: ignore[reportMissingImports]

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Database Configuration (required)
    DB_USER: str
    DB_PASSWORD: str
    DB_HOST: str
    DB_PORT: str = "5432"
    DB_NAME: str

    # Redis Configuration
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6380
    REDIS_DB: int = 0
    REDIS_USERNAME: Optional[str] = None  # Redis 6+ ACL (Azure uses "default")
    REDIS_PASSWORD: Optional[str] = None
    REDIS_SSL: bool = True
    REDIS_SOCKET_CONNECT_TIMEOUT: int = 5
    REDIS_SOCKET_TIMEOUT: int = 5

    # Azure Blob Storage (segmentation output images)
    AZURE_STORAGE_CONNECTION_STRING: Optional[str] = None
    AZURE_STORAGE_BLOB_CONTAINER: str = "ivf-media"

    # ML model checkpoints (baked into the image under /home/site/wwwroot/models)
    SEG_MODEL_PATH: str = "models/segment_model.pth"
    GRADING_MODEL_PATH: str = "models/grading_model.pth"

    # Embryo detection gate — structural sanity check on the segmentation output.
    # Tunable per deployment; the model was never trained to reject non-embryos.
    DETECT_ENABLED: bool = True
    DETECT_MIN_AREA: float = 0.06
    DETECT_MAX_AREA: float = 0.92
    DETECT_MIN_BLOB_SHARE: float = 0.70
    DETECT_MIN_CIRCULARITY: float = 0.55
    DETECT_MIN_SEG_CONF: float = 0.80

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True
        extra = "ignore"

    @property
    def database_url(self) -> str:
        """Construct database URL from components."""
        password = quote_plus(self.DB_PASSWORD)
        return (
            f"postgresql+psycopg2://{self.DB_USER}:{password}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
        )

    def validate(self) -> bool:
        """Validate that all required configuration values are present."""
        missing: list[str] = []
        if not self.DB_USER:
            missing.append("DB_USER")
        if not self.DB_PASSWORD:
            missing.append("DB_PASSWORD")
        if not self.DB_HOST:
            missing.append("DB_HOST")
        if not self.DB_NAME:
            missing.append("DB_NAME")
        if not self.AZURE_STORAGE_CONNECTION_STRING:
            missing.append("AZURE_STORAGE_CONNECTION_STRING")

        if missing:
            logger.error(f"Missing required configuration: {', '.join(missing)}")
            return False
        return True


@lru_cache()
def get_settings() -> Settings:
    """Cached settings instance."""
    return Settings()


config = get_settings()
