"""
Service logic for the doctor access-request flow.
"""

from datetime import datetime, timezone, timedelta
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException, status

from app.models.user import User, PatientProfile, UserRole
from app.models.doctor import DoctorProfile
from app.models.access_request import AccessRequest, AccessStatus, ACCESS_DURATION_DAYS
from app.services.notifications import (
    notify_patient_access_request,
    notify_doctor_access_response,
)


async def create_access_request(
    doctor_user: User, patient_unique_id: str, reason: str | None, db: AsyncSession
) -> AccessRequest:
    """
    Doctor requests access to a patient's records.

    Checks:
    - Patient exists.
    - No duplicate pending request.
    - Doctor is approved.
    """
    # 1. Find patient by unique ID
    result = await db.execute(
        select(PatientProfile).where(PatientProfile.patient_id == patient_unique_id)
    )
    patient_profile = result.scalar_one_or_none()
    if not patient_profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No patient found with ID '{patient_unique_id}'.",
        )

    # 2. Check for existing pending request
    existing = await db.execute(
        select(AccessRequest).where(
            and_(
                AccessRequest.doctor_id == doctor_user.id,
                AccessRequest.patient_id == patient_profile.user_id,
                AccessRequest.status == AccessStatus.PENDING,
            )
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You already have a pending access request for this patient.",
        )

    # 3. Also check for active (approved & not expired) access
    active = await db.execute(
        select(AccessRequest).where(
            and_(
                AccessRequest.doctor_id == doctor_user.id,
                AccessRequest.patient_id == patient_profile.user_id,
                AccessRequest.status == AccessStatus.APPROVED,
                AccessRequest.expires_at > datetime.now(timezone.utc),
            )
        )
    )
    if active.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You already have active access to this patient's records.",
        )

    # 4. Create the request
    access_req = AccessRequest(
        doctor_id=doctor_user.id,
        patient_id=patient_profile.user_id,
        patient_unique_id=patient_unique_id,
        status=AccessStatus.PENDING,
        reason=reason,
    )
    db.add(access_req)
    await db.commit()
    await db.refresh(access_req)

    # 5. Get patient user email for notification
    patient_user_result = await db.execute(
        select(User).where(User.id == patient_profile.user_id)
    )
    patient_user = patient_user_result.scalar_one()

    # Get doctor name
    doctor_profile_result = await db.execute(
        select(DoctorProfile).where(DoctorProfile.user_id == doctor_user.id)
    )
    doctor_profile = doctor_profile_result.scalar_one()

    await notify_patient_access_request(
        patient_email=patient_user.email,
        doctor_name=doctor_profile.name,
        user_id=patient_user.id,
        db=db,
    )

    return access_req


async def respond_to_access_request(
    patient_user: User, request_id: int, approve: bool, db: AsyncSession
) -> AccessRequest:
    """
    Patient approves or denies a pending access request.
    """
    # 1. Find the request
    result = await db.execute(
        select(AccessRequest).where(
            and_(
                AccessRequest.id == request_id,
                AccessRequest.patient_id == patient_user.id,
                AccessRequest.status == AccessStatus.PENDING,
            )
        )
    )
    access_req = result.scalar_one_or_none()
    if not access_req:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No pending access request found with this ID.",
        )

    now = datetime.now(timezone.utc)

    if approve:
        access_req.status = AccessStatus.APPROVED
        access_req.responded_at = now
        access_req.expires_at = now + timedelta(days=ACCESS_DURATION_DAYS)
    else:
        access_req.status = AccessStatus.DENIED
        access_req.responded_at = now

    await db.commit()
    await db.refresh(access_req)

    # 2. Notify the doctor
    doctor_result = await db.execute(
        select(User).where(User.id == access_req.doctor_id)
    )
    doctor_user = doctor_result.scalar_one()

    # Get patient name
    patient_profile_result = await db.execute(
        select(PatientProfile).where(PatientProfile.user_id == patient_user.id)
    )
    patient_profile = patient_profile_result.scalar_one()

    await notify_doctor_access_response(
        doctor_email=doctor_user.email,
        patient_name=patient_profile.name,
        approved=approve,
        user_id=doctor_user.id,
        db=db,
    )

    return access_req


async def get_pending_requests_for_patient(
    patient_user: User, db: AsyncSession
) -> list[AccessRequest]:
    """Get all pending access requests for a patient."""
    result = await db.execute(
        select(AccessRequest).where(
            and_(
                AccessRequest.patient_id == patient_user.id,
                AccessRequest.status == AccessStatus.PENDING,
            )
        )
    )
    return list(result.scalars().all())


async def get_requests_by_doctor(
    doctor_user: User, db: AsyncSession
) -> list[AccessRequest]:
    """Get all access requests made by a doctor."""
    result = await db.execute(
        select(AccessRequest).where(AccessRequest.doctor_id == doctor_user.id)
    )
    return list(result.scalars().all())


async def check_doctor_has_access(
    doctor_user_id: int, patient_user_id: int, db: AsyncSession
) -> bool:
    """Check if a doctor currently has active access to a patient's records (via approved access request or scheduled appointment)."""
    # 1. Check approved access request
    result = await db.execute(
        select(AccessRequest).where(
            and_(
                AccessRequest.doctor_id == doctor_user_id,
                AccessRequest.patient_id == patient_user_id,
                AccessRequest.status == AccessStatus.APPROVED,
                AccessRequest.expires_at > datetime.now(timezone.utc),
            )
        )
    )
    if result.scalar_one_or_none() is not None:
        return True

    # 2. Check if doctor has an appointment scheduled with this patient
    from app.models.appointment import Appointment
    appt_result = await db.execute(
        select(Appointment).where(
            and_(
                Appointment.doctor_id == doctor_user_id,
                Appointment.patient_id == patient_user_id,
            )
        )
    )
    return appt_result.first() is not None

