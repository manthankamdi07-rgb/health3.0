"""
Pydantic schemas for the Admin Panel (Task 11).
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field

from app.models.user import UserRole


class DoctorAdminResponse(BaseModel):
    """Detailed doctor view for administrative review."""
    id: int
    user_id: int
    email: str
    name: str
    license_number: str
    specialty: Optional[str] = None
    is_approved: bool
    is_active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class DoctorApprovalRequest(BaseModel):
    """Payload to approve or reject a pending doctor account."""
    approved: bool = Field(..., description="True to approve, False to reject")
    notes: Optional[str] = Field(None, max_length=500, description="Optional review notes")


class UserStatusUpdate(BaseModel):
    """Payload to toggle a user's active status."""
    is_active: bool = Field(..., description="Set active status for the account")


class UserAdminResponse(BaseModel):
    """User summary view for administrative user management."""
    id: int
    email: str
    role: UserRole
    is_active: bool
    name: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AdminDashboardStats(BaseModel):
    """Aggregated platform statistics for admin dashboard."""
    total_users: int
    total_patients: int
    total_doctors: int
    pending_doctors: int
    approved_doctors: int
    total_appointments: int
    total_files: int
