// Ported from the session test scripts on 2026-11-16 (focus-test.cjs). Run with: npm test -- focus
const H = require('../harness.cjs')
const { chromium, devices } = H
const APP = 'http://localhost:4830', DB = 'http://localhost:4831', UID = '11111111-2222-3333-4444-555555555555'
const session = { access_token: 'x.' + Buffer.from(JSON.stringify({ sub: UID, exp: 4102444800 })).toString('base64') + '.y', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, refresh_token: 'r', user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 't@e.com' } }
const post = (t, b) => fetch(DB + '/rest/v1/' + t, { method: 'POST', body: JSON.stringify(b) })
const T = (id, date, extra = {}) => ({ id, title: id, date, category: 'Business', priority: 'High', completed: false, user_id: UID, ...extra })
const scenarios = {
  allDoneToday: [T('Done today A', '2026-11-13', { completed: true }), T('Done today B', '2026-11-13', { completed: true }), T('Next week thing', '2026-11-19')],
  nothingToday: [T('Next week thing', '2026-11-19')],
  overdueWins: [T('Late one', '2026-11-10', { priority: 'Low' }), T('Next week thing', '2026-11-19')],
  timedToday: [T('Joey Training', '2026-11-13', { time: '15:00', end_time: '16:00' })],
}
;(async () => {
  const b = await chromium.launch(); const out = {}; const errs = []
  for (const [name, tasks] of Object.entries(scenarios)) {
    await fetch(DB + '/__reset'); await fetch(DB + '/__set?tier=pro'); await post('tasks', tasks)
    const ctx = await b.newContext({ ...devices['iPhone 14'], deviceScaleFactor: 2, timezoneId: 'America/Chicago' })
    await ctx.route(/fonts\./, (x) => x.fulfill({ body: '' }))
    await ctx.addInitScript((s) => { if (sessionStorage.getItem('i')) return; sessionStorage.setItem('i', '1'); localStorage.setItem('sb-localhost-auth-token', s); localStorage.setItem('planner_a2hs_seen', '1'); localStorage.setItem('planner_onboarded', '1') }, JSON.stringify(session))
    const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message))
    await p.clock.install({ time: new Date('2026-11-13T13:30:00-06:00') })
    await p.goto(APP + '/'); await p.waitForTimeout(1800)
    const focus = p.locator('section.card').filter({ hasText: "Today's Focus" }).first()
    out[name] = { focus: (await focus.innerText()).split('\n').slice(1, 6).join(' | '), timeline: await p.getByText("What's on the clock").count() }
    if (name === 'allDoneToday') await focus.screenshot({ path: H.OUT + '/focus-done.png' })
    if (name === 'timedToday') await p.locator('section.card').filter({ hasText: "What's on the clock" }).screenshot({ path: H.OUT + '/timeline.png' })
    await ctx.close()
  }
  out.errors = errs; H.report(out); await b.close()
})()
