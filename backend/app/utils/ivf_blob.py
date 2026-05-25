"""
Azure Blob Storage helpers for IVF media (oocyte images, cycle reports).

Paths stored in DB are full blob URLs so the frontend can load them directly
from Azurite (local) or Azure (production) without a proxy.

Blob layout:
  ivf/oocytes/{cycle_id}/{grade_id}/{name}_{uuid}{ext}   — oocyte images
  ivf/reports/{cycle_id}/{uuid}{ext}                     — cycle PDF reports
"""

import logging
from typing import List, Optional
from uuid import uuid4

logger = logging.getLogger(__name__)

_client = None
_container_ready: set[str] = set()


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


def _ensure_container(name: str) -> None:
    if name in _container_ready:
        return
    client = _get_client()
    container = client.get_container_client(name)
    try:
        container.create_container(public_access="blob")
    except Exception:
        pass  # already exists
    _container_ready.add(name)


def upload_bytes(
    data: bytes,
    blob_path: str,
    content_type: str = "application/octet-stream",
) -> str:
    """Upload raw bytes and return the public blob URL."""
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
        marker = f"/{container_name}/"
        idx = url.find(marker)
        if idx == -1:
            logger.warning("Cannot extract blob name from URL: %s", url)
            return
        blob_name = url[idx + len(marker):]
        _get_client().get_blob_client(container=container_name, blob=blob_name).delete_blob()
    except Exception as exc:
        logger.warning("Blob delete failed for %s: %s", url, exc)


def delete_blobs_by_urls(urls: List[Optional[str]]) -> None:
    """Delete multiple blobs, skipping None entries."""
    for url in urls:
        if url:
            delete_blob_by_url(url)
