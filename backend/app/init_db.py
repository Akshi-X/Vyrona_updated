import logging
from datetime import datetime, timezone

from app.config.database import engine, Base, SessionLocal
from app.models import user_model, otp_model, patient_model, pharma_model, provider_model
from app.models.user_model import User
from app.auth.auth import get_password_hash
from app.config.config import settings
from app.utils.utils import generate_user_id

logger = logging.getLogger(__name__)


def create_super_admin():
    """
    Create super admin account on first startup.
    Super admin can approve managers.
    """
    logger.info("=" * 60)
    logger.info("CHECKING SUPER ADMIN ACCOUNT...")
    logger.info("=" * 60)
    
    db = SessionLocal()
    try:
        # Check if super admin already exists
        admin_email = settings.ADMIN_EMAIL
        existing_admin = db.query(User).filter(User.email == admin_email).first()
        
        if existing_admin:
            logger.info(f"Existing admin found: {existing_admin.email}")
            
            # Update existing admin to ensure it's active and approved
            needs_update = False
            if not existing_admin.status:
                existing_admin.status = True
                needs_update = True
            if existing_admin.approved_status != 'approved':
                existing_admin.approved_status = 'approved'
                needs_update = True
            if existing_admin.company_name != 'myGrape Platform':
                existing_admin.company_name = 'myGrape Platform'
                needs_update = True
            if existing_admin.role != 'admin':
                existing_admin.role = 'admin'
                needs_update = True
                
            if needs_update:
                db.commit()
                db.refresh(existing_admin)
                logger.info(f"Super admin updated: {existing_admin.email} (ID: {existing_admin.user_id})")
            else:
                logger.info("Super admin already active")
            return
        
        # No existing admin - create new one
        logger.info("Creating new super admin...")
        
        # Create super admin
        admin_user = User(
            user_id=generate_user_id(),
            email=admin_email,
            password_hash=get_password_hash(settings.ADMIN_DEFAULT_PASSWORD),
            first_name="Platform",
            last_name="Admin",
            role="admin",
            company_name="myGrape Platform",
            approved_status="approved",
            status=True,
            session_timeout=120,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )
        
        db.add(admin_user)
        db.commit()
        db.refresh(admin_user)
        
        logger.info("=" * 60)
        logger.info(f"SUPER ADMIN CREATED: {admin_email} (ID: {admin_user.user_id})")
        logger.info("=" * 60)
        
    except Exception as e:
        db.rollback()
        logger.error(f"ERROR creating/updating super admin: {str(e)}", exc_info=True)
    finally:
        db.close()


def init_db():
    """
    Initialize database tables and create super admin if not exists.
    """
    logger.info("=" * 60)
    logger.info("INITIALIZING DATABASE...")
    logger.info("=" * 60)
    
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables created/verified")
    
    # Create super admin if not exists
    create_super_admin()
    logger.info("Database initialization complete")
    logger.info("=" * 60)

