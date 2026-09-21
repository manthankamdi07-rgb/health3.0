import logging
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

client: AsyncIOMotorClient | None = None
db: AsyncIOMotorDatabase | None = None


async def connect_mongo() -> None:
    """Initialize the MongoDB connection and verify with ping."""
    if not settings.MONGO_ENABLED:
        logger.info("MongoDB is disabled (MONGO_ENABLED=False).")
        return

    global client, db
    try:
        client = AsyncIOMotorClient(
            settings.MONGO_URI,
            serverSelectionTimeoutMS=2000,
        )
        # Verify connection
        await client.admin.command("ping")
        db = client[settings.MONGO_DB_NAME]
        logger.info(f"Connected to MongoDB at {settings.MONGO_URI} (DB: {settings.MONGO_DB_NAME})")
    except Exception as e:
        logger.warning(
            f"Failed to connect to MongoDB ({settings.MONGO_URI}): {e}. "
            "Medical notes and flexible records requiring MongoDB may be disabled."
        )
        db = None


async def close_mongo() -> None:
    """Close the MongoDB connection."""
    global client, db
    if client:
        client.close()
        client = None
        db = None
        logger.info("MongoDB connection closed.")


def get_mongo_db() -> AsyncIOMotorDatabase | None:
    """Return the MongoDB database instance."""
    return db


async def check_mongo_connection() -> dict:
    """Check connectivity to MongoDB."""
    if not settings.MONGO_ENABLED:
        return {"status": "disabled"}
    if client is None:
        return {"status": "disconnected"}
    try:
        await client.admin.command("ping")
        return {"status": "connected", "database": settings.MONGO_DB_NAME}
    except Exception as e:
        return {"status": "error", "error": str(e)}
