"""
Router for medical file uploads, scans, and retrievals.
"""

from typing import List, Optional
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    UploadFile,
    File,
    Form,
    status,
)
from fastapi.responses import FileResponse as FastAPISendFileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
import json
from app.models.user import User, PatientProfile, UserRole
from app.models.file import MedicalFile
from app.schemas.file import (
    FileResponse,
    FileCategory,
    StructuredClinicalEntities,
    DocumentDigitizeResponse,
)
from app.services.storage import LocalStorageService, get_storage_service
from app.services.access_request import check_doctor_has_access
from app.services.document_intelligence import document_intelligence_service
from app.utils.security import get_current_user, get_optional_current_user

router = APIRouter(prefix="/api/files", tags=["Files & Scans"])


def _parse_file_response(f: MedicalFile) -> FileResponse:
    """Helper to convert MedicalFile ORM model into enriched FileResponse schema."""
    entities_parsed = None
    if getattr(f, "structured_entities", None):
        try:
            data = json.loads(f.structured_entities)
            entities_parsed = StructuredClinicalEntities(**data)
        except Exception:
            pass

    return FileResponse(
        id=f.id,
        file_id=f.file_id,
        patient_unique_id=f.patient_unique_id,
        uploader_id=f.uploader_id,
        filename=f.filename,
        file_category=f.file_category,
        department=f.department or "General",
        content_type=f.content_type,
        size_bytes=f.size_bytes,
        download_url=f"/api/files/{f.file_id}",
        created_at=f.created_at,
        extracted_text=getattr(f, "extracted_text", None),
        structured_entities=entities_parsed,
        ocr_status=getattr(f, "ocr_status", "pending") or "pending",
    )



@router.post(
    "/upload/{patient_unique_id}",
    response_model=FileResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload a medical file or scan for a patient",
)
async def upload_file(
    patient_unique_id: str,
    file: UploadFile = File(...),
    file_category: FileCategory = Form(FileCategory.OTHER),
    department: str = Form("General"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    storage: LocalStorageService = Depends(get_storage_service),
) -> FileResponse:
    """
    Upload a medical file (X-ray, lab report, prescription, or scan).
    - Patients may only upload to their own account.
    - Doctors may upload for patients where they hold active approved access.
    """
    # 1. Verify patient exists
    result = await db.execute(
        select(PatientProfile).where(PatientProfile.patient_id == patient_unique_id)
    )
    patient_profile = result.scalar_one_or_none()
    if not patient_profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient not found.",
        )

    # 2. Check authorization
    if current_user.role == UserRole.PATIENT:
        if current_user.id != patient_profile.user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only upload files to your own medical profile.",
            )
    elif current_user.role == UserRole.DOCTOR:
        has_access = await check_doctor_has_access(
            current_user.id, patient_profile.user_id, db
        )
        if not has_access:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have active approved access to upload files for this patient.",
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Unauthorized role for file upload.",
        )

    # 3. Read file content and save to storage
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot upload an empty file.",
        )

    meta = await storage.save_file(
        file_bytes=file_bytes,
        original_filename=file.filename or "uploaded_file",
        content_type=file.content_type or "application/octet-stream",
    )

    # 4. Save metadata to database
    medical_file = MedicalFile(
        file_id=meta["file_id"],
        patient_id=patient_profile.user_id,
        patient_unique_id=patient_unique_id,
        uploader_id=current_user.id,
        filename=meta["filename"],
        file_category=file_category.value,
        department=department or "General",
        content_type=meta["content_type"],
        size_bytes=meta["size_bytes"],
        storage_path=meta["storage_path"],
    )
    db.add(medical_file)
    await db.commit()
    await db.refresh(medical_file)

    # 5. If doctor uploaded the file, notify the patient
    if current_user.role == UserRole.DOCTOR:
        from app.models.doctor import DoctorProfile
        from app.services.notifications import notify_patient_new_file
        doc_prof_res = await db.execute(select(DoctorProfile).where(DoctorProfile.user_id == current_user.id))
        doc_prof = doc_prof_res.scalar_one_or_none()
        patient_user_res = await db.execute(select(User).where(User.id == patient_profile.user_id))
        patient_user = patient_user_res.scalar_one_or_none()
        if doc_prof and patient_user:
            await notify_patient_new_file(
                patient_email=patient_user.email,
                doctor_name=doc_prof.name,
                filename=medical_file.filename,
                file_category=medical_file.file_category,
                user_id=patient_user.id,
                file_id=medical_file.file_id,
                db=db,
            )

    return _parse_file_response(medical_file)


@router.post(
    "/digitize-and-upload/{patient_unique_id}",
    response_model=FileResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload and immediately digitize a medical document with OCR & Clinical Entity Extraction (Module B)",
)
async def digitize_and_upload_file(
    patient_unique_id: str,
    file: UploadFile = File(...),
    file_category: FileCategory = Form(FileCategory.OTHER),
    department: str = Form("General"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    storage: LocalStorageService = Depends(get_storage_service),
) -> FileResponse:
    """
    Module B: Integrated medical document scanning, multilingual OCR, and clinical entity extraction.
    Uploads prior prescriptions, lab reports, or discharge summaries and automatically structures
    medications, lab values, and diagnoses.
    """
    # 1. Verify patient exists
    result = await db.execute(
        select(PatientProfile).where(PatientProfile.patient_id == patient_unique_id)
    )
    patient_profile = result.scalar_one_or_none()
    if not patient_profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient not found.",
        )

    # 2. Check authorization
    if current_user.role == UserRole.PATIENT:
        if current_user.id != patient_profile.user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only upload files to your own medical profile.",
            )
    elif current_user.role == UserRole.DOCTOR:
        has_access = await check_doctor_has_access(
            current_user.id, patient_profile.user_id, db
        )
        if not has_access:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have active approved access to upload files for this patient.",
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Unauthorized role for file upload.",
        )

    # 3. Read file content and save to storage
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot upload an empty file.",
        )

    meta = await storage.save_file(
        file_bytes=file_bytes,
        original_filename=file.filename or "medical_document",
        content_type=file.content_type or "application/octet-stream",
    )

    # 4. Perform Medical Document Digitization (Multilingual OCR + Clinical Entities)
    file_path = storage.get_file_path(meta["storage_path"])
    digitize_res = await document_intelligence_service.digitize_document(
        file_path=file_path,
        content_type=meta["content_type"],
        filename=meta["filename"],
        file_category=file_category.value,
    )

    extracted_text = digitize_res.get("extracted_text") or ""
    entities = digitize_res.get("entities") or {}
    ocr_status_val = digitize_res.get("ocr_status") or "completed"

    # 5. Save MedicalFile record
    medical_file = MedicalFile(
        file_id=meta["file_id"],
        patient_id=patient_profile.user_id,
        patient_unique_id=patient_unique_id,
        uploader_id=current_user.id,
        filename=meta["filename"],
        file_category=file_category.value,
        department=department or "General",
        content_type=meta["content_type"],
        size_bytes=meta["size_bytes"],
        storage_path=meta["storage_path"],
        extracted_text=extracted_text,
        structured_entities=json.dumps(entities),
        ocr_status=ocr_status_val,
    )
    db.add(medical_file)
    await db.commit()
    await db.refresh(medical_file)

    # If doctor uploaded the file, notify patient
    if current_user.role == UserRole.DOCTOR:
        from app.models.doctor import DoctorProfile
        from app.services.notifications import notify_patient_new_file
        doc_prof_res = await db.execute(select(DoctorProfile).where(DoctorProfile.user_id == current_user.id))
        doc_prof = doc_prof_res.scalar_one_or_none()
        patient_user_res = await db.execute(select(User).where(User.id == patient_profile.user_id))
        patient_user = patient_user_res.scalar_one_or_none()
        if doc_prof and patient_user:
            await notify_patient_new_file(
                patient_email=patient_user.email,
                doctor_name=doc_prof.name,
                filename=medical_file.filename,
                file_category=medical_file.file_category,
                user_id=patient_user.id,
                file_id=medical_file.file_id,
                db=db,
            )

    return _parse_file_response(medical_file)




@router.get(
    "/{file_id}",
    summary="Download or stream an uploaded file",
)
async def download_file(
    file_id: str,
    current_user: User | None = Depends(get_optional_current_user),
    db: AsyncSession = Depends(get_db),
    storage: LocalStorageService = Depends(get_storage_service),
):
    """
    Download a file by its unique file_id.
    - Profile photos are publicly accessible (e.g. for avatar display in <img> tags).
    - Patients can download their own files.
    - Doctors can download if they have approved access to the patient.
    """
    result = await db.execute(
        select(MedicalFile).where(MedicalFile.file_id == file_id)
    )
    medical_file = result.scalar_one_or_none()
    if not medical_file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File record not found.",
        )

    # Public access for profile avatars
    if medical_file.file_category == "profile_photo":
        file_path = storage.get_file_path(medical_file.storage_path)
        return FastAPISendFileResponse(
            path=file_path,
            filename=medical_file.filename,
            media_type=medical_file.content_type,
        )

    # Authentication is required for medical records/scans
    if not current_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
        )

    # Check authorization
    if current_user.role == UserRole.PATIENT:
        if current_user.id != medical_file.patient_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to access this file.",
            )
    elif current_user.role == UserRole.DOCTOR:
        has_access = await check_doctor_has_access(
            current_user.id, medical_file.patient_id, db
        )
        if not has_access and current_user.id != medical_file.uploader_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have active access to view this patient's files.",
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Unauthorized role for file access.",
        )

    file_path = storage.get_file_path(medical_file.storage_path)
    return FastAPISendFileResponse(
        path=file_path,
        filename=medical_file.filename,
        media_type=medical_file.content_type,
    )


@router.get(
    "/patient/{patient_unique_id}",
    response_model=List[FileResponse],
    summary="List all uploaded files for a patient",
)
async def list_patient_files(
    patient_unique_id: str,
    file_category: Optional[FileCategory] = None,
    department: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[FileResponse]:
    """
    List files associated with a patient profile.
    - Patients can view their own file lists.
    - Doctors can view if they have active approved access.
    """
    result = await db.execute(
        select(PatientProfile).where(PatientProfile.patient_id == patient_unique_id)
    )
    patient_profile = result.scalar_one_or_none()
    if not patient_profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient not found.",
        )

    if current_user.role == UserRole.PATIENT:
        if current_user.id != patient_profile.user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only view your own files.",
            )
    elif current_user.role == UserRole.DOCTOR:
        has_access = await check_doctor_has_access(
            current_user.id, patient_profile.user_id, db
        )
        if not has_access:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have active approved access to this patient's files.",
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Unauthorized role for file listing.",
        )

    stmt = (
        select(MedicalFile)
        .where(MedicalFile.patient_unique_id == patient_unique_id)
        .order_by(MedicalFile.created_at.desc())
    )
    if file_category:
        stmt = stmt.where(MedicalFile.file_category == file_category.value)
    if department and department.strip() and department.strip().lower() != "all":
        stmt = stmt.where(MedicalFile.department.ilike(department.strip()))

    files_result = await db.execute(stmt)
    records = files_result.scalars().all()

    return [_parse_file_response(f) for f in records]


@router.delete(
    "/{file_id}",
    summary="Delete an uploaded medical file (Task A1)",
)
async def delete_file(
    file_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    storage: LocalStorageService = Depends(get_storage_service),
):
    """
    Delete a previously uploaded file.
    - Only the owning patient can delete their file.
    - Removes the physical file from storage.
    - Removes the corresponding metadata record from the database.
    """
    result = await db.execute(
        select(MedicalFile).where(MedicalFile.file_id == file_id)
    )
    medical_file = result.scalar_one_or_none()
    if not medical_file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File record not found.",
        )

    # Ownership check: only the owning patient can delete
    if current_user.role != UserRole.PATIENT or current_user.id != medical_file.patient_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the owning patient can delete this file.",
        )

    # Remove physical file from storage
    await storage.delete_file(medical_file.storage_path)

    # Remove record from database
    await db.delete(medical_file)
    await db.commit()

    return {
        "message": "File deleted successfully.",
        "file_id": file_id,
    }


@router.post(
    "/{file_id}/digitize",
    response_model=DocumentDigitizeResponse,
    summary="Run AI OCR & Clinical Entity Extraction on an existing document",
)
async def digitize_existing_file(
    file_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    storage: LocalStorageService = Depends(get_storage_service),
) -> DocumentDigitizeResponse:
    """
    Triggers OCR transcription and clinical entity extraction on an already uploaded document.
    """
    result = await db.execute(
        select(MedicalFile).where(MedicalFile.file_id == file_id)
    )
    medical_file = result.scalar_one_or_none()
    if not medical_file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File record not found.",
        )

    if current_user.role == UserRole.PATIENT:
        if current_user.id != medical_file.patient_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only digitize your own medical files.",
            )
    elif current_user.role == UserRole.DOCTOR:
        has_access = await check_doctor_has_access(
            current_user.id, medical_file.patient_id, db
        )
        if not has_access:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have access to this patient's files.",
            )

    file_path = storage.get_file_path(medical_file.storage_path)
    res = await document_intelligence_service.digitize_document(
        file_path=file_path,
        content_type=medical_file.content_type,
        filename=medical_file.filename,
        file_category=medical_file.file_category,
    )

    medical_file.extracted_text = res.get("extracted_text") or ""
    medical_file.structured_entities = json.dumps(res.get("entities", {}))
    medical_file.ocr_status = res.get("ocr_status") or "completed"

    await db.commit()
    await db.refresh(medical_file)

    parsed = StructuredClinicalEntities(**res.get("entities", {}))
    return DocumentDigitizeResponse(
        file_id=medical_file.file_id,
        filename=medical_file.filename,
        ocr_status=medical_file.ocr_status,
        extracted_text=medical_file.extracted_text,
        entities=parsed,
    )


@router.get(
    "/{file_id}/entities",
    response_model=StructuredClinicalEntities,
    summary="Get structured clinical entities for a digitized document",
)
async def get_file_entities(
    file_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StructuredClinicalEntities:
    """Retrieve parsed clinical entities (medications, labs, diagnoses) for a file."""
    result = await db.execute(
        select(MedicalFile).where(MedicalFile.file_id == file_id)
    )
    medical_file = result.scalar_one_or_none()
    if not medical_file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File record not found.",
        )

    if medical_file.structured_entities:
        try:
            data = json.loads(medical_file.structured_entities)
            return StructuredClinicalEntities(**data)
        except Exception:
            pass

    return StructuredClinicalEntities(
        document_type=medical_file.file_category or "Other",
        document_date=medical_file.created_at.strftime("%Y-%m-%d"),
    )


@router.put(
    "/{file_id}/entities",
    response_model=StructuredClinicalEntities,
    summary="Update or review structured clinical entities for a document",
)
async def update_file_entities(
    file_id: str,
    data: StructuredClinicalEntities,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StructuredClinicalEntities:
    """Allow patient or doctor to review, edit, and confirm extracted clinical entities."""
    result = await db.execute(
        select(MedicalFile).where(MedicalFile.file_id == file_id)
    )
    medical_file = result.scalar_one_or_none()
    if not medical_file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File record not found.",
        )

    medical_file.structured_entities = json.dumps(data.model_dump())
    await db.commit()
    await db.refresh(medical_file)
    return data
