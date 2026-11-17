// Ported from the session test scripts on 2026-11-16 (finance-test.cjs). Run with: npm test -- finance
// Finance: daily/weekly/monthly budget, editing expenses, credit cards with limit / available / utilization.
const H = require('../harness.cjs')
const { chromium, devices } = H
const fs = require('fs')
const APP = 'http://localhost:4830', DB = 'http://localhost:4831', UID = '11111111-2222-3333-4444-555555555555'
const OUT = H.OUT; fs.mkdirSync(OUT, { recursive: true })
const session = { access_token: 'x.' + Buffer.from(JSON.stringify({ sub: UID, exp: 4102444800 })).toString('base64') + '.y', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, refresh_token: 'r', user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 't@e.com' } }
const post = (t, b) => fetch(DB + '/rest/v1/' + t, { method: 'POST', body: JSON.stringify(b) })
const st = () => fetch(DB + '/__state').then((r) => r.json())
const results = []
const check = (name, ok, extra = '') => { results.push((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : '')) }
const near = (a, b) => Math.abs(a - b) < 0.02
;(async () => {
  const tier = process.argv[2] || 'free'
  const dev = process.argv[3] || 'iPhone 14'
  await fetch(DB + '/__reset'); await fetch(DB + '/__set?tier=' + tier)
  // Today is Fri 2026-11-13; week is Sun 11-08 … Sat 11-14
  await post('expenses', [
    { id: 'e1', description: 'Coffee', amount: 12, category: 'Food', date: '2026-11-13', period: 'one-time', user_id: UID },
    { id: 'e2', description: 'Groceries', amount: 40, category: 'Food', date: '2026-11-10', period: 'one-time', user_id: UID },
    { id: 'e3', description: 'Shoes', amount: 100, category: 'Shopping', date: '2026-11-02', period: 'one-time', user_id: UID },
    { id: 'e4', description: 'October dinner', amount: 50, category: 'Food', date: '2026-10-28', period: 'one-time', user_id: UID },
    { id: 'e5', description: 'Gym', amount: 20, category: 'Health', date: '2026-10-01', period: 'weekly', user_id: UID },
  ])
  await post('page_data', [{ user_id: UID, page: 'finance', data_key: 'debts', data_value: [{ id: 1, name: 'Capital One', balance: 800, rate: 26, minPayment: 30 }] }])
  const b = await chromium.launch()
  const ctx = await b.newContext({ ...devices[dev], ...(dev === 'iPhone 14' ? { deviceScaleFactor: 2 } : {}), timezoneId: 'America/Chicago' })
  await ctx.route(/fonts\./, (x) => x.fulfill({ body: '' }))
  await ctx.addInitScript((s) => { if (sessionStorage.getItem('i')) return; sessionStorage.setItem('i', '1'); localStorage.setItem('sb-localhost-auth-token', s); localStorage.setItem('planner_a2hs_seen', '1'); localStorage.setItem('planner_onboarded', '1') }, JSON.stringify(session))
  const p = await ctx.newPage(); const errs = []
  p.on('pageerror', (e) => errs.push(e.message))
  p.on('dialog', (d) => d.accept())
  await p.clock.install({ time: new Date('2026-11-13T12:00:00-06:00') })
  const tag = `${tier}-${dev.replace(/\s+/g, '')}`
  const card = () => p.locator('.budget-card')
  const money = (t) => Number(String(t).replace(/[^0-9.\-]/g, ''))
  const spentLine = async () => (await card().locator('.budget-progress strong').first().innerText())

  // ── Budget: weekly by default ─────────────────────────────────
  await p.goto(APP + '/finance?tab=budget'); await p.waitForTimeout(1500)
  check('Budget card shows Weekly Budget', /Weekly Budget/.test(await card().locator('h3').innerText()))
  // week: coffee 12 + groceries 40 + gym 20 = 72
  let s = await spentLine(); check('Weekly spent = $72 of $200', /\$72\.00 \/ \$200\.00/.test(s), s)
  check('Weekly shows days to go', /left · 2 days to go/.test(await card().locator('.budget-left').innerText()), await card().locator('.budget-left').innerText())
  check('Equivalents shown', /\/day/.test(await card().locator('.budget-equiv').innerText()) && /\/month/.test(await card().locator('.budget-equiv').innerText()))

  // ── Switch to Daily: converts $200/wk → $29/day ──────────────
  await card().getByRole('radio', { name: 'Daily' }).click(); await p.waitForTimeout(600)
  let state = await st()
  check('Daily saved as $29/day', state.budget?.period === 'daily' && Number(state.budget?.amount) === 29 && near(Number(state.budget?.weekly_target), 203), JSON.stringify(state.budget))
  check('Input shows 29', (await card().locator('input[type=number]').inputValue()) === '29')
  s = await spentLine(); check('Daily spent = coffee 12 + gym 20/7', /\$14\.86 \/ \$29\.00/.test(s), s)
  const counted = await card().locator('.budget-counted').innerText()
  check('Counted today lists Coffee + Gym share, not Groceries', /Coffee/.test(counted) && /Gym/.test(counted) && /counts \$2\.86/.test(counted) && !/Groceries/.test(counted), counted.replace(/\s+/g, ' ').slice(0, 160))
  await p.screenshot({ path: `${OUT}/${tag}-daily.png`, fullPage: true })

  // ── Edit an expense from the Budget card ─────────────────────
  await card().getByRole('button', { name: /^Edit Coffee/ }).click(); await p.waitForTimeout(300)
  const ed = card().locator('.expense-editor')
  check('Editor opens with values', (await ed.getByLabel('Amount').inputValue()) === '12' && (await ed.getByLabel('Description').inputValue()) === 'Coffee')
  await p.screenshot({ path: `${OUT}/${tag}-edit.png` })
  await ed.getByLabel('Description').fill('Coffee beans'); await ed.getByLabel('Amount').fill('15')
  await ed.getByRole('button', { name: 'Save', exact: true }).click(); await p.waitForTimeout(700)
  state = await st()
  const patch = (state.writes || []).filter((w) => w.table === 'expenses' && w.method === 'PATCH').pop()
  check('Edit saved (PATCH amount 15, description)', patch && Number(patch.body.amount) === 15 && patch.body.description === 'Coffee beans', JSON.stringify(patch?.body || {}))
  check('Editor closed, list updated', (await card().locator('.expense-editor').count()) === 0 && /Coffee beans/.test(await card().locator('.budget-counted').innerText()))
  s = await spentLine(); check('Daily spent updates to $17.86', /\$17\.86/.test(s), s)

  // ── Monthly: converts and counts the month ───────────────────
  await card().getByRole('radio', { name: 'Monthly' }).click(); await p.waitForTimeout(600)
  state = await st()
  check('Monthly converted from $29/day', state.budget?.period === 'monthly' && Number(state.budget?.amount) === 879, JSON.stringify(state.budget))
  await card().locator('input[type=number]').fill('500'); await card().locator('input[type=number]').press('Enter'); await p.waitForTimeout(600)
  state = await st()
  check('Typed $500/month saved', Number(state.budget?.amount) === 500 && near(Number(state.budget?.weekly_target), 115.47), JSON.stringify(state.budget))
  // Nov one-time: 15 + 40 + 100 = 155; gym 20 × 4.33 = 86.60 → 241.60
  s = await spentLine(); check('Monthly spent = $241.60 of $500', /\$241\.60 \/ \$500\.00/.test(s), s)
  check('Monthly shows per-day pace', /18 days to go/.test(await card().locator('.budget-left').innerText()), await card().locator('.budget-left').innerText())
  check('Repeating share note', /Includes \$86\.60/.test(await card().innerText()))
  await p.screenshot({ path: `${OUT}/${tag}-monthly.png`, fullPage: true })

  // ── Home tile follows the period ─────────────────────────────
  await p.goto(APP + '/'); await p.waitForTimeout(1300)
  const tile = await p.locator('.home-metrics-strip').innerText().catch(() => '')
  check('Home Budget Left = $258 this month', /\$258/.test(tile) && /this month/i.test(tile), tile.replace(/\s+/g, ' '))

  // ── Persisted across reload ──────────────────────────────────
  await p.goto(APP + '/finance?tab=budget'); await p.waitForTimeout(1500)
  check('Reload keeps Monthly $500', /Monthly Budget/.test(await card().locator('h3').innerText()) && (await card().locator('input[type=number]').inputValue()) === '500')

  // ── Delete from the editor ───────────────────────────────────
  await card().getByRole('button', { name: /^Edit Shoes/ }).click(); await p.waitForTimeout(300)
  await card().locator('.expense-editor').getByRole('button', { name: 'Delete' }).click(); await p.waitForTimeout(700)
  state = await st()
  check('Delete from editor removes it', !(state.tables.expenses || []).some((e) => e.id === 'e3') && !/Shoes/.test(await card().innerText()))

  if (tier === 'pro') {
    // ── Expenses tab: tap to edit, period change ───────────────
    await p.goto(APP + '/finance?tab=expenses'); await p.waitForTimeout(1300)
    await p.getByRole('button', { name: /^Edit Groceries/ }).click(); await p.waitForTimeout(300)
    const ed2 = p.locator('.expense-editor')
    await ed2.getByLabel('How often').selectOption('weekly'); await ed2.getByLabel('Category').selectOption('Home')
    await ed2.getByRole('button', { name: 'Save', exact: true }).click(); await p.waitForTimeout(700)
    state = await st()
    const g = (state.tables.expenses || []).find((e) => e.id === 'e2')
    check('Expenses tab edit: Groceries now weekly / Home', g?.period === 'weekly' && g?.category === 'Home', JSON.stringify(g))
    check('Row shows Weekly tag', /Groceries[\s\S]*Home[\s\S]*Weekly/.test(await p.locator('.expense-row', { hasText: 'Groceries' }).innerText()))
    await p.screenshot({ path: `${OUT}/${tag}-expenses.png`, fullPage: true })

    // ── Debts: legacy card, add card with limit, add loan ──────
    await p.goto(APP + '/finance?tab=debt'); await p.waitForTimeout(1300)
    const dc = p.locator('.debt-card')
    check('Legacy "Capital One" reads as a Card with add-limit prompt', /Capital One\s*Card/i.test(await dc.locator('.debt-row').first().innerText()) && (await dc.getByRole('button', { name: /Add credit limit/ }).count()) === 1)
    await dc.getByRole('radio', { name: 'Credit card' }).click()
    await dc.getByPlaceholder(/Card name/).fill('Chase Visa')
    await dc.getByPlaceholder('Balance $').fill('1500'); await dc.getByPlaceholder('Credit limit $').fill('5000')
    await dc.getByPlaceholder('Rate %').fill('24'); await dc.getByPlaceholder('Min Pmt $').fill('45')
    await dc.getByRole('button', { name: '+ Add Card' }).click(); await p.waitForTimeout(400)
    await dc.getByRole('radio', { name: 'Loan' }).click()
    check('Loan form has no credit limit', (await dc.getByPlaceholder('Credit limit $').count()) === 0)
    await dc.getByPlaceholder(/Loan name/).fill('Car Loan')
    await dc.getByPlaceholder('Balance $').fill('12000'); await dc.getByPlaceholder('Rate %').fill('6'); await dc.getByPlaceholder('Min Pmt $').fill('300')
    await dc.getByRole('button', { name: '+ Add Loan' }).click(); await p.waitForTimeout(400)
    const chase = await dc.locator('.debt-row', { hasText: 'Chase Visa' }).innerText()
    check('Chase: available $3,500, 30% used', /AVAILABLE\s*\$3,500\.00/.test(chase) && /USED\s*30%/.test(chase), chase.replace(/\s+/g, ' '))
    const sum = await dc.locator('.debt-summary').innerText()
    check('Summary: total balance $14,300, credit available $3,500, utilization 30%', /\$14,300\.00/.test(sum) && /CREDIT AVAILABLE\s*\$3,500\.00/i.test(sum) && /30%/.test(sum), sum.replace(/\s+/g, ' '))
    // Add a limit to the legacy card through Update
    await dc.getByRole('button', { name: /Add credit limit/ }).click(); await p.waitForTimeout(300)
    await dc.getByLabel('Credit limit $').fill('1000')
    await dc.getByRole('button', { name: 'Save', exact: true }).click(); await p.waitForTimeout(500)
    const cap = await dc.locator('.debt-row', { hasText: 'Capital One' }).innerText()
    check('Capital One: limit saved, 80% used, $200 available', /AVAILABLE\s*\$200\.00/.test(cap) && /USED\s*80%/.test(cap), cap.replace(/\s+/g, ' '))
    state = await st()
    const saved = (state.pageData || []).find((r) => r.data_key === 'debts')?.data_value || []
    check('Debts synced with type and limit', saved.some((d) => d.name === 'Capital One' && d.type === 'card' && String(d.limit) === '1000') && saved.some((d) => d.name === 'Car Loan' && d.type === 'loan'), JSON.stringify(saved).slice(0, 200))
    await p.screenshot({ path: `${OUT}/${tag}-debt.png`, fullPage: true })

    // ── Overview picks up budget + debt rows ───────────────────
    await p.goto(APP + '/finance?tab=overview'); await p.waitForTimeout(1200)
    const ov = await p.locator('main').innerText()
    check('Overview: Budget Left, Total Debt Balance, Credit Available', /Budget Left \(this month\)/.test(ov) && /Total Debt Balance/.test(ov) && /Credit Available/.test(ov))
  }

  check('No page errors', errs.length === 0, errs.join(' | '))
  await b.close()
  H.report({ failed: results.filter((x) => x.startsWith('FAIL')), checks: results.length })
})()
