import os

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from starlette.responses import FileResponse
from datetime import datetime, timedelta, timezone

from src.config import database
from src.models import user_model
from src.service import user_service
from src.service.otp_service import send_otp_to_user, verify_otp, get_user_by_email, get_user_by_user_id
from src.schemas import user_schema
from src.schemas.auth_schema import (
    LoginRequest, LoginResponse, LoginFailureResponse,
    VerifyOTPRequest, VerifyOTPSuccessResponse, VerifyOTPFailureResponse,
    ResendOTPRequest, ResendOTPSuccessResponse, ResendOTPFailureResponse
)
from src.utils import utils
from src.auth.auth import create_access_token, get_current_user, verify_password

router = APIRouter()


# ---------------------------
# Register endpoint
# ---------------------------
@router.post("/register", response_model=user_schema.UserResponse)
def register_user_endpoint(request: user_schema.UserRegister, db: Session = Depends(database.get_db)):
    try:
        user = user_service.register_user(db, request)  # <-- call the service function
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return user


# ---------------------------
# Login endpoint
# ---------------------------
@router.post("/login", response_model=LoginResponse)
def login_user(request: LoginRequest, db: Session = Depends(database.get_db)):
    # Find user by email
    user = get_user_by_email(db, request.email)
    
    if not user:
        raise HTTPException(
            status_code=400,
            detail=LoginFailureResponse(
                status="Failed",
                message="Invalid user ID or email. OTP could not be sent."
            ).model_dump()
        )
    
    # Check if user is approved
    if not user.status or user.approved_status != "approved":
        raise HTTPException(
            status_code=400,
            detail=LoginFailureResponse(
                status="Failed",
                message="User account is not approved yet."
            ).model_dump()
        )
    
    # Verify password
    if not verify_password(request.password, user.password_hash):
        raise HTTPException(
            status_code=400,
            detail=LoginFailureResponse(
                status="Failed",
                message="Invalid user ID or email. OTP could not be sent."
            ).model_dump()
        )
    
    # Generate and send OTP
    try:
        otp = send_otp_to_user(db, user.user_id, user.email)
        
        return LoginResponse(
            user_id=user.user_id,
            email=user.email,
            status="OTP Sent",
            otp_expiry=otp.expires_at,
            message="A one-time password (OTP) has been sent to your registered email."
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=LoginFailureResponse(
                status="Failed",
                message="Failed to send OTP. Please try again."
            ).model_dump()
        )


# ---------------------------
# Verify OTP endpoint
# ---------------------------
@router.post("/verify-otp", response_model=VerifyOTPSuccessResponse)
def verify_otp_endpoint(request: VerifyOTPRequest, db: Session = Depends(database.get_db)):
    # Verify OTP
    is_valid = verify_otp(db, request.user_id, request.otp)
    
    if not is_valid:
        raise HTTPException(
            status_code=400,
            detail=VerifyOTPFailureResponse(
                user_id=request.user_id,
                status="OTP Invalid",
                message="The OTP entered is incorrect or has expired."
            ).model_dump()
        )
    
    # Get user details
    user = get_user_by_user_id(db, request.user_id)
    if not user:
        raise HTTPException(
            status_code=404,
            detail=VerifyOTPFailureResponse(
                user_id=request.user_id,
                status="OTP Invalid",
                message="User not found."
            ).model_dump()
        )
    
    # Create JWT token
    access_token_expires = timedelta(minutes=30)
    access_token = create_access_token(
        data={"sub": user.user_id}, expires_delta=access_token_expires
    )
    
    return VerifyOTPSuccessResponse(
        user_id=user.user_id,
        email=user.email,
        status="Logged In",
        auth_token=access_token,
        expires_at=datetime.now(timezone.utc) + access_token_expires,
        message="OTP verified successfully. User is now logged in."
    )


# ---------------------------
# Resend OTP endpoint
# ---------------------------
@router.post("/resend-otp", response_model=ResendOTPSuccessResponse)
def resend_otp_endpoint(request: ResendOTPRequest, db: Session = Depends(database.get_db)):
    # Verify user exists and is approved
    user = get_user_by_user_id(db, request.user_id)
    
    if not user or user.email != request.email:
        raise HTTPException(
            status_code=400,
            detail=ResendOTPFailureResponse(
                status="Failed",
                message="Invalid user ID or email. OTP could not be sent."
            ).model_dump()
        )
    
    if not user.status or user.approved_status != "approved":
        raise HTTPException(
            status_code=400,
            detail=ResendOTPFailureResponse(
                status="Failed",
                message="User account is not approved yet."
            ).model_dump()
        )
    
    # Generate and send new OTP
    try:
        otp = send_otp_to_user(db, user.user_id, user.email)
        
        return ResendOTPSuccessResponse(
            user_id=user.user_id,
            email=user.email,
            status="OTP Resent",
            otp_expiry=otp.expires_at,
            message="A new one-time password (OTP) has been sent to your registered email."
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=ResendOTPFailureResponse(
                status="Failed",
                message="Failed to send OTP. Please try again."
            ).model_dump()
        )


# ---------------------------
# Pydantic model for approve/reject
# ---------------------------
class RegistrationAction(BaseModel):
    registration_id: str


# ---------------------------
# Get user details
# ---------------------------
@router.get("/user/{registration_id}")
def get_user(registration_id: str, db: Session = Depends(database.get_db), current_user: user_model.User = Depends(get_current_user)):
    user = db.query(user_model.User).filter(user_model.User.registration_id == registration_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "registration_id": user.registration_id,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "email": user.email,
        "role": user.role,
        "company_name": user.company_name,
        "approved_status": user.approved_status
    }


# ---------------------------
# Serve approval HTML
# ---------------------------
@router.get("/approval-screen", include_in_schema=False)
def approval_screen():
    html_path = os.path.join("static", "approvescreen.html")
    if not os.path.exists(html_path):
        raise HTTPException(status_code=404, detail="Approval screen not found")
    return FileResponse(html_path)


# ---------------------------
# Approve user
# ---------------------------
@router.post("/user/approve")
def approve_user(action: RegistrationAction, db: Session = Depends(database.get_db)):
    user = db.query(user_model.User).filter(user_model.User.registration_id == action.registration_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if not user.user_id:  # Only assign once
        user.user_id = utils.generate_user_id()

    user.approved_status = "approved"
    user.status = True
    user.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(user)

    return {
        "detail": f"User {user.first_name} approved successfully",
        "user_id": user.user_id
    }

# ---------------------------
# Reject user
# ---------------------------
@router.post("/user/reject")
def reject_user(action: RegistrationAction, db: Session = Depends(database.get_db)):
    user = db.query(user_model.User).filter(user_model.User.registration_id == action.registration_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.approved_status = "rejected"
    user.status = False
    user.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"detail": f"User {user.first_name} rejected successfully"}


# ---------------------------
# Protected endpoint example
# ---------------------------
@router.get("/profile")
def get_user_profile(current_user: user_model.User = Depends(get_current_user)):
    """Get current user's profile - requires JWT authentication"""
    return {
        "user_id": current_user.user_id,
        "email": current_user.email,
        "first_name": current_user.first_name,
        "last_name": current_user.last_name,
        "role": current_user.role,
        "company_name": current_user.company_name,
        "approved_status": current_user.approved_status
    }
