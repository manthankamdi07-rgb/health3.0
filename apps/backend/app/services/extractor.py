"""
Medical Document Text Extraction and OCR Service.
Handles direct PDF text extraction and multimodal OCR for image-based medical scans.
"""

import base64
import logging
from pathlib import Path
from typing import Dict, Any, Optional
import httpx
from pypdf import PdfReader

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

MAX_EXTRACTED_CHARS = 1500


class DocumentExtractorService:
    """
    Extracts clinical text from medical documents (PDFs and image scans).
    Provides direct text extraction for PDFs, multimodal OCR for images,
    and structured fallback descriptors for unreadable or failed files.
    """

    def __init__(self, api_key: Optional[str] = None, model: str = "gemini-2.5-flash"):
        self.api_key = api_key or settings.GEMINI_API_KEY
        self.model = model or settings.GEMINI_MODEL

    async def extract_text_from_file(
        self,
        file_path: Path,
        content_type: str,
        filename: str,
    ) -> Dict[str, Any]:
        """
        Extract text from a saved medical file on disk.
        Returns a dictionary with extracted_text, status, and method used.
        """
        if not file_path.exists() or not file_path.is_file():
            return {
                "filename": filename,
                "content_type": content_type,
                "extracted_text": f"[File: {filename} - File not found on storage]",
                "status": "error",
                "method": "none",
            }

        norm_type = (content_type or "").lower().split(";")[0].strip()

        try:
            if norm_type == "application/pdf" or file_path.suffix.lower() == ".pdf":
                return await self._extract_pdf(file_path, filename)
            elif norm_type.startswith("image/") or file_path.suffix.lower() in [".png", ".jpg", ".jpeg", ".webp"]:
                return await self._extract_image(file_path, norm_type, filename)
            else:
                return {
                    "filename": filename,
                    "content_type": content_type,
                    "extracted_text": f"[File: {filename} - Unsupported file format for text extraction]",
                    "status": "unsupported",
                    "method": "none",
                }
        except Exception as exc:
            logger.warning(f"Error extracting text from {filename}: {exc}")
            return {
                "filename": filename,
                "content_type": content_type,
                "extracted_text": f"[File: {filename} - Text extraction failed: unreadable content]",
                "status": "failed",
                "method": "none",
            }

    async def _extract_pdf(self, file_path: Path, filename: str) -> Dict[str, Any]:
        """Extract text from a PDF file using pypdf."""
        try:
            reader = PdfReader(str(file_path))
            pages_text = []
            for idx, page in enumerate(reader.pages[:5]):  # Process first 5 pages max
                text = page.extract_text() or ""
                if text.strip():
                    pages_text.append(text.strip())

            combined_text = "\n".join(pages_text).strip()

            # If meaningful text was extracted, return it
            if len(combined_text) >= 20:
                truncated = combined_text[:MAX_EXTRACTED_CHARS]
                if len(combined_text) > MAX_EXTRACTED_CHARS:
                    truncated += "\n[...content truncated for brevity]"
                return {
                    "filename": filename,
                    "content_type": "application/pdf",
                    "extracted_text": truncated,
                    "status": "success",
                    "method": "pdf_direct",
                }

            # If PDF contains no extractable text, it may be a scanned document wrapped in PDF
            return {
                "filename": filename,
                "content_type": "application/pdf",
                "extracted_text": (
                    f"[File: {filename} - Scanned PDF without embedded text layer. "
                    "Recommend OCR scanning or reviewing original scan.]"
                ),
                "status": "fallback",
                "method": "pdf_scanned_fallback",
            }
        except Exception as exc:
            logger.warning(f"PDF extraction error for {filename}: {exc}")
            return {
                "filename": filename,
                "content_type": "application/pdf",
                "extracted_text": f"[File: {filename} - PDF unreadable or corrupted]",
                "status": "failed",
                "method": "pdf_direct",
            }

    async def _extract_image(self, file_path: Path, content_type: str, filename: str) -> Dict[str, Any]:
        """Extract text from image scan via Gemini Multimodal Vision OCR."""
        # Read image bytes
        try:
            image_bytes = file_path.read_bytes()
        except Exception as exc:
            return {
                "filename": filename,
                "content_type": content_type,
                "extracted_text": f"[File: {filename} - Could not read image file]",
                "status": "error",
                "method": "none",
            }

        # If Gemini API key is available, use Gemini Multimodal Vision for medical OCR
        if self.api_key:
            try:
                mime_type = content_type if content_type.startswith("image/") else "image/jpeg"
                b64_data = base64.b64encode(image_bytes).decode("utf-8")
                endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent?key={self.api_key}"

                prompt = (
                    "You are a medical OCR engine. Transcribe all visible text, test metrics, values, "
                    "diagnoses, and medications from this scanned medical image/document. "
                    "Return ONLY the clean transcribed clinical facts and data without introductory conversational remarks."
                )

                payload = {
                    "contents": [
                        {
                            "role": "user",
                            "parts": [
                                {
                                    "inline_data": {
                                        "mime_type": mime_type,
                                        "data": b64_data,
                                    }
                                },
                                {"text": prompt},
                            ],
                        }
                    ],
                    "generationConfig": {
                        "temperature": 0.1,
                        "maxOutputTokens": 500,
                    },
                }

                async with httpx.AsyncClient(timeout=15.0) as client:
                    resp = await client.post(
                        endpoint,
                        json=payload,
                        headers={"Content-Type": "application/json"},
                    )

                    if resp.status_code == 200:
                        res_json = resp.json()
                        candidates = res_json.get("candidates", [])
                        if candidates:
                            parts = candidates[0].get("content", {}).get("parts", [])
                            if parts:
                                ocr_text = parts[0].get("text", "").strip()
                                if ocr_text:
                                    truncated = ocr_text[:MAX_EXTRACTED_CHARS]
                                    return {
                                        "filename": filename,
                                        "content_type": content_type,
                                        "extracted_text": truncated,
                                        "status": "success",
                                        "method": "gemini_ocr",
                                    }
            except Exception as exc:
                logger.warning(f"Gemini OCR call failed for {filename}: {exc}")

        # Graceful fallback when OCR service is unavailable or key not configured
        return {
            "filename": filename,
            "content_type": content_type,
            "extracted_text": (
                f"[File: {filename} - Image scan on file. "
                "Automated OCR text extraction unavailable; doctor should review image directly.]"
            ),
            "status": "fallback",
            "method": "image_fallback",
        }


# Singleton service instance
document_extractor_service = DocumentExtractorService()
