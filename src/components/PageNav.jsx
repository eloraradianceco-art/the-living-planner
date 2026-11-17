// Previous / next page navigation at the bottom of each page.
import { useLocation, useNavigate } from 'react-router-dom'
import { withEmoji } from './PageHeader.jsx'

// ── Page Navigator — consistent bottom nav across all pages ──────────────
const APP_PAGES = [
  { path: '/', label: '⌂ Home' },
  { path: '/tasks', label: '✓ Tasks' },
  { path: '/calendar', label: '◷ Calendar' },
  { path: '/projects', label: '📁 Projects' },
  { path: '/habits', label: '🔁 Habits' },
  { path: '/goals', label: '🎯 Goals' },
  { path: '/growth', label: '↑ Growth' },
  { path: '/finance', label: '💰 Finance' },
  { path: '/calculator', label: '🧮 Calculator' },
  { path: '/wellness', label: '🌿 Wellness' },
  { path: '/productivity', label: '⏱ Productivity' },
  { path: '/lifestyle', label: '🌟 Lifestyle' },
  { path: '/faith', label: '✝ Faith' },
  { path: '/more', label: '⋯ More' },
]

function PageNav() {
  const loc = useLocation()
  const nav = useNavigate()
  const idx = APP_PAGES.findIndex(p => p.path === loc.pathname)
  const prev = idx > 0 ? APP_PAGES[idx - 1] : null
  const next = idx < APP_PAGES.length - 1 ? APP_PAGES[idx + 1] : null
  if (!prev && !next) return null
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '16px 0 80px', borderTop: '1px solid var(--border)', marginTop: 24, gap: 8,
    }}>
      {prev
        ? <button onClick={() => nav(prev.path)} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '9px 16px', borderRadius: 999,
            border: '1.5px solid var(--border2)', background: 'var(--stone)',
            color: 'var(--ink2)', fontSize: '.82rem', fontWeight: 600, cursor: 'pointer',
          }}>← {withEmoji(prev.label)}</button>
        : <div />}
      {next
        ? <button onClick={() => nav(next.path)} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '9px 16px', borderRadius: 999,
            border: '1px solid var(--ink)', background: 'var(--ink)',
            color: 'var(--warm-white)', fontSize: '.82rem', fontWeight: 600, cursor: 'pointer',
          }}>{withEmoji(next.label)} →</button>
        : <div />}
    </div>
  )
}

export { PageNav }
