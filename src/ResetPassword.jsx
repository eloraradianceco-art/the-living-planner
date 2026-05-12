import React, { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

export default function ResetPassword() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [status, setStatus] = useState('idle') // idle | loading | success | error
  const [message, setMessage] = useState('')
  const [sessionReady, setSessionReady] = useState(false)

  useEffect(() => {
    // Supabase fires onAuthStateChange with SIGNED_IN event when reset link is clicked
    if (!supabase) return
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY') {
        setSessionReady(true)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  const handleSubmit = async () => {
    if (!password) return setMessage('Please enter a new password.')
    if (password.length < 8) return setMessage('Password must be at least 8 characters.')
    if (password !== confirm) return setMessage('Passwords do not match.')
    if (!supabase) return setMessage('Supabase not configured.')

    setStatus('loading')
    setMessage('')

    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setStatus('error')
      setMessage(error.message)
    } else {
      setStatus('success')
      setMessage('Password updated! Redirecting to the app...')
      setTimeout(() => { window.location.href = '/' }, 2000)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--navy, #1A2332)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24, fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{
        background: 'white', borderRadius: 20, padding: '40px 32px',
        maxWidth: 400, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,.3)',
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: '2rem', marginBottom: 8 }}>🔒</div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#1A2332', marginBottom: 6 }}>
            Reset Your Password
          </h1>
          <p style={{ fontSize: '.88rem', color: '#6B7280' }}>
            Enter your new password below
          </p>
        </div>

        {status === 'success' ? (
          <div style={{
            textAlign: 'center', padding: '20px',
            background: '#f0fdf4', borderRadius: 12,
            color: '#16a34a', fontWeight: 600,
          }}>
            ✓ {message}
          </div>
        ) : (
          <>
            {/* Password field */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: '.82rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                New Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                style={{
                  width: '100%', padding: '11px 14px', boxSizing: 'border-box',
                  border: '1.5px solid #E5E7EB', borderRadius: 10,
                  fontSize: '.95rem', outline: 'none',
                }}
                onFocus={e => e.target.style.borderColor = '#2A9D8F'}
                onBlur={e => e.target.style.borderColor = '#E5E7EB'}
              />
            </div>

            {/* Confirm field */}
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: '.82rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                Confirm Password
              </label>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="Re-enter your password"
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                style={{
                  width: '100%', padding: '11px 14px', boxSizing: 'border-box',
                  border: '1.5px solid #E5E7EB', borderRadius: 10,
                  fontSize: '.95rem', outline: 'none',
                }}
                onFocus={e => e.target.style.borderColor = '#2A9D8F'}
                onBlur={e => e.target.style.borderColor = '#E5E7EB'}
              />
            </div>

            {/* Error message */}
            {message && status !== 'success' && (
              <div style={{
                marginBottom: 16, padding: '10px 14px',
                background: '#fef2f2', borderRadius: 8,
                color: '#dc2626', fontSize: '.85rem',
              }}>
                {message}
              </div>
            )}

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={status === 'loading'}
              style={{
                width: '100%', padding: '13px',
                background: status === 'loading' ? '#9CA3AF' : '#2A9D8F',
                color: 'white', border: 'none', borderRadius: 10,
                fontSize: '1rem', fontWeight: 700, cursor: status === 'loading' ? 'not-allowed' : 'pointer',
                transition: 'all .2s',
              }}
            >
              {status === 'loading' ? 'Updating...' : 'Update Password'}
            </button>

            {/* Back link */}
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <a href="/" style={{ fontSize: '.83rem', color: '#6B7280', textDecoration: 'none' }}>
                ← Back to app
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
