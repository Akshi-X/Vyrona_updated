"""
IVF Dashboard Schemas
Response models for IVF dashboard metrics
"""
from pydantic import BaseModel, Field
from typing import Optional, Dict, List, Any
from datetime import datetime


class TotalEmbryosCryolocksResponse(BaseModel):
    """Response for total embryos and cryolocks metric"""
    total_embryos: int = Field(..., description="Total number of active embryos")
    total_cryolocks: int = Field(..., description="Total number of cryolocks")
    total_embryos_cryolocks: int = Field(..., description="Total count of embryos and cryolocks combined")
    last_updated: datetime = Field(default_factory=datetime.now, description="Last update timestamp")
    status: str = Field(default="success", description="Response status")


class TotalContainersResponse(BaseModel):
    """Response for total containers metric"""
    total_containers: int = Field(..., description="Total number of active containers (canisters)")
    last_updated: datetime = Field(default_factory=datetime.now, description="Last update timestamp")
    status: str = Field(default="success", description="Response status")


class QualityDeviationsFlaggedResponse(BaseModel):
    """Response for quality deviations flagged metric"""
    total_quality_deviations: int = Field(..., description="Total number of quality deviations flagged")
    canister_status_deviations: int = Field(..., description="Deviations from canister status (risk/critical)")
    ln2_level_deviations: int = Field(..., description="Deviations from low LN2 levels")
    last_updated: datetime = Field(default_factory=datetime.now, description="Last update timestamp")
    status: str = Field(default="success", description="Response status")


class TopDeviationDriverResponse(BaseModel):
    """Response for top deviation driver metric"""
    driver_name: str = Field(..., description="Name of the top deviation driver")
    count: int = Field(..., description="Count of deviations for this driver")
    percentage: float = Field(..., description="Percentage of total deviations")
    all_drivers: Optional[Dict[str, int]] = Field(None, description="Counts for all deviation drivers")
    last_updated: datetime = Field(default_factory=datetime.now, description="Last update timestamp")
    status: str = Field(default="success", description="Response status")


class OutboundShipmentsResponse(BaseModel):
    """Response for outbound shipments metric"""
    total_outbound_shipments: int = Field(..., description="Total number of outbound shipments (canister operations)")
    last_updated: datetime = Field(default_factory=datetime.now, description="Last update timestamp")
    status: str = Field(default="success", description="Response status")


class DeviationsGraphResponse(BaseModel):
    """Response for deviations graph metric
    
    User view: Returns containers from user's branch/site with individual driver counts and top risk driver per container
    Manager view: Returns sites with cumulative driver counts and top risk driver per site
    """
    view_level: str = Field(..., description="View level: container (user) or site (manager/admin)")
    data: List[Dict[str, Any]] = Field(..., description="Deviation data for charting. For user: list of containers. For manager: list of sites.")
    top_deviation_type: Optional[str] = Field(None, description="Top contributing deviation type overall (deprecated, kept for backward compatibility)")
    last_updated: datetime = Field(default_factory=datetime.now, description="Last update timestamp")
    status: str = Field(default="success", description="Response status")


class IVFDashboardMetricsResponse(BaseModel):
    """Response for all IVF dashboard metrics"""
    total_embryos_cryolocks: Dict = Field(..., description="Total embryos and cryolocks metric")
    total_containers: Dict = Field(..., description="Total containers metric")
    quality_deviations_flagged: Dict = Field(..., description="Quality deviations flagged metric")
    top_deviation_driver: Dict = Field(..., description="Top deviation driver metric")
    outbound_shipments: Dict = Field(..., description="Outbound shipments metric")
    deviations_graph: Dict = Field(..., description="Deviations graph metric")
    last_updated: datetime = Field(default_factory=datetime.now, description="Last update timestamp")
    status: str = Field(default="success", description="Response status")
