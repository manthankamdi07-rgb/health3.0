"""
Pydantic schemas for the doctor access-request flow.
"""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class AccessRequestCreate(BaseModel):
    """Doctor submits a request to access a patient's records."""
    patient_unique_id: str = Field(..., min_length=6, max_length=10, examples=["HLT-A1B2C3"])
    reason: Optional[str] = Field(None, max_length=500, examples=["Follow-up consultation"])


class AccessRequestRespond(BaseModel):
    """Patient approves or denies a pending access request."""
    approve: bool = Field(..., description="True to approve, False to deny")


class AccessRequestOut(BaseModel):
    """Serialized access request for API responses."""
    id: int
    doctor_id: int
    doctor_name: Optional[str] = None
    patient_id: int
    patient_unique_id: str
    status: str
    reason: Optional[str]
    created_at: datetime
    responded_at: Optional[datetime]
    expires_at: Optional[datetime]
