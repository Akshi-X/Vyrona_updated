"""
Quality Monitoring Schemas
Response models for quality monitoring endpoints
"""
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
from datetime import datetime


class ParameterThreshold(BaseModel):
    """Schema for parameter threshold information"""
    min: Optional[float] = Field(None, description="Minimum threshold value")
    max: Optional[float] = Field(None, description="Maximum threshold value")
    unit: str = Field(..., description="Unit of measurement (e.g., '°C', '%', '')")


class QualityDataPoint(BaseModel):
    """Single quality data point"""
    patient_id: str
    temperature: float = Field(..., description="Temperature in °C")
    humidity: float = Field(..., description="Humidity in %")
    ph_level: float = Field(..., description="pH level")
    o2_level: float = Field(..., description="Oxygen level in %")
    co2_level: float = Field(..., description="CO2 level in %")
    agitation: float = Field(..., description="Agitation in %")
    timestamp: str = Field(..., description="Timestamp of the reading")
    thresholds: Optional[Dict[str, ParameterThreshold]] = Field(default_factory=dict, description="Threshold information for each parameter")
    threshold_violations: Optional[Dict[str, bool]] = Field(default_factory=dict, description="Per-parameter threshold violation status")
    violated_parameters: List[str] = Field(default_factory=list, description="List of parameters that violated thresholds")


class QualityHealthResponse(BaseModel):
    """Health check response for quality monitoring"""
    status: str = Field(..., description="Health status")
    redis: str = Field(..., description="Redis connection status")
    error: Optional[str] = Field(None, description="Error message if unhealthy")


class QualityPatientsResponse(BaseModel):
    """Response for getting list of patients with quality data"""
    patients: List[str] = Field(..., description="List of patient IDs")
    count: int = Field(..., description="Number of patients")


class QualityHistoryResponse(BaseModel):
    """Response for getting quality history"""
    patient_id: Optional[str] = Field(None, description="Patient ID if querying specific patient")
    history: List[QualityDataPoint] = Field(..., description="List of quality data points")
    count: int = Field(..., description="Number of records returned")


class QualityConnectionInfo(BaseModel):
    """Information about a WebSocket connection"""
    id: str
    connected_at: str
    client_info: Dict[str, str]
    patient_id: Optional[str] = None


class QualityConnectionsResponse(BaseModel):
    """Response for getting WebSocket connections"""
    count: int = Field(..., description="Number of active connections")
    connections: List[QualityConnectionInfo] = Field(..., description="List of connection details")

