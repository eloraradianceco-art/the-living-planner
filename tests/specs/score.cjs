// Ported from the session test scripts on 2026-11-16 (score-test.cjs). Run with: npm test -- score
// New Life Score: real section data counts, live updates when you log, "—" when untracked, history snapshot,
// cleaning tracker resets by period.
const H = require('../harness.cjs')
const { chromium, devices } = H
const APP = 'http://localhost:4830', DB = 'http://localhost:4831', UID = '11111111-2222-3333-4444-555555555555'
const session = { access_token: 'x.' + Buffer.from(JSON.stringify({ sub: UID, exp: 4102444800 })).toString('base64') + '.y', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, refresh_token: 'r', user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 't@e.com' } }
const post = (t, b) => fetch(DB + '/rest/v1/' + t, { method: 'POST', body: JSON.stringify(b) })
const st = async () => (await fetch(DB + '/__state')).json()
;(async () => {
  await fetch(DB + '/__reset'); await fetch(DB + '/__set?tier=pro')
  // Habits (Faith daily, Health daily + 3x/week, Lifestyle daily), check-ins Nov 10–13
  await post('habits', [{ id: 'pray', name: 'Pray daily', category: 'Faith', user_id: UID }, { id: 'walk', name: 'Take a walk', category: 'Health', user_id: UID }, { id: 'cardio', name: 'Do cardio 3x per week', category: 'Health', user_id: UID }, { id: 'nat', name: 'Affirm Natalie', category: 'Lifestyle', user_id: UID }])
  for (const d of ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13']) for (const h of ['pray', 'nat']) await post('habit_logs', { id: h + d, habit_id: h, date: d, completed: true, user_id: UID })
  for (const d of ['2026-11-11', '2026-11-13']) await post('habit_logs', { id: 'walk' + d, habit_id: 'walk', date: d, completed: true, user_id: UID })
  await post('page_data', { user_id: UID, page: 'wellness', data_key: 'wellnessLog', data_value: { '2026-11-11': { mood: 4 }, '2026-11-12': { mood: 3 }, '2026-11-13': { mood: 4 } }, updated_at: '2026-11-13T12:00:00Z' })
  await post('page_data', { user_id: UID, page: 'wellness', data_key: 'waterLog', data_value: { '2026-11-12': 5 }, updated_at: '2026-11-13T12:00:00Z' })
  const b = await chromium.launch(); const r = {}; const errs = []
  const ctx = await b.newContext({ ...devices['iPhone 14'], deviceScaleFactor: 1, timezoneId: 'America/Chicago' })
  await ctx.route(/fonts\./, (x) => x.fulfill({ body: '' }))
  await ctx.addInitScript((s) => { if (sessionStorage.getItem('i')) return; sessionStorage.setItem('i', '1'); localStorage.setItem('sb-localhost-auth-token', s); localStorage.setItem('planner_a2hs_seen', '1') }, JSON.stringify(session))
  const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message))
  await p.clock.install({ time: new Date('2026-11-13T12:00:00-06:00') })
  const snap = async () => Object.fromEntries((await p.locator('.score-snap').allInnerTexts()).map((t) => { const [label, val] = t.split('\n').map((x) => x.trim()).filter(Boolean); return [label.replace(/^\S+\s/, ''), val] }))
  await p.goto(APP + '/'); await p.waitForTimeout(2500)
  r.homeBefore = await snap()
  r.lifePill = (await p.getByText('Life Score').first().locator('..').innerText()).replace(/\s+/g, ' ')
  // Write today's reflection → Faith should move without a reload
  await p.getByRole('link', { name: /Faith/ }).first().click(); await p.waitForTimeout(800)
  await p.goto(APP + '/faith?tab=devotional'); await p.waitForTimeout(1500)
  await p.getByLabel("Today's reflection").fill('Thankful for provision.'); await p.waitForTimeout(1200)
  // Check a daily chore → Lifestyle gets a chores part
  await p.goto(APP + '/lifestyle?tab=cleaning'); await p.waitForTimeout(1500)
  await p.getByText('Make beds', { exact: true }).click(); await p.waitForTimeout(700)
  r.choreKey = Object.keys(((await st()).pageData.find((x) => x.data_key === 'cleaningLog') || {}).data_value || {})
  await p.goto(APP + '/'); await p.waitForTimeout(2000)
  r.homeAfter = await snap()
  // Growth breakdown
  await p.goto(APP + '/growth'); await p.waitForTimeout(1500)
  await p.getByRole('button', { name: 'How scores work' }).click(); await p.waitForTimeout(300)
  r.breakdown = (await p.locator('.score-explain-area').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').slice(0, 170))
  await p.locator('.score-explain').screenshot({ path: H.OUT + '/score-explain.png' })
  await p.waitForTimeout(1500)
  r.history = ((await st()).tables.score_history || []).map((h) => ({ date: h.date, overall: h.overall_score, scores: h.scores }))
  // Next day: daily chore list resets
  await p.clock.setFixedTime(new Date('2026-11-14T08:00:00-06:00'))
  await p.goto(APP + '/lifestyle?tab=cleaning'); await p.waitForTimeout(1800)
  r.nextDayDailyDone = (await p.locator('section.card h3').filter({ hasText: /of \d+ done/ }).first().textContent()).trim()
  await p.goto(APP + '/'); await p.waitForTimeout(1500)
  await p.locator('.score-snap-grid').screenshot({ path: H.OUT + '/score-home.png' })
  r.errors = errs
  H.report(r); await b.close()
})().catch((e) => { console.error(e); process.exit(1) })
