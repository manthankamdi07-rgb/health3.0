"""
AbdmConsent model — tracks explicit patient consent for sharing clinical records with ABDM.
"""

from datetime import datetime, timezone
from sqlalchemy import String, DateTime, ForeignKey, Boolean, Text
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class AbdmConsent(Base):
    """
    Tracks explicit, deliberate patient consent to file and share consultation
    records with the Ayushman Bharat Digital Mission (ABDM) Personal Health Record.
    """
    __tablename__ = "abdm_consents"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    patient_unique_id: Mapped[str] = mapped_column(String(10), index=True)
    appointment_id: Mapped[int | None] = mapped_column(ForeignKey("appointments.id"), nullable=True, index=True)
    abha_address: Mapped[str | None] = mapped_column(String(100), nullable=True)
    consent_type: Mapped[str] = mapped_column(String(50), default="ABHA_RECORD_SHARING")
    scopes: Mapped[str] = mapped_column(Text, default='["VISIT_SUMMARY", "UPLOADED_DOCUMENTS", "AI_NOTES"]')
    is_granted: Mapped[bool] = mapped_column(Boolean, default=True)
    granted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="ACTIVE")
