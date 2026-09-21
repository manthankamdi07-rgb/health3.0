# Health 4.0 — Upgrade Specification (for Antigravity IDE)

This document defines the scope for Version 4.0, building on the existing Health 3.0 codebase (FastAPI + PostgreSQL + MongoDB backend, React/React Native frontend, AI summary + OCR pipeline, i18n, voice input, 3D landing page). Follow the existing plan-first-then-execute workflow: review this spec, propose an implementation plan per task, get explicit approval, then write code.

---

## PART A — ABDM (Ayushman Bharat Digital Mission) Integration

### Goal
Connect the platform to India's national digital health network so patient records aren't siloed in our system alone — they become part of the patient's official, portable health history.

### A1. ABHA-based Login & Consent

**Requirements:**
- Add an **ABHA (Ayushman Bharat Health Account) login option** alongside the existing email/password login — not a replacement. Patients should be able to:
  - Log in with email + password (existing flow), AND
  - Optionally link their ABHA ID/number during signup or from their profile settings.
- Use ABDM's official **ABHA authentication APIs** (via Aadhaar OTP, mobile OTP, or ABHA number + password, per ABDM's supported flows) to verify and link the ABHA ID to the patient's existing account.
- Before any data is shared with ABDM, show an explicit **consent screen** stating exactly what will be shared (visit summary, uploaded documents, AI-generated notes) and with whom (the patient's own ABHA-linked Personal Health Record). Consent must be a deliberate action (checkbox + confirm), not a pre-checked default.
- Store consent records (what was approved, when, for which visit/document) in the existing permission/consent data model — extend it rather than building a separate system.
- Handle the case where a patient does NOT want to link ABHA — the platform must work fully without it; ABDM integration is additive, not mandatory.

### A2. Automatic Filing to Hospital System + ABHA Account

**Requirements:**
- After the AI completes the pre-consultation questionnaire and processes any uploaded/scanned documents for a visit, the system should:
  1. Store the finalized visit record (summary, questionnaire responses, scanned documents) in our own MongoDB as it does today.
  2. **Push a copy to ABDM** via the appropriate Health Information Provider (HIP) APIs, so it becomes part of the patient's linked ABHA health record — but only for patients who completed the consent step in A1.
- This is a **background/async job**, not a blocking step in the consultation flow — if the ABDM push fails or is slow, the doctor/patient experience should not be held up. Log failures for retry.
- Data pushed to ABDM must follow the **FHIR-based health data formats** ABDM expects (e.g. structured OPConsultRecord/DiagnosticReport bundles) — do not push raw unstructured text.
- Confirm to the patient (via existing notification system — FCM/Twilio) once the record has been successfully filed to their ABHA account: *"Your visit summary has been added to your ABHA health record."*

### Technical notes for Antigravity
- ABDM provides a **public sandbox environment** (sandbox.abdm.gov.in) for developers to test these integrations without needing real production empanelment — use this for the hackathon prototype. Do not attempt to integrate with production ABDM endpoints.
- Before writing code, research and report back on: (a) which specific ABDM sandbox APIs are needed (ABHA creation/linking, Health Information Provider registration, Care Context linking, Data Push), and (b) what credentials/registration steps are needed to access the sandbox, since this may require the team to register as a developer on the ABDM sandbox portal first.
- This is likely the most complex piece of this spec — plan for it to take significant back-and-forth. Break it into sub-tasks (ABHA login UI → ABHA verification API call → consent screen → background push job → FHIR data formatting) and get approval on each before moving to the next.

---

## PART B — AYUSH History Mode

### Goal
Give the AI a second, distinct questioning track for AYUSH (Ayurveda, Yoga, Unani, Siddha, Homeopathy) department visits, since traditional diagnosis requires a fundamentally different, broader intake than a standard consultation.

### B1. Department-Triggered Questioning Track

**Requirements:**
- When a patient books an appointment tagged under the **AYUSH department** (or specifically Ayurveda, if departments are split further), the pre-consultation AI questionnaire must switch from the standard symptom-focused flow to an **AYUSH-specific intake flow**.
- This should reuse the existing questionnaire engine/infrastructure from the standard flow (voice input, multi-language support, AI summary generation must all still work) — build this as an alternate question set/branch, not a separate parallel system.

### B2. Traditional Diagnostic Metrics to Capture

The AYUSH intake must ask about, at minimum:
- **Prakriti (body constitution):** Questions to help characterize the patient's baseline body type (Vata/Pitta/Kapha-oriented traits — body build, skin/hair type, typical temperament, appetite patterns, sleep patterns).
- **Vikriti (current imbalance):** Questions about current symptoms framed in terms of imbalance from baseline (e.g. changes in digestion, energy, mood, sleep compared to normal).
- **Agni (digestive fire):** Questions on appetite strength, digestion speed, bloating, food intolerances, thirst patterns.
- **Bowel habits:** Frequency, consistency, regularity, any discomfort.
- **Ahara-Vihara (diet and lifestyle):** Typical daily diet, meal timing, water intake, sleep schedule, exercise/activity level, stress levels, daily routine consistency.

**Implementation requirements:**
- Structure these as a clear, sectioned questionnaire (not one long unstructured list) — e.g. separate steps/screens for Prakriti, Vikriti, Agni, Bowel Habits, Diet & Lifestyle — so patients aren't overwhelmed and can complete it in stages if needed.
- All AYUSH questions must support the same **voice input** and **multi-language (English/Hindi/Marathi)** capabilities as the rest of the app — this population may particularly benefit from regional language support.
- The AI summary generation module needs a distinct **AYUSH summary template** — rather than a standard case summary, it should generate a structured "lifestyle and constitution assessment" organized under the same categories (Prakriti, Vikriti, Agni, Bowel Habits, Ahara-Vihara), so the Ayurvedic doctor can scan it by category.
- This AYUSH summary should still incorporate any uploaded scan/document content (per the existing AI summary fix from Health 3.0) where relevant, alongside the questionnaire responses.

### B3. Doctor-Side Display

**Requirements:**
- On the Doctor Clinical Portal, when viewing a patient booked under AYUSH, the case summary view should visibly indicate "AYUSH Assessment" and display the categorized lifestyle summary — distinct in layout from a standard case summary, so the doctor immediately recognizes the different format.

---

## SUGGESTED BUILD ORDER

1. **B1–B3 (AYUSH History Mode)** first — self-contained, extends existing questionnaire/AI infrastructure, no external dependencies, lower risk.
2. **A1 (ABHA Login & Consent)** — moderate complexity, requires ABDM sandbox registration and research before coding.
3. **A2 (Automatic Filing to ABDM)** — most complex, depends on A1 being complete and working; requires FHIR data formatting and async job handling.

## NOTES FOR ANTIGRAVITY
- Follow the existing plan-first-then-execute workflow: propose a plan per task, wait for explicit approval, then implement.
- For Part A, research the ABDM sandbox requirements and report findings (required registrations, API scope, data formats) before writing any integration code.
- Do not modify the existing standard (non-AYUSH) questionnaire or AI summary flow while building the AYUSH mode — it must be an additive branch, not a replacement.
- Keep `.env.example` updated with any new environment variables (e.g. ABDM sandbox client ID/secret, API base URLs) introduced by Part A.
- All new dependencies should be added to the relevant `package.json`/`requirements.txt` with justification in the plan before installation.
