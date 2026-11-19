// Ported from the session test scripts on 2026-11-16 (life-test.cjs). Run with: npm test -- life-score
const H = require('../harness.cjs')
const { chromium, devices } = H
const APP = 'http://localhost:4830', DB = 'http://localhost:4831', UID = '11111111-2222-3333-4444-555555555555'
const session = { access_token: 'x.' + Buffer.from(JSON.stringify({ sub: UID, exp: 4102444800 })).toString('base64') + '.y', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, refresh_token: 'r', user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 't@e.com' } }
const post = (t, b) => fetch(DB + '/rest/v1/' + t, { method: 'POST', body: JSON.stringify(b) })
const pd = (page, key, v) => post('page_data', { user_id: UID, page, data_key: key, data_value: v, updated_at: '2026-11-13T12:00:00Z' })
const st = async () => (await fetch(DB + '/__state')).json()
const get = async (k) => ((await st()).pageData.find((x) => x.data_key === k) || {}).data_value
;(async () => {
  await fetch(DB + '/__reset'); await fetch(DB + '/__set?tier=pro')
  await pd('finance', 'debts', [{ id: 1, name: 'Car', balance: 9000, rate: 4, minPayment: 300 }, { id: 2, name: 'Card', balance: 2000, rate: 24, minPayment: 60 }])
  await pd('lifestyle', 'birthdays', [{ id: 1, name: 'Natalie', date: '1992-11-13', relationship: 'Wife' }, { id: 2, name: 'Mom', date: '1965-02-01', relationship: 'Mother' }])
  await pd('lifestyle', 'groceries', [{ label: 'Apples', qty: '', done: true }, { label: 'Milk', qty: '', done: false }])
  await pd('lifestyle', 'trips', [{ destination: 'Old trip', startDate: '2026-03-01', endDate: '2026-03-05' }, { destination: 'Next trip', startDate: '2026-12-20', endDate: '2026-12-27' }])
  await pd('wellness', 'meds', [{ name: 'Vitamin D', dose: '1000IU', time: 'AM', days: ['Mon', 'Wed', 'Fri'] }, { name: 'Fish oil', dose: '', time: '', days: ['Tue'] }])
  await fetch(DB + '/rest/v1/faith_data', { method: 'POST', body: JSON.stringify({ user_id: UID, data_key: 'prayers', data_value: [{ id: 1, text: 'Provision for the business', type: 'Request', date: '2026-11-01', answered: true, answeredDate: '2026-11-10' }, { id: 2, text: 'Health for Mom', type: 'Request', date: '2026-11-05' }] }) })
  const b = await chromium.launch(); const r = {}; const errs = []
  const ctx = await b.newContext({ ...devices['iPhone 14'], deviceScaleFactor: 1, timezoneId: 'America/Chicago' })
  await ctx.route(/fonts\./, (x) => x.fulfill({ body: '' }))
  await ctx.addInitScript((s) => { if (sessionStorage.getItem('i')) return; sessionStorage.setItem('i', '1'); localStorage.setItem('sb-localhost-auth-token', s); localStorage.setItem('planner_a2hs_seen', '1'); localStorage.setItem('planner_onboarded', '1') }, JSON.stringify(session))
  const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept())
  await p.clock.install({ time: new Date('2026-11-13T12:00:00-06:00') })
  // Debts: delete the top (Card, highest rate) - must remove Card not Car
  await p.goto(APP + '/finance?tab=debt'); await p.waitForTimeout(1500)
  await p.getByRole('button', { name: 'Delete Card' }).click(); await p.waitForTimeout(600)
  r.debtsLeft = (await get('debts')).map((d) => d.name)
  // Weekly target saves once on blur
  await p.goto(APP + '/finance?tab=budget'); await p.waitForTimeout(1200)
  const tgt = p.locator('input[type=number]').first(); await tgt.fill(''); await tgt.type('275'); await p.waitForTimeout(300)
  const writesBefore = ((await st()).profileWrites || []).length
  await tgt.blur(); await p.waitForTimeout(600)
  r.targetValue = await tgt.inputValue()
  // Birthdays
  await p.goto(APP + '/lifestyle?tab=birthdays'); await p.waitForTimeout(1300)
  r.birthdays = (await p.locator('section.card').first().innerText()).split('\n').filter((l) => /Natalie|Mom|Wife|Mother|Today|\dd$/.test(l))
  // Groceries: re-add Apples from master list, order
  await p.goto(APP + '/lifestyle?tab=groceries'); await p.waitForTimeout(1300)
  await p.locator('details.grocery-cat > summary', { hasText: 'Fruits' }).click(); await p.waitForTimeout(300) // aisles open on tap (2026-11-18)
  await p.getByRole('button', { name: '+ Apples', exact: true }).click(); await p.waitForTimeout(500)
  r.groceries = (await get('groceries')).map((g) => `${g.label}:${g.done ? 'done' : 'open'}`)
  // Trips order
  await p.goto(APP + '/lifestyle?tab=trips'); await p.waitForTimeout(1200)
  r.trips = (await p.locator('section.card').first().innerText()).split('\n').filter((l) => /trip|Past|in \d+ days/.test(l))
  // Meds: Friday → Vitamin D due, Fish oil not
  await p.goto(APP + '/wellness?tab=meds'); await p.waitForTimeout(1300)
  r.meds = (await p.locator('section.card').first().innerText()).replace(/\s+/g, ' ').slice(0, 220)
  // Prayers
  await p.goto(APP + '/faith?tab=prayer'); await p.waitForTimeout(1500)
  r.praise = (await p.locator('section.card').first().innerText()).split('\n').filter((l) => /✓|Answered/.test(l))
  // Focus timer: break preset then work stays 25
  await p.goto(APP + '/productivity?tab=focus'); await p.waitForTimeout(1000)
  await p.getByRole('button', { name: /Short Break/ }).click()
  await p.getByRole('button', { name: /Start/ }).click(); await p.clock.runFor(5 * 60 * 1000 + 2000); await p.waitForTimeout(300)
  r.afterBreak = (await p.locator('text=/\\d\\d:\\d\\d/').first().innerText())
  r.errors = errs
  H.report(r); await b.close()
})().catch((e) => { console.error(e); process.exit(1) })
