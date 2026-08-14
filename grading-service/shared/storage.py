"""
Azure Blob Storage helpers for the Grading Service.

The container is PRIVATE. This module reads the uploaded input image and writes
the segmentation output images. Blob layout follows the backend convention:
  ivf/oocytes/{cycle_id}/{grade_id}/{label}_{uuid}.jpg
"""
import logging
import os
import sys
from pathlib import Path
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).parent.parent))
from config import config

logger = logging.getLogger(__name__)

_client = None
_container_ready: set[str] = set()


def _get_client():
    global _client
    if _client is None:
        from azure.storage.blob import BlobServiceClient  # pyright: ignore[reportMissingImports]
        if not config.AZURE_STORAGE_CONNECTION_STRING:
            raise RuntimeError("AZURE_STORAGE_CONNECTION_STRING is not set.")
        _client = BlobServiceClient.from_connection_string(config.AZURE_STORAGE_CONNECTION_STRING)
    return _client


def _ensure_container(name: str) -> None:
    if name in _container_ready:
        return
    container = _get_client().get_container_client(name)
    try:
        container.create_container()  # private — no public access
    except Exception:
        pass  # already exists
    _container_ready.add(name)


def _extract_blob_path(url: str, container_name: str) -> str | None:
    """Extract the blob path from a full blob URL, stripping any SAS query string."""
    marker = f"/{container_name}/"
    idx = url.find(marker)
    if idx == -1:
        return None
    return url[idx + len(marker):].split("?")[0]


def resolve_blob_path(image_id: str) -> str:
    """Normalize an image id (blob path or full blob URL) to a blob path."""
    return _extract_blob_path(image_id, config.AZURE_STORAGE_BLOB_CONTAINER) or image_id


def download_bytes(image_id: str) -> bytes:
    """
    Read an input image from storage. `image_id` may be a blob path
    (ivf/oocytes/...) or a full blob URL.
    """
    container_name = config.AZURE_STORAGE_BLOB_CONTAINER
    blob_path = resolve_blob_path(image_id)
    client = _get_client()
    blob = client.get_blob_client(container=container_name, blob=blob_path)
    return blob.download_blob().readall()


def upload_bytes(data: bytes, blob_path: str, content_type: str = "image/jpeg") -> str:
    """Upload raw bytes and return the raw blob URL (no SAS token)."""
    from azure.storage.blob import ContentSettings  # pyright: ignore[reportMissingImports]

    container_name = config.AZURE_STORAGE_BLOB_CONTAINER
    _ensure_container(container_name)
    blob = _get_client().get_blob_client(container=container_name, blob=blob_path)
    blob.upload_blob(data, overwrite=True, content_settings=ContentSettings(content_type=content_type))
    return blob.url


def make_blob_path(prefix: str, filename: str, label: str) -> str:
    """Build a unique blob path: prefix/label_{uuid}{ext}"""
    ext = os.path.splitext(filename or "")[1] or ".jpg"
    return f"{prefix}/{label}_{uuid4().hex}{ext}"
