import api from './client'
import type { ApiResponse, PaginatedData } from '../types/api'

export interface MistakeCourseItem {
  course_id: number
  course_name: string
  wrong_count: number
}

export interface MistakeChapterItem {
  chapter_id: number
  chapter_name: string
  wrong_count: number
}

export interface MistakeQuestionItem {
  id: number
  user_id: number
  question_id: number
  chapter_id: number
  wrong_count: number
  last_wrong_at: string
  content: string
  option_a: string
  option_b: string
  option_c: string
  option_d: string
  option_e: string | null
  correct_answer: string
  explanation: string | null
  chapter_name: string | null
  course_id: number | null
}

export interface MistakeQueryParams {
  course_id?: number
  chapter_id?: number
  page?: number
  page_size?: number
}

export const mistakesApi = {
  getMistakeCourses: () =>
    api.get<never, ApiResponse<MistakeCourseItem[]>>('/mistakes/courses'),

  getMistakes: (params?: MistakeQueryParams) =>
    api.get<never, ApiResponse<PaginatedData<MistakeQuestionItem>>>('/mistakes', {
      params,
    }),
}
