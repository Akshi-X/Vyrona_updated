"""Tests for KPI alert configuration validation.

This module contains integration-style tests that exercise the KPI
configuration endpoints and validation logic. Each test class targets a
single KPI scenario (for example, external temperature or LN2 level) and
verifies the API's behavior for common edge cases:

- Required-field combinations (both min and max required vs. min-only)
- Numeric bounds (negative checks, upper bounds like 100%)
- Ordering (min must be less than or equal to max)
- Persistence (saved values can be retrieved via lookup)

Tests rely on shared fixtures provided by the test suite:
- `post_kpi_config`: helper to POST a KPI config payload and return a
  response object.
- `get_config_by_kpi`: helper to fetch a saved config by KPI name.
- `setup_kpi_environment`, `client`, `auth_headers`: environment and
  auth fixtures used when reading back persisted state.

Each test follows the arrange-act-assert pattern and includes a concise
docstring describing what is being arranged, the action taken, and the
expected outcome.
"""

import pytest
from tests.conftest import get_config_by_kpi, post_kpi_config


class TestScenario_ExternalTemperature:
    """Scenario: External Temperature (both min and max required).

    This KPI requires both `min` and `max` to be provided. Tests cover
    missing-field errors, valid saves, persistence after save, and the
    validation that `min` must be less than or equal to `max`.
    """

    KPI = "external_temperature"
    UNIT = "°C"

    def test_step2_min_provided_max_empty_returns_400(self, post_kpi_config):
        
        """Verify external temperature config validation when max is missing.
        
        Given a KPI config payload with min provided but max empty,
        when attempting to POST the KPI config,
        then the API rejects the request with a 400 status code.
        
        Arrange: Provide `min` but leave `max` empty.
        Act: Attempt to POST the KPI config.
        Assert: API rejects the request with 400 and the error message "Both min and max are required".
        """
        resp = post_kpi_config({
            "kpi_name": self.KPI,
            "alert_name": "Ext Temp Warning",
            "unit": self.UNIT,
            "min": 36,
            "max": None,
        })
        assert resp.status_code == 400
        assert resp.json()["message"]["error"] == "Both min and max are required"

    def test_step3_max_provided_min_empty_returns_400(self, post_kpi_config):
        
        """Verify external temperature config validation when min is missing.
        
        Given a KPI config payload with max provided but min empty,
        when attempting to POST the KPI config,
        then the API rejects the request with a 400 status code.
        
        Arrange: Provide `max` but leave `min` empty.
        Act: Attempt to POST the KPI config.
        Assert: API rejects the request with 400 and the same required-field error as above.
        """
        resp = post_kpi_config({
            "kpi_name": self.KPI,
            "alert_name": "Ext Temp Warning",
            "unit": self.UNIT,
            "min": None,
            "max": 38,
        })
        assert resp.status_code == 400
        assert resp.json()["message"]["error"] == "Both min and max are required"

    def test_step4_valid_min_max_saves_successfully(self, post_kpi_config):
        
        """Verify successful save of valid external temperature range.
        
        Given a KPI config payload with both valid min and max provided,
        when attempting to POST the KPI config,
        then the API creates the resource successfully.
        
        Arrange: Provide a valid `min` and `max` range.
        Act: POST the KPI config.
        Assert: API creates the resource and returns 201 (Created).
        """
        resp = post_kpi_config({
            "kpi_name": self.KPI,
            "alert_name": "Ext Temp Warning",
            "unit": self.UNIT,
            "min": 36,
            "max": 38,
        })
        assert resp.status_code == 201

    def test_step4_config_persists_on_reopen(
        self, client, setup_kpi_environment, post_kpi_config, auth_headers
    ):
        
        """Verify persistence of saved external temperature configuration.
        
        Given a saved valid KPI config,
        when reading it back using the lookup endpoint,
        then the persisted entry matches the saved values.
        
        Arrange: Save a valid config.
        Act: Read it back using the lookup endpoint.
        Assert: The persisted entry matches the saved `min` and `max` values.
        """
        post_kpi_config({
            "kpi_name": self.KPI,
            "alert_name": "Ext Temp Warning",
            "unit": self.UNIT,
            "min": 36,
            "max": 38,
        })

        entry = get_config_by_kpi(
            client, setup_kpi_environment, self.KPI, auth_headers=auth_headers
        )
        assert entry is not None
        assert entry["min"] == 36
        assert entry["max"] == 38

    def test_step5_min_greater_than_max_returns_400(self, post_kpi_config):
        
        """Verify validation that min bound must be less than or equal to max bound.
        
        Given a KPI config payload with min greater than max,
        when attempting to POST the KPI config,
        then the API rejects the request with a 400 status code.
        
        Arrange: Provide an inverted range where `min` > `max`.
        Act: Attempt to POST the KPI config.
        Assert: API rejects with 400 and the message "Min must be ≤ Max".
        """
        resp = post_kpi_config({
            "kpi_name": self.KPI,
            "unit": self.UNIT,
            "min": 38,
            "max": 36,
        })
        assert resp.status_code == 400
        assert resp.json()["message"]["error"] == "Min must be ≤ Max"


class TestScenario_LN2Level:
    """Scenario: LN2 Level (min-only, non-negative bound).

    LN2 level uses a `min` threshold only; `max` is expected to be null.
    Tests verify negative-value rejection, zero and positive valid cases,
    and that `max` remains null on lookup.
    """

    KPI = "ln2_level"
    UNIT = "kg"

    def test_step1_max_is_null_in_response(
        self, client, setup_kpi_environment, auth_headers
    ):
        
        """Verify that LN2 level config has no maximum limit parameter.
        
        Given an LN2 level configuration entry exists,
        when the config is retrieved from the database,
        then the max value is returned as null.
        
        Arrange: Read the LN2 level config if present.
        Act: Query the configuration using the lookup.
        Assert: When a LN2 entry exists, `max` is returned as None.
        """
        entry = get_config_by_kpi(
            client, setup_kpi_environment, self.KPI, auth_headers=auth_headers
        )
        if entry:
            assert entry["max"] is None

    def test_step2_negative_min_returns_400(self, setup_kpi_environment, post_kpi_config):
        
        """Verify that negative battery level min values are rejected.
        
        Given a battery level config payload with a negative min value,
        when saving the config,
        then the API rejects the request with a 400 status code.
        
        Arrange: Set `min` to a negative percentage.
        Act: Save the config via POST request.
        Assert: API returns 400 with "Min cannot be negative".
        """
        resp = post_kpi_config({
            "kpi_name": self.KPI,
            "alert_name": "LN2 Level Warning",
            "unit": self.UNIT,
            "min": -1,
            "max": None,
        })
        assert resp.status_code == 400
        assert resp.json()["message"]["error"] == "Min cannot be negative"

    def test_step3_min_zero_is_valid(self, post_kpi_config):
        
        """Verify that zero is accepted as a valid LN2 level min value.
        
        Given a configuration payload with min set to zero,
        when saving the config,
        then the API responds with a 201 status code.
        
        Arrange: Set `min` to zero (valid lower bound).
        Act: Save the config via POST request.
        Assert: API responds with 201.
        """
        resp = post_kpi_config({
            "kpi_name": self.KPI,
            "alert_name": "LN2 Level Warning",
            "unit": self.UNIT,
            "min": 0,
            "max": None,
        })
        assert resp.status_code == 201

    def test_step4_min_50_saves_successfully(self, post_kpi_config):
        
        """Verify successful save of positive LN2 level min threshold.
        
        Given a configuration payload with min set to a positive value,
        when saving the config,
        then the API creates the resource successfully.
        
        Arrange: Set `min` to a positive value and save.
        Act: POST the config to the endpoint.
        Assert: API creates the resource and returns 201.
        """
        resp = post_kpi_config({
            "kpi_name": self.KPI,
            "alert_name": "LN2 Level Warning",
            "unit": self.UNIT,
            "min": 50,
            "max": None,
        })
        assert resp.status_code == 201


class TestScenario_BatteryLevel:
    """Scenario: Battery Level (percentage with 0–100 bounds).

    Validates non-negativity and the upper limit of 100, plus normal
    persistence and save behavior for allowed values.
    """

    KPI = "battery_level"
    UNIT = "%"

    def test_step1_max_is_null_in_response(self, client, setup_kpi_environment, auth_headers):
        
        """Verify that LN2 level config has no maximum limit parameter.
        
        Given an LN2 level configuration entry exists,
        when the config is retrieved from the database,
        then the max value is returned as null.
        
        Arrange: Read the LN2 level config if present.
        Act: Query the configuration using the lookup.
        Assert: When a LN2 entry exists, `max` is returned as None.
        """
        entry = get_config_by_kpi(
            client, setup_kpi_environment, self.KPI, auth_headers=auth_headers
        )
        if entry:
            assert entry["max"] is None
    def test_step1_min_is_null_in_response(self, client, setup_kpi_environment, auth_headers):
        
        """Verify step1 min is null in response.
        
        Given the test parameters are prepared,
        when the action is executed,
        then the system behaves as expected.
        
        Arrange: Prepare test parameters.
        Act: Execute the target request/action.
        Assert: Verify that the response/state matches the expectation.
        """
        entry = get_config_by_kpi(
            client, setup_kpi_environment, self.KPI, auth_headers=auth_headers
        )
        if entry:
            assert entry["min"] is None

    def test_step2_negative_min_returns_400(self, post_kpi_config):
        
        """Verify that negative battery level min values are rejected.
        
        Given a battery level config payload with a negative min value,
        when saving the config,
        then the API rejects the request with a 400 status code.
        
        Arrange: Set `min` to a negative percentage.
        Act: Save the config via POST request.
        Assert: API returns 400 with "Min cannot be negative".
        """
        resp = post_kpi_config({
            "kpi_name": self.KPI,
            "alert_name": "Battery Warning",
            "unit": self.UNIT,
            "min": -5,
            "max": None,
        })
        assert resp.status_code == 400
        assert resp.json()["message"]["error"] == "Min cannot be negative"

    def test_step2_negative_max_returns_400(self, post_kpi_config):
        
        """Verify that negative battery level max values are rejected.
        
        Given a battery level config payload with a negative max value,
        when saving the config,
        then the API rejects the request with a 400 status code.
        
        Arrange: Set `max` to a negative percentage.
        Act: Save the config via POST request.
        Assert: API returns 400 with "Max cannot be negative".
        """
        resp = post_kpi_config({
            "kpi_name": self.KPI,
            "alert_name": "Battery Warning",
            "unit": self.UNIT,
            "min": None,
            "max": -4
        })
        assert resp.status_code == 400
        assert resp.json()["message"]["error"] == "Max cannot be negative"

    def test_step3_min_exceeds_100_returns_400(self, post_kpi_config):
        
        """Verify that battery level min values above 100% are rejected.
        
        Given a battery level config payload with min exceeding 100%,
        when saving the config,
        then the API rejects the request with a 400 status code.
        
        Arrange: Set `min` to a value greater than 100.
        Act: Save the config via POST request.
        Assert: API returns 400 with "Min cannot exceed 100%".
        """
        resp = post_kpi_config({
            "kpi_name": self.KPI,
            "alert_name": "Battery Warning",
            "unit": self.UNIT,
            "min": 101,
            "max": None,
        })
        assert resp.status_code == 400
        assert resp.json()["message"]["error"] == "Min cannot exceed 100"
    def test_step3_max_exceeds_100_returns_400(self, post_kpi_config):
        
        """Verify that battery level max values above 100% are rejected.
        
        Given a battery level config payload with max exceeding 100%,
        when saving the config,
        then the API rejects the request with a 400 status code.
        
        Arrange: Set `max` to a value greater than 100.
        Act: Save the config via POST request.
        Assert: API returns 400 with "Max cannot exceed 100%".
        """
        resp = post_kpi_config({
            "kpi_name": self.KPI,
            "alert_name": "Battery Warning",
            "unit": self.UNIT,
            "min": None,
            "max": 101,
        })
        assert resp.status_code == 400
        assert resp.json()["message"]["error"] == "Max cannot exceed 100"

    def test_step4_valid_min_saves_successfully(self, post_kpi_config):
        
        """Verify successful save of valid battery level min percentage.
        
        Given a battery level config payload with a valid percentage,
        when saving the config,
        then the API accepts it successfully.
        
        Arrange: Set `min` to a valid battery level percentage.
        Act: POST the battery level config to the endpoint.
        Assert: API creates the resource and returns 201.
        """
        resp = post_kpi_config({
            "kpi_name": self.KPI,
            "alert_name": "Battery Warning",
            "unit": self.UNIT,
            "min": 20,
            "max": None,
        })
        assert resp.status_code == 201

    def test_step5_max_zero_is_not_valid(self, post_kpi_config):
        
        """Verify that battery level max cannot be zero.
        
        Given a battery level config payload with max set to zero,
        when saving the config,
        then the API rejects the request with a 400 status code.
        
        Arrange: Set `max` to zero (invalid upper bound).
        Act: Save the config via POST request.
        Assert: API responds with 400.
        """
        resp = post_kpi_config({
            "kpi_name": self.KPI,
            "alert_name": "LN2 Level Warning",
            "unit": self.UNIT,
            "min": None,
            "max": 0
        })
        assert resp.status_code == 400
        assert resp.json()["message"]["error"] == "Max cannot be zero"

    
    @pytest.mark.parametrize(
        "min_val,max_val",
        [
            (38, 36),  # both positive, inverted
        ],
    )
    def test_step6_min_greater_than_max_returns_400(
        self, post_kpi_config, min_val, max_val
    ):
        
        """Verify validation that battery min percentage must be less than or equal to max percentage.
        
        Given a battery level config payload with min greater than max,
        when saving the config,
        then the API rejects the request with a 400 status code.
        
        Arrange: Set `min` value greater than `max` value.
        Act: Attempt to save the config via POST request.
        Assert: API rejects with 400 and the message "Max must be ≥ Min".
        """
        resp = post_kpi_config({
            "kpi_name": self.KPI,
            "unit": self.UNIT,
            "min": min_val,
            "max": max_val
        })
        assert resp.status_code == 400
        assert resp.json()["message"]["error"] == "Max must be ≥ Min"

class TestScenario_InternalTemperature:
    """Scenario: Internal Temperature (both min and max required; negatives allowed).

    Similar to external temperature but allows negative values. Tests cover
    required-field errors, valid ranges including negative values, and
    ordering validation.
    """

    KPI = "internal_temperature"
    UNIT = "°C"

    def test_step2_min_provided_max_empty_returns_400(self, post_kpi_config):
        
        """Verify external temperature config validation when max is missing.
        
        Given a KPI config payload with min provided but max empty,
        when attempting to POST the KPI config,
        then the API rejects the request with a 400 status code.
        
        Arrange: Provide `min` but leave `max` empty.
        Act: Attempt to POST the KPI config.
        Assert: API rejects the request with 400 and the error message "Both min and max are required".
        """
        resp = post_kpi_config({
            "kpi_name": self.KPI,
            "alert_name": "Int Temp Warning",
            "unit": self.UNIT,
            "min": 36,
            "max": None,
        })
        assert resp.status_code == 400
        assert resp.json()["message"]["error"] == "Both min and max are required"

    def test_step3_max_provided_min_empty_returns_400(self, post_kpi_config):
        
        """Verify external temperature config validation when min is missing.
        
        Given a KPI config payload with max provided but min empty,
        when attempting to POST the KPI config,
        then the API rejects the request with a 400 status code.
        
        Arrange: Provide `max` but leave `min` empty.
        Act: Attempt to POST the KPI config.
        Assert: API rejects the request with 400 and the same required-field error as above.
        """
        resp = post_kpi_config({
            "kpi_name": self.KPI,
            "alert_name": "Int Temp Warning",
            "unit": self.UNIT,
            "min": None,
            "max": 38,
        })
        assert resp.status_code == 400
        assert resp.json()["message"]["error"] == "Both min and max are required"

    @pytest.mark.parametrize(
        "min_val,max_val",
        [
            (36, 38),  # both positive
            (-20, -5),  # both negative
            (-10, 10),  # cross-zero
        ],
    )
    def test_step4_valid_min_max_saves_successfully(
        self, post_kpi_config, min_val, max_val
    ):
        
        """Verify successful save of valid external temperature range.
        
        Given a KPI config payload with both valid min and max provided,
        when attempting to POST the KPI config,
        then the API creates the resource successfully.
        
        Arrange: Provide a valid `min` and `max` range.
        Act: POST the KPI config.
        Assert: API creates the resource and returns 201 (Created).
        """
        resp = post_kpi_config({
            "kpi_name": self.KPI,
            "alert_name": "Int Temp Warning",
            "unit": self.UNIT,
            "min": min_val,
            "max": max_val,
        })
        assert resp.status_code == 201

    def test_step4_config_persists_on_reopen(
        self, client, setup_kpi_environment, post_kpi_config, auth_headers
    ):
        
        """Verify persistence of saved external temperature configuration.
        
        Given a saved valid KPI config,
        when reading it back using the lookup endpoint,
        then the persisted entry matches the saved values.
        
        Arrange: Save a valid config.
        Act: Read it back using the lookup endpoint.
        Assert: The persisted entry matches the saved `min` and `max` values.
        """
        post_kpi_config({
            "kpi_name": self.KPI,
            "alert_name": "Int Temp Warning",
            "unit": self.UNIT,
            "min": 36,
            "max": 38,
        })

        entry = get_config_by_kpi(
            client, setup_kpi_environment, self.KPI, auth_headers=auth_headers
        )
        assert entry is not None
        assert entry["min"] == 36
        assert entry["max"] == 38

    @pytest.mark.parametrize(
        "min_val,max_val",
        [
            (38, 36),  # both positive, inverted
            (-5, -20),  # both negative, inverted
        ],
    )
    def test_step5_min_greater_than_max_returns_400(
        self, post_kpi_config, min_val, max_val
    ):
        
        """Verify validation that min bound must be less than or equal to max bound.
        
        Given a KPI config payload with min greater than max,
        when attempting to POST the KPI config,
        then the API rejects the request with a 400 status code.
        
        Arrange: Provide an inverted range where `min` > `max`.
        Act: Attempt to POST the KPI config.
        Assert: API rejects with 400 and the message "Min must be ≤ Max".
        """
        resp = post_kpi_config({
            "kpi_name": self.KPI,
            "unit": self.UNIT,
            "min": min_val,
            "max": max_val,
        })
        assert resp.status_code == 400
        assert resp.json()["message"]["error"] == "Min must be ≤ Max"


class TestScenario_EvaporationRateLN2:
    """Scenario: Evaporation Rate of LN2 (both min and max required).

    Tests required-field behavior, valid float ranges, persistence, and
    ordering validation for evaporation rate KPIs.
    """

    KPI = "evaporation_rate_ln2"
    UNIT = "kg/hr"

    def test_step2_min_provided_max_empty_returns_400(self, post_kpi_config):
        
        """Verify external temperature config validation when max is missing.
        
        Given a KPI config payload with min provided but max empty,
        when attempting to POST the KPI config,
        then the API rejects the request with a 400 status code.
        
        Arrange: Provide `min` but leave `max` empty.
        Act: Attempt to POST the KPI config.
        Assert: API rejects the request with 400 and the error message "Both min and max are required".
        """
        resp = post_kpi_config({
            "kpi_name": self.KPI,
            "alert_name": "Evap Rate Warning",
            "unit": self.UNIT,
            "min": 0.1,
            "max": None,
        })
        assert resp.status_code == 400
        assert resp.json()["message"]["error"] == "Both min and max are required"

    def test_step3_max_provided_min_empty_returns_400(self, post_kpi_config):
        
        """Verify external temperature config validation when min is missing.
        
        Given a KPI config payload with max provided but min empty,
        when attempting to POST the KPI config,
        then the API rejects the request with a 400 status code.
        
        Arrange: Provide `max` but leave `min` empty.
        Act: Attempt to POST the KPI config.
        Assert: API rejects the request with 400 and the same required-field error as above.
        """
        resp = post_kpi_config({
            "kpi_name": self.KPI,
            "alert_name": "Evap Rate Warning",
            "unit": self.UNIT,
            "min": None,
            "max": 0.5,
        })
        assert resp.status_code == 400
        assert resp.json()["message"]["error"] == "Both min and max are required"

    def test_step4_valid_min_max_saves_successfully(self, post_kpi_config):
        
        """Verify successful save of valid external temperature range.
        
        Given a KPI config payload with both valid min and max provided,
        when attempting to POST the KPI config,
        then the API creates the resource successfully.
        
        Arrange: Provide a valid `min` and `max` range.
        Act: POST the KPI config.
        Assert: API creates the resource and returns 201 (Created).
        """
        resp = post_kpi_config({
            "kpi_name": self.KPI,
            "alert_name": "Evap Rate Warning",
            "unit": self.UNIT,
            "min": 0.1,
            "max": 0.5,
        })
        assert resp.status_code == 201

    def test_step4_config_persists_on_reopen(
        self, client, setup_kpi_environment, post_kpi_config, auth_headers
    ):
        
        """Verify persistence of saved external temperature configuration.
        
        Given a saved valid KPI config,
        when reading it back using the lookup endpoint,
        then the persisted entry matches the saved values.
        
        Arrange: Save a valid config.
        Act: Read it back using the lookup endpoint.
        Assert: The persisted entry matches the saved `min` and `max` values.
        """
        post_kpi_config({
            "kpi_name": self.KPI,
            "alert_name": "Evap Rate Warning",
            "unit": self.UNIT,
            "min": 0.1,
            "max": 0.5,
        })

        entry = get_config_by_kpi(
            client, setup_kpi_environment, self.KPI, auth_headers=auth_headers
        )
        assert entry is not None
        assert entry["min"] == 0.1
        assert entry["max"] == 0.5

    def test_step5_min_greater_than_max_returns_400(self, post_kpi_config):
        
        """Verify validation that min bound must be less than or equal to max bound.
        
        Given a KPI config payload with min greater than max,
        when attempting to POST the KPI config,
        then the API rejects the request with a 400 status code.
        
        Arrange: Provide an inverted range where `min` > `max`.
        Act: Attempt to POST the KPI config.
        Assert: API rejects with 400 and the message "Min must be ≤ Max".
        """
        resp = post_kpi_config({
            "kpi_name": self.KPI,
            "unit": self.UNIT,
            "min": 0.5,
            "max": 0.1,
        })
        assert resp.status_code == 400
        assert resp.json()["message"]["error"] == "Min must be ≤ Max"


class TestScenario_ShockDetection:
    """Scenario: Shock Detection (both min and max required).

    Validates required-field behavior, persistence, and ordering for shock
    detection thresholds (measured in g).
    """

    KPI = "shock_detection"
    UNIT = "g"

    def test_step2_min_provided_max_empty_returns_400(self, post_kpi_config):
        
        """Verify external temperature config validation when max is missing.
        
        Given a KPI config payload with min provided but max empty,
        when attempting to POST the KPI config,
        then the API rejects the request with a 400 status code.
        
        Arrange: Provide `min` but leave `max` empty.
        Act: Attempt to POST the KPI config.
        Assert: API rejects the request with 400 and the error message "Both min and max are required".
        """
        resp = post_kpi_config({
            "kpi_name": self.KPI,
            "alert_name": "Shock Detection Warning",
            "unit": self.UNIT,
            "min": 1,
            "max": None,
        })
        assert resp.status_code == 400
        assert resp.json()["message"]["error"] == "Both min and max are required"

    def test_step3_max_provided_min_empty_returns_400(self, post_kpi_config):
        
        """Verify external temperature config validation when min is missing.
        
        Given a KPI config payload with max provided but min empty,
        when attempting to POST the KPI config,
        then the API rejects the request with a 400 status code.
        
        Arrange: Provide `max` but leave `min` empty.
        Act: Attempt to POST the KPI config.
        Assert: API rejects the request with 400 and the same required-field error as above.
        """
        resp = post_kpi_config({
            "kpi_name": self.KPI,
            "alert_name": "Shock Detection Warning",
            "unit": self.UNIT,
            "min": None,
            "max": 5,
        })
        assert resp.status_code == 400
        assert resp.json()["message"]["error"] == "Both min and max are required"

    def test_step4_valid_min_max_saves_successfully(self, post_kpi_config):
        
        """Verify successful save of valid external temperature range.
        
        Given a KPI config payload with both valid min and max provided,
        when attempting to POST the KPI config,
        then the API creates the resource successfully.
        
        Arrange: Provide a valid `min` and `max` range.
        Act: POST the KPI config.
        Assert: API creates the resource and returns 201 (Created).
        """
        resp = post_kpi_config({
            "kpi_name": self.KPI,
            "alert_name": "Shock Detection Warning",
            "unit": self.UNIT,
            "min": 1,
            "max": 5,
        })
        assert resp.status_code == 201

    def test_step4_config_persists_on_reopen(
        self, client, setup_kpi_environment, post_kpi_config, auth_headers
    ):
        
        """Verify persistence of saved external temperature configuration.
        
        Given a saved valid KPI config,
        when reading it back using the lookup endpoint,
        then the persisted entry matches the saved values.
        
        Arrange: Save a valid config.
        Act: Read it back using the lookup endpoint.
        Assert: The persisted entry matches the saved `min` and `max` values.
        """
        post_kpi_config({
            "kpi_name": self.KPI,
            "alert_name": "Shock Detection Warning",
            "unit": self.UNIT,
            "min": 1,
            "max": 5,
        })

        entry = get_config_by_kpi(
            client, setup_kpi_environment, self.KPI, auth_headers=auth_headers
        )
        assert entry is not None
        assert entry["min"] == 1
        assert entry["max"] == 5

    def test_step5_min_greater_than_max_returns_400(self, post_kpi_config):
        
        """Verify validation that min bound must be less than or equal to max bound.
        
        Given a KPI config payload with min greater than max,
        when attempting to POST the KPI config,
        then the API rejects the request with a 400 status code.
        
        Arrange: Provide an inverted range where `min` > `max`.
        Act: Attempt to POST the KPI config.
        Assert: API rejects with 400 and the message "Min must be ≤ Max".
        """
        resp = post_kpi_config({
            "kpi_name": self.KPI,
            "unit": self.UNIT,
            "min": 5,
            "max": 1,
        })
        assert resp.status_code == 400
        assert resp.json()["message"]["error"] == "Min must be ≤ Max"


class TestKpiConfigValidation:
    """Cross-KPI validation checks and boundary cases.

    This class groups tests that should hold across multiple KPIs such as
    accepting equal min & max values and rejecting non-numeric symbol
    inputs for numeric fields.
    """

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
        
        """Verify min equal to max is valid.
        
        Given the test parameters are prepared,
        when POST where `min == max`;,
        then API creates the config (201)..
        
        Arrange: Prepare test parameters.
        Act: POST where `min == max`;
        Assert: API creates the config (201).
        """
        resp = post_kpi_config({
            "kpi_name": kpi,
            "alert_name": alert_name,
            "unit": unit,
            "min": min_val,
            "max": min_val,
        })

        assert resp.status_code == 201

    @pytest.mark.parametrize("kpi, alert_name, unit, min_val, max_val", KPI_CASES)
    def test_symbols_in_min_returns_400(
        self, post_kpi_config, kpi, alert_name, unit, min_val, max_val
    ):
        
        """Verify symbols in min returns 400.
        
        Given the test parameters are prepared,
        when the action is executed,
        then the system behaves as expected.
        
        Arrange: Prepare test parameters.
        Act: Execute the target request/action.
        Assert: Verify that the response/state matches the expectation.
        """
        resp = post_kpi_config({
            "kpi_name": kpi,
            "alert_name": alert_name,
            "unit": unit,
            "min": "@#$%",
            "max": max_val,
        })
        print(resp.status_code)
        print(resp.text)
        assert resp.status_code == 400
