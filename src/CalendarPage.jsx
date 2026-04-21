import { useMemo, useState } from 'react'
import { TODAY, addDays, formatDateLabel, getMonthDays, getWeekDays } from '../utils/date'
import { useResponsive } from '../hooks/useResponsive'

const hours = Array.from({ length: 16 }, (_, index) => `${String(index + 5).padStart(2, '0')}:00`)

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

export default function CalendarPage({ tasks, events, settings, onEdit, onDelete, onQuickCreate, onReschedule }) {
  const [view, setView] = useState('day')
  const [selectedDate, setSelectedDate] = useState(TODAY)
  const { prefersTouch, isMobile } = useResponsive()

  const scheduled = useMemo(() => {
    const taskItems = tasks.filter((task) => task.time).map((task) => ({ ...task, startTime: task.time, itemType: 'task' }))
    const eventItems = events.map((event) => ({ ...event, itemType: 'event' }))
    return [...taskItems, ...eventItems].sort((a, b) => `${a.date}-${a.startTime}`.localeCompare(`${b.date}-${b.startTime}`))
  }, [tasks, events])

  const weekDays = getWeekDays(selectedDate)
  const monthDays = getMonthDays(selectedDate)
  const dayScheduled = scheduled.filter((item) => item.date === selectedDate)
  const upcomingScheduled = scheduled.filter((item) => item.date >= TODAY).slice(0, 8)
  const selectedMonthLabel = formatDateLabel(selectedDate, { month: 'long', year: 'numeric' })

  const handleDropItem = async (payload, date, time) => {
    if (!payload?.id || !payload?.type) return
    await onReschedule(payload.type, payload.id, { date, ...(time ? { time, startTime: time } : {}) })
  }

  return (
    <section className="screen-stack">
      <section className="card premium-card calendar-header-card">
        <div className="section-title-row wrap-row">
          <div>
            <p className="eyebrow">Time Control</p>
            <h3>Calendar</h3>
            <p className="muted">{view === 'month' ? selectedMonthLabel : formatDateLabel(selectedDate, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
          </div>
          <div className="button-row wrap-row">
            <button className="ghost-btn" onClick={() => setSelectedDate(addDays(selectedDate, view === 'month' ? -30 : view === 'week' ? -7 : -1))}>Back</button>
            <button className="ghost-btn" onClick={() => setSelectedDate(TODAY)}>Today</button>
            <button className="ghost-btn" onClick={() => setSelectedDate(addDays(selectedDate, view === 'month' ? 30 : view === 'week' ? 7 : 1))}>Next</button>
            <button className={view === 'day' ? 'pill active-pill' : 'pill'} onClick={() => setView('day')}>Day</button>
            <button className={view === 'week' ? 'pill active-pill' : 'pill'} onClick={() => setView('week')}>Week</button>
            <button className={view === 'month' ? 'pill active-pill' : 'pill'} onClick={() => setView('month')}>Month</button>
            <button className="primary-btn premium-btn" onClick={() => onQuickCreate('event', { date: selectedDate })}>Add Event</button>
          </div>
        </div>
      </section>

      {view === 'day' && (
        <section className="card premium-card">
          <div className="section-title-row"><h3>Daily Time Slots</h3><span className="status-pill">{prefersTouch ? 'Tap a slot or edit a task to place it' : 'Drag tasks here to schedule them'}</span></div>
          {isMobile ? (
            <div className="mobile-agenda-strip">
              {upcomingScheduled.slice(0,4).map((item) => (
                <button key={`${item.itemType}-${item.id}`} className="agenda-chip" onClick={() => onEdit(item.itemType, item)}>
                  <strong>{item.startTime}</strong>
                  <span>{item.title}</span>
                </button>
              ))}
            </div>
          ) : null}
          <div className={settings.compactCalendar ? 'timeline compact-calendar premium-timeline' : 'timeline premium-timeline'}>
            {hours.map((hour) => {
              const items = dayScheduled.filter((item) => item.startTime?.slice(0, 2) === hour.slice(0, 2))
              return (
                <div className="timeline-row" key={hour}>
                  <div className="timeline-hour">{hour}</div>
                  <DropSlot date={selectedDate} time={hour} onQuickCreate={onQuickCreate} onDropItem={handleDropItem} items={items} onEdit={onEdit} onDelete={onDelete} prefersTouch={prefersTouch} />
                </div>
              )
            })}
          </div>
        </section>
      )}

      {view === 'week' && (
        <section className="card premium-card">
          <div className="section-title-row"><h3>Weekly View</h3><span className="status-pill">Drop tasks on a day to move them</span></div>
          <div className="week-grid premium-week-grid">
            {weekDays.map((date) => {
              const items = scheduled.filter((item) => item.date === date)
              return (
                <div
                  key={date}
                  className="week-card premium-week-card droppable-day"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    try {
                      const payload = JSON.parse(event.dataTransfer.getData('application/json'))
                      handleDropItem(payload, date)
                    } catch {
                      // ignore
                    }
                  }}
                >
                  <button className="day-chip" onClick={() => { setSelectedDate(date); setView('day') }}>{formatDateLabel(date)}</button>
                  {items.length === 0 ? <p className="muted">Open</p> : items.map((item) => (
                    <button key={`${item.itemType}-${item.id}`} className="week-item" onClick={() => onEdit(item.itemType, item)} draggable onDragStart={(event) => event.dataTransfer.setData('application/json', JSON.stringify({ type: item.itemType, id: item.id }))}>
                      <span>{item.startTime}</span>
                      <strong>{item.title}</strong>
                    </button>
                  ))}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {view === 'month' && (
        <section className="card premium-card">
          <div className="section-title-row"><h3>Monthly Snapshot</h3><span className="status-pill">Tap a day to drill in</span></div>
          <div className="month-grid premium-month-grid">
            {monthDays.map((date) => {
              const count = scheduled.filter((item) => item.date === date).length
              return (
                <button key={date} className={date === selectedDate ? 'month-cell active-cell premium-month-cell' : 'month-cell premium-month-cell'} onClick={() => { setSelectedDate(date); setView('day') }}>
                  <strong>{formatDateLabel(date, { month: 'short', day: 'numeric' })}</strong>
                  <span>{count} scheduled</span>
                  <div className="mini-progress"><div style={{ width: `${Math.min(count * 25, 100)}%` }} /></div>
                </button>
              )
            })}
          </div>
        </section>
      )}
    </section>
  )
}
