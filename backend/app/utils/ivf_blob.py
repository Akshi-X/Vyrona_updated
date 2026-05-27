"""
Azure Blob Storage helpers for IVF media (oocyte images, cycle reports).

Container is PRIVATE. Raw blob URLs stored in DB are never exposed directly.
Call generate_read_sas_url() to produce a short-lived read URL before returning
any URL in an API response.

Blob layout:
  ivf/oocytes/{cycle_id}/{grade_id}/{label}_{uuid}.jpg   — oocyte images
  ivf/reports/{cycle_id}/{uuid}{ext}                     — cycle PDF reports
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from uuid import uuid4

logger = logging.getLogger(__name__)

_client = None
_container_ready: set[str] = set()

READ_SAS_EXPIRY_MINUTES = 60


def _get_client():
    global _client
    if _client is None:
        from azure.storage.blob import BlobServiceClient  # pyright: ignore[reportMissingImports]
        from app.config.config import settings
        if not settings.AZURE_STORAGE_CONNECTION_STRING:
            raise RuntimeError(
                "AZURE_STORAGE_CONNECTION_STRING is not set. "
                "Add it to .env (use the Azurite dev string for local development)."
            )
        _client = BlobServiceClient.from_connection_string(settings.AZURE_STORAGE_CONNECTION_STRING)
    return _client


_cors_configured = False


def _ensure_cors() -> None:
    """Set permissive CORS on the storage account (needed for browser direct-upload via SAS)."""
    global _cors_configured
    if _cors_configured:
        return
    try:
        from azure.storage.blob import CorsRule  # pyright: ignore[reportMissingImports]
        rule = CorsRule(
            allowed_origins=["*"],
            allowed_methods=["GET", "PUT", "POST", "DELETE", "HEAD", "OPTIONS"],
            allowed_headers=["*"],
            exposed_headers=["*"],
            max_age_in_seconds=3600,
        )
        _get_client().set_service_properties(cors=[rule])
        _cors_configured = True
    except Exception as exc:
        logger.warning("CORS configuration skipped: %s", exc)


def _ensure_container(name: str) -> None:
    if name in _container_ready:
        return
    client = _get_client()
    _ensure_cors()
    container = client.get_container_client(name)
    try:
        container.create_container()  # private — no public_access
    except Exception:
        pass  # already exists
    _container_ready.add(name)


def _extract_blob_path(url: str, container_name: str) -> Optional[str]:
    """Extract the blob path from a full Azure blob URL, stripping any SAS query string."""
    marker = f"/{container_name}/"
    idx = url.find(marker)
    if idx == -1:
        return None
    return url[idx + len(marker):].split("?")[0]


def generate_read_sas_url(blob_url: str, expiry_minutes: int = READ_SAS_EXPIRY_MINUTES) -> str:
    """
    Convert a raw blob URL (stored in DB) to a short-lived read SAS URL.
    Returns the original URL unchanged if Azure is not configured or path extraction fails.
    """
    from azure.storage.blob import generate_blob_sas, BlobSasPermissions  # pyright: ignore[reportMissingImports]
    from app.config.config import settings

    try:
        container_name = settings.AZURE_STORAGE_BLOB_CONTAINER
        client = _get_client()
        blob_path = _extract_blob_path(blob_url, container_name)
        if not blob_path:
            return blob_url
        token = generate_blob_sas(
            account_name=client.account_name,
            container_name=container_name,
            blob_name=blob_path,
            account_key=client.credential.account_key,
            permission=BlobSasPermissions(read=True),
            expiry=datetime.now(timezone.utc) + timedelta(minutes=expiry_minutes),
        )
        blob_client = client.get_blob_client(container=container_name, blob=blob_path)
        return f"{blob_client.url}?{token}"
    except Exception as exc:
        logger.warning("generate_read_sas_url failed for %s: %s", blob_url, exc)
        return blob_url


def upload_bytes(
    data: bytes,
    blob_path: str,
    content_type: str = "application/octet-stream",
) -> str:
    """Upload raw bytes and return the raw blob URL (no SAS token)."""
    from app.config.config import settings
    from azure.storage.blob import ContentSettings  # pyright: ignore[reportMissingImports]

    container_name = settings.AZURE_STORAGE_BLOB_CONTAINER
    _ensure_container(container_name)
    client = _get_client()
    blob = client.get_blob_client(container=container_name, blob=blob_path)
    blob.upload_blob(data, overwrite=True, content_settings=ContentSettings(content_type=content_type))
    return blob.url


def make_blob_path(prefix: str, filename: str, label: str) -> str:
    """Build a unique blob path: prefix/label_{uuid}{ext}"""
    import os
    ext = os.path.splitext(filename or "")[1] or ".bin"
    return f"{prefix}/{label}_{uuid4().hex}{ext}"


def delete_blob_by_url(url: str) -> None:
    """Delete a blob given its full URL. Best-effort — swallows all errors."""
    try:
        from app.config.config import settings
        container_name = settings.AZURE_STORAGE_BLOB_CONTAINER
        blob_path = _extract_blob_path(url, container_name)
        if not blob_path:
            logger.warning("Cannot extract blob name from URL: %s", url)
            return
        _get_client().get_blob_client(container=container_name, blob=blob_path).delete_blob()
    except Exception as exc:
        logger.warning("Blob delete failed for %s: %s", url, exc)


def delete_blobs_by_urls(urls: List[Optional[str]]) -> None:
    """Delete multiple blobs, skipping None entries."""
    for url in urls:
        if url:
            delete_blob_by_url(url)


def generate_container_write_sas_url(expiry_minutes: int = 15) -> str:
    """
    Generate a short-lived container-scoped write SAS URL.
    The browser uploads blobs directly to Azure using this URL; no file bytes touch the backend.
    """
    from azure.storage.blob import generate_container_sas, ContainerSasPermissions  # pyright: ignore[reportMissingImports]
    from app.config.config import settings

    client = _get_client()
    token = generate_container_sas(
        account_name=client.account_name,
        container_name=settings.AZURE_STORAGE_BLOB_CONTAINER,
        account_key=client.credential.account_key,
        permission=ContainerSasPermissions(write=True, create=True),
        expiry=datetime.now(timezone.utc) + timedelta(minutes=expiry_minutes),
    )
    container_url = client.get_container_client(settings.AZURE_STORAGE_BLOB_CONTAINER).url
    return f"{container_url}?{token}"
