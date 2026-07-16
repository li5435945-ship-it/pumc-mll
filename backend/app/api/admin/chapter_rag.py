"""
Admin API: Chapter RAG management and document upload.

Routes:
    GET    /admin/chapters/{id}/rag          -- RAG status + document list
    PUT    /admin/chapters/{id}/rag          -- toggle rag_enabled
    POST   /admin/chapters/{id}/documents    -- upload a document
    DELETE /admin/chapters/{id}             -- delete chapter
    DELETE /admin/documents/{id}             -- delete document + chunks
    POST   /admin/documents/{id}/reindex     -- re-index a document
"""

from __future__ import annotations

import os
import uuid
import logging
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import get_db, async_session
from app.models import Chapter, Course, Document, DocumentChunk, Question, User
from app.api.deps import get_admin_user
from app.services.rag_service import recalculate_chapter_rag_stats
from app.redis import get_arq_pool

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(prefix="/admin", tags=["Admin-RAG"])

# Allowed file extensions
ALLOWED_EXTENSIONS = {".docx", ".pdf"}


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class DocumentOut(BaseModel):
    id: int
    filename: str
    file_url: str
    file_type: Optional[str] = None
    status: str
    chunk_count: int = 0
    error_message: Optional[str] = None
    created_at: Optional[datetime] = None
    indexed_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class ChapterRAGStatus(BaseModel):
    chapter_id: int
    chapter_name: str
    rag_enabled: bool
    rag_doc_count: int
    rag_chunk_count: int
    documents: List[DocumentOut]


class RAGEnabledUpdate(BaseModel):
    rag_enabled: bool


class DocumentActionResponse(BaseModel):
    message: str
    document_id: int


# ---------------------------------------------------------------------------
# DELETE /admin/chapters/{id}
# ---------------------------------------------------------------------------


@router.delete("/chapters/{chapter_id}", summary="删除章节")
async def admin_delete_chapter(
    chapter_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Delete a chapter and its questions."""
    chapter = await db.get(Chapter, chapter_id)
    if not chapter:
        raise HTTPException(status_code=404, detail="章节不存在")

    await db.delete(chapter)
    return {"code": 200, "message": "章节已删除"}


# ---------------------------------------------------------------------------
# GET /admin/chapters/{id}/rag
# ---------------------------------------------------------------------------


@router.get("/chapters/{chapter_id}/rag")
async def get_chapter_rag_status(
    chapter_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Return RAG configuration and document list for a chapter."""
    chapter = await db.get(Chapter, chapter_id)
    if not chapter:
        raise HTTPException(status_code=404, detail="章节不存在")

    result = await db.execute(
        select(Document)
        .where(Document.chapter_id == chapter_id)
        .order_by(Document.created_at.desc())
    )
    documents = result.scalars().all()

    # Calculate stats dynamically
    rag_doc_count = sum(1 for d in documents if d.status == "ready")
    rag_chunk_count = sum(d.chunk_count or 0 for d in documents if d.status == "ready")

    return {
        "code": 200,
        "message": "success",
        "data": ChapterRAGStatus(
            chapter_id=chapter.id,
            chapter_name=chapter.name,
            rag_enabled=chapter.rag_enabled,
            rag_doc_count=rag_doc_count,
            rag_chunk_count=rag_chunk_count,
            documents=[DocumentOut.model_validate(d) for d in documents],
        ),
    }


# ---------------------------------------------------------------------------
# PUT /admin/chapters/{id}/rag
# ---------------------------------------------------------------------------


@router.put("/chapters/{chapter_id}/rag")
async def update_chapter_rag_enabled(
    chapter_id: int,
    body: RAGEnabledUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Enable or disable RAG for a chapter.

    Validation: cannot enable RAG if the chapter has no ready documents.
    """
    chapter = await db.get(Chapter, chapter_id)
    if not chapter:
        raise HTTPException(status_code=404, detail="章节不存在")

    if body.rag_enabled:
        # Verify at least one ready document exists
        ready_count = await db.scalar(
            select(func.count(Document.id))
            .where(Document.chapter_id == chapter_id)
            .where(Document.status == "ready")
        )
        if not ready_count:
            raise HTTPException(
                status_code=400,
                detail="无法启用 RAG：该章节下没有已就绪的文档，请先上传并索引文档",
            )

    chapter.rag_enabled = body.rag_enabled
    await db.flush()

    return {
        "code": 200,
        "message": "success",
        "data": {
            "chapter_id": chapter.id,
            "rag_enabled": chapter.rag_enabled,
        },
    }


# ---------------------------------------------------------------------------
# POST /admin/chapters/{id}/documents
# ---------------------------------------------------------------------------


@router.post("/chapters/{chapter_id}/documents")
async def upload_document(
    chapter_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Upload a document (docx/pdf) for a chapter and trigger indexing."""
    chapter = await db.get(Chapter, chapter_id)
    if not chapter:
        raise HTTPException(status_code=404, detail="章节不存在")

    # Validate file extension
    original_filename = file.filename or "unknown"
    ext = os.path.splitext(original_filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的文件类型: {ext}，仅支持: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    file_type = ext.lstrip(".")

    # Save file to disk
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    safe_name = f"{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(settings.UPLOAD_DIR, safe_name)

    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    file_url = f"/uploads/{safe_name}"

    # Create document record
    document = Document(
        chapter_id=chapter_id,
        course_id=chapter.course_id,
        filename=original_filename,
        file_url=file_url,
        file_type=file_type,
        status="pending",
        chunk_count=0,
    )
    db.add(document)
    await db.flush()
    await db.refresh(document)

    # Enqueue async indexing via arq
    document_id = document.id
    arq = get_arq_pool()
    if arq:
        try:
            await arq.enqueue_job("index_document_arq", document_id)
            logger.info(f"Document {document_id} queued for indexing via arq")
        except Exception as e:
            logger.error(f"Failed to enqueue indexing job: {e}")
            # Fallback: mark as failed
            document.status = "failed"
            document.error_message = "任务队列入队失败"
            await db.flush()
    else:
        # Fallback: run inline if arq not available
        logger.warning("arq not available, running indexing inline")
        from app.tasks.index_document import index_document_task
        import asyncio
        asyncio.get_running_loop().create_task(
            index_document_task(document_id)
        )

    return {
        "code": 200,
        "message": "文档上传成功，正在后台索引",
        "data": DocumentOut.model_validate(document),
    }


# ---------------------------------------------------------------------------
# DELETE /admin/documents/{id}
# ---------------------------------------------------------------------------


@router.delete("/documents/{document_id}")
async def delete_document(
    document_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Delete a document and all its associated chunks."""
    document = await db.get(Document, document_id)
    if not document:
        raise HTTPException(status_code=404, detail="文档不存在")

    chapter_id = document.chapter_id

    # Delete chunks
    chunks_result = await db.execute(
        select(DocumentChunk).where(DocumentChunk.document_id == document_id)
    )
    for chunk in chunks_result.scalars().all():
        await db.delete(chunk)

    # Delete file from disk
    file_url: str = document.file_url
    if file_url.startswith("/"):
        file_url = file_url[1:]
    file_path = os.path.join(settings.UPLOAD_DIR, os.path.basename(file_url))
    if os.path.isfile(file_path):
        try:
            os.remove(file_path)
        except OSError:
            logger.warning("Could not delete file: %s", file_path)

    # Delete document record
    await db.delete(document)
    await db.flush()

    # Recalculate chapter stats
    await recalculate_chapter_rag_stats(db, chapter_id)

    return {
        "code": 200,
        "message": "文档已删除",
        "data": {"document_id": document_id},
    }


# ---------------------------------------------------------------------------
# POST /admin/documents/{id}/reindex
# ---------------------------------------------------------------------------


@router.post("/documents/{document_id}/reindex")
async def reindex_document(
    document_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Re-index an existing document (delete old chunks, re-parse, re-embed)."""
    document = await db.get(Document, document_id)
    if not document:
        raise HTTPException(status_code=404, detail="文档不存在")

    if document.status == "indexing":
        raise HTTPException(status_code=400, detail="文档正在索引中，请稍后再试")

    # Reset status
    document.status = "pending"
    document.error_message = None
    document.chunk_count = 0
    await db.flush()

    # Enqueue re-indexing via arq
    doc_id = document.id
    arq = get_arq_pool()
    if arq:
        try:
            await arq.enqueue_job("index_document_arq", doc_id)
            logger.info(f"Document {doc_id} queued for re-indexing via arq")
        except Exception as e:
            logger.error(f"Failed to enqueue re-indexing job: {e}")
    else:
        # Fallback
        from app.tasks.index_document import index_document_task
        import asyncio
        asyncio.get_running_loop().create_task(
            index_document_task(doc_id)
        )

    return {
        "code": 200,
        "message": "文档正在重新索引",
        "data": {"document_id": document_id, "status": "pending"},
    }


# ---------------------------------------------------------------------------
# GET /admin/documents/{id}/progress -- SSE progress stream
# ---------------------------------------------------------------------------


@router.get("/documents/{document_id}/progress")
async def document_indexing_progress(
    document_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """SSE endpoint for real-time indexing progress."""
    from fastapi.responses import StreamingResponse
    import asyncio
    import json

    document = await db.get(Document, document_id)
    if not document:
        raise HTTPException(status_code=404, detail="文档不存在")

    async def event_stream():
        """Generate SSE events for indexing progress."""
        last_status = None
        last_chunk_count = 0

        for _ in range(300):  # Max 5 minutes (300 * 1s)
            async with async_session() as poll_db:
                doc = await poll_db.get(Document, document_id)
                if not doc:
                    yield f"event: error\ndata: {json.dumps({'message': '文档不存在'})}\n\n"
                    break

                # Send status update if changed
                if doc.status != last_status:
                    if doc.status == "indexing":
                        yield f"event: progress\ndata: {json.dumps({'step': 'indexing', 'message': '正在索引...'})}\n\n"
                    elif doc.status == "ready":
                        yield f"event: complete\ndata: {json.dumps({'status': 'ready', 'chunk_count': doc.chunk_count})}\n\n"
                        break
                    elif doc.status == "failed":
                        yield f"event: error\ndata: {json.dumps({'status': 'failed', 'message': doc.error_message or '索引失败'})}\n\n"
                        break
                    last_status = doc.status

                # Send chunk count update if changed
                if doc.chunk_count and doc.chunk_count != last_chunk_count:
                    yield f"event: progress\ndata: {json.dumps({'step': 'embedding', 'current': doc.chunk_count, 'message': f'已处理 {doc.chunk_count} 个分块'})}\n\n"
                    last_chunk_count = doc.chunk_count

            await asyncio.sleep(1)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
