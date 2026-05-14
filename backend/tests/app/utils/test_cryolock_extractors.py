"""Unit tests for the cryolock-number parsing helpers in `app.utils.ivf_helpers`.

The format is Tank/Canister/Cane/Position, e.g. "T10/C5/E1/3".
The position must be numeric or the helper returns None (the record is skipped).
"""

import pytest

from app.utils.ivf_helpers import (
    extract_canister_code_from_cryolock_number,
    extract_cane_code_from_cryolock_number,
    extract_position_from_cryolock_number,
    extract_tank_code_from_cryolock_number,
)


@pytest.mark.parametrize(
    "value,tank,canister,cane,position",
    [
        ("T10/C5/E1/3", "T10", "C5", "E1", 3),
        ("T1/C1/A11/2", "T1", "C1", "A11", 2),
        ("T2/C2/B14/15", "T2", "C2", "B14", 15),
        ("T1/C1/A11/2/", "T1", "C1", "A11", 2),  # trailing slash tolerated
    ],
)
def test_extract_full_segments(value, tank, canister, cane, position):
    assert extract_tank_code_from_cryolock_number(value) == tank
    assert extract_canister_code_from_cryolock_number(value) == canister
    assert extract_cane_code_from_cryolock_number(value) == cane
    assert extract_position_from_cryolock_number(value) == position


def test_non_numeric_position_is_skipped():
    # Last segment "I3" is not numeric → record must be skipped (None).
    assert extract_position_from_cryolock_number("T1/C1/E1/I3") is None
    # Other extractors still work.
    assert extract_tank_code_from_cryolock_number("T1/C1/E1/I3") == "T1"


@pytest.mark.parametrize("value", [None, ""])
def test_empty_input_returns_none(value):
    assert extract_tank_code_from_cryolock_number(value) is None
    assert extract_canister_code_from_cryolock_number(value) is None
    assert extract_cane_code_from_cryolock_number(value) is None
    assert extract_position_from_cryolock_number(value) is None


def test_arc_service_wrappers_match_module_helpers():
    """The methods on ARCIVFService are now thin wrappers — verify identical behavior."""
    from app.service.IVF.arc_ivf_service import ARCIVFService

    svc = ARCIVFService.__new__(ARCIVFService)  # bypass __init__ (avoids httpx client)
    sample = "T10/C5/E1/3"
    assert svc._extract_tank_code_from_cryolock_number(sample) == "T10"
    assert svc._extract_canister_code_from_cryolock_number(sample) == "C5"
    assert svc._extract_location_from_cryolock_number(sample) == "E1"
    assert svc._extract_position_from_cryolock_number(sample) == 3
