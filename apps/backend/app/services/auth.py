"""
Authentication service — registration and login logic.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from passlib.context import CryptContext
from fastapi import HTTPException, status

from app.models.user import User, PatientProfile, UserRole
from app.schemas.auth import PatientRegisterRequest, TokenResponse
from app.utils.jwt import create_access_token
from app.utils.patient_id import generate_patient_id

# Password hashing context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    """Hash a plaintext password using bcrypt."""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plaintext password against a bcrypt hash."""
    return pwd_context.verify(plain_password, hashed_password)


async def register_patient(
    data: PatientRegisterRequest, db: AsyncSession
) -> TokenResponse:
    """
    Register a new patient account.

    Flow:
    1. Check if email already exists → 409 if duplicate.
    2. Hash the password.
    3. Create User record (role=PATIENT).
    4. Generate a unique patient ID (HLT-XXXXXX).
    5. Create PatientProfile linked to the user.
    6. Return a JWT token with user info.

    Args:
        data: Validated registration request.
        db: Async database session.

    Returns:
        TokenResponse with JWT and patient ID.

    Raises:
        HTTPException: 409 if email is already registered.
    """
    # 1. Check for duplicate email
    existing = await db.execute(
        select(User).where(User.email == data.email)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )

    # 2. Hash password
    hashed = hash_password(data.password)

    # 3. Create user
    user = User(
        email=data.email,
        phone=data.phone,
        password_hash=hashed,
        role=UserRole.PATIENT,
    )
    db.add(user)
    await db.flush()  # Get the user.id without committing

    # 4. Generate unique patient ID
    patient_id = await generate_patient_id(db)

    # 5. Create patient profile
    profile = PatientProfile(
        user_id=user.id,
        patient_id=patient_id,
        name=data.name,
        age=data.age,
        blood_group=data.blood_group,
        allergies=data.allergies,
    )
    db.add(profile)
    await db.commit()
    await db.refresh(user)
    await db.refresh(profile)

    # 6. Create JWT token
    token = create_access_token(
        data={
            "sub": str(user.id),
            "role": user.role.value,
            "patient_id": profile.patient_id,
        }
    )

    return TokenResponse(
        access_token=token,
        role=user.role.value,
        patient_id=profile.patient_id,
        user_id=user.id,
        name=profile.name,
    )


async def login_user(
    email: str, password: str, db: AsyncSession
) -> TokenResponse:
    """
    Authenticate a user (patient or doctor) and return a JWT token.

    Flow:
    1. Look up the user by email.
    2. Verify the password.
    3. If doctor, check that account is approved.
    4. Build role-specific token payload.
    5. Return TokenResponse.

    Raises:
        HTTPException 401: Invalid credentials.
        HTTPException 403: Doctor account not yet approved.
    """
    from app.models.doctor import DoctorProfile

    # 1. Find user
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been deactivated.",
        )

    # 2. Build role-specific data
    token_data: dict[str, str] = {
        "sub": str(user.id),
        "role": user.role.value,
    }
    patient_id: str | None = None
    name: str = ""
    profile_photo_url: str | None = None

    if user.role == UserRole.PATIENT:
        profile_result = await db.execute(
            select(PatientProfile).where(PatientProfile.user_id == user.id)
        )
        profile = profile_result.scalar_one_or_none()
        if profile:
            token_data["patient_id"] = profile.patient_id
            patient_id = profile.patient_id
            name = profile.name
            profile_photo_url = profile.profile_photo_url

    elif user.role == UserRole.DOCTOR:
        doctor_result = await db.execute(
            select(DoctorProfile).where(DoctorProfile.user_id == user.id)
        )
        doctor = doctor_result.scalar_one_or_none()
        if doctor:
            if not doctor.is_approved:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Your account is pending admin approval.",
                )
            name = doctor.name
            profile_photo_url = doctor.profile_photo_url

    elif user.role == UserRole.ADMIN:
        name = user.email  # Admins use email as display name

    # 3. Issue token
    token = create_access_token(data=token_data)

    return TokenResponse(
        access_token=token,
        role=user.role.value,
        patient_id=patient_id,
        user_id=user.id,
        name=name,
        profile_photo_url=profile_photo_url,
    )

