// Ported from the session test scripts on 2026-11-16 (goals-test.cjs). Run with: npm test -- goals
// Goals ← projects ← steps: tasks count once, task goal follows its project, "done" prompts at 100%.
const H = require('../harness.cjs')
const { chromium, devices } = H
const APP = 'http://localhost:4830', DB = 'http://localhost:4831'
const UID = '11111111-2222-3333-4444-555555555555'
const session = {
  access_token: 'x.' + Buffer.from(JSON.stringify({ sub: UID, exp: 4102444800 })).toString('base64') + '.y',
  token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, refresh_token: 'r',
  user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 'tester@example.com' },
}
const state = async () => (await fetch(DB + '/__state')).json()

;(async () => {
  await fetch(DB + '/__reset'); await fetch(DB + '/__set?tier=pro')
  const r = {}
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ ...devices['iPhone 14'] })
  await ctx.clock.install({ time: new Date('2026-11-16T12:00:00-06:00') }) // fixed day so results don't change with the calendar
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (x) => x.fulfill({ body: '' }))
  await ctx.addInitScript((s) => { try { localStorage.setItem('sb-localhost-auth-token', s); localStorage.setItem('planner_a2hs_seen', '1') } catch {} }, JSON.stringify(session))
  const p = await ctx.newPage()
  const errors = []; p.on('pageerror', (e) => errors.push(e.message))
  const modal = () => p.locator('.modal-sheet')
  const field = (label) => modal().locator('label', { hasText: label }).first()
  const openAdd = async (tab) => {
    await p.goto(APP + '/calendar'); await p.waitForTimeout(1500)
    await p.getByRole('button', { name: '+ Event' }).click(); await p.waitForTimeout(300)
    await modal().getByRole('button', { name: tab, exact: true }).click(); await p.waitForTimeout(200)
  }
  const goalCard = (t) => p.locator('section.card', { has: p.locator('div', { hasText: new RegExp('^' + t + '$') }) }).first()

  // Goal with one step of its own
  await openAdd('Goal')
  await field('Title').locator('input').fill('Launch app')
  await modal().locator('.step-add input').fill('Get D-U-N-S number'); await modal().locator('.step-add input').press('Enter')
  await modal().getByRole('button', { name: 'Save Goal' }).click(); await p.waitForTimeout(700)
  // Second goal (used later)
  await openAdd('Goal')
  await field('Title').locator('input').fill('Other goal')
  await modal().getByRole('button', { name: 'Save Goal' }).click(); await p.waitForTimeout(700)
  const goals = (await state()).tables.goals
  const g1 = goals.find((g) => g.title === 'Launch app'), g2 = goals.find((g) => g.title === 'Other goal')

  // Project for that goal
  await openAdd('Project')
  await field('Title').locator('input').fill('TestFlight build')
  await field('Goal').locator('select').selectOption(String(g1.id))
  await modal().getByRole('button', { name: 'Save Project' }).click(); await p.waitForTimeout(700)
  const pr = (await state()).tables.projects.find((x) => x.title === 'TestFlight build')
  r.projectGoalSaved = pr.goal_id === g1.id

  // Task in the project: goal fills in and locks
  await openAdd('Task')
  await field('Title').locator('input').fill('Upload build')
  await field('Project').locator('select').selectOption(String(pr.id)); await p.waitForTimeout(200)
  const goalSel = field('Goal').locator('select')
  r.taskGoalFilled = (await goalSel.inputValue()) === String(g1.id)
  r.taskGoalLocked = await goalSel.isDisabled()
  r.lockHint = (await field('Goal').getByText('Set by its project').count()) > 0
  await modal().getByRole('button', { name: 'Save Task' }).click(); await p.waitForTimeout(700)
  const task = (await state()).tables.tasks.find((t) => t.title === 'Upload build')
  r.taskSavedWithGoal = { goal: task.goal_id === g1.id, project: task.project_id === pr.id }

  // Goal progress: step (0) + project (0) → 0%; finish the task → project 100% → goal 50% (not 67%)
  await p.goto(APP + '/tasks'); await p.waitForTimeout(1500)
  await p.getByRole('button', { name: /Mark Upload build done|Mark task done/ }).first().click(); await p.waitForTimeout(900)
  await p.goto(APP + '/goals'); await p.waitForTimeout(1500)
  r.goalAfterTask = await goalCard('Launch app').locator('strong').filter({ hasText: '%' }).first().textContent()
  r.goalSummary = await goalCard('Launch app').getByText(/steps|project/).first().textContent()
  r.noPromptYet = (await goalCard('Launch app').getByText('Everything for this goal is done.').count()) === 0

  // Projects page: project at 100% offers "Mark project complete"
  await p.goto(APP + '/projects'); await p.waitForTimeout(1500)
  r.projectPrompt = (await p.getByText('Everything for this project is done.').count()) > 0
  await p.screenshot({ path: H.OUT + '/project-ready.png' })

  // Check the goal's own step → 100% → prompt with Mark goal achieved / Not yet
  await p.goto(APP + '/goals'); await p.waitForTimeout(1500)
  await goalCard('Launch app').locator('.step-check').first().click(); await p.waitForTimeout(800)
  r.goalAt100 = await goalCard('Launch app').locator('strong').filter({ hasText: '%' }).first().textContent()
  r.goalPrompt = (await goalCard('Launch app').getByText('Everything for this goal is done.').count()) > 0
  r.singleAchieveButton = await goalCard('Launch app').getByRole('button', { name: 'Mark goal achieved' }).count()
  await goalCard('Launch app').screenshot({ path: H.OUT + '/goal-ready.png' })
  await goalCard('Launch app').getByRole('button', { name: 'Not yet' }).click(); await p.waitForTimeout(300)
  r.notYetHides = (await goalCard('Launch app').getByText('Everything for this goal is done.').count()) === 0
  r.achieveLinkAfterNotYet = await goalCard('Launch app').getByRole('button', { name: 'Mark goal achieved' }).count()
  await p.reload(); await p.waitForTimeout(1800)
  r.notYetRemembered = (await goalCard('Launch app').getByText('Everything for this goal is done.').count()) === 0

  // Move the project to the other goal → its task follows
  await p.goto(APP + '/projects'); await p.waitForTimeout(1500)
  await p.locator('section.card', { hasText: 'TestFlight build' }).getByRole('button', { name: 'Edit' }).click(); await p.waitForTimeout(300)
  await field('Goal').locator('select').selectOption(String(g2.id))
  await modal().getByRole('button', { name: 'Save Changes' }).click(); await p.waitForTimeout(1200)
  const t2 = (await state()).tables.tasks.find((t) => t.title === 'Upload build')
  r.taskFollowedProject = t2.goal_id === g2.id

  r.errors = errors
  H.report(r)
  await browser.close(); process.exit(0)
})().catch((e) => { console.error(e); process.exit(1) })
