"""
Tests for AYUSH History Mode AI Summary and Pre-Consultation Workflow (Health 4.0 Part B).
"""

import json
import pytest
from datetime import datetime, timezone, timedelta
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.database import AsyncSessionLocal
from app.models.user import User, PatientProfile, UserRole
from app.models.doctor import DoctorProfile
from app.schemas.appointment import PreConsultationQuestionnaire
from app.services.ai_summary import (
    FallbackClinicalSummaryProvider,
    is_ayush_department,
)
from app.utils.jwt import create_access_token


def test_is_ayush_department():
    """Verify department detection logic for AYUSH/Ayurveda."""
    assert is_ayush_department("AYUSH") is True
    assert is_ayush_department("ayush") is True
    assert is_ayush_department("Ayurveda") is True
    assert is_ayush_department("Holistic Medicine") is True
    assert is_ayush_department("Cardiology") is False
    assert is_ayush_department("General") is False
    # If ayush_assessment dict is present, should be treated as AYUSH regardless of dept string
    assert is_ayush_department("General", {"prakriti": {"body_frame": "Slender"}}) is True


@pytest.mark.asyncio
async def test_fallback_ayush_summary_generation():
    """Verify FallbackClinicalSummaryProvider produces a structured AYUSH briefing."""
    provider = FallbackClinicalSummaryProvider()
    q = PreConsultationQuestionnaire(
        main_problem="Chronic acidity and irregular digestion",
        department="AYUSH",
        duration="3 months",
        current_medication="Avipattikar Churna 5g",
        ayush_assessment={
            "prakriti": {
                "body_frame": "Medium / athletic build",
                "skin_hair": "Warm, sensitive, early graying",
                "weather_sensitivity": "Sensitive to hot climate",
                "temperament": "Sharp, focused, easily irritated when hungry",
            },
            "vikriti": {
                "energy_mood": "Midday burnout, burning sensation after spicy meals",
            },
            "agni": {
                "appetite": "Tikshna Agni (Sharp, intense hunger)",
                "post_meal": "Acid reflux and burning sensation",
                "thirst": "High thirst for cold water",
            },
            "bowel_habits": {
                "frequency": "2-3 times daily",
                "consistency": "Mridu Koshta (Soft, loose)",
                "discomfort": "Occasional burning elimination",
            },
            "ahara_vihara": {
                "diet_cravings": "Spicy, sour, fried snacks",
                "meal_routine": "Irregular meal hours due to work",
                "sleep_cycle": "6 hours, wakes up feeling warm",
                "activity_stress": "High stress, moderate walking",
            },
        },
    )
    patient_info = {
        "age": 36,
        "blood_group": "B+",
        "allergies": "Sulfa drugs",
    }
    past_records = []
    past_files = [
        {
            "filename": "endoscopy_note.txt",
            "category": "lab_report",
            "extracted_text": "Mild gastritis noted at antrum. No ulceration.",
        }
    ]

    summary = await provider.generate_summary(q, patient_info, past_records, past_files)

    assert "Chief Complaint & Vikriti" in summary
    assert "Prakriti Profile" in summary
    assert "Agni & Koshta" in summary
    assert "Ahara-Vihara" in summary
    assert "Vaidya Triage Notes" in summary
    assert "endoscopy_note.txt indicates: Mild gastritis" in summary
    assert "Tikshna Agni" in summary


@pytest.mark.asyncio
async def test_api_ayush_summary_and_booking():
    """Verify end-to-end API generation and booking of an AYUSH appointment."""
    async with AsyncSessionLocal() as db:
        ts = int(datetime.now(timezone.utc).timestamp() * 1000)

        # 1. Setup Patient
        patient_user = User(
            email=f"pat_ayush_{ts}@example.com",
            phone=f"+9198{ts % 100000000:08d}",
            password_hash="hash",
            role=UserRole.PATIENT,
            is_active=True,
        )
        db.add(patient_user)
        await db.flush()

        pat_id = f"PAT-AYU-{ts % 10000:04d}"
        patient_profile = PatientProfile(
            user_id=patient_user.id,
            patient_id=pat_id,
            name="Rahul Sharma",
            age=40,
            blood_group="A+",
            allergies="None reported",
        )
        db.add(patient_profile)

        # 2. Setup AYUSH Doctor
        doc_user = User(
            email=f"doc_vaidya_{ts}@example.com",
            phone=f"+9197{ts % 100000000:08d}",
            password_hash="hash",
            role=UserRole.DOCTOR,
            is_active=True,
        )
        db.add(doc_user)
        await db.flush()

        doctor_profile = DoctorProfile(
            user_id=doc_user.id,
            name="Dr. Ananya Joshi (BAMS)",
            specialty="AYUSH",
            license_number=f"AYU-REG-{ts % 10000}",
            is_approved=True,
        )
        db.add(doctor_profile)
        await db.commit()

        pat_token = create_access_token(
            {"sub": str(patient_user.id), "email": patient_user.email, "role": UserRole.PATIENT.value}
        )

    ayush_payload = {
        "main_problem": "Joint stiffness, sluggish morning energy, constipation",
        "department": "AYUSH",
        "duration": "2 months",
        "current_medication": "None",
        "ayush_assessment": {
            "prakriti": {
                "body_frame": "Large / heavy frame",
                "skin_hair": "Thick, oily, lustrous",
                "weather_sensitivity": "Dislikes cold, damp weather",
                "temperament": "Calm, slow, steady",
            },
            "vikriti": {
                "energy_mood": "Sluggishness and heaviness in joints on waking",
            },
            "agni": {
                "appetite": "Manda Agni (Low/sluggish appetite)",
                "post_meal": "Prolonged heaviness, drowsiness",
                "thirst": "Low thirst",
            },
            "bowel_habits": {
                "frequency": "Once every 2 days",
                "consistency": "Krura Koshta (Hard, sluggish evacuation)",
                "discomfort": "Incomplete evacuation sensation",
            },
            "ahara_vihara": {
                "diet_cravings": "Sweet, dairy, fried heavy meals",
                "meal_routine": "Late dinner after 9:30 PM",
                "sleep_cycle": "9 hours, hard to awaken",
                "activity_stress": "Sedentary desk job",
            },
        },
    }

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Step A: Generate AYUSH AI Briefing
        res = await ac.post(
            "/api/appointments/ai-summary/generate",
            json={
                "doctor_id": doc_user.id,
                "questionnaire": ayush_payload,
            },
            headers={"Authorization": f"Bearer {pat_token}"},
        )
        assert res.status_code == 200, res.text
        data = res.json()
        assert "summary" in data
        assert "Prakriti Profile" in data["summary"]
        assert "Agni & Koshta" in data["summary"]
        assert "Vaidya Triage Notes" in data["summary"]
        generated_summary = data["summary"]

        # Step B: Book Appointment with confirmed summary and questionnaire
        future_date = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
        book_res = await ac.post(
            "/api/appointments/book",
            json={
                "doctor_id": doc_user.id,
                "appointment_date": future_date,
                "duration_minutes": 45,
                "department": "AYUSH",
                "reason": ayush_payload["main_problem"],
                "questionnaire": json.dumps(ayush_payload),
                "ai_summary": generated_summary,
                "ai_summary_confirmed": True,
            },
            headers={"Authorization": f"Bearer {pat_token}"},
        )
        assert book_res.status_code == 201, book_res.text
        book_data = book_res.json()
        assert book_data["department"] == "AYUSH"
        assert book_data["ai_summary_confirmed"] is True
        assert "Prakriti Profile" in book_data["ai_summary"]

        # Step C: Verify Doctor can retrieve the appointment via calendar and view AYUSH assessment
        doc_token = create_access_token(
            {"sub": str(doc_user.id), "email": doc_user.email, "role": UserRole.DOCTOR.value}
        )
        doc_res = await ac.get(
            "/api/appointments/doctor/calendar",
            headers={"Authorization": f"Bearer {doc_token}"},
        )
        assert doc_res.status_code == 200
        appts = doc_res.json()
        matching = [a for a in appts if a["id"] == book_data["id"]]
        assert len(matching) == 1
        retrieved = matching[0]
        assert retrieved["department"] == "AYUSH"
        saved_q = json.loads(retrieved["questionnaire"])
        assert "ayush_assessment" in saved_q
        assert saved_q["ayush_assessment"]["agni"]["appetite"] == "Manda Agni (Low/sluggish appetite)"
