import pytest
import datetime
import uuid
import json
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

from app.main import app
from app.auth.auth import create_access_token
from app.models.user_model import User
from app.models.feedback_model import Feedback
from app.models.feedback_attachment import FeedbackAttachment
from app.models.feedback_comments import Comment
from app.constants.enums import FeedbackDepartment, FeedbackType, FeedbackPriority, AffectedModule, FeedbackStatus
from app.constants.messages import SuccessMessages
from app.constants.error_codes import ERROR_CODES

client = TestClient(app)


@pytest.fixture(scope="class")
def setup_mygrape_admin():
    """Fixture to ensure a Mygrape_admin user exists in the DB for the duration of the test."""
    from app.config.database import SessionLocal
    db = SessionLocal()

    # Deactivate other active MyGrape admin users so get_mygrape_admin_email() returns this specific test admin
    other_admins = db.query(User).filter(
        User.role == "Mygrape_admin",
        User.email != "mygrapeadmin@example.com",
        User.status == True
    ).all()
    for other in other_admins:
        other.status = False
    db.commit()

    admin_user = User(
        user_id=str(uuid.uuid4()),
        email="mygrapeadmin@example.com",
        password_hash="dummy_hash",
        first_name="System",
        last_name="Admin",
        role="Mygrape_admin",
        approved_status="approved",
        status=True
    )
    db.add(admin_user)
    db.commit()
    db.refresh(admin_user)

    yield admin_user

    # Tear down
    db.delete(admin_user)
    
    # Restore other deactivated admins
    for other in other_admins:
        db_admin = db.query(User).filter(User.user_id == other.user_id).first()
        if db_admin:
            db_admin.status = True
    db.commit()
    db.close()





def get_auth_headers(user):
    """Helper to generate JWT token and headers for a user."""
    token_data = {
        "sub": str(user.user_id),
        "id": str(user.user_id),
        "user_id": str(user.user_id),
        "email": user.email,
        "role": user.role if isinstance(user.role, str) else user.role.value,
        "user_role": user.role if isinstance(user.role, str) else user.role.value,
        "type": "hospital_user",
        "user_type": "hospital_user",
        "hospital_id": user.hospital_id,
        "branch_id": user.branch_id,
        "department": user.department,
        "token_type": "access",
        "identity": str(user.user_id),
        "exp": datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=1),
        "iat": datetime.datetime.now(datetime.timezone.utc),
    }
    token = create_access_token(data=token_data)
    return {"Authorization": f"Bearer {token}"}


class TestProfileCoreUpdates:
    """Test suite validating standard profile retrieve and update operations,
    including authentication and authorization controls.
    """

    def test_get_profile_success(self, setup_hospital_user):
        """Verify successful retrieval of the user profile.

        Arrange: Create a hospital user and set a phone number in the DB.
        Act: Request GET /api/profile using the user's auth token.
        Assert: Response is 200 and matches DB values.
        """
        context = setup_hospital_user(role="Admin")
        user = context["user"]
        db = context["db"]

        # Update phone number directly in DB first
        user.phone_number = "+1234567890"
        db.commit()
        db.refresh(user)

        headers = get_auth_headers(user)

        response = client.get("/api/profile", headers=headers)

        assert response.status_code == 200
        res_data = response.json()
        assert res_data["user_id"] == user.user_id
        assert res_data["email"] == user.email
        assert res_data["first_name"] == user.first_name
        assert res_data["last_name"] == user.last_name
        assert res_data["phone_number"] == "+1234567890"

    def test_update_profile_name(self, setup_hospital_user):
        """Verify updating first name and last name.

        Arrange: Create a hospital user.
        Act: Send PATCH /api/user/{user_id} with new name values.
        Assert: API returns 200, response contains updated values, and DB is updated.
        """
        context = setup_hospital_user(role="User")
        user = context["user"]
        db = context["db"]
        headers = get_auth_headers(user)

        payload = {
            "first_name": "Updatedfirst",
            "last_name": "Updatedlast"
        }

        response = client.patch(f"/api/user/{user.user_id}", json=payload, headers=headers)

        assert response.status_code == 200
        res_data = response.json()
        assert res_data["message"] == SuccessMessages.PROFILE_UPDATED
        assert res_data["first_name"] == "Updatedfirst"
        assert res_data["last_name"] == "Updatedlast"
        assert res_data["phone_number"] is None

        # Check DB
        db.expire_all()
        db_user = db.query(User).filter(User.user_id == user.user_id).first()
        assert db_user.first_name == "Updatedfirst"
        assert db_user.last_name == "Updatedlast"

    def test_add_mobile_number(self, setup_hospital_user):
        """Verify addition of a new mobile number.

        Arrange: Create a hospital user without a phone number.
        Act: Send PATCH /api/user/{user_id} with a valid phone number.
        Assert: Response returns 200 and phone number, and DB matches.
        """
        context = setup_hospital_user(role="User")
        user = context["user"]
        db = context["db"]
        headers = get_auth_headers(user)

        assert user.phone_number is None

        payload = {
            "first_name": "Test",
            "last_name": "User",
            "phone_number": "+9876543210"
        }

        response = client.patch(f"/api/user/{user.user_id}", json=payload, headers=headers)

        assert response.status_code == 200
        res_data = response.json()
        assert res_data["phone_number"] == "+9876543210"

        # Check DB
        db.expire_all()
        db_user = db.query(User).filter(User.user_id == user.user_id).first()
        assert db_user.phone_number == "+9876543210"

    def test_update_mobile_number(self, setup_hospital_user):
        """Verify update/change of an existing mobile number.

        Arrange: Create a hospital user with a phone number.
        Act: Send PATCH /api/user/{user_id} with a new phone number.
        Assert: Response returns 200, contains updated phone number, and DB matches.
        """
        context = setup_hospital_user(role="User")
        user = context["user"]
        db = context["db"]

        user.phone_number = "+9876543210"
        db.commit()
        db.refresh(user)

        headers = get_auth_headers(user)

        payload = {
            "first_name": "Test",
            "last_name": "User",
            "phone_number": "+1122334455"
        }

        response = client.patch(f"/api/user/{user.user_id}", json=payload, headers=headers)

        assert response.status_code == 200
        res_data = response.json()
        assert res_data["phone_number"] == "+1122334455"

        # Check DB
        db.expire_all()
        db_user = db.query(User).filter(User.user_id == user.user_id).first()
        assert db_user.phone_number == "+1122334455"

    def test_update_profile_empty_phone_no_op(self, setup_hospital_user):
        """Verify that passing an empty string for phone_number is normalized to None and acts as a no-op.

        Arrange: Create a hospital user with a phone number.
        Act: Send PATCH /api/user/{user_id} with phone_number = "".
        Assert: Response status is 200, and DB phone_number remains unchanged.
        """
        context = setup_hospital_user(role="User")
        user = context["user"]
        db = context["db"]

        user.phone_number = "+1234567890"
        db.commit()
        db.refresh(user)

        headers = get_auth_headers(user)

        payload = {
            "first_name": "Test",
            "last_name": "User",
            "phone_number": ""
        }

        response = client.patch(f"/api/user/{user.user_id}", json=payload, headers=headers)

        assert response.status_code == 200
        # Since "" was normalized to None, and the service ignores None values, it remains unchanged.
        db.expire_all()
        db_user = db.query(User).filter(User.user_id == user.user_id).first()
        assert db_user.phone_number == "+1234567890"

    def test_get_profile_unauthenticated(self):
        """Verify that retrieving the profile without authorization headers is rejected.

        Arrange: Use the client with no credentials.
        Act: Send GET /api/profile.
        Assert: Response status is 401 (Unauthorized).
        """
        response = client.get("/api/profile")
        assert response.status_code == 401

    def test_update_profile_unauthenticated(self, setup_hospital_user):
        """Verify that updating the profile without authorization headers is rejected.

        Arrange: Create a hospital user.
        Act: Send PATCH /api/user/{user_id} with no headers.
        Assert: Response status is 401 (Unauthorized).
        """
        context = setup_hospital_user(role="User")
        user = context["user"]

        payload = {
            "first_name": "Newname",
            "last_name": "User"
        }

        response = client.patch(f"/api/user/{user.user_id}", json=payload)
        assert response.status_code == 401

    def test_update_profile_unauthorized(self, setup_hospital_user):
        """Verify that a user cannot update another user's profile.

        Arrange: Create two hospital users (user_A and user_B).
        Act: Send PATCH /api/user/{user_id_B} using user A's auth headers.
        Assert: Response status is 403 (Forbidden), and user B's profile is not updated.
        """
        context_a = setup_hospital_user(role="User")
        user_a = context_a["user"]

        context_b = setup_hospital_user(role="User")
        user_b = context_b["user"]
        db_b = context_b["db"]

        headers_a = get_auth_headers(user_a)

        payload = {
            "first_name": "Hackedfirst",
            "last_name": "Hackedlast"
        }

        response = client.patch(f"/api/user/{user_b.user_id}", json=payload, headers=headers_a)

        assert response.status_code == 403
        # Check user B's DB record to confirm it wasn't modified
        db_b.expire_all()
        db_user_b = db_b.query(User).filter(User.user_id == user_b.user_id).first()
        assert db_user_b.first_name == "Test"
        assert db_user_b.last_name == "User"

    def test_update_profile_nonexistent_user(self, setup_hospital_user):
        """Verify that updating a profile for a non-existent user returns 404.

        Arrange: Create a hospital user.
        Act: Send PATCH /api/user/{random_uuid} with that user's auth token.
        Assert: Response status is 404 (Not Found).
        """
        context = setup_hospital_user(role="User")
        user = context["user"]
        headers = get_auth_headers(user)

        random_uuid = str(uuid.uuid4())

        payload = {
            "first_name": "Test",
            "last_name": "User"
        }

        response = client.patch(f"/api/user/{random_uuid}", json=payload, headers=headers)

        assert response.status_code == 404


class TestProfileValidationAndSecurity:
    """Test suite validating profile field constraint checks, format validations,
    and security enforcement (SQL Injection, XSS, Command Injection, safe symbols).
    """

    def test_update_profile_invalid_phone_number(self, setup_hospital_user):
        """Verify that invalid phone numbers are rejected.

        Arrange: Create a hospital user.
        Act: Send PATCH /api/user/{user_id} with an invalid phone format.
        Assert: Response status is 422, error lists phone_number, and DB remains unchanged.
        """
        context = setup_hospital_user(role="User")
        user = context["user"]
        db = context["db"]
        headers = get_auth_headers(user)

        payload = {
            "first_name": "Test",
            "last_name": "User",
            "phone_number": "not-a-valid-phone"
        }

        response = client.patch(f"/api/user/{user.user_id}", json=payload, headers=headers)

        assert response.status_code == 422
        # Check DB to confirm nothing changed
        db.expire_all()
        db_user = db.query(User).filter(User.user_id == user.user_id).first()
        assert db_user.phone_number is None

    def test_update_profile_invalid_name(self, setup_hospital_user):
        """Verify that invalid names (too short or empty) are rejected.

        Arrange: Create a hospital user.
        Act: Send PATCH /api/user/{user_id} with a too short first name.
        Assert: Response status is 422, and DB remains unchanged.
        """
        context = setup_hospital_user(role="User")
        user = context["user"]
        db = context["db"]
        headers = get_auth_headers(user)

        payload = {
            "first_name": "A",  # Too short (minimum 2 chars)
            "last_name": "User"
        }

        response = client.patch(f"/api/user/{user.user_id}", json=payload, headers=headers)

        assert response.status_code == 422
        # Check DB to confirm nothing changed
        db.expire_all()
        db_user = db.query(User).filter(User.user_id == user.user_id).first()
        assert db_user.first_name == "Test"

    def test_update_profile_name_too_long(self, setup_hospital_user):
        """Verify that first_name exceeding 50 characters is rejected.

        Arrange: Create a hospital user.
        Act: Send PATCH /api/user/{user_id} with first_name having 51 characters.
        Assert: Response status is 422, and DB remains unchanged.
        """
        context = setup_hospital_user(role="User")
        user = context["user"]
        db = context["db"]
        headers = get_auth_headers(user)

        payload = {
            "first_name": "A" * 51,
            "last_name": "User"
        }

        response = client.patch(f"/api/user/{user.user_id}", json=payload, headers=headers)

        assert response.status_code == 422
        db.expire_all()
        db_user = db.query(User).filter(User.user_id == user.user_id).first()
        assert db_user.first_name == "Test"

    def test_update_profile_name_whitespace(self, setup_hospital_user):
        """Verify that first_name containing only whitespace is rejected.

        Arrange: Create a hospital user.
        Act: Send PATCH /api/user/{user_id} with first_name containing only spaces.
        Assert: Response status is 422, and DB remains unchanged.
        """
        context = setup_hospital_user(role="User")
        user = context["user"]
        db = context["db"]
        headers = get_auth_headers(user)

        payload = {
            "first_name": "   ",
            "last_name": "User"
        }

        response = client.patch(f"/api/user/{user.user_id}", json=payload, headers=headers)

        assert response.status_code == 422
        db.expire_all()
        db_user = db.query(User).filter(User.user_id == user.user_id).first()
        assert db_user.first_name == "Test"

    def test_update_profile_missing_required_fields(self, setup_hospital_user):
        """Verify that missing required name fields in PATCH payload is rejected.

        Arrange: Create a hospital user.
        Act: Send PATCH /api/user/{user_id} with payload missing first_name and last_name.
        Assert: Response status is 422, and DB remains unchanged.
        """
        context = setup_hospital_user(role="User")
        user = context["user"]
        db = context["db"]
        headers = get_auth_headers(user)

        payload = {
            "phone_number": "+1234567890"
        }

        response = client.patch(f"/api/user/{user.user_id}", json=payload, headers=headers)

        assert response.status_code == 422
        db.expire_all()
        db_user = db.query(User).filter(User.user_id == user.user_id).first()
        assert db_user.first_name == "Test"
        assert db_user.phone_number is None

    def test_update_profile_sql_injection_blocked(self, setup_hospital_user):
        """Verify that SQL Injection payloads are blocked by the SanitizationMiddleware.

        Arrange: Create a hospital user.
        Act: Send PATCH /api/user/{user_id} with a malicious SQL injection payload.
        Assert: API blocks request at middleware level, returning 400 Bad Request, and DB is not modified.
        """
        context = setup_hospital_user(role="User")
        user = context["user"]
        db = context["db"]
        headers = get_auth_headers(user)

        sql_injection_payload = "Robert'); DROP TABLE Users;--"

        payload = {
            "first_name": sql_injection_payload,
            "last_name": "User"
        }

        response = client.patch(f"/api/user/{user.user_id}", json=payload, headers=headers)

        assert response.status_code == 400
        res_data = response.json()
        assert res_data["error_code"] == ERROR_CODES["SECURITY_MALICIOUS_CONTENT"]
        assert res_data["status"] == "Blocked"

        # Check DB to confirm nothing changed
        db.expire_all()
        db_user = db.query(User).filter(User.user_id == user.user_id).first()
        assert db_user.first_name == "Test"

    def test_update_profile_xss_blocked(self, setup_hospital_user):
        """Verify that XSS payloads are caught and blocked by SanitizationMiddleware.

        Arrange: Create a hospital user.
        Act: Send PATCH /api/user/{user_id} with a name field containing HTML script tag.
        Assert: Response status is 400 (Bad Request), error code is SECURITY_MALICIOUS_CONTENT, and DB remains unchanged.
        """
        context = setup_hospital_user(role="User")
        user = context["user"]
        db = context["db"]
        headers = get_auth_headers(user)

        payload = {
            "first_name": "<script>alert('xss')</script>",
            "last_name": "User"
        }

        response = client.patch(f"/api/user/{user.user_id}", json=payload, headers=headers)

        assert response.status_code == 400
        res_data = response.json()
        assert res_data["error_code"] == ERROR_CODES["SECURITY_MALICIOUS_CONTENT"]
        assert res_data["status"] == "Blocked"

        # Verify DB remained unaffected
        db.expire_all()
        db_user = db.query(User).filter(User.user_id == user.user_id).first()
        assert db_user.first_name == "Test"

    def test_update_profile_command_injection_blocked(self, setup_hospital_user):
        """Verify that Command Injection patterns are blocked by SanitizationMiddleware.

        Arrange: Create a hospital user.
        Act: Send PATCH /api/user/{user_id} with a name containing a shell injection string.
        Assert: Response status is 400 (Bad Request), error code is SECURITY_MALICIOUS_CONTENT, and DB remains unchanged.
        """
        context = setup_hospital_user(role="User")
        user = context["user"]
        db = context["db"]
        headers = get_auth_headers(user)

        payload = {
            "first_name": "; rm -rf /",
            "last_name": "User"
        }

        response = client.patch(f"/api/user/{user.user_id}", json=payload, headers=headers)

        assert response.status_code == 400
        res_data = response.json()
        assert res_data["error_code"] == ERROR_CODES["SECURITY_MALICIOUS_CONTENT"]
        assert res_data["status"] == "Blocked"

        # Verify DB remained unaffected
        db.expire_all()
        db_user = db.query(User).filter(User.user_id == user.user_id).first()
        assert db_user.first_name == "Test"

    def test_update_profile_special_characters_allowed(self, setup_hospital_user):
        """Verify that safe symbols and punctuation (not matching malicious threat patterns) are allowed.

        Arrange: Create a hospital user.
        Act: Send PATCH /api/user/{user_id} with name fields containing non-alphanumeric chars like apostrophes and hyphens.
        Assert: Response status is 200, names are updated successfully, and DB matches literally.
        """
        context = setup_hospital_user(role="User")
        user = context["user"]
        db = context["db"]
        headers = get_auth_headers(user)

        safe_first = "O'Connor-Smith"
        safe_last = "Jean-Luc & Co."

        payload = {
            "first_name": safe_first,
            "last_name": safe_last
        }

        response = client.patch(f"/api/user/{user.user_id}", json=payload, headers=headers)

        assert response.status_code == 200
        res_data = response.json()
        assert res_data["first_name"] == safe_first
        assert res_data["last_name"] == safe_last

        # Check DB
        db.expire_all()
        db_user = db.query(User).filter(User.user_id == user.user_id).first()
        assert db_user.first_name == safe_first
        assert db_user.last_name == safe_last


class TestSupportTicketCreation:
    """Test suite validating support ticket creation endpoints,
    associated business validations, file attachments, and email triggers.
    """

    @patch("app.service.feedback_service.send_feedback_new_ticket_email")
    def test_create_ticket_success_without_attachments(self, mock_send_email, setup_mygrape_admin, setup_hospital_user):
        """Verify successful support ticket creation without attachments.

        Arrange: Create a hospital user, mock active MyGrape admin email, and prepare valid ticket fields.
        Act: Send POST /api/feedback/create with JSON data in 'request' field.
        Assert: Response is 200, ticket exists in DB, and email trigger is generated.
        """
        context = setup_hospital_user(role="User")
        user = context["user"]
        db = context["db"]
        headers = get_auth_headers(user)

        ticket_payload = {
            "department": FeedbackDepartment.LOGISTICS.value,
            "feedback_type": FeedbackType.BUG.value,
            "subject": "System login latency issue",
            "description": "Unable to log in due to high latency on landing screen",
            "priority": FeedbackPriority.HIGH.value,
            "affected_modules": [AffectedModule.SIGN_IN.value],
            "send_email": True
        }

        form_data = {
            "request": json.dumps(ticket_payload)
        }

        try:
            response = client.post("/api/feedback/create", data=form_data, headers=headers)

            assert response.status_code == 200
            res_data = response.json()
            assert res_data["message"] == "Feedback ticket created successfully"
            assert "ticket_id" in res_data
            ticket_id = res_data["ticket_id"]

            # Verify in DB
            db.expire_all()
            db_ticket = db.query(Feedback).filter(Feedback.ticket_id == ticket_id).first()
            assert db_ticket is not None
            assert db_ticket.subject == "System login latency issue"
            assert db_ticket.description == "Unable to log in due to high latency on landing screen"
            assert db_ticket.status == FeedbackStatus.OPEN
            assert db_ticket.submitted_by == user.user_id

            # Verify Email Trigger
            mock_send_email.assert_called_once()
            args, kwargs = mock_send_email.call_args
            assert kwargs.get("ticket_id") == ticket_id
            assert kwargs.get("subject") == "System login latency issue"
            assert kwargs.get("send_to_user") is True
            assert kwargs.get("submitted_by_email") == user.email
            assert kwargs.get("mygrape_admin_email") == "mygrapeadmin@example.com"

        finally:
            # Clean up
            db.query(Feedback).filter(Feedback.submitted_by == user.user_id).delete()
            db.commit()

    @patch("app.service.feedback_service.send_feedback_new_ticket_email")
    def test_create_ticket_success_with_attachments(self, mock_send_email, setup_mygrape_admin, setup_hospital_user):
        """Verify successful support ticket creation with a file attachment.

        Arrange: Create a hospital user, mock active MyGrape admin email, and prepare valid ticket fields and mock upload file.
        Act: Send POST /api/feedback/create with JSON data in 'request' and mock file in 'attachments'.
        Assert: Response is 200, ticket and attachment exist in DB, and email is triggered.
        """
        context = setup_hospital_user(role="User")
        user = context["user"]
        db = context["db"]
        headers = get_auth_headers(user)

        ticket_payload = {
            "department": FeedbackDepartment.COMPLIANCE.value,
            "feedback_type": FeedbackType.COMPLIANCE_CONCERN.value,
            "subject": "Compliance report mismatch",
            "description": "The PDF attachment shows mismatch in temperature statistics",
            "priority": FeedbackPriority.CRITICAL.value,
            "affected_modules": [AffectedModule.ALERT_CONFIGURATION.value],
            "send_email": True
        }

        form_data = {
            "request": json.dumps(ticket_payload)
        }

        # Mock PDF file upload
        files = [
            ("attachments", ("test_compliance.pdf", b"%PDF-mock-data%", "application/pdf"))
        ]

        try:
            response = client.post("/api/feedback/create", data=form_data, files=files, headers=headers)

            assert response.status_code == 200
            res_data = response.json()
            assert "ticket_id" in res_data
            ticket_id = res_data["ticket_id"]

            # Verify ticket & attachment in DB
            db.expire_all()
            db_ticket = db.query(Feedback).filter(Feedback.ticket_id == ticket_id).first()
            assert db_ticket is not None
            assert len(db_ticket.attachments) == 1
            
            db_attachment = db_ticket.attachments[0]
            assert db_attachment.original_filename == "test_compliance.pdf"
            assert db_attachment.mime_type == "application/pdf"
            assert db_attachment.file_path.startswith("base64_attachment:")

            # Verify Email Trigger
            mock_send_email.assert_called_once()
            args, kwargs = mock_send_email.call_args
            assert kwargs.get("ticket_id") == ticket_id
            assert kwargs.get("send_to_user") is True
            assert kwargs.get("mygrape_admin_email") == "mygrapeadmin@example.com"

        finally:
            # Clean up
            db.query(Feedback).filter(Feedback.submitted_by == user.user_id).delete()
            db.commit()

    @patch("app.service.feedback_service.send_feedback_new_ticket_email")
    def test_create_ticket_email_not_sent_to_user(self, mock_send_email, setup_mygrape_admin, setup_hospital_user):
        """Verify ticket creation with send_email=False triggers email with send_to_user=False.

        Arrange: Create a hospital user, mock active MyGrape admin email, and prepare valid ticket fields with send_email=False.
        Act: Send POST /api/feedback/create.
        Assert: Response is 200, and email trigger kwargs has send_to_user=False.
        """
        context = setup_hospital_user(role="User")
        user = context["user"]
        db = context["db"]
        headers = get_auth_headers(user)

        ticket_payload = {
            "department": FeedbackDepartment.OTHER.value,
            "feedback_type": FeedbackType.OTHER.value,
            "subject": "Minor styling improvements",
            "description": "The font alignment in the navigation bar has slight offset",
            "priority": FeedbackPriority.LOW.value,
            "affected_modules": [AffectedModule.DASHBOARD.value],
            "send_email": False
        }

        form_data = {
            "request": json.dumps(ticket_payload)
        }

        try:
            response = client.post("/api/feedback/create", data=form_data, headers=headers)

            assert response.status_code == 200
            res_data = response.json()
            ticket_id = res_data["ticket_id"]

            # Verify email trigger
            mock_send_email.assert_called_once()
            args, kwargs = mock_send_email.call_args
            assert kwargs.get("ticket_id") == ticket_id
            assert kwargs.get("send_to_user") is False
            assert kwargs.get("mygrape_admin_email") == "mygrapeadmin@example.com"

        finally:
            # Clean up
            db.query(Feedback).filter(Feedback.submitted_by == user.user_id).delete()
            db.commit()

    @patch("app.service.feedback_service.send_feedback_status_update_email")
    def test_update_ticket_status(self, mock_send_email, setup_mygrape_admin, setup_hospital_user):
        """Verify that updating a ticket status inserts a system-generated comment and triggers email.

        Arrange: Create a hospital user and insert a feedback ticket in the database.
        Act: Send PATCH /api/feedback/{feedback_id}/status to update status to IN_PROGRESS.
        Assert: Response is 200, status in DB is IN_PROGRESS, a system comment is added, and email is sent.
        """
        context = setup_hospital_user(role="User")
        user = context["user"]
        db = context["db"]
        headers = get_auth_headers(user)

        # Create ticket in DB
        ticket = Feedback(
            ticket_id="TK-TEST-STATUS-101",
            department=FeedbackDepartment.LOGISTICS,
            feedback_type=FeedbackType.BUG,
            subject=f"Status update subject {uuid.uuid4()}",
            description="Status update description long enough",
            priority=FeedbackPriority.HIGH,
            affected_modules="sign_in",
            submitted_by=user.user_id,
            status=FeedbackStatus.OPEN
        )
        db.add(ticket)
        db.commit()
        db.refresh(ticket)

        status_payload = {
            "status": FeedbackStatus.IN_PROGRESS.value
        }

        try:
            response = client.patch(f"/api/feedback/{ticket.ticket_id}/status", json=status_payload, headers=headers)

            assert response.status_code == 200
            res_data = response.json()
            assert res_data["message"] == "Feedback status updated successfully"

            # Check DB
            db.expire_all()
            db_ticket = db.query(Feedback).filter(Feedback.ticket_id == ticket.ticket_id).first()
            assert db_ticket.status == FeedbackStatus.IN_PROGRESS

            # Check system comment
            comments = db.query(Comment).filter(Comment.ticket_id == ticket.ticket_id).all()
            assert len(comments) == 1
            assert "updated the status to In Progress" in comments[0].comment

            # Check Email Notification
            mock_send_email.assert_called_once()
            args, kwargs = mock_send_email.call_args
            assert kwargs.get("ticket_id") == ticket.ticket_id
            assert kwargs.get("new_status") == FeedbackStatus.IN_PROGRESS.value
            assert kwargs.get("old_status") == FeedbackStatus.OPEN.value
            assert kwargs.get("mygrape_admin_email") == "mygrapeadmin@example.com"

        finally:
            # Clean up
            db.query(Comment).filter(Comment.ticket_id == "TK-TEST-STATUS-101").delete()
            db.query(Feedback).filter(Feedback.submitted_by == user.user_id).delete()
            db.commit()

    @patch("app.service.feedback_service.send_feedback_new_comment_email")
    def test_add_valid_comment(self, mock_send_email, setup_mygrape_admin, setup_hospital_user):
        """Verify adding a valid comment to an active ticket queues background task.

        Arrange: Create a hospital user and insert a feedback ticket in the database.
        Act: Send POST /api/feedback/{feedback_id}/comments with valid comment payload.
        Assert: Response is 200, comment exists in DB, and email is triggered.
        """
        context = setup_hospital_user(role="User")
        user = context["user"]
        db = context["db"]
        headers = get_auth_headers(user)

        # Create ticket in DB
        ticket = Feedback(
            ticket_id="TK-TEST-COMMENT-102",
            department=FeedbackDepartment.LOGISTICS,
            feedback_type=FeedbackType.BUG,
            subject=f"Comment ticket subject {uuid.uuid4()}",
            description="Comment ticket description long enough",
            priority=FeedbackPriority.HIGH,
            affected_modules="sign_in",
            submitted_by=user.user_id,
            status=FeedbackStatus.OPEN
        )
        db.add(ticket)
        db.commit()
        db.refresh(ticket)

        comment_payload = {
            "comment": "This is a valid test comment on the ticket.",
            "send_email": True
        }

        try:
            response = client.post(f"/api/feedback/{ticket.ticket_id}/comments", json=comment_payload, headers=headers)

            assert response.status_code == 200
            res_data = response.json()
            assert res_data["message"] == "Comment added successfully"
            comment_id = res_data["comment_id"]

            # Check DB
            db.expire_all()
            db_comment = db.query(Comment).filter(Comment.id == comment_id).first()
            assert db_comment is not None
            assert db_comment.comment == "This is a valid test comment on the ticket."
            assert db_comment.commented_by == user.user_id

            # Check Email Notification
            mock_send_email.assert_called_once()
            args, kwargs = mock_send_email.call_args
            assert kwargs.get("ticket_id") == ticket.ticket_id
            assert kwargs.get("comment") == "This is a valid test comment on the ticket."
            assert kwargs.get("mygrape_admin_email") == "mygrapeadmin@example.com"

        finally:
            # Clean up
            db.query(Comment).filter(Comment.ticket_id == "TK-TEST-COMMENT-102").delete()
            db.query(Feedback).filter(Feedback.submitted_by == user.user_id).delete()
            db.commit()

    def test_get_feedback_comments(self, setup_hospital_user):
        """Verify retrieving all comments for a specific feedback ticket in correct order.

        Arrange: Create a hospital user, a ticket, and two comments in the database.
        Act: Send GET /api/feedback/{feedback_id}/comments.
        Assert: Response is 200, containing all comments in chronological order.
        """
        context = setup_hospital_user(role="User")
        user = context["user"]
        db = context["db"]
        headers = get_auth_headers(user)

        # Create ticket in DB
        ticket = Feedback(
            ticket_id="TK-TEST-GET-COMMENTS-103",
            department=FeedbackDepartment.LOGISTICS,
            feedback_type=FeedbackType.BUG,
            subject=f"Get comments subject {uuid.uuid4()}",
            description="Get comments description long enough",
            priority=FeedbackPriority.HIGH,
            affected_modules="sign_in",
            submitted_by=user.user_id,
            status=FeedbackStatus.OPEN
        )
        db.add(ticket)
        db.commit()
        db.refresh(ticket)

        # Create comments in DB
        comment1 = Comment(
            ticket_id=ticket.ticket_id,
            comment="First comment on this ticket",
            commented_by=user.user_id
        )
        comment2 = Comment(
            ticket_id=ticket.ticket_id,
            comment="Second comment on this ticket",
            commented_by=user.user_id
        )
        db.add(comment1)
        db.add(comment2)
        db.commit()

        try:
            response = client.get(f"/api/feedback/{ticket.ticket_id}/comments", headers=headers)

            assert response.status_code == 200
            res_data = response.json()
            assert len(res_data) == 2
            assert res_data[0]["comment"] == "First comment on this ticket"
            assert res_data[1]["comment"] == "Second comment on this ticket"

        finally:
            # Clean up
            db.query(Comment).filter(Comment.ticket_id == "TK-TEST-GET-COMMENTS-103").delete()
            db.query(Feedback).filter(Feedback.submitted_by == user.user_id).delete()
            db.commit()

    def test_download_feedback_attachment(self, setup_hospital_user):
        """Verify downloading/retrieving feedback attachment content successfully.

        Arrange: Create a hospital user, a ticket, and an attachment record in the DB.
        Act: Send GET /api/feedback/{ticket_id}/attachments/{attachment_id}/test_download.txt.
        Assert: Response is 200, matches the content type, and the streamed body matches original bytes.
        """
        import base64
        context = setup_hospital_user(role="User")
        user = context["user"]
        db = context["db"]
        headers = get_auth_headers(user)

        # Create ticket in DB
        ticket = Feedback(
            ticket_id="TK-TEST-ATTACH-104",
            department=FeedbackDepartment.LOGISTICS,
            feedback_type=FeedbackType.BUG,
            subject=f"Attachment test subject {uuid.uuid4()}",
            description="Attachment test description long enough",
            priority=FeedbackPriority.HIGH,
            affected_modules="sign_in",
            submitted_by=user.user_id,
            status=FeedbackStatus.OPEN
        )
        db.add(ticket)
        db.commit()
        db.refresh(ticket)

        # Create attachment in DB
        original_data = b"Hello, this is a test file content!"
        encoded_data = base64.b64encode(original_data).decode("utf-8")
        payload = {
            "stored_filename": "test_download.txt",
            "mime_type": "text/plain",
            "data": encoded_data
        }
        file_path_value = f"base64_attachment:{json.dumps(payload)}"

        attachment = FeedbackAttachment(
            ticket_id=ticket.ticket_id,
            original_filename="test_download.txt",
            stored_filename="test_download.txt",
            file_path=file_path_value,
            file_size=len(original_data),
            mime_type="text/plain",
            uploaded_by=user.user_id
        )
        db.add(attachment)
        db.commit()
        db.refresh(attachment)

        try:
            response = client.get(
                f"/api/feedback/{ticket.ticket_id}/attachments/{attachment.id}/test_download.txt",
                headers=headers
            )

            assert response.status_code == 200
            assert response.content == original_data
            assert "text/plain" in response.headers["content-type"]

        finally:
            # Clean up
            db.query(FeedbackAttachment).filter(FeedbackAttachment.ticket_id == "TK-TEST-ATTACH-104").delete()
            db.query(Feedback).filter(Feedback.submitted_by == user.user_id).delete()
            db.commit()


class TestSupportTicketValidationAndSecurity:
    """Test suite validating input validations, constraints, authentication,
    and malicious injection blocks for the support ticket / feedback system.
    """

    def test_create_ticket_subject_too_short(self, setup_hospital_user):
        """Verify ticket creation fails when the subject is too short (< 5 characters).

        Arrange: Create a hospital user.
        Act: Send POST /api/feedback/create with subject too short.
        Assert: API returns 500 Internal Server Error, and no DB record is created.
        """
        context = setup_hospital_user(role="User")
        user = context["user"]
        db = context["db"]
        headers = get_auth_headers(user)

        payload_short_subject = {
            "department": FeedbackDepartment.LOGISTICS.value,
            "feedback_type": FeedbackType.BUG.value,
            "subject": "Fail",
            "description": "Valid description that is long enough.",
            "priority": FeedbackPriority.HIGH.value,
            "affected_modules": [AffectedModule.DASHBOARD.value]
        }
        response = client.post("/api/feedback/create", data={"request": json.dumps(payload_short_subject)}, headers=headers)
        assert response.status_code == 500

        # Confirm nothing saved in DB
        db.expire_all()
        db_tickets = db.query(Feedback).filter(Feedback.submitted_by == user.user_id).all()
        assert len(db_tickets) == 0

    def test_create_ticket_description_too_short(self, setup_hospital_user):
        """Verify ticket creation fails when the description is too short (< 10 characters).

        Arrange: Create a hospital user.
        Act: Send POST /api/feedback/create with description too short.
        Assert: API returns 500 Internal Server Error, and no DB record is created.
        """
        context = setup_hospital_user(role="User")
        user = context["user"]
        db = context["db"]
        headers = get_auth_headers(user)

        payload_short_desc = {
            "department": FeedbackDepartment.LOGISTICS.value,
            "feedback_type": FeedbackType.BUG.value,
            "subject": "Valid Subject Line",
            "description": "Short",
            "priority": FeedbackPriority.HIGH.value,
            "affected_modules": [AffectedModule.DASHBOARD.value]
        }
        response = client.post("/api/feedback/create", data={"request": json.dumps(payload_short_desc)}, headers=headers)
        assert response.status_code == 500

        # Confirm nothing saved in DB
        db.expire_all()
        db_tickets = db.query(Feedback).filter(Feedback.submitted_by == user.user_id).all()
        assert len(db_tickets) == 0

    def test_create_ticket_empty_affected_modules(self, setup_hospital_user):
        """Verify ticket creation fails when no affected modules are selected.

        Arrange: Create a hospital user.
        Act: Send POST /api/feedback/create with empty affected_modules list.
        Assert: API returns 500 Internal Server Error, and no DB record is created.
        """
        context = setup_hospital_user(role="User")
        user = context["user"]
        db = context["db"]
        headers = get_auth_headers(user)

        payload_no_modules = {
            "department": FeedbackDepartment.LOGISTICS.value,
            "feedback_type": FeedbackType.BUG.value,
            "subject": "Valid Subject Line",
            "description": "Valid description that is long enough.",
            "priority": FeedbackPriority.HIGH.value,
            "affected_modules": []
        }
        response = client.post("/api/feedback/create", data={"request": json.dumps(payload_no_modules)}, headers=headers)
        assert response.status_code == 500

        # Confirm nothing saved in DB
        db.expire_all()
        db_tickets = db.query(Feedback).filter(Feedback.submitted_by == user.user_id).all()
        assert len(db_tickets) == 0

    def test_create_ticket_invalid_affected_module_value(self, setup_hospital_user):
        """Verify ticket creation fails when an invalid module string outside the enum is supplied.

        Arrange: Create a hospital user.
        Act: Send POST /api/feedback/create with an invalid module in the list.
        Assert: API returns 500 Internal Server Error, and no DB record is created.
        """
        context = setup_hospital_user(role="User")
        user = context["user"]
        db = context["db"]
        headers = get_auth_headers(user)

        payload_invalid_module = {
            "department": FeedbackDepartment.LOGISTICS.value,
            "feedback_type": FeedbackType.BUG.value,
            "subject": "Valid Subject Line",
            "description": "Valid description that is long enough.",
            "priority": FeedbackPriority.HIGH.value,
            "affected_modules": ["invalid_module_name"]
        }
        response = client.post("/api/feedback/create", data={"request": json.dumps(payload_invalid_module)}, headers=headers)
        assert response.status_code == 500

        # Confirm nothing saved in DB
        db.expire_all()
        db_tickets = db.query(Feedback).filter(Feedback.submitted_by == user.user_id).all()
        assert len(db_tickets) == 0

    def test_create_ticket_unauthenticated(self):
        """Verify ticket creation without authorization headers is rejected.

        Arrange: Prepare valid ticket details.
        Act: Send POST /api/feedback/create without headers.
        Assert: Response status is 401 Unauthorized.
        """
        ticket_payload = {
            "department": FeedbackDepartment.LOGISTICS.value,
            "feedback_type": FeedbackType.BUG.value,
            "subject": "Unauthenticated ticket attempt",
            "description": "This request should be blocked immediately.",
            "priority": FeedbackPriority.HIGH.value,
            "affected_modules": [AffectedModule.DASHBOARD.value]
        }
        response = client.post("/api/feedback/create", data={"request": json.dumps(ticket_payload)})
        assert response.status_code == 401

    def test_comment_malicious_input_blocked(self, setup_hospital_user):
        """Verify that malicious payload (SQL injection or XSS) in feedback comments is blocked.

        Arrange: Create a hospital user.
        Act: Send POST /api/feedback/TK-2024-01-001/comments with XSS body payload.
        Assert: API blocks the request with 400 Bad Request and error code ERR_7001.
        """
        context = setup_hospital_user(role="User")
        user = context["user"]
        headers = get_auth_headers(user)

        malicious_comment = {
            "comment": "<script>alert('malicious xss comment')</script>",
            "send_email": True
        }

        response = client.post("/api/feedback/TK-2024-01-001/comments", json=malicious_comment, headers=headers)

        assert response.status_code == 400
        res_data = response.json()
        assert res_data["error_code"] == ERROR_CODES["SECURITY_MALICIOUS_CONTENT"]
        assert res_data["status"] == "Blocked"




