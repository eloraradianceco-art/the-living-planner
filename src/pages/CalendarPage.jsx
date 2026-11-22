// Calendar: day, week and month views.
import React, { useMemo, useState } from 'react'
import { Check } from 'lucide-react'
import {
  TODAY, addDays, getWeekDays, repeatLabel, expandEvents, getMonthDays, formatDateLabel, fmt12,
  fmtRange, toMin, hourLabel, shortTime,
} from '../lib/dates.js'
import { cleanPlace, PlaceLink, PlaceText } from '../components/Place.jsx'
import { useResponsive } from '../lib/responsive.js'
import { PageNav } from '../components/PageNav.jsx'
import { deviceCal, useDeviceCalendar, useDeviceEvents } from '../lib/deviceCalendar.js'
import { holidaysBetween, useHolidayPrefs } from '../lib/holidays.js'
import { DeviceEventSheet } from '../components/DeviceEventSheet.jsx'

// What each calendar item is called, and (for Apple Calendar events) its calendar's colour
const kindOf = (item) => (item.itemType === 'task' ? 'Task' : item.itemType === 'device' ? item.calendarName : 'Event')
const tint = (item) => (item.itemType === 'device' ? { '--cal-color': item.color } : undefined)
const canDrag = (item) => (item.itemType === 'device' ? deviceCal.canChange(item) : !item.isRepeat)
const TIP_KEY = 'planner_device_cal_tip'

function CalendarPage({ tasks, events, settings, onEdit, onDelete, onQuickCreate, onReschedule, onToggle, onSkipOccurrence, onToast = () => {} }) {
  const [view, setView] = useState('day')
  const [selectedDate, setSelectedDate] = useState(TODAY)
  const { prefersTouch, isMobile } = useResponsive()

  // The dates on screen: the month grid shows whole weeks, so it reaches into the months either side
  const [from, to] = useMemo(() => {
    const md = getMonthDays(selectedDate), wd = getWeekDays(selectedDate)
    const gridFrom = addDays(md[0], -new Date(md[0] + 'T12:00:00').getDay())
    const gridTo = addDays(md[md.length - 1], 6 - new Date(md[md.length - 1] + 'T12:00:00').getDay())
    return [[gridFrom, wd[0], selectedDate].sort()[0], [gridTo, wd[6], selectedDate].sort()[2]]
  }, [selectedDate])
  // Apple Calendar events on this device (App Store app, once connected); read live, never stored by the planner
  const deviceCalendar = useDeviceCalendar()
  const deviceItems = useDeviceEvents(from, to)
  const [deviceItem, setDeviceItem] = useState(null)
  // Holidays: worked out for the dates on screen, shown as markers (never items you can move or delete)
  const [holidayPrefs] = useHolidayPrefs()
  const holidays = useMemo(() => holidaysBetween(from, to, holidayPrefs), [from, to, holidayPrefs])
  const holidayLine = (date) => (holidays[date] || []).map((h) => (
    <div key={h.name} className="cal-holiday"><span aria-hidden="true">{h.emoji}</span> {h.name}</div>
  ))
  const [tipHidden, setTipHidden] = useState(() => { try { return localStorage.getItem(TIP_KEY) === '1' } catch { return false } })
  const showTip = deviceCalendar.supported && !deviceCalendar.on && deviceCalendar.status !== 'denied' && deviceCalendar.status !== 'unknown' && !tipHidden
  const hideTip = () => { setTipHidden(true); try { localStorage.setItem(TIP_KEY, '1') } catch {} }

  const scheduled = useMemo(() => {
    // Every dated task shows: timed ones on the grid, untimed ones in the All-day row
    const taskItems = tasks.filter((task) => task.date).map((task) => ({ ...task, startTime: task.time || '', itemType: 'task' }))
    const eventItems = expandEvents(events, from, to).map((event) => ({ ...event, itemType: 'event' }))
    return [...taskItems, ...eventItems, ...deviceItems].sort((a, b) => `${a.date}-${a.startTime || ''}`.localeCompare(`${b.date}-${b.startTime || ''}`))
  }, [tasks, events, deviceItems, from, to])
  // Editing a repeat opens the series (with its real start date), never the single occurrence
  const openItem = (item) => item.itemType === 'device' ? setDeviceItem(item)
    : item.itemType === 'event' && item.isRepeat
    ? onEdit('event', events.find((e) => e.id === item.id) || item)
    : onEdit(item.itemType, item)
  const [pendingDelete, setPendingDelete] = useState(null)

  const weekDays = getWeekDays(selectedDate)
  const monthDays = getMonthDays(selectedDate)
  const dayScheduled = scheduled.filter((item) => item.date === selectedDate)
  const dayAllDay = dayScheduled.filter((item) => toMin(item.startTime) == null)
  // Each item as a block: start → end (no end, or an end before the start = one half-hour)
  const dayBlocks = useMemo(() => {
    const list = dayScheduled.map((item) => {
      const s = toMin(item.startTime)
      if (s == null) return null
      const e = toMin(item.endTime)
      const end = e != null && e > s ? e : s + 30
      return { item, s, end, shown: Math.max(end, s + 30) } // shown: at least one half-hour tall
    }).filter(Boolean).sort((a, b) => a.s - b.s || b.shown - a.shown)
    // Items that overlap sit side by side
    const out = []; let group = [], groupEnd = -1
    const flush = () => {
      const cols = []
      group.forEach((b) => { let c = cols.findIndex((colEnd) => colEnd <= b.s); if (c < 0) { c = cols.length; cols.push(0) } cols[c] = b.shown; b.col = c })
      group.forEach((b) => { b.cols = cols.length; out.push(b) })
      group = []
    }
    for (const b of list) { if (group.length && b.s >= groupEnd) flush(); group.push(b); groupEnd = Math.max(groupEnd, b.shown) }
    if (group.length) flush()
    return out
  }, [dayScheduled])
  // 5 AM – 8 PM always, stretched to cover anything scheduled earlier or later
  const hours = useMemo(() => {
    const set = new Set(Array.from({ length: 16 }, (_, i) => i + 5))
    dayBlocks.forEach((b) => { for (let h = Math.floor(b.s / 60); h <= Math.min(23, Math.floor((b.shown - 1) / 60)); h++) set.add(h) })
    return [...set].sort((a, b) => a - b)
  }, [dayBlocks])
  // Fill any gaps so the grid is continuous (every half-hour row is the same height)
  const gridHours = useMemo(() => Array.from({ length: hours[hours.length - 1] - hours[0] + 1 }, (_, i) => `${String(hours[0] + i).padStart(2, '0')}:00`), [hours])
  const ROW_H = settings.compactCalendar ? 36 : 46
  const gridStart = toMin(gridHours[0])
  // Each hour is split into :00 and :30 rows so you can tap straight onto 6:30
  const slots = gridHours.flatMap((h) => [h, h.slice(0, 2) + ':30'])
  // Half-hours a block already covers don't get a + underneath it
  const coveredSlots = useMemo(() => new Set(slots.filter((sl) => { const m = toMin(sl); return dayBlocks.some((b) => b.s < m + 30 && m < b.shown) })), [slots.join(), dayBlocks])
  const slotOf = (t) => { const [hh, mm] = String(t || '').split(':'); return `${hh}:${Number(mm) >= 30 ? '30' : '00'}` }
  const nowSlot = selectedDate === TODAY ? slotOf(`${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`) : null
  const confirmDelete = (item) => {
    if (item.itemType === 'event' && item.isRepeat) { setPendingDelete(`${item.id}:${item.date}`); return }
    if (window.confirm(`Delete "${item.title}"?`)) onDelete(item.itemType, item.id)
  }
  const selectedMonthLabel = formatDateLabel(selectedDate, { month: 'long', year: 'numeric' })

  const handleDropItem = async (payload, date, time) => {
    if (!payload?.id || !payload?.type || payload.repeat) return
    if (payload.type === 'device') { // an Apple Calendar event: the change is saved to that calendar
      const item = scheduled.find((x) => x.itemType === 'device' && x.id === payload.id)
      try { if (item && await deviceCal.move(item, { date, time })) onToast('Event moved', `Saved to ${item.calendarName}.`, 'success') }
      catch { onToast('Could not move it', 'Open Apple Calendar to change this event.', 'error') }
      return
    }
    await onReschedule(payload.type, payload.id, { date, ...(time ? { time, startTime: time } : {}) })
  }

  const navLabel = view === 'month' ? selectedMonthLabel
    : view === 'week' ? `Week of ${formatDateLabel(weekDays[0], { month: 'short', day: 'numeric' })}`
    : formatDateLabel(selectedDate, { weekday: 'short', month: 'short', day: 'numeric' })

  const step = view === 'week' ? 7 : 1
  // Month arrows move a calendar month (was 30 days, which skipped February from Jan 31)
  const shiftMonth = (d, n) => {
    const [y, m, day] = d.split('-').map(Number)
    const t = new Date(Date.UTC(y, m - 1 + n, 1))
    const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate()
    return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`
  }
  const go = (dir) => setSelectedDate(view === 'month' ? shiftMonth(selectedDate, dir) : addDays(selectedDate, dir * step))

  // Month grid: whole weeks, with the days of the months either side filled in (faded)
  const monthKey = selectedDate.slice(0, 7)
  const monthCells = useMemo(() => {
    if (monthDays.length === 0) return []
    const first = monthDays[0], last = monthDays[monthDays.length - 1]
    const lead = new Date(first + 'T12:00:00').getDay(), trail = 6 - new Date(last + 'T12:00:00').getDay()
    return [...Array.from({ length: lead }, (_, i) => addDays(first, i - lead)), ...monthDays, ...Array.from({ length: trail }, (_, i) => addDays(last, i + 1))]
  }, [monthKey])
  const itemsByDate = useMemo(() => {
    const m = {}
    for (const item of scheduled) (m[item.date] ||= []).push(item)
    return m
  }, [scheduled])
  // Tapping a day lists it under the grid; if that list is off the bottom of the screen (or under the tab bar), bring it up
  const agendaRef = React.useRef(null)
  const pickMonthDay = (date) => {
    if (date === selectedDate) { setView('day'); return }
    setSelectedDate(date)
    requestAnimationFrame(() => {
      const el = agendaRef.current
      if (el && el.getBoundingClientRect().top > window.innerHeight - 190) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }) // 190: tab bar + the first row
    })
  }

  return (
    <div className="screen-stack">
      {/* ── Compact header ───────────────────────────────────────── */}
      <section className="card" style={{padding:'10px 14px'}}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8}}>
          <div style={{fontWeight:700, fontSize:'.95rem', color:'var(--text)'}}>{navLabel}</div>
          <button className="primary-btn" style={{fontSize:'.78rem', padding:'6px 12px'}} onClick={() => onQuickCreate('event', { date: selectedDate })}>+ Event</button>
        </div>
        <div style={{display:'flex', gap:6, marginBottom:8}}>
          <button className="cal-nav-btn" onClick={() => go(-1)} aria-label="Previous">‹</button>
          <button className="cal-nav-btn" onClick={() => setSelectedDate(TODAY)}>Today</button>
          <button className="cal-nav-btn" onClick={() => go(1)} aria-label="Next">›</button>
        </div>
        <div style={{display:'flex', gap:6}}>
          {['day','week','month'].map((v) => (
            <button key={v} onClick={() => setView(v)} style={{
              flex:1, padding:'6px 4px', borderRadius:'999px', border:'1.5px solid', fontSize:'.78rem',
              fontWeight:600, cursor:'pointer', fontFamily:'inherit', textTransform:'capitalize',
              borderColor: view===v ? 'var(--ink)' : 'var(--border2)',
              background: view===v ? 'var(--ink)' : 'var(--surface)',
              color: view===v ? 'var(--warm-white)' : 'var(--text2)'}}>
              {v}
            </button>
          ))}
        </div>
      </section>

      {/* App Store app, before Apple Calendar is connected: a one-line offer (dismissible) */}
      {showTip && (
        <section className="card devcal-tip">
          <div><strong>See your Apple Calendar here</strong><span>Your appointments next to your tasks. Nothing leaves this device.</span></div>
          <button type="button" className="primary-btn" onClick={() => deviceCal.connect()}>Connect</button>
          <button type="button" className="devcal-close" onClick={hideTip} aria-label="Not now">✕</button>
        </section>
      )}

      {/* ── Day view ─────────────────────────────────────────────── */}
      {view === 'day' && (
        <section className="card">
          <div className="section-title-row">
            <h3 style={{fontSize:'1rem', whiteSpace:'nowrap'}}>Daily Schedule</h3>
            <span className="status-pill" style={{fontSize:'.72rem'}}>
              {dayScheduled.length ? `${dayScheduled.length} scheduled` : 'Open day'}
            </span>
          </div>
          {holidayLine(selectedDate)}
          {dayAllDay.length > 0 && (
            <div className="cal-allday">
              <div className="cal-allday-label">All day</div>
              {dayAllDay.map((item) => {
                const done = item.itemType === 'task' && item.completed
                return (
                  <div key={`${item.itemType}-${item.id}`} className={'cal-allday-item ' + item.itemType + (done ? ' done' : '')} style={tint(item)}
                    draggable={canDrag(item)} onDragStart={(e) => e.dataTransfer.setData('application/json', JSON.stringify({ type: item.itemType, id: item.id, repeat: !!item.isRepeat }))}>
                    {item.itemType === 'task' && onToggle && (
                      <button type="button" className={'step-check' + (done ? ' done' : '')} onClick={() => onToggle(item.id)}
                        aria-label={done ? `Mark ${item.title} not done` : `Mark ${item.title} done`} aria-pressed={done}>
                        {done && <Check size={13} strokeWidth={3} color="var(--warm-white)" />}
                      </button>
                    )}
                    <button type="button" className="cal-allday-title" onClick={() => openItem(item)}>
                      <span className="cal-allday-name">{item.title}</span>
                      <PlaceText place={item.location} className="cal-allday-place" />
                    </button>
                    <span className="cal-allday-kind">{kindOf(item)}</span>
                  </div>
                )
              })}
            </div>
          )}
          <div className={'timeline timeline-grid' + (settings.compactCalendar ? ' compact-calendar' : '')} style={{ '--row-h': ROW_H + 'px' }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              try {
                const payload = JSON.parse(e.dataTransfer.getData('application/json'))
                const top = e.currentTarget.getBoundingClientRect().top
                const slot = slots[Math.max(0, Math.min(slots.length - 1, Math.floor((e.clientY - top) / ROW_H)))]
                handleDropItem(payload, selectedDate, slot)
              } catch {}
            }}>
            {slots.map((hour) => {
              const isHalf = hour.endsWith(':30')
              const isNow = nowSlot === hour
              return (
                <div className={'timeline-row' + (isHalf ? ' half' : '') + (isNow ? ' now' : '')} key={hour}>
                  <div className="timeline-hour">{isHalf ? fmt12(hour).replace(/ (AM|PM)$/, '') : hourLabel(hour)}</div>
                  <div className="timeline-slot">
                    {!coveredSlots.has(hour) && <button className="slot-add-btn" onClick={() => onQuickCreate('task', { date: selectedDate, time: hour })}><span aria-hidden="true">+</span><span className="sr-only">Add at {fmt12(hour)}</span></button>}
                  </div>
                </div>
              )
            })}
            {/* Blocks: each item runs from its start to its end */}
            <div className="timeline-blocks">
              {selectedDate === TODAY && (() => {
                const n = new Date(), m = n.getHours() * 60 + n.getMinutes()
                const y = (m - gridStart) / 30 * ROW_H
                return y >= 0 && y <= slots.length * ROW_H ? <div className="timeline-now-line" style={{ top: y }} aria-hidden="true" /> : null
              })()}
              {dayBlocks.map(({ item, s: startMin, shown, col, cols }) => {
                const done = item.itemType === 'task' && item.completed
                const top = (startMin - gridStart) / 30 * ROW_H + 2
                const height = (shown - startMin) / 30 * ROW_H - 4
                const place = { top, left: `calc(${col} * (100% / ${cols}))`, width: `calc(100% / ${cols} - 4px)` }
                const short = height < 56
                return pendingDelete === `${item.id}:${item.date}` ? (
                  <div key={`${item.itemType}-${item.id}`} className="time-card event repeat-delete time-block" style={{ ...place, minHeight: height, zIndex: 3 }}>
                    <span className="time-card-title" style={{ flex: '1 1 100%' }}>Remove "{item.title}"</span>
                    <button className="repeat-del-btn" onClick={() => { setPendingDelete(null); onSkipOccurrence && onSkipOccurrence(item.id, item.date) }}>Just this day</button>
                    <button className="repeat-del-btn danger" onClick={() => { setPendingDelete(null); onDelete('event', item.id) }}>Whole series</button>
                    <button className="time-card-del" onClick={() => setPendingDelete(null)} aria-label="Cancel">✕</button>
                  </div>
                ) : (
                  <div key={`${item.itemType}-${item.id}`} className={`time-card premium-time-card time-block ${item.itemType}${done ? ' done' : ''}${short ? ' short' : ''}${cols > 1 ? ' narrow' : ''}`}
                    style={{ ...place, height, ...tint(item) }} draggable={canDrag(item)}
                    onClick={(e) => { if (e.target === e.currentTarget) openItem(item) }}
                    onDragStart={(e) => e.dataTransfer.setData('application/json', JSON.stringify({ type: item.itemType, id: item.id, repeat: !!item.isRepeat }))}>
                    {item.itemType === 'task' && onToggle && (
                      <button type="button" className={'step-check' + (done ? ' done' : '')} onClick={() => onToggle(item.id)}
                        aria-label={done ? `Mark ${item.title} not done` : `Mark ${item.title} done`} aria-pressed={done}>
                        {done && <Check size={13} strokeWidth={3} color="var(--warm-white)" />}
                      </button>
                    )}
                    <button className="time-card-main" onClick={() => openItem(item)}>
                      <span className="time-card-title">{item.title}</span>
                      <span className="time-card-meta">{fmtRange(item.startTime, item.endTime)}{short && cleanPlace(item.location) ? <> · <PlaceText place={item.location} /></> : ''} · {kindOf(item)}{item.isRepeat ? (item.itemType === 'device' ? ' · ↻' : ` · ↻ ${repeatLabel(item.recurrence)}`) : ''}</span>
                      {!short && <PlaceText place={item.location} className="time-card-place" />}
                    </button>
                    {item.itemType !== 'device' && <button className="time-card-del" onClick={() => confirmDelete(item)} aria-label={`Delete ${item.title}`}>✕</button>}
                  </div>
                )
              })}
            </div>
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
                  {holidayLine(date)}
                  {items.length === 0 ? <p className="muted" style={{fontSize:'.75rem'}}>Open</p> : items.map((item) => (
                    <button key={`${item.itemType}-${item.id}`} className={'week-item ' + item.itemType} style={tint(item)} onClick={() => openItem(item)}
                      draggable={canDrag(item)} onDragStart={(e) => e.dataTransfer.setData('application/json', JSON.stringify({ type: item.itemType, id: item.id, repeat: !!item.isRepeat }))}>
                      <span style={{fontSize:'.7rem', color:'var(--brass-fg)', fontWeight:600}}>{item.startTime ? fmtRange(item.startTime, item.endTime) : 'All day'}</span>
                      <strong style={{fontSize:'.8rem', color:'var(--ink)', textDecoration: item.itemType === 'task' && item.completed ? 'line-through' : 'none', opacity: item.itemType === 'task' && item.completed ? .6 : 1}}>{item.title}</strong>
                      <PlaceText place={item.location} className="week-item-place" />
                    </button>
                  ))}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ── Month view (2026-11-16) ───────────────────────────────────
           Taller days. Phones: coloured dots. iPad and wider: the titles themselves.
           Tap a day to list it underneath (time, title, location); tap it again for the day view. */}
      {view === 'month' && (<>
        <section className="card month-card">
          <div className="month-dows" aria-hidden="true">
            {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d) => <div key={d} className="month-dow">{d}</div>)}
          </div>
          <div className="month-grid">
            {monthCells.map((date, i) => {
              const items = itemsByDate[date] || []
              const inMonth = date.slice(0, 7) === monthKey
              const isSel = date === selectedDate
              const shown = items.length > 3 ? items.slice(0, 2) : items
              const hol = holidays[date] || []
              const label = formatDateLabel(date, { weekday: 'long', month: 'long', day: 'numeric' })
                + (hol.length ? `, ${hol.map((h) => h.name).join(' and ')}` : '')
                + (items.length ? `, ${items.length} ${items.length === 1 ? 'item' : 'items'}` : '')
                + (isSel ? '. Tap again to open the day' : '')
              return (
                <button key={date} type="button" onClick={() => pickMonthDay(date)} aria-label={label} aria-pressed={isSel}
                  aria-current={date === TODAY ? 'date' : undefined}
                  className={'month-cell' + (inMonth ? '' : ' other-month') + (date === TODAY ? ' today' : '') + (isSel ? ' selected' : '') + (i % 7 === 0 || i % 7 === 6 ? ' weekend' : '')}>
                  <span className="month-cell-num" aria-hidden="true">{Number(date.slice(8))}</span>
                  {hol.length > 0 && <span className="month-holiday" aria-hidden="true"><span className="month-holiday-emoji">{hol[0].emoji}</span><span className="month-holiday-name">{hol[0].name}</span></span>}
                  {items.length > 0 && (<>
                    <span className="month-dots" aria-hidden="true">
                      {items.slice(0, 3).map((item) => <span key={`${item.itemType}-${item.id}`} className={`month-dot ${item.itemType}${item.itemType === 'task' && item.completed ? ' done' : ''}`} style={tint(item)} />)}
                      {items.length > 3 && <span className="month-dots-more">+</span>}
                    </span>
                    <span className="month-chips" aria-hidden="true">
                      {shown.map((item) => (
                        <span key={`${item.itemType}-${item.id}`} className={`month-chip ${item.itemType}${item.itemType === 'task' && item.completed ? ' done' : ''}`} style={tint(item)}>
                          {item.startTime && <span className="month-chip-time">{shortTime(item.startTime)}</span>}
                          <span className="month-chip-title">{item.title}</span>
                        </span>
                      ))}
                      {items.length > 3 && <span className="month-more">+{items.length - 2} more</span>}
                    </span>
                  </>)}
                </button>
              )
            })}
          </div>
        </section>

        <section className="card month-agenda" ref={agendaRef} aria-live="polite">
          <div className="month-agenda-head">
            <div>
              <p className="eyebrow">{selectedDate === TODAY ? 'Today' : formatDateLabel(selectedDate, { weekday: 'long' })}</p>
              <h3>{formatDateLabel(selectedDate, { month: 'long', day: 'numeric' })}</h3>
            </div>
            <button type="button" className="ghost-btn" onClick={() => setView('day')}>Open day →</button>
          </div>
          {holidayLine(selectedDate)}
          {dayScheduled.length === 0 ? (
            <div className="month-agenda-empty">
              <span className="muted">Nothing planned.</span>
              <button type="button" className="ghost-btn" onClick={() => onQuickCreate('event', { date: selectedDate })}>+ Add</button>
            </div>
          ) : (
            <div className="month-agenda-list">
              {dayScheduled.map((item) => {
                const done = item.itemType === 'task' && item.completed
                return (
                  <div key={`${item.itemType}-${item.id}`} className={`agenda-row ${item.itemType}${done ? ' done' : ''}`} style={tint(item)}>
                    {item.itemType === 'task' && onToggle ? (
                      <button type="button" className={'step-check' + (done ? ' done' : '')} onClick={() => onToggle(item.id)}
                        aria-label={done ? `Mark ${item.title} not done` : `Mark ${item.title} done`} aria-pressed={done}>
                        {done && <Check size={13} strokeWidth={3} color="var(--warm-white)" />}
                      </button>
                    ) : <span className="agenda-row-mark" aria-hidden="true" />}
                    <div className="agenda-row-body">
                      <button type="button" className="agenda-row-main" onClick={() => openItem(item)}>
                        <span className="agenda-row-time">{item.startTime ? fmtRange(item.startTime, item.endTime) : 'All day'}{item.isRepeat ? ' · ↻' : ''}</span>
                        <span className="agenda-row-title">{item.title}</span>
                      </button>
                      <PlaceLink place={item.location} />
                    </div>
                    <span className="agenda-row-kind">{kindOf(item)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </>)}
      <DeviceEventSheet item={deviceItem} onClose={() => setDeviceItem(null)} onToast={onToast} />
      <PageNav />
    </div>
  )
}

export { CalendarPage }
