"""initial schema

Revision ID: 2c34231c6375
Revises:
Create Date: 2026-07-11 21:47:47.828629
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision: str = '2c34231c6375'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── 1. users ──────────────────────────────────────────────────
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('email', sa.String(255), unique=True, nullable=False),
        sa.Column('password_hash', sa.String(255), nullable=False),
        sa.Column('nickname', sa.String(100)),
        sa.Column('avatar_url', sa.String(500)),
        sa.Column('role', sa.String(20), server_default='student'),
        sa.Column('student_group', sa.String(50)),
        sa.Column('is_active', sa.Boolean(), server_default='true'),
        sa.Column('created_at', sa.TIMESTAMP(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.TIMESTAMP(), server_default=sa.func.now()),
    )

    # ── 2. courses ────────────────────────────────────────────────
    op.create_table(
        'courses',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('cover_url', sa.String(500)),
        sa.Column('description', sa.Text()),
        sa.Column('learning_objectives', sa.Text()),
        sa.Column('review_prompt', sa.Text()),
        sa.Column('chat_prompt', sa.Text()),
        sa.Column('recommend_prompt', sa.Text()),
        sa.Column('status', sa.String(20), server_default='draft'),
        sa.Column('sort_order', sa.Integer(), server_default='0'),
        sa.Column('created_at', sa.TIMESTAMP(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.TIMESTAMP(), server_default=sa.func.now()),
    )

    # ── 3. chapters ───────────────────────────────────────────────
    op.create_table(
        'chapters',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('course_id', sa.Integer(), sa.ForeignKey('courses.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('sort_order', sa.Integer(), server_default='0'),
        sa.Column('open_at', sa.TIMESTAMP()),
        sa.Column('rag_enabled', sa.Boolean(), server_default='false'),
        sa.Column('created_at', sa.TIMESTAMP(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.TIMESTAMP(), server_default=sa.func.now()),
    )

    # ── 4. question_import_batches ────────────────────────────────
    op.create_table(
        'question_import_batches',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('course_id', sa.Integer(), sa.ForeignKey('courses.id', ondelete='CASCADE'), nullable=False),
        sa.Column('filename', sa.String(255)),
        sa.Column('status', sa.String(20), server_default='pending'),
        sa.Column('question_count', sa.Integer(), server_default='0'),
        sa.Column('error_message', sa.Text()),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.id')),
        sa.Column('created_at', sa.TIMESTAMP(), server_default=sa.func.now()),
    )

    # ── 5. questions ──────────────────────────────────────────────
    op.create_table(
        'questions',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('chapter_id', sa.Integer(), sa.ForeignKey('chapters.id', ondelete='CASCADE'), nullable=False),
        sa.Column('import_batch_id', sa.Integer(), sa.ForeignKey('question_import_batches.id', ondelete='SET NULL')),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('option_a', sa.Text(), nullable=False),
        sa.Column('option_b', sa.Text(), nullable=False),
        sa.Column('option_c', sa.Text(), nullable=False),
        sa.Column('option_d', sa.Text(), nullable=False),
        sa.Column('option_e', sa.Text()),
        sa.Column('correct_answer', sa.String(1), nullable=False),
        sa.Column('explanation', sa.Text()),
        sa.Column('sort_order', sa.Integer(), server_default='0'),
        sa.Column('is_active', sa.Boolean(), server_default='true'),
    )

    # ── 6. chapter_attempts ───────────────────────────────────────
    op.create_table(
        'chapter_attempts',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('chapter_id', sa.Integer(), sa.ForeignKey('chapters.id', ondelete='CASCADE'), nullable=False),
        sa.Column('started_at', sa.TIMESTAMP(), server_default=sa.func.now()),
        sa.Column('submitted_at', sa.TIMESTAMP()),
        sa.Column('duration_seconds', sa.Integer()),
        sa.Column('correct_count', sa.Integer(), server_default='0'),
        sa.Column('wrong_count', sa.Integer(), server_default='0'),
        sa.Column('accuracy_rate', sa.Float(), server_default='0'),
        sa.Column('status', sa.String(20), server_default='in_progress'),
    )

    # ── 7. answer_records ─────────────────────────────────────────
    op.create_table(
        'answer_records',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('attempt_id', sa.Integer(), sa.ForeignKey('chapter_attempts.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('question_id', sa.Integer(), sa.ForeignKey('questions.id'), nullable=False),
        sa.Column('selected_answer', sa.String(1)),
        sa.Column('is_correct', sa.Boolean()),
        sa.Column('duration_seconds', sa.Integer()),
        sa.Column('answered_at', sa.TIMESTAMP(), server_default=sa.func.now()),
    )

    # ── 8. wrong_questions ────────────────────────────────────────
    op.create_table(
        'wrong_questions',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('question_id', sa.Integer(), sa.ForeignKey('questions.id'), nullable=False),
        sa.Column('chapter_id', sa.Integer(), sa.ForeignKey('chapters.id', ondelete='CASCADE'), nullable=False),
        sa.Column('attempt_id', sa.Integer(), sa.ForeignKey('chapter_attempts.id', ondelete='SET NULL')),
        sa.Column('last_wrong_at', sa.TIMESTAMP(), server_default=sa.func.now()),
        sa.Column('wrong_count', sa.Integer(), server_default='1'),
    )

    # ── 9. ai_reviews ─────────────────────────────────────────────
    op.create_table(
        'ai_reviews',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('attempt_id', sa.Integer(), sa.ForeignKey('chapter_attempts.id', ondelete='CASCADE'), nullable=False),
        sa.Column('content', sa.Text()),
        sa.Column('rag_used', sa.Boolean(), server_default='false'),
        sa.Column('sources', sa.JSON()),
        sa.Column('model', sa.String(50)),
        sa.Column('created_at', sa.TIMESTAMP(), server_default=sa.func.now()),
    )

    # ── 10. chat_sessions ─────────────────────────────────────────
    op.create_table(
        'chat_sessions',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('chapter_id', sa.Integer(), sa.ForeignKey('chapters.id', ondelete='CASCADE'), nullable=False),
        sa.Column('created_at', sa.TIMESTAMP(), server_default=sa.func.now()),
    )

    # ── 11. chat_messages ─────────────────────────────────────────
    op.create_table(
        'chat_messages',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('session_id', sa.Integer(), sa.ForeignKey('chat_sessions.id', ondelete='CASCADE'), nullable=False),
        sa.Column('role', sa.String(20), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('rag_used', sa.Boolean(), server_default='false'),
        sa.Column('sources', sa.JSON()),
        sa.Column('created_at', sa.TIMESTAMP(), server_default=sa.func.now()),
    )

    # ── 12. documents ─────────────────────────────────────────────
    op.create_table(
        'documents',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('chapter_id', sa.Integer(), sa.ForeignKey('chapters.id', ondelete='CASCADE'), nullable=False),
        sa.Column('course_id', sa.Integer(), sa.ForeignKey('courses.id', ondelete='CASCADE'), nullable=False),
        sa.Column('filename', sa.String(255), nullable=False),
        sa.Column('file_url', sa.String(500), nullable=False),
        sa.Column('file_type', sa.String(10)),
        sa.Column('file_size', sa.Integer()),
        sa.Column('status', sa.String(20), server_default='pending'),
        sa.Column('chunk_count', sa.Integer(), server_default='0'),
        sa.Column('error_message', sa.Text()),
        sa.Column('uploaded_by', sa.Integer(), sa.ForeignKey('users.id')),
        sa.Column('created_at', sa.TIMESTAMP(), server_default=sa.func.now()),
        sa.Column('indexed_at', sa.TIMESTAMP()),
    )

    # ── 13. document_chunks ───────────────────────────────────────
    op.create_table(
        'document_chunks',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('document_id', sa.Integer(), sa.ForeignKey('documents.id', ondelete='CASCADE'), nullable=False),
        sa.Column('chapter_id', sa.Integer(), nullable=False),
        sa.Column('course_id', sa.Integer(), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('embedding', sa.JSON()),
        sa.Column('chunk_index', sa.Integer()),
        sa.Column('page_number', sa.Integer()),
        sa.Column('heading', sa.String(500)),
        sa.Column('extra_metadata', sa.JSON()),
    )


def downgrade() -> None:
    op.drop_table('document_chunks')
    op.drop_table('documents')
    op.drop_table('chat_messages')
    op.drop_table('chat_sessions')
    op.drop_table('ai_reviews')
    op.drop_table('wrong_questions')
    op.drop_table('answer_records')
    op.drop_table('chapter_attempts')
    op.drop_table('questions')
    op.drop_table('question_import_batches')
    op.drop_table('chapters')
    op.drop_table('courses')
    op.drop_table('users')
