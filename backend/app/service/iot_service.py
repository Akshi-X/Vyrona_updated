"""IoT API Service - Handles authentication and API requests with automatic token refresh"""

import requests
import json
import base64
import logging
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta

from ..config.config import settings
from ..exceptions.custom_exceptions import (
    AppException,
    IoTAuthenticationFailedException,
    IoTAPIRequestFailedException,
    IoTGetDevicesFailedException,
    IoTGetDeviceFailedException,
    IoTUpdateDeviceFailedException,
    IoTCreateShipmentFailedException,
    IoTGetShipmentFailedException,
    IoTGetShipmentsFailedException,
    IoTGetAlertPresetsFailedException,
    IoTGetAlertPresetFailedException,
    IoTCreateAlertPresetFailedException,
    IoTUpdateAlertPresetFailedException,
    IoTAddDeviceAlertPresetsFailedException,
    IoTRemoveDeviceAlertPresetsFailedException,
    IoTGenerateDeviceReportFailedException,
)
from ..constants.error_codes import ERROR_CODES
from ..constants.messages import ErrorMessages
from ..constants.app_constants import (
    IOT_API_BASE_URL,
    IOT_API_TIMEOUT_SECONDS,
    IOT_TOKEN_EXPIRY_SECONDS,
    IOT_TOKEN_SAFETY_MARGIN_SECONDS,
    IOT_RESPONSE_PREVIEW_LENGTH,
    IOT_LONG_RESPONSE_PREVIEW_LENGTH,
    IOT_JWT_TOKEN_PARTS_COUNT,
    IOT_JWT_PAYLOAD_INDEX,
    IOT_BASE64_PADDING_MODULO,
    IOT_CONTENT_TYPE_TEXT_PLAIN,
    IOT_CONTENT_TYPE_JSON,
    IOT_CONTENT_TYPE_OCTET_STREAM,
    IOT_FILE_CONTENT_TYPES,
    IOT_ERROR_FIELDS,
    IOT_ERROR_FIELD_ERRORS,
    IOT_ERROR_FIELD_TRACE_ID,
    IOT_USER_AGENT
)
from ..constants.http_status import HTTPStatus
from ..utils.iot_response_utils import (
    format_alert_preset_create_response,
    format_alert_preset_update_response,
    format_empty_response
)

logger = logging.getLogger(__name__)

# Singleton instance
_service_instance: Optional['IoTService'] = None


class IoTService:
    """IoT API service with automatic token refresh (singleton pattern)"""
    
    def __init__(self):
        self.client_id = settings.IOT_CLIENT_ID
        self.client_secret = settings.IOT_CLIENT_SECRET
        self.account_id = settings.IOT_ACCOUNT_ID
        self.base_url = IOT_API_BASE_URL
        self.access_token: Optional[str] = None
        self.token_expires_at: Optional[datetime] = None
        self._validate_credentials()
    
    @classmethod
    def get_instance(cls) -> 'IoTService':
        """Get singleton instance of IoTService"""
        global _service_instance
        if _service_instance is None:
            _service_instance = cls()
        return _service_instance
    
    def _validate_credentials(self) -> None:
        """Validate credentials are provided"""
        if not self.client_id or not self.client_secret:
            logger.warning("IoT API credentials not configured. Set IOT_CLIENT_ID and IOT_CLIENT_SECRET in .env")
    
    def authenticate(self) -> Dict[str, Any]:
        """Authenticate with IoT API and get access token"""
        url = f"{self.base_url}/authenticate"
        data = {
            'client_id': self.client_id,
            'client_secret': self.client_secret,
            'grant_type': 'client_credentials'
        }
        headers = {'accept': 'text/plain'}
        
        try:
            logger.debug(f"Authenticating with IoT API: {url}")
            response = self._authenticate_with_retry(url, data, headers)
            result = self._parse_json_response(response)
            self._store_token(result)
            self._extract_account_id_from_token()
            logger.debug(f"Authentication successful. Token expires at {self.token_expires_at}")
            return result
            
        except requests.exceptions.HTTPError as e:
            self._handle_authentication_error(e)
        except Exception as e:
            logger.error(f"Unexpected error during authentication: {e}")
            raise IoTAuthenticationFailedException(reason=str(e))
    
    def _authenticate_with_retry(self, url: str, data: Dict[str, Any], headers: Dict[str, str]) -> requests.Response:
        """Try multipart/form-data, retry with form-urlencoded on 401"""
        response = requests.post(url, files=data, headers=headers, timeout=IOT_API_TIMEOUT_SECONDS)
        if response.status_code == HTTPStatus.UNAUTHORIZED:
            logger.debug("Multipart form-data returned 401, trying form-urlencoded...")
            response = requests.post(url, data=data, headers=headers, timeout=IOT_API_TIMEOUT_SECONDS)
        response.raise_for_status()
        return response
    
    def _store_token(self, result: Dict[str, Any]) -> None:
        """Store access token and calculate expiration time"""
        self.access_token = result.get('access_token')
        expires_in = result.get('expires_in', IOT_TOKEN_EXPIRY_SECONDS)
        self.token_expires_at = datetime.now() + timedelta(
            seconds=expires_in - IOT_TOKEN_SAFETY_MARGIN_SECONDS
        )
    
    def _extract_account_id_from_token(self) -> None:
        """Extract account_id from JWT token if not provided"""
        if self.account_id or not self.access_token:
            return
        try:
            token_parts = self.access_token.split('.')
            if len(token_parts) >= IOT_JWT_TOKEN_PARTS_COUNT:
                payload = self._add_base64_padding(token_parts[IOT_JWT_PAYLOAD_INDEX])
                decoded = base64.urlsafe_b64decode(payload)
                token_data = json.loads(decoded)
                self.account_id = str(token_data.get('AccountId', ''))
        except Exception:
            pass
    
    @staticmethod
    def _add_base64_padding(payload: str) -> str:
        """Add padding to base64 string if needed"""
        padding_needed = (IOT_BASE64_PADDING_MODULO - len(payload) % IOT_BASE64_PADDING_MODULO) % IOT_BASE64_PADDING_MODULO
        return payload + '=' * padding_needed
    
    def _handle_authentication_error(self, error: requests.exceptions.HTTPError) -> None:
        """Handle authentication HTTP errors"""
        status_code = self._get_status_code_from_error(error)
        error_message = self._extract_error_message(
            error.response if hasattr(error, 'response') else None
        )
        response_text = self._get_response_text(error.response if hasattr(error, 'response') else None)
        
        logger.error(f"Authentication failed: {error}")
        logger.error(f"Response status: {status_code}")
        logger.error(f"Response body: {response_text}")
        
        raise IoTAuthenticationFailedException(
            reason=error_message or str(error),
            response_body=response_text
        )
    
    def _ensure_authenticated(self) -> None:
        """Ensure we have a valid token, refresh if needed"""
        if not self.access_token or not self.token_expires_at:
            self.authenticate()
        elif datetime.now() >= self.token_expires_at:
            logger.debug("Token expired, refreshing...")
            self.authenticate()
    
    def _make_request(self, method: str, endpoint: str, **kwargs) -> requests.Response:
        """Make API request with automatic token refresh on 401 errors"""
        self._ensure_authenticated()
        
        url = f"{self.base_url}/{endpoint.lstrip('/')}"
        headers = self._prepare_headers(kwargs.pop('headers', {}))
        
        try:
            self._log_request_details(method, url, headers, kwargs)
            response = requests.request(method, url, headers=headers, **kwargs)
            self._log_response_details(response, method)
            
            if response.status_code == HTTPStatus.UNAUTHORIZED:
                response = self._retry_request_after_auth(method, url, headers, kwargs)
            
            return response
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Request failed: {e}")
            raise
    
    def _prepare_headers(self, custom_headers: Dict[str, str]) -> Dict[str, str]:
        """Prepare request headers with authentication and account ID"""
        headers = custom_headers.copy()
        headers['Authorization'] = f'Bearer {self.access_token}'
        
        if self.account_id:
            headers['x-tive-account-id'] = self.account_id
        
        if 'Content-Type' not in headers:
            headers['Content-Type'] = IOT_CONTENT_TYPE_JSON
        
        return headers
    
    def _log_request_details(self, method: str, url: str, headers: Dict[str, str], kwargs: Dict[str, Any]) -> None:
        """Log request details for debugging"""
        logger.debug(f"IoT API Request: {method} {url}")
        if 'json' in kwargs:
            body_preview = json.dumps(kwargs['json'], indent=2)[:500]
            logger.debug(f"Request Body: {body_preview}")
            if ('/shipments' in url or '/generateReport' in url) and method == 'POST':
                logger.info(f"Request Body: {json.dumps(kwargs['json'], indent=2)}")
            elif '/alertpresets' in url and method == 'PUT':
                logger.info(f"Update Alert Preset Request Body: {json.dumps(kwargs['json'], indent=2)}")
    
    def _log_response_details(self, response: requests.Response, method: str) -> None:
        """Log response details for debugging (DEBUG level to reduce overhead)"""
        logger.debug(f"IoT API Response: {method} {response.url} - Status: {response.status_code}")
        if response.status_code >= HTTPStatus.BAD_REQUEST:
            try:
                response_text = self._get_response_text(response, max_length=IOT_RESPONSE_PREVIEW_LENGTH)
                logger.debug(f"Error Response: {response_text}")
            except Exception:
                pass
    
    def _retry_request_after_auth(self, method: str, url: str, headers: Dict[str, str], kwargs: Dict[str, Any]) -> requests.Response:
        """Retry request after refreshing authentication token"""
        logger.debug("Received 401 Unauthorized, refreshing token and retrying...")
        self.authenticate()
        headers['Authorization'] = f'Bearer {self.access_token}'
        return requests.request(method, url, headers=headers, **kwargs)
    
    def _parse_json_response(self, response: requests.Response) -> Dict[str, Any]:
        """Safely parse JSON response with error handling"""
        if not response.content:
            return self._handle_empty_response(response)
        
        if self._is_text_plain_created(response):
            return self._parse_text_plain_response(response)
        
        return self._parse_json_safely(response)
    
    def _handle_empty_response(self, response: requests.Response) -> Dict[str, Any]:
        """Handle empty response body"""
        if HTTPStatus.OK <= response.status_code <= HTTPStatus.NO_CONTENT:
            logger.debug(f"Empty response body for status {response.status_code} from {response.url}")
            return {}
        
        raise IoTAPIRequestFailedException(
            operation="parse_response",
            reason="Empty response from IoT API",
            response_body="",
            status_code=response.status_code
        )
    
    def _is_text_plain_created(self, response: requests.Response) -> bool:
        """Check if response is text/plain with 201 Created status"""
        content_type = response.headers.get('Content-Type', '').lower()
        return response.status_code == HTTPStatus.CREATED and IOT_CONTENT_TYPE_TEXT_PLAIN in content_type
    
    def _parse_text_plain_response(self, response: requests.Response) -> Dict[str, Any]:
        """Parse text/plain response (e.g., shipment ID)"""
        resource_id = response.text.strip()
        logger.debug(f"Received text/plain 201 Created response: {resource_id}")
        return {
            "id": resource_id,
            "message": "Resource created successfully",
            "raw_response": resource_id
        }
    
    def _parse_json_safely(self, response: requests.Response) -> Dict[str, Any]:
        """Safely parse JSON response with error handling"""
        try:
            return response.json()
        except json.JSONDecodeError as e:
            response_text = self._get_response_text(response, max_length=IOT_RESPONSE_PREVIEW_LENGTH)
            content_type = response.headers.get('Content-Type', '').lower()
            
            logger.error(f"Failed to parse JSON response: {e}")
            logger.error(f"Response status: {response.status_code}")
            logger.error(f"Content-Type: {content_type}")
            logger.error(f"Response preview: {response_text}")
            
            raise IoTAPIRequestFailedException(
                operation="parse_json_response",
                reason=f"Invalid JSON response: {str(e)}",
                response_body=response_text,
                status_code=response.status_code
            )
    
    def _extract_error_message(self, response: Optional[requests.Response]) -> str:
        """Extract detailed error message from IoT API response"""
        if not response:
            return ""
        
        try:
            error_data = response.json()
            parsed_message = self._parse_error_data(error_data, response)
            logger.debug(f"Parsed error message: {parsed_message}")
            return parsed_message
        except (json.JSONDecodeError, ValueError, AttributeError) as e:
            logger.debug(f"Failed to parse JSON error response: {e}")
            return self._extract_text_error(response)
    
    def _parse_nested_error_message(self, error_value: str) -> Optional[str]:
        """
        Parse nested JSON error message from string.
        
        Args:
            error_value: String that may contain JSON with 'message' field
            
        Returns:
            Extracted message if found, None otherwise
        """
        if not isinstance(error_value, str) or not error_value.strip().startswith('{'):
            return None
        
        try:
            nested_error = json.loads(error_value)
            if isinstance(nested_error, dict) and 'message' in nested_error:
                return str(nested_error['message'])
        except (json.JSONDecodeError, ValueError):
            pass
        
        return None
    
    def _add_trace_id_to_message(self, message: str, error_data: Dict[str, Any]) -> str:
        """Add trace ID to error message if available"""
        if IOT_ERROR_FIELD_TRACE_ID in error_data and error_data[IOT_ERROR_FIELD_TRACE_ID]:
            return f"{message} (TraceId: {error_data[IOT_ERROR_FIELD_TRACE_ID]})"
        return message
    
    def _parse_error_data(self, error_data: Any, response: requests.Response) -> str:
        """Parse error data dictionary"""
        if not isinstance(error_data, dict):
            return str(error_data)
        
        validation_errors = self._extract_validation_errors(error_data)
        if validation_errors:
            error_msg = f"Validation errors: {', '.join(validation_errors)}"
            return self._add_trace_id_to_message(error_msg, error_data)
        
        # Check if 'error' field contains nested JSON string
        if 'error' in error_data and isinstance(error_data['error'], str):
            nested_msg = self._parse_nested_error_message(error_data['error'])
            if nested_msg:
                return self._add_trace_id_to_message(nested_msg, error_data)
        
        priority_fields = ['error', 'message', 'errorMessage', 'detail', 'description']
        ordered_fields = priority_fields + [f for f in IOT_ERROR_FIELDS if f not in priority_fields]
        
        for field in ordered_fields:
            if field in error_data and error_data[field]:
                error_msg = str(error_data[field])
                # Try to parse if it's a JSON string (for 'error' field)
                if field == 'error':
                    nested_msg = self._parse_nested_error_message(error_msg)
                    if nested_msg:
                        error_msg = nested_msg
                
                return self._add_trace_id_to_message(error_msg, error_data)
        
        if 'title' in error_data:
            title = str(error_data['title'])
            return self._add_trace_id_to_message(title, error_data)
        
        return str(error_data)
    
    def _extract_error_type_from_nested_error(self, error_data: Dict[str, Any], default_status: int) -> int:
        """
        Extract errorType from nested JSON error if available.
        
        Args:
            error_data: Error data dictionary
            default_status: Default HTTP status code
            
        Returns:
            Extracted errorType if valid (400-599), otherwise default_status
        """
        if 'error' not in error_data or not isinstance(error_data['error'], str):
            return default_status
        
        try:
            nested_error = json.loads(error_data['error'])
            if isinstance(nested_error, dict) and 'errorType' in nested_error:
                error_type = nested_error.get('errorType')
                # Valid HTTP error status codes are 400-599
                if isinstance(error_type, int) and HTTPStatus.BAD_REQUEST <= error_type < 600:
                    return error_type
        except (json.JSONDecodeError, ValueError):
            pass
        
        return default_status
    
    def _extract_validation_errors(self, error_data: Dict[str, Any]) -> List[str]:
        """Extract validation errors from RFC 9110 format"""
        if IOT_ERROR_FIELD_ERRORS not in error_data or not isinstance(error_data[IOT_ERROR_FIELD_ERRORS], dict):
            return []
        
        error_messages = []
        for field, messages in error_data[IOT_ERROR_FIELD_ERRORS].items():
            if isinstance(messages, list):
                error_messages.extend([f"{field}: {msg}" for msg in messages])
            else:
                error_messages.append(f"{field}: {messages}")
        
        return error_messages
    
    def _extract_text_error(self, response: requests.Response) -> str:
        """Extract error message from response text"""
        try:
            error_text = self._get_response_text(response, max_length=IOT_RESPONSE_PREVIEW_LENGTH)
            return error_text if error_text else f"IoT API request failed with status {response.status_code}"
        except Exception:
            return f"IoT API request failed with status {response.status_code}"
    
    def _handle_http_error(
        self,
        error: requests.exceptions.HTTPError,
        error_code_key: str,
        default_message: str,
        details: Optional[Dict[str, Any]] = None
    ) -> None:
        """Common handler for HTTP errors"""
        status_code = self._get_status_code_from_error(error)
        error_message = self._extract_error_message(
            error.response if hasattr(error, 'response') else None
        ) or default_message
        
        response_text = self._get_response_text(
            error.response if hasattr(error, 'response') else None,
            max_length=IOT_RESPONSE_PREVIEW_LENGTH
        )
        
        logger.error(f"{default_message}: {error}")
        if hasattr(error, 'response') and error.response:
            logger.error(f"Response status: {error.response.status_code}")
            logger.error(f"Response body: {response_text}")
        
        error_details = details or {}
        if response_text:
            error_details['response_body'] = response_text
        
        reason = error_message or default_message
        self._raise_iot_exception(error_code_key, reason, error_details, status_code)
    
    def _handle_api_request(
        self,
        method: str,
        endpoint: str,
        error_code_key: str,
        default_message: str,
        payload: Optional[Dict[str, Any]] = None,
        details: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Common handler for API requests with error handling"""
        try:
            kwargs = {'json': payload} if payload else {}
            response = self._make_request(method, endpoint, **kwargs)
            
            if response.status_code >= HTTPStatus.BAD_REQUEST:
                self._handle_error_response(response, error_code_key, default_message, details)
            
            response.raise_for_status()
            return self._parse_json_response(response)
            
        except AppException:
            raise
        except requests.exceptions.HTTPError as e:
            self._handle_http_error(e, error_code_key, default_message, details)
        except Exception as e:
            logger.error(f"Unexpected error: {e}", exc_info=True)
            self._raise_iot_exception(error_code_key, str(e), details or {}, HTTPStatus.INTERNAL_SERVER_ERROR)
    
    def _handle_error_response(
        self,
        response: requests.Response,
        error_code_key: str,
        default_message: str,
        details: Optional[Dict[str, Any]] = None
    ) -> None:
        """Handle error response before raise_for_status"""
        response_text_full = response.text if hasattr(response, 'text') else ""
        response_text_preview = response_text_full[:IOT_LONG_RESPONSE_PREVIEW_LENGTH] if response_text_full else ""
        
        try:
            error_data = response.json() if response_text_full else {}
        except (json.JSONDecodeError, ValueError):
            error_data = {}
        
        error_message = self._parse_error_data(error_data, response) if error_data else ""
        reason = error_message or default_message
        
        # Extract errorType from nested JSON if available for better status code
        status_code = self._extract_error_type_from_nested_error(error_data, response.status_code)
        
        logger.error(f"{default_message}: HTTP {response.status_code} - {reason}")
        
        error_details = self._build_error_details_from_data(error_data, details, response_text_preview)
        self._raise_iot_exception(error_code_key, reason, error_details, status_code)
    
    def _build_error_details_from_data(
        self,
        error_data: Dict[str, Any],
        details: Optional[Dict[str, Any]],
        response_text: str
    ) -> Dict[str, Any]:
        """Build error details dictionary"""
        error_details = details.copy() if details else {}
        error_details['response_body'] = response_text
        if isinstance(error_data, dict) and IOT_ERROR_FIELD_TRACE_ID in error_data:
            error_details['iot_trace_id'] = error_data[IOT_ERROR_FIELD_TRACE_ID]
        return error_details
    
    def _raise_iot_exception(self, error_code_key: str, reason: str, error_details: Dict[str, Any], status_code: int = 500) -> None:
        """Raise appropriate IoT exception based on error code key"""
        exception_map = {
            "IOT_GET_DEVICES_FAILED": IoTGetDevicesFailedException, "IOT_GET_DEVICE_FAILED": IoTGetDeviceFailedException,
            "IOT_UPDATE_DEVICE_FAILED": IoTUpdateDeviceFailedException, "IOT_CREATE_SHIPMENT_FAILED": IoTCreateShipmentFailedException,
            "IOT_GET_SHIPMENT_FAILED": IoTGetShipmentFailedException, "IOT_GET_SHIPMENTS_FAILED": IoTGetShipmentsFailedException,
            "IOT_GET_ALERT_PRESETS_FAILED": IoTGetAlertPresetsFailedException, "IOT_GET_ALERT_PRESET_FAILED": IoTGetAlertPresetFailedException,
            "IOT_CREATE_ALERT_PRESET_FAILED": IoTCreateAlertPresetFailedException, "IOT_UPDATE_ALERT_PRESET_FAILED": IoTUpdateAlertPresetFailedException,
            "IOT_ADD_DEVICE_ALERT_PRESETS_FAILED": IoTAddDeviceAlertPresetsFailedException,
            "IOT_REMOVE_DEVICE_ALERT_PRESETS_FAILED": IoTRemoveDeviceAlertPresetsFailedException,
            "IOT_GENERATE_DEVICE_REPORT_FAILED": IoTGenerateDeviceReportFailedException
        }
        exception_class = exception_map.get(error_code_key, IoTAPIRequestFailedException)
        kwargs = {'reason': reason, 'response_body': error_details.get('response_body', ''), 'iot_trace_id': error_details.get('iot_trace_id')}
        
        if error_code_key == "IOT_GET_DEVICE_FAILED":
            kwargs['device_id'] = error_details.get('device_id', '')
        elif error_code_key == "IOT_UPDATE_DEVICE_FAILED":
            kwargs['device_id'] = error_details.get('device_id', '')
        elif error_code_key == "IOT_CREATE_SHIPMENT_FAILED":
            # IoTCreateShipmentFailedException only accepts reason, response_body, iot_trace_id
            pass
        elif error_code_key == "IOT_GET_SHIPMENT_FAILED":
            kwargs['shipment_id'] = error_details.get('shipment_id', '')
        elif error_code_key == "IOT_GET_ALERT_PRESET_FAILED":
            # IoTGetAlertPresetFailedException only accepts preset_id and reason
            kwargs = {'preset_id': error_details.get('preset_id', ''), 'reason': reason}
        elif error_code_key == "IOT_CREATE_ALERT_PRESET_FAILED":
            # IoTCreateAlertPresetFailedException only accepts reason, response_body, iot_trace_id
            kwargs = {'reason': reason, 'response_body': error_details.get('response_body', ''), 'iot_trace_id': error_details.get('iot_trace_id')}
        elif error_code_key == "IOT_UPDATE_ALERT_PRESET_FAILED":
            # IoTUpdateAlertPresetFailedException only accepts preset_id and reason
            kwargs = {'preset_id': error_details.get('preset_id', ''), 'reason': reason}
        elif error_code_key in ("IOT_ADD_DEVICE_ALERT_PRESETS_FAILED", "IOT_REMOVE_DEVICE_ALERT_PRESETS_FAILED"):
            kwargs.update({'device_id': error_details.get('device_id', ''), 'alert_preset_ids': error_details.get('alert_preset_ids', [])})
        elif error_code_key == "IOT_GENERATE_DEVICE_REPORT_FAILED":
            kwargs['device_id'] = error_details.get('device_id', '')
        else:
            kwargs.update({'operation': reason, 'status_code': status_code})
        
        raise exception_class(**{k: v for k, v in kwargs.items() if v is not None})
    
    @staticmethod
    def _get_status_code_from_error(error: requests.exceptions.HTTPError) -> int:
        """Extract status code from HTTPError"""
        if hasattr(error, 'response') and error.response:
            return error.response.status_code
        return 500
    
    @staticmethod
    def _get_response_text(response: Optional[requests.Response], max_length: int = IOT_RESPONSE_PREVIEW_LENGTH) -> str:
        """Safely extract response text"""
        if not response:
            return ""
        
        try:
            if hasattr(response, 'text'):
                return response.text[:max_length]
            if hasattr(response, 'content'):
                return str(response.content[:max_length])
        except Exception:
            pass
        
        return ""
    
    @staticmethod
    def _mask_sensitive_data(data: str, visible_chars: int = 4) -> str:
        """Mask sensitive data for logging"""
        if len(data) <= visible_chars:
            return '***'
        return f"{data[:visible_chars]}... (masked)"
    
    def get_all_devices(self) -> List[Dict[str, Any]]:
        """Get all devices/trackers"""
        return self._get_list('GET', '/devices', "IOT_GET_DEVICES_FAILED", "Failed to get devices")
    
    def get_device(self, device_id: str) -> Dict[str, Any]:
        """Get a specific device by ID"""
        return self._handle_api_request(
            'GET',
            f'/devices/{device_id}',
            "IOT_GET_DEVICE_FAILED",
            f"Failed to get device {device_id}",
            details={"device_id": device_id}
        )
    
    def get_device_status(self, device_id: str) -> Dict[str, Any]:
        """Get device status including battery level and connected status
        
        Reference: https://developers.tive.com/reference/retrieve-device-status
        Endpoint: GET /public/v3/devices/{deviceId}/status
        
        Returns device status information including:
        - Battery level (batteryPercent)
        - Connected status (connectivity information)
        - Other device status fields
        """
        return self._handle_api_request(
            'GET',
            f'/devices/{device_id}/status',
            "IOT_GET_DEVICE_FAILED",
            f"Failed to get device status for {device_id}",
            details={"device_id": device_id}
        )
    
    def update_device(self, device_id: str, **kwargs) -> Dict[str, Any]:
        """Update device settings"""
        payload = kwargs.copy()
        
        try:
            response = self._make_request('PUT', f'/devices/{device_id}', json=payload)
            
            if response.status_code >= HTTPStatus.BAD_REQUEST:
                self._handle_error_response(
                    response,
                    "IOT_UPDATE_DEVICE_FAILED",
                    f"Failed to update device {device_id}",
                    {"device_id": device_id}
                )
            
            response.raise_for_status()
            response_data = self._parse_json_response(response)
            
            if not response_data:
                return self._build_update_success_response(device_id, payload)
            
            return response_data
            
        except AppException:
            raise
        except requests.exceptions.HTTPError as e:
            self._handle_http_error(
                e,
                "IOT_UPDATE_DEVICE_FAILED",
                f"Failed to update device {device_id}",
                {"device_id": device_id}
            )
    
    def _build_update_success_response(self, device_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Build success response for device update"""
        success_response = {
            "message": "Device updated successfully",
            "device_id": device_id
        }
        
        updated_fields = self._extract_updated_fields(payload)
        if updated_fields:
            success_response['message'] = f"Updated: {', '.join(updated_fields)}"
        
        success_response.update(payload)
        logger.info(f"Device {device_id} updated successfully. Response: {success_response}")
        return success_response
    
    def _extract_updated_fields(self, payload: Dict[str, Any]) -> List[str]:
        """Extract human-readable updated fields"""
        field_mappings = {
            'measurementInterval': lambda v: f"measurement interval={v} minutes",
            'transmissionInterval': lambda v: f"transmission interval={v} minutes",
            'powerButtonEnabled': lambda v: f"power button={'enabled' if v else 'disabled'}",
            'gpsEnabled': lambda v: f"GPS={'enabled' if v else 'disabled'}",
            'wifiEnabled': lambda v: f"WiFi={'enabled' if v else 'disabled'}",
            'startupDelay': lambda v: f"startup delay={v}"
        }
        
        updated_fields = []
        for key, formatter in field_mappings.items():
            if key in payload:
                updated_fields.append(formatter(payload[key]))
        
        return updated_fields
    
    def create_shipment(self, **kwargs) -> Dict[str, Any]:
        """Create a new shipment"""
        return self._handle_api_request('POST', '/shipments', "IOT_CREATE_SHIPMENT_FAILED",
                                       "Failed to create shipment", payload=kwargs.copy())
    
    def get_shipment(self, shipment_id: str) -> Dict[str, Any]:
        """Get shipment details"""
        return self._handle_api_request(
            'GET',
            f'/shipments/{shipment_id}',
            "IOT_GET_SHIPMENT_FAILED",
            f"Failed to get shipment {shipment_id}",
            details={"shipment_id": shipment_id}
        )
    
    def get_shipment_status(self, shipment_id: str) -> Dict[str, Any]:
        """Get shipment status with latest sensor measurements and key metrics
        
        Reference: https://developers.tive.com/reference/get_public-v3-shipments-shipmentid-status
        Endpoint: GET /public/v3/shipments/{shipmentId}/status
        
        Returns latest sensor measurements and status updates including:
        - Current temperature, humidity, pressure, light levels
        - Distance metrics (total, traveled, remaining)
        - Key dates (start, departure, delivery, completion)
        """
        return self._handle_api_request(
            'GET',
            f'/shipments/{shipment_id}/status',
            "IOT_GET_SHIPMENT_FAILED",
            f"Failed to get shipment status for {shipment_id}",
            details={"shipment_id": shipment_id}
        )
    
    def get_all_shipments(self) -> List[Dict[str, Any]]:
        """Get all shipments"""
        return self._get_list('GET', '/shipments', "IOT_GET_SHIPMENTS_FAILED", "Failed to get shipments")
    
    def get_alert_presets(self) -> List[Dict[str, Any]]:
        """Get all alert presets"""
        return self._get_list('GET', '/alertpresets', "IOT_GET_ALERT_PRESETS_FAILED", "Failed to get alert presets")
    
    def _get_list(self, method: str, endpoint: str, error_code: str, error_msg: str) -> List[Dict[str, Any]]:
        """Common handler for GET list endpoints"""
        try:
            response = self._make_request(method, endpoint)
            response.raise_for_status()
            return self._parse_json_response(response).get('data', [])
        except requests.exceptions.HTTPError as e:
            self._handle_http_error(e, error_code, error_msg, {})
    
    def get_alert_preset(self, preset_id: str) -> Dict[str, Any]:
        """Get a specific alert preset"""
        return self._handle_api_request(
            'GET',
            f'/alertpresets/{preset_id}',
            "IOT_GET_ALERT_PRESET_FAILED",
            f"Failed to get alert preset {preset_id}",
            details={"preset_id": preset_id}
        )
    
    def create_alert_preset(self, **kwargs) -> Dict[str, Any]:
        """Create a new alert preset"""
        try:
            payload = kwargs.copy()
            response = self._make_request('POST', '/alertpresets', json=payload)
            
            if response.status_code >= HTTPStatus.BAD_REQUEST:
                self._handle_error_response(
                    response,
                    "IOT_CREATE_ALERT_PRESET_FAILED",
                    "Failed to create alert preset",
                    None
                )
            
            response.raise_for_status()
            
            # Parse response - Tive API might return preset ID as text/plain or JSON
            # Check for text/plain response first (even if status is 200, not just 201)
            content_type = response.headers.get('Content-Type', '').lower()
            if 'text/plain' in content_type and response.text:
                # Direct text/plain response with preset ID
                preset_id = response.text.strip()
                result = {"id": preset_id, "raw_response": preset_id}
            else:
                # Try parsing as JSON
                result = self._parse_json_response(response)
            
            # Always format the response for consistency
            # Tive API may return:
            # - text/plain: "283259" -> parsed as {"id": "283259", ...}
            # - JSON: {"preset_id": "283259"} or empty {}
            # - Empty: {}
            return format_alert_preset_create_response(result, payload)
            
        except AppException:
            raise
        except requests.exceptions.HTTPError as e:
            self._handle_http_error(
                e,
                "IOT_CREATE_ALERT_PRESET_FAILED",
                "Failed to create alert preset",
                None
            )
        except Exception as e:
            logger.error(f"Unexpected error creating alert preset: {e}", exc_info=True)
            self._raise_iot_exception(
                "IOT_CREATE_ALERT_PRESET_FAILED",
                str(e),
                {},
                HTTPStatus.INTERNAL_SERVER_ERROR
            )
    
    def update_alert_preset(self, preset_id: str, **kwargs) -> Dict[str, Any]:
        """Update an alert preset"""
        # Filter out None values and empty dicts, but keep empty arrays (they might be used to clear triggers)
        payload = {}
        for k, v in kwargs.items():
            if v is None:
                continue
            if v == {}:
                continue
            # Keep empty arrays - they might be intentional to clear existing triggers
            payload[k] = v
        
        # Ensure payload is not empty
        if not payload:
            raise ValueError("At least one field must be provided for update")
        
        logger.info(f"Updating alert preset {preset_id} with fields: {list(payload.keys())}")
        
        try:
            # First verify the preset exists by attempting to get it
            # This will raise an exception if the preset doesn't exist (404)
            try:
                self.get_alert_preset(preset_id)
                logger.debug(f"Preset {preset_id} exists, proceeding with update")
            except AppException:
                # Re-raise IoT exceptions (preset not found, etc.)
                raise
            except Exception as e:
                # If get fails for unexpected reasons, log warning but continue with update attempt
                logger.warning(f"Could not verify preset {preset_id} existence: {e}. Proceeding with update attempt.")
            
            kwargs_request = {'json': payload}
            response = self._make_request('PUT', f'/alertpresets/{preset_id}', **kwargs_request)
            
            if response.status_code >= HTTPStatus.BAD_REQUEST:
                self._handle_error_response(
                    response,
                    "IOT_UPDATE_ALERT_PRESET_FAILED",
                    f"Failed to update alert preset {preset_id}",
                    details={"preset_id": preset_id}
                )
            
            response.raise_for_status()
            
            # Parse response, but if empty, return a success message
            result = self._parse_json_response(response)
            if not result or result == {}:
                # Return meaningful response instead of empty dict
                return format_alert_preset_update_response(preset_id, payload, result)
            
            return result
            
        except AppException:
            raise
        except requests.exceptions.HTTPError as e:
            self._handle_http_error(
                e,
                "IOT_UPDATE_ALERT_PRESET_FAILED",
                f"Failed to update alert preset {preset_id}",
                details={"preset_id": preset_id}
            )
        except Exception as e:
            logger.error(f"Unexpected error updating alert preset: {e}", exc_info=True)
            self._raise_iot_exception(
                "IOT_UPDATE_ALERT_PRESET_FAILED",
                str(e),
                {"preset_id": preset_id},
                HTTPStatus.INTERNAL_SERVER_ERROR
            )
    
    
    def add_device_alert_presets(self, device_id: str, alert_preset_ids: List[int]) -> Dict[str, Any]:
        """Add alert presets to a device"""
        return self._manage_device_alert_presets(device_id, alert_preset_ids, 'add', "IOT_ADD_DEVICE_ALERT_PRESETS_FAILED")
    
    def remove_device_alert_presets(self, device_id: str, alert_preset_ids: List[int]) -> Dict[str, Any]:
        """Remove alert presets from a device"""
        return self._manage_device_alert_presets(device_id, alert_preset_ids, 'remove', "IOT_REMOVE_DEVICE_ALERT_PRESETS_FAILED")
    
    def _manage_device_alert_presets(self, device_id: str, alert_preset_ids: List[int], action: str, error_code: str) -> Dict[str, Any]:
        """Common handler for adding/removing device alert presets"""
        endpoint = f'/devices/{device_id}/addAlertPresets' if action == 'add' else f'/devices/{device_id}/removeAlertPresets'
        action_msg = "added" if action == 'add' else "removed"
        details = {"device_id": device_id, "alert_preset_ids": alert_preset_ids}
        
        try:
            response = self._make_request('PATCH', endpoint, json={"AlertPresetIds": alert_preset_ids})
            if response.status_code >= HTTPStatus.BAD_REQUEST:
                self._handle_error_response(response, error_code, f"Failed to {action} alert presets to device {device_id}", details)
            response.raise_for_status()
            response_data = self._parse_json_response(response)
            return response_data or {"message": f"Successfully {action_msg} {len(alert_preset_ids)} alert preset(s) to device {device_id}",
                                    "device_id": device_id, "alertPresetIds": alert_preset_ids}
        except AppException:
            raise
        except requests.exceptions.HTTPError as e:
            self._handle_http_error(e, error_code, f"Failed to {action} alert presets to device {device_id}", details)
    
    def generate_device_report(self, device_id: str, **kwargs) -> Dict[str, Any]:
        """Generate a report of sensor data for the specified tracker
        
        Reference: https://developers.tive.com/docs/devices
        Endpoint: POST /public/v3/devices/{deviceId}/generateReport
        
        Required fields:
        - Format: Report format (e.g., "CSV", "PDF", "JSON")
        - TimeZone: Time zone (e.g., "UTC", "America/New_York")
        - SensorData: List of sensor data types (e.g., ["Temperature"], ["Humidity"])
        - DateTimeStart: Start date/time (ISO 8601 format, must be within past 3 months)
        
        Optional fields:
        - DateTimeEnd: End date/time (ISO 8601 format)
        
        Returns: Dict with download URL or file content
        """
        # Use fields directly as Tive API expects Format, TimeZone, SensorData
        # Required fields
        if 'Format' not in kwargs or not kwargs['Format']:
            raise ValueError("Format is required")
        if 'TimeZone' not in kwargs or not kwargs['TimeZone']:
            raise ValueError("TimeZone is required")
        if 'SensorData' not in kwargs or not kwargs['SensorData']:
            raise ValueError("SensorData is required")
        if 'DateTimeStart' not in kwargs or not kwargs['DateTimeStart']:
            raise ValueError("DateTimeStart is required")
        
        payload = {
            'Format': kwargs['Format'],
            'TimeZone': kwargs['TimeZone'],
            'SensorData': kwargs['SensorData'],
            'DateTimeStart': kwargs['DateTimeStart'],
        }
        
        # Add optional DateTimeEnd if provided
        if 'DateTimeEnd' in kwargs and kwargs['DateTimeEnd']:
            payload['DateTimeEnd'] = kwargs['DateTimeEnd']
        
        self._log_report_request(device_id, kwargs, payload)
        
        try:
            response = self._make_request('POST', f'/devices/{device_id}/generateReport', json=payload)
            self._log_report_response(response)
            
            if response.status_code == HTTPStatus.ACCEPTED:
                return self._handle_accepted_report(response, device_id, kwargs)
            
            if response.status_code >= HTTPStatus.BAD_REQUEST:
                self._handle_error_response(
                    response,
                    "IOT_GENERATE_DEVICE_REPORT_FAILED",
                    f"Failed to generate report for device {device_id}",
                    {"device_id": device_id}
                )
            
            response.raise_for_status()
            return self._process_report_response(response, device_id, kwargs)
                
        except AppException:
            raise
        except requests.exceptions.HTTPError as e:
            self._handle_http_error(
                e,
                "IOT_GENERATE_DEVICE_REPORT_FAILED",
                f"Failed to generate report for device {device_id}",
                {"device_id": device_id}
            )
    
    def _log_report_request(self, device_id: str, kwargs: Dict[str, Any], payload: Dict[str, Any]) -> None:
        """Log report generation request details"""
        logger.info(f"Generating report for device {device_id}: {json.dumps(payload)}")
    
    def _log_report_response(self, response: requests.Response) -> None:
        """Log report generation response details"""
        logger.info(f"Report Response - Status: {response.status_code}, "
                   f"Content-Type: {response.headers.get('Content-Type', '')}, "
                   f"Location: {response.headers.get('Location', 'N/A')}")
    
    def _handle_accepted_report(self, response: requests.Response, device_id: str, kwargs: Dict[str, Any]) -> Dict[str, Any]:
        """Handle 202 Accepted response with Location header - return response as-is"""
        location_header = response.headers.get('Location', '')
        
        # Try to download once, but return whatever we get
        if location_header:
            file_result = self._download_report_file(location_header, device_id, kwargs)
            if file_result:
                return file_result
        
        # Return download URL response with full response details
        return {
            'download_url': location_header,
            'message': 'Report generation accepted. Use the download_url to access the report.',
            'status': 'accepted',
            'status_code': response.status_code,
            'location': location_header,
            'response_headers': dict(response.headers)
        }
    
    def _download_report_file(self, location_header: str, device_id: str, kwargs: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Attempt to download report file from Location URL"""
        if location_header.startswith('http'):
            # Ensure account_id is available (extract from token if needed)
            if not self.account_id and self.access_token:
                self._extract_account_id_from_token()
            
            # Prepare headers with authentication (account_id is required for platform URLs)
            download_headers = self._prepare_download_headers()
            
            # Try downloading with authentication (account_id header is required)
            try:
                file_response = self._try_download_with_auth(location_header, download_headers)
                return self._build_file_response(file_response, device_id, kwargs) if file_response else None
            except requests.exceptions.HTTPError as e:
                logger.error(f"Failed to download report: {e}")
                return None
        try:
            file_response = self._make_request('GET', location_header.lstrip('/'))
            file_response.raise_for_status()
            return self._build_file_response(file_response, device_id, kwargs)
        except Exception:
            return None
    
    def _prepare_download_headers(self) -> Dict[str, str]:
        """Prepare download headers with authentication"""
        headers = {'User-Agent': IOT_USER_AGENT, 'Accept': '*/*'}
        
        # Always include Authorization header if token is available
        if self.access_token:
            headers['Authorization'] = f'Bearer {self.access_token}'
        
        # Account ID is REQUIRED for Tive API requests - always include if available
        # Extract from token if not already set
        if not self.account_id and self.access_token:
            self._extract_account_id_from_token()
        
        if self.account_id:
            # Ensure account_id is a string and trimmed
            account_id_str = str(self.account_id).strip()
            if account_id_str:
                headers['x-tive-account-id'] = account_id_str
            else:
                logger.warning("Account ID is empty after trimming")
        else:
            logger.warning("Account ID is missing - this may cause 401 errors. Ensure IOT_ACCOUNT_ID is set in .env or extractable from token.")
        
        return headers
    
    def _try_download_with_auth(self, location_header: str, download_headers: Dict[str, str]) -> Optional[requests.Response]:
        """Try downloading with authentication - return response as-is"""
        try:
            file_response = requests.get(
                location_header,
                headers=download_headers,
                timeout=IOT_API_TIMEOUT_SECONDS,
                allow_redirects=True
            )
            
            # Return response if successful
            if file_response.status_code == HTTPStatus.OK:
                return file_response
            
            # For non-200 responses, try API path once
            logger.debug(f"Platform URL returned {file_response.status_code}, trying API path...")
            return self._try_api_path_download(location_header)
            
        except Exception as e:
            logger.debug(f"Error downloading from platform URL: {e}")
            # Try API path as fallback
            return self._try_api_path_download(location_header)
    
    def _try_api_path_download(self, location_header: str) -> Optional[requests.Response]:
        """Try downloading via API path with authenticated session
        
        Note: platform.tive.com URLs are web URLs that require browser/cookie authentication.
        They cannot be accessed with API Bearer tokens. We try the API endpoint instead.
        """
        report_id = location_header.split('/')[-1]
        # Try different possible API paths
        possible_paths = [
            f"customer-reports/{report_id}",
            f"api/customer-reports/{report_id}",
            f"reports/{report_id}",
            f"devices/reports/{report_id}",
        ]
        
        for api_report_path in possible_paths:
            try:
                file_response = self._make_request('GET', api_report_path)
                file_response.raise_for_status()
                logger.info(f"Successfully downloaded report from API path: {api_report_path}")
                return file_response
            except requests.exceptions.HTTPError:
                continue
            except Exception:
                continue
        
        logger.debug(f"All API paths failed for report ID: {report_id}")
        return None
    
    
    def _build_file_response(self, file_response: requests.Response, device_id: str, kwargs: Dict[str, Any]) -> Dict[str, Any]:
        """Build file response dictionary from HTTP response"""
        content = file_response.content
        logger.info(f"Downloaded file: {len(content)} bytes")
        return {
            'content': content,
            'content_type': file_response.headers.get('Content-Type', IOT_CONTENT_TYPE_OCTET_STREAM),
            'filename': self._extract_filename_from_headers(file_response.headers, device_id, kwargs.get('Format', 'CSV')),
            'size': len(content)
        }
    
    def _build_download_url_response(self, location_header: str) -> Dict[str, Any]:
        """Build response with download URL when server-side download fails"""
        logger.warning("Server-side download failed. Returning Location URL for client-side download.")
        return {
            'download_url': location_header,
            'message': 'Report generation accepted. Please download from the provided URL.',
            'status': 'pending'
        }
    
    def _process_report_response(self, response: requests.Response, device_id: str, kwargs: Dict[str, Any]) -> Dict[str, Any]:
        """Process report response (file content or JSON with download URL)"""
        content_type = response.headers.get('Content-Type', '').lower()
        if any(ct in content_type for ct in IOT_FILE_CONTENT_TYPES):
            return self._build_file_response(response, device_id, kwargs)
        try:
            response_data = response.json()
            if isinstance(response_data, dict):
                download_url = self._extract_download_url(response_data)
                if download_url:
                    return self._fetch_file_from_url(download_url, device_id, kwargs)
            return response_data
        except json.JSONDecodeError:
            return self._build_file_response(response, device_id, kwargs)
    
    def _extract_download_url(self, response_data: Dict[str, Any]) -> Optional[str]:
        """Extract download URL from response data"""
        return response_data.get('downloadUrl') or response_data.get('url') or response_data.get('download_url') or response_data.get('fileUrl')
    
    def _fetch_file_from_url(self, download_url: str, device_id: str, kwargs: Dict[str, Any]) -> Dict[str, Any]:
        """Fetch file from download URL"""
        url_path = download_url.replace(self.base_url, '').lstrip('/') if download_url.startswith('http') else download_url.lstrip('/')
        file_response = self._make_request('GET', url_path)
        file_response.raise_for_status()
        return self._build_file_response(file_response, device_id, kwargs)
    
    def _extract_filename_from_headers(self, headers: Dict[str, str], device_id: str, format_type: str) -> str:
        """Extract filename from Content-Disposition header or generate default"""
        content_disposition = headers.get('Content-Disposition', '')
        if 'filename=' in content_disposition:
            try:
                return content_disposition.split('filename=')[1].strip('"\'')
            except Exception:
                pass
        # Handle both ReportType and Format for backward compatibility
        report_type = format_type or 'csv'
        if isinstance(report_type, str):
            report_type_lower = report_type.lower()
            if report_type_lower == 'excel':
                extension = 'xlsx'
            elif report_type_lower in ['pdf', 'pdfwithrawdata']:
                extension = 'pdf'
            elif report_type_lower == 'json':
                extension = 'json'
            else:
                extension = 'csv'
        else:
            extension = 'csv'
        return f'report_{device_id}_{datetime.now().strftime("%Y%m%d_%H%M%S")}.{extension}'
    

