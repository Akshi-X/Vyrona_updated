"""
Webhook Consumer Service
Handles incoming webhook data from Tive API

This service processes webhook events received from Tive and can be extended
to handle specific event types, store data, trigger notifications, etc.
"""

import logging
import json
import os
from typing import Dict, Any, Optional
from datetime import datetime
from pathlib import Path

logger = logging.getLogger(__name__)

# Directory to store webhook data files
WEBHOOK_DATA_DIR = Path("logs/webhooks")
WEBHOOK_DATA_DIR.mkdir(parents=True, exist_ok=True)


class WebhookConsumerService:
    """Service to consume and process webhook data from Tive API"""
    
    def __init__(self):
        """Initialize webhook consumer service"""
        pass
    
    def process_webhook(self, webhook_data: Dict[str, Any], client_ip: Optional[str] = None) -> Dict[str, Any]:
        """
        Process incoming webhook data from Tive
        
        Args:
            webhook_data: The webhook payload from Tive
            client_ip: The IP address of the client (for verification)
            
        Returns:
            Dict with processing result
        """
        try:
            # Log webhook receipt
            logger.info(f"Processing webhook from IP: {client_ip}")
            logger.info(f"Webhook data: {json.dumps(webhook_data, indent=2)}")
            
            # Save webhook data to file for easy viewing
            self._save_webhook_to_file(webhook_data, client_ip)
            
            # Extract event type if available
            event_type = webhook_data.get('event') or webhook_data.get('type') or webhook_data.get('eventType')
            
            if event_type:
                logger.info(f"Webhook event type: {event_type}")
                # Route to specific handler based on event type
                return self._handle_event_type(event_type, webhook_data)
            else:
                # Generic webhook processing
                return self._handle_generic_webhook(webhook_data)
                
        except Exception as e:
            logger.error(f"Error processing webhook: {e}", exc_info=True)
            return {
                "status": "error",
                "message": f"Error processing webhook: {str(e)}",
                "timestamp": datetime.now().isoformat()
            }
    
    def _handle_event_type(self, event_type: str, webhook_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Route webhook to specific handler based on event type
        
        Args:
            event_type: The type of event (e.g., "ShipmentStatusChanged", "DeviceAlert", etc.)
            webhook_data: The webhook payload
            
        Returns:
            Dict with processing result
        """
        # Map event types to handlers
        handlers = {
            "ShipmentStatusChanged": self._handle_shipment_status_changed,
            "DeviceAlert": self._handle_device_alert,
            "DeviceLocationUpdate": self._handle_device_location_update,
            "TemperatureAlert": self._handle_temperature_alert,
            # Add more event types as needed
        }
        
        handler = handlers.get(event_type, self._handle_generic_webhook)
        return handler(webhook_data)
    
    def _handle_shipment_status_changed(self, webhook_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Handle shipment status changed event
        
        Args:
            webhook_data: Webhook payload containing shipment status information
            
        Returns:
            Dict with processing result
        """
        logger.info("Processing ShipmentStatusChanged event")
        
        # Extract shipment information
        shipment_id = webhook_data.get('shipmentId') or webhook_data.get('shipment_id')
        status = webhook_data.get('status')
        
        logger.info(f"Shipment {shipment_id} status changed to: {status}")
        
        # TODO: Add your business logic here
        # Examples:
        # - Update shipment status in database
        # - Send notifications to relevant users
        # - Trigger downstream processes
        # - Update patient records if shipment is related to patient
        
        return {
            "status": "processed",
            "event_type": "ShipmentStatusChanged",
            "shipment_id": shipment_id,
            "new_status": status,
            "timestamp": datetime.now().isoformat()
        }
    
    def _handle_device_alert(self, webhook_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Handle device alert event
        
        Args:
            webhook_data: Webhook payload containing device alert information
            
        Returns:
            Dict with processing result
        """
        logger.info("Processing DeviceAlert event")
        
        # Extract device and alert information
        device_id = webhook_data.get('deviceId') or webhook_data.get('device_id')
        alert_type = webhook_data.get('alertType') or webhook_data.get('alert_type')
        alert_message = webhook_data.get('message') or webhook_data.get('alertMessage')
        
        logger.info(f"Device {device_id} alert: {alert_type} - {alert_message}")
        
        # TODO: Add your business logic here
        # Examples:
        # - Store alert in database
        # - Send notifications to relevant users
        # - Trigger escalation procedures
        # - Update device status
        
        return {
            "status": "processed",
            "event_type": "DeviceAlert",
            "device_id": device_id,
            "alert_type": alert_type,
            "message": alert_message,
            "timestamp": datetime.now().isoformat()
        }
    
    def _handle_device_location_update(self, webhook_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Handle device location update event
        
        Args:
            webhook_data: Webhook payload containing device location information
            
        Returns:
            Dict with processing result
        """
        logger.info("Processing DeviceLocationUpdate event")
        
        # Extract location information
        device_id = webhook_data.get('deviceId') or webhook_data.get('device_id')
        location = webhook_data.get('location') or webhook_data.get('coordinates')
        
        logger.info(f"Device {device_id} location updated: {location}")
        
        # TODO: Add your business logic here
        # Examples:
        # - Update device location in database
        # - Check geofence boundaries
        # - Update shipment tracking
        # - Trigger location-based alerts
        
        return {
            "status": "processed",
            "event_type": "DeviceLocationUpdate",
            "device_id": device_id,
            "location": location,
            "timestamp": datetime.now().isoformat()
        }
    
    def _handle_temperature_alert(self, webhook_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Handle temperature alert event
        
        Args:
            webhook_data: Webhook payload containing temperature alert information
            
        Returns:
            Dict with processing result
        """
        logger.info("Processing TemperatureAlert event")
        
        # Extract temperature information
        device_id = webhook_data.get('deviceId') or webhook_data.get('device_id')
        temperature = webhook_data.get('temperature')
        threshold = webhook_data.get('threshold')
        
        logger.info(f"Device {device_id} temperature alert: {temperature} (threshold: {threshold})")
        
        # TODO: Add your business logic here
        # Examples:
        # - Store temperature alert in database
        # - Send urgent notifications
        # - Trigger quality control processes
        # - Update shipment compliance status
        
        return {
            "status": "processed",
            "event_type": "TemperatureAlert",
            "device_id": device_id,
            "temperature": temperature,
            "threshold": threshold,
            "timestamp": datetime.now().isoformat()
        }
    
    def _handle_generic_webhook(self, webhook_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Handle generic webhook (unknown event type)
        
        Args:
            webhook_data: Webhook payload
            
        Returns:
            Dict with processing result
        """
        logger.info("Processing generic webhook")
        
        # TODO: Add your business logic here
        # Examples:
        # - Store webhook data in database for later analysis
        # - Log for audit purposes
        # - Forward to other systems
        
        return {
            "status": "processed",
            "event_type": "generic",
            "data": webhook_data,
            "timestamp": datetime.now().isoformat()
        }
    
    def store_webhook_data(self, webhook_data: Dict[str, Any]) -> Optional[str]:
        """
        Store webhook data (placeholder for database storage)
        
        Args:
            webhook_data: Webhook payload to store
            
        Returns:
            Stored record ID if successful, None otherwise
        """
        # TODO: Implement database storage
        # Example:
        # from app.models.webhook_model import WebhookLog
        # from app.config.database import get_db
        # 
        # db = next(get_db())
        # webhook_log = WebhookLog(
        #     event_type=webhook_data.get('event'),
        #     payload=json.dumps(webhook_data),
        #     received_at=datetime.now()
        # )
        # db.add(webhook_log)
        # db.commit()
        # return webhook_log.id
        
        logger.info("Webhook data storage not yet implemented")
        return None
    
    def _save_webhook_to_file(self, webhook_data: Dict[str, Any], client_ip: Optional[str] = None) -> None:
        """
        Save webhook data to a JSON file for easy viewing
        
        Args:
            webhook_data: The webhook payload
            client_ip: The IP address of the client
        """
        try:
            # Create filename with timestamp
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
            filename = f"webhook_{timestamp}.json"
            filepath = WEBHOOK_DATA_DIR / filename
            
            # Prepare data to save
            data_to_save = {
                "received_at": datetime.now().isoformat(),
                "client_ip": client_ip,
                "webhook_data": webhook_data
            }
            
            # Write to file
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(data_to_save, f, indent=2, ensure_ascii=False)
            
            logger.info(f"Webhook data saved to: {filepath}")
            
            # Also append to a single log file for easy tail viewing
            log_file = WEBHOOK_DATA_DIR / "webhook_log.jsonl"
            with open(log_file, 'a', encoding='utf-8') as f:
                f.write(json.dumps(data_to_save, ensure_ascii=False) + '\n')
                
        except Exception as e:
            logger.error(f"Failed to save webhook data to file: {e}", exc_info=True)

