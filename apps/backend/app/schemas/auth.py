"""
Pydantic schemas for authentication endpoints.
"""

from pydantic import BaseModel, EmailStr, Field
from typing import Optional


class LoginRequest(BaseModel):
    """Request body for login (shared by patients and doctors)."""
    email: EmailStr = Field(..., examples=["john@example.com"])
    password: str = Field(..., min_length=8, max_length=128, examples=["SecurePass123"])


class PatientRegisterRequest(BaseModel):
    """Request body for patient sign-up."""
    name: str = Field(..., min_length=2, max_length=255, examples=["John Doe"])
    email: EmailStr = Field(..., examples=["john@example.com"])
    phone: str = Field(..., min_length=10, max_length=20, examples=["+919876543210"])
    password: str = Field(..., min_length=8, max_length=128, examples=["SecurePass123"])
    otp_code: str = Field(..., min_length=6, max_length=6, examples=["123456"])
    age: Optional[int] = Field(None, ge=0, le=150, examples=[30])
    blood_group: Optional[str] = Field(None, max_length=5, examples=["O+"])
    allergies: Optional[str] = Field(None, max_length=1000, examples=["Penicillin, Peanuts"])


class OTPSendRequest(BaseModel):
    """Request body for sending OTP."""
    email: EmailStr = Field(..., examples=["john@example.com"])


class OTPVerifyRequest(BaseModel):
    """Request body for OTP verification (simulated in dev)."""
    email: EmailStr = Field(..., examples=["john@example.com"])
    otp_code: str = Field(..., min_length=6, max_length=6, examples=["123456"])


class OTPVerifyResponse(BaseModel):
    """Response after OTP verification."""
    verified: bool
    message: str


class TokenResponse(BaseModel):
    """Response containing JWT token after successful registration or login."""
    access_token: str
    token_type: str = "bearer"
    role: str
    patient_id: Optional[str] = None
    user_id: int
    name: str
    profile_photo_url: Optional[str] = None


class MessageResponse(BaseModel):
    """Generic message response."""
    message: str
    detail: Optional[str] = None
