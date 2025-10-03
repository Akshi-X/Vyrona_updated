from sqlalchemy.orm import Session


from src.models import user_model
from src.schemas import user_schema
from src.service.email_service import send_approval_email
from src.utils import utils


def register_user(db: Session, request: user_schema.UserRegister):
    if request.password != request.confirm_password:
        raise ValueError("Passwords do not match")

    reg_id = utils.generate_registration_id()
    user = user_model.User(
        registration_id=reg_id,
        first_name=request.first_name,
        last_name=request.last_name,
        email=request.email,
        password_hash=utils.hash_password(request.password),
        role=request.role,
        company_name=request.company_name,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Trigger email to owner
    send_approval_email(
        registration_id=reg_id,
        first_name=request.first_name,
        last_name=request.last_name,
        email=request.email,
        role=request.role,
        company=request.company_name
    )

    return user
