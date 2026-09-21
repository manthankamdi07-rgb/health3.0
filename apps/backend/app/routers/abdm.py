"""
ABDM API Router — Health 4.0 Part A.
Provides endpoints for ABHA authentication, direct login, account linking,
consent management, and background health record filing.
"""

from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.utils.security import get_current_user
from app.models.user import User, PatientProfile, UserRole
from app.services.abdm import (
    initiate_abha_auth,
    verify_abha_otp,
    link_abha_to_patient,
    unlink_abha_from_patient,
    login_with_abha,
    record_patient_consent,
    get_patient_consent_status,
    push_record_to_abdm_background,
)

router = APIRouter(prefix="/api/abdm", tags=["ABDM - Ayushman Bharat Digital Mission"])


class AbhaInitRequest(BaseModel):
    auth_mode: str = Field(default="AADHAAR_OTP", description="AADHAAR_OTP, MOBILE_OTP, or ABHA_NUMBER")
    identifier: str = Field(..., description="12-digit Aadhaar, 14-digit ABHA, or 10-digit Mobile")


class AbhaVerifyRequest(BaseModel):
    txn_id: str
    otp: str


class AbdmConsentRequest(BaseModel):
    appointment_id: Optional[int] = None
    scopes: List[str] = Field(
        default=["VISIT_SUMMARY", "UPLOADED_DOCUMENTS", "AI_NOTES"],
        description="Explicit scopes permitted for ABDM sharing",
    )
    is_granted: bool = True


@router.post("/auth/init")
async def abha_init_auth(req: AbhaInitRequest):
    """
    Step 1: Initiate ABDM ABHA verification / login challenge.
    Sends OTP to registered mobile number in sandbox or via live gateway.
    """
    try:
        res = await initiate_abha_auth(req.auth_mode, req.identifier)
        return res
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/auth/verify")
async def abha_verify_and_link(
    req: AbhaVerifyRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Step 2: Verify OTP and link the verified ABHA ID to the logged-in patient's account.
    """
    if current_user.role != UserRole.PATIENT:
        raise HTTPException(status_code=403, detail="Only patients can link an ABHA account.")

    try:
        verified_data = await verify_abha_otp(req.txn_id, req.otp)
        profile = await link_abha_to_patient(current_user.id, verified_data, db)
        return {
            "status": "success",
            "message": "ABHA successfully linked to patient profile.",
            "abha_number": profile.abha_number,
            "abha_address": profile.abha_address,
            "abha_status": profile.abha_status,
        }
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/auth/login")
async def abha_direct_login(
    req: AbhaVerifyRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Direct ABHA Login: Authenticate patient via verified ABHA OTP challenge.
    Returns standard system JWT token for portal access.
    """
    try:
        user, profile, token = await login_with_abha(req.txn_id, req.otp, db)
        return {
            "access_token": token,
            "token_type": "bearer",
            "user_id": user.id,
            "role": user.role.value,
            "name": profile.name,
            "patient_id": profile.patient_id,
            "email": user.email,
            "abha_number": profile.abha_number,
            "abha_address": profile.abha_address,
            "abha_status": profile.abha_status,
        }
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/consent")
async def submit_abdm_consent(
    req: AbdmConsentRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Record deliberate patient consent for sharing consultation records with ABDM.
    """
    if current_user.role != UserRole.PATIENT:
        raise HTTPException(status_code=403, detail="Only patients can manage ABDM consent.")

    from sqlalchemy import select
    prof_res = await db.execute(select(PatientProfile).where(PatientProfile.user_id == current_user.id))
    profile = prof_res.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Patient profile not found.")

    consent = await record_patient_consent(
        patient_id=current_user.id,
        patient_unique_id=profile.patient_id,
        appointment_id=req.appointment_id,
        abha_address=profile.abha_address,
        scopes=req.scopes,
        db=db,
    )

    return {
        "status": "success",
        "consent_id": consent.id,
        "is_granted": consent.is_granted,
        "scopes": req.scopes,
        "message": "Explicit ABDM consent recorded successfully.",
    }


@router.get("/status")
async def get_abdm_patient_status(
    appointment_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Retrieve current patient's ABHA linking status and active consent.
    """
    if current_user.role != UserRole.PATIENT:
        raise HTTPException(status_code=403, detail="Only patients can query ABHA status.")

    from sqlalchemy import select
    prof_res = await db.execute(select(PatientProfile).where(PatientProfile.user_id == current_user.id))
    profile = prof_res.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Patient profile not found.")

    consent = await get_patient_consent_status(current_user.id, appointment_id, db)

    return {
        "is_linked": profile.abha_status == "LINKED",
        "abha_number": profile.abha_number,
        "abha_address": profile.abha_address,
        "abha_status": profile.abha_status,
        "has_active_consent": bool(consent and consent.is_granted),
        "consent": {
            "id": consent.id,
            "granted_at": consent.granted_at.isoformat() if consent.granted_at else None,
            "scopes": consent.scopes,
        } if consent else None,
    }


@router.post("/unlink")
async def unlink_patient_abha(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Unlink ABHA ID from patient profile and revoke any active consent.
    """
    if current_user.role != UserRole.PATIENT:
        raise HTTPException(status_code=403, detail="Only patients can unlink ABHA.")

    try:
        profile = await unlink_abha_from_patient(current_user.id, db)
        return {
            "status": "success",
            "message": "ABHA successfully unlinked.",
            "abha_status": profile.abha_status,
        }
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/push/{appointment_id}")
async def trigger_abdm_push(
    appointment_id: int,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
):
    """
    Trigger or retry background filing of consultation record to ABDM.
    """
    background_tasks.add_task(push_record_to_abdm_background, appointment_id)
    return {
        "status": "scheduled",
        "appointment_id": appointment_id,
        "message": "Asynchronous ABDM filing scheduled.",
    }
