from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_login_flow(setup_hospital_user):

    # CREATE TEST USER
    data = setup_hospital_user(role="Admin")

    user = data["user"]

    print("\n" + "=" * 60)
    print("TEST USER CREATED")
    print(f"Email: {user.email}")
    print("=" * 60)

    payload = {
        "email": user.email,
        "password": "Scuba123!"
    }

    response = client.post(
        "/api/login",
        json=payload
    )

    print("\nLOGIN RESPONSE")
    print(response.text)

    response_data = response.json()

    assert response.status_code == 200
    assert response_data["email"] == user.email
    assert response_data["status"] == "OTP Sent"