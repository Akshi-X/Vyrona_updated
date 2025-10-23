"""
Application Configuration
Loaded from environment variables (.env file)
"""

import logging
from pydantic_settings import BaseSettings
from typing import List, Optional
from functools import lru_cache

# Configure logger
logger = logging.getLogger(__name__)
 
 
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
    # Pharma Admin Configuration (JSON file path)
    PHARMA_ADMINS_FILE: str = "pharma_admins.json"  # Path to JSON file containing pharma admins
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
    
    def get_pharma_admins(self) -> List[dict]:
        """Get all configured pharma admins from JSON file"""
        import json
        from pathlib import Path
        
        try:
            # Get the path to the JSON file
            json_file_path = Path(self.PHARMA_ADMINS_FILE)
            
            # If it's a relative path, make it relative to the backend directory
            if not json_file_path.is_absolute():
                # Get the backend directory (parent of app directory)
                backend_dir = Path(__file__).parent.parent.parent
                json_file_path = backend_dir / self.PHARMA_ADMINS_FILE
                logger.info(f"Looking for pharma admins file at: {json_file_path}")
            
            # Check if file exists
            if not json_file_path.exists():
                logger.warning(f"Pharma admins file not found: {json_file_path}")
                return []
            
            # Read and parse JSON file
            with open(json_file_path, 'r', encoding='utf-8') as f:
                pharma_admins = json.load(f)
            
            # Validate and format the data
            formatted_admins = []
            for admin in pharma_admins:
                if all(key in admin for key in ['email', 'password', 'company']):
                    formatted_admins.append({
                        'email': admin['email'],
                        'password': admin['password'],
                        'company': admin['company'],
                        'first_name': admin.get('first_name', 'Pharma'),
                        'last_name': admin.get('last_name', 'Admin')
                    })
                else:
                    logger.warning(f"Invalid pharma admin configuration: {admin}")
            
            logger.info(f"Loaded {len(formatted_admins)} pharma admins from {json_file_path}")
            return formatted_admins
            
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON in pharma admins file: {e}")
            return []
        except Exception as e:
            logger.error(f"Error reading pharma admins file: {e}")
            return []
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True
 
 
@lru_cache()
def get_settings() -> Settings:
    """Cached settings instance"""
    return Settings()
 
 
# Global settings instance
settings = get_settings()