import { useAuth } from '../context/AuthContext'

export default function AuthGate({ children, fallback }) {
  const { loading, isAuthenticated } = useAuth()

  if (loading) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <p className="eyebrow">Loading</p>
          <h1>Checking your planner session…</h1>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) return fallback
  return children
}
