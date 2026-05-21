import pytest
from tests.conftest import get_config_by_kpi, post_kpi_config

# SCENARIO 1: External Temperature — both_required
# Triggers: validateTemperature

class TestScenario_ExternalTemperature:

    KPI  = "external_temperature"
    UNIT = "°C"

    # Step 2 — Enter min=36, leave max empty → attempt save
    # Assert status 400 with explicit error message
    def test_step2_min_provided_max_empty_returns_400(self, post_kpi_config):
        resp = post_kpi_config({
            "kpi_name":   self.KPI,
            "alert_name": "Ext Temp Warning",
            "unit":       self.UNIT,
            "min":        36,
            "max":        None
        })
        assert resp.status_code == 400
        assert resp.json()["message"]["error"] == "Both min and max are required"

    # Step 3 — Leave min empty, enter max=38 → attempt save
    # Assert same error
    def test_step3_max_provided_min_empty_returns_400(self, post_kpi_config):
        resp = post_kpi_config({
            "kpi_name":   self.KPI,
            "alert_name": "Ext Temp Warning",
            "unit":       self.UNIT,
            "min":        None,
            "max":        38
        })
        assert resp.status_code == 400
        assert resp.json()["message"]["error"] == "Both min and max are required"

    # Step 4 — Enter min=36 max=38 → save successfully
    # Assert status 201 (Created)
    def test_step4_valid_min_max_saves_successfully(self, post_kpi_config):
        resp = post_kpi_config({
            "kpi_name":   self.KPI,
            "alert_name": "Ext Temp Warning",
            "unit":       self.UNIT,
            "min":        36,
            "max":        38
        })
        assert resp.status_code == 201

    # Assert config persists on system lookup query
    def test_step4_config_persists_on_reopen(self, client, setup_kpi_environment, post_kpi_config, auth_headers):
        post_kpi_config({
            "kpi_name":   self.KPI,
            "alert_name": "Ext Temp Warning",
            "unit":       self.UNIT,
            "min":        36,
            "max":        38
        })
        
        # Pass auth_headers directly into the lookup utility function
        entry = get_config_by_kpi(client, setup_kpi_environment, self.KPI, auth_headers=auth_headers)
        assert entry is not None
        assert entry["min"] == 36
        assert entry["max"] == 38
    # Step 5 — Enter min=38 max=36 → attempt save
    # Assert error = "Min must be ≤ Max"
    def test_step5_min_greater_than_max_returns_400(self, post_kpi_config):
        resp = post_kpi_config({
            "kpi_name": self.KPI,
            "unit":     self.UNIT,
            "min":      38,
            "max":      36
        })
        assert resp.status_code == 400
        assert resp.json()["message"]["error"] == "Min must be ≤ Max"


# SCENARIO 2: LN2 Level — min-only, negative bound
# Triggers: validatePercentage — "Min cannot be negative"

class TestScenario_LN2Level:

    KPI  = "ln2_level"
    UNIT = "kg"

    # Step 1 — Open LN2 Level card
    # Passes auth_headers to authenticate the GET request
    def test_step1_max_is_null_in_response(self, client, setup_kpi_environment, auth_headers):
        entry = get_config_by_kpi(client, setup_kpi_environment, self.KPI, auth_headers=auth_headers)
        if entry:
            assert entry["max"] is None

    # Step 2 — Enter min=-1 → attempt save
    # Assert error = "Min cannot be negative"
    def test_step2_negative_min_returns_400(self, setup_kpi_environment, post_kpi_config):
        resp = post_kpi_config({
            "kpi_name":   self.KPI,
            "alert_name": "LN2 Level Warning",
            "unit":       self.UNIT,
            "min":        -1,
            "max":        None
        })
        assert resp.status_code == 400
        assert resp.json()["message"]["error"] == "Min cannot be negative"

    # Step 3 — Enter min=0 → save
    def test_step3_min_zero_is_valid(self, post_kpi_config):
        resp = post_kpi_config({
            "kpi_name":   self.KPI,
            "alert_name": "LN2 Level Warning",
            "unit":       self.UNIT,
            "min":        0,
            "max":        None
        })
        assert resp.status_code == 201

    # Step 4 — Enter min=50 → save
    def test_step4_min_50_saves_successfully(self, post_kpi_config):
        resp = post_kpi_config({
            "kpi_name":   self.KPI,
            "alert_name": "LN2 Level Warning",
            "unit":       self.UNIT,
            "min":        50,
            "max":        None
        })
        assert resp.status_code == 201


# SCENARIO 3: Battery Level — 0–100 bound
# Triggers: validateBattery — "Min cannot exceed 100"

class TestScenario_BatteryLevel:

    KPI  = "battery_level"
    UNIT = "%"

    # Step 1 — Open Battery Level card
    # Passes auth_headers to authenticate the GET request
    def test_step1_max_is_null_in_response(self, client, setup_kpi_environment, auth_headers):
        entry = get_config_by_kpi(client, setup_kpi_environment, self.KPI, auth_headers=auth_headers)
        if entry:
            assert entry["max"] is None

    # Step 2 — Enter min=-5
    # Assert error = "Min cannot be negative"
    def test_step2_negative_min_returns_400(self, post_kpi_config):
        resp = post_kpi_config({
            "kpi_name":   self.KPI,
            "alert_name": "Battery Warning",
            "unit":       self.UNIT,
            "min":        -5,
            "max":        None
        })
        assert resp.status_code == 400
        assert resp.json()["message"]["error"] == "Min cannot be negative"

    # Step 3 — Enter min=101
    # Assert error = "Min cannot exceed 100"
    def test_step3_min_exceeds_100_returns_400(self, post_kpi_config):
        resp = post_kpi_config({
            "kpi_name":   self.KPI,
            "alert_name": "Battery Warning",
            "unit":       self.UNIT,
            "min":        101,
            "max":        None
        })
        assert resp.status_code == 400
        assert resp.json()["message"]["error"] == "Min cannot exceed 100"

    # Step 4 — Enter min=20 → save
    def test_step4_valid_min_saves_successfully(self, post_kpi_config):
        resp = post_kpi_config({
            "kpi_name":   self.KPI,
            "alert_name": "Battery Warning",
            "unit":       self.UNIT,
            "min":        20,
            "max":        None
        })
        assert resp.status_code == 201

# SCENARIO 4: Internal Temperature — both_required, negative allowed
# Triggers: validateTemperature

class TestScenario_InternalTemperature:

    KPI  = "internal_temperature"
    UNIT = "°C"

    # Step 2 — Enter min=36, leave max empty → attempt save
    # Assert status 400 with explicit error message
    def test_step2_min_provided_max_empty_returns_400(self, post_kpi_config):
        resp = post_kpi_config({
            "kpi_name":   self.KPI,
            "alert_name": "Int Temp Warning",
            "unit":       self.UNIT,
            "min":        36,
            "max":        None
        })
        assert resp.status_code == 400
        assert resp.json()["message"]["error"] == "Both min and max are required"

    # Step 3 — Leave min empty, enter max=38 → attempt save
    # Assert same error
    def test_step3_max_provided_min_empty_returns_400(self, post_kpi_config):
        resp = post_kpi_config({
            "kpi_name":   self.KPI,
            "alert_name": "Int Temp Warning",
            "unit":       self.UNIT,
            "min":        None,
            "max":        38
        })
        assert resp.status_code == 400
        assert resp.json()["message"]["error"] == "Both min and max are required"

    # Step 4 — valid min+max → save successfully
    # Covers: both positive, both negative, cross-zero range
    @pytest.mark.parametrize("min_val,max_val", [
        (36,  38),   # both positive
        (-20,  -5),  # both negative
        (-10,  10)  # cross-zero
    ])
    def test_step4_valid_min_max_saves_successfully(self, post_kpi_config, min_val, max_val):
        resp = post_kpi_config({
            "kpi_name":   self.KPI,
            "alert_name": "Int Temp Warning",
            "unit":       self.UNIT,
            "min":        min_val,
            "max":        max_val
        })
        assert resp.status_code == 201

    # Assert config persists on system lookup query
    def test_step4_config_persists_on_reopen(self, client, setup_kpi_environment, post_kpi_config, auth_headers):
        post_kpi_config({
            "kpi_name":   self.KPI,
            "alert_name": "Int Temp Warning",
            "unit":       self.UNIT,
            "min":        36,
            "max":        38
        })

        entry = get_config_by_kpi(client, setup_kpi_environment, self.KPI, auth_headers=auth_headers)
        assert entry is not None
        assert entry["min"] == 36
        assert entry["max"] == 38

    # Step 5 — min > max → attempt save
    # Covers: both positive inverted, both negative inverted
    # Assert error = "Min must be ≤ Max"
    @pytest.mark.parametrize("min_val,max_val", [
        (38,  36),   # both positive, inverted
        (-5, -20)   # both negative, inverted
    ])
    def test_step5_min_greater_than_max_returns_400(self, post_kpi_config, min_val, max_val):
        resp = post_kpi_config({
            "kpi_name": self.KPI,
            "unit":     self.UNIT,
            "min":      min_val,
            "max":      max_val
        })
        assert resp.status_code == 400
        assert resp.json()["message"]["error"] == "Min must be ≤ Max"


# SCENARIO 5: Evaporation Rate of LN2 — both_required
# Triggers: validateEvaporationRate
class TestScenario_EvaporationRateLN2:

    KPI  = "evaporation_rate_ln2"
    UNIT = "kg/hr"

    # Step 2 — Enter min=0.1, leave max empty → attempt save
    # Assert status 400 with explicit error message
    def test_step2_min_provided_max_empty_returns_400(self, post_kpi_config):
        resp = post_kpi_config({
            "kpi_name":   self.KPI,
            "alert_name": "Evap Rate Warning",
            "unit":       self.UNIT,
            "min":        0.1,
            "max":        None
        })
        assert resp.status_code == 400
        assert resp.json()["message"]["error"] == "Both min and max are required"

    # Step 3 — Leave min empty, enter max=0.5 → attempt save
    # Assert same error
    def test_step3_max_provided_min_empty_returns_400(self, post_kpi_config):
        resp = post_kpi_config({
            "kpi_name":   self.KPI,
            "alert_name": "Evap Rate Warning",
            "unit":       self.UNIT,
            "min":        None,
            "max":        0.5
        })
        assert resp.status_code == 400
        assert resp.json()["message"]["error"] == "Both min and max are required"

    # Step 4 — Enter min=0.1 max=0.5 → save successfully
    # Assert status 201 (Created)
    def test_step4_valid_min_max_saves_successfully(self, post_kpi_config):
        resp = post_kpi_config({
            "kpi_name":   self.KPI,
            "alert_name": "Evap Rate Warning",
            "unit":       self.UNIT,
            "min":        0.1,
            "max":        0.5
        })
        assert resp.status_code == 201

    # Assert config persists on system lookup query
    def test_step4_config_persists_on_reopen(self, client, setup_kpi_environment, post_kpi_config, auth_headers):
        post_kpi_config({
            "kpi_name":   self.KPI,
            "alert_name": "Evap Rate Warning",
            "unit":       self.UNIT,
            "min":        0.1,
            "max":        0.5
        })

        entry = get_config_by_kpi(client, setup_kpi_environment, self.KPI, auth_headers=auth_headers)
        assert entry is not None
        assert entry["min"] == 0.1
        assert entry["max"] == 0.5

    # Step 5 — min > max → attempt save
    # Assert error = "Min must be ≤ Max"
    def test_step5_min_greater_than_max_returns_400(self, post_kpi_config):
        resp = post_kpi_config({
            "kpi_name": self.KPI,
            "unit":     self.UNIT,
            "min":      0.5,
            "max":      0.1
        })
        assert resp.status_code == 400
        assert resp.json()["message"]["error"] == "Min must be ≤ Max"

# SCENARIO 6: Shock Detection — both_required
# Triggers: validateShockDetection

class TestScenario_ShockDetection:

    KPI  = "shock_detection"
    UNIT = "g"

    # Step 2 — Enter min=1, leave max empty → attempt save
    # Assert status 400 with explicit error message
    def test_step2_min_provided_max_empty_returns_400(self, post_kpi_config):
        resp = post_kpi_config({
            "kpi_name":   self.KPI,
            "alert_name": "Shock Detection Warning",
            "unit":       self.UNIT,
            "min":        1,
            "max":        None
        })
        assert resp.status_code == 400
        assert resp.json()["message"]["error"] == "Both min and max are required"

    # Step 3 — Leave min empty, enter max=5 → attempt save
    # Assert same error
    def test_step3_max_provided_min_empty_returns_400(self, post_kpi_config):
        resp = post_kpi_config({
            "kpi_name":   self.KPI,
            "alert_name": "Shock Detection Warning",
            "unit":       self.UNIT,
            "min":        None,
            "max":        5
        })
        assert resp.status_code == 400
        assert resp.json()["message"]["error"] == "Both min and max are required"

    # Step 4 — Enter min=1 max=5 → save successfully
    # Assert status 201 (Created)
    def test_step4_valid_min_max_saves_successfully(self, post_kpi_config):
        resp = post_kpi_config({
            "kpi_name":   self.KPI,
            "alert_name": "Shock Detection Warning",
            "unit":       self.UNIT,
            "min":        1,
            "max":        5
        })
        assert resp.status_code == 201

    # Assert config persists on system lookup query
    def test_step4_config_persists_on_reopen(self, client, setup_kpi_environment, post_kpi_config, auth_headers):
        post_kpi_config({
            "kpi_name":   self.KPI,
            "alert_name": "Shock Detection Warning",
            "unit":       self.UNIT,
            "min":        1,
            "max":        5
        })

        entry = get_config_by_kpi(client, setup_kpi_environment, self.KPI, auth_headers=auth_headers)
        assert entry is not None
        assert entry["min"] == 1
        assert entry["max"] == 5

    # Step 5 — min > max → attempt save
    # Assert error = "Min must be ≤ Max"
    def test_step5_min_greater_than_max_returns_400(self, post_kpi_config):
        resp = post_kpi_config({
            "kpi_name": self.KPI,
            "unit":     self.UNIT,
            "min":      5,
            "max":      1
        })
        assert resp.status_code == 400
        assert resp.json()["message"]["error"] == "Min must be ≤ Max"

    #SCENARIO 11: Invalid Symbol input &  Boundary validation (equal cases for min and max)
    # Triggers: validateTemperature, validateEvaporationRate, validateShockDetection

class TestKpiConfigValidation:

    KPI_CASES = [
        ("external_temperature", "Ext Temp Warning", "°C", 36, 38),
        ("internal_temperature", "Int Temp Warning", "°C", 36, 38),
        ("evaporation_rate_ln2", "Evap Rate Warning", "kg/hr", 0.1, 0.5),
        ("shock_detection", "Shock Detection Warning", "g", 1, 5),
    ]


    @pytest.mark.parametrize("kpi, alert_name, unit, min_val, max_val", KPI_CASES)
    def test_min_equal_to_max_is_valid(
        self, post_kpi_config, kpi, alert_name, unit, min_val, max_val
    ):
        resp = post_kpi_config({
            "kpi_name": kpi,
            "alert_name": alert_name,
            "unit": unit,
            "min": min_val,
            "max": min_val
        })

        assert resp.status_code == 201

    @pytest.mark.parametrize("kpi, alert_name, unit, min_val, max_val", KPI_CASES)
    def test_symbols_in_min_returns_400(
        self, post_kpi_config, kpi, alert_name, unit, min_val, max_val
    ):
        resp = post_kpi_config({
            "kpi_name": kpi,
            "alert_name": alert_name,
            "unit": unit,
            "min": "@#$%",
            "max": max_val
        })
        print(resp.status_code)
        print(resp.text)
        assert resp.status_code == 400