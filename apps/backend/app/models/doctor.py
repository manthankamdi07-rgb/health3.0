from datetime import datetime, timezone
from typing import TYPE_CHECKING
from sqlalchemy import String, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship, Mapped, mapped_column
from app.database import Base

if TYPE_CHECKING:
    from app.models.user import User


class DoctorProfile(Base):
    """
    Doctor-specific profile data.
    Created at sign-up. The account must be approved by an admin before use.
    """
    __tablename__ = "doctor_profiles"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)
    name: Mapped[str] = mapped_column(String(255))
    license_number: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    specialty: Mapped[str | None] = mapped_column(String(100))
    is_approved: Mapped[bool] = mapped_column(Boolean, default=False)
    profile_photo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    user: Mapped["User"] = relationship(back_populates="doctor_profile")
