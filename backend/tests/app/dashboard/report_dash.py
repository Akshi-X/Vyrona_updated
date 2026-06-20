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


class TestScenario_ReportDashboard:
    """Scenario: Report Dashboard.

    This scenario validates the monthly summary reports for IVF operations,
    ensuring correct month filtering, rejection of malformed inputs, and
    proper download initialization requirements.
    """

    def test_report_dash_monthly_summary_uses_requested_month(self, client, setup_kpi_environment, auth_headers):
        """Verify that the monthly summary report includes data for the requested month.

        Given a KPI environment with active alerts in multiple months,
        when a monthly summary report is requested for a specific month,
        then the API returns a 200 status code with alerts and deviations count for that month.

        Arrange: Seed KPI configs and alerts in May 2026 and April 2026.
        Act: Request the monthly summary report for May 2026 ('2026-05').
        Assert: Verify that the response status code is 200, the returned month is '2026-05', and only May 2026 alerts/deviations are counted.
        """
        print("\n" + "=" * 60)
        print("SCENARIO 1: Monthly summary report uses requested month")
        print("=" * 60)

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

    def test_report_dash_monthly_summary_excludes_other_months(self, client, setup_kpi_environment, auth_headers):
        """Verify that the monthly summary report excludes data from other months.

        Given a KPI environment with alerts in May 2026 and June 2026,
        when a monthly summary report is requested for April 2026,
        then the API returns a 200 status code showing zero alerts and deviations.

        Arrange: Seed KPI config and alerts in May 2026 and June 2026.
        Act: Request the monthly summary report for April 2026 ('2026-04').
        Assert: Verify that the response status code is 200 and all alert/deviation counters are 0.
        """
        print("\n" + "=" * 60)
        print("SCENARIO 2: Monthly summary report excludes other months")
        print("=" * 60)

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

    def test_report_dash_monthly_summary_invalid_month_format_returns_400(self, client, setup_kpi_environment, auth_headers):
        """Verify that requesting a monthly summary with an invalid month format returns a 400 error.

        Given an invalid month format (e.g., '05-2026'),
        when the monthly summary report is requested,
        then the API rejects the request with a 400 status code.

        Arrange: Prepare request parameters with an invalid month format.
        Act: Submit a GET request to the monthly-summary endpoint.
        Assert: Verify that the response status code is 400.
        """
        print("\n" + "=" * 60)
        print("SCENARIO 3: Invalid month format returns 400")
        print("=" * 60)

        response = client.get(
            MONTHLY_SUMMARY_URL,
            params={"month": "05-2026"},
            headers=auth_headers,
        )

        assert response.status_code == 400

    def test_report_dash_download_requires_report_type(self, client, setup_kpi_environment, auth_headers):
        """Verify report download validation requirements.

        Given requests to the report download endpoint,
        when the report type parameter is missing,
        then the API rejects the request with a 422 status code, and succeeds with 200 when a valid report type is provided.

        Arrange: Set up empty and valid JSON request bodies for report download.
        Act: Send a POST request without a report type, and then with a valid report type.
        Assert: Verify the first request fails with 422 and "Field required", and the second request succeeds with 200 and success status.
        """
        print("\n" + "=" * 60)
        print("SCENARIO 4: Report download validation requirements")
        print("=" * 60)

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
