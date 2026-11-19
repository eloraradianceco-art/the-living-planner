// Growth: Life Score in 7 areas, trend, weekly review, reading list.
import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { TrendingUp } from 'lucide-react'
import { hasSupabaseEnv, supabase } from '../lib/supabase.js'
import { TODAY, startOfWeek, endOfWeek, formatDateLabel } from '../lib/dates.js'
import { SCORE_DOMAINS, DOMAIN_META, lifeScoreOf } from '../lib/score.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { PageNav } from '../components/PageNav.jsx'
import { Fold } from '../components/Fold.jsx'
import { EmptyState } from '../components/EmptyState.jsx'
import { PageHeader } from '../components/PageHeader.jsx'
import { useOwnWrites, useRemotePageData, usePageKey } from '../lib/pageData.js'

// Reading list — lives in Growth; data stays under page 'wellness', key 'books'.
const BOOK_STATUS = { Reading: { color:'var(--brass-fg)', bg: 'var(--brass-dim)' }, 'Want to Read': { color: 'var(--ink2)', bg: 'var(--stone2)' }, Completed: { color: 'var(--success)', bg: 'rgba(34,197,94,.12)' } }
function ReadingList() {
  const [books, saveBooks] = usePageKey('wellness', 'books', [], ['planner.hw.books', 'books'])
  const [b, setB] = useState({ title: '', author: '', status: 'Reading' })
  const order = { Reading: 0, 'Want to Read': 1, Completed: 2 }
  const sorted = (books || []).map((book, i) => ({ ...book, _i: i })).sort((x, y) => (order[x.status] ?? 3) - (order[y.status] ?? 3))
  const cycle = (i) => { const next = { Reading: 'Completed', Completed: 'Want to Read', 'Want to Read': 'Reading' }; saveBooks(books.map((x, j) => j === i ? { ...x, status: next[x.status] || 'Reading' } : x)) }
  return (
    <section className="card">
      <div className="section-title-row" style={{ marginBottom: 6 }}>
        <div><p className="eyebrow">Reading</p><h3>Your library</h3></div>
        <span className="status-pill" style={{ fontSize: '.72rem' }}>{(books || []).filter((x) => x.status === 'Completed').length} finished</span>
      </div>
      {sorted.length === 0 && <p className="muted" style={{ fontSize: '.85rem' }}>Add what you're reading or want to read.</p>}
      {sorted.map((book) => {
        const st = BOOK_STATUS[book.status] || BOOK_STATUS['Want to Read']
        return (
          <div key={book.id || book._i} className="metric-row card-row">
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: '.9rem', color: 'var(--ink)' }}>{book.title}</div>
              {book.author && <div className="muted" style={{ fontSize: '.75rem' }}>{book.author}</div>}
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
              <button onClick={() => cycle(book._i)} title="Tap to change status" style={{ fontSize: '.68rem', padding: '3px 9px', borderRadius: 999, border: 'none', cursor: 'pointer', background: st.bg, color: st.color, fontWeight: 700 }}>{book.status}</button>
              <button className="time-card-del" aria-label="Remove book" onClick={() => saveBooks(books.filter((_, j) => j !== book._i))}>✕</button>
            </div>
          </div>
        )
      })}
      <div className="wl-form">
        <input placeholder="Book title" value={b.title} onChange={(e) => setB((p) => ({ ...p, title: e.target.value }))} />
        <div className="wl-grid3" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <input placeholder="Author" value={b.author} onChange={(e) => setB((p) => ({ ...p, author: e.target.value }))} />
          <select value={b.status} onChange={(e) => setB((p) => ({ ...p, status: e.target.value }))}><option>Reading</option><option>Want to Read</option><option>Completed</option></select>
        </div>
        <button className="primary-btn" onClick={() => { if (!b.title.trim()) return; saveBooks([...(books || []), { ...b, title: b.title.trim(), id: Date.now() }]); setB({ title: '', author: '', status: 'Reading' }) }}>Add book</button>
      </div>
    </section>
  )
}

function GrowthPage({ scores, scoreDetails = {}, scoreHistory = [], scoreSeries = [], habits, habitLogs, goals, tasks, projects, onToggleHabit, onEdit, onDelete, onQuickCreate, budget, setBudget, isPro = false, onUpgrade = () => {} }) {
  const { user } = useAuth()

  const ownPage = useOwnWrites()
  const syncPageData = React.useCallback(async (key, value) => {
    try { localStorage.setItem('planner.gr.' + key, JSON.stringify(value)) } catch {}
    const at = ownPage.mark(key)
    if (!user || !hasSupabaseEnv) return
    try {
      await supabase.from('page_data').upsert({
        user_id: user.id, page: 'growth', data_key: key, data_value: value,
        updated_at: at
      }, { onConflict: 'user_id,page,data_key' })
    } catch (e) { console.error('Growth sync error:', e) }
  }, [user?.id, ownPage])

  React.useEffect(() => {
    if (!user || !hasSupabaseEnv) return
    supabase.from('page_data').select('data_key, data_value')
      .eq('user_id', user.id).eq('page', 'growth')
      .then(({ data, error }) => {
        if (error || !data) return
        data.forEach(row => {
          if (ownPage.wrote(row.data_key)) return
          applyGrowth(row.data_key, row.data_value)
        })
      })
  }, [user?.id])
  const applyGrowth = (key, value) => {
    const fallback = { reviewAnswers: {}, reviewHistory: [], intentionText: '' }[key]
    if (fallback === undefined) return
    const v = value ?? fallback
    if (key === 'reviewAnswers') setReviewAnswers(v)
    if (key === 'reviewHistory') setReviewHistory(v)
    if (key === 'intentionText') setIntentionText(v)
    try { localStorage.setItem('planner.gr.' + key, JSON.stringify(v)) } catch {}
  }
  useRemotePageData('growth', ownPage, applyGrowth)

  const weekStart = startOfWeek(TODAY)
  const weekEnd = endOfWeek(TODAY)
  const weekLogs = habitLogs.filter((log) => log.date >= weekStart && log.date <= weekEnd)
  const completedWeekLogs = weekLogs.filter((log) => log.completed).length
  const [showScoreInfo, setShowScoreInfo] = useState(false)
  // Device copies live under 'planner.gr.<key>'; older builds used bare keys or 'planner.gr.review' / 'planner.gr.intention'
  const grGet = (keys, d) => { try { for (const k of keys) { const v = localStorage.getItem(k); if (v != null) { try { return JSON.parse(v) } catch { return v } } } } catch {} return d }
  const [reviewAnswers, setReviewAnswers] = useState(() => grGet(['planner.gr.reviewAnswers', 'reviewAnswers', 'planner.gr.review'], {}))
  const [reviewHistory, setReviewHistory] = useState(() => grGet(['planner.gr.reviewHistory', 'reviewHistory'], []))
  const [intentionText, setIntentionText] = useState(() => String(grGet(['planner.gr.intentionText', 'planner.gr.intention'], '') || ''))
  const intentionTimer = React.useRef(null)
  const [showHistory, setShowHistory] = useState(false)

  const weeklyReviewPrompts = [
    'What were my top 3 wins this week?',
    'What did I struggle with and what will I do differently?',
    'Did my actions align with my goals and values?',
    'What habits did I keep? Which did I miss?',
    'What am I grateful for this week?',
    'What is my one focus for next week?',
  ]

  const weeklyReview = {
    win: scores.Productivity == null ? 'Give tasks due dates so your week can be measured.' : scores.Productivity >= 7 ? 'You protected momentum well this week.' : 'There is room to tighten follow-through next week.',
    recovery: scores.Wellness == null ? 'Log your mood or routine on the Wellness page to see this.' : scores.Wellness < 6 ? 'Wellness is trailing. Build in recovery and reflection blocks.' : 'Wellness held strong — protect this.',
    money: scores.Finances == null ? 'Log spending or add to a savings goal to track this.' : scores.Finances >= 7 ? 'Finances stayed inside the guardrails.' : 'Finances need a closer reset and review.',
  }

  // What each area measures (the live breakdown under "How scores work" shows what counted this week)
  const SCORE_GUIDE = {
    Faith: 'Daily reflection, Bible reading, prayer & gratitude, plus Faith habits and tasks.',
    Health: 'Workouts, sleep (quality + hours), water, recovery energy, meals logged, plus Health habits and tasks.',
    Wellness: 'Mood check-ins, calm (anxiety log), journal, daily routine, plus Wellness habits and tasks.',
    Lifestyle: 'Daily and weekly chores in the cleaning tracker, plus Lifestyle habits and tasks.',
    Productivity: 'Work and business tasks done when due, nothing piling up overdue, goal and project steps checked off, plus Productivity habits.',
    Finances: 'Spending vs your budget, counted by the week (when you log spending), adding to savings, plus Finance habits and tasks.',
  }

  // Overall life score (average of the areas you're tracking)
  const life = lifeScoreOf(scores)
  const overallScore = life == null ? '—' : life.toFixed(1)
  const scoreLabel = life == null ? 'Start logging' : life >= 8 ? 'Thriving' : life >= 6 ? 'On Track' : life >= 4 ? 'Needs Attention' : 'Reset Needed'
  const scoreColor = life == null ? 'var(--muted)' : life >= 8 ? 'var(--success)' : life >= 6 ? 'var(--teal)' : life >= 4 ? 'var(--brass-fg)' : 'var(--danger)'

  // Streak calculations
  const todayHabitsDone = habits.filter(h => weekLogs.find(l => l.habitId===h.id && l.completed && l.date===TODAY)).length
  const openTasks = tasks.filter(t => !t.completed).length
  const tasksDueToday = tasks.filter(t => t.date===TODAY && !t.completed).length
  const activeGoals = goals.filter(g => !g.completed).length
  const goalsNearDue = goals.filter(g => !g.completed && g.targetDate && g.targetDate <= TODAY).length

  return (
    <div className="screen-stack">
      <PageHeader icon={TrendingUp} title="Growth" subtitle="See who you're becoming" />

      {/* ── Life Score ──────────────────────────────────────────────────── */}
      <section className="card premium-card">
        <div className="section-title-row">
          <div>
            <p className="eyebrow">Auto Scorecard</p>
            <h3>Life Balance</h3>
          </div>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            <span className="status-pill">Self-updating</span>
            <button onClick={() => setShowScoreInfo(s => !s)}
              style={{background:'none',border:'1.5px solid var(--border2)',borderRadius:999,padding:'4px 10px',fontSize:'.75rem',cursor:'pointer'}}>
              {showScoreInfo ? 'Hide' : 'How scores work'}
            </button>
          </div>
        </div>

        {/* Overall score */}
        <div style={{display:'flex',alignItems:'center',gap:16,padding:'12px 0',marginBottom:8,borderBottom:'1px solid var(--border)'}}>
          <div style={{width:56,height:56,borderRadius:'50%',background:scoreColor+'22',border:`3px solid ${scoreColor}`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
            <strong style={{fontSize:'1.1rem',color:scoreColor}}>{overallScore}</strong>
          </div>
          <div>
            <div style={{fontWeight:700,fontSize:'1rem',color:scoreColor}}>{scoreLabel}</div>
            <div className="muted" style={{fontSize:'.78rem'}}>Overall life balance this week</div>
          </div>
        </div>

        {Object.entries(scores).map(([name, value]) => {
          const tone = value == null ? 'var(--muted)' : value >= 7 ? 'var(--success)' : value >= 5 ? 'var(--teal)' : 'var(--danger)'
          return (
            <div key={name} className="score-line" style={{gap:10}}>
              <span style={{minWidth:110,fontSize:'.88rem',color:'var(--text2)',fontWeight:500}}><span aria-hidden="true">{DOMAIN_META[name]?.emoji}</span> {name}</span>
              <div className="score-bar" style={{flex:1}}>
                <div style={{ width:`${(value || 0) * 10}%`, background: tone, height:'100%',borderRadius:999,transition:'width .4s' }} />
              </div>
              <strong style={{minWidth:40,textAlign:'right',fontSize:'.9rem',color: tone}}>{value == null ? '—' : value + '/10'}</strong>
            </div>
          )
        })}

        {showScoreInfo && (
          <div className="score-explain">
            <p className="eyebrow" style={{marginBottom:6}}>How Each Score Is Calculated</p>
            <p className="muted score-explain-lead">Each area is scored 1–10 from the last 7 days in its own section. A part counts once you start using it; an area with nothing logged shows "—" and is left out of your Life Score.</p>
            {SCORE_DOMAINS.map((d) => {
              const det = scoreDetails[d] || { parts: [] }
              return (
                <div key={d} className="score-explain-area">
                  <div className="score-explain-head">
                    <strong><span aria-hidden="true">{DOMAIN_META[d].emoji}</span> {d}</strong>
                    <span>{det.score == null ? 'not tracked yet' : det.score + '/10'}</span>
                  </div>
                  <div className="score-explain-how">{SCORE_GUIDE[d]}</div>
                  {det.parts.length > 0 ? (
                    <ul className="score-explain-parts">
                      {det.parts.map((part) => (
                        <li key={part.label}>
                          <span>{part.label}</span>
                          <span className="muted">{part.detail}</span>
                          <span className="score-explain-meter"><span style={{ width: `${Math.round(part.value * 100)}%` }} /></span>
                        </li>
                      ))}
                    </ul>
                  ) : <div className="score-explain-empty">Nothing logged here in the last 7 days.</div>}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ── Weekly Pulse ────────────────────────────────────────────────── */}
      <section className="card">
        <p className="eyebrow">Progress Over Time</p>
        <h3 style={{margin:'4px 0 14px'}}>Score Trend — Last 30 Days</h3>
        {/* One bar per day for 30 days. Bars used to collapse to slivers (percent heights inside columns with no
            height) and only saved days appeared, so 4 days stretched across the whole card. 2026-11-13 */}
        {(() => {
          const tracked = scoreSeries.filter((d) => d.score != null)
          if (!tracked.length) return <EmptyState icon="📈" title="No history yet" message="Your Life Score for each day will appear here as you log in your sections." />
          const toneOf = (v) => v >= 8 ? 'var(--success)' : v >= 6 ? 'var(--teal)' : v >= 4 ? 'var(--warning)' : 'var(--danger)'
          const avg = Math.round(tracked.reduce((n, d) => n + d.score, 0) / tracked.length * 10) / 10
          const today = scoreSeries[scoreSeries.length - 1]
          const best = Math.max(...tracked.map((d) => d.score))
          const lbl = (d) => formatDateLabel(d, { month: 'short', day: 'numeric' })
          return (<>
            <div className="trend-chart" role="img" aria-label={`Life Score by day for the last 30 days. Average ${avg}, best ${best}.`}>
              {[10, 5].map((g) => <div key={g} className="trend-grid" style={{ bottom: `${g * 10}%` }}><span>{g}</span></div>)}
              <div className="trend-bars">
                {scoreSeries.map((d) => (
                  <div key={d.date} className={'trend-col' + (d.live ? ' today' : '')} title={`${lbl(d.date)}: ${d.score == null ? 'nothing tracked' : d.score + '/10'}`}>
                    {d.score == null
                      ? <div className="trend-bar empty" />
                      : <div className="trend-bar" style={{ height: `${d.score * 10}%`, background: toneOf(d.score) }} />}
                  </div>
                ))}
              </div>
            </div>
            <div className="trend-axis"><span>{lbl(scoreSeries[0].date)}</span><span>{lbl(scoreSeries[14].date)}</span><span>Today</span></div>
            <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginTop:12}}>
              {[
                ['30-day average', avg.toFixed(1), 'var(--teal)'],
                ['Today', today?.score ?? '—', 'var(--brass-fg)'],
                ['Best', best, 'var(--success)'],
              ].map(([label, val, color]) => (
                <div key={label} style={{textAlign:'center', background:'var(--stone)', borderRadius:8, padding:'10px 4px'}}>
                  <div className="muted" style={{fontSize:'.7rem', marginBottom:2}}>{label}</div>
                  <strong style={{color, fontSize:'1.1rem'}}>{val}</strong>
                </div>
              ))}
            </div>
            <p className="muted" style={{fontSize:'.72rem', margin:'10px 0 0', lineHeight:1.5}}>
              {tracked.length} of 30 days tracked. Each day is the same 7-day Life Score you see on Home, as it stood that day. Empty days had nothing logged.
            </p>
          </>)
        })()}
      </section>

      <div className="fold-list home-rows">
      <Fold id="growth-week" emoji="🗣️" title="Weekly Pulse" sub="What the week is saying">
      <section className="card premium-card">
        <div className="section-title-row">
          <div>
            <p className="eyebrow">Weekly Pulse</p>
            <h3>What the week is saying</h3>
          </div>
          <span className="status-pill">{completedWeekLogs} habit wins</span>
        </div>
        <div className="review-grid">
          <div className="review-card"><strong>Momentum</strong><p>{weeklyReview.win}</p></div>
          <div className="review-card"><strong>Recovery</strong><p>{weeklyReview.recovery}</p></div>
          <div className="review-card"><strong>Finances</strong><p>{weeklyReview.money}</p></div>
        </div>
      </section>
      </Fold>

      {/* ── Quick Status ────────────────────────────────────────────────── */}
      <Fold id="growth-status" emoji="📍" title="Today at a Glance" sub="Where you stand right now">
      <section className="card">
        <p className="eyebrow">Today at a Glance</p>
        <h3 style={{margin:'4px 0 14px'}}>Where you stand right now</h3>
        <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:10}}>
          {[
            ['✓', todayHabitsDone + ' of ' + habits.length, 'Habits done today', todayHabitsDone===habits.length&&habits.length>0?'var(--success)':'var(--teal)'],
            ['📋', tasksDueToday > 0 ? tasksDueToday + ' due today' : 'All clear', 'Tasks', tasksDueToday>0?'var(--danger)':'var(--success)'],
            ['🎯', activeGoals + ' active', 'Goals in progress', 'var(--brass-fg)'],
            ['⚠', goalsNearDue > 0 ? goalsNearDue + ' overdue' : 'On schedule', 'Goal deadlines', goalsNearDue>0?'var(--danger)':'var(--success)'],
          ].map(([icon, val, label, col]) => (
            <div key={label} style={{background:'var(--stone)',borderRadius:10,padding:'12px 14px'}}>
              <div style={{fontSize:'1.4rem',marginBottom:4}}>{icon}</div>
              <div style={{fontWeight:700,color:col,fontSize:'1rem'}}>{val}</div>
              <div className="muted" style={{fontSize:'.75rem'}}>{label}</div>
            </div>
          ))}
        </div>
      </section>
      </Fold>

      {/* ── Weekly Intention ────────────────────────────────────────────── */}
      <Fold id="growth-intention" emoji="🎯" title="Weekly Intention" sub="What matters most this week?">
      <section className="card">
        <p className="eyebrow">Weekly Intention</p>
        <h3 style={{margin:'4px 0 8px'}}>What matters most this week?</h3>
        <p className="muted" style={{fontSize:'.8rem',marginBottom:10}}>Set one clear intention at the start of each week. Keep it visible.</p>
        <textarea value={intentionText} onChange={e=>{const v=e.target.value;setIntentionText(v);try{localStorage.setItem('planner.gr.intentionText',JSON.stringify(v))}catch{};clearTimeout(intentionTimer.current);intentionTimer.current=setTimeout(()=>syncPageData('intentionText',v),700)}}
          placeholder="This week I am committed to..."
          style={{width:'100%',minHeight:80,padding:'10px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',
          fontSize:'.9rem',fontFamily:'var(--serif)',lineHeight:1.6,resize:'vertical',background:'var(--warm-white)',color:'var(--ink)',boxSizing:'border-box'}} />
      </section>
      </Fold>

      {/* ── Weekly Reflection ───────────────────────────────────────────── */}
      <Fold id="growth-review" emoji="📝" title="Weekly Reflection" sub="End of week review">
      <section className="card">
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
          <div>
            <p className="eyebrow">Weekly Reflection</p>
            <h3 style={{margin:'4px 0 0'}}>End of Week Review</h3>
          </div>
          <button className="ghost-btn" style={{fontSize:'.78rem',padding:'4px 10px'}}
            onClick={()=>setShowHistory(h=>!h)}>
            {showHistory ? 'Hide History' : `History (${reviewHistory.length})`}
          </button>
        </div>
        <p className="muted" style={{fontSize:'.82rem',marginBottom:14,marginTop:8}}>Take 10 minutes each week to reflect. Done consistently, this compounds into clarity.</p>

        {showHistory && reviewHistory.length > 0 && (
          <div style={{marginBottom:16,background:'var(--stone)',borderRadius:10,padding:'12px'}}>
            <p style={{fontWeight:600,fontSize:'.85rem',marginBottom:10}}>Past Reviews</p>
            {reviewHistory.slice(0,5).map((entry,i) => (
              <div key={i} style={{marginBottom:10,paddingBottom:10,borderBottom:i<4?'1px solid var(--border)':'none'}}>
                <div style={{fontWeight:600,fontSize:'.8rem',color:'var(--brass-fg)',marginBottom:6}}>{entry.date}</div>
                {weeklyReviewPrompts.slice(0,2).map((prompt,j) => (
                  entry.answers[j] && (
                    <div key={j} style={{marginBottom:4}}>
                      <div className="muted" style={{fontSize:'.72rem',marginBottom:2}}>{prompt}</div>
                      <div style={{fontSize:'.8rem',color:'var(--ink2)',lineHeight:1.5}}>{entry.answers[j]}</div>
                    </div>
                  )
                ))}
              </div>
            ))}
          </div>
        )}

        {weeklyReviewPrompts.map((prompt,i) => (
          <div key={i} style={{marginBottom:14}}>
            <div style={{fontSize:'.78rem',fontWeight:700,color:'var(--brass-fg)',marginBottom:6,letterSpacing:'.03em'}}>{prompt}</div>
            <textarea value={reviewAnswers[i]||''} onChange={e=>{const u={...reviewAnswers,[i]:e.target.value};setReviewAnswers(u);syncPageData('reviewAnswers',u)}}
              placeholder="Write freely..."
              style={{width:'100%',minHeight:70,padding:'10px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',
              fontSize:'.85rem',fontFamily:'var(--serif)',lineHeight:1.6,resize:'vertical',background:'var(--warm-white)',color:'var(--ink)',boxSizing:'border-box'}} />
          </div>
        ))}
        <button className="primary-btn" style={{width:'100%',fontSize:'.88rem'}}
          onClick={()=>{
            const entry = {date:TODAY,answers:{...reviewAnswers},id:Date.now()}
            const prev = reviewHistory
            const updated = [entry,...prev].slice(0,52)
            setReviewHistory(updated)
            syncPageData('reviewHistory',updated)
            setReviewAnswers({})
            syncPageData('reviewAnswers',{})
          }}>Save This Week's Review</button>
      </section>
      </Fold>

      {/* ── Personal Development ────────────────────────────────────────── */}
      <Fold id="growth-principles" emoji="🌱" title="Personal Development" sub="Principles for growth">
      <section className="card">
        <p className="eyebrow">Personal Development</p>
        <h3 style={{margin:'4px 0 14px'}}>Principles for Growth</h3>
        {[
          ['🪞', 'Self-Awareness', 'You cannot change what you do not see. Review your patterns weekly and honestly name what is working and what is not.'],
          ['📐', 'Systems Over Willpower', 'Build your environment so the right choice is the easy choice. Willpower depletes — systems do not.'],
          ['📈', 'Compound Consistency', 'One percent better every day is 37x better in a year. Small wins, stacked daily, create transformational change.'],
          ['🧱', 'Identity First', 'You do not rise to your goals — you fall to your systems. Decide who you are becoming, then act from that identity.'],
          ['🔄', 'Failure as Feedback', 'Every setback contains a lesson. The question is not "why did this happen" but "what is this teaching me."'],
        ].map(([icon, title, text]) => (
          <div key={title} style={{display:'flex',gap:12,padding:'12px 0',borderBottom:'1px solid var(--border)',alignItems:'flex-start'}}>
            <div style={{fontSize:'1.4rem',flexShrink:0,marginTop:2}}>{icon}</div>
            <div>
              <div style={{fontWeight:700,fontSize:'.88rem',marginBottom:4}}>{title}</div>
              <div className="muted" style={{fontSize:'.8rem',lineHeight:1.6}}>{text}</div>
            </div>
          </div>
        ))}
      </section>
      </Fold>

      {/* ── Reading (moved from Wellness) ─────────────────────────────────── */}
      <Fold id="growth-reading" emoji="📚" title="Reading" sub="Your library">
      <ReadingList />
      </Fold>
      </div>

      <section className="card" style={{ padding: '12px 16px' }}>
        <Link to="/finance" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', textDecoration: 'none', color: 'var(--ink2)', fontSize: '.85rem', fontWeight: 600 }}>
          <span>Weekly spending target is in Finance → Budget Plan</span><span style={{ color:'var(--brass-fg)' }}>→</span>
        </Link>
      </section>
      <PageNav />
    </div>
  )
}

export { GrowthPage }
