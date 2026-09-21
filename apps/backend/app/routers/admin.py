"""
Router for Admin Panel (Task 11).
All endpoints require UserRole.ADMIN.
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User, UserRole
from app.schemas.admin import (
    DoctorAdminResponse,
    DoctorApprovalRequest,
    UserAdminResponse,
    UserStatusUpdate,
    AdminDashboardStats,
)
from app.services.admin import (
    list_doctors,
    review_doctor,
    list_users,
    toggle_user_active_status,
    get_system_stats,
)
from app.utils.security import require_role

router = APIRouter(
    prefix="/api/admin",
    tags=["Admin Panel"],
    dependencies=[Depends(require_role(UserRole.ADMIN))],
)


@router.get(
    "/doctors",
    response_model=List[DoctorAdminResponse],
    summary="List doctors for administrative review",
)
async def get_doctors(
    is_approved: Optional[bool] = Query(None, description="Filter by approval status (e.g. false for pending)"),
    db: AsyncSession = Depends(get_db),
) -> List[DoctorAdminResponse]:
    """
    Retrieve doctors with optional filter for pending review.
    """
    return await list_doctors(is_approved=is_approved, db=db)


@router.patch(
    "/doctors/{doctor_id}/review",
    response_model=DoctorAdminResponse,
    summary="Approve or reject a doctor registration",
)
async def review_doctor_account(
    doctor_id: int,
    data: DoctorApprovalRequest,
    db: AsyncSession = Depends(get_db),
) -> DoctorAdminResponse:
    """
    Approve or reject a doctor's pending account.
    Sends notification to doctor upon status change.
    """
    return await review_doctor(
        doctor_id=doctor_id,
        approved=data.approved,
        notes=data.notes,
        db=db,
    )


@router.get(
    "/users",
    response_model=List[UserAdminResponse],
    summary="List all users with pagination and filtering",
)
async def get_users(
    role: Optional[UserRole] = Query(None, description="Filter by user role"),
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> List[UserAdminResponse]:
    """
    Retrieve all registered users with role and status filtering.
    """
    return await list_users(role=role, is_active=is_active, limit=limit, offset=offset, db=db)


@router.patch(
    "/users/{user_id}/status",
    response_model=UserAdminResponse,
    summary="Activate or deactivate a user account",
)
async def update_user_status(
    user_id: int,
    data: UserStatusUpdate,
    current_admin: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> UserAdminResponse:
    """
    Toggle a user's account activation status.
    Admins cannot deactivate their own account.
    """
    return await toggle_user_active_status(
        target_user_id=user_id,
        is_active=data.is_active,
        current_admin=current_admin,
        db=db,
    )


@router.get(
    "/stats",
    response_model=AdminDashboardStats,
    summary="Platform-wide dashboard statistics",
)
async def get_stats(
    db: AsyncSession = Depends(get_db),
) -> AdminDashboardStats:
    """
    Aggregates platform statistics for admin dashboard view.
    """
    return await get_system_stats(db=db)
