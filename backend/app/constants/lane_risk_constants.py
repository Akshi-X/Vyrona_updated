"""
Lane Risk Assessment Constants
Contains all constants used for lane risk assessment calculations
"""
from typing import Dict
from datetime import timedelta
from app.config.config import settings

# ============================================
# WEATHER DETECTION CONSTANTS
# ============================================
WEATHER_CONSTANTS = {
    "EXTREME_HEAT_THRESHOLD": 35.0,  # Celsius
    "EXTREME_COLD_THRESHOLD": -10.0,  # Celsius
    "STRONG_WIND_THRESHOLD": 15.0,  # m/s (54 km/h)
    "LOW_VISIBILITY_THRESHOLD": 1000,  # meters (1km)
    "WEATHER_CACHE_TTL_HOURS": 6,
    "LPI_CACHE_TTL_HOURS": 24,
    "FLIGHT_PERFORMANCE_CACHE_TTL_HOURS": 12,
}

# ============================================
# FLIGHT PERFORMANCE CONSTANTS
# ============================================
FLIGHT_PERFORMANCE_CONSTANTS = {
    "ON_TIME_THRESHOLD_MINUTES": 15,  # On-time if delay < 15 minutes
    "LATE_THRESHOLD_MINUTES": 30,  # Late if delay >= 15 minutes
    "VERY_LATE_THRESHOLD_MINUTES": 45,  # Very late if delay >= 30 minutes
    "EXCESSIVE_THRESHOLD_MINUTES": 45,  # Excessive if delay >= 45 minutes
}

# ============================================
# WORLD BANK LPI API CONFIGURATION
# ============================================
# API URLs - Configurable via environment variables
# Can be overridden in .env file:
# LPI_TIMELINESS_API_URL=https://api.worldbank.org/v3/country/all/indicator/LP.LPI.TIM.XQ
# LPI_OVERALL_API_URL=https://api.worldbank.org/v3/country/all/indicator/LP.LPI.OVRL.XQ
LPI_TIMELINESS_API_URL = settings.LPI_TIMELINESS_API_URL
LPI_OVERALL_API_URL = settings.LPI_OVERALL_API_URL

# ============================================
# CACHE CONFIGURATION
# ============================================
LPI_CACHE_TTL = timedelta(hours=WEATHER_CONSTANTS["LPI_CACHE_TTL_HOURS"])
WEATHER_CACHE_TTL = timedelta(hours=WEATHER_CONSTANTS["WEATHER_CACHE_TTL_HOURS"])
FLIGHT_PERFORMANCE_CACHE_TTL = timedelta(hours=WEATHER_CONSTANTS["FLIGHT_PERFORMANCE_CACHE_TTL_HOURS"])

# ============================================
# REDIS CACHE KEY PREFIXES
# ============================================
# LPI Timeliness Redis keys
LPI_REDIS_KEY_PREFIX = "lpi:timeliness:"
LPI_REDIS_MAP_KEY = "lpi:timeliness:map"
LPI_REDIS_TIMESTAMP_KEY = "lpi:timeliness:timestamp"

# LPI Overall Redis keys
LPI_OVERALL_REDIS_KEY_PREFIX = "lpi:overall:"
LPI_OVERALL_REDIS_MAP_KEY = "lpi:overall:map"
LPI_OVERALL_REDIS_TIMESTAMP_KEY = "lpi:overall:timestamp"

# Flight Performance Redis keys
FLIGHT_PERFORMANCE_REDIS_KEY_PREFIX = "flight:performance:"

# ============================================
# WORLD BANK LPI TIMELINESS FALLBACK MAP
# ============================================
# Fallback mapping for countries when API data is unavailable
# Data source: https://lpi.worldbank.org/international/aggregated-ranking?sort=asc&order=Timeliness
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

