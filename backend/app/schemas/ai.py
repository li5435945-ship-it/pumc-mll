from typing import Optional
from datetime import datetime
from pydantic import BaseModel


# ── Review ─────────────────────────────────────────────────────────


class ReviewRequest(BaseModel):
    chapter_id: int


class ReviewResponse(BaseModel):
    review: str


# ── Recommend ──────────────────────────────────────────────────────


class RecommendRequest(BaseModel):
    chapter_id: int


class RecommendResponse(BaseModel):
    questions: list[str]


# ── Chat ───────────────────────────────────────────────────────────


class ChatRequest(BaseModel):
    chapter_id: int
    message: str


# ── Chat history ───────────────────────────────────────────────────


class ChatMessageOut(BaseModel):
    id: int
    role: str
    content: str
    rag_used: bool
    created_at: datetime

    model_config = {"from_attributes": True}
