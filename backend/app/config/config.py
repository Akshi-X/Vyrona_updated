"""
Application Configuration
Loaded from environment variables (.env file)
"""
 
from pydantic_settings import BaseSettings
from typing import List, Optional, Dict, Any
from functools import lru_cache
import json
import os
 
 
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
    # URLs - MUST be provided in .env file
    FRONTEND_URL: str
    BACKEND_URL: str
    # CORS - MUST be provided in .env file
    # Can be comma-separated list: "http://localhost:5173,http://localhost:3000"
    # Or "*" for all origins (not recommended for production)
    ALLOWED_ORIGINS: str
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
   
    def get_pharma_admins(self) -> List[Dict[str, Any]]:
        """
        Load pharma admins from pharma_admins.json file.
        Returns a list of pharma admin dictionaries.
        """
        try:
            # Get the path to pharma_admins.json relative to the backend directory
            current_dir = os.path.dirname(os.path.abspath(__file__))
            # Go up two levels from app/config/config.py to backend directory
            backend_dir = os.path.dirname(os.path.dirname(current_dir))
            pharma_admins_path = os.path.join(backend_dir, "pharma_admins.json")
           
            if not os.path.exists(pharma_admins_path):
                return []
           
            with open(pharma_admins_path, 'r', encoding='utf-8') as f:
                pharma_admins = json.load(f)
                return pharma_admins if isinstance(pharma_admins, list) else []
               
        except Exception as e:
            # Log the error but don't raise it to avoid breaking the app
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Error loading pharma admins: {str(e)}")
            return []
   
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
 