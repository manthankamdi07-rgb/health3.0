"""
Index entrypoint for Vercel Python Serverless runtime.
Exposes the FastAPI instance 'app'.
"""

from app.main import app

__all__ = ["app"]
