// Ported from the session test scripts on 2026-11-16 (sync-test.cjs). Run with: npm test -- sync
// Cross-device sync for page_data tabs: another device's save shows up (live message or after the app was asleep),
// our own late echo never reverts newer local work, and every page applies its keys.
const H = require('../harness.cjs')
const { chromium, devices } = H
const APP = 'http://localhost:4830', DB = 'http://localhost:4831', UID = '11111111-2222-3333-4444-555555555555'
const session = { access_token: 'x.' + Buffer.from(JSON.stringify({ sub: UID, exp: 4102444800 })).toString('base64') + '.y', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, refresh_token: 'r', user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 't@e.com' } }
const post = (t, b) => fetch(DB + '/rest/v1/' + t, { method: 'POST', body: JSON.stringify(b) })
const st = () => fetch(DB + '/__state').then((r) => r.json())
const results = []
const check = (name, ok, extra = '') => results.push((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : ''))
const map = (ideas) => [{ id: 'm1', title: 'Plan A', createdAt: 1, updatedAt: 1, nodes: [{ id: 'r', parent: null, text: 'Plan A' }, ...ideas.map((t, i) => ({ id: 'n' + i, parent: 'r', text: t, side: 'r', color: '#1F6D63' }))] }]
;(async () => {
  await fetch(DB + '/__reset'); await fetch(DB + '/__set?tier=pro')
  // Clock in the page: Fri 2026-11-13 12:00 CST = 18:00Z
  await post('page_data', [
    { user_id: UID, page: 'productivity', data_key: 'mindMaps', data_value: map(['First idea']), updated_at: '2026-11-13T17:00:00.000Z' },
    { user_id: UID, page: 'finance', data_key: 'debts', data_value: [{ id: 1, name: 'Old Card', type: 'card', balance: 100, limit: 1000, rate: 20, minPayment: 25 }], updated_at: '2026-11-13T17:00:00.000Z' },
  ])
  await post('faith_data', [{ user_id: UID, data_key: 'prayers', data_value: [{ id: 1, text: 'For my family', type: 'Request', answered: false, date: '2026-11-12' }], updated_at: '2026-11-13T17:00:00.000Z' }])
  const b = await chromium.launch()
  const ctx = await b.newContext({ ...devices['iPhone 14'], timezoneId: 'America/Chicago' })
  await ctx.route(/fonts\./, (x) => x.fulfill({ body: '' }))
  await ctx.addInitScript((s) => { if (sessionStorage.getItem('i')) return; sessionStorage.setItem('i', '1'); localStorage.setItem('sb-localhost-auth-token', s); localStorage.setItem('planner_a2hs_seen', '1'); localStorage.setItem('planner_onboarded', '1') }, JSON.stringify(session))
  const p = await ctx.newPage(); const errs = []
  p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept())
  await p.clock.install({ time: new Date('2026-11-13T12:00:00-06:00') })
  // Helpers: pretend the phone slept and woke; deliver a live message as the channel would
  const sleepWake = async () => {
    await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')) })
    await p.clock.runFor(60000)
    await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')) })
    await p.waitForTimeout(700)
  }
  const live = (row) => p.evaluate((r) => window.dispatchEvent(new CustomEvent('planner-page-data-remote', { detail: r })), row)
  const nowIso = (plus = 0) => p.evaluate((ms) => new Date(Date.now() + ms).toISOString(), plus)

  // ── Mind map: other device adds an idea while this phone sleeps ──
  await p.goto(APP + '/productivity?tab=mindmap'); await p.waitForTimeout(1400)
  check('Map opens with the saved idea', (await p.locator('.mm-node[aria-label^="First idea"]').count()) === 1)
  await post('page_data', [{ user_id: UID, page: 'productivity', data_key: 'mindMaps', data_value: map(['First idea', 'From the iPad']), updated_at: await nowIso(30000) }])
  await sleepWake()
  check('After waking, the iPad\'s idea is here', (await p.locator('.mm-node[aria-label^="From the iPad"]').count()) === 1)

  // ── Live message from the other device ──
  await live({ page: 'productivity', data_key: 'mindMaps', data_value: map(['First idea', 'From the iPad', 'Live from iPad']), updated_at: await nowIso(5000) })
  await p.waitForTimeout(400)
  check('Live save from another device appears', (await p.locator('.mm-node[aria-label^="Live from iPad"]').count()) === 1)

  // ── Our own late echo can't undo newer local work ──
  await p.locator('.mm-node[aria-label^="Plan A"]').focus(); await p.keyboard.press('Enter')
  await p.locator('#mm-add').fill('Typed on this phone'); await p.locator('#mm-add').press('Enter'); await p.waitForTimeout(400)
  await live({ page: 'productivity', data_key: 'mindMaps', data_value: map(['First idea']), updated_at: await nowIso(-1000) })
  await p.waitForTimeout(300)
  check('Older copy arriving late is ignored', (await p.locator('.mm-node[aria-label^="Typed on this phone"]').count()) === 1 && (await p.locator('.mm-node[aria-label^="From the iPad"]').count()) === 1)
  let s = await st()
  const savedMap = s.pageData.find((r) => r.data_key === 'mindMaps').data_value[0].nodes.map((n) => n.text)
  check('Saved map keeps every device\'s ideas', ['From the iPad', 'Live from iPad', 'Typed on this phone'].every((t) => savedMap.includes(t)), savedMap.join(', '))

  // ── Finance: a key that never synced live before (sinking funds / donations use the same path) ──
  await p.goto(APP + '/finance?tab=debt'); await p.waitForTimeout(1300)
  await live({ page: 'finance', data_key: 'debts', data_value: [{ id: 1, name: 'Old Card', type: 'card', balance: 100, limit: 1000, rate: 20, minPayment: 25 }, { id: 2, name: 'Car Loan', type: 'loan', balance: 9000, rate: 6, minPayment: 250 }], updated_at: await nowIso(2000) })
  await p.waitForTimeout(400)
  check('Finance: debt added on another device appears', /Car Loan/.test(await p.locator('.debt-card').innerText()))
  await live({ page: 'finance', data_key: 'donations', data_value: [{ id: 9, org: 'Northwood', amount: 50, date: '2026-11-13' }], updated_at: await nowIso(2000) })
  await p.waitForTimeout(200)
  check('Finance: donations now sync live too', /Northwood/.test(await p.evaluate(() => localStorage.getItem('planner.f.donations') || '')))

  // ── Wellness, Lifestyle, Goals, Growth apply their keys ──
  await p.goto(APP + '/wellness'); await p.waitForTimeout(1000)
  await live({ page: 'wellness', data_key: 'meds', data_value: [{ id: 5, name: 'Vitamin D', dose: '2000 IU' }], updated_at: await nowIso(2000) })
  await p.waitForTimeout(200)
  check('Wellness applies another device\'s save', /Vitamin D/.test(await p.evaluate(() => Object.keys(localStorage).filter((k) => /meds$/.test(k)).map((k) => localStorage.getItem(k)).join('|'))))
  await p.goto(APP + '/lifestyle?tab=groceries'); await p.waitForTimeout(1000)
  await live({ page: 'lifestyle', data_key: 'groceries', data_value: [{ label: 'Oat milk', done: false }], updated_at: await nowIso(2000) })
  await p.waitForTimeout(300)
  check('Lifestyle groceries update live', /Oat milk/.test(await p.locator('main').innerText()))
  await p.goto(APP + '/goals'); await p.waitForTimeout(1000)
  await live({ page: 'goals', data_key: 'visionItems', data_value: [{ id: 3, text: 'Finish the half marathon', frame: '1y' }], updated_at: await nowIso(2000) })
  await p.waitForTimeout(200)
  check('Goals vision board updates live', /half marathon/.test(await p.evaluate(() => localStorage.getItem('planner.g.visionItems') || '')))

  // ── Faith (its own table): re-read after waking ──
  await p.goto(APP + '/faith?tab=prayer'); await p.waitForTimeout(1300)
  check('Faith prayers open', /For my family/.test(await p.locator('main').innerText()))
  await post('faith_data', [{ user_id: UID, data_key: 'prayers', data_value: [{ id: 2, text: 'Wisdom for the week', type: 'Request', answered: false, date: '2026-11-13' }, { id: 1, text: 'For my family', type: 'Request', answered: false, date: '2026-11-12' }], updated_at: await nowIso(30000) }])
  await sleepWake()
  check('Faith: prayer added on another device shows after waking', /Wisdom for the week/.test(await p.locator('main').innerText()))

  check('No page errors', errs.length === 0, errs.join(' | '))
  await b.close()
  H.report({ failed: results.filter((x) => x.startsWith('FAIL')), checks: results.length })
})()
