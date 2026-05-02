import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { usePlannerData } from '../context/PlannerContext.jsx'
import { getTodayString } from '../utils/dates.js'

function HabitsPage({ habits, habitLogs, onToggleHabit, onEdit, onDelete, onQuickCreate }) {
  const weekStart = startOfWeek(TODAY)
  const weekEnd = endOfWeek(TODAY)
  const weekLogs = habitLogs.filter(l => l.date >= weekStart && l.date <= weekEnd)

  const SUGGESTED = [
    // ── Health ────────────────────────────────────────────────────────────
    ['Wake up earlier','Health'],['Drink more water','Health'],['Stay active','Health'],
    ['Eat mindfully','Health'],['Cook your own meals','Health'],['Test your limits','Health'],
    ['Get 7-8 hours of sleep','Health'],['Take a daily walk','Health'],
    ['Stretch every morning','Health'],['Cut out processed sugar','Health'],
    ['Take your vitamins','Health'],['Do cardio 3x per week','Health'],
    // ── Wellness ──────────────────────────────────────────────────────────
    ['Meditate daily','Wellness'],['Practice gratitude','Wellness'],
    ['Stay inspired','Wellness'],['Have mental reset days','Wellness'],
    ['Know yourself better','Wellness'],['Be OK with saying no','Wellness'],
    ['Journal daily','Wellness'],['Practice deep breathing','Wellness'],
    ['Limit social media use','Wellness'],['Read before bed','Wellness'],
    // ── Productivity ──────────────────────────────────────────────────────
    ['Do hardest tasks first','Productivity'],['Hold yourself accountable','Productivity'],
    ['Track your goals','Productivity'],['Invest in yourself','Productivity'],
    ['Plan your week on Sunday','Productivity'],['Do a daily brain dump','Productivity'],
    ['Limit distractions during work','Productivity'],['Review your to-do list nightly','Productivity'],
    // ── Lifestyle ─────────────────────────────────────────────────────────
    ['Deepen your relationships','Lifestyle'],['Spend more time in nature','Lifestyle'],
    ['Call a friend or family member','Lifestyle'],['Practice a hobby weekly','Lifestyle'],
    ['Unplug after 9pm','Lifestyle'],['Declutter one area weekly','Lifestyle'],
    // ── Finances ──────────────────────────────────────────────────────────
    ['Diversify your income streams','Finances'],['Shop smarter','Finances'],
    ['Track your spending daily','Finances'],['Save 10 percent of income','Finances'],
    ['Review subscriptions monthly','Finances'],['Build your emergency fund','Finances'],
    ['Invest consistently','Finances'],['Read one financial book monthly','Finances'],
    // ── Faith & Character ─────────────────────────────────────────────────
    ['Pray or reflect daily','Wellness'],['Practice patience intentionally','Wellness'],
    ['Serve someone selflessly','Lifestyle'],['Write a daily affirmation','Wellness'],
    ['Express gratitude to someone','Lifestyle'],['Rest without guilt','Wellness'],
  ]

  const CAT_COLOR = {Health:'#E85555',Wellness:'#22C55E',Productivity:'var(--teal)',Lifestyle:'var(--brass)',Finances:'#6366F1',Faith:'#A855F7'}

  return (
    <div className="screen-stack">
      <div style={{display:'flex',alignItems:'center',gap:8,paddingBottom:2}}>
        <span style={{fontSize:'1.1rem'}}>🔁</span>
        <p style={{fontSize:'.62rem',fontWeight:700,letterSpacing:'.12em',textTransform:'uppercase',color:'var(--brass)',margin:0}}>Habits</p>
      </div>

      {/* Active habits */}
      <section className="card">
        <div className="section-title-row">
          <div><p className="eyebrow">Your Habits</p><h3>Daily Consistency</h3></div>
          <button className="primary-btn" style={{fontSize:'.8rem',padding:'6px 14px'}} onClick={() => onQuickCreate('habit')}>+ Habit</button>
        </div>

        {habits.length === 0 && (
          <p className="muted" style={{fontSize:'.85rem',marginBottom:8}}>No habits yet. Add one or tap a suggestion below.</p>
        )}

        {habits.map(habit => {
          const logs = habitLogs.filter(l => l.habitId === habit.id)
          const todayLog = logs.find(l => isToday(l.date))
          const weekComplete = weekLogs.filter(l => l.habitId === habit.id && l.completed).length
          const streak = (() => {
            let s = 0
            let d = new Date()
            while(true) {
              const ds = d.toISOString().slice(0,10)
              if(logs.find(l=>l.date===ds&&l.completed)) { s++; d.setDate(d.getDate()-1) }
              else break
            }
            return s
          })()
          return (
            <div key={habit.id} style={{padding:'12px 0',borderBottom:'1px solid var(--stone2)',display:'flex',alignItems:'center',gap:10}}>
              <button onClick={() => onToggleHabit(habit.id, TODAY)} style={{
                width:28,height:28,borderRadius:'50%',border:'2px solid',flexShrink:0,cursor:'pointer',
                borderColor: todayLog?.completed ? 'var(--success)' : CAT_COLOR[habit.category]||'var(--brass)',
                background: todayLog?.completed ? 'var(--success)' : 'transparent',
                display:'grid',placeItems:'center'
              }}>
                {todayLog?.completed && <span style={{color:'white',fontSize:'.75rem',fontWeight:800}}>✓</span>}
              </button>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:600,fontSize:'.9rem',color:'var(--ink)'}}>{habit.title}</div>
                <div style={{display:'flex',gap:10,marginTop:2,fontSize:'.72rem',color:'var(--muted)'}}>
                  <span style={{color:CAT_COLOR[habit.category]||'var(--brass)',fontWeight:600}}>{habit.category}</span>
                  <span>{weekComplete + '/7 this week'}</span>
                  {streak > 1 && <span style={{color:'var(--warning)',fontWeight:700}}>🔥 {streak}d streak</span>}
                </div>
              </div>
              <div style={{display:'flex',gap:6,flexShrink:0}}>
                <button className="ghost-btn" style={{fontSize:'.72rem',padding:'4px 8px'}} onClick={() => onEdit('habit',habit)}>Edit</button>
                <button style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer'}} onClick={() => onDelete('habit',habit.id)}>✕</button>
              </div>
            </div>
          )
        })}
      </section>

      {/* Weekly overview */}
      {habits.length > 0 && (
        <section className="card">
          <p className="eyebrow">This Week</p>
          <h3 style={{margin:'4px 0 12px'}}>Completion Overview</h3>
          {habits.map(habit => {
            const days = getWeekDays(TODAY)
            return (
              <div key={habit.id} style={{marginBottom:12}}>
                <div style={{fontSize:'.82rem',fontWeight:600,color:'var(--ink)',marginBottom:5}}>{habit.title}</div>
                <div style={{display:'flex',gap:4}}>
                  {days.map(date => {
                    const logged = habitLogs.find(l => l.habitId === habit.id && l.date === date && l.completed)
                    const isT = date === TODAY
                    return (
                      <div key={date} onClick={() => onToggleHabit(habit.id, date)} style={{
                        flex:1,height:28,borderRadius:5,cursor:'pointer',
                        background: logged ? 'var(--success)' : isT ? 'var(--brass-dim)' : 'var(--stone2)',
                        border: isT ? '1.5px solid var(--brass)' : '1px solid var(--border)',
                        display:'grid',placeItems:'center',fontSize:'.6rem',color: logged ? 'white' : 'var(--muted)',fontWeight:700
                      }}>
                        {logged ? '✓' : new Date(date+'T12:00:00').toLocaleDateString('en-US',{weekday:'narrow'})}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </section>
      )}

      {/* Suggestions */}
      <section className="card">
        <p className="eyebrow">Suggestions</p>
        <h3 style={{margin:'4px 0 10px'}}>50 Powerful Habits</h3>
        <p className="muted" style={{fontSize:'.82rem',marginBottom:12}}>Tap any habit to add it instantly.</p>
        <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
          {SUGGESTED.filter(([t]) => !habits.find(h=>h.title===t)).map(([title,cat]) => (
            <button key={title} onClick={() => onQuickCreate('habit',{title,category:cat})} style={{
              padding:'6px 12px',borderRadius:999,border:'1.5px solid var(--border2)',
              background:'var(--stone)',color:'var(--ink2)',fontSize:'.78rem',
              fontWeight:500,cursor:'pointer',fontFamily:'var(--sans)'
            }}>+ {title}</button>
          ))}
        </div>
      </section>
    </div>
  )
}


export default HabitsPage
