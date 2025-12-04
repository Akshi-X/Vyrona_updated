"""
Lane Risk Assessment Service
Calculates risk assessment for shipment lanes based on complexity, quality incidents, and external factors
"""
import logging
import json
from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session

from app.models.shipment_model import Shipment
from app.service.quality_service import QualityService
from app.service.shipment_service import ShipmentService
from app.service.redis_service import get_redis
from app.config.config import settings

logger = logging.getLogger(__name__)

# Weather detection constants
WEATHER_CONSTANTS = {
    "EXTREME_HEAT_THRESHOLD": 35.0,  # Celsius
    "EXTREME_COLD_THRESHOLD": -10.0,  # Celsius
    "STRONG_WIND_THRESHOLD": 15.0,  # m/s (54 km/h)
    "LOW_VISIBILITY_THRESHOLD": 1000,  # meters (1km)
    "WEATHER_CACHE_TTL_HOURS": 6,
    "LPI_CACHE_TTL_HOURS": 24,
}

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

# World Bank LPI API URLs - Configurable via environment variables
# Can be overridden in .env file:
# LPI_TIMELINESS_API_URL=https://api.worldbank.org/v3/country/all/indicator/LP.LPI.TIM.XQ
# LPI_OVERALL_API_URL=https://api.worldbank.org/v3/country/all/indicator/LP.LPI.OVRL.XQ
LPI_TIMELINESS_API_URL = settings.LPI_TIMELINESS_API_URL
LPI_OVERALL_API_URL = settings.LPI_OVERALL_API_URL
LPI_CACHE_TTL = timedelta(hours=WEATHER_CONSTANTS["LPI_CACHE_TTL_HOURS"])
WEATHER_CACHE_TTL = timedelta(hours=WEATHER_CONSTANTS["WEATHER_CACHE_TTL_HOURS"])
LPI_REDIS_KEY_PREFIX = "lpi:timeliness:"
LPI_REDIS_MAP_KEY = "lpi:timeliness:map"
LPI_REDIS_TIMESTAMP_KEY = "lpi:timeliness:timestamp"
LPI_OVERALL_REDIS_KEY_PREFIX = "lpi:overall:"
LPI_OVERALL_REDIS_MAP_KEY = "lpi:overall:map"
LPI_OVERALL_REDIS_TIMESTAMP_KEY = "lpi:overall:timestamp"
# In-memory cache as fallback (for single-instance deployments)
_lpi_live_cache: Dict[str, float] = {}
_lpi_live_cache_timestamp: Optional[datetime] = None
_lpi_overall_cache: Dict[str, float] = {}
_lpi_overall_cache_timestamp: Optional[datetime] = None

LPI_TIMELINESS_FALLBACK_MAP: Dict[str, float] = {
    # Top performers (Excellent - 4.0+)
    "SG": 4.3, "SGP": 4.3, "SINGAPORE": 4.3,
    "FI": 4.2, "FIN": 4.2, "FINLAND": 4.2,
    "DK": 4.2, "DNK": 4.2, "DENMARK": 4.2,
    "DE": 4.1, "DEU": 4.1, "GERMANY": 4.1,
    "NL": 4.1, "NLD": 4.1, "NETHERLANDS": 4.1,
    "CH": 4.1, "CHE": 4.1, "SWITZERLAND": 4.1,
    "BE": 4.0, "BEL": 4.0, "BELGIUM": 4.0,
    "AT": 4.0, "AUT": 4.0, "AUSTRIA": 4.0,
    "SE": 4.0, "SWE": 4.0, "SWEDEN": 4.0,
    "LU": 4.0, "LUX": 4.0, "LUXEMBOURG": 4.0,
    "IE": 3.9, "IRL": 3.9, "IRELAND": 3.9,
    "US": 3.9, "USA": 3.9, "UNITED STATES": 3.9, "UNITED STATES OF AMERICA": 3.9,
    "GB": 3.9, "GBR": 3.9, "UK": 3.9, "UNITED KINGDOM": 3.9,
    "JP": 3.9, "JPN": 3.9, "JAPAN": 3.9,
    "CA": 3.8, "CAN": 3.8, "CANADA": 3.8,
    "AU": 3.8, "AUS": 3.8, "AUSTRALIA": 3.8,
    "NZ": 3.7, "NZL": 3.7, "NEW ZEALAND": 3.7,
    "FR": 3.7, "FRA": 3.7, "FRANCE": 3.7,
    "ES": 3.6, "ESP": 3.6, "SPAIN": 3.6,
    "IT": 3.6, "ITA": 3.6, "ITALY": 3.6,
    "NO": 3.6, "NOR": 3.6, "NORWAY": 3.6,
    "KR": 3.5, "KOR": 3.5, "SOUTH KOREA": 3.5, "KOREA": 3.5,
    "CN": 3.4, "CHN": 3.4, "CHINA": 3.4,
    "IN": 3.2, "IND": 3.2, "INDIA": 3.2,
    "BR": 3.1, "BRA": 3.1, "BRAZIL": 3.1,
    "MX": 3.0, "MEX": 3.0, "MEXICO": 3.0,
    "ZA": 2.9, "ZAF": 2.9, "SOUTH AFRICA": 2.9,
    "TR": 2.8, "TUR": 2.8, "TURKEY": 2.8,
    "RU": 2.7, "RUS": 2.7, "RUSSIA": 2.7,
    "ID": 2.6, "IDN": 2.6, "INDONESIA": 2.6,
    "PH": 2.5, "PHL": 2.5, "PHILIPPINES": 2.5,
    "VN": 2.4, "VNM": 2.4, "VIETNAM": 2.4,
    "TH": 2.3, "THA": 2.3, "THAILAND": 2.3,
    "PK": 2.2, "PAK": 2.2, "PAKISTAN": 2.2,
    "BD": 2.1, "BGD": 2.1, "BANGLADESH": 2.1,
    "NG": 2.0, "NGA": 2.0, "NIGERIA": 2.0,
    "KE": 1.9, "KEN": 1.9, "KENYA": 1.9,
    "ET": 1.8, "ETH": 1.8, "ETHIOPIA": 1.8,
    # Lower performers (from World Bank LPI data)
    "SO": 2.0, "SOM": 2.0, "SOMALIA": 2.0,
    "HT": 2.0, "HTI": 2.0, "HAITI": 2.0,
    "AF": 2.0, "AFG": 2.0, "AFGHANISTAN": 2.0,
    "YE": 2.2, "YEM": 2.2, "YEMEN": 2.2, "YEMEN, REP.": 2.2,
    "NE": 2.3, "NER": 2.3, "NIGER": 2.3,
    "CF": 2.3, "CAF": 2.3, "CENTRAL AFRICAN REPUBLIC": 2.3, "C.A.R.": 2.3,
    "BT": 2.3, "BTN": 2.3, "BHUTAN": 2.3,
    "CU": 2.2, "CUB": 2.2, "CUBA": 2.2,
    "LS": 2.2, "LSO": 2.2, "LESOTHO": 2.2,
    "BI": 2.2, "BDI": 2.2, "BURUNDI": 2.2,
    "LY": 2.2, "LBY": 2.2, "LIBYA": 2.2,
    "GQ": 2.2, "GNQ": 2.2, "EQUATORIAL GUINEA": 2.2,
    "MR": 2.2, "MRT": 2.2, "MAURITANIA": 2.2,
    "GA": 2.2, "GAB": 2.2, "GABON": 2.2,
    "IQ": 2.2, "IRQ": 2.2, "IRAQ": 2.2,
    "AO": 2.2, "AGO": 2.2, "ANGOLA": 2.2,
    "ZW": 2.2, "ZWE": 2.2, "ZIMBABWE": 2.2,
    "ER": 2.1, "ERI": 2.1, "ERITREA": 2.1,
    "SY": 2.1, "SYR": 2.1, "SYRIA": 2.1, "SYRIAN ARAB REPUBLIC": 2.1,
    "SL": 2.1, "SLE": 2.1, "SIERRA LEONE": 2.1,
}


def _fetch_lpi_data_from_api(api_url: str, max_retries: int = 3) -> Optional[Dict[str, Dict[str, Any]]]:
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
                import time
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


def _get_lpi_map_with_cache(
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
    aggregated = _fetch_lpi_data_from_api(api_url)
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


def _get_live_lpi_timeliness_map(force_refresh: bool = False) -> Optional[Dict[str, float]]:
    """
    Fetch the most recent LPI Timeliness scores from the World Bank API.
    Results are cached in Redis (24h TTL) and in-memory as fallback.
    """
    return _get_lpi_map_with_cache(
        LPI_TIMELINESS_API_URL,
        LPI_REDIS_MAP_KEY,
        LPI_REDIS_TIMESTAMP_KEY,
        "timeliness",
        force_refresh
    )


def _get_live_lpi_overall_map(force_refresh: bool = False) -> Optional[Dict[str, float]]:
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
    return _get_lpi_map_with_cache(
        LPI_OVERALL_API_URL,
        LPI_OVERALL_REDIS_MAP_KEY,
        LPI_OVERALL_REDIS_TIMESTAMP_KEY,
        "overall",
        force_refresh
    )




class LaneRiskService:
    """Service for calculating lane risk assessments"""
    
    def __init__(self, db: Session):
        self.db = db
        self.quality_service = QualityService(db)
    
    def calculate_lane_risk_assessment(
        self,
        patient_id: str,
        pharma_id: Optional[int] = None
    ) -> Dict:
        """
        Calculate comprehensive lane risk assessment
        
        Args:
            patient_id: Patient ID to aggregate shipments for
            pharma_id: Optional pharma ID to filter shipments
            
        Returns:
            Dictionary with risk assessment data
        """
        # Initialize active_shipment_id to None in case of early exceptions
        active_shipment_id = None
        
        try:
            if not patient_id:
                raise ValueError("patient_id is required for lane risk assessment")
            
            # Validate patient ownership if pharma context provided
            if pharma_id is not None:
                self.quality_service.validate_patient_belongs_to_pharma(patient_id, pharma_id)
            
            shipments, active_shipment_id = self._get_shipments(patient_id, pharma_id)
            factors = []
            
            # 1. Lane Complexity
            lane_complexity = self._calculate_lane_complexity(shipments)
            factors.append(lane_complexity)
            
            # 2. Quality Incidents
            quality_incidents = self._calculate_quality_incidents(shipments)
            factors.append(quality_incidents)
            
            # 3. External Factors
            external_factors = self._calculate_external_factors(shipments)
            factors.append(external_factors)
            
            return {
                "shipment_id": active_shipment_id,
                "patient_id": patient_id,
                "total_risk_factors": len(factors),
                "factors": factors,
                "last_updated": datetime.now(timezone.utc),
                "status": "success"
            }
            
        except Exception as e:
            logger.error(f"Error calculating lane risk assessment: {e}", exc_info=True)
            return {
                "shipment_id": active_shipment_id,
                "patient_id": patient_id,
                "total_risk_factors": 0,
                "factors": [],
                "last_updated": datetime.now(timezone.utc),
                "status": "error"
            }
    
    def _calculate_lane_complexity(
        self,
        shipments: List[Shipment]
    ) -> Dict:
        """
        Calculate Lane Complexity risk factor
        
        Currently implemented:
        - Number of legs (fully implemented)
        - World Bank Timeliness Index (fully implemented)
        
        Pending implementation (will be added when details are available):
        - Road parking stops
        - On-time flight performance
        """
        contributors = []
        scores = []
        
        # Get shipments to analyze
        if not shipments:
            return {
                "risk_factor": "Lane Complexity",
                "risk_contributors": ["-", "-", "-", "-"],
                "risk_scale": "N/A"
            }
        
        # 1. Number of Legs
        num_legs_score, num_legs_classification = self._calculate_number_of_legs_score(shipments)
        contributors.append(f"Number of Legs: {num_legs_classification}")
        scores.append(num_legs_score)
        
        # 2. Road Parking Stops
        parking_stops_score, parking_stops_info = self._calculate_parking_stops_score(shipments)
        contributors.append(parking_stops_info)
        if parking_stops_score is not None:
            scores.append(parking_stops_score)
        
        # 3. On-time Flight Performance - Not implemented yet
        contributors.append("-")
        
        # 4. World Bank Timeliness Index
        timeliness_score, timeliness_info = self._calculate_world_bank_timeliness_score(shipments)
        contributors.append(f"World bank timeliness index: {timeliness_info}")
        if timeliness_score is not None:
            scores.append(timeliness_score)
        
        # Fill remaining contributors with "-"
        while len(contributors) < 4:
            contributors.append("-")
        
        # Calculate average score (only use available scores)
        if scores:
            avg_score = sum(scores) / len(scores)
            classification = self._score_to_classification(avg_score)
            risk_scale = f"{avg_score:.1f} ({classification})"
        else:
            risk_scale = "N/A"
        
        return {
            "risk_factor": "Lane Complexity",
            "risk_contributors": contributors[:4],
            "risk_scale": risk_scale
        }
    
    def _calculate_quality_incidents(
        self,
        shipments: List[Shipment]
    ) -> Dict:
        """
        Calculate Quality Incidents risk factor based on quality loss percentage.
        
        Quality Loss Percentage Ranges:
        - ≥ 85% (Green): High quality - no or minimal excursions
        - 60% – 84% (Yellow): Medium quality - moderate excursions
        - < 60% (Red): Low quality / risk - severe excursions
        
        Excursion Types:
        - High Excursion: KPIs exceeded acceptable range (above max threshold)
        - Low Excursion: KPIs fell below acceptable range (below min threshold)
        - Hybrid Excursion: Both high and low excursions occurred
        
        Based on: High/Low/Hybrid excursions, Missing logger, Missing logger data, Frequency of excursions
        """
        contributors = []
        
        # Get shipments to analyze
        if not shipments:
            return {
                "risk_factor": "Quality Incidents",
                "risk_contributors": ["-", "-", "-", "-"],
                "risk_scale": "N/A"
            }
        
        # Get patient IDs from shipments
        patient_ids = [shipment.patient_id for shipment in shipments]
        
        # Analyze quality data from Redis
        high_excursions = 0
        low_excursions = 0
        hybrid_excursions = 0
        missing_logger_data = 0
        total_excursions = 0
        total_readings = 0
        total_violations = 0
        
        try:
            r = get_redis()
            
            # Batch fetch all quality histories at once using pipeline
            pipe = r.pipeline()
            history_keys = [f'quality_history:{patient_id}' for patient_id in patient_ids]
            for key in history_keys:
                pipe.lrange(key, 0, -1)
            histories = pipe.execute()
            
            # Pre-compute KPI parameters set for faster lookup
            kpi_parameters = ['temperature', 'humidity', 'agitation']
            
            # Process all histories
            for idx, patient_id in enumerate(patient_ids):
                history = histories[idx] if idx < len(histories) else []
                
                # Check for missing logger data
                if not history:
                    # No quality history data available = Missing Logger Data
                    missing_logger_data += 1
                    continue
                
                has_high = False
                has_low = False
                patient_violations = 0
                patient_readings = 0
                
                # Process history items
                for item in history:
                    try:
                        quality_data = json.loads(item)
                        patient_readings += 1
                        total_readings += 1
                        
                        violated_params = quality_data.get('violated_parameters', [])
                        threshold_violations = quality_data.get('threshold_violations', {})
                        
                        # Check if there are any violations
                        has_violation = bool(violated_params) or any(threshold_violations.values())
                        
                        if has_violation:
                            total_excursions += 1
                            patient_violations += 1
                            total_violations += 1
                            
                            # Check for high/low excursions across all KPIs (Temperature, Humidity, Agitation)
                            thresholds = quality_data.get('thresholds', {})
                            
                            # Check each KPI parameter for high/low excursions
                            for param in kpi_parameters:
                                param_value = quality_data.get(param)
                                
                                # Skip if parameter value is missing
                                if param_value is None:
                                    continue
                                
                                # Get threshold - handle both dict and object formats
                                param_threshold = thresholds.get(param)
                                if not param_threshold:
                                    continue
                                
                                # Handle both dict and object formats (Pydantic models serialize to dict in JSON)
                                if isinstance(param_threshold, dict):
                                    param_max = param_threshold.get('max')
                                    param_min = param_threshold.get('min')
                                else:
                                    # If it's an object, try to access attributes
                                    param_max = getattr(param_threshold, 'max', None)
                                    param_min = getattr(param_threshold, 'min', None)
                                    
                                    # Check for high excursion (exceeds max threshold)
                                # High excursion: KPIs exceeded acceptable range
                                if param_max is not None and isinstance(param_value, (int, float)):
                                    if param_value > param_max:
                                        has_high = True
                                        logger.debug(f"High excursion detected: {param}={param_value} > max={param_max}")
                                    
                                    # Check for low excursion (falls below min threshold)
                                # Low excursion: KPIs fell below acceptable range
                                if param_min is not None and isinstance(param_value, (int, float)):
                                    if param_value < param_min:
                                        has_low = True
                                        logger.debug(f"Low excursion detected: {param}={param_value} < min={param_min}")
                    
                    except (json.JSONDecodeError, KeyError, TypeError) as e:
                        logger.debug(f"Error processing quality data item: {e}")
                        continue
                
                # Classify excursion type for this patient
                if has_high and has_low:
                    hybrid_excursions += 1
                elif has_high:
                    high_excursions += 1
                elif has_low:
                    low_excursions += 1
            
        except Exception as e:
            logger.warning(f"Error accessing Redis for quality data: {e}")
            # On error, count all as missing logger data
            missing_logger_data = len(patient_ids)
        
        # Calculate quality loss percentage
        # Quality loss % = (total_violations / total_readings) * 100
        # Cumulative Quality % = 100 - quality_loss_percentage
        if total_readings > 0:
            quality_loss_percentage = (total_violations / total_readings) * 100
            cumulative_quality_percentage = 100 - quality_loss_percentage
        else:
            quality_loss_percentage = 0.0
            cumulative_quality_percentage = 100.0
        
        # Log quality calculation for debugging
        logger.info(
            f"Quality Incidents Calculation - "
            f"Patients analyzed: {len(patient_ids)}, "
            f"Missing logger data: {missing_logger_data}, "
            f"Total readings: {total_readings}, Total violations: {total_violations}, "
            f"Quality loss: {quality_loss_percentage:.2f}%, "
            f"Cumulative quality: {cumulative_quality_percentage:.2f}%, "
            f"High excursions: {high_excursions}, Low excursions: {low_excursions}, Hybrid excursions: {hybrid_excursions}"
        )
        
        # Build contributors with excursion details
        # Always show the format for clarity, even if counts are 0
        excursion_parts = []
        excursion_parts.append(f"High: {high_excursions}")
        excursion_parts.append(f"Low: {low_excursions}")
        excursion_parts.append(f"Hybrid: {hybrid_excursions}")
        
        if high_excursions > 0 or low_excursions > 0 or hybrid_excursions > 0:
            contributors.append(f"High/low/Hybrid excursions: {', '.join(excursion_parts)}")
        else:
            # Show format even when zero for transparency
            contributors.append(f"High/low/Hybrid excursions: {', '.join(excursion_parts)}")
        
        contributors.append("-")  # Missing logger - not implemented yet
        contributors.append(f"Missing logger data: {missing_logger_data}")
        contributors.append(f"Frequency of excursions: {total_excursions}")
        
        # Calculate risk score based on cumulative quality percentage
        # ≥ 85% (Green) = High quality = Excellent (4.5)
        # 60% – 84% (Yellow) = Medium quality = Good to Moderate (2.5-3.5)
        # < 60% (Red) = Low quality / risk = Basic to Moderate (0.5-1.5)
        if cumulative_quality_percentage >= 85:
            risk_score = 4.5  # Excellent - High quality (Green)
        elif cumulative_quality_percentage >= 60:
            # Medium quality (Yellow) - map to Good or Very Good based on severity
            if cumulative_quality_percentage >= 75:
                risk_score = 3.5  # Very Good
            else:
                risk_score = 2.5  # Good
        else:
            # Low quality / risk (Red) - map based on severity
            if cumulative_quality_percentage >= 40:
                risk_score = 1.5  # Moderate
            else:
                risk_score = 0.5  # Basic
        
        classification = self._score_to_classification(risk_score)
        risk_scale = f"{risk_score:.1f} ({classification})"
        
        return {
            "risk_factor": "Quality Incidents",
            "risk_contributors": contributors[:4],
            "risk_scale": risk_scale
        }
    
    def _calculate_external_factors(
        self,
        shipments: List[Shipment]
    ) -> Dict:
        """
        Calculate External Factors risk
        Based on: Weather Adversities, Logistics Performance Index (LPI)
        """
        contributors = []
        scores = []
        
        # Get shipments to analyze
        if not shipments:
            return {
                "risk_factor": "External",
                "risk_contributors": ["-", "-", "-", "-"],
                "risk_scale": "N/A"
            }
        
        # 1. Weather Adversities
        weather_score, weather_info = self._calculate_weather_adversities_score(shipments)
        contributors.append(f"Weather Adversities: {weather_info}")
        if weather_score is not None:
            scores.append(weather_score)
        
        # 2. Logistics Performance Index (LPI)
        lpi_score, lpi_info = self._calculate_lpi_score(shipments)
        contributors.append(f"Logistics Performance Index: {lpi_info}")
        if lpi_score is not None:
            scores.append(lpi_score)
        
        # Fill remaining contributors
        contributors.append("-")
        contributors.append("-")
        
        # Calculate average score
        if scores:
            avg_score = sum(scores) / len(scores)
            classification = self._score_to_classification(avg_score)
            risk_scale = f"{avg_score:.1f} ({classification})"
        else:
            risk_scale = "N/A"
        
        return {
            "risk_factor": "External",
            "risk_contributors": contributors[:4],
            "risk_scale": risk_scale
        }
    
    def _get_shipments(
        self,
        patient_id: str,
        pharma_id: Optional[int] = None
    ) -> Tuple[List[Shipment], Optional[int]]:
        """Get shipments to analyze (restricted to current/ongoing shipment similar to 3PL comparison)."""
        if not patient_id:
            raise ValueError("patient_id is required to retrieve shipments")
        
        shipment_service = ShipmentService(self.db)
        shipment_service._validate_patient_for_shipment_operations(
            patient_id=patient_id,
            pharma_id=pharma_id,
            require_shipment=True
        )
        target_shipment_id = shipment_service._get_target_shipment_id(
            patient_id=patient_id,
            pharma_id=pharma_id
        )
        
        from sqlalchemy.orm import joinedload
        
        query = self.db.query(Shipment).filter(Shipment.patient_id == patient_id)

        if target_shipment_id:
            query = query.filter(Shipment.id == target_shipment_id)
        
        if pharma_id:
            query = query.filter(Shipment.pharma_id == pharma_id)
        
        # Eager load shipment_legs to avoid N+1 queries
        shipments = query.options(joinedload(Shipment.shipment_legs)).all()
        active_shipment_id = shipments[0].id if shipments else target_shipment_id
        return shipments, active_shipment_id
    
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
    
    def _calculate_parking_stops_score(
        self,
        shipments: List[Shipment]
    ) -> Tuple[Optional[float], str]:
        """
        Calculate Road Parking Stops risk score.
        
        Road Step: Parking Stops Evaluation
        - If a Road Step has one or more Parking Stops, it results in a penalty to security assessment
        - Parking stop definition: Scheduled stop OR vehicle not moving for more than 10-20 mins
        - More stops = More risk
        
        **Data Source:**
        - Calculated from Redis location history: If lat/lng is same for 10-20 mins, consider as delay/stop
        
        **Risk Scoring:**
        - 0 stops: Excellent (4.5)
        - 1 stop: Very Good (3.5)
        - 2 stops: Good (2.5)
        - 3 stops: Moderate (1.5)
        - 4+ stops: Basic (0.5)
        """
        if not shipments:
            return None, "No road legs"
        
        # Collect all road legs
        road_legs = []
        for shipment in shipments:
            for leg in shipment.shipment_legs:
                # Check if it's a road/ground leg (case-insensitive)
                # Ground means road transport
                if leg.mode_of_transport and leg.mode_of_transport.lower() in ['road', 'ground', 'truck', 'vehicle', 'car', 'van']:
                    road_legs.append(leg)
        
        if not road_legs:
            return None, "No road legs"
        
        total_parking_stops = 0
        
        # Process each road leg
        for leg in road_legs:
            # Calculate from Redis location history (lat/lng same for 10-20 mins)
            calculated_stops = self._calculate_parking_stops_from_location_history(leg)
            if calculated_stops is not None:
                total_parking_stops += calculated_stops
                logger.debug(f"Leg {leg.id}: Calculated parking stops from location history = {calculated_stops}")
            else:
                logger.debug(f"Leg {leg.id}: No location history data available in Redis for parking stops calculation")
        
        # Calculate risk score based on total parking stops
        if total_parking_stops == 0:
            score = 4.5
            classification = "Excellent"
        elif total_parking_stops == 1:
            score = 3.5
            classification = "Very Good"
        elif total_parking_stops == 2:
            score = 2.5
            classification = "Good"
        elif total_parking_stops == 3:
            score = 1.5
            classification = "Moderate"
        else:  # 4+
            score = 0.5
            classification = "Basic"
        
        info = f"Road Stoppage: {total_parking_stops} stop(s)" if total_parking_stops > 0 else "Road Stoppage: No stops"
        
        logger.info(f"Parking Stops Calculation - Road legs: {len(road_legs)}, Total stops: {total_parking_stops}, Score: {score} ({classification})")
        
        return score, info
    
    def _calculate_parking_stops_from_location_history(
        self,
        leg
    ) -> Optional[int]:
        """
        Calculate parking stops from location history.
        
        Detects stops by checking if lat/lng remains the same for 10-20 minutes.
        A stop is detected when:
        - Same coordinates (within small tolerance) for 10-20 minutes
        - Multiple consecutive readings at same location
        
        **Data Source:**
        - Redis location history: `location_history:{shipment_id}:{leg_order}`
        - Format: List of JSON strings with {lat, lng, timestamp}
        - Note: IoT device location history integration can be added when available
        
        **Returns:**
        - Number of parking stops detected, or None if no location history available
        """
        if not leg:
            return None
        
        # Constants for stop detection
        MIN_STOP_DURATION_MINUTES = 10  # Minimum duration to consider as a stop
        MAX_STOP_DURATION_MINUTES = 20  # Maximum duration before it's considered a significant delay
        COORDINATE_TOLERANCE = 0.0001  # ~11 meters tolerance for "same location"
        
        try:
            r = get_redis()
            
            # Try to get location history from Redis
            # Format: List of JSON strings with {lat, lng, timestamp}
            location_key = f"location_history:{leg.shipment_id}:{leg.leg_order}"
            location_history = r.lrange(location_key, 0, -1)
            
            if not location_history or len(location_history) < 2:
                # Not enough data points to detect stops
                logger.debug(f"Leg {leg.id}: Insufficient location history data ({len(location_history) if location_history else 0} points)")
                return None
            
            # Parse location history
            location_points = []
            for item in location_history:
                try:
                    point = json.loads(item)
                    lat = point.get('lat') or point.get('latitude')
                    lng = point.get('lng') or point.get('longitude')
                    timestamp_str = point.get('timestamp') or point.get('time')
                    
                    if lat is None or lng is None or not timestamp_str:
                        continue
                    
                    # Parse timestamp
                    try:
                        if isinstance(timestamp_str, str):
                            # Try parsing ISO format
                            timestamp = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
                        else:
                            timestamp = timestamp_str
                        
                        # Normalize to UTC if timezone-naive
                        if timestamp.tzinfo is None:
                            timestamp = timestamp.replace(tzinfo=timezone.utc)
                        else:
                            timestamp = timestamp.astimezone(timezone.utc)
                    except (ValueError, AttributeError) as e:
                        logger.debug(f"Leg {leg.id}: Error parsing timestamp {timestamp_str}: {e}")
                        continue
                    
                    location_points.append({
                        'lat': float(lat),
                        'lng': float(lng),
                        'timestamp': timestamp
                    })
                except (json.JSONDecodeError, KeyError, TypeError, ValueError) as e:
                    logger.debug(f"Leg {leg.id}: Error parsing location point: {e}")
                    continue
            
            if len(location_points) < 2:
                logger.debug(f"Leg {leg.id}: Insufficient valid location points ({len(location_points)})")
                return None
            
            # Sort by timestamp
            location_points.sort(key=lambda x: x['timestamp'])
            
            # Detect stops: consecutive points at same location for 10-20 minutes
            stops_detected = 0
            i = 0
            
            while i < len(location_points) - 1:
                current_point = location_points[i]
                stop_start_idx = i
                
                # Find consecutive points at same location
                j = i + 1
                while j < len(location_points):
                    next_point = location_points[j]
                    
                    # Check if coordinates are the same (within tolerance)
                    lat_diff = abs(current_point['lat'] - next_point['lat'])
                    lng_diff = abs(current_point['lng'] - next_point['lng'])
                    
                    if lat_diff <= COORDINATE_TOLERANCE and lng_diff <= COORDINATE_TOLERANCE:
                        # Same location - check duration
                        time_diff = (next_point['timestamp'] - current_point['timestamp']).total_seconds() / 60.0
                        
                        if time_diff >= MIN_STOP_DURATION_MINUTES:
                            # This is a stop - find the end of this stop
                            j += 1
                            continue
                        else:
                            # Not long enough to be a stop
                            break
                    else:
                        # Location changed - end of potential stop
                        break
                
                # Check if we found a stop (duration between first and last point at same location)
                if j > stop_start_idx + 1:
                    stop_duration = (location_points[j - 1]['timestamp'] - location_points[stop_start_idx]['timestamp']).total_seconds() / 60.0
                    
                    if MIN_STOP_DURATION_MINUTES <= stop_duration <= MAX_STOP_DURATION_MINUTES:
                        stops_detected += 1
                        logger.debug(
                            f"Leg {leg.id}: Detected parking stop #{stops_detected} - "
                            f"Duration: {stop_duration:.1f} mins, "
                            f"Location: ({current_point['lat']:.4f}, {current_point['lng']:.4f})"
                        )
                    
                    i = j
                else:
                    i += 1
            
            logger.info(f"Leg {leg.id}: Detected {stops_detected} parking stops from location history")
            return stops_detected
            
        except Exception as e:
            logger.warning(f"Error calculating parking stops from location history for leg {leg.id}: {e}")
            return None
    
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
        classification = self._score_to_classification(mapped_score)
        
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
            live_map = _get_live_lpi_timeliness_map()
            fallback_map = LPI_TIMELINESS_FALLBACK_MAP
            
            for country_code in uncached_countries:
                score = None
                
                # Try live map
                if live_map:
                    score = self._match_country_in_map(country_code, live_map)
                
                # Try fallback map
                if score is None:
                    score = self._match_country_in_map(country_code, fallback_map)
                
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
        
        live_map = _get_live_lpi_timeliness_map()
        if not live_map:
            return None
        
        return self._match_country_in_map(country_code, live_map)
    
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
        
        return self._match_country_in_map(country_code_upper, LPI_TIMELINESS_FALLBACK_MAP)
    
    
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
    
    def _get_location_name_from_google_maps(
        self,
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
        classification = self._score_to_classification(mapped_score)
        
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
            live_map = _get_live_lpi_overall_map()
            
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
                    score = self._match_country_in_map(country_code, live_map)
                
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
    
    def _match_country_in_map(self, country_code: str, source_map: Dict[str, float]) -> Optional[float]:
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
    
    def _score_to_classification(self, score: float) -> str:
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

