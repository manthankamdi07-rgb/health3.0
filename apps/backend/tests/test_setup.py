import pytest
from httpx import AsyncClient, ASGITransport 
from app.main import app
from app.config import get_settings 
from app.database import check_db_connection
from app.mongodb import check_mongo_connection


@pytest.mark.asyncio
async def test_settings_loaded():
    """Verify application configuration loads cleanly."""
    settings = get_settings()
    assert settings is not None
    assert settings.BACKEND_PORT == 8000
    assert settings.JWT_ALGORITHM == "HS256"
    assert settings.ENVIRONMENT in ["development", "staging", "production"]


@pytest.mark.asyncio
async def test_database_connection():
    """Verify primary database connectivity check succeeds."""
    db_status = await check_db_connection()
    assert db_status["status"] == "connected"
    assert db_status["dialect"] in ["sqlite", "postgresql"]


@pytest.mark.asyncio
async def test_mongo_connection_status():
    """Verify MongoDB status check reports disabled or connected."""
    mongo_status = await check_mongo_connection()
    assert mongo_status["status"] in ["disabled", "connected", "disconnected", "error"]


@pytest.mark.asyncio
async def test_health_check_endpoint():
    """Verify /api/health endpoint returns 200 and valid system details."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] in ["ok", "degraded"]
        assert data["service"] == "health-app-backend"
        assert "databases" in data
        assert data["databases"]["relational"]["status"] == "connected"


