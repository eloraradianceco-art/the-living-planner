import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/PlannerContext.jsx'
import { supabase } from '../services/supabase.js'

function AuthGate({ children, fallback }) {
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


function AuthPage() {
  const { signIn, signUp, mode, setMode } = useAuth()
  const [step, setStep] = useState('welcome') // welcome | features | signin

  useEffect(() => {
    // Force dark background - override all CSS
    const style = document.createElement('style')
    style.id = 'auth-bg-override'
    style.textContent = 'html, body, #root { background: #1C1C1E !important; }'
    document.head.appendChild(style)
    document.body.style.setProperty('background', '#1C1C1E', 'important')
    document.documentElement.style.setProperty('background', '#1C1C1E', 'important')
    return () => {
      const el = document.getElementById('auth-bg-override')
      if (el) el.remove()
      document.body.style.removeProperty('background')
      document.documentElement.style.removeProperty('background')
    }
  }, [])
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

  const SECTIONS = [
    { icon: '✓', title: 'Tasks & Calendar', desc: 'Capture everything, schedule anything, and never miss what matters.' },
    { icon: '🎯', title: 'Goals & Projects', desc: 'Set goals that connect to your daily tasks and track real progress.' },
    { icon: '↑', title: 'Habits & Growth', desc: 'Build routines and watch your Life Score rise automatically.' },
    { icon: '💰', title: 'Finance & Budget', desc: 'Weekly spending targets, savings goals, and no-spend challenges.' },
    { icon: '💊', title: 'Health & Wellness', desc: 'Medication logs, sleep tracker, anxiety check-ins, daily routines.' },
    { icon: '🌍', title: 'Lifestyle Hub', desc: 'Groceries, contacts, trips, brain dump, passwords, birthdays.' },
  ]

  // ── Welcome screen ──────────────────────────────────────────────────────
  if (step === 'welcome') return (
    <div className="auth-shell" style={{background:'var(--navy)'}}>
      <div style={{maxWidth:460, width:'100%', padding:'0 20px', textAlign:'center'}}>
        <div style={{fontSize:'3rem', marginBottom:16}}>⚓</div>
        <p style={{color:'var(--teal)', fontSize:'.8rem', fontWeight:700, letterSpacing:'.15em', textTransform:'uppercase', marginBottom:8}}>The Living Planner</p>
        <h1 style={{color:'white', fontSize:'2rem', fontFamily:"'DM Serif Display', serif", lineHeight:1.2, marginBottom:16}}>
          Plan with clarity.<br/>Live with purpose.
        </h1>
        <p style={{color:'rgba(255,255,255,.80)', fontSize:'.95rem', lineHeight:1.7, marginBottom:32}}>
          One place for your tasks, goals, habits, finances, health, and everything in between.
        </p>
        <div style={{display:'grid', gap:10}}>
          <button onClick={() => setStep('features')}
            style={{background:'var(--teal)', color:'var(--navy)', border:'none', borderRadius:999, padding:'14px 24px', fontWeight:700, fontSize:'1rem', cursor:'pointer', fontFamily:'inherit'}}>
            See What's Inside →
          </button>
          <button onClick={() => setStep('signin')}
            style={{background:'rgba(255,255,255,.12)', color:'rgba(255,255,255,.90)', border:'1.5px solid rgba(255,255,255,.25)', borderRadius:999, padding:'12px 24px', fontWeight:600, fontSize:'.9rem', cursor:'pointer', fontFamily:'inherit'}}>
            I already have an account
          </button>
        </div>
      </div>
    </div>
  )

  // ── Features walkthrough ────────────────────────────────────────────────
  if (step === 'features') return (
    <div className="auth-shell" style={{background:'var(--navy)', alignItems:'flex-start', paddingTop:40}}>
      <div style={{maxWidth:460, width:'100%', padding:'0 20px'}}>
        <button onClick={() => setStep('welcome')}
          style={{background:'none', border:'none', color:'rgba(255,255,255,.4)', cursor:'pointer', fontSize:'.85rem', marginBottom:24, fontFamily:'inherit'}}>
          ← Back
        </button>
        <p style={{color:'var(--teal)', fontSize:'.75rem', fontWeight:700, letterSpacing:'.15em', textTransform:'uppercase', marginBottom:8}}>Everything in one place</p>
        <h2 style={{color:'white', fontFamily:"'DM Serif Display', serif", fontSize:'1.6rem', marginBottom:20}}>What's inside your planner</h2>
        <div style={{display:'grid', gap:10, marginBottom:28}}>
          {SECTIONS.map(s => (
            <div key={s.title} style={{background:'rgba(255,255,255,.09)', border:'1px solid rgba(184,150,90,.25)', borderRadius:'var(--radius)', padding:'12px 14px', display:'flex', gap:12, alignItems:'flex-start'}}>
              <div style={{fontSize:'1.3rem', flexShrink:0}}>{s.icon}</div>
              <div>
                <div style={{fontWeight:700, color:'#FFFFFF', fontSize:'.9rem', marginBottom:3}}>{s.title}</div>
                <div style={{fontSize:'.78rem', color:'rgba(255,255,255,.70)', lineHeight:1.5}}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{display:'grid', gap:10}}>
          <button onClick={() => setStep('signin')}
            style={{background:'var(--teal)', color:'var(--navy)', border:'none', borderRadius:999, padding:'14px 24px', fontWeight:700, fontSize:'1rem', cursor:'pointer', fontFamily:'inherit'}}>
            Get Started →
          </button>
        </div>
      </div>
    </div>
  )

  // ── Sign in screen ──────────────────────────────────────────────────────
  return (
    <div className="auth-shell" style={{background:'var(--navy)'}}>
      <div className="auth-card">
        <button onClick={() => setStep('welcome')}
          style={{background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:'.8rem', marginBottom:16, fontFamily:'inherit', padding:0}}>
          ← Back
        </button>
        <p className="eyebrow">The Living Planner</p>
        <h1 style={{marginBottom:6}}>Welcome{isSignup ? '' : ' back'}</h1>
        <p className="muted" style={{marginBottom:16, fontSize:'.85rem'}}>
          {isSignup ? 'Create your account to sync across devices.' : 'Sign in to pick up where you left off.'}
        </p>

        <div className="pill-row auth-mode-row">
          <button className={mode === 'mock' ? 'pill active-pill' : 'pill'} type="button" onClick={() => setMode('mock')}>
            ⚡ Demo Mode
          </button>
          <button className={mode === 'supabase' ? 'pill active-pill' : 'pill'} type="button" onClick={() => setMode('supabase')}>
            ☁ Sync Account
          </button>
        </div>

        {mode === 'mock' && (
          <div className="auth-demo-note">
            Demo mode saves to this device only. Your data stays here — no account needed. Start immediately.
          </div>
        )}

        <form className="auth-form" onSubmit={submit}>
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com" required={mode === 'supabase'} />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••" required={mode === 'supabase'} />
          </label>
          {error ? <p className="error-text">{error}</p> : null}
          {message ? <p className="success-text">{message}</p> : null}
          <button className="primary-btn" style={{marginTop:4}} disabled={loading}>
            {loading ? 'Working…' : mode === 'mock' ? 'Start Planning' : isSignup ? 'Create Account' : 'Sign In'}
          </button>
          {mode === 'supabase' && (
            <button type="button" className="ghost-btn" onClick={() => setIsSignup(c => !c)}>
              {isSignup ? 'Already have an account? Sign in' : 'Need an account? Sign up'}
            </button>
          )}
        </form>
      </div>
    </div>
  )
}


const tabs = [
  { to: '/', label: 'Home', icon: '⌂' },
  { to: '/tasks', label: 'Tasks', icon: '✓' },
  { to: '/calendar', label: 'Calendar', icon: '◷' },
  { to: '/growth', label: 'Growth', icon: '↑' },
  { to: '/more', label: 'More', icon: '⋯' },
]

// Additional routes not in bottom nav
const subRoutes = ['/habits', '/goals', '/finance', '/wellness', '/productivity', '/lifestyle', '/health', '/projects', '/faith']


export default AuthPage
