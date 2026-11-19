// Ported from the session test scripts on 2026-11-16 (smoke.cjs). Run with: npm test -- every-page
// Visit every page + tab on phone and iPad (Pro), collect errors, screenshot each.
const H = require('../harness.cjs')
const { chromium, devices } = H
const fs = require('fs')
const APP = 'http://localhost:4830', DB = 'http://localhost:4831', UID = '11111111-2222-3333-4444-555555555555'
const session = { access_token: 'x.' + Buffer.from(JSON.stringify({ sub: UID, exp: 4102444800 })).toString('base64') + '.y', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, refresh_token: 'r', user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 't@e.com' } }
const post = (t, b) => fetch(DB + '/rest/v1/' + t, { method: 'POST', body: JSON.stringify(b) })
const tier = process.argv[2] || 'pro', OUT = H.OUT + tier; fs.mkdirSync(OUT, { recursive: true })
const PAGES = {
  '/': [null], '/tasks': [null], '/calendar': [null], '/projects': [null], '/habits': [null], '/goals': [null], '/growth': [null], '/calculator': [null], '/more': [null],
  '/finance': ['overview', 'income', 'expenses', 'savings', 'debt', 'donations', 'budget', 'nospend'],
  '/wellness': ['mood', 'training', 'recovery', 'nutrition', 'sleep', 'journal', 'routine', 'meds', 'metrics', 'care', 'anxiety', 'migraines', 'coping'],
  '/productivity': ['braindump', 'notes', 'mindmap', 'checklists', 'focus', 'tips'],
  '/lifestyle': ['groceries', 'recipes', 'trips', 'birthdays', 'gifts', 'cleaning'],
  '/faith': ['devotional', 'prayer', 'scripture', 'reading', 'gratitude', 'fasting', 'sermons', 'goals'],
}
;(async () => {
  await fetch(DB + '/__reset'); await fetch(DB + '/__set?tier=' + tier)
  await post('tasks', [
    { id: 't1', title: 'Get D-U-N-S #', date: '2026-11-13', category: 'Business', priority: 'High', completed: false, user_id: UID },
    { id: 't2', title: 'Overdue thing', date: '2026-11-10', category: 'Productivity', priority: 'Medium', completed: false, user_id: UID },
    { id: 't3', title: 'Meeting prep', date: '2026-11-14', time: '09:00', end_time: '10:00', category: 'Business', priority: 'Low', completed: false, recurrence: 'weekly', user_id: UID },
    { id: 't4', title: 'Done task', date: '2026-11-12', category: 'Health', priority: 'Low', completed: true, user_id: UID },
  ])
  await post('events', [{ id: 'e1', title: 'Church', date: '2026-11-15', time: '10:00', end_time: '12:00', recurrence: 'weekly', user_id: UID }])
  await post('goals', [{ id: 'g1', title: 'Complete App Store submission', category: 'Business', target_date: '2026-12-31', steps: [{ text: 'Sign up for Apple Developer Program (Elora Radiance Co. LLC) and wait for the approval email', done: false }, { text: 'Apple Developer Program', done: false }], user_id: UID }])
  await post('projects', [{ id: 'p1', title: 'Living Planner launch', goal_id: 'g1', due_date: '2026-12-15', status: 'active', steps: [{ text: 'Codemagic', done: true, doneAt: '2026-11-12' }, { text: 'Submit', done: false }], user_id: UID }])
  await post('habits', [{ id: 'h1', name: 'Pray daily', category: 'Faith', user_id: UID }, { id: 'h2', name: 'Do cardio 3x per week', category: 'Health', user_id: UID }])
  await post('habit_logs', [{ id: 'l1', habit_id: 'h1', date: '2026-11-12', completed: true, user_id: UID }, { id: 'l2', habit_id: 'h1', date: '2026-11-13', completed: true, user_id: UID }])
  await post('expenses', [{ id: 'x1', amount: 42.5, category: 'Food', description: 'Groceries', date: '2026-11-12', user_id: UID }])
  const b = await chromium.launch(); const report = []
  for (const [devName, dev] of [['phone', { ...devices['iPhone 14'], deviceScaleFactor: 1 }], ['ipad', { ...devices['iPad Pro 11 landscape'], deviceScaleFactor: 1 }]]) {
    const ctx = await b.newContext({ ...dev, timezoneId: 'America/Chicago' })
    await ctx.route(/fonts\./, (x) => x.fulfill({ body: '' }))
    await ctx.addInitScript((s) => { if (sessionStorage.getItem('i')) return; sessionStorage.setItem('i', '1'); localStorage.setItem('sb-localhost-auth-token', s); localStorage.setItem('planner_a2hs_seen', '1'); localStorage.setItem('planner_onboarded', '1') }, JSON.stringify(session))
    const p = await ctx.newPage(); let errs = []
    p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|WebSocket|realtime/i.test(m.text())) errs.push('CONSOLE ' + m.text().slice(0, 200)) })
    await p.clock.install({ time: new Date('2026-11-13T12:00:00-06:00') })
    for (const [route, tabs] of Object.entries(PAGES)) for (const tab of tabs) {
      errs = []
      await p.goto(APP + route + (tab ? '?tab=' + tab : '')); await p.waitForTimeout(1300)
      const overflow = await p.evaluate(() => { const w = document.documentElement.clientWidth; return [...document.querySelectorAll('body *')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.right > w + 2 && getComputedStyle(el).position !== 'fixed' && !el.closest('[style*="overflow"], .tab-scroll, .pill-row, .quick-grid, .table-wrap') }).slice(0, 3).map((el) => el.tagName + '.' + (el.className || '').toString().slice(0, 40) + ' ' + Math.round(el.getBoundingClientRect().right)) })
      const name = devName + '_' + route.replace(/\//g, '') + (tab ? '_' + tab : '') || devName + '_home'
      await p.screenshot({ path: `${OUT}/${name || devName + '_home'}.png`, fullPage: true })
      report.push({ dev: devName, route, tab, errs, overflow })
    }
    await ctx.close()
  }
  await b.close()
  const bad = report.filter((r) => r.errs.length || r.overflow.length)
  H.report({ problems: bad, pagesChecked: report.length })
})().catch((e) => { console.error(e); process.exit(1) })
