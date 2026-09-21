"""
User and PatientProfile SQLAlchemy models.
"""

import enum
from datetime import datetime, timezone
from typing import TYPE_CHECKING
from sqlalchemy import (
    String, DateTime, ForeignKey, Text, Boolean
)
from sqlalchemy.orm import relationship, Mapped, mapped_column
from app.database import Base

if TYPE_CHECKING:
    from app.models.doctor import DoctorProfile


class UserRole(str, enum.Enum):
    """User roles in the system."""
    PATIENT = "PATIENT"
    DOCTOR = "DOCTOR"
    ADMIN = "ADMIN"


class User(Base):
    """
    Core user account — shared across all roles.
    Stores credentials and role. Profile details are in role-specific tables.
    """
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    phone: Mapped[str | None] = mapped_column(String(20))
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[UserRole] = mapped_column()
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    patient_profile: Mapped["PatientProfile"] = relationship(back_populates="user", uselist=False)
    doctor_profile: Mapped["DoctorProfile"] = relationship(back_populates="user", uselist=False)


class PatientProfile(Base):
    """
    Patient-specific profile data.
    Created once at sign-up. The patient_id is permanent and never changes.
    """
    __tablename__ = "patient_profiles"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)
    patient_id: Mapped[str] = mapped_column(String(10), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    age: Mapped[int | None] = mapped_column()
    blood_group: Mapped[str | None] = mapped_column(String(5))
    allergies: Mapped[str | None] = mapped_column(Text)
    profile_photo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # ABDM / ABHA fields (Health 4.0)
    abha_number: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    abha_address: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    abha_status: Mapped[str] = mapped_column(String(20), default="UNLINKED")
    abha_profile_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    user: Mapped["User"] = relationship(back_populates="patient_profile")
