"""Database models for PUMC MLL."""
from sqlalchemy import Column, Integer, String, Text, Boolean, TIMESTAMP, ForeignKey, Float, JSON
from sqlalchemy.sql import func
from app.db import Base


# ── 1. 用户 ───────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String(255), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    nickname = Column(String(100))
    avatar_url = Column(String(500))
    role = Column(String(20), default="student")  # student | admin
    student_group = Column(String(50))  # 分组 (A/B/etc.)
    is_active = Column(Boolean, default=True)
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())


# ── 2. 课程 ───────────────────────────────────────────────────────

class Course(Base):
    __tablename__ = "courses"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), nullable=False)
    cover_url = Column(String(500))
    description = Column(Text)
    learning_objectives = Column(Text)
    review_prompt = Column(Text)      # 作业点评 Prompt
    chat_prompt = Column(Text)        # AI 对话 Prompt
    recommend_prompt = Column(Text)   # 推荐问题 Prompt
    status = Column(String(20), default="draft")  # draft | published
    sort_order = Column(Integer, default=0)
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())


class Chapter(Base):
    __tablename__ = "chapters"

    id = Column(Integer, primary_key=True, autoincrement=True)
    course_id = Column(Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    sort_order = Column(Integer, default=0)
    open_at = Column(TIMESTAMP)
    rag_enabled = Column(Boolean, default=False)
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())


# ── 3. 题库 ───────────────────────────────────────────────────────

class QuestionImportBatch(Base):
    """每次导入记录，保留历史。"""
    __tablename__ = "question_import_batches"

    id = Column(Integer, primary_key=True, autoincrement=True)
    course_id = Column(Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False)
    filename = Column(String(255))
    status = Column(String(20), default="pending")  # pending | processing | done | failed
    question_count = Column(Integer, default=0)
    error_message = Column(Text)
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(TIMESTAMP, server_default=func.now())


class Question(Base):
    __tablename__ = "questions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    chapter_id = Column(Integer, ForeignKey("chapters.id", ondelete="CASCADE"), nullable=False)
    import_batch_id = Column(Integer, ForeignKey("question_import_batches.id", ondelete="SET NULL"))
    content = Column(Text, nullable=False)
    option_a = Column(Text, nullable=False)
    option_b = Column(Text, nullable=False)
    option_c = Column(Text, nullable=False)
    option_d = Column(Text, nullable=False)
    option_e = Column(Text)
    correct_answer = Column(String(1), nullable=False)  # A/B/C/D/E
    explanation = Column(Text)
    sort_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)


# ── 4. 答题 ───────────────────────────────────────────────────────

class ChapterAttempt(Base):
    """每次进入章节答题创建一次 attempt。"""
    __tablename__ = "chapter_attempts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    chapter_id = Column(Integer, ForeignKey("chapters.id", ondelete="CASCADE"), nullable=False)
    started_at = Column(TIMESTAMP, server_default=func.now())
    submitted_at = Column(TIMESTAMP)
    duration_seconds = Column(Integer)
    correct_count = Column(Integer, default=0)
    wrong_count = Column(Integer, default=0)
    accuracy_rate = Column(Float, default=0.0)
    status = Column(String(20), default="in_progress")  # in_progress | submitted


class AnswerRecord(Base):
    """单题答题记录，关联到 attempt。"""
    __tablename__ = "answer_records"
    # 无 UNIQUE 约束，支持多次练习

    id = Column(Integer, primary_key=True, autoincrement=True)
    attempt_id = Column(Integer, ForeignKey("chapter_attempts.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    question_id = Column(Integer, ForeignKey("questions.id"), nullable=False)
    selected_answer = Column(String(1))
    is_correct = Column(Boolean)
    duration_seconds = Column(Integer)
    answered_at = Column(TIMESTAMP, server_default=func.now())


class WrongQuestion(Base):
    """错题记录，基于最近一次答错。"""
    __tablename__ = "wrong_questions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    question_id = Column(Integer, ForeignKey("questions.id"), nullable=False)
    chapter_id = Column(Integer, ForeignKey("chapters.id", ondelete="CASCADE"), nullable=False)
    attempt_id = Column(Integer, ForeignKey("chapter_attempts.id", ondelete="SET NULL"))
    last_wrong_at = Column(TIMESTAMP, server_default=func.now())
    wrong_count = Column(Integer, default=1)


# ── 5. AI ─────────────────────────────────────────────────────────

class AiReview(Base):
    """AI 作业点评记录。"""
    __tablename__ = "ai_reviews"

    id = Column(Integer, primary_key=True, autoincrement=True)
    attempt_id = Column(Integer, ForeignKey("chapter_attempts.id", ondelete="CASCADE"), nullable=False)
    content = Column(Text)
    rag_used = Column(Boolean, default=False)
    sources = Column(JSON)  # 引用的文档片段
    model = Column(String(50))
    created_at = Column(TIMESTAMP, server_default=func.now())


class ChatSession(Base):
    """AI 对话会话。"""
    __tablename__ = "chat_sessions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    chapter_id = Column(Integer, ForeignKey("chapters.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(TIMESTAMP, server_default=func.now())


class ChatMessage(Base):
    """对话消息。"""
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False)
    role = Column(String(20), nullable=False)  # user | assistant
    content = Column(Text, nullable=False)
    rag_used = Column(Boolean, default=False)
    sources = Column(JSON)
    created_at = Column(TIMESTAMP, server_default=func.now())


# ── 6. 章节 RAG ───────────────────────────────────────────────────

class Document(Base):
    """上传的文档。"""
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, autoincrement=True)
    chapter_id = Column(Integer, ForeignKey("chapters.id", ondelete="CASCADE"), nullable=False)
    course_id = Column(Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False)
    filename = Column(String(255), nullable=False)
    file_url = Column(String(500), nullable=False)
    file_type = Column(String(10))  # docx | pdf
    file_size = Column(Integer)
    status = Column(String(20), default="pending")  # pending | indexing | ready | failed
    chunk_count = Column(Integer, default=0)
    error_message = Column(Text)
    uploaded_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(TIMESTAMP, server_default=func.now())
    indexed_at = Column(TIMESTAMP)


class DocumentChunk(Base):
    """文档分块。"""
    __tablename__ = "document_chunks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    document_id = Column(Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    chapter_id = Column(Integer, nullable=False)
    course_id = Column(Integer, nullable=False)
    content = Column(Text, nullable=False)
    embedding = Column(JSON)  # Store embedding as JSON array (1536 floats)
    chunk_index = Column(Integer)
    page_number = Column(Integer)
    heading = Column(String(500))
    extra_metadata = Column(JSON)
