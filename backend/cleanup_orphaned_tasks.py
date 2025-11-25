"""
Script to clean up orphaned tasks (tasks with missing assignee or created_by users).
Run from backend directory: python cleanup_orphaned_tasks.py
"""
import sys
from sqlalchemy import text
from app.config.database import SessionLocal
from app.models.task_model import Tasks
from app.models.user_model import User

def cleanup_orphaned_tasks(dry_run=True):
    """
    Find and optionally delete orphaned tasks.
    
    Args:
        dry_run: If True, only report issues without deleting. If False, delete orphaned tasks.
    """
    db = SessionLocal()
    try:
        print("=" * 80)
        print("CLEANUP ORPHANED TASKS")
        print("=" * 80)
        print(f"Mode: {'DRY RUN (no changes)' if dry_run else 'LIVE (will delete)'}")
        print()
        
        # Find tasks with missing assignee
        all_tasks = db.query(Tasks).all()
        orphaned_tasks = []
        
        for task in all_tasks:
            assignee = db.query(User).filter(User.user_id == task.assignee_id).first()
            creator = db.query(User).filter(User.user_id == task.created_by_id).first()
            
            is_orphaned = False
            issues = []
            
            if not assignee:
                is_orphaned = True
                issues.append(f"Missing assignee: {task.assignee_id}")
            
            if not creator:
                is_orphaned = True
                issues.append(f"Missing creator: {task.created_by_id}")
            
            if is_orphaned:
                orphaned_tasks.append({
                    'task': task,
                    'issues': issues
                })
        
        print(f"Found {len(orphaned_tasks)} orphaned task(s):\n")
        
        for item in orphaned_tasks:
            task = item['task']
            print(f"Task ID {task.id}: {task.task_name}")
            print(f"  Patient ID: {task.patient_id}")
            for issue in item['issues']:
                print(f"  ⚠️  {issue}")
            print()
        
        if not dry_run and orphaned_tasks:
            print("Deleting orphaned tasks...")
            for item in orphaned_tasks:
                task = item['task']
                db.delete(task)
                print(f"  Deleted task ID {task.id}: {task.task_name}")
            
            db.commit()
            print(f"\n✅ Deleted {len(orphaned_tasks)} orphaned task(s)")
        elif orphaned_tasks:
            print("\n⚠️  Run with dry_run=False to actually delete these tasks")
            print("   Example: cleanup_orphaned_tasks(dry_run=False)")
        
        print("=" * 80)
        
    except Exception as e:
        db.rollback()
        print(f"\n❌ Error: {str(e)}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()


if __name__ == "__main__":
    # Run in dry-run mode by default
    dry_run = True
    if len(sys.argv) > 1 and sys.argv[1] == "--delete":
        response = input("⚠️  This will DELETE orphaned tasks. Continue? (yes/no): ")
        if response.lower() == "yes":
            dry_run = False
        else:
            print("Cancelled.")
            sys.exit(0)
    
    cleanup_orphaned_tasks(dry_run=dry_run)
