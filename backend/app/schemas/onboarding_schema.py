from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class OnboardingStateResponse(BaseModel):
    state: Dict[str, Any]


class OnboardingStateUpdateRequest(BaseModel):
    state: Dict[str, Any]


class OnboardingEventPayload(BaseModel):
    id: Optional[str] = None
    type: str
    timestamp: str
    levelId: Optional[str] = None
    payload: Optional[Dict[str, Any]] = None


class OnboardingEventsRequest(BaseModel):
    events: List[OnboardingEventPayload] = Field(default_factory=list)
