import json
import logging
import sys
from pathlib import Path
from typing import List

import azure.functions as func

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))
from config import config
from shared.database import (
    ensure_ln2_event_detection_columns,
    ensure_telemetry_table_exists,
)
from shared.publisher_logic import process_webhook_payload

logger = logging.getLogger(__name__)

# Initialize on first invocation (singleton pattern)
_initialized = False


def initialize():
    """Initialize database tables and connections on first invocation."""
    global _initialized
    if not _initialized:
        try:
            # Validate configuration
            if not config.validate():
                logger.error("Configuration validation failed")
                raise ValueError("Configuration validation failed")

            # Ensure database tables exist
            ensure_telemetry_table_exists()
            ensure_ln2_event_detection_columns()

            _initialized = True
            logger.info("TelemetryHook initialized successfully")
        except Exception as e:
            logger.error(f"Initialization failed: {e}", exc_info=True)
            raise


def main(eventhub_message: List[func.EventHubEvent]):
    """
    Azure Function that consumes messages from Event Hub, processes them using Publisher logic,
    and stores them in database and Redis.

    Optimizations:
    - Idempotency checks to prevent duplicate processing
    - Graceful error handling (non-critical operations don't fail entire function)
    - Connection pooling for database and Redis
    - Patient ID caching

    Args:
        eventhub_message: List of Event Hub events (cardinality: many)
    """
    logger.info(
        f"TelemetryHook triggered - processing {len(eventhub_message) if eventhub_message else 0} events"
    )

    try:
        # Initialize on first invocation (non-blocking - don't fail function if init fails)
        try:
            initialize()
        except Exception as init_error:
            logger.error(
                f"Initialization failed but continuing: {init_error}", exc_info=True
            )
            # Continue anyway - initialization will retry on next invocation

        processed_count = 0
        failed_count = 0

        # Check if we have any messages
        if not eventhub_message or len(eventhub_message) == 0:
            logger.warning("No Event Hub messages received in this batch")
            return

        # Process each event hub message
        for idx, event_data in enumerate(eventhub_message):
            try:
                # Parse the event hub message body
                body_str = event_data.get_body().decode("utf-8")
                body_json = json.loads(body_str)

                # Extract the payload from the body
                if "payload" in body_json:
                    payload = body_json["payload"]

                    if (
                        payload.get("source") == "CUSTOM_IOT"
                        or payload.get("source") == "CUSTOM-IOT"
                    ):
                        logger.info(f"Received Custom IoT Device Payload: {payload}")
                        payload["timestamp"] = body_json.get(
                            "receivedAt", None
                        )  # Add timestamp from outer body if available
                else:
                    # If no 'payload' field, use entire body as payload
                    payload = body_json

                device_id = (
                    payload.get("DeviceId") or payload.get("EntityName") or "Unknown"
                )

                # Process webhook payload using Publisher logic
                count = process_webhook_payload(event_data, payload)
                processed_count += count

                logger.info(
                    f"Processed message for DeviceId: {device_id} ({count} items)"
                )

            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse JSON from event hub message: {str(e)}")
                failed_count += 1
                continue
            except Exception as e:
                # Log error but continue processing other messages
                # Event Hub will retry failed messages automatically
                logger.error(
                    f"Error processing event hub message: {str(e)}", exc_info=True
                )
                failed_count += 1
                continue

        # Log summary
        total_messages = len(eventhub_message)
        if failed_count > 0:
            logger.warning(
                f"Processing complete: {processed_count} processed, {failed_count} failed out of {total_messages} messages"
            )

        # If all messages failed, raise to trigger Event Hub retry
        if failed_count == total_messages and total_messages > 0:
            raise Exception(f"All {total_messages} messages failed to process")

    except Exception as e:
        logger.error(f"Critical error in function execution: {str(e)}", exc_info=True)
        # Re-raise to trigger Event Hub retry mechanism
        raise
