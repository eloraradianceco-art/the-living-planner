// The database connection (Supabase). The App Store app carries the public address and key itself.
import { createClient } from '@supabase/supabase-js'
import { isNative, nativeAuthStorage } from '../native.js'

// ── Supabase ──────────────────────────────────────────────────────────────
// The website reads these from Vercel settings. The App Store app is built without them, so it
// carries the planner's public database address and public (anon) key, which every browser receives anyway.
const NATIVE_SUPABASE_URL = 'https://pxvgolgwrlqzjykvzzzy.supabase.co'
const NATIVE_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4dmdvbGd3cmxxemp5a3Z6enp5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMjQxODIsImV4cCI6MjA5MjcwMDE4Mn0.MtT8fz4P_V1yZG-T1t1pO-FZeQk4Ua8J404Mvi65ZYI'
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || (isNative ? NATIVE_SUPABASE_URL : '')
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || (isNative ? NATIVE_SUPABASE_ANON_KEY : '')
const hasSupabaseEnv = Boolean(supabaseUrl && supabaseAnonKey)
const supabase = hasSupabaseEnv
  ? createClient(supabaseUrl, supabaseAnonKey, {
      // In the phone app the sign-in lives in the phone's own storage (iOS can clear web storage).
      auth: isNative
        ? { storage: nativeAuthStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
        : { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    })
  : null

export { hasSupabaseEnv, supabase }
