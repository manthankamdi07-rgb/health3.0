"""
Router for medical records (MongoDB).
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.database import get_db
from app.mongodb import get_mongo_db
from app.models.user import User, PatientProfile, UserRole
from app.schemas.record import RecordCreate, RecordOut
from app.utils.security import get_current_user
from app.services.access_request import check_doctor_has_access
from app.services.record import create_record, get_patient_records, get_record_by_id

router = APIRouter(prefix="/api/records", tags=["Medical Records"])


async def require_mongo(db_mongo: AsyncIOMotorDatabase | None = Depends(get_mongo_db)) -> AsyncIOMotorDatabase:
    """Dependency to ensure MongoDB is connected."""
    if db_mongo is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="MongoDB is not connected. Flexible medical records are currently unavailable.",
        )
    return db_mongo


@router.post(
    "/{patient_unique_id}",
    response_model=RecordOut,
    status_code=201,
    summary="Create a medical record (Doctors only)",
)
async def create_medical_record(
    patient_unique_id: str,
    data: RecordCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    db_mongo: AsyncIOMotorDatabase = Depends(require_mongo),
):
    """
    Doctor creates a new clinical note/record for a patient.
    Requires an active approved access request.
    """
    if current_user.role != UserRole.DOCTOR:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only doctors can create medical records.",
        )

    # Lookup patient to check access
    result = await db.execute(
        select(PatientProfile).where(PatientProfile.patient_id == patient_unique_id)
    )
    patient_profile = result.scalar_one_or_none()
    if not patient_profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found.")

    has_access = await check_doctor_has_access(current_user.id, patient_profile.user_id, db)
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have active access to this patient's records.",
        )

    # Get doctor name
    from app.models.doctor import DoctorProfile
    doctor_result = await db.execute(
        select(DoctorProfile).where(DoctorProfile.user_id == current_user.id)
    )
    doctor_profile = doctor_result.scalar_one()

    record = await create_record(
        db_mongo=db_mongo,
        doctor_id=current_user.id,
        doctor_name=doctor_profile.name,
        patient_unique_id=patient_unique_id,
        data=data,
    )

    # Notify patient about the new medical record
    patient_user_res = await db.execute(select(User).where(User.id == patient_profile.user_id))
    patient_user = patient_user_res.scalar_one_or_none()
    if patient_user:
        from app.services.notifications import notify_patient_new_record
        await notify_patient_new_record(
            patient_email=patient_user.email,
            doctor_name=doctor_profile.name,
            record_title=data.title,
            user_id=patient_user.id,
            db=db,
        )

    return record


@router.get(
    "/{patient_unique_id}",
    response_model=list[RecordOut],
    summary="List patient medical records",
)
async def list_medical_records(
    patient_unique_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    db_mongo: AsyncIOMotorDatabase = Depends(require_mongo),
):
    """
    List all records for a patient.
    - If patient: Can only view their own records.
    - If doctor: Must have active approved access.
    """
    # Lookup patient
    result = await db.execute(
        select(PatientProfile).where(PatientProfile.patient_id == patient_unique_id)
    )
    patient_profile = result.scalar_one_or_none()
    if not patient_profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found.")

    if current_user.role == UserRole.PATIENT:
        if current_user.id != patient_profile.user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only view your own medical records.",
            )
    elif current_user.role == UserRole.DOCTOR:
        has_access = await check_doctor_has_access(current_user.id, patient_profile.user_id, db)
        if not has_access:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have active access to this patient's records.",
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions.",
        )

    records = await get_patient_records(db_mongo, patient_unique_id)
    return records
