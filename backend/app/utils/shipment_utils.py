"""
Shipment Utility Functions

Utility functions for shipment-related operations.
These are pure functions that don't require database access.
"""

from datetime import datetime, timezone
from typing import List, Dict, Optional, Any, Tuple
from sqlalchemy.orm import Query

from ..models.shipment_model import Shipment
from ..constants.enums import RouteStatus
from ..constants.messages import InfoMessages
from ..utils.utils import get_countries_by_regions, country_to_region


def has_filters_applied(
    route_status: Optional[str] = None,
    carriers: Optional[List[str]] = None,
    regions: Optional[List[str]] = None
) -> bool:
    """Check if any filters are applied"""
    return (
        route_status is not None or
        (carriers is not None and len(carriers) > 0) or
        (regions is not None and len(regions) > 0)
    )


def add_no_routes_message(
    response: Dict[str, Any],
    route_status: Optional[str] = None,
    carriers: Optional[List[str]] = None,
    regions: Optional[List[str]] = None,
    routes_count: int = 0
) -> Dict[str, Any]:
    """
    Add "Active routes not available" message to response if filters are applied and no routes found.
    
    Args:
        response: Response dictionary to modify
        route_status: Optional route status filter
        carriers: Optional list of carrier names
        regions: Optional list of regions
        routes_count: Number of routes found
        
    Returns:
        Modified response dictionary with message if applicable
    """
    if has_filters_applied(route_status, carriers, regions) and routes_count == 0:
        response["message"] = InfoMessages.SHIPMENT_ACTIVE_ROUTES_NOT_AVAILABLE
    return response


def normalize_datetime_to_utc(dt: datetime) -> datetime:
    """Normalize a datetime to UTC timezone."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    elif dt.tzinfo != timezone.utc:
        return dt.astimezone(timezone.utc)
    return dt


def calculate_transit_days(departure_time: Optional[datetime]) -> Optional[float]:
    """Calculate transit days from departure time to now."""
    if not departure_time:
        return None
    departure = normalize_datetime_to_utc(departure_time)
    now = datetime.now(timezone.utc)
    transit_duration = now - departure
    return transit_duration.total_seconds() / (24 * 3600)


def parse_route_status_filter(route_status: str) -> Optional[RouteStatus]:
    """Parse route status filter string to RouteStatus enum."""
    route_status_lower = route_status.lower()
    if route_status_lower == "safe":
        return RouteStatus.SAFE
    elif route_status_lower == "delayed":
        return RouteStatus.DELAYED
    elif route_status_lower in ("high_risk", "risk_route"):
        return RouteStatus.HIGH_RISK
    return None


def carrier_matches_filter(route_carrier: Optional[str], filter_carriers: List[str]) -> bool:
    """Check if the route carrier matches any of the filter carriers (partial match, case-insensitive)."""
    if not route_carrier:
        return False
    
    route_carrier_lower = route_carrier.lower()
    filter_carriers_lower = [c.lower() for c in filter_carriers]
    
    for filter_carrier in filter_carriers_lower:
        if filter_carrier in route_carrier_lower or route_carrier_lower in filter_carrier:
            return True
    return False


def apply_region_filter(query: Query, regions: Optional[List[str]] = None) -> Query:
    """
    Apply region-based filtering to a shipment query.
    Matches if either source OR destination is in the specified regions.
    
    Args:
        query: SQLAlchemy query object
        regions: Filter by regions - matches if either source OR destination is in the specified regions
        
    Returns:
        Filtered query object
    """
    if not regions:
        return query
    
    # Get country codes for the specified regions
    region_countries = get_countries_by_regions(regions)
    
    # If regions were provided but no countries match (invalid region), return empty result
    if not region_countries:
        # Apply a filter that will never match (no results)
        from sqlalchemy import and_
        query = query.filter(Shipment.id == -1)
        return query
    
    # Match if source OR destination is in the regions
    from sqlalchemy import or_
    query = query.filter(
        or_(
            Shipment.source_country.in_(region_countries),
            Shipment.destination_country.in_(region_countries)
        )
    )
    
    return query


def resolve_route_regions(
    source_country: Optional[str],
    destination_country: Optional[str]
) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    """
    Determine route, source, and destination regions from country codes.

    Returns:
        Tuple of (route_region, source_region, destination_region)
    """
    source_region = country_to_region(source_country) if source_country else None
    destination_region = country_to_region(destination_country) if destination_country else None

    if source_region and destination_region:
        if source_region == destination_region:
            route_region = source_region
        else:
            route_region = f"{source_region} → {destination_region}"
    elif source_region:
        route_region = source_region
    elif destination_region:
        route_region = destination_region
    else:
        route_region = None

    return route_region, source_region, destination_region


def format_duration(start_dt: Optional[datetime], end_dt: Optional[datetime]) -> Optional[str]:
    """Format duration between two datetimes as '<hours> h' with up to two decimal places."""
    if not start_dt or not end_dt:
        return None
    
    start = normalize_datetime_to_utc(start_dt)
    end = normalize_datetime_to_utc(end_dt)
    
    duration = end - start
    total_seconds = int(duration.total_seconds())
    
    if total_seconds <= 0:
        return None
    
    total_hours = total_seconds / 3600
    rounded_hours = round(total_hours, 2)
    formatted_hours = f"{rounded_hours:.2f}".rstrip('0').rstrip('.')

    if not formatted_hours:
        formatted_hours = "0"

    return f"{formatted_hours} h"


def get_start_date_from_shipment(shipment: Shipment) -> Optional[str]:
    """Get start date from shipment (departure_time or updated_at as fallback)."""
    if shipment.departure_time:
        return shipment.departure_time.date().isoformat()
    elif shipment.updated_at:
        return shipment.updated_at.date().isoformat()
    return None


def format_time_12hour(dt: Optional[datetime]) -> Optional[str]:
    """Format datetime to 24-hour time format like '16:25:17'."""
    if not dt:
        return None
    dt_normalized = normalize_datetime_to_utc(dt)
    # Format as 24-hour time (HH:MM:SS)
    return dt_normalized.strftime("%H:%M:%S")

