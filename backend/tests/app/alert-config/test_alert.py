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
        """Arrange: provide `min` but leave `max` empty.

        Act: attempt to POST the KPI config.

        Assert: API rejects the request with 400 and the error message
        "Both min and max are required".
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
        """Arrange: provide `max` but leave `min` empty.

        Act: attempt to POST the KPI config.

        Assert: API rejects the request with 400 and the same required-field
        error as above.
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
        """Arrange: provide a valid `min` and `max` range.

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
        """Arrange: save a valid config, Act: read it back using the lookup

        Assert: the persisted entry matches the saved `min` and `max` values.
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
        """Arrange: provide an inverted range where `min` > `max`.

        Act: attempt to POST the KPI config.

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
        """Arrange: read the LN2 level config if present.

        Assert: when a LN2 entry exists, `max` is returned as None.
        """
        entry = get_config_by_kpi(
            client, setup_kpi_environment, self.KPI, auth_headers=auth_headers
        )
        if entry:
            assert entry["max"] is None

    def test_step2_negative_min_returns_400(self, setup_kpi_environment, post_kpi_config):
        """Arrange: set `min` to a negative value.

        Act: attempt to save; Assert: API returns 400 with
        "Min cannot be negative".
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
        """Arrange: set `min` to zero (valid lower bound).

        Act: save the config; Assert: API responds with 201.
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
        """Arrange: set `min` to a positive value and save.

        Act & Assert: API creates the resource and returns 201.
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
        """Assert that a stored battery-level config (if present) has

        `max` set to None (min-only semantics).
        """
        entry = get_config_by_kpi(
            client, setup_kpi_environment, self.KPI, auth_headers=auth_headers
        )
        if entry:
            assert entry["max"] is None

    def test_step2_negative_min_returns_400(self, post_kpi_config):
        """Negative percentages should be rejected.

        Act: save with min=-5; Assert: 400 with "Min cannot be negative".
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

    def test_step3_min_exceeds_100_returns_400(self, post_kpi_config):
        """Percentages above 100 should be rejected.

        Act: save with min=101; Assert: 400 with "Min cannot exceed 100".
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

    def test_step4_valid_min_saves_successfully(self, post_kpi_config):
        """Valid percentage within bounds should save successfully.

        Act & Assert: POST with min=20 returns 201.
        """
        resp = post_kpi_config({
            "kpi_name": self.KPI,
            "alert_name": "Battery Warning",
            "unit": self.UNIT,
            "min": 20,
            "max": None,
        })
        assert resp.status_code == 201


class TestScenario_InternalTemperature:
    """Scenario: Internal Temperature (both min and max required; negatives allowed).

    Similar to external temperature but allows negative values. Tests cover
    required-field errors, valid ranges including negative values, and
    ordering validation.
    """

    KPI = "internal_temperature"
    UNIT = "°C"

    def test_step2_min_provided_max_empty_returns_400(self, post_kpi_config):
        """Provide `min` without `max` — expect required-field error."""
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
        """Provide `max` without `min` — expect required-field error."""
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
        """Parametrized: valid ranges (positive, negative, cross-zero) should

        be accepted and return 201.
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
        """Save a valid internal-temp config and verify it persists on lookup."""
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
        """Parametrized: inverted ranges should be rejected with the

        message "Min must be ≤ Max".
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
        """Provide only `min` for evaporation rate — expect required-field error."""
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
        """Provide only `max` for evaporation rate — expect required-field error."""
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
        """Valid float range should be accepted and return 201."""
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
        """Save an evaporation-rate config and verify persistence on lookup."""
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
        """Inverted float range should be rejected with ordering error."""
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
        """Provide only `min` — expect required-field error for shock detection."""
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
        """Provide only `max` — expect required-field error for shock detection."""
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
        """Valid shock-detection range should save successfully (201)."""
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
        """Save a shock-detection config and verify it persists on lookup."""
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
        """Inverted shock-detection range should be rejected with ordering error."""
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
        """Equal min and max should be accepted (boundary case).

        Act: POST where `min == max`; Assert: API creates the config (201).
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
        """Non-numeric symbols in `min` should be rejected with 400.

        This guards against clients sending invalid string payloads for
        numeric fields.
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
