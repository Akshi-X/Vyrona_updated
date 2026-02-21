import os
import logging
import asyncio
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from app.controller import user_controller, feedback_controller, task_controller, dashboard_controller, patient_controller, chat_controller, shipment_controller, lane_risk_controller, quality_controller, iot_controller
from app.controller.IVF import ivf_controller, ivf_dashboard_controller, quality_tracking_controller, ivf_quality_controller, critical_alert_controller, internal_alert_controller

from app.config.database import init_db as create_tables
from app.init_db import init_db as create_admin
from app.config.config import settings
from app.constants.app_constants import APP_NAME, STATIC_DIR, API_PREFIX
from app.middleware.exception_handler import setup_exception_handlers, exception_handler_middleware
from app.middleware.request_validation_middleware import RequestValidationMiddleware
from app.middleware.patient_validation_middleware import PatientValidationMiddleware
from app.middleware.sanitization_middleware import SanitizationMiddleware
from app.middleware.token_validation_middleware import TokenValidationMiddleware
from app.middleware.rbac_middleware import RBACMiddleware
from app.service.quality_service import QualityService
from app.config.database import SessionLocal
from app.constants.app_constants import FEEDBACK_UPLOAD_DIR
from app.schemas.response_schema import HealthCheckResponse
from app.constants.status_constants import HEALTH_HEALTHY
from app.utils.lane_risk_utils import schedule_daily_lpi_fetch
from app.utils.alert_reminder_scheduler import schedule_alert_reminders
import uvicorn

# Create logs directory if it doesn't exist (BEFORE logging setup)
os.makedirs('logs', exist_ok=True)

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('logs/app.log'),
        logging.StreamHandler()
    ]
)

# Create FastAPI app with security scheme for Swagger
app = FastAPI(
    title=APP_NAME,
    description="MyGrape Supply Chain Tracking API",
    version="1.0.0",
    swagger_ui_parameters={
        "persistAuthorization": True  # Keep authorization after page refresh
    }
)

# Add security scheme for Swagger UI
def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
    
    from fastapi.openapi.utils import get_openapi
    from app.config.permissions import PUBLIC_ENDPOINTS
    
    def _is_public_endpoint(method: str, path: str, endpoints) -> bool:
        """Check if a method+path combination is in the public endpoints set"""
        # Check for exact match
        if (method, path) in endpoints:
            return True
        # Check for wildcard method match
        if ("*", path) in endpoints:
            return True
        return False
    
    openapi_schema = get_openapi(
        title=app.title,
        version=app.version,
        description=app.description,
        routes=app.routes,
    )
    
    # Add Bearer token security scheme
    openapi_schema["components"]["securitySchemes"] = {
        "BearerAuth": {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT",
            "description": "Enter your JWT token from the /api/verify-otp endpoint"
        }
    }
    
    # Mark protected endpoints with security requirement
    for path, path_item in openapi_schema["paths"].items():
        if path.startswith("/static"):
            continue
        
        # Add security requirement to all methods (GET, POST, etc.)
        for method in path_item:
            if method in ["get", "post", "put", "delete", "patch"]:
                # Check if this specific method+path is public
                http_method = method.upper()
                is_public = _is_public_endpoint(http_method, path, PUBLIC_ENDPOINTS)
                
                if not is_public:
                    if "security" not in path_item[method]:
                        path_item[method]["security"] = [{"BearerAuth": []}]
    
    app.openapi_schema = openapi_schema
    return app.openapi_schema

app.openapi = custom_openapi

# Setup global exception handlers
setup_exception_handlers(app)

# Startup event to initialize database
@app.on_event("startup")
async def startup_event():
    """Run on application startup"""
    logger = logging.getLogger(__name__)
    logger.info("=" * 60)
    logger.info("APPLICATION STARTUP EVENT")
    logger.info("=" * 60)
    
    # Step 1: Create database tables first
    logger.info("Creating database tables...")
    create_tables()
    
    # Step 2: Create pharma admin users
    logger.info("Creating pharma admin users...")
    create_admin()
    
    # Step 3: Start quality monitoring background tasks
    logger.info("Starting quality monitoring background tasks...")
    db = SessionLocal()
    quality_service = QualityService(db)
    asyncio.create_task(quality_service.redis_listener(quality_controller.manager))
    asyncio.create_task(quality_service.log_connections_periodically(quality_controller.manager))

    # Step 3b: Start LN2 readings WebSocket listener (separate from quality)
    logger.info("Starting LN2 Redis listener for real-time readings...")
    asyncio.create_task(ivf_quality_controller.ln2_redis_listener())
    
    # Step 4: Start scheduled task to fetch World Bank LPI data daily at midnight
    logger.info("Starting World Bank LPI daily fetch scheduler...")
    asyncio.create_task(schedule_daily_lpi_fetch())
    
    # Step 5: Start scheduled task for hourly alert reminders
    logger.info("Starting hourly alert reminder scheduler...")
    asyncio.create_task(schedule_alert_reminders())

    print("!" * 60 + "\n")

# Enable CORS (add FIRST so it executes FIRST in the chain)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,  # From environment variable
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add middlewares (executed in reverse order)
# Flow: CORS → Exception Handler → Sanitization → Patient Validation → User Validation → Token → RBAC → Controller
app.add_middleware(RBACMiddleware)
app.add_middleware(TokenValidationMiddleware)
app.add_middleware(RequestValidationMiddleware)
app.add_middleware(PatientValidationMiddleware)
app.add_middleware(SanitizationMiddleware)
app.add_middleware(BaseHTTPMiddleware, dispatch=exception_handler_middleware)

# Mount static folder (create directory if needed)
if not os.path.exists(STATIC_DIR):
    os.makedirs(STATIC_DIR)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

# Create uploads directory for feedback attachments
if not os.path.exists(FEEDBACK_UPLOAD_DIR):
    os.makedirs(FEEDBACK_UPLOAD_DIR, exist_ok=True)

# Mount uploads directory for feedback attachments
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# Include API routes
app.include_router(user_controller.router, prefix=API_PREFIX)
app.include_router(patient_controller.router, prefix=API_PREFIX)
app.include_router(feedback_controller.router, prefix=API_PREFIX)
app.include_router(task_controller.router, prefix=API_PREFIX)
app.include_router(dashboard_controller.router, prefix=API_PREFIX)
app.include_router(chat_controller.router, prefix=API_PREFIX)
app.include_router(shipment_controller.router, prefix=API_PREFIX)
app.include_router(lane_risk_controller.router, prefix=API_PREFIX)
app.include_router(quality_controller.router, prefix=API_PREFIX)
app.include_router(quality_tracking_controller.router, prefix=API_PREFIX)
app.include_router(iot_controller.router, prefix=API_PREFIX)
app.include_router(ivf_controller.router, prefix=API_PREFIX)
app.include_router(ivf_dashboard_controller.router, prefix=API_PREFIX)
app.include_router(ivf_quality_controller.router, prefix=API_PREFIX)
app.include_router(critical_alert_controller.router, prefix=API_PREFIX)
app.include_router(internal_alert_controller.router, prefix=API_PREFIX)


# Health check endpoint
@app.get("/health")
def health_check():
    """Health check endpoint."""
    return HealthCheckResponse(
        status=HEALTH_HEALTHY,
        platform="MyGrape",
        service="Supply Chain Tracking",
        environment=settings.ENVIRONMENT,
        database_connected=True
    )

if __name__ == "__main__":
    uvicorn.run(
        app, 
        host=settings.HOST, 
        port=settings.PORT, 
        reload=settings.RELOAD,
        ws="websockets"  # Explicitly enable WebSocket support
    )
