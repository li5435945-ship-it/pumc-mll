from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from typing import Optional

from app.db import get_db
from app.models import User, WrongQuestion, Question, Chapter
from app.api.deps import get_current_user
from app.schemas import ApiResponse, PaginatedData
from app.schemas.wrong_questions import WrongQuestionItem

router = APIRouter(prefix="/wrong-questions", tags=["错题本"])


@router.get("", response_model=ApiResponse[PaginatedData[WrongQuestionItem]])
async def list_wrong_questions(
    course_id: Optional[int] = Query(None, description="按课程 ID 过滤"),
    chapter_id: Optional[int] = Query(None, description="按章节 ID 过滤"),
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=1, le=100, description="每页条数"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取当前用户的错题列表，支持按课程/章节过滤，分页返回。"""

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

    # When filtering by course_id we need a join to Chapter
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
