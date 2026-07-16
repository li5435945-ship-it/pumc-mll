import api from './client'
import type { ApiResponse, Course, Chapter } from '../types/api'

export const coursesApi = {
  getCourses: () =>
    api.get<never, ApiResponse<Course[]>>('/courses'),

  getCourseDetail: (id: number) =>
    api.get<never, ApiResponse<Course>>(`/courses/${id}`),

  getCourseChapters: (id: number) =>
    api.get<never, ApiResponse<Chapter[]>>(`/courses/${id}/chapters`),
}
