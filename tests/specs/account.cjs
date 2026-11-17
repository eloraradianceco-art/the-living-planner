// Ported from the session test scripts on 2026-11-16 (account-test.cjs). Run with: npm test -- account
const H = require('../harness.cjs')
const { chromium, devices } = H
const APP = 'http://localhost:4830', DB = 'http://localhost:4831', UID = '11111111-2222-3333-4444-555555555555'
const session = { access_token: 'x.' + Buffer.from(JSON.stringify({ sub: UID, exp: 4102444800 })).toString('base64') + '.y', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, refresh_token: 'r', user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 't@e.com' } }
const post = (t, b) => fetch(DB + '/rest/v1/' + t, { method: 'POST', body: JSON.stringify(b) })
const st = async () => (await fetch(DB + '/__state')).json()
;(async () => {
  await fetch(DB + '/__reset'); await fetch(DB + '/__set?tier=free')
  await post('habits', [1, 2, 3, 4, 5].map((n) => ({ id: 'h' + n, name: 'Habit ' + n, category: 'Health', user_id: UID })))
  const b = await chromium.launch(); const r = {}; const errs = []
  const ctx = await b.newContext({ ...devices['iPad Pro 11'], deviceScaleFactor: 1, timezoneId: 'America/Los_Angeles' })
  await ctx.route(/fonts\./, (x) => x.fulfill({ body: '' }))
  await ctx.addInitScript((s) => { if (sessionStorage.getItem('i')) return; sessionStorage.setItem('i', '1'); localStorage.setItem('sb-localhost-auth-token', s); localStorage.setItem('planner_a2hs_seen', '1'); localStorage.setItem('planner_onboarded', '1')
    // a previous account's cached data on this device
    localStorage.setItem('planner.lastUser', 'someone-else'); localStorage.setItem('planner.f.debts', JSON.stringify([{ name: 'OTHER PERSON DEBT', balance: 1, rate: 1, minPayment: 1 }])) }, JSON.stringify(session))
  const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept())
  await p.clock.install({ time: new Date('2026-11-13T23:30:00-08:00') })   // 11:30 PM in LA = Nov 14 in Chicago
  await p.goto(APP + '/'); await p.waitForTimeout(2000)
  r.heroDate = (await p.locator('.hero-focus-card .eyebrow').first().innerText())
  r.otherCacheGone = await p.evaluate(() => localStorage.getItem('planner.f.debts'))
  r.lastUser = await p.evaluate(() => localStorage.getItem('planner.lastUser'))
  // Habit limit on free
  await p.goto(APP + '/habits'); await p.waitForTimeout(1200)
  await p.getByRole('button', { name: '+ Habit' }).click(); await p.waitForTimeout(500)
  r.limitShown = (await p.locator('body').innerText()).match(/Free includes 5 habits[^\n]*/)?.[0] || 'none'
  // Profile: name saves once on blur, timezone select
  await p.goto(APP + '/more'); await p.waitForTimeout(1500)
  const writes0 = (await st()).profileWrites.length
  const name = p.getByLabel('Display Name'); await name.fill(''); await name.type('Anthony'); await p.waitForTimeout(300)
  const writesTyping = (await st()).profileWrites.length - writes0
  await name.blur(); await p.waitForTimeout(500)
  r.profileWrites = { whileTyping: writesTyping, afterBlur: (await st()).profileWrites.length - writes0 }
  r.tzOptions = (await p.getByLabel('Time zone').locator('option').allInnerTexts()).slice(0, 4)
  r.tzHint = (await p.getByText("This device is on").count())
  // Sign out clears cached data
  await p.evaluate(() => localStorage.setItem('planner.hw.sleep', '[1]'))
  await p.getByRole('button', { name: 'Sign Out' }).click(); await p.waitForTimeout(1200)
  r.afterSignOut = await p.evaluate(() => Object.keys(localStorage).sort())
  r.errors = errs
  H.report(r); await b.close()
})().catch((e) => { console.error(e); process.exit(1) })
