import datetime
import uuid

from app.models.IVF.critical_alert_model import CriticalAlert
from app.models.kpi_config_model import KpiConfig

MONTHLY_SUMMARY_URL = "/api/ivf/reports/monthly-summary"
REPORT_DOWNLOAD_URL = "/api/reports/download"


def _dedup_key(tank_id, alert_type, occurred_at, kpi_config_id):
    timestamp = occurred_at.strftime("%Y-%m-%d_%H:%M:%S")
    return f"{tank_id}:KPI:{alert_type}:{timestamp}:{kpi_config_id}"


def _seed_kpi_config(db, hospital_id, branch_id, tank_id, kpi_name, alert_name):
    config = KpiConfig(
        hospital_id=hospital_id,
        branch_id=branch_id,
        tank_id=tank_id,
        kpi_name=kpi_name,
        alert_name=alert_name,
        min=-200,
        max=-190,
        unit="°C",
        alert_type="critical",
        cooldown_minutes=60,
        status=True,
    )
    db.add(config)
    db.commit()
    db.refresh(config)
    return config


def _seed_alert(
    db,
    hospital_id,
    branch_id,
    tank_id,
    occurred_at,
    kpi_config_id,
    alert_type="Deviation alert",
    source="KPI",
    severity="High",
    status="Active",
):
    alert = CriticalAlert(
        alert_id=str(uuid.uuid4()),
        tank_id=tank_id,
        incubator_id=None,
        hospital_id=hospital_id,
        branch_id=branch_id,
        alert_type=alert_type,
        source=source,
        severity=severity,
        message="Seeded for monthly summary report test",
        status=status,
        triggered_by="system",
        occurred_at=occurred_at,
        dedup_key=_dedup_key(tank_id, alert_type, occurred_at, kpi_config_id),
    )
    db.add(alert)
    db.commit()
    db.refresh(alert)
    return alert


def test_report_dash_monthly_summary_uses_requested_month(client, setup_kpi_environment, auth_headers):
    db = setup_kpi_environment["db"]
    hospital_id = setup_kpi_environment["hospital_id"]
    branch_id = setup_kpi_environment["branch_id"]
    tank_id = setup_kpi_environment["tank_id"]

    internal_config = _seed_kpi_config(
        db,
        hospital_id=hospital_id,
        branch_id=branch_id,
        tank_id=tank_id,
        kpi_name="temp_internal",
        alert_name="Internal Temperature",
    )
    external_config = _seed_kpi_config(
        db,
        hospital_id=hospital_id,
        branch_id=branch_id,
        tank_id=tank_id,
        kpi_name="temp_external",
        alert_name="External Temperature",
    )

    may_alert = _seed_alert(
        db,
        hospital_id=hospital_id,
        branch_id=branch_id,
        tank_id=tank_id,
        occurred_at=datetime.datetime(2026, 5, 10, 9, 0, 0),
        kpi_config_id=internal_config.id,
    )
    april_alert = _seed_alert(
        db,
        hospital_id=hospital_id,
        branch_id=branch_id,
        tank_id=tank_id,
        occurred_at=datetime.datetime(2026, 4, 10, 9, 0, 0),
        kpi_config_id=external_config.id,
    )

    try:
        response = client.get(
            MONTHLY_SUMMARY_URL,
            params={"month": "2026-05"},
            headers=auth_headers,
        )

        assert response.status_code == 200, response.text
        data = response.json()

        assert data["month"] == "2026-05"
        row_by_kpi = {row["kpi_name"]: row for row in data["rows"]}

        assert row_by_kpi["Internal Temperature"]["alerts_sent"] == 1
        assert row_by_kpi["Internal Temperature"]["deviations_found"] == 1
        assert row_by_kpi["External Temperature"]["alerts_sent"] == 0
        assert row_by_kpi["External Temperature"]["deviations_found"] == 0
    finally:
        for alert in (may_alert, april_alert):
            db.delete(alert)
        db.query(KpiConfig).filter(KpiConfig.id.in_([internal_config.id, external_config.id])).delete(synchronize_session=False)
        db.commit()


def test_report_dash_monthly_summary_excludes_other_months(client, setup_kpi_environment, auth_headers):
    db = setup_kpi_environment["db"]
    hospital_id = setup_kpi_environment["hospital_id"]
    branch_id = setup_kpi_environment["branch_id"]
    tank_id = setup_kpi_environment["tank_id"]

    shock_config = _seed_kpi_config(
        db,
        hospital_id=hospital_id,
        branch_id=branch_id,
        tank_id=tank_id,
        kpi_name="shock",
        alert_name="Shock",
    )

    may_alert = _seed_alert(
        db,
        hospital_id=hospital_id,
        branch_id=branch_id,
        tank_id=tank_id,
        occurred_at=datetime.datetime(2026, 5, 10, 9, 0, 0),
        kpi_config_id=shock_config.id,
    )
    june_alert = _seed_alert(
        db,
        hospital_id=hospital_id,
        branch_id=branch_id,
        tank_id=tank_id,
        occurred_at=datetime.datetime(2026, 6, 1, 9, 0, 0),
        kpi_config_id=shock_config.id,
    )

    try:
        response = client.get(
            MONTHLY_SUMMARY_URL,
            params={"month": "2026-04"},
            headers=auth_headers,
        )

        assert response.status_code == 200, response.text
        data = response.json()
        assert data["month"] == "2026-04"

        row_by_kpi = {row["kpi_name"]: row for row in data["rows"]}
        assert row_by_kpi["Shock"]["alerts_sent"] == 0
        assert row_by_kpi["Shock"]["deviations_found"] == 0
    finally:
        for alert in (may_alert, june_alert):
            db.delete(alert)
        db.query(KpiConfig).filter(KpiConfig.id == shock_config.id).delete(synchronize_session=False)
        db.commit()


def test_report_dash_monthly_summary_invalid_month_format_returns_400(client, setup_kpi_environment, auth_headers):
    response = client.get(
        MONTHLY_SUMMARY_URL,
        params={"month": "05-2026"},
        headers=auth_headers,
    )

    assert response.status_code == 400


def test_report_dash_download_requires_report_type(client, setup_kpi_environment, auth_headers):
    missing_type_response = client.post(
        REPORT_DOWNLOAD_URL,
        json={},
        headers=auth_headers,
    )

    assert missing_type_response.status_code == 422
    assert missing_type_response.json()["message"] == "Field required"

    valid_response = client.post(
        REPORT_DOWNLOAD_URL,
        json={"report_type": "monthly_summary"},
        headers=auth_headers,
    )
    print(f"Valid response: {valid_response.text}")
    assert valid_response.status_code == 200, valid_response.text
    assert valid_response.json().get("status") == "success"
