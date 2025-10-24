"""
Application Configuration
Loaded from environment variables (.env file)
"""
 
from pydantic_settings import BaseSettings
from typing import List, Optional
from functools import lru_cache
 
 
class Settings(BaseSettings):
    """
    Application settings loaded from environment variables.
    """
    # ============================================
    # LOADED FROM .ENV (Secrets & Env-specific)
    # ============================================
    # Database - MUST be provided in .env file
    DB_USER: str
    DB_PASSWORD: str
    DB_HOST: str
    DB_PORT: str = "5432"
    DB_NAME: str
    # Security - MUST be provided in .env file
    SECRET_KEY: str
    # Email - Basic Configuration
    SENDER_EMAIL: str
    ADMIN_EMAIL: str
    # Super Admin Setup (required in .env)
    ADMIN_DEFAULT_PASSWORD: str
    # MyGrape Platform Admin (required in .env)
    MYGRAPE_ADMIN_EMAIL: str
    MYGRAPE_ADMIN_PASSWORD: str
    # Email Service Type
    EMAIL_SERVICE: str = "smtp"  # "smtp" or "sendgrid"
    # SMTP (Optional - for backward compatibility)
    SENDER_PASSWORD: Optional[str] = None
    SMTP_SERVER: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    # SendGrid (Optional - for enhanced email delivery)
    SENDGRID_API_KEY: Optional[str] = None
    SENDGRID_FROM_EMAIL: Optional[str] = None
    # Environment
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    RELOAD: bool = True
    # URLs
    FRONTEND_URL: str = "http://localhost:5173"
    BACKEND_URL: str = "http://localhost:8000"
    # CORS
    ALLOWED_ORIGINS: str = "*"
    # ============================================
    # COMPUTED/DERIVED VALUES
    # ============================================
    @property
    def database_url(self) -> str:
        """Construct database URL from components"""
        from urllib.parse import quote_plus
        password = quote_plus(self.DB_PASSWORD)
        return f"postgresql+psycopg2://{self.DB_USER}:{password}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
    @property
    def cors_origins(self) -> List[str]:
        """Parse CORS origins string to list"""
        if self.ALLOWED_ORIGINS == "*":
            return ["*"]
        return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",")]
    @property
    def is_development(self) -> bool:
        return self.ENVIRONMENT == "development"
    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True
        extra = "ignore"  # Allow extra fields from environment
 
 
@lru_cache()
def get_settings() -> Settings:
    """Cached settings instance"""
    return Settings()
 
 
# Global settings instance
settings = get_settings()