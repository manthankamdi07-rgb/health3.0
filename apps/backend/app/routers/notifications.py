"""
Router for Notifications (Task 10).
Provides in-app notification feed, read status updates, and reminder trigger.
"""

from typing import Dict, Any
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.schemas.notification import NotificationResponse, NotificationSummary
from app.services.notifications import (
    get_user_notifications,
    mark_notification_as_read,
    mark_all_notifications_as_read,
    dispatch_appointment_reminders,
)
from app.utils.security import get_current_user

router = APIRouter(prefix="/api/notifications", tags=["Notifications"])


@router.get(
    "",
    response_model=NotificationSummary,
    summary="Get current user's notifications inbox",
)
async def list_notifications(
    unread_only: bool = Query(False, description="Filter for unread notifications only"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> NotificationSummary:
    """
    Retrieve in-app notifications and unread counter for the logged-in user.
    """
    unread_count, notifs = await get_user_notifications(
        user_id=current_user.id,
        unread_only=unread_only,
        db=db,
    )
    return NotificationSummary(
        unread_count=unread_count,
        notifications=[NotificationResponse.model_validate(n) for n in notifs],
    )


@router.patch(
    "/{notification_id}/read",
    response_model=NotificationResponse,
    summary="Mark single notification as read",
)
async def mark_single_read(
    notification_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> NotificationResponse:
    """
    Marks an individual notification belonging to the current user as read.
    """
    notif = await mark_notification_as_read(
        notification_id=notification_id,
        user_id=current_user.id,
        db=db,
    )
    return NotificationResponse.model_validate(notif)


@router.post(
    "/mark-all-read",
    summary="Mark all user notifications as read",
)
async def mark_all_read(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """
    Marks all notifications for the authenticated user as read.
    """
    count = await mark_all_notifications_as_read(
        user_id=current_user.id,
        db=db,
    )
    return {
        "message": "All notifications marked as read.",
        "marked_count": count,
    }


@router.post(
    "/trigger-reminders",
    summary="Trigger automated 24-hour appointment reminders",
)
async def trigger_reminders(
    hours_ahead: int = Query(24, ge=1, le=168, description="Lookahead window in hours"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """
    Triggers appointment reminders for upcoming confirmed appointments.
    Can be called by cron jobs, background tasks, or authorized clients.
    """
    sent = await dispatch_appointment_reminders(db=db, hours_ahead=hours_ahead)
    return {
        "message": f"Dispatched {sent} appointment reminder(s).",
        "reminders_sent": sent,
    }
