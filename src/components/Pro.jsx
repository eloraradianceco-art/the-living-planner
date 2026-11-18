// Pro: welcome banner, locked-tab gates, the upgrade sheet and App Store plans.
import React, { useState } from 'react'
import { isNative, purchasesInApp, storePlans, storeBuy, storeRestore } from '../native.js'
import { STRIPE_CONFIG, PRO_PRICE_LINE, PRO_FEATURES, plannerCheckoutUrl } from '../lib/subscription.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { PageNav } from './PageNav.jsx'
import { PageHeader } from './PageHeader.jsx'

// ── Welcome Pro Banner ────────────────────────────────────────────────────
function WelcomeProBanner({ state = 'done', onDismiss }) {
  const copy = state === 'confirming'
    ? { icon: '⏳', title: 'Confirming your subscription…', text: 'This usually takes a few seconds.' }
    : state === 'waiting'
      ? { icon: '⏳', title: 'Still confirming your payment', text: isNative ? "Pro turns on as soon as Apple confirms it. Open the planner again in a minute, or email support@eloraradiance.com." : "Pro turns on as soon as Stripe confirms it. Make sure you're signed in with the email you paid with, or email support@eloraradiance.com." }
      : { icon: '🎉', title: 'Welcome to Pro!', text: 'Every Pro feature is unlocked. Plan with faith, live with purpose.' }
  return (
    <div style={{
      position: 'fixed', top: 'calc(env(safe-area-inset-top, 0px) + 12px)', left: 16, right: 16, zIndex: 9999,
      maxWidth: 480, margin: '0 auto',
      background: 'linear-gradient(135deg, #23786D 0%, #1A2332 100%)',
      color: 'white', borderRadius: 16, padding: '16px 20px',
      boxShadow: '0 12px 40px rgba(0,0,0,.25)',
      display: 'flex', alignItems: 'center', gap: 12,
      animation: 'slideDown .4s ease',
    }}>
      <div style={{ fontSize: '2rem' }} aria-hidden="true">{copy.icon}</div>
      <div style={{ flex: 1 }} role="status" aria-live="polite">
        <div style={{ fontWeight: 700, fontSize: '.95rem', marginBottom: 2 }}>{copy.title}</div>
        <div style={{ fontSize: '.78rem', opacity: .9 }}>{copy.text}</div>
      </div>
      <button onClick={onDismiss} aria-label="Dismiss" style={{
        background: 'rgba(255,255,255,.2)', color: 'white', border: 'none',
        borderRadius: 999, width: 28, height: 28, cursor: 'pointer', fontWeight: 700,
      }}>✕</button>
    </div>
  )
}

// ── Pro-only Tab Configuration ────────────────────────────────────────────
// Each life area keeps one starter tab free (the first id not listed here).
const PRO_TABS = {
  faith: ['scripture', 'reading', 'gratitude', 'fasting', 'sermons', 'goals'],
  finance: ['overview', 'income', 'expenses', 'savings', 'debt', 'donations', 'nospend'],
  lifestyle: ['recipes', 'trips', 'birthdays', 'gifts', 'cleaning'],
  productivity: ['mindmap', 'checklists', 'focus'],
  wellness: ['training', 'recovery', 'nutrition', 'care', 'sleep', 'journal', 'routine', 'meds', 'metrics', 'anxiety', 'migraines', 'coping'],
}

function ProTabGate({ isPro, onUpgrade, children, title = 'Pro Feature', text, points }) {
  if (isPro) return children
  return (
    <div style={{
      padding: '40px 24px', textAlign: 'center',
      background: 'linear-gradient(135deg, var(--ink) 0%, #0B1829 100%)',
      borderRadius: 16, margin: '0 0 16px',
      border: '1px solid rgba(184,150,90,.2)',
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: '50%',
        background: 'rgba(184,150,90,.15)', border: '1.5px solid rgba(184,150,90,.3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 16px', fontSize: '1.6rem'
      }}>🔒</div>
      <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'white', marginBottom: 8 }}>
        {title}
      </div>
      {!purchasesInApp ? (
        <p style={{ fontSize: '.88rem', color: 'rgba(255,255,255,.8)', lineHeight: 1.6, maxWidth: 300, margin: '0 auto' }}>
          This is part of Living Planner Pro. If you have Pro, sign in with that account and it opens right up.
        </p>
      ) : (<>
      <p style={{ fontSize: '.88rem', color: 'rgba(255,255,255,.8)', lineHeight: 1.6, maxWidth: 300, margin: '0 auto 18px' }}>
        {text || 'Part of Living Planner Pro, with the full finance, wellness, faith and lifestyle tools, Life Score insights, and no limits.'}
      </p>
      {points && points.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 auto 20px', maxWidth: 300, textAlign: 'left', display: 'grid', gap: 8 }}>
          {points.map((p) => (
            <li key={p} style={{ display: 'flex', gap: 8, fontSize: '.86rem', color: 'rgba(255,255,255,.9)', lineHeight: 1.45 }}>
              <span style={{ color: 'var(--brass-fg, #D4B87A)', fontWeight: 800 }} aria-hidden="true">✓</span><span>{p}</span>
            </li>
          ))}
        </ul>
      )}
      <button onClick={onUpgrade} style={{
        padding: '13px 32px', borderRadius: 999,
        background: 'linear-gradient(135deg, var(--brass) 0%, var(--brass2) 100%)',
        color: 'white', border: 'none',
        fontSize: '.95rem', fontWeight: 700, cursor: 'pointer',
        boxShadow: '0 4px 20px rgba(184,150,90,.35)',
      }}>Unlock Pro →</button>
      <p style={{fontSize:'.75rem',color:'rgba(255,255,255,.72)',marginTop:12}}>{PRO_PRICE_LINE}</p>
      </>)}
    </div>
  )
}

// A whole section that is Pro (Growth): header stays, the page itself is a preview of what's inside.
function ProSectionGate({ isPro, onUpgrade, icon, title, subtitle, gateTitle, text, points, children }) {
  if (isPro) return children
  return (
    <div className="screen-stack">
      <PageHeader icon={icon} title={title} subtitle={subtitle} />
      <ProTabGate isPro={false} onUpgrade={onUpgrade} title={gateTitle} text={text} points={points} />
      <PageNav />
    </div>
  )
}


// ── App Store purchase (Apple in-app purchase through RevenueCat) ──────────
// Prices come from Apple for the person's own country. Pro attaches to the signed-in planner account.
// Apple requires: the price and period, how renewal works, Restore Purchases, and links to the terms and privacy policy.
function NativeProPlans({ onDone }) {
  const { user } = useAuth()
  const [plans, setPlans] = useState(undefined) // undefined = loading, null = store unavailable
  const [busy, setBusy] = useState(null)
  const [msg, setMsg] = useState('')
  React.useEffect(() => {
    let alive = true
    storePlans(user?.id).then((p) => { if (alive) setPlans(p && p.annual ? p : null) }).catch(() => { if (alive) setPlans(null) })
    return () => { alive = false }
  }, [user?.id])
  const finished = () => { window.dispatchEvent(new CustomEvent('planner-store-purchased')); onDone?.() }
  const buy = async (kind) => {
    const plan = plans?.[kind]
    if (!plan || busy) return
    setBusy(kind); setMsg('')
    const r = await storeBuy(user.id, plan.pkg)
    setBusy(null)
    if (r === 'pro') finished()
    else if (r === 'pending') setMsg('Your purchase is waiting for approval. Pro turns on as soon as it is approved.')
    else if (r && r.error) setMsg(r.error)
  }
  const restore = async () => {
    if (busy) return
    setBusy('restore'); setMsg('')
    const ok = await storeRestore(user.id)
    setBusy(null)
    if (ok) finished()
    else setMsg('No Living Planner Pro subscription was found for this Apple ID.')
  }
  const perMonth = (() => {
    const a = plans?.annual?.pkg?.product
    if (!a?.price || !a?.currencyCode) return null
    try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: a.currencyCode }).format(a.price / 12) } catch { return null }
  })()
  const btn = { display: 'block', width: '100%', padding: '14px', borderRadius: 14, fontWeight: 700, cursor: 'pointer', font: 'inherit', textAlign: 'center' }
  return (
    <div className="native-plans">
      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 18px', textAlign: 'left', display: 'grid', gap: 9 }}>
        {PRO_FEATURES.map(([emoji, name, detail]) => (
          <li key={name} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: '.86rem', lineHeight: 1.4, color: 'var(--ink)' }}>
            <span aria-hidden="true" style={{ fontSize: '1.05rem', lineHeight: 1.2 }}>{emoji}</span>
            <span><strong>{name}</strong> <span style={{ color: 'var(--ink2)' }}>· {detail}</span></span>
          </li>
        ))}
      </ul>
      {plans === undefined && <p className="muted" style={{ fontSize: '.85rem', margin: '0 0 16px' }}>Loading plans from the App Store…</p>}
      {plans === null && <p style={{ fontSize: '.85rem', color: 'var(--ink2)', lineHeight: 1.55, margin: '0 0 16px', background: 'var(--stone)', borderRadius: 12, padding: '12px 14px' }}>The App Store isn't reachable right now. Check your connection and try again.</p>}
      {plans && (
        <div style={{ display: 'grid', gap: 10, marginBottom: 12 }}>
          {plans.annual && (
            <button type="button" disabled={!!busy} onClick={() => buy('annual')} style={{ ...btn, background: 'var(--teal)', color: 'white', border: 'none', position: 'relative' }}>
              <div style={{ fontSize: '.95rem' }}>{busy === 'annual' ? 'Opening the App Store…' : `Yearly — ${plans.annual.price} a year`}</div>
              <div style={{ fontSize: '.78rem', opacity: .92, marginTop: 2, fontWeight: 600 }}>{perMonth ? `About ${perMonth} a month · ` : ''}Cancel anytime</div>
            </button>
          )}
        </div>
      )}
      {msg && <p role="status" style={{ fontSize: '.82rem', color: 'var(--ink)', background: 'var(--brass-dim, #F5EEDF)', borderRadius: 10, padding: '10px 12px', margin: '0 0 12px', lineHeight: 1.5 }}>{msg}</p>}
      <button type="button" disabled={!!busy} onClick={restore} style={{ background: 'none', border: 'none', color: 'var(--teal)', fontWeight: 700, fontSize: '.84rem', cursor: 'pointer', marginBottom: 12 }}>
        {busy === 'restore' ? 'Restoring…' : 'Restore purchases'}
      </button>
      <p className="native-plans-legal" style={{ fontSize: '.7rem', color: 'var(--muted)', lineHeight: 1.55, margin: '0 0 14px', textAlign: 'left' }}>
        Living Planner Pro is an auto-renewing subscription. Payment is charged to your Apple ID when you confirm. It renews
        automatically at the same price unless cancelled at least 24 hours before the end of the current period, and your
        account is charged for the renewal within 24 hours before the period ends. Manage or cancel anytime in your
        Apple ID's subscriptions (Settings → your name → Subscriptions). Pro is linked to the account you're signed in with.{' '}
        <a href="https://eloraradiance.com/terms.html" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--teal)' }}>Terms of Use</a>
        {' · '}
        <a href="https://eloraradiance.com/privacy.html" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--teal)' }}>Privacy Policy</a>
      </p>
    </div>
  )
}

// ── Upgrade Card ──────────────────────────────────────────────────────────
function UpgradeCard({ title, message, onClose }) {
  const { user } = useAuth()
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(10,18,30,.92)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 'max(env(safe-area-inset-top), 16px) 16px max(env(safe-area-inset-bottom), 16px)',
      overflowY: 'auto',
    }}>
      <div role="dialog" aria-modal="true" aria-label={title || 'Upgrade to Pro'} style={{
        background: 'var(--warm-white, white)', borderRadius: 24,
        padding: '28px 22px', maxWidth: 400, width: '100%', textAlign: 'center',
        boxShadow: '0 32px 80px rgba(0,0,0,.4)', margin: 'auto',
      }}>
        <div style={{ fontSize: '2.4rem', marginBottom: 10 }} aria-hidden="true">✨</div>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>
          {title || 'Upgrade to Pro'}
        </h2>
        <p style={{ fontSize: '.9rem', color: 'var(--ink2)', lineHeight: 1.6, marginBottom: 16 }}>
          {message || 'The whole planner, with no limits.'}
        </p>

        {!purchasesInApp ? (
          <p style={{ fontSize: '.85rem', color: 'var(--ink2)', lineHeight: 1.6, marginBottom: 20, background: 'var(--stone)', borderRadius: 12, padding: '12px 14px' }}>
            Pro can't be purchased in the app yet. If you already have Pro, sign in with that account and everything unlocks.
          </p>
        ) : isNative ? (
          <NativeProPlans onDone={onClose} />
        ) : (<>
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 20px', textAlign: 'left', display: 'grid', gap: 9 }}>
          {PRO_FEATURES.map(([emoji, name, detail]) => (
            <li key={name} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: '.86rem', lineHeight: 1.4, color: 'var(--ink)' }}>
              <span aria-hidden="true" style={{ fontSize: '1.05rem', lineHeight: 1.2 }}>{emoji}</span>
              <span><strong>{name}</strong> <span style={{ color: 'var(--ink2)' }}>· {detail}</span></span>
            </li>
          ))}
        </ul>

        <div style={{ display: 'grid', gap: 10, marginBottom: 20 }}>
          <a href={plannerCheckoutUrl(STRIPE_CONFIG.annualLink, user)} target="_blank" rel="noopener noreferrer" style={{
            display: 'block', padding: '16px', borderRadius: 14,
            background: 'var(--teal)', color: 'white', textDecoration: 'none',
            fontWeight: 700,
          }}>
            <div style={{ fontSize: '.95rem' }}>Get Pro — $49.99 a year</div>
            <div style={{ fontSize: '.78rem', opacity: .92, marginTop: 2 }}>About $4.17 a month · Cancel anytime</div>
          </a>
        </div>
        </>)}

        <button onClick={onClose} style={{
          background: 'none', border: 'none', color: 'var(--muted)',
          fontSize: '.82rem', cursor: 'pointer',
        }}>{purchasesInApp ? 'Maybe later' : 'OK'}</button>
      </div>
    </div>
  )
}

export { WelcomeProBanner, PRO_TABS, ProTabGate, ProSectionGate, UpgradeCard }
