"""
Unified database module.
Switches between PostgreSQL and SQLite based on USE_SQLITE environment variable.
"""
import os

USE_SQLITE = os.environ.get("USE_SQLITE", "0") == "1"

if USE_SQLITE:
    from app.database_sqlite import engine, async_session, Base, get_db, init_db
else:
    from app.database import engine, async_session, Base, get_db

    async def init_db():
        """No-op for PostgreSQL (tables created via Alembic)."""
        pass
