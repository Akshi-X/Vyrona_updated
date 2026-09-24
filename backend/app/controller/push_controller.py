"""
Push Notification Controller
Manages Web Push subscriptions and per-user/per-device notification preferences.
"""
import logging
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config.config import settings
from app.config.database import get_db
from app.dependencies.auth_dependencies import get_current_user
from app.models.push_subscription_model import PushSubscription
from app.models.user_model import User
from app.service.push_notification_service import (
    push_notifications_configured,
    send_web_push,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/push", tags=["Push Notifications"])


class SubscribeKeys(BaseModel):
    p256dh: str
    auth: str


class SubscribeRequest(BaseModel):
    endpoint: str
    keys: SubscribeKeys
    device_label: Optional[str] = None


class UnsubscribeRequest(BaseModel):
    endpoint: str


class PreferencesUpdateRequest(BaseModel):
    push_enabled: bool


class SubscriptionPatchRequest(BaseModel):
    enabled: bool


class SubscriptionSummary(BaseModel):
    id: int
    device_label: Optional[str] = None
    user_agent: Optional[str] = None
    enabled: bool
    current: bool
    created_at: Optional[datetime] = None
    last_used_at: Optional[datetime] = None


def _device_label_from_user_agent(user_agent: Optional[str]) -> str:
    if not user_agent:
        return "Unknown device"
    ua = user_agent.lower()
    if "edg/" in ua:
        browser = "Edge"
    elif "chrome/" in ua and "chromium" not in ua:
        browser = "Chrome"
    elif "firefox/" in ua:
        browser = "Firefox"
    elif "safari/" in ua and "chrome/" not in ua:
        browser = "Safari"
    else:
        browser = "Browser"

    if "android" in ua:
        os_name = "Android"
    elif "iphone" in ua or "ipad" in ua:
        os_name = "iOS"
    elif "mac os" in ua:
        os_name = "macOS"
    elif "windows" in ua:
        os_name = "Windows"
    elif "linux" in ua:
        os_name = "Linux"
    else:
        os_name = ""

    return f"{browser} on {os_name}" if os_name else browser


@router.get("/vapid-public-key")
def get_vapid_public_key():
    """Public VAPID key the frontend needs to call pushManager.subscribe()."""
    if not push_notifications_configured():
        raise HTTPException(status_code=503, detail="Push notifications are not configured")
    return {"public_key": settings.VAPID_PUBLIC_KEY}


@router.post("/subscribe")
def subscribe(
    request_data: SubscribeRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create or update a push subscription for the current user's browser."""
    # user_agent is read from the request header, not the JSON body — Windows
    # UA strings ("...; Win64; x64...") trip SanitizationMiddleware's command
    # injection regex (`;\s*\w+`) when sent as a body field.
    user_agent = request.headers.get("user-agent")

    subscription = (
        db.query(PushSubscription)
        .filter(PushSubscription.endpoint == request_data.endpoint)
        .first()
    )

    device_label = request_data.device_label or _device_label_from_user_agent(
        user_agent
    )

    if subscription:
        # Endpoint already registered — reassign to the current user (covers a
        # shared workstation where a different account now owns this browser).
        subscription.user_id = current_user.user_id
        subscription.p256dh = request_data.keys.p256dh
        subscription.auth = request_data.keys.auth
        subscription.user_agent = user_agent
        subscription.device_label = device_label
        subscription.enabled = True
        subscription.failure_count = 0
        subscription.last_failure_at = None
    else:
        subscription = PushSubscription(
            user_id=current_user.user_id,
            endpoint=request_data.endpoint,
            p256dh=request_data.keys.p256dh,
            auth=request_data.keys.auth,
            user_agent=user_agent,
            device_label=device_label,
            enabled=True,
        )
        db.add(subscription)

    db.commit()
    db.refresh(subscription)

    return {"id": subscription.id, "device_label": subscription.device_label, "enabled": subscription.enabled}


@router.delete("/subscribe")
def unsubscribe(
    request_data: UnsubscribeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a push subscription by endpoint (called on unsubscribe / logout)."""
    subscription = (
        db.query(PushSubscription)
        .filter(
            PushSubscription.endpoint == request_data.endpoint,
            PushSubscription.user_id == current_user.user_id,
        )
        .first()
    )
    if subscription:
        db.delete(subscription)
        db.commit()
    return {"deleted": bool(subscription)}


@router.get("/preferences")
def get_preferences(
    endpoint: Optional[str] = Query(None, description="Current browser's subscription endpoint"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Global opt-out + list of this user's registered devices."""
    subscriptions = (
        db.query(PushSubscription)
        .filter(PushSubscription.user_id == current_user.user_id)
        .order_by(PushSubscription.created_at.desc())
        .all()
    )
    return {
        "push_enabled": bool(current_user.push_enabled),
        "subscriptions": [
            SubscriptionSummary(
                id=s.id,
                device_label=s.device_label,
                user_agent=s.user_agent,
                enabled=s.enabled,
                current=bool(endpoint) and s.endpoint == endpoint,
                created_at=s.created_at,
                last_used_at=s.last_used_at,
            )
            for s in subscriptions
        ],
    }


@router.put("/preferences")
def update_preferences(
    request_data: PreferencesUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Account-wide push opt-out. Subscription rows are kept so re-enabling
    doesn't require re-granting browser permission on every device."""
    current_user.push_enabled = request_data.push_enabled
    db.commit()
    return {"push_enabled": current_user.push_enabled}


@router.patch("/subscriptions/{subscription_id}")
def update_subscription(
    subscription_id: int,
    request_data: SubscriptionPatchRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Per-device enable/disable toggle."""
    subscription = (
        db.query(PushSubscription)
        .filter(
            PushSubscription.id == subscription_id,
            PushSubscription.user_id == current_user.user_id,
        )
        .first()
    )
    if not subscription:
        raise HTTPException(status_code=404, detail="Subscription not found")

    subscription.enabled = request_data.enabled
    db.commit()
    return {"id": subscription.id, "enabled": subscription.enabled}


@router.delete("/subscriptions/{subscription_id}")
def delete_subscription(
    subscription_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Remove a registered device."""
    subscription = (
        db.query(PushSubscription)
        .filter(
            PushSubscription.id == subscription_id,
            PushSubscription.user_id == current_user.user_id,
        )
        .first()
    )
    if not subscription:
        raise HTTPException(status_code=404, detail="Subscription not found")

    db.delete(subscription)
    db.commit()
    return {"deleted": True}


@router.post("/test")
def send_test_notification(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Send a test push to every enabled subscription of the current user."""
    if not push_notifications_configured():
        raise HTTPException(status_code=503, detail="Push notifications are not configured")

    subscriptions: List[PushSubscription] = (
        db.query(PushSubscription)
        .filter(
            PushSubscription.user_id == current_user.user_id,
            PushSubscription.enabled == True,
        )
        .all()
    )
    if not subscriptions:
        raise HTTPException(status_code=404, detail="No registered devices for this user")

    payload = {
        "title": "Vyrona test notification",
        "body": "Push notifications are working on this device.",
        "url": f"{settings.FRONTEND_URL}/user-profile",
    }

    sent_count = sum(1 for s in subscriptions if send_web_push(db, s, payload))
    return {"sent": sent_count, "total": len(subscriptions)}
