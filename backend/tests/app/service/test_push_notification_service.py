"""
Unit tests for Push Notification Service
"""
from unittest.mock import MagicMock, Mock, patch

from pywebpush import WebPushException

from app.service import push_notification_service as pns


def _mock_subscription():
    subscription = Mock()
    subscription.id = 1
    subscription.endpoint = "https://push.example.com/abc"
    subscription.p256dh = "p256dh-key"
    subscription.auth = "auth-key"
    subscription.failure_count = 0
    subscription.last_used_at = None
    subscription.last_failure_at = None
    return subscription


# ==========================================
# push_notifications_configured
# ==========================================

@patch("app.service.push_notification_service.settings")
def test_push_notifications_configured_true_when_all_keys_present(mock_settings):
    mock_settings.VAPID_PUBLIC_KEY = "pub"
    mock_settings.VAPID_PRIVATE_KEY = "priv"
    mock_settings.VAPID_SUBJECT = "mailto:alerts@example.com"

    assert pns.push_notifications_configured() is True


@patch("app.service.push_notification_service.settings")
def test_push_notifications_configured_false_when_key_missing(mock_settings):
    mock_settings.VAPID_PUBLIC_KEY = "pub"
    mock_settings.VAPID_PRIVATE_KEY = None
    mock_settings.VAPID_SUBJECT = "mailto:alerts@example.com"

    assert pns.push_notifications_configured() is False


# ==========================================
# send_web_push
# ==========================================

@patch("app.service.push_notification_service.settings")
def test_send_web_push_noop_when_not_configured(mock_settings):
    mock_settings.VAPID_PUBLIC_KEY = None
    mock_settings.VAPID_PRIVATE_KEY = None
    mock_settings.VAPID_SUBJECT = None

    db = MagicMock()
    subscription = _mock_subscription()

    result = pns.send_web_push(db, subscription, {"title": "t", "body": "b"})

    assert result is False
    db.commit.assert_not_called()


@patch("app.service.push_notification_service.webpush")
@patch("app.service.push_notification_service.settings")
def test_send_web_push_success_updates_subscription(mock_settings, mock_webpush):
    mock_settings.VAPID_PUBLIC_KEY = "pub"
    mock_settings.VAPID_PRIVATE_KEY = "priv"
    mock_settings.VAPID_SUBJECT = "mailto:alerts@example.com"

    db = MagicMock()
    subscription = _mock_subscription()
    subscription.failure_count = 3

    result = pns.send_web_push(db, subscription, {"title": "t", "body": "b"})

    assert result is True
    mock_webpush.assert_called_once()
    call_kwargs = mock_webpush.call_args.kwargs
    assert call_kwargs["subscription_info"]["endpoint"] == subscription.endpoint
    assert call_kwargs["subscription_info"]["keys"]["p256dh"] == subscription.p256dh
    assert call_kwargs["subscription_info"]["keys"]["auth"] == subscription.auth
    assert call_kwargs["vapid_private_key"] == "priv"
    assert call_kwargs["vapid_claims"] == {"sub": "mailto:alerts@example.com"}

    assert subscription.failure_count == 0
    assert subscription.last_used_at is not None
    db.commit.assert_called_once()
    db.delete.assert_not_called()


@patch("app.service.push_notification_service.webpush")
@patch("app.service.push_notification_service.settings")
def test_send_web_push_deletes_subscription_on_410(mock_settings, mock_webpush):
    mock_settings.VAPID_PUBLIC_KEY = "pub"
    mock_settings.VAPID_PRIVATE_KEY = "priv"
    mock_settings.VAPID_SUBJECT = "mailto:alerts@example.com"

    response = Mock()
    response.status_code = 410
    mock_webpush.side_effect = WebPushException("gone", response=response)

    db = MagicMock()
    subscription = _mock_subscription()

    result = pns.send_web_push(db, subscription, {"title": "t", "body": "b"})

    assert result is False
    db.delete.assert_called_once_with(subscription)
    db.commit.assert_called_once()


@patch("app.service.push_notification_service.webpush")
@patch("app.service.push_notification_service.settings")
def test_send_web_push_deletes_subscription_on_404(mock_settings, mock_webpush):
    mock_settings.VAPID_PUBLIC_KEY = "pub"
    mock_settings.VAPID_PRIVATE_KEY = "priv"
    mock_settings.VAPID_SUBJECT = "mailto:alerts@example.com"

    response = Mock()
    response.status_code = 404
    mock_webpush.side_effect = WebPushException("not found", response=response)

    db = MagicMock()
    subscription = _mock_subscription()

    result = pns.send_web_push(db, subscription, {"title": "t", "body": "b"})

    assert result is False
    db.delete.assert_called_once_with(subscription)


@patch("app.service.push_notification_service.webpush")
@patch("app.service.push_notification_service.settings")
def test_send_web_push_bumps_failure_count_on_other_status(mock_settings, mock_webpush):
    mock_settings.VAPID_PUBLIC_KEY = "pub"
    mock_settings.VAPID_PRIVATE_KEY = "priv"
    mock_settings.VAPID_SUBJECT = "mailto:alerts@example.com"

    response = Mock()
    response.status_code = 500
    mock_webpush.side_effect = WebPushException("server error", response=response)

    db = MagicMock()
    subscription = _mock_subscription()
    subscription.failure_count = 2

    result = pns.send_web_push(db, subscription, {"title": "t", "body": "b"})

    assert result is False
    db.delete.assert_not_called()
    assert subscription.failure_count == 3
    assert subscription.last_failure_at is not None
    db.commit.assert_called_once()


@patch("app.service.push_notification_service.webpush")
@patch("app.service.push_notification_service.settings")
def test_send_web_push_handles_unexpected_exception(mock_settings, mock_webpush):
    mock_settings.VAPID_PUBLIC_KEY = "pub"
    mock_settings.VAPID_PRIVATE_KEY = "priv"
    mock_settings.VAPID_SUBJECT = "mailto:alerts@example.com"

    mock_webpush.side_effect = RuntimeError("boom")

    db = MagicMock()
    subscription = _mock_subscription()

    result = pns.send_web_push(db, subscription, {"title": "t", "body": "b"})

    assert result is False
    assert subscription.failure_count == 1
    db.commit.assert_called_once()
