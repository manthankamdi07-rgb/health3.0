"""
AI Pre-Consultation Summary Service (Gemini API & Fallback Provider).
Generates a structured, concise (< 150 words) clinical briefing for doctors to skim in 10 seconds.
"""

import logging
from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional
import httpx

from app.config import get_settings
from app.schemas.appointment import PreConsultationQuestionnaire

logger = logging.getLogger(__name__)
settings = get_settings()


def is_ayush_department(dept: Optional[str], ayush_assessment: Optional[Dict[str, Any]] = None) -> bool:
    """Checks if consultation is categorized under AYUSH/Ayurveda or contains AYUSH metrics."""
    if ayush_assessment:
        return True
    if not dept:
        return False
    d = dept.strip().upper()
    return d == "AYUSH" or "AYURVED" in d or "HOLISTIC" in d


class BaseAISummaryProvider(ABC):
    """Abstract base class for AI clinical summary generation."""

    @abstractmethod
    async def generate_summary(
        self,
        questionnaire: PreConsultationQuestionnaire,
        patient_info: Dict[str, Any],
        past_records: List[Dict[str, Any]],
        past_files: List[Dict[str, Any]],
    ) -> str:
        """Generate a clinical briefing under 150 words."""
        pass


class GeminiSummaryProvider(BaseAISummaryProvider):
    """
    Google Gemini API provider using the official gemini-2.5-flash model.
    Calls the Google Generative Language REST API.
    """

    def __init__(self, api_key: str, model: str = "gemini-2.5-flash"):
        self.api_key = api_key
        self.model = model
        self.endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"

    async def generate_summary(
        self,
        questionnaire: PreConsultationQuestionnaire,
        patient_info: Dict[str, Any],
        past_records: List[Dict[str, Any]],
        past_files: List[Dict[str, Any]],
    ) -> str:
        if not self.api_key:
            raise ValueError("GEMINI_API_KEY is not configured.")

        # Build clinical prompt
        dept = questionnaire.department
        main_problem = questionnaire.main_problem
        duration = questionnaire.duration
        meds = questionnaire.current_medication or "None reported"
        allergies = patient_info.get("allergies") or "None reported"
        blood_group = patient_info.get("blood_group") or "Unknown"
        age = patient_info.get("age") or "Not specified"

        # Format past records
        records_summary = "None on file"
        if past_records:
            records_lines = []
            for r in past_records[:3]:
                r_title = r.get("title", "Clinical Record")
                r_type = r.get("type", "Note")
                r_desc = r.get("description", "")[:120]
                records_lines.append(f"- [{r_type}] {r_title}: {r_desc}")
            records_summary = "\n".join(records_lines)

        # Format past files/scans with extracted clinical content
        files_summary = "None on file"
        if past_files:
            file_sections = []
            for f in past_files[:3]:
                fname = f.get("filename", "File")
                fcat = f.get("category", "Document")
                ftext = (f.get("extracted_text") or "").strip()
                if ftext:
                    file_sections.append(f"- [{fcat}] {fname}:\n  \"\"\"{ftext}\"\"\"")
                else:
                    file_sections.append(f"- [{fcat}] {fname}: [No text extracted or file empty]")
            files_summary = "\n".join(file_sections)

        # Format follow-ups
        follow_ups_summary = ""
        if questionnaire.follow_ups:
            f_lines = [f"  * {k.replace('_', ' ').capitalize()}: {v}" for k, v in questionnaire.follow_ups.items()]
            follow_ups_summary = "\nFollow-up Details:\n" + "\n".join(f_lines)

        # Check for AYUSH track
        if is_ayush_department(dept, questionnaire.ayush_assessment):
            ayush = questionnaire.ayush_assessment or {}
            prakriti = ayush.get("prakriti", {})
            vikriti = ayush.get("vikriti", {})
            agni = ayush.get("agni", {})
            bowel = ayush.get("bowel_habits", {})
            ahara_vihara = ayush.get("ahara_vihara", {})

            prakriti_str = ", ".join(f"{k}: {v}" for k, v in prakriti.items() if v) or "Standard baseline"
            vikriti_str = ", ".join(f"{k}: {v}" for k, v in vikriti.items() if v) or "Active imbalance"
            agni_str = ", ".join(f"{k}: {v}" for k, v in agni.items() if v) or "Variable digestive fire"
            bowel_str = ", ".join(f"{k}: {v}" for k, v in bowel.items() if v) or "Variable Koshta"
            lifestyle_str = ", ".join(f"{k}: {v}" for k, v in ahara_vihara.items() if v) or "Standard routine"

            system_instruction = (
                "You are an expert Ayurvedic & holistic clinical triage consultant. "
                "Synthesize this patient's pre-consultation intake into a structured lifestyle & constitution briefing "
                "for the attending Ayurvedic physician (Vaidya). Ground your analysis in traditional metrics "
                "(Prakriti, Vikriti/imbalance, Agni, Koshta, Ahara-Vihara) and rigorously incorporate extracted findings "
                "from uploaded files/scans, alongside allopathic medications and allergies. "
                "Keep your assessment under 180 words, strictly formatted with the following bullet points:\n"
                "• Chief Complaint & Vikriti: [Current complaint, duration, doshic imbalance manifestation]\n"
                "• Prakriti Profile: [Baseline body constitution traits and dosha dominance]\n"
                "• Agni & Koshta: [Digestive fire assessment (Vishama/Tikshna/Manda/Sama) and bowel habits (Krura/Mridu/Madhyama)]\n"
                "• Ahara-Vihara: [Dietary habits, daily routine consistency, sleep patterns, and stress]\n"
                "• Clinical Findings & Medications: [Concrete extracted scan/lab values or note if unreadable, current medications & allergies]\n"
                "• Vaidya Triage Notes: [Actionable therapeutic focus, dosha balancing, and deepana/pachana considerations]"
            )

            user_content = (
                f"Patient Age: {age}, Blood Group: {blood_group}\n"
                f"Department: AYUSH (Ayurvedic Intake)\n"
                f"Chief Complaint: {main_problem}\n"
                f"Duration: {duration}\n"
                f"Prakriti (Baseline Constitution): {prakriti_str}\n"
                f"Vikriti (Current Imbalance): {vikriti_str}\n"
                f"Agni (Digestive Fire): {agni_str}\n"
                f"Bowel Habits (Koshta): {bowel_str}\n"
                f"Ahara-Vihara (Diet & Lifestyle): {lifestyle_str}\n"
                f"Current Medications: {meds}\n"
                f"Known Allergies: {allergies}\n"
                f"{follow_ups_summary}\n\n"
                f"Past Records in AYUSH:\n{records_summary}\n\n"
                f"Uploaded Documents & Scans (Extracted Content):\n{files_summary}\n"
            )
        else:
            system_instruction = (
                "You are an expert clinical triage assistant. Summarize this patient's current complaint "
                "and rigorously incorporate concrete clinical findings from their uploaded department documents and scans "
                "(such as lab values, imaging conclusions, test results, or medications). "
                "Base your summary and clinical considerations directly on the actual extracted document text rather than generic assumptions. "
                "If document text extraction failed or was unreadable for any file, explicitly state that in the briefing. "
                "Keep your summary strictly under 150 words, formatted as bullet points for an attending doctor "
                "to skim in 10 seconds. Include:\n"
                "• Chief Complaint & Duration\n"
                "• Relevant History & Document Findings (highlight extracted findings from uploaded scans/files & past records)\n"
                "• Current Medications & Allergies\n"
                "• Key Clinical Considerations (actionable triage notes directly informed by the complaint and document findings)"
            )

            user_content = (
                f"Patient Age: {age}, Blood Group: {blood_group}\n"
                f"Department: {dept}\n"
                f"Chief Complaint: {main_problem}\n"
                f"Duration: {duration}\n"
                f"Current Medications: {meds}\n"
                f"Known Allergies: {allergies}\n"
                f"{follow_ups_summary}\n\n"
                f"Past Records in {dept}:\n{records_summary}\n\n"
                f"Uploaded Documents & Scans in {dept} (Extracted Content):\n{files_summary}\n"
            )

        payload = {
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": f"{system_instruction}\n\nPatient Data:\n{user_content}"}],
                }
            ],
            "generationConfig": {
                "temperature": 0.2,
                "maxOutputTokens": 350,
            },
        }

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                self.endpoint,
                json=payload,
                headers={"Content-Type": "application/json"},
            )

            if response.status_code != 200:
                logger.warning(
                    f"Gemini API returned status {response.status_code}: {response.text}"
                )
                raise RuntimeError(f"Gemini API error {response.status_code}")

            res_json = response.json()
            candidates = res_json.get("candidates", [])
            if not candidates:
                raise RuntimeError("No generation candidate returned by Gemini API")

            content = candidates[0].get("content", {})
            parts = content.get("parts", [])
            if not parts:
                raise RuntimeError("Empty parts in Gemini API candidate response")

            summary_text = parts[0].get("text", "").strip()
            return summary_text


class FallbackClinicalSummaryProvider(BaseAISummaryProvider):
    """
    High-quality structured clinical summarizer used when GEMINI_API_KEY is not configured
    or when external API calls fail / time out.
    Produces a crisp < 180-word clinical briefing for the doctor, incorporating extracted document findings.
    """

    async def generate_summary(
        self,
        questionnaire: PreConsultationQuestionnaire,
        patient_info: Dict[str, Any],
        past_records: List[Dict[str, Any]],
        past_files: List[Dict[str, Any]],
    ) -> str:
        dept = questionnaire.department or "General"
        main_problem = questionnaire.main_problem
        duration = questionnaire.duration
        meds = questionnaire.current_medication or "None reported"
        allergies = patient_info.get("allergies") or "NKDA (No known drug allergies)"
        age = patient_info.get("age")

        # History analysis
        history_parts = []
        if past_records:
            recent_record = past_records[0]
            rec_desc = recent_record.get("description", "")[:80]
            history_parts.append(f"Prior {dept} consultation: {recent_record.get('title', 'Record')} ({rec_desc}...)")

        if past_files:
            file_findings = []
            for f in past_files[:3]:
                fname = f.get("filename", "File")
                ftext = (f.get("extracted_text") or "").strip()
                if ftext and not ftext.startswith("["):
                    # Take first relevant line of extracted clinical text
                    first_line = ftext.split("\n")[0][:80]
                    file_findings.append(f"{fname} indicates: {first_line}")
                elif ftext.startswith("[File:"):
                    # Note unreadable or fallback state explicitly
                    file_findings.append(f"{fname} (unreadable/manual review needed)")
                else:
                    file_findings.append(f"{fname} on file")

            if file_findings:
                history_parts.append(f"Uploaded scans: {'; '.join(file_findings)}")
            else:
                history_parts.append(f"{len(past_files)} scan(s) on file under {dept}")
        elif not past_records:
            history_parts.append(f"No previous {dept} consultations or scans on file")

        history_note = ". ".join(history_parts) + "."

        # Follow-ups
        follow_up_lines = []
        if questionnaire.follow_ups:
            for k, v in questionnaire.follow_ups.items():
                clean_k = k.replace("_", " ").title()
                follow_up_lines.append(f"{clean_k}: {v}")
        follow_up_str = f" ({'; '.join(follow_up_lines)})" if follow_up_lines else ""

        age_str = f"{age}yo patient" if age else "Patient"
        complaint_str = main_problem.lower() if not main_problem.startswith(('Severe', 'Acute', 'Chronic')) else main_problem

        # AYUSH History Mode Fallback
        if is_ayush_department(dept, questionnaire.ayush_assessment):
            ayush = questionnaire.ayush_assessment or {}
            prakriti = ayush.get("prakriti", {})
            vikriti = ayush.get("vikriti", {})
            agni = ayush.get("agni", {})
            bowel = ayush.get("bowel_habits", {})
            ahara = ayush.get("ahara_vihara", {})

            # Synthesize Prakriti
            p_parts = []
            if prakriti.get("body_frame"):
                p_parts.append(f"Build: {prakriti['body_frame']}")
            if prakriti.get("skin_hair"):
                p_parts.append(f"Skin/Hair: {prakriti['skin_hair']}")
            if prakriti.get("weather_sensitivity"):
                p_parts.append(f"Weather: {prakriti['weather_sensitivity']}")
            if prakriti.get("temperament"):
                p_parts.append(f"Temperament: {prakriti['temperament']}")
            prakriti_text = "; ".join(p_parts) if p_parts else "Mixed dosha baseline constitution reported."

            # Synthesize Agni & Koshta
            agni_type = agni.get("appetite", "Appetite variable")
            post_meal = agni.get("post_meal", "digestion variable")
            bowel_freq = bowel.get("frequency", "regular")
            bowel_cons = bowel.get("consistency", "variable")
            bowel_comfort = bowel.get("discomfort", "routine elimination")
            agni_koshta_text = f"{agni_type} ({post_meal}). Koshta: {bowel_cons} consistency, {bowel_freq} ({bowel_comfort})."

            # Synthesize Ahara-Vihara
            ah_parts = []
            if ahara.get("diet_cravings"):
                ah_parts.append(f"Cravings: {ahara['diet_cravings']}")
            if ahara.get("meal_routine"):
                ah_parts.append(f"Meal Routine: {ahara['meal_routine']}")
            if ahara.get("sleep_cycle"):
                ah_parts.append(f"Sleep: {ahara['sleep_cycle']}")
            if ahara.get("activity_stress"):
                ah_parts.append(f"Activity/Stress: {ahara['activity_stress']}")
            ahara_text = "; ".join(ah_parts) if ah_parts else "Standard dietary & daily routine reported."

            # Synthesize Vikriti
            energy_mood = vikriti.get("energy_mood", "Fatigue/imbalance reported")

            summary = (
                f"• Chief Complaint & Vikriti: {age_str} presenting with {complaint_str} for {duration}{follow_up_str}. Imbalance note: {energy_mood}.\n"
                f"• Prakriti Profile: {prakriti_text}\n"
                f"• Agni & Koshta: {agni_koshta_text}\n"
                f"• Ahara-Vihara: {ahara_text}\n"
                f"• Clinical Findings & Medications: Current meds: {meds}. Allergies: {allergies}. {history_note}\n"
                f"• Vaidya Triage Notes: Holistic intake complete. Recommend pulse evaluation (Nadi Pariksha) and targeted dosha-balancing therapy."
            )
            return summary.strip()

        # Standard Allopathic Clinical Summary
        summary = (
            f"• Chief Complaint: {age_str} presenting with {complaint_str} "
            f"for {duration}{follow_up_str}.\n"
            f"• Department History & Files: {history_note}\n"
            f"• Medications & Allergies: Current meds: {meds}. Allergies: {allergies}.\n"
            f"• Clinical Skim: Focused evaluation for {dept.lower()} consultation recommended."
        )

        return summary.strip()


class AISummaryService:
    """
    Clinical AI Summary Service orchestrator.
    Attempts primary Gemini API; transparently falls back to FallbackClinicalSummaryProvider.
    """

    def __init__(self):
        api_key = settings.GEMINI_API_KEY
        self.primary_provider: Optional[GeminiSummaryProvider] = (
            GeminiSummaryProvider(api_key, settings.GEMINI_MODEL) if api_key else None
        )
        self.fallback_provider = FallbackClinicalSummaryProvider()

    async def generate_pre_consultation_summary(
        self,
        questionnaire: PreConsultationQuestionnaire,
        patient_info: Dict[str, Any],
        past_records: List[Dict[str, Any]],
        past_files: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """
        Generates clinical pre-consultation summary (< 150 words).
        Returns dictionary with summary text, provider used, and counts.
        """
        provider_name = "fallback-clinical"
        summary_text = ""

        if self.primary_provider:
            try:
                summary_text = await self.primary_provider.generate_summary(
                    questionnaire=questionnaire,
                    patient_info=patient_info,
                    past_records=past_records,
                    past_files=past_files,
                )
                provider_name = "gemini"
            except Exception as exc:
                logger.warning(
                    f"Gemini summary generation failed: {exc}. Using fallback clinical summarizer."
                )

        if not summary_text:
            summary_text = await self.fallback_provider.generate_summary(
                questionnaire=questionnaire,
                patient_info=patient_info,
                past_records=past_records,
                past_files=past_files,
            )

        return {
            "summary": summary_text,
            "department": questionnaire.department,
            "records_count": len(past_records),
            "files_count": len(past_files),
            "provider": provider_name,
        }


# Singleton service instance
ai_summary_service = AISummaryService()
