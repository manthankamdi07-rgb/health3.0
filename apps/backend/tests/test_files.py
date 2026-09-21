"""
Tests for file and scan upload functionality (Task 8).
"""

import io
import pytest
from datetime import datetime, timezone, timedelta
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select

from app.main import app
from app.database import AsyncSessionLocal
from app.models.user import User, PatientProfile, UserRole
from app.models.doctor import DoctorProfile
from app.models.access_request import AccessRequest, AccessStatus
from app.models.file import MedicalFile
from app.services.storage import LocalStorageService
from app.utils.jwt import create_access_token
from fastapi import HTTPException


@pytest.mark.asyncio
async def test_storage_service_unit(tmp_path):
    """Test LocalStorageService validation, file persistence, traversal prevention, and deletion."""
    storage = LocalStorageService(upload_dir=str(tmp_path), max_size_bytes=1024 * 1024)

    # 1. Valid PDF file save
    pdf_bytes = b"%PDF-1.4 test document content"
    meta = await storage.save_file(
        file_bytes=pdf_bytes,
        original_filename="scan.pdf",
        content_type="application/pdf",
    )
    assert meta["file_id"] is not None
    assert meta["filename"] == "scan.pdf"
    assert meta["size_bytes"] == len(pdf_bytes)

    # Verify retrieval
    saved_path = storage.get_file_path(meta["storage_path"])
    assert saved_path.exists()
    assert saved_path.read_bytes() == pdf_bytes

    # 2. Reject oversized file
    large_bytes = b"x" * (1024 * 1024 + 10)
    with pytest.raises(HTTPException) as exc_info:
        await storage.save_file(
            file_bytes=large_bytes,
            original_filename="large.pdf",
            content_type="application/pdf",
        )
    assert exc_info.value.status_code == 413

    # 3. Reject invalid extension/content type
    with pytest.raises(HTTPException) as exc_info:
        await storage.save_file(
            file_bytes=b"echo hello",
            original_filename="script.sh",
            content_type="application/x-sh",
        )
    assert exc_info.value.status_code == 400

    # 4. Traversal attack prevention
    with pytest.raises(HTTPException) as exc_info:
        storage.get_file_path("../../../etc/passwd")
    assert exc_info.value.status_code in [400, 404]

    # 5. File deletion
    deleted = await storage.delete_file(meta["storage_path"])
    assert deleted is True
    assert not saved_path.exists()


@pytest.mark.asyncio
async def test_file_upload_and_download_endpoints():
    """Test API file upload, access control, download, and listing flows."""
    async with AsyncSessionLocal() as db:
        # Create unique timestamp suffix for tests
        ts = int(datetime.now(timezone.utc).timestamp() * 1000)
        
        # 1. Setup Patient 1
        p1_user = User(
            email=f"patient1_{ts}@example.com",
            phone=f"+1000000{ts % 10000}",
            password_hash="hash",
            role=UserRole.PATIENT,
            is_active=True,
        )
        db.add(p1_user)
        await db.flush()

        p1_profile = PatientProfile(
            user_id=p1_user.id,
            patient_id=f"PAT-{ts}",
            name="Patient One",
            age=30,
            blood_group="O+",
            allergies="None",
        )
        db.add(p1_profile)

        # 2. Setup Patient 2
        p2_user = User(
            email=f"patient2_{ts}@example.com",
            phone=f"+2000000{ts % 10000}",
            password_hash="hash",
            role=UserRole.PATIENT,
            is_active=True,
        )
        db.add(p2_user)
        await db.flush()

        p2_profile = PatientProfile(
            user_id=p2_user.id,
            patient_id=f"PAT2-{ts}",
            name="Patient Two",
            age=25,
            blood_group="A+",
            allergies=None,
        )
        db.add(p2_profile)

        # 3. Setup Doctor 1 (with approved access to Patient 1)
        doc1_user = User(
            email=f"doc1_{ts}@example.com",
            password_hash="hash",
            role=UserRole.DOCTOR,
            is_active=True,
        )
        db.add(doc1_user)
        await db.flush()

        doc1_profile = DoctorProfile(
            user_id=doc1_user.id,
            name="Dr. One",
            specialty="Radiology",
            license_number=f"DOC1-{ts}",
            is_approved=True,
        )
        db.add(doc1_profile)

        access_req = AccessRequest(
            doctor_id=doc1_user.id,
            patient_id=p1_user.id,
            patient_unique_id=p1_profile.patient_id,
            status=AccessStatus.APPROVED,
            expires_at=datetime.now(timezone.utc) + timedelta(days=30),
        )
        db.add(access_req)

        # 4. Setup Doctor 2 (without approved access)
        doc2_user = User(
            email=f"doc2_{ts}@example.com",
            password_hash="hash",
            role=UserRole.DOCTOR,
            is_active=True,
        )
        db.add(doc2_user)
        await db.flush()

        doc2_profile = DoctorProfile(
            user_id=doc2_user.id,
            name="Dr. Two",
            specialty="Cardiology",
            license_number=f"DOC2-{ts}",
            is_approved=True,
        )
        db.add(doc2_profile)

        await db.commit()

        p1_id = p1_user.id
        p1_unique_id = p1_profile.patient_id
        p2_id = p2_user.id
        doc1_id = doc1_user.id
        doc2_id = doc2_user.id

    token_p1 = create_access_token({"sub": str(p1_id), "role": UserRole.PATIENT.value})
    token_p2 = create_access_token({"sub": str(p2_id), "role": UserRole.PATIENT.value})
    token_doc1 = create_access_token({"sub": str(doc1_id), "role": UserRole.DOCTOR.value})
    token_doc2 = create_access_token({"sub": str(doc2_id), "role": UserRole.DOCTOR.value})

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # A. Patient 1 uploads their own X-ray
        file_payload = {"file": ("chest_xray.png", io.BytesIO(b"\x89PNG\r\n\x1a\nfakeimagecontent"), "image/png")}
        data_payload = {"file_category": "x_ray"}
        res = await client.post(
            f"/api/files/upload/{p1_unique_id}",
            headers={"Authorization": f"Bearer {token_p1}"},
            files=file_payload,
            data=data_payload,
        )
        assert res.status_code == 201
        upload_data = res.json()
        assert upload_data["filename"] == "chest_xray.png"
        assert upload_data["file_category"] == "x_ray"
        assert upload_data["content_type"] == "image/png"
        file_id_1 = upload_data["file_id"]

        # B. Patient 2 attempts to upload to Patient 1's profile -> 403
        file_payload_unauth = {"file": ("blood_test.pdf", io.BytesIO(b"%PDF-1.4 sample"), "application/pdf")}
        res_unauth = await client.post(
            f"/api/files/upload/{p1_unique_id}",
            headers={"Authorization": f"Bearer {token_p2}"},
            files=file_payload_unauth,
        )
        assert res_unauth.status_code == 403

        # C. Doctor 2 (no access) attempts to upload to Patient 1 -> 403
        res_doc2_upload = await client.post(
            f"/api/files/upload/{p1_unique_id}",
            headers={"Authorization": f"Bearer {token_doc2}"},
            files=file_payload_unauth,
        )
        assert res_doc2_upload.status_code == 403

        # D. Doctor 1 (approved access) uploads a lab report for Patient 1 -> 201
        file_doc1_payload = {"file": ("lab_report.pdf", io.BytesIO(b"%PDF-1.4 valid lab test"), "application/pdf")}
        res_doc1_upload = await client.post(
            f"/api/files/upload/{p1_unique_id}",
            headers={"Authorization": f"Bearer {token_doc1}"},
            files=file_doc1_payload,
            data={"file_category": "lab_report"},
        )
        assert res_doc1_upload.status_code == 201
        file_id_2 = res_doc1_upload.json()["file_id"]

        # E. Download file_1
        # Patient 1 downloads -> 200 OK
        res_dl_p1 = await client.get(
            f"/api/files/{file_id_1}",
            headers={"Authorization": f"Bearer {token_p1}"},
        )
        assert res_dl_p1.status_code == 200
        assert res_dl_p1.headers["content-type"] == "image/png"

        # Doctor 1 downloads -> 200 OK
        res_dl_doc1 = await client.get(
            f"/api/files/{file_id_1}",
            headers={"Authorization": f"Bearer {token_doc1}"},
        )
        assert res_dl_doc1.status_code == 200

        # Patient 2 downloads Patient 1's file -> 403
        res_dl_p2 = await client.get(
            f"/api/files/{file_id_1}",
            headers={"Authorization": f"Bearer {token_p2}"},
        )
        assert res_dl_p2.status_code == 403

        # Doctor 2 (no access) downloads -> 403
        res_dl_doc2 = await client.get(
            f"/api/files/{file_id_1}",
            headers={"Authorization": f"Bearer {token_doc2}"},
        )
        assert res_dl_doc2.status_code == 403

        # F. List files for Patient 1
        # Patient 1 lists their files -> 2 files
        res_list_p1 = await client.get(
            f"/api/files/patient/{p1_unique_id}",
            headers={"Authorization": f"Bearer {token_p1}"},
        )
        assert res_list_p1.status_code == 200
        list_data = res_list_p1.json()
        assert len(list_data) == 2

        # Filter by file_category=lab_report -> 1 file
        res_filter = await client.get(
            f"/api/files/patient/{p1_unique_id}?file_category=lab_report",
            headers={"Authorization": f"Bearer {token_p1}"},
        )
        assert res_filter.status_code == 200
        assert len(res_filter.json()) == 1
        assert res_filter.json()[0]["file_id"] == file_id_2

        # Doctor 2 tries to list Patient 1's files -> 403
        res_list_unauth = await client.get(
            f"/api/files/patient/{p1_unique_id}",
            headers={"Authorization": f"Bearer {token_doc2}"},
        )
        assert res_list_unauth.status_code == 403

        # G. Verify integration with RecordCreate FileAttachment (Task 7)
        from app.schemas.record import FileAttachment, RecordCreate
        attachment = FileAttachment(
            file_id=upload_data["file_id"],
            filename=upload_data["filename"],
            content_type=upload_data["content_type"],
            size_bytes=upload_data["size_bytes"],
        )
        record = RecordCreate(
            title="Chest Examination Report",
            type="Radiology",
            description="Clear lungs, normal heart shadow.",
            attachments=[attachment],
        )
        assert record.attachments is not None
        assert len(record.attachments) == 1
        assert record.attachments[0].file_id == file_id_1

        # H. File Deletion (Task A1)
        # 1. Doctor 1 tries to delete Patient 1's file -> 403 Forbidden
        res_del_doc = await client.delete(
            f"/api/files/{file_id_1}",
            headers={"Authorization": f"Bearer {token_doc1}"},
        )
        assert res_del_doc.status_code == 403

        # 2. Patient 2 tries to delete Patient 1's file -> 403 Forbidden
        res_del_p2 = await client.delete(
            f"/api/files/{file_id_1}",
            headers={"Authorization": f"Bearer {token_p2}"},
        )
        assert res_del_p2.status_code == 403

        # 3. Patient 1 tries to delete non-existent file -> 404 Not Found
        res_del_404 = await client.delete(
            "/api/files/non-existent-file-id",
            headers={"Authorization": f"Bearer {token_p1}"},
        )
        assert res_del_404.status_code == 404

        # 4. Patient 1 successfully deletes file_id_1 -> 200 OK
        res_del_ok = await client.delete(
            f"/api/files/{file_id_1}",
            headers={"Authorization": f"Bearer {token_p1}"},
        )
        assert res_del_ok.status_code == 200
        assert res_del_ok.json()["file_id"] == file_id_1

        # 5. Verify file is gone from download and list
        res_dl_deleted = await client.get(
            f"/api/files/{file_id_1}",
            headers={"Authorization": f"Bearer {token_p1}"},
        )
        assert res_dl_deleted.status_code == 404

        res_list_after_del = await client.get(
            f"/api/files/patient/{p1_unique_id}",
            headers={"Authorization": f"Bearer {token_p1}"},
        )
        assert res_list_after_del.status_code == 200
        assert len(res_list_after_del.json()) == 1

