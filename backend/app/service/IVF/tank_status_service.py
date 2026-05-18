"""
Tank Status Service
Handles efficient tank status updates based on quality loss data.
Only updates tank status when it changes from one value to another.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_

from ...constants.enums import CanisterStatus
from ...models.IVF.tank_model import Tank
from ...models.IVF.ivf_quality_log_model import IVFQualityLog
from ...service.redis_service import get_redis

logger = logging.getLogger(__name__)

# Configuration constants
STATUS_CALCULATION_WINDOW_MINUTES = 60  # Calculate status based on last hour of data
QUALITY_LOSS_THRESHOLD_CRITICAL = 15.0  # % quality loss for CRITICAL status
QUALITY_LOSS_THRESHOLD_RISK = 5.0  # % quality loss for RISK status


class TankStatusService:
    """
    Service for managing tank status updates efficiently.
    Only updates database when status actually changes from one value to another.
    """
    
    def __init__(self, db: Session):
        self.db = db
    
    def update_tank_status_if_needed(self, tank_id: int, force_update: bool = False) -> Optional[CanisterStatus]:
        """
        Update tank status based on recent quality loss data.
        Only updates if status has changed from one value to another.
        
        Args:
            tank_id: Tank ID to update status for
            force_update: Not used anymore, kept for backward compatibility
            
        Returns:
            New status if updated, None if no update was needed (status unchanged)
        """
        try:
            # Get tank
            tank = self.db.query(Tank).filter(Tank.tank_id == tank_id).first()
            if not tank:
                logger.warning(f"Tank {tank_id} not found")
                return None
            
            # Calculate new status based on recent quality logs
            new_status = self._calculate_tank_status(tank_id)
            
            # Only update if status changed from one value to another
            if new_status == tank.status:
                logger.debug(f"Tank {tank_id} status unchanged: {new_status.value} - skipping update")
                # Update last check time even if status didn't change
                self._update_last_check_time(tank_id)
                return None
            
            # Status has changed - update immediately
            old_status = tank.status
            tank.status = new_status
            tank.updated_at = datetime.now(timezone.utc)
            self.db.commit()
            self.db.refresh(tank)
            
            # Update last update time in Redis (for monitoring/logging)
            self._update_last_update_time(tank_id)
            
            logger.info(
                f"Updated tank {tank_id} status: {old_status.value} -> {new_status.value}"
            )
            
            return new_status
            
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error updating tank {tank_id} status: {str(e)}", exc_info=True)
            return None
    
    
    def _calculate_tank_status(self, tank_id: int) -> CanisterStatus:
        """
        Calculate tank status based on recent quality loss data.
        
        Logic:
        - CRITICAL: Average quality loss >= 15% in last hour OR any single reading >= 20%
        - RISK: Average quality loss >= 5% in last hour OR any single reading >= 10%
        - SAFE: Otherwise
        
        Args:
            tank_id: Tank ID to calculate status for
            
        Returns:
            Calculated CanisterStatus
        """
        try:
            # Get quality logs from last hour
            time_window_start = datetime.now(timezone.utc) - timedelta(minutes=STATUS_CALCULATION_WINDOW_MINUTES)
            
            quality_logs = self.db.query(IVFQualityLog).filter(
                and_(
                    IVFQualityLog.tank_id == tank_id,
                    IVFQualityLog.reading_timestamp >= time_window_start,
                    IVFQualityLog.quality_loss.isnot(None),
                    IVFQualityLog.quality_loss > 0
                )
            ).order_by(IVFQualityLog.reading_timestamp.desc()).all()
            
            if not quality_logs:
                # No quality loss in last hour, status is SAFE
                return CanisterStatus.SAFE
            
            # Check for critical single readings (immediate critical status)
            max_quality_loss = max(log.quality_loss for log in quality_logs if log.quality_loss)
            if max_quality_loss and max_quality_loss >= 20.0:
                logger.debug(f"Tank {tank_id}: Critical single reading detected ({max_quality_loss}%)")
                return CanisterStatus.CRITICAL
            
            # Calculate average quality loss
            total_loss = sum(log.quality_loss for log in quality_logs if log.quality_loss)
            avg_loss = total_loss / len(quality_logs) if quality_logs else 0.0
            
            # Check for critical average
            if avg_loss >= QUALITY_LOSS_THRESHOLD_CRITICAL:
                logger.debug(f"Tank {tank_id}: Critical average quality loss ({avg_loss:.2f}%)")
                return CanisterStatus.CRITICAL
            
            # Check for critical single reading threshold (lower threshold)
            if max_quality_loss and max_quality_loss >= 10.0:
                logger.debug(f"Tank {tank_id}: Risk-level single reading detected ({max_quality_loss}%)")
                return CanisterStatus.RISK
            
            # Check for risk average
            if avg_loss >= QUALITY_LOSS_THRESHOLD_RISK:
                logger.debug(f"Tank {tank_id}: Risk average quality loss ({avg_loss:.2f}%)")
                return CanisterStatus.RISK
            
            # Default to safe
            return CanisterStatus.SAFE
            
        except Exception as e:
            logger.error(f"Error calculating tank status for tank {tank_id}: {str(e)}", exc_info=True)
            # On error, return SAFE to be conservative
            return CanisterStatus.SAFE
    
    def _update_last_update_time(self, tank_id: int) -> None:
        """Update last status update time in Redis"""
        try:
            r = get_redis()
            last_update_key = f"tank_status_last_update:{tank_id}"
            current_time = datetime.now(timezone.utc).isoformat()
            # Store with 24 hour expiry (longer than cooldown period)
            r.setex(last_update_key, 86400, current_time)
        except Exception as e:
            logger.warning(f"Error updating last update time for tank {tank_id}: {e}")
    
    def _update_last_check_time(self, tank_id: int) -> None:
        """Update last status check time in Redis (even if status didn't change)"""
        try:
            r = get_redis()
            last_check_key = f"tank_status_last_check:{tank_id}"
            current_time = datetime.now(timezone.utc).isoformat()
            # Store with 24 hour expiry
            r.setex(last_check_key, 86400, current_time)
        except Exception as e:
            logger.warning(f"Error updating last check time for tank {tank_id}: {e}")
    
    def batch_update_tank_statuses(self, tank_ids: Optional[list] = None, force_update: bool = False) -> Dict[int, CanisterStatus]:
        """
        Batch update statuses for multiple tanks.
        Only updates tanks where status has changed.
        
        Args:
            tank_ids: List of tank IDs to update. If None, updates all active tanks.
            force_update: Not used anymore, kept for backward compatibility
            
        Returns:
            Dictionary mapping tank_id -> new status (only includes updated tanks)
        """
        try:
            if tank_ids is None:
                # Get all active tanks
                tanks = self.db.query(Tank).filter(Tank.is_active == True).all()
                tank_ids = [tank.tank_id for tank in tanks]
            
            updated_statuses = {}
            for tank_id in tank_ids:
                new_status = self.update_tank_status_if_needed(tank_id, force_update=force_update)
                if new_status:
                    updated_statuses[tank_id] = new_status
            
            logger.info(f"Batch updated {len(updated_statuses)} tank statuses")
            return updated_statuses
            
        except Exception as e:
            logger.error(f"Error in batch update: {str(e)}", exc_info=True)
            return {}
