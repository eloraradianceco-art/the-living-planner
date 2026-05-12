import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Routes, Route, Link, BrowserRouter, useLocation, useNavigate } from 'react-router-dom'

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

// ── Push Notification System ─────────────────────────────────────────────────
const VAPID_PUBLIC_KEY = 'YI0UW1Ky1eXea1RFPVhDrHjkSV6se1QHcOX9JmztAa_M4GT9rnHJCq-LcrBgJR4GFNohKQDz9sSKo2xwLlwSKQ'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}

const PlannerPush = {
  async isSupported() {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  },

  async getPermission() {
    return Notification.permission // 'default' | 'granted' | 'denied'
  },

  async requestPermission() {
    if (!(await this.isSupported())) return 'unsupported'
    const result = await Notification.requestPermission()
    return result
  },

  async registerSW() {
    if (!('serviceWorker' in navigator)) return null
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
      await navigator.serviceWorker.ready
      return reg
    } catch(e) {
      console.warn('SW registration failed:', e)
      return null
    }
  },

  async subscribe() {
    const reg = await this.registerSW()
    if (!reg) return null
    try {
      const existing = await reg.pushManager.getSubscription()
      if (existing) return existing
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      })
      // Save subscription to localStorage for use when scheduling
      localStorage.setItem('planner.pushSub', JSON.stringify(subscription))
      return subscription
    } catch(e) {
      console.warn('Push subscribe failed:', e)
      return null
    }
  },

  async unsubscribe() {
    const reg = await navigator.serviceWorker.getRegistration('/sw.js')
    if (!reg) return
    const sub = await reg.pushManager.getSubscription()
    if (sub) await sub.unsubscribe()
    localStorage.removeItem('planner.pushSub')
  },

  async sendLocal(title, body, options = {}) {
    // Send a local notification (no server needed) for immediate alerts
    if (Notification.permission !== 'granted') return
    const reg = await navigator.serviceWorker.ready
    reg.showNotification(title, {
      body,
      icon: '/planner-icon.png',
      badge: '/planner-icon.png',
      vibrate: [100, 50, 100],
      ...options
    })
  },

  scheduleCheck(tasks, habits, goals, settings) {
    // Run on app load — check what needs notifying today
    if (Notification.permission !== 'granted') return
    const now = new Date()
    const today = now.toISOString().slice(0, 10)
    const hour = now.getHours()

    const notifSettings = settings?.notifications || {}

    // Morning habit reminder (8am)
    if (notifSettings.habits && hour >= 8 && hour < 9) {
      const todayKey = 'planner.notif.habits.' + today
      if (!localStorage.getItem(todayKey)) {
        const pendingHabits = habits.filter(h => h.title || h.name)
        if (pendingHabits.length > 0) {
          this.sendLocal('🔁 Habit Check-In', `You have ${pendingHabits.length} habits to complete today.`, { tag: 'habits-' + today, data: { url: '/habits' } })
          localStorage.setItem(todayKey, '1')
        }
      }
    }

    // Task reminders (9am)
    if (notifSettings.tasks && hour >= 9 && hour < 10) {
      const todayKey = 'planner.notif.tasks.' + today
      if (!localStorage.getItem(todayKey)) {
        const dueTasks = tasks.filter(t => t.date === today && !t.completed)
        if (dueTasks.length > 0) {
          this.sendLocal('✓ Tasks Due Today', `${dueTasks.length} task${dueTasks.length > 1 ? 's' : ''} due: ${dueTasks[0].title}${dueTasks.length > 1 ? ` +${dueTasks.length-1} more` : ''}`, { tag: 'tasks-' + today, data: { url: '/tasks' } })
          localStorage.setItem(todayKey, '1')
        }
      }
    }

    // Evening reflection (7pm)
    if (notifSettings.reflection && hour >= 19 && hour < 20) {
      const todayKey = 'planner.notif.reflect.' + today
      if (!localStorage.getItem(todayKey)) {
        this.sendLocal('📖 Evening Reflection', 'Take 5 minutes to journal and plan tomorrow.', { tag: 'reflect-' + today, data: { url: '/growth' } })
        localStorage.setItem(todayKey, '1')
      }
    }

    // Overdue tasks (anytime)
    if (notifSettings.overdue) {
      const overdue = tasks.filter(t => t.date && t.date < today && !t.completed)
      if (overdue.length > 0) {
        const overdueKey = 'planner.notif.overdue.' + today
        if (!localStorage.getItem(overdueKey)) {
          this.sendLocal('⚠ Overdue Tasks', `${overdue.length} overdue task${overdue.length > 1 ? 's' : ''} need your attention.`, { tag: 'overdue-' + today, data: { url: '/tasks' } })
          localStorage.setItem(overdueKey, '1')
        }
      }
    }

    // Faith morning reminder (6am)
    if (notifSettings.faith && hour >= 6 && hour < 7) {
      const todayKey = 'planner.notif.faith.' + today
      if (!localStorage.getItem(todayKey)) {
        this.sendLocal('✝ Morning Devotional', 'Start your day in the Word. Your devotional is waiting.', { tag: 'faith-' + today, data: { url: '/faith' } })
        localStorage.setItem(todayKey, '1')
      }
    }

    // Birthday reminders (8am)
    if (notifSettings.birthdays) {
      const todayKey = 'planner.notif.bday.' + today
      if (!localStorage.getItem(todayKey) && hour >= 8 && hour < 9) {
        // Birthday check done in app with actual birthday data
        localStorage.setItem(todayKey + '.checked', '1')
      }
    }
  }
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

function getGoalProgress(goalId, tasks, projects) {
  const relatedTasks = tasks.filter((task) => task.linkedGoalId === goalId)
  const relatedProjects = projects.filter((project) => project.goalId === goalId)
  const totalItems = relatedTasks.length + relatedProjects.length
  if (totalItems === 0) return 0
  const completedTasks = relatedTasks.filter((task) => task.completed).length
  const completedProjects = relatedProjects.filter((project) => project.status === 'Completed').length
  return Math.round(((completedTasks + completedProjects) / totalItems) * 100)
}

function getProjectProgress(projectId, tasks) {
  const relatedTasks = tasks.filter((task) => task.linkedProjectId === projectId)
  if (relatedTasks.length === 0) return 0
  const completed = relatedTasks.filter((task) => task.completed).length
  return Math.round((completed / relatedTasks.length) * 100)
}


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
  const scheduleCount = events.filter((event) => isToday(event.date)).length + tasks.filter((task) => isToday(task.date) && task.time).length

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
      route: '/more',
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
    delete raw.linkedType; delete raw.linkedId; delete raw.goalId
    return raw
  }

  if (type === 'goal') {
    if ('targetDate' in raw) { raw.target_date = raw.targetDate || null; delete raw.targetDate }
    delete raw.linkedType; delete raw.linkedId; delete raw.linkedGoalId; delete raw.linkedProjectId
    return raw
  }

  if (type === 'project') {
    if ('goalId' in raw) { raw.goal_id = raw.goalId ? String(raw.goalId) : null; delete raw.goalId }
    if ('dueDate' in raw) { raw.due_date = raw.dueDate || null; delete raw.dueDate }
    delete raw.linkedType; delete raw.linkedId
    return raw
  }

  if (type === 'event') {
    if ('startTime' in raw) { raw.time = raw.startTime || null; delete raw.startTime }
    if ('endTime' in raw) { raw.end_time = raw.endTime || null; delete raw.endTime }
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

  // ── Translate DB column names → JS field names ───────────────────────
  const mapRow = (type, row) => {
    if (!row) return row
    const r = { ...row }
    if (type === 'habits')    { r.title = r.name; delete r.name }
    if (type === 'tasks')     { r.linkedGoalId = r.goal_id; r.linkedProjectId = r.project_id; delete r.goal_id; delete r.project_id }
    if (type === 'goals')     { r.targetDate = r.target_date; delete r.target_date }
    if (type === 'projects')  { r.goalId = r.goal_id; r.dueDate = r.due_date; delete r.goal_id; delete r.due_date }
    if (type === 'events')    { r.startTime = r.time; r.endTime = r.end_time; delete r.time; delete r.end_time }
    if (type === 'expenses')  { r.note = r.description }
    if (type === 'habit_logs'){ r.habitId = r.habit_id; delete r.habit_id }
    return r
  }

  const mapped = {
    tasks:     (rows.tasks     || []).map(r => mapRow('tasks', r)),
    goals:     (rows.goals     || []).map(r => mapRow('goals', r)),
    projects:  (rows.projects  || []).map(r => mapRow('projects', r)),
    expenses:  (rows.expenses  || []).map(r => mapRow('expenses', r)),
    notes:     (rows.notes     || []).map(r => mapRow('notes', r)),
    events:    (rows.events    || []).map(r => mapRow('events', r)),
    habits:    (rows.habits    || []).map(r => mapRow('habits', r)),
    habitLogs: (rows.habitLogs || []).map(r => mapRow('habit_logs', r)),
  }

  return {
    ...mapped,
    budget: budgetRows?.[0] ? { weeklyTarget: Number(budgetRows[0].weekly_target) } : defaultData.budget,
    profile: profileRows?.[0] ? { displayName: profileRows[0].display_name, timezone: profileRows[0].timezone, plannerMode: profileRows[0].planner_mode } : defaultData.profile,
    settings: settingsRows?.[0] ? { onboardingComplete: settingsRows[0].onboarding_complete, showCompletedTasks: settingsRows[0].show_completed_tasks, compactCalendar: settingsRows[0].compact_calendar } : defaultData.settings,
  }
}

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
      return data
    }

    const insertPayload = { ...next }
    delete insertPayload.id
    const { data, error } = await supabase.from(meta.table).insert(insertPayload).select().single()
    if (error) throw error
    return data
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
      return data
    }
    const { data, error } = await supabase.from('habit_logs').update({ completed: !existing.completed }).eq('id', existing.id).eq('user_id', userId).select().single()
    if (error) throw error
    return data
  },

  async toggleTask(task, userId) {
    if (!hasSupabaseEnv) {
      const current = readLocal(localKeys.tasks, defaultData.tasks)
      const updatedTask = { ...task, completed: !task.completed }
      let next = current.map((item) => item.id === task.id ? updatedTask : item)
      if (!task.completed && task.recurrence && task.recurrence !== 'none') {
        const futureDate = nextRecurringDate(task.date, task.recurrence)
        if (futureDate) {
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
      if (futureDate) {
        const clonePayload = { ...task, completed: false, date: futureDate, user_id: userId }
        delete clonePayload.id
        const { data: inserted, error: insertError } = await supabase.from('tasks').insert(clonePayload).select().single()
        if (insertError) throw insertError
        extraTask = inserted
      }
    }
    return { updatedTask: data, extraTask }
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
    const row = { user_id: userId, onboarding_complete: settings.onboardingComplete, show_completed_tasks: settings.showCompletedTasks, compact_calendar: settings.compactCalendar }
    const { data, error } = await supabase.from('planner_settings').upsert(row, { onConflict: 'user_id' }).select().single()
    if (error) throw error
    return { onboardingComplete: data.onboarding_complete, showCompletedTasks: data.show_completed_tasks, compactCalendar: data.compact_calendar }
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
  const [mode, setMode] = useState(hasSupabaseEnv ? 'supabase' : 'mock')

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
    return supabase.auth.signUp({ email, password })
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

  useEffect(() => {
    if (!isAuthenticated || !user) {
      setCollections(emptyCollections); setLoading(false); return
    }
    let active = true
    setLoading(true); setError('')
    plannerService.loadAll(user.id)
      .then((data) => { if (active) setCollections(data) })
      .catch((err) => { if (active) setError(err.message || 'Failed to load data.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [isAuthenticated, user?.id, mode])

  const scores = useMemo(() => computeScores(collections), [collections])

  const saveItem = async (type, payload, modeArg = 'create') => {
    if (!user) return
    setSyncing(true); setError('')
    try {
      const saved = await plannerService.saveItem(type, payload, modeArg, user.id)
      setCollections((current) => {
        const key = plannerService.collectionName(type)
        if (modeArg === 'edit' && payload.id)
          return { ...current, [key]: current[key].map((item) => item.id === payload.id ? saved : item) }
        return { ...current, [key]: [...current[key], saved] }
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
        tasks: [...current.tasks.map((item) => item.id === taskId ? updatedTask : item), ...(extraTask ? [extraTask] : [])]
          .sort((a, b) => `${a.date}-${a.time || ''}`.localeCompare(`${b.date}-${b.time || ''}`)),
      }))
    } catch (err) {
      setError(err.message || 'Could not update task.'); throw err
    } finally { setSyncing(false) }
  }

  const toggleHabit = async (habitId, date = TODAY) => {
    if (!user) return
    setSyncing(true); setError('')
    try {
      const nextLog = await plannerService.toggleHabitLog(habitId, date, user.id, collections.habitLogs)
      setCollections((current) => {
        const existing = current.habitLogs.find((log) => log.habitId === habitId && log.date === date)
        if (!existing) return { ...current, habitLogs: [...current.habitLogs, nextLog] }
        return { ...current, habitLogs: current.habitLogs.map((log) => log.id === existing.id ? nextLog : log) }
      })
    } catch (err) {
      setError(err.message || 'Could not toggle habit.'); throw err
    } finally { setSyncing(false) }
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
    ...collections, scores, loading, syncing, error,
    saveItem, deleteItem, toggleTask, toggleHabit,
    updateBudget, updateProfile, updateSettings,
  }
}

// ── Components ────────────────────────────────────────────────────────────

function AuthGate({ children, fallback }) {
  const { loading, isAuthenticated } = useAuth()

  if (loading) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <p className="eyebrow">Loading</p>
          <h1>Checking your planner session…</h1>
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
    { icon: '✓', title: 'Tasks & Calendar', desc: 'Capture everything, schedule anything, and never miss what matters.' },
    { icon: '🎯', title: 'Goals & Projects', desc: 'Set goals that connect to your daily tasks and track real progress.' },
    { icon: '↑', title: 'Habits & Growth', desc: 'Build routines and watch your Life Score rise automatically.' },
    { icon: '💰', title: 'Finance & Budget', desc: 'Weekly spending targets, savings goals, and no-spend challenges.' },
    { icon: '💊', title: 'Health & Wellness', desc: 'Medication logs, sleep tracker, anxiety check-ins, daily routines.' },
    { icon: '🌍', title: 'Lifestyle Hub', desc: 'Groceries, contacts, trips, brain dump, passwords, birthdays.' },
  ]

  // ── Welcome screen ──────────────────────────────────────────────────────
  if (step === 'welcome') return (
    <div className="auth-shell" style={{background:'var(--navy)'}}>
      <div style={{maxWidth:460, width:'100%', padding:'0 20px', textAlign:'center'}}>
        <div style={{fontSize:'3rem', marginBottom:16}}>⚓</div>
        <p style={{color:'var(--teal)', fontSize:'.8rem', fontWeight:700, letterSpacing:'.15em', textTransform:'uppercase', marginBottom:8}}>The Living Planner</p>
        <h1 style={{color:'white', fontSize:'2rem', fontFamily:"'DM Serif Display', serif", lineHeight:1.2, marginBottom:16}}>
          Plan with clarity.<br/>Live with purpose.
        </h1>
        <p style={{color:'rgba(255,255,255,.80)', fontSize:'.95rem', lineHeight:1.7, marginBottom:32}}>
          One place for your tasks, goals, habits, finances, health, and everything in between.
        </p>
        <div style={{display:'grid', gap:10}}>
          <button onClick={() => setStep('features')}
            style={{background:'var(--teal)', color:'var(--navy)', border:'none', borderRadius:999, padding:'14px 24px', fontWeight:700, fontSize:'1rem', cursor:'pointer', fontFamily:'inherit'}}>
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
        <p style={{color:'var(--teal)', fontSize:'.75rem', fontWeight:700, letterSpacing:'.15em', textTransform:'uppercase', marginBottom:8}}>Everything in one place</p>
        <h2 style={{color:'white', fontFamily:"'DM Serif Display', serif", fontSize:'1.6rem', marginBottom:20}}>What's inside your planner</h2>
        <div style={{display:'grid', gap:10, marginBottom:28}}>
          {SECTIONS.map(s => (
            <div key={s.title} style={{background:'rgba(255,255,255,.09)', border:'1px solid rgba(184,150,90,.25)', borderRadius:'var(--radius)', padding:'12px 14px', display:'flex', gap:12, alignItems:'flex-start'}}>
              <div style={{fontSize:'1.3rem', flexShrink:0}}>{s.icon}</div>
              <div>
                <div style={{fontWeight:700, color:'#FFFFFF', fontSize:'.9rem', marginBottom:3}}>{s.title}</div>
                <div style={{fontSize:'.78rem', color:'rgba(255,255,255,.70)', lineHeight:1.5}}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{display:'grid', gap:10}}>
          <button onClick={() => setStep('signin')}
            style={{background:'var(--teal)', color:'var(--navy)', border:'none', borderRadius:999, padding:'14px 24px', fontWeight:700, fontSize:'1rem', cursor:'pointer', fontFamily:'inherit'}}>
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

        <div className="pill-row auth-mode-row">
          <button className={mode === 'mock' ? 'pill active-pill' : 'pill'} type="button" onClick={() => setMode('mock')}>
            ⚡ Demo Mode
          </button>
          <button className={mode === 'supabase' ? 'pill active-pill' : 'pill'} type="button" onClick={() => setMode('supabase')}>
            ☁ Sync Account
          </button>
        </div>

        {mode === 'mock' && (
          <div className="auth-demo-note">
            Demo mode saves to this device only. Your data stays here — no account needed. Start immediately.
          </div>
        )}

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
            {loading ? 'Working…' : mode === 'mock' ? 'Start Planning' : isSignup ? 'Create Account' : 'Sign In'}
          </button>
          {mode === 'supabase' && (
            <button type="button" className="ghost-btn" onClick={() => setIsSignup(c => !c)}>
              {isSignup ? 'Already have an account? Sign in' : 'Need an account? Sign up'}
            </button>
          )}
        </form>
      </div>
    </div>
  )
}


const tabs = [
  { to: '/', label: 'Home', icon: '⌂' },
  { to: '/tasks', label: 'Tasks', icon: '✓' },
  { to: '/calendar', label: 'Calendar', icon: '◷' },
  { to: '/growth', label: 'Growth', icon: '↑' },
  { to: '/more', label: 'More', icon: '⋯' },
]

// Additional routes not in bottom nav
const subRoutes = ['/habits', '/goals', '/finance', '/wellness', '/productivity', '/lifestyle', '/health', '/projects', '/faith']

function Layout({ children, onQuickAdd, banner, profile }) {
  const location = useLocation()
  const displayName = profile?.displayName || 'Planner'
  const { isDesktop, isMobile, isTablet } = useResponsive()

  return (
    <div className="app-shell premium-shell living-planner-shell">
      <header className="topbar premium-topbar living-planner-topbar">
        <Link to="/" className="topbar-copy" style={{textDecoration:'none'}}>
          <p className="eyebrow">The Living Planner</p>
          <p style={{color:"rgba(255,255,255,.38)",fontSize:".72rem",marginTop:1}}>{formatDateLabel(TODAY, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        </Link>

        <div className="topbar-actions">
          <div className="profile-pill">
            <span className="profile-avatar">{displayName.slice(0, 1).toUpperCase()}</span>
            <div style={{display:'flex',flexDirection:'column',gap:1}}>
              <strong style={{lineHeight:1.1}}>{displayName}</strong>
              <span style={{fontSize:'.62rem',opacity:.7}}>{profile?.plannerMode || 'Balanced'} mode</span>
            </div>
          </div>
        </div>
      </header>

      {banner}

      <div className={isDesktop ? 'app-frame desktop-frame' : isMobile ? 'app-frame mobile-frame' : 'app-frame tablet-frame'}>
        {isDesktop ? (
          <aside className="side-nav premium-card">
            <div className="side-nav-header">
              <p className="eyebrow">Navigate</p>
              <strong>Plan with clarity</strong>
            </div>
            <nav className="side-nav-links">
              {tabs.map((tab) => (
                <Link
                  key={tab.to}
                  to={tab.to}
                  className={location.pathname === tab.to ? 'side-nav-link active' : 'side-nav-link'} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',borderRadius:'var(--radius-sm)',color:location.pathname===tab.to?'var(--brass)':'var(--text2)',fontWeight:location.pathname===tab.to?700:400,textDecoration:'none',background:location.pathname===tab.to?'var(--brass-dim)':'transparent'}}
                >
                  <span className="nav-icon">{tab.icon}</span>
                  {tab.label}
                </Link>
              ))}
            </nav>
            <div className="desktop-quick-card">
              <span className="muted">Capture something fast?</span>
              <button className="primary-btn premium-btn" onClick={onQuickAdd}>Quick Add</button>
            </div>
          </aside>
        ) : null}

        <main className="content">{children}</main>
      </div>

      {!isDesktop ? (
        <nav className="bottom-nav premium-nav">
          {tabs.map((tab) => (
            <Link
              key={tab.to}
              to={tab.to}
              className={location.pathname === tab.to ? 'nav-item active' : 'nav-item'}
            >
              <span className="nav-icon">{tab.icon}</span>
              <span className="nav-label">{tab.label}</span>
            </Link>
          ))}
        </nav>
      ) : null}

      {!isDesktop ? (
        <button onClick={onQuickAdd} style={{
          position:'fixed', bottom:76, right:20, zIndex:90,
          width:52, height:52, borderRadius:'50%',
          background:'var(--brass)', color:'var(--warm-white)',
          border:'none', fontSize:'1.6rem', fontWeight:300,
          cursor:'pointer', display:'grid', placeItems:'center',
          boxShadow:'0 4px 20px var(--brass-glow)',
          lineHeight:1
        }}>+</button>
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
  event: { title: '', date: TODAY, startTime: '09:00', endTime: '10:00', category: 'Business', location: '' },
  expense: { amount: '', category: 'Bills', date: TODAY, note: '' },
  note: { title: '', content: '', linkedType: '', linkedId: '' },
  goal: { title: '', category: 'Health', targetDate: addDays(TODAY, 30), why: '', timeframe: '1yr' },
  project: { title: '', goalId: '', dueDate: addDays(TODAY, 45), status: 'Active', description: '' },
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
          </>)}

          {selectedType === 'project' && (<>
            <label>Goal<select value={form.goalId || ''} onChange={(e) => setForm({ ...form, goalId: e.target.value })}><option value="">None</option>{goals.map((goal) => <option key={goal.id} value={goal.id}>{goal.title}</option>)}</select></label>
            <label>Due Date<input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></label>
            <label>Status<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option>Active</option><option>On Hold</option><option>Completed</option></select></label>
            <label className="full-span">Description<textarea rows="5" value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
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
            <div style={{fontSize:'.62rem', color:'var(--slate)', fontWeight:600, textAlign:'center'}}>{item.label}</div>
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


function HomePage({ tasks, goals, projects, expenses, scores, budget, events, habits, habitLogs, settings, profile, onEdit, onQuickCreate }) {
  const navigate = useNavigate()
  const todayTasks = tasks.filter((task) => isToday(task.date) && (settings.showCompletedTasks || !task.completed))
  const openTasks = tasks.filter(t => !t.completed)
  const overdueTasks = tasks.filter((task) => !task.completed && isOverdue(task.date))
  const weekSpend = expenses.filter(e => !['Bills','Utilities','Rent','Insurance'].includes(e.category))
    .reduce((sum, item) => sum + Number(item.amount), 0)
  const todaySchedule = [
    ...todayTasks.filter((task) => task.time).map((task) => ({ ...task, startTime: task.time, itemType: 'task' })),
    ...events.filter((event) => event.date === TODAY).map((event) => ({ ...event, itemType: 'event' })),
  ].sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''))
  const insights = getHomeInsights({ tasks, expenses, budget, projects, goals, events, habits, habitLogs })
  const suggestions = getSmartSuggestions({ tasks, expenses, budget, projects, habits, habitLogs })
  const completionSeries = getWeekCompletionSeries(tasks)

  const firstName = profile?.displayName?.split(' ')[0] || 'there'
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const focusCopy = openTasks.filter(t => isToday(t.date) && !t.completed).slice(0, 2).map(t => t.title)
  const topGoals = goals.slice(0, 3)

  const SECTIONS = [
    { to:'/tasks',        icon:'✓',  label:'Tasks',        color:'var(--teal)',   count: openTasks.length || null },
    { to:'/calendar',     icon:'◷',  label:'Calendar',     color:'var(--slate)',  count: todaySchedule.length || null },
    { to:'/habits',       icon:'🔁', label:'Habits',       color:'var(--brass)',  count: habits.length || null },
    { to:'/goals',        icon:'🎯', label:'Goals',        color:'var(--brass)',  count: goals.length || null },
    { to:'/finance',      icon:'💰', label:'Finance',      color:'#22C55E',       count: null },
    { to:'/growth',       icon:'↑',  label:'Growth',       color:'var(--teal)',   count: null },
    { to:'/wellness',     icon:'🌿', label:'Health & Wellness', color:'#22C55E', count: null },
    { to:'/productivity', icon:'⚡', label:'Productivity', color:'#F0B429',       count: null },
    { to:'/lifestyle',    icon:'🌍', label:'Lifestyle',    color:'var(--slate)',   count: null },
    { to:'/faith',        icon:'✝',  label:'Faith',        color:'var(--brass)',   count: null },
  ]

  return (
    <div className="home-stack">

      {/* ── Personal greeting hero ─────────────────────────────────── */}
      <div className="hero-focus-card">
        <p className="eyebrow">{new Date().toLocaleDateString('en-US', {weekday:'long', month:'long', day:'numeric'})}</p>
        <h2 style={{fontSize:'1.5rem', marginBottom:6}}>{greeting}, {firstName}</h2>
        <p className="muted" style={{fontSize:'.9rem', lineHeight:1.5}}>
          {focusCopy.length > 0
            ? `Today: ${focusCopy.join(' · ')}`
            : overdueTasks.length > 0
            ? `You have ${overdueTasks.length} overdue item${overdueTasks.length > 1 ? 's' : ''} waiting.`
            : 'Your day is clear. Add something to move toward.'}
        </p>
        <div className="hero-focus-actions" style={{marginTop:14}}>
          <button className="primary-btn" style={{fontSize:'.82rem', padding:'8px 16px'}} onClick={() => onQuickCreate('task', { date: TODAY })}>+ Task</button>
          <button className="secondary-btn" style={{fontSize:'.82rem', padding:'8px 16px'}} onClick={() => onQuickCreate('event', { date: TODAY })}>+ Event</button>
          <Link className="secondary-btn" to="/calendar" style={{fontSize:'.82rem', padding:'8px 16px'}}>Day View</Link>
        </div>
      </div>

      {/* ── 4 key metrics ─────────────────────────────────────────── */}
      <div className="home-metrics-strip">
        <MetricTile label="Open Tasks" value={insights.openTasks} helper={overdueTasks.length > 0 ? `${overdueTasks.length} overdue` : 'on track'} />
        <MetricTile label="This Week" value={`${insights.completionRate}%`} helper="completion rate" />
        <MetricTile label="Budget Left" value={`$${Math.max(0, budget.weeklyTarget - weekSpend).toFixed(0)}`} helper="this week" />
        <MetricTile label="Habit Streak" value={`${insights.currentHabitStreak}d`} helper={`${insights.habitCount} active`} />
      </div>

      {/* ── Quick access to all sections ──────────────────────────── */}
      <section className="card">
        <div className="section-title-row" style={{marginBottom:12}}>
          <div><p className="eyebrow">Your Planner</p><h3>Quick Access</h3></div>
        </div>
        <div style={{display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:8}}>
          {SECTIONS.map(s => (
            <Link key={s.to} to={s.to} style={{
              display:'flex', flexDirection:'column', alignItems:'center', gap:3,
              padding:'10px 4px 8px', borderRadius:'var(--radius-sm)', background:'var(--stone)',
              border:'1px solid var(--border)', textDecoration:'none', position:'relative'
            }}>
              {s.count > 0 && (
                <div style={{position:'absolute', top:4, right:4, background:s.color, color:'white', fontSize:'.55rem', fontWeight:700, borderRadius:999, minWidth:14, height:14, display:'grid', placeItems:'center', padding:'0 3px', lineHeight:1}}>
                  {s.count}
                </div>
              )}
              <span style={{fontSize:'1rem', lineHeight:1}}>{s.icon}</span>
              <span style={{fontSize:'.65rem', fontWeight:600, color:'var(--text2)', textAlign:'center', lineHeight:1.2}}>{s.label}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Today's schedule ──────────────────────────────────────── */}
      <section className="card">
        <div className="section-title-row">
          <div><p className="eyebrow">Today Timeline</p><h3>What's on the clock</h3></div>
          <button className="ghost-btn" style={{fontSize:'.8rem'}} onClick={() => onQuickCreate('task', { date: TODAY })}>+ Task</button>
        </div>
        {todaySchedule.length === 0
          ? <p className="muted" style={{fontSize:'.85rem'}}>Nothing scheduled yet today. <button onClick={() => onQuickCreate('task', { date: TODAY })} style={{background:'none', border:'none', color:'var(--teal)', cursor:'pointer', fontFamily:'inherit', fontWeight:600, padding:0}}>Add a task →</button></p>
          : todaySchedule.slice(0, 6).map((item) => (
            <button key={`${item.itemType}-${item.id}`} className="timeline-preview premium-list-row" onClick={() => onEdit(item.itemType, item)}
              style={{width:'100%', borderBottom:'1px solid var(--surface)', padding:'9px 0'}}>
              <strong style={{color:'var(--teal)', fontSize:'.82rem', minWidth:36}}>{item.startTime}</strong>
              <span style={{flex:1, textAlign:'left', fontSize:'.9rem', color:'var(--text)', fontWeight:500}}>{item.title}</span>
              <small style={{color:'var(--muted)', fontSize:'.72rem'}}>{item.itemType === 'task' ? 'Task' : 'Event'}</small>
            </button>
          ))}
      </section>

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

      {/* ── Top goals ─────────────────────────────────────────────── */}
      {topGoals.length > 0 && (
        <section className="card">
          <div className="section-title-row">
            <div><p className="eyebrow">Goals</p><h3>In Progress</h3></div>
            <Link className="ghost-btn" to="/more" style={{fontSize:'.8rem'}}>All →</Link>
          </div>
          {topGoals.map((goal) => (
            <div key={goal.id} className="progress-block">
              <div className="metric-row compact-row" style={{padding:'5px 0'}}>
                <span style={{fontSize:'.9rem', color:'var(--text)', fontWeight:500}}>{goal.title}</span>
                <strong style={{color:'var(--brass)', fontSize:'.88rem'}}>{getGoalProgress(goal.id, tasks, projects)}%</strong>
              </div>
              <div className="mini-progress"><div style={{ width: `${getGoalProgress(goal.id, tasks, projects)}%` }} /></div>
            </div>
          ))}
        </section>
      )}

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
              <div style={{fontSize:'1.1rem', fontWeight:700, color: value >= 7 ? 'var(--success)' : value >= 5 ? 'var(--teal)' : 'var(--danger)'}}>{value}</div>
              <div style={{height:3, borderRadius:999, background:'var(--border2)', marginTop:4, overflow:'hidden'}}>
                <div style={{height:'100%', width:`${value*10}%`, background: value >= 7 ? 'var(--success)' : value >= 5 ? 'var(--teal)' : 'var(--danger)', borderRadius:999}} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Weekly execution chart ────────────────────────────────── */}
      <section className="card">
        <div className="section-title-row" style={{marginBottom:8}}>
          <div><p className="eyebrow">This Week</p><h3>Execution</h3></div>
        </div>
        <MiniBarChart data={completionSeries} dataKey="completed" maxKey="total" />
      </section>

    </div>
  )
}



function TaskItem({ task, onToggle, onEdit, onDelete }) {
  const isTaskOverdue = task.date && task.date < TODAY && !task.completed
  const priorityColor = task.priority === 'High' ? 'var(--danger)' : task.priority === 'Medium' ? 'var(--warning)' : 'var(--muted)'

  return (
    <div style={{padding:'10px 0', borderBottom:'1px solid var(--surface)', display:'flex', alignItems:'center', gap:10}}>
      {/* Complete toggle — left side circle */}
      <button onClick={() => onToggle(task.id)} style={{
        width:24, height:24, borderRadius:'50%', border:'2px solid', flexShrink:0, cursor:'pointer',
        borderColor: task.completed ? 'var(--success)' : 'var(--teal)',
        background: task.completed ? 'var(--success)' : 'transparent',
        display:'grid', placeItems:'center'
      }}>
        {task.completed && <span style={{color:'white', fontSize:'.7rem', fontWeight:700}}>✓</span>}
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
            <span style={{marginLeft:6, fontSize:'.65rem', padding:'1px 5px', borderRadius:999, background:'var(--teal-dim)', color:'var(--teal)', fontWeight:700}}>↻</span>
          }
        </div>
        <div style={{fontSize:'.72rem', color: isTaskOverdue ? 'var(--danger)' : 'var(--muted)', display:'flex', gap:6, flexWrap:'wrap', alignItems:'center'}}>
          <span style={{width:6, height:6, borderRadius:'50%', background:priorityColor, display:'inline-block', flexShrink:0}} />
          <span>{task.category}</span>
          {task.date && <span>{isTaskOverdue ? '⚠ ' : ''}{task.date}</span>}
          {task.time && <span>{task.time}</span>}
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
        if (!(settings || {}).showCompletedTasks && task.completed) return false
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
    'This Week': filtered.filter((task) => isThisWeek(task.date) && !isToday(task.date) && !isOverdue(task.date)),
    Upcoming: filtered.filter((task) => !isThisWeek(task.date) && task.date > new Date().toISOString().slice(0, 10)),
    Completed: filtered.filter((task) => task.completed),
  }

  const openCount = filtered.filter(t => !t.completed).length
  const doneCount = filtered.filter(t => t.completed).length

  return (
    <div className="screen-stack">
      {/* Compact header */}
      <section className="card" style={{padding:'12px 14px'}}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10}}>
          <div>
            <p className="eyebrow">Tasks</p>
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
            <option>All</option>
            {categories.map((item) => <option key={item}>{item}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)}
            style={{padding:'8px 6px', border:'1.5px solid var(--border2)', borderRadius:'var(--radius-sm)', fontSize:'.8rem', background:'var(--surface)', color:'var(--text2)'}}>
            <option>All</option>
            <option>Open</option>
            <option>Done</option>
          </select>
        </div>
      </section>

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
    </div>
  )
}


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


function ProjectsPage({ projects, tasks, goals, onEdit, onDelete, onQuickCreate }) {
  const [filter, setFilter] = useState('All')
  const [expandedId, setExpandedId] = useState(null)

  const STATUS_ORDER = ['Active', 'In Progress', 'On Hold', 'Completed']
  const STATUS_COLOR = {
    Active: 'var(--teal)',
    'In Progress': 'var(--warning)',
    'On Hold': 'var(--muted)',
    Completed: 'var(--success)',
  }

  const filtered = filter === 'All' ? projects : projects.filter(p => p.status === filter)

  return (
    <div className="screen-stack">

      {/* ── Header ──────────────────────────────────────────────── */}
      <section className="card" style={{padding:'12px 14px'}}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10}}>
          <div>
            <p className="eyebrow">Projects</p>
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
              borderColor: filter===s ? 'var(--teal)' : 'var(--border2)',
              background: filter===s ? 'var(--teal-dim)' : 'transparent',
              color: filter===s ? 'var(--teal)' : 'var(--muted)'
            }}>{s}</button>
          ))}
        </div>
      </section>

      {/* ── Empty state ─────────────────────────────────────────── */}
      {filtered.length === 0 && (
        <section className="card" style={{textAlign:'center', padding:'32px 20px'}}>
          <div style={{fontSize:'2rem', marginBottom:12}}>📁</div>
          <div style={{fontWeight:700, fontSize:'1rem', color:'var(--text)', marginBottom:6}}>No projects yet</div>
          <p className="muted" style={{fontSize:'.85rem', marginBottom:16}}>Projects connect your tasks and goals into focused workstreams.</p>
          <button className="primary-btn" onClick={() => onQuickCreate('project')}>Create your first project</button>
        </section>
      )}

      {/* ── Project cards ────────────────────────────────────────── */}
      {filtered.map((project) => {
        const linkedGoal = goals.find(g => g.id === project.goalId)
        const projectTasks = tasks.filter(t => t.linkedProjectId === project.id)
        const completedTasks = projectTasks.filter(t => t.completed).length
        const progress = getProjectProgress(project.id, tasks)
        const isExpanded = expandedId === project.id
        const overdueTasks = projectTasks.filter(t => !t.completed && isOverdue(t.date))

        return (
          <section key={project.id} className="card" style={{padding:'14px'}}>
            {/* Project header */}
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8}}>
              <div style={{flex:1, minWidth:0}}>
                <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:4}}>
                  <div style={{fontWeight:700, fontSize:'1rem', color:'var(--text)'}}>{project.title}</div>
                  <span style={{
                    fontSize:'.68rem', padding:'2px 8px', borderRadius:999, fontWeight:700,
                    background: (STATUS_COLOR[project.status]||'var(--muted)')+'20',
                    color: STATUS_COLOR[project.status]||'var(--muted)'
                  }}>{project.status}</span>
                </div>
                {project.description && (
                  <div style={{fontSize:'.82rem', color:'var(--muted)', lineHeight:1.5, marginBottom:6}}>{project.description}</div>
                )}
              </div>
              <div style={{display:'flex', gap:6, flexShrink:0, marginLeft:8}}>
                <button className="ghost-btn" style={{fontSize:'.75rem', padding:'4px 8px'}} onClick={() => onEdit('project', project)}>Edit</button>
                <button style={{background:'none', border:'none', color:'var(--muted)', cursor:'pointer'}} onClick={() => onDelete('project', project.id)}>✕</button>
              </div>
            </div>

            {/* Progress bar */}
            <div style={{marginBottom:8}}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4}}>
                <span style={{fontSize:'.75rem', color:'var(--muted)'}}>
                  {`${completedTasks}/${projectTasks.length} tasks · Due ${project.dueDate}`}
                </span>
                <span style={{fontSize:'.82rem', fontWeight:700, color: progress >= 100 ? 'var(--success)' : 'var(--teal)'}}>{progress}%</span>
              </div>
              <div style={{height:6, borderRadius:999, background:'var(--surface)', overflow:'hidden'}}>
                <div style={{
                  height:'100%', borderRadius:999,
                  width:`${progress}%`,
                  background: progress >= 100 ? 'var(--success)' : progress >= 60 ? 'var(--teal)' : progress >= 30 ? 'var(--warning)' : 'var(--danger)',
                  transition:'width .4s'
                }} />
              </div>
            </div>

            {/* Meta row */}
            <div style={{display:'flex', gap:12, fontSize:'.75rem', color:'var(--muted)', marginBottom:8, flexWrap:'wrap'}}>
              {linkedGoal && <span>🎯 {linkedGoal.title}</span>}
              {overdueTasks.length > 0 && <span style={{color:'var(--danger)', fontWeight:600}}>⚠ {overdueTasks.length} overdue</span>}
            </div>

            {/* Task list toggle */}
            {projectTasks.length > 0 && (
              <button onClick={() => setExpandedId(isExpanded ? null : project.id)}
                style={{background:'none', border:'none', color:'var(--teal)', cursor:'pointer', fontSize:'.8rem', fontWeight:600, fontFamily:'inherit', padding:0, marginBottom: isExpanded ? 10 : 0}}>
                {isExpanded ? '▲ Hide tasks' : `▼ Show ${projectTasks.length} task${projectTasks.length!==1?'s':''}`}
              </button>
            )}

            {/* Expanded task list */}
            {isExpanded && (
              <div style={{borderTop:'1px solid var(--surface)', paddingTop:10}}>
                {projectTasks.map(task => (
                  <div key={task.id} style={{display:'flex', alignItems:'center', gap:10, padding:'7px 0', borderBottom:'1px solid var(--surface)'}}>
                    <div style={{
                      width:18, height:18, borderRadius:'50%', border:'2px solid', flexShrink:0,
                      borderColor: task.completed ? 'var(--success)' : 'var(--teal)',
                      background: task.completed ? 'var(--success)' : 'transparent',
                      display:'grid', placeItems:'center'
                    }}>
                      {task.completed && <span style={{color:'white', fontSize:'.6rem', fontWeight:700}}>✓</span>}
                    </div>
                    <div style={{flex:1, minWidth:0}}>
                      <div style={{fontSize:'.88rem', color: task.completed ? 'var(--muted)' : 'var(--text)', fontWeight:500, textDecoration: task.completed ? 'line-through' : 'none'}}>{task.title}</div>
                      {task.date && <div style={{fontSize:'.72rem', color: isOverdue(task.date) && !task.completed ? 'var(--danger)' : 'var(--muted)'}}>{task.date}</div>}
                    </div>
                  </div>
                ))}
                <button className="ghost-btn" style={{fontSize:'.78rem', padding:'6px 12px', marginTop:8}} onClick={() => onQuickCreate('task', {linkedProjectId: project.id})}>
                  + Add task to this project
                </button>
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

// ── Quick Access Grid — shown at top of each page ─────────────────────────
function QuickAccessGrid({ tabs, activeTab, onSelect }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))',
      gap: 8,
      marginBottom: 16,
    }}>
      {tabs.map(t => {
        const active = activeTab === t.id
        // Split emoji from label
        const parts = t.label.match(/^(\S+)\s(.+)$/)
        const icon = parts ? parts[1] : t.label[0]
        const name = parts ? parts[2] : t.label
        return (
          <button key={t.id} onClick={() => onSelect(t.id)} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: 4,
            padding: '10px 4px',
            borderRadius: 12,
            border: active ? '2px solid var(--teal)' : '1.5px solid var(--border2)',
            background: active ? 'var(--teal)' : 'var(--stone)',
            cursor: 'pointer',
            transition: 'all .15s ease',
            minHeight: 68,
          }}>
            <span style={{ fontSize: '1.3rem', lineHeight: 1 }}>{icon}</span>
            <span style={{
              fontSize: '.68rem', fontWeight: 600,
              color: active ? 'white' : 'var(--ink2)',
              textAlign: 'center', lineHeight: 1.2,
              letterSpacing: '.02em',
            }}>{name}</span>
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
      marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border)',
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
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--teal)'; e.currentTarget.style.color = 'var(--teal)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.color = 'var(--ink2)' }}
        >
          ← {prev.label}
        </button>
      ) : <div />}
      {next ? (
        <button onClick={() => onSelect(next.id)} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '9px 16px', borderRadius: 999,
          border: '1.5px solid var(--teal)', background: 'var(--teal)',
          color: 'white', fontSize: '.82rem', fontWeight: 600,
          cursor: 'pointer', transition: 'all .15s',
        }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '.85' }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
        >
          {next.label} →
        </button>
      ) : <div />}
    </div>
  )
}




function FinancePage({ expenses, budget, setBudget }) {
  const lsGet = (k, d) => { try { const v = localStorage.getItem('planner.f.' + k); return v ? JSON.parse(v) : d } catch { return d } }
  const lsSet = (k, v) => { try { localStorage.setItem('planner.f.' + k, JSON.stringify(v)) } catch {} }

  const [tab, setTab] = useState('overview')
  const [period, setPeriod] = useState('monthly')

  // ── Shared state (linked across tabs) ─────────────────────────────────
  const [incomes, setIncomes] = useState(() => lsGet('incomes', []))
  const [newIncome, setNewIncome] = useState({ label: '', amount: '', category: 'Primary', period: 'monthly' })
  const saveIncomes = (v) => { setIncomes(v); lsSet('incomes', v) }

  const [bills, setBills] = useState(() => lsGet('bills', []))
  const [newBill, setNewBill] = useState({ label: '', amount: '', category: 'Need' })
  const saveBills = (v) => { setBills(v); lsSet('bills', v) }

  const [debts, setDebts] = useState(() => lsGet('debts', []))
  const [newDebt, setNewDebt] = useState({ name: '', balance: '', rate: '', minPayment: '' })
  const saveDebts = (d) => { setDebts(d); lsSet('debts', d) }

  const [savingsGoals, setSavingsGoals] = useState(() => lsGet('savingsGoals', [
    { id: 1, label: 'Emergency Fund', goal: 1000, current: 0, color: 'var(--teal)' },
  ]))
  const [newSavings, setNewSavings] = useState({ label: '', goal: '', current: '' })
  const [editingSavings, setEditingSavings] = useState({})
  const saveSavingsGoals = (v) => { setSavingsGoals(v); lsSet('savingsGoals', v) }

  const [noSpend, setNoSpend] = useState(() => lsGet('noSpend', { days: 30, checked: [] }))
  const saveNoSpend = (n) => { setNoSpend(n); lsSet('noSpend', n) }

  const [monthlyIncome, setMonthlyIncome] = useState(() => lsGet('monthlyIncome', 0))
  const saveMonthlyIncome = (v) => { setMonthlyIncome(v); lsSet('monthlyIncome', v) }

  // 52-week plan
  const WEEK_PLAN = [150,200,150,250,200,150,200,250,150,200,150,250,200,150,200,250,150,200,150,200,250,150,200,150,200,250,150,200,150,250,200,150,200,250,150,200,150,250,200,150,200,250,150,200,150,200,250,150,200,150,200,250]
  const currentWeekNum = Math.ceil((new Date(TODAY) - new Date(new Date(TODAY).getFullYear(), 0, 1)) / (7 * 24 * 60 * 60 * 1000))
  const [checkedWeeks, setCheckedWeeks] = useState(() => lsGet('weekPlan', []))
  const [challengeGoal, setChallengeGoal] = useState(() => lsGet('challengeGoal', 10000))
  const saveCheckedWeeks = (v) => { setCheckedWeeks(v); lsSet('weekPlan', v) }
  const saveChallengeGoal = (v) => { setChallengeGoal(v); lsSet('challengeGoal', v) }
  const toggleWeek = (w) => saveCheckedWeeks(checkedWeeks.includes(w) ? checkedWeeks.filter(x => x !== w) : [...checkedWeeks, w])
  const totalSavedSoFar = checkedWeeks.reduce((s, w) => s + (WEEK_PLAN[w - 1] || 0), 0)

  // ── Shared computations (linked across all tabs) ───────────────────────
  const PERIOD_MULT = { weekly: 1, monthly: 4.33, quarterly: 13, yearly: 52 }
  const totalWeeklyIncome = incomes.reduce((s, inc) => {
    return s + Number(inc.amount || 0) / (PERIOD_MULT[inc.period] || 4.33)
  }, 0)
  const getIncomeForPeriod = (p) => totalWeeklyIncome * (PERIOD_MULT[p] || 4.33)
  const totalIncomeForPeriod = getIncomeForPeriod(period)

  const fpWeekStart = startOfWeek(TODAY)
  const fpWeekEnd = endOfWeek(TODAY)
  const fpWeekExpenses = (expenses || []).filter(e => e.date >= fpWeekStart && e.date <= fpWeekEnd)
  const fpWeekSpend = fpWeekExpenses.reduce((s, e) => s + parseFloat(e.amount || 0), 0)
  const fpMonthExpenses = (expenses || []).filter(e => e.date && e.date.slice(0, 7) === TODAY.slice(0, 7))
  const fpMonthSpend = fpMonthExpenses.reduce((s, e) => s + parseFloat(e.amount || 0), 0)

  const totalBillsMonthly = bills.reduce((s, b) => s + Number(b.amount || 0), 0)
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
    { id: 'bank', label: '🏦 Bank Link' },
    { id: 'income', label: '💵 Income' },
    { id: 'expenses', label: '💳 Expenses & Bills' },
    { id: 'savings', label: '💰 Savings' },
    { id: 'debt', label: '📉 Debt' },
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
      <div style={{display:'flex',alignItems:'center',gap:8,paddingBottom:2}}>
        <span style={{fontSize:'1.1rem'}}>💰</span>
        <p style={{fontSize:'.62rem',fontWeight:700,letterSpacing:'.12em',textTransform:'uppercase',color:'var(--brass)',margin:0}}>Finance</p>
      </div>
      <QuickAccessGrid tabs={TABS} activeTab={tab} onSelect={setTab} />

      {/* ── OVERVIEW ─────────────────────────────────────────────────────── */}
      {tab === 'overview' && (
        <section className="card">
          <p className="eyebrow">Financial Overview</p>
          <h3 style={{ margin: '4px 0 14px' }}>Your Money at a Glance</h3>
          <PeriodPills />
          {[
            ['Total Income', fmt(totalIncomeForPeriod), 'var(--success)'],
            ['Total Bills', fmt(totalBillsForPeriod), 'var(--danger)'],
            ['Expenses (tracked)', fmt(fpWeekSpend * (PERIOD_MULT[period]||4.33)), 'var(--warning,#f90)'],
            ['Debt Min Payments', fmt(totalDebtPayments * ((PERIOD_MULT[period]||4.33)/4.33)), 'var(--danger)'],
            ['Net Available', fmt(totalIncomeForPeriod - totalBillsForPeriod - fpWeekSpend * (PERIOD_MULT[period]||4.33)), totalIncomeForPeriod > totalBillsForPeriod ? 'var(--success)' : 'var(--danger)'],
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
            <p className="muted" style={{fontSize:'.78rem',marginBottom:12}}>Based on your {period} income of {fmt(totalIncomeForPeriod)}</p>
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
      {tab === 'bank' && (
        <div>
          {/* Security banner */}
          <section className="card" style={{background:'var(--ink)',border:'none'}}>
            <div style={{display:'flex',gap:12,alignItems:'flex-start'}}>
              <div style={{fontSize:'2rem',flexShrink:0}}>🔒</div>
              <div>
                <p className="eyebrow" style={{color:'var(--brass)'}}>Bank-Level Security</p>
                <h3 style={{color:'var(--warm-white)',margin:'4px 0 8px'}}>Your credentials stay private</h3>
                <p style={{color:'rgba(255,255,255,.7)',fontSize:'.82rem',lineHeight:1.6,margin:0}}>
                  We use <strong style={{color:'var(--brass)'}}>Plaid</strong> — the same technology trusted by Venmo, Robinhood, and 7,000+ apps. You log in directly through Plaid's secure interface. We never see your bank username or password. Ever.
                </p>
              </div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginTop:14}}>
              {[
                ['256-bit', 'Encryption'],
                ['SOC 2', 'Certified'],
                ['Read-only', 'Access'],
              ].map(([val,label]) => (
                <div key={label} style={{textAlign:'center',padding:'10px 8px',background:'rgba(255,255,255,.06)',borderRadius:8}}>
                  <div style={{fontWeight:700,color:'var(--brass)',fontSize:'1rem'}}>{val}</div>
                  <div style={{fontSize:'.7rem',color:'rgba(255,255,255,.5)',marginTop:2}}>{label}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Connected accounts */}
          <section className="card">
            <p className="eyebrow">Connected Accounts</p>
            <h3 style={{margin:'4px 0 14px'}}>Your Banks</h3>

            {connectedBanks.length === 0 ? (
              <div style={{textAlign:'center',padding:'24px 0'}}>
                <div style={{fontSize:'3rem',marginBottom:12}}>🏦</div>
                <p style={{fontWeight:600,fontSize:'.9rem',marginBottom:6}}>No banks connected yet</p>
                <p className="muted" style={{fontSize:'.82rem',marginBottom:20,lineHeight:1.5}}>
                  Connect your bank to automatically import income and expenses into your planner.
                </p>
                <button className="primary-btn" style={{fontSize:'.9rem',padding:'12px 24px'}}
                  onClick={async () => {
                    setBankLoading(true)
                    setBankError('')
                    try {
                      // In production: fetch Plaid link token from /api/plaid/link-token
                      // For now show the setup instructions
                      setBankError('SETUP_NEEDED')
                    } catch(e) { setBankError(e.message) } finally { setBankLoading(false) }
                  }}>
                  {bankLoading ? 'Connecting...' : '+ Connect a Bank'}
                </button>

                {bankError === 'SETUP_NEEDED' && (
                  <div style={{marginTop:16,padding:'14px',background:'var(--stone)',borderRadius:10,textAlign:'left'}}>
                    <p style={{fontWeight:600,fontSize:'.85rem',marginBottom:8}}>Setup Required</p>
                    <p className="muted" style={{fontSize:'.8rem',lineHeight:1.6,marginBottom:0}}>
                      To activate bank linking, add your Plaid API keys to Vercel environment variables. See the setup guide below.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div>
                {connectedBanks.map((bank, i) => (
                  <div key={bank.id} style={{padding:'14px',background:'var(--stone)',borderRadius:10,marginBottom:10}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                      <div>
                        <div style={{fontWeight:700,fontSize:'.9rem'}}>{bank.name}</div>
                        <div className="muted" style={{fontSize:'.75rem'}}>••••{bank.last4} · {bank.type}</div>
                      </div>
                      <div style={{display:'flex',gap:8,alignItems:'center'}}>
                        <div style={{width:8,height:8,borderRadius:'50%',background:'var(--success)'}} />
                        <span style={{fontSize:'.75rem',color:'var(--success)'}}>Active</span>
                      </div>
                    </div>
                    <div style={{display:'flex',gap:8}}>
                      <button onClick={() => fetchBankTransactions(bank.id)}
                        style={{flex:1,padding:'8px',borderRadius:8,border:'1.5px solid var(--teal)',
                        background:'none',color:'var(--teal)',cursor:'pointer',fontSize:'.82rem',fontWeight:600}}>
                        {bankLoading ? '⟳ Syncing...' : '↻ Sync Now'}
                      </button>
                      <button onClick={() => saveBanks(connectedBanks.filter((_,j)=>j!==i))}
                        style={{padding:'8px 12px',borderRadius:8,border:'1.5px solid var(--border2)',
                        background:'none',color:'var(--muted)',cursor:'pointer',fontSize:'.82rem'}}>
                        Disconnect
                      </button>
                    </div>
                  </div>
                ))}
                <button className="primary-btn" style={{width:'100%',fontSize:'.85rem',marginTop:4}}>
                  + Add Another Account
                </button>
              </div>
            )}
          </section>

          {/* Auto-import settings */}
          <section className="card">
            <p className="eyebrow">Auto-Import Settings</p>
            <h3 style={{margin:'4px 0 14px'}}>What to Import Automatically</h3>
            {[
              {key:'income', label:'Income & Deposits', desc:'Credits and deposits auto-added to Income tab', icon:'💵'},
              {key:'expenses', label:'Purchases & Payments', desc:'Debits auto-added to Expenses & category breakdown', icon:'💳'},
            ].map(item => (
              <div key={item.key} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 0',borderBottom:'1px solid var(--border)'}}>
                <div style={{display:'flex',gap:10,alignItems:'center'}}>
                  <span style={{fontSize:'1.2rem'}}>{item.icon}</span>
                  <div>
                    <div style={{fontWeight:600,fontSize:'.88rem'}}>{item.label}</div>
                    <div className="muted" style={{fontSize:'.72rem'}}>{item.desc}</div>
                  </div>
                </div>
                <button onClick={() => saveAutoImport({...autoImport,[item.key]:!autoImport[item.key]})}
                  style={{width:44,height:24,borderRadius:999,border:'none',cursor:'pointer',
                  background:autoImport[item.key]?'var(--teal)':'var(--border2)',position:'relative',transition:'background .2s',flexShrink:0}}>
                  <div style={{position:'absolute',top:3,left:autoImport[item.key]?23:3,width:18,height:18,
                    borderRadius:'50%',background:'white',transition:'left .2s',boxShadow:'0 1px 3px rgba(0,0,0,.2)'}} />
                </button>
              </div>
            ))}
          </section>

          {/* Recent imported transactions */}
          {bankTransactions.length > 0 && (
            <section className="card">
              <p className="eyebrow">Recent Imports</p>
              <h3 style={{margin:'4px 0 14px'}}>Imported Transactions</h3>
              {bankTransactions.slice(0,20).map((tx,i) => {
                const isIncome = Number(tx.amount) < 0
                return (
                  <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:'1px solid var(--border)'}}>
                    <div>
                      <div style={{fontWeight:600,fontSize:'.88rem'}}>{tx.name}</div>
                      <div className="muted" style={{fontSize:'.75rem'}}>{tx.date} · {tx.category?.[0] || 'Uncategorized'}</div>
                    </div>
                    <strong style={{color:isIncome?'var(--success)':'var(--danger)'}}>
                      {isIncome ? '+' : '-'}${Math.abs(tx.amount).toFixed(2)}
                    </strong>
                  </div>
                )
              })}
            </section>
          )}

          {/* Plaid setup guide */}
          <section className="card" style={{background:'var(--stone)'}}>
            <p className="eyebrow">Developer Setup</p>
            <h3 style={{margin:'4px 0 10px',fontSize:'.95rem'}}>Activate Bank Linking</h3>
            <p className="muted" style={{fontSize:'.8rem',marginBottom:12,lineHeight:1.5}}>To enable live bank connections, complete these steps:</p>
            {[
              ['1', 'Create a free account at plaid.com/developers'],
              ['2', 'Get your Client ID and Secret from the Plaid dashboard'],
              ['3', 'Add to Vercel env vars: PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV=sandbox'],
              ['4', 'Deploy the /api/plaid/ serverless functions (provided separately)'],
              ['5', 'Switch from sandbox → production when ready to launch'],
            ].map(([num, step]) => (
              <div key={num} style={{display:'flex',gap:10,marginBottom:8,alignItems:'flex-start'}}>
                <div style={{width:22,height:22,borderRadius:'50%',background:'var(--brass)',color:'var(--ink)',
                  display:'flex',alignItems:'center',justifyContent:'center',fontSize:'.75rem',fontWeight:700,flexShrink:0}}>{num}</div>
                <p style={{fontSize:'.8rem',color:'var(--ink2)',lineHeight:1.5,margin:0}}>{step}</p>
              </div>
            ))}
          </section>
        </div>
      )}

      {tab === 'income' && (
        <section className="card">
          <p className="eyebrow">Income Tracker</p>
          <h3 style={{ margin: '4px 0 14px' }}>Your Income Sources</h3>
          <PeriodPills />
          <div style={{background:'var(--stone)',borderRadius:10,padding:'14px',marginBottom:16,display:'flex',justifyContent:'space-between'}}>
            <div>
              <p className="muted" style={{fontSize:'.75rem',margin:'0 0 2px'}}>Total {period} income</p>
              <strong style={{fontSize:'1.4rem',color:'var(--success)'}}>{fmt(totalIncomeForPeriod)}</strong>
            </div>
            <div style={{textAlign:'right'}}>
              <p className="muted" style={{fontSize:'.75rem',margin:'0 0 2px'}}>Weekly average</p>
              <strong style={{fontSize:'1rem'}}>{fmt(totalWeeklyIncome)}</strong>
            </div>
          </div>
          {incomes.length === 0 && <p className="muted" style={{textAlign:'center',padding:'16px 0'}}>No income sources yet.</p>}
          {incomes.map((inc, i) => (
            <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:'1px solid var(--border)'}}>
              <div>
                <div style={{fontWeight:600,fontSize:'.9rem'}}>{inc.label}</div>
                <div className="muted" style={{fontSize:'.75rem'}}>{inc.category} · {inc.period}</div>
              </div>
              <div style={{textAlign:'right'}}>
                <div style={{fontWeight:700,color:'var(--success)'}}>{fmt(Number(inc.amount||0) / (PERIOD_MULT[inc.period]||4.33) * (PERIOD_MULT[period]||4.33))}</div>
                <div className="muted" style={{fontSize:'.72rem'}}>{fmt(inc.amount)} / {inc.period}</div>
              </div>
              <button onClick={() => saveIncomes(incomes.filter((_,j)=>j!==i))}
                style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',fontSize:'1.1rem',marginLeft:8}}>✕</button>
            </div>
          ))}
          <div style={{marginTop:16,display:'grid',gap:8}}>
            <p style={{fontWeight:600,fontSize:'.85rem',margin:0}}>Add Income Source</p>
            <input placeholder="Label (e.g. Salary, Freelance)" value={newIncome.label}
              onChange={e=>setNewIncome(p=>({...p,label:e.target.value}))}
              style={{padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.85rem'}} />
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              <input placeholder="Amount ($)" type="number" value={newIncome.amount}
                onChange={e=>setNewIncome(p=>({...p,amount:e.target.value}))}
                style={{padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.85rem'}} />
              <select value={newIncome.period} onChange={e=>setNewIncome(p=>({...p,period:e.target.value}))}
                style={{padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.85rem'}}>
                {['weekly','monthly','quarterly','yearly'].map(o=><option key={o} value={o}>{o.charAt(0).toUpperCase()+o.slice(1)}</option>)}
              </select>
            </div>
            <select value={newIncome.category} onChange={e=>setNewIncome(p=>({...p,category:e.target.value}))}
              style={{padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.85rem'}}>
              {['Primary','Side Hustle','Passive','Investment','Business','Other'].map(c=><option key={c}>{c}</option>)}
            </select>
            <button className="primary-btn" onClick={() => {
              if (!newIncome.label || !newIncome.amount) return
              saveIncomes([...incomes, { ...newIncome, id: Date.now() }])
              setNewIncome({ label: '', amount: '', category: 'Primary', period: 'monthly' })
            }}>+ Add Income</button>
          </div>
        </section>
      )}

      {/* ── EXPENSES & BILLS ─────────────────────────────────────────────── */}
      {tab === 'expenses' && (
        <div>
          {/* Bills section — moved here from Budget */}
          <section className="card">
            <p className="eyebrow">Fixed Bills</p>
            <h3 style={{ margin: '4px 0 10px' }}>Monthly Recurring Expenses</h3>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:'2px solid var(--border)',marginBottom:6}}>
              <strong style={{fontSize:'.85rem'}}>Total Monthly Bills</strong>
              <strong style={{color:'var(--danger)',fontSize:'1rem'}}>{fmt(totalBillsMonthly)}</strong>
            </div>
            {bills.length === 0 && <p className="muted" style={{textAlign:'center',padding:'12px 0',fontSize:'.85rem'}}>No bills added yet.</p>}
            {bills.map((b, i) => (
              <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'1px solid var(--border)'}}>
                <div>
                  <span style={{fontWeight:600,fontSize:'.88rem'}}>{b.label}</span>
                  {b.category && <span className="muted" style={{fontSize:'.72rem',marginLeft:6}}>{b.category}</span>}
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
              <select value={newBill.category} onChange={e=>setNewBill(p=>({...p,category:e.target.value}))}
                style={{padding:'8px 10px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.82rem'}}>
                {['Need','Utility','Insurance','Subscription','Debt Payment','Other'].map(c=><option key={c}>{c}</option>)}
              </select>
              <button className="primary-btn" onClick={() => {
                if (!newBill.label || !newBill.amount) return
                saveBills([...bills, { ...newBill, id: Date.now() }])
                setNewBill({ label: '', amount: '', category: 'Need' })
              }}>+ Add Bill</button>
            </div>
          </section>

          {/* Variable expenses from expense log */}
          <section className="card">
            <p className="eyebrow">Variable Expenses</p>
            <h3 style={{ margin: '4px 0 10px' }}>Tracked Spending</h3>
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
            {(expenses||[]).length === 0 && <p className="muted" style={{textAlign:'center',padding:'12px 0'}}>No expenses logged yet. Add them from Quick Add.</p>}
            {(expenses||[]).slice().sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,20).map((exp, i) => (
              <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'1px solid var(--border)'}}>
                <div>
                  <div style={{fontWeight:600,fontSize:'.88rem'}}>{exp.description || exp.category}</div>
                  <div className="muted" style={{fontSize:'.75rem'}}>{exp.category} · {exp.date}</div>
                </div>
                <strong style={{color:'var(--danger)'}}>{fmt(exp.amount)}</strong>
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
      )}

      {/* ── SAVINGS ──────────────────────────────────────────────────────── */}
      {tab === 'savings' && (
        <div>
          <section className="card">
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
      )}
      {tab === 'debt' && (
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
          {debts.length === 0 && <p className="muted" style={{ textAlign: 'center', padding: '20px 0' }}>No debts added yet.</p>}
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
      )}

      {/* ── BUDGET PLAN ──────────────────────────────────────────────────── */}
      {tab === 'budget' && (
        <div>
          {/* Summary pulled from all tabs */}
          <section className="card">
            <p className="eyebrow">Budget Plan</p>
            <h3 style={{ margin: '4px 0 14px' }}>Monthly Cash Flow</h3>
            <PeriodPills />
            {[
              ['Total Income', fmt(totalIncomeForPeriod), 'var(--success)', '+'],
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
            <p className="muted" style={{fontSize:'.8rem',marginBottom:14}}>Based on your {period} income of <strong>{fmt(totalIncomeForPeriod)}</strong></p>
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
      )}
      <TabNav tabs={TABS} activeTab={tab} onSelect={setTab} />
    </div>
  )
}




// ── WELLNESS PAGE ─────────────────────────────────────────────────────────
function HealthWellnessPage() {
  // ── Shared ─────────────────────────────────────────────────────────────
  const lsGet = (k, d) => { try { const v = localStorage.getItem('planner.hw.' + k); return v ? JSON.parse(v) : d } catch { return d } }
  const lsSet = (k, v) => { try { localStorage.setItem('planner.hw.' + k, JSON.stringify(v)) } catch {} }

  // ── Wellness state ──────────────────────────────────────────────────────

  const [books, setBooks] = useState(() => lsGet('books', []))
  const [newBook, setNewBook] = useState({ title: '', author: '', status: 'Reading' })
  const [routine, setRoutine] = useState(() => lsGet('routine', []))
  const [newRoutineItem, setNewRoutineItem] = useState({ time: '', label: '', type: 'morning' })
  const [routineLog, setRoutineLog] = useState(() => lsGet('routineLog', {}))
  const [wellnessLog, setWellnessLog] = useState(() => lsGet('wellnessLog', {}))
  const [journalEntries, setJournalEntries] = useState(() => lsGet('journal', []))
  const [journalText, setJournalText] = useState('')
  const [journalPrompt, setJournalPrompt] = useState(0)

  const saveBooks = (b) => { setBooks(b); lsSet('books', b) }
  const saveRoutine = (r) => { setRoutine(r); lsSet('routine', r) }
  const saveLog = (l) => { setRoutineLog(l); lsSet('routineLog', l) }
  const saveWellness = (w) => { setWellnessLog(w); lsSet('wellnessLog', w) }
  const saveJournal = (j) => { setJournalEntries(j); lsSet('journal', j) }

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

  const STATUS_COLORS = { Reading: 'var(--teal)', Completed: 'var(--success)', 'Want to Read': 'var(--brass)' }


  // ── Health state ────────────────────────────────────────────────────────
  const [tab, setTab] = useState('mood')
  
  

  // tab state above
  const [metricsLog, setMetricsLog] = useState(() => { try { const v = localStorage.getItem('planner.h.metrics'); return v ? JSON.parse(v) : [] } catch { return [] } })
  const [newMetric, setNewMetric] = useState({ weight: '', bp: '', heartRate: '', waist: '', notes: '' })
  const saveMetrics = (m) => { setMetricsLog(m); try { localStorage.setItem('planner.h.metrics', JSON.stringify(m)) } catch {} }
  const [meds, setMeds] = useState(() => lsGet('meds', []))
  const [medLog, setMedLog] = useState(() => lsGet('medLog', {}))
  const [anxiety, setAnxiety] = useState(() => lsGet('anxiety', []))
  const [migraines, setMigraines] = useState(() => lsGet('migraines', []))
  const [sleep, setSleep] = useState(() => lsGet('sleep', []))
  const [form, setForm] = useState({})

  const saveMeds = (m) => { setMeds(m); lsSet('meds', m) }
  const saveMedLog = (l) => { setMedLog(l); lsSet('medLog', l) }
  const saveAnxiety = (a) => { setAnxiety(a); lsSet('anxiety', a) }
  const saveMigraines = (m) => { setMigraines(m); lsSet('migraines', m) }
  const saveSleep = (s) => { setSleep(s); lsSet('sleep', s) }

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
    {id:'mood',label:'😊 Mood'},{id:'sleep',label:'😴 Sleep'},
    {id:'journal',label:'✍ Journal'},{id:'routine',label:'🌅 Routine'},
    {id:'reading',label:'📚 Reading'},{id:'meds',label:'💊 Medications'},
    {id:'metrics',label:'📈 Body Metrics'},{id:'anxiety',label:'🧘 Anxiety'},
    {id:'migraines',label:'🤕 Migraines'},{id:'coping',label:'🛡 Coping Skills'},
  ]

  return (
    <div className="screen-stack">
      <div style={{display:'flex',alignItems:'center',gap:8,paddingBottom:2}}>
        <span style={{fontSize:'1.1rem'}}>🌿</span>
        <p style={{fontSize:'.62rem',fontWeight:700,letterSpacing:'.12em',textTransform:'uppercase',color:'var(--brass)',margin:0}}>Health & Wellness</p>
      </div>

      <QuickAccessGrid tabs={TABS} activeTab={tab} onSelect={setTab} />

      {/* ── Mood ─────────────────────────────────────────────────── */}
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
                  <div style={{fontSize:'.62rem',fontWeight:600,color:todayWellness.mood===m.value?'var(--brass)':'var(--muted)'}}>{m.label}</div>
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
            <p className="eyebrow">Energy Level</p>
            <h3 style={{margin:'4px 0 12px'}}>Rate your energy today</h3>
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
              {[1,2,3,4,5,6,7,8,9,10].map(n => (
                <button key={n} onClick={() => logWellness('energy', n)} style={{
                  width:36,height:36,borderRadius:'var(--radius-sm)',border:'1.5px solid',cursor:'pointer',
                  fontWeight:700,fontSize:'.85rem',fontFamily:'var(--sans)',
                  borderColor: todayWellness.energy===n ? 'var(--brass)' : 'var(--border2)',
                  background: todayWellness.energy===n ? 'var(--brass)' : 'var(--stone)',
                  color: todayWellness.energy===n ? 'white' : 'var(--ink2)'
                }}>{n}</button>
              ))}
            </div>
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
      )}

      {/* ── Routine ──────────────────────────────────────────────── */}
      {tab === 'routine' && (
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
      )}

      {/* ── Reading ──────────────────────────────────────────────── */}
      {tab === 'reading' && (
        <section className="card">
          <div className="section-title-row">
            <div><p className="eyebrow">Reading Tracker</p><h3>Your Library</h3></div>
          </div>
          {books.map((book,i) => (
            <div key={i} style={{padding:'10px 0',borderBottom:'1px solid var(--stone2)'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                <div style={{flex:1}}>
                  <div style={{fontWeight:600,fontSize:'.9rem',color:'var(--ink)'}}>{book.title}</div>
                  <div style={{fontSize:'.75rem',color:'var(--muted)',marginTop:2}}>{book.author}</div>
                </div>
                <div style={{display:'flex',gap:6,flexShrink:0,alignItems:'center'}}>
                  <span style={{fontSize:'.68rem',padding:'2px 8px',borderRadius:999,background:(STATUS_COLORS[book.status]||'var(--muted)')+'22',color:STATUS_COLORS[book.status]||'var(--muted)',fontWeight:700}}>{book.status}</span>
                  <button onClick={()=>saveBooks(books.filter((_,j)=>j!==i))} style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer'}}>✕</button>
                </div>
              </div>
            </div>
          ))}
          {books.length === 0 && <p className="muted" style={{fontSize:'.85rem',marginBottom:12}}>No books yet. Add your first.</p>}
          <div style={{display:'grid',gap:8,marginTop:12}}>
            <input placeholder="Book title" value={newBook.title} onChange={e=>setNewBook(p=>({...p,title:e.target.value}))}
              style={{padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.88rem',background:'var(--stone)',color:'var(--text)'}} />
            <div style={{display:'flex',gap:8}}>
              <input placeholder="Author" value={newBook.author} onChange={e=>setNewBook(p=>({...p,author:e.target.value}))}
                style={{flex:1,padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.85rem',background:'var(--stone)',color:'var(--text)'}} />
              <select value={newBook.status} onChange={e=>setNewBook(p=>({...p,status:e.target.value}))}
                style={{flex:1,padding:'9px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.85rem',background:'var(--stone)',color:'var(--text)'}}>
                <option>Reading</option><option>Want to Read</option><option>Completed</option>
              </select>
            </div>
            <button className="primary-btn" onClick={()=>{
              if(!newBook.title)return
              saveBooks([...books,{...newBook,id:Date.now()}])
              setNewBook({title:'',author:'',status:'Reading'})
            }}>Add Book</button>
          </div>
        </section>
      )}

      {tab === 'meds' && (
        <>
          <section className="card">
            <p className="eyebrow">Today's Medications</p>
            <h3 style={{ margin: '4px 0 14px' }}>Medication Log — {TODAY}</h3>
            {meds.map((med, i) => {
              const taken = todayMeds.includes(med.name)
              return (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--surface)' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '.9rem', color: taken ? 'var(--muted)' : 'var(--text)', textDecoration: taken ? 'line-through' : 'none' }}>{med.name}</div>
                    <div style={{ fontSize: '.75rem', color: 'var(--muted)' }}>{med.dose} · {med.time} · {med.type}</div>
                  </div>
                  <button onClick={() => saveMedLog({ ...medLog, [todayMedKey]: taken ? todayMeds.filter(n => n !== med.name) : [...todayMeds, med.name] })}
                    style={{ padding: '6px 14px', borderRadius: 999, border: '1.5px solid', cursor: 'pointer', fontSize: '.82rem', fontWeight: 700, fontFamily: 'inherit',
                      borderColor: taken ? 'var(--success)' : 'var(--teal)',
                      background: taken ? 'rgba(34,197,94,.1)' : 'var(--teal)',
                      color: taken ? 'var(--success)' : 'var(--navy)' }}>
                    {taken ? '✓ Taken' : 'Take'}
                  </button>
                </div>
              )
            })}
            {meds.length === 0 && <p className="muted" style={{ fontSize: '.85rem' }}>No medications added yet.</p>}
          </section>
          <section className="card">
            <p className="eyebrow">Medication Summary</p>
            <h3 style={{ margin: '4px 0 12px' }}>Add Medication / Supplement</h3>
            <div style={{ display: 'grid', gap: 8 }}>
              {[['Name', 'medName', 'text', 'e.g. Vitamin D, Metformin'], ['Dose', 'medDose', 'text', 'e.g. 500mg'], ['Time', 'medTime', 'text', 'e.g. Morning, With food']].map(([lbl, key, type, ph]) => (
                <input key={key} type={type} placeholder={`${lbl} — ${ph}`} value={form[key] || ''} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                  style={{ padding: '9px 12px', border: '1.5px solid var(--border2)', borderRadius: 'var(--radius-sm)', fontSize: '.85rem' }} />
              ))}
              <button className="primary-btn" onClick={() => {
                if(!form.medName) return
                saveMeds([...meds, {name:form.medName, dose:form.medDose||'', time:form.medTime||'', notes:form.medNotes||''}])
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
      )}

      {tab === 'sleep' && (
        <section className="card">
          <p className="eyebrow">Sleep Tracker</p>
          <h3 style={{ margin: '4px 0 12px' }}>Sleep Log</h3>
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
      )}

      {tab === 'anxiety' && (
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
      )}

      {tab === 'migraines' && (
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
      )}

      {tab === 'coping' && (
        <section className="card">
          <p className="eyebrow">Coping Skills</p>
          <h3 style={{margin:'4px 0 12px'}}>Your Toolkit</h3>
          {Object.entries(COPING_SKILLS).map(([category, skills]) => (
            <div key={category} style={{marginBottom:18}}>
              <div style={{fontSize:'.7rem', fontWeight:700, letterSpacing:'.1em', textTransform:'uppercase', color:'var(--brass)', marginBottom:8}}>{category}</div>
              <div style={{display:'flex', flexWrap:'wrap', gap:6}}>
                {skills.map(skill => (
                  <span key={skill} style={{
                    padding:'6px 12px', borderRadius:999,
                    border:'1.5px solid var(--border2)',
                    background:'var(--stone)', color:'var(--ink2)',
                    fontSize:'.78rem', fontWeight:500,
                    display:'inline-block'
                  }}>{skill}</span>
                ))}
              </div>
            </div>
          ))}
          <div style={{marginTop:8, padding:'10px 12px', background:'var(--teal-dim)', borderRadius:'var(--radius-sm)', fontSize:'.78rem', color:'var(--text2)', lineHeight:1.6}}>
            💡 These are tools — use what works for you in the moment.
          </div>
        </section>
      )}

      {tab === 'metrics' && (
        <div>
          <section className="card">
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
      )}

      <TabNav tabs={TABS} activeTab={tab} onSelect={setTab} />
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


function ProductivityPage({ tasks, onQuickCreate, onToggle, onEdit, onDelete, settings }) {
  const TABS = [
    { id: 'tasks', label: '✓ Tasks' },
    { id: 'braindump', label: '🧠 Brain Dump' },
    { id: 'notes', label: '📝 Notes' },
    { id: 'checklists', label: '📋 Checklists' },
    { id: 'focus', label: '⏱ Focus Timer' },
    { id: 'cleaning', label: '🧹 Cleaning' },
    { id: 'tips', label: '💡 Tips' },
  ]
  const lsGet = (k, d) => { try { const v = localStorage.getItem('planner.p.' + k); return v ? JSON.parse(v) : d } catch { return d } }
  const lsSet = (k, v) => { try { localStorage.setItem('planner.p.' + k, JSON.stringify(v)) } catch {} }

  const [tab, setTab] = useState('tasks')
  const [noteQuery, setNoteQuery] = useState('')
  const [notes, setNotes] = useState(() => { try { const v = localStorage.getItem('planner.notes'); return v ? JSON.parse(v) : [] } catch { return [] } })
  const saveNotes = (n) => { setNotes(n); try { localStorage.setItem('planner.notes', JSON.stringify(n)) } catch {} }
  const [checklists, setChecklists] = useState(() => lsGet('checklists', [{ id: 1, title: 'Work Checklist', items: [] }]))
  const [cleaningLog, saveCleaningLogDirect] = useState(() => lsGet('cleaning_log_v2', {}))
  const saveCleaningLog2 = (updated) => { saveCleaningLogDirect(updated); lsSet('cleaning_log_v2', updated) }
  const [cleaningFreq, setCleaningFreq] = useState('daily')
  const [brainDump, setBrainDump] = useState(() => { try { return localStorage.getItem('planner.p.braindump')||'' } catch { return '' } })
  const saveBrainDump = (v) => { setBrainDump(v); try { localStorage.setItem('planner.p.braindump', v) } catch {} }
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
  const [newChecklist, setNewChecklist] = useState('')
  const [newItem, setNewItem] = useState({})

  const saveChecklists = (c) => { setChecklists(c); lsSet('checklists', c) }


  return (
    <div className="screen-stack">
      <div style={{display:"flex",alignItems:"center",gap:8,paddingBottom:2}}>
        <span style={{fontSize:"1.1rem"}}>⚡</span>
        <p style={{fontSize:".62rem",fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:"var(--brass)",margin:0}}>Productivity</p>
      </div>
      <QuickAccessGrid tabs={[
        { id: 'tasks', label: '✓ Tasks' },
        { id: 'braindump', label: '🧠 Brain Dump' },
        { id: 'notes', label: '📝 Notes' },
        { id: 'checklists', label: '📋 Checklists' },
        { id: 'focus', label: '⏱ Focus Timer' },
        { id: 'cleaning', label: '🧹 Cleaning' },
        { id: 'tips', label: '💡 Tips' },
      ]} activeTab={tab} onSelect={setTab} /><div className="pill-row" style={{ overflowX: 'auto', flexWrap: 'nowrap', paddingBottom: 4 }}>
        {[{ id: 'tasks', label: '✓ Tasks' }, { id: 'braindump', label: '🧠 Brain Dump' }, { id: 'notes', label: '📝 Notes' }, { id: 'checklists', label: '📋 Checklists' }, { id: 'focus', label: '⏱ Focus Timer' }, { id: 'cleaning', label: '🧹 Cleaning' }, { id: 'tips', label: '💡 Time Tips' }].map(t => (
          <button key={t.id} className={tab === t.id ? 'pill active-pill' : 'pill'}
            onClick={() => setTab(t.id)} style={{ whiteSpace: 'nowrap', fontSize: '.82rem' }}>{t.label}</button>
        ))}
      </div>

      {tab === 'tasks' && (
        <section className="card">
          <div className="section-title-row">
            <div><p className="eyebrow">Productivity</p><h3>Tasks</h3></div>
            <button className="primary-btn" style={{ fontSize: '.82rem', padding: '8px 14px' }} onClick={() => onQuickCreate('task')}>+ Task</button>
          </div>
          {tasks.filter(t => !t.completed || settings.showCompletedTasks).slice(0, 20).map(task => (
            <div key={task.id} className="metric-row card-row" style={{ alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: '.9rem', textDecoration: task.completed ? 'line-through' : 'none', color: task.completed ? 'var(--muted)' : 'var(--text)' }}>{task.title}</div>
                <div style={{ fontSize: '.75rem', color: 'var(--muted)' }}>{task.category} • {task.date}</div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button className={task.completed ? 'secondary-btn' : 'primary-btn'} style={{ fontSize: '.78rem', padding: '5px 10px' }} onClick={() => onToggle(task.id)}>{task.completed ? '✓ Done' : 'Complete'}</button>
                <button className="ghost-btn" style={{ fontSize: '.78rem', padding: '5px 10px' }} onClick={() => onEdit('task', task)}>Edit</button>
              </div>
            </div>
          ))}
        </section>
      )}

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
              boxShadow:`0 0 0 6px ${focusMode==='work' ? 'var(--ink)' : 'var(--success)'}22`
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
      )}


      {tab === 'checklists' && (
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
      )}

      {tab === 'cleaning' && (
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
      )}

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
            ? <p className="muted" style={{fontSize:'.85rem'}}>No notes yet. Write your first one above.</p>
            : notes.filter(n => !noteQuery || n.title?.toLowerCase().includes(noteQuery.toLowerCase()) || (n.content||'').toLowerCase().includes(noteQuery.toLowerCase()))
              .map(note => (
                <div key={note.id} style={{padding:'12px 0',borderBottom:'1px solid var(--border)'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8}}>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:600,fontSize:'.9rem',marginBottom:4}}>{note.title}</div>
                      {note.content && <div style={{fontSize:'.85rem',color:'var(--ink2)',lineHeight:1.6,whiteSpace:'pre-wrap'}}>{note.content}</div>}
                      <div className="muted" style={{fontSize:'.72rem',marginTop:4}}>{note.category||'General'} · {note.date}</div>
                    </div>
                    <button onClick={() => deleteItem('note', note.id)}
                      style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',flexShrink:0}}>✕</button>
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
function WorkoutTrackerTab() {
  const lsG = (k,d) => { try{const v=localStorage.getItem('planner.l.'+k);return v?JSON.parse(v):d}catch{return d} }
  const lsS = (k,v) => { try{localStorage.setItem('planner.l.'+k,JSON.stringify(v))}catch{} }
  const [wLogs, setWLogs] = useState(()=>lsG('workouts',[]))
  const [wForm, setWForm] = useState({type:'Strength',duration:'',notes:'',date:new Date().toISOString().slice(0,10)})
  const saveWLogs = (v) => { setWLogs(v); lsS('workouts',v) }
  const TYPES = ['Strength','Cardio','HIIT','Yoga','Pilates','Cycling','Running','Swimming','Walking','Sports','Other']
  const today = new Date().toISOString().slice(0,10)
  const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - weekStart.getDay())
  const weekStartStr = weekStart.toISOString().slice(0,10)
  const thisWeekLogs = wLogs.filter(l => l.date >= weekStartStr && l.date <= today)
  const totalMins = thisWeekLogs.reduce((s,l)=>s+Number(l.duration||0),0)

  return (
    <section className="card">
      <p className="eyebrow">Workout Tracker</p>
      <h3 style={{margin:'4px 0 14px'}}>Log Your Training</h3>

      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:16}}>
        {[
          ['This Week',thisWeekLogs.length+' sessions','var(--teal)'],
          ['Minutes',totalMins+' min','var(--brass)'],
          ['Total',wLogs.length+' logged','var(--success)'],
        ].map(([l,v,c])=>(
          <div key={l} style={{background:'var(--stone)',borderRadius:10,padding:'10px',textAlign:'center'}}>
            <div className="muted" style={{fontSize:'.7rem',marginBottom:3}}>{l}</div>
            <strong style={{color:c,fontSize:'.9rem'}}>{v}</strong>
          </div>
        ))}
      </div>

      <div style={{display:'grid',gap:8,marginBottom:16,padding:'14px',background:'var(--stone)',borderRadius:10}}>
        <p style={{fontWeight:600,fontSize:'.85rem',margin:0}}>Log a Workout</p>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
          <select value={wForm.type} onChange={e=>setWForm(p=>({...p,type:e.target.value}))}
            style={{padding:'9px 10px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.85rem'}}>
            {TYPES.map(t=><option key={t}>{t}</option>)}
          </select>
          <input type="number" placeholder="Duration (min)" value={wForm.duration}
            onChange={e=>setWForm(p=>({...p,duration:e.target.value}))}
            style={{padding:'9px 10px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.85rem'}} />
        </div>
        <input type="date" value={wForm.date} onChange={e=>setWForm(p=>({...p,date:e.target.value}))}
          style={{padding:'9px 10px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.85rem'}} />
        <input placeholder="Notes (e.g. PRs, how you felt)" value={wForm.notes}
          onChange={e=>setWForm(p=>({...p,notes:e.target.value}))}
          style={{padding:'9px 10px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.85rem'}} />
        <button className="primary-btn" onClick={()=>{
          if(!wForm.duration) return
          saveWLogs([{...wForm,id:Date.now()},...wLogs])
          setWForm({type:'Strength',duration:'',notes:'',date:today})
        }}>+ Log Workout</button>
      </div>

      {wLogs.length === 0 && <p className="muted" style={{textAlign:'center',padding:'12px 0'}}>No workouts logged yet.</p>}
      {wLogs.slice(0,15).map((log,i)=>(
        <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:'1px solid var(--border)'}}>
          <div>
            <div style={{fontWeight:600,fontSize:'.88rem'}}>{log.type}</div>
            <div className="muted" style={{fontSize:'.75rem'}}>{log.date} · {log.duration} min{log.notes?' · '+log.notes:''}</div>
          </div>
          <button onClick={()=>saveWLogs(wLogs.filter((_,j)=>j!==i))}
            style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',fontSize:'1.1rem'}}>✕</button>
        </div>
      ))}
    </section>
  )
}

function PeriodTrackerTab() {
  const lsG = (k,d) => { try{const v=localStorage.getItem('planner.l.'+k);return v?JSON.parse(v):d}catch{return d} }
  const lsS = (k,v) => { try{localStorage.setItem('planner.l.'+k,JSON.stringify(v))}catch{} }
  const today = new Date().toISOString().slice(0,10)
  const [cycles, setCycles] = useState(()=>lsG('cycles',[]))
  const [cycleLen, setCycleLen] = useState(()=>lsG('cycleLen',28))
  const [periodLen, setPeriodLen] = useState(()=>lsG('periodLen',5))
  const [lastStart, setLastStart] = useState(()=>lsG('lastPeriodStart',''))
  const [symptoms, setSymptoms] = useState(()=>lsG('symptoms',{}))
  const [logDate, setLogDate] = useState(today)
  const [cycleStart, setCycleStart] = useState('')
  const [cycleEnd, setCycleEnd] = useState('')
  const saveCycles = (v) => { setCycles(v); lsS('cycles',v) }

  const nextStart = lastStart ? (() => {
    const d = new Date(lastStart); d.setDate(d.getDate() + Number(cycleLen))
    return d.toISOString().slice(0,10)
  })() : null
  const ovulationDay = lastStart ? (() => {
    const d = new Date(lastStart); d.setDate(d.getDate() + Number(cycleLen) - 14)
    return d.toISOString().slice(0,10)
  })() : null
  const daysUntilNext = nextStart ? Math.ceil((new Date(nextStart) - new Date(today)) / 86400000) : null
  const currentPhase = lastStart ? (() => {
    const daysSince = Math.ceil((new Date(today) - new Date(lastStart)) / 86400000)
    if (daysSince <= periodLen) return {phase:'Menstrual',color:'#E85555',desc:'Rest, hydrate, use heat therapy. Iron-rich foods help.'}
    if (daysSince <= 13) return {phase:'Follicular',color:'#FF9800',desc:'Energy rising. Great time for new projects and harder workouts.'}
    if (daysSince <= 16) return {phase:'Ovulatory',color:'#4CAF50',desc:'Peak energy and confidence. Best time for big decisions and social events.'}
    return {phase:'Luteal',color:'#9C27B0',desc:'Wind down. Prioritize sleep, reduce stress, gentler exercise.'}
  })() : null

  const SYMPTOM_OPTIONS = ['Cramps','Bloating','Headache','Fatigue','Mood swings','Acne','Back pain','Cravings','Tender breasts','Nausea']

  return (
    <section className="card">
      <p className="eyebrow">Period Tracker</p>
      <h3 style={{margin:'4px 0 14px'}}>Cycle Awareness</h3>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:16}}>
        <div style={{background:'var(--stone)',borderRadius:10,padding:'12px'}}>
          <p className="muted" style={{fontSize:'.72rem',margin:'0 0 6px'}}>Cycle Length (days)</p>
          <input type="number" value={cycleLen} onChange={e=>{setCycleLen(Number(e.target.value));lsS('cycleLen',Number(e.target.value))}}
            style={{width:'100%',padding:'7px 10px',border:'1.5px solid var(--border2)',borderRadius:6,fontSize:'1rem',fontWeight:700,boxSizing:'border-box'}} />
        </div>
        <div style={{background:'var(--stone)',borderRadius:10,padding:'12px'}}>
          <p className="muted" style={{fontSize:'.72rem',margin:'0 0 6px'}}>Period Length (days)</p>
          <input type="number" value={periodLen} onChange={e=>{setPeriodLen(Number(e.target.value));lsS('periodLen',Number(e.target.value))}}
            style={{width:'100%',padding:'7px 10px',border:'1.5px solid var(--border2)',borderRadius:6,fontSize:'1rem',fontWeight:700,boxSizing:'border-box'}} />
        </div>
      </div>

      <div style={{marginBottom:16}}>
        <p style={{fontWeight:600,fontSize:'.85rem',marginBottom:6}}>Last Period Start Date</p>
        <input type="date" value={lastStart} onChange={e=>{setLastStart(e.target.value);lsS('lastPeriodStart',e.target.value)}}
          style={{width:'100%',padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.85rem',boxSizing:'border-box'}} />
      </div>

      {currentPhase && (
        <div style={{background:currentPhase.color+'18',border:`1.5px solid ${currentPhase.color}44`,borderRadius:12,padding:'14px',marginBottom:16}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
            <strong style={{color:currentPhase.color,fontSize:'1rem'}}>{currentPhase.phase} Phase</strong>
            {daysUntilNext !== null && (
              <span className="muted" style={{fontSize:'.78rem'}}>
                {daysUntilNext > 0 ? `Next in ${daysUntilNext}d` : daysUntilNext === 0 ? 'Due today' : `${Math.abs(daysUntilNext)}d late`}
              </span>
            )}
          </div>
          <p style={{fontSize:'.82rem',color:'var(--ink2)',margin:0,lineHeight:1.5}}>{currentPhase.desc}</p>
        </div>
      )}

      {nextStart && (
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:16}}>
          {[['Next Period',nextStart,'#E85555'],['Ovulation Est.',ovulationDay,'#4CAF50']].map(([label,date,col])=>(
            <div key={label} style={{background:'var(--stone)',borderRadius:10,padding:'12px',textAlign:'center'}}>
              <p className="muted" style={{fontSize:'.72rem',margin:'0 0 4px'}}>{label}</p>
              <strong style={{color:col,fontSize:'.9rem'}}>{date}</strong>
            </div>
          ))}
        </div>
      )}

      <div style={{marginBottom:16}}>
        <p style={{fontWeight:600,fontSize:'.85rem',marginBottom:8}}>Log Symptoms — {logDate}</p>
        <input type="date" value={logDate} onChange={e=>setLogDate(e.target.value)}
          style={{width:'100%',padding:'8px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.85rem',marginBottom:10,boxSizing:'border-box'}} />
        <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
          {SYMPTOM_OPTIONS.map(s => {
            const active = (symptoms[logDate]||[]).includes(s)
            return (
              <button key={s} onClick={()=>{
                const cur = symptoms[logDate]||[]
                const next = active ? cur.filter(x=>x!==s) : [...cur,s]
                const updated = {...symptoms,[logDate]:next}
                setSymptoms(updated); lsS('symptoms',updated)
              }} style={{
                padding:'6px 12px',borderRadius:999,fontSize:'.78rem',cursor:'pointer',fontWeight:500,
                background:active?'#E85555':'var(--stone)',color:active?'white':'var(--ink2)',
                border:active?'none':'1.5px solid var(--border2)'
              }}>{s}</button>
            )
          })}
        </div>
      </div>

      <div>
        <p style={{fontWeight:600,fontSize:'.85rem',marginBottom:8}}>Period History</p>
        {cycles.length === 0 && <p className="muted" style={{fontSize:'.82rem',marginBottom:10}}>No cycles logged yet.</p>}
        {cycles.slice(0,8).map((c,i)=>(
          <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid var(--border)',fontSize:'.85rem'}}>
            <span>{c.start} → {c.end}</span>
            <button onClick={()=>saveCycles(cycles.filter((_,j)=>j!==i))}
              style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer'}}>✕</button>
          </div>
        ))}
        <div style={{display:'flex',gap:8,marginTop:10}}>
          <input type="date" value={cycleStart} onChange={e=>setCycleStart(e.target.value)}
            style={{flex:1,padding:'8px 10px',border:'1.5px solid var(--border2)',borderRadius:6,fontSize:'.82rem'}} />
          <input type="date" value={cycleEnd} onChange={e=>setCycleEnd(e.target.value)}
            style={{flex:1,padding:'8px 10px',border:'1.5px solid var(--border2)',borderRadius:6,fontSize:'.82rem'}} />
          <button className="primary-btn" style={{padding:'8px 14px',fontSize:'.82rem'}} onClick={()=>{
            if(!cycleStart||!cycleEnd) return
            saveCycles([{start:cycleStart,end:cycleEnd,id:Date.now()},...cycles])
            setCycleStart(''); setCycleEnd('')
          }}>+ Log</button>
        </div>
      </div>
    </section>
  )
}


function LifestylePage() {
  const lsGet = (k, d) => { try { const v = localStorage.getItem('planner.l.' + k); return v ? JSON.parse(v) : d } catch { return d } }
  const lsSet = (k, v) => { try { localStorage.setItem('planner.l.' + k, JSON.stringify(v)) } catch {} }

  const [tab, setTab] = useState('groceries')
  const [trips, setTrips] = useState(() => { try { const v = localStorage.getItem('planner.l.trips'); return v ? JSON.parse(v) : [] } catch { return [] } })
  const [newTrip, setNewTrip] = useState({ destination: '', startDate: '', endDate: '', notes: '', packing: '' })
  const [birthdays, setBirthdays] = useState(() => { try { const v = localStorage.getItem('planner.l.birthdays'); return v ? JSON.parse(v) : [] } catch { return [] } })
  const [newBirthday, setNewBirthday] = useState({ name: '', date: '', relationship: '', notes: '' })
  const saveTrips = (t) => { setTrips(t); try { localStorage.setItem('planner.l.trips', JSON.stringify(t)) } catch {} }
  const saveBirthdays = (b) => { setBirthdays(b); try { localStorage.setItem('planner.l.birthdays', JSON.stringify(b)) } catch {} }
  const [passwords, setPasswords] = useState(() => lsGet('passwords', []))
  const [keyDates, setKeyDates] = useState(() => lsGet('keyDates', []))
  const [contacts, setContacts] = useState(() => lsGet('contacts', []))
  const [groceries, setGroceries] = useState(() => lsGet('groceries', []))
  const [form, setForm] = useState({})
  const save = (key, setter, val) => { setter(val); lsSet(key, val) }

  const TABS = [
    { id: 'groceries', label: '🛒 Groceries' },
    { id: 'trips', label: '✈ Trips' }, { id: 'birthdays', label: '🎂 Birthdays' },
    { id: 'contacts', label: '👥 Contacts' },
    { id: 'workout', label: '💪 Workout' }, { id: 'period', label: '🌸 Period' },
    { id: 'passwords', label: '🔑 Passwords' },
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
      <div style={{display:"flex",alignItems:"center",gap:8,paddingBottom:2}}>
        <span style={{fontSize:"1.1rem"}}>🌍</span>
        <p style={{fontSize:".62rem",fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:"var(--brass)",margin:0}}>Lifestyle</p>
      </div>
      <QuickAccessGrid tabs={TABS} activeTab={tab} onSelect={setTab} />


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
                <div style={{background:color,borderRadius:8,padding:'8px 12px',marginBottom:8}}>
                  <strong style={{fontSize:'.82rem'}}>{cat}</strong>
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

      {tab === 'contacts' && (
        <section className="card">
          <p className="eyebrow">Contacts</p>
          <h3 style={{ margin: '4px 0 12px' }}>Key People</h3>
          <SimpleList items={contacts} onDelete={i => save('contacts', setContacts, contacts.filter((_, j) => j !== i))}
            renderItem={item => (<><div style={{ fontWeight: 600, fontSize: '.9rem' }}>{item.name}</div><div style={{ fontSize: '.78rem', color: 'var(--muted)' }}>{item.phone}{item.email ? ' · ' + item.email : ''}{item.notes ? ' · ' + item.notes : ''}</div></>)} />
          <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
            {[['Name', 'cName', 'text'], ['Phone', 'cPhone', 'tel'], ['Email', 'cEmail', 'email'], ['Notes', 'cNotes', 'text']].map(([lbl, key, type]) => (
              <input key={key} type={type} placeholder={lbl} value={form[key] || ''} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                style={{ padding: '9px 12px', border: '1.5px solid var(--border2)', borderRadius: 'var(--radius-sm)', fontSize: '.85rem' }} />
            ))}
            <button className="primary-btn" onClick={() => { if (!form.cName) return; save('contacts', setContacts, [...contacts, { name: form.cName, phone: form.cPhone, email: form.cEmail, notes: form.cNotes }]); setForm(p => ({ ...p, cName: '', cPhone: '', cEmail: '', cNotes: '' })) }}>Add Contact</button>
          </div>
        </section>
      )}

      {tab === 'workout' && <WorkoutTrackerTab />}

      {tab === 'period' && <PeriodTrackerTab />}

      {tab === 'passwords' && (
        <section className="card">
          <div style={{ background: 'rgba(240,180,41,.1)', border: '1px solid rgba(240,180,41,.3)', borderRadius: 'var(--radius-sm)', padding: 10, marginBottom: 14, fontSize: '.82rem', color: 'var(--warning)' }}>
            ⚠️ Stored locally on this device only. Do not store critical passwords here without a backup.
          </div>
          <SimpleList items={passwords} onDelete={i => save('passwords', setPasswords, passwords.filter((_, j) => j !== i))}
            renderItem={item => (<><div style={{ fontWeight: 600, fontSize: '.9rem' }}>{item.service}</div><div style={{ fontSize: '.78rem', color: 'var(--muted)', fontFamily: 'monospace' }}>{item.username} · {'•'.repeat(8)}</div></>)} />
          <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
            {[['Service/Website', 'pwSrv', 'text'], ['Username/Email', 'pwUser', 'text'], ['Password', 'pwPass', 'password']].map(([lbl, key, type]) => (
              <input key={key} type={type} placeholder={lbl} value={form[key] || ''} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                style={{ padding: '9px 12px', border: '1.5px solid var(--border2)', borderRadius: 'var(--radius-sm)', fontSize: '.85rem' }} />
            ))}
            <button className="primary-btn" onClick={() => { if (!form.pwSrv) return; save('passwords', setPasswords, [...passwords, { service: form.pwSrv, username: form.pwUser, password: form.pwPass }]); setForm(p => ({ ...p, pwSrv: '', pwUser: '', pwPass: '' })) }}>Save</button>
          </div>
        </section>
      )}

      {tab === 'trips' && (
        <div>
          <section className="card">
            <p className="eyebrow">Trip Planner</p>
            <h3 style={{margin:'4px 0 12px'}}>Upcoming & Past Trips</h3>
            {trips.length === 0 && <p className="muted" style={{fontSize:'.85rem',marginBottom:12}}>No trips planned yet.</p>}
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
      )}

      {tab === 'birthdays' && (
        <div>
          <section className="card">
            <p className="eyebrow">Birthday Reminders</p>
            <h3 style={{margin:'4px 0 12px'}}>Never miss one</h3>
            {birthdays.length === 0 && <p className="muted" style={{fontSize:'.85rem',marginBottom:12}}>No birthdays added yet.</p>}
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
      )}
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

function GoalsPage({ goals, tasks, projects, onEdit, onDelete, onQuickCreate }) {
  const [activeFrame, setActiveFrame] = useState('all')
  const [visionItems, setVisionItems] = useState(() => { try { const v = localStorage.getItem('planner.g.vision'); return v ? JSON.parse(v) : [] } catch { return [] } })
  const [newVision, setNewVision] = useState('')
  const saveVision = (v) => { setVisionItems(v); try { localStorage.setItem('planner.g.vision', JSON.stringify(v)) } catch {} }

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
      <div style={{display:'flex',alignItems:'center',gap:8,paddingBottom:2}}>
        <span style={{fontSize:'1.1rem'}}>🎯</span>
        <p style={{fontSize:'.62rem',fontWeight:700,letterSpacing:'.12em',textTransform:'uppercase',color:'var(--brass)',margin:0}}>Goals</p>
      </div>

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
        <section className="card" style={{textAlign:'center',padding:'28px 20px'}}>
          <div style={{fontSize:'2rem',marginBottom:10}}>🎯</div>
          <div style={{fontWeight:700,color:'var(--ink)',marginBottom:6}}>No goals yet</div>
          <p className="muted" style={{fontSize:'.85rem',marginBottom:14}}>Use the SMART framework above to set your first goal.</p>
          <button className="primary-btn" onClick={() => onQuickCreate('goal')}>Set Your First Goal</button>
        </section>
      )}

      {filtered.map(goal => {
        const progress = getGoalProgress(goal.id, tasks, projects)
        const linkedTasks = tasks.filter(t => t.linkedGoalId === goal.id)
        const tf = TIMEFRAMES.find(t => t.id === goal.timeframe)
        return (
          <section key={goal.id} className="card">
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4,flexWrap:'wrap'}}>
                  <div style={{fontWeight:700,fontSize:'1rem',color:'var(--ink)'}}>{goal.title}</div>
                  {tf && tf.id !== 'all' && (
                    <span style={{fontSize:'.65rem',padding:'2px 8px',borderRadius:999,background:'var(--brass-dim)',color:'var(--brass)',fontWeight:700}}>{tf.label}</span>
                  )}
                </div>
                {goal.description && <div style={{fontSize:'.82rem',color:'var(--muted)',lineHeight:1.5,marginBottom:6}}>{goal.description}</div>}
                <div style={{fontSize:'.75rem',color:'var(--muted)'}}>{goal.category} · Due {goal.targetDate}</div>
              </div>
              <div style={{display:'flex',gap:6,flexShrink:0,marginLeft:8}}>
                <button className="ghost-btn" style={{fontSize:'.72rem',padding:'4px 8px'}} onClick={() => onEdit('goal',goal)}>Edit</button>
                <button style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer'}} onClick={() => onDelete('goal',goal.id)}>✕</button>
              </div>
            </div>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:4,fontSize:'.78rem'}}>
              <span style={{color:'var(--muted)'}}>{linkedTasks.length} linked task{linkedTasks.length!==1?'s':''}</span>
              <strong style={{color: progress>=100?'var(--success)':'var(--brass)'}}>{progress}%</strong>
      
      

      </div>
            <div style={{height:6,background:'var(--stone2)',borderRadius:999,overflow:'hidden'}}>
              <div style={{height:'100%',width:`${progress}%`,background:progress>=100?'var(--success)':'var(--brass)',borderRadius:999,transition:'width .4s'}} />
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

    </div>
  )
}


function GrowthPage({ scores, habits, habitLogs, goals, tasks, projects, onToggleHabit, onEdit, onDelete, onQuickCreate, budget, setBudget }) {
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
      <div style={{display:'flex',alignItems:'center',gap:8,paddingBottom:2}}>
        <span style={{fontSize:'1.1rem'}}>↑</span>
        <p style={{fontSize:'.62rem',fontWeight:700,letterSpacing:'.12em',textTransform:'uppercase',color:'var(--brass)',margin:0}}>Growth</p>
      </div>

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
            <textarea value={reviewAnswers[i]||''} onChange={e=>{const u={...reviewAnswers,[i]:e.target.value};setReviewAnswers(u);try{localStorage.setItem('planner.gr.review',JSON.stringify(u))}catch{}}}
              placeholder="Write freely..."
              style={{width:'100%',minHeight:70,padding:'10px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',
              fontSize:'.85rem',fontFamily:'var(--serif)',lineHeight:1.6,resize:'vertical',background:'var(--warm-white)',color:'var(--ink)',boxSizing:'border-box'}} />
          </div>
        ))}
        <button className="primary-btn" style={{width:'100%',fontSize:'.88rem'}}
          onClick={()=>{
            const entry = {date:TODAY,answers:{...reviewAnswers},id:Date.now()}
            const prev = JSON.parse(localStorage.getItem('planner.gr.reviewHistory')||'[]')
            const updated = [entry,...prev].slice(0,52)
            localStorage.setItem('planner.gr.reviewHistory',JSON.stringify(updated))
            setReviewHistory(updated)
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

      {/* ── Weekly Spending Target (kept for score linkage) ──────────────── */}
      <section className="card">
        <p className="eyebrow">Finance</p>
        <h3 style={{margin:'4px 0 6px'}}>Weekly Spending Target</h3>
        <p className="muted" style={{fontSize:'.8rem',marginBottom:10}}>Discretionary only — bills and rent do not count. Used to calculate your Finance score.</p>
        <div style={{display:'flex',gap:10,alignItems:'center'}}>
          <input type="number" value={budget.weeklyTarget}
            onChange={(e) => setBudget({ weeklyTarget: Number(e.target.value) })}
            style={{flex:1,padding:'10px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.9rem'}} />
          <span className="muted" style={{fontSize:'.85rem'}}>/week</span>
        </div>
      </section>
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

function NotificationSettings({ settings, updateSettings }) {
  const [permission, setPermission] = useState(() => { try { return (typeof Notification !== 'undefined' ? Notification.permission : 'default') } catch { return 'default' } })
  const [supported, setSupported] = useState(false)
  const [loading, setLoading] = useState(false)
  const notifSettings = settings?.notifications || {}

  useEffect(() => {
    PlannerPush.isSupported().then(setSupported)
    if ('Notification' in window) setPermission(Notification.permission)
  }, [])

  const enable = async () => {
    setLoading(true)
    const perm = await PlannerPush.requestPermission()
    setPermission(perm)
    if (perm === 'granted') {
      await PlannerPush.subscribe()
      // Enable all notifications by default
      updateSettings({ ...settings, notifications: {
        tasks: true, habits: true, goals: true, faith: true,
        reflection: true, birthdays: true, overdue: true, finance: false
      }})
    }
    setLoading(false)
  }

  const toggle = (key) => {
    updateSettings({ ...settings, notifications: { ...notifSettings, [key]: !notifSettings[key] }})
  }

  const CATEGORIES = [
    { key: 'tasks',      icon: '✓',  label: 'Task Reminders',     desc: 'Due today at 9am' },
    { key: 'habits',     icon: '🔁', label: 'Habit Check-In',      desc: 'Daily reminder at 8am' },
    { key: 'goals',      icon: '🎯', label: 'Goal Nudges',         desc: 'Weekly progress reminder' },
    { key: 'faith',      icon: '✝',  label: 'Morning Devotional',  desc: 'Daily at 6am' },
    { key: 'reflection', icon: '📖', label: 'Evening Reflection',  desc: 'Daily at 7pm' },
    { key: 'birthdays',  icon: '🎂', label: 'Birthday Reminders',  desc: 'Day-of at 8am' },
    { key: 'overdue',    icon: '⚠',  label: 'Overdue Alerts',      desc: 'When tasks are past due' },
    { key: 'finance',    icon: '💰', label: 'Spending Check',       desc: 'Weekly budget summary' },
  ]

  return (
    <section className="card">
      <p className="eyebrow">Notifications</p>
      <h3 style={{margin: '4px 0 14px'}}>Stay on Track</h3>

      {!supported ? (
        <div style={{padding:'12px',background:'var(--stone)',borderRadius:10,fontSize:'.85rem',color:'var(--muted)'}}>
          Push notifications are not supported on this browser.
        </div>
      ) : permission === 'denied' ? (
        <div style={{padding:'14px',background:'#fde8e8',borderRadius:10}}>
          <strong style={{fontSize:'.88rem',color:'var(--danger)'}}>Notifications Blocked</strong>
          <p style={{fontSize:'.8rem',color:'var(--ink2)',margin:'6px 0 0',lineHeight:1.5}}>
            You've blocked notifications for this site. To enable them, click the lock icon in your browser's address bar and allow notifications, then refresh.
          </p>
        </div>
      ) : permission === 'default' ? (
        <div>
          <p className="muted" style={{fontSize:'.85rem',marginBottom:14,lineHeight:1.6}}>
            Get reminders for your tasks, habits, devotional, birthdays and more — right on your device.
          </p>
          <button className="primary-btn" style={{width:'100%',fontSize:'.9rem'}}
            onClick={enable} disabled={loading}>
            {loading ? 'Enabling...' : '🔔 Enable Push Notifications'}
          </button>
        </div>
      ) : (
        <div>
          <div style={{display:'flex',alignItems:'center',gap:8,padding:'10px 12px',background:'#d5f5e3',borderRadius:8,marginBottom:16}}>
            <div style={{width:10,height:10,borderRadius:'50%',background:'var(--success)',boxShadow:'0 0 6px var(--success)'}} />
            <span style={{fontSize:'.85rem',fontWeight:600,color:'var(--success)'}}>Notifications enabled</span>
          </div>

          <p style={{fontWeight:600,fontSize:'.85rem',marginBottom:10}}>Choose what to receive:</p>
          {CATEGORIES.map(cat => (
            <div key={cat.key} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'11px 0',borderBottom:'1px solid var(--border)'}}>
              <div style={{display:'flex',gap:10,alignItems:'center'}}>
                <span style={{fontSize:'1.1rem',width:24,textAlign:'center'}}>{cat.icon}</span>
                <div>
                  <div style={{fontWeight:600,fontSize:'.88rem'}}>{cat.label}</div>
                  <div className="muted" style={{fontSize:'.72rem'}}>{cat.desc}</div>
                </div>
              </div>
              <button onClick={() => toggle(cat.key)} style={{
                width:44,height:24,borderRadius:999,border:'none',cursor:'pointer',
                background:notifSettings[cat.key] ? 'var(--teal)' : 'var(--border2)',
                position:'relative',transition:'background .2s',flexShrink:0
              }}>
                <div style={{
                  position:'absolute',top:3,
                  left:notifSettings[cat.key] ? 23 : 3,
                  width:18,height:18,borderRadius:'50%',
                  background:'white',transition:'left .2s',
                  boxShadow:'0 1px 3px rgba(0,0,0,.2)'
                }} />
              </button>
            </div>
          ))}

          <button onClick={async()=>{ await PlannerPush.unsubscribe(); setPermission('default'); updateSettings({...settings,notifications:{}})}}
            style={{marginTop:14,background:'none',border:'1px solid var(--border)',borderRadius:8,padding:'8px 14px',fontSize:'.78rem',color:'var(--muted)',cursor:'pointer',width:'100%'}}>
            Disable All Notifications
          </button>
        </div>
      )}
    </section>
  )
}


function MorePage({ profile, settings, updateProfile, updateSettings, onEdit, onDelete, onQuickCreate }) {
  const { signOut } = useAuth()

  return (
    <div className="screen-stack">
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
              <option>Balanced</option>
              <option>Execution</option>
              <option>Wellness</option>
              <option>Growth</option>
            </select>
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



      {/* ── Sync / Data ────────────────────────────────────────────── */}
      <section className="card">
        <p className="eyebrow">Data & Sync</p>
        <h3 style={{margin:'4px 0 14px'}}>Cross-Device Sync</h3>
        <div style={{display:'flex',alignItems:'center',gap:12,padding:'12px 14px',borderRadius:'var(--radius-sm)',background:'var(--surface)'}}>
          <div style={{width:12,height:12,borderRadius:'50%',background:hasSupabaseEnv?'var(--success)':'var(--warning)',flexShrink:0,boxShadow:hasSupabaseEnv?'0 0 8px var(--success)':undefined}} />
          <div>
            <div style={{fontWeight:600,fontSize:'.9rem'}}>{hasSupabaseEnv ? '✓ Connected — syncing across all devices' : 'Local mode — this device only'}</div>
            <div style={{fontSize:'.75rem',color:'var(--muted)',marginTop:2}}>{hasSupabaseEnv ? 'Your tasks, goals, habits, and data are saved to the cloud.' : 'Contact support to enable cross-device sync.'}</div>
          </div>
        </div>
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

      {/* ── Support & Contact ──────────────────────────────────────── */}
      <section className="card" style={{background:'var(--ink)',border:'none'}}>
        <p className="eyebrow" style={{color:'var(--brass)'}}>Support</p>
        <h3 style={{color:'var(--warm-white)',margin:'4px 0 14px'}}>We're here to help</h3>
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <a href="mailto:support@thelivingplanner.app" style={{
            display:'flex',alignItems:'center',gap:12,padding:'14px',
            background:'rgba(255,255,255,.06)',borderRadius:10,
            border:'1px solid rgba(184,150,90,.2)',textDecoration:'none'
          }}>
            <div style={{width:40,height:40,borderRadius:'50%',background:'var(--brass)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.1rem',flexShrink:0}}>✉</div>
            <div>
              <div style={{color:'var(--warm-white)',fontWeight:600,fontSize:'.9rem'}}>Email Support</div>
              <div style={{color:'var(--brass)',fontSize:'.8rem',marginTop:2}}>support@thelivingplanner.app</div>
              <div style={{color:'rgba(255,255,255,.4)',fontSize:'.72rem',marginTop:2}}>We respond within 24 hours</div>
            </div>
          </a>
          <div style={{padding:'12px 14px',background:'rgba(255,255,255,.04)',borderRadius:10,border:'1px solid rgba(255,255,255,.08)'}}>
            <div style={{color:'rgba(255,255,255,.5)',fontSize:'.78rem',lineHeight:1.6}}>
              For bugs, feature requests, billing questions, or anything else — reach out anytime. Built with care by a real person who wants this to work for you.
            </div>
          </div>
        </div>
      </section>

    </div>
  )
}


const modalEmpty = { open: false, type: 'task', mode: 'create', item: null }

function PlannerApp() {
  const { tasks, goals, projects, expenses, notes, events, habits, habitLogs, budget, profile, settings, scores, loading, syncing, error, saveItem, deleteItem, toggleTask, toggleHabit, updateBudget, updateProfile, updateSettings } = usePlannerData()
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


  // Check notification schedule on load
  useEffect(() => {
    if (tasks?.length || habits?.length) {
      setTimeout(() => {
        PlannerPush.scheduleCheck(tasks || [], habits || [], goals || [], settings || {})
      }, 2000)
    }
  }, [tasks?.length, habits?.length])

  if (loading) return <div className="auth-shell"><div className="auth-card"><p className="eyebrow">Planner Data</p><h1>Loading your workspace…</h1></div></div>


  return (
    <>
      <Layout onQuickAdd={() => openCreate('task')} banner={<StatusBanner syncing={syncing} error={error} />} profile={profile}>
        <Routes>
          <Route path="/" element={<HomePage tasks={tasks} goals={goals} projects={projects} expenses={expenses} scores={scores} budget={budget} events={events} habits={habits} habitLogs={habitLogs} settings={settings} profile={profile} onEdit={openEdit} onQuickCreate={openCreate} />} />
          <Route path="/tasks" element={<TasksPage tasks={tasks} settings={settings} onToggle={async (id) => { await toggleTask(id); pushToast('Task updated', 'Progress and score were refreshed.', 'success') }} onEdit={openEdit} onDelete={async (type, id) => { await deleteItem(type, id); pushToast('Task deleted', 'That item is gone.', 'success') }} onQuickCreate={openCreate} />} />
          <Route path="/calendar" element={<CalendarPage tasks={tasks} events={events} settings={settings} onEdit={openEdit} onDelete={async (type, id) => { await deleteItem(type, id); pushToast('Calendar item deleted', '', 'success') }} onQuickCreate={openCreate} onReschedule={async (type, id, patch) => { const collection = type === 'event' ? events : tasks; const current = collection.find((item) => item.id === id); if (!current) return; await saveItem(type, { ...current, ...patch }, 'edit'); pushToast(type === 'task' ? 'Task rescheduled' : 'Event moved', 'The calendar updated instantly.', 'success') }} />} />
          <Route path="/projects" element={<ProjectsPage projects={projects} tasks={tasks} goals={goals} onEdit={openEdit} onDelete={async (type, id) => { await deleteItem(type, id); pushToast('Project removed', '', 'success') }} onQuickCreate={openCreate} />} />
          <Route path="/habits" element={<HabitsPage habits={habits} habitLogs={habitLogs} onToggleHabit={async (id, date) => { await toggleHabit(id, date) }} onEdit={openEdit} onDelete={async (type, id) => { await deleteItem(type, id) }} onQuickCreate={openCreate} />} />
            <Route path="/goals" element={<GoalsPage goals={goals} tasks={tasks} projects={projects} onEdit={openEdit} onDelete={async (type, id) => { await deleteItem(type, id) }} onQuickCreate={openCreate} />} />
            <Route path="/growth" element={<GrowthPage scores={scores} habits={habits} habitLogs={habitLogs} goals={goals} tasks={tasks} projects={projects} onToggleHabit={async (...args) => { await toggleHabit(...args); pushToast('Habit logged', 'Your scorecard picked that up.', 'success') }} onEdit={openEdit} onDelete={async (type, id) => { await deleteItem(type, id); pushToast('Habit deleted', '', 'success') }} onQuickCreate={openCreate} budget={budget} setBudget={async (nextBudget) => { await updateBudget(nextBudget); pushToast('Budget updated', 'Finance scoring refreshed.', 'success') }} />} />
          <Route path="/finance" element={<FinancePage expenses={expenses} budget={budget} setBudget={async (nextBudget) => { await updateBudget(nextBudget) }} />} />
          <Route path="/wellness" element={<HealthWellnessPage />} />
          <Route path="/productivity" element={<ProductivityPage tasks={tasks} onQuickCreate={openCreate} onToggle={async (id) => { await toggleTask(id) }} onEdit={openEdit} onDelete={async (type, id) => { await deleteItem(type, id) }} settings={settings} />} />
          <Route path="/lifestyle" element={<LifestylePage />} />
          <Route path="/faith" element={<FaithPage />} />
          <Route path="/health" element={<HealthWellnessPage />} />
          <Route path="/more" element={<MorePage profile={profile} settings={settings} updateProfile={updateProfile} updateSettings={updateSettings} onEdit={openEdit} onDelete={async (type, id) => { await deleteItem(type, id) }} onQuickCreate={openCreate} />} />
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
            pushToast(modeArg === 'edit' ? `${type} updated` : `${type} added`, 'Your planner synced the change.', 'success')
          }}
          onDelete={async (type, id) => {
            await deleteItem(type, id)
            pushToast(`${type} deleted`, '', 'success')
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
function FaithPage() {
  const lsGet = (k, d) => { try { const v = localStorage.getItem('planner.faith.' + k); return v ? JSON.parse(v) : d } catch { return d } }
  const lsSet = (k, v) => { try { localStorage.setItem('planner.faith.' + k, JSON.stringify(v)) } catch {} }

  const [tab, setTab] = useState('devotional')

  // Prayer journal state
  const [prayers, setPrayers] = useState(() => lsGet('prayers', []))
  const [newPrayer, setNewPrayer] = useState({ text: '', type: 'Request', answered: false })
  const savePrayers = (v) => { setPrayers(v); lsSet('prayers', v) }

  // Scripture journal state
  const [scriptures, setScriptures] = useState(() => lsGet('scriptures', []))
  const [newScripture, setNewScripture] = useState({ reference: '', text: '', reflection: '' })
  const saveScriptures = (v) => { setScriptures(v); lsSet('scriptures', v) }

  // Gratitude state
  const [gratitude, setGratitude] = useState(() => lsGet('gratitude', []))
  const [newGratitude, setNewGratitude] = useState('')
  const saveGratitude = (v) => { setGratitude(v); lsSet('gratitude', v) }

  // Devotional journal
  const [devotional, setDevotional] = useState(() => lsGet('devotional', { text: '', date: '' }))
  const saveDevotional = (v) => { setDevotional(v); lsSet('devotional', v) }

  // Fasting tracker
  const [fasting, setFasting] = useState(() => lsGet('fasting', { active: false, startDate: '', endDate: '', intention: '', log: [] }))
  const saveFasting = (v) => { setFasting(v); lsSet('fasting', v) }

  // Faith goals
  const [faithGoals, setFaithGoals] = useState(() => lsGet('faithGoals', []))
  const [newFaithGoal, setNewFaithGoal] = useState({ text: '', category: 'Spiritual Growth', done: false })
  const saveFaithGoals = (v) => { setFaithGoals(v); lsSet('faithGoals', v) }

  // Sermon notes
  const [sermons, setSermons] = useState(() => lsGet('sermons', []))
  const [newSermon, setNewSermon] = useState({ date: new Date().toISOString().slice(0,10), speaker: '', title: '', notes: '', application: '' })
  const saveSermons = (v) => { setSermons(v); lsSet('sermons', v) }

  const TODAY = new Date().toISOString().slice(0,10)
  const todayGratitude = gratitude.filter(g => g.date === TODAY)
  const answeredPrayers = prayers.filter(p => p.answered).length

  const TABS = [
    { id: 'devotional', label: '📖 Devotional' },
    { id: 'prayer', label: '🙏 Prayer' },
    { id: 'scripture', label: '📜 Scripture' },
    { id: 'gratitude', label: '🌸 Gratitude' },
    { id: 'fasting', label: '⚡ Fasting' },
    { id: 'sermons', label: '🎙 Sermons' },
    { id: 'goals', label: '🎯 Faith Goals' },
  ]

  return (
    <div className="screen-stack">
      <div style={{display:'flex',alignItems:'center',gap:8,paddingBottom:2}}>
        <span style={{fontSize:'1.1rem'}}>✝</span>
        <p style={{fontSize:'.62rem',fontWeight:700,letterSpacing:'.12em',textTransform:'uppercase',color:'var(--brass)',margin:0}}>Faith</p>
      </div>

      {/* Stats strip */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10}}>
        {[
          ['🙏', prayers.filter(p=>!p.answered).length+' Active', 'Prayers'],
          ['✅', answeredPrayers+' Answered', 'Prayers'],
          ['🌸', todayGratitude.length+' Today', 'Gratitude'],
        ].map(([icon,val,label]) => (
          <div key={label+val} style={{background:'var(--stone)',borderRadius:10,padding:'10px',textAlign:'center'}}>
            <div style={{fontSize:'1.1rem',marginBottom:2}}>{icon}</div>
            <div style={{fontWeight:700,fontSize:'.88rem',color:'var(--brass)'}}>{val}</div>
            <div className="muted" style={{fontSize:'.7rem'}}>{label}</div>
          </div>
        ))}
      </div>

      <QuickAccessGrid tabs={TABS} activeTab={tab} onSelect={setTab} />

      {/* ── DEVOTIONAL ─────────────────────────────────────────────────────── */}
      {tab === 'devotional' && (
        <section className="card">
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
          <p className="eyebrow">Scripture Journal</p>
          <h3 style={{ margin: '4px 0 14px' }}>God's Word in Your Life</h3>
          {scriptures.length === 0 && <p className="muted" style={{marginBottom:16,fontStyle:'italic'}}>No scriptures saved yet. Add one below.</p>}
          {scriptures.map((s, i) => (
            <div key={s.id} style={{padding:'14px',background:'var(--stone)',borderRadius:10,marginBottom:10}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                <strong style={{color:'var(--brass)',fontSize:'.85rem'}}>{s.reference}</strong>
                <button onClick={() => saveScriptures(scriptures.filter((_,j)=>j!==i))}
                  style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer'}}>✕</button>
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

      {/* ── GRATITUDE ──────────────────────────────────────────────────────── */}
      {tab === 'gratitude' && (
        <section className="card">
          <p className="eyebrow">Gratitude Journal</p>
          <h3 style={{ margin: '4px 0 8px' }}>Count Your Blessings</h3>
          <p className="muted" style={{fontSize:'.8rem',marginBottom:14}}>A grateful heart is a powerful heart. Log at least 3 things daily.</p>
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
          {fasting.log.length > 0 && (
            <div>
              <p style={{fontWeight:600,fontSize:'.85rem',marginBottom:8}}>Fast History</p>
              {fasting.log.map((entry, i) => (
                <div key={i} style={{padding:'10px 0',borderBottom:'1px solid var(--border)'}}>
                  <div style={{fontWeight:600,fontSize:'.88rem'}}>{entry.intention || 'Fast'}</div>
                  <div className="muted" style={{fontSize:'.75rem'}}>{entry.start} → {entry.end}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── SERMONS ────────────────────────────────────────────────────────── */}
      {tab === 'sermons' && (
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
                <button onClick={() => saveSermons(sermons.filter((_,j)=>j!==i))}
                  style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer'}}>✕</button>
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
      )}

      {/* ── FAITH GOALS ─────────────────────────────────────────────────────── */}
      {tab === 'goals' && (
        <section className="card">
          <p className="eyebrow">Faith Goals</p>
          <h3 style={{ margin: '4px 0 14px' }}>Growing in the Spirit</h3>
          {faithGoals.length === 0 && <p className="muted" style={{marginBottom:16,fontStyle:'italic'}}>No faith goals yet. What is God calling you to grow in?</p>}
          {faithGoals.map((goal, i) => (
            <div key={goal.id} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 0',borderBottom:'1px solid var(--border)'}}>
              <div onClick={() => saveFaithGoals(faithGoals.map((g,j) => j===i ? {...g, done:!g.done} : g))}
                style={{width:22,height:22,borderRadius:6,border:'2px solid',borderColor:goal.done?'var(--success)':'var(--brass)',
                background:goal.done?'var(--success)':'transparent',flexShrink:0,cursor:'pointer',
                display:'flex',alignItems:'center',justifyContent:'center'}}>
                {goal.done && <span style={{color:'white',fontSize:'.8rem',fontWeight:700}}>✓</span>}
              </div>
              <div style={{flex:1}}>
                <div style={{fontWeight:600,fontSize:'.88rem',textDecoration:goal.done?'line-through':'none',color:goal.done?'var(--muted)':'var(--ink)'}}>{goal.text}</div>
                <div className="muted" style={{fontSize:'.72rem'}}>{goal.category}</div>
              </div>
              <button onClick={() => saveFaithGoals(faithGoals.filter((_,j)=>j!==i))}
                style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer'}}>✕</button>
            </div>
          ))}
          <div style={{marginTop:16,display:'grid',gap:8}}>
            <p style={{fontWeight:600,fontSize:'.85rem',margin:0}}>Add a Faith Goal</p>
            <input placeholder="e.g. Read the Bible in a year" value={newFaithGoal.text}
              onChange={e => setNewFaithGoal(p => ({...p, text: e.target.value}))}
              style={{padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.85rem'}} />
            <select value={newFaithGoal.category} onChange={e => setNewFaithGoal(p => ({...p, category: e.target.value}))}
              style={{padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.85rem'}}>
              {['Spiritual Growth','Prayer Life','Scripture Study','Community/Church','Service','Fasting','Evangelism','Discipleship'].map(c => <option key={c}>{c}</option>)}
            </select>
            <button className="primary-btn" onClick={() => {
              if (!newFaithGoal.text.trim()) return
              saveFaithGoals([{...newFaithGoal, id: Date.now(), done: false}, ...faithGoals])
              setNewFaithGoal({ text: '', category: 'Spiritual Growth', done: false })
            }}>+ Add Goal</button>
          </div>
        </section>
      )}
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
