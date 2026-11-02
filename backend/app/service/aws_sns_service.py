"""
AWS SNS Service
Handles critical alert broadcasting and SMS notification delivery via Amazon SNS.
"""

import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from app.config.config import settings

logger = logging.getLogger(__name__)

# Optional import of boto3 so application runs even in environments without AWS SDK
try:
    import boto3
    from botocore.exceptions import BotoCoreError, ClientError
    BOTO3_AVAILABLE = True
except ImportError:
    boto3 = None
    BOTO3_AVAILABLE = False


class AWSSNSService:
    """Service for publishing alerts and SMS messages through AWS Simple Notification Service."""

    def __init__(self):
        self.region = settings.AWS_REGION or "ap-south-2"
        self.topic_arn = settings.AWS_SNS_TOPIC_ARN
        self.default_phone = settings.AWS_SNS_PHONE_NUMBER
        self.enabled = settings.AWS_SNS_ENABLED
        self._client = None

    def _get_client(self):
        if not self.enabled:
            return None
        if not BOTO3_AVAILABLE:
            logger.info("boto3 not installed; AWS SNS running in simulated logging mode.")
            return None

        if self._client is None:
            try:
                kwargs: Dict[str, Any] = {"region_name": self.region}
                # If explicit keys are provided, use them; otherwise boto3 automatically
                # resolves EC2 IAM Role credentials (recommended for security).
                if settings.AWS_ACCESS_KEY_ID and settings.AWS_SECRET_ACCESS_KEY:
                    kwargs["aws_access_key_id"] = settings.AWS_ACCESS_KEY_ID
                    kwargs["aws_secret_access_key"] = settings.AWS_SECRET_ACCESS_KEY

                self._client = boto3.client("sns", **kwargs)
            except Exception as exc:
                logger.warning("Failed to initialize AWS SNS client: %s", exc)
                return None

        return self._client

    def format_alert_message(self, alert: Any, device_label: str) -> str:
        """Format a human-readable emergency alert message suitable for SMS and Email."""
        occurred_str = (
            alert.occurred_at.strftime("%Y-%m-%d %H:%M:%S UTC")
            if hasattr(alert, "occurred_at") and alert.occurred_at
            else datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
        )
        return (
            f"🚨 VYRONA CRITICAL ALERT 🚨\n"
            f"Device: {device_label}\n"
            f"Severity: {alert.severity.upper()}\n"
            f"Alert: {alert.alert_type}\n"
            f"Details: {alert.message}\n"
            f"Time: {occurred_str}\n"
            f"Alert ID: {alert.alert_id}\n"
            f"Action: Immediate clinical review required."
        )

    def publish_critical_alert(
        self,
        alert: Any,
        device_label: str,
        target_phone: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Publish a critical alert to AWS SNS topic and/or direct SMS.
        Falls back to structured local logging if SNS topic is not yet provisioned.
        """
        message_text = self.format_alert_message(alert, device_label)
        subject = f"Vyrona Alert [{alert.severity.upper()}]: {device_label}"
        if len(subject) > 100:
            subject = subject[:97] + "..."

        result = {
            "topic_published": False,
            "sms_sent": False,
            "topic_message_id": None,
            "sms_message_id": None,
            "mode": "simulated",
        }

        client = self._get_client()

        # 1. Publish to SNS Topic (Fans out to Email, Slack webhooks, SMS subscribers)
        if client and self.topic_arn:
            try:
                topic_response = client.publish(
                    TopicArn=self.topic_arn,
                    Subject=subject,
                    Message=message_text,
                    MessageAttributes={
                        "severity": {"DataType": "String", "StringValue": str(alert.severity)},
                        "alert_type": {"DataType": "String", "StringValue": str(alert.alert_type)},
                        "device": {"DataType": "String", "StringValue": str(device_label)},
                    },
                )
                result["topic_published"] = True
                result["topic_message_id"] = topic_response.get("MessageId")
                result["mode"] = "live"
                logger.info(
                    "📢 [AWS SNS TOPIC] Published alert %s to %s (MsgId: %s)",
                    alert.alert_id,
                    self.topic_arn,
                    result["topic_message_id"],
                )
            except Exception as exc:
                logger.error("Failed to publish alert %s to SNS Topic %s: %s", alert.alert_id, self.topic_arn, exc)
                result["topic_error"] = str(exc)

        # 2. Publish direct emergency SMS (if recipient phone number is provided or configured)
        recipient_phone = target_phone or self.default_phone
        if client and recipient_phone:
            try:
                sms_response = client.publish(
                    PhoneNumber=recipient_phone,
                    Message=message_text,
                    MessageAttributes={
                        "AWS.SNS.SMS.SMSType": {
                            "DataType": "String",
                            "StringValue": "Transactional",
                        }
                    },
                )
                result["sms_sent"] = True
                result["sms_message_id"] = sms_response.get("MessageId")
                result["mode"] = "live"
                logger.info(
                    "📱 [AWS SNS SMS] Sent emergency SMS for alert %s to %s (MsgId: %s)",
                    alert.alert_id,
                    recipient_phone,
                    result["sms_message_id"],
                )
            except Exception as exc:
                logger.error("Failed to send direct SMS for alert %s to %s: %s", alert.alert_id, recipient_phone, exc)

        # 3. If no live AWS SNS topic/client, print clean structured audit log
        if not result["topic_published"] and not result["sms_sent"]:
            logger.info(
                "\n"
                "======================================================================\n"
                "📢 [AWS SNS DISPATCH SIMULATION] Critical Alert Broadcast Ready\n"
                "----------------------------------------------------------------------\n"
                "Alert ID:     %s\n"
                "Severity:     %s\n"
                "Device:       %s\n"
                "Topic ARN:    %s\n"
                "SMS Target:   %s\n"
                "Message Body:\n%s\n"
                "======================================================================",
                alert.alert_id,
                alert.severity,
                device_label,
                self.topic_arn or "(Not configured - add AWS_SNS_TOPIC_ARN in .env)",
                recipient_phone or "(Not configured - add AWS_SNS_PHONE_NUMBER in .env)",
                message_text,
            )

        return result


# Singleton instance for simple importing
sns_service = AWSSNSService()
