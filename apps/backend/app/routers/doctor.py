from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.doctor import DoctorProfile
from app.models.user import User, UserRole
from app.schemas.doctor import DoctorRegisterRequest, DoctorPublicResponse, DoctorProfileResponse
from app.schemas.auth import MessageResponse
from app.services.doctor import register_doctor
from app.utils.security import get_current_user, require_role

router = APIRouter(prefix="/api/doctors", tags=["Doctors"])


@router.get(
    "",
    response_model=List[DoctorPublicResponse],
    summary="List approved doctors",
    description="Returns public list of active approved doctors for booking and directory.",
)
async def list_approved_doctors_endpoint(
    db: AsyncSession = Depends(get_db),
) -> List[DoctorPublicResponse]:
    """
    Retrieve all approved doctors.
    """
    stmt = (
        select(DoctorProfile)
        .join(User, DoctorProfile.user_id == User.id)
        .where(DoctorProfile.is_approved == True, User.is_active == True)
        .order_by(DoctorProfile.name.asc())
    )
    result = await db.execute(stmt)
    doctors = result.scalars().all()
    return [
        DoctorPublicResponse(
            id=doc.id,
            user_id=doc.user_id,
            name=doc.name,
            specialty=doc.specialty,
            license_number=doc.license_number,
            profile_photo_url=doc.profile_photo_url,
        )
        for doc in doctors
    ]


@router.get(
    "/profile/me",
    response_model=DoctorProfileResponse,
    summary="Get authenticated doctor's profile",
    dependencies=[Depends(require_role(UserRole.DOCTOR))],
)
async def get_my_doctor_profile(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DoctorProfileResponse:
    """Retrieve profile for the authenticated doctor."""
    result = await db.execute(
        select(DoctorProfile).where(DoctorProfile.user_id == current_user.id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Doctor profile not found.",
        )
    return DoctorProfileResponse(
        user_id=doc.user_id,
        name=doc.name,
        license_number=doc.license_number,
        specialty=doc.specialty,
        is_approved=doc.is_approved,
        profile_photo_url=doc.profile_photo_url,
    )


@router.post(
    "/register",
    response_model=MessageResponse,
    status_code=201,
    summary="Register a new doctor",
    description="Creates a doctor account in a pending state, requiring admin approval.",
)
async def register_doctor_endpoint(
    data: DoctorRegisterRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Doctor sign-up flow.
    """
    return await register_doctor(data, db)

