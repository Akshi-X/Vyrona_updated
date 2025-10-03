import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

SMTP_SERVER = "smtp.gmail.com"  # or smtp.gmail.com depending on provider
SMTP_PORT = 587
SENDER_EMAIL = "suriyadev3124@gmail.com"
RECEIVER_EMAIL = "jothikaraj272001@gmail.com"
SENDER_PASSWORD = "lojo yzay wllj iwvf"  # use src password, not normal password

def send_approval_email(registration_id: str, first_name: str, last_name: str, email: str, role: str, company: str):
    subject = "New User Registration Pending Approval"
    body = f"""
    A new user has registered. Please review the details:

    Name: {first_name} {last_name}
    Email: {email}
    Role: {role}
    Company: {company}

    To approve or reject, open the approval screen:
    http://localhost:8000/api/approval-screen?registration_id={registration_id}
    """

    msg = MIMEMultipart()
    msg["From"] = SENDER_EMAIL
    msg["To"] = RECEIVER_EMAIL
    msg["Subject"] = subject

    msg.attach(MIMEText(body, "plain"))

    try:
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            server.starttls()
            server.login(SENDER_EMAIL, SENDER_PASSWORD)
            server.sendmail(SENDER_EMAIL, RECEIVER_EMAIL, msg.as_string())
        print(f"Approval email sent to {RECEIVER_EMAIL}")
    except Exception as e:
        print(f"Error sending email: {e}")


def send_otp_email(user_email: str, otp_code: str):
    """Send OTP to user's email"""
    subject = "Your Login OTP - MyGrape"
    body = f"""
    Hello,
    
    Your one-time password (OTP) for login is: {otp_code}
    
    This OTP is valid for 10 minutes only.
    
    If you did not request this OTP, please ignore this email.
    
    Best regards,
    MyGrape Team
    """

    msg = MIMEMultipart()
    msg["From"] = SENDER_EMAIL
    msg["To"] = user_email
    msg["Subject"] = subject

    msg.attach(MIMEText(body, "plain"))

    try:
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            server.starttls()
            server.login(SENDER_EMAIL, SENDER_PASSWORD)
            server.sendmail(SENDER_EMAIL, user_email, msg.as_string())
        print(f"OTP email sent to {user_email}")
    except Exception as e:
        print(f"Error sending OTP email: {e}")
        raise e