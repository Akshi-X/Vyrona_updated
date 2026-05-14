"""
ARC IVF autorun scheduler
Runs ARC IVF storage sync daily at 00:00 when ARC_AUTORUN is enabled.
"""

import asyncio
import logging
from datetime import datetime, timedelta

from app.config.database import SessionLocal
from app.service.IVF.arc_ivf_service import sync_arc_ivf_storage

logger = logging.getLogger(__name__)


async def schedule_arc_ivf_storage_midnight() -> None:
    """
    Schedule ARC IVF storage sync to run every day at midnight (00:00).
    """
    while True:
        try:
            now = datetime.now()
            next_midnight = datetime.combine(
                now.date() + timedelta(days=1),
                datetime.min.time()
            )
            wait_seconds = max(1, int((next_midnight - now).total_seconds()))

            logger.info(
                "ARC autorun scheduled for %s (in %.2f hours)",
                next_midnight.strftime("%Y-%m-%d %H:%M:%S"),
                wait_seconds / 3600,
            )

            await asyncio.sleep(wait_seconds)

            logger.info("Starting scheduled ARC IVF midnight sync...")
            db = SessionLocal()
            try:
                result = await asyncio.to_thread(sync_arc_ivf_storage, db, None)
                logger.info(
                    "Scheduled ARC IVF sync completed | status=%s errorCode=%s items=%s",
                    result.get("status"),
                    result.get("errorCode"),
                    len(result.get("storageList", []) or []),
                )
            finally:
                db.close()

        except Exception as e:
            logger.error(f"Error in ARC autorun scheduler: {e}", exc_info=True)
            await asyncio.sleep(60)
