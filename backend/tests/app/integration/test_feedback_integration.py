import uuid
import time
import json
import pytest
import requests
import datetime
from unittest.mock import patch
from fastapi.testclient import TestClient

from app.main import app
from app.config.config import settings
from app.config.database import SessionLocal
from app.models.user_model import User
from app.models.feedback_model import Feedback
from app.models.feedback_comments import Comment
from app.auth.auth import create_access_token
from app.constants.enums import (
    FeedbackDepartment,
    FeedbackType,
    FeedbackPriority,
    AffectedModule,
    FeedbackStatus,
)

client = TestClient(app)

SMTP_API_URL = "http://localhost:5005/api/Messages"


def clear_smtp4dev():
    """Delete all messages in smtp4dev inbox."""
    try:
        res = requests.get(f"{SMTP_API_URL}?pageSize=1000", timeout=3)
        if res.status_code == 200:
            msgs = res.json()
            results = msgs.get("results", msgs) if isinstance(msgs, dict) else msgs
            for msg in results:
                msg_id = msg.get("id")
                if msg_id:
                    requests.delete(f"{SMTP_API_URL}/{msg_id}", timeout=3)
    except Exception:
        pass


def get_smtp4dev_messages():
    """Fetch messages from smtp4dev."""
    try:
        res = requests.get(f"{SMTP_API_URL}?pageSize=100", timeout=3)
        if res.status_code == 200:
            msgs = res.json()
            return msgs.get("results", msgs) if isinstance(msgs, dict) else msgs
    except Exception:
        pass
    return []


def get_smtp4dev_html_content(msg):
    """Fetch HTML body of a message from smtp4dev."""
    msg_id = msg.get("id")
    if msg_id:
        try:
            res = requests.get(f"{SMTP_API_URL}/{msg_id}/html", timeout=3)
            if res.status_code == 200:
                return res.text
        except Exception:
            pass
    return ""


def get_auth_headers(user):
    """Helper to generate JWT token and headers for a user."""
    user_role = user.role if isinstance(user.role, str) else user.role.value
    token_type = "pharma_user" if user_role == "Mygrape_admin" else "hospital_user"
    token_data = {
        "sub": str(user.user_id),
        "id": str(user.user_id),
        "user_id": str(user.user_id),
        "email": user.email,
        "role": user_role,
        "user_role": user_role,
        "type": token_type,
        "user_type": token_type,
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


@pytest.mark.integration
@patch.object(settings, "SMTP_SERVER", "localhost")
@patch.object(settings, "SMTP_PORT", 2525)
class TestFeedbackSMTPIntegration:
    """Integration test suite to verify the end-to-end feedback email flows.

    Ensures that tickets and comments trigger template rendering and
    successfully deliver email records to a live local SMTP server (smtp4dev).
    """

    @pytest.fixture(autouse=True)
    def setup_integration_data(self, setup_hospital_user):
        """Create integration test users in the database and clean up afterward."""
        self.db = SessionLocal()
        
        # Use setup_hospital_user to provision a complete user linked to hospital and branch
        user_context = setup_hospital_user(role="User")
        self.submitter = user_context["user"]
        self.test_user_id = self.submitter.user_id

        self.admin_user_id = f"admin-integ-{uuid.uuid4().hex[:8]}"
        self.admin = User(
            user_id=self.admin_user_id,
            email="mygrapeadmin@example.com",
            password_hash="dummy_hash",
            first_name="System",
            last_name="Admin",
            role="Mygrape_admin",
            approved_status="approved",
            status=True,
        )

        # Deactivate other active Vyrona admin users so get_mygrape_admin_email() returns this specific test admin
        self.other_admins = self.db.query(User).filter(
            User.role == "Mygrape_admin", 
            User.email != self.admin.email,
            User.status == True
        ).all()
        
        for other in self.other_admins:
            other.status = False
        self.db.commit()

        # Remove pre-existing conflicting data if any
        self.db.query(User).filter(User.email == self.admin.email).delete()
        self.db.commit()

        self.db.add(self.admin)
        self.db.commit()
        self.db.refresh(self.admin)

        yield

        # Teardown
        self.db.expire_all()
        self.db.query(Comment).filter(Comment.commented_by == self.test_user_id).delete()
        self.db.query(Feedback).filter(Feedback.submitted_by == self.test_user_id).delete()
        self.db.query(User).filter(User.user_id == self.admin_user_id).delete()
        
        # Restore other deactivated admins
        for other in self.other_admins:
            db_admin = self.db.query(User).filter(User.user_id == other.user_id).first()
            if db_admin:
                db_admin.status = True
        self.db.commit()
        self.db.close()

    def _create_test_ticket(self, headers, with_attachment=False):
        """Helper to create a support ticket with/without attachments."""
        ticket_payload = {
            "department": FeedbackDepartment.LOGISTICS.value,
            "feedback_type": FeedbackType.BUG.value,
            "subject": "Integration Test Subject: SMTP live checking",
            "description": "Integration test description that is long enough to pass validation rules.",
            "priority": FeedbackPriority.HIGH.value,
            "affected_modules": [AffectedModule.SIGN_IN.value],
            "send_email": True,
        }
        form_data = {
            "request": json.dumps(ticket_payload)
        }
        files = None
        if with_attachment:
            files = [
                ("attachments", ("test_integration.pdf", b"dummy PDF file content", "application/pdf"))
            ]
        response = client.post("/api/feedback/create", data=form_data, files=files, headers=headers)
        assert response.status_code == 200, f"Ticket creation failed: {response.text}"
        return response.json()["ticket_id"]

    def test_create_ticket_with_attachment_and_email(self):
        """Verify ticket creation with file attachment dispatches real SMTP emails to all parties and is queryable."""
        clear_smtp4dev()
        test_start_time = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(seconds=5)
        headers = get_auth_headers(self.submitter)

        # Create ticket
        ticket_id = self._create_test_ticket(headers, with_attachment=True)

        # Verify emails
        print("[Integration] Polling smtp4dev for ticket notification emails...")
        admin_email_found = False
        submitter_email_found = False

        for _ in range(15):
            time.sleep(1)
            messages = get_smtp4dev_messages()
            for msg in messages:
                to_addr = msg.get("to") or ""
                subject = msg.get("subject") or ""
                received_time_str = msg.get("receivedDate")

                if received_time_str:
                    try:
                        received_time = datetime.datetime.fromisoformat(received_time_str.replace("Z", "+00:00"))
                        if received_time < test_start_time:
                            continue
                    except Exception:
                        pass

                if "New Support Ticket Created - Vyrona" in subject:
                    html_body = get_smtp4dev_html_content(msg)
                    if ticket_id in html_body and "Integration Test Subject" in html_body:
                        if "mygrapeadmin@example.com" in to_addr:
                            admin_email_found = True
                        if self.submitter.email in to_addr:
                            submitter_email_found = True

            if admin_email_found and submitter_email_found:
                break

        assert admin_email_found, "Admin ticket notification email not found in smtp4dev inbox"
        assert submitter_email_found, "Submitter ticket confirmation email not found in smtp4dev inbox"

        # Verify details & download attachment
        response = client.get(f"/api/feedback/{ticket_id}", headers=headers)
        assert response.status_code == 200, f"Get ticket details failed: {response.text}"
        ticket_details = response.json()
        assert len(ticket_details["attachment_paths"]) == 1

        attachment_path = ticket_details["attachment_paths"][0]
        download_response = client.get(attachment_path, headers=headers)
        assert download_response.status_code == 200, f"Attachment download failed: {download_response.text}"
        assert download_response.content == b"dummy PDF file content"

        # Verify lists
        admin_headers = get_auth_headers(self.admin)
        admin_list_res = client.get("/api/feedback/admin", headers=admin_headers)
        assert admin_list_res.status_code == 200
        admin_tickets = [t["feedback_id"] for t in admin_list_res.json()]
        assert ticket_id in admin_tickets, "Ticket not found in admin feedback list"

        user_list_res = client.get(f"/api/feedback/user/{self.test_user_id}", headers=headers)
        assert user_list_res.status_code == 200
        user_tickets = [t["feedback_id"] for t in user_list_res.json()]
        assert ticket_id in user_tickets, "Ticket not found in user feedback list"

    def test_update_ticket_status_and_email(self):
        """Verify ticket status updates dispatch status emails to admin and submitter."""
        headers = get_auth_headers(self.submitter)
        ticket_id = self._create_test_ticket(headers)

        clear_smtp4dev()
        test_start_time = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(seconds=5)

        # Update ticket status
        status_payload = {"status": FeedbackStatus.IN_PROGRESS.value}
        response = client.patch(f"/api/feedback/{ticket_id}/status", json=status_payload, headers=headers)
        assert response.status_code == 200, f"Status update failed: {response.text}"

        # Verify status update emails in SMTP4DEV
        admin_status_found = False
        submitter_status_found = False
        for _ in range(15):
            time.sleep(1)
            messages = get_smtp4dev_messages()
            for msg in messages:
                to_addr = msg.get("to") or ""
                subject = msg.get("subject") or ""
                received_time_str = msg.get("receivedDate")

                if received_time_str:
                    try:
                        received_time = datetime.datetime.fromisoformat(received_time_str.replace("Z", "+00:00"))
                        if received_time < test_start_time:
                            continue
                    except Exception:
                        pass

                if "Ticket Status Update - Vyrona" in subject:
                    html_body = get_smtp4dev_html_content(msg)
                    if ticket_id in html_body and "In Progress" in html_body:
                        if "mygrapeadmin@example.com" in to_addr:
                            admin_status_found = True
                        if self.submitter.email in to_addr:
                            submitter_status_found = True

            if admin_status_found and submitter_status_found:
                break

        assert admin_status_found, "Admin status update email not found in smtp4dev inbox"
        assert submitter_status_found, "Submitter status update email not found in smtp4dev inbox"

    def test_add_comment_and_email(self):
        """Verify adding comments updates the comments list and dispatches comment emails."""
        headers = get_auth_headers(self.submitter)
        ticket_id = self._create_test_ticket(headers)

        clear_smtp4dev()
        test_start_time = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(seconds=5)

        # Add comment
        comment_payload = {
            "comment": "This is a real SMTP integration test comment.",
            "send_email": True,
        }
        response = client.post(f"/api/feedback/{ticket_id}/comments", json=comment_payload, headers=headers)
        assert response.status_code == 200, f"Adding comment failed: {response.text}"

        # Fetch comments list to verify storage
        comments_res = client.get(f"/api/feedback/{ticket_id}/comments", headers=headers)
        assert comments_res.status_code == 200
        comments = comments_res.json()
        comment_texts = [c["comment"] for c in comments]
        assert any("This is a real SMTP integration test comment." in text for text in comment_texts)

        # Verify new comment emails in SMTP4DEV
        admin_comment_found = False
        submitter_comment_found = False
        for _ in range(15):
            time.sleep(1)
            messages = get_smtp4dev_messages()
            for msg in messages:
                to_addr = msg.get("to") or ""
                subject = msg.get("subject") or ""
                received_time_str = msg.get("receivedDate")

                if received_time_str:
                    try:
                        received_time = datetime.datetime.fromisoformat(received_time_str.replace("Z", "+00:00"))
                        if received_time < test_start_time:
                            continue
                    except Exception:
                        pass

                if "New Comment Added to Ticket - Vyrona" in subject:
                    html_body = get_smtp4dev_html_content(msg)
                    if ticket_id in html_body and "real SMTP integration test comment" in html_body:
                        if "mygrapeadmin@example.com" in to_addr:
                            admin_comment_found = True
                        if self.submitter.email in to_addr:
                            submitter_comment_found = True

            if admin_comment_found and submitter_comment_found:
                break

        assert admin_comment_found, "Admin comment email not found in smtp4dev inbox"
        assert submitter_comment_found, "Submitter comment email not found in smtp4dev inbox"

    def test_update_ticket_status_email_toggled_off(self):
        """Verify ticket status updates do NOT dispatch status emails to submitter if toggled off."""
        headers = get_auth_headers(self.submitter)
        ticket_id = self._create_test_ticket(headers)

        clear_smtp4dev()
        test_start_time = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(seconds=5)

        # Update ticket status with send_email = False
        status_payload = {
            "status": FeedbackStatus.IN_PROGRESS.value,
            "send_email": False
        }
        response = client.patch(f"/api/feedback/{ticket_id}/status", json=status_payload, headers=headers)
        assert response.status_code == 200, f"Status update failed: {response.text}"

        # Verify status update emails in SMTP4DEV
        admin_status_found = False
        submitter_status_found = False

        for _ in range(10):
            time.sleep(1)
            messages = get_smtp4dev_messages()
            for msg in messages:
                to_addr = msg.get("to") or ""
                subject = msg.get("subject") or ""
                received_time_str = msg.get("receivedDate")

                if received_time_str:
                    try:
                        received_time = datetime.datetime.fromisoformat(received_time_str.replace("Z", "+00:00"))
                        if received_time < test_start_time:
                            continue
                    except Exception:
                        pass

                if "Ticket Status Update - Vyrona" in subject:
                    html_body = get_smtp4dev_html_content(msg)
                    if ticket_id in html_body and "In Progress" in html_body:
                        if "mygrapeadmin@example.com" in to_addr:
                            admin_status_found = True
                        if self.submitter.email in to_addr:
                            submitter_status_found = True

            if admin_status_found:
                break

        assert admin_status_found, "Admin status update email not found in smtp4dev inbox"
        assert not submitter_status_found, "Submitter status update email was sent even though send_email was toggled off"

