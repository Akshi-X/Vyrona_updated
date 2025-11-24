"""
Simple migration script to convert user_role enum to VARCHAR and update existing data.
This script doesn't require any app imports - just direct database access.
"""

import os
import sys
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# Import app config to get database URL
try:
    from app.config.config import settings
    DATABASE_URL = settings.database_url
except ImportError:
    # Fallback to environment variable
    DATABASE_URL = os.getenv('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/mygrape')

print("=" * 60)
print("ROLE COLUMN MIGRATION")
print("=" * 60)
print(f"Connecting to database...")

try:
    engine = create_engine(DATABASE_URL)
    SessionLocal = sessionmaker(bind=engine)
    db = SessionLocal()
    
    print("Connected successfully!")
    print()
    
    # Step 1: Check current column type
    print("Step 1: Checking current column type...")
    result = db.execute(text("""
        SELECT data_type, udt_name 
        FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'role'
    """))
    row = result.fetchone()
    if row:
        print(f"Current column type: {row[0]}, UDT: {row[1]}")
    print()
    
    # Step 2: Convert column from enum to VARCHAR FIRST (before updating values)
    print("Step 2: Converting column type to VARCHAR...")
    try:
        db.execute(text("ALTER TABLE users ALTER COLUMN role TYPE VARCHAR(50) USING role::text"))
        db.commit()
        print("  Column converted to VARCHAR successfully!")
    except Exception as e:
        print(f"  Warning: {e}")
        print("  Column may already be VARCHAR")
        db.rollback()
        # Check if it's already VARCHAR
        result = db.execute(text("""
            SELECT udt_name 
            FROM information_schema.columns 
            WHERE table_name = 'users' AND column_name = 'role'
        """))
        udt_name = result.fetchone()[0]
        if udt_name == 'user_role':
            print("  ERROR: Column is still enum type. Cannot proceed.")
            db.close()
            sys.exit(1)
    print()
    
    # Step 3: Update existing data to title case (now that column is VARCHAR)
    print("Step 3: Updating existing role values to title case...")
    role_mapping = {
        'admin': 'Admin',
        'pharma_admin': 'Pharma_admin',
        'mygrape_admin': 'Mygrape_admin',
        'manager': 'Manager',
        'user': 'User'
    }
    
    total_updated = 0
    for old_role, new_role in role_mapping.items():
        count = db.execute(
            text("UPDATE users SET role = :new_role WHERE LOWER(role) = :old_role"),
            {"new_role": new_role, "old_role": old_role}
        ).rowcount
        if count > 0:
            print(f"  Updated {count} rows from '{old_role}' to '{new_role}'")
            total_updated += count
    
    db.commit()
    print(f"Total rows updated: {total_updated}")
    print()
    
    # Step 4: Verify the migration
    print("Step 4: Verifying migration...")
    result = db.execute(text("SELECT DISTINCT role FROM users ORDER BY role"))
    final_roles = [row[0] for row in result.fetchall()]
    print(f"Final roles in database: {final_roles}")
    
    result = db.execute(text("""
        SELECT data_type 
        FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'role'
    """))
    final_type = result.fetchone()[0]
    print(f"Final column type: {final_type}")
    print()
    
    print("=" * 60)
    print("MIGRATION COMPLETE!")
    print("=" * 60)
    
    db.close()
    
except Exception as e:
    print(f"ERROR: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

