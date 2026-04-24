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
    habits: [
    { id: 1, title: 'Wake up earlier', category: 'Health' },
    { id: 2, title: 'Meditate daily', category: 'Wellness' },
    { id: 3, title: 'Drink more water', category: 'Health' },
    { id: 4, title: 'Stay active', category: 'Health' },
    { id: 5, title: 'Practice gratitude', category: 'Wellness' },
    { id: 6, title: 'Eat mindfully', category: 'Health' },
    { id: 7, title: 'Cook your own meals', category: 'Health' },
    { id: 8, title: 'Make gut health a priority', category: 'Health' },
    { id: 9, title: 'Protect your skin', category: 'Health' },
    { id: 10, title: 'Invest in yourself', category: 'Productivity' },
    { id: 11, title: 'Track your goals', category: 'Productivity' },
    { id: 12, title: 'Do hardest tasks first', category: 'Productivity' },
    { id: 13, title: 'Hold yourself accountable', category: 'Productivity' },
    { id: 14, title: 'Take action', category: 'Productivity' },
    { id: 15, title: 'Create more things', category: 'Productivity' },
    { id: 16, title: 'Deepen your relationships', category: 'Lifestyle' },
    { id: 17, title: 'Choose the right friends', category: 'Lifestyle' },
    { id: 18, title: 'Spend more time in nature', category: 'Lifestyle' },
    { id: 19, title: 'Embrace the small things', category: 'Lifestyle' },
    { id: 20, title: 'Invest in experiences', category: 'Lifestyle' },
    { id: 21, title: 'Stay inspired', category: 'Wellness' },
    { id: 22, title: 'Have mental reset days', category: 'Wellness' },
    { id: 23, title: 'Ditch the scarcity mindset', category: 'Wellness' },
    { id: 24, title: 'Know yourself better', category: 'Wellness' },
    { id: 25, title: 'Challenge your views', category: 'Wellness' },
    { id: 26, title: 'Be OK with saying no', category: 'Wellness' },
    { id: 27, title: 'Diversify your income streams', category: 'Finances' },
    { id: 28, title: 'Shop smarter', category: 'Finances' },
    { id: 29, title: 'Go green', category: 'Lifestyle' },
    { id: 30, title: 'Test your limits', category: 'Health' },
  ],
  habitLogs: [],
  budget: { weeklyTarget: 350 },
  profile: {
    displayName: 'Anthony',
    timezone: 'America/Chicago',
    plannerMode: 'Balanced',
  },
  settings: {
    onboardingComplete: false,
    showCompletedTasks: true,
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
  const next = { ...payload, user_id: userId }
  if ('linkedGoalId' in next) next.linkedGoalId = next.linkedGoalId ? Number(next.linkedGoalId) : null
  if ('linkedProjectId' in next) next.linkedProjectId = next.linkedProjectId ? Number(next.linkedProjectId) : null
  if ('goalId' in next) next.goalId = next.goalId ? Number(next.goalId) : null
  if ('linkedId' in next) next.linkedId = next.linkedId ? Number(next.linkedId) : null
  if (type === 'expense') next.amount = Number(next.amount)
  if (type === 'task' && !next.recurrence) next.recurrence = 'none'
  return next
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

  return {
    ...rows,
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
      const { data, error } = await supabase.from('habit_logs').insert({ habitId, date, completed: true, user_id: userId }).select().single()
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
const MOCK_EMAIL = 'demo@planner.local'

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
const subRoutes = ['/habits', '/goals', '/finance', '/wellness', '/productivity', '/lifestyle', '/health', '/projects']

function Layout({ children, onQuickAdd, banner, profile }) {
  const location = useLocation()
  const displayName = profile?.displayName || 'Planner'
  const { isDesktop, isMobile } = useResponsive()

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

      <div className={isDesktop ? 'app-frame desktop-frame' : 'app-frame'}>
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
    { to:'/wellness', icon:'🌿', label:'Health & Wellness', color:'#22C55E', count: null },
    
    { to:'/productivity', icon:'⚡', label:'Productivity', color:'#F0B429',       count: null },
    { to:'/lifestyle',    icon:'🌍', label:'Lifestyle',    color:'var(--slate)',   count: null },
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


function FinancePage({ expenses, budget, setBudget }) {
  const LS_KEY = (k) => 'planner.' + k
  const lsGet = (k, d) => { try { const v = localStorage.getItem(LS_KEY(k)); return v ? JSON.parse(v) : d } catch { return d } }
  const lsSet = (k, v) => { try { localStorage.setItem(LS_KEY(k), JSON.stringify(v)) } catch {} }

  const [tab, setTab] = useState('overview')
  const [debts, setDebts] = useState(() => { try { const v = localStorage.getItem('planner.f.debts'); return v ? JSON.parse(v) : [] } catch { return [] } })
  const [newDebt, setNewDebt] = useState({ name: '', balance: '', rate: '', minPayment: '' })
  const [newBudgetLine, setNewBudgetLine] = useState({ category: '', budgeted: '', actual: '' })
  const [budgetLines, setBudgetLines] = useState(() => { try { const v = localStorage.getItem('planner.f.budgetlines'); return v ? JSON.parse(v) : [] } catch { return [] } })
  const saveDebts = (d) => { setDebts(d); try { localStorage.setItem('planner.f.debts', JSON.stringify(d)) } catch {} }
  const saveBudgetLines = (b) => { setBudgetLines(b); try { localStorage.setItem('planner.f.budgetlines', JSON.stringify(b)) } catch {} }
  const [savings, setSavings] = useState(() => lsGet('savings', { goal: 1000, current: 0, label: 'Emergency Fund' }))
  const [noSpend, setNoSpend] = useState(() => lsGet('noSpend', { days: 30, checked: [] }))
  const [monthlyBudget, setMonthlyBudget] = useState(() => lsGet('monthlyBudget', { income: 0, bills: [], subscriptions: [] }))
  const fpWeekStart = startOfWeek(TODAY)
  const fpWeekEnd = endOfWeek(TODAY)
  const fpWeekExpenses = (expenses || []).filter(e => e.date >= fpWeekStart && e.date <= fpWeekEnd)
  const fpWeekSpend = fpWeekExpenses.reduce((s, e) => s + parseFloat(e.amount || 0), 0)
  const fpMonthExpenses = (expenses || []).filter(e => e.date && e.date.slice(0, 7) === TODAY.slice(0, 7))
  const fpMonthSpend = fpMonthExpenses.reduce((s, e) => s + parseFloat(e.amount || 0), 0)
  const [newBill, setNewBill] = useState({ label: '', amount: '' })
  const [newSub, setNewSub] = useState({ label: '', amount: '', cycle: 'monthly' })

  const saveSavings = (s) => { setSavings(s); lsSet('savings', s) }
  const saveNoSpend = (n) => { setNoSpend(n); lsSet('noSpend', n) }
  const saveMonthly = (m) => { setMonthlyBudget(m); lsSet('monthlyBudget', m) }

  const totalBills = monthlyBudget.bills.reduce((s, b) => s + Number(b.amount || 0), 0)
  const totalSubs = monthlyBudget.subscriptions.reduce((s, b) => s + Number(b.amount || 0), 0)
  const monthlyExpenses = expenses.reduce((s, e) => s + Number(e.amount || 0), 0)
  const savingsPct = Math.min((savings.current / savings.goal) * 100, 100)
  const noSpendFilled = noSpend.checked.length
  const daysArray = Array.from({ length: noSpend.days }, (_, i) => i + 1)

  const TABS = [
    { id: 'overview', label: '📊 Overview' }, { id: 'debt', label: '📉 Debt Tracker' }, { id: 'budget', label: '📋 Monthly Budget' }, { id: 'nospend', label: '🌿 No-Spend' },
  ]

  return (
    <div className="screen-stack">
      <div style={{display:"flex",alignItems:"center",gap:8,paddingBottom:2}}>
        <span style={{fontSize:"1.1rem"}}>💰</span>
        <p style={{fontSize:".62rem",fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:"var(--brass)",margin:0}}>Finance</p>
      </div>
      <div className="pill-row" style={{ overflowX: 'auto', flexWrap: 'nowrap', paddingBottom: 4 }}>
        {TABS.map(t => (
          <button key={t.id} className={tab === t.id ? 'pill active-pill' : 'pill'}
            onClick={() => setTab(t.id)} style={{ whiteSpace: 'nowrap', fontSize: '.82rem' }}>{t.label}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          <section className="card">
            <p className="eyebrow">Monthly Summary</p>
            <h3 style={{ margin: '4px 0 14px' }}>Financial Overview</h3>
            {[
              ['Monthly Income', `$${Number(monthlyBudget.income).toFixed(2)}`, 'var(--success)'],
              ['Monthly Bills', `$${totalBills.toFixed(2)}`, 'var(--danger)'],
              ['Subscriptions', `$${totalSubs.toFixed(2)}`, 'var(--warning)'],
              ['Other Expenses', `$${monthlyExpenses.toFixed(2)}`, 'var(--teal)'],
              ['This Week', `$${fpWeekSpend.toFixed(2)}`, 'var(--brass)'],
              ['This Month', `$${fpMonthSpend.toFixed(2)}`, 'var(--slate)'],
              ['Net', `$${(Number(monthlyBudget.income) - totalBills - totalSubs - monthlyExpenses).toFixed(2)}`, 'var(--navy)'],
            ].map(([label, val, color]) => (
              <div key={label} className="metric-row card-row">
                <span style={{ color: 'var(--text2)', fontSize: '.9rem' }}>{label}</span>
                <strong style={{ color }}>{val}</strong>
              </div>
            ))}
          </section>
          <section className="card">
            <p className="eyebrow">Weekly Budget</p>
            <h3 style={{ margin: '4px 0 10px' }}>Weekly Spending Target</h3>
            <p className="muted" style={{ fontSize: '.82rem', marginBottom: 10 }}>This target tracks discretionary spending only — not bills or subscriptions. Your life score won't penalize bill payments.</p>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input type="number" value={budget.weeklyTarget}
                onChange={e => setBudget({ weeklyTarget: Number(e.target.value) })}
                style={{ flex: 1, padding: '10px 12px', border: '1.5px solid var(--border2)', borderRadius: 'var(--radius-sm)', fontSize: '1rem' }} />
              <span style={{ color: 'var(--muted)', fontSize: '.85rem' }}>/ week</span>
            </div>
          </section>
        </>
      )}


      {tab === 'debt' && (
        <div>
          <section className="card">
            <p className="eyebrow">Debt Payoff Tracker</p>
            <h3 style={{margin:'4px 0 6px'}}>Your Balances</h3>
            <p className="muted" style={{fontSize:'.8rem',marginBottom:12}}>Avalanche method: pay minimums on all, attack highest rate first.</p>
            {debts.length === 0 && <p className="muted" style={{fontSize:'.85rem',marginBottom:12}}>No debts tracked yet.</p>}
            {debts.map((debt,i) => {
              const progress = Math.max(0, Math.min(100, 100 - (parseFloat(debt.balance) / parseFloat(debt.originalBalance||debt.balance)) * 100))
              return (
                <div key={i} style={{marginBottom:14,paddingBottom:14,borderBottom:'1px solid var(--stone2)'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:6}}>
                    <div>
                      <div style={{fontWeight:700,fontSize:'.9rem',color:'var(--ink)'}}>{debt.name}</div>
                      <div style={{fontSize:'.75rem',color:'var(--muted)'}}>Rate: {debt.rate}% · Min: ${debt.minPayment}/mo</div>
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      <div style={{fontWeight:700,color:'var(--danger)',fontSize:'1rem'}}>${parseFloat(debt.balance||0).toLocaleString()}</div>
                      <button onClick={()=>saveDebts(debts.filter((_,j)=>j!==i))} style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer'}}>✕</button>
                    </div>
                  </div>
                  <div style={{height:6,background:'var(--stone2)',borderRadius:999,overflow:'hidden'}}>
                    <div style={{height:'100%',width:`${progress}%`,background:'var(--success)',borderRadius:999,transition:'width .4s'}} />
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',marginTop:4}}>
                    <input type="number" placeholder="Update balance" style={{flex:1,padding:'6px 10px',border:'1px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.78rem',background:'var(--stone)',marginRight:8}}
                      onBlur={e=>{if(!e.target.value)return;const updated=[...debts];updated[i]={...debt,balance:e.target.value};saveDebts(updated);e.target.value=''}} />
                    <span style={{fontSize:'.72rem',color:'var(--success)',fontWeight:600,alignSelf:'center'}}>{progress.toFixed(0)}% paid</span>
                  </div>
                </div>
              )
            })}
            <div style={{display:'grid',gap:8,marginTop:12}}>
              <input placeholder="Debt name (e.g. Chase Card)" value={newDebt.name} onChange={e=>setNewDebt(p=>({...p,name:e.target.value}))}
                style={{padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.88rem',background:'var(--stone)',color:'var(--text)'}} />
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
                <input placeholder="Balance $" type="number" value={newDebt.balance} onChange={e=>setNewDebt(p=>({...p,balance:e.target.value,originalBalance:e.target.value}))}
                  style={{padding:'9px 8px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.82rem',background:'var(--stone)',color:'var(--text)'}} />
                <input placeholder="APR %" type="number" value={newDebt.rate} onChange={e=>setNewDebt(p=>({...p,rate:e.target.value}))}
                  style={{padding:'9px 8px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.82rem',background:'var(--stone)',color:'var(--text)'}} />
                <input placeholder="Min $/mo" type="number" value={newDebt.minPayment} onChange={e=>setNewDebt(p=>({...p,minPayment:e.target.value}))}
                  style={{padding:'9px 8px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.82rem',background:'var(--stone)',color:'var(--text)'}} />
              </div>
              <button className="primary-btn" onClick={()=>{if(!newDebt.name||!newDebt.balance)return;saveDebts([...debts,{...newDebt,id:Date.now()}]);setNewDebt({name:'',balance:'',rate:'',minPayment:''})}}>Add Debt</button>
            </div>
          </section>
          {debts.length > 0 && (
            <section className="card">
              <p className="eyebrow">Summary</p>
              <h3 style={{margin:'4px 0 12px'}}>Total Debt</h3>
              <div style={{fontFamily:'var(--serif)',fontSize:'2rem',fontWeight:500,color:'var(--danger)',marginBottom:4}}>
                ${debts.reduce((s,d)=>s+parseFloat(d.balance||0),0).toLocaleString()}
              </div>
              <div style={{fontSize:'.8rem',color:'var(--muted)'}}>Combined minimum payments: ${debts.reduce((s,d)=>s+parseFloat(d.minPayment||0),0).toFixed(0)}/mo</div>
            </section>
          )}
        </div>
      )}

      {tab === 'budget' && (
        <div>
          <section className="card">
            <p className="eyebrow">Monthly Budget</p>
            <h3 style={{margin:'4px 0 6px'}}>Planned vs Actual</h3>
            <p className="muted" style={{fontSize:'.8rem',marginBottom:12}}>Track each spending category for the month.</p>
            {budgetLines.length === 0 && <p className="muted" style={{fontSize:'.85rem',marginBottom:12}}>No budget lines yet.</p>}
            {budgetLines.map((line,i) => {
              const budgeted = parseFloat(line.budgeted||0)
              const actual = parseFloat(line.actual||0)
              const pct = budgeted > 0 ? Math.min(100, (actual/budgeted)*100) : 0
              const over = actual > budgeted
              return (
                <div key={i} style={{marginBottom:14,paddingBottom:14,borderBottom:'1px solid var(--stone2)'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                    <div style={{fontWeight:600,fontSize:'.88rem',color:'var(--ink)'}}>{line.category}</div>
                    <div style={{display:'flex',gap:8,alignItems:'center'}}>
                      <span style={{fontSize:'.8rem',color:over?'var(--danger)':'var(--muted)'}}>${actual.toFixed(0)} / ${budgeted.toFixed(0)}</span>
                      <button onClick={()=>saveBudgetLines(budgetLines.filter((_,j)=>j!==i))} style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer'}}>✕</button>
                    </div>
                  </div>
                  <div style={{height:6,background:'var(--stone2)',borderRadius:999,overflow:'hidden'}}>
                    <div style={{height:'100%',width:`${pct}%`,background:over?'var(--danger)':pct>80?'var(--warning)':'var(--success)',borderRadius:999}} />
                  </div>
                  <input type="number" placeholder="Update actual spent" style={{width:'100%',marginTop:6,padding:'6px 10px',border:'1px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.78rem',background:'var(--stone)'}}
                    onBlur={e=>{if(!e.target.value)return;const u=[...budgetLines];u[i]={...line,actual:e.target.value};saveBudgetLines(u);e.target.value=''}} />
                </div>
              )
            })}
            <div style={{display:'grid',gap:8,marginTop:12}}>
              <input placeholder="Category (e.g. Groceries, Gas, Dining)" value={newBudgetLine.category} onChange={e=>setNewBudgetLine(p=>({...p,category:e.target.value}))}
                style={{padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.88rem',background:'var(--stone)',color:'var(--text)'}} />
              <div style={{display:'flex',gap:8}}>
                <input placeholder="Budgeted $" type="number" value={newBudgetLine.budgeted} onChange={e=>setNewBudgetLine(p=>({...p,budgeted:e.target.value}))}
                  style={{flex:1,padding:'9px 10px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.85rem',background:'var(--stone)',color:'var(--text)'}} />
                <input placeholder="Actual $" type="number" value={newBudgetLine.actual} onChange={e=>setNewBudgetLine(p=>({...p,actual:e.target.value}))}
                  style={{flex:1,padding:'9px 10px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.85rem',background:'var(--stone)',color:'var(--text)'}} />
              </div>
              <button className="primary-btn" onClick={()=>{if(!newBudgetLine.category||!newBudgetLine.budgeted)return;saveBudgetLines([...budgetLines,{...newBudgetLine,id:Date.now()}]);setNewBudgetLine({category:'',budgeted:'',actual:''})}}>Add Budget Line</button>
            </div>
            {budgetLines.length > 0 && (
              <div style={{marginTop:14,padding:'12px',background:'var(--stone)',borderRadius:'var(--radius-sm)'}}>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:'.88rem'}}>
                  <span style={{fontWeight:700,color:'var(--ink)'}}>Total Budgeted</span>
                  <span style={{fontWeight:700,color:'var(--teal)'}}>${budgetLines.reduce((s,l)=>s+parseFloat(l.budgeted||0),0).toFixed(0)}</span>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:'.88rem',marginTop:4}}>
                  <span style={{fontWeight:700,color:'var(--ink)'}}>Total Spent</span>
                  <span style={{fontWeight:700,color:'var(--danger)'}}>${budgetLines.reduce((s,l)=>s+parseFloat(l.actual||0),0).toFixed(0)}</span>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {tab === 'nospend' && (
        <section className="card">
          <p className="eyebrow">Save More</p>
          <h3 style={{margin:'4px 0 10px'}}>35 No-Spend Weekend Ideas</h3>
          <p className="muted" style={{fontSize:'.82rem',marginBottom:12}}>Free things to do that keep money in your pocket.</p>
          <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
            {['De-clutter and sell your stuff','Attend free music or movies in the park','Have a picnic','Hike','Go to a park','Bike ride','Play board games','Host a potluck','Learn a new skill','Read a book','Make a new recipe','Play with your kids','Create art for your home','Sort and organize photos','Build a fire','DIY something','Visit a free museum','Volunteer','Camp in your backyard','Go fishing','Go to the beach','Explore your library','Take pictures','Make a budget','Re-design a room','Make lists','Write your goals','Garden','Slow down and relax','Host a clothing swap','Write','Draw or paint','Play a video game','Organize your cabinets','Sit outside with coffee or tea'].map(item => (
              <span key={item} style={{
                padding:'5px 10px',borderRadius:999,
                border:'1px solid var(--border2)',
                background:'var(--stone)',
                fontSize:'.75rem',color:'var(--ink2)',
                display:'inline-block'
              }}>{item}</span>
            ))}
          </div>
        </section>
      )}
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

      <div className="pill-row" style={{overflowX:'auto',flexWrap:'nowrap',paddingBottom:4}}>
        {TABS.map(t => (
          <button key={t.id} className={tab===t.id?'pill active-pill':'pill'}
            onClick={() => setTab(t.id)} style={{whiteSpace:'nowrap',fontSize:'.82rem'}}>{t.label}
          </button>
        ))}
      </div>

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

    </div>
  )
}





function ProductivityPage({ tasks, onQuickCreate, onToggle, onEdit, onDelete, settings }) {
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
      <div className="pill-row" style={{ overflowX: 'auto', flexWrap: 'nowrap', paddingBottom: 4 }}>
        {[{ id: 'tasks', label: '✓ Tasks' }, { id: 'checklists', label: '📋 Checklists' }, { id: 'notes', label: '📝 Notes' }, { id: 'cleaning', label: '🧹 Cleaning' }].map(t => (
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
          <div className="section-title-row">
            <div><p className="eyebrow">Notes</p><h3>Quick Capture</h3></div>
            <button className="primary-btn" style={{fontSize:'.8rem',padding:'6px 12px'}} onClick={() => {
              const title = prompt('Note title:')
              if(!title) return
              const content = prompt('Note content:')
              const newNote = {id:Date.now(),title,content:content||'',date:TODAY}
              const updated = [newNote, ...notes]
              setNotes(updated)
              try{localStorage.setItem('planner.notes',JSON.stringify(updated))}catch{}
            }}>+ Note</button>
          </div>
          <input placeholder="Search notes..." value={noteQuery} onChange={e=>setNoteQuery(e.target.value)}
            style={{width:'100%',padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.85rem',marginBottom:12,background:'var(--stone)',color:'var(--text)'}} />
          {notes.filter(n => !noteQuery || n.title.toLowerCase().includes(noteQuery.toLowerCase()) || (n.content||'').toLowerCase().includes(noteQuery.toLowerCase())).length === 0
            ? <p className="muted" style={{fontSize:'.85rem'}}>No notes yet. Capture your first thought.</p>
            : notes.filter(n => !noteQuery || n.title.toLowerCase().includes(noteQuery.toLowerCase()) || (n.content||'').toLowerCase().includes(noteQuery.toLowerCase())).map(note => (
            <div key={note.id} style={{padding:'10px 0',borderBottom:'1px solid var(--stone2)'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:4}}>
                <strong style={{fontSize:'.9rem',color:'var(--ink)'}}>{note.title}</strong>
                <div style={{display:'flex',gap:6,flexShrink:0}}>
                  <span style={{fontSize:'.72rem',color:'var(--muted)'}}>{note.date}</span>
                  <button style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',fontSize:'.9rem'}} onClick={()=>{
                    const updated = notes.filter(n=>n.id!==note.id)
                    setNotes(updated)
                    try{localStorage.setItem('planner.notes',JSON.stringify(updated))}catch{}
                  }}>✕</button>
                </div>
              </div>
              <p style={{fontSize:'.82rem',color:'var(--text2)',lineHeight:1.5}}>{note.content}</p>
            </div>
          ))}
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

    </div>
  )
}

// ── LIFESTYLE PAGE ─────────────────────────────────────────────────────────
function LifestylePage() {
  const lsGet = (k, d) => { try { const v = localStorage.getItem('planner.l.' + k); return v ? JSON.parse(v) : d } catch { return d } }
  const lsSet = (k, v) => { try { localStorage.setItem('planner.l.' + k, JSON.stringify(v)) } catch {} }

  const [tab, setTab] = useState('braindump')
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
  const [brainDump, setBrainDump] = useState(() => lsGet('brainDump', ''))
  const [form, setForm] = useState({})
  const save = (key, setter, val) => { setter(val); lsSet(key, val) }

  const TABS = [
    { id: 'braindump', label: '🧠 Brain Dump' }, { id: 'groceries', label: '🛒 Groceries' },
    { id: 'trips', label: '✈ Trips' }, { id: 'birthdays', label: '🎂 Birthdays' },
    { id: 'contacts', label: '👥 Contacts' }, { id: 'passwords', label: '🔑 Passwords' },
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
      <div className="pill-row" style={{ overflowX: 'auto', flexWrap: 'nowrap', paddingBottom: 4 }}>
        {TABS.map(t => (
          <button key={t.id} className={tab === t.id ? 'pill active-pill' : 'pill'}
            onClick={() => setTab(t.id)} style={{ whiteSpace: 'nowrap', fontSize: '.8rem' }}>{t.label}</button>
        ))}
      </div>

      {tab === 'braindump' && (
        <section className="card">
          <p className="eyebrow">Brain Dump</p>
          <h3 style={{ margin: '4px 0 12px' }}>Clear Your Head</h3>
          <textarea value={brainDump} onChange={e => save('brainDump', setBrainDump, e.target.value)}
            placeholder="Dump everything here — ideas, worries, random thoughts, lists, anything on your mind..."
            style={{ width: '100%', minHeight: 280, padding: 14, border: '1.5px solid var(--border2)', borderRadius: 'var(--radius-sm)', fontSize: '.9rem', lineHeight: 1.7, resize: 'vertical', color: 'var(--text)', background: 'var(--surface)' }} />
          <p style={{ fontSize: '.75rem', color: 'var(--muted)', marginTop: 6 }}>Saved automatically as you type.</p>
        </section>
      )}

      {tab === 'groceries' && (
        <section className="card">
          <p className="eyebrow">Grocery List</p>
          <h3 style={{ margin: '4px 0 12px' }}>Shopping List</h3>
          {groceries.map((item, i) => (
            <div key={i} onClick={() => save('groceries', setGroceries, groceries.map((g, j) => j === i ? { ...g, done: !g.done } : g))}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--surface)', cursor: 'pointer' }}>
              <div style={{ width: 22, height: 22, borderRadius: 6, border: '2px solid', borderColor: item.done ? 'var(--teal)' : 'var(--border2)', background: item.done ? 'var(--teal)' : 'transparent', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                {item.done && <span style={{ color: 'var(--navy)', fontWeight: 700, fontSize: '.8rem' }}>✓</span>}
              </div>
              <span style={{ flex: 1, textDecoration: item.done ? 'line-through' : 'none', color: item.done ? 'var(--muted)' : 'var(--text)', fontSize: '.9rem' }}>{item.label}</span>
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
              onClick={() => { if (!form.grocLabel) return; save('groceries', setGroceries, [...groceries, { label: form.grocLabel, qty: form.grocQty, done: false }]); setForm(p => ({ ...p, grocLabel: '', grocQty: '' })) }}>Add</button>
          </div>
          {groceries.some(g => g.done) && (
            <button className="ghost-btn" style={{ marginTop: 10, fontSize: '.82rem' }}
              onClick={() => save('groceries', setGroceries, groceries.filter(g => !g.done))}>Clear Checked</button>
          )}
        </section>
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
    </div>
  )
}

// ── HEALTH PAGE ───────────────────────────────────────────────────────────

function HabitsPage({ habits, habitLogs, onToggleHabit, onEdit, onDelete, onQuickCreate }) {
  const weekStart = startOfWeek(TODAY)
  const weekEnd = endOfWeek(TODAY)
  const weekLogs = habitLogs.filter(l => l.date >= weekStart && l.date <= weekEnd)

  const SUGGESTED = [
    ['Wake up earlier','Health'],['Meditate daily','Wellness'],['Drink more water','Health'],
    ['Stay active','Health'],['Practice gratitude','Wellness'],['Eat mindfully','Health'],
    ['Cook your own meals','Health'],['Do hardest tasks first','Productivity'],
    ['Hold yourself accountable','Productivity'],['Track your goals','Productivity'],
    ['Invest in yourself','Productivity'],['Deepen your relationships','Lifestyle'],
    ['Spend more time in nature','Lifestyle'],['Stay inspired','Wellness'],
    ['Have mental reset days','Wellness'],['Know yourself better','Wellness'],
    ['Be OK with saying no','Wellness'],['Diversify your income streams','Finances'],
    ['Shop smarter','Finances'],['Test your limits','Health'],
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
        <h3 style={{margin:'4px 0 10px'}}>30 Powerful Habits</h3>
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
      
      <section className="card" style={{background:'var(--ink)',border:'none'}}>
        <p className="eyebrow" style={{color:'var(--brass)'}}>Vision & Affirmations</p>
        <h3 style={{color:'var(--warm-white)',margin:'4px 0 12px',fontSize:'1.1rem'}}>Speak it before you see it</h3>
        {visionItems.length === 0 && <p style={{color:'rgba(255,255,255,.45)',fontSize:'.85rem',marginBottom:10}}>Add affirmations or vision statements. Read them daily.</p>}
        {visionItems.map((item,i) => (
          <div key={i} style={{padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,.08)',display:'flex',alignItems:'flex-start',gap:10}}>
            <span style={{color:'var(--brass)',fontSize:'1rem',flexShrink:0,marginTop:2}}>✦</span>
            <div style={{flex:1,fontFamily:'var(--serif)',fontSize:'.95rem',color:'rgba(255,255,255,.85)',lineHeight:1.6,fontStyle:'italic'}}>{item.text}</div>
            <button onClick={()=>saveVision(visionItems.filter((_,j)=>j!==i))} style={{background:'none',border:'none',color:'rgba(255,255,255,.3)',cursor:'pointer',flexShrink:0}}>✕</button>
          </div>
        ))}
        <div style={{display:'flex',gap:8,marginTop:12}}>
          <input value={newVision} onChange={e=>setNewVision(e.target.value)}
            placeholder="I am... I have... I will..."
            style={{flex:1,padding:'10px 12px',border:'1px solid rgba(184,150,90,.3)',borderRadius:'var(--radius-sm)',fontSize:'.88rem',background:'rgba(255,255,255,.06)',color:'white',fontFamily:'var(--serif)'}} />
          <button onClick={()=>{if(!newVision.trim())return;saveVision([...visionItems,{text:newVision.trim(),id:Date.now()}]);setNewVision('')}}
            style={{padding:'10px 16px',borderRadius:'var(--radius-sm)',border:'none',background:'var(--brass)',color:'var(--ink)',fontWeight:700,cursor:'pointer',fontFamily:'var(--sans)',flexShrink:0}}>Add</button>
        </div>
      </section>

      </div>
            <div style={{height:6,background:'var(--stone2)',borderRadius:999,overflow:'hidden'}}>
              <div style={{height:'100%',width:`${progress}%`,background:progress>=100?'var(--success)':'var(--brass)',borderRadius:999,transition:'width .4s'}} />
            </div>
          </section>
        )
      })}
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
    recovery: scores.Wellness < 6 ? 'Wellness is trailing. Build in recovery and reflection blocks.' : 'Wellness held steady. Keep the rhythm.',
    money: scores.Finances >= 7 ? 'Finances stayed inside the guardrails.' : 'Finances need a closer reset and review.',
  }

  const SCORE_GUIDE = [
    { name: 'Health', color: '#E85555', how: 'Health category task completion + Health habit logs. Complete health tasks and log workouts to raise it.' },
    { name: 'Lifestyle', color: '#F0B429', how: 'Lifestyle category task completion. Schedule and complete lifestyle tasks to raise it.' },
    { name: 'Productivity', color: '#00C2B3', how: 'Productivity category task completion. Completing work and project tasks raises this score.' },
    { name: 'Wellness', color: '#22C55E', how: 'Wellness task completion + Wellness habit logs. Prayer, journaling, rest — log them as habits.' },
    { name: 'Finances', color: '#6366F1', how: 'Discretionary weekly spending vs your target. Bills and rent do NOT count against you — only flexible spending.' },
  ]

  return (
    <div className="screen-stack">

      {/* ── Life Score ─────────────────────────────────────────── */}
      <section className="card premium-card">
        <div className="section-title-row">
          <div>
            <p className="eyebrow">Auto Scorecard</p>
            <h3>Life Balance</h3>
          </div>
          <div style={{display:'flex', gap:8, alignItems:'center'}}>
            <span className="status-pill">Self-updating</span>
            <button onClick={() => setShowScoreInfo(s => !s)}
              style={{background:'none', border:'1.5px solid var(--border2)', borderRadius:999, padding:'4px 10px', fontSize:'.75rem', color:'var(--muted)', cursor:'pointer', fontFamily:'inherit'}}>
              {showScoreInfo ? 'Hide' : 'How scores work'}
            </button>
          </div>
        </div>

        {/* Score bars */}
        {Object.entries(scores).map(([name, value]) => (
          <div key={name} className="score-line" style={{gap:10}}>
            <span style={{minWidth:90, fontSize:'.88rem', color:'var(--text2)', fontWeight:500}}>{name}</span>
            <div className="score-bar" style={{flex:1}}>
              <div style={{
                width: `${value * 10}%`,
                background: value >= 7 ? 'var(--success)' : value >= 5 ? 'var(--teal)' : 'var(--danger)',
                height: '100%', borderRadius: 999, transition: 'width .4s'
              }} />
            </div>
            <strong style={{
              minWidth:32, textAlign:'right', fontSize:'.9rem',
              color: value >= 7 ? 'var(--success)' : value >= 5 ? 'var(--teal)' : 'var(--danger)'
            }}>{value + '/10'}</strong>
          </div>
        ))}

        {/* Score explanation */}
        {showScoreInfo && (
          <div style={{marginTop:14, borderTop:'1px solid var(--surface)', paddingTop:14}}>
            <p className="eyebrow" style={{marginBottom:10}}>How Each Score Is Calculated</p>
            {SCORE_GUIDE.map(s => (
              <div key={s.name} style={{display:'flex', gap:10, padding:'8px 0', borderBottom:'1px solid var(--surface)', alignItems:'flex-start'}}>
                <div style={{width:10, height:10, borderRadius:'50%', background:s.color, flexShrink:0, marginTop:4}} />
                <div>
                  <div style={{fontWeight:700, fontSize:'.85rem', color:'var(--text)', marginBottom:2}}>{s.name}</div>
                  <div style={{fontSize:'.78rem', color:'var(--muted)', lineHeight:1.5}}>{s.how}</div>
                </div>
              </div>
            ))}
            <div style={{marginTop:10, padding:10, background:'var(--teal-dim)', borderRadius:'var(--radius-sm)', fontSize:'.78rem', color:'var(--text2)', lineHeight:1.5}}>
              💡 Scores update automatically as you complete tasks, log habits, and manage spending. A score of 5 means you have no data yet — it rises as you engage.
            </div>
          </div>
        )}
      </section>

      {/* ── Weekly Review ──────────────────────────────────────── */}
      <section className="card premium-card">
        <div className="section-title-row">
          <div>
            <p className="eyebrow">Weekly Review</p>
            <h3>What the week is saying</h3>
          </div>
          <span className="status-pill">{completedWeekLogs} habit wins</span>
        </div>
        <div className="review-grid">
          <div className="review-card"><strong>Win</strong><p>{weeklyReview.win}</p></div>
          <div className="review-card"><strong>Recovery</strong><p>{weeklyReview.recovery}</p></div>
          <div className="review-card"><strong>Finances</strong><p>{weeklyReview.money}</p></div>
        </div>
      </section>

      {/* ── Habits ─────────────────────────────────────────────── */}
      <section className="card premium-card">
        <div className="section-title-row">
          <h3>Habits</h3>
          <button className="primary-btn" style={{fontSize:'.8rem', padding:'6px 12px'}} onClick={() => onQuickCreate('habit')}>+ Habit</button>
        </div>
        {habits.length === 0 && (
          <div>
            <p className="muted" style={{fontSize:'.85rem', marginBottom:12}}>No habits yet. Tap any suggestion to add it instantly:</p>
            <div style={{display:'flex', flexWrap:'wrap', gap:6, marginBottom:12}}>
              {[
                ['Wake up earlier','Health'],['Meditate daily','Wellness'],['Drink more water','Health'],
                ['Stay active','Health'],['Practice gratitude','Wellness'],['Eat mindfully','Health'],
                ['Cook your own meals','Health'],['Do hardest tasks first','Productivity'],
                ['Hold yourself accountable','Productivity'],['Track your goals','Productivity'],
                ['Invest in yourself','Productivity'],['Deepen your relationships','Lifestyle'],
                ['Spend more time in nature','Lifestyle'],['Stay inspired','Wellness'],
                ['Have mental reset days','Wellness'],['Know yourself better','Wellness'],
                ['Be OK with saying no','Wellness'],['Diversify your income streams','Finances'],
                ['Shop smarter','Finances'],['Test your limits','Health'],
              ].map(([title, cat]) => (
                <button key={title} onClick={() => onQuickCreate('habit', {title, category:cat})}
                  style={{padding:'6px 12px', borderRadius:999, border:'1.5px solid var(--border2)', background:'var(--surface)', color:'var(--text2)', fontSize:'.78rem', cursor:'pointer', fontFamily:'inherit', fontWeight:500}}>
                  + {title}
                </button>
              ))}
            </div>
          </div>
        )}
        {habits.map((habit) => {
          const logs = habitLogs.filter((log) => log.habitId === habit.id)
          const todayLog = logs.find((log) => isToday(log.date))
          const weekComplete = weekLogs.filter(l => l.habitId === habit.id && l.completed).length
          return (
            <div key={habit.id} className="metric-row card-row" style={{alignItems:'flex-start', paddingTop:12, paddingBottom:12}}>
              <div style={{flex:1, minWidth:0}}>
                <div style={{fontWeight:600, fontSize:'.9rem', color:'var(--text)', marginBottom:2}}>{habit.title}</div>
                <div style={{fontSize:'.75rem', color:'var(--muted)'}}>{habit.category + ' · ' + weekComplete + '/7'} this week</div>
              </div>
              <div style={{display:'flex', gap:6, flexShrink:0}}>
                <button
                  className={todayLog?.completed ? 'secondary-btn' : 'primary-btn'}
                  style={{fontSize:'.78rem', padding:'6px 12px'}}
                  onClick={() => onToggleHabit(habit.id, TODAY)}>
                  {todayLog?.completed ? '✓ Done' : 'Log Today'}
                </button>
                <button className="ghost-btn" style={{fontSize:'.78rem', padding:'6px 10px'}} onClick={() => onEdit('habit', habit)}>Edit</button>
                <button style={{background:'none', border:'none', color:'var(--muted)', cursor:'pointer'}} onClick={() => onDelete('habit', habit.id)}>✕</button>
              </div>
            </div>
          )
        })}
      </section>

      {/* ── Weekly Budget ──────────────────────────────────────── */}
      <section className="card premium-card">
        <p className="eyebrow">Finance</p>
        <h3 style={{margin:'4px 0 10px'}}>Weekly Spending Target</h3>
        <p className="muted" style={{fontSize:'.8rem', marginBottom:10}}>Discretionary spending only — bills, rent, and utilities don't count against this.</p>
        <div style={{display:'flex', gap:10, alignItems:'center'}}>
          <input type="number" value={budget.weeklyTarget}
            onChange={(e) => setBudget({ weeklyTarget: Number(e.target.value) })}
            style={{flex:1, padding:'10px 12px', border:'1.5px solid var(--border2)', borderRadius:'var(--radius-sm)', fontSize:'1rem'}} />
          <span style={{color:'var(--muted)', fontSize:'.85rem'}}>/week</span>
        </div>
      </section>

      {/* ── Goals ─────────────────────────────────────────────── */}
      <section className="card premium-card">
        <div className="section-title-row">
          <div><p className="eyebrow">Goals</p><h3>Your Goals</h3></div>
          <button className="primary-btn" style={{fontSize:'.8rem', padding:'6px 12px'}} onClick={() => onQuickCreate('goal')}>+ Goal</button>
        </div>
        {goals.length === 0
          ? <p className="muted" style={{fontSize:'.85rem'}}>No goals yet. Add something to work toward.</p>
          : goals.map((goal) => (
          <div key={goal.id} className="progress-block">
            <div className="metric-row compact-row" style={{padding:'6px 0'}}>
              <div style={{flex:1, minWidth:0}}>
                <div style={{fontWeight:600, fontSize:'.9rem', color:'var(--text)'}}>{goal.title}</div>
                <div style={{fontSize:'.75rem', color:'var(--muted)'}}>{goal.category} · {goal.targetDate}</div>
              </div>
              <div style={{display:'flex', alignItems:'center', gap:8, flexShrink:0}}>
                <strong style={{color:'var(--brass)', fontSize:'.88rem'}}>{getGoalProgress(goal.id, tasks, projects)}%</strong>
              </div>
            </div>
            <div className="mini-progress"><div style={{width:`${getGoalProgress(goal.id, tasks, projects)}%`,background:'var(--brass)',height:'100%',borderRadius:999}} /></div>
          </div>
        ))}
      </section>

      <section className="card">
        <p className="eyebrow">Weekly Review</p>
        <h3 style={{margin:'4px 0 10px'}}>End of Week Reflection</h3>
        <p className="muted" style={{fontSize:'.82rem',marginBottom:14}}>Take 10 minutes each week to reflect. Done consistently, this is one of the highest-leverage habits you can build.</p>
        {weeklyReviewPrompts.map((prompt,i) => (
          <div key={i} style={{marginBottom:14}}>
            <div style={{fontSize:'.78rem',fontWeight:700,color:'var(--brass)',marginBottom:6,letterSpacing:'.03em'}}>{prompt}</div>
            <textarea value={reviewAnswers[i]||''} onChange={e=>{const u={...reviewAnswers,[i]:e.target.value};setReviewAnswers(u);try{localStorage.setItem('planner.gr.review',JSON.stringify(u))}catch{}}}
              placeholder="Write freely..."
              style={{width:'100%',minHeight:70,padding:'10px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.85rem',fontFamily:'var(--serif)',color:'var(--ink)',background:'var(--stone)',resize:'none',lineHeight:1.6}} />
          </div>
        ))}
        <button className="primary-btn" style={{width:'100%',fontSize:'.88rem'}}
          onClick={()=>{
            const entry = {date:TODAY,answers:{...reviewAnswers},id:Date.now()}
            const prev = JSON.parse(localStorage.getItem('planner.gr.reviewHistory')||'[]')
            localStorage.setItem('planner.gr.reviewHistory',JSON.stringify([entry,...prev].slice(0,52)))
            setReviewAnswers({})
            localStorage.removeItem('planner.gr.review')
          }}>Save This Week's Review</button>
      </section>

      <section className="card">
        <p className="eyebrow">Goals</p>
        <h3 style={{margin:'4px 0 12px'}}>In Progress</h3>
        {goals.filter(g => !g.completed).slice(0,3).map(goal => (
          <div key={goal.id} style={{padding:'8px 0', borderBottom:'1px solid var(--stone2)'}}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4}}>
              <span style={{fontSize:'.9rem', color:'var(--text)', fontWeight:500}}>{goal.title}</span>
              <strong style={{color:'var(--brass)', fontSize:'.88rem'}}>{getGoalProgress(goal.id, tasks, projects)}%</strong>
            </div>
            <div className="mini-progress"><div style={{ width: `${getGoalProgress(goal.id, tasks, projects)}%` }} /></div>
          </div>
        ))}
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
        <div style={{marginBottom:12}}>
          <p className="eyebrow">Data & Sync</p>
          <h3 style={{margin:'4px 0 8px'}}>Cross-Device Sync</h3>
        </div>
        <div style={{display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:'var(--radius-sm)', background:'var(--surface)', marginBottom:12}}>
          <div style={{width:10, height:10, borderRadius:'50%', background: hasSupabaseEnv ? 'var(--success)' : 'var(--warning)', flexShrink:0}} />
          <div>
            <div style={{fontWeight:600, fontSize:'.88rem', color:'var(--text)'}}>{hasSupabaseEnv ? 'Supabase connected' : 'Demo mode — this device only'}</div>
            <div style={{fontSize:'.75rem', color:'var(--muted)'}}>{hasSupabaseEnv ? 'Your data syncs across all devices.' : 'Data saves locally. Add Supabase to sync.'}</div>
          </div>
        </div>
        {!hasSupabaseEnv && (
          <div style={{fontSize:'.8rem', color:'var(--text2)', lineHeight:1.7}}>
            <div style={{fontWeight:700, marginBottom:6, color:'var(--text)'}}>To enable sync:</div>
            <div style={{display:'grid', gap:6}}>
              {[
                '1. Create a free project at supabase.com',
                '2. Copy your Project URL and anon key',
                '3. In Vercel → Settings → Environment Variables:',
                '   VITE_SUPABASE_URL = your project URL',
                '   VITE_SUPABASE_ANON_KEY = your anon key',
                '4. Redeploy — sync activates automatically'
              ].map((step, i) => (
                <div key={i} style={{padding:'6px 10px', background:'var(--surface)', borderRadius:'var(--radius-sm)', fontFamily:'monospace', fontSize:'.78rem', color:'var(--text2)'}}>{step}</div>
              ))}
            </div>
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

function App() {
  return (
    <AppErrorBoundary>
      <AuthProvider><AuthGate fallback={<AuthPage />}><PlannerApp /></AuthGate></AuthProvider>
    </AppErrorBoundary>
  )
}


// ── Export ────────────────────────────────────────────────────────────────
export default App
