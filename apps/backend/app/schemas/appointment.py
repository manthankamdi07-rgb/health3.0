"""
Pydantic schemas for Appointments (Task 9).
"""

from datetime import datetime
from typing import Optional, Any, Dict
from pydantic import BaseModel, ConfigDict, Field

from app.models.appointment import AppointmentStatus


class PreConsultationQuestionnaire(BaseModel):
    """Answers collected from the patient before their appointment."""
    main_problem: str = Field(..., min_length=2, max_length=1000, description="Chief medical complaint")
    department: str = Field(default="General", max_length=50, description="Related department or body area")
    duration: str = Field(..., max_length=100, description="Symptom duration (e.g. 3 days, 2 weeks)")
    current_medication: Optional[str] = Field(None, max_length=500, description="Medications currently taken")
    follow_ups: Optional[dict[str, str]] = Field(default=None, description="Specific follow-up answers")
    ayush_assessment: Optional[Dict[str, Any]] = Field(default=None, description="Traditional AYUSH diagnostic metrics (Prakriti, Vikriti, Agni, Bowel, Ahara-Vihara)")


class TriageCheckRequest(BaseModel):
    """Request to assess symptoms for emergency red flags."""
    main_problem: str = Field(..., min_length=2, max_length=1000, description="Chief medical complaint")
    department: Optional[str] = Field(default="General", max_length=50, description="Related department")
    duration: Optional[str] = Field(default=None, max_length=100, description="Duration of symptoms")
    additional_notes: Optional[str] = Field(default=None, max_length=500, description="Optional extra details")


class TriageCheckResponse(BaseModel):
    """Emergency Red-Flag Triage assessment response."""
    is_emergency: bool
    triage_level: str  # RED_FLAG, URGENT, ROUTINE
    primary_concern: str
    matched_triggers: list[str] = Field(default_factory=list)
    immediate_action: str
    patient_warning: str
    recommended_queue: str


class AISummaryGenerateRequest(BaseModel):
    """Request payload to generate a 150-word clinical briefing."""
    doctor_id: Optional[int] = Field(None, description="Optional target doctor ID")
    questionnaire: PreConsultationQuestionnaire


class AISummaryResponse(BaseModel):
    """Clinical AI briefing generated for the doctor to skim in 10 seconds."""
    summary: str
    department: str
    records_count: int = 0
    files_count: int = 0
    provider: str = "gemini"
    is_emergency: bool = False
    triage_level: str = "ROUTINE"
    triage_warning: Optional[str] = None
    matched_triggers: list[str] = Field(default_factory=list)


class AppointmentBookRequest(BaseModel):
    """Schema for a patient booking a new appointment."""
    doctor_id: int = Field(..., description="ID of the doctor to book with")
    appointment_date: datetime = Field(..., description="Scheduled appointment datetime (must be in future)")
    duration_minutes: int = Field(default=30, ge=10, le=180, description="Estimated duration in minutes")
    department: Optional[str] = Field("General", max_length=50, description="Clinical department")
    reason: Optional[str] = Field(None, max_length=500, description="Reason or symptoms for the appointment")
    questionnaire: Optional[str] = Field(None, description="JSON-serialized questionnaire answers")
    ai_summary: Optional[str] = Field(None, description="Generated AI clinical summary")
    ai_summary_confirmed: Optional[bool] = Field(False, description="Whether patient reviewed summary")
    is_emergency: Optional[bool] = Field(False, description="Whether red-flag emergency symptoms were detected")
    triage_level: Optional[str] = Field("ROUTINE", description="Triage priority: RED_FLAG, URGENT, ROUTINE")
    red_flags: Optional[str] = Field(None, description="JSON-serialized detected red-flag findings")
    abdm_consent_granted: Optional[bool] = Field(False, description="Whether patient explicitly consented to push record to ABDM")
    abdm_scopes: Optional[list[str]] = Field(default=None, description="Explicit ABDM scopes consented to")


class AppointmentStatusUpdate(BaseModel):
    """Schema for updating appointment status."""
    status: AppointmentStatus
    notes: Optional[str] = Field(None, max_length=1000, description="Status change reason or clinical notes")


class AppointmentResponse(BaseModel):
    """Output schema for appointment details."""
    id: int
    patient_id: int
    patient_unique_id: str
    patient_name: str
    doctor_id: int
    doctor_name: str
    appointment_date: datetime
    duration_minutes: int
    status: AppointmentStatus
    department: Optional[str] = "General"
    reason: Optional[str] = None
    questionnaire: Optional[str] = None
    ai_summary: Optional[str] = None
    ai_summary_confirmed: Optional[bool] = False
    is_emergency: bool = False
    triage_level: str = "ROUTINE"
    red_flags: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

