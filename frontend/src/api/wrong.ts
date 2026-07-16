import api from './client'
import type { ApiResponse, PaginatedData, WrongQuestion, WrongQuestionQuery } from '../types/api'

export const wrongApi = {
  getWrongQuestions: (params?: WrongQuestionQuery) =>
    api.get<never, ApiResponse<PaginatedData<WrongQuestion>>>('/wrong-questions', { params }),
}
