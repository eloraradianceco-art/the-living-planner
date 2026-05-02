// ── Smart Suggestions & Home Insights ─────────────────────────────────
import { isOverdue, isThisWeek, getTodayString } from './dates.js'

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
