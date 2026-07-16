from typing import Optional
from pydantic import BaseModel


class CourseBrief(BaseModel):
    """课程列表项（学生端）"""
    id: int
    name: str
    cover_url: Optional[str] = None
    intro: Optional[str] = None
    chapter_count: int = 0
    question_count: int = 0

    model_config = {"from_attributes": True}


class CourseDetail(BaseModel):
    """课程详情（学生端）"""
    id: int
    name: str
    cover_url: Optional[str] = None
    intro: Optional[str] = None
    goals: Optional[str] = None
    chapter_count: int = 0

    model_config = {"from_attributes": True}


class ChapterWithStats(BaseModel):
    """章节 + 做题统计"""
    id: int
    name: str
    sort_order: int = 0
    rag_enabled: bool = False
    question_count: int = 0
    accuracy_rate: float = 0.0
    wrong_count: int = 0

    model_config = {"from_attributes": True}
