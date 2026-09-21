"""
Clinical Red-Flag Triage Detection Service.
Evaluates patient symptoms, pre-consultation complaints, and duration to detect
acute medical emergencies (e.g., Acute Coronary Syndrome with dyspnoea, Stroke/FAST,
severe respiratory failure, anaphylaxis, massive hemorrhage, sepsis).

Triggers immediate priority emergency alerts rather than standard appointment queueing.
"""

import re
import json
import logging
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, asdict
import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


@dataclass
class TriageAssessment:
    is_emergency: bool
    triage_level: str  # RED_FLAG, URGENT, ROUTINE
    primary_concern: str
    matched_triggers: List[str]
    immediate_action: str
    patient_warning: str
    recommended_queue: str  # EMERGENCY_TRIAGE, PRIORITY_QUEUE, ROUTINE_QUEUE


# Comprehensive clinical red-flag patterns (English, medical terminology, and common transliterations)
RED_FLAG_CATEGORIES = [
    {
        "category": "Cardiovascular Emergency (ACS / Myocardial Infarction / Aortic)",
        "condition": "Suspected Acute Coronary Syndrome or Acute Cardiac Emergency",
        "keywords": [
            r"chest\s*pain",
            r"chest\s*pressure",
            r"chest\s*tightness",
            r"chest\s*heaviness",
            r"crushing\s*chest",
            r"seene\s*me\s*dard",
            r"chhati\s*madhe\s*vedana",
            r"heart\s*attack",
            r"angina",
        ],
        "aggravators": [
            r"dyspnoea",
            r"dyspnea",
            r"shortness\s*of\s*breath",
            r"breathless",
            r"breathing\s*difficulty",
            r"radiating\s*to\s*(?:left\s*)?arm",
            r"radiating\s*to\s*jaw",
            r"radiating\s*to\s*back",
            r"sweating",
            r"diaphoresis",
            r"cold\s*sweat",
            r"syncope",
            r"passed\s*out",
            r"fainted",
            r"palpitations\s*with\s*dizziness",
            r"saas\s*phool",
            r"dum\s*ghut",
        ],
        "require_both": True,  # Chest pain + dyspnea/sweating/radiation
        "direct_emergency_keywords": [
            r"crushing\s*chest\s*pain",
            r"chest\s*pain\s*with\s*(?:shortness\s*of\s*breath|dyspnea|sweating|arm\s*pain)",
            r"severe\s*chest\s*pain\s*radiating",
        ],
    },
    {
        "category": "Neurological Emergency (Acute Stroke / FAST / Intracranial Hemorrhage)",
        "condition": "Suspected Acute Stroke / Transient Ischemic Attack (FAST Alert)",
        "keywords": [
            r"facial\s*droop",
            r"face\s*(?:droop|drooping|numb|asymmetry)",
            r"slurred\s*speech",
            r"loss\s*of\s*speech",
            r"cannot\s*speak",
            r"difficulty\s*speaking",
            r"inability\s*to\s*speak",
            r"one\s*sided\s*weakness",
            r"arm\s*weakness",
            r"leg\s*weakness",
            r"hemiparesis",
            r"stroke",
            r"paralysis",
            r"thunderclap\s*headache",
            r"worst\s*headache\s*of\s*(?:my\s*)?life",
            r"sudden\s*loss\s*of\s*vision",
            r"sudden\s*blindness",
            r"chehra\s*tedha",
            r"bolne\s*me\s*takleef",
            r"haath\s*pair\s*sunn",
        ],
        "aggravators": [],
        "require_both": False,
    },
    {
        "category": "Respiratory Failure & Airway Obstruction",
        "condition": "Severe Acute Respiratory Distress / Impending Airway Compromise",
        "keywords": [
            r"severe\s*dyspnea",
            r"severe\s*dyspnoea",
            r"gasping\s*for\s*air",
            r"stridor",
            r"cyanosis",
            r"blue\s*lips",
            r"blue\s*fingers",
            r"unable\s*to\s*breathe",
            r"choking",
            r"acute\s*asphyxiation",
            r"severe\s*asthma\s*attack\s*not\s*responding",
            r"oxygen\s*level\s*below\s*8[0-9]",
        ],
        "aggravators": [],
        "require_both": False,
    },
    {
        "category": "Severe Anaphylaxis / Allergic Shock",
        "condition": "Severe Anaphylactic Reaction / Airway Angioedema",
        "keywords": [
            r"throat\s*closing",
            r"swelling\s*of\s*(?:lips|tongue|throat|airway)",
            r"tongue\s*swelling\s*with\s*(?:breathing|wheez)",
            r"anaphylaxis",
            r"anaphylactic\s*shock",
            r"severe\s*allergic\s*reaction\s*cannot\s*breathe",
        ],
        "aggravators": [],
        "require_both": False,
    },
    {
        "category": "Severe Hemorrhage / Massive Bleeding",
        "condition": "Massive Hemorrhage / Acute Circulatory Instability",
        "keywords": [
            r"coughing\s*(?:up\s*)?large\s*amounts\s*of\s*blood",
            r"massive\s*hemoptysis",
            r"vomiting\s*(?:large\s*amounts\s*of\s*)?blood",
            r"massive\s*hematemesis",
            r"uncontrolled\s*(?:arterial\s*)?bleeding",
            r"bleeding\s*heavily\s*cannot\s*stop",
            r"profuse\s*blood\s*loss",
            r"khoon\s*ki\s*ulti",
        ],
        "aggravators": [],
        "require_both": False,
    },
    {
        "category": "Sepsis & Acute Altered Mental Status",
        "condition": "Severe Sepsis or Acute Encephalopathy / Coma",
        "keywords": [
            r"unresponsive",
            r"loss\s*of\s*consciousness",
            r"high\s*fever\s*with\s*confusion",
            r"high\s*fever\s*with\s*stiff\s*neck",
            r"delirious\s*and\s*lethargic",
            r"behoshi",
        ],
        "aggravators": [],
        "require_both": False,
    },
]

# Secondary Urgent (non-immediate life threat, but priority queueing recommended)
URGENT_PATTERNS = [
    r"high\s*fever\s*above\s*10[3-5]",
    r"deep\s*laceration",
    r"suspected\s*fracture",
    r"severe\s*abdominal\s*pain",
    r"kidney\s*stone\s*pain",
    r"bloody\s*stool",
    r"severe\s*vomiting\s*dehydration",
]


class TriageDetectionService:
    """
    Intelligent Triage & Emergency Red-Flag detection service.
    Combines rule-based clinical trigger evaluation with optional Gemini AI review.
    """

    def __init__(self, api_key: Optional[str] = None, model: str = "gemini-2.5-flash"):
        self.api_key = api_key or settings.GEMINI_API_KEY
        self.model = model or settings.GEMINI_MODEL

    def evaluate_text_deterministic(
        self,
        main_problem: str,
        department: Optional[str] = None,
        duration: Optional[str] = None,
        additional_notes: Optional[str] = None,
    ) -> TriageAssessment:
        """
        Instant, deterministic clinical pattern evaluation.
        Evaluates input text against known emergency triggers without network delay.
        """
        combined_text = f"{main_problem} {duration or ''} {additional_notes or ''}".lower()
        matched_triggers: List[str] = []
        detected_category = ""
        detected_condition = ""

        # 1. Check Emergency Red Flag Categories
        for cat in RED_FLAG_CATEGORIES:
            direct_matches = [
                pattern for pattern in cat.get("direct_emergency_keywords", [])
                if re.search(pattern, combined_text, re.IGNORECASE)
            ]
            if direct_matches:
                matched_triggers.extend(direct_matches)
                detected_category = cat["category"]
                detected_condition = cat["condition"]
                break

            kw_matches = [
                kw for kw in cat["keywords"]
                if re.search(kw, combined_text, re.IGNORECASE)
            ]

            if kw_matches:
                if cat.get("require_both", False):
                    agg_matches = [
                        agg for agg in cat.get("aggravators", [])
                        if re.search(agg, combined_text, re.IGNORECASE)
                    ]
                    if agg_matches:
                        matched_triggers.extend(kw_matches + agg_matches)
                        detected_category = cat["category"]
                        detected_condition = cat["condition"]
                        break
                else:
                    matched_triggers.extend(kw_matches)
                    detected_category = cat["category"]
                    detected_condition = cat["condition"]
                    break

        if matched_triggers:
            return TriageAssessment(
                is_emergency=True,
                triage_level="RED_FLAG",
                primary_concern=detected_condition or "Critical Acute Medical Emergency",
                matched_triggers=list(set(matched_triggers)),
                immediate_action=(
                    "PRIORITY RED-FLAG ALERT: Immediate notification triggered to doctor and triage nursing staff. "
                    "Patient must be evaluated in emergency room / priority triage bay without routine queueing."
                ),
                patient_warning=(
                    "CRITICAL MEDICAL ALERT: Your reported symptoms indicate a potential medical emergency. "
                    "Triage staff have been immediately alerted. If you are experiencing severe or worsening symptoms, "
                    "call National Emergency Services (108 / 112) or go to the nearest hospital Emergency Room immediately. "
                    "Do not drive yourself."
                ),
                recommended_queue="EMERGENCY_TRIAGE",
            )

        # 2. Check Urgent Non-Emergency Patterns
        urgent_matches = [
            u for u in URGENT_PATTERNS
            if re.search(u, combined_text, re.IGNORECASE)
        ]
        if urgent_matches:
            return TriageAssessment(
                is_emergency=False,
                triage_level="URGENT",
                primary_concern="Urgent Clinical Presentation",
                matched_triggers=urgent_matches,
                immediate_action="Patient prioritized for accelerated clinical consultation within 1-2 hours.",
                patient_warning="Your symptoms have been flagged for expedited clinical review by the medical team.",
                recommended_queue="PRIORITY_QUEUE",
            )

        # 3. Routine
        return TriageAssessment(
            is_emergency=False,
            triage_level="ROUTINE",
            primary_concern="Routine Consultation",
            matched_triggers=[],
            immediate_action="Standard queue placement.",
            patient_warning="",
            recommended_queue="ROUTINE_QUEUE",
        )

    async def evaluate_symptoms(
        self,
        main_problem: str,
        department: Optional[str] = None,
        duration: Optional[str] = None,
        additional_notes: Optional[str] = None,
    ) -> TriageAssessment:
        """
        Evaluate symptoms for emergency red flags using deterministic rules,
        supplemented by Gemini LLM triage if configured.
        """
        # Always run deterministic evaluation first
        assessment = self.evaluate_text_deterministic(
            main_problem=main_problem,
            department=department,
            duration=duration,
            additional_notes=additional_notes,
        )

        # If already flagged as RED_FLAG, return immediately to minimize latency
        if assessment.is_emergency:
            logger.warning(
                f"[TRIAGE RED FLAG DETECTED] Triggers: {assessment.matched_triggers} - {assessment.primary_concern}"
            )
            return assessment

        # If Gemini API key is configured, perform second-pass semantic analysis for ambiguous high-risk complaints
        if self.api_key and len(main_problem.strip()) >= 15:
            try:
                ai_eval = await self._evaluate_with_gemini(
                    main_problem=main_problem,
                    department=department,
                    duration=duration,
                )
                if ai_eval and ai_eval.is_emergency:
                    logger.warning(f"[TRIAGE AI DETECTED RED FLAG] {ai_eval.primary_concern}")
                    return ai_eval
            except Exception as exc:
                logger.debug(f"Gemini triage evaluation fallback: {exc}")

        return assessment

    async def _evaluate_with_gemini(
        self,
        main_problem: str,
        department: Optional[str],
        duration: Optional[str],
    ) -> Optional[TriageAssessment]:
        """Perform semantic clinical emergency triage using Gemini API."""
        endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent?key={self.api_key}"
        prompt = f"""
You are an expert Hospital Emergency Triage Medical Officer.
Evaluate the following patient complaint for LIFE-THREATENING EMERGENCY RED FLAGS:
- Chief Complaint: "{main_problem}"
- Department: "{department or 'General'}"
- Duration: "{duration or 'Not specified'}"

Determine if this presentation constitutes an ACUTE MEDICAL EMERGENCY requiring immediate triage bypass (e.g. Acute Coronary Syndrome/chest pain with dyspnea, Stroke/FAST symptoms, severe respiratory failure, anaphylaxis, severe hemorrhage, sepsis).

Respond STRICTLY in JSON format with no Markdown formatting:
{{
  "is_emergency": true/false,
  "triage_level": "RED_FLAG" | "URGENT" | "ROUTINE",
  "primary_concern": "short clinical description",
  "matched_triggers": ["trigger 1", "trigger 2"],
  "immediate_action": "clinical triage direction",
  "patient_warning": "patient safety warning"
}}
"""
        payload = {
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": 0.0,
                "maxOutputTokens": 300,
                "responseMimeType": "application/json",
            },
        }

        async with httpx.AsyncClient(timeout=4.0) as client:
            resp = await client.post(endpoint, json=payload, headers={"Content-Type": "application/json"})
            if resp.status_code == 200:
                candidates = resp.json().get("candidates", [])
                if candidates:
                    parts = candidates[0].get("content", {}).get("parts", [])
                    if parts:
                        raw_text = parts[0].get("text", "").strip()
                        data = json.loads(raw_text)
                        if data.get("is_emergency") or data.get("triage_level") == "RED_FLAG":
                            return TriageAssessment(
                                is_emergency=True,
                                triage_level="RED_FLAG",
                                primary_concern=data.get("primary_concern", "Acute Medical Emergency"),
                                matched_triggers=data.get("matched_triggers", ["Clinical AI Emergency Assessment"]),
                                immediate_action=data.get("immediate_action", "Immediate triage escalation required."),
                                patient_warning=data.get(
                                    "patient_warning",
                                    "Your symptoms require urgent clinical evaluation. Triage staff have been alerted."
                                ),
                                recommended_queue="EMERGENCY_TRIAGE",
                            )
        return None


# Singleton instance
triage_service = TriageDetectionService()
