"""
AccessRequest model — tracks doctor-to-patient access grants.
"""

import enum
from datetime import datetime, timezone, timedelta
from sqlalchemy import String, DateTime, ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class AccessStatus(str, enum.Enum):
    """Status of a doctor's access request to a patient's records."""
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    DENIED = "DENIED"
    EXPIRED = "EXPIRED"


ACCESS_DURATION_DAYS = 30


class AccessRequest(Base):
    """
    Tracks a doctor's request to access a patient's medical records.
    Approved access expires after ACCESS_DURATION_DAYS (default 30).
    """
    __tablename__ = "access_requests"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    doctor_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    patient_unique_id: Mapped[str] = mapped_column(String(10), index=True)
    status: Mapped[AccessStatus] = mapped_column(default=AccessStatus.PENDING)
    reason: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
