"""
Tests for Profile Photo Upload (Item 4).
"""

import io
import pytest
from datetime import datetime, timezone
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.database import AsyncSessionLocal
from app.models.user import User, PatientProfile, UserRole
from app.models.doctor import DoctorProfile
from app.utils.jwt import create_access_token


@pytest.mark.asyncio
async def test_patient_and_doctor_profile_photo_upload():
    """Verify photo upload for patient & doctor, public avatar serving, and format validation."""
    ts = int(datetime.now(timezone.utc).timestamp() * 1000)

    async with AsyncSessionLocal() as db:
        # 1. Setup Patient
        patient_user = User(
            email=f"patient_photo_{ts}@example.com",
            phone=f"+1000000{ts % 10000}",
            password_hash="hash",
            role=UserRole.PATIENT,
            is_active=True,
        )
        db.add(patient_user)
        await db.flush()

        patient_profile = PatientProfile(
            user_id=patient_user.id,
            patient_id=f"PAT-PIC-{ts % 10000}",
            name="Photo Tester",
            age=25,
            blood_group="O+",
            allergies=None,
        )
        db.add(patient_profile)

        # 2. Setup Doctor
        doc_user = User(
            email=f"doc_photo_{ts}@example.com",
            password_hash="hash",
            role=UserRole.DOCTOR,
            is_active=True,
        )
        db.add(doc_user)
        await db.flush()

        doc_profile = DoctorProfile(
            user_id=doc_user.id,
            name="Dr. Photo Specialist",
            specialty="Dermatology",
            license_number=f"DOC-PIC-{ts}",
            is_approved=True,
        )
        db.add(doc_profile)
        await db.commit()

        patient_id_val = patient_user.id
        doc_id_val = doc_user.id
        pat_unique_id = patient_profile.patient_id

    patient_token = create_access_token({"sub": str(patient_id_val), "role": UserRole.PATIENT.value, "patient_id": pat_unique_id})
    doc_token = create_access_token({"sub": str(doc_id_val), "role": UserRole.DOCTOR.value})

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Step 1: Reject non-image file upload
        fake_txt = io.BytesIO(b"Hello text file")
        res_reject = await client.post(
            "/api/profile/photo",
            headers={"Authorization": f"Bearer {patient_token}"},
            files={"file": ("test.txt", fake_txt, "text/plain")},
        )
        assert res_reject.status_code == 400

        # Step 2: Upload valid PNG photo for patient
        fake_png = io.BytesIO(b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4")
        res_upload = await client.post(
            "/api/profile/photo",
            headers={"Authorization": f"Bearer {patient_token}"},
            files={"file": ("avatar.png", fake_png, "image/png")},
        )
        assert res_upload.status_code == 200
        data = res_upload.json()
        assert "profile_photo_url" in data
        photo_url = data["profile_photo_url"]
        assert photo_url.startswith("/api/files/")

        # Step 3: Verify GET /api/profile/me has updated photo
        res_me = await client.get(
            "/api/profile/me",
            headers={"Authorization": f"Bearer {patient_token}"},
        )
        assert res_me.status_code == 200
        assert res_me.json()["profile_photo_url"] == photo_url

        # Step 4: Verify public unauthenticated access to the avatar URL (for <img> tags)
        res_img = await client.get(photo_url)
        assert res_img.status_code == 200
        assert res_img.headers["content-type"].startswith("image/")

        # Step 5: Upload valid JPEG photo for doctor
        fake_jpeg = io.BytesIO(b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00`\x00`\x00\x00\xff\xdb\x00C\x00")
        res_doc_upload = await client.post(
            "/api/profile/photo",
            headers={"Authorization": f"Bearer {doc_token}"},
            files={"file": ("dr_avatar.jpg", fake_jpeg, "image/jpeg")},
        )
        assert res_doc_upload.status_code == 200
        doc_photo_url = res_doc_upload.json()["profile_photo_url"]

        # Step 6: Verify GET /api/doctors/profile/me has doctor photo
        res_doc_me = await client.get(
            "/api/doctors/profile/me",
            headers={"Authorization": f"Bearer {doc_token}"},
        )
        assert res_doc_me.status_code == 200
        assert res_doc_me.json()["profile_photo_url"] == doc_photo_url
