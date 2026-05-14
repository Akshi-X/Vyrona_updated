"""
Lane Risk Assessment Utilities
Contains utility functions and classes for lane risk assessment calculations
"""
import asyncio
import json
import logging
import time
from typing import Any, Dict, List, Optional
from datetime import datetime, timezone, timedelta, time as dt_time

from app.service.redis_service import get_redis
from app.constants.lane_risk_constants import (
    LPI_TIMELINESS_API_URL,
    LPI_OVERALL_API_URL,
    LPI_CACHE_TTL,
    LPI_REDIS_KEY_PREFIX,
    LPI_REDIS_MAP_KEY,
    LPI_REDIS_TIMESTAMP_KEY,
    LPI_OVERALL_REDIS_KEY_PREFIX,
    LPI_OVERALL_REDIS_MAP_KEY,
    LPI_OVERALL_REDIS_TIMESTAMP_KEY,
    LPI_TIMELINESS_FALLBACK_MAP,
)

logger = logging.getLogger(__name__)

# Try to import httpx for external API calls (available in dev dependencies)
try:
    import httpx
    HTTPX_AVAILABLE = True
    # Create a shared HTTP client with connection pooling for better performance
    _http_client = httpx.Client(
        timeout=httpx.Timeout(60.0, connect=10.0), 
        limits=httpx.Limits(max_keepalive_connections=10, max_connections=20)
    )
except ImportError:
    HTTPX_AVAILABLE = False
    _http_client = None
    logger.warning("httpx not available. World Bank LPI data fetching will use cached data only.")

# In-memory cache as fallback (for single-instance deployments)
_lpi_live_cache: Dict[str, float] = {}
_lpi_live_cache_timestamp: Optional[datetime] = None
_lpi_overall_cache: Dict[str, float] = {}
_lpi_overall_cache_timestamp: Optional[datetime] = None


class LaneRiskUtils:
    """Utility class for lane risk assessment helper functions"""
    
    @staticmethod
    def fetch_lpi_data_from_api(api_url: str, max_retries: int = 3) -> Optional[Dict[str, Dict[str, Any]]]:
        """
        Generic function to fetch LPI data from World Bank API.
        Returns aggregated data dictionary keyed by normalized country codes.
        
        Includes retry logic with exponential backoff for timeout handling.
        """
        if not HTTPX_AVAILABLE:
            logger.warning("httpx not available, cannot fetch LPI data from World Bank API")
            return None
        
        for attempt in range(max_retries):
            try:
                aggregated: Dict[str, Dict[str, Any]] = {}
                page = 1
                per_page = 500
                
                while True:
                    params = {
                        "format": "json",
                        "per_page": per_page,
                        "page": page
                    }
                    
                    # Use shared HTTP client with connection pooling for better performance
                    if _http_client:
                        response = _http_client.get(api_url, params=params)
                    else:
                        # Fallback if client not available
                        response = httpx.get(api_url, params=params, timeout=httpx.Timeout(60.0, connect=10.0))
                    response.raise_for_status()
                    payload = response.json()
                    
                    if not isinstance(payload, list) or len(payload) < 2:
                        break
                    
                    metadata, entries = payload
                    
                    if not isinstance(entries, list):
                        break
                    
                    for entry in entries:
                        value = entry.get("value")
                        date = entry.get("date")
                        if value is None or date is None:
                            continue
                        
                        country_info = entry.get("country") or {}
                        iso2 = country_info.get("id")
                        country_name = country_info.get("value")
                        iso3 = entry.get("countryiso3code")
                        
                        keys = [iso3, iso2, country_name]
                        
                        for key in keys:
                            if not key:
                                continue
                            normalized_key = key.strip().upper()
                            existing = aggregated.get(normalized_key)
                            if not existing or date > existing.get("date", ""):
                                aggregated[normalized_key] = {"value": float(value), "date": date}
                    
                    total_pages = int(metadata.get("pages", 1)) if isinstance(metadata, dict) else 1
                    if page >= total_pages:
                        break
                    page += 1
                
                if aggregated:
                    logger.info(f"World Bank LPI data fetched successfully - {len(aggregated)} countries")
                    return aggregated
                else:
                    logger.warning("World Bank API returned no data")
                    return None
            
            except httpx.TimeoutException as exc:
                wait_time = (2 ** attempt) * 5  # Exponential backoff: 5s, 10s, 20s
                if attempt < max_retries - 1:
                    logger.warning(f"World Bank API timeout (attempt {attempt + 1}/{max_retries}), retrying in {wait_time}s...")
                    time.sleep(wait_time)
                else:
                    logger.error(f"World Bank API timeout after {max_retries} attempts - URL: {api_url}")
                    return None
            except httpx.HTTPError as exc:
                logger.error(f"World Bank API HTTP error - URL: {api_url}, Error: {exc}")
                return None
            except json.JSONDecodeError as exc:
                logger.error(f"World Bank API JSON decode error - URL: {api_url}, Error: {exc}")
                return None
            except Exception as exc:
                logger.error(f"World Bank API unexpected error - URL: {api_url}, Error: {exc}", exc_info=True)
                return None
        
        return None
    
    @staticmethod
    def get_lpi_map_with_cache(
        api_url: str,
        redis_map_key: str,
        redis_timestamp_key: str,
        cache_var_name: str,
        force_refresh: bool = False
    ) -> Optional[Dict[str, float]]:
        """
        Generic function to get LPI map with Redis and in-memory caching.
        Reduces code duplication between Timeliness and Overall LPI fetching.
        """
        global _lpi_live_cache, _lpi_live_cache_timestamp, _lpi_overall_cache, _lpi_overall_cache_timestamp
        
        if not HTTPX_AVAILABLE:
            return None
        
        now = datetime.now(timezone.utc)
        
        # Try Redis cache first
        try:
            r = get_redis()
            if not force_refresh:
                cached_map_json = r.get(redis_map_key)
                cached_timestamp_str = r.get(redis_timestamp_key)
                
                if cached_map_json and cached_timestamp_str:
                    try:
                        cached_timestamp = datetime.fromisoformat(cached_timestamp_str)
                        cache_age = now - cached_timestamp
                        if cache_age < LPI_CACHE_TTL:
                            cached_map = json.loads(cached_map_json)
                            logger.debug(f"World Bank LPI {cache_var_name} data from cache - {len(cached_map)} countries")
                            # Update in-memory cache
                            if cache_var_name == "timeliness":
                                _lpi_live_cache = cached_map
                                _lpi_live_cache_timestamp = cached_timestamp
                            else:
                                _lpi_overall_cache = cached_map
                                _lpi_overall_cache_timestamp = cached_timestamp
                            return cached_map
                    except (ValueError, json.JSONDecodeError):
                        pass
        except Exception as e:
            logger.debug(f"Redis cache check failed: {e}")
        
        # Check in-memory cache
        if cache_var_name == "timeliness":
            cache_var = _lpi_live_cache
            cache_timestamp_var = _lpi_live_cache_timestamp
        else:
            cache_var = _lpi_overall_cache
            cache_timestamp_var = _lpi_overall_cache_timestamp
        
        if (
            not force_refresh
            and cache_var
            and cache_timestamp_var
            and now - cache_timestamp_var < LPI_CACHE_TTL
        ):
            logger.debug(f"World Bank LPI {cache_var_name} data from in-memory cache")
            return cache_var
        
        # Fetch from API
        logger.debug(f"Fetching World Bank LPI {cache_var_name} data from API")
        aggregated = LaneRiskUtils.fetch_lpi_data_from_api(api_url)
        if not aggregated:
            return None
        
        result_map = {key: data["value"] for key, data in aggregated.items()}
        
        # Store in Redis (batch operation using pipeline)
        try:
            r = get_redis()
            ttl_seconds = int(LPI_CACHE_TTL.total_seconds())
            pipe = r.pipeline()
            pipe.setex(redis_map_key, ttl_seconds, json.dumps(result_map))
            pipe.setex(redis_timestamp_key, ttl_seconds, now.isoformat())
            pipe.execute()
            logger.debug(f"World Bank LPI {cache_var_name} data cached in Redis")
        except Exception as e:
            logger.debug(f"Failed to store World Bank LPI {cache_var_name} in Redis: {e}")
        
        # Update in-memory cache
        if cache_var_name == "timeliness":
            _lpi_live_cache = result_map
            _lpi_live_cache_timestamp = now
        else:
            _lpi_overall_cache = result_map
            _lpi_overall_cache_timestamp = now
        
        return result_map
    
    @staticmethod
    def get_live_lpi_timeliness_map(force_refresh: bool = False) -> Optional[Dict[str, float]]:
        """
        Fetch the most recent LPI Timeliness scores from the World Bank API.
        Results are cached in Redis (24h TTL) and in-memory as fallback.
        """
        return LaneRiskUtils.get_lpi_map_with_cache(
            LPI_TIMELINESS_API_URL,
            LPI_REDIS_MAP_KEY,
            LPI_REDIS_TIMESTAMP_KEY,
            "timeliness",
            force_refresh
        )
    
    @staticmethod
    def get_live_lpi_overall_map(force_refresh: bool = False) -> Optional[Dict[str, float]]:
        """
        Fetch the most recent LPI Overall (composite) scores from the World Bank API.
        Results are cached in Redis (24h TTL) and in-memory as fallback.
        The overall LPI is a composite score based on 6 dimensions:
        1. Customs efficiency
        2. Quality of transport and trade infrastructure
        3. Ease of arranging international shipments
        4. Competence of logistics services
        5. Ability to track and trace consignments
        6. Timeliness of deliveries
        """
        return LaneRiskUtils.get_lpi_map_with_cache(
            LPI_OVERALL_API_URL,
            LPI_OVERALL_REDIS_MAP_KEY,
            LPI_OVERALL_REDIS_TIMESTAMP_KEY,
            "overall",
            force_refresh
        )
    
    @staticmethod
    def match_country_in_map(country_code: str, source_map: Dict[str, float]) -> Optional[float]:
        """
        Helper to match ISO codes or names against an LPI lookup map.
        Optimized: Direct lookup first, then partial matching only if needed.
        """
        if not country_code or not source_map:
            return None
        
        normalized_code = country_code.strip().upper()
        
        # Direct lookup (O(1))
        if normalized_code in source_map:
            return source_map[normalized_code]
        
        # Partial matching (O(n) but only if direct lookup fails)
        # This handles cases like "UNITED STATES" matching "UNITED STATES OF AMERICA"
        for key, value in source_map.items():
            if normalized_code in key or key in normalized_code:
                return value
        
        return None
    
    @staticmethod
    def map_delay_to_category(
        delay_minutes: Optional[float],
        cancelled: bool = False,
        diverted: bool = False
    ) -> str:
        """
        Step 1: Determine Delay Category (Table 10)
        
        Category Logic:
        - On Time: < 15 min late
        - Late: ≥ 15 min late
        - Very Late: ≥ 30 min late
        - Excessive: ≥ 45 min late
        - Cancelled: flight_status == cancelled
        - Diverted: flight_status == diverted
        
        Args:
            delay_minutes: Delay in minutes (None if unknown)
            cancelled: Whether flight was cancelled
            diverted: Whether flight was diverted
            
        Returns:
            Category string: 'on_time', 'late', 'very_late', 'excessive', 'cancelled', 'diverted'
        """
        if cancelled:
            return "cancelled"
        if diverted:
            return "diverted"
        if delay_minutes is None:
            return "on_time"  # Default to on_time if delay unknown
        
        if delay_minutes < 15:
            return "on_time"
        elif delay_minutes < 30:
            return "late"
        elif delay_minutes < 45:
            return "very_late"
        else:
            return "excessive"
    
    @staticmethod
    def category_to_indicator(category: str) -> float:
        """
        Step 2: Convert Category → FlightStats Indicator (0-5)
        
        Mandatory mapping:
        - On Time: 5
        - Late: 3
        - Very Late: 2
        - Excessive: 1
        - Cancelled: 0
        - Diverted: 0
        
        Args:
            category: Delay category string
            
        Returns:
            Indicator value (0-5)
        """
        mapping = {
            "on_time": 5.0,
            "late": 3.0,
            "very_late": 2.0,
            "excessive": 1.0,
            "cancelled": 0.0,
            "diverted": 0.0
        }
        return mapping.get(category.lower(), 0.0)
    
    @staticmethod
    def indicator_to_classification(indicator: float) -> str:
        """
        Step 3: Convert Indicator → Final Classification (Table 11)
        
        Indicator Range → Classification:
        - 0-0.9: Basic
        - 1-1.9: Moderate
        - 2-2.9: Good
        - 3-3.9: Very Good
        - 4-5: Excellent
        
        Args:
            indicator: FlightStats indicator (0-5)
            
        Returns:
            Classification string
        """
        if indicator >= 4.0:
            return "Excellent"
        elif indicator >= 3.0:
            return "Very Good"
        elif indicator >= 2.0:
            return "Good"
        elif indicator >= 1.0:
            return "Moderate"
        else:
            return "Basic"
    
    @staticmethod
    def score_to_classification(score: float) -> str:
        """
        Convert numeric score to classification
        Based on Table 11 mapping
        """
        if score >= 4.0:
            return "Excellent"
        elif score >= 3.0:
            return "Very Good"
        elif score >= 2.0:
            return "Good"
        elif score >= 1.0:
            return "Moderate"
        else:
            return "Basic"
    
    @staticmethod
    def get_location_name_from_google_maps(
        latitude: float,
        longitude: float,
        api_key: str
    ) -> Optional[str]:
        """
        Use Google Maps Reverse Geocoding API to get location name from coordinates.
        This enhances weather reports with human-readable location names.
        """
        try:
            url = "https://maps.googleapis.com/maps/api/geocode/json"
            params = {
                "latlng": f"{latitude},{longitude}",
                "key": api_key
            }
            
            # Use shared HTTP client for better performance
            if _http_client:
                response = _http_client.get(url, params=params)
            else:
                response = httpx.get(url, params=params, timeout=5.0)
            response.raise_for_status()
            data = response.json()
            
            if data.get("status") == "OK" and data.get("results"):
                # Get the most specific result (first one is usually most specific)
                result = data["results"][0]
                location_name = result.get("formatted_address")
                return location_name
            
            return None
            
        except Exception as e:
            logger.debug(f"Google Maps reverse geocoding error: {e}")
            return None


# Backward compatibility: Keep module-level functions for existing code
def _get_live_lpi_timeliness_map(force_refresh: bool = False) -> Optional[Dict[str, float]]:
    """Backward compatibility wrapper"""
    return LaneRiskUtils.get_live_lpi_timeliness_map(force_refresh)


def _get_live_lpi_overall_map(force_refresh: bool = False) -> Optional[Dict[str, float]]:
    """Backward compatibility wrapper"""
    return LaneRiskUtils.get_live_lpi_overall_map(force_refresh)


async def schedule_daily_lpi_fetch():
    """
    Schedule daily World Bank LPI data fetch at midnight (00:00 UTC).
    Fetches both Timeliness and Overall LPI data.
    
    This runs as a background task and automatically refreshes LPI data
    from the World Bank API every day at midnight UTC.
    """
    async def fetch_lpi_data_at_midnight():
        """Fetch LPI data at midnight"""
        while True:
            try:
                now = datetime.now(timezone.utc)
                
                # Calculate next midnight UTC (always tomorrow at 00:00:00)
                next_midnight = datetime.combine(
                    now.date() + timedelta(days=1),
                    dt_time(0, 0, 0),
                    timezone.utc
                )
                
                wait_seconds = (next_midnight - now).total_seconds()
                logger.info(f"World Bank LPI daily fetch scheduled for {next_midnight.strftime('%Y-%m-%d %H:%M:%S')} UTC "
                           f"(in {wait_seconds/3600:.1f} hours)")
                
                await asyncio.sleep(wait_seconds)
                
                # Fetch LPI data at midnight
                logger.info("Starting scheduled World Bank LPI data fetch at midnight...")
                try:
                    # Force refresh to get latest data
                    timeliness_map = LaneRiskUtils.get_live_lpi_timeliness_map(force_refresh=True)
                    overall_map = LaneRiskUtils.get_live_lpi_overall_map(force_refresh=True)
                    
                    if timeliness_map:
                        logger.info(f"World Bank LPI Timeliness data fetched: {len(timeliness_map)} countries")
                    if overall_map:
                        logger.info(f"World Bank LPI Overall data fetched: {len(overall_map)} countries")
                    
                    logger.info("World Bank LPI daily fetch completed successfully")
                except Exception as e:
                    logger.error(f"Error during scheduled World Bank LPI fetch: {e}", exc_info=True)
                
            except Exception as e:
                logger.error(f"Error in LPI fetch scheduler: {e}", exc_info=True)
                # Wait 1 hour before retrying on error
                await asyncio.sleep(3600)
    
    # Start the scheduler
    await fetch_lpi_data_at_midnight()
