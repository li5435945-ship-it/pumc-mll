import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '../types/api'

interface AuthState {
  token: string | null
  user: User | null
  setAuth: (token: string, user: User) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setAuth: (token, user) => set({ token, user }),
      logout: () => set({ token: null, user: null }),
    }),
    {
      name: 'pumc-mll-auth',
    },
  ),
)

/**
 * Logout and call backend to invalidate Redis session.
 * Use this instead of directly calling useAuthStore.getState().logout()
 */
export async function logoutAndClear() {
  const token = useAuthStore.getState().token
  if (token) {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
    } catch {
      // Ignore errors - clear local state anyway
    }
  }
  useAuthStore.getState().logout()
}
