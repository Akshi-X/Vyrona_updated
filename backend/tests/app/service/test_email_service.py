import pytest
from unittest.mock import MagicMock, Mock, patch, mock_open, ANY
from jinja2.exceptions import TemplateNotFound, TemplateError
import smtplib

from app.service import email_service
from app.exceptions import (
    EmailServiceException,
    TemplateNotFoundException,
    TemplateRenderException
)


# ==========================================
# Tests for send_email_via_sendgrid
# ==========================================

@patch('app.service.email_service.settings')
@patch('app.service.email_service.SendGridAPIClient')
def test_send_email_via_sendgrid_success(mock_sendgrid_client, mock_settings):
    """Test sending email via SendGrid successfully"""
    # Setup mocks
    mock_settings.SENDGRID_API_KEY = "test_api_key"
    mock_settings.SENDGRID_FROM_EMAIL = "test@example.com"
    
    mock_sg_instance = MagicMock()
    mock_response = MagicMock()
    mock_response.status_code = 202
    mock_sg_instance.send.return_value = mock_response
    mock_sendgrid_client.return_value = mock_sg_instance
    
    # Call function
    email_service.send_email_via_sendgrid(
        recipient_email="recipient@example.com",
        subject="Test Subject",
        html_body="<html>Test Body</html>"
    )
    
    # Verify SendGrid was called correctly
    mock_sendgrid_client.assert_called_once_with(api_key="test_api_key")
    mock_sg_instance.send.assert_called_once()


@patch('app.service.email_service.settings')
def test_send_email_via_sendgrid_no_api_key(mock_settings):
    """Test sending email via SendGrid when API key not configured"""
    mock_settings.SENDGRID_API_KEY = None
    mock_settings.SENDGRID_FROM_EMAIL = "test@example.com"
    
    with pytest.raises(EmailServiceException) as exc_info:
        email_service.send_email_via_sendgrid(
            recipient_email="recipient@example.com",
            subject="Test Subject",
            html_body="<html>Test Body</html>"
        )
    
    assert exc_info.value.details['recipient'] == "recipient@example.com"
    assert "api key not configured" in exc_info.value.details['reason'].lower()


@patch('app.service.email_service.settings')
def test_send_email_via_sendgrid_no_from_email(mock_settings):
    """Test sending email via SendGrid when from email not configured"""
    mock_settings.SENDGRID_API_KEY = "test_api_key"
    mock_settings.SENDGRID_FROM_EMAIL = None
    
    with pytest.raises(EmailServiceException) as exc_info:
        email_service.send_email_via_sendgrid(
            recipient_email="recipient@example.com",
            subject="Test Subject",
            html_body="<html>Test Body</html>"
        )
    
    assert exc_info.value.details['recipient'] == "recipient@example.com"
    assert "from email not configured" in exc_info.value.details['reason'].lower()


@patch('app.service.email_service.settings')
@patch('app.service.email_service.SendGridAPIClient')
def test_send_email_via_sendgrid_error_response(mock_sendgrid_client, mock_settings):
    """Test sending email via SendGrid when API returns error"""
    mock_settings.SENDGRID_API_KEY = "test_api_key"
    mock_settings.SENDGRID_FROM_EMAIL = "test@example.com"
    
    mock_sg_instance = MagicMock()
    mock_response = MagicMock()
    mock_response.status_code = 400
    mock_response.body = "Bad Request"
    mock_sg_instance.send.return_value = mock_response
    mock_sendgrid_client.return_value = mock_sg_instance
    
    with pytest.raises(EmailServiceException) as exc_info:
        email_service.send_email_via_sendgrid(
            recipient_email="recipient@example.com",
            subject="Test Subject",
            html_body="<html>Test Body</html>"
        )
    
    assert exc_info.value.details['recipient'] == "recipient@example.com"
    assert "sendgrid api error" in exc_info.value.details['reason'].lower()


@patch('app.service.email_service.settings')
@patch('app.service.email_service.SendGridAPIClient')
def test_send_email_via_sendgrid_exception(mock_sendgrid_client, mock_settings):
    """Test sending email via SendGrid when exception occurs"""
    mock_settings.SENDGRID_API_KEY = "test_api_key"
    mock_settings.SENDGRID_FROM_EMAIL = "test@example.com"
    
    mock_sendgrid_client.side_effect = Exception("Connection error")
    
    with pytest.raises(EmailServiceException) as exc_info:
        email_service.send_email_via_sendgrid(
            recipient_email="recipient@example.com",
            subject="Test Subject",
            html_body="<html>Test Body</html>"
        )
    
    assert exc_info.value.details['recipient'] == "recipient@example.com"
    assert "sendgrid email send failed" in exc_info.value.details['reason'].lower()


# ==========================================
# Tests for send_email_via_smtp
# ==========================================

@patch('app.service.email_service.settings')
@patch('app.service.email_service.smtplib.SMTP')
def test_send_email_via_smtp_success(mock_smtp_class, mock_settings):
    """Test sending email via SMTP successfully"""
    # Setup mocks
    mock_settings.SENDER_EMAIL = "sender@example.com"
    mock_settings.SENDER_PASSWORD = "password123"
    mock_settings.SMTP_SERVER = "smtp.gmail.com"
    mock_settings.SMTP_PORT = 587
    
    mock_server = MagicMock()
    mock_smtp_class.return_value = mock_server
    
    # Call function
    email_service.send_email_via_smtp(
        recipient_email="recipient@example.com",
        subject="Test Subject",
        html_body="<html>Test Body</html>"
    )
    
    # Verify SMTP was called correctly
    mock_smtp_class.assert_called_once_with("smtp.gmail.com", 587, timeout=30)
    mock_server.ehlo.assert_called()
    mock_server.starttls.assert_called_once()
    mock_server.login.assert_called_once_with("sender@example.com", "password123")
    mock_server.sendmail.assert_called_once()
    mock_server.quit.assert_called_once()


@patch('app.service.email_service.settings')
@patch('app.service.email_service.smtplib.SMTP')
def test_send_email_via_smtp_auth_error(mock_smtp_class, mock_settings):
    """Test sending email via SMTP when authentication fails"""
    mock_settings.SENDER_EMAIL = "sender@example.com"
    mock_settings.SENDER_PASSWORD = "wrong_password"
    mock_settings.SMTP_SERVER = "smtp.gmail.com"
    mock_settings.SMTP_PORT = 587
    
    mock_server = MagicMock()
    # SMTPAuthenticationError requires (code, msg) parameters
    mock_server.login.side_effect = smtplib.SMTPAuthenticationError(535, "Authentication failed")
    mock_smtp_class.return_value = mock_server
    
    with pytest.raises(EmailServiceException) as exc_info:
        email_service.send_email_via_smtp(
            recipient_email="recipient@example.com",
            subject="Test Subject",
            html_body="<html>Test Body</html>"
        )
    
    assert exc_info.value.details['recipient'] == "recipient@example.com"
    assert "authentication failed" in exc_info.value.details['reason'].lower()
    mock_server.quit.assert_called_once()


@patch('app.service.email_service.settings')
@patch('app.service.email_service.smtplib.SMTP')
def test_send_email_via_smtp_server_disconnected(mock_smtp_class, mock_settings):
    """Test sending email via SMTP when server disconnects"""
    mock_settings.SENDER_EMAIL = "sender@example.com"
    mock_settings.SENDER_PASSWORD = "password123"
    mock_settings.SMTP_SERVER = "smtp.gmail.com"
    mock_settings.SMTP_PORT = 587
    
    mock_server = MagicMock()
    # SMTPServerDisconnected can be initialized with just a message
    mock_server.sendmail.side_effect = smtplib.SMTPServerDisconnected("Server disconnected")
    mock_smtp_class.return_value = mock_server
    
    with pytest.raises(EmailServiceException) as exc_info:
        email_service.send_email_via_smtp(
            recipient_email="recipient@example.com",
            subject="Test Subject",
            html_body="<html>Test Body</html>"
        )
    
    assert exc_info.value.details['recipient'] == "recipient@example.com"
    assert "server disconnected" in exc_info.value.details['reason'].lower()
    mock_server.quit.assert_called_once()


@patch('app.service.email_service.settings')
@patch('app.service.email_service.smtplib.SMTP')
def test_send_email_via_smtp_smtp_exception(mock_smtp_class, mock_settings):
    """Test sending email via SMTP when SMTPException occurs (not auth or disconnect)"""
    mock_settings.SENDER_EMAIL = "sender@example.com"
    mock_settings.SENDER_PASSWORD = "password123"
    mock_settings.SMTP_SERVER = "smtp.gmail.com"
    mock_settings.SMTP_PORT = 587
    
    mock_server = MagicMock()
    # Use a generic SMTPException (not SMTPAuthenticationError or SMTPServerDisconnected)
    mock_server.sendmail.side_effect = smtplib.SMTPException("SMTP error occurred")
    mock_smtp_class.return_value = mock_server
    
    with pytest.raises(EmailServiceException) as exc_info:
        email_service.send_email_via_smtp(
            recipient_email="recipient@example.com",
            subject="Test Subject",
            html_body="<html>Test Body</html>"
        )
    
    assert exc_info.value.details['recipient'] == "recipient@example.com"
    assert "smtp error" in exc_info.value.details['reason'].lower()
    mock_server.quit.assert_called_once()


@patch('app.service.email_service.settings')
@patch('app.service.email_service.smtplib.SMTP')
def test_send_email_via_smtp_email_service_exception_re_raise(mock_smtp_class, mock_settings):
    """Test sending email via SMTP when EmailServiceException is raised (should re-raise)"""
    mock_settings.SENDER_EMAIL = "sender@example.com"
    mock_settings.SENDER_PASSWORD = "password123"
    mock_settings.SMTP_SERVER = "smtp.gmail.com"
    mock_settings.SMTP_PORT = 587
    
    mock_server = MagicMock()
    # Raise EmailServiceException directly (should be re-raised)
    mock_server.starttls.side_effect = EmailServiceException(recipient="recipient@example.com", reason="Test error")
    mock_smtp_class.return_value = mock_server
    
    with pytest.raises(EmailServiceException) as exc_info:
        email_service.send_email_via_smtp(
            recipient_email="recipient@example.com",
            subject="Test Subject",
            html_body="<html>Test Body</html>"
        )
    
    assert exc_info.value.details['recipient'] == "recipient@example.com"
    assert "test error" in exc_info.value.details['reason'].lower()


@patch('app.service.email_service.settings')
@patch('app.service.email_service.smtplib.SMTP')
def test_send_email_via_smtp_quit_exception(mock_smtp_class, mock_settings):
    """Test sending email via SMTP when server.quit() raises exception in finally block"""
    mock_settings.SENDER_EMAIL = "sender@example.com"
    mock_settings.SENDER_PASSWORD = "password123"
    mock_settings.SMTP_SERVER = "smtp.gmail.com"
    mock_settings.SMTP_PORT = 587
    
    mock_server = MagicMock()
    mock_server.quit.side_effect = Exception("Quit error")  # Exception in finally block
    mock_smtp_class.return_value = mock_server
    
    # Should still succeed (quit error is caught)
    email_service.send_email_via_smtp(
        recipient_email="recipient@example.com",
        subject="Test Subject",
        html_body="<html>Test Body</html>"
    )
    
    mock_server.quit.assert_called_once()


@patch('app.service.email_service.settings')
@patch('app.service.email_service.smtplib.SMTP')
def test_send_email_via_smtp_general_exception(mock_smtp_class, mock_settings):
    """Test sending email via SMTP when general exception occurs"""
    mock_settings.SENDER_EMAIL = "sender@example.com"
    mock_settings.SENDER_PASSWORD = "password123"
    mock_settings.SMTP_SERVER = "smtp.gmail.com"
    mock_settings.SMTP_PORT = 587
    
    mock_smtp_class.side_effect = Exception("Connection error")
    
    with pytest.raises(EmailServiceException) as exc_info:
        email_service.send_email_via_smtp(
            recipient_email="recipient@example.com",
            subject="Test Subject",
            html_body="<html>Test Body</html>"
        )
    
    assert exc_info.value.details['recipient'] == "recipient@example.com"
    assert "failed to send email" in exc_info.value.details['reason'].lower()


# ==========================================
# Tests for send_email
# ==========================================

@patch('app.service.email_service.settings')
@patch('app.service.email_service.send_email_via_sendgrid')
def test_send_email_sendgrid_success(mock_sendgrid, mock_settings):
    """Test send_email using SendGrid successfully"""
    mock_settings.EMAIL_SERVICE = "sendgrid"
    
    email_service.send_email(
        recipient_email="recipient@example.com",
        subject="Test Subject",
        html_body="<html>Test Body</html>"
    )
    
    mock_sendgrid.assert_called_once_with("recipient@example.com", "Test Subject", "<html>Test Body</html>")


@patch('app.service.email_service.settings')
@patch('app.service.email_service.send_email_via_sendgrid')
@patch('app.service.email_service.send_email_via_smtp')
def test_send_email_sendgrid_fallback_to_smtp(mock_smtp, mock_sendgrid, mock_settings):
    """Test send_email falling back to SMTP when SendGrid fails"""
    mock_settings.EMAIL_SERVICE = "sendgrid"
    mock_sendgrid.side_effect = EmailServiceException(recipient="recipient@example.com", reason="SendGrid error")
    
    email_service.send_email(
        recipient_email="recipient@example.com",
        subject="Test Subject",
        html_body="<html>Test Body</html>"
    )
    
    mock_sendgrid.assert_called_once()
    mock_smtp.assert_called_once_with("recipient@example.com", "Test Subject", "<html>Test Body</html>")


@patch('app.service.email_service.settings')
@patch('app.service.email_service.send_email_via_smtp')
def test_send_email_smtp_direct(mock_smtp, mock_settings):
    """Test send_email using SMTP directly (when EMAIL_SERVICE is not sendgrid)"""
    mock_settings.EMAIL_SERVICE = "smtp"
    
    email_service.send_email(
        recipient_email="recipient@example.com",
        subject="Test Subject",
        html_body="<html>Test Body</html>"
    )
    
    mock_smtp.assert_called_once_with("recipient@example.com", "Test Subject", "<html>Test Body</html>")


@patch('app.service.email_service.settings')
@patch('app.service.email_service.send_email_via_sendgrid')
@patch('app.service.email_service.send_email_via_smtp')
def test_send_email_all_services_fail(mock_smtp, mock_sendgrid, mock_settings):
    """Test send_email when all services fail"""
    mock_settings.EMAIL_SERVICE = "sendgrid"
    mock_sendgrid.side_effect = EmailServiceException(recipient="recipient@example.com", reason="SendGrid error")
    mock_smtp.side_effect = EmailServiceException(recipient="recipient@example.com", reason="SMTP error")
    
    with pytest.raises(EmailServiceException) as exc_info:
        email_service.send_email(
            recipient_email="recipient@example.com",
            subject="Test Subject",
            html_body="<html>Test Body</html>"
        )
    
    assert exc_info.value.details['recipient'] == "recipient@example.com"
    assert "smtp error" in exc_info.value.details['reason'].lower()


@patch('app.service.email_service.settings')
@patch('app.service.email_service.send_email_via_sendgrid')
@patch('app.service.email_service.send_email_via_smtp')
def test_send_email_sendgrid_non_email_exception_fallback(mock_smtp, mock_sendgrid, mock_settings):
    """Test send_email when SendGrid raises non-EmailServiceException (should fallback)"""
    mock_settings.EMAIL_SERVICE = "sendgrid"
    mock_sendgrid.side_effect = Exception("Connection error")  # Non-EmailServiceException
    
    email_service.send_email(
        recipient_email="recipient@example.com",
        subject="Test Subject",
        html_body="<html>Test Body</html>"
    )
    
    mock_sendgrid.assert_called_once()
    mock_smtp.assert_called_once()  # Should fallback to SMTP


@patch('app.service.email_service.settings')
@patch('app.service.email_service.send_email_via_smtp')
def test_send_email_smtp_non_email_exception(mock_smtp, mock_settings):
    """Test send_email when SMTP raises non-EmailServiceException"""
    mock_settings.EMAIL_SERVICE = "smtp"
    mock_smtp.side_effect = Exception("Connection error")  # Non-EmailServiceException
    
    with pytest.raises(EmailServiceException) as exc_info:
        email_service.send_email(
            recipient_email="recipient@example.com",
            subject="Test Subject",
            html_body="<html>Test Body</html>"
        )
    
    assert exc_info.value.details['recipient'] == "recipient@example.com"
    assert "all email services failed" in exc_info.value.details['reason'].lower()


# ==========================================
# Tests for send_approval_email
# ==========================================

@patch('app.service.email_service.send_email')
@patch('app.service.email_service.jinja_env')
@patch('app.service.email_service.settings')
def test_send_approval_email_success(mock_settings, mock_jinja_env, mock_send_email):
    """Test sending approval email successfully"""
    mock_settings.FRONTEND_URL = "https://example.com"
    
    # Mock template
    mock_template = MagicMock()
    mock_template.render.return_value = "<html>Approval Email</html>"
    mock_jinja_env.get_template.return_value = mock_template
    
    email_service.send_approval_email(
        registration_id="USR-123",
        first_name="John",
        last_name="Doe",
        email="john@example.com",
        role="manager",
        company="Test Pharma",
        recipient_email="admin@pharma.com"
    )
    
    mock_jinja_env.get_template.assert_called_once_with("approval_email.html")
    mock_template.render.assert_called_once()
    mock_send_email.assert_called_once()
    # Check that approval_url is in the render call
    render_call_kwargs = mock_template.render.call_args[1]
    assert "approval_url" in render_call_kwargs
    assert "USR-123" in render_call_kwargs["approval_url"]


@patch('app.service.email_service.jinja_env')
def test_send_approval_email_template_not_found(mock_jinja_env):
    """Test sending approval email when template not found"""
    mock_jinja_env.get_template.side_effect = TemplateNotFound("approval_email.html")
    
    with pytest.raises(TemplateNotFoundException) as exc_info:
        email_service.send_approval_email(
            registration_id="USR-123",
            first_name="John",
            last_name="Doe",
            email="john@example.com",
            role="manager",
            company="Test Pharma",
            recipient_email="admin@pharma.com"
        )
    
    assert exc_info.value.details['template_name'] == "approval_email.html"


@patch('app.service.email_service.send_email')
@patch('app.service.email_service.jinja_env')
@patch('app.service.email_service.settings')
def test_send_approval_email_template_render_error(mock_settings, mock_jinja_env, mock_send_email):
    """Test sending approval email when template rendering fails"""
    mock_settings.FRONTEND_URL = "https://example.com"
    
    mock_template = MagicMock()
    mock_template.render.side_effect = TemplateError("Render error")
    mock_jinja_env.get_template.return_value = mock_template
    
    with pytest.raises(TemplateRenderException) as exc_info:
        email_service.send_approval_email(
            registration_id="USR-123",
            first_name="John",
            last_name="Doe",
            email="john@example.com",
            role="manager",
            company="Test Pharma",
            recipient_email="admin@pharma.com"
        )
    
    assert exc_info.value.details['template_name'] == "approval_email.html"
    assert "render error" in exc_info.value.details['reason'].lower()


# ==========================================
# Tests for send_otp_email
# ==========================================

@patch('app.service.email_service.send_email')
@patch('app.service.email_service.jinja_env')
def test_send_otp_email_success(mock_jinja_env, mock_send_email):
    """Test sending OTP email successfully"""
    # Mock template
    mock_template = MagicMock()
    mock_template.render.return_value = "<html>OTP Email</html>"
    mock_jinja_env.get_template.return_value = mock_template
    
    email_service.send_otp_email(
        user_email="user@example.com",
        otp_code="123456"
    )
    
    mock_jinja_env.get_template.assert_called_once_with("otp_email.html")
    mock_template.render.assert_called_once()
    mock_send_email.assert_called_once_with("user@example.com", ANY, "<html>OTP Email</html>")


@patch('app.service.email_service.jinja_env')
def test_send_otp_email_template_not_found(mock_jinja_env):
    """Test sending OTP email when template not found"""
    mock_jinja_env.get_template.side_effect = TemplateNotFound("otp_email.html")
    
    with pytest.raises(TemplateNotFoundException) as exc_info:
        email_service.send_otp_email(
            user_email="user@example.com",
            otp_code="123456"
        )
    
    assert exc_info.value.details['template_name'] == "otp_email.html"


@patch('app.service.email_service.send_email')
@patch('app.service.email_service.jinja_env')
def test_send_otp_email_template_render_error(mock_jinja_env, mock_send_email):
    """Test sending OTP email when template rendering fails"""
    mock_template = MagicMock()
    mock_template.render.side_effect = TemplateError("Render error")
    mock_jinja_env.get_template.return_value = mock_template
    
    with pytest.raises(TemplateRenderException) as exc_info:
        email_service.send_otp_email(
            user_email="user@example.com",
            otp_code="123456"
        )
    
    assert exc_info.value.details['template_name'] == "otp_email.html"


# ==========================================
# Tests for send_password_reset_email
# ==========================================

@patch('app.service.email_service.send_email')
@patch('app.service.email_service.jinja_env')
def test_send_password_reset_email_success(mock_jinja_env, mock_send_email):
    """Test sending password reset email successfully"""
    # Mock template
    mock_template = MagicMock()
    mock_template.render.return_value = "<html>Password Reset Email</html>"
    mock_jinja_env.get_template.return_value = mock_template
    
    email_service.send_password_reset_email(
        user_email="user@example.com",
        reset_link="https://example.com/reset?token=abc123",
        first_name="John"
    )
    
    mock_jinja_env.get_template.assert_called_once_with("password_reset_email.html")
    mock_template.render.assert_called_once()
    mock_send_email.assert_called_once()


@patch('app.service.email_service.jinja_env')
def test_send_password_reset_email_template_not_found(mock_jinja_env):
    """Test sending password reset email when template not found"""
    mock_jinja_env.get_template.side_effect = TemplateNotFound("password_reset_email.html")
    
    with pytest.raises(TemplateNotFoundException) as exc_info:
        email_service.send_password_reset_email(
            user_email="user@example.com",
            reset_link="https://example.com/reset?token=abc123",
            first_name="John"
        )
    
    assert exc_info.value.details['template_name'] == "password_reset_email.html"


@patch('app.service.email_service.send_email')
@patch('app.service.email_service.jinja_env')
def test_send_password_reset_email_template_render_error(mock_jinja_env, mock_send_email):
    """Test sending password reset email when template rendering fails"""
    mock_template = MagicMock()
    mock_template.render.side_effect = TemplateError("Render error")
    mock_jinja_env.get_template.return_value = mock_template
    
    with pytest.raises(TemplateRenderException) as exc_info:
        email_service.send_password_reset_email(
            user_email="user@example.com",
            reset_link="https://example.com/reset?token=abc123",
            first_name="John"
        )
    
    assert exc_info.value.details['template_name'] == "password_reset_email.html"


# ==========================================
# Tests for send_user_approved_notification
# ==========================================

@patch('app.service.email_service.send_email')
@patch('app.service.email_service.jinja_env')
@patch('app.service.email_service.settings')
def test_send_user_approved_notification_success(mock_settings, mock_jinja_env, mock_send_email):
    """Test sending user approved notification successfully"""
    mock_settings.FRONTEND_URL = "https://example.com"
    
    # Mock template
    mock_template = MagicMock()
    mock_template.render.return_value = "<html>Approval Notification</html>"
    mock_jinja_env.get_template.return_value = mock_template
    
    email_service.send_user_approved_notification(
        user_email="user@example.com",
        first_name="John",
        last_name="Doe",
        role="manager",
        company="Test Pharma",
        approved_date="January 1, 2024 at 12:00 PM"
    )
    
    mock_jinja_env.get_template.assert_called_once_with("user_approved_notification.html")
    mock_template.render.assert_called_once()
    mock_send_email.assert_called_once()


@patch('app.service.email_service.jinja_env')
def test_send_user_approved_notification_template_not_found(mock_jinja_env):
    """Test sending user approved notification when template not found"""
    mock_jinja_env.get_template.side_effect = TemplateNotFound("user_approved_notification.html")
    
    with pytest.raises(TemplateNotFoundException) as exc_info:
        email_service.send_user_approved_notification(
            user_email="user@example.com",
            first_name="John",
            last_name="Doe",
            role="manager",
            company="Test Pharma",
            approved_date="January 1, 2024 at 12:00 PM"
        )
    
    assert exc_info.value.details['template_name'] == "user_approved_notification.html"


@patch('app.service.email_service.send_email')
@patch('app.service.email_service.jinja_env')
@patch('app.service.email_service.settings')
def test_send_user_approved_notification_template_render_error(mock_settings, mock_jinja_env, mock_send_email):
    """Test sending user approved notification when template rendering fails"""
    mock_settings.FRONTEND_URL = "https://example.com"
    
    mock_template = MagicMock()
    mock_template.render.side_effect = TemplateError("Render error")
    mock_jinja_env.get_template.return_value = mock_template
    
    with pytest.raises(TemplateRenderException) as exc_info:
        email_service.send_user_approved_notification(
            user_email="user@example.com",
            first_name="John",
            last_name="Doe",
            role="manager",
            company="Test Pharma",
            approved_date="January 1, 2024 at 12:00 PM"
        )
    
    assert exc_info.value.details['template_name'] == "user_approved_notification.html"


# ==========================================
# Tests for send_feedback_new_ticket_email
# ==========================================

@patch('app.service.email_service.send_email')
@patch('app.service.email_service.jinja_env')
@patch('app.service.email_service.settings')
def test_send_feedback_new_ticket_email_success(mock_settings, mock_jinja_env, mock_send_email):
    """Test sending new feedback ticket email successfully"""
    mock_settings.FRONTEND_URL = "https://example.com"
    
    # Mock template
    mock_template = MagicMock()
    mock_template.render.return_value = "<html>New Ticket Email</html>"
    mock_jinja_env.get_template.return_value = mock_template
    
    email_service.send_feedback_new_ticket_email(
        ticket_id="TICKET-123",
        subject="Test Subject",
        description="Test Description",
        priority="High",
        department="Support",
        submitted_by_name="John Doe",
        submitted_by_email="john@example.com",
        feedback_id="FB-123",
        mygrape_admin_email="admin@mygrape.com",
        send_to_user=True
    )
    
    mock_jinja_env.get_template.assert_called_once_with("feedback_new_ticket.html")
    # Should send to both user and admin
    assert mock_send_email.call_count == 2


@patch('app.service.email_service.send_email')
@patch('app.service.email_service.jinja_env')
@patch('app.service.email_service.settings')
def test_send_feedback_new_ticket_email_no_user(mock_settings, mock_jinja_env, mock_send_email):
    """Test sending new feedback ticket email without sending to user"""
    mock_settings.FRONTEND_URL = "https://example.com"
    
    # Mock template
    mock_template = MagicMock()
    mock_template.render.return_value = "<html>New Ticket Email</html>"
    mock_jinja_env.get_template.return_value = mock_template
    
    email_service.send_feedback_new_ticket_email(
        ticket_id="TICKET-123",
        subject="Test Subject",
        description="Test Description",
        priority="High",
        department="Support",
        submitted_by_name="John Doe",
        submitted_by_email="john@example.com",
        feedback_id="FB-123",
        mygrape_admin_email="admin@mygrape.com",
        send_to_user=False
    )
    
    # Should only send to admin
    assert mock_send_email.call_count == 1
    # Check that admin email was called
    admin_call = mock_send_email.call_args_list[0]
    assert admin_call[0][0] == "admin@mygrape.com"


@patch('app.service.email_service.jinja_env')
def test_send_feedback_new_ticket_email_template_not_found(mock_jinja_env):
    """Test sending new feedback ticket email when template not found"""
    mock_jinja_env.get_template.side_effect = TemplateNotFound("feedback_new_ticket.html")
    
    with pytest.raises(TemplateNotFoundException) as exc_info:
        email_service.send_feedback_new_ticket_email(
            ticket_id="TICKET-123",
            subject="Test Subject",
            description="Test Description",
            priority="High",
            department="Support",
            submitted_by_name="John Doe",
            submitted_by_email="john@example.com",
            feedback_id="FB-123",
            mygrape_admin_email="admin@mygrape.com",
            send_to_user=True
        )
    
    assert exc_info.value.details['template_name'] == "feedback_new_ticket.html"


@patch('app.service.email_service.send_email')
@patch('app.service.email_service.jinja_env')
@patch('app.service.email_service.settings')
def test_send_feedback_new_ticket_email_template_render_error(mock_settings, mock_jinja_env, mock_send_email):
    """Test sending new feedback ticket email when template rendering fails"""
    mock_settings.FRONTEND_URL = "https://example.com"
    
    mock_template = MagicMock()
    mock_template.render.side_effect = TemplateError("Render error")
    mock_jinja_env.get_template.return_value = mock_template
    
    with pytest.raises(TemplateRenderException) as exc_info:
        email_service.send_feedback_new_ticket_email(
            ticket_id="TICKET-123",
            subject="Test Subject",
            description="Test Description",
            priority="High",
            department="Support",
            submitted_by_name="John Doe",
            submitted_by_email="john@example.com",
            feedback_id="FB-123",
            mygrape_admin_email="admin@mygrape.com",
            send_to_user=True
        )
    
    assert exc_info.value.details['template_name'] == "feedback_new_ticket.html"


# ==========================================
# Tests for send_feedback_status_update_email
# ==========================================

@patch('app.service.email_service.send_email')
@patch('app.service.email_service.jinja_env')
@patch('app.service.email_service.settings')
def test_send_feedback_status_update_email_success(mock_settings, mock_jinja_env, mock_send_email):
    """Test sending feedback status update email successfully"""
    mock_settings.FRONTEND_URL = "https://example.com"
    
    # Mock template
    mock_template = MagicMock()
    mock_template.render.return_value = "<html>Status Update Email</html>"
    mock_jinja_env.get_template.return_value = mock_template
    
    email_service.send_feedback_status_update_email(
        ticket_id="TICKET-123",
        subject="Test Subject",
        old_status="Open",
        new_status="In Progress",
        updated_by_name="Admin User",
        submitted_by_email="john@example.com",
        feedback_id="FB-123",
        mygrape_admin_email="admin@mygrape.com",
        send_to_user=True
    )
    
    mock_jinja_env.get_template.assert_called_once_with("feedback_status_update.html")
    # Should send to both user and admin
    assert mock_send_email.call_count == 2


@patch('app.service.email_service.jinja_env')
def test_send_feedback_status_update_email_template_not_found(mock_jinja_env):
    """Test sending feedback status update email when template not found"""
    mock_jinja_env.get_template.side_effect = TemplateNotFound("feedback_status_update.html")
    
    with pytest.raises(TemplateNotFoundException) as exc_info:
        email_service.send_feedback_status_update_email(
            ticket_id="TICKET-123",
            subject="Test Subject",
            old_status="Open",
            new_status="In Progress",
            updated_by_name="Admin User",
            submitted_by_email="john@example.com",
            feedback_id="FB-123",
            mygrape_admin_email="admin@mygrape.com",
            send_to_user=True
        )
    
    assert exc_info.value.details['template_name'] == "feedback_status_update.html"


@patch('app.service.email_service.send_email')
@patch('app.service.email_service.jinja_env')
@patch('app.service.email_service.settings')
def test_send_feedback_status_update_email_template_render_error(mock_settings, mock_jinja_env, mock_send_email):
    """Test sending feedback status update email when template rendering fails"""
    mock_settings.FRONTEND_URL = "https://example.com"
    
    mock_template = MagicMock()
    mock_template.render.side_effect = TemplateError("Render error")
    mock_jinja_env.get_template.return_value = mock_template
    
    with pytest.raises(TemplateRenderException) as exc_info:
        email_service.send_feedback_status_update_email(
            ticket_id="TICKET-123",
            subject="Test Subject",
            old_status="Open",
            new_status="In Progress",
            updated_by_name="Admin User",
            submitted_by_email="john@example.com",
            feedback_id="FB-123",
            mygrape_admin_email="admin@mygrape.com",
            send_to_user=True
        )
    
    assert exc_info.value.details['template_name'] == "feedback_status_update.html"


# ==========================================
# Tests for send_feedback_new_comment_email
# ==========================================

@patch('app.service.email_service.send_email')
@patch('app.service.email_service.jinja_env')
@patch('app.service.email_service.settings')
def test_send_feedback_new_comment_email_success(mock_settings, mock_jinja_env, mock_send_email):
    """Test sending new comment email successfully"""
    mock_settings.FRONTEND_URL = "https://example.com"
    
    # Mock template
    mock_template = MagicMock()
    mock_template.render.return_value = "<html>New Comment Email</html>"
    mock_jinja_env.get_template.return_value = mock_template
    
    email_service.send_feedback_new_comment_email(
        ticket_id="TICKET-123",
        subject="Test Subject",
        comment="This is a comment",
        commented_by_name="Admin User",
        submitted_by_email="john@example.com",
        feedback_id="FB-123",
        mygrape_admin_email="admin@mygrape.com",
        send_to_user=True
    )
    
    mock_jinja_env.get_template.assert_called_once_with("feedback_new_comment.html")
    # Should send to both user and admin
    assert mock_send_email.call_count == 2


@patch('app.service.email_service.jinja_env')
def test_send_feedback_new_comment_email_template_not_found(mock_jinja_env):
    """Test sending new comment email when template not found"""
    mock_jinja_env.get_template.side_effect = TemplateNotFound("feedback_new_comment.html")
    
    with pytest.raises(TemplateNotFoundException) as exc_info:
        email_service.send_feedback_new_comment_email(
            ticket_id="TICKET-123",
            subject="Test Subject",
            comment="This is a comment",
            commented_by_name="Admin User",
            submitted_by_email="john@example.com",
            feedback_id="FB-123",
            mygrape_admin_email="admin@mygrape.com",
            send_to_user=True
        )
    
    assert exc_info.value.details['template_name'] == "feedback_new_comment.html"


@patch('app.service.email_service.send_email')
@patch('app.service.email_service.jinja_env')
@patch('app.service.email_service.settings')
def test_send_feedback_new_comment_email_template_render_error(mock_settings, mock_jinja_env, mock_send_email):
    """Test sending new comment email when template rendering fails"""
    mock_settings.FRONTEND_URL = "https://example.com"
    
    mock_template = MagicMock()
    mock_template.render.side_effect = TemplateError("Render error")
    mock_jinja_env.get_template.return_value = mock_template
    
    with pytest.raises(TemplateRenderException) as exc_info:
        email_service.send_feedback_new_comment_email(
            ticket_id="TICKET-123",
            subject="Test Subject",
            comment="This is a comment",
            commented_by_name="Admin User",
            submitted_by_email="john@example.com",
            feedback_id="FB-123",
            mygrape_admin_email="admin@mygrape.com",
            send_to_user=True
        )
    
    assert exc_info.value.details['template_name'] == "feedback_new_comment.html"

