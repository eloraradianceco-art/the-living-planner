import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { hasSupabaseEnv, supabase } from '../lib/supabase'

const AuthContext = createContext(null)
const MOCK_EMAIL = 'demo@planner.local'

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState(hasSupabaseEnv ? 'supabase' : 'mock')

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
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session ?? null)
      setUser(data.session?.user ?? null)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null)
      setUser(nextSession?.user ?? null)
      setLoading(false)
    })

    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [])

  const signIn = async ({ email, password }) => {
    if (mode === 'mock') {
      const mockUser = { id: 'mock-user', email: email || MOCK_EMAIL }
      window.localStorage.setItem('planner.mock.user', JSON.stringify(mockUser))
      setUser(mockUser)
      setSession({ user: mockUser })
      return { data: { user: mockUser }, error: null }
    }
    if (!hasSupabaseEnv) return { data: null, error: new Error('Supabase env vars are missing. Add them in .env first.') }
    return supabase.auth.signInWithPassword({ email, password })
  }

  const signUp = async ({ email, password }) => {
    if (mode === 'mock') {
      return signIn({ email, password })
    }
    if (!hasSupabaseEnv) return { data: null, error: new Error('Supabase env vars are missing. Add them in .env first.') }
    return supabase.auth.signUp({ email, password })
  }

  const signOut = async () => {
    if (mode === 'mock') {
      window.localStorage.removeItem('planner.mock.user')
      setUser(null)
      setSession(null)
      return { error: null }
    }
    if (!hasSupabaseEnv) return { error: null }
    return supabase.auth.signOut()
  }

  const value = useMemo(() => ({
    session,
    user,
    loading,
    isAuthenticated: Boolean(user),
    signIn,
    signUp,
    signOut,
    mode,
    setMode,
  }), [session, user, loading, mode])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
