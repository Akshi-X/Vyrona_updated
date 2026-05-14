from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.config import database
from app.dependencies.auth_dependencies import get_current_user
from app.models.user_model import User
from app.schemas.onboarding_schema import (
    OnboardingEventsRequest,
    OnboardingStateResponse,
    OnboardingStateUpdateRequest,
)
from app.service.onboarding_service import (
    append_onboarding_events,
    get_onboarding_state,
    upsert_onboarding_state,
)

router = APIRouter(tags=["Onboarding"])


@router.get("/onboarding/state", response_model=OnboardingStateResponse)
def get_onboarding_state_endpoint(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(database.get_db),
):
    record = get_onboarding_state(current_user.user_id, db)
    return OnboardingStateResponse(state=record.state if record else {})


@router.patch("/onboarding/state", response_model=OnboardingStateResponse)
def update_onboarding_state_endpoint(
    request: OnboardingStateUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(database.get_db),
):
    record = upsert_onboarding_state(current_user.user_id, request.state, db)
    return OnboardingStateResponse(state=record.state)


@router.post("/onboarding/complete")
def complete_onboarding_endpoint(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(database.get_db),
):
    user = db.query(User).filter(User.user_id == current_user.user_id).first()
    if user:
        user.onboarding_completed = True
        db.commit()
    return {"status": "ok", "user_id": current_user.user_id}


@router.post("/onboarding/events")
def append_onboarding_events_endpoint(
    request: OnboardingEventsRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(database.get_db),
):
    total = append_onboarding_events(
        current_user.user_id,
        [event.model_dump() for event in request.events],
        db,
    )
    return {"status": "ok", "inserted": total}
