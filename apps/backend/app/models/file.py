"""
MedicalFile model — tracks uploaded medical files, scans, lab reports, and prescriptions.
"""

from datetime import datetime, timezone
from sqlalchemy import String, DateTime, ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class MedicalFile(Base):
    """
    Tracks metadata and storage location for files and scans tied to a patient.
    """
    __tablename__ = "medical_files"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    file_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    patient_unique_id: Mapped[str] = mapped_column(String(32), index=True)
    uploader_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    filename: Mapped[str] = mapped_column(String(255))
    file_category: Mapped[str] = mapped_column(String(50), default="other")
    department: Mapped[str] = mapped_column(String(50), default="General", index=True)
    content_type: Mapped[str] = mapped_column(String(100))
    size_bytes: Mapped[int] = mapped_column(Integer)
    storage_path: Mapped[str] = mapped_column(String(512))
    extracted_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    structured_entities: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON-encoded clinical entities
    ocr_status: Mapped[str] = mapped_column(String(32), default="pending", index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

