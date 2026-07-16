from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os
import logging

from app.config import get_settings
from app.redis import init_redis, close_redis

# SQLite mode for local testing
USE_SQLITE = os.environ.get("USE_SQLITE", "0") == "1"
if USE_SQLITE:
    import app.database_sqlite as db_module
else:
    import app.database as db_module
from app.api.health import router as health_router
from app.api.auth import router as auth_router
from app.api.courses import router as courses_router
from app.api.quiz import chapters_router as quiz_chapters_router
from app.api.quiz import attempts_router as quiz_attempts_router
from app.api.wrong_questions import router as wrong_questions_router
from app.api.ai import router as ai_router
from app.api.admin.chapter_rag import router as admin_rag_router
from app.api.admin.import_excel import router as admin_import_router
from app.api.admin.students import router as admin_students_router
from app.api.admin.courses import router as admin_courses_router
from app.api.mistakes import router as mistakes_router

settings = get_settings()
logger = logging.getLogger(__name__)

app = FastAPI(
    title="PUMC MLL",
    description="医学教育刷题平台 API",
    version="0.1.0",
    debug=settings.DEBUG,
)

# CORS - allow all origins for now (restrict in production with actual domain)
allowed_origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files (uploads)
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")

# Routers
app.include_router(health_router, prefix="/api")
app.include_router(auth_router, prefix="/api")
app.include_router(courses_router, prefix="/api")
app.include_router(quiz_chapters_router, prefix="/api")
app.include_router(quiz_attempts_router, prefix="/api")
app.include_router(wrong_questions_router, prefix="/api")
app.include_router(ai_router, prefix="/api")
app.include_router(admin_courses_router, prefix="/api")  # Admin courses (must be before rag)
app.include_router(admin_rag_router, prefix="/api")
app.include_router(admin_import_router, prefix="/api")
app.include_router(admin_students_router, prefix="/api")
app.include_router(mistakes_router, prefix="/api")


@app.on_event("startup")
async def startup():
    print(f"[INFO] Starting PUMC MLL API in {settings.ENVIRONMENT} mode")
    print(f"[INFO] Debug mode: {settings.DEBUG}")

    if USE_SQLITE:
        await db_module.init_db()
        print("[OK] SQLite database initialized")

    # Initialize Redis
    try:
        await init_redis()
    except Exception as e:
        print(f"[WARN] Redis connection failed: {e}")
        print("[WARN] Session management will not work")


@app.on_event("shutdown")
async def shutdown():
    await close_redis()


@app.get("/")
async def root():
    return {"message": "PUMC MLL API", "docs": "/docs"}
