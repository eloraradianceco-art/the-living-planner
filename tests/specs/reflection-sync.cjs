// Ported from the session test scripts on 2026-11-16 (echo-test.cjs). Run with: npm test -- reflection-sync
// Reproduce "letters disappear": every faith_data save is echoed back over a fake realtime socket 450 ms later
// (like a slow phone connection). Type the reflection at normal speed and compare what's left in the box.
const H = require('../harness.cjs')
const { chromium, devices } = H
const APP = 'http://localhost:4830', DB = 'http://localhost:4831', UID = '11111111-2222-3333-4444-555555555555'
const session = { access_token: 'x.' + Buffer.from(JSON.stringify({ sub: UID, exp: 4102444800 })).toString('base64') + '.y', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, refresh_token: 'r', user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 't@e.com' } }
const TEXT = 'Lord, teach me to number my days and to walk in step with Your Spirit today.'
;(async () => {
  await fetch(DB + '/__reset'); await fetch(DB + '/__set?tier=pro')
  const b = await chromium.launch(); const r = { label: process.argv[2] }
  const ctx = await b.newContext({ ...devices['iPhone 14'], deviceScaleFactor: 1 })
  await ctx.clock.install({ time: new Date('2026-11-16T12:00:00-06:00') }) // fixed day so results don't change with the calendar
  await ctx.route(/fonts\./, (x) => x.fulfill({ body: '' }))
  await ctx.addInitScript((s) => { localStorage.setItem('sb-localhost-auth-token', s); localStorage.setItem('planner_a2hs_seen', '1') }, JSON.stringify(session))
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message))
  // Fake realtime server
  let sock = null; const joins = {}; let nextId = 7
  await p.routeWebSocket(/realtime\/v1\/websocket/, (ws) => {
    sock = ws
    ws.onMessage((m) => {
      let msg; try { msg = JSON.parse(String(m)) } catch { return }
      const [joinRef, ref, topic, event, payload] = msg
      if (event === 'phx_join') {
        const pcs = (payload?.config?.postgres_changes || []).map((c) => ({ ...c, id: nextId++ }))
        joins[topic] = { joinRef, ids: pcs.filter((c) => c.table === 'faith_data').map((c) => c.id) }
        ws.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response: { postgres_changes: pcs } }]))
      } else if (ref != null) ws.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response: {} }]))
    })
  })
  let saves = 0, echoes = 0
  await p.route('**/rest/v1/faith_data**', async (route) => {
    const req = route.request()
    if (req.method() === 'POST') {
      saves++
      const rec = [].concat(JSON.parse(req.postData() || '[]'))[0]
      setTimeout(() => {   // the save comes back a moment later
        const topic = Object.keys(joins).find((t) => t.includes('faith_realtime')); if (!topic || !sock) return
        echoes++
        sock.send(JSON.stringify([null, null, topic, 'postgres_changes', { ids: joins[topic].ids, data: {
          schema: 'public', table: 'faith_data', type: 'UPDATE', commit_timestamp: new Date().toISOString(), errors: null,
          columns: [{ name: 'user_id', type: 'uuid' }, { name: 'data_key', type: 'text' }, { name: 'data_value', type: 'jsonb' }, { name: 'updated_at', type: 'timestamptz' }],
          record: { ...rec, updated_at: String(rec.updated_at).replace('T', ' ').replace('Z', '+00') }, old_record: {} } }]))
      }, 450)
      return route.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  await p.goto(APP + '/faith?tab=devotional'); await p.waitForTimeout(2500)
  const box = p.locator('textarea[placeholder^="What is God speaking"]')
  await box.click()
  await box.pressSequentially(TEXT, { delay: 90 })
  await p.waitForTimeout(1500)
  r.typed = TEXT.length
  r.inBox = await box.inputValue()
  r.intact = r.inBox === TEXT
  r.saves = saves; r.echoes = echoes
  // Another device edits the reflection later → shows here
  const topic = Object.keys(joins).find((t) => t.includes('faith_realtime'))
  sock.send(JSON.stringify([null, null, topic, 'postgres_changes', { ids: joins[topic].ids, data: { schema: 'public', table: 'faith_data', type: 'UPDATE', commit_timestamp: new Date().toISOString(), errors: null,
    columns: [{ name: 'data_key', type: 'text' }, { name: 'data_value', type: 'jsonb' }, { name: 'updated_at', type: 'timestamptz' }],
    record: { user_id: UID, data_key: 'reflections', data_value: [{ text: TEXT + ' (added on iPad)', date: await p.evaluate(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())) }], updated_at: new Date(Date.now() + 5000).toISOString().replace('T', ' ').replace('Z', '+00') }, old_record: {} } }]))
  await p.waitForTimeout(500)
  r.otherDeviceEditShows = (await box.inputValue()).endsWith('(added on iPad)')
  // Type, then leave the page before the pause ends → the waiting save is still sent
  const before = saves; let lastBody = null
  p.on('request', (q) => { if (q.url().includes('faith_data') && q.method() === 'POST') lastBody = q.postData() })
  await box.press('End'); await box.pressSequentially(' Amen.', { delay: 40 })
  await p.getByRole('link', { name: /Tasks/ }).first().click(); await p.waitForTimeout(800)
  r.savedOnLeave = saves - before === 1 && (JSON.parse(lastBody || '{}').data_value || []).some((x) => String(x.text).endsWith('Amen.'))
  r.errors = errs
  H.report(r); await b.close()
})().catch((e) => { console.error(e); process.exit(1) })
