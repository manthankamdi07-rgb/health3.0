"""
Tests for Admin Panel (Task 11).
"""

import pytest
from datetime import datetime, timezone
from httpx import AsyncClient, ASGITransport
from passlib.context import CryptContext

from app.main import app
from app.database import AsyncSessionLocal
from app.models.user import User, PatientProfile, UserRole
from app.models.doctor import DoctorProfile
from app.utils.jwt import create_access_token

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


@pytest.mark.asyncio
async def test_admin_panel_workflows():
    """Test doctor approval flow, user management, self-deactivation guard, and stats overview."""
    raw_password = "SecurePassword123!"
    hashed_pwd = pwd_context.hash(raw_password)

    async with AsyncSessionLocal() as db:
        ts = int(datetime.now(timezone.utc).timestamp() * 1000)

        # 1. Setup Admin
        admin_user = User(
            email=f"admin_{ts}@example.com",
            password_hash=hashed_pwd,
            role=UserRole.ADMIN,
            is_active=True,
        )
        db.add(admin_user)

        # 2. Setup Patient
        patient_user = User(
            email=f"admin_pat_{ts}@example.com",
            phone=f"+1000000{ts % 10000}",
            password_hash=hashed_pwd,
            role=UserRole.PATIENT,
            is_active=True,
        )
        db.add(patient_user)
        await db.flush()

        patient_profile = PatientProfile(
            user_id=patient_user.id,
            patient_id=f"PAT{ts % 100000:05d}",
            name="Frank Patient",
            age=40,
            blood_group="O+",
            allergies=None,
        )
        db.add(patient_profile)

        # 3. Setup Pending Doctor
        pending_doc_user = User(
            email=f"pending_doc_{ts}@example.com",
            password_hash=hashed_pwd,
            role=UserRole.DOCTOR,
            is_active=True,
        )
        db.add(pending_doc_user)
        await db.flush()

        pending_doc_profile = DoctorProfile(
            user_id=pending_doc_user.id,
            name="Dr. Gregory House",
            specialty="Diagnostic Medicine",
            license_number=f"DOC-PEND-{ts}",
            is_approved=False,
        )
        db.add(pending_doc_profile)

        await db.commit()

        admin_id = admin_user.id
        pat_id = patient_user.id
        doc_user_id = pending_doc_user.id
        doc_profile_id = pending_doc_profile.id
        doc_email = pending_doc_user.email

    token_admin = create_access_token({"sub": str(admin_id), "role": UserRole.ADMIN.value})
    token_patient = create_access_token({"sub": str(pat_id), "role": UserRole.PATIENT.value})

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # A. Non-admin access attempt -> 403 Forbidden
        res_unauth = await client.get(
            "/api/admin/doctors",
            headers={"Authorization": f"Bearer {token_patient}"},
        )
        assert res_unauth.status_code == 403

        # B. Pending doctor cannot log in prior to approval -> 403 Forbidden
        res_login_pending = await client.post(
            "/api/auth/login",
            json={"email": doc_email, "password": raw_password},
        )
        assert res_login_pending.status_code == 403
        assert "pending" in res_login_pending.json()["detail"].lower()

        # C. Admin lists pending doctors -> sees Dr. Gregory House
        res_pending_list = await client.get(
            "/api/admin/doctors?is_approved=false",
            headers={"Authorization": f"Bearer {token_admin}"},
        )
        assert res_pending_list.status_code == 200
        pending_docs = res_pending_list.json()
        assert any(d["id"] == doc_profile_id and d["is_approved"] is False for d in pending_docs)

        # D. Admin approves doctor
        res_approve = await client.patch(
            f"/api/admin/doctors/{doc_profile_id}/review",
            headers={"Authorization": f"Bearer {token_admin}"},
            json={"approved": True, "notes": "Medical license verified."},
        )
        assert res_approve.status_code == 200
        assert res_approve.json()["is_approved"] is True

        # E. Approved doctor can now successfully log in!
        res_login_approved = await client.post(
            "/api/auth/login",
            json={"email": doc_email, "password": raw_password},
        )
        assert res_login_approved.status_code == 200
        assert "access_token" in res_login_approved.json()
        doc_token = res_login_approved.json()["access_token"]

        # Doctor received approval notification
        res_doc_notif = await client.get(
            "/api/notifications",
            headers={"Authorization": f"Bearer {doc_token}"},
        )
        assert res_doc_notif.status_code == 200
        assert any(n["notification_type"] == "ACCOUNT_STATUS" for n in res_doc_notif.json()["notifications"])

        # F. User management: Admin lists users
        res_users = await client.get(
            "/api/admin/users?role=PATIENT",
            headers={"Authorization": f"Bearer {token_admin}"},
        )
        assert res_users.status_code == 200
        users_data = res_users.json()
        assert any(u["id"] == pat_id and u["name"] == "Frank Patient" for u in users_data)

        # G. Admin deactivates patient account
        res_deact = await client.patch(
            f"/api/admin/users/{pat_id}/status",
            headers={"Authorization": f"Bearer {token_admin}"},
            json={"is_active": False},
        )
        assert res_deact.status_code == 200
        assert res_deact.json()["is_active"] is False

        # Deactivated patient cannot log in -> 403 Forbidden
        res_pat_login_blocked = await client.post(
            "/api/auth/login",
            json={"email": patient_user.email, "password": raw_password},
        )
        assert res_pat_login_blocked.status_code == 403
        assert "deactivated" in res_pat_login_blocked.json()["detail"].lower()

        # H. Guard against self-deactivation by admin -> 400 Bad Request
        res_self_deact = await client.patch(
            f"/api/admin/users/{admin_id}/status",
            headers={"Authorization": f"Bearer {token_admin}"},
            json={"is_active": False},
        )
        assert res_self_deact.status_code == 400
        assert "cannot deactivate" in res_self_deact.json()["detail"].lower()

        # I. Platform dashboard statistics
        res_stats = await client.get(
            "/api/admin/stats",
            headers={"Authorization": f"Bearer {token_admin}"},
        )
        assert res_stats.status_code == 200
        stats = res_stats.json()
        assert stats["total_users"] >= 3
        assert stats["total_doctors"] >= 1
        assert stats["approved_doctors"] >= 1
        assert "total_appointments" in stats
        assert "total_files" in stats
