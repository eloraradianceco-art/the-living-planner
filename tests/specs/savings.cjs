// Ported from the session test scripts on 2026-11-16 (savings-test.cjs). Run with: npm test -- savings
const H = require('../harness.cjs')
const { chromium, devices } = H
const APP = 'http://localhost:4830', DB = 'http://localhost:4831', UID = '11111111-2222-3333-4444-555555555555'
const session = { access_token: 'x.' + Buffer.from(JSON.stringify({ sub: UID, exp: 4102444800 })).toString('base64') + '.y', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, refresh_token: 'r', user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 't@e.com' } }
const fin = async (k) => ((await (await fetch(DB + '/__state')).json()).pageData || []).find((r) => r.page === 'finance' && r.data_key === k)?.data_value
;(async () => {
  await fetch(DB + '/__reset'); await fetch(DB + '/__set?tier=pro')
  // Existing data from the old build: a goal and a sinking fund with no history
  await fetch(DB + '/rest/v1/page_data', { method: 'POST', body: JSON.stringify({ user_id: UID, page: 'finance', data_key: 'savingsGoals', data_value: [{ id: 1, label: 'Emergency Fund', goal: 1000, current: 0, color: 'var(--teal)' }] }) })
  await fetch(DB + '/rest/v1/page_data', { method: 'POST', body: JSON.stringify({ user_id: UID, page: 'finance', data_key: 'sinkingFunds', data_value: [{ id: 7, name: 'Car repair', target: 600, current: 100, dueDate: '' }] }) })
  const b = await chromium.launch(); const r = {}
  const ctx = await b.newContext({ ...devices['iPhone 14'] }); await ctx.route(/fonts\./, (x) => x.fulfill({ body: '' }))
  await ctx.clock.install({ time: new Date('2026-11-16T12:00:00-06:00') }) // fixed day so results don't change with the calendar
  await ctx.addInitScript((s) => { localStorage.setItem('sb-localhost-auth-token', s); localStorage.setItem('planner_a2hs_seen', '1') }, JSON.stringify(session))
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept())
  await p.goto(APP + '/finance?tab=savings'); await p.waitForTimeout(2000)
  const item = (name) => p.locator('.sav-item', { hasText: name }).first()
  const total = async () => (await p.locator('section.card', { hasText: 'Total Saved Across All Goals' }).locator('strong').nth(1).textContent()).trim()

  // Add money to the existing goal
  await item('Emergency Fund').getByRole('button', { name: '+ Add money' }).click()
  await item('Emergency Fund').getByLabel(/Amount for/).fill('250')
  await item('Emergency Fund').getByLabel(/Note/).fill('Paycheck')
  r.addBtnLabel = (await item('Emergency Fund').locator('.money-move .primary-btn').textContent()).trim()
  await item('Emergency Fund').locator('.money-move .primary-btn').click(); await p.waitForTimeout(600)
  r.afterAdd = { shown: (await item('Emergency Fund').locator('.sav-saved').textContent()).trim(), total: await total(), stored: (await fin('savingsGoals'))[0].current }
  // Take out 50
  await item('Emergency Fund').getByRole('button', { name: '+ Add money' }).click()
  await item('Emergency Fund').getByLabel(/Amount for/).fill('$50')
  await item('Emergency Fund').getByRole('button', { name: '− Take out' }).click(); await p.waitForTimeout(600)
  r.afterTakeOut = (await item('Emergency Fund').locator('.sav-saved').textContent()).trim()
  // Take out more than saved clamps to 0 history records real amount
  await item('Emergency Fund').getByRole('button', { name: '+ Add money' }).click()
  await item('Emergency Fund').getByLabel(/Amount for/).fill('5000')
  await item('Emergency Fund').getByRole('button', { name: '− Take out' }).click(); await p.waitForTimeout(600)
  r.clamped = (await fin('savingsGoals'))[0].history.map((h) => `${h.amount}|${h.note}`)
  // Put money back; Enter key adds
  await item('Emergency Fund').getByRole('button', { name: '+ Add money' }).click()
  await item('Emergency Fund').getByLabel(/Amount for/).fill('1,000'); await item('Emergency Fund').getByLabel(/Amount for/).press('Enter'); await p.waitForTimeout(600)
  r.reached = (await item('Emergency Fund').locator('.sav-hint').textContent()).trim()
  // History
  await item('Emergency Fund').getByRole('button', { name: /History/ }).click()
  r.historyRows = (await item('Emergency Fund').locator('.sav-history li').allTextContents()).map((t) => t.replace(/\s+/g, ' '))
  // Edit: rename, raise goal, set target date, correct balance
  await item('Emergency Fund').getByRole('button', { name: 'Edit' }).click()
  const ed = item('Emergency Fund').locator('.sav-edit-grid')
  await ed.getByLabel('Name').fill('Emergency Fund (3 mo)')
  await ed.getByLabel('Goal amount').fill('6000')
  await ed.getByLabel('Saved so far').fill('1200')
  await ed.getByLabel(/Target date/).fill('2027-11-01')
  await item('Emergency Fund').getByRole('button', { name: 'Save', exact: true }).click(); await p.waitForTimeout(600)
  const g = (await fin('savingsGoals'))[0]
  r.afterEdit = { label: g.label, goal: g.goal, current: g.current, targetDate: g.targetDate, lastHistory: g.history[0] && `${g.history[0].amount}|${g.history[0].note}`, hint: (await item('Emergency Fund (3 mo)').locator('.sav-hint').textContent()).trim() }

  // New goal with money already saved
  const nf = p.locator('.sav-new', { hasText: 'New Savings Goal' })
  await nf.getByLabel('Goal name').fill('Wedding')
  await nf.getByLabel('Goal amount').fill('8000')
  await nf.getByLabel(/Already saved/).fill('1500')
  await nf.getByRole('button', { name: '+ Add Goal' }).click(); await p.waitForTimeout(600)
  const w = (await fin('savingsGoals')).find((x) => x.label === 'Wedding')
  r.newGoal = { goal: w.goal, current: w.current, history: w.history.map((h) => `${h.amount}|${h.note}`), total: await total() }
  await nf.screenshot({ path: H.OUT + '/sav-new.png' })

  // Sinking fund (legacy, no history): add via inline form instead of pop-up
  await item('Car repair').getByRole('button', { name: '+ Add money' }).click()
  await item('Car repair').getByLabel(/Amount for/).fill('75.50')
  await item('Car repair').locator('.money-move .primary-btn').click(); await p.waitForTimeout(600)
  r.sinking = (await fin('sinkingFunds'))[0]
  // New sinking fund with labels
  await p.getByRole('button', { name: '+ New' }).click()
  const sf = p.locator('.sav-new').first()
  await sf.getByLabel('Fund name').fill('Christmas 2026'); await sf.getByLabel('Target amount').fill('900'); await sf.getByLabel(/Already saved/).fill('100'); await sf.getByLabel(/Due date/).fill('2026-12-20')
  await sf.getByRole('button', { name: 'Add Fund' }).click(); await p.waitForTimeout(600)
  r.newSinkingHint = (await item('Christmas 2026').locator('.sav-hint').textContent()).trim()
  await item('Emergency Fund (3 mo)').getByRole('button', { name: '+ Add money' }).click()
  await item('Emergency Fund (3 mo)').getByLabel(/Amount for/).fill('200')
  await p.locator('section.card', { hasText: 'What You' }).screenshot({ path: H.OUT + '/sav-goals-new.png' })
  // Delete
  await item('Wedding').getByRole('button', { name: 'Delete Wedding' }).click(); await p.waitForTimeout(500)
  r.afterDelete = (await fin('savingsGoals')).map((x) => x.label)
  // Overview total
  await p.goto(APP + '/finance?tab=overview'); await p.waitForTimeout(1500)
  r.overviewTotal = await p.getByText('Total Saved (goals)').locator('..').textContent().catch(() => null)
  r.errors = errs
  H.report(r); await b.close()
})().catch((e) => { console.error(e); process.exit(1) })
