"""
Router for patient profile CRUD.
"""

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User, PatientProfile, UserRole
from app.models.file import MedicalFile
from app.schemas.profile import PatientProfileOut, PatientProfileUpdate
from app.services.storage import LocalStorageService, get_storage_service
from app.utils.security import get_current_user, require_role

router = APIRouter(prefix="/api/profile", tags=["Patient Profile"])


@router.get(
    "/me",
    response_model=PatientProfileOut,
    summary="Get my profile",
    dependencies=[Depends(require_role(UserRole.PATIENT))],
)
async def get_my_profile(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Patient retrieves their own profile."""
    result = await db.execute(
        select(PatientProfile).where(PatientProfile.user_id == current_user.id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found.")

    return PatientProfileOut(
        patient_id=profile.patient_id,
        name=profile.name,
        age=profile.age,
        blood_group=profile.blood_group,
        allergies=profile.allergies,
        profile_photo_url=profile.profile_photo_url,
        email=current_user.email,
        phone=current_user.phone,
        created_at=profile.created_at,
    )


@router.put(
    "/me",
    response_model=PatientProfileOut,
    summary="Update my profile",
    dependencies=[Depends(require_role(UserRole.PATIENT))],
)
async def update_my_profile(
    data: PatientProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Patient updates their own profile. Only provided fields are changed."""
    result = await db.execute(
        select(PatientProfile).where(PatientProfile.user_id == current_user.id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found.")

    # Apply only the fields that were explicitly sent
    update_data = data.model_dump(exclude_unset=True)
    if "phone" in update_data:
        current_user.phone = update_data.pop("phone")
    for field, value in update_data.items():
        setattr(profile, field, value)

    await db.commit()
    await db.refresh(profile)
    await db.refresh(current_user)

    return PatientProfileOut(
        patient_id=profile.patient_id,
        name=profile.name,
        age=profile.age,
        blood_group=profile.blood_group,
        allergies=profile.allergies,
        profile_photo_url=profile.profile_photo_url,
        email=current_user.email,
        phone=current_user.phone,
        created_at=profile.created_at,
    )


@router.get(
    "/{patient_unique_id}",
    response_model=PatientProfileOut,
    summary="View a patient's profile (for doctors with access)",
    dependencies=[Depends(require_role(UserRole.DOCTOR))],
)
async def get_patient_profile(
    patient_unique_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Doctor views a patient's profile — requires active approved access."""
    from app.services.access_request import check_doctor_has_access

    result = await db.execute(
        select(PatientProfile).where(PatientProfile.patient_id == patient_unique_id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found.")

    has_access = await check_doctor_has_access(current_user.id, profile.user_id, db)
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have active access to this patient's records.",
        )

    # Get patient's user record for email/phone
    user_result = await db.execute(select(User).where(User.id == profile.user_id))
    patient_user = user_result.scalar_one()

    return PatientProfileOut(
        patient_id=profile.patient_id,
        name=profile.name,
        age=profile.age,
        blood_group=profile.blood_group,
        allergies=profile.allergies,
        profile_photo_url=profile.profile_photo_url,
        email=patient_user.email,
        phone=patient_user.phone,
        created_at=profile.created_at,
    )


@router.post(
    "/photo",
    summary="Upload profile photo (Patient & Doctor)",
)
async def upload_profile_photo(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    storage: LocalStorageService = Depends(get_storage_service),
):
    """
    Upload a profile photo for the authenticated user (patient or doctor).
    Accepts standard image formats (jpg, png, webp).
    Stores in the file storage and links to the user's profile record.
    """
    if not file.content_type or not file.content_type.lower().startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only image files (JPG, PNG, WebP) are allowed for profile photos.",
        )

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot upload an empty file.",
        )

    meta = await storage.save_file(
        file_bytes=file_bytes,
        original_filename=file.filename or "profile_photo.jpg",
        content_type=file.content_type or "image/jpeg",
    )

    photo_url = f"/api/files/{meta['file_id']}"

    # Also register in MedicalFile so it can be served as a profile_photo
    medical_file = MedicalFile(
        file_id=meta["file_id"],
        patient_id=current_user.id,
        patient_unique_id=f"USER-{current_user.id}",
        uploader_id=current_user.id,
        filename=meta["filename"],
        file_category="profile_photo",
        content_type=meta["content_type"],
        size_bytes=meta["size_bytes"],
        storage_path=meta["storage_path"],
    )
    db.add(medical_file)

    if current_user.role == UserRole.PATIENT:
        res = await db.execute(
            select(PatientProfile).where(PatientProfile.user_id == current_user.id)
        )
        patient_prof = res.scalar_one_or_none()
        if not patient_prof:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient profile not found.")
        patient_prof.profile_photo_url = photo_url
        medical_file.patient_unique_id = patient_prof.patient_id

    elif current_user.role == UserRole.DOCTOR:
        from app.models.doctor import DoctorProfile
        res = await db.execute(
            select(DoctorProfile).where(DoctorProfile.user_id == current_user.id)
        )
        doctor_prof = res.scalar_one_or_none()
        if not doctor_prof:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Doctor profile not found.")
        doctor_prof.profile_photo_url = photo_url
        medical_file.patient_unique_id = doctor_prof.license_number

    await db.commit()

    return {"profile_photo_url": photo_url}
