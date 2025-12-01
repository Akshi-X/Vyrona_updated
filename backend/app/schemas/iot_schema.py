"""
IoT API Schemas
Request and response models for IoT provider endpoints
"""

from pydantic import BaseModel, Field, validator
from typing import Optional, Dict, Any, List
from datetime import datetime


# ============================================
# DEVICE SCHEMAS
# ============================================

class DeviceResponse(BaseModel):
    """Device response schema"""
    deviceId: Optional[str] = None
    deviceName: Optional[str] = None
    measurementInterval: Optional[int] = None
    transmissionInterval: Optional[int] = None
    status: Optional[str] = None
    batteryLevel: Optional[int] = None
    lastUpdate: Optional[datetime] = None
    # Allow additional fields from API
    class Config:
        extra = "allow"


class DeviceListResponse(BaseModel):
    """List of devices response"""
    devices: List[DeviceResponse]
    total: int


class DeviceUpdateRequest(BaseModel):
    """Request schema for updating device - matches IoT API structure"""
    description: Optional[str] = Field(default=None, description="Device description")
    powerButtonEnabled: Optional[bool] = Field(default=None, description="Enable/disable power button")
    gpsEnabled: Optional[bool] = Field(default=None, description="Enable/disable GPS")
    wifiEnabled: Optional[bool] = Field(default=None, description="Enable/disable WiFi")
    measurementInterval: Optional[int] = Field(default=None, description="Measurement interval in minutes")
    transmissionInterval: Optional[int] = Field(default=None, description="Transmission interval in minutes")
    startupDelay: Optional[int] = Field(default=None, description="Startup delay")
    # Allow additional fields
    class Config:
        extra = "allow"


class DeviceAlertPresetsRequest(BaseModel):
    """Request schema for adding/removing alert presets to/from device
    
    Reference: https://developers.tive.com/docs/devices
    Endpoint: PATCH /public/v3/devices/{deviceId}/addAlertPresets
    Endpoint: PATCH /public/v3/devices/{deviceId}/removeAlertPresets
    
    Example:
    {
        "alertPresetIds": [282358]
    }
    """
    alertPresetIds: List[int] = Field(..., min_items=1, description="List of alert preset IDs (integers) to add/remove")
    
    class Config:
        extra = "allow"


class DeviceGenerateReportRequest(BaseModel):
    """Request schema for generating device/tracker report
    
    Reference: https://developers.tive.com/docs/devices
    Endpoint: POST /public/v3/devices/{deviceId}/generateReport
    
    Creates a report of sensor data for the specified tracker.
    
    Required fields:
    - Format: Report format (e.g., "CSV", "PDF", "JSON")
    - TimeZone: Time zone (e.g., "UTC", "America/New_York")
    - SensorData: List of sensor data types. Allowed values:
      Location, Temperature, Humidity, Pressure, Light, Motion, Battery,
      Acceleration, ExternalTemperature, TiltAngle, ProbeTemperature
    - DateTimeStart: Start date/time (ISO 8601 format, must be within past 3 months)
    
    Optional fields:
    - DateTimeEnd: End date/time (ISO 8601 format)
    """
    Format: str = Field(..., description="Report format (required, e.g., 'CSV', 'PDF', 'JSON')")
    TimeZone: str = Field(..., description="Time zone (required, e.g., 'UTC', 'America/New_York')")
    SensorData: List[str] = Field(
        ..., 
        min_items=1, 
        description="List of sensor data types. Allowed values: Location, Temperature, Humidity, Pressure, Light, Motion, Battery, Acceleration, ExternalTemperature, TiltAngle, ProbeTemperature"
    )
    DateTimeStart: str = Field(..., description="Start date/time in ISO 8601 format (required, must be within past 3 months)")
    DateTimeEnd: Optional[str] = Field(None, description="End date/time in ISO 8601 format (optional)")
    
    class Config:
        extra = "allow"
        populate_by_name = True


# ============================================
# SHIPMENT SCHEMAS
# ============================================

class LocationSchema(BaseModel):
    """Location schema for origin/destination"""
    address: Optional[str] = None
    coordinates: Optional[Dict[str, float]] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    zipCode: Optional[str] = None
    # Allow additional fields
    class Config:
        extra = "allow"


class AddressRequestSchema(BaseModel):
    """Address request schema - matches Tive API Swagger AddressRequest structure
    
    Reference: https://api.tive.com/public/v3/docs/index.html
    https://developers.tive.com/docs/create-a-shipment
    
    Swagger shows: street, locality, state, country, postalCode (camelCase)
    API accepts: Street, Locality, State, Country, PostalCode (PascalCase)
    """
    Street: str = Field(..., alias="street", description="Street address (required)")
    Locality: str = Field(..., alias="locality", description="City/Locality name (required)")
    State: Optional[str] = Field(None, alias="state", description="State/Province")
    Country: Optional[str] = Field(None, alias="country", description="Country name")
    PostalCode: Optional[str] = Field(None, alias="postalCode", description="Postal/ZIP code")
    # Allow additional fields from IoT API
    class Config:
        extra = "allow"
        populate_by_name = True


class ShipmentLegSchema(BaseModel):
    """Schema for shipment leg - matches Tive API Swagger ShipmentLegRequest structure
    
    Reference: https://api.tive.com/public/v3/docs/index.html
    https://developers.tive.com/docs/create-a-shipment
    
    Swagger shows: mode, fromAddress, toAddress, fromCoordinates, toCoordinates, shipFromDate (camelCase)
    API accepts: mode, FromAddress, ToAddress, FromCoordinates, ToCoordinates, ShipFromDate (PascalCase)
    """
    mode: str = Field(..., description="Mode of transport (e.g., Road, Air, Sea)")
    FromAddress: AddressRequestSchema = Field(..., alias="fromAddress", description="Origin address")
    ToAddress: AddressRequestSchema = Field(..., alias="toAddress", description="Destination address")
    FromCoordinates: Dict[str, float] = Field(..., alias="fromCoordinates", description="Origin coordinates {latitude, longitude}")
    ToCoordinates: Dict[str, float] = Field(..., alias="toCoordinates", description="Destination coordinates {latitude, longitude}")
    ShipFromDate: Optional[str] = Field(None, alias="shipFromDate", description="Ship from date (required on first leg - ISO 8601)")
    legOrder: Optional[int] = Field(None, alias="legOrder", description="Order of the leg")
    # Allow additional fields from IoT API
    class Config:
        extra = "allow"
        populate_by_name = True


class ShipmentCreateRequest(BaseModel):
    """Request schema for creating shipment - matches Tive API Swagger documentation
    
    Reference: https://api.tive.com/public/v3/docs/index.html
    https://developers.tive.com/docs/create-a-shipment
    
    Swagger structure (camelCase):
    {
      "shipmentId": "string",
      "devices": [],
      "shipmentLegs": [...]
    }
    
    Note: API also requires 'request' field (even if Swagger doesn't show it)
    Field names: Swagger shows camelCase, but API accepts PascalCase
    """
    ShipmentId: str = Field(..., alias="shipmentId", description="Shipment ID (required)")
    ShipmentLegs: List[ShipmentLegSchema] = Field(..., alias="shipmentLegs", min_items=1, description="List of shipment legs (required, at least one leg)")
    devices: Optional[List[str]] = Field(None, description="List of device IDs")
    name: Optional[str] = Field(None, description="Shipment name")
    deviceId: Optional[str] = Field(None, alias="deviceId", description="Single device ID (alternative to devices array)")
    
    @validator('ShipmentLegs')
    def validate_first_leg_has_ship_from_date(cls, v):
        """Ensure first leg has ShipFromDate"""
        if v and len(v) > 0 and not v[0].ShipFromDate:
            raise ValueError("ShipFromDate is required on the first leg")
        return v
    
    # Allow additional fields from IoT API
    class Config:
        extra = "allow"
        populate_by_name = True


class ShipmentResponse(BaseModel):
    """Shipment response schema"""
    shipmentId: Optional[str] = None
    name: Optional[str] = None
    status: Optional[str] = None
    deviceId: Optional[str] = None
    origin: Optional[LocationSchema] = None
    destination: Optional[LocationSchema] = None
    currentLocation: Optional[Dict[str, Any]] = None
    lastUpdate: Optional[datetime] = None
    # Allow additional fields from API
    class Config:
        extra = "allow"


class ShipmentStatusResponse(BaseModel):
    """Shipment status response schema"""
    shipment_id: Optional[str] = None
    name: Optional[str] = None
    status: Optional[str] = None
    current_location: Optional[Dict[str, Any]] = None
    last_update: Optional[datetime] = None
    device_id: Optional[str] = None


class ShipmentListResponse(BaseModel):
    """List of shipments response"""
    shipments: List[ShipmentResponse]
    total: int


# ============================================
# ALERT PRESET SCHEMAS
# ============================================

class AlertPresetResponse(BaseModel):
    """Alert preset response schema"""
    presetId: Optional[str] = None
    name: Optional[str] = None
    conditions: Optional[Dict[str, Any]] = None
    enabled: Optional[bool] = None
    # Allow additional fields from API
    class Config:
        extra = "allow"


class TemperatureTriggerSchema(BaseModel):
    """Temperature trigger schema - matches IoT API exactly"""
    type: str = Field(..., description="Trigger type")
    isActiveAtOrigin: bool = Field(..., description="Active at origin")
    isActiveInTransit: bool = Field(..., description="Active in transit")
    isActiveAtDestination: bool = Field(..., description="Active at destination")
    triggerValue: float = Field(..., description="Trigger value")
    triggerUnit: str = Field(..., description="Trigger unit")
    intervalDelay: int = Field(..., description="Interval delay")
    intervalDelayUnit: str = Field(..., description="Interval delay unit")
    # Allow additional fields
    class Config:
        extra = "allow"


class PercentTriggerSchema(BaseModel):
    """Percent trigger schema - matches IoT API exactly
    
    Note: triggerValue must be an integer (System.Int32) according to IoT API validation
    """
    type: str = Field(..., description="Trigger type")
    isActiveAtOrigin: bool = Field(..., description="Active at origin")
    isActiveInTransit: bool = Field(..., description="Active in transit")
    isActiveAtDestination: bool = Field(..., description="Active at destination")
    triggerValue: int = Field(..., description="Trigger value (must be integer)")
    triggerUnit: str = Field(..., description="Trigger unit")
    # Allow additional fields
    class Config:
        extra = "allow"


class ArriveDepartTriggerSchema(BaseModel):
    """Arrive/Depart trigger schema - matches IoT API exactly"""
    type: str = Field(..., description="Trigger type")
    isActiveAtOrigin: bool = Field(..., description="Active at origin")
    isActiveInTransit: bool = Field(..., description="Active in transit")
    isActiveAtDestination: bool = Field(..., description="Active at destination")
    alertOn: str = Field(..., description="Alert on event")
    # Allow additional fields
    class Config:
        extra = "allow"


class IntervalTriggerSchema(BaseModel):
    """Interval trigger schema - matches IoT API exactly"""
    type: str = Field(..., description="Trigger type")
    isActiveAtOrigin: bool = Field(..., description="Active at origin")
    isActiveInTransit: bool = Field(..., description="Active in transit")
    isActiveAtDestination: bool = Field(..., description="Active at destination")
    intervalDelay: int = Field(..., description="Interval delay")
    intervalDelayUnit: str = Field(..., description="Interval delay unit")
    # Allow additional fields
    class Config:
        extra = "allow"


class ShockLightTriggerSchema(BaseModel):
    """Shock/Light trigger schema - matches IoT API exactly
    
    Reference: https://developers.tive.com/docs/triggers
    Note: ShockEvents and LightChanges triggers do NOT require triggerValue or triggerUnit
    """
    type: str = Field(..., description="Trigger type (ShockEvents or LightChanges)")
    isActiveAtOrigin: bool = Field(..., description="Active at origin")
    isActiveInTransit: bool = Field(..., description="Active in transit")
    isActiveAtDestination: bool = Field(..., description="Active at destination")
    triggerValue: Optional[float] = Field(None, description="Trigger value (not required for ShockEvents/LightChanges)")
    triggerUnit: Optional[str] = Field(None, description="Trigger unit (not required for ShockEvents/LightChanges)")
    # Allow additional fields
    class Config:
        extra = "allow"


class GeofenceTriggerSchema(BaseModel):
    """Geofence trigger schema - matches IoT API exactly"""
    type: str = Field(..., description="Trigger type")
    isActiveAtOrigin: bool = Field(..., description="Active at origin")
    isActiveInTransit: bool = Field(..., description="Active in transit")
    isActiveAtDestination: bool = Field(..., description="Active at destination")
    locationId: int = Field(..., description="Location ID")
    alertOn: str = Field(..., description="Alert on event")
    # Allow additional fields
    class Config:
        extra = "allow"


class ShipmentInboundTriggerSchema(BaseModel):
    """Shipment inbound trigger schema - matches IoT API exactly"""
    type: str = Field(..., description="Trigger type")
    isActiveAtOrigin: bool = Field(..., description="Active at origin")
    isActiveInTransit: bool = Field(..., description="Active in transit")
    isActiveAtDestination: bool = Field(..., description="Active at destination")
    triggerValue: float = Field(..., description="Trigger value")
    triggerUnit: str = Field(..., description="Trigger unit")
    # Allow additional fields
    class Config:
        extra = "allow"


class BooleanTriggerSchema(BaseModel):
    """Boolean trigger schema - matches IoT API exactly"""
    type: str = Field(..., description="Trigger type")
    isActiveAtOrigin: bool = Field(..., description="Active at origin")
    isActiveInTransit: bool = Field(..., description="Active in transit")
    isActiveAtDestination: bool = Field(..., description="Active at destination")
    # Allow additional fields
    class Config:
        extra = "allow"


class TiltTriggerSchema(BaseModel):
    """Tilt trigger schema - matches IoT API exactly
    
    Note: 
    - type must be "TiltAngle" (only allowed value)
    - triggerUnit must be "°" (degree symbol, only allowed value)
    """
    type: str = Field(..., description="Trigger type (must be 'TiltAngle')")
    isActiveAtOrigin: bool = Field(..., description="Active at origin")
    isActiveInTransit: bool = Field(..., description="Active in transit")
    isActiveAtDestination: bool = Field(..., description="Active at destination")
    triggerValue: float = Field(..., description="Trigger value (tilt angle)")
    triggerUnit: str = Field(..., description="Trigger unit (must be '°')")
    alertOnRecovery: bool = Field(..., description="Alert on recovery")
    # Allow additional fields
    class Config:
        extra = "allow"


class AlertPresetCreateRequest(BaseModel):
    """Request schema for creating alert preset - matches IoT API EXACTLY
    
    Reference: https://api.tive.com/public/v3/docs/index.html
    https://developers.tive.com/docs
    
    Note: Based on IoT API documentation, alert presets may not require a 'request' field
    (unlike shipments). Making it optional to test.
    """
    name: str = Field(..., description="Alert preset name")
    request: Optional[Dict[str, Any]] = Field(None, description="Request object (optional - may not be required for alert presets)")
    description: Optional[str] = Field(None, description="Alert preset description")
    assignees: Optional[List[str]] = Field(None, description="List of assignee IDs")
    temperatureTriggers: Optional[List[TemperatureTriggerSchema]] = Field(None, description="Temperature triggers")
    percentTriggers: Optional[List[PercentTriggerSchema]] = Field(None, description="Percent triggers")
    arriveDepartTriggers: Optional[List[ArriveDepartTriggerSchema]] = Field(None, description="Arrive/Depart triggers")
    intervalTriggers: Optional[List[IntervalTriggerSchema]] = Field(None, description="Interval triggers")
    shockLightTriggers: Optional[List[ShockLightTriggerSchema]] = Field(None, description="Shock/Light triggers")
    geofenceTriggers: Optional[List[GeofenceTriggerSchema]] = Field(None, description="Geofence triggers")
    shipmentInboundTriggers: Optional[List[ShipmentInboundTriggerSchema]] = Field(None, description="Shipment inbound triggers")
    booleanTriggers: Optional[List[BooleanTriggerSchema]] = Field(None, description="Boolean triggers")
    tiltTriggers: Optional[List[TiltTriggerSchema]] = Field(None, description="Tilt triggers")
    notifyWhenActive: Optional[bool] = Field(None, description="Notify when active")
    notifyAllCollaborators: Optional[bool] = Field(None, description="Notify all collaborators")
    # Allow additional fields from IoT API
    class Config:
        extra = "allow"


class AlertPresetUpdateRequest(BaseModel):
    """Request schema for updating alert preset - matches IoT API structure
    
    Reference: https://api.tive.com/public/v3/docs/index.html
    Uses same structure as AlertPresetCreateRequest for updates
    """
    name: Optional[str] = Field(None, description="Alert preset name")
    description: Optional[str] = Field(None, description="Alert preset description")
    assignees: Optional[List[str]] = Field(None, description="List of assignee IDs")
    temperatureTriggers: Optional[List[TemperatureTriggerSchema]] = Field(None, description="Temperature triggers")
    percentTriggers: Optional[List[PercentTriggerSchema]] = Field(None, description="Percent triggers")
    arriveDepartTriggers: Optional[List[ArriveDepartTriggerSchema]] = Field(None, description="Arrive/Depart triggers")
    intervalTriggers: Optional[List[IntervalTriggerSchema]] = Field(None, description="Interval triggers")
    shockLightTriggers: Optional[List[ShockLightTriggerSchema]] = Field(None, description="Shock/Light triggers")
    geofenceTriggers: Optional[List[GeofenceTriggerSchema]] = Field(None, description="Geofence triggers")
    shipmentInboundTriggers: Optional[List[ShipmentInboundTriggerSchema]] = Field(None, description="Shipment inbound triggers")
    booleanTriggers: Optional[List[BooleanTriggerSchema]] = Field(None, description="Boolean triggers")
    tiltTriggers: Optional[List[TiltTriggerSchema]] = Field(None, description="Tilt triggers")
    notifyWhenActive: Optional[bool] = Field(None, description="Notify when active")
    notifyAllCollaborators: Optional[bool] = Field(None, description="Notify all collaborators")
    # Allow additional fields from IoT API
    class Config:
        extra = "allow"


class AlertPresetListResponse(BaseModel):
    """List of alert presets response"""
    presets: List[AlertPresetResponse]
    total: int


# ============================================
# AUTHENTICATION SCHEMAS
# ============================================

class IoTAuthResponse(BaseModel):
    """IoT API authentication response"""
    access_token: str
    token_type: Optional[str] = None
    expires_in: Optional[int] = None

