# Health 3.0 — Upgrade Specification (for Antigravity IDE)

This document defines the scope for Version 3.0 of the Health platform. It builds on the existing FastAPI + PostgreSQL + MongoDB backend and React frontend (Health 2.0 codebase). Follow the existing plan-first-then-execute workflow: review this spec, propose an implementation plan per task, get explicit approval, then write code.

---

## PART A — CRITICAL BUG FIXES (do these first, before new features)

### A1. Missing delete button on uploaded scanned files

**Problem:** In the file upload / medical records section, patients can upload scanned documents but have no way to delete a previously uploaded file.

**Required fix:**
- Add a delete (trash icon) button next to every uploaded file in the file list UI.
- On click, show a confirmation modal ("Are you sure you want to delete this file? This cannot be undone.").
- On confirm, call a `DELETE` endpoint (create one if it doesn't exist, e.g. `DELETE /files/{file_id}`) that:
  - Verifies the requesting user owns the file (or is an authorized doctor, per the permission model — but only the owning patient should be able to delete).
  - Removes the file from AWS S3.
  - Removes the corresponding metadata record from the database.
- Refresh the file list in the UI after successful deletion without a full page reload.
- Handle errors gracefully (e.g. file already deleted, network failure) with a toast/notification.

### A2. AI summary is not using the actual uploaded file content

**Problem:** When generating an AI summary for a patient's case, the system is not scanning/reading the content of uploaded files and incorporating it into the summary relevant to the current problem. The summary appears to be generated without real reference to what's in the documents.

**Required fix:**
- First, audit the existing codebase (`ai_summary.py`, `storage.py`, `record.py`, and related services) to determine whether ANY text-extraction or OCR capability currently exists. It is not confirmed whether OCR is already implemented or whether the system only ever handled text-based files. Report findings before writing new extraction code, to avoid duplicating or conflicting with something that already exists.
- Confirm whether uploaded files are being fetched, text-extracted, and passed into the prompt sent to the AI model at all.
- Ensure a proper extraction pipeline exists:
  - For image-based scans (JPEG/PNG): run OCR (e.g. Tesseract, or a cloud OCR service) to extract text.
  - For PDFs: extract text directly; fall back to OCR if the PDF is a scanned image.
- Once extracted, the text must be:
  - Scoped to the specific patient and the specific current problem/appointment/record being summarized (not the patient's entire file history unless explicitly requested).
  - Passed into the AI prompt as grounding context, with clear instructions to base the summary on that content rather than generating generic text.
- Add a fallback: if extraction fails or a file is unreadable, the summary should explicitly say so rather than silently ignoring it.
- Test with at least one scanned image and one text-based PDF to confirm the extracted content actually appears reflected in the generated summary.

---

## PART B — NEW FEATURES

### B1. Interactive 3D landing page with scroll-driven storytelling

**Goal:** Replace the current entry point with an animated, scroll-based landing page that introduces the platform before routing to login/signup.

**Requirements:**
- Build using React Three Fiber (`@react-three/fiber`) + `@react-three/drei` for 3D elements, combined with a scroll-trigger library (e.g. GSAP ScrollTrigger or Framer Motion's scroll utilities) to sync 3D animation/camera movement with scroll position.
- Structure as a sequence of scroll-linked sections, for example:
  1. Hero: 3D animated visual (e.g. abstract medical/health-themed model or particle system) with the platform name/tagline.
  2. Feature 1: Patient-doctor permission-based record access — animated on scroll.
  3. Feature 2: Appointment management.
  4. Feature 3: Department-tagged medical history / AI summaries.
  5. Final section: Call-to-action transitioning into Login/Sign Up.
- After the last scroll section, provide a clear "Get Started" / "Login" button that routes to the existing auth pages — do not force additional scrolling past this point.
- Must be reasonably performant on mid-range laptops and mobile (test frame rate; use `drei`'s `<Suspense>` and lazy-load 3D assets).
- Provide a "Skip intro" link/button visible from the start for users who want to go straight to login.
- Keep the existing login/signup flow and components unchanged — this only adds a new page before them at the root route.

### B2. Multi-language support (i18n)

**Goal:** Make the entire website (patient portal + doctor dashboard, including the new landing page) available in multiple languages.

**Requirements:**
- Use `react-i18next` (with `i18next` core) for the frontend.
- Set up a `locales/` directory with JSON translation files per language: `en.json` (English), `hi.json` (Hindi), `mr.json` (Marathi) to start, structured so more languages can be added later without code changes.
- Add a language switcher component (dropdown or flag icons) visible in the landing page header and in the app's main navigation once logged in.
- Persist the selected language (e.g. in localStorage / user profile setting) so it's remembered on return visits.
- Wrap all user-facing text (buttons, labels, form fields, error messages, AI summary UI chrome — not the AI-generated medical content itself) in translation keys instead of hardcoded strings.
- Consider RTL layout support if any planned language (e.g. Arabic, Urdu) requires it — flag this decision explicitly if it affects scope.

### B3. Voice input (microphone) for accessibility

**Goal:** Allow users who have difficulty typing to use voice input instead.

**Requirements:**
- Add a microphone icon button to key text input fields across the app — at minimum: symptom/problem description fields, any free-text form fields during sign-up/profile, and chat-style inputs if present.
- Use the Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`) for browser-based speech-to-text; clearly handle browsers that don't support it (e.g. hide the mic icon or show a "not supported in this browser" tooltip).
- While listening, show a clear visual indicator (pulsing icon, "Listening..." label).
- Insert transcribed text into the associated field, allowing the user to review/edit before submitting — never auto-submit from voice alone.
- Respect the multi-language setting from B2 where feasible (set the speech recognition language to match the user's selected UI language, when supported by the browser).

---

## SUGGESTED BUILD ORDER

1. A1 — Delete button for uploaded files (small, isolated fix)
2. A2 — Fix AI summary file-content usage (critical correctness issue)
3. B2 — i18n setup (foundational — easier to add before more UI is built)
4. B1 — 3D landing page
5. B3 — Voice input

## NOTES FOR ANTIGRAVITY

- Follow the existing plan-first-then-execute workflow used in Health 2.0: propose a plan per task above, wait for explicit approval, then implement.
- Do not modify the existing permission-based record access logic while working on these tasks unless a task explicitly requires it.
- All new frontend dependencies (react-i18next, @react-three/fiber, @react-three/drei, gsap or framer-motion) should be added to `package.json` with justification in the plan before installation.
- Keep `.env.example` updated if any new environment variables (e.g. OCR service keys) are introduced by A2.
