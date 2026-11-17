// Ported from the session test scripts on 2026-11-16 (growth-test.cjs). Run with: npm test -- growth
const H = require('../harness.cjs')
const { chromium, devices } = H
const DB = 'http://localhost:4831', UID = '11111111-2222-3333-4444-555555555555'
const session = { access_token: 'x.' + Buffer.from(JSON.stringify({ sub: UID, exp: 4102444800 })).toString('base64') + '.y', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, refresh_token: 'r', user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 't@e.com' } }
const pd = async () => (await (await fetch(DB + '/__state')).json()).pageData || []
;(async () => {
  await fetch(DB + '/__reset'); await fetch(DB + '/__set?tier=pro')
  const b = await chromium.launch(); const r = {}
  const ctx = await b.newContext({ ...devices['iPhone 14'] }); await ctx.route(/fonts\./, (x) => x.fulfill({ body: '' }))
  await ctx.clock.install({ time: new Date('2026-11-16T12:00:00-06:00') }) // fixed day so results don't change with the calendar
  // Old build left the intention under 'planner.gr.intention' (raw string) — it should still show
  await ctx.addInitScript((s) => { localStorage.setItem('sb-localhost-auth-token', s); localStorage.setItem('planner_a2hs_seen', '1'); if (!sessionStorage.getItem('seeded')) { localStorage.setItem('planner.gr.intention', 'Be patient'); sessionStorage.setItem('seeded', '1') } }, JSON.stringify(session))
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message))
  await p.goto('http://localhost:4830/growth'); await p.waitForTimeout(2000)
  const ta = p.getByPlaceholder('This week I am committed to...')
  r.oldIntentionShown = await ta.inputValue()
  await ta.fill('Lead my home with patience'); await p.waitForTimeout(1200)
  r.intentionSynced = (await pd()).find((x) => x.page === 'growth' && x.data_key === 'intentionText')?.data_value
  await p.reload(); await p.waitForTimeout(2000)
  r.afterReload = await p.getByPlaceholder('This week I am committed to...').inputValue()
  r.cache = await p.evaluate(() => localStorage.getItem('planner.gr.intentionText'))
  r.errors = errs
  H.report(r); await b.close()
})()
