import json
import logging
from datetime import datetime, timezone
from typing import Optional

from pywebpush import WebPushException, webpush
from sqlalchemy.orm import Session

from ..config.config import settings
from ..models.push_subscription_model import PushSubscription

logger = logging.getLogger(__name__)


def push_notifications_configured() -> bool:
    """True when VAPID keys are present. Push is a silent no-op otherwise, same
    fail-soft posture as the Twilio WhatsApp integration."""
    return bool(
        settings.VAPID_PUBLIC_KEY and settings.VAPID_PRIVATE_KEY and settings.VAPID_SUBJECT
    )


def send_web_push(db: Session, subscription: PushSubscription, payload: dict) -> bool:
    """Send a single Web Push notification. Returns True on success.

    Deletes the subscription row on 404/410 (browser reports the endpoint is
    gone — this is the normal expiry path, not an error). On other failures,
    bumps failure_count/last_failure_at and leaves the row for retry.
    """
    if not push_notifications_configured():
        logger.debug("Skipping web push: VAPID keys not configured")
        return False

    try:
        webpush(
            subscription_info={
                "endpoint": subscription.endpoint,
                "keys": {
                    "p256dh": subscription.p256dh,
                    "auth": subscription.auth,
                },
            },
            data=json.dumps(payload),
            vapid_private_key=settings.VAPID_PRIVATE_KEY,
            vapid_claims={"sub": settings.VAPID_SUBJECT},
        )
        subscription.last_used_at = datetime.now(timezone.utc)
        subscription.failure_count = 0
        db.commit()
        return True
    except WebPushException as exc:
        status_code: Optional[int] = None
        if exc.response is not None:
            status_code = exc.response.status_code

        if status_code in (404, 410):
            logger.info(
                "Push subscription id=%s is gone (status=%s); removing",
                subscription.id, status_code,
            )
            db.delete(subscription)
            db.commit()
            return False

        logger.warning(
            "Web push failed for subscription id=%s (status=%s): %s",
            subscription.id, status_code, exc,
        )
        subscription.failure_count = (subscription.failure_count or 0) + 1
        subscription.last_failure_at = datetime.now(timezone.utc)
        db.commit()
        return False
    except Exception as exc:
        logger.error(
            "Unexpected error sending web push to subscription id=%s: %s",
            subscription.id, exc, exc_info=True,
        )
        subscription.failure_count = (subscription.failure_count or 0) + 1
        subscription.last_failure_at = datetime.now(timezone.utc)
        db.commit()
        return False
