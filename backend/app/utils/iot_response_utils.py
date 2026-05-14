"""
IoT API Response Utilities
Centralized response formatting for IoT/Tive API endpoints
"""

from typing import Dict, Any, Optional, List
import logging

logger = logging.getLogger(__name__)


def format_alert_preset_create_response(
    api_response: Any,
    request_payload: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Format alert preset creation response from Tive API
    
    Args:
        api_response: Raw response from Tive API (could be dict, string, or empty)
        request_payload: Original request payload sent to API
        
    Returns:
        Formatted success response with preset_id, status, message, and name
    """
    preset_id = None
    
    # Extract preset ID from various response formats
    if isinstance(api_response, dict):
        # Check for text/plain parsed response format first (has 'id' and 'raw_response')
        if 'raw_response' in api_response:
            preset_id = api_response.get('raw_response') or api_response.get('id')
        elif 'id' in api_response:
            # Standard parsed response with 'id' key
            preset_id = api_response.get('id')
        else:
            # Standard JSON response formats
            preset_id = api_response.get('preset_id') or api_response.get('presetId')
    elif isinstance(api_response, str):
        preset_id = api_response.strip()
    # Empty response (None or {}) - preset_id will remain None
    
    # Log for debugging only if preset_id extraction might be needed
    if preset_id is None and api_response:
        logger.debug("Could not extract preset_id from api_response: %s", type(api_response).__name__)
    
    response = {
        "status": "success",
        "message": "Alert preset created successfully"
    }
    
    if preset_id:
        response['preset_id'] = str(preset_id)
    
    if request_payload.get('name'):
        response['name'] = request_payload['name']
    
    return response


def format_alert_preset_update_response(
    preset_id: str,
    request_payload: Dict[str, Any],
    api_response: Optional[Dict[str, Any]] = None  # pylint: disable=unused-argument
) -> Dict[str, Any]:
    """
    Format alert preset update response from Tive API
    
    Args:
        preset_id: ID of the updated preset
        request_payload: Original request payload sent to API
        api_response: Raw response from Tive API (optional, usually empty for PUT)
                    Currently unused but kept for API consistency
        
    Returns:
        Formatted success response with preset_id, status, message, and updated_fields
    """
    response = {
        "preset_id": preset_id,
        "status": "success",
        "message": "Alert preset updated successfully"
    }
    
    # Extract updated fields from payload
    updated_fields = extract_updated_fields(request_payload)
    if updated_fields:
        response['updated_fields'] = updated_fields
        fields_str = ', '.join(updated_fields)
        response['message'] = f"Alert preset updated successfully. Updated fields: {fields_str}"
    
    return response


def format_empty_response(
    resource_type: str,
    resource_id: Optional[str] = None,
    operation: str = "completed",
    additional_data: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Format a meaningful response when API returns empty body
    
    Args:
        resource_type: Type of resource (e.g., "alert_preset", "device", "shipment")
        resource_id: ID of the resource (optional)
        operation: Operation performed (e.g., "created", "updated", "deleted")
        additional_data: Additional data to include in response
        
    Returns:
        Formatted success response
    """
    response = {
        "status": "success",
        "message": f"{resource_type.replace('_', ' ').title()} {operation} successfully"
    }
    
    if resource_id:
        # Map resource_type to appropriate ID field name
        id_field_map = {
            "alert_preset": "preset_id",
            "device": "device_id",
            "shipment": "shipment_id",
        }
        id_field = id_field_map.get(resource_type, f"{resource_type}_id")
        response[id_field] = resource_id
    
    if additional_data:
        response.update(additional_data)
    
    return response


def extract_updated_fields(payload: Dict[str, Any]) -> List[str]:
    """
    Extract human-readable list of updated fields from payload
    
    Args:
        payload: Request payload dictionary
        
    Returns:
        List of field names that were updated
    """
    # Filter out internal/metadata fields
    excluded_fields = {'request', '_comment'}
    
    fields = [
        field for field in payload.keys() 
        if field not in excluded_fields and payload[field] is not None
    ]
    
    return fields

