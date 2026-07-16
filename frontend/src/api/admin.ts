import api from './client'
import type {
  ApiResponse,
  Course,
  CourseAdmin,
  ChapterAdmin,
  PaginatedData,
  User,
} from '../types/api'

// ---------- Import preview/confirm types ----------

export interface ImportPreviewError {
  row: number
  message: string
}

export interface ImportChapterPreview {
  name: string
  question_count: number
}

export interface ImportPreviewResult {
  preview_id: string
  total_rows: number
  valid_count: number
  error_count: number
  errors: ImportPreviewError[]
  chapters: ImportChapterPreview[]
}

export interface ImportConfirmData {
  preview_id: string
}

export interface ImportConfirmResult {
  batch_id: number
  imported_count: number
  chapter_count: number
}

export interface AdminChapter {
  id: number
  name: string
  order_num: number
  open_at: string | null
}

export interface AdminCourse extends Course {
  chapters: AdminChapter[]
}

export interface ChapterRAG {
  chapter_id: number
  rag_enabled: boolean
  documents: RagDocument[]
}

export interface RagDocument {
  id: number
  filename: string
  size: number
  status: 'ready' | 'indexing' | 'failed'
  chunk_count: number
  uploaded_at: string
}

export interface CreateCourseData {
  name: string
  intro?: string
  goals?: string
  status?: 'draft' | 'published'
}

export interface UpdateCourseData {
  name?: string
  intro?: string
  goals?: string
  status?: 'draft' | 'published'
}

export interface UpdateChapterRAGData {
  rag_enabled?: boolean
  chunk_size?: number
  chunk_overlap?: number
}

export interface PromptUpdateData {
  prompt_review?: string
  prompt_reply?: string
  prompt_recommend?: string
}

export interface CreateStudentData {
  email: string
  password: string
  nickname?: string
  student_group?: string
}

export interface ImportResult {
  total_rows: number
  chapters_created: number
  questions_imported: number
  errors: string[]
}

export interface UpdateStudentData {
  nickname?: string
  password?: string
}

export interface OnlineSession {
  user_id: number
}

export interface BatchCreateStudentsResult {
  created: number
  skipped: number
  errors: string[]
}

export const adminApi = {
  // Courses
  getAdminCourses: (params?: { page?: number; page_size?: number }) =>
    api.get<never, ApiResponse<PaginatedData<Course>>>('/admin/courses', { params }),

  getAdminCourseDetail: (id: number) =>
    api.get<never, ApiResponse<CourseAdmin>>(`/admin/courses/${id}`),

  createAdminCourse: (data: CreateCourseData) =>
    api.post<never, ApiResponse<Course>>('/admin/courses', data),

  updateAdminCourse: (id: number, data: UpdateCourseData) =>
    api.put<never, ApiResponse<Course>>(`/admin/courses/${id}`, data),

  deleteAdminCourse: (id: number) =>
    api.delete<never, ApiResponse<null>>(`/admin/courses/${id}`),

  updatePrompts: (courseId: number, data: PromptUpdateData) =>
    api.put<never, ApiResponse<CourseAdmin>>(
      `/admin/courses/${courseId}/prompts`,
      data,
    ),

  uploadCourseCover: (id: number, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.post<never, ApiResponse<{ url: string }>>(
      `/admin/courses/${id}/cover`,
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    )
  },

  // Chapters
  getAdminChapters: (courseId: number) =>
    api.get<never, ApiResponse<ChapterAdmin[]>>(
      `/admin/courses/${courseId}/chapters`,
    ),

  // Excel import
  downloadImportTemplate: () =>
    api.get<never, Blob>('/admin/courses/import-template', {
      responseType: 'blob' as unknown as undefined,
    }),

  importExcel: (courseId: number, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.post<never, ApiResponse<ImportResult>>(
      `/admin/courses/${courseId}/import`,
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    )
  },

  // Chapters (admin)
  createAdminChapter: (courseId: number, data: { name: string; sort_order?: number }) =>
    api.post<never, ApiResponse<ChapterAdmin>>(
      `/admin/courses/${courseId}/chapters`,
      data,
    ),

  // Chapter RAG
  getChapterRAG: (chapterId: number) =>
    api.get<never, ApiResponse<ChapterRAG>>(`/admin/chapters/${chapterId}/rag`),

  updateChapterRAG: (chapterId: number, data: UpdateChapterRAGData) =>
    api.put<never, ApiResponse<null>>(`/admin/chapters/${chapterId}/rag`, data),

  // Documents
  uploadDocument: (chapterId: number, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.post<never, ApiResponse<RagDocument>>(
      `/admin/chapters/${chapterId}/documents`,
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    )
  },

  deleteDocument: (docId: number) =>
    api.delete<never, ApiResponse<null>>(`/admin/documents/${docId}`),

  reindexDocument: (docId: number) =>
    api.post<never, ApiResponse<null>>(`/admin/documents/${docId}/reindex`),

  // Students
  getAdminStudents: (params?: {
    page?: number
    page_size?: number
    email?: string
  }) =>
    api.get<never, ApiResponse<PaginatedData<User>>>('/admin/students', {
      params,
    }),

  createAdminStudent: (data: CreateStudentData) =>
    api.post<never, ApiResponse<User>>('/admin/students', data),

  batchCreateStudents: (students: CreateStudentData[]) =>
    api.post<never, ApiResponse<BatchCreateStudentsResult>>(
      '/admin/students/batch',
      { students },
    ),

  updateAdminStudent: (id: number, data: UpdateStudentData) =>
    api.put<never, ApiResponse<User>>(`/admin/students/${id}`, data),

  deleteAdminStudent: (id: number) =>
    api.delete<never, ApiResponse<null>>(`/admin/students/${id}`),

  // Import students from Excel
  importStudents: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.post<never, ApiResponse<{ created: number; skipped: Array<{ row: number; email: string; reason: string }> }>>(
      '/admin/students/import',
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    )
  },

  // Download student import template
  downloadStudentTemplate: () =>
    api.get('/admin/students/import-template', { responseType: 'blob' }),

  // Import preview/confirm (new workflow)
  importPreview: (courseId: number, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.post<never, ApiResponse<ImportPreviewResult>>(
      `/admin/courses/${courseId}/imports/preview`,
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    )
  },

  importConfirm: (courseId: number, data: ImportConfirmData) =>
    api.post<never, ApiResponse<ImportConfirmResult>>(
      `/admin/courses/${courseId}/imports/confirm`,
      data,
    ),

  downloadTemplate: () =>
    api.get<never, Blob>('/admin/import/template', {
      responseType: 'blob' as unknown as undefined,
    }),

  // Sessions
  getOnlineSessions: () =>
    api.get<never, ApiResponse<{ sessions: OnlineSession[]; count: number }>>('/admin/sessions'),

  kickUserSession: (userId: number) =>
    api.delete<never, ApiResponse<{ user_id: number; kicked: boolean }>>(`/admin/sessions/${userId}`),

  // Document indexing progress (SSE)
  getDocumentProgressUrl: (docId: number) => `/api/admin/documents/${docId}/progress`,
}
