import React from 'react'

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

export default OnboardingChecklist
