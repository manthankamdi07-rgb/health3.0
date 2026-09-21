"""
Pydantic schemas for file and scan uploads.
"""

from datetime import datetime
from enum import Enum
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, ConfigDict, Field


class FileCategory(str, Enum):
    """Supported file categories."""
    X_RAY = "x_ray"
    LAB_REPORT = "lab_report"
    PRESCRIPTION = "prescription"
    DISCHARGE_SUMMARY = "discharge_summary"
    SCAN = "scan"
    OTHER = "other"


class MedicationEntity(BaseModel):
    name: str
    dosage: Optional[str] = None
    frequency: Optional[str] = None
    duration: Optional[str] = None
    instructions: Optional[str] = None


class LabResultEntity(BaseModel):
    test_name: str
    value: str
    unit: Optional[str] = None
    reference_range: Optional[str] = None
    is_abnormal: Optional[bool] = False


class DiagnosisEntity(BaseModel):
    condition: str
    status: Optional[str] = None
    notes: Optional[str] = None


class StructuredClinicalEntities(BaseModel):
    document_type: Optional[str] = "Other"
    document_date: Optional[str] = None
    healthcare_provider: Optional[str] = None
    medications: list[MedicationEntity] = Field(default_factory=list)
    lab_results: list[LabResultEntity] = Field(default_factory=list)
    diagnoses: list[DiagnosisEntity] = Field(default_factory=list)
    clinical_advice: list[str] = Field(default_factory=list)


class FileResponse(BaseModel):
    """Schema returned after a file is uploaded or queried."""
    id: int
    file_id: str
    patient_unique_id: str
    uploader_id: int
    filename: str
    file_category: str
    department: str = "General"
    content_type: str
    size_bytes: int
    download_url: str = Field(description="URL to view or download the file")
    created_at: datetime
    extracted_text: Optional[str] = None
    structured_entities: Optional[StructuredClinicalEntities] = None
    ocr_status: Optional[str] = "pending"

    model_config = ConfigDict(from_attributes=True)


class DocumentDigitizeResponse(BaseModel):
    """Response returned when digitizing a medical document with OCR & Entity Extraction."""
    file_id: str
    filename: str
    ocr_status: str
    extracted_text: str
    entities: StructuredClinicalEntities


