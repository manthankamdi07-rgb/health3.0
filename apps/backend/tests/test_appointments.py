"""
Tests for Appointments Management (Task 9).
"""

import pytest
from datetime import datetime, timezone, timedelta
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.database import AsyncSessionLocal
from app.models.user import User, PatientProfile, UserRole
from app.models.doctor import DoctorProfile
from app.models.appointment import Appointment, AppointmentStatus
from app.utils.jwt import create_access_token


@pytest.mark.asyncio
async def test_appointment_lifecycle_and_calendar():
    """Comprehensive test suite for appointment booking, conflict detection, status transitions, and calendar views."""
    async with AsyncSessionLocal() as db:
        ts = int(datetime.now(timezone.utc).timestamp() * 1000)

        # 1. Setup Patient
        patient_user = User(
            email=f"pat_appt_{ts}@example.com",
            phone=f"+1000000{ts % 10000}",
            password_hash="hash",
            role=UserRole.PATIENT,
            is_active=True,
        )
        db.add(patient_user)
        await db.flush()

        patient_profile = PatientProfile(
            user_id=patient_user.id,
            patient_id=f"PAT-APPT-{ts % 10000}",
            name="Alice Patient",
            age=28,
            blood_group="B+",
            allergies=None,
        )
        db.add(patient_profile)

        # 2. Setup Approved Doctor
        doc_user = User(
            email=f"doc_approved_{ts}@example.com",
            password_hash="hash",
            role=UserRole.DOCTOR,
            is_active=True,
        )
        db.add(doc_user)
        await db.flush()

        doc_profile = DoctorProfile(
            user_id=doc_user.id,
            name="Dr. Bob Smith",
            specialty="Cardiology",
            license_number=f"DOC-LIC-{ts}",
            is_approved=True,
        )
        db.add(doc_profile)

        # 3. Setup Unapproved Doctor
        unapproved_doc = User(
            email=f"doc_unapp_{ts}@example.com",
            password_hash="hash",
            role=UserRole.DOCTOR,
            is_active=True,
        )
        db.add(unapproved_doc)
        await db.flush()

        unapproved_profile = DoctorProfile(
            user_id=unapproved_doc.id,
            name="Dr. Pending",
            specialty="Dermatology",
            license_number=f"DOC-UNAPP-{ts}",
            is_approved=False,
        )
        db.add(unapproved_profile)

        # 4. Setup Doctor 2 (for independent calendar checks)
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
            name="Dr. Carol White",
            specialty="Neurology",
            license_number=f"DOC2-LIC-{ts}",
            is_approved=True,
        )
        db.add(doc2_profile)

        await db.commit()

        pat_id = patient_user.id
        pat_unique_id = patient_profile.patient_id
        doc_id = doc_user.id
        doc2_id = doc2_user.id
        unapp_id = unapproved_doc.id

    token_patient = create_access_token({"sub": str(pat_id), "role": UserRole.PATIENT.value})
    token_doctor = create_access_token({"sub": str(doc_id), "role": UserRole.DOCTOR.value})
    token_doctor2 = create_access_token({"sub": str(doc2_id), "role": UserRole.DOCTOR.value})

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # A. Fail booking: Appointment in the past
        past_time = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
        res_past = await client.post(
            "/api/appointments/book",
            headers={"Authorization": f"Bearer {token_patient}"},
            json={
                "doctor_id": doc_id,
                "appointment_date": past_time,
                "duration_minutes": 30,
                "reason": "Past checkup",
            },
        )
        assert res_past.status_code == 400
        assert "future" in res_past.json()["detail"].lower()

        # B. Fail booking: Doctor is unapproved
        future_time_1 = (datetime.now(timezone.utc) + timedelta(days=2, hours=10)).isoformat()
        res_unapp = await client.post(
            "/api/appointments/book",
            headers={"Authorization": f"Bearer {token_patient}"},
            json={
                "doctor_id": unapp_id,
                "appointment_date": future_time_1,
                "duration_minutes": 30,
            },
        )
        assert res_unapp.status_code == 400
        assert "not approved" in res_unapp.json()["detail"].lower()

        # C. Successful booking with approved Doctor
        booking_payload = {
            "doctor_id": doc_id,
            "appointment_date": future_time_1,
            "duration_minutes": 30,
            "reason": "Chest discomfort and high blood pressure",
        }
        res_book = await client.post(
            "/api/appointments/book",
            headers={"Authorization": f"Bearer {token_patient}"},
            json=booking_payload,
        )
        assert res_book.status_code == 201
        appt_data = res_book.json()
        assert appt_data["doctor_id"] == doc_id
        assert appt_data["doctor_name"] == "Dr. Bob Smith"
        assert appt_data["patient_name"] == "Alice Patient"
        assert appt_data["patient_unique_id"] == pat_unique_id
        assert appt_data["status"] == "PENDING"
        appt_id = appt_data["id"]

        # D. Conflict detection: Same doctor, overlapping time (+15 mins into a 30-min slot)
        overlapping_time = (datetime.now(timezone.utc) + timedelta(days=2, hours=10, minutes=15)).isoformat()
        res_conflict = await client.post(
            "/api/appointments/book",
            headers={"Authorization": f"Bearer {token_patient}"},
            json={
                "doctor_id": doc_id,
                "appointment_date": overlapping_time,
                "duration_minutes": 30,
                "reason": "Follow up",
            },
        )
        assert res_conflict.status_code == 409
        assert "conflict" in res_conflict.json()["detail"].lower() or "already has an appointment" in res_conflict.json()["detail"].lower()

        # E. Patient views their appointment list
        res_pat_list = await client.get(
            "/api/appointments/patient/my-appointments",
            headers={"Authorization": f"Bearer {token_patient}"},
        )
        assert res_pat_list.status_code == 200
        pat_appts = res_pat_list.json()
        assert len(pat_appts) >= 1
        assert any(a["id"] == appt_id for a in pat_appts)

        # F. Doctor views their calendar
        res_doc_cal = await client.get(
            "/api/appointments/doctor/calendar",
            headers={"Authorization": f"Bearer {token_doctor}"},
        )
        assert res_doc_cal.status_code == 200
        doc_cal = res_doc_cal.json()
        assert len(doc_cal) >= 1
        assert any(a["id"] == appt_id for a in doc_cal)

        # Doctor 2 views their calendar -> shouldn't see appt_id
        res_doc2_cal = await client.get(
            "/api/appointments/doctor/calendar",
            headers={"Authorization": f"Bearer {token_doctor2}"},
        )
        assert res_doc2_cal.status_code == 200
        assert not any(a["id"] == appt_id for a in res_doc2_cal.json())

        # G. Status transitions:
        # 1. Patient attempts to CONFIRM -> 403 (Patients can only cancel)
        res_pat_confirm = await client.patch(
            f"/api/appointments/{appt_id}/status",
            headers={"Authorization": f"Bearer {token_patient}"},
            json={"status": "CONFIRMED"},
        )
        assert res_pat_confirm.status_code == 403

        # 2. Doctor confirms the appointment -> 200
        res_doc_confirm = await client.patch(
            f"/api/appointments/{appt_id}/status",
            headers={"Authorization": f"Bearer {token_doctor}"},
            json={"status": "CONFIRMED", "notes": "Confirmed. Please bring previous ECG reports."},
        )
        assert res_doc_confirm.status_code == 200
        assert res_doc_confirm.json()["status"] == "CONFIRMED"
        assert res_doc_confirm.json()["notes"] == "Confirmed. Please bring previous ECG reports."

        # 3. View appointment details by ID
        res_details = await client.get(
            f"/api/appointments/{appt_id}",
            headers={"Authorization": f"Bearer {token_patient}"},
        )
        assert res_details.status_code == 200
        assert res_details.json()["status"] == "CONFIRMED"

        # Unauthorized doctor views details -> 403
        res_unauth_details = await client.get(
            f"/api/appointments/{appt_id}",
            headers={"Authorization": f"Bearer {token_doctor2}"},
        )
        assert res_unauth_details.status_code == 403

        # 4. Doctor completes the appointment -> 200
        res_doc_complete = await client.patch(
            f"/api/appointments/{appt_id}/status",
            headers={"Authorization": f"Bearer {token_doctor}"},
            json={"status": "COMPLETED", "notes": "Consultation done. Medication prescribed."},
        )
        assert res_doc_complete.status_code == 200
        assert res_doc_complete.json()["status"] == "COMPLETED"

        # 5. Cannot alter a COMPLETED appointment -> 400
        res_cannot_alter = await client.patch(
            f"/api/appointments/{appt_id}/status",
            headers={"Authorization": f"Bearer {token_doctor}"},
            json={"status": "CANCELLED"},
        )
        assert res_cannot_alter.status_code == 400
