import React, { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/PlannerContext.jsx'
import { AppErrorBoundary } from './components/AppErrorBoundary.jsx'
import AuthGate from './pages/AuthPage.jsx'
import Layout from './components/Layout.jsx'

// Lazy load all pages for code splitting
const HomePage             = lazy(() => import('./pages/HomePage.jsx'))
const TasksPage            = lazy(() => import('./pages/TasksPage.jsx'))
const CalendarPage         = lazy(() => import('./pages/CalendarPage.jsx'))
const HabitsPage           = lazy(() => import('./pages/HabitsPage.jsx'))
const GoalsPage            = lazy(() => import('./pages/GoalsPage.jsx'))
const ProjectsPage         = lazy(() => import('./pages/ProjectsPage.jsx'))
const FinancePage          = lazy(() => import('./pages/FinancePage.jsx'))
const HealthWellnessPage   = lazy(() => import('./pages/HealthWellnessPage.jsx'))
const ProductivityPage     = lazy(() => import('./pages/ProductivityPage.jsx'))
const LifestylePage        = lazy(() => import('./pages/LifestylePage.jsx'))
const FaithPage            = lazy(() => import('./pages/FaithPage.jsx'))
const GrowthPage           = lazy(() => import('./pages/GrowthPage.jsx'))
const MorePage             = lazy(() => import('./pages/MorePage.jsx'))

const PageLoader = () => (
  <div style={{
    minHeight: '100vh', display: 'flex', alignItems: 'center',
    justifyContent: 'center', background: 'var(--warm-white)',
  }}>
    <div style={{
      width: 36, height: 36, borderRadius: '50%',
      border: '3px solid var(--teal)', borderTopColor: 'transparent',
      animation: 'spin 0.7s linear infinite',
    }} />
  </div>
)

function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/"               element={<Layout />}>
          <Route index                element={<HomePage />} />
          <Route path="tasks"         element={<TasksPage />} />
          <Route path="calendar"      element={<CalendarPage />} />
          <Route path="habits"        element={<HabitsPage />} />
          <Route path="goals"         element={<GoalsPage />} />
          <Route path="projects"      element={<ProjectsPage />} />
          <Route path="finance"       element={<FinancePage />} />
          <Route path="wellness"      element={<HealthWellnessPage />} />
          <Route path="productivity"  element={<ProductivityPage />} />
          <Route path="lifestyle"     element={<LifestylePage />} />
          <Route path="faith"         element={<FaithPage />} />
          <Route path="growth"        element={<GrowthPage />} />
          <Route path="more"          element={<MorePage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}

export default function App() {
  return (
    <AppErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <AuthGate>
            <AppRoutes />
          </AuthGate>
        </AuthProvider>
      </BrowserRouter>
    </AppErrorBoundary>
  )
}
