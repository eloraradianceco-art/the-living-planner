// Sign-in state: the signed-in account, sign up / in / out, and clearing this device's copy on sign-out.
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { isNative, WEB_ORIGIN, storeSignOut } from '../native.js'
import { hasSupabaseEnv, supabase } from '../lib/supabase.js'

// ── Auth Context ──────────────────────────────────────────────────────────
const AuthContext = createContext(null)
const MOCK_EMAIL = ''

// Each page keeps a device copy of the account's data in localStorage so it opens instantly.
// Those copies belong to whoever is signed in: on sign-out, or when a different account signs in
// on this device, they're cleared so one person's planner never shows up (or gets saved) under another's.
const DEVICE_ONLY_KEYS = new Set(['planner_a2hs_seen', 'planner_onboarded', 'planner.vapidPub', 'planner.lastUser', 'planner_upgrade_intent'])
function clearAccountCache() {
  try {
    const keys = []
    for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i))
    keys.forEach((k) => {
      if (!k || DEVICE_ONLY_KEYS.has(k) || k.startsWith('sb-') || k.startsWith('supabase') || k.startsWith('CapacitorStorage.')) return
      localStorage.removeItem(k)
    })
  } catch {}
}
function noteSignedInUser(u) {
  if (!u?.id) return
  try {
    const last = localStorage.getItem('planner.lastUser')
    if (last && last !== u.id) clearAccountCache()
    localStorage.setItem('planner.lastUser', u.id)
  } catch {}
}

function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState('supabase')

  useEffect(() => {
    if (!hasSupabaseEnv) {
      const stored = window.localStorage.getItem('planner.mock.user')
      if (stored) {
        const parsed = JSON.parse(stored)
        setUser(parsed)
        setSession({ user: parsed })
      }
      setLoading(false)
      return
    }
    let mounted = true
    supabase.auth.getSession().then(( { data }) => {
      if (!mounted) return
      noteSignedInUser(data.session?.user)
      setSession(data.session ?? null)
      setUser(data.session?.user ?? null)
      setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      noteSignedInUser(nextSession?.user)
      setSession(nextSession ?? null)
      setUser(nextSession?.user ?? null)
      setLoading(false)
    })
    return () => { mounted = false; listener.subscription.unsubscribe() }
  }, [])

  const signIn = async ({ email, password }) => {
    if (mode === 'mock') {
      const mockUser = { id: 'mock-user', email: email || MOCK_EMAIL }
      window.localStorage.setItem('planner.mock.user', JSON.stringify(mockUser))
      setUser(mockUser); setSession({ user: mockUser })
      return { data: { user: mockUser }, error: null }
    }
    if (!hasSupabaseEnv) return { data: null, error: new Error('Supabase env vars missing.') }
    return supabase.auth.signInWithPassword({ email, password })
  }

  const signUp = async ({ email, password }) => {
    if (mode === 'mock') return signIn({ email, password })
    if (!hasSupabaseEnv) return { data: null, error: new Error('Supabase env vars missing.') }
    return supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: isNative ? WEB_ORIGIN : window.location.origin }
    })
  }

  const signOut = async () => {
    if (mode === 'mock') {
      window.localStorage.removeItem('planner.mock.user')
      setUser(null); setSession(null)
      return { error: null }
    }
    if (!hasSupabaseEnv) return { error: null }
    const res = await supabase.auth.signOut()
    storeSignOut()
    clearAccountCache()
    try { localStorage.removeItem('planner.lastUser') } catch {}
    return res
  }

  const value = useMemo(() => ({
    session, user, loading, isAuthenticated: Boolean(user),
    signIn, signUp, signOut, mode, setMode,
  }), [session, user, loading, mode])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

export { AuthProvider, useAuth }
