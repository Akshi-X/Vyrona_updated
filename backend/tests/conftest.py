import pytest
import uuid

from app.config.database import SessionLocal
from app.models.user_model import User
from app.models.IVF.hospital_model import Hospital
from app.models.IVF.hospital_branch_model import HospitalBranch
from app.auth.auth import get_password_hash


@pytest.fixture
def setup_hospital_user():

    created_items = []

    def _create_user(role="Admin"):

        db = SessionLocal()

        # CREATE HOSPITAL
        hospital = Hospital(
            hospital_name="Test Hospital"
        )

        db.add(hospital)
        db.commit()
        db.refresh(hospital)

        # CREATE BRANCH
        branch = HospitalBranch(
            hospital_id=hospital.hospital_id,
            branch_name="Main Branch"
        )

        db.add(branch)
        db.commit()
        db.refresh(branch)

        # CREATE USER
        user = User(
            user_id=str(uuid.uuid4()),
            email=f"{uuid.uuid4()}@test.com",
            password_hash=get_password_hash("easyPeasy1!"),
            first_name="Test",
            last_name="User",
            role=role,
            status=True,
            approved_status="approved",
            hospital_id=hospital.hospital_id,
            branch_id=branch.branch_id
        )

        db.add(user)
        db.commit()
        db.refresh(user)

        created_items.append((db, user, branch, hospital))

        return {
            "db": db,
            "hospital": hospital,
            "branch": branch,
            "user": user
        }

    yield _create_user

    # CLEANUP
    for db, user, branch, hospital in created_items:

        db.delete(user)
        db.commit()

        db.delete(branch)
        db.commit()

        db.delete(hospital)
        db.commit()

        db.close()