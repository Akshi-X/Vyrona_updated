# OTP Configuration & Usage Guide

## Overview

The Vyrona backend now supports two OTP modes:

1. **FIXED_OTP_MODE** (Docker Compose) - For development/testing
2. **Production Mode** - For live environments with SMTP/SendGrid

---

## Mode 1: FIXED_OTP_MODE (Docker Compose)

**When**: Local development, Docker Compose testing  
**Configuration**: Set in `docker-compose.yml`

```yaml
environment:
  - FIXED_OTP_MODE=true
  - FIXED_OTP_CODE=123456
```

### Behavior
- ✅ Generates OTP automatically (fixed code: `123456`)
- ✅ **Any OTP can be used to login** (for testing - makes QA easier)
- ✅ No SMTP/SendGrid required
- ✅ No email sending
- ✅ Fast testing without email delays

### How to Use
```
1. User tries to login → OTP is generated with fixed code
2. Frontend shows "OTP sent" message
3. User can enter ANY 6-digit number (e.g., 111111, 999999, 123456)
4. Backend accepts it → User logs in successfully
```

### Example Flow
```
Email: test@example.com
Password: correct_password
→ OTP generated: 123456 (fixed)
→ Enter any code (e.g., 555555) → Login succeeds! ✅
```

---

## Mode 2: Production Mode (SMTP)

**When**: Live environment, real user testing  
**Configuration**: Set in `.env` file

```env
FIXED_OTP_MODE=false
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SENDER_EMAIL=noreply@mygrape.com
```

### Behavior
- ✅ Generates random OTP code (6 digits)
- ✅ Sends OTP via SMTP/SendGrid to user's email
- ✅ User must enter the exact OTP received in email
- ✅ OTP expires after 10 minutes
- ✅ Failed attempts tracked

### How to Use
```
1. User tries to login → Random OTP generated
2. Email sent to user
3. User enters OTP from email
4. Backend verifies exact match → User logs in ✅
```

### Example Flow
```
Email: user@hospital.com
Password: correct_password
→ OTP generated: 847392
→ Email sent to user@hospital.com
→ User receives email with OTP: 847392
→ User enters 847392 → Login succeeds! ✅
→ User enters 111111 → Login fails ❌
```

---

## Docker Compose Setup

### Current Configuration
`docker-compose.yml` is already configured for FIXED_OTP_MODE:

```yaml
backend:
  environment:
    - FIXED_OTP_MODE=true
    - FIXED_OTP_CODE=123456
    - SMTP_SERVER=smtp4dev
    - SMTP_PORT=2525
```

### Switching Modes

**To use FIXED_OTP_MODE (development):**
```yaml
environment:
  - FIXED_OTP_MODE=true
  - FIXED_OTP_CODE=123456
```

**To use Production Mode (with real SMTP):**
```yaml
environment:
  - FIXED_OTP_MODE=false
  - SMTP_SERVER=smtp.gmail.com
  - SMTP_PORT=587
  - SMTP_USERNAME=${SMTP_USERNAME}
  - SMTP_PASSWORD=${SMTP_PASSWORD}
```

---

## Code Changes

### 1. OTP Service (`otp_service.py`)

**New behavior in `verify_otp()`:**
```python
# In FIXED_OTP_MODE: Accept ANY OTP (for testing)
if settings.FIXED_OTP_MODE:
    return True  # Any code works
else:
    # Production: Verify exact match
    if otp.otp_code != otp_code:
        return False
```

**Enhanced `send_otp_to_user()`:**
- Skips email sending in FIXED_OTP_MODE
- Improved logging with mode information
- Better error messages

### 2. Email Service (`email_service.py`)

**Fixed `send_otp_email()`:**
```python
# Explicitly use SMTP (production default)
send_email(user_email, subject, html_body, use_smtp=True)
```

**Fixed `send_approval_email()`:**
```python
# Explicitly use SMTP
send_email(recipient_email, subject, html_body, use_smtp=True)
```

---

## Testing Checklist

### ✅ Docker Compose (FIXED_OTP_MODE=true)

```
1. Run: docker compose up -d --build
2. Login with test user
3. Try OTP = 123456 → Should work ✅
4. Try OTP = 111111 → Should work ✅ (any code accepted)
5. Try OTP = 999999 → Should work ✅ (any code accepted)
6. Check logs: should show "FIXED_OTP_MODE enabled: skipping email send"
```

### ✅ Production Mode (FIXED_OTP_MODE=false)

```
1. Set .env: FIXED_OTP_MODE=false
2. Configure SMTP in .env
3. Run backend
4. Login with test user
5. Try OTP = random_code_from_email → Should work ✅
6. Try OTP = 123456 → Should fail ❌ (wrong code)
7. Check email inbox: should receive OTP email
8. Check logs: should show "Sending OTP email to..."
```

---

## Troubleshooting

### Issue: "Internal Server Error" on login

**Possible causes:**
1. SMTP not configured in production mode
2. SMTP credentials incorrect
3. Email template missing

**Solution:**
- Check backend logs: `docker logs mgscale-backend`
- Ensure SMTP_SERVER, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD are set
- Or switch to FIXED_OTP_MODE=true for testing

### Issue: OTP accepted even in production mode

**Possible cause:**
- FIXED_OTP_MODE=true is still enabled

**Solution:**
- Verify `FIXED_OTP_MODE=false` in your environment
- Check docker-compose.yml or .env file

### Issue: Email not sending in production

**Possible causes:**
1. SMTP credentials wrong
2. Sender email not configured
3. Gmail requires app-specific password

**Solution:**
```bash
# Test SMTP connection
python -m smtplib -s smtp.gmail.com:587 -u your-email@gmail.com
```

---

## Summary

| Feature | FIXED_OTP_MODE | Production |
|---------|---|---|
| Mode | `true` | `false` |
| OTP Type | Fixed (123456) | Random |
| Email Sending | ❌ Skipped | ✅ Sent |
| Any OTP Works | ✅ Yes | ❌ No |
| SMTP Required | ❌ No | ✅ Yes |
| Use Case | Development | Live |
| QA Testing | ✅ Fast | ❌ Slow |

---

## Configuration Examples

### .env (Production)
```env
FIXED_OTP_MODE=false
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=noreply@mygrape.com
SMTP_PASSWORD=abcd1234efgh5678
SENDER_EMAIL=noreply@mygrape.com
SECRET_KEY=your-secret-key-here
FRONTEND_URL=https://app.mygrape.com
BACKEND_URL=https://api.mygrape.com
```

### docker-compose.yml (Development)
```yaml
backend:
  environment:
    - FIXED_OTP_MODE=true
    - FIXED_OTP_CODE=123456
    - SMTP_SERVER=smtp4dev
    - SMTP_PORT=2525
```
