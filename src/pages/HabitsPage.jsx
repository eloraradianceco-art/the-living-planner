// Habits.
import { Repeat } from 'lucide-react'
import { TODAY, addDays, startOfWeek, endOfWeek, getWeekDays, isToday } from '../lib/dates.js'
import { habitTimesPerWeek } from '../lib/score.js'
import { PageNav } from '../components/PageNav.jsx'
import { Fold } from '../components/Fold.jsx'
import { EmptyState } from '../components/EmptyState.jsx'
import { PageHeader } from '../components/PageHeader.jsx'

// ── HEALTH PAGE ───────────────────────────────────────────────────────────

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
    ['Pray or reflect daily','Faith'],['Practice patience intentionally','Wellness'],
    ['Serve someone selflessly','Faith'],['Write a daily affirmation','Wellness'],
    ['Express gratitude to someone','Lifestyle'],['Rest without guilt','Wellness'],
  ]

  const CAT_COLOR = {Health:'#B83A3A',Wellness:'#1F7A43',Productivity:'var(--teal)',Lifestyle:'var(--brass-fg)',Finances:'#4F46E5',Faith:'#8B3FD1'} // text-safe on light cards

  return (
    <div className="screen-stack">
      <PageHeader icon={Repeat} title="Habits" subtitle="Small disciplines, kept daily" />

      {/* Active habits */}
      <section className="card">
        <div className="section-title-row">
          <div><p className="eyebrow">Your Habits</p><h3>Daily Consistency</h3></div>
          <button className="primary-btn" style={{fontSize:'.8rem',padding:'6px 14px'}} onClick={() => onQuickCreate('habit')}>+ Habit</button>
        </div>

        {habits.length === 0 && (
          <p className="muted" style={{fontSize:'.85rem',marginBottom:8}}><EmptyState icon="🔁" title="Habits shape destiny" message="Choose one small discipline. Begin today. Stay consistent." /></p>
        )}

        {habits.map(habit => {
          const logs = habitLogs.filter(l => l.habitId === habit.id)
          const todayLog = logs.find(l => isToday(l.date))
          const weekComplete = new Set(weekLogs.filter(l => l.habitId === habit.id && l.completed).map(l => l.date)).size
          const perWeek = habitTimesPerWeek(habit)
          // "3x a week" habits: streak = weeks in a row the target was met (this week counts once it's met)
          const weekStreak = perWeek < 7 ? (() => {
            const done = new Set(logs.filter(l => l.completed).map(l => l.date))
            const metWeek = (ws) => getWeekDays(ws).filter(d => done.has(d)).length >= perWeek
            let ws = startOfWeek(TODAY), n = 0
            if (!metWeek(ws)) ws = addDays(ws, -7)
            while (n < 520 && metWeek(ws)) { n++; ws = addDays(ws, -7) }
            return n
          })() : 0
          const { current: streak, longest: longestStreak } = (() => {
            // Build a sorted list of completed dates
            const completedDates = logs.filter(l => l.completed).map(l => l.date).sort()
            if (completedDates.length === 0) return { current: 0, longest: 0 }
            
            // Calculate current streak (from today backwards)
            let current = 0
            let day = TODAY   // local date (was UTC, a day ahead after 6 PM in the US)
            // Allow today OR yesterday as the start (gives forgiveness on first day)
            if (!completedDates.includes(day)) {
              day = addDays(day, -1)
              if (!completedDates.includes(day)) {
                return { current: 0, longest: calculateLongest(completedDates) }
              }
            }
            while (completedDates.includes(day)) {
              current++
              day = addDays(day, -1)
            }
            return { current, longest: Math.max(current, calculateLongest(completedDates)) }
            
            function calculateLongest(dates) {
              if (dates.length === 0) return 0
              let max = 1, cur = 1
              for (let i = 1; i < dates.length; i++) {
                const prev = new Date(dates[i-1])
                const curr = new Date(dates[i])
                const diff = (curr - prev) / 86400000
                if (diff === 1) { cur++; max = Math.max(max, cur) }
                else cur = 1
              }
              return max
            }
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
                  <span style={{color:CAT_COLOR[habit.category]||'var(--brass-fg)',fontWeight:600}}>{habit.category}</span>
                  <span style={weekComplete >= perWeek ? {color:'var(--success)',fontWeight:600} : undefined}>{`${Math.min(weekComplete, perWeek)}/${perWeek} this week`}{perWeek < 7 && weekComplete >= perWeek ? ' ✓' : ''}</span>
                  {perWeek < 7
                    ? weekStreak > 0 && <span style={{color:'var(--warning)',fontWeight:700}}>🔥 {weekStreak}wk streak</span>
                    : streak > 0 && <span style={{color:'var(--warning)',fontWeight:700}}>🔥 {streak}d streak</span>}
                  {perWeek >= 7 && longestStreak > streak && longestStreak > 2 && <span style={{color:'var(--muted)',fontSize:'.7rem'}}>· best {longestStreak}d</span>}
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
                    const future = date > TODAY
                    return (
                      <div key={date} role="button" aria-disabled={future} onClick={() => { if (!future) onToggleHabit(habit.id, date) }} style={{
                        flex:1,height:28,borderRadius:5,cursor: future ? 'default' : 'pointer', opacity: future ? .45 : 1,
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
      <div className="fold-list home-rows">
      <Fold id="habits-library" emoji="💡" title="50 Powerful Habits" sub="Tap any to add it">
      <section className="card">
        <p className="eyebrow">Habit Library</p>
        <h3 style={{margin:'4px 0 6px'}}>50 Powerful Habits</h3>
        <p className="muted" style={{fontSize:'.82rem',marginBottom:12}}>Tap any to add instantly. Already added habits are hidden.</p>
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
      </Fold>
      </div>
      <PageNav />
    </div>
  )
}

export { HabitsPage }
