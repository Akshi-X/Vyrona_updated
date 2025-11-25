"""
Migration script to convert users.role from lowercase ENUM to title case ENUM.

Current state: Database has ENUM with lowercase values ('admin', 'manager', etc.)
Target state: ENUM with title case values ('Admin', 'Manager', etc.)

This script:
1. Converts ENUM → VARCHAR (temporary, to allow data updates)
2. Updates all role values from lowercase to title case
3. Drops old lowercase ENUM type
4. Creates new title case ENUM type
5. Converts VARCHAR → ENUM with title case values

Run this script ONCE per environment.
"""

import os
import sys
from sqlalchemy import create_engine, text
from sqlalchemy.exc import ProgrammingError

# Add parent directory to path to import app config
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    from app.config.config import settings
    
    # Get database URL from settings (it's a property, not attribute)
    DATABASE_URL = settings.database_url
except ImportError:
    # Fallback: try to get from environment or construct from components
    import os
    DATABASE_URL = os.getenv("DATABASE_URL")
    if not DATABASE_URL:
        # Try to construct from individual components
        db_user = os.getenv("DB_USER")
        db_password = os.getenv("DB_PASSWORD")
        db_host = os.getenv("DB_HOST")
        db_port = os.getenv("DB_PORT", "5432")
        db_name = os.getenv("DB_NAME")
        
        if all([db_user, db_password, db_host, db_name]):
            from urllib.parse import quote_plus
            DATABASE_URL = f"postgresql+psycopg2://{db_user}:{quote_plus(db_password)}@{db_host}:{db_port}/{db_name}"
        else:
            print("ERROR: Could not find DATABASE_URL or database components in environment variables")
            print("Please set DATABASE_URL or DB_USER, DB_PASSWORD, DB_HOST, DB_PORT, DB_NAME")
            sys.exit(1)

print("=" * 60)
print("MIGRATING ROLE COLUMN FROM LOWERCASE ENUM TO TITLE CASE ENUM")
print("=" * 60)
print(f"Database: {DATABASE_URL.split('@')[1] if '@' in DATABASE_URL else 'unknown'}")
print()

# Create database connection
engine = create_engine(DATABASE_URL)

try:
    with engine.connect() as conn:
        try:
            # Step 1: Check current column type
            print("Step 1: Checking current column type...")
            result = conn.execute(text("""
                SELECT udt_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = 'users' AND column_name = 'role'
            """))
            row = result.fetchone()
            
            if not row:
                print("ERROR: users.role column not found!")
                sys.exit(1)
            
            udt_name, data_type = row
            print(f"  Current type: {udt_name} ({data_type})")
            conn.commit()  # Commit the SELECT transaction
            
            # Step 2: Check current role values
            print("\nStep 2: Checking current role values...")
            result = conn.execute(text("""
                SELECT DISTINCT role, COUNT(*) as count 
                FROM users 
                GROUP BY role 
                ORDER BY role
            """))
            current_roles = result.fetchall()
            print("  Current role distribution:")
            for role_row in current_roles:
                print(f"    '{role_row[0]}': {role_row[1]} users")
            conn.commit()  # Commit the SELECT transaction
            
            # Step 3: Convert ENUM to VARCHAR (temporary, to allow updates)
            print("\nStep 3: Converting ENUM to VARCHAR (temporary)...")
            if udt_name not in ('character varying', 'varchar'):
                # Convert to VARCHAR first
                # DDL operations need to be committed immediately
                trans = conn.begin()
                try:
                    conn.execute(text("""
                        ALTER TABLE users 
                        ALTER COLUMN role TYPE VARCHAR(50) 
                        USING role::text
                    """))
                    trans.commit()
                    print("  Converted to VARCHAR successfully.")
                except Exception as e:
                    trans.rollback()
                    raise
            else:
                print("  Column is already VARCHAR. Skipping conversion.")
            
            # Step 4: Update all role values to title case
            print("\nStep 4: Updating role values to title case...")
            role_mapping = {
                'admin': 'Admin',
                'pharma_admin': 'Pharma_admin',
                'mygrape_admin': 'Mygrape_admin',
                'manager': 'Manager',
                'user': 'User'
            }
            
            # Execute UPDATEs in a transaction
            trans = conn.begin()
            try:
                total_updated = 0
                for old_role, new_role in role_mapping.items():
                    result = conn.execute(
                        text("UPDATE users SET role = :new_role WHERE LOWER(role) = :old_role"),
                        {"new_role": new_role, "old_role": old_role}
                    )
                    count = result.rowcount
                    if count > 0:
                        print(f"  Updated {count} rows: '{old_role}' → '{new_role}'")
                        total_updated += count
                
                trans.commit()
                
                if total_updated == 0:
                    print("  No rows needed updating (already in title case).")
                else:
                    print(f"  Total rows updated: {total_updated}")
            except Exception as e:
                trans.rollback()
                raise
            
            # Step 5: Drop old ENUM type if it exists
            print("\nStep 5: Dropping old ENUM type (if exists)...")
            trans = conn.begin()
            try:
                result = conn.execute(text("""
                    SELECT EXISTS (
                        SELECT 1 FROM pg_type WHERE typname = 'user_role'
                    )
                """))
                enum_exists = result.fetchone()[0]
                trans.commit()
            except Exception as e:
                trans.rollback()
                raise
            
            if enum_exists:
                # Check if any columns are using it
                trans = conn.begin()
                try:
                    result = conn.execute(text("""
                        SELECT COUNT(*) FROM information_schema.columns 
                        WHERE udt_name = 'user_role'
                    """))
                    columns_using_enum = result.fetchone()[0]
                    trans.commit()
                except Exception as e:
                    trans.rollback()
                    raise
                
                if columns_using_enum > 0:
                    print(f"  Found {columns_using_enum} column(s) still using user_role ENUM.")
                    print("  This should be 0 after VARCHAR conversion. Continuing...")
                
                trans = conn.begin()
                try:
                    conn.execute(text("DROP TYPE user_role CASCADE"))
                    trans.commit()
                    print("  Old ENUM type dropped successfully.")
                except ProgrammingError as e:
                    trans.rollback()
                    print(f"  Warning: Could not drop old ENUM: {e}")
                    print("  Continuing anyway...")
            else:
                print("  No old ENUM type found. Skipping.")
            
            # Step 6: Create new ENUM type with title case values
            print("\nStep 6: Creating new ENUM type with title case values...")
            trans = conn.begin()
            try:
                conn.execute(text("""
                    CREATE TYPE user_role AS ENUM (
                        'Admin',
                        'Pharma_admin',
                        'Mygrape_admin',
                        'Manager',
                        'User'
                    )
                """))
                trans.commit()
                print("  ENUM type created successfully.")
            except Exception as e:
                trans.rollback()
                raise
            
            # Step 7: Verify all data is valid for new ENUM
            print("\nStep 7: Verifying data compatibility...")
            trans = conn.begin()
            try:
                result = conn.execute(text("""
                    SELECT DISTINCT role 
                    FROM users 
                    WHERE role NOT IN ('Admin', 'Pharma_admin', 'Mygrape_admin', 'Manager', 'User')
                """))
                invalid_roles = result.fetchall()
                trans.commit()
            except Exception as e:
                trans.rollback()
                raise
            
            if invalid_roles:
                print(f"  ERROR: Found {len(invalid_roles)} invalid role values:")
                for row in invalid_roles:
                    print(f"    - '{row[0]}'")
                print("  Cannot proceed with ENUM conversion.")
                print("  Please update these values to title case first.")
                sys.exit(1)
            
            print("  All role values are valid for new ENUM.")
            
            # Step 8: Convert VARCHAR back to ENUM
            print("\nStep 8: Converting VARCHAR to ENUM...")
            trans = conn.begin()
            try:
                conn.execute(text("""
                    ALTER TABLE users 
                    ALTER COLUMN role TYPE user_role 
                    USING role::user_role
                """))
                trans.commit()
                print("  Column converted to ENUM successfully.")
            except Exception as e:
                trans.rollback()
                raise
            
            # Step 9: Verify final state
            print("\nStep 9: Verifying final state...")
            trans = conn.begin()
            try:
                result = conn.execute(text("""
                    SELECT udt_name, data_type 
                    FROM information_schema.columns 
                    WHERE table_name = 'users' AND column_name = 'role'
                """))
                row = result.fetchone()
                final_udt_name, final_data_type = row
                trans.commit()
            except Exception as e:
                trans.rollback()
                raise
            
            print(f"  Final type: {final_udt_name} ({final_data_type})")
            
            if final_udt_name != 'user_role':
                print("  ERROR: Conversion failed!")
                sys.exit(1)
            
            # Step 10: Show final role distribution
            print("\nStep 10: Final role distribution:")
            trans = conn.begin()
            try:
                result = conn.execute(text("""
                    SELECT role, COUNT(*) as count 
                    FROM users 
                    GROUP BY role 
                    ORDER BY role
                """))
                for row in result:
                    print(f"  {row[0]}: {row[1]} users")
                trans.commit()
            except Exception as e:
                trans.rollback()
                raise
            
            print("\n" + "=" * 60)
            print("MIGRATION COMPLETED SUCCESSFULLY!")
            print("=" * 60)
            print("\nThe users.role column is now an ENUM type with title case values.")
            print("Next steps:")
            print("1. Pull the latest code (with normalization logic)")
            print("2. Restart your application server")
            print("3. Test user registration with different case inputs")
            
        except Exception as e:
            print(f"\nERROR: Migration failed: {e}")
            import traceback
            traceback.print_exc()
            print("\nSome changes may have been applied. Please check the database state.")
            sys.exit(1)

except Exception as e:
    print(f"\nERROR: Could not connect to database: {e}")
    sys.exit(1)

finally:
    engine.dispose()

