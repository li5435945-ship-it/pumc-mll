import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import type { ReactNode } from 'react'
import type { User } from '../types/api'

interface AuthGuardProps {
  children: ReactNode
  role?: User['role']
}

export default function AuthGuard({ children, role }: AuthGuardProps) {
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const location = useLocation()

  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // If a specific role is required and user doesn't match, redirect to home
  if (role && user?.role !== role) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
