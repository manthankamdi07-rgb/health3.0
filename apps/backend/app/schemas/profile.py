"""
Pydantic schemas for patient profile CRUD.
"""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class PatientProfileOut(BaseModel):
    """Read-only view of a patient's profile."""
    patient_id: str
    name: str
    age: Optional[int]
    blood_group: Optional[str]
    allergies: Optional[str]
    profile_photo_url: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    created_at: datetime


class PatientProfileUpdate(BaseModel):
    """Fields a patient can update on their own profile."""
    name: Optional[str] = Field(None, min_length=2, max_length=255)
    age: Optional[int] = Field(None, ge=0, le=150)
    blood_group: Optional[str] = Field(None, max_length=5)
    allergies: Optional[str] = Field(None, max_length=1000)
    phone: Optional[str] = Field(None, min_length=10, max_length=20)
    profile_photo_url: Optional[str] = Field(None, max_length=500)
