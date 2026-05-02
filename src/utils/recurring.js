// ── Recurring Date Logic ───────────────────────────────────────────────

export function nextRecurringDate(date, recurrence) {
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
