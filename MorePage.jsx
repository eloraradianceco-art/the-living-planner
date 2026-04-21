import { useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { getGoalProgress } from '../utils/scoring'

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
      <p className="muted">{doneCount}/{steps.length} setup steps finished</p>
      {steps.map((step) => <div key={step.label} className="metric-row"><span>{step.label}</span><strong>{step.done ? 'Done' : 'Open'}</strong></div>)}
    </section>
  )
}

export default function MorePage({ goals, tasks, projects, expenses, notes, budget, profile, settings, updateProfile, updateSettings, onEdit, onDelete, onQuickCreate }) {
  const { signOut } = useAuth()
  const [noteQuery, setNoteQuery] = useState('')
  const [expenseQuery, setExpenseQuery] = useState('')
  const totalSpent = expenses.reduce((sum, item) => sum + Number(item.amount), 0)

  const filteredNotes = useMemo(() => notes.filter((note) => !noteQuery || note.title.toLowerCase().includes(noteQuery.toLowerCase()) || note.content.toLowerCase().includes(noteQuery.toLowerCase())), [notes, noteQuery])
  const filteredExpenses = useMemo(() => expenses.filter((expense) => !expenseQuery || expense.category.toLowerCase().includes(expenseQuery.toLowerCase()) || (expense.note || '').toLowerCase().includes(expenseQuery.toLowerCase())), [expenses, expenseQuery])

  return (
    <div className="screen-stack">
      {!settings.onboardingComplete ? <OnboardingChecklist settings={settings} profile={profile} tasks={tasks} goals={goals} projects={projects} updateSettings={updateSettings} /> : null}

      <section className="card">
        <div className="section-title-row">
          <h3>Goals</h3>
          <button className="primary-btn" onClick={() => onQuickCreate('goal')}>Add Goal</button>
        </div>
        {goals.map((goal) => (
          <div key={goal.id} className="metric-row card-row">
            <div>
              <strong>{goal.title}</strong>
              <p>{goal.category} • {goal.targetDate}</p>
            </div>
            <div className="item-actions">
              <span>{getGoalProgress(goal.id, tasks, projects)}%</span>
              <button className="ghost-btn" onClick={() => onEdit('goal', goal)}>Edit</button>
              <button className="ghost-btn" onClick={() => onDelete('goal', goal.id)}>Delete</button>
            </div>
          </div>
        ))}
      </section>

      <section className="card">
        <div className="section-title-row">
          <h3>Finances</h3>
          <button className="primary-btn" onClick={() => onQuickCreate('expense')}>Add Expense</button>
        </div>
        <input placeholder="Search expenses" value={expenseQuery} onChange={(e) => setExpenseQuery(e.target.value)} />
        <div className="metric-row"><span>Spent</span><strong>${totalSpent.toFixed(2)}</strong></div>
        <div className="metric-row"><span>Weekly Target</span><strong>${budget.weeklyTarget.toFixed(2)}</strong></div>
        <div className="mini-progress"><div style={{ width: `${Math.min((totalSpent / budget.weeklyTarget) * 100, 100)}%` }} /></div>
        {filteredExpenses.map((expense) => (
          <div key={expense.id} className="metric-row card-row">
            <span>{expense.category}: ${Number(expense.amount).toFixed(2)} — {expense.note}</span>
            <div className="item-actions">
              <button className="ghost-btn" onClick={() => onEdit('expense', expense)}>Edit</button>
              <button className="ghost-btn" onClick={() => onDelete('expense', expense.id)}>Delete</button>
            </div>
          </div>
        ))}
      </section>

      <section className="card">
        <div className="section-title-row">
          <h3>Notes</h3>
          <button className="primary-btn" onClick={() => onQuickCreate('note')}>Add Note</button>
        </div>
        <input placeholder="Search notes" value={noteQuery} onChange={(e) => setNoteQuery(e.target.value)} />
        {filteredNotes.map((note) => (
          <div key={note.id} className="note-card">
            <div className="metric-row compact-row">
              <strong>{note.title}</strong>
              <div className="item-actions">
                <button className="ghost-btn" onClick={() => onEdit('note', note)}>Edit</button>
                <button className="ghost-btn" onClick={() => onDelete('note', note.id)}>Delete</button>
              </div>
            </div>
            <p>{note.content}</p>
          </div>
        ))}
      </section>

      <section className="card">
        <div className="section-title-row"><h3>Profile</h3></div>
        <div className="form-grid">
          <label>
            Display Name
            <input value={profile.displayName || ''} onChange={(e) => updateProfile({ ...profile, displayName: e.target.value })} />
          </label>
          <label>
            Timezone
            <input value={profile.timezone || ''} onChange={(e) => updateProfile({ ...profile, timezone: e.target.value })} />
          </label>
          <label>
            Planner Mode
            <select value={profile.plannerMode || 'Balanced'} onChange={(e) => updateProfile({ ...profile, plannerMode: e.target.value })}>
              <option>Balanced</option>
              <option>Execution</option>
              <option>Wellness</option>
              <option>Growth</option>
            </select>
          </label>
        </div>
      </section>

      <section className="card">
        <div className="section-title-row"><h3>Settings</h3></div>
        <div className="setting-row">
          <span>Show completed tasks</span>
          <input type="checkbox" checked={settings.showCompletedTasks} onChange={(e) => updateSettings({ ...settings, showCompletedTasks: e.target.checked })} />
        </div>
        <div className="setting-row">
          <span>Compact calendar</span>
          <input type="checkbox" checked={settings.compactCalendar} onChange={(e) => updateSettings({ ...settings, compactCalendar: e.target.checked })} />
        </div>
        <div className="setting-row">
          <span>Onboarding complete</span>
          <input type="checkbox" checked={settings.onboardingComplete} onChange={(e) => updateSettings({ ...settings, onboardingComplete: e.target.checked })} />
        </div>
        <div className="button-row"><button className="ghost-btn" onClick={signOut}>Sign out</button></div>
      </section>
    </div>
  )
}
