import { TODAY, addDays, isOverdue, isToday, startOfWeek, endOfWeek } from './date'

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

export function getSmartSuggestions({ tasks, expenses, budget, projects, habits, habitLogs }) {
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
