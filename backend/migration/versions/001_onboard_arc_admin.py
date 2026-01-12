"""Onboard ARC admin for IVF branch logins

Revision ID: 001_onboard_arc_admin
Revises: 
Create Date: 2024-01-01 00:00:00.000000

"""
from typing import Sequence, Union
from datetime import datetime, timezone
import sys
from pathlib import Path

from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import text

# Add backend directory to path to import app modules
backend_dir = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(backend_dir))

# revision identifiers, used by Alembic.
revision: str = '001_onboard_arc_admin'
down_revision: Union[str, None] = None  # Base migration
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Onboard ARC admin in branch_logins table.
    This admin can approve Manager registrations for IVF.
    """
    # Get database connection
    conn = op.get_bind()
    
    # Import password hashing function
    from app.auth.auth import get_password_hash
    
    # Default ARC admin credentials
    arc_admin_email = "arcadmin@mygrape.org"
    arc_admin_password = "ArcAdmin1@123"  # Should be changed after first login
    arc_admin_first_name = "ARC"
    arc_admin_last_name = "Admin"
    hospital_name = "ARC Fertility Hospitals"
    department = "IVF"
    role = "Admin"  # Admin role for ARC admin
    
    # Check if ARC admin already exists
    check_query = text("""
        SELECT login_id FROM ivf.branch_logins 
        WHERE email = :email
    """)
    result = conn.execute(check_query, {"email": arc_admin_email}).fetchone()
    
    if result:
        print(f"ARC admin already exists with email: {arc_admin_email}")
        return
    
    # Get hospital_id for ARC Fertility Hospitals
    hospital_query = text("""
        SELECT hospital_id FROM ivf.hospitals 
        WHERE hospital_name = :hospital_name
    """)
    hospital_result = conn.execute(hospital_query, {"hospital_name": hospital_name}).fetchone()
    
    if not hospital_result:
        raise Exception(f"Hospital '{hospital_name}' not found. Please create the hospital first.")
    
    hospital_id = hospital_result[0]
    
    # Get first branch_id for this hospital (or create one if needed)
    branch_query = text("""
        SELECT branch_id FROM ivf.hospital_branches 
        WHERE hospital_id = :hospital_id 
        ORDER BY branch_id ASC 
        LIMIT 1
    """)
    branch_result = conn.execute(branch_query, {"hospital_id": hospital_id}).fetchone()
    
    if not branch_result:
        raise Exception(f"No branches found for hospital '{hospital_name}'. Please create a branch first.")
    
    branch_id = branch_result[0]
    
    # Hash the password
    password_hash = get_password_hash(arc_admin_password)
    
    # Insert ARC admin into branch_logins table
    insert_query = text("""
        INSERT INTO ivf.branch_logins (
            branch_id,
            email,
            password_hash,
            first_name,
            last_name,
            role,
            department,
            is_active,
            approved_status,
            approved_by,
            approved_on,
            created_at,
            updated_at,
            created_by,
            session_timeout,
            last_password_changed
        ) VALUES (
            :branch_id,
            :email,
            :password_hash,
            :first_name,
            :last_name,
            :role,
            :department,
            :is_active,
            :approved_status,
            :approved_by,
            :approved_on,
            :created_at,
            :updated_at,
            :created_by,
            :session_timeout,
            :last_password_changed
        )
    """)
    
    now = datetime.now(timezone.utc)
    
    conn.execute(insert_query, {
        "branch_id": branch_id,
        "email": arc_admin_email,
        "password_hash": password_hash,
        "first_name": arc_admin_first_name,
        "last_name": arc_admin_last_name,
        "role": role,
        "department": department,
        "is_active": True,
        "approved_status": "approved",
        "approved_by": "system",
        "approved_on": now,
        "created_at": now,
        "updated_at": now,
        "created_by": "system",
        "session_timeout": 120,  # 2 hours session timeout
        "last_password_changed": now
    })
    
    print(f"ARC admin created successfully: {arc_admin_email}")
    print(f"  - Hospital: {hospital_name} (ID: {hospital_id})")
    print(f"  - Branch ID: {branch_id}")
    print(f"  - Role: {role}")
    print(f"  - Department: {department}")
    print(f"  - Password: {arc_admin_password} (Please change after first login)")


def downgrade() -> None:
    """
    Remove ARC admin from branch_logins table.
    """
    conn = op.get_bind()
    
    arc_admin_email = "arcadmin@mygrape.org"
    
    delete_query = text("""
        DELETE FROM ivf.branch_logins 
        WHERE email = :email
    """)
    
    result = conn.execute(delete_query, {"email": arc_admin_email})
    
    if result.rowcount > 0:
        print(f"ARC admin removed: {arc_admin_email}")
    else:
        print(f"ARC admin not found: {arc_admin_email}")
