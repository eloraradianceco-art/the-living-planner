// Life Score: the scoring rules for each life area, budgets and habits math, and the hook that feeds them.
import { useEffect, useState } from 'react'
import { hasSupabaseEnv, supabase } from './supabase.js'
import { dateOfStamp, TODAY, addDays, startOfWeek, endOfWeek } from './dates.js'
import { normalizeSteps } from './steps.js'
import { sleepSpan, fmtHours, SLEEP_MAX_HOURS } from './sleep.js'

// ── Scoring (rebuilt 2026-11-13) ──────────────────────────────────────────
// Each area is scored 1–10 from what you actually did in the last 7 days, using the data from its own
// section (not just task categories). A part only counts once you use it (e.g. water counts after you log
// water in the past 30 days), and an area with nothing to measure shows "—" instead of a fake 5 and is
// left out of the Life Score average.
const SCORE_DOMAINS = ['Faith', 'Health', 'Wellness', 'Lifestyle', 'Productivity', 'Finances']
const DOMAIN_META = {
  Faith: { emoji: '🙏', short: 'Faith' },
  Health: { emoji: '💪', short: 'Health' },
  Wellness: { emoji: '🌿', short: 'Wellness' },
  Lifestyle: { emoji: '🏡', short: 'Lifestyle' },
  Productivity: { emoji: '⚡', short: 'Work' },
  Finances: { emoji: '💰', short: 'Money' },
}
const SCORE_WINDOW_DAYS = 7
const SCORE_VERSION = 2
// The day a score is computed for: today, or a past day when the Growth chart rebuilds a missing day.
// Set only for the duration of one synchronous computeScoreDetails() call.
let SCORE_ASOF = TODAY
const scoreWindow = (end = SCORE_ASOF) => Array.from({ length: SCORE_WINDOW_DAYS }, (_, i) => addDays(end, i - (SCORE_WINDOW_DAYS - 1)))
const usedRecently = (dates) => { const from = addDays(SCORE_ASOF, -29); return dates.some((d) => d && d >= from && d <= SCORE_ASOF) }
const meanOf = (xs) => { const v = xs.filter((x) => Number.isFinite(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null }
const clamp01 = (x) => Math.max(0, Math.min(1, x))
const dateKeys = (obj) => Object.keys(obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {}).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k))
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`

// Days in the window since you started this practice (so starting something never lowers a score)
const activeDaysSince = (dates, days) => {
  const first = dates.filter((d) => d && d >= addDays(SCORE_ASOF, -29) && d <= SCORE_ASOF).sort()[0]
  return first ? Math.max(1, days.filter((d) => d >= first).length) : days.length
}
// Days in the window with at least one entry, against a weekly target scaled to the days you've been at it
// Sleep: quality /10, blended 50/50 with duration when bed/wake (or Recovery hours) exist. 7–9h = full marks.
const sleepDurationScore = (h) => h < 5 ? 0.2 : h < 6 ? 0.45 : h < 7 ? 0.7 : h <= 9 ? 1 : 0.85
function sleepPart(sleepWin, recovery, days) {
  const nights = days.map((d) => {
    const e = sleepWin.find((x) => x.date === d)
    const span = e ? sleepSpan(e.bed, e.wake) : null
    const rec = Number(recovery[d] && recovery[d].sleepHours)
    return { q: e ? Number(e.quality) : null, hours: span ? span.hours : rec > 0 && rec <= SLEEP_MAX_HOURS ? rec : null }
  }).filter((n) => Number.isFinite(n.q) || n.hours != null)
  if (!nights.length) return null
  const q = meanOf(nights.map((n) => n.q))
  const timed = nights.filter((n) => n.hours != null)
  const h = meanOf(timed.map((n) => n.hours))
  const value = meanOf([q != null ? q / 10 : null, timed.length ? meanOf(timed.map((n) => sleepDurationScore(n.hours))) : null])
  const detail = [q != null ? `quality ${q.toFixed(1)}/10` : '', h != null ? `avg ${fmtHours(Math.round(h * 2) / 2)}` : '', `${plural(nights.length, 'night')}`].filter(Boolean).join(' · ')
  return { label: 'Sleep', detail, value: clamp01(value) }
}
function daysPart(label, dates, days, perWeek, noun = 'day') {
  if (!usedRecently(dates)) return null
  const active = activeDaysSince(dates, days)
  const expected = perWeek >= 7 ? active : Math.max(1, Math.round((perWeek * active) / 7))
  const n = new Set(dates.filter((d) => days.includes(d))).size
  return { label, detail: `${plural(Math.min(n, expected), noun)} of ${expected}`, value: clamp01(n / expected) }
}
// "Do cardio 3x per week" expects 3 check-ins a week; everything else is daily
// Spending against the weekly target: one-time expenses dated in the week + the weekly share of
// repeating ones (weekly, every 2 weeks, monthly, yearly) that have started. Used by Home, Finance and the Life Score.
const expenseWeeklyShare = (e) => { const a = Number(e.amount) || 0; const p = e.period || 'one-time'; return p === 'weekly' ? a : p === 'biweekly' ? a / 2 : p === 'monthly' ? a / 4.33 : p === 'yearly' ? a / 52 : a }
function weekSpendOf(expenses, from = startOfWeek(TODAY), to = endOfWeek(TODAY)) {
  return (expenses || []).reduce((sum, e) => {
    const p = e.period || 'one-time'
    if (p === 'one-time') return e.date && e.date >= from && e.date <= to ? sum + (Number(e.amount) || 0) : sum
    return !e.date || e.date <= to ? sum + expenseWeeklyShare(e) : sum
  }, 0)
}
// Budget: a spending limit per day, week or month. weeklyTarget is the same limit per week (Life Score,
// Sunday reminder). Older saves only have weeklyTarget, so they read as a weekly budget.
const BUDGET_PERIODS = {
  daily:   { label: 'Daily',   per: '/day',   span: 'today',      perWeek: 7 },
  weekly:  { label: 'Weekly',  per: '/week',  span: 'this week',  perWeek: 1 },
  monthly: { label: 'Monthly', per: '/month', span: 'this month', perWeek: 1 / 4.33 },
}
function normBudget(b) {
  const period = BUDGET_PERIODS[b?.period] ? b.period : 'weekly'
  const perWeek = BUDGET_PERIODS[period].perWeek
  const raw = b?.amount
  const amount = raw !== null && raw !== undefined && raw !== '' && Number.isFinite(Number(raw)) ? Number(raw) : (Number(b?.weeklyTarget) || 0) / perWeek
  return { period, amount, weeklyTarget: Math.round(amount * perWeek * 100) / 100 }
}
// The same limit in another period, rounded to whole dollars (switching Weekly $200 → Monthly $866)
const convertBudget = (amount, from, to) => Math.round((Number(amount) || 0) * BUDGET_PERIODS[from].perWeek / BUDGET_PERIODS[to].perWeek)
function budgetRange(period, date = TODAY) {
  if (period === 'daily') return [date, date]
  if (period === 'monthly') {
    const [y, m] = date.split('-').map(Number)
    return [`${date.slice(0, 7)}-01`, `${date.slice(0, 7)}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`]
  }
  return [startOfWeek(date), endOfWeek(date)]
}
// Spending counted against the budget: one-time expenses dated in its day/week/month, plus each repeating
// expense's share of it ($20 weekly ≈ $2.86 a day, $86.60 a month), once that expense has started.
function budgetSpend(expenses, period = 'weekly', date = TODAY) {
  const [from, to] = budgetRange(period, date)
  const scale = period === 'daily' ? 1 / 7 : period === 'monthly' ? 4.33 : 1
  let oneTime = 0, repeating = 0
  for (const e of expenses || []) {
    const p = e.period || 'one-time'
    if (p === 'one-time') { if (e.date && e.date >= from && e.date <= to) oneTime += Number(e.amount) || 0 }
    else if (!e.date || e.date <= to) repeating += expenseWeeklyShare(e) * scale
  }
  return { from, to, oneTime, repeating, total: oneTime + repeating }
}
// Habits done this week vs their weekly target ("3x per week" → 3, otherwise daily)
const habitDoneThisWeek = (h, habitLogs) => { const ws = startOfWeek(TODAY), we = endOfWeek(TODAY); return new Set((habitLogs || []).filter((l) => l.habitId === h.id && l.completed && l.date >= ws && l.date <= we).map((l) => l.date)).size }
const habitWeekTarget = (h) => habitTimesPerWeek(h)
// Weekly target for a habit: the "How often" setting (1x–6x a week), else "3x per week" in its name, else daily.
const habitTimesPerWeek = (h) => {
  const f = String(h?.frequency || '').match(/^([1-6])x$/)
  if (f) return Number(f[1])
  const m = String(h?.title || h?.name || '').match(/(\d+)\s*(?:x|times?)\s*(?:per|a|each|\/)\s*week/i)
  return m ? Math.min(7, Math.max(1, Number(m[1]))) : 7
}
function habitsPart(category, habits, habitLogs, days) {
  const hs = habits.filter((h) => h.category === category)
  if (!hs.length) return null
  const ids = new Set(hs.map((h) => h.id))
  const logs = habitLogs.filter((l) => ids.has(l.habitId) && l.completed)
  if (!usedRecently(logs.map((l) => l.date))) return null   // counts once you start checking these habits off
  const activeDays = activeDaysSince(logs.map((l) => l.date), days)
  let expected = 0, done = 0
  for (const h of hs) {
    const perWeek = habitTimesPerWeek(h)
    const exp = perWeek >= 7 ? activeDays : Math.max(1, Math.round((perWeek * activeDays) / 7))
    const got = new Set(logs.filter((l) => l.habitId === h.id && days.includes(l.date)).map((l) => l.date)).size
    expected += exp
    done += Math.min(got, exp)
  }
  return { label: `${category} habits`, detail: `${done} of ${expected} check-ins`, value: clamp01(done / expected) }
}
function tasksPart(label, tasks, days, test) {
  const due = tasks.filter((t) => test(t) && t.date && t.date >= days[0] && t.date <= SCORE_ASOF)
  if (!due.length) return null
  const done = due.filter((t) => t.completed).length
  return { label, detail: `${done} of ${plural(due.length, 'task')} due`, value: done / due.length }
}

function computeScoreDetails(collections, src = {}, asOf = TODAY) {
  const prev = SCORE_ASOF
  SCORE_ASOF = asOf
  try { return scoreDetailsAsOf(collections, src) } finally { SCORE_ASOF = prev }
}
function scoreDetailsAsOf({ tasks = [], expenses = [], habits = [], habitLogs = [], budget = {}, goals = [], projects = [] }, src = {}) {
  const TODAY = SCORE_ASOF   // everything below measures the 7 days ending on this day
  const days = scoreWindow()
  const W = src.wellness || {}, F = src.faith || {}, P = src.productivity || {}, M = src.finance || {}
  const otherAreas = new Set(['Health', 'Lifestyle', 'Wellness', 'Finances', 'Faith'])
  const parts = {}

  // Faith: reflection, Bible reading, prayer & gratitude, Faith habits/tasks
  const reflectionDates = [...(Array.isArray(F.reflections) ? F.reflections.map((r) => r.date) : []), F.devotional && String(F.devotional.text || '').trim() ? F.devotional.date : null].filter(Boolean)
  const prayerDates = [...(Array.isArray(F.gratitude) ? F.gratitude.map((g) => g.date) : []), ...(Array.isArray(F.prayers) ? F.prayers.map((p) => p.date) : [])].filter(Boolean)
  parts.Faith = [
    daysPart('Daily reflection', reflectionDates, days, 7),
    daysPart('Bible reading', (F.bibleReading && F.bibleReading.completedDates) || [], days, 7),
    daysPart('Prayer & gratitude', prayerDates, days, 5),
    habitsPart('Faith', habits, habitLogs, days),
    tasksPart('Faith tasks', tasks, days, (t) => t.category === 'Faith'),
  ]

  // Health: training, sleep, water, recovery energy, meals, Health habits/tasks
  const workouts = Array.isArray(W.workouts) ? W.workouts : []
  const sleepLog = (Array.isArray(W.sleep) ? W.sleep : []).filter((e) => e && e.date && Number.isFinite(Number(e.quality)))
  const sleepWin = sleepLog.filter((e) => days.includes(e.date))
  const water = W.waterLog || {}
  const recovery = W.recovery || {}
  const recWin = dateKeys(recovery).filter((d) => days.includes(d) && Number.isFinite(Number(recovery[d] && recovery[d].energy)))
  const meals = W.meals || {}
  parts.Health = [
    daysPart('Workouts', workouts.map((w) => w.date), days, 4, 'workout'),
    sleepPart(sleepWin, recovery, days),
    (() => { const logged = days.filter((d) => Number(water[d]) > 0); if (!logged.length) return null; const avg = meanOf(logged.map((d) => Number(water[d]))); return { label: 'Water', detail: `avg ${avg.toFixed(1)} of 8 glasses on ${plural(logged.length, 'day')} logged`, value: clamp01(avg / 8) } })(),
    recWin.length ? (() => { const e = meanOf(recWin.map((d) => Number(recovery[d].energy))); return { label: 'Recovery energy', detail: `avg ${e.toFixed(1)}/5`, value: clamp01((e - 1) / 4) } })() : null,
    daysPart('Meals logged', dateKeys(meals).filter((d) => (meals[d] || []).length), days, 7),
    habitsPart('Health', habits, habitLogs, days),
    tasksPart('Health tasks', tasks, days, (t) => t.category === 'Health'),
  ]

  // Wellness: mood check-ins, calm (anxiety), journal, routine, Wellness habits/tasks
  const wlog = W.wellnessLog || {}
  const moodDays = dateKeys(wlog).filter((d) => Number.isFinite(Number(wlog[d] && wlog[d].mood)))
  const moodWin = moodDays.filter((d) => days.includes(d))
  const anxWin = (Array.isArray(W.anxiety) ? W.anxiety : []).filter((a) => a && days.includes(a.date) && Number.isFinite(Number(a.level)))
  const routine = Array.isArray(W.routine) ? W.routine : []
  const routineLog = W.routineLog || {}
  parts.Wellness = [
    usedRecently(moodDays) ? (() => {
      const avg = meanOf(moodWin.map((d) => Number(wlog[d].mood)))
      const active = activeDaysSince(moodDays, days)
      const consistency = clamp01(moodWin.length / active)
      return { label: 'Mood check-ins', detail: `${plural(moodWin.length, 'day')} of ${active}${avg != null ? ` · avg mood ${avg.toFixed(1)}/5` : ''}`, value: clamp01(avg != null ? 0.5 * consistency + 0.5 * ((avg - 1) / 4) : 0) }
    })() : null,
    anxWin.length ? (() => { const a = meanOf(anxWin.map((x) => Number(x.level))); return { label: 'Calm', detail: `avg anxiety ${a.toFixed(1)}/10`, value: clamp01((10 - a) / 9) } })() : null,
    daysPart('Journal', (Array.isArray(W.journalEntries) ? W.journalEntries : []).map((j) => j.date), days, 4),
    routine.length && usedRecently(dateKeys(routineLog).filter((d) => (routineLog[d] || []).length)) ? (() => {
      const v = meanOf(days.map((d) => clamp01((routineLog[d] || []).length / routine.length)))
      return { label: 'Daily routine', detail: `${Math.round(v * 100)}% of routine steps`, value: v }
    })() : null,
    habitsPart('Wellness', habits, habitLogs, days),
    tasksPart('Wellness tasks', tasks, days, (t) => t.category === 'Wellness'),
  ]

  // Lifestyle: home care (cleaning), Lifestyle habits/tasks
  const clean = P.cleaningLog || {}
  const choreDays = Object.keys(clean).filter((k) => clean[k] && k.startsWith('d:')).map((k) => k.slice(2, 12))
  const weekKey = 'w:' + startOfWeek(TODAY)
  const weeklyDone = Object.keys(clean).filter((k) => clean[k] && k.startsWith(weekKey + '_')).length
  const usedWeekly = Object.keys(clean).some((k) => k.startsWith('w:') && k.slice(2, 12) >= addDays(TODAY, -56) && k.slice(2, 12) <= TODAY)
  parts.Lifestyle = [
    daysPart('Daily chores', choreDays, days, 7),
    usedWeekly ? { label: 'Weekly chores', detail: `${weeklyDone} done this week`, value: clamp01(weeklyDone / 5) } : null,
    habitsPart('Lifestyle', habits, habitLogs, days),
    tasksPart('Lifestyle tasks', tasks, days, (t) => t.category === 'Lifestyle'),
  ]

  // Productivity: work tasks due this week, overdue load, goal/project steps, Productivity habits
  const workTask = (t) => !otherAreas.has(t.category)
  const overdue = tasks.filter((t) => workTask(t) && !t.completed && t.date && t.date < TODAY).length
  const stepDates = [...goals, ...projects].flatMap((x) => normalizeSteps(x.steps)).filter((st) => st.done && st.doneAt).map((st) => dateOfStamp(st.doneAt))
  // Overdue counts once you have work dated around this day (30 days back to a week ahead), so a past day
  // before you used the planner doesn't score "nothing overdue" from tasks that didn't exist yet
  const anyWork = tasks.some((t) => workTask(t) && t.date && t.date >= addDays(TODAY, -29) && t.date <= addDays(TODAY, 7))
  parts.Productivity = [
    tasksPart('Tasks done', tasks, days, workTask),
    anyWork ? { label: 'Overdue', detail: overdue ? `${plural(overdue, 'task')} past due` : 'nothing past due', value: clamp01(1 - overdue / 5) } : null,
    usedRecently(stepDates) ? { label: 'Goal & project steps', detail: `${stepDates.filter((d) => days.includes(d)).length} checked off`, value: clamp01(stepDates.filter((d) => days.includes(d)).length / 3) } : null,
    habitsPart('Productivity', habits, habitLogs, days),
  ]

  // Finances: spending vs weekly target (when you log spending), saving, Finance habits/tasks
  const spentWin = expenses.filter((e) => e.date && (days.includes(e.date) || ((e.period || 'one-time') !== 'one-time' && e.date <= days[days.length - 1])))
  const discretionary = weekSpendOf(expenses, days[0], days[days.length - 1])
  const target = Number(budget.weeklyTarget) || 0
  const savingHistory = [...(Array.isArray(M.savingsGoals) ? M.savingsGoals : []), ...(Array.isArray(M.sinkingFunds) ? M.sinkingFunds : [])].flatMap((g) => g.history || [])
  const depositDates = savingHistory.filter((h) => Number(h.amount) > 0).map((h) => h.date)
  parts.Finances = [
    spentWin.length && target > 0 ? { label: 'Spending', detail: `$${Math.round(discretionary)} of $${Math.round(target)} ${budget.period && budget.period !== 'weekly' ? 'budget this week' : 'weekly budget'}`, value: clamp01(discretionary <= target ? 1 : 2 - discretionary / target) } : null,
    usedRecently(depositDates) ? { label: 'Saving', detail: `${plural(depositDates.filter((d) => days.includes(d)).length, 'deposit')} this week`, value: depositDates.some((d) => days.includes(d)) ? 1 : 0 } : null,
    habitsPart('Finances', habits, habitLogs, days),
    tasksPart('Finance tasks', tasks, days, (t) => t.category === 'Finances'),
  ]

  const out = {}
  for (const d of SCORE_DOMAINS) {
    const list = parts[d].filter(Boolean)
    const avg = meanOf(list.map((x) => x.value))
    out[d] = { score: avg == null ? null : Math.max(1, Math.min(10, Math.round(1 + 9 * avg))), parts: list }
  }
  return out
}
// Plain { Domain: score|null } map used across the app
const computeScores = (collections, sources) => Object.fromEntries(Object.entries(computeScoreDetails(collections, sources)).map(([k, v]) => [k, v.score]))
const lifeScoreOf = (scores) => { const v = Object.values(scores || {}).filter((x) => Number.isFinite(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null }

// The section data the scores read. Each section's save calls emitPlannerData(...), so scores update the
// moment you log something; the account copy is re-read on open and whenever the app comes back.
const SCORE_SOURCE_KEYS = {
  wellness: ['workouts', 'sleep', 'waterLog', 'recovery', 'meals', 'wellnessLog', 'anxiety', 'journalEntries', 'routine', 'routineLog'],
  productivity: ['cleaningLog'],
  finance: ['savingsGoals', 'sinkingFunds'],
  faith: ['reflections', 'devotional', 'bibleReading', 'gratitude', 'prayers'],
}
const SOURCE_PREFIX = { wellness: 'planner.hw.', productivity: 'planner.p.', finance: 'planner.f.', faith: 'planner.faith.' }
function emitPlannerData(page, key, value) {
  try { window.dispatchEvent(new CustomEvent('planner-data', { detail: { page, key, value } })) } catch {}
}
function readSourceCache() {
  const out = {}
  for (const [page, keys] of Object.entries(SCORE_SOURCE_KEYS)) {
    out[page] = {}
    for (const k of keys) { try { const v = localStorage.getItem(SOURCE_PREFIX[page] + k); if (v != null) out[page][k] = JSON.parse(v) } catch {} }
  }
  return out
}
function useScoreSources(user) {
  const [sources, setSources] = useState(readSourceCache)
  useEffect(() => {
    const onData = (e) => {
      const { page, key, value } = e.detail || {}
      if (!SCORE_SOURCE_KEYS[page]?.includes(key)) return
      setSources((prev) => ({ ...prev, [page]: { ...prev[page], [key]: value } }))
    }
    window.addEventListener('planner-data', onData)
    return () => window.removeEventListener('planner-data', onData)
  }, [])
  useEffect(() => {
    if (!user || !hasSupabaseEnv) return
    let alive = true
    const load = () => {
      const pages = ['wellness', 'productivity', 'finance']
      const keys = pages.flatMap((p) => SCORE_SOURCE_KEYS[p])
      Promise.all([
        supabase.from('page_data').select('page, data_key, data_value').eq('user_id', user.id).in('page', pages).in('data_key', keys),
        supabase.from('faith_data').select('data_key, data_value').eq('user_id', user.id).in('data_key', SCORE_SOURCE_KEYS.faith),
      ]).then(([pd, fd]) => {
        if (!alive) return
        setSources((prev) => {
          const next = { ...prev }
          for (const row of pd.data || []) if (SCORE_SOURCE_KEYS[row.page]?.includes(row.data_key)) next[row.page] = { ...next[row.page], [row.data_key]: row.data_value }
          for (const row of fd.data || []) next.faith = { ...next.faith, [row.data_key]: row.data_value }
          return next
        })
      })
    }
    load()
    const onVis = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVis)
    return () => { alive = false; document.removeEventListener('visibilitychange', onVis) }
  }, [user?.id])
  return sources
}

export {
  SCORE_DOMAINS, DOMAIN_META, SCORE_VERSION, sleepDurationScore, expenseWeeklyShare, weekSpendOf,
  BUDGET_PERIODS, normBudget, convertBudget, budgetSpend, habitDoneThisWeek, habitWeekTarget,
  habitTimesPerWeek, computeScoreDetails, lifeScoreOf, emitPlannerData, useScoreSources,
}
