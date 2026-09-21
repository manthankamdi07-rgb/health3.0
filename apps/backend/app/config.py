"""
Application configuration — loads environment variables.
"""

import os
from pathlib import Path
from pydantic_settings import BaseSettings
from pydantic import model_validator
from functools import lru_cache

# Resolve paths to locate .env reliably
BASE_DIR = Path(__file__).resolve().parent.parent  # apps/backend
REPO_ROOT = BASE_DIR.parent.parent  # health repo root
ENV_FILES = [
    str(REPO_ROOT / ".env"),
    str(BASE_DIR / ".env"),
    ".env",
    "../../.env",
]


class Settings(BaseSettings):
    """Application settings loaded from environment variables or .env file."""

    # Environment
    ENVIRONMENT: str = "development"  # development, staging, production

    # Database — PostgreSQL with asyncpg (default fallback to SQLite for local development)
    DATABASE_URL: str = "sqlite+aiosqlite:///./health_db.sqlite"

    # MongoDB — for flexible medical records/notes
    MONGO_URI: str = "mongodb://localhost:27017"
    MONGO_DB_NAME: str = "health_db"
    MONGO_ENABLED: bool = False  # Set to True when MongoDB instance is active

    # JWT Authentication
    JWT_SECRET: str = "dev-secret-key-do-not-use-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 1440  # 24 hours

    # Server configuration
    BACKEND_HOST: str = "0.0.0.0"
    BACKEND_PORT: int = 8000

    # CORS — frontend client origins
    PATIENT_PORTAL_URL: str = "http://localhost:5173"
    DOCTOR_DASHBOARD_URL: str = "http://localhost:5174"

    # File Storage
    UPLOAD_DIR: str = "uploads"
    MAX_UPLOAD_SIZE_BYTES: int = 15 * 1024 * 1024  # 15 MB

    # AI Pre-Consultation Summary (Gemini API)
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.0-flash"

    # ABDM Sandbox & Integration (Health 4.0 Part A)
    ABDM_ENV: str = "sandbox"
    ABDM_GATEWAY_URL: str = "https://dev.abdm.gov.in/gateway"
    ABDM_CLIENT_ID: str = ""
    ABDM_CLIENT_SECRET: str = ""
    ABDM_HIP_ID: str = "MEDIKIOSK_HIP_01"
    ABDM_MOCK_MODE: bool = True  # Defaults to sandbox mock when credentials are empty

    @model_validator(mode="after")
    def validate_production_secrets(self) -> "Settings":
        """Ensure default placeholder secrets are not used in production."""
        if self.ENVIRONMENT.lower() == "production":
            if "dev-secret" in self.JWT_SECRET or len(self.JWT_SECRET) < 32:
                raise ValueError(
                    "JWT_SECRET must be set to a secure, random string (min 32 chars) in production!"
                )
            if self.DATABASE_URL.startswith("sqlite"):
                raise ValueError(
                    "PostgreSQL (postgresql+asyncpg://) must be configured for DATABASE_URL in production!"
                )
        return self

    model_config = {
        "env_file": tuple(ENV_FILES),
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }


@lru_cache()
def get_settings() -> Settings:
    """Return cached settings instance."""
    return Settings()
