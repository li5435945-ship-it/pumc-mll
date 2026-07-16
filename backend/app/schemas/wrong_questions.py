from typing import Optional
from datetime import datetime
from pydantic import BaseModel


class WrongQuestionItem(BaseModel):
    """A single wrong-question entry with full question detail."""

    # WrongQuestion fields
    id: int
    user_id: int
    question_id: int
    chapter_id: int
    wrong_count: int
    last_wrong_at: datetime

    # Question content (joined)
    content: str
    option_a: str
    option_b: str
    option_c: str
    option_d: str
    option_e: Optional[str] = None
    correct_answer: str
    explanation: Optional[str] = None

    # Chapter info (joined)
    chapter_name: Optional[str] = None
    course_id: Optional[int] = None

    model_config = {"from_attributes": True}
