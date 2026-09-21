"""
Tests for Notifications System (Task 10).
"""

import pytest
from datetime import datetime, timezone, timedelta
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select

from app.main import app
from app.database import AsyncSessionLocal
from app.models.user import User, PatientProfile, UserRole
from app.models.doctor import DoctorProfile
from app.models.notification import Notification
from app.models.appointment import Appointment, AppointmentStatus
from app.utils.jwt import create_access_token


@pytest.mark.asyncio
async def test_notifications_lifecycle_and_triggers():
    """Test notification persistence across events, inbox retrieval, marking read, and 24h reminder sweeps."""
    async with AsyncSessionLocal() as db:
        ts = int(datetime.now(timezone.utc).timestamp() * 1000)

        # 1. Setup Patient
        patient_user = User(
            email=f"notif_pat_{ts}@example.com",
            phone=f"+1000000{ts % 10000}",
            password_hash="hash",
            role=UserRole.PATIENT,
            is_active=True,
        )
        db.add(patient_user)
        await db.flush()

        patient_profile = PatientProfile(
            user_id=patient_user.id,
            patient_id=f"PAT{ts % 100000:05d}",
            name="David Patient",
            age=32,
            blood_group="AB+",
            allergies=None,
        )
        db.add(patient_profile)

        # 2. Setup Doctor
        doc_user = User(
            email=f"notif_doc_{ts}@example.com",
            password_hash="hash",
            role=UserRole.DOCTOR,
            is_active=True,
        )
        db.add(doc_user)
        await db.flush()

        doc_profile = DoctorProfile(
            user_id=doc_user.id,
            name="Dr. Sarah Connor",
            specialty="Orthopedics",
            license_number=f"NOTIF-DOC-{ts}",
            is_approved=True,
        )
        db.add(doc_profile)

        await db.commit()

        pat_id = patient_user.id
        pat_unique_id = patient_profile.patient_id
        doc_id = doc_user.id

    token_patient = create_access_token({"sub": str(pat_id), "role": UserRole.PATIENT.value})
    token_doctor = create_access_token({"sub": str(doc_id), "role": UserRole.DOCTOR.value})

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # A. Doctor requests access -> Generates notification for Patient
        res_req = await client.post(
            "/api/access/request",
            headers={"Authorization": f"Bearer {token_doctor}"},
            json={"patient_unique_id": pat_unique_id, "reason": "Review X-ray"},
        )
        assert res_req.status_code == 201
        access_req_id = res_req.json()["id"]

        # Verify Patient has 1 unread notification
        res_notifs_p1 = await client.get(
            "/api/notifications",
            headers={"Authorization": f"Bearer {token_patient}"},
        )
        assert res_notifs_p1.status_code == 200
        p1_data = res_notifs_p1.json()
        assert p1_data["unread_count"] == 1
        assert len(p1_data["notifications"]) == 1
        assert p1_data["notifications"][0]["notification_type"] == "ACCESS_REQUEST"
        notif_id_1 = p1_data["notifications"][0]["id"]

        # B. Patient responds (approves) -> Generates notification for Doctor
        res_resp = await client.post(
            f"/api/access/{access_req_id}/respond",
            headers={"Authorization": f"Bearer {token_patient}"},
            json={"approve": True},
        )
        assert res_resp.status_code == 200

        # Verify Doctor has 1 unread notification
        res_notifs_d1 = await client.get(
            "/api/notifications",
            headers={"Authorization": f"Bearer {token_doctor}"},
        )
        assert res_notifs_d1.status_code == 200
        d1_data = res_notifs_d1.json()
        assert d1_data["unread_count"] == 1
        assert d1_data["notifications"][0]["notification_type"] == "ACCESS_RESPONSE"

        # C. Patient books appointment -> Generates notification for Doctor
        appt_time = (datetime.now(timezone.utc) + timedelta(days=1, hours=4)).isoformat()
        res_book = await client.post(
            "/api/appointments/book",
            headers={"Authorization": f"Bearer {token_patient}"},
            json={
                "doctor_id": doc_id,
                "appointment_date": appt_time,
                "duration_minutes": 30,
                "reason": "Knee pain checkup",
            },
        )
        assert res_book.status_code == 201
        appt_id = res_book.json()["id"]

        # Doctor now has 2 unread notifications (ACCESS_RESPONSE + APPOINTMENT_BOOKED)
        res_notifs_d2 = await client.get(
            "/api/notifications",
            headers={"Authorization": f"Bearer {token_doctor}"},
        )
        assert res_notifs_d2.status_code == 200
        assert res_notifs_d2.json()["unread_count"] == 2

        # D. Doctor confirms appointment -> Generates notification for Patient
        res_confirm = await client.patch(
            f"/api/appointments/{appt_id}/status",
            headers={"Authorization": f"Bearer {token_doctor}"},
            json={"status": "CONFIRMED"},
        )
        assert res_confirm.status_code == 200

        # Patient now has 2 unread notifications (ACCESS_REQUEST + APPOINTMENT_STATUS)
        res_notifs_p2 = await client.get(
            "/api/notifications",
            headers={"Authorization": f"Bearer {token_patient}"},
        )
        assert res_notifs_p2.status_code == 200
        assert res_notifs_p2.json()["unread_count"] == 2

        # E. Mark single notification as read
        res_mark_one = await client.patch(
            f"/api/notifications/{notif_id_1}/read",
            headers={"Authorization": f"Bearer {token_patient}"},
        )
        assert res_mark_one.status_code == 200
        assert res_mark_one.json()["is_read"] is True

        # Unread count should now be 1
        res_notifs_p3 = await client.get(
            "/api/notifications",
            headers={"Authorization": f"Bearer {token_patient}"},
        )
        assert res_notifs_p3.json()["unread_count"] == 1

        # F. Mark all notifications as read
        res_mark_all = await client.post(
            "/api/notifications/mark-all-read",
            headers={"Authorization": f"Bearer {token_patient}"},
        )
        assert res_mark_all.status_code == 200
        assert res_mark_all.json()["marked_count"] == 1

        # Unread count is now 0
        res_notifs_p4 = await client.get(
            "/api/notifications",
            headers={"Authorization": f"Bearer {token_patient}"},
        )
        assert res_notifs_p4.json()["unread_count"] == 0
        assert len(res_notifs_p4.json()["notifications"]) == 2

        # G. Automated 24-hour reminder sweep
        # Setup confirmed appointment happening 10 hours from now
        async with AsyncSessionLocal() as db:
            soon_appt = Appointment(
                patient_id=pat_id,
                patient_unique_id=pat_unique_id,
                doctor_id=doc_id,
                appointment_date=datetime.now(timezone.utc) + timedelta(hours=10),
                duration_minutes=30,
                status=AppointmentStatus.CONFIRMED,
                reason="Follow-up consultation",
            )
            db.add(soon_appt)
            await db.commit()

        # Trigger reminders
        res_sweep = await client.post(
            "/api/notifications/trigger-reminders?hours_ahead=24",
            headers={"Authorization": f"Bearer {token_doctor}"},
        )
        assert res_sweep.status_code == 200
        assert res_sweep.json()["reminders_sent"] >= 1

        # Running sweep again should be idempotent (0 duplicate reminders)
        res_sweep_again = await client.post(
            "/api/notifications/trigger-reminders?hours_ahead=24",
            headers={"Authorization": f"Bearer {token_doctor}"},
        )
        assert res_sweep_again.status_code == 200
        assert res_sweep_again.json()["reminders_sent"] == 0

        # Check patient received the APPOINTMENT_REMINDER
        res_p_remind = await client.get(
            "/api/notifications?unread_only=true",
            headers={"Authorization": f"Bearer {token_patient}"},
        )
        assert res_p_remind.status_code == 200
        unread_p = res_p_remind.json()["notifications"]
        assert any(n["notification_type"] == "APPOINTMENT_REMINDER" for n in unread_p)
