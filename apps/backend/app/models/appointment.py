"""
Appointment model — manages scheduled patient-doctor consultations.
"""

import enum
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, ForeignKey, Integer, Text, Enum, Boolean
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class AppointmentStatus(str, enum.Enum):
    """Lifecycle status of an appointment."""
    PENDING = "PENDING"
    CONFIRMED = "CONFIRMED"
    CANCELLED = "CANCELLED"
    COMPLETED = "COMPLETED"


class Appointment(Base):
    """
    Tracks an appointment between a patient and a doctor.
    """
    __tablename__ = "appointments"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    patient_unique_id: Mapped[str] = mapped_column(String(32), index=True)
    doctor_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    appointment_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    duration_minutes: Mapped[int] = mapped_column(Integer, default=30)
    status: Mapped[AppointmentStatus] = mapped_column(
        Enum(AppointmentStatus), default=AppointmentStatus.PENDING, index=True
    )
    department: Mapped[str | None] = mapped_column(String(50), nullable=True, default="General", index=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    questionnaire: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON-encoded answers
    ai_summary: Mapped[str | None] = mapped_column(Text, nullable=True)     # Clinical briefing for doctor
    ai_summary_confirmed: Mapped[bool] = mapped_column(Boolean, default=False)
    is_emergency: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    triage_level: Mapped[str] = mapped_column(String(20), default="ROUTINE", index=True)
    red_flags: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON-encoded detected red flags
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
