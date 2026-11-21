// Reading and saving tasks, events, goals, projects, habits, notes and expenses (account or this device).
import { hasSupabaseEnv, supabase } from './supabase.js'
import { TODAY, addDays } from './dates.js'
import { normBudget } from './score.js'
import { normalizeSteps } from './steps.js'
import { cleanPlace } from '../components/Place.jsx'

const upsertById = (list, item) => list.some((x) => x.id === item.id)
  ? list.map((x) => x.id === item.id ? item : x)
  : [...list, item]


// ── Seed data ─────────────────────────────────────────────────────────────

const categories = [
  'Health',
  'Lifestyle',
  'Productivity',
  'Wellness',
  'Finances',
  'Faith',
  'Business',
  'Personal', // 2026-11-21: personal items. In the Life Score they count toward Lifestyle (lib/score.js).
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
  budget: { period: 'weekly', amount: 200, weeklyTarget: 200 },
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
    const { id, name, category, color, icon, user_id, frequency } = raw
    return { id, name, category: category||'Health', frequency: /^([1-6]x|daily)$/.test(frequency || '') ? frequency : 'daily', color: color||null, icon: icon||null, user_id }
  }

  if (type === 'task') {
    if ('linkedGoalId' in raw) { raw.goal_id = raw.linkedGoalId ? String(raw.linkedGoalId) : null; delete raw.linkedGoalId }
    if ('linkedProjectId' in raw) { raw.project_id = raw.linkedProjectId ? String(raw.linkedProjectId) : null; delete raw.linkedProjectId }
    if ('endTime' in raw) { raw.end_time = raw.endTime || null; delete raw.endTime }
    if ('time' in raw && !raw.time) raw.end_time = null // an end time needs a start time
    if (!raw.recurrence) raw.recurrence = 'none'
    if ('location' in raw) raw.location = cleanPlace(raw.location) || null
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
    if ('location' in raw) raw.location = cleanPlace(raw.location) || null
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
    budget: normBudget(readLocal(localKeys.budget, defaultData.budget)),
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
  if (t === 'tasks')      { r.linkedGoalId = r.goal_id; r.linkedProjectId = r.project_id; delete r.goal_id; delete r.project_id
                            r.endTime = r.end_time || ''; delete r.end_time; r.location = r.location || '' }
  if (t === 'goals')      { r.targetDate = r.target_date; delete r.target_date; r.steps = normalizeSteps(r.steps) }
  if (t === 'projects')   { r.goalId = r.goal_id; r.dueDate = r.due_date; delete r.goal_id; delete r.due_date; r.steps = normalizeSteps(r.steps) }
  if (t === 'events')     { r.startTime = r.time; r.endTime = r.end_time; delete r.time; delete r.end_time; r.location = r.location || ''
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
    budget: budgetRows?.[0] ? normBudget({ period: budgetRows[0].period, amount: budgetRows[0].amount, weeklyTarget: Number(budgetRows[0].weekly_target) }) : defaultData.budget,
    profile: profileRows?.[0] ? { displayName: profileRows[0].display_name, timezone: profileRows[0].timezone, plannerMode: profileRows[0].planner_mode } : defaultData.profile,
    settings: settingsRows?.[0] ? { onboardingComplete: settingsRows[0].onboarding_complete, showCompletedTasks: settingsRows[0].show_completed_tasks, compactCalendar: settingsRows[0].compact_calendar, notifications: settingsRows[0].notifications || {} } : defaultData.settings,
  }
}

const sameTaskTitle = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase()

// Next occurrence of a repeating task, always after today (finishing an overdue daily task
// schedules tomorrow, not another past date). Monthly keeps the day of month, clamped to
// the month's last day (Jan 31 → Feb 28 → Mar 31). Undated tasks repeat from today.
function stepRecurring(date, recurrence, anchorDay) {
  if (recurrence === 'daily') return addDays(date, 1)
  if (recurrence === 'weekdays') { let d = addDays(date, 1); while ([0, 6].includes(new Date(d + 'T12:00:00').getDay())) d = addDays(d, 1); return d }
  if (recurrence === 'weekly') return addDays(date, 7)
  if (recurrence === 'biweekly') return addDays(date, 14)
  if (recurrence === 'monthly') {
    const [y, m] = date.split('-').map(Number)
    const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1
    const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate()
    return `${ny}-${String(nm).padStart(2, '0')}-${String(Math.min(anchorDay, last)).padStart(2, '0')}`
  }
  return null
}
function nextRecurringDate(date, recurrence) {
  const start = /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? date : TODAY
  const anchorDay = Number(start.slice(8, 10))
  let d = stepRecurring(start, recurrence, anchorDay)
  for (let i = 0; d && d <= TODAY && i < 1000; i++) d = stepRecurring(d, recurrence, anchorDay)
  return d
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
        if ('endTime' in clonePayload) { clonePayload.end_time = clonePayload.endTime || null; delete clonePayload.endTime }
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
    const normalized = normBudget(nextBudget)
    if (!hasSupabaseEnv) {
      writeLocal(localKeys.budget, normalized)
      return normalized
    }

    const row = { user_id: userId, period: normalized.period, amount: normalized.amount, weekly_target: normalized.weeklyTarget }
    const { data, error } = await supabase.from('budgets').upsert(row, { onConflict: 'user_id' }).select().single()
    if (error) throw error
    return data && data.period ? normBudget({ period: data.period, amount: data.amount, weeklyTarget: Number(data.weekly_target) }) : normalized
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

export {
  upsertById, categories, defaultData, localKeys, tableMap, readLocal, writeLocal, mapDbRow,
  plannerService,
}
