from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.db import get_db
from app.models import Course, Chapter, Question, AnswerRecord, ChapterAttempt, WrongQuestion, User
from app.api.deps import get_current_user
from app.schemas import ApiResponse
from app.schemas.courses import CourseBrief, CourseDetail, ChapterWithStats

router = APIRouter(prefix="/courses", tags=["课程"])


# ---------- GET /courses  学生端：已发布课程列表 ----------
@router.get("", response_model=ApiResponse[list[CourseBrief]])
async def list_courses(db: AsyncSession = Depends(get_db)):
    # 子查询：每个课程的章节数
    chapter_count_sq = (
        select(
            Chapter.course_id,
            func.count(Chapter.id).label("chapter_count"),
        )
        .group_by(Chapter.course_id)
        .subquery()
    )

    # 子查询：每个课程的题目数
    question_count_sq = (
        select(
            Chapter.course_id,
            func.count(Question.id).label("question_count"),
        )
        .join(Question, Question.chapter_id == Chapter.id)
        .where(Question.is_active == True)
        .group_by(Chapter.course_id)
        .subquery()
    )

    stmt = (
        select(
            Course,
            func.coalesce(chapter_count_sq.c.chapter_count, 0).label("chapter_count"),
            func.coalesce(question_count_sq.c.question_count, 0).label("question_count"),
        )
        .outerjoin(chapter_count_sq, Course.id == chapter_count_sq.c.course_id)
        .outerjoin(question_count_sq, Course.id == question_count_sq.c.course_id)
        .where(Course.status == "published")
        .order_by(Course.id.desc())
    )
    result = await db.execute(stmt)
    rows = result.all()

    items = [
        CourseBrief(
            id=course.id,
            name=course.name,
            cover_url=course.cover_url,
            intro=course.description,
            chapter_count=ch_cnt,
            question_count=q_cnt,
        )
        for course, ch_cnt, q_cnt in rows
    ]
    return ApiResponse(data=items)


# ---------- GET /courses/{course_id}  课程详情 ----------
@router.get("/{course_id}", response_model=ApiResponse[CourseDetail])
async def get_course(course_id: int, db: AsyncSession = Depends(get_db)):
    course = await db.get(Course, course_id)
    if not course or course.status != "published":
        raise HTTPException(status_code=404, detail="课程不存在")

    chapter_count = await db.scalar(
        select(func.count(Chapter.id)).where(Chapter.course_id == course_id)
    )

    return ApiResponse(
        data=CourseDetail(
            id=course.id,
            name=course.name,
            cover_url=course.cover_url,
            intro=course.description or '',
            goals=course.learning_objectives or '',
            chapter_count=chapter_count or 0,
        )
    )


# ---------- GET /courses/{course_id}/chapters  章节 + 做题统计 ----------
@router.get("/{course_id}/chapters", response_model=ApiResponse[list[ChapterWithStats]])
async def list_chapters_with_stats(
    course_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # 确认课程存在且已发布
    course = await db.get(Course, course_id)
    if not course or course.status != "published":
        raise HTTPException(status_code=404, detail="课程不存在")

    user_id = current_user.id

    # 子查询 1: 每章题目数
    question_count_sq = (
        select(
            Question.chapter_id,
            func.count(Question.id).label("question_count"),
        )
        .group_by(Question.chapter_id)
        .subquery()
    )

    # 子查询 2: 每章已答对数量（当前用户）
    correct_count_sq = (
        select(
            ChapterAttempt.chapter_id,
            func.count(AnswerRecord.id).label("correct_count"),
        )
        .join(ChapterAttempt, AnswerRecord.attempt_id == ChapterAttempt.id)
        .where(AnswerRecord.is_correct == True)  # noqa: E712
        .where(ChapterAttempt.user_id == user_id)
        .group_by(ChapterAttempt.chapter_id)
        .subquery()
    )

    # 子查询 3: 每章已答题数（当前用户）
    answered_count_sq = (
        select(
            ChapterAttempt.chapter_id,
            func.count(AnswerRecord.id).label("answered_count"),
        )
        .join(ChapterAttempt, AnswerRecord.attempt_id == ChapterAttempt.id)
        .where(ChapterAttempt.user_id == user_id)
        .group_by(ChapterAttempt.chapter_id)
        .subquery()
    )

    # 子查询 4: 每章错题数（当前用户）
    wrong_count_sq = (
        select(
            WrongQuestion.chapter_id,
            func.count(WrongQuestion.id).label("wrong_count"),
        )
        .where(WrongQuestion.user_id == user_id)
        .group_by(WrongQuestion.chapter_id)
        .subquery()
    )

    # 主查询：拼装
    stmt = (
        select(
            Chapter,
            func.coalesce(question_count_sq.c.question_count, 0).label("question_count"),
            func.coalesce(correct_count_sq.c.correct_count, 0).label("correct_count"),
            func.coalesce(answered_count_sq.c.answered_count, 0).label("answered_count"),
            func.coalesce(wrong_count_sq.c.wrong_count, 0).label("wrong_count"),
        )
        .outerjoin(question_count_sq, Chapter.id == question_count_sq.c.chapter_id)
        .outerjoin(correct_count_sq, Chapter.id == correct_count_sq.c.chapter_id)
        .outerjoin(answered_count_sq, Chapter.id == answered_count_sq.c.chapter_id)
        .outerjoin(wrong_count_sq, Chapter.id == wrong_count_sq.c.chapter_id)
        .where(Chapter.course_id == course_id)
        .order_by(Chapter.sort_order, Chapter.id)
    )
    result = await db.execute(stmt)
    rows = result.all()

    items = []
    for ch, q_count, c_count, a_count, w_count in rows:
        accuracy = round(c_count / a_count, 4) if a_count > 0 else 0.0
        items.append(
            ChapterWithStats(
                id=ch.id,
                name=ch.name,
                sort_order=ch.sort_order,
                rag_enabled=ch.rag_enabled,
                question_count=q_count,
                accuracy_rate=accuracy,
                wrong_count=w_count,
            )
        )

    return ApiResponse(data=items)
