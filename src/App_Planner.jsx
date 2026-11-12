import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import Reviews from "./Reviews"
import { createClient } from '@supabase/supabase-js'
import { Routes, Route, Link, BrowserRouter, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Banknote, CreditCard, PiggyBank, TrendingDown, HeartHandshake, ClipboardList, CircleSlash,
  Smile, Moon, PenLine, Sunrise, BookOpen, Pill, Activity, Wind, CloudLightning, Shield,
  SquareCheck, Brain, StickyNote, ListChecks, Timer, Sparkles, Lightbulb,
  ShoppingCart, ChefHat, Plane, Cake, Gift, Dumbbell,
  HandHeart, ScrollText, BookMarked, Flower2, Hourglass, Mic, Target, Lock,
  Wallet, Leaf, Repeat, TrendingUp, Cross, Zap, Compass, Plus, CalendarDays,
  CircleCheck, Folder, Receipt, ListTodo,
  ChevronUp, ChevronDown, CalendarPlus, Trash2, Check, Flag,
  House, Ellipsis, LayoutGrid, X, BatteryCharging, Gauge, Utensils, Stethoscope, Search, Download,
} from 'lucide-react'

// ── Supabase ──────────────────────────────────────────────────────────────
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const hasSupabaseEnv = Boolean(supabaseUrl && supabaseAnonKey)
const supabase = hasSupabaseEnv
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    })
  : null

// ── Date utils ────────────────────────────────────────────────────────────
const APP_TIME_ZONE = 'America/Chicago'

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

// ── Push Notification System ───────────────
// Reminders are sent by the Supabase function `push-reminders` every 5 minutes,
// so they arrive even when the planner is closed. This client only asks for
// permission and registers the device.
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}
const bufToB64Url = (buf) => {
  if (!buf) return ''
  const bytes = new Uint8Array(buf); let str = ''
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i])
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const isIOS = () => typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent || '') || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

const PlannerPush = {
  async isSupported() {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  },

  async requestPermission() {
    if (!(await this.isSupported())) return 'unsupported'
    return Notification.requestPermission()
  },

  async registerSW() {
    if (!('serviceWorker' in navigator)) return null
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
      await navigator.serviceWorker.ready
      return reg
    } catch (e) { console.warn('SW registration failed:', e); return null }
  },

  async publicKey() {
    try { const c = localStorage.getItem('planner.vapidPub'); if (c) return c } catch {}
    if (!hasSupabaseEnv) return null
    let key = null
    const { data } = await supabase.from('app_config').select('value').eq('key', 'vapid_public_key').maybeSingle()
    key = data?.value || null
    if (!key) {
      const { data: init } = await supabase.functions.invoke('push-reminders', { body: { action: 'init' } })
      key = init?.publicKey || null
    }
    if (key) { try { localStorage.setItem('planner.vapidPub', key) } catch {} }
    return key
  },

  // Subscribe this device (or refresh it) and save it to the user's account.
  async subscribe() {
    if (!hasSupabaseEnv) return null
    const reg = await this.registerSW()
    if (!reg) return null
    const key = await this.publicKey()
    if (!key) return null
    try {
      let sub = await reg.pushManager.getSubscription()
      const current = sub?.options?.applicationServerKey ? bufToB64Url(sub.options.applicationServerKey) : null
      if (sub && current && current !== key) { await sub.unsubscribe(); sub = null } // made with an old key
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) })
      const j = sub.toJSON()
      const { error } = await supabase.rpc('register_push_subscription', {
        p_endpoint: j.endpoint, p_p256dh: j.keys?.p256dh, p_auth: j.keys?.auth, p_user_agent: navigator.userAgent.slice(0, 200),
      })
      if (error) throw error
      try { localStorage.removeItem('planner.pushSub') } catch {}
      return sub
    } catch (e) { console.warn('Push subscribe failed:', e); return null }
  },

  async unsubscribe() {
    const reg = await navigator.serviceWorker.getRegistration('/sw.js')
    const sub = reg && await reg.pushManager.getSubscription()
    if (sub) {
      if (hasSupabaseEnv) await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
      await sub.unsubscribe()
    }
  },

  async deviceConnected() {
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js')
      return Boolean(reg && await reg.pushManager.getSubscription())
    } catch { return false }
  },

  async sendTest() {
    const { data, error } = await supabase.functions.invoke('push-reminders', { body: { action: 'test' } })
    if (error) throw error
    return data
  },
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


// ── Scoring ───────────────────────────────────────────────────────────────
function computeScores({ tasks, expenses, habits, habitLogs, budget }) {
  const taskByCategory = {}
  for (const task of tasks) {
    if (!taskByCategory[task.category]) taskByCategory[task.category] = { total: 0, completed: 0 }
    taskByCategory[task.category].total += 1
    if (task.completed) taskByCategory[task.category].completed += 1
  }

  const habitMap = Object.fromEntries(habits.map((h) => [h.id, h]))
  const habitByCategory = {}
  for (const log of habitLogs) {
    const habit = habitMap[log.habitId]
    if (!habit) continue
    if (!habitByCategory[habit.category]) habitByCategory[habit.category] = { total: 0, completed: 0 }
    habitByCategory[habit.category].total += 1
    if (log.completed) habitByCategory[habit.category].completed += 1
  }

  // Finance score based on savings progress, not weekly spend (bills shouldn't hurt score)
  const discretionary = expenses.filter(e => !['Bills','Utilities','Rent','Insurance'].includes(e.category)).reduce((sum, item) => sum + Number(item.amount || 0), 0)
  const financeScore = Math.max(1, Math.min(10, Math.round(((budget.weeklyTarget - discretionary) / Math.max(budget.weeklyTarget, 1)) * 10 + 7)))

  const scoreFromCompletion = (group) => {
    if (!group || group.total === 0) return 5
    return Math.max(1, Math.min(10, Math.round((group.completed / group.total) * 10)))
  }

  return {
    Health: Math.round((scoreFromCompletion(taskByCategory.Health) + scoreFromCompletion(habitByCategory.Health)) / 2),
    Lifestyle: scoreFromCompletion(taskByCategory.Lifestyle),
    Productivity: scoreFromCompletion(taskByCategory.Productivity),
    Wellness: Math.round((scoreFromCompletion(taskByCategory.Wellness) + scoreFromCompletion(habitByCategory.Wellness)) / 2),
    Finances: financeScore,
  }
}

// ── Steps (checklists on goals & projects) ───────────────────────────────
// Shape: [{ id, text, done, doneAt }] stored in the jsonb `steps` column.
const newStepId = () => 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
function normalizeSteps(steps) {
  if (!Array.isArray(steps)) return []
  return steps
    .filter((st) => st && typeof st.text === 'string' && st.text.trim())
    .map((st) => ({ id: st.id || newStepId(), text: st.text.trim(), done: !!st.done, doneAt: st.doneAt || null }))
}
// Accepts pasted lists: "- item", "1. item", "[ ] item", bullets, blank lines.
const parseStepLines = (text) => String(text || '').split(/\r?\n/)
  .map((l) => l.replace(/^\s*(?:[-*\u2022\u25A2\u2610\u25A1]|\[\s?[xX ]?\]|\d+[.)])\s*/, '').trim())
  .filter(Boolean)

function getProjectProgress(project, tasks) {
  if (!project) return 0
  const p = typeof project === 'object' ? project : null
  const id = p ? p.id : project
  if (p?.status === 'Completed') return 100
  const relatedTasks = tasks.filter((task) => task.linkedProjectId === id)
  const steps = normalizeSteps(p?.steps)
  const total = relatedTasks.length + steps.length
  if (!total) return 0
  const done = relatedTasks.filter((task) => task.completed).length + steps.filter((st) => st.done).length
  return Math.round((done / total) * 100)
}

// Goal progress = its own steps + linked tasks + linked projects (each project
// counts as one unit, credited by its own progress so steps inside it move the goal).
function getGoalProgress(goal, tasks, projects) {
  const g = typeof goal === 'object' ? goal : null
  const id = g ? g.id : goal
  if (g?.completed) return 100
  const relatedTasks = tasks.filter((task) => task.linkedGoalId === id)
  const relatedProjects = projects.filter((project) => project.goalId === id)
  const steps = normalizeSteps(g?.steps)
  const total = relatedTasks.length + relatedProjects.length + steps.length
  if (!total) return 0
  const done = relatedTasks.filter((task) => task.completed).length
    + steps.filter((st) => st.done).length
    + relatedProjects.reduce((sum, project) => sum + getProjectProgress(project, tasks) / 100, 0)
  return Math.round((done / total) * 100)
}

// The next unchecked step for a goal — its own first, then its active projects'.
function nextStepFor(goal, projects = []) {
  if (!goal) return null
  const own = normalizeSteps(goal.steps).find((st) => !st.done)
  if (own) return own.text
  for (const project of projects.filter((pr) => pr.goalId === goal.id && pr.status !== 'Completed')) {
    const st = normalizeSteps(project.steps).find((x) => !x.done)
    if (st) return st.text
  }
  return null
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
const hourLabel = (hh) => { const h = Number(String(hh).slice(0, 2)); return `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}` }

const upsertById = (list, item) => list.some((x) => x.id === item.id)
  ? list.map((x) => x.id === item.id ? item : x)
  : [...list, item]


// ── Charts ────────────────────────────────────────────────────────────────

function getWeekCompletionSeries(tasks) {
  const days = getWeekDays(TODAY)
  return days.map((date) => {
    const dayTasks = tasks.filter((task) => task.date === date)
    const completed = dayTasks.filter((task) => task.completed).length
    return {
      date,
      label: (date.slice(5, 7) + '/' + date.slice(8)),
      total: dayTasks.length,
      completed,
      completionRate: dayTasks.length ? Math.round((completed / dayTasks.length) * 100) : 0,
    }
  })
}

function getBudgetSeries(expenses) {
  const days = getWeekDays(TODAY)
  return days.map((date) => ({
    date,
    label: date.slice(5),
    amount: expenses.filter((expense) => expense.date === date).reduce((sum, item) => sum + Number(item.amount || 0), 0),
  }))
}

function getScoreTrend(scoresHistory = []) {
  if (scoresHistory.length) return scoresHistory
  return Array.from({ length: 7 }, (_, index) => ({
    label: addDays(startOfWeek(TODAY), index).slice(5),
    value: 4 + ((index * 13) % 5),
  }))
}


// ── Insights ──────────────────────────────────────────────────────────────

function getHomeInsights({ tasks, expenses, budget, projects, goals, events, habits, habitLogs }) {
  const openTasks = tasks.filter((task) => !task.completed)
  const completedToday = tasks.filter((task) => task.completed && isToday(task.date)).length
  const overdueCount = openTasks.filter((task) => isOverdue(task.date)).length
  const weekStart = startOfWeek(TODAY)
  const weekEnd = endOfWeek(TODAY)
  const weekTasks = tasks.filter((task) => task.date >= weekStart && task.date <= weekEnd)
  const weekCompleted = weekTasks.filter((task) => task.completed).length
  const completionRate = weekTasks.length ? Math.round((weekCompleted / weekTasks.length) * 100) : 0
  const spend = expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0)
  const budgetRemaining = Number((budget.weeklyTarget - spend).toFixed(2))
  const activeProjects = projects.filter((project) => project.status === 'Active').length
  const goalCount = goals.length
  const scheduleCount = expandEvents(events, TODAY, TODAY).length + tasks.filter((task) => isToday(task.date) && task.time).length

  const recentDays = Array.from({ length: 7 }, (_, index) => addDays(TODAY, index - 6))

  const streakSeries = recentDays.map((date) => {
    const dayHabits = habitLogs.filter((log) => log.date === date)
    return dayHabits.filter((log) => log.completed).length
  })

  const currentHabitStreak = (() => {
    let streak = 0
    for (let i = recentDays.length - 1; i >= 0; i -= 1) {
      const date = recentDays[i]
      const dayHabits = habitLogs.filter((log) => log.date === date)
      if (!dayHabits.length || !dayHabits.some((log) => log.completed)) break
      streak += 1
    }
    return streak
  })()

  return {
    openTasks: openTasks.length,
    completedToday,
    overdueCount,
    completionRate,
    budgetRemaining,
    spend,
    activeProjects,
    goalCount,
    scheduleCount,
    habitCount: habits.length,
    streakSeries,
    currentHabitStreak,
  }
}

function getSmartSuggestions({ tasks, expenses, budget, projects, habits, habitLogs }) {
  const suggestions = []
  const overdue = tasks.filter((task) => !task.completed && isOverdue(task.date))
  const unscheduled = tasks.filter((task) => !task.completed && !task.time)
  const healthGap = !habitLogs.some((log) => log.date === TODAY && log.completed && habits.find((habit) => habit.id === log.habitId && habit.category === 'Health'))
  const weeklySpend = expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0)
  const activeProjects = projects.filter((project) => project.status === 'Active')

  if (overdue.length) {
    suggestions.push({
      title: 'Clear one overdue item',
      body: `${overdue.length} overdue task${overdue.length > 1 ? 's are' : ' is'} slowing down momentum. Knock out the easiest one first.`,
      tone: 'alert',
      actionLabel: 'Open Tasks',
      route: '/tasks',
    })
  }

  if (weeklySpend > budget.weeklyTarget) {
    suggestions.push({
      title: 'Re-center your spending',
      body: `You are $${(weeklySpend - budget.weeklyTarget).toFixed(2)} over the weekly target. Review subscriptions or flexible spending today.`,
      tone: 'warning',
      actionLabel: 'See Finances',
      route: '/finance',
    })
  }

  if (healthGap) {
    suggestions.push({
      title: 'Health score wants a win',
      body: 'No health habit has been logged today yet. Even a short workout or walk will move the scorecard.',
      tone: 'success',
      actionLabel: 'Open Growth',
      route: '/growth',
    })
  }

  if (unscheduled.length) {
    suggestions.push({
      title: 'Give loose tasks a time',
      body: `${unscheduled.length} open task${unscheduled.length > 1 ? 's have' : ' has'} no time block. Drag one into the calendar so it becomes real.`,
      tone: 'info',
      actionLabel: 'Open Calendar',
      route: '/calendar',
    })
  }

  if (activeProjects.length > 2) {
    suggestions.push({
      title: 'Trim active project load',
      body: `You have ${activeProjects.length} active projects. Consider pausing one to protect focus.`,
      tone: 'info',
      actionLabel: 'Review Projects',
      route: '/projects',
    })
  }

  return suggestions.slice(0, 4)
}


// ── Seed data ─────────────────────────────────────────────────────────────

const categories = [
  'Health',
  'Lifestyle',
  'Productivity',
  'Wellness',
  'Finances',
  'Faith',
  'Business',
]

const defaultData = {
  tasks: [],
  goals: [],
  projects: [],
  expenses: [],
  notes: [],
  events: [],
  habits: [],
  habitLogs: [],
  budget: { weeklyTarget: 200 },
  profile: {
    displayName: '',
    timezone: 'America/Chicago',
    plannerMode: 'Balanced',
  },
  settings: {
    onboardingComplete: false,
    showCompletedTasks: false,
    compactCalendar: false,
    notifications: {},
  },
}


// ── Planner Service ───────────────────────────────────────────────────────

const localKeys = {
  tasks: 'planner.tasks',
  goals: 'planner.goals',
  projects: 'planner.projects',
  expenses: 'planner.expenses',
  notes: 'planner.notes',
  events: 'planner.events',
  habits: 'planner.habits',
  habitLogs: 'planner.habitLogs',
  budget: 'planner.budget',
  profile: 'planner.profile',
  settings: 'planner.settings',
}

const tableMap = {
  task: { table: 'tasks', collection: 'tasks' },
  goal: { table: 'goals', collection: 'goals' },
  project: { table: 'projects', collection: 'projects' },
  expense: { table: 'expenses', collection: 'expenses' },
  note: { table: 'notes', collection: 'notes' },
  event: { table: 'events', collection: 'events' },
  habit: { table: 'habits', collection: 'habits' },
}

function readLocal(key, fallback) {
  const raw = window.localStorage.getItem(key)
  if (!raw) {
    window.localStorage.setItem(key, JSON.stringify(fallback))
    return fallback
  }
  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function writeLocal(key, value) {
  window.localStorage.setItem(key, JSON.stringify(value))
}

function normalizePayload(type, payload, userId) {
  const raw = { ...payload, user_id: userId }
  delete raw.itemType  // client-only timeline tag, never a DB column

  // ── Translate JS field names → Supabase column names ─────────────────
  if (type === 'habit') {
    // habits table uses 'name' not 'title'
    if ('title' in raw) { raw.name = raw.title; delete raw.title }
    // only keep valid columns
    const { id, name, category, color, icon, user_id } = raw
    return { id, name, category: category||'Health', color: color||null, icon: icon||null, user_id }
  }

  if (type === 'task') {
    if ('linkedGoalId' in raw) { raw.goal_id = raw.linkedGoalId ? String(raw.linkedGoalId) : null; delete raw.linkedGoalId }
    if ('linkedProjectId' in raw) { raw.project_id = raw.linkedProjectId ? String(raw.linkedProjectId) : null; delete raw.linkedProjectId }
    if (!raw.recurrence) raw.recurrence = 'none'
    // clean up extra fields not in schema
    delete raw.linkedType; delete raw.linkedId; delete raw.goalId; delete raw.startTime
    return raw
  }

  if (type === 'goal') {
    if ('targetDate' in raw) { raw.target_date = raw.targetDate || null; delete raw.targetDate }
    if ('steps' in raw) raw.steps = normalizeSteps(raw.steps)
    delete raw.linkedType; delete raw.linkedId; delete raw.linkedGoalId; delete raw.linkedProjectId
    return raw
  }

  if (type === 'project') {
    if ('goalId' in raw) { raw.goal_id = raw.goalId ? String(raw.goalId) : null; delete raw.goalId }
    if ('dueDate' in raw) { raw.due_date = raw.dueDate || null; delete raw.dueDate }
    if ('steps' in raw) raw.steps = normalizeSteps(raw.steps)
    delete raw.linkedType; delete raw.linkedId
    return raw
  }

  if (type === 'event') {
    if ('startTime' in raw) { raw.time = raw.startTime || null; delete raw.startTime }
    if ('endTime' in raw) { raw.end_time = raw.endTime || null; delete raw.endTime }
    if ('recurrenceUntil' in raw) { raw.recurrence_until = raw.recurrenceUntil || null; delete raw.recurrenceUntil }
    if ('skipDates' in raw) { raw.skip_dates = Array.isArray(raw.skipDates) ? raw.skipDates : []; delete raw.skipDates }
    if (!raw.recurrence) raw.recurrence = 'none'
    delete raw.seriesStart; delete raw.isRepeat; delete raw.itemType
    delete raw.linkedType; delete raw.linkedId
    return raw
  }

  if (type === 'expense') {
    raw.amount = Number(raw.amount)
    if ('note' in raw) { raw.description = raw.note || null; delete raw.note }
    delete raw.linkedType; delete raw.linkedId
    return raw
  }

  if (type === 'note') {
    // linkedType/linkedId not in notes schema — drop them
    delete raw.linkedType; delete raw.linkedId; delete raw.linkedGoalId; delete raw.linkedProjectId
    return raw
  }

  return raw
}

function stripUserId(payload) {
  const { user_id, ...rest } = payload
  return rest
}

async function loadLocalAll() {
  return {
    tasks: readLocal(localKeys.tasks, defaultData.tasks),
    goals: readLocal(localKeys.goals, defaultData.goals),
    projects: readLocal(localKeys.projects, defaultData.projects),
    expenses: readLocal(localKeys.expenses, defaultData.expenses),
    notes: readLocal(localKeys.notes, defaultData.notes),
    events: readLocal(localKeys.events, defaultData.events),
    habits: readLocal(localKeys.habits, defaultData.habits),
    habitLogs: readLocal(localKeys.habitLogs, defaultData.habitLogs),
    budget: readLocal(localKeys.budget, defaultData.budget),
    profile: readLocal(localKeys.profile, defaultData.profile),
    settings: readLocal(localKeys.settings, defaultData.settings),
  }
}

// ── Row mapper: DB column names → JS field names ────────────────────────
// Used by both initial load AND after-save returns so the UI always gets
// consistent field names (title, linkedGoalId, habitId, etc.)
function mapDbRow(type, row) {
  if (!row) return row
  const r = { ...row }
  // 'habit' / 'habits' both supported since saveItem uses singular type
  const t = type === 'habit' ? 'habits'
          : type === 'task' ? 'tasks'
          : type === 'goal' ? 'goals'
          : type === 'project' ? 'projects'
          : type === 'event' ? 'events'
          : type === 'expense' ? 'expenses'
          : type === 'habit_log' ? 'habit_logs'
          : type
  if (t === 'habits')     { r.title = r.name; delete r.name }
  if (t === 'tasks')      { r.linkedGoalId = r.goal_id; r.linkedProjectId = r.project_id; delete r.goal_id; delete r.project_id }
  if (t === 'goals')      { r.targetDate = r.target_date; delete r.target_date; r.steps = normalizeSteps(r.steps) }
  if (t === 'projects')   { r.goalId = r.goal_id; r.dueDate = r.due_date; delete r.goal_id; delete r.due_date; r.steps = normalizeSteps(r.steps) }
  if (t === 'events')     { r.startTime = r.time; r.endTime = r.end_time; delete r.time; delete r.end_time
                            r.recurrence = r.recurrence || 'none'; r.recurrenceUntil = r.recurrence_until || ''; r.skipDates = Array.isArray(r.skip_dates) ? r.skip_dates : []
                            delete r.recurrence_until; delete r.skip_dates }
  if (t === 'expenses')   { r.note = r.description }
  if (t === 'habit_logs') { r.habitId = r.habit_id; delete r.habit_id }
  return r
}

async function loadSupabaseAll(userId) {
  const queries = [
    ['tasks', 'tasks'],
    ['goals', 'goals'],
    ['projects', 'projects'],
    ['expenses', 'expenses'],
    ['notes', 'notes'],
    ['events', 'events'],
    ['habits', 'habits'],
    ['habit_logs', 'habitLogs'],
  ].map(async ([table, key]) => {
    const { data, error } = await supabase.from(table).select('*').eq('user_id', userId).order('id', { ascending: true })
    if (error) throw error
    return [key, data ?? []]
  })

  const rows = Object.fromEntries(await Promise.all(queries))
  const { data: budgetRows } = await supabase.from('budgets').select('*').eq('user_id', userId).limit(1)
  const { data: profileRows } = await supabase.from('profiles').select('*').eq('user_id', userId).limit(1)
  const { data: settingsRows } = await supabase.from('planner_settings').select('*').eq('user_id', userId).limit(1)

  const mapped = {
    tasks:     (rows.tasks     || []).map(r => mapDbRow('tasks', r)),
    goals:     (rows.goals     || []).map(r => mapDbRow('goals', r)),
    projects:  (rows.projects  || []).map(r => mapDbRow('projects', r)),
    expenses:  (rows.expenses  || []).map(r => mapDbRow('expenses', r)),
    notes:     (rows.notes     || []).map(r => mapDbRow('notes', r)),
    events:    (rows.events    || []).map(r => mapDbRow('events', r)),
    habits:    (rows.habits    || []).map(r => mapDbRow('habits', r)),
    habitLogs: (rows.habitLogs || []).map(r => mapDbRow('habit_logs', r)),
  }

  return {
    ...mapped,
    budget: budgetRows?.[0] ? { weeklyTarget: Number(budgetRows[0].weekly_target) } : defaultData.budget,
    profile: profileRows?.[0] ? { displayName: profileRows[0].display_name, timezone: profileRows[0].timezone, plannerMode: profileRows[0].planner_mode } : defaultData.profile,
    settings: settingsRows?.[0] ? { onboardingComplete: settingsRows[0].onboarding_complete, showCompletedTasks: settingsRows[0].show_completed_tasks, compactCalendar: settingsRows[0].compact_calendar, notifications: settingsRows[0].notifications || {} } : defaultData.settings,
  }
}

const sameTaskTitle = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase()

function nextRecurringDate(date, recurrence) {
  if (recurrence === 'daily') return addDays(date, 1)
  if (recurrence === 'weekly') return addDays(date, 7)
  if (recurrence === 'monthly') return addDays(date, 30)
  return null
}

const plannerService = {
  collectionName(type) {
    return tableMap[type]?.collection
  },

  async loadAll(userId) {
    return hasSupabaseEnv ? loadSupabaseAll(userId) : loadLocalAll()
  },

  async saveItem(type, payload, mode, userId) {
    const meta = tableMap[type]
    if (!meta) throw new Error(`Unknown item type: ${type}`)
    const next = normalizePayload(type, payload, userId)

    if (!hasSupabaseEnv) {
      const current = readLocal(localKeys[meta.collection], defaultData[meta.collection])
      if (mode === 'edit' && next.id) {
        const updated = current.map((item) => item.id === next.id ? stripUserId(next) : item)
        writeLocal(localKeys[meta.collection], updated)
        return stripUserId(next)
      }
      const created = { ...stripUserId(next), id: Date.now() }
      writeLocal(localKeys[meta.collection], [...current, created])
      return created
    }

    if (mode === 'edit' && next.id) {
      const { data, error } = await supabase.from(meta.table).update(next).eq('id', next.id).eq('user_id', userId).select().single()
      if (error) throw error
      return mapDbRow(type, data)
    }

    const insertPayload = { ...next }
    delete insertPayload.id
    const { data, error } = await supabase.from(meta.table).insert(insertPayload).select().single()
    if (error) throw error
    return mapDbRow(type, data)
  },

  async deleteItem(type, id, userId) {
    const meta = tableMap[type]
    if (!meta) throw new Error(`Unknown item type: ${type}`)

    if (!hasSupabaseEnv) {
      const current = readLocal(localKeys[meta.collection], defaultData[meta.collection])
      writeLocal(localKeys[meta.collection], current.filter((item) => item.id !== id))
      return
    }

    const { error } = await supabase.from(meta.table).delete().eq('id', id).eq('user_id', userId)
    if (error) throw error
  },

  async toggleHabitLog(habitId, date, userId, currentLogs = []) {
    const existing = currentLogs.find((log) => log.habitId === habitId && log.date === date)
    if (!hasSupabaseEnv) {
      const logs = readLocal(localKeys.habitLogs, defaultData.habitLogs)
      if (!existing) {
        const created = { id: Date.now(), habitId, date, completed: true }
        writeLocal(localKeys.habitLogs, [...logs, created])
        return created
      }
      const updated = { ...existing, completed: !existing.completed }
      writeLocal(localKeys.habitLogs, logs.map((log) => log.id === existing.id ? updated : log))
      return updated
    }

    if (!existing) {
      const { data, error } = await supabase.from('habit_logs').upsert({ habit_id: habitId, date, completed: true, user_id: userId }, { onConflict: 'user_id,habit_id,date' }).select().single()
      if (error) throw error
      return mapDbRow('habit_log', data)
    }
    const { data, error } = await supabase.from('habit_logs').update({ completed: !existing.completed }).eq('id', existing.id).eq('user_id', userId).select().single()
    if (error) throw error
    return mapDbRow('habit_log', data)
  },

  async toggleTask(task, userId) {
    if (!hasSupabaseEnv) {
      const current = readLocal(localKeys.tasks, defaultData.tasks)
      const updatedTask = { ...task, completed: !task.completed }
      let next = current.map((item) => item.id === task.id ? updatedTask : item)
      if (!task.completed && task.recurrence && task.recurrence !== 'none') {
        const futureDate = nextRecurringDate(task.date, task.recurrence)
        const already = next.some((item) => item.id !== task.id && item.date === futureDate && sameTaskTitle(item.title, task.title))
        if (futureDate && !already) {
          next.push({ ...task, id: Date.now(), completed: false, date: futureDate })
        }
      }
      writeLocal(localKeys.tasks, next)
      return { updatedTask, extraTask: next.at(-1)?.id !== updatedTask.id ? next.at(-1) : null }
    }

    const { data, error } = await supabase.from('tasks').update({ completed: !task.completed }).eq('id', task.id).eq('user_id', userId).select().single()
    if (error) throw error

    let extraTask = null
    if (!task.completed && task.recurrence && task.recurrence !== 'none') {
      const futureDate = nextRecurringDate(task.date, task.recurrence)
      // Skip if next occurrence already exists (re-checking a task, or it was made earlier)
      let already = false
      if (futureDate) {
        const { data: existing } = await supabase.from('tasks').select('id, title')
          .eq('user_id', userId).eq('date', futureDate)
        already = (existing || []).some((row) => row.id !== task.id && sameTaskTitle(row.title, task.title))
      }
      if (futureDate && !already) {
        let clonePayload = { ...task, completed: false, date: futureDate, user_id: userId }
        delete clonePayload.id
        delete clonePayload.created_at; delete clonePayload.updated_at
        delete clonePayload.startTime; delete clonePayload.itemType
        // Normalize camelCase -> snake_case before inserting
        if ('linkedGoalId' in clonePayload) { clonePayload.goal_id = clonePayload.linkedGoalId || null; delete clonePayload.linkedGoalId }
        if ('linkedProjectId' in clonePayload) { clonePayload.project_id = clonePayload.linkedProjectId || null; delete clonePayload.linkedProjectId }
        if ('linkedType' in clonePayload) delete clonePayload.linkedType
        if ('linkedId' in clonePayload) delete clonePayload.linkedId
        const { data: inserted, error: insertError } = await supabase.from('tasks').insert(clonePayload).select().single()
        if (insertError) throw insertError
        extraTask = mapDbRow('task', inserted)
      }
    }
    return { updatedTask: mapDbRow('task', data), extraTask }
  },

  async saveBudget(nextBudget, userId) {
    const normalized = { weeklyTarget: Number(nextBudget.weeklyTarget) }
    if (!hasSupabaseEnv) {
      writeLocal(localKeys.budget, normalized)
      return normalized
    }

    const row = { user_id: userId, weekly_target: normalized.weeklyTarget }
    const { data, error } = await supabase.from('budgets').upsert(row, { onConflict: 'user_id' }).select().single()
    if (error) throw error
    return { weeklyTarget: Number(data.weekly_target) }
  },

  async saveProfile(profile, userId) {
    if (!hasSupabaseEnv) {
      writeLocal(localKeys.profile, profile)
      return profile
    }
    const row = { user_id: userId, display_name: profile.displayName, timezone: profile.timezone, planner_mode: profile.plannerMode }
    const { data, error } = await supabase.from('profiles').upsert(row, { onConflict: 'user_id' }).select().single()
    if (error) throw error
    return { displayName: data.display_name, timezone: data.timezone, plannerMode: data.planner_mode }
  },

  async saveSettings(settings, userId) {
    if (!hasSupabaseEnv) {
      writeLocal(localKeys.settings, settings)
      return settings
    }
    const row = { user_id: userId, onboarding_complete: settings.onboardingComplete, show_completed_tasks: settings.showCompletedTasks, compact_calendar: settings.compactCalendar, notifications: settings.notifications || {} }
    const { data, error } = await supabase.from('planner_settings').upsert(row, { onConflict: 'user_id' }).select().single()
    if (error) throw error
    return { onboardingComplete: data.onboarding_complete, showCompletedTasks: data.show_completed_tasks, compactCalendar: data.compact_calendar, notifications: data.notifications || {} }
  },
}


// ── Responsive hook ───────────────────────────────────────────────────────

function getMatch(query) {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia(query).matches
}

function useMediaQuery(query) {
  const [matches, setMatches] = useState(getMatch(query))

  useEffect(() => {
    if (!window.matchMedia) return undefined
    const media = window.matchMedia(query)
    const listener = (event) => setMatches(event.matches)
    setMatches(media.matches)
    media.addEventListener('change', listener)
    return () => media.removeEventListener('change', listener)
  }, [query])

  return matches
}

function useResponsive() {
  const isMobile = useMediaQuery('(max-width: 760px)')
  const isTablet = useMediaQuery('(min-width: 761px) and (max-width: 1080px)')
  const isDesktop = useMediaQuery('(min-width: 1081px)')
  const prefersTouch = useMediaQuery('(pointer: coarse)')
  return { isMobile, isTablet, isDesktop, prefersTouch }
}


// ── Auth Context ──────────────────────────────────────────────────────────
const AuthContext = createContext(null)
const MOCK_EMAIL = ''

function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState('supabase')

  useEffect(() => {
    if (!hasSupabaseEnv) {
      const stored = window.localStorage.getItem('planner.mock.user')
      if (stored) {
        const parsed = JSON.parse(stored)
        setUser(parsed)
        setSession({ user: parsed })
      }
      setLoading(false)
      return
    }
    let mounted = true
    supabase.auth.getSession().then(( { data }) => {
      if (!mounted) return
      setSession(data.session ?? null)
      setUser(data.session?.user ?? null)
      setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null)
      setUser(nextSession?.user ?? null)
      setLoading(false)
    })
    return () => { mounted = false; listener.subscription.unsubscribe() }
  }, [])

  const signIn = async ({ email, password }) => {
    if (mode === 'mock') {
      const mockUser = { id: 'mock-user', email: email || MOCK_EMAIL }
      window.localStorage.setItem('planner.mock.user', JSON.stringify(mockUser))
      setUser(mockUser); setSession({ user: mockUser })
      return { data: { user: mockUser }, error: null }
    }
    if (!hasSupabaseEnv) return { data: null, error: new Error('Supabase env vars missing.') }
    return supabase.auth.signInWithPassword({ email, password })
  }

  const signUp = async ({ email, password }) => {
    if (mode === 'mock') return signIn({ email, password })
    if (!hasSupabaseEnv) return { data: null, error: new Error('Supabase env vars missing.') }
    return supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: window.location.origin }
    })
  }

  const signOut = async () => {
    if (mode === 'mock') {
      window.localStorage.removeItem('planner.mock.user')
      setUser(null); setSession(null)
      return { error: null }
    }
    if (!hasSupabaseEnv) return { error: null }
    return supabase.auth.signOut()
  }

  const value = useMemo(() => ({
    session, user, loading, isAuthenticated: Boolean(user),
    signIn, signUp, signOut, mode, setMode,
  }), [session, user, loading, mode])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

// ── usePlannerData ────────────────────────────────────────────────────────
const emptyCollections = {
  tasks: [], goals: [], projects: [], expenses: [], notes: [],
  events: [], habits: [], habitLogs: [],
  budget: { weeklyTarget: 350 },
  profile: defaultData.profile,
  settings: defaultData.settings,
}

function usePlannerData() {
  const { user, isAuthenticated, mode } = useAuth()
  const [collections, setCollections] = useState(defaultData)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')
  const pendingRef = React.useRef({})      // "table:id" → writes in flight (ignore their realtime echoes)
  const stepsQueueRef = React.useRef({})   // "table:id" → promise chain so step saves land in order
  const lastLoadRef = React.useRef(0)

  useEffect(() => {
    if (!isAuthenticated || !user) {
      setCollections(emptyCollections); setLoading(false); return
    }
    let active = true
    setLoading(true); setError('')
    plannerService.loadAll(user.id)
      .then((data) => { if (active) { setCollections(data); lastLoadRef.current = Date.now() } })
      .catch((err) => { if (active) setError(err.message || 'Failed to load data.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [isAuthenticated, user?.id, mode])

  // Live sync — changes made on another device show up here without a reload.
  useEffect(() => {
    if (!isAuthenticated || !user || !hasSupabaseEnv) return
    const LIVE = [['tasks', 'tasks'], ['goals', 'goals'], ['projects', 'projects'], ['events', 'events'],
      ['notes', 'notes'], ['expenses', 'expenses'], ['habits', 'habits']]
    let channel = supabase.channel('planner_core_' + user.id)
    LIVE.forEach(([table, key]) => {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `user_id=eq.${user.id}` }, (payload) => {
        if (payload.eventType === 'DELETE') {
          const id = payload.old?.id
          if (id) setCollections((c) => ({ ...c, [key]: (c[key] || []).filter((x) => x.id !== id) }))
          return
        }
        const row = payload.new
        if (!row?.id || pendingRef.current[`${table}:${row.id}`]) return
        const mapped = mapDbRow(table, row)
        setCollections((c) => ({ ...c, [key]: upsertById(c[key] || [], mapped) }))
      })
    })
    channel.subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [isAuthenticated, user?.id])

  // Coming back to the app (phone unlocked, tab switched) — pull a fresh copy
  // in case the live connection slept while it was in the background.
  useEffect(() => {
    if (!isAuthenticated || !user) return
    const refresh = () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - lastLoadRef.current < 15000) return
      if (Object.keys(pendingRef.current).length) return
      lastLoadRef.current = Date.now()
      plannerService.loadAll(user.id).then((data) => setCollections(data)).catch(() => {})
    }
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('pageshow', refresh)
    return () => { document.removeEventListener('visibilitychange', refresh); window.removeEventListener('pageshow', refresh) }
  }, [isAuthenticated, user?.id])

  const scores = useMemo(() => computeScores(collections), [collections])
  const [scoreHistory, setScoreHistory] = useState([])

  // Snapshot today's score to Supabase once per day
  useEffect(() => {
    if (!user || !scores || loading) return
    const today = TODAY
    const lastSnapshot = localStorage.getItem('planner_last_score_snapshot')
    if (lastSnapshot === today) return
    if (!hasSupabaseEnv) return

    const overall = Math.round(Object.values(scores).reduce((s, v) => s + v, 0) / Object.keys(scores).length)
    const snapshot = {
      user_id: user.id,
      date: today,
      overall_score: overall,
      scores: scores,
    }

    supabase.from('score_history').upsert(snapshot, { onConflict: 'user_id,date' })
      .then(({ error }) => {
        if (!error) {
          try { localStorage.setItem('planner_last_score_snapshot', today) } catch {}
        }
      })
  }, [scores, user?.id, loading])

  // Load score history on mount
  useEffect(() => {
    if (!user || !hasSupabaseEnv) return
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
    supabase.from('score_history')
      .select('date, overall_score, scores')
      .eq('user_id', user.id)
      .gte('date', thirtyDaysAgo)
      .order('date', { ascending: true })
      .then(({ data, error }) => {
        if (!error && data) setScoreHistory(data)
      })
  }, [user?.id])


  const saveItem = async (type, payload, modeArg = 'create') => {
    if (!user) return
    setSyncing(true); setError('')
    try {
      const saved = await plannerService.saveItem(type, payload, modeArg, user.id)
      setCollections((current) => {
        const key = plannerService.collectionName(type)
        if (modeArg === 'edit' && payload.id)
          return { ...current, [key]: current[key].map((item) => item.id === payload.id ? saved : item) }
        return { ...current, [key]: upsertById(current[key], saved) }
      })
      return saved
    } catch (err) {
      setError(err.message || 'Could not save.'); throw err
    } finally { setSyncing(false) }
  }

  const deleteItem = async (type, id) => {
    if (!user) return
    setSyncing(true); setError('')
    try {
      await plannerService.deleteItem(type, id, user.id)
      setCollections((current) => {
        const key = plannerService.collectionName(type)
        const next = { ...current, [key]: current[key].filter((item) => item.id !== id) }
        if (type === 'habit') next.habitLogs = current.habitLogs.filter((log) => log.habitId !== id)
        return next
      })
    } catch (err) {
      setError(err.message || 'Could not delete.'); throw err
    } finally { setSyncing(false) }
  }

  const toggleTask = async (taskId) => {
    const task = collections.tasks.find((item) => item.id === taskId)
    if (!task || !user) return
    setSyncing(true); setError('')
    try {
      const { updatedTask, extraTask } = await plannerService.toggleTask(task, user.id)
      setCollections((current) => ({
        ...current,
        tasks: (extraTask ? upsertById(current.tasks, extraTask) : current.tasks).map((item) => item.id === taskId ? updatedTask : item)
          .sort((a, b) => `${a.date}-${a.time || ''}`.localeCompare(`${b.date}-${b.time || ''}`)),
      }))
    } catch (err) {
      setError(err.message || 'Could not update task.'); throw err
    } finally { setSyncing(false) }
  }

  const toggleHabit = async (habitId, date = TODAY) => {
    if (!user) return
    // Optimistic update — immediately flip the UI before Supabase responds
    const existingLog = collections.habitLogs.find(l => l.habitId === habitId && l.date === date && !String(l.id).startsWith('optimistic_'))
    const wasCompleted = existingLog?.completed
    
    // Optimistically update: filter out any old/optimistic log for this habit+date, add the new state
    setCollections(prev => ({
      ...prev,
      habitLogs: [
        ...prev.habitLogs.filter(l => !(l.habitId === habitId && l.date === date)),
        { id: 'optimistic_' + habitId + '_' + date, habitId, date, completed: !wasCompleted, completedAt: new Date().toISOString() }
      ]
    }))
    
    setSyncing(true); setError('')
    try {
      const nextLog = await plannerService.toggleHabitLog(habitId, date, user.id, collections.habitLogs)
      // Replace the optimistic entry with the real one (or remove if toggle was OFF and returned nothing)
      setCollections((current) => ({
        ...current,
        habitLogs: [
          ...current.habitLogs.filter(l => !(l.habitId === habitId && l.date === date)),
          ...(nextLog && nextLog.completed ? [nextLog] : [])
        ]
      }))
    } catch (err) {
      // On error, revert optimistic update
      setCollections(prev => ({
        ...prev,
        habitLogs: prev.habitLogs.filter(l => !(l.habitId === habitId && l.date === date && String(l.id).startsWith('optimistic_')))
      }))
      setError(err.message || 'Could not toggle habit.')
    } finally { setSyncing(false) }
  }

  // Check off / add / reorder steps on a goal or project. Updates the screen
  // instantly, then saves in order; reverts if the save fails.
  const saveSteps = (type, itemId, steps) => {
    if (!user) return
    const meta = tableMap[type]
    if (!meta) return
    const key = meta.collection
    const clean = normalizeSteps(steps)
    const before = (collections[key] || []).find((x) => x.id === itemId)?.steps || []
    setCollections((c) => ({ ...c, [key]: c[key].map((x) => x.id === itemId ? { ...x, steps: clean } : x) }))
    const pk = `${meta.table}:${itemId}`
    pendingRef.current[pk] = (pendingRef.current[pk] || 0) + 1
    const write = async () => {
      if (!hasSupabaseEnv) {
        const current = readLocal(localKeys[key], defaultData[key])
        writeLocal(localKeys[key], current.map((x) => x.id === itemId ? { ...x, steps: clean } : x))
        return
      }
      const { error: err } = await supabase.from(meta.table)
        .update({ steps: clean, updated_at: new Date().toISOString() })
        .eq('id', itemId).eq('user_id', user.id)
      if (err) throw err
    }
    const run = (stepsQueueRef.current[pk] || Promise.resolve())
      .then(write)
      .catch((err) => {
        setError(err.message || 'Could not save steps.')
        setCollections((c) => ({ ...c, [key]: c[key].map((x) => x.id === itemId ? { ...x, steps: before } : x) }))
      })
      .finally(() => {
        window.setTimeout(() => {
          pendingRef.current[pk] = (pendingRef.current[pk] || 1) - 1
          if (pendingRef.current[pk] <= 0) delete pendingRef.current[pk]
        }, 1500)
      })
    stepsQueueRef.current[pk] = run
    return run
  }

  const updateBudget = async (nextBudget) => {
    if (!user) return
    setSyncing(true); setError('')
    try {
      const saved = await plannerService.saveBudget(nextBudget, user.id)
      setCollections((current) => ({ ...current, budget: saved }))
    } catch (err) {
      setError(err.message || 'Could not update budget.'); throw err
    } finally { setSyncing(false) }
  }

  const updateProfile = async (profile) => {
    if (!user) return
    setSyncing(true)
    try {
      const saved = await plannerService.saveProfile(profile, user.id)
      setCollections((current) => ({ ...current, profile: saved }))
    } finally { setSyncing(false) }
  }

  const updateSettings = async (settings) => {
    if (!user) return
    setSyncing(true)
    try {
      const saved = await plannerService.saveSettings(settings, user.id)
      setCollections((current) => ({ ...current, settings: saved }))
    } finally { setSyncing(false) }
  }

  return {
    ...collections, scores, scoreHistory, loading, syncing, error,
    saveItem, deleteItem, toggleTask, toggleHabit, saveSteps,
    updateBudget, updateProfile, updateSettings,
  }
}

// ── Components ────────────────────────────────────────────────────────────

function AuthGate({ children, fallback }) {
  const { loading, isAuthenticated } = useAuth()

  if (loading) {
    return (
      <div className="auth-shell" style={{background:'var(--ink)'}}>
        <div style={{textAlign:'center'}}>
          <div style={{marginBottom:18,opacity:.9}}><BrandMark size={52} ink="#1C1C1E" /></div>
          <p style={{color:'var(--brass)',fontSize:'.75rem',fontWeight:700,letterSpacing:'.15em',textTransform:'uppercase',marginBottom:8}}>The Living Planner</p>
          <p style={{color:'rgba(255,255,255,.4)',fontSize:'.88rem'}}>Loading your workspace…</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) return fallback
  return children
}


function AuthPage() {
  const { signIn, signUp, mode, setMode } = useAuth()
  const [step, setStep] = useState('welcome') // welcome | features | signin

  useEffect(() => {
    // Force dark background - override all CSS
    const style = document.createElement('style')
    style.id = 'auth-bg-override'
    style.textContent = 'html, body, #root { background: #1C1C1E !important; }'
    document.head.appendChild(style)
    document.body.style.setProperty('background', '#1C1C1E', 'important')
    document.documentElement.style.setProperty('background', '#1C1C1E', 'important')
    return () => {
      const el = document.getElementById('auth-bg-override')
      if (el) el.remove()
      document.body.style.removeProperty('background')
      document.documentElement.style.removeProperty('background')
    }
  }, [])
  const [isSignup, setIsSignup] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')
    try {
      const action = isSignup ? signUp : signIn
      const { error: authError } = await action({ email, password })
      if (authError) throw authError
      setMessage(isSignup ? 'Account created. Welcome to your planner.' : 'Welcome back.')
    } catch (err) {
      setError(err.message || 'Authentication failed.')
    } finally {
      setLoading(false)
    }
  }

  const SECTIONS = [
    { icon: Cross, title: 'Faith', desc: 'Devotionals, prayer journal, scripture, sermon notes, and Bible reading.' },
    { icon: CalendarDays, title: 'Tasks & Calendar', desc: 'Capture everything, schedule anything, and never miss what matters.' },
    { icon: Target, title: 'Goals & Habits', desc: 'Break goals and projects into steps you check off, build routines, and watch your Life Score rise.' },
    { icon: Wallet, title: 'Finance & Budget', desc: 'Monthly income, bills, savings goals, debt payoff, and giving.' },
    { icon: Leaf, title: 'Health & Wellness', desc: 'Training, recovery, nutrition, sleep, mood, journal, vitals, and medications.' },
    { icon: Zap, title: 'Productivity', desc: 'Brain dump, notes, checklists, and a focus timer.' },
    { icon: Compass, title: 'Lifestyle', desc: 'Groceries, recipes, cleaning, trips, birthdays, and gifts.' },
  ]

  // ── Welcome screen ──────────────────────────────────────────────────────
  if (step === 'welcome') return (
    <div className="auth-shell" style={{background:'var(--navy)'}}>
      <div style={{maxWidth:460, width:'100%', padding:'0 20px', textAlign:'center'}}>
        <div style={{marginBottom:22}}><BrandMark size={68} ink="#1C1C1E" /></div>
        <p style={{color:'var(--brass)', fontSize:'.72rem', fontWeight:700, letterSpacing:'.28em', textTransform:'uppercase', marginBottom:12}}>The Living Planner</p>
        <h1 style={{color:'white', fontSize:'2.35rem', fontFamily:'var(--serif)', fontWeight:400, letterSpacing:'-.01em', lineHeight:1.12, marginBottom:16}}>
          Plan with clarity.<br/>Live with purpose.
        </h1>
        <p style={{color:'rgba(255,255,255,.80)', fontSize:'.95rem', lineHeight:1.7, marginBottom:32}}>
          One place for your tasks, goals, habits, finances, health, and everything in between.
        </p>
        <div style={{display:'grid', gap:6}}>
          <button onClick={() => setStep('features')}
            style={{background:'linear-gradient(180deg, #C9A86B 0%, var(--brass) 55%, var(--brass2) 100%)', color:'#1C1C1E', border:'none', borderRadius:999, padding:'15px 24px', fontWeight:700, fontSize:'1rem', letterSpacing:'.01em', cursor:'pointer', fontFamily:'inherit', boxShadow:'0 10px 30px rgba(184,150,90,.28)'}}>
            See What's Inside →
          </button>
          <button onClick={() => setStep('signin')}
            style={{background:'rgba(255,255,255,.12)', color:'rgba(255,255,255,.90)', border:'1.5px solid rgba(255,255,255,.25)', borderRadius:999, padding:'12px 24px', fontWeight:600, fontSize:'.9rem', cursor:'pointer', fontFamily:'inherit'}}>
            I already have an account
          </button>
        </div>
      </div>
    </div>
  )

  // ── Features walkthrough ────────────────────────────────────────────────
  if (step === 'features') return (
    <div className="auth-shell" style={{background:'var(--navy)', alignItems:'flex-start', paddingTop:40}}>
      <div style={{maxWidth:460, width:'100%', padding:'0 20px'}}>
        <button onClick={() => setStep('welcome')}
          style={{background:'none', border:'none', color:'rgba(255,255,255,.4)', cursor:'pointer', fontSize:'.85rem', marginBottom:24, fontFamily:'inherit'}}>
          ← Back
        </button>
        <p style={{color:'var(--brass)', fontSize:'.72rem', fontWeight:700, letterSpacing:'.2em', textTransform:'uppercase', marginBottom:8}}>Everything in one place</p>
        <h2 style={{color:'white', fontFamily:'var(--serif)', fontWeight:400, fontSize:'1.9rem', marginBottom:20}}>What's inside your planner</h2>
        <div style={{display:'grid', gap:10, marginBottom:28}}>
          {SECTIONS.map(s => (
            <div key={s.title} style={{background:'rgba(255,255,255,.09)', border:'1px solid rgba(184,150,90,.25)', borderRadius:'var(--radius)', padding:'12px 14px', display:'flex', gap:12, alignItems:'flex-start'}}>
              <span style={{width:38,height:38,borderRadius:11,flexShrink:0,display:'grid',placeItems:'center',background:'rgba(184,150,90,.12)',border:'1px solid rgba(184,150,90,.3)'}}><s.icon size={19} strokeWidth={1.6} color="var(--brass)" /></span>
              <div>
                <div style={{fontWeight:700, color:'#FFFFFF', fontSize:'.9rem', marginBottom:3}}>{s.title}</div>
                <div style={{fontSize:'.78rem', color:'rgba(255,255,255,.70)', lineHeight:1.5}}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{display:'grid', gap:6}}>
          <button onClick={() => setStep('signin')}
            style={{background:'linear-gradient(180deg, #C9A86B 0%, var(--brass) 55%, var(--brass2) 100%)', color:'#1C1C1E', border:'none', borderRadius:999, padding:'15px 24px', fontWeight:700, fontSize:'1rem', letterSpacing:'.01em', cursor:'pointer', fontFamily:'inherit', boxShadow:'0 10px 30px rgba(184,150,90,.28)'}}>
            Get Started →
          </button>
        </div>
      </div>
    </div>
  )

  // ── Sign in screen ──────────────────────────────────────────────────────
  return (
    <div className="auth-shell" style={{background:'var(--navy)'}}>
      <div className="auth-card">
        <button onClick={() => setStep('welcome')}
          style={{background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:'.8rem', marginBottom:16, fontFamily:'inherit', padding:0}}>
          ← Back
        </button>
        <p className="eyebrow">The Living Planner</p>
        <h1 style={{marginBottom:6}}>Welcome{isSignup ? '' : ' back'}</h1>
        <p className="muted" style={{marginBottom:16, fontSize:'.85rem'}}>
          {isSignup ? 'Create your account to sync across devices.' : 'Sign in to pick up where you left off.'}
        </p>
        <form className="auth-form" onSubmit={submit}>
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com" required={mode === 'supabase'} />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••" required={mode === 'supabase'} />
          </label>
          {error ? <p className="error-text">{error}</p> : null}
          {message ? <p className="success-text">{message}</p> : null}
          <button className="primary-btn" style={{marginTop:4}} disabled={loading}>
            {loading ? 'Working…' : isSignup ? 'Create Account' : 'Sign In'}
          </button>
          {mode === 'supabase' && (
            <button type="button" className="ghost-btn" onClick={() => setIsSignup(c => !c)}>
              {isSignup ? 'Already have an account? Sign in' : 'Need an account? Sign up'}
            </button>
          )}
          {mode === 'supabase' && !isSignup && (
            <button type="button" onClick={async () => {
              if (!email) { setError('Enter your email above first.'); return }
              setLoading(true); setError('')
              const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin + '/reset-password'
              })
              setLoading(false)
              if (resetError) setError(resetError.message)
              else setMessage('Password reset email sent. Check your inbox.')
            }} style={{background:'none',border:'none',color:'var(--muted)',fontSize:'.8rem',cursor:'pointer',fontFamily:'inherit',padding:'4px 0',textDecoration:'underline'}}>
              Forgot password?
            </button>
          )}
        </form>
      </div>
    </div>
  )
}


// Phone bottom bar. The last slot opens the Menu sheet with every section.
const tabs = [
  { to: '/', label: 'Home', icon: House },
  { to: '/tasks', label: 'Tasks', icon: SquareCheck },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/growth', label: 'Growth', icon: TrendingUp },
]

// Additional routes not in bottom nav
const subRoutes = ['/habits', '/goals', '/finance', '/wellness', '/productivity', '/lifestyle', '/health', '/projects', '/faith']

// Every section of the planner — drives the iPad/desktop side nav and Home's Quick Access.
const NAV_GROUPS = [
  { label: 'Plan', items: [
    { to: '/',          label: 'Home',      icon: House },
    { to: '/tasks',     label: 'Tasks',     icon: SquareCheck },
    { to: '/calendar',  label: 'Calendar',  icon: CalendarDays },
    { to: '/projects',  label: 'Projects',  icon: Folder },
  ]},
  { label: 'Grow', items: [
    { to: '/habits',    label: 'Habits',    icon: Repeat },
    { to: '/goals',     label: 'Goals',     icon: Target },
    { to: '/growth',    label: 'Growth',    icon: TrendingUp },
  ]},
  { label: 'Life', items: [
    { to: '/finance',      label: 'Finance',           icon: Wallet },
    { to: '/wellness',     label: 'Health & Wellness', icon: Leaf, also: ['/health'] },
    { to: '/productivity', label: 'Productivity',      icon: Zap },
    { to: '/lifestyle',    label: 'Lifestyle',         icon: Compass },
    { to: '/faith',        label: 'Faith',             icon: Cross },
  ]},
]
const NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items)

// Planner modes reorder Home around a season's priority. Nothing is hidden,
// and the Life Score is calculated the same way in every mode.
const PLANNER_MODES = [
  { id: 'Balanced',  icon: Compass,    line: 'Everything in its place: today, faith, goals and your score in balance.' },
  { id: 'Execution', icon: Zap,        line: 'Leads with your schedule, anything overdue, and the next step on every project.' },
  { id: 'Wellness',  icon: Leaf,       line: "Leads with today's habits and your body: training, sleep, recovery." },
  { id: 'Growth',    icon: TrendingUp, line: 'Leads with your goals, their next steps, and your weekly review.' },
]
const modeOf = (profile) => PLANNER_MODES.find((m) => m.id === profile?.plannerMode) || PLANNER_MODES[0]

const HOME_ORDER = {
  Balanced:  ['hero', 'focus', 'faith', 'woty', 'metrics', 'quick', 'schedule', 'suggestions', 'overdue', 'goals', 'score', 'execution', 'tomorrow'],
  Execution: ['hero', 'overdue', 'schedule', 'focus', 'nextSteps', 'faith', 'metrics', 'execution', 'tomorrow', 'suggestions', 'goals', 'quick', 'score', 'woty'],
  Wellness:  ['hero', 'body', 'faith', 'focus', 'schedule', 'metrics', 'score', 'suggestions', 'goals', 'quick', 'overdue', 'execution', 'tomorrow', 'woty'],
  Growth:    ['hero', 'woty', 'goals', 'nextSteps', 'review', 'faith', 'focus', 'score', 'metrics', 'schedule', 'overdue', 'quick', 'suggestions', 'execution', 'tomorrow'],
}

function ModeSheet({ open, current, onPick, onClose }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  return (
    <div className={'menu-sheet-root' + (open ? ' open' : '')} aria-hidden={!open}>
      <div className="menu-backdrop" onClick={onClose} />
      <div className="menu-sheet" role="dialog" aria-modal="true" aria-label="Planner mode">
        <div className="menu-grabber" />
        <div className="menu-head">
          <span>Planner mode</span>
          <button className="menu-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <p className="mode-sheet-sub">Changes what Home shows first. Nothing is hidden, and your Life Score is measured the same way.</p>
        <div className="mode-options">
          {PLANNER_MODES.map((m) => {
            const Icon = m.icon
            const active = m.id === current
            return (
              <button key={m.id} className={'mode-option' + (active ? ' active' : '')} onClick={() => onPick(m.id)} aria-pressed={active}>
                <span className="mode-option-icon"><Icon size={20} strokeWidth={1.7} /></span>
                <span className="mode-option-text"><strong>{m.id}</strong><small>{m.line}</small></span>
                {active && <Check size={18} strokeWidth={2.4} className="mode-option-check" />}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
const isNavActive = (item, path) => item.to === '/'
  ? path === '/'
  : path === item.to || path.startsWith(item.to + '/') || (item.also || []).includes(path)

// Phone: every section, one tap from the bottom bar. Swipe down, tap outside or ✕ to close.
function MenuSheet({ open, onClose, onQuickAdd }) {
  const { pathname } = useLocation()
  const sheetRef = React.useRef(null)
  const drag = React.useRef({ y: 0, dy: 0, active: false })

  useEffect(() => { if (open) onClose() }, [pathname]) // close after navigating
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [open])

  const onTouchStart = (e) => {
    if (sheetRef.current && sheetRef.current.scrollTop > 0) return
    drag.current = { y: e.touches[0].clientY, dy: 0, active: true }
    sheetRef.current.style.transition = 'none'
  }
  const onTouchMove = (e) => {
    if (!drag.current.active) return
    const dy = Math.max(0, e.touches[0].clientY - drag.current.y)
    drag.current.dy = dy
    sheetRef.current.style.transform = `translateY(${dy}px)`
  }
  const onTouchEnd = () => {
    if (!drag.current.active) return
    const { dy } = drag.current
    drag.current.active = false
    sheetRef.current.style.transition = ''
    sheetRef.current.style.transform = ''
    if (dy > 90) onClose()
  }

  return (
    <div className={'menu-sheet-root' + (open ? ' open' : '')} aria-hidden={!open}>
      <div className="menu-backdrop" onClick={onClose} />
      <div ref={sheetRef} className="menu-sheet" role="dialog" aria-modal="true" aria-label="All sections"
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
        <div className="menu-grabber" />
        <div className="menu-head">
          <span>Go to</span>
          <button className="menu-close" onClick={onClose} aria-label="Close menu"><X size={18} /></button>
        </div>
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="menu-group">
            <p className="side-group-label">{group.label}</p>
            <div className="menu-grid">
              {group.items.filter((item) => item.to !== '/').map((item) => {   // Home is already in the bottom bar
                const active = isNavActive(item, pathname)
                const Icon = item.icon
                return (
                  <Link key={item.to} to={item.to} onClick={onClose} className={'menu-tile' + (active ? ' active' : '')} aria-current={active ? 'page' : undefined}>
                    <Icon size={22} strokeWidth={active ? 1.9 : 1.6} />
                    <span>{item.label}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
        <div className="menu-foot">
          <Link to="/more" onClick={onClose} className={'menu-foot-link' + (pathname === '/more' ? ' active' : '')}>
            <Ellipsis size={18} /> More &amp; Settings
          </Link>
          <button className="menu-foot-add" onClick={() => { onClose(); onQuickAdd() }}>
            <Plus size={17} strokeWidth={2.2} /> Quick Add
          </button>
        </div>
      </div>
    </div>
  )
}

// Lets any link open a page on a specific tab: /faith?tab=sermons
function useUrlTab(initial) {
  const location = useLocation()
  const urlTab = new URLSearchParams(location.search).get('tab')
  const [tab, setTab] = useState(urlTab || initial)
  useEffect(() => { if (urlTab) setTab(urlTab) }, [urlTab, location.key])
  return [tab, setTab]
}

// ── Search everything ────────────────────────────────────────────────────
// Stored lists that live in page_data / faith_data: [source, key, label, route]
const SEARCH_SOURCES = [
  ['wellness', 'journalEntries', 'Journal', '/wellness?tab=journal'],
  ['wellness', 'appointments', 'Appointment', '/wellness?tab=care'],
  ['wellness', 'labs', 'Lab result', '/wellness?tab=care'],
  ['wellness', 'meds', 'Medication', '/wellness?tab=meds'],
  ['wellness', 'workouts', 'Workout', '/wellness?tab=training'],
  ['wellness', 'books', 'Book', '/growth'],
  ['lifestyle', 'recipes', 'Recipe', '/lifestyle?tab=recipes'],
  ['lifestyle', 'trips', 'Trip', '/lifestyle?tab=trips'],
  ['lifestyle', 'birthdays', 'Birthday', '/lifestyle?tab=birthdays'],
  ['lifestyle', 'gifts', 'Gift idea', '/lifestyle?tab=gifts'],
  ['productivity', 'checklists', 'Checklist', '/productivity?tab=checklists'],
  ['productivity', 'brainDump', 'Brain dump', '/productivity?tab=braindump'],
  ['faith', 'sermons', 'Sermon', '/faith?tab=sermons'],
  ['faith', 'prayers', 'Prayer', '/faith?tab=prayer'],
  ['faith', 'scriptures', 'Scripture', '/faith?tab=scripture'],
  ['faith', 'gratitude', 'Gratitude', '/faith?tab=gratitude'],
]
const LOCAL_PREFIX = { wellness: 'planner.hw.', lifestyle: 'planner.l.', productivity: 'planner.p.', faith: 'planner.faith.' }
const TITLE_FIELDS = ['title', 'name', 'who', 'test', 'reference', 'text', 'request', 'label', 'type', 'verse']
function textOf(v, depth = 0) {
  if (v == null || depth > 3) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number') return ''
  if (Array.isArray(v)) return v.map((x) => textOf(x, depth + 1)).join(' ')
  if (typeof v === 'object') return Object.entries(v).filter(([k]) => !/^(id|date|at|created|updated|done|completed|color)/i.test(k)).map(([, x]) => textOf(x, depth + 1)).join(' ')
  return ''
}
function titleOf(o) {
  if (typeof o === 'string') return o.split('\n')[0].slice(0, 80)
  for (const f of TITLE_FIELDS) if (o && typeof o[f] === 'string' && o[f].trim()) return o[f].trim().slice(0, 80)
  return textOf(o).trim().slice(0, 80)
}
function snippet(hay, q) {
  const i = hay.toLowerCase().indexOf(q)
  if (i < 0) return ''
  const a = Math.max(0, i - 30), b = Math.min(hay.length, i + q.length + 50)
  return (a > 0 ? '…' : '') + hay.slice(a, b).replace(/\s+/g, ' ').trim() + (b < hay.length ? '…' : '')
}

function SearchSheet({ open, onClose, data, onOpenItem }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [stored, setStored] = useState([])
  const inputRef = React.useRef(null)

  // Load the lists that live outside the main tables each time search opens
  useEffect(() => {
    if (!open) return
    setTimeout(() => inputRef.current?.focus(), 80)
    const fromLocal = () => SEARCH_SOURCES.map(([page, key]) => {
      try { const v = localStorage.getItem(LOCAL_PREFIX[page] + key) ?? localStorage.getItem(key); return { page, key, value: v ? JSON.parse(v) : null } } catch { return { page, key, value: null } }
    })
    if (!user || !hasSupabaseEnv) { setStored(fromLocal()); return }
    const pageKeys = SEARCH_SOURCES.filter(([pg]) => pg !== 'faith').map(([, k]) => k)
    const faithKeys = SEARCH_SOURCES.filter(([pg]) => pg === 'faith').map(([, k]) => k)
    Promise.all([
      supabase.from('page_data').select('page,data_key,data_value').eq('user_id', user.id).in('data_key', pageKeys),
      supabase.from('faith_data').select('data_key,data_value').eq('user_id', user.id).in('data_key', faithKeys),
    ]).then(([pd, fd]) => {
      const rows = [
        ...(pd.data || []).map((r) => ({ page: r.page, key: r.data_key, value: r.data_value })),
        ...(fd.data || []).map((r) => ({ page: 'faith', key: r.data_key, value: r.data_value })),
      ]
      setStored(rows.length ? rows : fromLocal())
    }).catch(() => setStored(fromLocal()))
  }, [open, user?.id])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const results = useMemo(() => {
    const query = q.trim().toLowerCase()
    if (query.length < 2) return []
    const out = []
    const add = (group, title, hay, go, sub) => {
      const h = `${title} ${hay}`.toLowerCase()
      if (!h.includes(query)) return
      const inTitle = title.toLowerCase().includes(query)
      out.push({ group, title, sub: inTitle ? (sub || '') : [sub, snippet(hay, query)].filter(Boolean).join(' · '), go, rank: inTitle ? 0 : 1 })
    }
    for (const t of data.tasks || []) add('Tasks', t.title || '', t.notes || '', () => onOpenItem('task', t), [t.date ? shortDate(t.date) : '', t.time ? fmt12(t.time) : '', t.completed ? 'Done' : ''].filter(Boolean).join(' · '))
    for (const e of data.events || []) add('Events', e.title || '', `${e.location || ''} ${e.notes || ''}`, () => onOpenItem('event', e), [e.date ? shortDate(e.date) : '', e.startTime ? fmt12(e.startTime) : '', e.recurrence && e.recurrence !== 'none' ? `↻ ${repeatLabel(e.recurrence)}` : ''].filter(Boolean).join(' · '))
    for (const g of data.goals || []) add('Goals', g.title || '', `${g.why || ''} ${g.description || ''} ${(g.steps || []).map((x) => x.text).join(' ')}`, () => onOpenItem('goal', g), g.category)
    for (const pr of data.projects || []) add('Projects', pr.title || '', `${pr.description || ''} ${(pr.steps || []).map((x) => x.text).join(' ')}`, () => onOpenItem('project', pr), pr.status)
    for (const n of data.notes || []) add('Notes', n.title || titleOf(n.content || ''), n.content || '', () => onOpenItem('note', n))
    for (const h of data.habits || []) add('Habits', h.title || '', '', () => { navigate('/habits'); onClose() })
    for (const src of SEARCH_SOURCES) {
      const [page, key, label, route] = src
      const row = stored.find((r) => r.page === page && r.key === key)
      if (!row || row.value == null) continue
      const go = () => { navigate(route); onClose() }
      if (typeof row.value === 'string') { add(label, label, row.value, go); continue }
      const items = Array.isArray(row.value) ? row.value : Object.values(row.value).flat()
      for (const it of items) if (it) add(label, titleOf(it), textOf(it), go, it.date ? shortDate(it.date) : '')
    }
    return out.sort((a, b) => a.rank - b.rank).slice(0, 60)
  }, [q, data, stored])

  const groups = results.reduce((m, r) => { (m[r.group] = m[r.group] || []).push(r); return m }, {})

  return (
    <div className={'menu-sheet-root' + (open ? ' open' : '')} aria-hidden={!open}>
      <div className="menu-backdrop" onClick={onClose} />
      <div className="menu-sheet search-sheet" role="dialog" aria-modal="true" aria-label="Search">
        <div className="search-bar">
          <Search size={18} />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks, notes, sermons, goals…" aria-label="Search everything" enterKeyHint="search" />
          <button className="menu-close" onClick={() => { setQ(''); onClose() }} aria-label="Close search"><X size={18} /></button>
        </div>
        {q.trim().length < 2 ? (
          <p className="muted search-hint">Search across tasks, events, goals, projects, notes, journal, sermons, prayers, scripture, recipes, trips, birthdays, books and more.</p>
        ) : results.length === 0 ? (
          <p className="muted search-hint">Nothing matches "{q.trim()}".</p>
        ) : Object.entries(groups).map(([g, rows]) => (
          <div key={g} className="search-group">
            <p className="side-group-label">{g}</p>
            {rows.map((r, i) => (
              <button key={g + i} className="search-result" onClick={() => { r.go(); onClose() }}>
                <strong>{r.title || g}</strong>
                {r.sub && <small>{r.sub}</small>}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function SideNav({ onQuickAdd }) {
  const { pathname } = useLocation()
  return (
    <aside className="side-nav" aria-label="Planner sections">
      <button className="side-quick-add" onClick={onQuickAdd}>
        <Plus size={18} strokeWidth={2.2} /> Quick Add
      </button>
      {NAV_GROUPS.map((group) => (
        <div key={group.label} className="side-group">
          <p className="side-group-label">{group.label}</p>
          {group.items.map((item) => {
            const active = isNavActive(item, pathname)
            const Icon = item.icon
            return (
              <Link key={item.to} to={item.to} className={'side-link' + (active ? ' active' : '')} aria-current={active ? 'page' : undefined}>
                <Icon size={18} strokeWidth={active ? 2 : 1.7} />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </div>
      ))}
      <div className="side-group side-foot">
        <Link to="/more" className={'side-link' + (pathname === '/more' ? ' active' : '')} aria-current={pathname === '/more' ? 'page' : undefined}>
          <Ellipsis size={18} strokeWidth={1.7} />
          <span>More &amp; Settings</span>
        </Link>
      </div>
    </aside>
  )
}

function Layout({ children, onQuickAdd, banner, profile, onModeChange, searchData, onOpenItem }) {
  const location = useLocation()
  const displayName = profile?.displayName || 'Planner'
  const { isDesktop, isMobile, isTablet } = useResponsive()
  const showSideNav = !isMobile   // iPad (portrait + landscape) and desktop
  const [menuOpen, setMenuOpen] = useState(false)
  const [modeOpen, setModeOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  useEffect(() => {
    const onKey = (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchOpen(true) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const onTabRoute = tabs.some((t) => t.to === location.pathname)

  // Keep the side nav pinned just below the sticky topbar, whatever its height
  // (it grows with the iOS safe-area inset).
  const topbarRef = React.useRef(null)
  React.useEffect(() => {
    const el = topbarRef.current
    if (!el) return
    const setH = () => document.documentElement.style.setProperty('--topbar-h', el.offsetHeight + 'px')
    setH()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(setH) : null
    ro?.observe(el)
    window.addEventListener('resize', setH)
    return () => { ro?.disconnect(); window.removeEventListener('resize', setH) }
  }, [])

  // ── iOS PWA safe-area fix — keeps topbar below the status bar ────────────
  React.useEffect(() => {
    // 1. Make sure viewport meta allows safe-area insets
    let meta = document.querySelector('meta[name="viewport"]')
    if (meta && !meta.content.includes('viewport-fit=cover')) {
      meta.content = meta.content + ', viewport-fit=cover'
    } else if (!meta) {
      meta = document.createElement('meta')
      meta.name = 'viewport'
      meta.content = 'width=device-width, initial-scale=1, viewport-fit=cover'
      document.head.appendChild(meta)
    }

    // 2. Status bar style for iOS PWA (matches dark topbar)
    let statusBar = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
    if (!statusBar) {
      statusBar = document.createElement('meta')
      statusBar.name = 'apple-mobile-web-app-status-bar-style'
      statusBar.content = 'black-translucent'
      document.head.appendChild(statusBar)
    } else {
      statusBar.content = 'black-translucent'
    }

    // 3. Inject CSS rules for safe-area padding on the topbar + body bg
    if (!document.getElementById('safe-area-styles')) {
      const style = document.createElement('style')
      style.id = 'safe-area-styles'
      style.textContent = `
        body { background: var(--ink, #0d1f33); }
        .topbar, .premium-topbar, .living-planner-topbar {
          padding-top: calc(env(safe-area-inset-top) + 12px) !important;
          padding-left: max(env(safe-area-inset-left), 14px);
          padding-right: max(env(safe-area-inset-right), 14px);
        }
        .auth-shell {
          padding-top: max(env(safe-area-inset-top), 24px) !important;
        }
        .bottom-nav, .mobile-bottom-nav {
          padding-bottom: calc(env(safe-area-inset-bottom) + 6px);
        }
        @supports (-webkit-touch-callout: none) {
          /* iOS-only: extra safety on home indicator area */
          .app-shell { min-height: -webkit-fill-available; }
        }
      `
      document.head.appendChild(style)
    }
  }, [])

  return (
    <div className="app-shell premium-shell living-planner-shell">
      <header ref={topbarRef} className="topbar premium-topbar living-planner-topbar">
        <Link to="/" className="topbar-copy" style={{textDecoration:'none'}}>
          <p className="eyebrow">The Living Planner</p>
          <p style={{color:"rgba(255,255,255,.38)",fontSize:".72rem",marginTop:1}}>{formatDateLabel(TODAY, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        </Link>

        <div className="topbar-actions">
          <button type="button" className="topbar-search" onClick={() => setSearchOpen(true)} aria-label="Search everything"><Search size={19} /></button>
          <button type="button" className="profile-pill" onClick={() => setModeOpen(true)} aria-label={`Planner mode: ${modeOf(profile).id}. Change mode`}>
            <span className="profile-avatar">{displayName.slice(0, 1).toUpperCase()}</span>
            <div style={{display:'flex',flexDirection:'column',gap:1,textAlign:'left'}}>
              <strong style={{lineHeight:1.1}}>{displayName}</strong>
              <span style={{fontSize:'.58rem',opacity:.7}}>{modeOf(profile).id} mode ▾</span>
            </div>
          </button>
        </div>
      </header>

      {banner}

      <div className={(showSideNav ? 'app-frame with-side-nav ' : 'app-frame ') + (isDesktop ? 'desktop-frame' : isMobile ? 'mobile-frame' : 'tablet-frame')}>
        {showSideNav ? <SideNav onQuickAdd={onQuickAdd} /> : null}
        <main className="content">{children}</main>
      </div>

      {!showSideNav ? (
        <nav className="bottom-nav premium-nav">
          {tabs.map((tab) => {
            const active = !menuOpen && location.pathname === tab.to
            const Icon = tab.icon
            return (
              <Link key={tab.to} to={tab.to} className={active ? 'nav-item active' : 'nav-item'} aria-current={active ? 'page' : undefined}>
                <span className="nav-icon"><Icon size={21} strokeWidth={active ? 2 : 1.7} /></span>
                <span className="nav-label">{tab.label}</span>
              </Link>
            )
          })}
          <button type="button" className={menuOpen || !onTabRoute ? 'nav-item active' : 'nav-item'}
            onClick={() => setMenuOpen((v) => !v)} aria-expanded={menuOpen} aria-label="Menu — all sections">
            <span className="nav-icon"><LayoutGrid size={21} strokeWidth={menuOpen || !onTabRoute ? 2 : 1.7} /></span>
            <span className="nav-label">Menu</span>
          </button>
        </nav>
      ) : null}

      <SearchSheet open={searchOpen} onClose={() => setSearchOpen(false)} data={searchData || {}}
        onOpenItem={(type, item) => { setSearchOpen(false); onOpenItem && onOpenItem(type, item) }} />

      <ModeSheet open={modeOpen} current={modeOf(profile).id} onClose={() => setModeOpen(false)}
        onPick={(id) => { setModeOpen(false); if (onModeChange && id !== modeOf(profile).id) onModeChange(id) }} />

      {!showSideNav ? <MenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} onQuickAdd={onQuickAdd} /> : null}

      {!showSideNav ? (
        <button onClick={onQuickAdd} style={{
          position:'fixed', bottom:'calc(env(safe-area-inset-bottom) + 84px)', right:20, zIndex:110,
          width:54, height:54, borderRadius:'50%',
          background:'linear-gradient(160deg, #C9A86B 0%, var(--brass) 50%, var(--brass2) 100%)', color:'#1C1C1E',
          border:'1px solid rgba(255,255,255,.35)',
          cursor:'pointer', display:'grid', placeItems:'center',
          boxShadow:'0 10px 26px rgba(184,150,90,.38), 0 2px 6px rgba(28,28,30,.18)',
          lineHeight:1
        }} aria-label="Quick add"><Plus size={24} strokeWidth={2.2} /></button>
      ) : null}
    </div>
  )
}


function StatusBanner({ syncing, error }) {
  const { mode } = useAuth()
  // Only show when syncing or error — hide idle mock mode noise
  if (!syncing && !error) return null
  return (
    <div style={{
      display:'flex', alignItems:'center', gap:8,
      padding:'6px 16px', fontSize:'.75rem', fontWeight:500,
      background: error ? 'rgba(217,79,61,.08)' : 'rgba(184,150,90,.08)',
      borderBottom: `1px solid ${error ? 'rgba(217,79,61,.15)' : 'rgba(184,150,90,.12)'}`,
      color: error ? 'var(--danger)' : 'var(--brass)'
    }}>
      <span style={{width:6,height:6,borderRadius:'50%',background:error?'var(--danger)':'var(--brass)',flexShrink:0}} />
      <span>{error || (syncing ? 'Syncing…' : '')}</span>
    </div>
  )
}

function ToastStack({ toasts, onDismiss }) {
  if (!toasts.length) return null

  return (
    <div className="toast-stack" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast ${toast.type || 'info'}`}>
          <div>
            <strong>{toast.title}</strong>
            {toast.message ? <p>{toast.message}</p> : null}
          </div>
          <button className="toast-dismiss" onClick={() => onDismiss(toast.id)} aria-label="Dismiss notification">×</button>
        </div>
      ))}
    </div>
  )
}


const baseForms = {
  task: { title: '', date: TODAY, time: '', category: 'Productivity', linkedGoalId: '', linkedProjectId: '', priority: 'Medium', completed: false, recurrence: 'none' },
  event: { title: '', date: TODAY, startTime: '09:00', endTime: '10:00', category: 'Business', location: '', recurrence: 'none', recurrenceUntil: '' },
  expense: { amount: '', category: 'Bills', date: TODAY, note: '' },
  note: { title: '', content: '', linkedType: '', linkedId: '' },
  goal: { title: '', category: 'Health', targetDate: addDays(TODAY, 30), why: '', timeframe: '1yr', steps: [] },
  project: { title: '', goalId: '', dueDate: addDays(TODAY, 45), status: 'Active', description: '', steps: [] },
  habit: { title: '', category: 'Health' },
}

const labels = { task: 'Task', event: 'Event', expense: 'Expense', note: 'Note', goal: 'Goal', project: 'Project', habit: 'Habit' }
const getInitialForm = (type, item) => ({ ...baseForms[type], ...(item || {}) })

function QuickAddModal({ isOpen, type = 'task', mode = 'create', item, onClose, goals, projects, onSave, onDelete }) {
  const [selectedType, setSelectedType] = useState(type)
  const [form, setForm] = useState(getInitialForm(type, item))

  useEffect(() => {
    setSelectedType(type)
    setForm(getInitialForm(type, item))
  }, [type, item, isOpen])

  const title = useMemo(() => `${mode === 'edit' ? 'Edit' : 'Add'} ${labels[selectedType]}`, [mode, selectedType])
  if (!isOpen) return null

  const submit = (e) => {
    e.preventDefault()
    onSave(selectedType, { ...form, id: item?.id }, mode)
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-handle" />
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18}}>
          <h2 className="modal-title" style={{margin:0}}>{title}</h2>
          <button onClick={onClose} style={{
            background:'var(--stone2)', border:'1.5px solid var(--border2)',
            borderRadius:'50%', width:32, height:32,
            display:'grid', placeItems:'center',
            cursor:'pointer', color:'var(--ink)', fontSize:'1rem', fontWeight:700,
            flexShrink:0
          }}>✕</button>
        </div>
        <div className="pill-row modal-tabs">
          {Object.keys(labels).map((option) => (
            <button key={option} className={selectedType === option ? 'pill active-pill' : 'pill'} onClick={() => mode === 'create' && (setSelectedType(option), setForm(getInitialForm(option, null)))} type="button" disabled={mode !== 'create'}>{labels[option]}</button>
          ))}
        </div>
        <form className="form-grid" onSubmit={submit}>
          {selectedType !== 'expense' && (
            <label className={selectedType === 'note' ? 'full-span' : ''}>
              Title
              <input value={form.title || ''} onChange={(e) => setForm({ ...form, title: e.target.value })} required={selectedType !== 'expense'} />
            </label>
          )}

          {selectedType === 'task' && (<>
            <label>Date<input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
            <label>Time<input type="time" value={form.time || ''} onChange={(e) => setForm({ ...form, time: e.target.value })} /></label>
            <label>Category<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
            <label>Priority<select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}><option>High</option><option>Medium</option><option>Low</option></select></label>
            <label>Repeats<select value={form.recurrence || 'none'} onChange={(e) => setForm({ ...form, recurrence: e.target.value })}><option value="none">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label>
            <label>Goal<select value={form.linkedGoalId || ''} onChange={(e) => setForm({ ...form, linkedGoalId: e.target.value })}><option value="">None</option>{goals.map((goal) => <option key={goal.id} value={goal.id}>{goal.title}</option>)}</select></label>
            <label className="full-span">Project<select value={form.linkedProjectId || ''} onChange={(e) => setForm({ ...form, linkedProjectId: e.target.value })}><option value="">None</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select></label>
          </>)}

          {selectedType === 'event' && (<>
            <label>Date<input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
            <label>Start<input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} /></label>
            <label>End<input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} /></label>
            <label>Category<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
            <label className="full-span">Location<input value={form.location || ''} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Optional" /></label>
            <label>Repeats<select value={form.recurrence || 'none'} onChange={(e) => setForm({ ...form, recurrence: e.target.value })}>{EVENT_REPEATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
            {(form.recurrence || 'none') !== 'none' && (
              <label>Until (optional)<input type="date" value={form.recurrenceUntil || ''} min={form.date} onChange={(e) => setForm({ ...form, recurrenceUntil: e.target.value })} /></label>
            )}
            {mode === 'edit' && (form.recurrence || 'none') !== 'none' && (
              <p className="full-span muted" style={{ fontSize: '.76rem', margin: 0 }}>Changes apply to every occurrence. To remove a single date, use ✕ on that day in the calendar.</p>
            )}
          </>)}

          {selectedType === 'expense' && (<>
            <label>Amount<input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required /></label>
            <label>Category<input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></label>
            <label>Date<input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
            <label className="full-span">Note<input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
          </>)}

          {selectedType === 'note' && (<>
            <label>Linked Type<select value={form.linkedType || ''} onChange={(e) => setForm({ ...form, linkedType: e.target.value, linkedId: '' })}><option value="">None</option><option value="goal">Goal</option><option value="project">Project</option></select></label>
            <label>Linked Item<select value={form.linkedId || ''} onChange={(e) => setForm({ ...form, linkedId: e.target.value })}><option value="">None</option>{(form.linkedType === 'goal' ? goals : form.linkedType === 'project' ? projects : []).map((entry) => <option key={entry.id} value={entry.id}>{entry.title}</option>)}</select></label>
            <label className="full-span">Content<textarea rows="6" value={form.content || ''} onChange={(e) => setForm({ ...form, content: e.target.value })} /></label>
          </>)}

          {selectedType === 'goal' && (<>
            <label className="full-span">Timeframe<select value={form.timeframe||'1yr'} onChange={(e) => setForm({...form,timeframe:e.target.value})} style={{padding:'9px 10px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.9rem',background:'var(--stone)',color:'var(--text)'}}><option value='1wk'>1 Week</option><option value='1mo'>1 Month</option><option value='6mo'>6 Months</option><option value='1yr'>1 Year</option><option value='3yr'>3 Years</option><option value='5yr'>5 Years</option></select></label>
            <label>Category<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
            <label>Target Date<input type="date" value={form.targetDate} onChange={(e) => setForm({ ...form, targetDate: e.target.value })} /></label>
            <label className="full-span">Why<textarea rows="4" value={form.why || ''} onChange={(e) => setForm({ ...form, why: e.target.value })} /></label>
            <div className="full-span"><StepsChecklist steps={form.steps} onChange={(steps) => setForm((f) => ({ ...f, steps }))} hint="Type a step and press Return. Paste a list to add several." /></div>
          </>)}

          {selectedType === 'project' && (<>
            <label>Goal<select value={form.goalId || ''} onChange={(e) => setForm({ ...form, goalId: e.target.value })}><option value="">None</option>{goals.map((goal) => <option key={goal.id} value={goal.id}>{goal.title}</option>)}</select></label>
            <label>Due Date<input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></label>
            <label>Status<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option>Active</option><option>In Progress</option><option>On Hold</option><option>Completed</option></select></label>
            <label className="full-span">Description<textarea rows="4" value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
            <div className="full-span"><StepsChecklist steps={form.steps} onChange={(steps) => setForm((f) => ({ ...f, steps }))} hint="Type a step and press Return. Paste a list to add several." /></div>
          </>)}

          {selectedType === 'habit' && <label>Category<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>}

          <div className="full-span modal-actions">
            {mode === 'edit' && item?.id ? <button className="danger-btn" type="button" onClick={() => { onDelete(selectedType, item.id); onClose() }}>Delete</button> : <span />}
            <button className="primary-btn" type="submit">{mode === 'edit' ? 'Save Changes' : `Save ${labels[selectedType]}`}</button>
          </div>
        </form>
      </div>
    </div>
  )
}



function MetricTile({ label, value, helper }) {
  return (
    <div className="home-metric-tile">
      <span>{label}</span>
      <strong>{value}</strong>
      {helper ? <small>{helper}</small> : null}
    </div>
  )
}

function MiniBarChart({ data, dataKey = 'completed', maxKey = dataKey }) {
  const max = Math.max(...data.map((item) => item[maxKey] || 0), 1)
  return (
    <div style={{display:'flex', alignItems:'flex-end', gap:6, height:64, padding:'0 4px'}}>
      {data.map((item) => {
        const val = item[dataKey] || 0
        const total = item[maxKey] || 0
        const pct = max > 0 ? Math.max((val / max) * 100, total > 0 ? 8 : 0) : 0
        return (
          <div key={item.label} style={{flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4, height:'100%', justifyContent:'flex-end'}}>
            <div style={{fontSize:'.65rem', color:'var(--brass)', fontWeight:700}}>{val > 0 ? val : ''}</div>
            <div style={{
              width:'100%', borderRadius:'4px 4px 0 0',
              height: total === 0 ? 4 : `${pct}%`,
              background: val >= total && total > 0 ? 'var(--brass)' : val > 0 ? 'var(--brass-glow)' : 'var(--stone2)',
              border: '1px solid var(--brass-glow)',
              minHeight: 4, transition:'height .3s ease'
            }} />
            <div style={{fontSize:'.58rem', color:'var(--slate)', fontWeight:600, textAlign:'center'}}>{item.label}</div>
          </div>
        )
      })}
    </div>
  )
}
function MiniLineChart({ data }) {
  const width = 240; const height = 80
  const values = data.map((item) => item.value)
  const max = Math.max(...values, 1); const min = Math.min(...values, 0)
  const points = data.map((item, index) => {
    const x = (index / Math.max(data.length - 1, 1)) * width
    const y = height - (((item.value - min) / Math.max(max - min, 1)) * (height - 12)) - 6
    return `${x},${y}`
  }).join(' ')
  return (
    <div className="mini-line-chart">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <polyline fill="none" stroke="currentColor" strokeWidth="3" points={points} />
      </svg>
      <div className="chart-xlabels">{data.map((item) => <span key={item.label}>{item.label}</span>)}</div>
    </div>
  )
}


function HomePage({ tasks, goals, projects, expenses, scores, budget, events, habits, habitLogs, settings, profile, onEdit, onQuickCreate, onToggle, onToggleHabit, onSaveSteps }) {
  const navigate = useNavigate()
  const todayTasks = tasks.filter((task) => isToday(task.date) && (settings.showCompletedTasks || !task.completed))
  const openTasks = tasks.filter(t => !t.completed)
  const overdueTasks = tasks.filter((task) => !task.completed && isOverdue(task.date))
  const weekSpend = expenses.filter(e => !['Bills','Utilities','Rent','Insurance'].includes(e.category))
    .reduce((sum, item) => sum + Number(item.amount), 0)
  const todaySchedule = [
    ...todayTasks.filter((task) => task.time).map((task) => ({ ...task, startTime: task.time, itemType: 'task' })),
    ...expandEvents(events, TODAY, TODAY).map((event) => ({ ...event, itemType: 'event' })),
  ].sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''))
  const insights = getHomeInsights({ tasks, expenses, budget, projects, goals, events, habits, habitLogs })
  const suggestions = getSmartSuggestions({ tasks, expenses, budget, projects, habits, habitLogs })
  const completionSeries = getWeekCompletionSeries(tasks)

  const rawFirst = (profile?.displayName || '').trim().split(' ')[0]
  const firstName = rawFirst && rawFirst.toLowerCase() !== 'planner' ? rawFirst : ''
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const focusCopy = openTasks.filter(t => isToday(t.date) && !t.completed).slice(0, 2).map(t => t.title)
  const topGoals = goals.filter((g) => !g.completed).slice(0, 3)

  const SECTIONS = [
    ...NAV_ITEMS.filter((n) => n.to !== '/').map((n) => ({
      ...n,
      count: n.to === '/tasks' ? (openTasks.length || null)
        : n.to === '/calendar' ? (todaySchedule.length || null)
        : n.to === '/projects' ? (projects.filter((p) => p.status !== 'Completed').length || null)
        : n.to === '/habits' ? (habits.length || null)
        : n.to === '/goals' ? (goals.filter((g) => !g.completed).length || null)
        : null,
    })),
  ]

  const B_hero = (
    <>
      {/* ── Personal greeting hero ─────────────────────────────────── */}
      <div className="hero-focus-card">
        <p className="eyebrow">{new Date().toLocaleDateString('en-US', {weekday:'long', month:'long', day:'numeric'})}</p>
        <h2 style={{fontSize:'1.5rem', marginBottom:6}}>{greeting}{firstName ? `, ${firstName}` : '.'}</h2>
        <p className="muted" style={{fontSize:'.9rem', lineHeight:1.5}}>
          {focusCopy.length > 0
            ? `Today: ${focusCopy.join(' · ')}`
            : overdueTasks.length > 0
            ? `You have ${overdueTasks.length} overdue item${overdueTasks.length > 1 ? 's' : ''} waiting.`
            : 'A clear day. What will you make of it?'}
        </p>
        <div className="hero-focus-actions" style={{marginTop:14}}>
          <button style={{fontSize:'.82rem', padding:'8px 16px', borderRadius:999, background:'rgba(184,150,90,.18)', color:'var(--brass)', border:'1px solid rgba(184,150,90,.35)', fontWeight:600, cursor:'pointer'}} onClick={() => onQuickCreate('task', { date: TODAY })}>+ Task</button>
          <button style={{fontSize:'.82rem', padding:'8px 16px', borderRadius:999, background:'rgba(184,150,90,.18)', color:'var(--brass)', border:'1px solid rgba(184,150,90,.35)', fontWeight:600, cursor:'pointer'}} onClick={() => onQuickCreate('event', { date: TODAY })}>+ Event</button>
          <Link to="/calendar" style={{fontSize:'.82rem', padding:'8px 16px', borderRadius:999, background:'rgba(184,150,90,.18)', color:'var(--brass)', border:'1px solid rgba(184,150,90,.35)', fontWeight:600, textDecoration:'none', display:'inline-block'}}>Day View</Link>
        </div>
        {/* Overall score pill */}
        {(() => {
          const avg = scores ? Math.round(Object.values(scores).reduce((s,v)=>s+v,0) / Object.keys(scores).length) : null
          if (!avg) return null
          return (
            <div style={{marginTop:12,display:'flex',alignItems:'center',gap:8}}>
              <div style={{
                padding:'5px 12px',borderRadius:999,
                background: avg >= 7 ? 'rgba(52,168,83,.2)' : avg >= 5 ? 'rgba(42,157,143,.2)' : 'rgba(184,150,90,.2)',
                border: `1px solid ${avg >= 7 ? 'rgba(52,168,83,.35)' : avg >= 5 ? 'rgba(42,157,143,.35)' : 'rgba(184,150,90,.35)'}`,
                display:'flex',alignItems:'center',gap:6,
              }}>
                <span style={{fontSize:'.7rem',color: avg >= 7 ? '#4ade80' : avg >= 5 ? 'var(--teal)' : 'var(--brass)',fontWeight:700}}>Life Score</span>
                <span style={{fontSize:'.85rem',fontWeight:800,color:'white'}}>{avg}/10</span>
              </div>
              <span style={{fontSize:'.72rem',color:'rgba(255,255,255,.35)'}}>
                {avg >= 8 ? 'Thriving ✦' : avg >= 6 ? 'On track' : avg >= 4 ? 'Needs attention' : 'Time to reset'}
              </span>
            </div>
          )
        })()}
      </div>
    </>
  )

  const B_woty = (
    <>
      {/* ── Word of the Year ──────────────────────────────── */}
      {/* ── Word of the Year ──────────────────────────────── */}
      {(() => {
        const [woty, setWoty] = React.useState(() => { try { return localStorage.getItem('planner_word_of_year') || '' } catch { return '' } })
        const [editing, setEditing] = React.useState(false)
        const [draft, setDraft] = React.useState(woty)
        const save = () => {
          try { localStorage.setItem('planner_word_of_year', draft) } catch {}
          setWoty(draft); setEditing(false)
        }
        return (
          <section className="card" style={{padding:'14px 16px',marginBottom:12}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}>
              <div style={{flex:1,minWidth:0}}>
                <p style={{fontSize:'.62rem',fontWeight:700,letterSpacing:'.1em',color:'var(--brass)',textTransform:'uppercase',margin:'0 0 4px'}}>Word of the Year</p>
                {editing ? (
                  <div style={{display:'flex',gap:8,alignItems:'center'}}>
                    <input autoFocus value={draft} onChange={e=>setDraft(e.target.value)}
                      onKeyDown={e=>{if(e.key==='Enter')save();if(e.key==='Escape')setEditing(false)}}
                      placeholder={`Your word for ${new Date().getFullYear()}...`}
                      style={{flex:1,padding:'6px 10px',border:'1.5px solid var(--brass)',borderRadius:8,fontSize:'1rem',fontFamily:'var(--serif)',fontStyle:'italic',background:'var(--stone)'}} />
                    <button onClick={save} style={{padding:'6px 14px',borderRadius:999,background:'var(--brass)',color:'white',border:'none',fontSize:'.78rem',fontWeight:700,cursor:'pointer'}}>Save</button>
                    <button onClick={()=>setEditing(false)} style={{padding:'6px 10px',borderRadius:999,background:'transparent',border:'1px solid var(--border2)',fontSize:'.78rem',cursor:'pointer'}}>✕</button>
                  </div>
                ) : woty ? (
                  <h2 onClick={()=>{setDraft(woty);setEditing(true)}} style={{margin:0,fontFamily:'var(--serif)',fontSize:'1.8rem',fontWeight:400,color:'var(--ink)',letterSpacing:'-.01em',fontStyle:'italic',cursor:'pointer'}}>{woty}</h2>
                ) : (
                  <p style={{margin:0,fontSize:'.85rem',color:'var(--ink2)',fontStyle:'italic'}}>What single word will guide your year?</p>
                )}
              </div>
              {!editing && (
                <button onClick={()=>{setDraft(woty);setEditing(true)}} style={{
                  padding:'6px 14px',borderRadius:999,background:'transparent',
                  color:'var(--brass)',border:'1px solid var(--brass)',
                  fontSize:'.74rem',fontWeight:600,cursor:'pointer',flexShrink:0,
                }}>{woty ? 'Edit' : 'Set'}</button>
              )}
            </div>
          </section>
        )
      })()}
    </>
  )

  const B_focus = (
    <>
      {/* ── Today's Focus 3 — top priorities ─────────────────────── */}
      <section className="card" style={{background:'linear-gradient(135deg, #1A2332 0%, #0B1829 100%)', color:'#FAF8F4', border:'none'}}>
        <p className="eyebrow" style={{color:'rgba(255,255,255,.6)'}}>Today's Focus</p>
        <h3 style={{margin:'2px 0 8px', color:'white', fontSize:'.85rem'}}>Three things that matter today</h3>

        {(() => {
          // Pick top task: priority high, due today/overdue, not completed
          const topTask = tasks
            .filter(t => !t.completed)
            .sort((a, b) => {
              const aP = (a.priority?.toLowerCase() === 'high' ? 3 : a.priority?.toLowerCase() === 'medium' ? 2 : 1)
              const bP = (b.priority?.toLowerCase() === 'high' ? 3 : b.priority?.toLowerCase() === 'medium' ? 2 : 1)
              const aOver = isOverdue(a.date) ? 10 : isToday(a.date) ? 5 : 0
              const bOver = isOverdue(b.date) ? 10 : isToday(b.date) ? 5 : 0
              return (bP + bOver) - (aP + aOver)
            })[0]

          // Pick top habit: not completed today
          const todayHabitLogs = habitLogs.filter(l => l.date === getTodayString() && l.completed)
          const completedHabitIds = todayHabitLogs.map(l => l.habitId)
          const topHabit = habits.find(h => !completedHabitIds.includes(h.id))

          // Get today's intention from settings or first goal
          const topGoal = goals.find(g => !g.completed)

          return (
            <div style={{display:'grid', gap:6}}>
              {/* Focus 1: Top Task */}
              {topTask ? (
                <div style={{
                  background:'rgba(255,255,255,.08)', padding:'7px 10px',
                  borderRadius:9, display:'flex', alignItems:'center', gap:9,
                  border:'1px solid rgba(255,255,255,.1)',
                }}>
                  <button onClick={(e) => { e.stopPropagation(); onToggle && onToggle(topTask.id) }} style={{
                    width:18, height:18, borderRadius:'50%',
                    border:'2px solid var(--teal)', background:'transparent',
                    cursor:'pointer', flexShrink:0, padding:0,
                  }} aria-label="Mark task complete" />
                  <div style={{flex:1, minWidth:0, cursor:'pointer'}}
                    onClick={() => onEdit('task', topTask)}>
                    <div style={{fontSize:'.58rem', color:'var(--teal)', fontWeight:700, letterSpacing:'.05em'}}>TOP TASK · TAP CIRCLE</div>
                    <div style={{fontWeight:600, fontSize:'.8rem', marginTop:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
                      {topTask.title}
                    </div>
                  </div>
                </div>
              ) : (
                <Link to="/tasks" style={{
                  background:'rgba(255,255,255,.05)', padding:'7px 10px',
                  borderRadius:9, display:'flex', alignItems:'center', gap:9,
                  border:'1px dashed rgba(255,255,255,.2)', textDecoration:'none', color:'white',
                }}>
                  <div style={{fontSize:'1rem', opacity:.5}}>✓</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:'.58rem', color:'rgba(255,255,255,.5)', fontWeight:700, letterSpacing:'.05em'}}>TOP TASK</div>
                    <div style={{fontSize:'.78rem', marginTop:1, color:'rgba(255,255,255,.7)'}}>A blank page awaits — add your first</div>
                  </div>
                </Link>
              )}

              {/* Focus 2: Top Habit */}
              {topHabit ? (
                <div style={{
                  background:'rgba(255,255,255,.08)', padding:'7px 10px',
                  borderRadius:9, display:'flex', alignItems:'center', gap:9,
                  border:'1px solid rgba(255,255,255,.1)',
                }}>
                  <button onClick={(e) => { e.stopPropagation(); onToggleHabit && onToggleHabit(topHabit.id) }} style={{
                    width:18, height:18, borderRadius:'50%',
                    border:'2px solid var(--brass)', background:'transparent',
                    cursor:'pointer', flexShrink:0, padding:0,
                  }} aria-label="Mark habit complete" />
                  <Link to="/habits" style={{flex:1, minWidth:0, textDecoration:'none', color:'inherit'}}>
                    <div style={{fontSize:'.58rem', color:'var(--brass)', fontWeight:700, letterSpacing:'.05em'}}>TOP HABIT · TAP CIRCLE</div>
                    <div style={{fontWeight:600, fontSize:'.8rem', marginTop:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
                      {topHabit.title}
                    </div>
                  </Link>
                </div>
              ) : habits.length > 0 ? (
                <div style={{
                  background:'rgba(34,197,94,.15)', padding:'7px 10px',
                  borderRadius:9, display:'flex', alignItems:'center', gap:9,
                  border:'1px solid rgba(34,197,94,.3)',
                }}>
                  <div style={{fontSize:'1rem'}}>✓</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:'.58rem', color:'var(--success)', fontWeight:700, letterSpacing:'.05em'}}>HABITS COMPLETE</div>
                    <div style={{fontSize:'.78rem', marginTop:1}}>All habits checked off for today 🔥</div>
                  </div>
                </div>
              ) : (
                <Link to="/habits" style={{
                  background:'rgba(255,255,255,.05)', padding:'7px 10px',
                  borderRadius:9, display:'flex', alignItems:'center', gap:9,
                  border:'1px dashed rgba(255,255,255,.2)', textDecoration:'none', color:'white',
                }}>
                  <div style={{display:'grid', opacity:.6}}><Repeat size={16} strokeWidth={1.8} color="var(--brass)" /></div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:'.58rem', color:'rgba(255,255,255,.5)', fontWeight:700, letterSpacing:'.05em'}}>TOP HABIT</div>
                    <div style={{fontSize:'.78rem', marginTop:1, color:'rgba(255,255,255,.7)'}}>Build your first habit</div>
                  </div>
                </Link>
              )}

              {/* Focus 3: Top Goal */}
              {topGoal ? (
                <Link to="/goals" style={{
                  background:'rgba(255,255,255,.08)', padding:'7px 10px',
                  borderRadius:9, display:'flex', alignItems:'center', gap:9,
                  border:'1px solid rgba(255,255,255,.1)',
                  textDecoration:'none', color:'white',
                }}>
                  <div style={{display:'grid'}}><Target size={16} strokeWidth={1.8} color="var(--brass)" /></div>
                  <div style={{flex:1, minWidth:0}}>
                    <div style={{fontSize:'.58rem', color:'#FFB84D', fontWeight:700, letterSpacing:'.05em'}}>CURRENT GOAL</div>
                    <div style={{fontWeight:600, fontSize:'.8rem', marginTop:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
                      {topGoal.title}
                    </div>
                    {nextStepFor(topGoal, projects) && (
                      <div style={{fontSize:'.7rem', color:'rgba(255,255,255,.62)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
                        Next: {nextStepFor(topGoal, projects)}
                      </div>
                    )}
                  </div>
                </Link>
              ) : (
                <Link to="/goals" style={{
                  background:'rgba(255,255,255,.05)', padding:'7px 10px',
                  borderRadius:9, display:'flex', alignItems:'center', gap:9,
                  border:'1px dashed rgba(255,255,255,.2)', textDecoration:'none', color:'white',
                }}>
                  <div style={{display:'grid', opacity:.6}}><Target size={16} strokeWidth={1.8} color="var(--brass)" /></div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:'.58rem', color:'rgba(255,255,255,.5)', fontWeight:700, letterSpacing:'.05em'}}>CURRENT GOAL</div>
                    <div style={{fontSize:'.78rem', marginTop:1, color:'rgba(255,255,255,.7)'}}>Set a goal to aim toward</div>
                  </div>
                </Link>
              )}
            </div>
          )
        })()}
      </section>
    </>
  )

  const B_metrics = (
    <>
      {/* ── 4 key metrics ─────────────────────────────────────────── */}
      <div className="home-metrics-strip">
        <MetricTile label="Tasks Open" value={insights.openTasks} helper={overdueTasks.length > 0 ? `${overdueTasks.length} overdue` : '✓ on track'} />
        <MetricTile label="Week Done" value={`${insights.completionRate}%`} helper="completion" />
        <MetricTile label="Budget Left" value={`$${Math.max(0, budget.weeklyTarget - weekSpend).toFixed(0)}`} helper="this week" />
        <MetricTile label="Streak" value={`${insights.currentHabitStreak}d`} helper={`${insights.habitCount} habits`} />
      </div>
    </>
  )

  const B_quick = (
    <>
      {/* ── Quick access to all sections ──────────────────────────── */}
      <section className="card">
        <div className="section-title-row" style={{marginBottom:12}}>
          <div><p className="eyebrow">Your Planner</p><h3>Quick Access</h3></div>
        </div>
        <div className="home-quick-grid">
          {SECTIONS.map(s => (
            <Link key={s.to} to={s.to} className="home-quick-tile">
              {s.count > 0 && <span className="home-quick-count">{s.count}</span>}
              <s.icon size={20} strokeWidth={1.6} color="var(--brass2)" />
              <span className="home-quick-label">{s.label}</span>
            </Link>
          ))}
        </div>
      </section>
    </>
  )

  const B_schedule = (
    <>
      {/* ── Today's schedule ──────────────────────────────────────── */}
      <section className="card">
        <div className="section-title-row">
          <div><p className="eyebrow">Today Timeline</p><h3>What's on the clock</h3></div>
          <button className="ghost-btn" style={{fontSize:'.8rem'}} onClick={() => onQuickCreate('task', { date: TODAY })}>+ Task</button>
        </div>
        {todaySchedule.length === 0
          ? <p className="muted" style={{fontSize:'.85rem'}}>Nothing scheduled yet today. <button onClick={() => onQuickCreate('task', { date: TODAY })} style={{background:'none', border:'none', color:'var(--teal)', cursor:'pointer', fontFamily:'inherit', fontWeight:600, padding:0}}>Add a task →</button></p>
          : todaySchedule.slice(0, 6).map((item) => (
            <button key={`${item.itemType}-${item.id}`} className="timeline-preview premium-list-row" onClick={() => onEdit(item.itemType, item.isRepeat ? (events.find((e) => e.id === item.id) || item) : item)}
              style={{width:'100%', borderBottom:'1px solid var(--surface)', padding:'9px 0'}}>
              <strong style={{color:'var(--brass2)', fontSize:'.8rem', minWidth:62, fontWeight:600}}>{fmt12(item.startTime)}</strong>
              <span style={{flex:1, textAlign:'left', fontSize:'.9rem', color:'var(--text)', fontWeight:500}}>{item.title}</span>
              <small style={{color:'var(--muted)', fontSize:'.72rem'}}>{item.itemType === 'task' ? 'Task' : 'Event'}</small>
            </button>
          ))}
      </section>
    </>
  )

  const B_suggestions = (
    <>
      {/* ── Smart suggestions ─────────────────────────────────────── */}
      {suggestions.length > 0 && (
        <section className="card">
          <div className="section-title-row" style={{marginBottom:10}}>
            <div><p className="eyebrow">Smart Suggestions</p><h3>What to do next</h3></div>
          </div>
          <div className="suggestion-stack">
            {suggestions.slice(0,3).map((s) => (
              <button key={s.title} className={`suggestion-card tone-${s.tone}`} onClick={() => navigate(s.route)}>
                <strong>{s.title}</strong>
                <span>{s.body}</span>
                <small>{s.actionLabel} →</small>
              </button>
            ))}
          </div>
        </section>
      )}
    </>
  )

  const B_overdue = (
    <>
      {/* ── Overdue watchlist ─────────────────────────────────────── */}
      {overdueTasks.length > 0 && (
        <section className="card" style={{borderLeft:'3px solid var(--danger)', background:'rgba(217,79,61,.03)'}}>
          <div className="section-title-row">
            <div><p className="eyebrow" style={{color:'var(--danger)'}}>Needs Attention</p><h3>Overdue</h3></div>
            <span className="status-pill alert-pill">{overdueTasks.length}</span>
          </div>
          {overdueTasks.slice(0,4).map((task) => (
            <button key={task.id} onClick={() => onEdit('task', task)}
              style={{width:'100%', display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid var(--surface)', background:'none', cursor:'pointer', textAlign:'left'}}>
              <span style={{fontSize:'.9rem', color:'var(--text)', fontWeight:500}}>{task.title}</span>
              <span style={{fontSize:'.75rem', color:'var(--danger)', fontWeight:600, flexShrink:0}}>{task.date}</span>
            </button>
          ))}
        </section>
      )}
    </>
  )

  const B_goals = (
    <>
      {/* ── Top goals ─────────────────────────────────────────────── */}
      {topGoals.length > 0 && (
        <section className="card">
          <div className="section-title-row">
            <div><p className="eyebrow">Goals</p><h3>In Progress</h3></div>
            <Link className="ghost-btn" to="/goals" style={{fontSize:'.8rem'}}>All →</Link>
          </div>
          {topGoals.map((goal) => {
            const pct = getGoalProgress(goal, tasks, projects)
            const next = nextStepFor(goal, projects)
            return (
              <Link key={goal.id} to="/goals" className="progress-block" style={{display:'block', textDecoration:'none', color:'inherit'}}>
                <div className="metric-row compact-row" style={{padding:'5px 0'}}>
                  <span style={{fontSize:'.9rem', color:'var(--text)', fontWeight:500}}>{goal.title}</span>
                  <strong style={{color:'var(--brass)', fontSize:'.88rem'}}>{pct}%</strong>
                </div>
                <div className="mini-progress"><div style={{ width: `${pct}%` }} /></div>
                {next && <div className="home-next-step"><span>Next</span>{next}</div>}
              </Link>
            )
          })}
        </section>
      )}
    </>
  )

  const B_score = (
    <>
      {/* ── Life score strip ──────────────────────────────────────── */}
      <section className="card">
        <div className="section-title-row" style={{marginBottom:10}}>
          <div><p className="eyebrow">Life Balance</p><h3>Score snapshot</h3></div>
          <Link className="ghost-btn" to="/growth" style={{fontSize:'.8rem'}}>Details →</Link>
        </div>
        <div style={{display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:6}}>
          {Object.entries(scores).map(([key, value]) => (
            <div key={key} style={{textAlign:'center', padding:'8px 4px', background:'var(--surface)', borderRadius:'var(--radius-sm)'}}>
              <div style={{fontSize:'.65rem', color:'var(--muted)', marginBottom:3, textTransform:'uppercase', letterSpacing:'.05em'}}>{key.slice(0,4)}</div>
              <div style={{fontSize:'1.1rem', fontWeight:700, color: value >= 8 ? 'var(--success)' : value >= 6 ? 'var(--teal)' : value >= 4 ? 'var(--warning)' : 'var(--danger)'}}>{value}</div>
              <div style={{height:3, borderRadius:999, background:'var(--border2)', marginTop:4, overflow:'hidden'}}>
                <div style={{height:'100%', width:`${value*10}%`, background: value >= 8 ? 'var(--success)' : value >= 6 ? 'var(--teal)' : value >= 4 ? 'var(--warning)' : 'var(--danger)', borderRadius:999}} />
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  )

  const B_execution = (
    <>
      {/* ── Weekly execution chart ────────────────────────────────── */}
      <section className="card">
        <div className="section-title-row" style={{marginBottom:8}}>
          <div><p className="eyebrow">This Week</p><h3>Execution</h3></div>
        </div>
        <MiniBarChart data={completionSeries} dataKey="completed" maxKey="total" />
      </section>
    </>
  )

  const B_tomorrow = (
    <>
      {/* ── Tomorrow's Top 3 (evening prompt) ──────────────────────────── */}
      {(() => {
        const hour = new Date().getHours()
        if (hour < 18) return null  // Only show evening (6pm+)
        const stored = (typeof window !== 'undefined' && localStorage.getItem('planner_tomorrow_top3'))
        const top3 = stored ? JSON.parse(stored) : { date: '', items: ['','',''] }
        const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0,10)
        // Reset if it's for a different tomorrow
        const items = top3.date === tomorrow ? top3.items : ['','','']
        return (
          <section className="card" style={{
            background:'linear-gradient(135deg, rgba(184,150,90,.08) 0%, rgba(42,140,140,.05) 100%)',
            border:'1.5px solid rgba(184,150,90,.2)',
            padding:'16px 18px',
          }}>
            <p style={{fontSize:'.62rem',fontWeight:700,letterSpacing:'.1em',color:'var(--brass)',textTransform:'uppercase',margin:'0 0 4px'}}>Plan Tomorrow</p>
            <h3 style={{margin:'0 0 4px',fontSize:'1rem',color:'var(--ink)'}}>Your Top 3</h3>
            <p className="muted" style={{fontSize:'.8rem',marginBottom:12,fontStyle:'italic'}}>
              "He who fails to plan is planning to fail." — Set the night before. Rise focused.
            </p>
            {[0,1,2].map(i => (
              <div key={i} style={{display:'flex',alignItems:'center',gap:10,marginBottom:8}}>
                <span style={{
                  width:24,height:24,borderRadius:'50%',background:'var(--brass)',
                  color:'white',display:'flex',alignItems:'center',justifyContent:'center',
                  fontSize:'.75rem',fontWeight:700,flexShrink:0,
                }}>{i+1}</span>
                <input
                  placeholder={`Priority ${i+1}...`}
                  defaultValue={items[i]}
                  onBlur={e => {
                    const updated = [...items]
                    updated[i] = e.target.value
                    try { localStorage.setItem('planner_tomorrow_top3', JSON.stringify({date: tomorrow, items: updated})) } catch {}
                  }}
                  style={{flex:1,padding:'8px 12px',border:'1px solid var(--border2)',borderRadius:8,fontSize:'.88rem',background:'white'}}
                />
              </div>
            ))}
          </section>
        )
      })()}
    </>
  )

  // ── Mode cards ─────────────────────────────────────────────────────────
  const mode = modeOf(profile)
  const vod = getVerseOfDay()
  const B_faith = (
    <Link to="/faith" className="card home-faith-card">
      <div className="home-faith-icon"><Cross size={16} strokeWidth={1.8} /></div>
      <div style={{flex:1, minWidth:0}}>
        <p className="eyebrow" style={{margin:'0 0 4px'}}>Today's Word</p>
        <p className="home-faith-verse">"{vod.v}"</p>
        <p className="home-faith-ref">{vod.r}</p>
      </div>
    </Link>
  )

  const stepRows = [
    ...projects.filter((p) => p.status !== 'Completed').map((p) => ({ type: 'project', item: p, step: normalizeSteps(p.steps).find((st) => !st.done) })),
    ...goals.filter((g) => !g.completed).map((g) => ({ type: 'goal', item: g, step: normalizeSteps(g.steps).find((st) => !st.done) })),
  ].filter((r) => r.step).slice(0, 5)
  const checkStep = ({ type, item, step }) => {
    if (!onSaveSteps) return
    onSaveSteps(type, item.id, normalizeSteps(item.steps).map((st) => st.id === step.id ? { ...st, done: true, doneAt: new Date().toISOString() } : st))
  }
  const B_nextSteps = (
    <section className="card">
      <div className="section-title-row" style={{marginBottom:6}}>
        <div><p className="eyebrow">Next Steps</p><h3>Move each one forward</h3></div>
        <Link className="ghost-btn" to="/projects" style={{fontSize:'.8rem'}}>Projects →</Link>
      </div>
      {stepRows.length === 0 ? (
        <p className="muted" style={{fontSize:'.85rem', margin:'4px 0 0'}}>No open steps. Break a goal or project into steps and the next one shows up here.</p>
      ) : stepRows.map((r) => (
        <div key={r.type + r.item.id} className="step-row">
          <button type="button" className="step-check next" onClick={() => checkStep(r)} aria-label={`Check off ${r.step.text}`} />
          <Link to={r.type === 'goal' ? '/goals' : '/projects'} className="home-step-link">
            <span className="home-step-text">{r.step.text}</span>
            <span className="home-step-sub">{r.type === 'goal' ? 'Goal' : 'Project'} · {r.item.title}</span>
          </Link>
        </div>
      ))}
    </section>
  )

  const recoveryLog = useWellnessKey('recovery', {})
  const workoutLog = useWellnessKey('workouts', [])
  const mealLog = useWellnessKey('meals', {})
  const nutTargets = { ...DEFAULT_TARGETS, ...(useWellnessKey('nutritionTargets', {}) || {}) }
  const proteinToday = dayProtein(mealLog, TODAY)
  const proteinTarget = Number(nutTargets.protein) || 0
  const todayReadiness = readinessOf(recoveryLog?.[TODAY])
  const todayBand = readinessBand(todayReadiness)
  const sessionsThisWeek = (workoutLog || []).filter((w) => w.date >= startOfWeek(TODAY) && w.date <= TODAY).length
  const habitDone = (h) => habitLogs.some((l) => l.habitId === h.id && l.date === TODAY && l.completed)
  const habitsToday = habits.slice().sort((a, b) => Number(habitDone(a)) - Number(habitDone(b)))
  const habitsDoneCount = habits.filter(habitDone).length
  const B_body = (
    <section className="card">
      <div className="section-title-row" style={{marginBottom:6}}>
        <div><p className="eyebrow">Body &amp; Recovery</p><h3>Readiness</h3></div>
        <span className="status-pill" style={{fontSize:'.72rem'}}>{sessionsThisWeek} session{sessionsThisWeek !== 1 ? 's' : ''} this week</span>
      </div>
      {todayBand ? (
        <Link to="/wellness?tab=recovery" className={'readiness-hero compact tone-' + todayBand.tone} style={{textDecoration:'none'}}>
          <div className="readiness-num">{todayReadiness}</div>
          <div><strong>{todayBand.label}</strong><p>{todayBand.advice}</p></div>
        </Link>
      ) : (
        <Link to="/wellness?tab=recovery" className="readiness-cta">
          <Gauge size={20} />
          <div><strong>Check in</strong><span>20 seconds: sleep, energy, soreness, stress</span></div>
          <span aria-hidden="true">→</span>
        </Link>
      )}
      <Link to="/wellness?tab=nutrition" className="home-protein">
        <div className="nut-protein-top"><span><strong>{proteinToday}</strong> / {proteinTarget || '—'} g protein</span><span className="muted">{proteinTarget && proteinToday >= proteinTarget ? 'Target hit' : 'Log a meal →'}</span></div>
        <div className="nut-bar"><div style={{ width: `${proteinTarget ? Math.min(100, Math.round(proteinToday / proteinTarget * 100)) : 0}%` }} className={proteinTarget && proteinToday >= proteinTarget ? 'hit' : ''} /></div>
      </Link>
      <p className="eyebrow" style={{margin:'14px 0 2px'}}>Today's habits · {habitsDoneCount}/{habits.length}</p>
      {habits.length === 0 ? (
        <p className="muted" style={{fontSize:'.85rem', margin:'4px 0 0'}}>No habits yet. Add a few to build your daily rhythm.</p>
      ) : habitsToday.slice(0, 6).map((h) => {
        const done = habitDone(h)
        return (
          <div key={h.id} className={'step-row' + (done ? ' done' : '')}>
            <button type="button" className={'step-check' + (done ? ' done' : '')} onClick={() => onToggleHabit && onToggleHabit(h.id)}
              aria-label={done ? `Undo ${h.title}` : `Mark ${h.title} done`} aria-pressed={done}>
              {done && <Check size={13} strokeWidth={3} color="var(--warm-white)" />}
            </button>
            <Link to="/habits" className="step-text" style={{textDecoration:'none'}}>{h.title}</Link>
          </div>
        )
      })}
      <div className="home-chip-row">
        <Link to="/wellness?tab=training" className="home-chip"><Dumbbell size={15} /> Log training</Link>
        <Link to="/wellness?tab=sleep" className="home-chip"><Moon size={15} /> Sleep</Link>
        <Link to="/wellness?tab=mood" className="home-chip"><Smile size={15} /> Mood</Link>
        <Link to="/habits" className="home-chip"><Repeat size={15} /> All habits</Link>
      </div>
    </section>
  )

  const weekStart = startOfWeek(TODAY)
  const doneThisWeek = tasks.filter((t) => t.completed && t.date >= weekStart && t.date <= TODAY).length
  const stepsThisWeek = [...goals, ...projects].reduce((n, x) => n + normalizeSteps(x.steps).filter((st) => st.done && st.doneAt && st.doneAt.slice(0, 10) >= weekStart).length, 0)
  const B_review = (
    <section className="card home-review-card">
      <p className="eyebrow" style={{margin:'0 0 4px'}}>Weekly Review</p>
      <h3 style={{margin:'0 0 10px'}}>Look back. Aim forward.</h3>
      <div className="home-review-stats">
        <div><strong>{doneThisWeek}</strong><span>tasks done</span></div>
        <div><strong>{stepsThisWeek}</strong><span>steps checked</span></div>
        <div><strong>{insights.completionRate}%</strong><span>completion</span></div>
      </div>
      <ul className="home-review-prompts">
        <li>What moved forward this week, and what did God teach you in it?</li>
        <li>What will you stop, start, or keep?</li>
        <li>What is the one thing that makes next week a win?</li>
      </ul>
      <Link to="/growth" className="primary-btn" style={{display:'inline-block', textDecoration:'none', marginTop:4}}>Open weekly review</Link>
    </section>
  )

  const blocks = {
    hero: B_hero, woty: B_woty, focus: B_focus, metrics: B_metrics, quick: B_quick, schedule: B_schedule,
    suggestions: B_suggestions, overdue: B_overdue, goals: B_goals, score: B_score, execution: B_execution,
    tomorrow: B_tomorrow, faith: B_faith, nextSteps: B_nextSteps, body: B_body, review: B_review,
  }
  const order = HOME_ORDER[mode.id] || HOME_ORDER.Balanced

  return (
    <div className="home-stack" data-mode={mode.id}>
      {order.map((key) => <React.Fragment key={key}>{blocks[key]}</React.Fragment>)}

      <PageNav />
    </div>
  )
}



function TaskItem({ task, onToggle, onEdit, onDelete }) {
  const isTaskOverdue = task.date && task.date < TODAY && !task.completed
  const priorityColor = task.priority === 'High' ? 'var(--danger)' : task.priority === 'Medium' ? 'var(--warning)' : 'var(--muted)'

  return (
    <div style={{padding:'10px 0', borderBottom:'1px solid var(--surface)', display:'flex', alignItems:'center', gap:10}}>
      {/* Complete toggle — left side circle */}
      <button type="button" className={'step-check' + (task.completed ? ' done' : '')} onClick={() => onToggle(task.id)}
        aria-label={task.completed ? `Mark ${task.title} not done` : `Mark ${task.title} done`} aria-pressed={!!task.completed}>
        {task.completed && <Check size={13} strokeWidth={3} color="var(--warm-white)" />}
      </button>

      {/* Content — middle */}
      <div style={{flex:1, minWidth:0}} onClick={() => onEdit('task', task)} >
        <div style={{
          fontWeight:600, fontSize:'.9rem', lineHeight:1.3,
          color: task.completed ? 'var(--muted)' : isTaskOverdue ? 'var(--danger)' : 'var(--text)',
          textDecoration: task.completed ? 'line-through' : 'none',
          marginBottom:2
        }}>
          {task.title}
          {task.recurrence && task.recurrence !== 'none' &&
            <span style={{marginLeft:6, fontSize:'.62rem', padding:'1px 7px', borderRadius:999, background:'var(--brass-dim)', color:'var(--brass2)', fontWeight:700, textTransform:'capitalize', textDecoration:'none', display:'inline-block'}}>↻ {task.recurrence}</span>
          }
        </div>
        <div style={{fontSize:'.72rem', color: isTaskOverdue ? 'var(--danger)' : 'var(--muted)', display:'flex', gap:5, flexWrap:'wrap', alignItems:'center', marginTop:2}}>
          <span style={{display:'inline-flex',alignItems:'center',gap:3,padding:'1px 7px',borderRadius:999,background:priorityColor+'18',color:priorityColor,fontWeight:700,fontSize:'.65rem',letterSpacing:'.04em'}}>
            {task.priority || 'Low'}
          </span>
          <span style={{color:'var(--muted)',fontSize:'.7rem'}}>{task.category}</span>
          {task.date && <span style={{color: isTaskOverdue ? 'var(--danger)' : 'var(--muted)'}}>{isTaskOverdue ? '⚠ Overdue ' : ''}{shortDate(task.date)}</span>}
          {task.time && <span style={{color:'var(--brass2)',fontWeight:600}}>{fmt12(task.time)}</span>}
        </div>
      </div>

      {/* Delete — right side */}
      <button onClick={() => onDelete('task', task.id)} style={{
        background:'none', border:'none', color:'var(--muted)', cursor:'pointer',
        fontSize:'1rem', padding:'4px', flexShrink:0, lineHeight:1
      }}>✕</button>
    </div>
  )
}


function TasksPage({ tasks, settings, onToggle, onEdit, onDelete, onQuickCreate }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All')
  const [status, setStatus] = useState('All')

  const filtered = useMemo(() => {
    try {
      return (tasks || []).filter((task) => {
        if (!task || !task.title) return false
        // Today's finished tasks always stay (checked); older ones follow the setting
        if (!(settings || {}).showCompletedTasks && task.completed && !isToday(task.date)) return false
        if (category !== 'All' && task.category !== category) return false
        if (status === 'Open' && task.completed) return false
        if (status === 'Done' && !task.completed) return false
        if (query && !task.title.toLowerCase().includes(query.toLowerCase())) return false
        return true
      })
    } catch(e) { return [] }
  }, [tasks, settings, category, status, query])

  const groups = {
    Overdue: filtered.filter((task) => !task.completed && isOverdue(task.date)),
    Today: filtered.filter((task) => isToday(task.date)),
    'This Week': filtered.filter((task) => !task.completed && isThisWeek(task.date) && !isToday(task.date) && !isOverdue(task.date)),
    Upcoming: filtered.filter((task) => !task.completed && !isThisWeek(task.date) && task.date > TODAY),
    Completed: filtered.filter((task) => task.completed && !isToday(task.date)),
  }

  const openCount = filtered.filter(t => !t.completed).length
  const doneCount = filtered.filter(t => t.completed).length

  return (
    <div className="screen-stack">
      <PageHeader icon={SquareCheck} title="Tasks" subtitle="Capture it. Schedule it. Finish it." />
      {/* Compact header */}
      <section className="card" style={{padding:'12px 14px'}}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10}}>
          <div>
            <p className="eyebrow">Your list</p>
            <div style={{display:'flex', gap:10, marginTop:2}}>
              <span style={{fontSize:'.78rem', color:'var(--text2)', fontWeight:600}}>{openCount} open</span>
              <span style={{fontSize:'.78rem', color:'var(--muted)'}}>{doneCount} done</span>
            </div>
          </div>
          <div style={{display:'flex', gap:6}}>
            <button className="secondary-btn" style={{fontSize:'.78rem', padding:'6px 10px'}} onClick={() => onQuickCreate('task', { recurrence: 'daily' })}>+ Recurring</button>
            <button className="primary-btn" style={{fontSize:'.78rem', padding:'6px 12px'}} onClick={() => onQuickCreate('task')}>+ Task</button>
          </div>
        </div>
        {/* Filters */}
        <div style={{display:'grid', gridTemplateColumns:'2fr 1fr 1fr', gap:8}}>
          <input placeholder="Search tasks..." value={query} onChange={(e) => setQuery(e.target.value)}
            style={{padding:'8px 10px', border:'1.5px solid var(--border2)', borderRadius:'var(--radius-sm)', fontSize:'.83rem', background:'var(--surface)', color:'var(--text)'}} />
          <select value={category} onChange={(e) => setCategory(e.target.value)}
            style={{padding:'8px 6px', border:'1.5px solid var(--border2)', borderRadius:'var(--radius-sm)', fontSize:'.8rem', background:'var(--surface)', color:'var(--text2)'}}>
            <option value="All">Category</option>
            {categories.map((item) => <option key={item}>{item}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)}
            style={{padding:'8px 6px', border:'1.5px solid var(--border2)', borderRadius:'var(--radius-sm)', fontSize:'.8rem', background:'var(--surface)', color:'var(--text2)'}}>
            <option value="All">Status</option>
            <option>Open</option>
            <option>Done</option>
          </select>
        </div>
      </section>

      {Object.values(groups).every(g => g.length === 0) && (
        <section className="card">
          <EmptyState icon={ListTodo}
            title={(tasks || []).length ? 'Nothing matches those filters' : 'A clear list — for now'}
            message={(tasks || []).length ? 'Try another category or status, or clear your search.' : 'Add the first thing on your mind. One task is how momentum starts.'} />
          {!(tasks || []).length && (
            <div style={{display:'flex', justifyContent:'center', marginTop:-16, paddingBottom:8}}>
              <button className="primary-btn" onClick={() => onQuickCreate('task')}>+ Add your first task</button>
            </div>
          )}
        </section>
      )}
      {Object.entries(groups).map(([label, items]) => {
        if (items.length === 0) return null
        return (
          <section key={label} className="card" style={{padding:'12px 14px'}}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8}}>
              <h3 style={{fontSize:'.95rem', color: label === 'Overdue' ? 'var(--danger)' : 'var(--text)'}}>{label}</h3>
              <span className={`status-pill${label === 'Overdue' ? ' alert-pill' : ''}`} style={{fontSize:'.72rem', padding:'3px 8px'}}>{items.length}</span>
            </div>
            {items.map((task) => <TaskItem key={task.id} task={task} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} />)}
          </section>
        )
      })}
      <PageNav />
    </div>
  )
}


function CalendarPage({ tasks, events, settings, onEdit, onDelete, onQuickCreate, onReschedule, onToggle, onSkipOccurrence }) {
  const [view, setView] = useState('day')
  const [selectedDate, setSelectedDate] = useState(TODAY)
  const { prefersTouch, isMobile } = useResponsive()

  const scheduled = useMemo(() => {
    const md = getMonthDays(selectedDate), wd = getWeekDays(selectedDate)
    const from = [md[0], wd[0], selectedDate].sort()[0], to = [md[md.length - 1], wd[6], selectedDate].sort()[2]
    const taskItems = tasks.filter((task) => task.time).map((task) => ({ ...task, startTime: task.time, itemType: 'task' }))
    const eventItems = expandEvents(events, from, to).map((event) => ({ ...event, itemType: 'event' }))
    return [...taskItems, ...eventItems].sort((a, b) => `${a.date}-${a.startTime}`.localeCompare(`${b.date}-${b.startTime}`))
  }, [tasks, events, selectedDate])
  // Editing a repeat opens the series (with its real start date), never the single occurrence
  const openItem = (item) => item.itemType === 'event' && item.isRepeat
    ? onEdit('event', events.find((e) => e.id === item.id) || item)
    : onEdit(item.itemType, item)
  const [pendingDelete, setPendingDelete] = useState(null)

  const weekDays = getWeekDays(selectedDate)
  const monthDays = getMonthDays(selectedDate)
  const dayScheduled = scheduled.filter((item) => item.date === selectedDate)
  // 5 AM – 8 PM always, stretched to include anything scheduled earlier or later
  const hours = useMemo(() => {
    const set = new Set(Array.from({ length: 16 }, (_, i) => i + 5))
    dayScheduled.forEach((item) => { const h = Number(String(item.startTime || '').slice(0, 2)); if (!isNaN(h) && h >= 0 && h < 24) set.add(h) })
    return [...set].sort((a, b) => a - b).map((h) => `${String(h).padStart(2, '0')}:00`)
  }, [dayScheduled])
  // Each hour is split into :00 and :30 rows so you can tap straight onto 6:30
  const slots = hours.flatMap((h) => [h, h.slice(0, 2) + ':30'])
  const slotOf = (t) => { const [hh, mm] = String(t || '').split(':'); return `${hh}:${Number(mm) >= 30 ? '30' : '00'}` }
  const nowSlot = selectedDate === TODAY ? slotOf(`${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`) : null
  const confirmDelete = (item) => {
    if (item.itemType === 'event' && item.isRepeat) { setPendingDelete(`${item.id}:${item.date}`); return }
    if (window.confirm(`Delete "${item.title}"?`)) onDelete(item.itemType, item.id)
  }
  const selectedMonthLabel = formatDateLabel(selectedDate, { month: 'long', year: 'numeric' })

  const handleDropItem = async (payload, date, time) => {
    if (!payload?.id || !payload?.type || payload.repeat) return
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
              borderColor: view===v ? 'var(--ink)' : 'var(--border2)',
              background: view===v ? 'var(--ink)' : 'var(--surface)',
              color: view===v ? 'var(--warm-white)' : 'var(--text2)'}}>
              {v}
            </button>
          ))}
        </div>
      </section>

      {/* ── Day view ─────────────────────────────────────────────── */}
      {view === 'day' && (
        <section className="card">
          <div className="section-title-row">
            <h3 style={{fontSize:'1rem', whiteSpace:'nowrap'}}>Daily Schedule</h3>
            <span className="status-pill" style={{fontSize:'.72rem'}}>
              {dayScheduled.length ? `${dayScheduled.length} scheduled` : 'Open day'}
            </span>
          </div>
          <div className={settings.compactCalendar ? 'timeline compact-calendar' : 'timeline'}>
            {slots.map((hour) => {
              const items = dayScheduled.filter((item) => item.startTime && slotOf(item.startTime) === hour)
              const isHalf = hour.endsWith(':30')
              const isNow = nowSlot === hour
              return (
                <div className={'timeline-row' + (isHalf ? ' half' : '') + (isNow ? ' now' : '')} key={hour}>
                  <div className="timeline-hour">{isHalf ? fmt12(hour).replace(/ (AM|PM)$/, '') : hourLabel(hour)}</div>
                  <div className="timeline-slot"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => { try { handleDropItem(JSON.parse(e.dataTransfer.getData('application/json')), selectedDate, hour) } catch {} }}>
                    {items.length === 0
                      ? <button className="slot-add-btn" onClick={() => onQuickCreate('task', { date: selectedDate, time: hour })}><span aria-hidden="true">+</span><span className="sr-only">Add at {fmt12(hour)}</span></button>
                      : items.map((item) => {
                        const done = item.itemType === 'task' && item.completed
                        return (
                          pendingDelete === `${item.id}:${item.date}` ? (
                            <div key={`${item.itemType}-${item.id}`} className="time-card event repeat-delete">
                              <span className="time-card-title" style={{ flex: 1 }}>Remove "{item.title}"</span>
                              <button className="repeat-del-btn" onClick={() => { setPendingDelete(null); onSkipOccurrence && onSkipOccurrence(item.id, item.date) }}>Just this day</button>
                              <button className="repeat-del-btn danger" onClick={() => { setPendingDelete(null); onDelete('event', item.id) }}>Whole series</button>
                              <button className="time-card-del" onClick={() => setPendingDelete(null)} aria-label="Cancel">✕</button>
                            </div>
                          ) : (
                          <div key={`${item.itemType}-${item.id}`} className={`time-card premium-time-card ${item.itemType}${done ? ' done' : ''}`} draggable={!item.isRepeat}
                            onDragStart={(e) => e.dataTransfer.setData('application/json', JSON.stringify({ type: item.itemType, id: item.id, repeat: !!item.isRepeat }))}>
                            {item.itemType === 'task' && onToggle && (
                              <button type="button" className={'step-check' + (done ? ' done' : '')} onClick={() => onToggle(item.id)}
                                aria-label={done ? `Mark ${item.title} not done` : `Mark ${item.title} done`} aria-pressed={done}>
                                {done && <Check size={13} strokeWidth={3} color="var(--warm-white)" />}
                              </button>
                            )}
                            <button className="time-card-main" onClick={() => openItem(item)}>
                              <span className="time-card-title">{item.title}</span>
                              <span className="time-card-meta">{fmtRange(item.startTime, item.endTime)} · {item.itemType === 'task' ? 'Task' : 'Event'}{item.isRepeat ? ` · ↻ ${repeatLabel(item.recurrence)}` : ''}</span>
                            </button>
                            <button className="time-card-del" onClick={() => confirmDelete(item)} aria-label={`Delete ${item.title}`}>✕</button>
                          </div>
                          )
                        )
                      })}
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
                    <button key={`${item.itemType}-${item.id}`} className="week-item" onClick={() => openItem(item)}
                      draggable={!item.isRepeat} onDragStart={(e) => e.dataTransfer.setData('application/json', JSON.stringify({ type: item.itemType, id: item.id, repeat: !!item.isRepeat }))}>
                      <span style={{fontSize:'.7rem', color:'var(--brass2)', fontWeight:600}}>{fmt12(item.startTime)}</span>
                      <strong style={{fontSize:'.8rem', color:'var(--ink)'}}>{item.title}</strong>
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
      <PageNav />
    </div>
  )
}


function ProjectsPage({ projects, tasks, goals, onEdit, onDelete, onQuickCreate, onStepsChange, onUpdate, onToggle }) {
  const [filter, setFilter] = useState('All')
  const [expandedId, setExpandedId] = useState(null)

  const STATUS_ORDER = ['Active', 'In Progress', 'On Hold', 'Completed']
  const STATUS_STYLE = {
    Active:        { color: 'var(--brass2)',  bg: 'var(--brass-dim)' },
    'In Progress': { color: '#B26B12',        bg: 'rgba(233,149,42,.14)' },
    'On Hold':     { color: 'var(--muted)',   bg: 'var(--stone2)' },
    Completed:     { color: 'var(--success)', bg: 'rgba(34,197,94,.12)' },
  }
  const rank = (p) => { const i = STATUS_ORDER.indexOf(p.status); return i < 0 ? 0 : i }
  const filtered = (filter === 'All' ? projects : projects.filter(p => p.status === filter))
    .slice().sort((a, b) => rank(a) - rank(b))

  return (
    <div className="screen-stack">
      <PageHeader icon={Folder} title="Projects" subtitle="Big things, one step at a time." />

      <section className="card" style={{padding:'12px 14px'}}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10}}>
          <div>
            <p className="eyebrow">Your projects</p>
            <div style={{fontSize:'.78rem', color:'var(--muted)', marginTop:2}}>
              {projects.filter(p=>p.status!=='Completed').length} active · {projects.filter(p=>p.status==='Completed').length} done
            </div>
          </div>
          <button className="primary-btn" style={{fontSize:'.8rem', padding:'6px 14px'}} onClick={() => onQuickCreate('project')}>+ Project</button>
        </div>
        <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
          {['All', ...STATUS_ORDER].map(s => (
            <button key={s} onClick={() => setFilter(s)} style={{
              padding:'5px 12px', borderRadius:999, border:'1.5px solid', fontSize:'.78rem',
              cursor:'pointer', fontFamily:'inherit', fontWeight:600,
              borderColor: filter===s ? 'var(--brass)' : 'var(--border2)',
              background: filter===s ? 'var(--brass-dim)' : 'transparent',
              color: filter===s ? 'var(--brass2)' : 'var(--muted)'
            }}>{s}</button>
          ))}
        </div>
      </section>

      {filtered.length === 0 && (
        <section className="card">
          <EmptyState icon={Folder}
            title={projects.length ? `No ${filter.toLowerCase()} projects` : 'Build something meaningful'}
            message={projects.length ? 'Try another filter.' : 'Name the project, then list the steps. Check them off as you go.'}
            action={projects.length ? null : '+ Add your first project'} onAction={() => onQuickCreate('project')} />
        </section>
      )}

      {filtered.map((project) => {
        const linkedGoal = goals.find(g => g.id === project.goalId)
        const projectTasks = tasks.filter(t => t.linkedProjectId === project.id)
        const completedTasks = projectTasks.filter(t => t.completed).length
        const steps = normalizeSteps(project.steps)
        const stepsDone = steps.filter(st => st.done).length
        const progress = getProjectProgress(project, tasks)
        const isExpanded = expandedId === project.id
        const overdueTasks = projectTasks.filter(t => !t.completed && isOverdue(t.date))
        const st = STATUS_STYLE[project.status] || STATUS_STYLE['On Hold']
        const summary = [
          steps.length ? `${stepsDone}/${steps.length} steps` : null,
          projectTasks.length ? `${completedTasks}/${projectTasks.length} tasks` : null,
        ].filter(Boolean).join(' · ') || 'No steps yet'

        return (
          <section key={project.id} className="card" style={{padding:'16px'}}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8}}>
              <div style={{flex:1, minWidth:0}}>
                <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:4, flexWrap:'wrap'}}>
                  <div style={{fontWeight:700, fontSize:'1rem', color:'var(--text)'}}>{project.title}</div>
                  <span style={{fontSize:'.68rem', padding:'2px 8px', borderRadius:999, fontWeight:700, background: st.bg, color: st.color}}>{project.status}</span>
                </div>
                {project.description && (
                  <div style={{fontSize:'.82rem', color:'var(--muted)', lineHeight:1.5, marginBottom:6}}>{project.description}</div>
                )}
              </div>
              <div style={{display:'flex', gap:6, flexShrink:0, marginLeft:8}}>
                <button className="ghost-btn" style={{fontSize:'.75rem', padding:'4px 8px'}} onClick={() => onEdit('project', project)}>Edit</button>
                <button style={{background:'none', border:'none', color:'var(--muted)', cursor:'pointer'}} onClick={() => onDelete('project', project.id)} aria-label="Delete project">✕</button>
              </div>
            </div>

            <div style={{marginBottom:8}}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4}}>
                <span style={{fontSize:'.75rem', color:'var(--muted)'}}>
                  {summary}{project.dueDate ? ` · Due ${shortDate(project.dueDate)}` : ''}
                </span>
                <span style={{fontSize:'.82rem', fontWeight:700, color: progress >= 100 ? 'var(--success)' : 'var(--brass2)'}}>{progress}%</span>
              </div>
              <div style={{height:6, borderRadius:999, background:'var(--stone2)', overflow:'hidden'}}>
                <div style={{
                  height:'100%', borderRadius:999, width:`${progress}%`,
                  background: progress >= 100 ? 'var(--success)' : 'linear-gradient(90deg, var(--brass2), var(--brass))',
                  transition:'width .4s'
                }} />
              </div>
            </div>

            {(linkedGoal || overdueTasks.length > 0) && (
              <div style={{display:'flex', gap:12, fontSize:'.75rem', color:'var(--muted)', flexWrap:'wrap', alignItems:'center'}}>
                {linkedGoal && <span style={{display:'inline-flex', alignItems:'center', gap:5}}><Target size={13} color="var(--brass)" /> {linkedGoal.title}</span>}
                {overdueTasks.length > 0 && <span style={{color:'var(--danger)', fontWeight:600}}>⚠ {overdueTasks.length} overdue</span>}
              </div>
            )}

            <StepsChecklist
              steps={steps}
              onChange={(next) => onStepsChange && onStepsChange(project.id, next)}
              onSchedule={(step) => onQuickCreate('task', { title: step.text, linkedProjectId: project.id, linkedGoalId: project.goalId || '' })}
              completeSlot={project.status !== 'Completed' && onUpdate && (
                <button type="button" className="steps-complete-btn" onClick={() => onUpdate('project', { ...project, status: 'Completed' }, 'edit')}>Mark project complete</button>
              )} />

            <div style={{display:'flex', gap:12, alignItems:'center', marginTop:12, flexWrap:'wrap'}}>
              {projectTasks.length > 0 && (
                <button onClick={() => setExpandedId(isExpanded ? null : project.id)}
                  style={{background:'none', border:'none', color:'var(--ink2)', cursor:'pointer', fontSize:'.8rem', fontWeight:600, fontFamily:'inherit', padding:0}}>
                  {isExpanded ? '▲ Hide tasks' : `▼ Show ${projectTasks.length} scheduled task${projectTasks.length!==1?'s':''}`}
                </button>
              )}
              <button onClick={() => onQuickCreate('task', { linkedProjectId: project.id, linkedGoalId: project.goalId || '' })}
                style={{background:'none', border:'none', color:'var(--brass2)', cursor:'pointer', fontSize:'.8rem', fontWeight:600, fontFamily:'inherit', padding:0}}>
                + Schedule a task
              </button>
            </div>

            {isExpanded && (
              <div style={{borderTop:'1px solid var(--border)', paddingTop:8, marginTop:10}}>
                {projectTasks.map(task => (
                  <div key={task.id} style={{display:'flex', alignItems:'center', gap:10, padding:'7px 0', borderBottom:'1px solid var(--border)'}}>
                    <button type="button" onClick={() => onToggle && onToggle(task.id)}
                      aria-label={task.completed ? 'Mark task not done' : 'Mark task done'}
                      className={'step-check' + (task.completed ? ' done' : '')}>
                      {task.completed && <Check size={13} strokeWidth={3} color="var(--warm-white)" />}
                    </button>
                    <div style={{flex:1, minWidth:0}}>
                      <div style={{fontSize:'.88rem', color: task.completed ? 'var(--muted)' : 'var(--text)', fontWeight:500, textDecoration: task.completed ? 'line-through' : 'none'}}>{task.title}</div>
                      {task.date && <div style={{fontSize:'.72rem', color: isOverdue(task.date) && !task.completed ? 'var(--danger)' : 'var(--muted)'}}>{shortDate(task.date)}{task.time ? ` · ${fmt12(task.time)}` : ''}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )
      })}
      <PageNav />
    </div>
  )
}

// ── Page Navigator — consistent bottom nav across all pages ──────────────
const APP_PAGES = [
  { path: '/', label: '⌂ Home' },
  { path: '/tasks', label: '✓ Tasks' },
  { path: '/calendar', label: '◷ Calendar' },
  { path: '/projects', label: '📁 Projects' },
  { path: '/habits', label: '🔁 Habits' },
  { path: '/goals', label: '🎯 Goals' },
  { path: '/growth', label: '↑ Growth' },
  { path: '/finance', label: '💰 Finance' },
  { path: '/wellness', label: '🌿 Wellness' },
  { path: '/productivity', label: '⏱ Productivity' },
  { path: '/lifestyle', label: '🌟 Lifestyle' },
  { path: '/faith', label: '✝ Faith' },
  { path: '/more', label: '⋯ More' },
]

function PageNav() {
  const loc = useLocation()
  const nav = useNavigate()
  const idx = APP_PAGES.findIndex(p => p.path === loc.pathname)
  const prev = idx > 0 ? APP_PAGES[idx - 1] : null
  const next = idx < APP_PAGES.length - 1 ? APP_PAGES[idx + 1] : null
  if (!prev && !next) return null
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '16px 0 80px', borderTop: '1px solid var(--border)', marginTop: 24, gap: 8,
    }}>
      {prev
        ? <button onClick={() => nav(prev.path)} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '9px 16px', borderRadius: 999,
            border: '1.5px solid var(--border2)', background: 'var(--stone)',
            color: 'var(--ink2)', fontSize: '.82rem', fontWeight: 600, cursor: 'pointer',
          }}>← {stripEmoji(prev.label)}</button>
        : <div />}
      {next
        ? <button onClick={() => nav(next.path)} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '9px 16px', borderRadius: 999,
            border: '1px solid var(--ink)', background: 'var(--ink)',
            color: 'var(--warm-white)', fontSize: '.82rem', fontWeight: 600, cursor: 'pointer',
          }}>{stripEmoji(next.label)} →</button>
        : <div />}
    </div>
  )
}


// ── Stripe Configuration ──────────────────────────────────────────────────
const STRIPE_CONFIG = {
  publishableKey: 'pk_live_51Sxe7pBr8nMXOo8tUrruWNZ7BkQ0OsKlfqtgKuksLAIcBfCHGtnPv19QP2sIrZz7nQJzDr4SH0OT6ZJ7yxubDUF3007nOd9RJE',
  monthlyLink: 'https://buy.stripe.com/00w7sKcrG8dEe110Rl57W05',
  annualLink: 'https://buy.stripe.com/dRm14majydxYaOP8jN57W06',
  monthlyTrial: 7,
  annualTrial: 14,
  prices: {
    monthly: 7.99,
    annual: 59.99,
  },
}

// Free tier limits
const FREE_LIMITS = {
  tasks: 20,
  habits: 5,
  goals: 2,
  projects: 2,
}

// ── Subscription Hook ─────────────────────────────────────────────────────
// Owner emails that automatically get Pro access
const OWNER_EMAILS = ['aja2012@gmail.com']

function useSubscription(user) {
  const [tier, setTierState] = React.useState(() => {
    try { return localStorage.getItem('planner_tier') || 'free' } catch { return 'free' }
  })
  const [trialEndsAt, setTrialEndsAtState] = React.useState(() => {
    try { return localStorage.getItem('planner_trial_ends') } catch { return null }
  })

  // ── Load tier from Supabase profile on mount (source of truth) ───────────
  React.useEffect(() => {
    if (!user || !hasSupabaseEnv) return
    let cancelled = false

    const loadTier = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('tier, trial_ends_at')
        .eq('user_id', user.id)
        .maybeSingle()

      if (cancelled || error || !data) return

      // Owner emails always get pro, even if profile says otherwise
      const isOwner = user.email && OWNER_EMAILS.includes(user.email.toLowerCase())
      const finalTier = isOwner ? 'pro' : (data.tier || 'free')

      setTierState(finalTier)
      setTrialEndsAtState(data.trial_ends_at || null)
      try {
        localStorage.setItem('planner_tier', finalTier)
        if (data.trial_ends_at) localStorage.setItem('planner_trial_ends', data.trial_ends_at)
      } catch {}

      // Sync owner upgrade back to profile if needed
      if (isOwner && data.tier !== 'pro') {
        supabase.from('profiles').update({ tier: 'pro', updated_at: new Date().toISOString() }).eq('user_id', user.id).then(()=>{})
      }
    }

    loadTier()

    // Realtime — if tier changes elsewhere (Stripe webhook, admin, another device), update here
    const channel = supabase
      .channel('subscription_' + user.id)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'profiles',
        filter: `user_id=eq.${user.id}`,
      }, payload => {
        const row = payload.new
        if (!row) return
        const isOwner = user.email && OWNER_EMAILS.includes(user.email.toLowerCase())
        const finalTier = isOwner ? 'pro' : (row.tier || 'free')
        setTierState(finalTier)
        setTrialEndsAtState(row.trial_ends_at || null)
        try { localStorage.setItem('planner_tier', finalTier) } catch {}
      })
      .subscribe()

    return () => { cancelled = true; supabase.removeChannel(channel) }
  }, [user?.id, user?.email])

  // ── Setter that writes to BOTH localStorage and Supabase ─────────────────
  const setTier = React.useCallback(async (newTier) => {
    setTierState(newTier)
    try { localStorage.setItem('planner_tier', newTier) } catch {}
    if (user && hasSupabaseEnv) {
      await supabase.from('profiles').update({
        tier: newTier, updated_at: new Date().toISOString()
      }).eq('user_id', user.id)
    }
  }, [user?.id])

  const setTrialEndsAt = React.useCallback(async (date) => {
    setTrialEndsAtState(date)
    try {
      if (date) localStorage.setItem('planner_trial_ends', date)
      else localStorage.removeItem('planner_trial_ends')
    } catch {}
    if (user && hasSupabaseEnv) {
      await supabase.from('profiles').update({
        trial_ends_at: date, updated_at: new Date().toISOString()
      }).eq('user_id', user.id)
    }
  }, [user?.id])

  // Check URL for welcome=pro and activate pro (post-Stripe checkout)
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('welcome') === 'pro') {
      setTier('pro')
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [setTier])

  const isPro = tier === 'pro' || tier === 'trial'
  const isTrialing = tier === 'trial' && trialEndsAt && new Date(trialEndsAt) > new Date()
  const daysLeftInTrial = trialEndsAt ? Math.max(0, Math.ceil((new Date(trialEndsAt) - new Date()) / 86400000)) : 0

  return { tier, setTier, isPro, isTrialing, daysLeftInTrial, trialEndsAt, setTrialEndsAt }
}

// ── Welcome Pro Banner ────────────────────────────────────────────────────
function WelcomeProBanner({ onDismiss }) {
  return (
    <div style={{
      position: 'fixed', top: 16, left: 16, right: 16, zIndex: 9999,
      maxWidth: 480, margin: '0 auto',
      background: 'linear-gradient(135deg, var(--teal) 0%, var(--navy) 100%)',
      color: 'white', borderRadius: 16, padding: '16px 20px',
      boxShadow: '0 12px 40px rgba(0,0,0,.25)',
      display: 'flex', alignItems: 'center', gap: 12,
      animation: 'slideDown .4s ease',
    }}>
      <div style={{ fontSize: '2rem' }}>🎉</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: '.95rem', marginBottom: 2 }}>Welcome to Pro!</div>
        <div style={{ fontSize: '.78rem', opacity: .9 }}>Your free trial has started. Plan with faith, live with purpose.</div>
      </div>
      <button onClick={onDismiss} style={{
        background: 'rgba(255,255,255,.2)', color: 'white', border: 'none',
        borderRadius: 999, width: 28, height: 28, cursor: 'pointer', fontWeight: 700,
      }}>✕</button>
    </div>
  )
}

// ── Pro-only Tab Configuration ────────────────────────────────────────────
const PRO_TABS = {
  faith: ['fasting', 'sermons', 'goals', 'reading'],
  finance: ['income', 'expenses', 'savings', 'debt', 'donations', 'nospend'],
  lifestyle: ['recipes', 'trips', 'birthdays', 'gifts', 'cleaning'],
  productivity: ['checklists', 'focus'],
  wellness: ['training', 'nutrition', 'care', 'sleep', 'journal', 'routine', 'meds', 'metrics', 'anxiety', 'migraines', 'coping'],
}

function ProTabGate({ isPro, onUpgrade, children }) {
  if (isPro) return children
  return (
    <div style={{
      padding: '48px 24px', textAlign: 'center',
      background: 'linear-gradient(135deg, var(--ink) 0%, #0B1829 100%)',
      borderRadius: 16, margin: '0 0 16px',
      border: '1px solid rgba(184,150,90,.2)',
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: '50%',
        background: 'rgba(184,150,90,.15)', border: '1.5px solid rgba(184,150,90,.3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 16px', fontSize: '1.6rem'
      }}>🔒</div>
      <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'white', marginBottom: 8 }}>
        Pro Feature
      </div>
      <p style={{ fontSize: '.85rem', color: 'rgba(255,255,255,.55)', lineHeight: 1.6, maxWidth: 260, margin: '0 auto 24px' }}>
        Unlock this and every Pro feature with a 7-day free trial. No commitment required.
      </p>
      <button onClick={onUpgrade} style={{
        padding: '13px 32px', borderRadius: 999,
        background: 'linear-gradient(135deg, var(--brass) 0%, var(--brass2) 100%)',
        color: 'white', border: 'none',
        fontSize: '.92rem', fontWeight: 700, cursor: 'pointer',
        boxShadow: '0 4px 20px rgba(184,150,90,.35)',
      }}>Start Free Trial →</button>
      <p style={{fontSize:'.72rem',color:'rgba(255,255,255,.3)',marginTop:12}}>7-day free trial · Cancel anytime</p>
    </div>
  )
}


// ── Upgrade Card ──────────────────────────────────────────────────────────
function UpgradeCard({ title, message, onClose }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(10,18,30,.92)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        background: 'var(--warm-white, white)', borderRadius: 24,
        padding: '36px 28px', maxWidth: 380, width: '100%', textAlign: 'center',
        boxShadow: '0 32px 80px rgba(0,0,0,.4)',
      }}>
        <div style={{ fontSize: '3rem', marginBottom: 16 }}>✨</div>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>
          {title || 'Upgrade to Pro'}
        </h2>
        <p style={{ fontSize: '.88rem', color: 'var(--ink2)', lineHeight: 1.6, marginBottom: 24 }}>
          {message || 'Unlock unlimited tasks, habits, goals, faith section, finance tools, and all future features.'}
        </p>

        <div style={{ display: 'grid', gap: 10, marginBottom: 20 }}>
          <a href={STRIPE_CONFIG.annualLink} target="_blank" rel="noopener noreferrer" style={{
            display: 'block', padding: '16px', borderRadius: 14,
            background: 'var(--teal)', color: 'white', textDecoration: 'none',
            fontWeight: 700, position: 'relative',
          }}>
            <div style={{ fontSize: '.95rem' }}>Annual — $59.99/year</div>
            <div style={{ fontSize: '.75rem', opacity: .9, marginTop: 2 }}>$5/mo · 14-day free trial · Save $36</div>
            <span style={{
              position: 'absolute', top: -8, right: 12,
              background: 'var(--brass, #B8965A)', color: 'white', fontSize: '.65rem',
              padding: '3px 10px', borderRadius: 999, fontWeight: 700,
            }}>BEST VALUE</span>
          </a>
          <a href={STRIPE_CONFIG.monthlyLink} target="_blank" rel="noopener noreferrer" style={{
            display: 'block', padding: '14px', borderRadius: 14,
            background: 'var(--stone)', color: 'var(--ink)', textDecoration: 'none',
            fontWeight: 700, border: '1.5px solid var(--border2)',
          }}>
            <div style={{ fontSize: '.95rem' }}>Monthly — $7.99/month</div>
            <div style={{ fontSize: '.75rem', color: 'var(--ink2)', marginTop: 2 }}>7-day free trial</div>
          </a>
        </div>

        <button onClick={onClose} style={{
          background: 'none', border: 'none', color: 'var(--muted)',
          fontSize: '.82rem', cursor: 'pointer',
        }}>Maybe later</button>
      </div>
    </div>
  )
}

// ── Trial Countdown Banner ────────────────────────────────────────────────
function TrialBanner({ daysLeft, onUpgrade }) {
  if (!daysLeft || daysLeft > 14) return null
  return (
    <div style={{
      background: daysLeft <= 3 ? 'var(--warning, #F59E0B)' : 'var(--teal)',
      color: 'white', padding: '8px 14px', borderRadius: 10,
      margin: '0 14px 12px', display: 'flex', justifyContent: 'space-between',
      alignItems: 'center', fontSize: '.82rem',
    }}>
      <span><strong>{daysLeft} day{daysLeft === 1 ? '' : 's'} left</strong> in your trial</span>
      <button onClick={onUpgrade} style={{
        background: 'white', color: 'var(--ink)', border: 'none',
        padding: '4px 12px', borderRadius: 999, fontSize: '.75rem',
        fontWeight: 700, cursor: 'pointer',
      }}>Manage</button>
    </div>
  )
}


// ── Empty State Component ─────────────────────────────────────────────────
function StepsChecklist({ steps, onChange, onSchedule, completeSlot, label = 'Steps', hint }) {
  const list = normalizeSteps(steps)
  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText] = useState('')
  const [showDone, setShowDone] = useState(false)
  const doneCount = list.filter((st) => st.done).length
  const nextId = list.length > 1 ? list.find((st) => !st.done)?.id : null
  const collapseDone = doneCount > 3 && !showDone
  const visible = collapseDone ? list.filter((st) => !st.done) : list

  const addLines = (lines) => { if (lines.length) onChange([...list, ...lines.map((text) => ({ id: newStepId(), text, done: false, doneAt: null }))]) }
  const addDraft = () => { addLines(parseStepLines(draft)); setDraft('') }
  const toggle = (id) => onChange(list.map((st) => st.id === id ? { ...st, done: !st.done, doneAt: st.done ? null : new Date().toISOString() } : st))
  const remove = (id) => { onChange(list.filter((st) => st.id !== id)); setEditingId(null) }
  const move = (id, dir) => {
    const i = list.findIndex((st) => st.id === id), j = i + dir
    if (i < 0 || j < 0 || j >= list.length) return
    const next = [...list]; [next[i], next[j]] = [next[j], next[i]]; onChange(next)
  }
  const startEdit = (st) => { setEditingId(st.id); setEditText(st.text) }
  const saveEdit = () => {
    const text = editText.trim()
    const cur = list.find((st) => st.id === editingId)
    if (text && cur && text !== cur.text) onChange(list.map((st) => st.id === editingId ? { ...st, text } : st))
    setEditingId(null)
  }

  return (
    <div className="steps">
      <div className="steps-head">
        <span className="steps-label">{label}</span>
        {list.length > 0 && <span className="steps-count">{doneCount}/{list.length} done</span>}
      </div>

      {visible.map((st) => {
        const idx = list.findIndex((x) => x.id === st.id)
        const editing = editingId === st.id
        return (
          <div key={st.id} className={'step-row' + (st.done ? ' done' : '')}>
            <button type="button" className={'step-check' + (st.done ? ' done' : st.id === nextId ? ' next' : '')}
              onClick={() => toggle(st.id)} aria-label={st.done ? `Uncheck ${st.text}` : `Check off ${st.text}`} aria-pressed={st.done}>
              {st.done && <Check size={13} strokeWidth={3} color="var(--warm-white)" />}
            </button>
            {editing ? (
              <div className="step-edit">
                <input autoFocus value={editText} onChange={(e) => setEditText(e.target.value)} aria-label="Edit step"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); saveEdit() }
                    if (e.key === 'Escape') { e.preventDefault(); setEditingId(null) }
                  }} />
                <div className="step-tools">
                  <button type="button" className="step-tool" onClick={() => move(st.id, -1)} disabled={idx === 0} aria-label="Move up"><ChevronUp size={16} /></button>
                  <button type="button" className="step-tool" onClick={() => move(st.id, 1)} disabled={idx === list.length - 1} aria-label="Move down"><ChevronDown size={16} /></button>
                  {onSchedule && (
                    <button type="button" className="step-tool wide" onClick={() => { setEditingId(null); onSchedule({ ...st, text: editText.trim() || st.text }) }}>
                      <CalendarPlus size={15} /> Schedule
                    </button>
                  )}
                  <button type="button" className="step-tool danger" onClick={() => remove(st.id)} aria-label="Delete step"><Trash2 size={15} /></button>
                  <button type="button" className="step-tool primary" onClick={saveEdit}>Done</button>
                </div>
              </div>
            ) : (
              <button type="button" className="step-text" onClick={() => startEdit(st)} title="Tap to edit">
                {st.text}
                {st.id === nextId && <span className="step-next-tag">Next</span>}
              </button>
            )}
          </div>
        )
      })}

      {doneCount > 3 && (
        <button type="button" className="steps-more" onClick={() => setShowDone((v) => !v)}>
          {showDone ? 'Hide completed' : `Show ${doneCount} completed`}
        </button>
      )}

      {list.length > 0 && doneCount === list.length && (
        <div className="steps-complete">
          <Flag size={15} color="var(--success)" />
          <span>Every step is checked off.</span>
          {completeSlot}
        </div>
      )}

      <div className="step-add">
        <Plus size={16} color="var(--brass2)" />
        <input value={draft} placeholder={list.length ? 'Add another step' : 'Add the first step'}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDraft() } }}
          onPaste={(e) => {
            const text = e.clipboardData?.getData('text') || ''
            if (/\r?\n/.test(text.trim())) { e.preventDefault(); addLines(parseStepLines(draft + text)); setDraft('') }
          }}
          aria-label="New step" enterKeyHint="done" />
        {draft.trim() && <button type="button" onClick={addDraft}>Add</button>}
      </div>
      {hint && <div className="steps-hint">{hint}</div>}
    </div>
  )
}

const EMPTY_ICON_MAP = {
  '✈': Plane, '✝': Cross, '🍳': ChefHat, '🎁': Gift, '🎂': Cake, '🎯': Target, '💊': Pill, '💪': Dumbbell,
  '💳': CreditCard, '💵': Banknote, '📁': Folder, '📈': TrendingUp, '📉': TrendingDown, '📖': BookOpen,
  '📚': BookMarked, '📝': PenLine, '🔁': Repeat, '🧾': Receipt,
}
function EmptyState({ icon, title, message, action, onAction }) {
  const Ic = typeof icon === 'string' ? EMPTY_ICON_MAP[icon.replace(/\uFE0F/g, '')] : icon
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '40px 24px', textAlign: 'center',
    }}>
      <div style={{
        width: 68, height: 68, borderRadius: '50%', marginBottom: 16,
        display: 'grid', placeItems: 'center',
        background: 'radial-gradient(circle at 30% 25%, #FBF6EC 0%, var(--brass-dim) 100%)',
        border: '1px solid var(--brass-glow)',
        boxShadow: '0 8px 22px rgba(184,150,90,.14)',
      }}>{Ic ? <Ic size={28} strokeWidth={1.5} color="var(--brass2)" /> : <span style={{ fontSize: '1.8rem' }}>{icon}</span>}</div>
      <div style={{
        fontWeight: 700, fontSize: '1rem', color: 'var(--ink)',
        marginBottom: 8,
      }}>{title}</div>
      <p style={{
        fontSize: '.85rem', color: 'var(--ink2)', lineHeight: 1.6,
        maxWidth: 260, marginBottom: action ? 20 : 0,
      }}>{message}</p>
      {action && (
        <button onClick={onAction} style={{
          padding: '10px 22px', borderRadius: 999,
          background: 'var(--ink)', color: 'var(--warm-white)',
          border: 'none', fontSize: '.88rem', fontWeight: 600,
          cursor: 'pointer', transition: 'opacity .15s',
        }}
          onMouseEnter={e => e.target.style.opacity = '.85'}
          onMouseLeave={e => e.target.style.opacity = '1'}
        >{action}</button>
      )}
    </div>
  )
}

// ── Onboarding Walkthrough ────────────────────────────────────────────────
const ONBOARDING_STEPS = [
  {
    icon: '👋',
    title: 'Welcome to The Living Planner',
    message: "A complete life planning system built around faith, discipline, and intentional growth. Let's take a quick tour.",
    cta: 'Get Started',
  },
  {
    icon: '✝',
    title: 'Faith First',
    message: 'Begin each morning in stillness. Devotional, prayer, scripture, and gratitude — woven into your day.',
    cta: 'Next →',
  },
  {
    icon: '✓',
    title: 'Daily Tasks & Habits',
    message: 'Small disciplines, repeated daily, become a different life. Plan your tasks, track your habits.',
    cta: 'Next →',
  },
  {
    icon: '🎯',
    title: 'Goals & Growth',
    message: 'Aim higher. Set goals across nine dimensions of life. Reflect each Sunday. Watch yourself grow.',
    cta: 'Next →',
  },
  {
    icon: '💰',
    title: 'Financial Clarity',
    message: 'Stewardship begins with clarity. Budget weekly. Track honestly. Build wealth slowly.',
    cta: 'Next →',
  },
  {
    icon: '🌿',
    title: 'Whole-Life Wellness',
    message: 'You are body, mind, and spirit. The Living Planner honors all three.',
    cta: 'Start Planning',
  },
]

function OnboardingWalkthrough({ onComplete }) {
  const [step, setStep] = React.useState(0)
  const current = ONBOARDING_STEPS[step]
  const isLast = step === ONBOARDING_STEPS.length - 1

  const next = () => {
    if (isLast) {
      try { localStorage.setItem('planner_onboarded', '1') } catch {}
      onComplete()
    } else {
      setStep(s => s + 1)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(10,18,30,.92)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        background: 'var(--warm-white, white)',
        borderRadius: 24, padding: '44px 32px',
        maxWidth: 380, width: '100%', textAlign: 'center',
        boxShadow: '0 32px 80px rgba(0,0,0,.4)',
      }}>
        {/* Progress dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 32 }}>
          {ONBOARDING_STEPS.map((_, i) => (
            <div key={i} style={{
              width: i === step ? 20 : 7, height: 7, borderRadius: 999,
              background: i === step ? 'var(--teal, #2A9D8F)' : 'var(--border2, #E5E7EB)',
              transition: 'all .3s ease',
            }} />
          ))}
        </div>

        {/* Icon */}
        <div style={{ fontSize: '3.5rem', marginBottom: 20 }}>{current.icon}</div>

        {/* Title */}
        <h2 style={{
          fontSize: '1.25rem', fontWeight: 700,
          color: 'var(--ink, #1A2332)', marginBottom: 12, lineHeight: 1.3,
        }}>{current.title}</h2>

        {/* Message */}
        <p style={{
          fontSize: '.9rem', color: 'var(--ink2, #4B5563)',
          lineHeight: 1.7, marginBottom: 32,
        }}>{current.message}</p>

        {/* CTA button */}
        <button onClick={next} style={{
          width: '100%', padding: '13px',
          background: 'var(--teal, #2A9D8F)', color: 'white',
          border: 'none', borderRadius: 12,
          fontSize: '1rem', fontWeight: 700, cursor: 'pointer',
          transition: 'all .2s',
        }}
          onMouseEnter={e => e.target.style.opacity = '.88'}
          onMouseLeave={e => e.target.style.opacity = '1'}
        >{current.cta}</button>

        {/* Skip */}
        {!isLast && (
          <button onClick={() => {
            try { localStorage.setItem('planner_onboarded', '1') } catch {}
            onComplete()
          }} style={{
            marginTop: 14, background: 'none', border: 'none',
            color: 'var(--muted, #9CA3AF)', fontSize: '.82rem',
            cursor: 'pointer',
          }}>Skip tour</button>
        )}
      </div>
    </div>
  )
}


// ── Add to Home Screen (PWA install instructions) ────────────────
const A2HS_PLATFORMS = [
  { os: 'iPhone & iPad · Safari', steps: ['Tap the Share button (square with an arrow) — bottom of the screen on iPhone, top on iPad', 'Scroll down and tap "Add to Home Screen"', 'Tap "Add" — then open the planner from that icon'] },
  { os: 'iPhone & iPad · Chrome', steps: ['Tap the Share button in the address bar', 'Tap "Add to Home Screen"', 'Tap "Add" — then open the planner from that icon'] },
  { os: 'Android · Chrome', steps: ['Tap the three-dot menu ⋮ at the top right', 'Tap "Add to Home screen" or "Install app"', 'Tap "Add" — then open the planner from that icon'] },
]

function isStandalone() {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
  } catch { return false }
}

function A2HSInstructions() {
  return (
    <div style={{ textAlign: 'left' }}>
      <p style={{ fontSize: '.9rem', color: 'var(--ink2,#4B5563)', lineHeight: 1.65, marginBottom: 18, textAlign: 'center' }}>
        The Living Planner works like a native app — add it to your Home Screen for instant, full-screen, one-tap access.
      </p>
      {A2HS_PLATFORMS.map(p => (
        <div key={p.os} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: '.64rem', fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--brass2)', marginBottom: 8 }}>{p.os}</div>
          {p.steps.map((step, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 6, alignItems: 'flex-start' }}>
              <span style={{ flexShrink: 0, width: 20, height: 20, borderRadius: 999, background: 'var(--ink)', color: 'var(--brass)', fontSize: '.7rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>{i + 1}</span>
              <span style={{ fontSize: '.86rem', color: 'var(--ink2,#4B5563)', lineHeight: 1.5 }}>{step}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function A2HSModal({ onClose }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(10,18,30,.92)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--warm-white,white)', borderRadius: 24, padding: '36px 28px', maxWidth: 400, width: '100%', boxShadow: '0 32px 80px rgba(0,0,0,.4)', maxHeight: '88vh', overflowY: 'auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <div style={{ marginBottom: 12 }}><BrandMark size={48} ink="#FDFCFA" /></div>
          <h2 style={{ fontFamily: 'var(--serif)', fontSize: '1.6rem', fontWeight: 500, color: 'var(--ink)', margin: 0 }}>Add to Your Home Screen</h2>
        </div>
        <A2HSInstructions />
        <button onClick={onClose} style={{ width: '100%', padding: '13px', marginTop: 8, background: 'var(--ink)', color: 'var(--warm-white)', border: 'none', borderRadius: 999, fontSize: '1rem', fontWeight: 700, cursor: 'pointer' }}>Got it</button>
      </div>
    </div>
  )
}


// ── Quick Access Grid — shown at top of each page ─────────────────────────
// ── Icon system — one consistent line-icon set instead of platform emoji ─
const SECTION_ICONS = {
  // Finance
  overview: LayoutDashboard, income: Banknote, expenses: CreditCard, savings: PiggyBank, debt: TrendingDown,
  donations: HeartHandshake, budget: ClipboardList, nospend: CircleSlash,
  // Wellness
  mood: Smile, sleep: Moon, journal: PenLine, routine: Sunrise, reading: BookOpen, meds: Pill,
  metrics: Activity, anxiety: Wind, migraines: CloudLightning, coping: Shield, training: Dumbbell, recovery: BatteryCharging, nutrition: Utensils, care: Stethoscope,
  // Productivity
  tasks: SquareCheck, braindump: Brain, notes: StickyNote, checklists: ListChecks, focus: Timer, cleaning: Sparkles, tips: Lightbulb,
  // Lifestyle
  groceries: ShoppingCart, recipes: ChefHat, trips: Plane, birthdays: Cake, gifts: Gift,
  // Faith
  devotional: BookOpen, prayer: HandHeart, scripture: ScrollText, gratitude: Flower2, fasting: Hourglass, sermons: Mic, goals: Target,
}
const FAITH_ICON_OVERRIDES = { reading: BookMarked }
// Labels in the TABS arrays still start with an emoji — strip it for display
const stripEmoji = (label = '') => String(label).replace(/^[^\p{L}\p{N}]+\s*/u, '')

// Brand mark — brass circle, diamond and cross (matches the printable planner)
function BrandMark({ size = 56, color = 'var(--brass)', ink = 'var(--ink)' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" style={{ display: 'block', margin: '0 auto' }}>
      <circle cx="32" cy="32" r="29" fill="none" stroke={color} strokeWidth="1.6" />
      <circle cx="32" cy="32" r="24.5" fill="none" stroke={color} strokeWidth=".6" opacity=".55" />
      <path d="M32 15 L49 32 L32 49 L15 32 Z" fill={color} />
      <path d="M32 23.5 V40.5 M26 31 H38" stroke={ink} strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}

// Page header — a real title instead of a tiny emoji eyebrow
function PageHeader({ icon: Icon, eyebrow, title, subtitle }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '4px 2px 6px' }}>
      <div style={{
        width: 46, height: 46, borderRadius: 14, flexShrink: 0,
        background: 'linear-gradient(145deg, var(--ink) 0%, #2C2C2E 100%)',
        display: 'grid', placeItems: 'center',
        boxShadow: '0 6px 18px rgba(28,28,30,.18), inset 0 0 0 1px rgba(184,150,90,.28)',
      }}>
        {Icon && <Icon size={22} strokeWidth={1.6} color="var(--brass)" />}
      </div>
      <div style={{ minWidth: 0 }}>
        {eyebrow && <p style={{ fontSize: '.6rem', fontWeight: 700, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--brass)', margin: '0 0 2px' }}>{eyebrow}</p>}
        <h1 style={{ fontFamily: 'var(--serif)', fontWeight: 500, fontSize: '1.85rem', lineHeight: 1.05, letterSpacing: '-.015em', color: 'var(--ink)', margin: 0 }}>{title}</h1>
        {subtitle && <p style={{ fontSize: '.8rem', color: 'var(--muted)', margin: '3px 0 0', lineHeight: 1.35 }}>{subtitle}</p>}
      </div>
    </div>
  )
}

function QuickAccessGrid({ tabs, activeTab, onSelect, proTabs = [], isPro = false, iconOverrides = {} }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(76px, 1fr))',
      gap: 8,
      marginBottom: 16,
    }}>
      {tabs.map(t => {
        const active = activeTab === t.id
        const isLocked = !isPro && proTabs.includes(t.id)
        const name = stripEmoji(t.label)
        const Icon = iconOverrides[t.id] || SECTION_ICONS[t.id]
        const fallback = (t.label.match(/^(\S+)\s/) || [])[1] || t.label[0]
        return (
          <button key={t.id} onClick={() => onSelect(t.id)} aria-pressed={active} style={{
            position: 'relative',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: 6,
            padding: '12px 4px 10px',
            borderRadius: 14,
            border: active ? '1px solid var(--ink)' : '1px solid var(--border)',
            background: active ? 'linear-gradient(160deg, var(--ink) 0%, #2C2C2E 100%)' : 'var(--warm-white)',
            boxShadow: active ? '0 8px 20px rgba(28,28,30,.22), inset 0 0 0 1px rgba(184,150,90,.25)' : '0 1px 2px rgba(28,28,30,.04)',
            cursor: 'pointer',
            transition: 'all .18s ease',
            minHeight: 70,
            opacity: isLocked ? .62 : 1,
          }}>
            {Icon
              ? <Icon size={21} strokeWidth={1.6} color={active ? 'var(--brass)' : 'var(--ink2)'} />
              : <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>{fallback}</span>}
            <span style={{
              fontSize: '.66rem', fontWeight: 600,
              color: active ? 'var(--warm-white)' : 'var(--ink2)',
              textAlign: 'center', lineHeight: 1.2,
              letterSpacing: '.02em',
            }}>{name}</span>
            {isLocked && (
              <span style={{ position: 'absolute', top: 6, right: 6, display: 'grid', placeItems: 'center' }}>
                <Lock size={11} strokeWidth={2} color="var(--brass2)" />
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ── Tab Navigator — prev/next pills ──────────────────────────────────────
function TabNav({ tabs, activeTab, onSelect }) {
  const idx = tabs.findIndex(t => t.id === activeTab)
  const prev = idx > 0 ? tabs[idx - 1] : null
  const next = idx < tabs.length - 1 ? tabs[idx + 1] : null
  if (!prev && !next) return null
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      marginTop: 24, paddingTop: 16, paddingBottom: 80,
      borderTop: '1px solid var(--border)',
      gap: 8,
    }}>
      {prev ? (
        <button onClick={() => onSelect(prev.id)} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '9px 16px', borderRadius: 999,
          border: '1.5px solid var(--border2)', background: 'var(--stone)',
          color: 'var(--ink2)', fontSize: '.82rem', fontWeight: 600,
          cursor: 'pointer', transition: 'all .15s',
        }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--brass)'; e.currentTarget.style.color = 'var(--brass2)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.color = 'var(--ink2)' }}
        >
          ← {stripEmoji(prev.label)}
        </button>
      ) : <div />}
      {next ? (
        <button onClick={() => onSelect(next.id)} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '9px 16px', borderRadius: 999,
          border: '1px solid var(--ink)', background: 'var(--ink)',
          color: 'var(--warm-white)', fontSize: '.82rem', fontWeight: 600,
          cursor: 'pointer', transition: 'all .15s',
        }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '.85' }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
        >
          {stripEmoji(next.label)} →
        </button>
      ) : <div />}
    </div>
  )
}




function FinancePage({ expenses, budget, setBudget, saveItem, deleteItem, goals, isPro = false, onUpgrade = () => {} }) {
  const { user } = useAuth()

  // Generic Supabase sync for FinancePage state
  const syncPageData = React.useCallback(async (key, value) => {
    try { localStorage.setItem('planner.f.' + key, JSON.stringify(value)) } catch {}
    if (!user || !hasSupabaseEnv) return
    try {
      await supabase.from('page_data').upsert({
        user_id: user.id, page: 'finance', data_key: key, data_value: value,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,page,data_key' })
    } catch (e) { console.error('Finance sync error:', e) }
  }, [user?.id])

  // Load finance data from Supabase on mount
  React.useEffect(() => {
    if (!user || !hasSupabaseEnv) return
    supabase.from('page_data')
      .select('data_key, data_value')
      .eq('user_id', user.id).eq('page', 'finance')
      .then(({ data, error }) => {
        if (error || !data) return
        data.forEach(row => {
          if (row.data_key === 'incomes') setIncomes(row.data_value || [])
          if (row.data_key === 'bills') setBills(row.data_value || [])
          if (row.data_key === 'debts') setDebts(row.data_value || [])
          if (row.data_key === 'savingsGoals') setSavingsGoals(row.data_value || [])
          if (row.data_key === 'donations') setDonations(row.data_value || [])
          if (row.data_key === 'netWorthHistory') setNetWorthHistory(row.data_value || [])
          if (row.data_key === 'sinkingFunds') setSinkingFunds(row.data_value || [])
          if (row.data_key === 'noSpend') setNoSpend(row.data_value || { days: 30, checked: [] })
          if (row.data_key === 'weekPlan') setCheckedWeeks(row.data_value || [])
          if (row.data_key === 'challengeGoal') setChallengeGoal(row.data_value || 10000)
        })
      })

    const channel = supabase
      .channel('finance_realtime_' + user.id)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'page_data',
        filter: `user_id=eq.${user.id}`,
      }, payload => {
        const row = payload.new
        if (!row || row.page !== 'finance') return
        if (row.data_key === 'incomes') setIncomes(row.data_value || [])
        if (row.data_key === 'bills') setBills(row.data_value || [])
        if (row.data_key === 'debts') setDebts(row.data_value || [])
        if (row.data_key === 'savingsGoals') setSavingsGoals(row.data_value || [])
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user?.id])

  const lsGet = (k, d) => { try { const v = localStorage.getItem('planner.f.' + k); return v ? JSON.parse(v) : d } catch { return d } }
  const lsSet = (k, v) => { try { localStorage.setItem('planner.f.' + k, JSON.stringify(v)) } catch {} }

  const [tab, setTab] = useUrlTab('overview')
  const [period, setPeriod] = useState('monthly')

  // ── Shared state (linked across tabs) ─────────────────────────────────
  const [incomes, setIncomes] = useState(() => lsGet('incomes', []))
  const saveIncomes = (v) => { setIncomes(v); syncPageData('incomes', v) }

  // ── Income is logged per month: each month starts fresh ───────────────
  const CUR_MONTH = TODAY.slice(0, 7)
  const ymOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  // Older entries have no month saved — place them in the month they were added (id is a timestamp)
  const incomeMonthOf = (inc) => inc.month || (inc.date ? String(inc.date).slice(0, 7)
    : (inc.id && !isNaN(Number(inc.id)) ? ymOf(new Date(Number(inc.id))) : CUR_MONTH))
  const monthLabel = (mk, opts = { month: 'long', year: 'numeric' }) => new Date(`${mk}-01T12:00:00`).toLocaleDateString('en-US', opts)
  const shiftMonth = (mk, n) => { const d = new Date(`${mk}-01T12:00:00`); d.setMonth(d.getMonth() + n); return ymOf(d) }
  // Entries made under the old "income source" form were recurring (weekly/quarterly/etc.) — count their monthly equivalent
  const INCOME_MULT = { weekly: 1, biweekly: 2, monthly: 4.33, quarterly: 13, yearly: 52 }
  const incomeInMonth = (inc) => inc.period && INCOME_MULT[inc.period] && inc.period !== 'monthly'
    ? Number(inc.amount || 0) / INCOME_MULT[inc.period] * 4.33
    : Number(inc.amount || 0)
  const incomesForMonth = (mk) => incomes.filter(inc => incomeMonthOf(inc) === mk)
  const incomeTotalForMonth = (mk) => incomesForMonth(mk).reduce((s, inc) => s + incomeInMonth(inc), 0)
  const [incomeView, setIncomeView] = useState(CUR_MONTH)
  const defaultIncomeDate = (mk) => mk === CUR_MONTH ? TODAY : `${mk}-01`
  const [newIncome, setNewIncome] = useState({ label: '', amount: '', category: 'Primary', date: TODAY })
  React.useEffect(() => { setNewIncome(p => ({ ...p, date: defaultIncomeDate(incomeView) })) }, [incomeView])

  const [bills, setBills] = useState(() => lsGet('bills', []))
  const [newBill, setNewBill] = useState({ label: '', amount: '', category: 'Need', frequency: 'monthly' })
  const saveBills = (v) => { setBills(v); syncPageData('bills', v) }

  const [debts, setDebts] = useState(() => lsGet('debts', []))
  const [newDebt, setNewDebt] = useState({ name: '', balance: '', rate: '', minPayment: '' })
  const saveDebts = (d) => { setDebts(d); syncPageData('debts', d) }

  const [savingsGoals, setSavingsGoals] = useState(() => lsGet('savingsGoals', [
    { id: 1, label: 'Emergency Fund', goal: 1000, current: 0, color: 'var(--teal)' },
  ]))
  const [newSavings, setNewSavings] = useState({ label: '', goal: '', current: '' })
  const [editingSavings, setEditingSavings] = useState({})
  const saveSavingsGoals = (v) => { setSavingsGoals(v); syncPageData('savingsGoals', v) }

  const [noSpend, setNoSpend] = useState(() => lsGet('noSpend', { days: 30, checked: [] }))
  const saveNoSpend = (n) => { setNoSpend(n); syncPageData('noSpend', n) }

  const [monthlyIncome, setMonthlyIncome] = useState(() => lsGet('monthlyIncome', 0))
  const saveMonthlyIncome = (v) => { setMonthlyIncome(v); lsSet('monthlyIncome', v) }

  // 52-week plan
  const WEEK_PLAN = [150,200,150,250,200,150,200,250,150,200,150,250,200,150,200,250,150,200,150,200,250,150,200,150,200,250,150,200,150,250,200,150,200,250,150,200,150,250,200,150,200,250,150,200,150,200,250,150,200,150,200,250]
  const currentWeekNum = Math.ceil((new Date(TODAY) - new Date(new Date(TODAY).getFullYear(), 0, 1)) / (7 * 24 * 60 * 60 * 1000))
  const [checkedWeeks, setCheckedWeeks] = useState(() => lsGet('weekPlan', []))
  const [challengeGoal, setChallengeGoal] = useState(() => lsGet('challengeGoal', 10000))
  const [netWorthHistory, setNetWorthHistory] = useState(() => lsGet('netWorthHistory', []))
  const saveNetWorth = (h) => { setNetWorthHistory(h); syncPageData('netWorthHistory', h) }
  const [newNetWorth, setNewNetWorth] = useState({assets:'', liabilities:'', date:TODAY})
  const [sinkingFunds, setSinkingFunds] = useState(() => lsGet('sinkingFunds', []))
  const saveSinkingFunds = (f) => { setSinkingFunds(f); syncPageData('sinkingFunds', f) }
  const [newSinking, setNewSinking] = useState({name:'', target:'', current:'', dueDate:''})
  const [donations, setDonations] = useState(() => lsGet('donations', []))
  const saveDonations = (d) => { setDonations(d); syncPageData('donations', d) }
  const [newDonation, setNewDonation] = useState({ recipient: '', amount: '', category: 'Tithe', date: TODAY, taxDeductible: true })
  const [addingExpense, setAddingExpense] = useState(false)
  const [showNetWorthForm, setShowNetWorthForm] = useState(false)
  const [showSinkingForm, setShowSinkingForm] = useState(false)
  const [newExpense, setNewExpense] = useState({desc:'',amount:'',category:'Food',period:'one-time',date:TODAY})
  const saveCheckedWeeks = (v) => { setCheckedWeeks(v); syncPageData('weekPlan', v) }
  const saveChallengeGoal = (v) => { setChallengeGoal(v); syncPageData('challengeGoal', v) }
  const toggleWeek = (w) => saveCheckedWeeks(checkedWeeks.includes(w) ? checkedWeeks.filter(x => x !== w) : [...checkedWeeks, w])
  const totalSavedSoFar = checkedWeeks.reduce((s, w) => s + (WEEK_PLAN[w - 1] || 0), 0)

  // ── Shared computations (linked across all tabs) ───────────────────────
  const PERIOD_MULT = { weekly: 1, monthly: 4.33, quarterly: 13, yearly: 52 }
  // Everything else on the Finance page (overview, budget plan, cash flow, savings ETA) uses this month's logged income
  const totalWeeklyIncome = incomeTotalForMonth(CUR_MONTH) / 4.33
  const incomeLabel = period === 'monthly' ? `Income (${monthLabel(CUR_MONTH, { month: 'long' })})` : `Income (${period}, from ${monthLabel(CUR_MONTH, { month: 'short' })})`
  const getIncomeForPeriod = (p) => totalWeeklyIncome * (PERIOD_MULT[p] || 4.33)
  const totalIncomeForPeriod = getIncomeForPeriod(period)

  const fpWeekStart = startOfWeek(TODAY)
  const fpWeekEnd = endOfWeek(TODAY)
  // Helper: convert any expense to weekly equivalent based on its period
  const toWeekly = (e) => {
    const amt = parseFloat(e.amount || 0)
    const p = e.period || 'one-time'
    if (p === 'weekly') return amt
    if (p === 'biweekly') return amt / 2
    if (p === 'monthly') return amt / 4.33
    if (p === 'yearly') return amt / 52
    return amt  // one-time
  }
  // One-time expenses: only count if in date range
  // Recurring expenses: always count as weekly equivalent
  const fpOneTimeWeek = (expenses || [])
    .filter(e => (e.period || 'one-time') === 'one-time' && e.date >= fpWeekStart && e.date <= fpWeekEnd)
    .reduce((s, e) => s + parseFloat(e.amount || 0), 0)
  const fpRecurringWeek = (expenses || [])
    .filter(e => (e.period || 'one-time') !== 'one-time')
    .reduce((s, e) => s + toWeekly(e), 0)
  const fpWeekSpend = fpOneTimeWeek + fpRecurringWeek

  const fpOneTimeMonth = (expenses || [])
    .filter(e => (e.period || 'one-time') === 'one-time' && e.date && e.date.slice(0,7) === TODAY.slice(0,7))
    .reduce((s, e) => s + parseFloat(e.amount || 0), 0)
  const fpRecurringMonth = fpRecurringWeek * 4.33
  const fpMonthSpend = fpOneTimeMonth + fpRecurringMonth

  // Convert each bill to monthly equivalent based on its frequency
  const billToMonthly = (b) => {
    const amt = Number(b.amount || 0)
    const freq = b.frequency || 'monthly'
    if (freq === 'weekly') return amt * 4.33
    if (freq === 'biweekly') return amt * 2.17
    if (freq === 'monthly') return amt
    if (freq === 'quarterly') return amt / 3
    if (freq === 'yearly') return amt / 12
    return amt
  }
  const totalBillsMonthly = bills.reduce((s, b) => s + billToMonthly(b), 0)
  const totalBillsForPeriod = totalBillsMonthly * ((PERIOD_MULT[period] || 4.33) / 4.33)
  const totalDebtPayments = debts.reduce((s, d) => s + Number(d.minPayment || 0), 0)
  const totalSavingsStored = savingsGoals.reduce((s, g) => s + Number(g.current || 0), 0)

  // 50/30/20
  const needs50 = totalIncomeForPeriod * 0.5
  const wants30 = totalIncomeForPeriod * 0.3
  const savings20 = totalIncomeForPeriod * 0.2

  const noSpendFilled = noSpend.checked.length
  const daysArray = Array.from({ length: noSpend.days }, (_, i) => i + 1)

  const fmt = (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  // ── Bank connection state ─────────────────────────────────────────────
  const [connectedBanks, setConnectedBanks] = useState(() => lsGet('connectedBanks', []))
  const [bankTransactions, setBankTransactions] = useState(() => lsGet('bankTransactions', []))
  const [plaidLinkToken, setPlaidLinkToken] = useState(null)
  const [bankLoading, setBankLoading] = useState(false)
  const [bankError, setBankError] = useState('')
  const [autoImport, setAutoImport] = useState(() => lsGet('autoImport', { income: true, expenses: true }))
  const saveBanks = (v) => { setConnectedBanks(v); lsSet('connectedBanks', v) }
  const saveBankTx = (v) => { setBankTransactions(v); lsSet('bankTransactions', v) }
  const saveAutoImport = (v) => { setAutoImport(v); lsSet('autoImport', v) }

  // Simulate bank fetch (real version calls /api/plaid/transactions)
  const fetchBankTransactions = async (bankId) => {
    setBankLoading(true)
    setBankError('')
    try {
      const res = await fetch('/api/plaid/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bankId, days: 30 })
      })
      if (!res.ok) throw new Error('Could not fetch transactions')
      const data = await res.json()
      const existing = bankTransactions.filter(t => t.bankId !== bankId)
      saveBankTx([...existing, ...data.transactions])
    } catch(e) {
      setBankError(e.message)
    } finally {
      setBankLoading(false)
    }
  }

  // Categorize transaction as income or expense
  const categorizeTransaction = (tx) => {
    const amount = Number(tx.amount)
    if (amount < 0) return 'income'   // Plaid uses negative for credits
    return 'expense'
  }

  const TABS = [
    { id: 'overview', label: '📊 Overview' },
    { id: 'income', label: '💵 Income' },
    { id: 'expenses', label: '💳 Expenses & Bills' },
    { id: 'savings', label: '💰 Savings' },
    { id: 'debt', label: '📉 Debt' },
    { id: 'donations', label: '✝️ Giving' },
    { id: 'budget', label: '📋 Budget Plan' },
    { id: 'nospend', label: '🌿 No-Spend' },
  ]

  const PeriodPills = () => (
    <div className="pill-row" style={{marginBottom:14,gap:6}}>
      {['weekly','monthly','quarterly','yearly'].map(p => (
        <button key={p} className={period===p?'pill active-pill':'pill'}
          onClick={()=>setPeriod(p)} style={{fontSize:'.78rem',textTransform:'capitalize'}}>{p}</button>
      ))}
    </div>
  )

  return (
    <div className="screen-stack">
      <PageHeader icon={Wallet} title="Finance" subtitle="Steward what you've been given" />
      <QuickAccessGrid tabs={TABS} activeTab={tab} onSelect={setTab} proTabs={PRO_TABS.finance} isPro={isPro} />

      {/* ── OVERVIEW ─────────────────────────────────────────────────────── */}
      {tab === 'overview' && (
        <section className="card">
          {/* Net Worth Tracker */}
          {(() => {
            const latest = netWorthHistory[netWorthHistory.length-1]
            const prev = netWorthHistory[netWorthHistory.length-2]
            const netWorth = latest ? (Number(latest.assets) - Number(latest.liabilities)) : 0
            const change = (latest && prev) ? netWorth - (Number(prev.assets) - Number(prev.liabilities)) : 0
            return (
              <div style={{
                background: 'linear-gradient(135deg, var(--ink) 0%, var(--navy, #0B1829) 100%)',
                borderRadius: 14, padding: '18px 20px', marginBottom: 16, color: 'white',
              }}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
                  <div>
                    <p style={{fontSize:'.62rem',fontWeight:700,letterSpacing:'.1em',color:'var(--brass)',textTransform:'uppercase',margin:'0 0 4px'}}>Net Worth</p>
                    <strong style={{fontSize:'1.6rem',display:'block'}}>{fmt(netWorth)}</strong>
                    {change !== 0 && (
                      <span style={{fontSize:'.78rem',color: change > 0 ? '#22C55E' : '#EF4444',fontWeight:600}}>
                        {change > 0 ? '↑' : '↓'} {fmt(Math.abs(change))} from last entry
                      </span>
                    )}
                  </div>
                  <button onClick={() => setShowNetWorthForm(!showNetWorthForm)} style={{
                    padding:'6px 14px',borderRadius:999,background:'rgba(184,150,90,.18)',
                    color:'var(--brass)',border:'1px solid rgba(184,150,90,.35)',
                    fontSize:'.78rem',fontWeight:600,cursor:'pointer',
                  }}>{showNetWorthForm ? 'Cancel' : '+ Update'}</button>
                </div>
                {showNetWorthForm && (
                  <div style={{marginTop:14,padding:14,background:'rgba(255,255,255,.05)',borderRadius:10,display:'grid',gap:8}}>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                      <input type="number" placeholder="Total assets ($)" value={newNetWorth.assets}
                        onChange={e => setNewNetWorth(p => ({...p, assets: e.target.value}))}
                        style={{padding:'9px 12px',border:'1px solid rgba(255,255,255,.2)',borderRadius:8,fontSize:'.88rem',background:'rgba(255,255,255,.1)',color:'white'}} />
                      <input type="number" placeholder="Total liabilities ($)" value={newNetWorth.liabilities}
                        onChange={e => setNewNetWorth(p => ({...p, liabilities: e.target.value}))}
                        style={{padding:'9px 12px',border:'1px solid rgba(255,255,255,.2)',borderRadius:8,fontSize:'.88rem',background:'rgba(255,255,255,.1)',color:'white'}} />
                    </div>
                    <button onClick={() => {
                      if(!newNetWorth.assets) return
                      saveNetWorth([...netWorthHistory, {...newNetWorth, id: Date.now(), assets: Number(newNetWorth.assets), liabilities: Number(newNetWorth.liabilities||0)}])
                      setNewNetWorth({assets:'', liabilities:'', date:TODAY})
                      setShowNetWorthForm(false)
                    }} style={{padding:'10px',background:'var(--brass)',color:'white',border:'none',borderRadius:8,fontWeight:600,cursor:'pointer'}}>Save Snapshot</button>
                  </div>
                )}
                {netWorthHistory.length > 1 && (
                  <div style={{marginTop:12,display:'flex',alignItems:'flex-end',gap:2,height:40}}>
                    {netWorthHistory.slice(-12).map((nw, i) => {
                      const val = Number(nw.assets) - Number(nw.liabilities)
                      const max = Math.max(...netWorthHistory.slice(-12).map(x => Number(x.assets) - Number(x.liabilities)))
                      const h = Math.max(4, (val / max) * 100)
                      return <div key={i} style={{flex:1,height:h+'%',background:'var(--brass)',borderRadius:'2px 2px 0 0',opacity:.6}} />
                    })}
                  </div>
                )}
              </div>
            )
          })()}

          <p className="eyebrow">Financial Overview</p>
          <h3 style={{ margin: '4px 0 14px' }}>Your Money at a Glance</h3>
          <PeriodPills />
          {[
            [incomeLabel, fmt(totalIncomeForPeriod), 'var(--success)'],
            ['Total Bills', fmt(totalBillsForPeriod), 'var(--danger)'],
            ['Expenses (tracked)', fmt(fpWeekSpend * (PERIOD_MULT[period]||4.33)), 'var(--warning,#f90)'],
            ['Debt Min Payments', fmt(totalDebtPayments * ((PERIOD_MULT[period]||4.33)/4.33)), 'var(--danger)'],
            ['Net Available', fmt(totalIncomeForPeriod - totalBillsForPeriod - totalDebtPayments * ((PERIOD_MULT[period]||4.33)/4.33) - fpWeekSpend * (PERIOD_MULT[period]||4.33)), totalIncomeForPeriod > totalBillsForPeriod ? 'var(--success)' : 'var(--danger)'],
            ['This Week Spend', fmt(fpWeekSpend), 'var(--brass)'],
            ['This Month Spend', fmt(fpMonthSpend), 'var(--slate)'],
            ['Total Saved (goals)', fmt(totalSavingsStored), 'var(--teal)'],
          ].map(([label, val, col]) => (
            <div key={label} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'9px 0',borderBottom:'1px solid var(--border)'}}>
              <span style={{fontSize:'.88rem',color:'var(--ink2)'}}>{label}</span>
              <strong style={{color:col}}>{val}</strong>
            </div>
          ))}

          {/* 50/30/20 */}
          <div style={{marginTop:18,background:'var(--stone)',borderRadius:12,padding:'16px'}}>
            <p className="eyebrow" style={{marginBottom:6}}>50 / 30 / 20 Rule</p>
            <p className="muted" style={{fontSize:'.78rem',marginBottom:12}}>Based on {period === 'monthly' ? `${monthLabel(CUR_MONTH, { month: 'long' })}'s` : `your ${period}`} income of {fmt(totalIncomeForPeriod)}</p>
            {[
              ['50% Needs', needs50, '#4CAF50', 'Rent, utilities, groceries, insurance, min debt payments'],
              ['30% Wants', wants30, '#FF9800', 'Dining, shopping, subscriptions, gym, travel'],
              ['20% Savings & Debt', savings20, '#9C27B0', 'Emergency fund, investments, extra debt payments'],
            ].map(([label, amt, col, desc]) => (
              <div key={label} style={{marginBottom:12}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                  <strong style={{fontSize:'.85rem'}}>{label}</strong>
                  <strong style={{color:col,fontSize:'.85rem'}}>{fmt(amt)}</strong>
                </div>
                <div style={{height:8,borderRadius:999,background:'var(--border)',marginBottom:4}}>
                  <div style={{height:'100%',borderRadius:999,background:col,width:'33.3%'}} />
                </div>
                <p className="muted" style={{fontSize:'.72rem',margin:0}}>{desc}</p>
              </div>
            ))}
          </div>

          {/* 4 Tips */}
          <div style={{marginTop:18}}>
            <p className="eyebrow" style={{marginBottom:12}}>4 Tips to Improve Your Finances</p>
            {[
              ['Know Your Numbers Exactly','Income, expenses, debt, savings. You cannot improve what you refuse to measure.','#e8d5f5'],
              ['Spend Intentionally, Not Emotionally','Every purchase is a choice. Pause before non-essential spending.','#fde8e8'],
              ['Automate Every Good Financial Habit','Savings, bills, investments. Remove the decision entirely.','#d5eaf5'],
              ['Focus on Progress, Not Perfection','Small consistent improvements compound into massive change over time.','#d5f5e3'],
            ].map(([title, desc, bg]) => (
              <div key={title} style={{background:bg,borderRadius:10,padding:'12px 14px',marginBottom:8}}>
                <strong style={{fontSize:'.82rem',display:'block',marginBottom:4}}>{title}</strong>
                <p className="muted" style={{fontSize:'.78rem',margin:0,lineHeight:1.5}}>{desc}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── INCOME ───────────────────────────────────────────────────────── */}
      {tab === 'donations' && (
        <ProTabGate isPro={isPro} onUpgrade={onUpgrade}>
        <section className="card">
          <p className="eyebrow">Giving</p>
          <h3 style={{ margin: '4px 0 8px' }}>Tithes & Offerings</h3>
          <p className="muted" style={{fontSize:'.8rem',marginBottom:14}}>
            "Bring the whole tithe into the storehouse" — Malachi 3:10
          </p>

          {/* Summary stats */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:14}}>
            {(() => {
              const thisYear = new Date().getFullYear()
              const ytd = donations.filter(d => d.date && d.date.startsWith(thisYear+'')).reduce((s,d)=>s+Number(d.amount||0),0)
              const thisMonth = donations.filter(d => d.date && d.date.slice(0,7) === TODAY.slice(0,7)).reduce((s,d)=>s+Number(d.amount||0),0)
              const taxDed = donations.filter(d => d.date && d.date.startsWith(thisYear+'') && d.taxDeductible).reduce((s,d)=>s+Number(d.amount||0),0)
              return [
                ['This Month', fmt(thisMonth), 'var(--teal)'],
                ['Year to Date', fmt(ytd), 'var(--brass)'],
                ['Tax-Deductible', fmt(taxDed), 'var(--success)'],
              ].map(([label,val,color]) => (
                <div key={label} style={{background:'var(--stone)',borderRadius:10,padding:'10px 8px',textAlign:'center'}}>
                  <div className="muted" style={{fontSize:'.65rem',fontWeight:600,letterSpacing:'.05em',textTransform:'uppercase',marginBottom:2}}>{label}</div>
                  <strong style={{color,fontSize:'.92rem'}}>{val}</strong>
                </div>
              ))
            })()}
          </div>

          {/* Quick Add Pills */}
          <p style={{fontSize:'.72rem',color:'var(--ink2)',fontWeight:600,letterSpacing:'.06em',textTransform:'uppercase',marginBottom:8}}>Quick Categories</p>
          <div style={{display:'grid',gridTemplateColumns:'repeat(4, 1fr)',gap:6,marginBottom:14}}>
            {[
              {icon:'✝️', label:'Tithe', cat:'Tithe'},
              {icon:'🎁', label:'Offering', cat:'Offering'},
              {icon:'🤲', label:'Missions', cat:'Missions'},
              {icon:'💝', label:'Charity', cat:'Charity'},
            ].map(({icon, label, cat}) => (
              <button key={cat} onClick={() => setNewDonation(p => ({...p, category: cat}))} style={{
                display:'flex', flexDirection:'column', alignItems:'center', gap:3,
                padding:'8px 4px', borderRadius:10, cursor:'pointer',
                background: newDonation.category === cat ? 'var(--brass-dim)' : 'var(--stone)',
                border: newDonation.category === cat ? '1.5px solid var(--brass)' : '1.5px solid var(--border2)',
              }}>
                <div style={{fontSize:'1.2rem'}}>{icon}</div>
                <div style={{fontSize:'.7rem',color:'var(--ink2)',fontWeight:600}}>{label}</div>
              </button>
            ))}
          </div>

          {/* Add form */}
          <div style={{background:'var(--stone)',borderRadius:12,padding:14,marginBottom:14,display:'grid',gap:8}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              <input placeholder="Recipient (church, charity)" value={newDonation.recipient}
                onChange={e => setNewDonation(p => ({...p, recipient: e.target.value}))}
                style={{padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:8,fontSize:'.88rem'}} />
              <input type="number" placeholder="Amount" value={newDonation.amount}
                onChange={e => setNewDonation(p => ({...p, amount: e.target.value}))}
                style={{padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:8,fontSize:'.88rem'}} />
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              <input type="date" value={newDonation.date}
                onChange={e => setNewDonation(p => ({...p, date: e.target.value}))}
                style={{padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:8,fontSize:'.88rem'}} />
              <label style={{display:'flex',alignItems:'center',gap:6,fontSize:'.82rem',cursor:'pointer'}}>
                <input type="checkbox" checked={newDonation.taxDeductible}
                  onChange={e => setNewDonation(p => ({...p, taxDeductible: e.target.checked}))} />
                Tax-deductible
              </label>
            </div>
            <button onClick={() => {
              if(!newDonation.recipient || !newDonation.amount) return
              saveDonations([...donations, {...newDonation, id: Date.now(), amount: Number(newDonation.amount)}])
              setNewDonation({recipient:'', amount:'', category:'Tithe', date:TODAY, taxDeductible:true})
            }} style={{padding:'10px',background:'var(--brass)',color:'white',border:'none',borderRadius:8,fontWeight:600,cursor:'pointer'}}>
              + Log Donation
            </button>
          </div>

          {/* List */}
          {donations.length === 0 ? (
            <EmptyState icon="✝️" title="Track your giving" message="Log tithes, offerings, and charitable donations. Total at tax time." />
          ) : (
            <div>
              {donations.slice().reverse().map(d => (
                <div key={d.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:'1px solid var(--border)',gap:8}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:600,fontSize:'.88rem'}}>{d.recipient}</div>
                    <div className="muted" style={{fontSize:'.74rem'}}>
                      <span style={{color:'var(--brass)',fontWeight:600}}>{d.category}</span> · {d.date}
                      {d.taxDeductible && <span style={{color:'var(--success)',marginLeft:6}}>· Tax ✓</span>}
                    </div>
                  </div>
                  <strong style={{color:'var(--brass)',whiteSpace:'nowrap'}}>{fmt(d.amount)}</strong>
                  <button onClick={() => {
                    if(window.confirm(`Delete donation to ${d.recipient}?`))
                      saveDonations(donations.filter(x => x.id !== d.id))
                  }} style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',padding:'4px 8px'}}>✕</button>
                </div>
              ))}
            </div>
          )}
        </section>
        </ProTabGate>
        )}

      {tab === 'income' && (
        <ProTabGate isPro={isPro} onUpgrade={onUpgrade}>
        <section className="card">
          <p className="eyebrow">Income Tracker</p>
          {(() => {
            const mk = incomeView
            const list = incomesForMonth(mk).slice().sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
            const total = incomeTotalForMonth(mk)
            const prevMk = shiftMonth(mk, -1)
            const prevTotal = incomeTotalForMonth(prevMk)
            // Most recent earlier month that has income — used for "copy forward"
            const lastWithIncome = [...new Set(incomes.map(incomeMonthOf))].filter(m => m < mk).sort().pop()
            const inputStyle = {padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.85rem'}
            const navBtn = {background:'var(--stone)',border:'1px solid var(--border2)',borderRadius:999,width:36,height:36,fontSize:'1.1rem',cursor:'pointer',color:'var(--ink)'}
            return (<>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,margin:'4px 0 14px'}}>
                <button aria-label="Previous month" style={navBtn} onClick={() => setIncomeView(shiftMonth(mk, -1))}>‹</button>
                <div style={{textAlign:'center'}}>
                  <h3 style={{margin:0}}>{monthLabel(mk)}</h3>
                  {mk !== CUR_MONTH && <button onClick={() => setIncomeView(CUR_MONTH)} style={{background:'none',border:'none',color:'var(--brass)',fontSize:'.75rem',fontWeight:600,cursor:'pointer',padding:'2px 0'}}>Back to this month</button>}
                </div>
                <button aria-label="Next month" style={navBtn} onClick={() => setIncomeView(shiftMonth(mk, 1))}>›</button>
              </div>
              <div style={{background:'var(--stone)',borderRadius:10,padding:'14px',marginBottom:16,display:'flex',justifyContent:'space-between',gap:12}}>
                <div>
                  <p className="muted" style={{fontSize:'.75rem',margin:'0 0 2px'}}>{mk === CUR_MONTH ? 'Received so far this month' : `Total for ${monthLabel(mk, { month: 'long' })}`}</p>
                  <strong style={{fontSize:'1.4rem',color:'var(--success)'}}>{fmt(total)}</strong>
                </div>
                <div style={{textAlign:'right'}}>
                  <p className="muted" style={{fontSize:'.75rem',margin:'0 0 2px'}}>{monthLabel(prevMk, { month: 'long' })}</p>
                  <strong style={{fontSize:'1rem'}}>{fmt(prevTotal)}</strong>
                  {prevTotal > 0 && total > 0 && <div style={{fontSize:'.72rem',fontWeight:600,color: total >= prevTotal ? 'var(--success)' : 'var(--danger)'}}>{total >= prevTotal ? '▲' : '▼'} {fmt(Math.abs(total - prevTotal))}</div>}
                </div>
              </div>
              {list.length === 0 && (
                <div style={{textAlign:'center',padding:'8px 0 12px'}}>
                  <EmptyState icon="💵" title={`No income logged for ${monthLabel(mk, { month: 'long' })} yet`} message="Add each paycheck or payment as it comes in." />
                  {lastWithIncome && (
                    <button className="ghost-btn" style={{marginTop:6}} onClick={() => {
                      const copies = incomesForMonth(lastWithIncome).map((inc, k) => ({
                        id: Date.now() + k, label: inc.label, category: inc.category || 'Primary',
                        amount: String(Math.round(incomeInMonth(inc) * 100) / 100), date: defaultIncomeDate(mk), month: mk,
                      }))
                      saveIncomes([...incomes, ...copies])
                    }}>Copy {incomesForMonth(lastWithIncome).length} from {monthLabel(lastWithIncome, { month: 'long' })}</button>
                  )}
                </div>
              )}
              {list.map((inc) => (
                <div key={inc.id || inc.label} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:'1px solid var(--border)',gap:8}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:600,fontSize:'.9rem'}}>{inc.label}</div>
                    <div className="muted" style={{fontSize:'.75rem'}}>{inc.category}{inc.date ? ` · ${new Date(`${inc.date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}{inc.period && inc.period !== 'monthly' && INCOME_MULT[inc.period] ? ` · ${inc.period}` : ''}</div>
                  </div>
                  <div style={{fontWeight:700,color:'var(--success)',whiteSpace:'nowrap'}}>{fmt(incomeInMonth(inc))}</div>
                  <button aria-label={`Delete ${inc.label}`} onClick={() => { if (window.confirm(`Delete "${inc.label}"?`)) saveIncomes(incomes.filter(x => x !== inc)) }}
                    style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',fontSize:'1.1rem',padding:'4px 8px'}}>✕</button>
                </div>
              ))}
              <div style={{marginTop:16,display:'grid',gap:8}}>
                <p style={{fontWeight:600,fontSize:'.85rem',margin:0}}>Add income to {monthLabel(mk, { month: 'long' })}</p>
                <input placeholder="Label (e.g. Paycheck, Client session)" value={newIncome.label}
                  onChange={e=>setNewIncome(p=>({...p,label:e.target.value}))} style={inputStyle} />
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                  <input placeholder="Amount ($)" type="number" inputMode="decimal" value={newIncome.amount}
                    onChange={e=>setNewIncome(p=>({...p,amount:e.target.value}))} style={inputStyle} />
                  <input type="date" value={newIncome.date} onChange={e=>setNewIncome(p=>({...p,date:e.target.value}))} style={inputStyle} />
                </div>
                <select value={newIncome.category} onChange={e=>setNewIncome(p=>({...p,category:e.target.value}))} style={inputStyle}>
                  {['Primary','Side Hustle','Passive','Investment','Business','Other'].map(c=><option key={c}>{c}</option>)}
                </select>
                <button className="primary-btn" onClick={() => {
                  if (!newIncome.label || !newIncome.amount) return
                  const date = newIncome.date || defaultIncomeDate(mk)
                  saveIncomes([...incomes, { id: Date.now(), label: newIncome.label, amount: newIncome.amount, category: newIncome.category, date, month: date.slice(0, 7) }])
                  if (date.slice(0, 7) !== mk) setIncomeView(date.slice(0, 7))
                  setNewIncome({ label: '', amount: '', category: newIncome.category, date: defaultIncomeDate(date.slice(0, 7)) })
                }}>+ Add Income</button>
              </div>
            </>)
          })()}
        </section>
      </ProTabGate>)}

      {/* ── EXPENSES & BILLS ─────────────────────────────────────────────── */}
      {tab === 'expenses' && (
        <ProTabGate isPro={isPro} onUpgrade={onUpgrade}>
        <div>
          {/* Bills section — moved here from Budget */}
          <section className="card">
          {/* Subscription Audit */}
          {(() => {
            const subs = bills.filter(b => b.category === 'Subscription' || (b.label||'').toLowerCase().includes('subscription'))
            const totalMonthly = subs.reduce((s,b) => s + billToMonthly(b), 0)
            if (subs.length === 0) return null
            return (
              <div style={{
                background: 'rgba(245,158,11,.08)',
                border: '1.5px solid rgba(245,158,11,.25)',
                borderRadius: 12, padding: '12px 14px', marginBottom: 14,
              }}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                  <p style={{fontSize:'.65rem',fontWeight:700,letterSpacing:'.08em',color:'var(--warning,#D97706)',textTransform:'uppercase',margin:0}}>⚠️ Subscription Audit</p>
                  <strong style={{fontSize:'.85rem',color:'var(--warning,#D97706)'}}>{fmt(totalMonthly)}/mo · {fmt(totalMonthly*12)}/yr</strong>
                </div>
                <p style={{fontSize:'.78rem',color:'var(--ink2)',marginBottom:8}}>
                  You have {subs.length} active subscription{subs.length !== 1 ? 's' : ''}. Review each — is it still earning its keep?
                </p>
                <div style={{display:'grid',gap:4}}>
                  {subs.map(s => (
                    <div key={s.id || s.label} style={{display:'flex',justifyContent:'space-between',fontSize:'.78rem',padding:'4px 0',borderBottom:'1px solid rgba(245,158,11,.15)'}}>
                      <span>{s.label}</span>
                      <span style={{fontWeight:600}}>{fmt(billToMonthly(s))}/mo</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}

            <p className="eyebrow">Fixed Bills</p>
            <h3 style={{ margin: '4px 0 10px' }}>Monthly Recurring Expenses</h3>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:'2px solid var(--border)',marginBottom:6}}>
              <strong style={{fontSize:'.85rem'}}>Total Monthly Bills</strong>
              <strong style={{color:'var(--danger)',fontSize:'1rem'}}>{fmt(totalBillsMonthly)}</strong>
            </div>
            {bills.length === 0 && <p className="muted" style={{textAlign:'center',padding:'12px 0',fontSize:'.85rem'}}><EmptyState icon="🧾" title="Know what you owe" message="Awareness precedes stewardship. Add what comes due each month." /></p>}
            {bills.map((b, i) => (
              <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'1px solid var(--border)'}}>
                <div>
                  <span style={{fontWeight:600,fontSize:'.88rem'}}>{b.label}</span>
                  {b.category && <span className="muted" style={{fontSize:'.72rem',marginLeft:6}}>{b.category}</span>}
                  {b.frequency && b.frequency !== 'monthly' && <span style={{fontSize:'.7rem',color:'var(--teal)',marginLeft:6,fontWeight:600}}>· {b.frequency}</span>}
                </div>
                <div style={{display:'flex',gap:10,alignItems:'center'}}>
                  <strong style={{color:'var(--danger)'}}>{fmt(b.amount)}</strong>
                  <button onClick={() => saveBills(bills.filter((_,j)=>j!==i))}
                    style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer'}}>✕</button>
                </div>
              </div>
            ))}
            <div style={{marginTop:12,display:'grid',gap:8}}>
              <p style={{fontWeight:600,fontSize:'.82rem',margin:0}}>Add a Bill</p>
              <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:8}}>
                <input placeholder="Bill name (e.g. Rent, Electric)" value={newBill.label}
                  onChange={e=>setNewBill(p=>({...p,label:e.target.value}))}
                  style={{padding:'8px 10px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.82rem'}} />
                <input type="number" placeholder="$ amount" value={newBill.amount}
                  onChange={e=>setNewBill(p=>({...p,amount:e.target.value}))}
                  style={{padding:'8px 10px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.82rem'}} />
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                <select value={newBill.category} onChange={e=>setNewBill(p=>({...p,category:e.target.value}))}
                  style={{padding:'8px 10px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.82rem'}}>
                  {['Need','Utility','Insurance','Subscription','Debt Payment','Other'].map(c=><option key={c}>{c}</option>)}
                </select>
                <select value={newBill.frequency||'monthly'} onChange={e=>setNewBill(p=>({...p,frequency:e.target.value}))}
                  style={{padding:'8px 10px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.82rem'}}>
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Bi-weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
              <button className="primary-btn" onClick={() => {
                if (!newBill.label || !newBill.amount) return
                saveBills([...bills, { ...newBill, id: Date.now() }])
                setNewBill({ label: '', amount: '', category: 'Need', frequency: 'monthly' })
              }}>+ Add Bill</button>
            </div>
          </section>

          {/* Variable expenses from expense log */}
          <section className="card">
            <p className="eyebrow">Variable Expenses</p>
            <h3 style={{ margin: '4px 0 10px' }}>Tracked Spending</h3>

            {/* Quick Tap Categories */}
            {!addingExpense && (
              <div style={{marginBottom:14}}>
                <p style={{fontSize:'.72rem',color:'var(--ink2)',fontWeight:600,letterSpacing:'.06em',textTransform:'uppercase',marginBottom:8}}>Quick Add</p>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(76px, 1fr))',gap:8,marginBottom:10}}>
                  {[
                    {icon:'🛒', label:'Groceries', cat:'Food'},
                    {icon:'⛽', label:'Gas', cat:'Transport'},
                    {icon:'🍔', label:'Eating Out', cat:'Food'},
                    {icon:'☕', label:'Coffee', cat:'Food'},
                    {icon:'🛍', label:'Shopping', cat:'Shopping'},
                    {icon:'🎬', label:'Fun', cat:'Entertainment'},
                    {icon:'💊', label:'Health', cat:'Health'},
                    {icon:'🏠', label:'Home', cat:'Home'},
                  ].map(({icon, label, cat}) => (
                    <button key={label} onClick={() => {
                      setNewExpense({desc:label, amount:'', category:cat, period:'one-time', date:TODAY})
                      setAddingExpense(true)
                    }} style={{
                      display:'flex', flexDirection:'column', alignItems:'center', gap:4,
                      padding:'10px 6px', borderRadius:12, background:'var(--stone)',
                      border:'1.5px solid var(--border2)', cursor:'pointer',
                      transition:'all .15s',
                    }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--teal)'; e.currentTarget.style.background = 'var(--stone2)' }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.background = 'var(--stone)' }}
                    >
                      <div style={{fontSize:'1.4rem'}}>{icon}</div>
                      <div style={{fontSize:'.7rem',color:'var(--ink2)',fontWeight:600,textAlign:'center'}}>{label}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Quick add variable expense */}
            {!addingExpense ? (
              <button onClick={() => setAddingExpense(true)} style={{
                width:'100%', padding:'9px', borderRadius:10, marginBottom:12,
                border:'1.5px dashed var(--border2)', background:'transparent',
                color:'var(--teal)', fontWeight:600, fontSize:'.88rem', cursor:'pointer'
              }}>+ Custom Expense</button>
            ) : (
              <div style={{background:'var(--stone)',borderRadius:12,padding:14,marginBottom:14,display:'grid',gap:8}}>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                  <input placeholder="Description" value={newExpense.desc} onChange={e=>setNewExpense(p=>({...p,desc:e.target.value}))}
                    style={{padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:8,fontSize:'.88rem'}} />
                  <input placeholder="Amount" type="number" value={newExpense.amount} onChange={e=>setNewExpense(p=>({...p,amount:e.target.value}))}
                    style={{padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:8,fontSize:'.88rem'}} />
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                  <select value={newExpense.category} onChange={e=>setNewExpense(p=>({...p,category:e.target.value}))}
                    style={{padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:8,fontSize:'.88rem'}}>
                    {['Food','Transport','Shopping','Entertainment','Health','Personal','Home','Other'].map(c=><option key={c}>{c}</option>)}
                  </select>
                  <select value={newExpense.period||'one-time'} onChange={e=>setNewExpense(p=>({...p,period:e.target.value}))}
                    style={{padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:8,fontSize:'.88rem'}}>
                    <option value="one-time">One-time</option>
                    <option value="weekly">Weekly</option>
                    <option value="biweekly">Bi-weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>
                <input type="date" value={newExpense.date} onChange={e=>setNewExpense(p=>({...p,date:e.target.value}))}
                  style={{padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:8,fontSize:'.88rem'}} />
                <div style={{display:'flex',gap:8}}>
                  <button onClick={()=>{
                    if(!newExpense.desc||!newExpense.amount) return
                    saveItem('expense',{description:newExpense.desc,amount:Number(newExpense.amount),
                      category:newExpense.category,period:newExpense.period||'one-time',date:newExpense.date||TODAY},'create')
                    setNewExpense({desc:'',amount:'',category:'Food',period:'one-time',date:TODAY})
                    setAddingExpense(false)
                  }} style={{flex:1,padding:'10px',background:'var(--teal)',color:'white',border:'none',borderRadius:8,fontWeight:600,cursor:'pointer'}}>
                    Save
                  </button>
                  <button onClick={()=>setAddingExpense(false)} style={{flex:1,padding:'10px',background:'var(--stone)',border:'1px solid var(--border2)',borderRadius:8,cursor:'pointer'}}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
            <PeriodPills />
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:16}}>
              {[
                ['This Week', fmt(fpWeekSpend)],
                ['This Month', fmt(fpMonthSpend)],
                ['Quarterly Est.', fmt(fpWeekSpend * 13)],
                ['Yearly Est.', fmt(fpWeekSpend * 52)],
              ].map(([label, val]) => (
                <div key={label} style={{background:'var(--stone)',borderRadius:10,padding:'12px',textAlign:'center'}}>
                  <p className="muted" style={{fontSize:'.72rem',margin:'0 0 4px'}}>{label}</p>
                  <strong style={{fontSize:'1.05rem',color:'var(--danger)'}}>{val}</strong>
                </div>
              ))}
            </div>
            {(expenses||[]).length === 0 && <p className="muted" style={{textAlign:'center',padding:'12px 0'}}><EmptyState icon="💳" title="No expenses yet" message="Log your first expense to start tracking spending." /></p>}
            {(expenses||[]).slice().sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,20).map((exp, i) => (
              <div key={exp.id || i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'1px solid var(--border)',gap:8}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:600,fontSize:'.88rem'}}>{exp.description || exp.category}</div>
                  <div className="muted" style={{fontSize:'.75rem'}}>
                    {exp.category} · {exp.date}
                    {exp.period && exp.period !== 'one-time' && <span style={{color:'var(--teal)',marginLeft:6,fontWeight:600}}>· {exp.period}</span>}
                  </div>
                </div>
                <strong style={{color:'var(--danger)',whiteSpace:'nowrap'}}>{fmt(exp.amount)}</strong>
                <button onClick={() => {
                  if (window.confirm(`Delete "${exp.description || exp.category}"?`)) {
                    deleteItem('expense', exp.id)
                  }
                }} style={{
                  background:'none',border:'none',color:'var(--muted)',
                  cursor:'pointer',padding:'4px 8px',fontSize:'1rem',
                }} title="Delete expense">✕</button>
              </div>
            ))}
            {(expenses||[]).length > 0 && (() => {
              const cats = {}
              expenses.forEach(e => { cats[e.category] = (cats[e.category]||0) + Number(e.amount||0) })
              const total = Object.values(cats).reduce((s,v)=>s+v,0)
              return (
                <div style={{marginTop:16}}>
                  <p style={{fontWeight:600,fontSize:'.85rem',marginBottom:10}}>By Category</p>
                  {Object.entries(cats).sort((a,b)=>b[1]-a[1]).map(([cat,amt]) => (
                    <div key={cat} style={{marginBottom:8}}>
                      <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
                        <span style={{fontSize:'.82rem'}}>{cat}</span>
                        <span style={{fontSize:'.82rem',fontWeight:600}}>{fmt(amt)}</span>
                      </div>
                      <div style={{height:6,borderRadius:999,background:'var(--border)'}}>
                        <div style={{height:'100%',borderRadius:999,background:'var(--brass)',width:`${(amt/total)*100}%`}} />
                      </div>
                    </div>
                  ))}
                </div>
              )
            })()}
          </section>
        </div>
      </ProTabGate>)}

      {/* ── SAVINGS ──────────────────────────────────────────────────────── */}
      {tab === 'savings' && (
        <ProTabGate isPro={isPro} onUpgrade={onUpgrade}>
        <div>
          <section className="card">
          {/* Sinking Funds */}
          <div style={{marginBottom:16}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
              <p style={{fontSize:'.72rem',color:'var(--ink2)',fontWeight:600,letterSpacing:'.06em',textTransform:'uppercase',margin:0}}>Sinking Funds</p>
              <button onClick={() => setShowSinkingForm(!showSinkingForm)} style={{
                fontSize:'.72rem',padding:'4px 10px',borderRadius:999,
                background:'transparent',color:'var(--teal)',border:'1px solid var(--teal)',
                cursor:'pointer',fontWeight:600,
              }}>{showSinkingForm ? 'Cancel' : '+ New'}</button>
            </div>
            <p className="muted" style={{fontSize:'.74rem',marginBottom:10,fontStyle:'italic'}}>
              Save monthly for known future expenses (Christmas, car repair, vacation).
            </p>

            {showSinkingForm && (
              <div style={{background:'var(--stone)',borderRadius:10,padding:12,marginBottom:10,display:'grid',gap:8}}>
                <input placeholder="Fund name (e.g. Christmas 2026)" value={newSinking.name}
                  onChange={e => setNewSinking(p => ({...p, name: e.target.value}))}
                  style={{padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:8,fontSize:'.88rem'}} />
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
                  <input type="number" placeholder="Target $" value={newSinking.target}
                    onChange={e => setNewSinking(p => ({...p, target: e.target.value}))}
                    style={{padding:'9px 10px',border:'1.5px solid var(--border2)',borderRadius:8,fontSize:'.82rem'}} />
                  <input type="number" placeholder="Saved $" value={newSinking.current}
                    onChange={e => setNewSinking(p => ({...p, current: e.target.value}))}
                    style={{padding:'9px 10px',border:'1.5px solid var(--border2)',borderRadius:8,fontSize:'.82rem'}} />
                  <input type="date" placeholder="Due" value={newSinking.dueDate}
                    onChange={e => setNewSinking(p => ({...p, dueDate: e.target.value}))}
                    style={{padding:'9px 10px',border:'1.5px solid var(--border2)',borderRadius:8,fontSize:'.82rem'}} />
                </div>
                <button onClick={() => {
                  if(!newSinking.name || !newSinking.target) return
                  saveSinkingFunds([...sinkingFunds, {...newSinking, id: Date.now(), target: Number(newSinking.target), current: Number(newSinking.current||0)}])
                  setNewSinking({name:'', target:'', current:'', dueDate:''})
                  setShowSinkingForm(false)
                }} style={{padding:'10px',background:'var(--teal)',color:'white',border:'none',borderRadius:8,fontWeight:600,cursor:'pointer'}}>
                  Add Fund
                </button>
              </div>
            )}

            {sinkingFunds.length === 0 ? null : sinkingFunds.map(f => {
              const pct = Math.min(100, (Number(f.current) / Number(f.target)) * 100)
              const remaining = Math.max(0, Number(f.target) - Number(f.current))
              const monthsLeft = f.dueDate ? Math.max(1, Math.ceil((new Date(f.dueDate) - new Date()) / (30 * 86400000))) : null
              const monthlyNeeded = monthsLeft ? Math.ceil(remaining / monthsLeft) : null
              return (
                <div key={f.id} style={{background:'var(--stone)',borderRadius:10,padding:'12px 14px',marginBottom:8}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
                    <strong style={{fontSize:'.88rem'}}>{f.name}</strong>
                    <span style={{fontSize:'.82rem',color:'var(--teal)',fontWeight:600}}>{fmt(f.current)} / {fmt(f.target)}</span>
                  </div>
                  <div style={{height:6,background:'var(--stone2)',borderRadius:999,overflow:'hidden',marginBottom:6}}>
                    <div style={{height:'100%',width:`${pct}%`,background:'var(--teal)',transition:'width .3s'}} />
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:'.74rem'}}>
                    <span className="muted">
                      {monthlyNeeded ? `Save ${fmt(monthlyNeeded)}/month` : 'Set due date for monthly target'}
                    </span>
                    <div style={{display:'flex',gap:8}}>
                      <button onClick={() => {
                        const add = prompt(`Add to ${f.name}:`)
                        if(!add) return
                        saveSinkingFunds(sinkingFunds.map(x => x.id === f.id ? {...x, current: Number(x.current) + Number(add)} : x))
                      }} style={{background:'none',border:'none',color:'var(--teal)',cursor:'pointer',fontWeight:600,fontSize:'.74rem'}}>+ Add</button>
                      <button onClick={() => {
                        if(window.confirm(`Delete ${f.name}?`)) saveSinkingFunds(sinkingFunds.filter(x => x.id !== f.id))
                      }} style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer'}}>✕</button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

            <p className="eyebrow">Savings Challenge</p>
            <h3 style={{ margin: '4px 0 6px' }}>Build Your Savings — Your Way</h3>

            {/* Challenge selector */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:16}}>
              {[
                {goal:1000, label:'$1,000', timeLabel:'30 Days', type:'daily', periods:30, color:'#4CAF50'},
                {goal:3000, label:'$3,000', timeLabel:'3 Months', type:'weekly', periods:13, color:'#2196F3'},
                {goal:5000, label:'$5,000', timeLabel:'6 Months', type:'biweekly', periods:26, color:'#FF9800'},
                {goal:10000, label:'$10,000', timeLabel:'52 Weeks', type:'weekly52', periods:52, color:'#9C27B0'},
              ].map(cfg => {
                const isActive = challengeGoal === cfg.goal
                return (
                  <button key={cfg.goal} onClick={() => { saveChallengeGoal(cfg.goal); saveCheckedWeeks([]) }}
                    style={{
                      padding:'14px 10px', borderRadius:12, cursor:'pointer', textAlign:'center',
                      border: isActive ? `2px solid ${cfg.color}` : '1.5px solid var(--border)',
                      background: isActive ? cfg.color+'18' : 'var(--stone)',
                      transition:'all .2s'
                    }}>
                    <div style={{fontSize:'1.2rem',fontWeight:800,color:isActive?cfg.color:'var(--ink)'}}>{cfg.label}</div>
                    <div style={{fontSize:'.75rem',color:'var(--muted)',marginTop:2}}>in {cfg.timeLabel}</div>
                    {isActive && <div style={{fontSize:'.68rem',color:cfg.color,marginTop:4,fontWeight:600}}>✓ Active</div>}
                  </button>
                )
              })}
            </div>

            {/* Dynamic challenge based on selection */}
            {(() => {
              const CHALLENGES = {
                1000: {
                  goal: 1000, label: '$1,000 in 30 Days', color: '#4CAF50', type: 'daily',
                  desc: 'Save every day for 30 days. Tap each day as you set money aside.',
                  unitLabel: 'Day', gridCols: 'repeat(6,1fr)',
                  // 30 amounts averaging $33.33/day that add to exactly $1000
                  amounts: [25,30,35,40,25,30,35,40,25,30,35,25,40,30,35,25,40,35,30,25,40,35,30,40,25,35,30,40,35,55]
                },
                3000: {
                  goal: 3000, label: '$3,000 in 3 Months', color: '#2196F3', type: 'weekly',
                  desc: 'Save each week for 13 weeks. Consistency beats intensity.',
                  unitLabel: 'Week', gridCols: 'repeat(4,1fr)',
                  // 13 weekly amounts totaling $3000 (~$230/wk), escalating pattern
                  amounts: [175,200,200,225,225,225,250,250,250,250,250,250,250]
                },
                5000: {
                  goal: 5000, label: '$5,000 in 6 Months', color: '#FF9800', type: 'biweekly',
                  desc: 'Save every 2 weeks for 26 periods. Pairs perfectly with bi-weekly pay.',
                  unitLabel: 'Period', gridCols: 'repeat(4,1fr)',
                  // 26 bi-weekly amounts totaling $5000 (~$192/period), escalating
                  amounts: [150,150,175,175,175,175,200,200,200,200,200,200,200,200,200,200,200,200,200,200,200,200,200,200,200,200]
                },
                10000: {
                  goal: 10000, label: '$10,000 in 52 Weeks', color: '#9C27B0', type: 'weekly52',
                  desc: 'The classic 52-week challenge. Current week highlighted.',
                  unitLabel: 'Week', gridCols: 'repeat(4,1fr)',
                  amounts: WEEK_PLAN
                },
              }

              const cfg = CHALLENGES[challengeGoal] || CHALLENGES[10000]
              const totalSaved = checkedWeeks.reduce((s, w) => s + (cfg.amounts[w-1] || 0), 0)
              const pct = Math.min((totalSaved / cfg.goal) * 100, 100)
              const remaining = cfg.goal - totalSaved
              const periodsLeft = cfg.amounts.length - checkedWeeks.length
              const avgNeeded = periodsLeft > 0 ? remaining / periodsLeft : 0

              return (
                <div>
                  <div style={{background:'var(--stone)',borderRadius:10,padding:'14px',marginBottom:12}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10}}>
                      <div>
                        <p style={{fontWeight:700,color:'var(--ink)',margin:'0 0 2px'}}>{cfg.label}</p>
                        <p className="muted" style={{fontSize:'.78rem',margin:0}}>{cfg.desc}</p>
                      </div>
                    </div>
                    <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:10}}>
                      {[
                        ['Saved', '$'+totalSaved.toLocaleString(), cfg.color],
                        ['Remaining', '$'+remaining.toLocaleString(), 'var(--danger)'],
                        ['Avg/period', '$'+avgNeeded.toFixed(0), 'var(--brass)'],
                      ].map(([l,v,c]) => (
                        <div key={l} style={{textAlign:'center',background:'white',borderRadius:8,padding:'8px 4px'}}>
                          <div className="muted" style={{fontSize:'.68rem',marginBottom:2}}>{l}</div>
                          <strong style={{color:c,fontSize:'1rem'}}>{v}</strong>
                        </div>
                      ))}
                    </div>
                    <div style={{height:10,borderRadius:999,background:'var(--border)'}}>
                      <div style={{height:'100%',borderRadius:999,background:cfg.color,width:`${pct}%`,transition:'width .3s'}} />
                    </div>
                    <div style={{display:'flex',justifyContent:'space-between',marginTop:4}}>
                      <span className="muted" style={{fontSize:'.72rem'}}>{pct.toFixed(1)}% complete</span>
                      <span className="muted" style={{fontSize:'.72rem'}}>{checkedWeeks.length} of {cfg.amounts.length} {cfg.unitLabel.toLowerCase()}s done</span>
                    </div>
                  </div>

                  {cfg.type === 'weekly52' && (
                    <p className="muted" style={{fontSize:'.78rem',marginBottom:8}}>
                      Current: <strong style={{color:cfg.color}}>Week {currentWeekNum}</strong> — tap to mark saved
                    </p>
                  )}

                  <div style={{display:'grid',gridTemplateColumns:cfg.gridCols,gap:5}}>
                    {cfg.amounts.map((amt, i) => {
                      const period = i + 1
                      const done = checkedWeeks.includes(period)
                      const isCurrent = cfg.type === 'weekly52' && period === currentWeekNum
                      return (
                        <button key={period} onClick={() => toggleWeek(period)} style={{
                          padding: cfg.type==='daily' ? '6px 2px' : '8px 4px',
                          borderRadius: cfg.type==='daily' ? '50%' : 8,
                          border: isCurrent ? `2px solid ${cfg.color}` : '1px solid var(--border)',
                          background: done ? cfg.color : 'var(--stone)',
                          color: done ? 'white' : 'var(--ink)', cursor:'pointer',
                          fontSize:'.68rem', fontWeight:600, lineHeight:1.3,
                          aspectRatio: cfg.type==='daily' ? '1' : 'auto',
                          display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
                          boxShadow: isCurrent ? `0 0 0 2px ${cfg.color}33` : 'none'
                        }}>
                          <div style={{fontSize:'.6rem',opacity:0.7}}>{cfg.unitLabel.charAt(0)}{period}</div>
                          <div>${amt}</div>
                        </button>
                      )
                    })}
                  </div>

                  <button onClick={() => saveCheckedWeeks([])}
                    style={{marginTop:12,background:'none',border:'1px solid var(--border)',borderRadius:8,padding:'6px 14px',
                    fontSize:'.78rem',color:'var(--muted)',cursor:'pointer',width:'100%'}}>
                    Reset Challenge
                  </button>
                </div>
              )
            })()}
          </section>

          {/* Savings Goals */}
          <section className="card">
            <p className="eyebrow">Savings Goals</p>
            <h3 style={{ margin: '4px 0 14px' }}>What You're Building Toward</h3>
            <div style={{display:'flex',justifyContent:'space-between',padding:'10px 0',borderBottom:'2px solid var(--border)',marginBottom:10}}>
              <strong>Total Saved Across All Goals</strong>
              <strong style={{color:'var(--success)'}}>{fmt(totalSavingsStored)}</strong>
            </div>
            {savingsGoals.map((sg, i) => {
              const pct = sg.goal > 0 ? Math.min((sg.current / sg.goal) * 100, 100) : 0
              const isEditing = editingSavings[i] !== undefined
              const monthsLeft = sg.goal > sg.current && totalWeeklyIncome > 0
                ? ((sg.goal - sg.current) / (totalWeeklyIncome * 4.33)).toFixed(1)
                : null
              return (
                <div key={sg.id} style={{marginBottom:16,padding:'14px',background:'var(--stone)',borderRadius:12}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                    <strong style={{fontSize:'.9rem'}}>{sg.label}</strong>
                    <button onClick={() => saveSavingsGoals(savingsGoals.filter((_,j)=>j!==i))}
                      style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer'}}>✕</button>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
                    <span className="muted" style={{fontSize:'.8rem'}}>Goal: <strong>{fmt(sg.goal)}</strong></span>
                    <span className="muted" style={{fontSize:'.8rem'}}>{pct.toFixed(0)}% complete</span>
                  </div>
                  <div style={{height:10,borderRadius:999,background:'var(--border)',marginBottom:8}}>
                    <div style={{height:'100%',borderRadius:999,background:sg.color||'var(--brass)',width:`${pct}%`,transition:'width .3s'}} />
                  </div>
                  {monthsLeft && (
                    <p className="muted" style={{fontSize:'.75rem',margin:'0 0 8px'}}>
                      💡 At your current income rate, ~<strong>{monthsLeft} months</strong> to reach this goal if you saved 20%
                    </p>
                  )}
                  <div style={{display:'flex',gap:8,alignItems:'center'}}>
                    <span className="muted" style={{fontSize:'.8rem'}}>Saved:</span>
                    {isEditing ? (
                      <>
                        <input type="number" value={editingSavings[i]}
                          onChange={e => setEditingSavings(p=>({...p,[i]:e.target.value}))}
                          style={{flex:1,padding:'5px 8px',border:'1px solid var(--border2)',borderRadius:6,fontSize:'.85rem'}}
                          autoFocus />
                        <button className="primary-btn" style={{padding:'5px 10px',fontSize:'.8rem'}} onClick={() => {
                          const next = savingsGoals.map((g,j) => j===i ? {...g, current: Number(editingSavings[i]||0)} : g)
                          saveSavingsGoals(next)
                          setEditingSavings(p=>{const n={...p};delete n[i];return n})
                        }}>Save</button>
                        <button onClick={()=>setEditingSavings(p=>{const n={...p};delete n[i];return n})}
                          style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',fontSize:'.85rem'}}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <strong style={{color:sg.color||'var(--brass)',flex:1}}>{fmt(sg.current)}</strong>
                        <button className="ghost-btn" style={{fontSize:'.78rem',padding:'4px 10px'}}
                          onClick={() => setEditingSavings(p=>({...p,[i]:sg.current}))}>Edit</button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
            <div style={{marginTop:8,display:'grid',gap:8}}>
              <p style={{fontWeight:600,fontSize:'.85rem',margin:0}}>New Savings Goal</p>
              <input placeholder="Goal name (e.g. House Down Payment)" value={newSavings.label}
                onChange={e=>setNewSavings(p=>({...p,label:e.target.value}))}
                style={{padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.85rem'}} />
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                <input type="number" placeholder="Goal amount ($)" value={newSavings.goal}
                  onChange={e=>setNewSavings(p=>({...p,goal:e.target.value}))}
                  style={{padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.85rem'}} />
                <input type="number" placeholder="Currently saved ($)" value={newSavings.current}
                  onChange={e=>setNewSavings(p=>({...p,current:e.target.value}))}
                  style={{padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.85rem'}} />
              </div>
              <button className="primary-btn" onClick={() => {
                if (!newSavings.label || !newSavings.goal) return
                saveSavingsGoals([...savingsGoals, { id: Date.now(), label: newSavings.label, goal: Number(newSavings.goal), current: Number(newSavings.current||0), color: 'var(--brass)' }])
                setNewSavings({ label: '', goal: '', current: '' })
              }}>+ Add Goal</button>
            </div>
          </section>
        </div>
      </ProTabGate>)}
      {tab === 'debt' && (
        <ProTabGate isPro={isPro} onUpgrade={onUpgrade}>
        <section className="card">
          <p className="eyebrow">Debt Tracker</p>
          <h3 style={{ margin: '4px 0 6px' }}>Debt Avalanche — Highest Rate First</h3>
          <p className="muted" style={{fontSize:'.8rem',marginBottom:14}}>Pay minimums on all debts, then throw every extra dollar at the highest interest rate first.</p>
          {debts.length > 0 && (
            <div style={{display:'flex',justifyContent:'space-between',padding:'10px 0',borderBottom:'2px solid var(--border)',marginBottom:6}}>
              <strong>Total Minimum Payments</strong>
              <strong style={{color:'var(--danger)'}}>{fmt(totalDebtPayments)}/mo</strong>
            </div>
          )}
          {debts.length === 0 && <p className="muted" style={{textAlign:'center',padding:'20px 0'}}><EmptyState icon="📉" title="No debts added" message="Track what you owe and build a payoff plan." /></p>}
          {[...debts].sort((a, b) => Number(b.rate || 0) - Number(a.rate || 0)).map((debt, i) => (
            <div key={i} style={{ padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <strong style={{ fontSize: '.9rem' }}>{debt.name}</strong>
                <button onClick={() => saveDebts(debts.filter((_,j)=>j!==i))}
                  style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>✕</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, fontSize: '.8rem' }}>
                <div><p className="muted" style={{margin:'0 0 2px',fontSize:'.7rem'}}>BALANCE</p><strong>${Number(debt.balance).toLocaleString()}</strong></div>
                <div><p className="muted" style={{margin:'0 0 2px',fontSize:'.7rem'}}>RATE</p><strong style={{color:'var(--danger)'}}>{debt.rate}%</strong></div>
                <div><p className="muted" style={{margin:'0 0 2px',fontSize:'.7rem'}}>MIN PMT</p><strong>${debt.minPayment}/mo</strong></div>
              </div>
            </div>
          ))}
          <div style={{ marginTop: 16, display: 'grid', gap: 8 }}>
            <p style={{ fontWeight: 600, fontSize: '.85rem', margin: 0 }}>Add a Debt</p>
            <input placeholder="Debt name (e.g. Credit Card, Car Loan)" value={newDebt.name}
              onChange={e => setNewDebt(p => ({ ...p, name: e.target.value }))}
              style={{ padding: '9px 12px', border: '1.5px solid var(--border2)', borderRadius: 'var(--radius-sm)', fontSize: '.85rem' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              {[['Balance $', 'balance'], ['Rate %', 'rate'], ['Min Pmt $', 'minPayment']].map(([ph, key]) => (
                <input key={key} type="number" placeholder={ph} value={newDebt[key]}
                  onChange={e => setNewDebt(p => ({ ...p, [key]: e.target.value }))}
                  style={{ padding: '9px 12px', border: '1.5px solid var(--border2)', borderRadius: 'var(--radius-sm)', fontSize: '.85rem' }} />
              ))}
            </div>
            <button className="primary-btn" onClick={() => {
              if (!newDebt.name) return
              saveDebts([...debts, { ...newDebt, id: Date.now() }])
              setNewDebt({ name: '', balance: '', rate: '', minPayment: '' })
            }}>+ Add Debt</button>
          </div>
        </section>
      </ProTabGate>)}

      {/* ── BUDGET PLAN ──────────────────────────────────────────────────── */}
      {tab === 'budget' && (
        <div>
          {/* Weekly Spending Target (discretionary cap) */}
          <section className="card">
            <p className="eyebrow">Weekly Target</p>
            <h3 style={{margin:'4px 0 6px'}}>Weekly Spending Target</h3>
            <p className="muted" style={{fontSize:'.8rem',marginBottom:10}}>
              Discretionary only — bills and rent don't count. Used to calculate the Finance dimension of your life score.
            </p>
            <div style={{display:'flex',gap:10,alignItems:'center'}}>
              <input type="number" value={budget.weeklyTarget}
                onChange={(e) => setBudget({ weeklyTarget: Number(e.target.value) })}
                style={{flex:1,padding:'10px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.9rem'}} />
              <span className="muted" style={{fontSize:'.85rem'}}>/week</span>
            </div>
            {/* Progress bar showing how much of weekly target you've spent */}
            {budget.weeklyTarget > 0 && (
              <div style={{marginTop:12}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:4,fontSize:'.78rem'}}>
                  <span className="muted">Spent this week</span>
                  <strong style={{color: fpWeekSpend > budget.weeklyTarget ? 'var(--danger)' : 'var(--ink)'}}>
                    {fmt(fpWeekSpend)} / {fmt(budget.weeklyTarget)}
                  </strong>
                </div>
                <div style={{height:6,background:'var(--stone2)',borderRadius:999,overflow:'hidden'}}>
                  <div style={{
                    height:'100%',
                    width: `${Math.min(100, (fpWeekSpend / budget.weeklyTarget) * 100)}%`,
                    background: fpWeekSpend > budget.weeklyTarget ? 'var(--danger)' : 'var(--teal)',
                    borderRadius:999, transition:'width .3s',
                  }} />
                </div>
              </div>
            )}
          </section>

          {/* Summary pulled from all tabs */}
          <section className="card">
            <p className="eyebrow">Budget Plan</p>
            <h3 style={{ margin: '4px 0 14px' }}>Monthly Cash Flow</h3>
            <PeriodPills />
            {[
              [incomeLabel, fmt(totalIncomeForPeriod), 'var(--success)', '+'],
              ['Fixed Bills', fmt(totalBillsForPeriod), 'var(--danger)', '-'],
              ['Min Debt Payments', fmt(totalDebtPayments * ((PERIOD_MULT[period]||4.33)/4.33)), 'var(--danger)', '-'],
              ['Variable Expenses', fmt(fpWeekSpend * (PERIOD_MULT[period]||4.33)), 'var(--warning,#f90)', '-'],
            ].map(([label, val, col, sign]) => (
              <div key={label} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:'1px solid var(--border)'}}>
                <div style={{display:'flex',gap:8,alignItems:'center'}}>
                  <span style={{color:col,fontWeight:700,fontSize:'.9rem'}}>{sign}</span>
                  <span style={{fontSize:'.88rem'}}>{label}</span>
                </div>
                <strong style={{color:col}}>{val}</strong>
              </div>
            ))}
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 0',marginTop:4}}>
              <strong style={{fontSize:'1rem'}}>= Remaining</strong>
              <strong style={{fontSize:'1.1rem',color: totalIncomeForPeriod - totalBillsForPeriod - totalDebtPayments*((PERIOD_MULT[period]||4.33)/4.33) - fpWeekSpend*(PERIOD_MULT[period]||4.33) >= 0 ? 'var(--success)' : 'var(--danger)'}}>
                {fmt(totalIncomeForPeriod - totalBillsForPeriod - totalDebtPayments*((PERIOD_MULT[period]||4.33)/4.33) - fpWeekSpend*(PERIOD_MULT[period]||4.33))}
              </strong>
            </div>
          </section>

          {/* 50/30/20 allocation */}
          <section className="card">
            <p className="eyebrow">Spending Allocation</p>
            <h3 style={{ margin: '4px 0 12px' }}>Where Should Your Money Go?</h3>
            <p className="muted" style={{fontSize:'.8rem',marginBottom:14}}>Based on {period === 'monthly' ? `${monthLabel(CUR_MONTH, { month: 'long' })}'s` : `your ${period}`} income of <strong>{fmt(totalIncomeForPeriod)}</strong></p>
            {[
              ['50% — Needs', needs50, totalBillsForPeriod, '#4CAF50', 'Fixed bills, utilities, groceries, insurance'],
              ['30% — Wants', wants30, fpWeekSpend*(PERIOD_MULT[period]||4.33), '#FF9800', 'Dining, shopping, subscriptions, entertainment'],
              ['20% — Savings & Debt', savings20, totalDebtPayments*((PERIOD_MULT[period]||4.33)/4.33), '#9C27B0', 'Emergency fund, investments, extra debt payments'],
            ].map(([label, target, actual, col, desc]) => {
              const pct = target > 0 ? Math.min((actual / target) * 100, 200) : 0
              const over = actual > target
              return (
                <div key={label} style={{marginBottom:16,padding:'12px',background:'var(--stone)',borderRadius:10}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
                    <strong style={{fontSize:'.85rem',color:col}}>{label}</strong>
                    <span style={{fontSize:'.82rem'}}><strong style={{color:over?'var(--danger)':col}}>{fmt(actual)}</strong> / {fmt(target)}</span>
                  </div>
                  <div style={{height:8,borderRadius:999,background:'var(--border)',marginBottom:6}}>
                    <div style={{height:'100%',borderRadius:999,background:over?'var(--danger)':col,width:`${Math.min(pct,100)}%`,transition:'width .3s'}} />
                  </div>
                  <p className="muted" style={{fontSize:'.72rem',margin:'0 0 2px'}}>{desc}</p>
                  {over && <p style={{fontSize:'.72rem',color:'var(--danger)',margin:0,fontWeight:600}}>⚠ Over target by {fmt(actual-target)}</p>}
                </div>
              )
            })}
          </section>

          {/* Savings rate */}
          <section className="card">
            <p className="eyebrow">Your Savings Rate</p>
            <h3 style={{ margin: '4px 0 14px' }}>How Much Are You Keeping?</h3>
            {(() => {
              const totalOut = totalBillsForPeriod + fpWeekSpend*(PERIOD_MULT[period]||4.33)
              const remaining = totalIncomeForPeriod - totalOut
              const rate = totalIncomeForPeriod > 0 ? (remaining / totalIncomeForPeriod) * 100 : 0
              return (
                <div>
                  <div style={{textAlign:'center',marginBottom:16}}>
                    <div style={{fontSize:'2.5rem',fontWeight:700,color:rate>=20?'var(--success)':rate>=10?'var(--brass)':'var(--danger)'}}>
                      {rate.toFixed(1)}%
                    </div>
                    <p className="muted" style={{fontSize:'.82rem',margin:'4px 0 0'}}>
                      {rate >= 20 ? '🎉 Excellent! Above 20% target' : rate >= 10 ? '👍 Good — aim for 20%+' : '⚠ Below 10% — review your bills and expenses'}
                    </p>
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                    {[
                      ['Going Out', fmt(totalOut), 'var(--danger)'],
                      ['Keeping', fmt(Math.max(0,remaining)), 'var(--success)'],
                    ].map(([label, val, col]) => (
                      <div key={label} style={{background:'var(--stone)',borderRadius:10,padding:'12px',textAlign:'center'}}>
                        <p className="muted" style={{fontSize:'.72rem',margin:'0 0 4px'}}>{label}</p>
                        <strong style={{color:col,fontSize:'1.1rem'}}>{val}</strong>
                      </div>
                    ))}
                  </div>
                  <p className="muted" style={{fontSize:'.78rem',marginTop:14,textAlign:'center',lineHeight:1.5}}>
                    Experts recommend saving at least 20% of your income. Even 1% more per month compounded over years creates significant wealth.
                  </p>
                </div>
              )
            })()}
          </section>
        </div>
      )}

      {/* ── NO-SPEND ─────────────────────────────────────────────────────── */}
      {tab === 'nospend' && (
        <ProTabGate isPro={isPro} onUpgrade={onUpgrade}>
        <section className="card">
          <p className="eyebrow">No-Spend Challenge</p>
          <h3 style={{ margin: '4px 0 6px' }}>Color In One Per Day</h3>
          <p className="muted" style={{ fontSize: '.8rem', marginBottom: 14 }}>
            {noSpendFilled} of {noSpend.days} days complete
          </p>
          <div style={{ height: 8, borderRadius: 999, background: 'var(--border)', marginBottom: 16 }}>
            <div style={{ height: '100%', borderRadius: 999, background: 'var(--success)', width: `${(noSpendFilled / noSpend.days) * 100}%` }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6, marginBottom: 16 }}>
            {daysArray.map(day => {
              const done = noSpend.checked.includes(day)
              return (
                <button key={day} onClick={() => {
                  const next = done ? noSpend.checked.filter(d => d !== day) : [...noSpend.checked, day]
                  saveNoSpend({ ...noSpend, checked: next })
                }} style={{
                  aspectRatio: '1', borderRadius: '50%', border: '1.5px solid var(--border2)',
                  background: done ? 'var(--success)' : 'var(--stone)',
                  color: done ? 'white' : 'var(--ink2)', cursor: 'pointer',
                  fontWeight: 600, fontSize: '.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>{day}</button>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '.85rem' }}>Challenge length:</span>
            {[7, 14, 21, 30].map(d => (
              <button key={d} className={noSpend.days === d ? 'pill active-pill' : 'pill'}
                style={{ fontSize: '.78rem' }}
                onClick={() => saveNoSpend({ days: d, checked: [] })}>{d} days</button>
            ))}
          </div>
        </section>
      </ProTabGate>)}
      <TabNav tabs={TABS} activeTab={tab} onSelect={setTab} />
    </div>
  )
}




// ── WELLNESS PAGE ─────────────────────────────────────────────────────────
// ── Wellness data helpers ───────────────────────────────────────────────
// Workouts used to live under Lifestyle in device-only storage. Fold them in once.
function mergeLegacyWorkouts(current) {
  try {
    if (localStorage.getItem('planner.l.workouts.moved')) return current
    const legacy = JSON.parse(localStorage.getItem('planner.l.workouts') || '[]')
    if (!legacy.length) return current
    const ids = new Set((current || []).map((w) => String(w.id)))
    const add = legacy.filter((w) => !ids.has(String(w.id))).map((w) => ({ ...w, exercises: w.exercises || [] }))
    return add.length ? [...(current || []), ...add] : current
  } catch { return current }
}
const markLegacyWorkoutsMoved = () => { try { localStorage.setItem('planner.l.workouts.moved', '1') } catch {} }
const HW_PREFIX = 'planner.hw.'
function hwRead(key, fallback) {
  try {
    const v = localStorage.getItem(HW_PREFIX + key) ?? localStorage.getItem(key)
    return v ? JSON.parse(v) : fallback
  } catch { return fallback }
}
// Read one wellness key anywhere in the app (e.g. Home), refreshed from Supabase.
function useWellnessKey(key, fallback) {
  const { user } = useAuth()
  const [value, setValue] = useState(() => hwRead(key, fallback))
  useEffect(() => {
    if (!user || !hasSupabaseEnv) return
    let alive = true
    supabase.from('page_data').select('data_value, updated_at').eq('user_id', user.id).eq('page', 'wellness').eq('data_key', key).maybeSingle()
      .then(({ data }) => {
        if (!alive || !data) return
        // Don't let an older server copy replace a save made on this device seconds ago
        const localAt = Number(localStorage.getItem(HW_PREFIX + key + '.at') || 0)
        if (localAt && new Date(data.updated_at).getTime() < localAt - 1000) return
        setValue(data.data_value ?? fallback)
        try { localStorage.setItem(HW_PREFIX + key, JSON.stringify(data.data_value)) } catch {}
      })
    return () => { alive = false }
  }, [user?.id, key])
  return value
}

// Read + write one page_data key from any component (used when a tracker moves
// between pages but keeps its stored data where it was).
function usePageKey(page, key, fallback, localKeys) {
  const { user } = useAuth()
  const keys = Array.isArray(localKeys) ? localKeys : [localKeys]
  const [value, setValue] = useState(() => {
    for (const k of keys) { try { const v = localStorage.getItem(k); if (v != null) return JSON.parse(v) } catch {} }
    return fallback
  })
  useEffect(() => {
    if (!user || !hasSupabaseEnv) return
    let alive = true
    supabase.from('page_data').select('data_value').eq('user_id', user.id).eq('page', page).eq('data_key', key).maybeSingle()
      .then(({ data }) => { if (alive && data) { setValue(data.data_value ?? fallback); try { localStorage.setItem(keys[0], JSON.stringify(data.data_value)) } catch {} } })
    return () => { alive = false }
  }, [user?.id, page, key])
  const save = React.useCallback((v) => {
    setValue(v)
    try { localStorage.setItem(keys[0], JSON.stringify(v)) } catch {}
    if (!user || !hasSupabaseEnv) return
    supabase.from('page_data').upsert({ user_id: user.id, page, data_key: key, data_value: v, updated_at: new Date().toISOString() }, { onConflict: 'user_id,page,data_key' })
      .then(({ error }) => { if (error) console.error('Sync error:', error) })
  }, [user?.id, page, key])
  return [value, save]
}

// Readiness 0–100 from last night's sleep, energy, soreness, stress and pain.
function readinessOf(c) {
  if (!c) return null
  const h = Number(c.sleepHours)
  const sleepPart = !h ? 0.6 : h < 5 ? 0.2 : h < 6 ? 0.45 : h < 7 ? 0.7 : h <= 9 ? 1 : 0.85
  const energy = ((Number(c.energy) || 3) - 1) / 4
  const sore = (5 - (Number(c.soreness) || 3)) / 4
  const stress = (5 - (Number(c.stress) || 3)) / 4
  const pain = Math.min(15, (c.pain || []).length * 5)
  return Math.max(0, Math.min(100, Math.round((sleepPart * 30 + energy * 30 + sore * 25 + stress * 15) - pain)))
}
function readinessBand(score) {
  if (score == null) return null
  if (score >= 75) return { label: 'Train hard', tone: 'good', advice: 'Green light. Push the main work today.' }
  if (score >= 50) return { label: 'Train light', tone: 'mid', advice: 'Moderate volume, longer warm-up, leave a rep or two in the tank.' }
  return { label: 'Recover', tone: 'low', advice: 'Walk, stretch, hydrate, sleep early. Growth happens in recovery.' }
}
const sleepHoursFrom = (bed, wake) => {
  if (!bed || !wake) return ''
  const [bh, bm] = bed.split(':').map(Number), [wh, wm] = wake.split(':').map(Number)
  let mins = (wh * 60 + wm) - (bh * 60 + bm)
  if (mins <= 0) mins += 24 * 60
  return Math.round(mins / 30) / 2
}
const PAIN_AREAS = ['Neck', 'Shoulders', 'Upper back', 'Low back', 'Hips', 'Knees', 'Ankles/feet', 'Elbows/wrists']
const TRAINING_TYPES = ['Strength', 'Hypertrophy', 'Conditioning', 'Calisthenics', 'Mobility', 'Combat', 'Cardio', 'HIIT', 'Running', 'Walking', 'Sports', 'Other']
const exKey = (n) => String(n || '').trim().toLowerCase()
const fmtSet = (e) => [e.sets && e.reps ? `${e.sets}×${e.reps}` : e.sets ? `${e.sets} sets` : e.reps ? `${e.reps} reps` : '', e.weight ? `@ ${e.weight} lb` : ''].filter(Boolean).join(' ')

function ScaleRow({ label, low, high, value, onChange }) {
  return (
    <div className="scale-block">
      <div className="scale-head"><span>{label}</span><small>{low} → {high}</small></div>
      <div className="scale-row" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={value === n}
            className={'scale-btn' + (value === n ? ' active' : '')} onClick={() => onChange(n)}>{n}</button>
        ))}
      </div>
    </div>
  )
}

function TrainingTab({ workouts, onSave }) {
  const blankEx = () => ({ id: newStepId(), name: '', sets: '', reps: '', weight: '' })
  const blank = () => ({ type: 'Strength', duration: '', effort: '', date: TODAY, notes: '', exercises: [blankEx()] })
  const [f, setF] = useState(blank)
  const [open, setOpen] = useState(false)

  const weekStart = startOfWeek(TODAY)
  const thisWeek = workouts.filter((w) => w.date >= weekStart && w.date <= TODAY)
  const weekMins = thisWeek.reduce((n, w) => n + Number(w.duration || 0), 0)

  // Per-exercise history (most recent first) → "Last" + "Best"
  const history = useMemo(() => {
    const map = {}
    workouts.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')).forEach((w) => (w.exercises || []).forEach((e) => {
      const k = exKey(e.name); if (!k) return
      if (!map[k]) map[k] = { name: e.name.trim(), last: e, lastDate: w.date, best: Number(e.weight) || 0, count: 0 }
      map[k].best = Math.max(map[k].best, Number(e.weight) || 0); map[k].count += 1
    }))
    return map
  }, [workouts])
  const topLifts = Object.values(history).sort((a, b) => b.count - a.count).slice(0, 6)

  const setEx = (id, patch) => setF((p) => ({ ...p, exercises: p.exercises.map((e) => e.id === id ? { ...e, ...patch } : e) }))
  const save = () => {
    const exercises = f.exercises.filter((e) => e.name.trim()).map((e) => ({ ...e, name: e.name.trim() }))
    if (!f.duration && !exercises.length) return
    onSave([{ ...f, exercises, id: Date.now() }, ...workouts])
    setF(blank()); setOpen(false)
  }

  return (
    <div className="screen-stack" style={{ gap: 14 }}>
      <section className="card">
        <p className="eyebrow">Training</p>
        <h3 style={{ margin: '4px 0 12px' }}>Log the work</h3>
        <div className="wl-stats">
          <div><strong>{thisWeek.length}</strong><span>sessions this week</span></div>
          <div><strong>{weekMins}</strong><span>minutes this week</span></div>
          <div><strong>{workouts.length}</strong><span>total logged</span></div>
        </div>

        {!open ? (
          <button className="primary-btn" style={{ width: '100%', marginTop: 12 }} onClick={() => setOpen(true)}>+ Log a session</button>
        ) : (
          <div className="wl-form">
            <div className="wl-grid3">
              <label>Type<select value={f.type} onChange={(e) => setF((p) => ({ ...p, type: e.target.value }))}>{TRAINING_TYPES.map((t) => <option key={t}>{t}</option>)}</select></label>
              <label>Minutes<input type="number" inputMode="numeric" value={f.duration} onChange={(e) => setF((p) => ({ ...p, duration: e.target.value }))} placeholder="45" /></label>
              <label>Effort<select value={f.effort} onChange={(e) => setF((p) => ({ ...p, effort: e.target.value }))}><option value="">—</option>{[5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>RPE {n}</option>)}</select></label>
            </div>
            <label>Date<input type="date" value={f.date} onChange={(e) => setF((p) => ({ ...p, date: e.target.value }))} /></label>

            <div className="wl-ex-head"><span>Exercises</span><small>sets × reps @ lb</small></div>
            <datalist id="exercise-names">{Object.values(history).map((h) => <option key={h.name} value={h.name} />)}</datalist>
            {f.exercises.map((e) => {
              const h = history[exKey(e.name)]
              return (
                <div key={e.id} className="wl-ex">
                  <div className="wl-ex-row">
                    <input className="wl-ex-name" list="exercise-names" placeholder="Exercise (e.g. Trap bar deadlift)" value={e.name} onChange={(ev) => setEx(e.id, { name: ev.target.value })} />
                    {f.exercises.length > 1 && <button type="button" className="time-card-del" onClick={() => setF((p) => ({ ...p, exercises: p.exercises.filter((x) => x.id !== e.id) }))} aria-label="Remove exercise">✕</button>}
                  </div>
                  <div className="wl-ex-nums">
                    <input type="number" inputMode="numeric" placeholder="Sets" value={e.sets} onChange={(ev) => setEx(e.id, { sets: ev.target.value })} />
                    <input type="number" inputMode="numeric" placeholder="Reps" value={e.reps} onChange={(ev) => setEx(e.id, { reps: ev.target.value })} />
                    <input type="number" inputMode="decimal" placeholder="lb" value={e.weight} onChange={(ev) => setEx(e.id, { weight: ev.target.value })} />
                  </div>
                  {h && <div className="wl-ex-hint">Last {shortDate(h.lastDate)}: {fmtSet(h.last) || '—'}{h.best ? ` · Best ${h.best} lb` : ''}</div>}
                </div>
              )
            })}
            <button type="button" className="wl-add-ex" onClick={() => setF((p) => ({ ...p, exercises: [...p.exercises, blankEx()] }))}><Plus size={15} /> Add exercise</button>
            <input placeholder="Notes (PRs, how it felt, what to change)" value={f.notes} onChange={(e) => setF((p) => ({ ...p, notes: e.target.value }))} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="secondary-btn" style={{ flex: 1 }} onClick={() => { setF(blank()); setOpen(false) }}>Cancel</button>
              <button className="primary-btn" style={{ flex: 2 }} onClick={save}>Save session</button>
            </div>
          </div>
        )}
      </section>

      {topLifts.length > 0 && (
        <section className="card">
          <p className="eyebrow">Progress</p>
          <h3 style={{ margin: '4px 0 10px' }}>Your main lifts</h3>
          {topLifts.map((h) => (
            <div key={h.name} className="metric-row card-row">
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '.9rem' }}>{h.name}</div>
                <div className="muted" style={{ fontSize: '.74rem' }}>Last {shortDate(h.lastDate)} · {fmtSet(h.last) || '—'} · {h.count} session{h.count !== 1 ? 's' : ''}</div>
              </div>
              {h.best > 0 && <strong style={{ color: 'var(--brass2)', fontSize: '.9rem', whiteSpace: 'nowrap' }}>{h.best} lb</strong>}
            </div>
          ))}
        </section>
      )}

      <section className="card">
        <p className="eyebrow">History</p>
        {workouts.length === 0 ? (
          <EmptyState icon={Dumbbell} title="No sessions yet" message="Log your first session. Exercises you enter here show your last numbers next time." />
        ) : workouts.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 20).map((w) => (
          <div key={w.id} className="wl-session">
            <div className="wl-session-head">
              <div>
                <strong>{w.type}</strong>
                <span className="muted"> · {shortDate(w.date)}{w.duration ? ` · ${w.duration} min` : ''}{w.effort ? ` · RPE ${w.effort}` : ''}</span>
              </div>
              <button className="time-card-del" onClick={() => { if (window.confirm('Delete this session?')) onSave(workouts.filter((x) => x.id !== w.id)) }} aria-label="Delete session">✕</button>
            </div>
            {(w.exercises || []).length > 0 && (
              <ul className="wl-session-ex">{w.exercises.map((e, i) => <li key={i}><span>{e.name}</span><span>{fmtSet(e)}</span></li>)}</ul>
            )}
            {w.notes && <div className="muted" style={{ fontSize: '.78rem', marginTop: 4 }}>{w.notes}</div>}
          </div>
        ))}
      </section>
    </div>
  )
}

function RecoveryTab({ checkins, onSave, sleep }) {
  const today = checkins[TODAY]
  const lastSleep = (sleep || []).find((e) => e.date === TODAY)
  const prefillSleep = lastSleep ? sleepHoursFrom(lastSleep.bed, lastSleep.wake) : ''
  const blank = () => ({ sleepHours: prefillSleep, energy: 0, soreness: 0, stress: 0, pain: [], note: '' })
  const [editing, setEditing] = useState(!today)
  const [f, setF] = useState(() => today ? { ...blank(), ...today } : blank())
  const live = readinessOf({ ...f, energy: f.energy || 3, soreness: f.soreness || 3, stress: f.stress || 3 })
  const score = today ? readinessOf(today) : null
  const band = readinessBand(score)
  const ready = f.energy && f.soreness && f.stress

  const last7 = Array.from({ length: 7 }, (_, i) => addDays(TODAY, i - 6)).map((d) => ({ d, v: readinessOf(checkins[d]) }))
  const painCounts = {}
  Array.from({ length: 14 }, (_, i) => addDays(TODAY, -i)).forEach((d) => (checkins[d]?.pain || []).forEach((a) => { painCounts[a] = (painCounts[a] || 0) + 1 }))
  const painList = Object.entries(painCounts).sort((a, b) => b[1] - a[1])

  return (
    <div className="screen-stack" style={{ gap: 14 }}>
      <section className="card">
        <p className="eyebrow">Recovery</p>
        <h3 style={{ margin: '4px 0 12px' }}>{editing ? 'Daily check-in' : 'Today\'s readiness'}</h3>

        {!editing && today ? (
          <>
            <div className={'readiness-hero tone-' + band.tone}>
              <div className="readiness-num">{score}</div>
              <div>
                <strong>{band.label}</strong>
                <p>{band.advice}</p>
              </div>
            </div>
            <div className="readiness-inputs">
              {today.sleepHours ? <span>Sleep {today.sleepHours}h</span> : null}
              <span>Energy {today.energy}/5</span><span>Soreness {today.soreness}/5</span><span>Stress {today.stress}/5</span>
              {(today.pain || []).length > 0 && <span>Pain: {today.pain.join(', ')}</span>}
            </div>
            <button className="secondary-btn" style={{ marginTop: 12 }} onClick={() => { setF({ ...blank(), ...today }); setEditing(true) }}>Edit check-in</button>
          </>
        ) : (
          <div className="wl-form" style={{ marginTop: 0 }}>
            <label>Sleep last night (hours){lastSleep ? <small className="muted" style={{ fontWeight: 400 }}> · from your sleep log</small> : null}
              <input type="number" step="0.5" inputMode="decimal" value={f.sleepHours} placeholder="7.5" onChange={(e) => setF((p) => ({ ...p, sleepHours: e.target.value }))} />
            </label>
            <ScaleRow label="Energy" low="drained" high="charged" value={f.energy} onChange={(n) => setF((p) => ({ ...p, energy: n }))} />
            <ScaleRow label="Soreness" low="fresh" high="beat up" value={f.soreness} onChange={(n) => setF((p) => ({ ...p, soreness: n }))} />
            <ScaleRow label="Stress" low="calm" high="maxed" value={f.stress} onChange={(n) => setF((p) => ({ ...p, stress: n }))} />
            <div className="scale-block">
              <div className="scale-head"><span>Anything hurting?</span><small>tap all that apply</small></div>
              <div className="pain-chips">
                {PAIN_AREAS.map((a) => {
                  const on = f.pain.includes(a)
                  return <button key={a} type="button" className={'pain-chip' + (on ? ' on' : '')} aria-pressed={on}
                    onClick={() => setF((p) => ({ ...p, pain: on ? p.pain.filter((x) => x !== a) : [...p.pain, a] }))}>{a}</button>
                })}
              </div>
            </div>
            <input placeholder="Note (optional)" value={f.note} onChange={(e) => setF((p) => ({ ...p, note: e.target.value }))} />
            <button className="primary-btn" disabled={!ready} style={{ opacity: ready ? 1 : .5 }}
              onClick={() => { onSave({ ...checkins, [TODAY]: { ...f, at: new Date().toISOString() } }); setEditing(false) }}>
              {ready ? `Save · readiness ${live}` : 'Rate energy, soreness and stress'}
            </button>
            {today && <button className="secondary-btn" onClick={() => setEditing(false)}>Cancel</button>}
          </div>
        )}
      </section>

      <section className="card">
        <p className="eyebrow">Last 7 days</p>
        <div className="readiness-bars">
          {last7.map(({ d, v }) => (
            <div key={d} className="readiness-bar">
              <div className="readiness-bar-track"><div className={'readiness-bar-fill tone-' + (readinessBand(v)?.tone || 'none')} style={{ height: `${v ?? 0}%` }} /></div>
              <span className="readiness-bar-val">{v ?? '–'}</span>
              <span className="readiness-bar-day">{formatDateLabel(d, { weekday: 'narrow' })}</span>
            </div>
          ))}
        </div>
        {painList.length > 0 && (
          <>
            <p className="eyebrow" style={{ marginTop: 14 }}>Pain, last 14 days</p>
            <div className="pain-chips">{painList.map(([a, n]) => <span key={a} className="pain-chip on static">{a} · {n} day{n !== 1 ? 's' : ''}</span>)}</div>
          </>
        )}
      </section>
    </div>
  )
}

const MEAL_SLOTS = ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Shake']
const DEFAULT_TARGETS = { protein: 150, calories: '' }
const dayProtein = (meals, d) => (meals?.[d] || []).reduce((n, m) => n + (Number(m.protein) || 0), 0)
const dayCalories = (meals, d) => (meals?.[d] || []).reduce((n, m) => n + (Number(m.calories) || 0), 0)

function NutritionTab({ meals, onSaveMeals, targets, onSaveTargets, water }) {
  const [f, setF] = useState({ slot: 'Breakfast', name: '', protein: '', calories: '' })
  const [editTargets, setEditTargets] = useState(false)
  const [t, setT] = useState(targets)
  const today = meals[TODAY] || []
  const protein = dayProtein(meals, TODAY)
  const calories = dayCalories(meals, TODAY)
  const target = Number(targets.protein) || 0
  const pct = target ? Math.min(100, Math.round(protein / target * 100)) : 0

  // Recent distinct meals → one-tap re-log
  const favorites = useMemo(() => {
    const seen = new Map()
    Object.keys(meals).sort().reverse().forEach((d) => (meals[d] || []).forEach((m) => {
      const k = exKey(m.name); if (k && !seen.has(k)) seen.set(k, m)
    }))
    return [...seen.values()].slice(0, 8)
  }, [meals])

  const last7 = Array.from({ length: 7 }, (_, i) => addDays(TODAY, i - 6))
  const logged = last7.filter((d) => (meals[d] || []).length)
  const avg = logged.length ? Math.round(logged.reduce((n, d) => n + dayProtein(meals, d), 0) / logged.length) : 0
  const hits = target ? last7.filter((d) => dayProtein(meals, d) >= target).length : 0

  const add = (m) => {
    if (!m.name.trim() && !m.protein) return
    onSaveMeals({ ...meals, [TODAY]: [...today, { id: Date.now(), slot: m.slot, name: m.name.trim(), protein: m.protein, calories: m.calories }] })
  }

  return (
    <div className="screen-stack" style={{ gap: 14 }}>
      <section className="card">
        <div className="section-title-row" style={{ marginBottom: 10 }}>
          <div><p className="eyebrow">Nutrition</p><h3>Today's fuel</h3></div>
          <button className="ghost-btn" style={{ fontSize: '.78rem' }} onClick={() => { setT(targets); setEditTargets((v) => !v) }}>Targets</button>
        </div>

        {editTargets && (
          <div className="wl-form" style={{ marginTop: 0, marginBottom: 12 }}>
            <div className="wl-grid3" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <label>Protein (g/day)<input type="number" inputMode="numeric" value={t.protein} onChange={(e) => setT((p) => ({ ...p, protein: e.target.value }))} /></label>
              <label>Calories (optional)<input type="number" inputMode="numeric" value={t.calories} onChange={(e) => setT((p) => ({ ...p, calories: e.target.value }))} /></label>
            </div>
            <small className="muted">A common starting point for building muscle is about 0.7–1 g of protein per pound of bodyweight.</small>
            <button className="primary-btn" onClick={() => { onSaveTargets(t); setEditTargets(false) }}>Save targets</button>
          </div>
        )}

        <div className="nut-protein">
          <div className="nut-protein-top">
            <span><strong>{protein}</strong> / {target || '—'} g protein</span>
            <span className="muted">{target ? (protein >= target ? 'Target hit' : `${target - protein} g to go`) : 'Set a target'}</span>
          </div>
          <div className="nut-bar"><div style={{ width: `${pct}%` }} className={pct >= 100 ? 'hit' : ''} /></div>
          <div className="nut-mini">
            <span>{calories ? `${calories}${targets.calories ? ` / ${targets.calories}` : ''} cal` : 'Calories optional'}</span>
            <span>{today.length} meal{today.length !== 1 ? 's' : ''}</span>
            <span>Water {water || 0}/8 cups</span>
          </div>
        </div>

        <div className="wl-form">
          <div className="pain-chips">
            {MEAL_SLOTS.map((m) => <button key={m} type="button" className={'pain-chip' + (f.slot === m ? ' sel' : '')} onClick={() => setF((p) => ({ ...p, slot: m }))}>{m}</button>)}
          </div>
          <input placeholder="What did you eat?" value={f.name} onChange={(e) => setF((p) => ({ ...p, name: e.target.value }))} />
          <div className="wl-grid3" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <input type="number" inputMode="numeric" placeholder="Protein (g)" value={f.protein} onChange={(e) => setF((p) => ({ ...p, protein: e.target.value }))} />
            <input type="number" inputMode="numeric" placeholder="Calories" value={f.calories} onChange={(e) => setF((p) => ({ ...p, calories: e.target.value }))} />
          </div>
          <button className="primary-btn" onClick={() => { add(f); setF((p) => ({ ...p, name: '', protein: '', calories: '' })) }}>+ Log meal</button>
        </div>

        {favorites.length > 0 && (
          <>
            <p className="eyebrow" style={{ margin: '14px 0 6px' }}>Log again</p>
            <div className="pain-chips">
              {favorites.map((m) => (
                <button key={m.name} type="button" className="pain-chip" onClick={() => add({ ...m, slot: f.slot })}>
                  {m.name}{m.protein ? ` · ${m.protein}g` : ''}
                </button>
              ))}
            </div>
          </>
        )}

        {today.length > 0 && (
          <div style={{ marginTop: 12 }}>
            {today.map((m) => (
              <div key={m.id} className="metric-row card-row">
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '.88rem' }}>{m.name || m.slot}</div>
                  <div className="muted" style={{ fontSize: '.74rem' }}>{m.slot}{m.calories ? ` · ${m.calories} cal` : ''}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {m.protein ? <strong style={{ color: 'var(--brass2)', fontSize: '.88rem' }}>{m.protein}g</strong> : null}
                  <button className="time-card-del" aria-label="Remove meal" onClick={() => onSaveMeals({ ...meals, [TODAY]: today.filter((x) => x.id !== m.id) })}>✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <p className="eyebrow">Last 7 days</p>
        <div className="readiness-bars">
          {last7.map((d) => {
            const v = dayProtein(meals, d)
            const h = target ? Math.min(100, Math.round(v / target * 100)) : 0
            return (
              <div key={d} className="readiness-bar">
                <div className="readiness-bar-track"><div className={'readiness-bar-fill ' + (target && v >= target ? 'tone-good' : v ? 'tone-mid' : 'tone-none')} style={{ height: `${h}%` }} /></div>
                <span className="readiness-bar-val">{v || '–'}</span>
                <span className="readiness-bar-day">{formatDateLabel(d, { weekday: 'narrow' })}</span>
              </div>
            )
          })}
        </div>
        <p className="muted" style={{ fontSize: '.8rem', margin: '10px 0 0' }}>
          {logged.length ? `Average ${avg} g protein on days logged${target ? ` · target hit ${hits} of 7 days` : ''}.` : 'Log a few meals to see your week.'}
        </p>
        <div className="home-chip-row">
          <Link to="/lifestyle" className="home-chip"><ChefHat size={15} /> Recipes &amp; groceries</Link>
        </div>
      </section>
    </div>
  )
}

// Blood pressure category (American Heart Association ranges) — a label, not a diagnosis.
function bpCategory(sys, dia) {
  sys = Number(sys); dia = Number(dia)
  if (!sys || !dia) return null
  if (sys > 180 || dia > 120) return { label: 'Very high — contact your doctor', tone: 'low' }
  if (sys >= 140 || dia >= 90) return { label: 'High (stage 2)', tone: 'low' }
  if (sys >= 130 || dia >= 80) return { label: 'High (stage 1)', tone: 'mid' }
  if (sys >= 120) return { label: 'Elevated', tone: 'mid' }
  return { label: 'Normal', tone: 'good' }
}

function CareTab({ vitals, onSaveVitals, appts, onSaveAppts, labs, onSaveLabs, onAddEvent }) {
  const [v, setV] = useState({ date: TODAY, sys: '', dia: '', rhr: '', hrv: '' })
  const [a, setA] = useState({ date: TODAY, time: '09:00', who: '', reason: '', addToCalendar: true })
  const [l, setL] = useState({ date: TODAY, test: '', value: '', unit: '' })
  const latest = vitals[0]
  const cat = latest ? bpCategory(latest.sys, latest.dia) : null
  const upcoming = appts.filter((x) => x.date >= TODAY).sort((x, y) => `${x.date}${x.time}`.localeCompare(`${y.date}${y.time}`))
  const past = appts.filter((x) => x.date < TODAY).sort((x, y) => y.date.localeCompare(x.date)).slice(0, 5)
  const labGroups = useMemo(() => {
    const g = {}
    labs.slice().sort((x, y) => y.date.localeCompare(x.date)).forEach((r) => { const k = exKey(r.test); (g[k] = g[k] || { name: r.test, rows: [] }).rows.push(r) })
    return Object.values(g)
  }, [labs])

  return (
    <div className="screen-stack" style={{ gap: 14 }}>
      <section className="card">
        <p className="eyebrow">Vitals</p>
        <h3 style={{ margin: '4px 0 12px' }}>Blood pressure &amp; heart</h3>
        {latest && (
          <div className={'readiness-hero compact tone-' + (cat?.tone || 'mid')} style={{ marginBottom: 12 }}>
            <div className="readiness-num" style={{ fontSize: '1rem', lineHeight: 1.1, textAlign: 'center' }}>{latest.sys && latest.dia ? <>{latest.sys}<br />{latest.dia}</> : '—'}</div>
            <div>
              <strong>{cat ? cat.label : 'Latest reading'}</strong>
              <p>{shortDate(latest.date)}{latest.rhr ? ` · Resting HR ${latest.rhr}` : ''}{latest.hrv ? ` · HRV ${latest.hrv}` : ''}</p>
            </div>
          </div>
        )}
        <div className="wl-form" style={{ marginTop: 0 }}>
          <div className="wl-grid3" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <input type="number" inputMode="numeric" placeholder="Systolic (top)" value={v.sys} onChange={(e) => setV((p) => ({ ...p, sys: e.target.value }))} />
            <input type="number" inputMode="numeric" placeholder="Diastolic (bottom)" value={v.dia} onChange={(e) => setV((p) => ({ ...p, dia: e.target.value }))} />
            <input type="number" inputMode="numeric" placeholder="Resting HR (bpm)" value={v.rhr} onChange={(e) => setV((p) => ({ ...p, rhr: e.target.value }))} />
            <input type="number" inputMode="numeric" placeholder="HRV (ms, optional)" value={v.hrv} onChange={(e) => setV((p) => ({ ...p, hrv: e.target.value }))} />
          </div>
          <input type="date" value={v.date} onChange={(e) => setV((p) => ({ ...p, date: e.target.value }))} />
          <button className="primary-btn" onClick={() => {
            if (!v.sys && !v.rhr && !v.hrv) return
            onSaveVitals([{ ...v, id: Date.now() }, ...vitals].sort((x, y) => y.date.localeCompare(x.date)))
            setV({ date: TODAY, sys: '', dia: '', rhr: '', hrv: '' })
          }}>+ Log vitals</button>
        </div>
        {vitals.slice(0, 8).map((r) => {
          const c = bpCategory(r.sys, r.dia)
          return (
            <div key={r.id} className="metric-row card-row">
              <div>
                <div style={{ fontWeight: 600, fontSize: '.88rem' }}>{r.sys && r.dia ? `${r.sys}/${r.dia}` : '—'}{r.rhr ? ` · ${r.rhr} bpm` : ''}{r.hrv ? ` · HRV ${r.hrv}` : ''}</div>
                <div className="muted" style={{ fontSize: '.74rem' }}>{shortDate(r.date)}{c ? ` · ${c.label}` : ''}</div>
              </div>
              <button className="time-card-del" aria-label="Delete reading" onClick={() => onSaveVitals(vitals.filter((x) => x.id !== r.id))}>✕</button>
            </div>
          )
        })}
      </section>

      <section className="card">
        <p className="eyebrow">Appointments</p>
        <h3 style={{ margin: '4px 0 12px' }}>Doctor, dentist, therapy, PT</h3>
        <div className="wl-form" style={{ marginTop: 0 }}>
          <input placeholder="Who (e.g. Dr. Smith, dentist)" value={a.who} onChange={(e) => setA((p) => ({ ...p, who: e.target.value }))} />
          <input placeholder="Reason or what to ask" value={a.reason} onChange={(e) => setA((p) => ({ ...p, reason: e.target.value }))} />
          <div className="wl-grid3" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <input type="date" value={a.date} onChange={(e) => setA((p) => ({ ...p, date: e.target.value }))} />
            <input type="time" value={a.time} onChange={(e) => setA((p) => ({ ...p, time: e.target.value }))} />
          </div>
          {onAddEvent && (
            <label className="care-check"><input type="checkbox" checked={a.addToCalendar} onChange={(e) => setA((p) => ({ ...p, addToCalendar: e.target.checked }))} /> Also put it on my calendar</label>
          )}
          <button className="primary-btn" onClick={() => {
            if (!a.who.trim()) return
            const appt = { id: Date.now(), date: a.date, time: a.time, who: a.who.trim(), reason: a.reason.trim() }
            onSaveAppts([...appts, appt])
            if (a.addToCalendar && onAddEvent) onAddEvent({ title: appt.reason ? `${appt.who} · ${appt.reason}` : appt.who, date: appt.date, startTime: appt.time, endTime: '', category: 'Health', location: '' })
            setA({ date: TODAY, time: '09:00', who: '', reason: '', addToCalendar: true })
          }}>+ Add appointment</button>
        </div>
        {upcoming.length === 0 && past.length === 0 && <p className="muted" style={{ fontSize: '.84rem', margin: '10px 0 0' }}>No appointments yet.</p>}
        {[...upcoming, ...past].map((x) => (
          <div key={x.id} className="metric-row card-row" style={x.date < TODAY ? { opacity: .6 } : undefined}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: '.88rem' }}>{x.who}</div>
              <div className="muted" style={{ fontSize: '.74rem' }}>{shortDate(x.date)}{x.time ? ` · ${fmt12(x.time)}` : ''}{x.reason ? ` · ${x.reason}` : ''}</div>
            </div>
            <button className="time-card-del" aria-label="Delete appointment" onClick={() => onSaveAppts(appts.filter((y) => y.id !== x.id))}>✕</button>
          </div>
        ))}
      </section>

      <section className="card">
        <p className="eyebrow">Lab results</p>
        <h3 style={{ margin: '4px 0 12px' }}>Track numbers over time</h3>
        <div className="wl-form" style={{ marginTop: 0 }}>
          <datalist id="lab-names">{labGroups.map((g) => <option key={g.name} value={g.name} />)}</datalist>
          <input list="lab-names" placeholder="Test (e.g. Vitamin D, A1C, LDL)" value={l.test} onChange={(e) => setL((p) => ({ ...p, test: e.target.value }))} />
          <div className="wl-grid3">
            <input placeholder="Value" inputMode="decimal" value={l.value} onChange={(e) => setL((p) => ({ ...p, value: e.target.value }))} />
            <input placeholder="Unit" value={l.unit} onChange={(e) => setL((p) => ({ ...p, unit: e.target.value }))} />
            <input type="date" value={l.date} onChange={(e) => setL((p) => ({ ...p, date: e.target.value }))} />
          </div>
          <button className="primary-btn" onClick={() => {
            if (!l.test.trim() || !l.value) return
            onSaveLabs([...labs, { ...l, test: l.test.trim(), id: Date.now() }])
            setL((p) => ({ ...p, value: '' }))
          }}>+ Add result</button>
        </div>
        {labGroups.map((g) => (
          <div key={g.name} className="metric-row card-row">
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: '.88rem' }}>{g.name}</div>
              <div className="muted" style={{ fontSize: '.74rem' }}>{g.rows.slice(0, 4).map((r) => `${r.value}${r.unit ? ' ' + r.unit : ''} (${shortDate(r.date)})`).join(' → ')}</div>
            </div>
            <button className="time-card-del" aria-label="Delete latest result" onClick={() => onSaveLabs(labs.filter((x) => x.id !== g.rows[0].id))}>✕</button>
          </div>
        ))}
      </section>
    </div>
  )
}

const WELLNESS_GROUPS = [
  { label: 'Body', ids: ['training', 'recovery', 'nutrition', 'sleep', 'metrics'] },
  { label: 'Mind', ids: ['mood', 'journal', 'routine', 'anxiety', 'coping'] },
  { label: 'Care', ids: ['care', 'meds', 'migraines'] },
]

function HealthWellnessPage({ isPro = false, onUpgrade = () => {}, onAddEvent }) {
  const { user } = useAuth()

  const syncPageData = React.useCallback(async (key, value) => {
    try { localStorage.setItem(HW_PREFIX + key, JSON.stringify(value)); localStorage.setItem(HW_PREFIX + key + '.at', String(Date.now())) } catch {}
    if (!user || !hasSupabaseEnv) return
    try {
      await supabase.from('page_data').upsert({
        user_id: user.id, page: 'wellness', data_key: key, data_value: value,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,page,data_key' })
    } catch (e) { console.error('Wellness sync error:', e) }
  }, [user?.id])

  React.useEffect(() => {
    if (!user || !hasSupabaseEnv) return
    supabase.from('page_data')
      .select('data_key, data_value')
      .eq('user_id', user.id).eq('page', 'wellness')
      .then(({ data, error }) => {
        if (error || !data) return
        data.forEach(row => {
          if (row.data_key === 'routine') setRoutine(row.data_value || [])
          if (row.data_key === 'meds') setMeds(row.data_value || [])
          if (row.data_key === 'anxiety') setAnxiety(row.data_value || [])
          if (row.data_key === 'migraines') setMigraines(row.data_value || [])
          if (row.data_key === 'waterLog') setWaterLog(row.data_value || {})
          if (row.data_key === 'measurements') setMeasurements(row.data_value || [])
          if (row.data_key === 'journalEntries') setJournalEntries(row.data_value || [])
          if (row.data_key === 'routineLog') setRoutineLog(row.data_value || {})
          if (row.data_key === 'wellnessLog') setWellnessLog(row.data_value || {})
          if (row.data_key === 'medLog') setMedLog(row.data_value || {})
          if (row.data_key === 'sleep') setSleep(row.data_value || [])
          if (row.data_key === 'copingUsed') setCopingUsed(row.data_value || {})
          if (row.data_key === 'metricsLog') setMetricsLog(row.data_value || [])
          if (row.data_key === 'workouts') setWorkouts(row.data_value || [])
          if (row.data_key === 'recovery') setRecovery(row.data_value || {})
          if (row.data_key === 'meals') setMeals(row.data_value || {})
          if (row.data_key === 'nutritionTargets') setNutritionTargets({ ...DEFAULT_TARGETS, ...(row.data_value || {}) })
          if (row.data_key === 'vitals') setVitals(row.data_value || [])
          if (row.data_key === 'appointments') setAppts(row.data_value || [])
          if (row.data_key === 'labs') setLabs(row.data_value || [])
        })
        // One-time move of workouts logged under Lifestyle (device-only) into synced Wellness
        const remote = (data.find((r) => r.data_key === 'workouts')?.data_value) || []
        const merged = mergeLegacyWorkouts(remote)
        if (merged !== remote) { setWorkouts(merged); syncPageData('workouts', merged) }
        markLegacyWorkoutsMoved()
      })
  }, [user?.id])

  // Offline/demo mode: keep the moved workouts locally
  React.useEffect(() => {
    if (hasSupabaseEnv) return
    const cur = lsGet('workouts', [])
    const merged = mergeLegacyWorkouts(cur)
    if (merged !== cur) syncPageData('workouts', merged)
    markLegacyWorkoutsMoved()
  }, [])

  // ── Shared ─────────────────────────────────────────────────────────────
  const lsGet = (k, d) => hwRead(k, d)
  const lsSet = (k, v) => { try { localStorage.setItem('planner.hw.' + k, JSON.stringify(v)) } catch {} }

  // ── Wellness state ──────────────────────────────────────────────────────

  const [routine, setRoutine] = useState(() => lsGet('routine', []))
  const [newRoutineItem, setNewRoutineItem] = useState({ time: '', label: '', type: 'morning' })
  const [routineLog, setRoutineLog] = useState(() => lsGet('routineLog', {}))
  const [wellnessLog, setWellnessLog] = useState(() => lsGet('wellnessLog', {}))
  const [journalEntries, setJournalEntries] = useState(() => lsGet('journalEntries', lsGet('journal', [])))
  const [journalText, setJournalText] = useState('')
  const [journalPrompt, setJournalPrompt] = useState(0)

  const saveRoutine = (r) => { setRoutine(r); syncPageData('routine', r) }
  const saveLog = (l) => { setRoutineLog(l); syncPageData('routineLog', l) }
  const saveWellness = (w) => { setWellnessLog(w); syncPageData('wellnessLog', w) }
  const saveJournal = (j) => { setJournalEntries(j); syncPageData('journalEntries', j) }

  const todayKey = TODAY
  const todayLog = routineLog[todayKey] || []
  const todayWellness = wellnessLog[todayKey] || {}
  const toggleRoutineItem = (id) => {
    const next = todayLog.includes(id) ? todayLog.filter(x => x !== id) : [...todayLog, id]
    saveLog({ ...routineLog, [todayKey]: next })
  }
  const logWellness = (field, value) => saveWellness({ ...wellnessLog, [todayKey]: { ...todayWellness, [field]: value } })

  const MOOD_OPTIONS = [
    { emoji: '😄', label: 'Great', value: 5 },
    { emoji: '🙂', label: 'Good', value: 4 },
    { emoji: '😐', label: 'Okay', value: 3 },
    { emoji: '😔', label: 'Low', value: 2 },
    { emoji: '😩', label: 'Rough', value: 1 },
  ]
  const SLEEP_OPTIONS = ['< 5h', '5-6h', '6-7h', '7-8h', '8-9h', '9h+']
  const JOURNAL_PROMPTS = [
    'What am I grateful for today?',
    'What challenged me today and what did I learn?',
    'What would make today feel complete?',
    'Where did I see God at work today?',
    'What is one thing I want to let go of?',
    'What am I proud of this week?',
    'What does rest look like for me right now?',
    'What relationships need my attention?',
    'Where am I growing the most?',
    'What would I tell my future self about today?',
  ]



  // ── Health state ────────────────────────────────────────────────────────
  const [tab, setTab] = useUrlTab('mood')
  
  

  // tab state above
  const [metricsLog, setMetricsLog] = useState(() => { const v = lsGet('metricsLog', null); if (v) return v; try { const o = localStorage.getItem('planner.h.metrics'); return o ? JSON.parse(o) : [] } catch { return [] } })
  const [workouts, setWorkouts] = useState(() => mergeLegacyWorkouts(lsGet('workouts', [])))
  const [recovery, setRecovery] = useState(() => lsGet('recovery', {}))
  const saveWorkouts = (w) => { setWorkouts(w); syncPageData('workouts', w) }
  const saveRecovery = (r) => { setRecovery(r); syncPageData('recovery', r) }
  const [meals, setMeals] = useState(() => lsGet('meals', {}))
  const [nutritionTargets, setNutritionTargets] = useState(() => ({ ...DEFAULT_TARGETS, ...lsGet('nutritionTargets', {}) }))
  const [vitals, setVitals] = useState(() => lsGet('vitals', []))
  const [appts, setAppts] = useState(() => lsGet('appointments', []))
  const [labs, setLabs] = useState(() => lsGet('labs', []))
  const saveMeals = (m) => { setMeals(m); syncPageData('meals', m) }
  const saveTargets = (t) => { setNutritionTargets(t); syncPageData('nutritionTargets', t) }
  const saveVitals = (v) => { setVitals(v); syncPageData('vitals', v) }
  const saveAppts = (a) => { setAppts(a); syncPageData('appointments', a) }
  const saveLabs = (l) => { setLabs(l); syncPageData('labs', l) }
  const [newMetric, setNewMetric] = useState({ weight: '', bp: '', heartRate: '', waist: '', notes: '' })
  const saveMetrics = (m) => { setMetricsLog(m); syncPageData('metricsLog', m) }
  const [meds, setMeds] = useState(() => lsGet('meds', []))
  const [medLog, setMedLog] = useState(() => lsGet('medLog', {}))
  const [copingUsed, setCopingUsed] = useState(() => lsGet('copingUsed', {}))
  const saveCopingUsed = (v) => { setCopingUsed(v); syncPageData('copingUsed', v) }
  const todayCopingKey = TODAY
  const todayCopingUsed = copingUsed[todayCopingKey] || []
  const [anxiety, setAnxiety] = useState(() => lsGet('anxiety', []))
  const [migraines, setMigraines] = useState(() => lsGet('migraines', []))
  const [waterLog, setWaterLog] = useState(() => lsGet('waterLog', {}))
  const saveWaterLog = (w) => { setWaterLog(w); syncPageData('waterLog', w) }
  const [measurements, setMeasurements] = useState(() => lsGet('measurements', []))
  const saveMeasurements = (m) => { setMeasurements(m); syncPageData('measurements', m) }
  const [newMeasurement, setNewMeasurement] = useState({weight:'', waist:'', hip:'', bodyFat:'', date:TODAY})
  const [sleep, setSleep] = useState(() => lsGet('sleep', []))
  const [form, setForm] = useState({})

  const saveMeds = (m) => { setMeds(m); syncPageData('meds', m) }
  const saveMedLog = (l) => { setMedLog(l); syncPageData('medLog', l) }
  const saveAnxiety = (a) => { setAnxiety(a); syncPageData('anxiety', a) }
  const saveMigraines = (m) => { setMigraines(m); syncPageData('migraines', m) }
  const saveSleep = (s) => { setSleep(s); syncPageData('sleep', s) }

  const todayMedKey = TODAY
  const todayMeds = medLog[todayMedKey] || []


  const COPING_SKILLS = {
    'Distractions': [
      'Clean or organize your environment','Dance','Doodle on paper','Draw','Garden',
      'Go for a drive','Go for a walk','Go shopping','Hug a stuffed animal',
      'Listen to music','Paint','Photography','Play a game','Play an instrument',
      'Put a puzzle together','Read','Sing','Take a break','Take a shower or a bath',
      'Watch funny videos','Watch a movie','Write'
    ],
    'Cognitive Coping': [
      'Act opposite of negative feelings','Brainstorm solutions','Make a gratitude list',
      'Read an inspirational quote','Reward yourself when successful','Slowly count to ten',
      'Take a class','Think about someone you love','Think of something funny',
      'Use positive self-talk','Visualize your favorite place','Write a list of goals',
      'Write a list of pros and cons','Write a list of strengths','Write a positive note'
    ],
    'Tension Releasers': [
      'Chew gum','Cry','Exercise or play sports','Laugh','Stretch','Use a stress ball'
    ]
  }

  const ANXIETY_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  const anxietyColor = (n) => n <= 3 ? 'var(--success)' : n <= 6 ? 'var(--warning)' : 'var(--danger)'


  const TABS = [
    {id:'mood',label:'😊 Mood'},{id:'training',label:'Training'},{id:'recovery',label:'Recovery'},{id:'nutrition',label:'Nutrition'},{id:'sleep',label:'😴 Sleep'},
    {id:'journal',label:'✍ Journal'},{id:'routine',label:'🌅 Routine'},
    {id:'meds',label:'💊 Medications'},
    {id:'metrics',label:'📈 Body Metrics'},{id:'care',label:'Vitals & Care'},{id:'anxiety',label:'🧘 Anxiety'},
    {id:'migraines',label:'🤕 Migraines'},{id:'coping',label:'🛡 Coping Skills'},
  ]

  return (
    <div className="screen-stack">
      <PageHeader icon={Leaf} title="Health & Wellness" subtitle="Care for the whole person" />

      {WELLNESS_GROUPS.map((g) => (
        <div key={g.label} className="tab-group">
          <p className="tab-group-label">{g.label}</p>
          <QuickAccessGrid tabs={g.ids.map((id) => TABS.find((t) => t.id === id)).filter(Boolean)} activeTab={tab} onSelect={setTab} proTabs={PRO_TABS.wellness} isPro={isPro} />
        </div>
      ))}

      {/* ── Mood ─────────────────────────────────────────────────── */}
      {tab === 'training' && (
        <ProTabGate isPro={isPro} onUpgrade={onUpgrade}>
          <TrainingTab workouts={workouts} onSave={saveWorkouts} />
        </ProTabGate>
      )}
      {tab === 'recovery' && <RecoveryTab checkins={recovery} onSave={saveRecovery} sleep={sleep} />}
      {tab === 'nutrition' && (
        <ProTabGate isPro={isPro} onUpgrade={onUpgrade}>
          <section className="card" style={{marginBottom:14}}>
          {/* Water Intake */}
          <div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
              <p style={{fontSize:'.72rem',color:'var(--ink2)',fontWeight:600,letterSpacing:'.06em',textTransform:'uppercase',margin:0}}>Water today</p>
              <strong style={{fontSize:'.85rem',color:'var(--brass2)'}}>{waterLog[TODAY] || 0} / 8 cups</strong>
            </div>
            <div style={{display:'flex',gap:6,marginBottom:8}}>
              {Array.from({length: 8}).map((_, i) => {
                const filled = (waterLog[TODAY] || 0) > i
                return (
                  <button key={i} onClick={() => {
                    const current = waterLog[TODAY] || 0
                    saveWaterLog({...waterLog, [TODAY]: i+1 <= current ? i : i+1})
                  }} style={{
                    flex:1, aspectRatio:'1', borderRadius:8, cursor:'pointer',
                    background: filled ? 'var(--ink)' : 'transparent',
                    border: filled ? '1.5px solid var(--ink)' : '1.5px solid var(--border2)',
                    color: filled ? 'var(--brass)' : 'var(--muted)',
                    fontSize:'.9rem',padding:0,
                  }}>{filled ? '●' : ''}</button>
                )
              })}
            </div>
            <p className="muted" style={{fontSize:'.74rem',margin:0,fontStyle:'italic'}}>Tap to log each cup (8oz). Goal: 64oz daily.</p>
          </div>
          </section>
          <NutritionTab meals={meals} onSaveMeals={saveMeals} targets={nutritionTargets} onSaveTargets={saveTargets} water={waterLog[TODAY]} />
        </ProTabGate>
      )}
      {tab === 'care' && (
        <ProTabGate isPro={isPro} onUpgrade={onUpgrade}>
          <CareTab vitals={vitals} onSaveVitals={saveVitals} appts={appts} onSaveAppts={saveAppts} labs={labs} onSaveLabs={saveLabs} onAddEvent={onAddEvent} />
        </ProTabGate>
      )}

      {tab === 'mood' && (
        <div>
          <section className="card">

            <p className="eyebrow">Daily Check-In</p>
            <h3 style={{margin:'4px 0 14px'}}>How are you feeling today?</h3>
            <div style={{display:'flex',gap:8,justifyContent:'space-between',marginBottom:16}}>
              {MOOD_OPTIONS.map(m => (
                <button key={m.value} onClick={() => logWellness('mood', m.value)} style={{
                  flex:1,padding:'10px 4px',borderRadius:'var(--radius-sm)',border:'2px solid',
                  cursor:'pointer',textAlign:'center',fontFamily:'var(--sans)',
                  borderColor: todayWellness.mood===m.value ? 'var(--brass)' : 'var(--border2)',
                  background: todayWellness.mood===m.value ? 'var(--brass-dim)' : 'transparent',
                  transition:'all .15s'
                }}>
                  <div style={{fontSize:'1.4rem',marginBottom:3}}>{m.emoji}</div>
                  <div style={{fontSize:'.58rem',fontWeight:600,color:todayWellness.mood===m.value?'var(--brass)':'var(--muted)'}}>{m.label}</div>
                </button>
              ))}
            </div>
            {todayWellness.mood && (
              <div style={{padding:'10px 12px',background:'var(--brass-dim)',borderRadius:'var(--radius-sm)',fontSize:'.82rem',color:'var(--brass2)',textAlign:'center'}}>
                {todayWellness.mood >= 4 ? '✦ Carry that energy forward today.' : todayWellness.mood >= 3 ? "✦ That's okay. One step at a time." : '✦ Reach out to someone. You matter.'}
              </div>
            )}
          </section>

          <section className="card">
            <p className="eyebrow">Energy & Readiness</p>
            {recovery[TODAY] ? (
              <button className={'readiness-hero compact tone-' + (readinessBand(readinessOf(recovery[TODAY]))?.tone || 'mid')} onClick={() => setTab('recovery')} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', font: 'inherit' }}>
                <div className="readiness-num">{readinessOf(recovery[TODAY])}</div>
                <div><strong>Energy {recovery[TODAY].energy}/5 · {readinessBand(readinessOf(recovery[TODAY])).label}</strong><p>From today's check-in. Tap to update.</p></div>
              </button>
            ) : (
              <button className="readiness-cta" onClick={() => setTab('recovery')} style={{ width: '100%', border: 'none', cursor: 'pointer', font: 'inherit', textAlign: 'left' }}>
                <Gauge size={20} />
                <div><strong>Rate your energy</strong><span>Part of the 20-second daily check-in</span></div>
                <span aria-hidden="true">→</span>
              </button>
            )}
          </section>

          <section className="card">
            <p className="eyebrow">Mood History</p>
            <h3 style={{margin:'4px 0 12px'}}>This Week</h3>
            <div style={{display:'flex',gap:6}}>
              {getWeekDays(TODAY).map(date => {
                const log = wellnessLog[date] || {}
                const mood = MOOD_OPTIONS.find(m => m.value === log.mood)
                return (
                  <div key={date} style={{flex:1,textAlign:'center'}}>
                    <div style={{fontSize:'1.1rem',marginBottom:3}}>{mood ? mood.emoji : '—'}</div>
                    <div style={{fontSize:'.6rem',color:'var(--muted)',fontWeight:600}}>{new Date(date+'T12:00:00').toLocaleDateString('en-US',{weekday:'narrow'})}</div>
                  </div>
                )
              })}
            </div>
          </section>
        </div>
      )}

      {/* ── Sleep ────────────────────────────────────────────────── */}
      {/* ── Journal ──────────────────────────────────────────────── */}
      {tab === 'journal' && (
        <ProTabGate isPro={isPro} onUpgrade={onUpgrade}>
        <div>
          <section className="card">
            <p className="eyebrow">Reflection</p>
            <h3 style={{margin:'4px 0 10px'}}>Today's Entry</h3>
            <div style={{padding:'10px 12px',background:'var(--brass-dim)',borderRadius:'var(--radius-sm)',marginBottom:12,cursor:'pointer'}}
              onClick={() => setJournalPrompt((journalPrompt+1)%JOURNAL_PROMPTS.length)}>
              <div style={{fontSize:'.65rem',fontWeight:700,color:'var(--brass)',letterSpacing:'.08em',marginBottom:3}}>TODAY'S PROMPT — TAP TO CHANGE</div>
              <div style={{fontSize:'.88rem',color:'var(--ink)',fontStyle:'italic',fontFamily:'var(--serif)'}}>{JOURNAL_PROMPTS[journalPrompt]}</div>
            </div>
            <textarea value={journalText} onChange={e=>setJournalText(e.target.value)}
              placeholder="Write freely. This is your space."
              style={{width:'100%',minHeight:140,padding:'12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.9rem',fontFamily:'var(--serif)',color:'var(--ink)',background:'var(--stone)',resize:'none',lineHeight:1.7}} />
            <button className="primary-btn" style={{width:'100%',marginTop:10,fontSize:'.88rem'}}
              onClick={() => {
                if(!journalText.trim()) return
                const entry = {id:Date.now(),date:TODAY,text:journalText.trim(),prompt:JOURNAL_PROMPTS[journalPrompt]}
                const updated = [entry,...journalEntries]
                saveJournal(updated)
                setJournalText('')
              }}>Save Entry</button>
          </section>
          {journalEntries.slice(0,10).map(entry => (
            <section key={entry.id} className="card">
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
                <div style={{fontSize:'.65rem',fontWeight:700,color:'var(--brass)',letterSpacing:'.08em'}}>{entry.date}</div>
                <button onClick={()=>saveJournal(journalEntries.filter(e=>e.id!==entry.id))}
                  style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',fontSize:'.85rem'}}>✕</button>
              </div>
              {entry.prompt && <div style={{fontSize:'.75rem',color:'var(--muted)',fontStyle:'italic',marginBottom:6}}>{entry.prompt}</div>}
              <p style={{fontSize:'.88rem',color:'var(--ink2)',lineHeight:1.7,fontFamily:'var(--serif)',whiteSpace:'pre-wrap'}}>{entry.text}</p>
            </section>
          ))}
        </div>
      </ProTabGate>)}

      {/* ── Routine ──────────────────────────────────────────────── */}
      {tab === 'routine' && (
        <ProTabGate isPro={isPro} onUpgrade={onUpgrade}>
        <section className="card">
          <p className="eyebrow">Daily Routine Builder</p>
          <h3 style={{margin:'4px 0 14px'}}>Your Rhythm</h3>
          {routine.length === 0 && <p className="muted" style={{fontSize:'.85rem',marginBottom:12}}>Build your morning and evening rhythm below.</p>}
          {routine.map(item => {
            const done = todayLog.includes(item.id)
            return (
              <div key={item.id} onClick={() => toggleRoutineItem(item.id)} style={{
                display:'flex',alignItems:'center',gap:10,padding:'10px 0',
                borderBottom:'1px solid var(--stone2)',cursor:'pointer'
              }}>
                <div style={{width:22,height:22,borderRadius:6,border:'2px solid',flexShrink:0,
                  borderColor:done?'var(--success)':'var(--border2)',
                  background:done?'var(--success)':'var(--warm-white)',
                  display:'grid',placeItems:'center'}}>
                  {done && <span style={{color:'white',fontSize:'.72rem',fontWeight:800}}>✓</span>}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:'.9rem',fontWeight:500,color:done?'var(--muted)':'var(--ink)',textDecoration:done?'line-through':'none'}}>{item.label}</div>
                  <div style={{fontSize:'.72rem',color:'var(--muted)'}}>{item.time} · {item.type}</div>
                </div>
                <button onClick={e=>{e.stopPropagation();saveRoutine(routine.filter(r=>r.id!==item.id))}}
                  style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer'}}>✕</button>
              </div>
            )
          })}
          <div style={{display:'grid',gap:8,marginTop:12}}>
            <input placeholder="Routine item (e.g. Prayer, Workout, Read)" value={newRoutineItem.label}
              onChange={e=>setNewRoutineItem(p=>({...p,label:e.target.value}))}
              style={{padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.88rem',background:'var(--stone)',color:'var(--text)'}} />
            <div style={{display:'flex',gap:8}}>
              <input placeholder="Time (6:00 AM)" value={newRoutineItem.time}
                onChange={e=>setNewRoutineItem(p=>({...p,time:e.target.value}))}
                style={{flex:1,padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.85rem',background:'var(--stone)',color:'var(--text)'}} />
              <select value={newRoutineItem.type} onChange={e=>setNewRoutineItem(p=>({...p,type:e.target.value}))}
                style={{flex:1,padding:'9px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.85rem',background:'var(--stone)',color:'var(--text)'}}>
                <option value="morning">Morning</option>
                <option value="evening">Evening</option>
                <option value="anytime">Anytime</option>
              </select>
            </div>
            <button className="primary-btn" onClick={() => {
              if(!newRoutineItem.label) return
              saveRoutine([...routine,{...newRoutineItem,id:Date.now()}])
              setNewRoutineItem({time:'',label:'',type:'morning'})
            }}>Add to Routine</button>
          </div>
        </section>
      </ProTabGate>)}

      {/* ── Reading ──────────────────────────────────────────────── */}

      {tab === 'meds' && (
        <ProTabGate isPro={isPro} onUpgrade={onUpgrade}>
        <>
          <section className="card">
            <p className="eyebrow">Today's Medications</p>
            <h3 style={{ margin: '4px 0 14px' }}>Medication Log — {TODAY}</h3>
            {meds.map((med, i) => {
              // Use unique key per med instance (index-based) not just name
              const medKey = `${med.name}_${i}`
              const taken = todayMeds.includes(medKey)
              // Check if scheduled for today based on frequency
              const todayDay = new Date().toLocaleDateString('en-US',{weekday:'long'})
              const isScheduled = !med.days || med.days.length === 0 || med.days.includes(todayDay)
              return (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--surface)' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '.9rem', color: taken ? 'var(--muted)' : 'var(--text)', textDecoration: taken ? 'line-through' : 'none' }}>{med.name}</div>
                    <div style={{ fontSize: '.75rem', color: 'var(--muted)' }}>{med.dose} · {med.time} · {med.type}</div>
                  </div>
                  {isScheduled ? (
                  <button onClick={() => saveMedLog({ ...medLog, [todayMedKey]: taken ? todayMeds.filter(n => n !== medKey) : [...todayMeds, medKey] })}
                    style={{ padding: '6px 14px', borderRadius: 999, border: '1.5px solid', cursor: 'pointer', fontSize: '.82rem', fontWeight: 700, fontFamily: 'inherit',
                      borderColor: taken ? 'var(--success)' : 'var(--teal)',
                      background: taken ? 'rgba(34,197,94,.1)' : 'var(--teal)',
                      color: taken ? 'var(--success)' : 'var(--navy)' }}>
                    {taken ? '✓ Taken' : 'Take'}
                  </button>
                  ) : (
                  <span style={{fontSize:'.75rem',color:'var(--muted)',fontStyle:'italic'}}>Not scheduled today</span>
                  )}
                </div>
              )
            })}
            {meds.length === 0 && <p className="muted" style={{fontSize:'.85rem'}}><EmptyState icon="💊" title="No medications added" message="Track supplements or medications you take daily." /></p>}
          </section>
          <section className="card">
            <p className="eyebrow">Medication Summary</p>
            <h3 style={{ margin: '4px 0 12px' }}>Add Medication / Supplement</h3>
            <div style={{ display: 'grid', gap: 8 }}>
              {[['Name', 'medName', 'text', 'e.g. Vitamin D, Metformin'], ['Dose', 'medDose', 'text', 'e.g. 500mg'], ['Time', 'medTime', 'text', 'e.g. Morning, With food']].map(([lbl, key, type, ph]) => (
                <input key={key} type={type} placeholder={`${lbl} — ${ph}`} value={form[key] || ''} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                  style={{ padding: '9px 12px', border: '1.5px solid var(--border2)', borderRadius: 'var(--radius-sm)', fontSize: '.85rem' }} />
              ))}
              {/* Days of week selector */}
              <div>
                <p style={{fontSize:'.78rem',color:'var(--ink2)',marginBottom:6,fontWeight:600}}>Scheduled Days (leave blank for daily)</p>
                <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                  {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(day => {
                    const sel = (form.medDays||[]).includes(day)
                    return (
                      <button key={day} type="button" onClick={() => setForm(p => ({
                        ...p, medDays: sel ? (p.medDays||[]).filter(d=>d!==day) : [...(p.medDays||[]), day]
                      }))} style={{
                        padding:'5px 10px', borderRadius:999, fontSize:'.75rem', fontWeight:600,
                        border:'1.5px solid', cursor:'pointer',
                        borderColor: sel ? 'var(--teal)' : 'var(--border2)',
                        background: sel ? 'var(--teal)' : 'transparent',
                        color: sel ? 'white' : 'var(--ink2)',
                      }}>{day}</button>
                    )
                  })}
                </div>
              </div>
              <button className="primary-btn" onClick={() => {
                if(!form.medName) return
                saveMeds([...meds, {name:form.medName, dose:form.medDose||'', time:form.medTime||'', days:form.medDays||[], notes:form.medNotes||''}])
                setForm(p => ({...p, medName:'', medDose:'', medTime:'', medNotes:''}))
              }}>Add Medication</button>
            </div>
            {meds.length > 0 && (
              <div style={{ marginTop: 14 }}>
                {meds.map((med, i) => (
                  <div key={i} className="metric-row card-row">
                    <div>
                      <span style={{ fontWeight: 600, fontSize: '.88rem' }}>{med.name}</span>
                      <span style={{ fontSize: '.75rem', color: 'var(--muted)', marginLeft: 8 }}>{med.dose} · {med.time}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={{ fontSize: '.72rem', padding: '2px 8px', borderRadius: 999, background: 'var(--teal-dim)', color: 'var(--teal)' }}>{med.type}</span>
                      <button onClick={() => saveMeds(meds.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      </ProTabGate>)}

      {tab === 'sleep' && (
        <ProTabGate isPro={isPro} onUpgrade={onUpgrade}>
        <section className="card">
          <p className="eyebrow">Sleep Tracker</p>
          <h3 style={{ margin: '4px 0 12px' }}>Sleep Log</h3>

          {/* Quick Sleep Quality */}
          <div style={{marginBottom:16}}>
            <p style={{fontSize:'.72rem',color:'var(--ink2)',fontWeight:600,letterSpacing:'.06em',textTransform:'uppercase',marginBottom:8}}>How did you sleep?</p>
            <div style={{display:'grid',gridTemplateColumns:'repeat(5, 1fr)',gap:6}}>
              {[
                {icon:'😴', label:'Great', val:5},
                {icon:'🙂', label:'Good', val:4},
                {icon:'😐', label:'OK', val:3},
                {icon:'😕', label:'Poor', val:2},
                {icon:'😩', label:'Awful', val:1},
              ].map(({icon, label, val}) => (
                <button key={label} onClick={() => {
                  logWellness('sleep', val)
                }} style={{
                  display:'flex', flexDirection:'column', alignItems:'center', gap:3,
                  padding:'10px 4px', borderRadius:10, background:'var(--stone)',
                  border:'1.5px solid var(--border2)', cursor:'pointer',
                }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--teal)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border2)'}
                >
                  <div style={{fontSize:'1.5rem'}}>{icon}</div>
                  <div style={{fontSize:'.65rem',color:'var(--ink2)',fontWeight:600}}>{label}</div>
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <label style={{ flex: 1, display: 'grid', gap: 4, fontSize: '.82rem', fontWeight: 600, color: 'var(--text2)' }}>
                Bedtime <input type="time" value={form.sleepBed || ''} onChange={e => setForm(p => ({ ...p, sleepBed: e.target.value }))}
                  style={{ padding: '9px 10px', border: '1.5px solid var(--border2)', borderRadius: 'var(--radius-sm)' }} />
              </label>
              <label style={{ flex: 1, display: 'grid', gap: 4, fontSize: '.82rem', fontWeight: 600, color: 'var(--text2)' }}>
                Wake time <input type="time" value={form.sleepWake || ''} onChange={e => setForm(p => ({ ...p, sleepWake: e.target.value }))}
                  style={{ padding: '9px 10px', border: '1.5px solid var(--border2)', borderRadius: 'var(--radius-sm)' }} />
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label style={{ flex: 1, display: 'grid', gap: 4, fontSize: '.82rem', fontWeight: 600, color: 'var(--text2)' }}>
                Quality (1-10)
                <input type="range" min={1} max={10} value={form.sleepQ || 5} onChange={e => setForm(p => ({ ...p, sleepQ: Number(e.target.value) }))}
                  style={{ accentColor: 'var(--teal)' }} />
              </label>
              <span style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--teal)', minWidth: 24 }}>{form.sleepQ || 5}</span>
            </div>
            <input placeholder="Notes (dreams, woke up, restless...)" value={form.sleepNote || ''} onChange={e => setForm(p => ({ ...p, sleepNote: e.target.value }))}
              style={{ padding: '9px 12px', border: '1.5px solid var(--border2)', borderRadius: 'var(--radius-sm)', fontSize: '.85rem' }} />
            <button className="primary-btn" onClick={() => {
              const entry = { date: TODAY, bed: form.sleepBed, wake: form.sleepWake, quality: form.sleepQ || 5, notes: form.sleepNote }
              saveSleep([entry, ...sleep].slice(0, 30))
              setForm(p => ({ ...p, sleepBed: '', sleepWake: '', sleepQ: 5, sleepNote: '' }))
            }}>Log Sleep</button>
          </div>
          {sleep.slice(0, 7).map((entry, i) => (
            <div key={i} className="metric-row card-row">
              <div>
                <div style={{ fontWeight: 600, fontSize: '.88rem' }}>{entry.date}</div>
                <div style={{ fontSize: '.75rem', color: 'var(--muted)' }}>{entry.bed} → {entry.wake}{entry.notes ? ' · ' + entry.notes : ''}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: entry.quality >= 7 ? 'rgba(34,197,94,.15)' : entry.quality >= 5 ? 'rgba(240,180,41,.15)' : 'rgba(232,85,85,.15)', display: 'grid', placeItems: 'center' }}>
                  <span style={{ fontSize: '.82rem', fontWeight: 700, color: entry.quality >= 7 ? 'var(--success)' : entry.quality >= 5 ? 'var(--warning)' : 'var(--danger)' }}>{entry.quality}</span>
                </div>
              </div>
            </div>
          ))}
        </section>
      </ProTabGate>)}

      {tab === 'anxiety' && (
        <ProTabGate isPro={isPro} onUpgrade={onUpgrade}>
        <section className="card">
          <p className="eyebrow">Anxiety Tracker</p>
          <h3 style={{ margin: '4px 0 12px' }}>Daily Check-In</h3>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: '.85rem', fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>How's your anxiety right now? (1 = calm, 10 = severe)</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {ANXIETY_LEVELS.map(n => (
                <button key={n} onClick={() => setForm(p => ({ ...p, anxLevel: n }))}
                  style={{ width: 40, height: 40, borderRadius: '50%', border: '2px solid', cursor: 'pointer', fontWeight: 700, fontSize: '.88rem', fontFamily: 'inherit',
                    borderColor: form.anxLevel === n ? anxietyColor(n) : 'var(--border2)',
                    background: form.anxLevel === n ? anxietyColor(n) + '18' : 'var(--surface)',
                    color: form.anxLevel === n ? anxietyColor(n) : 'var(--text2)' }}>{n}</button>
              ))}
            </div>
          </div>
          <input placeholder="Triggers or notes..." value={form.anxNote || ''} onChange={e => setForm(p => ({ ...p, anxNote: e.target.value }))}
            style={{ width: '100%', padding: '9px 12px', border: '1.5px solid var(--border2)', borderRadius: 'var(--radius-sm)', fontSize: '.85rem', marginBottom: 10 }} />
          <button className="primary-btn" style={{ width: '100%' }} onClick={() => {
            if (!form.anxLevel) return
            saveAnxiety([{ date: TODAY, time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }), level: form.anxLevel, notes: form.anxNote }, ...anxiety].slice(0, 60))
            setForm(p => ({ ...p, anxLevel: null, anxNote: '' }))
          }}>Log Entry</button>
          <div style={{ marginTop: 14 }}>
            {anxiety.slice(0, 7).map((entry, i) => (
              <div key={i} className="metric-row card-row">
                <div>
                  <div style={{ fontSize: '.82rem', color: 'var(--muted)' }}>{entry.date} · {entry.time}</div>
                  {entry.notes && <div style={{ fontSize: '.8rem', color: 'var(--text2)' }}>{entry.notes}</div>}
                </div>
                <div style={{ width: 36, height: 36, borderRadius: '50%', display: 'grid', placeItems: 'center', background: anxietyColor(entry.level) + '18', flexShrink: 0 }}>
                  <span style={{ fontWeight: 700, color: anxietyColor(entry.level) }}>{entry.level}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </ProTabGate>)}

      {tab === 'migraines' && (
        <ProTabGate isPro={isPro} onUpgrade={onUpgrade}>
        <section className="card">
          <p className="eyebrow">Migraine & Headache Tracker</p>
          <h3 style={{ margin: '4px 0 12px' }}>Log an Episode</h3>
          <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <label style={{ flex: 1, display: 'grid', gap: 4, fontSize: '.82rem', fontWeight: 600, color: 'var(--text2)' }}>
                Type
                <select value={form.migType || 'Headache'} onChange={e => setForm(p => ({ ...p, migType: e.target.value }))}
                  style={{ padding: '9px 10px', border: '1.5px solid var(--border2)', borderRadius: 'var(--radius-sm)', fontSize: '.85rem' }}>
                  <option>Headache</option><option>Migraine</option><option>Cluster</option><option>Tension</option>
                </select>
              </label>
              <label style={{ flex: 1, display: 'grid', gap: 4, fontSize: '.82rem', fontWeight: 600, color: 'var(--text2)' }}>
                Pain (1-10)
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="range" min={1} max={10} value={form.migPain || 5} onChange={e => setForm(p => ({ ...p, migPain: Number(e.target.value) }))}
                    style={{ flex: 1, accentColor: 'var(--danger)' }} />
                  <span style={{ fontWeight: 700, color: 'var(--danger)', minWidth: 16 }}>{form.migPain || 5}</span>
                </div>
              </label>
            </div>
            <input placeholder="Duration (e.g. 2 hours, all day)" value={form.migDur || ''} onChange={e => setForm(p => ({ ...p, migDur: e.target.value }))}
              style={{ padding: '9px 12px', border: '1.5px solid var(--border2)', borderRadius: 'var(--radius-sm)', fontSize: '.85rem' }} />
            <input placeholder="Triggers (stress, sleep, food, weather...)" value={form.migTrig || ''} onChange={e => setForm(p => ({ ...p, migTrig: e.target.value }))}
              style={{ padding: '9px 12px', border: '1.5px solid var(--border2)', borderRadius: 'var(--radius-sm)', fontSize: '.85rem' }} />
            <input placeholder="Medication taken" value={form.migMed || ''} onChange={e => setForm(p => ({ ...p, migMed: e.target.value }))}
              style={{ padding: '9px 12px', border: '1.5px solid var(--border2)', borderRadius: 'var(--radius-sm)', fontSize: '.85rem' }} />
            <button className="primary-btn" onClick={() => {
              saveMigraines([{ date: TODAY, type: form.migType || 'Headache', pain: form.migPain || 5, duration: form.migDur, triggers: form.migTrig, medication: form.migMed }, ...migraines].slice(0, 60))
              setForm(p => ({ ...p, migType: 'Headache', migPain: 5, migDur: '', migTrig: '', migMed: '' }))
            }}>Log Episode</button>
          </div>
          <div style={{ fontSize: '.82rem', color: 'var(--muted)', marginBottom: 8 }}>Last 30 days: {migraines.filter(m => m.date >= addDays(TODAY, -30)).length} episodes</div>
          {migraines.slice(0, 7).map((entry, i) => (
            <div key={i} className="metric-row card-row" style={{ alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '.88rem' }}>{entry.date} · {entry.type}</div>
                <div style={{ fontSize: '.75rem', color: 'var(--muted)' }}>
                  {entry.duration && `${entry.duration} · `}{entry.triggers && `Triggers: ${entry.triggers}`}
                  {entry.medication && ` · ${entry.medication}`}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(232,85,85,.12)', display: 'grid', placeItems: 'center' }}>
                  <span style={{ fontWeight: 700, color: 'var(--danger)', fontSize: '.82rem' }}>{entry.pain}</span>
                </div>
                <button onClick={() => saveMigraines(migraines.filter((_, j) => j !== i))}
                  style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>✕</button>
              </div>
            </div>
          ))}
        </section>
      </ProTabGate>)}

      {tab === 'coping' && (
        <ProTabGate isPro={isPro} onUpgrade={onUpgrade}>
        <section className="card">
          <p className="eyebrow">Coping Skills</p>
          <h3 style={{margin:'4px 0 12px'}}>Your Toolkit</h3>
          {Object.entries(COPING_SKILLS).map(([category, skills]) => (
            <div key={category} style={{marginBottom:18}}>
              <div style={{fontSize:'.7rem', fontWeight:700, letterSpacing:'.1em', textTransform:'uppercase', color:'var(--brass)', marginBottom:8}}>{category}</div>
              <div style={{display:'flex', flexWrap:'wrap', gap:6}}>
                {skills.map(skill => {
                  const used = todayCopingUsed.includes(skill)
                  return (
                    <button key={skill} onClick={() => {
                      const next = used
                        ? todayCopingUsed.filter(s => s !== skill)
                        : [...todayCopingUsed, skill]
                      saveCopingUsed({...copingUsed, [todayCopingKey]: next})
                    }} style={{
                      padding:'6px 12px', borderRadius:999, cursor:'pointer',
                      border: used ? '1.5px solid var(--teal)' : '1.5px solid var(--border2)',
                      background: used ? 'var(--teal)' : 'var(--stone)',
                      color: used ? 'white' : 'var(--ink2)',
                      fontSize:'.78rem', fontWeight:500,
                      transition:'all .15s',
                    }}>{used ? '✓ ' : ''}{skill}</button>
                  )
                })}
              </div>
            </div>
          ))}
          <div style={{marginTop:8, padding:'10px 12px', background:'var(--teal-dim)', borderRadius:'var(--radius-sm)', fontSize:'.78rem', color:'var(--text2)', lineHeight:1.6}}>
            💡 These are tools — use what works for you in the moment.
          </div>
          {todayCopingUsed.length > 0 && (
            <div style={{marginTop:10,padding:'10px 12px',background:'var(--stone)',borderRadius:'var(--radius-sm)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <span style={{fontSize:'.82rem',color:'var(--ink2)'}}>✓ Used {todayCopingUsed.length} skill{todayCopingUsed.length > 1 ? 's' : ''} today</span>
              <button onClick={() => {
                todayCopingUsed.forEach(skill => {
                  saveItem('task', {
                    title: `Coping: ${skill}`,
                    category: 'Wellness',
                    date: TODAY,
                    completed: true,
                    completedAt: new Date().toISOString(),
                  }, 'create')
                })
              }} style={{
                padding:'6px 14px', borderRadius:999, fontSize:'.78rem', fontWeight:600,
                background:'var(--teal)', color:'white', border:'none', cursor:'pointer',
              }}>Log as Tasks</button>
            </div>
          )}
        </section>
      </ProTabGate>)}

      {tab === 'metrics' && (
        <ProTabGate isPro={isPro} onUpgrade={onUpgrade}>
        <div>
          <section className="card">
          {/* Body Measurements */}
          <div style={{marginBottom:18}}>
            <p style={{fontSize:'.72rem',color:'var(--ink2)',fontWeight:600,letterSpacing:'.06em',textTransform:'uppercase',marginBottom:8}}>📏 Body Measurements</p>
            
            {/* Latest snapshot */}
            {measurements.length > 0 && (() => {
              const latest = measurements[measurements.length-1]
              const prev = measurements[measurements.length-2]
              return (
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:6,marginBottom:10}}>
                  {[
                    ['Weight', latest.weight, prev?.weight, 'lbs'],
                    ['Waist', latest.waist, prev?.waist, 'in'],
                    ['Hip', latest.hip, prev?.hip, 'in'],
                    ['Body Fat', latest.bodyFat, prev?.bodyFat, '%'],
                  ].map(([label, val, prevVal, unit]) => {
                    if (!val) return null
                    const delta = prevVal ? Number(val) - Number(prevVal) : 0
                    return (
                      <div key={label} style={{background:'var(--stone)',borderRadius:8,padding:'8px 4px',textAlign:'center'}}>
                        <div className="muted" style={{fontSize:'.62rem',fontWeight:600,marginBottom:2}}>{label}</div>
                        <strong style={{fontSize:'.92rem',color:'var(--ink)'}}>{val}<span style={{fontSize:'.65rem',color:'var(--muted)'}}>{unit}</span></strong>
                        {delta !== 0 && (
                          <div style={{fontSize:'.65rem',color: delta > 0 ? 'var(--danger)' : 'var(--success)',marginTop:2}}>
                            {delta > 0 ? '↑' : '↓'} {Math.abs(delta).toFixed(1)}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })()}

            {/* Form */}
            <div style={{background:'var(--stone)',borderRadius:10,padding:12,display:'grid',gap:8}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:6}}>
                <input type="number" placeholder="Weight" value={newMeasurement.weight}
                  onChange={e => setNewMeasurement(p => ({...p, weight: e.target.value}))}
                  style={{padding:'8px',border:'1.5px solid var(--border2)',borderRadius:6,fontSize:'.82rem'}} />
                <input type="number" placeholder="Waist" value={newMeasurement.waist}
                  onChange={e => setNewMeasurement(p => ({...p, waist: e.target.value}))}
                  style={{padding:'8px',border:'1.5px solid var(--border2)',borderRadius:6,fontSize:'.82rem'}} />
                <input type="number" placeholder="Hip" value={newMeasurement.hip}
                  onChange={e => setNewMeasurement(p => ({...p, hip: e.target.value}))}
                  style={{padding:'8px',border:'1.5px solid var(--border2)',borderRadius:6,fontSize:'.82rem'}} />
                <input type="number" placeholder="BF%" value={newMeasurement.bodyFat}
                  onChange={e => setNewMeasurement(p => ({...p, bodyFat: e.target.value}))}
                  style={{padding:'8px',border:'1.5px solid var(--border2)',borderRadius:6,fontSize:'.82rem'}} />
              </div>
              <button onClick={() => {
                if(!newMeasurement.weight && !newMeasurement.waist) return
                saveMeasurements([...measurements, {...newMeasurement, id: Date.now()}])
                setNewMeasurement({weight:'', waist:'', hip:'', bodyFat:'', date:TODAY})
              }} style={{padding:'9px',background:'var(--teal)',color:'white',border:'none',borderRadius:8,fontWeight:600,cursor:'pointer',fontSize:'.85rem'}}>
                + Log Measurement
              </button>
            </div>
          </div>

            <p className="eyebrow">Body Metrics</p>
            <h3 style={{margin:'4px 0 6px'}}>Log Today</h3>
            <div style={{display:'grid',gap:10,marginBottom:14}}>
              {[
                {key:'weight',label:'Weight (lbs)',placeholder:'185'},
                {key:'bp',label:'Blood Pressure',placeholder:'120/80'},
                {key:'heartRate',label:'Resting Heart Rate (bpm)',placeholder:'68'},
                {key:'waist',label:'Waist (inches)',placeholder:'32'},
              ].map(f => (
                <div key={f.key}>
                  <label style={{fontSize:'.8rem',fontWeight:600,color:'var(--text2)',marginBottom:4,display:'block'}}>{f.label}</label>
                  <input value={newMetric[f.key]} onChange={e=>setNewMetric(p=>({...p,[f.key]:e.target.value}))}
                    placeholder={f.placeholder}
                    style={{width:'100%',padding:'10px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.9rem',background:'var(--stone)',color:'var(--text)'}} />
                </div>
              ))}
              <div>
                <label style={{fontSize:'.8rem',fontWeight:600,color:'var(--text2)',marginBottom:4,display:'block'}}>Notes</label>
                <input value={newMetric.notes} onChange={e=>setNewMetric(p=>({...p,notes:e.target.value}))}
                  placeholder="How I feel, context..."
                  style={{width:'100%',padding:'10px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.9rem',background:'var(--stone)',color:'var(--text)'}} />
              </div>
              <button className="primary-btn" onClick={() => {
                const hasData = newMetric.weight || newMetric.bp || newMetric.heartRate || newMetric.waist
                if (!hasData) return
                const entry = { ...newMetric, date: TODAY, id: Date.now() }
                saveMetrics([entry, ...metricsLog])
                setNewMetric({ weight: '', bp: '', heartRate: '', waist: '', notes: '' })
              }}>Log Entry</button>
            </div>
          </section>
          {metricsLog.length > 0 && (
            <section className="card">
              <p className="eyebrow">History</p>
              <h3 style={{margin:'4px 0 12px'}}>Recent Entries</h3>
              {metricsLog.slice(0,10).map(entry => (
                <div key={entry.id} style={{padding:'10px 0',borderBottom:'1px solid var(--stone2)'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                    <div style={{fontSize:'.75rem',fontWeight:700,color:'var(--brass)'}}>{entry.date}</div>
                    <button onClick={()=>saveMetrics(metricsLog.filter(m=>m.id!==entry.id))} style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',fontSize:'.85rem'}}>✕</button>
                  </div>
                  <div style={{display:'flex',gap:12,flexWrap:'wrap',fontSize:'.82rem',color:'var(--ink2)'}}>
                    {entry.weight && <span>⚖ {entry.weight} lbs</span>}
                    {entry.bp && <span>💓 {entry.bp}</span>}
                    {entry.heartRate && <span>❤ {entry.heartRate} bpm</span>}
                    {entry.waist && <span>📏 {entry.waist}"</span>}
                  </div>
                  {entry.notes && <div style={{fontSize:'.78rem',color:'var(--muted)',marginTop:4,fontStyle:'italic'}}>{entry.notes}</div>}
                </div>
              ))}
            </section>
          )}
        </div>
      </ProTabGate>)}

      <TabNav tabs={WELLNESS_GROUPS.flatMap((g) => g.ids).map((id) => TABS.find((t) => t.id === id)).filter(Boolean)} activeTab={tab} onSelect={setTab} />
    </div>
  )
}





function NoteComposer({ onSave }) {
  const [title, setTitle] = React.useState('')
  const [body, setBody] = React.useState('')
  const [category, setCategory] = React.useState('General')
  const [open, setOpen] = React.useState(false)

  const save = () => {
    if (!title.trim()) return
    onSave({ id: Date.now(), title: title.trim(), content: body.trim(), category, date: new Date().toISOString().slice(0,10) })
    setTitle(''); setBody(''); setOpen(false)
  }

  if (!open) return (
    <button className="primary-btn" style={{width:'100%',marginBottom:12,fontSize:'.9rem'}}
      onClick={() => setOpen(true)}>+ New Note</button>
  )

  return (
    <div style={{background:'var(--stone)',borderRadius:12,padding:14,marginBottom:14,display:'grid',gap:8}}>
      <input placeholder="Title" value={title} onChange={e=>setTitle(e.target.value)} autoFocus
        style={{padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.9rem',fontWeight:600}} />
      <textarea placeholder="Write your note..." value={body} onChange={e=>setBody(e.target.value)}
        style={{width:'100%',minHeight:100,padding:'10px 12px',border:'1.5px solid var(--border2)',
        borderRadius:'var(--radius-sm)',fontSize:'.88rem',lineHeight:1.6,resize:'vertical',
        fontFamily:'var(--serif)',boxSizing:'border-box'}} />
      <select value={category} onChange={e=>setCategory(e.target.value)}
        style={{padding:'8px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.85rem'}}>
        {['General','Work','Personal','Faith','Health','Finance','Ideas'].map(c=><option key={c}>{c}</option>)}
      </select>
      <div style={{display:'flex',gap:8}}>
        <button className="primary-btn" style={{flex:1}} onClick={save}>Save Note</button>
        <button className="ghost-btn" style={{flex:1}} onClick={()=>setOpen(false)}>Cancel</button>
      </div>
    </div>
  )
}


function ProductivityPage({ tasks, notes: propNotes, onQuickCreate, onToggle, onEdit, onDelete, saveItem, settings, isPro = false, onUpgrade = () => {} }) {
  const { user } = useAuth()

  const syncPageData = React.useCallback(async (key, value) => {
    try { localStorage.setItem('planner.p.' + key, JSON.stringify(value)) } catch {}
    if (!user || !hasSupabaseEnv) return
    try {
      await supabase.from('page_data').upsert({
        user_id: user.id, page: 'productivity', data_key: key, data_value: value,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,page,data_key' })
    } catch (e) { console.error('Productivity sync error:', e) }
  }, [user?.id])

  React.useEffect(() => {
    if (!user || !hasSupabaseEnv) return
    supabase.from('page_data').select('data_key, data_value')
      .eq('user_id', user.id).eq('page', 'productivity')
      .then(({ data, error }) => {
        if (error || !data) return
        data.forEach(row => {
          if (row.data_key === 'checklists') setChecklists(row.data_value || [])
          if (row.data_key === 'brainDump') setBrainDump(row.data_value || [])
        })
      })
  }, [user?.id])

  const TABS = [
    { id: 'braindump', label: '🧠 Brain Dump' },
    { id: 'notes', label: '📝 Notes' },
    { id: 'checklists', label: '📋 Checklists' },
    { id: 'focus', label: '⏱ Focus Timer' },
    { id: 'tips', label: '💡 Tips' },
  ]
  const lsGet = (k, d) => { try { const v = localStorage.getItem('planner.p.' + k); return v ? JSON.parse(v) : d } catch { return d } }
  const lsSet = (k, v) => { try { localStorage.setItem('planner.p.' + k, JSON.stringify(v)) } catch {} }

  const [tab, setTab] = useUrlTab('braindump')
  const [noteQuery, setNoteQuery] = useState('')
  const notes = propNotes || []
  // notes now come from Supabase via props - use saveItem
  const [checklists, setChecklists] = useState(() => lsGet('checklists', [{ id: 1, title: 'Work Checklist', items: [] }]))
  const [brainDump, setBrainDump] = useState(() => { try { const v = localStorage.getItem('planner.p.brainDump'); return v != null ? JSON.parse(v) : (localStorage.getItem('planner.p.braindump') || '') } catch { return '' } })
  const saveBrainDump = (v) => { setBrainDump(v); syncPageData('brainDump', v) }
  const WORK_MINS = 25
  const BREAK_MINS = 5
  const [focusCustomMins, setFocusCustomMins] = useState(25)
  const [focusTimeLeft, setFocusTimeLeft] = useState(25 * 60)
  const [focusRunning, setFocusRunning] = useState(false)
  const [focusMode, setFocusMode] = useState('work')
  const [focusSessions, setFocusSessions] = useState(0)
  const focusRef = React.useRef(null)
  React.useEffect(() => {
    if (focusRunning) {
      focusRef.current = setInterval(() => {
        setFocusTimeLeft(prev => {
          if (prev > 1) return prev - 1
          clearInterval(focusRef.current)
          setFocusRunning(false)
          if (focusMode === 'work') {
            setFocusSessions(s => s + 1)
            setFocusMode('break')
            return BREAK_MINS * 60
          } else {
            setFocusMode('work')
            return focusCustomMins * 60
          }
        })
      }, 1000)
    } else {
      clearInterval(focusRef.current)
    }
    return () => clearInterval(focusRef.current)
  }, [focusRunning, focusMode, focusCustomMins])
  const focusMinutes = Math.floor(focusTimeLeft / 60)
  const focusSeconds = focusTimeLeft % 60
  const focusTotal = focusMode === 'work' ? focusCustomMins * 60 : BREAK_MINS * 60
  const focusDisplay = `${String(focusMinutes).padStart(2,'0')}:${String(focusSeconds).padStart(2,'0')}`
  const focusProgress = Math.round(((focusTotal - focusTimeLeft) / focusTotal) * 100)
  const focusReset = () => { clearInterval(focusRef.current); setFocusRunning(false); setFocusTimeLeft(focusCustomMins * 60); setFocusMode('work') }

  const [newChecklist, setNewChecklist] = useState('')
  const [newItem, setNewItem] = useState({})

  const saveChecklists = (c) => { setChecklists(c); syncPageData('checklists', c) }


  return (
    <div className="screen-stack">
      <PageHeader icon={Zap} title="Productivity" subtitle="Do the work that matters" />
      <QuickAccessGrid tabs={TABS} activeTab={tab} onSelect={setTab} proTabs={PRO_TABS.productivity} isPro={isPro} />


      {tab === 'braindump' && (
        <section className="card">
          <p className="eyebrow">Brain Dump</p>
          <h3 style={{ margin: '4px 0 8px' }}>Clear Your Head</h3>
          <p className="muted" style={{fontSize:'.8rem',marginBottom:10}}>Dump everything here — ideas, worries, random thoughts, to-do items, anything taking up mental space. Get it out.</p>
          <textarea value={brainDump} onChange={e => saveBrainDump(e.target.value)}
            placeholder="Start typing freely... no structure needed."
            style={{ width: '100%', minHeight: 300, padding: 14, border: '1.5px solid var(--border2)', borderRadius: 'var(--radius-sm)', fontSize: '.9rem', fontFamily: 'var(--serif)', lineHeight: 1.7, resize: 'vertical', background: 'var(--warm-white)', color: 'var(--ink)', boxSizing: 'border-box' }} />
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:8}}>
            <p style={{ fontSize: '.75rem', color: 'var(--muted)', margin:0 }}>Saved automatically as you type.</p>
            <button onClick={()=>saveBrainDump('')} style={{background:'none',border:'1px solid var(--border)',borderRadius:6,padding:'4px 10px',fontSize:'.75rem',color:'var(--muted)',cursor:'pointer'}}>Clear</button>
          </div>
        </section>
      )}

      {tab === 'focus' && (
        <ProTabGate isPro={isPro} onUpgrade={onUpgrade}>
        <section className="card">
          <p className="eyebrow">Focus Timer</p>
          <h3 style={{ margin: '4px 0 8px' }}>Pomodoro Technique</h3>
          <p className="muted" style={{fontSize:'.8rem',marginBottom:20}}>25 min focused work, 5 min break. Repeat. After 4 sessions take a longer break.</p>

          {/* Timer display */}
          <div style={{textAlign:'center',marginBottom:24}}>
            <div style={{
              width:180,height:180,borderRadius:'50%',margin:'0 auto 16px',
              background: focusMode==='work' ? 'var(--ink)' : 'var(--success)',
              display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
              boxShadow:`0 0 0 6px ${focusMode==='work' ? 'var(--ink)' : 'var(--success)'}22`,
              position:'relative', overflow:'hidden'
            }}>
              <div style={{fontSize:'.75rem',color:'rgba(255,255,255,.6)',letterSpacing:'.1em',textTransform:'uppercase',marginBottom:4}}>
                {focusMode==='work' ? 'Focus' : 'Break'}
              </div>
              <div style={{fontSize:'3rem',fontWeight:700,color:'white',fontFamily:'var(--sans)',lineHeight:1}}>{focusDisplay}</div>
              <div style={{fontSize:'.72rem',color:'rgba(255,255,255,.5)',marginTop:4}}>{focusSessions} sessions done</div>
              {/* Progress arc */}
              <div style={{position:'absolute',inset:0,borderRadius:'50%',
                background:`conic-gradient(${focusMode==='work'?'var(--brass)':'var(--success)'} ${focusProgress}%, transparent 0)`,
                opacity:.3,pointerEvents:'none'}}/>
            </div>

            {/* Controls */}
            <div style={{display:'flex',gap:12,justifyContent:'center',marginBottom:16}}>
              <button onClick={()=>setFocusRunning(r=>!r)} style={{
                padding:'12px 28px',borderRadius:999,fontSize:'1rem',fontWeight:700,cursor:'pointer',
                background: focusRunning ? 'var(--danger)' : 'var(--ink)',
                color:'white',border:'none'
              }}>{focusRunning ? '⏸ Pause' : '▶ Start'}</button>
              <button onClick={focusReset}
                style={{padding:'12px 20px',borderRadius:999,fontSize:'1rem',cursor:'pointer',background:'var(--stone)',border:'1.5px solid var(--border)',color:'var(--ink)',fontWeight:600}}>↺ Reset</button>
            </div>

            {/* Mode presets */}
            <div style={{display:'flex',gap:8,justifyContent:'center',flexWrap:'wrap'}}>
              {[['Pomodoro',25,'work'],['Short Break',5,'break'],['Long Break',15,'break'],['Deep Work',50,'work'],['Quick',15,'work']].map(([label,mins,mode])=>(
                <button key={label} onClick={()=>{setFocusRunning(false);setFocusMode(mode);setFocusCustomMins(mins);setFocusTimeLeft(mins*60);}}
                    style={{padding:'6px 12px',borderRadius:999,fontSize:'.78rem',cursor:'pointer',
                    border:'1.5px solid var(--border2)',background:'var(--stone)',color:'var(--ink)',fontWeight:500}}>
                    {label} · {mins}m</button>
              ))}
            </div>
          </div>

          {/* Tips */}
          <div style={{background:'var(--stone)',borderRadius:10,padding:'14px'}}>
            <p style={{fontWeight:700,fontSize:'.85rem',marginBottom:8}}>Why Pomodoro Works</p>
            {[
              'Time pressure creates urgency — you work faster knowing the clock is running.',
              'Forced breaks prevent mental fatigue and sustain output over hours.',
              'Tracking sessions builds a visible record of deep work completed.',
            ].map((tip,i)=>(
              <div key={i} style={{display:'flex',gap:8,marginBottom:6,fontSize:'.8rem',color:'var(--ink2)'}}>
                <span style={{color:'var(--brass)',fontWeight:700}}>{i+1}.</span>{tip}
              </div>
            ))}
          </div>
        </section>
      </ProTabGate>)}


      {tab === 'checklists' && (
        <ProTabGate isPro={isPro} onUpgrade={onUpgrade}>
        <>
          {checklists.map((cl, ci) => (
            <section key={cl.id} className="card">
              <div className="section-title-row">
                <h3 style={{ fontSize: '1rem' }}>{cl.title}</h3>
                <button onClick={() => saveChecklists(checklists.filter((_, i) => i !== ci))}
                  style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '.85rem' }}>Remove</button>
              </div>
              {cl.items.map((item, ii) => (
                <div key={ii} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--surface)' }}>
                  <div onClick={() => {
                    const updated = checklists.map((c, cIdx) => cIdx !== ci ? c : { ...c, items: c.items.map((it, iIdx) => iIdx !== ii ? it : { ...it, done: !it.done }) })
                    saveChecklists(updated)
                  }} style={{ width: 22, height: 22, borderRadius: 6, border: '2px solid', borderColor: item.done ? 'var(--teal)' : 'var(--border2)', background: item.done ? 'var(--teal)' : 'transparent', display: 'grid', placeItems: 'center', cursor: 'pointer', flexShrink: 0 }}>
                    {item.done && <span style={{ color: 'var(--navy)', fontWeight: 700, fontSize: '.8rem' }}>✓</span>}
                  </div>
                  <span style={{ flex: 1, fontSize: '.9rem', textDecoration: item.done ? 'line-through' : 'none', color: item.done ? 'var(--muted)' : 'var(--text)' }}>{item.label}</span>
                  <button onClick={() => saveChecklists(checklists.map((c, cIdx) => cIdx !== ci ? c : { ...c, items: c.items.filter((_, iIdx) => iIdx !== ii) }))}
                    style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>✕</button>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <input placeholder="Add item..." value={newItem[cl.id] || ''}
                  onChange={e => setNewItem(p => ({ ...p, [cl.id]: e.target.value }))}
                  style={{ flex: 1, padding: '8px 10px', border: '1.5px solid var(--border2)', borderRadius: 'var(--radius-sm)', fontSize: '.85rem' }} />
                <button className="primary-btn" style={{ padding: '8px 14px', fontSize: '.82rem' }}
                  onClick={() => { if (!newItem[cl.id]) return; saveChecklists(checklists.map((c, cIdx) => cIdx !== ci ? c : { ...c, items: [...c.items, { label: newItem[cl.id], done: false }] })); setNewItem(p => ({ ...p, [cl.id]: '' })) }}>Add</button>
              </div>
            </section>
          ))}
          <div style={{ display: 'flex', gap: 8 }}>
            <input placeholder="New checklist name..." value={newChecklist} onChange={e => setNewChecklist(e.target.value)}
              style={{ flex: 1, padding: '10px 12px', border: '1.5px solid var(--border2)', borderRadius: 'var(--radius-sm)', fontSize: '.88rem' }} />
            <button className="primary-btn" style={{ padding: '10px 16px', fontSize: '.85rem' }}
              onClick={() => { if (!newChecklist) return; saveChecklists([...checklists, { id: Date.now(), title: newChecklist, items: [] }]); setNewChecklist('') }}>Create</button>
          </div>
        </>
      </ProTabGate>)}



            {tab === 'notes' && (
        <section className="card">
          <p className="eyebrow">Notes</p>
          <h3 style={{margin:'4px 0 14px'}}>My Notes</h3>

          {/* Add note form */}
          <NoteComposer onSave={(note) => saveItem('note', note, 'create')} />

          {/* Search */}
          <input placeholder="Search notes..." value={noteQuery} onChange={e=>setNoteQuery(e.target.value)}
            style={{width:'100%',padding:'9px 12px',border:'1.5px solid var(--border2)',
            borderRadius:'var(--radius-sm)',fontSize:'.85rem',marginBottom:12,boxSizing:'border-box'}} />

          {/* Notes list */}
          {notes.filter(n => !noteQuery || n.title?.toLowerCase().includes(noteQuery.toLowerCase()) || (n.content||'').toLowerCase().includes(noteQuery.toLowerCase())).length === 0
            ? <EmptyState icon="📝" title="Thoughts deserve a home" message="Capture what comes to mind. Reflect later. Watch patterns emerge." />
            : notes.filter(n => !noteQuery || n.title?.toLowerCase().includes(noteQuery.toLowerCase()) || (n.content||'').toLowerCase().includes(noteQuery.toLowerCase()))
              .map(note => (
                <div key={note.id} style={{padding:'12px 0',borderBottom:'1px solid var(--border)'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:600,fontSize:'.9rem',marginBottom:4}}>{note.title}</div>
                      {note.content && <div style={{fontSize:'.85rem',color:'var(--ink2)',lineHeight:1.6,whiteSpace:'pre-wrap'}}>{note.content}</div>}
                      <div className="muted" style={{fontSize:'.72rem',marginTop:4}}>{note.category||'General'} · {note.date}</div>
                    </div>
                    <div style={{display:'flex',gap:6,flexShrink:0}}>
                      <button onClick={() => onEdit('note', note)}
                        title="Edit note"
                        style={{background:'none',border:'none',color:'var(--teal)',cursor:'pointer',fontSize:'.85rem',padding:'4px 8px'}}>Edit</button>
                      <button onClick={() => {
                        if (window.confirm(`Delete note "${note.title}"?`)) onDelete('note', note.id)
                      }}
                        title="Delete note"
                        style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',fontSize:'1rem',padding:'4px 8px'}}>✕</button>
                    </div>
                  </div>
                </div>
              ))
          }
        </section>
      )}

      {tab === 'tips' && (
        <section className="card">
          <p className="eyebrow">Time Management</p>
          <h3 style={{margin:'4px 0 14px'}}>20 Tips for Better Focus</h3>
          {[
            ['Stop multi-tasking','Focus on one thing at a time — task-switching costs more time than it saves.'],
            ['Set deadlines','Even self-imposed deadlines create urgency that drives completion.'],
            ['Prioritise tasks','Do the most important task first, before anything else.'],
            ['Remove distractions','Phone away, tabs closed. Your environment shapes your focus.'],
            ['Keep your mind fresh','Protect sleep, eat well, move daily. Energy is the foundation.'],
            ['Work when most productive','Know your peak hours and protect them for deep work.'],
            ["Set reminders","Don't rely on memory — systems beat willpower."],
            ['Turn off email alerts','Check email on a schedule, not whenever it arrives.'],
            ['Batch your tasks','Group similar tasks together to reduce mental switching costs.'],
            ['Brain dump your thoughts','Clear your head into a list first, then prioritise.'],
            ['Decline additional commitments','Every yes is a no to something else. Guard your calendar.'],
            ['Tidy your workspace','A clear desk reduces cognitive load before you start.'],
            ['Get more organised','Systems and structures make decisions automatic.'],
            ['Get in a routine','Consistent rhythms reduce daily decision fatigue.'],
            ['Manage your stress','Chronic stress kills focus and decision quality.'],
            ['Delegate tasks','If someone else can do it 80% as well — let them.'],
            ['Break big projects into steps','A project is just a series of small next actions.'],
            ['Only take on what you can finish','Overcommitment leads to underdelivery.'],
            ['Get inspired','Feed your mind with content that energises action.'],
            ['Only focus on what matters','Ask: if I could only do one thing today, what would it be?'],
          ].map(([tip, desc], i) => (
            <div key={i} style={{display:'flex',gap:12,padding:'10px 0',borderBottom:'1px solid var(--stone2)',alignItems:'flex-start'}}>
              <div style={{
                width:24,height:24,borderRadius:6,flexShrink:0,
                background:'var(--brass-dim)',color:'var(--brass)',
                display:'grid',placeItems:'center',
                fontSize:'.72rem',fontWeight:700
              }}>{i+1}</div>
              <div>
                <div style={{fontWeight:700,fontSize:'.88rem',color:'var(--ink)',marginBottom:2}}>{tip}</div>
                <div style={{fontSize:'.78rem',color:'var(--muted)',lineHeight:1.5}}>{desc}</div>
              </div>
            </div>
          ))}
          <div style={{marginTop:10,padding:'12px 14px',background:'rgba(184,150,90,.08)',borderRadius:'var(--radius-sm)',fontSize:'.78rem',color:'var(--brass2)',lineHeight:1.6,fontStyle:'italic'}}>
            "The key is not to prioritize what's on your schedule, but to schedule your priorities." — Stephen Covey
          </div>
        </section>
      )}

      <TabNav tabs={TABS} activeTab={tab} onSelect={setTab} />
    </div>
  )
}

// ── LIFESTYLE PAGE ─────────────────────────────────────────────────────────
// Home cleaning tracker — lives in Lifestyle; data stays under page 'productivity'.
function CleaningTracker() {
  const [cleaningLog, saveCleaningLog2] = usePageKey('productivity', 'cleaningLog', {}, ['planner.p.cleaningLog', 'planner.p.cleaning_log_v2', 'cleaningLog'])
  const [cleaningFreq, setCleaningFreq] = useState('daily')
  const CLEANING_SCHEDULE = {
    daily: [
      'Make beds', 'Do laundry', 'Take out trash', 'Load/unload dishwasher',
      'Clean countertops', 'Pick up & tidy shared spaces', 'Wipe down sinks & toilets', 'Spot vacuuming'
    ],
    weekly: [
      'Sweep/Vacuum/Mop all floors', 'Wash bedding', 'Clean mirrors', 'Dust & polish furniture',
      'Sweep/Mop kitchen', 'Clean stovetop', 'Wipe down kitchen appliances', 'Clean microwave',
      'Wipe down kitchen cabinets', 'Wash dish towels', 'Clean bathroom sinks & faucets',
      'Scrub toilets', 'Clean shower doors', 'Vacuum rugs & upholstery',
      'Clean windows & blinds', 'Empty all trash cans', 'Straighten closets & drawers',
      'Vacuum & sweep stairs', 'Clean handrails', 'Wipe down washer & dryer exterior'
    ],
    monthly: [
      'Clean out fridge & freezer', 'Purge & tidy pantry', 'Wash bath mats & shower curtains',
      'Wipe down all cabinet fronts', 'Clean doors & walls', 'Dust ceiling fans & light fixtures',
      'Clean baseboards', 'Organize junk drawer', 'Deep clean shower head',
      'Restock toiletries', 'Purge & organize bathroom cabinets', 'Clean dryer lint trap thoroughly',
      'Flip sofa cushions & pillows', 'Wash blankets', 'Clean under couch',
      'Purge & organize toys or office supplies', 'Replenish cleaning supplies'
    ],
    quarterly: [
      'Clean/wash windows inside & out', 'Purge closets & clutter', 'Flip mattresses',
      'Deep clean oven', 'Deep clean fridge/freezer interior', 'Organize inside cabinets',
      'Replace sink sponges', 'Deep clean trash cans', 'Wash comforters & duvets',
      'Vacuum heating & cooling vents', 'Scrub tile grout', 'Air out rooms & drapes',
      'Sort and clean closets — donate items', 'Clean & check pantry for expired items',
      'Wipe switches, door handles & frames'
    ],
    yearly: [
      'Clean carpets professionally', 'Dust refrigerator vent', 'Give AC a tune-up',
      'Wash walls', 'Rinse window screens', 'Wash windowsills', 'Take off and scrub blinds',
      'Deep clean dishwasher & freezer', 'Polish wood cabinets', 'Clean fireplace',
      'Clean dryer vent hose', 'Clean washer gasket', 'Purge & organize laundry supplies',
      'Wash light fixtures', 'Clean dryer vent'
    ]
  }
  const FREQ_LABELS = { daily:'Daily', weekly:'Weekly', monthly:'Monthly', quarterly:'Quarterly', yearly:'Yearly' }
  const FREQ_KEY_PREFIX = { daily:'d', weekly:'w', monthly:'m', quarterly:'q', yearly:'y' }
  return (
        <div>
          <section className="card" style={{padding:'12px 14px'}}>
            <p className="eyebrow">Home Cleaning Tracker</p>
            <h3 style={{margin:'4px 0 10px'}}>Keeping a Clean Home</h3>
            <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
              {Object.keys(CLEANING_SCHEDULE).map(freq => {
                const tasks = CLEANING_SCHEDULE[freq]
                const prefix = FREQ_KEY_PREFIX[freq]
                const done = tasks.filter(t => cleaningLog[prefix+'_'+t])
                return (
                  <button key={freq} onClick={() => setCleaningFreq(freq)} style={{
                    padding:'6px 12px',borderRadius:999,border:'1.5px solid',fontSize:'.78rem',
                    cursor:'pointer',fontFamily:'var(--sans)',fontWeight:600,
                    borderColor: cleaningFreq===freq ? 'var(--brass)' : 'var(--border2)',
                    background: cleaningFreq===freq ? 'var(--brass-dim)' : 'transparent',
                    color: cleaningFreq===freq ? 'var(--brass)' : 'var(--muted)',
                    position:'relative'
                  }}>
                    {FREQ_LABELS[freq]}
                    {done.length > 0 && (
                      <span style={{marginLeft:4,fontSize:'.65rem',color:cleaningFreq===freq?'var(--brass)':'var(--success)',fontWeight:700}}>
                        {done.length + '/' + tasks.length}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </section>

          <section className="card">
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
              <div>
                <p className="eyebrow">{FREQ_LABELS[cleaningFreq]}</p>
                <h3 style={{margin:'2px 0 0'}}>
                  {CLEANING_SCHEDULE[cleaningFreq].filter(t => cleaningLog[FREQ_KEY_PREFIX[cleaningFreq]+'_'+t]).length} of {CLEANING_SCHEDULE[cleaningFreq].length} done
                </h3>
              </div>
              <button onClick={() => {
                const prefix = FREQ_KEY_PREFIX[cleaningFreq]
                const tasks = CLEANING_SCHEDULE[cleaningFreq]
                const allDone = tasks.every(t => cleaningLog[prefix+'_'+t])
                const updated = {...cleaningLog}
                tasks.forEach(t => { allDone ? delete updated[prefix+'_'+t] : (updated[prefix+'_'+t] = true) })
                saveCleaningLog2(updated)
              }} className="ghost-btn" style={{fontSize:'.75rem',padding:'5px 10px'}}>
                {CLEANING_SCHEDULE[cleaningFreq].every(t => cleaningLog[FREQ_KEY_PREFIX[cleaningFreq]+'_'+t]) ? 'Uncheck All' : 'Check All'}
              </button>
            </div>

            {CLEANING_SCHEDULE[cleaningFreq].map(task => {
              const key = FREQ_KEY_PREFIX[cleaningFreq] + '_' + task
              const done = !!cleaningLog[key]
              return (
                <div key={task} onClick={() => {
                  const updated = {...cleaningLog}
                  done ? delete updated[key] : (updated[key] = true)
                  saveCleaningLog2(updated)
                }} style={{
                  display:'flex',alignItems:'center',gap:10,padding:'10px 0',
                  borderBottom:'1px solid var(--stone2)',cursor:'pointer'
                }}>
                  <div style={{
                    width:22,height:22,borderRadius:6,border:'2px solid',flexShrink:0,
                    borderColor: done ? 'var(--success)' : 'var(--border2)',
                    background: done ? 'var(--success)' : 'var(--warm-white)',
                    display:'grid',placeItems:'center',transition:'all .15s'
                  }}>
                    {done && <span style={{color:'white',fontSize:'.72rem',fontWeight:800}}>✓</span>}
                  </div>
                  <span style={{
                    fontSize:'.88rem',flex:1,
                    color: done ? 'var(--muted)' : 'var(--ink)',
                    textDecoration: done ? 'line-through' : 'none',
                    transition:'all .15s'
                  }}>{task}</span>
                </div>
              )
            })}

            {CLEANING_SCHEDULE[cleaningFreq].filter(t => cleaningLog[FREQ_KEY_PREFIX[cleaningFreq]+'_'+t]).length === CLEANING_SCHEDULE[cleaningFreq].length && (
              <div style={{marginTop:12,padding:'10px 14px',background:'rgba(52,168,83,.08)',borderRadius:'var(--radius-sm)',textAlign:'center',fontSize:'.85rem',color:'var(--success)',fontWeight:600}}>
                ✓ All {FREQ_LABELS[cleaningFreq].toLowerCase()} tasks complete!
              </div>
            )}
          </section>
        </div>
  )
}

function LifestylePage({ isPro = false, onUpgrade = () => {} }) {
  const { user } = useAuth()
  const fmt = (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const syncPageData = React.useCallback(async (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
    if (!user || !hasSupabaseEnv) return
    try {
      await supabase.from('page_data').upsert({
        user_id: user.id, page: 'lifestyle', data_key: key, data_value: value,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,page,data_key' })
    } catch (e) { console.error('Lifestyle sync error:', e) }
  }, [user?.id])

  React.useEffect(() => {
    if (!user || !hasSupabaseEnv) return
    supabase.from('page_data')
      .select('data_key, data_value')
      .eq('user_id', user.id).eq('page', 'lifestyle')
      .then(({ data, error }) => {
        if (error || !data) return
        data.forEach(row => {
          if (row.data_key === 'trips') setTrips(row.data_value || [])
          if (row.data_key === 'birthdays') setBirthdays(row.data_value || [])
          if (row.data_key === 'groceries') setGroceries(row.data_value || [])
          if (row.data_key === 'recipes') setRecipes(row.data_value || [])
          if (row.data_key === 'gifts') setGifts(row.data_value || [])
        })
      })
  }, [user?.id])

  const lsGet = (k, d) => { try { const v = localStorage.getItem('planner.l.' + k); return v ? JSON.parse(v) : d } catch { return d } }
  const lsSet = (k, v) => { try { localStorage.setItem('planner.l.' + k, JSON.stringify(v)) } catch {} }

  const [tab, setTab] = useUrlTab('groceries')
  const [trips, setTrips] = useState(() => { try { const v = localStorage.getItem('planner.l.trips'); return v ? JSON.parse(v) : [] } catch { return [] } })
  const [newTrip, setNewTrip] = useState({ destination: '', startDate: '', endDate: '', notes: '', packing: '' })
  const [birthdays, setBirthdays] = useState(() => { try { const v = localStorage.getItem('planner.l.birthdays'); return v ? JSON.parse(v) : [] } catch { return [] } })
  const [newBirthday, setNewBirthday] = useState({ name: '', date: '', relationship: '', notes: '' })
  const saveTrips = (t) => { setTrips(t); syncPageData('trips', t) }
  const saveBirthdays = (b) => { setBirthdays(b); syncPageData('birthdays', b) }
  const [recipes, setRecipes] = useState(() => lsGet('recipes', []))
  const saveRecipes = (r) => { setRecipes(r); syncPageData('recipes', r) }
  const [newRecipe, setNewRecipe] = useState({title:'',url:'',category:'Dinner',favorite:false,notes:''})
  const [gifts, setGifts] = useState(() => lsGet('gifts', []))
  const saveGifts = (g) => { setGifts(g); syncPageData('gifts', g) }
  const [newGift, setNewGift] = useState({recipient:'',occasion:'Birthday',idea:'',amount:'',purchased:false,year:new Date().getFullYear()+''})
  const [keyDates, setKeyDates] = useState(() => lsGet('keyDates', []))
  const [groceries, setGroceries] = useState(() => lsGet('groceries', []))
  const [recipeFilter, setRecipeFilter] = useState('All')
  const [form, setForm] = useState({})
  const save = (key, setter, val) => { setter(val); lsSet(key, val); syncPageData(key, val) }

  const TABS = [
    { id: 'groceries', label: '🛒 Groceries' },
    { id: 'recipes', label: '🍳 Recipes' },
    { id: 'trips', label: '✈ Trips' },
    { id: 'birthdays', label: '🎂 Birthdays' },
    { id: 'gifts', label: '🎁 Gifts' },
    { id: 'cleaning', label: '🧹 Cleaning' },
  ]

  const SimpleList = ({ items, onDelete, renderItem }) => items.length === 0
    ? <p className="muted" style={{ fontSize: '.85rem' }}>Nothing added yet.</p>
    : items.map((item, i) => (
      <div key={i} className="metric-row card-row" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>{renderItem(item)}</div>
        <button onClick={() => onDelete(i)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', flexShrink: 0 }}>✕</button>
      </div>
    ))

  return (
    <div className="screen-stack">
      <PageHeader icon={Compass} title="Lifestyle" subtitle="Home, table, and the people you love" />
      <QuickAccessGrid tabs={TABS} activeTab={tab} onSelect={setTab} proTabs={PRO_TABS.lifestyle} isPro={isPro} />


      {tab === 'groceries' && (
        <div>
          {/* Custom list */}
          <section className="card">
            <p className="eyebrow">My List</p>
            <h3 style={{ margin: '4px 0 12px' }}>Shopping List</h3>
            {groceries.map((item, i) => (
              <div key={i} onClick={() => save('groceries', setGroceries, groceries.map((g, j) => j === i ? { ...g, done: !g.done } : g))}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                <div style={{ width: 22, height: 22, borderRadius: 6, border: '2px solid', borderColor: item.done ? 'var(--navy)' : 'var(--border2)', background: item.done ? 'var(--navy)' : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {item.done && <span style={{ color: 'white', fontWeight: 700, fontSize: '.8rem' }}>✓</span>}
                </div>
                <span style={{ flex: 1, textDecoration: item.done ? 'line-through' : 'none', color: item.done ? 'var(--muted)' : 'var(--ink)', fontSize: '.9rem' }}>{item.label}</span>
                {item.qty && <span style={{ fontSize: '.78rem', color: 'var(--teal)' }}>{item.qty}</span>}
                <button onClick={e => { e.stopPropagation(); save('groceries', setGroceries, groceries.filter((_, j) => j !== i)) }}
                  style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>✕</button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <input placeholder="Item" value={form.grocLabel || ''} onChange={e => setForm(p => ({ ...p, grocLabel: e.target.value }))}
                style={{ flex: 2, padding: '9px 10px', border: '1.5px solid var(--border2)', borderRadius: 'var(--radius-sm)', fontSize: '.85rem' }} />
              <input placeholder="Qty" value={form.grocQty || ''} onChange={e => setForm(p => ({ ...p, grocQty: e.target.value }))}
                style={{ flex: 1, padding: '9px 10px', border: '1.5px solid var(--border2)', borderRadius: 'var(--radius-sm)', fontSize: '.85rem' }} />
              <button className="primary-btn" style={{ padding: '9px 14px', fontSize: '.82rem' }}
                onClick={() => { if (!form.grocLabel) return; save('groceries', setGroceries, [...groceries, { label: form.grocLabel, qty: form.grocQty, done: false }]); setForm(p => ({ ...p, grocLabel: '', grocQty: '' })) }}>+</button>
            </div>
            {groceries.some(g => g.done) && (
              <button className="ghost-btn" style={{ marginTop: 10, fontSize: '.82rem' }}
                onClick={() => save('groceries', setGroceries, groceries.filter(g => !g.done))}>Clear Checked</button>
            )}
          </section>

          {/* Master grocery list */}
          <section className="card">
            <p className="eyebrow">Master Grocery List</p>
            <h3 style={{ margin: '4px 0 6px' }}>Tap to add to your list</h3>
            <p className="muted" style={{fontSize:'.8rem',marginBottom:14}}>Tap any item to add it to your shopping list above.</p>
            {[
              { cat:'🍎 Fruits', color:'#fde8e8', items:['Apples','Apricots','Avocados','Bananas','Berries','Cherries','Grapefruit','Grapes','Kiwi','Lemons','Limes','Melons','Nectarines','Oranges','Papaya','Peaches','Pears','Plums','Pomegranate','Watermelon'] },
              { cat:'🥦 Vegetables', color:'#d5f5e3', items:['Artichokes','Asparagus','Basil','Beets','Broccoli','Cabbage','Cauliflower','Carrots','Celery','Chiles','Chives','Cilantro','Corn','Cucumbers','Eggplant','Garlic Cloves','Green Onions','Lettuce','Onions','Peppers','Potatoes','Salad Greens','Spinach','Sprouts','Squash','Tomatoes','Zucchini'] },
              { cat:'🥩 Meat', color:'#fde8e8', items:['Bacon','Chicken','Deli Meat','Ground Beef','Ground Turkey','Ham','Hot Dogs','Pork','Sausage','Steak','Turkey'] },
              { cat:'🐟 Seafood', color:'#d5eaf5', items:['Catfish','Cod','Crab','Halibut','Lobster','Oysters','Salmon','Shrimp','Tilapia','Tuna'] },
              { cat:'❄ Frozen', color:'#e8d5f5', items:['Chicken Bites','Desserts','Fish Sticks','Frozen Fruit','Ice','Ice Cream','Ice Pops','Frozen Juice','Frozen Meat','Pie Shells','Pizza','Pot Pies','Frozen Potatoes','TV Dinners','Frozen Vegetables','Veggie Burger','Waffles'] },
              { cat:'🥛 Refrigerated', color:'#fff8e1', items:['Biscuits','Butter','Cheddar Cheese','Cream','Cream Cheese','Dip','Eggs','Egg Substitute','Feta Cheese','Half & Half','Jack Cheese','Milk','Mozzarella','Processed Cheese','Salsa','Shredded Cheese','Sour Cream','Swiss Cheese','Whipped Cheese','Yogurt'] },
              { cat:'🍞 Bakery', color:'#fde8e8', items:['Bagels','Bread','Donuts','Cake','Cookies','Croutons','Dinner Rolls','Hamburger Buns','Hot Dog Buns','Muffins','Pastries','Pie','Pita Bread','Tortillas (Corn)','Tortillas (Flour)'] },
              { cat:'🥫 Cans & Jars', color:'#e8f5e9', items:['Applesauce','Baked Beans','Black Beans','Broth','Bullion Cubes','Canned Fruit','Canned Vegetables','Carrots','Chili','Corn','Creamed Corn','Jam/Jelly','Mushrooms','Olives (Green)','Olives (Black)','Pasta','Pasta Sauce','Peanut Butter','Pickles','Pie Filling','Soup'] },
              { cat:'🍝 Pasta & Rice', color:'#fff3cd', items:['Brown Rice','Burger Helper','Couscous','Elbow Macaroni','Lasagna','Mac & Cheese','Noodle Mix','Rice Mix','Spaghetti','White Rice'] },
              { cat:'🧁 Baking', color:'#fce4ec', items:['Baking Powder','Baking Soda','Bread Crumbs','Cake Decor','Cake Mix','Canned Milk','Chocolate Chips','Cocoa','Cornmeal','Cornstarch','Flour','Food Coloring','Frosting','Muffin Mix','Pie Crust','Shortening','Brown Sugar','Powdered Sugar','Sugar','Yeast'] },
              { cat:'🍿 Snacks', color:'#e8f4f8', items:['Candy','Cookies','Crackers','Dried Fruit','Fruit Snacks','Gelatin','Graham Crackers','Granola Bars','Gum','Nuts','Popcorn','Potato Chips','Pretzels','Pudding','Raisins','Seeds','Tortilla Chips'] },
              { cat:'🥣 Breakfast', color:'#fff8e1', items:['Cereal','Grits','Instant Breakfast Drink','Oatmeal','Pancake Mix'] },
              { cat:'🧂 Seasoning', color:'#f3e5f5', items:['Basil','Bay Leaves','BBQ Seasoning','Cinnamon','Cloves','Cumin','Curry','Dill','Garlic Powder','Garlic Salt','Gravy Mix','Italian Seasoning','Marinade','Meat Tenderizer','Oregano','Paprika','Pepper','Poppy Seed','Red Pepper','Sage','Salt','Seasoned Salt','Soup Mix','Vanilla Extract'] },
              { cat:'🫙 Sauces & Condiments', color:'#e8f5e9', items:['BBQ Sauce','Catsup','Cocktail Sauce','Cooking Spray','Honey','Horseradish','Hot Sauce','Lemon Juice','Mayonnaise','Mustard','Olive Oil','Relish','Salad Dressing','Salsa','Soy Sauce','Steak Sauce','Sweet & Sour','Teriyaki','Vegetable Oil','Vinegar'] },
              { cat:'🥤 Drinks', color:'#e3f2fd', items:['Beer','Champagne','Club Soda','Coffee','Diet Soft Drinks','Energy Drinks','Juice','Liquor','Soft Drinks','Tea','Wine'] },
              { cat:'🧻 Paper Products', color:'#fff3e0', items:['Aluminum Foil','Coffee Filters','Cups','Garbage Bags','Napkins','Paper Plates','Paper Towels','Plastic Bags','Plastic Cutlery','Plastic Wrap','Straws','Waxed Paper'] },
              { cat:'🧹 Cleaning', color:'#e8f5e9', items:['Air Freshener','Bleach','Dish Soap','Dishwasher Detergent','Fabric Softener','Floor Cleaner','Glass Spray','Laundry Soap','Polish','Sponges','Vacuum Bags'] },
              { cat:'🧴 Personal Care', color:'#fce4ec', items:['Bath Soap','Bug Repellant','Conditioner','Cotton Swabs','Dental Floss','Deodorant','Facial Tissue','Family Planning','Feminine Products','Hair Spray','Hand Soap','Lip Care','Lotion','Makeup','Mouthwash','Razors/Blades','Shampoo','Shaving Cream','Sunscreen','Toilet Tissue','Toothbrush','Toothpaste'] },
              { cat:'👶 Baby', color:'#e8d5f5', items:['Baby Cereal','Baby Food','Diapers','Diaper Cream','Formula','Wipes'] },
              { cat:'🐾 Pets', color:'#fff8e1', items:['Cat Food','Cat Sand','Dog Food','Pet Shampoo','Treats','Flea Treatment'] },
              { cat:'⚡ Misc Items', color:'#f5f5f5', items:['Batteries','Charcoal','Greeting Cards','Light Bulbs'] },
            ].map(({ cat, color, items }) => (
              <div key={cat} style={{marginBottom:16}}>
                <div style={{display:'flex',alignItems:'center',gap:10,margin:'4px 0 10px'}}>
                  <span style={{fontSize:'.64rem',fontWeight:700,letterSpacing:'.14em',textTransform:'uppercase',color:'var(--brass2)'}}>{stripEmoji(cat)}</span>
                  <span style={{flex:1,height:1,background:'var(--border2)'}} />
                </div>
                <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                  {items.map(item => {
                    const alreadyAdded = groceries.some(g => g.label.toLowerCase() === item.toLowerCase())
                    return (
                      <button key={item} onClick={() => {
                        if (alreadyAdded) return
                        save('groceries', setGroceries, [...groceries, { label: item, qty: '', done: false }])
                      }} style={{
                        padding:'5px 10px', borderRadius:999, fontSize:'.78rem', cursor: alreadyAdded ? 'default' : 'pointer',
                        border: alreadyAdded ? '1.5px solid var(--success)' : '1.5px solid var(--border2)',
                        background: alreadyAdded ? 'var(--success)' : 'var(--stone)',
                        color: alreadyAdded ? 'white' : 'var(--ink2)',
                        fontWeight: 500
                      }}>
                        {alreadyAdded ? '✓ ' : '+ '}{item}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </section>
        </div>
      )}

      {tab === 'recipes' && (
        <ProTabGate isPro={isPro} onUpgrade={onUpgrade}>
        <section className="card">
          <p className="eyebrow">Recipes</p>
          <h3 style={{margin:'4px 0 8px'}}>Your Cookbook</h3>
          <p className="muted" style={{fontSize:'.8rem',marginBottom:14}}>
            Save favorites and recipes to try. Build your family's go-to collection.
          </p>

          {/* Category pills */}
          <div style={{display:'flex',gap:6,marginBottom:14,flexWrap:'wrap'}}>
            {['All','Favorites','Breakfast','Lunch','Dinner','Sides','Desserts','Drinks'].map(cat => {
              const active = (recipeFilter || 'All') === cat
              return (
                <button key={cat} onClick={() => setRecipeFilter(cat)} style={{
                  padding:'5px 12px', borderRadius:999, fontSize:'.78rem', fontWeight:600, cursor:'pointer',
                  background: active ? 'var(--teal)' : 'var(--stone)',
                  color: active ? 'white' : 'var(--ink2)',
                  border: '1.5px solid ' + (active ? 'var(--teal)' : 'var(--border2)'),
                }}>{cat}</button>
              )
            })}
          </div>

          {/* Add recipe form */}
          <div style={{background:'var(--stone)',borderRadius:12,padding:14,marginBottom:14,display:'grid',gap:8}}>
            <input placeholder="Recipe title" value={newRecipe.title}
              onChange={e => setNewRecipe(p => ({...p, title: e.target.value}))}
              style={{padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:8,fontSize:'.88rem'}} />
            <input placeholder="URL (optional)" value={newRecipe.url}
              onChange={e => setNewRecipe(p => ({...p, url: e.target.value}))}
              style={{padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:8,fontSize:'.88rem'}} />
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              <select value={newRecipe.category} onChange={e => setNewRecipe(p => ({...p, category: e.target.value}))}
                style={{padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:8,fontSize:'.88rem'}}>
                {['Breakfast','Lunch','Dinner','Sides','Desserts','Drinks'].map(c => <option key={c}>{c}</option>)}
              </select>
              <label style={{display:'flex',alignItems:'center',gap:6,fontSize:'.82rem',cursor:'pointer'}}>
                <input type="checkbox" checked={newRecipe.favorite}
                  onChange={e => setNewRecipe(p => ({...p, favorite: e.target.checked}))} />
                ⭐ Favorite
              </label>
            </div>
            <button onClick={() => {
              if(!newRecipe.title) return
              saveRecipes([...recipes, {...newRecipe, id: Date.now()}])
              setNewRecipe({title:'',url:'',category:'Dinner',favorite:false,notes:''})
            }} style={{padding:'10px',background:'var(--teal)',color:'white',border:'none',borderRadius:8,fontWeight:600,cursor:'pointer'}}>
              + Save Recipe
            </button>
          </div>

          {/* Recipe list */}
          {(() => {
            const filtered = recipes.filter(r => {
              if (!recipeFilter || recipeFilter === 'All') return true
              if (recipeFilter === 'Favorites') return r.favorite
              return r.category === recipeFilter
            })
            if (filtered.length === 0) return <EmptyState icon="🍳" title="No recipes yet" message="Save your first recipe. Build your cookbook over time." />
            return filtered.map(r => (
              <div key={r.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:'1px solid var(--border)',gap:8}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:2}}>
                    {r.favorite && <span style={{color:'var(--brass)'}}>⭐</span>}
                    <strong style={{fontSize:'.88rem'}}>{r.title}</strong>
                  </div>
                  <div className="muted" style={{fontSize:'.74rem'}}>
                    <span style={{color:'var(--teal)',fontWeight:600}}>{r.category}</span>
                    {r.url && <> · <a href={r.url} target="_blank" rel="noopener noreferrer" style={{color:'var(--teal)'}}>Open recipe →</a></>}
                  </div>
                </div>
                <button onClick={() => saveRecipes(recipes.map(x => x.id === r.id ? {...x, favorite: !x.favorite} : x))} style={{
                  background:'none',border:'none',cursor:'pointer',fontSize:'1.1rem',padding:'4px',
                }}>{r.favorite ? '⭐' : '☆'}</button>
                <button onClick={() => {
                  if(window.confirm(`Delete "${r.title}"?`)) saveRecipes(recipes.filter(x => x.id !== r.id))
                }} style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',padding:'4px 8px'}}>✕</button>
              </div>
            ))
          })()}
        </section>
        </ProTabGate>
      )}

      {tab === 'cleaning' && (
        <ProTabGate isPro={isPro} onUpgrade={onUpgrade}>
          <CleaningTracker />
        </ProTabGate>
      )}

      {tab === 'gifts' && (
        <ProTabGate isPro={isPro} onUpgrade={onUpgrade}>
        <section className="card">
          <p className="eyebrow">Gift Tracker</p>
          <h3 style={{margin:'4px 0 8px'}}>Gifts & Ideas</h3>
          <p className="muted" style={{fontSize:'.8rem',marginBottom:14}}>
            Remember what you gave, plan what's next. Never repeat a gift.
          </p>

          {/* Summary */}
          {(() => {
            const thisYear = new Date().getFullYear()
            const yearGifts = gifts.filter(g => g.year == thisYear)
            const purchased = yearGifts.filter(g => g.purchased).length
            const totalSpent = yearGifts.filter(g => g.purchased).reduce((s,g) => s + Number(g.amount||0), 0)
            return (
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:14}}>
                <div style={{background:'var(--stone)',borderRadius:10,padding:'10px 4px',textAlign:'center'}}>
                  <div className="muted" style={{fontSize:'.65rem',fontWeight:600,letterSpacing:'.05em',textTransform:'uppercase',marginBottom:2}}>Ideas</div>
                  <strong style={{color:'var(--teal)',fontSize:'1rem'}}>{yearGifts.length}</strong>
                </div>
                <div style={{background:'var(--stone)',borderRadius:10,padding:'10px 4px',textAlign:'center'}}>
                  <div className="muted" style={{fontSize:'.65rem',fontWeight:600,letterSpacing:'.05em',textTransform:'uppercase',marginBottom:2}}>Bought</div>
                  <strong style={{color:'var(--success)',fontSize:'1rem'}}>{purchased}</strong>
                </div>
                <div style={{background:'var(--stone)',borderRadius:10,padding:'10px 4px',textAlign:'center'}}>
                  <div className="muted" style={{fontSize:'.65rem',fontWeight:600,letterSpacing:'.05em',textTransform:'uppercase',marginBottom:2}}>Spent</div>
                  <strong style={{color:'var(--brass)',fontSize:'1rem'}}>{fmt(totalSpent)}</strong>
                </div>
              </div>
            )
          })()}

          {/* Add */}
          <div style={{background:'var(--stone)',borderRadius:12,padding:14,marginBottom:14,display:'grid',gap:8}}>
            <input placeholder="Recipient" value={newGift.recipient}
              onChange={e => setNewGift(p => ({...p, recipient: e.target.value}))}
              style={{padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:8,fontSize:'.88rem'}} />
            <input placeholder="Gift idea" value={newGift.idea}
              onChange={e => setNewGift(p => ({...p, idea: e.target.value}))}
              style={{padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:8,fontSize:'.88rem'}} />
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
              <select value={newGift.occasion} onChange={e => setNewGift(p => ({...p, occasion: e.target.value}))}
                style={{padding:'9px 8px',border:'1.5px solid var(--border2)',borderRadius:8,fontSize:'.82rem'}}>
                {['Birthday','Christmas','Easter','Anniversary','Wedding','Baby','Just Because','Other'].map(o => <option key={o}>{o}</option>)}
              </select>
              <input type="number" placeholder="Budget" value={newGift.amount}
                onChange={e => setNewGift(p => ({...p, amount: e.target.value}))}
                style={{padding:'9px 8px',border:'1.5px solid var(--border2)',borderRadius:8,fontSize:'.82rem'}} />
              <input type="number" placeholder="Year" value={newGift.year}
                onChange={e => setNewGift(p => ({...p, year: e.target.value}))}
                style={{padding:'9px 8px',border:'1.5px solid var(--border2)',borderRadius:8,fontSize:'.82rem'}} />
            </div>
            <button onClick={() => {
              if(!newGift.recipient || !newGift.idea) return
              saveGifts([...gifts, {...newGift, id: Date.now()}])
              setNewGift({recipient:'',occasion:'Birthday',idea:'',amount:'',purchased:false,year:new Date().getFullYear()+''})
            }} style={{padding:'10px',background:'var(--brass)',color:'white',border:'none',borderRadius:8,fontWeight:600,cursor:'pointer'}}>
              + Add Gift
            </button>
          </div>

          {/* List */}
          {gifts.length === 0 ? (
            <EmptyState icon="🎁" title="No gifts tracked yet" message="Add ideas as they come. Mark purchased when bought. Never repeat a gift." />
          ) : (
            <div>
              {gifts.slice().reverse().map(g => (
                <div key={g.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:'1px solid var(--border)',gap:8}}>
                  <button onClick={() => saveGifts(gifts.map(x => x.id === g.id ? {...x, purchased: !x.purchased} : x))} style={{
                    width:22,height:22,borderRadius:6,flexShrink:0,cursor:'pointer',padding:0,
                    background: g.purchased ? 'var(--success)' : 'transparent',
                    border: '2px solid ' + (g.purchased ? 'var(--success)' : 'var(--border2)'),
                    color:'white',fontSize:'.85rem',
                  }}>{g.purchased && '✓'}</button>
                  <div style={{flex:1,minWidth:0,textDecoration: g.purchased ? 'line-through' : 'none',opacity: g.purchased ? .6 : 1}}>
                    <div style={{fontWeight:600,fontSize:'.88rem'}}>{g.recipient} — {g.idea}</div>
                    <div className="muted" style={{fontSize:'.74rem'}}>
                      <span style={{color:'var(--brass)',fontWeight:600}}>{g.occasion}</span> · {g.year}
                      {g.amount && <> · {fmt(g.amount)}</>}
                    </div>
                  </div>
                  <button onClick={() => {
                    if(window.confirm(`Delete gift for ${g.recipient}?`)) saveGifts(gifts.filter(x => x.id !== g.id))
                  }} style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',padding:'4px 8px'}}>✕</button>
                </div>
              ))}
            </div>
          )}
        </section>
        </ProTabGate>
      )}

      {tab === 'trips' && (
        <ProTabGate isPro={isPro} onUpgrade={onUpgrade}>
        <div>
          <section className="card">
            <p className="eyebrow">Trip Planner</p>
            <h3 style={{margin:'4px 0 12px'}}>Upcoming & Past Trips</h3>
            {trips.length === 0 && <p className="muted" style={{fontSize:'.85rem',marginBottom:12}}><EmptyState icon="✈️" title="The world is waiting" message="Add a trip you're looking forward to." /></p>}
            {trips.map((trip, i) => (
              <div key={i} style={{padding:'12px 0',borderBottom:'1px solid var(--stone2)'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:4}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:'1rem',color:'var(--ink)'}}>{trip.destination}</div>
                    <div style={{fontSize:'.75rem',color:'var(--muted)'}}>{trip.startDate}{trip.endDate ? ' → '+trip.endDate : ''}</div>
                  </div>
                  <button onClick={()=>saveTrips(trips.filter((_,j)=>j!==i))} style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer'}}>✕</button>
                </div>
                {trip.notes && <div style={{fontSize:'.82rem',color:'var(--ink2)',marginBottom:6,lineHeight:1.5}}>{trip.notes}</div>}
                {trip.packing && (
                  <div style={{marginTop:6}}>
                    <div style={{fontSize:'.68rem',fontWeight:700,color:'var(--brass)',letterSpacing:'.08em',marginBottom:4}}>PACKING LIST</div>
                    <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
                      {trip.packing.split(',').map((item,j) => (
                        <span key={j} style={{fontSize:'.72rem',padding:'2px 8px',borderRadius:999,background:'var(--brass-dim)',color:'var(--brass2)',fontWeight:500}}>{item.trim()}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
            <div style={{display:'grid',gap:8,marginTop:12}}>
              <input placeholder="Destination" value={newTrip.destination} onChange={e=>setNewTrip(p=>({...p,destination:e.target.value}))}
                style={{padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.88rem',background:'var(--stone)',color:'var(--text)'}} />
              <div style={{display:'flex',gap:8}}>
                <input type="date" placeholder="Start" value={newTrip.startDate} onChange={e=>setNewTrip(p=>({...p,startDate:e.target.value}))}
                  style={{flex:1,padding:'9px 8px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.82rem',background:'var(--stone)',color:'var(--text)'}} />
                <input type="date" placeholder="End" value={newTrip.endDate} onChange={e=>setNewTrip(p=>({...p,endDate:e.target.value}))}
                  style={{flex:1,padding:'9px 8px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.82rem',background:'var(--stone)',color:'var(--text)'}} />
              </div>
              <input placeholder="Notes (hotel, plan, ideas...)" value={newTrip.notes} onChange={e=>setNewTrip(p=>({...p,notes:e.target.value}))}
                style={{padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.85rem',background:'var(--stone)',color:'var(--text)'}} />
              <input placeholder="Packing list (comma separated)" value={newTrip.packing} onChange={e=>setNewTrip(p=>({...p,packing:e.target.value}))}
                style={{padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.85rem',background:'var(--stone)',color:'var(--text)'}} />
              <button className="primary-btn" onClick={()=>{if(!newTrip.destination)return;saveTrips([...trips,{...newTrip,id:Date.now()}]);setNewTrip({destination:'',startDate:'',endDate:'',notes:'',packing:''})}}>Add Trip</button>
            </div>
          </section>
        </div>
      </ProTabGate>)}

      {tab === 'birthdays' && (
        <ProTabGate isPro={isPro} onUpgrade={onUpgrade}>
        <div>
          <section className="card">
            <p className="eyebrow">Birthday Reminders</p>
            <h3 style={{margin:'4px 0 12px'}}>Never miss one</h3>
            {birthdays.length === 0 && <p className="muted" style={{fontSize:'.85rem',marginBottom:12}}><EmptyState icon="🎂" title="No birthdays yet" message="Add the people you want to celebrate." /></p>}
            {[...birthdays].sort((a,b)=>{
              const today = new Date()
              const toNext = (dateStr) => {
                if (!dateStr) return 999
                const [,m,d] = dateStr.split('-').map(Number)
                const next = new Date(today.getFullYear(), m-1, d)
                if (next < today) next.setFullYear(today.getFullYear()+1)
                return (next - today) / (1000*60*60*24)
              }
              return toNext(a.date) - toNext(b.date)
            }).map((bd,i) => {
              const daysUntil = (() => {
                if (!bd.date) return null
                const [,m,d] = bd.date.split('-').map(Number)
                const next = new Date(new Date().getFullYear(), m-1, d)
                if (next < new Date()) next.setFullYear(new Date().getFullYear()+1)
                const diff = Math.round((next - new Date()) / (1000*60*60*24))
                return diff
              })()
              return (
                <div key={i} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 0',borderBottom:'1px solid var(--stone2)'}}>
                  <div style={{width:44,height:44,borderRadius:'50%',background:'var(--brass-dim)',display:'grid',placeItems:'center',flexShrink:0}}>
                    <span style={{fontSize:'1.2rem'}}>🎂</span>
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:700,fontSize:'.9rem',color:'var(--ink)'}}>{bd.name}</div>
                    <div style={{fontSize:'.75rem',color:'var(--muted)'}}>{bd.relationship} · {bd.date}</div>
                    {bd.notes && <div style={{fontSize:'.75rem',color:'var(--muted)',fontStyle:'italic'}}>{bd.notes}</div>}
                  </div>
                  <div style={{textAlign:'center',flexShrink:0}}>
                    {daysUntil !== null && (
                      <div style={{fontWeight:700,fontSize:'.85rem',color:daysUntil<=7?'var(--danger)':daysUntil<=30?'var(--warning)':'var(--teal)'}}>
                        {daysUntil === 0 ? '🎉 Today!' : `${daysUntil}d`}
                      </div>
                    )}
                    <button onClick={()=>saveBirthdays(birthdays.filter((_,j)=>j!==i))} style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',fontSize:'.8rem'}}>✕</button>
                  </div>
                </div>
              )
            })}
            <div style={{display:'grid',gap:8,marginTop:12}}>
              <input placeholder="Name" value={newBirthday.name} onChange={e=>setNewBirthday(p=>({...p,name:e.target.value}))}
                style={{padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.88rem',background:'var(--stone)',color:'var(--text)'}} />
              <div style={{display:'flex',gap:8}}>
                <input type="date" value={newBirthday.date} onChange={e=>setNewBirthday(p=>({...p,date:e.target.value}))}
                  style={{flex:1,padding:'9px 8px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.82rem',background:'var(--stone)',color:'var(--text)'}} />
                <input placeholder="Relationship" value={newBirthday.relationship} onChange={e=>setNewBirthday(p=>({...p,relationship:e.target.value}))}
                  style={{flex:1,padding:'9px 8px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.82rem',background:'var(--stone)',color:'var(--text)'}} />
              </div>
              <input placeholder="Notes (gift ideas, traditions...)" value={newBirthday.notes} onChange={e=>setNewBirthday(p=>({...p,notes:e.target.value}))}
                style={{padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.85rem',background:'var(--stone)',color:'var(--text)'}} />
              <button className="primary-btn" onClick={()=>{if(!newBirthday.name)return;saveBirthdays([...birthdays,{...newBirthday,id:Date.now()}]);setNewBirthday({name:'',date:'',relationship:'',notes:''})}}>Add Birthday</button>
            </div>
          </section>
        </div>
      </ProTabGate>)}
      <TabNav tabs={TABS} activeTab={tab} onSelect={setTab} />
    </div>
  )
}

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
    ['Pray or reflect daily','Wellness'],['Practice patience intentionally','Wellness'],
    ['Serve someone selflessly','Lifestyle'],['Write a daily affirmation','Wellness'],
    ['Express gratitude to someone','Lifestyle'],['Rest without guilt','Wellness'],
  ]

  const CAT_COLOR = {Health:'#E85555',Wellness:'#22C55E',Productivity:'var(--teal)',Lifestyle:'var(--brass)',Finances:'#6366F1',Faith:'#A855F7'}

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
          const weekComplete = weekLogs.filter(l => l.habitId === habit.id && l.completed).length
          const { current: streak, longest: longestStreak } = (() => {
            // Build a sorted list of completed dates
            const completedDates = logs.filter(l => l.completed).map(l => l.date).sort()
            if (completedDates.length === 0) return { current: 0, longest: 0 }
            
            // Calculate current streak (from today backwards)
            let current = 0
            let d = new Date()
            const todayStr = d.toISOString().slice(0,10)
            // Allow today OR yesterday as the start (gives forgiveness on first day)
            if (!completedDates.includes(todayStr)) {
              d.setDate(d.getDate() - 1)
              if (!completedDates.includes(d.toISOString().slice(0,10))) {
                return { current: 0, longest: calculateLongest(completedDates) }
              }
            }
            while (completedDates.includes(d.toISOString().slice(0,10))) {
              current++
              d.setDate(d.getDate() - 1)
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
                  <span style={{color:CAT_COLOR[habit.category]||'var(--brass)',fontWeight:600}}>{habit.category}</span>
                  <span>{weekComplete + '/7 this week'}</span>
                  {streak > 0 && <span style={{color:'var(--warning)',fontWeight:700}}>🔥 {streak}d streak</span>}
                  {longestStreak > streak && longestStreak > 2 && <span style={{color:'var(--muted)',fontSize:'.7rem'}}>· best {longestStreak}d</span>}
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
      <PageNav />
    </div>
  )
}

function GoalsPage({ goals, tasks, projects, onEdit, onDelete, onQuickCreate, onStepsChange, onUpdate }) {
  const { user } = useAuth()

  const syncPageData = React.useCallback(async (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
    if (!user || !hasSupabaseEnv) return
    try {
      await supabase.from('page_data').upsert({
        user_id: user.id, page: 'goals', data_key: key, data_value: value,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,page,data_key' })
    } catch (e) { console.error('Goals sync error:', e) }
  }, [user?.id])

  React.useEffect(() => {
    if (!user || !hasSupabaseEnv) return
    supabase.from('page_data').select('data_key, data_value')
      .eq('user_id', user.id).eq('page', 'goals')
      .then(({ data, error }) => {
        if (error || !data) return
        data.forEach(row => {
          if (row.data_key === 'visionItems') setVisionItems(row.data_value || [])
        })
      })
  }, [user?.id])

  const [activeFrame, setActiveFrame] = useState('all')
  const [visionItems, setVisionItems] = useState(() => { try { const v = localStorage.getItem('planner.g.vision'); return v ? JSON.parse(v) : [] } catch { return [] } })
  const [newVision, setNewVision] = useState('')
  const saveVision = (v) => { setVisionItems(v); syncPageData('visionItems', v) }

  const TIMEFRAMES = [
    {id:'all',label:'All'},
    {id:'1wk',label:'1 Week'},
    {id:'1mo',label:'1 Month'},
    {id:'6mo',label:'6 Months'},
    {id:'1yr',label:'1 Year'},
    {id:'3yr',label:'3 Years'},
    {id:'5yr',label:'5 Years'},
  ]

  const SMART_GUIDE = [
    {letter:'S',word:'Specific',desc:'Exactly what do you want to accomplish? Be precise — not "get fit" but "run a 5K in under 30 minutes."'},
    {letter:'M',word:'Measurable',desc:'How will you know you achieved it? Define the number, date, or result that proves success.'},
    {letter:'A',word:'Achievable',desc:'Is this goal realistic given your current resources, time, and capacity? Challenge yourself but stay honest.'},
    {letter:'R',word:'Relevant',desc:'Does this align with your values and your bigger vision? A goal worth achieving should matter deeply.'},
    {letter:'T',word:'Time-Bound',desc:'What is the deadline? Without a date it is a dream, not a goal. Set a specific target date.'},
  ]

  const filtered = activeFrame === 'all' ? goals : goals.filter(g => g.timeframe === activeFrame)

  return (
    <div className="screen-stack">
      <PageHeader icon={Target} title="Goals" subtitle="Aim with intention" />

      {/* SMART goals guide */}
      <section className="card" style={{background:'var(--ink)',border:'none'}}>
        <p className="eyebrow" style={{color:'var(--brass)'}}>How to Set Goals That Work</p>
        <h3 style={{color:'var(--warm-white)',margin:'4px 0 14px',fontSize:'1.1rem'}}>The SMART Framework</h3>
        <div style={{display:'grid',gap:10}}>
          {SMART_GUIDE.map(s => (
            <div key={s.letter} style={{display:'flex',gap:12,alignItems:'flex-start'}}>
              <div style={{
                width:32,height:32,borderRadius:8,flexShrink:0,
                background:'var(--brass)',color:'var(--ink)',
                display:'grid',placeItems:'center',
                fontFamily:'var(--serif)',fontSize:'1.1rem',fontWeight:600
              }}>{s.letter}</div>
              <div>
                <div style={{fontWeight:700,fontSize:'.85rem',color:'var(--warm-white)',marginBottom:2}}>{s.word}</div>
                <div style={{fontSize:'.78rem',color:'rgba(255,255,255,.55)',lineHeight:1.5}}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Timeframe filter */}
      <section className="card" style={{padding:'12px 14px'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
          <div><p className="eyebrow">Your Goals</p></div>
          <button className="primary-btn" style={{fontSize:'.8rem',padding:'6px 14px'}} onClick={() => onQuickCreate('goal')}>+ Goal</button>
        </div>
        <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
          {TIMEFRAMES.map(tf => (
            <button key={tf.id} onClick={() => setActiveFrame(tf.id)} style={{
              padding:'5px 10px',borderRadius:999,border:'1.5px solid',fontSize:'.75rem',
              cursor:'pointer',fontFamily:'var(--sans)',fontWeight:600,
              borderColor: activeFrame===tf.id ? 'var(--brass)' : 'var(--border2)',
              background: activeFrame===tf.id ? 'var(--brass-dim)' : 'transparent',
              color: activeFrame===tf.id ? 'var(--brass)' : 'var(--muted)'
            }}>{tf.label}</button>
          ))}
        </div>
      </section>

      {filtered.length === 0 && (
        <section className="card">
          <EmptyState icon={Target}
            title={goals.length ? 'No goals in this timeframe' : 'Aim at something'}
            message={goals.length ? 'Pick another timeframe above.' : 'Set one goal using the SMART framework above, then break it into steps.'}
            action={goals.length ? null : '+ Set your first goal'} onAction={() => onQuickCreate('goal')} />
        </section>
      )}

      {filtered.slice().sort((a, b) => Number(!!a.completed) - Number(!!b.completed)).map(goal => {
        const progress = getGoalProgress(goal, tasks, projects)
        const linkedProjects = projects.filter(p => p.goalId === goal.id)
        const linkedTasks = tasks.filter(t => t.linkedGoalId === goal.id)
        const completedLinked = linkedTasks.filter(t => t.completed).length
        const steps = normalizeSteps(goal.steps)
        const stepsDone = steps.filter(st => st.done).length
        const tf = TIMEFRAMES.find(t => t.id === goal.timeframe)
        const summary = [
          steps.length ? `${stepsDone}/${steps.length} steps` : null,
          linkedTasks.length ? `${completedLinked}/${linkedTasks.length} tasks` : null,
          linkedProjects.length ? `${linkedProjects.length} project${linkedProjects.length !== 1 ? 's' : ''}` : null,
        ].filter(Boolean).join(' · ') || 'No steps yet'
        return (
          <section key={goal.id} className="card" style={goal.completed ? {opacity:.78} : undefined}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4,flexWrap:'wrap'}}>
                  <div style={{fontWeight:700,fontSize:'1rem',color:'var(--ink)'}}>{goal.title}</div>
                  {tf && tf.id !== 'all' && (
                    <span style={{fontSize:'.65rem',padding:'2px 8px',borderRadius:999,background:'var(--brass-dim)',color:'var(--brass2)',fontWeight:700}}>{tf.label}</span>
                  )}
                  {goal.completed && (
                    <span style={{fontSize:'.65rem',padding:'2px 8px',borderRadius:999,background:'rgba(34,197,94,.12)',color:'var(--success)',fontWeight:700}}>Achieved</span>
                  )}
                </div>
                {goal.description && <div style={{fontSize:'.82rem',color:'var(--muted)',lineHeight:1.5,marginBottom:6}}>{goal.description}</div>}
                {goal.why && <div style={{fontFamily:'var(--serif)',fontStyle:'italic',fontSize:'.86rem',color:'var(--ink2)',lineHeight:1.5,marginBottom:6}}>“{goal.why}”</div>}
                <div style={{fontSize:'.75rem',color:'var(--muted)'}}>{[goal.category, goal.targetDate ? `Due ${shortDate(goal.targetDate)}` : null].filter(Boolean).join(' · ')}</div>
              </div>
              <div style={{display:'flex',gap:6,flexShrink:0,marginLeft:8}}>
                <button className="ghost-btn" style={{fontSize:'.72rem',padding:'4px 8px'}} onClick={() => onEdit('goal',goal)}>Edit</button>
                <button style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer'}} onClick={() => onDelete('goal',goal.id)} aria-label="Delete goal">✕</button>
              </div>
            </div>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:4,fontSize:'.78rem'}}>
              <span style={{color:'var(--muted)'}}>{summary}</span>
              <strong style={{color: progress>=100?'var(--success)':'var(--brass2)'}}>{progress}%</strong>
            </div>
            <div style={{height:6,background:'var(--stone2)',borderRadius:999,overflow:'hidden'}}>
              <div style={{height:'100%',width:`${progress}%`,background:progress>=100?'var(--success)':'linear-gradient(90deg, var(--brass2), var(--brass))',borderRadius:999,transition:'width .4s'}} />
            </div>

            {linkedProjects.length > 0 && (
              <div style={{display:'grid',gap:4,marginTop:10}}>
                {linkedProjects.map(p => (
                  <Link key={p.id} to="/projects" style={{display:'flex',alignItems:'center',gap:8,fontSize:'.78rem',color:'var(--ink2)',textDecoration:'none'}}>
                    <Folder size={13} color="var(--brass)" />
                    <span style={{flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.title}</span>
                    <span style={{color:'var(--muted)',fontVariantNumeric:'tabular-nums'}}>{getProjectProgress(p, tasks)}%</span>
                  </Link>
                ))}
              </div>
            )}

            <StepsChecklist
              steps={steps}
              onChange={(next) => onStepsChange && onStepsChange(goal.id, next)}
              onSchedule={(step) => onQuickCreate('task', { title: step.text, linkedGoalId: goal.id, category: goal.category || 'Productivity' })}
              completeSlot={!goal.completed && onUpdate && (
                <button type="button" className="steps-complete-btn" onClick={() => onUpdate('goal', { ...goal, completed: true }, 'edit')}>Mark goal achieved</button>
              )} />

            <div style={{display:'flex',gap:14,alignItems:'center',marginTop:12,flexWrap:'wrap'}}>
              <button onClick={() => onQuickCreate('task', { linkedGoalId: goal.id, category: goal.category || 'Productivity' })}
                style={{background:'none',border:'none',color:'var(--brass2)',cursor:'pointer',fontSize:'.8rem',fontWeight:600,fontFamily:'inherit',padding:0}}>+ Schedule a task</button>
              <button onClick={() => onQuickCreate('project', { goalId: goal.id })}
                style={{background:'none',border:'none',color:'var(--ink2)',cursor:'pointer',fontSize:'.8rem',fontWeight:600,fontFamily:'inherit',padding:0}}>+ Project for this goal</button>
              {goal.completed && onUpdate && (
                <button onClick={() => onUpdate('goal', { ...goal, completed: false }, 'edit')}
                  style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',fontSize:'.8rem',fontWeight:600,fontFamily:'inherit',padding:0}}>Reopen goal</button>
              )}
            </div>
          </section>
        )
      })}

      {/* ── Vision & Affirmations ───────────────────────────────────────── */}
      <section className="card" style={{background:'var(--ink)',border:'none',padding:'12px 14px'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
          <p className="eyebrow" style={{color:'var(--brass)',fontSize:'.6rem',margin:0}}>Vision & Affirmations</p>
          <span style={{fontSize:'.72rem',color:'rgba(255,255,255,.4)'}}>{visionItems.length} saved</span>
        </div>
        {visionItems.length === 0
          ? <p style={{color:'rgba(255,255,255,.4)',fontSize:'.8rem',margin:'0 0 8px',fontStyle:'italic'}}>Speak it before you see it. Add yours below.</p>
          : <div style={{maxHeight:140,overflowY:'auto',marginBottom:8}}>
              {visionItems.map((item,i) => (
                <div key={i} style={{display:'flex',alignItems:'flex-start',gap:8,padding:'6px 0',borderBottom:'1px solid rgba(255,255,255,.06)'}}>
                  <span style={{color:'var(--brass)',fontSize:'.85rem',flexShrink:0}}>✦</span>
                  <div style={{flex:1,fontFamily:'var(--serif)',fontSize:'.85rem',color:'rgba(255,255,255,.8)',lineHeight:1.5,fontStyle:'italic'}}>{item.text}</div>
                  <button onClick={()=>saveVision(visionItems.filter((_,j)=>j!==i))}
                    style={{background:'none',border:'none',color:'rgba(255,255,255,.25)',cursor:'pointer',flexShrink:0,fontSize:'.85rem'}}>✕</button>
                </div>
              ))}
            </div>
        }
        <div style={{display:'flex',gap:6}}>
          <input value={newVision} onChange={e=>setNewVision(e.target.value)}
            onKeyDown={e=>{if(e.key==='Enter'&&newVision.trim()){saveVision([...visionItems,{text:newVision.trim(),id:Date.now()}]);setNewVision('')}}}
            placeholder="I am... I have... I will..."
            style={{flex:1,padding:'8px 10px',border:'1px solid rgba(184,150,90,.3)',borderRadius:'var(--radius-sm)',
            fontSize:'.82rem',background:'rgba(255,255,255,.05)',color:'white',fontFamily:'var(--serif)'}} />
          <button onClick={()=>{if(!newVision.trim())return;saveVision([...visionItems,{text:newVision.trim(),id:Date.now()}]);setNewVision('')}}
            style={{padding:'8px 12px',borderRadius:'var(--radius-sm)',border:'none',background:'var(--brass)',
            color:'var(--ink)',fontWeight:700,cursor:'pointer',fontSize:'.82rem',flexShrink:0}}>Add</button>
        </div>
      </section>

      <PageNav />
    </div>
  )
}


// Reading list — lives in Growth; data stays under page 'wellness', key 'books'.
const BOOK_STATUS = { Reading: { color: 'var(--brass2)', bg: 'var(--brass-dim)' }, 'Want to Read': { color: 'var(--ink2)', bg: 'var(--stone2)' }, Completed: { color: 'var(--success)', bg: 'rgba(34,197,94,.12)' } }
function ReadingList() {
  const [books, saveBooks] = usePageKey('wellness', 'books', [], ['planner.hw.books', 'books'])
  const [b, setB] = useState({ title: '', author: '', status: 'Reading' })
  const order = { Reading: 0, 'Want to Read': 1, Completed: 2 }
  const sorted = (books || []).map((book, i) => ({ ...book, _i: i })).sort((x, y) => (order[x.status] ?? 3) - (order[y.status] ?? 3))
  const cycle = (i) => { const next = { Reading: 'Completed', Completed: 'Want to Read', 'Want to Read': 'Reading' }; saveBooks(books.map((x, j) => j === i ? { ...x, status: next[x.status] || 'Reading' } : x)) }
  return (
    <section className="card">
      <div className="section-title-row" style={{ marginBottom: 6 }}>
        <div><p className="eyebrow">Reading</p><h3>Your library</h3></div>
        <span className="status-pill" style={{ fontSize: '.72rem' }}>{(books || []).filter((x) => x.status === 'Completed').length} finished</span>
      </div>
      {sorted.length === 0 && <p className="muted" style={{ fontSize: '.85rem' }}>Add what you're reading or want to read.</p>}
      {sorted.map((book) => {
        const st = BOOK_STATUS[book.status] || BOOK_STATUS['Want to Read']
        return (
          <div key={book.id || book._i} className="metric-row card-row">
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: '.9rem', color: 'var(--ink)' }}>{book.title}</div>
              {book.author && <div className="muted" style={{ fontSize: '.75rem' }}>{book.author}</div>}
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
              <button onClick={() => cycle(book._i)} title="Tap to change status" style={{ fontSize: '.68rem', padding: '3px 9px', borderRadius: 999, border: 'none', cursor: 'pointer', background: st.bg, color: st.color, fontWeight: 700 }}>{book.status}</button>
              <button className="time-card-del" aria-label="Remove book" onClick={() => saveBooks(books.filter((_, j) => j !== book._i))}>✕</button>
            </div>
          </div>
        )
      })}
      <div className="wl-form">
        <input placeholder="Book title" value={b.title} onChange={(e) => setB((p) => ({ ...p, title: e.target.value }))} />
        <div className="wl-grid3" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <input placeholder="Author" value={b.author} onChange={(e) => setB((p) => ({ ...p, author: e.target.value }))} />
          <select value={b.status} onChange={(e) => setB((p) => ({ ...p, status: e.target.value }))}><option>Reading</option><option>Want to Read</option><option>Completed</option></select>
        </div>
        <button className="primary-btn" onClick={() => { if (!b.title.trim()) return; saveBooks([...(books || []), { ...b, title: b.title.trim(), id: Date.now() }]); setB({ title: '', author: '', status: 'Reading' }) }}>Add book</button>
      </div>
    </section>
  )
}

function GrowthPage({ scores, scoreHistory = [], habits, habitLogs, goals, tasks, projects, onToggleHabit, onEdit, onDelete, onQuickCreate, budget, setBudget, isPro = false, onUpgrade = () => {} }) {
  const { user } = useAuth()

  const syncPageData = React.useCallback(async (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
    if (!user || !hasSupabaseEnv) return
    try {
      await supabase.from('page_data').upsert({
        user_id: user.id, page: 'growth', data_key: key, data_value: value,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,page,data_key' })
    } catch (e) { console.error('Growth sync error:', e) }
  }, [user?.id])

  React.useEffect(() => {
    if (!user || !hasSupabaseEnv) return
    supabase.from('page_data').select('data_key, data_value')
      .eq('user_id', user.id).eq('page', 'growth')
      .then(({ data, error }) => {
        if (error || !data) return
        data.forEach(row => {
          if (row.data_key === 'reviewAnswers') setReviewAnswers(row.data_value || {})
          if (row.data_key === 'reviewHistory') setReviewHistory(row.data_value || [])
          if (row.data_key === 'intentionText') setIntentionText(row.data_value || '')
        })
      })
  }, [user?.id])

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
      <PageHeader icon={TrendingUp} title="Growth" subtitle="See who you're becoming" />

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
      <section className="card">
        <p className="eyebrow">Progress Over Time</p>
        <h3 style={{margin:'4px 0 14px'}}>Score Trend — Last 30 Days</h3>
        {scoreHistory.length === 0 ? (
          <EmptyState icon="📈" title="No history yet" message="Your daily score snapshots will appear here as you use the app." />
        ) : (
          <>
            <div style={{
              display:'flex', alignItems:'flex-end', gap:3,
              height:120, marginBottom:14, padding:'0 4px',
            }}>
              {scoreHistory.map((day, i) => {
                const max = 10
                const height = Math.max(2, (day.overall_score / max) * 100)
                return (
                  <div key={day.date} style={{flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:2}}>
                    <div style={{
                      width:'100%', height:`${height}%`, minHeight:2,
                      background: day.overall_score >= 7 ? 'var(--success)' : day.overall_score >= 5 ? 'var(--teal)' : 'var(--warning)',
                      borderRadius:'3px 3px 0 0', transition:'height .3s',
                    }} title={`${day.date}: ${day.overall_score}/10`} />
                  </div>
                )
              })}
            </div>
            <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginTop:10}}>
              {(() => {
                const avg = scoreHistory.length ? Math.round(scoreHistory.reduce((s,d)=>s+d.overall_score,0)/scoreHistory.length*10)/10 : 0
                const latest = scoreHistory[scoreHistory.length-1]?.overall_score || 0
                const best = scoreHistory.length ? Math.max(...scoreHistory.map(d=>d.overall_score)) : 0
                return [
                  ['Average', avg.toFixed(1), 'var(--teal)'],
                  ['Latest', latest, 'var(--brass)'],
                  ['Best', best, 'var(--success)'],
                ].map(([label, val, color]) => (
                  <div key={label} style={{textAlign:'center', background:'var(--stone)', borderRadius:8, padding:'10px 4px'}}>
                    <div className="muted" style={{fontSize:'.7rem', marginBottom:2}}>{label}</div>
                    <strong style={{color, fontSize:'1.1rem'}}>{val}</strong>
                  </div>
                ))
              })()}
            </div>
          </>
        )}
      </section>

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
            <textarea value={reviewAnswers[i]||''} onChange={e=>{const u={...reviewAnswers,[i]:e.target.value};setReviewAnswers(u);syncPageData('reviewAnswers',u)}}
              placeholder="Write freely..."
              style={{width:'100%',minHeight:70,padding:'10px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',
              fontSize:'.85rem',fontFamily:'var(--serif)',lineHeight:1.6,resize:'vertical',background:'var(--warm-white)',color:'var(--ink)',boxSizing:'border-box'}} />
          </div>
        ))}
        <button className="primary-btn" style={{width:'100%',fontSize:'.88rem'}}
          onClick={()=>{
            const entry = {date:TODAY,answers:{...reviewAnswers},id:Date.now()}
            const prev = reviewHistory
            const updated = [entry,...prev].slice(0,52)
            setReviewHistory(updated)
            syncPageData('reviewHistory',updated)
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

      {/* ── Reading (moved from Wellness) ─────────────────────────────────── */}
      {isPro ? <ReadingList /> : (
        <section className="card"><ProTabGate isPro={false} onUpgrade={onUpgrade}><ReadingList /></ProTabGate></section>
      )}

      <section className="card" style={{ padding: '12px 16px' }}>
        <Link to="/finance" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', textDecoration: 'none', color: 'var(--ink2)', fontSize: '.85rem', fontWeight: 600 }}>
          <span>Weekly spending target is in Finance → Budget Plan</span><span style={{ color: 'var(--brass2)' }}>→</span>
        </Link>
      </section>
      <PageNav />
    </div>
  )
}



function OnboardingChecklist({ settings, profile, tasks, goals, projects, updateSettings }) {
  const steps = [
    { label: 'Add your name', done: Boolean(profile.displayName) },
    { label: 'Create at least one goal', done: goals.length > 0 },
    { label: 'Create at least one project', done: projects.length > 0 },
    { label: 'Create at least three tasks', done: tasks.length >= 3 },
  ]
  const doneCount = steps.filter((step) => step.done).length

  return (
    <section className="card">
      <div className="section-title-row">
        <h3>Onboarding</h3>
        <button className="ghost-btn" onClick={() => updateSettings({ ...settings, onboardingComplete: true })}>Mark Complete</button>
      </div>
      <p className="muted">{doneCount + '/' + steps.length + ' setup steps finished'}</p>
      {steps.map((step) => <div key={step.label} className="metric-row"><span>{step.label}</span><strong>{step.done ? 'Done' : 'Open'}</strong></div>)}
    </section>
  )
}

const REMINDER_TYPES = [
  { key: 'tasks',      icon: SquareCheck, label: 'Tasks, events & appointments', desc: 'Before anything with a time, a 7:30 AM rundown, and appointments the evening before' },
  { key: 'faith',      icon: Cross,       label: 'Morning devotional',  desc: 'Daily at 6:00 AM' },
  { key: 'habits',     icon: Repeat,      label: 'Habit check-in',      desc: 'Daily at 8:00 AM, only if habits are left' },
  { key: 'birthdays',  icon: Cake,        label: 'Birthdays',           desc: 'Day-of at 8:00 AM' },
  { key: 'overdue',    icon: CircleSlash, label: 'Overdue tasks',       desc: 'Daily at 9:00 AM, only if something is past due' },
  { key: 'reflection', icon: PenLine,     label: 'Evening reflection',  desc: 'Daily at 7:00 PM' },
  { key: 'goals',      icon: Target,      label: 'Weekly goal review',  desc: 'Sundays at 5:00 PM with your next step' },
  { key: 'finance',    icon: Wallet,      label: 'Weekly spending',     desc: 'Sundays at 6:00 PM vs your weekly target' },
]
const REMINDER_DEFAULTS = { tasks: true, habits: true, goals: true, faith: true, reflection: true, birthdays: true, overdue: true, finance: false, leadMinutes: 15 }

function NotificationSettings({ settings, updateSettings }) {
  const [permission, setPermission] = useState(() => { try { return (typeof Notification !== 'undefined' ? Notification.permission : 'default') } catch { return 'default' } })
  const [supported, setSupported] = useState(true)
  const [connected, setConnected] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const n = { ...REMINDER_DEFAULTS, ...(settings?.notifications || {}) }
  const needsInstall = isIOS() && !isStandalone()

  useEffect(() => {
    PlannerPush.isSupported().then(setSupported)
    PlannerPush.deviceConnected().then(setConnected)
  }, [])

  const save = (patch) => updateSettings({ ...settings, notifications: { ...n, ...patch } })

  const enable = async () => {
    setBusy(true); setMsg('')
    const perm = await PlannerPush.requestPermission()
    setPermission(perm)
    if (perm === 'granted') {
      const sub = await PlannerPush.subscribe()
      setConnected(Boolean(sub))
      if (!settings?.notifications || !Object.keys(settings.notifications).length) save({})
      setMsg(sub ? 'This device will get reminders.' : 'Permission granted, but this device could not be registered. Try again.')
    }
    setBusy(false)
  }
  const test = async () => {
    setBusy(true); setMsg('')
    try {
      if (!connected) { const sub = await PlannerPush.subscribe(); setConnected(Boolean(sub)) }
      const r = await PlannerPush.sendTest()
      setMsg(r?.sent ? `Sent to ${r.sent} device${r.sent > 1 ? 's' : ''}. It should arrive in a few seconds.` : 'No devices are registered yet.')
    } catch (e) { setMsg('Could not send a test right now.') }
    setBusy(false)
  }
  const disable = async () => {
    setBusy(true)
    await PlannerPush.unsubscribe()
    setConnected(false); setMsg('This device will no longer get reminders.')
    setBusy(false)
  }

  return (
    <section className="card">
      <p className="eyebrow">Reminders</p>
      <h3 style={{ margin: '4px 0 6px' }}>Stay on track</h3>
      <p className="muted" style={{ fontSize: '.82rem', margin: '0 0 14px', lineHeight: 1.5 }}>Reminders arrive on your phone even when the planner is closed. Times follow your profile's timezone.</p>

      {needsInstall ? (
        <div className="rem-note">
          <strong>Add the planner to your Home Screen first</strong>
          <p>On iPhone and iPad, reminders only work from the Home Screen app. Tap Share, then "Add to Home Screen", then open the planner from that icon and come back here.</p>
        </div>
      ) : !supported ? (
        <div className="rem-note"><strong>Not supported here</strong><p>This browser can't receive reminders. Try Safari (Home Screen app) on iPhone/iPad or Chrome on Android/desktop.</p></div>
      ) : permission === 'denied' ? (
        <div className="rem-note warn"><strong>Notifications are blocked</strong><p>Allow notifications for this app in your device settings, then reopen the planner.</p></div>
      ) : permission !== 'granted' || connected === false ? (
        <button className="primary-btn" style={{ width: '100%' }} onClick={enable} disabled={busy}>{busy ? 'Turning on…' : 'Turn on reminders for this device'}</button>
      ) : (
        <div className="rem-status"><span className="rem-dot" /> This device gets reminders</div>
      )}

      {msg && <p className="muted" style={{ fontSize: '.8rem', margin: '10px 0 0' }}>{msg}</p>}

      <div className="rem-lead">
        <span>Remind me before timed items</span>
        <select value={n.leadMinutes} onChange={(e) => save({ leadMinutes: Number(e.target.value) })}>
          {[5, 10, 15, 30, 60, 120].map((m) => <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} hr`}</option>)}
        </select>
      </div>

      {REMINDER_TYPES.map((t) => {
        const Icon = t.icon
        const onOff = Boolean(n[t.key])
        return (
          <div key={t.key} className="rem-row">
            <span className="rem-icon"><Icon size={17} strokeWidth={1.7} /></span>
            <div className="rem-text"><strong>{t.label}</strong><small>{t.desc}</small></div>
            <button type="button" role="switch" aria-checked={onOff} aria-label={t.label} className={'rem-switch' + (onOff ? ' on' : '')} onClick={() => save({ [t.key]: !onOff })}><span /></button>
          </div>
        )
      })}

      {permission === 'granted' && connected && (
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button className="secondary-btn" style={{ flex: 1 }} onClick={test} disabled={busy}>Send a test</button>
          <button className="ghost-btn" style={{ flex: 1 }} onClick={disable} disabled={busy}>Turn off on this device</button>
        </div>
      )}
    </section>
  )
}


// ── Backup: everything the user has saved, as one JSON file ─────────────
const BACKUP_TABLES = ['profiles', 'planner_settings', 'budgets', 'tasks', 'events', 'goals', 'projects', 'notes', 'habits', 'habit_logs', 'expenses', 'score_history', 'page_data', 'faith_data']
async function buildBackup(user) {
  const out = { app: 'The Living Planner', version: 1, exportedAt: new Date().toISOString(), data: {} }
  if (user && hasSupabaseEnv) {
    for (const t of BACKUP_TABLES) {
      const { data, error } = await supabase.from(t).select('*').eq('user_id', user.id)
      out.data[t] = error ? { error: error.message } : data
    }
  } else {
    const local = {}
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k || !k.startsWith('planner') || k.includes('mock.user')) continue
      try { local[k] = JSON.parse(localStorage.getItem(k)) } catch { local[k] = localStorage.getItem(k) }
    }
    out.data.local = local
  }
  return out
}
async function downloadBackup(user) {
  const backup = await buildBackup(user)
  const name = `living-planner-backup-${TODAY}.json`
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const file = typeof File !== 'undefined' ? new File([blob], name, { type: 'application/json' }) : null
  // iPhone/iPad Home Screen apps can't download directly — hand the file to the share sheet (Save to Files)
  if (file && navigator.canShare?.({ files: [file] }) && /iPad|iPhone|iPod/.test(navigator.userAgent || '')) {
    try { await navigator.share({ files: [file], title: 'Living Planner backup' }); return 'shared' } catch (e) { if (e?.name === 'AbortError') return 'cancelled' }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
  return 'downloaded'
}
function BackupButton() {
  const { user } = useAuth()
  const [state, setState] = useState('')
  return (
    <div className="backup-row">
      <div>
        <strong>Download my data</strong>
        <small>{state === 'done' ? 'Backup saved.' : state === 'working' ? 'Preparing your backup…' : state === 'error' ? 'Could not create the backup. Try again.' : 'Everything you have saved, in one file. Keep it somewhere safe.'}</small>
      </div>
      <button className="secondary-btn" disabled={state === 'working'} onClick={async () => {
        setState('working')
        try { const r = await downloadBackup(user); setState(r === 'cancelled' ? '' : 'done') } catch { setState('error') }
      }}><Download size={16} /> Backup</button>
    </div>
  )
}

function MorePage({ profile, settings, updateProfile, updateSettings, onEdit, onDelete, onQuickCreate , triggerUpgrade}) {
  const { signOut, user } = useAuth()
  const [a2hsOpen, setA2hsOpen] = React.useState(false)
  const [showReviews, setShowReviews] = React.useState(false)

  return (
    <div className="screen-stack">
        <section className="card">
          <p className="eyebrow">Subscription</p>
          {(() => {
            const tier = (typeof window !== 'undefined' && localStorage.getItem('planner_tier')) || 'free'
            const isPro = tier === 'pro' || tier === 'trial'
            return (
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:8,gap:12}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:700,fontSize:'1rem',color:'var(--ink)'}}>The Living Planner {isPro ? 'Pro ✓' : ''}</div>
                  <div style={{fontSize:'.82rem',color:'var(--ink2)',marginTop:2}}>
                    {isPro ? 'All features unlocked · Thanks for supporting' : 'Free tier · Limited features'}
                  </div>
                </div>
                {isPro ? (
                  <a href="mailto:support@eloraradiance.com?subject=Manage%20My%20Subscription"
                     style={{
                       padding:'8px 18px', borderRadius:999, background:'var(--stone)',
                       color:'var(--ink)', textDecoration:'none', border:'1.5px solid var(--border2)',
                       fontWeight:600, fontSize:'.82rem', whiteSpace:'nowrap',
                     }}>Manage</a>
                ) : (
                  <button onClick={() => triggerUpgrade('Upgrade to Pro', 'Unlock unlimited everything plus exclusive features.')} style={{
                    padding:'8px 18px', borderRadius:999, background:'var(--teal)',
                    color:'white', border:'none', fontWeight:700, fontSize:'.85rem', cursor:'pointer',
                  }}>Upgrade</button>
                )}
              </div>
            )
          })()}
          <p className="muted" style={{fontSize:'.72rem',marginTop:12,marginBottom:0,lineHeight:1.5}}>
            To cancel or update payment, email{' '}
            <a href="mailto:support@eloraradiance.com" style={{color:'var(--teal)'}}>support@eloraradiance.com</a>.
            You keep Pro until the end of the period you've paid for.
          </p>
        </section>

      <div style={{display:"flex",alignItems:"center",gap:8,paddingBottom:2}}>
        <span style={{fontSize:"1.1rem"}}>⚙</span>
        <p style={{fontSize:".62rem",fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:"var(--brass)",margin:0}}>Settings</p>
      </div>

      {/* ── Profile ────────────────────────────────────────────────── */}
      <section className="card">
        <div className="section-title-row" style={{marginBottom:14}}>
          <div><p className="eyebrow">Account</p><h3>Profile</h3></div>
        </div>
        <div style={{display:'grid', gap:12}}>
          <label style={{display:'grid', gap:5, fontSize:'.85rem', fontWeight:600, color:'var(--text2)'}}>
            Display Name
            <input value={profile.displayName || ''} onChange={(e) => updateProfile({ ...profile, displayName: e.target.value })}
              style={{padding:'10px 12px', border:'1.5px solid var(--border2)', borderRadius:'var(--radius-sm)', fontSize:'.9rem', color:'var(--text)', background:'var(--surface)'}} />
          </label>
          <label style={{display:'grid', gap:5, fontSize:'.85rem', fontWeight:600, color:'var(--text2)'}}>
            Timezone
            <input value={profile.timezone || ''} onChange={(e) => updateProfile({ ...profile, timezone: e.target.value })}
              style={{padding:'10px 12px', border:'1.5px solid var(--border2)', borderRadius:'var(--radius-sm)', fontSize:'.9rem', color:'var(--text)', background:'var(--surface)'}} />
          </label>
          <label style={{display:'grid', gap:5, fontSize:'.85rem', fontWeight:600, color:'var(--text2)'}}>
            Planner Mode
            <select value={profile.plannerMode || 'Balanced'} onChange={(e) => updateProfile({ ...profile, plannerMode: e.target.value })}
              style={{padding:'10px 12px', border:'1.5px solid var(--border2)', borderRadius:'var(--radius-sm)', fontSize:'.9rem', color:'var(--text)', background:'var(--surface)'}}>
              {PLANNER_MODES.map((m) => <option key={m.id}>{m.id}</option>)}
            </select>
            <span style={{fontSize:'.76rem', fontWeight:400, color:'var(--muted)', lineHeight:1.45}}>{modeOf(profile).line}</span>
          </label>
        </div>
      </section>

      {/* ── Settings ───────────────────────────────────────────────── */}
      <section className="card">
        <div className="section-title-row" style={{marginBottom:12}}>
          <div><p className="eyebrow">Preferences</p><h3>Settings</h3></div>
        </div>
        {[
          ['Show completed tasks', 'showCompletedTasks'],
          ['Compact calendar', 'compactCalendar'],
        ].map(([label, key]) => (
          <div key={key} className="setting-row">
            <span style={{fontSize:'.9rem', color:'var(--text2)'}}>{label}</span>
            <input type="checkbox" checked={settings[key]} onChange={(e) => updateSettings({ ...settings, [key]: e.target.checked })} />
          </div>
        ))}
      </section>

      {/* ── Add to Home Screen ─────────────────── */}
      <section className="card">
        <p className="eyebrow">Quick Access</p>
        <button onClick={() => setA2hsOpen(true)} style={{
          width:'100%', display:'flex', alignItems:'center', gap:12, marginTop:8,
          padding:'12px 14px', borderRadius:'var(--radius-sm)', background:'var(--surface)',
          border:'1.5px solid var(--border2)', cursor:'pointer', textAlign:'left',
        }}>
          <div style={{width:40,height:40,borderRadius:'50%',background:'var(--teal)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.1rem',flexShrink:0}}>📱</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:600,fontSize:'.9rem',color:'var(--ink)'}}>Add to Home Screen</div>
            <div style={{fontSize:'.78rem',color:'var(--muted)',marginTop:2}}>Install the planner for full-screen, one-tap access</div>
          </div>
          <span style={{color:'var(--brass)',fontSize:'1rem',flexShrink:0}}>→</span>
        </button>
      </section>

      {/* ── Ratings & Reviews ─────── */}
      <section className="card">
        <p className="eyebrow">Community</p>
        <button onClick={() => setShowReviews(true)} style={{
          width:'100%', display:'flex', alignItems:'center', gap:12, marginTop:8,
          padding:'12px 14px', borderRadius:'var(--radius-sm)', background:'var(--surface)',
          border:'1.5px solid var(--border2)', cursor:'pointer', textAlign:'left',
        }}>
          <div style={{width:40,height:40,borderRadius:'50%',background:'var(--brass)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:'1.1rem'}}>⭐</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:600,fontSize:'.9rem',color:'var(--ink)'}}>Ratings &amp; Reviews</div>
            <div style={{fontSize:'.78rem',color:'var(--muted)',marginTop:2}}>Share your experience or see what others say</div>
          </div>
          <span style={{color:'var(--brass)',fontSize:'1rem',flexShrink:0}}>→</span>
        </button>
      </section>



      {/* ── Sync / Data ────────────────────────────────────────────── */}
      <section className="card">
        <p className="eyebrow">Data & Sync</p>
        <h3 style={{margin:'4px 0 14px'}}>Cross-Device Sync</h3>
        <div style={{display:'flex',alignItems:'center',gap:12,padding:'12px 14px',borderRadius:'var(--radius-sm)',background:'var(--surface)',marginBottom:12}}>
          <div style={{width:12,height:12,borderRadius:'50%',background:hasSupabaseEnv?'var(--success)':'var(--warning)',flexShrink:0,boxShadow:hasSupabaseEnv?'0 0 8px var(--success)':undefined}} />
          <div>
            <div style={{fontWeight:600,fontSize:'.9rem'}}>{hasSupabaseEnv ? '✓ Connected — syncing across all devices' : 'Local mode — this device only'}</div>
            <div style={{fontSize:'.75rem',color:'var(--muted)',marginTop:2}}>{hasSupabaseEnv ? 'Tasks, goals, habits, faith, finance, wellness, and more — all in the cloud.' : 'Contact support to enable cross-device sync.'}</div>
          </div>
        </div>
        <BackupButton />
        {hasSupabaseEnv && (
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
            {[
              ['✓ Tasks & Calendar','Core data'],['🎯 Goals & Projects','Core data'],
              ['🔁 Habits','Core data'],['💰 Finance','Full sync'],
              ['✝ Faith','Full sync'],['🌿 Wellness','Full sync'],
              ['⚡ Productivity','Full sync'],['🌍 Lifestyle','Full sync'],
              ['↑ Growth','Full sync'],
            ].map(([label, status]) => (
              <div key={label} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'7px 10px',background:'var(--stone)',borderRadius:8,fontSize:'.78rem'}}>
                <span style={{fontWeight:500,color:'var(--ink2)'}}>{label}</span>
                <span style={{color:'var(--success)',fontWeight:600,fontSize:'.7rem'}}>✓ {status}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Sign out ───────────────────────────────────────────────── */}
      <section className="card">
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <div>
            <p className="eyebrow">Account</p>
            <div style={{fontSize:'.85rem', color:'var(--muted)'}}>Signed in as {profile.displayName || 'User'}</div>
          </div>
          <button className="danger-btn" style={{fontSize:'.85rem', padding:'8px 16px'}} onClick={signOut}>Sign Out</button>
        </div>
      </section>

      {/* ── Push Notifications (coming soon) ──────────────────────────── */}

      {/* ── Notifications ─────────────────────────────────────────── */}
      <NotificationSettings settings={settings} updateSettings={updateSettings} />

      {/* ── More from Elora Radiance ─────────────────────────────── */}
      <section className="card">
        <p className="eyebrow">Explore</p>
        <h3 style={{margin:'4px 0 6px'}}>More from Elora Radiance Co.</h3>
        <p className="muted" style={{fontSize:'.8rem',lineHeight:1.6,marginBottom:14}}>Scripture-based tools for the whole Christian life.</p>
        {[
          { label:'Armed & Anchored', desc:'Spiritual warfare training', url:'https://armedandanchored.vercel.app/', icon:'⚔️' },
          { label:'Anchored Steps · Year 1', desc:'Daily devotional · Year 1', url:'https://anchored-steps.vercel.app/', icon:'⚓' },
          { label:'Anchored Steps · Year 2', desc:'Daily devotional · Year 2', url:'https://anchored-steps-year2.vercel.app/', icon:'⚓' },
          { label:'The Red Letters', desc:'The words of Jesus — free', url:'https://redletters.vercel.app/', icon:'✦' },
          { label:'Anchored Verse', desc:'Scripture for every emotion — free', url:'https://anchoredverse.vercel.app/', icon:'📖' },
        ].map(app => (
          <a key={app.url} href={app.url} target="_blank" rel="noopener noreferrer" style={{
            display:'flex', alignItems:'center', gap:12, padding:'12px 14px', marginBottom:8,
            borderRadius:'var(--radius-sm)', background:'var(--surface)', border:'1.5px solid var(--border2)',
            textDecoration:'none',
          }}>
            <span style={{fontSize:22,flexShrink:0}}>{app.icon}</span>
            <span style={{flex:1,minWidth:0}}>
              <span style={{display:'block',fontWeight:600,fontSize:'.9rem',color:'var(--ink)'}}>{app.label}</span>
              <span style={{display:'block',fontSize:'.78rem',color:'var(--muted)',marginTop:2}}>{app.desc}</span>
            </span>
            <span style={{color:'var(--brass)',fontSize:'.95rem',flexShrink:0}}>↗</span>
          </a>
        ))}
      </section>

      {/* ── Support & Contact ──────────────────────────────────────── */}
      <section className="card" style={{background:'var(--ink)',border:'none'}}>
        <p className="eyebrow" style={{color:'var(--brass)'}}>Support</p>
        <h3 style={{color:'var(--warm-white)',margin:'4px 0 14px'}}>We're here to help</h3>
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <a href="mailto:support@eloraradiance.com" style={{
            display:'flex',alignItems:'center',gap:12,padding:'14px',
            background:'rgba(255,255,255,.06)',borderRadius:10,
            border:'1px solid rgba(184,150,90,.2)',textDecoration:'none'
          }}>
            <div style={{width:40,height:40,borderRadius:'50%',background:'var(--brass)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.1rem',flexShrink:0}}>✉</div>
            <div>
              <div style={{color:'var(--warm-white)',fontWeight:600,fontSize:'.9rem'}}>Email Support</div>
              <div style={{color:'var(--brass)',fontSize:'.8rem',marginTop:2}}>support@eloraradiance.com</div>
              <div style={{color:'rgba(255,255,255,.4)',fontSize:'.72rem',marginTop:2}}>We respond within 24 hours</div>
            </div>
          </a>
          <div style={{padding:'12px 14px',background:'rgba(255,255,255,.04)',borderRadius:10,border:'1px solid rgba(255,255,255,.08)'}}>
            <div style={{color:'rgba(255,255,255,.5)',fontSize:'.78rem',lineHeight:1.6}}>
              For bugs, feature requests, billing questions, or anything else — reach out anytime. Built with care by a real person who wants this to work for you.
            </div>
          </div>
          <div style={{display:'flex',flexWrap:'wrap',justifyContent:'center',gap:'6px 16px',paddingTop:2}}>
            {[
              ['Help & Support', 'https://eloraradiance.com/support.html'],
              ['Privacy Policy', 'https://eloraradiance.com/privacy.html'],
              ['Terms of Service', 'https://eloraradiance.com/terms.html'],
            ].map(([label, href]) => (
              <a key={href} href={href} target="_blank" rel="noopener noreferrer"
                 style={{color:'rgba(255,255,255,.72)',fontSize:'.78rem',textDecoration:'underline',textUnderlineOffset:3}}>{label}</a>
            ))}
          </div>
        </div>
      </section>

      {a2hsOpen && <A2HSModal onClose={() => setA2hsOpen(false)} />}
      {showReviews && <Reviews app="tlp" appName="The Living Planner" eyebrow="The Living Planner" userEmail={user?.email} C={{ bg:'var(--stone)', bgCard:'var(--surface)', border:'var(--border2)', cream:'var(--ink)', text:'var(--text2)', muted:'var(--muted)', dim:'#C4BEB5', red:'var(--teal)', redL:'var(--teal2)', gold:'var(--brass)', goldF:'var(--brass-dim)', goldB:'var(--brass-glow)' }} lightMode={true} onClose={() => setShowReviews(false)} />}
      <PageNav />
    </div>
  )
}


const modalEmpty = { open: false, type: 'task', mode: 'create', item: null }

function ScrollToTop() {
  const location = useLocation()
  React.useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])
  return null
}

function PlannerApp() {
  const { tasks, goals, projects, expenses, notes, events, habits, habitLogs, budget, profile, settings, scores, scoreHistory, loading, syncing, error, saveItem, deleteItem, toggleTask, toggleHabit, saveSteps, updateBudget, updateProfile, updateSettings } = usePlannerData()
  const { user } = useAuth()
  // Subscription
  const subscription = useSubscription(user)
  const [showWelcomePro, setShowWelcomePro] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      return params.get('welcome') === 'pro'
    } catch { return false }
  })
  const [showA2HS, setShowA2HS] = useState(() => {
    try { return !isStandalone() && !localStorage.getItem('planner_a2hs_seen') } catch { return false }
  })
  const dismissA2HS = () => { try { localStorage.setItem('planner_a2hs_seen', '1') } catch {} ; setShowA2HS(false) }
  const [showUpgrade, setShowUpgrade] = useState(false)
  const [upgradeContext, setUpgradeContext] = useState({title: '', message: ''})
  const triggerUpgrade = (title, message) => {
    setUpgradeContext({title, message})
    setShowUpgrade(true)
  }

  const [modalState, setModalState] = useState(modalEmpty)
  const [toasts, setToasts] = useState([])

  const openCreate = (type = 'task', prefill = null) => setModalState({ open: true, type, mode: 'create', item: prefill })
  const openEdit = (type, item) => setModalState({ open: true, type, mode: 'edit', item })
  const closeModal = () => setModalState(modalEmpty)

  const pushToast = (title, message = '', type = 'info') => {
    const id = Date.now() + Math.random()
    setToasts((current) => [...current, { id, title, message, type }])
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
    }, 3200)
  }

  const dismissToast = (id) => setToasts((current) => current.filter((toast) => toast.id !== id))

  useEffect(() => {
    if (error) pushToast('Something needs attention', error, 'error')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error])


  // Reminders come from the server; just make sure this device is registered.
  useEffect(() => {
    if (!user || !hasSupabaseEnv) return
    try { if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return } catch { return }
    const t = setTimeout(() => { PlannerPush.subscribe() }, 1500)
    return () => clearTimeout(t)
  }, [user?.id])

  if (loading) return <div className="auth-shell"><div className="auth-card"><p className="eyebrow">Planner Data</p><h1>Loading your workspace…</h1></div></div>


  return (
    <>
      {showWelcomePro && <WelcomeProBanner onDismiss={() => setShowWelcomePro(false)} />}
      {showA2HS && !showWelcomePro && <A2HSModal onClose={dismissA2HS} />}
      {showUpgrade && <UpgradeCard title={upgradeContext.title} message={upgradeContext.message} onClose={() => setShowUpgrade(false)} />}
      <ScrollToTop />
      <Layout onQuickAdd={() => openCreate('task')} banner={<StatusBanner syncing={syncing} error={error} />} profile={profile}
        searchData={{ tasks, events, goals, projects, notes, habits }} onOpenItem={openEdit}
        onModeChange={async (id) => { await updateProfile({ ...profile, plannerMode: id }); pushToast(`${id} mode`, 'Home is arranged for this season.', 'success') }}>
        <Routes>
          <Route path="/" element={<HomePage tasks={tasks} goals={goals} projects={projects} expenses={expenses} scores={scores} budget={budget} events={events} habits={habits} habitLogs={habitLogs} settings={settings} profile={profile} onEdit={openEdit} onQuickCreate={openCreate} onToggle={async (id) => { await toggleTask(id) }} onToggleHabit={async (id) => { await toggleHabit(id) }} onSaveSteps={saveSteps} />} />
          <Route path="/tasks" element={<TasksPage tasks={tasks} settings={settings} onToggle={async (id) => { await toggleTask(id); pushToast('Task updated', 'Progress and score were refreshed.', 'success') }} onEdit={openEdit} onDelete={async (type, id) => { await deleteItem(type, id); pushToast('Task deleted', 'That item is gone.', 'success') }} onQuickCreate={openCreate} />} />
          <Route path="/calendar" element={<CalendarPage tasks={tasks} events={events} settings={settings} onSkipOccurrence={async (id, date) => { const ev = events.find((e) => e.id === id); if (!ev) return; await saveItem('event', { ...ev, skipDates: [...(ev.skipDates || []), date] }, 'edit'); pushToast('Removed that day', 'The rest of the series is unchanged.', 'success') }} onToggle={async (id) => { await toggleTask(id) }} onEdit={openEdit} onDelete={async (type, id) => { await deleteItem(type, id); pushToast('Calendar item deleted', '', 'success') }} onQuickCreate={openCreate} onReschedule={async (type, id, patch) => { const collection = type === 'event' ? events : tasks; const current = collection.find((item) => item.id === id); if (!current) return; await saveItem(type, { ...current, ...patch }, 'edit'); pushToast(type === 'task' ? 'Task rescheduled' : 'Event moved', 'The calendar updated instantly.', 'success') }} />} />
          <Route path="/projects" element={<ProjectsPage projects={projects} tasks={tasks} goals={goals} onStepsChange={(id, steps) => saveSteps('project', id, steps)} onUpdate={async (type, item, m) => { await saveItem(type, item, m); if (type === 'project' && item.status === 'Completed') pushToast('Project complete', 'Well done. Finish what you start.', 'success') }} onToggle={async (id) => { await toggleTask(id) }} onEdit={openEdit} onDelete={async (type, id) => { await deleteItem(type, id); pushToast('Project removed', '', 'success') }} onQuickCreate={openCreate} />} />
          <Route path="/habits" element={<HabitsPage habits={habits} habitLogs={habitLogs} onToggleHabit={async (id, date) => { await toggleHabit(id, date) }} onEdit={openEdit} onDelete={async (type, id) => { if (window.confirm(`Delete this ${type}?`)) await deleteItem(type, id) }} onQuickCreate={openCreate} />} />
            <Route path="/goals" element={<GoalsPage goals={goals} tasks={tasks} projects={projects} onStepsChange={(id, steps) => saveSteps('goal', id, steps)} onUpdate={async (type, item, m) => { await saveItem(type, item, m); if (type === 'goal' && item.completed) pushToast('Goal achieved', 'Give thanks — then aim again.', 'success') }} onEdit={openEdit} onDelete={async (type, id) => { if (window.confirm(`Delete this ${type}?`)) await deleteItem(type, id) }} onQuickCreate={openCreate} />} />
            <Route path="/growth" element={<GrowthPage isPro={subscription.isPro} onUpgrade={() => triggerUpgrade("Unlock Reading Tracker", "Keep your reading list and finished books in Growth.")} scores={scores} scoreHistory={scoreHistory} habits={habits} habitLogs={habitLogs} goals={goals} tasks={tasks} projects={projects} onToggleHabit={async (...args) => { await toggleHabit(...args); pushToast('Habit logged', 'Your scorecard picked that up.', 'success') }} onEdit={openEdit} onDelete={async (type, id) => { await deleteItem(type, id); pushToast('Habit deleted', '', 'success') }} onQuickCreate={openCreate} budget={budget} setBudget={async (nextBudget) => { await updateBudget(nextBudget); pushToast('Budget updated', 'Finance scoring refreshed.', 'success') }} />} />
          <Route path="/finance" element={<FinancePage expenses={expenses} budget={budget} setBudget={async (nextBudget) => { await updateBudget(nextBudget) }} saveItem={saveItem} deleteItem={deleteItem} goals={goals} isPro={subscription.isPro} onUpgrade={() => triggerUpgrade("Unlock Full Finance Suite", "Get monthly income tracking, bills, savings goals, debt payoff, giving, and no-spend challenges.")} />} />
          <Route path="/wellness" element={<HealthWellnessPage isPro={subscription.isPro} onAddEvent={async (ev) => { await saveItem('event', ev, 'create') }} onUpgrade={() => triggerUpgrade("Unlock Wellness Suite", "Training, nutrition, vitals, sleep, journal, routine, meds, and body metrics.")} />} />
          <Route path="/productivity" element={<ProductivityPage tasks={tasks} notes={notes} saveItem={saveItem} isPro={subscription.isPro} onUpgrade={() => triggerUpgrade("Unlock Productivity Pro", "Checklists and the focus timer.")} onQuickCreate={openCreate} onToggle={async (id) => { await toggleTask(id) }} onEdit={openEdit} onDelete={async (type, id) => { if (window.confirm(`Delete this ${type}?`)) await deleteItem(type, id) }} settings={settings} />} />
          <Route path="/lifestyle" element={<LifestylePage isPro={subscription.isPro} onUpgrade={() => triggerUpgrade("Unlock Full Lifestyle Suite", "Recipes, cleaning tracker, trips, birthdays, and gift ideas.")} />} />
          <Route path="/faith" element={<FaithPage goals={goals} tasks={tasks} projects={projects} onEdit={openEdit} onCreateGoal={async (g) => { await saveItem('goal', g, 'create') }} isPro={subscription.isPro} onUpgrade={() => triggerUpgrade("Unlock Full Faith Section", "Get access to fasting tracker, sermon notes, and faith goals.")} />} />
          <Route path="/health" element={<HealthWellnessPage isPro={subscription.isPro} onAddEvent={async (ev) => { await saveItem('event', ev, 'create') }} onUpgrade={() => triggerUpgrade("Unlock Wellness Suite", "Training, nutrition, vitals, sleep, journal, routine, meds, and body metrics.")} />} />
          <Route path="/more" element={<MorePage profile={profile} triggerUpgrade={triggerUpgrade} settings={settings} updateProfile={updateProfile} updateSettings={updateSettings} onEdit={openEdit} onDelete={async (type, id) => { if (window.confirm(`Delete this ${type}?`)) await deleteItem(type, id) }} onQuickCreate={openCreate} />} />
        </Routes>
        <QuickAddModal
          isOpen={modalState.open}
          type={modalState.type}
          mode={modalState.mode}
          item={modalState.item}
          onClose={closeModal}
          goals={goals}
          projects={projects}
          onSave={async (type, payload, modeArg) => {
            await saveItem(type, payload, modeArg)
            pushToast(`${labels[type] || type} ${modeArg === 'edit' ? 'updated' : 'added'}`, 'Synced across your devices.', 'success')
          }}
          onDelete={async (type, id) => {
            await deleteItem(type, id)
            pushToast(`${labels[type] || type} deleted`, '', 'success')
          }}
        />
      </Layout>
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </>
  )
}


class AppErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null } }
  static getDerivedStateFromError(error) { return { hasError: true, error } }
  componentDidCatch(error, info) { console.error('APP CRASH:', error.message, info?.componentStack) }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{minHeight:'100vh', background:'#0B1829', display:'flex', alignItems:'center', justifyContent:'center', padding:24}}>
          <div style={{background:'white', borderRadius:16, padding:24, maxWidth:440, width:'100%'}}>
            <div style={{fontWeight:'bold', fontSize:16, color:'#E85555', marginBottom:12}}>App Error</div>
            <div style={{fontFamily:'monospace', fontSize:12, background:'#fff0ee', borderRadius:6, padding:12, marginBottom:12, wordBreak:'break-all'}}>
              {this.state.error?.message || 'Unknown error'}
            </div>
            <button onClick={() => this.setState({hasError:false})} style={{background:'#00C2B3', color:'#0B1829', border:'none', borderRadius:8, padding:'10px 20px', fontWeight:'bold', cursor:'pointer'}}>
              Try Again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}


// ── FAITH PAGE ───────────────────────────────────────────────────────────────

// ── Verse of the Day Library ──────────────────────────────────────────────
const VERSE_LIBRARY = [
  {v: "Trust in the Lord with all your heart, and do not lean on your own understanding.", r: "Proverbs 3:5"},
  {v: "I can do all things through Christ who strengthens me.", r: "Philippians 4:13"},
  {v: "For God so loved the world that he gave his one and only Son.", r: "John 3:16"},
  {v: "Be still, and know that I am God.", r: "Psalm 46:10"},
  {v: "And we know that in all things God works for the good of those who love him.", r: "Romans 8:28"},
  {v: "The Lord is my shepherd; I shall not want.", r: "Psalm 23:1"},
  {v: "Wait on the Lord; be of good courage, and He shall strengthen your heart.", r: "Psalm 27:14"},
  {v: "Do not be anxious about anything, but in every situation by prayer and petition present your requests to God.", r: "Philippians 4:6"},
  {v: "Cast all your anxiety on him because he cares for you.", r: "1 Peter 5:7"},
  {v: "Therefore do not worry about tomorrow, for tomorrow will worry about itself.", r: "Matthew 6:34"},
  {v: "Be strong and courageous. Do not be afraid; do not be discouraged, for the Lord your God will be with you wherever you go.", r: "Joshua 1:9"},
  {v: "The Lord will fight for you; you need only to be still.", r: "Exodus 14:14"},
  {v: "Come to me, all you who are weary and burdened, and I will give you rest.", r: "Matthew 11:28"},
  {v: "Greater love has no one than this: to lay down one's life for one's friends.", r: "John 15:13"},
  {v: "I have fought the good fight, I have finished the race, I have kept the faith.", r: "2 Timothy 4:7"},
  {v: "Above all else, guard your heart, for everything you do flows from it.", r: "Proverbs 4:23"},
  {v: "Commit to the Lord whatever you do, and he will establish your plans.", r: "Proverbs 16:3"},
  {v: "Many are the plans in a person's heart, but it is the Lord's purpose that prevails.", r: "Proverbs 19:21"},
  {v: "She is clothed with strength and dignity; she can laugh at the days to come.", r: "Proverbs 31:25"},
  {v: "In their hearts humans plan their course, but the Lord establishes their steps.", r: "Proverbs 16:9"},
  {v: "Train up a child in the way he should go; even when he is old he will not depart from it.", r: "Proverbs 22:6"},
  {v: "Two are better than one, because they have a good return for their labor.", r: "Ecclesiastes 4:9"},
  {v: "There is a time for everything, and a season for every activity under the heavens.", r: "Ecclesiastes 3:1"},
  {v: "Now faith is confidence in what we hope for and assurance about what we do not see.", r: "Hebrews 11:1"},
  {v: "Let us not become weary in doing good, for at the proper time we will reap a harvest if we do not give up.", r: "Galatians 6:9"},
  {v: "But seek first his kingdom and his righteousness, and all these things will be given to you as well.", r: "Matthew 6:33"},
  {v: "Where your treasure is, there your heart will be also.", r: "Matthew 6:21"},
  {v: "Whatever you do, work at it with all your heart, as working for the Lord, not for human masters.", r: "Colossians 3:23"},
  {v: "Be kind and compassionate to one another, forgiving each other, just as in Christ God forgave you.", r: "Ephesians 4:32"},
  {v: "Therefore, my beloved brothers, be steadfast, immovable, always abounding in the work of the Lord.", r: "1 Corinthians 15:58"},
  {v: "For I know the plans I have for you, declares the Lord, plans to prosper you and not to harm you.", r: "Jeremiah 29:11"},
]

function getVerseOfDay() {
  const dayOfYear = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / 86400000)
  return VERSE_LIBRARY[dayOfYear % VERSE_LIBRARY.length]
}


const FAITH_AREAS = ['Spiritual Growth', 'Prayer Life', 'Scripture Study', 'Community/Church', 'Service', 'Fasting', 'Evangelism', 'Discipleship']

function FaithPage({ isPro = false, onUpgrade = () => {}, goals = [], tasks = [], projects = [], onCreateGoal, onEdit }) {
  const { user } = useAuth()

  // Faith data sync helper — saves to Supabase + localStorage backup
  const syncFaith = React.useCallback(async (key, value) => {
    try { localStorage.setItem('planner.faith.' + key, JSON.stringify(value)) } catch {}
    if (!user || !hasSupabaseEnv) return
    try {
      await supabase.from('faith_data').upsert({
        user_id: user.id, data_key: key, data_value: value, updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,data_key' })
    } catch (e) { console.error('Faith sync error:', e) }
  }, [user?.id])

  // Load faith data from Supabase on mount
  React.useEffect(() => {
    if (!user || !hasSupabaseEnv) return
    supabase.from('faith_data')
      .select('data_key, data_value, updated_at')
      .eq('user_id', user.id)
      .then(({ data, error }) => {
        if (error || !data) return
        const latest = {}
        data.forEach(row => {
          if (!latest[row.data_key] || row.updated_at > latest[row.data_key].updated_at) {
            latest[row.data_key] = row
          }
        })
        if (latest.prayers)      setPrayers(latest.prayers.data_value || [])
        if (latest.scriptures)   setScriptures(latest.scriptures.data_value || [])
        if (latest.gratitude)    setGratitude(latest.gratitude.data_value || [])
        if (latest.devotional)   setDevotional(latest.devotional.data_value || { text: '', date: '' })
        if (latest.fasting)      setFasting(latest.fasting.data_value || { active: false, startDate: '', endDate: '', intention: '', log: [] })
        if (latest.faithGoals)   setFaithGoals(latest.faithGoals.data_value || [])
        if (latest.sermons)      setSermons(latest.sermons.data_value || [])
        if (latest.bibleReading) setBibleReading(latest.bibleReading.data_value || { plan: "M'Cheyne", completedDates: [], notes: {} })

        // ── One-time migration: push any localStorage data that never made it to Supabase ──
        // Runs silently — if Supabase already has the key, upsert will update it only if localStorage is newer
        const FAITH_KEYS = ['prayers','scriptures','gratitude','devotional','fasting','faithGoals','sermons','bibleReading']
        FAITH_KEYS.forEach(key => {
          if (!latest[key]) {
            // Nothing in Supabase for this key — check if localStorage has data to push up
            try {
              const raw = localStorage.getItem('planner.faith.' + key)
              if (!raw) return
              const parsed = JSON.parse(raw)
              const hasData = Array.isArray(parsed) ? parsed.length > 0 : parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0 && parsed !== '{}'
              if (hasData) {
                supabase.from('faith_data').upsert({
                  user_id: user.id, data_key: key, data_value: parsed,
                  updated_at: new Date().toISOString()
                }, { onConflict: 'user_id,data_key' }).then(() => {})
              }
            } catch {}
          }
        })
      })

    // Realtime subscription for faith data
    const channel = supabase
      .channel('faith_realtime_' + user.id)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'faith_data',
        filter: `user_id=eq.${user.id}`,
      }, payload => {
        const row = payload.new
        if (!row) return
        if (row.data_key === 'prayers')      setPrayers(row.data_value || [])
        if (row.data_key === 'scriptures')   setScriptures(row.data_value || [])
        if (row.data_key === 'gratitude')    setGratitude(row.data_value || [])
        if (row.data_key === 'devotional')   setDevotional(row.data_value || { text: '', date: '' })
        if (row.data_key === 'fasting')      setFasting(row.data_value || {})
        if (row.data_key === 'faithGoals')   setFaithGoals(row.data_value || [])
        if (row.data_key === 'sermons')      setSermons(row.data_value || [])
        if (row.data_key === 'bibleReading') setBibleReading(row.data_value || {})
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user?.id])
  const lsGet = (k, d) => { try { const v = localStorage.getItem('planner.faith.' + k); return v ? JSON.parse(v) : d } catch { return d } }
  const lsSet = (k, v) => { try { localStorage.setItem('planner.faith.' + k, JSON.stringify(v)) } catch {} }

  const [tab, setTab] = useUrlTab('devotional')

  // Prayer journal state
  const [prayers, setPrayers] = useState(() => lsGet('prayers', []))
  const [newPrayer, setNewPrayer] = useState({ text: '', type: 'Request', answered: false })

  const savePrayers = (v) => { setPrayers(v); syncFaith('prayers', v) }

  // Scripture journal state
  const [scriptures, setScriptures] = useState(() => lsGet('scriptures', []))
  const [newScripture, setNewScripture] = useState({ reference: '', text: '', reflection: '' })
  const saveScriptures = (v) => { setScriptures(v); syncFaith('scriptures', v) }

  // Gratitude state
  const [gratitude, setGratitude] = useState(() => lsGet('gratitude', []))
  const [newGratitude, setNewGratitude] = useState('')
  const saveGratitude = (v) => { setGratitude(v); syncFaith('gratitude', v) }

  // Devotional journal
  const [devotional, setDevotional] = useState(() => lsGet('devotional', { text: '', date: '' }))
  const saveDevotional = (v) => { setDevotional(v); syncFaith('devotional', v) }

  // Fasting tracker
  const [fasting, setFasting] = useState(() => lsGet('fasting', { active: false, startDate: '', endDate: '', intention: '', log: [] }))
  const saveFasting = (v) => { setFasting(v); syncFaith('fasting', v) }

  // Faith goals
  const [faithGoals, setFaithGoals] = useState(() => lsGet('faithGoals', []))
  const [newFaithGoal, setNewFaithGoal] = useState({ text: '', category: 'Spiritual Growth', done: false })
  const saveFaithGoals = (v) => { setFaithGoals(v); syncFaith('faithGoals', v) }
  // Faith goals now live in Goals (category "Faith"). Move any old ones over once.
  const movingGoals = React.useRef(false)
  useEffect(() => {
    if (!onCreateGoal || !faithGoals.length || movingGoals.current) return
    movingGoals.current = true
    ;(async () => {
      for (const g of faithGoals) {
        if (!g?.text) continue
        await onCreateGoal({ title: g.text, category: 'Faith', description: g.category || '', completed: !!g.done, timeframe: '1yr', targetDate: addDays(TODAY, 365), why: '', steps: [] })
      }
      saveFaithGoals([])
    })()
  }, [faithGoals.length])
  const faithAreaOf = (g) => g.description && FAITH_AREAS.includes(g.description) ? g.description : ''
  const myFaithGoals = (goals || []).filter((g) => g.category === 'Faith').sort((a, b) => Number(!!a.completed) - Number(!!b.completed))

  // Sermon notes
  const [sermons, setSermons] = useState(() => lsGet('sermons', []))
  const [bibleReading, setBibleReading] = useState(() => lsGet('bibleReading', { plan: 'M\'Cheyne', completedDates: [], notes: {} }))
  const saveBibleReading = (v) => { setBibleReading(v); syncFaith('bibleReading', v) }
  const [readingNote, setReadingNote] = useState('')
  const [revealedVerse, setRevealedVerse] = useState(null)
  const [newSermon, setNewSermon] = useState({ date: new Date().toISOString().slice(0,10), speaker: '', title: '', notes: '', application: '' })
  const saveSermons = (v) => { setSermons(v); syncFaith('sermons', v) }

  const TODAY = new Date().toISOString().slice(0,10)
  const todayGratitude = gratitude.filter(g => g.date === TODAY)
  const answeredPrayers = prayers.filter(p => p.answered).length

  const TABS = [
    { id: 'devotional', label: '📖 Devotional' },
    { id: 'prayer', label: '🙏 Prayer' },
    { id: 'scripture', label: '📜 Scripture' },
    { id: 'reading', label: '📚 Bible Reading' },
    { id: 'gratitude', label: '🌸 Gratitude' },
    { id: 'fasting', label: '⚡ Fasting' },
    { id: 'sermons', label: '🎙 Sermons' },
    { id: 'goals', label: '🎯 Faith Goals' },
  ]

  return (
    <div className="screen-stack">
      <PageHeader icon={Cross} title="Faith" subtitle="Abide. Pray. Grow." />

      {/* Stats strip */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:4}}>
        {[
          [HandHeart, prayers.filter(p=>!p.answered).length, 'Active Prayers', 'var(--brass2)'],
          [CircleCheck, answeredPrayers, 'Answered', 'var(--success)'],
          [Flower2, todayGratitude.length, 'Gratitude Today', 'var(--brass2)'],
        ].map(([Ic,val,label,color]) => (
          <div key={label} style={{background:'var(--warm-white)',borderRadius:14,padding:'14px 8px 12px',textAlign:'center',border:'1px solid var(--border)',boxShadow:'0 1px 2px rgba(28,28,30,.04)'}}>
            <div style={{display:'grid',placeItems:'center',marginBottom:6}}><Ic size={20} strokeWidth={1.6} color={color} /></div>
            <div style={{fontWeight:800,fontSize:'1.2rem',color,lineHeight:1,marginBottom:2}}>{val}</div>
            <div style={{fontSize:'.65rem',color:'var(--muted)',fontWeight:600,letterSpacing:'.04em',textTransform:'uppercase'}}>{label}</div>
          </div>
        ))}
      </div>

      <QuickAccessGrid tabs={TABS} activeTab={tab} onSelect={setTab} proTabs={PRO_TABS.faith} isPro={isPro} iconOverrides={FAITH_ICON_OVERRIDES} />

      {/* ── DEVOTIONAL ─────────────────────────────────────────────────────── */}
      {tab === 'devotional' && (
        <section className="card">
          {/* Verse of the Day */}
          {(() => {
            const vod = getVerseOfDay()
            return (
              <div style={{
                background: 'linear-gradient(135deg, var(--brass-dim) 0%, rgba(184,150,90,.1) 100%)',
                border: '1.5px solid rgba(184,150,90,.3)',
                borderRadius: 14, padding: '18px 20px', marginBottom: 16,
                position: 'relative',
              }}>
                <p style={{
                  fontSize: '.62rem', fontWeight: 700, letterSpacing: '.1em',
                  color: 'var(--brass)', textTransform: 'uppercase', marginBottom: 8,
                }}>Verse of the Day</p>
                <p style={{
                  fontFamily: "var(--serif)", fontSize: '1.02rem', lineHeight: 1.5,
                  color: 'var(--ink)', fontStyle: 'italic', marginBottom: 8,
                }}>"{vod.v}"</p>
                <p style={{fontSize: '.78rem', color: 'var(--brass)', fontWeight: 700, textAlign: 'right'}}>— {vod.r}</p>
                <button onClick={() => {
                  saveScriptures([...scriptures, { id: Date.now(), verse: vod.v, reference: vod.r, date: TODAY }])
                }} style={{
                  marginTop: 10, padding: '7px 14px', borderRadius: 999,
                  background: 'var(--brass)', color: 'white', border: 'none',
                  fontSize: '.78rem', fontWeight: 600, cursor: 'pointer',
                }}>+ Save to Scripture</button>
              </div>
            )
          })()}

          <p className="eyebrow">Daily Devotional</p>
          <h3 style={{ margin: '4px 0 8px' }}>Time with God</h3>
          <p className="muted" style={{fontSize:'.8rem',marginBottom:14}}>Use this space for your daily quiet time — reading, reflection, what God is speaking to you.</p>

          {/* Daily verse prompt */}
          <div style={{background:'var(--ink)',borderRadius:12,padding:'16px',marginBottom:16}}>
            <p className="eyebrow" style={{color:'var(--brass)',marginBottom:6}}>Today's Anchor</p>
            {[
              '"Trust in the Lord with all your heart and lean not on your own understanding." — Proverbs 3:5',
              '"I can do all things through Christ who strengthens me." — Philippians 4:13',
              '"Be still and know that I am God." — Psalm 46:10',
              '"For I know the plans I have for you, declares the Lord, plans to prosper you." — Jeremiah 29:11',
              '"The Lord is my shepherd; I shall not want." — Psalm 23:1',
              '"Let your light shine before others, that they may see your good deeds." — Matthew 5:16',
              '"And we know that in all things God works for the good of those who love him." — Romans 8:28',
            ][new Date().getDay() % 7].split('—').map((part, i) => (
              i === 0
                ? <p key={i} style={{color:'white',fontSize:'.95rem',fontFamily:'var(--serif)',lineHeight:1.7,fontStyle:'italic',margin:'0 0 6px'}}>"{part.trim()}"</p>
                : <p key={i} style={{color:'var(--brass)',fontSize:'.78rem',fontWeight:600,margin:0}}>— {part.trim()}</p>
            ))}
          </div>

          <p style={{fontWeight:600,fontSize:'.85rem',marginBottom:6}}>Today's Reflection — {TODAY}</p>
          <textarea value={devotional.date === TODAY ? devotional.text : ''}
            onChange={e => saveDevotional({ text: e.target.value, date: TODAY })}
            placeholder="What is God speaking to you today? What did you read? What are you sensing?"
            style={{width:'100%',minHeight:200,padding:'12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',
            fontSize:'.9rem',fontFamily:'var(--serif)',lineHeight:1.7,resize:'vertical',background:'var(--warm-white)',color:'var(--ink)',boxSizing:'border-box'}} />
          <p className="muted" style={{fontSize:'.75rem',marginTop:6}}>Saved automatically.</p>
        </section>
      )}

      {/* ── PRAYER ─────────────────────────────────────────────────────────── */}
      {tab === 'prayer' && (
        <section className="card">
          <p className="eyebrow">Prayer Journal</p>
          <h3 style={{ margin: '4px 0 14px' }}>Your Prayer Life</h3>

          {/* Praise Reports — Answered Prayers */}
          {(() => {
            const answered = prayers.filter(p => p.answered)
            if (answered.length === 0) return null
            return (
              <div style={{
                background: 'linear-gradient(135deg, rgba(34,197,94,.08) 0%, rgba(34,197,94,.03) 100%)',
                border: '1.5px solid rgba(34,197,94,.25)',
                borderRadius: 14, padding: '14px 16px', marginBottom: 16,
              }}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                  <p style={{
                    fontSize: '.65rem', fontWeight: 700, letterSpacing: '.08em',
                    color: 'var(--success)', textTransform: 'uppercase', margin: 0,
                  }}>🙌 Praise Reports</p>
                  <strong style={{fontSize:'.78rem',color:'var(--success)'}}>{answered.length} answered</strong>
                </div>
                <p style={{fontSize:'.78rem',color:'var(--ink2)',marginBottom:10,fontStyle:'italic'}}>
                  "Give thanks to the Lord, for he is good; his love endures forever." — Psalm 107:1
                </p>
                <div style={{display:'flex',flexDirection:'column',gap:6,maxHeight:120,overflow:'auto'}}>
                  {answered.slice(0,5).map(p => (
                    <div key={p.id} style={{
                      fontSize:'.82rem',color:'var(--ink)',padding:'6px 10px',
                      background:'rgba(255,255,255,.6)',borderRadius:8,
                      borderLeft:'3px solid var(--success)',
                    }}>
                      <strong>✓ {p.title || p.request}</strong>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}


          {/* Active prayers */}
          <p style={{fontWeight:600,fontSize:'.85rem',marginBottom:8}}>Active Requests</p>
          {prayers.filter(p => !p.answered).length === 0 && (
            <p className="muted" style={{fontSize:'.82rem',marginBottom:12,fontStyle:'italic'}}>No active prayer requests. Add one below.</p>
          )}
          {prayers.filter(p => !p.answered).map((prayer, i) => (
            <div key={prayer.id} style={{padding:'12px',background:'var(--stone)',borderRadius:10,marginBottom:8}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:'.78rem',color:'var(--brass)',fontWeight:600,marginBottom:4}}>{prayer.type} · {prayer.date}</div>
                  <div style={{fontSize:'.9rem',color:'var(--ink)',lineHeight:1.5}}>{prayer.text}</div>
                </div>
                <div style={{display:'flex',gap:6,flexShrink:0}}>
                  <button onClick={() => savePrayers(prayers.map(p => p.id===prayer.id ? {...p, answered:true, answeredDate:TODAY} : p))}
                    style={{background:'var(--success)',color:'white',border:'none',borderRadius:6,padding:'4px 8px',fontSize:'.72rem',cursor:'pointer',fontWeight:600}}>✓ Answered</button>
                  <button onClick={() => savePrayers(prayers.filter(p => p.id !== prayer.id))}
                    style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer'}}>✕</button>
                </div>
              </div>
            </div>
          ))}

          {/* Answered prayers */}
          {prayers.filter(p => p.answered).length > 0 && (
            <div style={{marginBottom:16}}>
              <p style={{fontWeight:600,fontSize:'.85rem',marginBottom:8,color:'var(--success)'}}>✓ Answered Prayers ({answeredPrayers})</p>
              {prayers.filter(p => p.answered).slice(0,5).map(prayer => (
                <div key={prayer.id} style={{padding:'10px 12px',background:'var(--success)18',borderRadius:8,marginBottom:6,display:'flex',justifyContent:'space-between',gap:8}}>
                  <div>
                    <div style={{fontSize:'.72rem',color:'var(--success)',fontWeight:600,marginBottom:2}}>Answered {prayer.answeredDate || ''}</div>
                    <div style={{fontSize:'.85rem',color:'var(--ink2)'}}>{prayer.text}</div>
                  </div>
                  <button onClick={() => savePrayers(prayers.filter(p => p.id !== prayer.id))}
                    style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',flexShrink:0}}>✕</button>
                </div>
              ))}
            </div>
          )}

          {/* Add prayer */}
          <div style={{marginTop:8,padding:'14px',background:'var(--stone)',borderRadius:10,display:'grid',gap:8}}>
            <p style={{fontWeight:600,fontSize:'.85rem',margin:0}}>Add Prayer Request</p>
            <select value={newPrayer.type} onChange={e => setNewPrayer(p => ({...p, type: e.target.value}))}
              style={{padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.85rem'}}>
              {['Request','Intercession','Praise','Thanksgiving','Confession'].map(t => <option key={t}>{t}</option>)}
            </select>
            <textarea value={newPrayer.text} onChange={e => setNewPrayer(p => ({...p, text: e.target.value}))}
              placeholder="What are you bringing before God?"
              style={{width:'100%',minHeight:90,padding:'10px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',
              fontSize:'.85rem',fontFamily:'var(--serif)',lineHeight:1.6,resize:'vertical',boxSizing:'border-box'}} />
            <button className="primary-btn" onClick={() => {
              if (!newPrayer.text.trim()) return
              savePrayers([{...newPrayer, id: Date.now(), date: TODAY}, ...prayers])
              setNewPrayer({ text: '', type: 'Request', answered: false })
            }}>+ Add Prayer</button>
          </div>
        </section>
      )}

      {/* ── SCRIPTURE ──────────────────────────────────────────────────────── */}
      {tab === 'scripture' && (
        <section className="card">
          {/* Memory Verse Practice */}
          {scriptures.filter(s => s.memorizing).length > 0 && (
            <div style={{
              background: 'var(--brass-dim)',
              border: '1.5px solid rgba(184,150,90,.25)',
              borderRadius: 14, padding: '14px 16px', marginBottom: 16,
            }}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                <p style={{
                  fontSize: '.65rem', fontWeight: 700, letterSpacing: '.08em',
                  color: 'var(--brass)', textTransform: 'uppercase', margin: 0,
                }}>📚 Memorizing</p>
                <strong style={{fontSize:'.78rem',color:'var(--brass)'}}>{scriptures.filter(s => s.memorized).length} of {scriptures.filter(s => s.memorizing).length} mastered</strong>
              </div>
              {scriptures.filter(s => s.memorizing && !s.memorized).slice(0, 3).map(s => {
                const isRevealed = revealedVerse === s.id
                // Create a fill-in-blank version (hide ~30% of words)
                const words = (s.verse || '').split(' ')
                const hidden = words.map((w, i) => i % 3 === 1 ? '___' : w).join(' ')
                return (
                  <div key={s.id} style={{
                    padding:'10px 12px',background:'rgba(255,255,255,.7)',
                    borderRadius:10,marginBottom:8,borderLeft:'3px solid var(--brass)',
                  }}>
                    <p style={{fontSize:'.85rem',fontFamily:'var(--serif)',fontStyle:'italic',lineHeight:1.5,marginBottom:6}}>
                      {isRevealed ? s.verse : hidden}
                    </p>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <p style={{fontSize:'.74rem',color:'var(--brass)',fontWeight:700,margin:0}}>— {s.reference}</p>
                      <div style={{display:'flex',gap:6}}>
                        <button onClick={() => setRevealedVerse(isRevealed ? null : s.id)} style={{
                          fontSize:'.72rem',padding:'4px 10px',borderRadius:999,
                          background:'transparent',color:'var(--brass)',
                          border:'1px solid var(--brass)',cursor:'pointer',fontWeight:600,
                        }}>{isRevealed ? 'Hide' : 'Reveal'}</button>
                        <button onClick={() => saveScriptures(scriptures.map(x => x.id === s.id ? {...x, memorized: true} : x))} style={{
                          fontSize:'.72rem',padding:'4px 10px',borderRadius:999,
                          background:'var(--success)',color:'white',
                          border:'none',cursor:'pointer',fontWeight:600,
                        }}>✓ Memorized</button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <p className="eyebrow">Scripture Journal</p>
          <h3 style={{ margin: '4px 0 14px' }}>God's Word in Your Life</h3>
          {scriptures.length === 0 && <p className="muted" style={{marginBottom:16}}><EmptyState icon="📖" title="Hide the Word in your heart" message="Save a verse that speaks today. Return to it tomorrow." /></p>}
          {scriptures.map((s, i) => (
            <div key={s.id} style={{padding:'14px',background:'var(--stone)',borderRadius:10,marginBottom:10}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                <strong style={{color:'var(--brass)',fontSize:'.85rem'}}>{s.reference}</strong>
                <div style={{display:'flex',gap:6}}>
                  <button onClick={() => saveScriptures(scriptures.map((x,j)=>j===i?{...x, memorizing: !x.memorizing, memorized: x.memorizing ? false : x.memorized}:x))}
                    style={{
                      background: s.memorizing ? 'var(--brass)' : 'transparent',
                      color: s.memorizing ? 'white' : 'var(--brass)',
                      border: '1px solid var(--brass)', borderRadius: 999,
                      padding: '3px 10px', fontSize: '.7rem', fontWeight: 600,
                      cursor: 'pointer',
                    }}>{s.memorized ? '✓ Memorized' : s.memorizing ? '📚 Memorizing' : '+ Memorize'}</button>
                  <button onClick={() => saveScriptures(scriptures.filter((_,j)=>j!==i))}
                    style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer'}}>✕</button>
                </div>
              </div>
              <p style={{fontSize:'.9rem',fontFamily:'var(--serif)',lineHeight:1.7,margin:'0 0 8px',fontStyle:'italic',color:'var(--ink)'}}>{s.text}</p>
              {s.reflection && <p style={{fontSize:'.82rem',color:'var(--ink2)',lineHeight:1.5,margin:0}}>💭 {s.reflection}</p>}
              <p className="muted" style={{fontSize:'.72rem',margin:'6px 0 0'}}>{s.date}</p>
            </div>
          ))}
          <div style={{marginTop:8,padding:'14px',background:'var(--stone)',borderRadius:10,display:'grid',gap:8}}>
            <p style={{fontWeight:600,fontSize:'.85rem',margin:0}}>Save a Scripture</p>
            <input placeholder="Reference (e.g. John 3:16)" value={newScripture.reference}
              onChange={e => setNewScripture(p => ({...p, reference: e.target.value}))}
              style={{padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.85rem'}} />
            <textarea placeholder="Verse text..." value={newScripture.text}
              onChange={e => setNewScripture(p => ({...p, text: e.target.value}))}
              style={{width:'100%',minHeight:80,padding:'10px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',
              fontSize:'.85rem',fontFamily:'var(--serif)',lineHeight:1.6,resize:'vertical',boxSizing:'border-box'}} />
            <textarea placeholder="Personal reflection on this verse..." value={newScripture.reflection}
              onChange={e => setNewScripture(p => ({...p, reflection: e.target.value}))}
              style={{width:'100%',minHeight:70,padding:'10px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',
              fontSize:'.85rem',fontFamily:'var(--serif)',lineHeight:1.6,resize:'vertical',boxSizing:'border-box'}} />
            <button className="primary-btn" onClick={() => {
              if (!newScripture.reference || !newScripture.text) return
              saveScriptures([{...newScripture, id: Date.now(), date: TODAY}, ...scriptures])
              setNewScripture({ reference: '', text: '', reflection: '' })
            }}>+ Save Scripture</button>
          </div>
        </section>
      )}

      {tab === 'reading' && (
        <ProTabGate isPro={isPro} onUpgrade={onUpgrade}>
        <section className="card">
          <p className="eyebrow">Bible Reading</p>
          <h3 style={{margin:'4px 0 8px'}}>Daily Reading</h3>
          <p className="muted" style={{fontSize:'.8rem',marginBottom:14}}>
            "Man shall not live by bread alone, but by every word from the mouth of God." — Matthew 4:4
          </p>

          {/* Plan selector */}
          <div style={{marginBottom:14}}>
            <p style={{fontSize:'.72rem',color:'var(--ink2)',fontWeight:600,letterSpacing:'.06em',textTransform:'uppercase',marginBottom:6}}>Reading Plan</p>
            <select value={bibleReading.plan || "M'Cheyne"}
              onChange={e => saveBibleReading({...bibleReading, plan: e.target.value})}
              style={{width:'100%',padding:'10px 12px',border:'1.5px solid var(--border2)',borderRadius:8,fontSize:'.9rem',background:'white'}}>
              <option value="Bible in a Year">Bible in a Year — Genesis to Revelation, daily</option>
              <option value="Chronological">Chronological — events in order they happened</option>
              <option value="M'Cheyne">M'Cheyne — 4 chapters daily (OT, NT, Psalms/Gospels)</option>
              <option value="F-260">F-260 — 1 chapter, 5 days/week (Foundations)</option>
              <option value="New Testament">New Testament Only — Matthew to Revelation</option>
              <option value="Psalms & Proverbs">Psalms & Proverbs daily</option>
              <option value="Custom">Custom — track on your own</option>
            </select>
          </div>

          {/* Today's check-in */}
          <div style={{background:'var(--brass-dim)',borderRadius:12,padding:'14px 16px',marginBottom:14}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
              <strong style={{fontSize:'.92rem',color:'var(--ink)'}}>Today's Reading</strong>
              <button onClick={() => {
                const completed = bibleReading.completedDates || []
                const has = completed.includes(TODAY)
                const next = has
                  ? completed.filter(d => d !== TODAY)
                  : [...completed, TODAY]
                saveBibleReading({...bibleReading, completedDates: next})
              }} style={{
                padding:'6px 14px', borderRadius:999, fontSize:'.8rem', fontWeight:700, cursor:'pointer',
                background: (bibleReading.completedDates||[]).includes(TODAY) ? 'var(--success)' : 'var(--brass)',
                color:'white', border:'none',
              }}>{(bibleReading.completedDates||[]).includes(TODAY) ? '✓ Done Today' : 'Mark Read'}</button>
            </div>
            <textarea
              placeholder="Notes from today's reading..."
              value={bibleReading.notes?.[TODAY] || ''}
              onChange={e => saveBibleReading({
                ...bibleReading,
                notes: {...(bibleReading.notes||{}), [TODAY]: e.target.value}
              })}
              style={{width:'100%',minHeight:80,padding:'10px',border:'1.5px solid rgba(184,150,90,.3)',borderRadius:8,fontSize:'.88rem',resize:'vertical',background:'white',fontFamily:'inherit'}} />
          </div>

          {/* Streak + stats */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:14}}>
            {(() => {
              const dates = (bibleReading.completedDates || []).sort()
              // Current streak
              let current = 0
              let d = new Date()
              if (!dates.includes(d.toISOString().slice(0,10))) {
                d.setDate(d.getDate() - 1)
              }
              while (dates.includes(d.toISOString().slice(0,10))) {
                current++
                d.setDate(d.getDate() - 1)
              }
              // Longest streak
              let longest = 0, run = 0
              for (let i = 0; i < dates.length; i++) {
                if (i === 0 || (new Date(dates[i]) - new Date(dates[i-1])) === 86400000) {
                  run++
                  longest = Math.max(longest, run)
                } else { run = 1 }
              }
              const total = dates.length
              return [
                ['Current Streak', current + 'd', current > 0 ? 'var(--warning)' : 'var(--muted)'],
                ['Longest', longest + 'd', 'var(--brass)'],
                ['Total Days', total + '', 'var(--teal)'],
              ].map(([label, val, color]) => (
                <div key={label} style={{background:'var(--stone)',borderRadius:10,padding:'10px 4px',textAlign:'center'}}>
                  <div className="muted" style={{fontSize:'.65rem',fontWeight:600,letterSpacing:'.05em',textTransform:'uppercase',marginBottom:2}}>{label}</div>
                  <strong style={{color,fontSize:'1rem'}}>{val}</strong>
                </div>
              ))
            })()}
          </div>

          {/* Last 30 days visual */}
          <p style={{fontSize:'.72rem',color:'var(--ink2)',fontWeight:600,letterSpacing:'.06em',textTransform:'uppercase',marginBottom:8}}>Last 30 Days</p>
          <div style={{display:'grid',gridTemplateColumns:'repeat(10, 1fr)',gap:4}}>
            {Array.from({length: 30}).map((_, i) => {
              const date = new Date(Date.now() - (29-i) * 86400000).toISOString().slice(0,10)
              const done = (bibleReading.completedDates || []).includes(date)
              return (
                <div key={i} title={date} style={{
                  aspectRatio:'1', borderRadius:6,
                  background: done ? 'var(--brass)' : 'var(--stone2)',
                  border: '1px solid ' + (done ? 'var(--brass)' : 'var(--border)'),
                }} />
              )
            })}
          </div>
        </section>
        </ProTabGate>
      )}

      {/* ── GRATITUDE ──────────────────────────────────────────────────────── */}
      {tab === 'gratitude' && (
        <section className="card">
          <p className="eyebrow">Gratitude Journal</p>
          <h3 style={{ margin: '4px 0 8px' }}>Count Your Blessings</h3>
          <p className="muted" style={{fontSize:'.8rem',marginBottom:14}}>A grateful heart is a powerful heart. Log at least 3 things daily.</p>

          {/* Quick Gratitude */}
          <div style={{marginBottom:14}}>
            <p style={{fontSize:'.72rem',color:'var(--ink2)',fontWeight:600,letterSpacing:'.06em',textTransform:'uppercase',marginBottom:8}}>Quick Add</p>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(76px, 1fr))',gap:8}}>
              {[
                {icon:'👨‍👩‍👧', label:'Family'},
                {icon:'🏥', label:'Health'},
                {icon:'🏠', label:'Home'},
                {icon:'💼', label:'Work'},
                {icon:'🍞', label:'Food'},
                {icon:'🌅', label:'New Day'},
                {icon:'☮️', label:'Peace'},
                {icon:'🤝', label:'Friends'},
              ].map(({icon, label}) => (
                <button key={label} onClick={() => {
                  saveGratitude([...gratitude, {id: Date.now(), text: label, date: TODAY}])
                }} style={{
                  display:'flex', flexDirection:'column', alignItems:'center', gap:4,
                  padding:'10px 6px', borderRadius:12, background:'var(--stone)',
                  border:'1.5px solid var(--border2)', cursor:'pointer',
                  transition:'all .15s',
                }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--brass)'; e.currentTarget.style.background = 'var(--stone2)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.background = 'var(--stone)' }}
                >
                  <div style={{fontSize:'1.4rem'}}>{icon}</div>
                  <div style={{fontSize:'.7rem',color:'var(--ink2)',fontWeight:600,textAlign:'center'}}>{label}</div>
                </button>
              ))}
            </div>
          </div>
          <div style={{background:'var(--stone)',borderRadius:10,padding:'12px',marginBottom:14,display:'flex',justifyContent:'space-between'}}>
            <div><p className="muted" style={{fontSize:'.72rem',margin:'0 0 2px'}}>Today</p><strong style={{color:'var(--brass)'}}>{todayGratitude.length} entries</strong></div>
            <div style={{textAlign:'right'}}><p className="muted" style={{fontSize:'.72rem',margin:'0 0 2px'}}>All time</p><strong>{gratitude.length} blessings</strong></div>
          </div>
          <div style={{display:'flex',gap:8,marginBottom:16}}>
            <input placeholder="What are you grateful for today?" value={newGratitude}
              onChange={e => setNewGratitude(e.target.value)}
              style={{flex:1,padding:'10px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.88rem'}}
              onKeyDown={e => { if (e.key==='Enter' && newGratitude.trim()) { saveGratitude([{text:newGratitude.trim(),date:TODAY,id:Date.now()}, ...gratitude]); setNewGratitude('') }}} />
            <button className="primary-btn" onClick={() => {
              if (!newGratitude.trim()) return
              saveGratitude([{text:newGratitude.trim(),date:TODAY,id:Date.now()}, ...gratitude])
              setNewGratitude('')
            }}>+ Add</button>
          </div>
          {gratitude.slice(0, 30).reduce((groups, item) => {
            const g = groups.find(g => g.date === item.date)
            if (g) g.items.push(item)
            else groups.push({ date: item.date, items: [item] })
            return groups
          }, [])

.map(group => (
            <div key={group.date} style={{marginBottom:14}}>
              <p style={{fontSize:'.78rem',fontWeight:700,color:'var(--brass)',marginBottom:6}}>
                {group.date === TODAY ? 'Today' : group.date}
              </p>
              {group.items.map(item => (
                <div key={item.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'1px solid var(--border)'}}>
                  <span style={{fontSize:'.88rem',color:'var(--ink)'}}>{item.text}</span>
                  <button onClick={() => saveGratitude(gratitude.filter(g => g.id !== item.id))}
                    style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',marginLeft:8}}>✕</button>
                </div>
              ))}
            </div>
          ))}
        </section>
      )}

      {/* ── FASTING ────────────────────────────────────────────────────────── */}
      {tab === 'fasting' && (
        <ProTabGate isPro={isPro} onUpgrade={onUpgrade}>
        <section className="card">
          <p className="eyebrow">Fasting Tracker</p>
          <h3 style={{ margin: '4px 0 8px' }}>Discipline & Consecration</h3>
          <p className="muted" style={{fontSize:'.8rem',marginBottom:16}}>Fasting is a powerful spiritual discipline. Track your intentions and stay accountable.</p>
          {fasting.active ? (
            <div style={{background:'var(--ink)',borderRadius:12,padding:'16px',marginBottom:16}}>
              <p style={{color:'var(--brass)',fontWeight:700,fontSize:'.85rem',marginBottom:4}}>Active Fast</p>
              <p style={{color:'white',fontSize:'1rem',fontWeight:600,marginBottom:4}}>{fasting.intention || 'No intention set'}</p>
              <p style={{color:'rgba(255,255,255,.6)',fontSize:'.8rem'}}>{fasting.startDate} → {fasting.endDate || 'Open'}</p>
              <button onClick={() => saveFasting({...fasting, active:false, log:[...fasting.log, {start:fasting.startDate,end:TODAY,intention:fasting.intention}]})}
                style={{marginTop:12,background:'var(--danger)',color:'white',border:'none',borderRadius:8,padding:'8px 16px',cursor:'pointer',fontWeight:600,fontSize:'.85rem'}}>
                End Fast
              </button>
            </div>
          ) : (
            <div style={{padding:'14px',background:'var(--stone)',borderRadius:10,marginBottom:16,display:'grid',gap:8}}>
              <p style={{fontWeight:600,fontSize:'.85rem',margin:0}}>Begin a Fast</p>
              <input placeholder="Intention / Purpose" value={fasting.intention || ''}
                onChange={e => saveFasting({...fasting, intention: e.target.value})}
                style={{padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.85rem'}} />
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                <div><p className="muted" style={{fontSize:'.72rem',margin:'0 0 4px'}}>Start Date</p>
                  <input type="date" value={fasting.startDate||TODAY} onChange={e => saveFasting({...fasting, startDate: e.target.value})}
                    style={{width:'100%',padding:'8px 10px',border:'1.5px solid var(--border2)',borderRadius:6,fontSize:'.85rem',boxSizing:'border-box'}} />
                </div>
                <div><p className="muted" style={{fontSize:'.72rem',margin:'0 0 4px'}}>End Date (optional)</p>
                  <input type="date" value={fasting.endDate||''} onChange={e => saveFasting({...fasting, endDate: e.target.value})}
                    style={{width:'100%',padding:'8px 10px',border:'1.5px solid var(--border2)',borderRadius:6,fontSize:'.85rem',boxSizing:'border-box'}} />
                </div>
              </div>
              <button className="primary-btn" onClick={() => saveFasting({...fasting, active:true, startDate: fasting.startDate||TODAY})}>Begin Fast</button>
            </div>
          )}
          {(fasting.log || []).length > 0 && (
            <div>
              <p style={{fontWeight:600,fontSize:'.85rem',marginBottom:8}}>Fast History</p>
              {(fasting.log || []).map((entry, i) => (
                <div key={i} style={{padding:'10px 0',borderBottom:'1px solid var(--border)'}}>
                  <div style={{fontWeight:600,fontSize:'.88rem'}}>{entry.intention || 'Fast'}</div>
                  <div className="muted" style={{fontSize:'.75rem'}}>{entry.start} → {entry.end}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      </ProTabGate>)}

      {/* ── SERMONS ────────────────────────────────────────────────────────── */}
      {tab === 'sermons' && (
        <ProTabGate isPro={isPro} onUpgrade={onUpgrade}>
        <section className="card">
          <p className="eyebrow">Sermon Notes</p>
          <h3 style={{ margin: '4px 0 14px' }}>Capture What God Says</h3>
          {sermons.map((s, i) => (
            <div key={s.id} style={{padding:'14px',background:'var(--stone)',borderRadius:10,marginBottom:10}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:6}}>
                <div>
                  <strong style={{fontSize:'.9rem'}}>{s.title || 'Untitled'}</strong>
                  <div className="muted" style={{fontSize:'.75rem'}}>{s.speaker} · {s.date}</div>
                </div>
                <button onClick={() => { if(window.confirm('Delete this sermon note?')) saveSermons(sermons.filter((_,j)=>j!==i)) }}
                  style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',padding:'4px 8px',fontSize:'.85rem'}}>✕</button>
              </div>
              {s.notes && <p style={{fontSize:'.85rem',lineHeight:1.6,margin:'8px 0 6px',color:'var(--ink2)'}}>{s.notes}</p>}
              {s.application && <p style={{fontSize:'.82rem',color:'var(--teal)',margin:0}}>🎯 {s.application}</p>}
            </div>
          ))}
          <div style={{padding:'14px',background:'var(--stone)',borderRadius:10,display:'grid',gap:8}}>
            <p style={{fontWeight:600,fontSize:'.85rem',margin:0}}>New Sermon Notes</p>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              <input placeholder="Speaker" value={newSermon.speaker} onChange={e => setNewSermon(p => ({...p, speaker: e.target.value}))}
                style={{padding:'9px 10px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.85rem'}} />
              <input type="date" value={newSermon.date} onChange={e => setNewSermon(p => ({...p, date: e.target.value}))}
                style={{padding:'9px 10px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.85rem'}} />
            </div>
            <input placeholder="Sermon title" value={newSermon.title} onChange={e => setNewSermon(p => ({...p, title: e.target.value}))}
              style={{padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.85rem'}} />
            <textarea placeholder="Key points, quotes, insights..." value={newSermon.notes} onChange={e => setNewSermon(p => ({...p, notes: e.target.value}))}
              style={{width:'100%',minHeight:100,padding:'10px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',
              fontSize:'.85rem',fontFamily:'var(--serif)',lineHeight:1.6,resize:'vertical',boxSizing:'border-box'}} />
            <textarea placeholder="How will I apply this?" value={newSermon.application} onChange={e => setNewSermon(p => ({...p, application: e.target.value}))}
              style={{width:'100%',minHeight:70,padding:'10px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',
              fontSize:'.85rem',fontFamily:'var(--serif)',lineHeight:1.6,resize:'vertical',boxSizing:'border-box'}} />
            <button className="primary-btn" onClick={() => {
              if (!newSermon.title && !newSermon.notes) return
              saveSermons([{...newSermon, id: Date.now()}, ...sermons])
              setNewSermon({ date: TODAY, speaker: '', title: '', notes: '', application: '' })
            }}>+ Save Notes</button>
          </div>
        </section>
      </ProTabGate>)}

      {/* ── FAITH GOALS (shared with Goals) ───────────────────────────────── */}
      {tab === 'goals' && (
        <ProTabGate isPro={isPro} onUpgrade={onUpgrade}>
        <section className="card">
          <div className="section-title-row" style={{ marginBottom: 6 }}>
            <div><p className="eyebrow">Faith Goals</p><h3>Growing in the Spirit</h3></div>
            <Link className="ghost-btn" to="/goals" style={{ fontSize: '.8rem' }}>All goals →</Link>
          </div>
          <p className="muted" style={{ fontSize: '.8rem', margin: '0 0 12px' }}>These live in Goals too, so they get steps, progress and a place on Home.</p>
          {myFaithGoals.length === 0 && <EmptyState icon={Cross} title="What is God calling you to?" message="Spiritual growth is intentional. What is being asked of you in this season?" />}
          {myFaithGoals.map((g) => {
            const pct = getGoalProgress(g, tasks, projects)
            const next = nextStepFor(g, projects)
            return (
              <button key={g.id} className="faith-goal" onClick={() => onEdit && onEdit('goal', g)} style={g.completed ? { opacity: .6 } : undefined}>
                <div className="faith-goal-top">
                  <strong>{g.title}</strong>
                  <span>{g.completed ? 'Achieved' : `${pct}%`}</span>
                </div>
                {faithAreaOf(g) && <small className="muted">{faithAreaOf(g)}</small>}
                <div className="nut-bar" style={{ height: 5 }}><div style={{ width: `${pct}%` }} className={pct >= 100 ? 'hit' : ''} /></div>
                {next && !g.completed && <div className="home-next-step" style={{ marginTop: 2 }}><span>Next</span>{next}</div>}
              </button>
            )
          })}
          <div className="wl-form">
            <input placeholder="e.g. Read the Bible in a year" value={newFaithGoal.text} onChange={(e) => setNewFaithGoal((p) => ({ ...p, text: e.target.value }))} />
            <select value={newFaithGoal.category} onChange={(e) => setNewFaithGoal((p) => ({ ...p, category: e.target.value }))}>
              {FAITH_AREAS.map((c) => <option key={c}>{c}</option>)}
            </select>
            <button className="primary-btn" onClick={async () => {
              if (!newFaithGoal.text.trim() || !onCreateGoal) return
              await onCreateGoal({ title: newFaithGoal.text.trim(), category: 'Faith', description: newFaithGoal.category, completed: false, timeframe: '1yr', targetDate: addDays(TODAY, 365), why: '', steps: [] })
              setNewFaithGoal({ text: '', category: 'Spiritual Growth', done: false })
            }}>+ Add faith goal</button>
            <small className="muted">Tap a goal to add steps, a target date or your why.</small>
          </div>
        </section>
      </ProTabGate>)}
      <TabNav tabs={TABS} activeTab={tab} onSelect={setTab} />
    </div>
  )
}


function App() {
  return (
    <AppErrorBoundary>
      <AuthProvider><AuthGate fallback={<AuthPage />}><PlannerApp /></AuthGate></AuthProvider>
    </AppErrorBoundary>
  )
}


// ── Export ────────────────────────────────────────────────────────────────
export default App
