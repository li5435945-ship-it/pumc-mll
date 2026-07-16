"""AI-powered endpoints: review, recommend, chat (SSE), history."""

import json
import re
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, Integer

from app.db import get_db
from app.models import (
    User, Course, Chapter, Question, AnswerRecord, ChapterAttempt, ChatMessage, ChatSession, AiReview,
)
from app.api.deps import get_current_user
from app.schemas import ApiResponse
from app.schemas.ai import (
    ReviewRequest, ReviewResponse,
    RecommendRequest, RecommendResponse,
    ChatRequest, ChatMessageOut,
)
from app.services.llm_service import get_llm_service
from app.services.rag_service import retrieve_for_chapter

router = APIRouter(prefix="/ai", tags=["AI"])


# ── helpers ────────────────────────────────────────────────────────


async def _get_chapter_with_course(chapter_id: int, db: AsyncSession) -> tuple[Chapter, Course]:
    """Fetch chapter and its parent course, or raise 404."""
    result = await db.execute(
        select(Chapter).where(Chapter.id == chapter_id)
    )
    chapter = result.scalar_one_or_none()
    if not chapter:
        raise HTTPException(status_code=404, detail="章节不存在")

    result = await db.execute(
        select(Course).where(Course.id == chapter.course_id)
    )
    course = result.scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=404, detail="课程不存在")

    # Check if course is published (student-facing endpoint)
    if course.status != "published":
        raise HTTPException(status_code=404, detail="章节不存在")

    return chapter, course


async def _build_answer_summary(
    user: User, chapter_id: int, db: AsyncSession
) -> tuple[str, int, int, int, list[dict]]:
    """Build a text summary of the user's LATEST attempt for a chapter.

    Returns (summary_text, total, correct, wrong, wrong_details).
    """
    # Get chapter name
    chapter_result = await db.execute(select(Chapter).where(Chapter.id == chapter_id))
    chapter_row = chapter_result.scalar_one_or_none()
    chapter_name = chapter_row.name if chapter_row else f"章节{chapter_id}"

    # Get the latest submitted attempt
    attempt_result = await db.execute(
        select(ChapterAttempt)
        .where(
            and_(
                ChapterAttempt.user_id == user.id,
                ChapterAttempt.chapter_id == chapter_id,
                ChapterAttempt.status == "submitted",
            )
        )
        .order_by(ChapterAttempt.id.desc())
        .limit(1)
    )
    attempt = attempt_result.scalar_one_or_none()

    if not attempt:
        return "尚未完成答题", 0, 0, 0, []

    # Use attempt stats directly
    total = attempt.correct_count + attempt.wrong_count
    correct = attempt.correct_count
    wrong = attempt.wrong_count
    accuracy = round(attempt.accuracy_rate * 100, 1)
    duration = attempt.duration_seconds or 0
    avg_time = round(duration / total, 1) if total > 0 else 0

    # Get wrong question details from this attempt
    wrong_details: list[dict] = []
    if wrong > 0:
        wrong_result = await db.execute(
            select(Question, AnswerRecord)
            .join(AnswerRecord, AnswerRecord.question_id == Question.id)
            .where(
                and_(
                    AnswerRecord.attempt_id == attempt.id,
                    AnswerRecord.is_correct == False,  # noqa: E712
                )
            )
            .order_by(Question.sort_order, Question.id)
        )
        for q, ar in wrong_result.all():
            wrong_details.append({
                "question": q.content,
                "correct_answer": q.correct_answer,
                "user_answer": ar.selected_answer,
                "explanation": q.explanation or "",
            })

    # Build text summary
    lines = [
        f"章节: {chapter_name}",
        f"总题数: {total}",
        f"正确: {correct}",
        f"错误: {wrong}",
        f"正确率: {accuracy}%",
        f"用时: {duration}秒",
        f"平均每题: {avg_time}秒",
    ]
    if wrong_details:
        lines.append("\n错题详情:")
        for i, wd in enumerate(wrong_details, 1):
            lines.append(
                f"{i}. {wd['question']}\n"
                f"   正确答案: {wd['correct_answer']}  你的答案: {wd['user_answer']}\n"
                f"   解析: {wd['explanation']}"
            )

    summary = "\n".join(lines)
    return summary, total, correct, wrong, wrong_details


# ── 1. POST /ai/review ────────────────────────────────────────────


@router.post("/review", response_model=ApiResponse[ReviewResponse])
async def ai_review(
    body: ReviewRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate an AI review after finishing a chapter, or return saved review."""
    chapter, course = await _get_chapter_with_course(body.chapter_id, db)

    if not course.review_prompt:
        raise HTTPException(status_code=400, detail="该课程未配置 review 提示词")

    # Get the latest submitted attempt
    attempt_result = await db.execute(
        select(ChapterAttempt)
        .where(
            and_(
                ChapterAttempt.user_id == current_user.id,
                ChapterAttempt.chapter_id == body.chapter_id,
                ChapterAttempt.status == "submitted",
            )
        )
        .order_by(ChapterAttempt.id.desc())
        .limit(1)
    )
    attempt = attempt_result.scalar_one_or_none()

    # Check if review already exists for this attempt
    if attempt:
        existing_review = await db.execute(
            select(AiReview)
            .where(AiReview.attempt_id == attempt.id)
            .order_by(AiReview.id.desc())
            .limit(1)
        )
        saved_review = existing_review.scalar_one_or_none()
        if saved_review:
            return ApiResponse(data=ReviewResponse(review=saved_review.content))

    # Build answer summary
    summary, *_ = await _build_answer_summary(current_user, body.chapter_id, db)

    # RAG context (if enabled)
    context_parts: list[str] = []
    if chapter.rag_enabled:
        rag_chunks = await retrieve_for_chapter(
            chapter_id=body.chapter_id,
            query=summary[:200],
            db=db,
        )
        if rag_chunks:
            context_parts.append("参考文档:\n" + "\n---\n".join(rag_chunks))

    # Assemble messages
    system_prompt = course.review_prompt
    if context_parts:
        system_prompt = "\n\n".join(context_parts) + "\n\n" + system_prompt

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": summary},
    ]

    review_text = await get_llm_service().chat(messages)

    # Save review to database
    if attempt:
        ai_review = AiReview(
            attempt_id=attempt.id,
            content=review_text,
            rag_used=len(context_parts) > 0,
            model="deepseek-chat",
        )
        db.add(ai_review)
        await db.flush()

    return ApiResponse(data=ReviewResponse(review=review_text))


# ── 2. POST /ai/recommend ─────────────────────────────────────────


@router.post("/recommend", response_model=ApiResponse[RecommendResponse])
async def ai_recommend(
    body: RecommendRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Recommend 3 practice questions based on student's latest attempt."""
    chapter, course = await _get_chapter_with_course(body.chapter_id, db)

    if not course.recommend_prompt:
        raise HTTPException(status_code=400, detail="该课程未配置 recommend 提示词")

    # Get the latest attempt summary
    summary_text, total, correct, wrong, wrong_details = await _build_answer_summary(
        current_user, body.chapter_id, db
    )

    # Build context with student performance
    context_parts = [
        f"章节名称: {chapter.name}",
        f"学生答题情况:\n{summary_text}",
    ]

    if wrong_details:
        context_parts.append("\n学生错题知识点:")
        for wd in wrong_details:
            context_parts.append(f"- {wd['question']} (正确答案: {wd['correct_answer']})")

    context = "\n".join(context_parts)

    # Add instruction to generate exactly 3 questions
    instruction = "\n\n请根据以上学生的学习情况，推荐3个针对性的练习问题。每行一个问题，不要编号，直接输出问题内容。"

    messages = [
        {"role": "system", "content": course.recommend_prompt},
        {"role": "user", "content": context + instruction},
    ]

    raw = await get_llm_service().chat(messages)

    # Parse the response into a list of questions
    questions: list[str] = []
    for line in raw.strip().splitlines():
        line = line.strip()
        if not line:
            continue
        # Strip common list prefixes
        cleaned = re.sub(r"^(\d+[\.\)]\s*|[-*]\s*)", "", line)
        if cleaned and len(cleaned) > 5:  # Filter out too short lines
            questions.append(cleaned)

    return ApiResponse(data=RecommendResponse(questions=questions[:3]))


# ── 3. POST /ai/chat (SSE streaming) ──────────────────────────────


@router.post("/chat")
async def ai_chat(
    body: ChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Streaming chat with AI. Returns Server-Sent Events."""
    chapter, course = await _get_chapter_with_course(body.chapter_id, db)

    if not course.chat_prompt:
        raise HTTPException(status_code=400, detail="该课程未配置 reply 提示词")

    # Get or create chat session
    session_result = await db.execute(
        select(ChatSession).where(
            ChatSession.user_id == current_user.id,
            ChatSession.chapter_id == body.chapter_id,
        ).order_by(ChatSession.id.desc()).limit(1)
    )
    session = session_result.scalar_one_or_none()
    if not session:
        session = ChatSession(user_id=current_user.id, chapter_id=body.chapter_id)
        db.add(session)
        await db.flush()

    # Save user message
    user_msg = ChatMessage(
        session_id=session.id,
        role="user",
        content=body.message,
        rag_used=False,
    )
    db.add(user_msg)
    await db.flush()

    # RAG context
    rag_used = False
    context_parts: list[str] = []
    if chapter.rag_enabled:
        rag_chunks = await retrieve_for_chapter(
            chapter_id=body.chapter_id,
            query=body.message,
            db=db,
        )
        if rag_chunks:
            rag_used = True
            context_parts.append("参考文档:\n" + "\n---\n".join(rag_chunks))

    # Mark user message rag_used
    if rag_used:
        user_msg.rag_used = True

    # Fetch recent chat history for context (last 20 messages)
    history_result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.session_id == session.id)
        .order_by(ChatMessage.id.desc())
        .limit(20)
    )
    recent_messages = list(reversed(history_result.scalars().all()))

    # Assemble LLM messages
    system_prompt = course.chat_prompt
    if context_parts:
        system_prompt = "\n\n".join(context_parts) + "\n\n" + system_prompt

    llm_messages: list[dict[str, str]] = [
        {"role": "system", "content": system_prompt},
    ]
    for msg in recent_messages:
        llm_messages.append({"role": msg.role, "content": msg.content})

    # Prepare a placeholder assistant message to save after streaming
    collected_chunks: list[str] = []

    async def event_stream():
        """Generate SSE events and save the full response when done."""
        try:
            async for chunk in get_llm_service().stream_chat(llm_messages):
                collected_chunks.append(chunk)
                # SSE format: data: <json>\n\n
                yield f"data: {json.dumps({'text': chunk}, ensure_ascii=False)}\n\n"

            # Stream ended — save assistant message
            full_response = "".join(collected_chunks)
            assistant_msg = ChatMessage(
                session_id=session.id,
                role="assistant",
                content=full_response,
                rag_used=rag_used,
            )
            db.add(assistant_msg)
            await db.flush()

            yield "data: [DONE]\n\n"
        except Exception as exc:
            yield f"data: {json.dumps({'error': str(exc)}, ensure_ascii=False)}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ── 4. GET /ai/history ────────────────────────────────────────────


@router.get("/history", response_model=ApiResponse[list[ChatMessageOut]])
async def ai_history(
    chapter_id: int = Query(..., description="章节ID"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return chat history for a chapter."""
    # Verify chapter exists
    result = await db.execute(select(Chapter).where(Chapter.id == chapter_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="章节不存在")

    # Get session for this user and chapter
    session_result = await db.execute(
        select(ChatSession).where(
            ChatSession.user_id == current_user.id,
            ChatSession.chapter_id == chapter_id,
        ).order_by(ChatSession.id.desc()).limit(1)
    )
    session = session_result.scalar_one_or_none()
    if not session:
        return ApiResponse(data=[])

    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.session_id == session.id)
        .order_by(ChatMessage.id)
    )
    messages = result.scalars().all()
    return ApiResponse(data=[ChatMessageOut.model_validate(m) for m in messages])
