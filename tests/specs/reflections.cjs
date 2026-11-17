// Ported from the session test scripts on 2026-11-16 (reflect-test.cjs). Run with: npm test -- reflections
// Past reflections: one-time conversion from the old single-day value, today's entry syncs, search/expand/delete,
// a delete sticks on other devices, global search finds reflections, new day → reload on resume.
const H = require('../harness.cjs')
const { chromium, devices } = H
const APP = 'http://localhost:4830', DB = 'http://localhost:4831', UID = '11111111-2222-3333-4444-555555555555'
const session = { access_token: 'x.' + Buffer.from(JSON.stringify({ sub: UID, exp: 4102444800 })).toString('base64') + '.y', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, refresh_token: 'r', user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 't@e.com' } }
const faith = async (k) => ((await (await fetch(DB + '/__state')).json()).faithData || []).find((r) => r.data_key === k)?.data_value
const seed = (k, v) => fetch(DB + '/rest/v1/faith_data', { method: 'POST', body: JSON.stringify({ user_id: UID, data_key: k, data_value: v, updated_at: '2026-11-12T22:00:00Z' }) })
;(async () => {
  await fetch(DB + '/__reset'); await fetch(DB + '/__set?tier=pro')
  // The old build kept only one day: last night's reflection
  await seed('devotional', { text: 'Grateful for a quiet evening. Psalm 46 hit home.', date: '2026-11-12' })
  const b = await chromium.launch(); const r = {}; const errs = []
  const device = async (iso, local = {}) => {
    const ctx = await b.newContext({ ...devices['iPhone 14'], deviceScaleFactor: 1, timezoneId: 'America/Chicago' })
    await ctx.route(/fonts\./, (x) => x.fulfill({ body: '' }))
    await ctx.addInitScript(([s, loc]) => { if (sessionStorage.getItem('init')) return; sessionStorage.setItem('init', '1'); localStorage.setItem('sb-localhost-auth-token', s); localStorage.setItem('planner_a2hs_seen', '1'); for (const [k, v] of Object.entries(loc)) localStorage.setItem(k, v) }, [JSON.stringify(session), local])
    const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message))
    await p.clock.install({ time: new Date(iso) })
    await p.goto(APP + '/faith?tab=devotional'); await p.waitForTimeout(2000)
    return p
  }
  const box = (p) => p.getByLabel("Today's reflection")
  const past = (p) => p.locator('.reflect-item .reflect-date').allTextContents()

  // Phone, Friday morning: old value becomes the first past reflection; today's page is blank
  const phone = await device('2026-11-13T07:00:00-06:00')
  r.todayBlank = (await box(phone).inputValue()) === ''
  r.pastAfterConvert = await past(phone)
  r.accountConverted = await faith('reflections')
  await box(phone).click(); await box(phone).pressSequentially('Be still and know. Trusting God with the D-U-N-S wait.', { delay: 25 }); await phone.waitForTimeout(1200)
  r.todaySaved = (await faith('reflections')).find((x) => x.date === '2026-11-13')?.text

  // iPad opened fresh: sees today + past
  const ipad = await device('2026-11-13T07:10:00-06:00')
  r.ipadToday = await box(ipad).inputValue()
  r.ipadPast = await past(ipad)

  // Add a week of history to the account for search/delete; reload both
  const week = [['2026-11-11', 'Prayed for Natalie and the wedding plans.'], ['2026-11-10', 'Patience with clients today. Proverbs 3:5.'], ['2026-11-09', 'Sunday at Northwood, sermon on rest.'], ['2026-11-08', 'Leg day and gratitude.'], ['2026-11-07', 'Felt anxious about the launch; gave it to God.'], ['2026-11-06', 'Started the planner app store work.']]
  const cur = await faith('reflections')
  await seed('reflections', [...cur, ...week.map(([date, text]) => ({ date, text }))])
  await ipad.reload(); await ipad.waitForTimeout(1800)
  r.searchShown = await ipad.getByLabel('Search reflections').count()
  await ipad.getByLabel('Search reflections').fill('anxious'); await ipad.waitForTimeout(200)
  r.searchHits = await past(ipad)
  await ipad.getByLabel('Search reflections').fill('')
  // Expand + delete one
  const item = ipad.locator('.reflect-item', { hasText: 'Leg day' })
  await item.locator('.reflect-item-head').click()
  r.expandedAnchor = (await item.locator('.reflect-anchor').textContent()).trim()
  ipad.on('dialog', (d) => d.accept())
  await item.getByRole('button', { name: /Delete/ }).click(); await ipad.waitForTimeout(500)
  r.deletedFromAccount = !(await faith('reflections')).some((x) => x.date === '2026-11-08')
  await ipad.screenshot({ path: H.OUT + '/reflect-ipad.png', fullPage: true })
  // Phone still has the old copy on the device; reopening must not bring the deleted day back
  await phone.reload(); await phone.waitForTimeout(1800)
  r.phoneNoResurrect = !(await past(phone)).some((t) => t.includes('Nov 8'))
  r.accountStillDeleted = !(await faith('reflections')).some((x) => x.date === '2026-11-08')
  // Global search finds a reflection
  await phone.getByRole('button', { name: 'Search everything' }).click(); await phone.waitForTimeout(300)
  await phone.getByRole('textbox', { name: 'Search everything' }).fill('Northwood'); await phone.waitForTimeout(600)
  // Read the search panel itself (the page behind it also contains the word)
  r.globalSearchText = (await phone.locator('.search-sheet').innerText()).replace(/\s+/g, ' ').slice(0, 200); r.globalSearch = /reflection/i.test(r.globalSearchText) && /northwood/i.test(r.globalSearchText)
  await phone.keyboard.press('Escape')
  // Phone sits in the background overnight; comes back Saturday → reloads, fresh page, Friday's entry in Past
  await phone.goto(APP + '/faith?tab=devotional'); await phone.waitForTimeout(1500)
  await phone.clock.setFixedTime(new Date('2026-11-14T06:45:00-06:00'))
  await Promise.all([phone.waitForEvent('load', { timeout: 8000 }).catch(() => null), phone.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))])
  await phone.waitForTimeout(2000)
  r.newDayBlank = (await box(phone).inputValue()) === ''
  r.newDayHeader = await phone.getByText(/Today's Reflection — /).textContent()
  r.fridayInPast = (await past(phone))[0]
  r.errors = errs
  H.report(r); await b.close()
})().catch((e) => { console.error(e); process.exit(1) })
