# Health App — Project Spec

Plain-language architecture spec for a patient/doctor healthcare platform.
Use this as the source of truth when planning and building features in Antigravity (or any other tool). Build one section at a time, in the order listed — don't try to build everything in one pass.

---

## 1. System overview

Two client apps talk to one backend server. The backend is the only thing allowed to touch the databases, file storage, and notification service directly. Neither client app ever talks to a database directly.

**Blocks:**
- **Patient app** — mobile/web client for patients (suggested: React Native or Flutter)
- **Doctor dashboard** — web client for doctors (suggested: React.js)
- **Backend API server** — handles all requests, enforces permissions (suggested: Node.js + Express, or Django)
- **Auth service** — verifies logins and issues session tokens (suggested: Firebase Auth or JWT)
- **Databases** — structured data storage (suggested: PostgreSQL for profiles/appointments, MongoDB for flexible medical notes)
- **File storage** — for scans, X-rays, PDFs (suggested: AWS S3 or Google Cloud Storage)
- **Notification service** — push + SMS alerts (suggested: Firebase Cloud Messaging + Twilio)

Flow: `Patient app / Doctor dashboard → Backend API → {Auth, Databases, File storage, Notifications}`

---

## 2. Database structure

Data is split by type into separate stores rather than one giant table:

| Store | Contains | Notes |
|---|---|---|
| Patient profile DB | Name, age, contact info, unique patient ID | Created once at sign-up, rarely changes |
| Medical records DB | Diagnoses, prescriptions, visit notes | Append-only — never overwrite, always add a new dated entry |
| Appointments DB | Bookings, schedules, past + upcoming visits | Linked to patient ID and doctor ID |
| File storage | X-rays, scans, PDFs | Database stores only a link/reference to the file, not the file itself |

**Past vs present data:** nothing is deleted or overwritten. Every entry gets a timestamp, so the full history is always visible and just gets longer over time.

---

## 3. Sign-up and login

Patients and doctors use different sign-up paths, but land on the same login screen.

- **Patient sign-up:** phone/email OTP verification → account created → system auto-generates a **unique patient ID** (permanent, like a locker number — never reused, never changed even if contact details change).
- **Doctor sign-up:** medical license number submitted → verified against a license registry → requires **admin approval** before the account is activated. Doctors cannot self-approve.
- **Login:** both roles log in with their ID/email + password (plus optional 2FA).

---

## 4. Doctor access permission flow

A doctor cannot open a patient's record just by having their ID. Every access requires patient consent:

1. Doctor searches for a patient by unique ID and requests access.
2. Backend sends a push notification to the patient's phone: "Dr. X wants to view your records."
3. Patient taps **Approve** or **Deny** in the app.
4. If approved → doctor is granted access (decide: one-time view, timed access e.g. 30 days, or ongoing until revoked).
5. If denied → access stays blocked, and the doctor is notified the request was declined.

This permission check happens on every new doctor requesting access — not just once per app.

---

## 5. Patient history — organized by department

Every medical record carries three tags: patient ID, date, and department. This lets the history be filtered instead of scrolled through linearly.

Example departments/folders:
- **Orthopedics** — bone/joint visits, X-rays, physio notes
- **Cardiology** — heart checkups, ECG reports, related medication
- **Dermatology** — skin treatments, photos, prescriptions
- **General / other** — anything that doesn't fit a specialty (fever, general checkups, etc.)

Doctors viewing a patient's approved history can filter by department instead of seeing everything at once.

---

## 6. Feature list

| Feature | Description |
|---|---|
| Patient sign-up/login | OTP verification, generates unique patient ID |
| Doctor sign-up/login | License verification + admin approval required |
| Access request system | Doctor requests → patient notified → approve/deny |
| Patient profile | Name, age, contact, blood group, allergies |
| Medical history (by department) | Timeline of visits, filterable by specialty |
| File/scan upload | X-rays, lab reports, prescriptions as PDFs/images |
| Appointment booking | Patient books a slot; doctor sees a calendar view |
| Notifications | Access requests, appointment reminders, new report alerts |
| Doctor dashboard | Search patients, view approved records, add visit notes |
| Admin panel (optional) | Approves new doctor accounts, manages the platform |

---

## 7. Suggested tech stack

| Layer | Tool |
|---|---|
| Patient app | React Native or Flutter |
| Doctor dashboard | React.js |
| Backend server | Node.js + Express (or Django) |
| Auth | Firebase Auth or JWT |
| Structured data | PostgreSQL or MySQL |
| Flexible medical data | MongoDB |
| File storage | AWS S3 or Google Cloud Storage |
| Push/SMS notifications | Firebase Cloud Messaging + Twilio |
| Hosting | AWS, Google Cloud, or Azure |

---

## 8. Build order (recommended)

Build in vertical slices — each one fully working end to end before moving to the next:

1. Patient sign-up + unique ID generation
2. Doctor sign-up + admin approval flow
3. Login for both roles
4. Backend API skeleton + database schema (profile, medical records, appointments tables)
5. Doctor access-request + patient approval/denial notification flow
6. Medical history view, tagged and filterable by department
7. File/scan upload tied to patient ID
8. Appointment booking
9. Notifications (reminders, new report alerts)
10. Admin panel (optional, for approving doctors)

---

*Security note: never hardcode API keys, database passwords, or patient data into prompts given to an AI coding agent. Use environment variables / a secrets manager, and keep production credentials out of any chat or spec file that leaves your machine.*
