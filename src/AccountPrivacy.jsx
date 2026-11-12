import { useState } from 'react'

// "Privacy & Account" section for Settings: policy links, help, and account deletion.
// Same file in every Elora Radiance app; each app passes its own colors through `theme`.
//   theme:   { text, muted, card, border, danger, dangerF, dangerB, dark, body?, heading? }
//   deletes: what deleting removes (defaults to the shared Elora Radiance account)

const LINKS = [
  { icon: '🔒', label: 'Privacy Policy', href: 'https://eloraradiance.com/privacy.html', action: 'Read' },
  { icon: '📄', label: 'Terms of Service', href: 'https://eloraradiance.com/terms.html', action: 'Read' },
  { icon: '💬', label: 'Help & Support', href: 'https://eloraradiance.com/support.html', action: 'Open' },
]
const SHARED_ACCOUNT = 'This permanently deletes your Elora Radiance account and everything saved in it, in every app: Anchored Steps Year 1 and Year 2, Armed & Anchored, and The Red Letters. That includes your journals, progress, saved verses, reminders and reviews. It can\'t be undone.'

export default function AccountPrivacy({ supabase, theme: t, label = 'Privacy & Account', deletes = SHARED_ACCOUNT }) {
  const body = t.body || "'EB Garamond',Georgia,serif"
  const heading = t.heading || "'Cinzel',Georgia,serif"
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const ready = typed.trim().toUpperCase() === 'DELETE'

  const remove = async () => {
    if (!ready || busy) return
    setBusy(true); setError('')
    const { data, error: rpcError } = await supabase.rpc('delete_my_account')
    if (data === 'active_subscription') {
      setError('You still have an active subscription. Cancel it first (email support@eloraradiance.com), then delete your account.')
      setBusy(false)
      return
    }
    if (rpcError) {
      setError("We couldn't delete your account. Please try again, or email support@eloraradiance.com and we'll do it for you.")
      setBusy(false)
      return
    }
    try { await supabase.auth.signOut({ scope: 'local' }) } catch { /* account is already gone */ }
    try { localStorage.clear() } catch { /* private mode */ }
    window.location.replace(window.location.pathname)
  }

  const rowButton = {
    background: 'transparent', border: `1px solid ${t.border}`, color: t.muted, padding: '6px 14px',
    borderRadius: 10, fontSize: 12, fontFamily: heading, letterSpacing: '0.06em', cursor: 'pointer', textDecoration: 'none',
  }

  return (
    <div>
      <div style={{ marginTop: 24, marginBottom: 8 }}>
        <div style={{ fontSize: 9, color: t.muted, letterSpacing: '0.14em', textTransform: 'uppercase', fontFamily: heading, marginBottom: 4 }}>{label}</div>
      </div>
      <div style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 14, padding: '0 16px' }}>
        {LINKS.map((l) => (
          <div key={l.href} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0', borderBottom: `1px solid ${t.border}` }}>
            <span style={{ fontSize: 18, width: 26, textAlign: 'center' }} aria-hidden="true">{l.icon}</span>
            <span style={{ flex: 1, fontSize: 16, color: t.text, fontFamily: body }}>{l.label}</span>
            <a href={l.href} target="_blank" rel="noopener noreferrer" style={rowButton} aria-label={`${l.action} ${l.label}`}>{l.action}</a>
          </div>
        ))}

        <div style={{ padding: '14px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 18, width: 26, textAlign: 'center' }} aria-hidden="true">🗑️</span>
            <span style={{ flex: 1, fontSize: 16, color: t.text, fontFamily: body }}>Delete Account</span>
            {!open && (
              <button type="button" onClick={() => setOpen(true)} style={{ ...rowButton, background: t.dangerF, border: `1px solid ${t.dangerB}`, color: t.danger }}>
                Delete
              </button>
            )}
          </div>

          {open && (
            <div style={{ marginTop: 12, paddingLeft: 38 }}>
              <p style={{ fontSize: 15, lineHeight: 1.6, color: t.text, fontFamily: body, margin: '0 0 10px' }}>{deletes}</p>
              <p style={{ fontSize: 14, lineHeight: 1.6, color: t.muted, fontFamily: body, fontStyle: 'italic', margin: '0 0 12px' }}>
                Purchases are not refunded. A record of each purchase is kept for tax purposes.
              </p>
              <label style={{ display: 'block', fontSize: 14, color: t.muted, fontFamily: body, marginBottom: 6 }}>
                Type DELETE to confirm
              </label>
              <input
                value={typed} onChange={(e) => setTyped(e.target.value)} autoCapitalize="characters" autoCorrect="off" spellCheck={false}
                aria-label="Type DELETE to confirm"
                style={{
                  width: '100%', maxWidth: 260, background: 'transparent', border: `1px solid ${t.border}`, borderRadius: 8,
                  color: t.text, padding: '8px 10px', fontSize: 16, fontFamily: body, boxSizing: 'border-box',
                  colorScheme: t.dark ? 'dark' : 'light',
                }}
              />
              <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => { setOpen(false); setTyped(''); setError('') }} disabled={busy} style={rowButton}>
                  Cancel
                </button>
                <button type="button" onClick={remove} disabled={!ready || busy} style={{
                  ...rowButton, background: ready ? t.danger : t.dangerF, border: `1px solid ${t.dangerB}`,
                  color: ready ? '#fff' : t.danger, opacity: ready ? 1 : 0.6, cursor: ready && !busy ? 'pointer' : 'default',
                }}>
                  {busy ? 'Deleting…' : 'Delete forever'}
                </button>
              </div>
              {error && <div role="alert" style={{ marginTop: 10, fontSize: 14, color: t.danger, fontFamily: body }}>{error}</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
