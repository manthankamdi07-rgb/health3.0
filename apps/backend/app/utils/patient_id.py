"""
Unique patient ID generator.

Format: HLT-XXXXXX (6 uppercase alphanumeric characters).
The ID is permanent — never reused, never changed.
"""

import random
import string
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.user import PatientProfile


def _generate_random_id() -> str:
    """Generate a random 6-character alphanumeric string."""
    chars = string.ascii_uppercase + string.digits
    random_part = "".join(random.choices(chars, k=6))
    return f"HLT-{random_part}"


async def generate_patient_id(db: AsyncSession) -> str:
    """
    Generate a unique patient ID, checking for collisions against the database.

    Tries up to 10 times to avoid an unlikely collision. In practice,
    with 36^6 = ~2.2 billion possible IDs, collisions are extremely rare.

    Args:
        db: Async database session.

    Returns:
        A unique patient ID string like 'HLT-A3K9X2'.

    Raises:
        RuntimeError: If a unique ID cannot be generated after 10 attempts.
    """
    for _ in range(10):
        candidate = _generate_random_id()
        result = await db.execute(
            select(PatientProfile).where(PatientProfile.patient_id == candidate)
        )
        if result.scalar_one_or_none() is None:
            return candidate

    raise RuntimeError("Failed to generate a unique patient ID after 10 attempts")
