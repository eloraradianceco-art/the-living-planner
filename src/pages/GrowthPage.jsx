import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { usePlannerData } from '../context/PlannerContext.jsx'
import { MiniLineChart, MiniBarChart } from '../components/Charts.jsx'
import { computeScores } from '../utils/scoring.js'
import { getScoreTrend } from '../utils/scoring.js'

function GrowthPage({ scores, habits, habitLogs, goals, tasks, projects, onToggleHabit, onEdit, onDelete, onQuickCreate, budget, setBudget }) {
  const weekStart = startOfWeek(TODAY)
  const weekEnd = endOfWeek(TODAY)
  const weekLogs = habitLogs.filter((log) => log.date >= weekStart && log.date <= weekEnd)
  const completedWeekLogs = weekLogs.filter((log) => log.completed).length
  const [showScoreInfo, setShowScoreInfo] = useState(false)
  const [reviewAnswers, setReviewAnswers] = useState(() => { try { const v = localStorage.getItem('planner.gr.review'); return v ? JSON.parse(v) : {} } catch { return {} } })
  const [reviewHistory, setReviewHistory] = useState(() => { try { return JSON.parse(localStorage.getItem('planner.gr.reviewHistory')||'[]') } catch { return [] } })
  const [intentionText, setIntentionText] = useState(() => { try { return localStorage.getItem('planner.gr.intention')||'' } catch { return '' } })
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
    win: scores.Productivity >= 7 ? 'You protected momentum well this week.' : 'There is room to tighten follow-through next week.',
    recovery: scores.Wellness < 6 ? 'Wellness is trailing. Build in recovery and reflection blocks.' : 'Wellness held strong — protect this.',
    money: scores.Finances >= 7 ? 'Finances stayed inside the guardrails.' : 'Finances need a closer reset and review.',
  }

  const SCORE_GUIDE = [
    { name: 'Health', color: '#E85555', how: 'Health category task completion + Health habit logs.' },
    { name: 'Lifestyle', color: '#F0B429', how: 'Lifestyle category task completion.' },
    { name: 'Productivity', color: '#00C2B3', how: 'Productivity category task completion + project progress.' },
    { name: 'Wellness', color: '#22C55E', how: 'Wellness task completion + Wellness habit logs.' },
    { name: 'Finances', color: '#6366F1', how: 'Discretionary spending vs your weekly target.' },
  ]

  // Overall life score (average)
  const scoreValues = Object.values(scores)
  const overallScore = scoreValues.length > 0 ? (scoreValues.reduce((s,v)=>s+v,0)/scoreValues.length).toFixed(1) : 0
  const scoreLabel = overallScore >= 8 ? 'Thriving' : overallScore >= 6 ? 'On Track' : overallScore >= 4 ? 'Needs Attention' : 'Reset Needed'
  const scoreColor = overallScore >= 8 ? 'var(--success)' : overallScore >= 6 ? 'var(--teal)' : overallScore >= 4 ? 'var(--brass)' : 'var(--danger)'

  // Streak calculations
  const todayHabitsDone = habits.filter(h => weekLogs.find(l => l.habitId===h.id && l.completed && l.date===TODAY)).length
  const openTasks = tasks.filter(t => !t.completed).length
  const tasksDueToday = tasks.filter(t => t.date===TODAY && !t.completed).length
  const activeGoals = goals.filter(g => !g.completed).length
  const goalsNearDue = goals.filter(g => !g.completed && g.targetDate && g.targetDate <= TODAY).length

  return (
    <div className="screen-stack">
      <div style={{display:'flex',alignItems:'center',gap:8,paddingBottom:2}}>
        <span style={{fontSize:'1.1rem'}}>↑</span>
        <p style={{fontSize:'.62rem',fontWeight:700,letterSpacing:'.12em',textTransform:'uppercase',color:'var(--brass)',margin:0}}>Growth</p>
      </div>

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

        {Object.entries(scores).map(([name, value]) => (
          <div key={name} className="score-line" style={{gap:10}}>
            <span style={{minWidth:90,fontSize:'.88rem',color:'var(--text2)',fontWeight:500}}>{name}</span>
            <div className="score-bar" style={{flex:1}}>
              <div style={{
                width:`${value * 10}%`,
                background: value >= 7 ? 'var(--success)' : value >= 5 ? 'var(--teal)' : 'var(--danger)',
                height:'100%',borderRadius:999,transition:'width .4s'
              }} />
            </div>
            <strong style={{minWidth:32,textAlign:'right',fontSize:'.9rem',
              color: value >= 7 ? 'var(--success)' : value >= 5 ? 'var(--teal)' : 'var(--danger)'}}>
              {value + '/10'}
            </strong>
          </div>
        ))}

        {showScoreInfo && (
          <div style={{marginTop:14,borderTop:'1px solid var(--surface)',paddingTop:14}}>
            <p className="eyebrow" style={{marginBottom:10}}>How Each Score Is Calculated</p>
            {SCORE_GUIDE.map(s => (
              <div key={s.name} style={{display:'flex',gap:10,padding:'8px 0',borderBottom:'1px solid var(--surface)'}}>
                <div style={{width:10,height:10,borderRadius:'50%',background:s.color,flexShrink:0,marginTop:4}} />
                <div>
                  <div style={{fontWeight:700,fontSize:'.85rem',marginBottom:2}}>{s.name}</div>
                  <div style={{fontSize:'.78rem',color:'var(--muted)',lineHeight:1.5}}>{s.how}</div>
                </div>
              </div>
            ))}
            <div style={{marginTop:10,padding:10,background:'var(--teal-dim)',borderRadius:'var(--radius-sm)',fontSize:'.78rem',color:'var(--muted)'}}>
              💡 Scores update automatically as you complete tasks, log habits, and manage spending. 5 = halfway, 10 = full execution.
            </div>
          </div>
        )}
      </section>

      {/* ── Weekly Pulse ────────────────────────────────────────────────── */}
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

      {/* ── Quick Status ────────────────────────────────────────────────── */}
      <section className="card">
        <p className="eyebrow">Today at a Glance</p>
        <h3 style={{margin:'4px 0 14px'}}>Where you stand right now</h3>
        <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:10}}>
          {[
            ['✓', todayHabitsDone + ' of ' + habits.length, 'Habits done today', todayHabitsDone===habits.length&&habits.length>0?'var(--success)':'var(--teal)'],
            ['📋', tasksDueToday > 0 ? tasksDueToday + ' due today' : 'All clear', 'Tasks', tasksDueToday>0?'var(--danger)':'var(--success)'],
            ['🎯', activeGoals + ' active', 'Goals in progress', 'var(--brass)'],
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

      {/* ── Weekly Intention ────────────────────────────────────────────── */}
      <section className="card">
        <p className="eyebrow">Weekly Intention</p>
        <h3 style={{margin:'4px 0 8px'}}>What matters most this week?</h3>
        <p className="muted" style={{fontSize:'.8rem',marginBottom:10}}>Set one clear intention at the start of each week. Keep it visible.</p>
        <textarea value={intentionText} onChange={e=>{setIntentionText(e.target.value);try{localStorage.setItem('planner.gr.intention',e.target.value)}catch{}}}
          placeholder="This week I am committed to..."
          style={{width:'100%',minHeight:80,padding:'10px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',
          fontSize:'.9rem',fontFamily:'var(--serif)',lineHeight:1.6,resize:'vertical',background:'var(--warm-white)',color:'var(--ink)',boxSizing:'border-box'}} />
      </section>

      {/* ── Weekly Reflection ───────────────────────────────────────────── */}
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
                <div style={{fontWeight:600,fontSize:'.8rem',color:'var(--brass)',marginBottom:6}}>{entry.date}</div>
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
            <div style={{fontSize:'.78rem',fontWeight:700,color:'var(--brass)',marginBottom:6,letterSpacing:'.03em'}}>{prompt}</div>
            <textarea value={reviewAnswers[i]||''} onChange={e=>{const u={...reviewAnswers,[i]:e.target.value};setReviewAnswers(u);try{localStorage.setItem('planner.gr.review',JSON.stringify(u))}catch{}}}
              placeholder="Write freely..."
              style={{width:'100%',minHeight:70,padding:'10px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',
              fontSize:'.85rem',fontFamily:'var(--serif)',lineHeight:1.6,resize:'vertical',background:'var(--warm-white)',color:'var(--ink)',boxSizing:'border-box'}} />
          </div>
        ))}
        <button className="primary-btn" style={{width:'100%',fontSize:'.88rem'}}
          onClick={()=>{
            const entry = {date:TODAY,answers:{...reviewAnswers},id:Date.now()}
            const prev = JSON.parse(localStorage.getItem('planner.gr.reviewHistory')||'[]')
            const updated = [entry,...prev].slice(0,52)
            localStorage.setItem('planner.gr.reviewHistory',JSON.stringify(updated))
            setReviewHistory(updated)
            setReviewAnswers({})
            localStorage.removeItem('planner.gr.review')
          }}>Save This Week's Review</button>
      </section>

      {/* ── Personal Development ────────────────────────────────────────── */}
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

      {/* ── Weekly Spending Target (kept for score linkage) ──────────────── */}
      <section className="card">
        <p className="eyebrow">Finance</p>
        <h3 style={{margin:'4px 0 6px'}}>Weekly Spending Target</h3>
        <p className="muted" style={{fontSize:'.8rem',marginBottom:10}}>Discretionary only — bills and rent do not count. Used to calculate your Finance score.</p>
        <div style={{display:'flex',gap:10,alignItems:'center'}}>
          <input type="number" value={budget.weeklyTarget}
            onChange={(e) => setBudget({ weeklyTarget: Number(e.target.value) })}
            style={{flex:1,padding:'10px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.9rem'}} />
          <span className="muted" style={{fontSize:'.85rem'}}>/week</span>
        </div>
      </section>
    </div>
  )
}




export default GrowthPage
