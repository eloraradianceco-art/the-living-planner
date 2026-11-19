// Ported from the session test scripts on 2026-11-16 (core-test.cjs). Run with: npm test -- core
const H = require('../harness.cjs')
const { chromium, devices } = H
const APP = 'http://localhost:4830', DB = 'http://localhost:4831', UID = '11111111-2222-3333-4444-555555555555'
const session = { access_token: 'x.' + Buffer.from(JSON.stringify({ sub: UID, exp: 4102444800 })).toString('base64') + '.y', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, refresh_token: 'r', user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 't@e.com' } }
const post = (t, b) => fetch(DB + '/rest/v1/' + t, { method: 'POST', body: JSON.stringify(b) })
const st = async () => (await fetch(DB + '/__state')).json()
;(async () => {
  await fetch(DB + '/__reset'); await fetch(DB + '/__set?tier=pro')
  await post('tasks', [
    { id: 't1', title: 'Due today untimed', date: '2026-11-13', category: 'Business', priority: 'High', completed: false, user_id: UID },
    { id: 't2', title: 'Overdue weekly', date: '2026-11-03', category: 'Business', priority: 'Medium', completed: false, recurrence: 'weekly', user_id: UID },
    { id: 't3', title: 'Monthly on 31st', date: '2026-10-31', category: 'Finances', priority: 'Low', completed: false, recurrence: 'monthly', user_id: UID },
    { id: 't4', title: 'Someday idea', date: '', category: 'Productivity', priority: 'Low', completed: false, user_id: UID },
    { id: 't5', title: 'Timed today', date: '2026-11-13', time: '15:00', category: 'Business', priority: 'Low', completed: false, user_id: UID },
  ])
  await post('habits', [{ id: 'h2', name: 'Do cardio 3x per week', category: 'Health', user_id: UID }, { id: 'h3', name: 'Stretch', category: 'Health', frequency: '2x', user_id: UID }])
  await post('habit_logs', ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-02', '2026-11-04', '2026-11-06'].map((d, i) => ({ id: 'c' + i, habit_id: 'h2', date: d, completed: true, user_id: UID })))
  await post('habit_logs', [{ id: 's1', habit_id: 'h3', date: '2026-11-12', completed: true, user_id: UID }])
  await post('expenses', [{ id: 'x1', amount: 40, category: 'Food', description: 'This week', date: '2026-11-12', period: 'one-time', user_id: UID }, { id: 'x2', amount: 500, category: 'Food', description: 'Old', date: '2026-10-01', period: 'one-time', user_id: UID }, { id: 'x3', amount: 43.3, category: 'Entertainment', description: 'Streaming', date: '2026-09-01', period: 'monthly', user_id: UID }])
  const b = await chromium.launch(); const r = {}; const errs = []
  const ctx = await b.newContext({ ...devices['iPhone 14'], deviceScaleFactor: 1, timezoneId: 'America/Chicago' })
  await ctx.route(/fonts\./, (x) => x.fulfill({ body: '' }))
  await ctx.addInitScript((s) => { if (sessionStorage.getItem('i')) return; sessionStorage.setItem('i', '1'); localStorage.setItem('sb-localhost-auth-token', s); localStorage.setItem('planner_a2hs_seen', '1'); localStorage.setItem('planner_onboarded', '1') }, JSON.stringify(session))
  const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message))
  await p.clock.install({ time: new Date('2026-11-13T12:00:00-06:00') })
  await p.goto(APP + '/'); await p.waitForTimeout(2000); await H.openFolds(p); await p.waitForTimeout(300) /* Home blocks are rows since 2026-11-19 */
  r.metrics = (await p.locator('.home-metrics-strip').innerText()).replace(/\s+/g, ' ')
  r.topHabit = (await p.getByText('TOP HABIT', { exact: false }).first().locator('..').innerText()).replace(/\s+/g, ' ')
  await p.goto(APP + '/tasks'); await p.waitForTimeout(1200)
  r.taskGroups = await p.locator('section.card h3').allInnerTexts()
  // complete the overdue weekly + monthly tasks
  p.on('dialog', (d) => d.accept())
  await p.getByRole('button', { name: 'Mark Overdue weekly done' }).click(); await p.waitForTimeout(800)
  await p.getByRole('button', { name: 'Mark Monthly on 31st done' }).click(); await p.waitForTimeout(800)
  const tasks = (await st()).tables.tasks
  r.newOccurrences = tasks.filter((t) => !['t1', 't2', 't3', 't4', 't5'].includes(t.id)).map((t) => `${t.title} → ${t.date}`)
  // delete with confirm (dialog accepted)
  await p.getByRole('button', { name: '✕' }).first().count()
  await p.goto(APP + '/calendar'); await p.waitForTimeout(1200)
  r.allDay = (await p.locator('.cal-allday').innerText().catch(() => 'none')).replace(/\s+/g, ' ')
  await p.getByRole('button', { name: 'month', exact: true }).click()
  const labels = []
  for (let i = 0; i < 4; i++) { labels.push((await p.locator('.screen-stack > section.card').first().innerText()).split('\n')[0]) /* month label lives in the header since 2026-11-16 */; await p.getByRole('button', { name: 'Next' }).click(); await p.waitForTimeout(150) }
  r.monthNav = labels
  await p.goto(APP + '/habits'); await p.waitForTimeout(1200)
  r.habitRows = (await p.locator('section.card').first().innerText()).split('\n').filter((l) => /this week|streak/.test(l))
  await p.goto(APP + '/goals'); await p.waitForTimeout(800)
  r.smartOpen = await p.locator('details.smart-guide').getAttribute('open')
  r.errors = errs
  H.report(r); await b.close()
})().catch((e) => { console.error(e); process.exit(1) })
