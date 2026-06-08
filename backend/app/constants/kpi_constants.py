class KPI_ALERTS:
    SOFT_ALERT = "soft_alert"
    CRITICAL_ALERT = "critical_alert"
    NO_ALERT = "no_alert"

    def check_deviation_from_thresholds(kpi_value, kpi_configs: list[dict])-> list[str,int,str]:
        """Check if a KPI value deviates from its configured thresholds and determine alert level also return if alert is active based on the status in the config."""
        alert_level = KPI_ALERTS.NO_ALERT
        kpi_config_id = None
        send_alert = None

        for config in kpi_configs:
            min_threshold = float(config.get("min")) if config.get("min") is not None else None
            max_threshold = float(config.get("max")) if config.get("max") is not None else None
            alert = config.get("alert_type") # This is will be either "soft_alert" or "critical_alert" based on how the KPI config is set up in the database
            status = config.get("status")

            #Check if the value deviates from the range (min<=value<=max) 
            #If there is deviation and is the alert_level is NO_ALERT then set to the alert type defined in the config (can be either soft or critical)
            #If there is deviation and alert level is already soft alert and the alert type defined in the config is critical alert then upgrade the alert level to critical alert.
            if alert_level == KPI_ALERTS.NO_ALERT:
                if (min_threshold is not None and kpi_value < min_threshold) or (max_threshold is not None and kpi_value > max_threshold):
                    alert_level = alert 
                    kpi_config_id = config.get("id")
                    send_alert = status
            elif alert_level == KPI_ALERTS.SOFT_ALERT and alert == KPI_ALERTS.CRITICAL_ALERT:
                if (min_threshold is not None and kpi_value < min_threshold) or (max_threshold is not None and kpi_value > max_threshold):
                    alert_level = alert
                    kpi_config_id = config.get("id")
                    send_alert = status

        return alert_level, kpi_config_id, send_alert

class KPI_NAMES:
    IVF_TEMPERATURE_INTERNAL = "temp_internal"
    IVF_TEMPERATURE_EXTERNAL = "temp_external"
    IVF_LN2_LEVEL = "ln2_level"
    IVF_LN2_EVAPORATION_RATE = "ln2_evaporation_rate"
    IVF_SHOCK = "shock"
    IVF_TIVE_BATTERY_PERCENTAGE = "tive_battery_percentage"
    IVF_LN2_LID_STATE = "ln2_lid_state"

    REFRIGERATOR_FREEZER_TEMP = "freezer_temperature"
    REFRIGERATOR_FRIDGE_TEMP = "refrigerator_temperature"

    def get_unit_for_kpi(kpi_name):
        """Return the unit for a given KPI name."""
        if kpi_name in [
            KPI_NAMES.IVF_TEMPERATURE_INTERNAL,
            KPI_NAMES.IVF_TEMPERATURE_EXTERNAL,
            KPI_NAMES.REFRIGERATOR_FREEZER_TEMP,
            KPI_NAMES.REFRIGERATOR_FRIDGE_TEMP,
        ]:
            return "°C"
        elif kpi_name in [KPI_NAMES.IVF_LN2_LEVEL]:
            return "Kg"
        elif kpi_name in [KPI_NAMES.IVF_LN2_EVAPORATION_RATE]:
            return "Kg/day"
        elif kpi_name in [KPI_NAMES.IVF_SHOCK]:
            return "g"
        elif kpi_name in [KPI_NAMES.IVF_TIVE_BATTERY_PERCENTAGE]:
            return "%"
        elif kpi_name in [KPI_NAMES.IVF_LN2_LID_STATE]:
            return "state"
        else:
            return ""

# ---------------------------------------------------------------------------
# KPI history aggregation buckets (duration in minutes). Used when returning
# static chart data for 1H / 24H / 7D so the DB does AVG per bucket efficiently.
# Change these to adjust bucket sizes (e.g. 5 min for 1H, 1 hour for 24H).
# ---------------------------------------------------------------------------
# 1-minute buckets → used for 1-hour range (up to ~60 points)
AGG_BUCKET_MINUTES_1H = 1
# 20-minute buckets → used for 24-hour range (up to ~72 points)
AGG_BUCKET_MINUTES_24H = 20
# 3-hour buckets (duration in minutes) → used for 7-day range (up to ~56 points)
AGG_BUCKET_MINUTES_7D = 3 * 60  # 180


class KPIConstants:
    KPI_NAMES = KPI_NAMES
    KPI_ALERTS = KPI_ALERTS

    KPI_READINGS_BROADCAST_CHANNEL = "tank_kpi_readings_channel"  # Redis pub/sub channel for broadcasting KPI readings to all subscribers (e.g., real-time dashboard updates)

    # Aggregation bucket sizes (minutes) for chart ranges; see AGG_BUCKET_* above.
    AGG_BUCKET_MINUTES_1H = AGG_BUCKET_MINUTES_1H
    AGG_BUCKET_MINUTES_24H = AGG_BUCKET_MINUTES_24H
    AGG_BUCKET_MINUTES_7D = AGG_BUCKET_MINUTES_7D
