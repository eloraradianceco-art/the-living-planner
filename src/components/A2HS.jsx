// Add to Home Screen instructions (website only).
import { isNative } from '../native.js'
import { BrandMark } from './PageHeader.jsx'

// ── Add to Home Screen (PWA install instructions) ────────────────
const A2HS_PLATFORMS = [
  { os: 'iPhone & iPad · Safari', steps: ['Tap the Share button (square with an arrow) — bottom of the screen on iPhone, top on iPad', 'Scroll down and tap "Add to Home Screen"', 'Tap "Add" — then open the planner from that icon'] },
  { os: 'iPhone & iPad · Chrome', steps: ['Tap the Share button in the address bar', 'Tap "Add to Home Screen"', 'Tap "Add" — then open the planner from that icon'] },
  { os: 'Android · Chrome', steps: ['Tap the three-dot menu ⋮ at the top right', 'Tap "Add to Home screen" or "Install app"', 'Tap "Add" — then open the planner from that icon'] },
]

function isStandalone() {
  if (isNative) return true // the App Store app is already installed
  try {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
  } catch { return false }
}

function A2HSInstructions() {
  return (
    <div style={{ textAlign: 'left' }}>
      <p style={{ fontSize: '.9rem', color: 'var(--ink2,#4B5563)', lineHeight: 1.65, marginBottom: 18, textAlign: 'center' }}>
        The Living Planner works like a native app — add it to your Home Screen for instant, full-screen, one-tap access.
      </p>
      {A2HS_PLATFORMS.map(p => (
        <div key={p.os} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: '.64rem', fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color:'var(--brass-fg)', marginBottom: 8 }}>{p.os}</div>
          {p.steps.map((step, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 6, alignItems: 'flex-start' }}>
              <span style={{ flexShrink: 0, width: 20, height: 20, borderRadius: 999, background: 'var(--ink)', color:'var(--brass-fg)', fontSize: '.7rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>{i + 1}</span>
              <span style={{ fontSize: '.86rem', color: 'var(--ink2,#4B5563)', lineHeight: 1.5 }}>{step}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function A2HSModal({ onClose }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(10,18,30,.92)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--warm-white,white)', borderRadius: 24, padding: '36px 28px', maxWidth: 400, width: '100%', boxShadow: '0 32px 80px rgba(0,0,0,.4)', maxHeight: '88vh', overflowY: 'auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <div style={{ marginBottom: 12 }}><BrandMark size={48} ink="#FDFCFA" /></div>
          <h2 style={{ fontFamily: 'var(--serif)', fontSize: '1.6rem', fontWeight: 500, color: 'var(--ink)', margin: 0 }}>Add to Your Home Screen</h2>
        </div>
        <A2HSInstructions />
        <button onClick={onClose} style={{ width: '100%', padding: '13px', marginTop: 8, background: 'var(--ink)', color: 'var(--warm-white)', border: 'none', borderRadius: 999, fontSize: '1rem', fontWeight: 700, cursor: 'pointer' }}>Got it</button>
      </div>
    </div>
  )
}

export { isStandalone, A2HSModal }
