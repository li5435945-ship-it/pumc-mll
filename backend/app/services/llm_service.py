"""
DeepSeek LLM Service

Provides both synchronous-chat and streaming-chat interfaces
over the OpenAI-compatible DeepSeek API.
"""

from __future__ import annotations

import json as _json
import logging
from typing import AsyncGenerator, List, Optional

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Token / context budget helpers
# ---------------------------------------------------------------------------

# DeepSeek-chat context window is 64k tokens; we cap the *input* at 4000
# to keep latency and cost predictable.
MAX_CONTEXT_TOKENS = 4000

# For Chinese text a single character is roughly 1-2 tokens; 1.5 is a
# reasonable average.  We use this to estimate token count from character
# count without pulling in tiktoken at runtime.
CHARS_PER_TOKEN_ZH = 1.5


def _estimate_tokens(text: str) -> int:
    """Rough token count estimate -- works well for Chinese / mixed text."""
    return max(1, int(len(text) / CHARS_PER_TOKEN_ZH))


def _truncate_messages(
    messages: List[dict],
    max_tokens: int = MAX_CONTEXT_TOKENS,
) -> List[dict]:
    """
    Keep the system prompt (first message) and as many recent messages as
    fit within *max_tokens*, estimated via character count.

    Strategy:
    1. Always keep messages[0] (system prompt) if present.
    2. Walk backwards from the newest message, accumulating token estimates
       until the budget is exhausted.
    3. Reverse to restore chronological order.
    """
    if not messages:
        return messages

    # Separate system prompt from conversation
    system_msg: Optional[dict] = None
    conversation: List[dict] = messages

    if messages[0].get("role") == "system":
        system_msg = messages[0]
        conversation = messages[1:]

    budget = max_tokens
    if system_msg is not None:
        budget -= _estimate_tokens(system_msg.get("content", ""))

    kept: List[dict] = []
    used = 0
    for msg in reversed(conversation):
        msg_tokens = _estimate_tokens(msg.get("content", ""))
        if used + msg_tokens > budget:
            break
        kept.append(msg)
        used += msg_tokens

    kept.reverse()

    if system_msg is not None:
        return [system_msg] + kept
    return kept


# ---------------------------------------------------------------------------
# LLM Service
# ---------------------------------------------------------------------------

class LLMService:
    """
    Thin async wrapper around the DeepSeek (OpenAI-compatible) chat API.

    Usage::

        svc = LLMService(api_key="sk-...", base_url="https://api.deepseek.com")
        answer = await svc.chat([{"role": "user", "content": "Hello"}])

        async for chunk in svc.stream_chat([{"role": "user", "content": "Hello"}]):
            print(chunk, end="")
    """

    def __init__(
        self,
        api_key: str,
        base_url: str = "https://api.deepseek.com",
    ) -> None:
        self.api_key = api_key
        # Normalise: strip trailing slash so we can safely append paths
        self.base_url = base_url.rstrip("/")
        self._client: Optional[httpx.AsyncClient] = None

    # -- lazy async client (reused across calls) --------------------------

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                timeout=httpx.Timeout(30.0, connect=10.0),
            )
        return self._client

    async def close(self) -> None:
        """Shut down the underlying HTTP client."""
        if self._client is not None and not self._client.is_closed:
            await self._client.aclose()
            self._client = None

    # -- non-streaming chat -----------------------------------------------

    async def chat(
        self,
        messages: List[dict],
        model: str = "deepseek-chat",
        temperature: float = 0.7,
    ) -> str:
        """
        Send *messages* to the DeepSeek API and return the assistant reply
        as a plain string.
        """
        messages = _truncate_messages(messages)
        payload = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "stream": False,
        }

        client = await self._get_client()
        try:
            resp = await client.post("/chat/completions", json=payload)
            resp.raise_for_status()
        except httpx.TimeoutException:
            logger.error("DeepSeek API request timed out")
            raise
        except httpx.HTTPStatusError as exc:
            logger.error(
                "DeepSeek API returned %d: %s",
                exc.response.status_code,
                exc.response.text[:500],
            )
            raise
        except httpx.RequestError as exc:
            logger.error("DeepSeek API request failed: %s", exc)
            raise

        data = resp.json()
        try:
            return data["choices"][0]["message"]["content"]
        except (KeyError, IndexError) as exc:
            logger.error("Unexpected DeepSeek response structure: %s", data)
            raise ValueError(
                "DeepSeek response missing expected 'choices' field"
            ) from exc

    # -- streaming chat ----------------------------------------------------

    async def stream_chat(
        self,
        messages: List[dict],
        model: str = "deepseek-chat",
        temperature: float = 0.7,
    ) -> AsyncGenerator[str, None]:
        """
        Yield text chunks as they arrive from the DeepSeek streaming API.

        Includes deduplication to skip repeated identical chunks from the API.

        Usage::

            async for chunk in svc.stream_chat(messages):
                print(chunk, end="")
        """
        messages = _truncate_messages(messages)
        payload = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "stream": True,
        }

        client = await self._get_client()
        last_chunk = None  # Track last chunk for deduplication
        try:
            async with client.stream(
                "POST", "/chat/completions", json=payload
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    # SSE format: lines prefixed with "data: "
                    if not line:
                        continue
                    if line.startswith("data: "):
                        data_str = line[len("data: "):]
                    else:
                        data_str = line

                    # End-of-stream sentinel
                    if data_str.strip() == "[DONE]":
                        return

                    try:
                        chunk = _json.loads(data_str)
                    except _json.JSONDecodeError:
                        # Malformed or partial line -- skip
                        continue

                    try:
                        delta = chunk["choices"][0]["delta"]
                        content = delta.get("content")
                        if content:
                            # Deduplicate: skip if identical to last chunk
                            if content == last_chunk:
                                continue
                            last_chunk = content
                            yield content
                    except (KeyError, IndexError):
                        # Some chunks (e.g. role-only) have no content
                        continue
        except httpx.TimeoutException:
            logger.error("DeepSeek streaming request timed out")
            raise
        except httpx.HTTPStatusError as exc:
            logger.error(
                "DeepSeek streaming returned %d: %s",
                exc.response.status_code,
                exc.response.text[:500],
            )
            raise
        except httpx.RequestError as exc:
            logger.error("DeepSeek streaming request failed: %s", exc)
            raise


# ---------------------------------------------------------------------------
# Singleton accessor
# ---------------------------------------------------------------------------

_llm_service: Optional[LLMService] = None


def get_llm_service() -> LLMService:
    """
    Return a module-level singleton ``LLMService`` instance configured from
    the application settings.

    The instance is lazily created on first call and reused thereafter.
    """
    global _llm_service  # noqa: PLW0603
    if _llm_service is None:
        settings = get_settings()
        if not settings.DEEPSEEK_API_KEY or settings.DEEPSEEK_API_KEY == "sk-your-key-here":
            logger.error("DEEPSEEK_API_KEY not configured -- AI features will not work")
            raise RuntimeError(
                "DEEPSEEK_API_KEY is not configured. "
                "Please set it in your .env file to enable AI features."
            )
        _llm_service = LLMService(
            api_key=settings.DEEPSEEK_API_KEY,
            base_url=settings.DEEPSEEK_BASE_URL,
        )
    return _llm_service
