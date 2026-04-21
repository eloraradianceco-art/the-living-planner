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

  const spent = expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0)
  const financeScore = Math.max(1, Math.min(10, Math.round(((budget.weeklyTarget - spent) / budget.weeklyTarget) * 10 + 7)))

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
      label: date.slice(5),
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
  tasks: [
    {
      id: 1,
      title: 'Morning workout',
      completed: true,
      category: 'Health',
      date: TODAY,
      time: '06:30',
      linkedGoalId: 1,
      linkedProjectId: null,
      priority: 'High',
      recurrence: 'weekly',
    },
    {
      id: 2,
      title: 'Review budget and spending',
      completed: false,
      category: 'Finances',
      date: TODAY,
      time: '19:00',
      linkedGoalId: 3,
      linkedProjectId: null,
      priority: 'Medium',
      recurrence: 'weekly',
    },
    {
      id: 3,
      title: 'Draft section for TB manual',
      completed: false,
      category: 'Productivity',
      date: addDays(TODAY, 1),
      time: '09:30',
      linkedGoalId: 2,
      linkedProjectId: 1,
      priority: 'High',
      recurrence: 'none',
    },
    {
      id: 4,
      title: 'Prayer and journaling',
      completed: true,
      category: 'Wellness',
      date: TODAY,
      time: '05:45',
      linkedGoalId: 4,
      linkedProjectId: null,
      priority: 'Low',
      recurrence: 'daily',
    },
    {
      id: 5,
      title: 'Call insurance office',
      completed: false,
      category: 'Lifestyle',
      date: addDays(TODAY, -1),
      time: '',
      linkedGoalId: null,
      linkedProjectId: null,
      priority: 'Medium',
      recurrence: 'none',
    },
  ],
  goals: [
    { id: 1, title: 'Train 4x per week', category: 'Health', targetDate: addDays(TODAY, 45), why: 'Keep health moving forward' },
    { id: 2, title: 'Complete TB manual', category: 'Business', targetDate: addDays(TODAY, 120), why: 'Finish the business foundation asset' },
    { id: 3, title: 'Stay under weekly spending target', category: 'Finances', targetDate: addDays(TODAY, 6), why: 'Improve financial awareness' },
    { id: 4, title: 'Finish Bible in a year plan', category: 'Faith', targetDate: `${new Date().getFullYear()}-12-31`, why: 'Stay consistent spiritually' },
  ],
  projects: [
    { id: 1, title: 'TB Manual', goalId: 2, dueDate: addDays(TODAY, 120), status: 'Active', description: 'Build out the manual chapters and organization.' },
    { id: 2, title: 'Planner Web App', goalId: null, dueDate: addDays(TODAY, 60), status: 'Active', description: 'Turn the planner into a clean app beta.' },
  ],
  expenses: [
    { id: 1, amount: 72, category: 'Food', date: addDays(TODAY, -1), note: 'Groceries' },
    { id: 2, amount: 135, category: 'Bills', date: TODAY, note: 'Water + utilities' },
    { id: 3, amount: 40, category: 'Business', date: TODAY, note: 'App domain tools' },
  ],
  notes: [
    { id: 1, title: 'Planner ideas', content: 'Keep navigation simple and reduce clutter.', linkedType: 'project', linkedId: 2 },
    { id: 2, title: 'Finance focus', content: 'Weekly spending needs a visual summary and upcoming bills list.', linkedType: 'goal', linkedId: 3 },
  ],
  events: [
    { id: 1, title: 'Client appointment', date: TODAY, startTime: '11:00', endTime: '12:00', category: 'Business' },
    { id: 2, title: 'Church small group', date: TODAY, startTime: '18:30', endTime: '20:00', category: 'Faith' },
  ],
  habits: [
    { id: 1, title: 'Workout', category: 'Health' },
    { id: 2, title: 'Budget check', category: 'Finances' },
    { id: 3, title: 'Prayer', category: 'Wellness' },
  ],
  habitLogs: [
    { id: 1, habitId: 1, date: TODAY, completed: true },
    { id: 2, habitId: 2, date: TODAY, completed: false },
    { id: 3, habitId: 3, date: TODAY, completed: true },
  ],
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

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <p className="eyebrow">The Living Planner</p>
        <h1>Plan your life with clarity</h1>
        <p className="muted">Tasks, goals, habits, budget, and projects — all in one place. Try it instantly in demo mode or connect Supabase to sync your real data.</p>

        <div className="pill-row auth-mode-row" style={{marginTop: 20}}>
          <button
            className={mode === 'mock' ? 'pill active-pill' : 'pill'}
            type="button"
            onClick={() => setMode('mock')}
          >
            ⚡ Demo Mode
          </button>
          <button
            className={mode === 'supabase' ? 'pill active-pill' : 'pill'}
            type="button"
            onClick={() => setMode('supabase')}
          >
            ☁ Supabase Sync
          </button>
        </div>

        {mode === 'mock' && (
          <div className="auth-demo-note">
            Demo mode uses your browser's local storage. Your data stays on this device. No account needed.
          </div>
        )}

        <form className="form-grid auth-form" onSubmit={submit}>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required={mode === 'supabase'}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required={mode === 'supabase'}
            />
          </label>

          {error ? <p className="error-text full-span">{error}</p> : null}
          {message ? <p className="success-text full-span">{message}</p> : null}

          <div className="button-row full-span">
            <button className="primary-btn premium-btn" disabled={loading}>
              {loading ? 'Working…' : mode === 'mock' ? 'Start Planning' : isSignup ? 'Create account' : 'Sign in'}
            </button>
            {mode === 'supabase' && (
              <button
                type="button"
                className="ghost-btn"
                onClick={() => setIsSignup((c) => !c)}
              >
                {isSignup ? 'Already have an account?' : 'Need an account?'}
              </button>
            )}
          </div>
        </form>

        <div className="auth-features">
          <div className="auth-feature">
            <span>📋</span>
            <span>Tasks & Calendar</span>
          </div>
          <div className="auth-feature">
            <span>🎯</span>
            <span>Goals & Projects</span>
          </div>
          <div className="auth-feature">
            <span>📈</span>
            <span>Habits & Growth</span>
          </div>
          <div className="auth-feature">
            <span>💰</span>
            <span>Budget Tracking</span>
          </div>
        </div>
      </div>
    </div>
  )
}


const tabs = [
  { to: '/', label: 'Home', icon: '⌂' },
  { to: '/tasks', label: 'Tasks', icon: '✓' },
  { to: '/calendar', label: 'Calendar', icon: '◷' },
  { to: '/projects', label: 'Projects', icon: '◈' },
  { to: '/growth', label: 'Growth', icon: '↑' },
  { to: '/more', label: 'More', icon: '⋯' },
]

function Layout({ children, onQuickAdd, banner, profile }) {
  const location = useLocation()
  const displayName = profile?.displayName || 'Planner'
  const { isDesktop, isMobile } = useResponsive()

  return (
    <div className="app-shell premium-shell living-planner-shell">
      <header className="topbar premium-topbar living-planner-topbar">
        <div className="topbar-copy">
          <p className="eyebrow">The Living Planner</p>
          <h1>The Living Planner</h1>
          <p className="muted topbar-date">{formatDateLabel(TODAY, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        </div>

        <div className="topbar-actions">
          <div className="profile-pill">
            <span className="profile-avatar">{displayName.slice(0, 1).toUpperCase()}</span>
            <div>
              <strong>{displayName}</strong>
              <span>{profile?.plannerMode || 'Balanced'} mode</span>
            </div>
          </div>
          <button className="primary-btn premium-btn" onClick={onQuickAdd}>
            {isMobile ? '＋' : 'Quick Add'}
          </button>
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
                  className={location.pathname === tab.to ? 'side-nav-link active' : 'side-nav-link'}
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
              className={location.pathname === tab.to ? 'nav-link active' : 'nav-link'}
            >
              <span className="nav-icon">{tab.icon}</span>
              <span className="nav-label">{tab.label}</span>
            </Link>
          ))}
        </nav>
      ) : null}

      {!isDesktop ? (
        <button className="mobile-fab primary-btn premium-btn" onClick={onQuickAdd}>＋</button>
      ) : null}
    </div>
  )
}


function StatusBanner({ syncing, error }) {
  const { mode, user, signOut } = useAuth()

  return (
    <div className="status-banner">
      <div>
        <strong>{mode === 'supabase' ? 'Supabase mode' : 'Mock mode'}</strong>
        <span>{user?.email || 'No active user'}</span>
      </div>
      <div className="status-actions">
        {syncing ? <span className="sync-pill">Syncing…</span> : <span className="sync-pill muted-pill">Idle</span>}
        {error ? <span className="error-pill">{error}</span> : null}
        <button className="ghost-btn" onClick={signOut}>Sign out</button>
      </div>
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
  goal: { title: '', category: 'Health', targetDate: addDays(TODAY, 30), why: '' },
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
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="ghost-btn" onClick={onClose}>Close</button>
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
    <div className="metric-tile">
      <span>{label}</span>
      <strong>{value}</strong>
      {helper ? <small>{helper}</small> : null}
    </div>
  )
}

function MiniBarChart({ data, dataKey = 'completed', maxKey = dataKey }) {
  const max = Math.max(...data.map((item) => item[maxKey] || 0), 1)
  return (
    <div className="mini-chart bars-chart" aria-hidden="true">
      {data.map((item) => (
        <div key={item.label} className="bar-group">
          <span className="bar-label">{item.label}</span>
          <div className="bar-track"><div className="bar-fill" style={{ height: `${Math.max(((item[dataKey] || 0) / max) * 100, 6)}%` }} /></div>
        </div>
      ))}
    </div>
  )
}

function MiniLineChart({ data }) {
  const width = 240
  const height = 80
  const values = data.map((item) => item.value)
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
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
    <div className="mini-chart bars-chart" aria-hidden="true">
      {data.map((item) => (
        <div key={item.label} className="bar-group">
          <span className="bar-label">{item.label}</span>
          <div className="bar-track"><div className="bar-fill" style={{ height: `${Math.max(((item[dataKey] || 0) / max) * 100, 6)}%` }} /></div>
        </div>
      ))}
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

function HomePage({ tasks, goals, projects, expenses, scores, budget, events, habits, habitLogs, settings, onEdit, onQuickCreate }) {
  const navigate = useNavigate()
  const { isMobile } = useResponsive()
  const todayTasks = tasks.filter((task) => isToday(task.date) && (settings.showCompletedTasks || !task.completed))
  const topGoals = goals.slice(0, 3)
  const overdueTasks = tasks.filter((task) => !task.completed && isOverdue(task.date))
  const openProjects = projects.filter((project) => project.status !== 'Completed')
  const weekSpend = expenses.reduce((sum, item) => sum + Number(item.amount), 0)
  const todaySchedule = [
    ...todayTasks.filter((task) => task.time).map((task) => ({ ...task, startTime: task.time, itemType: 'task' })),
    ...events.filter((event) => event.date === TODAY).map((event) => ({ ...event, itemType: 'event' })),
  ].sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''))
  const insights = getHomeInsights({ tasks, expenses, budget, projects, goals, events, habits, habitLogs })
  const suggestions = getSmartSuggestions({ tasks, expenses, budget, projects, habits, habitLogs })
  const completionSeries = getWeekCompletionSeries(tasks)
  const budgetSeries = getBudgetSeries(expenses)
  const scoreTrend = getScoreTrend()
  const focusCopy = todayTasks.filter((task) => !task.completed).slice(0, 2).map((task) => task.title)

  return (
    <div className="home-stack">
      {/* Hero focus card */}
      <div className="hero-focus-card">
        <p className="eyebrow">Today's Focus</p>
        <h2>{focusCopy.join(' • ') || 'Live the day on purpose'}</h2>
        <p className="muted">Tasks, goals, habits, and budget — all in one place.</p>
        <div className="hero-focus-actions">
          <Link className="secondary-btn" to="/calendar">{isMobile ? 'Day View' : 'Open Day View'}</Link>
          <Link className="secondary-btn" to="/tasks">{isMobile ? 'Tasks' : 'See Tasks'}</Link>
          <button className="primary-btn" onClick={() => onQuickCreate('event', { date: TODAY })}>+ Event</button>
        </div>
      </div>

      {/* Metrics strip */}
      <div className="home-metrics-strip">
        <MetricTile label="Open Tasks" value={insights.openTasks} helper={`${insights.overdueCount} overdue`} />
        <MetricTile label="Completion" value={`${insights.completionRate}%`} helper="This week" />
        <MetricTile label="Budget Left" value={`$${insights.budgetRemaining.toFixed(0)}`} helper="This week" />
        <MetricTile label="Habit Streak" value={`${insights.currentHabitStreak}d`} helper={`${insights.habitCount} active`} />
      </div>

      {/* Smart suggestions */}
      <section className="card">
        <div className="section-title-row">
          <div><p className="eyebrow">Smart Suggestions</p><h3>What to do next</h3></div>
          <span className="status-pill">Live</span>
        </div>
        <div className="suggestion-stack">
          {suggestions.length === 0
            ? <p className="muted">No nudges right now. You're in a good groove.</p>
            : suggestions.map((s) => (
              <button key={s.title} className={`suggestion-card tone-${s.tone}`} onClick={() => navigate(s.route)}>
                <strong>{s.title}</strong>
                <span>{s.body}</span>
                <small>{s.actionLabel} →</small>
              </button>
            ))}
        </div>
      </section>

      {/* Today timeline */}
      <section className="card">
        <div className="section-title-row">
          <div><p className="eyebrow">Today Timeline</p><h3>What's on the clock</h3></div>
          <button className="ghost-btn" onClick={() => onQuickCreate('task', { date: TODAY })}>+ Task</button>
        </div>
        {todaySchedule.length === 0
          ? <p className="muted">No scheduled items today.</p>
          : todaySchedule.slice(0, 5).map((item) => (
            <button key={`${item.itemType}-${item.id}`} className="timeline-preview premium-list-row" onClick={() => onEdit(item.itemType, item)}>
              <strong>{item.startTime}</strong>
              <span>{item.title}</span>
              <small>{item.itemType === 'task' ? 'Task' : 'Event'}</small>
            </button>
          ))}
      </section>

      {/* Goals */}
      <section className="card">
        <div className="section-title-row">
          <div><p className="eyebrow">Goals</p><h3>Top Goals</h3></div>
          <button className="ghost-btn" onClick={() => onQuickCreate('goal')}>+ Add</button>
        </div>
        {topGoals.length === 0 ? <p className="muted">No goals yet.</p> : topGoals.map((goal) => (
          <div key={goal.id} className="progress-block">
            <div className="metric-row compact-row">
              <span>{goal.title}</span>
              <strong>{getGoalProgress(goal.id, tasks, projects)}%</strong>
            </div>
            <div className="mini-progress"><div style={{ width: `${getGoalProgress(goal.id, tasks, projects)}%` }} /></div>
          </div>
        ))}
      </section>

      {/* Weekly completion chart */}
      <section className="card">
        <div className="section-title-row">
          <div><p className="eyebrow">Weekly Completion</p><h3>Execution trend</h3></div>
        </div>
        <MiniBarChart data={completionSeries.map((item) => ({ ...item, label: item.label.replace('-', '/') }))} dataKey="completed" maxKey="total" />
        <p className="muted" style={{fontSize:'.8rem', marginTop: 4}}>Completed actions by day.</p>
      </section>

      {/* Budget */}
      <section className="card">
        <div className="section-title-row">
          <div><p className="eyebrow">Budget Drift</p><h3>Spend this week</h3></div>
        </div>
        <MiniBarChart data={budgetSeries.map((item) => ({ ...item, label: item.label.replace('-', '/') }))} dataKey="amount" />
        <p className="muted" style={{fontSize:'.8rem', marginTop: 4}}>
          <strong>${weekSpend.toFixed(2)}</strong> of <strong>${budget.weeklyTarget.toFixed(2)}</strong> target
        </p>
      </section>

      {/* Life scores */}
      <section className="card">
        <div className="section-title-row">
          <div><p className="eyebrow">Life Score</p><h3>Balance check</h3></div>
          <Link className="ghost-btn" to="/growth">Growth →</Link>
        </div>
        <div className="score-grid">
          {Object.entries(scores).map(([key, value]) => (
            <div key={key} className="score-card">
              <span>{key}</span>
              <strong>{value}/10</strong>
              <div className="score-bar"><div style={{ width: `${value * 10}%` }} /></div>
            </div>
          ))}
        </div>
      </section>

      {/* Watchlist */}
      {overdueTasks.length > 0 && (
        <section className="card">
          <div className="section-title-row">
            <div><p className="eyebrow">Watchlist</p><h3>Needs attention</h3></div>
            <span className="status-pill alert-pill">{overdueTasks.length} overdue</span>
          </div>
          {overdueTasks.map((task) => (
            <button key={task.id} className="list-action-row premium-list-row" onClick={() => onEdit('task', task)}>
              <span>{task.title}</span>
              <strong style={{fontSize:'.8rem', color:'var(--danger)'}}>{task.date}</strong>
            </button>
          ))}
        </section>
      )}
    </div>
  )
}

function TasksPage({ tasks, settings, onToggle, onEdit, onDelete, onQuickCreate }) {
  const [query, setQuery] = useState('')
  const { prefersTouch, isMobile } = useResponsive()
  const [category, setCategory] = useState('All')
  const [status, setStatus] = useState('All')

  const filtered = useMemo(() => tasks.filter((task) => {
    if (!settings.showCompletedTasks && task.completed) return false
    if (category !== 'All' && task.category !== category) return false
    if (status === 'Open' && task.completed) return false
    if (status === 'Done' && !task.completed) return false
    if (query && !task.title.toLowerCase().includes(query.toLowerCase())) return false
    return true
  }), [tasks, settings.showCompletedTasks, category, status, query])

  const groups = {
    Today: filtered.filter((task) => isToday(task.date)),
    'This Week': filtered.filter((task) => isThisWeek(task.date) && !isToday(task.date) && !isOverdue(task.date)),
    Upcoming: filtered.filter((task) => !isThisWeek(task.date) && task.date > new Date().toISOString().slice(0, 10)),
    Overdue: filtered.filter((task) => !task.completed && isOverdue(task.date)),
  }

  const quickStats = [
    { label: 'Open', value: filtered.filter((task) => !task.completed).length },
    { label: 'Done', value: filtered.filter((task) => task.completed).length },
    { label: 'Recurring', value: filtered.filter((task) => task.recurrence && task.recurrence !== 'none').length },
    { label: 'High Priority', value: filtered.filter((task) => task.priority === 'High').length },
  ]

  return (
    <div className="screen-stack">
      <section className="card premium-card">
        <div className="section-title-row">
          <div>
            <p className="eyebrow">Execution</p>
            <h3>Tasks</h3>
            <p className="muted">Search fast, filter what matters, and drag tasks into the calendar when you want them to become real commitments.</p>
          </div>
          <div className="button-row">
            <button className="secondary-btn" onClick={() => onQuickCreate('task', { recurrence: 'daily' })}>Add Recurring</button>
            <button className="primary-btn premium-btn" onClick={() => onQuickCreate('task')}>Add Task</button>
          </div>
        </div>
        <div className="stats-strip">
          {quickStats.map((stat) => <div key={stat.label} className="mini-stat"><span>{stat.label}</span><strong>{stat.value}</strong></div>)}
        </div>

        {prefersTouch ? <p className="muted">Touch tip: tap <strong>Plan</strong> on a task to assign its date or time when drag-and-drop isn’t convenient.</p> : null}
        <div className="filter-row">
          <input placeholder="Search tasks" value={query} onChange={(e) => setQuery(e.target.value)} />
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option>All</option>
            {categories.map((item) => <option key={item}>{item}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option>All</option>
            <option>Open</option>
            <option>Done</option>
          </select>
        </div>
      </section>

      {Object.entries(groups).map(([label, items]) => (
        <section key={label} className="card premium-card">
          <div className="section-title-row"><h3>{label}</h3><span className="status-pill">{items.length}</span></div>
          {items.length === 0 ? <p>Nothing here.</p> : items.map((task) => <TaskItem key={task.id} task={task} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} />)}
        </section>
      ))}
    </div>
  )
}


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

  const navLabel = view === 'month'
    ? selectedMonthLabel
    : view === 'week'
    ? `Week of ${formatDateLabel(weekDays[0], { month: 'short', day: 'numeric' })}`
    : formatDateLabel(selectedDate, { weekday: 'short', month: 'short', day: 'numeric' })

  const step = view === 'month' ? 30 : view === 'week' ? 7 : 1

  return (
    <div className="screen-stack">
      {/* Header */}
      <section className="card calendar-header-card">
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:10, marginBottom:12}}>
          <div>
            <p className="eyebrow">Time Control</p>
            <h3 style={{margin:0}}>Calendar</h3>
          </div>
          <button className="primary-btn" style={{fontSize:'.82rem', padding:'8px 14px'}} onClick={() => onQuickCreate('event', { date: selectedDate })}>+ Event</button>
        </div>
        {/* Nav row */}
        <div style={{display:'flex', alignItems:'center', gap:8, flexWrap:'wrap'}}>
          <button className="cal-nav-btn" onClick={() => setSelectedDate(addDays(selectedDate, -step))}>‹</button>
          <button className="cal-nav-btn" onClick={() => setSelectedDate(TODAY)}>Today</button>
          <button className="cal-nav-btn" onClick={() => setSelectedDate(addDays(selectedDate, step))}>›</button>
          <span style={{flex:1, fontWeight:600, fontSize:'.9rem', color:'var(--text)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{navLabel}</span>
        </div>
        {/* View toggle */}
        <div style={{display:'flex', gap:6, marginTop:10}}>
          {['day','week','month'].map((v) => (
            <button key={v} className={view === v ? 'pill active-pill' : 'pill'} onClick={() => setView(v)} style={{fontSize:'.8rem', padding:'6px 14px', textTransform:'capitalize'}}>{v}</button>
          ))}
        </div>
      </section>

      {/* Day view */}
      {view === 'day' && (
        <section className="card">
          <div className="section-title-row">
            <h3>Daily Schedule</h3>
            <span className="status-pill">{prefersTouch ? 'Tap a slot' : 'Drag to reschedule'}</span>
          </div>
          {isMobile && upcomingScheduled.length > 0 && (
            <div className="mobile-agenda-strip">
              {upcomingScheduled.map((item) => (
                <button key={`${item.itemType}-${item.id}`} className="agenda-chip" onClick={() => onEdit(item.itemType, item)}>
                  <strong style={{fontSize:'.78rem', color:'var(--teal)'}}>{item.startTime}</strong>
                  <span style={{fontSize:'.82rem', color:'var(--text)', fontWeight:600}}>{item.title}</span>
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
                  <div
                    className={items.length === 0 ? (false ? 'timeline-slot drop-active' : 'timeline-slot') : 'timeline-slot'}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => { try { handleDropItem(JSON.parse(e.dataTransfer.getData('application/json')), selectedDate, hour) } catch {} }}
                  >
                    {items.length === 0
                      ? <button className="slot-add-btn" onClick={() => onQuickCreate('task', { date: selectedDate, time: hour })}>{prefersTouch ? 'Tap to add' : 'Add here'}</button>
                      : items.map((item) => (
                        <div key={`${item.itemType}-${item.id}`} className="time-card premium-time-card" draggable onDragStart={(e) => e.dataTransfer.setData('application/json', JSON.stringify({ type: item.itemType, id: item.id }))}>
                          <button className="time-card-main" onClick={() => onEdit(item.itemType, item)}>
                            <strong style={{fontSize:'.9rem'}}>{item.title}</strong>
                            <span style={{fontSize:'.78rem', color:'var(--muted)'}}>{item.startTime}{item.endTime ? ` – ${item.endTime}` : ''}</span>
                          </button>
                          <button className="ghost-btn" style={{fontSize:'.78rem', padding:'5px 10px'}} onClick={() => onDelete(item.itemType, item.id)}>Delete</button>
                        </div>
                      ))}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Week view */}
      {view === 'week' && (
        <section className="card">
          <div className="section-title-row"><h3>Weekly View</h3></div>
          <div className="week-grid">
            {weekDays.map((date) => {
              const items = scheduled.filter((item) => item.date === date)
              return (
                <div key={date} className="week-card droppable-day"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { try { handleDropItem(JSON.parse(e.dataTransfer.getData('application/json')), date) } catch {} }}>
                  <button className="day-chip" onClick={() => { setSelectedDate(date); setView('day') }}>{formatDateLabel(date, { weekday: 'short', month: 'short', day: 'numeric' })}</button>
                  {items.length === 0 ? <p className="muted" style={{fontSize:'.78rem'}}>Open</p> : items.map((item) => (
                    <button key={`${item.itemType}-${item.id}`} className="week-item" onClick={() => onEdit(item.itemType, item)} draggable onDragStart={(e) => e.dataTransfer.setData('application/json', JSON.stringify({ type: item.itemType, id: item.id }))}>
                      <span style={{fontSize:'.72rem', color:'var(--teal)'}}>{item.startTime}</span>
                      <strong style={{fontSize:'.82rem'}}>{item.title}</strong>
                    </button>
                  ))}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Month view */}
      {view === 'month' && (
        <section className="card">
          <div className="section-title-row"><h3>{selectedMonthLabel}</h3></div>
          <div className="month-grid">
            {monthDays.map((date) => {
              const count = scheduled.filter((item) => item.date === date).length
              return (
                <button key={date} className={date === selectedDate ? 'month-cell active-cell' : 'month-cell'} onClick={() => { setSelectedDate(date); setView('day') }}>
                  <strong style={{fontSize:'.82rem'}}>{formatDateLabel(date, { month: 'short', day: 'numeric' })}</strong>
                  {count > 0 && <span style={{fontSize:'.72rem', color:'var(--teal)'}}>{count} item{count > 1 ? 's' : ''}</span>}
                  <div className="mini-progress"><div style={{ width: `${Math.min(count * 25, 100)}%` }} /></div>
                </button>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}

function ProjectsPage({ projects, tasks, goals, onEdit, onDelete, onQuickCreate }) {
  return (
    <div className="screen-stack">
      <section className="card">
        <div className="section-title-row">
          <div>
            <p className="eyebrow">Build Zone</p>
            <h3>Projects</h3>
          </div>
          <button className="primary-btn" onClick={() => onQuickCreate('project')}>Add Project</button>
        </div>
      </section>

      {projects.map((project) => {
        const linkedGoal = goals.find((goal) => goal.id === project.goalId)
        return (
          <section className="card" key={project.id}>
            <div className="metric-row">
              <h3>{project.title}</h3>
              <span className="status-pill">{project.status}</span>
            </div>
            <p>{project.description}</p>
            <div className="metric-row">
              <span>Due {project.dueDate}</span>
              <strong>{getProjectProgress(project.id, tasks)}%</strong>
            </div>
            <p className="muted">Goal: {linkedGoal?.title || 'Not linked yet'}</p>
            <div className="item-actions aligned-right">
              <button className="ghost-btn" onClick={() => onEdit('project', project)}>Edit</button>
              <button className="ghost-btn" onClick={() => onDelete('project', project.id)}>Delete</button>
            </div>
          </section>
        )
      })}
    </div>
  )
}


function GrowthPage({ scores, habits, habitLogs, onToggleHabit, onEdit, onDelete, onQuickCreate, budget, setBudget }) {
  const weekStart = startOfWeek(TODAY)
  const weekEnd = endOfWeek(TODAY)
  const weekLogs = habitLogs.filter((log) => log.date >= weekStart && log.date <= weekEnd)
  const completedWeekLogs = weekLogs.filter((log) => log.completed).length
  const weeklyReview = {
    win: scores.Productivity >= 7 ? 'You protected momentum well this week.' : 'There is room to tighten follow-through next week.',
    recovery: scores.Wellness < 6 ? 'Wellness is trailing. Build in recovery and reflection blocks.' : 'Wellness held steady. Keep the rhythm.',
    money: scores.Finances >= 7 ? 'Finances stayed inside the guardrails.' : 'Finances need a closer reset and review.',
  }

  return (
    <div className="screen-stack">
      <section className="card premium-card">
        <div className="section-title-row">
          <div>
            <p className="eyebrow">Auto Scorecard</p>
            <h3>Life balance</h3>
          </div>
          <span className="status-pill">Self-updating</span>
        </div>
        {Object.entries(scores).map(([name, value]) => (
          <div key={name} className="score-line">
            <span>{name}</span>
            <div className="score-bar"><div style={{ width: `${value * 10}%` }} /></div>
            <strong>{value}/10</strong>
          </div>
        ))}
      </section>

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
          <div className="review-card"><strong>Finance signal</strong><p>{weeklyReview.money}</p></div>
        </div>
      </section>

      <section className="card premium-card">
        <div className="section-title-row">
          <h3>Habits</h3>
          <button className="primary-btn premium-btn" onClick={() => onQuickCreate('habit')}>Add Habit</button>
        </div>
        {habits.map((habit) => {
          const logs = habitLogs.filter((log) => log.habitId === habit.id)
          const todayLog = logs.find((log) => isToday(log.date))
          const complete = logs.filter((log) => log.completed).length
          return (
            <div key={habit.id} className="metric-row card-row">
              <div>
                <strong>{habit.title}</strong>
                <p>{habit.category} • {complete}/{logs.length || 1} complete</p>
              </div>
              <div className="item-actions">
                <button className={todayLog?.completed ? 'secondary-btn' : 'primary-btn premium-btn'} onClick={() => onToggleHabit(habit.id, TODAY)}>
                  {todayLog?.completed ? 'Logged' : 'Log Today'}
                </button>
                <button className="ghost-btn" onClick={() => onEdit('habit', habit)}>Edit</button>
                <button className="ghost-btn" onClick={() => onDelete('habit', habit.id)}>Delete</button>
              </div>
            </div>
          )
        })}
      </section>

      <section className="card premium-card">
        <div className="section-title-row">
          <h3>Weekly Budget Target</h3>
        </div>
        <div className="budget-editor">
          <label>
            Weekly Target
            <input type="number" value={budget.weeklyTarget} onChange={(e) => setBudget({ weeklyTarget: Number(e.target.value) })} />
          </label>
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
      <p className="muted">{doneCount}/{steps.length} setup steps finished</p>
      {steps.map((step) => <div key={step.label} className="metric-row"><span>{step.label}</span><strong>{step.done ? 'Done' : 'Open'}</strong></div>)}
    </section>
  )
}

function MorePage({ goals, tasks, projects, expenses, notes, budget, profile, settings, updateProfile, updateSettings, onEdit, onDelete, onQuickCreate }) {
  const { signOut } = useAuth()
  const [noteQuery, setNoteQuery] = useState('')
  const [expenseQuery, setExpenseQuery] = useState('')
  const totalSpent = expenses.reduce((sum, item) => sum + Number(item.amount), 0)

  const filteredNotes = useMemo(() => notes.filter((note) => !noteQuery || note.title.toLowerCase().includes(noteQuery.toLowerCase()) || note.content.toLowerCase().includes(noteQuery.toLowerCase())), [notes, noteQuery])
  const filteredExpenses = useMemo(() => expenses.filter((expense) => !expenseQuery || expense.category.toLowerCase().includes(expenseQuery.toLowerCase()) || (expense.note || '').toLowerCase().includes(expenseQuery.toLowerCase())), [expenses, expenseQuery])

  return (
    <div className="screen-stack">
      {!settings.onboardingComplete ? <OnboardingChecklist settings={settings} profile={profile} tasks={tasks} goals={goals} projects={projects} updateSettings={updateSettings} /> : null}

      <section className="card">
        <div className="section-title-row">
          <h3>Goals</h3>
          <button className="primary-btn" onClick={() => onQuickCreate('goal')}>Add Goal</button>
        </div>
        {goals.map((goal) => (
          <div key={goal.id} className="metric-row card-row">
            <div>
              <strong>{goal.title}</strong>
              <p>{goal.category} • {goal.targetDate}</p>
            </div>
            <div className="item-actions">
              <span>{getGoalProgress(goal.id, tasks, projects)}%</span>
              <button className="ghost-btn" onClick={() => onEdit('goal', goal)}>Edit</button>
              <button className="ghost-btn" onClick={() => onDelete('goal', goal.id)}>Delete</button>
            </div>
          </div>
        ))}
      </section>

      <section className="card">
        <div className="section-title-row">
          <h3>Finances</h3>
          <button className="primary-btn" onClick={() => onQuickCreate('expense')}>Add Expense</button>
        </div>
        <input placeholder="Search expenses" value={expenseQuery} onChange={(e) => setExpenseQuery(e.target.value)} />
        <div className="metric-row"><span>Spent</span><strong>${totalSpent.toFixed(2)}</strong></div>
        <div className="metric-row"><span>Weekly Target</span><strong>${budget.weeklyTarget.toFixed(2)}</strong></div>
        <div className="mini-progress"><div style={{ width: `${Math.min((totalSpent / budget.weeklyTarget) * 100, 100)}%` }} /></div>
        {filteredExpenses.map((expense) => (
          <div key={expense.id} className="metric-row card-row">
            <span>{expense.category}: ${Number(expense.amount).toFixed(2)} — {expense.note}</span>
            <div className="item-actions">
              <button className="ghost-btn" onClick={() => onEdit('expense', expense)}>Edit</button>
              <button className="ghost-btn" onClick={() => onDelete('expense', expense.id)}>Delete</button>
            </div>
          </div>
        ))}
      </section>

      <section className="card">
        <div className="section-title-row">
          <h3>Notes</h3>
          <button className="primary-btn" onClick={() => onQuickCreate('note')}>Add Note</button>
        </div>
        <input placeholder="Search notes" value={noteQuery} onChange={(e) => setNoteQuery(e.target.value)} />
        {filteredNotes.map((note) => (
          <div key={note.id} className="note-card">
            <div className="metric-row compact-row">
              <strong>{note.title}</strong>
              <div className="item-actions">
                <button className="ghost-btn" onClick={() => onEdit('note', note)}>Edit</button>
                <button className="ghost-btn" onClick={() => onDelete('note', note.id)}>Delete</button>
              </div>
            </div>
            <p>{note.content}</p>
          </div>
        ))}
      </section>

      <section className="card">
        <div className="section-title-row"><h3>Profile</h3></div>
        <div className="form-grid">
          <label>
            Display Name
            <input value={profile.displayName || ''} onChange={(e) => updateProfile({ ...profile, displayName: e.target.value })} />
          </label>
          <label>
            Timezone
            <input value={profile.timezone || ''} onChange={(e) => updateProfile({ ...profile, timezone: e.target.value })} />
          </label>
          <label>
            Planner Mode
            <select value={profile.plannerMode || 'Balanced'} onChange={(e) => updateProfile({ ...profile, plannerMode: e.target.value })}>
              <option>Balanced</option>
              <option>Execution</option>
              <option>Wellness</option>
              <option>Growth</option>
            </select>
          </label>
        </div>
      </section>

      <section className="card">
        <div className="section-title-row"><h3>Settings</h3></div>
        <div className="setting-row">
          <span>Show completed tasks</span>
          <input type="checkbox" checked={settings.showCompletedTasks} onChange={(e) => updateSettings({ ...settings, showCompletedTasks: e.target.checked })} />
        </div>
        <div className="setting-row">
          <span>Compact calendar</span>
          <input type="checkbox" checked={settings.compactCalendar} onChange={(e) => updateSettings({ ...settings, compactCalendar: e.target.checked })} />
        </div>
        <div className="setting-row">
          <span>Onboarding complete</span>
          <input type="checkbox" checked={settings.onboardingComplete} onChange={(e) => updateSettings({ ...settings, onboardingComplete: e.target.checked })} />
        </div>
        <div className="button-row"><button className="ghost-btn" onClick={signOut}>Sign out</button></div>
      </section>
    </div>
  )
}


// ── Main App ──────────────────────────────────────────────────────────────

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
          <Route path="/" element={<HomePage tasks={tasks} goals={goals} projects={projects} expenses={expenses} scores={scores} budget={budget} events={events} habits={habits} habitLogs={habitLogs} settings={settings} onEdit={openEdit} onQuickCreate={openCreate} />} />
          <Route path="/tasks" element={<TasksPage tasks={tasks} settings={settings} onToggle={async (id) => { await toggleTask(id); pushToast('Task updated', 'Progress and score were refreshed.', 'success') }} onEdit={openEdit} onDelete={async (type, id) => { await deleteItem(type, id); pushToast('Task deleted', 'That item is gone.', 'success') }} onQuickCreate={openCreate} />} />
          <Route path="/calendar" element={<CalendarPage tasks={tasks} events={events} settings={settings} onEdit={openEdit} onDelete={async (type, id) => { await deleteItem(type, id); pushToast('Calendar item deleted', '', 'success') }} onQuickCreate={openCreate} onReschedule={async (type, id, patch) => { const collection = type === 'event' ? events : tasks; const current = collection.find((item) => item.id === id); if (!current) return; await saveItem(type, { ...current, ...patch }, 'edit'); pushToast(type === 'task' ? 'Task rescheduled' : 'Event moved', 'The calendar updated instantly.', 'success') }} />} />
          <Route path="/projects" element={<ProjectsPage projects={projects} tasks={tasks} goals={goals} onEdit={openEdit} onDelete={async (type, id) => { await deleteItem(type, id); pushToast('Project removed', '', 'success') }} onQuickCreate={openCreate} />} />
          <Route path="/growth" element={<GrowthPage scores={scores} habits={habits} habitLogs={habitLogs} onToggleHabit={async (...args) => { await toggleHabit(...args); pushToast('Habit logged', 'Your scorecard picked that up.', 'success') }} onEdit={openEdit} onDelete={async (type, id) => { await deleteItem(type, id); pushToast('Habit deleted', '', 'success') }} onQuickCreate={openCreate} budget={budget} setBudget={async (nextBudget) => { await updateBudget(nextBudget); pushToast('Budget updated', 'Finance scoring refreshed.', 'success') }} />} />
          <Route path="/more" element={<MorePage goals={goals} tasks={tasks} projects={projects} expenses={expenses} notes={notes} budget={budget} profile={profile} settings={settings} updateProfile={async (nextProfile) => { await updateProfile(nextProfile); pushToast('Profile saved', '', 'success') }} updateSettings={async (nextSettings) => { await updateSettings(nextSettings); pushToast('Settings saved', '', 'success') }} onEdit={openEdit} onDelete={async (type, id) => { await deleteItem(type, id); pushToast('Item deleted', '', 'success') }} onQuickCreate={openCreate} />} />
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

function App() {
  return <AuthProvider><AuthGate fallback={<AuthPage />}><PlannerApp /></AuthGate></AuthProvider>
}


// ── Export ────────────────────────────────────────────────────────────────
export default App
