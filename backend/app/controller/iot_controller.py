"""
IoT API Controller
Thin controller layer for IoT provider endpoints
All business logic is in IoTService
"""

import logging
from fastapi import APIRouter, HTTPException, Path, Depends, Response
from typing import List, Dict, Any, Optional
import json

from ..service.iot_service import IoTService
from ..schemas.iot_schema import (
    DeviceResponse,
    DeviceListResponse,
    DeviceUpdateRequest,
    DeviceAlertPresetsRequest,
    DeviceGenerateReportRequest,
    ShipmentCreateRequest,
    ShipmentResponse,
    ShipmentStatusResponse,
    ShipmentListResponse,
    AlertPresetResponse,
    AlertPresetListResponse,
    AlertPresetCreateRequest,
    AlertPresetUpdateRequest,
    WebhookCreateRequest,
    WebhookResponse
)
from ..exceptions.custom_exceptions import AppException
from ..constants.messages import ErrorMessages
from ..constants.http_status import HTTPStatus
from ..config.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/iot",
    tags=["IoT API"]
)


def get_iot_service() -> IoTService:
    """Dependency to get IoT service instance (singleton)"""
    return IoTService.get_instance()


def _handle_service_error(e: Exception, operation: str) -> None:
    """Common error handler for service exceptions"""
    if isinstance(e, AppException):
        raise
    logger.error(f"Unexpected error {operation}: {e}")
    raise HTTPException(
        status_code=HTTPStatus.INTERNAL_SERVER_ERROR,
        detail=f"{ErrorMessages.INTERNAL_SERVER_ERROR}: {str(e)}"
    )


# ============================================
# DEVICE ENDPOINTS
# ============================================

@router.get("/devices")
def get_all_devices(service: IoTService = Depends(get_iot_service)):
    """
    Get all devices/trackers from IoT provider
    Returns the raw response from IoT API to preserve all fields
    """
    try:
        devices = service.get_all_devices()
        return {"devices": devices, "total": len(devices)}
    except Exception as e:
        _handle_service_error(e, "getting devices")


@router.get("/devices/{device_id}")
def get_device(
    device_id: str = Path(..., description="Device ID"),
    service: IoTService = Depends(get_iot_service)
):
    """
    Get a specific device by ID
    Returns the raw response from IoT API to preserve all fields
    """
    try:
        return service.get_device(device_id)
    except Exception as e:
        _handle_service_error(e, f"getting device {device_id}")


@router.put("/devices/{device_id}")
def update_device(
    device_id: str = Path(..., description="Device ID"),
    request: Optional[DeviceUpdateRequest] = None,
    service: IoTService = Depends(get_iot_service)
):
    """
    Update device settings
    Request body matches IoT API structure (all fields optional):
    {
        "description": "string",
        "powerButtonEnabled": true,
        "gpsEnabled": true,
        "wifiEnabled": true,
        "measurementInterval": 0,
        "transmissionInterval": 0,
        "startupDelay": 0
    }
    Returns the raw response from IoT API to preserve all fields
    """
    try:
        update_data = {}
        
        if request:
            # Use Pydantic model's dict method to get only set fields
            update_data = request.dict(exclude_unset=True, exclude_none=True)
        
        return service.update_device(device_id, **update_data)
    except HTTPException:
        raise
    except Exception as e:
        _handle_service_error(e, f"updating device {device_id}")


@router.patch("/devices/{device_id}/add-alert-presets")
def add_device_alert_presets(
    request: DeviceAlertPresetsRequest,
    device_id: str = Path(..., description="Device ID"),
    service: IoTService = Depends(get_iot_service)
):
    """
    Add alert presets to a device
    
    Reference: https://developers.tive.com/docs/devices
    Endpoint: PATCH /public/v3/devices/{deviceId}/addAlertPresets
    
    Request body:
    {
        "alertPresetIds": [1234, 9876]
    }
    
    Returns the raw response from IoT API to preserve all fields
    """
    try:
        return service.add_device_alert_presets(device_id, request.alertPresetIds)
    except Exception as e:
        _handle_service_error(e, f"adding alert presets to device {device_id}")


@router.patch("/devices/{device_id}/remove-alert-presets")
def remove_device_alert_presets(
    request: DeviceAlertPresetsRequest,
    device_id: str = Path(..., description="Device ID"),
    service: IoTService = Depends(get_iot_service)
):
    """
    Remove alert presets from a device
    
    Reference: https://developers.tive.com/docs/devices
    Endpoint: PATCH /public/v3/devices/{deviceId}/removeAlertPresets
    
    Request body:
    {
        "alertPresetIds": [1234, 9876]
    }
    
    Returns the raw response from IoT API to preserve all fields
    """
    try:
        return service.remove_device_alert_presets(device_id, request.alertPresetIds)
    except Exception as e:
        _handle_service_error(e, f"removing alert presets from device {device_id}")


@router.post("/devices/{device_id}/generate-report")
def generate_device_report(
    device_id: str = Path(..., description="Device ID"),
    request: DeviceGenerateReportRequest = ...,
    service: IoTService = Depends(get_iot_service)
):
    """
    Generate a report of sensor data for the specified tracker
    
    Reference: https://developers.tive.com/docs/devices
    Endpoint: POST /public/v3/devices/{deviceId}/generateReport
    
    Creates a report of sensor data for the specified tracker.
    
    Required request body:
    {
        "Format": "CSV",
        "TimeZone": "UTC",
        "SensorData": ["Temperature", "Humidity", "Location"],
        "DateTimeStart": "2025-11-25T00:00:00Z",
        "DateTimeEnd": "2025-11-28T23:59:59Z"
    }
    
    Required fields:
    - Format: Report format (e.g., "CSV", "PDF", "JSON")
    - TimeZone: Time zone (e.g., "UTC", "America/New_York")
    - SensorData: List of sensor data types. Allowed values:
      Location, Temperature, Humidity, Pressure, Light, Motion, Battery,
      Acceleration, ExternalTemperature, TiltAngle, ProbeTemperature
    - DateTimeStart: Start date/time (ISO 8601 format, must be within past 3 months)
    
    Optional fields:
    - DateTimeEnd: End date/time (ISO 8601 format)
    
    Returns the raw response from IoT API to preserve all fields
    """
    try:
        # Use by_alias=False to ensure PascalCase field names (what Tive API expects)
        report_params = request.dict(exclude_unset=True, exclude_none=True, by_alias=False)
        logger.info(f"Parsed report parameters: {json.dumps(report_params, indent=2)}")
        
        report_result = service.generate_device_report(device_id, **report_params)
        
        # Check if response contains file content (binary data)
        if isinstance(report_result, dict) and 'content' in report_result and isinstance(report_result['content'], bytes):
            # Return file download
            content = report_result['content']
            content_type = report_result.get('content_type', 'application/octet-stream')
            filename = report_result.get('filename', f'report_{device_id}.csv')
            
            return Response(
                content=content,
                media_type=content_type,
                headers={
                    "Content-Disposition": f'attachment; filename="{filename}"'
                }
            )
        
        # Check if response contains download_url (server-side download failed, return URL for client)
        if isinstance(report_result, dict) and 'download_url' in report_result:
            return {
                "status": "accepted",
                "message": report_result.get('message', 'Report generation accepted. Please download from the provided URL.'),
                "download_url": report_result['download_url'],
                "status_code": 202
            }
        
        return report_result
    except HTTPException:
        raise
    except Exception as e:
        _handle_service_error(e, f"generating report for device {device_id}")


# ============================================
# SHIPMENT ENDPOINTS
# ============================================

@router.post("/shipments")
def create_shipment(
    request: ShipmentCreateRequest,
    service: IoTService = Depends(get_iot_service)
):
    """
    Create a new shipment in IoT provider
    Request body matches Tive API Swagger structure
    Note: API requires 'request' field even though Swagger doesn't show it
    Note: Shipment origin coordinates must match tracker location (Tive API validation)
    Returns the raw response from IoT API to preserve all fields
    """
    try:
        # Convert request to dict using by_alias=False to get PascalCase field names (what API expects)
        # Pydantic will accept camelCase input (via aliases) but output PascalCase (via field names)
        shipment_data = request.dict(exclude_unset=True, by_alias=False)
        
        # Handle devices array - convert deviceId to devices if needed
        if 'deviceId' in shipment_data and shipment_data['deviceId']:
            if 'devices' not in shipment_data or not shipment_data.get('devices'):
                shipment_data['devices'] = [shipment_data['deviceId']]
            shipment_data.pop('deviceId', None)
        
        # Convert ShipmentLegs list to dict format with PascalCase field names
        if 'ShipmentLegs' in shipment_data and isinstance(shipment_data['ShipmentLegs'], list):
            shipment_data['ShipmentLegs'] = [
                leg.dict(exclude_unset=True, by_alias=False) if hasattr(leg, 'dict') else leg 
                for leg in shipment_data['ShipmentLegs']
            ]
        
        # Add 'request' field (required by API even if Swagger doesn't show it)
        payload = {
            'request': {},
            **shipment_data
        }
        
        return service.create_shipment(**payload)
    except Exception as e:
        _handle_service_error(e, "creating shipment")


@router.get("/shipments")
def get_all_shipments(service: IoTService = Depends(get_iot_service)):
    """
    Get all shipments from IoT provider
    Returns the raw response from IoT API to preserve all fields
    """
    try:
        shipments = service.get_all_shipments()
        return {"shipments": shipments, "total": len(shipments)}
    except Exception as e:
        _handle_service_error(e, "getting shipments")


@router.get("/shipments/{shipment_id}")
def get_shipment(
    shipment_id: str = Path(..., description="Shipment ID"),
    service: IoTService = Depends(get_iot_service)
):
    """
    Get a specific shipment by ID
    Returns the raw response from IoT API to preserve all fields
    """
    try:
        return service.get_shipment(shipment_id)
    except Exception as e:
        _handle_service_error(e, f"getting shipment {shipment_id}")


@router.get("/shipments/{shipment_id}/status")
def get_shipment_status(
    shipment_id: str = Path(..., description="Shipment ID"),
    service: IoTService = Depends(get_iot_service)
):
    """
    Get shipment status information
    Returns the raw response from IoT API to preserve all fields
    """
    try:
        return service.get_shipment_status(shipment_id)
    except Exception as e:
        _handle_service_error(e, f"getting shipment status {shipment_id}")


# ============================================
# ALERT PRESET ENDPOINTS
# ============================================

@router.get("/alert-presets")
def get_alert_presets(service: IoTService = Depends(get_iot_service)):
    """
    Get all alert presets from IoT provider
    Returns the raw response from IoT API to preserve all fields
    """
    try:
        presets = service.get_alert_presets()
        return {"presets": presets, "total": len(presets)}
    except Exception as e:
        _handle_service_error(e, "getting alert presets")


@router.get("/alert-presets/{preset_id}")
def get_alert_preset(
    preset_id: str = Path(..., description="Alert preset ID"),
    service: IoTService = Depends(get_iot_service)
):
    """
    Get a specific alert preset by ID
    Returns the raw response from IoT API to preserve all fields
    """
    try:
        return service.get_alert_preset(preset_id)
    except Exception as e:
        _handle_service_error(e, f"getting alert preset {preset_id}")


@router.post("/alert-presets")
def create_alert_preset(
    alert_preset_request: AlertPresetCreateRequest,
    service: IoTService = Depends(get_iot_service)
):
    """
    Create a new alert preset - matches IoT API structure exactly
    Request body matches IoT API documentation:
    https://api.tive.com/public/v3/docs/index.html
    
    Returns the raw response from IoT API (alert preset ID as plain text or JSON)
    """
    try:
        # Convert request to dict, preserving all fields exactly as IoT API expects
        preset_data = alert_preset_request.dict(exclude_unset=True)
        
        # Remove request field if it's None or empty (Swagger docs may show it as optional)
        if 'request' in preset_data and (preset_data['request'] is None or preset_data['request'] == {}):
            preset_data.pop('request', None)
        
        # Convert nested trigger schemas to dicts if needed
        trigger_fields = [
            'temperatureTriggers', 'percentTriggers', 'arriveDepartTriggers',
            'intervalTriggers', 'shockLightTriggers', 'geofenceTriggers',
            'shipmentInboundTriggers', 'booleanTriggers', 'tiltTriggers'
        ]
        
        for field in trigger_fields:
            if field in preset_data and preset_data[field] is not None:
                preset_data[field] = [
                    trigger.dict(exclude_unset=True) if hasattr(trigger, 'dict') else trigger
                    for trigger in preset_data[field]
                ]
        
        return service.create_alert_preset(**preset_data)
    except Exception as e:
        _handle_service_error(e, "creating alert preset")


@router.put("/alert-presets/{preset_id}")
def update_alert_preset(
    preset_id: str = Path(..., description="Alert preset ID"),
    request: Optional[AlertPresetUpdateRequest] = None,
    service: IoTService = Depends(get_iot_service)
):
    """
    Update an alert preset - matches IoT API structure exactly
    Request body matches IoT API documentation:
    https://api.tive.com/public/v3/docs/index.html
    
    Returns the raw response from IoT API to preserve all fields
    """
    try:
        update_data = {}
        if request:
            # Convert request to dict, preserving all fields exactly as IoT API expects
            update_data = request.dict(exclude_unset=True, exclude_none=True)
            
            # Convert nested trigger schemas to dicts if needed
            trigger_fields = [
                'temperatureTriggers', 'percentTriggers', 'arriveDepartTriggers',
                'intervalTriggers', 'shockLightTriggers', 'geofenceTriggers',
                'shipmentInboundTriggers', 'booleanTriggers', 'tiltTriggers'
            ]
            
            has_triggers = False
            for field in trigger_fields:
                if field in update_data and update_data[field] is not None:
                    # Filter out empty arrays
                    if isinstance(update_data[field], list) and len(update_data[field]) > 0:
                        has_triggers = True
                        update_data[field] = [
                            trigger.dict(exclude_unset=True, exclude_none=True) if hasattr(trigger, 'dict') else trigger
                            for trigger in update_data[field]
                        ]
                    else:
                        # Remove empty arrays
                        update_data.pop(field, None)
            
            # Tive API requires at least one trigger when updating alert presets
            if not has_triggers:
                raise HTTPException(
                    status_code=HTTPStatus.BAD_REQUEST,
                    detail="At least one trigger must be specified when updating an alert preset. Include at least one of: temperatureTriggers, percentTriggers, arriveDepartTriggers, intervalTriggers, shockLightTriggers, geofenceTriggers, shipmentInboundTriggers, booleanTriggers, or tiltTriggers"
                )
        
        # Ensure at least one field is being updated
        if not update_data:
            raise HTTPException(
                status_code=HTTPStatus.BAD_REQUEST,
                detail="At least one field must be provided for update"
            )
        
        return service.update_alert_preset(preset_id, **update_data)
    except Exception as e:
        _handle_service_error(e, f"updating alert preset {preset_id}")


# ============================================
# WEBHOOK ENDPOINTS
# ============================================

@router.post("/webhooks")
def create_webhook(
    request: WebhookCreateRequest,
    service: IoTService = Depends(get_iot_service)
):
    """
    Create a new webhook in Tive API
    
    Reference: https://api.tive.com/public/v3/docs/index.html
    Endpoint: POST /public/v3/webhooks
    
    Request body matches Tive API Swagger structure:
    {
        "name": "MyGrape Webhook",
        "url": "{WEBHOOK_URL from .env}",
        "description": "Webhook for receiving Tive events",
        "version": "1.0",
        "template": "",
        "headers": [
            {
                "key": "Authorization",
                "value": "Bearer token"
            }
        ],
        "accountIds": [9104],
        "httpMethod": "POST",
        "contentType": "application/json",
        "enabled": true,
        "applyToAllTrackers": true,
        "applyToAllShipments": true,
        "applyToAllAlertPresets": true
    }
    
    Returns the raw response from IoT API to preserve all fields
    """
    try:
        # Convert request to dict using by_alias=True to preserve camelCase field names
        webhook_data = request.dict(exclude_unset=True, by_alias=True)
        
        # Convert headers list to dicts if needed
        if 'headers' in webhook_data and webhook_data['headers']:
            webhook_data['headers'] = [
                header.dict(exclude_unset=True) if hasattr(header, 'dict') else header
                for header in webhook_data['headers']
            ]
        
        return service.create_webhook(**webhook_data)
    except Exception as e:
        _handle_service_error(e, "creating webhook")


@router.get("/webhooks")
def get_webhooks(service: IoTService = Depends(get_iot_service)):
    """
    Get all webhooks from Tive API
    
    Reference: https://api.tive.com/public/v3/docs/index.html
    Endpoint: GET /public/v3/webhooks
    
    Returns the raw response from IoT API to preserve all fields
    """
    try:
        webhooks = service.get_webhooks()
        return {"webhooks": webhooks, "total": len(webhooks)}
    except Exception as e:
        _handle_service_error(e, "getting webhooks")


@router.delete("/webhooks/{webhook_id}")
def delete_webhook(
    webhook_id: str = Path(..., description="Webhook ID"),
    service: IoTService = Depends(get_iot_service)
):
    """
    Delete a webhook from Tive API
    
    Reference: https://api.tive.com/public/v3/docs/index.html
    Endpoint: DELETE /public/v3/webhooks/{webhookId}
    
    Returns the raw response from IoT API to preserve all fields
    """
    try:
        return service.delete_webhook(webhook_id)
    except Exception as e:
        _handle_service_error(e, f"deleting webhook {webhook_id}")


@router.get("/webhooks/status")
def webhook_status():
    """
    Quick status check for webhook endpoint
    
    Returns basic information about webhook reception status.
    Use this to quickly check if webhooks are being received.
    
    Returns:
    - Whether webhook endpoint is active
    - Total webhooks received
    - Last received timestamp
    """
    try:
        from pathlib import Path
        
        webhook_log_file = Path("logs/webhooks/webhook_log.jsonl")
        
        if not webhook_log_file.exists():
            return {
                "endpoint_active": True,
                "webhook_url": settings.webhook_url,
                "webhooks_received": False,
                "total_received": 0,
                "last_received_at": None,
                "message": "Endpoint is ready but no webhooks received yet"
            }
        
        # Count total webhooks
        total_count = 0
        last_received_at = None
        
        with open(webhook_log_file, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        webhook_entry = json.loads(line)
                        total_count += 1
                        last_received_at = webhook_entry.get('received_at')
                    except json.JSONDecodeError:
                        continue
        
        return {
            "endpoint_active": True,
            "webhook_url": settings.webhook_url,
            "webhooks_received": total_count > 0,
            "total_received": total_count,
            "last_received_at": last_received_at,
            "message": f"Endpoint is active. {total_count} webhook(s) received." if total_count > 0 else "Endpoint is ready but no webhooks received yet"
        }
        
    except Exception as e:
        logger.error(f"Error checking webhook status: {e}", exc_info=True)
        return {
            "endpoint_active": True,
            "webhook_url": settings.webhook_url,
            "error": str(e),
            "message": "Error checking webhook status"
        }

