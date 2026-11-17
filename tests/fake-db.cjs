// A stand-in for the planner's Supabase (sign-in, tables, functions) plus a static server for the built app.
// The test build points at http://localhost:4831, so nothing here ever touches the real database.
//
// Writes are checked against the real table layout in schema.json, the way the real database would:
// unknown column → 400 PGRST204, missing required column on insert → 400 23502, upsert target without a
// unique index → 400 42P10. Every rejection is kept in state.schemaErrors (the runner fails a spec that has any).
//
// Test controls (HTTP, on the database port):
//   /__state                    → everything recorded so far (writes, tables, calls, schemaErrors …)
//   /__reset                    → clears tables and logs; keeps the plan (tier), like the original test server
//   /__fresh                    → clears everything, plan back to Free (the runner calls this before each spec)
//   /__set?tier=free|pro|trial  → the account's plan
//   /__apple?pro=1&ent=0        → what "Apple" reports to store-sync (App Store purchases)
//
// CLI: node tests/fake-db.cjs <built app folder> [appPort=4830] [dbPort=4831]
const http = require('http'), fs = require('fs'), path = require('path')

const UID = '11111111-2222-3333-4444-555555555555'
const SCHEMA = JSON.parse(fs.readFileSync(path.join(__dirname, 'schema.json'), 'utf8'))
const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.html': 'text/html', '.ico': 'image/x-icon', '.webp': 'image/webp', '.jpg': 'image/jpeg' }

function schemaCheck(method, url, body) {
  if (!['POST', 'PATCH'].includes(method)) return null
  const m = url.match(/^\/rest\/v1\/([a-z_]+)(\?.*)?$/); if (!m || m[1] === 'rpc') return null
  const t = SCHEMA[m[1]]; if (!t) return { code: 'PGRST205', message: `Could not find the table 'public.${m[1]}' in the schema cache` }
  const cols = t.cols.split(','), names = cols.map((c) => c.replace('!', '')), req = cols.filter((c) => c.endsWith('!')).map((c) => c.slice(0, -1))
  let rows; try { rows = [].concat(JSON.parse(body || '{}')) } catch { return { code: 'PGRST102', message: 'Invalid JSON body' } }
  for (const r of rows) {
    for (const k of Object.keys(r)) if (!names.includes(k)) return { code: 'PGRST204', message: `Could not find the '${k}' column of '${m[1]}' in the schema cache` }
    if (method === 'POST') for (const k of req) if (r[k] === undefined || r[k] === null) return { code: '23502', message: `null value in column "${k}" of relation "${m[1]}" violates not-null constraint` }
  }
  const oc = new URL(url, 'http://x').searchParams.get('on_conflict')
  if (method === 'POST' && oc && !t.uniq.includes(oc)) return { code: '42P10', message: `there is no unique or exclusion constraint matching the ON CONFLICT specification (${m[1]}: ${oc})` }
  return null
}

function freshState() {
  return { tier: 'free', claims: 0, claimArgs: [], profileWrites: [], nativePush: [], pushDeletes: [], fnCalls: [], recover: [], schemaErrors: [],
    plannerMode: null, applePro: false, appleEnt: null, storeSync: [], budget: null, budgetWrites: [],
    tables: { tasks: [], events: [], goals: [], projects: [] }, writes: [], pageData: [], faithData: [] }
}

function startFakeDb({ dist, appPort = 4830, dbPort = 4831 } = {}) {
  let state = freshState()
  const app = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0])
    let f = path.join(dist, p === '/' ? 'index.html' : p)
    if (!f.startsWith(path.resolve(dist)) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(dist, 'index.html')
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' })
    fs.createReadStream(f).pipe(res)
  })
  const db = http.createServer((req, res) => {
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*', 'Access-Control-Expose-Headers': '*' }
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end() }
    let body = ''; req.on('data', (c) => (body += c)); req.on('end', () => {
      const send = (code, obj) => { res.writeHead(code, { ...cors, 'Content-Type': 'application/json' }); res.end(obj === undefined ? '' : JSON.stringify(obj)) }
      const u = req.url
      const wantsObject = (req.headers.accept || '').includes('vnd.pgrst.object')
      const bad = schemaCheck(req.method, u, body)
      if (bad) { state.schemaErrors.push({ method: req.method, url: decodeURIComponent(u).slice(0, 120), ...bad }); return send(400, bad) }
      if (u.startsWith('/__state')) return send(200, state)
      if (u.startsWith('/__fresh')) { state = freshState(); return send(200, {}) }
      if (u.startsWith('/__reset')) { const keep = state; state = { ...freshState(), tier: keep.tier, claims: keep.claims, claimArgs: keep.claimArgs, profileWrites: keep.profileWrites, nativePush: keep.nativePush, pushDeletes: keep.pushDeletes, fnCalls: keep.fnCalls, recover: keep.recover, schemaErrors: keep.schemaErrors }; return send(200, {}) }
      if (u.startsWith('/__set')) { state.tier = new URL(u, 'http://x').searchParams.get('tier'); return send(200, state) }
      if (u.startsWith('/__apple')) { const q = new URL(u, 'http://x').searchParams; state.applePro = q.get('pro') === '1'; if (q.get('ent') === '0') state.appleEnt = null; return send(200, {}) }
      if (u.startsWith('/auth/v1/user')) return send(200, { id: UID, email: 'tester@example.com', aud: 'authenticated', role: 'authenticated' })
      if (u.startsWith('/auth/v1/recover')) { state.recover.push(u); return send(200, {}) }
      if (u.startsWith('/auth/v1/logout')) return send(204)
      // App Store purchases: store-sync reads Apple (mocked by state.applePro); entitlement row for Settings
      if (u.startsWith('/functions/v1/store-sync')) { state.storeSync.push(JSON.parse(body || '{}')); if (state.applePro) { state.tier = 'pro'; state.appleEnt = { active: true, expires_at: null } } return send(200, { ok: true, active: !!state.applePro, tier: state.tier }) }
      if (u.startsWith('/rest/v1/app_store_entitlements')) return send(200, state.appleEnt ? (wantsObject ? state.appleEnt : [state.appleEnt]) : (wantsObject ? null : []))
      if (u.startsWith('/functions/v1/push-reminders')) { state.fnCalls.push(body); return send(200, { devices: state.nativePush.length ? 1 : 0, sent: 0 }) }
      if (u.startsWith('/rest/v1/rpc/register_native_push')) { state.nativePush.push(JSON.parse(body || '{}')); return send(204) }
      if (u.startsWith('/rest/v1/push_subscriptions') && req.method === 'DELETE') { state.pushDeletes.push(decodeURIComponent(u)); return send(204) }
      if (u.startsWith('/rest/v1/rpc/claim_planner_subscription')) { state.claims++; state.claimArgs.push(body); return send(200, state.tier) }
      if (u.startsWith('/rest/v1/profiles')) {
        if (req.method !== 'GET') { state.profileWrites.push(req.method + ' ' + body); try { const w = JSON.parse(body); if ('planner_mode' in w) state.plannerMode = w.planner_mode } catch {} }
        const row = { user_id: UID, display_name: 'Tester', timezone: 'America/Chicago', planner_mode: state.plannerMode || null, tier: state.tier, trial_ends_at: state.tier === 'trial' ? new Date(Date.now() + 3 * 864e5).toISOString() : null, pro_comp: false }
        return send(200, wantsObject ? row : [row])
      }
      if (u.startsWith('/rest/v1/budgets')) {
        if (req.method === 'GET') return send(200, state.budget ? (wantsObject ? state.budget : [state.budget]) : [])
        const w = JSON.parse(body || '{}'); state.budget = { ...(state.budget || {}), ...[].concat(w)[0] }; state.budgetWrites.push(w)
        return send(201, wantsObject ? state.budget : [state.budget])
      }
      const tm = u.match(/^\/rest\/v1\/(tasks|events|goals|projects|habits|habit_logs|score_history|expenses|notes)(\?.*)?$/)
      if (tm) {
        const table = (state.tables[tm[1]] ||= [])
        const q = new URL(u, 'http://x').searchParams
        const idEq = (q.get('id') || '').replace(/^eq\./, '')
        const reply = (rows, code = 200) => send(code, wantsObject ? (rows[0] || {}) : rows)
        if (req.method === 'GET') {
          let rows = table
          if (idEq) rows = rows.filter((r) => r.id === idEq)
          const dq = q.get('date') || ''; if (dq.startsWith('eq.')) rows = rows.filter((r) => r.date === dq.slice(3)); if (dq.startsWith('gte.')) rows = rows.filter((r) => r.date >= dq.slice(4))
          return wantsObject && !rows.length ? send(406, { code: 'PGRST116' }) : reply(rows)
        }
        if (req.method === 'POST') {
          const items = [].concat(JSON.parse(body || '[]')).map((r) => ({ id: r.id || ('row-' + Math.random().toString(36).slice(2, 10)), created_at: new Date().toISOString(), ...r }))
          for (const it of items) { const i = table.findIndex((r) => r.id === it.id); if (i >= 0) table[i] = { ...table[i], ...it }; else table.push(it) }
          state.writes.push({ table: tm[1], method: 'POST', body: JSON.parse(body || '{}') })
          return reply(items, 201)
        }
        if (req.method === 'PATCH') {
          const patch = JSON.parse(body || '{}'); state.writes.push({ table: tm[1], method: 'PATCH', body: patch })
          const rows = table.filter((r) => r.id === idEq); rows.forEach((r) => Object.assign(r, patch))
          return reply(rows)
        }
        if (req.method === 'DELETE') { const i = table.findIndex((r) => r.id === idEq); if (i >= 0) table.splice(i, 1); return send(204) }
      }
      if (u.startsWith('/rest/v1/faith_data') || u.startsWith('/rest/v1/page_data')) {
        const isPage = u.startsWith('/rest/v1/page_data')
        const rows = isPage ? state.pageData : state.faithData
        const q = new URL(u, 'http://x').searchParams
        const inList = (v) => { const m = v.match(/^in\.\((.*)\)$/); return m ? m[1].split(',').map((x) => x.replace(/"/g, '')) : null }
        if (req.method === 'GET') {
          let out = rows
          if (isPage) { const pg = q.get('page') || ''; const ps = inList(pg); if (ps) out = out.filter((r) => ps.includes(r.page)); else if (pg) out = out.filter((r) => r.page === pg.replace(/^eq\./, '')) }
          const dk = q.get('data_key') || ''; if (dk.startsWith('eq.')) out = out.filter((r) => r.data_key === dk.slice(3)); const ks = inList(dk); if (ks) out = out.filter((r) => ks.includes(r.data_key))
          const ua = q.get('updated_at') || ''; if (ua.startsWith('gt.')) out = out.filter((r) => String(r.updated_at || '') > ua.slice(3))
          return send(200, out)
        }
        if (req.method === 'POST') {
          for (const it of [].concat(JSON.parse(body || '[]'))) {
            const i = rows.findIndex((r) => (isPage ? r.page === it.page : true) && r.data_key === it.data_key)
            if (i >= 0) rows[i] = { ...rows[i], ...it }; else rows.push(it)
          }
          return send(201, [])
        }
      }
      if (u.startsWith('/rest/v1/')) {
        if (req.method === 'GET') return wantsObject ? send(406, { code: 'PGRST116', message: 'no rows' }) : send(200, [])
        return send(201, wantsObject ? {} : [])
      }
      send(404, {})
    })
  })
  return new Promise((resolve, reject) => {
    app.once('error', reject); db.once('error', reject)
    app.listen(appPort, () => db.listen(dbPort, () => resolve({
      appUrl: `http://localhost:${appPort}`, dbUrl: `http://localhost:${dbPort}`,
      close: () => new Promise((r) => { app.close(); db.close(); app.closeAllConnections?.(); db.closeAllConnections?.(); setTimeout(r, 50) }),
    })))
  })
}

module.exports = { startFakeDb, UID }

if (require.main === module) {
  const [dist, a, d] = process.argv.slice(2)
  if (!dist) { console.error('usage: node tests/fake-db.cjs <built app folder> [appPort] [dbPort]'); process.exit(1) }
  startFakeDb({ dist: path.resolve(dist), appPort: Number(a || 4830), dbPort: Number(d || 4831) }).then((s) => console.log(`app ${s.appUrl} · database ${s.dbUrl}`))
}
