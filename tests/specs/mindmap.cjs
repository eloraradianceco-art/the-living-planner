// Ported from the session test scripts on 2026-11-16 (mindmap-test.cjs). Run with: npm test -- mindmap
// Mind Map (Productivity): Pro gate, templates, add/rename/fold/color/delete, node → task, outline, copy, zoom, persistence, search.
const H = require('../harness.cjs')
const { chromium, devices } = H
const fs = require('fs')
const APP = 'http://localhost:4830', DB = 'http://localhost:4831', UID = '11111111-2222-3333-4444-555555555555'
const OUT = H.OUT; fs.mkdirSync(OUT, { recursive: true })
const session = { access_token: 'x.' + Buffer.from(JSON.stringify({ sub: UID, exp: 4102444800 })).toString('base64') + '.y', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, refresh_token: 'r', user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 't@e.com' } }
const st = () => fetch(DB + '/__state').then((r) => r.json())
const results = []
const check = (name, ok, extra = '') => { results.push((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : '')) }
;(async () => {
  const tier = process.argv[2] || 'pro'
  const dev = process.argv[3] || 'iPhone 14'
  await fetch(DB + '/__reset'); await fetch(DB + '/__set?tier=' + tier)
  const b = await chromium.launch()
  const ctx = await b.newContext({ ...devices[dev], ...(dev === 'iPhone 14' ? { deviceScaleFactor: 2 } : {}), timezoneId: 'America/Chicago' })
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: APP }).catch(() => {})
  await ctx.route(/fonts\./, (x) => x.fulfill({ body: '' }))
  await ctx.addInitScript((s) => { if (sessionStorage.getItem('i')) return; sessionStorage.setItem('i', '1'); localStorage.setItem('sb-localhost-auth-token', s); localStorage.setItem('planner_a2hs_seen', '1'); localStorage.setItem('planner_onboarded', '1') }, JSON.stringify(session))
  const p = await ctx.newPage(); const errs = []
  p.on('pageerror', (e) => errs.push(e.message))
  p.on('dialog', (d) => d.accept())
  await p.clock.install({ time: new Date('2026-11-13T12:00:00-06:00') })
  const tag = `${tier}-${dev.replace(/\s+/g, '')}`
  const node = (name) => p.locator(`.mm-node[aria-label^="${name}"]`)
  // Tap an idea when it's on screen; otherwise select it from the keyboard (it may be panned out of view)
  const pick = async (name) => {
    const n = node(name), bb = await n.boundingBox(), cb = await p.locator('.mm-svg').boundingBox()
    const inside = bb && cb && bb.x >= cb.x && bb.y >= cb.y && bb.x + bb.width <= cb.x + cb.width && bb.y + bb.height <= cb.y + cb.height
    if (inside) await n.click(); else { await n.focus(); await p.keyboard.press('Enter') }
    await p.waitForTimeout(200); return inside
  }
  const mapsSaved = async () => ((await st()).pageData || []).find((r) => r.data_key === 'mindMaps')?.data_value || []

  await p.goto(APP + '/productivity?tab=mindmap'); await p.waitForTimeout(1400)
  if (tier === 'free') {
    const txt = await p.locator('main').innerText()
    check('Free: Mind Map tab is gated', /Mind Map is part of Pro/.test(txt) && /Turn any branch into a task/.test(txt))
    check('Free: no map editor', (await p.locator('.mm-card').count()) === 0)
    await p.screenshot({ path: `${OUT}/${tag}-gate.png` })
  } else {
    // ── Create from a template ─────────────────────────────────
    check('Empty state offers templates', /Start a Mind Map/.test(await p.locator('.mm-card').innerText()))
    await p.getByRole('radio', { name: '🎯 Goal plan' }).click()
    await p.getByLabel('Center idea').fill('Run a half marathon')
    await p.getByRole('button', { name: 'Create map' }).click(); await p.waitForTimeout(700)
    check('Map shows center + 5 branches', (await p.locator('.mm-node').count()) === 6)
    let saved = await mapsSaved()
    check('Map saved to account', saved.length === 1 && saved[0].nodes.length === 6 && saved[0].title === 'Run a half marathon', JSON.stringify(saved[0]?.title))
    // every label fits its box
    const fits = await p.evaluate(() => [...document.querySelectorAll('.mm-node')].map((g) => {
      const box = g.querySelector('rect:not([fill="none"])').getBBox(); const tb = g.querySelector('text').getBBox()
      return { name: g.getAttribute('aria-label'), ok: tb.width <= box.width - 8 && tb.height <= box.height + 2 }
    }))
    check('All labels fit inside their boxes', fits.every((f) => f.ok), fits.filter((f) => !f.ok).map((f) => f.name).join(', '))
    check('Center is selected, panel ready', (await p.getByLabel('Center idea').inputValue()) === 'Run a half marathon')
    await p.screenshot({ path: `${OUT}/${tag}-created.png`, fullPage: true })

    // ── Add branches (Enter keeps focus for the next one) ──────
    await pick('Steps'); await p.waitForTimeout(250)
    const add = p.locator('#mm-add')
    await add.fill('Buy running shoes'); await add.press('Enter'); await p.waitForTimeout(250)
    await add.fill('Follow a 12-week training plan with long runs on Saturdays'); await add.press('Enter'); await p.waitForTimeout(400)
    check('Two ideas added under Steps', (await p.locator('.mm-node').count()) === 8)
    check('Add field keeps focus', await add.evaluate((el) => document.activeElement === el))
    const long = await node('Follow a 12-week').evaluate((g) => g.querySelectorAll('tspan').length)
    check('Long idea wraps to several lines', long >= 2, String(long))
    saved = await mapsSaved()
    const steps = saved[0].nodes.find((n) => n.text === 'Steps')
    check('New ideas saved under Steps', saved[0].nodes.filter((n) => n.parent === steps.id).length === 2)

    // ── Rename ─────────────────────────────────────────────────
    await pick('Steps'); await p.waitForTimeout(200)
    await p.locator('#mm-rename').fill('Weekly steps'); await p.locator('#mm-rename').press('Enter'); await p.waitForTimeout(300)
    check('Rename updates the node', (await node('Weekly steps').count()) === 1 && (await node('Steps').count()) === 0)

    // ── Make a task ────────────────────────────────────────────
    await pick('Buy running shoes'); await p.waitForTimeout(200)
    await p.getByRole('button', { name: '→ Make it a task' }).click(); await p.waitForTimeout(700)
    let s = await st()
    const task = (s.tables.tasks || []).find((x) => x.title === 'Buy running shoes')
    check('Branch became a task (today, Productivity)', task && task.date === '2026-11-13' && task.category === 'Productivity', JSON.stringify(task || {}))
    check('Panel shows it is in Tasks', (await p.getByRole('button', { name: /In Tasks · View/ }).count()) === 1)
    check('Node marked as a task', /in Tasks/.test(await node('Buy running shoes').getAttribute('aria-label')))

    // ── Fold / unfold ──────────────────────────────────────────
    await pick('Weekly steps'); await p.waitForTimeout(200)
    await p.getByRole('button', { name: 'Fold', exact: true }).click(); await p.waitForTimeout(300)
    check('Fold hides the two ideas', (await p.locator('.mm-node').count()) === 6 && /2 folded/.test(await node('Weekly steps').getAttribute('aria-label')))
    await p.locator('.mm-fold').first().click(); await p.waitForTimeout(300)
    check('Badge unfolds them', (await p.locator('.mm-node').count()) === 8)

    // ── Color ──────────────────────────────────────────────────
    await pick('Obstacles'); await p.waitForTimeout(200)
    await p.getByRole('radio', { name: 'Plum' }).click(); await p.waitForTimeout(300)
    saved = await mapsSaved()
    check('Branch color saved', saved[0].nodes.find((n) => n.text === 'Obstacles')?.color === '#7E4E8C')
    check('Node drawn in the new color', (await node('Obstacles').locator('rect').last().getAttribute('stroke')) === '#7E4E8C')

    // ── Zoom + pan ─────────────────────────────────────────────
    const scaleOf = async () => Number((await p.locator('.mm-svg > g').getAttribute('transform')).match(/scale\(([\d.]+)\)/)[1])
    const k0 = await scaleOf()
    await p.getByRole('button', { name: 'Zoom in' }).click(); await p.waitForTimeout(150)
    check('Zoom in', (await scaleOf()) > k0 + 0.1)
    const tr0 = await p.locator('.mm-svg > g').getAttribute('transform')
    const box = await p.locator('.mm-svg').boundingBox()
    await p.mouse.move(box.x + 12, box.y + box.height - 60); await p.mouse.down(); await p.mouse.move(box.x + 80, box.y + box.height - 20, { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(150)
    check('Drag pans the map', (await p.locator('.mm-svg > g').getAttribute('transform')) !== tr0)
    await p.getByRole('button', { name: 'Fit the whole map' }).click(); await p.waitForTimeout(200)

    // ── Keyboard: Enter selects, Delete removes ────────────────
    await node('Follow a 12-week').focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(150)
    check('Keyboard Enter selects an idea', /Follow a 12-week/.test(await p.locator('#mm-rename').inputValue()))
    await node('Follow a 12-week').focus(); await p.keyboard.press('Delete'); await p.waitForTimeout(400)
    check('Keyboard Delete removes it', (await node('Follow a 12-week').count()) === 0)
    check('No horizontal page scroll', await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth))
    await p.screenshot({ path: `${OUT}/${tag}-map.png`, fullPage: true })

    // ── Outline + copy ─────────────────────────────────────────
    await p.getByRole('radio', { name: 'Outline' }).click(); await p.waitForTimeout(300)
    const ol = await p.locator('.mm-outline').innerText()
    check('Outline lists every idea with the task tag', /Run a half marathon/.test(ol) && /Weekly steps/.test(ol) && /Buy running shoes/.test(ol) && /✓ task/.test(ol))
    await p.getByRole('button', { name: 'Fold Weekly steps' }).click(); await p.waitForTimeout(250)
    check('Outline fold hides children', !/Buy running shoes/.test(await p.locator('.mm-outline').innerText()))
    await p.getByRole('button', { name: 'Unfold Weekly steps' }).click(); await p.waitForTimeout(250)
    await p.getByRole('button', { name: 'Copy as text' }).click(); await p.waitForTimeout(300)
    const clip = await p.evaluate(() => navigator.clipboard.readText().catch(() => ''))
    check('Copy as text gives an indented outline', /^Run a half marathon\n- Why it matters/.test(clip) && /\n  - Buy running shoes/.test(clip), JSON.stringify(clip.slice(0, 120)))
    await p.screenshot({ path: `${OUT}/${tag}-outline.png`, fullPage: true })

    // ── Persists across reload (view remembered) ───────────────
    await p.reload(); await p.waitForTimeout(1500)
    check('Reload: outline view and map kept', (await p.locator('.mm-outline').count()) === 1 && /Buy running shoes/.test(await p.locator('.mm-outline').innerText()))
    await p.getByRole('radio', { name: 'Map' }).click(); await p.waitForTimeout(300)

    // ── Second map, switch, delete ─────────────────────────────
    await p.getByRole('button', { name: '+ New map' }).click(); await p.waitForTimeout(200)
    await p.getByRole('radio', { name: '✝️ Sermon notes' }).click()
    await p.getByLabel('Center idea').fill('Sunday: Psalm 23'); await p.getByRole('button', { name: 'Create map' }).click(); await p.waitForTimeout(600)
    check('Second map open, picker shows both', (await p.getByLabel('Choose a map').locator('option').count()) === 2 && (await node('Sunday: Psalm 23').count()) === 1)
    await p.getByLabel('Choose a map').selectOption({ label: 'Run a half marathon' }); await p.waitForTimeout(400)
    check('Switch back to the first map', (await node('Run a half marathon').count()) === 1)
    await p.getByLabel('Choose a map').selectOption({ label: 'Sunday: Psalm 23' }); await p.waitForTimeout(400)
    await pick('Sunday: Psalm 23'); await p.getByRole('button', { name: 'Delete map' }).click(); await p.waitForTimeout(500)
    saved = await mapsSaved()
    check('Delete map leaves one', saved.length === 1 && saved[0].title === 'Run a half marathon')
    await p.screenshot({ path: `${OUT}/${tag}-final.png` })

    // ── Search finds ideas inside maps ─────────────────────────
    await p.getByRole('button', { name: 'Search everything' }).click(); await p.waitForTimeout(400)
    await p.getByRole('textbox', { name: 'Search everything' }).fill('Obstacles'); await p.waitForTimeout(700)
    const sr = await p.locator('.search-sheet').innerText()
    check('Search finds the mind map', /Mind map/i.test(sr) && /half marathon/i.test(sr), sr.replace(/\s+/g, ' ').slice(0, 160))
  }
  check('No page errors', errs.length === 0, errs.join(' | '))
  await b.close()
  H.report({ failed: results.filter((x) => x.startsWith('FAIL')), checks: results.length })
})()
