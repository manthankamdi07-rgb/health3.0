"""
Pydantic schemas for medical records stored in MongoDB.
"""

from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List, Dict, Any
from datetime import datetime


class FileAttachment(BaseModel):
    """Metadata for an attached file (e.g., from Google Cloud Storage)."""
    file_id: str
    filename: str
    content_type: str
    size_bytes: int


class RecordCreate(BaseModel):
    """Doctor creates a new medical record/note."""
    title: str = Field(..., max_length=255, examples=["Routine Checkup Note"])
    type: str = Field(..., max_length=100, examples=["Clinical Note", "Prescription", "Lab Result"])
    description: str = Field(..., examples=["Patient presented with mild fever. Advised rest."])
    attachments: Optional[List[FileAttachment]] = Field(default_factory=list)
    metadata: Optional[Dict[str, Any]] = Field(
        default_factory=dict,
        description="Flexible key-value pairs for specific record types"
    )


class RecordOut(BaseModel):
    """Medical record output schema."""
    id: str = Field(alias="_id")
    patient_unique_id: str
    doctor_id: int
    doctor_name: str
    title: str
    type: str
    description: str
    attachments: List[FileAttachment]
    metadata: Dict[str, Any]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(populate_by_name=True)
