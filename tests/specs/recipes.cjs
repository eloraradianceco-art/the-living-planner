// Ported from the session test scripts on 2026-11-16 (recipe-test.cjs). Run with: npm test -- recipes
// Recipes: legacy link recipe still works; full card; parse + add to shopping list; dedupe; edit; search deep link; cache keys.
const H = require('../harness.cjs')
const { chromium, devices } = H
const APP = 'http://localhost:4830', DB = 'http://localhost:4831'
const UID = '11111111-2222-3333-4444-555555555555'
const session = { access_token: 'x.' + Buffer.from(JSON.stringify({ sub: UID, exp: 4102444800 })).toString('base64') + '.y', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, refresh_token: 'r', user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 't@e.com' } }
const pd = async () => (await (await fetch(DB + '/__state')).json()).pageData || []
const val = async (key) => (await pd()).find((r) => r.page === 'lifestyle' && r.data_key === key)?.data_value
;(async () => {
  await fetch(DB + '/__reset'); await fetch(DB + '/__set?tier=pro')
  await fetch(DB + '/rest/v1/page_data', { method: 'POST', body: JSON.stringify({ user_id: UID, page: 'lifestyle', data_key: 'recipes', data_value: [{ id: 1, title: 'Old Link Recipe', url: 'https://example.com/r', category: 'Dinner', favorite: true, notes: '' }] }) })
  await fetch(DB + '/rest/v1/page_data', { method: 'POST', body: JSON.stringify({ user_id: UID, page: 'lifestyle', data_key: 'groceries', data_value: [{ label: 'Onions', qty: '', done: false }, { label: 'Milk', qty: '1 gal', done: true }] }) })
  const b = await chromium.launch(); const r = {}
  const ctx = await b.newContext({ ...devices['iPhone 14'] })
  await ctx.clock.install({ time: new Date('2026-11-16T12:00:00-06:00') }) // fixed day so results don't change with the calendar
  await ctx.route(/fonts\./, (x) => x.fulfill({ body: '' }))
  await ctx.addInitScript((s) => { localStorage.setItem('sb-localhost-auth-token', s); localStorage.setItem('planner_a2hs_seen', '1') }, JSON.stringify(session))
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept())
  await p.goto(APP + '/lifestyle?tab=recipes'); await p.waitForTimeout(2000)

  // Legacy recipe shows and opens
  r.legacyRow = (await p.locator('.recipe-row').first().textContent()).replace(/\s+/g, ' ').trim()
  await p.locator('.recipe-row').first().click(); await p.waitForTimeout(300)
  r.legacyDetail = { source: await p.getByRole('link', { name: 'Open the original recipe →' }).getAttribute('href'), emptyIng: (await p.getByText('No ingredients yet.').count()) > 0, stepsHint: (await p.getByText('Steps are on the original recipe.').count()) > 0 }
  await p.getByRole('button', { name: 'Close' }).click(); await p.waitForTimeout(200)

  // New full recipe
  await p.getByRole('button', { name: 'New Recipe' }).click(); await p.waitForTimeout(300)
  const sheet = p.locator('.recipe-sheet')
  const f = (label) => sheet.locator('label', { hasText: label }).first()
  await f('Title').locator('input').fill('Weeknight Lasagna')
  await f('Category').locator('select').selectOption('Dinner')
  await f('Serves').locator('input').fill('6')
  await f('Prep time').locator('input').fill('20 min')
  await f('Cook time').locator('input').fill('45 min')
  await f('Ingredients').locator('textarea').fill('1 lb ground beef\n1 (24 oz) jar pasta sauce\n2 cups shredded mozzarella\n1 onion, diced\n2 cloves garlic, minced\n1 gal milk\nSalt and pepper to taste')
  await f('Steps').locator('textarea').fill('1. Brown the beef with the onion.\n2. Stir in the sauce.\nStep 3: Layer and bake 45 minutes.')
  await f('Link to the original').locator('input').fill('example.com/lasagna')
  await f('Notes').locator('textarea').fill('Double the cheese for Sunday.')
  await p.screenshot({ path: H.OUT + '/recipe-edit.png' })
  await sheet.getByRole('button', { name: 'Save Recipe' }).click(); await p.waitForTimeout(800)
  const saved = (await val('recipes')).find((x) => x.title === 'Weeknight Lasagna')
  r.savedShape = { ing: saved.ingredients.length, steps: saved.steps, url: saved.url, servings: saved.servings }
  r.detailOpensAfterSave = (await p.locator('.recipe-sheet h2').textContent()).trim()
  r.meta = (await p.locator('.recipe-meta').textContent())
  // Onion is already on the list → marked; milk was checked off → selectable
  r.onListMarked = (await p.locator('.recipe-ingredients li', { hasText: 'onion' }).getByText('On list').count()) === 1
  r.addLabel = (await p.locator('.recipe-add-btn').textContent()).trim()
  // Skip salt & pepper
  await p.locator('.recipe-ingredients li', { hasText: 'Salt and pepper' }).locator('input').uncheck()
  r.addLabelAfterSkip = (await p.locator('.recipe-add-btn').textContent()).trim()
  await p.screenshot({ path: H.OUT + '/recipe-detail.png', fullPage: false })
  await p.locator('.recipe-add-btn').click(); await p.waitForTimeout(700)
  r.addedMsg = (await p.locator('.recipe-added').textContent()).trim()
  r.groceries = (await val('groceries')).map((g) => `${g.label}|${g.qty}|${g.done ? 'x' : ''}|${g.from || ''}`)
  r.afterAddButton = (await p.locator('.recipe-add-btn').textContent()).trim()
  // Cook mode
  await p.locator('.recipe-steps li').first().locator('button').click(); r.stepChecked = await p.locator('.recipe-steps li.done').count()
  // View list
  await p.getByRole('button', { name: 'View list →' }).click(); await p.waitForTimeout(400)
  r.listShowsFrom = await p.getByText('for Weeknight Lasagna').count()
  await p.screenshot({ path: H.OUT + '/recipe-groceries.png', fullPage: false })

  // Edit flow
  await p.goto(APP + '/lifestyle?tab=recipes'); await p.waitForTimeout(1500)
  await p.locator('.recipe-row', { hasText: 'Weeknight Lasagna' }).click(); await p.waitForTimeout(300)
  await p.locator('.recipe-sheet').getByRole('button', { name: 'Edit' }).click(); await p.waitForTimeout(300)
  r.editPrefilled = (await p.locator('.recipe-sheet label', { hasText: 'Ingredients' }).locator('textarea').inputValue()).split('\n').length
  await p.locator('.recipe-sheet label', { hasText: 'Title' }).first().locator('input').fill('Sunday Lasagna')
  await p.locator('.recipe-sheet').getByRole('button', { name: 'Save Changes' }).click(); await p.waitForTimeout(700)
  r.renamed = (await val('recipes')).map((x) => x.title)
  await p.getByRole('button', { name: 'Done' }).click(); await p.waitForTimeout(200)

  // Filters + recipe search
  await p.getByRole('button', { name: 'Favorites', exact: true }).click(); r.favCount = await p.locator('.recipe-row').count()
  await p.getByRole('button', { name: 'All', exact: true }).click()

  // Cache: device copy written under planner.l.* and read back offline
  r.cacheKeys = await p.evaluate(() => ({ prefixed: !!localStorage.getItem('planner.l.recipes'), groceries: JSON.parse(localStorage.getItem('planner.l.groceries') || '[]').length }))

  // Global search by ingredient → opens that recipe
  await p.goto(APP + '/'); await p.waitForTimeout(1500)
  await p.getByRole('button', { name: 'Search everything' }).click(); await p.waitForTimeout(400)
  await p.getByRole('textbox', { name: 'Search everything' }).fill('mozzarella'); await p.waitForTimeout(500)
  await p.locator('.search-sheet').getByText('Sunday Lasagna').first().click(); await p.waitForTimeout(1500)
  r.searchOpens = (await p.locator('.recipe-sheet h2').textContent().catch(() => null))?.trim()
  r.searchUrlCleaned = new URL(p.url()).search
  await p.getByRole('button', { name: 'Done' }).click()

  // Delete
  await p.locator('.recipe-row', { hasText: 'Sunday Lasagna' }).click(); await p.waitForTimeout(300)
  await p.locator('.recipe-sheet').getByRole('button', { name: 'Edit' }).click(); await p.waitForTimeout(200)
  await p.locator('.recipe-sheet').getByRole('button', { name: 'Delete' }).click(); await p.waitForTimeout(700)
  r.afterDelete = (await val('recipes')).map((x) => x.title)
  r.errors = errs

  // iPad layout shot of the detail
  const ctx2 = await b.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 1 }); await ctx2.route(/fonts\./, (x) => x.fulfill({ body: '' }))
  await ctx2.clock.install({ time: new Date('2026-11-16T12:00:00-06:00') }) // fixed day so results don't change with the calendar
  await ctx2.addInitScript((s) => { localStorage.setItem('sb-localhost-auth-token', s); localStorage.setItem('planner_a2hs_seen', '1') }, JSON.stringify(session))
  await fetch(DB + '/rest/v1/page_data', { method: 'POST', body: JSON.stringify({ user_id: UID, page: 'lifestyle', data_key: 'recipes', data_value: [{ id: 1, title: 'Old Link Recipe', url: 'https://example.com/r', category: 'Dinner', favorite: true, notes: '' }, saved, { id: 3, title: 'Overnight Oats', category: 'Breakfast', ingredients: ['1/2 cup oats', '1/2 cup milk', '1 tbsp chia seeds'], steps: ['Mix', 'Chill overnight'], prepTime: '5 min' }] }) })
  const p2 = await ctx2.newPage(); await p2.goto(APP + '/lifestyle?tab=recipes'); await p2.waitForTimeout(2000)
  await p2.screenshot({ path: H.OUT + '/recipe-ipad-list.png' })
  await p2.locator('.recipe-row', { hasText: 'Weeknight Lasagna' }).click(); await p2.waitForTimeout(400)
  await p2.screenshot({ path: H.OUT + '/recipe-ipad-detail.png' })
  H.report(r)
  await b.close(); process.exit(0)
})().catch((e) => { console.error(e); process.exit(1) })
