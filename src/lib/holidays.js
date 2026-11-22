// Holidays on the calendar (2026-11-21). Nothing is stored or downloaded: each year's dates are worked out here.
// They are markers, not events: they can't be edited, dragged or deleted, and they don't count in the Life Score.
// The on/off choices are kept on this device (planner_holidays), not in the account.
import { useEffect, useState } from 'react'

const pad = (n) => String(n).padStart(2, '0')
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`
const shift = (dateString, days) => { const d = new Date(dateString + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10) }
// The nth given weekday of a month (weekday 0 = Sunday). n = -1 means the last one.
function nthWeekday(y, m, weekday, n) {
  if (n > 0) {
    const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay()
    return iso(y, m, 1 + ((weekday - first + 7) % 7) + (n - 1) * 7)
  }
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const last = new Date(Date.UTC(y, m - 1, lastDay)).getUTCDay()
  return iso(y, m, lastDay - ((last - weekday + 7) % 7))
}
// Easter Sunday in the Western (Gregorian) calendar: the Anonymous Gregorian algorithm.
function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1
  return iso(y, month, day)
}

const GROUPS = [
  { id: 'federal', label: 'US federal holidays' },
  { id: 'christian', label: 'Christian holidays' },
  { id: 'observances', label: 'Common observances' },
]

// Every holiday in a year: { date, name, emoji, groups }. Christmas Day belongs to two groups, so it shows with either on.
function holidaysInYear(y) {
  const e = easter(y)
  return [
    { date: iso(y, 1, 1), name: "New Year's Day", emoji: '🎉', groups: ['federal'] },
    { date: nthWeekday(y, 1, 1, 3), name: 'Martin Luther King Jr. Day', emoji: '🕊️', groups: ['federal'] },
    { date: iso(y, 2, 14), name: "Valentine's Day", emoji: '❤️', groups: ['observances'] },
    { date: nthWeekday(y, 2, 1, 3), name: "Presidents' Day", emoji: '🇺🇸', groups: ['federal'] },
    { date: shift(e, -46), name: 'Ash Wednesday', emoji: '✝️', groups: ['christian'] },
    { date: shift(e, -7), name: 'Palm Sunday', emoji: '🌿', groups: ['christian'] },
    { date: shift(e, -2), name: 'Good Friday', emoji: '✝️', groups: ['christian'] },
    { date: e, name: 'Easter', emoji: '🌅', groups: ['christian'] },
    { date: nthWeekday(y, 5, 0, 2), name: "Mother's Day", emoji: '💐', groups: ['observances'] },
    { date: shift(e, 49), name: 'Pentecost', emoji: '🔥', groups: ['christian'] },
    { date: nthWeekday(y, 5, 1, -1), name: 'Memorial Day', emoji: '🇺🇸', groups: ['federal'] },
    { date: iso(y, 6, 19), name: 'Juneteenth', emoji: '✊', groups: ['federal'] },
    { date: nthWeekday(y, 6, 0, 3), name: "Father's Day", emoji: '👔', groups: ['observances'] },
    { date: iso(y, 7, 4), name: 'Independence Day', emoji: '🎆', groups: ['federal'] },
    { date: nthWeekday(y, 9, 1, 1), name: 'Labor Day', emoji: '🛠️', groups: ['federal'] },
    { date: nthWeekday(y, 10, 1, 2), name: 'Columbus Day', emoji: '🧭', groups: ['federal'] },
    { date: iso(y, 10, 31), name: 'Halloween', emoji: '🎃', groups: ['observances'] },
    { date: iso(y, 11, 11), name: 'Veterans Day', emoji: '🎖️', groups: ['federal'] },
    { date: nthWeekday(y, 11, 4, 4), name: 'Thanksgiving', emoji: '🦃', groups: ['federal'] },
    { date: iso(y, 12, 24), name: 'Christmas Eve', emoji: '🕯️', groups: ['christian'] },
    { date: iso(y, 12, 25), name: 'Christmas Day', emoji: '🎄', groups: ['federal', 'christian'] },
    { date: iso(y, 12, 31), name: "New Year's Eve", emoji: '🥂', groups: ['observances'] },
  ].sort((a, b) => a.date.localeCompare(b.date))
}

const KEY = 'planner_holidays', EVENT = 'planner-holidays-changed'
const DEFAULTS = { on: true, federal: true, christian: true, observances: true }
function readPrefs() {
  try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) || '{}') || {}) } } catch { return { ...DEFAULTS } }
}
function writePrefs(next) {
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch {}
  try { window.dispatchEvent(new Event(EVENT)) } catch {}
}
function useHolidayPrefs() {
  const [prefs, setPrefs] = useState(readPrefs)
  useEffect(() => {
    const sync = () => setPrefs(readPrefs())
    window.addEventListener(EVENT, sync); window.addEventListener('storage', sync)
    return () => { window.removeEventListener(EVENT, sync); window.removeEventListener('storage', sync) }
  }, [])
  return [prefs, (patch) => writePrefs({ ...readPrefs(), ...patch })]
}

// { 'YYYY-MM-DD': [holiday, …] } for every day from `from` to `to`, honoring the choices in Settings.
function holidaysBetween(from, to, prefs = readPrefs()) {
  const out = {}
  if (!prefs.on || !from || !to) return out
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) {
    for (const h of holidaysInYear(y)) {
      if (h.date < from || h.date > to || !h.groups.some((g) => prefs[g])) continue
      ;(out[h.date] = out[h.date] || []).push(h)
    }
  }
  return out
}

export { GROUPS, holidaysInYear, holidaysBetween, useHolidayPrefs, easter, nthWeekday }
