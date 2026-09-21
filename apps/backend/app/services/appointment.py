"""
Service layer for Appointments (Task 9).
Handles booking, calendar views, slot collision detection, and status management.
"""

from datetime import datetime, timezone, timedelta
from typing import List, Optional
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User, PatientProfile, UserRole
from app.models.doctor import DoctorProfile
from app.models.appointment import Appointment, AppointmentStatus
from app.schemas.appointment import (
    AppointmentBookRequest,
    AppointmentStatusUpdate,
    AppointmentResponse,
)
from app.services.notifications import (
    notify_doctor_new_appointment,
    notify_patient_appointment_status,
)


def _ensure_utc(dt: datetime) -> datetime:
    """Ensure datetime has timezone UTC."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


async def _get_names_map(
    patient_ids: set[int], doctor_ids: set[int], db: AsyncSession
) -> tuple[dict[int, str], dict[int, str]]:
    """Retrieve patient names and doctor names for given IDs."""
    patient_names: dict[int, str] = {}
    doctor_names: dict[int, str] = {}

    if patient_ids:
        p_res = await db.execute(
            select(PatientProfile).where(PatientProfile.user_id.in_(patient_ids))
        )
        for p in p_res.scalars().all():
            patient_names[p.user_id] = p.name

    if doctor_ids:
        d_res = await db.execute(
            select(DoctorProfile).where(DoctorProfile.user_id.in_(doctor_ids))
        )
        for d in d_res.scalars().all():
            doctor_names[d.user_id] = d.name

    return patient_names, doctor_names


async def format_appointment(appointment: Appointment, db: AsyncSession) -> AppointmentResponse:
    """Helper to enrich an Appointment model into AppointmentResponse schema."""
    patient_names, doctor_names = await _get_names_map(
        {appointment.patient_id}, {appointment.doctor_id}, db
    )
    return AppointmentResponse(
        id=appointment.id,
        patient_id=appointment.patient_id,
        patient_unique_id=appointment.patient_unique_id,
        patient_name=patient_names.get(appointment.patient_id, "Patient"),
        doctor_id=appointment.doctor_id,
        doctor_name=doctor_names.get(appointment.doctor_id, "Doctor"),
        appointment_date=appointment.appointment_date,
        duration_minutes=appointment.duration_minutes,
        status=appointment.status,
        department=appointment.department or "General",
        reason=appointment.reason,
        questionnaire=appointment.questionnaire,
        ai_summary=appointment.ai_summary,
        ai_summary_confirmed=appointment.ai_summary_confirmed or False,
        is_emergency=bool(getattr(appointment, "is_emergency", False)),
        triage_level=getattr(appointment, "triage_level", "ROUTINE") or "ROUTINE",
        red_flags=getattr(appointment, "red_flags", None),
        notes=appointment.notes,
        created_at=appointment.created_at,
        updated_at=appointment.updated_at,
    )


async def book_appointment(
    patient_user: User,
    data: AppointmentBookRequest,
    db: AsyncSession,
) -> AppointmentResponse:
    """
    Patient books a new appointment with a doctor.
    - Validates patient profile.
    - Validates appointment time is in the future.
    - Validates doctor existence and approval status.
    - Checks for conflicting appointments for the doctor.
    """
    # 1. Fetch patient profile
    p_res = await db.execute(
        select(PatientProfile).where(PatientProfile.user_id == patient_user.id)
    )
    patient_profile = p_res.scalar_one_or_none()
    if not patient_profile:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Patient profile not found. Please complete profile setup.",
        )

    # 2. Check future appointment date
    now_utc = datetime.now(timezone.utc)
    start_time = _ensure_utc(data.appointment_date)
    if start_time <= now_utc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Appointment date must be in the future.",
        )

    end_time = start_time + timedelta(minutes=data.duration_minutes)

    # 3. Check doctor existence and approval
    d_user_res = await db.execute(
        select(User).where(User.id == data.doctor_id, User.role == UserRole.DOCTOR)
    )
    doctor_user = d_user_res.scalar_one_or_none()
    if not doctor_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Doctor not found.",
        )

    d_prof_res = await db.execute(
        select(DoctorProfile).where(DoctorProfile.user_id == data.doctor_id)
    )
    doctor_profile = d_prof_res.scalar_one_or_none()
    if not doctor_profile or not doctor_profile.is_approved:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Doctor account is not approved to take appointments.",
        )

    # 4. Slot conflict detection
    # Look for active appointments near the requested time
    conflict_stmt = select(Appointment).where(
        Appointment.doctor_id == data.doctor_id,
        Appointment.status.in_([AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED]),
        Appointment.appointment_date >= start_time - timedelta(hours=4),
        Appointment.appointment_date <= end_time + timedelta(hours=4),
    )
    nearby_appointments = (await db.execute(conflict_stmt)).scalars().all()

    for appt in nearby_appointments:
        appt_start = _ensure_utc(appt.appointment_date)
        appt_end = appt_start + timedelta(minutes=appt.duration_minutes)
        # Check interval overlap: max(start1, start2) < min(end1, end2)
        if max(start_time, appt_start) < min(end_time, appt_end):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="The doctor already has an appointment scheduled during this time slot.",
            )

    # 5. Evaluate Red-Flag Triage
    import json
    from app.services.triage import triage_service
    is_emergency = bool(getattr(data, "is_emergency", False))
    triage_level = getattr(data, "triage_level", "ROUTINE") or "ROUTINE"
    red_flags = getattr(data, "red_flags", None)

    # Evaluate complaint if not already flagged as emergency
    if not is_emergency and (data.reason or data.questionnaire):
        complaint_text = data.reason or ""
        if data.questionnaire:
            try:
                q_data = json.loads(data.questionnaire)
                complaint_text = q_data.get("main_problem") or complaint_text
            except Exception:
                pass
        t_eval = triage_service.evaluate_text_deterministic(
            main_problem=complaint_text,
            department=data.department,
        )
        if t_eval.is_emergency:
            is_emergency = True
            triage_level = "RED_FLAG"
            red_flags = json.dumps({
                "primary_concern": t_eval.primary_concern,
                "matched_triggers": t_eval.matched_triggers,
                "immediate_action": t_eval.immediate_action,
                "patient_warning": t_eval.patient_warning,
            })

    # 6. Create appointment
    new_appointment = Appointment(
        patient_id=patient_user.id,
        patient_unique_id=patient_profile.patient_id,
        doctor_id=data.doctor_id,
        appointment_date=start_time,
        duration_minutes=data.duration_minutes,
        status=AppointmentStatus.PENDING,
        department=data.department or "General",
        reason=data.reason,
        questionnaire=data.questionnaire,
        ai_summary=data.ai_summary,
        ai_summary_confirmed=bool(data.ai_summary_confirmed),
        is_emergency=is_emergency,
        triage_level=triage_level,
        red_flags=red_flags,
        notes=None,
    )
    db.add(new_appointment)
    await db.commit()
    await db.refresh(new_appointment)

    # If Red-Flag Emergency, dispatch immediate priority alert to doctor & triage staff
    if is_emergency:
        from app.services.notifications import notify_emergency_triage_alert
        concern = "Critical Emergency Symptoms"
        triggers = []
        if red_flags:
            try:
                rf_obj = json.loads(red_flags)
                concern = rf_obj.get("primary_concern", concern)
                triggers = rf_obj.get("matched_triggers", [])
            except Exception:
                pass
        await notify_emergency_triage_alert(
            doctor_email=doctor_user.email,
            patient_name=patient_profile.name,
            patient_unique_id=patient_profile.patient_id,
            emergency_reason=concern,
            matched_triggers=triggers,
            user_id=doctor_user.id,
            appointment_id=new_appointment.id,
            db=db,
        )

    # Standard booking notification
    await notify_doctor_new_appointment(
        doctor_email=doctor_user.email,
        patient_name=patient_profile.name,
        appointment_time=start_time.strftime("%Y-%m-%d %H:%M UTC"),
        user_id=doctor_user.id,
        appointment_id=new_appointment.id,
        db=db,
    )

    return AppointmentResponse(
        id=new_appointment.id,
        patient_id=new_appointment.patient_id,
        patient_unique_id=new_appointment.patient_unique_id,
        patient_name=patient_profile.name,
        doctor_id=new_appointment.doctor_id,
        doctor_name=doctor_profile.name,
        appointment_date=new_appointment.appointment_date,
        duration_minutes=new_appointment.duration_minutes,
        status=new_appointment.status,
        department=new_appointment.department,
        reason=new_appointment.reason,
        questionnaire=new_appointment.questionnaire,
        ai_summary=new_appointment.ai_summary,
        ai_summary_confirmed=new_appointment.ai_summary_confirmed,
        is_emergency=new_appointment.is_emergency,
        triage_level=new_appointment.triage_level,
        red_flags=new_appointment.red_flags,
        notes=new_appointment.notes,
        created_at=new_appointment.created_at,
        updated_at=new_appointment.updated_at,
    )


async def update_appointment_status(
    appointment_id: int,
    current_user: User,
    data: AppointmentStatusUpdate,
    db: AsyncSession,
) -> AppointmentResponse:
    """
    Update appointment status:
    - Patients may only CANCEL their own appointments.
    - Doctors may CONFIRM, COMPLETE, or CANCEL appointments booked with them.
    - Completed or Cancelled appointments cannot be altered.
    """
    res = await db.execute(
        select(Appointment).where(Appointment.id == appointment_id)
    )
    appt = res.scalar_one_or_none()
    if not appt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Appointment not found.",
        )

    if appt.status in [AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot change status of an appointment that is already {appt.status.value}.",
        )

    # Role permissions
    if current_user.role == UserRole.PATIENT:
        if current_user.id != appt.patient_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to modify this appointment.",
            )
        if data.status != AppointmentStatus.CANCELLED:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Patients can only cancel appointments.",
            )
    elif current_user.role == UserRole.DOCTOR:
        if current_user.id != appt.doctor_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to modify this appointment.",
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Unauthorized role.",
        )

    appt.status = data.status
    if data.notes:
        appt.notes = data.notes
    appt.updated_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(appt)

    # Send status notification
    p_user_res = await db.execute(select(User).where(User.id == appt.patient_id))
    p_user = p_user_res.scalar_one_or_none()
    d_prof_res = await db.execute(
        select(DoctorProfile).where(DoctorProfile.user_id == appt.doctor_id)
    )
    d_prof = d_prof_res.scalar_one_or_none()

    if p_user and d_prof:
        await notify_patient_appointment_status(
            patient_email=p_user.email,
            doctor_name=d_prof.name,
            new_status=appt.status.value,
            appointment_time=_ensure_utc(appt.appointment_date).strftime("%Y-%m-%d %H:%M UTC"),
            user_id=p_user.id,
            appointment_id=appt.id,
            db=db,
        )

    return await format_appointment(appt, db)


async def get_patient_appointments(
    patient_user: User,
    db: AsyncSession,
) -> List[AppointmentResponse]:
    """Retrieve all appointments for a given patient."""
    res = await db.execute(
        select(Appointment)
        .where(Appointment.patient_id == patient_user.id)
        .order_by(Appointment.appointment_date.desc())
    )
    appointments = res.scalars().all()
    if not appointments:
        return []

    patient_ids = {a.patient_id for a in appointments}
    doctor_ids = {a.doctor_id for a in appointments}
    patient_names, doctor_names = await _get_names_map(patient_ids, doctor_ids, db)

    return [
        AppointmentResponse(
            id=a.id,
            patient_id=a.patient_id,
            patient_unique_id=a.patient_unique_id,
            patient_name=patient_names.get(a.patient_id, "Patient"),
            doctor_id=a.doctor_id,
            doctor_name=doctor_names.get(a.doctor_id, "Doctor"),
            appointment_date=a.appointment_date,
            duration_minutes=a.duration_minutes,
            status=a.status,
            department=a.department or "General",
            reason=a.reason,
            questionnaire=a.questionnaire,
            ai_summary=a.ai_summary,
            ai_summary_confirmed=a.ai_summary_confirmed or False,
            is_emergency=bool(getattr(a, "is_emergency", False)),
            triage_level=getattr(a, "triage_level", "ROUTINE") or "ROUTINE",
            red_flags=getattr(a, "red_flags", None),
            notes=a.notes,
            created_at=a.created_at,
            updated_at=a.updated_at,
        )
        for a in appointments
    ]


async def get_doctor_calendar(
    doctor_user: User,
    start_date: Optional[datetime],
    end_date: Optional[datetime],
    status_filter: Optional[AppointmentStatus],
    db: AsyncSession,
) -> List[AppointmentResponse]:
    """Retrieve calendar view appointments for a doctor, prioritizing emergency red flags."""
    stmt = (
        select(Appointment)
        .where(Appointment.doctor_id == doctor_user.id)
        .order_by(Appointment.is_emergency.desc(), Appointment.appointment_date.asc())
    )
    if start_date:
        stmt = stmt.where(Appointment.appointment_date >= _ensure_utc(start_date))
    if end_date:
        stmt = stmt.where(Appointment.appointment_date <= _ensure_utc(end_date))
    if status_filter:
        stmt = stmt.where(Appointment.status == status_filter)

    res = await db.execute(stmt)
    appointments = res.scalars().all()
    if not appointments:
        return []

    patient_ids = {a.patient_id for a in appointments}
    doctor_ids = {a.doctor_id for a in appointments}
    patient_names, doctor_names = await _get_names_map(patient_ids, doctor_ids, db)

    return [
        AppointmentResponse(
            id=a.id,
            patient_id=a.patient_id,
            patient_unique_id=a.patient_unique_id,
            patient_name=patient_names.get(a.patient_id, "Patient"),
            doctor_id=a.doctor_id,
            doctor_name=doctor_names.get(a.doctor_id, "Doctor"),
            appointment_date=a.appointment_date,
            duration_minutes=a.duration_minutes,
            status=a.status,
            department=a.department or "General",
            reason=a.reason,
            questionnaire=a.questionnaire,
            ai_summary=a.ai_summary,
            ai_summary_confirmed=a.ai_summary_confirmed or False,
            is_emergency=bool(getattr(a, "is_emergency", False)),
            triage_level=getattr(a, "triage_level", "ROUTINE") or "ROUTINE",
            red_flags=getattr(a, "red_flags", None),
            notes=a.notes,
            created_at=a.created_at,
            updated_at=a.updated_at,
        )
        for a in appointments
    ]


