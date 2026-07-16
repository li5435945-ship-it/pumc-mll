import api from './client'
import type { ApiResponse } from '../types/api'
import { useAuthStore } from '../stores/authStore'

// ---------- Types ----------

export interface ReviewResponse {
  review: string
}

export interface RecommendResponse {
  questions: string[]
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  rag_used?: boolean
}

export interface HistoryResponse {
  messages: ChatMessage[]
}

export interface StreamChatCallbacks {
  onToken: (token: string) => void
  onRagUsed: (rag: boolean) => void
  onDone: () => void
  onError: (err: Error) => void
}

// ---------- API ----------

export const aiApi = {
  /** Request AI review for a chapter */
  postReview: (chapterId: number) =>
    api.post<never, ApiResponse<ReviewResponse>>(`/ai/review`, { chapter_id: chapterId }),

  /** Request AI-recommended questions for a chapter */
  postRecommend: (chapterId: number) =>
    api.post<never, ApiResponse<RecommendResponse>>(`/ai/recommend`, { chapter_id: chapterId }),

  /** Get chat history for a chapter */
  getHistory: (chapterId: number) =>
    api.get<never, ApiResponse<ChatMessage[]>>(`/ai/history`, { params: { chapter_id: chapterId } }),

  /**
   * Stream a chat message via SSE (Server-Sent Events).
   * Uses fetch() directly because axios does not support streaming well.
   */
  streamChat: (
    chapterId: number,
    message: string,
    callbacks: StreamChatCallbacks,
  ): AbortController => {
    const controller = new AbortController()

    const token = useAuthStore.getState().token

    ;(async () => {
      try {
        const res = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ chapter_id: chapterId, message }),
          signal: controller.signal,
        })

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`)
        }

        const reader = res.body?.getReader()
        if (!reader) {
          throw new Error('ReadableStream not supported')
        }

        const decoder = new TextDecoder()
        let buffer = ''
        let ragUsed = false

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })

          // Parse SSE lines
          const lines = buffer.split('\n')
          // Keep the last potentially incomplete line in the buffer
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed || trimmed.startsWith(':')) continue // skip empty lines and comments

            if (trimmed.startsWith('event:')) {
              // event type line -- we handle data lines below
              continue
            }

            if (trimmed.startsWith('data:')) {
              const payload = trimmed.slice(5).trim()

              if (payload === '[DONE]') {
                callbacks.onDone()
                return
              }

              try {
                const json = JSON.parse(payload)

                // Handle error from backend
                if (json.error !== undefined) {
                  callbacks.onError(new Error(json.error))
                  return
                }

                // Handle rag_used flag (sent once at beginning or as a field)
                if (json.rag_used !== undefined) {
                  ragUsed = json.rag_used
                  callbacks.onRagUsed(ragUsed)
                }

                // Handle token content (backend sends "text", also support "content")
                if (json.text !== undefined) {
                  callbacks.onToken(json.text)
                } else if (json.content !== undefined) {
                  callbacks.onToken(json.content)
                }

                // Handle finish signal
                if (json.finish === true || json.done === true) {
                  callbacks.onDone()
                  return
                }
              } catch {
                // If not JSON, treat the raw payload as a token
                callbacks.onToken(payload)
              }
            }
          }
        }

        // Stream ended without explicit [DONE]
        callbacks.onDone()
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          // User cancelled -- call done, not error
          callbacks.onDone()
        } else {
          callbacks.onError(err instanceof Error ? err : new Error(String(err)))
        }
      }
    })()

    return controller
  },
}
