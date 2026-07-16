"""Admin Courses API - CRUD + Prompt configuration."""
import os
import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.config import get_settings
from app.db import get_db
from app.models import User, Course, Chapter, Question, Document
from app.api.deps import get_admin_user
from app.schemas import ApiResponse

settings = get_settings()

# Allowed image extensions for cover upload
COVER_ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}

router = APIRouter(prefix="/admin", tags=["管理后台-课程"])


class CourseOut:
    pass


# ── 1. GET /admin/courses ─────────────────────────────────────────

@router.get("/courses", response_model=ApiResponse[list[dict]])
async def list_courses(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """List all courses (admin view)."""
    result = await db.execute(select(Course).order_by(Course.id))
    courses = result.scalars().all()
    return ApiResponse(data=[
        {
            "id": c.id,
            "name": c.name,
            "cover_url": c.cover_url,
            "intro": c.description,
            "status": c.status,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        }
        for c in courses
    ])


# ── 2. POST /admin/courses ────────────────────────────────────────

@router.post("/courses", response_model=ApiResponse[dict])
async def create_course(
    body: dict,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Create a new course."""
    course = Course(
        name=body.get("name", ""),
        description=body.get("intro"),
        learning_objectives=body.get("goals"),
        status="draft",
    )
    db.add(course)
    await db.flush()
    await db.refresh(course)
    return ApiResponse(data={"id": course.id, "name": course.name})


# ── 3. GET /admin/courses/{id} ────────────────────────────────────

@router.get("/courses/{course_id}", response_model=ApiResponse[dict])
async def get_course(
    course_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Get course detail with prompts."""
    result = await db.execute(select(Course).where(Course.id == course_id))
    course = result.scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=404, detail="课程不存在")
    return ApiResponse(data={
        "id": course.id,
        "name": course.name,
        "cover_url": course.cover_url,
        "intro": course.description or "",
        "goals": course.learning_objectives or "",
        "prompt_review": course.review_prompt or "",
        "prompt_reply": course.chat_prompt or "",
        "prompt_recommend": course.recommend_prompt or "",
        "status": course.status,
        "created_at": course.created_at.isoformat() if course.created_at else None,
        "updated_at": course.updated_at.isoformat() if course.updated_at else None,
    })


# ── 4. PUT /admin/courses/{id} ────────────────────────────────────

@router.put("/courses/{course_id}", response_model=ApiResponse[dict])
async def update_course(
    course_id: int,
    body: dict,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Update course info and prompts."""
    result = await db.execute(select(Course).where(Course.id == course_id))
    course = result.scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=404, detail="课程不存在")

    # Update fields if provided (map frontend names to model names)
    field_mapping = {
        "name": "name",
        "intro": "description",
        "goals": "learning_objectives",
        "prompt_review": "review_prompt",
        "prompt_reply": "chat_prompt",
        "prompt_recommend": "recommend_prompt",
        "status": "status",
    }
    for frontend_field, model_field in field_mapping.items():
        if frontend_field in body:
            setattr(course, model_field, body[frontend_field])

    await db.flush()
    await db.refresh(course)
    return ApiResponse(data={"id": course.id, "name": course.name})


# ── 5. PUT /admin/courses/{id}/prompts ────────────────────────────

class PromptUpdateBody(BaseModel):
    prompt_review: str | None = None
    prompt_reply: str | None = None
    prompt_recommend: str | None = None


@router.put("/courses/{course_id}/prompts", response_model=ApiResponse[dict])
async def update_prompts(
    course_id: int,
    body: PromptUpdateBody,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Update AI prompt configuration for a course."""
    result = await db.execute(select(Course).where(Course.id == course_id))
    course = result.scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=404, detail="课程不存在")

    if body.prompt_review is not None:
        course.review_prompt = body.prompt_review
    if body.prompt_reply is not None:
        course.chat_prompt = body.prompt_reply
    if body.prompt_recommend is not None:
        course.recommend_prompt = body.prompt_recommend

    await db.flush()
    await db.refresh(course)
    return ApiResponse(data={"id": course.id, "name": course.name})


# ── 6. DELETE /admin/courses/{id} ─────────────────────────────────

@router.delete("/courses/{course_id}", response_model=ApiResponse)
async def delete_course(
    course_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Delete a course."""
    result = await db.execute(select(Course).where(Course.id == course_id))
    course = result.scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=404, detail="课程不存在")
    await db.delete(course)
    return ApiResponse(message="课程已删除")


# ── 6. GET /admin/courses/{id}/chapters ───────────────────────────

@router.get("/courses/{course_id}/chapters", response_model=ApiResponse[list[dict]])
async def list_chapters_admin(
    course_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """List all chapters for a course (admin view, with stats)."""
    # Verify course exists
    course_result = await db.execute(select(Course).where(Course.id == course_id))
    course = course_result.scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=404, detail="课程不存在")

    # Subquery: question count per chapter
    question_count_sq = (
        select(
            Question.chapter_id,
            func.count(Question.id).label("question_count"),
        )
        .group_by(Question.chapter_id)
        .subquery()
    )

    # Subquery: ready doc count per chapter
    rag_doc_count_sq = (
        select(
            Document.chapter_id,
            func.count(Document.id).label("rag_doc_count"),
            func.coalesce(func.sum(Document.chunk_count), 0).label("rag_chunk_count"),
        )
        .where(Document.status == "ready")
        .group_by(Document.chapter_id)
        .subquery()
    )

    stmt = (
        select(
            Chapter,
            func.coalesce(question_count_sq.c.question_count, 0).label("question_count"),
            func.coalesce(rag_doc_count_sq.c.rag_doc_count, 0).label("rag_doc_count"),
            func.coalesce(rag_doc_count_sq.c.rag_chunk_count, 0).label("rag_chunk_count"),
        )
        .outerjoin(question_count_sq, Chapter.id == question_count_sq.c.chapter_id)
        .outerjoin(rag_doc_count_sq, Chapter.id == rag_doc_count_sq.c.chapter_id)
        .where(Chapter.course_id == course_id)
        .order_by(Chapter.sort_order, Chapter.id)
    )
    result = await db.execute(stmt)
    rows = result.all()

    return ApiResponse(data=[
        {
            "id": ch.id,
            "name": ch.name,
            "sort_order": ch.sort_order,
            "rag_enabled": ch.rag_enabled,
            "rag_doc_count": doc_count,
            "rag_chunk_count": chunk_count,
            "question_count": q_count,
            "open_at": str(ch.open_at) if ch.open_at else None,
            "created_at": ch.created_at.isoformat() if ch.created_at else None,
        }
        for ch, q_count, doc_count, chunk_count in rows
    ])


# ── 7. POST /admin/courses/{id}/chapters ──────────────────────────

@router.post("/courses/{course_id}/chapters", response_model=ApiResponse[dict])
async def create_chapter(
    course_id: int,
    body: dict,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Create a new chapter under a course."""
    result = await db.execute(select(Course).where(Course.id == course_id))
    course = result.scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=404, detail="课程不存在")

    chapter = Chapter(
        course_id=course_id,
        name=body.get("name", ""),
        sort_order=body.get("sort_order", 0),
        open_at=body.get("open_at"),
        rag_enabled=body.get("rag_enabled", False),
    )
    db.add(chapter)
    await db.flush()
    await db.refresh(chapter)
    return ApiResponse(data={
        "id": chapter.id,
        "course_id": chapter.course_id,
        "name": chapter.name,
        "sort_order": chapter.sort_order,
        "open_at": str(chapter.open_at) if chapter.open_at else None,
        "rag_enabled": chapter.rag_enabled,
        "created_at": chapter.created_at.isoformat() if chapter.created_at else None,
    })


# ── 8. PUT /admin/chapters/{id} ────────────────────────────────────

@router.put("/chapters/{chapter_id}", response_model=ApiResponse[dict])
async def update_chapter(
    chapter_id: int,
    body: dict,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Update a chapter's info (name, sort_order, open_at)."""
    result = await db.execute(select(Chapter).where(Chapter.id == chapter_id))
    chapter = result.scalar_one_or_none()
    if not chapter:
        raise HTTPException(status_code=404, detail="章节不存在")

    # Update fields if provided
    if "name" in body:
        chapter.name = body["name"]
    if "sort_order" in body:
        chapter.sort_order = body["sort_order"]
    if "open_at" in body:
        chapter.open_at = body["open_at"]

    await db.flush()
    await db.refresh(chapter)

    return ApiResponse(data={
        "id": chapter.id,
        "course_id": chapter.course_id,
        "name": chapter.name,
        "sort_order": chapter.sort_order,
        "open_at": str(chapter.open_at) if chapter.open_at else None,
        "rag_enabled": chapter.rag_enabled,
        "created_at": chapter.created_at.isoformat() if chapter.created_at else None,
        "updated_at": chapter.updated_at.isoformat() if chapter.updated_at else None,
    })


# ── 9. POST /admin/courses/{id}/cover ─────────────────────────────

@router.post("/courses/{course_id}/cover", response_model=ApiResponse[dict])
async def upload_cover(
    course_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Upload course cover image."""
    # Check course exists
    result = await db.execute(select(Course).where(Course.id == course_id))
    course = result.scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=404, detail="课程不存在")

    # Validate file extension
    original_filename = file.filename or "unknown"
    ext = os.path.splitext(original_filename)[1].lower()
    if ext not in COVER_ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的图片类型: {ext}，仅支持: {', '.join(COVER_ALLOWED_EXTENSIONS)}",
        )

    # Save file to uploads/covers/ with UUID name
    covers_dir = os.path.join(settings.UPLOAD_DIR, "covers")
    os.makedirs(covers_dir, exist_ok=True)
    safe_name = f"{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(covers_dir, safe_name)

    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    cover_url = f"/uploads/covers/{safe_name}"

    # Update course cover_url
    course.cover_url = cover_url
    await db.flush()
    await db.refresh(course)

    return ApiResponse(data={"url": cover_url})
