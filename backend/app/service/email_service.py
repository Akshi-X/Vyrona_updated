import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from pathlib import Path
from datetime import datetime
from jinja2 import Environment, FileSystemLoader, TemplateNotFound
from jinja2.exceptions import TemplateError
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail

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
# SENDGRID FUNCTIONS
# ============================================

def send_email_via_sendgrid(recipient_email: str, subject: str, html_body: str):
    """
    Send email using SendGrid API
    
    Args:
        recipient_email: Email address to send to
        subject: Email subject
        html_body: HTML content of email
        
    Raises:
        EmailServiceException if sending fails
    """
    try:
        # Validate SendGrid configuration
        if not settings.SENDGRID_API_KEY:
            raise EmailServiceException(
                recipient=recipient_email,
                reason="SendGrid API key not configured"
            )
        
        if not settings.SENDGRID_FROM_EMAIL:
            raise EmailServiceException(
                recipient=recipient_email,
                reason="SendGrid from email not configured"
            )
        
        # Initialize SendGrid client
        sg = SendGridAPIClient(api_key=settings.SENDGRID_API_KEY)
        
        # Create email message
        message = Mail(
            from_email=settings.SENDGRID_FROM_EMAIL,
            to_emails=recipient_email,
            subject=subject,
            html_content=html_body
        )
        
        # Send email
        logger.info(f"Sending email via SendGrid to {recipient_email}...")
        response = sg.send(message)
        
        # Check response status
        if response.status_code in [200, 202]:
            logger.info(f"Email sent successfully via SendGrid to {recipient_email}")
            logger.info(f"SendGrid Response Status: {response.status_code}")
        else:
            logger.error(f"SendGrid Error Response: {response.status_code} - {response.body}")
            raise EmailServiceException(
                recipient=recipient_email,
                reason=f"SendGrid API error: {response.status_code} - {response.body}"
            )
    
    except EmailServiceException:
        # Re-raise EmailServiceException as-is
        raise
    except Exception as e:
        logger.error(f"SendGrid error: {type(e).__name__}: {str(e)}")
        raise EmailServiceException(
            recipient=recipient_email,
            reason=f"SendGrid email send failed: {str(e)}"
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
        logger.info(f"Connecting to SMTP: {settings.SMTP_SERVER}:{settings.SMTP_PORT}")
        server = smtplib.SMTP(settings.SMTP_SERVER, settings.SMTP_PORT, timeout=30)
        server.ehlo()
        
        logger.info(f"Starting TLS...")
        server.starttls()
        server.ehlo()
        
        logger.info(f"Logging in as {settings.SENDER_EMAIL}...")
        server.login(settings.SENDER_EMAIL, settings.SENDER_PASSWORD)
        
        logger.info(f"Sending email to {recipient_email}...")
        server.sendmail(settings.SENDER_EMAIL, [recipient_email], msg.as_string())
        
        logger.info(f"Email sent successfully via SMTP to {recipient_email}")
        
    except EmailServiceException:
        raise
    except smtplib.SMTPAuthenticationError as e:
        logger.error(f"SMTP auth error: {str(e)}")
        raise EmailServiceException(
            recipient=recipient_email,
            reason=f"Authentication failed. Check SENDER_EMAIL and SENDER_PASSWORD in .env"
        )
    except smtplib.SMTPServerDisconnected as e:
        logger.error(f"SMTP disconnected: {str(e)}")
        raise EmailServiceException(
            recipient=recipient_email,
            reason=f"SMTP server disconnected. Try regenerating Gmail app password."
        )
    except smtplib.SMTPException as e:
        logger.error(f"SMTP error: {type(e).__name__}: {str(e)}")
        raise EmailServiceException(
            recipient=recipient_email,
            reason=f"SMTP error: {str(e)}"
        )
    except Exception as e:
        logger.error(f"General error: {type(e).__name__}: {str(e)}")
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
    Send email using configured service with fallback logic.
    
    Service priority based on EMAIL_SERVICE setting:
    1. SendGrid (if configured and available)
    2. SMTP (Gmail) - Fallback
    
    Args:
        recipient_email: Email address to send to
        subject: Email subject
        html_body: HTML content of email
        
    Raises:
        EmailServiceException if all services fail
    """
    logger.info(f"Attempting to send email to {recipient_email} using service: {settings.EMAIL_SERVICE}")
    
    # Try SendGrid first if configured
    if settings.EMAIL_SERVICE == "sendgrid":
        try:
            logger.info("Trying SendGrid service...")
            send_email_via_sendgrid(recipient_email, subject, html_body)
            return
            print(f"Email sent successfully via SendGrid to {recipient_email}")
        except EmailServiceException as e:
            reason = e.details.get('reason', 'Unknown error')
            logger.warning(f"SendGrid failed: {reason}, falling back to SMTP")
        except Exception as e:
            logger.warning(f"SendGrid error: {str(e)}, falling back to SMTP")
    
    # Fallback to SMTP
    try:
        logger.info("Trying SMTP service...")
        send_email_via_smtp(recipient_email, subject, html_body)
        return
    except EmailServiceException as e:
        reason = e.details.get('reason', 'Unknown error')
        logger.error(f"All email services failed. SMTP error: {reason}")
        raise
    except Exception as e:
        logger.error(f"All email services failed. Final error: {str(e)}")
        raise EmailServiceException(
            recipient=recipient_email,
            reason=f"All email services failed: {str(e)}"
        )


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
    
    Pharma admin approval system:
    - All registrations → Sent to Pharma Admin for that company
    
    Clean exception handling!
    """
    subject = EMAIL_APPROVAL_SUBJECT
    approval_url = f"{settings.FRONTEND_URL}/approval-screen?registration_id={registration_id}"
    
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
    feedback_id: str,
    mygrape_admin_email: str
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
    
    # Send to submitter (confirmation)
    send_email(submitted_by_email, email_subject, html_body)
    
    # Send to MyGrape admin (notification)
    send_email(mygrape_admin_email, email_subject, html_body)
    logger.info(f"Feedback notification sent to MyGrape admin: {mygrape_admin_email}")


def send_feedback_status_update_email(
    ticket_id: str,
    subject: str,
    old_status: str,
    new_status: str,
    updated_by_name: str,
    submitted_by_email: str,
    feedback_id: str,
    mygrape_admin_email: str
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
    
    # Send to submitter (confirmation)
    send_email(submitted_by_email, email_subject, html_body)
    
    # Send to MyGrape admin (notification)
    send_email(mygrape_admin_email, email_subject, html_body)
    logger.info(f"Feedback status update sent to MyGrape admin: {mygrape_admin_email}")


def send_feedback_new_comment_email(
    ticket_id: str,
    subject: str,
    comment: str,
    commented_by_name: str,
    submitted_by_email: str,
    feedback_id: str,
    mygrape_admin_email: str
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
    
    # Send to submitter (confirmation)
    send_email(submitted_by_email, email_subject, html_body)
    
    # Send to MyGrape admin (notification)
    send_email(mygrape_admin_email, email_subject, html_body)
    logger.info(f"Feedback comment notification sent to MyGrape admin: {mygrape_admin_email}")
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
