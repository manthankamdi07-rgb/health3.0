"""
Router for Appointments (Task 9).
"""

from datetime import datetime
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status, Query, BackgroundTasks
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.database import get_db
from app.mongodb import get_mongo_db
from app.models.user import User, PatientProfile, UserRole
from app.models.file import MedicalFile
from app.models.appointment import Appointment, AppointmentStatus
from app.schemas.appointment import (
    AppointmentBookRequest,
    AppointmentStatusUpdate,
    AppointmentResponse,
    AISummaryGenerateRequest,
    AISummaryResponse,
    TriageCheckRequest,
    TriageCheckResponse,
)
from app.services.appointment import (
    book_appointment,
    update_appointment_status,
    get_patient_appointments,
    get_doctor_calendar,
    format_appointment,
)
from app.services.ai_summary import ai_summary_service
from app.services.record import get_patient_records
from app.services.access_request import check_doctor_has_access
from app.services.storage import LocalStorageService, get_storage_service
from app.services.extractor import document_extractor_service
from app.utils.security import get_current_user, require_role

router = APIRouter(prefix="/api/appointments", tags=["Appointments"])


@router.post(
    "/book",
    response_model=AppointmentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Book an appointment (Patient only)",
)
async def create_booking(
    data: AppointmentBookRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(require_role(UserRole.PATIENT)),
    db: AsyncSession = Depends(get_db),
) -> AppointmentResponse:
    """
    Patient books an appointment with an approved doctor.
    If explicit ABDM consent is granted, schedules background filing to ABDM HIP.
    """
    appt_resp = await book_appointment(patient_user=current_user, data=data, db=db)

    if getattr(data, "abdm_consent_granted", False):
        try:
            from app.services.abdm import record_patient_consent, push_record_to_abdm_background
            scopes = getattr(data, "abdm_scopes", None) or ["VISIT_SUMMARY", "UPLOADED_DOCUMENTS", "AI_NOTES"]
            await record_patient_consent(
                patient_id=current_user.id,
                patient_unique_id=appt_resp.patient_unique_id,
                appointment_id=appt_resp.id,
                abha_address=None,
                scopes=scopes,
                db=db,
            )
            background_tasks.add_task(push_record_to_abdm_background, appt_resp.id)
        except Exception as exc:
            import logging
            logging.getLogger(__name__).warning(f"[ABDM] Could not register consent/push: {exc}")

    return appt_resp


@router.get(
    "/patient/my-appointments",
    response_model=List[AppointmentResponse],
    summary="Get patient's appointment list",
)
async def list_my_appointments(
    current_user: User = Depends(require_role(UserRole.PATIENT)),
    db: AsyncSession = Depends(get_db),
) -> List[AppointmentResponse]:
    """
    Returns all appointments scheduled by the authenticated patient.
    """
    return await get_patient_appointments(patient_user=current_user, db=db)


@router.get(
    "/doctor/calendar",
    response_model=List[AppointmentResponse],
    summary="Doctor calendar view of scheduled appointments",
)
async def doctor_calendar(
    start_date: Optional[datetime] = Query(None, description="Filter appointments on or after this UTC datetime"),
    end_date: Optional[datetime] = Query(None, description="Filter appointments on or before this UTC datetime"),
    status: Optional[AppointmentStatus] = Query(None, description="Filter by appointment status"),
    current_user: User = Depends(require_role(UserRole.DOCTOR)),
    db: AsyncSession = Depends(get_db),
) -> List[AppointmentResponse]:
    """
    Retrieve calendar appointments for the authenticated doctor with optional date range and status filters.
    """
    return await get_doctor_calendar(
        doctor_user=current_user,
        start_date=start_date,
        end_date=end_date,
        status_filter=status,
        db=db,
    )


@router.patch(
    "/{appointment_id}/status",
    response_model=AppointmentResponse,
    summary="Update appointment status (Confirm, Complete, Cancel)",
)
async def patch_appointment_status(
    appointment_id: int,
    data: AppointmentStatusUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AppointmentResponse:
    """
    Update appointment status:
    - Patients can cancel their own appointments.
    - Doctors can confirm, complete, or cancel appointments scheduled with them.
    """
    return await update_appointment_status(
        appointment_id=appointment_id,
        current_user=current_user,
        data=data,
        db=db,
    )


@router.post(
    "/ai-summary/generate",
    response_model=AISummaryResponse,
    summary="Generate AI pre-consultation summary (<150 words)",
)
async def generate_pre_consultation_summary(
    data: AISummaryGenerateRequest,
    current_user: User = Depends(require_role(UserRole.PATIENT)),
    db: AsyncSession = Depends(get_db),
    db_mongo: Optional[AsyncIOMotorDatabase] = Depends(get_mongo_db),
    storage: LocalStorageService = Depends(get_storage_service),
) -> AISummaryResponse:
    """
    Synthesizes patient's questionnaire responses, past records, and scans
    into a structured clinical briefing (<150 words) for the doctor.
    """
    # 1. Fetch patient profile
    p_res = await db.execute(
        select(PatientProfile).where(PatientProfile.user_id == current_user.id)
    )
    patient_profile = p_res.scalar_one_or_none()
    patient_info = {
        "name": patient_profile.name if patient_profile else "Patient",
        "age": patient_profile.age if patient_profile else None,
        "blood_group": patient_profile.blood_group if patient_profile else None,
        "allergies": patient_profile.allergies if patient_profile else None,
    }

    # 2. Fetch and scope files for this patient and department
    target_dept = (data.questionnaire.department or "General").strip()
    files_stmt = (
        select(MedicalFile)
        .where(MedicalFile.patient_id == current_user.id)
        .order_by(MedicalFile.created_at.desc())
    )
    files_res = await db.execute(files_stmt)
    all_files = files_res.scalars().all()

    # Scope: Prioritize files matching current department
    dept_files = [f for f in all_files if f.department and f.department.lower() == target_dept.lower()]
    scoped_files = dept_files[:3] if dept_files else all_files[:3]

    past_files_data = []
    for f in scoped_files:
        extracted_text = ""
        ext_status = "none"
        try:
            file_path = storage.get_file_path(f.storage_path)
            extraction_res = await document_extractor_service.extract_text_from_file(
                file_path=file_path,
                content_type=f.content_type,
                filename=f.filename,
            )
            extracted_text = extraction_res.get("extracted_text", "")
            ext_status = extraction_res.get("status", "unknown")
        except Exception as exc:
            extracted_text = f"[File: {f.filename} - Extraction unreadable or file missing: {str(exc)}]"
            ext_status = "fallback"

        past_files_data.append({
            "filename": f.filename,
            "department": f.department,
            "category": f.file_category,
            "created_at": str(f.created_at),
            "extracted_text": extracted_text,
            "extraction_status": ext_status,
        })

    # 3. Fetch past records from Mongo if available
    past_records_data = []
    if db_mongo is not None and patient_profile:
        try:
            mongo_records = await get_patient_records(db_mongo, patient_profile.patient_id)
            past_records_data = [
                {
                    "title": r.get("title"),
                    "type": r.get("type"),
                    "description": r.get("description"),
                    "created_at": str(r.get("created_at")),
                }
                for r in mongo_records
            ]
        except Exception:
            pass

    # 4. Generate summary
    result = await ai_summary_service.generate_pre_consultation_summary(
        questionnaire=data.questionnaire,
        patient_info=patient_info,
        past_records=past_records_data,
        past_files=past_files_data,
    )

    # 5. Evaluate Red-Flag Triage
    from app.services.triage import triage_service
    triage_eval = await triage_service.evaluate_symptoms(
        main_problem=data.questionnaire.main_problem,
        department=data.questionnaire.department,
        duration=data.questionnaire.duration,
    )

    return AISummaryResponse(
        summary=result["summary"],
        department=result["department"],
        records_count=result["records_count"],
        files_count=result["files_count"],
        provider=result["provider"],
        is_emergency=triage_eval.is_emergency,
        triage_level=triage_eval.triage_level,
        triage_warning=triage_eval.patient_warning if triage_eval.is_emergency else None,
        matched_triggers=triage_eval.matched_triggers,
    )


@router.post(
    "/triage-check",
    response_model=TriageCheckResponse,
    summary="Assess patient symptoms for emergency red flags",
)
async def check_triage_symptoms(
    data: TriageCheckRequest,
    current_user: User = Depends(get_current_user),
) -> TriageCheckResponse:
    """
    Evaluates symptoms for acute life-threatening emergency red flags
    (e.g., acute chest pain with dyspnea, stroke symptoms, acute respiratory compromise).
    """
    from app.services.triage import triage_service
    assessment = await triage_service.evaluate_symptoms(
        main_problem=data.main_problem,
        department=data.department,
        duration=data.duration,
        additional_notes=data.additional_notes,
    )
    return TriageCheckResponse(
        is_emergency=assessment.is_emergency,
        triage_level=assessment.triage_level,
        primary_concern=assessment.primary_concern,
        matched_triggers=assessment.matched_triggers,
        immediate_action=assessment.immediate_action,
        patient_warning=assessment.patient_warning,
        recommended_queue=assessment.recommended_queue,
    )


@router.get(
    "/doctor/patient-history/{patient_unique_id}",
    summary="Get full patient clinical history and files for doctor review",
)
async def get_doctor_patient_history(
    patient_unique_id: str,
    current_user: User = Depends(require_role(UserRole.DOCTOR)),
    db: AsyncSession = Depends(get_db),
    db_mongo: Optional[AsyncIOMotorDatabase] = Depends(get_mongo_db),
):
    """
    Returns full raw medical records and files for an attending doctor
    who has an appointment or access to the patient.
    """
    p_res = await db.execute(
        select(PatientProfile).where(PatientProfile.patient_id == patient_unique_id)
    )
    patient_profile = p_res.scalar_one_or_none()
    if not patient_profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient not found.",
        )

    # Check that doctor has access or appointment with patient
    has_access = await check_doctor_has_access(current_user.id, patient_profile.user_id, db)
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have active access or an appointment with this patient.",
        )

    # Fetch files
    files_stmt = (
        select(MedicalFile)
        .where(MedicalFile.patient_unique_id == patient_unique_id)
        .order_by(MedicalFile.created_at.desc())
    )
    files_res = await db.execute(files_stmt)
    files = [
        {
            "id": f.id,
            "file_id": f.file_id,
            "filename": f.filename,
            "file_category": f.file_category,
            "department": f.department,
            "content_type": f.content_type,
            "size_bytes": f.size_bytes,
            "download_url": f"/api/files/{f.file_id}",
            "created_at": f.created_at,
        }
        for f in files_res.scalars().all()
    ]

    # Fetch Mongo records
    records = []
    if db_mongo is not None:
        try:
            records = await get_patient_records(db_mongo, patient_unique_id)
        except Exception:
            records = []

    return {
        "patient": {
            "patient_id": patient_profile.patient_id,
            "name": patient_profile.name,
            "age": patient_profile.age,
            "blood_group": patient_profile.blood_group,
            "allergies": patient_profile.allergies,
            "profile_photo_url": patient_profile.profile_photo_url,
        },
        "records": records,
        "files": files,
    }


@router.get(
    "/{appointment_id}",
    response_model=AppointmentResponse,
    summary="Get appointment details by ID",
)

async def get_appointment_details(
    appointment_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AppointmentResponse:
    """
    Retrieve single appointment details.
    Accessible only by the patient or doctor involved.
    """
    res = await db.execute(select(Appointment).where(Appointment.id == appointment_id))
    appt = res.scalar_one_or_none()
    if not appt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Appointment not found.",
        )

    if current_user.role == UserRole.PATIENT and current_user.id != appt.patient_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to view this appointment.",
        )
    elif current_user.role == UserRole.DOCTOR and current_user.id != appt.doctor_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to view this appointment.",
        )

    return await format_appointment(appt, db)
