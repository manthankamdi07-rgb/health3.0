"""
Storage service for handling physical file uploads and retrievals.
Supports local filesystem storage with path traversal protection and MIME validation.
"""

import os
import uuid
from pathlib import Path
from typing import Dict, Any, Set
import aiofiles
from fastapi import HTTPException, status

from app.config import get_settings


ALLOWED_CONTENT_TYPES: Set[str] = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
}

ALLOWED_EXTENSIONS: Set[str] = {
    ".pdf",
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
}


class StorageService:
    """Base storage service abstraction."""

    async def save_file(
        self,
        file_bytes: bytes,
        original_filename: str,
        content_type: str,
    ) -> Dict[str, Any]:
        raise NotImplementedError

    def get_file_path(self, storage_path: str) -> Path:
        raise NotImplementedError

    async def delete_file(self, storage_path: str) -> bool:
        raise NotImplementedError


class LocalStorageService(StorageService):
    """
    Local filesystem storage provider.
    Stores files in a configured upload directory with UUID-based filenames.
    """

    def __init__(self, upload_dir: str | None = None, max_size_bytes: int | None = None):
        settings = get_settings()
        configured_dir = upload_dir or settings.UPLOAD_DIR
        # In serverless environments like Vercel, the code root is read-only.
        # Direct relative upload paths to /tmp so local writes succeed without crashing.
        if os.environ.get("VERCEL") and not os.path.isabs(configured_dir):
            self.upload_dir = Path("/tmp") / configured_dir
        else:
            self.upload_dir = Path(configured_dir).resolve()

        self.max_size_bytes = max_size_bytes or settings.MAX_UPLOAD_SIZE_BYTES
        # Ensure upload directory exists
        self.upload_dir.mkdir(parents=True, exist_ok=True)

    def validate_file(self, file_bytes: bytes, filename: str, content_type: str) -> str:
        """
        Validate file size, extension, and content type.
        Returns the sanitized lower-case extension.
        """
        # Size check
        if len(file_bytes) > self.max_size_bytes:
            max_mb = self.max_size_bytes / (1024 * 1024)
            raise HTTPException(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                detail=f"File size exceeds maximum allowed limit of {max_mb:.1f} MB.",
            )

        # Content type check
        normalized_content_type = content_type.lower().split(";")[0].strip()
        if normalized_content_type not in ALLOWED_CONTENT_TYPES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Unsupported file type '{content_type}'. "
                    f"Allowed types: {', '.join(sorted(ALLOWED_CONTENT_TYPES))}"
                ),
            )

        # Extension check
        ext = Path(filename).suffix.lower()
        if ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Unsupported file extension '{ext}'. "
                    f"Allowed extensions: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
                ),
            )

        return ext

    async def save_file(
        self,
        file_bytes: bytes,
        original_filename: str,
        content_type: str,
    ) -> Dict[str, Any]:
        """
        Validates and saves the file to local storage.
        """
        ext = self.validate_file(file_bytes, original_filename, content_type)
        file_id = uuid.uuid4().hex
        stored_filename = f"{file_id}{ext}"
        destination_path = self.upload_dir / stored_filename

        # Write file asynchronously
        async with aiofiles.open(destination_path, "wb") as f:
            await f.write(file_bytes)

        return {
            "file_id": file_id,
            "filename": original_filename,
            "content_type": content_type,
            "size_bytes": len(file_bytes),
            "storage_path": str(destination_path.relative_to(self.upload_dir)),
        }

    def get_file_path(self, storage_path: str) -> Path:
        """
        Resolve and verify the file path, guarding against directory traversal.
        """
        target_path = (self.upload_dir / storage_path).resolve()
        
        # Security check: Prevent path traversal attacks
        if not str(target_path).startswith(str(self.upload_dir)):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid file path.",
            )

        if not target_path.exists() or not target_path.is_file():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="File not found on storage.",
            )

        return target_path

    async def delete_file(self, storage_path: str) -> bool:
        """
        Delete a file from storage.
        """
        try:
            path = self.get_file_path(storage_path)
            if path.exists():
                os.remove(path)
                return True
        except HTTPException:
            return False
        return False


_storage_service_instance: LocalStorageService | None = None


def get_storage_service() -> LocalStorageService:
    """Dependency provider for storage service."""
    global _storage_service_instance
    if _storage_service_instance is None:
        _storage_service_instance = LocalStorageService()
    return _storage_service_instance
