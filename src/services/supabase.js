// ── Supabase Client ────────────────────────────────────────────────────
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Routes, Route, Link, BrowserRouter, useLocation, useNavigate } from 'react-router-dom'

// ── Supabase ──────────────────────────────────────────────────────────────
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const hasSupabaseEnv = Boolean(supabaseUrl && supabaseAnonKey)
const supabase = hasSupabaseEnv
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    })
  : null

// ── Date utils ────────────────────────────────────────────────────────────
const APP_TIME_ZONE = 'America/Chicago'


export { supabase, hasSupabaseEnv };
