// First-run walkthrough and the getting-started checklist.
import React from 'react'

// ── Onboarding Walkthrough ────────────────────────────────────────────────
const ONBOARDING_STEPS = [
  {
    icon: '👋',
    title: 'Welcome to The Living Planner',
    message: "A complete life planning system built around faith, discipline, and intentional growth. Let's take a quick tour.",
    cta: 'Get Started',
  },
  {
    icon: '✝',
    title: 'Faith First',
    message: 'Begin each morning in stillness. Devotional, prayer, scripture, and gratitude — woven into your day.',
    cta: 'Next →',
  },
  {
    icon: '✓',
    title: 'Daily Tasks & Habits',
    message: 'Small disciplines, repeated daily, become a different life. Plan your tasks, track your habits.',
    cta: 'Next →',
  },
  {
    icon: '🎯',
    title: 'Goals & Growth',
    message: 'Aim higher. Set goals across nine dimensions of life. Reflect each Sunday. Watch yourself grow.',
    cta: 'Next →',
  },
  {
    icon: '💰',
    title: 'Financial Clarity',
    message: 'Stewardship begins with clarity. Budget weekly. Track honestly. Build wealth slowly.',
    cta: 'Next →',
  },
  {
    icon: '🌿',
    title: 'Whole-Life Wellness',
    message: 'You are body, mind, and spirit. The Living Planner honors all three.',
    cta: 'Start Planning',
  },
]

function OnboardingWalkthrough({ onComplete }) {
  const [step, setStep] = React.useState(0)
  const current = ONBOARDING_STEPS[step]
  const isLast = step === ONBOARDING_STEPS.length - 1

  const next = () => {
    if (isLast) {
      try { localStorage.setItem('planner_onboarded', '1') } catch {}
      onComplete()
    } else {
      setStep(s => s + 1)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(10,18,30,.92)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        background: 'var(--warm-white, white)',
        borderRadius: 24, padding: '44px 32px',
        maxWidth: 380, width: '100%', textAlign: 'center',
        boxShadow: '0 32px 80px rgba(0,0,0,.4)',
      }}>
        {/* Progress dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 32 }}>
          {ONBOARDING_STEPS.map((_, i) => (
            <div key={i} style={{
              width: i === step ? 20 : 7, height: 7, borderRadius: 999,
              background: i === step ? 'var(--teal, #2A9D8F)' : 'var(--border2, #E5E7EB)',
              transition: 'all .3s ease',
            }} />
          ))}
        </div>

        {/* Icon */}
        <div style={{ fontSize: '3.5rem', marginBottom: 20 }}>{current.icon}</div>

        {/* Title */}
        <h2 style={{
          fontSize: '1.25rem', fontWeight: 700,
          color: 'var(--ink, #1A2332)', marginBottom: 12, lineHeight: 1.3,
        }}>{current.title}</h2>

        {/* Message */}
        <p style={{
          fontSize: '.9rem', color: 'var(--ink2, #4B5563)',
          lineHeight: 1.7, marginBottom: 32,
        }}>{current.message}</p>

        {/* CTA button */}
        <button onClick={next} style={{
          width: '100%', padding: '13px',
          background: 'var(--teal, #2A9D8F)', color: 'white',
          border: 'none', borderRadius: 12,
          fontSize: '1rem', fontWeight: 700, cursor: 'pointer',
          transition: 'all .2s',
        }}
          onMouseEnter={e => e.target.style.opacity = '.88'}
          onMouseLeave={e => e.target.style.opacity = '1'}
        >{current.cta}</button>

        {/* Skip */}
        {!isLast && (
          <button onClick={() => {
            try { localStorage.setItem('planner_onboarded', '1') } catch {}
            onComplete()
          }} style={{
            marginTop: 14, background: 'none', border: 'none',
            color: 'var(--muted, #9CA3AF)', fontSize: '.82rem',
            cursor: 'pointer',
          }}>Skip tour</button>
        )}
      </div>
    </div>
  )
}



function OnboardingChecklist({ settings, profile, tasks, goals, projects, updateSettings }) {
  const steps = [
    { label: 'Add your name', done: Boolean(profile.displayName) },
    { label: 'Create at least one goal', done: goals.length > 0 },
    { label: 'Create at least one project', done: projects.length > 0 },
    { label: 'Create at least three tasks', done: tasks.length >= 3 },
  ]
  const doneCount = steps.filter((step) => step.done).length

  return (
    <section className="card">
      <div className="section-title-row">
        <h3>Onboarding</h3>
        <button className="ghost-btn" onClick={() => updateSettings({ ...settings, onboardingComplete: true })}>Mark Complete</button>
      </div>
      <p className="muted">{doneCount + '/' + steps.length + ' setup steps finished'}</p>
      {steps.map((step) => <div key={step.label} className="metric-row"><span>{step.label}</span><strong>{step.done ? 'Done' : 'Open'}</strong></div>)}
    </section>
  )
}
