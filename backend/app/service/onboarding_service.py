from datetime import datetime, timezone
from sqlalchemy.orm import Session

from app.models.onboarding_state_model import OnboardingState
from app.models.onboarding_event_model import OnboardingEvent


def get_onboarding_state(user_id: str, db: Session):
    return db.query(OnboardingState).filter(OnboardingState.user_id == user_id).first()


def upsert_onboarding_state(user_id: str, state: dict, db: Session):
    existing = get_onboarding_state(user_id, db)
    if existing:
        existing.state = state
        existing.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(existing)
        return existing

    created = OnboardingState(
        user_id=user_id,
        state=state,
        created_at=datetime.now(timezone.utc),
    )
    db.add(created)
    db.commit()
    db.refresh(created)
    return created


def append_onboarding_events(user_id: str, events: list, db: Session):
    if not events:
        return 0

    rows = []
    for event in events:
        rows.append(
            OnboardingEvent(
                user_id=user_id,
                event_id=event.get("id"),
                event_type=event.get("type", "unknown"),
                level_id=event.get("levelId"),
                payload=event.get("payload"),
                created_at=datetime.now(timezone.utc),
            )
        )

    db.add_all(rows)
    db.commit()
    return len(rows)
