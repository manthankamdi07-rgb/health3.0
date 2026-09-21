"""
Pytest configuration — runs before any test file is collected.

Adds the backend root to sys.path so `import app.*` works regardless of
where pytest is invoked from (repo root, apps/backend, or inside the IDE).
"""

import sys
from pathlib import Path

# apps/backend/ — this file lives at apps/backend/conftest.py
BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))
