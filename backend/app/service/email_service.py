import logging
from typing import List, Optional
from pathlib import Path
from datetime import datetime, timezone
from jinja2 import Environment, FileSystemLoader, TemplateNotFound
from jinja2.exceptions import TemplateError
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.image import MIMEImage

from ..config.config import settings
from ..constants.app_constants import (
    EMAIL_APPROVAL_SUBJECT, EMAIL_OTP_SUBJECT, OTP_EXPIRY_MINUTES,
    EMAIL_FEEDBACK_NEW_TICKET_SUBJECT, EMAIL_FEEDBACK_STATUS_UPDATE_SUBJECT,
    EMAIL_FEEDBACK_NEW_COMMENT_SUBJECT,
    EMAIL_APPROVAL_SUBJECT,
    EMAIL_OTP_SUBJECT,
    EMAIL_PASSWORD_RESET_SUBJECT,
    EMAIL_USER_APPROVED_SUBJECT,
    EMAIL_INVITE_SUBJECT,
    OTP_EXPIRY_MINUTES,
    PASSWORD_RESET_TOKEN_EXPIRY_MINUTES
)
from ..exceptions import EmailServiceException, TemplateNotFoundException, TemplateRenderException

# Setup logger
logger = logging.getLogger(__name__)

# Setup Jinja2 template environment
TEMPLATE_DIR = Path(__file__).parent.parent / "templates" / "emails"
jinja_env = Environment(loader=FileSystemLoader(str(TEMPLATE_DIR)))

# Brand artwork shared by the transactional templates. The logo is embedded inline so
# it renders without a reachable host; the header texture stays a URL because cid:
# does not resolve inside a CSS background-image.
BRAND_ASSET_DIR = Path(__file__).resolve().parents[1] / "assets" / "email"
BRAND_LOGO_CID = "mg_logo"


def brand_logo_inline() -> dict:
    """{cid: path} for the header logo, empty when the asset is unavailable."""
    logo = BRAND_ASSET_DIR / "mygrape-logo.png"
    return {BRAND_LOGO_CID: str(logo)} if logo.is_file() else {}


def brand_banner_url() -> str:
    """Absolute URL for the header texture, or '' when no frontend host is configured."""
    return f"{settings.FRONTEND_URL}/banner-hex.png" if settings.FRONTEND_URL else ""


def _current_utc_timestamp(fmt: str = "%Y-%m-%d %H:%M:%S UTC") -> str:
    """
    Return current UTC timestamp as formatted string.
    """
    return datetime.now(timezone.utc).strftime(fmt)


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
        
        if not settings.SENDER_EMAIL:
            raise EmailServiceException(
                recipient=recipient_email,
                reason="Sender email not configured"
            )
        
        # Initialize SendGrid client
        sg = SendGridAPIClient(api_key=settings.SENDGRID_API_KEY)
        
        # Create email message
        message = Mail(
            from_email=settings.SENDER_EMAIL,
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


def send_email_via_smpt(
    recipient_email: str,
    subject: str,
    html_body: str,
    inline_images: Optional[dict] = None,
):
    """
    Send email using SMTP server

    Args:
        recipient_email: Email address to send to
        subject: Email subject
        html_body: HTML content of email
        inline_images: Optional {content_id: file_path} embedded in the message and
            referenced from the HTML as src="cid:content_id". Travels with the email,
            so it renders without a reachable host and usually without the recipient
            having to allow external images.

    Raises:
        EmailServiceException if sending fails
    """    
    try:
        # Validate SMTP configuration
        if not settings.SMTP_SERVER or not settings.SMTP_PORT:
            raise EmailServiceException(
                recipient=recipient_email,
                reason="SMTP server or port not configured"
            )
        
        # 'related' so inline images are part of the same body as the HTML that
        # references them; plain multipart would show them as loose attachments.
        msg = MIMEMultipart('related' if inline_images else 'mixed')
        msg['From'] = settings.SENDER_EMAIL  # Using same from email for consistency
        msg['To'] = recipient_email
        msg['Subject'] = subject
        msg.attach(MIMEText(html_body, 'html'))

        for content_id, image_path in (inline_images or {}).items():
            try:
                with open(image_path, 'rb') as fh:
                    part = MIMEImage(fh.read())
            except OSError as exc:
                # A missing asset must never block a critical alert.
                logger.warning("Inline image %s unreadable (%s); sending without it",
                               image_path, exc)
                continue
            part.add_header('Content-ID', f'<{content_id}>')
            # No filename: a named part is what makes Gmail list an inline image in the
            # attachment strip. These are decorative and referenced from the HTML by cid.
            part.add_header('Content-Disposition', 'inline')
            msg.attach(part)
        
        # Connect to SMTP server and send email
        logger.info(f"Sending email via SMTP to {recipient_email}...")

        if settings.SMTP_PORT == 587:
            # Use TLS
            with smtplib.SMTP(settings.SMTP_SERVER, settings.SMTP_PORT) as server:
                server.starttls()
                server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
                server.send_message(msg)
        else:
            with smtplib.SMTP(settings.SMTP_SERVER, settings.SMTP_PORT) as server:
                server.send_message(msg)
        
        logger.info(f"Email sent successfully via SMTP to {recipient_email}")
    
    except Exception as e:
        logger.error(f"SMTP error: {type(e).__name__}: {str(e)}")
        raise EmailServiceException(
            recipient=recipient_email,
            reason=f"SMTP email send failed: {str(e)}"
        )

def send_email(
    recipient_email: str,
    subject: str,
    html_body: str,
    use_smtp: bool = True,
    inline_images: Optional[dict] = None,
):
    """
    Send email using SendGrid or SMTP.

    Args:
        recipient_email: Email address to send to
        subject: Email subject
        html_body: HTML content of email
        use_smtp: If True, use SMTP instead of SendGrid
        
    Raises:
        EmailServiceException if sending fails
    """
    logger.info(f"Attempting to send email to {recipient_email} using {'SMTP' if use_smtp else 'SendGrid'}")
    if use_smtp:
        send_email_via_smpt(recipient_email, subject, html_body, inline_images=inline_images)
    else:
        # SendGrid path has no inline-image support here; it still delivers the HTML.
        if inline_images:
            logger.warning("inline_images ignored on the SendGrid path for %s", recipient_email)
        send_email_via_sendgrid(recipient_email, subject, html_body)


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
    
    # Send email using SendGrid
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
            expiry_minutes=OTP_EXPIRY_MINUTES,
            logo_url=f"cid:{BRAND_LOGO_CID}",
            banner_url=brand_banner_url(),
        )
    except TemplateError as e:
        raise TemplateRenderException(template_name="otp_email.html", reason=str(e))

    send_email(user_email, subject, html_body, inline_images=brand_logo_inline())


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
    mygrape_admin_email: str,
    send_to_user: bool = True,
    extra_recipient_emails: Optional[List[str]] = None
):
    """
    Send new feedback ticket notification email
    """
    email_subject = EMAIL_FEEDBACK_NEW_TICKET_SUBJECT
    ticket_url = f"{settings.FRONTEND_URL}/user-profile"
    
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
            submitted_on=datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
            ticket_url=ticket_url
        )
    except TemplateError as e:
        raise TemplateRenderException(template_name="feedback_new_ticket.html", reason=str(e))
    
    # Send to submitter (confirmation) only if send_to_user is True
    if send_to_user:
        send_email(submitted_by_email, email_subject, html_body)
    
    # Send to MyGrape admin (notification)
    send_email(mygrape_admin_email, email_subject, html_body)
    logger.info(f"Feedback notification sent to MyGrape admin: {mygrape_admin_email}")

    # Send to any extra recipients (e.g., support inbox)
    if extra_recipient_emails:
        for recipient in {email.strip() for email in extra_recipient_emails if email}:
            if recipient.lower() == mygrape_admin_email.lower() or recipient.lower() == submitted_by_email.lower():
                continue
            send_email(recipient, email_subject, html_body)
            logger.info(f"Feedback notification sent to extra recipient: {recipient}")


def send_feedback_status_update_email(
    ticket_id: str,
    subject: str,
    old_status: str,
    new_status: str,
    updated_by_name: str,
    submitted_by_email: str,
    feedback_id: str,
    mygrape_admin_email: str,
    send_to_user: bool = True
):
    """
    Send feedback status update notification email
    """
    email_subject = EMAIL_FEEDBACK_STATUS_UPDATE_SUBJECT
    ticket_url = f"{settings.FRONTEND_URL}/user-profile"
    
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
            updated_on=datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
            ticket_url=ticket_url
        )
    except TemplateError as e:
        raise TemplateRenderException(template_name="feedback_status_update.html", reason=str(e))
    
    # Send to submitter (confirmation) only if send_to_user is True
    if send_to_user:
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
    mygrape_admin_email: str,
    send_to_user: bool = True
):
    """
    Send new comment notification email
    """
    email_subject = EMAIL_FEEDBACK_NEW_COMMENT_SUBJECT
    ticket_url = f"{settings.FRONTEND_URL}/user-profile"
    
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
            commented_on=datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
            ticket_url=ticket_url
        )
    except TemplateError as e:
        raise TemplateRenderException(template_name="feedback_new_comment.html", reason=str(e))
    
    # Send to submitter (confirmation) only if send_to_user is True
    if send_to_user:
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
    
    # Send email using SendGrid
    send_email(user_email, subject, html_body)


def send_user_approved_notification(
    user_email: str, 
    first_name: str, 
    last_name: str, 
    role: str, 
    company: str,
    approved_date: str
):
    """
    Send user approval notification email with HTML template
    
    Args:
        user_email: User's email address
        first_name: User's first name
        last_name: User's last name
        role: User's role
        company: User's company
        approved_date: Date when approved
        
    Raises:
        TemplateNotFoundException: If template file not found
        TemplateRenderException: If template rendering fails
        EmailServiceException: If email sending fails
    """
    subject = EMAIL_USER_APPROVED_SUBJECT
    help_url = f"{settings.FRONTEND_URL}/help"
    
    # Load and render HTML template
    try:
        template = jinja_env.get_template("user_approved_notification.html")
    except TemplateNotFound:
        raise TemplateNotFoundException(template_name="user_approved_notification.html")
    
    try:
        html_body = template.render(
            subject=subject,
            first_name=first_name,
            last_name=last_name,
            email=user_email,
            role=role,
            company=company,
            approved_date=approved_date,
            help_url=help_url
        )
    except TemplateError as e:
        raise TemplateRenderException(template_name="user_approved_notification.html", reason=str(e))

    send_email(user_email, subject, html_body)


def send_invite_email(recipient_email: str, invited_by: str, role: str, company: str, signup_url: str):
    """Send an invite email to a prospective user with a signup link."""
    subject = EMAIL_INVITE_SUBJECT

    try:
        template = jinja_env.get_template("invite_email.html")
    except TemplateNotFound:
        raise TemplateNotFoundException(template_name="invite_email.html")

    try:
        html_body = template.render(
            subject=subject,
            invited_by=invited_by,
            role=role,
            company=company,
            signup_url=signup_url,
        )
    except TemplateError as e:
        raise TemplateRenderException(template_name="invite_email.html", reason=str(e))

    send_email(recipient_email, subject, html_body)