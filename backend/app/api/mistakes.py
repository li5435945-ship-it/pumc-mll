from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from typing import Optional
from pydantic import BaseModel

from app.db import get_db
from app.models import User, WrongQuestion, Question, Chapter, Course
from app.api.deps import get_current_user
from app.schemas import ApiResponse, PaginatedData
from app.schemas.wrong_questions import WrongQuestionItem

router = APIRouter(prefix="/mistakes", tags=["错题本"])


# ── Schemas ──────────────────────────────────────────────────────────

class MistakeCourseItem(BaseModel):
    """Course summary with wrong question count."""
    course_id: int
    course_name: str
    wrong_count: int


# ── Routes ───────────────────────────────────────────────────────────

@router.get("/courses", response_model=ApiResponse[list[MistakeCourseItem]])
async def list_mistake_courses(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List courses that have wrong questions for the current user.

    Returns: [{course_id, course_name, wrong_count}]
    """
    query = (
        select(
            Course.id.label("course_id"),
            Course.name.label("course_name"),
            func.count(WrongQuestion.id).label("wrong_count"),
        )
        .join(Chapter, Chapter.course_id == Course.id)
        .join(WrongQuestion, WrongQuestion.chapter_id == Chapter.id)
        .where(WrongQuestion.user_id == current_user.id)
        .group_by(Course.id, Course.name)
        .order_by(func.count(WrongQuestion.id).desc())
    )

    result = await db.execute(query)
    rows = result.all()

    items = [
        MistakeCourseItem(
            course_id=row.course_id,
            course_name=row.course_name,
            wrong_count=row.wrong_count,
        )
        for row in rows
    ]

    return ApiResponse(data=items)


@router.get("", response_model=ApiResponse[PaginatedData[WrongQuestionItem]])
async def list_mistakes(
    course_id: Optional[int] = Query(None, description="按课程 ID 过滤"),
    chapter_id: Optional[int] = Query(None, description="按章节 ID 过滤"),
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=1, le=100, description="每页条数"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get wrong questions with optional course/chapter filters.

    Includes question content, options, correct answer, explanation,
    chapter name, wrong_count, and last_wrong_at. Paginated.
    """
    # ── Build base conditions ────────────────────────────────────────
    conditions = [WrongQuestion.user_id == current_user.id]
    if chapter_id is not None:
        conditions.append(WrongQuestion.chapter_id == chapter_id)

    # ── Count total ──────────────────────────────────────────────────
    count_q = (
        select(func.count())
        .select_from(WrongQuestion)
        .where(and_(*conditions))
    )

    if course_id is not None:
        count_q = count_q.join(Chapter, WrongQuestion.chapter_id == Chapter.id).where(
            Chapter.course_id == course_id
        )

    total_result = await db.execute(count_q)
    total = total_result.scalar() or 0

    # ── Fetch page rows with joins ───────────────────────────────────
    query = (
        select(
            WrongQuestion.id,
            WrongQuestion.user_id,
            WrongQuestion.question_id,
            WrongQuestion.chapter_id,
            WrongQuestion.wrong_count,
            WrongQuestion.last_wrong_at,
            Question.content,
            Question.option_a,
            Question.option_b,
            Question.option_c,
            Question.option_d,
            Question.option_e,
            Question.correct_answer,
            Question.explanation,
            Chapter.name.label("chapter_name"),
            Chapter.course_id,
        )
        .join(Question, WrongQuestion.question_id == Question.id)
        .join(Chapter, WrongQuestion.chapter_id == Chapter.id)
        .where(and_(*conditions))
        .order_by(WrongQuestion.last_wrong_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )

    if course_id is not None:
        query = query.where(Chapter.course_id == course_id)

    result = await db.execute(query)
    rows = result.all()

    items = [
        WrongQuestionItem(
            id=row.id,
            user_id=row.user_id,
            question_id=row.question_id,
            chapter_id=row.chapter_id,
            wrong_count=row.wrong_count,
            last_wrong_at=row.last_wrong_at,
            content=row.content,
            option_a=row.option_a,
            option_b=row.option_b,
            option_c=row.option_c,
            option_d=row.option_d,
            option_e=row.option_e,
            correct_answer=row.correct_answer,
            explanation=row.explanation,
            chapter_name=row.chapter_name,
            course_id=row.course_id,
        )
        for row in rows
    ]

    return ApiResponse(
        data=PaginatedData(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
        )
    )
