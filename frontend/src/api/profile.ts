import api from './client'
import type { ApiResponse, User } from '../types/api'

export interface ProfileUpdateData {
  nickname?: string
  avatar_url?: string
}

export const profileApi = {
  /** Update nickname and/or avatar_url */
  updateProfile: (data: ProfileUpdateData) =>
    api.put<never, ApiResponse<User>>('/auth/profile', data),

  /** Upload avatar image, returns the new avatar_url */
  uploadAvatar: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.post<never, ApiResponse<{ url: string }>>('/auth/avatar', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
}
