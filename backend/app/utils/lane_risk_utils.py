"""
Lane Risk Assessment Utilities
Contains utility functions and scheduled tasks for lane risk assessment
"""
import asyncio
import logging
from datetime import datetime, timezone, time, timedelta

from app.service.lane_risk_service import _get_live_lpi_timeliness_map, _get_live_lpi_overall_map

logger = logging.getLogger(__name__)


async def schedule_daily_lpi_fetch():
    """
    Schedule daily World Bank LPI data fetch at midnight (00:00 UTC).
    Fetches both Timeliness and Overall LPI data.
    
    This runs as a background task and automatically refreshes LPI data
    from the World Bank API every day at midnight UTC.
    """
    async def fetch_lpi_data_at_midnight():
        """Fetch LPI data at midnight"""
        while True:
            try:
                now = datetime.now(timezone.utc)
                
                # Calculate next midnight UTC (always tomorrow at 00:00:00)
                next_midnight = datetime.combine(
                    now.date() + timedelta(days=1),
                    time(0, 0, 0),
                    timezone.utc
                )
                
                wait_seconds = (next_midnight - now).total_seconds()
                logger.info(f"World Bank LPI daily fetch scheduled for {next_midnight.strftime('%Y-%m-%d %H:%M:%S')} UTC "
                           f"(in {wait_seconds/3600:.1f} hours)")
                
                await asyncio.sleep(wait_seconds)
                
                # Fetch LPI data at midnight
                logger.info("Starting scheduled World Bank LPI data fetch at midnight...")
                try:
                    # Force refresh to get latest data
                    timeliness_map = _get_live_lpi_timeliness_map(force_refresh=True)
                    overall_map = _get_live_lpi_overall_map(force_refresh=True)
                    
                    if timeliness_map:
                        logger.info(f"World Bank LPI Timeliness data fetched: {len(timeliness_map)} countries")
                    if overall_map:
                        logger.info(f"World Bank LPI Overall data fetched: {len(overall_map)} countries")
                    
                    logger.info("World Bank LPI daily fetch completed successfully")
                except Exception as e:
                    logger.error(f"Error during scheduled World Bank LPI fetch: {e}", exc_info=True)
                
            except Exception as e:
                logger.error(f"Error in LPI fetch scheduler: {e}", exc_info=True)
                # Wait 1 hour before retrying on error
                await asyncio.sleep(3600)
    
    # Start the scheduler
    await fetch_lpi_data_at_midnight()

