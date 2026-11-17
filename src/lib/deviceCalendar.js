// Apple Calendar inside the planner (App Store app only, 2026-11-17).
// The calendars on this iPhone/iPad are read live each time they're shown and are never copied into the planner
// database, so there is nothing to get out of step. What this device shows (on/off, hidden calendars, where new
// events are saved) is kept on this device only, and is cleared when the account signs out.
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { NativeCalendar, deviceCalendarSupported } from '../native.js'

const KEY = 'planner_device_cal' // { on, hidden: [calendar ids], saveTo: calendar id | '' }
const readPrefs = () => { try { const p = JSON.parse(localStorage.getItem(KEY) || '{}'); return { on: !!p.on, hidden: Array.isArray(p.hidden) ? p.hidden : [], saveTo: p.saveTo || '' } } catch { return { on: false, hidden: [], saveTo: '' } } }
const writePrefs = (p) => { try { localStorage.setItem(KEY, JSON.stringify(p)) } catch {} }

// ── One shared state for every screen that shows the device calendar ──
// status: 'unsupported' (website) | 'unknown' (not checked yet) | 'prompt' | 'denied' | 'granted'
let state = { supported: deviceCalendarSupported, status: deviceCalendarSupported ? 'unknown' : 'unsupported', ...readPrefs(), calendars: [], version: 0 }
const listeners = new Set()
const set = (patch) => { state = { ...state, ...patch }; listeners.forEach((l) => l()) }
const savePrefs = (patch) => { set(patch); writePrefs({ on: state.on, hidden: state.hidden, saveTo: state.saveTo }) }
const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l) }
const snapshot = () => state
// Events may have changed (a save here, or anything done in Apple Calendar while the app was in the background)
const bump = () => set({ version: state.version + 1 })

async function loadCalendars() {
  try { set({ calendars: await NativeCalendar.calendars() }) } catch { set({ calendars: [] }) }
}
let started = false
function start() {
  if (started || !state.supported) return
  started = true
  ;(async () => {
    // Signing out clears this device's choice, so re-read it for whoever is signed in now
    set(readPrefs())
    const status = await NativeCalendar.status()
    set({ status })
    if (status === 'granted' && state.on) await loadCalendars()
  })()
  const onVisible = () => { if (document.visibilityState === 'visible' && active()) { loadCalendars(); bump() } }
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('focus', onVisible)
}
const active = () => state.supported && state.on && state.status === 'granted'

const deviceCal = {
  // Asks iOS for access (the system prompt appears once), then turns the calendar on in the planner
  async connect() {
    if (!state.supported) return 'unsupported'
    const status = await NativeCalendar.request()
    set({ status })
    if (status === 'granted') { savePrefs({ on: true }); await loadCalendars(); bump() }
    return status
  },
  // Stops showing it here. iOS permission itself is changed in the Settings app.
  disconnect() { savePrefs({ on: false, saveTo: '' }); set({ calendars: [] }); bump() },
  toggleCalendar(id) {
    const hidden = state.hidden.includes(id) ? state.hidden.filter((x) => x !== id) : [...state.hidden, id]
    savePrefs({ hidden, ...(hidden.includes(state.saveTo) ? { saveTo: '' } : {}) })
  },
  setSaveTo(id) { savePrefs({ saveTo: id || '' }) },
  refresh() { if (active()) { loadCalendars(); bump() } },
  // Sign-out (or a different account on this device): each account chooses for itself
  forget() { set({ on: false, hidden: [], saveTo: '', calendars: [] }); bump() },

  // A new event from the planner's own form, saved into one of the person's calendars
  async create(form, calendarId) {
    const start = localMs(form.date, form.startTime || '00:00')
    const allDay = !form.startTime
    const end = allDay ? start + 3600000 : (form.endTime && localMs(form.date, form.endTime) > start ? localMs(form.date, form.endTime) : start + 3600000)
    const rule = REPEAT_RULES[form.recurrence || 'none']
    const id = await NativeCalendar.create({
      title: String(form.title || '').trim() || 'New event', startDate: start, endDate: end, isAllDay: allDay, calendarId,
      ...(String(form.location || '').trim() ? { location: String(form.location).trim() } : {}),
      ...(rule ? { recurrence: { ...rule, ...(form.recurrenceUntil ? { end: localMs(form.recurrenceUntil, '23:59') } : {}) } } : {}),
    })
    savePrefs({ saveTo: calendarId })
    bump()
    return id
  },
  // Drag to another day or time. Repeating, multi-day and read-only events can't be moved from here.
  canChange: (item) => !!item && item.itemType === 'device' && item.writable && !item.isRepeat && !item.multiDay,
  async move(item, { date, time }) {
    if (!deviceCal.canChange(item)) return false
    const length = Math.max(0, item.endMs - item.startMs)
    const start = item.allDay ? localMs(date, '00:00') : localMs(date, time || item.startTime)
    await NativeCalendar.move(item.eventId, start, start + length)
    bump()
    return true
  },
  async remove(item) {
    if (!deviceCal.canChange(item)) return false
    await NativeCalendar.remove(item.eventId)
    bump()
    return true
  },
  // Apple's own edit sheet opens over the planner (alerts, invitees, travel time: everything Apple offers)
  async editWithApple(item) {
    const result = await NativeCalendar.editWithApple(item.eventId)
    bump()
    return result
  },
  openInCalendar: (item) => NativeCalendar.openInCalendar(item.startMs),
}

const REPEAT_RULES = {
  daily: { frequency: 'daily', interval: 1 }, weekly: { frequency: 'weekly', interval: 1 },
  biweekly: { frequency: 'weekly', interval: 2 }, monthly: { frequency: 'monthly', interval: 1 },
}

// ── Dates (the device's own clock, like the rest of the planner) ──
const pad = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
const localMs = (date, time) => { const [y, m, d] = date.split('-').map(Number); const [hh, mm] = String(time || '00:00').split(':').map(Number); return new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0).getTime() }
const nextDay = (date) => { const [y, m, d] = date.split('-').map(Number); return ymd(new Date(y, m - 1, d + 1, 12)) }
const HEX = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i

// Apple's events → the planner's calendar items, one per day the event touches, kept inside [from, to].
// Timed events that cross midnight are split (9 PM – 1 AM shows as 9 PM – midnight, then midnight – 1 AM).
function toItems(events, calendars, hidden, from, to) {
  const byId = new Map(calendars.map((c) => [c.id, c]))
  const out = []
  for (const ev of events || []) {
    if (!ev || !ev.id || hidden.includes(ev.calendarId)) continue
    const cal = byId.get(ev.calendarId)
    const startMs = Number(ev.startDate), endMs = Math.max(Number(ev.endDate) || startMs, startMs)
    if (!Number.isFinite(startMs)) continue
    const start = new Date(startMs)
    const last = new Date(endMs > startMs ? endMs - 1 : endMs) // an end at exactly midnight belongs to the day before
    const firstDay = ymd(start), lastDay = ymd(last)
    const base = {
      itemType: 'device', eventId: ev.id, title: String(ev.title || '').trim() || '(No title)',
      location: ev.location || '', notes: ev.description || '',
      color: HEX.test(ev.color || '') ? ev.color : HEX.test(cal?.color || '') ? cal.color : '#6B7A8F',
      calendarId: ev.calendarId || '', calendarName: cal?.title || 'Calendar', account: cal?.account || '',
      writable: cal ? cal.writable : false, isRepeat: !!ev.isPartOfSeries, allDay: !!ev.isAllDay,
      multiDay: firstDay !== lastDay, startMs, endMs,
    }
    for (let day = firstDay, n = 0; day <= lastDay && n < 400; day = nextDay(day), n++) {
      if (day < from || day > to) continue
      let startTime = '', endTime = ''
      if (!base.allDay) {
        const isFirst = day === firstDay, isLast = day === lastDay
        if (isFirst || isLast) {
          startTime = isFirst ? hm(start) : '00:00'
          endTime = isLast ? (hm(new Date(endMs)) === '00:00' && endMs > startMs ? '23:59' : hm(new Date(endMs))) : '23:59'
        } // whole days in the middle of a long event sit in the All-day row
      }
      out.push({ ...base, id: `${ev.id}|${day}`, date: day, startTime, endTime })
    }
  }
  return out
}

// ── Hooks ──
// Connection state for settings, banners and the "Save to" picker
function useDeviceCalendar() {
  const s = useSyncExternalStore(subscribe, snapshot)
  useEffect(() => { start() }, [])
  return s
}
// The device's events between two dates (YYYY-MM-DD, inclusive), as calendar items. Empty on the website,
// when it isn't connected, or while loading.
function useDeviceEvents(from, to) {
  const s = useDeviceCalendar()
  const on = s.supported && s.on && s.status === 'granted'
  const [raw, setRaw] = useState({ key: '', events: [] })
  const key = on ? `${from}|${to}` : ''
  useEffect(() => {
    if (!on) { setRaw({ key: '', events: [] }); return }
    let alive = true
    NativeCalendar.events(localMs(from, '00:00'), localMs(nextDay(to), '00:00'))
      .then((events) => { if (alive) setRaw({ key, events }) })
      .catch(() => { if (alive) setRaw({ key, events: [] }) })
    return () => { alive = false }
  }, [key, s.version])
  const hiddenKey = s.hidden.join(',')
  // While a new range loads, what's already known keeps showing (clipped to the new dates) so the grid doesn't blink
  return useMemo(() => (on ? toItems(raw.events, s.calendars, s.hidden, from, to) : []), [on, raw, from, to, s.calendars, hiddenKey])
}

export { deviceCal, useDeviceCalendar, useDeviceEvents, toItems }
