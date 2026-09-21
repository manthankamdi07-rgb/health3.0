from pydantic import BaseModel, EmailStr, Field, ConfigDict
from typing import Optional


class DoctorRegisterRequest(BaseModel):
    """Request body for doctor sign-up."""
    name: str = Field(..., min_length=2, max_length=255, examples=["Dr. Alice Smith"])
    email: EmailStr = Field(..., examples=["alice@hospital.com"])
    phone: str = Field(..., min_length=10, max_length=20, examples=["+919876543210"])
    password: str = Field(..., min_length=8, max_length=128, examples=["SecurePass123"])
    license_number: str = Field(..., min_length=5, max_length=50, examples=["MD-12345"])
    specialty: Optional[str] = Field(None, max_length=100, examples=["Cardiology"])


class DoctorProfileResponse(BaseModel):
    """Response containing doctor profile data."""
    user_id: int
    name: str
    license_number: str
    specialty: Optional[str]
    is_approved: bool
    profile_photo_url: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class DoctorPublicResponse(BaseModel):
    """Public information about an approved doctor for directory & appointment booking."""
    id: int
    user_id: int
    name: str
    specialty: Optional[str] = None
    license_number: str
    profile_photo_url: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

