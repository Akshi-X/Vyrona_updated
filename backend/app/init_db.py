import logging
from datetime import datetime, timezone

from app.config.database import engine, Base, SessionLocal
from app.models import user_model, otp_model, patient_model, pharma_model, provider_model
from app.models.user_model import User
from app.auth.auth import get_password_hash
from app.config.config import settings
from app.utils.utils import generate_user_id

logger = logging.getLogger(__name__)


def create_pharma_admins():
    """
    Create pharma admin accounts on first startup.
    Each pharma admin can approve users/managers from their own company.
    """
    logger.info("=" * 60)
    logger.info("CHECKING PHARMA ADMIN ACCOUNTS...")
    logger.info("=" * 60)
    
    db = SessionLocal()
    try:
        pharma_admins = settings.get_pharma_admins()
        
        if not pharma_admins:
            logger.warning("No pharma admins configured in environment variables")
            return
        
        for pharma_admin in pharma_admins:
            email = pharma_admin['email']
            company = pharma_admin['company']
            
            logger.info(f"Processing pharma admin: {email} for company: {company}")
            
            # Check if pharma admin already exists
            existing_admin = db.query(User).filter(User.email == email).first()
            
            if existing_admin:
                logger.info(f"Existing pharma admin found: {email}")
                
                # Update existing admin to ensure it's active and approved
                needs_update = False
                if not existing_admin.status:
                    existing_admin.status = True
                    needs_update = True
                if existing_admin.approved_status != 'approved':
                    existing_admin.approved_status = 'approved'
                    needs_update = True
                if existing_admin.company_name != company:
                    existing_admin.company_name = company
                    needs_update = True
                if existing_admin.role != 'pharma_admin':
                    existing_admin.role = 'pharma_admin'
                    needs_update = True
                    
                if needs_update:
                    db.commit()
                    db.refresh(existing_admin)
                    logger.info(f"Pharma admin updated: {email} (ID: {existing_admin.user_id})")
                else:
                    logger.info(f"Pharma admin already active: {email}")
                continue
            
            # No existing admin - create new one
            logger.info(f"Creating new pharma admin: {email}")
            
            # Create pharma admin
            admin_user = User(
                user_id=generate_user_id(),
                email=email,
                password_hash=get_password_hash(pharma_admin['password']),
                first_name=pharma_admin['first_name'],
                last_name=pharma_admin['last_name'],
                role="pharma_admin",
                company_name=company,
                approved_status="approved",
                status=True,
                session_timeout=120,
                created_at=datetime.now(timezone.utc),
                updated_at=datetime.now(timezone.utc)
            )
            
            db.add(admin_user)
            db.commit()
            db.refresh(admin_user)
            
            logger.info(f"PHARMA ADMIN CREATED: {email} (ID: {admin_user.user_id}) for company: {company}")
        
        logger.info("=" * 60)
        logger.info(f"PHARMA ADMIN SETUP COMPLETE: {len(pharma_admins)} admins configured")
        logger.info("=" * 60)
        
    except Exception as e:
        db.rollback()
        logger.error(f"ERROR creating/updating pharma admins: {str(e)}", exc_info=True)
    finally:
        db.close()


def create_pharma_companies():
    """
    Create pharma companies in the pharma table for each pharma admin.
    """
    logger.info("=" * 60)
    logger.info("CREATING PHARMA COMPANIES...")
    logger.info("=" * 60)
    
    db = SessionLocal()
    try:
        pharma_admins = settings.get_pharma_admins()
        
        if not pharma_admins:
            logger.warning("No pharma admins configured in environment variables")
            return
        
        for pharma_admin in pharma_admins:
            company_name = pharma_admin['company']
            admin_email = pharma_admin['email']
            
            logger.info(f"Processing pharma company: {company_name}")
            
            # Check if pharma company already exists
            existing_pharma = db.query(pharma_model.Pharma).filter(pharma_model.Pharma.pharma_name == company_name).first()
            
            if existing_pharma:
                logger.info(f"Pharma company already exists: {company_name}")
                continue
            
            # Get the pharma admin user for this company
            pharma_admin_user = db.query(user_model.User).filter(
                user_model.User.email == admin_email,
                user_model.User.role == 'pharma_admin',
                user_model.User.company_name == company_name
            ).first()
            
            if not pharma_admin_user:
                logger.error(f"Pharma admin user not found for {company_name}")
                continue
            
            # Create new pharma company
            logger.info(f"Creating pharma company: {company_name}")
            
            new_pharma = pharma_model.Pharma(
                pharma_name=company_name,
                user_id=pharma_admin_user.user_id,  # Link to pharma admin
                created_by=pharma_admin_user.user_id
            )
            
            db.add(new_pharma)
            db.commit()
            db.refresh(new_pharma)
            
            logger.info(f"✅ PHARMA COMPANY CREATED: {company_name} (ID: {new_pharma.id}) linked to admin: {pharma_admin_user.email}")
        
        # Show all pharma companies
        all_pharmas = db.query(pharma_model.Pharma).all()
        logger.info(f"All pharma companies in database ({len(all_pharmas)} total):")
        for pharma in all_pharmas:
            logger.info(f"  - ID: {pharma.id}, Name: {pharma.pharma_name}, Admin ID: {pharma.user_id}")
        
        logger.info("=" * 60)
        logger.info(f"PHARMA COMPANIES SETUP COMPLETE: {len(all_pharmas)} companies")
        logger.info("=" * 60)
        
    except Exception as e:
        db.rollback()
        logger.error(f"ERROR creating pharma companies: {str(e)}", exc_info=True)
    finally:
        db.close()


def init_db():
    """
    Initialize database tables and create pharma admins and companies if not exists.
    """
    logger.info("=" * 60)
    logger.info("INITIALIZING DATABASE...")
    logger.info("=" * 60)
    
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables created/verified")
    
    # Create pharma admins if not exists
    create_pharma_admins()
    
    # Create pharma companies if not exists
    create_pharma_companies()
    
    logger.info("Database initialization complete")
    logger.info("=" * 60)

