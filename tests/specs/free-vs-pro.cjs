// Ported from the session test scripts on 2026-11-16 (free-test.cjs). Run with: npm test -- free-vs-pro
// Free vs Pro: limits, locked modes, Growth gate, Finance default tab, upgrade card copy.
const H = require('../harness.cjs')
const { chromium, devices } = H
const fs = require('fs')
const APP = 'http://localhost:4830', DB = 'http://localhost:4831', UID = '11111111-2222-3333-4444-555555555555'
const OUT = H.OUT; fs.mkdirSync(OUT, { recursive: true })
const session = { access_token: 'x.' + Buffer.from(JSON.stringify({ sub: UID, exp: 4102444800 })).toString('base64') + '.y', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, refresh_token: 'r', user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 't@e.com' } }
const post = (t, b) => fetch(DB + '/rest/v1/' + t, { method: 'POST', body: JSON.stringify(b) })
const results = []
const check = (name, ok, extra = '') => { results.push((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : '')) }
;(async () => {
  const tier = process.argv[2] || 'free'
  await fetch(DB + '/__reset'); await fetch(DB + '/__set?tier=' + tier)
  await post('tasks', [{ id: 't1', title: 'Task one', date: '2026-11-13', category: 'Business', priority: 'High', completed: false, user_id: UID }])
  await post('goals', [
    { id: 'g1', title: 'Goal A', category: 'Business', target_date: '2026-12-31', user_id: UID },
    { id: 'g2', title: 'Goal B (done)', category: 'Faith', target_date: '2026-12-31', completed: true, user_id: UID },
  ])
  await post('projects', [
    { id: 'p1', title: 'Project A', due_date: '2026-12-15', status: 'active', user_id: UID },
    { id: 'p2', title: 'Project B', due_date: '2026-12-15', status: 'active', user_id: UID },
  ])
  await post('habits', [{ id: 'h1', name: 'Pray', category: 'Faith', user_id: UID }, { id: 'h2', name: 'Walk', category: 'Health', user_id: UID }, { id: 'h3', name: 'Read', category: 'Growth', user_id: UID }])
  const b = await chromium.launch()
  const ctx = await b.newContext({ ...devices['iPhone 14'], deviceScaleFactor: 2, timezoneId: 'America/Chicago' })
  await ctx.route(/fonts\./, (x) => x.fulfill({ body: '' }))
  await ctx.addInitScript((s) => { if (sessionStorage.getItem('i')) return; sessionStorage.setItem('i', '1'); localStorage.setItem('sb-localhost-auth-token', s); localStorage.setItem('planner_a2hs_seen', '1'); localStorage.setItem('planner_onboarded', '1') }, JSON.stringify(session))
  const p = await ctx.newPage(); const errs = []
  p.on('pageerror', (e) => errs.push(e.message))
  await p.clock.install({ time: new Date('2026-11-13T12:00:00-06:00') })
  const upgradeOpen = async () => (await p.locator('[role="dialog"][aria-modal="true"]').filter({ hasText: 'Get Pro' }).count()) > 0
  const closeUpgrade = async () => { const btn = p.getByRole('button', { name: 'Maybe later' }); if (await btn.count()) await btn.click(); await p.waitForTimeout(200) }

  // Home
  await p.goto(APP + '/'); await p.waitForTimeout(1500)
  const teaser = await p.locator('.pro-teaser').count()
  check('Home shows Life Score teaser (free) / snapshot (pro)', tier === 'free' ? teaser === 1 : teaser === 0)
  await p.screenshot({ path: `${OUT}/${tier}-home.png`, fullPage: true })
  if (tier === 'free') {
    await p.locator('.pro-teaser button').click(); await p.waitForTimeout(300)
    check('Teaser opens upgrade card', await upgradeOpen())
    const txt = await p.locator('[role="dialog"][aria-modal="true"]').filter({ hasText: 'Get Pro' }).innerText()
    check('Upgrade card has no trial wording', !/trial/i.test(txt), txt.match(/.*trial.*/i)?.[0] || '')
    check('Upgrade card lists Pro in three groups', /Plan without limits/i.test(txt) && /Steward your money and health/i.test(txt) && /Grow in faith/i.test(txt) && /Unlimited habits, goals and projects/.test(txt))
    await p.screenshot({ path: `${OUT}/${tier}-upgrade.png` })
    await closeUpgrade()
  }

  // Mode sheet
  await p.locator('.profile-pill').click(); await p.waitForTimeout(400)
  await p.screenshot({ path: `${OUT}/${tier}-modes.png` })
  await p.locator('.mode-option', { hasText: 'Execution' }).click(); await p.waitForTimeout(400)
  if (tier === 'free') { check('Execution mode is locked for free', await upgradeOpen()); await closeUpgrade() }
  else { await p.waitForTimeout(1500); const t = await p.locator('.profile-pill').innerText(); check('Pro can switch to Execution', t.includes('Execution'), t + ' upgrade=' + await upgradeOpen() + ' writes=' + JSON.stringify((await (await fetch(DB + '/__state')).json()).profileWrites).slice(-200)) }

  // Habit limit (3 habits)
  await p.goto(APP + '/habits'); await p.waitForTimeout(1200)
  await p.evaluate(() => {})
  // Quick add -> pills
  await p.goto(APP + '/'); await p.waitForTimeout(1200)
  await p.getByRole('button', { name: 'Quick add' }).click()
  await p.waitForTimeout(400)
  const pills = await p.locator('.modal-tabs .pill').allInnerTexts()
  await p.screenshot({ path: `${OUT}/${tier}-quickadd.png` })
  if (tier === 'free') {
    check('Habit pill locked at 3 habits', pills.some((t) => /Habit.*🔒/.test(t)), pills.join(' | '))
    check('Project pill locked at 2 active projects', pills.some((t) => /Project.*🔒/.test(t)), pills.join(' | '))
    check('Goal pill open (1 active, 1 completed)', pills.some((t) => /^Goal$/.test(t.trim())), pills.join(' | '))
    await p.locator('.modal-tabs .pill', { hasText: 'Project' }).click(); await p.waitForTimeout(300)
    check('Locked pill opens upgrade card', await upgradeOpen())
    const txt = await p.locator('[role="dialog"][aria-modal="true"]').filter({ hasText: 'Get Pro' }).innerText()
    check('Limit message names projects', /Free includes 2 active projects/.test(txt), txt.split('\n').slice(0, 3).join(' / '))
    await closeUpgrade()
  } else {
    check('Pro has no locked pills', !pills.some((t) => t.includes('🔒')), pills.join(' | '))
  }
  await p.keyboard.press('Escape').catch(() => {})

  // Finance default tab
  await p.goto(APP + '/finance'); await p.waitForTimeout(1200)
  const body = await p.locator('main').innerText()
  if (tier === 'free') check('Finance opens on Budget Plan (free)', /Spending Budget/i.test(body) && !/Pro Feature/.test(body))
  else check('Finance opens on Overview (pro)', /Net Worth/i.test(body))
  await p.goto(APP + '/finance?tab=overview'); await p.waitForTimeout(900)
  const ov = await p.locator('main').innerText()
  check(tier === 'free' ? 'Finance overview locked (free)' : 'Finance overview open (pro)', tier === 'free' ? /Unlock Pro/.test(ov) : !/Unlock Pro/.test(ov))
  await p.screenshot({ path: `${OUT}/${tier}-finance-overview.png`, fullPage: true })

  // Faith
  await p.goto(APP + '/faith?tab=scripture'); await p.waitForTimeout(900)
  const fs1 = await p.locator('main').innerText()
  check(tier === 'free' ? 'Faith scripture locked (free)' : 'Faith scripture open (pro)', tier === 'free' ? /Unlock Pro/.test(fs1) : !/Unlock Pro/.test(fs1))
  await p.goto(APP + '/faith?tab=prayer'); await p.waitForTimeout(900)
  check('Faith prayer open', !/Unlock Pro/.test(await p.locator('main').innerText()))
  await p.screenshot({ path: `${OUT}/${tier}-faith.png`, fullPage: true })

  // Wellness recovery
  await p.goto(APP + '/wellness?tab=recovery'); await p.waitForTimeout(900)
  check(tier === 'free' ? 'Wellness recovery locked (free)' : 'Wellness recovery open (pro)', tier === 'free' ? /Unlock Pro/.test(await p.locator('main').innerText()) : !/Unlock Pro/.test(await p.locator('main').innerText()))
  await p.goto(APP + '/wellness?tab=mood'); await p.waitForTimeout(900)
  check('Wellness mood open', !/Unlock Pro/.test(await p.locator('main').innerText()))

  // Growth
  await p.goto(APP + '/growth'); await p.waitForTimeout(1200)
  const gr = await p.locator('main').innerText()
  check(tier === 'free' ? 'Growth gated (free)' : 'Growth open (pro)', tier === 'free' ? /Growth is part of Pro/.test(gr) : /Life Balance/.test(gr))
  await p.screenshot({ path: `${OUT}/${tier}-growth.png`, fullPage: true })
  if (tier === 'free') {
    await p.getByRole('button', { name: 'Unlock Pro →' }).click(); await p.waitForTimeout(300)
    check('Growth unlock opens upgrade card', await upgradeOpen()); await closeUpgrade()
  }

  // Menu PRO tag
  await p.goto(APP + '/'); await p.waitForTimeout(1000)
  await p.getByRole('button', { name: /Menu/ }).click(); await p.waitForTimeout(500)
  const tag = await p.locator('.menu-tile', { hasText: 'Growth' }).locator('.pro-tag').count()
  check(tier === 'free' ? 'Menu shows PRO on Growth' : 'Menu has no PRO tag', tier === 'free' ? tag === 1 : tag === 0)
  await p.screenshot({ path: `${OUT}/${tier}-menu.png` })

  // Settings copy
  await p.goto(APP + '/more'); await p.waitForTimeout(1000); await H.openFolds(p)
  const more = await p.locator('main').innerText()
  check('Settings subscription copy', tier === 'free' ? /Free plan · 3 habits, 2 goals, 2 projects/.test(more) : /All features unlocked/.test(more))
  check('No page errors', errs.length === 0, errs.join(' | '))
  await b.close()
  H.report({ failed: results.filter((x) => x.startsWith('FAIL')), checks: results.length })
})()
