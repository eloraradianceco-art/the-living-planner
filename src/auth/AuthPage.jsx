// Welcome, tour, sign-up and sign-in screens.
import { useEffect, useState } from 'react'
import { isNative, WEB_ORIGIN } from '../native.js'
import { supabase } from '../lib/supabase.js'
import { useAuth } from './AuthContext.jsx'
import { BrandMark } from '../components/PageHeader.jsx'

// ── Components ────────────────────────────────────────────────────────────

function AuthGate({ children, fallback }) {
  const { loading, isAuthenticated } = useAuth()

  if (loading) {
    return (
      <div className="auth-shell" style={{background:'var(--ink)'}}>
        <div style={{textAlign:'center'}}>
          <div style={{marginBottom:18}}><img src="/icon-192.png" alt="" width="72" height="72" style={{width:72,height:72,borderRadius:16,boxShadow:'0 6px 22px rgba(0,0,0,.45)'}} /></div>
          <p style={{color:'var(--brass-fg)',fontSize:'.75rem',fontWeight:700,letterSpacing:'.15em',textTransform:'uppercase',marginBottom:8}}>The Living Planner</p>
          <p style={{color:'rgba(255,255,255,.64)',fontSize:'.88rem'}}>Loading your workspace…</p>
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
  // Each step starts at the top of the page (the page itself scrolls now)
  useEffect(() => { try { window.scrollTo(0, 0) } catch {} }, [step])

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

  // Same emoji the app's menu and the website use for each section
  const SECTIONS = [
    { emoji: '🙏', title: 'Faith', desc: 'Devotionals, prayer journal, scripture, sermon notes, and Bible reading.' },
    { emoji: '📅', title: 'Tasks & Calendar', desc: 'Capture everything, schedule anything, and never miss what matters.' },
    { emoji: '🎯', title: 'Goals & Habits', desc: 'Break goals and projects into steps you check off, build routines, and watch your Life Score rise.' },
    { emoji: '💰', title: 'Finance & Budget', desc: 'Monthly income, bills, savings goals, debt payoff, and giving.' },
    { emoji: '❤️', title: 'Health & Wellness', desc: 'Training, recovery, nutrition, sleep, mood, journal, vitals, and medications.' },
    { emoji: '⚡', title: 'Productivity', desc: 'Brain dump, notes, mind maps, checklists, and a focus timer.' },
    { emoji: '🏡', title: 'Lifestyle', desc: 'Groceries, recipes that fill your shopping list, cleaning, trips, birthdays, and gifts.' },
  ]

  // ── Welcome screen ──────────────────────────────────────────────────────
  if (step === 'welcome') return (
    <div className="auth-shell" style={{background:'var(--navy)'}}>
      <div style={{maxWidth:460, width:'100%', padding:'0 20px', textAlign:'center'}}>
        <div style={{marginBottom:22}}><BrandMark size={68} ink="#1C1C1E" /></div>
        <p style={{color:'var(--brass-fg)', fontSize:'.72rem', fontWeight:700, letterSpacing:'.28em', textTransform:'uppercase', marginBottom:12}}>The Living Planner</p>
        <h1 style={{color:'white', fontSize:'2.35rem', fontFamily:'var(--serif)', fontWeight:400, letterSpacing:'-.01em', lineHeight:1.12, marginBottom:16}}>
          Plan with clarity.<br/>Live with purpose.
        </h1>
        <p style={{color:'rgba(255,255,255,.80)', fontSize:'.95rem', lineHeight:1.7, marginBottom:32}}>
          One place for your tasks, goals, habits, finances, health, and everything in between.
        </p>
        <div style={{display:'grid', gap:6}}>
          <button onClick={() => setStep('features')}
            style={{background:'linear-gradient(180deg, #C9A86B 0%, var(--brass) 55%, var(--brass2) 100%)', color:'#1C1C1E', border:'none', borderRadius:999, padding:'15px 24px', fontWeight:700, fontSize:'1rem', letterSpacing:'.01em', cursor:'pointer', fontFamily:'inherit', boxShadow:'0 10px 30px rgba(184,150,90,.28)'}}>
            See What's Inside →
          </button>
          <button onClick={() => { setIsSignup(false); setStep('signin') }}
            style={{background:'rgba(255,255,255,.12)', color:'rgba(255,255,255,.90)', border:'1.5px solid rgba(255,255,255,.25)', borderRadius:999, padding:'12px 24px', fontWeight:600, fontSize:'.9rem', cursor:'pointer', fontFamily:'inherit'}}>
            I already have an account
          </button>
        </div>
      </div>
    </div>
  )

  // ── Features walkthrough ────────────────────────────────────────────────
  if (step === 'features') return (
    <div className="auth-shell" style={{background:'var(--navy)', paddingBottom:'calc(120px + env(safe-area-inset-bottom, 0px))'}}>
      <div style={{maxWidth:460, width:'100%', padding:'0 20px'}}>
        <button onClick={() => setStep('welcome')}
          style={{background:'none', border:'none', color:'rgba(255,255,255,.64)', cursor:'pointer', fontSize:'.85rem', marginBottom:24, fontFamily:'inherit'}}>
          ← Back
        </button>
        <p style={{color:'var(--brass-fg)', fontSize:'.72rem', fontWeight:700, letterSpacing:'.2em', textTransform:'uppercase', marginBottom:8}}>Everything in one place</p>
        <h2 style={{color:'white', fontFamily:'var(--serif)', fontWeight:400, fontSize:'1.9rem', marginBottom:20}}>What's inside your planner</h2>
        <div style={{display:'grid', gap:10, marginBottom:28}}>
          {SECTIONS.map(s => (
            <div key={s.title} style={{background:'rgba(255,255,255,.09)', border:'1px solid rgba(184,150,90,.25)', borderRadius:'var(--radius)', padding:'12px 14px', display:'flex', gap:12, alignItems:'flex-start'}}>
              <span aria-hidden="true" style={{width:42,height:42,borderRadius:12,flexShrink:0,display:'grid',placeItems:'center',background:'rgba(184,150,90,.12)',border:'1px solid rgba(184,150,90,.3)',fontSize:'1.3rem',lineHeight:1}}>{s.emoji}</span>
              <div>
                <div style={{fontWeight:700, color:'#FFFFFF', fontSize:'1rem', marginBottom:3}}>{s.title}</div>
                <div style={{fontSize:'.9rem', color:'rgba(255,255,255,.74)', lineHeight:1.5}}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{display:'grid', gap:6}}>
          <button onClick={() => { setIsSignup(mode === 'supabase'); setStep('signin') }}
            style={{background:'linear-gradient(180deg, #C9A86B 0%, var(--brass) 55%, var(--brass2) 100%)', color:'#1C1C1E', border:'none', borderRadius:999, padding:'15px 24px', fontWeight:700, fontSize:'1rem', letterSpacing:'.01em', cursor:'pointer', fontFamily:'inherit', boxShadow:'0 10px 30px rgba(184,150,90,.28)'}}>
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
            {loading ? 'Working…' : isSignup ? 'Create Account' : 'Sign In'}
          </button>
          {mode === 'supabase' && (
            <button type="button" className="ghost-btn" onClick={() => setIsSignup(c => !c)}>
              {isSignup ? 'Already have an account? Sign in' : 'Need an account? Sign up'}
            </button>
          )}
          {mode === 'supabase' && !isSignup && (
            <button type="button" onClick={async () => {
              if (!email) { setError('Enter your email above first.'); return }
              setLoading(true); setError('')
              const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: (isNative ? WEB_ORIGIN : window.location.origin) + '/reset-password'
              })
              setLoading(false)
              if (resetError) setError(resetError.message)
              else setMessage('Password reset email sent. Check your inbox.')
            }} style={{background:'none',border:'none',color:'var(--muted)',fontSize:'.8rem',cursor:'pointer',fontFamily:'inherit',padding:'4px 0',textDecoration:'underline'}}>
              Forgot password?
            </button>
          )}
        </form>
      </div>
    </div>
  )
}

export { AuthGate, AuthPage }
