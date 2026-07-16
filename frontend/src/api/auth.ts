import api from './client'
import type { ApiResponse, LoginRequest, LoginResponse, User } from '../types/api'

export const authApi = {
  login: (data: LoginRequest) =>
    api.post<never, ApiResponse<LoginResponse>>('/auth/login', data),

  getMe: () =>
    api.get<never, ApiResponse<User>>('/auth/me'),
}
