"""
FastAPI application entry point.
Mounts routers, CORS, lifecycle hooks, and error handlers.
"""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import check_db_connection
from app.mongodb import connect_mongo, close_mongo, check_mongo_connection
from app.routers import auth, doctor, access_request, profile, record, files, appointments, notifications, admin, abdm
from app.middleware.error_handler import global_exception_handler, http_exception_handler

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown hooks."""
    # Startup
    logger.info("Starting Medikiosk backend...")
    from app.database import init_db
    await init_db()
    if settings.MONGO_ENABLED:
        await connect_mongo()
        logger.info("MongoDB connected.")
    else:
        logger.info("MongoDB is disabled (dev mode).")
    logger.info(f"API docs available at http://localhost:{settings.BACKEND_PORT}/docs")

    yield

    # Shutdown
    logger.info("Shutting down Medikiosk backend...")
    if settings.MONGO_ENABLED:
        await close_mongo()
        logger.info("MongoDB disconnected.")


app = FastAPI(
    title="Medikiosk API",
    description="Backend API for the Medikiosk patient/doctor healthcare platform.",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS — allow both frontends
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.PATIENT_PORTAL_URL,
        settings.DOCTOR_DASHBOARD_URL,
        "http://localhost:5173",
        "http://localhost:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Error handlers
app.add_exception_handler(Exception, global_exception_handler)  # type: ignore
app.add_exception_handler(HTTPException, http_exception_handler)  # type: ignore

# Routers
app.include_router(auth.router)
app.include_router(doctor.router)
app.include_router(access_request.router)
app.include_router(profile.router)
app.include_router(record.router)
app.include_router(files.router)
app.include_router(appointments.router)
app.include_router(notifications.router)
app.include_router(admin.router)
app.include_router(abdm.router)


# Health check
@app.get("/api/health", tags=["System"])
async def health_check():
    """Health check endpoint reporting system, PostgreSQL, and MongoDB statuses."""
    db_status = await check_db_connection()
    mongo_status = await check_mongo_connection()
    is_ok = db_status.get("status") == "connected"

    return {
        "status": "ok" if is_ok else "degraded",
        "service": "health-app-backend",
        "environment": settings.ENVIRONMENT,
        "version": "0.1.0",
        "databases": {
            "relational": db_status,
            "mongodb": mongo_status,
        },
    }
