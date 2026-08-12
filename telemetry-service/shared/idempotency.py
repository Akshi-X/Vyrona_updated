"""
Idempotency module to prevent duplicate processing of Event Hub messages.
Uses Event Hub message properties (enqueued_time + offset) to create unique message IDs.
"""
import logging
import hashlib
from typing import Optional
from sqlalchemy import text

logger = logging.getLogger(__name__)


def generate_message_id(event_data) -> str:
    """
    Generate a unique message ID from Event Hub message properties.
    Uses enqueued_time + offset for uniqueness.

    Args:
        event_data: Event Hub event data object

    Returns:
        Unique message ID string
    """
    try:
        # Use Event Hub system properties for unique ID
        enqueued_time = event_data.enqueued_time.isoformat() if hasattr(event_data, 'enqueued_time') and event_data.enqueued_time else None
        offset = event_data.offset if hasattr(event_data, 'offset') else None
        sequence_number = event_data.sequence_number if hasattr(event_data, 'sequence_number') else None

        # Create unique ID from available properties
        if enqueued_time and offset:
            message_id = f"{enqueued_time}_{offset}"
        elif sequence_number:
            message_id = f"seq_{sequence_number}"
        else:
            # Fallback: hash the message body
            body = event_data.get_body()
            if isinstance(body, bytes):
                body_str = body.decode('utf-8', errors='ignore')
            else:
                body_str = str(body)
            message_id = hashlib.md5(body_str.encode()).hexdigest()

        return message_id
    except Exception as e:
        logger.warning(f"Error generating message ID, using fallback: {e}")
        # Fallback: hash the entire message
        body = event_data.get_body()
        if isinstance(body, bytes):
            body_str = body.decode('utf-8', errors='ignore')
        else:
            body_str = str(body)
        return hashlib.md5(body_str.encode()).hexdigest()


def try_mark_message_processing(db_session, message_id: str, payload_summary: Optional[str] = None) -> bool:
    """
    Atomically claim a message for processing (idempotency + concurrency guard in one step).

    Single INSERT ... ON CONFLICT DO NOTHING: no pre-check SELECT, no per-call
    CREATE TABLE (the processed_messages table is ensured once at startup via
    shared.database.ensure_processed_messages_table). Call this at the START
    of processing; if it returns False, the message was already committed as
    processed and should be skipped. If it returns True but processing later
    fails and the caller rolls back the transaction, this insert rolls back
    too, so a retry will correctly see the message as unprocessed.

    Args:
        db_session: Database session
        message_id: Unique message ID
        payload_summary: Optional summary of payload for debugging

    Returns:
        True if this call claimed the message (not already processed), False if already processed
    """
    try:
        insert_query = text("""
            INSERT INTO processed_messages (message_id, payload_summary)
            VALUES (:message_id, :payload_summary)
            ON CONFLICT (message_id) DO NOTHING
        """)
        result = db_session.execute(insert_query, {
            "message_id": message_id,
            "payload_summary": payload_summary
        })
        return result.rowcount > 0
    except Exception as e:
        logger.error(f"Error trying to mark message as processing: {e}")
        # On error, assume not processed to avoid losing messages
        return True
