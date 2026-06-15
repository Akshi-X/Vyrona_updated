import pytest
import uuid
import datetime
from fastapi.testclient import TestClient
import inspect

# ── Application Imports ───────────────────────────────────────────
from app.main import app
from app.config.database import SessionLocal
from app.models.user_model import User
from app.auth.auth import get_password_hash, create_access_token
from app.models.IVF.hospital_model import Hospital
from app.models.IVF.hospital_branch_model import HospitalBranch
from app.models.IVF.tank_model import Tank
from app.constants.enums import CanisterStatus

# ── Route Constants ───────────────────────────────────────────────
KPI_GET_LIST_URL = "/api/ivf/quality/kpi-config/list"
KPI_POST_URL     = "/api/ivf/quality/kpi-config"
KPI_PUT_URL      = "/api/ivf/quality/kpi-config/{config_id}"


# ── Global Hooks & Engine Fixes ───────────────────────────────────

@pytest.fixture(scope="session", autouse=True)
def fix_missing_columns():
    """Ensures database tables are patched before running any test files."""
    from app.config.database import engine
    from sqlalchemy import text
    with engine.connect() as conn:
        conn.execute(text(
            "ALTER TABLE critical_alerts ADD COLUMN IF NOT EXISTS acknowledgment_reason TEXT;"
        ))
        conn.execute(text(
            "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS refrigerator_id INTEGER;"
        ))
        conn.execute(text(
            "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS zone_id VARCHAR(255);"
        ))
        conn.execute(text(
            "ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS refrigerator_id INTEGER;"
        ))
        conn.execute(text(
            "ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS zone_id VARCHAR(255);"
        ))
        conn.commit()


# ── Base Core Fixtures ────────────────────────────────────────────

@pytest.fixture(scope="module")
def client():
    """A shared TestClient instance reused across tests in a module."""
    return TestClient(app)


# ── Unified Environment & Data Seeding ────────────────────────────

@pytest.fixture
def setup_hospital_user():
    """
    Factory fixture that creates Hospital → Branch → User.
    Yields a callable so tests can request specific roles.
    """
    created_items = []

    def _create_user(role="Admin"):

        db = SessionLocal()

        # CREATE HOSPITAL
        hospital = Hospital(
            hospital_name="Test Hospital"
        )

        db.add(hospital)
        db.commit()
        db.refresh(hospital)

        # CREATE BRANCH
        branch = HospitalBranch(
            hospital_id=hospital.hospital_id,
            branch_name="Main Branch"
        )

        db.add(branch)
        db.commit()
        db.refresh(branch)

        # CREATE USER
        user = User(
            user_id=str(uuid.uuid4()),
            email=f"{uuid.uuid4()}@test.com",
            password_hash=get_password_hash("easyPeasy1!"),
            first_name="Test",
            last_name="User",
            role=role,
            status=True,
            approved_status="approved",
            hospital_id=hospital.hospital_id,
            branch_id=branch.branch_id,
            department="IVF"
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        created_items.append((db, user, branch, hospital))

        return {
            "db": db,
            "hospital": hospital,
            "branch": branch,
            "user": user
        }

    yield _create_user

    # CLEANUP
    for db, user, branch, hospital in created_items:
        try:
            from app.models.user_model import User as UserModel
            from app.models.otp_model import OTP
            db.query(OTP).filter(OTP.user_id == user.user_id).delete()
            db.commit()
            db.query(UserModel).filter(UserModel.branch_id == branch.branch_id).delete()
            db.commit()
            db.delete(branch)
            db.commit()
            db.delete(hospital)
            db.commit()
        except Exception as e:
            db.rollback()
            print(f"Auth cleanup failed: {e}")
        finally:
            db.close()


@pytest.fixture
def setup_kpi_environment():
    """
    Seeds a full KPI workspace: Hospital → Branch → User → Tank.

    Crucially, a User is created inside the same Hospital/Branch so that
    the JWT token (user_id, hospital_id, branch_id) is fully consistent
    with what the middleware checks against the database.
    """
    db = SessionLocal()

    hospital = Hospital(hospital_name="KPI Test Hospital")
    db.add(hospital)
    db.commit()
    db.refresh(hospital)

    branch = HospitalBranch(
        hospital_id=hospital.hospital_id,
        branch_name="KPI Main Branch",
    )
    db.add(branch)
    db.commit()
    db.refresh(branch)

    # User lives inside this hospital/branch — token claims will match exactly
    user = User(
        user_id=str(uuid.uuid4()),
        email=f"{uuid.uuid4()}@test.com",
        password_hash=get_password_hash("easyPeasy1!"),
        first_name="KPI",
        last_name="Tester",
        role="Admin",
        status=True,
        approved_status="approved",
        hospital_id=hospital.hospital_id,
        branch_id=branch.branch_id,
        department="IVF",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    tank = Tank(
        branch_id=branch.branch_id,
        tank_code=f"Tank-{uuid.uuid4().hex[:4].upper()}",
        is_active=True,
        status=CanisterStatus.SAFE,
    )
    db.add(tank)
    db.commit()
    db.refresh(tank)

    yield {
        "db":          db,
        "hospital_id": hospital.hospital_id,
        "branch_id":   branch.branch_id,
        "tank_id":     tank.tank_id,
        # Expose user so auth_headers can build a perfectly aligned token
        "user_id":     user.user_id,
        "email":       user.email,
    }

    try:
        db.delete(tank)
        db.commit()
        from app.models.otp_model import OTP
        db.query(OTP).filter(OTP.user_id == user.user_id).delete()
        db.commit()
        db.delete(user)
        db.commit()
        db.delete(branch)
        db.commit()
        db.delete(hospital)
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"KPI teardown failed: {e}")
    finally:
        db.close()


# ── KPI Endpoint Request Abstractions ─────────────────────────────

@pytest.fixture
def base_kpi_payload(setup_kpi_environment):
    """Generates a base JSON payload using live seeded entity IDs."""
    env = setup_kpi_environment
    return {
        "hospital_id":                 env["hospital_id"],
        "branch_id":                   env["branch_id"],
        "tank_id":                     env["tank_id"],
        "alert_type":                  "critical",
        "cooldown_minutes":            60,
        "unack_escalation_threshold":  None,
        "status":                      True,
    }


@pytest.fixture
def auth_headers(request, setup_hospital_user):
    """
    Builds a signed JWT whose claims are consistent with the DB.

    - If setup_kpi_environment is in scope: use its user_id / hospital_id /
      branch_id — the user already exists in that hospital/branch, so the
      middleware's DB lookup will succeed.
    - Otherwise: fall back to creating a standalone user via setup_hospital_user.
    """
    if "setup_kpi_environment" in request.fixturenames:
        kpi_env = request.getfixturevalue("setup_kpi_environment")
        user_id_val     = str(kpi_env["user_id"])
        user_email      = kpi_env["email"]
        hospital_id_val = str(kpi_env["hospital_id"])
        branch_id_val   = str(kpi_env["branch_id"])
    else:
        user_context    = setup_hospital_user(role="Admin")
        user            = user_context["user"]
        user_id_val     = str(user.user_id)
        user_email      = user.email
        hospital_id_val = str(user.hospital_id)
        branch_id_val   = str(user.branch_id)

    token_data = {
        "sub":         user_id_val,
        "id":          user_id_val,
        "user_id":     user_id_val,
        "email":       user_email,
        "role":        "Admin",
        "user_role":   "Admin",
        "type":        "hospital_user",
        "user_type":   "hospital_user",
        "hospital_id": hospital_id_val,
        "branch_id":   branch_id_val,
        "department":  "IVF",
        "token_type":  "access",
        "identity":    user_id_val,
        "exp": datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=1),
        "iat": datetime.datetime.now(datetime.timezone.utc),
    }

    token = create_access_token(data=token_data)
    print("\n--- DEBUG TOKEN DATA ---")
    print(token_data)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def post_kpi_config(client, base_kpi_payload, auth_headers):
    """Executes an authorized POST request against the KPI endpoint."""
    def _post(fields: dict):
        return client.post(
            KPI_POST_URL,
            json={**base_kpi_payload, **fields},
            headers=auth_headers,
        )
    return _post


@pytest.fixture
def put_kpi_config(client, base_kpi_payload, auth_headers):
    """Executes an authorized PUT request to update an existing config."""
    def _put(config_id: int, fields: dict):
        url = KPI_PUT_URL.format(config_id=config_id)
        return client.put(
            url,
            json={**base_kpi_payload, **fields},
            headers=auth_headers,
        )
    return _put


# ── Standalone Verification Helpers ───────────────────────────────

def get_config_by_kpi(client, env_data: dict, kpi_name: str, auth_headers: dict = None) -> dict | None:
    """Look up a KPI config entry from the list endpoint."""
    headers = auth_headers if auth_headers else {}
    resp = client.get(KPI_GET_LIST_URL, params={"tank_id": env_data["tank_id"]}, headers=headers)
    assert resp.status_code == 200, f"GET list failed: {resp.text}"
    configs = resp.json().get("config", [])
    return next((c for c in configs if c["kpi_name"] == kpi_name), None)


# ── Test Reporting - Done with the help of html-reporter.py───────────────────────────────────────────────────

from tests.reporters.html_reporter import generate_grouped_html_report


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item, call):
    """Capture test docstring and collect report for custom HTML generation."""
    outcome = yield
    report = outcome.get_result()
    # Collect for grouped custom report
    if not hasattr(item.config, "_custom_reports"):
        item.config._custom_reports = []
    item.config._custom_reports.append(report)
    # Capture docstring for display
    if report.when == "call":
        doc = None
        try:
            doc = inspect.getdoc(item.obj) or inspect.getdoc(item.function)
        except Exception:
            doc = None
        report.description = doc or ""

def pytest_sessionfinish(session, exitstatus):
    """Generate custom grouped HTML report at session end."""
    generate_grouped_html_report(session, exitstatus)