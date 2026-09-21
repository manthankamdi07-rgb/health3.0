"""
Notification service — handles in-app notifications and external simulation.
"""

import logging
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Tuple
from fastapi import HTTPException, status
from sqlalchemy import select, func, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User, PatientProfile
from app.models.doctor import DoctorProfile
from app.models.notification import Notification
from app.models.appointment import Appointment, AppointmentStatus

logger = logging.getLogger(__name__)


async def create_and_send_notification(
    user_email: str,
    title: str,
    message: str,
    notification_type: str,
    link: Optional[str] = None,
    user_id: Optional[int] = None,
    db: Optional[AsyncSession] = None,
) -> Optional[Notification]:
    """
    Log simulated notification and persist in database if session is provided.
    """
    logger.info(f"[NOTIFICATION] → {user_email} [{notification_type}]: {title} - {message}")

    if db is not None:
        if user_id is None:
            user_res = await db.execute(select(User.id).where(User.email == user_email))
            user_id = user_res.scalar_one_or_none()

        if user_id is not None:
            notif = Notification(
                user_id=user_id,
                title=title,
                message=message,
                notification_type=notification_type,
                link=link,
                is_read=False,
            )
            db.add(notif)
            await db.commit()
            await db.refresh(notif)
            return notif

    return None


async def notify_emergency_triage_alert(
    doctor_email: str,
    patient_name: str,
    patient_unique_id: str,
    emergency_reason: str,
    matched_triggers: Optional[List[str]] = None,
    user_id: Optional[int] = None,
    appointment_id: Optional[int] = None,
    db: Optional[AsyncSession] = None,
) -> None:
    """Notify doctor & triage staff immediately of a high-risk emergency red flag."""
    title = f"🚨 EMERGENCY TRIAGE: {patient_name}"
    triggers_str = ", ".join(matched_triggers[:3]) if matched_triggers else "Critical red-flag symptoms"
    message = (
        f"PRIORITY RED FLAG: Patient {patient_name} ({patient_unique_id}) has presented with "
        f"acute emergency symptoms: {emergency_reason} [{triggers_str}]. Immediate triage required."
    )
    await create_and_send_notification(
        user_email=doctor_email,
        title=title,
        message=message,
        notification_type="EMERGENCY_TRIAGE",
        link=f"/doctor?appt_id={appointment_id}" if appointment_id else "/doctor",
        user_id=user_id,
        db=db,
    )


async def notify_patient_access_request(
    patient_email: str,
    doctor_name: str,
    user_id: Optional[int] = None,
    db: Optional[AsyncSession] = None,
) -> None:
    """Notify a patient that a doctor has requested access to their records."""
    title = "New Doctor Access Request"
    message = f"Dr. {doctor_name} has requested access to your medical records. Please approve or deny in the app."
    await create_and_send_notification(
        user_email=patient_email,
        title=title,
        message=message,
        notification_type="ACCESS_REQUEST",
        link="/access/pending",
        user_id=user_id,
        db=db,
    )


async def notify_doctor_access_response(
    doctor_email: str,
    patient_name: str,
    approved: bool,
    user_id: Optional[int] = None,
    db: Optional[AsyncSession] = None,
) -> None:
    """Notify a doctor that a patient has responded to their access request."""
    action = "approved" if approved else "denied"
    title = f"Access Request {action.capitalize()}"
    message = f"Patient {patient_name} has {action} your request to access their records."
    await create_and_send_notification(
        user_email=doctor_email,
        title=title,
        message=message,
        notification_type="ACCESS_RESPONSE",
        link="/patients",
        user_id=user_id,
        db=db,
    )


async def notify_doctor_new_appointment(
    doctor_email: str,
    patient_name: str,
    appointment_time: str,
    user_id: Optional[int] = None,
    appointment_id: Optional[int] = None,
    db: Optional[AsyncSession] = None,
) -> None:
    """Notify a doctor about a newly booked appointment."""
    title = "New Appointment Scheduled"
    message = f"New appointment booked by {patient_name} for {appointment_time}."
    link = f"/appointments/{appointment_id}" if appointment_id else "/doctor/calendar"
    await create_and_send_notification(
        user_email=doctor_email,
        title=title,
        message=message,
        notification_type="APPOINTMENT_BOOKED",
        link=link,
        user_id=user_id,
        db=db,
    )


async def notify_patient_appointment_status(
    patient_email: str,
    doctor_name: str,
    new_status: str,
    appointment_time: str,
    user_id: Optional[int] = None,
    appointment_id: Optional[int] = None,
    db: Optional[AsyncSession] = None,
) -> None:
    """Notify a patient regarding appointment confirmation, completion, or cancellation."""
    title = f"Appointment {new_status.capitalize()}"
    message = f"Your appointment with Dr. {doctor_name} for {appointment_time} has been {new_status}."
    link = f"/appointments/{appointment_id}" if appointment_id else "/patient/my-appointments"
    await create_and_send_notification(
        user_email=patient_email,
        title=title,
        message=message,
        notification_type="APPOINTMENT_STATUS",
        link=link,
        user_id=user_id,
        db=db,
    )


async def notify_patient_new_record(
    patient_email: str,
    doctor_name: str,
    record_title: str,
    user_id: Optional[int] = None,
    db: Optional[AsyncSession] = None,
) -> None:
    """Notify a patient when a doctor adds a new clinical note/medical record."""
    title = "New Medical Record Added"
    message = f"Dr. {doctor_name} added a new medical record: '{record_title}'."
    await create_and_send_notification(
        user_email=patient_email,
        title=title,
        message=message,
        notification_type="NEW_RECORD",
        link="/medical-records",
        user_id=user_id,
        db=db,
    )


async def notify_patient_new_file(
    patient_email: str,
    doctor_name: str,
    filename: str,
    file_category: str,
    user_id: Optional[int] = None,
    file_id: Optional[str] = None,
    db: Optional[AsyncSession] = None,
) -> None:
    """Notify a patient when a doctor uploads a medical file/scan for them."""
    title = "New Medical Document Uploaded"
    category_label = file_category.replace("_", " ").title()
    message = f"Dr. {doctor_name} uploaded a new {category_label} ({filename}) to your profile."
    link = f"/api/files/{file_id}" if file_id else "/medical-files"
    await create_and_send_notification(
        user_email=patient_email,
        title=title,
        message=message,
        notification_type="NEW_FILE",
        link=link,
        user_id=user_id,
        db=db,
    )


async def dispatch_appointment_reminders(
    db: AsyncSession, hours_ahead: int = 24
) -> int:
    """
    Search for upcoming confirmed appointments within the next `hours_ahead` hours
    and dispatch reminder notifications if not already sent.
    """
    now = datetime.now(timezone.utc)
    threshold = now + timedelta(hours=hours_ahead)

    stmt = select(Appointment).where(
        Appointment.status == AppointmentStatus.CONFIRMED,
        Appointment.appointment_date >= now,
        Appointment.appointment_date <= threshold,
    )
    result = await db.execute(stmt)
    upcoming_appointments = result.scalars().all()

    reminders_sent = 0
    for appt in upcoming_appointments:
        appt_link = f"/appointments/{appt.id}"

        # Check if reminder already sent for this appointment
        existing_check = await db.execute(
            select(Notification.id).where(
                Notification.notification_type == "APPOINTMENT_REMINDER",
                Notification.link == appt_link,
            ).limit(1)
        )
        if existing_check.scalars().first() is not None:
            continue

        # Lookup patient & doctor details
        p_user = (await db.execute(select(User).where(User.id == appt.patient_id))).scalar_one_or_none()
        d_prof = (await db.execute(select(DoctorProfile).where(DoctorProfile.user_id == appt.doctor_id))).scalar_one_or_none()
        p_prof = (await db.execute(select(PatientProfile).where(PatientProfile.user_id == appt.patient_id))).scalar_one_or_none()
        d_user = (await db.execute(select(User).where(User.id == appt.doctor_id))).scalar_one_or_none()

        time_str = appt.appointment_date.strftime("%Y-%m-%d %H:%M UTC")

        # Patient reminder
        if p_user and d_prof:
            await create_and_send_notification(
                user_email=p_user.email,
                title="Upcoming Appointment Reminder",
                message=f"Reminder: You have an appointment with Dr. {d_prof.name} scheduled for {time_str}.",
                notification_type="APPOINTMENT_REMINDER",
                link=appt_link,
                user_id=p_user.id,
                db=db,
            )

        # Doctor reminder
        if d_user and p_prof:
            await create_and_send_notification(
                user_email=d_user.email,
                title="Upcoming Appointment Reminder",
                message=f"Reminder: You have a scheduled appointment with patient {p_prof.name} at {time_str}.",
                notification_type="APPOINTMENT_REMINDER",
                link=appt_link,
                user_id=d_user.id,
                db=db,
            )

        reminders_sent += 1

    return reminders_sent


async def get_user_notifications(
    user_id: int, unread_only: bool, db: AsyncSession
) -> Tuple[int, List[Notification]]:
    """Retrieve notifications and total unread count for a user."""
    # Count unread
    count_stmt = select(func.count(Notification.id)).where(
        Notification.user_id == user_id,
        Notification.is_read.is_(False),
    )
    unread_count = (await db.execute(count_stmt)).scalar() or 0

    # Fetch notifications
    stmt = (
        select(Notification)
        .where(Notification.user_id == user_id)
        .order_by(Notification.created_at.desc())
    )
    if unread_only:
        stmt = stmt.where(Notification.is_read.is_(False))

    results = await db.execute(stmt)
    notifications = list(results.scalars().all())

    return unread_count, notifications


async def mark_notification_as_read(
    notification_id: int, user_id: int, db: AsyncSession
) -> Notification:
    """Mark a specific notification as read."""
    res = await db.execute(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == user_id,
        )
    )
    notif = res.scalar_one_or_none()
    if not notif:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found.",
        )

    notif.is_read = True
    await db.commit()
    await db.refresh(notif)
    return notif


async def mark_all_notifications_as_read(user_id: int, db: AsyncSession) -> int:
    """Mark all unread notifications for a user as read. Returns count of modified records."""
    stmt = (
        update(Notification)
        .where(Notification.user_id == user_id, Notification.is_read.is_(False))
        .values(is_read=True)
    )
    res = await db.execute(stmt)
    await db.commit()
    return res.rowcount  # type: ignore
