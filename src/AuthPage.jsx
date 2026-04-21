import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

export default function AuthPage() {
  const { signIn, signUp, mode, setMode } = useAuth()
  const [isSignup, setIsSignup] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')
    try {
      const action = isSignup ? signUp : signIn
      const { error: authError } = await action({ email, password })
      if (authError) throw authError
      setMessage(isSignup ? 'Account created. Welcome to your planner.' : 'Welcome back.')
    } catch (err) {
      setError(err.message || 'Authentication failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <p className="eyebrow">The Living Planner</p>
        <h1>Plan your life with clarity</h1>
        <p className="muted">Tasks, goals, habits, budget, and projects — all in one place. Try it instantly in demo mode or connect Supabase to sync your real data.</p>

        <div className="pill-row auth-mode-row" style={{marginTop: 20}}>
          <button
            className={mode === 'mock' ? 'pill active-pill' : 'pill'}
            type="button"
            onClick={() => setMode('mock')}
          >
            ⚡ Demo Mode
          </button>
          <button
            className={mode === 'supabase' ? 'pill active-pill' : 'pill'}
            type="button"
            onClick={() => setMode('supabase')}
          >
            ☁ Supabase Sync
          </button>
        </div>

        {mode === 'mock' && (
          <div className="auth-demo-note">
            Demo mode uses your browser's local storage. Your data stays on this device. No account needed.
          </div>
        )}

        <form className="form-grid auth-form" onSubmit={submit}>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required={mode === 'supabase'}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required={mode === 'supabase'}
            />
          </label>

          {error ? <p className="error-text full-span">{error}</p> : null}
          {message ? <p className="success-text full-span">{message}</p> : null}

          <div className="button-row full-span">
            <button className="primary-btn premium-btn" disabled={loading}>
              {loading ? 'Working…' : mode === 'mock' ? 'Start Planning' : isSignup ? 'Create account' : 'Sign in'}
            </button>
            {mode === 'supabase' && (
              <button
                type="button"
                className="ghost-btn"
                onClick={() => setIsSignup((c) => !c)}
              >
                {isSignup ? 'Already have an account?' : 'Need an account?'}
              </button>
            )}
          </div>
        </form>

        <div className="auth-features">
          <div className="auth-feature">
            <span>📋</span>
            <span>Tasks & Calendar</span>
          </div>
          <div className="auth-feature">
            <span>🎯</span>
            <span>Goals & Projects</span>
          </div>
          <div className="auth-feature">
            <span>📈</span>
            <span>Habits & Growth</span>
          </div>
          <div className="auth-feature">
            <span>💰</span>
            <span>Budget Tracking</span>
          </div>
        </div>
      </div>
    </div>
  )
}
