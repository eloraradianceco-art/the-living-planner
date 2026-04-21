import { Link, useNavigate } from 'react-router-dom'
import { useResponsive } from '../hooks/useResponsive'
import { getGoalProgress, getProjectProgress } from '../utils/scoring'
import { TODAY, isOverdue, isToday } from '../utils/date'
import { getHomeInsights, getSmartSuggestions } from '../utils/insights'
import { getBudgetSeries, getScoreTrend, getWeekCompletionSeries } from '../utils/charts'

function MetricTile({ label, value, helper }) {
  return (
    <div className="metric-tile">
      <span>{label}</span>
      <strong>{value}</strong>
      {helper ? <small>{helper}</small> : null}
    </div>
  )
}

function MiniBarChart({ data, dataKey = 'completed', maxKey = dataKey }) {
  const max = Math.max(...data.map((item) => item[maxKey] || 0), 1)
  return (
    <div className="mini-chart bars-chart" aria-hidden="true">
      {data.map((item) => (
        <div key={item.label} className="bar-group">
          <span className="bar-label">{item.label}</span>
          <div className="bar-track"><div className="bar-fill" style={{ height: `${Math.max(((item[dataKey] || 0) / max) * 100, 6)}%` }} /></div>
        </div>
      ))}
    </div>
  )
}

function MiniLineChart({ data }) {
  const width = 240
  const height = 80
  const values = data.map((item) => item.value)
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const points = data.map((item, index) => {
    const x = (index / Math.max(data.length - 1, 1)) * width
    const y = height - (((item.value - min) / Math.max(max - min, 1)) * (height - 12)) - 6
    return `${x},${y}`
  }).join(' ')
  return (
    <div className="mini-line-chart">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <polyline fill="none" stroke="currentColor" strokeWidth="3" points={points} />
      </svg>
      <div className="chart-xlabels">{data.map((item) => <span key={item.label}>{item.label}</span>)}</div>
    </div>
  )
}

export default function HomePage({ tasks, goals, projects, expenses, scores, budget, events, habits, habitLogs, settings, onEdit, onQuickCreate }) {
  const navigate = useNavigate()
  const { isMobile } = useResponsive()
  const todayTasks = tasks.filter((task) => isToday(task.date) && (settings.showCompletedTasks || !task.completed))
  const topGoals = goals.slice(0, 3)
  const overdueTasks = tasks.filter((task) => !task.completed && isOverdue(task.date))
  const openProjects = projects.filter((project) => project.status !== 'Completed')
  const weekSpend = expenses.reduce((sum, item) => sum + Number(item.amount), 0)
  const todaySchedule = [
    ...todayTasks.filter((task) => task.time).map((task) => ({ ...task, startTime: task.time, itemType: 'task' })),
    ...events.filter((event) => event.date === TODAY).map((event) => ({ ...event, itemType: 'event' })),
  ].sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''))
  const insights = getHomeInsights({ tasks, expenses, budget, projects, goals, events, habits, habitLogs })
  const suggestions = getSmartSuggestions({ tasks, expenses, budget, projects, habits, habitLogs })
  const completionSeries = getWeekCompletionSeries(tasks)
  const budgetSeries = getBudgetSeries(expenses)
  const scoreTrend = getScoreTrend()

  const focusCopy = todayTasks.filter((task) => !task.completed).slice(0, 3).map((task) => task.title)

  return (
    <div className="screen-grid two-col-grid premium-home-grid">
      <section className="card hero-card premium-hero full-bleed living-hero">
        <div>
          <p className="eyebrow">Today’s Focus</p>
          <h2>{focusCopy.join(' • ') || 'Live the day on purpose'}</h2>
          <p className="muted hero-subcopy">The Living Planner keeps today, your week, your money, and your momentum in one place without the clutter.</p>
        </div>
        <div className="hero-actions">
          <div className="button-row wrap-row hero-button-row">
            <Link className="secondary-btn" to="/calendar">{isMobile ? 'Day View' : 'Open Day View'}</Link>
            <Link className="secondary-btn" to="/tasks">{isMobile ? 'Tasks' : 'See Tasks'}</Link>
            <button className="primary-btn premium-btn" onClick={() => onQuickCreate('event', { date: TODAY })}>Add Event</button>
          </div>
          <div className="hero-metrics-grid">
            <MetricTile label="Open Tasks" value={insights.openTasks} helper={`${insights.overdueCount} overdue`} />
            <MetricTile label="Completion" value={`${insights.completionRate}%`} helper="This week" />
            <MetricTile label="Budget Left" value={`$${insights.budgetRemaining.toFixed(2)}`} helper="This week" />
            <MetricTile label="Habit Streak" value={`${insights.currentHabitStreak} days`} helper={`${insights.habitCount} habits active`} />
          </div>
        </div>
      </section>

      <section className="card premium-card">
        <div className="section-title-row">
          <div>
            <p className="eyebrow">Smart Suggestions</p>
            <h3>What the planner would do next</h3>
          </div>
          <span className="status-pill">Live insights</span>
        </div>
        <div className="suggestion-stack">
          {suggestions.length === 0 ? <p className="muted">No nudges right now. You’re in a good groove.</p> : suggestions.map((suggestion) => (
            <button key={suggestion.title} className={`suggestion-card tone-${suggestion.tone}`} onClick={() => navigate(suggestion.route)}>
              <strong>{suggestion.title}</strong>
              <span>{suggestion.body}</span>
              <small>{suggestion.actionLabel}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="card premium-card">
        <div className="section-title-row">
          <div>
            <p className="eyebrow">Weekly Completion</p>
            <h3>How execution is trending</h3>
          </div>
        </div>
        <MiniBarChart data={completionSeries.map((item) => ({ ...item, label: item.label.replace('-', '/') }))} dataKey="completed" maxKey="total" />
        <p className="muted">Completed actions by day this week.</p>
      </section>

      <section className="card premium-card">
        <div className="section-title-row">
          <div>
            <p className="eyebrow">Budget Drift</p>
            <h3>Spend across the week</h3>
          </div>
        </div>
        <MiniBarChart data={budgetSeries.map((item) => ({ ...item, label: item.label.replace('-', '/') }))} dataKey="amount" />
        <p className="muted">Week spend: <strong>${weekSpend.toFixed(2)}</strong> against <strong>${budget.weeklyTarget.toFixed(2)}</strong>.</p>
      </section>

      <section className="card premium-card full-bleed">
        <div className="section-title-row">
          <div>
            <p className="eyebrow">Momentum Trend</p>
            <h3>Score pulse</h3>
          </div>
          <Link className="ghost-btn" to="/growth">Open Growth</Link>
        </div>
        <MiniLineChart data={scoreTrend} />
      </section>

      <section className="card premium-card">
        <div className="section-title-row">
          <div>
            <p className="eyebrow">Today Timeline</p>
            <h3>What’s on the clock</h3>
          </div>
          <button className="ghost-btn" onClick={() => onQuickCreate('task', { date: TODAY })}>Add task</button>
        </div>
        {todaySchedule.length === 0 ? <p>No scheduled items.</p> : todaySchedule.slice(0, 5).map((item) => (
          <button key={`${item.itemType}-${item.id}`} className="timeline-preview premium-list-row" onClick={() => onEdit(item.itemType, item)}>
            <strong>{item.startTime}</strong>
            <span>{item.title}</span>
            <small>{item.itemType === 'task' ? 'Task' : 'Event'}</small>
          </button>
        ))}
      </section>

      <section className="card premium-card">
        <div className="section-title-row">
          <div>
            <p className="eyebrow">Goals</p>
            <h3>Week’s Top Goals</h3>
          </div>
          <button className="ghost-btn" onClick={() => onQuickCreate('goal')}>Add</button>
        </div>
        {topGoals.map((goal) => (
          <div key={goal.id} className="progress-block">
            <div className="metric-row compact-row">
              <span>{goal.title}</span>
              <strong>{getGoalProgress(goal.id, tasks, projects)}%</strong>
            </div>
            <div className="mini-progress"><div style={{ width: `${getGoalProgress(goal.id, tasks, projects)}%` }} /></div>
          </div>
        ))}
      </section>

      <section className="card premium-card">
        <div className="section-title-row">
          <div>
            <p className="eyebrow">Projects</p>
            <h3>Open Projects</h3>
          </div>
          <button className="ghost-btn" onClick={() => onQuickCreate('project')}>Add</button>
        </div>
        {openProjects.map((project) => (
          <button key={project.id} className="list-action-row premium-list-row" onClick={() => onEdit('project', project)}>
            <span>{project.title}</span>
            <strong>{getProjectProgress(project.id, tasks)}%</strong>
          </button>
        ))}
        {!openProjects.length ? <p className="muted">No active projects right now.</p> : null}
      </section>

      <section className="card premium-card">
        <div className="section-title-row">
          <div>
            <p className="eyebrow">Watchlist</p>
            <h3>Needs attention</h3>
          </div>
          <span className="status-pill alert-pill">{overdueTasks.length} items</span>
        </div>
        {overdueTasks.length === 0 ? <p>No overdue tasks.</p> : overdueTasks.map((task) => (
          <button key={task.id} className="list-action-row premium-list-row" onClick={() => onEdit('task', task)}>
            <span>{task.title}</span>
            <strong>{task.date}</strong>
          </button>
        ))}
      </section>

      <section className="card premium-card full-bleed">
        <div className="section-title-row">
          <div>
            <p className="eyebrow">Life Score Snapshot</p>
            <h3>Automated balance check</h3>
          </div>
          <Link className="ghost-btn" to="/growth">Open Growth</Link>
        </div>
        <div className="score-grid">
          {Object.entries(scores).map(([key, value]) => (
            <div key={key} className="score-card">
              <span>{key}</span>
              <strong>{value}/10</strong>
              <div className="score-bar"><div style={{ width: `${value * 10}%` }} /></div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
