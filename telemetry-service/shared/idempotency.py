"""
Idempotency module to prevent duplicate processing of Event Hub messages.
Uses Event Hub message properties (enqueued_time + offset) to create unique message IDs.
"""
import logging
import hashlib
import json
from typing import Dict, Any, Optional
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


def check_message_processed(db_session, message_id: str) -> bool:
    """
    Check if a message has already been processed (idempotency check).
    Uses SELECT FOR UPDATE to prevent race conditions in concurrent processing.
    
    Args:
        db_session: Database session
        message_id: Unique message ID
        
    Returns:
        True if message was already processed, False otherwise
    """
    try:
        # Use a savepoint to avoid aborting the main transaction if table doesn't exist
        savepoint = db_session.begin_nested()
        try:
            # First, ensure the table exists (non-blocking)
            create_table_query = text("""
                CREATE TABLE IF NOT EXISTS processed_messages (
                    id BIGSERIAL PRIMARY KEY,
                    message_id VARCHAR(255) UNIQUE NOT NULL,
                    payload_summary TEXT,
                    processed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
                )
            """)
            db_session.execute(create_table_query)
            
            # Check in processed_messages table with FOR UPDATE to prevent race conditions
            # This locks the row if it exists, preventing concurrent processing
            check_query = text("""
                SELECT COUNT(*) 
                FROM processed_messages 
                WHERE message_id = :message_id
                FOR UPDATE
            """)
            result = db_session.execute(check_query, {"message_id": message_id})
            count = result.scalar() or 0
            savepoint.commit()
            return count > 0
        except Exception as e:
            # Rollback savepoint if any error occurs
            try:
                savepoint.rollback()
            except:
                pass
            # If table doesn't exist or other error, assume not processed
            logger.debug(f"Error checking processed messages (table may not exist): {e}")
            return False
    except Exception as e:
        # Outer exception handler - if savepoint fails, assume not processed
        logger.debug(f"Error in idempotency check: {e}")
        return False


def try_mark_message_processing(db_session, message_id: str, payload_summary: Optional[str] = None) -> bool:
    """
    Try to mark a message as being processed (idempotency - prevents concurrent processing).
    This should be called at the START of processing to prevent race conditions.
    
    Args:
        db_session: Database session
        message_id: Unique message ID
        payload_summary: Optional summary of payload for debugging
        
    Returns:
        True if message was successfully marked (not already processed), False if already processed
    """
    try:
        # Ensure processed_messages table exists
        create_table_query = text("""
            CREATE TABLE IF NOT EXISTS processed_messages (
                id BIGSERIAL PRIMARY KEY,
                message_id VARCHAR(255) UNIQUE NOT NULL,
                payload_summary TEXT,
                processed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
            )
        """)
        db_session.execute(create_table_query)
        
        # Try to insert message ID - if it already exists, ON CONFLICT will prevent insertion
        # This acts as a distributed lock - only one process can successfully insert
        insert_query = text("""
            INSERT INTO processed_messages (message_id, payload_summary)
            VALUES (:message_id, :payload_summary)
            ON CONFLICT (message_id) DO NOTHING
        """)
        result = db_session.execute(insert_query, {
            "message_id": message_id,
            "payload_summary": payload_summary
        })
        # If rowcount > 0, we successfully inserted (message not processed yet)
        # If rowcount == 0, message was already processed (ON CONFLICT prevented insert)
        return result.rowcount > 0
    except Exception as e:
        logger.error(f"Error trying to mark message as processing: {e}")
        # On error, assume not processed to avoid losing messages
        return True


def mark_message_processed(db_session, message_id: str, payload_summary: Optional[str] = None) -> bool:
    """
    Mark a message as processed (idempotency tracking).
    Uses ON CONFLICT DO NOTHING to handle race conditions gracefully.
    
    Args:
        db_session: Database session
        message_id: Unique message ID
        payload_summary: Optional summary of payload for debugging
        
    Returns:
        True if successful, False otherwise
    """
    try:
        # Ensure processed_messages table exists
        create_table_query = text("""
            CREATE TABLE IF NOT EXISTS processed_messages (
                id BIGSERIAL PRIMARY KEY,
                message_id VARCHAR(255) UNIQUE NOT NULL,
                payload_summary TEXT,
                processed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
            )
        """)
        db_session.execute(create_table_query)
        
        # Insert message ID with ON CONFLICT to handle race conditions
        # If another process already inserted it, this will silently succeed
        insert_query = text("""
            INSERT INTO processed_messages (message_id, payload_summary)
            VALUES (:message_id, :payload_summary)
            ON CONFLICT (message_id) DO NOTHING
        """)
        result = db_session.execute(insert_query, {
            "message_id": message_id,
            "payload_summary": payload_summary
        })
        # Check if insert actually happened (rowcount > 0) or was skipped due to conflict
        if result.rowcount == 0:
            logger.debug(f"Message {message_id} was already marked as processed (race condition handled)")
        return True
    except Exception as e:
        logger.error(f"Error marking message as processed: {e}")
        return False
