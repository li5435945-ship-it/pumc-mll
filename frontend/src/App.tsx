import { Routes, Route, Navigate } from 'react-router-dom'
import AppLayout from './layouts/AppLayout'
import AdminLayout from './layouts/AdminLayout'
import AuthGuard from './components/AuthGuard'
import LoginPage from './pages/login'
import CoursesPage from './pages/courses'
import ChaptersPage from './pages/courses/chapters'
import QuizPage from './pages/quiz'
import WrongQuestionsPage from './pages/wrong-questions'
import ProfilePage from './pages/profile'
import AdminCoursesPage from './pages/admin/courses'
import AdminCourseDetailPage from './pages/admin/course-detail'
import AdminStudentsPage from './pages/admin/students'

function ProtectedLayout() {
  return (
    <AuthGuard>
      <AppLayout />
    </AuthGuard>
  )
}

function AdminProtectedLayout() {
  return (
    <AuthGuard role="admin">
      <AdminLayout />
    </AuthGuard>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* Student routes */}
      <Route path="/" element={<ProtectedLayout />}>
        <Route index element={<Navigate to="/courses" replace />} />
        <Route path="courses" element={<CoursesPage />} />
        <Route path="courses/:courseId" element={<ChaptersPage />} />
        <Route
          path="courses/:courseId/sections/:chapterId"
          element={<QuizPage />}
        />
        <Route path="wrong-questions" element={<WrongQuestionsPage />} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>

      {/* Admin routes */}
      <Route path="/admin" element={<AdminProtectedLayout />}>
        <Route index element={<Navigate to="/admin/courses" replace />} />
        <Route path="courses" element={<AdminCoursesPage />} />
        <Route path="courses/:id" element={<AdminCourseDetailPage />} />
        <Route path="students" element={<AdminStudentsPage />} />
      </Route>
    </Routes>
  )
}

export default App
