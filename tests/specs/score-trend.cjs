// Ported from the session test scripts on 2026-11-16 (trend-test.cjs). Run with: npm test -- score-trend
const H = require('../harness.cjs')
const { chromium, devices } = H
const APP = 'http://localhost:4830', DB = 'http://localhost:4831', UID = '11111111-2222-3333-4444-555555555555'
const session = { access_token: 'x.' + Buffer.from(JSON.stringify({ sub: UID, exp: 4102444800 })).toString('base64') + '.y', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, refresh_token: 'r', user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 't@e.com' } }
const post = (t, b) => fetch(DB + '/rest/v1/' + t, { method: 'POST', body: JSON.stringify(b) })
;(async () => {
  await fetch(DB + '/__reset'); await fetch(DB + '/__set?tier=pro')
  await post('habits', [{ id: 'pray', name: 'Pray daily', category: 'Faith', user_id: UID }, { id: 'walk', name: 'Walk', category: 'Health', user_id: UID }])
  const logs = []; for (const d of ['2026-11-01', '2026-11-02', '2026-11-04', '2026-11-06', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13']) logs.push({ id: 'p' + d, habit_id: 'pray', date: d, completed: true, user_id: UID })
  for (const d of ['2026-11-10', '2026-11-12']) logs.push({ id: 'w' + d, habit_id: 'walk', date: d, completed: true, user_id: UID })
  await post('habit_logs', logs)
  await post('tasks', [{ id: 't1', title: 'Client', date: '2026-11-12', completed: true, category: 'Business', user_id: UID }, { id: 't2', title: 'Invoice', date: '2026-11-13', completed: false, category: 'Business', user_id: UID }, { id: 't3', title: 'Call', date: '2026-11-11', completed: true, category: 'Business', user_id: UID }])
  // old-formula snapshots (no _v) and one current-formula snapshot
  await post('score_history', [{ id: 's11', user_id: UID, date: '2026-11-11', overall_score: 7, scores: { Health: 7 } }, { id: 's08', user_id: UID, date: '2026-11-08', overall_score: 4, scores: { Faith: 4, _v: 2 } }])
  const b = await chromium.launch(); const errs = []
  const ctx = await b.newContext({ ...devices['iPhone 14'], deviceScaleFactor: 2, timezoneId: 'America/Chicago' })
  await ctx.route(/fonts\./, (x) => x.fulfill({ body: '' }))
  await ctx.addInitScript((s) => { if (sessionStorage.getItem('i')) return; sessionStorage.setItem('i', '1'); localStorage.setItem('sb-localhost-auth-token', s); localStorage.setItem('planner_a2hs_seen', '1'); localStorage.setItem('planner_onboarded', '1') }, JSON.stringify(session))
  const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message))
  await p.clock.install({ time: new Date('2026-11-13T13:40:00-06:00') })
  await p.goto(APP + '/growth'); await p.waitForTimeout(2500)
  const card = p.locator('section.card').filter({ hasText: 'Score Trend' })
  await card.screenshot({ path: H.OUT + '/trend.png' })
  const bars = await p.locator('.trend-col').evaluateAll((cols) => cols.map((c) => ({ t: c.title, h: Math.round(c.firstElementChild.getBoundingClientRect().height) })))
  const out = { bars: bars.filter((x) => !x.t.includes('nothing')) }
  out.cols = bars.length; out.note = (await card.innerText()).split('\n').slice(-1)[0]
  await p.goto(APP + '/'); await p.waitForTimeout(1500)
  await H.openFolds(p); await p.waitForTimeout(400) // the week chart is a row on Home (2026-11-19)
  await p.locator('section.card').filter({ hasText: 'Execution' }).screenshot({ path: H.OUT + '/execution.png' })
  const hist = (await (await fetch(DB + '/__state')).json()).tables.score_history.filter((h) => h.date === '2026-11-13').map((h) => h.scores._v)
  out.todaySnapshotVersion = hist; out.errors = errs; H.report(out); await b.close()
})()
