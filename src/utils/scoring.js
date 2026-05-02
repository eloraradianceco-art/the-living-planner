// ── Scoring & Progress Utilities ───────────────────────────────────────

export function computeScores({ tasks, expenses, habits, habitLogs, budget }) {
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

export function getGoalProgress(goalId, tasks, projects) {
  const relatedTasks = tasks.filter((task) => task.linkedGoalId === goalId)
  const relatedProjects = projects.filter((project) => project.goalId === goalId)
  const totalItems = relatedTasks.length + relatedProjects.length
  if (totalItems === 0) return 0
  const completedTasks = relatedTasks.filter((task) => task.completed).length
  const completedProjects = relatedProjects.filter((project) => project.status === 'Completed').length
  return Math.round(((completedTasks + completedProjects) / totalItems) * 100)
}

export function getProjectProgress(projectId, tasks) {
  const relatedTasks = tasks.filter((task) => task.linkedProjectId === projectId)
  if (relatedTasks.length === 0) return 0
  const completed = relatedTasks.filter((task) => task.completed).length
  return Math.round((completed / relatedTasks.length) * 100)
}


// ── Charts ────────────────────────────────────────────────────────────────

export function getWeekCompletionSeries(tasks) {
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

export function getBudgetSeries(expenses) {
  const days = getWeekDays(TODAY)
  return days.map((date) => ({
    date,
    label: date.slice(5),
    amount: expenses.filter((expense) => expense.date === date).reduce((sum, item) => sum + Number(item.amount || 0), 0),
  }))
}

export function getScoreTrend(scoresHistory = []) {
  if (scoresHistory.length) return scoresHistory
  return Array.from({ length: 7 }, (_, index) => ({
    label: addDays(startOfWeek(TODAY), index).slice(5),
    value: 4 + ((index * 13) % 5),
  }))
}


// ── Insights ──────────────────────────────────────────────────────────────

export function getHomeInsights({ tasks, expenses, budget, projects, goals, events, habits, habitLogs }) {
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
