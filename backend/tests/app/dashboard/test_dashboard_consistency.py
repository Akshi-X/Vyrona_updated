"""Tests for IVF Dashboard consistency.

Area 1 — Monthly Data Consistency (Container Performance)   [TC-M01 – TC-M04]
Area 2 — Alert Badge ↔ Active Deviations Sync               [TC-A01 – TC-A04]
Area 3 — Auth & RBAC                                        [TC-AUTH01 – TC-AUTH04]
Area 6 — Acknowledge Endpoint Robustness                    [TC-ACK01 – TC-ACK03]
Area 7 — Multi-Tank & Multi-Branch Scenarios                [TC-MT01 – TC-MT02]

Auth pattern:
  setup_kpi_environment seeds Hospital → Branch → User → Tank.
  dashboard_env wraps that environment and attaches a signed JWT whose claims
  (user_id, hospital_id, branch_id, role=Admin, department=IVF) mirror the DB
  row exactly so the JWT middleware's DB lookup passes cleanly.

  hospital_id is read from request.state.current_user (JWT middleware).
  Do NOT pass hospital_id as a query param — the JWT carries it.

RBAC rules:
  • department != IVF              → 403 on all /api/ivf/* routes
  • role=Admin|Manager + dept=IVF  → deviation graph aggregated across ALL
                                     branches of the hospital
  • role=User + dept=IVF           → deviation graph scoped to tanks within
                                     the user's own branch_id only

Patch targets (pins datetime.now() in both service modules simultaneously):
  app.service.dashboard_service.datetime
  app.service.IVF.ivf_dashboard_service.datetime

Acknowledge schema (confirmed from router):
  POST /api/ivf/alerts/acknowledge
  body: { "alert_id": str, "acknowledgment_reason": str }

Alignment guarantees enforced by conftest.setup_kpi_environment:
  • User.hospital_id  == JWT["hospital_id"]
  • User.branch_id    == JWT["branch_id"]
  • Tank.branch_id    == Branch.branch_id
  • CriticalAlert.*_id fields seeded per-test from the same env dict
"""

import uuid
import datetime
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

from app.main import app
from app.config.database import SessionLocal
from app.auth.auth import create_access_token
from app.models.IVF.critical_alert_model import CriticalAlert
from app.models.kpi_config_model import KpiConfig
from app.models.IVF.hospital_branch_model import HospitalBranch as Branch
from app.models.IVF.tank_model import Tank


# ── URL Constants ──────────────────────────────────────────────────────────────

QUALITY_DEVIATIONS_URL        = "/api/ivf/dashboard/metrics/quality-deviations-flagged"
DEVIATION_GRAPH_URL           = "/api/ivf/dashboard/metrics/deviations-graph"
TOP_DEVIATION_DRIVER_URL      = "/api/ivf/dashboard/metrics/top-deviation-driver"
TOTAL_CONTAINERS_URL          = "/api/ivf/dashboard/metrics/total-containers"
TOTAL_CRYOLOCKS_URL           = "/api/ivf/dashboard/metrics/total-embryos-cryolocks"
ALERTS_HOSPITAL_URL           = "/api/ivf/alerts/hospital"
ALERTS_ACKNOWLEDGE_URL        = "/api/ivf/alerts/acknowledge"

# May 2026 timestamp range in milliseconds (used by graph endpoint params)
MAY_2026_FROM_TS = 1777593600000   # 2026-05-01 00:00:00 UTC
MAY_2026_TO_TS   = 1780271999000   # 2026-05-31 23:59:59 UTC

# ── Patch Targets ──────────────────────────────────────────────────────────────

_PATCH_DASHBOARD_SVC = "app.service.dashboard_service.datetime"
_PATCH_IVF_DASH_SVC  = "app.service.IVF.ivf_dashboard_service.datetime"


# ══════════════════════════════════════════════════════════════════════════════
# MODULE-LEVEL FIXTURES
# ══════════════════════════════════════════════════════════════════════════════

@pytest.fixture
def dashboard_client():
    """Dedicated TestClient for dashboard tests."""
    return TestClient(app)


@pytest.fixture
def dashboard_env(setup_kpi_environment):
    """
    Wraps setup_kpi_environment and attaches a signed JWT.

    The token payload mirrors the seeded User row exactly:
    role=Admin, department=IVF, hospital_id/branch_id from the seeded branch.
    hospital_id is embedded in the token — endpoints read it from the JWT,
    not from query params.
    """
    env = setup_kpi_environment
    db  = env["db"]

    from app.models.user_model import User as UserModel
    user = db.query(UserModel).filter(
        UserModel.user_id == env["user_id"]
    ).first()

    token_payload = {
        "sub":         str(user.user_id),
        "id":          str(user.user_id),
        "user_id":     str(user.user_id),
        "email":       user.email,
        "role":        "Admin",
        "user_role":   "Admin",
        "type":        "hospital_user",
        "user_type":   "hospital_user",
        "hospital_id": str(user.hospital_id),
        "branch_id":   str(user.branch_id),
        "department":  "IVF",
        "token_type":  "access",
        "identity":    str(user.user_id),
        "exp": datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=1),
        "iat": datetime.datetime.now(datetime.timezone.utc),
    }
    token = create_access_token(data=token_payload)

    kpi_config = KpiConfig(
        hospital_id=env["hospital_id"],
        branch_id=env["branch_id"],
        tank_id=env["tank_id"],
        kpi_name="temp_internal",
        alert_name="Deviation alert",
        min=-200,
        max=-190,
        unit="°C",
        alert_type="critical",
        cooldown_minutes=60,
        status=True,
    )
    db.add(kpi_config)
    db.commit()
    db.refresh(kpi_config)

    print("\n--- DEBUG DASHBOARD TOKEN ---")
    print(token_payload)

    return {
        **env,
        "headers": {"Authorization": f"Bearer {token}"},
        "kpi_config_id": kpi_config.id,
    }


# ══════════════════════════════════════════════════════════════════════════════
# DATETIME PATCH HELPER
# Pins datetime.now() in both service modules simultaneously.
# ══════════════════════════════════════════════════════════════════════════════

def _mock_dt(fake_now: datetime.datetime) -> MagicMock:
    """
    Returns a MagicMock that behaves like the datetime class:
      • .now()        → fake_now
      • datetime(...) → real datetime construction (for isinstance checks)
    """
    m = MagicMock(spec=datetime.datetime)
    m.now.return_value = fake_now
    m.side_effect = lambda *a, **kw: datetime.datetime(*a, **kw)
    return m


class _patch_now:
    """Context manager that patches datetime.now in both service modules."""

    def __init__(self, fake_now: datetime.datetime):
        self._patches = [
            patch(_PATCH_DASHBOARD_SVC, new=_mock_dt(fake_now)),
            patch(_PATCH_IVF_DASH_SVC,  new=_mock_dt(fake_now)),
        ]

    def __enter__(self):
        for p in self._patches:
            p.start()
        return self

    def __exit__(self, *args):
        for p in self._patches:
            p.stop()


# ══════════════════════════════════════════════════════════════════════════════
# ALERT SEED / TEARDOWN HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def _dedup_key(tank_id, source, alert_type, occurred_at: datetime.datetime, kpi_config_id: int = None) -> str:
    """
    Builds a unique dedup_key using the service's alert format.

    Format: tank_id:source:alert_type:YYYY-MM-DD_HH:MM:SS:kpi_config_id
    """
    timestamp = occurred_at.strftime("%Y-%m-%d_%H:%M:%S")
    return f"{tank_id}:{source}:{alert_type}:{timestamp}:{kpi_config_id or ''}"


def _seed_alert(
    db, *,
    hospital_id,
    branch_id,
    tank_id,
    occurred_at:  datetime.datetime,
    status:       str = "Active",
    alert_type:   str = "Deviation alert",
    source:       str = "KPI",
    severity:     str = "High",
    triggered_by: str = "system",
    message:      str = "Test alert seeded by dashboard consistency tests",
    kpi_config_id: int = None,
) -> CriticalAlert:
    """
    Inserts one CriticalAlert row aligned with the seeded Hospital / Branch /
    Tank. All FK fields come from the environment dict — never hardcoded.
    """
    alert = CriticalAlert(
        alert_id      = str(uuid.uuid4()),
        tank_id       = tank_id,
        incubator_id  = None,
        hospital_id   = hospital_id,
        branch_id     = branch_id,
        alert_type    = alert_type,
        source        = source,
        severity      = severity,
        message       = message,
        status        = status,
        triggered_by  = triggered_by,
        occurred_at   = occurred_at,
        dedup_key     = _dedup_key(
            tank_id, source, alert_type,
            occurred_at,
            kpi_config_id=kpi_config_id
        ),
    )
    db.add(alert)
    db.commit()
    db.refresh(alert)
    return alert


def _cleanup(db, alerts: list) -> None:
    """Deletes a list of CriticalAlert rows by primary key. Safe with empty list."""
    for a in alerts:
        row = db.query(CriticalAlert).filter(
            CriticalAlert.alert_id == a.alert_id
        ).first()
        if row:
            db.delete(row)
    db.commit()


def _active_count(resp_json) -> int:
    """
    Counts items whose status == 'Active' from the /alerts/hospital response.
    Handles the three common envelope shapes returned by the API.
    """
    items = resp_json if isinstance(resp_json, list) else (
        resp_json.get("alerts")
        or resp_json.get("data")
        or resp_json.get("critical_alerts")
        or []
    )
    return sum(1 for i in items if i.get("status") == "Active")


# ── Token builder helper (used by Area 3 & 7 tests) ──────────────────────────

def _make_token(
    user,
    *,
    role:        str  = "Admin",
    department:  str  = "IVF",
    hospital_id        = None,
    branch_id          = None,
    expired:     bool = False,
) -> str:
    """
    Builds a signed JWT with the given role / department overrides.
    Pass expired=True to produce a token whose exp is already in the past.
    """
    now = datetime.datetime.now(datetime.timezone.utc)
    exp = (now - datetime.timedelta(hours=1)) if expired else (now + datetime.timedelta(days=1))

    payload = {
        "sub":         str(user.user_id),
        "id":          str(user.user_id),
        "user_id":     str(user.user_id),
        "email":       user.email,
        "role":        role,
        "user_role":   role,
        "type":        "hospital_user",
        "user_type":   "hospital_user",
        "hospital_id": str(hospital_id or user.hospital_id),
        "branch_id":   str(branch_id   or user.branch_id),
        "department":  department,
        "token_type":  "access",
        "identity":    str(user.user_id),
        "exp":         exp,
        "iat":         now,
    }
    return create_access_token(data=payload)


# ══════════════════════════════════════════════════════════════════════════════
# AREA 1 — Monthly Data Consistency  [TC-M01 – TC-M04]
# ══════════════════════════════════════════════════════════════════════════════

# ══════════════════════════════════════════════════════════════════
# TC-M01: Current month deviation count excludes prior months
# ══════════════════════════════════════════════════════════════════
def test_TC_M01_current_month_deviation_count(dashboard_client, dashboard_env):
    
    """Verify that quality deviations count only includes alerts from the current month.
    
    Given May has 3 flagged deviations and April had 7,
    when an Admin/IVF user views the quality deviations dashboard metrics in May,
    then the API returns a count of 3 deviations (excluding April's alerts entirely).
    
    Arrange: Seed 3 alerts in May and 7 alerts in April for the active tank.
    Act: Retrieve quality deviations from the dashboard metrics endpoint while mocked to May.
    Assert: Verify that the returned count is exactly 3.
    """
    print("\n" + "=" * 60)
    print("TC-M01: Current month deviation count (filter excludes prior months)")
    print("=" * 60)

    db          = dashboard_env["db"]
    hospital_id = dashboard_env["hospital_id"]
    branch_id   = dashboard_env["branch_id"]
    tank_id     = dashboard_env["tank_id"]
    headers     = dashboard_env["headers"]

    may_base   = datetime.datetime(2026, 5, 10, 9, 0, 0)
    april_base = datetime.datetime(2026, 4, 10, 9, 0, 0)

    print(f"\nSeeding 3 May alerts and 7 April alerts for tank_id={tank_id}")

    may_alerts = [
        _seed_alert(
            db,
            hospital_id=hospital_id,
            branch_id=branch_id,
            tank_id=tank_id,
            occurred_at=may_base + datetime.timedelta(days=i),
            kpi_config_id=dashboard_env["kpi_config_id"],
        )
        for i in range(3)
    ]
    april_alerts = [
        _seed_alert(
            db,
            hospital_id=hospital_id,
            branch_id=branch_id,
            tank_id=tank_id,
            occurred_at=april_base + datetime.timedelta(days=i),
            kpi_config_id=dashboard_env["kpi_config_id"],
        )
        for i in range(7)
    ]

    try:
        with _patch_now(datetime.datetime(2026, 5, 20, 12, 0, 0)):
            resp = dashboard_client.get(QUALITY_DEVIATIONS_URL, headers=headers)

        print(f"\nQUALITY DEVIATIONS RESPONSE")
        print(f"Status : {resp.status_code}")
        print(f"Body   : {resp.text}")

        assert resp.status_code == 200, resp.text

        data    = resp.json()
        # Real API key — total_quality_deviations
        # Fallbacks kept for forward-compatibility if key name changes
        _raw = data.get("total_quality_deviations")
        flagged = _raw if _raw is not None else (
            data.get("quality_deviations_flagged")
            or data.get("deviations_flagged")
            or data.get("count")
            or data.get("total")
        )

        print(f"\n flagged : {flagged}")

        assert flagged == 3, (
            f"TC-M01 FAILED: got {flagged}, expected 3. "
            "Monthly filter must exclude April's 7 alerts."
        )
        print("\n✓ PASSED — Monthly filter correctly returns 3 (May only)")

    finally:
        _cleanup(db, may_alerts + april_alerts)


# ══════════════════════════════════════════════════════════════════
# TC-M02: Deviation graph bars sum matches monthly count
# ══════════════════════════════════════════════════════════════════
def test_TC_M02_deviation_graph_bars_match_monthly_count(dashboard_client, dashboard_env):
    
    """Verify that deviation graph bar segments sum matches the monthly deviations count.
    
    Given 3 deviations seeded for the month of May,
    when an Admin/IVF user views the deviations graph for May,
    then the sum of all bar segments in the graph equals 3.
    
    Arrange: Seed 3 deviations in May for the active tank.
    Act: Retrieve the deviations graph metric for the May date range.
    Assert: Verify that the sum of the deviation counts across all graph bars is exactly 3.
    """
    print("\n" + "=" * 60)
    print("TC-M02: Deviation graph bar sum matches monthly count")
    print("=" * 60)

    db          = dashboard_env["db"]
    hospital_id = dashboard_env["hospital_id"]
    branch_id   = dashboard_env["branch_id"]
    tank_id     = dashboard_env["tank_id"]
    headers     = dashboard_env["headers"]

    may_base = datetime.datetime(2026, 5, 10, 9, 0, 0)

    print(f"\nSeeding 3 May alerts for tank_id={tank_id}")

    alerts = [
        _seed_alert(
            db,
            hospital_id=hospital_id,
            branch_id=branch_id,
            tank_id=tank_id,
            occurred_at=may_base + datetime.timedelta(days=i),
            kpi_config_id=dashboard_env["kpi_config_id"],
        )
        for i in range(3)
    ]

    try:
        resp = dashboard_client.get(
            DEVIATION_GRAPH_URL,
            params={"from_ts": MAY_2026_FROM_TS, "to_ts": MAY_2026_TO_TS},
            headers=headers,
        )

        print(f"\nDEVIATION GRAPH RESPONSE")
        print(f"Status : {resp.status_code}")
        print(f"Body   : {resp.text}")

        assert resp.status_code == 200, resp.text

        graph = resp.json()
        # Real API shape: {"available_heading": [...], "data": [...]}
        bars = (
            graph.get("bars")
            or graph.get("data")
            or graph.get("graph")
            or (graph if isinstance(graph, list) else [])
        )
        # Sum whichever numeric field the bar items expose
        total = sum(
            b.get("count",
                b.get("value",
                    b.get("deviation_count",
                        b.get("total", 0))))
            for b in bars
        )

        print(f"\n bar total : {total}")

        assert total == 3, (
            f"TC-M02 FAILED: bar total = {total}, expected 3. "
            "Graph bars must sum to the monthly flagged count."
        )
        print("\n✓ PASSED — Graph bar sum correctly equals 3")

    finally:
        _cleanup(db, alerts)


# ══════════════════════════════════════════════════════════════════
# TC-M03: Monthly label updates on month rollover
# ══════════════════════════════════════════════════════════════════
def test_TC_M03_monthly_label_updates_on_month_rollover(dashboard_client, dashboard_env):
    
    """Verify that the monthly label and stats update correctly on month rollover.
    
    Given no June data and the month rolls over from May to June with 1 new June deviation,
    when an Admin/IVF user views the dashboard in June,
    then the period label contains 'June' and the deviations count resets to 1.
    
    Arrange: Seed 1 alert in June.
    Act: Retrieve quality deviations while mocked to June 1.
    Assert: Verify that the period label mentions "June" and the count is 1.
    """
    print("\n" + "=" * 60)
    print("TC-M03: Monthly label updates on month rollover (May → June)")
    print("=" * 60)

    db          = dashboard_env["db"]
    hospital_id = dashboard_env["hospital_id"]
    branch_id   = dashboard_env["branch_id"]
    tank_id     = dashboard_env["tank_id"]
    headers     = dashboard_env["headers"]

    print(f"\nSeeding 1 June alert for tank_id={tank_id}")

    june_alert = _seed_alert(
        db,
        hospital_id=hospital_id,
        branch_id=branch_id,
        tank_id=tank_id,
        occurred_at=datetime.datetime(2026, 6, 1, 8, 0, 0),
        kpi_config_id=dashboard_env["kpi_config_id"],
    )

    try:
        with _patch_now(datetime.datetime(2026, 6, 1, 0, 5, 0)):
            resp = dashboard_client.get(QUALITY_DEVIATIONS_URL, headers=headers)

        print(f"\nQUALITY DEVIATIONS RESPONSE (pinned to June 1)")
        print(f"Status : {resp.status_code}")
        print(f"Body   : {resp.text}")

        assert resp.status_code == 200, resp.text
        data = resp.json()

        label = (
            data.get("monthly_label")
            or data.get("label")
            or data.get("period")
        )

        print(f"\n label   : {label}")

        if label is not None:
            assert "June" in str(label), (
                f"TC-M03 FAILED: label '{label}' does not contain 'June'."
            )
            print(f" ✓ Label contains 'June'")
        else:
            print(" ℹ Label field absent — skipping label check")

        # Real API key — total_quality_deviations
        # Fallbacks kept for forward-compatibility if key name changes
        _raw = data.get("total_quality_deviations")
        flagged = _raw if _raw is not None else (
            data.get("quality_deviations_flagged")
            or data.get("deviations_flagged")
            or data.get("count")
            or data.get("total")
        )

        print(f" flagged : {flagged}")

        assert flagged == 1, (
            f"TC-M03 FAILED: June count = {flagged}, expected 1. "
            "Stats must reset to the new month on rollover."
        )
        print("\n✓ PASSED — Stats correctly reset to June with count = 1")

    finally:
        _cleanup(db, [june_alert])


# ══════════════════════════════════════════════════════════════════
# TC-M04: Volume counts unchanged on month rollover
# ══════════════════════════════════════════════════════════════════
def test_TC_M04_volume_counts_unchanged_on_month_rollover(dashboard_client, dashboard_env):
    
    """Verify that container and cryolock volume counts are unaffected by month rollover.
    
    Given total containers and cryolocks are seeded in the database,
    when the month rolls over from May to June,
    then both volume endpoints return identical all-time totals.
    
    Arrange: Obtain baseline total containers and cryolocks in May.
    Act: Retrieve total containers and cryolocks after mocking the date to June.
    Assert: Verify that the volume counts remain identical across the month boundary.
    """
    print("\n" + "=" * 60)
    print("TC-M04: Volume counts unchanged on month rollover (May → June)")
    print("=" * 60)

    headers = dashboard_env["headers"]

    def _numeric_only(d: dict) -> dict:
        """Strip volatile fields (last_updated, status) — compare data only."""
        return {k: v for k, v in d.items() if k not in ("last_updated", "status")}

    def _fetch(fake_now):
        with _patch_now(fake_now):
            rc = dashboard_client.get(TOTAL_CONTAINERS_URL, headers=headers)
            rk = dashboard_client.get(TOTAL_CRYOLOCKS_URL,  headers=headers)
        assert rc.status_code == 200, rc.text
        assert rk.status_code == 200, rk.text
        return {
            "containers": _numeric_only(rc.json()),
            "cryolocks":  _numeric_only(rk.json()),
        }

    print("\nFetching volumes at May 31 23:55 ...")
    may_vols  = _fetch(datetime.datetime(2025, 5, 31, 23, 55, 0))
    print(f" May  volumes : {may_vols}")

    print("Fetching volumes at June 1 00:05 ...")
    june_vols = _fetch(datetime.datetime(2025, 6,  1,  0,  5, 0))
    print(f" June volumes : {june_vols}")

    assert may_vols == june_vols, (
        f"TC-M04 FAILED: volume counts differ across month boundary.\n"
        f"  May  31 → {may_vols}\n"
        f"  June  1 → {june_vols}\n"
        "Volume counts must be all-time totals, never monthly-filtered."
    )
    print("\n✓ PASSED — Volume counts are identical across month boundary")


# ══════════════════════════════════════════════════════════════════════════════
# AREA 2 — Alert Badge Sync  [TC-A01 – TC-A04]
# ══════════════════════════════════════════════════════════════════════════════

# ══════════════════════════════════════════════════════════════════
# TC-A01: Badge equals active alert count (excludes acknowledged)
# ══════════════════════════════════════════════════════════════════
def test_TC_A01_badge_equals_active_alert_count(dashboard_client, dashboard_env):
    
    """Verify that the active alert count excludes acknowledged alerts.
    
    Given 3 Active alerts and 1 Acknowledged alert seeded for the hospital,
    when the client retrieves the hospital alerts list,
    then the active alert count equals 3 (excluding the acknowledged alert).
    
    Arrange: Seed 3 Active alerts and 1 Acknowledged alert.
    Act: Request the active hospital alerts list.
    Assert: Verify that the count of active alerts returned is exactly 3.
    """
    print("\n" + "=" * 60)
    print("TC-A01: Badge equals active alert count (Acknowledged excluded)")
    print("=" * 60)

    db          = dashboard_env["db"]
    hospital_id = dashboard_env["hospital_id"]
    branch_id   = dashboard_env["branch_id"]
    tank_id     = dashboard_env["tank_id"]
    headers     = dashboard_env["headers"]
    base        = datetime.datetime(2025, 5, 15, 10, 0, 0)

    print(f"\nSeeding 3 Active + 1 Acknowledged alerts for tank_id={tank_id}")

    active = [
        _seed_alert(
            db,
            hospital_id=hospital_id,
            branch_id=branch_id,
            tank_id=tank_id,
            status="Active",
            occurred_at=base + datetime.timedelta(hours=i),
            kpi_config_id=dashboard_env["kpi_config_id"],
        )
        for i in range(3)
    ]
    acked = _seed_alert(
        db,
        hospital_id=hospital_id,
        branch_id=branch_id,
        tank_id=tank_id,
        status="Acknowledged",
        occurred_at=base + datetime.timedelta(hours=10),
        kpi_config_id=dashboard_env["kpi_config_id"],
    )

    try:
        resp = dashboard_client.get(ALERTS_HOSPITAL_URL, headers=headers)

        print(f"\nALERTS HOSPITAL RESPONSE")
        print(f"Status : {resp.status_code}")
        print(f"Body   : {resp.text[:300]}")

        assert resp.status_code == 200, resp.text

        count = _active_count(resp.json())
        print(f"\n active count : {count}")

        assert count == 3, (
            f"TC-A01 FAILED: active count = {count}, expected 3. "
            "Badge must count Active alerts only."
        )
        print("\n✓ PASSED — Active count = 3, Acknowledged alert correctly excluded")

    finally:
        _cleanup(db, active + [acked])


# ══════════════════════════════════════════════════════════════════
# TC-A02: Badge increments on new deviation
# ══════════════════════════════════════════════════════════════════
def test_TC_A02_badge_increments_on_new_deviation(dashboard_client, dashboard_env):
    
    """Verify that the active alert count badge increments when a new deviation occurs.
    
    Given 4 initial Active alerts,
    when a new Active alert is triggered in the system,
    then the hospital alerts list returns an active count of 5.
    
    Arrange: Seed 4 Active alerts.
    Act: Insert a new Active alert into the database and retrieve the hospital alerts list.
    Assert: Verify that the active count increments to 5.
    """
    print("\n" + "=" * 60)
    print("TC-A02: Badge increments on new deviation (4 → 5)")
    print("=" * 60)

    db          = dashboard_env["db"]
    hospital_id = dashboard_env["hospital_id"]
    branch_id   = dashboard_env["branch_id"]
    tank_id     = dashboard_env["tank_id"]
    headers     = dashboard_env["headers"]
    base        = datetime.datetime(2025, 5, 15, 10, 0, 0)

    print(f"\nSeeding 4 Active alerts for tank_id={tank_id}")

    initial = [
        _seed_alert(
            db,
            hospital_id=hospital_id,
            branch_id=branch_id,
            tank_id=tank_id,
            status="Active",
            occurred_at=base + datetime.timedelta(hours=i),
            kpi_config_id=dashboard_env["kpi_config_id"],
        )
        for i in range(4)
    ]

    # Pre-condition: baseline must be exactly 4
    r = dashboard_client.get(ALERTS_HOSPITAL_URL, headers=headers)
    assert r.status_code == 200

    baseline = _active_count(r.json())
    print(f"\n Baseline active count : {baseline}")

    assert baseline == 4, (
        f"TC-A02 pre-condition failed: baseline = {baseline}, expected 4."
    )

    print("\nInserting 1 new Active alert ...")

    new = _seed_alert(
        db,
        hospital_id=hospital_id,
        branch_id=branch_id,
        tank_id=tank_id,
        status="Active",
        occurred_at=base + datetime.timedelta(hours=10),
        kpi_config_id=dashboard_env["kpi_config_id"],
    )

    try:
        r2 = dashboard_client.get(ALERTS_HOSPITAL_URL, headers=headers)

        print(f"\nALERTS HOSPITAL RESPONSE (after new alert)")
        print(f"Status : {r2.status_code}")
        print(f"Body   : {r2.text[:300]}")

        assert r2.status_code == 200

        count = _active_count(r2.json())
        print(f"\n active count after insert : {count}")

        assert count == 5, (
            f"TC-A02 FAILED: count = {count}, expected 5. "
            "Badge must increment when a new active alert is inserted."
        )
        print("\n✓ PASSED — Badge correctly incremented from 4 → 5")

    finally:
        _cleanup(db, initial + [new])


# ══════════════════════════════════════════════════════════════════
# TC-A03: Badge decrements on acknowledgement
# ══════════════════════════════════════════════════════════════════
def test_TC_A03_badge_decrements_on_acknowledgement(dashboard_client, dashboard_env):
    
    """Verify that the active alert count badge decrements when an alert is acknowledged.
    
    Given 4 initial Active alerts,
    when a user acknowledges one of the active alerts,
    then the hospital alerts list returns an active count of 3.
    
    Arrange: Seed 4 Active alerts.
    Act: POST an acknowledgement for one of the alerts, then read the hospital alerts list.
    Assert: Verify that the active count decrements to 3.
    """
    print("\n" + "=" * 60)
    print("TC-A03: Badge decrements on acknowledgement (4 → 3)")
    print("=" * 60)

    db          = dashboard_env["db"]
    hospital_id = dashboard_env["hospital_id"]
    branch_id   = dashboard_env["branch_id"]
    tank_id     = dashboard_env["tank_id"]
    headers     = dashboard_env["headers"]
    base        = datetime.datetime(2025, 5, 15, 10, 0, 0)

    print(f"\nSeeding 4 Active alerts for tank_id={tank_id}")

    alerts = [
        _seed_alert(
            db,
            hospital_id=hospital_id,
            branch_id=branch_id,
            tank_id=tank_id,
            status="Active",
            occurred_at=base + datetime.timedelta(hours=i),
            kpi_config_id=dashboard_env["kpi_config_id"],
        )
        for i in range(4)
    ]
    target = alerts[0]

    try:
        # Baseline = 4
        r = dashboard_client.get(ALERTS_HOSPITAL_URL, headers=headers)
        assert r.status_code == 200

        baseline = _active_count(r.json())
        print(f"\n Baseline active count : {baseline}")

        assert baseline == 4, (
            f"TC-A03 pre-condition failed: baseline = {baseline}, expected 4."
        )

        # Acknowledge one alert
        print(f"\nAcknowledging alert_id={target.alert_id} ...")

        ack = dashboard_client.post(
            ALERTS_ACKNOWLEDGE_URL,
            json={
                "alert_id":              target.alert_id,
                "acknowledgment_reason": "Resolved during TC-A03",
            },
            headers=headers,
        )

        print(f"\nACKNOWLEDGE RESPONSE")
        print(f"Status : {ack.status_code}")
        print(f"Body   : {ack.text}")

        assert ack.status_code in (200, 204), (
            f"TC-A03: acknowledge request failed ({ack.status_code}): {ack.text}"
        )

        # Count must drop to 3
        r2 = dashboard_client.get(ALERTS_HOSPITAL_URL, headers=headers)
        assert r2.status_code == 200

        count = _active_count(r2.json())
        print(f"\n active count after ack : {count}")

        assert count == 3, (
            f"TC-A03 FAILED: count = {count} after ack, expected 3."
        )
        print("\n✓ PASSED — Badge correctly decremented from 4 → 3 after acknowledgement")

    finally:
        _cleanup(db, alerts)


# ══════════════════════════════════════════════════════════════════
# TC-A04: Badge hidden when all alerts acknowledged
# ══════════════════════════════════════════════════════════════════
def test_TC_A04_badge_hidden_when_all_alerts_acknowledged(dashboard_client, dashboard_env):
    
    """Verify that the active alert badge is hidden when all alerts are acknowledged.
    
    Given all 4 seeded alerts are marked as Acknowledged,
    when the client retrieves the hospital alerts list,
    then the active count is returned as 0.
    
    Arrange: Seed 4 alerts marked as Acknowledged.
    Act: Request the hospital alerts list.
    Assert: Verify that the active count is 0.
    """
    print("\n" + "=" * 60)
    print("TC-A04: Badge hidden when all alerts are acknowledged (count = 0)")
    print("=" * 60)

    db          = dashboard_env["db"]
    hospital_id = dashboard_env["hospital_id"]
    branch_id   = dashboard_env["branch_id"]
    tank_id     = dashboard_env["tank_id"]
    headers     = dashboard_env["headers"]
    base        = datetime.datetime(2025, 5, 15, 10, 0, 0)

    print(f"\nSeeding 4 Acknowledged alerts for tank_id={tank_id}")

    alerts = [
        _seed_alert(
            db,
            hospital_id=hospital_id,
            branch_id=branch_id,
            tank_id=tank_id,
            status="Acknowledged",
            occurred_at=base + datetime.timedelta(hours=i),
            kpi_config_id=dashboard_env["kpi_config_id"],
        )
        for i in range(4)
    ]

    try:
        resp = dashboard_client.get(ALERTS_HOSPITAL_URL, headers=headers)

        print(f"\nALERTS HOSPITAL RESPONSE")
        print(f"Status : {resp.status_code}")
        print(f"Body   : {resp.text[:300]}")

        assert resp.status_code == 200, resp.text

        count = _active_count(resp.json())
        print(f"\n active count : {count}")

        assert count == 0, (
            f"TC-A04 FAILED: active count = {count}. "
            "When all alerts are acknowledged, active count must be 0."
        )
        print("\n✓ PASSED — Active count = 0, badge correctly hidden")

    finally:
        _cleanup(db, alerts)


# ══════════════════════════════════════════════════════════════════════════════
# AREA 3 — Auth & RBAC  [TC-AUTH01 – TC-AUTH04]
# ══════════════════════════════════════════════════════════════════════════════

# ══════════════════════════════════════════════════════════════════
# TC-AUTH01: Expired JWT is rejected with 401
# ══════════════════════════════════════════════════════════════════
def test_TC_AUTH01_expired_jwt_returns_401(dashboard_client, dashboard_env):
    
    """Verify that requests with an expired JWT are rejected with a 401 status code.
    
    Given a JWT whose expiration claim is in the past,
    when the client calls any IVF dashboard endpoint with the expired token,
    then the API rejects the request with a 401 Unauthorized status.
    
    Arrange: Generate a JWT with an expiration timestamp in the past.
    Act: Request IVF dashboard endpoints using the expired token.
    Assert: Verify that all requests are rejected with a 401 status code.
    """
    print("\n" + "=" * 60)
    print("TC-AUTH01: Expired JWT returns 401 on all IVF dashboard routes")
    print("=" * 60)

    db = dashboard_env["db"]

    from app.models.user_model import User as UserModel
    user = db.query(UserModel).filter(
        UserModel.user_id == dashboard_env["user_id"]
    ).first()

    expired_token   = _make_token(user, expired=True)
    expired_headers = {"Authorization": f"Bearer {expired_token}"}

    endpoints = [
        ("GET",  QUALITY_DEVIATIONS_URL, None),
        ("GET",  ALERTS_HOSPITAL_URL,    None),
        ("GET",  DEVIATION_GRAPH_URL,    {"from_ts": MAY_2026_FROM_TS, "to_ts": MAY_2026_TO_TS}),
    ]

    for method, url, params in endpoints:
        print(f"\nCalling {method} {url} with expired token ...")
        resp = dashboard_client.get(url, headers=expired_headers, params=params or {})

        print(f"Status : {resp.status_code}  Body : {resp.text[:200]}")
        assert resp.status_code == 401, (
            f"TC-AUTH01 FAILED on {url}: got {resp.status_code}, expected 401. "
            "Expired token must be rejected."
        )

    print("\n✓ PASSED — All endpoints correctly reject expired JWT with 401")


# ══════════════════════════════════════════════════════════════════
# TC-AUTH02: Missing Authorization header returns 401
# ══════════════════════════════════════════════════════════════════
def test_TC_AUTH02_no_auth_header_returns_401(dashboard_client, dashboard_env):
    
    """Verify that requests missing the Authorization header are rejected with a 401 status code.
    
    Given a request with no Authorization header,
    when the client calls any IVF dashboard endpoint,
    then the API rejects the request with a 401 Unauthorized status.
    
    Arrange: Prepare requests omitting the Authorization header.
    Act: Send requests to the IVF dashboard endpoints.
    Assert: Verify that all requests are rejected with a 401 status code.
    """
    print("\n" + "=" * 60)
    print("TC-AUTH02: No Authorization header → 401 on all IVF dashboard routes")
    print("=" * 60)

    endpoints = [
        ("GET",  QUALITY_DEVIATIONS_URL, None),
        ("GET",  ALERTS_HOSPITAL_URL,    None),
        ("GET",  DEVIATION_GRAPH_URL,    {"from_ts": MAY_2026_FROM_TS, "to_ts": MAY_2026_TO_TS}),
        ("POST", ALERTS_ACKNOWLEDGE_URL, None),
    ]

    for method, url, params in endpoints:
        print(f"\nCalling {method} {url} with no token ...")
        if method == "GET":
            resp = dashboard_client.get(url, params=params or {})
        else:
            resp = dashboard_client.post(
                url,
                json={"alert_id": str(uuid.uuid4()), "acknowledgment_reason": "test"},
            )

        print(f"Status : {resp.status_code}  Body : {resp.text[:200]}")
        assert resp.status_code == 401, (
            f"TC-AUTH02 FAILED on {url}: got {resp.status_code}, expected 401. "
            "Requests without a token must be rejected."
        )

    print("\n✓ PASSED — All endpoints correctly reject missing Authorization header with 401")


# ══════════════════════════════════════════════════════════════════
# TC-AUTH03: Non-IVF department returns 403 on all IVF routes
# ══════════════════════════════════════════════════════════════════
def test_TC_AUTH03_non_ivf_department_returns_403(dashboard_client, dashboard_env):
    
    """Verify that users from a non-IVF department are forbidden from accessing IVF routes.
    
    Given a valid JWT for a user whose department is not IVF (e.g. OPD),
    when the client calls any IVF dashboard endpoint,
    then the API rejects the request with a 403 Forbidden status.
    
    Arrange: Generate a JWT token with department set to "OPD".
    Act: Send requests to the IVF dashboard endpoints.
    Assert: Verify that all requests are rejected with a 403 status code.
    """
    print("\n" + "=" * 60)
    print("TC-AUTH03: Non-IVF department (OPD/Admin) → 403 on all IVF routes")
    print("=" * 60)

    db = dashboard_env["db"]

    from app.models.user_model import User as UserModel
    user = db.query(UserModel).filter(
        UserModel.user_id == dashboard_env["user_id"]
    ).first()

    # Admin role but wrong department — should still be blocked
    opd_token   = _make_token(user, role="Admin", department="OPD")
    opd_headers = {"Authorization": f"Bearer {opd_token}"}

    # Seed a REAL alert for acknowledge endpoint testing
    real_alert = _seed_alert(db,hospital_id=dashboard_env["hospital_id"],branch_id=dashboard_env["branch_id"],tank_id=dashboard_env["tank_id"],occurred_at=datetime.datetime.utcnow(),kpi_config_id=dashboard_env["kpi_config_id"])

    endpoints = [
        ("GET",  QUALITY_DEVIATIONS_URL, None),
        ("GET",  ALERTS_HOSPITAL_URL,    None),
        ("GET",  DEVIATION_GRAPH_URL,    {"from_ts": MAY_2026_FROM_TS, "to_ts": MAY_2026_TO_TS}),
        ("POST", ALERTS_ACKNOWLEDGE_URL, {"alert_id": real_alert.alert_id, "acknowledgment_reason": "x"}),
    ]
    try:
        for method, url, payload_or_params in endpoints:
            print(f"\nCalling {method} {url} with OPD department token ...")
            if method == "GET":
                resp = dashboard_client.get(url, headers=opd_headers, params=payload_or_params or {})
            else:
                resp = dashboard_client.post(url, headers=opd_headers, json=payload_or_params)

            print(f"Status : {resp.status_code}  Body : {resp.text[:200]}")
            print("\nFULL RESPONSE:")
            print(resp.text)
            assert resp.status_code == 403, (f"TC-AUTH03 FAILED on {url}: got {resp.status_code}, expected 403. "
                                             "department=OPD must not access IVF routes even with role=Admin.")

        print("\n✓ PASSED — All IVF routes correctly return 403 for non-IVF department")

    finally:
        _cleanup(db, [real_alert])
# ══════════════════════════════════════════════════════════════════
# TC-AUTH04: Cross-hospital isolation — Hospital A cannot see Hospital B alerts
# ══════════════════════════════════════════════════════════════════
def test_TC_AUTH04_cross_hospital_data_isolation(dashboard_client, dashboard_env, setup_kpi_environment):
    
    """Verify data isolation between different hospitals.
    
    Given Hospital A has 3 Active alerts and Hospital B has 5 Active alerts,
    when an Admin/IVF user from Hospital A requests the alerts list,
    then the response returns an active count of 3 (Hospital B's alerts remain invisible).
    
    Arrange: Seed 3 alerts for Hospital A and 5 alerts for Hospital B.
    Act: Request the hospital alerts list using Hospital A's credentials.
    Assert: Verify that only Hospital A's 3 alerts are returned.
    """
    print("\n" + "=" * 60)
    print("TC-AUTH04: Cross-hospital isolation — A cannot see B's alerts")
    print("=" * 60)

    # ── Hospital A (primary env) ──────────────────────────────────────────────
    env_a      = dashboard_env
    db         = env_a["db"]
    hospital_a = env_a["hospital_id"]
    branch_a   = env_a["branch_id"]
    tank_a     = env_a["tank_id"]
    headers_a  = env_a["headers"]

    # ── Hospital B (second env — seed a fresh hospital/branch/tank) ──────────
    # Create a second hospital/branch/tank directly in the same DB session
    from app.models.IVF.hospital_model import Hospital
    from app.constants.enums import CanisterStatus

    hospital_b = Hospital(hospital_name="KPI Test Hospital B")
    db.add(hospital_b)
    db.commit()
    db.refresh(hospital_b)

    branch_b = Branch(hospital_id=hospital_b.hospital_id, branch_name="KPI Branch B")
    db.add(branch_b)
    db.commit()
    db.refresh(branch_b)

    tank_b = Tank(
        branch_id=branch_b.branch_id,
        tank_code=f"Tank-{uuid.uuid4().hex[:4].upper()}",
        is_active=True,
        status=CanisterStatus.SAFE,
    )
    db.add(tank_b)
    db.commit()
    db.refresh(tank_b)

    base = datetime.datetime(2026, 5, 10, 9, 0, 0)

    print(f"\nSeeding 3 Active alerts for Hospital A ({hospital_a}) ...")
    alerts_a = [
        _seed_alert(
            db,
            hospital_id=hospital_a,
            branch_id=branch_a,
            tank_id=tank_a,
            occurred_at=base + datetime.timedelta(hours=i),
            kpi_config_id=env_a["kpi_config_id"],
        )
        for i in range(3)
    ]

    print(f"Seeding 5 Active alerts for Hospital B ({hospital_b.hospital_id}) ...")
    alerts_b = [
        _seed_alert(
            db,
            hospital_id=hospital_b.hospital_id,
            branch_id=branch_b.branch_id,
            tank_id=tank_b.tank_id,
            occurred_at=base + datetime.timedelta(hours=i),
        )
        for i in range(5)
    ]

    try:
        resp = dashboard_client.get(ALERTS_HOSPITAL_URL, headers=headers_a)

        print(f"\nALERTS HOSPITAL RESPONSE (Hospital A token)")
        print(f"Status : {resp.status_code}  Body : {resp.text[:300]}")

        assert resp.status_code == 200, resp.text

        count = _active_count(resp.json())
        print(f"\n active count seen by Hospital A : {count}")

        assert count == 3, (
            f"TC-AUTH04 FAILED: Hospital A sees {count} active alerts, expected 3. "
            "Hospital B's 5 alerts must not leak across the hospital boundary."
        )
        print("\n✓ PASSED — Hospital A sees exactly 3 alerts; Hospital B's data is isolated")

    finally:
        _cleanup(db, alerts_a + alerts_b)


def test_TC_AUTH05_admin_from_any_branch_sees_all_hospital_deviations(dashboard_client, dashboard_env):
    
    """Verify that hospital Admins have visibility across all branches of the hospital.
    
    Given deviations are seeded in two separate branches under the same hospital,
    when an Admin user assigned to one branch requests the hospital alerts list,
    then the response aggregates active alerts from all branches in the hospital.
    
    Arrange: Seed alerts in Branch A and Branch C of the same hospital, and obtain an Admin token for a user in Branch C.
    Act: Request the hospital alerts list.
    Assert: Verify that the response returns the aggregated count of 5 alerts from both branches.
    """
    print("\n" + "=" * 60)
    print("TC-AUTH05: Admin from any branch sees all hospital deviations")
    print("=" * 60)

    db = dashboard_env["db"]
    hospital_id = dashboard_env["hospital_id"]
    branch_a_id = dashboard_env["branch_id"]
    tank_a_id = dashboard_env["tank_id"]

    # Create Branch C and Tank C in the same hospital
    branch_c = Branch(hospital_id=hospital_id, branch_name="Branch C")
    db.add(branch_c)
    db.commit()
    db.refresh(branch_c)

    from app.constants.enums import CanisterStatus

    tank_c = Tank(
        branch_id=branch_c.branch_id,
        tank_code=f"Tank-{uuid.uuid4().hex[:4].upper()}",
        is_active=True,
        status=CanisterStatus.SAFE,
    )
    db.add(tank_c)
    db.commit()
    db.refresh(tank_c)

    # Create an Admin user in Branch C
    from app.models.user_model import User as UserModel
    from app.auth.auth import get_password_hash

    user_c = UserModel(
        user_id=str(uuid.uuid4()),
        email=f"{uuid.uuid4()}@test.com",
        password_hash=get_password_hash("easyPeasy1!"),
        first_name="Branch",
        last_name="Admin",
        role="Admin",
        status=True,
        approved_status="approved",
        hospital_id=hospital_id,
        branch_id=branch_c.branch_id,
        department="IVF",
    )
    db.add(user_c)
    db.commit()
    db.refresh(user_c)

    # Build Admin token for user_c
    admin_token = _make_token(user_c, role="Admin", department="IVF",
                              hospital_id=hospital_id, branch_id=branch_c.branch_id)
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # Seed 2 alerts in Branch A / Tank A and 3 alerts in Branch C / Tank C
    base = datetime.datetime(2026, 5, 10, 9, 0, 0)

    alerts_a = [
        _seed_alert(db, hospital_id=hospital_id, branch_id=branch_a_id, tank_id=tank_a_id,
                    occurred_at=base + datetime.timedelta(hours=i), kpi_config_id=dashboard_env["kpi_config_id"]) 
        for i in range(2)
    ]

    alerts_c = [
        _seed_alert(db, hospital_id=hospital_id, branch_id=branch_c.branch_id, tank_id=tank_c.tank_id,
                    occurred_at=base + datetime.timedelta(hours=i))
        for i in range(3)
    ]

    try:
        resp = dashboard_client.get(ALERTS_HOSPITAL_URL, headers=admin_headers)
        assert resp.status_code == 200, resp.text

        count = _active_count(resp.json())
        print(f"\n active count seen by Branch C Admin : {count}")

        assert count == 5, (
            f"TC-AUTH05 FAILED: Admin from Branch C saw {count} alerts, expected 5. "
            "Admins must see hospital-wide deviations."
        )
        print("\n✓ PASSED — Admin from Branch C sees deviations across the hospital (total = 5)")

    finally:
        _cleanup(db, alerts_a + alerts_c)
        # cleanup created user/objects
        try:
            db.delete(user_c)
            db.delete(tank_c)
            db.delete(branch_c)
            db.commit()
        except Exception:
            db.rollback()

def test_TC_AUTH06_missing_hospital_or_branch_claim_returns_401(dashboard_client, dashboard_env):
    
    """Verify that tokens missing critical scope claims are rejected.
    
    Given a JWT token that is missing the hospital_id or branch_id claim,
    when the client requests quality deviations,
    then the API rejects the request with a 401 Unauthorized status.
    
    Arrange: Generate JWT tokens missing either the hospital_id or branch_id claim.
    Act: Request the quality deviations endpoint.
    Assert: Verify that both requests are rejected with a 401 status code.
    """
    db = dashboard_env["db"]

    from app.models.user_model import User as UserModel
    user = db.query(UserModel).filter(
        UserModel.user_id == dashboard_env["user_id"]
    ).first()

    now = datetime.datetime.now(datetime.timezone.utc)
    base_payload = {
        "sub":         str(user.user_id),
        "id":          str(user.user_id),
        "user_id":     str(user.user_id),
        "email":       user.email,
        "role":        "Admin",
        "user_role":   "Admin",
        "type":        "hospital_user",
        "user_type":   "hospital_user",
        "department":  "IVF",
        "token_type":  "access",
        "identity":    str(user.user_id),
        "exp":         now + datetime.timedelta(days=1),
        "iat":         now,
    }

    for missing_field in ("hospital_id", "branch_id"):
        payload = {**base_payload}
        if missing_field == "hospital_id":
            payload["branch_id"] = str(user.branch_id)
        else:
            payload["hospital_id"] = str(user.hospital_id)

        token = create_access_token(data=payload)
        headers = {"Authorization": f"Bearer {token}"}

        resp = dashboard_client.get(QUALITY_DEVIATIONS_URL, headers=headers)
        assert resp.status_code == 401, (
            f"TC-AUTH06 FAILED: expected 401 when {missing_field} is missing, got {resp.status_code}."
        )

    print("\n✓ PASSED — Tokens missing hospital_id or branch_id return 401")


def test_TC_AUTH07_manager_role_sees_hospital_wide_alerts(dashboard_client, dashboard_env):
    
    """Verify that users with the Manager role have hospital-wide alerts visibility.
    
    Given a Manager role token in a hospital with alerts seeded across multiple branches,
    when the manager requests the hospital alerts list,
    then the response returns all active alerts across all branches of the hospital.
    
    Arrange: Seed alerts in multiple branches under the same hospital, and obtain a Manager token.
    Act: Request the hospital alerts list.
    Assert: Verify that the response returns all active alerts across all branches (total count 5).
    """
    db = dashboard_env["db"]
    hospital_id = dashboard_env["hospital_id"]
    branch_a_id = dashboard_env["branch_id"]
    tank_a_id = dashboard_env["tank_id"]

    branch_b = Branch(hospital_id=hospital_id, branch_name="Manager Branch B")
    db.add(branch_b)
    db.commit()
    db.refresh(branch_b)

    from app.constants.enums import CanisterStatus
    tank_b = Tank(
        branch_id=branch_b.branch_id,
        tank_code=f"Tank-{uuid.uuid4().hex[:4].upper()}",
        is_active=True,
        status=CanisterStatus.SAFE,
    )
    db.add(tank_b)
    db.commit()
    db.refresh(tank_b)

    from app.models.user_model import User as UserModel
    user = db.query(UserModel).filter(
        UserModel.user_id == dashboard_env["user_id"]
    ).first()

    manager_token = _make_token(
        user,
        role="Manager",
        department="IVF",
        hospital_id=hospital_id,
        branch_id=branch_a_id,
    )
    headers = {"Authorization": f"Bearer {manager_token}"}

    alerts_a = [
        _seed_alert(
            db,
            hospital_id=hospital_id,
            branch_id=branch_a_id,
            tank_id=tank_a_id,
            occurred_at=datetime.datetime(2026, 5, 10, 9, 0, 0) + datetime.timedelta(hours=i),
            kpi_config_id=dashboard_env["kpi_config_id"],
        )
        for i in range(2)
    ]

    alerts_b = [
        _seed_alert(
            db,
            hospital_id=hospital_id,
            branch_id=branch_b.branch_id,
            tank_id=tank_b.tank_id,
            occurred_at=datetime.datetime(2026, 5, 10, 11, 0, 0) + datetime.timedelta(hours=i),
        )
        for i in range(3)
    ]

    try:
        resp = dashboard_client.get(ALERTS_HOSPITAL_URL, headers=headers)
        assert resp.status_code == 200, resp.text

        count = _active_count(resp.json())
        assert count == 5, (
            f"TC-AUTH07 FAILED: Manager saw {count} alerts, expected 5. "
            "Manager should see hospital-wide deviations."
        )
        print("\n✓ PASSED — Manager role sees hospital-wide deviations")
    finally:
        _cleanup(db, alerts_a + alerts_b)


def test_TC_AUTH08_user_role_sees_only_assigned_branch_alerts(dashboard_client, dashboard_env):
    
    """Verify that users with the User role can only see alerts from their assigned branch.
    
    Given a user assigned to Branch A in a hospital with alerts in both Branch A and Branch B,
    when the user requests the hospital alerts list,
    then the response contains only active alerts from Branch A.
    
    Arrange: Seed alerts in Branch A and Branch B, and obtain a User token for Branch A.
    Act: Request the hospital alerts list.
    Assert: Verify that the response contains only the 2 active alerts from Branch A.
    """
    db = dashboard_env["db"]
    hospital_id = dashboard_env["hospital_id"]
    branch_a_id = dashboard_env["branch_id"]
    tank_a_id = dashboard_env["tank_id"]

    branch_b = Branch(hospital_id=hospital_id, branch_name="User Branch B")
    db.add(branch_b)
    db.commit()
    db.refresh(branch_b)

    from app.constants.enums import CanisterStatus
    from app.models.user_model import User as UserModel
    from app.auth.auth import get_password_hash

    tank_b = Tank(
        branch_id=branch_b.branch_id,
        tank_code=f"Tank-{uuid.uuid4().hex[:4].upper()}",
        is_active=True,
        status=CanisterStatus.SAFE,
    )
    db.add(tank_b)
    db.commit()
    db.refresh(tank_b)

    user_a = UserModel(
        user_id=str(uuid.uuid4()),
        email=f"{uuid.uuid4()}@test.com",
        password_hash=get_password_hash("easyPeasy1!"),
        first_name="Branch",
        last_name="User",
        role="User",
        status=True,
        approved_status="approved",
        hospital_id=hospital_id,
        branch_id=branch_a_id,
        department="IVF",
    )
    db.add(user_a)
    db.commit()
    db.refresh(user_a)

    user_token = _make_token(
        user_a,
        role="User",
        department="IVF",
        hospital_id=hospital_id,
        branch_id=branch_a_id,
    )
    headers = {"Authorization": f"Bearer {user_token}"}

    base = datetime.datetime(2026, 5, 10, 9, 0, 0)
    alerts_a = [
        _seed_alert(
            db,
            hospital_id=hospital_id,
            branch_id=branch_a_id,
            tank_id=tank_a_id,
            occurred_at=base + datetime.timedelta(hours=i),
            kpi_config_id=dashboard_env["kpi_config_id"],
        )
        for i in range(2)
    ]
    alerts_b = [
        _seed_alert(
            db,
            hospital_id=hospital_id,
            branch_id=branch_b.branch_id,
            tank_id=tank_b.tank_id,
            occurred_at=base + datetime.timedelta(hours=i),
        )
        for i in range(3)
    ]

    try:
        resp = dashboard_client.get(ALERTS_HOSPITAL_URL, headers=headers)
        assert resp.status_code == 200, resp.text

        count = _active_count(resp.json())
        assert count == 2, (
            f"TC-AUTH08 FAILED: User saw {count} active alerts, expected 2. "
            "User role must be scoped to their assigned branch only."
        )
        print("\n✓ PASSED — User role sees only active alerts from their own branch")
    finally:
        _cleanup(db, alerts_a + alerts_b)
        try:
            db.query(UserModel).filter(UserModel.user_id == user_a.user_id).delete(synchronize_session=False)
            db.query(Tank).filter(Tank.tank_id == tank_b.tank_id).delete(synchronize_session=False)
            db.query(Branch).filter(Branch.branch_id == branch_b.branch_id).delete(synchronize_session=False)
            db.commit()
        except Exception:
            db.rollback()


def test_TC_AUTH09_user_role_branch_scopes_deviations_graph(dashboard_client, dashboard_env):
    
    """Verify that users with the User role can only view deviation graph data for their assigned branch.
    
    Given a user assigned to Branch A in a hospital with alerts in both Branch A and Branch B,
    when the user requests the deviations graph,
    then the graph data is scoped only to tanks and alerts within Branch A.
    
    Arrange: Seed alerts in Branch A and Branch B, and obtain a User token for Branch A.
    Act: Request the deviations graph.
    Assert: Verify that the graph only contains data for Branch A's tanks and excludes Branch B.
    """
    db = dashboard_env["db"]
    hospital_id = dashboard_env["hospital_id"]
    branch_a_id = dashboard_env["branch_id"]
    tank_a_id = dashboard_env["tank_id"]

    branch_a = db.query(Branch).filter(Branch.branch_id == branch_a_id).first()
    assert branch_a is not None

    branch_b = Branch(hospital_id=hospital_id, branch_name="User Graph Branch B")
    db.add(branch_b)
    db.commit()
    db.refresh(branch_b)

    from app.constants.enums import CanisterStatus
    from app.models.user_model import User as UserModel
    from app.auth.auth import get_password_hash

    tank_b = Tank(
        branch_id=branch_b.branch_id,
        tank_code=f"Tank-{uuid.uuid4().hex[:4].upper()}",
        is_active=True,
        status=CanisterStatus.SAFE,
    )
    db.add(tank_b)
    db.commit()
    db.refresh(tank_b)

    user_a = UserModel(
        user_id=str(uuid.uuid4()),
        email=f"{uuid.uuid4()}@test.com",
        password_hash=get_password_hash("easyPeasy1!"),
        first_name="Branch",
        last_name="User",
        role="User",
        status=True,
        approved_status="approved",
        hospital_id=hospital_id,
        branch_id=branch_a_id,
        department="IVF",
    )
    db.add(user_a)
    db.commit()
    db.refresh(user_a)

    user_token = _make_token(
        user_a,
        role="User",
        department="IVF",
        hospital_id=hospital_id,
        branch_id=branch_a_id,
    )
    headers = {"Authorization": f"Bearer {user_token}"}

    base = datetime.datetime(2026, 5, 10, 9, 0, 0)
    alerts_a = [
        _seed_alert(
            db,
            hospital_id=hospital_id,
            branch_id=branch_a_id,
            tank_id=tank_a_id,
            occurred_at=base + datetime.timedelta(hours=i),
            kpi_config_id=dashboard_env["kpi_config_id"],
        )
        for i in range(2)
    ]
    alerts_b = [
        _seed_alert(
            db,
            hospital_id=hospital_id,
            branch_id=branch_b.branch_id,
            tank_id=tank_b.tank_id,
            occurred_at=base + datetime.timedelta(hours=i),
        )
        for i in range(3)
    ]

    try:
        url = f"{DEVIATION_GRAPH_URL}?from_ts={MAY_2026_FROM_TS}&to_ts={MAY_2026_TO_TS}"
        resp = dashboard_client.get(url, headers=headers)
        assert resp.status_code == 200, resp.text

        body = resp.json()
        assert "available_heading" in body and "data" in body, (
            f"TC-AUTH09 FAILED: unexpected response shape: {body}"
        )

        branch_names = {row.get("branch_name") for row in body["data"]}
        assert branch_names == {branch_a.branch_name}, (
            f"TC-AUTH09 FAILED: User received graph rows for branches {branch_names}, expected only {branch_a.branch_name}."
        )

        assert tank_b.tank_code not in body["available_heading"], (
            "TC-AUTH09 FAILED: User graph includes tank from another branch."
        )

        print("\n✓ PASSED — User role deviations graph is scoped to assigned branch")
    finally:
        _cleanup(db, alerts_a + alerts_b)
        try:
            db.delete(user_a)
            db.delete(tank_b)
            db.delete(branch_b)
            db.commit()
        except Exception:
            db.rollback()
        db.delete(tank_b)
        db.delete(branch_b)
        db.commit()


def test_TC_AUTH10_admin_ivf_top_deviation_driver_returns_highest_driver(dashboard_client, dashboard_env):
    
    """Verify that the top deviation driver endpoint returns the driver with the highest count.
    
    Given multiple KPI configs and deviation alerts seeded across the current month,
    when an Admin/IVF user requests the top deviation driver,
    then the response returns the driver name and count with the highest deviations.
    
    Arrange: Seed KPI configs and alerts for internal temp, external temp, and shock in the current month.
    Act: Request the top deviation driver endpoint.
    Assert: Verify that "External Temperature" is returned as the top driver with 4 deviations.
    """
    print("\n" + "=" * 60)
    print("TC-AUTH10: Admin/IVF top deviation driver returns highest current-month driver")
    print("=" * 60)

    db          = dashboard_env["db"]
    hospital_id = dashboard_env["hospital_id"]
    branch_id   = dashboard_env["branch_id"]
    tank_id     = dashboard_env["tank_id"]
    headers     = dashboard_env["headers"]
    base        = datetime.datetime(2026, 5, 10, 9, 0, 0)

    internal_config = KpiConfig(
        hospital_id=hospital_id,
        branch_id=branch_id,
        tank_id=tank_id,
        kpi_name="temp_internal",
        alert_name="Internal Temperature",
        min=-200,
        max=-190,
        unit="°C",
        alert_type="critical",
        cooldown_minutes=60,
        status=True,
    )
    external_config = KpiConfig(
        hospital_id=hospital_id,
        branch_id=branch_id,
        tank_id=tank_id,
        kpi_name="temp_external",
        alert_name="External Temperature",
        min=-200,
        max=-190,
        unit="°C",
        alert_type="critical",
        cooldown_minutes=60,
        status=True,
    )
    shock_config = KpiConfig(
        hospital_id=hospital_id,
        branch_id=branch_id,
        tank_id=tank_id,
        kpi_name="shock",
        alert_name="Shock",
        min=-200,
        max=-190,
        unit="G",
        alert_type="critical",
        cooldown_minutes=60,
        status=True,
    )
    db.add_all([internal_config, external_config, shock_config])
    db.commit()
    db.refresh(internal_config)
    db.refresh(external_config)
    db.refresh(shock_config)

    internal_alerts = [
        _seed_alert(
            db,
            hospital_id=hospital_id,
            branch_id=branch_id,
            tank_id=tank_id,
            occurred_at=base + datetime.timedelta(hours=i),
            kpi_config_id=internal_config.id,
        )
        for i in range(2)
    ]
    external_alerts = [
        _seed_alert(
            db,
            hospital_id=hospital_id,
            branch_id=branch_id,
            tank_id=tank_id,
            occurred_at=base + datetime.timedelta(hours=2 + i),
            kpi_config_id=external_config.id,
        )
        for i in range(4)
    ]
    shock_alerts = [
        _seed_alert(
            db,
            hospital_id=hospital_id,
            branch_id=branch_id,
            tank_id=tank_id,
            occurred_at=base + datetime.timedelta(hours=6 + i),
            kpi_config_id=shock_config.id,
        )
        for i in range(3)
    ]

    try:
        with _patch_now(datetime.datetime(2026, 5, 20, 12, 0, 0)):
            resp = dashboard_client.get(TOP_DEVIATION_DRIVER_URL, headers=headers)

        print(f"\nTOP DEVIATION DRIVER RESPONSE")
        print(f"Status : {resp.status_code}")
        print(f"Body   : {resp.text}")

        assert resp.status_code == 200, resp.text
        data = resp.json()

        assert data["driver_name"] == "External Temperature", (
            f"TC-AUTH10 FAILED: expected top driver 'External Temperature', got {data.get('driver_name')}"
        )
        assert data["count"] == 4, (
            f"TC-AUTH10 FAILED: expected top driver count 4, got {data.get('count')}"
        )
        assert data["all_drivers"]["Internal Temperature"] == 2
        assert data["all_drivers"]["External Temperature"] == 4
        assert data["all_drivers"]["Shock"] == 3

        print("\n✓ PASSED — Admin/IVF top deviation driver returns the highest current-month driver")
    finally:
        _cleanup(db, internal_alerts + external_alerts + shock_alerts)
        db.query(KpiConfig).filter(KpiConfig.id.in_([
            internal_config.id,
            external_config.id,
            shock_config.id,
        ])).delete(synchronize_session=False)
        db.commit()


# ══════════════════════════════════════════════════════════════════════════════
# AREA 6 — Acknowledge Endpoint Robustness  [TC-ACK01 – TC-ACK03]
# ══════════════════════════════════════════════════════════════════════════════

# ══════════════════════════════════════════════════════════════════
# TC-ACK01: Double-acknowledging the same alert is idempotent or returns 400
# ══════════════════════════════════════════════════════════════════
def test_TC_ACK01_double_acknowledge_is_idempotent_or_400(dashboard_client, dashboard_env):
    
    """Verify that double-acknowledging the same alert is handled gracefully without corrupting state.
    
    Given an alert that has already been acknowledged once,
    when the user attempts to acknowledge the same alert_id a second time,
    then the API returns a successful status (idempotent) or an explicit 400/409 rejection, keeping the active count at 0.
    
    Arrange: Seed an Active alert and acknowledge it once.
    Act: Post a second acknowledgement request for the same alert ID.
    Assert: Verify that the second request returns a valid success or error code, and the active count remains 0.
    """
    print("\n" + "=" * 60)
    print("TC-ACK01: Double-acknowledge is idempotent or rejected (count stays 0)")
    print("=" * 60)

    db          = dashboard_env["db"]
    hospital_id = dashboard_env["hospital_id"]
    branch_id   = dashboard_env["branch_id"]
    tank_id     = dashboard_env["tank_id"]
    headers     = dashboard_env["headers"]
    base        = datetime.datetime(2026, 5, 10, 10, 0, 0)

    alert = _seed_alert(
        db,
        hospital_id=hospital_id,
        branch_id=branch_id,
        tank_id=tank_id,
        status="Active",
        occurred_at=base,
        kpi_config_id=dashboard_env["kpi_config_id"],
    )

    try:
        # First acknowledgement — must succeed
        ack1 = dashboard_client.post(
            ALERTS_ACKNOWLEDGE_URL,
            json={"alert_id": alert.alert_id, "acknowledgment_reason": "First ack — TC-ACK01"},
            headers=headers,
        )
        print(f"\nFirst ack status  : {ack1.status_code}  Body : {ack1.text}")
        assert ack1.status_code in (200, 204), (
            f"TC-ACK01 pre-condition failed: first ack returned {ack1.status_code}."
        )

        # Second acknowledgement — idempotent (200/204) or explicit rejection (400/409)
        ack2 = dashboard_client.post(
            ALERTS_ACKNOWLEDGE_URL,
            json={"alert_id": alert.alert_id, "acknowledgment_reason": "Second ack — TC-ACK01"},
            headers=headers,
        )
        print(f"Second ack status : {ack2.status_code}  Body : {ack2.text}")
        assert ack2.status_code in (200, 204, 400, 409), (
            f"TC-ACK01 FAILED: second ack returned {ack2.status_code}. "
            "Expected 200/204 (idempotent) or 400/409 (rejected). 500 is never acceptable."
        )

        # State integrity — active count must be 0, not negative
        r = dashboard_client.get(ALERTS_HOSPITAL_URL, headers=headers)
        assert r.status_code == 200
        count = _active_count(r.json())
        print(f"\n active count after double-ack : {count}")

        assert count == 0, (
            f"TC-ACK01 FAILED: active count = {count} after double-ack, expected 0. "
            "Double-acknowledging must not corrupt the active count."
        )
        print("\n✓ PASSED — Double-acknowledge handled safely; active count remains 0")

    finally:
        _cleanup(db, [alert])


def test_TC_ACK04_concurrent_ack_race_is_idempotent_or_rejected(dashboard_client, dashboard_env):
    
    """Verify that concurrent acknowledgement requests for the same alert are handled safely.
    
    Given two concurrent acknowledgement requests sent for the same alert,
    when both requests are executed simultaneously,
    then one request succeeds and the other is either handled idempotently or rejected, with no state corruption.
    
    Arrange: Seed an Active alert.
    Act: Send two concurrent POST requests to acknowledge the alert ID.
    Assert: Verify that one succeeds and the other does not cause any server error, and the active count remains 0.
    """
    from concurrent.futures import ThreadPoolExecutor

    db          = dashboard_env["db"]
    hospital_id = dashboard_env["hospital_id"]
    branch_id   = dashboard_env["branch_id"]
    tank_id     = dashboard_env["tank_id"]
    headers     = dashboard_env["headers"]
    base        = datetime.datetime(2026, 5, 10, 10, 0, 0)

    alert = _seed_alert(
        db,
        hospital_id=hospital_id,
        branch_id=branch_id,
        tank_id=tank_id,
        status="Active",
        occurred_at=base,
        kpi_config_id=dashboard_env["kpi_config_id"],
    )

    def ack_request():
        return dashboard_client.post(
            ALERTS_ACKNOWLEDGE_URL,
            json={"alert_id": alert.alert_id, "acknowledgment_reason": "Concurrent ack — TC-ACK04"},
            headers=headers,
        )

    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(ack_request) for _ in range(2)]
        responses = [future.result() for future in futures]

    statuses = [resp.status_code for resp in responses]
    print(f"\nConcurrent ack statuses: {statuses}")

    assert any(status in (200, 204) for status in statuses), (
        f"TC-ACK04 FAILED: expected at least one successful ack, got {statuses}."
    )
    assert all(status in (200, 204, 400, 409) for status in statuses), (
        f"TC-ACK04 FAILED: expected no 500 errors, got {statuses}."
    )

    r = dashboard_client.get(ALERTS_HOSPITAL_URL, headers=headers)
    assert r.status_code == 200
    count = _active_count(r.json())
    print(f"\n active count after concurrent ack race : {count}")

    assert count == 0, (
        f"TC-ACK04 FAILED: active count = {count} after concurrent ack, expected 0."
    )
    print("\n✓ PASSED — Concurrent ack race did not corrupt state")

    _cleanup(db, [alert])


# ══════════════════════════════════════════════════════════════════
# TC-ACK02: Acknowledging a non-existent alert_id returns 404
# ══════════════════════════════════════════════════════════════════
def test_TC_ACK02_nonexistent_alert_id_returns_404(dashboard_client, dashboard_env):
    
    """Verify that acknowledging a non-existent alert ID returns a 404 error.
    
    Given a random alert ID that does not exist in the database,
    when the user attempts to acknowledge it,
    then the API rejects the request with a 404 Not Found status.
    
    Arrange: Create a random UUID not corresponding to any database alert.
    Act: Post an acknowledgement request for the random ID.
    Assert: Verify that the response status code is 404.
    """
    print("\n" + "=" * 60)
    print("TC-ACK02: Acknowledging non-existent alert_id → 404")
    print("=" * 60)

    headers    = dashboard_env["headers"]
    phantom_id = str(uuid.uuid4())

    print(f"\nSending acknowledge for phantom alert_id = {phantom_id}")

    resp = dashboard_client.post(
        ALERTS_ACKNOWLEDGE_URL,
        json={"alert_id": phantom_id, "acknowledgment_reason": "should not exist"},
        headers=headers,
    )

    print(f"Status : {resp.status_code}  Body : {resp.text}")

    assert resp.status_code == 404, (
        f"TC-ACK02 FAILED: got {resp.status_code}, expected 404. "
        "Acknowledging a non-existent alert_id must return 404."
    )
    print("\n✓ PASSED — Non-existent alert_id correctly returns 404")


# ══════════════════════════════════════════════════════════════════
# TC-ACK03: Empty acknowledgment_reason is rejected with 422
# ══════════════════════════════════════════════════════════════════
def test_TC_ACK03_missing_alert_id_rejected_with_422(dashboard_client, dashboard_env):
    
    """Verify that acknowledge requests missing required fields are rejected with a 422 status.
    
    Given a request body missing the alert_id field,
    when the client posts to the acknowledge endpoint,
    then the API rejects the request with a 422 Unprocessable Entity status.
    
    Arrange: Use an authenticated client and prepare requests missing the alert_id field.
    Act: Post to the acknowledge endpoint.
    Assert: Verify that the requests are rejected with a 422 status code.
    """
    print("\n" + "=" * 60)
    print("TC-ACK03: Missing alert_id → 422")
    print("=" * 60)

    headers = dashboard_env["headers"]

    # Case 1: alert_id missing entirely
    print(f"\nCase 1 — alert_id field omitted ...")
    resp_missing = dashboard_client.post(
        ALERTS_ACKNOWLEDGE_URL,
        json={"acknowledgment_reason": "some reason"},
        headers=headers,
    )
    print(f"Status : {resp_missing.status_code}  Body : {resp_missing.text[:200]}")
    assert resp_missing.status_code == 422, (
        f"TC-ACK03 FAILED (missing alert_id): got {resp_missing.status_code}, expected 422. "
        "alert_id is a required field and must be enforced by Pydantic."
    )

    # Case 2: empty body entirely
    print(f"\nCase 2 — completely empty body ...")
    resp_empty_body = dashboard_client.post(
        ALERTS_ACKNOWLEDGE_URL,
        json={},
        headers=headers,
    )
    print(f"Status : {resp_empty_body.status_code}  Body : {resp_empty_body.text[:200]}")
    assert resp_empty_body.status_code == 422, (
        f"TC-ACK03 FAILED (empty body): got {resp_empty_body.status_code}, expected 422. "
        "Empty request body must be rejected."
    )

    print("\n✓ PASSED — Missing alert_id and empty body correctly rejected with 422")

# ══════════════════════════════════════════════════════════════════════════════
# AREA 7 — Multi-Tank & Multi-Branch Scenarios  [TC-MT01 – TC-MT02]
# ══════════════════════════════════════════════════════════════════════════════

# ══════════════════════════════════════════════════════════════════
# TC-MT01: Role=User graph is scoped to their branch's tanks only
# ══════════════════════════════════════════════════════════════════
def test_TC_MT01_user_role_graph_scoped_to_own_branch_tanks(dashboard_client, dashboard_env):
    
    """Verify that users with the User role only receive graph metrics for tanks in their assigned branch.
    
    Given Tank-1 in Branch A and Tank-2 in Branch B,
    when a user from Branch A requests the deviations graph,
    then the response only counts deviations from Tank-1.
    
    Arrange: Seed alerts for Tank-1 in Branch A and Tank-2 in Branch B, and obtain a User token for Branch A.
    Act: Request the deviations graph.
    Assert: Verify that the returned graph bar total is 2 (only showing Tank-1).
    """
    print("\n" + "=" * 60)
    print("TC-MT01: Role=User graph scoped to their branch's tanks (not other branches)")
    print("=" * 60)

    db          = dashboard_env["db"]
    hospital_id = dashboard_env["hospital_id"]
    branch_id   = dashboard_env["branch_id"]   # Branch A (user's branch)
    tank_id     = dashboard_env["tank_id"]     # Tank-1 in Branch A

    from app.models.user_model import User as UserModel
    user = db.query(UserModel).filter(
        UserModel.user_id == dashboard_env["user_id"]
    ).first()

    # Build a Role=User JWT scoped to Branch A
    user_token   = _make_token(user, role="User", department="IVF",
                               hospital_id=hospital_id, branch_id=branch_id)
    user_headers = {"Authorization": f"Bearer {user_token}"}

    may_base = datetime.datetime(2026, 5, 10, 9, 0, 0)

    # ── Seed 2 alerts in Branch A / Tank-1 (should be visible to Role=User) ──
    print(f"\nSeeding 2 alerts for Branch A / Tank-1 ({tank_id}) ...")
    branch_a_alerts = [
        _seed_alert(
            db,
            hospital_id=hospital_id,
            branch_id=branch_id,
            tank_id=tank_id,
            occurred_at=may_base + datetime.timedelta(days=i),
            kpi_config_id=dashboard_env["kpi_config_id"],
        )
        for i in range(2)
    ]

    # ── Seed 3 alerts in Branch B / Tank-2 (different branch — must be hidden) ─
    # ── Create REAL Branch B ───────────────────────────────────────
    branch_b = Branch(hospital_id=hospital_id,branch_name="Test Branch B")
    db.add(branch_b)
    db.flush()

    # ── Create REAL Tank-2 inside Branch B ────────────────────────
    tank_b = Tank(branch_id=branch_b.branch_id, tank_code="Test Tank B")
    db.add(tank_b)
    db.flush()

    branch_b_id = branch_b.branch_id
    tank_b_id   = tank_b.tank_id

    print(f"\nSeeding 3 alerts for Branch B / Tank-2 ({tank_b_id}) ...")
    branch_b_alerts = [
        _seed_alert(
            db,
            hospital_id=hospital_id,
            branch_id=branch_b_id,
            tank_id=tank_b_id,
            occurred_at=may_base + datetime.timedelta(days=i)
        )
        for i in range(3)
    ]

    try:
        resp = dashboard_client.get(
            DEVIATION_GRAPH_URL,
            params={"from_ts": MAY_2026_FROM_TS, "to_ts": MAY_2026_TO_TS},
            headers=user_headers
        )

        print(f"\nDEVIATION GRAPH RESPONSE (Role=User, Branch A)")
        print(f"Status : {resp.status_code}  Body : {resp.text[:400]}")

        assert resp.status_code == 200, resp.text

        graph = resp.json()
        bars  = (
            graph.get("bars")
            or graph.get("data")
            or graph.get("graph")
            or (graph if isinstance(graph, list) else [])
        )
        total = sum(
            b.get("count",
                b.get("value",
                    b.get("deviation_count",
                        b.get("total", 0))))
            for b in bars
        )

        print(f"\n bar total for Role=User (Branch A) : {total}")

        assert total == 2, (
            f"TC-MT01 FAILED: bar total = {total}, expected 2. "
            "Role=User must only see tanks in their own branch. "
            "Branch B's 3 deviations must be excluded."
        )
        print("\n✓ PASSED — Role=User graph correctly scoped to Branch A (total = 2)")

    finally:
        _cleanup(db, branch_a_alerts + branch_b_alerts)

        db.delete(tank_b)
        db.delete(branch_b)

        db.commit()


def test_TC_MT03_user_role_cannot_see_deviations_from_multiple_other_branches(dashboard_client, dashboard_env):
    
    """Verify that users with the User role cannot see deviations from other hospital branches.
    
    Given active alerts in Branch A, Branch B, and Branch C,
    when a user from Branch A requests the deviations graph,
    then only Branch A's deviations are returned.
    
    Arrange: Seed alerts across Branch A, Branch B, and Branch C, and obtain a User token for Branch A.
    Act: Request the deviations graph.
    Assert: Verify that the returned graph bar total is 2 (only showing Branch A).
    """
    db          = dashboard_env["db"]
    hospital_id = dashboard_env["hospital_id"]
    branch_a_id = dashboard_env["branch_id"]
    tank_a_id   = dashboard_env["tank_id"]

    from app.models.user_model import User as UserModel
    user = db.query(UserModel).filter(
        UserModel.user_id == dashboard_env["user_id"]
    ).first()

    user_token   = _make_token(user, role="User", department="IVF",
                               hospital_id=hospital_id, branch_id=branch_a_id)
    user_headers = {"Authorization": f"Bearer {user_token}"}

    from app.constants.enums import CanisterStatus

    branch_b = Branch(hospital_id=hospital_id, branch_name="Branch B")
    db.add(branch_b)
    db.commit()
    db.refresh(branch_b)
    tank_b = Tank(
        branch_id=branch_b.branch_id,
        tank_code=f"Tank-{uuid.uuid4().hex[:4].upper()}",
        is_active=True,
        status=CanisterStatus.SAFE,
    )
    db.add(tank_b)
    db.commit()
    db.refresh(tank_b)

    branch_c = Branch(hospital_id=hospital_id, branch_name="Branch C")
    db.add(branch_c)
    db.commit()
    db.refresh(branch_c)
    tank_c = Tank(
        branch_id=branch_c.branch_id,
        tank_code=f"Tank-{uuid.uuid4().hex[:4].upper()}",
        is_active=True,
        status=CanisterStatus.SAFE,
    )
    db.add(tank_c)
    db.commit()
    db.refresh(tank_c)

    may_base = datetime.datetime(2026, 5, 10, 9, 0, 0)

    branch_a_alerts = [
        _seed_alert(
            db,
            hospital_id=hospital_id,
            branch_id=branch_a_id,
            tank_id=tank_a_id,
            occurred_at=may_base + datetime.timedelta(days=i),
            kpi_config_id=dashboard_env["kpi_config_id"],
        )
        for i in range(2)
    ]

    branch_b_alerts = [
        _seed_alert(
            db,
            hospital_id=hospital_id,
            branch_id=branch_b.branch_id,
            tank_id=tank_b.tank_id,
            occurred_at=may_base + datetime.timedelta(days=i + 2),
        )
        for i in range(3)
    ]

    branch_c_alerts = [
        _seed_alert(
            db,
            hospital_id=hospital_id,
            branch_id=branch_c.branch_id,
            tank_id=tank_c.tank_id,
            occurred_at=may_base + datetime.timedelta(days=i + 5),
        )
        for i in range(4)
    ]

    try:
        resp = dashboard_client.get(
            DEVIATION_GRAPH_URL,
            params={"from_ts": MAY_2026_FROM_TS, "to_ts": MAY_2026_TO_TS},
            headers=user_headers,
        )
        assert resp.status_code == 200, resp.text

        graph = resp.json()
        bars = (
            graph.get("bars")
            or graph.get("data")
            or graph.get("graph")
            or (graph if isinstance(graph, list) else [])
        )
        total = sum(
            b.get("count",
                b.get("value",
                    b.get("deviation_count",
                        b.get("total", 0))))
            for b in bars
        )

        assert total == 2, (
            f"TC-MT03 FAILED: bar total = {total}, expected 2. "
            "Role=User must only see deviations from their own branch."
        )
        print("\n✓ PASSED — Role=User cannot see deviations from multiple other branches")
    finally:
        _cleanup(db, branch_a_alerts + branch_b_alerts + branch_c_alerts)
        db.delete(tank_b)
        db.delete(branch_b)
        db.delete(tank_c)
        db.delete(branch_c)
        db.commit()


# ══════════════════════════════════════════════════════════════════
# TC-MT02: Role=Admin graph aggregates ALL branches of the hospital
# ══════════════════════════════════════════════════════════════════
def test_TC_MT02_admin_graph_aggregates_all_branches(dashboard_client, dashboard_env):
    
    """Verify that hospital Admins receive aggregated graph metrics across all branches.
    
    Given Tank-1 in Branch A and Tank-2 in Branch B,
    when an Admin requests the deviations graph,
    then the response aggregates data from both branches.
    
    Arrange: Seed alerts for Tank-1 in Branch A and Tank-2 in Branch B.
    Act: Request the deviations graph using an Admin token.
    Assert: Verify that the returned graph bar total is 5 (aggregating both branches).
    """
    print("\n" + "=" * 60)
    print("TC-MT02: Role=Admin graph aggregates all branches (total = 5)")
    print("=" * 60)

    db          = dashboard_env["db"]
    hospital_id = dashboard_env["hospital_id"]
    branch_id   = dashboard_env["branch_id"]   # Branch A
    tank_id     = dashboard_env["tank_id"]     # Tank-1 in Branch A
    headers     = dashboard_env["headers"]     # Admin JWT (role=Admin, dept=IVF)

    may_base = datetime.datetime(2026, 5, 10, 9, 0, 0)

    # ── Seed 2 alerts in Branch A / Tank-1 ────────────────────────────────────
    print(f"\nSeeding 2 alerts for Branch A / Tank-1 ({tank_id}) ...")
    branch_a_alerts = [
        _seed_alert(
            db,
            hospital_id=hospital_id,
            branch_id=branch_id,
            tank_id=tank_id,
            occurred_at=may_base + datetime.timedelta(days=i),
            kpi_config_id=dashboard_env["kpi_config_id"],
        )
        for i in range(2)
    ]

    # ── Seed 3 alerts in Branch B / Tank-2 (same hospital, different branch) ──
    # ── Create REAL Branch B ───────────────────────────────────────
    branch_b = Branch(hospital_id=hospital_id,branch_name="Test Branch B")
    db.add(branch_b)
    db.flush()

    # ── Create REAL Tank-2 inside Branch B ────────────────────────
    # tank_b = Tank(branch_id=branch_b.branch_id, tank_code="Test Tank B")
    # db.add(tank_b)
    # db.flush()

    # ── DEBUG existing real tank ──────────────────────────────────
    real_tank = db.query(Tank).filter(
        Tank.tank_id == tank_id
    ).first()

    print("\nREAL TANK DATA:")
    print(real_tank.__dict__)

    # ── Create REAL Tank-2 inside Branch B ────────────────────────
    tank_b = Tank(
        branch_id=branch_b.branch_id,
        tank_code="Test Tank B",
        is_active=True,
        status=real_tank.status
    )

    db.add(tank_b)
    db.flush()

    branch_b_id = branch_b.branch_id
    tank_b_id   = tank_b.tank_id

    print(f"\nSeeding 3 alerts for Branch B / Tank-2 ({tank_b_id}) ...")
    branch_b_alerts = [
        _seed_alert(
            db,
            hospital_id=hospital_id,
            branch_id=branch_b_id,
            tank_id=tank_b_id,
            occurred_at=may_base + datetime.timedelta(days=i),
            kpi_config_id=dashboard_env["kpi_config_id"]
        )
        for i in range(3)
    ]

    try:
        resp = dashboard_client.get(
            DEVIATION_GRAPH_URL,
            params={"from_ts": MAY_2026_FROM_TS, "to_ts": MAY_2026_TO_TS},
            headers=headers,
        )

        print(f"\nDEVIATION GRAPH RESPONSE (Role=Admin, all branches)")
        print(f"Status : {resp.status_code}  Body : {resp.text[:400]}")

        assert resp.status_code == 200, resp.text

        graph = resp.json()
        bars  = (
            graph.get("bars")
            or graph.get("data")
            or graph.get("graph")
            or (graph if isinstance(graph, list) else [])
        )
        total = sum(
            b.get("count",
                b.get("value",
                    b.get("deviation_count",
                        b.get("total", 0))))
            for b in bars
        )

        print(f"\n bar total for Role=Admin (all branches) : {total}")

        assert total == 5, (
            f"TC-MT02 FAILED: bar total = {total}, expected 5. "
            "Role=Admin must aggregate deviations across ALL hospital branches. "
            f"Branch A = 2, Branch B = 3 → combined = 5."
        )
        print("\n✓ PASSED — Role=Admin graph correctly aggregates all branches (total = 5)")

    finally:
        _cleanup(db, branch_a_alerts + branch_b_alerts)

        db.delete(tank_b)
        db.delete(branch_b)

        db.commit()