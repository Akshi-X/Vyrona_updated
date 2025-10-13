from app.config.database import engine, Base, SessionLocal
from app.models import user_model, otp_model
from app.models.user_model import User
from app.auth.auth import get_password_hash
from app.config.config import settings
from app.utils.utils import generate_user_id
from datetime import datetime, timezone


def create_super_admin():
    """
    Create super admin account on first startup.
    Super admin can approve managers.
    """
    import sys
    
    print("\n" + "=" * 60, flush=True)
    print("CHECKING SUPER ADMIN ACCOUNT...", flush=True)
    print("=" * 60, flush=True)
    sys.stdout.flush()
    
    db = SessionLocal()
    try:
        # Check if super admin already exists
        admin_email = settings.ADMIN_EMAIL
        print(f"Admin email from .env: {admin_email}", flush=True)
        import sys
        sys.stdout.flush()
        
        existing_admin = db.query(User).filter(User.email == admin_email).first()
        
        if existing_admin:
            print(f"Existing admin found: {existing_admin.email}")
            print(f"Current status: {existing_admin.status}, approved: {existing_admin.approved_status}")
            
            # Update existing admin to ensure it's active and approved
            needs_update = False
            if not existing_admin.status:
                print("Setting status = True")
                existing_admin.status = True
                needs_update = True
            if existing_admin.approved_status != 'approved':
                print("Setting approved_status = 'approved'")
                existing_admin.approved_status = 'approved'
                needs_update = True
            if existing_admin.company_name != 'MyGrape Platform':
                print(f"Updating company_name to 'MyGrape Platform'")
                existing_admin.company_name = 'MyGrape Platform'
                needs_update = True
            if existing_admin.role != 'admin':
                print(f"Updating role to 'admin'")
                existing_admin.role = 'admin'
                needs_update = True
                
            if needs_update:
                print("Committing updates to database...")
                db.commit()
                db.refresh(existing_admin)
                print("\n" + "=" * 60)
                print("SUPER ADMIN UPDATED TO ACTIVE")
                print("=" * 60)
                print(f"Email: {existing_admin.email}")
                print(f"User ID: {existing_admin.user_id}")
                print(f"Status: {existing_admin.status}")
                print(f"Approved: {existing_admin.approved_status}")
                print(f"Role: {existing_admin.role}")
                print(f"Company: {existing_admin.company_name}")
                print("=" * 60 + "\n")
            else:
                print("Super admin already active - no update needed\n")
            return
        
        # No existing admin - create new one
        print("No existing admin found. Creating new super admin...")
        
        # Get admin password from environment
        admin_password = settings.ADMIN_DEFAULT_PASSWORD
        print(f"Password from .env: {'***' if admin_password else 'NOT SET'}")
        
        # Create super admin
        admin_user = User(
            user_id=generate_user_id(),
            email=admin_email,
            password_hash=get_password_hash(admin_password),
            first_name="Platform",
            last_name="Admin",
            role="admin",
            company_name="MyGrape Platform",
            approved_status="approved",
            status=True,
            session_timeout=120,  # Admin gets 120 minutes
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )
        
        print("Inserting super admin into database...")
        db.add(admin_user)
        db.commit()
        db.refresh(admin_user)
        
        print("\n" + "=" * 60)
        print("SUPER ADMIN CREATED SUCCESSFULLY")
        print("=" * 60)
        print(f"Email: {admin_email}")
        print(f"User ID: {admin_user.user_id}")
        print(f"Role: {admin_user.role}")
        print(f"Status: APPROVED & ACTIVE")
        print("=" * 60 + "\n")
        
    except Exception as e:
        db.rollback()
        print("\n" + "!" * 60)
        print(f"ERROR creating/updating super admin: {str(e)}")
        print(f"Exception type: {type(e).__name__}")
        import traceback
        print(traceback.format_exc())
        print("!" * 60 + "\n")
    finally:
        db.close()


def init_db():
    """
    Initialize database tables and create super admin if not exists.
    """
    import sys
    
    print("\n" + "=" * 60, flush=True)
    print("INITIALIZING DATABASE...", flush=True)
    print("=" * 60, flush=True)
    sys.stdout.flush()
    
    Base.metadata.create_all(bind=engine)
    print("Database tables created/verified", flush=True)
    sys.stdout.flush()
    
    # Create super admin if not exists
    print("Calling create_super_admin()...\n", flush=True)
    sys.stdout.flush()
    create_super_admin()
    print("Database initialization complete", flush=True)
    print("=" * 60 + "\n", flush=True)
    sys.stdout.flush()

