"""
Alert API Client - Calls external CriticalAlertService API.
Non-blocking, non-critical - failures don't stop telemetry processing.
Uses background threading for fire-and-forget API calls.
"""
import logging
import json
import requests
import threading
from typing import Dict, Any, Optional, List
from datetime import datetime
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from config import config

logger = logging.getLogger(__name__)


def _get_internal_headers() -> Dict[str, str]:
    """Build headers with internal API key for service-to-service auth."""
    headers = {"Content-Type": "application/json"}
    if config.INTERNAL_API_KEY:
        headers["X-Internal-Api-Key"] = config.INTERNAL_API_KEY
    else:
        logger.warning("INTERNAL_API_KEY not configured — alert API calls will be rejected by dashboard-service")
    return headers


def _trigger_alert_email_sync(
    tank_id: int,
    quality_log_data: Dict[str, Any],
    occurred_at_str: str
) -> None:
    """
    Internal function that actually makes the HTTP API call (runs in background thread).
    """
    try:
        api_url = f"{config.ALERT_API_BASE_URL}{config.ALERT_API_ENDPOINT}"
        
        payload = {
            "tank_id": tank_id,
            "quality_log_data": quality_log_data,
            "occurred_at": occurred_at_str
        }
        
        response = requests.post(
            api_url,
            json=payload,
            timeout=config.ALERT_API_TIMEOUT,
            headers=_get_internal_headers()
        )
        
        if response.status_code == 200:
            logger.info(f"✓ Alert email triggered successfully for tank {tank_id}")
        else:
            logger.warning(
                f"Alert API returned non-200 status: {response.status_code} "
                f"for tank {tank_id}. Response: {response.text[:200]}"
            )
            
    except requests.exceptions.Timeout:
        logger.error(f"Alert API timeout for tank {tank_id} (timeout={config.ALERT_API_TIMEOUT}s)")
    except requests.exceptions.ConnectionError as e:
        logger.error(f"Alert API connection error for tank {tank_id}: {e}")
    except Exception as e:
        logger.error(f"Error calling alert API for tank {tank_id}: {e}", exc_info=True)


def trigger_immediate_alert_email(
    tank_id: int,
    quality_log_data: Dict[str, Any],
    occurred_at: datetime
) -> bool:
    """
    Trigger immediate alert email via external API (fire-and-forget, non-blocking).
    
    This function is called automatically when violations are detected in insert_ivf_quality_log().
    Uses background threading to avoid blocking telemetry processing.
    Same behavior as Publisher 7.py, but uses HTTP API instead of direct service call.
    
    Args:
        tank_id: Tank ID
        quality_log_data: Quality log data with violation flags
        occurred_at: Timestamp when violation occurred
        
    Returns:
        True immediately (fire-and-forget - actual API call happens in background)
    """
    try:
        # Convert datetime to ISO format string if needed
        occurred_at_str = occurred_at.isoformat() if isinstance(occurred_at, datetime) else occurred_at
        
        # Start background thread to call API (fire-and-forget)
        thread = threading.Thread(
            target=_trigger_alert_email_sync,
            args=(tank_id, quality_log_data, occurred_at_str),
            daemon=True  # Daemon thread - won't prevent function app from shutting down
        )
        thread.start()
        
        logger.info(f"✓ Triggered alert email API call for tank {tank_id} (background thread)")
        return True  # Return immediately - don't wait for API response
            
    except Exception as e:
        logger.error(f"Error starting alert email thread for tank {tank_id}: {e}", exc_info=True)
        return False

def _check_and_create_alerts_sync(
    tank_id: int,
    branch_id: Optional[int],
    send_notifications: bool
) -> None:
    """
    Internal function that actually makes the HTTP API call (runs in background thread).
    """
    try:
        api_url = f"{config.ALERT_API_BASE_URL}/api/internal/alerts/check-and-create"
        
        payload = {
            "tank_id": tank_id,
            "branch_id": branch_id,
            "send_notifications": send_notifications
        }
        
        # response = requests.post(
        #     api_url,
        #     json=payload,
        #     timeout=config.ALERT_API_TIMEOUT,
        #     headers=_get_internal_headers()
        # )
        
        # if response.status_code == 200:
        #     result = response.json()
        #     alerts = result.get("alerts", [])
        #     logger.info(f"✓ Created/updated {len(alerts)} alert records for tank {tank_id}")
        # else:
        #     logger.warning(
        #         f"Alert API returned non-200 status: {response.status_code} "
        #         f"for tank {tank_id}. Response: {response.text[:200]}"
        #     )
            
    except Exception as e:
        logger.error(f"Error calling alert check API for tank {tank_id}: {e}", exc_info=True)

def _check_and_create_kpi_alerts_sync(
        tank_id: int
):
    """
    Internal function that actually makes the HTTP API call (runs in background thread).
    """
    try:
        api_url = f"{config.ALERT_API_BASE_URL}/api/ivf/alerts/check_kpi"
        
        payload = {
            "tank_id": tank_id
        }
        
        response = requests.post(
            api_url,
            json=payload,
            timeout=config.ALERT_API_TIMEOUT,
            headers=_get_internal_headers()
        )
        
        if response.status_code == 200:
            result = response.json()
            alerts = result.get("alerts", [])
            logger.info(f"✓ Created/updated {len(alerts)} alert records for tank {tank_id}")
        else:
            logger.warning(
                f"Alert API returned non-200 status: {response.status_code} "
                f"for tank {tank_id}. Response: {response.text[:200]}"
            )
            
    except Exception as e:
        logger.error(f"Error calling alert check API for tank {tank_id}: {e}", exc_info=True)

def send_refill_detection_to_backend(
    tank_id: int,
    refill_data: Dict[str, Any],
    detected_at: datetime
) -> bool:
    """
    Send refill detection event to backend via external API (fire-and-forget, non-blocking).
    
    This function is called automatically when a refill is detected in insert_ivf_telemetry_data().
    Uses background threading to avoid blocking telemetry processing.
    
    Args:
        tank_id: Tank ID
        refill_data: Refill event data (e.g. weight change, duration)
        detected_at: Timestamp when refill was detected
    Returns:
        True immediately (fire-and-forget - actual API call happens in background)
    """
    try:
        api_url = f"{config.ALERT_API_BASE_URL}/api/internal/refill-detections"
        
        payload = {
            "tank_id": tank_id,
            "refill_weight": refill_data["refill_weight"],
            "detected_at": detected_at.isoformat() if isinstance(detected_at, datetime) else detected_at
        }
        
        # Start background thread to call API (fire-and-forget)
        thread = threading.Thread(
            target=_send_refill_detection_sync,
            args=(api_url, payload),
            daemon=True  # Daemon thread - won't prevent function app from shutting down
        )
        thread.start()
        
        logger.info(f"✓ Triggered refill detection API call for tank {tank_id} (background thread)")
        return True  # Return immediately - don't wait for API response
            
    except Exception as e:
        logger.error(f"Error starting refill detection thread for tank {tank_id}: {e}", exc_info=True)
        return False

def _send_refill_detection_sync(api_url: str, payload: Dict[str, Any]) -> None:
    """
    Internal function that actually makes the HTTP API call for refill detection (runs in background thread).
    """
    try:
        response = requests.post(
            api_url,
            json=payload,
            timeout=config.ALERT_API_TIMEOUT,
            headers=_get_internal_headers()
        )
        
        if response.status_code == 200:
            logger.info(f"✓ Refill detection sent successfully for tank {payload.get('tank_id')}")
        else:
            logger.warning(
                f"Refill detection API returned non-200 status: {response.status_code} "
                f"for tank {payload.get('tank_id')}. Response: {response.text[:200]}"
            )
            
    except requests.exceptions.Timeout:
        logger.error(f"Refill detection API timeout for tank {payload.get('tank_id')} (timeout={config.ALERT_API_TIMEOUT}s)")
    except requests.exceptions.ConnectionError as e:
        logger.error(f"Refill detection API connection error for tank {payload.get('tank_id')}: {e}")
    except Exception as e:
        logger.error(f"Error calling refill detection API for tank {payload.get('tank_id')}: {e}", exc_info=True)


def check_and_create_alerts(
    tank_id: int,
    branch_id: Optional[int] = None,
    send_notifications: bool = False,
    kpi_alerts: Optional[bool] = False,
) -> List[Dict[str, Any]]:
    """
    Check and create/update critical alert records via external API (fire-and-forget, non-blocking).
    
    This function is called automatically after successful commit in insert_ivf_telemetry_data().
    Uses background threading to avoid blocking telemetry processing.
    Same behavior as Publisher 7.py, but uses HTTP API instead of direct service call.
    
    Args:
        tank_id: Tank ID
        branch_id: Optional branch ID
        send_notifications: Whether to send notifications
        kpi_alerts: Set true if its for kpi alerts triggering
    Returns:
        Empty list immediately (fire-and-forget - actual API call happens in background)
    """
    try:
        thread = None

        # Different trigger for kpi_alert
        if kpi_alerts:
            thread = threading.Thread(
                target=_check_and_create_kpi_alerts_sync,
                args=[tank_id],
                daemon=True,
            )
        else:
            # Start background thread to call API (fire-and-forget)
            thread = threading.Thread(
                target=_check_and_create_alerts_sync,
                args=(tank_id, branch_id, send_notifications),
                daemon=True  # Daemon thread - won't prevent function app from shutting down
            )

        thread.start()
        
        logger.info(f"✓ Triggered alert check API call for tank {tank_id} (background thread)")
        return []  # Return immediately - don't wait for API response
            
    except Exception as e:
        logger.error(f"Error starting alert check thread for tank {tank_id}: {e}", exc_info=True)
        return []
