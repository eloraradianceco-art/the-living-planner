// Ported from the session test scripts on 2026-11-16 (month-test.cjs). Run with: npm test -- calendar-month
// Month view (bigger days, titles on iPad, the chosen day listed below) + locations on tasks and events.
// Needs: STRICT=1 node server.cjs dist 4830 4831
const H = require('../harness.cjs')
const { chromium, devices } = H
const path = require('path')
const APP = 'http://localhost:4830', DB = 'http://localhost:4831'
const UID = '11111111-2222-3333-4444-555555555555'
const OUT = H.OUT
const session = {
  access_token: 'x.' + Buffer.from(JSON.stringify({ sub: UID, exp: 4102444800 })).toString('base64') + '.y',
  token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, refresh_token: 'r',
  user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 'tester@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
}
const state = async () => (await fetch(DB + '/__state')).json()
const post = (t, rows) => fetch(`${DB}/rest/v1/${t}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rows) })
const pad = (n) => String(n).padStart(2, '0')
const now = new Date('2026-11-16T12:00:00'), Y = now.getFullYear(), M = now.getMonth() + 1
const day = (d) => `${Y}-${pad(M)}-${pad(d)}`
const TODAY = day(now.getDate())
const nextMonth1 = M === 12 ? `${Y + 1}-01-01` : `${Y}-${pad(M + 1)}-01`
const results = []
const check = (k, ok, x = '') => results.push((ok ? 'PASS ' : 'FAIL ') + k + (x !== '' ? ' — ' + (typeof x === 'string' ? x : JSON.stringify(x)) : ''))

async function seed() {
  await fetch(DB + '/__reset'); await fetch(DB + '/__set?tier=pro')
  await post('events', [
    { id: 'ev-dentist', user_id: UID, title: 'Dentist cleaning', date: TODAY, time: '14:00', end_time: '15:00', location: 'Main Street Dental, Tulsa', category: 'Health', recurrence: 'none' },
    { id: 'ev-small', user_id: UID, title: 'Coffee with Marcus', date: day(18), time: '08:30', end_time: '09:00', location: 'Topeca Coffee', category: 'Personal', recurrence: 'none' },
    { id: 'ev-weekly', user_id: UID, title: 'Small group', date: day(3), time: '18:30', end_time: '20:00', location: 'First Church', category: 'Faith', recurrence: 'weekly' },
    { id: 'ev-a', user_id: UID, title: 'Client session — Jordan', date: day(20), time: '07:00', end_time: '08:00', location: '', category: 'Business', recurrence: 'none' },
    { id: 'ev-b', user_id: UID, title: 'Client session — Kim', date: day(20), time: '09:00', end_time: '10:00', category: 'Business', recurrence: 'none' },
  ])
  await post('tasks', [
    { id: 'tk-costco', user_id: UID, title: 'Pick up meal prep order', date: day(18), time: '10:00', location: 'Costco', completed: false, priority: 'Medium', category: 'Health', recurrence: 'none' },
    { id: 'tk-c', user_id: UID, title: 'Invoice clients', date: day(20), time: '', completed: false, priority: 'High', category: 'Business', recurrence: 'none' },
    { id: 'tk-d', user_id: UID, title: 'Gym — legs', date: day(20), time: '17:00', completed: true, priority: 'Medium', category: 'Health', recurrence: 'none' },
    { id: 'tk-next', user_id: UID, title: 'Rent due', date: nextMonth1, time: '', completed: false, priority: 'High', category: 'Finance', recurrence: 'none' },
  ])
}

;(async () => {
  const browser = await chromium.launch()
  for (const [label, dev] of [['phone', devices['iPhone 14']], ['ipad-land', devices['iPad Pro 11 landscape']], ['ipad-port', devices['iPad Pro 11']]]) {
    await seed()
    const ctx = await browser.newContext({ ...dev })
    await ctx.clock.install({ time: new Date('2026-11-16T12:00:00-06:00') }) // fixed day so results don't change with the calendar
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (x) => x.fulfill({ body: '' }))
    await ctx.addInitScript((s) => { try { localStorage.setItem('sb-localhost-auth-token', s); localStorage.setItem('planner_a2hs_seen', '1') } catch {} }, JSON.stringify(session))
    const p = await ctx.newPage()
    const errors = []; p.on('pageerror', (e) => errors.push(e.message))
    const noSide = () => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
    await p.goto(APP + '/calendar'); await p.waitForTimeout(2500)

    // Day view: today's event shows its place
    const dentist = p.locator('.time-card', { hasText: 'Dentist cleaning' })
    check(`${label} day block shows location`, /Main Street Dental/.test(await dentist.innerText().catch(() => '')))

    await p.getByRole('button', { name: 'month', exact: true }).click(); await p.waitForTimeout(500)
    check(`${label} month: no sideways scroll`, await noSide())
    const cells = p.locator('.month-cell')
    check(`${label} month: whole weeks`, (await cells.count()) % 7 === 0 && (await cells.count()) >= 28, await cells.count())
    const widths = await cells.evaluateAll((els) => [...new Set(els.map((e) => Math.round(e.getBoundingClientRect().width)))])
    const h = await cells.first().evaluate((e) => Math.round(e.getBoundingClientRect().height))
    check(`${label} month: equal columns`, Math.max(...widths) - Math.min(...widths) <= 1, widths)
    const chipsShown = await p.locator('.month-chip').first().isVisible().catch(() => false)
    const dotsShown = await p.locator('.month-dot').first().isVisible().catch(() => false)
    if (label === 'phone') {
      check(`${label} month: dots (not titles) on a phone`, dotsShown && !chipsShown)
      check(`${label} month: taller days`, h >= 54, h)
    } else {
      check(`${label} month: titles on iPad`, chipsShown && !dotsShown)
      check(`${label} month: tall days`, h >= 96, h)
      const c20 = p.locator('.month-cell', { has: p.locator('.month-cell-num', { hasText: /^20$/ }) }).first()
      check(`${label} month: busy day (4) → 2 titles + "+2 more"`, (await c20.locator('.month-chip').count()) === 2 && /\+2 more/.test(await c20.innerText()), await c20.innerText())
    }
    check(`${label} month: next month's days filled in`, (await p.locator('.month-cell.other-month').count()) > 0)
    check(`${label} month: today marked`, (await p.locator('.month-cell.today[aria-current="date"]').count()) === 1)
    await p.screenshot({ path: path.join(OUT, `month-${label}.png`), fullPage: true })

    // Tap the 18th → listed under the grid with times and places
    const c18 = p.locator('.month-cell', { has: p.locator('.month-cell-num', { hasText: /^18$/ }) }).first()
    await c18.click(); await p.waitForTimeout(500)
    const agenda = p.locator('.month-agenda')
    const at = await agenda.innerText()
    check(`${label} tap a day → listed below`, /Coffee with Marcus/.test(at) && /Pick up meal prep order/.test(at), at.replace(/\n/g, ' | '))
    check(`${label} still on month view after one tap`, (await p.locator('.month-grid').count()) === 1)
    const link = agenda.getByRole('link', { name: /Costco, open in Maps/ })
    check(`${label} place opens Maps`, (await link.getAttribute('href')) === 'https://maps.apple.com/?q=Costco')
    await p.waitForTimeout(600); check(`${label} agenda's first row visible above the tab bar`, await agenda.evaluate((e) => { const r = e.querySelector('.agenda-row'); return r && r.getBoundingClientRect().bottom < window.innerHeight - 70 }))
    await p.screenshot({ path: path.join(OUT, `month-${label}-picked.png`) })
    // Tapping a row opens it in the editor; location field filled
    await agenda.locator('.agenda-row-main', { hasText: 'Pick up meal prep order' }).click(); await p.waitForTimeout(400)
    const locInput = p.locator('.modal-sheet label', { hasText: 'Location' }).locator('input')
    check(`${label} task editor shows Location`, (await locInput.inputValue()) === 'Costco')
    check(`${label} editor: Open in Maps link`, (await p.locator('.modal-sheet .field-place').getAttribute('href')) === 'https://maps.apple.com/?q=Costco')
    const opts = await p.locator('#planner-places option').evaluateAll((els) => els.map((e) => e.value))
    check(`${label} editor suggests places used before`, opts.includes('Main Street Dental, Tulsa') && opts.includes('Costco') && opts.includes('First Church'), opts)
    await locInput.fill('Costco Wholesale, 71st St'); await p.getByRole('button', { name: 'Save Changes' }).click(); await p.waitForTimeout(800)
    const w = (await state()).writes.filter((x) => x.table === 'tasks').at(-1)
    check(`${label} task location saved`, [].concat(w?.body)[0]?.location === 'Costco Wholesale, 71st St', w)

    // Tap the chosen day again → day view, with the place on the block
    await c18.click(); await p.waitForTimeout(500)
    check(`${label} second tap → day view`, (await p.locator('.timeline-grid').count()) === 1)
    check(`${label} day view: 30-min block shows place inline`, /Topeca Coffee/.test(await p.locator('.time-card', { hasText: 'Coffee with Marcus' }).innerText()))

    // New task from a time slot with a location
    await p.getByRole('button', { name: 'Add at 1:00 PM' }).click(); await p.waitForTimeout(400)
    await p.locator('.modal-sheet label', { hasText: 'Title' }).locator('input').fill('Massage client — Dana')
    await p.locator('.modal-sheet label', { hasText: 'Location' }).locator('input').fill('  True Balance Therapy  ')
    await p.getByRole('button', { name: 'Save Task' }).click(); await p.waitForTimeout(800)
    const ins = (await state()).writes.filter((x) => x.table === 'tasks' && x.method === 'POST').at(-1)
    check(`${label} new task saves trimmed location`, [].concat(ins?.body)[0]?.location === 'True Balance Therapy', ins?.body)
    check(`${label} new block shows place`, /True Balance Therapy/.test(await p.locator('.time-card', { hasText: 'Massage client' }).innerText()))

    // Clearing a location stores null (not an empty string)
    await p.locator('.time-card', { hasText: 'Massage client' }).locator('.time-card-main').click(); await p.waitForTimeout(400)
    await p.locator('.modal-sheet label', { hasText: 'Location' }).locator('input').fill('')
    check(`${label} no Maps link when empty`, (await p.locator('.modal-sheet .field-place').count()) === 0)
    await p.getByRole('button', { name: 'Save Changes' }).click(); await p.waitForTimeout(800)
    const cl = (await state()).writes.filter((x) => x.table === 'tasks').at(-1)
    check(`${label} cleared location → null`, [].concat(cl?.body)[0]?.location === null, cl?.body)

    // Week view shows places
    await p.getByRole('button', { name: 'week', exact: true }).click(); await p.waitForTimeout(400)
    check(`${label} week view shows place`, /Topeca Coffee/.test(await p.locator('.week-grid').innerText()))
    check(`${label} week: no sideways scroll`, await noSide())

    // Event editor still has its location field
    await p.getByRole('button', { name: '+ Event' }).click(); await p.waitForTimeout(400)
    check(`${label} event editor has Location`, (await p.locator('.modal-sheet label', { hasText: 'Location' }).count()) === 1)
    await p.keyboard.press('Escape'); await p.locator('.modal-backdrop').click({ position: { x: 5, y: 5 } }).catch(() => {})

    // Home timeline shows the place for today's event
    await p.goto(APP + '/'); await p.waitForTimeout(1800); await H.openFolds(p); await p.waitForTimeout(300) /* Home blocks are rows since 2026-11-19 */
    check(`${label} home timeline shows place`, /Main Street Dental/.test(await p.locator('body').innerText()))

    // ── Holidays (2026-11-21). The fixed month is November 2026: Veterans Day the 11th, Thanksgiving the 26th. ──
    await p.goto(APP + '/calendar'); await p.waitForTimeout(1500)
    await p.getByRole('button', { name: 'month', exact: true }).click(); await p.waitForTimeout(500)
    const cell = (d) => p.locator(`.month-cell[aria-label*="November ${d}"]`).first()
    check(`${label} holidays: Thanksgiving marked on the 26th`, /Thanksgiving/.test(await cell(26).getAttribute('aria-label')) && (await cell(26).locator('.month-holiday').count()) === 1, await cell(26).getAttribute('aria-label'))
    check(`${label} holidays: Veterans Day marked on the 11th`, /Veterans Day/.test(await cell(11).getAttribute('aria-label')))
    check(`${label} holidays: an ordinary day has no marker`, (await cell(17).locator('.month-holiday').count()) === 0)
    check(`${label} holidays: two this month`, (await p.locator('.month-cell:not(.other-month) .month-holiday').count()) === 2, await p.locator('.month-cell:not(.other-month) .month-holiday').count())
    if (process.env.SHOT) await p.screenshot({ path: `${process.env.SHOT}/month-${label.replace(/\W+/g, '')}.png` })
    await cell(26).click(); await p.waitForTimeout(400)
    check(`${label} holidays: the day's list names it`, /Thanksgiving/.test(await p.locator('.month-agenda').innerText()))
    check(`${label} holidays: it is not an item (nothing to open, drag or delete)`, (await p.locator('.month-agenda .agenda-row').count()) === 0 && /Nothing planned/.test(await p.locator('.month-agenda').innerText()))
    await cell(26).click(); await p.waitForTimeout(600) // second tap opens the day
    check(`${label} holidays: the day view shows it`, /Thanksgiving/.test(await p.locator('.cal-holiday').first().innerText().catch(() => '')))
    check(`${label} holidays: nothing runs off the side`, (await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0)
    // Settings: one group off, then all off
    await p.goto(APP + '/more#preferences'); await p.waitForTimeout(1500)
    await p.getByLabel('US federal holidays').uncheck(); await p.waitForTimeout(200)
    await p.goto(APP + '/calendar'); await p.waitForTimeout(1500); await p.getByRole('button', { name: 'month', exact: true }).click(); await p.waitForTimeout(500)
    check(`${label} holidays: federal off removes Thanksgiving and Veterans Day`, (await p.locator('.month-cell:not(.other-month) .month-holiday').count()) === 0)
    await p.getByRole('button', { name: 'Next', exact: true }).click(); await p.waitForTimeout(600)
    const dec = await p.locator('.month-cell:not(.other-month)[aria-label*="December"]').evaluateAll((els) => els.filter((e) => e.querySelector('.month-holiday')).map((e) => e.getAttribute('aria-label').replace(/\. Tap.*$/, '')))
    check(`${label} holidays: Christmas stays under Christian, with Christmas Eve and New Year's Eve`, dec.length === 3 && /December 24, Christmas Eve/.test(dec[0]) && /December 25, Christmas Day/.test(dec[1]) && /December 31, New Year's Eve/.test(dec[2]), dec)
    await p.goto(APP + '/more#preferences'); await p.waitForTimeout(1500)
    await p.getByLabel('Show holidays on the calendar').uncheck(); await p.waitForTimeout(200)
    check(`${label} holidays: turning them off hides the three groups`, (await p.getByLabel('US federal holidays').count()) === 0)
    await p.goto(APP + '/calendar'); await p.waitForTimeout(1500); await p.getByRole('button', { name: 'month', exact: true }).click(); await p.waitForTimeout(500)
    check(`${label} holidays: off means none`, (await p.locator('.month-holiday, .cal-holiday').count()) === 0)

    const st = await state()
    check(`${label} no schema errors`, !(st.schemaErrors || []).length, (st.schemaErrors || []).slice(0, 2))
    check(`${label} no page errors`, errors.length === 0, errors.slice(0, 3))
    await ctx.close()
  }
  await browser.close()
  H.report({ failed: results.filter((x) => x.startsWith('FAIL')), checks: results.length })
})()
