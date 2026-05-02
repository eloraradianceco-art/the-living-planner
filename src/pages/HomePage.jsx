import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { usePlannerData } from '../context/PlannerContext.jsx'
import { Link } from 'react-router-dom'
import { MetricTile, MiniBarChart, MiniLineChart } from '../components/Charts.jsx'
import { OnboardingChecklist } from '../components/OnboardingChecklist.jsx'
import { getHomeInsights, getSmartSuggestions } from '../utils/insights.js'
import { computeScores } from '../utils/scoring.js'
import { getTodayString } from '../utils/dates.js'

function HomePage({ tasks, goals, projects, expenses, scores, budget, events, habits, habitLogs, settings, profile, onEdit, onQuickCreate }) {
  const navigate = useNavigate()
  const todayTasks = tasks.filter((task) => isToday(task.date) && (settings.showCompletedTasks || !task.completed))
  const openTasks = tasks.filter(t => !t.completed)
  const overdueTasks = tasks.filter((task) => !task.completed && isOverdue(task.date))
  const weekSpend = expenses.filter(e => !['Bills','Utilities','Rent','Insurance'].includes(e.category))
    .reduce((sum, item) => sum + Number(item.amount), 0)
  const todaySchedule = [
    ...todayTasks.filter((task) => task.time).map((task) => ({ ...task, startTime: task.time, itemType: 'task' })),
    ...events.filter((event) => event.date === TODAY).map((event) => ({ ...event, itemType: 'event' })),
  ].sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''))
  const insights = getHomeInsights({ tasks, expenses, budget, projects, goals, events, habits, habitLogs })
  const suggestions = getSmartSuggestions({ tasks, expenses, budget, projects, habits, habitLogs })
  const completionSeries = getWeekCompletionSeries(tasks)

  const firstName = profile?.displayName?.split(' ')[0] || 'there'
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const focusCopy = openTasks.filter(t => isToday(t.date) && !t.completed).slice(0, 2).map(t => t.title)
  const topGoals = goals.slice(0, 3)

  const SECTIONS = [
    { to:'/tasks',        icon:'✓',  label:'Tasks',        color:'var(--teal)',   count: openTasks.length || null },
    { to:'/calendar',     icon:'◷',  label:'Calendar',     color:'var(--slate)',  count: todaySchedule.length || null },
    { to:'/habits',       icon:'🔁', label:'Habits',       color:'var(--brass)',  count: habits.length || null },
    { to:'/goals',        icon:'🎯', label:'Goals',        color:'var(--brass)',  count: goals.length || null },
    { to:'/finance',      icon:'💰', label:'Finance',      color:'#22C55E',       count: null },
    { to:'/growth',       icon:'↑',  label:'Growth',       color:'var(--teal)',   count: null },
    { to:'/wellness',     icon:'🌿', label:'Health & Wellness', color:'#22C55E', count: null },
    { to:'/productivity', icon:'⚡', label:'Productivity', color:'#F0B429',       count: null },
    { to:'/lifestyle',    icon:'🌍', label:'Lifestyle',    color:'var(--slate)',   count: null },
    { to:'/faith',        icon:'✝',  label:'Faith',        color:'var(--brass)',   count: null },
  ]

  return (
    <div className="home-stack">

      {/* ── Personal greeting hero ─────────────────────────────────── */}
      <div className="hero-focus-card">
        <p className="eyebrow">{new Date().toLocaleDateString('en-US', {weekday:'long', month:'long', day:'numeric'})}</p>
        <h2 style={{fontSize:'1.5rem', marginBottom:6}}>{greeting}, {firstName}</h2>
        <p className="muted" style={{fontSize:'.9rem', lineHeight:1.5}}>
          {focusCopy.length > 0
            ? `Today: ${focusCopy.join(' · ')}`
            : overdueTasks.length > 0
            ? `You have ${overdueTasks.length} overdue item${overdueTasks.length > 1 ? 's' : ''} waiting.`
            : 'Your day is clear. Add something to move toward.'}
        </p>
        <div className="hero-focus-actions" style={{marginTop:14}}>
          <button className="primary-btn" style={{fontSize:'.82rem', padding:'8px 16px'}} onClick={() => onQuickCreate('task', { date: TODAY })}>+ Task</button>
          <button className="secondary-btn" style={{fontSize:'.82rem', padding:'8px 16px'}} onClick={() => onQuickCreate('event', { date: TODAY })}>+ Event</button>
          <Link className="secondary-btn" to="/calendar" style={{fontSize:'.82rem', padding:'8px 16px'}}>Day View</Link>
        </div>
      </div>

      {/* ── 4 key metrics ─────────────────────────────────────────── */}
      <div className="home-metrics-strip">
        <MetricTile label="Open Tasks" value={insights.openTasks} helper={overdueTasks.length > 0 ? `${overdueTasks.length} overdue` : 'on track'} />
        <MetricTile label="This Week" value={`${insights.completionRate}%`} helper="completion rate" />
        <MetricTile label="Budget Left" value={`$${Math.max(0, budget.weeklyTarget - weekSpend).toFixed(0)}`} helper="this week" />
        <MetricTile label="Habit Streak" value={`${insights.currentHabitStreak}d`} helper={`${insights.habitCount} active`} />
      </div>

      {/* ── Quick access to all sections ──────────────────────────── */}
      <section className="card">
        <div className="section-title-row" style={{marginBottom:12}}>
          <div><p className="eyebrow">Your Planner</p><h3>Quick Access</h3></div>
        </div>
        <div style={{display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:8}}>
          {SECTIONS.map(s => (
            <Link key={s.to} to={s.to} style={{
              display:'flex', flexDirection:'column', alignItems:'center', gap:3,
              padding:'10px 4px 8px', borderRadius:'var(--radius-sm)', background:'var(--stone)',
              border:'1px solid var(--border)', textDecoration:'none', position:'relative'
            }}>
              {s.count > 0 && (
                <div style={{position:'absolute', top:4, right:4, background:s.color, color:'white', fontSize:'.55rem', fontWeight:700, borderRadius:999, minWidth:14, height:14, display:'grid', placeItems:'center', padding:'0 3px', lineHeight:1}}>
                  {s.count}
                </div>
              )}
              <span style={{fontSize:'1rem', lineHeight:1}}>{s.icon}</span>
              <span style={{fontSize:'.65rem', fontWeight:600, color:'var(--text2)', textAlign:'center', lineHeight:1.2}}>{s.label}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Today's schedule ──────────────────────────────────────── */}
      <section className="card">
        <div className="section-title-row">
          <div><p className="eyebrow">Today Timeline</p><h3>What's on the clock</h3></div>
          <button className="ghost-btn" style={{fontSize:'.8rem'}} onClick={() => onQuickCreate('task', { date: TODAY })}>+ Task</button>
        </div>
        {todaySchedule.length === 0
          ? <p className="muted" style={{fontSize:'.85rem'}}>Nothing scheduled yet today. <button onClick={() => onQuickCreate('task', { date: TODAY })} style={{background:'none', border:'none', color:'var(--teal)', cursor:'pointer', fontFamily:'inherit', fontWeight:600, padding:0}}>Add a task →</button></p>
          : todaySchedule.slice(0, 6).map((item) => (
            <button key={`${item.itemType}-${item.id}`} className="timeline-preview premium-list-row" onClick={() => onEdit(item.itemType, item)}
              style={{width:'100%', borderBottom:'1px solid var(--surface)', padding:'9px 0'}}>
              <strong style={{color:'var(--teal)', fontSize:'.82rem', minWidth:36}}>{item.startTime}</strong>
              <span style={{flex:1, textAlign:'left', fontSize:'.9rem', color:'var(--text)', fontWeight:500}}>{item.title}</span>
              <small style={{color:'var(--muted)', fontSize:'.72rem'}}>{item.itemType === 'task' ? 'Task' : 'Event'}</small>
            </button>
          ))}
      </section>

      {/* ── Smart suggestions ─────────────────────────────────────── */}
      {suggestions.length > 0 && (
        <section className="card">
          <div className="section-title-row" style={{marginBottom:10}}>
            <div><p className="eyebrow">Smart Suggestions</p><h3>What to do next</h3></div>
          </div>
          <div className="suggestion-stack">
            {suggestions.slice(0,3).map((s) => (
              <button key={s.title} className={`suggestion-card tone-${s.tone}`} onClick={() => navigate(s.route)}>
                <strong>{s.title}</strong>
                <span>{s.body}</span>
                <small>{s.actionLabel} →</small>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ── Overdue watchlist ─────────────────────────────────────── */}
      {overdueTasks.length > 0 && (
        <section className="card" style={{borderLeft:'3px solid var(--danger)', background:'rgba(217,79,61,.03)'}}>
          <div className="section-title-row">
            <div><p className="eyebrow" style={{color:'var(--danger)'}}>Needs Attention</p><h3>Overdue</h3></div>
            <span className="status-pill alert-pill">{overdueTasks.length}</span>
          </div>
          {overdueTasks.slice(0,4).map((task) => (
            <button key={task.id} onClick={() => onEdit('task', task)}
              style={{width:'100%', display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid var(--surface)', background:'none', cursor:'pointer', textAlign:'left'}}>
              <span style={{fontSize:'.9rem', color:'var(--text)', fontWeight:500}}>{task.title}</span>
              <span style={{fontSize:'.75rem', color:'var(--danger)', fontWeight:600, flexShrink:0}}>{task.date}</span>
            </button>
          ))}
        </section>
      )}

      {/* ── Top goals ─────────────────────────────────────────────── */}
      {topGoals.length > 0 && (
        <section className="card">
          <div className="section-title-row">
            <div><p className="eyebrow">Goals</p><h3>In Progress</h3></div>
            <Link className="ghost-btn" to="/more" style={{fontSize:'.8rem'}}>All →</Link>
          </div>
          {topGoals.map((goal) => (
            <div key={goal.id} className="progress-block">
              <div className="metric-row compact-row" style={{padding:'5px 0'}}>
                <span style={{fontSize:'.9rem', color:'var(--text)', fontWeight:500}}>{goal.title}</span>
                <strong style={{color:'var(--brass)', fontSize:'.88rem'}}>{getGoalProgress(goal.id, tasks, projects)}%</strong>
              </div>
              <div className="mini-progress"><div style={{ width: `${getGoalProgress(goal.id, tasks, projects)}%` }} /></div>
            </div>
          ))}
        </section>
      )}

      {/* ── Life score strip ──────────────────────────────────────── */}
      <section className="card">
        <div className="section-title-row" style={{marginBottom:10}}>
          <div><p className="eyebrow">Life Balance</p><h3>Score snapshot</h3></div>
          <Link className="ghost-btn" to="/growth" style={{fontSize:'.8rem'}}>Details →</Link>
        </div>
        <div style={{display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:6}}>
          {Object.entries(scores).map(([key, value]) => (
            <div key={key} style={{textAlign:'center', padding:'8px 4px', background:'var(--surface)', borderRadius:'var(--radius-sm)'}}>
              <div style={{fontSize:'.65rem', color:'var(--muted)', marginBottom:3, textTransform:'uppercase', letterSpacing:'.05em'}}>{key.slice(0,4)}</div>
              <div style={{fontSize:'1.1rem', fontWeight:700, color: value >= 7 ? 'var(--success)' : value >= 5 ? 'var(--teal)' : 'var(--danger)'}}>{value}</div>
              <div style={{height:3, borderRadius:999, background:'var(--border2)', marginTop:4, overflow:'hidden'}}>
                <div style={{height:'100%', width:`${value*10}%`, background: value >= 7 ? 'var(--success)' : value >= 5 ? 'var(--teal)' : 'var(--danger)', borderRadius:999}} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Weekly execution chart ────────────────────────────────── */}
      <section className="card">
        <div className="section-title-row" style={{marginBottom:8}}>
          <div><p className="eyebrow">This Week</p><h3>Execution</h3></div>
        </div>
        <MiniBarChart data={completionSeries} dataKey="completed" maxKey="total" />
      </section>

    </div>
  )
}




export default HomePage
