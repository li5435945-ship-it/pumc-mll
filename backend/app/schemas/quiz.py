from typing import Optional
from datetime import datetime
from pydantic import BaseModel


# ── Question (without correct_answer) ──────────────────────────────


class QuestionOut(BaseModel):
    id: int
    chapter_id: int
    content: str
    option_a: str
    option_b: str
    option_c: str
    option_d: str
    option_e: Optional[str] = None
    sort_order: int = 0

    model_config = {"from_attributes": True}


# ── Answer submission ──────────────────────────────────────────────


class AnswerRequest(BaseModel):
    selected_answer: str  # A/B/C/D/E


class AnswerResponse(BaseModel):
    is_correct: bool
    correct_answer: str
    explanation: Optional[str] = None
    wrong_count: int = 0  # cumulative wrong count for this question (0 if correct)


# ── Quiz session (legacy, kept for backward compat) ───────────────


class SessionStartResponse(BaseModel):
    session_id: int
    chapter_id: int
    started_at: datetime


class SessionFinishResponse(BaseModel):
    session_id: int
    chapter_id: int
    total_questions: int
    answered: int
    correct: int
    wrong: int
    duration_seconds: int


class ChapterSummaryResponse(BaseModel):
    chapter_id: int
    total_questions: int
    answered: int
    correct: int
    wrong: int
    accuracy: float  # 0.0 ~ 1.0
    duration_seconds: Optional[int] = None
    finished: bool


# ── Chapter Attempt (new multi-attempt flow) ───────────────────────


class AttemptStartResponse(BaseModel):
    attempt_id: int
    chapter_id: int
    started_at: datetime


class AttemptSubmitResponse(BaseModel):
    attempt_id: int
    chapter_id: int
    total_questions: int
    answered: int
    correct_count: int
    wrong_count: int
    accuracy_rate: float  # 0.0 ~ 1.0
    duration_seconds: int


class AttemptSummaryResponse(BaseModel):
    attempt_id: int
    chapter_id: int
    status: str
    total_questions: int
    answered: int
    correct_count: int
    wrong_count: int
    accuracy_rate: float
    duration_seconds: Optional[int] = None
    started_at: datetime
    submitted_at: Optional[datetime] = None


class AttemptHistoryItem(BaseModel):
    attempt_id: int
    chapter_id: int
    status: str
    correct_count: int
    wrong_count: int
    accuracy_rate: float
    duration_seconds: Optional[int] = None
    started_at: datetime
    submitted_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
