# Change Requests — Round 2

These are fixes and one new major feature for the app already built from PROJECT_SPEC.md. Do not rebuild existing features from scratch — modify what exists.

---

## 1. Login page rebrand + role selection

- Replace the app name "HealthApp" with **"Medikiosk"** everywhere it appears (logo text, page titles, headers).
- Replace the current logo icon with a placeholder `<img>` tag pointing to `/assets/logo.png` — I will drop in the real logo file myself, so just wire up the image tag and sizing, don't generate a new icon.
- Before the current login form, add a **landing/choice screen**: two large buttons — "Patient Login" and "Doctor Login". Selecting one routes to that role's existing login form. This screen is the new entry point of the app.

---

## 2. NEW FEATURE — AI pre-consultation summary (this is the core selling point of the product)

**Goal:** before a patient meets a doctor, the patient answers a short set of questions about their current problem. The system combines that with any of the patient's **past medical records that are relevant to the current problem** (matched by department/symptom, not just dumping the whole history) and generates a short AI-written summary the doctor sees before/at the start of the consultation. This should cut consultation time.

**Build this as:**

- **Questionnaire step**, triggered when a patient books or starts an appointment:
  - "What's the main problem today?" (free text)
  - "Which body area / department does this relate to?" (dropdown: ortho, cardio, derma, general, etc. — reuse existing department tags)
  - "How long have you had this?" (free text or duration picker)
  - "Any medication currently being taken?" (free text)
  - 2–3 follow-up questions can be dynamically generated based on the department chosen (optional, skip for v1 if too complex)
- **Backend logic:**
  - Store questionnaire answers tied to patient ID + appointment ID.
  - Pull the patient's past medical records filtered by the same department tag as the current problem (reuse the existing department-filtered records logic).
  - Send the questionnaire answers + the filtered past records to an LLM via API call, with a prompt like: "Summarize this patient's current complaint and highlight any related history from their past records. Keep it under 150 words, written for a doctor to skim in 10 seconds."
  - Save the generated summary tied to that appointment.
- **Frontend:**
  - Patient app: show the questionnaire before appointment confirmation, and let the patient review the generated summary before it's sent (editable/confirmable).
  - Doctor dashboard: show this AI summary at the top of the appointment/patient view, clearly labeled "AI Pre-Visit Summary," with a link to view the full raw records below it.
- Use the **Google Gemini API** (free tier via Google AI Studio, e.g. `gemini-2.5-flash` or the latest free-tier model available) for the summary generation call — it's free to start with and keeps everything inside the same Google ecosystem as Antigravity itself. Keep the API key and the prompt server-side (in an environment variable), never expose it to the frontend. Structure this as a small, swappable "summary generator" function/module so the LLM provider can be changed later without touching the rest of the app.

---

## 3. Files & Scans — organize by timeline and department, not just file type

Currently the Files & Scans page only filters by document type (Lab Report, Prescription, X-Ray, etc.). Change this to a two-axis view:

- Primary grouping: **department** (Ortho, Cardio, Derma, General — same tags used in Medical Records).
- Within each department group, list files **sorted by date, most recent first**.
- Keep the existing type filter (Lab Report/Prescription/X-Ray/etc.) as a secondary filter that can be combined with the department view — e.g. "Ortho + X-Ray only."
- Each file entry should show: date, department tag, file type, and a thumbnail/preview if it's an image.

---

## 4. Profile photo upload

- Add a profile photo upload option on the Profile page for both patients and doctors.
- Accept standard image formats (jpg, png), store in the existing file storage bucket, save the reference link on the user's profile record.
- Show the uploaded photo next to the user's name in the top navigation bar (where the current default avatar circle is).

---

## 5. UI polish pass

Current UI is functional but flat and static. Keep the existing color scheme (dark theme, blue-to-teal gradient accents, rounded cards) — this is about interactivity and polish, not a visual redesign. Apply the following consistently across every existing page (login, dashboard, appointments, medical records, files & scans, profile):

**Motion & feedback**
- Buttons: add a hover state (slight brightness/scale increase, ~150ms transition) and a pressed/active state on click.
- Cards (appointment cards, file cards, record entries): subtle lift on hover (small shadow + 2–3px translate up), smooth transition, not instant snap.
- Page/section transitions: fade or slide-in when switching sidebar tabs (Overview → Appointments → Medical Records, etc.) instead of an instant hard cut.
- Loading states: replace blank/empty waits with skeleton loaders (greyed-out placeholder shapes matching the content layout) for: file gallery loading, medical records loading, AI summary generating, appointment list loading.
- Success feedback: a brief checkmark or toast animation after booking an appointment, uploading a file, or a doctor's access request being approved — something that confirms the action without needing a page reload.
- Notification bell: small pulse/badge animation when a new notification arrives, not just a static number badge.

**Layout & consistency**
- Standardize spacing/padding values across all pages (pick one spacing scale, e.g. 8px/16px/24px/32px, and apply it everywhere instead of ad hoc values per page).
- Standardize corner radius, border colors, and font sizes for all cards and inputs so every page feels like the same app.
- Empty states (like "No Files in this Category") should include a small icon + message + primary action button, styled consistently — this pattern already exists on the Files page, replicate the same style for empty Appointments, empty Medical Records, and empty Notifications states.

**Interactivity details**
- Sidebar: highlight the active section clearly (already partially done) and add a smooth transition when switching, not an instant color snap.
- Forms (login, questionnaire, profile edit): inline validation feedback as the user types (e.g. red border + message on invalid email) instead of only on submit.
- Tooltips on icon-only buttons (e.g. the copy icon next to the Patient ID) so their purpose is clear on hover.

Do not change the underlying color palette, layout structure, or branding — only add the motion, feedback, and consistency layer on top of what already exists.

---

**Process:** Read this file plus the original @PROJECT_SPEC.md for context on the existing architecture. Write an updated implementation_plan.md covering items 1–5 above, in this order (do 4 and 1 first since they're small, then 3, then the UI polish pass in 5, and build 2 last since it's the biggest). Stop for my approval before writing code, same as before.
