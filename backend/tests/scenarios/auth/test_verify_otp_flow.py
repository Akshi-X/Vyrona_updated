from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_complete_auth_flow():

    print("\n" + "=" * 60)
    print("STEP 1: LOGIN REQUEST")

    login_payload = {
        "email": "nishaanth@mygrape.org",
        "password": "easyPeasy1!"
    }

    login_response = client.post(
        "/api/login",
        json=login_payload
    )

    print(f"LOGIN STATUS: {login_response.status_code}")
    print(f"LOGIN BODY: {login_response.text}")

    assert login_response.status_code == 200

    login_data = login_response.json()

    # Extract dynamic user_id from login response
    user_id = login_data["user_id"]

    print(f"\nExtracted USER ID: {user_id}")

    print("\nSTEP 2: VERIFY OTP REQUEST")

    otp_payload = {
        "user_id": user_id,
        "otp": "123456"
    }

    verify_response = client.post(
        "/api/verify-otp",
        json=otp_payload
    )

    print(f"VERIFY STATUS: {verify_response.status_code}")
    print(f"VERIFY BODY: {verify_response.text}")

    assert verify_response.status_code == 200

    verify_data = verify_response.json()

    assert "auth_token" in verify_data
    assert verify_data["email"] == "nishaanth@mygrape.org"

    print("=" * 60)