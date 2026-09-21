"""
Global exception handler middleware.
"""

import logging
from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)


async def global_exception_handler(request: Request, exc: Exception):
    """
    Catch unhandled exceptions and return a clean JSON error response.
    Prevents stack traces from leaking to the client.
    """
    logger.error(f"Unhandled exception on {request.method} {request.url}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "message": "An internal server error occurred.",
            "detail": str(exc) if logger.isEnabledFor(logging.DEBUG) else None,
        },
    )


async def http_exception_handler(request: Request, exc: HTTPException):
    """
    Handle FastAPI HTTPExceptions with a consistent JSON format.
    """
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "message": exc.detail,
            "detail": exc.detail,
        },
    )
