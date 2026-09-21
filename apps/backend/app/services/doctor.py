from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException, status

from app.models.user import User, UserRole
from app.models.doctor import DoctorProfile
from app.schemas.doctor import DoctorRegisterRequest
from app.schemas.auth import MessageResponse
from app.services.auth import hash_password


async def register_doctor(
    data: DoctorRegisterRequest, db: AsyncSession
) -> MessageResponse:
    """
    Register a new doctor account.

    Flow:
    1. Check if email or license number already exists.
    2. Hash password and create User (role=DOCTOR).
    3. Create DoctorProfile (is_approved=False).
    4. Return success message (no JWT token yet as it requires admin approval).
    """
    # 1. Check for duplicate email
    existing_user = await db.execute(
        select(User).where(User.email == data.email)
    )
    if existing_user.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )

    # 1b. Check for duplicate license number
    existing_license = await db.execute(
        select(DoctorProfile).where(DoctorProfile.license_number == data.license_number)
    )
    if existing_license.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A doctor with this license number is already registered.",
        )

    # 2. Hash password and create User
    hashed = hash_password(data.password)
    user = User(
        email=data.email,
        phone=data.phone,
        password_hash=hashed,
        role=UserRole.DOCTOR,
    )
    db.add(user)
    await db.flush()  # Get user.id

    # 3. Create DoctorProfile
    profile = DoctorProfile(
        user_id=user.id,
        name=data.name,
        license_number=data.license_number,
        specialty=data.specialty,
        is_approved=False,
    )
    db.add(profile)
    await db.commit()

    return MessageResponse(
        message="Registration successful. Your account is pending admin approval.",
        detail="You will be notified once your license is verified and account is activated.",
    )
