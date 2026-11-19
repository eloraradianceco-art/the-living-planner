// Apple Calendar inside the App Store app (simulated iPhone with a fake Apple Calendar):
// connect, see events in Day / Month / Home, calendar colours and names, repeating and view-only events,
// edit with Apple's sheet, delete, move, save a new event to an Apple calendar, hide a calendar, turn it off,
// access denied, and the website (where none of this appears). Run: npm test -- app-store-calendar
const H = require('../harness.cjs')
const { chromium, devices, fakeIphone, APP, UID } = H

const at = (day, time) => new Date(`2026-11-${day}T${time}:00-06:00`).getTime() // Chicago, like the fixed clock
const CALENDARS = [
  { id: 'cal-home', title: 'Home', color: '#34C759', allowsContentModifications: true, isImmutable: false, isSubscribed: false, source: { title: 'iCloud' } },
  { id: 'cal-work', title: 'Work', color: '#0A84FF', allowsContentModifications: true, isImmutable: false, isSubscribed: false, source: { title: 'Gmail' } },
  { id: 'cal-hol', title: 'US Holidays', color: '#FF9F0A', allowsContentModifications: false, isImmutable: true, isSubscribed: true, source: { title: 'Subscribed' } },
]
const EVENTS = [
  { id: 'e1', title: 'Staff meeting', startDate: at(16, '09:00'), endDate: at(16, '10:00'), isAllDay: false, calendarId: 'cal-work', location: 'Conference Room B', description: 'Bring the Q4 numbers.', isPartOfSeries: false, color: '#0A84FF' },
  { id: 'e2', title: 'Small group', startDate: at(16, '18:30'), endDate: at(16, '20:00'), isAllDay: false, calendarId: 'cal-home', location: 'First Church', description: null, isPartOfSeries: true, color: '#34C759' },
  { id: 'e3', title: 'Thanksgiving', startDate: at(26, '00:00'), endDate: at(26, '23:59') + 59000, isAllDay: true, calendarId: 'cal-hol', location: null, description: null, isPartOfSeries: true, color: '#FF9F0A' },
  { id: 'e4', title: 'Conference', startDate: at(18, '00:00'), endDate: at(20, '23:59') + 59000, isAllDay: true, calendarId: 'cal-work', location: 'Convention Center', description: null, isPartOfSeries: false, color: '#0A84FF' },
  { id: 'e5', title: 'Late shift', startDate: at(17, '21:00'), endDate: at(18, '01:00'), isAllDay: false, calendarId: 'cal-home', location: null, description: null, isPartOfSeries: false, color: '#34C759' },
]
const results = []
const check = (k, ok, x) => results.push((ok ? 'PASS ' : 'FAIL ') + k + (x !== undefined && !ok ? ' — ' + (typeof x === 'string' ? x : JSON.stringify(x)) : ''))

async function open(browser, { calendar, native = true } = {}) {
  const ctx = await browser.newContext({ ...devices['iPhone 14'], timezoneId: 'America/Chicago' })
  await ctx.clock.install({ time: new Date('2026-11-16T12:00:00-06:00') })
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (x) => x.fulfill({ body: '' }))
  if (native) await ctx.addInitScript(fakeIphone, { prefs: { [H.SESSION_KEY]: JSON.stringify(H.session), planner_onboarded: '1' }, calendar })
  await ctx.addInitScript((s) => { try { localStorage.setItem('planner_a2hs_seen', '1'); localStorage.setItem('planner_onboarded', '1'); if (s) localStorage.setItem('sb-localhost-auth-token', s) } catch {} }, native ? null : JSON.stringify(H.session))
  const p = await ctx.newPage()
  const errs = []; p.on('pageerror', (e) => errs.push(e.message))
  p.on('dialog', (d) => d.accept())
  return { ctx, p, errs }
}
const calls = (p, method) => p.evaluate((m) => window.__fake.calCalls.filter((c) => c.method === m), method)
const text = async (loc) => (await loc.innerText().catch(() => '')).replace(/\s+/g, ' ').trim()

;(async () => {
  await H.db.tier('free') // Apple Calendar is part of the Free plan
  await H.db.post('tasks', [{ id: 't1', user_id: UID, title: 'Write sermon notes', date: '2026-11-16', time: '13:00', end_time: '14:00', completed: false, priority: 'Medium', category: 'Faith', recurrence: 'none' }])
  const browser = await chromium.launch()

  // ── 1. iPhone app, Apple Calendar not connected yet ──
  let { ctx, p, errs } = await open(browser, { calendar: { permission: 'prompt', calendars: CALENDARS, events: JSON.parse(JSON.stringify(EVENTS)), editPatch: { title: 'Staff meeting (moved)' } } })
  await p.goto(APP + '/calendar'); await p.waitForTimeout(2500)
  check('before connecting: offer shown on Calendar', /See your Apple Calendar here/.test(await text(p.locator('body'))))
  check('before connecting: no Apple events shown, nothing read', (await p.locator('.time-card.device').count()) === 0 && (await calls(p, 'listEventsInRange')).length === 0)

  // ── 2. Connect from the offer ──
  await p.getByRole('button', { name: 'Connect', exact: true }).click(); await p.waitForTimeout(900)
  check('connect asks iOS for full calendar access', (await calls(p, 'requestFullCalendarAccess')).length === 1)
  check('offer goes away once connected', !/See your Apple Calendar here/.test(await text(p.locator('body'))))
  const staff = p.locator('.time-card.device', { hasText: 'Staff meeting' })
  const staffText = await text(staff)
  check('day view: Apple event with time, calendar name and place', /9:00\s*–\s*10:00 AM/.test(staffText) && /Work/.test(staffText) && /Conference Room B/.test(staffText), staffText)
  check('day view: block uses the calendar colour', (await staff.evaluate((e) => getComputedStyle(e).borderLeftColor)) === 'rgb(10, 132, 255)')
  check('day view: repeating Apple event marked ↻', /↻/.test(await text(p.locator('.time-card.device', { hasText: 'Small group' }))))
  check('day view: planner task still there', (await p.locator('.time-card.task', { hasText: 'Write sermon notes' }).count()) === 1)
  check('day view: Apple events have no ✕ on the block', (await staff.locator('.time-card-del').count()) === 0)
  check('no sideways scroll', await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
  await p.screenshot({ path: H.OUT + '/day.png' }).catch(() => {})

  // ── 3. Detail sheet: one-time event → Edit opens Apple's editor ──
  await staff.locator('.time-card-main').click(); await p.waitForTimeout(400)
  const sheet = p.locator('.devcal-sheet')
  const sheetText = await text(sheet)
  check('sheet: when, calendar + account, notes', /Mon, Nov 16 · 9:00 AM – 10:00 AM/.test(sheetText) && /Work · Gmail/.test(sheetText) && /Bring the Q4 numbers/.test(sheetText), sheetText)
  check('sheet: place opens Maps', (await sheet.locator('.place-link').getAttribute('href')) === 'https://maps.apple.com/?q=Conference%20Room%20B')
  check('sheet: one-time event has Edit and Delete', (await sheet.getByRole('button', { name: 'Edit' }).count()) === 1 && (await sheet.getByRole('button', { name: 'Delete' }).count()) === 1)
  await p.screenshot({ path: H.OUT + '/sheet.png' }).catch(() => {})
  await sheet.getByRole('button', { name: 'Edit' }).click(); await p.waitForTimeout(800)
  const edits = await calls(p, 'modifyEventWithPrompt')
  check("Edit opens Apple's editor for that event", edits.length === 1 && edits[0].id === 'e1', edits)
  check('after Apple saves: sheet closes and the calendar re-reads', (await sheet.count()) === 0 && (await p.locator('.time-card.device', { hasText: 'Staff meeting (moved)' }).count()) === 1)

  // ── 4. Repeating and view-only events are never changed from the planner ──
  await p.locator('.time-card.device', { hasText: 'Small group' }).locator('.time-card-main').click(); await p.waitForTimeout(400)
  check('repeating: no Edit / Delete, offers Apple Calendar', (await sheet.getByRole('button', { name: 'Edit' }).count()) === 0 && (await sheet.getByRole('button', { name: 'Delete' }).count()) === 0 && /Repeating events are changed in Apple Calendar/.test(await text(sheet)))
  await sheet.getByRole('button', { name: 'Open in Apple Calendar' }).click(); await p.waitForTimeout(400)
  const opened = await calls(p, 'openCalendar')
  check('Open in Apple Calendar goes to that date', opened.length === 1 && opened[0].date === at(16, '18:30'), opened)
  await sheet.getByRole('button', { name: 'Close' }).click(); await p.waitForTimeout(300)

  // ── 5. Month view: all-day, multi-day and past-midnight events land on the right days ──
  await p.getByRole('button', { name: 'month', exact: true }).click(); await p.waitForTimeout(500)
  const cell = (n) => p.locator('.month-cell:not(.other-month)', { has: p.locator('.month-cell-num', { hasText: new RegExp(`^${n}$`) }) }).first()
  const dots = async (n) => cell(n).locator('.month-dot').count()
  check('month: holiday on the 26th, conference on 18 / 19 / 20', (await dots(26)) === 1 && (await dots(19)) === 1 && (await dots(20)) === 1 && (await dots(18)) === 2, [await dots(26), await dots(18), await dots(19), await dots(20)])
  check('month: dot uses the calendar colour', (await cell(26).locator('.month-dot').evaluate((e) => getComputedStyle(e).backgroundColor)) === 'rgb(255, 159, 10)')
  await cell(18).click(); await p.waitForTimeout(500)
  const agenda18 = await text(p.locator('.month-agenda'))
  check('month list (18th): conference all day + late shift after midnight', /All day Conference/.test(agenda18) && /12:00\s*–\s*1:00 AM Late shift/.test(agenda18), agenda18)
  await cell(17).click(); await p.waitForTimeout(500)
  check('month list (17th): late shift until midnight', /9:00\s*–\s*11:59 PM Late shift/.test(await text(p.locator('.month-agenda'))), await text(p.locator('.month-agenda')))
  await cell(26).click(); await p.waitForTimeout(400)
  await p.locator('.agenda-row-main', { hasText: 'Thanksgiving' }).click(); await p.waitForTimeout(400)
  check('view-only calendar: says so, no Edit / Delete', /This calendar is view only/.test(await text(sheet)) && (await sheet.getByRole('button', { name: 'Edit' }).count()) === 0 && (await sheet.getByRole('button', { name: 'Delete' }).count()) === 0)
  await sheet.getByRole('button', { name: 'Close' }).click(); await p.waitForTimeout(300)
  await cell(18).click(); await p.waitForTimeout(400)
  await p.locator('.agenda-row-main', { hasText: 'Conference' }).click(); await p.waitForTimeout(400)
  check('multi-day event: dates shown, Edit (Apple) but no quick Delete', /Wed, Nov 18 – Fri, Nov 20 · All day/.test(await text(sheet)) && (await sheet.getByRole('button', { name: 'Edit' }).count()) === 1 && (await sheet.getByRole('button', { name: 'Delete' }).count()) === 0, await text(sheet))
  await sheet.getByRole('button', { name: 'Close' }).click(); await p.waitForTimeout(300)
  await p.screenshot({ path: H.OUT + '/month.png' }).catch(() => {})

  // ── 6. Move by dragging (one-time event) keeps its length; repeating ones don't move ──
  await p.getByRole('button', { name: 'Today' }).click(); await p.getByRole('button', { name: 'day', exact: true }).click(); await p.waitForTimeout(500)
  const drop = (id, slotLabel) => p.evaluate(({ id, slotLabel }) => {
    const row = [...document.querySelectorAll('.timeline-row')].find((r) => r.querySelector('.sr-only')?.textContent === slotLabel)
    const grid = document.querySelector('.timeline-grid'), y = row.getBoundingClientRect().top + 4
    const dt = new DataTransfer(); dt.setData('application/json', JSON.stringify({ type: 'device', id, repeat: false }))
    grid.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, clientY: y }))
  }, { id, slotLabel })
  await drop('e1|2026-11-16', 'Add at 3:00 PM'); await p.waitForTimeout(700)
  const moves = await calls(p, 'modifyEvent')
  check('drag: saved to Apple Calendar with the same length', moves.length === 1 && moves[0].id === 'e1' && moves[0].startDate === at(16, '15:00') && moves[0].endDate === at(16, '16:00'), moves)
  check('drag: block shows at the new time', /3:00\s*–\s*4:00 PM/.test(await text(p.locator('.time-card.device', { hasText: 'Staff meeting (moved)' }))))
  check('repeating event is not draggable', (await p.locator('.time-card.device', { hasText: 'Small group' }).getAttribute('draggable')) === 'false')
  await drop('e2|2026-11-16', 'Add at 7:00 AM'); await p.waitForTimeout(500)
  check('dropping a repeating event changes nothing', (await calls(p, 'modifyEvent')).length === 1)

  // ── 7. New event saved to an Apple calendar (not to the planner database) ──
  const eventWrites = async () => (await H.db.state()).writes.filter((w) => w.table === 'events').length
  await p.getByRole('button', { name: '+ Event' }).click(); await p.waitForTimeout(400)
  const form = p.locator('.modal-sheet')
  const saveTo = form.locator('label', { hasText: 'Save to' }).locator('select')
  check('new event: Save to lists the planner and writable calendars only', JSON.stringify(await saveTo.locator('option').allInnerTexts()) === JSON.stringify(['The Living Planner', 'Home (iCloud)', 'Work (Gmail)']), await saveTo.locator('option').allInnerTexts())
  check('new event: the planner is the default', (await saveTo.inputValue()) === '')
  await saveTo.selectOption('cal-work')
  await form.locator('label', { hasText: 'Title' }).locator('input').fill('Client lunch')
  await form.locator('label', { hasText: 'Location' }).locator('input').fill('  Half Shell Oyster House ')
  await form.locator('label', { hasText: 'Repeats' }).locator('select').selectOption('biweekly')
  await form.locator('label', { hasText: 'Until' }).locator('input').fill('2026-12-31')
  check('new event to Apple: Category (planner-only) is hidden', (await form.locator('label', { hasText: 'Category' }).count()) === 0)
  await form.getByRole('button', { name: 'Save Event' }).click(); await p.waitForTimeout(900)
  const created = await calls(p, 'createEvent')
  const c0 = created[0] || {}
  check('saved to Apple: title, calendar, times, place', created.length === 1 && c0.title === 'Client lunch' && c0.calendarId === 'cal-work' && c0.startDate === at(16, '09:00') && c0.endDate === at(16, '10:00') && c0.isAllDay === false && c0.location === 'Half Shell Oyster House', c0)
  check('saved to Apple: every 2 weeks until Dec 31', c0.recurrence && c0.recurrence.frequency === 'weekly' && c0.recurrence.interval === 2 && c0.recurrence.end === new Date('2026-12-31T23:59:00-06:00').getTime(), c0.recurrence)
  check('saved to Apple: nothing written to the planner database', (await eventWrites()) === 0)
  check('saved to Apple: shows on the calendar', (await p.locator('.time-card.device', { hasText: 'Client lunch' }).count()) === 1)
  await p.getByRole('button', { name: '+ Event' }).click(); await p.waitForTimeout(400)
  check('next new event remembers the last calendar', (await saveTo.inputValue()) === 'cal-work')
  await saveTo.selectOption('')
  await form.locator('label', { hasText: 'Title' }).locator('input').fill('Planner-only event')
  await form.getByRole('button', { name: 'Save Event' }).click(); await p.waitForTimeout(900)
  check('"The Living Planner" still saves to the planner', (await eventWrites()) === 1 && (await calls(p, 'createEvent')).length === 1)

  // ── 8. Delete a one-time event ──
  await p.locator('.time-card.device', { hasText: 'Staff meeting (moved)' }).locator('.time-card-main').click(); await p.waitForTimeout(400)
  await sheet.getByRole('button', { name: 'Delete' }).click(); await p.waitForTimeout(800)
  const dels = await calls(p, 'deleteEvent')
  check('delete: removed from Apple Calendar and from view', dels.length === 1 && dels[0].id === 'e1' && (await p.locator('.time-card.device', { hasText: 'Staff meeting' }).count()) === 0, dels)

  // ── 9. Home timeline ──
  await p.goto(APP + '/'); await p.waitForTimeout(2200)
  const home = await text(p.locator('section.card', { hasText: 'Today Timeline' }))
  check("Home: today's Apple events with their calendar", /Small group/.test(home) && /Home/.test(home) && /Write sermon notes/.test(home), home)

  // ── 10. Settings: calendars by account, hide one, turn it off ──
  await p.goto(APP + '/more'); await p.waitForTimeout(1800); await H.openFolds(p)
  const card = p.locator('#apple-calendar')
  const cardText = await text(card)
  check('settings: connected, calendars grouped by account', /Showing on your Calendar and Home/.test(cardText) && /iCloud Home/i.test(cardText) && /Gmail Work/i.test(cardText) && /Subscribed US Holidays View only/i.test(cardText), cardText)
  await card.getByRole('switch', { name: 'Show Home' }).click(); await p.waitForTimeout(300)
  await p.goto(APP + '/calendar'); await p.waitForTimeout(2000)
  check('hidden calendar: its events are gone, others stay', (await p.locator('.time-card.device', { hasText: 'Small group' }).count()) === 0 && (await p.locator('.time-card.device', { hasText: 'Client lunch' }).count()) === 1)
  await p.getByRole('button', { name: '+ Event' }).click(); await p.waitForTimeout(400)
  check('hidden calendar is not offered for new events', JSON.stringify(await saveTo.locator('option').allInnerTexts()) === JSON.stringify(['The Living Planner', 'Work (Gmail)']))
  await p.keyboard.press('Escape'); await p.locator('.modal-backdrop').click({ position: { x: 4, y: 4 } }).catch(() => {})
  await p.goto(APP + '/more'); await p.waitForTimeout(1800); await H.openFolds(p)
  await card.getByRole('button', { name: 'Stop showing Apple Calendar' }).click(); await p.waitForTimeout(400)
  check('turned off: Connect button is back', (await card.getByRole('button', { name: 'Connect Apple Calendar' }).count()) === 1)
  await p.goto(APP + '/calendar'); await p.waitForTimeout(2000)
  check('turned off: no Apple events on the calendar', (await p.locator('.time-card.device').count()) === 0)
  check('iPhone: no page errors', errs.length === 0, errs.slice(0, 3))
  await ctx.close()

  // ── 11. Signing out forgets this device's calendar choice ──
  ;({ ctx, p, errs } = await open(browser, { calendar: { permission: 'granted', calendars: CALENDARS, events: JSON.parse(JSON.stringify(EVENTS)) } }))
  await ctx.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('planner_device_cal', JSON.stringify({ on: true, hidden: [], saveTo: '' })); sessionStorage.setItem('seeded', '1') } })
  await p.goto(APP + '/calendar'); await p.waitForTimeout(2500)
  check('already connected: events show on open, without asking again', (await p.locator('.time-card.device').count()) >= 2 && (await calls(p, 'requestFullCalendarAccess')).length === 0)
  await p.goto(APP + '/more'); await p.waitForTimeout(1500); await H.openFolds(p)
  await p.getByRole('button', { name: 'Sign Out' }).click(); await p.waitForTimeout(1500)
  check('sign-out clears the calendar choice on this device', (await p.evaluate(() => localStorage.getItem('planner_device_cal'))) === null)
  await ctx.close()

  // ── 12. Access denied in iOS ──
  ;({ ctx, p, errs } = await open(browser, { calendar: { permission: 'prompt', answer: 'denied', calendars: CALENDARS, events: EVENTS } }))
  await p.goto(APP + '/more'); await p.waitForTimeout(2200); await H.openFolds(p)
  await p.locator('#apple-calendar').getByRole('button', { name: 'Connect Apple Calendar' }).click(); await p.waitForTimeout(600)
  check('denied: explains where to turn it on', /Calendar access is off/.test(await text(p.locator('#apple-calendar'))) && /Settings app/.test(await text(p.locator('#apple-calendar'))))
  await p.goto(APP + '/calendar'); await p.waitForTimeout(2000)
  check('denied: no events, no offer', (await p.locator('.time-card.device').count()) === 0 && !/See your Apple Calendar here/.test(await text(p.locator('body'))))
  check('denied: no page errors', errs.length === 0, errs.slice(0, 3))
  await ctx.close()

  // ── 13. Website: none of this appears ──
  ;({ ctx, p, errs } = await open(browser, { native: false }))
  await p.goto(APP + '/more'); await p.waitForTimeout(2200); await H.openFolds(p)
  check('website: no Apple Calendar card in Settings', (await p.locator('#apple-calendar').count()) === 0)
  await p.goto(APP + '/calendar'); await p.waitForTimeout(2000)
  check('website: no offer on the Calendar', !/Apple Calendar/.test(await text(p.locator('body'))))
  await p.getByRole('button', { name: '+ Event' }).click(); await p.waitForTimeout(400)
  check('website: event form has no "Save to"', (await p.locator('.modal-sheet label', { hasText: 'Save to' }).count()) === 0 && (await p.locator('.modal-sheet label', { hasText: 'Category' }).count()) === 1)
  check('website: no page errors', errs.length === 0, errs.slice(0, 3))
  await ctx.close()

  await browser.close()
  H.report({ failed: results.filter((x) => x.startsWith('FAIL')), checks: results.length })
})().catch((e) => { console.error(e); process.exit(1) })
