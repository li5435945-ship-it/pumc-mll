from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, Integer
from datetime import datetime, timezone
from pydantic import BaseModel

from app.db import get_db
from app.models import (
    User,
    Chapter,
    Question,
    AnswerRecord,
    ChapterAttempt,
    WrongQuestion,
    AiReview,
)
from app.api.deps import get_current_user
from app.schemas import ApiResponse
from app.schemas.quiz import (
    QuestionOut,
    AnswerRequest,
    AnswerResponse,
    AttemptStartResponse,
    AttemptSubmitResponse,
    AttemptSummaryResponse,
    AttemptHistoryItem,
)

chapters_router = APIRouter(prefix="/chapters", tags=["刷题"])
attempts_router = APIRouter(prefix="/attempts", tags=["刷题"])


# ── Request schemas for attempt endpoints ──────────────────────────


class AttemptAnswerRequest(BaseModel):
    """Answer submission within an attempt - includes question_id."""
    question_id: int
    selected_answer: str  # A/B/C/D/E


# ── helpers ────────────────────────────────────────────────────────


async def _get_chapter_or_404(chapter_id: int, db: AsyncSession) -> Chapter:
    result = await db.execute(select(Chapter).where(Chapter.id == chapter_id))
    chapter = result.scalar_one_or_none()
    if not chapter:
        raise HTTPException(status_code=404, detail="章节不存在")
    return chapter


async def _get_attempt_or_404(attempt_id: int, db: AsyncSession) -> ChapterAttempt:
    result = await db.execute(
        select(ChapterAttempt).where(ChapterAttempt.id == attempt_id)
    )
    attempt = result.scalar_one_or_none()
    if not attempt:
        raise HTTPException(status_code=404, detail="练习记录不存在")
    return attempt


async def _verify_attempt_owner(attempt: ChapterAttempt, user: User):
    if attempt.user_id != user.id:
        raise HTTPException(status_code=403, detail="无权访问此练习记录")


# ── 1. POST /chapters/{id}/attempts - Start a new attempt ──────────


@chapters_router.post(
    "/{chapter_id}/attempts",
    response_model=ApiResponse[AttemptStartResponse],
)
async def start_attempt(
    chapter_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    chapter = await _get_chapter_or_404(chapter_id, db)

    # Check chapter is open
    now = datetime.now()
    if chapter.open_at is not None:
        open_at = chapter.open_at
        if now < open_at:
            raise HTTPException(status_code=400, detail="章节尚未开放")

    # Create a new attempt (no uniqueness constraint, always creates new)
    attempt = ChapterAttempt(
        user_id=current_user.id,
        chapter_id=chapter_id,
        status="in_progress",
    )
    db.add(attempt)
    await db.flush()
    await db.refresh(attempt)

    return ApiResponse(
        data=AttemptStartResponse(
            attempt_id=attempt.id,
            chapter_id=attempt.chapter_id,
            started_at=attempt.started_at,
        )
    )


# ── 2. GET /attempts/{id}/questions - Get questions for an attempt ─


@attempts_router.get(
    "/{attempt_id}/questions",
    response_model=ApiResponse[list[QuestionOut]],
)
async def get_attempt_questions(
    attempt_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    attempt = await _get_attempt_or_404(attempt_id, db)
    await _verify_attempt_owner(attempt, current_user)

    result = await db.execute(
        select(Question)
        .where(
            and_(
                Question.chapter_id == attempt.chapter_id,
                Question.is_active == True,
            )
        )
        .order_by(Question.sort_order, Question.id)
    )
    questions = result.scalars().all()
    # QuestionOut does not include correct_answer
    return ApiResponse(data=[QuestionOut.model_validate(q) for q in questions])


# ── 3. POST /attempts/{id}/answers - Submit an answer ──────────────


@attempts_router.post(
    "/{attempt_id}/answers",
    response_model=ApiResponse[AnswerResponse],
)
async def submit_attempt_answer(
    attempt_id: int,
    body: AttemptAnswerRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    attempt = await _get_attempt_or_404(attempt_id, db)
    await _verify_attempt_owner(attempt, current_user)

    if attempt.status != "in_progress":
        raise HTTPException(status_code=400, detail="该次练习已提交，无法继续作答")

    selected = body.selected_answer.upper().strip()
    if selected not in ("A", "B", "C", "D", "E"):
        raise HTTPException(status_code=400, detail="答案选项无效，须为 A/B/C/D/E")

    # Fetch question
    result = await db.execute(
        select(Question).where(Question.id == body.question_id)
    )
    question = result.scalar_one_or_none()
    if not question:
        raise HTTPException(status_code=404, detail="题目不存在")

    # Verify question belongs to the same chapter
    if question.chapter_id != attempt.chapter_id:
        raise HTTPException(status_code=400, detail="题目不属于当前章节")

    is_correct = selected == question.correct_answer

    # Check if already answered in this attempt
    result = await db.execute(
        select(AnswerRecord).where(
            and_(
                AnswerRecord.attempt_id == attempt_id,
                AnswerRecord.question_id == body.question_id,
            )
        )
    )
    existing = result.scalar_one_or_none()

    if existing:
        # Update existing answer within this attempt
        existing.selected_answer = selected
        existing.is_correct = is_correct
        existing.answered_at = datetime.now()
    else:
        # Create new answer record
        record = AnswerRecord(
            attempt_id=attempt_id,
            user_id=current_user.id,
            question_id=body.question_id,
            selected_answer=selected,
            is_correct=is_correct,
        )
        db.add(record)

    # Manage wrong_questions
    wrong_count = 0
    if not is_correct:
        result = await db.execute(
            select(WrongQuestion).where(
                and_(
                    WrongQuestion.user_id == current_user.id,
                    WrongQuestion.question_id == body.question_id,
                )
            )
        )
        wq = result.scalar_one_or_none()
        if wq:
            wq.wrong_count += 1
            wq.last_wrong_at = datetime.now()
            wq.attempt_id = attempt_id
            wrong_count = wq.wrong_count
        else:
            wq = WrongQuestion(
                user_id=current_user.id,
                question_id=body.question_id,
                chapter_id=question.chapter_id,
                attempt_id=attempt_id,
                wrong_count=1,
            )
            db.add(wq)
            wrong_count = 1
    else:
        # Correct answer: remove from wrong_questions if present
        result = await db.execute(
            select(WrongQuestion).where(
                and_(
                    WrongQuestion.user_id == current_user.id,
                    WrongQuestion.question_id == body.question_id,
                )
            )
        )
        wq = result.scalar_one_or_none()
        if wq:
            await db.delete(wq)

    return ApiResponse(
        data=AnswerResponse(
            is_correct=is_correct,
            correct_answer=question.correct_answer,
            explanation=question.explanation,
            wrong_count=wrong_count,
        )
    )


# ── 4. POST /attempts/{id}/submit - Submit the attempt ─────────────


@attempts_router.post(
    "/{attempt_id}/submit",
    response_model=ApiResponse[AttemptSubmitResponse],
)
async def submit_attempt(
    attempt_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    attempt = await _get_attempt_or_404(attempt_id, db)
    await _verify_attempt_owner(attempt, current_user)

    if attempt.status != "in_progress":
        raise HTTPException(status_code=400, detail="该次练习已提交")

    # Count total questions in chapter
    total_result = await db.execute(
        select(func.count())
        .select_from(Question)
        .where(
            and_(
                Question.chapter_id == attempt.chapter_id,
                Question.is_active == True,
            )
        )
    )
    total_questions = total_result.scalar() or 0

    # Count answered & correct for this attempt
    answer_result = await db.execute(
        select(
            func.count().label("answered"),
            func.sum(func.cast(AnswerRecord.is_correct, Integer)).label("correct"),
        ).where(AnswerRecord.attempt_id == attempt_id)
    )
    row = answer_result.one()
    answered = row.answered or 0
    correct = int(row.correct or 0)
    wrong = answered - correct
    accuracy = round(correct / answered, 4) if answered > 0 else 0.0

    # Duration - use local time to match PostgreSQL's now()
    now = datetime.now()
    started = attempt.started_at
    duration = int((now - started).total_seconds())
    if duration < 0:
        duration = 0

    # Update attempt
    attempt.submitted_at = now
    attempt.duration_seconds = duration
    attempt.correct_count = correct
    attempt.wrong_count = wrong
    attempt.accuracy_rate = accuracy
    attempt.status = "submitted"

    return ApiResponse(
        data=AttemptSubmitResponse(
            attempt_id=attempt.id,
            chapter_id=attempt.chapter_id,
            total_questions=total_questions,
            answered=answered,
            correct_count=correct,
            wrong_count=wrong,
            accuracy_rate=accuracy,
            duration_seconds=duration,
        )
    )


# ── 5. GET /attempts/{id}/summary - Get attempt summary ────────────


@attempts_router.get(
    "/{attempt_id}/summary",
    response_model=ApiResponse[AttemptSummaryResponse],
)
async def get_attempt_summary(
    attempt_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    attempt = await _get_attempt_or_404(attempt_id, db)
    await _verify_attempt_owner(attempt, current_user)

    # Count total questions in chapter
    total_result = await db.execute(
        select(func.count())
        .select_from(Question)
        .where(
            and_(
                Question.chapter_id == attempt.chapter_id,
                Question.is_active == True,
            )
        )
    )
    total_questions = total_result.scalar() or 0

    # Count answered for this attempt
    answer_result = await db.execute(
        select(
            func.count().label("answered"),
            func.sum(func.cast(AnswerRecord.is_correct, Integer)).label("correct"),
        ).where(AnswerRecord.attempt_id == attempt_id)
    )
    row = answer_result.one()
    answered = row.answered or 0
    correct = int(row.correct or 0)
    wrong = answered - correct
    accuracy = round(correct / answered, 4) if answered > 0 else 0.0

    return ApiResponse(
        data=AttemptSummaryResponse(
            attempt_id=attempt.id,
            chapter_id=attempt.chapter_id,
            status=attempt.status,
            total_questions=total_questions,
            answered=answered,
            correct_count=correct,
            wrong_count=wrong,
            accuracy_rate=accuracy,
            duration_seconds=attempt.duration_seconds,
            started_at=attempt.started_at,
            submitted_at=attempt.submitted_at,
        )
    )


# ── 6. GET /chapters/{id}/attempts - Get user's attempts for a chapter


@chapters_router.get(
    "/{chapter_id}/attempts",
    response_model=ApiResponse[list[AttemptHistoryItem]],
)
async def get_chapter_attempts(
    chapter_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_chapter_or_404(chapter_id, db)

    result = await db.execute(
        select(ChapterAttempt)
        .where(
            and_(
                ChapterAttempt.user_id == current_user.id,
                ChapterAttempt.chapter_id == chapter_id,
            )
        )
        .order_by(ChapterAttempt.started_at.desc())
    )
    attempts = result.scalars().all()

    return ApiResponse(
        data=[
            AttemptHistoryItem(
                attempt_id=a.id,
                chapter_id=a.chapter_id,
                status=a.status,
                correct_count=a.correct_count,
                wrong_count=a.wrong_count,
                accuracy_rate=a.accuracy_rate,
                duration_seconds=a.duration_seconds,
                started_at=a.started_at,
                submitted_at=a.submitted_at,
            )
            for a in attempts
        ]
    )


# ── 7. GET /attempts/{id}/details - Get attempt details with answers ─


@attempts_router.get(
    "/{attempt_id}/details",
    response_model=ApiResponse[dict],
)
async def get_attempt_details(
    attempt_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get attempt details with all answers for viewing."""
    attempt = await _get_attempt_or_404(attempt_id, db)
    await _verify_attempt_owner(attempt, current_user)

    # Get all answers for this attempt
    answers_result = await db.execute(
        select(AnswerRecord, Question)
        .join(Question, AnswerRecord.question_id == Question.id)
        .where(AnswerRecord.attempt_id == attempt_id)
        .order_by(Question.sort_order, Question.id)
    )
    answers = []
    for ar, q in answers_result.all():
        answers.append({
            "question_id": q.id,
            "content": q.content,
            "option_a": q.option_a,
            "option_b": q.option_b,
            "option_c": q.option_c,
            "option_d": q.option_d,
            "option_e": q.option_e,
            "selected_answer": ar.selected_answer,
            "correct_answer": q.correct_answer,
            "is_correct": ar.is_correct,
            "explanation": q.explanation,
        })

    # Get AI review if exists
    review_result = await db.execute(
        select(AiReview)
        .where(AiReview.attempt_id == attempt_id)
        .order_by(AiReview.id.desc())
        .limit(1)
    )
    review = review_result.scalar_one_or_none()

    return ApiResponse(data={
        "attempt_id": attempt.id,
        "chapter_id": attempt.chapter_id,
        "total_questions": attempt.correct_count + attempt.wrong_count,
        "correct_count": attempt.correct_count,
        "wrong_count": attempt.wrong_count,
        "accuracy_rate": attempt.accuracy_rate,
        "duration_seconds": attempt.duration_seconds,
        "started_at": attempt.started_at.isoformat() if attempt.started_at else None,
        "submitted_at": attempt.submitted_at.isoformat() if attempt.submitted_at else None,
        "answers": answers,
        "ai_review": review.content if review else None,
    })
