// ── Local Storage Utilities ────────────────────────────────────────────

export function readLocal(key, fallback) {
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

export function writeLocal(key, value) {
  window.localStorage.setItem(key, JSON.stringify(value))
}

export function normalizePayload(type, payload, userId) {
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

export function stripUserId(payload) {
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
