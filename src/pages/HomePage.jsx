// Home.
import React from 'react'
import { purchasesInApp } from '../native.js'
import { Link, useNavigate } from 'react-router-dom'
import { Smile, Moon, Dumbbell, Repeat, Cross, Check, Gauge } from 'lucide-react'
import {
  dateOfStamp, getTodayString, TODAY, addDays, startOfWeek, expandEvents, isToday, isOverdue,
  shortDate, fmtRange,
} from '../lib/dates.js'
import { DOMAIN_META, BUDGET_PERIODS, normBudget, budgetSpend, habitDoneThisWeek, habitWeekTarget, lifeScoreOf } from '../lib/score.js'
import { normalizeSteps, getGoalProgress, nextStepFor } from '../lib/steps.js'
import { PlaceText } from '../components/Place.jsx'
import { getWeekCompletionSeries, getHomeInsights, getSmartSuggestions } from '../lib/insights.js'
import { PRO_ROUTES } from '../lib/subscription.js'
import { NAV_ITEMS, effectiveMode, HOME_ORDER } from '../shell/nav.js'
import { MetricTile, MiniBarChart } from '../components/charts.jsx'
import { PageNav } from '../components/PageNav.jsx'
import { useWellnessKey, usePageKey } from '../lib/pageData.js'
import { readinessOf, readinessBand } from './wellness/helpers.js'
import { DEFAULT_TARGETS, dayProtein } from './wellness/NutritionTab.jsx'
import { getVerseOfDay } from './faith/verses.js'

function HomePage({ isPro = false, onUpgrade = () => {}, tasks, goals, projects, expenses, scores, budget, events, habits, habitLogs, settings, profile, onEdit, onQuickCreate, onToggle, onToggleHabit, onSaveSteps }) {
  const navigate = useNavigate()
  // Saved to the account so every device shows the same (were device-only before 2026-11-12)
  const [woty, saveWoty] = usePageKey('home', 'wordOfYear', '', 'planner_word_of_year')
  const [top3, saveTop3] = usePageKey('home', 'top3', { date: '', items: ['', '', ''], done: [] }, 'planner_tomorrow_top3')
  const TOMORROW = addDays(TODAY, 1)
  const todayTasks = tasks.filter((task) => isToday(task.date) && (settings.showCompletedTasks || !task.completed))
  const openTasks = tasks.filter(t => !t.completed)
  const overdueTasks = tasks.filter((task) => !task.completed && isOverdue(task.date))
  const homeBudget = normBudget(budget)
  const homeBudgetLeft = homeBudget.amount - budgetSpend(expenses, homeBudget.period).total
  const todaySchedule = [
    ...todayTasks.filter((task) => task.time).map((task) => ({ ...task, startTime: task.time, itemType: 'task' })),
    ...expandEvents(events, TODAY, TODAY).map((event) => ({ ...event, itemType: 'event' })),
  ].sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''))
  const insights = getHomeInsights({ tasks, expenses, budget, projects, goals, events, habits, habitLogs })
  const suggestions = getSmartSuggestions({ tasks, expenses, budget, projects, habits, habitLogs })
  const completionSeries = getWeekCompletionSeries(tasks)

  const rawFirst = (profile?.displayName || '').trim().split(' ')[0]
  const firstName = rawFirst && rawFirst.toLowerCase() !== 'planner' ? rawFirst : ''
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const topGoals = goals.filter((g) => !g.completed).slice(0, 3)

  const SECTIONS = [
    ...NAV_ITEMS.filter((n) => n.to !== '/').map((n) => ({
      ...n,
      count: n.to === '/tasks' ? (openTasks.length || null)
        : n.to === '/calendar' ? (todaySchedule.length || null)
        : n.to === '/projects' ? (projects.filter((p) => p.status !== 'Completed').length || null)
        : n.to === '/habits' ? (habits.length || null)
        : n.to === '/goals' ? (goals.filter((g) => !g.completed).length || null)
        : null,
    })),
  ]

  const B_hero = (
    <>
      {/* ── Personal greeting hero ─────────────────────────────────── */}
      <div className="hero-focus-card">
        <p className="eyebrow">{new Date().toLocaleDateString('en-US', {weekday:'long', month:'long', day:'numeric'})}</p>
        <h2 style={{fontSize:'1.5rem', marginBottom:6}}>{greeting}{firstName ? `, ${firstName}` : '.'}</h2>
        {/* Date, name and Life Score only: + Task / + Event live in the + button, Day View in the Calendar tab (2026-11-13) */}
        {/* Overall score pill */}
        {(() => {
          const life = lifeScoreOf(scores)
          const avg = life == null ? null : Math.round(life)
          if (!avg) return null
          return (
            <div style={{marginTop:10,display:'flex',alignItems:'center',gap:8}}>
              <div style={{
                padding:'5px 12px',borderRadius:999,
                background: avg >= 7 ? 'rgba(52,168,83,.2)' : avg >= 5 ? 'rgba(42,157,143,.2)' : 'rgba(184,150,90,.2)',
                border: `1px solid ${avg >= 7 ? 'rgba(52,168,83,.35)' : avg >= 5 ? 'rgba(42,157,143,.35)' : 'rgba(184,150,90,.35)'}`,
                display:'flex',alignItems:'center',gap:6,
              }}>
                <span style={{fontSize:'.7rem',color: avg >= 7 ? '#4ade80' : avg >= 5 ? 'var(--teal-bright)' : 'var(--brass-fg)',fontWeight:700}}>Life Score</span>
                <span style={{fontSize:'.85rem',fontWeight:800,color:'white'}}>{avg}/10</span>
              </div>
              <span style={{fontSize:'.72rem',color:'rgba(255,255,255,.64)'}}>
                {avg >= 8 ? 'Thriving ✦' : avg >= 6 ? 'On track' : avg >= 4 ? 'Needs attention' : 'Time to reset'}
              </span>
            </div>
          )
        })()}
      </div>
    </>
  )

  const B_woty = (
    <>
      {/* ── Word of the Year ──────────────────────────────── */}
      {/* ── Word of the Year ──────────────────────────────── */}
      {(() => {
        const [editing, setEditing] = React.useState(false)
        const [draft, setDraft] = React.useState(woty)
        const save = () => { saveWoty(String(draft || '').trim()); setEditing(false) }
        return (
          <section className="card" style={{padding:'14px 16px',marginBottom:12}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}>
              <div style={{flex:1,minWidth:0}}>
                <p style={{fontSize:'.62rem',fontWeight:700,letterSpacing:'.1em',color:'var(--brass-fg)',textTransform:'uppercase',margin:'0 0 4px'}}>Word of the Year</p>
                {editing ? (
                  <div style={{display:'flex',gap:8,alignItems:'center'}}>
                    <input autoFocus value={draft} onChange={e=>setDraft(e.target.value)}
                      onKeyDown={e=>{if(e.key==='Enter')save();if(e.key==='Escape')setEditing(false)}}
                      placeholder={`Your word for ${new Date().getFullYear()}...`}
                      style={{flex:1,padding:'6px 10px',border:'1.5px solid var(--brass)',borderRadius:8,fontSize:'1rem',fontFamily:'var(--serif)',fontStyle:'italic',background:'var(--stone)'}} />
                    <button onClick={save} style={{padding:'6px 14px',borderRadius:999,background:'var(--brass-text)',color:'white',border:'none',fontSize:'.78rem',fontWeight:700,cursor:'pointer'}}>Save</button>
                    <button onClick={()=>setEditing(false)} style={{padding:'6px 10px',borderRadius:999,background:'transparent',border:'1px solid var(--border2)',fontSize:'.78rem',cursor:'pointer'}}>✕</button>
                  </div>
                ) : woty ? (
                  <h2 onClick={()=>{setDraft(woty);setEditing(true)}} style={{margin:0,fontFamily:'var(--serif)',fontSize:'1.8rem',fontWeight:400,color:'var(--ink)',letterSpacing:'-.01em',fontStyle:'italic',cursor:'pointer'}}>{woty}</h2>
                ) : (
                  <p style={{margin:0,fontSize:'.85rem',color:'var(--ink2)',fontStyle:'italic'}}>What single word will guide your year?</p>
                )}
              </div>
              {!editing && (
                <button onClick={()=>{setDraft(woty);setEditing(true)}} style={{
                  padding:'6px 14px',borderRadius:999,background:'transparent',
                  color:'var(--brass-fg)',border:'1px solid var(--brass)',
                  fontSize:'.74rem',fontWeight:600,cursor:'pointer',flexShrink:0,
                }}>{woty ? 'Edit' : 'Set'}</button>
              )}
            </div>
          </section>
        )
      })()}
    </>
  )

  const B_focus = (
    <>
      {/* ── Today's Focus 3 — top priorities ─────────────────────── */}
      <section className="card" style={{background:'linear-gradient(135deg, #1A2332 0%, #0B1829 100%)', color:'#FAF8F4', border:'none'}}>
        <p className="eyebrow" style={{color:'rgba(255,255,255,.6)'}}>Today's Focus</p>
        <h3 style={{margin:'2px 0 8px', color:'white', fontSize:'.85rem'}}>Three things that matter today</h3>
        {top3?.date === TODAY && (top3.items || []).some((x) => String(x || '').trim()) && (
          <div className="top3-today">
            <div className="top3-today-label">Your Top 3 · set last night</div>
            {(top3.items || []).map((item, i) => String(item || '').trim() ? (
              <button key={i} type="button" className={'top3-today-item' + ((top3.done || [])[i] ? ' done' : '')} aria-pressed={!!(top3.done || [])[i]}
                onClick={() => { const done = [...(top3.done || [])]; done[i] = !done[i]; saveTop3({ ...top3, done }) }}>
                <span className="top3-today-num">{(top3.done || [])[i] ? '✓' : i + 1}</span>
                <span className="top3-today-text">{item}</span>
              </button>
            ) : null)}
          </div>
        )}

        {(() => {
          // Top task comes only from today (or overdue). Once today's list is done, it says so instead of
          // reaching into tomorrow or later (2026-11-13).
          const todaysTasks = tasks.filter(t => isToday(t.date))
          const topTask = tasks
            .filter(t => !t.completed && (isToday(t.date) || isOverdue(t.date)))
            .sort((a, b) => {
              const aP = (a.priority?.toLowerCase() === 'high' ? 3 : a.priority?.toLowerCase() === 'medium' ? 2 : 1)
              const bP = (b.priority?.toLowerCase() === 'high' ? 3 : b.priority?.toLowerCase() === 'medium' ? 2 : 1)
              const aOver = isOverdue(a.date) ? 10 : isToday(a.date) ? 5 : 0
              const bOver = isOverdue(b.date) ? 10 : isToday(b.date) ? 5 : 0
              return (bP + bOver) - (aP + aOver)
            })[0]

          // Pick top habit: not completed today
          const todayHabitLogs = habitLogs.filter(l => l.date === getTodayString() && l.completed)
          const completedHabitIds = todayHabitLogs.map(l => l.habitId)
          const topHabit = habits.find(h => !completedHabitIds.includes(h.id) && habitDoneThisWeek(h, habitLogs) < habitWeekTarget(h))

          // Get today's intention from settings or first goal
          const topGoal = goals.find(g => !g.completed)

          return (
            <div style={{display:'grid', gap:6}}>
              {/* Focus 1: Top Task */}
              {topTask ? (
                <div style={{
                  background:'rgba(255,255,255,.08)', padding:'7px 10px',
                  borderRadius:9, display:'flex', alignItems:'center', gap:9,
                  border:'1px solid rgba(255,255,255,.1)',
                }}>
                  <button onClick={(e) => { e.stopPropagation(); onToggle && onToggle(topTask.id) }} style={{
                    width:18, height:18, borderRadius:'50%',
                    border:'2px solid var(--teal)', background:'transparent',
                    cursor:'pointer', flexShrink:0, padding:0,
                  }} aria-label="Mark task complete" />
                  <div style={{flex:1, minWidth:0, cursor:'pointer'}}
                    onClick={() => onEdit('task', topTask)}>
                    <div style={{fontSize:'.58rem', color:'var(--teal)', fontWeight:700, letterSpacing:'.05em'}}>TOP TASK · TAP CIRCLE</div>
                    <div style={{fontWeight:600, fontSize:'.8rem', marginTop:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
                      {topTask.title}
                    </div>
                  </div>
                </div>
              ) : todaysTasks.length > 0 ? (
                <div style={{
                  background:'rgba(34,197,94,.15)', padding:'7px 10px',
                  borderRadius:9, display:'flex', alignItems:'center', gap:9,
                  border:'1px solid rgba(34,197,94,.3)',
                }}>
                  <div style={{fontSize:'1rem'}}>✓</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:'.58rem', color:'var(--success)', fontWeight:700, letterSpacing:'.05em'}}>TODAY'S TASKS DONE</div>
                    <div style={{fontSize:'.78rem', marginTop:1}}>{todaysTasks.length === 1 ? 'Your task for today is checked off' : todaysTasks.length === 2 ? "Both of today's tasks checked off" : `All ${todaysTasks.length} of today's tasks checked off`} 🔥</div>
                  </div>
                </div>
              ) : (
                <Link to="/tasks" style={{
                  background:'rgba(255,255,255,.05)', padding:'7px 10px',
                  borderRadius:9, display:'flex', alignItems:'center', gap:9,
                  border:'1px dashed rgba(255,255,255,.2)', textDecoration:'none', color:'white',
                }}>
                  <div style={{fontSize:'1rem', opacity:.5}}>✓</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:'.58rem', color:'rgba(255,255,255,.5)', fontWeight:700, letterSpacing:'.05em'}}>TOP TASK</div>
                    <div style={{fontSize:'.78rem', marginTop:1, color:'rgba(255,255,255,.7)'}}>{tasks.length ? 'Nothing due today' : 'A blank page awaits — add your first'}</div>
                  </div>
                </Link>
              )}

              {/* Focus 2: Top Habit */}
              {topHabit ? (
                <div style={{
                  background:'rgba(255,255,255,.08)', padding:'7px 10px',
                  borderRadius:9, display:'flex', alignItems:'center', gap:9,
                  border:'1px solid rgba(255,255,255,.1)',
                }}>
                  <button onClick={(e) => { e.stopPropagation(); onToggleHabit && onToggleHabit(topHabit.id) }} style={{
                    width:18, height:18, borderRadius:'50%',
                    border:'2px solid var(--brass)', background:'transparent',
                    cursor:'pointer', flexShrink:0, padding:0,
                  }} aria-label="Mark habit complete" />
                  <Link to="/habits" style={{flex:1, minWidth:0, textDecoration:'none', color:'inherit'}}>
                    <div style={{fontSize:'.58rem', color:'var(--brass-fg)', fontWeight:700, letterSpacing:'.05em'}}>TOP HABIT · TAP CIRCLE</div>
                    <div style={{fontWeight:600, fontSize:'.8rem', marginTop:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
                      {topHabit.title}
                    </div>
                  </Link>
                </div>
              ) : habits.length > 0 ? (
                <div style={{
                  background:'rgba(34,197,94,.15)', padding:'7px 10px',
                  borderRadius:9, display:'flex', alignItems:'center', gap:9,
                  border:'1px solid rgba(34,197,94,.3)',
                }}>
                  <div style={{fontSize:'1rem'}}>✓</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:'.58rem', color:'var(--success)', fontWeight:700, letterSpacing:'.05em'}}>HABITS COMPLETE</div>
                    <div style={{fontSize:'.78rem', marginTop:1}}>All habits checked off for today 🔥</div>
                  </div>
                </div>
              ) : (
                <Link to="/habits" style={{
                  background:'rgba(255,255,255,.05)', padding:'7px 10px',
                  borderRadius:9, display:'flex', alignItems:'center', gap:9,
                  border:'1px dashed rgba(255,255,255,.2)', textDecoration:'none', color:'white',
                }}>
                  <div style={{fontSize:'1rem', opacity:.7}}>🔁</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:'.58rem', color:'rgba(255,255,255,.5)', fontWeight:700, letterSpacing:'.05em'}}>TOP HABIT</div>
                    <div style={{fontSize:'.78rem', marginTop:1, color:'rgba(255,255,255,.7)'}}>Build your first habit</div>
                  </div>
                </Link>
              )}

              {/* Focus 3: Top Goal */}
              {topGoal ? (
                <Link to="/goals" style={{
                  background:'rgba(255,255,255,.08)', padding:'7px 10px',
                  borderRadius:9, display:'flex', alignItems:'center', gap:9,
                  border:'1px solid rgba(255,255,255,.1)',
                  textDecoration:'none', color:'white',
                }}>
                  <div style={{fontSize:'1rem'}}>🎯</div>
                  <div style={{flex:1, minWidth:0}}>
                    <div style={{fontSize:'.58rem', color:'#FFB84D', fontWeight:700, letterSpacing:'.05em'}}>CURRENT GOAL</div>
                    <div style={{fontWeight:600, fontSize:'.8rem', marginTop:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
                      {topGoal.title}
                    </div>
                    {nextStepFor(topGoal, projects) && (
                      <div style={{fontSize:'.7rem', color:'rgba(255,255,255,.62)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
                        Next: {nextStepFor(topGoal, projects)}
                      </div>
                    )}
                  </div>
                </Link>
              ) : (
                <Link to="/goals" style={{
                  background:'rgba(255,255,255,.05)', padding:'7px 10px',
                  borderRadius:9, display:'flex', alignItems:'center', gap:9,
                  border:'1px dashed rgba(255,255,255,.2)', textDecoration:'none', color:'white',
                }}>
                  <div style={{fontSize:'1rem', opacity:.7}}>🎯</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:'.58rem', color:'rgba(255,255,255,.5)', fontWeight:700, letterSpacing:'.05em'}}>CURRENT GOAL</div>
                    <div style={{fontSize:'.78rem', marginTop:1, color:'rgba(255,255,255,.7)'}}>Set a goal to aim toward</div>
                  </div>
                </Link>
              )}
            </div>
          )
        })()}
      </section>
    </>
  )

  const B_metrics = (
    <>
      {/* ── 4 key metrics ─────────────────────────────────────────── */}
      <div className="home-metrics-strip">
        <MetricTile label="Tasks Open" value={insights.openTasks} helper={overdueTasks.length > 0 ? `${overdueTasks.length} overdue` : '✓ on track'} />
        <MetricTile label="Week Done" value={`${insights.completionRate}%`} helper="completion" />
        <MetricTile label="Budget Left" value={homeBudgetLeft < 0 ? `-$${Math.abs(homeBudgetLeft).toFixed(0)}` : `$${homeBudgetLeft.toFixed(0)}`} helper={homeBudgetLeft < 0 ? `over ${BUDGET_PERIODS[homeBudget.period].span}` : BUDGET_PERIODS[homeBudget.period].span} />
        <MetricTile label="Streak" value={`${insights.currentHabitStreak}d`} helper={`${insights.habitCount} habits`} />
      </div>
    </>
  )

  const B_quick = (
    <>
      {/* ── Quick access to all sections ──────────────────────────── */}
      <section className="card">
        <div className="section-title-row" style={{marginBottom:12}}>
          <div><p className="eyebrow">Your Planner</p><h3>Quick Access</h3></div>
        </div>
        <div className="home-quick-grid">
          {SECTIONS.map(s => (
            <Link key={s.to} to={s.to} className="home-quick-tile">
              {s.count > 0 && <span className="home-quick-count">{s.count}</span>}
              {!isPro && PRO_ROUTES.includes(s.to) && <span className="pro-tag home-quick-pro">PRO</span>}
              {s.emoji ? <span className="home-quick-emoji" aria-hidden="true">{s.emoji}</span> : <s.icon size={20} strokeWidth={1.6} color="var(--brass2)" />}
              <span className="home-quick-label">{s.label}</span>
            </Link>
          ))}
        </div>
      </section>
    </>
  )

  // Today's timed tasks and events. Shows only when something is on the clock; adding lives in the + button (2026-11-13).
  const B_schedule = todaySchedule.length === 0 ? null : (
    <>
      {/* ── Today's schedule ──────────────────────────────────────── */}
      <section className="card">
        <div className="section-title-row">
          <div><p className="eyebrow">Today Timeline</p><h3>What's on the clock</h3></div>
          <Link className="ghost-btn" to="/calendar" style={{fontSize:'.8rem'}}>Calendar →</Link>
        </div>
        {todaySchedule.slice(0, 6).map((item) => (
            <button key={`${item.itemType}-${item.id}`} className="timeline-preview premium-list-row" onClick={() => onEdit(item.itemType, item.isRepeat ? (events.find((e) => e.id === item.id) || item) : item)}
              style={{width:'100%', borderBottom:'1px solid var(--surface)', padding:'9px 0'}}>
              <strong style={{color:'var(--brass-fg)', fontSize:'.8rem', minWidth:62, fontWeight:600, whiteSpace:'nowrap'}}>{fmtRange(item.startTime, item.endTime)}</strong>
              <span style={{flex:1, minWidth:0, textAlign:'left', display:'grid', gap:2}}>
                <span style={{fontSize:'.9rem', color: item.completed ? 'var(--muted)' : 'var(--text)', fontWeight:500, textDecoration: item.itemType === 'task' && item.completed ? 'line-through' : 'none'}}>{item.title}</span>
                <PlaceText place={item.location} className="row-place" />
              </span>
              <small style={{color:'var(--muted)', fontSize:'.72rem'}}>{item.itemType === 'task' ? 'Task' : 'Event'}</small>
            </button>
          ))}
      </section>
    </>
  )

  const B_suggestions = (
    <>
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
    </>
  )

  const B_overdue = (
    <>
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
              <span style={{fontSize:'.75rem', color:'var(--danger)', fontWeight:600, flexShrink:0}}>{shortDate(task.date)}</span>
            </button>
          ))}
        </section>
      )}
    </>
  )

  const B_goals = (
    <>
      {/* ── Top goals ─────────────────────────────────────────────── */}
      {topGoals.length > 0 && (
        <section className="card">
          <div className="section-title-row">
            <div><p className="eyebrow">Goals</p><h3>In Progress</h3></div>
            <Link className="ghost-btn" to="/goals" style={{fontSize:'.8rem'}}>All →</Link>
          </div>
          {topGoals.map((goal) => {
            const pct = getGoalProgress(goal, tasks, projects)
            const next = nextStepFor(goal, projects)
            return (
              <Link key={goal.id} to="/goals" className="progress-block" style={{display:'block', textDecoration:'none', color:'inherit'}}>
                <div className="metric-row compact-row" style={{padding:'5px 0'}}>
                  <span style={{fontSize:'.9rem', color:'var(--text)', fontWeight:500}}>{goal.title}</span>
                  <strong style={{color:'var(--brass-fg)', fontSize:'.88rem'}}>{pct}%</strong>
                </div>
                <div className="mini-progress"><div style={{ width: `${pct}%` }} /></div>
                {next && <div className="home-next-step"><span>Next</span>{next}</div>}
              </Link>
            )
          })}
        </section>
      )}
    </>
  )

  const B_score = !isPro ? (
    <section className="card pro-teaser">
      <div className="section-title-row" style={{marginBottom:8}}>
        <div><p className="eyebrow">Life Balance</p><h3>What's behind your score?</h3></div>
        <span className="pro-tag">PRO</span>
      </div>
      <p className="muted" style={{fontSize:'.86rem',lineHeight:1.55,margin: purchasesInApp ? '0 0 12px' : 0}}>
        Pro breaks your Life Score into its 7 areas, tracks it over 30 days, and walks you through a weekly review.{!purchasesInApp && ' If you have Pro, sign in with that account to see it.'}
      </p>
      {purchasesInApp && <button type="button" className="primary-btn" onClick={() => onUpgrade('See your full Life Score', 'Your score in 7 areas, 30-day trends and a weekly review, plus everything else in Pro.')}>Unlock Pro →</button>}
    </section>
  ) : (
    <>
      {/* ── Life score strip ──────────────────────────────────────── */}
      <section className="card">
        <div className="section-title-row" style={{marginBottom:10}}>
          <div><p className="eyebrow">Life Balance</p><h3>Score snapshot</h3></div>
          <Link className="ghost-btn" to="/growth" style={{fontSize:'.8rem'}}>Details →</Link>
        </div>
        <div className="score-snap-grid">
          {Object.entries(scores).map(([key, value]) => {
            const tone = value == null ? 'var(--muted)' : value >= 8 ? 'var(--success)' : value >= 6 ? 'var(--teal)' : value >= 4 ? 'var(--warning)' : 'var(--danger)'
            return (
              <div key={key} className="score-snap" title={value == null ? `${key}: nothing logged in the last 7 days` : `${key}: ${value}/10`}>
                <div className="score-snap-label"><span aria-hidden="true">{DOMAIN_META[key]?.emoji}</span> {DOMAIN_META[key]?.short || key}</div>
                <div className="score-snap-value" style={{ color: tone }}>{value == null ? '—' : value}</div>
                <div className="score-snap-bar"><div style={{ width: `${(value || 0) * 10}%`, background: tone }} /></div>
              </div>
            )
          })}
        </div>
        <p className="muted score-snap-note">Last 7 days · "—" means nothing logged there yet</p>
      </section>
    </>
  )

  const B_execution = (
    <>
      {/* ── Weekly execution chart ────────────────────────────────── */}
      <section className="card">
        <div className="section-title-row" style={{marginBottom:8}}>
          <div><p className="eyebrow">This Week</p><h3>Execution</h3></div>
        </div>
        <MiniBarChart data={completionSeries} dataKey="completed" maxKey="total" />
      </section>
    </>
  )

  const B_tomorrow = (
    <>
      {/* ── Tomorrow's Top 3 (evening prompt) ──────────────────────────── */}
      {(() => {
        const hour = new Date().getHours()
        if (hour < 18) return null  // Only show evening (6pm+)
        const tomorrow = TOMORROW   // local date (was UTC, which jumped two days ahead after 6 PM in the US)
        // Reset if it's for a different tomorrow
        const items = top3?.date === tomorrow ? (top3.items || ['','','']) : ['','','']
        return (
          <section className="card" style={{
            background:'linear-gradient(135deg, rgba(184,150,90,.08) 0%, rgba(42,140,140,.05) 100%)',
            border:'1.5px solid rgba(184,150,90,.2)',
            padding:'16px 18px',
          }}>
            <p style={{fontSize:'.62rem',fontWeight:700,letterSpacing:'.1em',color:'var(--brass-fg)',textTransform:'uppercase',margin:'0 0 4px'}}>Plan Tomorrow</p>
            <h3 style={{margin:'0 0 4px',fontSize:'1rem',color:'var(--ink)'}}>Your Top 3</h3>
            <p className="muted" style={{fontSize:'.8rem',marginBottom:12,fontStyle:'italic'}}>
              "He who fails to plan is planning to fail." — Set the night before. Rise focused.
            </p>
            {[0,1,2].map(i => (
              <div key={i} style={{display:'flex',alignItems:'center',gap:10,marginBottom:8}}>
                <span style={{
                  width:24,height:24,borderRadius:'50%',background:'var(--brass-text)',
                  color:'white',display:'flex',alignItems:'center',justifyContent:'center',
                  fontSize:'.75rem',fontWeight:700,flexShrink:0,
                }}>{i+1}</span>
                <input
                  key={tomorrow + ':' + i + ':' + items[i]}
                  placeholder={`Priority ${i+1}...`}
                  aria-label={`Tomorrow's priority ${i+1}`}
                  defaultValue={items[i]}
                  onBlur={e => {
                    const v = e.target.value.trim()
                    if (v === (items[i] || '')) return
                    const updated = [...items]
                    updated[i] = v
                    saveTop3({ date: tomorrow, items: updated, done: [] })
                  }}
                  style={{flex:1,padding:'8px 12px',border:'1px solid var(--border2)',borderRadius:8,fontSize:'.88rem',background:'white'}}
                />
              </div>
            ))}
          </section>
        )
      })()}
    </>
  )

  // ── Mode cards ─────────────────────────────────────────────────────────
  const mode = effectiveMode(profile, isPro)
  const vod = getVerseOfDay()
  const B_faith = (
    <Link to="/faith" className="card home-faith-card">
      <div className="home-faith-icon"><Cross size={16} strokeWidth={1.8} /></div>
      <div style={{flex:1, minWidth:0}}>
        <p className="eyebrow" style={{margin:'0 0 4px'}}>Today's Word</p>
        <p className="home-faith-verse">"{vod.v}"</p>
        <p className="home-faith-ref">{vod.r}</p>
      </div>
    </Link>
  )

  const stepRows = [
    ...projects.filter((p) => p.status !== 'Completed').map((p) => ({ type: 'project', item: p, step: normalizeSteps(p.steps).find((st) => !st.done) })),
    ...goals.filter((g) => !g.completed).map((g) => ({ type: 'goal', item: g, step: normalizeSteps(g.steps).find((st) => !st.done) })),
  ].filter((r) => r.step).slice(0, 5)
  const checkStep = ({ type, item, step }) => {
    if (!onSaveSteps) return
    onSaveSteps(type, item.id, normalizeSteps(item.steps).map((st) => st.id === step.id ? { ...st, done: true, doneAt: new Date().toISOString() } : st))
  }
  const B_nextSteps = (
    <section className="card">
      <div className="section-title-row" style={{marginBottom:6}}>
        <div><p className="eyebrow">Next Steps</p><h3>Move each one forward</h3></div>
        <Link className="ghost-btn" to="/projects" style={{fontSize:'.8rem'}}>Projects →</Link>
      </div>
      {stepRows.length === 0 ? (
        <p className="muted" style={{fontSize:'.85rem', margin:'4px 0 0'}}>No open steps. Break a goal or project into steps and the next one shows up here.</p>
      ) : stepRows.map((r) => (
        <div key={r.type + r.item.id} className="step-row">
          <button type="button" className="step-check next" onClick={() => checkStep(r)} aria-label={`Check off ${r.step.text}`} />
          <Link to={r.type === 'goal' ? '/goals' : '/projects'} className="home-step-link">
            <span className="home-step-text">{r.step.text}</span>
            <span className="home-step-sub">{r.type === 'goal' ? 'Goal' : 'Project'} · {r.item.title}</span>
          </Link>
        </div>
      ))}
    </section>
  )

  const recoveryLog = useWellnessKey('recovery', {})
  const workoutLog = useWellnessKey('workouts', [])
  const mealLog = useWellnessKey('meals', {})
  const nutTargets = { ...DEFAULT_TARGETS, ...(useWellnessKey('nutritionTargets', {}) || {}) }
  const proteinToday = dayProtein(mealLog, TODAY)
  const proteinTarget = Number(nutTargets.protein) || 0
  const todayReadiness = readinessOf(recoveryLog?.[TODAY])
  const todayBand = readinessBand(todayReadiness)
  const sessionsThisWeek = (workoutLog || []).filter((w) => w.date >= startOfWeek(TODAY) && w.date <= TODAY).length
  const habitDone = (h) => habitLogs.some((l) => l.habitId === h.id && l.date === TODAY && l.completed)
  const habitsToday = habits.slice().sort((a, b) => Number(habitDone(a)) - Number(habitDone(b)))
  const habitsDoneCount = habits.filter(habitDone).length
  const B_body = (
    <section className="card">
      <div className="section-title-row" style={{marginBottom:6}}>
        <div><p className="eyebrow">Body &amp; Recovery</p><h3>Readiness</h3></div>
        <span className="status-pill" style={{fontSize:'.72rem'}}>{sessionsThisWeek} session{sessionsThisWeek !== 1 ? 's' : ''} this week</span>
      </div>
      {todayBand ? (
        <Link to="/wellness?tab=recovery" className={'readiness-hero compact tone-' + todayBand.tone} style={{textDecoration:'none'}}>
          <div className="readiness-num">{todayReadiness}</div>
          <div><strong>{todayBand.label}</strong><p>{todayBand.advice}</p></div>
        </Link>
      ) : (
        <Link to="/wellness?tab=recovery" className="readiness-cta">
          <Gauge size={20} />
          <div><strong>Check in</strong><span>20 seconds: sleep, energy, soreness, stress</span></div>
          <span aria-hidden="true">→</span>
        </Link>
      )}
      <Link to="/wellness?tab=nutrition" className="home-protein">
        <div className="nut-protein-top"><span><strong>{proteinToday}</strong> / {proteinTarget || '—'} g protein</span><span className="muted">{proteinTarget && proteinToday >= proteinTarget ? 'Target hit' : 'Log a meal →'}</span></div>
        <div className="nut-bar"><div style={{ width: `${proteinTarget ? Math.min(100, Math.round(proteinToday / proteinTarget * 100)) : 0}%` }} className={proteinTarget && proteinToday >= proteinTarget ? 'hit' : ''} /></div>
      </Link>
      <p className="eyebrow" style={{margin:'14px 0 2px'}}>Today's habits · {habitsDoneCount}/{habits.length}</p>
      {habits.length === 0 ? (
        <p className="muted" style={{fontSize:'.85rem', margin:'4px 0 0'}}>No habits yet. Add a few to build your daily rhythm.</p>
      ) : habitsToday.slice(0, 6).map((h) => {
        const done = habitDone(h)
        return (
          <div key={h.id} className={'step-row' + (done ? ' done' : '')}>
            <button type="button" className={'step-check' + (done ? ' done' : '')} onClick={() => onToggleHabit && onToggleHabit(h.id)}
              aria-label={done ? `Undo ${h.title}` : `Mark ${h.title} done`} aria-pressed={done}>
              {done && <Check size={13} strokeWidth={3} color="var(--warm-white)" />}
            </button>
            <Link to="/habits" className="step-text" style={{textDecoration:'none'}}>{h.title}</Link>
          </div>
        )
      })}
      <div className="home-chip-row">
        <Link to="/wellness?tab=training" className="home-chip"><Dumbbell size={15} /> Log training</Link>
        <Link to="/wellness?tab=sleep" className="home-chip"><Moon size={15} /> Sleep</Link>
        <Link to="/wellness?tab=mood" className="home-chip"><Smile size={15} /> Mood</Link>
        <Link to="/habits" className="home-chip"><Repeat size={15} /> All habits</Link>
      </div>
    </section>
  )

  const weekStart = startOfWeek(TODAY)
  const doneThisWeek = tasks.filter((t) => t.completed && t.date >= weekStart && t.date <= TODAY).length
  const stepsThisWeek = [...goals, ...projects].reduce((n, x) => n + normalizeSteps(x.steps).filter((st) => st.done && st.doneAt && dateOfStamp(st.doneAt) >= weekStart).length, 0)
  const B_review = (
    <section className="card home-review-card">
      <p className="eyebrow" style={{margin:'0 0 4px'}}>Weekly Review</p>
      <h3 style={{margin:'0 0 10px'}}>Look back. Aim forward.</h3>
      <div className="home-review-stats">
        <div><strong>{doneThisWeek}</strong><span>tasks done</span></div>
        <div><strong>{stepsThisWeek}</strong><span>steps checked</span></div>
        <div><strong>{insights.completionRate}%</strong><span>completion</span></div>
      </div>
      <ul className="home-review-prompts">
        <li>What moved forward this week, and what did God teach you in it?</li>
        <li>What will you stop, start, or keep?</li>
        <li>What is the one thing that makes next week a win?</li>
      </ul>
      <Link to="/growth" className="primary-btn" style={{display:'inline-block', textDecoration:'none', marginTop:4}}>Open weekly review</Link>
    </section>
  )

  const blocks = {
    hero: B_hero, woty: B_woty, focus: B_focus, metrics: B_metrics, quick: B_quick, schedule: B_schedule,
    suggestions: B_suggestions, overdue: B_overdue, goals: B_goals, score: B_score, execution: B_execution,
    tomorrow: B_tomorrow, faith: B_faith, nextSteps: B_nextSteps, body: B_body, review: B_review,
  }
  const order = HOME_ORDER[mode.id] || HOME_ORDER.Balanced

  return (
    <div className="home-stack" data-mode={mode.id}>
      {order.map((key) => <React.Fragment key={key}>{blocks[key]}</React.Fragment>)}

      <PageNav />
    </div>
  )
}

export { HomePage }
