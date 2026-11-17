// Ported from the session test scripts on 2026-11-16 (block-test.cjs). Run with: npm test -- calendar-blocks
// Day view blocks: height follows start → end, overlaps side by side, drag by position, tap/check still work.
const H = require('../harness.cjs')
const { chromium, devices } = H
const APP = 'http://localhost:4830', DB = 'http://localhost:4831'
const UID = '11111111-2222-3333-4444-555555555555'
const session = {
  access_token: 'x.' + Buffer.from(JSON.stringify({ sub: UID, exp: 4102444800 })).toString('base64') + '.y',
  token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, refresh_token: 'r',
  user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 'tester@example.com' },
}
const state = async () => (await fetch(DB + '/__state')).json()

;(async () => {
  await fetch(DB + '/__reset'); await fetch(DB + '/__set?tier=pro')
  const r = {}
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ ...devices['iPhone 14'] })
  await ctx.clock.install({ time: new Date('2026-11-16T12:00:00-06:00') }) // fixed day so results don't change with the calendar
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (x) => x.fulfill({ body: '' }))
  await ctx.addInitScript((s) => { try { localStorage.setItem('sb-localhost-auth-token', s); localStorage.setItem('planner_a2hs_seen', '1') } catch {} }, JSON.stringify(session))
  const p = await ctx.newPage()
  const errors = []; p.on('pageerror', (e) => errors.push(e.message))
  const times = () => p.locator('.modal-sheet input[type="time"]')
  const title = () => p.locator('.modal-sheet label', { hasText: 'Title' }).locator('input')
  await p.goto(APP + '/calendar'); await p.waitForTimeout(2500)

  await p.getByRole('button', { name: 'Add at 6:00 AM' }).click(); await p.waitForTimeout(300)
  await title().fill('Client session'); await times().nth(1).fill('07:00')
  await p.getByRole('button', { name: 'Save Task' }).click(); await p.waitForTimeout(700)

  await p.getByRole('button', { name: '+ Event' }).click(); await p.waitForTimeout(300)
  await title().fill('Team meeting'); await times().nth(0).fill('06:30'); await times().nth(1).fill('07:30')
  await p.getByRole('button', { name: 'Save Event' }).click(); await p.waitForTimeout(700)

  await p.getByRole('button', { name: 'Add at 9:00 AM' }).click(); await p.waitForTimeout(300)
  await title().fill('Quick call')
  await p.getByRole('button', { name: 'Save Task' }).click(); await p.waitForTimeout(700)

  const row = async (label) => p.locator('.timeline-row', { has: p.locator('.timeline-hour', { hasText: new RegExp('^' + label + '$') }) }).first().boundingBox()
  const block = async (t) => p.locator('.time-block', { hasText: t }).first().boundingBox()
  const r6 = await row('6 AM'), r7 = await row('7 AM'), r730 = await row('7:30'), r9 = await row('9 AM')
  const cs = await block('Client session'), tm = await block('Team meeting'), qc = await block('Quick call')
  const near = (a, b) => Math.abs(a - b) <= 4
  r.clientSpans6to7 = near(cs.y, r6.y) && near(cs.y + cs.height, r7.y)
  r.meetingSpans630to730 = near(tm.y, r6.y + r6.height) && near(tm.y + tm.height, r730.y)
  r.overlapSideBySide = cs.x < tm.x && cs.width < 200 && near(cs.width, tm.width)
  r.noEndIsOneHalfHour = near(qc.y, r9.y) && near(qc.height, r9.height - 4)
  r.quickCallFullWidth = qc.width > cs.width * 1.8
  await p.locator('.card', { has: p.locator('.timeline-grid') }).screenshot({ path: H.OUT + '/blocks.png' })

  // Drag "Team meeting" onto 3 PM by position
  const ev = (await state()).tables.events.find((e) => e.title === 'Team meeting')
  const r3 = await row('3 PM')
  await p.evaluate(({ id, y }) => {
    const grid = document.querySelector('.timeline-grid')
    const dt = new DataTransfer(); dt.setData('application/json', JSON.stringify({ type: 'event', id, repeat: false }))
    grid.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, clientY: y }))
  }, { id: ev.id, y: r3.y + r3.height / 2 })
  await p.waitForTimeout(900)
  const w = (await state()).writes.filter((x) => x.table === 'events').at(-1)?.body
  r.dragged = { time: w?.time, end_time: w?.end_time }
  const tm2 = await block('Team meeting'), r4 = await row('4 PM')
  r.draggedBlockSpans3to4 = near(tm2.y, r3.y) && near(tm2.y + tm2.height, r4.y)
  r.clientNowFullWidth = (await block('Client session')).width > (await block('Quick call')).width - 4

  // Tap opens the editor; the check marks the task done
  await p.locator('.time-block', { hasText: 'Client session' }).locator('.time-card-main').click(); await p.waitForTimeout(400)
  r.tapOpensEditor = (await p.getByRole('heading', { name: 'Edit Task' }).count()) > 0
  await p.locator('.modal-sheet').getByRole('button', { name: '✕' }).first().click(); await p.waitForTimeout(300)
  await p.getByRole('button', { name: 'Mark Client session done' }).click(); await p.waitForTimeout(800)
  r.checkWorks = (await p.locator('.time-block.done', { hasText: 'Client session' }).count()) > 0
  r.errors = errors
  H.report(r)
  await browser.close(); process.exit(0)
})().catch((e) => { console.error(e); process.exit(1) })
