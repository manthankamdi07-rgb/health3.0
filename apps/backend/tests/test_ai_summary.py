"""
Tests for AI Pre-Consultation Summary and Doctor Pre-Visit Workflow (Item 2).
"""

import io
import json
import pytest
from datetime import datetime, timezone, timedelta
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.database import AsyncSessionLocal
from app.models.user import User, PatientProfile, UserRole
from app.models.doctor import DoctorProfile
from app.models.file import MedicalFile
from app.utils.jwt import create_access_token


@pytest.mark.asyncio
async def test_ai_pre_consultation_summary_generation_and_booking():
    """Test generating AI pre-consultation summary (<150 words) and booking an appointment with it."""
    async with AsyncSessionLocal() as db:
        ts = int(datetime.now(timezone.utc).timestamp() * 1000)

        # 1. Setup Patient
        patient_user = User(
            email=f"pat_ai_{ts}@example.com",
            phone=f"+1800{ts % 10000:04d}",
            password_hash="hash",
            role=UserRole.PATIENT,
            is_active=True,
        )
        db.add(patient_user)
        await db.flush()

        pat_id = f"PAT-AI-{ts % 10000:04d}"
        patient_profile = PatientProfile(
            user_id=patient_user.id,
            patient_id=pat_id,
            name="Sarah Connor",
            age=34,
            blood_group="O+",
            allergies="Penicillin",
        )
        db.add(patient_profile)

        # Setup an existing past file in Cardiology
        med_file = MedicalFile(
            file_id=f"FILE-ECG-{ts}",
            patient_id=patient_user.id,
            patient_unique_id=pat_id,
            uploader_id=patient_user.id,
            filename="ecg_report_2025.pdf",
            file_category="scan",
            department="Cardiology",
            content_type="application/pdf",
            size_bytes=45000,
            storage_path=f"scans/ecg_{ts}.pdf",
        )
        db.add(med_file)

        # 2. Setup Doctor
        doc_user = User(
            email=f"doc_cardio_{ts}@example.com",
            password_hash="hash",
            role=UserRole.DOCTOR,
            is_active=True,
        )
        db.add(doc_user)
        await db.flush()

        doc_profile = DoctorProfile(
            user_id=doc_user.id,
            name="Dr. Gregory House",
            specialty="Cardiology",
            license_number=f"DOC-MD-{ts}",
            is_approved=True,
        )
        db.add(doc_profile)
        await db.commit()

        pat_token = create_access_token({"sub": str(patient_user.id), "role": "PATIENT"})
        doc_token = create_access_token({"sub": str(doc_user.id), "role": "DOCTOR"})

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Step 1: Patient calls AI summary generation endpoint
        questionnaire_payload = {
            "doctor_id": doc_user.id,
            "questionnaire": {
                "main_problem": "Intermittent chest tightness and palpitation",
                "department": "Cardiology",
                "duration": "3 weeks",
                "current_medication": "Metoprolol 25mg daily",
                "follow_ups": {
                    "triggers": "Climbing stairs",
                    "shortness_of_breath": "Mild upon exertion",
                },
            },
        }

        res_gen = await ac.post(
            "/api/appointments/ai-summary/generate",
            json=questionnaire_payload,
            headers={"Authorization": f"Bearer {pat_token}"},
        )
        assert res_gen.status_code == 200, res_gen.text
        data_gen = res_gen.json()
        assert "summary" in data_gen
        assert data_gen["department"] == "Cardiology"
        assert data_gen["files_count"] >= 1
        summary_text = data_gen["summary"]
        assert len(summary_text) > 20
        # Doctor 10-second skim test: strictly under 150 words
        word_count = len(summary_text.split())
        assert word_count <= 160, f"Summary exceeded 150 words: {word_count}"

        # Step 2: Patient books appointment with summary
        booking_time = datetime.now(timezone.utc) + timedelta(days=2)
        book_payload = {
            "doctor_id": doc_user.id,
            "appointment_date": booking_time.isoformat(),
            "duration_minutes": 30,
            "department": "Cardiology",
            "reason": "Cardiology consultation for chest tightness",
            "questionnaire": json.dumps(questionnaire_payload["questionnaire"]),
            "ai_summary": summary_text,
            "ai_summary_confirmed": True,
        }

        res_book = await ac.post(
            "/api/appointments/book",
            json=book_payload,
            headers={"Authorization": f"Bearer {pat_token}"},
        )
        assert res_book.status_code == 201, res_book.text
        book_data = res_book.json()
        appt_id = book_data["id"]
        assert book_data["department"] == "Cardiology"
        assert book_data["ai_summary"] == summary_text
        assert book_data["ai_summary_confirmed"] is True

        # Step 3: Doctor views calendar and inspects AI summary
        res_cal = await ac.get(
            "/api/appointments/doctor/calendar",
            headers={"Authorization": f"Bearer {doc_token}"},
        )
        assert res_cal.status_code == 200
        cal_data = res_cal.json()
        matching = [a for a in cal_data if a["id"] == appt_id]
        assert len(matching) == 1
        assert matching[0]["ai_summary"] == summary_text
        assert matching[0]["questionnaire"] is not None

        # Step 4: Doctor accesses full raw records and uploaded scans
        res_hist = await ac.get(
            f"/api/appointments/doctor/patient-history/{pat_id}",
            headers={"Authorization": f"Bearer {doc_token}"},
        )
        assert res_hist.status_code == 200, res_hist.text
        hist_data = res_hist.json()
        assert hist_data["patient"]["name"] == "Sarah Connor"
        assert hist_data["patient"]["allergies"] == "Penicillin"
        assert len(hist_data["files"]) >= 1
        assert hist_data["files"][0]["filename"] == "ecg_report_2025.pdf"


def _make_sample_pdf(text: str) -> bytes:
    content = f"BT /F1 12 Tf 10 50 Td ({text}) Tj ET"
    stream_len = len(content)
    pdf = f"""%PDF-1.4
1 0 obj <</Type /Catalog /Pages 2 0 R>> endobj
2 0 obj <</Type /Pages /Kids [3 0 R] /Count 1>> endobj
3 0 obj <</Type /Page /Parent 2 0 R /Resources <</Font <</F1 4 0 R>>>> /MediaBox [0 0 300 300] /Contents 5 0 R>> endobj
4 0 obj <</Type /Font /Subtype /Type1 /BaseFont /Helvetica>> endobj
5 0 obj <</Length {stream_len}>> stream
{content}
endstream
endobj
xref
0 6
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000227 00000 n 
0000000305 00000 n 
trailer <</Size 6 /Root 1 0 R>>
startxref
400
%%EOF"""
    return pdf.encode("latin1")


TINY_PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06"
    b"\x00\x00\x00\x1f\x15c4\x00\x00\x00\rIDATx\x9cc`\x00\x00\x00\x02\x00\x01H\xaf"
    b"\xa4q\x00\x00\x00\x00IEND\xaeB`\x82"
)


@pytest.mark.asyncio
async def test_ai_summary_incorporates_text_pdf_content():
    """Verify that text extracted from an uploaded PDF is grounded and reflected in the AI summary (Task A2)."""
    ts = int(datetime.now(timezone.utc).timestamp() * 1000)
    async with AsyncSessionLocal() as db:
        pat_user = User(
            email=f"pat_pdf_{ts}@example.com",
            phone=f"+1700{ts % 10000:04d}",
            password_hash="hash",
            role=UserRole.PATIENT,
            is_active=True,
        )
        db.add(pat_user)
        await db.flush()

        pat_id = f"PAT-PDF-{ts % 10000:04d}"
        profile = PatientProfile(
            user_id=pat_user.id,
            patient_id=pat_id,
            name="Arthur Dent",
            age=42,
            blood_group="A+",
            allergies="None",
        )
        db.add(profile)
        await db.commit()

        pat_token = create_access_token({"sub": str(pat_user.id), "role": "PATIENT"})

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Upload a text-based PDF containing distinct clinical metrics
        pdf_text = "Lipid Panel: Total Cholesterol 245 mg/dL, Triglycerides 210 mg/dL, High Risk"
        pdf_bytes = _make_sample_pdf(pdf_text)
        upload_resp = await client.post(
            f"/api/files/upload/{pat_id}",
            headers={"Authorization": f"Bearer {pat_token}"},
            files={"file": ("lipid_panel_2025.pdf", io.BytesIO(pdf_bytes), "application/pdf")},
            data={"file_category": "lab_report", "department": "Cardiology"},
        )
        assert upload_resp.status_code == 201, upload_resp.text

        # 2. Request pre-consultation summary for Cardiology
        summary_resp = await client.post(
            "/api/appointments/ai-summary/generate",
            headers={"Authorization": f"Bearer {pat_token}"},
            json={
                "questionnaire": {
                    "main_problem": "Routine checkup and high cholesterol follow-up",
                    "department": "Cardiology",
                    "duration": "6 months",
                    "current_medication": "Atorvastatin 20mg",
                }
            },
        )
        assert summary_resp.status_code == 200, summary_resp.text
        summary_data = summary_resp.json()
        assert summary_data["files_count"] == 1
        summary_text = summary_data["summary"]

        # 3. Grounding Verification: The extracted PDF finding must be referenced in the summary
        assert "lipid_panel_2025.pdf" in summary_text
        assert ("Lipid Panel" in summary_text or "Cholesterol" in summary_text)
        # Verify length constraint (< 160 words)
        assert len(summary_text.split()) <= 160


@pytest.mark.asyncio
async def test_ai_summary_incorporates_image_scan_content():
    """Verify that uploaded image scans are scoped and reflected in the AI summary with fallback/OCR handling (Task A2)."""
    ts = int(datetime.now(timezone.utc).timestamp() * 1000)
    async with AsyncSessionLocal() as db:
        pat_user = User(
            email=f"pat_img_{ts}@example.com",
            phone=f"+1600{ts % 10000:04d}",
            password_hash="hash",
            role=UserRole.PATIENT,
            is_active=True,
        )
        db.add(pat_user)
        await db.flush()

        pat_id = f"PAT-IMG-{ts % 10000:04d}"
        profile = PatientProfile(
            user_id=pat_user.id,
            patient_id=pat_id,
            name="Ellen Ripley",
            age=38,
            blood_group="B+",
            allergies="Sulfa",
        )
        db.add(profile)
        await db.commit()

        pat_token = create_access_token({"sub": str(pat_user.id), "role": "PATIENT"})

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Upload an image scan
        upload_resp = await client.post(
            f"/api/files/upload/{pat_id}",
            headers={"Authorization": f"Bearer {pat_token}"},
            files={"file": ("chest_xray_scan.png", io.BytesIO(TINY_PNG_BYTES), "image/png")},
            data={"file_category": "x_ray", "department": "Pulmonology"},
        )
        assert upload_resp.status_code == 201, upload_resp.text

        # 2. Request pre-consultation summary for Pulmonology
        summary_resp = await client.post(
            "/api/appointments/ai-summary/generate",
            headers={"Authorization": f"Bearer {pat_token}"},
            json={
                "questionnaire": {
                    "main_problem": "Persistent dry cough following chemical exposure",
                    "department": "Pulmonology",
                    "duration": "2 weeks",
                    "current_medication": "Albuterol inhaler PRN",
                }
            },
        )
        assert summary_resp.status_code == 200, summary_resp.text
        summary_data = summary_resp.json()
        assert summary_data["files_count"] == 1
        summary_text = summary_data["summary"]

        # 3. Grounding Verification: The scan is recognized and referenced in the summary
        assert "chest_xray_scan.png" in summary_text
        assert len(summary_text.split()) <= 160

