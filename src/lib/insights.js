// Numbers behind the Home page: chart series, insights and suggestions.
import { TODAY, addDays, startOfWeek, endOfWeek, getWeekDays, expandEvents, isToday, isOverdue } from './dates.js'
import { normBudget, budgetSpend } from './score.js'

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
  const b = normBudget(budget)
  const spend = budgetSpend(expenses, b.period).total
  const budgetRemaining = Number((b.amount - spend).toFixed(2))
  const activeProjects = projects.filter((project) => project.status === 'Active').length
  const goalCount = goals.length
  const scheduleCount = expandEvents(events, TODAY, TODAY).length + tasks.filter((task) => isToday(task.date) && task.time).length

  const recentDays = Array.from({ length: 7 }, (_, index) => addDays(TODAY, index - 6))

  const streakSeries = recentDays.map((date) => {
    const dayHabits = habitLogs.filter((log) => log.date === date)
    return dayHabits.filter((log) => log.completed).length
  })

  // Days in a row with at least one habit checked. Today counts once logged; until then the streak runs through yesterday.
  const currentHabitStreak = (() => {
    const doneDays = new Set(habitLogs.filter((log) => log.completed).map((log) => log.date))
    let day = doneDays.has(TODAY) ? TODAY : addDays(TODAY, -1)
    let streak = 0
    while (doneDays.has(day) && streak < 3650) { streak += 1; day = addDays(day, -1) }
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
  const unscheduled = tasks.filter((task) => !task.completed && !task.time && task.date && task.date <= TODAY)
  const healthGap = habits.some((habit) => habit.category === 'Health') && !habitLogs.some((log) => log.date === TODAY && log.completed && habits.find((habit) => habit.id === log.habitId && habit.category === 'Health'))
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

  const bud = normBudget(budget)
  const budSpent = budgetSpend(expenses, bud.period).total
  if (bud.amount > 0 && budSpent > bud.amount) {
    suggestions.push({
      title: 'Re-center your spending',
      body: `You are $${(budSpent - bud.amount).toFixed(2)} over your ${bud.period} budget. Review subscriptions or flexible spending ${bud.period === 'monthly' ? 'this week' : 'today'}.`,
      tone: 'warning',
      actionLabel: 'See Finances',
      route: '/finance',
    })
  }

  if (healthGap) {
    suggestions.push({
      title: 'Health score wants a win',
      body: 'No health habit has been checked off today yet. Even a short workout or walk moves the score.',
      tone: 'success',
      actionLabel: 'Open Habits',
      route: '/habits',
    })
  }

  if (unscheduled.length) {
    suggestions.push({
      title: 'Give today\'s tasks a time',
      body: `${unscheduled.length} task${unscheduled.length > 1 ? 's' : ''} due today or earlier ${unscheduled.length > 1 ? 'have' : 'has'} no time block. Give one a time slot so it becomes real.`,
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

export { getWeekCompletionSeries, getHomeInsights, getSmartSuggestions }
