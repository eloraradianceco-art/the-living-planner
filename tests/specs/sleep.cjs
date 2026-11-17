// Ported from the session test scripts on 2026-11-16 (sleep-test.cjs). Run with: npm test -- sleep
const H = require('../harness.cjs')
const { chromium, devices } = H
const APP = 'http://localhost:4830', DB = 'http://localhost:4831', UID = '11111111-2222-3333-4444-555555555555'
const session = { access_token: 'x.' + Buffer.from(JSON.stringify({ sub: UID, exp: 4102444800 })).toString('base64') + '.y', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, refresh_token: 'r', user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 't@e.com' } }
const post = (t, b) => fetch(DB + '/rest/v1/' + t, { method: 'POST', body: JSON.stringify(b) })
const st = async () => (await fetch(DB + '/__state')).json()
const pd = async (k) => ((await st()).pageData.find((x) => x.data_key === k) || {}).data_value
;(async () => {
  await fetch(DB + '/__reset'); await fetch(DB + '/__set?tier=pro')
  await post('page_data', { user_id: UID, page: 'wellness', data_key: 'sleep', data_value: [{ date: '2026-11-12', bed: '09:30', wake: '04:30', quality: 5 }, { date: '2026-11-11', bed: '22:45', wake: '06:15', quality: 7 }], updated_at: '2026-11-13T12:00:00Z' })
  await post('page_data', { user_id: UID, page: 'wellness', data_key: 'recovery', data_value: { '2026-11-12': { energy: 3, stress: 3, soreness: 2, sleepHours: 19 } }, updated_at: '2026-11-13T12:00:00Z' })
  const b = await chromium.launch(); const r = {}; const errs = []
  const ctx = await b.newContext({ ...devices['iPhone 14'], deviceScaleFactor: 1, timezoneId: 'America/Chicago' })
  await ctx.route(/fonts\./, (x) => x.fulfill({ body: '' }))
  await ctx.addInitScript((s) => { if (sessionStorage.getItem('i')) return; sessionStorage.setItem('i', '1'); localStorage.setItem('sb-localhost-auth-token', s); localStorage.setItem('planner_a2hs_seen', '1') }, JSON.stringify(session))
  const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message))
  await p.clock.install({ time: new Date('2026-11-13T12:00:00-06:00') })
  await p.goto(APP + '/wellness?tab=sleep'); await p.waitForTimeout(2200)
  const rows = async () => (await p.locator('.metric-row.card-row').allInnerTexts()).map((t) => t.replace(/\s+/g, ' '))
  r.listBefore = await rows()
  const times = p.locator('input[type=time]')
  await times.nth(0).fill('10:15'); await times.nth(1).fill('05:45'); await p.waitForTimeout(200)
  r.preview = (await p.locator('.sleep-preview').innerText()).replace(/\s+/g, ' ')
  await p.locator('.sleep-preview').locator('..').screenshot({ path: H.OUT + '/sleep-form.png' })
  await p.getByRole('button', { name: 'Log Sleep' }).click(); await p.waitForTimeout(1200)
  r.saved1 = (await pd('sleep'))[0]
  await times.nth(0).fill('23:00'); await times.nth(1).fill('06:30'); await p.getByRole('button', { name: 'Log Sleep' }).click(); await p.waitForTimeout(1200)
  const all = await pd('sleep'); r.todayEntries = all.filter((e) => e.date === '2026-11-13').length; r.saved2 = all[0]
  r.listAfter = await rows()
  // Recovery
  await p.goto(APP + '/wellness?tab=recovery'); await p.waitForTimeout(1500)
  const hrs = p.locator('input[type=number]').first()
  r.prefill = await hrs.inputValue()
  await hrs.fill('19'); await p.waitForTimeout(150)
  r.err = await p.locator('.field-error').count()
  r.btn = (await p.locator('.wl-form .primary-btn').innerText()).trim(); r.btnDisabled = await p.locator('.wl-form .primary-btn').isDisabled()
  await hrs.fill('7.5'); r.err2 = await p.locator('.field-error').count()
  // Growth breakdown
  await p.goto(APP + '/growth'); await p.waitForTimeout(1800)
  await p.getByRole('button', { name: 'How scores work' }).click(); await p.waitForTimeout(300)
  r.health = (await p.locator('.score-explain-area').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ')).filter((t) => /Health/.test(t))
  r.errors = errs
  H.report(r); await b.close()
})().catch((e) => { console.error(e); process.exit(1) })
