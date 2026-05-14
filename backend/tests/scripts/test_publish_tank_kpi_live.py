"""Tests for publish_tank_kpi_live script (payload shape and Redis publish)."""
import json
import sys
from pathlib import Path
from unittest.mock import MagicMock

import pytest

# Add backend/scripts to path so we can import the module
_backend = Path(__file__).resolve().parent.parent.parent
_scripts = _backend / "scripts"
if str(_scripts) not in sys.path:
    sys.path.insert(0, str(_scripts))

# Import after path is set
import publish_tank_kpi_live as script


CHANNEL = "tank_kpi_readings_channel"


def test_build_example1_has_tank_id_code_type_kpis_and_kpi_config_id():
    payload = script.build_example1(17, "T10", variation=0)
    assert payload["tank_id"] == 17
    assert payload["tank_code"] == "T10"
    assert payload["type"] == "tank_kpi"
    assert isinstance(payload["kpis"], list)
    assert len(payload["kpis"]) >= 5
    for k in payload["kpis"]:
        assert "name" in k and "value" in k and "timestamp" in k
        assert k.get("kpi_config_id") is not None


def test_build_example2_has_kpi_config_id_null():
    payload = script.build_example2(20, "T40", variation=0)
    assert payload["tank_id"] == 20
    assert payload["tank_code"] == "T40"
    assert payload["type"] == "tank_kpi"
    for k in payload["kpis"]:
        assert k.get("kpi_config_id") is None


def test_main_once_publishes_both_examples(monkeypatch):
    mock_redis = MagicMock()
    mock_redis.ping = MagicMock()
    monkeypatch.setattr(sys, "argv", ["publish_tank_kpi_live.py", "--once", "--tank1", "17", "--tank2", "20"])
    script.main(redis_client=mock_redis)

    assert mock_redis.publish.call_count == 2
    calls = mock_redis.publish.call_args_list
    for call in calls:
        args = call[0]
        assert args[0] == CHANNEL
        msg = json.loads(args[1])
        assert msg["tank_id"] in (17, 20)
        assert msg["tank_code"] in ("T10", "T40")
        assert "kpis" in msg and len(msg["kpis"]) > 0
    # First call = example 1 (tank 17), second = example 2 (tank 20)
    msg1 = json.loads(calls[0][0][1])
    msg2 = json.loads(calls[1][0][1])
    assert msg1["tank_id"] == 17
    assert msg2["tank_id"] == 20
    assert any(k.get("kpi_config_id") is not None for k in msg1["kpis"])
    assert all(k.get("kpi_config_id") is None for k in msg2["kpis"])
