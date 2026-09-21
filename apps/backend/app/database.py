"""
SQLAlchemy async engine and session factory for PostgreSQL.
"""

import logging
from typing import Any, AsyncGenerator
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Engine configuration depending on DB dialect
is_sqlite = settings.DATABASE_URL.startswith("sqlite")

connect_args: dict[str, Any] = {}
engine_kwargs: dict[str, Any] = {"echo": False}

if is_sqlite:
    connect_args["check_same_thread"] = False
else:
    # PostgreSQL connection pool settings
    engine_kwargs.update({
        "pool_size": 10,
        "max_overflow": 20,
        "pool_pre_ping": True,
        "pool_recycle": 1800,
    })

engine = create_async_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    **engine_kwargs,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy models."""
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency — yields an async DB session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


async def check_db_connection() -> dict:
    """Check connectivity to the primary relational database."""
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
            dialect = "sqlite" if is_sqlite else "postgresql"
            return {"status": "connected", "dialect": dialect}
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        return {"status": "error", "error": str(e)}


async def init_db():
    """Ensure all tables and columns are created (SQLite auto-migration support)."""
    import app.models  # noqa: F401
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        if is_sqlite:
            res = await conn.execute(text("PRAGMA table_info(patient_profiles)"))
            cols = [row[1] for row in res.fetchall()]
            if "abha_number" not in cols:
                await conn.execute(text("ALTER TABLE patient_profiles ADD COLUMN abha_number VARCHAR(20)"))
            if "abha_address" not in cols:
                await conn.execute(text("ALTER TABLE patient_profiles ADD COLUMN abha_address VARCHAR(100)"))
            if "abha_status" not in cols:
                await conn.execute(text("ALTER TABLE patient_profiles ADD COLUMN abha_status VARCHAR(20) DEFAULT 'UNLINKED'"))
            if "abha_profile_json" not in cols:
                await conn.execute(text("ALTER TABLE patient_profiles ADD COLUMN abha_profile_json TEXT"))

            # Appointments table migrations for Red-Flag Triage
            appt_res = await conn.execute(text("PRAGMA table_info(appointments)"))
            appt_cols = [row[1] for row in appt_res.fetchall()]
            if "is_emergency" not in appt_cols:
                await conn.execute(text("ALTER TABLE appointments ADD COLUMN is_emergency BOOLEAN DEFAULT 0"))
            if "triage_level" not in appt_cols:
                await conn.execute(text("ALTER TABLE appointments ADD COLUMN triage_level VARCHAR(20) DEFAULT 'ROUTINE'"))
            if "red_flags" not in appt_cols:
                await conn.execute(text("ALTER TABLE appointments ADD COLUMN red_flags TEXT"))

            # Medical files table migrations for Document Digitization
            file_res = await conn.execute(text("PRAGMA table_info(medical_files)"))
            file_cols = [row[1] for row in file_res.fetchall()]
            if "extracted_text" not in file_cols:
                await conn.execute(text("ALTER TABLE medical_files ADD COLUMN extracted_text TEXT"))
            if "structured_entities" not in file_cols:
                await conn.execute(text("ALTER TABLE medical_files ADD COLUMN structured_entities TEXT"))
            if "ocr_status" not in file_cols:
                await conn.execute(text("ALTER TABLE medical_files ADD COLUMN ocr_status VARCHAR(32) DEFAULT 'pending'"))

