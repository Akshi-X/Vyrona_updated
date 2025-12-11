"""Lane complexity risk factor calculations."""
import json
import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple

from app.config.config import settings
from app.constants.lane_risk_constants import (
    FLIGHT_PERFORMANCE_CACHE_TTL,
    FLIGHT_PERFORMANCE_CONSTANTS,
    FLIGHT_PERFORMANCE_REDIS_KEY_PREFIX,
    LPI_CACHE_TTL,
    LPI_OVERALL_REDIS_KEY_PREFIX,
    LPI_REDIS_KEY_PREFIX,
    LPI_TIMELINESS_FALLBACK_MAP,
    WEATHER_CACHE_TTL,
    WEATHER_CONSTANTS,
)
from app.models.shipment_leg_model import ShipmentLeg
from app.models.shipment_model import Shipment
from app.service.redis_service import get_redis
from app.utils.lane_risk_utils import LaneRiskUtils

logger = logging.getLogger(__name__)

# Optional httpx client for external calls
try:
    import httpx

    HTTPX_AVAILABLE = True
    _http_client = httpx.Client(
        timeout=httpx.Timeout(60.0, connect=10.0),
        limits=httpx.Limits(max_keepalive_connections=10, max_connections=20),
    )
except ImportError:
    HTTPX_AVAILABLE = False
    _http_client = None
    logger.warning("httpx not available. Flight OTP will rely on cached/fallback data.")


class LaneComplexityCalculator:
    """Encapsulates lane-complexity related risk calculations."""

    def __init__(self, db, parking_stops_calculator):
        self.db = db
        self.parking_stops_calculator = parking_stops_calculator

    def calculate(self, shipments: List[Shipment]) -> Dict:
        """Calculate Lane Complexity risk factor."""
        contributors: List[str] = []
        scores: List[float] = []

        if not shipments:
            return {
                "risk_factor": "Lane Complexity",
                "risk_contributors": ["-", "-", "-", "-"],
                "risk_scale": "N/A",
            }

        num_legs_score, num_legs_classification = self._calculate_number_of_legs_score(
            shipments
        )
        contributors.append(f"Number of Legs: {num_legs_classification}")
        scores.append(num_legs_score)

        parking_stops_score, parking_stops_info = self.parking_stops_calculator.calculate(
            shipments
        )
        contributors.append(parking_stops_info)
        if parking_stops_score is not None:
            scores.append(parking_stops_score)

        flight_score, flight_info = self._calculate_on_time_flight_performance(
            shipments
        )
        contributors.append(f"On time flight performance: {flight_info}")
        if flight_score is not None:
            scores.append(flight_score)

        timeliness_score, timeliness_info = self._calculate_world_bank_timeliness_score(
            shipments
        )
        contributors.append(f"World bank timeliness index: {timeliness_info}")
        if timeliness_score is not None:
            scores.append(timeliness_score)

        while len(contributors) < 4:
            contributors.append("-")

        if scores:
            avg_score = sum(scores) / len(scores)
            classification = LaneRiskUtils.score_to_classification(avg_score)
            risk_scale = f"{avg_score:.1f} ({classification})"
        else:
            risk_scale = "N/A"

        return {
            "risk_factor": "Lane Complexity",
            "risk_contributors": contributors[:4],
            "risk_scale": risk_scale,
        }
    
    
    def _calculate_number_of_legs_score(
        self,
        shipments: List[Shipment]
    ) -> Tuple[float, str]:
        """
        Calculate score based on number of legs
        Table 9: >6 legs = 0.5 (Basic), 5 = 1.5 (Moderate), 4 = 2.5 (Good), 3 = 3.5 (Very Good), ≤2 = 4.5 (Excellent)
        """
        total_legs = 0
        shipment_count = 0
        
        for shipment in shipments:
            leg_count = len(shipment.shipment_legs)
            total_legs += leg_count
            shipment_count += 1
        
        if shipment_count == 0:
            return 2.5, "N/A"
        
        avg_legs = total_legs / shipment_count
        
        if avg_legs > 6:
            return 0.5, "Basic"
        elif avg_legs >= 5:
            return 1.5, "Moderate"
        elif avg_legs >= 4:
            return 2.5, "Good"
        elif avg_legs >= 3:
            return 3.5, "Very Good"
        else:  # <= 2
            return 4.5, "Excellent"
    
    
    def _calculate_on_time_flight_performance(
        self,
        shipments: List[Shipment]
    ) -> Tuple[Optional[float], str]:
        """
        Calculate On-Time Flight Performance score.
        
        For every flight, we assess the on-time flight performance score based on:
        1. FlightRadar24 API data (primary source)
        2. United States (Open Data): Bureau of Transportation Statistics (BTS)
        3. Europe (Open Data): Eurocontrol — Monthly Airspace Delay Reports
        4. Global (Fallback): World Bank LPI Timeliness Index
        5. myGrape Internal Shipment Data (historical lane performance)
        
        FlightStats provides an indicator between 0 and 5 based on actual delays and cancellations.
        This indicator is then translated to a classification between Basic and Excellent:
        - 0-0.9: Basic
        - 1-1.9: Moderate
        - 2-2.9: Good
        - 3-3.9: Very Good
        - 4-5: Excellent
        
        On-Time Flight Performance Ratings:
        - On Time: No delay or delay < 15 minutes
        - Late: Delay of 15min or more
        - Very Late: Delay of 30min or more
        - Excessive: Delay of 45min or more
        - Cancelled: Flight cancelled
        - Diverted: Flight diverted
        
        Returns:
            Tuple of (score, description) where score is 0.5-4.5 (lower = higher risk)
        """
        if not shipments:
            return None, "N/A"
        
        # Collect all air/flight legs
        flight_legs = []
        for shipment in shipments:
            for leg in shipment.shipment_legs:
                # Check if it's an air/flight leg (case-insensitive)
                if leg.mode_of_transport and leg.mode_of_transport.lower() in ['air', 'flight', 'airplane', 'aircraft', 'aviation']:
                    flight_legs.append(leg)
        
        if not flight_legs:
            return None, "No flight legs"
        
        # Calculate OTP for all flight legs using the new OTP service
        otp_results = []
        all_categories = []
        
        for leg in flight_legs:
            # Automatically extract flight code from leg
            flight_code = self._extract_flight_code(leg)
            
            # Get destination country from shipment
            destination_country = None
            if leg.shipment:
                destination_country = leg.shipment.destination_country
            
            # Log flight code extraction for debugging
            logger.info(
                f"Processing flight leg {leg.id}: flight_code={flight_code}, "
                f"from={leg.from_location}, to={leg.to_location}, "
                f"destination_country={destination_country}"
            )
            
            # Calculate OTP with automatic fallback chaining
            otp_result = self._calculate_otp_for_leg(
                leg=leg,
                flight_code=flight_code,
                destination_country=destination_country
            )
            
            if otp_result:
                otp_results.append(otp_result)
                all_categories.extend(otp_result.get('delay_categories', []))
                logger.info(
                    f"OTP result for leg {leg.id}: {otp_result['source_used']} - "
                    f"indicator={otp_result['indicator_score']}, "
                    f"classification={otp_result['classification']}, "
                    f"categories={otp_result['delay_categories']}"
                )
            else:
                logger.warning(f"No OTP result for leg {leg.id} - all sources failed")
        
        if not otp_results:
            # Fallback: Use World Bank Timeliness Index for the route
            logger.debug("No OTP data available, using World Bank Timeliness Index as fallback")
            timeliness_score, timeliness_info = self._calculate_world_bank_timeliness_score(shipments)
            if timeliness_score is not None:
                return timeliness_score, f"Fallback: {timeliness_info}"
            return None, "No flight data available"
        
        # Aggregate indicators from all OTP results
        indicators = [result['indicator_score'] for result in otp_results]
        avg_indicator = sum(indicators) / len(indicators) if indicators else 0.0
        
        # Map indicator (0-5) to lane score (0.5-4.5)
        # Linear mapping: 0 -> 0.5, 5 -> 4.5
        lane_score = 0.5 + (avg_indicator * 0.8)  # 0.8 = (4.5-0.5)/5
        classification = LaneRiskUtils.score_to_classification(lane_score)
        
        # Determine primary data source
        sources = [result['source_used'] for result in otp_results]
        primary_source = sources[0] if sources else 'unknown'
        
        # Count categories
        category_counts = {}
        for cat in all_categories:
            category_counts[cat] = category_counts.get(cat, 0) + 1
        
        # Build description
        status_parts = []
        if category_counts.get('on_time', 0) > 0:
            status_parts.append(f"{category_counts['on_time']} on-time")
        if category_counts.get('late', 0) > 0:
            status_parts.append(f"{category_counts['late']} late")
        if category_counts.get('very_late', 0) > 0:
            status_parts.append(f"{category_counts['very_late']} very late")
        if category_counts.get('excessive', 0) > 0:
            status_parts.append(f"{category_counts['excessive']} excessive")
        if category_counts.get('cancelled', 0) > 0:
            status_parts.append(f"{category_counts['cancelled']} cancelled")
        if category_counts.get('diverted', 0) > 0:
            status_parts.append(f"{category_counts['diverted']} diverted")
        
        if status_parts:
            info = f"{len(otp_results)} flight(s): {', '.join(status_parts)} ({classification}, source: {primary_source})"
        else:
            info = f"{len(otp_results)} flight(s) ({classification}, source: {primary_source})"
        
        # Format detailed log message with all data
        log_details = (
            f"OTP Calculation Complete - "
            f"flight_legs={len(flight_legs)}, "
            f"otp_results={len(otp_results)}, "
            f"avg_indicator={round(avg_indicator, 2)}, "
            f"lane_score={round(lane_score, 2)}, "
            f"classification={classification}, "
            f"primary_source={primary_source}, "
            f"categories={category_counts}"
        )
        
        # Add per-leg details
        if otp_results:
            log_details += " | Per-leg details: "
            leg_details = []
            for idx, result in enumerate(otp_results):
                leg_details.append(
                    f"leg{idx+1}[source={result['source_used']}, "
                    f"indicator={result['indicator_score']}, "
                    f"classification={result['classification']}, "
                    f"categories={result['delay_categories']}]"
                )
            log_details += ", ".join(leg_details)
        
        logger.info(log_details)
        
        # Also log with extra for structured logging systems
        logger.info(
            "OTP Calculation Complete (structured)",
            extra={
                "flight_legs": len(flight_legs),
                "otp_results": len(otp_results),
                "avg_indicator": round(avg_indicator, 2),
                "lane_score": round(lane_score, 2),
                "classification": classification,
                "primary_source": primary_source,
                "categories": category_counts,
                "otp_result_details": otp_results,
            }
        )
        
        return lane_score, info
    
    def _get_flight_performance_data(self, leg) -> Optional[Dict[str, Any]]:
        """
        Get flight performance data for a shipment leg.
        
        Tries multiple data sources in order:
        1. FlightRadar24 API (if flight code available)
        2. Internal shipment data (historical performance)
        3. Regional data sources (BTS for US, Eurocontrol for Europe)
        4. World Bank LPI Timeliness Index (fallback)
        
        Returns:
            Dictionary with flight performance data:
            {
                'flightstats_indicator': float (0-5),
                'status': str ('on_time', 'late', 'very_late', 'excessive', 'cancelled', 'diverted'),
                'delay_minutes': int,
                'source': str ('flightradar24', 'internal', 'bts', 'eurocontrol', 'lpi')
            }
        """
        # Try FlightRadar24 API first (if flight code can be extracted)
        flight_code = self._extract_flight_code(leg)
        if flight_code:
            fr24_data = self._fetch_flightradar24_performance(flight_code, leg)
            if fr24_data:
                return fr24_data
        
        # Try internal shipment data (historical performance)
        internal_data = self._get_internal_flight_performance(leg)
        if internal_data:
            return internal_data
        
        # Try regional data sources based on route
        regional_data = self._get_regional_flight_performance(leg)
        if regional_data:
            return regional_data
        
        # Fallback to World Bank LPI Timeliness Index
        return self._get_lpi_fallback_performance(leg)
    
    def _extract_flight_code(self, leg) -> Optional[str]:
        """
        Extract flight code from shipment leg data.
        
        Returns:
            Flight code string (e.g., "AA1234") or None if not found
        """
        # Prefer explicit flight_code stored on the leg
        if getattr(leg, "flight_code", None):
            code = leg.flight_code.strip()
            return code.upper() if code else None
        return None
    
    def _fetch_flightradar24_performance(
        self,
        flight_code: str,
        leg
    ) -> Optional[Dict[str, Any]]:
        """
        Fetch flight performance data from FlightRadar24 API.
        
        API Documentation: https://fr24api.flightradar24.com/docs/endpoints/overview
        
        Args:
            flight_code: Flight code (e.g., "AA1234")
            leg: Shipment leg object
            
        Returns:
            Dictionary with flight performance data or None if unavailable
        """
        api_key = getattr(settings, 'FLIGHTRADAR24_API_KEY', None)
        logger.info(f"FR24 API key check: key_exists={api_key is not None}, key_length={len(api_key) if api_key else 0}, key_preview={api_key[:20] + '...' if api_key and len(api_key) > 20 else api_key}")
        if not api_key:
            logger.warning(f"FlightRadar24 API key not configured - cannot fetch data for {flight_code}")
            logger.warning(f"Please check: 1) .env file exists in backend/ directory, 2) FLIGHTRADAR24_API_KEY is set, 3) Server was restarted after adding the key")
            return None
        
        if not HTTPX_AVAILABLE:
            logger.warning(f"httpx not available for FlightRadar24 API calls - cannot fetch data for {flight_code}")
            return None
        
        # Check cache first
        cache_key = f"{FLIGHT_PERFORMANCE_REDIS_KEY_PREFIX}{flight_code}"
        try:
            r = get_redis()
            cached_data = r.get(cache_key)
            if cached_data:
                try:
                    cached_performance = json.loads(cached_data)
                    logger.debug(f"Using cached FlightRadar24 data for {flight_code}")
                    return cached_performance
                except (ValueError, json.JSONDecodeError):
                    pass
        except Exception as e:
            logger.debug(f"Redis cache check failed: {e}")
        
        try:
            # FlightRadar24 API endpoint for flight statistics
            # API Documentation: https://fr24api.flightradar24.com/docs/endpoints/overview
            # Sandbox endpoint: https://api.flightradar24.com/common/v1/flight/list.json
            # Note: API key format may be "key|secret" - use the full key as provided
            # The API key format from FlightRadar24 sandbox: "uuid|token"
            api_key_value = api_key  # Use full key as provided
            
            url = "https://api.flightradar24.com/common/v1/flight/list.json"
            params = {
                "query": flight_code,
                "fetchBy": "flight",
                "page": 1,
                "limit": 1
            }
            headers = {
                "Authorization": f"Bearer {api_key_value}",
                "Accept": "application/json"
            }
            
            # Alternative: If API uses query parameter instead of header
            # params["token"] = api_key_value
            
            response = None
            key_param = api_key_value.split("|", 1)[0] if "|" in api_key_value else api_key_value
            
            # Attempt 1: token as query param (sandbox-friendly), no Authorization header
            params_token = params.copy()
            params_token["token"] = key_param
            headers_token = {
                "Accept": "application/json",
                "User-Agent": "fr24-sandbox-client"
            }
            try:
                if _http_client:
                    response = _http_client.get(url, params=params_token, headers=headers_token)
                else:
                    response = httpx.get(url, params=params_token, headers=headers_token, timeout=10.0)
                response.raise_for_status()
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 403:
                    logger.info(f"FR24 token-param auth failed (403); retrying with bearer for {flight_code}")
                    # Attempt 2: bearer with full key
                    if _http_client:
                        response = _http_client.get(url, params=params, headers=headers)
                    else:
                        response = httpx.get(url, params=params, headers=headers, timeout=10.0)
                    response.raise_for_status()
                else:
                    raise
            data = response.json()
            
            logger.info(f"FR24 API response received for {flight_code}: status={response.status_code}, has_data={bool(data)}")
            
            # Parse FlightRadar24 response
            # API response structure may vary - handle multiple possible formats
            flight_data = None
            
            # Try different response structures
            if isinstance(data, dict):
                # Format 1: data.result.response.data[]
                if data.get("result") and isinstance(data["result"], dict):
                    response_data = data["result"].get("response", {})
                    if isinstance(response_data, dict) and response_data.get("data"):
                        flight_list = response_data["data"]
                        if isinstance(flight_list, list) and len(flight_list) > 0:
                            flight_data = flight_list[0]
                
                # Format 2: data.data[]
                if not flight_data and data.get("data"):
                    flight_list = data["data"]
                    if isinstance(flight_list, list) and len(flight_list) > 0:
                        flight_data = flight_list[0]
                
                # Format 3: Direct flight object
                if not flight_data and data.get("flight"):
                    flight_data = data["flight"]
                
                if flight_data:
                    # Extract delay information
                    scheduled_departure = flight_data.get("time", {}).get("scheduled", {}).get("departure")
                    actual_departure = flight_data.get("time", {}).get("real", {}).get("departure")
                    status = flight_data.get("status", {}).get("text", "").lower()
                    
                    delay_minutes = 0
                    flight_status = "on_time"
                    
                    if "cancelled" in status or "canceled" in status:
                        flight_status = "cancelled"
                    elif "diverted" in status:
                        flight_status = "diverted"
                    elif scheduled_departure and actual_departure:
                        # Calculate delay
                        try:
                            scheduled = datetime.fromtimestamp(scheduled_departure, tz=timezone.utc)
                            actual = datetime.fromtimestamp(actual_departure, tz=timezone.utc)
                            delay_minutes = int((actual - scheduled).total_seconds() / 60)
                            
                            if delay_minutes < FLIGHT_PERFORMANCE_CONSTANTS["ON_TIME_THRESHOLD_MINUTES"]:
                                flight_status = "on_time"
                            elif delay_minutes < FLIGHT_PERFORMANCE_CONSTANTS["LATE_THRESHOLD_MINUTES"]:
                                flight_status = "late"
                            elif delay_minutes < FLIGHT_PERFORMANCE_CONSTANTS["VERY_LATE_THRESHOLD_MINUTES"]:
                                flight_status = "very_late"
                            else:
                                flight_status = "excessive"
                        except (ValueError, TypeError):
                            pass
                    
                    # Calculate FlightStats indicator (0-5) based on performance
                    # Formula: Higher on-time rate = higher indicator
                    # Simplified: Based on delay and status
                    if flight_status == "cancelled":
                        flightstats_indicator = 0.0
                    elif flight_status == "diverted":
                        flightstats_indicator = 0.5
                    elif flight_status == "excessive":
                        flightstats_indicator = 1.0
                    elif flight_status == "very_late":
                        flightstats_indicator = 1.5
                    elif flight_status == "late":
                        flightstats_indicator = 2.5
                    else:  # on_time
                        flightstats_indicator = 4.5
                    
                    performance_data = {
                        "flightstats_indicator": flightstats_indicator,
                        "status": flight_status,
                        "delay_minutes": delay_minutes,
                        "source": "flightradar24"
                    }
                    
                    # Cache the result
                    try:
                        r = get_redis()
                        ttl_seconds = int(FLIGHT_PERFORMANCE_CACHE_TTL.total_seconds())
                        r.setex(cache_key, ttl_seconds, json.dumps(performance_data))
                    except Exception as e:
                        logger.debug(f"Failed to cache FlightRadar24 data: {e}")
                    
                    return performance_data
                else:
                    logger.warning(f"FR24 API returned data but no flight_data found for {flight_code}")
            else:
                logger.warning(f"FR24 API returned invalid response format (not a dict) for {flight_code}")
        
        except httpx.HTTPError as e:
            logger.warning(f"FlightRadar24 API HTTP error for {flight_code}: {e}")
        except Exception as e:
            logger.warning(f"Error fetching FlightRadar24 data for {flight_code}: {e}", exc_info=True)
        
        return None
    
    def _get_internal_flight_performance(self, leg) -> Optional[Dict[str, Any]]:
        """
        Get flight performance from internal shipment data (historical lane performance).
        
        As the platform scales, OTP is increasingly driven by historical lane performance
        captured from actual shipment logs.
        
        Returns:
            Dictionary with flight performance data or None if insufficient historical data
        """
        if not leg.shipment_id or not leg.from_location or not leg.to_location:
            return None
        
        try:
            r = get_redis()
            # Check for historical performance data for this route
            route_key = f"flight:performance:route:{leg.from_location}:{leg.to_location}"
            historical_data = r.get(route_key)
            
            if historical_data:
                try:
                    performance = json.loads(historical_data)
                    # Add source indicator
                    performance["source"] = "internal"
                    return performance
                except (ValueError, json.JSONDecodeError):
                    pass
            
            # Calculate from actual shipment data
            # Get all completed shipments on this route
            from sqlalchemy import and_
            completed_legs = self.db.query(ShipmentLeg).filter(
                and_(
                    ShipmentLeg.from_location == leg.from_location,
                    ShipmentLeg.to_location == leg.to_location,
                    ShipmentLeg.mode_of_transport.in_(['air', 'flight', 'airplane', 'aircraft', 'aviation']),
                    ShipmentLeg.arrival_time.isnot(None),
                    ShipmentLeg.scheduled_time.isnot(None)
                )
            ).limit(100).all()
            
            if len(completed_legs) < 5:  # Need at least 5 data points
                return None
            
            # Calculate on-time percentage
            on_time_count = 0
            total_delays = []
            
            for completed_leg in completed_legs:
                if completed_leg.arrival_time and completed_leg.scheduled_time:
                    delay = (completed_leg.arrival_time - completed_leg.scheduled_time).total_seconds() / 60
                    total_delays.append(delay)
                    if delay < FLIGHT_PERFORMANCE_CONSTANTS["ON_TIME_THRESHOLD_MINUTES"]:
                        on_time_count += 1
            
            if not total_delays:
                return None
            
            on_time_percentage = (on_time_count / len(total_delays)) * 100
            avg_delay = sum(total_delays) / len(total_delays)
            
            # Map to FlightStats indicator (0-5)
            # Higher on-time percentage = higher indicator
            if on_time_percentage >= 95:
                flightstats_indicator = 4.5
            elif on_time_percentage >= 85:
                flightstats_indicator = 3.5
            elif on_time_percentage >= 75:
                flightstats_indicator = 2.5
            elif on_time_percentage >= 60:
                flightstats_indicator = 1.5
            else:
                flightstats_indicator = 0.5
            
            performance_data = {
                "flightstats_indicator": flightstats_indicator,
                "status": "on_time" if avg_delay < FLIGHT_PERFORMANCE_CONSTANTS["ON_TIME_THRESHOLD_MINUTES"] else "late",
                "delay_minutes": int(avg_delay),
                "source": "internal",
                "on_time_percentage": on_time_percentage,
                "sample_size": len(total_delays)
            }
            
            # Cache the result
            try:
                ttl_seconds = int(FLIGHT_PERFORMANCE_CACHE_TTL.total_seconds())
                r.setex(route_key, ttl_seconds, json.dumps(performance_data))
            except Exception:
                pass
            
            return performance_data
            
        except Exception as e:
            logger.debug(f"Error getting internal flight performance: {e}")
            return None
    
    def _get_regional_flight_performance(self, leg) -> Optional[Dict[str, Any]]:
        """
        Get flight performance from regional data sources.
        """
        return None
    
    def _calculate_otp_for_leg(
        self,
        leg,
        flight_code: Optional[str] = None,
        destination_country: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Main OTP calculation wrapper with fallback chaining.
        
        Follows exact priority sequence:
        1. Flightradar24 (FR24) - Primary
        2. BTS (USA flights) - Fallback
        3. Eurocontrol (European flights) - Fallback
        4. World Bank LPI Timeliness Index - Fallback
        5. myGrape Internal Historical Shipment Data - Fallback
        
        Returns:
            OTP result dict with format:
            {
                "indicator_score": float (0-5),
                "classification": str,
                "delay_categories": [str],
                "source_used": str
            }
        """
        # 1. Try Flightradar24 (Primary)
        if flight_code:
            logger.info(f"Attempting FR24 for flight_code={flight_code}, leg_id={leg.id}")
            fr24_result = self._compute_otp_fr24(flight_code, leg)
            if fr24_result:
                logger.info(f"FR24 succeeded for flight_code={flight_code}, leg_id={leg.id}")
                return fr24_result
            else:
                logger.info(f"FR24 failed for flight_code={flight_code}, leg_id={leg.id} - trying fallbacks")
        else:
            logger.info(f"No flight_code for leg_id={leg.id} - skipping FR24, trying fallbacks")
        
        # 2. Try BTS (USA flights)
        if destination_country and self._is_us_country(destination_country):
            logger.debug(f"Attempting BTS for leg_id={leg.id}, country={destination_country}")
            bts_result = self._compute_otp_bts(leg)
            if bts_result:
                logger.info(f"BTS succeeded for leg_id={leg.id}")
                return bts_result
        
        # 3. Try Eurocontrol (European flights)
        if destination_country and self._is_eu_country(destination_country):
            logger.debug(f"Attempting Eurocontrol for leg_id={leg.id}, country={destination_country}")
            euro_result = self._compute_otp_eurocontrol(leg)
            if euro_result:
                logger.info(f"Eurocontrol succeeded for leg_id={leg.id}")
                return euro_result
        
        # 4. Try World Bank LPI Timeliness Index
        if destination_country:
            logger.debug(f"Attempting World Bank LPI for leg_id={leg.id}, country={destination_country}")
            lpi_result = self._compute_otp_worldbank(destination_country)
            if lpi_result:
                logger.info(f"World Bank LPI succeeded for leg_id={leg.id}, country={destination_country}")
                return lpi_result
        
        # 5. Try Internal Historical Data
        if leg.from_location and leg.to_location:
            logger.debug(f"Attempting Internal data for leg_id={leg.id}, route={leg.from_location}->{leg.to_location}")
            internal_result = self._compute_otp_internal(leg)
            if internal_result:
                logger.info(f"Internal data succeeded for leg_id={leg.id}")
                return internal_result
        
        logger.warning(f"All OTP sources failed for leg_id={leg.id}")
        return None
    
    def _compute_otp_fr24(self, flight_code: str, leg) -> Optional[Dict[str, Any]]:
        """Compute OTP from FlightRadar24 data (Primary source)."""
        logger.info(f"Fetching FR24 data for flight_code={flight_code}, leg_id={leg.id}")
        fr24_data = self._fetch_flightradar24_performance(flight_code, leg)
        if not fr24_data:
            logger.info(f"FR24 returned no data for flight_code={flight_code}, leg_id={leg.id}")
            return None
        
        # Extract delay and status from FR24 data
        delay_minutes = fr24_data.get('delay_minutes')
        status = fr24_data.get('status', 'on_time')
        cancelled = status == 'cancelled'
        diverted = status == 'diverted'
        
        # Map delay to category
        category = LaneRiskUtils.map_delay_to_category(delay_minutes, cancelled, diverted)
        
        # Convert category to indicator
        indicator = LaneRiskUtils.category_to_indicator(category)
        
        # Convert indicator to classification
        classification = LaneRiskUtils.indicator_to_classification(indicator)
        
        return {
            "indicator_score": round(indicator, 2),
            "classification": classification,
            "delay_categories": [category],
            "source_used": "fr24"
        }
    
    def _compute_otp_bts(self, leg) -> Optional[Dict[str, Any]]:
        """Compute OTP from BTS (Bureau of Transportation Statistics) data."""
        # TODO: Implement BTS API integration
        # For now, returns None (stub)
        logger.debug("BTS OTP computation not yet implemented")
        return None
    
    def _compute_otp_eurocontrol(self, leg) -> Optional[Dict[str, Any]]:
        """Compute OTP from Eurocontrol data."""
        # TODO: Implement Eurocontrol API integration
        # For now, returns None (stub)
        logger.debug("Eurocontrol OTP computation not yet implemented")
        return None
    
    def _compute_otp_worldbank(self, destination_country: str) -> Optional[Dict[str, Any]]:
        """Compute OTP from World Bank LPI Timeliness Index."""
        try:
            lpi_score = self._get_world_bank_timeliness_score(destination_country)
            if lpi_score is None:
                return None
            
            # Round LPI score (1-5) to indicator (0-5)
            indicator = round(lpi_score)
            indicator = max(0.0, min(5.0, indicator))
            
            classification = LaneRiskUtils.indicator_to_classification(indicator)
            
            # Map LPI score to approximate category
            if indicator >= 4.0:
                category = "on_time"
            elif indicator >= 3.0:
                category = "late"
            elif indicator >= 2.0:
                category = "very_late"
            else:
                category = "excessive"
            
            return {
                "indicator_score": round(indicator, 2),
                "classification": classification,
                "delay_categories": [category],
                "source_used": "world_bank_lpi"
            }
        except Exception as e:
            logger.debug(f"World Bank LPI OTP computation error: {e}")
            return None
    
    def _compute_otp_internal(self, leg) -> Optional[Dict[str, Any]]:
        """Compute OTP from myGrape Internal Historical Shipment Data."""
        try:
            from sqlalchemy import and_
            
            # Get historical flight legs on this route
            completed_legs = self.db.query(ShipmentLeg).filter(
                and_(
                    ShipmentLeg.from_location == leg.from_location,
                    ShipmentLeg.to_location == leg.to_location,
                    ShipmentLeg.mode_of_transport.in_(['air', 'flight', 'airplane', 'aircraft', 'aviation']),
                    ShipmentLeg.arrival_time.isnot(None),
                    ShipmentLeg.scheduled_time.isnot(None)
                )
            ).limit(100).all()
            
            if len(completed_legs) < 5:  # Need at least 5 data points
                return None
            
            historical_indicators = []
            for completed_leg in completed_legs:
                if completed_leg.arrival_time and completed_leg.scheduled_time:
                    delay_seconds = (completed_leg.arrival_time - completed_leg.scheduled_time).total_seconds()
                    delay_minutes = delay_seconds / 60.0
                    category = LaneRiskUtils.map_delay_to_category(delay_minutes, False, False)
                    indicator = LaneRiskUtils.category_to_indicator(category)
                    historical_indicators.append(indicator)
            
            if not historical_indicators:
                return None
            
            # Average historical indicators
            avg_indicator = sum(historical_indicators) / len(historical_indicators)
            avg_indicator = max(0.0, min(5.0, avg_indicator))
            
            classification = LaneRiskUtils.indicator_to_classification(avg_indicator)
            
            # Map average indicator to approximate category
            if avg_indicator >= 4.0:
                category = "on_time"
            elif avg_indicator >= 3.0:
                category = "late"
            elif avg_indicator >= 2.0:
                category = "very_late"
            else:
                category = "excessive"
            
            return {
                "indicator_score": round(avg_indicator, 2),
                "classification": classification,
                "delay_categories": [category],
                "source_used": "internal"
            }
        except Exception as e:
            logger.debug(f"Internal OTP computation error: {e}")
            return None
    
    def _is_us_country(self, country_code: str) -> bool:
        """Check if country is United States."""
        us_codes = {'US', 'USA', 'UNITED STATES', 'UNITED STATES OF AMERICA'}
        return country_code.upper() in us_codes
    
    def _is_eu_country(self, country_code: str) -> bool:
        """Check if country is in Europe."""
        eu_codes = {
            'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
            'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
            'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'GB', 'UK', 'NO',
            'CH', 'IS', 'LI', 'AL', 'BA', 'ME', 'MK', 'RS', 'TR', 'UA',
            'BY', 'MD', 'RU'
        }
        return country_code.upper() in eu_codes

    # ------------------------------------------------------------------
    # Helpers for status/indicator mapping and simulated fetches
    # ------------------------------------------------------------------
    def _delay_to_status(self, delay_minutes: Optional[int], cancelled: bool = False, diverted: bool = False) -> str:
        if cancelled:
            return "cancelled"
        if diverted:
            return "diverted"
        if delay_minutes is None:
            return "on_time"
        if delay_minutes < FLIGHT_PERFORMANCE_CONSTANTS["ON_TIME_THRESHOLD_MINUTES"]:
            return "on_time"
        if delay_minutes < FLIGHT_PERFORMANCE_CONSTANTS["LATE_THRESHOLD_MINUTES"]:
            return "late"
        if delay_minutes < FLIGHT_PERFORMANCE_CONSTANTS["VERY_LATE_THRESHOLD_MINUTES"]:
            return "very_late"
        return "excessive"

    def _status_to_indicator(self, status: str) -> float:
        if status == "cancelled":
            return 0.0
        if status == "diverted":
            return 0.5
        if status == "excessive":
            return 1.0
        if status == "very_late":
            return 1.5
        if status == "late":
            return 2.5
        return 4.5  # on_time or unknown defaults to best available among non-cancelled

    
    def _get_lpi_fallback_performance(self, leg) -> Optional[Dict[str, Any]]:
        """
        Get flight performance using World Bank LPI Timeliness Index as fallback.
        
        Uses the destination country's LPI Timeliness Index to estimate flight performance.
        
        Returns:
            Dictionary with flight performance data mapped from LPI score
        """
        if not leg.shipment or not leg.shipment.destination_country:
            return None
        
        lpi_score = self._get_world_bank_timeliness_score(leg.shipment.destination_country)
        if lpi_score is None:
            return None
        
        # Map LPI score (1-5) to FlightStats indicator (0-5)
        # LPI 1.0 -> FlightStats 0.5, LPI 5.0 -> FlightStats 4.5
        flightstats_indicator = max(0.5, min(4.5, lpi_score - 0.5))
        
        # Estimate status based on LPI score
        if lpi_score >= 4.0:
            status = "on_time"
        elif lpi_score >= 3.0:
            status = "late"
        elif lpi_score >= 2.0:
            status = "very_late"
        else:
            status = "excessive"
        
        return {
            "flightstats_indicator": flightstats_indicator,
            "status": status,
            "delay_minutes": None,
            "source": "lpi"
        }
    
    def _calculate_world_bank_timeliness_score(
        self,
        shipments: List[Shipment]
    ) -> Tuple[Optional[float], str]:
        """
        Calculate score based on World Bank Timeliness Index.
        
        Uses destination country's LPI Timeliness Index (the country in which the last flight lands).
        The Timeliness Index provides an indication of the frequency with which shipments arrive at 
        the consignee within scheduled delivery times, hence providing an indication of the risk of 
        delay due to customs clearance procedures.
        
        **Requirements:**
        - Uses World Bank LPI Timeliness Index (LP.LPI.TIM.XQ)
        - Uses destination country (where last flight lands)
        - Rates between 1 and 5 (World Bank scale)
        - Picks the most recent data source always
        - Indicates risk of delay due to customs clearance procedures
        
        **Data source:** https://lpi.worldbank.org/international/global
        
        **Optimized:** Batch fetches all countries at once instead of individual lookups.
        """
        if not shipments:
            return None, "N/A"
        
        # Get unique destination countries
        destination_countries = set()
        for shipment in shipments:
            if shipment.destination_country:
                destination_countries.add(shipment.destination_country)
        
        if not destination_countries:
            return None, "No destination country data"
        
        # Batch fetch all country scores at once (more efficient)
        timeliness_scores = self._get_world_bank_timeliness_scores_batch(list(destination_countries))
        
        if not timeliness_scores:
            return None, "No LPI data available"
        
        # Calculate average Timeliness score
        avg_timeliness = sum(timeliness_scores) / len(timeliness_scores)
        
        # Debug logging to verify data source
        logger.debug(f"World Bank Timeliness Index: {len(timeliness_scores)} countries, "
                    f"avg score: {avg_timeliness:.2f}, countries: {list(destination_countries)}")
        
        # Map World Bank LPI Timeliness score (1-5 scale) to our scoring system (0.5-4.5)
        # Linear mapping: 1.0 -> 0.5, 5.0 -> 4.5
        # Formula: our_score = 0.5 + (lpi_score - 1.0) * (4.0 / 4.0) = 0.5 + (lpi_score - 1.0) * 1.0
        # Simplified: our_score = lpi_score - 0.5
        mapped_score = max(0.5, min(4.5, avg_timeliness - 0.5))
        classification = LaneRiskUtils.score_to_classification(mapped_score)
        
        # Show which countries were used for clarity
        destination_countries_list = list(destination_countries)
        if len(destination_countries_list) == 1:
            country = destination_countries_list[0]
            return mapped_score, f"{avg_timeliness:.2f} (Timeliness) from {country} ({classification})"
        else:
            return mapped_score, f"{avg_timeliness:.2f} (Timeliness) avg from {len(destination_countries_list)} countries ({classification})"
    
    def _get_world_bank_timeliness_score(self, country_code: str) -> Optional[float]:
        """
        Get World Bank LPI Timeliness score for a single country.
        For multiple countries, use _get_world_bank_timeliness_scores_batch() instead.
        
        Args:
            country_code: Country code (ISO 3166-1 alpha-2 or alpha-3, or country name)
            
        Returns:
            Timeliness score (1-5 scale) or None if not found
        """
        if not country_code:
            return None
        
        # Try Redis cache for individual country (faster for repeated lookups)
        try:
            r = get_redis()
            redis_key = f"{LPI_REDIS_KEY_PREFIX}{country_code.upper()}"
            cached_score = r.get(redis_key)
            if cached_score:
                return float(cached_score)
        except Exception:
            pass  # Fall through to other methods
        
        # Try live data
        live_score = self._get_live_lpi_timeliness_score(country_code)
        if live_score is not None:
            # Cache in Redis for future lookups
            try:
                r = get_redis()
                redis_key = f"{LPI_REDIS_KEY_PREFIX}{country_code.upper()}"
                r.setex(redis_key, int(LPI_CACHE_TTL.total_seconds()), str(live_score))
            except Exception:
                pass
            return live_score
        
        # Try cached fallback
        cached_score = self._get_cached_lpi_timeliness(country_code)
        if cached_score is not None:
            return cached_score
        
        return None
    
    def _get_world_bank_timeliness_scores_batch(self, country_codes: List[str]) -> List[float]:
        """
        Batch fetch World Bank LPI Timeliness scores for multiple countries.
        More efficient than individual lookups.
        Optimized: Uses Redis pipeline for batch operations and set-based lookups.
        
        Args:
            country_codes: List of country codes
        
        Returns:
            List of timeliness scores (only valid scores, None values filtered out)
        """
        if not country_codes:
            return []
        
        # Try Redis cache first for all countries using pipeline (batch operation)
        scores = []
        uncached_countries = []
        country_to_index = {}
        
        try:
            r = get_redis()
            pipe = r.pipeline()
            
            # Build pipeline and track indices
            for idx, country_code in enumerate(country_codes):
                if not country_code:
                    continue
                redis_key = f"{LPI_REDIS_KEY_PREFIX}{country_code.upper()}"
                pipe.get(redis_key)
                country_to_index[country_code] = idx
            
            # Execute all Redis calls at once
            cached_results = pipe.execute()
            
            # Process results
            for idx, country_code in enumerate(country_codes):
                if not country_code:
                    continue
                result_idx = country_to_index.get(country_code, idx)
                if result_idx < len(cached_results) and cached_results[result_idx]:
                    scores.append(float(cached_results[result_idx]))
                else:
                    uncached_countries.append(country_code)
        except Exception:
            uncached_countries = country_codes
        
        # Fetch remaining countries from live data or fallback
        if uncached_countries:
            # Get the full map once (cached)
            live_map = LaneRiskUtils.get_live_lpi_timeliness_map()
            fallback_map = LPI_TIMELINESS_FALLBACK_MAP
            
            for country_code in uncached_countries:
                score = None
                
                # Try live map
                if live_map:
                    score = LaneRiskUtils.match_country_in_map(country_code, live_map)
                
                # Try fallback map
                if score is None:
                    score = LaneRiskUtils.match_country_in_map(country_code, fallback_map)
                
                if score is not None:
                    scores.append(score)
                    # Cache in Redis
                    try:
                        r = get_redis()
                        redis_key = f"{LPI_REDIS_KEY_PREFIX}{country_code.upper()}"
                        r.setex(redis_key, int(LPI_CACHE_TTL.total_seconds()), str(score))
                    except Exception:
                        pass
        
        return scores
    
    def _get_live_lpi_timeliness_score(self, country_code: str) -> Optional[float]:
        """Return the latest LPI Timeliness score fetched from the World Bank API."""
        if not country_code:
            return None
        
        live_map = LaneRiskUtils.get_live_lpi_timeliness_map()
        if not live_map:
            return None
        
        return LaneRiskUtils.match_country_in_map(country_code, live_map)
    
    def _get_cached_lpi_timeliness(self, country_code: str) -> Optional[float]:
        """
        Get cached World Bank LPI Timeliness score
        Uses a static mapping based on World Bank LPI data
        Data source: https://lpi.worldbank.org/international/aggregated-ranking?sort=asc&order=Timeliness
        """
        # Normalize country code to uppercase
        country_code_upper = country_code.upper() if country_code else None
        if not country_code_upper:
            return None
        
        return LaneRiskUtils.match_country_in_map(country_code_upper, LPI_TIMELINESS_FALLBACK_MAP)
    
    
    def _get_live_iot_coordinates(self, shipment: Shipment) -> Tuple[Optional[float], Optional[float]]:
        """
        Fetch live coordinates from IoT logger device (e.g., Tive).
        
        This method retrieves real-time location data from IoT devices attached to shipments.
        The coordinates are used for live weather assessment at the current shipment location.
        
        Args:
            shipment: Shipment object
            
        Returns:
            Tuple of (latitude, longitude) if live coordinates are available, (None, None) otherwise
            
        Note:
            Implementation pending - will be added when IoT device integration details are available.
            Currently returns None to fall back to static coordinates.
        """
        # Implementation pending - will be added when full details are available
        return None, None
    
    def _calculate_weather_adversities_score(
        self,
        shipments: List[Shipment]
    ) -> Tuple[Optional[float], str]:
        """
        Calculate score based on weather adversities.
        
        Checks for weather conditions that could impact shipments:
        - Storms, heavy rainfall, snow, extreme heat/cold, fog, wind gusts
        - Impact on: Flight delays/cancellations, road blockages, tarmac exposure,
          temperature excursions, loading/unloading risks
        
        **Scoring Table (based on number of adverse events):**
        - 0 events: 4.5 (Excellent - Normal weather)
        - 1 event: 3.5 (Very Good - Minor weather)
        - 2 events: 2.5 (Good - Moderate weather)
        - 3 events: 1.5 (Moderate - Significant weather)
        - 4+ events: 0.5 (Basic - Severe weather)
        
        **Required Data Sources:**
        1. Shipment coordinates (at least one required):
           - shipment.source_latitude / shipment.source_longitude
           - shipment.destination_latitude / shipment.destination_longitude
        2. Shipment leg coordinates (optional but recommended):
           - shipment_leg.latitude / shipment_leg.longitude (for intermediate points)
        3. Weather API configuration:
           - WEATHER_API_KEY (WeatherAPI.com API key)
           - WEATHER_API_PROVIDER (default: 'weatherapi')
        
        **Note:** Live IoT device coordinates will be added when integration details are available.
        
        **How it works:**
        - Checks weather at source, destination, and all leg locations
        - Uses WeatherAPI.com API to fetch current/historical weather conditions
        - Detects adverse weather events (storms, heavy rain, snow, extreme temps, etc.)
        - Returns "Normal (0 events)" if no adverse weather is detected
        - Returns "No route coordinates available" if coordinates are missing
        
        **Returns:**
        - Tuple of (score, description) where:
          - score: 0.5-4.5 (lower = higher risk)
          - description: Classification and event count
        """
        if not shipments:
            return None, "N/A"
        
        adverse_weather_events = []
        total_route_points = 0
        checked_locations = []
        
        # Collect all coordinates first (optimized: single pass, then batch weather checks)
        coordinates_to_check = []
        
        for shipment in shipments:
            # Note: Live IoT coordinates not yet implemented - will be added when details are available
            # Priority 1: Check for live IoT device coordinates (real-time location)
            # live_lat, live_lng = self._get_live_iot_coordinates(shipment)
            # if live_lat and live_lng:
            #     coordinates_to_check.append({
            #         "lat": live_lat,
            #         "lng": live_lng,
            #         "timestamp": datetime.now(timezone.utc),
            #         "type": "live_iot",
            #         "shipment_id": shipment.id
            #     })
            
            # Priority 2: Get route coordinates (source and destination)
            if shipment.source_latitude and shipment.source_longitude:
                coordinates_to_check.append({
                    "lat": shipment.source_latitude,
                    "lng": shipment.source_longitude,
                    "timestamp": shipment.departure_time,
                    "type": "source",
                    "shipment_id": shipment.id
                })
            else:
                logger.debug(f"Shipment {shipment.id}: Missing source coordinates")
            
            if shipment.destination_latitude and shipment.destination_longitude:
                coordinates_to_check.append({
                    "lat": shipment.destination_latitude,
                    "lng": shipment.destination_longitude,
                    "timestamp": shipment.arrival_time or shipment.departure_time,
                    "type": "destination",
                    "shipment_id": shipment.id
                })
            else:
                logger.debug(f"Shipment {shipment.id}: Missing destination coordinates")
            
            # Check intermediate points from shipment legs (already eagerly loaded)
            for leg in shipment.shipment_legs:
                if leg.latitude and leg.longitude:
                    coordinates_to_check.append({
                        "lat": leg.latitude,
                        "lng": leg.longitude,
                        "timestamp": leg.departure_time or shipment.departure_time,
                        "type": f"leg{leg.leg_order}",
                        "shipment_id": shipment.id
                    })
                else:
                    logger.debug(f"Shipment {shipment.id} Leg {leg.leg_order}: Missing coordinates")
        
        # Check weather for all collected coordinates
        for coord in coordinates_to_check:
            total_route_points += 1
            checked_locations.append(f"{coord['type']}({coord['lat']:.4f},{coord['lng']:.4f})")
            weather = self._check_weather_at_location(
                coord["lat"],
                coord["lng"],
                coord["timestamp"]
            )
            if weather:
                adverse_weather_events.extend(weather)
        
        if total_route_points == 0:
            logger.warning("Weather calculation: No route coordinates available. Required data: "
                          "IoT device live coordinates (when implemented), "
                          "shipment.source_latitude/source_longitude, "
                          "shipment.destination_latitude/destination_longitude, "
                          "or shipment_leg.latitude/longitude")
            return None, "No route coordinates available"
        
        logger.debug(f"Weather check: {total_route_points} locations checked: {', '.join(checked_locations)}, "
                    f"{len(adverse_weather_events)} adverse events found")
        
        # Calculate risk score based on adverse weather events
        # Simple table-based scoring similar to Number of Legs
        # Better weather (fewer/no events) = higher score (4.5)
        event_count = len(adverse_weather_events)
        
        if event_count == 0:
            avg_score = 4.5  # Excellent - no adverse weather
            classification = "Normal"
            logger.debug(f"Weather check completed: {total_route_points} locations checked, "
                        f"no adverse weather events detected (normal conditions)")
        elif event_count == 1:
            avg_score = 3.5  # Very Good - minor weather
            classification = "Minor"
        elif event_count == 2:
            avg_score = 2.5  # Good - moderate weather
            classification = "Moderate"
        elif event_count == 3:
            avg_score = 1.5  # Moderate - significant weather
            classification = "Significant"
        else:  # 4+ events
            avg_score = 0.5  # Basic - severe weather
            classification = "Severe"
        
        return avg_score, f"{classification} ({event_count} events)"
    
    def _check_weather_at_location(
        self,
        latitude: float,
        longitude: float,
        timestamp: Optional[datetime] = None
    ) -> List[Dict[str, Any]]:
        """
        Check weather conditions at a specific location and time.
        Returns list of adverse weather events with explicit impact assessment.
        
        Detects external environmental conditions that can negatively impact shipments:
        - Storms, heavy rainfall, snow, extreme heat/cold, fog, wind gusts
        - Other severe weather patterns
        
        Each event includes explicit impact assessment for:
        1. Flight delays or cancellations
        2. Road blockages or slower transit times
        3. Longer tarmac exposure
        4. Temperature excursions due to extreme ambient conditions
        5. Increased risk during loading/unloading
        
        Args:
            latitude: Location latitude
            longitude: Location longitude
            timestamp: Time to check weather (defaults to current time)
            
        Returns:
            List of adverse weather events with severity scores and impact assessment
            Format: [{
                "type": "storm",
                "severity": 3,
                "description": "Heavy rain",
                "location": "New York, NY",
                "impacts": {
                    "flight_delays_cancellations": True,
                    "road_blockages": True,
                    "tarmac_exposure": True,
                    "temperature_excursions": False,
                    "loading_unloading_risk": True
                }
            }, ...]
        """
        if not HTTPX_AVAILABLE:
            return []
        
        # Normalize timestamp to timezone-aware UTC
        if timestamp:
            # If timestamp is timezone-naive, assume it's UTC
            if timestamp.tzinfo is None:
                timestamp = timestamp.replace(tzinfo=timezone.utc)
            # Convert to UTC if it has timezone info
            else:
                timestamp = timestamp.astimezone(timezone.utc)
        else:
            timestamp = datetime.now(timezone.utc)
        
        # Check Redis cache first (6h TTL for weather data)
        cache_key = f"weather:{latitude:.4f}:{longitude:.4f}:{timestamp.date()}"
        try:
            r = get_redis()
            cached_events_json = r.get(cache_key)
            if cached_events_json:
                try:
                    cached_events = json.loads(cached_events_json)
                    logger.debug(f"Using cached weather data for {latitude}, {longitude}")
                    return cached_events
                except (ValueError, json.JSONDecodeError):
                    pass
        except Exception as e:
            logger.debug(f"Redis cache check failed: {e}")
        
        # Get weather API key
        weather_api_key = getattr(settings, 'WEATHER_API_KEY', None)
        weather_provider = getattr(settings, 'WEATHER_API_PROVIDER', 'weatherapi').lower()
        
        if not weather_api_key:
            logger.warning("Weather API key not configured (WEATHER_API_KEY). Skipping weather check. "
                          "Set WEATHER_API_KEY in .env file to enable weather adversities calculation.")
            return []
        
        adverse_events = []
        
        try:
            # Use WeatherAPI.com API (better free tier, includes historical data)
            if weather_provider != "weatherapi":
                logger.warning(f"Unknown weather provider: {weather_provider}, using WeatherAPI.com")
            adverse_events = self._fetch_weather_from_weatherapi(
                    latitude, longitude, timestamp, weather_api_key
                )
            
            # Cache the results in Redis (6h TTL - weather changes frequently)
            if adverse_events:
                try:
                    r = get_redis()
                    ttl_seconds = int(WEATHER_CACHE_TTL.total_seconds())
                    r.setex(cache_key, ttl_seconds, json.dumps(adverse_events))
                except Exception as e:
                    logger.debug(f"Failed to cache weather data: {e}")
            
            return adverse_events
            
        except Exception as e:
            logger.warning(f"Failed to fetch weather data for ({latitude:.4f}, {longitude:.4f}): {e}")
            # Return empty list - API failure means we can't assess weather, so no adverse events
            return []
    
    def _fetch_weather_from_weatherapi(
        self,
        latitude: float,
        longitude: float,
        timestamp: Optional[datetime],
        api_key: str
    ) -> List[Dict[str, Any]]:
        """
        Fetch weather data from WeatherAPI.com API.
        Supports both current and historical weather data (historical available on free tier).
        """
        adverse_events = []
        
        # Determine if we need historical or current weather
        now_utc = datetime.now(timezone.utc)
        is_historical = timestamp and timestamp < now_utc - timedelta(hours=1)
        
        if is_historical:
            # Use WeatherAPI.com History API (free tier supports historical data)
            date_str = timestamp.strftime("%Y-%m-%d")
            url = "https://api.weatherapi.com/v1/history.json"
            params = {
                "key": api_key,
                "q": f"{latitude},{longitude}",
                "dt": date_str,
                "lang": "en"
            }
        else:
            # Use WeatherAPI.com Current Weather API
            url = "https://api.weatherapi.com/v1/current.json"
            params = {
                "key": api_key,
                "q": f"{latitude},{longitude}",
                "lang": "en"
            }
        
        # Use shared HTTP client for better performance
        if _http_client:
            response = _http_client.get(url, params=params)
        else:
            response = httpx.get(url, params=params, timeout=10.0)
        response.raise_for_status()
        data = response.json()
        
        # Extract location name from WeatherAPI.com response (includes location data)
        location_name = None
        if "location" in data:
            location_data = data["location"]
            name_parts = []
            if location_data.get("name"):
                name_parts.append(location_data["name"])
            if location_data.get("region"):
                name_parts.append(location_data["region"])
            if location_data.get("country"):
                name_parts.append(location_data["country"])
            if name_parts:
                location_name = ", ".join(name_parts)
        
        # Parse weather data from WeatherAPI.com format
        # WeatherAPI.com uses "current" for current weather or "forecastday[0].day" for historical
        if is_historical and "forecast" in data and "forecastday" in data["forecast"]:
            # Historical data structure
            forecast_day = data["forecast"]["forecastday"][0] if data["forecast"]["forecastday"] else {}
            day_data = forecast_day.get("day", {})
            hour_data = forecast_day.get("hour", [])
            
            # Get the closest hour to the requested timestamp
            target_hour = timestamp.hour if timestamp else 12
            closest_hour = min(hour_data, key=lambda h: abs(h.get("time_epoch", 0) - timestamp.timestamp())) if hour_data else {}
            
            # Use hour data if available, otherwise use day averages
            condition = closest_hour.get("condition", day_data.get("condition", {}))
            weather_main = condition.get("text", "").lower()
            weather_desc = condition.get("text", "").lower()
            temp = closest_hour.get("temp_c", day_data.get("avgtemp_c"))
            feels_like = closest_hour.get("feelslike_c", day_data.get("avgtemp_c"))
            wind_speed = closest_hour.get("wind_kph", day_data.get("maxwind_kph", 0)) / 3.6  # Convert km/h to m/s
            wind_gust = closest_hour.get("gust_kph", day_data.get("maxwind_kph", 0)) / 3.6  # Convert km/h to m/s
            visibility = closest_hour.get("vis_km", day_data.get("avgvis_km", 10)) * 1000  # Convert km to meters
            humidity = closest_hour.get("humidity", day_data.get("avghumidity", 0))
            pressure = closest_hour.get("pressure_mb", day_data.get("avgtemp_c", 1013))
        else:
            # Current weather data structure
            current = data.get("current", {})
            condition = current.get("condition", {})
            weather_main = condition.get("text", "").lower()
            weather_desc = condition.get("text", "").lower()
            temp = current.get("temp_c")
            feels_like = current.get("feelslike_c")
            wind_speed = current.get("wind_kph", 0) / 3.6  # Convert km/h to m/s
            wind_gust = current.get("gust_kph", 0) / 3.6  # Convert km/h to m/s
            visibility = current.get("vis_km", 10) * 1000  # Convert km to meters
            humidity = current.get("humidity", 0)
            pressure = current.get("pressure_mb", 1013)
        
        # Detect storms, heavy rain, snow
        # Weather events with explicit impact assessment per requirements:
        # - Flight delays/cancellations
        # - Road blockages or slower transit times
        # - Longer tarmac exposure
        # - Temperature excursions due to extreme ambient conditions
        # - Increased risk during loading/unloading
        
        if any(keyword in weather_main or keyword in weather_desc 
               for keyword in ["thunderstorm", "storm", "heavy", "extreme", "severe"]):
            adverse_events.append({
                "type": "storm",
                "severity": 3,
                "description": weather_desc,
                "location": location_name or f"{latitude:.4f}, {longitude:.4f}",
                "impacts": {
                    "flight_delays_cancellations": True,
                    "road_blockages": True,
                    "tarmac_exposure": True,
                    "temperature_excursions": False,
                    "loading_unloading_risk": True
                }
            })
        elif "rain" in weather_main or "rain" in weather_desc:
            if "heavy" in weather_desc or "extreme" in weather_desc or "torrential" in weather_desc:
                adverse_events.append({
                    "type": "heavy_rain",
                    "severity": 2,
                    "description": weather_desc,
                    "location": location_name or f"{latitude:.4f}, {longitude:.4f}",
                    "impacts": {
                        "flight_delays_cancellations": True,
                        "road_blockages": True,
                        "tarmac_exposure": True,
                        "temperature_excursions": False,
                        "loading_unloading_risk": True
                    }
                })
            elif "moderate" in weather_desc:
                adverse_events.append({
                    "type": "moderate_rain",
                    "severity": 1,
                    "description": weather_desc,
                    "location": location_name or f"{latitude:.4f}, {longitude:.4f}",
                    "impacts": {
                        "flight_delays_cancellations": False,
                        "road_blockages": False,
                        "tarmac_exposure": False,
                        "temperature_excursions": False,
                        "loading_unloading_risk": True
                    }
                })
        elif "snow" in weather_main or "snow" in weather_desc:
            adverse_events.append({
                "type": "snow",
                "severity": 2,
                "description": weather_desc,
                "location": location_name or f"{latitude:.4f}, {longitude:.4f}",
                "impacts": {
                    "flight_delays_cancellations": True,
                    "road_blockages": True,
                    "tarmac_exposure": True,
                    "temperature_excursions": True,
                    "loading_unloading_risk": True
                }
            })
        elif "drizzle" in weather_main or "drizzle" in weather_desc:
            if "heavy" in weather_desc:
                adverse_events.append({
                    "type": "heavy_drizzle",
                    "severity": 1,
                    "description": weather_desc,
                    "location": location_name or f"{latitude:.4f}, {longitude:.4f}",
                    "impacts": {
                        "flight_delays_cancellations": False,
                        "road_blockages": False,
                        "tarmac_exposure": False,
                        "temperature_excursions": False,
                        "loading_unloading_risk": True
                    }
                })
        
        # Detect extreme temperatures
        if temp is not None:
            if temp > WEATHER_CONSTANTS["EXTREME_HEAT_THRESHOLD"]:
                adverse_events.append({
                    "type": "extreme_heat",
                    "severity": 2,
                    "description": f"Extreme heat: {temp}°C",
                    "temperature": temp,
                    "location": location_name or f"{latitude:.4f}, {longitude:.4f}",
                    "impacts": {
                        "flight_delays_cancellations": False,
                        "road_blockages": False,
                        "tarmac_exposure": True,
                        "temperature_excursions": True,
                        "loading_unloading_risk": True
                    }
                })
            elif temp < WEATHER_CONSTANTS["EXTREME_COLD_THRESHOLD"]:
                adverse_events.append({
                    "type": "extreme_cold",
                    "severity": 2,
                    "description": f"Extreme cold: {temp}°C",
                    "temperature": temp,
                    "location": location_name or f"{latitude:.4f}, {longitude:.4f}",
                    "impacts": {
                        "flight_delays_cancellations": False,
                        "road_blockages": False,
                        "tarmac_exposure": True,
                        "temperature_excursions": True,
                        "loading_unloading_risk": True
                    }
                })
        
        # Detect fog (low visibility)
        if visibility < WEATHER_CONSTANTS["LOW_VISIBILITY_THRESHOLD"]:
            adverse_events.append({
                "type": "fog",
                "severity": 1,
                "description": f"Low visibility: {visibility}m",
                "visibility": visibility,
                "location": location_name or f"{latitude:.4f}, {longitude:.4f}",
                "impacts": {
                    "flight_delays_cancellations": True,
                    "road_blockages": True,
                    "tarmac_exposure": True,
                    "temperature_excursions": False,
                    "loading_unloading_risk": True
                }
            })
        
        # Detect strong winds
        max_wind = max(wind_speed, wind_gust) if wind_gust else wind_speed
        if max_wind > WEATHER_CONSTANTS["STRONG_WIND_THRESHOLD"]:
            adverse_events.append({
                "type": "wind_gusts",
                "severity": 1,
                "description": f"Strong winds: {max_wind:.1f} m/s",
                "wind_speed": max_wind,
                "location": location_name or f"{latitude:.4f}, {longitude:.4f}",
                "impacts": {
                    "flight_delays_cancellations": True,
                    "road_blockages": False,
                    "tarmac_exposure": True,
                    "temperature_excursions": False,
                    "loading_unloading_risk": True
                }
            })
        
        return adverse_events
    
    
    def _calculate_lpi_score(
        self,
        shipments: List[Shipment]
    ) -> Tuple[Optional[float], str]:
        """
        Calculate score based on Logistics Performance Index (LPI)
        Uses destination country's overall LPI score (composite of 6 dimensions)
        Data source: https://lpi.worldbank.org/international/global
        
        The overall LPI is a composite score based on:
        1. Customs efficiency
        2. Quality of transport and trade infrastructure
        3. Ease of arranging international shipments
        4. Competence of logistics services
        5. Ability to track and trace consignments
        6. Timeliness of deliveries
        """
        if not shipments:
            return None, "N/A"
        
        # Get unique destination countries
        destination_countries = set()
        for shipment in shipments:
            if shipment.destination_country:
                destination_countries.add(shipment.destination_country)
        
        if not destination_countries:
            return None, "No destination country data"
        
        destination_countries_list = list(destination_countries)
        
        # Get overall LPI scores for all destination countries with country mapping
        country_scores_map = self._get_lpi_overall_scores_with_countries(destination_countries_list)
        
        if not country_scores_map:
            return None, "No LPI data available"
        
        # Extract scores and calculate average
        lpi_scores = list(country_scores_map.values())
        avg_lpi = sum(lpi_scores) / len(lpi_scores)
        
        # Debug logging to verify data source
        logger.debug(f"World Bank Overall LPI: {len(country_scores_map)} countries, "
                    f"avg score: {avg_lpi:.2f}, countries: {list(destination_countries_list)}, "
                    f"scores: {country_scores_map}")
        
        # Map World Bank LPI Overall score (1-5 scale) to our scoring system (0.5-4.5)
        # Linear mapping: 1.0 -> 0.5, 5.0 -> 4.5
        # Formula: our_score = 0.5 + (lpi_score - 1.0) * (4.0 / 4.0) = 0.5 + (lpi_score - 1.0) * 1.0
        # Simplified: our_score = lpi_score - 0.5
        mapped_score = max(0.5, min(4.5, avg_lpi - 0.5))
        classification = LaneRiskUtils.score_to_classification(mapped_score)
        
        # Build detailed info string showing which countries were used
        # Clearly label as "Overall LPI" to distinguish from Timeliness Index
        if len(country_scores_map) == 1:
            country, score = next(iter(country_scores_map.items()))
            info = f"{avg_lpi:.2f} (Overall LPI) from {country} ({classification})"
        else:
            # Show calculation: countries and their scores
            country_details = ", ".join([f"{country}: {score:.2f}" for country, score in sorted(country_scores_map.items())])
            info = f"{avg_lpi:.2f} (Overall LPI) avg from {len(country_scores_map)} countries ({country_details}) ({classification})"
        
        return mapped_score, info
    
    def _get_lpi_overall_scores_batch(self, country_codes: List[str]) -> List[float]:
        """
        Batch fetch World Bank LPI Overall scores for multiple countries.
        More efficient than individual lookups.
        Optimized: Uses Redis pipeline for batch operations.
        
        Args:
            country_codes: List of country codes
            
        Returns:
            List of overall LPI scores (only valid scores, None values filtered out)
        """
        country_scores_map = self._get_lpi_overall_scores_with_countries(country_codes)
        return list(country_scores_map.values()) if country_scores_map else []
    
    def _get_lpi_overall_scores_with_countries(self, country_codes: List[str]) -> Dict[str, float]:
        """
        Batch fetch World Bank LPI Overall scores for multiple countries with country mapping.
        Returns a dictionary mapping country codes to their LPI scores.
        
        Args:
            country_codes: List of country codes
            
        Returns:
            Dictionary mapping country codes to LPI scores (only countries with valid scores)
        """
        if not country_codes:
            return {}
        
        country_scores_map: Dict[str, float] = {}
        uncached_countries = []
        
        # Try Redis cache first for all countries using pipeline (batch operation)
        try:
            r = get_redis()
            pipe = r.pipeline()
            
            # Build pipeline
            for country_code in country_codes:
                if not country_code:
                    continue
                redis_key = f"{LPI_OVERALL_REDIS_KEY_PREFIX}{country_code.upper()}"
                pipe.get(redis_key)
            
            # Execute all Redis calls at once
            cached_results = pipe.execute()
            
            # Process results
            for idx, country_code in enumerate(country_codes):
                if not country_code:
                    continue
                if idx < len(cached_results) and cached_results[idx]:
                    country_scores_map[country_code] = float(cached_results[idx])
                else:
                    uncached_countries.append(country_code)
        except Exception:
            uncached_countries = country_codes
        
        # Fetch remaining countries from live data
        if uncached_countries:
            # Get the full map once (cached)
            live_map = LaneRiskUtils.get_live_lpi_overall_map()
            
            # Batch cache writes using pipeline
            pipe = None
            try:
                r = get_redis()
                pipe = r.pipeline()
                ttl_seconds = int(LPI_CACHE_TTL.total_seconds())
            except Exception:
                pass
            
            for country_code in uncached_countries:
                score = None
                
                # Try live map
                if live_map:
                    score = LaneRiskUtils.match_country_in_map(country_code, live_map)
                
                if score is not None:
                    country_scores_map[country_code] = score
                    # Add to pipeline for batch caching
                    if pipe is not None:
                        try:
                            redis_key = f"{LPI_OVERALL_REDIS_KEY_PREFIX}{country_code.upper()}"
                            pipe.setex(redis_key, ttl_seconds, str(score))
                        except Exception:
                            pass
            
            # Execute all cache writes at once
            if pipe is not None:
                try:
                    pipe.execute()
                except Exception:
                    pass
        
        return country_scores_map
    

