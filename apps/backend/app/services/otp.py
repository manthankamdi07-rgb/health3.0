import logging
import secrets
from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException, status
from app.models.otp import OTP
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

async def generate_and_send_otp(email: str, db: AsyncSession) -> str:
    """
    Generates a 6-digit OTP, stores it in the DB, and simulates sending.
    """
    # 1. Generate 6-digit OTP
    otp_code = "".join([str(secrets.randbelow(10)) for _ in range(6)])
    
    # 2. Invalidate older OTPs for this email (optional but good practice)
    # We'll just insert a new one for now and rely on checking the latest one.
    
    # 3. Save to DB
    new_otp = OTP(email=email, otp_code=otp_code)
    db.add(new_otp)
    await db.commit()
    
    # 4. Simulate sending
    logger.info(f"[DEV] OTP sent to {email}: {otp_code}")
    
    return otp_code


async def verify_otp(email: str, otp_code: str, db: AsyncSession, consume: bool = False) -> bool:
    """
    Verifies if the provided OTP code is valid and not expired.
    In development mode, allows any 6-digit numeric code.
    """
    is_dev = settings.ENVIRONMENT.lower() == "development"
    
    # In development mode, allow any 6-digit code as indicated in UI
    if is_dev and len(otp_code) == 6 and otp_code.isdigit():
        if consume:
            stmt = (
                select(OTP)
                .where(OTP.email == email)
                .order_by(OTP.created_at.desc())
                .limit(1)
            )
            result = await db.execute(stmt)
            latest_otp = result.scalar_one_or_none()
            if latest_otp:
                await db.delete(latest_otp)
                await db.commit()
        return True

    # Standard / production verification
    stmt = (
        select(OTP)
        .where(OTP.email == email)
        .order_by(OTP.created_at.desc())
        .limit(1)
    )
    result = await db.execute(stmt)
    latest_otp = result.scalar_one_or_none()
    
    if not latest_otp:
        return False
        
    # Check if expired (normalizing tzinfo for SQLite compatibility)
    expires_at = latest_otp.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if datetime.now(timezone.utc) > expires_at:
        return False
        
    # Check if code matches
    if latest_otp.otp_code != otp_code:
        return False
        
    # Valid! Delete if consumed
    if consume:
        await db.delete(latest_otp)
        await db.commit()
    return True
