// Steps (checklists) on goals and projects, and their progress.

// ── Steps (checklists on goals & projects) ───────────────────────────────
// Shape: [{ id, text, done, doneAt }] stored in the jsonb `steps` column.
const newStepId = () => 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
function normalizeSteps(steps) {
  if (!Array.isArray(steps)) return []
  return steps
    .filter((st) => st && typeof st.text === 'string' && st.text.trim())
    .map((st) => ({ id: st.id || newStepId(), text: st.text.trim(), done: !!st.done, doneAt: st.doneAt || null }))
}
// Accepts pasted lists: "- item", "1. item", "[ ] item", bullets, blank lines.
const parseStepLines = (text) => String(text || '').split(/\r?\n/)
  .map((l) => l.replace(/^\s*(?:[-*\u2022\u25A2\u2610\u25A1]|\[\s?[xX ]?\]|\d+[.)])\s*/, '').trim())
  .filter(Boolean)

function getProjectProgress(project, tasks) {
  if (!project) return 0
  const p = typeof project === 'object' ? project : null
  const id = p ? p.id : project
  if (p?.status === 'Completed') return 100
  const relatedTasks = tasks.filter((task) => task.linkedProjectId === id)
  const steps = normalizeSteps(p?.steps)
  const total = relatedTasks.length + steps.length
  if (!total) return 0
  const done = relatedTasks.filter((task) => task.completed).length + steps.filter((st) => st.done).length
  return Math.round((done / total) * 100)
}

// Goal progress = its own steps + its direct tasks + linked projects (each project
// counts as one unit, credited by its own progress so steps inside it move the goal).
// A task inside one of the goal's projects counts once, through that project.
function goalDirectTasks(goalId, tasks, projects) {
  const inProjects = new Set(projects.filter((project) => project.goalId === goalId).map((project) => project.id))
  return tasks.filter((task) => task.linkedGoalId === goalId && !inProjects.has(task.linkedProjectId))
}
function getGoalProgress(goal, tasks, projects) {
  const g = typeof goal === 'object' ? goal : null
  const id = g ? g.id : goal
  if (g?.completed) return 100
  const relatedTasks = goalDirectTasks(id, tasks, projects)
  const relatedProjects = projects.filter((project) => project.goalId === id)
  const steps = normalizeSteps(g?.steps)
  const total = relatedTasks.length + relatedProjects.length + steps.length
  if (!total) return 0
  const done = relatedTasks.filter((task) => task.completed).length
    + steps.filter((st) => st.done).length
    + relatedProjects.reduce((sum, project) => sum + getProjectProgress(project, tasks) / 100, 0)
  return Math.round((done / total) * 100)
}

// The next unchecked step for a goal — its own first, then its active projects'.
function nextStepFor(goal, projects = []) {
  if (!goal) return null
  const own = normalizeSteps(goal.steps).find((st) => !st.done)
  if (own) return own.text
  for (const project of projects.filter((pr) => pr.goalId === goal.id && pr.status !== 'Completed')) {
    const st = normalizeSteps(project.steps).find((x) => !x.done)
    if (st) return st.text
  }
  return null
}

export {
  newStepId, normalizeSteps, parseStepLines, getProjectProgress, goalDirectTasks, getGoalProgress,
  nextStepFor,
}
