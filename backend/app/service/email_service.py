import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from pathlib import Path
from datetime import datetime
from jinja2 import Environment, FileSystemLoader, TemplateNotFound
from jinja2.exceptions import TemplateError
import msal
import requests

from ..config.config import settings
from ..constants.app_constants import (
    EMAIL_APPROVAL_SUBJECT, EMAIL_OTP_SUBJECT, OTP_EXPIRY_MINUTES,
    EMAIL_FEEDBACK_NEW_TICKET_SUBJECT, EMAIL_FEEDBACK_STATUS_UPDATE_SUBJECT, 
    EMAIL_FEEDBACK_NEW_COMMENT_SUBJECT,
    EMAIL_APPROVAL_SUBJECT,
    EMAIL_OTP_SUBJECT,
    EMAIL_PASSWORD_RESET_SUBJECT,
    OTP_EXPIRY_MINUTES,
    PASSWORD_RESET_TOKEN_EXPIRY_MINUTES
)
from ..exceptions import EmailServiceException, TemplateNotFoundException, TemplateRenderException

# Setup logger
logger = logging.getLogger(__name__)

# Setup Jinja2 template environment
TEMPLATE_DIR = Path(__file__).parent.parent / "templates" / "emails"
jinja_env = Environment(loader=FileSystemLoader(str(TEMPLATE_DIR)))


# ============================================
# AZURE AD (Microsoft Graph API) FUNCTIONS
# ============================================

def get_azure_access_token() -> str:
    """
    Get access token for Microsoft Graph API using client credentials
    
    Returns:
        Access token string
        
    Raises:
        EmailServiceException if authentication fails
    """
    try:
        app = msal.ConfidentialClientApplication(
            client_id=settings.AZURE_CLIENT_ID,
            client_credential=settings.AZURE_CLIENT_SECRET,
            authority=f"https://login.microsoftonline.com/{settings.AZURE_TENANT_ID}"
        )
        
        result = app.acquire_token_for_client(
            scopes=["https://graph.microsoft.com/.default"]
        )
        
        if "access_token" in result:
            return result["access_token"]
        else:
            error_msg = result.get("error_description", "Unknown error")
            raise EmailServiceException(
                recipient="Azure AD",
                reason=f"Failed to acquire access token: {error_msg}"
            )
    except Exception as e:
        print(f"Azure AD auth error: {type(e).__name__}: {str(e)}")
        raise EmailServiceException(
            recipient="Azure AD",
            reason=f"Azure AD authentication failed: {str(e)}"
        )


def send_email_via_azure(recipient_email: str, subject: str, html_body: str):
    """
    Send email using Microsoft Graph API
    
    Args:
        recipient_email: Email address to send to
        subject: Email subject
        html_body: HTML content of email
        
    Raises:
        EmailServiceException if sending fails
    """
    try:
        # Get access token
        access_token = get_azure_access_token()
        
        # Prepare email payload for Microsoft Graph API
        email_payload = {
            "message": {
                "subject": subject,
                "body": {
                    "contentType": "HTML",
                    "content": html_body
                },
                "toRecipients": [
                    {
                        "emailAddress": {
                            "address": recipient_email
                        }
                    }
                ]
            },
            "saveToSentItems": True
        }
        
        # Send email via Microsoft Graph API
        graph_url = f"https://graph.microsoft.com/v1.0/users/{settings.SENDER_EMAIL}/sendMail"
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json"
        }
        
        print(f"Calling Graph API: {graph_url}")
        response = requests.post(graph_url, headers=headers, json=email_payload, timeout=10)
        
        print(f"Graph API Response Status: {response.status_code}")
        if response.status_code == 202:
            print(f"Email sent via Azure AD to {recipient_email}")
        else:
            print(f"Graph API Error Response: {response.text}")
            raise EmailServiceException(
                recipient=recipient_email,
                reason=f"Microsoft Graph API error: {response.status_code} - {response.text}"
            )
    
    except EmailServiceException:
        # Re-raise EmailServiceException as-is (don't wrap it again!)
        raise
    except requests.exceptions.RequestException as e:
        print(f"Azure network error: {type(e).__name__}: {str(e)}")
        raise EmailServiceException(
            recipient=recipient_email,
            reason=f"Network error: {str(e)}"
        )
    except Exception as e:
        print(f"Azure send error: {type(e).__name__}: {str(e)}")
        raise EmailServiceException(
            recipient=recipient_email,
            reason=f"Azure email send failed: {str(e)}"
        )


# ============================================
# SMTP FUNCTIONS (Backward Compatibility)
# ============================================

def send_email_via_smtp(recipient_email: str, subject: str, html_body: str):
    """
    Send email using SMTP (Gmail)
    
    Fallback method if Azure AD fails
    
    Args:
        recipient_email: Email address to send to
        subject: Email subject
        html_body: HTML content of email
        
    Raises:
        EmailServiceException if sending fails
    """
    # Create email message
    msg = MIMEMultipart("alternative")
    msg["From"] = settings.SENDER_EMAIL
    msg["To"] = recipient_email
    msg["Subject"] = subject
    msg.attach(MIMEText(html_body, "html"))
    
    # Send email via SMTP with improved connection handling
    server = None
    try:
        print(f"Connecting to SMTP: {settings.SMTP_SERVER}:{settings.SMTP_PORT}")
        server = smtplib.SMTP(settings.SMTP_SERVER, settings.SMTP_PORT, timeout=30)
        server.ehlo()
        
        print(f"Starting TLS...")
        server.starttls()
        server.ehlo()
        
        print(f"Logging in as {settings.SENDER_EMAIL}...")
        server.login(settings.SENDER_EMAIL, settings.SENDER_PASSWORD)
        
        print(f"Sending email to {recipient_email}...")
        server.sendmail(settings.SENDER_EMAIL, [recipient_email], msg.as_string())
        
        print(f"Email sent successfully via SMTP to {recipient_email}")
        
    except EmailServiceException:
        raise
    except smtplib.SMTPAuthenticationError as e:
        print(f"SMTP auth error: {str(e)}")
        raise EmailServiceException(
            recipient=recipient_email,
            reason=f"Authentication failed. Check SENDER_EMAIL and SENDER_PASSWORD in .env"
        )
    except smtplib.SMTPServerDisconnected as e:
        print(f"SMTP disconnected: {str(e)}")
        raise EmailServiceException(
            recipient=recipient_email,
            reason=f"SMTP server disconnected. Try regenerating Gmail app password."
        )
    except smtplib.SMTPException as e:
        print(f"SMTP error: {type(e).__name__}: {str(e)}")
        raise EmailServiceException(
            recipient=recipient_email,
            reason=f"SMTP error: {str(e)}"
        )
    except Exception as e:
        print(f"General error: {type(e).__name__}: {str(e)}")
        raise EmailServiceException(
            recipient=recipient_email,
            reason=f"Failed to send email: {str(e)}"
        )
    finally:
        if server:
            try:
                server.quit()
            except:
                pass


def send_email(recipient_email: str, subject: str, html_body: str):
    """
    Send email using Gmail SMTP.
    
    Args:
        recipient_email: Email address to send to
        subject: Email subject
        html_body: HTML content of email
        
    Raises:
        EmailServiceException if sending fails
    """
    logger.info(f"Using Gmail SMTP to send email to {recipient_email}...")
    send_email_via_smtp(recipient_email, subject, html_body)


# ============================================
# APPLICATION EMAIL FUNCTIONS
# ============================================

def send_approval_email(
    registration_id: str, 
    first_name: str, 
    last_name: str, 
    email: str, 
    role: str, 
    company: str,
    recipient_email: str  # Dynamic recipient based on role
):
    """
    Send approval request email with HTML template
    
    Two-level approval system:
    - Manager registration → Sent to MyGrape Admin
    - User registration → Sent to Company Manager
    
    Clean exception handling!
    """
    subject = EMAIL_APPROVAL_SUBJECT
    approval_url = f"{settings.BACKEND_URL}/api/approval-screen?registration_id={registration_id}"
    
    # Load and render HTML template
    try:
        template = jinja_env.get_template("approval_email.html")
    except TemplateNotFound:
        raise TemplateNotFoundException(template_name="approval_email.html")
    
    try:
        html_body = template.render(
            subject=subject,
            first_name=first_name,
            last_name=last_name,
            email=email,
            role=role,
            company=company,
            approval_url=approval_url
        )
    except TemplateError as e:
        raise TemplateRenderException(template_name="approval_email.html", reason=str(e))
    
    # Send email using configured service (Azure AD or SMTP with auto-fallback)
    send_email(recipient_email, subject, html_body)


def send_otp_email(user_email: str, otp_code: str):
    """
    Send OTP to user's email with HTML template
    Clean exception handling!
    """
    subject = EMAIL_OTP_SUBJECT
    
    # Load and render HTML template
    try:
        template = jinja_env.get_template("otp_email.html")
    except TemplateNotFound:
        raise TemplateNotFoundException(template_name="otp_email.html")
    
    try:
        html_body = template.render(
            subject=subject,
            otp_code=otp_code,
            expiry_minutes=OTP_EXPIRY_MINUTES
        )
    except TemplateError as e:
        raise TemplateRenderException(template_name="otp_email.html", reason=str(e))
    
    # Send email using configured service (Azure AD or SMTP with auto-fallback)
    send_email(user_email, subject, html_body)


# ============================================
# FEEDBACK EMAIL FUNCTIONS
# ============================================

def send_feedback_new_ticket_email(
    ticket_id: str,
    subject: str,
    description: str,
    priority: str,
    department: str,
    submitted_by_name: str,
    submitted_by_email: str,
    feedback_id: str
):
    """
    Send new feedback ticket notification email
    """
    email_subject = EMAIL_FEEDBACK_NEW_TICKET_SUBJECT
    ticket_url = f"{settings.FRONTEND_URL}/feedback/{feedback_id}"
    
    # Load and render HTML template
    try:
        template = jinja_env.get_template("feedback_new_ticket.html")
    except TemplateNotFound:
        raise TemplateNotFoundException(template_name="feedback_new_ticket.html")
    
    try:
        html_body = template.render(
            subject=email_subject,
            ticket_id=ticket_id,
            feedback_subject=subject,
            description=description,
            priority=priority,
            department=department,
            feedback_type="Feedback",  # Could be enhanced to pass actual type
            submitted_by_name=submitted_by_name,
            submitted_by_email=submitted_by_email,
            submitted_on=datetime.now().strftime("%Y-%m-%d %H:%M:%S UTC"),
            ticket_url=ticket_url
        )
    except TemplateError as e:
        raise TemplateRenderException(template_name="feedback_new_ticket.html", reason=str(e))
    
    # Send to submitter
    send_email(submitted_by_email, email_subject, html_body)
    
    # Send to admin
    send_email(settings.ADMIN_EMAIL, email_subject, html_body)


def send_feedback_status_update_email(
    ticket_id: str,
    subject: str,
    old_status: str,
    new_status: str,
    updated_by_name: str,
    submitted_by_email: str,
    feedback_id: str
):
    """
    Send feedback status update notification email
    """
    email_subject = EMAIL_FEEDBACK_STATUS_UPDATE_SUBJECT
    ticket_url = f"{settings.FRONTEND_URL}/feedback/{feedback_id}"
    
    # Load and render HTML template
    try:
        template = jinja_env.get_template("feedback_status_update.html")
    except TemplateNotFound:
        raise TemplateNotFoundException(template_name="feedback_status_update.html")
    
    try:
        html_body = template.render(
            subject=email_subject,
            ticket_id=ticket_id,
            feedback_subject=subject,
            old_status=old_status,
            new_status=new_status,
            updated_by_name=updated_by_name,
            updated_on=datetime.now().strftime("%Y-%m-%d %H:%M:%S UTC"),
            ticket_url=ticket_url
        )
    except TemplateError as e:
        raise TemplateRenderException(template_name="feedback_status_update.html", reason=str(e))
    
    # Send to submitter
    send_email(submitted_by_email, email_subject, html_body)
    
    # Send to admin
    send_email(settings.ADMIN_EMAIL, email_subject, html_body)


def send_feedback_new_comment_email(
    ticket_id: str,
    subject: str,
    comment: str,
    commented_by_name: str,
    submitted_by_email: str,
    feedback_id: str
):
    """
    Send new comment notification email
    """
    email_subject = EMAIL_FEEDBACK_NEW_COMMENT_SUBJECT
    ticket_url = f"{settings.FRONTEND_URL}/feedback/{feedback_id}"
    
    # Load and render HTML template
    try:
        template = jinja_env.get_template("feedback_new_comment.html")
    except TemplateNotFound:
        raise TemplateNotFoundException(template_name="feedback_new_comment.html")
    
    try:
        html_body = template.render(
            subject=email_subject,
            ticket_id=ticket_id,
            feedback_subject=subject,
            comment=comment,
            commented_by_name=commented_by_name,
            commented_on=datetime.now().strftime("%Y-%m-%d %H:%M:%S UTC"),
            ticket_url=ticket_url
        )
    except TemplateError as e:
        raise TemplateRenderException(template_name="feedback_new_comment.html", reason=str(e))
    
    # Send to submitter
    send_email(submitted_by_email, email_subject, html_body)
    
    # Send to admin
    send_email(settings.ADMIN_EMAIL, email_subject, html_body)
def send_password_reset_email(user_email: str, reset_link: str, first_name: str):
    """
    Send password reset link to user's email with HTML template
    Clean exception handling!
    
    Args:
        user_email: User's email address
        reset_link: Password reset URL with token
        first_name: User's first name for personalization
        
    Raises:
        TemplateNotFoundException: If template file not found
        TemplateRenderException: If template rendering fails
        EmailServiceException: If email sending fails
    """
    subject = EMAIL_PASSWORD_RESET_SUBJECT
    
    # Load and render HTML template
    try:
        template = jinja_env.get_template("password_reset_email.html")
    except TemplateNotFound:
        raise TemplateNotFoundException(template_name="password_reset_email.html")
    
    try:
        html_body = template.render(
            first_name=first_name,
            reset_link=reset_link,
            expiry_minutes=PASSWORD_RESET_TOKEN_EXPIRY_MINUTES
        )
    except TemplateError as e:
        raise TemplateRenderException(template_name="password_reset_email.html", reason=str(e))
    
    # Send email using configured service (Azure AD or SMTP with auto-fallback)
    send_email(user_email, subject, html_body)
