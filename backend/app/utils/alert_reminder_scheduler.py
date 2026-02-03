"""
Alert Reminder Scheduler
Sends reminder emails every hour for unacknowledged alerts
"""
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Set

from app.config.database import SessionLocal
from app.service.IVF.critical_alert_service import CriticalAlertService

logger = logging.getLogger(__name__)


async def schedule_alert_reminders():
    """
    Schedule hourly reminder emails for unacknowledged alerts.
    
    Runs every hour and sends reminder emails to:
    - User role: Alerts in their branch
    - Manager role: All alerts in all branches of their hospital
    """
    async def send_reminders_hourly():
        """Send reminder emails every hour"""
        while True:
            try:
                # Wait 1 hour before first run (or continue from last run)
                await asyncio.sleep(3600)  # 1 hour = 3600 seconds
                
                logger.info("Starting hourly alert reminder check...")
                db = SessionLocal()
                try:
                    service = CriticalAlertService(db)
                    # Call the synchronous method (it's actually async but we'll await it)
                    # If it's async, await it; if sync, call it directly
                    if asyncio.iscoroutinefunction(service.send_reminder_emails):
                        await service.send_reminder_emails()
                    else:
                        # Run in executor to avoid blocking the event loop for sync operations
                        loop = asyncio.get_event_loop()
                        await loop.run_in_executor(None, service.send_reminder_emails)
                    logger.info("Hourly alert reminder check completed successfully")
                except Exception as e:
                    logger.error(f"Error during hourly alert reminder check: {e}", exc_info=True)
                finally:
                    db.close()
                    
            except Exception as e:
                logger.error(f"Error in alert reminder scheduler: {e}", exc_info=True)
                # Wait 1 hour before retrying on error
                await asyncio.sleep(3600)
    
    # Start the scheduler
    await send_reminders_hourly()
