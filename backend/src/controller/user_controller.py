import os

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from starlette.responses import FileResponse
from datetime import datetime

from src.config import database
from src.models import user_model
from src.service import user_service
from src.schemas import user_schema
from src.utils import utils

router = APIRouter(prefix="/api")


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
# Pydantic model for approve/reject
# ---------------------------
class RegistrationAction(BaseModel):
    registration_id: str


# ---------------------------
# Get user details
# ---------------------------
@router.get("/user/{registration_id}")
def get_user(registration_id: str, db: Session = Depends(database.get_db)):
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
    user.updated_at = datetime.utcnow()

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
    user.updated_at = datetime.utcnow()
    db.commit()
    return {"detail": f"User {user.first_name} rejected successfully"}
