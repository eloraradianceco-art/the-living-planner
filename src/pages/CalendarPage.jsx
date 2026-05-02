import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { usePlannerData } from '../context/PlannerContext.jsx'
import { getTodayString, getWeekDays, getMonthDays, formatDateLabel, isToday, startOfWeek } from '../utils/dates.js'

function DropSlot({ date, time, onQuickCreate, onDropItem, items, onEdit, onDelete, prefersTouch }) {
  const [dragOver, setDragOver] = useState(false)

  const handleDrop = (event) => {
    event.preventDefault()
    setDragOver(false)
    try {
      const payload = JSON.parse(event.dataTransfer.getData('application/json'))
      onDropItem(payload, date, time)
    } catch {
      // ignore invalid payloads
    }
  }

  return (
    <div
      className={dragOver ? 'timeline-slot drop-active' : 'timeline-slot'}
      onDragOver={(event) => { event.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {items.length === 0 ? (
        <button className="slot-add-btn" onClick={() => onQuickCreate('task', { date, time })}>{prefersTouch ? 'Tap to add here' : 'Open • Add task'}</button>
      ) : items.map((item) => (
        <div key={`${item.itemType}-${item.id}`} className="time-card premium-time-card" draggable onDragStart={(event) => event.dataTransfer.setData('application/json', JSON.stringify({ type: item.itemType, id: item.id }))}>
          <button className="time-card-main" onClick={() => onEdit(item.itemType, item)}>
            <strong>{item.title}</strong>
            <span>{item.itemType === 'task' ? 'Task' : 'Event'} • {item.startTime}{item.endTime ? ` - ${item.endTime}` : ''}</span>
          </button>
          <button className="ghost-btn" onClick={() => onDelete(item.itemType, item.id)}>Delete</button>
        </div>
      ))}
    </div>
  )
}

function CalendarPage({ tasks, events, settings, onEdit, onDelete, onQuickCreate, onReschedule }) {
  const [view, setView] = useState('day')
  const [selectedDate, setSelectedDate] = useState(TODAY)
  const { prefersTouch, isMobile } = useResponsive()

  const scheduled = useMemo(() => {
    const taskItems = tasks.filter((task) => task.time).map((task) => ({ ...task, startTime: task.time, itemType: 'task' }))
    const eventItems = events.map((event) => ({ ...event, itemType: 'event' }))
    return [...taskItems, ...eventItems].sort((a, b) => `${a.date}-${a.startTime}`.localeCompare(`${b.date}-${b.startTime}`))
  }, [tasks, events])

  const hours = Array.from({ length: 16 }, (_, i) => `${String(i + 5).padStart(2, '0')}:00`)
  const weekDays = getWeekDays(selectedDate)
  const monthDays = getMonthDays(selectedDate)
  const dayScheduled = scheduled.filter((item) => item.date === selectedDate)
  const upcomingScheduled = scheduled.filter((item) => item.date >= TODAY).slice(0, 6)
  const selectedMonthLabel = formatDateLabel(selectedDate, { month: 'long', year: 'numeric' })

  const handleDropItem = async (payload, date, time) => {
    if (!payload?.id || !payload?.type) return
    await onReschedule(payload.type, payload.id, { date, ...(time ? { time, startTime: time } : {}) })
  }

  const navLabel = view === 'month' ? selectedMonthLabel
    : view === 'week' ? `Week of ${formatDateLabel(weekDays[0], { month: 'short', day: 'numeric' })}`
    : formatDateLabel(selectedDate, { weekday: 'short', month: 'short', day: 'numeric' })

  const step = view === 'month' ? 30 : view === 'week' ? 7 : 1

  // Build 6-week grid for month view
  const buildMonthGrid = () => {
    if (monthDays.length === 0) return []
    const firstDay = new Date(monthDays[0] + 'T12:00:00').getDay()
    const weeks = []
    let week = Array(firstDay).fill(null)
    for (const day of monthDays) {
      week.push(day)
      if (week.length === 7) { weeks.push(week); week = [] }
    }
    if (week.length > 0) {
      while (week.length < 7) week.push(null)
      weeks.push(week)
    }
    return weeks
  }
  const monthGrid = buildMonthGrid()

  return (
    <div className="screen-stack">
      {/* ── Compact header ───────────────────────────────────────── */}
      <section className="card" style={{padding:'10px 14px'}}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8}}>
          <div style={{fontWeight:700, fontSize:'.95rem', color:'var(--text)'}}>{navLabel}</div>
          <button className="primary-btn" style={{fontSize:'.78rem', padding:'6px 12px'}} onClick={() => onQuickCreate('event', { date: selectedDate })}>+ Event</button>
        </div>
        <div style={{display:'flex', gap:6, marginBottom:8}}>
          <button className="cal-nav-btn" onClick={() => setSelectedDate(addDays(selectedDate, -step))}>‹</button>
          <button className="cal-nav-btn" onClick={() => setSelectedDate(TODAY)}>Today</button>
          <button className="cal-nav-btn" onClick={() => setSelectedDate(addDays(selectedDate, step))}>›</button>
        </div>
        <div style={{display:'flex', gap:6}}>
          {['day','week','month'].map((v) => (
            <button key={v} onClick={() => setView(v)} style={{
              flex:1, padding:'6px 4px', borderRadius:'999px', border:'1.5px solid', fontSize:'.78rem',
              fontWeight:600, cursor:'pointer', fontFamily:'inherit', textTransform:'capitalize',
              borderColor: view===v ? 'var(--teal)' : 'var(--border2)',
              background: view===v ? 'var(--teal)' : 'var(--surface)',
              color: view===v ? 'var(--navy)' : 'var(--text2)'}}>
              {v}
            </button>
          ))}
        </div>
      </section>

      {/* ── Day view ─────────────────────────────────────────────── */}
      {view === 'day' && (
        <section className="card">
          <div className="section-title-row">
            <h3 style={{fontSize:'1rem'}}>Daily Schedule</h3>
            <span className="status-pill" style={{fontSize:'.72rem'}}>{prefersTouch ? 'Tap a slot' : 'Drag to reschedule'}</span>
          </div>
          {isMobile && upcomingScheduled.length > 0 && (
            <div className="mobile-agenda-strip">
              {upcomingScheduled.map((item) => (
                <button key={`${item.itemType}-${item.id}`} className="agenda-chip" onClick={() => onEdit(item.itemType, item)}>
                  <strong style={{fontSize:'.75rem', color:'var(--teal)'}}>{item.startTime}</strong>
                  <span style={{fontSize:'.8rem', color:'var(--text)', fontWeight:600}}>{item.title}</span>
                </button>
              ))}
            </div>
          )}
          <div className={settings.compactCalendar ? 'timeline compact-calendar' : 'timeline'}>
            {hours.map((hour) => {
              const items = dayScheduled.filter((item) => item.startTime?.slice(0, 2) === hour.slice(0, 2))
              return (
                <div className="timeline-row" key={hour}>
                  <div className="timeline-hour">{hour}</div>
                  <div className="timeline-slot"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => { try { handleDropItem(JSON.parse(e.dataTransfer.getData('application/json')), selectedDate, hour) } catch {} }}>
                    {items.length === 0
                      ? <button className="slot-add-btn" onClick={() => onQuickCreate('task', { date: selectedDate, time: hour })}>{prefersTouch ? 'Tap to add' : 'Add here'}</button>
                      : items.map((item) => (
                        <div key={`${item.itemType}-${item.id}`} className="time-card premium-time-card" draggable
                          onDragStart={(e) => e.dataTransfer.setData('application/json', JSON.stringify({ type: item.itemType, id: item.id }))}>
                          <button className="time-card-main" onClick={() => onEdit(item.itemType, item)}>
                            <strong style={{fontSize:'.88rem'}}>{item.title}</strong>
                            <span style={{fontSize:'.75rem', color:'var(--muted)'}}>{item.startTime}{item.endTime ? ` – ${item.endTime}` : ''}</span>
                          </button>
                          <button className="ghost-btn" style={{fontSize:'.75rem', padding:'4px 8px'}} onClick={() => onDelete(item.itemType, item.id)}>✕</button>
                        </div>
                      ))}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ── Week view ─────────────────────────────────────────────── */}
      {view === 'week' && (
        <section className="card">
          <div className="section-title-row"><h3 style={{fontSize:'1rem'}}>Weekly View</h3></div>
          <div className="week-grid">
            {weekDays.map((date) => {
              const items = scheduled.filter((item) => item.date === date)
              return (
                <div key={date} className="week-card droppable-day"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { try { handleDropItem(JSON.parse(e.dataTransfer.getData('application/json')), date) } catch {} }}>
                  <button className="day-chip" onClick={() => { setSelectedDate(date); setView('day') }}>
                    {formatDateLabel(date, { weekday: 'short', month: 'short', day: 'numeric' })}
                  </button>
                  {items.length === 0 ? <p className="muted" style={{fontSize:'.75rem'}}>Open</p> : items.map((item) => (
                    <button key={`${item.itemType}-${item.id}`} className="week-item" onClick={() => onEdit(item.itemType, item)}
                      draggable onDragStart={(e) => e.dataTransfer.setData('application/json', JSON.stringify({ type: item.itemType, id: item.id }))}>
                      <span style={{fontSize:'.7rem', color:'var(--teal)'}}>{item.startTime}</span>
                      <strong style={{fontSize:'.8rem'}}>{item.title}</strong>
                    </button>
                  ))}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ── Month view — proper calendar table ────────────────────── */}
      {view === 'month' && (
        <section className="card" style={{padding:'12px 10px'}}>
          <div style={{fontWeight:700, fontSize:'1rem', color:'var(--text)', marginBottom:10, textAlign:'center'}}>{selectedMonthLabel}</div>
          <table className="month-table">
            <thead>
              <tr>{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => <th key={d}>{d}</th>)}</tr>
            </thead>
            <tbody>
              {monthGrid.map((week, wi) => (
                <tr key={wi}>
                  {week.map((date, di) => {
                    if (!date) return <td key={di} />
                    const count = scheduled.filter(item => item.date === date).length
                    const isToday_ = date === TODAY
                    const isSelected = date === selectedDate
                    return (
                      <td key={di}>
                        <div
                          className={`month-day-cell${isToday_ ? ' today' : ''}${isSelected ? ' selected' : ''}`}
                          onClick={() => { setSelectedDate(date); setView('day') }}>
                          <div className="month-day-num">{new Date(date + 'T12:00:00').getDate()}</div>
                          {count > 0 && <div className="month-day-dot">{count} ·</div>}
                         </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}



export default CalendarPage
