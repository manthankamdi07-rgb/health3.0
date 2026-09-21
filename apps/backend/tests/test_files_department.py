"""
Tests for file organization by department and timeline (Item 3).
"""

import io
import pytest
from datetime import datetime, timezone
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.database import AsyncSessionLocal
from app.models.user import User, PatientProfile, UserRole
from app.utils.jwt import create_access_token


@pytest.mark.asyncio
async def test_file_department_and_timeline_filtering():
    """Test file upload with department tag, filtering by department, and timeline ordering."""
    async with AsyncSessionLocal() as db:
        ts = int(datetime.now(timezone.utc).timestamp() * 1000)

        # Create Patient
        patient_user = User(
            email=f"dept_patient_{ts}@example.com",
            phone=f"+1999{ts % 100000}",
            password_hash="hash123",
            role=UserRole.PATIENT,
            is_active=True,
        )
        db.add(patient_user)
        await db.flush()

        patient_profile = PatientProfile(
            user_id=patient_user.id,
            patient_id=f"PAT-DEPT-{ts}",
            name="Dept Test Patient",
            age=35,
            blood_group="A+",
        )
        db.add(patient_profile)
        await db.commit()

        patient_token = create_access_token({"sub": str(patient_user.id), "role": "PATIENT"})
        patient_headers = {"Authorization": f"Bearer {patient_token}"}

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Upload 3 files in different departments
        # File 1: Orthopedics - X-Ray
        f1_data = {
            "file_category": "x_ray",
            "department": "Orthopedics",
        }
        res1 = await client.post(
            f"/api/files/upload/{patient_profile.patient_id}",
            headers=patient_headers,
            data=f1_data,
            files={"file": ("knee_xray.png", io.BytesIO(b"\x89PNG\r\n\x1a\nfakeimage"), "image/png")},
        )
        assert res1.status_code == 201
        data1 = res1.json()
        assert data1["department"] == "Orthopedics"
        assert data1["file_category"] == "x_ray"

        # File 2: Cardiology - Lab Report
        f2_data = {
            "file_category": "lab_report",
            "department": "Cardiology",
        }
        res2 = await client.post(
            f"/api/files/upload/{patient_profile.patient_id}",
            headers=patient_headers,
            data=f2_data,
            files={"file": ("ecg_report.pdf", io.BytesIO(b"%PDF-1.4 ECG data"), "application/pdf")},
        )
        assert res2.status_code == 201
        data2 = res2.json()
        assert data2["department"] == "Cardiology"
        assert data2["file_category"] == "lab_report"

        # File 3: Orthopedics - Prescription (uploaded last -> should be newest)
        f3_data = {
            "file_category": "prescription",
            "department": "Orthopedics",
        }
        res3 = await client.post(
            f"/api/files/upload/{patient_profile.patient_id}",
            headers=patient_headers,
            data=f3_data,
            files={"file": ("ortho_rx.pdf", io.BytesIO(b"%PDF-1.4 Rx data"), "application/pdf")},
        )
        assert res3.status_code == 201
        data3 = res3.json()
        assert data3["department"] == "Orthopedics"
        assert data3["file_category"] == "prescription"

        # 2. Query all files — should return all 3 sorted newest first
        list_all = await client.get(
            f"/api/files/patient/{patient_profile.patient_id}",
            headers=patient_headers,
        )
        assert list_all.status_code == 200
        all_files = list_all.json()
        assert len(all_files) == 3
        # Newest first: ortho_rx (id 3) then ecg_report (id 2) then knee_xray (id 1)
        assert all_files[0]["filename"] == "ortho_rx.pdf"
        assert all_files[1]["filename"] == "ecg_report.pdf"
        assert all_files[2]["filename"] == "knee_xray.png"

        # 3. Filter by department = Orthopedics
        list_ortho = await client.get(
            f"/api/files/patient/{patient_profile.patient_id}?department=Orthopedics",
            headers=patient_headers,
        )
        assert list_ortho.status_code == 200
        ortho_files = list_ortho.json()
        assert len(ortho_files) == 2
        assert all(f["department"] == "Orthopedics" for f in ortho_files)
        assert ortho_files[0]["filename"] == "ortho_rx.pdf"
        assert ortho_files[1]["filename"] == "knee_xray.png"

        # 4. Filter by department = Cardiology
        list_cardio = await client.get(
            f"/api/files/patient/{patient_profile.patient_id}?department=Cardiology",
            headers=patient_headers,
        )
        assert list_cardio.status_code == 200
        cardio_files = list_cardio.json()
        assert len(cardio_files) == 1
        assert cardio_files[0]["filename"] == "ecg_report.pdf"

        # 5. Combined Two-Axis Filter: Orthopedics + x_ray
        list_ortho_xray = await client.get(
            f"/api/files/patient/{patient_profile.patient_id}?department=Orthopedics&file_category=x_ray",
            headers=patient_headers,
        )
        assert list_ortho_xray.status_code == 200
        ortho_xray_files = list_ortho_xray.json()
        assert len(ortho_xray_files) == 1
        assert ortho_xray_files[0]["filename"] == "knee_xray.png"
        assert ortho_xray_files[0]["file_category"] == "x_ray"
