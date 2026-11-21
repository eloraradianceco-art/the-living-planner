// Dates and times: today in the device time zone, weeks and months, repeating events, time formatting.

// ── Date utils ────────────────────────────────────────────────────────────
// Days roll over at midnight where this device is (was fixed to Chicago, so the date was wrong outside Central time)
const DEVICE_TIME_ZONE = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || '' } catch { return '' } })()
const APP_TIME_ZONE = DEVICE_TIME_ZONE || 'America/Chicago'
// Calendar date (YYYY-MM-DD, app time zone) of a stored timestamp. "2026-11-14T02:00Z" is still Nov 13 in Chicago;
// slicing the ISO string would push evening check-offs into tomorrow. Plain dates pass through.
function dateOfStamp(stamp) {
  const v = String(stamp || '')
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v
  const d = new Date(v)
  if (isNaN(d)) return v.slice(0, 10)
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d)
  const get = (t) => p.find((x) => x.type === t)?.value
  return `${get('year')}-${get('month')}-${get('day')}`
}

function getTodayString() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())

  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${map.year}-${map.month}-${map.day}`
}


const TODAY = getTodayString()

function addDays(dateString, days) {
  const date = new Date(`${dateString}T12:00:00`)
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

function startOfWeek(dateString = TODAY) {
  const date = new Date(`${dateString}T12:00:00`)
  const day = date.getDay()
  date.setDate(date.getDate() - day)
  return date.toISOString().slice(0, 10)
}

function endOfWeek(dateString = TODAY) {
  return addDays(startOfWeek(dateString), 6)
}

function getWeekDays(dateString = TODAY) {
  const start = startOfWeek(dateString)
  return Array.from({ length: 7 }, (_, index) => addDays(start, index))
}

// ── Repeating events ─────────────────────────────────────────────────────
// One stored row per series; occurrences are generated for whatever range is shown.
const EVENT_REPEATS = [['none', 'Does not repeat'], ['daily', 'Every day'], ['weekly', 'Every week'], ['biweekly', 'Every 2 weeks'], ['monthly', 'Every month']]
const repeatLabel = (r) => ({ daily: 'Daily', weekly: 'Weekly', biweekly: 'Every 2 weeks', monthly: 'Monthly' })[r] || ''
function addMonthsKeepDay(dateString, n, day) {
  const [y, m] = dateString.split('-').map(Number)
  const target = new Date(Date.UTC(y, m - 1 + n, 1))
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  if (day > last) return null // e.g. the 31st in a 30-day month: skip that month
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
// The target date that goes with a goal's time limit, counted from today: '6mo' → the same day six months on
// (the 31st lands on the last day of a shorter month). Unknown limits leave the date alone.
const GOAL_FRAME_MONTHS = { '1mo': 1, '6mo': 6, '1yr': 12, '3yr': 36, '5yr': 60 }
function goalTargetDate(timeframe, from = TODAY) {
  if (timeframe === '1wk') return addDays(from, 7)
  const n = GOAL_FRAME_MONTHS[timeframe]
  if (!n) return null
  const [y, m, d] = from.split('-').map(Number)
  const first = new Date(Date.UTC(y, m - 1 + n, 1))
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
  return `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`
}

function expandEvents(events, from, to) {
  const out = []
  for (const ev of events || []) {
    if (!ev?.date) continue
    const r = ev.recurrence || 'none'
    if (r === 'none') { if (ev.date >= from && ev.date <= to) out.push(ev); continue }
    const skip = new Set(ev.skipDates || [])
    const end = ev.recurrenceUntil && ev.recurrenceUntil < to ? ev.recurrenceUntil : to
    if (ev.date > end) continue
    const push = (d) => { if (d >= from && d <= end && !skip.has(d)) out.push({ ...ev, date: d, seriesStart: ev.date, isRepeat: true }) }
    if (r === 'monthly') {
      const day = Number(ev.date.slice(8, 10))
      for (let k = 0; k < 600; k++) {
        const d = k === 0 ? ev.date : addMonthsKeepDay(ev.date, k, day)
        if (!d) continue
        if (d > end) break
        push(d)
      }
    } else {
      const step = { daily: 1, weekly: 7, biweekly: 14 }[r]
      if (!step) { if (ev.date >= from && ev.date <= to) out.push(ev); continue }
      const gap = Math.round((Date.parse(from + 'T12:00:00Z') - Date.parse(ev.date + 'T12:00:00Z')) / 86400000)
      for (let k = Math.max(0, Math.floor(gap / step)); k < 100000; k++) {
        const d = addDays(ev.date, k * step)
        if (d > end) break
        push(d)
      }
    }
  }
  return out
}

function getMonthDays(dateString = TODAY) {
  const date = new Date(`${dateString}T12:00:00`)
  const first = new Date(date.getFullYear(), date.getMonth(), 1, 12)
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0, 12)
  const days = []
  for (let current = new Date(first); current <= last; current.setDate(current.getDate() + 1)) {
    days.push(current.toISOString().slice(0, 10))
  }
  return days
}

function formatDateLabel(dateString, options = { weekday: 'short', month: 'short', day: 'numeric' }) {
  return new Date(`${dateString}T12:00:00`).toLocaleDateString('en-US', options)
}

function isToday(date) {
  return date === TODAY
}

function isOverdue(date) {
  return Boolean(date) && date < TODAY
}

function isThisWeek(date) {
  if (!date) return false
  return date >= startOfWeek(TODAY) && date <= endOfWeek(TODAY)
}

function sortByTime(a, b) {
  return (a.time || a.startTime || '99:99').localeCompare(b.time || b.startTime || '99:99')
}

const shortDate = (d) => d ? formatDateLabel(d, { month: 'short', day: 'numeric' }) : ''

// "05:00" → "5:00 AM". Leaves anything it can't read untouched.
function fmt12(t) {
  if (!t) return ''
  const m = String(t).match(/^(\d{1,2}):(\d{2})/)
  if (!m) return String(t)
  const h = Number(m[1])
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`
}
// "05:00","06:00" → "5:00 – 6:00 AM"; drops the first AM/PM when both match.
function fmtRange(start, end) {
  if (!end) return fmt12(start)
  const a = fmt12(start), b = fmt12(end)
  return a.slice(-2) === b.slice(-2) ? `${a.slice(0, -3)} – ${b}` : `${a} – ${b}`
}
// "09:30" ⇄ minutes since midnight
const toMin = (t) => { const m = String(t || '').match(/^(\d{1,2}):(\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : null }
const fromMin = (n) => { const c = Math.max(0, Math.min(23 * 60 + 59, n)); return `${String(Math.floor(c / 60)).padStart(2, '0')}:${String(c % 60).padStart(2, '0')}` }
// When a start time moves, move the end with it so the item keeps its length ('' stays '').
function shiftEnd(oldStart, newStart, end) {
  const a = toMin(oldStart), b = toMin(newStart), e = toMin(end)
  if (e == null) return end || ''
  if (a == null || b == null) return end
  return fromMin(e + (b - a))
}
const endBeforeStart = (start, end) => toMin(start) != null && toMin(end) != null && toMin(end) <= toMin(start)
const hourLabel = (hh) => { const h = Number(String(hh).slice(0, 2)); return `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}` }
// "09:00" → "9a", "13:30" → "1:30p" (month-view chips)
const shortTime = (t) => { const m = toMin(t); if (m == null) return ''; const h = Math.floor(m / 60), mi = m % 60; return `${h % 12 || 12}${mi ? ':' + String(mi).padStart(2, '0') : ''}${h < 12 ? 'a' : 'p'}` }

export {
  goalTargetDate,
  DEVICE_TIME_ZONE, dateOfStamp, getTodayString, TODAY, addDays, startOfWeek, endOfWeek,
  getWeekDays, EVENT_REPEATS, repeatLabel, expandEvents, getMonthDays, formatDateLabel, isToday,
  isOverdue, isThisWeek, shortDate, fmt12, fmtRange, toMin, shiftEnd, endBeforeStart, hourLabel,
  shortTime,
}
