"""
Unit and integration tests for ABDM (Ayushman Bharat Digital Mission) module — Health 4.0 Part A.
Tests:
- ABHA OTP initiation & verification
- Account linking and unlinking
- Direct ABHA login
- Explicit consent storage and retrieval
- NRCeS FHIR R4 OPConsultRecord Bundle conformance
- Async background filing and patient notification
"""

import pytest
import json
import uuid
from datetime import datetime, timezone, timedelta
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select

from app.main import app
from app.database import AsyncSessionLocal, init_db
from app.models.user import User, PatientProfile, UserRole
from app.models.appointment import Appointment, AppointmentStatus
from app.models.notification import Notification
from app.services.auth import hash_password
from app.services.abdm import (
    initiate_abha_auth,
    verify_abha_otp,
    link_abha_to_patient,
    unlink_abha_from_patient,
    login_with_abha,
    record_patient_consent,
    get_patient_consent_status,
    build_nrces_op_consult_record,
    push_record_to_abdm_background,
)


@pytest.fixture(autouse=True)
async def setup_abdm_db():
    """Ensure all tables and columns are initialized for ABDM tests."""
    await init_db()



@pytest.mark.asyncio
async def test_abha_otp_challenge_and_verification():
    """Test OTP initiation and verification flows under sandbox simulation."""
    # 1. Initiate challenge
    init_res = await initiate_abha_auth("AADHAAR_OTP", "999912345678")
    assert "txn_id" in init_res
    assert init_res["auth_mode"] == "AADHAAR_OTP"
    assert "mock_mode" in init_res
    txn_id = init_res["txn_id"]

    # 2. Invalid OTP should raise ValueError
    with pytest.raises(ValueError):
        await verify_abha_otp(txn_id, "000000")

    # 3. Valid sandbox OTP '123456'
    verify_res = await verify_abha_otp(txn_id, "123456")
    assert verify_res["verified"] is True
    assert verify_res["abha_number"].startswith("14-")
    assert "@abdm" in verify_res["abha_address"]
    assert verify_res["name"] == "Ramesh Kumar (Sandbox)"


@pytest.mark.asyncio
async def test_link_and_unlink_abha():
    """Test linking ABHA ID to an existing patient profile and unlinking it."""
    async with AsyncSessionLocal() as db:
        uid = uuid.uuid4().hex[:8]
        # Create test patient
        user = User(
            email=f"abha_user_{uid}@example.com",
            password_hash=hash_password("Pass123!"),
            role=UserRole.PATIENT,
            is_active=True,
        )
        db.add(user)
        await db.flush()

        profile = PatientProfile(
            user_id=user.id,
            patient_id=f"P_{uid[:6].upper()}",
            name="Abha Test Patient",
            abha_status="UNLINKED",
        )
        db.add(profile)
        await db.commit()

        # Link ABHA
        verified_data = {
            "abha_number": f"14-5555-6666-{uid[:4]}",
            "abha_address": f"test_{uid}@abdm",
            "name": "Abha Test Patient",
        }
        updated_prof = await link_abha_to_patient(user.id, verified_data, db)
        assert updated_prof.abha_status == "LINKED"
        assert updated_prof.abha_number == f"14-5555-6666-{uid[:4]}"
        assert updated_prof.abha_address == f"test_{uid}@abdm"

        # Record consent
        await record_patient_consent(
            patient_id=user.id,
            patient_unique_id=profile.patient_id,
            appointment_id=None,
            abha_address=f"test_{uid}@abdm",
            scopes=["VISIT_SUMMARY", "AI_NOTES"],
            db=db,
        )
        active_consent = await get_patient_consent_status(user.id, None, db)
        assert active_consent is not None
        assert active_consent.is_granted is True

        # Unlink ABHA
        unlinked_prof = await unlink_abha_from_patient(user.id, db)
        assert unlinked_prof.abha_status == "UNLINKED"
        assert unlinked_prof.abha_number is None

        # Consent should be revoked upon unlinking
        revoked_consent = await get_patient_consent_status(user.id, None, db)
        assert revoked_consent is None


@pytest.mark.asyncio
async def test_direct_abha_login():
    """Test direct passwordless patient sign-in via ABHA OTP challenge."""
    init_res = await initiate_abha_auth("MOBILE_OTP", "9876543210")
    txn_id = init_res["txn_id"]

    async with AsyncSessionLocal() as db:
        user, profile, token = await login_with_abha(txn_id, "123456", db)
        assert user.role == UserRole.PATIENT
        assert profile.abha_status == "LINKED"
        assert profile.abha_number is not None
        assert profile.abha_number.startswith("14-")
        assert token is not None


@pytest.mark.asyncio
async def test_nrces_fhir_r4_op_consult_record():
    """Test that generated FHIR R4 Bundle strictly adheres to NRCeS OPConsultRecord specification."""
    now = datetime.now(timezone.utc)
    mock_appt = Appointment(
        id=999,
        patient_id=1,
        doctor_id=2,
        appointment_date=now + timedelta(days=1),
        duration_minutes=30,
        department="AYUSH",
        reason="Digestive sluggishness",
        questionnaire=json.dumps({
            "main_problem": "Digestive sluggishness and bloating after meals",
            "duration": "2 weeks",
            "current_medication": "None",
            "ayush_assessment": {
                "prakriti_body_frame": "Ectomorphic (Vata)",
                "vikriti_primary_imbalance": "Vata-Kapha aggravation",
                "agni_type": "Manda Agni (sluggish digestion)",
                "bowel_habits": "Krura Koshtha (dry, irregular)",
                "diet_preferences": "Warm liquids, light khichdi",
            },
        }),
        ai_summary="Patient presents with Manda Agni and Vata-Kapha imbalance.",
    )

    mock_profile = PatientProfile(
        id=1,
        user_id=1,
        patient_id="PTEST01",
        name="Ananya Sharma",
        abha_number="14-1111-2222-3333",
        abha_address="ananya@abdm",
        abha_status="LINKED",
    )

    assert mock_appt.questionnaire is not None
    q_data = json.loads(mock_appt.questionnaire)
    bundle = build_nrces_op_consult_record(
        appointment=mock_appt,
        patient_profile=mock_profile,
        doctor_name="Dr. Vasant Patil",
        ai_summary=mock_appt.ai_summary,
        ayush_assessment=q_data.get("ayush_assessment"),
    )

    # Validate Bundle Structure
    assert bundle["resourceType"] == "Bundle"
    assert bundle["type"] == "document"
    assert "https://nrces.in/ndhm/fhir/r4/StructureDefinition/OPConsultRecord" in bundle["meta"]["profile"]

    entries = bundle["entry"]
    assert len(entries) >= 5  # Composition, Patient, Practitioner, Encounter, Condition, Observations

    # 1. Composition
    comp = entries[0]["resource"]
    assert comp["resourceType"] == "Composition"
    assert comp["status"] == "final"
    assert comp["type"]["coding"][0]["code"] == "371530004"

    # 2. Patient with ABHA Identifier
    patient_res = entries[1]["resource"]
    assert patient_res["resourceType"] == "Patient"
    identifiers = patient_res["identifier"]
    assert any(i.get("value") == "14-1111-2222-3333" for i in identifiers)

    # 3. Observation for AYUSH
    ayush_obs = next(
        (e["resource"] for e in entries if e["resource"].get("code", {}).get("text") == "AYUSH 5-Dimension Traditional Health Assessment"),
        None,
    )
    assert ayush_obs is not None
    assert len(ayush_obs["component"]) == 5


@pytest.mark.asyncio
async def test_async_abdm_background_push_and_notification():
    """Test background filing task pushes to ABDM and dispatches patient confirmation notification."""
    async with AsyncSessionLocal() as db:
        uid = uuid.uuid4().hex[:8]
        # Create user + profile
        user = User(
            email=f"push_patient_{uid}@example.com",
            password_hash=hash_password("Pass123!"),
            role=UserRole.PATIENT,
            is_active=True,
        )
        db.add(user)
        await db.flush()

        profile = PatientProfile(
            user_id=user.id,
            patient_id=f"P_{uid[:6].upper()}",
            name="Push Test Patient",
            abha_number=f"14-9999-8888-{uid[:4]}",
            abha_address=f"push_{uid}@abdm",
            abha_status="LINKED",
        )
        db.add(profile)

        # Create appointment
        now = datetime.now(timezone.utc)
        appt = Appointment(
            patient_id=user.id,
            patient_unique_id=profile.patient_id,
            doctor_id=1,
            appointment_date=now + timedelta(days=2),
            duration_minutes=30,
            department="General",
            status=AppointmentStatus.CONFIRMED,
            ai_summary="Patient reports mild cough and seasonal fatigue.",
        )
        db.add(appt)
        await db.commit()
        await db.refresh(appt)

        # 1. Without consent, background push should be skipped
        skip_res = await push_record_to_abdm_background(appt.id)
        assert skip_res["status"] == "skipped"
        assert skip_res["reason"] == "Consent not granted"

        # 2. Record explicit consent
        await record_patient_consent(
            patient_id=user.id,
            patient_unique_id=profile.patient_id,
            appointment_id=appt.id,
            abha_address=profile.abha_address,
            scopes=["VISIT_SUMMARY", "AI_NOTES"],
            db=db,
        )

        # 3. Run background push
        push_res = await push_record_to_abdm_background(appt.id)
        assert push_res["status"] == "filed"
        assert push_res["abha_number"] == f"14-9999-8888-{uid[:4]}"

        # 4. Check that confirmation notification was created for patient
        notif_res = await db.execute(
            select(Notification).where(
                Notification.user_id == user.id,
                Notification.notification_type == "ABHA_RECORD_FILED",
            )
        )
        notif = notif_res.scalar_one_or_none()
        assert notif is not None
        assert "Your visit summary has been added to your ABHA health record." in notif.message


@pytest.mark.asyncio
async def test_abdm_api_endpoints():
    """Test ABDM HTTP router endpoints via ASGI test client."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. POST /api/abdm/auth/init
        resp = await client.post("/api/abdm/auth/init", json={
            "auth_mode": "AADHAAR_OTP",
            "identifier": "999900001111",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "txn_id" in data
        txn_id = data["txn_id"]

        # 2. POST /api/abdm/auth/login
        login_resp = await client.post("/api/abdm/auth/login", json={
            "txn_id": txn_id,
            "otp": "123456",
        })
        assert login_resp.status_code == 200
        auth_data = login_resp.json()
        assert "access_token" in auth_data
        token = auth_data["access_token"]

        # 3. GET /api/abdm/status (Authenticated)
        status_resp = await client.get(
            "/api/abdm/status",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert status_resp.status_code == 200
        status_data = status_resp.json()
        assert status_data["is_linked"] is True
        assert status_data["abha_number"].startswith("14-")
