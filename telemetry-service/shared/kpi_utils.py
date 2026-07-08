
from sqlalchemy import text
from .redis_client import get_redis_client
from shared.alert_api_client import trigger_immediate_alert_email, check_and_create_alerts

import json
import logging

logger = logging.getLogger(__name__)

class KPI_ALERTS:
    SOFT_ALERT = "soft_alert"
    CRITICAL_ALERT = "critical_alert"
    NO_ALERT = "no_alert"

    def check_deviation_from_thresholds(kpi_value, kpi_configs: list[dict])-> list[str,int,str]:
        """Check if a KPI value deviates from its configured thresholds and determine alert level also return if alert is active based on the status in the config."""
        alert_level = KPI_ALERTS.NO_ALERT
        kpi_config_id = None
        send_alert = None

        logger.info(f"Checking KPI value against thresholds: kpi_value={kpi_value}, kpi_configs={kpi_configs}")

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
    IVF_AMBIENT_HUMIDITY = "ambient_humidity"
    IVF_DEVICE_CHARGING_STATE = "device_charging_state"

    def get_unit_for_kpi(kpi_name):
        """Return the unit for a given KPI name."""
        if kpi_name in [KPI_NAMES.IVF_TEMPERATURE_INTERNAL, KPI_NAMES.IVF_TEMPERATURE_EXTERNAL]:
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
        elif kpi_name in [KPI_NAMES.IVF_AMBIENT_HUMIDITY]:
            return "%"
        elif kpi_name in [KPI_NAMES.IVF_DEVICE_CHARGING_STATE]:
            return "state"
        else:
            return ""

    """
    quality_data = {
        "tank_id": ivf_shipment_info.get("tank_id"),
        "tank_code": ivf_shipment_info.get("tank_code"),
        "canister_number": ivf_shipment_info.get("canister_number"),
        "shipment_id": shipment_id,
        "device_id": ivf_shipment_info.get("device_id"),
        "temp_internal": parameters.get("temp_internal"),
        "temp_internal_fahrenheit": parameters.get("temp_internal_fahrenheit"),
        "temp_external": parameters.get("temp_external"),
        "temp_external_fahrenheit": parameters.get("temp_external_fahrenheit"),
        "shock": parameters.get("shock"),
        "latitude": latitude,
        "longitude": longitude,
        "battery_percentage": battery_percentage,
        "ship_from": {
            "latitude": ship_from_latitude,
            "longitude": ship_from_longitude
        },
        "ship_to": {
            "latitude": ship_to_latitude,
            "longitude": ship_to_longitude
        },
        "timestamp": timestamp,
        "thresholds": thresholds,
        "threshold_violations": threshold_violations,
        "violated_parameters": violated_parameters,
        "quality_loss": quality_loss,
        "quality_status": quality_status,
        "quality_percentage": quality_percentage,
        "kpi_scores": kpi_scores,
        "kpi_statuses": kpi_statuses,
        "magnitude_results": magnitude_results,
        "frequency_results": frequency_results,
        "duration_results": duration_results,
        "kpi_visualization": kpi_visualization
    }
    """

    def convert_custom_iot_payload_to_kpi_names_mapped_array(payload: dict) -> list:
        """
        Convert a CUSTOM_IOT payload to a list of KPI name-value-unit mappings.

        Arguments:
        payload -- A dictionary containing the raw IoT payload data.

        Returns:
        A list of dictionaries, each containing 'timestamp', 'name', 'value', and 'unit' for a KPI reading.
        """
        kpi_data = []
        timestamp = payload.get("timestamp")

        if "ln2_mass_kg" in payload:
            kpi_data.append({
                "timestamp": timestamp,
                "name": KPI_NAMES.IVF_LN2_LEVEL,
                "value": payload["ln2_mass_kg"],
                "unit": KPI_NAMES.get_unit_for_kpi(KPI_NAMES.IVF_LN2_LEVEL)
            })
        evap_rate_day = payload.get("evaporation_rate_kg_per_day")
        if evap_rate_day is not None:
            kpi_data.append({
                "timestamp": timestamp,
                "name": KPI_NAMES.IVF_LN2_EVAPORATION_RATE,
                "value": evap_rate_day,
                "unit": KPI_NAMES.get_unit_for_kpi(KPI_NAMES.IVF_LN2_EVAPORATION_RATE)
            })
        # Fix: Map lid_state string to 0 (closed) or 1 (open)
        # Only publish this KPI when the reed switch itself reported the
        # state (lid_state_kpi_eligible); a missing/0/unparsable reading
        # falls back to the algorithmic estimate for internal use only and
        # must not be surfaced as a KPI or trigger deviation alerts.
        lid_state = payload.get("lid_state")
        lid_state_kpi_eligible = payload.get("lid_state_kpi_eligible", True)
        if lid_state is not None and lid_state_kpi_eligible:
            if isinstance(lid_state, str):
                if lid_state.upper() == "CLOSED":
                    lid_state_val = 0
                elif lid_state.upper() == "OPEN":
                    lid_state_val = 1
                else:
                    lid_state_val = 0  # Default to closed if unknown
            else:
                lid_state_val = lid_state
            kpi_data.append({
                "timestamp": timestamp,
                "name": KPI_NAMES.IVF_LN2_LID_STATE,
                "value": lid_state_val,
                "unit": KPI_NAMES.get_unit_for_kpi(KPI_NAMES.IVF_LN2_LID_STATE)
            })
        return kpi_data

    def convert_custom_composite_iot_payload_to_kpi_names_mapped_array(payload: dict) -> list:
        """
        Convert a CUSTOM_COMPOSITE_IOT quality_data dict to a list of KPI name-value-unit mappings.

        Unlike CUSTOM_IOT, this payload already carries internal/ambient temperature,
        ambient humidity, and device battery/charging state as flat, ready-to-use values
        alongside the LN2 weight-derived fields (ln2_mass_kg/evaporation_rate/lid_state),
        which are only present when the source payload's ln2_tank_weight was not NULL.

        Arguments:
        payload -- A dictionary containing the quality_data built from the raw IoT payload.

        Returns:
        A list of dictionaries, each containing 'timestamp', 'name', 'value', and 'unit' for a KPI reading.
        """
        kpi_data = []
        timestamp = payload.get("timestamp")

        if "ln2_mass_kg" in payload:
            kpi_data.append({
                "timestamp": timestamp,
                "name": KPI_NAMES.IVF_LN2_LEVEL,
                "value": payload["ln2_mass_kg"],
                "unit": KPI_NAMES.get_unit_for_kpi(KPI_NAMES.IVF_LN2_LEVEL)
            })
        evap_rate_day = payload.get("evaporation_rate_kg_per_day")
        if evap_rate_day is not None:
            kpi_data.append({
                "timestamp": timestamp,
                "name": KPI_NAMES.IVF_LN2_EVAPORATION_RATE,
                "value": evap_rate_day,
                "unit": KPI_NAMES.get_unit_for_kpi(KPI_NAMES.IVF_LN2_EVAPORATION_RATE)
            })
        lid_state = payload.get("lid_state")
        lid_state_kpi_eligible = payload.get("lid_state_kpi_eligible", True)
        if lid_state is not None and lid_state_kpi_eligible:
            if isinstance(lid_state, str):
                if lid_state.upper() == "CLOSED":
                    lid_state_val = 0
                elif lid_state.upper() == "OPEN":
                    lid_state_val = 1
                else:
                    lid_state_val = 0  # Default to closed if unknown
            else:
                lid_state_val = lid_state
            kpi_data.append({
                "timestamp": timestamp,
                "name": KPI_NAMES.IVF_LN2_LID_STATE,
                "value": lid_state_val,
                "unit": KPI_NAMES.get_unit_for_kpi(KPI_NAMES.IVF_LN2_LID_STATE)
            })
        if payload.get("temp_internal") is not None:
            kpi_data.append({
                "timestamp": timestamp,
                "name": KPI_NAMES.IVF_TEMPERATURE_INTERNAL,
                "value": payload["temp_internal"],
                "unit": KPI_NAMES.get_unit_for_kpi(KPI_NAMES.IVF_TEMPERATURE_INTERNAL)
            })
        if payload.get("temp_external") is not None:
            kpi_data.append({
                "timestamp": timestamp,
                "name": KPI_NAMES.IVF_TEMPERATURE_EXTERNAL,
                "value": payload["temp_external"],
                "unit": KPI_NAMES.get_unit_for_kpi(KPI_NAMES.IVF_TEMPERATURE_EXTERNAL)
            })
        if payload.get("ambient_humidity") is not None:
            kpi_data.append({
                "timestamp": timestamp,
                "name": KPI_NAMES.IVF_AMBIENT_HUMIDITY,
                "value": payload["ambient_humidity"],
                "unit": KPI_NAMES.get_unit_for_kpi(KPI_NAMES.IVF_AMBIENT_HUMIDITY)
            })
        if payload.get("battery_percentage") is not None:
            kpi_data.append({
                "timestamp": timestamp,
                "name": KPI_NAMES.IVF_TIVE_BATTERY_PERCENTAGE,
                "value": payload["battery_percentage"],
                "unit": KPI_NAMES.get_unit_for_kpi(KPI_NAMES.IVF_TIVE_BATTERY_PERCENTAGE)
            })
        if payload.get("device_charging_state") is not None:
            kpi_data.append({
                "timestamp": timestamp,
                "name": KPI_NAMES.IVF_DEVICE_CHARGING_STATE,
                "value": 1 if payload["device_charging_state"] else 0,
                "unit": KPI_NAMES.get_unit_for_kpi(KPI_NAMES.IVF_DEVICE_CHARGING_STATE)
            })
        return kpi_data

    def convert_ivf_quality_to_kpi_names_mapped_array(quality_data: dict) -> list:
        """
        Convert IVF quality data to a format suitable for KPI monitoring.

        Handles both a list of entries (historical) and a flat dict (single reading).

        Arguments:
        quality_data -- A dictionary containing IVF quality data for a single timestamp or a list under 'entries'.

        Returns:
        A list of dictionaries, each containing 'timestamp', 'name', 'value', and 'unit' for a KPI reading.
        """
        kpi_data = []
        entries = quality_data.get("entries")
        if entries and isinstance(entries, list):
            for entry in entries:
                timestamp = entry.get("timestamp")
                if "temp_internal" in entry:
                    kpi_data.append({
                        "timestamp": timestamp,
                        "name": KPI_NAMES.IVF_TEMPERATURE_INTERNAL,
                        "value": entry["temp_internal"],
                        "unit": KPI_NAMES.get_unit_for_kpi(KPI_NAMES.IVF_TEMPERATURE_INTERNAL)
                    })
                if "temp_external" in entry:
                    kpi_data.append({
                        "timestamp": timestamp,
                        "name": KPI_NAMES.IVF_TEMPERATURE_EXTERNAL,
                        "value": entry["temp_external"],
                        "unit": KPI_NAMES.get_unit_for_kpi(KPI_NAMES.IVF_TEMPERATURE_EXTERNAL)
                    })
                if "ln2_level" in entry:
                    kpi_data.append({
                        "timestamp": timestamp,
                        "name": KPI_NAMES.IVF_LN2_LEVEL,
                        "value": entry["ln2_level"],
                        "unit": KPI_NAMES.get_unit_for_kpi(KPI_NAMES.IVF_LN2_LEVEL)
                    })
                if "ln2_evaporation_rate" in entry:
                    kpi_data.append({
                        "timestamp": timestamp,
                        "name": KPI_NAMES.IVF_LN2_EVAPORATION_RATE,
                        "value": entry["ln2_evaporation_rate"],
                        "unit": KPI_NAMES.get_unit_for_kpi(KPI_NAMES.IVF_LN2_EVAPORATION_RATE)
                    })
                if "shock" in entry:
                    kpi_data.append({
                        "timestamp": timestamp,
                        "name": KPI_NAMES.IVF_SHOCK,
                        "value": entry["shock"],
                        "unit": KPI_NAMES.get_unit_for_kpi(KPI_NAMES.IVF_SHOCK)
                    })
                if "battery_percentage" in entry:
                    kpi_data.append({
                        "timestamp": timestamp,
                        "name": KPI_NAMES.IVF_TIVE_BATTERY_PERCENTAGE,
                        "value": entry["battery_percentage"],
                        "unit": KPI_NAMES.get_unit_for_kpi(KPI_NAMES.IVF_TIVE_BATTERY_PERCENTAGE)
                    })
                if "ln2_lid_state" in entry:
                    kpi_data.append({
                        "timestamp": timestamp,
                        "name": KPI_NAMES.IVF_LN2_LID_STATE,
                        "value": entry["ln2_lid_state"],
                        "unit": KPI_NAMES.get_unit_for_kpi(KPI_NAMES.IVF_LN2_LID_STATE)
                    })
        else:
            # Handle flat dict (single reading)
            timestamp = quality_data.get("timestamp")
            if "temp_internal" in quality_data and quality_data["temp_internal"] is not None:
                kpi_data.append({
                    "timestamp": timestamp,
                    "name": KPI_NAMES.IVF_TEMPERATURE_INTERNAL,
                    "value": quality_data["temp_internal"],
                    "unit": KPI_NAMES.get_unit_for_kpi(KPI_NAMES.IVF_TEMPERATURE_INTERNAL)
                })
            if "temp_external" in quality_data and quality_data["temp_external"] is not None:
                kpi_data.append({
                    "timestamp": timestamp,
                    "name": KPI_NAMES.IVF_TEMPERATURE_EXTERNAL,
                    "value": quality_data["temp_external"],
                    "unit": KPI_NAMES.get_unit_for_kpi(KPI_NAMES.IVF_TEMPERATURE_EXTERNAL)
                })
            if "ln2_level" in quality_data and quality_data["ln2_level"] is not None:
                kpi_data.append({
                    "timestamp": timestamp,
                    "name": KPI_NAMES.IVF_LN2_LEVEL,
                    "value": quality_data["ln2_level"],
                    "unit": KPI_NAMES.get_unit_for_kpi(KPI_NAMES.IVF_LN2_LEVEL)
                })
            if "ln2_evaporation_rate" in quality_data and quality_data["ln2_evaporation_rate"] is not None:
                kpi_data.append({
                    "timestamp": timestamp,
                    "name": KPI_NAMES.IVF_LN2_EVAPORATION_RATE,
                    "value": quality_data["ln2_evaporation_rate"],
                    "unit": KPI_NAMES.get_unit_for_kpi(KPI_NAMES.IVF_LN2_EVAPORATION_RATE)
                })
            if "shock" in quality_data and quality_data["shock"] is not None:
                kpi_data.append({
                    "timestamp": timestamp,
                    "name": KPI_NAMES.IVF_SHOCK,
                    "value": quality_data["shock"],
                    "unit": KPI_NAMES.get_unit_for_kpi(KPI_NAMES.IVF_SHOCK)
                })
            if "battery_percentage" in quality_data and quality_data["battery_percentage"] is not None:
                kpi_data.append({
                    "timestamp": timestamp,
                    "name": KPI_NAMES.IVF_TIVE_BATTERY_PERCENTAGE,
                    "value": quality_data["battery_percentage"],
                    "unit": KPI_NAMES.get_unit_for_kpi(KPI_NAMES.IVF_TIVE_BATTERY_PERCENTAGE)
                })
            if "ln2_lid_state" in quality_data and quality_data["ln2_lid_state"] is not None:
                kpi_data.append({
                    "timestamp": timestamp,
                    "name": KPI_NAMES.IVF_LN2_LID_STATE,
                    "value": quality_data["ln2_lid_state"],
                    "unit": KPI_NAMES.get_unit_for_kpi(KPI_NAMES.IVF_LN2_LID_STATE)
                })
        return kpi_data

class KPIConstants:
    KPI_NAMES = KPI_NAMES
    KPI_ALERTS = KPI_ALERTS

    KPI_READINGS_BROADCAST_CHANNEL = "tank_kpi_readings_channel"  # Redis pub/sub channel for broadcasting KPI readings to all subscribers (e.g., real-time dashboard updates)

def get_kpi_config_for_kpi_name(db_session, kpi_name: str, tank_id: str) -> list[dict]:
    """
    Fetch the KPI configuration for a given KPI name and tank ID. This could include thresholds, weights, etc.

    Arguments:
    kpi_name -- The name of the KPI for which to fetch the configuration.
    tank_id -- The ID of the tank for which to fetch the KPI configuration.
    """

    query = text("""
            SELECT * FROM kpi_config WHERE tank_id = :tank_id AND kpi_name = :kpi_name
        """)
    # For now, we will return dummy configurations. In a real implementation, this would query a database or external service.
    result = db_session.execute(query, {"tank_id": tank_id, "kpi_name": kpi_name})
    row = result.fetchall()

    row = [dict(row._mapping) for row in row]

    if not row:
        return []
    # Convert SQLAlchemy RowProxy objects to dictionaries
    config_list = []
    for r in row:
        config_list.append(dict(r))
    return config_list

def get_tank_code_for_device_code(db_session, device_code: str) -> str:
    """
    Fetch the tank code associated with a given device code.
    This is necessary to link KPI readings to the correct tank.

    The device_code that is given can be tive_device_id in tanks table in which we get the tank_code
    Or it can be device_code in devices table in which case we have to get the device_id to find the
    tank_id in ln2_iot_devices, which will give us tank_id to fetch the tank code from tanks table.

    Arguments:
    db_session -- The database session to use for querying.
    device_code -- The code of the device for which to fetch the associated tank code.

    Returns:
    The tank code associated with the given device code.
    """

    query = text("""
        SELECT
            t.tank_code as tank_code
        FROM tanks t
        -- Path 1: Direct link (device_code matches tive_device_id)
        LEFT JOIN devices d ON d.device_code = :device_code
        -- Path 2: Indirect link via ln2_iot_devices
        LEFT JOIN ln2_iot_devices lid ON d.id = lid.device_id
        WHERE
            -- Case A: The code is a tive_device_id in the tanks table
            t.tive_device_id = :device_code
            OR
            -- Case B: The code is in the devices table, linked via ln2_iot_devices
            t.tank_id = lid.tank_id;
    """)
    result = db_session.execute(query, {"device_code": device_code})
    row = result.fetchone()

    if row:
        return row[0]
    else:
        exception_message = f"No tank found for device_code: {device_code}"
        raise Exception(exception_message)

def get_metadata_for_kpi_entry_from_tank_code(db_session, tank_code: str, device_code: str) -> dict:
    """
    Fetch the metadata for a KPI reading entry, such as tank information,
    hospital information, device information and hospital branch information.

    Arguments:
    db_session -- The database session to use for querying metadata.
    tank_code -- The code of the tank for which to fetch metadata.
    device_code -- The code of the device for which to fetch metadata.

    Returns:
    A dictionary containing metadata such as tank_id, hospital_id, branch_id, and device_id
    """

    metadata_query = text("""
        WITH tank_match AS (
            SELECT
                t.tank_id,
                hb.hospital_id,
                t.branch_id,
                NULL::integer AS device_id
            FROM tanks t
            JOIN hospital_branches hb ON t.branch_id = hb.branch_id
            WHERE t.tive_device_id = :device_code
            LIMIT 1
        ),
        device_match AS (
            SELECT
                t.tank_id,
                hb.hospital_id,
                t.branch_id,
                d.id AS device_id
            FROM devices d
            JOIN ln2_iot_devices ld ON ld.device_id = d.id
            JOIN tanks t ON t.tank_id = ld.tank_id
            JOIN hospital_branches hb ON t.branch_id = hb.branch_id
            WHERE d.device_code = :device_code
            LIMIT 1
        ),
        combined AS (
            SELECT *, 1 AS priority FROM tank_match
            UNION ALL
            SELECT *, 2 AS priority FROM device_match
        )
        SELECT tank_id, hospital_id, branch_id, device_id
        FROM combined
        ORDER BY priority
        LIMIT 1;
    """)

    result = db_session.execute(metadata_query, {"device_code": device_code})
    row = result.fetchone()

    if row:
        return {
            "tank_id": row[0],
            "hospital_id": row[1],
            "branch_id": row[2],
            "device_id": row[3] if row[3] is not None else 0
        }
    else:
        exception_message = f"No metadata found for tank_code: {tank_code} and device_code: {device_code}"
        raise Exception(exception_message)

def publish_kpi_readings_to_redis(tank_id, tank_code, kpi_readings: list[dict]):
    """
    Publish KPI readings to a Redis pub/sub channel for real-time monitoring.

    Arguments:
    kpi_readings -- A list of dictionaries, each containing 'timestamp', 'name', 'value', 'unit', and metadata for a KPI reading.
    """
    try:
        r = get_redis_client()
        data_json = json.dumps({
            "tank_id": tank_id,
            "tank_code": tank_code,
            "kpis": kpi_readings
        })

        # Publish to channel
        r.publish(KPIConstants.KPI_READINGS_BROADCAST_CHANNEL, data_json)
        logger.info(f"✓ Published to tank_kpi_readings_channel (tank_code={tank_code})")

        return True
    except Exception as e:
        logger.error(f"Error publishing KPI readings to Redis: {e}")
        return False  # Non-criticalv

def save_kpi_readings(db_session, device_code:str, kpi_readings: list[dict]):
    """
    Insert KPI readings into the database.

    Arguments:
    db_session -- The database session to use for inserting data.
    kpi_readings -- A list of dictionaries, each containing 'timestamp', 'name', 'value', 'unit', and metadata for a KPI reading.
    """
    tank_code = get_tank_code_for_device_code(db_session, device_code)
    metadata = get_metadata_for_kpi_entry_from_tank_code(db_session, tank_code, device_code)

    logger.info(f"Saving KPI readings to database for tank_code={tank_code}, device_code={device_code}, metadata={metadata}, kpi_readings={kpi_readings}")

    for reading in kpi_readings:
        kpi_name = reading["name"]
        logger.info(f"Processing KPI reading: {reading}")

        if kpi_name not in KPI_NAMES.__dict__.values():
            logger.warning(f"KPI name '{kpi_name}' not recognized. Skipping.")
            continue

        kpi_configs = get_kpi_config_for_kpi_name(db_session, kpi_name, metadata["tank_id"])
        logger.info(f"Fetched KPI configs for '{kpi_name}' and tank_id={metadata['tank_id']}: {kpi_configs}")

        if reading.get("value") is None:
            logger.info(f"KPI value is null/None for '{kpi_name}'. Skipping.")
            continue

        kpi_value = None
        try:
            kpi_value = float(reading["value"])
        except Exception as e:
            logger.error(f"Failed to convert KPI value '{reading['value']}' to float for '{kpi_name}': {e}")
            kpi_value = 0
            continue


        alert_level, kpi_config_id, send_alert = KPI_ALERTS.check_deviation_from_thresholds(kpi_value, kpi_configs)
        logger.info(f"Deviation check for '{kpi_name}': alert_level={alert_level}, kpi_config_id={kpi_config_id}, send_alert={send_alert}")

        reading["deviation"] = alert_level != KPI_ALERTS.NO_ALERT
        # Always assign a kpi_config_id if configs exist, even if no deviation
        if kpi_config_id is None and kpi_configs:
            kpi_config_id = kpi_configs[0].get("id")
            logger.info(f"No deviation for '{kpi_name}', using first config id: {kpi_config_id}")
        reading["kpi_config_id"] = kpi_config_id
        # Ensure deviation_alert_sent is never None (default to False)
        reading["deviation_alert_sent"] = send_alert if send_alert is not None else False

        if kpi_config_id is None:
            logger.info(f"No valid kpi_config_id for '{kpi_name}'. Skipping insert.")
            continue

        query = text("""
            INSERT INTO readings (hospital_id, branch_id, device_id, tank_id, kpi_config_id, kpi_value, timestamp, deviation_alert_sent, deviation)
            VALUES (:hospital_id, :branch_id, :device_id, :tank_id, :kpi_config_id, :kpi_value, :timestamp, :deviation_alert_sent, :deviation)
        """)

        try:
            db_session.execute(query, {
                "hospital_id": metadata["hospital_id"],
                "branch_id": metadata["branch_id"],
                "device_id": metadata["device_id"],
                "tank_id": metadata["tank_id"],
                "kpi_config_id": reading["kpi_config_id"],
                "kpi_name": reading["name"],
                "kpi_value": kpi_value,
                "timestamp": reading["timestamp"],
                "deviation_alert_sent": reading["deviation_alert_sent"],
                "deviation": reading["deviation"]
            })
            logger.info(f"Inserted KPI reading for '{kpi_name}' (kpi_config_id={kpi_config_id}) into DB.")
        except Exception as e:
            logger.error(f"Failed to insert KPI reading for '{kpi_name}' into DB: {e}")

    try:
        db_session.commit()
        logger.info("Committed KPI readings to database.")
    except Exception as e:
        logger.error(f"Failed to commit KPI readings to database: {e}")

    try:
        publish_kpi_readings_to_redis(metadata["tank_id"], tank_code, kpi_readings)
        logger.info(f"Published KPI readings to Redis for tank_id={metadata['tank_id']}, tank_code={tank_code}")
    except Exception as e:
        logger.error(f"Failed to publish KPI readings to Redis: {e}")

    try:
        check_and_create_alerts(metadata["tank_id"], metadata["branch_id"],False,True)
        logger.info(f"Triggered alert check for tank_id={metadata['tank_id']}, branch_id={metadata['branch_id']}")
    except Exception as e:
        logger.error(f"Failed to trigger alert check: {e}")

    return True
