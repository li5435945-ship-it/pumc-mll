export interface ApiResponse<T = unknown> {
  code: number
  message: string
  data: T | null
}

export interface PaginatedData<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}

export interface User {
  id: number
  email: string
  nickname: string | null
  avatar_url: string | null
  role: 'student' | 'admin'
  student_group: string | null
}

export interface LoginRequest {
  email: string
  password: string
}

export interface LoginResponse {
  token: string
  user: User
}

export interface Course {
  id: number
  name: string
  cover_url: string | null
  intro: string | null
  goals: string | null
  status: 'draft' | 'published'
  created_at: string
  chapter_count?: number
  question_count?: number
}

export interface Chapter {
  id: number
  name: string
  question_count: number
  accuracy_rate: number
  wrong_count: number
  open_at: string | null
  is_open: boolean
}

export interface Question {
  id: number
  content: string
  options: string[]
  answer?: string
  explanation?: string
}

export interface QuizStart {
  chapter_id: number
  questions: Question[]
}

export interface AnswerResult {
  correct: boolean
  correct_answer: string
  explanation: string
}

export interface ChapterSummary {
  chapter_id: number
  total: number
  correct: number
  wrong: number
  accuracy_rate: number
}

export interface AttemptStart {
  attempt_id: number
}

export interface AttemptQuestion {
  id: number
  content: string
  option_a: string
  option_b: string
  option_c: string
  option_d: string
  option_e: string | null
}

export interface AttemptAnswerResult {
  is_correct: boolean
  correct_answer: string
  explanation: string
}

export interface AttemptSummary {
  attempt_id: number
  chapter_id: number
  chapter_name: string
  total_questions: number
  answered: number
  correct_count: number
  wrong_count: number
  accuracy_rate: number
  duration_seconds: number
}

export interface WrongQuestion {
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

export interface WrongQuestionQuery {
  page?: number
  page_size?: number
  chapter_id?: number
}

// ---------- Admin types ----------

export interface CourseAdmin {
  id: number
  name: string
  cover_url: string | null
  intro: string | null
  goals: string | null
  prompt_review: string | null
  prompt_reply: string | null
  prompt_recommend: string | null
  status: 'draft' | 'published'
  created_at: string
  updated_at: string
}

export interface ChapterAdmin {
  id: number
  name: string
  sort_order: number
  rag_enabled: boolean
  rag_doc_count: number
  rag_chunk_count: number
  question_count: number
  open_at: string | null
  created_at: string
}

export interface CourseCreateRequest {
  name: string
  intro?: string
  goals?: string
}

export interface CourseUpdateRequest {
  name?: string
  intro?: string
  goals?: string
  status?: 'draft' | 'published'
}

export interface PromptUpdateRequest {
  prompt_review?: string
  prompt_reply?: string
  prompt_recommend?: string
}

export interface ImportResult {
  imported: number
  skipped: number
  errors: string[]
}
