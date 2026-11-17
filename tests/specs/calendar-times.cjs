// Ported from the session test scripts on 2026-11-16 (cal-test.cjs). Run with: npm test -- calendar-times
// End times for tasks and events: create, edit, keep length, block end-before-start, clear, week view, drag, repeat.
const H = require('../harness.cjs')
const { chromium, devices } = H
const APP = 'http://localhost:4830', DB = 'http://localhost:4831'
const UID = '11111111-2222-3333-4444-555555555555'
const session = {
  access_token: 'x.' + Buffer.from(JSON.stringify({ sub: UID, exp: 4102444800 })).toString('base64') + '.y',
  token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, refresh_token: 'r',
  user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 'tester@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
}
const state = async () => (await fetch(DB + '/__state')).json()
const lastWrite = async (table, method) => (await state()).writes.filter((w) => w.table === table && (!method || w.method === method)).at(-1)?.body

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
  const meta = async (title) => (await p.locator('.time-card', { hasText: title }).locator('.time-card-meta').first().textContent().catch(() => null))

  await p.goto(APP + '/calendar'); await p.waitForTimeout(2500)

  // 1. Tap the 6:00 AM slot → task with Start 6:00 and an empty optional End
  await p.getByRole('button', { name: 'Add at 6:00 AM' }).click(); await p.waitForTimeout(400)
  r.slotStart = await times().nth(0).inputValue()
  r.slotEndEmpty = (await times().nth(1).inputValue()) === ''
  await p.locator('.modal-sheet label', { hasText: 'Title' }).locator('input').fill('Client session')
  await times().nth(1).fill('07:00')
  await p.getByRole('button', { name: 'Save Task' }).click(); await p.waitForTimeout(800)
  r.created = await meta('Client session')
  const ins = await lastWrite('tasks', 'POST'); r.savedRow = { time: ins?.time, end_time: ins?.end_time }

  // 2. Edit: move start to 6:30 → end follows to 7:30
  await p.locator('.time-card', { hasText: 'Client session' }).locator('.time-card-main').click(); await p.waitForTimeout(400)
  await times().nth(0).fill('06:30'); await p.waitForTimeout(100)
  r.endFollows = await times().nth(1).inputValue()
  await p.getByRole('button', { name: 'Save Changes' }).click(); await p.waitForTimeout(800)
  r.afterMove = await meta('Client session')

  // 3. End before start is blocked with a message
  await p.locator('.time-card', { hasText: 'Client session' }).locator('.time-card-main').click(); await p.waitForTimeout(400)
  const taskWrites = async () => (await state()).writes.filter((w) => w.table === 'tasks').length // only task saves count (the Life Score snapshot also writes)
  const patchesBefore = await taskWrites()
  await times().nth(1).fill('06:00'); await p.waitForTimeout(100)
  r.errorShown = await p.getByRole('alert').filter({ hasText: 'End time needs to be after the start time' }).count() > 0
  await p.getByRole('button', { name: 'Save Changes' }).click(); await p.waitForTimeout(500)
  r.blocked = (await p.getByRole('heading', { name: 'Edit Task' }).count()) > 0 && (await taskWrites()) === patchesBefore

  // 4. ✕ removes the end time
  await p.getByRole('button', { name: 'Remove end time' }).click(); await p.waitForTimeout(100)
  r.endCleared = (await times().nth(1).inputValue()) === ''
  await p.getByRole('button', { name: 'Save Changes' }).click(); await p.waitForTimeout(800)
  r.afterClear = await meta('Client session')
  { const w = (await state()).writes.filter((x) => x.table === 'tasks').at(-1); r.clearedRow = { method: w?.method, end_time: [].concat(w?.body)[0]?.end_time } }

  // 5. Event: defaults 9–10, moving start to 1 PM keeps one hour
  await p.getByRole('button', { name: '+ Event' }).click(); await p.waitForTimeout(400)
  r.eventDefaults = [await times().nth(0).inputValue(), await times().nth(1).inputValue()]
  await p.locator('.modal-sheet label', { hasText: 'Title' }).locator('input').fill('Team meeting')
  await times().nth(0).fill('13:00'); await p.waitForTimeout(100)
  r.eventEndFollows = await times().nth(1).inputValue()
  await p.getByRole('button', { name: 'Save Event' }).click(); await p.waitForTimeout(800)
  r.eventCard = await meta('Team meeting')

  // 6. Drag the event to 3 PM → it stays one hour long
  const ev = (await state()).tables.events.find((e) => e.title === 'Team meeting')
  await p.evaluate(({ id }) => {
    const row = [...document.querySelectorAll('.timeline-row')].find((el) => el.querySelector('.timeline-hour')?.textContent.trim() === '3 PM')
    const dt = new DataTransfer(); dt.setData('application/json', JSON.stringify({ type: 'event', id, repeat: false }))
    row.querySelector('.timeline-slot').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }))
  }, { id: ev.id })
  await p.waitForTimeout(900)
  const moved = await lastWrite('events', 'PATCH'); r.dragged = { time: moved?.time, end_time: moved?.end_time }
  r.draggedCard = await meta('Team meeting')

  // 7. Week view shows the range
  await p.getByRole('button', { name: 'week', exact: true }).click(); await p.waitForTimeout(500)
  r.weekShowsRange = await p.locator('.week-item', { hasText: 'Team meeting' }).first().textContent()

  // 8. Weekly task with an end time: finishing it creates next week's with the same end time
  await p.getByRole('button', { name: 'day', exact: true }).click(); await p.waitForTimeout(400)
  await p.getByRole('button', { name: 'Add at 8:00 AM' }).click(); await p.waitForTimeout(400)
  await p.locator('.modal-sheet label', { hasText: 'Title' }).locator('input').fill('Training block')
  await times().nth(1).fill('08:45')
  await p.locator('.modal-sheet label', { hasText: 'Repeats' }).locator('select').selectOption('weekly')
  await p.getByRole('button', { name: 'Save Task' }).click(); await p.waitForTimeout(800)
  await p.getByRole('button', { name: 'Mark Training block done' }).click(); await p.waitForTimeout(1200)
  const clone = (await state()).writes.filter((w) => w.table === 'tasks' && w.method === 'POST').at(-1)?.body
  r.nextWeek = { title: clone?.title, date: clone?.date, time: clone?.time, end_time: clone?.end_time, hasCamel: clone && 'endTime' in clone }

  // 9. Home "Today" list shows the range
  await p.goto(APP + '/'); await p.waitForTimeout(2000)
  r.homeRange = await p.locator('.timeline-preview', { hasText: 'Team meeting' }).first().textContent().catch(() => null)
  await p.screenshot({ path: H.OUT + '/home.png' })
  r.errors = errors
  H.report(r)
  await browser.close(); process.exit(0)
})().catch((e) => { console.error(e); process.exit(1) })
