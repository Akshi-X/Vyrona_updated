"""
Application Configuration
Loaded from environment variables (.env file)
"""

from pydantic_settings import BaseSettings  # pyright: ignore[reportMissingImports]
from pydantic import model_validator
from typing import List, Optional, Dict, Any
from functools import lru_cache
from urllib.parse import quote_plus
import json
import os
import logging
import re

# Try to import Azure Key Vault libraries (optional for local development)
try:
    from azure.identity import DefaultAzureCredential  # pyright: ignore[reportMissingImports]
    from azure.keyvault.secrets import SecretClient  # pyright: ignore[reportMissingImports]
    AZURE_KEYVAULT_AVAILABLE = True
except ImportError:
    AZURE_KEYVAULT_AVAILABLE = False
    DefaultAzureCredential = None  # type: ignore
    SecretClient = None  # type: ignore


def resolve_keyvault_reference(value: str) -> str:
    """
    Resolve Azure Key Vault references in the format:
    @Microsoft.KeyVault(SecretUri=https://vault.vault.azure.net/secrets/secret-name/)
    
    Returns the original value if it's not a Key Vault reference or if resolution fails.
    """
    if not isinstance(value, str) or not value.startswith('@Microsoft.KeyVault'):
        return value
    
    if not AZURE_KEYVAULT_AVAILABLE:
        logger = logging.getLogger(__name__)
        logger.warning(
            "Azure Key Vault libraries not available. "
            "Key Vault reference will not be resolved. "
            "Install azure-identity and azure-keyvault-secrets to enable resolution."
        )
        return value
    
    try:
        # Pattern to match Key Vault references
        # Format: @Microsoft.KeyVault(SecretUri=https://vault.vault.azure.net/secrets/secret-name/)
        pattern = r'@Microsoft\.KeyVault\(SecretUri=(https://[^/]+/secrets/[^/]+)/?\)'
        match = re.match(pattern, value)
        
        if not match:
            logger = logging.getLogger(__name__)
            logger.warning(f"Invalid Key Vault reference format: {value}")
            return value
        
        vault_url = match.group(1)
        # Extract secret name and vault base URL
        parts = vault_url.split('/secrets/')
        if len(parts) != 2:
            logger = logging.getLogger(__name__)
            logger.warning(f"Invalid Key Vault URL format: {vault_url}")
            return value
        
        vault_base_url = parts[0]
        secret_name = parts[1].rstrip('/')
        
        # Use DefaultAzureCredential to authenticate (works with managed identity, service principal, etc.)
        credential = DefaultAzureCredential()
        secret_client = SecretClient(vault_url=vault_base_url, credential=credential)
        
        # Get the secret value
        secret = secret_client.get_secret(secret_name)
        logger = logging.getLogger(__name__)
        logger.info(f"Successfully resolved Key Vault reference for secret: {secret_name}")
        return secret.value
        
    except Exception as e:
        logger = logging.getLogger(__name__)
        logger.error(
            f"Failed to resolve Key Vault reference '{value}': {str(e)}. "
            "Using original value. This may cause validation errors."
        )
        # Return original value to allow the app to continue
        # In production, you might want to raise an exception instead
        return value


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
    ADMIN_EMAIL: str
    # Super Admin Setup (required in .env)
    ADMIN_DEFAULT_PASSWORD: str
    # MyGrape Platform Admin (required in .env)
    MYGRAPE_ADMIN_EMAIL: str
    MYGRAPE_ADMIN_PASSWORD: str
    # SendGrid (Optional - for enhanced email delivery)
    SENDGRID_API_KEY: Optional[str] = None
    SENDER_EMAIL: Optional[str] = None
    # SMTP Configuration 
    """
    For gmail, you can use the following settings:
        MTP Server: smtp.gmail.com
        Username: Your full Gmail address (e.g., example@gmail.com)
        Password: Your Gmail password or App Password (recommended)
        Port (TLS): 587
        Authentication Required: Yes
        TLS/SSL Required: Yes 
    """
    SMTP_SERVER: Optional[str] = None  # e.g., "smtp.gmail.com"
    SMTP_PORT: Optional[int] = None  # e.g., 587 for TLS
    SMTP_USERNAME: Optional[str] = None  # e.g., "
    SMTP_PASSWORD: Optional[str] = None  # e.g., "your-app-password-here"

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
    # Audit logging feature flag (default off for safety)
    AUDIT_LOG_ENABLED: bool = True
    # Redis Configuration (Optional - defaults provided)
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6380  # Default to 6380 for Azure Redis SSL
    REDIS_DB: int = 0
    REDIS_USERNAME: Optional[str] = None  # For Redis Labs / Redis 6+ ACL (e.g. "default")
    REDIS_PASSWORD: Optional[str] = None
    REDIS_SOCKET_CONNECT_TIMEOUT: int = 10  # Increased timeout for Azure Redis
    REDIS_SOCKET_TIMEOUT: int = 10  # Increased timeout for Azure Redis
    REDIS_SSL: bool = True  # Default to True for Azure Redis Cache (set False for local Redis)
    REDIS_SSL_CERT_REQS: Optional[str] = "required"  # Options: None, "required", "optional" (for Azure Redis, use "required")
    # World Bank LPI API Configuration (Optional - defaults to v2 API)
    LPI_TIMELINESS_API_URL: str = "https://api.worldbank.org/v2/country/all/indicator/LP.LPI.TIM.XQ"
    LPI_OVERALL_API_URL: str = "https://api.worldbank.org/v2/country/all/indicator/LP.LPI.OVRL.XQ"
    # Weather API Configuration
    # Note: Google Maps doesn't provide weather data, but we use it for location services
    # WeatherAPI.com (1M calls/month free tier, includes historical data)
    WEATHER_API_KEY: Optional[str] = None  # WeatherAPI.com API key
    WEATHER_API_PROVIDER: str = "weatherapi"  # Weather provider (default: "weatherapi")
    # Option 2: Google Maps API (Reuse your existing key from frontend for geocoding/location services)
    # This enhances weather reports with location names (e.g., "New York, NY" instead of just coordinates)
    # You can use the same Google Maps API key you're already using for shipment tracking
    GOOGLE_MAPS_API_KEY: Optional[str] = None  # Google Maps API key (same key as VITE_GOOGLE_MAPS_API_KEY in frontend)
    # FlightRadar24 API Configuration
    FLIGHTRADAR24_API_KEY: Optional[str] = None  # FlightRadar24 API key for on-time flight performance
    # IoT Provider Configuration (Required - set in .env)
    IOT_CLIENT_ID: str
    IOT_CLIENT_SECRET: str
    IOT_ACCOUNT_ID: str
    # Internal Service-to-Service API Key (Required for telemetry-service calls)
    INTERNAL_API_KEY: Optional[str] = None  # Shared secret for service-to-service authentication
    # ARC IVF API Configuration (Optional - set in .env)
    ARC_API_TOKEN: Optional[str] = None  # Token ID for ARC IVF Storage API authentication
    ARC_IVF_TOKEN_ID: Optional[str] = None  # Alias for ARC_API_TOKEN (for backward compatibility)
    ARC_AUTORUN: bool = False  # Enable daily ARC IVF autorun at midnight when true
    # Azure Blob Storage (Optional - for IVF media uploads)
    # Azurite dev string: DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;
    #   AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OqIqqr+ReMvs4yMBqWjl5Rr2N5YDM0j2YMk6;
    #   BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;
    AZURE_STORAGE_CONNECTION_STRING: Optional[str] = None
    AZURE_STORAGE_BLOB_CONTAINER: str = "ivf-media"
    # Twilio (Optional - for WhatsApp notifications)
    TWILIO_ACCOUNT_SID: Optional[str] = None
    TWILIO_AUTH_TOKEN: Optional[str] = None
    TWILIO_WHATSAPP_FROM: Optional[str] = None
    # ============================================
    # COMPUTED/DERIVED VALUES
    # ============================================
    @property
    def database_url(self) -> str:
        """Construct database URL from components"""
        password = quote_plus(self.DB_PASSWORD)
        url = f"postgresql+psycopg2://{self.DB_USER}:{password}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
        # Neon and most cloud Postgres require SSL
        if "neon.tech" in self.DB_HOST or "neon" in self.DB_HOST.lower():
            url += "?sslmode=require"
        return url
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
            logger = logging.getLogger(__name__)
            logger.error(f"Error loading pharma admins: {str(e)}")
            return []
    
    @model_validator(mode='before')
    @classmethod
    def resolve_keyvault_refs(cls, data: Any) -> Any:
        """
        Resolve Azure Key Vault references in environment variables before validation.
        This allows Pydantic to receive actual values instead of Key Vault reference strings.
        """
        if isinstance(data, dict):
            resolved = {}
            for key, value in data.items():
                if isinstance(value, str) and value.startswith('@Microsoft.KeyVault'):
                    resolved[key] = resolve_keyvault_reference(value)
                else:
                    resolved[key] = value
            return resolved
        return data
   
    def get_ivf_admins(self) -> List[Dict[str, Any]]:
        """
        Load IVF admins from ivf_admins.json file.
        IVF users must have email @zucisystems.com or @mygrape.org.
        Returns a list of IVF admin dictionaries.
        """
        try:
            current_dir = os.path.dirname(os.path.abspath(__file__))
            backend_dir = os.path.dirname(os.path.dirname(current_dir))
            ivf_admins_path = os.path.join(backend_dir, "ivf_admins.json")
            if not os.path.exists(ivf_admins_path):
                return []
            with open(ivf_admins_path, 'r', encoding='utf-8') as f:
                admins = json.load(f)
                return admins if isinstance(admins, list) else []
        except Exception as e:
            logger = logging.getLogger(__name__)
            logger.error(f"Error loading IVF admins: {str(e)}")
            return []
   
    class Config:
        env_file = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env")
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
            # Prioritize .env file, then environment variables
            # Key Vault references are resolved by the model_validator
            return (
                init_settings,
                env_settings,
                file_secret_settings,
            )
 
 
@lru_cache()
def get_settings() -> Settings:
    """Cached settings instance"""
    return Settings()
 
 
# Global settings instance
settings = get_settings()
 