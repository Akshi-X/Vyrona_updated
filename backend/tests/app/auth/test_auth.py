from urllib import response

from app.constants.error_codes import get_error_code
from fastapi.testclient import TestClient
from app.main import app
from app.auth.auth import create_access_token
import uuid

client = TestClient(app)

"""
Response body shape for every auth exception (from custom_exceptions.py):

AppException.to_dict() always returns:
    {
        "error_code": str,
        "message":    str,
        "status":     "failed",
        "timestamp":  str (ISO),
        ...details    (extra fields spread in)
    }

Per exception, the extra detail fields are:

UserNotFoundException        → status_code=400  | (no extra fields)
InvalidCredentialsException  → status_code=401  | email, attempts_remaining
AccountLockedException       → status_code=403  | user_id, unlock_time, minutes_remaining
AccountInactiveException     → status_code=403  | user_id
UserNotApprovedException     → status_code=403  | user_id
InvalidOTPException          → status_code=400  | user_id
OTPExpiredException          → status_code=400  | user_id
ResendOTPFailedException     → status_code=500  | email, reason
EmailAlreadyExistsException  → status_code=409  | email
"""


# ══════════════════════════════════════════════════════════════════
# SCENARIO 1: Wrong email & password
# Triggers: UserNotFoundException (status=400, no extra fields)
# ══════════════════════════════════════════════════════════════════
def test_wrong_email_and_password():
    print("\n" + "=" * 60)
    print("SCENARIO 1: Wrong email & password")
    print("=" * 60)

    payload = {"email": "wrongemail@test.com", "password": "WrongPassword1!"}
    print(f"Email    : {payload['email']}")
    print(f"Password : {payload['password']}")

    response = client.post("/api/login", json=payload)
    response_data = response.json()

    print("\nLOGIN RESPONSE")
    print(f"Status : {response.status_code}")
    print(f"Body   : {response.text}")

    assert response.status_code == 400
    assert response_data["error_code"] == get_error_code(
        "USER_NOT_FOUND"
    )  # UserNotFoundException
    assert response_data["status"] == "Failed"
    assert "message" in response_data

    print(f"\n error_code : {response_data['error_code']}")
    print(f" message    : {response_data['message']}")
    print("\n✓ PASSED — Wrong credentials correctly rejected")


# ══════════════════════════════════════════════════════════════════
# SCENARIO 2: Invalid email format
# Triggers: FastAPI 422 Unprocessable Entity (Pydantic validation)
# ══════════════════════════════════════════════════════════════════
def test_invalid_email_format():
    print("\n" + "=" * 60)
    print("SCENARIO 2: Invalid email format")
    print("=" * 60)

    payload = {"email": "not-a-valid-email", "password": "easyPeasy1!"}
    print(f"Email    : {payload['email']}")
    print(f"Password : {payload['password']}")

    response = client.post("/api/login", json=payload)
    response_data = response.json()

    print("\nLOGIN RESPONSE")
    print(f"Status : {response.status_code}")
    print(f"Body   : {response.text}")

    assert response.status_code == 422
    assert response.json()["error_code"] == get_error_code(
        "INVALID_EMAIL_FORMAT"
    )  # Maps to "ERR_2004"
    assert "message" in response_data

    print(f"\n error_code : {response_data['error_code']}")
    print(f" message    : {response_data['message']}")
    print("\n✓ PASSED — Invalid email format rejected by middleware validation")


# ══════════════════════════════════════════════════════════════════
# SCENARIO 3: Multiple wrong attempts until lockout
# Each wrong attempt  → InvalidCredentialsException (401)
#   body has: email, attempts_remaining
# After limit         → AccountLockedException (403)
#   body has: user_id, unlock_time, minutes_remaining
# ══════════════════════════════════════════════════════════════════
def test_multiple_wrong_attempts_until_lockout(setup_hospital_user):
    print("\n" + "=" * 60)
    print("SCENARIO 3: Multiple wrong attempts until lockout")
    print("=" * 60)

    data = setup_hospital_user(role="Admin")
    user = data["user"]
    print(f"Email : {user.email}")

    payload = {"email": user.email, "password": "WrongPassword1!"}

    MAX_ATTEMPTS = 5  # adjust to your lockout threshold
    locked_out = False

    for attempt in range(1, MAX_ATTEMPTS + 2):
        response = client.post("/api/login", json=payload)
        response_data = response.json()

        print(f"\n  Attempt {attempt}")
        print(f"  Status     : {response.status_code}")
        print(f"  Body       : {response.text}")

        if response.status_code == 401:
            # InvalidCredentialsException — check attempts_remaining field
            assert response_data["error_code"] == get_error_code("INVALID_PASSWORD")
            assert response_data["status"] == "Failed"
            assert "attempts_remaining" in response_data
            print(f"  attempts_remaining : {response_data['attempts_remaining']}")

        elif response.status_code == 403:
            # AccountLockedException — check lockout fields
            assert response_data["error_code"] == get_error_code("ACCOUNT_LOCKED")
            assert response_data["status"] == "Failed"
            assert "minutes_remaining" in response_data
            assert "unlock_time" in response_data
            print(f"  minutes_remaining : {response_data['minutes_remaining']}")
            print(f"  unlock_time       : {response_data['unlock_time']}")
            print(f"\n  → Locked out after {attempt} attempt(s)")
            locked_out = True
            break

    assert locked_out, (
        f"Expected AccountLockedException (403) after {MAX_ATTEMPTS} "
        f"wrong attempts but never got it"
    )
    print("\n✓ PASSED — Account locked with correct fields in response")


# ══════════════════════════════════════════════════════════════════
# SCENARIO 4: Wrong OTP multiple times
# Each wrong OTP → InvalidOTPException (400)
#   body has: user_id, error_code="INVALID_OTP"
# ══════════════════════════════════════════════════════════════════
def test_wrong_otp_multiple_times(setup_hospital_user):
    print("\n" + "=" * 60)
    print("SCENARIO 4: Wrong OTP multiple times")
    print("=" * 60)

    data = setup_hospital_user(role="Admin")
    user = data["user"]
    print(f"Email : {user.email}")

    # Step 1 — login to trigger OTP and get user_id
    login_payload = {"email": user.email, "password": "easyPeasy1!"}
    login_response = client.post("/api/login", json=login_payload)

    print("\nSTEP 1: LOGIN")
    print(f"Status : {login_response.status_code}")
    print(f"Body   : {login_response.text}")

    assert login_response.status_code == 200
    print(login_response.json())
    login_data = login_response.json()
    user_id = login_data["user_id"]
    print(f"user_id : {user_id}")
    print(f"email   : {login_data['email']}")
    print(f"status  : {login_data['status']}")

    # Step 2 — submit wrong OTP repeatedly
    MAX_OTP_ATTEMPTS = 3  # adjust to your OTP attempt limit
    last_response = None

    for attempt in range(1, MAX_OTP_ATTEMPTS + 2):
        otp_payload = {"user_id": user_id, "otp": "000000"}
        otp_response = client.post("/api/verify-otp", json=otp_payload)
        otp_data = otp_response.json()
        last_response = otp_response

        print(f"\n  OTP attempt {attempt}")
        print(f"  Status     : {otp_response.status_code}")
        print(f"  Body       : {otp_response.text}")

        assert otp_response.status_code == 400
        assert otp_data["error_code"] == get_error_code("INVALID_OTP")
        assert otp_data["status"] == "Failed"
        assert otp_data["user_id"] == user_id
        print(f"  error_code : {otp_data['error_code']}")

    print("\n✓ PASSED — Wrong OTP rejected with INVALID_OTP error code every time")


# ══════════════════════════════════════════════════════════════════
# SCENARIO 5: Submit OTP after expiry
# Triggers: OTPExpiredException (400)
#   body has: user_id, error_code="OTP_EXPIRED"
# ══════════════════════════════════════════════════════════════════
def test_otp_after_expiry(setup_hospital_user):
    print("\n" + "=" * 60)
    print("SCENARIO 5: Submit OTP after expiry")
    print("=" * 60)

    data = setup_hospital_user(role="Admin")
    user = data["user"]
    print(f"Email : {user.email}")

    # Step 1 — login to trigger OTP
    login_payload = {"email": user.email, "password": "easyPeasy1!"}
    login_response = client.post("/api/login", json=login_payload)

    print("\nSTEP 1: LOGIN")
    print(f"Status : {login_response.status_code}")
    print(f"Body   : {login_response.text}")

    assert login_response.status_code == 200
    user_id = login_response.json()["user_id"]
    print(f"user_id : {user_id}")

    # Step 2 — resend OTP to invalidate the original one
    resend_payload = {"user_id": user_id}
    resend_response = client.post("/api/resend-otp", json=resend_payload)

    print("\nSTEP 2: RESEND OTP (invalidates the original)")
    print(f"Status : {resend_response.status_code}")
    print(f"Body   : {resend_response.text}")

    # Step 3 — try the old OTP which is now expired/replaced
    otp_payload = {"user_id": user_id, "otp": "000000"}
    otp_response = client.post("/api/verify-otp", json=otp_payload)
    otp_data = otp_response.json()

    print("\nSTEP 3: VERIFY EXPIRED OTP")
    print(f"Status     : {otp_response.status_code}")
    print(f"Body       : {otp_response.text}")

    assert otp_response.status_code == 400
    assert otp_data["error_code"] in (
        get_error_code("OTP_EXPIRED"),
        get_error_code("INVALID_OTP"),
    )
    assert otp_data["status"] == "Failed"
    assert otp_data["user_id"] == user_id

    print(f"\n error_code : {otp_data['error_code']}")
    print(f" user_id    : {otp_data['user_id']}")
    print("\n✓ PASSED — Expired OTP rejected with correct error code")


# ══════════════════════════════════════════════════════════════════
# SCENARIO 6: Resend OTP 10 times
# Each successful resend → 200
# After limit           → ResendOTPFailedException (500) or 429
#   body has: email, reason
# ══════════════════════════════════════════════════════════════════
def test_resend_otp_10_times(setup_hospital_user):
    print("\n" + "=" * 60)
    print("SCENARIO 6: Resend OTP 10 times")
    print("=" * 60)

    data = setup_hospital_user(role="Admin")
    user = data["user"]
    print(f"Email : {user.email}")

    login_payload = {"email": user.email, "password": "easyPeasy1!"}
    login_response = client.post("/api/login", json=login_payload)

    print("\nLOGIN")
    print(f"Status : {login_response.status_code}")
    print(f"Body   : {login_response.text}")

    assert login_response.status_code == 200
    user_id = login_response.json()["user_id"]
    print(f"user_id : {user_id}")

    resend_payload = {
        "user_id": user_id,
        "email": user.email,  # Fixed payload
    }
    last_response = None
    limit_hit = False

    for attempt in range(1, 12):  # 10 resends + 1 extra to hit the limit
        resend_response = client.post("/api/resend-otp", json=resend_payload)
        resend_data = resend_response.json()
        last_response = resend_response

        print(f"\n  Resend attempt {attempt}")
        print(f"  Status : {resend_response.status_code}")
        print(f"  Body   : {resend_response.text}")

        if resend_response.status_code in (429, 400):
            print(f"  → Resend limit hit after {attempt} attempt(s)")
            assert resend_data["error_code"] == get_error_code(
                "RESEND_TOO_MANY_REQUESTS"
            )
            assert resend_data["status"] == "Failed"
            assert "email" in resend_data
            print(f"  error_code : {resend_data['error_code']}")
            print(f"  email      : {resend_data['email']}")
            limit_hit = True
            break

    assert limit_hit, (
        f"Expected resend limit to be hit after 10 attempts, "
        f"last status was {last_response.status_code}"
    )
    print("\n✓ PASSED — Resend OTP limit enforced with correct error code")


# ══════════════════════════════════════════════════════════════════
# SCENARIO 7: 10 correct logins in a row
# Each login → 200
#   body has: user_id, email, status="OTP Sent"
# ══════════════════════════════════════════════════════════════════
def test_10_correct_logins(setup_hospital_user):
    print("\n" + "=" * 60)
    print("SCENARIO 7: 10 correct logins in a row")
    print("=" * 60)

    data = setup_hospital_user(role="Admin")
    user = data["user"]
    print(f"Email : {user.email}")

    payload = {"email": user.email, "password": "easyPeasy1!"}

    for attempt in range(1, 11):
        response = client.post("/api/login", json=payload)
        response_data = response.json()

        print(f"\n  Login attempt {attempt}")
        print(f"  Status  : {response.status_code}")
        print(f"  Body    : {response.text}")

        assert response.status_code == 200, (
            f"Attempt {attempt} failed — got {response.status_code}"
        )
        assert response_data["email"] == user.email
        assert response_data["status"] == "OTP Sent"
        assert "user_id" in response_data

        print(f"  user_id : {response_data['user_id']}")
        print(f"  email   : {response_data['email']}")
        print(f"  status  : {response_data['status']}")

    print("\n✓ PASSED — All 10 logins returned 200 with OTP Sent")


# ══════════════════════════════════════════════════════════════════
# SCENARIO 8: 10 correct OTP verifications in a row
# Each verify → 200
#   body has: auth_token, email
# ══════════════════════════════════════════════════════════════════
def test_10_correct_otp_verifications(setup_hospital_user):
    print("\n" + "=" * 60)
    print("SCENARIO 8: 10 correct OTP verifications in a row")
    print("=" * 60)

    data = setup_hospital_user(role="Admin")
    user = data["user"]
    print(f"Email : {user.email}")

    login_payload = {"email": user.email, "password": "easyPeasy1!"}

    for attempt in range(1, 11):
        print(f"\n  ── Round {attempt} ──")

        # Fresh login each round — new user_id, new OTP triggered
        login_response = client.post("/api/login", json=login_payload)
        login_data = login_response.json()

        print(f"  Login status : {login_response.status_code}")
        print(f"  Login body   : {login_response.text}")

        assert login_response.status_code == 200, (
            f"Round {attempt} login failed — got {login_response.status_code}"
        )
        user_id = login_data["user_id"]
        print(f"  user_id      : {user_id}")

        # Verify with the fixed test OTP (must be configured in test env)
        otp_payload = {"user_id": user_id, "otp": "123456"}
        otp_response = client.post("/api/verify-otp", json=otp_payload)
        otp_data = otp_response.json()

        print(f"  OTP status   : {otp_response.status_code}")
        print(f"  OTP body     : {otp_response.text}")

        assert otp_response.status_code == 200, (
            f"Round {attempt} OTP verify failed — got {otp_response.status_code}"
        )
        assert "auth_token" in otp_data, (
            f"Round {attempt}: auth_token missing in response"
        )
        assert otp_data["email"] == user.email

        print(f"  auth_token   : {otp_data['auth_token'][:20]}...")
        print(f"  email        : {otp_data['email']}")

    print("\n✓ PASSED — All 10 OTP verifications succeeded")


# ══════════════════════════════════════════════════════════════════
# SCENARIO 9: Registration with invalid email
# Triggers: FastAPI 422 (Pydantic) or EmailAlreadyExistsException (409)
# ══════════════════════════════════════════════════════════════════
def test_register_with_invalid_email():
    print("\n" + "=" * 60)
    print("SCENARIO 9: User registration with invalid email")
    print("=" * 60)

    payload = {
        "email": "bademail@@invalid",
        "first_name": "Test",
        "last_name": "User",
        "password": "easyPeasy1!",
    }
    print(f"Email    : {payload['email']}")
    print(f"First Name : {payload['first_name']}")
    print(f"Last Name  : {payload['last_name']}")
    print(f"Password : {payload['password']}")

    response = client.post("/api/register", json=payload)
    response_data = response.json()

    print("\nREGISTRATION RESPONSE")
    print(f"Status : {response.status_code}")
    print(f"Body   : {response.text}")

    assert response.status_code == 422

    # 1. Assert against your specific registration error layout
    assert response_data["status"] == "Failed"
    assert response_data["error_code"] == get_error_code(
        "VALIDATION_INPUT_ERROR"
    )  # Maps to "ERR_2004"

    # 2. Use .get() safely so your print statement never crashes the test runner again
    print(f"\n error_code : {response_data.get('error_code')}")
    print(
        f"\n message    : {response_data.get('message', 'No message field provided')}"
    )

    print("\n✓ PASSED — Invalid email rejected at registration with ERR_2004")


# ══════════════════════════════════════════════════════════════════
# SCENARIO 10: Multiple attempts with the same invite link
# First use  → 200
# Reuse      → InvalidTokenException or TokenExpiredException (400/401)
#   body has: error_code in ("INVALID_TOKEN", "TOKEN_EXPIRED")
# ══════════════════════════════════════════════════════════════════


def test_multiple_uses_of_same_invite_link(setup_hospital_user):
    print("\n" + "=" * 60)
    print("SCENARIO 10: Multiple attempts with the same invite link")
    print("=" * 60)

    # Step 0 — Setup Admin user using your fixture
    data = setup_hospital_user(role="Admin")
    admin_user = data["user"]
    print(f"Admin email : {admin_user.email}")

    # Generate token directly using the verified 'user_id' field
    token_payload = {
        "sub": str(admin_user.user_id),
        "email": admin_user.email,
        "role": "Admin",
    }
    token = create_access_token(data=token_payload)
    headers = {"Authorization": f"Bearer {token}"}

    # Generate a pristine email address for this isolated test run
    unique_invited_email = f"invited_{uuid.uuid4().hex[:6]}@hospital.test"

    # Step 1 — Create the invite
    create_payload = {
        "email": unique_invited_email,
        "role": "User",
        "branch_name": "Main Branch",
    }
    CREATE_INVITE_URL = "/api/hospital/users/invite"
    create_response = client.post(
        CREATE_INVITE_URL, json=create_payload, headers=headers
    )

    print("\nSTEP 1: CREATE INVITE")
    print(f"Status : {create_response.status_code}")
    print(f"Body   : {create_response.text}")

    assert create_response.status_code == 200, (
        f"Failed to create invite — got {create_response.status_code}"
    )

    # Fetch the invite token directly from the DB
    db = data["db"]
    db.expire_all()
    from app.models.user_model import User as UserModel

    invited_user = (
        db.query(UserModel).filter(UserModel.email == unique_invited_email).first()
    )
    invite_token = invited_user.invite_token
    print(f"Invite token : {invite_token}")
    assert invite_token, "No invite_token found on invited user in DB"

    # Step 1.5 — Validate token is reachable via GET endpoint
    VALIDATE_URL = f"/api/invite/{invite_token}"
    validate_response = client.get(VALIDATE_URL)
    print(f"\nSTEP 1.5: VALIDATE TOKEN")
    print(f"Status : {validate_response.status_code}")
    print(f"Body   : {validate_response.text}")

    # Step 2 — Attempt to use the same token multiple times
    REGISTER_URL = "/api/register/invite"

    for attempt in range(1, 6):
        accept_payload = {
            "token": invite_token,
            "first_name": "Invited",
            "last_name": f"User {attempt}",
            "password": "easyPeasy1!",
            "confirm_password": "easyPeasy1!",
        }
        response = client.post(REGISTER_URL, json=accept_payload)

        print(f"\n  Attempt {attempt}")
        print(f"  Status : {response.status_code}")
        print(f"  Body   : {response.text}")

        if attempt == 1:
            assert response.status_code == 200, (
                f"First use should succeed, got {response.status_code}"
            )
            print("  → First use accepted ✓")
        else:
            assert response.status_code in (400, 401, 409), (
                f"Attempt {attempt} should be rejected, got {response.status_code}"
            )
            print("  → Reuse rejected ✓")

    print("\n✓ PASSED — Invite link enforced as single-use")


# ══════════════════════════════════════════════════════════════════
def test_email_injection_in_invite_link(setup_hospital_user):
    print("\n" + "=" * 60)
    print("SCENARIO 11: Email injection in invite link")
    print("=" * 60)

    # Setup admin user and auth headers
    data = setup_hospital_user(role="Admin")
    admin_user = data["user"]
    token_payload = {
        "sub": str(admin_user.user_id),
        "email": admin_user.email,
        "role": "Admin",
    }
    token = create_access_token(data=token_payload)
    headers = {"Authorization": f"Bearer {token}"}

    injection_payloads = [
        "victim@example.com\nBcc: attacker@evil.com",
        "victim@example.com%0ACc:attacker@evil.com",
        "victim@example.com\r\nX-Injected-Header: malicious",
        "attacker+<script>alert(1)</script>@evil.com",
        "' OR '1'='1",
        "admin@example.com; DROP TABLE users; --",
    ]

    for i, malicious_email in enumerate(injection_payloads, start=1):
        payload = {
            "email": malicious_email,
            "role": "User",
            "branch_name": "Main Branch",
        }
        print(f"\n  Injection attempt {i}")
        print(f"  Payload : {repr(malicious_email)}")
        response = client.post(
            "/api/hospital/users/invite", json=payload, headers=headers
        )
        response_data = response.json()
        print(f"  Status  : {response.status_code}")
        print(f"  Body    : {response.text}")

        assert response.status_code in (400, 422), (
            f"Attempt {i} NOT rejected! "
            f"Got {response.status_code} for {repr(malicious_email)}"
        )
        assert "detail" in response_data or response_data.get("status") in (
            "Failed",
            "Blocked",
        ), f"Attempt {i}: response body doesn't match either error shape"
        print(f"  → Rejected ✓")

    print("\n✓ PASSED — All injection payloads rejected")
