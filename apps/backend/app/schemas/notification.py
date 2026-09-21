"""
Pydantic schemas for Notifications (Task 10).
"""

from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field


class NotificationResponse(BaseModel):
    """Schema representing an in-app notification."""
    id: int
    user_id: int
    title: str
    message: str
    notification_type: str
    is_read: bool
    link: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class NotificationSummary(BaseModel):
    """Schema representing user notification inbox and unread counter."""
    unread_count: int = Field(..., description="Count of unread notifications")
    notifications: List[NotificationResponse] = Field(default_factory=list)
