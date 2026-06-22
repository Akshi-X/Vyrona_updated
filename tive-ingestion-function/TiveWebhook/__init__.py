import json
import logging
import sys
import os
import hmac
import hashlib
import base64
from pathlib import Path
from datetime import datetime

import azure.functions as func
from azure.eventhub import EventData, EventHubProducerClient

# Add parent directory to path to import config
sys.path.insert(0, str(Path(__file__).parent.parent))
from config import config

def verify_tive_signature(
    signature_header: str,
    request_body: str,
    secret_key: str
) -> bool:
    """
    Verify Tive webhook signature using HMAC SHA-256.

    Tive signature format: t=<timestamp>,v1=<signature_hash>
    Signature is calculated as: HMAC SHA-256(<timestamp>.<request_body>, secret_key)

    Args:
        signature_header: The x-tive-signature header value
        request_body: The raw request body as string
        secret_key: The webhook secret key from Tive configuration

    Returns:
        True if signature is valid, False otherwise
    """
    if not signature_header or not secret_key:
        return False

    try:
        # Parse signature: format is "t=<timestamp>,v1=<hash>"
        parts = signature_header.split(',')
        if len(parts) != 2:
            logging.warning(f"Invalid signature format: {signature_header}")
            return False

        timestamp = parts[0].split('=')[1] if '=' in parts[0] else None
        signature_hash = parts[1].split('=')[1] if '=' in parts[1] else None

        if not timestamp or not signature_hash:
            logging.warning(f"Could not parse timestamp or signature from: {signature_header}")
            return False

        # Reconstruct signed content: timestamp.payload
        signed_content = f"{timestamp}.{request_body}"

        # Calculate expected HMAC SHA-256
        expected_hash = base64.b64encode(
            hmac.new(
                secret_key.encode('utf-8'),
                signed_content.encode('utf-8'),
                hashlib.sha256
            ).digest()
        ).decode('utf-8')

        # Use constant-time comparison to prevent timing attacks
        return hmac.compare_digest(signature_hash, expected_hash)

    except Exception as ex:
        logging.exception(f"Error verifying Tive signature: {ex}")
        return False

def check_multiple_payloads_for_custom_iot(payload):
    """
    Check if the payload contains multiple IoT events.

    Args:
        payload: The JSON payload from the webhook

    Returns:
        bool: True if multiple IoT events are detected, False otherwise
    """

    # First check if the payload has source field and if it is CUSTOM_IOT
    # This is a quick check to avoid unnecessary processing for non-CUSTOM_IOT events
    if payload.get("source") != "CUSTOM_IOT":
        return False

    # Now we need to check if the "deviceid", "payload", and "lid_state"
    # fields are present as lists and have the same length
    device_ids = payload.get("deviceid")
    payloads = payload.get("payload")
    lid_states = payload.get("lid_state")

    if (
        isinstance(device_ids, list)
        and isinstance(payloads, list)
        and isinstance(lid_states, list)
        and len(device_ids) == len(payloads)
        and len(device_ids) == len(lid_states)
    ):
        return True

    return False


def normalize_custom_iot_payload_value(payload):
    """
    Normalize CUSTOM_IOT payload values.

    If payload is from CUSTOM_IOT and the payload value is greater than 500,
    divide it by 100.

    Args:
        payload: The JSON payload from the webhook

    Returns:
        dict: Updated payload with normalized value if applicable
    """
    if payload.get("source") != "CUSTOM_IOT":
        return payload

    payload_value = payload.get("payload")
    if isinstance(payload_value, (int, float)) and payload_value > 500:
        payload["payload"] = payload_value / 100

    return payload


def main(req: func.HttpRequest) -> func.HttpResponse:
    """
    Azure Function to handle Tive webhook requests.

    Validates the webhook key, parses the payload, enriches it with metadata,
    and sends it to Azure Event Hub.

    Args:
        req: HTTP request object containing webhook payload

    Returns:
        HTTP response with status code and message
    """
    logging.info("Tive webhook received")

    # Validate configuration on startup
    if not config.validate():
        logging.error("Configuration validation failed")
        return func.HttpResponse(
            "Service configuration error",
            status_code=500
        )

    # 1️⃣ Validate Authentication (Tive signature OR API key for testing)
    tive_signature = req.headers.get("x-tive-signature")
    api_key = req.headers.get("x-api-key")
    expected_key = config.get_webhook_key()
    webhook_secret = config.get_webhook_secret()

    # Log all headers for debugging (without sensitive values)
    all_headers = dict(req.headers)
    logging.info(f"Request headers received: {list(all_headers.keys())}")
    logging.info(f"x-tive-signature: {'Present' if tive_signature else 'Missing'}")
    logging.info(f"x-api-key: {'Present' if api_key else 'Missing'}")

    # Get raw request body for signature verification
    try:
        request_body = req.get_body().decode('utf-8')
        logging.info(f"Request body length: {len(request_body)} characters")
    except Exception as ex:
        logging.error(f"Failed to read request body: {ex}")
        request_body = ""

    # Validate: Either Tive signature (production) OR API key (testing)
    is_authenticated = False
    auth_method = None

    # Option 1: Verify Tive signature (for production webhooks from Tive)
    if tive_signature:
        if webhook_secret:
            is_authenticated = verify_tive_signature(
                tive_signature,
                request_body,
                webhook_secret
            )
            if is_authenticated:
                auth_method = "Tive signature"
                logging.info("Tive signature verified successfully")
            else:
                logging.warning("Tive signature verification failed")
        else:
            logging.warning("x-tive-signature present but TIVE_WEBHOOK_SECRET not configured")

    # Option 2: Validate API key (for manual testing with Postman)
    if not is_authenticated and api_key:
        if api_key == expected_key:
            is_authenticated = True
            auth_method = "API key"
            logging.info("API key validated successfully")
        else:
            logging.warning(
                f"Invalid x-api-key: received length={len(api_key)}, "
                f"expected length={len(expected_key)}"
            )

    # Temporary: Allow requests without auth for debugging (REMOVE IN PRODUCTION)
    # This helps identify what headers Tive is actually sending
    ALLOW_UNAUTHENTICATED_FOR_DEBUG = os.environ.get("ALLOW_UNAUTHENTICATED_FOR_DEBUG", "false").lower() == "true"

    if not is_authenticated:
        if ALLOW_UNAUTHENTICATED_FOR_DEBUG:
            logging.warning(
                "⚠️ DEBUG MODE: Allowing unauthenticated request. "
                f"Headers: {list(all_headers.keys())}, "
                f"x-tive-signature: {'present' if tive_signature else 'missing'}, "
                f"x-api-key: {'present' if api_key else 'missing'}"
            )
            is_authenticated = True
            auth_method = "DEBUG MODE (unauthenticated)"
        else:
            logging.warning(
                f"Unauthorized webhook attempt - "
                f"x-tive-signature: {'present' if tive_signature else 'missing'}, "
                f"x-api-key: {'present' if api_key else 'missing'}, "
                f"webhook_secret: {'configured' if webhook_secret else 'not configured'}"
            )
            return func.HttpResponse(
                "Unauthorized: Missing or invalid authentication",
                status_code=401
            )

    logging.info(f"Authentication successful using: {auth_method}")

    # 2️⃣ Parse JSON payload
    try:
        # Use the request body we already decoded, or parse from request
        if request_body:
            payload = json.loads(request_body)
        else:
            payload = req.get_json()
        logging.info(f"Received webhook payload: {json.dumps(payload, indent=2)}")
    except (ValueError, json.JSONDecodeError) as ex:
        logging.error(f"Invalid JSON payload: {ex}")
        return func.HttpResponse(
            "Invalid JSON",
            status_code=400
        )

    # 3️⃣ Normalize to a list so single objects and arrays are handled uniformly
    payload_list = payload if isinstance(payload, list) else [payload]
    if isinstance(payload, list):
        logging.info(f"Received array payload with {len(payload_list)} item(s)")

    # 4️⃣ Send to Event Hub
    try:
        events = []
        for item in payload_list:
            item = normalize_custom_iot_payload_value(item)
            if check_multiple_payloads_for_custom_iot(item):
                logging.info(
                    "Multiple IoT events detected in payload, processing each event separately"
                )
                device_ids = item.get("deviceid")
                iot_payloads = item.get("payload")
                lid_states = item.get("lid_state")
                other_keys = {
                    k: v
                    for k, v in item.items()
                    if k not in ("deviceid", "payload", "lid_state")
                }
                for device_id, iot_payload, lid_state in zip(
                    device_ids, iot_payloads, lid_states
                ):
                    individual_payload = {
                        **other_keys,
                        "deviceid": device_id,
                        "payload": iot_payload,
                        "lid_state": lid_state,
                    }
                    individual_payload = normalize_custom_iot_payload_value(
                        individual_payload
                    )
                    events.append(EventData(json.dumps({
                        "source": "TIVE",
                        "receivedAt": datetime.utcnow().isoformat(),
                        "payload": individual_payload,
                    })))
            else:
                events.append(EventData(json.dumps({
                    "source": "TIVE",
                    "receivedAt": datetime.utcnow().isoformat(),
                    "payload": item,
                })))

        producer = EventHubProducerClient.from_connection_string(
            conn_str=config.get_eventhub_connection_string(),
            eventhub_name=config.get_eventhub_name(),
        )

        with producer:
            event_data_batch = producer.create_batch()
            for event in events:
                event_data_batch.add(event)
            producer.send_batch(event_data_batch)
            logging.info(f"Successfully published {len(events)} event(s) to Event Hub")

    except Exception:
        logging.exception("Failed to publish event to Event Hub")
        return func.HttpResponse("Failed to push event", status_code=500)

    # 5️⃣ Immediate response to webhook
    return func.HttpResponse("Accepted", status_code=200)
