// Runs the planner's browser tests: builds the app against the fake database, then runs every spec in
// tests/specs and compares what each one saw with its snapshot in tests/snapshots.
//
//   npm test                     every spec
//   npm test -- calendar month   only specs whose file name contains "calendar" or "month"
//   npm test -- --update         save what the specs see now as the new snapshots (review the diff before committing)
//   npm test -- --no-build       reuse the last build in tests/build
//
// A spec fails when: it crashes or times out, it reports failed checks or page errors, its result differs
// from the snapshot, the fake database
// rejected a write (column or table the real database doesn't have), or it has no snapshot yet.
const { spawn, execSync } = require('child_process')
const fs = require('fs'), path = require('path'), os = require('os')
const { startFakeDb } = require('./fake-db.cjs')

const ROOT = path.join(__dirname, '..')
const SPECS = path.join(__dirname, 'specs')
const SNAPS = path.join(__dirname, 'snapshots')
const BUILD = path.join(__dirname, 'build')
const RESULTS = path.join(__dirname, 'results')
const args = process.argv.slice(2)
const UPDATE = args.includes('--update')
const NO_BUILD = args.includes('--no-build')
const filters = args.filter((a) => !a.startsWith('--'))
const SPEC_TIMEOUT = 6 * 60 * 1000
process.env.TZ = 'America/Chicago' // specs and the browser run in one fixed time zone, wherever the tests run

// Build variants. "iap" carries a test App Store key so the in-app purchase screens can be exercised.
const VARIANTS = {
  web: { VITE_SUPABASE_URL: 'http://localhost:4831', VITE_SUPABASE_ANON_KEY: 'test-anon-key' },
  iap: { VITE_SUPABASE_URL: 'http://localhost:4831', VITE_SUPABASE_ANON_KEY: 'test-anon-key', VITE_REVENUECAT_IOS_KEY: 'appl_testkey' },
}

// "// @build iap" in a spec's first lines picks the variant (default web)
const variantOf = (file) => (fs.readFileSync(file, 'utf8').slice(0, 600).match(/@build\s+(\w+)/) || [, 'web'])[1]

function build(variant) {
  const out = path.join(BUILD, variant)
  if (NO_BUILD && fs.existsSync(path.join(out, 'index.html'))) return out
  process.stdout.write(`Building (${variant})… `)
  const t0 = Date.now()
  execSync(`npx vite build --outDir "${out}" --emptyOutDir --logLevel error`, { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, ...VARIANTS[variant] } })
  console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s`)
  return out
}

const deepEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const short = (v) => { const s = JSON.stringify(v); return s && s.length > 160 ? s.slice(0, 157) + '…' : s }

function compare(result, snap) {
  const diffs = []
  for (const k of new Set([...Object.keys(snap), ...Object.keys(result)])) {
    if (!(k in result)) diffs.push(`  ${k}: missing (expected ${short(snap[k])})`)
    else if (!(k in snap)) diffs.push(`  ${k}: not in snapshot (got ${short(result[k])})`)
    else if (!deepEqual(result[k], snap[k])) diffs.push(`  ${k}: expected ${short(snap[k])}\n  ${' '.repeat(k.length)}       got ${short(result[k])}`)
  }
  return diffs
}

function runSpec(file, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [file], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] })
    let log = ''
    child.stdout.on('data', (d) => (log += d)); child.stderr.on('data', (d) => (log += d))
    const timer = setTimeout(() => { log += '\n[timed out]'; child.kill('SIGKILL') }, SPEC_TIMEOUT)
    child.on('exit', (code) => { clearTimeout(timer); resolve({ code, log }) })
  })
}

;(async () => {
  fs.rmSync(RESULTS, { recursive: true, force: true }); fs.mkdirSync(RESULTS, { recursive: true }); fs.mkdirSync(SNAPS, { recursive: true })
  let files = fs.readdirSync(SPECS).filter((f) => f.endsWith('.cjs')).sort()
  if (filters.length) files = files.filter((f) => filters.some((x) => f.includes(x)))
  if (!files.length) { console.log('No specs match.'); process.exit(1) }

  const byVariant = {}
  for (const f of files) (byVariant[variantOf(path.join(SPECS, f))] ||= []).push(f)

  const outcomes = []
  const t0 = Date.now()
  for (const [variant, list] of Object.entries(byVariant)) {
    const dist = build(variant)
    const server = await startFakeDb({ dist })
    for (const f of list) {
      const name = f.replace(/\.cjs$/, '')
      await fetch(server.dbUrl + '/__fresh'); await fetch(server.dbUrl + '/__set?tier=pro')
      const resultFile = path.join(os.tmpdir(), `planner-test-${name}-${process.pid}.json`)
      fs.rmSync(resultFile, { force: true })
      const s0 = Date.now()
      const { code, log } = await runSpec(path.join(SPECS, f), { TEST_RESULT: resultFile, TEST_OUT: path.join(RESULTS, name) })
      const secs = ((Date.now() - s0) / 1000).toFixed(0)
      const problems = []
      let result = null
      try { result = JSON.parse(fs.readFileSync(resultFile, 'utf8')) } catch { problems.push('  no result reported') }
      if (code !== 0) problems.push(`  exited with code ${code}`)
      const st = await (await fetch(server.dbUrl + '/__state')).json()
      if (st.schemaErrors?.length) problems.push(...st.schemaErrors.slice(0, 5).map((e) => `  database rejected ${e.method} ${e.url}: ${e.message}`))
      // A spec's own failed checks or page errors fail the run even if a snapshot recorded them
      for (const k of ['failed', 'errors', 'problems']) if (result && Array.isArray(result[k]) && result[k].length) problems.push(...result[k].slice(0, 8).map((x) => `  ${k}: ${short(x)}`))
      const snapFile = path.join(SNAPS, name + '.json')
      if (result) {
        if (UPDATE && !problems.length) fs.writeFileSync(snapFile, JSON.stringify(result, null, 1) + '\n')
        else if (!fs.existsSync(snapFile)) problems.push('  no snapshot yet (run with --update, then review it)')
        else problems.push(...compare(result, JSON.parse(fs.readFileSync(snapFile, 'utf8'))))
      }
      const ok = problems.length === 0
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (${secs}s)${UPDATE && ok ? '  · snapshot saved' : ''}`)
      if (!ok) {
        console.log(problems.join('\n'))
        fs.mkdirSync(path.join(RESULTS, name), { recursive: true })
        fs.writeFileSync(path.join(RESULTS, name, 'log.txt'), log)
        if (result) fs.writeFileSync(path.join(RESULTS, name, 'actual.json'), JSON.stringify(result, null, 1) + '\n') // compare with tests/snapshots/<name>.json
      }
      outcomes.push({ name, ok })
    }
    await server.close()
  }
  const failed = outcomes.filter((o) => !o.ok)
  console.log(`\n${outcomes.length - failed.length} of ${outcomes.length} specs passed in ${((Date.now() - t0) / 60000).toFixed(1)} min${failed.length ? ` · failed: ${failed.map((f) => f.name).join(', ')}` : ''}`)
  process.exit(failed.length ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
