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
