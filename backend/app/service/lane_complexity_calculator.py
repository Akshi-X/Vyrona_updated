"""Lane complexity risk factor calculations."""
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from app.config.config import settings
from app.constants.lane_risk_constants import (
    FLIGHT_PERFORMANCE_CACHE_TTL,
    FLIGHT_PERFORMANCE_CONSTANTS,
    FLIGHT_PERFORMANCE_REDIS_KEY_PREFIX,
    LPI_CACHE_TTL,
    LPI_REDIS_KEY_PREFIX,
    LPI_TIMELINESS_FALLBACK_MAP,
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
    
