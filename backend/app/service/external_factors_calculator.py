import json
import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

from app.config.config import settings
from app.constants.lane_risk_constants import (
    LPI_CACHE_TTL,
    LPI_OVERALL_REDIS_KEY_PREFIX,
    LPI_REDIS_KEY_PREFIX,
    WEATHER_CACHE_TTL,
    WEATHER_CONSTANTS,
)
from app.models.shipment_model import Shipment
from app.service.redis_service import get_redis
from app.utils.lane_risk_utils import LaneRiskUtils

logger = logging.getLogger(__name__)

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
    logger.warning(
        "httpx not available. External API calls will use cached data only."
    )


class ExternalFactorsCalculator:
    """Handles External Factors risk calculations (weather + LPI overall)."""

    def __init__(self, db):
        self.db = db

    def calculate(self, shipments: List[Shipment]) -> Dict:
        """Calculate External Factors risk."""
        contributors = []
        scores = []

        if not shipments:
            return {
                "risk_factor": "External",
                "risk_contributors": ["-", "-", "-", "-"],
                "risk_scale": "N/A",
            }

        weather_score, weather_info = self._calculate_weather_adversities_score(
            shipments
        )
        contributors.append(f"Weather Adversities: {weather_info}")
        if weather_score is not None:
            scores.append(weather_score)

        lpi_score, lpi_info = self._calculate_lpi_score(shipments)
        contributors.append(f"Logistics Performance Index: {lpi_info}")
        if lpi_score is not None:
            scores.append(lpi_score)

        contributors.append("-")
        contributors.append("-")

        if scores:
            avg_score = sum(scores) / len(scores)
            classification = LaneRiskUtils.score_to_classification(avg_score)
            risk_scale = f"{avg_score:.1f} ({classification})"
        else:
            risk_scale = "N/A"

        return {
            "risk_factor": "External",
            "risk_contributors": contributors[:4],
            "risk_scale": risk_scale,
        }

    def _get_live_iot_coordinates(
        self, shipment: Shipment
    ) -> Tuple[Optional[float], Optional[float]]:
        """
        Fetch live coordinates from IoT logger device (e.g., Tive).
        Currently returns None to fall back to static coordinates.
        """
        return None, None

    def _calculate_weather_adversities_score(
        self, shipments: List[Shipment]
    ) -> Tuple[Optional[float], str]:
        """Calculate score based on weather adversities."""
        if not shipments:
            return None, "N/A"

        adverse_weather_events = []
        total_route_points = 0
        checked_locations = []

        coordinates_to_check = []

        for shipment in shipments:
            if shipment.source_latitude and shipment.source_longitude:
                coordinates_to_check.append(
                    {
                        "lat": shipment.source_latitude,
                        "lng": shipment.source_longitude,
                        "timestamp": shipment.departure_time,
                        "type": "source",
                        "shipment_id": shipment.id,
                    }
                )
            else:
                logger.debug(f"Shipment {shipment.id}: Missing source coordinates")

            if shipment.destination_latitude and shipment.destination_longitude:
                coordinates_to_check.append(
                    {
                        "lat": shipment.destination_latitude,
                        "lng": shipment.destination_longitude,
                        "timestamp": shipment.arrival_time or shipment.departure_time,
                        "type": "destination",
                        "shipment_id": shipment.id,
                    }
                )
            else:
                logger.debug(f"Shipment {shipment.id}: Missing destination coordinates")

            for leg in shipment.shipment_legs:
                if leg.latitude and leg.longitude:
                    coordinates_to_check.append(
                        {
                            "lat": leg.latitude,
                            "lng": leg.longitude,
                            "timestamp": leg.departure_time or shipment.departure_time,
                            "type": f"leg{leg.leg_order}",
                            "shipment_id": shipment.id,
                        }
                    )
                else:
                    logger.debug(
                        f"Shipment {shipment.id} Leg {leg.leg_order}: Missing coordinates"
                    )

        for coord in coordinates_to_check:
            total_route_points += 1
            checked_locations.append(
                f"{coord['type']}({coord['lat']:.4f},{coord['lng']:.4f})"
            )
            weather = self._check_weather_at_location(
                coord["lat"], coord["lng"], coord["timestamp"]
            )
            if weather:
                adverse_weather_events.extend(weather)

        if total_route_points == 0:
            logger.warning(
                "Weather calculation: No route coordinates available. Required data: "
                "IoT device live coordinates (when implemented), "
                "shipment.source_latitude/source_longitude, "
                "shipment.destination_latitude/destination_longitude, "
                "or shipment_leg.latitude/longitude"
            )
            return None, "No route coordinates available"

        logger.debug(
            f"Weather check: {total_route_points} locations checked: {', '.join(checked_locations)}, "
            f"{len(adverse_weather_events)} adverse events found"
        )

        event_count = len(adverse_weather_events)

        if event_count == 0:
            avg_score = 4.5
            classification = "Normal"
            logger.debug(
                f"Weather check completed: {total_route_points} locations checked, "
                f"no adverse weather events detected (normal conditions)"
            )
        elif event_count == 1:
            avg_score = 3.5
            classification = "Minor"
        elif event_count == 2:
            avg_score = 2.5
            classification = "Moderate"
        elif event_count == 3:
            avg_score = 1.5
            classification = "Significant"
        else:
            avg_score = 0.5
            classification = "Severe"

        return avg_score, f"{classification} ({event_count} event(s))"

    def _check_weather_at_location(
        self, latitude: float, longitude: float, timestamp: Optional[datetime] = None
    ) -> List[Dict]:
        """Check weather at a specific location using WeatherAPI.com."""
        cache_key = f"weather:lat:{latitude:.4f}:lng:{longitude:.4f}:{timestamp.isoformat() if timestamp else 'current'}"

        try:
            r = get_redis()
            cached_data = r.get(cache_key)
            if cached_data:
                try:
                    return json.loads(cached_data)
                except json.JSONDecodeError:
                    pass
        except Exception:
            pass

        weather_data = self._fetch_weather_from_weatherapi(
            latitude, longitude, timestamp
        )

        if not weather_data:
            return []

        adverse_events = []
        weather = weather_data.get("weather", [])
        main_data = weather_data.get("main", {})
        wind_data = weather_data.get("wind", {})
        visibility = weather_data.get("visibility", 9999)
        location_name = weather_data.get("name")

        weather_main = weather[0].get("main", "").lower() if weather else ""
        weather_desc = weather[0].get("description", "").lower() if weather else ""
        temp = main_data.get("temp")
        humidity = main_data.get("humidity")
        wind_speed = wind_data.get("speed", 0)
        wind_gust = wind_data.get("gust")

        if "thunderstorm" in weather_main or "storm" in weather_desc:
            adverse_events.append(
                {
                    "type": "storm",
                    "severity": 2,
                    "description": weather_desc,
                    "location": location_name or f"{latitude:.4f}, {longitude:.4f}",
                    "impacts": {
                        "flight_delays_cancellations": True,
                        "road_blockages": True,
                        "tarmac_exposure": True,
                        "temperature_excursions": True,
                        "loading_unloading_risk": True,
                    },
                }
            )
        elif "rain" in weather_main or "rain" in weather_desc:
            severity = 1
            if "heavy" in weather_desc:
                severity = 2
            adverse_events.append(
                {
                    "type": "rain",
                    "severity": severity,
                    "description": weather_desc,
                    "location": location_name or f"{latitude:.4f}, {longitude:.4f}",
                    "impacts": {
                        "flight_delays_cancellations": True,
                        "road_blockages": True,
                        "tarmac_exposure": True,
                        "temperature_excursions": False,
                        "loading_unloading_risk": True,
                    },
                }
            )
        elif "snow" in weather_main or "snow" in weather_desc:
            adverse_events.append(
                {
                    "type": "snow",
                    "severity": 2,
                    "description": weather_desc,
                    "location": location_name or f"{latitude:.4f}, {longitude:.4f}",
                    "impacts": {
                        "flight_delays_cancellations": True,
                        "road_blockages": True,
                        "tarmac_exposure": True,
                        "temperature_excursions": True,
                        "loading_unloading_risk": True,
                    },
                }
            )
        elif "drizzle" in weather_main or "drizzle" in weather_desc:
            if "heavy" in weather_desc:
                adverse_events.append(
                    {
                        "type": "heavy_drizzle",
                        "severity": 1,
                        "description": weather_desc,
                        "location": location_name or f"{latitude:.4f}, {longitude:.4f}",
                        "impacts": {
                            "flight_delays_cancellations": False,
                            "road_blockages": False,
                            "tarmac_exposure": False,
                            "temperature_excursions": False,
                            "loading_unloading_risk": True,
                        },
                    }
                )

        if temp is not None:
            if temp > WEATHER_CONSTANTS["EXTREME_HEAT_THRESHOLD"]:
                adverse_events.append(
                    {
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
                            "loading_unloading_risk": True,
                        },
                    }
                )
            elif temp < WEATHER_CONSTANTS["EXTREME_COLD_THRESHOLD"]:
                adverse_events.append(
                    {
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
                            "loading_unloading_risk": True,
                        },
                    }
                )

        if visibility < WEATHER_CONSTANTS["LOW_VISIBILITY_THRESHOLD"]:
            adverse_events.append(
                {
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
                        "loading_unloading_risk": True,
                    },
                }
            )

        max_wind = max(wind_speed, wind_gust) if wind_gust else wind_speed
        if max_wind > WEATHER_CONSTANTS["STRONG_WIND_THRESHOLD"]:
            adverse_events.append(
                {
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
                        "loading_unloading_risk": True,
                    },
                }
            )

        return adverse_events

    def _fetch_weather_from_weatherapi(
        self, latitude: float, longitude: float, timestamp: Optional[datetime] = None
    ) -> Optional[Dict]:
        """Fetch weather data from WeatherAPI.com."""
        if not settings.WEATHER_API_KEY:
            logger.warning("WeatherAPI key not configured")
            return None

        cache_key = f"weather:lat:{latitude:.4f}:lng:{longitude:.4f}:{timestamp.isoformat() if timestamp else 'current'}"

        url = "https://api.weatherapi.com/v1/current.json"
        params = {
            "key": settings.WEATHER_API_KEY,
            "q": f"{latitude},{longitude}",
            "aqi": "no",
        }

        try:
            if HTTPX_AVAILABLE and _http_client:
                response = _http_client.get(url, params=params)
            elif HTTPX_AVAILABLE:
                import httpx

                response = httpx.get(url, params=params, timeout=10.0)
            else:
                logger.warning("httpx not available; skipping live weather lookup")
                return None
            response.raise_for_status()
            data = response.json()

            weather_data = {
                "name": data.get("location", {}).get("name"),
                "weather": [
                    {
                        "main": data.get("current", {})
                        .get("condition", {})
                        .get("text", ""),
                        "description": data.get("current", {})
                        .get("condition", {})
                        .get("text", ""),
                    }
                ],
                "main": {
                    "temp": data.get("current", {}).get("temp_c"),
                    "humidity": data.get("current", {}).get("humidity"),
                },
                "wind": {
                    "speed": data.get("current", {}).get("wind_kph", 0)
                    / 3.6,  # convert to m/s
                    "gust": data.get("current", {}).get("gust_kph", 0) / 3.6,
                },
                "visibility": data.get("current", {}).get("vis_km", 0) * 1000,
            }

            try:
                ttl_seconds = int(WEATHER_CACHE_TTL.total_seconds())
                r = get_redis()
                r.setex(cache_key, ttl_seconds, json.dumps(weather_data))
            except Exception:
                pass

            return weather_data

        except Exception as e:
            logger.warning(f"WeatherAPI request failed: {e}")
            return None

    def _calculate_lpi_score(
        self, shipments: List[Shipment]
    ) -> Tuple[Optional[float], str]:
        """Calculate score based on Logistics Performance Index (overall)."""
        if not shipments:
            return None, "N/A"

        destination_countries = set()
        for shipment in shipments:
            if shipment.destination_country:
                destination_countries.add(shipment.destination_country)

        if not destination_countries:
            return None, "No destination country data"

        destination_countries_list = list(destination_countries)

        country_scores_map = self._get_lpi_overall_scores_with_countries(
            destination_countries_list
        )

        if not country_scores_map:
            return None, "No LPI data available"

        lpi_scores = list(country_scores_map.values())
        avg_lpi = sum(lpi_scores) / len(lpi_scores)

        logger.debug(
            f"World Bank Overall LPI: {len(country_scores_map)} countries, "
            f"avg score: {avg_lpi:.2f}, countries: {list(destination_countries_list)}, "
            f"scores: {country_scores_map}"
        )

        mapped_score = max(0.5, min(4.5, avg_lpi - 0.5))
        classification = LaneRiskUtils.score_to_classification(mapped_score)

        if len(country_scores_map) == 1:
            country, score = next(iter(country_scores_map.items()))
            info = f"{avg_lpi:.2f} (Overall LPI) from {country} ({classification})"
        else:
            country_details = ", ".join(
                [
                    f"{country}: {score:.2f}"
                    for country, score in sorted(country_scores_map.items())
                ]
            )
            info = (
                f"{avg_lpi:.2f} (Overall LPI) avg from {len(country_scores_map)} countries "
                f"({country_details}) ({classification})"
            )

        return mapped_score, info

    def _get_lpi_overall_scores_batch(self, country_codes: List[str]) -> List[float]:
        """Batch fetch World Bank LPI Overall scores for multiple countries."""
        country_scores_map = self._get_lpi_overall_scores_with_countries(country_codes)
        return list(country_scores_map.values()) if country_scores_map else []

    def _get_lpi_overall_scores_with_countries(
        self, country_codes: List[str]
    ) -> Dict[str, float]:
        """Batch fetch World Bank LPI Overall scores with country mapping."""
        if not country_codes:
            return {}

        country_scores_map: Dict[str, float] = {}
        uncached_countries = []

        try:
            r = get_redis()
            pipe = r.pipeline()

            for country_code in country_codes:
                if not country_code:
                    continue
                redis_key = f"{LPI_OVERALL_REDIS_KEY_PREFIX}{country_code.upper()}"
                pipe.get(redis_key)

            cached_results = pipe.execute()

            for idx, country_code in enumerate(country_codes):
                if not country_code:
                    continue
                if idx < len(cached_results) and cached_results[idx]:
                    country_scores_map[country_code] = float(cached_results[idx])
                else:
                    uncached_countries.append(country_code)
        except Exception:
            uncached_countries = country_codes

        if uncached_countries:
            live_map = LaneRiskUtils.get_live_lpi_overall_map()

            pipe = None
            try:
                r = get_redis()
                pipe = r.pipeline()
                ttl_seconds = int(LPI_CACHE_TTL.total_seconds())
            except Exception:
                pass

            for country_code in uncached_countries:
                score = None

                if live_map:
                    score = LaneRiskUtils.match_country_in_map(country_code, live_map)

                if score is not None:
                    country_scores_map[country_code] = score
                    if pipe is not None:
                        try:
                            redis_key = (
                                f"{LPI_OVERALL_REDIS_KEY_PREFIX}{country_code.upper()}"
                            )
                            pipe.setex(redis_key, ttl_seconds, str(score))
                        except Exception:
                            pass

            if pipe is not None:
                try:
                    pipe.execute()
                except Exception:
                    pass

        return country_scores_map

