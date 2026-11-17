// Ported from the session test scripts on 2026-11-16 (calc-test.cjs). Run with: npm test -- calculator
const H = require('../harness.cjs')
const { chromium, devices } = H
const APP = 'http://localhost:4830', DB = 'http://localhost:4831'
const UID = '11111111-2222-3333-4444-555555555555'
const session = { access_token: 'x.' + Buffer.from(JSON.stringify({ sub: UID, exp: 4102444800 })).toString('base64') + '.y', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, refresh_token: 'r', user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 't@e.com' } }
;(async () => {
  await fetch(DB + '/__reset'); await fetch(DB + '/__set?tier=free')
  const b = await chromium.launch(); const r = {}
  const ctx = await b.newContext({ ...devices['iPhone 14'] })
  await ctx.clock.install({ time: new Date('2026-11-16T12:00:00-06:00') }) // fixed day so results don't change with the calendar
  await ctx.route(/fonts\./, (x) => x.fulfill({ body: '' }))
  await ctx.addInitScript((s) => { localStorage.setItem('sb-localhost-auth-token', s); localStorage.setItem('planner_a2hs_seen', '1') }, JSON.stringify(session))
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message))
  await p.goto(APP + '/calculator'); await p.waitForTimeout(2000)
  const key = (k) => p.locator('.calc-keys').getByRole('button', { name: { '÷': 'Divide', '×': 'Multiply', '−': 'Subtract', '+': 'Add', '=': 'Equals', '%': 'Percent', 'AC': 'Clear', '⌫': 'Delete', '±': 'Plus or minus', '.': 'Decimal point' }[k] || k, exact: true }).click()
  const result = async () => (await p.locator('.calc-result').textContent()).trim()
  const run = async (keys) => { await key('AC'); await key('AC'); for (const k of keys) await key(k); return result() }
  r.multiply = await run(['7', '×', '8', '='])
  r.floating = await run(['.', '1', '+', '.', '2', '='])
  r.addPercent = await run(['2', '0', '0', '+', '1', '0', '%', '='])
  r.timesPercent = await run(['5', '0', '×', '1', '0', '%', '='])
  r.minusPercent = await run(['1', '0', '0', '−', '2', '5', '%', '='])
  r.precedence = await run(['2', '+', '3', '×', '4', '='])
  r.divZero = await run(['9', '÷', '0', '='])
  r.big = await run(['1', '2', '3', '4', '5', '6', '7', '×', '3', '='])
  for (const k of ['+', '4', '=']) await key(k); r.continueFromResult = await result()
  r.signFlip = await run(['5', '±', '×', '3', '='])
  await key('AC'); await key('AC'); for (const k of ['1', '2', '3', '⌫']) await key(k); r.backspaceExpr = (await p.locator('.calc-expr').textContent()).trim()
  await key('AC'); await key('AC'); await p.keyboard.type('12*3'); await p.keyboard.press('Enter'); r.keyboard = await result()
  r.livePreview = await (async () => { await key('AC'); await key('AC'); for (const k of ['9', '+', '1']) await key(k); return result() })()
  r.tapeCount = await p.locator('.calc-tape-list li').count()
  await p.locator('.calc-tape-list button').first().click(); await p.waitForTimeout(100); r.tapeReuse = (await p.locator('.calc-expr').textContent()).trim()
  await p.screenshot({ path: H.OUT + '/calc-iphone.png', fullPage: true })
  await key('='); await p.getByRole('button', { name: 'Add as expense' }).click(); await p.waitForTimeout(400)
  r.expenseModal = { title: await p.locator('.modal-sheet h2').textContent(), amount: await p.locator('.modal-sheet input[type="number"]').inputValue() }
  await p.locator('.modal-sheet').getByRole('button', { name: '✕' }).first().click()
  await p.goto(APP + '/finance'); await p.waitForTimeout(1500)
  await p.getByRole('link', { name: 'Open the calculator' }).click(); await p.waitForTimeout(500); r.financeLink = new URL(p.url()).pathname
  r.errors = errs
  const ctx2 = await b.newContext({ viewport: { width: 1180, height: 820 } }); await ctx2.route(/fonts\./, (x) => x.fulfill({ body: '' }))
  await ctx2.clock.install({ time: new Date('2026-11-16T12:00:00-06:00') }) // fixed day so results don't change with the calendar
  await ctx2.addInitScript((s) => { localStorage.setItem('sb-localhost-auth-token', s); localStorage.setItem('planner_a2hs_seen', '1'); localStorage.setItem('planner_calc_tape', JSON.stringify([{ expr: '200+10%', result: 220, at: 2 }, { expr: '7×8', result: 56, at: 1 }])) }, JSON.stringify(session))
  const p2 = await ctx2.newPage(); await p2.goto(APP + '/calculator'); await p2.waitForTimeout(2000)
  r.menuHasCalculator = (await p2.getByRole('link', { name: 'Calculator' }).count()) > 0
  await p2.screenshot({ path: H.OUT + '/calc-ipad.png' })
  H.report(r); await b.close(); process.exit(0)
})().catch((e) => { console.error(e); process.exit(1) })
