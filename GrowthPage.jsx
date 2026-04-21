import { TODAY, startOfWeek, endOfWeek, isToday } from '../utils/date'

export default function GrowthPage({ scores, habits, habitLogs, onToggleHabit, onEdit, onDelete, onQuickCreate, budget, setBudget }) {
  const weekStart = startOfWeek(TODAY)
  const weekEnd = endOfWeek(TODAY)
  const weekLogs = habitLogs.filter((log) => log.date >= weekStart && log.date <= weekEnd)
  const completedWeekLogs = weekLogs.filter((log) => log.completed).length
  const weeklyReview = {
    win: scores.Productivity >= 7 ? 'You protected momentum well this week.' : 'There is room to tighten follow-through next week.',
    recovery: scores.Wellness < 6 ? 'Wellness is trailing. Build in recovery and reflection blocks.' : 'Wellness held steady. Keep the rhythm.',
    money: scores.Finances >= 7 ? 'Finances stayed inside the guardrails.' : 'Finances need a closer reset and review.',
  }

  return (
    <div className="screen-stack">
      <section className="card premium-card">
        <div className="section-title-row">
          <div>
            <p className="eyebrow">Auto Scorecard</p>
            <h3>Life balance</h3>
          </div>
          <span className="status-pill">Self-updating</span>
        </div>
        {Object.entries(scores).map(([name, value]) => (
          <div key={name} className="score-line">
            <span>{name}</span>
            <div className="score-bar"><div style={{ width: `${value * 10}%` }} /></div>
            <strong>{value}/10</strong>
          </div>
        ))}
      </section>

      <section className="card premium-card">
        <div className="section-title-row">
          <div>
            <p className="eyebrow">Weekly Review</p>
            <h3>What the week is saying</h3>
          </div>
          <span className="status-pill">{completedWeekLogs} habit wins</span>
        </div>
        <div className="review-grid">
          <div className="review-card"><strong>Win</strong><p>{weeklyReview.win}</p></div>
          <div className="review-card"><strong>Recovery</strong><p>{weeklyReview.recovery}</p></div>
          <div className="review-card"><strong>Finance signal</strong><p>{weeklyReview.money}</p></div>
        </div>
      </section>

      <section className="card premium-card">
        <div className="section-title-row">
          <h3>Habits</h3>
          <button className="primary-btn premium-btn" onClick={() => onQuickCreate('habit')}>Add Habit</button>
        </div>
        {habits.map((habit) => {
          const logs = habitLogs.filter((log) => log.habitId === habit.id)
          const todayLog = logs.find((log) => isToday(log.date))
          const complete = logs.filter((log) => log.completed).length
          return (
            <div key={habit.id} className="metric-row card-row">
              <div>
                <strong>{habit.title}</strong>
                <p>{habit.category} • {complete}/{logs.length || 1} complete</p>
              </div>
              <div className="item-actions">
                <button className={todayLog?.completed ? 'secondary-btn' : 'primary-btn premium-btn'} onClick={() => onToggleHabit(habit.id, TODAY)}>
                  {todayLog?.completed ? 'Logged' : 'Log Today'}
                </button>
                <button className="ghost-btn" onClick={() => onEdit('habit', habit)}>Edit</button>
                <button className="ghost-btn" onClick={() => onDelete('habit', habit.id)}>Delete</button>
              </div>
            </div>
          )
        })}
      </section>

      <section className="card premium-card">
        <div className="section-title-row">
          <h3>Weekly Budget Target</h3>
        </div>
        <div className="budget-editor">
          <label>
            Weekly Target
            <input type="number" value={budget.weeklyTarget} onChange={(e) => setBudget({ weeklyTarget: Number(e.target.value) })} />
          </label>
        </div>
      </section>
    </div>
  )
}
