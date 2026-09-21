"""
Authentication router — sign-up and OTP verification endpoints.
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.auth import (
    LoginRequest,
    PatientRegisterRequest,
    TokenResponse,
    OTPVerifyRequest,
    OTPSendRequest,
    OTPVerifyResponse,
    MessageResponse,
)
from app.services.auth import register_patient, login_user
from app.services.otp import generate_and_send_otp, verify_otp

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Login (patients & doctors)",
    description="Authenticate with email and password. Returns a JWT token.",
)
async def login_endpoint(
    data: LoginRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Shared login for patients and doctors.
    Doctors must be approved by an admin before they can log in.
    """
    return await login_user(data.email, data.password, db)


@router.post(
    "/send-otp",
    response_model=MessageResponse,
    summary="Send OTP to email/phone",
)
async def send_otp_endpoint(
    data: OTPSendRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Sends an OTP to the user's email.
    """
    await generate_and_send_otp(data.email, db)
    return MessageResponse(
        message="OTP sent successfully. Check your email.",
    )


@router.post(
    "/verify-otp",
    response_model=OTPVerifyResponse,
    summary="Verify OTP code",
)
async def verify_otp_endpoint(
    data: OTPVerifyRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Verifies the provided OTP code against the database.
    """
    is_valid = await verify_otp(data.email, data.otp_code, db, consume=False)
    if is_valid:
        return OTPVerifyResponse(
            verified=True,
            message="OTP verified successfully.",
        )
    return OTPVerifyResponse(
        verified=False,
        message="Invalid or expired OTP code.",
    )


@router.post(
    "/register/patient",
    response_model=TokenResponse,
    status_code=201,
    summary="Register a new patient",
    description="Create a patient account after OTP verification.",
)
async def register_patient_endpoint(
    data: PatientRegisterRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Patient sign-up flow:
    1. Verify OTP code.
    2. Validate input (handled by Pydantic).
    3. Create user + patient profile.
    4. Generate unique patient ID.
    5. Return JWT token.
    """
    # Verify OTP first
    is_valid = await verify_otp(data.email, data.otp_code, db, consume=True)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired OTP code.",
        )
        
    result = await register_patient(data, db)
    logger.info(f"New patient registered: {result.patient_id}")
    return result
