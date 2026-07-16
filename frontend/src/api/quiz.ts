import api from './client'
import type {
  ApiResponse,
  AttemptStart,
  AttemptQuestion,
  AttemptAnswerResult,
  AttemptSummary,
} from '../types/api'

export const quizApi = {
  /** POST /chapters/{id}/attempts -- start a new attempt */
  startAttempt: (chapterId: number) =>
    api.post<never, ApiResponse<AttemptStart>>(`/chapters/${chapterId}/attempts`),

  /** GET /chapters/{id}/attempts -- list attempts for a chapter */
  getChapterAttempts: (chapterId: number) =>
    api.get<never, ApiResponse<{ attempt_id: number; chapter_id: number; accuracy_rate: number; status: string }[]>>(
      `/chapters/${chapterId}/attempts`,
    ),

  /** GET /attempts/{id}/questions -- get questions for an attempt */
  getAttemptQuestions: (attemptId: number) =>
    api.get<never, ApiResponse<AttemptQuestion[]>>(`/attempts/${attemptId}/questions`),

  /** POST /attempts/{id}/answers -- submit an answer */
  submitAnswer: (attemptId: number, questionId: number, selectedAnswer: string) =>
    api.post<never, ApiResponse<AttemptAnswerResult>>(
      `/attempts/${attemptId}/answers`,
      { question_id: questionId, selected_answer: selectedAnswer },
    ),

  /** POST /attempts/{id}/submit -- finish and submit the attempt */
  submitAttempt: (attemptId: number) =>
    api.post<never, ApiResponse<{ correct_count: number; wrong_count: number; accuracy_rate: number; duration_seconds: number }>>(
      `/attempts/${attemptId}/submit`,
    ),

  /** GET /attempts/{id}/summary -- get attempt result summary */
  getAttemptSummary: (attemptId: number) =>
    api.get<never, ApiResponse<AttemptSummary>>(`/attempts/${attemptId}/summary`),

  /** GET /attempts/{id}/details -- get attempt detail with all answers */
  getAttemptDetails: (attemptId: number) =>
    api.get<never, ApiResponse<AttemptSummary>>(`/attempts/${attemptId}/details`),
}
