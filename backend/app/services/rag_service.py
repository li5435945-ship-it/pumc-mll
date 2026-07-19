"""
RAG (Retrieval-Augmented Generation) service.

Provides document parsing, text chunking, embedding, storage,
and retrieval for chapter-scoped RAG.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import List, Optional

import httpx
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import Chapter, Document, DocumentChunk

logger = logging.getLogger(__name__)
settings = get_settings()


# ---------------------------------------------------------------------------
# Document parsing
# ---------------------------------------------------------------------------


def parse_document(file_path: str, file_type: str) -> List[str]:
    """Extract paragraphs from a document file.

    Args:
        file_path: Absolute or relative path to the file.
        file_type: One of ``"docx"``, ``"pdf"``.

    Returns:
        A list of non-empty paragraph strings.

    Raises:
        ValueError: If *file_type* is unsupported.
        FileNotFoundError: If *file_path* does not exist.
    """
    if not os.path.isfile(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")

    file_type = file_type.lower().strip()

    if file_type == "docx":
        return _parse_docx(file_path)
    elif file_type == "pdf":
        return _parse_pdf(file_path)
    else:
        raise ValueError(f"Unsupported file type: {file_type}")


def _parse_docx(file_path: str) -> List[str]:
    """Extract paragraphs from a .docx file using python-docx."""
    from docx import Document as DocxDocument

    doc = DocxDocument(file_path)
    paragraphs: List[str] = []
    for para in doc.paragraphs:
        text = para.text.strip()
        if text:
            paragraphs.append(text)
    return paragraphs


def _parse_pdf(file_path: str) -> List[str]:
    """Extract text blocks from a .pdf file using PyMuPDF."""
    import fitz  # pymupdf

    paragraphs: List[str] = []
    pdf = fitz.open(file_path)
    try:
        for page in pdf:
            # get_text("blocks") returns tuples: (x0, y0, x1, y1, text, block_no, block_type)
            blocks = page.get_text("blocks")
            for block in blocks:
                if block[6] == 0:  # text block (not image)
                    text = block[4].strip()
                    if text:
                        paragraphs.append(text)
    finally:
        pdf.close()
    return paragraphs


# ---------------------------------------------------------------------------
# Text chunking
# ---------------------------------------------------------------------------


def chunk_text(
    text: str,
    chunk_size: int = 500,
    overlap: int = 50,
) -> List[str]:
    """Split *text* into overlapping chunks of roughly *chunk_size* characters.

    Strategy:
    1. Split the text into paragraphs (double-newline separated).
    2. Merge consecutive small paragraphs until *chunk_size* is reached.
    3. If a single paragraph exceeds *chunk_size*, split it by sentences
       (Chinese ``。`` and Western ``.``) and merge sentences into chunks.

    Args:
        text: The full document text.
        chunk_size: Target maximum characters per chunk.
        overlap: Characters of overlap between consecutive chunks.

    Returns:
        A list of text chunks.
    """
    if not text or not text.strip():
        return []

    # Split into paragraphs
    paragraphs = [p.strip() for p in text.split("\n") if p.strip()]

    if not paragraphs:
        return []

    chunks: List[str] = []
    current = ""

    for para in paragraphs:
        # If current buffer + new paragraph fits, merge
        if len(current) + len(para) + 1 <= chunk_size:
            current = f"{current}\n{para}" if current else para
        else:
            # Flush current buffer
            if current:
                chunks.append(current)

            # If this paragraph alone exceeds chunk_size, split by sentences
            if len(para) > chunk_size:
                sub_chunks = _split_by_sentences(para, chunk_size)
                chunks.extend(sub_chunks)
                current = ""
            else:
                current = para

    if current:
        chunks.append(current)

    # Apply overlap: prepend the tail of the previous chunk to the next one
    if overlap > 0 and len(chunks) > 1:
        overlapped: List[str] = [chunks[0]]
        for i in range(1, len(chunks)):
            prev_tail = chunks[i - 1][-overlap:]
            overlapped.append(prev_tail + chunks[i])
        chunks = overlapped

    return chunks


def _split_by_sentences(text: str, max_len: int) -> List[str]:
    """Split a long text into chunks at sentence boundaries."""
    import re

    # Split on Chinese/English sentence-ending punctuation
    sentences = re.split(r"(?<=[。！？.!?\n])", text)
    sentences = [s for s in sentences if s.strip()]

    chunks: List[str] = []
    current = ""

    for sent in sentences:
        if len(current) + len(sent) <= max_len:
            current += sent
        else:
            if current:
                chunks.append(current)
            # If a single sentence is still too long, hard-split
            if len(sent) > max_len:
                while len(sent) > max_len:
                    chunks.append(sent[:max_len])
                    sent = sent[max_len:]
            current = sent

    if current:
        chunks.append(current)

    return chunks


# ---------------------------------------------------------------------------
# Embedding
# ---------------------------------------------------------------------------


async def embed_text(text: str) -> List[float]:
    """Generate an embedding vector for *text*.

    Uses the DeepSeek embedding API if ``DEEPSEEK_API_KEY`` is configured,
    otherwise returns a deterministic dummy vector for development/testing.
    """
    api_key = settings.DEEPSEEK_API_KEY
    if not api_key:
        logger.warning("No DEEPSEEK_API_KEY configured; returning dummy embedding")
        return _dummy_embedding(text)

    try:
        return await _deepseek_embed(text, api_key)
    except Exception:
        logger.exception("DeepSeek embedding API failed; falling back to dummy")
        return _dummy_embedding(text)


async def _deepseek_embed(text: str, api_key: str) -> List[float]:
    """Call the DeepSeek embedding endpoint."""
    base_url = settings.DEEPSEEK_BASE_URL.rstrip("/")
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{base_url}/embeddings",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": "deepseek-embedding",
                "input": text,
            },
        )
        resp.raise_for_status()
        data = resp.json()
        return data["data"][0]["embedding"]


def _dummy_embedding(text: str, dim: int = 1536) -> List[float]:
    """Return a deterministic pseudo-embedding based on character hashes.

    This is NOT suitable for production -- it merely produces stable vectors
    so that the storage and retrieval pipeline can be tested end-to-end.
    """
    import hashlib

    h = hashlib.sha256(text.encode("utf-8")).digest()
    # Repeat the hash bytes to fill *dim* floats, then normalise to [0, 1)
    raw = []
    for i in range(dim):
        byte_val = h[i % len(h)]
        raw.append(byte_val / 255.0)
    # Simple L2 normalisation
    magnitude = sum(v * v for v in raw) ** 0.5 or 1.0
    return [v / magnitude for v in raw]


# ---------------------------------------------------------------------------
# Chunk storage
# ---------------------------------------------------------------------------


async def store_chunks(
    db: AsyncSession,
    document_id: int,
    chapter_id: int,
    course_id: int,
    chunks: List[str],
) -> int:
    """Persist *chunks* into the ``document_chunks`` table with embeddings.

    Returns the number of chunks stored.
    """
    for idx, chunk_content in enumerate(chunks):
        # Generate embedding for this chunk
        embedding = await embed_text(chunk_content)

        chunk = DocumentChunk(
            document_id=document_id,
            chapter_id=chapter_id,
            course_id=course_id,
            content=chunk_content,
            embedding=embedding,  # Store embedding as JSON
            chunk_index=idx,
        )
        db.add(chunk)

    await db.flush()
    return len(chunks)


# ---------------------------------------------------------------------------
# Retrieval
# ---------------------------------------------------------------------------


def _cosine_similarity(vec1: List[float], vec2: List[float]) -> float:
    """Calculate cosine similarity between two vectors."""
    if not vec1 or not vec2 or len(vec1) != len(vec2):
        return 0.0

    dot_product = sum(a * b for a, b in zip(vec1, vec2))
    norm1 = sum(a * a for a in vec1) ** 0.5
    norm2 = sum(b * b for b in vec2) ** 0.5

    if norm1 == 0 or norm2 == 0:
        return 0.0

    return dot_product / (norm1 * norm2)


async def retrieve_for_chapter(
    chapter_id: int,
    query: str,
    db: AsyncSession,
    top_k: int = 5,
) -> List[str]:
    """Retrieve relevant text chunks for a chapter using semantic search.

    Uses cosine similarity between query embedding and chunk embeddings.
    Falls back to chunk_index ordering if no embeddings are available.
    """
    # Check whether RAG is enabled for this chapter
    chapter = await db.get(Chapter, chapter_id)
    if not chapter or not chapter.rag_enabled:
        return []

    # Get query embedding
    query_embedding = await embed_text(query)

    # Fetch all chunks for this chapter
    result = await db.execute(
        select(DocumentChunk)
        .where(DocumentChunk.chapter_id == chapter_id)
        .where(DocumentChunk.content.isnot(None))
    )
    chunks = result.scalars().all()

    if not chunks:
        return []

    # Calculate similarity scores
    scored_chunks = []
    for chunk in chunks:
        if chunk.embedding:
            similarity = _cosine_similarity(query_embedding, chunk.embedding)
            scored_chunks.append((similarity, chunk.content))
        else:
            # No embedding available, use low score
            scored_chunks.append((0.0, chunk.content))

    # Sort by similarity (highest first) and return top_k
    scored_chunks.sort(key=lambda x: x[0], reverse=True)
    return [content for _, content in scored_chunks[:top_k]]


# ---------------------------------------------------------------------------
# Chapter RAG statistics helpers
# ---------------------------------------------------------------------------


async def recalculate_chapter_rag_stats(
    db: AsyncSession,
    chapter_id: int,
) -> tuple[int, int]:
    """Recompute and return (doc_count, chunk_count) for a chapter.

    These stats are now computed dynamically rather than stored on the
    Chapter model, so this function simply queries and returns the values.
    """
    doc_count = await db.scalar(
        select(func.count(Document.id))
        .where(Document.chapter_id == chapter_id)
        .where(Document.status == "ready")
    )
    chunk_count = await db.scalar(
        select(func.count(DocumentChunk.id))
        .where(DocumentChunk.chapter_id == chapter_id)
    )
    return doc_count or 0, chunk_count or 0
