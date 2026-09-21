"""
Tests for Doctor directory endpoint (/api/doctors).
"""

import pytest
from datetime import datetime, timezone
from httpx import AsyncClient, ASGITransport
from passlib.context import CryptContext

from app.main import app
from app.database import AsyncSessionLocal
from app.models.user import User, UserRole
from app.models.doctor import DoctorProfile

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


@pytest.mark.asyncio
async def test_list_approved_doctors():
    """Verify GET /api/doctors only returns approved doctors with is_approved=True."""
    raw_password = "SecurePassword123!"
    hashed_pwd = pwd_context.hash(raw_password)

    async with AsyncSessionLocal() as db:
        ts = int(datetime.now(timezone.utc).timestamp() * 1000)

        # 1. Approved Doctor
        doc1_user = User(
            email=f"app_doc_{ts}@example.com",
            password_hash=hashed_pwd,
            role=UserRole.DOCTOR,
            is_active=True,
        )
        db.add(doc1_user)
        await db.flush()

        doc1_profile = DoctorProfile(
            user_id=doc1_user.id,
            name="Dr. Sarah Connor",
            specialty="Cardiology",
            license_number=f"LIC-APP-{ts}",
            is_approved=True,
        )
        db.add(doc1_profile)

        # 2. Unapproved Doctor (Pending)
        doc2_user = User(
            email=f"pend_doc_{ts}@example.com",
            password_hash=hashed_pwd,
            role=UserRole.DOCTOR,
            is_active=True,
        )
        db.add(doc2_user)
        await db.flush()

        doc2_profile = DoctorProfile(
            user_id=doc2_user.id,
            name="Dr. Unapproved Smith",
            specialty="Neurology",
            license_number=f"LIC-PEND-{ts}",
            is_approved=False,
        )
        db.add(doc2_profile)

        await db.commit()

        doc1_id = doc1_profile.id
        doc2_id = doc2_profile.id

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/doctors")
        assert res.status_code == 200
        doctors = res.json()
        assert isinstance(doctors, list)

        # Approved doctor should be present
        assert any(d["id"] == doc1_id and d["name"] == "Dr. Sarah Connor" for d in doctors)
        # Unapproved doctor should NOT be present
        assert not any(d["id"] == doc2_id for d in doctors)
