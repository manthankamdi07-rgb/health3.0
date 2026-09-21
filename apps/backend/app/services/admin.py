"""
Service layer for the Admin Panel (Task 11).
Handles doctor verification, user management, and platform analytics.
"""

from typing import List, Optional
from fastapi import HTTPException, status
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User, PatientProfile, UserRole
from app.models.doctor import DoctorProfile
from app.models.appointment import Appointment
from app.models.file import MedicalFile
from app.schemas.admin import (
    DoctorAdminResponse,
    UserAdminResponse,
    AdminDashboardStats,
)
from app.services.notifications import create_and_send_notification


async def list_doctors(
    is_approved: Optional[bool],
    db: AsyncSession,
) -> List[DoctorAdminResponse]:
    """
    List doctors for administrative review.
    Supports filtering by approval status (e.g. pending vs approved).
    """
    stmt = (
        select(DoctorProfile, User.email, User.is_active)
        .join(User, DoctorProfile.user_id == User.id)
        .order_by(DoctorProfile.created_at.desc())
    )
    if is_approved is not None:
        stmt = stmt.where(DoctorProfile.is_approved == is_approved)

    result = await db.execute(stmt)
    rows = result.all()

    return [
        DoctorAdminResponse(
            id=doc.id,
            user_id=doc.user_id,
            email=email,
            name=doc.name,
            license_number=doc.license_number,
            specialty=doc.specialty,
            is_approved=doc.is_approved,
            is_active=is_active,
            created_at=doc.created_at,
        )
        for doc, email, is_active in rows
    ]


async def review_doctor(
    doctor_id: int,
    approved: bool,
    notes: Optional[str],
    db: AsyncSession,
) -> DoctorAdminResponse:
    """
    Approve or reject a doctor registration.
    Doctor can be identified by doctor profile ID or user ID.
    """
    stmt = (
        select(DoctorProfile, User)
        .join(User, DoctorProfile.user_id == User.id)
        .where(or_(DoctorProfile.id == doctor_id, DoctorProfile.user_id == doctor_id))
    )
    res = await db.execute(stmt)
    row = res.first()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Doctor profile not found.",
        )

    doc_profile, user = row
    doc_profile.is_approved = approved
    await db.commit()
    await db.refresh(doc_profile)
    await db.refresh(user)

    # Dispatch notification to doctor
    action_text = "approved" if approved else "rejected"
    title = f"Account Registration {action_text.capitalize()}"
    if approved:
        message = "Your doctor account has been approved by an administrator. You can now log in and manage patients."
    else:
        reason_msg = f" Reason: {notes}" if notes else ""
        message = f"Your doctor account registration was not approved.{reason_msg}"

    await create_and_send_notification(
        user_email=user.email,
        title=title,
        message=message,
        notification_type="ACCOUNT_STATUS",
        user_id=user.id,
        db=db,
    )

    return DoctorAdminResponse(
        id=doc_profile.id,
        user_id=doc_profile.user_id,
        email=user.email,
        name=doc_profile.name,
        license_number=doc_profile.license_number,
        specialty=doc_profile.specialty,
        is_approved=doc_profile.is_approved,
        is_active=user.is_active,
        created_at=doc_profile.created_at,
    )


async def list_users(
    role: Optional[UserRole],
    is_active: Optional[bool],
    limit: int,
    offset: int,
    db: AsyncSession,
) -> List[UserAdminResponse]:
    """
    List all platform users with filtering and pagination.
    """
    stmt = select(User).order_by(User.created_at.desc()).offset(offset).limit(limit)
    if role is not None:
        stmt = stmt.where(User.role == role)
    if is_active is not None:
        stmt = stmt.where(User.is_active == is_active)

    result = await db.execute(stmt)
    users = result.scalars().all()

    if not users:
        return []

    # Map profile names
    user_ids = [u.id for u in users]
    names: dict[int, str] = {}

    # Check PatientProfiles
    pat_res = await db.execute(
        select(PatientProfile.user_id, PatientProfile.name).where(
            PatientProfile.user_id.in_(user_ids)
        )
    )
    for u_id, name in pat_res.all():
        names[u_id] = name

    # Check DoctorProfiles
    doc_res = await db.execute(
        select(DoctorProfile.user_id, DoctorProfile.name).where(
            DoctorProfile.user_id.in_(user_ids)
        )
    )
    for u_id, name in doc_res.all():
        names[u_id] = name

    return [
        UserAdminResponse(
            id=u.id,
            email=u.email,
            role=u.role,
            is_active=u.is_active,
            name=names.get(u.id),
            created_at=u.created_at,
        )
        for u in users
    ]


async def toggle_user_active_status(
    target_user_id: int,
    is_active: bool,
    current_admin: User,
    db: AsyncSession,
) -> UserAdminResponse:
    """
    Activate or deactivate a user account.
    Prevents self-deactivation by administrators.
    """
    if target_user_id == current_admin.id and not is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Administrators cannot deactivate their own accounts.",
        )

    res = await db.execute(select(User).where(User.id == target_user_id))
    user = res.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )

    user.is_active = is_active
    await db.commit()
    await db.refresh(user)

    # Fetch name if available
    name: Optional[str] = None
    if user.role == UserRole.PATIENT:
        p_res = await db.execute(select(PatientProfile.name).where(PatientProfile.user_id == user.id))
        name = p_res.scalar_one_or_none()
    elif user.role == UserRole.DOCTOR:
        d_res = await db.execute(select(DoctorProfile.name).where(DoctorProfile.user_id == user.id))
        name = d_res.scalar_one_or_none()

    return UserAdminResponse(
        id=user.id,
        email=user.email,
        role=user.role,
        is_active=user.is_active,
        name=name,
        created_at=user.created_at,
    )


async def get_system_stats(db: AsyncSession) -> AdminDashboardStats:
    """
    Aggregate platform-wide metrics.
    """
    total_users = (await db.execute(select(func.count(User.id)))).scalar() or 0
    total_patients = (
        await db.execute(select(func.count(User.id)).where(User.role == UserRole.PATIENT))
    ).scalar() or 0
    total_doctors = (
        await db.execute(select(func.count(DoctorProfile.id)))
    ).scalar() or 0
    pending_doctors = (
        await db.execute(select(func.count(DoctorProfile.id)).where(DoctorProfile.is_approved.is_(False)))
    ).scalar() or 0
    approved_doctors = (
        await db.execute(select(func.count(DoctorProfile.id)).where(DoctorProfile.is_approved.is_(True)))
    ).scalar() or 0
    total_appointments = (
        await db.execute(select(func.count(Appointment.id)))
    ).scalar() or 0
    total_files = (
        await db.execute(select(func.count(MedicalFile.id)))
    ).scalar() or 0

    return AdminDashboardStats(
        total_users=total_users,
        total_patients=total_patients,
        total_doctors=total_doctors,
        pending_doctors=pending_doctors,
        approved_doctors=approved_doctors,
        total_appointments=total_appointments,
        total_files=total_files,
    )
