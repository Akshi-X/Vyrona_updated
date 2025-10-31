import logging
from datetime import datetime, timezone

from app.config.database import engine, Base, SessionLocal
from app.models import user_model, otp_model, patient_model, pharma_model, provider_model
from app.models.patient_stage_model import PatientStage as PatientStageModel
from app.constants.enums import PatientStage as PatientStageEnum
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
            
            # First, ensure the pharma company exists
            existing_pharma = db.query(pharma_model.Pharma).filter(pharma_model.Pharma.pharma_name == company).first()
            if not existing_pharma:
                logger.error(f"Pharma company '{company}' not found. Please create pharma companies first.")
                continue
            
            pharma_id = existing_pharma.id
            
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
                if existing_admin.pharma_id != pharma_id:
                    existing_admin.pharma_id = pharma_id
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
                pharma_id=pharma_id,
                approved_status="approved",
                status=True,
                session_timeout=120,
                created_at=datetime.now(timezone.utc),
                updated_at=datetime.now(timezone.utc)
            )
            
            db.add(admin_user)
            db.commit()
            db.refresh(admin_user)
            
            logger.info(f"PHARMA ADMIN CREATED: {email} (ID: {admin_user.user_id}) for pharma_id: {pharma_id}")
        
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
    Pharma companies are created first, then admin users are created and linked to them.
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
            location = pharma_admin.get('location')  # Get location if provided, None otherwise
            
            logger.info(f"Processing pharma company: {company_name}")
            
            # Check if pharma company already exists
            existing_pharma = db.query(pharma_model.Pharma).filter(pharma_model.Pharma.pharma_name == company_name).first()
            
            if existing_pharma:
                logger.info(f"Pharma company already exists: {company_name}")
                # Update location if provided and different
                if location and existing_pharma.location != location:
                    existing_pharma.location = location
                    db.commit()
                    logger.info(f"Updated location for {company_name}: {location}")
                continue
            
            # Create new pharma company
            logger.info(f"Creating pharma company: {company_name}")
            
            new_pharma = pharma_model.Pharma(
                pharma_name=company_name,
                location=location,
                created_by="system"
            )
            
            db.add(new_pharma)
            db.commit()
            db.refresh(new_pharma)
            
            logger.info(f"PHARMA COMPANY CREATED: {company_name} (ID: {new_pharma.id})")
        
        # Show all pharma companies
        all_pharmas = db.query(pharma_model.Pharma).all()
        logger.info(f"All pharma companies in database ({len(all_pharmas)} total):")
        for pharma in all_pharmas:
            location_info = f", Location: {pharma.location}" if pharma.location else ""
            logger.info(f"  - ID: {pharma.id}, Name: {pharma.pharma_name}{location_info}")
        
        logger.info("=" * 60)
        logger.info(f"PHARMA COMPANIES SETUP COMPLETE: {len(all_pharmas)} companies")
        logger.info("=" * 60)
        
    except Exception as e:
        db.rollback()
        logger.error(f"ERROR creating pharma companies: {str(e)}", exc_info=True)
    finally:
        db.close()


def create_mygrape_admin():
    """
    Create MyGrape platform admin account.
    This admin can view all feedback tickets and manage the platform.
    """
    logger.info("=" * 60)
    logger.info("CHECKING MYGRAPE PLATFORM ADMIN...")
    logger.info("=" * 60)
    
    db = SessionLocal()
    try:
        # Check if MyGrape admin already exists
        existing_admin = db.query(User).filter(
            User.email == settings.MYGRAPE_ADMIN_EMAIL
        ).first()
        
        if existing_admin:
            logger.info(f"MyGrape admin already exists: {settings.MYGRAPE_ADMIN_EMAIL}")
            return
        
        # Create MyGrape admin
        mygrape_admin = User(
            user_id=generate_user_id(),
            first_name="MyGrape",
            last_name="Admin",
            email=settings.MYGRAPE_ADMIN_EMAIL,
            password_hash=get_password_hash(settings.MYGRAPE_ADMIN_PASSWORD),
            role="mygrape_admin",
            pharma_id=None,  # MyGrape admin doesn't belong to any pharma company
            status=True,
            approved_status="approved",
            created_by="system",
            updated_by="system"
        )
        
        db.add(mygrape_admin)
        db.commit()
        db.refresh(mygrape_admin)
        
        logger.info(f"MyGrape platform admin created successfully: {settings.MYGRAPE_ADMIN_EMAIL}")
        
    except Exception as e:
        logger.error(f"ERROR creating MyGrape admin: {str(e)}")
        db.rollback()
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
    
    # Create pharma companies if not exists
    create_pharma_companies()
    
    # Create pharma admins if not exists
    create_pharma_admins()
    
    # Create MyGrape platform admin if not exists
    create_mygrape_admin()
    
    # Backfill process_phase table from existing patients (idempotent)
    _backfill_process_phase_from_patients()
    
    logger.info("Database initialization complete")
    logger.info("=" * 60)


def _backfill_process_phase_from_patients():
    """
    Create an initial active process_phase row per patient if none exists.
    - stage: taken from patient.stage if it matches known stages, else defaults to Scheduled
    - is_active: True by default for ongoing, False if patient.treatment_status indicates completion/failure
    - is_success: True for after_care, False for failure, None otherwise
    This function is idempotent: patients with any existing stage_history are skipped.
    """
    db = SessionLocal()
    created_count = 0
    try:
        patients = db.query(patient_model.Patient).all()
        stage_values = set(PatientStageEnum.list())

        for p in patients:
            # Skip if any stage history exists
            existing = (
                db.query(PatientStageModel)
                .filter(PatientStageModel.patient_id == p.id)
                .first()
            )
            if existing:
                continue

            # Determine stage
            stage_value = p.stage if p.stage in stage_values else PatientStageEnum.SCHEDULED.value

            # Determine is_success from legacy treatment_status
            is_success = None
            is_active = True
            if p.treatment_status is not None:
                ts = str(p.treatment_status).lower()
                if ts == "failure":
                    is_success = False
                    is_active = False
                elif ts == "after_care":
                    is_success = True
                    is_active = False
                else:
                    # ongoing or unknown -> keep active
                    is_success = None
                    is_active = True

            new_stage = PatientStageModel(
                patient_id=p.id,
                stage=stage_value,
                is_active=is_active,
                is_success=is_success,
                created_by="system",
                updated_by="system",
            )
            db.add(new_stage)
            created_count += 1

        if created_count:
            db.commit()
            logger.info(f"Backfill: created {created_count} process_phase row(s)")
        else:
            logger.info("Backfill: no process_phase rows needed (already populated)")
    except Exception as e:
        db.rollback()
        logger.error(f"ERROR backfilling process_phase: {str(e)}", exc_info=True)
    finally:
        db.close()

