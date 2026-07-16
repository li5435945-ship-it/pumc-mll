"""
Background task: index a document for RAG.

Parses the uploaded file, chunks the text, generates embeddings,
and stores the chunks in the database.

Can be invoked directly as ``await index_document_task(document_id)``
or registered as an arq worker job.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import async_session
from app.models import Chapter, Document, DocumentChunk
from app.services.rag_service import (
    chunk_text,
    embed_text,
    parse_document,
    recalculate_chapter_rag_stats,
    store_chunks,
)

logger = logging.getLogger(__name__)
settings = get_settings()


async def index_document_task(document_id: int) -> dict:
    """Index a single document.

    Steps:
        1. Set document status to ``"indexing"``.
        2. Resolve the file path on disk.
        3. Parse the file into paragraphs.
        4. Chunk the paragraphs.
        5. Embed each chunk (placeholder vectors for now).
        6. Store chunks in the database.
        7. Update document status to ``"ready"`` and set ``chunk_count``.
        8. Recalculate chapter-level RAG statistics.

    On any error the document status is set to ``"failed"`` and the
    error message is saved.

    Returns:
        A summary dict with keys ``status``, ``chunk_count``, ``error``.
    """
    async with async_session() as db:
        try:
            # ── 1. Load document ──────────────────────────────────────
            document = await db.get(Document, document_id)
            if not document:
                logger.error("Document %d not found", document_id)
                return {"status": "failed", "error": "Document not found"}

            # ── 2. Set status to indexing ─────────────────────────────
            document.status = "indexing"
            document.error_message = None
            await db.flush()

            # ── 3. Resolve file path ──────────────────────────────────
            # file_url is stored as a relative URL like "/uploads/xxx.docx"
            file_url: str = document.file_url
            if file_url.startswith("/"):
                file_url = file_url[1:]
            file_path = os.path.join(settings.UPLOAD_DIR, os.path.basename(file_url))

            if not os.path.isfile(file_path):
                raise FileNotFoundError(f"Uploaded file not found on disk: {file_path}")

            # ── 4. Parse document ─────────────────────────────────────
            paragraphs = parse_document(file_path, document.file_type)
            if not paragraphs:
                raise ValueError("Document contains no readable text")

            full_text = "\n\n".join(paragraphs)

            # ── 5. Chunk ──────────────────────────────────────────────
            chunks = chunk_text(full_text, chunk_size=500, overlap=50)
            if not chunks:
                raise ValueError("Chunking produced no results")

            # ── 6. Delete old chunks for this document (re-index safe) ─
            old_chunks_result = await db.execute(
                select(DocumentChunk).where(DocumentChunk.document_id == document_id)
            )
            for old_chunk in old_chunks_result.scalars().all():
                await db.delete(old_chunk)
            await db.flush()

            # ── 7. Embed and store ────────────────────────────────────
            for idx, chunk_content in enumerate(chunks):
                embedding = await embed_text(chunk_content)
                chunk = DocumentChunk(
                    document_id=document_id,
                    chapter_id=document.chapter_id,
                    course_id=document.course_id,
                    content=chunk_content,
                    embedding=embedding,  # Store embedding as JSON
                    chunk_index=idx,
                )
                db.add(chunk)

            await db.flush()

            # ── 8. Update document ────────────────────────────────────
            document.status = "ready"
            document.chunk_count = len(chunks)
            document.indexed_at = datetime.now()
            document.error_message = None
            await db.flush()

            # ── 9. Recalculate chapter RAG stats ──────────────────────
            await recalculate_chapter_rag_stats(db, document.chapter_id)

            await db.commit()
            logger.info(
                "Document %d indexed successfully: %d chunks",
                document_id,
                len(chunks),
            )
            return {"status": "ready", "chunk_count": len(chunks), "error": None}

        except Exception as exc:
            logger.exception("Failed to index document %d", document_id)
            await db.rollback()

            # Best-effort: mark the document as failed
            try:
                async with async_session() as err_db:
                    doc = await err_db.get(Document, document_id)
                    if doc:
                        doc.status = "failed"
                        doc.error_message = str(exc)[:1000]
                        await err_db.commit()
            except Exception:
                logger.exception(
                    "Could not update document %d status to failed", document_id
                )

            return {"status": "failed", "error": str(exc)}


# ---------------------------------------------------------------------------
# arq worker integration
# ---------------------------------------------------------------------------


async def index_document_arq(ctx: dict, document_id: int) -> dict:
    """arq-compatible wrapper for ``index_document_task``.

    Register this function in your arq worker settings::

        class WorkerSettings:
            functions = [index_document_arq]
    """
    return await index_document_task(document_id)
